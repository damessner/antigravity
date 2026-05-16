/**
 * WebUntis Atomic Sync Service
 *
 * Performs a full, non-destructive read-only import from WebUntis into the
 * local Antigravity database:
 *
 *   1. Authenticate with WebUntis.
 *   2. Fetch all active classes → upsert into `classes` + auto-create rooms.
 *   3. Fetch all teachers       → upsert into `users` (role = teacher).
 *   4. Fetch all students       → upsert into `users` (role = pupil)
 *                                 + upsert into `pupils` (with class_id).
 *   5. Logout from WebUntis.
 *   6. Persist sync status & timestamp to `system_settings`.
 *
 * Soft-deletes: users/classes removed from WebUntis are marked is_active=false
 * rather than deleted, preserving historical data.
 *
 * This module is NEVER to be modified to write data back to WebUntis.
 */

'use strict';

const WebUntisClient = require('./webuntisClient');
const logger         = require('../utils/logger');
const { generateSecurePassword } = require('../utils/passwordGenerator');

const CTX = '[WebUntis Sync]';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a safe local username from WebUntis person data.
 * Format: `lastname.firstname` (lowercase, ASCII-safe).
 * Falls back to `wu_<webuntisId>` if name fields are empty.
 *
 * @param {object} person - WebUntis person object
 * @param {string} [prefix] - Optional prefix (e.g. "s_" for students to avoid
 *                            collisions with teacher usernames)
 * @returns {string}
 */
