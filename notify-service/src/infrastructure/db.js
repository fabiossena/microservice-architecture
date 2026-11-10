import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'notifications.db'));

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS notifications (
      id            TEXT PRIMARY KEY,
      user          TEXT NOT NULL,
      source        TEXT NOT NULL,
      title         TEXT NOT NULL,
      message       TEXT NOT NULL,
      severity      TEXT NOT NULL,
      original_type TEXT NOT NULL,
      payload       TEXT NOT NULL,
      occurred_at   TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user);
  `);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO notifications
      (id, user, source, title, message, severity, original_type, payload, occurred_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listStmt = db.prepare('SELECT * FROM notifications ORDER BY occurred_at DESC LIMIT ?');

  return {
    insert(notification) {
      const result = insertStmt.run(
        notification.id,
        notification.user,
        notification.source,
        notification.title,
        notification.message,
        notification.severity,
        notification.originalType,
        JSON.stringify(notification.payload || {}),
        notification.occurredAt,
        new Date().toISOString()
      );
      return result.changes > 0;
    },

    list(limit = 100) {
      return listStmt.all(limit).map((row) => ({
        ...row,
        payload: JSON.parse(row.payload)
      }));
    },

    close() {
      db.close();
    }
  };
}
