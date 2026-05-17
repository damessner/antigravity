'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const { encryptSecret, decryptSecret } = require('../utils/secretStore');

const CTX = '[BackupService]';
const ONEDRIVE_SCOPES = 'offline_access Files.ReadWrite';

const SETTINGS_KEYS = [
  'school_name',
  'backup_provider',
  'backup_enabled',
  'backup_retention_days',
  'backup_admin_hourly_enabled',
  'backup_teacher_sync_enabled',
  'backup_teacher_sync_delay_minutes',
  'backup_admin_root_template',
  'backup_teacher_root',
  'backup_last_admin_sync',
  'backup_last_admin_status',
  'backup_last_admin_error',
  'backup_last_admin_provider',
  'backup_next_run_at',
  'backup_last_teacher_sync',
  'backup_last_teacher_status',
  'backup_last_teacher_error',
  'backup_onedrive_client_id',
  'backup_onedrive_tenant_id',
  'backup_onedrive_redirect_uri',
  'backup_onedrive_client_secret',
  'backup_onedrive_access_token',
  'backup_onedrive_access_token_expires_at',
  'backup_onedrive_refresh_token',
  'backup_s3_enabled',
  'backup_google_drive_enabled'
];

const SECRET_KEYS = new Set([
  'backup_onedrive_client_secret',
  'backup_onedrive_access_token',
  'backup_onedrive_refresh_token'
]);

const teacherSyncTimers = new Map();

const defaultSettings = {
  backup_provider: 'local',
  backup_enabled: 'true',
  backup_retention_days: '14',
  backup_admin_hourly_enabled: 'true',
  backup_teacher_sync_enabled: 'true',
  backup_teacher_sync_delay_minutes: '5',
  backup_admin_root_template: 'Antigravity{school_name}Backup',
  backup_teacher_root: 'AntigravityGradebooks',
  backup_onedrive_tenant_id: 'common',
  backup_s3_enabled: 'false',
  backup_google_drive_enabled: 'false'
};

function getLocalBackupRoot() {
  if (fs.existsSync('/opt/school-management/backups')) return '/opt/school-management/backups';
  if (fs.existsSync('/backups')) return '/backups';
  return path.join(__dirname, '../../backups');
}

function sanitizePathPart(input) {
  return String(input || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '')
    .slice(0, 80);
}

function toTimestampFolder(now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${d}_${h}-${m}`;
}

function toNextHourlyIso(now = new Date()) {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.toISOString();
}

async function upsertSetting(pool, key, value) {
  await pool.query(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `, [key, String(value ?? '')]);
}

async function upsertSettings(pool, entries) {
  for (const [key, rawValue] of Object.entries(entries || {})) {
    if (!SETTINGS_KEYS.includes(key)) continue;
    if (SECRET_KEYS.has(key)) {
      if (!rawValue) continue;
      if (rawValue === '••••••••') continue;
      await upsertSetting(pool, key, encryptSecret(rawValue));
      continue;
    }
    await upsertSetting(pool, key, rawValue);
  }
}

async function loadSettings(pool, { includeSecrets = false } = {}) {
  const res = await pool.query(`
    SELECT key, value FROM system_settings
    WHERE key = ANY($1::text[])
  `, [SETTINGS_KEYS]);

  const settings = { ...defaultSettings };
  for (const row of res.rows) settings[row.key] = row.value;

  if (includeSecrets) {
    for (const key of SECRET_KEYS) {
      if (!settings[key]) continue;
      settings[key] = decryptSecret(settings[key]).value;
    }
  } else {
    for (const key of SECRET_KEYS) {
      settings[key] = settings[key] ? '••••••••' : '';
    }
  }

  return {
    ...settings,
    backup_retention_days: String(settings.backup_retention_days || '14'),
    backup_teacher_sync_delay_minutes: String(settings.backup_teacher_sync_delay_minutes || '5')
  };
}

