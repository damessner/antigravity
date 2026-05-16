'use strict';

/**
 * WebUntis Integration API Routes
 *
 * Admin-only:
 *   GET  /api/webuntis/settings        — Retrieve WebUntis connection settings
 *   PUT  /api/webuntis/settings        — Save WebUntis connection settings
 *   POST /api/webuntis/sync            — Trigger a manual synchronisation
 *   GET  /api/webuntis/sync/status     — Last sync status & timestamp
 *
 * Teacher/Admin (read-only live data, proxied from WebUntis):
 *   GET  /api/webuntis/substitutions   — Today's substitutions (Vertretungsplan)
 *   GET  /api/webuntis/timetable/:classId — Weekly timetable for a class
 */

const express = require('express');
const router  = express.Router();
const { authenticateToken, setupLimiter, stateLimiter } = require('../server');
const { syncFromWebUntis, isSyncRunning } = require('../services/webuntisSyncService');
const WebUntisClient       = require('../services/webuntisClient');
const logger               = require('../utils/logger');
const { encryptSecret, decryptSecret } = require('../utils/secretStore');

const CTX = '[WebUntis API]';

// ─── Middleware ───────────────────────────────────────────────────────────────

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ error: 'Nur Administratoren erlaubt' });
};

const isTeacherOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'teacher')) return next();
  res.status(403).json({ error: 'Nur Lehrkräfte oder Administratoren erlaubt' });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Load all WebUntis settings from system_settings. */
