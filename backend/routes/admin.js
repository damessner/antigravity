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
        const result = await req.pool.query('SELECT id, name, capacity FROM rooms ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Räume konnten nicht geladen werden' });
    }
});

// PUT /api/admin/rooms/:id — Update room capacity
router.put('/rooms/:id', authenticateToken, isAdmin, async (req, res) => {
    const roomId = Number(req.params.id);
    const { capacity } = req.body;
    try {
        await req.pool.query('UPDATE rooms SET capacity = $1 WHERE id = $2', [capacity || null, roomId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Kapazität konnte nicht gespeichert werden' });
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
    const pupilId = Number(req.params.id);
    const { class_id } = req.body;
    try {
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

module.exports = router;
