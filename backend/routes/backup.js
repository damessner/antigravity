const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');
const fs = require('fs');
const path = require('path');

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrative access required' });
  }
  next();
};

const getDateString = () => {
  const now = new Date();
  const d = now.toISOString().split('T')[0];
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${d}_${h}-${m}`;
};

// GET /api/backup/full (Admin only)
router.get('/full', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tables = ['users', 'classes', 'pupils', 'rooms', 'subjects', 'assessment_categories', 'grades', 'pupil_subject_tags', 'disciplinary_notes', 'allocation_logs'];
    const backupData = {};
    for (const t of tables) {
      const q = await req.pool.query(`SELECT * FROM ${t} ORDER BY id`);
      backupData[t] = q.rows;
    }

    const filename = `backup_full_${getDateString()}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    console.error('Full backup export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/backup/users (Admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const uRes = await req.pool.query('SELECT * FROM users ORDER BY id');
    const filename = `backup_users_${getDateString()}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(uRes.rows, null, 2));
  } catch (err) {
    console.error('Users backup export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/backup/gradebook/class/:class_id (Admin only)
router.get('/gradebook/class/:class_id', authenticateToken, requireAdmin, async (req, res) => {
  const classId = Number(req.params.class_id);
  try {
    const sRes = await req.pool.query('SELECT * FROM subjects WHERE class_id = $1 ORDER BY id', [classId]);
    const subjects = sRes.rows;
    const subIds = subjects.map(s => s.id);

    let categories = [];
    let grades = [];
    if (subIds.length > 0) {
      const cRes = await req.pool.query('SELECT * FROM assessment_categories WHERE subject_id = ANY($1::int[]) ORDER BY id', [subIds]);
      categories = cRes.rows;
      const catIds = categories.map(c => c.id);
      if (catIds.length > 0) {
        const gRes = await req.pool.query('SELECT * FROM grades WHERE category_id = ANY($1::int[]) ORDER BY id', [catIds]);
        grades = gRes.rows;
      }
    }

    const bundle = { subjects, categories, grades };
    const filename = `backup_class_${classId}_gradebooks_${getDateString()}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(bundle, null, 2));
  } catch (err) {
    console.error('Class gradebook export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Allowed column names per table to prevent SQL injection via user-supplied backup data
const ALLOWED_COLUMNS = {
  users: ['id', 'username', 'full_name', 'role', 'password_hash', 'requires_password_change', 'created_at'],
  classes: ['id', 'name'],
  pupils: ['id', 'user_id', 'class_id'],
  rooms: ['id', 'name', 'capacity'],
  subjects: ['id', 'name', 'abbreviation', 'class_id', 'teacher_id', 'second_teacher_id', 'projection_visible'],
  assessment_categories: ['id', 'subject_id', 'name', 'weight_percentage', 'scale_type', 'is_self_directed'],
  grades: ['id', 'category_id', 'pupil_id', 'assessment_name', 'grade_value', 'is_visible', 'date', 'student_planned_date'],
  pupil_subject_tags: ['id', 'pupil_id', 'subject_id', 'tier_tag'],
  disciplinary_notes: ['id', 'pupil_id', 'teacher_id', 'note_text', 'sentiment', 'is_visible_to_pupil', 'auto_source', 'created_at'],
  allocation_logs: ['id', 'pupil_id', 'teacher_id', 'from_room_id', 'to_room_id', 'lesson_number', 'comment', 'arrived_status', 'is_active', 'timer_minutes', 'timer_started_at', 'created_at']
};

// Shared helper: restores all tables from a validated backup data object within an existing transaction
const restoreAllTables = async (client, data) => {
  const insertTable = async (tableName, rows) => {
    if (!rows || rows.length === 0) return;
    const allowed = ALLOWED_COLUMNS[tableName] || [];
    // Only keep columns that are in the allowlist to prevent SQL injection
    const cols = Object.keys(rows[0]).filter(c => allowed.includes(c));
    if (cols.length === 0) return;
    for (const row of rows) {
      const vals = cols.map(c => row[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
    }
    // Reset sequence
    await client.query(`SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE(MAX(id), 1)) FROM ${tableName}`);
  };

  await client.query(`
    TRUNCATE TABLE allocation_logs, disciplinary_notes, grades, pupil_subject_tags,
                   assessment_categories, subjects, pupils, classes, users RESTART IDENTITY CASCADE
  `);

  await insertTable('users', data.users);
  await insertTable('classes', data.classes);
  await insertTable('pupils', data.pupils);
  if (data.rooms && data.rooms.length > 0) {
    await client.query('TRUNCATE TABLE rooms RESTART IDENTITY CASCADE');
    await insertTable('rooms', data.rooms);
  }
  await insertTable('subjects', data.subjects);
  await insertTable('assessment_categories', data.assessment_categories);
  await insertTable('grades', data.grades);
  await insertTable('pupil_subject_tags', data.pupil_subject_tags);
  await insertTable('disciplinary_notes', data.disciplinary_notes);
  await insertTable('allocation_logs', data.allocation_logs);
};

// POST /api/backup/full (Admin only)
router.post('/full', authenticateToken, requireAdmin, async (req, res) => {
  const { confirm, data } = req.body;
  if (confirm !== 'RESTORE') {
    return res.status(400).json({ error: "Confirmation parameter required: confirm='RESTORE'" });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid backup structure payload' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');
    await restoreAllTables(client, data);
    await client.query('COMMIT');
    req.io.emit('lesson_reset', { resetToRoomId: 1 });
    res.json({ success: true, restored: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Full restore error:', err);
    res.status(500).json({ error: 'System state reconstruction failed: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/backup/restore (Admin only) - Alias for /full restore
router.post('/restore', authenticateToken, requireAdmin, async (req, res) => {
  const { confirm, data } = req.body;
  if (confirm !== 'RESTORE') {
    return res.status(400).json({ error: "Confirmation parameter required: confirm='RESTORE'" });
  }
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid backup structure payload' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');
    await restoreAllTables(client, data);
    await client.query('COMMIT');
    req.io.emit('lesson_reset', { resetToRoomId: 1 });
    res.json({ success: true, restored: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Restore endpoint error:', err);
    res.status(500).json({ error: 'System state reconstruction failed: ' + err.message });
  } finally {
    client.release();
  }
});

// GET /api/backup/gradebooks (Admin only)
router.get('/gradebooks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const s = await req.pool.query('SELECT * FROM subjects ORDER BY id');
    const c = await req.pool.query('SELECT * FROM assessment_categories ORDER BY id');
    const g = await req.pool.query('SELECT * FROM grades ORDER BY id');
    const t = await req.pool.query('SELECT * FROM pupil_subject_tags ORDER BY id');

    const data = { subjects: s.rows, categories: c.rows, grades: g.rows, tags: t.rows };
    const filename = `backup_gradebooks_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Gradebooks output failed' });
  }
});

// GET /api/backup/notes (Admin only)
router.get('/notes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const n = await req.pool.query('SELECT * FROM disciplinary_notes ORDER BY created_at DESC');
    const filename = `backup_notes_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(n.rows, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Notes extract failed' });
  }
});

// GET /api/backup/gradebook/:subject_id
router.get('/gradebook/:subject_id', authenticateToken, async (req, res) => {
  const subjectId = Number(req.params.subject_id);

  try {
    const sRes = await req.pool.query('SELECT * FROM subjects WHERE id = $1', [subjectId]);
    if (sRes.rows.length === 0) return res.status(404).json({ error: 'Subject not found' });
    const subject = sRes.rows[0];

    // Verify view permissions
    if (req.user.role !== 'admin' && Number(subject.teacher_id) !== Number(req.user.id) && Number(subject.second_teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized output action' });
    }

    const cRes = await req.pool.query('SELECT * FROM assessment_categories WHERE subject_id = $1', [subjectId]);
    const cIds = cRes.rows.map(c => c.id);

    let grades = [];
    if (cIds.length > 0) {
      const gRes = await req.pool.query('SELECT * FROM grades WHERE category_id = ANY($1::int[])', [cIds]);
      grades = gRes.rows;
    }

    const tRes = await req.pool.query('SELECT * FROM pupil_subject_tags WHERE subject_id = $1', [subjectId]);

    // Fetch class name
    const clRes = await req.pool.query('SELECT name FROM classes WHERE id = $1', [subject.class_id]);
    const className = clRes.rows[0]?.name || 'Klasse';
    const abbr = subject.abbreviation || 'FACH';

    const output = {
      subject,
      categories: cRes.rows,
      grades,
      pupil_tags: tRes.rows
    };

    const filename = `gradebook_${abbr}_${className}_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(output, null, 2));
  } catch (err) {
    console.error('Subject gradebook export error:', err);
    res.status(500).json({ error: 'Subject export processing failed' });
  }
});

// GET /api/backup/my-gradebooks
router.get('/my-gradebooks', authenticateToken, async (req, res) => {
  try {
    const sRes = await req.pool.query('SELECT * FROM subjects WHERE teacher_id = $1 ORDER BY id', [req.user.id]);
    const subjects = sRes.rows;
    const subIds = subjects.map(s => s.id);

    let categories = [];
    let grades = [];
    let pupil_tags = [];

    if (subIds.length > 0) {
      const cRes = await req.pool.query('SELECT * FROM assessment_categories WHERE subject_id = ANY($1::int[])', [subIds]);
      categories = cRes.rows;
      const cIds = categories.map(c => c.id);

      if (cIds.length > 0) {
        const gRes = await req.pool.query('SELECT * FROM grades WHERE category_id = ANY($1::int[])', [cIds]);
        grades = gRes.rows;
      }

      const tRes = await req.pool.query('SELECT * FROM pupil_subject_tags WHERE subject_id = ANY($1::int[])', [subIds]);
      pupil_tags = tRes.rows;
    }

    const bundle = {
      subjects,
      categories,
      grades,
      pupil_tags
    };

    // User lookup to get clean username string
    const uRes = await req.pool.query('SELECT username FROM users WHERE id = $1', [req.user.id]);
    const username = uRes.rows[0]?.username || 'lehrer';

    const filename = `my_gradebooks_${username}_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(bundle, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed compiling user bundle archives' });
  }
});

// POST /api/backup/gradebook
router.post('/gradebook', authenticateToken, async (req, res) => {
  const { subject, categories, grades, pupil_tags } = req.body;
  if (!subject || !subject.name || !subject.class_id) {
    return res.status(400).json({ error: 'Invalid gradebook backup schema format' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if subject exists with matching name and class_id
    const sRes = await client.query('SELECT id, teacher_id FROM subjects WHERE name = $1 AND class_id = $2', [subject.name, subject.class_id]);

    let targetSubjectId;
    if (sRes.rows.length > 0) {
      targetSubjectId = sRes.rows[0].id;
      // Assert write rights
      if (req.user.role !== 'admin' && Number(sRes.rows[0].teacher_id) !== Number(req.user.id)) {
        throw new Error('You cannot overwrite a curricular matrix owned by another educator');
      }
      // Update properties
      await client.query('UPDATE subjects SET abbreviation = $1 WHERE id = $2', [subject.abbreviation || subject.name.substring(0, 2).toUpperCase(), targetSubjectId]);
    } else {
      // Create fresh
      const newSub = await client.query(`
        INSERT INTO subjects (name, abbreviation, class_id, teacher_id, projection_visible)
        VALUES ($1, $2, $3, $4, true) RETURNING id
      `, [subject.name, subject.abbreviation || subject.name.substring(0, 2).toUpperCase(), subject.class_id, req.user.id]);
      targetSubjectId = newSub.rows[0].id;
    }

    // 2. Synchronize categories
    const categoryIdMapping = {}; // old category.id -> new DB category.id
    if (Array.isArray(categories)) {
      // Clean target categories
      await client.query('DELETE FROM assessment_categories WHERE subject_id = $1', [targetSubjectId]);

      for (const cat of categories) {
        const insCat = await client.query(`
          INSERT INTO assessment_categories (subject_id, name, weight_percentage, scale_type)
          VALUES ($1, $2, $3, $4) RETURNING id
        `, [targetSubjectId, cat.name, cat.weight_percentage, cat.scale_type || 'numeric_1_5']);
        categoryIdMapping[cat.id] = insCat.rows[0].id;
      }
    }

    // 3. Import evaluation grades mapping
    if (Array.isArray(grades) && Object.keys(categoryIdMapping).length > 0) {
      for (const g of grades) {
        const mappedCatId = categoryIdMapping[g.category_id];
        if (mappedCatId) {
          await client.query(`
            INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, is_visible, date)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [mappedCatId, g.pupil_id, g.assessment_name, g.grade_value, g.is_visible ?? true, g.date || new Date()]);
        }
      }
    }

    // 4. Synchronize mastery rank tags
    if (Array.isArray(pupil_tags)) {
      await client.query('DELETE FROM pupil_subject_tags WHERE subject_id = $1', [targetSubjectId]);
      for (const t of pupil_tags) {
        await client.query(`
          INSERT INTO pupil_subject_tags (pupil_id, subject_id, tier_tag)
          VALUES ($1, $2, $3)
          ON CONFLICT (pupil_id, subject_id) DO UPDATE SET tier_tag = $3
        `, [t.pupil_id, targetSubjectId, t.tier_tag]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, subject_id: targetSubjectId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import gradebook error:', err);
    res.status(500).json({ error: err.message || 'Restoring single subject parameters failed' });
  } finally {
    client.release();
  }
});

module.exports = router;

// Helper to resolve the backups directory
const getBackupDir = () => {
  if (fs.existsSync('/opt/school-management/backups')) return '/opt/school-management/backups';
  if (fs.existsSync('/backups')) return '/backups';
  return path.join(__dirname, '../../backups');
};

// GET /api/backup/list (Admin only)
router.get('/list', authenticateToken, requireAdmin, (req, res) => {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('auto_backup_') && f.endsWith('.json'));

    const result = files.map(f => {
      const fpath = path.join(backupDir, f);
      const stat = fs.statSync(fpath);
      return {
        filename: f,
        size: stat.size,
        created_at: stat.mtime.toISOString()
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json(result);
  } catch (err) {
    console.error('Backup list error:', err);
    res.status(500).json({ error: 'Backup-Verzeichnis konnte nicht gelesen werden' });
  }
});

// POST /api/backup/restore-server-file (Admin only)
router.post('/restore-server-file', authenticateToken, requireAdmin, async (req, res) => {
  const { filename, confirm } = req.body;
  if (confirm !== 'RESTORE') {
    return res.status(400).json({ error: "Bestätigung 'RESTORE' erforderlich" });
  }
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Dateiname fehlt' });
  }
  // Safety: allow only filenames matching expected pattern (no path traversal)
  if (!/^auto_backup_[\w\-]+\.json$/.test(filename)) {
    return res.status(400).json({ error: 'Ungültiger Dateiname' });
  }

  const backupDir = getBackupDir();
  const fpath = path.join(backupDir, filename);

  if (!fs.existsSync(fpath)) {
    return res.status(404).json({ error: 'Backup-Datei nicht gefunden' });
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  } catch (parseErr) {
    return res.status(400).json({ error: 'Backup-Datei ist ungültig oder beschädigt' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');
    await restoreAllTables(client, data);
    await client.query('COMMIT');
    req.io.emit('lesson_reset', { resetToRoomId: 1 });
    res.json({ success: true, restored: true, filename });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Server-file restore error:', err);
    res.status(500).json({ error: 'Wiederherstellung fehlgeschlagen: ' + err.message });
  } finally {
    client.release();
  }
});
