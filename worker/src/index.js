// Jo-CHF backend: Cloudflare Worker. One endpoint, POST /api/<action>, JSON in and out.
// All the rules live in assets/js/core/service.js (shared with the website's demo mode).
import { createService, ApiError } from '../../assets/js/core/service.js';
import { makeCipher } from '../../assets/js/core/crypto.js';
import { createD1Repo } from './d1repo.js';

let cipherCache = null;

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && env.ALLOW_LOCALHOST === '1';
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || ''),
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const SECURITY = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
const json = (data, status, cors) => new Response(JSON.stringify(data), { status, headers: { ...SECURITY, ...cors } });

function mailer(env) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM) return null;
  return {
    async send({ to, name, subject, text, html }) {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME || 'Jo-CHF Registry' }, to: [{ email: to, name }], subject, textContent: text, ...(html ? { htmlContent: html } : {}) }),
      });
      if (!r.ok) console.log('mail failed', r.status);
    },
  };
}

// Simple per-address limit on sign-in attempts (on top of the per-account lock).
const hits = new Map();
function rateLimited(ip, key, max, windowMs) {
  const k = key + ':' + ip, t = Date.now();
  const arr = (hits.get(k) || []).filter(x => t - x < windowMs);
  arr.push(t); hits.set(k, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'jo-chf-api', time: new Date().toISOString() }, 200, cors);
    const m = /^\/api\/([a-zA-Z.]+)$/.exec(url.pathname);
    if (!m || req.method !== 'POST') return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404, cors);
    if (!env.PII_KEY || env.PII_KEY.length < 16) return json({ error: { code: 'CONFIG', message: 'The server is missing its encryption key (PII_KEY). See SETUP.md.' } }, 500, cors);

    const method = m[1];
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    if (['auth.login', 'auth.register', 'auth.forgot', 'auth.resendVerify', 'auth.verifyEmail', 'setup.createAdmin'].includes(method) && rateLimited(ip, method, 20, 10 * 60 * 1000))
      return json({ error: { code: 'RATE', message: 'Too many attempts from this network. Wait 10 minutes and try again.' } }, 429, cors);

    let args = {};
    try { args = await req.json(); } catch { }
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || null;
    if (!cipherCache || cipherCache.key !== env.PII_KEY) cipherCache = { key: env.PII_KEY, cipher: await makeCipher(env.PII_KEY) };
    const service = createService({
      repo: createD1Repo(env.DB), cipher: cipherCache.cipher, mailer: mailer(env), siteUrl: env.SITE_URL || '',
      pwIterations: parseInt(env.PBKDF2_ITERATIONS || '100000'),
    });
    try {
      const data = await service.call(method, args, token);
      return json({ data }, 200, cors);
    } catch (e) {
      if (e instanceof ApiError) {
        const status = { AUTH: 401, MUST_CHANGE: 403, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, LOCKED: 423 }[e.code] || 400;
        return json({ error: { code: e.code, message: e.message, details: e.details || null } }, status, cors);
      }
      console.log('error', method, e && e.stack || e);
      return json({ error: { code: 'SERVER', message: 'Something went wrong on the server. Your last change may not be saved. Try again in a moment.' } }, 500, cors);
    }
  },
};
