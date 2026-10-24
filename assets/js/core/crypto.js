// Web Crypto helpers. Work the same in the browser and in Cloudflare Workers.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const subtle = () => globalThis.crypto.subtle;

export function randomBytes(n) { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return a; }
export function randomToken(n = 32) { return hex(randomBytes(n)); }
export function uuid() { return globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : randomToken(16); }
export async function sha256hex(s) { return hex(await subtle().digest('SHA-256', enc.encode(s))); }

// Passwords: PBKDF2-SHA256, 100,000 iterations (the maximum Cloudflare Workers allow), random 16-byte salt.
export async function hashPassword(pw, iterations = 100000) {
  const salt = randomBytes(16);
  const key = await subtle().importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`;
}
export async function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('pbkdf2$')) return false;
  const [, it, s, h] = stored.split('$');
  const key = await subtle().importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(s), iterations: +it }, key, 256);
  const a = b64(bits); if (a.length !== h.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ h.charCodeAt(i);
  return diff === 0;
}

// Identifier encryption: AES-256-GCM with a key derived from the secret PII_KEY.
export async function makeCipher(secret) {
  const raw = await subtle().digest('SHA-256', enc.encode('jo-chf-pii:' + secret));
  const key = await subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const hkey = await subtle().importKey('raw', await subtle().digest('SHA-256', enc.encode('jo-chf-hmac:' + secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return {
    async encrypt(obj) {
      const iv = randomBytes(12);
      const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
      return 'v1:' + b64(iv) + ':' + b64(ct);
    },
    async decrypt(s) {
      if (!s) return null;
      const [, iv, ct] = s.split(':');
      const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
      return JSON.parse(dec.decode(pt));
    },
    async hmac(s) { return hex(await subtle().sign('HMAC', hkey, enc.encode(s))).slice(0, 40); },
  };
}

// TOTP (RFC 6238) for optional administrator two-step verification.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) { let bits = 0, val = 0, out = ''; for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function unbase32(s) { let bits = 0, val = 0; const out = []; for (const c of s.replace(/=+$/, '').toUpperCase()) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
export async function totp(secret, t = Date.now(), step = 30) {
  const counter = Math.floor(t / 1000 / step);
  const msg = new Uint8Array(8); let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const key = await subtle().importKey('raw', unbase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await subtle().sign('HMAC', key, msg));
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1e6;
  return String(code).padStart(6, '0');
}
export async function verifyTotp(secret, code, t = Date.now()) {
  for (const d of [-1, 0, 1]) if (await totp(secret, t + d * 30000) === String(code).trim()) return true;
  return false;
}
