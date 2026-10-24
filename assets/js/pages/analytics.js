// Registry analytics: KPIs, animated charts, care opportunities, center benchmarking.
import { call } from '../api.js';
import { esc, icon, modal, countUp, fmtN, toast } from '../ui/dom.js';
import { computeAll, km, kmAt, atRiskAt } from '../core/analytics-calc.js';
import { palette, base, axisCat, axisVal, ordinal } from '../ui/charts.js';
import { optionLabel, ETIOLOGY, COVERAGE, DEATH_CAUSE, REASONS } from '../core/schema.js';
import * as L from '../core/logic.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mLabel = k => `${MON[+k.slice(5) - 1]} ${k.slice(2, 4)}`;
const COM_LABEL = { htn: 'Hypertension', dm: 'Diabetes', af: 'Atrial fibrillation', ckd: 'Chronic kidney disease', anemia: 'Anemia', irondef: 'Iron deficiency', obesity: 'Obesity', copd: 'COPD / asthma', depression: 'Depression', stroke: 'Stroke / TIA', thyroid: 'Thyroid disease', pad: 'Peripheral arterial disease', osa: 'Sleep apnea', cancer: 'Cancer', liver: 'Liver disease' };
const GAP_LABEL = { missing_SGLT2: 'not on an SGLT2 inhibitor', missing_MRA: 'HFrEF not on an MRA', missing_RAS: 'HFrEF not on ARNI / ACEi / ARB', missing_BB: 'HFrEF not on a beta-blocker', low_RAS: 'RASi/ARNI below 50% of target', low_BB: 'beta-blocker below 50% of target', low_MRA: 'MRA below 50% of target', iron: 'iron deficient without IV iron', crt: 'possible CRT candidates without CRT', icd: 'ischemic LVEF ≤35% without ICD (review)', k: 'potassium above 5.5 on MRA', egfr: 'eGFR below 20 on SGLT2i (review)' };
const pctTip = v => (v == null ? '–' : v + '%');

