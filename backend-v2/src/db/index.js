const Database = require('better-sqlite3');
const path     = require('path');

// Store DB in /app/data (persisted volume on Railway)
const DB_PATH  = process.env.DB_PATH || path.join('/app/data', 'scheduler.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  -- Server config: API key hash, setup status
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Credentials per platform (encrypted blobs — never stored in plaintext)
  CREATE TABLE IF NOT EXISTS credentials (
    platform       TEXT PRIMARY KEY,   -- 'claude' | 'chatgpt' | 'gemini' | 'perplexity'
    auth_type      TEXT NOT NULL,      -- 'cookie' | 'password'
    encrypted_data TEXT NOT NULL,      -- AES-256-GCM encrypted JSON
    created_at     INTEGER DEFAULT (unixepoch()),
    updated_at     INTEGER DEFAULT (unixepoch())
  );

  -- Scheduled prompts
  CREATE TABLE IF NOT EXISTS schedules (
    id               TEXT PRIMARY KEY,
    platform         TEXT NOT NULL,
    chat_url         TEXT NOT NULL,
    prompt           TEXT NOT NULL,
    scheduled_time   INTEGER NOT NULL,  -- Unix timestamp (ms)
    status           TEXT DEFAULT 'pending',
    response_text    TEXT,              -- First 1000 chars of AI response
    error_message    TEXT,
    created_at       INTEGER DEFAULT (unixepoch()),
    updated_at       INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
  CREATE INDEX IF NOT EXISTS idx_schedules_time   ON schedules(scheduled_time);
`);

module.exports = db;
