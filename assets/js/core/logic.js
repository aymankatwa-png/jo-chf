// Jo-CHF clinical logic. Pure functions, no DOM, no network.
// Shared by the website (browser) and the backend (Cloudflare Worker).

// ---------- dates (stored as ISO "YYYY-MM-DD", shown as DD/MM/YYYY) ----------
export const DAY = 86400000;
export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 15));
  return isNaN(d) ? null : d;
}
export function toISO(d) { return d ? new Date(d).toISOString().slice(0, 10) : ''; }
export function fmtDate(s) {
  const d = parseISO(s); if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
export function dmyToISO(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (d.getUTCDate() !== +m[1] || d.getUTCMonth() !== +m[2] - 1) return null;
  return toISO(d);
}
export function daysBetween(a, b) {
  const x = parseISO(a), y = parseISO(b);
  if (!x || !y) return null;
  return Math.round((y - x) / DAY);
}
export function addDays(s, n) { const d = parseISO(s); return d ? toISO(new Date(+d + n * DAY)) : ''; }
export function todayISO(now = Date.now()) { return toISO(new Date(now)); }

// ---------- object paths ----------
export function getPath(o, path) {
  return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}
export function setPath(o, path, v) {
  const ks = path.split('.'); let a = o;
  for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; }
  if (v === undefined) delete a[ks[ks.length - 1]]; else a[ks[ks.length - 1]] = v;
}
export function isFilled(v) {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return !isNaN(v);
  return true;
}
export function num(v) { const n = typeof v === 'number' ? v : parseFloat(v); return isNaN(n) ? null : n; }
export function round(v, d = 0) { if (v == null || isNaN(v)) return null; const f = 10 ** d; return Math.round(v * f) / f; }

// ---------- body + kidney ----------
export function ageAt(dob, ref) {
  const a = parseISO(dob), b = parseISO(ref);
  if (!a || !b) return null;
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  const md = (b.getUTCMonth() - a.getUTCMonth()) || (b.getUTCDate() - a.getUTCDate());
  if (md < 0) y--;
  return y;
}
export function bmi(weightKg, heightCm) {
  const w = num(weightKg), h = num(heightCm);
  if (!w || !h) return null;
  return round(w / ((h / 100) ** 2), 1);
}
// CKD-EPI 2021 (race-free). creatinine in µmol/L.
export function egfrCKDEPI2021(creatUmol, age, sex) {
  const c = num(creatUmol); if (!c || age == null || !sex) return null;
  const scr = c / 88.42;
  const female = sex === 'F';
  const k = female ? 0.7 : 0.9, a = female ? -0.241 : -0.302;
  const v = 142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
  return round(v, 0);
}
export function egfrStage(e) {
  if (e == null) return null;
  if (e >= 90) return 'G1'; if (e >= 60) return 'G2'; if (e >= 45) return 'G3a';
  if (e >= 30) return 'G3b'; if (e >= 15) return 'G4'; return 'G5';
}

// ---------- unit conversion: every lab is stored in one standard unit ----------
export const LAB_UNITS = {
  ntprobnp: { std: 'pg/mL', units: { 'pg/mL': 1, 'ng/L': 1, 'pmol/L': 8.457 } },
  bnp: { std: 'pg/mL', units: { 'pg/mL': 1, 'ng/L': 1, 'pmol/L': 3.467 } },
  creat: { std: 'µmol/L', units: { 'µmol/L': 1, 'mg/dL': 88.42 } },
  urea: { std: 'mmol/L', units: { 'mmol/L': 1, 'mg/dL (urea)': 1 / 6.006, 'mg/dL (BUN)': 0.357 } },
  na: { std: 'mmol/L', units: { 'mmol/L': 1, 'mEq/L': 1 } },
  k: { std: 'mmol/L', units: { 'mmol/L': 1, 'mEq/L': 1 } },
  hb: { std: 'g/dL', units: { 'g/dL': 1, 'g/L': 0.1, 'mmol/L': 1.611 } },
  iron: { std: 'µmol/L', units: { 'µmol/L': 1, 'µg/dL': 0.179 } },
  ferritin: { std: 'ng/mL', units: { 'ng/mL': 1, 'µg/L': 1 } },
  tsat: { std: '%', units: { '%': 1 } },
  uacr: { std: 'mg/g', units: { 'mg/g': 1, 'mg/mmol': 8.84 } },
  hba1c: { std: '%', units: { '%': 1, 'mmol/mol': null } },
  tsh: { std: 'mIU/L', units: { 'mIU/L': 1, 'µIU/mL': 1 } },
};
export function toStdUnit(lab, value, unit) {
  const v = num(value); if (v == null) return null;
  const def = LAB_UNITS[lab]; if (!def || !unit || unit === def.std) return v;
  if (lab === 'hba1c' && unit === 'mmol/mol') return round(v / 10.929 + 2.15, 1);
  const f = def.units[unit]; return f == null ? v : round(v * f, 2);
}

