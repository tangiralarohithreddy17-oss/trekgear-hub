const express = require('express');
const { getDb, runAsync, getAsync, allAsync } = require('../db');

const router = express.Router();

/**
 * GET /tents
 * Fetches all tents. Supports query filtering:
 *  - ?size=<size> (e.g. /tents?size=4-person)
 *  - ?search_q=<keyword> (e.g. /tents?search_q=Mountain)
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { size, search_q } = req.query;

    let sql = 'SELECT * FROM tents WHERE 1=1';
    const params = [];

    if (size && typeof size === 'string' && size.trim()) {
      sql += ' AND LOWER(size) = LOWER(?)';
      params.push(size.trim());
    }

    if (search_q && typeof search_q === 'string' && search_q.trim()) {
      sql += ' AND LOWER(tent_name) LIKE ?';
      params.push(`%${search_q.trim().toLowerCase()}%`);
    }

    sql += ' ORDER BY tent_id ASC';

    const tents = await allAsync(db, sql, params);
    return res.status(200).json(tents);
  } catch (err) {
    console.error('Error fetching tents:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /tents/:id
 * Fetches a single tent by ID.
 */
router.get('/:id', async (req, res) => {
  try {
    const tentId = parseInt(req.params.id, 10);
    if (isNaN(tentId)) {
      return res.status(400).json({ error: 'Invalid tent ID' });
    }

    const db = getDb();
    const tent = await getAsync(db, 'SELECT * FROM tents WHERE tent_id = ?', [tentId]);
    if (!tent) {
      return res.status(404).json({ error: 'Tent not found' });
    }

    return res.status(200).json(tent);
  } catch (err) {
    console.error('Error fetching tent:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /tents
 * Creates a new tent and automatically logs an ADD audit record.
 */
router.post('/', async (req, res) => {
  const { tent_name, size, status } = req.body;

  // Validation: Do not log failed validations
  if (!tent_name || typeof tent_name !== 'string' || !tent_name.trim()) {
    return res.status(400).json({ error: 'tent_name is required' });
  }
  if (!size || typeof size !== 'string' || !size.trim()) {
    return res.status(400).json({ error: 'size is required' });
  }

  const cleanName = tent_name.trim();
  const cleanSize = size.trim();
  const cleanStatus = (status && typeof status === 'string' && status.trim()) ? status.trim() : 'available';

  const db = getDb();

  try {
    await runAsync(db, 'BEGIN TRANSACTION');

    const insertResult = await runAsync(
      db,
      'INSERT INTO tents (tent_name, size, status) VALUES (?, ?, ?)',
      [cleanName, cleanSize, cleanStatus]
    );

    const newTentId = insertResult.lastID;

    // Automatic audit logging: action = 'ADD', id = newly created tent_id
    await runAsync(
      db,
      'INSERT INTO audit (action, id) VALUES (?, ?)',
      ['ADD', newTentId]
    );

    await runAsync(db, 'COMMIT');

    const createdTent = await getAsync(db, 'SELECT * FROM tents WHERE tent_id = ?', [newTentId]);
    return res.status(201).json(createdTent);
  } catch (err) {
    try {
      await runAsync(db, 'ROLLBACK');
    } catch (e) {}
    console.error('Error creating tent and audit log:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /tents/:id
 * Updates an existing tent and automatically logs an UPDATE audit record.
 */
router.put('/:id', async (req, res) => {
  const tentId = parseInt(req.params.id, 10);
  if (isNaN(tentId)) {
    return res.status(400).json({ error: 'Invalid tent ID' });
  }

  const { tent_name, size, status } = req.body;

  // Validation: Do not log failed validations
  if (!tent_name || typeof tent_name !== 'string' || !tent_name.trim()) {
    return res.status(400).json({ error: 'tent_name is required' });
  }
  if (!size || typeof size !== 'string' || !size.trim()) {
    return res.status(400).json({ error: 'size is required' });
  }

  const cleanName = tent_name.trim();
  const cleanSize = size.trim();

  const db = getDb();

  try {
    const existingTent = await getAsync(db, 'SELECT * FROM tents WHERE tent_id = ?', [tentId]);
    if (!existingTent) {
      return res.status(404).json({ error: 'Tent not found' });
    }

    const updatedStatus = (status && typeof status === 'string' && status.trim())
      ? status.trim()
      : existingTent.status;

    await runAsync(db, 'BEGIN TRANSACTION');

    await runAsync(
      db,
      'UPDATE tents SET tent_name = ?, size = ?, status = ? WHERE tent_id = ?',
      [cleanName, cleanSize, updatedStatus, tentId]
    );

    // Automatic audit logging: action = 'UPDATE', id = updated tent_id
    await runAsync(
      db,
      'INSERT INTO audit (action, id) VALUES (?, ?)',
      ['UPDATE', tentId]
    );

    await runAsync(db, 'COMMIT');

    const updatedTent = await getAsync(db, 'SELECT * FROM tents WHERE tent_id = ?', [tentId]);
    return res.status(200).json(updatedTent);
  } catch (err) {
    try {
      await runAsync(db, 'ROLLBACK');
    } catch (e) {}
    console.error('Error updating tent and audit log:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /tents/:id
 * Deletes an existing tent and automatically logs a DELETE audit record.
 */
router.delete('/:id', async (req, res) => {
  const tentId = parseInt(req.params.id, 10);
  if (isNaN(tentId)) {
    return res.status(400).json({ error: 'Invalid tent ID' });
  }

  const db = getDb();

  try {
    const existingTent = await getAsync(db, 'SELECT * FROM tents WHERE tent_id = ?', [tentId]);
    if (!existingTent) {
      return res.status(404).json({ error: 'Tent not found' });
    }

    await runAsync(db, 'BEGIN TRANSACTION');

    await runAsync(db, 'DELETE FROM tents WHERE tent_id = ?', [tentId]);

    // Automatic audit logging: action = 'DELETE', id = deleted tent_id
    await runAsync(
      db,
      'INSERT INTO audit (action, id) VALUES (?, ?)',
      ['DELETE', tentId]
    );

    await runAsync(db, 'COMMIT');

    return res.status(200).json({
      message: 'Tent deleted successfully',
      tent_id: tentId
    });
  } catch (err) {
    try {
      await runAsync(db, 'ROLLBACK');
    } catch (e) {}
    console.error('Error deleting tent and audit log:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;

