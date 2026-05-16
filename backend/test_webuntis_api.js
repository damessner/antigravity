const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENC_PREFIX = 'enc:v1:';

const deriveKey = () => {
  const rawSecret =
    process.env.WEBUNTIS_SECRET_KEY
    || process.env.SYSTEM_SETTINGS_ENCRYPTION_KEY
    || process.env.JWT_SECRET
    || 'antigravity-default-dev-secret';
  return crypto.createHash('sha256').update(String(rawSecret)).digest();
};

const decryptSecret = (value) => {
  if (!value || !value.startsWith(ENC_PREFIX)) return value;
  const payload = value.slice(ENC_PREFIX.length);
  const parts = payload.split(':');
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
};

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'SuperSecretSchoolDbPass2026!',
  database: process.env.DB_NAME || 'school_management',
});

const WebUntisClient = require('./services/webuntisClient');

async function test() {
  console.log('--- WebUntis API Connection Test ---');
  try {
    const res = await pool.query("SELECT key, value FROM system_settings WHERE key LIKE 'webuntis_%'");
    const s = {};
    res.rows.forEach(row => { s[row.key] = row.value; });

    const password = decryptSecret(s.webuntis_password);
    const username = s.webuntis_username;
    const url = s.webuntis_url;
    let school = s.webuntis_school;

    if (!school && url) {
      const match = url.match(/school=([^&]+)/i);
      if (match) school = decodeURIComponent(match[1]);
    }

    console.log(`URL: ${url}`);
    console.log(`School: ${school}`);
    console.log(`Username: ${username}`);
    console.log(`Password Decrypted: ${password ? 'YES' : 'NO'}`);

    if (!username || !password || !url) {
      console.error('Missing settings in DB!');
      return;
    }

    const client = new WebUntisClient(school, url);
    console.log('Authenticating...');
    await client.authenticate(username, password);
    console.log('Authentication successful!');

    console.log('Fetching classes...');
    const classes = await client.getClasses();
    console.log(`Successfully fetched ${classes.length} classes.`);
    if (classes.length > 0) {
      console.log('First 3 classes:', classes.slice(0, 3).map(c => c.name).join(', '));
    }

    await client.logout();
    console.log('Logout successful.');
  } catch (err) {
    console.error('TEST FAILED:', err);
  } finally {
    await pool.end();
  }
}

test();
