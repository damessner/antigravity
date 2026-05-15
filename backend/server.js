const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

// ── Global process-level safety net ──────────────────────────────────────────
// Catch any unhandled promise rejection or uncaught exception, log it to the
// rolling 72-hour error file, then allow Docker's restart policy to recover the
// container rather than silently hanging in a broken state.
process.on('uncaughtException', (err) => {
  logger.error('[Process]', 'uncaughtException — process will exit for container restart', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('[Process]', 'unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
});

// Trim stale log entries from previous runs at startup
logger.trimNow();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'SuperSecretSchoolDbPass2026!',
  database: process.env.DB_NAME || 'school_management'
});

// Ensure SDL Schema fields exist seamlessly
pool.query(`
  ALTER TABLE subjects DROP CONSTRAINT IF EXISTS uq_subject_class;
  ALTER TABLE assessment_categories ADD COLUMN IF NOT EXISTS is_self_directed BOOLEAN DEFAULT false;
  ALTER TABLE assessment_categories ADD COLUMN IF NOT EXISTS is_hidden_from_pupils BOOLEAN DEFAULT false;
  ALTER TABLE assessment_categories DROP COLUMN IF EXISTS default_deadline;
  ALTER TABLE grades ADD COLUMN IF NOT EXISTS student_planned_date DATE;
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT NULL;

  CREATE TABLE IF NOT EXISTS assessments (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES assessment_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    info_text TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    is_visible BOOLEAN DEFAULT true,
    CONSTRAINT uq_assessment_category UNIQUE (category_id, name)
  );

  CREATE TABLE IF NOT EXISTS student_learning_plan (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES assessment_categories(id) ON DELETE CASCADE,
    assessment_name VARCHAR(100) NOT NULL,
    planned_date DATE NOT NULL,
    slot_number INTEGER CHECK (slot_number IN (1, 2)),
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS help_requests (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    claimed_by_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    teacher_comment TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS participation_logs (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
    rating VARCHAR(20) NOT NULL DEFAULT 'engaged',
    applied_to_grade BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seating_positions (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER UNIQUE REFERENCES pupils(id) ON DELETE CASCADE,
    desk_row INTEGER NOT NULL DEFAULT 1,
    desk_col INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    notify_help_requests BOOLEAN DEFAULT TRUE,
    notify_timers BOOLEAN DEFAULT TRUE,
    notify_system BOOLEAN DEFAULT TRUE
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  INSERT INTO system_settings (key, value) VALUES
    ('school_name', 'MS Weissenbach Telfs'),
    ('lesson_boundaries', '{"07:55":1,"08:50":2,"09:45":3,"10:50":4,"11:45":5,"12:40":6,"13:35":7,"14:30":8,"15:25":9,"16:20":10,"18:00":10}'),
    ('lesson_schedule', '[{"nr":1,"start":"07:55","end":"08:45"},{"nr":2,"start":"08:50","end":"09:40"},{"nr":3,"start":"09:45","end":"10:35"},{"nr":4,"start":"10:50","end":"11:40"},{"nr":5,"start":"11:45","end":"12:35"},{"nr":6,"start":"12:40","end":"13:30"},{"nr":7,"start":"13:35","end":"14:25"},{"nr":8,"start":"14:30","end":"15:20"},{"nr":9,"start":"15:25","end":"16:15"},{"nr":10,"start":"16:20","end":"17:10"}]')
  ON CONFLICT (key) DO NOTHING;

  -- Seed base trigger function dynamically if not present
  CREATE OR REPLACE FUNCTION create_default_preferences()
  RETURNS TRIGGER AS $$
  BEGIN
      INSERT INTO user_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`).catch(err => logger.error('[Schema Setup]', 'Dynamic DB columns migration error', err));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*'
}));
app.use(express.json({ limit: '50mb' }));

// Middleware to inject pool and io
app.use((req, res, next) => {
  req.pool = pool;
  req.io = io;
  next();
});