async function seedDefaults(pool) {
  for (const [key, value] of Object.entries(defaultSettings)) {
    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO NOTHING
    `, [key, String(value)]);
  }
}

function boolSetting(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).toLowerCase() === 'true';
}

function intSetting(v, fallback) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function graphRequest(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

async function getOneDriveToken(pool, settings) {
  const now = Date.now();
  const expiresAt = Number(settings.backup_onedrive_access_token_expires_at || 0);
  if (settings.backup_onedrive_access_token && expiresAt > now + 30_000) {
    return settings.backup_onedrive_access_token;
  }

  if (!settings.backup_onedrive_refresh_token || !settings.backup_onedrive_client_id) {
    throw new Error('OneDrive OAuth ist nicht vollständig konfiguriert');
  }

  const tenant = settings.backup_onedrive_tenant_id || 'common';
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: settings.backup_onedrive_client_id,
    refresh_token: settings.backup_onedrive_refresh_token,
    grant_type: 'refresh_token',
    scope: ONEDRIVE_SCOPES
  });

  if (settings.backup_onedrive_client_secret) {
    body.set('client_secret', settings.backup_onedrive_client_secret);
  }
  if (settings.backup_onedrive_redirect_uri) {
    body.set('redirect_uri', settings.backup_onedrive_redirect_uri);
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneDrive token refresh fehlgeschlagen: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const expiresMs = now + ((Number(data.expires_in) || 3600) * 1000);
  await upsertSettings(pool, {
    backup_onedrive_access_token: data.access_token,
    backup_onedrive_access_token_expires_at: String(expiresMs),
    backup_onedrive_refresh_token: data.refresh_token || settings.backup_onedrive_refresh_token
  });

  return data.access_token;
}

async function ensureOneDriveFolder(pool, settings, folderPath) {
  const token = await getOneDriveToken(pool, settings);
  const segments = folderPath.split('/').filter(Boolean);
  let currentPath = '';

  for (const segment of segments) {
    const safeSegment = sanitizePathPart(segment);
    const parentPath = currentPath;
    currentPath = parentPath ? `${parentPath}/${safeSegment}` : safeSegment;

    try {
      await graphRequest(token, `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(currentPath)}?select=id,name`);
    } catch {
      const endpoint = parentPath
        ? `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(parentPath)}:/children`
        : 'https://graph.microsoft.com/v1.0/me/drive/root/children';
      await graphRequest(token, endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: safeSegment,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'replace'
        })
      });
    }
  }
}

async function oneDriveUploadBuffer(pool, settings, remotePath, buffer, contentType) {
  const token = await getOneDriveToken(pool, settings);
  const parts = remotePath.split('/').filter(Boolean);
  const fileName = parts.pop();
  const parentPath = parts.join('/');
  if (parentPath) await ensureOneDriveFolder(pool, settings, parentPath);

  const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent([...parts, fileName].join('/'))}:/content`;
  await graphRequest(token, endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
    body: buffer
  });
}

async function oneDrivePrune(pool, settings, rootFolder, retentionDays) {
  const token = await getOneDriveToken(pool, settings);
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const list = await graphRequest(
    token,
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(rootFolder)}:/children?$top=200&$select=id,name,createdDateTime,folder`
  ).catch(() => ({ value: [] }));

  for (const item of (list.value || [])) {
    if (!item.folder) continue;
    const createdMs = new Date(item.createdDateTime || 0).getTime();
    if (createdMs > 0 && createdMs < cutoff) {
      await graphRequest(token, `https://graph.microsoft.com/v1.0/me/drive/items/${item.id}`, { method: 'DELETE' }).catch(() => {});
    }
  }
}

function localWriteFile(relativePath, buffer) {
  const root = getLocalBackupRoot();
  const full = path.join(root, ...relativePath.split('/').filter(Boolean));
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, buffer);
}

function localPrune(rootFolder, retentionDays) {
  const root = getLocalBackupRoot();
  const target = path.join(root, ...rootFolder.split('/').filter(Boolean));
  if (!fs.existsSync(target)) return;

  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const children = fs.readdirSync(target, { withFileTypes: true });
  for (const c of children) {
    if (!c.isDirectory()) continue;
    const fp = path.join(target, c.name);
    const stat = fs.statSync(fp);
    if (stat.mtimeMs < cutoff) {
      fs.rmSync(fp, { recursive: true, force: true });
    }
  }
}

function localWriteLegacyAutoBackup(sections) {
  const root = getLocalBackupRoot();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const slot = `${String(now.getHours()).padStart(2, '0')}-00`;
  fs.writeFileSync(path.join(root, `auto_backup_${day}_${slot}.json`), JSON.stringify(sections, null, 2));
}

function localPruneLegacyAutoBackups(retentionDays) {
  const root = getLocalBackupRoot();
  if (!fs.existsSync(root)) return;
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const files = fs.readdirSync(root).filter((f) => f.startsWith('auto_backup_') && f.endsWith('.json'));
  for (const f of files) {
    const full = path.join(root, f);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
    } catch { /* noop */ }
  }
}

