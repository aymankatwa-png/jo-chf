// De-identified data export: Excel, CSV, SPSS and R, with a data dictionary.
import { call } from '../api.js';
import { esc, icon, toast, loadScript } from '../ui/dom.js';
import { allFields, TABS, VISIT_FIELDS, VISIT_LAB_FIELDS, EVENT_FIELDS, KCCQ_FORM, COMORBIDITIES, DEVICES, AMT, NON_HF, optionLabel, DEATH_CAUSE } from '../core/schema.js';
import * as L from '../core/logic.js';
import { prepare } from '../core/analytics-calc.js';

const DROP = /^(raw|notDone|units|version|createdBy|updatedAt|createdAt|deleted|deletedAt|derived\.nextDue|enrollment\.investigator|baselineMeds|hosp\.dischargeMeds|baselineReasonsText|hosp\.dischargeReasonsText)/;
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const varName = p => p.replace(/\./g, '_').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);

function flat(o, prefix = '', out = {}) {
  if (o == null) return out;
  if (Array.isArray(o)) { out[prefix] = o.join(';'); return out; }
  if (typeof o !== 'object') { out[prefix] = o; return out; }
  for (const k of Object.keys(o)) flat(o[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}
function medCols(prefix, meds, targets, w) {
  const s = L.gdmtSummary(meds || [], targets, w); const o = {};
  for (const g of L.FOUNDATIONAL) { o[`${prefix}_${g}_on`] = s.per[g] ? 1 : 0; o[`${prefix}_${g}_drug`] = s.per[g]?.drug || ''; o[`${prefix}_${g}_mgday`] = s.per[g]?.daily ?? ''; o[`${prefix}_${g}_pcttarget`] = s.per[g]?.pct ?? ''; }
  o[`${prefix}_fmt_count`] = meds ? s.count : '';
  return o;
}

export async function render(root, _, app) {
  app.setCrumbs([{ label: 'Export data' }]);
  if (!app.isAdmin) { root.innerHTML = `<div class="empty">${icon('lock')}<h3>Administrators only</h3></div>`; return; }
  const ds = await call('data.dataset', {});
  const opt = { centers: new Set(ds.centers.map(c => c.id)), dates: 'dates', format: 'xlsx', tps: new Set(['baseline', 'd30', 'm6', 'm12']) };
  root.innerHTML = `<div class="page-head"><div class="grow"><h1>Export data</h1><p>Exports are always de-identified: Study ID only, no names, phone numbers, file numbers or national IDs. Each export is recorded in the audit log.</p></div></div>
    <div class="two-col">
      <div class="card"><div class="card-head"><h2>What to export</h2></div><div class="card-body stack">
        <div class="field"><span class="lbl">Centers</span><div class="checks">${ds.centers.map(c => `<label class="chip-check"><input type="checkbox" data-c="${c.id}" checked><span class="box">${icon('check')}</span>${esc(c.code)}</label>`).join('')}</div></div>
        <div class="field"><span class="lbl">Time points</span><div class="checks">${[['baseline', 'Baseline'], ['d30', '30 days'], ['m6', '6 months'], ['m12', '12 months']].map(([k, l]) => `<label class="chip-check"><input type="checkbox" data-tp="${k}" checked><span class="box">${icon('check')}</span>${l}</label>`).join('')}</div></div>
        <div class="field"><span class="lbl">Dates</span><div class="seg" id="dates"><button type="button" data-v="dates" aria-pressed="true">Real dates (DD/MM/YYYY → ISO)</button><button type="button" data-v="days" aria-pressed="false">Days from enrollment</button></div><div class="help">Days from enrollment remove calendar dates for extra privacy. Date of birth is then replaced by age.</div></div>
      </div></div>
      <div class="card"><div class="card-head"><h2>Format</h2></div><div class="card-body stack">
        <div class="seg" id="fmt"><button type="button" data-v="xlsx" aria-pressed="true">Excel</button><button type="button" data-v="csv" aria-pressed="false">CSV</button><button type="button" data-v="spss" aria-pressed="false">SPSS</button><button type="button" data-v="r" aria-pressed="false">R</button></div>
        <p class="small ink2" id="fmtnote"></p>
        <div class="callout">${icon('table')}<div>Tables: <b>patients</b> (one row per patient, baseline), <b>visits</b> (one row per follow-up visit), <b>events</b> (hospitalizations), <b>titrations</b> (medication changes) and the <b>data dictionary</b> (variable, label, codes, units).</div></div>
        <button class="btn primary" id="go" style="height:46px">${icon('download')}Export</button>
      </div></div>
    </div>`;
  const NOTE = { xlsx: 'One Excel workbook with a sheet per table plus the data dictionary.', csv: 'One CSV file per table plus the data dictionary (UTF-8).', spss: 'CSV files plus an SPSS syntax file (.sps) that reads them with variable and value labels.', r: 'CSV files plus an R script that reads them and labels factor levels.' };
  const setNote = () => (root.querySelector('#fmtnote').textContent = NOTE[opt.format]);
  setNote();
  root.querySelector('#fmt').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; opt.format = b.dataset.v; root.querySelectorAll('#fmt button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); setNote(); };
  root.querySelector('#dates').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; opt.dates = b.dataset.v; root.querySelectorAll('#dates button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
  root.addEventListener('change', e => { if (e.target.dataset.c) e.target.checked ? opt.centers.add(e.target.dataset.c) : opt.centers.delete(e.target.dataset.c); if (e.target.dataset.tp) e.target.checked ? opt.tps.add(e.target.dataset.tp) : opt.tps.delete(e.target.dataset.tp); });
  root.querySelector('#go').onclick = async () => {
    const btn = root.querySelector('#go'); btn.disabled = true;
    try { const t = build(ds, opt); await download(t, opt); toast('Export ready.'); call('audit.logExport', { options: `${opt.format}; centers ${[...opt.centers].length}; time points ${[...opt.tps].join('/')}; dates ${opt.dates}` }).catch(() => { }); }
    catch (e) { console.error(e); toast(e.message, 'bad'); } finally { btn.disabled = false; }
  };
}

function build(ds, opt) {
  const targets = ds.settings.targets;
  const centerCode = Object.fromEntries(ds.centers.map(c => [c.id, c.code]));
  const rows = prepare({ ...ds, patients: ds.patients.filter(p => opt.centers.has(p.centerId)) });
  const dateFix = (rec, enroll) => { for (const k of Object.keys(rec)) if (isDate(rec[k])) rec[k] = opt.dates === 'days' ? L.daysBetween(enroll, rec[k]) : rec[k]; if (opt.dates === 'days') delete rec.demographics_dob; return rec; };
  const patients = [], visits = [], events = [], titr = [];
  for (const r of rows) {
    const p = r.p, enroll = p.enrollment?.enrollmentDate;
    const f = flat(p); const rec = { study_id: p.id, center: centerCode[p.centerId] };
    for (const [k, v] of Object.entries(f)) { if (DROP.test(k) || k === 'id' || k === 'centerId') continue; rec[varName(k)] = v; }
    rec.age = p.derived?.age; rec.bmi = p.derived?.bmi; rec.egfr = p.derived?.egfr; rec.phenotype = p.derived?.phenotype; rec.qrs_cat = p.derived?.qrsCat;
    const kq = L.kccqScores(p.kccq) || {}; for (const d of ['summary', 'PL', 'SF', 'QL', 'SL']) rec[`kccq_bl_${d}`] = kq[d] ?? '';
    Object.assign(rec, medCols('bl', p.baselineMeds, targets, p.demographics?.weight));
    if (p.hosp?.dischargeMeds) Object.assign(rec, medCols('dc', p.hosp.dischargeMeds, targets, p.demographics?.weight));
    rec.days_to_full_gdmt = r.ms.daysToFull ?? ''; rec.status = L.recordStatus(p);
    rec.death = r.dead ? 1 : 0; rec.death_days = r.dead ? r.tDeath : ''; rec.followup_days = r.tDeath; rec.death_cause_final = p.death ? (p.death.adjudicated?.cause || p.death.cause) : '';
    rec.hfh_count = r.hfhCount; rec.first_hfh_or_death_days = r.tComp; rec.first_hfh_or_death = r.compEvent ? 1 : 0;
    patients.push(dateFix(rec, enroll));
    if (opt.tps.size) for (const v of r.visits) {
      if (!opt.tps.has(v.visit) || v.status !== 'done') continue;
      const fv = flat(v); const vr = { study_id: p.id, center: centerCode[p.centerId], visit: v.visit };
      for (const [k, val] of Object.entries(fv)) { if (/^(id|patientId|centerId|meds|attempts|updatedBy|updatedAt|kccq\.)/.test(k)) continue; vr[varName(k)] = val; }
      Object.assign(vr, medCols('v', v.meds, targets, v.weight || p.demographics?.weight));
      vr.attempts = v.attempts?.length || 0;
      visits.push(dateFix(vr, enroll));
    }
    for (const e of r.events) { const er = { study_id: p.id, center: centerCode[p.centerId], type: e.type, admit: e.admitDate, discharge: e.dischargeDate || '', reason: e.reason || '', cv_detail: e.cvDetail || '', detail: e.detail || '', planned: e.planned ? 1 : 0, iv_diuretics: e.ivDiuretics ? 1 : 0, vasoactive: e.vasoactive ? 1 : 0, mcs: e.mcs ? 1 : 0, hf_hospitalization: L.isHFHospitalization(e) ? 1 : 0, los_days: L.daysBetween(e.admitDate, e.dischargeDate) ?? '' }; events.push(dateFix(er, enroll)); }
    for (const t of r.titrations) titr.push(dateFix({ study_id: p.id, center: centerCode[p.centerId], date: t.date, drug: t.drug, change: t.change, dose_mg: t.dose ?? '', freq: t.freq || '', reason: t.reason || '' }, enroll));
  }
  return { patients, visits, events, titrations: titr, dictionary: dictionary(patients, visits) };
}

function dictionary(patients, visits) {
  const fields = new Map();
  for (const f of [...allFields()]) fields.set(varName(f.k), f);
  const extra = {
    study_id: ['Study ID (center code + number)'], center: ['Center code'], age: ['Age at enrollment', 'years'], bmi: ['Body mass index', 'kg/m²'], egfr: ['eGFR, CKD-EPI 2021', 'mL/min/1.73m²'], phenotype: ['HF phenotype (HFrEF <50%, HFpEF ≥50%)'], qrs_cat: ['QRS category', 'ms'],
    days_to_full_gdmt: ['Days from enrollment to full foundational therapy (4 classes HFrEF; MRA + SGLT2i HFpEF)', 'days'], status: ['Record status'], death: ['Died (1 = yes)'], death_days: ['Days from enrollment to death', 'days'], followup_days: ['Days of follow-up (death or censoring)', 'days'],
    death_cause_final: ['Cause of death (adjudicated if available)', '', DEATH_CAUSE], hfh_count: ['Number of HF hospitalizations after enrollment'], first_hfh_or_death_days: ['Days to first HF hospitalization or death (or censoring)', 'days'], first_hfh_or_death: ['First HF hospitalization or death occurred (1 = yes)'],
  };
  const rows = [['table', 'variable', 'label', 'type', 'codes', 'units']];
  const add = (table, list) => {
    const keys = new Set(); for (const r of list) Object.keys(r).forEach(k => keys.add(k));
    for (const k of keys) {
      const f = fields.get(k); const e = extra[k];
      let label = f?.label || e?.[0] || k.replace(/_/g, ' ');
      if (/^(bl|dc|v)_(RAS|BB|MRA|SGLT2)_/.test(k)) { const [, tp, g, what] = k.match(/^(bl|dc|v)_(RAS|BB|MRA|SGLT2)_(.*)$/); label = `${{ bl: 'Baseline', dc: 'Discharge', v: 'Visit' }[tp]} ${L.SHORT_LABEL[g]}: ${{ on: 'prescribed (1 = yes)', drug: 'drug name', mgday: 'total mg per day', pcttarget: '% of target dose' }[what]}`; }
      if (/^(bl|dc|v)_fmt_count$/.test(k)) label = 'Number of foundational drug classes (0–4)';
      if (/^kccq_bl_/.test(k)) label = 'KCCQ-12 baseline score: ' + k.slice(8);
      const opts = f?.opts || e?.[2];
      const type = list.some(r => typeof r[k] === 'number') ? 'numeric' : 'string';
      rows.push([table, k, label, type, opts ? opts.map(([a, b]) => `${a}=${b}`).join('; ') : '', f?.unit || (f?.lab ? L.LAB_UNITS[f.lab].std : '') || e?.[1] || '']);
    }
  };
  add('patients', patients); add('visits', visits);
  return rows;
}

function toCSV(list) {
  if (Array.isArray(list[0])) return list.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const cols = [...new Set(list.flatMap(r => Object.keys(r)))];
  return [cols.join(','), ...list.map(r => cols.map(c => { const v = r[c]; return v == null ? '' : typeof v === 'number' ? v : `"${String(v).replace(/"/g, '""')}"`; }).join(','))].join('\n');
}
function save(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

async function download(t, opt) {
  const stamp = new Date().toISOString().slice(0, 10);
  if (opt.format === 'xlsx') {
    await loadScript('assets/vendor/xlsx.full.min.js');
    const wb = XLSX.utils.book_new();
    for (const name of ['patients', 'visits', 'events', 'titrations']) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t[name]), name);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.dictionary), 'data_dictionary');
    XLSX.writeFile(wb, `jo-chf-export-${stamp}.xlsx`);
    return;
  }
  const bom = '﻿';
  for (const name of ['patients', 'visits', 'events', 'titrations']) save(`jochf_${name}_${stamp}.csv`, bom + toCSV(t[name]), 'text/csv');
  save(`jochf_data_dictionary_${stamp}.csv`, bom + toCSV(t.dictionary), 'text/csv');
  const coded = t.dictionary.slice(1).filter(r => r[0] === 'patients' && r[4]);
  if (opt.format === 'spss') {
    const lab = t.dictionary.slice(1).filter(r => r[0] === 'patients');
    const sps = `* Jo-CHF export ${stamp}. Put this file in the same folder as the CSV files, then run all.\nGET DATA /TYPE=TXT /FILE='jochf_patients_${stamp}.csv' /ENCODING='UTF8' /DELCASE=LINE /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /IMPORTCASE=ALL /AUTODETECT.\nDATASET NAME patients.\nVARIABLE LABELS\n${lab.map(r => `  ${r[1]} "${r[2].replace(/"/g, "'").slice(0, 250)}"`).join('\n')}.\n* Value labels for coded variables are listed in the data dictionary (string codes).\nEXECUTE.\n`;
    save(`jochf_read_${stamp}.sps`, sps, 'text/plain');
  }
  if (opt.format === 'r') {
    const fac = coded.map(r => { const pairs = r[4].split('; ').map(s => s.split('=')); return `if ("${r[1]}" %in% names(patients)) patients$${r[1]} <- factor(patients$${r[1]}, levels = c(${pairs.map(p => JSON.stringify(p[0])).join(', ')}), labels = c(${pairs.map(p => JSON.stringify(p.slice(1).join('='))).join(', ')}))`; }).join('\n');
    const rs = `# Jo-CHF export ${stamp}\n# Put this script in the same folder as the CSV files and run it.\npatients    <- read.csv("jochf_patients_${stamp}.csv", fileEncoding = "UTF-8-BOM", stringsAsFactors = FALSE)\nvisits      <- read.csv("jochf_visits_${stamp}.csv", fileEncoding = "UTF-8-BOM", stringsAsFactors = FALSE)\nevents      <- read.csv("jochf_events_${stamp}.csv", fileEncoding = "UTF-8-BOM", stringsAsFactors = FALSE)\ntitrations  <- read.csv("jochf_titrations_${stamp}.csv", fileEncoding = "UTF-8-BOM", stringsAsFactors = FALSE)\ndictionary  <- read.csv("jochf_data_dictionary_${stamp}.csv", fileEncoding = "UTF-8-BOM", stringsAsFactors = FALSE)\n\n# Factor labels\n${fac}\n\n# Example: Kaplan-Meier survival by phenotype\n# library(survival)\n# fit <- survfit(Surv(followup_days, death) ~ phenotype, data = patients)\n# plot(fit, col = c("#2a78d6", "#eb6834"), xlab = "Days", ylab = "Survival")\n`;
    save(`jochf_read_${stamp}.R`, rs, 'text/plain');
  }
}