// ---------- classification ----------
// ESC 2026 classification used by the protocol: HFrEF < 50%, HFpEF >= 50%.
export function phenotype(lvef) {
  const v = num(lvef); if (v == null) return null;
  return v < 50 ? 'HFrEF' : 'HFpEF';
}
export function qrsCategory(ms) {
  const v = num(ms); if (v == null) return null;
  if (v >= 150) return '≥150'; if (v >= 130) return '130–149'; return '<130';
}

// ---------- KCCQ-12 scoring ----------
// Items stored as codes. q1a-c / q8a-c: 1-5, 6 = limited for other reasons (treated as missing).
// q2, q5, q6, q7: 1-5. q3, q4: 1-7. Higher code = better health.
export const KCCQ_ITEMS = [
  { k: 'q1a', d: 'PL', max: 5, other: 6 }, { k: 'q1b', d: 'PL', max: 5, other: 6 }, { k: 'q1c', d: 'PL', max: 5, other: 6 },
  { k: 'q2', d: 'SF', max: 5 }, { k: 'q3', d: 'SF', max: 7 }, { k: 'q4', d: 'SF', max: 7 }, { k: 'q5', d: 'SF', max: 5 },
  { k: 'q6', d: 'QL', max: 5 }, { k: 'q7', d: 'QL', max: 5 },
  { k: 'q8a', d: 'SL', max: 5, other: 6 }, { k: 'q8b', d: 'SL', max: 5, other: 6 }, { k: 'q8c', d: 'SL', max: 5, other: 6 },
];
const KCCQ_MIN = { PL: 2, SF: 2, QL: 1, SL: 2 };
export function kccqScores(ans) {
  if (!ans) return null;
  const buckets = { PL: [], SF: [], QL: [], SL: [] };
  for (const it of KCCQ_ITEMS) {
    const v = num(ans[it.k]);
    if (v == null || (it.other && v === it.other) || v < 1 || v > it.max) continue;
    buckets[it.d].push(100 * (v - 1) / (it.max - 1));
  }
  const out = {};
  for (const d of Object.keys(buckets)) {
    const b = buckets[d];
    out[d] = b.length >= KCCQ_MIN[d] ? round(b.reduce((a, x) => a + x, 0) / b.length, 1) : null;
  }
  const doms = ['PL', 'SF', 'QL', 'SL'].map(d => out[d]).filter(v => v != null);
  out.summary = doms.length ? round(doms.reduce((a, x) => a + x, 0) / doms.length, 1) : null;
  return out;
}

// ---------- medications ----------
export const FREQ = { od: 1, bd: 2, tds: 3, qds: 4 };
export const FREQ_LABEL = { od: 'once daily', bd: 'twice daily', tds: 'three times daily', qds: 'four times daily' };
export const FOUNDATIONAL = ['RAS', 'BB', 'MRA', 'SGLT2'];
export const CLASS_LABEL = { RAS: 'ARNI / ACEi / ARB', ARNI: 'ARNI', ACEI: 'ACE inhibitor', ARB: 'ARB', BB: 'Beta-blocker', MRA: 'MRA', SGLT2: 'SGLT2 inhibitor' };
export const SHORT_LABEL = { RAS: 'RASi/ARNI', BB: 'Beta-blocker', MRA: 'MRA', SGLT2: 'SGLT2i' };

