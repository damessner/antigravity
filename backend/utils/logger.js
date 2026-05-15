/**
 * Rolling error logger — writes timestamped entries to a file and trims
 * anything older than 72 hours on each write to keep storage minimal on
 * low-powered hardware.
 *
 * Log location (in priority order):
 *   1. /opt/school-management/logs/errors.log   (production container path)
 *   2. /logs/errors.log                          (Unraid bind-mount)
 *   3. <repo-root>/logs/errors.log               (dev fallback)
 */

const fs = require('fs');
const path = require('path');

const RETENTION_MS = 72 * 60 * 60 * 1000; // 72 hours

let _logFilePath = null;

function getLogFilePath() {
  if (_logFilePath) return _logFilePath;

  const candidates = [
    '/opt/school-management/logs/errors.log',
    '/logs/errors.log',
    path.join(__dirname, '../../logs/errors.log'),
  ];

  for (const p of candidates) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Quick write-test
      fs.appendFileSync(p, '');
      _logFilePath = p;
      return p;
    } catch {
      // Try next candidate
    }
  }

  // Last resort: in-memory only (no writes)
  return null;
}

/**
 * Trim log entries older than RETENTION_MS from the log file.
 * Each line is a JSON object with a `ts` (epoch ms) field.
 */
function trimOldEntries(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const cutoff = Date.now() - RETENTION_MS;
    const kept = raw
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        try {
          const obj = JSON.parse(line);
          return obj.ts && obj.ts >= cutoff;
        } catch {
          return false; // drop malformed lines
        }
      })
      .join('\n');
    fs.writeFileSync(filePath, kept ? kept + '\n' : '');
  } catch {
    // Non-fatal: if we can't trim, skip
  }
}

/**
 * Log an error (or any level) entry.
 * @param {string} level  - 'error' | 'warn' | 'info'
 * @param {string} context - Short tag like '[Login]' or '[Scheduler]'
 * @param {string} message
 * @param {Error|null} [err]
 */
function log(level, context, message, err) {
  const ts = Date.now();
  const iso = new Date(ts).toISOString();

  const entry = {
    ts,
    iso,
    level,
    context,
    message,
    ...(err && { error: err.message, stack: err.stack }),
  };

  // Always write to process output so Docker logs capture it
  const prefix = `[${iso}] [${level.toUpperCase()}] ${context} ${message}`;
  if (level === 'error') {
    console.error(prefix, err ? err.message : '');
  } else if (level === 'warn') {
    console.warn(prefix);
  } else {
    console.log(prefix);
  }

  // Persist to file
  const filePath = getLogFilePath();
  if (!filePath) return;

  try {
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
    // Trim on every 50th write to avoid doing it every call.
    // We use a simple counter rather than a file size check since file size
    // checks on every write would be too slow on low-powered hardware.
    logWriteCount++;
    if (logWriteCount % 50 === 0) {
      trimOldEntries(filePath);
    }
  } catch {
    // Non-fatal
  }
}

let logWriteCount = 0;

/**
 * Perform an on-demand trim (call at startup to clean any stale entries).
 */
function trimNow() {
  const filePath = getLogFilePath();
  if (filePath) trimOldEntries(filePath);
}

/**
 * Return the path to the active log file (or null if unavailable).
 */
function getPath() {
  return getLogFilePath();
}

/**
 * Read all retained log entries as an array of objects (newest first).
 */
function readEntries() {
  const filePath = getLogFilePath();
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const cutoff = Date.now() - RETENTION_MS;
    return raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e && e.ts >= cutoff)
      .reverse();
  } catch {
    return [];
  }
}

module.exports = {
  error: (ctx, msg, err) => log('error', ctx, msg, err),
  warn:  (ctx, msg)      => log('warn',  ctx, msg, null),
  info:  (ctx, msg)      => log('info',  ctx, msg, null),
  trimNow,
  getPath,
  readEntries,
};
