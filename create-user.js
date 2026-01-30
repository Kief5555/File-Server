const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const dbDir = path.join(process.cwd(), 'database');
const dbPath = path.join(dbDir, 'users.sqlite');

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables if they don't exist
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

async function createUser(username, password) {
    try {
        const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (existingUser) {
            console.error(`User '${username}' already exists.`);
            process.exit(1);
        }

        const saltRounds = 10;
        const hash = bcrypt.hashSync(password, saltRounds);

        // Create user as admin with full permissions (upload, delete, private access, admin)
        const stmt = db.prepare(`
            INSERT INTO users (username, password, can_upload, can_delete, can_access_private, is_admin) 
            VALUES (?, ?, 1, 1, 1, 1)
        `);
        stmt.run(username, hash);

        console.log(`User '${username}' created successfully as admin with full permissions.`);
        process.exit(0);
    } catch (error) {
        console.error('Error creating user:', error);
        process.exit(1);
    }
}

async function prompt(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function main() {
    const args = process.argv.slice(2);
    let username = args[0];
    let password = args[1];

    if (!username) {
        username = await prompt('Enter username: ');
    }

    if (!password) {
        password = await prompt('Enter password: ');
    }

    if (!username || !password) {
        console.error('Error: Username and password are required.');
        process.exit(1);
    }

    await createUser(username, password);
}

main();
