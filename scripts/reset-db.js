const path = require('path');
const { getDb, initDb, runAsync, closeDb } = require('../src/db');

async function seed() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'trekgear.db');

  console.log(`Initializing TrekGear Hub database at: ${dbPath}`);
  const db = getDb(dbPath);
  await initDb(db);

  // Clear tables for fresh state
  await runAsync(db, 'DELETE FROM rentals');
  await runAsync(db, 'DELETE FROM audit');
  await runAsync(db, 'DELETE FROM tents');
  await runAsync(db, 'DELETE FROM trekkers');
  await runAsync(db, "DELETE FROM sqlite_sequence WHERE name IN ('rentals', 'audit', 'tents', 'trekkers')");

  console.log('Database tables cleared and auto-increments reset.');

  // Seed sample trekkers
  console.log('Seeding sample trekkers...');
  await runAsync(
    db,
    'INSERT INTO trekkers (name, email, phone) VALUES (?, ?, ?)',
    ['John Doe', 'john@example.com', '+1-555-0101']
  );
  await runAsync(
    db,
    'INSERT INTO trekkers (name, email, phone) VALUES (?, ?, ?)',
    ['Jane Smith', 'jane@example.com', '+1-555-0102']
  );
  await runAsync(
    db,
    'INSERT INTO trekkers (name, email, phone) VALUES (?, ?, ?)',
    ['Alex Rivera', 'alex@example.com', '+1-555-0103']
  );

  // Seed sample tents
  console.log('Seeding sample tents...');
  await runAsync(
    db,
    'INSERT INTO tents (tent_name, size, status) VALUES (?, ?, ?)',
    ['Mountain Explorer', '4-person', 'rented']
  );
  await runAsync(
    db,
    'INSERT INTO tents (tent_name, size, status) VALUES (?, ?, ?)',
    ['Alpine Peak 2', '2-person', 'available']
  );
  await runAsync(
    db,
    'INSERT INTO tents (tent_name, size, status) VALUES (?, ?, ?)',
    ['Mountain Dome 4', '4-person', 'rented']
  );
  await runAsync(
    db,
    'INSERT INTO tents (tent_name, size, status) VALUES (?, ?, ?)',
    ['Glacier Ridge 6', '6-person', 'available']
  );

  // Seed sample rentals for the Join endpoint
  console.log('Seeding sample rentals...');
  await runAsync(
    db,
    "INSERT INTO rentals (trekker_id, tent_id, status, notes) VALUES (?, ?, 'active', ?)",
    [1, 1, 'Himalayan mountain expedition']
  );
  await runAsync(
    db,
    "INSERT INTO rentals (trekker_id, tent_id, status, notes) VALUES (?, ?, 'active', ?)",
    [2, 3, 'Weekend alpine valley trek']
  );

  console.log('Note: Seed script does NOT insert initial audit entries (preserving audit test clean state).');

  await closeDb();
  console.log('TrekGear Hub database seeded successfully! Ready for server and Postman testing.');
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}

module.exports = { seed };
