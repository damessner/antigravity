const { Pool } = require('pg');

async function check() {
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    user: 'postgres',
    password: 'SuperSecretSchoolDbPass2026!',
    database: 'school_management'
  });
  try {
    const res = await pool.query("SELECT username, role, full_name FROM users");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err.message);
  } finally {
    await pool.end();
  }
}

check();
