const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');

// Legacy Endpoint preserved for compatibility
router.get('/pending-tasks', authenticateToken, async (req, res) => {
  // Delegate to new handler mapped structures
  req.url = '/tasks';
  return router.handle(req, res);
});

// GET /api/student/tasks
// Returns open tasks (ungraded assessments from self-directed categories) and active learning plan rows
router.get('/tasks', authenticateToken, async (req, res) => {
  if (req.user.role !== 'pupil') {
    return res.status(403).json({ error: 'Nur für Schülerkonten zugänglich' });
  }

  try {
    // 1. Find pupil ID and class ID
    const pRes = await req.pool.query('SELECT id, class_id FROM pupils WHERE user_id = $1', [req.user.id]);
    if (pRes.rows.length === 0) {
      return res.status(404).json({ error: 'Schülerprofil nicht gefunden' });
    }
    const pupil = pRes.rows[0];

    // 2. Find subjects belonging to this pupil's class
    const sRes = await req.pool.query(`
      SELECT id, name, COALESCE(abbreviation, UPPER(SUBSTRING(name, 1, 2))) as abbreviation
      FROM subjects WHERE class_id = $1
    `, [pupil.class_id]);
    const subjects = sRes.rows;
    const subIds = subjects.map(s => s.id);

    if (subIds.length === 0) {
      return res.json({ tasks: [], plan: [] });
    }

    // 3. Find self-directed categories
    const cRes = await req.pool.query(`
      SELECT id, subject_id, name 
      FROM assessment_categories 
      WHERE subject_id = ANY($1::int[]) AND is_self_directed = true
    `, [subIds]);
    const categories = cRes.rows;
    const catIds = categories.map(c => c.id);

    if (catIds.length === 0) {
      return res.json({ tasks: [], plan: [] });
    }

    // 4. Fetch dedicated assessments metadata rows mapped to these categories to know column-level deadlines
    const assRes = await req.pool.query(`
      SELECT id, category_id, name, info_text, deadline 
      FROM assessments 
      WHERE category_id = ANY($1::int[])
    `, [catIds]);
    const columnMetadata = assRes.rows;

    // 5. Find all graded/ungraded assessment instances mapped in the matrix for these categories
    const distAssRes = await req.pool.query(`
      SELECT DISTINCT category_id, assessment_name FROM grades 
      WHERE category_id = ANY($1::int[])
    `, [catIds]);

    // 6. Fetch the logged in pupil's grade rows to verify which already have a definitive grade
    const pupilGradesRes = await req.pool.query(`
      SELECT category_id, assessment_name, grade_value 
      FROM grades 
      WHERE category_id = ANY($1::int[]) AND pupil_id = $2
    `, [catIds, pupil.id]);
    const pupilGrades = pupilGradesRes.rows;

    // 7. Fetch active multi-block weekly learning plan records from student_learning_plan table
    const planRes = await req.pool.query(`
      SELECT id, pupil_id, category_id, assessment_name, planned_date, slot_number, completed 
      FROM student_learning_plan 
      WHERE pupil_id = $1
      ORDER BY planned_date, slot_number
    `, [pupil.id]);
    const rawPlan = planRes.rows;

    // Enrich learning plan with subject names and abbreviations for supreme presentation rendering
    const enrichedPlan = rawPlan.map(p => {
      const cat = categories.find(c => Number(c.id) === Number(p.category_id));
      const subj = subjects.find(s => Number(s.id) === Number(cat?.subject_id));
      const meta = columnMetadata.find(a => Number(a.category_id) === Number(p.category_id) && a.name === p.assessment_name);
      return {
        ...p,
        category_name: cat?.name || '',
        subject_name: subj?.name || '',
        subject_abbreviation: subj?.abbreviation || 'FACH',
        deadline: meta?.deadline || null,
        info_text: meta?.info_text || ''
      };
    });

    const pendingTasks = [];

    for (const cat of categories) {
      const subj = subjects.find(s => Number(s.id) === Number(cat.subject_id));
      
      // Combine distinct names from grades table and assessments table mapping columns
      const mappedFromGrades = distAssRes.rows.filter(r => Number(r.category_id) === Number(cat.id)).map(r => r.assessment_name);
      const mappedFromMetadata = columnMetadata.filter(a => Number(a.category_id) === Number(cat.id)).map(a => a.name);
      const combinedNamesSet = new Set([...mappedFromGrades, ...mappedFromMetadata]);
      const names = combinedNamesSet.size > 0 ? Array.from(combinedNamesSet) : ['Aufgabe 1'];

      for (const assName of names) {
        const matchGrade = pupilGrades.find(g => Number(g.category_id) === Number(cat.id) && g.assessment_name === assName);
        const meta = columnMetadata.find(a => Number(a.category_id) === Number(cat.id) && a.name === assName);

        // Include as open task if the student does not yet have a recorded final grade
        if (!matchGrade || matchGrade.grade_value === null || matchGrade.grade_value === undefined) {
          pendingTasks.push({
            task_id: `${cat.id}_${assName}`,
            category_id: cat.id,
            category_name: cat.name,
            assessment_name: assName,
            subject_name: subj?.name || '',
            subject_abbreviation: subj?.abbreviation || 'FACH',
            deadline: meta?.deadline || null,
            info_text: meta?.info_text || ''
          });
        }
      }
    }

    res.json({ tasks: pendingTasks, plan: enrichedPlan });
  } catch (err) {
    console.error('Fetch student tasks error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Lernplaner-Daten' });
  }
});

