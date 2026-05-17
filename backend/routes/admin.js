const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken, setupLimiter } = require('../server');
const logger = require('../utils/logger');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const ExcelJS = require('exceljs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Helper to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Nur Administratoren erlaubt' });
    }
};

// Define paths based on volume mapping
const DATA_DIR = '/opt/school-management/school_data';
const TRIGGER_FILE = path.join(DATA_DIR, 'UPDATE_PENDING');
const LOG_FILE = path.join(DATA_DIR, 'logs/auto_update.log');

const normalizeLevels = (raw) => {
    if (!raw) return null;
    return String(raw)
        .split(',')
        .map(l => l.trim().toLowerCase())
        .filter(l => ['error', 'warn', 'info'].includes(l));
};

const csvEscape = (val) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
};

// GET /api/admin/system/status — Check system update status
router.get('/status', authenticateToken, isAdmin, async (req, res) => {
    try {
        const isPending = fs.existsSync(TRIGGER_FILE);
        let lastLog = "";
        if (fs.existsSync(LOG_FILE)) {
            // Read last 20 lines of log
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            lastLog = content.split('\n').slice(-20).join('\n');
        }
        res.json({ 
            isPending, 
            lastLog,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: 'Status konnte nicht geladen werden' });
    }
});

// POST /api/admin/system/update — Trigger an immediate update
router.post('/update', authenticateToken, isAdmin, async (req, res) => {
    try {
        // Write the trigger file
        fs.writeFileSync(TRIGGER_FILE, `Update requested by ${req.user.full_name} at ${new Date().toISOString()}`);
        res.json({ success: true, message: 'Update wurde angefordert. Das System startet in Kürze neu.' });
    } catch (err) {
        console.error('Update trigger error:', err);
        res.status(500).json({ error: 'Update konnte nicht ausgelöst werden' });
    }
});

// GET /api/admin/logs — Read rolling app logs
// Query params:
//   levels=error,warn,info
//   limit=500
//   format=json|csv
router.get('/logs', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
    try {
        const levels = normalizeLevels(req.query.levels);
        const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 500));
        const format = String(req.query.format || 'json').toLowerCase();

        let entries = logger.readEntries();
        if (levels && levels.length > 0) {
            entries = entries.filter((e) => levels.includes(String(e.level || '').toLowerCase()));
        }
        entries = entries.slice(0, limit);

        if (format === 'csv') {
            const header = ['iso', 'level', 'context', 'message', 'error', 'stack'];
            const rows = entries.map((e) => [
                csvEscape(e.iso),
                csvEscape(e.level),
                csvEscape(e.context),
                csvEscape(e.message),
                csvEscape(e.error),
                csvEscape(e.stack),
            ].join(','));
            const csv = [header.join(','), ...rows].join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="admin_logs_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv"`);
            return res.send(csv);
        }

        res.json({
            logPath: logger.getPath(),
            count: entries.length,
            entries,
        });
    } catch (err) {
        console.error('Admin logs fetch error:', err);
        res.status(500).json({ error: 'Logs konnten nicht geladen werden' });
    }
});

// GET /api/admin/settings — Retrieve all system settings
router.get('/settings', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await req.pool.query('SELECT key, value FROM system_settings ORDER BY key');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.key === 'webuntis_password' ? (row.value ? '••••••••' : '') : row.value;
        });
        res.json(settings);
    } catch (err) {
        console.error('Settings fetch error:', err);
        res.status(500).json({ error: 'Einstellungen konnten nicht geladen werden' });
    }
});

// PUT /api/admin/settings/:key — Update a specific system setting
router.put('/settings/:key', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined || value === null) {
        return res.status(400).json({ error: 'Wert erforderlich' });
    }
    // Validate JSON for structured settings
    const jsonKeys = ['lesson_boundaries', 'lesson_schedule'];
    if (jsonKeys.includes(key)) {
        try { JSON.parse(value); } catch (e) {
            return res.status(400).json({ error: 'Ungültiges JSON-Format' });
        }
    }
    try {
        await req.pool.query(`
            INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
        `, [key, String(value)]);
        res.json({ success: true, key, value });
    } catch (err) {
        console.error('Settings update error:', err);
        res.status(500).json({ error: 'Einstellung konnte nicht gespeichert werden' });
    }
});

// --- Room Management ---

// GET /api/admin/rooms — List all rooms with capacities
router.get('/rooms', authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await req.pool.query('SELECT id, name, capacity, is_special FROM rooms ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Räume konnten nicht geladen werden' });
    }
});

// PUT /api/admin/rooms/:id — Update room capacity and settings
router.put('/rooms/:id', authenticateToken, isAdmin, async (req, res) => {
    const roomId = Number(req.params.id);
    const { capacity, is_special } = req.body;
    try {
        const fields = [];
        const values = [];
        let idx = 1;
        if (capacity !== undefined) { fields.push(`capacity = $${idx++}`); values.push(capacity || null); }
        if (is_special !== undefined) { fields.push(`is_special = $${idx++}`); values.push(is_special); }
        if (fields.length > 0) {
            values.push(roomId);
            await req.pool.query(`UPDATE rooms SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Raumeinstellungen konnten nicht gespeichert werden' });
    }
});

