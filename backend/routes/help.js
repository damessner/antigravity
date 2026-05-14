const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../server');
const { sendNotification } = require('./push');

// GET /api/help/active
// Returns all requests WHERE status != 'resolved'. 
// Inner joins pupils and users to get full_name, class_id, and class_name.
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        hr.id,
        hr.pupil_id,
        hr.subject,
        hr.message,
        hr.status,
        hr.claimed_by_teacher_id,
        hr.teacher_comment,
        hr.created_at,
        p.class_id,
        u.full_name,
        u.full_name as pupil_name,
        c.name as class_name,
        t.full_name as teacher_name
      FROM help_requests hr
      JOIN pupils p ON hr.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      LEFT JOIN users t ON hr.claimed_by_teacher_id = t.id
      WHERE hr.status != 'resolved'
      ORDER BY hr.created_at ASC
    `;
    const result = await req.pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('[Help Dispatch] GET active error:', err);
    res.status(500).json({ error: 'Fehler beim Abrufen der Hilferufe' });
  }
});

// POST /api/help
// Pupil only dispatch source entry. Fails if already has an open or claimed request.
router.post('/', authenticateToken, async (req, res) => {
  if (req.user.role !== 'pupil') {
    return res.status(403).json({ error: 'Nur für Schülerkonten zugänglich' });
  }

  const { subject, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Fach und Nachricht sind zwingend erforderlich' });
  }

  try {
    // Resolve internal pupil id from logged-in user id
    const pRes = await req.pool.query('SELECT id, class_id FROM pupils WHERE user_id = $1', [Number(req.user.id)]);
    if (pRes.rows.length === 0) {
      return res.status(404).json({ error: 'Schülerprofil nicht gefunden' });
    }
    const targetPupil = pRes.rows[0];

    // Check constraint: fails if pupil already has status 'open' or 'claimed'
    const checkRes = await req.pool.query(`
      SELECT id FROM help_requests 
      WHERE pupil_id = $1 AND status IN ('open', 'claimed')
      LIMIT 1
    `, [Number(targetPupil.id)]);

    if (checkRes.rows.length > 0) {
      return res.status(409).json({ error: 'Es existiert bereits ein aktiver Hilferuf für diesen Schüler' });
    }

    const insertQuery = `
      INSERT INTO help_requests (pupil_id, subject, message, status)
      VALUES ($1, $2, $3, 'open')
      RETURNING *
    `;
    const inserted = await req.pool.query(insertQuery, [Number(targetPupil.id), subject.trim(), message.trim()]);
    const newRequest = inserted.rows[0];

    // Fetch full enriched data row to broadcast clean structure to teachers
    const enrichedQuery = `
      SELECT 
        hr.id, hr.pupil_id, hr.subject, hr.message, hr.status, hr.claimed_by_teacher_id, hr.teacher_comment, hr.created_at,
        p.class_id, u.full_name, u.full_name as pupil_name, c.name as class_name
      FROM help_requests hr
      JOIN pupils p ON hr.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      WHERE hr.id = $1
    `;
    const enrichedRes = await req.pool.query(enrichedQuery, [Number(newRequest.id)]);
    const broadcastPayload = enrichedRes.rows[0];

    // Emit real-time creation event globally
    if (req.io) {
      req.io.to('global_dashboard').emit('help_created', broadcastPayload);
    }

    // Trigger asynchronous target Push notifications for all authorized staff
    req.pool.query("SELECT id FROM users WHERE role IN ('teacher', 'admin')").then(staffRes => {
      const pupilNameTarget = broadcastPayload.pupil_name || 'Ein Schüler';
      const subjectTarget = broadcastPayload.subject || 'Fach';
      staffRes.rows.forEach(staff => {
        sendNotification(req.pool, staff.id, 'help_requests', {
          title: `🙋 Live-Hilferuf: ${pupilNameTarget}`,
          body: `Braucht Hilfe in ${subjectTarget}: "${broadcastPayload.message}"`,
          url: '/'
        }).catch(err => console.error('[Push Notification Trigger] Dispatch error:', err));
      });
    }).catch(err => console.error('[Push Notification Trigger] User scan database query error:', err));

    res.status(201).json(broadcastPayload);
  } catch (err) {
    console.error('[Help Dispatch] POST entry error:', err);
    res.status(500).json({ error: 'Fehler beim Erstellen der Hilfeanfrage' });
  }
});

// PUT /api/help/:id/claim
// Teacher only action setting status to claimed and updating optional commentary.
router.put('/:id/claim', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Nur für Lehrkräfte und Administratoren autorisiert' });
  }

  const { teacher_comment } = req.body;
  const requestId = Number(req.params.id);

  try {
    const updateQuery = `
      UPDATE help_requests
      SET 
        status = 'claimed',
        claimed_by_teacher_id = $1,
        teacher_comment = COALESCE($2, teacher_comment)
      WHERE id = $3
      RETURNING *
    `;
    const updated = await req.pool.query(updateQuery, [
      Number(req.user.id), 
      teacher_comment !== undefined ? teacher_comment : null, 
      requestId
    ]);

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Hilfeanfrage nicht gefunden' });
    }

    // Enrich payload with full teacher name
    const enrichedQuery = `
      SELECT 
        hr.id, hr.pupil_id, hr.subject, hr.message, hr.status, hr.claimed_by_teacher_id, hr.teacher_comment, hr.created_at,
        p.class_id, u.full_name, u.full_name as pupil_name, c.name as class_name, t.full_name as teacher_name
      FROM help_requests hr
      JOIN pupils p ON hr.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      LEFT JOIN users t ON hr.claimed_by_teacher_id = t.id
      WHERE hr.id = $1
    `;
    const resPayload = await req.pool.query(enrichedQuery, [requestId]);
    const broadcastPayload = resPayload.rows[0];

    if (req.io) {
      req.io.to('global_dashboard').emit('help_claimed', broadcastPayload);
    }

    res.json(broadcastPayload);
  } catch (err) {
    console.error('[Help Dispatch] PUT claim error:', err);
    res.status(500).json({ error: 'Fehler beim Übernehmen der Anfrage' });
  }
});

// PUT /api/help/:id/comment
// Teacher only dynamic comment updater on claimed records.
router.put('/:id/comment', authenticateToken, async (req, res) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Nur für Lehrkräfte und Administratoren autorisiert' });
  }

  const { teacher_comment } = req.body;
  const requestId = Number(req.params.id);

  try {
    const updateQuery = `
      UPDATE help_requests
      SET teacher_comment = $1
      WHERE id = $2 AND claimed_by_teacher_id = $3
      RETURNING *
    `;
    const updated = await req.pool.query(updateQuery, [teacher_comment || null, requestId, Number(req.user.id)]);

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Eintrag nicht gefunden oder Sie sind nicht der Betreuer' });
    }

    const enrichedQuery = `
      SELECT 
        hr.id, hr.pupil_id, hr.subject, hr.message, hr.status, hr.claimed_by_teacher_id, hr.teacher_comment, hr.created_at,
        p.class_id, u.full_name, u.full_name as pupil_name, c.name as class_name, t.full_name as teacher_name
      FROM help_requests hr
      JOIN pupils p ON hr.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      LEFT JOIN classes c ON p.class_id = c.id
      LEFT JOIN users t ON hr.claimed_by_teacher_id = t.id
      WHERE hr.id = $1
    `;
    const resPayload = await req.pool.query(enrichedQuery, [requestId]);
    const broadcastPayload = resPayload.rows[0];

    if (req.io) {
      req.io.to('global_dashboard').emit('help_updated', broadcastPayload);
    }

    res.json(broadcastPayload);
  } catch (err) {
    console.error('[Help Dispatch] PUT comment error:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Kommentars' });
  }
});

// PUT /api/help/:id/resolve
// Resolves active requests. Accessible by the authoring pupil or staff.
router.put('/:id/resolve', authenticateToken, async (req, res) => {
  const requestId = Number(req.params.id);

  try {
    // Ensure request ownership if role is pupil
    if (req.user.role === 'pupil') {
      const pRes = await req.pool.query('SELECT id FROM pupils WHERE user_id = $1', [Number(req.user.id)]);
      if (pRes.rows.length === 0) return res.status(404).json({ error: 'Schülerprofil nicht gefunden' });
      
      const targetPupilId = pRes.rows[0].id;
      const ownerCheck = await req.pool.query('SELECT id FROM help_requests WHERE id = $1 AND pupil_id = $2', [requestId, targetPupilId]);
      if (ownerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Keine Berechtigung zum Abschließen dieses Eintrags' });
      }
    }

    const resolveQuery = `
      UPDATE help_requests
      SET status = 'resolved'
      WHERE id = $1
      RETURNING id, pupil_id, status
    `;
    const resolved = await req.pool.query(resolveQuery, [requestId]);

    if (resolved.rows.length === 0) {
      return res.status(404).json({ error: 'Hilfeanfrage nicht gefunden' });
    }

    const payload = { id: requestId, status: 'resolved', pupil_id: resolved.rows[0].pupil_id };
    
    if (req.io) {
      req.io.to('global_dashboard').emit('help_resolved', payload);
    }

    res.json(payload);
  } catch (err) {
    console.error('[Help Dispatch] PUT resolve error:', err);
    res.status(500).json({ error: 'Fehler beim Abschließen der Anfrage' });
  }
});

module.exports = router;
