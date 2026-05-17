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
const SchedulerService = require('./services/schedulerService');
const backupService = require('./services/backupService');

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
  },
  pingInterval: Number(process.env.SOCKET_PING_INTERVAL_MS || 25000),
  pingTimeout: Number(process.env.SOCKET_PING_TIMEOUT_MS || 20000),
});

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'SuperSecretSchoolDbPass2026!',
  database: process.env.DB_NAME || 'school_management',
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 5000),
  maxUses: Number(process.env.DB_POOL_MAX_USES || 7500),
});

// Ensure SDL Schema fields exist seamlessly
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*'
}));
app.use(express.json({ limit: '50mb' }));

// ─── Database Health & Initialization ────────────────────────────────────────

/**
 * Ensures the database schema is present and applies dynamic migrations.
 * This function handles the full lifecycle of the DB schema from empty to updated.
 */
async function bootstrapDatabase() {
  const maxRetries = 10;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // 1. Basic Connectivity & Schema Check
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'users'
        );
      `);

      if (!tableCheck.rows[0].exists) {
        console.warn('[Database] EMPTY DATABASE DETECTED! Running init.sql bootstrap...');
        
        // Search multiple candidates for init.sql
        const candidates = [
          path.join(__dirname, 'db', 'init.sql'),
          path.join(__dirname, '..', 'db', 'init.sql'),
          '/usr/src/app/db/init.sql',
          '/opt/school-management/db/init.sql'
        ];
        
        let foundPath = null;
        for (const p of candidates) {
          if (fs.existsSync(p)) {
            foundPath = p;
            break;
          }
        }
        
        if (foundPath) {
          console.log(`[Database] Found init.sql at: ${foundPath}`);
          const initSql = fs.readFileSync(foundPath, 'utf8');
          await pool.query(initSql);
          console.log('[Database] init.sql executed successfully.');
        } else {
          throw new Error('init.sql not found in any expected location (/db, ../db, etc.)');
        }
      }

      // 2. Dynamic Migrations (Run only after base schema is guaranteed to exist)
      console.log('[Database] Running dynamic migrations...');
      await pool.query(`
        ALTER TABLE subjects DROP CONSTRAINT IF EXISTS uq_subject_class;
        ALTER TABLE assessment_categories ADD COLUMN IF NOT EXISTS is_self_directed BOOLEAN DEFAULT false;
        ALTER TABLE assessment_categories ADD COLUMN IF NOT EXISTS is_hidden_from_pupils BOOLEAN DEFAULT false;
        ALTER TABLE assessment_categories DROP COLUMN IF EXISTS default_deadline;
        ALTER TABLE grades ADD COLUMN IF NOT EXISTS student_planned_date DATE;
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT NULL;
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT FALSE;
        UPDATE rooms SET is_special = TRUE WHERE name IN ('TimeOut', 'Lernwerkstatt');

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

        CREATE TABLE IF NOT EXISTS subject_rank_config (
          id SERIAL PRIMARY KEY,
          subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
          rank_level INTEGER NOT NULL CHECK (rank_level IN (1, 2, 3)),
          rank_name VARCHAR(50) NOT NULL,
          rank_symbol VARCHAR(10) NOT NULL,
          CONSTRAINT uq_subject_rank_level UNIQUE (subject_id, rank_level)
        );

        -- WebUntis integration columns (added in v2.5)
        ALTER TABLE users    ADD COLUMN IF NOT EXISTS webuntis_id INTEGER DEFAULT NULL;
        ALTER TABLE users    ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT true;
        ALTER TABLE users    ADD COLUMN IF NOT EXISTS last_factsheet_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        ALTER TABLE users    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        ALTER TABLE users    ADD COLUMN IF NOT EXISTS erasure_due_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
        ALTER TABLE classes  ADD COLUMN IF NOT EXISTS webuntis_id INTEGER DEFAULT NULL;
        ALTER TABLE pupils   ADD COLUMN IF NOT EXISTS webuntis_id INTEGER DEFAULT NULL;

        CREATE TABLE IF NOT EXISTS user_erasure_audit (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          reason TEXT,
          export_snapshot JSONB NOT NULL
        );

        -- Karriere-Dashboard & Fun Insights
        CREATE TABLE IF NOT EXISTS achievements (
          id SERIAL PRIMARY KEY,
          pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL, -- 'rank_up', 'streak', 'top_performance'
          title VARCHAR(100) NOT NULL,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS fun_insights (
          id SERIAL PRIMARY KEY,
          title VARCHAR(200) NOT NULL,
          content TEXT NOT NULL,
          category VARCHAR(50) DEFAULT 'general',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        INSERT INTO system_settings (key, value) VALUES
          ('school_name', 'MS Weissenbach Telfs'),
          ('lesson_boundaries', '{"07:55":1,"08:50":2,"09:45":3,"10:50":4,"11:45":5,"12:40":6,"13:35":7,"14:30":8,"15:25":9,"16:20":10,"18:00":10}'),
          ('lesson_schedule', '[{"nr":1,"start":"07:55","end":"08:45"},{"nr":2,"start":"08:50","end":"09:40"},{"nr":3,"start":"09:45","end":"10:35"},{"nr":4,"start":"10:50","end":"11:40"},{"nr":5,"start":"11:45","end":"12:35"},{"nr":6,"start":"12:40","end":"13:30"},{"nr":7,"start":"13:35","end":"14:25"},{"nr":8,"start":"14:30","end":"15:20"},{"nr":9,"start":"15:25","end":"16:15"},{"nr":10,"start":"16:20","end":"17:10"}]'),
          ('webuntis_school', ''),
          ('webuntis_url', ''),
          ('webuntis_username', ''),
          ('webuntis_password', ''),
          ('webuntis_last_sync', ''),
          ('webuntis_sync_status', 'never'),
          ('webuntis_sync_result', '{}'),
          ('webuntis_sync_interval', '1'),
          ('data_retention_days', '90')
        ON CONFLICT (key) DO NOTHING;

        -- Seed initial Fun Insights
        INSERT INTO fun_insights (title, content, category)
        VALUES 
          ('Intergalaktische Pünktlichkeit', '98% aller Schüler sind heute pünktlich gelandet. Die Triebwerke laufen stabil!', 'status'),
          ('Die Aufsteiger der Woche', 'Die 3b hat ihren Notenschnitt um 0.4 Punkte verbessert. Warp-Antrieb aktiviert!', 'achievement'),
          ('Hausübungs-Helden', 'In der letzten Woche wurden 1.200 Hausübungen digital eingereicht. Ein neuer Rekord!', 'stat')
        ON CONFLICT DO NOTHING;
        CREATE OR REPLACE FUNCTION create_default_preferences()
        RETURNS TRIGGER AS $$
        BEGIN
            INSERT INTO user_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      console.log('[Database] Bootstrap complete.');
      return;
    } catch (err) {
      retries++;
      console.error(`[Database] Bootstrap error (Attempt ${retries}/${maxRetries}):`, err.message);
      if (retries >= maxRetries) {
         console.error('[Database] FATAL: Could not bootstrap database schema.');
         process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

// Start the sequential bootstrap
bootstrapDatabase().then(() => {
  backupService.seedDefaults(pool).catch((err) => {
    logger.error('[Bootstrap]', 'Failed to seed backup defaults', err);
  });
  const scheduler = new SchedulerService(pool);
  scheduler.start();
});

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

  jwt.verify(token, process.env.JWT_SECRET || 'SuperSecureAustrianSchoolJwtSecretKey998877!', async (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });

    try {
      const userRes = await pool.query(
        'SELECT id, role, requires_password_change, is_active FROM users WHERE id = $1 LIMIT 1',
        [user.id]
      );

      if (userRes.rows.length === 0 || userRes.rows[0].is_active === false) {
        return res.status(403).json({ error: 'Benutzerkonto ist nicht aktiv' });
      }

      const dbUser = userRes.rows[0];
      req.user = {
        ...user,
        role: dbUser.role,
        requires_password_change: dbUser.requires_password_change
      };

      const isPasswordChangeEndpoint = req.path === '/change-password' || req.originalUrl?.endsWith('/users/change-password');
      if (dbUser.requires_password_change && !isPasswordChangeEndpoint) {
        return res.status(423).json({
          error: 'Passwortänderung erforderlich',
          code: 'PASSWORD_CHANGE_REQUIRED'
        });
      }

      next();
    } catch (dbErr) {
      console.error('Token verification DB check failed:', dbErr);
      return res.status(500).json({ error: 'Authentifizierung fehlgeschlagen' });
    }
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
  max: 150, // Increased from 30 to 150 to prevent blocking admins during configuration
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

const authenticatedApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { error: 'Zu viele Anfragen.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const authHeader = req.headers['authorization'];
    return !authHeader;
  }
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
const socketHeartbeatMap = new Map();
io.on('connection', (socket) => {
  socket.join('global_dashboard');
  socketHeartbeatMap.set(socket.id, Date.now());

  socket.conn.on('packet', (packet) => {
    if (packet?.type === 'pong') {
      socketHeartbeatMap.set(socket.id, Date.now());
    }
  });

  socket.on('join_admin_debug', () => {
    if (socket.user?.role === 'admin') {
      socket.join('admin_debug');
    }
  });

  socket.on('disconnect', () => {
    socketHeartbeatMap.delete(socket.id);
  });

  registerRoomHandlers(io, socket, pool);
});

logger.onEntry((entry) => {
  io.to('admin_debug').emit('admin_log', entry);
});

// Mount Routes
app.use('/api', authenticatedApiLimiter);
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
app.use('/api/webuntis', require('./routes/webuntis'));
app.use('/api/karriere', require('./routes/karriere'));
const pushModule = require('./routes/push');

app.use('/api/push', pushModule.router);
app.use('/api/users/preferences', pushModule.preferencesRouter);

// Automated Schedulers
const executedTriggers = new Set();
const BACKUP_RETENTION_DAYS = 14;
const MAINTENANCE_HEALTH_CHECK_MS = Number(process.env.MAINTENANCE_HEALTH_CHECK_MS || 5 * 60 * 1000);
const MAINTENANCE_REQUIRED_DEGRADES = Number(process.env.MAINTENANCE_REQUIRED_DEGRADES || 3);
const MAINTENANCE_MAX_RSS_MB = Number(process.env.MAINTENANCE_MAX_RSS_MB || 1200);
const MAINTENANCE_MAX_DB_WAITING = Number(process.env.MAINTENANCE_MAX_DB_WAITING || 30);
const MAINTENANCE_MAX_STALE_SOCKETS = Number(process.env.MAINTENANCE_MAX_STALE_SOCKETS || 10);
const MAINTENANCE_TRIGGER_EXIT = String(process.env.AUTO_MAINTENANCE_EXIT_ON_TRIGGER || 'true').toLowerCase() !== 'false';
const MAINTENANCE_PENDING_PATH = process.env.MAINTENANCE_PENDING_FILE
  || '/opt/school-management/school_data/MAINTENANCE_RESTART_PENDING';
let degradedHealthStreak = 0;

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

const triggerHourlyBackup = async () => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const hour = String(now.getHours()).padStart(2, '0');
  const triggerKey = `${todayStr}-backup-${hour}`;
  if (executedTriggers.has(triggerKey)) return;
  executedTriggers.add(triggerKey);

  logger.info('[Scheduler]', `Starting hourly backup for ${hour}:00...`);
  try {
    await backupService.runAdminBackup(pool);
    logger.info('[Scheduler]', 'Hourly backup completed');
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

const parseMinutes = (timeStr) => {
  const [h, m] = String(timeStr).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h * 60) + m;
};

const getSchoolDayWindow = (boundaries) => {
  const minuteValues = Object.keys(boundaries || {})
    .map(parseMinutes)
    .filter((v) => v !== null)
    .sort((a, b) => a - b);
  if (minuteValues.length === 0) return { start: 8 * 60, end: 17 * 60 };
  return { start: minuteValues[0], end: minuteValues[minuteValues.length - 1] };
};

const isSchoolBreakWindow = (now) => {
  const day = now.getDay();
  if (day === 0 || day === 6) return true; // Weekend
  const mins = now.getHours() * 60 + now.getMinutes();
  const { start, end } = getSchoolDayWindow(cachedLessonBoundaries);
  return mins < start || mins > end;
};

const getRuntimeHealthSnapshot = () => {
  const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  const staleCutoff = Date.now() - (Number(process.env.SOCKET_STALE_THRESHOLD_MS || 90000));
  let staleSockets = 0;
  for (const ts of socketHeartbeatMap.values()) {
    if (ts < staleCutoff) staleSockets += 1;
  }
  return {
    rssMb,
    dbTotal: pool.totalCount,
    dbIdle: pool.idleCount,
    dbWaiting: pool.waitingCount,
    staleSockets,
    socketClients: io.engine.clientsCount,
  };
};

const triggerAutomatedMaintenanceRestart = (snapshot) => {
  try {
    const markerDir = path.dirname(MAINTENANCE_PENDING_PATH);
    if (!fs.existsSync(markerDir)) fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(MAINTENANCE_PENDING_PATH, JSON.stringify({
      created_at: new Date().toISOString(),
      reason: 'automated_maintenance_window_health_degradation',
      snapshot,
    }, null, 2));
  } catch (err) {
    logger.warn('[Maintenance]', `Failed to write maintenance marker file: ${err.message}`);
  }

  logger.warn('[Maintenance]', `Automated maintenance restart triggered (rss=${snapshot.rssMb}MB, waiting=${snapshot.dbWaiting}, staleSockets=${snapshot.staleSockets})`);
  if (MAINTENANCE_TRIGGER_EXIT) {
    process.exit(1);
  }
};

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

// Socket + DB runtime health audit loop
setInterval(() => {
  const snapshot = getRuntimeHealthSnapshot();

  // Force-close stale sockets to prevent idle heap growth in degraded networks
  const staleCutoff = Date.now() - (Number(process.env.SOCKET_STALE_THRESHOLD_MS || 90000));
  for (const [socketId, ts] of socketHeartbeatMap.entries()) {
    if (ts < staleCutoff) {
      const staleSocket = io.sockets.sockets.get(socketId);
      if (staleSocket) staleSocket.disconnect(true);
      socketHeartbeatMap.delete(socketId);
    }
  }

  const degraded = snapshot.rssMb >= MAINTENANCE_MAX_RSS_MB
    || snapshot.dbWaiting >= MAINTENANCE_MAX_DB_WAITING
    || snapshot.staleSockets >= MAINTENANCE_MAX_STALE_SOCKETS;

  if (degraded) {
    degradedHealthStreak += 1;
    logger.warn('[Health]', `Degraded metrics streak=${degradedHealthStreak} rss=${snapshot.rssMb}MB dbWaiting=${snapshot.dbWaiting} staleSockets=${snapshot.staleSockets}`);
  } else {
    if (degradedHealthStreak > 0) {
      logger.info('[Health]', 'Metrics recovered; maintenance streak reset');
    }
    degradedHealthStreak = 0;
  }

  if (degradedHealthStreak >= MAINTENANCE_REQUIRED_DEGRADES && isSchoolBreakWindow(new Date())) {
    triggerAutomatedMaintenanceRestart(snapshot);
    degradedHealthStreak = 0;
  }
}, MAINTENANCE_HEALTH_CHECK_MS);

setInterval(() => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // Lesson boundary triggers (driven by DB-backed config)
  if (cachedLessonBoundaries[timeStr] !== undefined) {
    triggerLessonBoundaryReset(cachedLessonBoundaries[timeStr]);
  }

  // Backup trigger: hourly at minute 00
  if (minutes === '00') {
    triggerHourlyBackup();
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
