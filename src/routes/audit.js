const express = require('express');
const { getDb, allAsync } = require('../db');

const router = express.Router();

/**
 * GET /audit
 * Retrieves the latest 10 audit records, newest first (ORDER BY audit_id DESC).
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const rows = await allAsync(
      db,
      'SELECT audit_id, action, id, time FROM audit ORDER BY audit_id DESC LIMIT 10'
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error('Error fetching audit logs:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;

