const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let dbInstance = null;

function getDb(dbPath = null) {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = dbPath || process.env.DATABASE_PATH || path.join(__dirname, '..', 'trekgear.db');
  dbInstance = new sqlite3.Database(resolvedPath, (err) => {
    if (err) {
      console.error('Failed to connect to SQLite database:', err.message);
    } else {
      console.log(`Connected to SQLite database at ${resolvedPath}`);
    }
  });

  return dbInstance;
}

function initDb(db = null) {
  const activeDb = db || getDb();

  return new Promise((resolve, reject) => {
    activeDb.serialize(() => {
      // 1. Tents table
      activeDb.run(`
        CREATE TABLE IF NOT EXISTS tents (
          tent_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tent_name TEXT NOT NULL,
          size TEXT NOT NULL,
          status TEXT DEFAULT 'available',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `, (err) => {
        if (err) return reject(err);
      });

      // 2. Audit table as specified in requirements
      activeDb.run(`
        CREATE TABLE IF NOT EXISTS audit (
          audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          id INTEGER NOT NULL,
          time DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `, (err) => {
        if (err) return reject(err);
        resolve(activeDb);
      });
    });
  });
}

function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function closeDb() {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve();
    dbInstance.close((err) => {
      if (err) return reject(err);
      dbInstance = null;
      resolve();
    });
  });
}

module.exports = {
  getDb,
  initDb,
  runAsync,
  getAsync,
  allAsync,
  closeDb
};
