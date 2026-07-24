const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = process.env.DB_PATH || path.join('/app/data', 'scheduler.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS credentials (
    platform TEXT PRIMARY KEY, auth_type TEXT NOT NULL, encrypted_data TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY, platform TEXT NOT NULL, chat_url TEXT NOT NULL, prompt TEXT NOT NULL,
    scheduled_time INTEGER NOT NULL, status TEXT DEFAULT 'pending',
    response_text TEXT, error_message TEXT, retry_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
  CREATE INDEX IF NOT EXISTS idx_schedules_time ON schedules(scheduled_time);
`);

// Migration: add retry_count to databases created before this column existed
// (your already-deployed server's database won't have it otherwise)
try {
  db.prepare('SELECT retry_count FROM schedules LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE schedules ADD COLUMN retry_count INTEGER DEFAULT 0');
}

module.exports = db;