// Default target doses (ESC). Admins can edit these inside the system.
// targetDaily = total mg per day used for % of target; label = how it is written in the guideline.
export const DEFAULT_TARGETS = [
  { drug: 'Sacubitril/valsartan', cls: 'ARNI', targetDaily: 400, label: '97/103 mg twice daily', unitNote: 'dose as total mg of the combination (e.g. 49/51 = 100 mg)' },
  { drug: 'Enalapril', cls: 'ACEI', targetDaily: 20, label: '10–20 mg twice daily' },
  { drug: 'Ramipril', cls: 'ACEI', targetDaily: 10, label: '10 mg daily' },
  { drug: 'Lisinopril', cls: 'ACEI', targetDaily: 20, label: '20–35 mg daily' },
  { drug: 'Captopril', cls: 'ACEI', targetDaily: 150, label: '50 mg three times daily' },
  { drug: 'Perindopril', cls: 'ACEI', targetDaily: 8, label: '8–16 mg daily' },
  { drug: 'Candesartan', cls: 'ARB', targetDaily: 32, label: '32 mg daily' },
  { drug: 'Valsartan', cls: 'ARB', targetDaily: 320, label: '160 mg twice daily' },
  { drug: 'Losartan', cls: 'ARB', targetDaily: 150, label: '150 mg daily' },
  { drug: 'Bisoprolol', cls: 'BB', targetDaily: 10, label: '10 mg daily' },
  { drug: 'Carvedilol', cls: 'BB', targetDaily: 50, targetDailyHeavy: 100, heavyKg: 85, label: '25 mg twice daily (50 mg twice daily if over 85 kg)' },
  { drug: 'Metoprolol succinate', cls: 'BB', targetDaily: 200, label: '200 mg daily' },
  { drug: 'Nebivolol', cls: 'BB', targetDaily: 10, label: '10 mg daily' },
  { drug: 'Spironolactone', cls: 'MRA', targetDaily: 50, label: '50 mg daily' },
  { drug: 'Eplerenone', cls: 'MRA', targetDaily: 50, label: '50 mg daily' },
  { drug: 'Dapagliflozin', cls: 'SGLT2', targetDaily: 10, label: '10 mg daily' },
  { drug: 'Empagliflozin', cls: 'SGLT2', targetDaily: 10, label: '10 mg daily' },
];
export function foundationalGroup(cls) { return ['ARNI', 'ACEI', 'ARB'].includes(cls) ? 'RAS' : cls; }

export function dailyDose(med) { const d = num(med?.dose); return d == null ? null : d * (FREQ[med.freq] || 1); }
export function targetFor(drug, targets, weightKg) {
  const t = (targets || DEFAULT_TARGETS).find(x => x.drug === drug);
  if (!t) return null;
  const w = num(weightKg);
  if (t.targetDailyHeavy && w != null && w > (t.heavyKg || 85)) return t.targetDailyHeavy;
  return t.targetDaily;
}

// Summarise a medication snapshot: which foundational groups are on board and at what % of target.
export function gdmtSummary(meds, targets, weightKg) {
  const per = {};
  for (const m of meds || []) {
    const t = (targets || DEFAULT_TARGETS).find(x => x.drug === m.drug);
    if (!t) continue;
    const g = foundationalGroup(t.cls);
    const daily = dailyDose(m);
    const target = targetFor(m.drug, targets, weightKg);
    const pct = daily != null && target ? round(100 * daily / target, 0) : null;
    if (!per[g] || (pct ?? 0) > (per[g].pct ?? 0)) per[g] = { drug: m.drug, cls: t.cls, daily, target, pct, ge50: pct != null && pct >= 50, ge100: pct != null && pct >= 100 };
  }
  const count = FOUNDATIONAL.filter(g => per[g]).length;
  const missing = FOUNDATIONAL.filter(g => !per[g]);
  const belowTarget = FOUNDATIONAL.filter(g => per[g] && g !== 'SGLT2' && !(per[g].pct >= 100));
  return { per, count, missing, belowTarget };
}
// Groups that need a documented reason (not prescribed, or below target).
export function gdmtNeedsReason(meds, targets, weightKg) {
  const s = gdmtSummary(meds, targets, weightKg);
  return [...s.missing, ...s.belowTarget];
}

