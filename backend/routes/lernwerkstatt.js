const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');

// GET /api/lernwerkstatt/snapshots
router.get('/snapshots', authenticateToken, async (req, res) => {
  const limit = Number(req.query.limit) || 3;

  try {
    const snapshotsRes = await req.pool.query(`
      SELECT id, lesson_number, snapshot_date, snapshot_time, pupil_ids, pupil_names, class_names, created_by
      FROM lernwerkstatt_snapshots
      ORDER BY snapshot_time DESC, id DESC
      LIMIT $1
    `, [limit]);

    res.json(snapshotsRes.rows);
  } catch (err) {
    console.error('Fetch snapshots error:', err);
    res.status(500).json({ error: 'Failed retrieving live attendance records' });
  }
});

// POST /api/lernwerkstatt/snapshot
router.post('/snapshot', authenticateToken, async (req, res) => {
  try {
    // Determine active lesson
    const actLessonRes = await req.pool.query('SELECT lesson_number FROM allocation_logs WHERE is_active = true LIMIT 1');
    const lessonNum = actLessonRes.rows.length > 0 ? (actLessonRes.rows[0].lesson_number || 1) : 1;

    // Find Lernwerkstatt room ID
    const lwRes = await req.pool.query("SELECT id FROM rooms WHERE name = 'Lernwerkstatt' LIMIT 1");
    if (lwRes.rows.length === 0) return res.status(404).json({ error: 'Lernwerkstatt configuration missing' });
    const lwRoomId = lwRes.rows[0].id;

    // Get current pupils inside
    const currentRes = await req.pool.query(`
      SELECT p.id, u.full_name, c.name as class_name
      FROM allocation_logs a
      JOIN pupils p ON a.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      WHERE a.is_active = true AND a.to_room_id = $1
      ORDER BY c.name, u.full_name
    `, [lwRoomId]);

    const rows = currentRes.rows;
    const pIds = rows.map(r => r.id);
    const pNames = rows.map(r => r.full_name);
    const cNames = rows.map(r => r.class_name || '');

    const insRes = await req.pool.query(`
      INSERT INTO lernwerkstatt_snapshots (lesson_number, pupil_ids, pupil_names, class_names, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [lessonNum, pIds, pNames, cNames, req.user.id]);

    res.json(insRes.rows[0]);
  } catch (err) {
    console.error('Create snapshot error:', err);
    res.status(500).json({ error: 'Manual snapshot acquisition failed' });
  }
});

// GET /api/lernwerkstatt/snapshot/:id/export
router.get('/snapshot/:id/export', authenticateToken, async (req, res) => {
  const snapshotId = Number(req.params.id);

  try {
    const snapRes = await req.pool.query('SELECT * FROM lernwerkstatt_snapshots WHERE id = $1', [snapshotId]);
    if (snapRes.rows.length === 0) return res.status(404).json({ error: 'Snapshot record not found' });

    const snap = snapRes.rows[0];
    const timestampStr = new Date(snap.snapshot_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date(snap.snapshot_date).toLocaleDateString('de-DE');

    let outputText = `LERNWERKSTATT ANWESENHEITSLISTE\n`;
    outputText += `Datum: ${dateStr} | Stunde: ${snap.lesson_number}. Stunde | Erfasst um: ${timestampStr} Uhr\n`;
    outputText += `====================================================================\n`;
    outputText += `Nr. | Schülername                     | Klasse | Uhrzeit\n`;
    outputText += `--------------------------------------------------------------------\n`;

    const names = snap.pupil_names || [];
    const classes = snap.class_names || [];

    for (let i = 0; i < names.length; i++) {
      const nr = String(i + 1).padStart(3, ' ');
      const name = String(names[i]).padEnd(31, ' ');
      const cls = String(classes[i] || '').padEnd(6, ' ');
      outputText += `${nr} | ${name} | ${cls} | ${timestampStr}\n`;
    }

    outputText += `====================================================================\n`;
    outputText += `Gesamtanzahl Schüler: ${names.length}\n`;

    const filename = `Lernwerkstatt_Snapshot_${dateStr}_${snap.lesson_number}Stunde.txt`;
    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'text/plain; charset=utf-8');
    res.send(outputText);
  } catch (err) {
    console.error('Export snapshot error:', err);
    res.status(500).json({ error: 'Generating plain print text block failed' });
  }
});

module.exports = router;