// Authentication verify middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET || 'SuperSecureAustrianSchoolJwtSecretKey998877!', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Zu viele Anmeldeversuche. Bitte warten Sie 15 Minuten.' },
  standardHeaders: true,
  legacyHeaders: false
});

const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Zu viele Anfragen.' },
  standardHeaders: true,
  legacyHeaders: false
});

// High-throughput limiter for endpoints polled by many users simultaneously
// (e.g. /api/state fetched by all 370 users on page load / tab-focus).
// 500 requests per 15 minutes per IP is generous enough for a school NAT.
const stateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Zu viele Anfragen.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Export middleware for route files
module.exports = { authenticateToken, pool, io, loginLimiter, setupLimiter, stateLimiter };

// Socket.IO authentication and setup
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }
  jwt.verify(token, process.env.JWT_SECRET || 'SuperSecureAustrianSchoolJwtSecretKey998877!', (err, decoded) => {
    if (err) return next(new Error('Authentication error: Invalid token'));
    socket.user = decoded;
    next();
  });
});

const registerRoomHandlers = require('./sockets/roomHandler');
io.on('connection', (socket) => {
  socket.join('global_dashboard');
  registerRoomHandlers(io, socket, pool);
});

// Mount Routes
app.use('/api', require('./routes/api'));
app.use('/api/users', require('./routes/users'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/pupils', require('./routes/pupils'));
app.use('/api/gradebook', require('./routes/gradebook'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/lernwerkstatt', require('./routes/lernwerkstatt'));
app.use('/api/student', require('./routes/student'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/help', require('./routes/help'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/participation', require('./routes/participation'));
const pushModule = require('./routes/push');

app.use('/api/push', pushModule.router);
app.use('/api/users/preferences', pushModule.preferencesRouter);

// Automated Schedulers
const executedTriggers = new Set();
const BACKUP_RETENTION_DAYS = 14;

const triggerLessonBoundaryReset = async (lessonNumber) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const triggerKey = `${todayStr}-lesson-${lessonNumber}`;
  if (executedTriggers.has(triggerKey)) return;
  executedTriggers.add(triggerKey);

  logger.info('[Scheduler]', `Executing lesson boundary reset for Lesson ${lessonNumber}`);
  try {
    // 1. Snapshot Lernwerkstatt
    const lwRoomRes = await pool.query("SELECT id FROM rooms WHERE name = 'Lernwerkstatt' LIMIT 1");
    if (lwRoomRes.rows.length > 0) {
      const lwRoomId = lwRoomRes.rows[0].id;
      const snapshotRes = await pool.query(`
        SELECT p.id, u.full_name, c.name as class_name
        FROM allocation_logs a
        JOIN pupils p ON a.pupil_id = p.id
        JOIN users u ON p.user_id = u.id
        LEFT JOIN classes c ON p.class_id = c.id
        WHERE a.is_active = true AND a.to_room_id = $1
      `, [lwRoomId]);

      if (snapshotRes.rows.length > 0) {
        const pIds = snapshotRes.rows.map(r => r.id);
        const pNames = snapshotRes.rows.map(r => r.full_name);
        const cNames = snapshotRes.rows.map(r => r.class_name || '');
        await pool.query(`
          INSERT INTO lernwerkstatt_snapshots (lesson_number, pupil_ids, pupil_names, class_names)
          VALUES ($1, $2, $3, $4)
        `, [lessonNumber, pIds, pNames, cNames]);
      }
    }

    // 2. Reset all pupils to Klassenzimmer
    const kzRoomRes = await pool.query("SELECT id FROM rooms WHERE name = 'Klassenzimmer' LIMIT 1");
    const kzRoomId = kzRoomRes.rows.length > 0 ? kzRoomRes.rows[0].id : 1;

    await pool.query("UPDATE allocation_logs SET is_active = false WHERE is_active = true");
    await pool.query(`
      INSERT INTO allocation_logs (pupil_id, to_room_id, lesson_number, is_active)
      SELECT id, $1, $2, true FROM pupils
    `, [kzRoomId, lessonNumber]);

    // 3. Emit reset broadcast
    io.emit('lesson_reset', { resetToRoomId: kzRoomId });
  } catch (err) {
    logger.error('[Scheduler]', 'Error executing lesson boundary reset', err);
  }
};

const triggerDailyBackup = async (slot) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const triggerKey = `${todayStr}-backup-${slot}`;
  if (executedTriggers.has(triggerKey)) return;
  executedTriggers.add(triggerKey);

  logger.info('[Scheduler]', `Starting backup for slot ${slot}...`);
  try {
    const tables = ['users', 'classes', 'pupils', 'rooms', 'subjects', 'assessment_categories', 'assessments', 'grades', 'pupil_subject_tags', 'disciplinary_notes', 'allocation_logs', 'student_learning_plan', 'help_requests'];
    const backupData = {};
    for (const t of tables) {
      try {
        const res = await pool.query(`SELECT * FROM ${t}`);
        backupData[t] = res.rows;
      } catch (tableErr) {
        logger.warn('[Scheduler]', `Skipping table ${t}: ${tableErr.message}`);
      }
    }

    // Determine target folder
    const backupDir = fs.existsSync('/opt/school-management/backups')
      ? '/opt/school-management/backups'
      : fs.existsSync('/backups')
      ? '/backups'
      : path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filename = `auto_backup_${todayStr}_${slot}.json`;
    const filepath = path.join(backupDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));
    logger.info('[Scheduler]', `Backup completed: ${filename}`);

    // Retention: delete backups older than BACKUP_RETENTION_DAYS days
    const cutoffMs = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('auto_backup_') && f.endsWith('.json'));

    for (const fname of files) {
      const fpath = path.join(backupDir, fname);
      try {
        const stat = fs.statSync(fpath);
        if (stat.mtimeMs < cutoffMs) {
          fs.unlinkSync(fpath);
          logger.info('[Scheduler]', `Deleted old backup: ${fname}`);
        }
      } catch (e) { /* ignore */ }
    }
  } catch (err) {
    logger.error('[Scheduler]', 'Error creating backup', err);
  }
};

// Scheduler Loop runs every 10 seconds
// Lesson boundaries are loaded from system_settings DB table (with hardcoded fallback)
const DEFAULT_LESSON_BOUNDARIES = {
  '07:55': 1,
  '08:50': 2,
  '09:45': 3,
  '10:50': 4,
  '11:45': 5,
  '12:40': 6,
  '13:35': 7,
  '14:30': 8,
  '15:25': 9,
  '16:20': 10,
  '18:00': 10
};

let cachedLessonBoundaries = DEFAULT_LESSON_BOUNDARIES;

// Refresh boundaries cache every 5 minutes from system_settings
const refreshLessonBoundaries = async () => {
  try {
    const res = await pool.query("SELECT value FROM system_settings WHERE key = 'lesson_boundaries'");
    if (res.rows.length > 0) {
      const parsed = JSON.parse(res.rows[0].value);
      if (parsed && typeof parsed === 'object') {
        cachedLessonBoundaries = parsed;
      }
    }
  } catch (err) {
    logger.warn('[Scheduler]', 'Could not refresh lesson boundaries from DB, using last known config', err.message);
  }
};

// Initial load and periodic refresh
refreshLessonBoundaries();
setInterval(refreshLessonBoundaries, 5 * 60 * 1000);

setInterval(() => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // Lesson boundary triggers (driven by DB-backed config)
  if (cachedLessonBoundaries[timeStr] !== undefined) {
    triggerLessonBoundaryReset(cachedLessonBoundaries[timeStr]);
  }

  // Backup triggers: 05:00 and 17:00 (every 12 hours)
  if (timeStr === '05:00') {
    triggerDailyBackup('05-00');
  }
  if (timeStr === '17:00') {
    triggerDailyBackup('17-00');
  }

  // Clear executedTriggers map at midnight
  if (timeStr === '00:00') {
    executedTriggers.clear();
  }
}, 10000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
