const express = require('express');
const router = express.Router();
const { authenticateToken, setupLimiter } = require('../server');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
// GET /api/notes?pupil_id=<id>
router.get('/', setupLimiter, authenticateToken, async (req, res) => {
  // Security: pupils are always locked to their own record regardless of query param
  try {
    let pupilId;
    if (req.user.role === 'pupil') {
      const ownRes = await req.pool.query('SELECT id FROM pupils WHERE user_id = $1', [req.user.id]);
      if (ownRes.rows.length === 0) return res.status(403).json({ error: 'Schülerprofil nicht gefunden' });
      pupilId = ownRes.rows[0].id;
    } else {
      pupilId = Number(req.query.pupil_id);
      if (!pupilId) return res.status(400).json({ error: 'pupil_id parameter required' });
    }

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
  // Pupils may not export notes (export is a teacher/admin operation)
  if (req.user.role === 'pupil') {
    return res.status(403).send('Zugriff verweigert');
  }
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

// GET /api/notes/important-info/:pupil_id
router.get('/important-info/:pupil_id', authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  const pupilId = Number(req.params.pupil_id);
  if (!pupilId) return res.status(400).json({ error: 'Ungültige Schüler-ID' });

  try {
    const infoRes = await req.pool.query(`
      SELECT pii.content, pii.updated_at, u.full_name as updated_by_name
      FROM pupil_important_info pii
      LEFT JOIN users u ON pii.updated_by = u.id
      WHERE pii.pupil_id = $1
    `, [pupilId]);

    if (infoRes.rows.length === 0) {
      return res.json({ content: '', updated_at: null, updated_by_name: null });
    }

    res.json(infoRes.rows[0]);
  } catch (err) {
    console.error('Get important info error:', err);
    res.status(500).json({ error: 'Wichtige Info konnte nicht geladen werden' });
  }
});

// PUT /api/notes/important-info/:pupil_id
router.put('/important-info/:pupil_id', authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  const pupilId = Number(req.params.pupil_id);
  if (!pupilId) return res.status(400).json({ error: 'Ungültige Schüler-ID' });

  const { content } = req.body;
  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'Inhalt erforderlich' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    // Save current version to history before overwriting
    const existingRes = await client.query(`
      SELECT content FROM pupil_important_info WHERE pupil_id = $1
    `, [pupilId]);

    if (existingRes.rows.length > 0 && existingRes.rows[0].content !== '') {
      await client.query(`
        INSERT INTO pupil_important_info_history (pupil_id, content, changed_by, changed_at)
        SELECT pupil_id, content, updated_by, updated_at
        FROM pupil_important_info WHERE pupil_id = $1
      `, [pupilId]);
    }

    // Upsert the current info
    const upsertRes = await client.query(`
      INSERT INTO pupil_important_info (pupil_id, content, updated_by, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (pupil_id) DO UPDATE
        SET content = EXCLUDED.content,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
      RETURNING content, updated_at
    `, [pupilId, content.trim(), req.user.id]);

    const userRes = await client.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const updatedByName = userRes.rows[0]?.full_name || 'Lehrperson';

    await client.query('COMMIT');

    res.json({
      content: upsertRes.rows[0].content,
      updated_at: upsertRes.rows[0].updated_at,
      updated_by_name: updatedByName
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update important info error:', err);
    res.status(500).json({ error: 'Wichtige Info konnte nicht gespeichert werden' });
  } finally {
    client.release();
  }
});

// GET /api/notes/important-info/:pupil_id/history
router.get('/important-info/:pupil_id/history', authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }
  const pupilId = Number(req.params.pupil_id);
  if (!pupilId) return res.status(400).json({ error: 'Ungültige Schüler-ID' });

  try {
    const histRes = await req.pool.query(`
      SELECT h.id, h.content, h.changed_at, u.full_name as changed_by_name
      FROM pupil_important_info_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.pupil_id = $1
      ORDER BY h.changed_at DESC
      LIMIT 20
    `, [pupilId]);

    res.json(histRes.rows);
  } catch (err) {
    console.error('Get important info history error:', err);
    res.status(500).json({ error: 'Verlauf konnte nicht geladen werden' });
  }
});

