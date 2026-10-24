// Talks to the backend. In demo mode the same service code runs inside the browser instead.
const CFG = window.JOCHF_CONFIG || {};
const TOKEN_KEY = 'jochf-token';
const MODE_KEY = 'jochf-mode';

export const LIVE_URL = (CFG.API_URL || '').replace(/\/+$/, '');
export function getMode() {
  try { const m = sessionStorage.getItem(MODE_KEY); if (m) return m; } catch { }
  return LIVE_URL ? 'live' : 'demo';
}
export function setMode(m) { try { sessionStorage.setItem(MODE_KEY, m); } catch { } demoService = null; }
export const isDemo = () => getMode() === 'demo';

let token = null;
try { token = sessionStorage.getItem(TOKEN_KEY); } catch { }
export function setToken(t) { token = t; try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { } }
export const hasToken = () => !!token;

export class ApiError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }

let demoService = null, demoRepo = null;
async function demo() {
  if (demoService) return demoService;
  const [{ buildDemo }, { createMemRepo }, { createService }, { makeCipher }] = await Promise.all([
    import('./core/demo-seed.js'), import('./core/memrepo.js'), import('./core/service.js'), import('./core/crypto.js'),
  ]);
  const cipher = await makeCipher('jo-chf-demo-only');
  const seed = await buildDemo(undefined, cipher);
  demoRepo = createMemRepo(seed);
  demoService = createService({ repo: demoRepo, cipher, pwIterations: 20000 });
  return demoService;
}
export function resetDemo() { demoRepo?.reset(); try { localStorage.removeItem('jochf-demo-v1'); } catch { } demoService = null; }

const listeners = new Set();
export const onAuthLost = fn => listeners.add(fn);

export async function call(method, args = {}) {
  let res;
  try {
    if (isDemo()) {
      const svc = await demo();
      res = { data: await svc.call(method, JSON.parse(JSON.stringify(args)), token) };
    } else {
      if (!LIVE_URL) throw new ApiError('CONFIG', 'The live server address is not set in config.js.');
      let r;
      try {
        r = await fetch(`${LIVE_URL}/api/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(args) });
      } catch { throw new ApiError('NETWORK', 'No connection to the server. Check your internet. Your draft is kept on this device.'); }
      res = await r.json().catch(() => ({ error: { code: 'SERVER', message: 'The server sent an unexpected reply.' } }));
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e && e.code) res = { error: { code: e.code, message: e.message, details: e.details } };
    else { console.error(e); throw new ApiError('CLIENT', e.message || 'Unexpected error.'); }
  }
  if (res.error) {
    const err = new ApiError(res.error.code, res.error.message, res.error.details);
    if (err.code === 'AUTH') { setToken(null); listeners.forEach(f => f(err)); }
    throw err;
  }
  return res.data;
}
