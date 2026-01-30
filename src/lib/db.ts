import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure database directory exists
const dbDir = path.join(process.cwd(), 'database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'users.sqlite');
const db = new Database(dbPath);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    can_upload INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,
    can_access_private INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    password TEXT,
    created_by INTEGER,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Add columns if they don't exist (migration for existing databases)
try {
  db.exec(`ALTER TABLE users ADD COLUMN can_upload INTEGER DEFAULT 0`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN can_delete INTEGER DEFAULT 0`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN can_access_private INTEGER DEFAULT 0`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE shares ADD COLUMN created_by INTEGER`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`ALTER TABLE shares ADD COLUMN expires_at DATETIME`);
} catch (e) { /* Column exists */ }
try {
  db.exec(`CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
} catch (e) { /* Table exists */ }

// Helper functions for settings
export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export default db;