// Apply titration log entries to a medication list (returns a new list).
export function applyTitration(meds, entry) {
  const list = (meds || []).map(m => ({ ...m }));
  const i = list.findIndex(m => m.drug === entry.drug || (entry.fromDrug && m.drug === entry.fromDrug));
  switch (entry.change) {
    case 'start': if (i < 0) list.push({ drug: entry.drug, dose: entry.dose, freq: entry.freq }); else Object.assign(list[i], { dose: entry.dose, freq: entry.freq }); break;
    case 'increase': case 'decrease': if (i >= 0) Object.assign(list[i], { dose: entry.dose, freq: entry.freq || list[i].freq }); else list.push({ drug: entry.drug, dose: entry.dose, freq: entry.freq }); break;
    case 'stop': if (i >= 0) list.splice(i, 1); break;
    case 'switch': if (i >= 0) list.splice(i, 1); list.push({ drug: entry.drug, dose: entry.dose, freq: entry.freq }); break;
  }
  return list;
}

// Medication timeline: every snapshot (baseline, discharge, follow-ups) and every titration entry, in date order.
export function medTimeline(patient, visits, titrations) {
  const pts = [];
  const b = patient.baselineMeds;
  if (b?.length || patient.enrollment?.enrollmentDate) {
    const date = patient.clinical?.setting === 'inpatient' ? (patient.hosp?.admitDate || patient.enrollment?.enrollmentDate) : patient.enrollment?.enrollmentDate;
    if (date) pts.push({ date, kind: 'snapshot', label: patient.clinical?.setting === 'inpatient' ? 'Admission' : 'Enrollment', meds: b || [] });
  }
  if (patient.clinical?.setting === 'inpatient' && patient.hosp?.dischargeDate && patient.hosp?.dischargeMeds)
    pts.push({ date: patient.hosp.dischargeDate, kind: 'snapshot', label: 'Discharge', meds: patient.hosp.dischargeMeds });
  for (const v of visits || []) if (v.status === 'done' && v.date && v.meds) pts.push({ date: v.date, kind: 'snapshot', label: VISIT_LABEL[v.visit] || v.visit, meds: v.meds });
  for (const t of titrations || []) if (t.date) pts.push({ date: t.date, kind: 'titration', entry: t });
  pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'snapshot' ? -1 : 1)));
  let state = []; const out = [];
  for (const p of pts) {
    state = p.kind === 'snapshot' ? p.meds.map(m => ({ ...m })) : applyTitration(state, p.entry);
    out.push({ date: p.date, kind: p.kind, label: p.label, entry: p.entry, meds: state });
  }
  return out;
}
// Current medication list (for pre-filling the next snapshot).
export function currentMeds(patient, visits, titrations, beforeDate) {
  const tl = medTimeline(patient, visits, titrations).filter(p => !beforeDate || p.date <= beforeDate);
  return tl.length ? tl[tl.length - 1].meds.map(m => ({ ...m })) : [];
}
// Milestones: date of full foundational therapy, first date at target per group.
export function gdmtMilestones(patient, visits, titrations, targets) {
  const tl = medTimeline(patient, visits, titrations);
  const pheno = phenotype(patient.echo?.lvef);
  const w = patient.demographics?.weight;
  const enroll = patient.enrollment?.enrollmentDate;
  let fullDate = null; const targetDate = {};
  for (const p of tl) {
    const s = gdmtSummary(p.meds, targets, w);
    const full = pheno === 'HFpEF' ? (s.per.MRA && s.per.SGLT2) : s.count === 4;
    if (full && !fullDate) fullDate = p.date;
    for (const g of FOUNDATIONAL) if (s.per[g]?.ge100 && !targetDate[g]) targetDate[g] = p.date;
  }
  return { fullDate, daysToFull: fullDate && enroll ? Math.max(0, daysBetween(enroll, fullDate)) : null, targetDate };
}

