const express = require('express');
const router = express.Router();
const { authenticateToken, setupLimiter, stateLimiter } = require('../server');

// GET /api/participation?subject_id=&date=
// Returns all participation logs for a subject on a given date (teachers only)
router.get('/', stateLimiter, authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') return res.status(403).json({ error: 'Zugriff verweigert' });

  const subjectId = Number(req.query.subject_id);
  const date = req.query.date || new Date().toISOString().split('T')[0];

  if (!subjectId) return res.status(400).json({ error: 'subject_id required' });

  try {
    const result = await req.pool.query(`
      SELECT pl.id, pl.pupil_id, u.full_name as pupil_name, pl.subject_id,
             pl.lesson_date, pl.rating, pl.applied_to_grade, pl.created_at
      FROM participation_logs pl
      JOIN pupils p ON pl.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE pl.subject_id = $1 AND pl.lesson_date = $2
      ORDER BY u.full_name
    `, [subjectId, date]);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch participation error:', err);
    res.status(500).json({ error: 'Failed to load participation logs' });
  }
});

// POST /api/participation — log or update a pupil's participation rating
// Cycles through: null → excellent → engaged → passive → excellent (on repeated calls for same pupil/subject/date)
router.post('/', setupLimiter, authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') return res.status(403).json({ error: 'Zugriff verweigert' });

  const { pupil_id, subject_id, lesson_date, rating } = req.body;
  if (!pupil_id || !subject_id) {
    return res.status(400).json({ error: 'pupil_id and subject_id are required' });
  }

  const VALID_RATINGS = ['excellent', 'engaged', 'passive'];
  const CYCLE = ['excellent', 'engaged', 'passive'];

  const date = lesson_date || new Date().toISOString().split('T')[0];

  try {
    // Check for existing entry
    const existing = await req.pool.query(`
      SELECT id, rating FROM participation_logs
      WHERE pupil_id = $1 AND subject_id = $2 AND lesson_date = $3
      LIMIT 1
    `, [Number(pupil_id), Number(subject_id), date]);

    let finalRating;
    if (rating && VALID_RATINGS.includes(rating)) {
      // Explicit rating supplied
      finalRating = rating;
    } else if (existing.rows.length > 0) {
      // Cycle to next rating
      const currentIdx = CYCLE.indexOf(existing.rows[0].rating);
      finalRating = CYCLE[(currentIdx + 1) % CYCLE.length];
    } else {
      // First tap — default to excellent
      finalRating = 'excellent';
    }

    let saved;
    if (existing.rows.length > 0) {
      const upRes = await req.pool.query(`
        UPDATE participation_logs SET rating = $1, teacher_id = $2
        WHERE id = $3 RETURNING *
      `, [finalRating, req.user.id, existing.rows[0].id]);
      saved = upRes.rows[0];
    } else {
      const insRes = await req.pool.query(`
        INSERT INTO participation_logs (pupil_id, teacher_id, subject_id, lesson_date, rating)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `, [Number(pupil_id), req.user.id, Number(subject_id), date, finalRating]);
      saved = insRes.rows[0];
    }

    res.json(saved);
  } catch (err) {
    console.error('Save participation error:', err);
    res.status(500).json({ error: 'Failed to save participation entry' });
  }
});

