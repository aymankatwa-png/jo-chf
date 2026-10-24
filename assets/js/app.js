// Jo-CHF app shell: routing, navigation, session, theme.
import { call, hasToken, setToken, onAuthLost, isDemo, getMode, setMode, LIVE_URL } from './api.js';
import { esc, icon, ECG_MARK, toast, modal, initials, loader, $ } from './ui/dom.js';

export const app = {
  user: null, settings: null, center: null, counts: {},
  get isAdmin() { return this.user?.role === 'admin'; },
  get demo() { return isDemo(); },
  go(hash) { if (location.hash === hash) route(); else location.hash = hash; },
  setCrumbs, refreshCounts, signOut, loadMe,
};
window.__jochf = app;

const ROUTES = [
  [/^#\/login$/, () => import('./pages/auth.js'), 'login', true],
  [/^#\/register$/, () => import('./pages/auth.js'), 'register', true],
  [/^#\/forgot$/, () => import('./pages/auth.js'), 'forgot', true],
  [/^#\/reset\/(.+)$/, () => import('./pages/auth.js'), 'reset', true],
  [/^#\/setup$/, () => import('./pages/auth.js'), 'setup', true],
  [/^#\/(dashboard)?$/, () => import('./pages/dashboard.js'), 'dashboard'],
  [/^#\/analytics$/, () => import('./pages/analytics.js'), 'analytics'],
  [/^#\/center\/([^/]+)$/, () => import('./pages/center.js'), 'center'],
  [/^#\/patient\/new\/([^/]+)$/, () => import('./pages/patient.js'), 'new'],
  [/^#\/patient\/([^/]+)(?:\/([^/]+))?$/, () => import('./pages/patient.js'), 'patient'],
  [/^#\/followups$/, () => import('./pages/lists.js'), 'followups'],
  [/^#\/queries$/, () => import('./pages/lists.js'), 'queries'],
  [/^#\/admin\/users$/, () => import('./pages/admin.js'), 'users'],
  [/^#\/admin\/centers$/, () => import('./pages/admin.js'), 'centers'],
  [/^#\/admin\/settings$/, () => import('./pages/admin.js'), 'settings'],
  [/^#\/audit$/, () => import('./pages/admin.js'), 'audit'],
  [/^#\/export$/, () => import('./pages/export.js'), 'export'],
  [/^#\/account$/, () => import('./pages/account.js'), 'account'],
];

let cleanup = null, shellMounted = false, routeSeq = 0;

async function loadMe() {
  const me = await call('auth.me');
  app.user = me.user; app.settings = me.settings; app.center = me.center;
  return me;
}

async function route() {
  const seq = ++routeSeq;
  const hash = location.hash || '#/dashboard';
  const found = ROUTES.map(([re, load, name, pub]) => ({ m: hash.match(re), load, name, pub })).find(x => x.m);
  if (!found) return app.go('#/dashboard');
  if (cleanup) { try { cleanup(); } catch { } cleanup = null; }
  if (found.pub) {
    shellMounted = false;
    const mod = await found.load();
    if (seq !== routeSeq) return;
    cleanup = await mod.render(document.getElementById('app'), { name: found.name, params: found.m.slice(1) }, app);
    return;
  }
  if (!hasToken()) return app.go('#/login');
  if (!app.user) {
    document.getElementById('app').innerHTML = `<div class="ecg-paper" style="min-height:100vh">${loader()}</div>`;
    try { await loadMe(); } catch (e) { return app.go('#/login'); }
  }
  if (app.user.mustChange && found.name !== 'account') { toast('Please set a new password to continue.', 'info'); return app.go('#/account'); }
  if (!shellMounted) mountShell();
  markNav(found.name, found.m);
  const page = document.getElementById('page');
  page.innerHTML = loader();
  window.scrollTo({ top: 0 });
  try {
    const mod = await found.load();
    if (seq !== routeSeq) return;
    cleanup = await mod.render(page, { name: found.name, params: found.m.slice(1) }, app);
  } catch (e) {
    console.error(e);
    if (seq !== routeSeq) return;
    if (e.code === 'AUTH') return;
    page.innerHTML = `<div class="empty">${icon('alert')}<h3>${esc(e.code === 'FORBIDDEN' ? 'Not available for your account' : e.code === 'NOT_FOUND' ? 'Not found' : 'This page could not load')}</h3><p>${esc(e.message)}</p><p style="margin-top:16px"><a class="btn" href="#/dashboard">Back to dashboard</a></p></div>`;
  }
}

function navItems() {
  const u = app.user;
  const items = [
    { id: 'dashboard', href: '#/dashboard', icon: 'home', label: 'Dashboard' },
    { id: 'analytics', href: '#/analytics', icon: 'chart', label: 'Analytics' },
  ];
  if (!app.isAdmin && u.centerId) items.push({ id: 'center', href: `#/center/${u.centerId}`, icon: 'building', label: 'My center' });
  items.push({ id: 'followups', href: '#/followups', icon: 'calendar', label: 'Follow-ups', count: 'due' });
  items.push({ id: 'queries', href: '#/queries', icon: 'chat', label: 'Data queries', count: 'queries' });
  const admin = app.isAdmin ? [
    { id: 'users', href: '#/admin/users', icon: 'users', label: 'Users', count: 'pending' },
    { id: 'centers', href: '#/admin/centers', icon: 'target', label: 'Centers & targets' },
    { id: 'settings', href: '#/admin/settings', icon: 'settings', label: 'Study settings' },
    { id: 'audit', href: '#/audit', icon: 'history', label: 'Audit log' },
    { id: 'export', href: '#/export', icon: 'download', label: 'Export data' },
  ] : [];
  return { items, admin };
}

function mountShell() {
  const u = app.user;
  const { items, admin } = navItems();
  const link = it => `<a href="${it.href}" data-nav="${it.id}">${icon(it.icon)}<span>${esc(it.label)}</span>${it.count ? `<span class="count hide" data-count="${it.count}"></span>` : ''}</a>`;
  const centerLabel = app.isAdmin ? 'Administrator · all centers' : (app.center ? `${app.center.code} · ${app.center.name}` : 'Site investigator');
  document.getElementById('app').innerHTML = `
  <div class="session-bar" aria-hidden="true"><i id="sessbar" style="transform:scaleX(0)"></i></div>
  <div class="shell">
    <aside class="rail" aria-label="Main navigation">
      <a class="brand" href="#/dashboard"><span class="brand-mark">${ECG_MARK}</span><span><div class="brand-name">Jo-CHF</div><div class="brand-sub">Heart Failure Registry</div></span></a>
      <nav class="nav">${items.map(link).join('')}
        ${admin.length ? `<div class="nav-group">Study administration</div>${admin.map(link).join('')}` : ''}
        <div class="nav-group">Help</div>
        <a href="guide/" target="_blank" rel="noopener">${icon('book')}<span>User guide</span></a>
      </nav>
      <div class="rail-foot">
        ${app.demo ? `<div class="demo-flag"><strong>Demo mode.</strong> All patients are invented. Changes stay in this browser only.</div>` : ''}
        <a class="me" href="#/account" data-nav="account"><span class="avatar">${esc(initials(u.name))}</span><span class="grow"><div class="me-name">${esc(u.name)}</div><div class="me-role">${esc(centerLabel)}</div></span></a>
      </div>
    </aside>
    <div class="main">
      <header class="topbar" id="topbar">
        <div class="crumbs" id="crumbs"></div>
        ${app.demo ? '<span class="badge info">Demo</span>' : ''}
        <button class="btn ghost sm icon" id="theme-btn" aria-label="Switch light or dark theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="btn ghost sm" id="logout-btn">${icon('logout')}<span class="hide-sm">Sign out</span></button>
      </header>
      <main class="page" id="page" tabindex="-1"></main>
    </div>
  </div>
  <nav class="mobile-nav" aria-label="Main navigation">
    <a href="#/dashboard" data-nav="dashboard">${icon('home')}Home</a>
    <a href="#/analytics" data-nav="analytics">${icon('chart')}Analytics</a>
    ${!app.isAdmin && u.centerId ? `<a href="#/center/${u.centerId}" data-nav="center">${icon('building')}Center</a>` : `<a href="#/admin/users" data-nav="users">${icon('users')}Users</a>`}
    <a href="#/followups" data-nav="followups">${icon('calendar')}Follow-ups</a>
    <a href="#/account" data-nav="account">${icon('user')}Account</a>
  </nav>`;
  shellMounted = true;
  $('#logout-btn').onclick = () => signOut();
  $('#theme-btn').onclick = toggleTheme;
  const tb = $('#topbar');
  window.addEventListener('scroll', () => tb && tb.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
  refreshCounts();
  startIdleTimer();
}

function markNav(name, m) {
  document.querySelectorAll('[data-nav]').forEach(a => {
    let on = a.dataset.nav === name;
    if (name === 'patient' || name === 'new') on = a.dataset.nav === 'center';
    a.toggleAttribute('aria-current', false);
    if (on) a.setAttribute('aria-current', 'page');
  });
}

function setCrumbs(list) {
  const el = document.getElementById('crumbs'); if (!el) return;
  el.innerHTML = list.map((c, i) => i < list.length - 1 && c.href ? `<a href="${c.href}">${esc(c.label)}</a><span class="sep">/</span>` : `<span class="here">${esc(c.label)}</span>`).join('');
  document.title = (list[list.length - 1]?.label ? list[list.length - 1].label + ' · ' : '') + 'Jo-CHF Registry';
}

async function refreshCounts() {
  try {
    const q = await call('query.list', { status: 'open' });
    const set = (k, n) => document.querySelectorAll(`[data-count="${k}"]`).forEach(el => { el.textContent = n; el.classList.toggle('hide', !n); });
    set('queries', q.queries.length);
    if (app.isAdmin) { const u = await call('admin.users'); set('pending', u.users.filter(x => x.status === 'pending').length); }
    else if (app.user.centerId) { const c = await call('center.page', { centerId: app.user.centerId }); set('due', c.due.filter(d => d.status !== 'soon').length); }
  } catch { }
}

async function signOut(silent) {
  try { await call('auth.logout'); } catch { }
  setToken(null); app.user = null; shellMounted = false;
  stopIdleTimer();
  if (!silent) toast('Signed out.');
  app.go('#/login');
}

// ---------- automatic logout after 30 minutes without activity ----------
const IDLE = 30 * 60 * 1000, WARN = 28 * 60 * 1000;
let lastAct = Date.now(), idleIv = null, warned = false;
const bump = () => { lastAct = Date.now(); if (warned) { warned = false; document.querySelector('.modal-back [data-x]')?.click(); } };
function startIdleTimer() {
  stopIdleTimer();
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(e => window.addEventListener(e, bump, { passive: true }));
  lastAct = Date.now();
  idleIv = setInterval(() => {
    const idle = Date.now() - lastAct;
    const bar = document.getElementById('sessbar');
    if (bar) bar.style.transform = `scaleX(${idle > WARN - 5 * 60 * 1000 ? Math.min(1, (idle - (WARN - 5 * 60 * 1000)) / (IDLE - (WARN - 5 * 60 * 1000))) : 0})`;
    if (idle > IDLE) { stopIdleTimer(); signOut(true).then(() => toast('You were signed out after 30 minutes without activity.', 'info', 6000)); }
    else if (idle > WARN && !warned) { warned = true; modal({ title: 'Are you still there?', body: '<p class="ink2">For patient privacy you will be signed out in 2 minutes. Move the mouse or press any key to stay signed in. Unsaved drafts stay on this device.</p>', actions: [{ label: 'Stay signed in', kind: 'primary' }] }).then(() => { lastAct = Date.now(); warned = false; }); }
  }, 5000);
}
function stopIdleTimer() { clearInterval(idleIv); ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(e => window.removeEventListener(e, bump)); }

function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('jochf-theme', next); } catch { }
  const b = document.getElementById('theme-btn'); if (b) b.innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
  window.dispatchEvent(new CustomEvent('themechange'));
}

onAuthLost(() => { app.user = null; shellMounted = false; stopIdleTimer(); if (!location.hash.startsWith('#/login')) { toast('Your session has ended. Please sign in again.', 'info'); app.go('#/login'); } });
window.addEventListener('hashchange', route);
route();
