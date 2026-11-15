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
      // 1. Trekkers table
      activeDb.run(`
        CREATE TABLE IF NOT EXISTS trekkers (
          trekker_id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `, (err) => {
        if (err) return reject(err);
      });

      // 2. Tents table
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

      // 3. Rentals table (The Join table between trekkers and tents)
      activeDb.run(`
        CREATE TABLE IF NOT EXISTS rentals (
          rental_id INTEGER PRIMARY KEY AUTOINCREMENT,
          trekker_id INTEGER NOT NULL,
          tent_id INTEGER NOT NULL,
          rental_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          return_date DATETIME,
          status TEXT DEFAULT 'active',
          notes TEXT,
          FOREIGN KEY (trekker_id) REFERENCES trekkers(trekker_id) ON DELETE CASCADE,
          FOREIGN KEY (tent_id) REFERENCES tents(tent_id) ON DELETE CASCADE
        );
      `, (err) => {
        if (err) return reject(err);
      });

      // 4. Audit table for tracking tent lifecycle modifications
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
