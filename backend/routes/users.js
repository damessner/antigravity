const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { authenticateToken, setupLimiter } = require('../server');
const { generateSecurePassword } = require('../utils/passwordGenerator');

const normalizeUsername = (username) => {
  if (typeof username !== 'string') return '';
  return username.normalize('NFKC').trim().toLowerCase();
};

const normalizeFullName = (fullName) => {
  if (typeof fullName !== 'string') return '';
  return fullName.normalize('NFKC').trim().replace(/\s+/g, ' ');
};

const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/;
const VALID_ROLES = ['admin', 'teacher', 'pupil', 'lernwerkstatt'];

const getRetentionDays = async (pool) => {
  const r = await pool.query("SELECT value FROM system_settings WHERE key = 'data_retention_days' LIMIT 1");
  const n = Number(r.rows[0]?.value || 90);
  return Number.isFinite(n) && n > 0 ? n : 90;
};

const buildUserExportBundle = async (pool, userId) => {
  const userRes = await pool.query(
    'SELECT id, username, full_name, role, requires_password_change, created_at, is_active, deactivated_at, erasure_due_at FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rows.length === 0) return null;

  const user = userRes.rows[0];
  const exportData = {
    exported_at: new Date().toISOString(),
    user,
    pupil: null,
    allocation_logs: [],
    disciplinary_notes_as_teacher: [],
    disciplinary_notes_as_pupil: [],
    help_requests_as_teacher: [],
    help_requests_as_pupil: [],
    participation_logs_as_teacher: [],
    push_subscriptions: [],
    user_preferences: null,
  };

  const pupilRes = await pool.query('SELECT id, class_id FROM pupils WHERE user_id = $1', [userId]);
  if (pupilRes.rows.length > 0) {
    const pupil = pupilRes.rows[0];
    exportData.pupil = pupil;

    const [allocRes, notesPupilRes, helpPupilRes] = await Promise.all([
      pool.query('SELECT * FROM allocation_logs WHERE pupil_id = $1 ORDER BY id', [pupil.id]),
      pool.query('SELECT * FROM disciplinary_notes WHERE pupil_id = $1 ORDER BY id', [pupil.id]),
      pool.query('SELECT * FROM help_requests WHERE pupil_id = $1 ORDER BY id', [pupil.id]),
    ]);

    exportData.allocation_logs = allocRes.rows;
    exportData.disciplinary_notes_as_pupil = notesPupilRes.rows;
    exportData.help_requests_as_pupil = helpPupilRes.rows;
  }

  const [notesTeacherRes, helpTeacherRes, participationTeacherRes, pushRes, prefRes] = await Promise.all([
    pool.query('SELECT * FROM disciplinary_notes WHERE teacher_id = $1 ORDER BY id', [userId]),
    pool.query('SELECT * FROM help_requests WHERE claimed_by_teacher_id = $1 ORDER BY id', [userId]),
    pool.query('SELECT * FROM participation_logs WHERE teacher_id = $1 ORDER BY id', [userId]),
    pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY id', [userId]),
    pool.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId]),
  ]);

  exportData.disciplinary_notes_as_teacher = notesTeacherRes.rows;
  exportData.help_requests_as_teacher = helpTeacherRes.rows;
  exportData.participation_logs_as_teacher = participationTeacherRes.rows;
  exportData.push_subscriptions = pushRes.rows;
  exportData.user_preferences = prefRes.rows[0] || null;

  return exportData;
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
};