// ---------- follow-up windows ----------
export const VISITS = [
  { key: 'd30', label: '30 days', target: 30, lo: 23, hi: 37, method: 'Phone or clinic' },
  { key: 'm6', label: '6 months', target: 180, lo: 150, hi: 210, method: 'Clinic preferred, phone accepted' },
  { key: 'm12', label: '12 months', target: 365, lo: 335, hi: 395, method: 'Clinic preferred, phone accepted' },
];
export const VISIT_LABEL = { d30: '30 days', m6: '6 months', m12: '12 months', enrollment: 'Enrollment', admission: 'Admission', discharge: 'Discharge' };
export function windowBaseDate(patient, settings) {
  const base = settings?.windowBase || 'enrollment';
  if (base === 'discharge' && patient.clinical?.setting === 'inpatient' && patient.hosp?.dischargeDate) return patient.hosp.dischargeDate;
  return patient.enrollment?.enrollmentDate;
}
// Status of each follow-up visit for a patient.
export function visitSchedule(patient, visits, settings, today) {
  const base = windowBaseDate(patient, settings);
  const ended = patient.death?.date || (patient.withdrawal?.date);
  return VISITS.map(v => {
    const rec = (visits || []).find(x => x.visit === v.key);
    const due = base ? addDays(base, v.target) : null;
    const open = base ? addDays(base, v.lo) : null;
    const close = base ? addDays(base, v.hi) : null;
    let status;
    if (rec?.status === 'done') status = 'done';
    else if (rec?.status === 'ltfu') status = 'ltfu';
    else if (ended && (!open || open > ended || patient.death)) status = 'cancelled';
    else if (!base) status = 'unknown';
    else if (today > close) status = 'missed';
    else if (today >= open) status = 'open';
    else if (daysBetween(today, open) <= 7) status = 'soon';
    else status = 'upcoming';
    return { ...v, due, open, close, status, record: rec || null, attempts: rec?.attempts?.length || 0 };
  });
}
export function nextDue(schedule) {
  return schedule.find(s => ['open', 'soon', 'upcoming', 'missed'].includes(s.status)) || null;
}

// ---------- hospitalization classification (protocol definition) ----------
export function isHFHospitalization(ev) {
  if (!ev || ev.type !== 'admission' || ev.reason !== 'hf') return false;
  const los = daysBetween(ev.admitDate, ev.dischargeDate);
  const stay24 = ev.stay24h === true || (los != null && los >= 1);
  return !ev.planned && stay24 && !!(ev.ivDiuretics || ev.vasoactive || ev.mcs);
}

// ---------- record status ----------
export function recordStatus(patient) {
  if (patient.death?.date) return 'deceased';
  if (patient.withdrawal?.date) return 'withdrawn';
  if (patient.locked) return 'locked';
  if (patient.ltfu) return 'lost';
  return patient.complete ? 'complete' : 'incomplete';
}
export const STATUS_LABEL = { incomplete: 'Incomplete', complete: 'Complete', locked: 'Locked', deceased: 'Deceased', lost: 'Lost to follow-up', withdrawn: 'Withdrawn' };

