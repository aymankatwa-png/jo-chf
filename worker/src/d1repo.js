// Cloudflare D1 storage. Clinical records are JSON documents; the audit log is its own
// append-only table that the database itself refuses to update or delete (see schema.sql).
export function createD1Repo(db) {
  const parse = rows => rows.map(r => JSON.parse(r.data));
  return {
    async get(tbl, id) {
      const r = await db.prepare('SELECT data FROM docs WHERE tbl = ? AND id = ?').bind(tbl, id).first();
      return r ? JSON.parse(r.data) : null;
    },
    async put(tbl, doc) {
      await db.prepare(
        'INSERT INTO docs (tbl, id, center_id, patient_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(tbl, id) DO UPDATE SET center_id = excluded.center_id, patient_id = excluded.patient_id, data = excluded.data, updated_at = excluded.updated_at'
      ).bind(tbl, doc.id, doc.centerId || null, doc.patientId || null, JSON.stringify(doc), Date.now()).run();
    },
    async del(tbl, id) { await db.prepare('DELETE FROM docs WHERE tbl = ? AND id = ?').bind(tbl, id).run(); },
    async list(tbl, f) {
      let sql = 'SELECT data FROM docs WHERE tbl = ?'; const b = [tbl];
      if (f?.centerId) { sql += ' AND center_id = ?'; b.push(f.centerId); }
      if (f?.patientId) { sql += ' AND patient_id = ?'; b.push(f.patientId); }
      const { results } = await db.prepare(sql).bind(...b).all();
      return parse(results);
    },
    async audit(e) {
      const s = v => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));
      await db.prepare('INSERT INTO audit (ts, user_id, user_name, action, tbl, record_id, patient_id, center_id, field, old, new, reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(e.ts, e.userId || null, e.userName || null, e.action || null, e.table || null, e.recordId || null, e.patientId || null, e.centerId || null, e.field || null, s(e.old), s(e.new), e.reason || null).run();
    },
    async auditList(f = {}) {
      let sql = 'SELECT * FROM audit WHERE 1 = 1'; const b = [];
      if (f.patientId) { sql += ' AND patient_id = ?'; b.push(f.patientId); }
      if (f.userId) { sql += ' AND user_id = ?'; b.push(f.userId); }
      if (f.centerId) { sql += ' AND center_id = ?'; b.push(f.centerId); }
      if (f.action) { sql += ' AND action = ?'; b.push(f.action); }
      sql += ' ORDER BY seq DESC LIMIT ?'; b.push(f.limit || 300);
      const { results } = await db.prepare(sql).bind(...b).all();
      return results.map(r => ({ seq: r.seq, ts: r.ts, userId: r.user_id, userName: r.user_name, action: r.action, table: r.tbl, recordId: r.record_id, patientId: r.patient_id, centerId: r.center_id, field: r.field, old: r.old, new: r.new, reason: r.reason }));
    },
  };
}
