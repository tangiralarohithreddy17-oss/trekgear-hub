const path = require('path');
const fs = require('fs');
const { getDb, initDb, runAsync, closeDb } = require('../src/db');

async function seed() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'trekgear.db');

  console.log(`Initializing database at: ${dbPath}`);
  const db = getDb(dbPath);
  await initDb(db);

  // Clear tables for a fresh state
  await runAsync(db, 'DELETE FROM audit');
  await runAsync(db, 'DELETE FROM tents');
  await runAsync(db, 'DELETE FROM sqlite_sequence WHERE name IN ("audit", "tents")');

  console.log('Database tables cleared and auto-increments reset.');
  console.log('Note: Seed script does NOT insert audit entries (per project requirement).');

  await closeDb();
  console.log('Ready for running server and tests.');
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}

module.exports = { seed };