// ---------- range checks ----------
// hard = value is blocked; soft = value is saved but flagged for review.
export const RANGE_RULES = [
  { path: 'echo.lvef', min: 5, max: 85, hard: true, label: 'LVEF', unit: '%' },
  { path: 'echo.prevLvef', min: 5, max: 85, hard: true, label: 'Previous LVEF', unit: '%' },
  { path: 'labs.k', min: 2, max: 8, hard: true, label: 'Potassium', unit: 'mmol/L' },
  { path: 'labs.na', min: 110, max: 170, hard: true, label: 'Sodium', unit: 'mmol/L' },
  { path: 'clinical.sbp', min: 50, max: 260, hard: true, label: 'Systolic BP', unit: 'mmHg' },
  { path: 'clinical.dbp', min: 20, max: 160, hard: true, label: 'Diastolic BP', unit: 'mmHg' },
  { path: 'clinical.hr', min: 20, max: 250, hard: true, label: 'Heart rate', unit: 'bpm' },
  { path: 'demographics.weight', min: 25, max: 300, hard: true, label: 'Weight', unit: 'kg' },
  { path: 'demographics.height', min: 120, max: 220, hard: true, label: 'Height', unit: 'cm' },
  { path: 'labs.hb', min: 4, max: 22, hard: true, label: 'Hemoglobin', unit: 'g/dL' },
  { path: 'labs.creat', min: 20, max: 1500, hard: true, label: 'Creatinine', unit: 'µmol/L' },
  { path: 'ecg.qrs', min: 60, max: 260, hard: true, label: 'QRS duration', unit: 'ms' },
  { path: 'labs.tsat', min: 1, max: 100, hard: true, label: 'TSAT', unit: '%' },
  { path: 'labs.ntprobnp', min: 5, max: 70000, hard: true, label: 'NT-proBNP', unit: 'pg/mL' },
  { path: 'labs.bnp', min: 1, max: 5000, hard: true, label: 'BNP', unit: 'pg/mL' },
  // soft: unusual but possible
  { path: 'labs.k', min: 3, max: 6, label: 'Potassium', unit: 'mmol/L' },
  { path: 'clinical.sbp', min: 70, max: 220, label: 'Systolic BP', unit: 'mmHg' },
  { path: 'clinical.hr', min: 35, max: 160, label: 'Heart rate', unit: 'bpm' },
  { path: 'labs.na', min: 125, max: 150, label: 'Sodium', unit: 'mmol/L' },
];
export const VISIT_RANGE_RULES = [
  { path: 'sbp', min: 50, max: 260, hard: true, label: 'Systolic BP' },
  { path: 'dbp', min: 20, max: 160, hard: true, label: 'Diastolic BP' },
  { path: 'hr', min: 20, max: 250, hard: true, label: 'Heart rate' },
  { path: 'weight', min: 25, max: 300, hard: true, label: 'Weight' },
  { path: 'labs.k', min: 2, max: 8, hard: true, label: 'Potassium' },
  { path: 'labs.na', min: 110, max: 170, hard: true, label: 'Sodium' },
];
export function rangeIssues(obj, rules = RANGE_RULES) {
  const out = [];
  for (const r of rules) {
    const v = num(getPath(obj, r.path));
    if (v == null) continue;
    if (v < r.min || v > r.max) {
      if (r.hard) out.push({ path: r.path, level: 'error', msg: `${r.label} ${v} is outside the allowed range ${r.min}–${r.max}${r.unit ? ' ' + r.unit : ''}.` });
      else if (!out.some(o => o.path === r.path)) out.push({ path: r.path, level: 'warn', msg: `${r.label} ${v} is unusual (expected ${r.min}–${r.max}). Please double-check.` });
    }
  }
  return out;
}
export function dateIssues(patient, today) {
  const out = []; const e = patient.enrollment || {};
  const dates = [
    ['enrollment.visitDate', e.visitDate, 'Admission / clinic visit date'], ['enrollment.enrollmentDate', e.enrollmentDate, 'Enrollment date'],
    ['enrollment.consentDate', e.consentDate, 'Consent date'], ['demographics.dob', patient.demographics?.dob, 'Date of birth'],
    ['echo.date', patient.echo?.date, 'Echo date'], ['labs.date', patient.labs?.date, 'Lab date'],
    ['hosp.admitDate', patient.hosp?.admitDate, 'Admission date'], ['hosp.dischargeDate', patient.hosp?.dischargeDate, 'Discharge date'],
    ['death.date', patient.death?.date, 'Date of death'],
  ];
  for (const [p, v, l] of dates) if (v && v > today) out.push({ path: p, level: 'error', msg: `${l} is in the future.` });
  if (e.consentDate && e.enrollmentDate && e.consentDate > e.enrollmentDate) out.push({ path: 'enrollment.consentDate', level: 'error', msg: 'Consent must be signed on or before the enrollment date.' });
  if (patient.hosp?.admitDate && patient.hosp?.dischargeDate && patient.hosp.dischargeDate < patient.hosp.admitDate) out.push({ path: 'hosp.dischargeDate', level: 'error', msg: 'Discharge date is before admission date.' });
  const age = ageAt(patient.demographics?.dob, e.enrollmentDate);
  if (age != null && age < 18) out.push({ path: 'demographics.dob', level: 'error', msg: `Age at enrollment is ${age}. The registry includes adults 18 years or older only.` });
  return out;
}

