// Sign-in, registration, password reset and first-time setup.
import { call, setToken, isDemo, setMode, getMode, LIVE_URL, resetDemo } from '../api.js';
import { esc, icon, ECG_MARK, toast, $ } from '../ui/dom.js';
import { monitor } from '../ui/ecg.js';
import { REGISTRATION_ROLES } from '../core/schema.js';

const CFG = window.JOCHF_CONFIG || {};

function pwStrength(pw) {
  let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++; if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  return s;
}
function pwField(id, label, autocomplete = 'new-password') {
  return `<div class="field"><label for="${id}">${label}</label>
    <div class="date-wrap"><input id="${id}" class="input" type="password" autocomplete="${autocomplete}" required minlength="8"><button type="button" class="cal" data-peek="${id}" aria-label="Show password">${icon('eye')}</button></div>
    ${autocomplete === 'new-password' ? `<div class="pw-meter"><i data-meter="${id}"></i></div><div class="help">At least 8 characters, with letters and numbers.</div>` : ''}</div>`;
}
function wirePw(root) {
  root.querySelectorAll('[data-peek]').forEach(b => b.onclick = () => { const i = root.querySelector('#' + b.dataset.peek); i.type = i.type === 'password' ? 'text' : 'password'; });
  root.querySelectorAll('[data-meter]').forEach(m => { const i = root.querySelector('#' + m.dataset.meter); i.addEventListener('input', () => { const s = pwStrength(i.value); m.style.width = (s / 5 * 100) + '%'; m.style.background = s >= 4 ? 'var(--good)' : s >= 3 ? 'var(--s4)' : 'var(--bad)'; }); });
}
function busy(btn, on, label) { btn.disabled = on; if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>'; } else btn.innerHTML = btn.dataset.l || label; }
function showErr(root, msg) { const e = root.querySelector('.form-err'); e.innerHTML = msg ? `<div class="callout bad">${icon('alert')}<div>${esc(msg)}</div></div>` : ''; }

let activeStop = null;
export async function render(root, { name, params }, app) {
  if (activeStop) { activeStop(); activeStop = null; }
  let meta = { centers: [], needsSetup: false };
  try { meta = await call('meta.info'); } catch (e) { if (!isDemo()) meta.error = e.message; }
  if (name === 'login' && meta.needsSetup && !isDemo()) { location.hash = '#/setup'; return; }

  root.innerHTML = `
  <div class="auth">
    <section class="auth-stage ecg-paper" aria-hidden="false">
      <canvas id="ecg" aria-hidden="true"></canvas>
      <div class="auth-top"><span class="brand-mark">${ECG_MARK}</span><span class="small ink2">Jordan Contemporary Heart Failure Registry</span></div>
      <div class="auth-hero">
        <div class="wordmark">Jo<span>-</span>CHF</div>
        <p class="title">Every patient with heart failure in Jordan, followed for a year, in one place.</p>
        <div class="auth-facts">
          <div><b>1,000</b>adult patients</div><div><b>10–20</b>centers across Jordan</div><div><b>30d · 6m · 12m</b>follow-up visits</div><div><b>ESC 2026</b>classification</div>
        </div>
      </div>
    </section>
    <section class="auth-panel"><div class="auth-card" id="card"></div></section>
  </div>`;
  const stop = monitor($('#ecg', root)); activeStop = stop;
  const card = $('#card', root);
  const modeNote = isDemo()
    ? `<div class="callout" style="margin-bottom:18px">${icon('info')}<div><b>Demo mode.</b> Invented patients only. Nothing leaves this browser.${LIVE_URL ? ` <button class="linkbtn" id="to-live">Go to the live registry</button>` : ''}</div></div>`
    : (meta.error ? `<div class="callout bad" style="margin-bottom:18px">${icon('alert')}<div>The server cannot be reached right now. ${esc(meta.error)}</div></div>` : '');

  const views = {
    login() {
      card.innerHTML = `${modeNote}
        <h2>Sign in</h2><p class="lead">Use your email address or the numeric ID given by the study team.</p>
        <form id="f" novalidate>
          <div class="form-err"></div>
          <div class="field"><label for="u">Username</label><input id="u" class="input" autocomplete="username" required placeholder="name@example.com or 1048" autocapitalize="off" spellcheck="false"></div>
          ${pwField('p', 'Password', 'current-password')}
          <div class="field hide" id="code-f"><label for="code">Verification code</label><input id="code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code from your authenticator app"></div>
          <button class="btn primary" type="submit">Sign in</button>
        </form>
        <div class="auth-links"><a href="#/forgot">Forgot password?</a><a href="#/register">Request an account</a></div>
        ${isDemo() ? `<div class="demo-box"><h3>Explore the demo</h3><p>Open the registry with 500+ invented patients across 12 centers. Password for every demo account is <b>demo1234</b>.</p>
          <div class="row wrap"><button class="btn sm" data-demo="admin@demo">${icon('shield')}As administrator</button><button class="btn sm" data-demo="amm01@demo">${icon('building')}As site investigator</button></div>
          <p style="margin:10px 0 0"><button class="linkbtn tiny" id="reset-demo">Reset demo data</button></p></div>`
          : (CFG.SHOW_DEMO_LINK ? `<div class="demo-box"><h3>Want to look around first?</h3><p>Open a demo copy with invented patients. It runs only in your browser.</p><button class="btn sm" id="to-demo">${icon('eye')}Explore the demo</button></div>` : '')}`;
      wirePw(card);
      const f = $('#f', card);
      f.onsubmit = async e => {
        e.preventDefault(); showErr(card, '');
        const btn = f.querySelector('[type=submit]'); busy(btn, true);
        try {
          const r = await call('auth.login', { username: $('#u', card).value, password: $('#p', card).value, code: $('#code', card).value || undefined });
          if (r.need2fa) { $('#code-f', card).classList.remove('hide'); $('#code', card).focus(); showErr(card, ''); busy(btn, false); toast('Enter the code from your authenticator app.', 'info'); return; }
          setToken(r.token); app.user = null;
          location.hash = '#/dashboard';
        } catch (err) { showErr(card, err.message); busy(btn, false); }
      };
      card.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => { $('#u', card).value = b.dataset.demo; $('#p', card).value = 'demo1234'; f.requestSubmit(); });
      $('#to-demo', card)?.addEventListener('click', () => { setMode('demo'); render(root, { name: 'login' }, app); });
      $('#to-live', card)?.addEventListener('click', () => { setMode('live'); render(root, { name: 'login' }, app); });
      $('#reset-demo', card)?.addEventListener('click', () => { resetDemo(); toast('Demo data reset to the original state.'); });
      setTimeout(() => $('#u', card)?.focus(), 50);
    },
    register() {
      card.innerHTML = `<h2>Request an account</h2><p class="lead">The study administrators will check your request and assign your center. You can sign in after approval.</p>
        <form id="f" novalidate><div class="form-err"></div>
          <div class="field"><label for="n">Full name</label><input id="n" class="input" autocomplete="name" required></div>
          <div class="field"><label for="u">Username</label><input id="u" class="input" autocomplete="username" required placeholder="Your email, or an ID from the study team" autocapitalize="off"><div class="help">Your personal or work email (Gmail, Yahoo, hospital…) or a numeric ID.</div></div>
          <div class="field"><label for="ph">Phone</label><input id="ph" class="input" type="tel" autocomplete="tel" placeholder="07X XXX XXXX"></div>
          <div class="field"><label for="c">Center</label><select id="c" class="input"><option value="">Choose your center</option>${meta.centers.map(c => `<option value="${esc(c.id)}">${esc(c.code)} · ${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="r">Role</label><select id="r" class="input">${REGISTRATION_ROLES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
          <div class="field"><label for="pid">Professional ID</label><input id="pid" class="input" placeholder="Jordan Medical Association number or staff ID"></div>
          ${pwField('p', 'Choose a password')}
          ${pwField('p2', 'Repeat the password', 'new-password-2')}
          <button class="btn primary" type="submit">Send request</button>
        </form><div class="auth-links"><a href="#/login">Back to sign in</a></div>`;
      wirePw(card);
      const f = $('#f', card);
      f.onsubmit = async e => {
        e.preventDefault(); showErr(card, '');
        if ($('#p', card).value !== $('#p2', card).value) return showErr(card, 'The two passwords are not the same.');
        const btn = f.querySelector('[type=submit]'); busy(btn, true);
        const un = $('#u', card).value.trim();
        try {
          await call('auth.register', { name: $('#n', card).value, username: un, email: un.includes('@') ? un : '', phone: $('#ph', card).value, centerId: $('#c', card).value, role: $('#r', card).value, professionalId: $('#pid', card).value, password: $('#p', card).value });
          card.innerHTML = `<div class="callout good">${icon('check')}<div><b>Request sent.</b> An administrator will approve your account and assign your center. Then sign in with the username and password you chose.</div></div>
            ${meta.mail && un.includes('@') ? `<div class="callout" style="margin-top:12px">${icon('info')}<div><b>Check your email.</b> We sent a link to <b>${esc(un)}</b> to confirm your address. Look in the spam folder too. <button class="linkbtn" id="resend">Send it again</button></div></div>` : ''}
            <p style="margin-top:18px"><a class="btn primary" href="#/login">Back to sign in</a></p>`;
          card.querySelector('#resend')?.addEventListener('click', async () => { await call('auth.resendVerify', { username: un }).catch(() => { }); toast('Confirmation email sent again.'); });
        } catch (err) { showErr(card, err.message); busy(btn, false); }
      };
    },
    forgot() {
      card.innerHTML = `<h2>Forgot password</h2><p class="lead">Enter your username. If email is set up for the registry, we send you a reset link.</p>
        <form id="f"><div class="form-err"></div><div class="field"><label for="u">Username or email</label><input id="u" class="input" required autocapitalize="off"></div><button class="btn primary">Send reset link</button></form>
        <div class="auth-links"><a href="#/login">Back to sign in</a></div>`;
      $('#f', card).onsubmit = async e => {
        e.preventDefault(); const btn = e.target.querySelector('button'); busy(btn, true);
        try {
          const r = await call('auth.forgot', { username: $('#u', card).value });
          card.innerHTML = r.mode === 'email'
            ? `<div class="callout good">${icon('check')}<div>If this account exists, a reset link is on its way. Check your inbox and spam folder. The link works for 1 hour.</div></div><p style="margin-top:18px"><a class="btn" href="#/login">Back to sign in</a></p>`
            : `<div class="callout">${icon('info')}<div><b>Ask a study administrator.</b> They can give you a temporary password from the Users page. You will choose a new password when you sign in.</div></div><p style="margin-top:18px"><a class="btn" href="#/login">Back to sign in</a></p>`;
        } catch (err) { showErr(card, err.message); busy(btn, false); }
      };
    },
    reset() {
      card.innerHTML = `<h2>Choose a new password</h2><p class="lead">This link works once.</p>
        <form id="f"><div class="form-err"></div>${pwField('p', 'New password')}${pwField('p2', 'Repeat the password', 'new-password-2')}<button class="btn primary">Save new password</button></form>`;
      wirePw(card);
      $('#f', card).onsubmit = async e => {
        e.preventDefault(); if ($('#p', card).value !== $('#p2', card).value) return showErr(card, 'The two passwords are not the same.');
        const btn = e.target.querySelector('button'); busy(btn, true);
        try { await call('auth.reset', { token: params[0], password: $('#p', card).value }); toast('Password saved. Please sign in.'); location.hash = '#/login'; }
        catch (err) { showErr(card, err.message); busy(btn, false); }
      };
    },
    async verify() {
      card.innerHTML = `<h2>Confirming your email…</h2><p class="lead">One moment.</p>`;
      try {
        const r = await call('auth.verifyEmail', { token: params[0] });
        card.innerHTML = `<div class="callout good">${icon('check')}<div><b>Email confirmed.</b> Thank you. ${r.status === 'pending' ? 'An administrator will approve your account soon; you will get an email when it is active.' : 'You can sign in now.'}</div></div><p style="margin-top:18px"><a class="btn primary" href="#/login">Go to sign in</a></p>`;
      } catch (e) {
        card.innerHTML = `<div class="callout bad">${icon('alert')}<div>${esc(e.message)}</div></div><p style="margin-top:18px"><a class="btn" href="#/login">Go to sign in</a></p>`;
      }
    },
    setup() {
      if (!meta.needsSetup) { location.hash = '#/login'; return; }
      card.innerHTML = `<h2>Welcome. Create the first administrator</h2><p class="lead">This screen appears only once, while the registry has no administrator. After this, everyone else requests an account and you approve them.</p>
        <form id="f"><div class="form-err"></div>
          <div class="field"><label for="n">Full name</label><input id="n" class="input" required></div>
          <div class="field"><label for="u">Username (email)</label><input id="u" class="input" required autocapitalize="off"></div>
          ${pwField('p', 'Password')}${pwField('p2', 'Repeat the password', 'new-password-2')}
          <button class="btn primary">Create administrator</button></form>`;
      wirePw(card);
      $('#f', card).onsubmit = async e => {
        e.preventDefault(); if ($('#p', card).value !== $('#p2', card).value) return showErr(card, 'The two passwords are not the same.');
        const btn = e.target.querySelector('button'); busy(btn, true);
        try { const r = await call('setup.createAdmin', { name: $('#n', card).value, username: $('#u', card).value, password: $('#p', card).value }); toast(r.mail ? 'Administrator created. Check your email to confirm it, then sign in.' : 'Administrator created. Please sign in.', 'ok', 6000); location.hash = '#/login'; }
        catch (err) { showErr(card, err.message); busy(btn, false); }
      };
    },
  };
  views[name]?.();
  return () => { stop(); activeStop = null; };
}
