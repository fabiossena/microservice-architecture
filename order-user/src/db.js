import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'order-user.db'));

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS messages (
      id             TEXT PRIMARY KEY,
      direction      TEXT NOT NULL,
      event_type     TEXT NOT NULL,
      source         TEXT,
      user           TEXT,
      message        TEXT NOT NULL,
      payload        TEXT NOT NULL,
      occurred_at    TEXT NOT NULL,
      recorded_at    TEXT NOT NULL,
      correlation_id TEXT
    );

    CREATE INDEX IF NOT EXISTS ix_messages_user ON messages(user, occurred_at);
    CREATE INDEX IF NOT EXISTS ix_messages_direction ON messages(direction);
  `);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, direction, event_type, source, user, message, payload, occurred_at, recorded_at, correlation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const userHistoryStmt = db.prepare(`
    SELECT * FROM messages
    WHERE (direction = 'out' AND user = ?)
       OR (direction = 'in' AND (user = ? OR user = '*'))
    ORDER BY occurred_at DESC
    LIMIT ?
  `);
  const allStmt = db.prepare('SELECT * FROM messages ORDER BY occurred_at DESC LIMIT ?');

  function hydrate(row) {
    return {
      id: row.id,
      direction: row.direction,
      eventType: row.event_type,
      source: row.source,
      user: row.user,
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
        message.eventType,
        message.source || null,
        message.user || null,
        message.message,
        JSON.stringify(message.payload || {}),
        message.occurredAt,
        new Date().toISOString(),
        message.correlationId || null
      );
      return result.changes > 0;
    },

    historyForUser(user, limit = 100) {
      return userHistoryStmt.all(user, user, limit).map(hydrate);
    },

    listAll(limit = 200) {
      return allStmt.all(limit).map(hydrate);
    },

    close() {
      db.close();
    }
  };
}
