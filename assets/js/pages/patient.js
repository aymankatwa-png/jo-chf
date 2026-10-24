// Patient record: enrollment, baseline tabs, follow-up, events, outcome, journey, queries, history.
import { call } from '../api.js';
import { esc, icon, toast, modal, confirmDialog, reasonDialog, ring, animateRings, statusBadge, fmtDateShort, relDays, debounce, attr } from '../ui/dom.js';
import { field, bindFields, refreshComputed, issueMap, dateInput, CHECK } from '../ui/fields.js';
import { comorbiditiesSection, medsSection, bindMeds, drugGroupSection, kccqSection, devicesSection } from './patient-parts.js';
import * as L from '../core/logic.js';
import { TABS, VISIT_FIELDS, VISIT_LAB_FIELDS, EVENT_FIELDS, DEATH_FIELDS, DEATH_CAUSE, ADHERENCE, ADE, CALL_OUTCOME, optionLabel, allFields, SETTING, EVENT_REASON } from '../core/schema.js';

const IDENT_FIELDS = [
  { k: 'name', label: 'Full name', type: 'text', req: true },
  { k: 'phone', label: 'Patient phone', type: 'text', placeholder: '07X XXX XXXX' },
  { k: 'relativePhone', label: 'Relative phone', type: 'text', placeholder: '07X XXX XXXX' },
  { k: 'fileNo', label: 'Hospital file number', type: 'text' },
  { k: 'nationalId', label: 'National ID (optional)', type: 'text', help: 'Used only to detect duplicate enrollment and to trace vital status. Never exported.' },
];
const EXTRA_TABS = [
  { id: 'followup', label: 'Follow-up', icon: 'calendar' },
  { id: 'events', label: 'Events', icon: 'siren' },
  { id: 'outcome', label: 'Death & withdrawal', icon: 'flag' },
  { id: 'journey', label: 'Patient journey', icon: 'route' },
  { id: 'queries', label: 'Data queries', icon: 'chat' },
  { id: 'history', label: 'Change history', icon: 'history' },
];
const today = () => L.todayISO();
const clone = x => JSON.parse(JSON.stringify(x ?? null));
const draftKey = id => 'jochf-draft-' + id;
const saveDraft = (id, data) => { try { localStorage.setItem(draftKey(id), JSON.stringify({ at: Date.now(), ...data })); } catch { } };
const readDraft = id => { try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch { return null; } };
const clearDraft = id => { try { localStorage.removeItem(draftKey(id)); } catch { } };

let keep = null; // in-memory state when moving between tabs of the same patient
export async function render(root, { name, params }, app) {
  // fresh host element per render so event listeners never pile up on the shared page element
  const host = document.createElement('div');
  root.replaceChildren(host);
  if (name === 'new') return renderNew(host, params[0], app);
  return renderRecord(host, params[0], params[1] || 'enrollment', app);
}

// ========================= NEW PATIENT =========================
async function renderNew(root, centerId, app) {
  if (app.isAdmin) { root.innerHTML = `<div class="empty">${icon('lock')}<h3>Patients are added by site teams</h3><p>Administrators see de-identified data only.</p></div>`; return; }
  const center = app.center;
  app.setCrumbs([{ label: 'Dashboard', href: '#/dashboard' }, { label: center ? `${center.code} · ${center.name}` : 'Center', href: `#/center/${centerId}` }, { label: 'New patient' }]);
  const dk = 'new-' + centerId;
  const draft = readDraft(dk);
  const rec = draft?.rec || { enrollment: { enrollmentDate: today(), inclusion: {}, exclusion: {} }, clinical: {} };
  const ident = draft?.ident || {};
  const enrollTab = TABS[0];

  function draw() {
    const elig = L.eligibility(rec.enrollment);
    const issues = issueMap(L.dateIssues(rec, today()));
    const ctx = { obj: rec, issues, showMissing: true };
    root.innerHTML = `
      <div class="page-head"><div class="grow"><h1>Add a new patient</h1><p>Check eligibility, record consent and enter the patient's identifiers. The Study ID is created when you press <b>Enroll patient</b>. You can fill the rest of the record afterwards, in any order.</p></div></div>
      ${draft ? `<div class="callout" style="margin-bottom:16px">${icon('info')}<div>We restored your unsaved entry from this device. <button class="linkbtn" id="discard">Start again</button></div></div>` : ''}
      <div class="card">
        ${enrollTab.sections.map(s => `<section class="form-section ${s.tone === 'danger' ? 'danger-zone' : ''}"><h3>${esc(s.title)}</h3>${s.help ? `<p class="help">${esc(s.help)}</p>` : ''}<div class="fgrid ${s.fields[0].type === 'check' ? 'one' : ''}">${s.fields.filter(f => f.type !== 'readonly').map(f => field(f, ctx)).join('')}</div></section>`).join('')}
        <section class="form-section"><h3>Setting</h3><div class="fgrid">${field(TABS[2].sections[0].fields[0], ctx)}</div></section>
        <section class="form-section"><h3>${icon('lock').replace('<svg', '<svg style="width:16px;height:16px"')} Patient identifiers</h3><p class="help">Encrypted. Visible only to your center. Never shown to administrators and never exported.</p>
          <div class="fgrid" id="ident">${IDENT_FIELDS.map(f => field(f, { obj: ident })).join('')}</div><div id="dup"></div></section>
        <div class="save-bar">
          <div class="grow">${!elig.consent ? `<span class="badge bad">${icon('alert').replace('<svg', '<svg style="width:12px;height:12px"')} Consent date needed</span>` : elig.hitExc.length ? `<span class="badge bad">Excluded: ${esc(elig.hitExc[0].label)}</span>` : elig.failedInc.length ? `<span class="badge warn">${elig.failedInc.length} inclusion criteria not ticked</span>` : `<span class="badge good">${icon('check').replace('<svg', '<svg style="width:12px;height:12px"')} Eligible</span>`}</div>
          <a class="btn ghost" href="#/center/${centerId}">Cancel</a>
          <button class="btn primary" id="enroll" ${elig.eligible && ident.name && rec.clinical?.setting ? '' : 'disabled'}>${icon('check')}Enroll patient</button>
        </div>
      </div>`;
    root.querySelector('#discard')?.addEventListener('click', () => { clearDraft(dk); renderNew(root, centerId, app); });
    root.querySelector('#enroll').onclick = () => enroll(false);
  }
  const onChange = debounce(() => { saveDraft(dk, { rec, ident }); }, 300);
  bindFields(root, () => rec, (k, o) => { onChange(); if (o.structural || k.startsWith('enrollment.')) redraw(); });
  const identBox = () => root.querySelector('#ident');
  root.addEventListener('input', e => { if (identBox()?.contains(e.target) && e.target.dataset.k) { ident[e.target.dataset.k] = e.target.value; onChange(); updateBtn(); if (['nationalId', 'fileNo'].includes(e.target.dataset.k)) dupCheck(); } }, true);
  let redrawT; const redraw = () => { clearTimeout(redrawT); redrawT = setTimeout(() => { const y = scrollY; const a = document.activeElement?.id; draw(); scrollTo(0, y); if (a) document.getElementById(a)?.focus(); }, 0); };
  function updateBtn() { const elig = L.eligibility(rec.enrollment); root.querySelector('#enroll').disabled = !(elig.eligible && ident.name && rec.clinical?.setting); }
  const dupCheck = debounce(async () => {
    const r = await call('patient.checkDuplicate', { centerId, ident }).catch(() => null);
    root.querySelector('#dup').innerHTML = r?.duplicate ? `<div class="callout warn" style="margin-top:12px">${icon('alert')}<div><b>Possible duplicate.</b> A patient with this national ID or file number may already be in the registry. Check before enrolling (Jo-CHF does not allow enrolling the same patient twice).</div></div>` : '';
  }, 600);
  async function enroll(force) {
    const btn = root.querySelector('#enroll'); btn.disabled = true;
    try {
      const r = await call('patient.create', { centerId, data: rec, ident, force });
      if (r.duplicate) {
        btn.disabled = false;
        const ok = await confirmDialog('Possible duplicate patient', 'A patient with the same national ID or hospital file number already exists in the registry. Enroll anyway only if you are sure this is a different person.', 'Enroll anyway', 'danger');
        if (ok) return enroll(true); return;
      }
      clearDraft(dk);
      toast(`Patient enrolled as ${r.id}.`);
      location.hash = `#/patient/${r.id}/demographics`;
    } catch (e) { toast(e.message, 'bad', 6000); btn.disabled = false; }
  }
  draw();
}

