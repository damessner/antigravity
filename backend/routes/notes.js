const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');

// GET /api/notes?pupil_id=<id>
router.get('/', authenticateToken, async (req, res) => {
  const pupilId = Number(req.query.pupil_id);
  if (!pupilId) return res.status(400).json({ error: 'pupil_id parameter required' });

  try {
    let queryStr = `
      SELECT n.id, n.pupil_id, n.teacher_id, n.note_text, n.sentiment, 
             n.is_visible_to_pupil, n.auto_source, n.created_at,
             u.full_name as teacher_name
      FROM disciplinary_notes n
      LEFT JOIN users u ON n.teacher_id = u.id
      WHERE n.pupil_id = $1
    `;
    const params = [pupilId];

    if (req.user.role === 'pupil') {
      queryStr += ` AND n.is_visible_to_pupil = true`;
    }
    queryStr += ` ORDER BY n.created_at DESC`;

    const notesRes = await req.pool.query(queryStr, params);
    res.json(notesRes.rows);
  } catch (err) {
    console.error('Fetch notes error:', err);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// GET /api/notes/class/:class_id
router.get('/class/:class_id', authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  const classId = Number(req.params.class_id);

  try {
    // Return all notes for pupils belonging to this class
    const notesRes = await req.pool.query(`
      SELECT n.id, n.pupil_id, n.teacher_id, n.note_text, n.sentiment, 
             n.is_visible_to_pupil, n.auto_source, n.created_at,
             u.full_name as teacher_name
      FROM disciplinary_notes n
      JOIN pupils p ON n.pupil_id = p.id
      LEFT JOIN users u ON n.teacher_id = u.id
      WHERE p.class_id = $1
      ORDER BY n.created_at DESC
    `, [classId]);

    res.json(notesRes.rows);
  } catch (err) {
    console.error('Fetch class notes error:', err);
    res.status(500).json({ error: 'Failed to retrieve class logs' });
  }
});

// POST /api/notes
router.post('/', authenticateToken, async (req, res) => {
  const { pupil_id, note_text, sentiment, is_visible_to_pupil } = req.body;
  if (!pupil_id || !note_text || !note_text.trim()) {
    return res.status(400).json({ error: 'Target pupil and valid description required' });
  }

  const cleanSentiment = ['positive', 'neutral', 'negative'].includes(sentiment) ? sentiment : 'neutral';
  const visibleToPupil = is_visible_to_pupil === true;

  try {
    const insertRes = await req.pool.query(`
      INSERT INTO disciplinary_notes (pupil_id, teacher_id, note_text, sentiment, is_visible_to_pupil, auto_source)
      VALUES ($1, $2, $3, $4, $5, null)
      RETURNING id, pupil_id, teacher_id, note_text, sentiment, is_visible_to_pupil, auto_source, created_at
    `, [Number(pupil_id), req.user.id, note_text.trim(), cleanSentiment, visibleToPupil]);

    const created = insertRes.rows[0];

    // Populate teacher_name for live append broadcast
    const uRes = await req.pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    created.teacher_name = uRes.rows[0]?.full_name || 'Lehrer';

    req.io.emit('note_created', created);

    res.json(created);
  } catch (err) {
    console.error('Create note error:', err);
    res.status(500).json({ error: 'Failed to publish entry' });
  }
});

// PUT /api/notes/:id/toggle-visibility
router.put('/:id/toggle-visibility', authenticateToken, async (req, res) => {
  const noteId = Number(req.params.id);

  try {
    const checkRes = await req.pool.query('SELECT teacher_id FROM disciplinary_notes WHERE id = $1', [noteId]);
    if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Log not found' });

    if (req.user.role !== 'admin' && Number(checkRes.rows[0].teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Only the submitting instructor can change viewing modes' });
    }

    const updateRes = await req.pool.query(`
      UPDATE disciplinary_notes SET is_visible_to_pupil = NOT is_visible_to_pupil
      WHERE id = $1 RETURNING is_visible_to_pupil
    `, [noteId]);

    res.json({ success: true, is_visible_to_pupil: updateRes.rows[0]?.is_visible_to_pupil });
  } catch (err) {
    console.error('Toggle visibility error:', err);
    res.status(500).json({ error: 'Failed to toggle client access mode' });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  const noteId = Number(req.params.id);

  try {
    const checkRes = await req.pool.query('SELECT teacher_id, auto_source FROM disciplinary_notes WHERE id = $1', [noteId]);
    if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Log entry not found' });

    const note = checkRes.rows[0];
    if (note.auto_source !== null && note.auto_source !== undefined) {
      return res.status(400).json({ error: 'System-generated tracking registers cannot be deleted manually' });
    }

    if (req.user.role !== 'admin' && Number(note.teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Insufficient removal permissions' });
    }

    await req.pool.query('DELETE FROM disciplinary_notes WHERE id = $1', [noteId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Failed to execute deletion' });
  }
});

// Escapes characters that are special in HTML to prevent XSS
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// GET /api/notes/export/:pupil_id
router.get('/export/:pupil_id', authenticateToken, async (req, res) => {
  const pupilId = Number(req.params.pupil_id);
  if (!pupilId) return res.status(400).send('Ungültige Schüler-ID');

  try {
    const pupilRes = await req.pool.query(`
      SELECT u.full_name as name, c.name as class_name
      FROM pupils p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      WHERE p.id = $1
    `, [pupilId]);

    if (pupilRes.rows.length === 0) {
      return res.status(404).send('Schüler nicht gefunden');
    }

    const pupil = pupilRes.rows[0];

    const notesRes = await req.pool.query(`
      SELECT n.note_text, n.sentiment, n.auto_source, n.created_at,
             u.full_name as teacher_name
      FROM disciplinary_notes n
      LEFT JOIN users u ON n.teacher_id = u.id
      WHERE n.pupil_id = $1
      ORDER BY n.created_at DESC
    `, [pupilId]);

    const notes = notesRes.rows;

    const exportDate = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    let rowsHtml = '';
    for (const note of notes) {
      const d = new Date(note.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      let emoji = 'ℹ️';
      let colorClass = '';
      if (note.sentiment === 'positive') {
        emoji = '🌟';
        colorClass = 'sentiment-positive';
      } else if (note.sentiment === 'negative') {
        emoji = '⚠️';
        colorClass = 'sentiment-negative';
      }

      let autoHtml = '';
      if (note.auto_source) {
        autoHtml = `<br><span class="auto-badge">Automatischer Eintrag: ${escapeHtml(note.auto_source)}</span>`;
      }

      rowsHtml += `
        <tr>
          <td>${d}</td>
          <td class="${colorClass}">${emoji}</td>
          <td>
            ${escapeHtml(note.note_text)}
            ${autoHtml}
          </td>
          <td>${escapeHtml(note.teacher_name || 'System')}</td>
        </tr>
      `;
    }

    const htmlTemplate = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.4; color: #0f172a; }
        .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 20px; }
        .student-info { margin-bottom: 30px; background: #f1f5f9; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background-color: #334155; color: white; text-align: left; padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; }
        td { padding: 10px; border: 1px solid #cbd5e1; vertical-align: top; }
        .sentiment-positive { color: #10b981; font-weight: bold; }
        .sentiment-negative { color: #ef4444; font-weight: bold; }
        .auto-badge { font-size: 0.8em; color: #64748b; font-style: italic; display: block; margin-top: 4px; }
        .footer { margin-top: 50px; font-size: 0.9em; text-align: right; }
        .signature-space { margin-top: 40px; border-top: 1px solid black; width: 250px; float: right; text-align: center; padding-top: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Disziplinäre Dokumentation</h1>
        <p>Erstellt am: ${exportDate}</p>
    </div>

    <div class="student-info">
        <strong>Schüler/in:</strong> ${escapeHtml(pupil.name)} <br>
        <strong>Klasse:</strong> ${escapeHtml(pupil.class_name || '?')} <br>
        <strong>Zeitraum:</strong> Aktuelles Schuljahr 2025/26
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 15%;">Datum</th>
                <th style="width: 10%;">Typ</th>
                <th style="width: 60%;">Notiz / Vorfall</th>
                <th style="width: 15%;">Lehrperson</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml || '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Keine Einträge vorhanden</td></tr>'}
        </tbody>
    </table>

    <div class="footer">
        <div class="signature-space">
            <p>Unterschrift Lehrperson / Schulleitung</p>
        </div>
    </div>
</body>
</html>
    `;

    const safeName = pupil.name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_');
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="Verhaltensdokumentation_${safeName}.doc"`);
    res.send(htmlTemplate.trim());
  } catch (err) {
    console.error('Word export error:', err);
    res.status(500).send('Fehler beim Generieren des Word-Dokuments');
  }
});

module.exports = router;
