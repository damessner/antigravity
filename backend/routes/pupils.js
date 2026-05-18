const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authenticateToken, stateLimiter } = require('../server');

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
};

// GET /api/pupils/me — pupil's own profile, locked to the JWT identity
router.get('/me', stateLimiter, authenticateToken, async (req, res) => {
  if (req.user.role !== 'pupil') {
    return res.status(403).json({ error: 'Nur für Schülerkonten zugänglich' });
  }
  try {
    const result = await req.pool.query(`
      SELECT p.id, p.class_id, u.full_name as name, c.name as class_name, u.username
      FROM pupils p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      WHERE p.user_id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schülerprofil nicht gefunden' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Fetch own pupil profile error:', err);
    res.status(500).json({ error: 'Fehler beim Laden des eigenen Profils' });
  }
});

// GET /api/pupils
router.get('/', authenticateToken, async (req, res) => {
  try {
    const pupilsRes = await req.pool.query(`
      SELECT p.id, p.class_id, u.full_name as name, c.name as class_name, u.username
      FROM pupils p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      ORDER BY c.name, u.full_name
    `);
    res.json(pupilsRes.rows);
  } catch (err) {
    console.error('Fetch pupils error:', err);
    res.status(500).json({ error: 'Failed to fetch pupils' });
  }
});

// POST /api/pupils (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { full_name, class_id } = req.body;
  if (!full_name || !class_id) {
    return res.status(400).json({ error: 'Full name and class assignment required' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch class name
    const classRes = await client.query('SELECT name FROM classes WHERE id = $1', [class_id]);
    if (classRes.rows.length === 0) {
      throw new Error('Target class not found');
    }
    const className = classRes.rows[0].name;

    // Generate unique prefix and credentials
    const namePrefix = full_name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 5);
    const randomHex = Math.random().toString(16).substring(2, 6);
    const username = `pupil_${namePrefix}_${randomHex}`;
    const tempPassword = `Pupil_${Math.random().toString(36).substring(2, 8)}!`;
    const password_hash = await bcrypt.hash(tempPassword, 10);

    // 1. Insert into users
    const userRes = await client.query(`
      INSERT INTO users (username, full_name, role, password_hash, requires_password_change)
      VALUES ($1, $2, 'pupil', $3, true)
      RETURNING id
    `, [username, full_name, password_hash]);
    const userId = userRes.rows[0].id;

    // 2. Insert into pupils
    const pupilRes = await client.query(`
      INSERT INTO pupils (user_id, class_id)
      VALUES ($1, $2)
      RETURNING id
    `, [userId, class_id]);
    const pupilId = pupilRes.rows[0].id;

    // Determine current active lesson number
    const lastLessonRes = await client.query('SELECT lesson_number FROM allocation_logs WHERE is_active = true LIMIT 1');
    const lessonNum = lastLessonRes.rows.length > 0 ? (lastLessonRes.rows[0].lesson_number || 1) : 1;

    // Get Klassenzimmer ID
    const kzRes = await client.query("SELECT id FROM rooms WHERE name = 'Klassenzimmer' LIMIT 1");
    const kzRoomId = kzRes.rows.length > 0 ? kzRes.rows[0].id : 1;

    // 3. Insert initial allocation log
    await client.query(`
      INSERT INTO allocation_logs (pupil_id, to_room_id, lesson_number, is_active, arrived_status)
      VALUES ($1, $2, $3, true, 'pending')
    `, [pupilId, kzRoomId, lessonNum]);

    await client.query('COMMIT');

    const enrolledPupil = {
      id: pupilId,
      class_id: Number(class_id),
      name: full_name,
      class_name: className,
      room_id: kzRoomId,
      arrived_status: 'pending'
    };

    // Emit broadcast
    req.io.emit('pupil_enrolled', enrolledPupil);

    res.json({
      pupil: enrolledPupil,
      username,
      tempPassword
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create pupil error:', err);
    res.status(500).json({ error: err.message || 'Failed to enroll pupil' });
  } finally {
    client.release();
  }
});

// DELETE /api/pupils/:id (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const pupilId = Number(req.params.id);

  try {
    // Due to ON DELETE CASCADE on user_id inside pupils table, let's delete the backing user account to clear all associated storage cleanly.
    // First find user_id
    const pRes = await req.pool.query('SELECT user_id FROM pupils WHERE id = $1', [pupilId]);
    if (pRes.rows.length > 0) {
      const userId = pRes.rows[0].user_id;
      await req.pool.query('DELETE FROM users WHERE id = $1', [userId]); // cascades to pupils, allocation_logs, grades, tags, notes
    } else {
      // Direct cleanup fallback
      await req.pool.query('DELETE FROM pupils WHERE id = $1', [pupilId]);
    }

    req.io.emit('pupil_unenrolled', { pupilId });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete pupil error:', err);
    res.status(500).json({ error: 'Failed to unenroll pupil' });
  }
});

module.exports = router;
