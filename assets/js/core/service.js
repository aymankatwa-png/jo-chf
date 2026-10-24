// Jo-CHF service layer: every rule about who can see and change what.
// Runs inside the Cloudflare Worker (live) and inside the browser (demo mode) with the same code.
import * as L from './logic.js';
import { hashPassword, verifyPassword, randomToken, sha256hex, uuid, base32, randomBytes, verifyTotp } from './crypto.js';

export class ApiError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const err = (code, msg, details) => { throw new ApiError(code, msg, details); };

const IDLE_MS = 30 * 60 * 1000;          // automatic logout after 30 minutes without activity
const ABSOLUTE_MS = 12 * 60 * 60 * 1000; // and after 12 hours in any case
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;
const SERVER_FIELDS = ['complete', 'locked', 'death', 'withdrawal', 'ltfu', 'derived', 'version', 'centerId', 'id', 'createdAt', 'updatedAt', 'createdBy', 'deleted'];

export const DEFAULT_SETTINGS = {
  registryTarget: 1000,
  windowBase: 'enrollment',
  targets: L.DEFAULT_TARGETS,
  kccqText: {},
  kccqLicensed: false,
  emailReminders: false,
};

function validPassword(pw) { return typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw); }
function normUser(u) { return String(u || '').trim().toLowerCase(); }
function publicUser(u) { if (!u) return null; const { pwHash, totpSecret, failed, lockedUntil, resetHash, ...rest } = u; return { ...rest, totpEnabled: !!u.totpEnabled }; }
function flatten(o, prefix = '', out = {}) {
  if (o === null || o === undefined) return out;
  if (Array.isArray(o) || typeof o !== 'object') { out[prefix] = o; return out; }
  for (const k of Object.keys(o)) flatten(o[k], prefix ? prefix + '.' + k : k, out);
  return out;
}
function diff(a, b) {
  const fa = flatten(a), fb = flatten(b), out = [];
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    const x = JSON.stringify(fa[k] ?? null), y = JSON.stringify(fb[k] ?? null);
    if (x !== y) out.push({ field: k, old: fa[k] ?? null, new: fb[k] ?? null });
  }
  return out;
}
function strip(o, keys) { const c = { ...o }; for (const k of keys) delete c[k]; return c; }
function monthKey(s) { return s ? s.slice(0, 7) : null; }

