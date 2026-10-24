// Follow-ups due and data queries, across the user's scope.
import { call } from '../api.js';
import { esc, icon, fmtDateShort, toast } from '../ui/dom.js';

export async function render(root, { name }, app) {
  return name === 'followups' ? followups(root, app) : queries(root, app);
}

async function followups(root, app) {
  app.setCrumbs([{ label: 'Follow-ups' }]);
  let items = [];
  const centers = app.isAdmin ? (await call('dash.summary')).cards : [{ id: app.user.centerId, code: app.center?.code, name: app.center?.name }];
  const pages = await Promise.all(centers.map(c => call('center.page', { centerId: c.id }).then(p => p.due.map(d => ({ ...d, center: c.code })))));
  items = pages.flat();
  let tab = 'missed';
  const counts = { missed: items.filter(i => i.status === 'missed').length, open: items.filter(i => i.status === 'open').length, soon: items.filter(i => i.status === 'soon').length };
  const draw = () => {
    const list = items.filter(i => i.status === tab).sort((a, b) => (a.close < b.close ? -1 : 1));
    root.querySelector('#fl').innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${app.isAdmin ? '<th>Center</th>' : ''}<th>Patient</th><th>Visit</th><th>Window</th><th>How</th><th>Calls</th><th></th></tr></thead><tbody>
      ${list.map(i => `<tr${app.isAdmin ? '' : ` class="clickable" data-go="${esc(i.patientId)}"`}>${app.isAdmin ? `<td><b>${esc(i.center)}</b></td>` : ''}<td><div class="sid">${esc(i.patientId)}</div>${i.name ? `<div class="pname">${esc(i.name)}${i.phone ? ` · <a href="tel:${esc(i.phone)}" onclick="event.stopPropagation()">${esc(i.phone)}</a>` : ''}</div>` : ''}</td>
        <td>${esc(i.label)}</td><td class="tnum">${fmtDateShort(i.open)} – ${fmtDateShort(i.close)}</td><td class="small ink2">${esc(i.method)}</td><td class="tnum">${i.attempts || 0}</td>
        <td>${app.isAdmin ? '' : `<a class="btn sm" href="#/patient/${esc(i.patientId)}/followup">${icon(i.status === 'missed' ? 'phone' : 'plus')}${i.status === 'missed' ? 'Call / enter' : 'Enter visit'}</a>`}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">${icon('check')}<h3>Nothing here</h3><p>${tab === 'missed' ? 'No missed visits. Well done.' : tab === 'open' ? 'No visit windows are open right now.' : 'No windows open in the next 7 days.'}</p></div>`;
    root.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
  };
  root.innerHTML = `<div class="page-head"><div class="grow"><h1>Follow-up visits due</h1><p>${app.isAdmin ? 'All centers. Names are hidden from administrators.' : 'Patients whose visit window is open, opens within 7 days, or was missed. Call them, then enter the visit.'}</p></div></div>
    <div class="card"><div class="table-tools"><div class="pill-tabs" role="tablist">
      <button role="tab" data-t="missed">Missed · ${counts.missed}</button><button role="tab" data-t="open">Window open · ${counts.open}</button><button role="tab" data-t="soon">Opens within 7 days · ${counts.soon}</button></div></div>
      <div id="fl"></div></div>`;
  root.querySelector('[role=tablist]').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
  root.querySelector('#fl').onclick = e => { const tr = e.target.closest('[data-go]'); if (tr && !e.target.closest('a')) location.hash = `#/patient/${tr.dataset.go}/followup`; };
  if (!counts.missed) tab = counts.open ? 'open' : 'soon';
  draw();
}

async function queries(root, app) {
  app.setCrumbs([{ label: 'Data queries' }]);
  const { queries: all } = await call('query.list', {});
  let tab = 'open';
  const draw = () => {
    const list = all.filter(q => (tab === 'open' ? q.status === 'open' : q.status === tab));
    root.querySelector('#ql').innerHTML = list.length ? `<div class="list-rows" style="padding:0 18px">${list.map(q => `<div style="cursor:pointer" data-go="${esc(q.patientId)}">
      <span class="badge ${q.kind === 'delete' ? 'bad' : q.status === 'open' ? 'warn' : q.status === 'answered' ? 'info' : 'good'}">${q.kind === 'delete' ? 'Delete request' : q.status}</span>
      <div class="grow"><div><b>${esc(q.patientId)}</b>${q.field ? ` · <span class="ink2">${esc(q.field)}</span>` : ''}</div><div class="small ink2">${esc(q.message)}</div>${q.thread?.length ? `<div class="small muted">Last reply: ${esc(q.thread[q.thread.length - 1].message)}</div>` : ''}</div>
      <span class="small muted tnum">${fmtDateShort(q.createdAt.slice(0, 10))}</span>${icon('arrow').replace('<svg', '<svg style="width:16px;height:16px;color:var(--muted)"')}</div>`).join('')}</div>`
      : `<div class="empty">${icon('chat')}<h3>No ${tab} queries</h3><p>${tab === 'open' ? 'Everything is answered.' : ''}</p></div>`;
    root.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
  };
  const c = s => all.filter(q => q.status === s).length;
  root.innerHTML = `<div class="page-head"><div class="grow"><h1>Data queries</h1><p>${app.isAdmin ? 'Queries you raised and deletion requests from sites. Close a query once the site has answered and corrected the value.' : 'Questions from the coordinating team about your data. Open the patient, correct the value if needed, and reply.'}</p></div></div>
    <div class="card"><div class="table-tools"><div class="pill-tabs" role="tablist"><button role="tab" data-t="open">Open · ${c('open')}</button><button role="tab" data-t="answered">Answered · ${c('answered')}</button><button role="tab" data-t="closed">Closed · ${c('closed')}</button></div></div><div id="ql"></div></div>`;
  root.querySelector('[role=tablist]').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; draw(); } };
  root.querySelector('#ql').onclick = e => { const r = e.target.closest('[data-go]'); if (r) location.hash = `#/patient/${r.dataset.go}/queries`; };
  draw();
}
