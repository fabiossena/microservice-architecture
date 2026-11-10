import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'payments.db'));

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS payments (
      id          TEXT PRIMARY KEY,
      order_id    TEXT NOT NULL UNIQUE,
      user        TEXT NOT NULL,
      amount      REAL NOT NULL,
      status      TEXT NOT NULL,
      method      TEXT NOT NULL,
      reason      TEXT,
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
    INSERT OR IGNORE INTO payments (id, order_id, user, amount, status, method, reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const byOrderStmt = db.prepare('SELECT * FROM payments WHERE order_id = ?');
  const listStmt = db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT ?');
  const updateStmt = db.prepare(
    'UPDATE payments SET status = ?, reason = ?, updated_at = ? WHERE order_id = ?'
  );
  const markStmt = db.prepare(
    'INSERT OR IGNORE INTO processed_events (event_id, event_type, processed_at) VALUES (?, ?, ?)'
  );

  return {
    markProcessed(eventId, eventType) {
      const result = markStmt.run(eventId, eventType, new Date().toISOString());
      return result.changes === 0;
    },

    createIfAbsent({ orderId, user, amount }) {
      const now = new Date().toISOString();
      createStmt.run(
        randomUUID(),
        orderId,
        user,
        amount,
        'PENDING',
        'card-simulated',
        null,
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

    updateStatus(orderId, status, reason = null) {
      const result = updateStmt.run(status, reason, new Date().toISOString(), orderId);
      return result.changes > 0;
    },

    close() {
      db.close();
    }
  };
}