// POST /api/student/plan-task
// Persists distinct block assignments allowing cloner duplication
router.post('/plan-task', authenticateToken, async (req, res) => {
  if (req.user.role !== 'pupil') {
    return res.status(403).json({ error: 'Nur für Schülerkonten zugänglich' });
  }

  const { category_id, assessment_name, planned_date, slot_number } = req.body;
  if (!assessment_name || !planned_date || !slot_number) {
    return res.status(400).json({ error: 'Aufgabenname, Datum und Slot-Nummer sind erforderlich' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    const pRes = await client.query('SELECT id FROM pupils WHERE user_id = $1', [req.user.id]);
    if (pRes.rows.length === 0) throw new Error('Schülerprofil nicht gefunden');
    const targetPupilId = pRes.rows[0].id;

    // Resolve category_id if missing by querying grades or assessments tables
    let resolvedCategoryId = category_id;
    if (!resolvedCategoryId) {
      const catCheck = await client.query(`
        SELECT category_id FROM assessments WHERE name = $1 LIMIT 1
      `, [assessment_name]);
      if (catCheck.rows.length > 0) {
        resolvedCategoryId = catCheck.rows[0].category_id;
      } else {
        const gradeCheck = await client.query(`
          SELECT category_id FROM grades WHERE assessment_name = $1 LIMIT 1
        `, [assessment_name]);
        if (gradeCheck.rows.length > 0) {
          resolvedCategoryId = gradeCheck.rows[0].category_id;
        }
      }
    }

    const insertRes = await client.query(`
      INSERT INTO student_learning_plan (pupil_id, category_id, assessment_name, planned_date, slot_number, completed)
      VALUES ($1, $2, $3, $4, $5, false)
      RETURNING *
    `, [targetPupilId, resolvedCategoryId || null, assessment_name, planned_date, Number(slot_number)]);

    await client.query('COMMIT');
    res.json(insertRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Plan task insert error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Blockzuweisung' });
  } finally {
    client.release();
  }
});

// Legacy PUT handler proxy mapped to POST pattern
router.put('/plan-task', authenticateToken, async (req, res) => {
  req.body.slot_number = req.body.slot_number || 1;
  req.url = '/plan-task';
  req.method = 'POST';
  return router.handle(req, res);
});

// DELETE /api/student/plan-task/:id
// Removes a specific scheduled task item card from a daily block slot
router.delete('/plan-task/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'pupil') {
    return res.status(403).json({ error: 'Nur für Schülerkonten zugänglich' });
  }

  try {
    const delRes = await req.pool.query(`
      DELETE FROM student_learning_plan 
      WHERE id = $1 AND pupil_id = (SELECT id FROM pupils WHERE user_id = $2)
      RETURNING id
    `, [Number(req.params.id), req.user.id]);

    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'Eintrag nicht gefunden oder unberechtigt' });
    }

    res.json({ success: true, deleted_id: Number(req.params.id) });
  } catch (err) {
    console.error('Delete plan item error:', err);
    res.status(500).json({ error: 'Fehler beim Entfernen der Zuweisung' });
  }
});

