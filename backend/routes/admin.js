const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../server');

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

module.exports = router;
