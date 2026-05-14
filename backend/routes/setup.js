const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');

// GET /api/setup/status — returns whether initial setup is needed
router.get('/status', async (req, res) => {
  try {
    const result = await req.pool.query('SELECT COUNT(*) FROM rooms');
    const count = Number(result.rows[0].count);
    res.json({ needsSetup: count === 0 });
  } catch (err) {
    console.error('Setup status error:', err);
    res.status(500).json({ error: 'Setup status check failed' });
  }
});

// POST /api/setup/init-rooms — creates initial rooms (public during setup)
router.post('/init-rooms', async (req, res) => {
  const { rooms } = req.body;
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return res.status(400).json({ error: 'Raumliste fehlt oder ist leer' });
  }

  // Only allow this endpoint when setup is actually needed
  try {
    const countRes = await req.pool.query('SELECT COUNT(*) FROM rooms');
    if (Number(countRes.rows[0].count) > 0) {
      return res.status(409).json({ error: 'Räume wurden bereits initialisiert' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Datenbankfehler beim Setup-Check' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const roomName of rooms) {
      const clean = String(roomName).trim();
      if (!clean) continue;
      const r = await client.query(
        'INSERT INTO rooms (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id, name',
        [clean]
      );
      if (r.rows.length > 0) inserted.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.json({ success: true, rooms: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Init rooms error:', err);
    res.status(500).json({ error: 'Räume konnten nicht erstellt werden' });
  } finally {
    client.release();
  }
});

// --- Admin Raumverwaltung endpoints (authenticated) ---

// GET /api/setup/rooms — list all rooms
router.get('/rooms', authenticateToken, async (req, res) => {
  try {
    const result = await req.pool.query('SELECT id, name, capacity FROM rooms ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Räume konnten nicht geladen werden' });
  }
});

// POST /api/setup/rooms — create a room (admin only)
router.post('/rooms', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur Administratoren' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Raumname fehlt' });
  try {
    const r = await req.pool.query(
      'INSERT INTO rooms (name) VALUES ($1) RETURNING id, name, capacity',
      [name.trim()]
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Raumname existiert bereits' });
    res.status(500).json({ error: 'Raum konnte nicht erstellt werden' });
  }
});

// PUT /api/setup/rooms/:id — rename a room (admin only)
router.put('/rooms/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur Administratoren' });
  const roomId = Number(req.params.id);
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Raumname fehlt' });
  try {
    const r = await req.pool.query(
      'UPDATE rooms SET name = $1 WHERE id = $2 RETURNING id, name, capacity',
      [name.trim(), roomId]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Raum nicht gefunden' });
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Raumname existiert bereits' });
    res.status(500).json({ error: 'Raum konnte nicht umbenannt werden' });
  }
});

// DELETE /api/setup/rooms/:id — delete a room (admin only)
router.delete('/rooms/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nur Administratoren' });
  const roomId = Number(req.params.id);
  try {
    await req.pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Raum konnte nicht gelöscht werden' });
  }
});

module.exports = router;
