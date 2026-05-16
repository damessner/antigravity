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

      // Resolve class_id from class name in the student record
      let dbClassId = null;
      const studentClassName = (ws.klasseName || ws.klassen?.[0]?.name || '').trim();
      if (studentClassName) {
        const cr = await pool.query('SELECT id FROM classes WHERE name = $1', [studentClassName]);
        if (cr.rows.length > 0) dbClassId = cr.rows[0].id;
      }

      // Check if this WebUntis student already exists
      const existing = await pool.query(
        'SELECT u.id, p.id AS pupil_id FROM users u LEFT JOIN pupils p ON p.user_id = u.id WHERE u.webuntis_id = $1 AND u.role = $2',
        [ws.id, 'pupil']
      );

      let userId;
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        await pool.query(
          'UPDATE users SET full_name = $1, is_active = true, deactivated_at = NULL, erasure_due_at = NULL WHERE id = $2',
          [fullName, userId]
        );
        // Update pupil class if changed
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

      // Upsert pupils record
      await pool.query(`
        INSERT INTO pupils (user_id, class_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET class_id = EXCLUDED.class_id
      `, [userId, dbClassId]);

      // --- AUTO-ALLOCATION: Place pupil in their class-specific room ---
      if (dbClassId && studentClassName) {
        try {
          const roomRes = await pool.query('SELECT id FROM rooms WHERE name = $1', [`Klassenzimmer - ${studentClassName}`]);
          if (roomRes.rows.length > 0) {
            const roomId = roomRes.rows[0].id;
            const pIdRes = await pool.query('SELECT id FROM pupils WHERE user_id = $1', [userId]);
            const pupilId = pIdRes.rows[0].id;

            // Force update: If pupil is in a generic room or no room, move them to their class-specific room
            const currentRes = await pool.query(`
              SELECT r.name 
              FROM allocation_logs a 
              JOIN rooms r ON a.to_room_id = r.id 
              WHERE a.pupil_id = $1 AND a.is_active = true 
              LIMIT 1
            `, [pupilId]);

            const currentRoomName = currentRes.rows.length > 0 ? currentRes.rows[0].name : null;

            if (!currentRoomName || currentRoomName === 'Klassenzimmer') {
              // Deactivate old and insert new
              await pool.query('UPDATE allocation_logs SET is_active = false WHERE pupil_id = $1', [pupilId]);
              await pool.query(`
                INSERT INTO allocation_logs (pupil_id, to_room_id, lesson_number, is_active)
                VALUES ($1, $2, 1, true)
              `, [pupilId, roomId]);
            }
          }
        } catch (err) {
          logger.warn(CTX, `Auto-allocation failed for ${fullName}: ${err.message}`);
        }
      }

      counts.pupils++;
    }

    // ── 5. Sync Subjects & Pupil-Subject Assignments (The Clever Aggregator) ──
    const wuSubjects = await client.getSubjects();
    logger.info(CTX, `Synchronisiere ${wuSubjects.length} Fächer via Wochenplan-Aggregation...`);

    const subjectMetaMap = {};
    for (const ws of wuSubjects) {
      subjectMetaMap[ws.id] = { name: ws.name, longName: ws.longName };
    }

    const teacherIdMap = {};
    const tr = await pool.query("SELECT id, webuntis_id FROM users WHERE role = 'teacher' AND webuntis_id IS NOT NULL");
    tr.rows.forEach(row => { teacherIdMap[row.webuntis_id] = row.id; });

    const pupilIdMap = {};
    const pr = await pool.query("SELECT id, webuntis_id FROM users WHERE role = 'pupil' AND webuntis_id IS NOT NULL");
    pr.rows.forEach(row => { pupilIdMap[row.webuntis_id] = row.id; });

    const startDate = WebUntisClient.toUntisDate(WebUntisClient.getWeekStart());
    const endDate   = WebUntisClient.toUntisDate(WebUntisClient.getWeekEnd());

    // Master map to aggregate students across lessons: Key = "SubjectID-TeacherID-ClassID"
    const subjectAggregation = {};

    for (const wc of wuClasses) {
      if (!wc._dbClassId) continue;
      
      try {
        const timetable = await client.getTimetable(wc.id, 1, startDate, endDate);
        
        for (const entry of timetable) {
          if (!entry.su || entry.su.length === 0) continue;
          if (!entry.te || entry.te.length === 0) continue;

          const wuSubjectId = entry.su[0].id;
          const wuTeacherId = entry.te[0].id;
          const lessonId    = entry.lsid || entry.id;
          
          const aggKey = `${wuSubjectId}-${wuTeacherId}-${wc.id}`;
          if (!subjectAggregation[aggKey]) {
            subjectAggregation[aggKey] = {
              wuSubjectId,
              wuTeacherId,
              wuClassId: wc.id,
              dbClassId: wc._dbClassId,
              lessons: new Set(),
              pupils: new Set()
            };
          }
          subjectAggregation[aggKey].lessons.add(lessonId);
        }
      } catch (err) {
        logger.warn(CTX, `Konnte Wochenplan für Klasse ${wc.name} nicht aggregieren: ${err.message}`);
      }
    }

    // Now process the aggregated subjects and fetch students for all lessons
    const aggKeys = Object.keys(subjectAggregation);
    logger.info(CTX, `Aggregator fertig. Verarbeite ${aggKeys.length} Fach-Gruppen...`);

    for (const key of aggKeys) {
      const agg = subjectAggregation[key];
      const subjectInfo = subjectMetaMap[agg.wuSubjectId];
      const dbTeacherId = teacherIdMap[agg.wuTeacherId];

      if (subjectInfo && dbTeacherId) {
        // 1. Upsert Subject
        const sRes = await pool.query(`
          INSERT INTO subjects (name, abbreviation, class_id, teacher_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (name, class_id) DO UPDATE SET 
            teacher_id = EXCLUDED.teacher_id,
            abbreviation = EXCLUDED.abbreviation
          RETURNING id, (xmax = 0) AS is_new
        `, [subjectInfo.longName || subjectInfo.name, subjectInfo.name, agg.dbClassId, dbTeacherId]);

        const subjectId = sRes.rows[0].id;

        // 2. Auto-Seed Categories if New
        if (sRes.rows[0].is_new) {
          const defaultCategories = [
            { name: 'Mitarbeit', weight: 40 },
            { name: 'Hausübungen', weight: 20 },
            { name: 'Leistungsfeststellungen', weight: 40 }
          ];
          for (const cat of defaultCategories) {
            await pool.query(`
              INSERT INTO assessment_categories (subject_id, name, weight_percentage)
              VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
            `, [subjectId, cat.name, cat.weight]);
          }
        }

        // 3. Fetch all unique pupils across all lessons for this subject
        for (const lessonId of agg.lessons) {
          try {
            const studentsInLesson = await client.getStudentsForLesson(lessonId);
            for (const ws of studentsInLesson) {
              const dbUserId = pupilIdMap[ws.id];
              if (dbUserId) {
                const pIdRes = await pool.query('SELECT id FROM pupils WHERE user_id = $1', [dbUserId]);
                if (pIdRes.rows.length > 0) {
                  await pool.query(`
                    INSERT INTO pupil_subject_tags (pupil_id, subject_id, tier_tag)
                    VALUES ($1, $2, 'Standard') ON CONFLICT DO NOTHING
                  `, [pIdRes.rows[0].id, subjectId]);
                }
              }
            }
          } catch (lErr) {
            // Non-fatal, just log and continue
          }
        }
      }
    }

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
