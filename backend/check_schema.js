const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'SuperSecretSchoolDbPass2026!',
  database: 'school_management'
});

async function run() {
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log(res.rows.map(r => r.table_name));
  
  // Also check pupil_subject_tags if it exists
  try {
    const columns = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pupil_subject_tags'");
    console.log('pupil_subject_tags columns:', columns.rows);
  } catch (e) {
    console.log('pupil_subject_tags does not exist or error:', e.message);
  }

  process.exit(0);
}
run();
