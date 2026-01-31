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

// Reduce blocking: WAL mode allows concurrent reads; NORMAL sync is faster than FULL
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

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
  
  CREATE TABLE IF NOT EXISTS folder_sizes (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
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

// Folder size cache (relative path under files root -> total recursive size in bytes)
export function getCachedFolderSize(relativePath: string): number | null {
  const row = db.prepare('SELECT size FROM folder_sizes WHERE path = ?').get(relativePath) as { size: number } | undefined;
  return row != null ? row.size : null;
}

export function setCachedFolderSize(relativePath: string, size: number): void {
  const updatedAt = Math.floor(Date.now() / 1000);
  db.prepare('INSERT OR REPLACE INTO folder_sizes (path, size, updated_at) VALUES (?, ?, ?)').run(relativePath, size, updatedAt);
}

/** Invalidate folder size cache for this path and all ancestor directories. Call when files change under a path. */
export function invalidateFolderSizeCache(relativePath: string): void {
  const parts = relativePath.replace(/^\/+/, '').replace(/\\/g, '/').split('/').filter(Boolean);
  const stmt = db.prepare('DELETE FROM folder_sizes WHERE path = ?');
  for (let i = 1; i <= parts.length; i++) {
    stmt.run(parts.slice(0, i).join('/'));
  }
}

export default db;