// GET /api/notes/export-kel/:pupil_id
// Generates a compact KEL (Kinder-Eltern-Lehrperson) meeting document
router.get('/export-kel/:pupil_id', authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') {
    return res.status(403).send('Zugriff verweigert');
  }
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

    // Load important info
    const infoRes = await req.pool.query(`
      SELECT pii.content, pii.updated_at, u.full_name as updated_by_name
      FROM pupil_important_info pii
      LEFT JOIN users u ON pii.updated_by = u.id
      WHERE pii.pupil_id = $1
    `, [pupilId]);
    const importantInfo = infoRes.rows[0] || { content: '', updated_at: null, updated_by_name: null };

    // Load visible teacher notes (non-auto, positive/neutral/negative)
    const notesRes = await req.pool.query(`
      SELECT n.note_text, n.sentiment, n.created_at, u.full_name as teacher_name
      FROM disciplinary_notes n
      LEFT JOIN users u ON n.teacher_id = u.id
      WHERE n.pupil_id = $1 AND n.auto_source IS NULL
      ORDER BY n.created_at DESC
      LIMIT 30
    `, [pupilId]);

    const notes = notesRes.rows;
    const exportDate = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    let notesHtml = '';
    for (const note of notes) {
      const d = new Date(note.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      let sentimentLabel = 'Neutral';
      let sentimentColor = '#64748b';
      let sentimentBg = '#f1f5f9';
      if (note.sentiment === 'positive') {
        sentimentLabel = 'Positiv';
        sentimentColor = '#166534';
        sentimentBg = '#f0fdf4';
      } else if (note.sentiment === 'negative') {
        sentimentLabel = 'Beachten';
        sentimentColor = '#991b1b';
        sentimentBg = '#fff1f2';
      }

      notesHtml += `
        <tr style="background:${sentimentBg}; page-break-inside:avoid;">
          <td style="padding:8px 10px; border:1px solid #e2e8f0; font-size:11px; color:#334155; white-space:nowrap; vertical-align:top;">${d}</td>
          <td style="padding:8px 10px; border:1px solid #e2e8f0; font-size:11px; font-weight:bold; color:${sentimentColor}; white-space:nowrap; vertical-align:top;">${sentimentLabel}</td>
          <td style="padding:8px 10px; border:1px solid #e2e8f0; font-size:11px; color:#1e293b; vertical-align:top;">${escapeHtml(note.note_text)}</td>
          <td style="padding:8px 10px; border:1px solid #e2e8f0; font-size:11px; color:#64748b; white-space:nowrap; vertical-align:top;">${escapeHtml(note.teacher_name || 'Lehrperson')}</td>
        </tr>
      `;
    }

    const importantInfoHtml = importantInfo.content
      ? `<div style="background:#fefce8; border:2px solid #fbbf24; border-radius:6px; padding:14px 16px; margin-bottom:24px;">
           <div style="font-size:12px; font-weight:bold; color:#78350f; margin-bottom:6px; text-transform:uppercase; letter-spacing:1px;">⚠️ Wichtige Informationen</div>
           <div style="font-size:12px; color:#1c1917; white-space:pre-wrap; line-height:1.6;">${escapeHtml(importantInfo.content)}</div>
           ${importantInfo.updated_by_name ? `<div style="font-size:10px; color:#92400e; margin-top:8px; font-style:italic;">Zuletzt bearbeitet von: ${escapeHtml(importantInfo.updated_by_name)}</div>` : ''}
         </div>`
      : '';

    const htmlTemplate = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.4; color: #0f172a; margin: 20px; }
        .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 12px; margin-bottom: 20px; }
        .header h1 { font-size: 20px; color: #1e3a8a; margin: 0 0 4px 0; }
        .header .subtitle { font-size: 12px; color: #64748b; }
        .student-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; display: flex; gap: 30px; }
        .student-box strong { font-size: 14px; color: #1e3a8a; }
        .section-title { font-size: 13px; font-weight: bold; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e40af; color: white; text-align: left; padding: 8px 10px; font-size: 11px; font-weight: bold; }
        .signature-row { margin-top: 40px; display: flex; gap: 30px; page-break-inside: avoid; }
        .signature-block { flex: 1; border-top: 1px solid #334155; padding-top: 6px; text-align: center; font-size: 11px; color: #64748b; }
        .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>KEL-Gesprächsunterlage</h1>
        <div class="subtitle">Kinder – Eltern – Lehrperson &nbsp;|&nbsp; ${exportDate}</div>
    </div>

    <div class="student-box">
        <div><strong>Schüler/in:</strong> ${escapeHtml(pupil.name)}</div>
        <div><strong>Klasse:</strong> ${escapeHtml(pupil.class_name || '?')}</div>
        <div><strong>Schuljahr:</strong> 2025/26</div>
    </div>

    ${importantInfoHtml}

    ${notes.length > 0 ? `
    <div class="section-title">Beobachtungen &amp; Anmerkungen</div>
    <table>
        <thead>
            <tr>
                <th style="width:12%;">Datum</th>
                <th style="width:12%;">Typ</th>
                <th style="width:62%;">Notiz</th>
                <th style="width:14%;">Lehrperson</th>
            </tr>
        </thead>
        <tbody>
            ${notesHtml}
        </tbody>
    </table>
    ` : `<div class="section-title">Beobachtungen &amp; Anmerkungen</div>
    <div style="padding:12px; color:#94a3b8; font-size:12px; font-style:italic; border:1px dashed #e2e8f0; border-radius:4px; text-align:center;">Keine Einträge vorhanden</div>`}

    <div class="section-title">Gesprächsnotizen (KEL-Gespräch)</div>
    <div style="border: 1px solid #e2e8f0; border-radius:4px; min-height: 80px; padding: 10px; margin-bottom: 10px; font-size:12px; color:#94a3b8; font-style:italic;">Notizen während des Gesprächs ...</div>

    <div class="signature-row">
        <div class="signature-block">Unterschrift Schüler/in</div>
        <div class="signature-block">Unterschrift Elternteil/Erziehungsberechtigte/r</div>
        <div class="signature-block">Unterschrift Lehrperson</div>
    </div>

    <div class="footer">
        KEL-Gesprächsunterlage – ${escapeHtml(pupil.name)} – ${exportDate} – Schuljahr 2025/26
    </div>
</body>
</html>
    `;

    const safeName = pupil.name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_');
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="KEL_${safeName}_${exportDate.replace(/\./g, '-')}.doc"`);
    res.send(htmlTemplate.trim());
  } catch (err) {
    console.error('KEL export error:', err);
    res.status(500).send('Fehler beim Generieren des KEL-Dokuments');
  }
});

module.exports = router;