export async function render(root, _, app) {
  app.setCrumbs([{ label: 'Analytics' }]);
  const ds = await call('data.dataset', {});
  const filt = { center: '', pheno: '', setting: '', sex: '' };
  const charts = new Map();
  let A = computeAll(ds, filt);
  const centersById = Object.fromEntries(ds.centers.map(c => [c.id, c]));
  const scopeLabel = ds.scope === 'all' ? 'all centers' : (centersById[app.user.centerId]?.name || 'your center');

  const VIZ = defineViz();
  root.innerHTML = `
    <div class="page-head"><div class="grow"><h1>Registry analytics</h1><p>Live analysis of ${ds.scope === 'all' ? 'the whole registry' : `<b>${esc(scopeLabel)}</b> (site investigators see their own center in detail)`}. All data are de-identified. Every chart can show its numbers as a table or be saved as an image.</p></div>
      <button class="btn" id="print">${icon('download')}Print / save as PDF</button></div>
    <div class="filters" role="group" aria-label="Filters">
      <span class="lbl">Show</span>
      ${ds.scope === 'all' ? `<select class="input" data-f="center" aria-label="Center"><option value="">All centers</option>${ds.centers.map(c => `<option value="${c.id}">${esc(c.code)} · ${esc(c.name)}</option>`).join('')}</select>` : ''}
      <select class="input" data-f="pheno" aria-label="Phenotype"><option value="">HFrEF and HFpEF</option><option value="HFrEF">HFrEF only</option><option value="HFpEF">HFpEF only</option></select>
      <select class="input" data-f="setting" aria-label="Setting"><option value="">Inpatients and outpatients</option><option value="inpatient">Inpatients</option><option value="outpatient">Outpatients</option></select>
      <select class="input" data-f="sex" aria-label="Sex"><option value="">Both sexes</option><option value="M">Men</option><option value="F">Women</option></select>
      <span class="grow"></span><span class="small ink2 tnum" id="nshow"></span>
    </div>
    <div id="kpis"></div>
    <div id="sections"></div>`;

  function drawKpis() {
    const k = A.kpi;
    root.querySelector('#nshow').textContent = `${fmtN(A.n)} patients · ${fmtN(k.py)} patient-years of follow-up`;
    root.querySelector('#kpis').innerHTML = `<div class="kpis">
      <div class="kpi"><div class="v"><span data-n="${A.n}">0</span><small>/ ${fmtN(A.target)}</small></div><div class="l">Patients enrolled</div><div class="ci">${A.target ? Math.round(100 * A.n / A.target) : '–'}% of target · ${k.inpatient ?? '–'}% inpatients</div></div>
      <div class="kpi"><div class="v"><span data-n="${k.medianAge ?? ''}">0</span><small>years</small></div><div class="l">Median age</div><div class="ci">IQR ${k.iqr[0] ?? '–'}–${k.iqr[1] ?? '–'} · ${k.female ?? '–'}% women</div></div>
      <div class="kpi"><div class="v"><span data-n="${k.hfref ?? ''}" data-d="1">0</span><small>%</small></div><div class="l">HFrEF (LVEF below 50%)</div><div class="ci">${A.hfrefN} HFrEF · ${A.hfpefN} HFpEF</div></div>
      <div class="kpi"><div class="v"><span data-n="${k.mort12 ?? ''}" data-d="1">0</span><small>%</small></div><div class="l">12-month mortality</div><div class="ci">Kaplan–Meier · 95% CI ${k.mort12ci ? k.mort12ci.join('–') : '–'}%</div></div>
      <div class="kpi"><div class="v"><span data-n="${k.hfhRate ?? ''}" data-d="1">0</span></div><div class="l">HF hospitalizations per 100 patient-years</div><div class="ci">${A.outcomes.hfhTotal} events after enrollment</div></div>
      <div class="kpi"><div class="v"><span data-n="${k.quadNow ?? ''}" data-d="1">0</span><small>%</small></div><div class="l">HFrEF on all 4 foundational drugs now</div><div class="ci">from ${k.quadBase ?? '–'}% at baseline</div></div>
    </div>`;
    root.querySelectorAll('[data-n]').forEach(el => el.dataset.n !== '' ? countUp(el, +el.dataset.n, { dec: +(el.dataset.d || 0) }) : (el.textContent = '–'));
  }

  function drawSections() {
    if (!A.n) {
      charts.forEach(c => c.dispose()); charts.clear();
      root.querySelector('#sections').innerHTML = `<div class="card empty" style="margin-top:18px">${icon('chart')}<h3>${ds.patients.length ? 'No patients match these filters' : 'No patients yet'}</h3><p>${ds.patients.length ? 'Change the filters above to see the charts.' : 'Charts and statistics appear here automatically as soon as the centers enter their first patients. To see a full example now, open the demo from the sign-in page.'}</p></div>`;
      return;
    }
    const secs = [
      ['who', 'Who is in the registry', 'Baseline profile of enrolled patients.'],
      ['gdmt', 'Guideline-directed medical therapy', 'Uptake and titration of foundational drugs in HFrEF, over time.'],
      ['out', 'Outcomes and quality of life', 'Survival, hospitalizations and patient-reported health status.'],
      ['labs', 'Investigations and devices', 'Natriuretic peptides, kidney function, iron and device therapy.'],
      ['care', 'Care opportunities', 'Where guideline-directed care could still improve, among patients alive today.'],
      ...(ds.scope === 'all' && !filt.center ? [['bench', 'Center benchmarking', 'Each center compared on recruitment, data quality and treatment.']] : []),
    ];
    root.querySelector('#sections').innerHTML = secs.map(([id, t, p]) => `<div class="analytics-section"><h2>${esc(t)}</h2><p>${esc(p)}</p></div>
      <div class="viz-grid">${id === 'care' ? careHTML() : id === 'bench' ? benchHTML() : VIZ.filter(v => v.sec === id && (!v.when || v.when())).map(vizShell).join('')}</div>`).join('');
    charts.forEach(c => c.dispose()); charts.clear();
    observe();
  }
  const vizShell = v => `<article class="viz ${v.w}" data-viz="${v.id}" aria-label="${esc(v.title)}">
    <div class="viz-head"><div class="grow"><h3>${esc(v.title)}</h3>${v.sub ? `<p>${v.sub}</p>` : ''}</div>
      <div class="viz-tools"><button class="btn ghost xs" data-tbl="${v.id}" title="Show the numbers as a table">${icon('table')}</button><button class="btn ghost xs" data-png="${v.id}" title="Save chart as image">${icon('image')}</button></div></div>
    <div class="viz-body"><div class="chart ${v.h || ''}" id="ch-${v.id}" role="img" aria-label="${esc(v.title)} chart"></div></div>
    ${v.insight ? `<div class="insight">${v.insight(A) || ''}</div>` : ''}${v.note ? `<div class="viz-note">${v.note}</div>` : ''}</article>`;

  let io;
  function observe() {
    io?.disconnect();
    io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { io.unobserve(en.target); initChart(en.target.dataset.viz); }
    }, { rootMargin: '0px 0px -60px 0px' });
    root.querySelectorAll('[data-viz]').forEach(el => io.observe(el));
  }
  function initChart(id) {
    const v = VIZ.find(x => x.id === id); const el = root.querySelector('#ch-' + id); if (!v || !el || !window.echarts) return;
    const P = palette();
    const c = echarts.init(el, null, { renderer: 'canvas' });
    try { c.setOption(v.option(A, P)); } catch (e) { console.error(id, e); }
    charts.set(id, c);
  }
  const ro = new ResizeObserver(() => charts.forEach(c => c.resize()));
  ro.observe(root);
  const onTheme = () => { charts.forEach((c, id) => { const v = VIZ.find(x => x.id === id); c.setOption(v.option(A, palette()), true); }); };
  window.addEventListener('themechange', onTheme);

  root.querySelector('.filters').addEventListener('change', e => {
    const f = e.target.dataset.f; if (!f) return;
    filt[f] = e.target.value; A = computeAll(ds, filt);
    drawKpis(); drawSections();
  });
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-tbl]'); if (t) return showTable(t.dataset.tbl);
    const p = e.target.closest('[data-png]'); if (p) { const c = charts.get(p.dataset.png); if (!c) return; const a = document.createElement('a'); a.href = c.getDataURL({ pixelRatio: 2, backgroundColor: palette().surface }); a.download = `jo-chf-${p.dataset.png}.png`; a.click(); }
  });
  root.querySelector('#print').onclick = () => { root.querySelectorAll('[data-viz]').forEach(el => { if (!charts.has(el.dataset.viz)) initChart(el.dataset.viz); }); setTimeout(() => window.print(), 600); };
  function showTable(id) {
    const v = VIZ.find(x => x.id === id); const t = v.table(A);
    modal({ title: v.title, wide: true, body: `<div class="tbl-wrap"><table class="tbl"><thead><tr>${t.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(x => `<td>${esc(x ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, actions: [{ label: 'Copy as CSV', onClick: async () => { await navigator.clipboard.writeText([t.cols, ...t.rows].map(r => r.join(',')).join('\n')); toast('Copied.'); return false; } }, { label: 'Close', kind: 'primary' }] });
  }

  // ---------- care opportunities and benchmarking (HTML) ----------
  function careHTML() {
    const g = A.gaps; const items = Object.entries(g.counts).sort((a, b) => b[1] - a[1]);
    return `<article class="viz w12"><div class="viz-head"><div class="grow"><h3>${g.withGap} of ${g.alive} living patients have at least one flag</h3><p>Automatic checks against ESC guidance using the latest medicines and labs. They highlight where to look; the treating doctor decides.</p></div></div>
      <div class="opps">${items.length ? items.map(([k, c]) => `<div class="opp"><b class="tnum">${c}</b><span>${esc(GAP_LABEL[k] || k)}</span><div class="of">${Math.round(100 * c / Math.max(1, g.alive))}% of living patients</div></div>`).join('') : '<p class="muted">No flags.</p>'}</div></article>`;
  }
  function benchHTML() {
    const cols = [['recruit', 'Recruitment vs target'], ['fu30', '30-day follow-up'], ['complete', 'Data completeness'], ['quad', 'HFrEF on 4 drugs'], ['sglt2', 'On SGLT2i'], ['arni', 'HFrEF on ARNI']];
    const P = palette();
    const shade = v => { if (v == null) return `background:var(--sunken);color:var(--muted)`; const i = Math.max(0, Math.min(6, Math.floor(v / 100 * 6.99))); const bg = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'][i]; return `background:${bg};color:${i >= 4 ? '#fff' : '#0b0b0b'}`; };
    return `<article class="viz w12"><div class="viz-head"><div class="grow"><h3>Center comparison</h3><p>Darker blue = higher. Hover a cell to see the exact value. Small centers move a lot with a few patients.</p></div></div>
      <div class="viz-body" style="overflow-x:auto"><table class="heat"><thead><tr><th></th><th>Patients</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${A.bench.map(b => `<tr><th class="rowh">${esc(b.code)} <span class="muted" style="font-weight:400">${esc(b.name)}</span></th><td style="background:var(--sunken)">${b.n}</td>${cols.map(([k]) => `<td style="${shade(b[k])}" title="${esc(b.code)} · ${b[k] ?? '–'}%">${b[k] == null ? '–' : b[k] + '%'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></article>`;
  }

  // ---------- chart definitions ----------
  function defineViz() {
    const P0 = () => palette();
    return [
      {
        sec: 'who', id: 'recruit', w: 'w8', title: 'Recruitment against target', sub: 'Cumulative patients enrolled. The dashed line is the pace needed to reach the target in 12 months.',
        option: (A, P) => ({
          ...base(P), legend: { ...base(P).legend, data: ['Enrolled', 'Target pace'] },
          xAxis: axisCat(P, A.recruitment.months.map(mLabel), { boundaryGap: false }), yAxis: axisVal(P),
          series: [
            { name: 'Enrolled', type: 'line', data: A.recruitment.cumulative, smooth: .25, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2.5, color: P.trace }, itemStyle: { color: P.trace }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: P.trace + '33' }, { offset: 1, color: P.trace + '00' }]) }, endLabel: { show: true, formatter: '{c}', color: P.ink, fontWeight: 700 } },
            { name: 'Target pace', type: 'line', data: A.recruitment.pace, symbol: 'none', lineStyle: { width: 1.5, type: [5, 4], color: P.muted }, itemStyle: { color: P.muted } },
          ],
        }),
        table: A => ({ cols: ['Month', 'Enrolled (cumulative)', 'Target pace'], rows: A.recruitment.months.map((m, i) => [mLabel(m), A.recruitment.cumulative[i], A.recruitment.pace[i]]) }),
        insight: A => { const c = A.recruitment.cumulative, p = A.recruitment.pace; if (!c.length) return ''; const d = c[c.length - 1] - p[p.length - 1]; return `<b>${fmtN(c[c.length - 1])}</b> enrolled, ${d >= 0 ? `<b>${d}</b> ahead of` : `<b>${-d}</b> behind`} the 12-month pace.`; },
      },
      {
        sec: 'who', id: 'monthly', w: 'w4', title: 'Monthly enrollment', sub: 'By setting',
        option: (A, P) => ({ ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisCat(P, A.recruitment.months.map(mLabel)), yAxis: axisVal(P),
          series: [['Inpatient', 'inpatient', P.s[2]], ['Outpatient', 'outpatient', P.s[6]]].map(([n, k, c], i) => ({ name: n, type: 'bar', stack: 'a', data: A.recruitment[k], barMaxWidth: 18, itemStyle: { color: c, borderRadius: i ? [4, 4, 0, 0] : 0, borderColor: P.surface, borderWidth: 1 } })) }),
        table: A => ({ cols: ['Month', 'Inpatient', 'Outpatient'], rows: A.recruitment.months.map((m, i) => [mLabel(m), A.recruitment.inpatient[i], A.recruitment.outpatient[i]]) }),
      },
      {
        sec: 'who', id: 'pyramid', w: 'w4', title: 'Age and sex', sub: 'Number of patients by age band',
        option: (A, P) => ({ ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' }, valueFormatter: v => Math.abs(v) },
          xAxis: axisVal(P, { axisLabel: { color: P.muted, formatter: v => Math.abs(v) } }), yAxis: axisCat(P, A.demo.bands),
          series: [{ name: 'Men', type: 'bar', stack: 's', data: A.demo.pyramid.M.map(v => -v), itemStyle: { color: P.s[6], borderRadius: [4, 0, 0, 4] }, barWidth: '62%' }, { name: 'Women', type: 'bar', stack: 's', data: A.demo.pyramid.F, itemStyle: { color: P.s[4], borderRadius: [0, 4, 4, 0] } }] }),
        table: A => ({ cols: ['Age', 'Men', 'Women'], rows: A.demo.bands.map((b, i) => [b, A.demo.pyramid.M[i], A.demo.pyramid.F[i]]) }),
      },
      {
        sec: 'who', id: 'lvef', w: 'w4', title: 'LVEF distribution', sub: 'Phenotype assigned automatically at 50%',
        option: (A, P) => ({ ...base(P), legend: { show: false }, tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisCat(P, A.demo.lvefBins.map(b => b + '–' + (b + 4))), yAxis: axisVal(P),
          series: [{ type: 'bar', name: 'Patients', data: A.demo.lvefHist.map((v, i) => ({ value: v, itemStyle: { color: A.demo.lvefSplit[i] === 'HFrEF' ? P.s[0] : P.s[1], borderRadius: [4, 4, 0, 0] } })), barCategoryGap: '12%',
            markLine: { silent: true, symbol: 'none', data: [{ xAxis: 8 }], lineStyle: { color: P.ink, type: 'solid', width: 1 }, label: { formatter: 'HFrEF | HFpEF', color: P.ink, fontSize: 11 } } }] }),
        table: A => ({ cols: ['LVEF %', 'Patients', 'Phenotype'], rows: A.demo.lvefBins.map((b, i) => [`${b}–${b + 4}`, A.demo.lvefHist[i], A.demo.lvefSplit[i]]) }),
      },
      {
        sec: 'who', id: 'nyha', w: 'w4', title: 'NYHA class at enrollment', sub: 'Share of patients in each phenotype',
        option: (A, P) => { const cols = ordinal(4, P.dark); const ph = ['HFrEF', 'HFpEF'].filter(p => !filt.pheno || p === filt.pheno); return { ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' }, valueFormatter: v => v + '%' }, grid: { ...base(P).grid, top: 34 }, xAxis: axisVal(P, { max: 100, axisLabel: { formatter: '{value}%', color: P.muted } }), yAxis: axisCat(P, ph),
          series: A.demo.nyhaKeys.map((k, i) => ({ name: 'NYHA ' + k, type: 'bar', stack: 'n', barWidth: 26, data: ph.map(p => { const t = A.demo.nyha[p].reduce((a, b) => a + b, 0); return t ? Math.round(1000 * A.demo.nyha[p][i] / t) / 10 : 0; }), itemStyle: { color: cols[i], borderColor: P.surface, borderWidth: 2 }, label: { show: true, formatter: p => p.value >= 9 ? Math.round(p.value) + '%' : '', color: i >= 2 ? '#fff' : '#0b0b0b', fontSize: 11 } })) }; },
        table: A => ({ cols: ['NYHA', 'HFrEF (n)', 'HFpEF (n)'], rows: A.demo.nyhaKeys.map((k, i) => [k, A.demo.nyha.HFrEF[i], A.demo.nyha.HFpEF[i]]) }),
      },
      {
        sec: 'who', id: 'etio', w: 'w6', title: 'Primary etiology', sub: 'Number of patients', h: 'tall',
        option: (A, P) => { const keys = A.demo.etioKeys.slice().reverse(); const ph = ['HFrEF', 'HFpEF'].filter(p => !filt.pheno || p === filt.pheno); return { ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisVal(P), yAxis: axisCat(P, keys.map(k => optionLabel(ETIOLOGY, k))),
          series: ph.map(p => ({ name: p, type: 'bar', data: keys.map(k => A.demo.etio[p][A.demo.etioKeys.indexOf(k)]), itemStyle: { color: p === 'HFrEF' ? P.s[0] : P.s[1], borderRadius: [0, 4, 4, 0] }, barGap: '15%', barMaxWidth: 12 })) }; },
        table: A => ({ cols: ['Etiology', 'HFrEF', 'HFpEF'], rows: A.demo.etioKeys.map((k, i) => [optionLabel(ETIOLOGY, k), A.demo.etio.HFrEF[i], A.demo.etio.HFpEF[i]]) }),
        insight: A => { const i = A.demo.etio.HFrEF.indexOf(Math.max(...A.demo.etio.HFrEF)); const tot = A.demo.etio.HFrEF.reduce((a, b) => a + b, 0); return tot ? `Most common cause of HFrEF: <b>${esc(optionLabel(ETIOLOGY, A.demo.etioKeys[i]))}</b> (${Math.round(100 * A.demo.etio.HFrEF[i] / tot)}%).` : ''; },
      },
      {
        sec: 'who', id: 'comorb', w: 'w6', title: 'Comorbidities', sub: 'Percentage of patients in each phenotype', h: 'tall',
        option: (A, P) => { const rows = A.demo.comorb.slice(0, 12).reverse(); const ph = ['HFrEF', 'HFpEF'].filter(p => !filt.pheno || p === filt.pheno); return { ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' }, valueFormatter: pctTip }, xAxis: axisVal(P, { max: 100, axisLabel: { formatter: '{value}%', color: P.muted } }), yAxis: axisCat(P, rows.map(r => COM_LABEL[r.k])),
          series: ph.map(p => ({ name: p, type: 'bar', data: rows.map(r => r[p]), itemStyle: { color: p === 'HFrEF' ? P.s[0] : P.s[1], borderRadius: [0, 4, 4, 0] }, barGap: '15%', barMaxWidth: 10 })) }; },
        table: A => ({ cols: ['Comorbidity', 'HFrEF %', 'HFpEF %'], rows: A.demo.comorb.map(r => [COM_LABEL[r.k], r.HFrEF, r.HFpEF]) }),
        insight: A => `<b>${A.kpi.smokingCur ?? '–'}%</b> currently smoke cigarettes, waterpipe or e-cigarettes.`,
      },
      // ---------- GDMT ----------
      {
        sec: 'gdmt', id: 'fmtcount', w: 'w7', title: 'Number of foundational drugs over time (HFrEF)', sub: 'ARNI/ACEi/ARB, beta-blocker, MRA and SGLT2 inhibitor',
        option: (A, P) => { const cols = ordinal(5, P.dark); return { ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' }, valueFormatter: v => v + '%' }, xAxis: axisCat(P, A.gdmt.countDist.map(d => `${d.l}\n(n=${d.n})`)), yAxis: axisVal(P, { max: 100, axisLabel: { formatter: '{value}%', color: P.muted } }),
          series: [0, 1, 2, 3, 4].map(c => ({ name: c === 4 ? 'All 4' : c + (c === 1 ? ' drug' : ' drugs'), type: 'bar', stack: 'c', barWidth: '46%', data: A.gdmt.countDist.map(d => d.dist[c]), itemStyle: { color: cols[c], borderColor: P.surface, borderWidth: 2, borderRadius: c === 4 ? [5, 5, 0, 0] : 0 }, label: { show: c >= 2, formatter: p => p.value >= 8 ? Math.round(p.value) + '%' : '', color: c >= 3 ? '#fff' : '#0b0b0b', fontSize: 11 } })) }; },
        table: A => ({ cols: ['Time point', 'n', '0', '1', '2', '3', '4'], rows: A.gdmt.countDist.map(d => [d.l, d.n, ...d.dist.map(x => x + '%')]) }),
        insight: A => { const d = A.gdmt.countDist; if (d.length < 2) return ''; return `Patients on all four rose from <b>${d[0].dist[4]}%</b> at baseline to <b>${d[d.length - 1].dist[4]}%</b> at ${d[d.length - 1].l.toLowerCase()} (n=${d[d.length - 1].n}).`; },
      },
      {
        sec: 'gdmt', id: 'sankey', w: 'w5', title: 'How therapy changed per patient', sub: 'Foundational drugs at baseline → today (HFrEF)', when: () => filt.pheno !== 'HFpEF',
        option: (A, P) => { const cols = ordinal(5, P.dark); const nodes = []; for (let i = 0; i <= 4; i++) nodes.push({ name: `B${i}`, itemStyle: { color: cols[i] } }); for (let i = 0; i <= 4; i++) nodes.push({ name: `N${i}`, itemStyle: { color: cols[i] } });
          const links = Object.entries(A.gdmt.sankeyLinks).map(([k, v]) => { const [a, b] = k.split('|'); return { source: 'B' + a, target: 'N' + b, value: v }; });
          const used = new Set(links.flatMap(l => [l.source, l.target]));
          return { ...base(P), tooltip: { trigger: 'item', backgroundColor: P.surface, borderColor: P.line, textStyle: { color: P.ink }, formatter: p => p.dataType === 'edge' ? `${p.data.source.slice(1)} → ${p.data.target.slice(1)} drugs: <b>${p.data.value}</b> patients` : `${p.name[0] === 'B' ? 'Baseline' : 'Today'}: ${p.name.slice(1)} drugs` },
            series: [{ type: 'sankey', left: 60, right: 60, top: 10, bottom: 10, nodeWidth: 12, nodeGap: 10, layoutIterations: 0, data: nodes.filter(n => used.has(n.name)), links, emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', opacity: .35, curveness: .5 },
              label: { color: P.ink, fontSize: 12, formatter: p => `${p.name.slice(1)} drug${p.name.slice(1) === '1' ? '' : 's'}` }, levels: [{ depth: 0, label: { position: 'left' } }, { depth: 1, label: { position: 'right' } }] }] }; },
        table: A => ({ cols: ['Baseline drugs', 'Drugs today', 'Patients'], rows: Object.entries(A.gdmt.sankeyLinks).map(([k, v]) => [...k.split('|'), v]) }),
        insight: A => { let up = 0, same = 0, down = 0; for (const [k, v] of Object.entries(A.gdmt.sankeyLinks)) { const [a, b] = k.split('|').map(Number); b > a ? up += v : b < a ? down += v : same += v; } const t = up + same + down; return t ? `<b>${Math.round(100 * up / t)}%</b> gained at least one drug class, ${Math.round(100 * same / t)}% unchanged, ${Math.round(100 * down / t)}% lost one.` : ''; },
      },
      {
        sec: 'gdmt', id: 'uptake', w: 'w6', title: 'Uptake of each drug class (HFrEF)', sub: 'Percentage of patients prescribed the class at each time point',
        option: (A, P) => ({ ...base(P), tooltip: { ...base(P).tooltip, valueFormatter: pctTip }, xAxis: axisCat(P, A.gdmt.tpUsed.map(t => t[1]), { boundaryGap: false }), yAxis: axisVal(P, { min: 0, max: 100, axisLabel: { formatter: '{value}%', color: P.muted } }),
          series: A.gdmt.uptake.map((u, i) => ({ name: L.SHORT_LABEL[u.g], type: 'line', data: u.values, symbol: 'circle', symbolSize: 8, lineStyle: { width: 2.5, color: P.s[[0, 2, 6, 1][i]] }, itemStyle: { color: P.s[[0, 2, 6, 1][i]], borderColor: P.surface, borderWidth: 2 } })) }),
        table: A => ({ cols: ['Class', ...A.gdmt.tpUsed.map(t => t[1])], rows: A.gdmt.uptake.map(u => [L.SHORT_LABEL[u.g], ...u.values.map(pctTip)]) }),
      },
      {
        sec: 'gdmt', id: 'dose', w: 'w6', title: 'Dose reached today (HFrEF)', sub: 'Share of all HFrEF patients, by % of guideline target dose',
        option: (A, P) => { const cols = ordinal(3, P.dark); const rows = A.gdmt.doseNow; return { ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' }, valueFormatter: pctTip }, xAxis: axisVal(P, { max: 100, axisLabel: { formatter: '{value}%', color: P.muted } }), yAxis: axisCat(P, rows.map(r => L.SHORT_LABEL[r.g])),
          series: [['Not prescribed', 'none', P.dark ? '#383835' : '#e1e0d9'], ['Below 50%', 'lt50', cols[0]], ['50–99%', 'mid', cols[1]], ['Target (100%)', 'ge100', cols[2]]].map(([n, k, c], i) => ({ name: n, type: 'bar', stack: 'd', barWidth: 24, data: rows.map(r => r[k]), itemStyle: { color: c, borderColor: P.surface, borderWidth: 2 }, label: { show: true, formatter: p => p.value >= 9 ? Math.round(p.value) + '%' : '', color: i >= 2 ? '#fff' : '#0b0b0b', fontSize: 11 } })) }; },
        table: A => ({ cols: ['Class', 'Not prescribed', '<50%', '50–99%', '100%'], rows: A.gdmt.doseNow.map(r => [L.SHORT_LABEL[r.g], r.none, r.lt50, r.mid, r.ge100]) }),
        note: 'SGLT2 inhibitors have a single dose and are not shown. Carvedilol target is doubled above 85 kg.',
      },
      {
        sec: 'gdmt', id: 'tofull', w: 'w6', title: 'Time to full foundational therapy (HFrEF)', sub: 'Cumulative % of patients on all four classes, by days since enrollment', when: () => filt.pheno !== 'HFpEF',
        option: (A, P) => ({ ...base(P), tooltip: { ...base(P).tooltip, formatter: ps => `Day ${ps[0].data[0]}: <b>${ps[0].data[1]}%</b> on all four` }, xAxis: axisVal(P, { type: 'value', max: 365, name: 'days', nameTextStyle: { color: P.muted }, splitLine: { show: false } }), yAxis: axisVal(P, { max: 100, axisLabel: { formatter: '{value}%', color: P.muted } }),
          series: [{ type: 'line', step: 'end', data: A.gdmt.fullCurve.map(s => [s.t, s.v]), symbol: 'none', lineStyle: { width: 2.5, color: P.navy }, areaStyle: { color: P.navy, opacity: .08 }, markLine: { silent: true, symbol: 'none', lineStyle: { color: P.axis, type: 'solid' }, label: { color: P.muted, fontSize: 11 }, data: [{ xAxis: 30, label: { formatter: '30 d' } }, { xAxis: 180, label: { formatter: '6 m' } }] } }] }),
        table: A => ({ cols: ['Day', '% on all four'], rows: A.gdmt.fullCurve.map(s => [s.t, s.v]) }),
        insight: A => { const c = A.gdmt.fullCurve; const at = d => (c.filter(s => s.t <= d).pop() || { v: 0 }).v; return `<b>${A.gdmt.fullAtBase ?? 0}%</b> started on all four. By day 90: <b>${at(90)}%</b>; by day 180: <b>${at(180)}%</b>.`; },
      },
      {
        sec: 'gdmt', id: 'reasons', w: 'w6', title: 'Why drugs are not prescribed or below target', sub: 'Reasons recorded at baseline (HFrEF, all classes)',
        option: (A, P) => { const e = Object.entries(A.gdmt.reasonCount).sort((a, b) => a[1] - b[1]); return { ...base(P), legend: { show: false }, tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisVal(P), yAxis: axisCat(P, e.map(x => optionLabel(REASONS, x[0]))), series: [{ type: 'bar', name: 'Times recorded', data: e.map(x => x[1]), itemStyle: { color: P.s[0], borderRadius: [0, 4, 4, 0] }, barWidth: 12, label: { show: true, position: 'right', color: P.ink2, fontSize: 11 } }] }; },
        table: A => ({ cols: ['Reason', 'Count', ...L.FOUNDATIONAL.map(g => L.SHORT_LABEL[g])], rows: Object.entries(A.gdmt.reasonCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => [optionLabel(REASONS, k), v, ...L.FOUNDATIONAL.map(g => A.gdmt.reasonByClass[g][k] || 0)]) }),
        insight: A => `HFpEF: <b>${A.gdmt.hfpef.now ?? '–'}%</b> on MRA + SGLT2i today (from ${A.gdmt.hfpef.base ?? '–'}% at baseline); ${A.gdmt.hfpef.sglt2Now ?? '–'}% on an SGLT2i.`,
      },
      // ---------- outcomes ----------
      {
        sec: 'out', id: 'km', w: 'w6', title: 'Survival', sub: 'Kaplan–Meier, all-cause death, with 95% confidence band',
        option: (A, P) => kmOption(A.outcomes.surv, P, 'Survival'),
        table: A => kmTable(A.outcomes.surv),
        insight: A => A.outcomes.surv.map(s => { const x = kmAt(s.steps, 365); return `${s.name}: <b>${Math.round(x.s * 1000) / 10}%</b> alive at 12 months`; }).join(' · '),
        note: 'Patients without an event are censored at today, at withdrawal, or at the last contact if lost to follow-up.',
      },
      {
        sec: 'out', id: 'comp', w: 'w6', title: 'Free from HF hospitalization or death', sub: 'Kaplan–Meier, first HF hospitalization or death',
        option: (A, P) => kmOption(A.outcomes.comp, P, 'Event-free'),
        table: A => kmTable(A.outcomes.comp),
        insight: A => A.outcomes.comp.map(s => { const x = kmAt(s.steps, 180); return `${s.name}: <b>${Math.round(x.s * 1000) / 10}%</b> event-free at 6 months`; }).join(' · '),
      },
      {
        sec: 'out', id: 'cause', w: 'w5', title: 'Causes of death', sub: 'Red = cardiovascular, gray = non-cardiovascular. Adjudicated cause where available',
        option: (A, P) => { const e = Object.entries(A.outcomes.causeCount).sort((a, b) => a[1] - b[1]); return { ...base(P), legend: { show: false }, tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisVal(P), yAxis: axisCat(P, e.map(x => optionLabel(DEATH_CAUSE, x[0]))), series: [{ type: 'bar', data: e.map(x => ({ value: x[1], itemStyle: { color: ['scd', 'pump', 'mi', 'stroke', 'cv_other'].includes(x[0]) ? P.s[7] : P.muted, borderRadius: [0, 4, 4, 0] } })), barWidth: 12, label: { show: true, position: 'right', color: P.ink2, fontSize: 11 } }] }; },
        table: A => ({ cols: ['Cause', 'Deaths'], rows: Object.entries(A.outcomes.causeCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => [optionLabel(DEATH_CAUSE, k), v]) }),
        insight: A => A.kpi.deaths ? `<b>${Math.round(100 * A.kpi.cvDeaths / A.kpi.deaths)}%</b> of ${A.kpi.deaths} deaths were cardiovascular. In-hospital mortality during the index admission: <b>${A.kpi.inHospMort ?? '–'}%</b>.` : 'No deaths recorded.',
      },
      {
        sec: 'out', id: 'kccq', w: 'w7', title: 'KCCQ-12 health status over time', sub: 'Mean score (0–100, higher is better) at each visit',
        option: (A, P) => { const doms = [['summary', 'Overall'], ['PL', 'Physical'], ['SF', 'Symptoms'], ['QL', 'Quality of life'], ['SL', 'Social']]; const cols = ordinal(3, P.dark); const tps = A.kccq.filter(k => k.n);
          return { ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisCat(P, doms.map(d => d[1])), yAxis: axisVal(P, { max: 100 }),
            series: tps.map((k, i) => ({ name: `${k.l} (n=${k.n})`, type: 'bar', data: doms.map(d => k[d[0]]), itemStyle: { color: cols[i], borderRadius: [4, 4, 0, 0] }, barGap: '12%', barMaxWidth: 22, label: { show: i === tps.length - 1, position: 'top', color: P.ink, fontSize: 11, formatter: p => Math.round(p.value) } })) }; },
        table: A => ({ cols: ['Visit', 'n', 'Overall', 'Physical', 'Symptoms', 'Quality of life', 'Social'], rows: A.kccq.map(k => [k.l, k.n, k.summary, k.PL, k.SF, k.QL, k.SL]) }),
        insight: A => A.kpi.kccqChange != null ? `Patients with both visits improved by <b>${A.kpi.kccqChange > 0 ? '+' : ''}${A.kpi.kccqChange}</b> points on average from baseline to 6 months; <b>${A.kpi.improved5}%</b> improved by 5 points or more (a clinically meaningful change).` : '',
      },
      // ---------- labs & devices ----------
      {
        sec: 'labs', id: 'bnp', w: 'w6', title: 'NT-proBNP by NYHA class', sub: 'Baseline, pg/mL, log scale (box = middle 50%, line = median)',
        option: (A, P) => ({ ...base(P), legend: { show: false }, tooltip: { trigger: 'item', backgroundColor: P.surface, borderColor: P.line, textStyle: { color: P.ink }, formatter: p => `NYHA ${p.name} (n=${A.labs.bnpN[p.dataIndex]})<br>Median <b>${fmtN(p.data[3])}</b><br>IQR ${fmtN(p.data[2])}–${fmtN(p.data[4])}` },
          xAxis: axisCat(P, A.labs.nyhaKeys), yAxis: axisVal(P, { type: 'log', logBase: 10, min: 100, axisLabel: { color: P.muted, formatter: v => v >= 1000 ? v / 1000 + 'k' : v } }),
          series: [{ type: 'boxplot', data: A.labs.bnpByNyha, itemStyle: { color: P.s[0] + '30', borderColor: P.s[0], borderWidth: 1.5 }, boxWidth: [18, 46] }] }),
        table: A => ({ cols: ['NYHA', 'n', 'Min', 'Q1', 'Median', 'Q3', 'Max'], rows: A.labs.nyhaKeys.map((k, i) => [k, A.labs.bnpN[i], ...A.labs.bnpByNyha[i].map(v => v == null ? '–' : Math.round(v))]) }),
      },
      {
        sec: 'labs', id: 'egfr', w: 'w6', title: 'Kidney function at baseline', sub: 'eGFR (CKD-EPI 2021) category, mL/min/1.73m²',
        option: (A, P) => { const cols = ['#86b6ef', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']; const lab = { G1: 'G1 ≥90', G2: 'G2 60–89', G3a: 'G3a 45–59', G3b: 'G3b 30–44', G4: 'G4 15–29', G5: 'G5 <15' }; return { ...base(P), legend: { show: false }, tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisCat(P, A.labs.egfrKeys.map(k => lab[k])), yAxis: axisVal(P), series: [{ type: 'bar', name: 'Patients', data: A.labs.egfr.map((v, i) => ({ value: v, itemStyle: { color: cols[i], borderRadius: [4, 4, 0, 0] } })), barWidth: '55%', label: { show: true, position: 'top', color: P.ink2, fontSize: 11 } }] }; },
        table: A => ({ cols: ['eGFR category', 'Patients'], rows: A.labs.egfrKeys.map((k, i) => [k, A.labs.egfr[i]]) }),
        insight: A => { const t = A.labs.egfr.reduce((a, b) => a + b, 0); const lo = A.labs.egfr.slice(2).reduce((a, b) => a + b, 0); return t ? `<b>${Math.round(100 * lo / t)}%</b> have eGFR below 60.` : ''; },
      },
      {
        sec: 'labs', id: 'iron', w: 'w6', title: 'Iron deficiency cascade', sub: 'Ferritin <100, or 100–299 with TSAT <20%',
        option: (A, P) => { const i = A.labs.iron; const d = [['All patients', i.all], ['Iron studies done', i.tested], ['Iron deficient', i.deficient], ['Received IV iron', i.treated]]; const cols = ordinal(4, P.dark); return { ...base(P), legend: { show: false }, tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisCat(P, d.map(x => x[0])), yAxis: axisVal(P), series: [{ type: 'bar', data: d.map((x, k) => ({ value: x[1], itemStyle: { color: cols[k], borderRadius: [4, 4, 0, 0] } })), barWidth: '50%', label: { show: true, position: 'top', color: P.ink, fontSize: 11.5, fontWeight: 600, formatter: p => `${p.value}${p.dataIndex ? ` (${Math.round(100 * p.value / Math.max(1, d[p.dataIndex - 1][1]))}%)` : ''}` } }] }; },
        table: A => ({ cols: ['Step', 'Patients'], rows: [['All', A.labs.iron.all], ['Tested', A.labs.iron.tested], ['Deficient', A.labs.iron.deficient], ['IV iron', A.labs.iron.treated]] }),
        insight: A => { const i = A.labs.iron; return i.deficient ? `Only <b>${Math.round(100 * i.treated / i.deficient)}%</b> of iron-deficient patients received IV iron.` : ''; },
      },
      {
        sec: 'labs', id: 'devices', w: 'w6', title: 'Device therapy where LVEF ≤35%', sub: 'HFrEF patients with LVEF 35% or less',
        option: (A, P) => { const d = A.devices; const cats = ['ICD', 'CRT-D', 'CRT-P']; const has = [d.icd.present, d.crtd.present, d.crtp.present], ind = [d.icd.indicated, d.crtd.indicated, d.crtp.indicated]; return { ...base(P), tooltip: { ...base(P).tooltip, axisPointer: { type: 'shadow' } }, xAxis: axisVal(P), yAxis: axisCat(P, cats), series: [{ name: 'Has device', type: 'bar', stack: 'd', data: has, itemStyle: { color: P.s[0] }, barWidth: 20 }, { name: 'Indicated, not done', type: 'bar', stack: 'd', data: ind, itemStyle: { color: P.s[3], borderRadius: [0, 4, 4, 0] } }] }; },
        table: A => ({ cols: ['Device', 'Has device', 'Indicated, not done'], rows: [['ICD', A.devices.icd.present, A.devices.icd.indicated], ['CRT-D', A.devices.crtd.present, A.devices.crtd.indicated], ['CRT-P', A.devices.crtp.present, A.devices.crtp.indicated]] }),
        insight: A => `${A.devices.cand} patients have LVEF ≤35%. Of ${A.devices.crtCand} with LBBB and QRS ≥150 ms, <b>${A.devices.crtDone}</b> have CRT.`,
      },
    ];
  }
  function kmOption(groups, P, yName) {
    const colors = { HFrEF: P.s[0], HFpEF: P.s[1] };
    const series = [];
    for (const g of groups) {
      const c = colors[g.name] || P.navy;
      const pts = g.steps.filter(s => s.t <= 380);
      const last = pts[pts.length - 1];
      const ext = [...pts, { ...last, t: Math.min(380, Math.max(...g.items.map(i => i.t), 0)) }];
      series.push({ name: g.name, type: 'line', step: 'end', symbol: 'none', data: ext.map(s => [s.t, Math.round(s.s * 1000) / 10]), lineStyle: { width: 2.5, color: c }, itemStyle: { color: c }, z: 3 });
      // 95% confidence band drawn as one stepped polygon
      series.push({
        name: g.name + ' 95% CI', type: 'custom', silent: true, z: 1, tooltip: { show: false }, data: [[0, 0]],
        renderItem: (params, api) => {
          if (params.dataIndex !== 0) return;
          const up = [], lo = [];
          for (let i = 0; i < ext.length; i++) {
            const t0 = ext[i].t, t1 = i + 1 < ext.length ? ext[i + 1].t : ext[i].t;
            up.push(api.coord([t0, ext[i].hi * 100]), api.coord([t1, ext[i].hi * 100]));
            lo.push(api.coord([t0, ext[i].lo * 100]), api.coord([t1, ext[i].lo * 100]));
          }
          return { type: 'polygon', shape: { points: [...up, ...lo.reverse()] }, style: { fill: c, opacity: 0.13 } };
        },
      });
    }
    const minY = Math.max(0, Math.floor(Math.min(...groups.flatMap(g => g.steps.filter(s => s.t <= 380).map(s => s.lo * 100))) / 10) * 10 - 10);
    return {
      ...base(P), legend: { ...base(P).legend, data: groups.map(g => g.name) },
      tooltip: { ...base(P).tooltip, formatter: ps => { const t = ps[0].data[0]; return `Day ${t}<br>` + groups.map(g => { const x = kmAt(g.steps, t); return `${g.name}: <b>${Math.round(x.s * 1000) / 10}%</b> · at risk ${atRiskAt(g.items, t)}`; }).join('<br>'); } },
      grid: { ...base(P).grid, bottom: 30 },
      xAxis: axisVal(P, { type: 'value', min: 0, max: 365, interval: 90, splitLine: { show: false }, axisLabel: { color: P.muted, formatter: v => v === 0 ? '0' : v + ' d' } }),
      yAxis: axisVal(P, { min: minY, max: 100, axisLabel: { formatter: '{value}%', color: P.muted } }),
      series,
    };
  }
  function kmTable(groups) {
    const ts = [0, 30, 90, 180, 270, 365];
    return { cols: ['Group', ...ts.map(t => `Day ${t}`)], rows: groups.flatMap(g => [[g.name + ' % event-free', ...ts.map(t => Math.round(kmAt(g.steps, t).s * 1000) / 10)], [g.name + ' at risk', ...ts.map(t => atRiskAt(g.items, t))]]) };
  }

  drawKpis(); drawSections();
  return () => { io?.disconnect(); ro.disconnect(); window.removeEventListener('themechange', onTheme); charts.forEach(c => c.dispose()); };
}