function buildUsername(person, prefix = '') {
  const last  = (person.longName  || person.name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const first = (person.foreName  || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (last && first) return `${prefix}${last}.${first}`;
  if (last)          return `${prefix}${last}`;
  return `${prefix}wu_${person.id}`;
}

/**
 * Build a display name from WebUntis person data.
 *
 * @param {object} person
 * @returns {string}
 */
function buildFullName(person) {
  const first = (person.foreName || '').trim();
  const last  = (person.longName || person.name || '').trim();
  if (first && last) return `${first} ${last}`;
  return last || first || `WebUntis #${person.id}`;
}

/**
 * Generate a random temporary password for newly created accounts.
 *
 * @returns {string}
 */
function generateTempPassword() {
  return generateSecurePassword('Wu');
}

const bcrypt = require('bcrypt');

// ─── Main Sync Function ───────────────────────────────────────────────────────

/**
 * Execute a full synchronisation cycle.
 *
 * @param {import('pg').Pool} pool         - Active PostgreSQL pool.
 * @param {object}            settings     - WebUntis connection settings.
 * @param {string}            settings.school    - School identifier.
 * @param {string}            settings.url       - Base URL.
 * @param {string}            settings.username  - Login username.
 * @param {string}            settings.password  - Login password.
 * @returns {Promise<{success: boolean, counts: object, error?: string}>}
 */
async function runSync(pool, settings) {
  const { school, url, username, password } = settings;

  if (!url || !username || !password) {
    throw new Error('WebUntis Konfiguration unvollständig (url, username, password erforderlich)');
  }

  const client  = new WebUntisClient(school, url);
  const counts  = { classes: 0, rooms: 0, teachers: 0, pupils: 0, deactivated: 0 };
  const errors  = [];

  logger.info(CTX, `Starte Synchronisation mit ${url} (Schule: ${school})`);

  // ── 1. Authenticate ────────────────────────────────────────────────────────
  await client.authenticate(username, password);
  logger.info(CTX, 'WebUntis-Authentifizierung erfolgreich');

  try {
    // ── 2. Fetch & Upsert Classes + Rooms ─────────────────────────────────────
    const wuClasses = await client.getClasses();
    logger.info(CTX, `${wuClasses.length} Klassen von WebUntis empfangen`);

    const activeClassIds = [];

    for (const wc of wuClasses) {
      if (!wc.active && wc.active !== undefined) continue;
      activeClassIds.push(wc.id);

      const className = (wc.name || '').trim();
      if (!className) continue;

      // Upsert class
      const classRes = await pool.query(`
        INSERT INTO classes (name, webuntis_id)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE SET webuntis_id = EXCLUDED.webuntis_id
        RETURNING id
      `, [className, wc.id]);
      counts.classes++;

      const classId = classRes.rows[0].id;

      // Auto-create a corresponding room (Class-as-a-Room logic)
      await pool.query(`
        INSERT INTO rooms (name) VALUES ($1)
        ON CONFLICT (name) DO NOTHING
      `, [`Klassenzimmer - ${className}`]);
      counts.rooms++;

      // Store the DB class_id mapping for later use when linking pupils
      wc._dbClassId = classId;
    }

    // Build a lookup: WebUntis class ID → DB class ID
    const classIdMap = {};
    for (const wc of wuClasses) {
      if (wc._dbClassId) classIdMap[wc.id] = wc._dbClassId;
    }

    // ── 3. Fetch & Upsert Teachers ─────────────────────────────────────────────
    const wuTeachers = await client.getTeachers();
    logger.info(CTX, `${wuTeachers.length} Lehrer von WebUntis empfangen`);

    const activeTeacherWebuntisIds = [];

    for (const wt of wuTeachers) {
      if (!wt.active && wt.active !== undefined) continue;
      activeTeacherWebuntisIds.push(wt.id);

      const username_  = buildUsername(wt);
      const fullName   = buildFullName(wt);

      // Check if this WebUntis teacher already exists
      const existing = await pool.query(
        'SELECT id, username FROM users WHERE webuntis_id = $1 AND role = $2',
        [wt.id, 'teacher']
      );

      if (existing.rows.length > 0) {
        // Update name only — never touch password or role
        await pool.query(
          'UPDATE users SET full_name = $1, is_active = true, deactivated_at = NULL, erasure_due_at = NULL WHERE id = $2',
          [fullName, existing.rows[0].id]
        );
      } else {
        // Create new teacher account
        let safeUsername = username_;
        // Ensure uniqueness: append webuntis ID suffix if username is taken
        const taken = await pool.query('SELECT id FROM users WHERE username = $1', [safeUsername]);
        if (taken.rows.length > 0) {
          safeUsername = `${username_}_${wt.id}`;
        }
        const tempPw   = generateTempPassword();
        const pwHash   = await bcrypt.hash(tempPw, 10);
        await pool.query(`
          INSERT INTO users (username, full_name, role, password_hash, requires_password_change, webuntis_id, is_active)
          VALUES ($1, $2, 'teacher', $3, true, $4, true)
        `, [safeUsername, fullName, pwHash, wt.id]);
      }

      counts.teachers++;
    }

    // ── 4. Fetch & Upsert Students / Pupils ──────────────────────────────────
    const wuStudents = await client.getStudents();
    logger.info(CTX, `${wuStudents.length} Schüler von WebUntis empfangen`);

    const activeStudentWebuntisIds = [];

    for (const ws of wuStudents) {
      if (!ws.active && ws.active !== undefined) continue;
      activeStudentWebuntisIds.push(ws.id);

      const username_  = buildUsername(ws, 's.');
      const fullName   = buildFullName(ws);
      let userId;

      // Resolve class_id from class references in student record (prefer IDs, fallback to name)
      let dbClassId = null;
      const studentClassIds = Array.isArray(ws.klassen)
        ? ws.klassen.map(k => Number(k?.id)).filter(Number.isFinite)
        : [];
      for (const classId of studentClassIds) {
        if (classIdMap[classId]) {
          dbClassId = classIdMap[classId];
          break;
        }
      }

      const studentClassName = (ws.klasseName || ws.klassen?.[0]?.name || '').trim();
      if (dbClassId === null && studentClassName) {
        const cr = await pool.query('SELECT id FROM classes WHERE name = $1', [studentClassName]);
        if (cr.rows.length > 0) dbClassId = cr.rows[0].id;
      }

      // Check if this WebUntis student already exists
      const existing = await pool.query(
        'SELECT u.id, p.id AS pupil_id FROM users u LEFT JOIN pupils p ON p.user_id = u.id WHERE u.webuntis_id = $1 AND u.role = $2',
        [ws.id, 'pupil']
      );

      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        await pool.query(
          'UPDATE users SET full_name = $1, is_active = true, deactivated_at = NULL, erasure_due_at = NULL WHERE id = $2',
          [fullName, userId]
        );

        // Keep class assignment in sync when a class mapping exists
        if (existing.rows[0].pupil_id && dbClassId !== null) {
          await pool.query(
            'UPDATE pupils SET class_id = $1 WHERE id = $2',
            [dbClassId, existing.rows[0].pupil_id]
          );
        }
      } else {
        // Create new pupil user account
        let safeUsername = username_;
        const taken = await pool.query('SELECT id FROM users WHERE username = $1', [safeUsername]);
        if (taken.rows.length > 0) {
          safeUsername = `${username_}_${ws.id}`;
        }
        const tempPw = generateTempPassword();
        const pwHash = await bcrypt.hash(tempPw, 10);
        const uRes   = await pool.query(`
          INSERT INTO users (username, full_name, role, password_hash, requires_password_change, webuntis_id, is_active)
          VALUES ($1, $2, 'pupil', $3, true, $4, true)
          RETURNING id
        `, [safeUsername, fullName, pwHash, ws.id]);
        userId = uRes.rows[0].id;
      }

      // Upsert pupils record — but keep class_id as NULL if it's a new pupil, unless manually assigned
      await pool.query(`
        INSERT INTO pupils (user_id, class_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE
          SET class_id = COALESCE(EXCLUDED.class_id, pupils.class_id)
      `, [userId, dbClassId]);

      counts.pupils++;
    }

    // ── 5. Sync Subjects & Pupil-Subject Assignments (DISABLED) ──
    /*
    const wuSubjects = await client.getSubjects();
    ...
    */
    logger.info(CTX, `Subjekt-Synchronisation deaktiviert (Manueller Modus aktiv).`);

    // ── 6. Soft-Delete Users Removed from WebUntis ────────────────────────────
    const retentionRes = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'data_retention_days' LIMIT 1"
    );
    const retentionDaysRaw = Number(retentionRes.rows[0]?.value || 90);
    const retentionDays = Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0 ? retentionDaysRaw : 90;

    if (activeTeacherWebuntisIds.length > 0) {
      const deactivated = await pool.query(`
        UPDATE users
        SET is_active = false,
            deactivated_at = COALESCE(deactivated_at, NOW()),
            erasure_due_at = COALESCE(erasure_due_at, NOW() + ($2 || ' days')::interval)
        WHERE role = 'teacher'
          AND webuntis_id IS NOT NULL
          AND webuntis_id != ALL($1::int[])
        RETURNING id
      `, [activeTeacherWebuntisIds, String(retentionDays)]);
      counts.deactivated += deactivated.rowCount;
    }
    if (activeStudentWebuntisIds.length > 0) {
      const deactivated = await pool.query(`
        UPDATE users
        SET is_active = false,
            deactivated_at = COALESCE(deactivated_at, NOW()),
            erasure_due_at = COALESCE(erasure_due_at, NOW() + ($2 || ' days')::interval)
        WHERE role = 'pupil'
          AND webuntis_id IS NOT NULL
          AND webuntis_id != ALL($1::int[])
        RETURNING id
      `, [activeStudentWebuntisIds, String(retentionDays)]);
      counts.deactivated += deactivated.rowCount;
    }

    logger.info(CTX, `Sync abgeschlossen: ${JSON.stringify(counts)}`);

  } finally {
    // Always logout, even on error
    await client.logout().catch((e) => logger.warn(CTX, `Logout-Fehler (non-fatal): ${e.message}`));
  }

  return { success: true, counts };
}

