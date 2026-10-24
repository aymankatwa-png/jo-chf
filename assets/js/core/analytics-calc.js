// Registry analytics: pure computations on the de-identified dataset.
import * as L from './logic.js';

export const TP = [['baseline', 'Baseline'], ['discharge', 'Discharge'], ['d30', '30 days'], ['m6', '6 months'], ['m12', '12 months']];

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const pct = (n, d) => (d ? Math.round(1000 * n / d) / 10 : null);
export { median, q, pct };

export function prepare(ds) {
  const vBy = new Map(), eBy = new Map(), tBy = new Map();
  for (const v of ds.visits) { if (!vBy.has(v.patientId)) vBy.set(v.patientId, []); vBy.get(v.patientId).push(v); }
  for (const e of ds.events) { if (!eBy.has(e.patientId)) eBy.set(e.patientId, []); eBy.get(e.patientId).push(e); }
  for (const t of ds.titrations) { if (!tBy.has(t.patientId)) tBy.set(t.patientId, []); tBy.get(t.patientId).push(t); }
  const targets = ds.settings?.targets;
  const rows = ds.patients.filter(p => !(p.withdrawal && p.withdrawal.keepData === false)).map(p => {
    const visits = vBy.get(p.id) || [], events = eBy.get(p.id) || [], titrations = tBy.get(p.id) || [];
    const w = p.demographics?.weight;
    const snaps = {};
    snaps.baseline = p.baselineMeds || [];
    if (p.clinical?.setting === 'inpatient' && p.hosp?.dischargeMeds) snaps.discharge = p.hosp.dischargeMeds;
    for (const v of visits) if (v.status === 'done' && v.vital === 'alive' && v.meds) snaps[v.visit] = v.meds;
    const gd = {}; for (const k of Object.keys(snaps)) gd[k] = L.gdmtSummary(snaps[k], targets, w);
    const current = L.currentMeds(p, visits, titrations);
    const cur = L.gdmtSummary(current, targets, w);
    // survival times
    const enroll = p.enrollment?.enrollmentDate;
    const endObs = p.withdrawal?.date && p.withdrawal.date < ds.today ? p.withdrawal.date : ds.today;
    const lastAlive = [enroll, ...visits.filter(v => v.status === 'done' && v.vital === 'alive').map(v => v.date)].sort().pop();
    const lost = visits.some(v => v.status === 'ltfu');
    const censorDate = lost ? lastAlive : endObs;
    const deathDay = p.death?.date ? L.daysBetween(enroll, p.death.date) : null;
    const tDeath = deathDay != null ? deathDay : Math.max(0, L.daysBetween(enroll, censorDate));
    const hfh = events.filter(L.isHFHospitalization).sort((a, b) => (a.admitDate < b.admitDate ? -1 : 1));
    const firstHfh = hfh.length ? L.daysBetween(enroll, hfh[0].admitDate) : null;
    const tComp = Math.min(...[firstHfh, deathDay, tDeath].filter(x => x != null));
    const compEvent = firstHfh != null || deathDay != null;
    const kq = { baseline: L.kccqScores(p.kccq) };
    for (const v of visits) if (v.status === 'done' && v.kccqScores) kq[v.visit] = v.kccqScores;
    const ms = L.gdmtMilestones(p, visits, titrations, targets);
    const latestLabs = { ...(p.labs || {}), egfr: p.derived?.egfr };
    for (const v of [...visits].filter(v => v.labs).sort((a, b) => (a.date < b.date ? -1 : 1))) for (const [k, val] of Object.entries(v.labs)) if (val != null) latestLabs[k] = val;
    return {
      p, visits, events, titrations, gd, cur, current, kq, ms, latestLabs,
      pheno: p.derived?.phenotype || L.phenotype(p.echo?.lvef), setting: p.clinical?.setting, sex: p.demographics?.sex, age: p.derived?.age, center: p.centerId,
      tDeath, dead: deathDay != null, tComp, compEvent, hfhCount: hfh.length, followDays: tDeath,
      urgent: events.filter(e => e.type === 'urgent').length,
    };
  });
  return rows;
}

