const { Pool } = require('pg');

async function test() {
  const passwords = ['SuperSecretSchoolDbPass2026!', 'postgres', 'admin', ''];
  for (const pw of passwords) {
    console.log(`Testing password: "${pw}"`);
    const pool = new Pool({
      host: 'localhost',
      port: 5433,
      user: 'postgres',
      password: pw,
      database: 'postgres' // connect to default db first
    });
    try {
      await pool.query('SELECT 1');
      console.log(`Success with password: "${pw}"`);
      process.exit(0);
    } catch (err) {
      console.log(`Failed: ${err.message}`);
    } finally {
      await pool.end();
    }
  }
  console.log('All attempts failed');
  process.exit(1);
}

test();
