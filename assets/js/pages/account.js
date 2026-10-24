// My account: password, two-step verification, theme.
import { call, isDemo } from '../api.js';
import { esc, icon, toast, modal, loadScript, initials } from '../ui/dom.js';

export async function render(root, _, app) {
  app.setCrumbs([{ label: 'My account' }]);
  const u = app.user;
  const draw = () => {
    root.innerHTML = `<div class="page-head"><div class="grow"><h1>My account</h1><p>Your details, password and sign-in security.</p></div><button class="btn" id="out">${icon('logout')}Sign out</button></div>
    ${u.mustChange ? `<div class="callout warn" style="margin-bottom:16px">${icon('alert')}<div><b>Please choose a new password.</b> You signed in with a temporary password from an administrator.</div></div>` : ''}
    <div class="two-col">
      <div class="card"><div class="card-head"><h2>Profile</h2></div><div class="card-body">
        <div class="row" style="gap:14px;margin-bottom:16px"><span class="avatar" style="width:54px;height:54px;font-size:18px">${esc(initials(u.name))}</span><div><div style="font-weight:650;font-size:18px">${esc(u.name)}</div><div class="ink2">${esc(u.username)}</div></div></div>
        <div class="list-rows"><div><span class="grow muted">Role</span><b>${u.role === 'admin' ? 'Administrator' : 'Site investigator / recruiter'}</b></div>
        <div><span class="grow muted">Center</span><b>${u.role === 'admin' ? 'All centers' : esc(app.center ? `${app.center.code} · ${app.center.name}` : '–')}</b></div>
        <div><span class="grow muted">Email</span><b>${esc(u.email || '–')}</b></div></div>
        <p class="small muted" style="margin-top:14px">To change your name, center or role, ask a study administrator.</p></div></div>
      <div class="card"><div class="card-head"><h2>Change password</h2></div><div class="card-body"><form id="pw" class="stack">
        <div class="field"><label for="cur">Current password</label><input id="cur" class="input" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="np">New password</label><input id="np" class="input" type="password" autocomplete="new-password" required minlength="8"><div class="help">At least 8 characters, with letters and numbers.</div></div>
        <div class="field"><label for="np2">Repeat new password</label><input id="np2" class="input" type="password" autocomplete="new-password" required></div>
        <button class="btn primary">Save new password</button></form></div></div>
      <div class="card"><div class="card-head"><h2>Two-step verification</h2>${u.totpEnabled ? '<span class="badge good">On</span>' : '<span class="badge">Off</span>'}</div><div class="card-body">
        <p class="ink2" style="margin-bottom:14px">${u.role === 'admin' ? 'Recommended for administrators.' : 'Optional.'} After your password you also type a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, Authy…).</p>
        ${u.totpEnabled ? `<button class="btn danger" id="off">Turn off</button>` : `<button class="btn primary" id="on">${icon('shield')}Turn on</button>`}</div></div>
      <div class="card"><div class="card-head"><h2>Appearance</h2></div><div class="card-body"><div class="seg" id="th">
        <button type="button" data-v="light" aria-pressed="${document.documentElement.dataset.theme === 'light'}">${icon('sun')} Light</button>
        <button type="button" data-v="dark" aria-pressed="${document.documentElement.dataset.theme === 'dark'}">${icon('moon')} Dark</button>
        <button type="button" data-v="" aria-pressed="${!document.documentElement.dataset.theme}">Same as device</button></div></div></div>
    </div>`;
    root.querySelector('#out').onclick = () => app.signOut();
    root.querySelector('#pw').onsubmit = async e => {
      e.preventDefault();
      const np = root.querySelector('#np').value;
      if (np !== root.querySelector('#np2').value) return toast('The two new passwords are not the same.', 'bad');
      try { await call('auth.changePassword', { current: root.querySelector('#cur').value, password: np }); u.mustChange = false; toast('Password changed.'); await app.loadMe(); location.hash = '#/dashboard'; }
      catch (err) { toast(err.message, 'bad'); }
    };
    root.querySelector('#th').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v) document.documentElement.dataset.theme = b.dataset.v; else delete document.documentElement.dataset.theme; try { b.dataset.v ? localStorage.setItem('jochf-theme', b.dataset.v) : localStorage.removeItem('jochf-theme'); } catch { } window.dispatchEvent(new CustomEvent('themechange')); draw(); };
    root.querySelector('#on')?.addEventListener('click', async () => {
      const r = await call('auth.totpSetup');
      await loadScript('assets/vendor/qrcode.js');
      const qr = window.qrcode(0, 'M'); qr.addData(r.uri); qr.make();
      const c = { code: '' };
      modal({
        title: 'Turn on two-step verification',
        body: `<p class="ink2">1. Open your authenticator app and scan this code.</p><div class="qr" style="margin:10px auto">${qr.createSvgTag({ cellSize: 4, margin: 0 })}</div>
          <p class="small ink2">Cannot scan? Enter this key by hand:</p><div class="code-box">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</div>
          <p class="ink2" style="margin-top:14px">2. Type the 6-digit code the app shows.</p><input class="input" id="tc" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456">`,
        actions: [{ label: 'Cancel', value: false }, { label: 'Turn on', kind: 'primary', onClick: async back => { await call('auth.totpEnable', { code: back.querySelector('#tc').value }); u.totpEnabled = true; toast('Two-step verification is on.'); draw(); } }],
      });
    });
    root.querySelector('#off')?.addEventListener('click', () => modal({ title: 'Turn off two-step verification', body: '<div class="field"><label for="tp">Your password</label><input id="tp" class="input" type="password"></div>', actions: [{ label: 'Cancel', value: false }, { label: 'Turn off', kind: 'danger', onClick: async back => { await call('auth.totpDisable', { password: back.querySelector('#tp').value }); u.totpEnabled = false; toast('Two-step verification is off.'); draw(); } }] }));
  };
  draw();
}
