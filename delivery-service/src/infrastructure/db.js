import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'deliveries.db'));

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS deliveries (
      id          TEXT PRIMARY KEY,
      order_id    TEXT NOT NULL UNIQUE,
      user        TEXT NOT NULL,
      status      TEXT NOT NULL,
      courier     TEXT NOT NULL,
      eta_minutes INTEGER NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id      TEXT PRIMARY KEY,
      event_type    TEXT NOT NULL,
      processed_at  TEXT NOT NULL
    );
  `);

  const createStmt = db.prepare(`
    INSERT OR IGNORE INTO deliveries (id, order_id, user, status, courier, eta_minutes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const byOrderStmt = db.prepare('SELECT * FROM deliveries WHERE order_id = ?');
  const listStmt = db.prepare('SELECT * FROM deliveries ORDER BY created_at DESC LIMIT ?');
  const updateStmt = db.prepare(`
    UPDATE deliveries SET status = ?, updated_at = ?
    WHERE order_id = ? AND status = ?
  `);
  const markStmt = db.prepare(
    'INSERT OR IGNORE INTO processed_events (event_id, event_type, processed_at) VALUES (?, ?, ?)'
  );

  return {
    markProcessed(eventId, eventType) {
      const result = markStmt.run(eventId, eventType, new Date().toISOString());
      return result.changes === 0;
    },

    createIfAbsent({ orderId, user, courier, etaMinutes }) {
      const now = new Date().toISOString();
      createStmt.run(
        randomUUID(),
        orderId,
        user,
        'ASSIGNED',
        courier,
        etaMinutes,
        now,
        now
      );
      return byOrderStmt.get(orderId);
    },

    byOrder(orderId) {
      return byOrderStmt.get(orderId);
    },

    list(limit = 100) {
      return listStmt.all(limit);
    },

    transition(orderId, fromStatus, toStatus) {
      const result = updateStmt.run(toStatus, new Date().toISOString(), orderId, fromStatus);
      return result.changes > 0;
    },

    close() {
      db.close();
    }
  };
}
