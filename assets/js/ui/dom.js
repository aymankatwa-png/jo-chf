// Small UI toolkit: escaping, icons, toasts, dialogs, number helpers.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const attr = (k, v) => (v == null || v === false ? '' : v === true ? ` ${k}` : ` ${k}="${esc(v)}"`);

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  lock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  unlock: '<rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 7.8-1.3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pulse: '<path d="M2 12h4l2.5-6 4 12 3-8 2 2H22"/>',
  branch: '<circle cx="6" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 7.5v9M18 11.5c0 3-4 3-12 5.5"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 14h9"/>',
  heart: '<path d="M12 20.5s-8-4.7-8-10.7A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8c0 6-8 10.7-8 10.7z"/>',
  pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  bed: '<path d="M2 18V6M2 13h20v5M22 13v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="6.5" cy="10" r="2"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M5 21h14v-3H5zM12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6.5A2.5 2.5 0 0 0 4 21.5 2.5 2.5 0 0 0 6.5 24H20"/>',
  flag: '<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
  skull: '<path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3h10v-3c1.5-1 3-3 3-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M10 19v3M14 19v3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-3.5L3 10M3 4v6h6M4 13a8 8 0 0 0 14.8 3.5L21 14M21 20v-6h-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
export const ECG_MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 36h12l4-10 6 22 6-30 5 18h19" fill="none" stroke="#FF4D5E" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---------- toasts ----------
export function toast(msg, kind = 'ok', ms = 3200) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'bad' ? ' bad' : '');
  el.innerHTML = icon(kind === 'bad' ? 'alert' : kind === 'info' ? 'info' : 'check') + `<span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}

// ---------- modal ----------
export function modal({ title, body, actions = [], wide = false, onOpen, dismissable = true }) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2>${dismissable ? `<button class="btn ghost sm icon" data-x aria-label="Close">${icon('x')}</button>` : ''}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-a="${i}"${a.disabled ? ' disabled' : ''}>${esc(a.label)}</button>`).join('')}</div>
    </div>`;
    root.appendChild(back);
    const prevFocus = document.activeElement;
    const close = v => { back.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape' && dismissable) close(null); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', async e => {
      if (e.target === back && dismissable) return close(null);
      if (e.target.closest('[data-x]')) return close(null);
      const b = e.target.closest('[data-a]');
      if (b) {
        const a = actions[+b.dataset.a];
        if (a.onClick) {
          b.disabled = true; const label = b.innerHTML; b.innerHTML = '<span class="spin"></span>';
          try { const r = await a.onClick(back); if (r !== false) close(r === undefined ? a.value ?? true : r); }
          catch (err) { toast(err.message || String(err), 'bad', 5000); }
          finally { if (b.isConnected) { b.disabled = false; b.innerHTML = label; } }
        } else close(a.value ?? true);
      }
    });
    onOpen?.(back);
    setTimeout(() => (back.querySelector('input, select, textarea, [data-a]') || back).focus?.(), 30);
  });
}
export function confirmDialog(title, text, okLabel = 'Confirm', kind = 'primary') {
  return modal({ title, body: `<p class="ink2">${esc(text)}</p>`, actions: [{ label: 'Cancel', value: false }, { label: okLabel, kind, value: true }] });
}
export function reasonDialog(title, text, okLabel = 'Save with reason') {
  return modal({
    title, body: `<p class="ink2">${esc(text)}</p><div class="field"><label for="rsn">Reason for change</label><textarea id="rsn" class="input" placeholder="For example: corrected from the source document"></textarea></div>`,
    actions: [{ label: 'Cancel', value: null }, { label: okLabel, kind: 'primary', onClick: back => { const v = back.querySelector('#rsn').value.trim(); if (!v) throw new Error('Please write a reason.'); return v; } }],
  });
}

// ---------- formatting ----------
export const fmtN = (v, d = 0) => (v == null || isNaN(v) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtPct = (v, d = 0) => (v == null || isNaN(v) ? '–' : fmtN(v, d) + '%');
export function initials(name) { return String(name || '?').replace(/^(Dr\.?|Prof\.?)\s+/i, '').split(/\s+/).filter(w => /^[A-Za-z\u0600-\u06FF]/.test(w)).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'; }
export function relDays(iso, today) {
  if (!iso) return '';
  const d = Math.round((new Date(iso) - new Date(today)) / 864e5);
  if (d === 0) return 'today'; if (d === 1) return 'tomorrow'; if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

// ---------- tiny visual atoms ----------
export function ring(pct, size = 62, stroke = 6, color = 'var(--navy)', label) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-offset="${c * (1 - p / 100)}"/>
  </svg><div class="ring-pct">${label ?? Math.round(p) + '%'}</div></div>`;
}
export function animateRings(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.ring-val[data-offset]', root).forEach(c => (c.style.strokeDashoffset = c.dataset.offset))));
}
export function sparkline(values, w = 240, h = 34, color = 'var(--ink-2)') {
  if (!values?.length) return '';
  const max = Math.max(1, ...values), n = values.length;
  const pts = values.map((v, i) => [(i / (n - 1)) * w, h - 3 - (v / max) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d} L${w} ${h} L0 ${h}Z" fill="${color}" opacity=".08"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="var(--trace)"/></svg>`;
}
export function countUp(el, to, { dur = 1400, dec = 0, suffix = '' } = {}) {
  if (!el) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || to == null || isNaN(to)) { el.textContent = to == null || isNaN(to) ? '–' : fmtN(to, dec) + suffix; return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 4); el.textContent = fmtN(to * e, dec) + suffix; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
export function loader() { return `<div class="loader" role="status" aria-label="Loading"><svg viewBox="0 0 160 60"><path d="M0 34h40l8-16 10 30 10-40 9 26h83"/></svg></div>`; }
export function statusBadge(st) {
  const map = { complete: ['good', 'Complete'], incomplete: ['warn', 'Incomplete'], locked: ['ink', 'Locked'], deceased: ['', 'Deceased'], lost: ['bad', 'Lost to follow-up'], withdrawn: ['', 'Withdrawn'] };
  const [k, l] = map[st] || ['', st];
  return `<span class="badge ${k}">${st === 'locked' ? icon('lock') .replace('<svg', '<svg style="width:12px;height:12px"') : '<span class="dot"></span>'}${l}</span>`;
}
export function dueBadge(nd) {
  if (!nd) return '<span class="muted">–</span>';
  const k = { missed: 'bad', open: 'good', soon: 'info', upcoming: '' }[nd.status] || '';
  const l = { missed: 'Missed', open: 'Window open', soon: 'Opens soon', upcoming: '' }[nd.status];
  return `<div class="tnum">${nd.label || ''} <span class="muted small">· ${fmtDateShort(nd.due)}</span></div>${l ? `<span class="badge ${k}" style="margin-top:4px">${l}</span>` : ''}`;
}
export function fmtDateShort(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function loadScript(src) {
  return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
}
