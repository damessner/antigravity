const express = require('express');
const router = express.Router();
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../server');
const logger = require('../utils/logger');

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrative access required' });
  }
  next();
};

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/admin/logs — return retained error log entries (JSON)
router.get('/logs', adminLimiter, authenticateToken, requireAdmin, (req, res) => {
  try {
    const entries = logger.readEntries();
    res.json({ entries, logFile: logger.getPath() });
  } catch (err) {
    logger.error('[Logs API]', 'Failed to read log entries', err);
    res.status(500).json({ error: 'Could not read log file' });
  }
});

// GET /api/admin/logs/download — download raw log file
router.get('/logs/download', adminLimiter, authenticateToken, requireAdmin, (req, res) => {
  const filePath = logger.getPath();
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Log file not available' });
  }
  const filename = `errors_${new Date().toISOString().split('T')[0]}.log`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/plain');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