// ─── Persist sync result to system_settings ──────────────────────────────────

/**
 * Save sync status (timestamp, status, result) to system_settings.
 *
 * @param {import('pg').Pool} pool
 * @param {'success'|'error'|'running'} status
 * @param {object|null} result
 */
async function saveSyncStatus(pool, status, result) {
  const pairs = [
    ['webuntis_sync_status', status],
    ['webuntis_last_sync',   new Date().toISOString()],
    ['webuntis_sync_result', JSON.stringify(result || {})],
  ];
  for (const [key, value] of pairs) {
    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, [key, value]);
  }
}

/**
 * Top-level entry point. Runs the full sync and persists status.
 *
 * @param {import('pg').Pool} pool
 * @param {object} settings
 * @returns {Promise<{success: boolean, counts?: object, error?: string}>}
 */
async function syncFromWebUntis(pool, settings) {
  if (syncLockActive) {
    const err = new Error('Synchronisation läuft bereits');
    err.code = 'SYNC_IN_PROGRESS';
    throw err;
  }
  syncLockActive = true;

  await saveSyncStatus(pool, 'running', null).catch(() => {});
  try {
    const result = await runSync(pool, settings);
    await saveSyncStatus(pool, 'success', result.counts);
    return result;
  } catch (err) {
    logger.error(CTX, 'Sync fehlgeschlagen', err);
    await saveSyncStatus(pool, 'error', { error: err.message }).catch(() => {});
    throw err;
  } finally {
    syncLockActive = false;
  }
}

let syncLockActive = false;
function isSyncRunning() {
  return syncLockActive;
}

module.exports = { syncFromWebUntis, saveSyncStatus, isSyncRunning };
