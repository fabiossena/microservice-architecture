import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'order-manage.db'));

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS messages (
      id             TEXT PRIMARY KEY,
      direction      TEXT NOT NULL,
      category       TEXT NOT NULL,
      event_type     TEXT NOT NULL,
      source         TEXT,
      user           TEXT,
      actor          TEXT,
      message        TEXT NOT NULL,
      payload        TEXT NOT NULL,
      occurred_at    TEXT NOT NULL,
      recorded_at    TEXT NOT NULL,
      correlation_id TEXT
    );

    CREATE INDEX IF NOT EXISTS ix_manage_category ON messages(category, occurred_at);
    CREATE INDEX IF NOT EXISTS ix_manage_user ON messages(user);
  `);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, direction, category, event_type, source, user, actor, message, payload, occurred_at, recorded_at, correlation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listStmt = db.prepare('SELECT * FROM messages ORDER BY occurred_at DESC LIMIT ?');
  const categoryStmt = db.prepare(
    'SELECT * FROM messages WHERE category = ? ORDER BY occurred_at DESC LIMIT ?'
  );
  const userStmt = db.prepare(`
    SELECT * FROM messages
    WHERE user = ? OR (user = '*' AND direction = 'in')
    ORDER BY occurred_at DESC
    LIMIT ?
  `);

  function hydrate(row) {
    return {
      id: row.id,
      direction: row.direction,
      category: row.category,
      eventType: row.event_type,
      source: row.source,
      user: row.user,
      actor: row.actor,
      message: row.message,
      payload: JSON.parse(row.payload || '{}'),
      occurredAt: row.occurred_at,
      recordedAt: row.recorded_at,
      correlationId: row.correlation_id
    };
  }

  return {
    insert(message) {
      const result = insertStmt.run(
        message.id,
        message.direction,
        message.category,
        message.eventType,
        message.source || null,
        message.user || null,
        message.actor || null,
        message.message,
        JSON.stringify(message.payload || {}),
        message.occurredAt,
        new Date().toISOString(),
        message.correlationId || null
      );
      return result.changes > 0;
    },

    list(limit = 300) {
      return listStmt.all(limit).map(hydrate);
    },

    listByCategory(category, limit = 200) {
      return categoryStmt.all(category, limit).map(hydrate);
    },

    listForUser(user, limit = 100) {
      return userStmt.all(user, limit).map(hydrate);
    },

    close() {
      db.close();
    }
  };
}
