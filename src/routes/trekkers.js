const express = require('express');
const { getDb, runAsync, getAsync, allAsync } = require('../db');

const router = express.Router();

/**
 * GET /trekkers
 * Fetches all registered trekkers.
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const trekkers = await allAsync(db, 'SELECT * FROM trekkers ORDER BY trekker_id ASC');
    return res.status(200).json(trekkers);
  } catch (err) {
    console.error('Error fetching trekkers:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /trekkers/:id
 * Fetches single trekker by ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const trekkerId = parseInt(req.params.id, 10);
    if (isNaN(trekkerId)) {
      return res.status(400).json({ error: 'Invalid trekker ID' });
    }

    const db = getDb();
    const trekker = await getAsync(db, 'SELECT * FROM trekkers WHERE trekker_id = ?', [trekkerId]);
    if (!trekker) {
      return res.status(404).json({ error: 'Trekker not found' });
    }

    return res.status(200).json(trekker);
  } catch (err) {
    console.error('Error fetching trekker by ID:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /trekkers
 * Registers a new trekker.
 */
router.post('/', async (req, res) => {
  const { name, email, phone } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const cleanName = name.trim();
  const cleanEmail = (email && typeof email === 'string') ? email.trim() : null;
  const cleanPhone = (phone && typeof phone === 'string') ? phone.trim() : null;

  const db = getDb();

  try {
    const result = await runAsync(
      db,
      'INSERT INTO trekkers (name, email, phone) VALUES (?, ?, ?)',
      [cleanName, cleanEmail, cleanPhone]
    );

    const createdTrekker = await getAsync(
      db,
      'SELECT * FROM trekkers WHERE trekker_id = ?',
      [result.lastID]
    );
    return res.status(201).json(createdTrekker);
  } catch (err) {
    console.error('Error creating trekker:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /trekkers/:id
 * Deletes a trekker by ID.
 */
router.delete('/:id', async (req, res) => {
  const trekkerId = parseInt(req.params.id, 10);
  if (isNaN(trekkerId)) {
    return res.status(400).json({ error: 'Invalid trekker ID' });
  }

  const db = getDb();

  try {
    const existing = await getAsync(db, 'SELECT * FROM trekkers WHERE trekker_id = ?', [trekkerId]);
    if (!existing) {
      return res.status(404).json({ error: 'Trekker not found' });
    }

    await runAsync(db, 'DELETE FROM trekkers WHERE trekker_id = ?', [trekkerId]);
    return res.status(200).json({
      message: 'Trekker deleted successfully',
      trekker_id: trekkerId
    });
  } catch (err) {
    console.error('Error deleting trekker:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
