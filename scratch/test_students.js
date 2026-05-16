'use strict';

const WebUntisClient = require('../backend/services/webuntisClient');

async function main() {
  const school = 'PG9539789c-69f6-4c8a-9e50-e2343bfb3ec5';
  const url = 'https://playground.webuntis.com';
  const user = 'untis_monitor';
  const pw = '1Antigravity!';

  const client = new WebUntisClient(school, url);

  try {
    console.log('--- Authenticating ---');
    await client.authenticate(user, pw);
    console.log('Session ID:', client.sessionId);

    console.log('\n--- Fetching Students ---');
    const students = await client.getStudents();
    console.log(`Found ${students.length} students.`);
    if (students.length > 0) {
        console.log('First Student:', JSON.stringify(students[0], null, 2));
    }

    await client.logout();
    console.log('\n--- Done ---');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

main();