// GET /api/users (Admin only)
router.get('/', authenticateToken, async (req, res) => {
  // Allow teachers to read list for assignment purposes if needed, or enforce admin logic
  try {
    const includeInactive = String(req.query.include_inactive || 'false').toLowerCase() === 'true';
    const usersRes = await req.pool.query(`
      SELECT id, username, full_name, role, requires_password_change, created_at, is_active, deactivated_at, erasure_due_at
      FROM users
      WHERE ($1::boolean = true OR is_active = true)
      ORDER BY full_name
    `, [includeInactive]);
    res.json(usersRes.rows);
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users (Admin only)
router.post('/', setupLimiter, authenticateToken, requireAdmin, async (req, res) => {
  const { username, full_name, role } = req.body;
  const normalizedUsername = normalizeUsername(username);
  const normalizedFullName = normalizeFullName(full_name);

  if (!normalizedUsername || !normalizedFullName || !role) {
    return res.status(400).json({ error: 'Username, full name, and role are required' });
  }
  if (!USERNAME_PATTERN.test(normalizedUsername)) {
    return res.status(400).json({ error: 'Username must be 3-50 chars and contain only a-z, 0-9, ".", "_" or "-"' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const existsRes = await req.pool.query(
      'SELECT id FROM users WHERE lower(btrim(username)) = $1 LIMIT 1',
      [normalizedUsername]
    );
    if (existsRes.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Generate temporary password
    const tempPassword = generateSecurePassword('Pass');
    const password_hash = await bcrypt.hash(tempPassword, 10);

    const insertRes = await req.pool.query(`
      INSERT INTO users (username, full_name, role, password_hash, requires_password_change)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, username, full_name, role, requires_password_change, created_at
    `, [normalizedUsername, normalizedFullName, role, password_hash]);

    res.json({
      user: insertRes.rows[0],
      tempPassword
    });
  } catch (err) {
    console.error('Create user error:', err);
    if (err.code === '23505') { // unique violation
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create user account' });
  }
});

// POST /api/users/:id/reset-password (Admin only)
router.post('/:id/reset-password', setupLimiter, authenticateToken, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);

  try {
    const tempPassword = generateSecurePassword('Reset');
    const password_hash = await bcrypt.hash(tempPassword, 10);

    const updateRes = await req.pool.query(`
      UPDATE users 
      SET password_hash = $1, requires_password_change = true
      WHERE id = $2
      RETURNING id, username
    `, [password_hash, userId]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ tempPassword });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/users/:id (Admin only)
router.delete('/:id', setupLimiter, authenticateToken, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (userId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Cannot delete your own active administrator account' });
  }

  try {
    const retentionDays = await getRetentionDays(req.pool);
    const updateRes = await req.pool.query(`
      UPDATE users
      SET is_active = false,
          deactivated_at = COALESCE(deactivated_at, NOW()),
          erasure_due_at = COALESCE(erasure_due_at, NOW() + ($2 || ' days')::interval)
      WHERE id = $1
      RETURNING id, is_active, deactivated_at, erasure_due_at
    `, [userId, String(retentionDays)]);
    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await req.pool.query(`
      UPDATE allocation_logs
      SET is_active = false
      WHERE is_active = true
        AND pupil_id IN (SELECT id FROM pupils WHERE user_id = $1)
    `, [userId]);

    res.json({ success: true, soft_deleted: true, retention_days: retentionDays, user: updateRes.rows[0] });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/users/erasure/queue (Admin only)
router.get('/erasure/queue', setupLimiter, authenticateToken, requireAdmin, async (req, res) => {
  try {
    const queueRes = await req.pool.query(`
      SELECT id, username, full_name, role, deactivated_at, erasure_due_at
      FROM users
      WHERE is_active = false AND erasure_due_at IS NOT NULL
      ORDER BY erasure_due_at ASC
    `);
    res.json(queueRes.rows);
  } catch (err) {
    console.error('Fetch erasure queue error:', err);
    res.status(500).json({ error: 'Failed to fetch erasure queue' });
  }
});

// GET /api/users/:id/export (Admin only)
router.get('/:id/export', setupLimiter, authenticateToken, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  try {
    const bundle = await buildUserExportBundle(req.pool, userId);
    if (!bundle) return res.status(404).json({ error: 'User not found' });
    res.json(bundle);
  } catch (err) {
    console.error('User export error:', err);
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

// POST /api/users/:id/erase (Admin only)
router.post('/:id/erase', setupLimiter, authenticateToken, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { confirm, reason } = req.body || {};

  if (confirm !== 'ERASE') {
    return res.status(400).json({ error: "Confirmation parameter required: confirm='ERASE'" });
  }
  if (userId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Cannot erase your own active administrator account' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');
    const bundle = await buildUserExportBundle(client, userId);
    if (!bundle) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    await client.query(`
      INSERT INTO user_erasure_audit (user_id, deleted_by, reason, export_snapshot)
      VALUES ($1, $2, $3, $4::jsonb)
    `, [userId, req.user.id, reason || 'manual_admin_erasure', JSON.stringify(bundle)]);

    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');

    res.json({ success: true, erased: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('User erase error:', err);
    res.status(500).json({ error: 'Failed to erase user' });
  } finally {
    client.release();
  }
});

// POST /api/users/change-password (Any authenticated)
router.post('/change-password', setupLimiter, authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords required' });
  }

  try {
    const userRes = await req.pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const userRow = userRes.rows[0];
    const match = await bcrypt.compare(currentPassword, userRow.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await req.pool.query('UPDATE users SET password_hash = $1, requires_password_change = false WHERE id = $2', [newHash, req.user.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to process password update' });
  }
});

// PUT /api/users/:id/role (Admin only)
router.put('/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({ error: 'Rolle ist erforderlich' });
  }

  // Self-Lockout Protection
  if (userId === Number(req.user.id)) {
    return res.status(403).json({ error: 'Aus Sicherheitsgründen kann die eigene Administrator-Rolle nicht entzogen werden' });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Ungültige Rollenbezeichnung' });
  }

  try {
    const updateRes = await req.pool.query(`
      UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, role
    `, [role, userId]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Benutzerkonto nicht gefunden' });
    }

    res.json({ success: true, user: updateRes.rows[0] });
  } catch (err) {
    console.error('Role update error:', err);
    res.status(500).json({ error: 'Rollenänderung in der Datenbank fehlgeschlagen' });
  }
});

module.exports = router;