export function createService({ repo, cipher, now = () => Date.now(), mailer = null, siteUrl = '', pwIterations = 100000 }) {
  const hashPw = pw => hashPassword(pw, pwIterations);
  const today = () => L.todayISO(now());
  let settingsCache = null;

  async function settings() {
    if (settingsCache) return settingsCache;
    const s = await repo.get('settings', 'main');
    settingsCache = { ...DEFAULT_SETTINGS, ...(s || {}) };
    return settingsCache;
  }

  async function audit(user, e) {
    await repo.audit({ ts: new Date(now()).toISOString(), userId: user?.id || null, userName: user?.name || 'system', ...e });
  }
  async function auditDiff(user, base, changes) {
    for (const c of changes.slice(0, 400)) await audit(user, { ...base, field: c.field, old: c.old, new: c.new });
  }

  // ---------- email ----------
  function mailHtml(title, paragraphs, button) {
    const e = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<!doctype html><html><body style="margin:0;background:#FBF6F5;font-family:Arial,Helvetica,sans-serif;color:#14182B">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF6F5;padding:32px 12px"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #EAE1DF;border-radius:16px">
      <tr><td style="padding:26px 28px 6px"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">Jo<span style="color:#D42A3C">-</span>CHF</div>
      <div style="font-size:12px;color:#80859B">Jordan Contemporary Heart Failure Registry</div></td></tr>
      <tr><td style="padding:14px 28px 4px"><h1 style="font-size:20px;margin:0 0 12px">${e(title)}</h1>
      ${paragraphs.map(p => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px;color:#474D66">${e(p)}</p>`).join('')}
      ${button ? `<p style="margin:20px 0 8px"><a href="${e(button.url)}" style="display:inline-block;background:#14182B;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${e(button.label)}</a></p><p style="font-size:12px;color:#80859B;word-break:break-all">${e(button.url)}</p>` : ''}
      </td></tr><tr><td style="padding:12px 28px 24px;font-size:12px;color:#80859B">You receive this email because of an account on the Jo-CHF registry.</td></tr></table></td></tr></table></body></html>`;
  }
  async function sendMail(to, name, subject, title, paragraphs, button) {
    if (!mailer || !to) return false;
    try { await mailer.send({ to, name, subject, text: [title, '', ...paragraphs, button ? '\n' + button.label + ': ' + button.url : ''].join('\n'), html: mailHtml(title, paragraphs, button) }); return true; }
    catch { return false; }
  }
  async function sendVerify(u) {
    if (!mailer || !u.email) return false;
    const token = randomToken(24);
    await repo.put('verify', { id: await sha256hex(token), userId: u.id, expires: now() + 48 * 3600000 });
    return sendMail(u.email, u.name, 'Confirm your email for Jo-CHF', 'Confirm your email address',
      [`Hello ${u.name},`, 'Please confirm that this email address belongs to you. The link works for 48 hours.'],
      { label: 'Confirm my email', url: `${siteUrl}#/verify/${token}` });
  }

  // ---------- sessions ----------
  async function session(token) {
    if (!token) err('AUTH', 'Please sign in.');
    const id = await sha256hex(token);
    const s = await repo.get('sessions', id);
    const t = now();
    if (!s || t - s.lastSeen > IDLE_MS || t - s.createdAt > ABSOLUTE_MS) { if (s) await repo.del('sessions', id); err('AUTH', 'Your session has ended. Please sign in again.'); }
    const user = await repo.get('users', s.userId);
    if (!user || user.status !== 'active') { await repo.del('sessions', id); err('AUTH', 'Your account is not active.'); }
    if (t - s.lastSeen > 60000) { s.lastSeen = t; await repo.put('sessions', s); }
    return { user, sid: id };
  }
  const isAdmin = u => u.role === 'admin';
  function assertCenter(u, centerId) { if (!isAdmin(u) && u.centerId !== centerId) err('FORBIDDEN', 'You can only open records from your own center.'); }
  function assertAdmin(u) { if (!isAdmin(u)) err('FORBIDDEN', 'Only administrators can do this.'); }

  async function loadPatient(u, id, { forWrite = false } = {}) {
    const p = await repo.get('patients', id);
    if (!p || p.deleted) err('NOT_FOUND', 'Patient not found.');
    assertCenter(u, p.centerId);
    if (forWrite && p.locked) err('LOCKED', 'This record is locked by an administrator. Ask an administrator to unlock it.');
    return p;
  }
  async function patientBundle(pid) {
    const [visits, events, titrations] = await Promise.all([repo.list('visits', { patientId: pid }), repo.list('events', { patientId: pid }), repo.list('titrations', { patientId: pid })]);
    return { visits, events, titrations };
  }
  async function refreshDerived(p) {
    const s = await settings();
    p.derived = L.computeDerived(p, await patientBundle(p.id), s, today());
    return p;
  }

  // ---------- public ----------
  const api = {};

  api['meta.info'] = async () => {
    const users = await repo.list('users');
    const centers = (await repo.list('centers')).filter(c => c.active !== false).map(c => ({ id: c.id, code: c.code, name: c.name }));
    return { needsSetup: !users.some(u => u.role === 'admin'), centers, mail: !!mailer };
  };

  api['setup.createAdmin'] = async (_, { name, username, password, email }) => {
    const users = await repo.list('users');
    if (users.some(u => u.role === 'admin')) err('FORBIDDEN', 'The system is already set up.');
    if (!name || !username) err('INVALID', 'Name and username are required.');
    if (!validPassword(password)) err('INVALID', 'Password must be at least 8 characters with letters and numbers.');
    const u = { id: uuid(), username: normUser(username), name, email: email || (username.includes('@') ? username : ''), role: 'admin', centerId: null, status: 'active', pwHash: await hashPw(password), createdAt: new Date(now()).toISOString() };
    await repo.put('users', u);
    await audit(u, { action: 'setup', table: 'users', recordId: u.id, field: 'account', new: 'first administrator created' });
    if (mailer && u.email) { u.emailVerified = false; await repo.put('users', u); await sendVerify(u); }
    return { ok: true, mail: !!mailer };
  };

  api['auth.login'] = async (_, { username, password, code }) => {
    const un = normUser(username);
    const users = await repo.list('users');
    const u = users.find(x => x.username === un || (x.email && normUser(x.email) === un));
    const t = now();
    if (!u) { await hashPassword('timing-equaliser', 1000); err('LOGIN', 'Wrong username or password.'); }
    if (u.lockedUntil && u.lockedUntil > t) err('LOCKED_OUT', `Too many failed attempts. Try again in ${Math.ceil((u.lockedUntil - t) / 60000)} minutes.`);
    const ok = await verifyPassword(password || '', u.pwHash);
    if (!ok) {
      u.failed = (u.failed || 0) + 1;
      if (u.failed >= MAX_FAILS) { u.lockedUntil = t + LOCK_MS; u.failed = 0; await audit(u, { action: 'lockout', table: 'users', recordId: u.id, field: 'login', new: 'locked 15 minutes after 5 failed attempts' }); }
      await repo.put('users', u);
      err('LOGIN', u.lockedUntil > t ? 'Too many failed attempts. Your account is locked for 15 minutes.' : `Wrong username or password. ${MAX_FAILS - u.failed} attempts left before a temporary lock.`);
    }
    if (u.status === 'pending') err('PENDING', 'Your registration is waiting for administrator approval.');
    if (u.status !== 'active') err('INACTIVE', 'This account has been deactivated. Contact the study administrators.');
    if (u.totpEnabled) {
      if (!code) return { need2fa: true };
      if (!(await verifyTotp(u.totpSecret, code, t))) err('LOGIN', 'The verification code is not correct.');
    }
    u.failed = 0; u.lockedUntil = null; u.lastLogin = new Date(t).toISOString();
    await repo.put('users', u);
    const token = randomToken();
    await repo.put('sessions', { id: await sha256hex(token), userId: u.id, createdAt: t, lastSeen: t });
    await audit(u, { action: 'login', table: 'users', recordId: u.id, field: 'session', new: 'signed in' });
    return { token, user: publicUser(u) };
  };

  api['auth.register'] = async (_, r) => {
    const un = normUser(r.username || r.email);
    if (!r.name || !un) err('INVALID', 'Full name and username (email or ID) are required.');
    if (!r.centerId && r.role !== 'admin') err('INVALID', 'Choose your center.');
    if (!validPassword(r.password)) err('INVALID', 'Password must be at least 8 characters with letters and numbers.');
    const users = await repo.list('users');
    if (users.some(x => x.username === un)) err('EXISTS', 'This username is already registered.');
    const u = { id: uuid(), username: un, name: r.name.trim(), email: r.email || (un.includes('@') ? un : ''), phone: r.phone || '', centerId: r.centerId || null, requestedRole: r.role === 'admin' ? 'admin' : 'site', role: 'site', professionalId: r.professionalId || '', status: 'pending', pwHash: await hashPw(r.password), createdAt: new Date(now()).toISOString() };
    await repo.put('users', u);
    await audit(null, { action: 'register', table: 'users', recordId: u.id, field: 'account', new: `registration request: ${u.name}` });
    let emailSent = false;
    if (mailer && u.email) { u.emailVerified = false; await repo.put('users', u); emailSent = await sendVerify(u); }
    if (mailer) {
      const center = u.centerId ? await repo.get('centers', u.centerId) : null;
      for (const a of users.filter(x => x.role === 'admin' && x.status === 'active' && x.email))
        await sendMail(a.email, a.name, `Jo-CHF: new account request from ${u.name}`, 'New account request',
          [`${u.name} asked for a ${u.requestedRole === 'admin' ? 'administrator' : 'site investigator'} account${center ? ` at ${center.code} · ${center.name}` : ''}.`, `Username: ${u.username}${u.professionalId ? ` · Professional ID: ${u.professionalId}` : ''}`, 'Open the Users page to approve or decline.'],
          { label: 'Open Users', url: `${siteUrl}#/admin/users` });
    }
    return { ok: true, emailSent };
  };

  api['auth.forgot'] = async (_, { username }) => {
    if (!mailer) return { mode: 'admin' };
    const un = normUser(username);
    const u = (await repo.list('users')).find(x => x.username === un || normUser(x.email) === un);
    if (u && u.email && u.status === 'active') {
      const token = randomToken(24);
      await repo.put('resets', { id: await sha256hex(token), userId: u.id, expires: now() + 3600000 });
      await mailer.send({ to: u.email, name: u.name, subject: 'Jo-CHF password reset', text: `Hello ${u.name},\n\nUse this link within 1 hour to set a new password:\n${siteUrl}#/reset/${token}\n\nIf you did not ask for this, ignore this email.` });
    }
    return { mode: 'email' };
  };
  api['auth.verifyEmail'] = async (_, { token }) => {
    const v = await repo.get('verify', await sha256hex(token || ''));
    if (!v || v.expires < now()) err('INVALID', 'This confirmation link has expired or was already used. Ask for a new one from your account page or from an administrator.');
    const u = await repo.get('users', v.userId);
    if (!u) err('INVALID', 'Account not found.');
    u.emailVerified = true; u.emailVerifiedAt = new Date(now()).toISOString();
    await repo.put('users', u); await repo.del('verify', v.id);
    await audit(u, { action: 'email', table: 'users', recordId: u.id, field: 'email', new: 'email address confirmed' });
    return { ok: true, status: u.status };
  };
  api['auth.resendVerify'] = async (_, { username }) => {
    if (!mailer) return { ok: false };
    const un = normUser(username);
    const u = (await repo.list('users')).find(x => x.username === un || normUser(x.email) === un);
    if (u && u.email && !u.emailVerified && u.status !== 'inactive') await sendVerify(u);
    return { ok: true };
  };
  api['auth.reset'] = async (_, { token, password }) => {
    const r = await repo.get('resets', await sha256hex(token || ''));
    if (!r || r.expires < now()) err('INVALID', 'This reset link has expired. Ask for a new one.');
    if (!validPassword(password)) err('INVALID', 'Password must be at least 8 characters with letters and numbers.');
    const u = await repo.get('users', r.userId);
    u.pwHash = await hashPw(password); u.mustChange = false; u.failed = 0; u.lockedUntil = null;
    await repo.put('users', u); await repo.del('resets', r.id);
    await audit(u, { action: 'password', table: 'users', recordId: u.id, field: 'password', new: 'reset by email link' });
    return { ok: true };
  };

  // ---------- signed-in ----------
  const authed = {};
  authed['auth.me'] = async ({ user }) => ({ user: publicUser(user), settings: await settings(), center: user.centerId ? await repo.get('centers', user.centerId) : null });
  authed['auth.logout'] = async ({ sid, user }) => { await repo.del('sessions', sid); await audit(user, { action: 'logout', table: 'users', recordId: user.id, field: 'session', new: 'signed out' }); return { ok: true }; };
  authed['auth.changePassword'] = async ({ user }, { current, password }) => {
    if (!(await verifyPassword(current || '', user.pwHash))) err('INVALID', 'Your current password is not correct.');
    if (!validPassword(password)) err('INVALID', 'Password must be at least 8 characters with letters and numbers.');
    user.pwHash = await hashPw(password); user.mustChange = false;
    await repo.put('users', user);
    await audit(user, { action: 'password', table: 'users', recordId: user.id, field: 'password', new: 'changed by user' });
    return { ok: true };
  };
  authed['auth.sendVerify'] = async ({ user }) => {
    if (!mailer) err('INVALID', 'Email is not set up for this registry yet.');
    if (!user.email) err('INVALID', 'Your account has no email address. Ask an administrator to add it.');
    if (user.emailVerified) return { ok: true, already: true };
    await sendVerify(user);
    return { ok: true };
  };
  authed['auth.totpSetup'] = async ({ user }) => {
    const secret = base32(randomBytes(20));
    user.totpPending = secret; await repo.put('users', user);
    return { secret, uri: `otpauth://totp/Jo-CHF:${encodeURIComponent(user.username)}?secret=${secret}&issuer=Jo-CHF` };
  };
  authed['auth.totpEnable'] = async ({ user }, { code }) => {
    if (!user.totpPending || !(await verifyTotp(user.totpPending, code, now()))) err('INVALID', 'The code is not correct. Check the time on your phone and try again.');
    user.totpSecret = user.totpPending; user.totpEnabled = true; delete user.totpPending;
    await repo.put('users', user);
    await audit(user, { action: '2fa', table: 'users', recordId: user.id, field: 'two-step', new: 'enabled' });
    return { ok: true };
  };
  authed['auth.totpDisable'] = async ({ user }, { password }) => {
    if (!(await verifyPassword(password || '', user.pwHash))) err('INVALID', 'Password is not correct.');
    user.totpEnabled = false; delete user.totpSecret; await repo.put('users', user);
    await audit(user, { action: '2fa', table: 'users', recordId: user.id, field: 'two-step', new: 'disabled' });
    return { ok: true };
  };

  // ---------- main dashboard: one card per center ----------
  authed['dash.summary'] = async ({ user }) => {
    const s = await settings();
    const [centers, patients, visits] = await Promise.all([repo.list('centers'), repo.list('patients'), repo.list('visits')]);
    const live = patients.filter(p => !p.deleted);
    const vByP = new Map(); for (const v of visits) { if (!vByP.has(v.patientId)) vByP.set(v.patientId, []); vByP.get(v.patientId).push(v); }
    const t = today();
    const months = []; { const d = L.parseISO(t); for (let i = 11; i >= 0; i--) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); months.push(x.toISOString().slice(0, 7)); } }
    function stats(list) {
      const fu = { d30: { due: 0, done: 0 }, m6: { due: 0, done: 0 }, m12: { due: 0, done: 0 } };
      let overdue = 0, openNow = 0, compSum = 0;
      const trend = months.map(m => list.filter(p => monthKey(p.enrollment?.enrollmentDate) === m).length);
      for (const p of list) {
        compSum += p.derived?.completeness ?? L.completeness(p).pct;
        for (const v of L.visitSchedule(p, vByP.get(p.id), s, t)) {
          if (['done', 'missed', 'ltfu'].includes(v.status)) { fu[v.key].due++; if (v.status === 'done') fu[v.key].done++; }
          if (v.status === 'missed') overdue++;
          if (v.status === 'open') openNow++;
        }
      }
      const pct = x => x.due ? Math.round(100 * x.done / x.due) : null;
      return {
        enrolled: list.length, trend, months,
        followup: { d30: pct(fu.d30), m6: pct(fu.m6), m12: pct(fu.m12), raw: fu }, overdue, openNow,
        completeness: list.length ? Math.round(compSum / list.length) : null,
        deceased: list.filter(p => p.death?.date).length,
        phenotype: { HFrEF: list.filter(p => p.derived?.phenotype === 'HFrEF').length, HFpEF: list.filter(p => p.derived?.phenotype === 'HFpEF').length },
      };
    }
    const cards = centers.filter(c => c.active !== false).sort((a, b) => a.code.localeCompare(b.code)).map(c => ({
      id: c.id, code: c.code, name: c.name, city: c.city, target: c.target || 0, canOpen: isAdmin(user) || user.centerId === c.id,
      ...stats(live.filter(p => p.centerId === c.id)),
    }));
    return { total: { target: s.registryTarget, ...stats(live) }, cards, myCenter: user.centerId };
  };

  // ---------- center page ----------
  authed['center.page'] = async ({ user }, { centerId }) => {
    assertCenter(user, centerId);
    const s = await settings();
    const center = await repo.get('centers', centerId);
    if (!center) err('NOT_FOUND', 'Center not found.');
    const [patients, visits, queries, idents] = await Promise.all([
      repo.list('patients', { centerId }), repo.list('visits', { centerId }), repo.list('queries', { centerId }),
      isAdmin(user) ? Promise.resolve([]) : repo.list('ident', { centerId }),
    ]);
    const identMap = new Map();
    for (const i of idents) { try { identMap.set(i.id, await cipher.decrypt(i.enc)); } catch { } }
    const vByP = new Map(); for (const v of visits) { if (!vByP.has(v.patientId)) vByP.set(v.patientId, []); vByP.get(v.patientId).push(v); }
    const t = today();
    const rows = [], due = [];
    for (const p of patients.filter(x => !x.deleted)) {
      const sched = L.visitSchedule(p, vByP.get(p.id), s, t);
      const nd = L.nextDue(sched);
      const idn = identMap.get(p.id);
      rows.push({
        id: p.id, name: idn?.name || '', fileNo: idn?.fileNo || '', enrollmentDate: p.enrollment?.enrollmentDate, setting: p.clinical?.setting,
        phenotype: p.derived?.phenotype, lvef: p.echo?.lvef, fmtCount: p.derived?.fmtCount ?? 0, nextDue: nd ? { key: nd.key, label: nd.label, due: nd.due, status: nd.status } : null,
        status: L.recordStatus(p), completeness: p.derived?.completeness ?? 0, openQueries: queries.filter(q => q.patientId === p.id && q.status === 'open').length,
        age: p.derived?.age, sex: p.demographics?.sex, nyha: p.clinical?.nyha,
      });
      for (const v of sched) if (['soon', 'open', 'missed'].includes(v.status) && !p.death && !p.withdrawal)
        due.push({ patientId: p.id, name: idn?.name || '', phone: idn?.phone || '', visit: v.key, label: v.label, open: v.open, close: v.close, due: v.due, status: v.status, attempts: v.attempts, method: v.method });
    }
    due.sort((a, b) => ({ missed: 0, open: 1, soon: 2 }[a.status] - { missed: 0, open: 1, soon: 2 }[b.status]) || (a.close < b.close ? -1 : 1));
    rows.sort((a, b) => (a.id < b.id ? 1 : -1));
    return { center, patients: rows, due, queries: queries.filter(q => q.status !== 'closed').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), showIdentifiers: !isAdmin(user) };
  };

  // ---------- patient ----------
  authed['patient.get'] = async ({ user }, { id }) => {
    const p = await loadPatient(user, id);
    const b = await patientBundle(id);
    const queries = await repo.list('queries', { patientId: id });
    let ident = null;
    if (!isAdmin(user)) { const i = await repo.get('ident', id); if (i) { try { ident = await cipher.decrypt(i.enc); } catch { ident = null; } } }
    const s = await settings();
    return { patient: p, ...b, queries, ident, schedule: L.visitSchedule(p, b.visits, s, today()) };
  };

  async function identHashes(centerId, ident) {
    const h = [];
    const nid = String(ident?.nationalId || '').replace(/\D/g, '');
    const file = String(ident?.fileNo || '').trim().toUpperCase();
    if (nid) h.push(await cipher.hmac('nid:' + nid));
    if (file) h.push(await cipher.hmac('file:' + centerId + ':' + file));
    return h;
  }
  async function findDuplicate(centerId, ident, exceptId) {
    const hs = await identHashes(centerId, ident);
    if (!hs.length) return false;
    const all = await repo.list('ident');
    return all.some(i => i.id !== exceptId && (i.hashes || []).some(x => hs.includes(x)));
  }
  authed['patient.checkDuplicate'] = async ({ user }, { centerId, ident, exceptId }) => {
    assertCenter(user, centerId);
    return { duplicate: await findDuplicate(centerId, ident, exceptId) };
  };

  function validate(p) {
    const issues = [...L.rangeIssues(p), ...L.dateIssues(p, today())];
    const errors = issues.filter(i => i.level === 'error');
    if (errors.length) err('VALIDATION', errors[0].msg, { issues: errors });
    return issues.filter(i => i.level === 'warn');
  }

  authed['patient.create'] = async ({ user }, { centerId, data, ident, force }) => {
    if (isAdmin(user)) err('FORBIDDEN', 'Patients are added by the site team of each center.');
    assertCenter(user, centerId);
    const center = await repo.get('centers', centerId);
    if (!center || center.active === false) err('NOT_FOUND', 'Center not found.');
    const elig = L.eligibility(data.enrollment);
    if (!elig.consent) err('CONSENT', 'Enrollment is blocked: enter the date of written informed consent.');
    if (elig.hitExc.length) err('EXCLUDED', `Enrollment stopped: ${elig.hitExc[0].label}.`);
    if (elig.failedInc.length) err('NOT_ELIGIBLE', `Inclusion criterion not met: ${elig.failedInc[0].label}.`);
    if (!force && await findDuplicate(centerId, ident, null)) return { duplicate: true };
    const clean = strip(data, SERVER_FIELDS);
    const warnings = validate(clean);
    center.nextSeq = (center.nextSeq || 0) + 1;
    const id = `${center.code}-${String(center.nextSeq).padStart(4, '0')}`;
    await repo.put('centers', center);
    const p = { ...clean, id, centerId, version: 1, complete: false, locked: false, createdAt: new Date(now()).toISOString(), createdBy: user.id };
    p.enrollment = { ...(p.enrollment || {}), investigator: user.name };
    await refreshDerived(p);
    await repo.put('patients', p);
    await repo.put('ident', { id, centerId, enc: await cipher.encrypt(ident || {}), hashes: await identHashes(centerId, ident) });
    await audit(user, { action: 'create', table: 'patients', recordId: id, patientId: id, centerId, field: 'record', new: 'patient enrolled' });
    return { id, warnings };
  };

  authed['patient.save'] = async ({ user }, { id, data, ident, version, reason }) => {
    const p = await loadPatient(user, id, { forWrite: true });
    if (isAdmin(user) && ident) err('FORBIDDEN', 'Administrators cannot see or change patient identifiers.');
    if (version && p.version && version !== p.version) err('CONFLICT', 'Someone else saved this record after you opened it. Reload the page to see the latest version.');
    const clean = strip(data, SERVER_FIELDS);
    const next = { ...p, ...clean };
    if (clean.enrollment) next.enrollment = { ...clean.enrollment, investigator: p.enrollment?.investigator };
    const changes = diff(strip(p, SERVER_FIELDS), strip(next, SERVER_FIELDS));
    let identChanged = false;
    if (ident && !isAdmin(user)) {
      const cur = await repo.get('ident', id);
      const old = cur ? await cipher.decrypt(cur.enc) : {};
      identChanged = JSON.stringify(old) !== JSON.stringify(ident);
    }
    if (!changes.length && !identChanged) return { ok: true, version: p.version, unchanged: true };
    if (p.complete && !reason) err('REASON_REQUIRED', 'This record is marked complete. Please give a reason for the change.');
    const warnings = validate(next);
    if (p.complete) {
      const blockers = L.completionBlockers(next, (await settings()).targets, today());
      if (blockers.length) next.complete = false;
    }
    next.version = (p.version || 1) + 1;
    next.updatedAt = new Date(now()).toISOString();
    await refreshDerived(next);
    await repo.put('patients', next);
    if (identChanged) {
      await repo.put('ident', { id, centerId: p.centerId, enc: await cipher.encrypt(ident), hashes: await identHashes(p.centerId, ident) });
      await audit(user, { action: 'update', table: 'ident', recordId: id, patientId: id, centerId: p.centerId, field: 'identifiers', old: '(encrypted)', new: '(encrypted)', reason: reason || null });
    }
    await auditDiff(user, { action: 'update', table: 'patients', recordId: id, patientId: id, centerId: p.centerId, reason: reason || null }, changes);
    return { ok: true, version: next.version, warnings, complete: next.complete };
  };

  authed['patient.complete'] = async ({ user }, { id }) => {
    const p = await loadPatient(user, id, { forWrite: true });
    const blockers = L.completionBlockers(p, (await settings()).targets, today());
    if (blockers.length) err('INCOMPLETE', `${blockers.length} item(s) must be fixed before the record can be marked complete.`, { blockers });
    p.complete = true; p.version = (p.version || 1) + 1; p.completedAt = new Date(now()).toISOString();
    await refreshDerived(p); await repo.put('patients', p);
    await audit(user, { action: 'complete', table: 'patients', recordId: id, patientId: id, centerId: p.centerId, field: 'status', old: 'incomplete', new: 'complete' });
    return { ok: true };
  };

  authed['patient.lock'] = async ({ user }, { id, locked }) => {
    assertAdmin(user);
    const p = await loadPatient(user, id);
    p.locked = !!locked; p.version = (p.version || 1) + 1;
    await refreshDerived(p); await repo.put('patients', p);
    await audit(user, { action: locked ? 'lock' : 'unlock', table: 'patients', recordId: id, patientId: id, centerId: p.centerId, field: 'locked', old: !locked, new: !!locked });
    return { ok: true };
  };

  authed['patient.delete'] = async ({ user }, { id, reason }) => {
    assertAdmin(user);
    if (!reason) err('REASON_REQUIRED', 'Give a reason for deleting this record.');
    const p = await loadPatient(user, id);
    p.deleted = true; p.deletedAt = new Date(now()).toISOString();
    await repo.put('patients', p);
    await repo.del('ident', id);
    for (const q of await repo.list('queries', { patientId: id })) if (q.kind === 'delete' && q.status === 'open') { q.status = 'closed'; q.resolution = 'deleted'; await repo.put('queries', q); }
    await audit(user, { action: 'delete', table: 'patients', recordId: id, patientId: id, centerId: p.centerId, field: 'record', old: 'active', new: 'deleted', reason });
    return { ok: true };
  };

  authed['patient.move'] = async ({ user }, { id, centerId, reason }) => {
    assertAdmin(user);
    if (!reason) err('REASON_REQUIRED', 'Give a reason for moving this patient.');
    const p = await loadPatient(user, id);
    const old = p.centerId; p.centerId = centerId; p.version++;
    await repo.put('patients', p);
    for (const t of ['visits', 'events', 'titrations', 'queries']) for (const x of await repo.list(t, { patientId: id })) { x.centerId = centerId; await repo.put(t, x); }
    const i = await repo.get('ident', id); if (i) { i.centerId = centerId; await repo.put('ident', i); }
    await audit(user, { action: 'move', table: 'patients', recordId: id, patientId: id, centerId, field: 'centerId', old, new: centerId, reason });
    return { ok: true };
  };

  // ---------- follow-up visits ----------
  authed['visit.save'] = async ({ user }, { patientId, visit, reason }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    if (!L.VISITS.some(v => v.key === visit.visit)) err('INVALID', 'Unknown visit.');
    const existing = (await repo.list('visits', { patientId })).find(v => v.visit === visit.visit);
    const v = { ...(existing || {}), ...strip(visit, ['id', 'patientId', 'centerId']), id: existing?.id || `${patientId}:${visit.visit}`, patientId, centerId: p.centerId };
    if (v.status === 'done') {
      if (!v.date) err('INVALID', 'Enter the date of contact.');
      if (v.date > today()) err('VALIDATION', 'The visit date is in the future.');
      if (v.date < p.enrollment?.enrollmentDate) err('VALIDATION', 'The follow-up date is before the enrollment date.');
      const ri = L.rangeIssues(v, L.VISIT_RANGE_RULES).filter(i => i.level === 'error');
      if (ri.length) err('VALIDATION', ri[0].msg);
      if (v.vital === 'alive' && v.meds) {
        const need = L.gdmtNeedsReason(v.meds, (await settings()).targets, v.weight || p.demographics?.weight);
        const miss = need.filter(g => !(v.reasons?.[g]?.length));
        if (miss.length) err('REASON_REQUIRED', `Choose a reason for: ${miss.map(g => L.SHORT_LABEL[g]).join(', ')}.`, { groups: miss });
      }
      if (v.kccq) v.kccqScores = L.kccqScores(v.kccq);
      if (v.labs?.creat) v.labs.egfr = L.egfrCKDEPI2021(v.labs.creat, L.ageAt(p.demographics?.dob, v.date), p.demographics?.sex);
    }
    if (existing && existing.status === 'done' && p.complete && !reason) err('REASON_REQUIRED', 'Give a reason for changing a completed visit.');
    v.updatedAt = new Date(now()).toISOString(); v.updatedBy = user.name;
    await repo.put('visits', v);
    await auditDiff(user, { action: existing ? 'update' : 'create', table: 'visits', recordId: v.id, patientId, centerId: p.centerId, reason: reason || null }, diff(existing || {}, v).filter(c => !['updatedAt', 'updatedBy'].includes(c.field)));
    await refreshDerived(p); await repo.put('patients', p);
    return { ok: true, id: v.id };
  };

  authed['visit.attempt'] = async ({ user }, { patientId, visitKey, attempt }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    const id = `${patientId}:${visitKey}`;
    const v = (await repo.get('visits', id)) || { id, patientId, centerId: p.centerId, visit: visitKey, status: 'pending', attempts: [] };
    v.attempts = [...(v.attempts || []), { ...attempt, by: user.name, at: new Date(now()).toISOString() }];
    await repo.put('visits', v);
    await audit(user, { action: 'contact', table: 'visits', recordId: id, patientId, centerId: p.centerId, field: 'attempts', new: `${attempt.date} ${attempt.time || ''} ${attempt.outcome}` });
    const days = new Set(v.attempts.filter(a => a.outcome !== 'reached').map(a => a.date));
    return { ok: true, attempts: v.attempts, canMarkLost: days.size >= 3 };
  };

  authed['visit.markLost'] = async ({ user }, { patientId, visitKey }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    const id = `${patientId}:${visitKey}`;
    const v = await repo.get('visits', id);
    const days = new Set((v?.attempts || []).filter(a => a.outcome !== 'reached').map(a => a.date));
    if (days.size < 3) err('INVALID', 'Three unsuccessful contact attempts on different days are needed first.');
    v.status = 'ltfu'; await repo.put('visits', v);
    await audit(user, { action: 'ltfu', table: 'visits', recordId: id, patientId, centerId: p.centerId, field: 'status', old: 'pending', new: 'lost to follow-up for this visit' });
    await refreshDerived(p); await repo.put('patients', p);
    return { ok: true };
  };

  // ---------- events ----------
  authed['event.save'] = async ({ user }, { patientId, event }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    if (!event.admitDate) err('INVALID', 'Enter the admission or visit date.');
    if (event.admitDate > today()) err('VALIDATION', 'The event date is in the future.');
    if (event.dischargeDate && event.dischargeDate < event.admitDate) err('VALIDATION', 'Discharge date is before admission date.');
    const existing = event.id ? await repo.get('events', event.id) : null;
    const e = { ...(existing || {}), ...event, id: existing?.id || uuid(), patientId, centerId: p.centerId };
    e.isHFH = L.isHFHospitalization(e);
    await repo.put('events', e);
    await auditDiff(user, { action: existing ? 'update' : 'create', table: 'events', recordId: e.id, patientId, centerId: p.centerId }, diff(existing || {}, e));
    await refreshDerived(p); await repo.put('patients', p);
    return { ok: true, id: e.id, isHFH: e.isHFH };
  };
  authed['event.delete'] = async ({ user }, { patientId, id, reason }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    if (!reason) err('REASON_REQUIRED', 'Give a reason for removing this event.');
    const e = await repo.get('events', id); if (!e || e.patientId !== patientId) err('NOT_FOUND', 'Event not found.');
    await repo.del('events', id);
    await audit(user, { action: 'delete', table: 'events', recordId: id, patientId, centerId: p.centerId, field: 'event', old: `${e.admitDate} ${e.reason || e.type}`, new: null, reason });
    await refreshDerived(p); await repo.put('patients', p);
    return { ok: true };
  };

  // ---------- titration log ----------
  authed['titration.save'] = async ({ user }, { patientId, entry }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    if (!entry.date || !entry.drug || !entry.change) err('INVALID', 'Date, drug and type of change are required.');
    if (entry.date > today()) err('VALIDATION', 'The date is in the future.');
    const existing = entry.id ? await repo.get('titrations', entry.id) : null;
    const t = { ...(existing || {}), ...entry, id: existing?.id || uuid(), patientId, centerId: p.centerId, by: user.name };
    await repo.put('titrations', t);
    await auditDiff(user, { action: existing ? 'update' : 'create', table: 'titrations', recordId: t.id, patientId, centerId: p.centerId }, diff(existing || {}, t));
    await refreshDerived(p); await repo.put('patients', p);
    return { ok: true, id: t.id };
  };
  authed['titration.delete'] = async ({ user }, { patientId, id, reason }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    const t = await repo.get('titrations', id); if (!t || t.patientId !== patientId) err('NOT_FOUND', 'Entry not found.');
    await repo.del('titrations', id);
    await audit(user, { action: 'delete', table: 'titrations', recordId: id, patientId, centerId: p.centerId, field: 'titration', old: `${t.date} ${t.drug} ${t.change}`, reason: reason || null });
    await refreshDerived(p); await repo.put('patients', p);
    return { ok: true };
  };

  // ---------- death, withdrawal ----------
  authed['death.save'] = async ({ user }, { patientId, death, reason }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    if (!death?.date || !death.cause) err('INVALID', 'Date and cause of death are required.');
    if (death.date > today()) err('VALIDATION', 'Date of death is in the future.');
    if (death.date < p.enrollment?.enrollmentDate) err('VALIDATION', 'Date of death is before enrollment.');
    const lastVisit = (await repo.list('visits', { patientId })).filter(v => v.status === 'done' && v.vital === 'alive').map(v => v.date).sort().pop();
    if (lastVisit && death.date < lastVisit) err('VALIDATION', `Date of death is before the last visit where the patient was alive (${L.fmtDate(lastVisit)}).`);
    if (p.death && !reason) err('REASON_REQUIRED', 'Give a reason for changing the death record.');
    const old = p.death || null;
    p.death = { ...(p.death || {}), ...strip(death, ['adjudicated']), investigatorCause: death.cause, recordedBy: user.name };
    p.version++; await refreshDerived(p); await repo.put('patients', p);
    await auditDiff(user, { action: old ? 'update' : 'create', table: 'death', recordId: patientId, patientId, centerId: p.centerId, reason: reason || null }, diff(old || {}, p.death));
    return { ok: true };
  };
  authed['death.adjudicate'] = async ({ user }, { patientId, cause, note }) => {
    assertAdmin(user);
    const p = await loadPatient(user, patientId);
    if (!p.death) err('INVALID', 'No death is recorded for this patient.');
    const old = p.death.adjudicated?.cause || null;
    p.death.adjudicated = { cause, note: note || '', by: user.name, at: new Date(now()).toISOString() };
    p.version++; await repo.put('patients', p);
    await audit(user, { action: 'adjudicate', table: 'death', recordId: patientId, patientId, centerId: p.centerId, field: 'death.adjudicated.cause', old, new: cause, reason: note || null });
    return { ok: true };
  };
  authed['withdraw.save'] = async ({ user }, { patientId, withdrawal }) => {
    const p = await loadPatient(user, patientId, { forWrite: true });
    if (!withdrawal?.date) err('INVALID', 'Enter the date consent was withdrawn.');
    p.withdrawal = { ...withdrawal, recordedBy: user.name };
    p.version++; await refreshDerived(p); await repo.put('patients', p);
    await audit(user, { action: 'withdraw', table: 'patients', recordId: patientId, patientId, centerId: p.centerId, field: 'withdrawal', new: `${withdrawal.date} · keep data: ${withdrawal.keepData ? 'yes' : 'no'}` });
    return { ok: true };
  };

  // ---------- data queries and deletion requests ----------
  authed['query.create'] = async ({ user }, { patientId, field, message, kind }) => {
    const p = await loadPatient(user, patientId);
    if (kind === 'delete') { if (isAdmin(user)) err('INVALID', 'Administrators delete directly.'); }
    else assertAdmin(user);
    if (!message) err('INVALID', 'Write a message.');
    const q = { id: uuid(), patientId, centerId: p.centerId, field: field || null, message, kind: kind || 'query', status: 'open', createdAt: new Date(now()).toISOString(), createdBy: user.name, thread: [] };
    await repo.put('queries', q);
    await audit(user, { action: kind === 'delete' ? 'delete-request' : 'query', table: 'queries', recordId: q.id, patientId, centerId: p.centerId, field: field || 'record', new: message });
    return { ok: true, id: q.id };
  };
  authed['query.answer'] = async ({ user }, { id, message }) => {
    const q = await repo.get('queries', id); if (!q) err('NOT_FOUND', 'Query not found.');
    assertCenter(user, q.centerId);
    q.thread = [...(q.thread || []), { by: user.name, role: user.role, at: new Date(now()).toISOString(), message }];
    if (!isAdmin(user)) q.status = 'answered';
    await repo.put('queries', q);
    await audit(user, { action: 'query-answer', table: 'queries', recordId: id, patientId: q.patientId, centerId: q.centerId, field: q.field || 'record', new: message });
    return { ok: true };
  };
  authed['query.close'] = async ({ user }, { id, reopen }) => {
    assertAdmin(user);
    const q = await repo.get('queries', id); if (!q) err('NOT_FOUND', 'Query not found.');
    q.status = reopen ? 'open' : 'closed'; q.closedAt = new Date(now()).toISOString();
    await repo.put('queries', q);
    await audit(user, { action: reopen ? 'query-reopen' : 'query-close', table: 'queries', recordId: id, patientId: q.patientId, centerId: q.centerId, field: 'status', new: q.status });
    return { ok: true };
  };
  authed['query.list'] = async ({ user }, { status } = {}) => {
    const all = isAdmin(user) ? await repo.list('queries') : await repo.list('queries', { centerId: user.centerId });
    return { queries: all.filter(q => !status || q.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) };
  };

  // ---------- de-identified dataset for analytics and export ----------
  authed['data.dataset'] = async ({ user }, { centerId } = {}) => {
    const scope = isAdmin(user) ? (centerId ? { centerId } : undefined) : { centerId: user.centerId };
    const [patients, visits, events, titrations, centers] = await Promise.all([repo.list('patients', scope), repo.list('visits', scope), repo.list('events', scope), repo.list('titrations', scope), repo.list('centers')]);
    return { patients: patients.filter(p => !p.deleted), visits, events, titrations, centers, settings: await settings(), scope: scope ? 'center' : 'all', today: today() };
  };

  // ---------- administration ----------
  authed['admin.users'] = async ({ user }) => { assertAdmin(user); return { users: (await repo.list('users')).map(publicUser).sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1) || a.name.localeCompare(b.name)) }; };
  authed['admin.saveUser'] = async ({ user }, { id, changes }) => {
    assertAdmin(user);
    const u = await repo.get('users', id); if (!u) err('NOT_FOUND', 'User not found.');
    const allowed = ['status', 'role', 'centerId', 'name', 'email', 'phone', 'professionalId'];
    const next = { ...u }; for (const k of allowed) if (k in changes) next[k] = changes[k];
    if (next.role === 'site' && next.status === 'active' && !next.centerId) err('INVALID', 'Assign a center before activating a site account.');
    if (next.role === 'admin') next.centerId = null;
    if (u.id === user.id && (next.status !== 'active' || next.role !== 'admin')) err('INVALID', 'You cannot deactivate or demote your own account.');
    await repo.put('users', next);
    if (next.status !== 'active') for (const s of await repo.list('sessions')) if (s.userId === id) await repo.del('sessions', s.id);
    await auditDiff(user, { action: 'update', table: 'users', recordId: id }, diff(publicUser(u), publicUser(next)));
    if (u.status !== 'active' && next.status === 'active' && next.email) {
      const c = next.centerId ? await repo.get('centers', next.centerId) : null;
      await sendMail(next.email, next.name, 'Your Jo-CHF account is active', 'Your account is ready',
        [`Hello ${next.name},`, `An administrator approved your account${next.role === 'admin' ? ' as administrator' : c ? ` for ${c.code} · ${c.name}` : ''}. You can now sign in with the username and password you chose.`, `Username: ${next.username}`],
        { label: 'Sign in to Jo-CHF', url: `${siteUrl}#/login` });
    }
    return { ok: true };
  };
  authed['admin.resetPassword'] = async ({ user }, { id }) => {
    assertAdmin(user);
    const u = await repo.get('users', id); if (!u) err('NOT_FOUND', 'User not found.');
    const temp = 'Jo' + randomToken(4) + Math.floor(10 + Math.random() * 89);
    u.pwHash = await hashPw(temp); u.mustChange = true; u.failed = 0; u.lockedUntil = null;
    await repo.put('users', u);
    await audit(user, { action: 'password', table: 'users', recordId: id, field: 'password', new: 'temporary password issued by administrator' });
    return { temp };
  };
  authed['admin.saveCenter'] = async ({ user }, { center }) => {
    assertAdmin(user);
    const code = String(center.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(code)) err('INVALID', 'Center code must be 2–8 letters or numbers, for example AMM01.');
    const all = await repo.list('centers');
    const existing = center.id ? all.find(c => c.id === center.id) : null;
    if (all.some(c => c.code === code && c.id !== center.id)) err('EXISTS', 'Another center already uses this code.');
    if (existing && existing.code !== code && existing.nextSeq) err('INVALID', 'The code cannot change after patients are enrolled (Study IDs use it).');
    const c = { ...(existing || { id: uuid(), nextSeq: 0, active: true }), name: center.name, city: center.city || '', code, target: Math.max(0, parseInt(center.target) || 0), active: center.active !== false };
    await repo.put('centers', c);
    await auditDiff(user, { action: existing ? 'update' : 'create', table: 'centers', recordId: c.id }, diff(existing || {}, c));
    return { ok: true, id: c.id };
  };
  authed['settings.save'] = async ({ user }, { changes }) => {
    assertAdmin(user);
    const cur = await settings();
    const allowed = ['registryTarget', 'windowBase', 'targets', 'kccqText', 'kccqLicensed', 'emailReminders'];
    const next = { ...cur }; for (const k of allowed) if (k in changes) next[k] = changes[k];
    await repo.put('settings', { id: 'main', ...next });
    settingsCache = null;
    await auditDiff(user, { action: 'update', table: 'settings', recordId: 'main' }, diff(cur, next));
    return { ok: true, settings: await settings() };
  };
  authed['audit.logExport'] = async ({ user }, { options }) => {
    assertAdmin(user);
    await audit(user, { action: 'export', table: 'dataset', recordId: 'export', field: 'export', new: options || 'de-identified export' });
    return { ok: true };
  };
  authed['audit.list'] = async ({ user }, filter = {}) => {
    if (!isAdmin(user)) { if (!filter.patientId) err('FORBIDDEN', 'Only administrators can view the full audit log.'); await loadPatient(user, filter.patientId); }
    return { entries: await repo.auditList({ ...filter, limit: Math.min(filter.limit || 300, 2000) }) };
  };

  // ---------- dispatcher ----------
  async function call(method, args = {}, token = null) {
    if (api[method]) return api[method](null, args || {});
    if (authed[method]) {
      const ctx = await session(token);
      if (ctx.user.mustChange && !['auth.changePassword', 'auth.me', 'auth.logout'].includes(method)) err('MUST_CHANGE', 'Please set a new password first.');
      return authed[method](ctx, args || {});
    }
    err('NOT_FOUND', `Unknown action ${method}.`);
  }
  return { call, methods: [...Object.keys(api), ...Object.keys(authed)] };
}
