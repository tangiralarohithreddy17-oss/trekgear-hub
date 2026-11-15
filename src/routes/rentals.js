const express = require('express');
const { getDb, runAsync, getAsync, allAsync } = require('../db');

const router = express.Router();

/**
 * GET /rentals
 * THE JOIN ENDPOINT: Fetches rentals with the trekker name and the tent name.
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const query = `
      SELECT 
        rentals.rental_id,
        rentals.trekker_id,
        trekkers.name AS trekker_name,
        trekkers.email AS trekker_email,
        rentals.tent_id,
        tents.tent_name,
        tents.size AS tent_size,
        rentals.rental_date,
        rentals.return_date,
        rentals.status,
        rentals.notes
      FROM rentals
      JOIN trekkers ON rentals.trekker_id = trekkers.trekker_id
      JOIN tents ON rentals.tent_id = tents.tent_id
      ORDER BY rentals.rental_id ASC;
    `;
    const rows = await allAsync(db, query);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('Error fetching rentals join data:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /rentals/:id
 * Fetches a single rental record with trekker and tent details.
 */
router.get('/:id', async (req, res) => {
  try {
    const rentalId = parseInt(req.params.id, 10);
    if (isNaN(rentalId)) {
      return res.status(400).json({ error: 'Invalid rental ID' });
    }

    const db = getDb();
    const query = `
      SELECT 
        rentals.rental_id,
        rentals.trekker_id,
        trekkers.name AS trekker_name,
        trekkers.email AS trekker_email,
        rentals.tent_id,
        tents.tent_name,
        tents.size AS tent_size,
        rentals.rental_date,
        rentals.return_date,
        rentals.status,
        rentals.notes
      FROM rentals
      JOIN trekkers ON rentals.trekker_id = trekkers.trekker_id
      JOIN tents ON rentals.tent_id = tents.tent_id
      WHERE rentals.rental_id = ?;
    `;
    const rental = await getAsync(db, query, [rentalId]);
    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    return res.status(200).json(rental);
  } catch (err) {
    console.error('Error fetching rental by ID:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /rentals
 * Issues a tent rental to a trekker.
 */
router.post('/', async (req, res) => {
  const { trekker_id, tent_id, notes } = req.body;

  if (!trekker_id || isNaN(parseInt(trekker_id, 10))) {
    return res.status(400).json({ error: 'Valid trekker_id is required' });
  }
  if (!tent_id || isNaN(parseInt(tent_id, 10))) {
    return res.status(400).json({ error: 'Valid tent_id is required' });
  }

  const tid = parseInt(trekker_id, 10);
  const kid = parseInt(tent_id, 10);

  const db = getDb();

  try {
    // Verify trekker exists
    const trekker = await getAsync(db, 'SELECT * FROM trekkers WHERE trekker_id = ?', [tid]);
    if (!trekker) {
      return res.status(404).json({ error: 'Trekker not found' });
    }

    // Verify tent exists
    const tent = await getAsync(db, 'SELECT * FROM tents WHERE tent_id = ?', [kid]);
    if (!tent) {
      return res.status(404).json({ error: 'Tent not found' });
    }

    await runAsync(db, 'BEGIN TRANSACTION');

    const result = await runAsync(
      db,
      'INSERT INTO rentals (trekker_id, tent_id, notes, status) VALUES (?, ?, ?, ?)',
      [tid, kid, notes ? notes.trim() : null, 'active']
    );

    // Update tent status to rented
    await runAsync(db, "UPDATE tents SET status = 'rented' WHERE tent_id = ?", [kid]);

    await runAsync(db, 'COMMIT');

    const createdRental = await getAsync(
      db,
      `SELECT 
        rentals.rental_id,
        rentals.trekker_id,
        trekkers.name AS trekker_name,
        trekkers.email AS trekker_email,
        rentals.tent_id,
        tents.tent_name,
        tents.size AS tent_size,
        rentals.rental_date,
        rentals.return_date,
        rentals.status,
        rentals.notes
      FROM rentals
      JOIN trekkers ON rentals.trekker_id = trekkers.trekker_id
      JOIN tents ON rentals.tent_id = tents.tent_id
      WHERE rentals.rental_id = ?;`,
      [result.lastID]
    );

    return res.status(201).json(createdRental);
  } catch (err) {
    try {
      await runAsync(db, 'ROLLBACK');
    } catch (e) {}
    console.error('Error creating rental:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /rentals/:id/return
 * Marks a rental as returned and updates tent status back to available.
 */
router.put('/:id/return', async (req, res) => {
  const rentalId = parseInt(req.params.id, 10);
  if (isNaN(rentalId)) {
    return res.status(400).json({ error: 'Invalid rental ID' });
  }

  const db = getDb();

  try {
    const rental = await getAsync(db, 'SELECT * FROM rentals WHERE rental_id = ?', [rentalId]);
    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    await runAsync(db, 'BEGIN TRANSACTION');

    await runAsync(
      db,
      "UPDATE rentals SET status = 'returned', return_date = CURRENT_TIMESTAMP WHERE rental_id = ?",
      [rentalId]
    );

    // Update tent status back to available
    await runAsync(db, "UPDATE tents SET status = 'available' WHERE tent_id = ?", [rental.tent_id]);

    await runAsync(db, 'COMMIT');

    const updatedRental = await getAsync(
      db,
      `SELECT 
        rentals.rental_id,
        rentals.trekker_id,
        trekkers.name AS trekker_name,
        trekkers.email AS trekker_email,
        rentals.tent_id,
        tents.tent_name,
        tents.size AS tent_size,
        rentals.rental_date,
        rentals.return_date,
        rentals.status,
        rentals.notes
      FROM rentals
      JOIN trekkers ON rentals.trekker_id = trekkers.trekker_id
      JOIN tents ON rentals.tent_id = tents.tent_id
      WHERE rentals.rental_id = ?;`,
      [rentalId]
    );

    return res.status(200).json(updatedRental);
  } catch (err) {
    try {
      await runAsync(db, 'ROLLBACK');
    } catch (e) {}
    console.error('Error returning rental:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
