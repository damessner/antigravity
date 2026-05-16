const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { authenticateToken } = require('../server');
const { generateSecurePassword } = require('../utils/passwordGenerator');

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
    const usersRes = await req.pool.query('SELECT id, username, full_name, role, requires_password_change, created_at FROM users ORDER BY full_name');
    res.json(usersRes.rows);
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { username, full_name, role } = req.body;
  if (!username || !full_name || !role) {
    return res.status(400).json({ error: 'Username, full name, and role are required' });
  }

  try {
    // Generate temporary password
    const tempPassword = generateSecurePassword('Pass');
    const password_hash = await bcrypt.hash(tempPassword, 10);

    const insertRes = await req.pool.query(`
      INSERT INTO users (username, full_name, role, password_hash, requires_password_change)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, username, full_name, role, requires_password_change, created_at
    `, [username, full_name, role, password_hash]);

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
router.post('/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
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
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  if (userId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Cannot delete your own active administrator account' });
  }

  try {
    await req.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /api/users/change-password (Any authenticated)
router.post('/change-password', authenticateToken, async (req, res) => {
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

  const validRoles = ['admin', 'teacher', 'pupil', 'lernwerkstatt'];
  if (!validRoles.includes(role)) {
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
