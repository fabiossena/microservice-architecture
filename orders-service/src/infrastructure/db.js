import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'orders.db'));

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS orders (
      id          TEXT PRIMARY KEY,
      user        TEXT NOT NULL,
      status      TEXT NOT NULL,
      total       REAL NOT NULL,
      items       TEXT NOT NULL,
      reason      TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_orders_user ON orders(user);

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id      TEXT PRIMARY KEY,
      event_type    TEXT NOT NULL,
      processed_at  TEXT NOT NULL
    );
  `);

  const insertOrderStmt = db.prepare(`
    INSERT INTO orders (id, user, status, total, items, reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getOrderStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
  const listOrdersStmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?');
  const transitionStmt = db.prepare(`
    UPDATE orders SET status = ?, reason = COALESCE(?, reason), updated_at = ?
    WHERE id = ? AND status = ?
  `);
  const forceStatusStmt = db.prepare(`
    UPDATE orders SET status = ?, reason = COALESCE(?, reason), updated_at = ?
    WHERE id = ?
  `);
  const markStmt = db.prepare(`
    INSERT OR IGNORE INTO processed_events (event_id, event_type, processed_at)
    VALUES (?, ?, ?)
  `);

  return {
    markProcessed(eventId, eventType) {
      const result = markStmt.run(eventId, eventType, new Date().toISOString());
      return result.changes === 0;
    },

    insert(order) {
      const now = new Date().toISOString();
      insertOrderStmt.run(
        order.id,
        order.user,
        order.status,
        order.total,
        JSON.stringify(order.items),
        order.reason || null,
        now,
        now
      );
      return this.get(order.id);
    },

    get(id) {
      return getOrderStmt.get(id);
    },

    list(limit = 100) {
      return listOrdersStmt.all(limit);
    },

    transition(id, fromStatus, toStatus, reason = null) {
      const result = transitionStmt.run(toStatus, reason, new Date().toISOString(), id, fromStatus);
      return result.changes > 0;
    },

    forceStatus(id, status, reason = null) {
      forceStatusStmt.run(status, reason, new Date().toISOString(), id);
      return this.get(id);
    },

    close() {
      db.close();
    }
  };
}