// ---------- completeness ----------
// Required baseline fields. A field also counts as complete when it is marked "not done" or "unknown".
export function requiredFields(patient) {
  const f = [
    'enrollment.visitDate', 'enrollment.enrollmentDate', 'enrollment.consentDate',
    'enrollment.inclusion.age18', 'enrollment.inclusion.hfDx', 'enrollment.inclusion.stageCD',
    'demographics.dob', 'demographics.sex', 'demographics.governorate', 'demographics.coverage', 'demographics.smoking',
    'demographics.weight', 'demographics.height',
    'clinical.setting', 'clinical.hfType', 'clinical.stage', 'clinical.nyha', 'clinical.hfHosp12m',
    'clinical.sbp', 'clinical.dbp', 'clinical.hr',
    'etiology.primary',
    'echo.date', 'echo.lvef', 'echo.method',
    'labs.date', 'labs.natriuretic', 'labs.creat', 'labs.na', 'labs.k', 'labs.hb',
    'ecg.rhythm', 'ecg.qrs',
    'baselineMeds',
  ];
  if (patient.clinical?.setting === 'inpatient') f.push('hosp.admitDate', 'hosp.dischargeDate');
  return f;
}
export function fieldValue(patient, path) {
  if (path === 'labs.natriuretic') return isFilled(patient.labs?.ntprobnp) || isFilled(patient.labs?.bnp) ? 1 : undefined;
  if (path === 'baselineMeds') return patient.baselineMedsReviewed ? 1 : undefined;
  if (path.startsWith('enrollment.inclusion.')) return getPath(patient, path) === true ? 1 : undefined;
  return getPath(patient, path);
}
export function completeness(patient) {
  const req = requiredFields(patient);
  const missing = req.filter(p => !isFilled(fieldValue(patient, p)) && !(patient.notDone && patient.notDone[p]));
  return { total: req.length, filled: req.length - missing.length, pct: Math.round(100 * (req.length - missing.length) / req.length), missing };
}
// Everything that blocks "Mark complete".
export function completionBlockers(patient, targets, today) {
  const out = [];
  const c = completeness(patient);
  if (c.missing.length) out.push(...c.missing.map(p => ({ path: p, msg: 'Required field is empty (fill it, or mark it not done / unknown).' })));
  for (const i of [...rangeIssues(patient), ...dateIssues(patient, today)]) if (i.level === 'error') out.push(i);
  const meds = patient.baselineMeds || [];
  const need = gdmtNeedsReason(meds, targets, patient.demographics?.weight);
  for (const g of need) if (!(patient.baselineReasons?.[g]?.length)) out.push({ path: `baselineReasons.${g}`, msg: `${SHORT_LABEL[g]}: choose a reason why it is not prescribed or below target.` });
  if (patient.clinical?.setting === 'inpatient' && patient.hosp?.dischargeMeds) {
    const needD = gdmtNeedsReason(patient.hosp.dischargeMeds, targets, patient.demographics?.weight);
    for (const g of needD) if (!(patient.hosp?.dischargeReasons?.[g]?.length)) out.push({ path: `hosp.dischargeReasons.${g}`, msg: `Discharge ${SHORT_LABEL[g]}: choose a reason why it is not prescribed or below target.` });
  }
  return out;
}

// ---------- eligibility ----------
export const INCLUSION = [
  { k: 'age18', label: 'Age 18 years or older' },
  { k: 'hfDx', label: 'HF diagnosis per ESC 2026 criteria (symptoms and signs plus elevated natriuretic peptide and/or echocardiographic findings)' },
  { k: 'stageCD', label: 'HF stage C or D' },
];
export const EXCLUSION = [
  { k: 'congenital', label: 'Congenital heart disease as the cause of HF' },
  { k: 'acuteMI', label: 'Acute myocardial infarction as the primary cause' },
  { k: 'survival', label: 'Expected survival under 30 days due to a non-cardiac condition' },
  { k: 'unable', label: 'Unable to consent or to complete follow-up' },
  { k: 'previous', label: 'Previously enrolled in Jo-CHF' },
];
export function eligibility(enr) {
  const inc = enr?.inclusion || {}, exc = enr?.exclusion || {};
  const failedInc = INCLUSION.filter(i => inc[i.k] !== true);
  const hitExc = EXCLUSION.filter(i => exc[i.k] === true);
  return { eligible: !failedInc.length && !hitExc.length && !!enr?.consentDate, failedInc, hitExc, consent: !!enr?.consentDate };
}

