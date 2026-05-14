const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');

// GET /api/classes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const classesRes = await req.pool.query('SELECT id, name FROM classes ORDER BY name');
    res.json(classesRes.rows);
  } catch (err) {
    console.error('Fetch classes error:', err);
    res.status(500).json({ error: 'Failed to fetch class configurations' });
  }
});

// POST /api/classes (Admin only)
router.post('/', authenticateToken, async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Valid class name required' });
  }

  try {
    const insertRes = await req.pool.query('INSERT INTO classes (name) VALUES ($1) RETURNING id, name', [name.trim()]);
    res.json(insertRes.rows[0]);
  } catch (err) {
    console.error('Create class error:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Class name already exists' });
    }
    res.status(500).json({ error: 'Failed to create class' });
  }
});

module.exports = router;
