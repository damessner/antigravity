const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');

// Helper to calculate rank rank priority
const getRankWeight = (tag) => {
  if (tag === 'Meister') return 3;
  if (tag === 'Geselle') return 2;
  if (tag === 'Lehrling') return 1;
  return 0;
};

// GET /api/gradebook/subjects
router.get('/subjects', authenticateToken, async (req, res) => {
  try {
    let subQuery = `
      SELECT id, name, class_id, teacher_id, second_teacher_id, projection_visible,
             COALESCE(abbreviation, UPPER(SUBSTRING(name, 1, 2))) as abbreviation
      FROM subjects
    `;
    const queryParams = [];
    const classParam = req.query.class_id ? Number(req.query.class_id) : null;

    if (req.user.role === 'teacher') {
      if (classParam) {
        subQuery += ` WHERE (teacher_id = $1 OR second_teacher_id = $1) AND class_id = $2`;
        queryParams.push(req.user.id, classParam);
      } else {
        subQuery += ` WHERE teacher_id = $1 OR second_teacher_id = $1`;
        queryParams.push(req.user.id);
      }
    } else if (req.user.role === 'pupil') {
      // Find pupil's class
      const pRes = await req.pool.query('SELECT class_id FROM pupils WHERE user_id = $1', [req.user.id]);
      const classId = pRes.rows.length > 0 ? pRes.rows[0].class_id : 0;
      subQuery += ` WHERE class_id = $1`;
      queryParams.push(classId);
    } else if (req.user.role === 'admin') {
      if (classParam) {
        subQuery += ` WHERE class_id = $1`;
        queryParams.push(classParam);
      }
    }
    subQuery += ` ORDER BY id`;

    const subjectsRes = await req.pool.query(subQuery, queryParams);
    const subjects = subjectsRes.rows;

    if (subjects.length === 0) {
      return res.json([]);
    }

    const subjectIds = subjects.map(s => s.id);

    // Fetch categories for these subjects
    const categoriesRes = await req.pool.query(`
      SELECT id, subject_id, name, weight_percentage, scale_type, is_self_directed
      FROM assessment_categories
      WHERE subject_id = ANY($1::int[])
      ORDER BY id
    `, [subjectIds]);

    // Fetch tags for these subjects
    const tagsRes = await req.pool.query(`
      SELECT id, pupil_id, subject_id, tier_tag
      FROM pupil_subject_tags
      WHERE subject_id = ANY($1::int[])
    `, [subjectIds]);

    const catIds = categoriesRes.rows.map(c => c.id);
    let assessmentsRows = [];
    if (catIds.length > 0) {
      const assRes = await req.pool.query(`
        SELECT id, category_id, name, info_text, deadline, is_visible
        FROM assessments
        WHERE category_id = ANY($1::int[])
      `, [catIds]);
      assessmentsRows = assRes.rows;
    }

    // Stitch together defensively in memory
    const result = subjects.map(s => {
      const cats = categoriesRes.rows.filter(c => Number(c.subject_id) === Number(s.id)).map(c => ({
        ...c,
        column_metadata: assessmentsRows.filter(a => Number(a.category_id) === Number(c.id))
      }));
      const tags = tagsRes.rows.filter(t => Number(t.subject_id) === Number(s.id));
      return {
        ...s,
        categories: cats,
        pupil_tags: tags
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Fetch subjects error:', err);
    res.status(500).json({ error: 'Failed to fetch curricular subjects' });
  }
});

// POST /api/gradebook/subject (Singular with Austrian Templates)
router.post('/subject', authenticateToken, async (req, res) => {
  const { name, abbreviation, class_id, second_teacher_id } = req.body;
  if (!name || !class_id) {
    return res.status(400).json({ error: 'Subject name and class assignment are required' });
  }

  const cleanName = name.trim();
  const abbr = abbreviation ? abbreviation.substring(0, 5) : cleanName.substring(0, 2).toUpperCase();
  const secTeacherId = second_teacher_id ? Number(second_teacher_id) : null;

  // Determine auto-generated categories template based on Subject Name
  let categoriesToCreate = [];
  const lowerName = cleanName.toLowerCase();
  if (lowerName === 'mathematik' || lowerName === 'englisch' || lowerName === 'deutsch') {
    categoriesToCreate = [
      { name: 'Schularbeiten', weight_percentage: 40 },
      { name: 'Mitarbeit', weight_percentage: 20 },
      { name: 'Lernzielkontrollen', weight_percentage: 15 },
      { name: 'Hausübungen', weight_percentage: 15 },
      { name: 'Offenes Lernen', weight_percentage: 10 }
    ];
  } else {
    categoriesToCreate = [
      { name: 'Mitarbeit', weight_percentage: 60 },
      { name: 'Lernzielkontrollen', weight_percentage: 40 }
    ];
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    const dupRes = await client.query(`
      SELECT id FROM subjects WHERE LOWER(name) = LOWER($1) AND class_id = $2 LIMIT 1
    `, [cleanName, Number(class_id)]);
    if (dupRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Dieses Fach existiert in der ausgewählten Klasse bereits' });
    }

    // Insert subject
    const subRes = await client.query(`
      INSERT INTO subjects (name, abbreviation, class_id, teacher_id, second_teacher_id, projection_visible)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id, name, abbreviation, class_id, teacher_id, second_teacher_id, projection_visible
    `, [cleanName, abbr, Number(class_id), Number(req.user.id), secTeacherId]);
    const newSubject = subRes.rows[0];

    // Insert categories
    const insertedCategories = [];
    for (const cat of categoriesToCreate) {
      const catRes = await client.query(`
        INSERT INTO assessment_categories (subject_id, name, weight_percentage, scale_type)
        VALUES ($1, $2, $3, $4)
        RETURNING id, subject_id, name, weight_percentage, scale_type
      `, [newSubject.id, cat.name, cat.weight_percentage, 'numeric_1_5']);
      insertedCategories.push({ ...catRes.rows[0], column_metadata: [] });
    }

    await client.query('COMMIT');
    res.json({ ...newSubject, categories: insertedCategories, pupil_tags: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create single subject error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Dieses Fach existiert in der ausgewählten Klasse bereits' });
    }
    res.status(500).json({ error: 'Failed to create subject gradebook with templates' });
  } finally {
    client.release();
  }
});

// POST /api/gradebook/subjects
router.post('/subjects', authenticateToken, async (req, res) => {
  const { name, abbreviation, class_id, categories } = req.body;
  if (!name || !class_id || !Array.isArray(categories)) {
    return res.status(400).json({ error: 'Subject name, class assignment, and category structures are required' });
  }

  // Validate category weights sum exactly to 100
  const totalWeight = categories.reduce((sum, c) => sum + Number(c.weight_percentage || 0), 0);
  if (totalWeight !== 100) {
    return res.status(400).json({ error: 'Category weight percentages must sum to exactly 100%' });
  }

  const abbr = abbreviation ? abbreviation.substring(0, 5) : name.substring(0, 2).toUpperCase();

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    const cleanName = name.trim();
    const dupRes = await client.query(`
      SELECT id FROM subjects WHERE LOWER(name) = LOWER($1) AND class_id = $2 LIMIT 1
    `, [cleanName, Number(class_id)]);
    if (dupRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Dieses Fach existiert in der ausgewählten Klasse bereits' });
    }

    // Insert subject
    const subRes = await client.query(`
      INSERT INTO subjects (name, abbreviation, class_id, teacher_id, projection_visible)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, name, abbreviation, class_id, teacher_id, second_teacher_id, projection_visible
    `, [cleanName, abbr, class_id, req.user.id]);
    const newSubject = subRes.rows[0];

    // Insert categories
    const insertedCategories = [];
    for (const cat of categories) {
      const catRes = await client.query(`
        INSERT INTO assessment_categories (subject_id, name, weight_percentage, scale_type, is_self_directed)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, subject_id, name, weight_percentage, scale_type, is_self_directed
      `, [newSubject.id, cat.name.trim(), Number(cat.weight_percentage), cat.scale_type || 'numeric_1_5', !!cat.is_self_directed]);
      insertedCategories.push({ ...catRes.rows[0], column_metadata: [] });
    }

    await client.query('COMMIT');
    res.json({ ...newSubject, categories: insertedCategories, pupil_tags: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create subject error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Dieses Fach existiert in der ausgewählten Klasse bereits' });
    }
    res.status(500).json({ error: 'Failed to create subject gradebook' });
  } finally {
    client.release();
  }
});

// PUT /api/gradebook/subjects/:id
router.put('/subjects/:id', authenticateToken, async (req, res) => {
  const subjectId = Number(req.params.id);
  const { name, abbreviation, categories } = req.body;

  if (!Array.isArray(categories)) {
    return res.status(400).json({ error: 'Categories array required' });
  }

  const totalWeight = categories.reduce((sum, c) => sum + Number(c.weight_percentage || 0), 0);
  if (totalWeight !== 100) {
    return res.status(400).json({ error: 'Category weight percentages must sum to exactly 100%' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    // Verify ownership
    const checkRes = await client.query('SELECT teacher_id FROM subjects WHERE id = $1', [subjectId]);
    if (checkRes.rows.length === 0) throw new Error('Subject not found');
    if (req.user.role !== 'admin' && Number(checkRes.rows[0].teacher_id) !== Number(req.user.id)) {
      throw new Error('Unauthorized edit access');
    }

    const abbr = abbreviation ? abbreviation.substring(0, 5) : name.substring(0, 2).toUpperCase();
    await client.query(`
      UPDATE subjects SET name = $1, abbreviation = $2 WHERE id = $3
    `, [name.trim(), abbr, subjectId]);

    // Current categories from DB
    const curCatsRes = await client.query('SELECT id FROM assessment_categories WHERE subject_id = $1', [subjectId]);
    const existingIds = curCatsRes.rows.map(c => Number(c.id));
    const targetIds = categories.filter(c => c.id !== undefined).map(c => Number(c.id));

    // Delete removed categories
    const toDelete = existingIds.filter(id => !targetIds.includes(id));
    if (toDelete.length > 0) {
      await client.query('DELETE FROM assessment_categories WHERE id = ANY($1::int[])', [toDelete]);
    }

    // Upsert categories
    for (const cat of categories) {
      if (cat.id) {
        await client.query(`
          UPDATE assessment_categories 
          SET name = $1, weight_percentage = $2, scale_type = $3, is_self_directed = $6
          WHERE id = $4 AND subject_id = $5
        `, [cat.name.trim(), Number(cat.weight_percentage), cat.scale_type || 'numeric_1_5', Number(cat.id), subjectId, !!cat.is_self_directed]);
      } else {
        await client.query(`
          INSERT INTO assessment_categories (subject_id, name, weight_percentage, scale_type, is_self_directed)
          VALUES ($1, $2, $3, $4, $5)
        `, [subjectId, cat.name.trim(), Number(cat.weight_percentage), cat.scale_type || 'numeric_1_5', !!cat.is_self_directed]);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update subject error:', err);
    res.status(500).json({ error: err.message || 'Failed to apply diff updates to subject' });
  } finally {
    client.release();
  }
});

// GET /api/gradebook/matrix/:id
router.get('/matrix/:id', authenticateToken, async (req, res) => {
  const subjectId = Number(req.params.id);
  try {
    const subRes = await req.pool.query('SELECT * FROM subjects WHERE id = $1', [subjectId]);
    if (subRes.rows.length === 0) return res.status(404).json({ error: 'Unterrichtsfach nicht gefunden' });
    const subj = subRes.rows[0];

    const catsRes = await req.pool.query('SELECT * FROM assessment_categories WHERE subject_id = $1 ORDER BY id', [subjectId]);
    const catIds = catsRes.rows.map(c => c.id);
    let grades = [];
    let column_metadata = [];
    if (catIds.length > 0) {
      // Pupils only see their own grades (and only visible ones)
      if (req.user.role === 'pupil') {
        const pupilRes = await req.pool.query('SELECT id FROM pupils WHERE user_id = $1', [req.user.id]);
        const pupilId = pupilRes.rows[0]?.id;
        if (!pupilId) {
          return res.status(403).json({ error: 'Pupil record not found' });
        }
        const gRes = await req.pool.query(
          'SELECT * FROM grades WHERE category_id = ANY($1::int[]) AND pupil_id = $2 AND is_visible = true ORDER BY date, id',
          [catIds, pupilId]
        );
        grades = gRes.rows;
      } else {
        const gRes = await req.pool.query('SELECT * FROM grades WHERE category_id = ANY($1::int[]) ORDER BY date, id', [catIds]);
        grades = gRes.rows;
      }
      const assRes = await req.pool.query('SELECT * FROM assessments WHERE category_id = ANY($1::int[])', [catIds]);
      column_metadata = assRes.rows;
    }
    const tagsRes = await req.pool.query('SELECT * FROM pupil_subject_tags WHERE subject_id = $1', [subjectId]);

    const categoriesWithMeta = catsRes.rows.map(c => ({
      ...c,
      column_metadata: column_metadata.filter(a => Number(a.category_id) === Number(c.id))
    }));

    res.json({
      subject: subj,
      categories: categoriesWithMeta,
      grades: grades,
      column_metadata: column_metadata,
      pupil_tags: tagsRes.rows
    });
  } catch (err) {
    console.error('Matrix load error:', err);
    res.status(500).json({ error: 'Matrix sync failed' });
  }
});

// POST /api/gradebook/category
router.post('/category', authenticateToken, async (req, res) => {
  const { subject_id, name, weight_percentage, scale_type, is_self_directed, default_deadline } = req.body;
  if (!subject_id || !name) return res.status(400).json({ error: 'Fehlende Kategorie-Parameter' });

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Hole alle existierenden Kategorien
    const existRes = await client.query(`
      SELECT * FROM assessment_categories WHERE subject_id = $1 ORDER BY id
    `, [Number(subject_id)]);
    const existingCats = existRes.rows;

    // 2. Bestimme das Ziel-Gewicht für die neue Kategorie
    let targetNewWeight = 20;
    if (existingCats.length === 0) {
      targetNewWeight = 100;
    } else {
      targetNewWeight = weight_percentage !== undefined ? Number(weight_percentage) : 20;
      targetNewWeight = Math.min(100, Math.max(1, targetNewWeight));
    }

    // 3. Proportionales Auto-Scaling der bisherigen Kategorien
    if (existingCats.length > 0) {
      const remainingTarget = 100 - targetNewWeight;
      let scaledSum = 0;
      const scaledCats = existingCats.map(c => {
        const w = Math.round(Number(c.weight_percentage) * (1 - targetNewWeight / 100));
        scaledSum += w;
        return { ...c, scaledWeight: w };
      });

      const diff = remainingTarget - scaledSum;
      if (diff !== 0 && scaledCats.length > 0) {
        let maxIdx = 0;
        let maxW = -1;
        scaledCats.forEach((c, idx) => {
          if (Number(c.weight_percentage) > maxW) {
            maxW = Number(c.weight_percentage);
            maxIdx = idx;
          }
        });
        scaledCats[maxIdx].scaledWeight += diff;
        if (scaledCats[maxIdx].scaledWeight < 0) scaledCats[maxIdx].scaledWeight = 0;
      }

      for (const c of scaledCats) {
        await client.query(`
          UPDATE assessment_categories SET weight_percentage = $1 WHERE id = $2
        `, [c.scaledWeight, c.id]);
      }
    }

    // 4. Füge die neue Kategorie ein
    const insertRes = await client.query(`
      INSERT INTO assessment_categories (subject_id, name, weight_percentage, scale_type, is_self_directed)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [Number(subject_id), name.trim(), targetNewWeight, scale_type || 'numeric_1_5', !!is_self_directed]);
    const newCat = { ...insertRes.rows[0], column_metadata: [] };


    // 5. Hole die finale aktualisierte Liste für den Socket.IO Broadcast
    const finalCatsRes = await client.query(`
      SELECT * FROM assessment_categories WHERE subject_id = $1 ORDER BY id
    `, [Number(subject_id)]);

    await client.query('COMMIT');

    // 6. Sende subject_updated Event an alle Clients zur synchronen UI-Darstellung
    req.io.emit('subject_updated', {
      subject_id: Number(subject_id),
      categories: finalCatsRes.rows
    });
    
    // Zusätzliche Abwärtskompatibilitäts-Events
    req.io.emit('category_created', newCat);
    req.io.emit('category_weights_updated', {
      subject_id: Number(subject_id),
      weights: finalCatsRes.rows.map(c => ({ id: c.id, weight_percentage: c.weight_percentage }))
    });

    res.json({ ...newCat, updatedCategories: finalCatsRes.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add category auto-scaling error:', err);
    res.status(500).json({ error: 'Kategorie mit Auto-Scaling konnte nicht instanziiert werden' });
  } finally {
    client.release();
  }
});

// DELETE /api/gradebook/category/:id
router.delete('/category/:id', authenticateToken, async (req, res) => {
  try {
    await req.pool.query('DELETE FROM assessment_categories WHERE id = $1', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Löschen der Kategorie fehlgeschlagen' });
  }
});

// POST /api/gradebook/grade (singular mapping support)
router.post('/grade', authenticateToken, async (req, res) => {
  const { category_id, pupil_id, assessment_name, grade_value, is_visible } = req.body;
  if (!category_id || !pupil_id || !assessment_name) return res.status(400).json({ error: 'Missing cell metrics' });

  try {
    if (grade_value === '' || grade_value === null || grade_value === undefined) {
      await req.pool.query('DELETE FROM grades WHERE category_id = $1 AND pupil_id = $2 AND assessment_name = $3', 
        [Number(category_id), Number(pupil_id), assessment_name.trim()]);
      return res.json({ deleted: true });
    }

    const checkRes = await req.pool.query('SELECT id FROM grades WHERE category_id = $1 AND pupil_id = $2 AND assessment_name = $3',
      [Number(category_id), Number(pupil_id), assessment_name.trim()]);

    let saved;
    const visibility = is_visible !== undefined ? is_visible : true;
    if (checkRes.rows.length > 0) {
      const upRes = await req.pool.query('UPDATE grades SET grade_value = $1, is_visible = $2, date = NOW() WHERE id = $3 RETURNING *',
        [String(grade_value).trim(), visibility, checkRes.rows[0].id]);
      saved = upRes.rows[0];
    } else {
      const insRes = await req.pool.query('INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, is_visible) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [Number(category_id), Number(pupil_id), assessment_name.trim(), String(grade_value).trim(), visibility]);
      saved = insRes.rows[0];
    }
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Cell upsert processing failed' });
  }
});

// POST /api/gradebook/tag — with rank-change auto-audit logging (Fix 2)
router.post('/tag', authenticateToken, async (req, res) => {
  const { subject_id, pupil_id, tier_tag } = req.body;
  if (!subject_id || !pupil_id) return res.status(400).json({ error: 'Missing IDs' });

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch subject name for audit note text
    const subRes = await client.query('SELECT name FROM subjects WHERE id = $1', [Number(subject_id)]);
    const subjectName = subRes.rows.length > 0 ? subRes.rows[0].name : 'Fach';

    // Fetch previous tag to detect rank direction
    const oldRes = await client.query(
      'SELECT tier_tag FROM pupil_subject_tags WHERE pupil_id = $1 AND subject_id = $2',
      [Number(pupil_id), Number(subject_id)]
    );
    const oldTag = oldRes.rows.length > 0 ? oldRes.rows[0].tier_tag : null;
    const oldWeight = getRankWeight(oldTag);
    const newWeight = tier_tag && tier_tag !== 'none' ? getRankWeight(tier_tag) : 0;
    const cleanNewTag = tier_tag && tier_tag !== 'none' ? tier_tag : 'Keiner';
    const cleanOldTag = oldTag || 'Keiner';

    // Upsert or delete tag
    if (!tier_tag || tier_tag === 'none') {
      await client.query(
        'DELETE FROM pupil_subject_tags WHERE pupil_id = $1 AND subject_id = $2',
        [Number(pupil_id), Number(subject_id)]
      );
    } else {
      await client.query(`
        INSERT INTO pupil_subject_tags (pupil_id, subject_id, tier_tag) VALUES ($1, $2, $3)
        ON CONFLICT (pupil_id, subject_id) DO UPDATE SET tier_tag = $3
      `, [Number(pupil_id), Number(subject_id), tier_tag]);
    }

    // Auto-insert disciplinary audit note when rank changes
    if (oldWeight !== newWeight) {
      const isUpgrade = newWeight > oldWeight;
      const sentiment = isUpgrade ? 'positive' : 'negative';
      const autoSource = isUpgrade ? 'rank_upgrade' : 'rank_downgrade';
      const emoji = isUpgrade ? '⬆️' : '⬇️';
      const noteText = `${emoji} Rang in ${subjectName}: ${cleanOldTag} → ${cleanNewTag}`;

      const noteRes = await client.query(`
        INSERT INTO disciplinary_notes (pupil_id, teacher_id, note_text, sentiment, is_visible_to_pupil, auto_source)
        VALUES ($1, $2, $3, $4, true, $5)
        RETURNING id, pupil_id, note_text, sentiment, auto_source, created_at
      `, [Number(pupil_id), req.user.id, noteText, sentiment, autoSource]);

      req.io.emit('note_created', noteRes.rows[0]);
    }

    await client.query('COMMIT');

    req.io.emit('pupil_subject_tag_updated', {
      subject_id: Number(subject_id),
      pupil_id: Number(pupil_id),
      tier_tag: tier_tag && tier_tag !== 'none' ? tier_tag : null
    });

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Tag assignment error:', err);
    res.status(500).json({ error: 'Tag assignment failed' });
  } finally {
    client.release();
  }
});

// DELETE /api/gradebook/subjects/:id
router.delete('/subjects/:id', authenticateToken, async (req, res) => {
  const subjectId = Number(req.params.id);
  try {
    await req.pool.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete subject error:', err);
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

// GET /api/gradebook/grades
router.get('/grades', authenticateToken, async (req, res) => {
  const subjectId = Number(req.query.subject_id);
  if (!subjectId) return res.status(400).json({ error: 'subject_id parameter required' });

  try {
    // Join category to verify linkage
    let queryStr = `
      SELECT g.id, g.category_id, g.pupil_id, g.assessment_name, g.grade_value, g.is_visible, g.date
      FROM grades g
      JOIN assessment_categories c ON g.category_id = c.id
      WHERE c.subject_id = $1
    `;
    if (req.user.role === 'pupil') {
      // Find pupil mapping
      const pRes = await req.pool.query('SELECT id FROM pupils WHERE user_id = $1', [req.user.id]);
      const targetPupilId = pRes.rows.length > 0 ? pRes.rows[0].id : 0;
      queryStr += ` AND g.pupil_id = ${Number(targetPupilId)} AND g.is_visible = true`;
    }
    queryStr += ` ORDER BY g.date, g.id`;

    const gradesRes = await req.pool.query(queryStr, [subjectId]);
    res.json(gradesRes.rows);
  } catch (err) {
    console.error('Fetch grades error:', err);
    res.status(500).json({ error: 'Failed to fetch grade cells' });
  }
});

// POST /api/gradebook/grades
router.post('/grades', authenticateToken, async (req, res) => {
  const { category_id, pupil_id, assessment_name, grade_value, is_visible } = req.body;
  if (!category_id || !pupil_id || !assessment_name) {
    return res.status(400).json({ error: 'Missing evaluation parameters' });
  }

  try {
    if (grade_value === '' || grade_value === null || grade_value === undefined) {
      // DELETE row if exists
      await req.pool.query(`
        DELETE FROM grades 
        WHERE category_id = $1 AND pupil_id = $2 AND assessment_name = $3
      `, [Number(category_id), Number(pupil_id), assessment_name.trim()]);
      return res.json({ deleted: true });
    }

    // Check if entry exists
    const checkRes = await req.pool.query(`
      SELECT id FROM grades WHERE category_id = $1 AND pupil_id = $2 AND assessment_name = $3
    `, [Number(category_id), Number(pupil_id), assessment_name.trim()]);

    let savedGrade;
    const visibility = is_visible !== undefined ? is_visible : true;

    if (checkRes.rows.length > 0) {
      const updateRes = await req.pool.query(`
        UPDATE grades SET grade_value = $1, is_visible = $2, date = NOW()
        WHERE id = $3 RETURNING *
      `, [String(grade_value).trim(), visibility, checkRes.rows[0].id]);
      savedGrade = updateRes.rows[0];
    } else {
      const insertRes = await req.pool.query(`
        INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, is_visible)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
      `, [Number(category_id), Number(pupil_id), assessment_name.trim(), String(grade_value).trim(), visibility]);
      savedGrade = insertRes.rows[0];
    }

    res.json(savedGrade);
  } catch (err) {
    console.error('Save grade error:', err);
    res.status(500).json({ error: 'Failed to record cell evaluation' });
  }
});

// PUT /api/gradebook/rename-column
router.put('/rename-column', authenticateToken, async (req, res) => {
  const { category_id, old_name, new_name } = req.body;
  if (!category_id || !old_name || !new_name) return res.status(400).json({ error: 'Incomplete parameters' });

  try {
    await req.pool.query(`
      UPDATE grades SET assessment_name = $1
      WHERE category_id = $2 AND assessment_name = $3
    `, [new_name.trim(), Number(category_id), old_name.trim()]);
    res.json({ success: true });
  } catch (err) {
    console.error('Rename column error:', err);
    res.status(500).json({ error: 'Batch renaming failed' });
  }
});

// PUT /api/gradebook/subjects/:id/toggle-projection
router.put('/subjects/:id/toggle-projection', authenticateToken, async (req, res) => {
  try {
    await req.pool.query(`
      UPDATE subjects SET projection_visible = NOT projection_visible WHERE id = $1
    `, [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update projection preferences' });
  }
});

// PUT /api/gradebook/grades/:id/toggle-visibility
router.put('/grades/:id/toggle-visibility', authenticateToken, async (req, res) => {
  try {
    const resUpdate = await req.pool.query(`
      UPDATE grades SET is_visible = NOT is_visible WHERE id = $1 RETURNING is_visible
    `, [Number(req.params.id)]);
    res.json({ success: true, is_visible: resUpdate.rows[0]?.is_visible });
  } catch (err) {
    res.status(500).json({ error: 'Failed to modify cell visibility switch' });
  }
});

// PUT /api/gradebook/subjects/:subject_id/pupils/:pupil_id/tag
router.put('/subjects/:subject_id/pupils/:pupil_id/tag', authenticateToken, async (req, res) => {
  const subjectId = Number(req.params.subject_id);
  const pupilId = Number(req.params.pupil_id);
  const { tier_tag } = req.body;

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch Subject Details
    const subRes = await client.query('SELECT name FROM subjects WHERE id = $1', [subjectId]);
    const subjectName = subRes.rows.length > 0 ? subRes.rows[0].name : 'Fach';

    // Fetch existing tag row to detect upgrades vs downgrades
    const oldRes = await client.query('SELECT tier_tag FROM pupil_subject_tags WHERE pupil_id = $1 AND subject_id = $2', [pupilId, subjectId]);
    const oldTag = oldRes.rows.length > 0 ? oldRes.rows[0].tier_tag : 'Keiner';
    const oldWeight = getRankWeight(oldTag);
    const newWeight = tier_tag && tier_tag !== 'none' ? getRankWeight(tier_tag) : 0;
    const cleanNewTag = tier_tag && tier_tag !== 'none' ? tier_tag : 'Keiner';

    if (!tier_tag || tier_tag === 'none') {
      await client.query('DELETE FROM pupil_subject_tags WHERE pupil_id = $1 AND subject_id = $2', [pupilId, subjectId]);
    } else {
      await client.query(`
        INSERT INTO pupil_subject_tags (pupil_id, subject_id, tier_tag)
        VALUES ($1, $2, $3)
        ON CONFLICT (pupil_id, subject_id) DO UPDATE SET tier_tag = $3
      `, [pupilId, subjectId, tier_tag]);
    }

    // Auto-insert disciplinary note if rank changed meaningfully
    if (oldWeight !== newWeight) {
      let sentiment = 'neutral';
      let autoSource = null;
      let textPattern = '';

      if (newWeight > oldWeight) {
        sentiment = 'positive';
        autoSource = 'rank_upgrade';
        textPattern = `⬆️ Rang in ${subjectName}: ${oldTag} → ${cleanNewTag}`;
      } else {
        sentiment = 'negative';
        autoSource = 'rank_downgrade';
        textPattern = `⬇️ Rang in ${subjectName}: ${oldTag} → ${cleanNewTag}`;
      }

      const noteRes = await client.query(`
        INSERT INTO disciplinary_notes (pupil_id, teacher_id, note_text, sentiment, is_visible_to_pupil, auto_source)
        VALUES ($1, $2, $3, $4, true, $5)
        RETURNING id, pupil_id, note_text, sentiment, auto_source, created_at
      `, [pupilId, req.user.id, textPattern, sentiment, autoSource]);

      // Emit note live
      req.io.emit('note_created', noteRes.rows[0]);
    }

    await client.query('COMMIT');

    // Emit live tag synchronization broadcast
    req.io.emit('pupil_subject_tag_updated', {
      subject_id: subjectId,
      pupil_id: pupilId,
      tier_tag: tier_tag && tier_tag !== 'none' ? tier_tag : null
    });

    res.json({ success: true, tier_tag: tier_tag && tier_tag !== 'none' ? tier_tag : null });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Tag assignment error:', err);
    res.status(500).json({ error: 'Failed to assign mastery certification tier' });
  } finally {
    client.release();
  }
});

// PUT /api/gradebook/subjects/:id/co-teacher
router.put('/subjects/:id/co-teacher', authenticateToken, async (req, res) => {
  const subjectId = Number(req.params.id);
  const { second_teacher_id } = req.body;
  const coId = second_teacher_id !== null && second_teacher_id !== undefined ? Number(second_teacher_id) : null;

  try {
    // Only primary teacher can configure
    const subRes = await req.pool.query('SELECT teacher_id FROM subjects WHERE id = $1', [subjectId]);
    if (subRes.rows.length === 0) return res.status(404).json({ error: 'Subject not found' });
    if (req.user.role !== 'admin' && Number(subRes.rows[0].teacher_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Only the principal instructor can appoint a co-teacher' });
    }

    await req.pool.query('UPDATE subjects SET second_teacher_id = $1 WHERE id = $2', [coId, subjectId]);
    res.json({ success: true, second_teacher_id: coId });
  } catch (err) {
    console.error('Co-teacher assignment error:', err);
    res.status(500).json({ error: 'Failed to delegate co-instructor access' });
  }
});

// PUT /api/gradebook/weights
router.put('/weights', authenticateToken, async (req, res) => {
  const { subject_id, weights } = req.body;
  if (!subject_id || !Array.isArray(weights)) return res.status(400).json({ error: 'Invalid batch weight payload' });

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of weights) {
      if (item.id !== undefined && item.weight_percentage !== undefined) {
        await client.query(`
          UPDATE assessment_categories 
          SET weight_percentage = $1 
          WHERE id = $2 AND subject_id = $3
        `, [Number(item.weight_percentage), Number(item.id), Number(subject_id)]);
      }
    }
    await client.query('COMMIT');
    
    // Broadcast updated batch state to instantly recalculate partner UIs in real-time
    req.io.emit('category_weights_updated', { subject_id: Number(subject_id), weights });
    
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Batch weight update error:', err);
    res.status(500).json({ error: 'Failed to synchronously distribute batch category weights' });
  } finally {
    client.release();
  }
});

// PUT /api/gradebook/category-scale
router.put('/category-scale', authenticateToken, async (req, res) => {
  const { category_id, scale_type } = req.body;
  if (!category_id || !scale_type) return res.status(400).json({ error: 'Incomplete scale specifications' });

  try {
    await req.pool.query(`
      UPDATE assessment_categories SET scale_type = $1 WHERE id = $2
    `, [scale_type, Number(category_id)]);
    
    req.io.emit('category_scale_updated', { category_id: Number(category_id), scale_type });
    res.json({ success: true, scale_type });
  } catch (err) {
    console.error('Scale configuration error:', err);
    res.status(500).json({ error: 'Failed to update evaluation continuum scale' });
  }
});

// PUT /api/gradebook/column-visibility
router.put('/column-visibility', authenticateToken, async (req, res) => {
  const { category_id, assessment_name, is_visible } = req.body;
  if (!category_id || !assessment_name) return res.status(400).json({ error: 'Incomplete parameters' });

  try {
    await req.pool.query(`
      UPDATE grades SET is_visible = $1 
      WHERE category_id = $2 AND assessment_name = $3
    `, [Boolean(is_visible), Number(category_id), assessment_name.trim()]);
    
    req.io.emit('column_visibility_updated', { category_id: Number(category_id), assessment_name: assessment_name.trim(), is_visible: Boolean(is_visible) });
    res.json({ success: true });
  } catch (err) {
    console.error('Column visibility error:', err);
    res.status(500).json({ error: 'Batch visibility mutation failed' });
  }
});

// PUT /api/gradebook/cell-visibility
router.put('/cell-visibility', authenticateToken, async (req, res) => {
  const { category_id, pupil_id, assessment_name, is_visible } = req.body;
  if (!category_id || !pupil_id || !assessment_name) return res.status(400).json({ error: 'Missing cell identifiers' });

  try {
    // Upsert placeholder row if cell was blank, ensuring absolute state match
    const checkRes = await req.pool.query(`
      SELECT id FROM grades 
      WHERE category_id = $1 AND pupil_id = $2 AND assessment_name = $3
    `, [Number(category_id), Number(pupil_id), assessment_name.trim()]);

    if (checkRes.rows.length > 0) {
      await req.pool.query(`
        UPDATE grades SET is_visible = $1 WHERE id = $2
      `, [Boolean(is_visible), checkRes.rows[0].id]);
    } else {
      await req.pool.query(`
        INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, is_visible)
        VALUES ($1, $2, $3, null, $4)
      `, [Number(category_id), Number(pupil_id), assessment_name.trim(), Boolean(is_visible)]);
    }

    req.io.emit('cell_visibility_updated', { category_id: Number(category_id), pupil_id: Number(pupil_id), assessment_name: assessment_name.trim(), is_visible: Boolean(is_visible) });
    res.json({ success: true });
  } catch (err) {
    console.error('Cell visibility error:', err);
    res.status(500).json({ error: 'Individual record toggle failed' });
  }
});

// POST /api/gradebook/import-batch
router.post('/import-batch', authenticateToken, async (req, res) => {
  const { subject_id, export_timestamp, force_overwrite, deltas } = req.body;
  if (!subject_id || !Array.isArray(deltas)) {
    return res.status(400).json({ error: 'Ungültige Import-Struktur' });
  }

  const client = await req.pool.connect();
  try {
    await client.query('BEGIN');

    // Verify ownership access permissions
    const subRes = await client.query('SELECT teacher_id, second_teacher_id FROM subjects WHERE id = $1', [Number(subject_id)]);
    if (subRes.rows.length === 0) throw new Error('Fach nicht gefunden');
    const subjMeta = subRes.rows[0];
    const isPrincipalOrCo = Number(subjMeta.teacher_id) === Number(req.user.id) || Number(subjMeta.second_teacher_id) === Number(req.user.id);
    if (req.user.role !== 'admin' && !isPrincipalOrCo) {
      throw new Error('Nur registrierte Lehrkräfte dürfen Offline-Tabellen synchronisieren');
    }

    // Retrieve relevant categories to isolate synchronization boundary
    const catsRes = await client.query('SELECT id FROM assessment_categories WHERE subject_id = $1', [Number(subject_id)]);
    const catIds = catsRes.rows.map(c => Number(c.id));

    // --- Server-Side Optimistic Locking Protection ---
    if (catIds.length > 0 && export_timestamp && !force_overwrite) {
      const maxDateRes = await client.query(`
        SELECT MAX(date) as max_date FROM grades WHERE category_id = ANY($1::int[])
      `, [catIds]);

      if (maxDateRes.rows[0]?.max_date) {
        const latestDbTime = new Date(maxDateRes.rows[0].max_date).getTime();
        const exportTime = new Date(export_timestamp).getTime();
        
        // If server state is newer by more than 1 second margin, trigger locking block
        if (latestDbTime > exportTime + 1000) {
          await client.query('ROLLBACK');
          return res.status(409).json({ 
            isLockConflict: true, 
            error: 'Simultane Online-Bearbeitung erkannt. Automatischer Abgleich blockiert zur Vermeidung von Datenkorruption.' 
          });
        }
      }
    }

    // --- Atomic Upsert Loop ---
    for (const d of deltas) {
      if (!d.category_id || !d.pupil_id || !d.assessment_name) continue;

      const cleanAssName = d.assessment_name.trim();
      const checkRes = await client.query(`
        SELECT id FROM grades 
        WHERE category_id = $1 AND pupil_id = $2 AND assessment_name = $3
      `, [Number(d.category_id), Number(d.pupil_id), cleanAssName]);

      if (d.grade_value === null || d.grade_value === undefined) {
        // If entry was erased inside Excel, delete database row
        if (checkRes.rows.length > 0) {
          await client.query('DELETE FROM grades WHERE id = $1', [checkRes.rows[0].id]);
        }
      } else {
        // Upsert grade value updating absolute state matching timestamp
        if (checkRes.rows.length > 0) {
          await client.query(`
            UPDATE grades SET grade_value = $1, date = NOW() WHERE id = $2
          `, [String(d.grade_value).trim(), checkRes.rows[0].id]);
        } else {
          await client.query(`
            INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, is_visible, date)
            VALUES ($1, $2, $3, $4, true, NOW())
          `, [Number(d.category_id), Number(d.pupil_id), cleanAssName, String(d.grade_value).trim()]);
        }
      }
    }

    await client.query('COMMIT');

    // Broadcast update boundary live
    req.io.emit('matrix_imported_batch', { subject_id: Number(subject_id) });
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Excel batch import processing failed:', err);
    res.status(500).json({ error: err.message || 'Atomarer Transaktions-Import gescheitert' });
  } finally {
    client.release();
  }
});

module.exports = router;
