'use strict';

const express = require('express');
const router  = express.Router();
const { authenticateToken, setupLimiter } = require('../server');
const { scanExportDirectory, runImport } = require('../services/untisImportService');
const logger = require('../utils/logger');

const CTX = '[Untis Import API]';

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ error: 'Nur Administratoren erlaubt' });
};

/**
 * GET /api/untis-import/status
 * Scans the untis_export directory and returns the checklist status of all file sources.
 */
router.get('/status', setupLimiter, authenticateToken, isAdmin, (req, res) => {
  try {
    const status = scanExportDirectory();
    res.json(status);
  } catch (err) {
    logger.error(CTX, 'Fehler beim Scannen des Export-Verzeichnisses', err);
    res.status(500).json({ error: 'Fehler beim Scannen der Export-Dateien' });
  }
});

/**
 * POST /api/untis-import/run
 * Triggers the sequential transaction import and returns a summary log of all updated/created items.
 */
router.post('/run', setupLimiter, authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await runImport(req.pool);
    res.json(result);
  } catch (err) {
    logger.error(CTX, 'Fehler beim Ausführen des Offline-Imports', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Ein unerwarteter Fehler ist beim Import aufgetreten'
    });
  }
});

module.exports = router;