// ========================= EXISTING RECORD =========================
async function renderRecord(root, id, tab, app) {
  const data = await call('patient.get', { id });
  const s = app.settings;
  const targets = s.targets;
  let server = data.patient;
  let rec = clone(server);
  let ident = clone(data.ident) || {};
  let dirty = false, saving = false, lastError = null, showMissing = false;
  const canEdit = () => !server.locked && !(app.isAdmin);
  const isSite = !app.isAdmin;

  const draft = readDraft(id);
  let restored = false;
  if (keep && keep.id === id && keep.version === server.version) { if (keep.dirty) { rec = keep.rec; ident = keep.ident; dirty = true; } }
  else if (draft && draft.version === server.version && JSON.stringify(draft.rec) !== JSON.stringify(rec)) { rec = draft.rec; ident = draft.ident || ident; dirty = true; restored = true; }
  keep = null;

  const allTabs = () => {
    const base = TABS.filter(t => !t.show || t.show(rec));
    const out = [base[0]];
    if (isSite) out.push({ id: 'identifiers', label: 'Identifiers', icon: 'lock' });
    return [...out, ...base.slice(1)];
  };
  const crumbs = () => app.setCrumbs([{ label: 'Dashboard', href: '#/dashboard' }, ...(app.isAdmin || app.user.centerId === server.centerId ? [{ label: server.centerId === app.center?.id ? `${app.center.code} · ${app.center.name}` : 'Center', href: `#/center/${server.centerId}` }] : []), { label: server.id }]);
  crumbs();

  // ---------- header ----------
  function header() {
    const d = server.derived || {};
    const st = L.recordStatus(server);
    const comp = L.completeness(rec).pct;
    const s4 = L.gdmtSummary(L.currentMeds(rec, data.visits, data.titrations), targets, rec.demographics?.weight);
    const kc = L.kccqScores(rec.kccq)?.summary;
    return `<div class="p-head">
      <div>
        <div class="row wrap" style="gap:12px"><span class="p-id">${esc(server.id)}</span>${statusBadge(st)}${d.phenotype ? `<span class="pheno ${d.phenotype}">${d.phenotype}</span>` : ''}</div>
        ${ident?.name ? `<div class="p-name">${icon('lock')}${esc(ident.name)}${ident.fileNo ? ` · File ${esc(ident.fileNo)}` : ''}</div>` : ''}
        <div class="p-meta small ink2">
          ${d.age != null ? `<span>${d.age} y</span><span class="sep"></span>` : ''}${rec.demographics?.sex ? `<span>${rec.demographics.sex === 'M' ? 'Male' : 'Female'}</span><span class="sep"></span>` : ''}
          ${rec.clinical?.setting ? `<span>${optionLabel(SETTING, rec.clinical.setting)}</span><span class="sep"></span>` : ''}
          ${rec.clinical?.nyha ? `<span>NYHA ${rec.clinical.nyha}</span><span class="sep"></span>` : ''}
          ${rec.echo?.lvef != null ? `<span>LVEF ${rec.echo.lvef}%</span><span class="sep"></span>` : ''}
          <span>Enrolled ${fmtDateShort(rec.enrollment?.enrollmentDate)} by ${esc(rec.enrollment?.investigator || '–')}</span>
        </div>
      </div>
      <div class="row wrap" style="gap:18px;justify-content:flex-end">
        <div class="p-gauges">
          <div class="gauge-mini">${ring(comp, 54, 5, comp === 100 ? 'var(--s3)' : 'var(--s4)')}<div class="l">Required data</div></div>
          <div class="gauge-mini">${ring(s4.count * 25, 54, 5, 'var(--navy)', s4.count + '/4')}<div class="l">Foundational drugs now</div></div>
          <div class="gauge-mini">${ring(kc ?? 0, 54, 5, 'var(--s1)', kc == null ? '–' : Math.round(kc))}<div class="l">KCCQ baseline</div></div>
        </div>
        <div class="row" style="gap:6px">
          ${!server.complete && canEdit() ? `<button class="btn primary sm" id="complete">${icon('check')}Mark complete</button>` : ''}
          ${app.isAdmin ? `<button class="btn sm" id="lock">${icon(server.locked ? 'unlock' : 'lock')}${server.locked ? 'Unlock' : 'Lock'}</button><button class="btn sm danger" id="del" aria-label="Delete record">${icon('trash')}</button>` : `<button class="btn sm ghost" id="reqdel" title="Ask administrators to delete this record">${icon('trash')}</button>`}
        </div>
      </div>
    </div>`;
  }

  // ---------- tab nav ----------
  function tabNav() {
    const comp = L.completeness(rec);
    const missFor = t => {
      if (!t.sections) return null;
      const keys = t.sections.flatMap(s => s.fields || []).map(f => f.k);
      if (t.id === 'meds') keys.push('baselineMeds');
      if (t.id === 'investigations') keys.push('labs.natriuretic');
      return comp.missing.filter(m => keys.includes(m)).length;
    };
    const link = t => { const m = missFor(t); return `<a href="#/patient/${server.id}/${t.id}" ${t.id === tab ? 'aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span>${m == null ? '' : m ? `<span class="tick miss" title="${m} required field(s) empty">${m}</span>` : '<span class="tick ok">✓</span>'}</a>`; };
    const openQ = data.queries.filter(q => q.status === 'open').length;
    return `<nav class="tabs-v" aria-label="Record sections">${allTabs().map(link).join('')}<div class="divider"></div>${EXTRA_TABS.map(t => `<a href="#/patient/${server.id}/${t.id}" ${t.id === tab ? 'aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span>${t.id === 'queries' && openQ ? `<span class="tick miss">${openQ}</span>` : ''}${t.id === 'followup' ? visitDots() : ''}</a>`).join('')}</nav>`;
  }
  function visitDots() {
    const sc = L.visitSchedule(server, data.visits, s, today());
    const c = { done: 'var(--s3)', open: 'var(--s1)', missed: 'var(--bad)', ltfu: 'var(--bad)', soon: 'var(--s1)' };
    return `<span style="margin-left:auto;display:inline-flex;gap:3px">${sc.map(v => `<i style="width:7px;height:7px;border-radius:50%;background:${c[v.status] || 'var(--line-2)'}"></i>`).join('')}</span>`;
  }

  // ---------- main draw ----------
  function draw() {
    root.innerHTML = `
      ${restored ? `<div class="callout" style="margin-bottom:14px">${icon('info')}<div>Unsaved changes from this device were restored. Press <b>Save</b> to keep them, or <button class="linkbtn" id="drop-draft">discard them</button>.</div></div>` : ''}
      ${server.locked ? `<div class="callout" style="margin-bottom:14px">${icon('lock')}<div><b>Locked.</b> This record was cleaned and locked by an administrator. ${app.isAdmin ? 'Unlock it to allow changes.' : 'Ask an administrator to unlock it if something must change.'}</div></div>` : ''}
      ${server.death ? `<div class="callout bad" style="margin-bottom:14px">${icon('flag')}<div><b>Deceased</b> on ${fmtDateShort(server.death.date)}. Future follow-up visits are cancelled.</div></div>` : ''}
      ${header()}
      <div class="p-layout">${tabNav()}<div id="tabbody"></div></div>`;
    root.querySelector('#drop-draft')?.addEventListener('click', () => { clearDraft(id); restored = false; rec = clone(server); ident = clone(data.ident) || {}; dirty = false; draw(); });
    wireHeader();
    drawTab();
    animateRings(root);
  }
  function wireHeader() {
    root.querySelector('#complete')?.addEventListener('click', markComplete);
    root.querySelector('#lock')?.addEventListener('click', async () => { await call('patient.lock', { id, locked: !server.locked }); toast(server.locked ? 'Record unlocked.' : 'Record locked.'); await reload(); });
    root.querySelector('#del')?.addEventListener('click', async () => {
      const r = await reasonDialog('Delete this record?', 'The patient will be removed from the registry and from all analyses. The audit log keeps a trace of this action.', 'Delete record');
      if (r) { await call('patient.delete', { id, reason: r }); toast('Record deleted.'); location.hash = `#/center/${server.centerId}`; }
    });
    root.querySelector('#reqdel')?.addEventListener('click', async () => {
      const r = await reasonDialog('Request deletion', 'Only administrators can delete records. Explain why this record should be deleted (for example: enrolled twice by mistake).', 'Send request');
      if (r) { await call('query.create', { patientId: id, message: r, kind: 'delete' }); toast('Deletion request sent to the administrators.'); await reload(); }
    });
  }

  // ---------- tab content ----------
  function drawTab() {
    const body = root.querySelector('#tabbody');
    const t = allTabs().find(x => x.id === tab);
    if (t?.id === 'identifiers') return drawIdent(body);
    if (t) return drawForm(body, t);
    const extra = { followup: drawFollowup, events: drawEvents, outcome: drawOutcome, journey: drawJourney, queries: drawQueries, history: drawHistory }[tab];
    if (extra) return extra(body);
    tab = 'enrollment'; drawTab();
  }
  function saveBar() {
    const st = lastError ? 'error' : dirty ? 'dirty' : '';
    const label = saving ? 'Saving…' : lastError ? 'Not saved: ' + lastError : dirty ? 'Unsaved changes (kept on this device)' : 'All changes saved';
    return `<div class="save-bar"><span class="save-state ${st}" id="savestate"><span class="dot"></span>${esc(label)}</span><span class="grow"></span>
      ${canEdit() ? `<button class="btn primary" id="save" ${dirty && !saving ? '' : 'disabled'}>${icon('check')}Save</button>` : ''}</div>`;
  }
  function updateSaveBar() { const sb = root.querySelector('.save-bar'); if (sb) sb.outerHTML = saveBar(); root.querySelector('#save')?.addEventListener('click', () => save()); }

  function sectionHTML(sec, ctx) {
    const title = sec.dynamicTitle ? sec.dynamicTitle(rec) : sec.title;
    let inner;
    switch (sec.type) {
      case 'comorbidities': inner = comorbiditiesSection(rec, ctx.readonly); break;
      case 'meds': inner = medsSection(sec, rec, { readonly: ctx.readonly, targets }); break;
      case 'titration': inner = titrationHTML(); break;
      case 'drugGroup': inner = drugGroupSection(sec, rec, ctx.readonly); break;
      case 'kccq': inner = kccqSection(sec.path, rec, ctx.readonly, s); break;
      case 'devices': inner = devicesSection(rec, ctx.readonly); break;
      default: inner = `<div class="fgrid ${sec.fields[0]?.type === 'check' && sec.fields.every(f => f.type === 'check') ? 'one' : ''}">${sec.fields.map(f => field(f, ctx)).join('')}</div>`;
    }
    return `<section class="form-section ${sec.tone === 'danger' ? 'danger-zone' : ''}"><h3>${esc(title)}</h3>${sec.help ? `<p class="help">${esc(sec.help)}</p>` : ''}${inner}</section>`;
  }
  function currentIssues() { return issueMap([...L.rangeIssues(rec), ...L.dateIssues(rec, today())]); }
  function drawForm(body, t) {
    const ctx = { obj: rec, issues: currentIssues(), readonly: !canEdit(), showMissing: true };
    const qs = data.queries.filter(q => q.status === 'open' && q.field && t.sections.some(s2 => (s2.fields || []).some(f => f.k === q.field)));
    body.innerHTML = `<div class="card">
      ${qs.map(q => `<div class="callout warn" style="margin:16px 22px 0">${icon('chat')}<div><b>Data query on ${esc(fieldLabel(q.field))}:</b> ${esc(q.message)} <a href="#/patient/${id}/queries">Answer</a></div></div>`).join('')}
      ${t.sections.map(sec => sectionHTML(sec, ctx)).join('')}
      ${saveBar()}</div>`;
    body.querySelector('#save')?.addEventListener('click', () => save());
    if (t.id === 'meds') wireTitration(body);
  }
  function fieldLabel(k) { return allFields().find(f => f.k === k)?.label || k; }

  function drawIdent(body) {
    const ctx = { obj: ident, readonly: !canEdit() };
    body.innerHTML = `<div class="card"><section class="form-section"><h3>${icon('lock').replace('<svg', '<svg style="width:16px;height:16px"')} Patient identifiers</h3>
      <p class="help">Stored encrypted and separate from clinical data. Visible only to users of this center. Administrators see only the Study ID. Never included in exports.</p>
      <div class="fgrid" id="identf">${IDENT_FIELDS.map(f => field(f, ctx)).join('')}</div></section>${saveBar()}</div>`;
    body.querySelector('#identf').addEventListener('input', e => { const k = e.target.dataset.k; if (k) { ident[k] = e.target.value; markDirty(); } });
    body.querySelector('#save')?.addEventListener('click', () => save());
  }

  // ---------- change handling + autosave ----------
  const persistDraft = debounce(() => saveDraft(id, { version: server.version, rec, ident }), 400);
  const autoSave = debounce(() => { if (dirty && !server.complete && canEdit() && !Object.values(currentIssues()).some(i => i.level === 'error')) save({ auto: true }); }, 5000);
  function markDirty() { dirty = true; lastError = null; persistDraft(); autoSave(); const ss = root.querySelector('#savestate'); if (ss && !ss.classList.contains('dirty')) updateSaveBar(); }
  bindFields(root, () => rec, (k, o) => {
    if (root.querySelector('#identf')?.contains(document.activeElement) && !k.includes('.')) return;
    markDirty();
    if (k === 'hosp.death' && L.getPath(rec, k) === 'yes' && !server.death) setTimeout(() => openDeath(), 50);
    if (o.structural) { const y = scrollY; const a = document.activeElement; const aid = a?.dataset?.k; draw(); scrollTo(0, y); if (aid && a.tagName !== 'BUTTON') root.querySelector(`[data-k="${aid}"]`)?.focus(); }
    else {
      const body = root.querySelector('#tabbody');
      const t = allTabs().find(x => x.id === tab);
      if (t?.sections) refreshComputed(body, t.sections.flatMap(x => x.fields || []), rec);
      // live validation message for this field only
      const fEl = body.querySelector(`[data-field="${CSS.escape(k)}"]`);
      if (fEl) {
        const iss = currentIssues()[k];
        fEl.classList.toggle('has-error', iss?.level === 'error');
        fEl.querySelectorAll('.err,.warnmsg').forEach(x => x.remove());
        if (iss) fEl.insertAdjacentHTML('beforeend', `<div class="${iss.level === 'error' ? 'err' : 'warnmsg'}">${esc(iss.msg)}</div>`);
        if (L.isFilled(L.getPath(rec, k))) fEl.classList.remove('missing');
      }
    }
  });
  bindMeds(root, () => rec, (k, o) => { markDirty(); const y = scrollY; draw(); scrollTo(0, y); }, targets);

  async function save(opts = {}) {
    if (saving || !dirty) return;
    const errs = Object.values(currentIssues()).filter(i => i.level === 'error');
    if (errs.length) { lastError = errs[0].msg; updateSaveBar(); if (!opts.auto) toast(errs[0].msg, 'bad', 5000); return; }
    let reason = null;
    if (server.complete) { reason = await reasonDialog('Reason for change', 'This record is marked complete. Every change after completion needs a reason for the audit trail.'); if (!reason) return; }
    saving = true; updateSaveBar();
    try {
      const r = await call('patient.save', { id, data: rec, ident: isSite ? ident : undefined, version: server.version, reason });
      dirty = false; lastError = null; restored = false; clearDraft(id);
      if (r.warnings?.length && !opts.auto) toast(r.warnings[0].msg, 'info', 6000);
      if (!opts.auto) toast(r.unchanged ? 'Nothing to save.' : 'Saved.');
      const fresh = await call('patient.get', { id });
      Object.assign(data, fresh); server = fresh.patient;
      if (!dirty) { rec = clone(server); ident = clone(fresh.ident) || {}; }
      saving = false;
      const y = scrollY; draw(); scrollTo(0, y);
    } catch (e) {
      saving = false; lastError = e.message; updateSaveBar();
      if (e.code === 'CONFLICT') { const ok = await confirmDialog('Record changed elsewhere', e.message + ' Your changes stay on this device as a draft.', 'Reload now'); if (ok) { clearDraft(id); await reload(); } }
      else if (!opts.auto || e.code !== 'NETWORK') toast(e.message, 'bad', 6000);
    }
  }
  async function reload() { const fresh = await call('patient.get', { id }); Object.assign(data, fresh); server = fresh.patient; rec = clone(server); ident = clone(fresh.ident) || {}; dirty = false; draw(); }

  async function markComplete() {
    if (dirty) await save();
    if (dirty) return;
    try { await call('patient.complete', { id }); toast('Record marked complete.'); await reload(); }
    catch (e) {
      if (e.code === 'INCOMPLETE') {
        const list = e.details.blockers.slice(0, 40);
        const tabFor = p => { if (p.startsWith('baselineReasons') || p === 'baselineMeds') return 'meds'; if (p.startsWith('hosp')) return 'hosp'; const t = TABS.find(t2 => t2.sections.some(sec => (sec.fields || []).some(f => f.k === p))); return t?.id || (p === 'labs.natriuretic' ? 'investigations' : 'enrollment'); };
        modal({
          title: 'A few things are still needed', wide: true,
          body: `<p class="ink2">Fill these fields, or mark them <b>Not done</b> / <b>Unknown</b>. Click an item to go there.</p><div class="list-rows">${list.map(b => `<div><span class="badge warn">${esc(TABS.find(t2 => t2.id === tabFor(b.path))?.label || tabFor(b.path))}</span><a href="#/patient/${id}/${tabFor(b.path)}" class="grow" data-close>${esc(fieldLabel(b.path) === b.path ? (b.path === 'labs.natriuretic' ? 'NT-proBNP or BNP' : b.path === 'baselineMeds' ? 'Confirm that all HF medicines are recorded' : b.path) : fieldLabel(b.path))}</a><span class="small ink2">${esc(b.msg)}</span></div>`).join('')}</div>`,
          actions: [{ label: 'OK', kind: 'primary' }],
          onOpen: back => back.addEventListener('click', ev => { if (ev.target.closest('[data-close]')) back.querySelector('[data-a]').click(); }),
        });
      } else toast(e.message, 'bad', 6000);
    }
  }

  // ---------- titration log ----------
  function titrationHTML() {
    const list = [...data.titrations].sort((a, b) => (a.date < b.date ? 1 : -1));
    const CH = { start: 'Start', increase: 'Increase', decrease: 'Decrease', stop: 'Stop', switch: 'Switch' };
    return `<p class="help">Record each change between visits. The next visit's medication list is pre-filled from this log, so you enter things only once.</p>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Drug</th><th>Change</th><th>New dose</th><th>Reason</th><th></th></tr></thead><tbody>
        ${list.map(t => `<tr><td>${fmtDateShort(t.date)}</td><td><b style="font-weight:600">${esc(t.drug)}</b>${t.fromDrug ? `<div class="small muted">from ${esc(t.fromDrug)}</div>` : ''}</td><td><span class="badge ${t.change === 'increase' || t.change === 'start' ? 'good' : t.change === 'stop' || t.change === 'decrease' ? 'warn' : 'info'}">${CH[t.change]}</span></td><td class="tnum">${t.change === 'stop' ? '–' : `${t.dose ?? ''} mg ${L.FREQ_LABEL[t.freq] || ''}`}</td><td class="small ink2">${esc(t.reason || '')}</td><td>${canEdit() ? `<button class="btn ghost xs" data-tdel="${t.id}" aria-label="Remove entry">${icon('trash')}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small" style="margin:6px 0 10px">No changes logged yet.</p>'}
      ${canEdit() ? `<button class="btn sm" id="tadd" style="margin-top:10px">${icon('plus')}Log a medication change</button>` : ''}`;
  }
  function wireTitration(body) {
    body.querySelector('#tadd')?.addEventListener('click', () => titrationDialog());
    body.querySelectorAll('[data-tdel]').forEach(b => b.onclick = async () => { if (await confirmDialog('Remove this entry?', 'The change will be removed from the medication timeline.', 'Remove', 'danger')) { await call('titration.delete', { patientId: id, id: b.dataset.tdel, reason: 'Removed by user' }); toast('Entry removed.'); await reload(); } });
  }
  function titrationDialog() {
    const e = { date: today(), change: 'increase', freq: 'od' };
    const drugs = targets.map(t => [t.drug, `${t.drug} (${L.CLASS_LABEL[L.foundationalGroup(t.cls)]})`]);
    const cur = L.currentMeds(rec, data.visits, data.titrations);
    modal({
      title: 'Log a medication change',
      body: `<div class="callout">${icon('pill')}<div>Current foundational drugs: ${cur.length ? cur.map(m => `<b>${esc(m.drug)}</b> ${m.dose ?? '?'} mg ${esc(m.freq || '')}`).join(', ') : 'none recorded'}.</div></div>
        <div class="fgrid" id="tf">
          <div class="field"><label>Date</label>${dateInput('t_date', 'date', e.date)}</div>
          <div class="field"><label>Type of change</label><select class="input" data-k="change" data-t="select">${[['start', 'Start'], ['increase', 'Increase'], ['decrease', 'Decrease'], ['stop', 'Stop'], ['switch', 'Switch to another drug']].map(([a, b]) => `<option value="${a}"${a === e.change ? ' selected' : ''}>${b}</option>`).join('')}</select></div>
          <div class="field"><label>Drug</label><select class="input" data-k="drug" data-t="select"><option value="">Choose…</option>${drugs.map(([a, b]) => `<option value="${esc(a)}">${esc(b)}</option>`).join('')}</select></div>
          <div class="field" data-switch><label>Switching from</label><select class="input" data-k="fromDrug" data-t="select"><option value="">Choose…</option>${cur.map(m => `<option>${esc(m.drug)}</option>`).join('')}</select></div>
          <div class="field" data-dose><label>New dose each time</label><div class="with-unit"><input class="input" inputmode="decimal" data-k="dose" data-t="number"><span class="unit">mg</span></div></div>
          <div class="field" data-dose><label>How often</label><select class="input" data-k="freq" data-t="select">${[['od', 'Once daily'], ['bd', 'Twice daily'], ['tds', 'Three times daily']].map(([a, b]) => `<option value="${a}">${b}</option>`).join('')}</select></div>
          <div class="field full"><label>Reason</label><input class="input" data-k="reason" data-t="text" placeholder="For example: up-titration as tolerated, hyperkalemia, symptomatic hypotension"></div>
        </div>`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Save change', kind: 'primary', onClick: async () => { if (!e.drug) throw new Error('Choose the drug.'); if (e.change !== 'stop' && !e.dose) throw new Error('Enter the new dose.'); await call('titration.save', { patientId: id, entry: e }); toast('Change logged.'); await reload(); } }],
      onOpen: back => {
        const tf = back.querySelector('#tf');
        const vis = () => { back.querySelector('[data-switch]').classList.toggle('hide', e.change !== 'switch'); back.querySelectorAll('[data-dose]').forEach(x => x.classList.toggle('hide', e.change === 'stop')); };
        vis(); bindFields(tf, () => e, () => vis());
      },
    });
  }

  // ---------- follow-up ----------
  function drawFollowup(body) {
    const sched = L.visitSchedule(server, data.visits, s, today());
    const ST = { done: ['good', 'Done'], open: ['good', 'Window open now'], soon: ['info', 'Opens within 7 days'], upcoming: ['', 'Upcoming'], missed: ['bad', 'Missed'], ltfu: ['bad', 'Lost to follow-up'], cancelled: ['', 'Cancelled'], unknown: ['', 'Set enrollment date'] };
    body.innerHTML = `<div class="card pad">
      <div class="row wrap" style="margin-bottom:14px"><h2 class="grow">Follow-up visits</h2><span class="small ink2">Windows counted from the ${s.windowBase === 'discharge' && rec.clinical?.setting === 'inpatient' ? 'discharge' : 'enrollment'} date (${fmtDateShort(L.windowBaseDate(server, s))})</span></div>
      <div class="visits">${sched.map(v => {
        const [k, l] = ST[v.status] || ['', v.status];
        const rec2 = v.record;
        return `<div class="vcard st-${v.status}">
          <h3>${esc(v.label)} <span class="badge ${k}" style="margin-left:auto">${l}</span></h3>
          <div class="win">Target ${fmtDateShort(v.due)} · window ${fmtDateShort(v.open)} – ${fmtDateShort(v.close)}<br>${esc(v.method)}</div>
          ${rec2?.status === 'done' ? `<div class="small"><b>${fmtDateShort(rec2.date)}</b> · ${rec2.method === 'phone' ? 'Phone' : 'Clinic'} · ${rec2.vital === 'alive' ? `NYHA ${rec2.nyha || '–'}` : esc(rec2.vital)}${rec2.kccqScores?.summary != null ? ` · KCCQ ${Math.round(rec2.kccqScores.summary)}` : ''}</div>
            <div class="gdmt-summary">${L.FOUNDATIONAL.map(g => { const ss = L.gdmtSummary(rec2.meds, targets, rec2.weight || rec.demographics?.weight); return `<span class="gdmt-pill ${ss.per[g] ? 'on' : ''}" style="font-size:11.5px;padding:3px 8px">${L.SHORT_LABEL[g]}</span>`; }).join('')}</div>` : ''}
          ${rec2?.attempts?.length ? `<div class="small ink2">${rec2.attempts.length} contact attempt${rec2.attempts.length > 1 ? 's' : ''}: ${rec2.attempts.slice(-3).map(a => `${fmtDateShort(a.date)} ${esc(optionLabel(CALL_OUTCOME, a.outcome))}`).join(' · ')}</div>` : ''}
          <div class="row wrap" style="margin-top:auto">
            ${canEdit() && !['cancelled', 'upcoming', 'unknown'].includes(v.status) ? `<button class="btn ${rec2?.status === 'done' ? '' : 'primary'} sm" data-visit="${v.key}">${icon(rec2?.status === 'done' ? 'edit' : 'plus')}${rec2?.status === 'done' ? 'Edit visit' : 'Enter visit'}</button>` : ''}
            ${canEdit() && ['open', 'missed', 'soon'].includes(v.status) ? `<button class="btn sm" data-call="${v.key}">${icon('phone')}Log call</button>` : ''}
            ${canEdit() && v.status === 'missed' && new Set((rec2?.attempts || []).filter(a => a.outcome !== 'reached').map(a => a.date)).size >= 3 ? `<button class="btn sm danger" data-lost="${v.key}">Mark lost</button>` : ''}
            ${!canEdit() && rec2?.status === 'done' ? `<button class="btn sm" data-visit="${v.key}">View</button>` : ''}
          </div>
        </div>`;
      }).join('')}</div>
      <p class="small muted" style="margin-top:14px">After three unsuccessful calls on different days you can mark the visit as lost to follow-up. Then check vital status in the hospital records. The patient can still be reached at the next visit window.</p>
    </div>`;
    body.querySelectorAll('[data-visit]').forEach(b => b.onclick = () => openVisit(b.dataset.visit));
    body.querySelectorAll('[data-call]').forEach(b => b.onclick = () => openCall(b.dataset.call));
    body.querySelectorAll('[data-lost]').forEach(b => b.onclick = async () => { if (await confirmDialog('Mark lost to follow-up?', 'This visit will be classified as lost to follow-up. Please check vital status in the hospital records.', 'Mark lost', 'danger')) { await call('visit.markLost', { patientId: id, visitKey: b.dataset.lost }); toast('Visit marked lost to follow-up.'); await reload(); } });
  }
  function openCall(key) {
    const a = { date: today(), time: new Date().toTimeString().slice(0, 5), number: 'Patient mobile', outcome: 'noanswer' };
    modal({
      title: 'Log a contact attempt', body: `<div class="fgrid" id="cf">
        <div class="field"><label>Date</label>${dateInput('c_date', 'date', a.date)}</div>
        <div class="field"><label>Time</label><input class="input" data-k="time" data-t="text" value="${a.time}"></div>
        <div class="field"><label>Number called</label><select class="input" data-k="number" data-t="select"><option>Patient mobile</option><option>Relative</option><option>Other</option></select></div>
        <div class="field"><label>Outcome</label><select class="input" data-k="outcome" data-t="select">${CALL_OUTCOME.map(([x, y]) => `<option value="${x}">${y}</option>`).join('')}</select></div></div>`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Save attempt', kind: 'primary', onClick: async () => { const r = await call('visit.attempt', { patientId: id, visitKey: key, attempt: a }); toast(r.canMarkLost ? 'Saved. Three unsuccessful attempts recorded: you can now mark this visit lost.' : 'Contact attempt saved.', 'ok', 5000); await reload(); } }],
      onOpen: back => bindFields(back.querySelector('#cf'), () => a, () => { }),
    });
  }
  function openVisit(key) {
    const V = L.VISITS.find(x => x.key === key);
    const existing = data.visits.find(x => x.visit === key);
    const v = existing?.status === 'done' ? clone(existing) : { ...(existing ? clone(existing) : {}), visit: key, date: undefined, meds: L.currentMeds(rec, data.visits, data.titrations), reasons: {}, labs: {} };
    const ro = !canEdit();
    const isKccq = key !== 'd30';
    const renderBody = el => {
      const ctx = { obj: v, readonly: ro, issues: issueMap(L.rangeIssues(v, L.VISIT_RANGE_RULES)), ndAllowed: false };
      const alive = v.vital === 'alive';
      el.innerHTML = `
        <div class="callout">${icon('calendar')}<div>Window ${fmtDateShort(L.addDays(L.windowBaseDate(server, s), V.lo))} – ${fmtDateShort(L.addDays(L.windowBaseDate(server, s), V.hi))} · ${esc(V.method)}</div></div>
        <div class="fgrid">${VISIT_FIELDS.map(f => field(f, ctx)).join('')}</div>
        ${v.vital === 'dead' ? `<div class="callout bad">${icon('flag')}<div>After saving, the death form opens so you can record the date and cause.</div></div>` : ''}
        ${alive ? `<h3 style="margin-top:20px">Medicines now</h3><p class="small ink2">Pre-filled from the last visit and the titration log. Adjust anything that changed.</p>
          ${medsSection({ path: 'meds', reasons: 'reasons' }, v, { readonly: ro, targets, weight: v.weight || rec.demographics?.weight })}
          <div class="fgrid" style="margin-top:14px">
            <div class="field"><span class="lbl">Self-reported adherence</span><div class="seg">${ADHERENCE.map(([a, b]) => `<button type="button" data-k="adherence" data-t="seg" data-v="${a}" aria-pressed="${v.adherence === a}"${attr('disabled', ro)}>${b}</button>`).join('')}</div></div>
            <div class="field full"><span class="lbl">Adverse drug events since last visit</span><div class="checks">${ADE.map(([a, b]) => `<label class="chip-check"><input type="checkbox" data-k="ade" data-t="multi" value="${a}"${(v.ade || []).includes(a) ? ' checked' : ''}${attr('disabled', ro)}><span class="box">${CHECK}</span>${b}</label>`).join('')}</div></div>
            <div class="field full"><span class="lbl">New devices or interventions since last visit</span><input class="input" data-k="newDevices" data-t="text" value="${esc(v.newDevices || '')}" placeholder="For example: CRT-D implanted 12/03/2026 (also update the Devices tab)"${attr('readonly', ro)}></div>
          </div>
          <h3 style="margin-top:20px">Laboratory (if available)</h3><div class="fgrid" style="margin-top:10px">${VISIT_LAB_FIELDS.map(f => field(f, ctx)).join('')}</div>
          ${isKccq ? `<h3 style="margin-top:20px">KCCQ-12</h3><div style="margin-top:10px">${kccqSection('kccq', v, ro, s)}</div>` : ''}
          <div class="field" style="margin-top:16px"><span class="lbl">Events since the last visit</span><p class="small ink2">Hospital admissions and urgent visits are entered as separate records in the <a href="#/patient/${id}/events">Events</a> tab.</p></div>` : ''}
        <div class="field"><span class="lbl">Notes</span><textarea class="input" data-k="notes" data-t="text"${attr('readonly', ro)}>${esc(v.notes || '')}</textarea></div>`;
    };
    modal({
      title: `${V.label} follow-up`, wide: true, body: '<div id="vf"></div>',
      actions: ro ? [{ label: 'Close' }] : [{ label: 'Cancel', value: false }, {
        label: 'Save visit', kind: 'primary', onClick: async () => {
          if (!v.date || !v.method || !v.vital) throw new Error('Date, method and vital status are required.');
          let reason;
          if (existing?.status === 'done' && server.complete) { reason = await reasonDialog('Reason for change', 'This visit was already saved. Give a reason for the change.'); if (!reason) return false; }
          await call('visit.save', { patientId: id, visit: { ...v, status: 'done' }, reason });
          toast('Visit saved.');
          await reload();
          if (v.vital === 'dead' && !server.death) setTimeout(() => openDeath(v.date), 200);
        },
      }],
      onOpen: back => {
        const el = back.querySelector('#vf'); renderBody(el);
        const rerender = () => { const sc = back.querySelector('.modal-body').scrollTop; renderBody(el); back.querySelector('.modal-body').scrollTop = sc; };
        bindFields(el, () => v, (k, o) => { if (o.structural) rerender(); });
        bindMeds(el, () => v, () => rerender(), targets);
      },
    });
  }

  // ---------- events ----------
  function drawEvents(body) {
    const evs = [...data.events].sort((a, b) => (a.admitDate < b.admitDate ? 1 : -1));
    const label = e => e.type === 'urgent' ? 'Urgent visit for worsening HF (IV diuretics, no admission)' : `${optionLabel(EVENT_REASON, e.reason) || 'Admission'}${e.cvDetail && e.reason === 'cv' ? ' · ' + e.cvDetail.toUpperCase() : ''}${e.detail ? ' · ' + e.detail : ''}`;
    body.innerHTML = `<div class="card">
      <div class="card-head"><h2>Hospitalizations and worsening HF events</h2>${canEdit() ? `<button class="btn primary sm" id="eadd">${icon('plus')}Add event</button>` : ''}</div>
      <div class="card-body">
        <p class="small ink2" style="margin-bottom:12px">Each admission is a separate record. The system classifies an event as an <b>HF hospitalization</b> when it is unplanned, lasts 24 hours or more, has HF as the primary reason and needs IV diuretics, vasoactive therapy or mechanical support.</p>
        ${evs.length ? `<div class="list-rows">${evs.map(e => `<div>
          <div style="width:96px" class="tnum"><b>${fmtDateShort(e.admitDate)}</b>${e.dischargeDate ? `<div class="small muted">${L.daysBetween(e.admitDate, e.dischargeDate)} days</div>` : ''}</div>
          <div class="grow"><div style="font-weight:600">${esc(label(e))}</div><div class="small ink2">${[e.hospital === 'other' ? 'Other hospital' : 'Same hospital', e.ivDiuretics ? 'IV diuretics' : '', e.vasoactive ? 'Vasoactive' : '', e.mcs ? 'Mechanical support' : '', e.planned ? 'Planned' : ''].filter(Boolean).join(' · ')}</div></div>
          ${L.isHFHospitalization(e) ? '<span class="badge bad">HF hospitalization</span>' : e.type === 'urgent' ? '<span class="badge warn">Urgent HF visit</span>' : '<span class="badge">Other admission</span>'}
          ${canEdit() ? `<button class="btn ghost xs" data-eedit="${e.id}">${icon('edit')}</button><button class="btn ghost xs" data-edel="${e.id}">${icon('trash')}</button>` : ''}
        </div>`).join('')}</div>` : `<div class="empty">${icon('siren')}<h3>No events recorded</h3><p>Add hospital admissions and urgent visits here as they happen.</p></div>`}
      </div></div>`;
    body.querySelector('#eadd')?.addEventListener('click', () => openEvent());
    body.querySelectorAll('[data-eedit]').forEach(b => b.onclick = () => openEvent(data.events.find(e => e.id === b.dataset.eedit)));
    body.querySelectorAll('[data-edel]').forEach(b => b.onclick = async () => { const r = await reasonDialog('Remove this event?', 'The event will be removed. Give a reason for the audit trail.', 'Remove event'); if (r) { await call('event.delete', { patientId: id, id: b.dataset.edel, reason: r }); toast('Event removed.'); await reload(); } });
  }
  function openEvent(existing) {
    const e = existing ? clone(existing) : { type: 'admission', hospital: 'same', stay24h: true };
    const draw2 = el => { el.innerHTML = `<div class="fgrid">${EVENT_FIELDS.map(f => field(f, { obj: e })).join('')}</div>
      <div style="margin-top:14px">${L.isHFHospitalization(e) ? `<div class="callout bad">${icon('check')}<div>This meets the protocol definition of an <b>HF hospitalization</b>.</div></div>` : e.type === 'admission' && e.reason === 'hf' ? `<div class="callout warn">${icon('info')}<div>Not counted as an HF hospitalization yet: it must be unplanned, last 24 hours or more, and need IV diuretics, vasoactive therapy or mechanical support.</div></div>` : ''}</div>`; };
    modal({
      title: existing ? 'Edit event' : 'Add event', wide: true, body: '<div id="ef"></div>',
      actions: [{ label: 'Cancel', value: false }, { label: 'Save event', kind: 'primary', onClick: async () => { await call('event.save', { patientId: id, event: e }); toast('Event saved.'); await reload(); if (e.death && !server.death) setTimeout(() => openDeath(e.dischargeDate || e.admitDate), 200); } }],
      onOpen: back => { const el = back.querySelector('#ef'); draw2(el); bindFields(el, () => e, (k, o) => { if (o.structural) draw2(el); }); },
    });
  }

  // ---------- death and withdrawal ----------
  function openDeath(date) {
    const dth = clone(server.death) || { date };
    modal({
      title: server.death ? 'Edit death record' : 'Record death', wide: true, body: '<div id="df"></div>',
      actions: [{ label: 'Cancel', value: false }, { label: 'Save', kind: 'danger', onClick: async () => { let reason; if (server.death) { reason = await reasonDialog('Reason for change', 'Give a reason for changing the death record.'); if (!reason) return false; } await call('death.save', { patientId: id, death: dth, reason }); toast('Death recorded. Future visits are cancelled.'); await reload(); } }],
      onOpen: back => { const el = back.querySelector('#df'); const d2 = () => el.innerHTML = `<p class="ink2" style="margin-bottom:12px">Once saved, the patient's future visits are cancelled and the record status becomes deceased.</p><div class="fgrid">${DEATH_FIELDS.map(f => field(f, { obj: dth })).join('')}</div>`; d2(); bindFields(el, () => dth, (k, o) => { if (o.structural) d2(); }); },
    });
  }
  function drawOutcome(body) {
    const d = server.death, w = server.withdrawal;
    body.innerHTML = `<div class="stack">
      <div class="card"><div class="card-head"><h2>Death</h2>${canEdit() ? `<button class="btn sm ${d ? '' : 'danger'}" id="dbtn">${d ? 'Edit' : 'Record death'}</button>` : ''}</div>
        <div class="card-body">${d ? `<div class="two-col">
          <div class="list-rows"><div><span class="muted grow">Date</span><b>${fmtDateShort(d.date)}</b></div><div><span class="muted grow">Place</span><b>${esc(d.place)}</b></div><div><span class="muted grow">Source</span><b>${esc(d.source)}</b></div><div><span class="muted grow">Days after enrollment</span><b>${L.daysBetween(rec.enrollment?.enrollmentDate, d.date)}</b></div></div>
          <div><div class="small muted">Cause by investigator</div><div style="font-weight:650;font-size:17px;margin:4px 0 14px">${esc(optionLabel(DEATH_CAUSE, d.investigatorCause || d.cause))}</div>
            <div class="small muted">Adjudicated cause</div>${d.adjudicated ? `<div style="font-weight:650;font-size:17px;margin-top:4px">${esc(optionLabel(DEATH_CAUSE, d.adjudicated.cause))}</div><div class="small ink2">${esc(d.adjudicated.by)} · ${fmtDateShort(d.adjudicated.at?.slice(0, 10))}${d.adjudicated.note ? ' · ' + esc(d.adjudicated.note) : ''}</div>` : '<div class="ink2" style="margin-top:4px">Not adjudicated yet.</div>'}
            ${app.isAdmin ? `<button class="btn sm" id="adj" style="margin-top:12px">${icon('shield')}Adjudicate</button>` : ''}</div></div>` : '<p class="ink2">No death recorded. If the patient died, record it here or choose "Dead" as vital status in a follow-up visit.</p>'}</div></div>
      <div class="card"><div class="card-head"><h2>Withdrawal of consent</h2>${canEdit() && !w ? '<button class="btn sm" id="wbtn">Record withdrawal</button>' : ''}</div>
        <div class="card-body">${w ? `<p>Consent withdrawn on <b>${fmtDateShort(w.date)}</b>. Data already collected ${w.keepData ? '<b>can be kept</b>' : '<b>must not be used</b>'}.${w.reason ? ' Reason: ' + esc(w.reason) : ''}</p>` : '<p class="ink2">Consent has not been withdrawn.</p>'}</div></div>
    </div>`;
    body.querySelector('#dbtn')?.addEventListener('click', () => openDeath());
    body.querySelector('#adj')?.addEventListener('click', () => {
      const a = { cause: d.adjudicated?.cause || d.cause, note: '' };
      modal({ title: 'Adjudicate cause of death', body: `<p class="ink2">The investigator's cause is kept. Your adjudicated cause is stored next to it.</p><div class="fgrid" id="af"><div class="field full"><label>Adjudicated cause</label><select class="input" data-k="cause" data-t="select">${DEATH_CAUSE.map(([x, y]) => `<option value="${x}"${x === a.cause ? ' selected' : ''}>${y}</option>`).join('')}</select></div><div class="field full"><label>Note</label><input class="input" data-k="note" data-t="text" placeholder="For example: reviewed with discharge summary"></div></div>`, actions: [{ label: 'Cancel', value: false }, { label: 'Save adjudication', kind: 'primary', onClick: async () => { await call('death.adjudicate', { patientId: id, ...a }); toast('Adjudication saved.'); await reload(); } }], onOpen: back => bindFields(back.querySelector('#af'), () => a, () => { }) });
    });
    body.querySelector('#wbtn')?.addEventListener('click', () => {
      const w2 = { date: today(), keepData: true };
      modal({ title: 'Record withdrawal of consent', body: `<div class="fgrid" id="wf"><div class="field"><label>Date</label>${dateInput('w_date', 'date', w2.date)}</div><div class="field"><label>Can collected data be kept?</label><div class="seg"><button type="button" data-k="keepData" data-t="seg" data-v="yes" aria-pressed="true">Yes</button><button type="button" data-k="keepData" data-t="seg" data-v="no">No</button></div></div><div class="field full"><label>Reason (optional)</label><input class="input" data-k="reason" data-t="text"></div></div>`, actions: [{ label: 'Cancel', value: false }, { label: 'Save', kind: 'danger', onClick: async () => { await call('withdraw.save', { patientId: id, withdrawal: { ...w2, keepData: w2.keepData !== 'no' } }); toast('Withdrawal recorded.'); await reload(); } }], onOpen: back => bindFields(back.querySelector('#wf'), () => w2, (k, o) => { back.querySelectorAll('[data-k=keepData]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (w2.keepData === 'no' ? 'no' : 'yes')))); }) });
    });
  }

  // ---------- patient journey (timeline + care opportunities) ----------
  function drawJourney(body) {
    const enroll = rec.enrollment?.enrollmentDate;
    const end = server.death?.date || today();
    const span = Math.max(30, L.daysBetween(enroll, end) + 10, 120);
    const W = 1000, LX = 132, RX = 990, x = d => LX + (RX - LX) * Math.max(0, Math.min(1, L.daysBetween(enroll, d) / span));
    const tl = L.medTimeline(rec, data.visits, data.titrations);
    const lanes = [['Visits', 40], ['Events', 76], ...L.FOUNDATIONAL.map((g, i) => [L.SHORT_LABEL[g], 118 + i * 30]), ['KCCQ', 250]];
    let svg = `<svg viewBox="0 0 ${W} 300" role="img" aria-label="Patient timeline">`;
    for (let m = 0; m <= span; m += 30) { const xx = LX + (RX - LX) * m / span; svg += `<line x1="${xx}" x2="${xx}" y1="22" y2="286" stroke="var(--chart-grid)"/><text x="${xx}" y="14" font-size="10.5" text-anchor="middle" fill="var(--muted)">${m === 0 ? 'Enrolled' : 'M' + Math.round(m / 30)}</text>`; }
    for (const [l, y] of lanes) svg += `<text x="0" y="${y + 4}" font-size="12" fill="var(--ink-2)" font-weight="600">${esc(l)}</text>`;
    // med lanes
    L.FOUNDATIONAL.forEach((g, gi) => {
      const y = 118 + gi * 30;
      svg += `<line x1="${LX}" x2="${RX}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="10" stroke-linecap="round"/>`;
      for (let i = 0; i < tl.length; i++) {
        const st = L.gdmtSummary(tl[i].meds, targets, rec.demographics?.weight).per[g];
        if (!st) continue;
        const x1 = x(tl[i].date), x2 = x(i + 1 < tl.length ? tl[i + 1].date : end);
        const op = st.pct >= 100 ? 1 : st.pct >= 50 ? .62 : .32;
        svg += `<rect x="${x1}" y="${y - 5}" width="${Math.max(2, x2 - x1)}" height="10" rx="3" fill="var(--navy)" opacity="${op}"><title>${esc(st.drug)} ${st.pct ?? '?'}% of target from ${fmtDateShort(tl[i].date)}</title></rect>`;
      }
    });
    // visits
    for (const v of L.visitSchedule(server, data.visits, s, today())) {
      if (v.status === 'done') svg += `<circle cx="${x(v.record.date)}" cy="40" r="7" fill="var(--s3)"><title>${v.label} done ${fmtDateShort(v.record.date)}</title></circle>`;
      else if (['missed', 'ltfu'].includes(v.status)) svg += `<circle cx="${x(v.due)}" cy="40" r="6" fill="none" stroke="var(--bad)" stroke-width="2"><title>${v.label} missed</title></circle>`;
      else if (v.status !== 'cancelled' && v.due <= end) svg += `<circle cx="${x(v.due)}" cy="40" r="6" fill="none" stroke="var(--muted)" stroke-width="1.5"><title>${v.label} due ${fmtDateShort(v.due)}</title></circle>`;
    }
    // events
    for (const e of data.events) {
      const x1 = x(e.admitDate), x2 = e.dischargeDate ? x(e.dischargeDate) : x1 + 4;
      if (e.type === 'urgent') svg += `<path d="M${x1} 68 l7 8 -7 8 -7 -8z" fill="var(--s4)"><title>Urgent HF visit ${fmtDateShort(e.admitDate)}</title></path>`;
      else svg += `<rect x="${x1}" y="68" width="${Math.max(5, x2 - x1)}" height="16" rx="3" fill="${L.isHFHospitalization(e) ? 'var(--s8)' : 'var(--muted)'}"><title>${L.isHFHospitalization(e) ? 'HF hospitalization' : 'Admission'} ${fmtDateShort(e.admitDate)}</title></rect>`;
    }
    // KCCQ
    const kq = [[enroll, L.kccqScores(rec.kccq)?.summary], ...data.visits.filter(v => v.kccqScores?.summary != null).map(v => [v.date, v.kccqScores.summary])].filter(p => p[1] != null).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (kq.length) { const ky = v => 278 - v * 0.42; svg += `<path d="${kq.map((p, i) => (i ? 'L' : 'M') + x(p[0]) + ' ' + ky(p[1])).join(' ')}" fill="none" stroke="var(--s1)" stroke-width="2"/>${kq.map(p => `<circle cx="${x(p[0])}" cy="${ky(p[1])}" r="4" fill="var(--s1)"/><text x="${x(p[0]) + 6}" y="${ky(p[1]) - 6}" font-size="11" fill="var(--ink)" font-weight="600">${Math.round(p[1])}</text>`).join('')}`; }
    if (server.death) svg += `<line x1="${x(server.death.date)}" x2="${x(server.death.date)}" y1="22" y2="286" stroke="var(--ink)" stroke-width="2"/><text x="${x(server.death.date) - 4}" y="296" font-size="11" text-anchor="end" fill="var(--ink)" font-weight="600">Died ${fmtDateShort(server.death.date)}</text>`;
    else svg += `<line x1="${x(today())}" x2="${x(today())}" y1="22" y2="286" stroke="var(--trace)" stroke-width="1.5"/><text x="${x(today()) - 4}" y="296" font-size="11" text-anchor="end" fill="var(--trace)" font-weight="600">Today</text>`;
    svg += '</svg>';
    const cur = L.currentMeds(rec, data.visits, data.titrations);
    const lastLabs = { ...(rec.labs || {}), egfr: server.derived?.egfr, ...([...data.visits].filter(v => v.labs).sort((a, b) => (a.date < b.date ? -1 : 1)).map(v => Object.fromEntries(Object.entries(v.labs).filter(([, val]) => val != null))).reduce((a, b) => ({ ...a, ...b }), {})) };
    const gaps = server.death ? [] : L.careGaps(rec, cur, lastLabs);
    const ms = L.gdmtMilestones(rec, data.visits, data.titrations, targets);
    body.innerHTML = `<div class="stack">
      <div class="card"><div class="card-head"><h2>Patient journey</h2><span class="small ink2">Darker bar = closer to target dose</span></div><div class="card-body journey">${svg}</div></div>
      <div class="two-col">
        <div class="card"><div class="card-head"><h3>Guideline care opportunities</h3></div><div class="card-body">
          ${gaps.length ? `<div class="gaps">${gaps.map(g => `<div class="gap ${g.level}"><span class="lvl"></span><span>${esc(g.text)}</span></div>`).join('')}</div><p class="small muted" style="margin-top:12px">Automatic flags compared with ESC guidance, to support review. They are not orders; the treating physician decides.</p>` : `<div class="empty" style="padding:20px">${icon('check')}<p>${server.death ? 'Patient deceased.' : 'No open care opportunities flagged.'}</p></div>`}
        </div></div>
        <div class="card"><div class="card-head"><h3>Therapy milestones</h3></div><div class="card-body"><div class="list-rows">
          <div><span class="grow">${L.phenotype(rec.echo?.lvef) === 'HFpEF' ? 'MRA + SGLT2i reached' : 'All four foundational classes reached'}</span><b>${ms.fullDate ? `${fmtDateShort(ms.fullDate)} · day ${ms.daysToFull}` : 'Not yet'}</b></div>
          ${L.FOUNDATIONAL.map(g => `<div><span class="grow">${L.SHORT_LABEL[g]} at 100% of target</span><b>${ms.targetDate[g] ? fmtDateShort(ms.targetDate[g]) : '–'}</b></div>`).join('')}
        </div></div></div>
      </div></div>`;
  }

  // ---------- queries ----------
  function drawQueries(body) {
    const qs = [...data.queries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    body.innerHTML = `<div class="card"><div class="card-head"><h2>Data queries</h2>${app.isAdmin ? `<button class="btn primary sm" id="qadd">${icon('plus')}Raise a query</button>` : ''}</div><div class="card-body">
      ${qs.length ? `<div class="list-rows">${qs.map(q => `<div style="align-items:flex-start;flex-direction:column;gap:6px">
        <div class="row" style="width:100%"><span class="badge ${q.kind === 'delete' ? 'bad' : q.status === 'open' ? 'warn' : q.status === 'answered' ? 'info' : 'good'}">${q.kind === 'delete' ? 'Deletion request' : q.status}</span><b class="grow">${esc(q.field ? fieldLabel(q.field) : 'Whole record')}</b><span class="small muted">${esc(q.createdBy)} · ${fmtDateShort(q.createdAt.slice(0, 10))}</span></div>
        <div>${esc(q.message)}</div>
        ${(q.thread || []).map(t => `<div class="qthread"><b>${esc(t.by)}</b> <span class="muted small">${fmtDateShort(t.at.slice(0, 10))}</span><div>${esc(t.message)}</div></div>`).join('')}
        <div class="row">${q.status !== 'closed' ? `<button class="btn sm" data-qans="${q.id}">${icon('chat')}Reply</button>` : ''}${app.isAdmin && q.status !== 'closed' ? `<button class="btn sm" data-qclose="${q.id}">${icon('check')}Close</button>` : ''}${app.isAdmin && q.status === 'closed' ? `<button class="btn sm ghost" data-qreopen="${q.id}">Reopen</button>` : ''}</div>
      </div>`).join('')}</div>` : `<div class="empty">${icon('chat')}<h3>No queries</h3><p>${app.isAdmin ? 'Raise a query on any field that needs checking.' : 'Questions from the coordinating team appear here.'}</p></div>`}
    </div></div>`;
    body.querySelector('#qadd')?.addEventListener('click', () => {
      const q = { field: '', message: '' };
      const fl = allFields().filter(f => f.type !== 'computed');
      modal({ title: 'Raise a data query', body: `<div class="fgrid one" id="qf"><div class="field"><label>Field</label><select class="input" data-k="field" data-t="select"><option value="">Whole record</option>${fl.map(f => `<option value="${f.k}">${esc(f.tab)} · ${esc(f.label)}</option>`).join('')}</select></div><div class="field"><label>Question for the site</label><textarea class="input" data-k="message" data-t="text" placeholder="For example: potassium 6.4 on MRA, please confirm against the lab report"></textarea></div></div>`, actions: [{ label: 'Cancel', value: false }, { label: 'Send query', kind: 'primary', onClick: async () => { await call('query.create', { patientId: id, ...q }); toast('Query sent to the site.'); await reload(); app.refreshCounts(); } }], onOpen: back => bindFields(back.querySelector('#qf'), () => q, () => { }) });
    });
    body.querySelectorAll('[data-qans]').forEach(b => b.onclick = () => {
      const a = { message: '' };
      modal({ title: 'Reply to query', body: `<div class="field" id="af"><label>Your answer</label><textarea class="input" data-k="message" data-t="text" placeholder="For example: corrected to 4.6 from the lab report"></textarea><div class="help">If the value was wrong, correct it in the record too.</div></div>`, actions: [{ label: 'Cancel', value: false }, { label: 'Send reply', kind: 'primary', onClick: async () => { if (!a.message) throw new Error('Write a reply.'); await call('query.answer', { id: b.dataset.qans, message: a.message }); toast('Reply sent.'); await reload(); app.refreshCounts(); } }], onOpen: back => bindFields(back.querySelector('#af'), () => a, () => { }) });
    });
    body.querySelectorAll('[data-qclose]').forEach(b => b.onclick = async () => { await call('query.close', { id: b.dataset.qclose }); toast('Query closed.'); await reload(); app.refreshCounts(); });
    body.querySelectorAll('[data-qreopen]').forEach(b => b.onclick = async () => { await call('query.close', { id: b.dataset.qreopen, reopen: true }); await reload(); });
  }

  // ---------- history ----------
  async function drawHistory(body) {
    body.innerHTML = `<div class="card pad"><div class="skel" style="height:200px"></div></div>`;
    const { entries } = await call('audit.list', { patientId: id, limit: 500 });
    const show = v => { if (v == null || v === 'null') return '–'; const s2 = typeof v === 'string' ? v : JSON.stringify(v); return s2.length > 80 ? s2.slice(0, 80) + '…' : s2; };
    body.innerHTML = `<div class="card"><div class="card-head"><h2>Change history</h2><span class="small ink2">${entries.length} entries · cannot be edited</span></div><div class="card-body">
      ${entries.length ? entries.map(e => `<div class="audit-row"><div class="tnum ink2">${esc(e.ts.slice(0, 10).split('-').reverse().join('/'))} ${esc(e.ts.slice(11, 16))}</div><div><b style="font-weight:600">${esc(e.userName || '')}</b><div class="small muted">${esc(e.action)}</div></div>
        <div class="chg"><span class="ink2">${esc(fieldLabel(e.field || ''))}</span> ${e.old != null && e.old !== 'null' ? `<span class="old">${esc(show(e.old))}</span> → ` : ''}<span class="new">${esc(show(e.new))}</span>${e.reason ? `<div class="small muted">Reason: ${esc(e.reason)}</div>` : ''}</div></div>`).join('') : '<p class="muted">No changes recorded.</p>'}
    </div></div>`;
  }

  // keep the save bar honest when leaving with unsaved changes
  const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  draw();
  return () => {
    window.removeEventListener('beforeunload', beforeUnload);
    if (location.hash.startsWith(`#/patient/${id}/`) || location.hash === `#/patient/${id}`) { keep = { id, version: server.version, rec, ident, dirty }; return; }
    if (dirty) { saveDraft(id, { version: server.version, rec, ident }); toast('Unsaved changes are kept on this device as a draft.', 'info'); }
  };
}
