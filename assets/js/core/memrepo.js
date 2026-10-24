// In-browser storage for demo mode. The demo data is regenerated from a fixed seed on every load,
// and only the changes people make are kept in localStorage, so the demo stays small and fast.
export function createMemRepo(seed, storageKey = 'jochf-demo-v1') {
  const tables = new Map();
  const auditLog = [];
  let delta = { put: {}, del: {}, audit: [] };
  try { const s = localStorage.getItem(storageKey); if (s) delta = JSON.parse(s); } catch { }

  const t = name => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name); };
  for (const [name, docs] of Object.entries(seed.tables)) for (const d of docs) t(name).set(d.id, d);
  for (const e of seed.audit || []) auditLog.push(e);
  for (const [key, doc] of Object.entries(delta.put)) { const [name, ...rest] = key.split('|'); t(name).set(rest.join('|'), doc); }
  for (const key of Object.keys(delta.del)) { const [name, ...rest] = key.split('|'); t(name).delete(rest.join('|')); }
  for (const e of delta.audit) auditLog.push(e);

  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify(delta)); }
      catch { delta.audit = delta.audit.slice(-500); try { localStorage.setItem(storageKey, JSON.stringify(delta)); } catch { } }
    }, 150);
  };
  const clone = x => (x == null ? x : JSON.parse(JSON.stringify(x)));

  return {
    async get(name, id) { return clone(t(name).get(id) || null); },
    async put(name, doc) {
      const c = clone(doc); t(name).set(doc.id, c);
      if (name !== 'sessions') { delta.put[name + '|' + doc.id] = c; delete delta.del[name + '|' + doc.id]; persist(); }
    },
    async del(name, id) {
      t(name).delete(id);
      if (name !== 'sessions') { delete delta.put[name + '|' + id]; delta.del[name + '|' + id] = 1; persist(); }
    },
    async list(name, f) {
      const out = [];
      for (const d of t(name).values()) {
        if (f?.centerId && d.centerId !== f.centerId) continue;
        if (f?.patientId && d.patientId !== f.patientId) continue;
        out.push(d);
      }
      return clone(out);
    },
    async audit(e) { const x = { seq: auditLog.length + 1, ...e }; auditLog.push(x); delta.audit.push(x); persist(); },
    async auditList(f = {}) {
      let r = auditLog;
      if (f.patientId) r = r.filter(e => e.patientId === f.patientId);
      if (f.userId) r = r.filter(e => e.userId === f.userId);
      if (f.centerId) r = r.filter(e => e.centerId === f.centerId);
      if (f.action) r = r.filter(e => e.action === f.action);
      return clone(r.slice(-(f.limit || 300)).reverse());
    },
    reset() { localStorage.removeItem(storageKey); },
  };
}