// Kaplan–Meier with Greenwood variance. items: [{t, e}] → steps [{t, s, lo, hi, atRisk}]
export function km(items, horizon = 400) {
  const data = items.filter(x => x.t != null && x.t >= 0).sort((a, b) => a.t - b.t);
  let n = data.length, s = 1, v = 0; const out = [{ t: 0, s: 1, lo: 1, hi: 1, atRisk: n }];
  let i = 0;
  while (i < data.length) {
    const t = data[i].t; let d = 0, c = 0;
    while (i < data.length && data[i].t === t) { data[i].e ? d++ : c++; i++; }
    if (d && n > 0) { s *= (1 - d / n); if (n - d > 0) v += d / (n * (n - d)); const se = s * Math.sqrt(v); out.push({ t, s, lo: Math.max(0, s - 1.96 * se), hi: Math.min(1, s + 1.96 * se), atRisk: n }); }
    n -= d + c;
    if (t > horizon) break;
  }
  return out;
}
export function kmAt(steps, t) { let r = steps[0]; for (const s of steps) { if (s.t <= t) r = s; else break; } return r; }
export function atRiskAt(items, t) { return items.filter(x => x.t >= t).length; }

export function computeAll(ds, filt = {}) {
  let rows = prepare(ds);
  rows = rows.filter(r => (!filt.center || r.center === filt.center) && (!filt.pheno || r.pheno === filt.pheno) && (!filt.setting || r.setting === filt.setting) && (!filt.sex || r.sex === filt.sex));
  const n = rows.length;
  const centers = Object.fromEntries(ds.centers.map(c => [c.id, c]));
  const hfref = rows.filter(r => r.pheno === 'HFrEF'), hfpef = rows.filter(r => r.pheno === 'HFpEF');
  const ages = rows.map(r => r.age).filter(x => x != null);

  // recruitment
  const months = {};
  for (const r of rows) { const m = r.p.enrollment?.enrollmentDate?.slice(0, 7); if (!m) continue; months[m] = months[m] || { inpatient: 0, outpatient: 0 }; months[m][r.setting === 'inpatient' ? 'inpatient' : 'outpatient']++; }
  const mKeys = Object.keys(months).sort();
  if (mKeys.length) { const [y0, m0] = mKeys[0].split('-').map(Number); const [y1, m1] = ds.today.slice(0, 7).split('-').map(Number); mKeys.length = 0; for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, m = 1) : m++) { const k = `${y}-${String(m).padStart(2, '0')}`; mKeys.push(k); months[k] = months[k] || { inpatient: 0, outpatient: 0 }; } }
  let cum = 0; const cumulative = mKeys.map(k => (cum += months[k].inpatient + months[k].outpatient));
  const target = filt.center ? (centers[filt.center]?.target || 0) : (ds.settings?.registryTarget || 1000);
  const pace = mKeys.map((_, i) => Math.round(target * Math.min(1, (i + 1) / 12)));

  // demographics
  const bands = ['18–39', '40–49', '50–59', '60–69', '70–79', '80+'];
  const band = a => a < 40 ? 0 : a < 50 ? 1 : a < 60 ? 2 : a < 70 ? 3 : a < 80 ? 4 : 5;
  const pyramid = { M: bands.map(() => 0), F: bands.map(() => 0) };
  for (const r of rows) if (r.age != null && r.sex) pyramid[r.sex][band(r.age)]++;
  const lvefBins = []; for (let b = 10; b < 80; b += 5) lvefBins.push(b);
  const lvefHist = lvefBins.map(b => rows.filter(r => { const v = r.p.echo?.lvef; return v >= b && v < b + 5; }).length);
  const by = (list, f, keys) => keys.map(k => list.filter(r => f(r) === k).length);
  const nyhaKeys = ['I', 'II', 'III', 'IV'];
  const nyha = { HFrEF: by(hfref, r => r.p.clinical?.nyha, nyhaKeys), HFpEF: by(hfpef, r => r.p.clinical?.nyha, nyhaKeys) };
  const etioKeys = ['ihd', 'htn', 'dcm', 'valvular', 'hcm', 'amyloid', 'tachy', 'toxic', 'peripartum', 'other'];
  const etio = { HFrEF: by(hfref, r => r.p.etiology?.primary, etioKeys), HFpEF: by(hfpef, r => r.p.etiology?.primary, etioKeys) };
  const comKeys = ['htn', 'dm', 'af', 'ckd', 'anemia', 'irondef', 'obesity', 'copd', 'depression', 'stroke', 'thyroid', 'pad', 'osa', 'cancer', 'liver'];
  const com = k => ({ HFrEF: pct(hfref.filter(r => r.p.comorbid?.[k] === 'yes').length, hfref.length), HFpEF: pct(hfpef.filter(r => r.p.comorbid?.[k] === 'yes').length, hfpef.length) });
  const comorb = comKeys.map(k => ({ k, ...com(k) })).sort((a, b) => (b.HFrEF + b.HFpEF) - (a.HFrEF + a.HFpEF));
  const smokingCur = pct(rows.filter(r => (r.p.demographics?.smoking || []).some(s => ['cigarettes', 'waterpipe', 'ecig'].includes(s))).length, n);
  const coverage = {}; for (const r of rows) { const c = r.p.demographics?.coverage || 'unknown'; coverage[c] = (coverage[c] || 0) + 1; }

  // GDMT (HFrEF)
  const tpUsed = TP.filter(([k]) => hfref.some(r => r.gd[k]));
  const countDist = tpUsed.map(([k, l]) => { const have = hfref.filter(r => r.gd[k]); return { k, l, n: have.length, dist: [0, 1, 2, 3, 4].map(c => pct(have.filter(r => r.gd[k].count === c).length, have.length)) }; });
  const uptake = L.FOUNDATIONAL.map(g => ({ g, values: tpUsed.map(([k]) => { const have = hfref.filter(r => r.gd[k]); return pct(have.filter(r => r.gd[k].per[g]).length, have.length); }) }));
  const doseNow = L.FOUNDATIONAL.filter(g => g !== 'SGLT2').map(g => {
    const list = hfref; const on = list.filter(r => r.cur.per[g]);
    return { g, none: pct(list.length - on.length, list.length), lt50: pct(on.filter(r => (r.cur.per[g].pct ?? 0) < 50).length, list.length), mid: pct(on.filter(r => r.cur.per[g].pct >= 50 && r.cur.per[g].pct < 100).length, list.length), ge100: pct(on.filter(r => r.cur.per[g].pct >= 100).length, list.length) };
  });
  // time to full foundational therapy (cumulative incidence, HFrEF)
  const fullItems = hfref.map(r => ({ t: r.ms.daysToFull != null ? r.ms.daysToFull : r.followDays, e: r.ms.daysToFull != null }));
  const fullCurve = km(fullItems, 400).map(s => ({ t: s.t, v: Math.round((1 - s.s) * 1000) / 10 }));
  const fullAtBase = pct(hfref.filter(r => r.ms.daysToFull === 0).length, hfref.length);
  // reasons
  const reasonCount = {};
  for (const r of hfref) { const rs = r.p.baselineReasons || {}; for (const g of Object.keys(rs)) for (const x of rs[g] || []) { reasonCount[x] = (reasonCount[x] || 0) + 1; } }
  const reasonByClass = {};
  for (const g of L.FOUNDATIONAL) { reasonByClass[g] = {}; for (const r of hfref) for (const x of (r.p.baselineReasons?.[g] || [])) reasonByClass[g][x] = (reasonByClass[g][x] || 0) + 1; }
  // sankey baseline → latest drug count
  const sankeyLinks = {};
  for (const r of hfref) { const a = r.gd.baseline?.count ?? 0, b = r.cur.count; if (r.dead && r.tDeath < 25) continue; const key = `${a}|${b}`; sankeyLinks[key] = (sankeyLinks[key] || 0) + 1; }
  const hfpefMraSglt = { base: pct(hfpef.filter(r => r.gd.baseline?.per.MRA && r.gd.baseline?.per.SGLT2).length, hfpef.length), now: pct(hfpef.filter(r => r.cur.per.MRA && r.cur.per.SGLT2).length, hfpef.length), sglt2Now: pct(hfpef.filter(r => r.cur.per.SGLT2).length, hfpef.length) };

  // outcomes
  const groups = filt.pheno ? [[filt.pheno, rows]] : [['HFrEF', hfref], ['HFpEF', hfpef]];
  const surv = groups.map(([name, list]) => ({ name, steps: km(list.map(r => ({ t: r.tDeath, e: r.dead }))), items: list.map(r => ({ t: r.tDeath, e: r.dead })) }));
  const comp = groups.map(([name, list]) => ({ name, steps: km(list.map(r => ({ t: r.tComp, e: r.compEvent }))), items: list.map(r => ({ t: r.tComp, e: r.compEvent })) }));
  const allSurv = km(rows.map(r => ({ t: r.tDeath, e: r.dead })));
  const m12 = kmAt(allSurv, 365);
  const py = rows.reduce((a, r) => a + r.followDays, 0) / 365.25;
  const hfhTotal = rows.reduce((a, r) => a + r.hfhCount, 0);
  const deaths = rows.filter(r => r.dead);
  const causeCount = {}; for (const r of deaths) { const c = r.p.death.adjudicated?.cause || r.p.death.cause; causeCount[c] = (causeCount[c] || 0) + 1; }
  const cvDeaths = deaths.filter(r => ['scd', 'pump', 'mi', 'stroke', 'cv_other'].includes(r.p.death.adjudicated?.cause || r.p.death.cause)).length;
  const inHospMort = pct(rows.filter(r => r.setting === 'inpatient' && r.p.hosp?.death === 'yes').length, rows.filter(r => r.setting === 'inpatient').length);
  const los = rows.map(r => r.p.derived?.los).filter(x => x != null && x >= 0);

  // KCCQ
  const kccqTP = [['baseline', 'Baseline'], ['m6', '6 months'], ['m12', '12 months']];
  const kccq = kccqTP.map(([k, l]) => { const v = rows.map(r => r.kq[k]).filter(Boolean); return { k, l, n: v.length, PL: mean(v.map(x => x.PL)), SF: mean(v.map(x => x.SF)), QL: mean(v.map(x => x.QL)), SL: mean(v.map(x => x.SL)), summary: mean(v.map(x => x.summary)) }; });
  const paired = rows.filter(r => r.kq.baseline?.summary != null && r.kq.m6?.summary != null);
  const kccqChange = paired.length ? Math.round(10 * mean(paired.map(r => r.kq.m6.summary - r.kq.baseline.summary))) / 10 : null;
  const improved5 = pct(paired.filter(r => r.kq.m6.summary - r.kq.baseline.summary >= 5).length, paired.length);

  // labs
  const bnpByNyha = nyhaKeys.map(k => { const v = rows.filter(r => r.p.clinical?.nyha === k).map(r => r.p.labs?.ntprobnp).filter(x => x != null); return v.length ? [q(v, 0), q(v, .25), median(v), q(v, .75), q(v, 1)] : [null, null, null, null, null]; });
  const bnpN = nyhaKeys.map(k => rows.filter(r => r.p.clinical?.nyha === k && r.p.labs?.ntprobnp != null).length);
  const egfrKeys = ['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5'];
  const egfr = by(rows, r => r.p.derived?.egfrStage, egfrKeys);
  const tested = rows.filter(r => r.p.labs?.ferritin != null);
  const ironDef = tested.filter(r => { const f = r.p.labs.ferritin, t = r.p.labs.tsat; return f < 100 || (f <= 299 && t != null && t < 20); });
  const ironTx = ironDef.filter(r => r.p.amt?.ivIron?.given);
  const kBins = ['<3.5', '3.5–5.0', '5.1–5.5', '>5.5'];
  const kDist = by(rows, r => { const k = r.latestLabs.k; return k == null ? null : k < 3.5 ? '<3.5' : k <= 5 ? '3.5–5.0' : k <= 5.5 ? '5.1–5.5' : '>5.5'; }, kBins);

  // devices (HFrEF, LVEF ≤35)
  const devCand = hfref.filter(r => r.p.echo?.lvef <= 35);
  const devState = k => ({ present: devCand.filter(r => ['present', 'implanted'].includes(r.p.devices?.[k]?.status)).length, indicated: devCand.filter(r => r.p.devices?.[k]?.status === 'indicated').length });
  const crtCand = devCand.filter(r => r.p.ecg?.qrs >= 150 && r.p.ecg?.lbbb);
  const crtDone = crtCand.filter(r => ['crtp', 'crtd', 'csp'].some(k => ['present', 'implanted'].includes(r.p.devices?.[k]?.status))).length;

  // care opportunities (alive patients)
  const alive = rows.filter(r => !r.dead && !r.p.withdrawal);
  const gapCount = {}; let withGap = 0;
  for (const r of alive) { const g = L.careGaps(r.p, r.current, r.latestLabs); if (g.length) withGap++; for (const x of g) { const key = x.k.replace(/^(missing|low)_/, '$1_'); gapCount[key] = (gapCount[key] || 0) + 1; } }

  // center benchmarking
  const bench = ds.centers.filter(c => c.active !== false).map(c => {
    const list = rows.filter(r => r.center === c.id); const hr = list.filter(r => r.pheno === 'HFrEF');
    let due = 0, done = 0; for (const r of list) for (const v of L.visitSchedule(r.p, r.visits, ds.settings, ds.today)) if (v.key === 'd30' && ['done', 'missed', 'ltfu'].includes(v.status)) { due++; if (v.status === 'done') done++; }
    return {
      code: c.code, name: c.name, n: list.length,
      recruit: c.target ? Math.round(100 * list.length / c.target) : null,
      fu30: due ? Math.round(100 * done / due) : null,
      complete: list.length ? Math.round(mean(list.map(r => r.p.derived?.completeness ?? 0))) : null,
      quad: hr.length ? Math.round(100 * hr.filter(r => r.cur.count === 4).length / hr.length) : null,
      sglt2: list.length ? Math.round(100 * list.filter(r => r.cur.per.SGLT2).length / list.length) : null,
      arni: hr.length ? Math.round(100 * hr.filter(r => r.cur.per.RAS?.cls === 'ARNI').length / hr.length) : null,
    };
  }).filter(b => !filt.center || b.code === centers[filt.center]?.code);

  return {
    n, target, hfrefN: hfref.length, hfpefN: hfpef.length,
    kpi: {
      medianAge: median(ages), iqr: [q(ages, .25), q(ages, .75)], female: pct(rows.filter(r => r.sex === 'F').length, n),
      hfref: pct(hfref.length, n), inpatient: pct(rows.filter(r => r.setting === 'inpatient').length, n),
      mort12: m12 ? Math.round((1 - m12.s) * 1000) / 10 : null, mort12ci: m12 ? [Math.round((1 - m12.hi) * 1000) / 10, Math.round((1 - m12.lo) * 1000) / 10] : null,
      hfhRate: py ? Math.round(1000 * hfhTotal / py) / 10 : null, py: Math.round(py),
      quadNow: pct(hfref.filter(r => r.cur.count === 4).length, hfref.length), quadBase: pct(hfref.filter(r => r.gd.baseline?.count === 4).length, hfref.length),
      kccqBase: kccq[0].summary, kccqChange, improved5, smokingCur, deaths: deaths.length, cvDeaths, inHospMort, medianLos: median(los),
      medianFollow: median(rows.map(r => r.followDays)),
    },
    recruitment: { months: mKeys, inpatient: mKeys.map(k => months[k].inpatient), outpatient: mKeys.map(k => months[k].outpatient), cumulative, pace },
    demo: { bands, pyramid, lvefBins, lvefHist, lvefSplit: lvefBins.map(b => b < 50 ? 'HFrEF' : 'HFpEF'), nyhaKeys, nyha, etioKeys, etio, comorb, coverage },
    gdmt: { tpUsed, countDist, uptake, doseNow, fullCurve, fullAtBase, reasonCount, reasonByClass, sankeyLinks, hfpef: hfpefMraSglt },
    outcomes: { surv, comp, causeCount, hfhTotal },
    kccq,
    labs: { bnpByNyha, bnpN, nyhaKeys, egfrKeys, egfr, iron: { all: n, tested: tested.length, deficient: ironDef.length, treated: ironTx.length }, kBins, kDist },
    devices: { cand: devCand.length, icd: devState('icd'), crtd: devState('crtd'), crtp: devState('crtp'), crtCand: crtCand.length, crtDone },
    gaps: { alive: alive.length, withGap, counts: gapCount },
    bench,
  };
}
function mean(a) { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? Math.round(10 * v.reduce((s, x) => s + x, 0) / v.length) / 10 : null; }