async function loadSettings(pool) {
  const res = await pool.query(`
    SELECT key, value FROM system_settings
    WHERE key IN ('webuntis_school', 'webuntis_url', 'webuntis_username', 'webuntis_password',
                  'webuntis_last_sync', 'webuntis_sync_status', 'webuntis_sync_result')
  `);
  const s = {};
  res.rows.forEach(row => { s[row.key] = row.value; });

  if (s.webuntis_password) {
    const decoded = decryptSecret(s.webuntis_password);
    s.webuntis_password = decoded.value;
    if (decoded.wasPlaintext) {
      await pool.query(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('webuntis_password', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `, [encryptSecret(decoded.value)]);
    }
  }

  return s;
}

/** Create a temporary authenticated WebUntis client using stored settings. */
async function buildAuthClient(settings) {
  let { webuntis_school, webuntis_url, webuntis_username, webuntis_password } = settings;
  
  if (!webuntis_url || !webuntis_username || !webuntis_password) {
    throw new Error('WebUntis-Integration unvollständig (URL, Benutzername, Passwort erforderlich)');
  }

  // If school is missing, attempt auto-extraction from URL (Zero-Config support)
  if (!webuntis_school) {
    const schoolMatch = webuntis_url.match(/school=([^&]+)/i);
    if (schoolMatch && schoolMatch[1]) {
      webuntis_school = decodeURIComponent(schoolMatch[1]);
      logger.info(CTX, `Auto-extracted School ID for live session: ${webuntis_school}`);
    } else {
      throw new Error('WebUntis-Integration unvollständig (Schul-ID konnte nicht aus URL extrahiert werden)');
    }
  }

  const client = new WebUntisClient(webuntis_school, webuntis_url);
  await client.authenticate(webuntis_username, webuntis_password);
  return client;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/webuntis/settings
 * Returns the stored WebUntis settings. Password field is masked.
 */
router.get('/settings', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
  try {
    const s = await loadSettings(req.pool);
    res.json({
      webuntis_school:      s.webuntis_school      || '',
      webuntis_url:         s.webuntis_url         || '',
      webuntis_username:    s.webuntis_username     || '',
      webuntis_password:    s.webuntis_password ? '••••••••' : '',
      webuntis_last_sync:   s.webuntis_last_sync    || null,
      webuntis_sync_status: s.webuntis_sync_status  || 'never',
      webuntis_sync_result: s.webuntis_sync_result  ? JSON.parse(s.webuntis_sync_result) : null,
    });
  } catch (err) {
    logger.error(CTX, 'Fehler beim Laden der Einstellungen', err);
    res.status(500).json({ error: 'Einstellungen konnten nicht geladen werden' });
  }
});

/**
 * PUT /api/webuntis/settings
 * Save WebUntis connection settings.
 * If password is the masked placeholder, the existing password is preserved.
 */
router.put('/settings', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
  const { webuntis_school, webuntis_url, webuntis_username, webuntis_password } = req.body;

  if (!webuntis_url || !webuntis_username) {
    return res.status(400).json({ error: 'URL und Benutzername sind erforderlich' });
  }

  const upsert = async (key, value) => {
    await req.pool.query(`
      INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, [key, value]);
  };

  try {
    await upsert('webuntis_school',   (webuntis_school || '').trim());
    await upsert('webuntis_url',      webuntis_url.trim());
    await upsert('webuntis_username', webuntis_username.trim());

    // Only overwrite password if the user provided a real value (not the mask)
    if (webuntis_password && webuntis_password !== '••••••••') {
      await upsert('webuntis_password', encryptSecret(webuntis_password));
    }

    logger.info(CTX, `Einstellungen aktualisiert von ${req.user.username}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(CTX, 'Fehler beim Speichern der Einstellungen', err);
    res.status(500).json({ error: 'Einstellungen konnten nicht gespeichert werden' });
  }
});

/**
 * GET /api/webuntis/sync/status
 * Returns last sync timestamp, status and result counts.
 */
router.get('/sync/status', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
  try {
    const s = await loadSettings(req.pool);
    res.json({
      status:      s.webuntis_sync_status  || 'never',
      last_sync:   s.webuntis_last_sync    || null,
      result:      s.webuntis_sync_result  ? JSON.parse(s.webuntis_sync_result) : null,
      in_progress: isSyncRunning(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Status konnte nicht geladen werden' });
  }
});

/**
 * POST /api/webuntis/sync
 * Triggers a full synchronisation (admin only, non-blocking).
 * Runs in the background; use GET /sync/status to poll progress.
 */
router.post('/sync', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
  if (isSyncRunning()) {
    return res.status(409).json({ error: 'Synchronisation läuft bereits. Bitte warten.' });
  }

  let settings;
  try {
    const s = await loadSettings(req.pool);
    settings = {
      school:   s.webuntis_school    || '',
      url:      s.webuntis_url       || '',
      username: s.webuntis_username  || '',
      password: s.webuntis_password  || '',
    };
  } catch (err) {
    return res.status(500).json({ error: 'Einstellungen konnten nicht geladen werden' });
  }

  // Respond immediately — sync runs in background
  res.json({ success: true, message: 'Synchronisation gestartet' });

  syncFromWebUntis(req.pool, settings)
    .then(() => { logger.info(CTX, 'Hintergrund-Sync erfolgreich abgeschlossen'); })
    .catch((err) => { logger.error(CTX, 'Hintergrund-Sync fehlgeschlagen', err); });
});

/**
 * GET /api/webuntis/substitutions
 * Returns today's substitutions (Vertretungsplan) fetched live from WebUntis.
 */
router.get('/substitutions', stateLimiter, authenticateToken, isTeacherOrAdmin, async (req, res) => {
  let client;
  try {
    const settings = await loadSettings(req.pool);
    client = await buildAuthClient(settings);

    const today = WebUntisClient.toUntisDate(new Date());
    const subs  = await client.getSubstitutions(today, today);

    res.json({ date: today, substitutions: subs || [] });
  } catch (err) {
    const errMsg = err.message || '';
    if (errMsg.includes('-8509') || errMsg.includes('no right')) {
      logger.warn(CTX, 'Zugriff auf Vertretungen verweigert (Rechte fehlen in WebUntis)');
      return res.json({ date: WebUntisClient.toUntisDate(new Date()), substitutions: [], restricted: true });
    }
    logger.error(CTX, 'Fehler beim Laden der Vertretungen', err);
    res.status(502).json({ error: err.message || 'WebUntis nicht erreichbar' });
  } finally {
    if (client) await client.logout().catch(() => {});
  }
});

/**
 * GET /api/webuntis/timetable/:classId
 * Returns this week's timetable for a given DB class ID.
 * Looks up the WebUntis class ID via `webuntis_id` column.
 */
router.get('/timetable/:classId', stateLimiter, authenticateToken, isTeacherOrAdmin, async (req, res) => {
  const dbClassId = Number(req.params.classId);
  if (!dbClassId || Number.isNaN(dbClassId)) {
    return res.status(400).json({ error: 'Ungültige Klassen-ID' });
  }

  let client;
  try {
    // Look up WebUntis ID for this class
    const cr = await req.pool.query('SELECT webuntis_id, name FROM classes WHERE id = $1', [dbClassId]);
    if (cr.rows.length === 0) {
      return res.status(404).json({ error: 'Klasse nicht gefunden' });
    }
    const wuClassId = cr.rows[0].webuntis_id;
    if (!wuClassId) {
      return res.status(404).json({ error: 'Diese Klasse hat keine WebUntis-Verknüpfung' });
    }

    const settings = await loadSettings(req.pool);
    client = await buildAuthClient(settings);

    const startDate = WebUntisClient.toUntisDate(WebUntisClient.getWeekStart());
    const endDate   = WebUntisClient.toUntisDate(WebUntisClient.getWeekEnd());

    // type 1 = class timetable
    const timetable = await client.getTimetable(wuClassId, 1, startDate, endDate);

    res.json({
      classId:    dbClassId,
      className:  cr.rows[0].name,
      wuClassId,
      weekStart:  startDate,
      weekEnd:    endDate,
      timetable:  timetable || [],
    });
  } catch (err) {
    const errMsg = err.message || '';
    if (errMsg.includes('-8509') || errMsg.includes('no right') || errMsg.includes('-7004')) {
      logger.warn(CTX, `Zugriff auf Stundenplan für Klasse ${dbClassId} eingeschränkt: ${errMsg}`);
      return res.json({
        classId: dbClassId,
        className: 'Eingeschränkt',
        timetable: [],
        restricted: true
      });
    }
    logger.error(CTX, `Fehler beim Laden des Stundenplans für Klasse ${dbClassId}`, err);
    res.status(502).json({ error: err.message || 'WebUntis nicht erreichbar' });
  } finally {
    if (client) await client.logout().catch(() => {});
  }
});

module.exports = router;
