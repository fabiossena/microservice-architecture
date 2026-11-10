import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CATALOG, availability } from '../domain/catalog.js';

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'catalog.db'));

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS catalog (
      sku    TEXT PRIMARY KEY,
      name   TEXT NOT NULL,
      price  REAL NOT NULL,
      stock  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservations (
      order_id    TEXT PRIMARY KEY,
      user        TEXT NOT NULL,
      items       TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id      TEXT PRIMARY KEY,
      event_type    TEXT NOT NULL,
      processed_at  TEXT NOT NULL
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS total FROM catalog').get();
  if (count.total === 0) {
    const insert = db.prepare('INSERT INTO catalog (sku, name, price, stock) VALUES (?, ?, ?, ?)');
    for (const item of DEFAULT_CATALOG) insert.run(item.sku, item.name, item.price, item.stock);
  }

  const listStmt = db.prepare('SELECT * FROM catalog ORDER BY name');
  const getStmt = db.prepare('SELECT * FROM catalog WHERE sku = ?');
  const restockStmt = db.prepare('UPDATE catalog SET stock = stock + ? WHERE sku = ?');
  const getReservationStmt = db.prepare('SELECT * FROM reservations WHERE order_id = ?');
  const insertReservationStmt = db.prepare(
    'INSERT INTO reservations (order_id, user, items, created_at) VALUES (?, ?, ?, ?)'
  );
  const deleteReservationStmt = db.prepare('DELETE FROM reservations WHERE order_id = ?');
  const markStmt = db.prepare(
    'INSERT OR IGNORE INTO processed_events (event_id, event_type, processed_at) VALUES (?, ?, ?)'
  );

  function stockMap() {
    return Object.fromEntries(listStmt.all().map((row) => [row.sku, row.stock]));
  }

  return {
    markProcessed(eventId, eventType) {
      const result = markStmt.run(eventId, eventType, new Date().toISOString());
      return result.changes === 0;
    },

    list() {
      return listStmt.all();
    },

    get(sku) {
      return getStmt.get(sku);
    },

    getReservation(orderId) {
      return getReservationStmt.get(orderId);
    },

    reserve(orderId, user, items) {
      const check = availability(items, stockMap());
      if (!check.ok) return { ok: false, missing: check.missing };

      const decrement = db.prepare('UPDATE catalog SET stock = stock - ? WHERE sku = ?');
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const item of items) decrement.run(item.quantity, item.sku);
        insertReservationStmt.run(orderId, user, JSON.stringify(items), new Date().toISOString());
        db.exec('COMMIT');
        return { ok: true };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    release(orderId) {
      const reservation = getReservationStmt.get(orderId);
      if (!reservation) return null;

      const increment = db.prepare('UPDATE catalog SET stock = stock + ? WHERE sku = ?');
      const items = JSON.parse(reservation.items);
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const item of items) increment.run(item.quantity, item.sku);
        deleteReservationStmt.run(orderId);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return items;
    },

    restock(sku, quantity) {
      const item = getStmt.get(sku);
      if (!item) return null;
      restockStmt.run(quantity, sku);
      return getStmt.get(sku);
    },

    close() {
      db.close();
    }
  };
}
