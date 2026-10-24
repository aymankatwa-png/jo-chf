// Administration: users, centers & targets, study settings, audit log.
import { call } from '../api.js';
import { esc, icon, toast, modal, confirmDialog, fmtDateShort } from '../ui/dom.js';
import { bindFields } from '../ui/fields.js';
import { KCCQ_FORM } from '../core/schema.js';
import { DEFAULT_TARGETS, CLASS_LABEL } from '../core/logic.js';

export async function render(root, { name }, app) {
  if (!app.isAdmin) { root.innerHTML = `<div class="empty">${icon('lock')}<h3>Administrators only</h3></div>`; return; }
  return ({ users, centers, settings, audit })[name](root, app);
}

// ---------- users ----------
async function users(root, app) {
  app.setCrumbs([{ label: 'Users' }]);
  const [{ users: list }, summ] = await Promise.all([call('admin.users'), call('dash.summary')]);
  const centers = summ.cards;
  const cName = id => { const c = centers.find(x => x.id === id); return c ? `${c.code} · ${c.name}` : '–'; };
  const pending = list.filter(u => u.status === 'pending');
  const others = list.filter(u => u.status !== 'pending');
  const row = u => `<tr>
    <td><b style="font-weight:600">${esc(u.name)}</b><div class="small ink2">${esc(u.username)}${u.phone ? ' · ' + esc(u.phone) : ''}${u.professionalId ? ' · ID ' + esc(u.professionalId) : ''}</div></td>
    <td>${u.role === 'admin' ? '<span class="badge ink">Administrator</span>' : '<span class="badge outline">Site investigator</span>'}${u.requestedRole === 'admin' && u.status === 'pending' ? '<div class="small muted">asked for administrator</div>' : ''}</td>
    <td>${u.role === 'admin' ? '<span class="muted">All centers</span>' : esc(cName(u.centerId))}</td>
    <td>${u.emailVerified === true ? '<span class="badge info" title="Email address confirmed">Email ✓</span> ' : u.emailVerified === false ? '<span class="badge" title="Email not confirmed yet">Email not confirmed</span> ' : ''}${u.status === 'active' ? '<span class="badge good">Active</span>' : u.status === 'pending' ? '<span class="badge warn">Waiting for approval</span>' : '<span class="badge">Deactivated</span>'}${u.totpEnabled ? ' <span class="badge info" title="Two-step verification on">2-step</span>' : ''}</td>
    <td class="small ink2 tnum">${u.lastLogin ? fmtDateShort(u.lastLogin.slice(0, 10)) : 'Never'}</td>
    <td style="text-align:right;white-space:nowrap">${u.status === 'pending' ? `<button class="btn primary sm" data-approve="${u.id}">${icon('check')}Approve</button> <button class="btn sm ghost" data-reject="${u.id}">Decline</button>` :
      `<button class="btn sm" data-edit="${u.id}">${icon('edit')}Edit</button> <button class="btn sm ghost" data-reset="${u.id}" title="Give a temporary password">${icon('refresh')}</button> ${u.id !== app.user.id ? `<button class="btn sm ghost" data-toggle="${u.id}">${u.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>` : ''}`}</td></tr>`;
  root.innerHTML = `<div class="page-head"><div class="grow"><h1>Users</h1><p>Approve new accounts, assign centers and deactivate people who leave. Deactivating keeps everything they entered.</p></div></div>
    ${pending.length ? `<div class="card" style="margin-bottom:18px;border-color:var(--s4)"><div class="card-head"><h2>Waiting for approval · ${pending.length}</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th>Center</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>${pending.map(row).join('')}</tbody></table></div></div>` : ''}
    <div class="card"><div class="card-head"><h2>All accounts · ${others.length}</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th>Center</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>${others.map(row).join('')}</tbody></table></div></div>`;
  const reload = () => users(root, app).then(() => app.refreshCounts());
  const editDialog = (u, approving) => {
    const ch = { role: u.requestedRole === 'admin' && approving ? 'site' : u.role, centerId: u.centerId || '', name: u.name, email: u.email || '', phone: u.phone || '' };
    modal({
      title: approving ? `Approve ${u.name}` : `Edit ${u.name}`,
      body: `<div class="fgrid" id="uf">
        <div class="field full"><label>Role</label><div class="seg"><button type="button" data-k="role" data-t="seg" data-v="site" aria-pressed="${ch.role === 'site'}">Site investigator</button><button type="button" data-k="role" data-t="seg" data-v="admin" aria-pressed="${ch.role === 'admin'}">Administrator</button></div>${u.requestedRole === 'admin' ? '<div class="help">This person asked for administrator access. Administrators see all centers (de-identified) and can export data.</div>' : ''}</div>
        <div class="field full" id="cfield"><label>Center</label><select class="input" data-k="centerId" data-t="select"><option value="">Choose a center</option>${centers.map(c => `<option value="${c.id}"${c.id === ch.centerId ? ' selected' : ''}>${esc(c.code)} · ${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Name</label><input class="input" data-k="name" data-t="text" value="${esc(ch.name)}"></div>
        <div class="field"><label>Email</label><input class="input" data-k="email" data-t="text" value="${esc(ch.email)}"></div>
      </div>`,
      actions: [{ label: 'Cancel', value: false }, { label: approving ? 'Approve and activate' : 'Save', kind: 'primary', onClick: async () => { await call('admin.saveUser', { id: u.id, changes: { ...ch, centerId: ch.role === 'admin' ? null : ch.centerId || null, ...(approving ? { status: 'active' } : {}) } }); toast(approving ? `${u.name} can now sign in.` : 'Saved.'); reload(); } }],
      onOpen: back => { const f = back.querySelector('#uf'); const vis = () => { back.querySelector('#cfield').classList.toggle('hide', ch.role === 'admin'); f.querySelectorAll('[data-k=role]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === ch.role))); }; vis(); bindFields(f, () => ch, () => { if (!ch.role) ch.role = 'site'; vis(); }); },
    });
  };
  root.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const u = list.find(x => x.id === (b.dataset.approve || b.dataset.edit || b.dataset.reset || b.dataset.toggle || b.dataset.reject));
    if (!u) return;
    if (b.dataset.approve) editDialog(u, true);
    else if (b.dataset.edit) editDialog(u, false);
    else if (b.dataset.reject) { if (await confirmDialog('Decline this request?', `${u.name} will not be able to sign in. You can reactivate later.`, 'Decline', 'danger')) { await call('admin.saveUser', { id: u.id, changes: { status: 'inactive' } }); toast('Request declined.'); reload(); } }
    else if (b.dataset.toggle) { const on = u.status !== 'active'; if (on && u.role === 'site' && !u.centerId) return editDialog(u, true); if (await confirmDialog(on ? 'Reactivate account?' : 'Deactivate account?', on ? `${u.name} will be able to sign in again.` : `${u.name} will be signed out and cannot sign in. Their data stay in the registry.`, on ? 'Reactivate' : 'Deactivate', on ? 'primary' : 'danger')) { await call('admin.saveUser', { id: u.id, changes: { status: on ? 'active' : 'inactive' } }); toast('Saved.'); reload(); } }
    else if (b.dataset.reset) {
      if (!(await confirmDialog('Give a temporary password?', `${u.name} will use it once, then choose a new password.`, 'Create temporary password'))) return;
      const r = await call('admin.resetPassword', { id: u.id });
      modal({ title: 'Temporary password', body: `<p class="ink2">Give this to ${esc(u.name)} in person or by phone. It is shown only once.</p><div class="code-box" style="font-size:20px;text-align:center;letter-spacing:.05em">${esc(r.temp)}</div>`, actions: [{ label: 'Copy', onClick: async () => { await navigator.clipboard.writeText(r.temp); toast('Copied.'); return false; } }, { label: 'Done', kind: 'primary' }] });
    }
  };
}

// ---------- centers ----------
async function centers(root, app) {
  app.setCrumbs([{ label: 'Centers & targets' }]);
  const summ = await call('dash.summary');
  const s = app.settings;
  root.innerHTML = `<div class="page-head"><div class="grow"><h1>Centers and recruitment targets</h1><p>Each center's code starts every Study ID (for example AMM01-0001), so it cannot change once patients are enrolled.</p></div><button class="btn primary" id="add">${icon('plus')}Add center</button></div>
    <div class="card" style="margin-bottom:18px"><div class="card-body row wrap"><div class="grow"><b>Registry target</b><div class="small ink2">Total patients across all centers (shown on the dashboard).</div></div><div class="with-unit" style="width:200px"><input class="input" id="rt" inputmode="numeric" value="${s.registryTarget}"><span class="unit">patients</span></div><button class="btn" id="savert">Save</button></div></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Name</th><th>City</th><th>Enrolled</th><th>Target</th><th></th></tr></thead><tbody>
      ${summ.cards.map(c => `<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${esc(c.city || '')}</td><td class="tnum">${c.enrolled}</td><td class="tnum">${c.target}</td><td style="text-align:right"><button class="btn sm" data-edit="${c.id}">${icon('edit')}Edit</button></td></tr>`).join('')}
      <tr><td colspan="3"><b>Total of center targets</b></td><td class="tnum"><b>${summ.total.enrolled}</b></td><td class="tnum"><b>${summ.cards.reduce((a, c) => a + (c.target || 0), 0)}</b></td><td></td></tr>
    </tbody></table></div></div>`;
  const dlg = c => {
    const ch = c ? { id: c.id, code: c.code, name: c.name, city: c.city || '', target: c.target } : { code: '', name: '', city: '', target: 50 };
    modal({ title: c ? `Edit ${c.code}` : 'Add a center', body: `<div class="fgrid" id="cf">
      <div class="field"><label>Center code</label><input class="input" data-k="code" data-t="text" value="${esc(ch.code)}" placeholder="AMM01" ${c && c.enrolled ? 'readonly' : ''}><div class="help">2–8 letters or numbers.${c && c.enrolled ? ' Locked: patients are enrolled.' : ''}</div></div>
      <div class="field"><label>Recruitment target</label><input class="input" data-k="target" data-t="number" value="${ch.target}"></div>
      <div class="field full"><label>Center name</label><input class="input" data-k="name" data-t="text" value="${esc(ch.name)}" placeholder="Hospital name"></div>
      <div class="field full"><label>City</label><input class="input" data-k="city" data-t="text" value="${esc(ch.city)}"></div></div>`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Save center', kind: 'primary', onClick: async () => { if (!ch.name) throw new Error('Enter the center name.'); await call('admin.saveCenter', { center: ch }); toast('Center saved.'); centers(root, app); } }],
      onOpen: back => bindFields(back.querySelector('#cf'), () => ch, () => { }) });
  };
  root.querySelector('#add').onclick = () => dlg(null);
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => dlg(summ.cards.find(c => c.id === b.dataset.edit)));
  root.querySelector('#savert').onclick = async () => { const v = parseInt(root.querySelector('#rt').value); if (!v) return toast('Enter a number.', 'bad'); const r = await call('settings.save', { changes: { registryTarget: v } }); app.settings = r.settings; toast('Registry target saved.'); };
}

// ---------- study settings ----------
async function settings(root, app) {
  app.setCrumbs([{ label: 'Study settings' }]);
  let s = JSON.parse(JSON.stringify(app.settings));
  const draw = () => {
    root.innerHTML = `<div class="page-head"><div class="grow"><h1>Study settings</h1><p>Decisions the principal investigators confirm. Changes apply immediately to everyone and are recorded in the audit log.</p></div></div>
      <div class="stack">
      <div class="card"><div class="card-head"><h2>Follow-up windows</h2></div><div class="card-body">
        <p class="ink2" style="margin-bottom:12px">Count the 30-day, 6-month and 12-month windows for inpatients from:</p>
        <div class="seg" id="wb"><button type="button" data-v="enrollment" aria-pressed="${s.windowBase !== 'discharge'}">Enrollment date</button><button type="button" data-v="discharge" aria-pressed="${s.windowBase === 'discharge'}">Discharge date (inpatients)</button></div>
        <p class="small muted" style="margin-top:10px">Windows: 30 days ±7 (day 23–37) · 6 months ±30 (day 150–210) · 12 months ±30 (day 335–395).</p></div></div>
      <div class="card"><div class="card-head"><h2>Target doses</h2><button class="btn sm ghost" id="tdreset">Restore defaults</button><button class="btn sm primary" id="tdsave">${icon('check')}Save target doses</button></div>
        <div class="card-body"><div class="callout warn" style="margin-bottom:14px">${icon('alert')}<div>Pre-loaded from current ESC guidance. Please check against the final ESC 2026 tables. <b>Total mg per day</b> is what the system uses for "% of target".</div></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Drug</th><th>Class</th><th>Total mg per day at target</th><th>As written in the guideline</th></tr></thead><tbody>
          ${s.targets.map((t, i) => `<tr><td><b style="font-weight:600">${esc(t.drug)}</b></td><td class="small ink2">${esc(CLASS_LABEL[t.cls] || t.cls)}</td><td><div class="with-unit" style="max-width:170px"><input class="input" style="height:34px" data-td="${i}" data-f="targetDaily" value="${t.targetDaily}" inputmode="decimal"><span class="unit">mg/day</span></div>${t.targetDailyHeavy ? `<div class="small muted" style="margin-top:4px">${t.targetDailyHeavy} mg/day above ${t.heavyKg} kg</div>` : ''}</td><td><input class="input" style="height:34px" data-td="${i}" data-f="label" value="${esc(t.label)}"></td></tr>`).join('')}
        </tbody></table></div></div></div>
      <div class="card"><div class="card-head"><h2>KCCQ-12 questionnaire</h2><button class="btn sm primary" id="ksave">${icon('check')}Save KCCQ settings</button></div><div class="card-body">
        <label class="check-line" style="margin-bottom:16px"><input type="checkbox" id="klic"${s.kccqLicensed ? ' checked' : ''}><span class="box">${icon('check')}</span><span><b>The license for the Arabic KCCQ-12 is confirmed.</b><div class="help">Removes the license warning from the forms.</div></span></label>
        <p class="ink2" style="margin-bottom:10px">Paste the licensed Arabic wording of each item. It appears under the item topic in the forms.</p>
        <div class="fgrid one">${KCCQ_FORM.map(q => `<div class="field"><label>${esc(q.k.toUpperCase())} · ${esc(q.topic)}</label><input class="input" dir="rtl" lang="ar" data-kq="${q.k}" value="${esc(s.kccqText?.[q.k] || '')}"></div>`).join('')}</div></div></div>
      </div>`;
    root.querySelector('#wb').onclick = async e => { const b = e.target.closest('[data-v]'); if (!b) return; const r = await call('settings.save', { changes: { windowBase: b.dataset.v } }); app.settings = s = r.settings; toast('Follow-up window rule saved.'); draw(); };
    root.querySelector('#tdsave').onclick = async () => {
      const t = JSON.parse(JSON.stringify(s.targets));
      root.querySelectorAll('[data-td]').forEach(el => { const i = +el.dataset.td; if (el.dataset.f === 'targetDaily') { const v = parseFloat(el.value); if (!v || v <= 0) throw toast(`Check the target for ${t[i].drug}.`, 'bad'); t[i].targetDaily = v; } else t[i].label = el.value; });
      const r = await call('settings.save', { changes: { targets: t } }); app.settings = s = r.settings; toast('Target doses saved. Percentages update everywhere.');
    };
    root.querySelector('#tdreset').onclick = async () => { if (await confirmDialog('Restore default target doses?', 'The ESC defaults that came with the system will replace the current list.', 'Restore')) { const r = await call('settings.save', { changes: { targets: DEFAULT_TARGETS } }); app.settings = s = r.settings; toast('Defaults restored.'); draw(); } };
    root.querySelector('#ksave').onclick = async () => { const kt = {}; root.querySelectorAll('[data-kq]').forEach(el => { if (el.value.trim()) kt[el.dataset.kq] = el.value.trim(); }); const r = await call('settings.save', { changes: { kccqText: kt, kccqLicensed: root.querySelector('#klic').checked } }); app.settings = s = r.settings; toast('KCCQ settings saved.'); };
  };
  draw();
}

// ---------- audit log ----------
async function audit(root, app) {
  app.setCrumbs([{ label: 'Audit log' }]);
  let filt = { action: '', q: '' };
  const { entries } = await call('audit.list', { limit: 2000 });
  const actions = [...new Set(entries.map(e => e.action))].sort();
  const show = v => { if (v == null || v === 'null') return '–'; const s2 = typeof v === 'string' ? v : JSON.stringify(v); return s2.length > 90 ? s2.slice(0, 90) + '…' : s2; };
  root.innerHTML = `<div class="page-head"><div class="grow"><h1>Audit log</h1><p>Every sign-in, creation, edit and deletion, with old and new values. Nobody can edit or delete these entries, not even administrators.</p></div><button class="btn" id="csv">${icon('download')}Download CSV</button></div>
    <div class="card"><div class="table-tools"><div class="search">${icon('search')}<input class="input" id="q" placeholder="Search patient, user or field"></div>
      <select class="input" id="act" style="width:auto;height:38px"><option value="">All actions</option>${actions.map(a => `<option>${esc(a)}</option>`).join('')}</select><span class="small muted" id="cnt"></span></div><div class="card-body" id="al"></div></div>`;
  const draw = () => {
    const q = filt.q.toLowerCase();
    const list = entries.filter(e => (!filt.action || e.action === filt.action) && (!q || [e.patientId, e.userName, e.field, e.recordId].some(x => String(x || '').toLowerCase().includes(q))));
    root.querySelector('#cnt').textContent = `${list.length} of ${entries.length} entries`;
    root.querySelector('#al').innerHTML = list.slice(0, 400).map(e => `<div class="audit-row"><div class="tnum ink2">${esc(e.ts.slice(0, 10).split('-').reverse().join('/'))} ${esc(e.ts.slice(11, 16))}</div><div><b style="font-weight:600">${esc(e.userName || '')}</b><div class="small muted">${esc(e.action)} · ${esc(e.table || '')}</div></div>
      <div class="chg">${e.patientId ? `<a href="#/patient/${esc(e.patientId)}/history"><b>${esc(e.patientId)}</b></a> · ` : ''}<span class="ink2">${esc(e.field || '')}</span> ${e.old != null && e.old !== 'null' ? `<span class="old">${esc(show(e.old))}</span> → ` : ''}<span class="new">${esc(show(e.new))}</span>${e.reason ? `<div class="small muted">Reason: ${esc(e.reason)}</div>` : ''}</div></div>`).join('') || '<p class="muted">No entries.</p>';
  };
  root.querySelector('#q').oninput = e => { filt.q = e.target.value; draw(); };
  root.querySelector('#act').onchange = e => { filt.action = e.target.value; draw(); };
  root.querySelector('#csv').onclick = () => {
    const cols = ['ts', 'userName', 'action', 'table', 'recordId', 'patientId', 'field', 'old', 'new', 'reason'];
    const csv = [cols.join(','), ...entries.map(e => cols.map(c => `"${String(e[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `jo-chf-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };
  draw();
}