// ---------- guideline care opportunities (decision support flags, not orders) ----------
export function careGaps(patient, meds, latestLabs) {
  const gaps = [];
  const pheno = phenotype(patient.echo?.lvef);
  const lvef = num(patient.echo?.lvef);
  const labs = latestLabs || patient.labs || {};
  const egfr = labs.egfr ?? patient.derived?.egfr;
  const s = gdmtSummary(meds, null, patient.demographics?.weight);
  if (pheno === 'HFrEF') {
    for (const g of s.missing) gaps.push({ k: 'missing_' + g, level: 'high', text: `${SHORT_LABEL[g]} not prescribed (HFrEF)` });
    for (const g of s.belowTarget) if (s.per[g].pct < 50) gaps.push({ k: 'low_' + g, level: 'mid', text: `${SHORT_LABEL[g]} below 50% of target dose (${s.per[g].pct}%)` });
  } else if (pheno === 'HFpEF') {
    if (s.missing.includes('SGLT2')) gaps.push({ k: 'missing_SGLT2', level: 'high', text: 'SGLT2i not prescribed (HFpEF)' });
  }
  const fer = num(labs.ferritin), tsat = num(labs.tsat);
  const ironDef = fer != null && (fer < 100 || (fer <= 299 && tsat != null && tsat < 20));
  if (ironDef && !patient.amt?.ivIron?.given) gaps.push({ k: 'iron', level: 'mid', text: 'Iron deficiency without IV iron' });
  const qrs = num(patient.ecg?.qrs);
  const crt = ['crtp', 'crtd', 'csp'].some(d => ['present', 'implanted'].includes(patient.devices?.[d]?.status));
  if (lvef != null && lvef <= 35 && qrs >= 150 && patient.ecg?.lbbb && patient.ecg?.rhythm === 'sinus' && !crt) gaps.push({ k: 'crt', level: 'high', text: 'Possible CRT candidate (LVEF ≤35%, LBBB, QRS ≥150 ms)' });
  const icd = ['icd', 'crtd'].some(d => ['present', 'implanted'].includes(patient.devices?.[d]?.status));
  if (lvef != null && lvef <= 35 && !icd && patient.etiology?.primary === 'ihd') gaps.push({ k: 'icd', level: 'mid', text: 'Ischemic LVEF ≤35% without ICD: review indication' });
  if (egfr != null && egfr < 20 && s.per.SGLT2) gaps.push({ k: 'egfr', level: 'info', text: `eGFR ${egfr}: review SGLT2i continuation` });
  const k = num(labs.k);
  if (k != null && k > 5.5 && s.per.MRA) gaps.push({ k: 'k', level: 'mid', text: `Potassium ${k} on MRA` });
  return gaps;
}

// ---------- derived values stored with each record (for fast lists and analytics) ----------
export function derive(patient, ctx = {}) {
  const e = patient.enrollment || {};
  const age = ageAt(patient.demographics?.dob, e.enrollmentDate);
  const egfr = egfrCKDEPI2021(patient.labs?.creat, age, patient.demographics?.sex);
  const meds = ctx.visits || ctx.titrations ? currentMeds(patient, ctx.visits, ctx.titrations) : (patient.baselineMeds || []);
  const s = gdmtSummary(meds, ctx.targets, patient.demographics?.weight);
  return {
    age, bmi: bmi(patient.demographics?.weight, patient.demographics?.height), egfr, egfrStage: egfrStage(egfr),
    phenotype: phenotype(patient.echo?.lvef), qrsCat: qrsCategory(patient.ecg?.qrs),
    kccq: kccqScores(patient.kccq), fmtCount: s.count, status: recordStatus(patient),
    completeness: completeness(patient).pct,
    los: daysBetween(patient.hosp?.admitDate, patient.hosp?.dischargeDate),
  };
}

// Full derived block stored on each patient (used by lists, dashboard cards and analytics).
export function computeDerived(p, bundle, settings, today) {
  const b = bundle || { visits: [], events: [], titrations: [] };
  const d = derive(p, { ...b, targets: settings?.targets });
  const ms = gdmtMilestones(p, b.visits, b.titrations, settings?.targets);
  d.fullGdmtDate = ms.fullDate; d.daysToFull = ms.daysToFull;
  const nd = nextDue(visitSchedule(p, b.visits, settings, today));
  d.nextDue = nd ? { visit: nd.key, due: nd.due, status: nd.status } : null;
  d.hfHosps = (b.events || []).filter(isHFHospitalization).length;
  return d;
}
