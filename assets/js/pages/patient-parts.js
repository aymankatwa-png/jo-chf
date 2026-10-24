// Custom sections of the patient form: comorbidities, medications, KCCQ-12, devices, drug groups.
// They reuse the generic field binding (data-k / data-t attributes) from ui/fields.js.
import { esc, icon, attr } from '../ui/dom.js';
import { CHECK, dateInput } from '../ui/fields.js';
import * as L from '../core/logic.js';
import { COMORBIDITIES, REASONS, FREQS, KCCQ_FORM, DEVICES, DEVICE_STATUS, YNU } from '../core/schema.js';

const sel = (k, opts, v, ro, ph = 'Choose…') => `<select class="input" data-k="${k}" data-t="select"${attr('disabled', ro)}><option value="">${ph}</option>${opts.map(([a, b]) => `<option value="${esc(a)}"${a === v ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
const seg = (k, opts, v, ro) => `<div class="seg">${opts.map(([a, b]) => `<button type="button" data-k="${k}" data-t="seg" data-v="${esc(a)}" aria-pressed="${a === v}"${attr('disabled', ro)}>${esc(b)}</button>`).join('')}</div>`;
const multi = (k, opts, v, ro) => `<div class="checks">${opts.map(([a, b]) => `<label class="chip-check"><input type="checkbox" data-k="${k}" data-t="multi" value="${esc(a)}"${(v || []).includes(a) ? ' checked' : ''}${attr('disabled', ro)}><span class="box">${CHECK}</span>${esc(b)}</label>`).join('')}</div>`;
const numIn = (k, v, ro, unit, ph = '') => `<div class="with-unit"><input class="input" inputmode="decimal" data-k="${k}" data-t="number" value="${v ?? ''}" placeholder="${ph}"${attr('readonly', ro)}>${unit ? `<span class="unit">${unit}</span>` : ''}</div>`;
const txt = (k, v, ro, ph = '') => `<input class="input" data-k="${k}" data-t="text" value="${esc(v ?? '')}" placeholder="${esc(ph)}"${attr('readonly', ro)}>`;

// ---------- comorbidities ----------
export function comorbiditiesSection(rec, ro) {
  const c = rec.comorbid || {};
  return `<div class="comorb">${COMORBIDITIES.map(m => `
    <div class="comorb-item ${c[m.k] === 'yes' ? 'yes' : ''}">
      <div class="row"><span class="name">${esc(m.label)}</span>${seg('comorbid.' + m.k, YNU, c[m.k], ro)}</div>
      ${c[m.k] === 'yes' && m.sub ? `<div class="subs">${m.sub.map(s => `<div class="field"><span class="lbl" style="font-size:12px">${esc(s.label)}</span>${s.type === 'select' ? sel('comorbid.' + s.k, s.opts, c[s.k], ro) : s.type === 'number' ? numIn('comorbid.' + s.k, c[s.k], ro, s.unit) : txt('comorbid.' + s.k, c[s.k], ro)}</div>`).join('')}
        ${m.k === 'dm' ? `<div class="field"><span class="lbl" style="font-size:12px">HbA1c</span>${numIn('labs.hba1c', rec.labs?.hba1c, ro, '%')}</div>` : ''}</div>` : ''}
    </div>`).join('')}
    <div class="comorb-item"><div class="name">Other comorbidity</div>${txt('comorbid.other', c.other, ro, 'Specify')}</div>
  </div>`;
}

// ---------- foundational medication snapshot ----------
const GROUP_CLASSES = { RAS: ['ARNI', 'ACEI', 'ARB'], BB: ['BB'], MRA: ['MRA'], SGLT2: ['SGLT2'] };
export function medsSection(sec, rec, ctx) {
  const ro = ctx.readonly;
  const meds = L.getPath(rec, sec.path) || [];
  const reasons = L.getPath(rec, sec.reasons) || {};
  const targets = ctx.targets;
  const weight = ctx.weight ?? rec.demographics?.weight;
  const s = L.gdmtSummary(meds, targets, weight);
  const need = new Set(L.gdmtNeedsReason(meds, targets, weight));
  const pheno = L.phenotype(rec.echo?.lvef);
  const pills = L.FOUNDATIONAL.map(g => `<span class="gdmt-pill ${s.per[g] ? 'on' : ''}">${s.per[g] ? '✓' : '○'} ${L.SHORT_LABEL[g]}${s.per[g]?.pct != null ? ` <span class="p">${s.per[g].pct}%</span>` : ''}</span>`).join('');
  const groups = L.FOUNDATIONAL.map(g => {
    const drugs = targets.filter(t => GROUP_CLASSES[g].includes(t.cls));
    const idx = meds.map((m, i) => ({ m, i })).filter(({ m }) => { const t = targets.find(x => x.drug === m.drug); return t && L.foundationalGroup(t.cls) === g; });
    const rows = idx.map(({ m, i }) => {
      const t = targets.find(x => x.drug === m.drug);
      const daily = L.dailyDose(m), tgt = L.targetFor(m.drug, targets, weight);
      const pct = daily != null && tgt ? Math.round(100 * daily / tgt) : null;
      return `<div class="med-row">
        <div class="field"><span class="lbl tiny muted">Drug</span><select class="input" data-k="${sec.path}.${i}.drug" data-t="select"${attr('disabled', ro)}>${drugs.map(d => `<option${d.drug === m.drug ? ' selected' : ''}>${esc(d.drug)}</option>`).join('')}</select></div>
        <div class="field"><span class="lbl tiny muted">Dose each time</span>${numIn(`${sec.path}.${i}.dose`, m.dose, ro, 'mg')}</div>
        <div class="field"><span class="lbl tiny muted">How often</span>${sel(`${sec.path}.${i}.freq`, FREQS, m.freq, ro, 'Frequency')}</div>
        <div class="dose-meter"><div class="bar"><i class="${pct >= 100 ? 'ok' : ''}" style="width:${Math.min(100, pct || 0)}%"></i></div>
          <div class="txt">${pct == null ? 'Enter dose and frequency' : `<b>${pct}%</b> of target`} · target ${esc(t?.label || '')}</div></div>
        ${ro ? '<span></span>' : `<button type="button" class="btn ghost sm icon" data-medrm="${i}" data-path="${sec.path}" aria-label="Remove ${esc(m.drug)}">${icon('trash')}</button>`}
      </div>`;
    }).join('');
    const needs = need.has(g);
    const status = s.per[g] ? `${esc(s.per[g].drug)} · ${s.per[g].pct ?? '?'}% of target` : (pheno === 'HFpEF' && (g === 'RAS' || g === 'BB') ? 'Not prescribed (optional in HFpEF)' : 'Not prescribed');
    return `<div class="med-group" data-group="${g}">
      <div class="med-group-head"><span class="gname">${esc(L.CLASS_LABEL[g])}</span><span class="small ink2">${status}</span>
        ${!ro && !idx.length ? `<select class="input" style="width:auto;height:32px;font-size:13px" data-medadd="${g}" data-path="${sec.path}" aria-label="Add ${esc(L.CLASS_LABEL[g])}"><option value="">+ Add drug</option>${drugs.map(d => `<option>${esc(d.drug)}</option>`).join('')}</select>` : ''}
      </div>
      ${rows}
      ${needs ? `<div class="reasons${(reasons[g] || []).length ? ' ok' : ''}"><span class="lbl">${s.per[g] ? 'Why is the dose below target?' : 'Why is it not prescribed?'} (choose one or more)</span>
        ${multi(`${sec.reasons}.${g}`, REASONS, reasons[g], ro)}
        ${(reasons[g] || []).some(r => r === 'other' || r === 'intolerance') ? `<div style="margin-top:8px">${txt(`${sec.reasons}Text.${g}`, L.getPath(rec, `${sec.reasons}Text.${g}`), ro, 'Specify (side effect or other reason)')}</div>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
  return `<div class="gdmt-summary" style="margin-bottom:12px">${pills}<span class="small ink2" style="margin-left:6px"><b>${s.count}</b> of 4 foundational drug classes${pheno === 'HFpEF' ? ' · for HFpEF the protocol tracks MRA + SGLT2i' : ''}</span>
    ${sec.prefillFrom && !ro ? `<button type="button" class="btn xs" style="margin-left:auto" data-medcopy="${sec.prefillFrom}" data-path="${sec.path}">Copy from admission</button>` : ''}</div>
    <div class="med-groups">${groups}</div>
    ${sec.reviewed ? `<div style="margin-top:14px"><label class="check-line"><input type="checkbox" data-k="${sec.reviewed}" data-t="check"${L.getPath(rec, sec.reviewed) ? ' checked' : ''}${attr('disabled', ro)}><span class="box">${CHECK}</span><span><b>All heart failure medicines at this time point are recorded.</b><div class="help">Tick this even if the patient takes none of the four classes. It is required to mark the record complete.</div></span></label></div>` : ''}`;
}
export function bindMeds(root, getRec, onChange, targets) {
  root.addEventListener('change', e => {
    const a = e.target.closest('[data-medadd]'); if (!a || !a.value) return;
    const rec = getRec(); const list = L.getPath(rec, a.dataset.path) || [];
    const t = targets.find(x => x.drug === a.value);
    const freq = /twice/.test(t.label) ? 'bd' : /three/.test(t.label) ? 'tds' : 'od';
    list.push({ drug: a.value, dose: undefined, freq });
    L.setPath(rec, a.dataset.path, list);
    onChange(a.dataset.path, { structural: true });
  });
  root.addEventListener('click', e => {
    const rm = e.target.closest('[data-medrm]');
    if (rm) { const rec = getRec(); const list = L.getPath(rec, rm.dataset.path) || []; list.splice(+rm.dataset.medrm, 1); L.setPath(rec, rm.dataset.path, list); onChange(rm.dataset.path, { structural: true }); }
    const cp = e.target.closest('[data-medcopy]');
    if (cp) { const rec = getRec(); L.setPath(rec, cp.dataset.path, JSON.parse(JSON.stringify(L.getPath(rec, cp.dataset.medcopy) || []))); onChange(cp.dataset.path, { structural: true }); }
  });
}

// ---------- drug groups: additional therapy, etiology-specific, non-HF ----------
export function drugGroupSection(sec, rec, ro) {
  const base = L.getPath(rec, sec.path) || {};
  const rows = sec.items.map(it => {
    const v = base[it.k] || {};
    return `<div class="dev-row">
      <label class="chip-check" style="justify-self:start"><input type="checkbox" data-k="${sec.path}.${it.k}.on" data-t="check"${v.on ? ' checked' : ''}${attr('disabled', ro)}><span class="box">${CHECK}</span>${esc(it.label)}</label>
      <div>${v.on && it.drugs ? sel(`${sec.path}.${it.k}.drug`, it.drugs.map(d => [d, d]), v.drug, ro, 'Which drug?') : ''}</div>
      <div>${v.on && (it.dose || it.k === 'loop') ? txt(`${sec.path}.${it.k}.dose`, v.dose, ro, 'Dose (e.g. 40 mg daily)') : v.on ? txt(`${sec.path}.${it.k}.note`, v.note, ro, 'Note') : ''}</div>
    </div>`;
  }).join('');
  const iron = sec.ivIron ? (() => {
    const v = base.ivIron || {};
    return `<div class="dev-row"><label class="chip-check" style="justify-self:start"><input type="checkbox" data-k="${sec.path}.ivIron.given" data-t="check"${v.given ? ' checked' : ''}${attr('disabled', ro)}><span class="box">${CHECK}</span>Intravenous iron</label>
      <div>${v.given ? sel(`${sec.path}.ivIron.formulation`, [['fcm', 'Ferric carboxymaltose'], ['fdi', 'Ferric derisomaltose'], ['sucrose', 'Iron sucrose'], ['other', 'Other']], v.formulation, ro, 'Formulation') : ''}</div>
      <div>${v.given ? `<div class="row">${txt(`${sec.path}.ivIron.dose`, v.dose, ro, 'Dose (mg)')}${dateInput('iron_d', `${sec.path}.ivIron.date`, v.date, ro)}</div>` : ''}</div></div>`;
  })() : '';
  const free = sec.free ? `<div class="field" style="margin-top:12px"><span class="lbl">Other (free text)</span>${txt(`${sec.path}.other`, base.other, ro, 'Drug name and dose')}</div>` : '';
  return `<div>${rows}${iron}</div>${free}`;
}

// ---------- KCCQ-12 ----------
export function kccqSection(path, rec, ro, settings) {
  const ans = L.getPath(rec, path) || {};
  const sc = L.kccqScores(ans) || {};
  const ar = settings?.kccqText || {};
  const box = (k, l, main) => `<div class="s${main ? ' main' : ''}"><b>${sc[k] ?? '–'}</b><span>${l}</span></div>`;
  return `
    ${!settings?.kccqLicensed ? `<div class="callout warn" style="margin-bottom:16px">${icon('alert')}<div><b>KCCQ license.</b> The KCCQ is copyrighted. Item topics below are short descriptions. Administrators paste the licensed Arabic wording in Study settings once the license is confirmed.</div></div>` : ''}
    <div class="kccq-scores">${box('summary', 'Overall summary', true)}${box('PL', 'Physical limitation')}${box('SF', 'Symptom frequency')}${box('QL', 'Quality of life')}${box('SL', 'Social limitation')}</div>
    ${KCCQ_FORM.map((q, i) => `<div class="kccq-item"><div class="qn">${q.k.slice(1).toUpperCase()}</div><div><div class="qt">${esc(q.topic)}${ar[q.k] ? `<span class="ar" lang="ar">${esc(ar[q.k])}</span>` : ''}</div>${seg(`${path}.${q.k}`, q.opts, ans[q.k], ro)}</div></div>`).join('')}`;
}

// ---------- devices ----------
export function devicesSection(rec, ro) {
  const d = rec.devices || {};
  return DEVICES.map(dev => {
    const v = d[dev.k] || {};
    return `<div class="dev-row"><div><b style="font-weight:600">${esc(dev.label)}</b></div>${seg(`devices.${dev.k}.status`, DEVICE_STATUS, v.status, ro)}
      <div>${v.status === 'implanted' ? dateInput('dev_' + dev.k, `devices.${dev.k}.date`, v.date, ro) : v.status === 'indicated' ? txt(`devices.${dev.k}.reason`, v.reason, ro, 'Why not done?') : ''}</div></div>`;
  }).join('');
}
