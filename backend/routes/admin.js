const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken, setupLimiter } = require('../server');
const logger = require('../utils/logger');
const { generateSecurePassword } = require('../utils/passwordGenerator');

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
        result.rows.forEach(row => { settings[row.key] = row.value; });
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
router.get('/factsheets/teachers/status', authenticateToken, isAdmin, async (req, res) => {
    try {
        const result = await req.pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher' AND last_factsheet_at IS NOT NULL");
        res.json({ has_run_before: parseInt(result.rows[0].count, 10) > 0 });
    } catch (err) {
        res.status(500).json({ error: 'Status konnte nicht geladen werden' });
    }
});

// POST /api/admin/factsheets/teachers — Reset all teacher passwords and return credentials
router.post('/factsheets/teachers', authenticateToken, isAdmin, async (req, res) => {
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

module.exports = router;