function resolveAdminRoot(template, schoolName) {
  const safeSchool = sanitizePathPart(schoolName || 'School');
  const raw = String(template || defaultSettings.backup_admin_root_template)
    .replaceAll('{school_name}', safeSchool)
    .replaceAll('{school}', safeSchool);
  return sanitizePathPart(raw) || `Antigravity${safeSchool}Backup`;
}

async function collectAdminSections(pool) {
  const tableGroups = {
    users: ['users', 'classes', 'pupils'],
    gradebooks: ['subjects', 'assessment_categories', 'assessments', 'grades', 'pupil_subject_tags'],
    notes: ['disciplinary_notes', 'help_requests', 'participation_logs'],
    rooms: ['rooms', 'allocation_logs', 'lernwerkstatt_snapshots']
  };

  const sections = {};
  for (const [section, tables] of Object.entries(tableGroups)) {
    const sectionData = {};
    for (const table of tables) {
      try {
        const q = await pool.query(`SELECT * FROM ${table} ORDER BY 1`);
        sectionData[table] = q.rows;
      } catch {
        sectionData[table] = [];
      }
    }
    sections[section] = sectionData;
  }
  return sections;
}

async function persistAdminStatus(pool, status, err, provider) {
  await upsertSettings(pool, {
    backup_last_admin_sync: new Date().toISOString(),
    backup_last_admin_status: status,
    backup_last_admin_error: err || '',
    backup_last_admin_provider: provider || ''
  });
}

async function persistTeacherStatus(pool, status, err) {
  await upsertSettings(pool, {
    backup_last_teacher_sync: new Date().toISOString(),
    backup_last_teacher_status: status,
    backup_last_teacher_error: err || ''
  });
}

async function runAdminBackup(pool) {
  const settings = await loadSettings(pool, { includeSecrets: true });
  const backupEnabled = boolSetting(settings.backup_enabled, true);
  const hourlyEnabled = boolSetting(settings.backup_admin_hourly_enabled, true);
  if (!backupEnabled || !hourlyEnabled) return { skipped: true };

  const retentionDays = intSetting(settings.backup_retention_days, 14);
  const schoolName = settings.school_name || 'School';
  const rootFolder = resolveAdminRoot(settings.backup_admin_root_template, schoolName);
  const tsFolder = toTimestampFolder();
  const sections = await collectAdminSections(pool);

  const provider = settings.backup_provider || 'local';
  const files = [
    { rel: `${rootFolder}/${tsFolder}/users/users.json`, content: sections.users },
    { rel: `${rootFolder}/${tsFolder}/gradebooks/gradebooks.json`, content: sections.gradebooks },
    { rel: `${rootFolder}/${tsFolder}/notes/notes.json`, content: sections.notes },
    { rel: `${rootFolder}/${tsFolder}/rooms/rooms.json`, content: sections.rooms },
    { rel: `${rootFolder}/${tsFolder}/system/full.json`, content: sections }
  ];

  try {
    if (provider === 'onedrive') {
      for (const f of files) {
        await oneDriveUploadBuffer(pool, settings, f.rel, Buffer.from(JSON.stringify(f.content, null, 2), 'utf8'), 'application/json');
      }
      await oneDrivePrune(pool, settings, rootFolder, retentionDays);
      localWriteLegacyAutoBackup(sections);
      localPruneLegacyAutoBackups(retentionDays);
      await persistAdminStatus(pool, 'success', '', 'onedrive');
    } else {
      for (const f of files) {
        localWriteFile(f.rel, Buffer.from(JSON.stringify(f.content, null, 2), 'utf8'));
      }
      localPrune(rootFolder, retentionDays);
      localWriteLegacyAutoBackup(sections);
      localPruneLegacyAutoBackups(retentionDays);
      await persistAdminStatus(pool, 'success', '', 'local');
    }
  } catch (err) {
    logger.error(CTX, 'Admin cloud backup failed; falling back to local storage', err);
    for (const f of files) {
      localWriteFile(f.rel, Buffer.from(JSON.stringify(f.content, null, 2), 'utf8'));
    }
    localPrune(rootFolder, retentionDays);
    localWriteLegacyAutoBackup(sections);
    localPruneLegacyAutoBackups(retentionDays);
    await persistAdminStatus(pool, 'fallback_local', err.message || 'cloud_error', 'local');
  }

  await upsertSetting(pool, 'backup_next_run_at', toNextHourlyIso());
  return { success: true };
}