// PUT /api/admin/rooms/:id/capacity — Update room capacity (also accepts is_special)
router.put('/rooms/:id/capacity', authenticateToken, isAdmin, async (req, res) => {
    const roomId = Number(req.params.id);
    const { capacity, is_special } = req.body;
    try {
        const fields = [];
        const values = [];
        let idx = 1;
        if (capacity !== undefined) { fields.push(`capacity = $${idx++}`); values.push(capacity || null); }
        if (is_special !== undefined) { fields.push(`is_special = $${idx++}`); values.push(is_special); }
        if (fields.length > 0) {
            values.push(roomId);
            await req.pool.query(`UPDATE rooms SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Raumeinstellungen konnten nicht gespeichert werden' });
    }
});

// --- Class Rosters ---

// GET /api/admin/classes/:id/roster — Get all pupils in a specific class
router.get('/classes/:id/roster', authenticateToken, isAdmin, async (req, res) => {
    const classId = Number(req.params.id);
    try {
        const result = await req.pool.query(`
            SELECT u.id, u.username, u.full_name, u.role, u.requires_password_change
            FROM users u
            JOIN pupils p ON p.user_id = u.id
            WHERE p.class_id = $1
            ORDER BY u.full_name
        `, [classId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Klassenliste konnte nicht geladen werden' });
    }
});

// --- Factsheet Engine ---

const bcrypt = require('bcrypt');

// GET /api/admin/factsheets/teachers/status — Check if mass reset was already performed
router.get('/factsheets/teachers/status', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await req.pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher' AND last_factsheet_at IS NOT NULL");
        res.json({ has_run_before: parseInt(result.rows[0].count, 10) > 0 });
    } catch (err) {
        res.status(500).json({ error: 'Status konnte nicht geladen werden' });
    }
});

// POST /api/admin/factsheets/teachers — Reset all teacher passwords and return credentials
router.post('/factsheets/teachers', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
    const { force } = req.body;
    try {
        const statusRes = await req.pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher' AND last_factsheet_at IS NOT NULL");
        const hasRunBefore = parseInt(statusRes.rows[0].count, 10) > 0;

        if (hasRunBefore && !force) {
            return res.status(409).json({ 
                error: 'WARNUNG: Factsheets wurden bereits einmal generiert.',
                details: 'Ein erneuter Reset macht alle bestehenden Lehrer-Passwörter ungültig.'
            });
        }

        const teachersRes = await req.pool.query("SELECT id, username, full_name FROM users WHERE role = 'teacher' AND is_active = true");
        const results = [];

        for (const t of teachersRes.rows) {
            const tempPw = generateSecurePassword('Antigravity');
            const hash = await bcrypt.hash(tempPw, 10);
            
            await req.pool.query(`
                UPDATE users 
                SET password_hash = $1, requires_password_change = true, last_factsheet_at = NOW() 
                WHERE id = $2
            `, [hash, t.id]);

            results.push({
                full_name: t.full_name,
                username: t.username,
                password: tempPw
            });
        }

        res.json({ 
            success: true, 
            count: results.length,
            teachers: results 
        });
    } catch (err) {
        logger.error('[Admin]', 'Mass password reset failed', err);
        res.status(500).json({ error: 'Zurücksetzen der Passwörter fehlgeschlagen' });
    }
});

// --- Roster Management (Manual Class Assignment & Excel Import) ---

// GET /api/admin/import/template — Download Excel template for roster import
router.get('/import/template', authenticateToken, isAdmin, async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Schülerliste');
        
        worksheet.columns = [
            { header: 'Name des Schülers', key: 'name', width: 30 },
            { header: 'Klasse', key: 'class', width: 15 }
        ];

        // Add some example data (optional)
        worksheet.addRow({ name: 'Max Mustermann', class: '2a' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="roster_template.xlsx"');
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        logger.error('[Admin]', 'Template generation failed', err);
        res.status(500).json({ error: 'Template konnte nicht generiert werden' });
    }
});

// POST /api/admin/import/roster — Import roster from Excel
router.post('/import/roster', authenticateToken, isAdmin, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        const worksheet = workbook.getWorksheet(1);

        const results = { updated: 0, created: 0, errors: [] };
        const classesMap = {}; // Cache for class names -> IDs

        // Get all classes
        const classesRes = await req.pool.query('SELECT id, name FROM classes');
        classesRes.rows.forEach(c => { classesMap[c.name.toLowerCase()] = c.id; });

        // Iterate over rows (skip header)
        for (let i = 2; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);
            const name = row.getCell(1).text?.trim();
            const className = row.getCell(2).text?.trim();

            if (!name) continue;

            const classId = classesMap[className?.toLowerCase()] || null;

            // Find pupil by full_name (fuzzy match or exact match)
            const pupilRes = await req.pool.query(
                "SELECT u.id, p.id AS pupil_id FROM users u JOIN pupils p ON p.user_id = u.id WHERE LOWER(u.full_name) = LOWER($1) AND u.role = 'pupil'",
                [name]
            );

            if (pupilRes.rows.length > 0) {
                // Update existing pupil
                await req.pool.query('UPDATE pupils SET class_id = $1 WHERE id = $2', [classId, pupilRes.rows[0].pupil_id]);
                results.updated++;
            } else {
                results.errors.push(`Schüler "${name}" nicht in der Datenbank gefunden (muss erst via WebUntis importiert werden).`);
            }
        }

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        res.json(results);
    } catch (err) {
        if (req.file) fs.unlinkSync(req.file.path);
        logger.error('[Admin]', 'Excel import failed', err);
        res.status(500).json({ error: 'Excel-Import fehlgeschlagen: ' + err.message });
    }
});

// POST /api/admin/pupils/:id/assign — Manually assign a pupil to a class
router.post('/pupils/:id/assign', authenticateToken, isAdmin, async (req, res) => {
    const rawId = Number(req.params.id);
    const { class_id } = req.body;
    const idTypeRaw = (req.body?.id_type || req.query?.id_type || 'auto').toString().toLowerCase();
    try {
        if (!Number.isFinite(rawId) || rawId <= 0) {
            return res.status(400).json({ error: 'Ungültige Schüler-ID' });
        }

        // Accept both pupils.id and users.id; resolve deterministically to avoid ID collisions.
        let pupilId = null;
        const resolveByUserId = async () => {
            const byUserId = await req.pool.query(`
                SELECT p.id
                FROM pupils p
                JOIN users u ON u.id = p.user_id
                WHERE p.user_id = $1 AND u.role = 'pupil'
                LIMIT 1
            `, [rawId]);
            return byUserId.rows.length > 0 ? byUserId.rows[0].id : null;
        };
        const resolveByPupilId = async () => {
            const byPupilId = await req.pool.query('SELECT id FROM pupils WHERE id = $1 LIMIT 1', [rawId]);
            return byPupilId.rows.length > 0 ? byPupilId.rows[0].id : null;
        };

        if (idTypeRaw === 'user') {
            pupilId = await resolveByUserId();
        } else if (idTypeRaw === 'pupil') {
            pupilId = await resolveByPupilId();
        } else {
            // Auto mode prefers user_id first to match admin class assignment UI.
            pupilId = await resolveByUserId();
            if (!pupilId) pupilId = await resolveByPupilId();
        }

        if (!pupilId) {
            return res.status(404).json({ error: 'Schülerprofil nicht gefunden' });
        }

        await req.pool.query('UPDATE pupils SET class_id = $1 WHERE id = $2', [class_id || null, pupilId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Zuordnung fehlgeschlagen' });
    }
});

// --- Subject Management (Manual Teacher Assignment) ---

// GET /api/admin/classes/:id/subjects — List all subjects for a class
router.get('/classes/:id/subjects', authenticateToken, isAdmin, async (req, res) => {
    const classId = Number(req.params.id);
    try {
        const result = await req.pool.query(`
            SELECT s.*, u1.full_name as teacher_name, u2.full_name as second_teacher_name
            FROM subjects s
            LEFT JOIN users u1 ON s.teacher_id = u1.id
            LEFT JOIN users u2 ON s.second_teacher_id = u2.id
            WHERE s.class_id = $1
            ORDER BY s.name
        `, [classId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Fächer konnten nicht geladen werden' });
    }
});

// POST /api/admin/subjects — Create a new subject and assign teacher(s)
router.post('/subjects', authenticateToken, isAdmin, async (req, res) => {
    const { name, abbreviation, class_id, teacher_id, second_teacher_id } = req.body;
    if (!name || !class_id || !teacher_id) {
        return res.status(400).json({ error: 'Name, Klasse und Hauptlehrer sind erforderlich' });
    }

    const client = await req.pool.connect();
    try {
        await client.query('BEGIN');
        
        const abbr = abbreviation || name.substring(0, 2).toUpperCase();
        
        const subRes = await client.query(`
            INSERT INTO subjects (name, abbreviation, class_id, teacher_id, second_teacher_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (name, class_id) DO UPDATE SET 
                abbreviation = EXCLUDED.abbreviation,
                teacher_id = EXCLUDED.teacher_id,
                second_teacher_id = EXCLUDED.second_teacher_id
            RETURNING id, (xmax = 0) AS is_new
        `, [name, abbr, class_id, teacher_id, second_teacher_id || null]);

        const subjectId = subRes.rows[0].id;

        // Auto-seed default categories if it's a new subject
        if (subRes.rows[0].is_new) {
            const defaultCategories = [
                { name: 'Mitarbeit', weight: 40 },
                { name: 'Hausübungen', weight: 20 },
                { name: 'Leistungsfeststellungen', weight: 40 }
            ];
            for (const cat of defaultCategories) {
                await client.query(`
                    INSERT INTO assessment_categories (subject_id, name, weight_percentage)
                    VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
                `, [subjectId, cat.name, cat.weight]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, id: subjectId });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('[Admin]', 'Subject creation failed', err);
        res.status(500).json({ error: 'Fach konnte nicht erstellt werden' });
    } finally {
        client.release();
    }
});

// DELETE /api/admin/subjects/:id — Delete a subject
router.delete('/subjects/:id', authenticateToken, isAdmin, async (req, res) => {
    const subjectId = Number(req.params.id);
    try {
        await req.pool.query('DELETE FROM subjects WHERE id = $1', [subjectId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Fach konnte nicht gelöscht werden' });
    }
});

// POST /api/admin/seed-demo
router.post('/seed-demo', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'System administration privileges required' });
    }
    const client = await req.pool.connect();
    try {
        await client.query('BEGIN');
        // Clean Existing Tables
        await client.query('DELETE FROM grades');
        await client.query('DELETE FROM assessments');
        await client.query('DELETE FROM assessment_categories');
        await client.query('DELETE FROM subjects');
        await client.query('DELETE FROM pupil_subject_tags');
        await client.query('DELETE FROM participation_logs');
        await client.query('DELETE FROM pupils');
        await client.query('DELETE FROM classes');
        await client.query("DELETE FROM users WHERE role IN ('teacher', 'pupil')");

        // Generator Arrays
        const firstNamesT = ["Monika", "Sarah", "Andreas", "Alexander", "Thomas", "Stefan", "Katharina", "Sabine", "Michael", "Wolfgang", "Christian", "Elisabeth", "Maria", "Johannes", "Daniel", "Eva", "Renate", "Herbert", "Daniela", "Klaus"];
        const firstNamesP = ["Lukas", "Anna", "Tobias", "Lena", "Maximilian", "Sophie", "Jakob", "Marie", "David", "Laura", "Felix", "Emily", "Leon", "Johanna", "Simon", "Mia", "Jonas", "Luisa", "Paul", "Clara"];
        const lastNames = ["Gruber", "Huber", "Maier", "Pichler", "Berger", "Moser", "Hofer", "Eder", "Wimmer", "Lehner", "Steiner", "Schuster", "Brunner", "Winkler", "Glaser", "Gartner", "Ebner", "Fischer", "Wallner", "Kramer"];
        const subjectsPool = ["Mathematik", "Deutsch", "Englisch", "Biologie", "Geografie", "Physik", "Musik", "Sport"];

        // 1. Generate 60 Teachers
        const teacherIds = [];
        for (let i = 1; i <= 60; i++) {
            const first = firstNamesT[Math.floor(Math.random() * firstNamesT.length)];
            const last = lastNames[Math.floor(Math.random() * lastNames.length)];
            const username = `teacher.${first.toLowerCase()}.${last.toLowerCase()}.${i}`;
            const fullName = `${first} ${last}`;

            const uRes = await client.query(
                `INSERT INTO users (username, full_name, role, password_hash, requires_password_change)
                 VALUES ($1, $2, 'teacher', 'demohash123', false) RETURNING id`,
                [username, fullName]
            );
            teacherIds.push(uRes.rows[0].id);
        }

        // 2. Generate 16 Classes (1A - 4D)
        const classIds = {};
        const classNames = [];
        const letters = ['A', 'B', 'C', 'D'];
        for (let grade = 1; grade <= 4; grade++) {
            for (const letter of letters) {
                const cName = `${grade}${letter}`;
                const cRes = await client.query('INSERT INTO classes (name) VALUES ($1) RETURNING id', [cName]);
                classIds[cName] = cRes.rows[0].id;
                classNames.push(cName);
            }
        }

        // 3. Generate 400 Pupils evenly distributed
        const pupilIds = [];
        for (let i = 1; i <= 400; i++) {
            const first = firstNamesP[Math.floor(Math.random() * firstNamesP.length)];
            const last = lastNames[Math.floor(Math.random() * lastNames.length)];
            const username = `pupil.${first.toLowerCase()}.${last.toLowerCase()}.${i}`;
            const fullName = `${first} ${last}`;
            const className = classNames[(i - 1) % classNames.length];
            const classId = classIds[className];
            const uRes = await client.query(
                `INSERT INTO users (username, full_name, role, password_hash, requires_password_change)
                 VALUES ($1, $2, 'pupil', 'demohash123', false) RETURNING id`,
                [username, fullName]
            );
            const uId = uRes.rows[0].id;

            const pRes = await client.query(
                'INSERT INTO pupils (user_id, class_id) VALUES ($1, $2) RETURNING id',
                [uId, classId]
            );
            pupilIds.push({ id: pRes.rows[0].id, classId });
        }

        // 4. Generate 20-Week Historical Timeline
        const weeks = [];
        const now = new Date();
        for (let w = 19; w >= 0; w--) {
            const d = new Date(now.getTime());
            d.setDate(d.getDate() - (w * 7));
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            weeks.push(monday.toISOString().split('T')[0]);
        }

        // 5. Generate Subjects, Categories, and Backdated Historical Grades
        for (const className of classNames) {
            const classId = classIds[className];
            const classPupils = pupilIds.filter(p => p.classId === classId);

            for (const subjName of subjectsPool) {
                const abbrev = subjName.substring(0, 3).toUpperCase();
                const randTeacherId = teacherIds[Math.floor(Math.random() * teacherIds.length)];

                // Create Subject
                const sRes = await client.query(
                    `INSERT INTO subjects (name, class_id, teacher_id, abbreviation)
                     VALUES ($1, $2, $3, $4) RETURNING id`,
                    [subjName, classId, randTeacherId, abbrev]
                );
                const subjectId = sRes.rows[0].id;

                // Categories
                const catRes1 = await client.query(
                    `INSERT INTO assessment_categories (subject_id, name, weight_percentage, scale_type, is_self_directed)
                     VALUES ($1, 'Mitarbeit', 20, 'numeric_1_5', false) RETURNING id`,
                    [subjectId]
                );
                const catRes2 = await client.query(
                    `INSERT INTO assessment_categories (subject_id, name, weight_percentage, scale_type, is_self_directed)
                     VALUES ($1, 'Lernzielkontrollen', 30, 'percentage', true) RETURNING id`,
                    [subjectId]
                );
                const catRes3 = await client.query(
                    `INSERT INTO assessment_categories (subject_id, name, weight_percentage, scale_type, is_self_directed)
                     VALUES ($1, 'Schularbeiten', 50, 'numeric_1_5', false) RETURNING id`,
                    [subjectId]
                );
                const cMitarbeit = catRes1.rows[0].id;
                const cLzk = catRes2.rows[0].id;
                const cSchularbeiten = catRes3.rows[0].id;

                // Populate 20 Weeks of History for each student
                for (const pupil of classPupils) {
                    for (let wIdx = 0; wIdx < weeks.length; wIdx++) {
                        const weekStartStr = weeks[wIdx];
                        const randVal = Math.random();
                        const rating = randVal < 0.6 ? 'excellent' : randVal < 0.9 ? 'engaged' : 'passive';
                        const gradeVal = rating === 'excellent' ? '1' : rating === 'engaged' ? '2' : '4';

                        await client.query(
                            `INSERT INTO participation_logs (pupil_id, teacher_id, subject_id, lesson_date, rating, applied_to_grade)
                             VALUES ($1, $2, $3, $4, $5, true)`,
                            [pupil.id, randTeacherId, subjectId, weekStartStr, rating]
                        );

                        await client.query(
                            `INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, is_visible, date)
                             VALUES ($1, $2, $3, $4, true, $5)`,
                            [cMitarbeit, pupil.id, `Mitarbeit KW ${weekStartStr}`, gradeVal, weekStartStr]
                        );
                    }

                    const sa1Date = weeks[5];
                    const sa2Date = weeks[14];
                    const sa1Grade = String(Math.floor(Math.random() * 4) + 1);
                    const sa2Grade = String(Math.floor(Math.random() * 3) + 1);

                    await client.query(
                        `INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, date)
                         VALUES ($1, $2, '1. Schularbeit', $3, $4)`,
                        [cSchularbeiten, pupil.id, sa1Grade, sa1Date]
                    );
                    await client.query(
                        `INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, date)
                         VALUES ($1, $2, '2. Schularbeit', $3, $4)`,
                        [cSchularbeiten, pupil.id, sa2Grade, sa2Date]
                    );

                    const lzkWeeks = [2, 6, 10, 13, 17];
                    for (let l = 0; l < lzkWeeks.length; l++) {
                        const lzkDate = weeks[lzkWeeks[l]];
                        const baseScore = 50 + (l * 8);
                        const finalScore = String(Math.min(100, baseScore + Math.floor(Math.random() * 15)));
                        await client.query(
                            `INSERT INTO grades (category_id, pupil_id, assessment_name, grade_value, date)
                             VALUES ($1, $2, $3, $4, $5)`,
                            [cLzk, pupil.id, `Lernzielkontrolle ${l + 1}`, finalScore, lzkDate]
                        );
                    }

                    const finalScoreAverage = (Math.random() * 2) + 1;
                    const finalTag = finalScoreAverage < 1.6 ? 'Meister' : finalScoreAverage < 2.8 ? 'Geselle' : 'Lehrling';
                    await client.query(
                        `INSERT INTO pupil_subject_tags (pupil_id, subject_id, tier_tag)
                         VALUES ($1, $2, $3)`,
                        [pupil.id, subjectId, finalTag]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Large-Scale school successfully seeded with 20 weeks of backdated history!',
            stats: { classes: 16, teachers: 60, pupils: 400, subjects: 128, categories: 384, history_weeks: 20 }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seeding failure:', err);
        res.status(500).json({ error: 'Demo seeding aborted. Data rollback executed.', details: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