// DELETE /api/participation/:id — remove a single log entry
router.delete('/:id', setupLimiter, authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') return res.status(403).json({ error: 'Zugriff verweigert' });

  try {
    const checkRes = await req.pool.query('SELECT teacher_id FROM participation_logs WHERE id = $1', [Number(req.params.id)]);
    if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });

    if (req.user.role !== 'admin' && Number(checkRes.rows[0].teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Nur der erfassende Lehrer kann Einträge löschen' });
    }

    await req.pool.query('DELETE FROM participation_logs WHERE id = $1', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete participation error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

/**
 * POST /api/participation/batch-apply
 * Converts the week's participation logs for a subject into Mitarbeit grades.
 * Calculates a per-pupil average from the week and writes it as a grade in the "Mitarbeit" category.
 *
 * Body: { subject_id, week_start (ISO date) }
 */
router.post('/batch-apply', setupLimiter, authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') return res.status(403).json({ error: 'Zugriff verweigert' });

  const { subject_id, week_start } = req.body;
  if (!subject_id || !week_start) return res.status(400).json({ error: 'subject_id and week_start required' });

  // Calculate week range (Mon–Fri)
  const startDate = new Date(week_start);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const endStr = endDate.toISOString().split('T')[0];

  const RATING_TO_GRADE = { excellent: 1, engaged: 2, passive: 4 };

  try {
    // Fetch logs for the week
    const logsRes = await req.pool.query(`
      SELECT pupil_id, rating FROM participation_logs
      WHERE subject_id = $1 AND lesson_date BETWEEN $2 AND $3
    `, [Number(subject_id), week_start, endStr]);

    if (logsRes.rows.length === 0) {
      return res.json({ applied: 0, message: 'Keine Einträge für diese Woche gefunden' });
    }

    // Find Mitarbeit category for the subject
    const catRes = await req.pool.query(`
      SELECT id FROM assessment_categories
      WHERE subject_id = $1 AND LOWER(name) LIKE '%mitarbeit%'
      LIMIT 1
    `, [Number(subject_id)]);

    if (catRes.rows.length === 0) {
      return res.status(404).json({ error: 'Mitarbeit-Kategorie nicht gefunden' });
    }
    const catId = catRes.rows[0].id;

    const weekLabel = `Mitarbeit KW ${week_start}`;

    // Group by pupil and compute average
    const pupilRatings = {};
    for (const row of logsRes.rows) {
      if (!pupilRatings[row.pupil_id]) pupilRatings[row.pupil_id] = [];
      pupilRatings[row.pupil_id].push(RATING_TO_GRADE[row.rating] ?? 3);
    }

    const client = await req.pool.connect();
    let applied = 0;
    try {
      await client.query('BEGIN');
      for (const [pupilId, ratingValues] of Object.entries(pupilRatings)) {
        const avg = ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length;
        const gradeStr = String(Math.round(avg));

        // Upsert into grades
        const existRes = await client.query(`
          SELECT id FROM grades WHERE category_id = $1 AND pupil_id = $2 AND assessment_name = $3
        `, [catId, Number(pupilId), weekLabel]);

        if (existRes.rows.length > 0) {
          await client.query(`
            UPDATE grades SET grade_value = $1, date = NOW() WHERE id = $2
          `, [gradeStr, existRes.rows[0].id]);
        } else {
          await client.query(`
            INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, is_visible)
            VALUES ($1, $2, $3, $4, true)
          `, [catId, Number(pupilId), weekLabel, gradeStr]);
        }

        // Mark logs as applied
        await client.query(`
          UPDATE participation_logs SET applied_to_grade = true
          WHERE pupil_id = $1 AND subject_id = $2 AND lesson_date BETWEEN $3 AND $4
        `, [Number(pupilId), Number(subject_id), week_start, endStr]);

        applied++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Broadcast update
    if (req.io) req.io.emit('subject_updated', { subject_id: Number(subject_id) });

    res.json({ applied, message: `${applied} Noten in Mitarbeit eingetragen` });
  } catch (err) {
    console.error('Batch apply participation error:', err);
    res.status(500).json({ error: 'Batch-Anwendung fehlgeschlagen' });
  }
});

// GET /api/participation/seating?class_id=
// Returns seating positions for all pupils in a class
router.get('/seating', stateLimiter, authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') return res.status(403).json({ error: 'Zugriff verweigert' });
  const classId = Number(req.query.class_id);
  if (!classId) return res.status(400).json({ error: 'class_id required' });

  try {
    const result = await req.pool.query(`
      SELECT sp.pupil_id, sp.desk_row, sp.desk_col, u.full_name as name
      FROM seating_positions sp
      JOIN pupils p ON sp.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE p.class_id = $1
      ORDER BY sp.desk_row, sp.desk_col
    `, [classId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch seating error:', err);
    res.status(500).json({ error: 'Failed to load seating positions' });
  }
});

// PUT /api/participation/seating — update a pupil's desk position
router.put('/seating', setupLimiter, authenticateToken, async (req, res) => {
  if (req.user.role === 'pupil') return res.status(403).json({ error: 'Zugriff verweigert' });

  const { pupil_id, desk_row, desk_col } = req.body;
  if (!pupil_id || desk_row === undefined || desk_col === undefined) {
    return res.status(400).json({ error: 'pupil_id, desk_row and desk_col are required' });
  }

  try {
    await req.pool.query(`
      INSERT INTO seating_positions (pupil_id, desk_row, desk_col, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (pupil_id) DO UPDATE SET desk_row = $2, desk_col = $3, updated_at = NOW()
    `, [Number(pupil_id), Number(desk_row), Number(desk_col)]);

    res.json({ success: true });
  } catch (err) {
    console.error('Update seating error:', err);
    res.status(500).json({ error: 'Failed to update seating position' });
  }
});

module.exports = router;
