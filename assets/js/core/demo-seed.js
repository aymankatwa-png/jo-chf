// Synthetic demo registry. Every patient here is invented; nothing comes from a real person.
// The same seed always produces the same registry, shifted so the last enrollment is "now".
import * as L from './logic.js';
import { hashPassword } from './crypto.js';
import { DEFAULT_SETTINGS } from './service.js';

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export const DEMO_CENTERS = [
  ['AMM01', 'Amman Center 01', 'Amman', 140, 1.35], ['AMM02', 'Amman Center 02', 'Amman', 120, 1.15], ['AMM03', 'Amman Center 03', 'Amman', 100, 0.95],
  ['IRB01', 'Irbid Center 01', 'Irbid', 100, 1.0], ['IRB02', 'Irbid Center 02', 'Irbid', 60, 0.55], ['ZRQ01', 'Zarqa Center 01', 'Zarqa', 80, 0.8],
  ['BLQ01', 'Salt Center 01', 'Balqa', 60, 0.6], ['KRK01', 'Karak Center 01', 'Karak', 60, 0.5], ['MFR01', 'Mafraq Center 01', 'Mafraq', 50, 0.42],
  ['AQB01', 'Aqaba Center 01', 'Aqaba', 50, 0.38], ['MDB01', 'Madaba Center 01', 'Madaba', 40, 0.35], ['JRS01', 'Jerash Center 01', 'Jerash', 40, 0.3],
];
export const DEMO_PASSWORD = 'demo1234';

const FIRST_M = ['Ahmad', 'Mohammad', 'Omar', 'Khaled', 'Yousef', 'Ibrahim', 'Mahmoud', 'Ali', 'Hasan', 'Saleh', 'Fadi', 'Nasser', 'Tareq', 'Ziad', 'Sami', 'Walid', 'Hani', 'Bilal', 'Jamal', 'Issa'];
const FIRST_F = ['Fatima', 'Maryam', 'Aisha', 'Huda', 'Rania', 'Lina', 'Noor', 'Salma', 'Reem', 'Dana', 'Hiba', 'Suha', 'Amal', 'Mona', 'Sawsan', 'Ghada', 'Layla', 'Nisreen', 'Basma', 'Rula'];
const LAST = ['Al-Khatib', 'Haddad', 'Al-Masri', 'Obeidat', 'Al-Zoubi', 'Nasrallah', 'Abu Hammad', 'Al-Momani', 'Qasem', 'Al-Shami', 'Rawashdeh', 'Bani Hani', 'Al-Tarawneh', 'Mahasneh', 'Al-Najjar', 'Smadi', 'Jaradat', 'Al-Hourani', 'Khasawneh', 'Al-Rifai', 'Salameh', 'Freihat'];

