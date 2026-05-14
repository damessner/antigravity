const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../server');

// POST /api/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const userRes = await req.pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userRes.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokenPayload = {
      id: user.id,
      role: user.role,
      requires_password_change: user.requires_password_change
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'SuperSecureAustrianSchoolJwtSecretKey998877!', { expiresIn: '8h' });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        requires_password_change: user.requires_password_change
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/state
router.get('/state', authenticateToken, async (req, res) => {
  try {
    // 1. Rooms
    const roomsRes = await req.pool.query('SELECT id, name FROM rooms ORDER BY id');

    // 2. Pupils joining active allocation logs
    const pupilsRes = await req.pool.query(`
      SELECT 
        p.id, 
        p.class_id, 
        u.full_name as name, 
        c.name as class_name,
        COALESCE(a.to_room_id, 1) as room_id,
        COALESCE(a.arrived_status, 'pending') as arrived_status,
        a.timer_minutes,
        a.timer_started_at
      FROM pupils p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      LEFT JOIN allocation_logs a ON p.id = a.pupil_id AND a.is_active = true
      ORDER BY c.name, u.full_name
    `);

    // 3. Subjects with fallback abbreviation
    const subjectsRes = await req.pool.query(`
      SELECT 
        id, 
        name, 
        class_id, 
        teacher_id, 
        second_teacher_id, 
        projection_visible,
        COALESCE(abbreviation, UPPER(SUBSTRING(name, 1, 2))) as abbreviation
      FROM subjects
      ORDER BY id
    `);

    // 4. Subject Tags
    const tagsRes = await req.pool.query('SELECT id, pupil_id, subject_id, tier_tag FROM pupil_subject_tags');

    res.json({
      rooms: roomsRes.rows,
      pupils: pupilsRes.rows,
      subjects: subjectsRes.rows,
      subject_tags: tagsRes.rows
    });
  } catch (err) {
    console.error('State retrieval error:', err);
    res.status(500).json({ error: 'Failed to fetch application state' });
  }
});

// PUT /api/allocations/:pupil_id/timer
router.put('/allocations/:pupil_id/timer', authenticateToken, async (req, res) => {
  const pupilId = Number(req.params.pupil_id);
  const { timer_minutes } = req.body;
  const minutes = timer_minutes !== null && timer_minutes !== undefined ? Number(timer_minutes) : null;

  try {
    // Find active allocation row
    const allocRes = await req.pool.query(`
      SELECT id FROM allocation_logs WHERE pupil_id = $1 AND is_active = true LIMIT 1
    `, [pupilId]);

    if (allocRes.rows.length === 0) {
      return res.status(404).json({ error: 'No active allocation found for pupil' });
    }

    const logId = allocRes.rows[0].id;
    const updateRes = await req.pool.query(`
      UPDATE allocation_logs
      SET timer_minutes = $1, timer_started_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE NULL END
      WHERE id = $2
      RETURNING timer_minutes, timer_started_at
    `, [minutes, logId]);

    const updated = updateRes.rows[0];

    // Emit broadcast
    req.io.emit('pupil_timer_set', {
      pupilId,
      timer_minutes: updated.timer_minutes,
      timer_started_at: updated.timer_started_at
    });

    res.json({ success: true, updated });
  } catch (err) {
    console.error('Timer update error:', err);
    res.status(500).json({ error: 'Failed to update timer' });
  }
});

// POST /api/reset-lesson
router.post('/reset-lesson', authenticateToken, async (req, res) => {
  try {
    // Determine active lesson number from last insert or default to 1
    const lastLessonRes = await req.pool.query('SELECT lesson_number FROM allocation_logs WHERE is_active = true LIMIT 1');
    const lessonNum = lastLessonRes.rows.length > 0 ? (lastLessonRes.rows[0].lesson_number || 1) : 1;
    const nextLessonNum = lessonNum < 10 ? lessonNum + 1 : 1;

    // Snapshot Lernwerkstatt before reset
    const lwRoomRes = await req.pool.query("SELECT id FROM rooms WHERE name = 'Lernwerkstatt' LIMIT 1");
    if (lwRoomRes.rows.length > 0) {
      const lwRoomId = lwRoomRes.rows[0].id;
      const snapshotRes = await req.pool.query(`
        SELECT p.id, u.full_name, c.name as class_name
        FROM allocation_logs a
        JOIN pupils p ON a.pupil_id = p.id
        JOIN users u ON p.user_id = u.id
        LEFT JOIN classes c ON p.class_id = c.id
        WHERE a.is_active = true AND a.to_room_id = $1
      `, [lwRoomId]);

      if (snapshotRes.rows.length > 0) {
        const pIds = snapshotRes.rows.map(r => r.id);
        const pNames = snapshotRes.rows.map(r => r.full_name);
        const cNames = snapshotRes.rows.map(r => r.class_name || '');
        await req.pool.query(`
          INSERT INTO lernwerkstatt_snapshots (lesson_number, pupil_ids, pupil_names, class_names, created_by)
          VALUES ($1, $2, $3, $4, $5)
        `, [lessonNum, pIds, pNames, cNames, req.user.id]);
      }
    }

    // Deactivate all active allocations
    await req.pool.query('UPDATE allocation_logs SET is_active = false WHERE is_active = true');

    // Create active allocations targeting Klassenzimmer
    const kzRoomRes = await req.pool.query("SELECT id FROM rooms WHERE name = 'Klassenzimmer' LIMIT 1");
    const kzRoomId = kzRoomRes.rows.length > 0 ? kzRoomRes.rows[0].id : 1;

    await req.pool.query(`
      INSERT INTO allocation_logs (pupil_id, to_room_id, lesson_number, is_active, teacher_id)
      SELECT id, $1, $2, true, $3 FROM pupils
    `, [kzRoomId, nextLessonNum, req.user.id]);

    req.io.emit('lesson_reset', { resetToRoomId: kzRoomId });

    res.json({ success: true, resetToRoomId: kzRoomId, lessonNumber: nextLessonNum });
  } catch (err) {
    console.error('Lesson reset error:', err);
    res.status(500).json({ error: 'Failed to reset lesson boundaries' });
  }
});

module.exports = router;