async function buildTeacherWorkbook(pool, subjectId) {
  const subRes = await pool.query(`
    SELECT s.id, s.name, s.abbreviation, s.class_id, c.name as class_name
    FROM subjects s
    JOIN classes c ON c.id = s.class_id
    WHERE s.id = $1
  `, [Number(subjectId)]);
  if (subRes.rows.length === 0) throw new Error('Subject not found');
  const subject = subRes.rows[0];

  const catsRes = await pool.query('SELECT id, name FROM assessment_categories WHERE subject_id = $1 ORDER BY id', [Number(subjectId)]);
  const catMap = new Map(catsRes.rows.map((c) => [Number(c.id), c.name]));

  const pupilsRes = await pool.query(`
    SELECT p.id, u.full_name FROM pupils p
    JOIN users u ON u.id = p.user_id
    WHERE p.class_id = $1 ORDER BY u.full_name
  `, [Number(subject.class_id)]);
  const pupilMap = new Map(pupilsRes.rows.map((p) => [Number(p.id), p.full_name]));

  const gradesRes = await pool.query(`
    SELECT category_id, pupil_id, assessment_name, grade_value, date
    FROM grades
    WHERE category_id = ANY($1::int[])
    ORDER BY date DESC, id DESC
  `, [catsRes.rows.map((c) => c.id)]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Gradebook');
  ws.columns = [
    { header: 'Class', key: 'className', width: 16 },
    { header: 'Subject', key: 'subject', width: 16 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Assessment', key: 'assessment', width: 24 },
    { header: 'Pupil', key: 'pupil', width: 28 },
    { header: 'Grade', key: 'grade', width: 10 },
    { header: 'Date', key: 'date', width: 20 }
  ];

  ws.getRow(1).font = { bold: true };

  for (const g of gradesRes.rows) {
    ws.addRow({
      className: subject.class_name,
      subject: subject.abbreviation || subject.name,
      category: catMap.get(Number(g.category_id)) || String(g.category_id),
      assessment: g.assessment_name || '',
      pupil: pupilMap.get(Number(g.pupil_id)) || String(g.pupil_id),
      grade: g.grade_value || '',
      date: g.date ? new Date(g.date).toISOString() : ''
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return { subject, buffer: Buffer.from(buffer) };
}

async function runTeacherSync(pool, subjectId, actorUserId) {
  const settings = await loadSettings(pool, { includeSecrets: true });
  const backupEnabled = boolSetting(settings.backup_enabled, true);
  const teacherEnabled = boolSetting(settings.backup_teacher_sync_enabled, true);
  if (!backupEnabled || !teacherEnabled) return;

  const provider = settings.backup_provider || 'local';
  const teacherRoot = sanitizePathPart(settings.backup_teacher_root || 'AntigravityGradebooks');
  const { subject, buffer } = await buildTeacherWorkbook(pool, subjectId);
  const classPart = sanitizePathPart(subject.class_name || 'Class');
  const subPart = sanitizePathPart(subject.abbreviation || subject.name || 'Subject');
  const ts = toTimestampFolder();
  const filename = `${classPart}_${subPart}_${ts}.xlsx`;
  const relPath = `${teacherRoot}/${filename}`;

  try {
    if (provider === 'onedrive') {
      await oneDriveUploadBuffer(pool, settings, relPath, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      await persistTeacherStatus(pool, 'success', '');
    } else {
      localWriteFile(relPath, buffer);
      await persistTeacherStatus(pool, 'success', '');
    }
  } catch (err) {
    logger.error(CTX, `Teacher gradebook sync failed for subject ${subjectId}`, err);
    localWriteFile(relPath, buffer);
    await persistTeacherStatus(pool, 'fallback_local', err.message || 'cloud_error');
  }

  if (actorUserId) {
    logger.info(CTX, `Teacher sync executed for subject=${subjectId} actor=${actorUserId}`);
  }
}

async function scheduleTeacherSync(pool, subjectId, actorUserId) {
  const settings = await loadSettings(pool, { includeSecrets: true });
  const delayMinutes = intSetting(settings.backup_teacher_sync_delay_minutes, 5);
  const key = String(subjectId);

  if (teacherSyncTimers.has(key)) {
    clearTimeout(teacherSyncTimers.get(key));
  }

  const timer = setTimeout(async () => {
    teacherSyncTimers.delete(key);
    await runTeacherSync(pool, subjectId, actorUserId).catch((err) => {
      logger.error(CTX, 'Scheduled teacher sync failed', err);
    });
  }, delayMinutes * 60 * 1000);

  teacherSyncTimers.set(key, timer);
}

async function getCloudStatus(pool) {
  const settings = await loadSettings(pool);
  return {
    provider: settings.backup_provider || 'local',
    backup_enabled: settings.backup_enabled,
    backup_admin_hourly_enabled: settings.backup_admin_hourly_enabled,
    backup_teacher_sync_enabled: settings.backup_teacher_sync_enabled,
    backup_retention_days: settings.backup_retention_days,
    backup_last_admin_sync: settings.backup_last_admin_sync || null,
    backup_last_admin_status: settings.backup_last_admin_status || 'never',
    backup_last_admin_error: settings.backup_last_admin_error || '',
    backup_last_teacher_sync: settings.backup_last_teacher_sync || null,
    backup_last_teacher_status: settings.backup_last_teacher_status || 'never',
    backup_last_teacher_error: settings.backup_last_teacher_error || '',
    backup_next_run_at: settings.backup_next_run_at || null,
    queued_teacher_jobs: teacherSyncTimers.size,
    providers: {
      local: { enabled: true },
      onedrive: { enabled: true, configured: Boolean(settings.backup_onedrive_client_id) },
      s3: { enabled: settings.backup_s3_enabled === 'true', feature_flag: true },
      google_drive: { enabled: settings.backup_google_drive_enabled === 'true', feature_flag: true }
    }
  };
}

async function testProviderConnection(pool, provider) {
  const settings = await loadSettings(pool, { includeSecrets: true });
  const target = provider || settings.backup_provider || 'local';

  if (target === 'local') {
    const root = getLocalBackupRoot();
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
    return { success: true, provider: 'local' };
  }

  if (target === 'onedrive') {
    if (!settings.backup_onedrive_client_id) {
      throw new Error('OneDrive Client-ID fehlt');
    }
    const token = await getOneDriveToken(pool, settings);
    await graphRequest(token, 'https://graph.microsoft.com/v1.0/me/drive?$select=id,driveType');
    return { success: true, provider: 'onedrive' };
  }

  if (target === 's3' || target === 'google_drive') {
    return { success: false, provider: target, message: 'Feature-Flag aktiviert, Provider noch nicht implementiert' };
  }

  throw new Error('Unbekannter Backup-Provider');
}

function buildOneDriveAuthUrl(settings, state) {
  const tenant = settings.backup_onedrive_tenant_id || 'common';
  const redirectUri = settings.backup_onedrive_redirect_uri;
  if (!settings.backup_onedrive_client_id || !redirectUri) {
    throw new Error('OneDrive OAuth benötigt Client-ID und Redirect-URI');
  }

  const p = new URLSearchParams({
    client_id: settings.backup_onedrive_client_id,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: ONEDRIVE_SCOPES,
    state: state || 'antigravity-backup'
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${p.toString()}`;
}

async function exchangeOneDriveCode(pool, code) {
  const settings = await loadSettings(pool, { includeSecrets: true });
  const tenant = settings.backup_onedrive_tenant_id || 'common';
  if (!settings.backup_onedrive_client_id || !settings.backup_onedrive_redirect_uri) {
    throw new Error('OneDrive OAuth benötigt Client-ID und Redirect-URI');
  }

  const body = new URLSearchParams({
    client_id: settings.backup_onedrive_client_id,
    grant_type: 'authorization_code',
    code,
    redirect_uri: settings.backup_onedrive_redirect_uri,
    scope: ONEDRIVE_SCOPES
  });
  if (settings.backup_onedrive_client_secret) {
    body.set('client_secret', settings.backup_onedrive_client_secret);
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneDrive code exchange fehlgeschlagen: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const expiresMs = Date.now() + ((Number(data.expires_in) || 3600) * 1000);
  await upsertSettings(pool, {
    backup_onedrive_access_token: data.access_token,
    backup_onedrive_access_token_expires_at: String(expiresMs),
    backup_onedrive_refresh_token: data.refresh_token || ''
  });

  return { success: true };
}

module.exports = {
  seedDefaults,
  loadSettings,
  upsertSettings,
  getCloudStatus,
  testProviderConnection,
  runAdminBackup,
  scheduleTeacherSync,
  buildOneDriveAuthUrl,
  exchangeOneDriveCode
};
