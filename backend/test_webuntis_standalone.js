const WebUntisClient = require('./services/webuntisClient');

async function test() {
  const school = 'PG9539789c-69f6-4c8a-9e50-e2343bfb3ec5';
  const url = 'https://playground.webuntis.com';
  const username = 'untis_monitor';
  const password = '1Antigravity!';

  console.log('--- Standalone WebUntis API Test (Playground) ---');
  console.log(`URL: ${url}`);
  console.log(`School: ${school}`);
  console.log(`Username: ${username}`);

  const client = new WebUntisClient(school, url);
  try {
    console.log('Authenticating...');
    await client.authenticate(username, password);
    console.log('Authentication successful!');

    console.log('Fetching classes...');
    const classes = await client.getClasses();
    console.log(`Successfully fetched ${classes.length} classes.`);
    if (classes.length > 0) {
      console.log('Sample classes:', classes.slice(0, 5).map(c => c.name).join(', '));
    }

    console.log('Fetching teachers...');
    const teachers = await client.getTeachers();
    console.log(`Successfully fetched ${teachers.length} teachers.`);
    if (teachers.length > 0) {
      console.log('Sample teachers:', teachers.slice(0, 3).map(t => t.name).join(', '));
    }

    console.log('Fetching students...');
    const students = await client.getStudents();
    console.log(`Successfully fetched ${students.length} students.`);
    if (students.length > 0) {
      console.log('Sample students:', students.slice(0, 3).map(s => `${s.firstName} ${s.lastName}`).join(', '));
    }

    await client.logout();
    console.log('Logout successful.');
    console.log('--- TEST PASSED ---');
  } catch (err) {
    console.error('TEST FAILED:', err.message);
  }
}

test();
