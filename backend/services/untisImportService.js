'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const { generateSecurePassword } = require('../utils/passwordGenerator');

const CTX = '[Untis Offline Import]';
const EXPORT_DIR = path.join(__dirname, '..', '..', 'untis_export');

/**
 * Perform a case-insensitive match for a file pattern within the export directory.
 * @param {RegExp} pattern 
 * @returns {string|null} Full path to the matched file or null.
 */
function findFile(pattern) {
  if (!fs.existsSync(EXPORT_DIR)) return null;
  try {
    const files = fs.readdirSync(EXPORT_DIR);
    const matched = files.find(f => pattern.test(f));
    return matched ? path.join(EXPORT_DIR, matched) : null;
  } catch (err) {
    logger.error(CTX, 'Fehler beim Lesen des Export-Verzeichnisses', err);
    return null;
  }
}

/**
 * Split a CSV line into fields, correctly handling optional double quotes and commas.
 * @param {string} line 
 * @returns {string[]}
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Scan the local untis_export directory and return the checklist status.
 * @returns {object} Scan result with checklist and status.
 */
function scanExportDirectory() {
  const schema = [
    { key: 'teachers', label: 'Lehrkräfte (Lehrer.TXT)', pattern: /^Lehrer\.TXT$/i, required: true },
    { key: 'classes', label: 'Klassen (Klassen.TXT)', pattern: /^Klassen\.TXT$/i, required: true },
    { key: 'rooms', label: 'Räume (Räume.TXT)', pattern: /^(Räume|Raeume)\.TXT$/i, required: true },
    { key: 'subjects', label: 'Fächer (Fächer.TXT)', pattern: /^(Fächer|Faecher)\.TXT$/i, required: true },
    { key: 'lessons', label: 'Unterrichtsstunden (unterricht.TXT)', pattern: /^unterricht\.TXT$/i, required: true },
    { key: 'timetable', label: 'Wochenplan (Stundenplan.TXT)', pattern: /^Stundenplan\.TXT$/i, required: true },
    { key: 'students', label: 'Schüler (Schüler.TXT)', pattern: /^(Schüler|Schueler)\.TXT$/i, required: false },
  ];

  if (!fs.existsSync(EXPORT_DIR)) {
    return {
      exists: false,
      allRequiredPresent: false,
      checklist: schema.map(s => ({
        ...s,
        present: false,
        fileName: null,
        recordCount: 0,
        status: 'missing',
        message: s.required ? 'Ordner untis_export fehlt' : 'Optional'
      }))
    };
  }

  const checklist = [];
  let allRequiredPresent = true;

  for (const s of schema) {
    const filePath = findFile(s.pattern);
    if (filePath) {
      try {
        const content = fs.readFileSync(filePath, 'latin1');
        const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
        checklist.push({
          key: s.key,
          label: s.label,
          present: true,
          fileName: path.basename(filePath),
          recordCount: lines.length,
          status: 'ready',
          required: s.required,
          message: `Bereit (${lines.length} Zeilen)`
        });
      } catch (err) {
        checklist.push({
          key: s.key,
          label: s.label,
          present: true,
          fileName: path.basename(filePath),
          recordCount: 0,
          status: 'error',
          required: s.required,
          message: `Fehler beim Lesen: ${err.message}`
        });
        if (s.required) allRequiredPresent = false;
      }
    } else {
      if (s.required) allRequiredPresent = false;
      checklist.push({
        key: s.key,
        label: s.label,
        present: false,
        fileName: null,
        recordCount: 0,
        status: s.required ? 'missing' : 'optional_missing',
        required: s.required,
        message: s.required ? 'Datei fehlt (Erforderlich)' : 'Datei fehlt (Optional)'
      });
    }
  }

  return {
    exists: true,
    allRequiredPresent,
    checklist
  };
}

/**
 * Execute the sequential transactional offline data import.
 * @param {import('pg').Pool} pool 
 * @returns {Promise<object>} Import metrics and log output.
 */
