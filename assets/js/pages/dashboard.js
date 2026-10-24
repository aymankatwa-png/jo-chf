// Main dashboard: registry total and one card per center.
import { call } from '../api.js';
import { esc, icon, ring, animateRings, sparkline, countUp, fmtPct, fmtN } from '../ui/dom.js';
import { rhythmStrip, playRhythm } from '../ui/ecg.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const meterCls = v => (v == null ? '' : v < 70 ? ' badv' : v < 85 ? ' lowv' : '');

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name.split(' ').slice(0, 2).join(' ')}`;
}

export async function render(root, _, app) {
  app.setCrumbs([{ label: 'Dashboard' }]);
  const d = await call('dash.summary');
  const t = d.total;
  const pct = t.target ? Math.round(100 * t.enrolled / t.target) : 0;
  let sort = 'code';

  const fuCell = (lab, v) => `<div><div class="lab"><span>${lab}</span><b>${v == null ? '–' : v + '%'}</b></div><div class="meter${meterCls(v)}"><i data-w="${v ?? 0}"></i></div></div>`;
  const card = c => {
    const p = c.target ? Math.round(100 * c.enrolled / c.target) : 0;
    const tag = c.canOpen ? 'a' : 'div';
    return `<${tag} class="ccard${c.id === d.myCenter ? ' mine' : ''}${c.canOpen ? '' : ' locked'}" ${c.canOpen ? `href="#/center/${c.id}"` : 'aria-disabled="true"'}>
      <div class="ccard-top">
        <div class="grow"><div class="code">${esc(c.code)}</div><div class="cname">${esc(c.name)}</div>
          <div class="enrolled" style="margin-top:10px"><b>${c.enrolled}</b><span>of ${c.target || '–'} enrolled</span></div></div>
        ${ring(p, 62, 6, c.id === d.myCenter ? 'var(--trace)' : 'var(--navy)')}
      </div>
      ${sparkline(c.trend, 240, 34)}
      <div class="fu-bars">${fuCell('30 days', c.followup.d30)}${fuCell('6 months', c.followup.m6)}${fuCell('12 months', c.followup.m12)}</div>
      <div class="ccard-foot">
        <span title="Required fields completed">${icon('clipboard').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} ${c.completeness == null ? '–' : c.completeness + '%'} complete</span>
        ${c.overdue ? `<span class="badge bad">${c.overdue} overdue</span>` : '<span class="badge good">No overdue visits</span>'}
        ${c.canOpen ? `<span class="open">Open ${icon('arrow')}</span>` : `<span class="lock">${icon('lock')}Summary only</span>`}
      </div>
    </${tag}>`;
  };
  const sorted = () => {
    const cs = [...d.cards];
    if (sort === 'enrolled') cs.sort((a, b) => b.enrolled / (b.target || 1) - a.enrolled / (a.target || 1));
    else if (sort === 'followup') cs.sort((a, b) => (b.followup.d30 ?? -1) - (a.followup.d30 ?? -1));
    else if (sort === 'overdue') cs.sort((a, b) => b.overdue - a.overdue);
    else cs.sort((a, b) => a.code.localeCompare(b.code));
    if (d.myCenter) cs.sort((a, b) => (b.id === d.myCenter) - (a.id === d.myCenter));
    return cs;
  };

  root.innerHTML = `
  <div class="reveal">
    <div class="page-head"><div class="grow"><h1>${esc(greeting(app.user.name))}</h1>
      <p>${app.isAdmin ? 'Live status of the registry across all centers. Click any center to open it.' : `Live status of the registry. You can open <b>${esc(app.center?.name || 'your center')}</b>; other centers show summary numbers only.`}</p></div>
      ${!app.isAdmin && app.user.centerId ? `<a class="btn primary" href="#/patient/new/${app.user.centerId}">${icon('plus')}Add new patient</a>` : `<a class="btn" href="#/analytics">${icon('chart')}Open analytics</a>`}
    </div>
    <section class="hero-rhythm" aria-label="Registry total">
      <div class="ecg-paper"></div>
      <div class="hero-grid">
        <div class="hero-count">
          <div><span class="big" id="big">0</span><span class="of">/ ${fmtN(t.target)}</span></div>
          <div class="caption">patients enrolled in Jo-CHF · <b class="tnum">${pct}%</b> of the registry target</div>
          <div class="bar"><i id="bigbar"></i></div>
        </div>
        <div class="rhythm-wrap">
          <div id="rhythm">${rhythmStrip(t.trend, t.months.map(m => MONTHS[+m.slice(5) - 1]))}</div>
          <div class="rhythm-legend"><span>Each beat is one month. Taller beat, more patients enrolled.</span></div>
        </div>
      </div>
      <div class="hero-stats">
        <div><div class="v tnum" data-c="${t.followup.d30 ?? ''}">–</div><div class="l">30-day follow-up done</div></div>
        <div><div class="v tnum" data-c="${t.followup.m6 ?? ''}">–</div><div class="l">6-month follow-up done</div></div>
        <div><div class="v tnum" data-c="${t.followup.m12 ?? ''}">–</div><div class="l">12-month follow-up done</div></div>
        <div><div class="v tnum" data-c="${t.completeness ?? ''}">–</div><div class="l">Required data completed</div></div>
        <div><div class="v tnum">${t.overdue}<small> visits</small></div><div class="l">Overdue now · ${t.openNow} windows open</div></div>
      </div>
    </section>
    <div>
      <div class="section-title"><h2>Centers</h2>
        <label class="small muted" for="sort">Sort by</label>
        <select id="sort" class="input" style="width:auto;height:34px;font-size:13.5px">
          <option value="code">Center code</option><option value="enrolled">Recruitment vs target</option><option value="followup">30-day follow-up</option><option value="overdue">Overdue visits</option>
        </select>
      </div>
      <div class="centers" id="centers">${sorted().map(card).join('')}</div>
      ${!d.cards.length ? `<div class="card empty">${icon('building')}<h3>No centers yet</h3><p>${app.isAdmin ? 'Add the participating centers and their recruitment targets.' : 'The study team has not added centers yet.'}</p>${app.isAdmin ? '<p style="margin-top:14px"><a class="btn primary" href="#/admin/centers">Add centers</a></p>' : ''}</div>` : ''}
    </div>
  </div>`;

  countUp(root.querySelector('#big'), t.enrolled, { dur: 1800 });
  root.querySelectorAll('[data-c]').forEach(el => el.dataset.c !== '' ? countUp(el, +el.dataset.c, { suffix: '%' }) : null);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelector('#bigbar').style.width = Math.min(100, pct) + '%';
    root.querySelectorAll('.meter i[data-w]').forEach(i => (i.style.width = i.dataset.w + '%'));
  }));
  const rh = root.querySelector('#rhythm');
  const rw = Math.max(320, rh.clientWidth || 900);
  const keep = rw < 520 ? 6 : 12;
  rh.innerHTML = rhythmStrip(t.trend.slice(-keep), t.months.slice(-keep).map(m => MONTHS[+m.slice(5) - 1]), { width: rw });
  playRhythm(rh);
  animateRings(root);
  root.querySelector('#sort').onchange = e => {
    sort = e.target.value;
    const el = root.querySelector('#centers'); el.innerHTML = sorted().map(card).join('');
    el.querySelectorAll('.meter i[data-w]').forEach(i => (i.style.width = i.dataset.w + '%'));
    animateRings(el);
  };
}
