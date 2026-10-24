-- Jo-CHF database (Cloudflare D1 / SQLite). Safe to run again: everything uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS docs (
  tbl        TEXT NOT NULL,      -- patients, visits, events, titrations, queries, users, centers, ident, sessions, settings, resets
  id         TEXT NOT NULL,
  center_id  TEXT,
  patient_id TEXT,
  data       TEXT NOT NULL,      -- JSON document
  updated_at INTEGER,
  PRIMARY KEY (tbl, id)
);
CREATE INDEX IF NOT EXISTS docs_center  ON docs (tbl, center_id);
CREATE INDEX IF NOT EXISTS docs_patient ON docs (tbl, patient_id);

-- Audit trail: every create, edit and delete. Append-only.
CREATE TABLE IF NOT EXISTS audit (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  user_id    TEXT,
  user_name  TEXT,
  action     TEXT,
  tbl        TEXT,
  record_id  TEXT,
  patient_id TEXT,
  center_id  TEXT,
  field      TEXT,
  old        TEXT,
  new        TEXT,
  reason     TEXT
);
CREATE INDEX IF NOT EXISTS audit_patient ON audit (patient_id);
CREATE INDEX IF NOT EXISTS audit_user    ON audit (user_id);

-- Nobody can edit or delete audit entries, not even the application.
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
BEGIN SELECT RAISE(ABORT, 'The audit log cannot be edited.'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
BEGIN SELECT RAISE(ABORT, 'The audit log cannot be deleted.'); END;