async function runImport(pool) {
  const scan = scanExportDirectory();
  if (!scan.allRequiredPresent) {
    throw new Error('Kann Import nicht starten: Erforderliche .TXT-Dateien fehlen im Ordner untis_export.');
  }

  const client = await pool.connect();
  const counts = { classes: 0, rooms: 0, teachers: 0, subjects: 0, timetable: 0, deactivated: 0 };
  const logs = [];

  try {
    await client.query('BEGIN');
    logs.push('Transaktion gestartet.');

    // ── 1. Teachers (Lehrer.TXT) ──────────────────────────────────────────────
    logs.push('Lese Lehrer.TXT...');
    const teacherFilePath = findFile(/^Lehrer\.TXT$/i);
    const teacherContent = fs.readFileSync(teacherFilePath, 'latin1');
    const teacherLines = teacherContent.split(/\r?\n/).filter(l => l.trim().length > 0);

    const importedWebUntisIds = new Set();
    const abbreviationToUserId = {};

    for (const line of teacherLines) {
      const fields = parseCsvLine(line);
      const abbreviation = fields[0];
      const lastname = fields[1];
      if (!abbreviation || !lastname) continue;

      const firstname = fields[26] || '';
      const title = fields[27] || '';

      // Safe WebUntis ID extraction. Fallback to hash if empty or invalid.
      let webuntisId = parseInt(fields[33], 10);
      if (isNaN(webuntisId)) {
        let hash = 5381;
        for (let i = 0; i < abbreviation.length; i++) {
          hash = ((hash << 5) + hash) + abbreviation.charCodeAt(i);
        }
        webuntisId = Math.abs(hash % 10000000);
      }

      importedWebUntisIds.add(webuntisId);
      const full_name = `${title ? title + ' ' : ''}${firstname} ${lastname}`.trim();

      // Formulate Safe Username
      const lastClean = lastname.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const firstClean = firstname.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      let baseUsername = lastClean && firstClean ? `${lastClean}.${firstClean}` : (lastClean || abbreviation.toLowerCase());

      let userId;
      const userRes = await client.query('SELECT id, username FROM users WHERE webuntis_id = $1', [webuntisId]);

      if (userRes.rows.length > 0) {
        userId = userRes.rows[0].id;
        await client.query(
          'UPDATE users SET full_name = $1, username = $2, is_active = true, deactivated_at = null, erasure_due_at = null WHERE id = $3',
          [full_name, userRes.rows[0].username, userId]
        );
      } else {
        let checkUser = await client.query(
          'SELECT id FROM users WHERE lower(btrim(username)) = lower(btrim($1)) LIMIT 1',
          [baseUsername]
        );
        let finalUsername = baseUsername;
        let suffix = 1;
        while (checkUser.rows.length > 0) {
          finalUsername = `${baseUsername}${suffix++}`;
          checkUser = await client.query(
            'SELECT id FROM users WHERE lower(btrim(username)) = lower(btrim($1)) LIMIT 1',
            [finalUsername]
          );
        }

        const tempPassword = generateSecurePassword('Wu');
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const insertRes = await client.query(`
          INSERT INTO users (username, full_name, role, password_hash, requires_password_change, webuntis_id, is_active)
          VALUES ($1, $2, 'teacher', $3, true, $4, true)
          RETURNING id
        `, [finalUsername, full_name, passwordHash, webuntisId]);
        userId = insertRes.rows[0].id;

        await client.query('INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
      }

      abbreviationToUserId[abbreviation] = userId;
      counts.teachers++;
    }
    logs.push(`${counts.teachers} Lehrkräfte importiert/aktualisiert.`);

    // ── 2. Classes (Klassen.TXT) ──────────────────────────────────────────────
    logs.push('Lese Klassen.TXT...');
    const classFilePath = findFile(/^Klassen\.TXT$/i);
    const classContent = fs.readFileSync(classFilePath, 'latin1');
    const classLines = classContent.split(/\r?\n/).filter(l => l.trim().length > 0);

    const classNameToId = {};

    for (const line of classLines) {
      const fields = parseCsvLine(line);
      const className = fields[0];
      if (!className) continue;

      const classRes = await client.query(`
        INSERT INTO classes (name) VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [className]);

      classNameToId[className] = classRes.rows[0].id;
      counts.classes++;
    }
    logs.push(`${counts.classes} Klassen importiert/aktualisiert.`);

    // ── 3. Rooms (Räume.TXT) ──────────────────────────────────────────────────
    logs.push('Lese Räume.TXT...');
    const roomFilePath = findFile(/^(Räume|Raeume)\.TXT$/i);
    const roomContent = fs.readFileSync(roomFilePath, 'latin1');
    const roomLines = roomContent.split(/\r?\n/).filter(l => l.trim().length > 0);

    const roomNameToId = {};

    for (const line of roomLines) {
      const fields = parseCsvLine(line);
      const roomName = fields[0];
      if (!roomName) continue;

      const roomRes = await client.query(`
        INSERT INTO rooms (name) VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [roomName]);

      roomNameToId[roomName] = roomRes.rows[0].id;
      counts.rooms++;
    }
    logs.push(`${counts.rooms} Räume importiert/aktualisiert.`);

    // ── 4. Subjects (Fächer.TXT) ──────────────────────────────────────────────
    logs.push('Lese Fächer.TXT...');
    const subjectFilePath = findFile(/^(Fächer|Faecher)\.TXT$/i);
    const subjectContent = fs.readFileSync(subjectFilePath, 'latin1');
    const subjectLines = subjectContent.split(/\r?\n/).filter(l => l.trim().length > 0);

    const subjectAbbrToName = {};

    for (const line of subjectLines) {
      const fields = parseCsvLine(line);
      const abbr = fields[0];
      const name = fields[1];
      if (abbr && name) {
        subjectAbbrToName[abbr] = name;
      }
    }

    // ── 5. Lessons (unterricht.TXT) ───────────────────────────────────────────
    logs.push('Lese unterricht.TXT...');
    const lessonFilePath = findFile(/^unterricht\.TXT$/i);
    const lessonContent = fs.readFileSync(lessonFilePath, 'latin1');
    const lessonLines = lessonContent.split(/\r?\n/).filter(l => l.trim().length > 0);

    const lessonsGrouped = {};

    for (const line of lessonLines) {
      const fields = parseCsvLine(line);
      const lessonId = fields[0];
      if (!lessonId) continue;

      const className = fields[4];
      const teacherAbbr = fields[5];
      const subjectAbbr = fields[6];
      const roomName = fields[7];
      const hoursWeight = parseFloat(fields[2]) || 0;

      if (!lessonsGrouped[lessonId]) {
        lessonsGrouped[lessonId] = {
          className,
          subjectAbbr,
          roomName,
          teachers: []
        };
      }

      if (teacherAbbr) {
        lessonsGrouped[lessonId].teachers.push({
          abbr: teacherAbbr,
          weight: hoursWeight
        });
      }
    }

    const subjectIdMap = {};

    for (const [lessonId, lesson] of Object.entries(lessonsGrouped)) {
      const classId = classNameToId[lesson.className];
      if (!classId) continue;

      // Split-teaching: Sort by weights, primary teacher is listed first or has more hours
      const sortedTeachers = lesson.teachers.sort((a, b) => b.weight - a.weight);
      const primaryTeacherAbbr = sortedTeachers[0]?.abbr;
      const secondaryTeacherAbbr = sortedTeachers[1]?.abbr;

      const teacherId = abbreviationToUserId[primaryTeacherAbbr] || null;
      const secondTeacherId = abbreviationToUserId[secondaryTeacherAbbr] || null;
      const subjectName = subjectAbbrToName[lesson.subjectAbbr] || lesson.subjectAbbr;

      if (!teacherId) continue;

      const subjectRes = await client.query(`
        INSERT INTO subjects (name, abbreviation, class_id, teacher_id, second_teacher_id, projection_visible)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        ON CONFLICT (name, class_id) DO UPDATE SET
          abbreviation = EXCLUDED.abbreviation,
          teacher_id = EXCLUDED.teacher_id,
          second_teacher_id = COALESCE(EXCLUDED.second_teacher_id, subjects.second_teacher_id)
        RETURNING id
      `, [subjectName, lesson.subjectAbbr, classId, teacherId, secondTeacherId]);

      subjectIdMap[lessonId] = subjectRes.rows[0].id;
      counts.subjects++;
    }
    logs.push(`${counts.subjects} Fachbelegungen (Subjects) angelegt/aktualisiert.`);

    // ── 6. Timetable (Stundenplan.TXT) ────────────────────────────────────────
    logs.push('Lese Stundenplan.TXT...');
    const scheduleRes = await client.query("SELECT value FROM system_settings WHERE key = 'lesson_schedule'");
    let lessonSchedule = [];
    if (scheduleRes.rows.length > 0) {
      try {
        lessonSchedule = JSON.parse(scheduleRes.rows[0].value);
      } catch (e) {
        // use fallback
      }
    }

    if (!Array.isArray(lessonSchedule) || lessonSchedule.length === 0) {
      lessonSchedule = [
        { nr: 1, start: "07:55", end: "08:45" },
        { nr: 2, start: "08:50", end: "09:40" },
        { nr: 3, start: "09:45", end: "10:35" },
        { nr: 4, start: "10:50", end: "11:40" },
        { nr: 5, start: "11:45", end: "12:35" },
        { nr: 6, start: "12:40", end: "13:30" },
        { nr: 7, start: "13:35", end: "14:25" },
        { nr: 8, start: "14:30", end: "15:20" },
        { nr: 9, start: "15:25", end: "16:15" },
        { nr: 10, start: "16:20", end: "17:10" }
      ];
    }

    const timetableFilePath = findFile(/^Stundenplan\.TXT$/i);
    const timetableContent = fs.readFileSync(timetableFilePath, 'latin1');
    const timetableLines = timetableContent.split(/\r?\n/).filter(l => l.trim().length > 0);

    // Empty previous entries to ensure synchronization integrity
    await client.query('DELETE FROM timetable_entries');

    for (const line of timetableLines) {
      const fields = parseCsvLine(line);
      const lessonId = fields[0];
      const className = fields[1];
      const teacherAbbr = fields[2];
      const subjectAbbr = fields[3];
      const roomName = fields[4];
      const dayOfWeek = parseInt(fields[5], 10);
      const periodNumber = parseInt(fields[6], 10);

      if (isNaN(dayOfWeek) || isNaN(periodNumber)) continue;

      const classId = classNameToId[className];
      const roomId = roomNameToId[roomName] || null;
      const teacherId = abbreviationToUserId[teacherAbbr] || null;

      // Lookup subject matching class and abbreviations
      let subjectId = subjectIdMap[lessonId];
      if (!subjectId && classId) {
        const subName = subjectAbbrToName[subjectAbbr] || subjectAbbr;
        const subLookup = await client.query(
          'SELECT id FROM subjects WHERE name = $1 AND class_id = $2',
          [subName, classId]
        );
        if (subLookup.rows.length > 0) {
          subjectId = subLookup.rows[0].id;
        }
      }

      if (!classId || !subjectId) continue;

      const period = lessonSchedule.find(p => p.nr === periodNumber) || { start: "07:55", end: "08:45" };

      await client.query(`
        INSERT INTO timetable_entries (class_id, subject_id, teacher_id, room_id, day_of_week, period_number, start_time, end_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (class_id, day_of_week, period_number) DO UPDATE SET
          subject_id = EXCLUDED.subject_id,
          teacher_id = EXCLUDED.teacher_id,
          room_id = EXCLUDED.room_id,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time
      `, [classId, subjectId, teacherId, roomId, dayOfWeek, periodNumber, period.start, period.end]);

      counts.timetable++;
    }
    logs.push(`${counts.timetable} Wochenplan-Stundenplanzuweisungen (Timetable) importiert.`);

    // ── 7. Soft Delete (Deactivate teachers missing in import) ────────────────
    const deactivatedRes = await client.query(`
      UPDATE users 
      SET is_active = false, deactivated_at = NOW()
      WHERE role = 'teacher' AND webuntis_id IS NOT NULL AND NOT (webuntis_id = ANY($1))
      RETURNING id
    `, [Array.from(importedWebUntisIds)]);

    counts.deactivated = deactivatedRes.rows.length;
    if (counts.deactivated > 0) {
      logs.push(`${counts.deactivated} nicht mehr exportierte Lehrkräfte wurden per Soft-Delete deaktiviert.`);
    }

    await client.query('COMMIT');
    logs.push('Import erfolgreich festgeschrieben.');

    return {
      success: true,
      counts,
      logs
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logs.push(`FEHLER: Transaktion zurückgerollt: ${err.message}`);
    logger.error(CTX, 'Import fehlgeschlagen, zurückgerollt', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  scanExportDirectory,
  runImport
};
