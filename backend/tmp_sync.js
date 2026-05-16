const { Pool } = require('pg');
const { syncFromWebUntis } = require('./services/webuntisSyncService');

async function testSync() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'SuperSecretSchoolDbPass2026!',
    database: process.env.DB_NAME || 'school_management'
  });

  const settings = {
    school: 'PG9539789c-69f6-4c8a-9e50-e2343bfb3ec5',
    url: 'https://playground.webuntis.com',
    username: 'untis_monitor',
    password: '1Antigravity!'
  };

  console.log('--- Updating system settings in DB ---');
  await pool.query(`INSERT INTO system_settings (key, value) VALUES ('webuntis_school', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [settings.school]);
  await pool.query(`INSERT INTO system_settings (key, value) VALUES ('webuntis_url', $2) ON CONFLICT (key) DO UPDATE SET value = $2`, [settings.url]);
  await pool.query(`INSERT INTO system_settings (key, value) VALUES ('webuntis_username', $3) ON CONFLICT (key) DO UPDATE SET value = $3`, [settings.username]);
  await pool.query(`INSERT INTO system_settings (key, value) VALUES ('webuntis_password', $4) ON CONFLICT (key) DO UPDATE SET value = $4`, [settings.password]);

  console.log('--- Starting WebUntis Sync ---');
  try {
    const result = await syncFromWebUntis(pool, settings);
    console.log('Sync result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Sync failed:', err.message);
  } finally {
    await pool.end();
  }
}

testSync();
