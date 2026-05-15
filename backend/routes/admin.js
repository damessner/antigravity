const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken, setupLimiter } = require('../server');

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

module.exports = router;
