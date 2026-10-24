// Form fields driven by the schema. Values live in a plain object; fields read and write it by path.
import { esc, icon, attr } from './dom.js';
import { getPath, setPath, isFilled, fmtDate, dmyToISO, LAB_UNITS, toStdUnit, num } from '../core/logic.js';

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const fid = k => 'f_' + k.replace(/[^a-zA-Z0-9]/g, '_');

// ctx: { obj, issues: {path: {level,msg}}, readonly, showMissing, ndAllowed }
export function field(f, ctx) {
  const obj = ctx.obj;
  if (f.show && !f.show(obj)) return '';
  const v = getPath(obj, f.k);
  const nd = obj.notDone?.[f.k];
  const iss = ctx.issues?.[f.k];
  const missing = ctx.showMissing && f.req && !nd && !isFilledField(obj, f);
  const cls = ['field', f.full ? 'full' : '', iss?.level === 'error' ? 'has-error' : '', missing ? 'missing' : '', nd ? 'nd' : ''].filter(Boolean).join(' ');
  const ro = ctx.readonly;
  const id = fid(f.k);
  const label = `<label for="${id}">${esc(f.label)}${f.req ? '<span class="req" aria-label="required">*</span>' : ''}${f.nd && ctx.ndAllowed !== false ? ndToggle(f.k, nd, ro) : ''}</label>`;
  const help = f.help ? `<div class="help">${esc(f.help)}</div>` : '';
  const msg = iss ? `<div class="${iss.level === 'error' ? 'err' : 'warnmsg'}" role="${iss.level === 'error' ? 'alert' : 'status'}">${esc(iss.msg)}</div>` : '';
  let input = '';
  switch (f.type) {
    case 'text': input = `<input id="${id}" class="input" data-k="${f.k}" data-t="text" value="${esc(v ?? '')}"${attr('readonly', ro)}${attr('placeholder', f.placeholder)}>`; break;
    case 'textarea': input = `<textarea id="${id}" class="input" data-k="${f.k}" data-t="text"${attr('readonly', ro)}>${esc(v ?? '')}</textarea>`; break;
    case 'number': input = `<div class="with-unit"><input id="${id}" class="input" inputmode="decimal" data-k="${f.k}" data-t="number" value="${v ?? ''}"${attr('readonly', ro)} autocomplete="off">${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ''}</div>`; if (!f.unit) input = input.replace('class="with-unit"', 'class=""'); break;
    case 'date': input = dateInput(id, f.k, v, ro); break;
    case 'month': input = `<input id="${id}" class="input tnum" data-k="${f.k}" data-t="month" placeholder="MM/YYYY" value="${v ? esc(v.slice(5, 7) + '/' + v.slice(0, 4)) : ''}"${attr('readonly', ro)} inputmode="numeric" maxlength="7">`; break;
    case 'select': input = `<select id="${id}" class="input" data-k="${f.k}" data-t="select"${attr('disabled', ro)}><option value="">Choose…</option>${f.opts.map(([ov, ol]) => `<option value="${esc(ov)}"${ov === v ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`; break;
    case 'seg': input = `<div class="seg" role="group" aria-labelledby="${id}" id="${id}">${f.opts.map(([ov, ol]) => `<button type="button" data-k="${f.k}" data-t="seg" data-v="${esc(ov)}" aria-pressed="${ov === v}"${attr('disabled', ro)}>${esc(ol)}</button>`).join('')}</div>`; break;
    case 'multi': input = `<div class="checks" id="${id}">${f.opts.map(([ov, ol]) => `<label class="chip-check"><input type="checkbox" data-k="${f.k}" data-t="multi" value="${esc(ov)}"${(v || []).includes(ov) ? ' checked' : ''}${attr('disabled', ro)}><span class="box">${CHECK}</span>${esc(ol)}</label>`).join('')}</div>`; break;
    case 'check': return `<div class="${cls} full"><label class="check-line"><input type="checkbox" id="${id}" data-k="${f.k}" data-t="check"${v === true ? ' checked' : ''}${attr('disabled', ro)}><span class="box">${CHECK}</span><span>${esc(f.label)}${f.req ? '<span class="req"> *</span>' : ''}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</span></label>${msg}</div>`;
    case 'lab': input = labInput(id, f, obj, ro); break;
    case 'computed': { const c = f.calc(obj); input = `<div class="computed" data-computed="${f.k}" id="${id}">${c && f.badge ? `<span class="pheno ${esc(c)}">${esc(c)}</span>` : esc(c ?? '')}</div>`; break; }
    case 'readonly': input = `<input id="${id}" class="input" value="${esc(v ?? '')}" readonly placeholder="Filled when saved">`; break;
  }
  return `<div class="${cls}" data-field="${f.k}">${label}${input}${help}${msg}</div>`;
}
function isFilledField(obj, f) {
  if (f.k === 'labs.creat' || f.type === 'lab') return isFilled(getPath(obj, f.k));
  if (f.type === 'check') return getPath(obj, f.k) === true;
  return isFilled(getPath(obj, f.k));
}
function ndToggle(k, nd, ro) {
  return `<span class="nd-toggle" role="group" aria-label="Mark as not done or unknown">
    <button type="button" data-nd="${k}" data-v="nd" aria-pressed="${nd === 'nd'}" title="Not done"${attr('disabled', ro)}>Not done</button>
    <button type="button" data-nd="${k}" data-v="unk" aria-pressed="${nd === 'unk'}" title="Unknown"${attr('disabled', ro)}>Unknown</button></span>`;
}
export function dateInput(id, k, v, ro) {
  return `<div class="date-wrap"><input id="${id}" class="input" data-k="${k}" data-t="date" placeholder="DD/MM/YYYY" value="${esc(fmtDate(v))}" inputmode="numeric" maxlength="10" autocomplete="off"${attr('readonly', ro)}>
    ${ro ? '' : `<button type="button" class="cal" data-cal="${k}" aria-label="Open calendar">${icon('calendar')}</button><input type="date" tabindex="-1" aria-hidden="true" data-native="${k}" value="${esc(v || '')}">`}</div>`;
}
function labInput(id, f, obj, ro) {
  const def = LAB_UNITS[f.lab];
  const raw = obj.raw?.[f.k];
  const unit = raw?.u || def.std;
  const shown = raw && raw.u !== def.std ? raw.v : getPath(obj, f.k);
  const units = Object.keys(def.units);
  return `<div class="with-unit"><input id="${id}" class="input" inputmode="decimal" data-k="${f.k}" data-t="lab" data-lab="${f.lab}" value="${shown ?? ''}"${attr('readonly', ro)} autocomplete="off">
    ${units.length > 1 ? `<select class="unit" data-unit="${f.k}" aria-label="${esc(f.label)} unit"${attr('disabled', ro)}>${units.map(u => `<option${u === unit ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>` : `<span class="unit">${esc(def.std)}</span>`}</div>
    ${raw && raw.u !== def.std && raw.v != null && getPath(obj, f.k) != null ? `<div class="help tnum">Stored as ${getPath(obj, f.k)} ${esc(def.std)}</div>` : ''}`;
}

// Wire events. onChange(path, {structural}) is called after the object is updated.
export function bindFields(root, getObj, onChange) {
  const dateMask = el => {
    let s = el.value.replace(/[^\d]/g, '').slice(0, 8);
    if (s.length > 4) s = s.slice(0, 2) + '/' + s.slice(2, 4) + '/' + s.slice(4); else if (s.length > 2) s = s.slice(0, 2) + '/' + s.slice(2);
    el.value = s;
  };
  root.addEventListener('input', e => {
    const el = e.target; const k = el.dataset.k; if (!k) return;
    const obj = getObj(); const t = el.dataset.t;
    if (t === 'text') { setPath(obj, k, el.value || undefined); onChange(k, {}); }
    else if (t === 'number') { const v = el.value.trim().replace(',', '.'); setPath(obj, k, v === '' ? undefined : num(v)); onChange(k, {}); }
    else if (t === 'lab') { setLab(obj, k, el.dataset.lab, el.value, root.querySelector(`[data-unit="${k}"]`)?.value); onChange(k, {}); }
    else if (t === 'date') { dateMask(el); const iso = dmyToISO(el.value); if (el.value.length === 10) { setPath(obj, k, iso || undefined); el.setCustomValidity(iso ? '' : 'Use DD/MM/YYYY'); onChange(k, {}); } else if (!el.value) { setPath(obj, k, undefined); onChange(k, {}); } }
    else if (t === 'month') { let s = el.value.replace(/[^\d]/g, '').slice(0, 6); if (s.length > 2) s = s.slice(0, 2) + '/' + s.slice(2); el.value = s; const m = /^(\d{2})\/(\d{4})$/.exec(s); if (m && +m[1] >= 1 && +m[1] <= 12) { setPath(obj, k, `${m[2]}-${m[1]}`); onChange(k, {}); } else if (!s) { setPath(obj, k, undefined); onChange(k, {}); } }
  });
  root.addEventListener('change', e => {
    const el = e.target; const obj = getObj();
    if (el.dataset.unit) { const k = el.dataset.unit; const inp = root.querySelector(`[data-k="${k}"][data-t="lab"]`); setLab(obj, k, inp.dataset.lab, inp.value, el.value); onChange(k, { structural: true }); return; }
    if (el.dataset.native) { const k = el.dataset.native; setPath(obj, k, el.value || undefined); onChange(k, { structural: true }); return; }
    const k = el.dataset.k; if (!k) return;
    const t = el.dataset.t;
    if (t === 'select') { setPath(obj, k, el.value || undefined); onChange(k, { structural: true }); }
    else if (t === 'check') { setPath(obj, k, el.checked || undefined); onChange(k, { structural: true }); }
    else if (t === 'multi') { const cur = new Set(getPath(obj, k) || []); el.checked ? cur.add(el.value) : cur.delete(el.value); setPath(obj, k, cur.size ? [...cur] : undefined); onChange(k, { structural: true }); }
    else if (t === 'date' && el.value && !dmyToISO(el.value)) { onChange(k, { structural: false, badDate: true }); }
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const obj = getObj();
    if (b.dataset.t === 'seg') { const k = b.dataset.k; const cur = getPath(obj, k); setPath(obj, k, cur === b.dataset.v ? undefined : b.dataset.v); onChange(k, { structural: true }); }
    else if (b.dataset.nd) { const k = b.dataset.nd; obj.notDone = obj.notDone || {}; if (obj.notDone[k] === b.dataset.v) delete obj.notDone[k]; else { obj.notDone[k] = b.dataset.v; } onChange(k, { structural: true }); }
    else if (b.dataset.cal) { const n = root.querySelector(`[data-native="${b.dataset.cal}"]`); try { n.showPicker(); } catch { n.click(); } }
  });
}
function setLab(obj, k, lab, value, unit) {
  const def = LAB_UNITS[lab];
  const v = String(value ?? '').trim().replace(',', '.');
  const u = unit || def.std;
  if (v === '') { setPath(obj, k, undefined); obj.raw = obj.raw || {}; if (u !== def.std) obj.raw[k] = { v: null, u }; else delete obj.raw[k]; return; }
  setPath(obj, k, toStdUnit(lab, v, u));
  obj.raw = obj.raw || {};
  if (u !== def.std) obj.raw[k] = { v: num(v), u }; else delete obj.raw[k];
}
// Refresh computed values without re-rendering inputs (keeps focus while typing).
export function refreshComputed(root, fields, obj) {
  for (const f of fields) if (f.type === 'computed') {
    const el = root.querySelector(`[data-computed="${f.k}"]`); if (!el) continue;
    const c = f.calc(obj); el.innerHTML = c && f.badge ? `<span class="pheno ${esc(c)}">${esc(c)}</span>` : esc(c ?? '');
  }
}
export function issueMap(list) { const m = {}; for (const i of list) if (!m[i.path] || i.level === 'error') m[i.path] = i; return m; }
export { CHECK };