export async function buildDemo(today = L.todayISO(), cipher) {
  const r = rng(20261024);
  const pick = a => a[Math.floor(r() * a.length)];
  const chance = p => r() < p;
  const normal = (m, s) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wpick = obj => { const tot = Object.values(obj).reduce((a, b) => a + b, 0); let x = r() * tot; for (const [k, w] of Object.entries(obj)) { x -= w; if (x <= 0) return k; } return Object.keys(obj)[0]; };
  const day = n => L.addDays(today, n);
  const settings = { ...DEFAULT_SETTINGS };
  const T = settings.targets;
  const drugsOf = cls => T.filter(t => t.cls === cls);

  const pwHash = await hashPassword(DEMO_PASSWORD, 20000);
  const centers = DEMO_CENTERS.map(([code, name, city, target], i) => ({ id: 'c-' + code.toLowerCase(), code, name, city, target, active: true, nextSeq: 0 }));
  const users = [
    { id: 'u-admin1', username: 'admin@demo', name: 'Dr. Imad (PI)', role: 'admin', email: 'admin@demo', status: 'active', centerId: null },
    { id: 'u-admin2', username: 'coadmin@demo', name: 'Dr. Ayman (Co-PI)', role: 'admin', email: 'coadmin@demo', status: 'active', centerId: null },
    { id: 'u-admin3', username: 'sofian@demo', name: 'Sofian Zreigh', role: 'admin', email: 'sofian@demo', status: 'active', centerId: null },
    ...centers.map((c, i) => ({ id: 'u-' + c.code.toLowerCase(), username: c.code.toLowerCase() + '@demo', name: `Dr. ${pick(FIRST_M.concat(FIRST_F))} ${pick(LAST)}`, role: 'site', email: c.code.toLowerCase() + '@demo', status: 'active', centerId: c.id })),
    { id: 'u-pending1', username: 'new.doctor@demo', name: 'Dr. Lina Haddad', role: 'site', requestedRole: 'site', email: 'new.doctor@demo', status: 'pending', centerId: 'c-irb02', professionalId: 'JMA-48213' },
    { id: 'u-pending2', username: '1048', name: 'Research nurse Omar Smadi', role: 'site', requestedRole: 'site', email: '', status: 'pending', centerId: 'c-krk01', professionalId: 'JNC-1190' },
  ].map(u => ({ ...u, pwHash, createdAt: day(-400) + 'T08:00:00Z' }));

  const patients = [], idents = [], visits = [], events = [], titrations = [], queries = [], audit = [];
  const START = -430, END = -1;
  for (const [ci, c] of centers.entries()) {
    const productivity = DEMO_CENTERS[ci][4];
    const startOffset = ci < 4 ? 0 : Math.floor(r() * 70) + 10; // later centers joined later
    const n = Math.round(c.target * productivity * (0.62 + r() * 0.12));
    const enrollDays = [];
    for (let i = 0; i < n; i++) {
      // ramp-up: more enrollment as the registry matures
      const u = Math.pow(r(), 0.78);
      enrollDays.push(Math.round(START + startOffset + u * (END - START - startOffset)));
    }
    enrollDays.sort((a, b) => a - b);
    for (const ed of enrollDays) {
      c.nextSeq++;
      const id = `${c.code}-${String(c.nextSeq).padStart(4, '0')}`;
      const inpatient = chance(0.56);
      const hfref = chance(0.6);
      const sex = chance(hfref ? 0.72 : 0.52) ? 'M' : 'F';
      const age = Math.round(clamp(normal(hfref ? 61 : 67, 12), 22, 93));
      const enrollmentDate = day(ed);
      const visitDate = inpatient ? L.addDays(enrollmentDate, -Math.floor(r() * 3)) : enrollmentDate;
      const consentDate = enrollmentDate;
      const dob = L.addDays(enrollmentDate, -Math.round(age * 365.25 + r() * 300));
      const lvef = Math.round(hfref ? clamp(normal(30, 8), 10, 49) : clamp(normal(57, 5), 50, 75));
      const height = Math.round(sex === 'M' ? normal(171, 7) : normal(158, 6));
      const weight = Math.round(clamp(normal(sex === 'M' ? 84 : 76, 15), 42, 160) * 10) / 10;
      const bmi = L.bmi(weight, height);
      const nyha = inpatient ? wpick({ II: 8, III: 50, IV: 42 }) : wpick({ I: 10, II: 52, III: 33, IV: 5 });
      const stage = (nyha === 'IV' && chance(0.3)) || chance(0.03) ? 'D' : 'C';
      const primary = hfref ? wpick({ ihd: 52, dcm: 19, htn: 7, valvular: 7, tachy: 3, toxic: 2, peripartum: sex === 'F' ? 2 : 0, amyloid: 1, other: 5 }) : wpick({ htn: 44, ihd: 21, valvular: 12, amyloid: 4, hcm: 3, other: 14 });
      const has = p => (chance(p) ? 'yes' : 'no');
      const dm = has(0.47), htn = has(hfref ? 0.7 : 0.86), af = has(hfref ? 0.24 : 0.42), ckd = has(age > 70 ? 0.38 : 0.2);
      const rhythm = af === 'yes' && chance(0.6) ? 'af' : chance(0.04) ? 'paced' : 'sinus';
      const creat = Math.round(clamp(normal(ckd === 'yes' ? 150 : 95, ckd === 'yes' ? 45 : 22), 45, 420));
      const egfr = L.egfrCKDEPI2021(creat, age, sex);
      const ferritin = Math.round(clamp(Math.exp(normal(Math.log(130), 0.75)), 8, 1200));
      const tsat = Math.round(clamp(normal(21, 9), 4, 60));
      const ironTested = chance(0.74);
      const ironDef = ironTested && (ferritin < 100 || (ferritin <= 299 && tsat < 20));
      const hb = Math.round(clamp(normal(sex === 'M' ? 13.3 : 12.1, 1.7), 7, 18) * 10) / 10;
      const ntp = Math.round(clamp(Math.exp(normal(Math.log(inpatient ? 4200 : 1400) + (nyha === 'IV' ? 0.4 : 0), 0.85)), 150, 35000));
      const qrs = Math.round(clamp(normal(hfref ? 122 : 98, hfref ? 26 : 14), 70, 210));
      const lbbb = hfref && qrs >= 120 && chance(0.55);
      const smoking = [wpick({ never: 45, former: 26, cigarettes: 21, waterpipe: 8 })]; if (smoking[0] === 'cigarettes' && chance(0.25)) smoking.push('waterpipe');

      // baseline foundational therapy
      const meds = [];
      const doseFrac = () => wpick({ 0.125: 10, 0.25: 30, 0.5: 34, 1: 26 });
      const addMed = (cls, frac) => { const d = pick(drugsOf(cls)); const target = L.targetFor(d.drug, T, weight); const freq = /twice/.test(d.label) ? 'bd' : /three/.test(d.label) ? 'tds' : 'od'; const per = { od: 1, bd: 2, tds: 3 }[freq]; meds.push({ drug: d.drug, dose: Math.round((target * frac / per) * 100) / 100, freq }); };
      const ras = chance(hfref ? 0.79 : 0.6), bb = chance(hfref ? 0.83 : 0.55), mra = chance(hfref ? 0.56 : 0.34), sglt = chance(hfref ? 0.53 : 0.41);
      if (ras) addMed(wpick(hfref ? { ARNI: 35, ACEI: 40, ARB: 25 } : { ACEI: 45, ARB: 55 }), +doseFrac());
      if (bb) addMed('BB', +doseFrac());
      if (mra) addMed('MRA', chance(0.6) ? 0.5 : 1);
      if (sglt) addMed('SGLT2', 1);
      const reasons = {};
      for (const g of L.gdmtNeedsReason(meds, T, weight)) reasons[g] = [wpick({ titrating: 34, hypotension: 12, renal: 9, hyperkalemia: 6, bradycardia: 5, cost: 12, clinician: 14, intolerance: 4, refusal: 2, contra: 2 })];

      const p = {
        id, centerId: c.id, version: 1, createdAt: enrollmentDate + 'T09:00:00Z', createdBy: users.find(u => u.centerId === c.id).id,
        enrollment: { visitDate, enrollmentDate, consentDate, investigator: users.find(u => u.centerId === c.id).name, inclusion: { age18: true, hfDx: true, stageCD: true }, exclusion: {} },
        demographics: { dob, sex, governorate: chance(0.82) ? c.city : pick(['Amman', 'Zarqa', 'Irbid', 'Balqa', 'Mafraq']), education: wpick({ none: 8, primary: 22, secondary: 34, diploma: 14, university: 19, postgrad: 3 }), coverage: wpick({ moh: 46, rms: 24, private: 14, unrwa: 6, self: 9, other: 1 }), smoking, weight, height },
        clinical: { setting: inpatient ? 'inpatient' : 'outpatient', hfType: inpatient ? (chance(0.38) ? 'new' : 'decomp') : (chance(0.82) ? 'stable' : 'new'), firstDxDate: L.addDays(enrollmentDate, -Math.round(r() * 2500)).slice(0, 7), stage, nyha, hfHosp12m: inpatient ? wpick({ 0: 40, 1: 35, 2: 17, 3: 8 }) : wpick({ 0: 68, 1: 24, 2: 8 }), sbp: Math.round(clamp(normal(hfref ? 118 : 136, 20), 78, 210)), dbp: Math.round(clamp(normal(72, 12), 40, 115)), hr: Math.round(clamp(normal(inpatient ? 92 : 76, 15), 45, 150)), rhythm, edema: inpatient && chance(0.75) ? 'yes' : chance(0.2) ? 'yes' : 'no', jvp: inpatient && chance(0.55) ? 'yes' : 'no', rales: inpatient && chance(0.6) ? 'yes' : 'no' },
        etiology: { primary, contributing: htn === 'yes' && primary !== 'htn' && chance(0.4) ? ['htn'] : [], ihd: primary === 'ihd' ? [...(chance(0.6) ? ['mi'] : []), ...(chance(0.5) ? ['pci'] : []), ...(chance(0.15) ? ['cabg'] : []), 'ccs'] : undefined, valveType: primary === 'valvular' ? (chance(0.55) ? 'rheumatic' : 'degenerative') : undefined, valves: primary === 'valvular' ? [chance(0.7) ? 'mitral' : 'aortic'] : undefined },
        comorbid: { htn, htnYears: htn === 'yes' ? Math.round(r() * 20) + 1 : undefined, dm, dmType: dm === 'yes' ? (chance(0.95) ? 't2' : 't1') : undefined, dmYears: dm === 'yes' ? Math.round(r() * 18) + 1 : undefined, ckd, af, afType: af === 'yes' ? wpick({ paroxysmal: 35, persistent: 25, permanent: 40 }) : undefined, stroke: has(0.09), copd: has(0.11), obesity: bmi >= 30 ? 'yes' : 'no', osa: has(0.06), anemia: hb < (sex === 'M' ? 13 : 12) ? 'yes' : 'no', irondef: ironDef ? 'yes' : ironTested ? 'no' : 'unk', cancer: has(0.04), thyroid: has(0.08), depression: has(0.1), pad: has(0.07), liver: has(0.03) },
        echo: { date: L.addDays(enrollmentDate, -Math.floor(r() * 10)), lvef, method: wpick({ simpson: 55, visual: 40, other: 5 }), prevLvef: chance(0.3) ? Math.round(clamp(lvef + normal(0, 8), 10, 75)) : undefined, lvedd: hfref ? Math.round(normal(62, 7)) : Math.round(normal(49, 5)), tapse: Math.round(clamp(normal(hfref ? 16 : 20, 4), 6, 30)), pasp: Math.round(clamp(normal(42, 12), 18, 90)) },
        labs: { date: visitDate, ntprobnp: ntp, creat, urea: Math.round(clamp(normal(8.5, 3.5), 2.5, 35) * 10) / 10, na: Math.round(clamp(normal(137, 4), 120, 150)), k: Math.round(clamp(normal(4.4, 0.5), 2.9, 6.4) * 10) / 10, hb, iron: Math.round(clamp(normal(12, 5), 3, 30)), ferritin: ironTested ? ferritin : undefined, tsat: ironTested ? tsat : undefined, hba1c: dm === 'yes' ? Math.round(clamp(normal(7.8, 1.4), 5.5, 13) * 10) / 10 : Math.round(clamp(normal(5.6, 0.4), 4.5, 6.4) * 10) / 10, uacr: chance(0.5) ? Math.round(Math.exp(normal(Math.log(40), 1.2))) : undefined },
        ecg: { rhythm, lbbb, qrs },
        kccq: null,
        baselineMeds: meds, baselineReasons: reasons, baselineMedsReviewed: true,
        amt: { loop: { on: chance(inpatient ? 0.88 : 0.62), drug: wpick({ Furosemide: 80, Torsemide: 15, Bumetanide: 5 }), dose: pick([20, 40, 40, 80, 80, 120]) }, digoxin: { on: chance(af === 'yes' ? 0.18 : 0.04) }, ivabradine: { on: hfref && rhythm === 'sinus' && chance(0.06) }, thiazide: { on: chance(0.05) }, ivIron: { given: ironDef && chance(0.27) } },
        nonHf: { oac: { on: af === 'yes' && chance(0.8), drug: wpick({ Warfarin: 35, Apixaban: 35, Rivaroxaban: 25, Dabigatran: 5 }) }, statin: { on: (primary === 'ihd' && chance(0.88)) || chance(0.3) }, antiplatelet: { on: primary === 'ihd' && chance(0.72) }, insulin: { on: dm === 'yes' && chance(0.3) }, glucose: { on: dm === 'yes' && chance(0.75) } },
        devices: {},
        notDone: {},
        complete: false, locked: false,
      };
      // KCCQ baseline: worse for inpatients and higher NYHA
      const qb = clamp(normal(inpatient ? 38 : 56, 16) - ({ I: -12, II: 0, III: 8, IV: 16 }[nyha]), 3, 97);
      p.kccq = kccqFromLevel(qb, r);
      if (hfref && chance(0.09)) p.devices.icd = { status: 'present' };
      if (hfref && lbbb && qrs >= 150 && chance(0.25)) p.devices[chance(0.5) ? 'crtd' : 'crtp'] = { status: 'present' };
      else if (hfref && lbbb && qrs >= 150 && lvef <= 35 && chance(0.35)) p.devices.crtd = { status: 'indicated', reason: pick(['Cost', 'Awaiting optimisation of medical therapy', 'Patient refusal']) };
      if (primary === 'ihd' && chance(0.15)) p.devices.revasc = { status: 'present' };
      // index admission
      let hospDeath = false;
      if (inpatient) {
        const los = Math.round(clamp(normal(7, 3.5), 2, 25));
        const dd = L.addDays(visitDate, los);
        hospDeath = chance(0.028) && dd <= today;
        p.hosp = { admitDate: visitDate, dischargeDate: dd <= today ? dd : undefined, icu: chance(0.32) ? 'yes' : 'no', ivDiuretics: chance(0.92) ? 'yes' : 'no', inotropes: chance(0.12) ? 'yes' : 'no', mcs: chance(0.015) ? 'yes' : 'no', ventilation: chance(0.05) ? 'yes' : 'no', death: hospDeath ? 'yes' : 'no' };
        if (p.hosp.dischargeDate && !hospDeath) {
          const dm2 = meds.map(m => ({ ...m }));
          if (!sglt && chance(0.45)) { const d = pick(drugsOf('SGLT2')); dm2.push({ drug: d.drug, dose: 10, freq: 'od' }); }
          if (!mra && hfref && chance(0.3)) dm2.push({ drug: 'Spironolactone', dose: 25, freq: 'od' });
          p.hosp.dischargeMeds = dm2;
          const dr = {}; for (const g of L.gdmtNeedsReason(dm2, T, weight)) dr[g] = reasons[g] || ['titrating'];
          p.hosp.dischargeReasons = dr;
          p.hosp.dWeight = Math.round((weight - normal(3, 1.5)) * 10) / 10;
          p.hosp.planClinic = chance(0.75); p.hosp.planNurse = chance(0.35); p.hosp.planRehab = chance(0.08);
        }
      }
      // completeness: most records complete, some with gaps
      if (ed > -21 && chance(0.55)) { // recently enrolled: data entry still in progress
        delete p.labs.hb; delete p.labs.na; if (chance(0.5)) { delete p.echo.method; delete p.ecg.qrs; } if (chance(0.4)) { p.kccq = null; delete p.clinical.hfHosp12m; delete p.demographics.coverage; }
      }
      if (chance(0.13)) { delete p.labs.hb; }
      if (chance(0.08)) { delete p.echo.method; }
      if (chance(0.06)) { delete p.clinical.hfHosp12m; }
      if (chance(0.05)) { delete p.demographics.education; delete p.demographics.governorate; }
      p.complete = L.completionBlockers(p, T, today).length === 0 && chance(0.93);

      // ---- outcomes: death and hospitalizations ----
      const risk = (inpatient ? 0.2 : 0.075) * (age > 75 ? 1.6 : age < 55 ? 0.7 : 1) * ({ I: 0.5, II: 0.75, III: 1.1, IV: 1.9 }[nyha]) * (stage === 'D' ? 1.7 : 1) * (hfref ? 1.1 : 0.9);
      const deathDay = hospDeath ? L.daysBetween(enrollmentDate, p.hosp.dischargeDate) : Math.round(-Math.log(r()) / (-Math.log(1 - Math.min(risk, 0.9)) / 365));
      const deathDate = L.addDays(enrollmentDate, Math.max(1, deathDay));
      const dead = deathDate < today && (hospDeath || deathDay < 400);
      const follow = L.daysBetween(enrollmentDate, today);
      if (dead) {
        const cause = hospDeath ? wpick({ pump: 70, scd: 10, infection: 15, cv_other: 5 }) : wpick({ pump: 36, scd: 22, mi: 6, stroke: 5, cv_other: 4, infection: 12, cancer: 5, renal: 4, noncv_other: 2, unknown: 4 });
        p.death = { date: deathDate, place: hospDeath ? 'hospital' : wpick({ hospital: 60, home: 35, other: 5 }), source: wpick({ record: 65, family: 32, other: 3 }), cause, investigatorCause: cause, recordedBy: 'Site investigator' };
        if (chance(0.3)) p.death.adjudicated = { cause: chance(0.85) ? cause : 'pump', by: 'Dr. Imad (PI)', at: L.addDays(deathDate, 20) + 'T10:00:00Z', note: 'Reviewed with source documents' };
      }
      const endDay = dead ? L.daysBetween(enrollmentDate, deathDate) : follow;
      // HF hospitalizations: Poisson-ish with rate per year
      const hfRate = (inpatient ? 0.42 : 0.2) * ({ I: 0.5, II: 0.8, III: 1.2, IV: 1.8 }[nyha]);
      let tday = 0;
      while (true) {
        tday += Math.round(-Math.log(r()) * 365 / hfRate);
        if (tday >= endDay - 1 || tday < 3) break;
        const ad = L.addDays(enrollmentDate, tday);
        if (ad >= today) break;
        const los = Math.round(clamp(normal(6, 3), 1, 20));
        events.push({ id: `${id}-e${events.length}`, patientId: id, centerId: c.id, type: 'admission', admitDate: ad, dischargeDate: L.addDays(ad, los) < today ? L.addDays(ad, los) : undefined, hospital: chance(0.8) ? 'same' : 'other', reason: 'hf', planned: false, stay24h: true, ivDiuretics: chance(0.94), vasoactive: chance(0.1), mcs: false, isHFH: true });
      }
      if (chance(0.16)) {
        const ad = L.addDays(enrollmentDate, Math.round(r() * Math.max(5, endDay - 3)));
        if (ad < today) events.push({ id: `${id}-e${events.length}`, patientId: id, centerId: c.id, type: 'admission', admitDate: ad, dischargeDate: L.addDays(ad, 3) < today ? L.addDays(ad, 3) : undefined, hospital: 'same', reason: chance(0.5) ? 'cv' : 'noncv', cvDetail: pick(['acs', 'arrhythmia', 'stroke']), detail: pick(['Pneumonia', 'Urinary tract infection', 'GI bleeding', 'Fracture']), stay24h: true, isHFH: false });
      }
      if (chance(0.07)) {
        const ad = L.addDays(enrollmentDate, Math.round(r() * Math.max(5, endDay - 3)));
        if (ad < today) events.push({ id: `${id}-e${events.length}`, patientId: id, centerId: c.id, type: 'urgent', admitDate: ad, ivDiuretics: true, isHFH: false });
      }

      // ---- follow-up visits and titration ----
      let state = (p.hosp?.dischargeMeds || meds).map(m => ({ ...m }));
      let kq = qb;
      const titrate = (date) => {
        // one titration step toward target, or starting a missing class
        const s = L.gdmtSummary(state, T, weight);
        const options = [];
        for (const g of s.missing) if (!(hfref === false && (g === 'RAS' || g === 'BB')) && chance(0.5)) options.push({ kind: 'start', g });
        for (const g of s.belowTarget) options.push({ kind: 'up', g });
        if (!options.length) return;
        const o = pick(options);
        if (o.kind === 'start') {
          const cls = o.g === 'RAS' ? (hfref && chance(0.5) ? 'ARNI' : 'ACEI') : o.g;
          const d = pick(drugsOf(cls)); const target = L.targetFor(d.drug, T, weight); const freq = /twice/.test(d.label) ? 'bd' : /three/.test(d.label) ? 'tds' : 'od'; const per = { od: 1, bd: 2, tds: 3 }[freq];
          const dose = Math.round((o.g === 'SGLT2' ? target : target * 0.25) / per * 100) / 100;
          const e = { id: `${id}-t${titrations.length}`, patientId: id, centerId: c.id, date, drug: d.drug, dose, freq, change: 'start', reason: o.g === 'SGLT2' ? 'Guideline-directed initiation' : 'Low-dose start', by: p.enrollment.investigator };
          titrations.push(e); state = L.applyTitration(state, e);
        } else {
          const cur = s.per[o.g]; const m = state.find(x => x.drug === cur.drug);
          if (!m) return;
          const ndose = Math.round(Math.min(m.dose * 2, (cur.target / (L.FREQ[m.freq] || 1))) * 100) / 100;
          if (ndose <= m.dose) return;
          const e = { id: `${id}-t${titrations.length}`, patientId: id, centerId: c.id, date, drug: m.drug, dose: ndose, freq: m.freq, change: 'increase', reason: 'Up-titration as tolerated', by: p.enrollment.investigator };
          titrations.push(e); state = L.applyTitration(state, e);
        }
        if (chance(0.05)) { // occasional down-titration
          const m = pick(state); if (m && m.dose > 1) { const e = { id: `${id}-t${titrations.length}`, patientId: id, centerId: c.id, date: L.addDays(date, 3) < today ? L.addDays(date, 3) : date, drug: m.drug, dose: Math.round(m.dose / 2 * 100) / 100, freq: m.freq, change: 'decrease', reason: pick(['Symptomatic hypotension', 'Hyperkalemia', 'Worsening renal function']), by: p.enrollment.investigator }; titrations.push(e); state = L.applyTitration(state, e); }
        }
      };
      const baseDate = enrollmentDate;
      let lastAlive = baseDate;
      const centerQuality = 0.8 + (ci % 4) * 0.05;
      for (const V of L.VISITS) {
        const open = L.addDays(baseDate, V.lo), close = L.addDays(baseDate, V.hi), target = L.addDays(baseDate, V.target);
        if (open > today) break;
        if (dead && p.death.date < open) break;
        // titration between visits
        const steps = chance(0.75) ? (chance(0.5) ? 2 : 1) : 0;
        for (let k = 0; k < steps; k++) { const td = L.addDays(lastAlive, Math.round(5 + r() * Math.max(1, L.daysBetween(lastAlive, target) - 8))); if (td < today && td > lastAlive && (!dead || td < p.death.date)) titrate(td); }
        const windowClosed = close < today;
        const doneP = windowClosed ? centerQuality : 0.55;
        if (chance(doneP)) {
          let vd = L.addDays(baseDate, V.target + Math.round(normal(0, (V.hi - V.lo) / 6)));
          if (vd > today) vd = today; if (vd < open) vd = open;
          if (dead && vd >= p.death.date) break;
          kq = clamp(kq + normal(V.key === 'd30' ? 6 : 5, 11), 3, 100);
          const method = V.key === 'd30' ? (chance(0.55) ? 'phone' : 'clinic') : (chance(0.78) ? 'clinic' : 'phone');
          const vNyha = wpick(inpatient ? { I: 12, II: 46, III: 34, IV: 8 } : { I: 18, II: 52, III: 26, IV: 4 });
          const v = {
            id: `${id}:${V.key}`, patientId: id, centerId: c.id, visit: V.key, status: 'done', date: vd, method, vital: 'alive', nyha: vNyha,
            sbp: method === 'clinic' ? Math.round(clamp(normal(hfref ? 114 : 132, 16), 80, 200)) : undefined, hr: method === 'clinic' ? Math.round(clamp(normal(72, 11), 48, 120)) : undefined,
            weight: method === 'clinic' ? Math.round((weight + normal(-1, 3)) * 10) / 10 : undefined,
            meds: state.map(m => ({ ...m })), adherence: wpick({ all: 61, most: 27, some: 10, none: 2 }),
            labs: method === 'clinic' && chance(0.8) ? { date: vd, creat: Math.round(creat * clamp(normal(1.04, 0.12), 0.7, 1.6)), k: Math.round(clamp(normal(4.6, 0.5), 3, 6.5) * 10) / 10, na: Math.round(normal(137, 3)), ntprobnp: Math.round(ntp * clamp(normal(V.key === 'd30' ? 0.62 : 0.5, 0.25), 0.1, 2)), hb: Math.round((hb + normal(0, 0.8)) * 10) / 10, ferritin: chance(0.5) ? Math.round(ferritin * clamp(normal(1.1, 0.4), 0.3, 4)) : undefined } : undefined,
            ade: chance(0.12) ? [wpick({ hyperkalemia: 30, wrf: 25, hypotension: 30, genital: 12, angioedema: 3 })] : [],
            updatedBy: p.enrollment.investigator,
          };
          if (V.key !== 'd30') v.kccq = kccqFromLevel(kq, r), v.kccqScores = L.kccqScores(v.kccq);
          if (v.labs?.creat) v.labs.egfr = L.egfrCKDEPI2021(v.labs.creat, L.ageAt(dob, vd), sex);
          const need = L.gdmtNeedsReason(v.meds, T, v.weight || weight);
          v.reasons = {}; for (const g of need) v.reasons[g] = [wpick({ titrating: 30, hypotension: 14, renal: 10, hyperkalemia: 8, bradycardia: 6, cost: 12, clinician: 14, intolerance: 6 })];
          visits.push(v);
          lastAlive = vd;
        } else if (windowClosed) {
          const attempts = [];
          const nA = wpick({ 0: 30, 1: 20, 2: 15, 3: 35 });
          for (let k = 0; k < nA; k++) attempts.push({ date: L.addDays(open, k * 2 + 1), time: pick(['09:30', '11:15', '13:40', '16:05']), number: 'Patient mobile', outcome: pick(['noanswer', 'off', 'noanswer', 'wrong']), by: p.enrollment.investigator });
          if (attempts.length) visits.push({ id: `${id}:${V.key}`, patientId: id, centerId: c.id, visit: V.key, status: nA >= 3 && chance(0.7) ? 'ltfu' : 'pending', attempts });
        } else if (chance(0.3)) {
          visits.push({ id: `${id}:${V.key}`, patientId: id, centerId: c.id, visit: V.key, status: 'pending', attempts: [{ date: L.addDays(open, 1) < today ? L.addDays(open, 1) : today, time: '10:20', number: 'Patient mobile', outcome: 'callback', by: p.enrollment.investigator }] });
        }
      }
      if (!dead && chance(0.006)) p.withdrawal = { date: L.addDays(enrollmentDate, Math.round(r() * Math.max(10, follow - 5))), keepData: chance(0.8), reason: 'Patient request', recordedBy: p.enrollment.investigator };
      if (chance(0.025) && p.complete && L.daysBetween(enrollmentDate, today) > 200) p.locked = true;

      const bundle = { visits: visits.filter(v => v.patientId === id), events: events.filter(e => e.patientId === id), titrations: titrations.filter(t => t.patientId === id) };
      p.derived = L.computeDerived(p, bundle, settings, today);
      patients.push(p);
      const isF = sex === 'F';
      const name = `${pick(isF ? FIRST_F : FIRST_M)} ${pick(FIRST_M)} ${pick(LAST)}`;
      const ident = { name, phone: '07' + pick(['7', '8', '9']) + String(Math.floor(r() * 1e7)).padStart(7, '0'), relativePhone: chance(0.8) ? '07' + pick(['7', '8', '9']) + String(Math.floor(r() * 1e7)).padStart(7, '0') : '', fileNo: c.code.slice(0, 3) + '-' + String(100000 + Math.floor(r() * 899999)), nationalId: chance(0.7) ? String(9 + Math.floor(r() * 2)) + String(Math.floor(r() * 1e9)).padStart(9, '0') : '' };
      idents.push({ id, centerId: c.id, enc: await cipher.encrypt(ident), hashes: [] });
      audit.push({ ts: p.createdAt, userId: p.createdBy, userName: p.enrollment.investigator, action: 'create', table: 'patients', recordId: id, patientId: id, centerId: c.id, field: 'record', old: null, new: 'patient enrolled' });
      // data queries raised by the coordinating center
      if (chance(0.035)) {
        const qs = [['labs.k', 'Potassium value looks high for a patient on MRA. Please confirm against the lab report.'], ['echo.lvef', 'Please confirm the LVEF method (biplane Simpson vs visual).'], ['clinical.nyha', 'NYHA class at enrollment differs from the discharge letter. Please check.'], ['labs.ntprobnp', 'NT-proBNP unit: please confirm pg/mL.'], ['demographics.dob', 'Date of birth seems inconsistent with the hospital file.']];
        const [field, message] = pick(qs);
        const answered = chance(0.35);
        queries.push({ id: `q-${id}`, patientId: id, centerId: c.id, field, message, kind: 'query', status: answered ? 'answered' : 'open', createdAt: L.addDays(enrollmentDate, 10) + 'T10:00:00Z', createdBy: 'Sofian Zreigh', thread: answered ? [{ by: p.enrollment.investigator, role: 'site', at: L.addDays(enrollmentDate, 12) + 'T12:00:00Z', message: 'Checked against the source document. Value is correct.' }] : [] });
      }
    }
  }
  queries.push({ id: 'q-del-1', patientId: patients[5].id, centerId: patients[5].centerId, field: null, message: 'Entered twice by mistake (same patient as a later record). Please delete.', kind: 'delete', status: 'open', createdAt: L.addDays(today, -6) + 'T09:00:00Z', createdBy: users.find(u => u.centerId === patients[5].centerId).name, thread: [] });
  audit.sort((a, b) => (a.ts < b.ts ? -1 : 1)).forEach((e, i) => (e.seq = i + 1));
  return {
    tables: { users, centers, settings: [{ id: 'main', ...settings }], patients, ident: idents, visits, events, titrations, queries },
    audit,
  };
}

// Build plausible KCCQ-12 answers that score close to a target summary level (0-100).
function kccqFromLevel(level, r) {
  const ans = {};
  const jitter = () => (r() - 0.5) * 30;
  const code = (max, lvl) => String(Math.max(1, Math.min(max, Math.round(1 + (max - 1) * Math.max(0, Math.min(100, lvl + jitter())) / 100))));
  for (const k of ['q1a', 'q1b', 'q1c']) ans[k] = code(5, level + (k === 'q1a' ? 15 : k === 'q1c' ? -15 : 0));
  ans.q2 = code(5, level + 10); ans.q3 = code(7, level); ans.q4 = code(7, level); ans.q5 = code(5, level + 15);
  ans.q6 = code(5, level - 5); ans.q7 = code(5, level - 5);
  for (const k of ['q8a', 'q8b', 'q8c']) ans[k] = r() < 0.05 ? '6' : code(5, level);
  return ans;
}