// PATCH /api/student/plan-task/:id
// Updates item completion status toggles inline
router.patch('/plan-task/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'pupil') {
    return res.status(403).json({ error: 'Nur für Schülerkonten zugänglich' });
  }

  const { completed } = req.body;
  if (completed === undefined) {
    return res.status(400).json({ error: 'Zustandsparameter erforderlich' });
  }

  try {
    const updateRes = await req.pool.query(`
      UPDATE student_learning_plan 
      SET completed = $1 
      WHERE id = $2 AND pupil_id = (SELECT id FROM pupils WHERE user_id = $3)
      RETURNING *
    `, [!!completed, Number(req.params.id), req.user.id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Eintrag nicht gefunden oder unberechtigt' });
    }

    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error('Patch plan item error:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Status' });
  }
});

// POST /api/student/submit-task
// Allows pupils to submit a value for a self-directed task
router.post('/submit-task', authenticateToken, async (req, res) => {
  if (req.user.role !== 'pupil') {
    return res.status(403).json({ error: 'Nur für Schülerkonten zugänglich' });
  }

  const { category_id, assessment_name, grade_value } = req.body;
  if (!category_id || !assessment_name || grade_value === null || grade_value === undefined || String(grade_value).trim() === '') {
    return res.status(400).json({ error: 'Kategorie, Aufgabenname und Bewertungswert sind erforderlich' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    const pupilRes = await client.query('SELECT id FROM pupils WHERE user_id = $1', [req.user.id]);
    if (pupilRes.rows.length === 0) {
      throw new Error('Schülerprofil nicht gefunden');
    }
    const pupilId = pupilRes.rows[0].id;

    const catRes = await client.query(`
      SELECT c.id
      FROM assessment_categories c
      JOIN subjects s ON s.id = c.subject_id
      JOIN pupils p ON p.class_id = s.class_id
      WHERE c.id = $1 AND p.id = $2 AND c.is_self_directed = true
      LIMIT 1
    `, [Number(category_id), pupilId]);
    if (catRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Abgabe nur bei freigegebenen Selbstlern-Aufgaben möglich' });
    }

    const existingRes = await client.query(`
      SELECT id FROM grades
      WHERE category_id = $1 AND pupil_id = $2 AND assessment_name = $3
      LIMIT 1
    `, [Number(category_id), pupilId, assessment_name.trim()]);

    let saved;
    if (existingRes.rows.length > 0) {
      const upRes = await client.query(`
        UPDATE grades
        SET grade_value = $1, is_visible = true, date = NOW()
        WHERE id = $2
        RETURNING *
      `, [String(grade_value).trim(), existingRes.rows[0].id]);
      saved = upRes.rows[0];
    } else {
      const insRes = await client.query(`
        INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, is_visible)
        VALUES ($1, $2, $3, $4, true)
        RETURNING *
      `, [Number(category_id), pupilId, assessment_name.trim(), String(grade_value).trim()]);
      saved = insRes.rows[0];
    }

    await client.query('COMMIT');
    res.json({ success: true, grade: saved });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit task error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Abgabe' });
  } finally {
    client.release();
  }
});

module.exports = router;
