const express = require('express');
const { getDb, runAsync, getAsync, allAsync } = require('../db');

const router = express.Router();

/**
 * GET /tents
 * Fetch all tents.
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const tents = await allAsync(db, 'SELECT * FROM tents ORDER BY tent_id ASC');
    return res.status(200).json(tents);
  } catch (err) {
    console.error('Error fetching tents:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /tents/:id
 * Fetch a single tent by ID.
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
 * Create a new tent and automatically log an ADD audit record.
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
    // Database transaction to ensure tent insertion and audit logging are atomic
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
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    console.error('Error creating tent and audit log:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * PUT /tents/:id
 * Update an existing tent and automatically log an UPDATE audit record.
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
    // Check if the tent exists before attempting update
    // "Do not log updates or deletions of nonexistent tents."
    const existingTent = await getAsync(db, 'SELECT * FROM tents WHERE tent_id = ?', [tentId]);
    if (!existingTent) {
      return res.status(404).json({ error: 'Tent not found' });
    }

    const updatedStatus = (status && typeof status === 'string' && status.trim())
      ? status.trim()
      : existingTent.status;

    // Transaction for atomic update and audit logging
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
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    console.error('Error updating tent and audit log:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /tents/:id
 * Delete an existing tent and automatically log a DELETE audit record.
 */
router.delete('/:id', async (req, res) => {
  const tentId = parseInt(req.params.id, 10);
  if (isNaN(tentId)) {
    return res.status(400).json({ error: 'Invalid tent ID' });
  }

  const db = getDb();

  try {
    // Check if tent exists
    // "Do not log updates or deletions of nonexistent tents."
    const existingTent = await getAsync(db, 'SELECT * FROM tents WHERE tent_id = ?', [tentId]);
    if (!existingTent) {
      return res.status(404).json({ error: 'Tent not found' });
    }

    // Transaction for atomic deletion and audit logging
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
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    console.error('Error deleting tent and audit log:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
