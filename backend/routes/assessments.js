const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');

// PUT /api/assessments/:id
// Updates assessment column metadata (name, info_text, deadline) and propagates renaming to grade cells
router.put('/:id', authenticateToken, async (req, res) => {
  const { category_id, old_name, name, info_text, deadline } = req.body;
  const paramId = req.params.id;

  if (!category_id || !name) {
    return res.status(400).json({ error: 'Kategorie und neuer Name sind zwingend erforderlich' });
  }

  const cleanName = name.trim();
  const cleanOldName = (old_name || cleanName).trim();
  const targetDeadline = deadline ? deadline : null;

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    let assessmentRow;

    // Check if an assessment metadata record already exists for this column
    // We query by numeric ID if available, or fallback to composite key (category_id, cleanOldName)
    let checkRes;
    if (!isNaN(paramId) && Number(paramId) > 0) {
      checkRes = await client.query('SELECT id FROM assessments WHERE id = $1', [Number(paramId)]);
    } else {
      checkRes = await client.query('SELECT id FROM assessments WHERE category_id = $1 AND name = $2', [Number(category_id), cleanOldName]);
    }

    if (checkRes && checkRes.rows.length > 0) {
      const rowId = checkRes.rows[0].id;
      const updateRes = await client.query(`
        UPDATE assessments 
        SET name = $1, info_text = $2, deadline = $3
        WHERE id = $4
        RETURNING *
      `, [cleanName, info_text || null, targetDeadline, rowId]);
      assessmentRow = updateRes.rows[0];
    } else {
      // Insert new assessment metadata row
      const insertRes = await client.query(`
        INSERT INTO assessments (category_id, name, info_text, deadline, is_visible)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (category_id, name) DO UPDATE 
        SET info_text = EXCLUDED.info_text, deadline = EXCLUDED.deadline
        RETURNING *
      `, [Number(category_id), cleanName, info_text || null, targetDeadline]);
      assessmentRow = insertRes.rows[0];
    }

    // If column name has changed, update matching string keys in grades and student_learning_plan tables
    if (cleanName !== cleanOldName) {
      await client.query(`
        UPDATE grades 
        SET assessment_name = $1 
        WHERE category_id = $2 AND assessment_name = $3
      `, [cleanName, Number(category_id), cleanOldName]);

      await client.query(`
        UPDATE student_learning_plan 
        SET assessment_name = $1 
        WHERE category_id = $2 AND assessment_name = $3
      `, [cleanName, Number(category_id), cleanOldName]);
    }

    // Broadcast update via socket if applicable to maintain real-time sync across clients
    if (req.io) {
      req.io.emit('subject_updated', { category_id: Number(category_id) });
    }

    await client.query('COMMIT');
    res.json(assessmentRow);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update assessment metadata error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Spalteneinstellungen' });
  } finally {
    client.release();
  }
});

module.exports = router;
