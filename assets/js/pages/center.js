// Center page: patient list, follow-ups due, open data queries.
import { call } from '../api.js';
import { esc, icon, statusBadge, dueBadge, fmtDateShort, debounce, fmtN } from '../ui/dom.js';

const SETTING = { inpatient: 'Inpatient', outpatient: 'Outpatient' };
const DUE_LABEL = { missed: 'Missed', open: 'Window open', soon: 'Opens within 7 days' };
const pips = n => `<span class="fmt-pips" title="${n} of 4 foundational drugs">${[0, 1, 2, 3].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span> <span class="small ink2 tnum">${n}/4</span>`;

export async function render(root, { params }, app) {
  const centerId = params[0];
  const d = await call('center.page', { centerId });
  const c = d.center;
  app.setCrumbs([{ label: 'Dashboard', href: '#/dashboard' }, { label: `${c.code} · ${c.name}` }]);
  const today = new Date().toISOString().slice(0, 10);
  const st = { q: '', status: '', sortKey: 'id', dir: -1, page: 0 };
  const PER = 25;
  const missed = d.due.filter(x => x.status === 'missed').length;
  const openW = d.due.filter(x => x.status === 'open').length;
  const canAdd = !app.isAdmin;

  root.innerHTML = `
  <div class="reveal">
    <div class="page-head">
      <div class="grow"><h1>${esc(c.name)}</h1><p>Center code <b>${esc(c.code)}</b>${c.city ? ` · ${esc(c.city)}` : ''} · Study IDs look like <b>${esc(c.code)}-0001</b>${d.showIdentifiers ? '' : ' · Patient names are hidden from administrators'}</p></div>
      ${canAdd ? `<a class="btn primary" href="#/patient/new/${c.id}">${icon('plus')}Add new patient</a>` : ''}
    </div>
    <div class="stat-row">
      <div class="stat"><div class="v">${d.patients.length}<small> / ${c.target || '–'}</small></div><div class="l">Enrolled vs target</div></div>
      <div class="stat"><div class="v">${openW}</div><div class="l">Follow-up windows open now</div></div>
      <div class="stat"><div class="v" style="color:${missed ? 'var(--bad)' : 'inherit'}">${missed}</div><div class="l">Missed visits to chase</div></div>
      <div class="stat"><div class="v">${d.queries.filter(q => q.status === 'open').length}</div><div class="l">Open data queries</div></div>
    </div>
    <div class="center-grid">
      <section class="card" aria-label="Patients">
        <div class="table-tools">
          <h2 style="margin-right:auto">Patients</h2>
          <div class="search">${icon('search')}<input class="input" id="q" placeholder="Search Study ID${d.showIdentifiers ? ', name or file number' : ''}" aria-label="Search patients"></div>
          <select class="input" id="fs" style="width:auto;height:38px" aria-label="Filter by status">
            <option value="">All statuses</option><option value="incomplete">Incomplete</option><option value="complete">Complete</option><option value="locked">Locked</option><option value="deceased">Deceased</option><option value="lost">Lost to follow-up</option><option value="withdrawn">Withdrawn</option>
          </select>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr>
          <th data-sort="id">Study ID <span class="arrow">↓</span></th>
          <th data-sort="enrollmentDate">Enrolled <span class="arrow">↕</span></th>
          <th data-sort="setting">Setting <span class="arrow">↕</span></th>
          <th data-sort="phenotype">Phenotype <span class="arrow">↕</span></th>
          <th data-sort="fmtCount">Foundational drugs <span class="arrow">↕</span></th>
          <th data-sort="nextDue">Next follow-up <span class="arrow">↕</span></th>
          <th data-sort="status">Status <span class="arrow">↕</span></th>
          <th data-sort="completeness">Data <span class="arrow">↕</span></th>
        </tr></thead><tbody id="tb"></tbody></table></div>
        <div class="pager" id="pager"></div>
      </section>
      <aside class="stack">
        <section class="card" aria-label="Follow-ups due">
          <div class="card-head"><h3>Follow-ups due</h3><a class="btn ghost xs" href="#/followups">See all</a></div>
          <div id="due">${d.due.length ? d.due.slice(0, 8).map(x => `
            <a class="due-item" href="#/patient/${x.patientId}/followup">
              <div class="when"><b style="color:${x.status === 'missed' ? 'var(--bad)' : x.status === 'open' ? 'var(--good)' : 'var(--info)'}">${x.label.split(' ')[0]}</b><span>${x.label.split(' ')[1]}</span></div>
              <div class="grow"><div style="font-weight:600">${esc(x.patientId)}${x.name ? ` <span class="pname">· ${esc(x.name)}</span>` : ''}</div>
                <div class="small ink2 tnum">${fmtDateShort(x.open)} – ${fmtDateShort(x.close)}${x.attempts ? ` · ${x.attempts} call attempt${x.attempts > 1 ? 's' : ''}` : ''}</div></div>
              <span class="badge ${x.status === 'missed' ? 'bad' : x.status === 'open' ? 'good' : 'info'}">${DUE_LABEL[x.status]}</span>
            </a>`).join('') : `<div class="empty" style="padding:28px">${icon('check')}<p>No visits due in the next 7 days.</p></div>`}</div>
        </section>
        <section class="card" aria-label="Open data queries">
          <div class="card-head"><h3>Data queries</h3><a class="btn ghost xs" href="#/queries">See all</a></div>
          <div>${d.queries.length ? d.queries.slice(0, 6).map(q => `
            <a class="due-item" href="#/patient/${q.patientId}/queries">
              <span class="badge ${q.kind === 'delete' ? 'bad' : q.status === 'open' ? 'warn' : 'info'}">${q.kind === 'delete' ? 'Delete request' : q.status === 'open' ? 'Open' : 'Answered'}</span>
              <div class="grow"><div style="font-weight:600">${esc(q.patientId)}</div><div class="small ink2" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(q.message)}</div></div>
            </a>`).join('') : `<div class="empty" style="padding:28px">${icon('check')}<p>No open queries.</p></div>`}</div>
        </section>
      </aside>
    </div>
  </div>`;

  const tb = root.querySelector('#tb'), pager = root.querySelector('#pager');
  const val = (p, k) => k === 'nextDue' ? (p.nextDue?.due || '9999') : (p[k] ?? '');
  function draw() {
    const q = st.q.toLowerCase();
    let rows = d.patients.filter(p => (!st.status || p.status === st.status) && (!q || p.id.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || (p.fileNo || '').toLowerCase().includes(q)));
    rows.sort((a, b) => { const x = val(a, st.sortKey), y = val(b, st.sortKey); return (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
    const pages = Math.max(1, Math.ceil(rows.length / PER)); st.page = Math.min(st.page, pages - 1);
    const slice = rows.slice(st.page * PER, st.page * PER + PER);
    tb.innerHTML = slice.length ? slice.map(p => `
      <tr class="clickable" data-id="${esc(p.id)}" tabindex="0">
        <td><div class="sid">${esc(p.id)}</div>${p.name ? `<div class="pname">${esc(p.name)}</div>` : ''}</td>
        <td>${fmtDateShort(p.enrollmentDate)}</td>
        <td>${SETTING[p.setting] || '–'}</td>
        <td>${p.phenotype ? `<span class="pheno ${p.phenotype}">${p.phenotype}</span> <span class="small muted tnum">${p.lvef}%</span>` : '<span class="muted">–</span>'}</td>
        <td>${pips(p.fmtCount)}</td>
        <td>${p.status === 'deceased' || p.status === 'withdrawn' ? '<span class="muted">–</span>' : dueBadge(p.nextDue)}</td>
        <td>${statusBadge(p.status)}${p.openQueries ? ` <span class="badge warn" title="Open data queries">${p.openQueries} query</span>` : ''}</td>
        <td><span class="tnum" style="color:${p.completeness < 100 ? 'var(--warn)' : 'var(--good)'};font-weight:600">${p.completeness}%</span></td>
      </tr>`).join('') : `<tr><td colspan="8"><div class="empty">${icon('search')}<h3>${d.patients.length ? 'No patients match' : 'No patients yet'}</h3><p>${d.patients.length ? 'Try a different search or status.' : (canAdd ? 'Add your first patient with the button above.' : 'This center has not enrolled patients yet.')}</p></div></td></tr>`;
    pager.innerHTML = `<span class="grow">${fmtN(rows.length)} patient${rows.length === 1 ? '' : 's'}</span>
      <button class="btn sm" data-pg="-1" ${st.page === 0 ? 'disabled' : ''}>Previous</button><span class="tnum">Page ${st.page + 1} of ${pages}</span><button class="btn sm" data-pg="1" ${st.page >= pages - 1 ? 'disabled' : ''}>Next</button>`;
    root.querySelectorAll('th[data-sort]').forEach(th => { const on = th.dataset.sort === st.sortKey; th.classList.toggle('sorted', on); th.querySelector('.arrow').textContent = on ? (st.dir > 0 ? '↑' : '↓') : '↕'; });
  }
  draw();
  root.querySelector('#q').addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 0; draw(); }, 150));
  root.querySelector('#fs').onchange = e => { st.status = e.target.value; st.page = 0; draw(); };
  root.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => { if (st.sortKey === th.dataset.sort) st.dir *= -1; else { st.sortKey = th.dataset.sort; st.dir = 1; } draw(); });
  pager.onclick = e => { const b = e.target.closest('[data-pg]'); if (b) { st.page += +b.dataset.pg; draw(); } };
  tb.onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/patient/${tr.dataset.id}`; };
  tb.onkeydown = e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/patient/${tr.dataset.id}`; } };
}
