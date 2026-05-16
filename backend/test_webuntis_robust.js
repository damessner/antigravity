const WebUntisClient = require('./services/webuntisClient');

async function testMethod(client, name, method) {
  process.stdout.write(`Fetching ${name}... `);
  try {
    const data = await client[method]();
    console.log(`SUCCESS (${data.length} items)`);
    if (data.length > 0) {
      console.log(`  Sample: ${JSON.stringify(data[0].name || data[0].firstName + ' ' + data[0].lastName || data[0].id)}`);
    }
    return true;
  } catch (err) {
    console.log(`FAILED (${err.message})`);
    return false;
  }
}

async function test() {
  const school = 'PG9539789c-69f6-4c8a-9e50-e2343bfb3ec5';
  const url = 'https://playground.webuntis.com';
  const username = 'untis_monitor';
  const password = '1Antigravity!';

  console.log('--- Comprehensive WebUntis API Test ---');
  const client = new WebUntisClient(school, url);
  try {
    console.log('Authenticating...');
    await client.authenticate(username, password);
    console.log('Authentication successful!');

    await testMethod(client, 'Classes', 'getClasses');
    await testMethod(client, 'Teachers', 'getTeachers');
    await testMethod(client, 'Students', 'getStudents');
    await testMethod(client, 'Subjects', 'getSubjects');

    await client.logout();
    console.log('Logout successful.');
  } catch (err) {
    console.error('CRITICAL ERROR:', err.message);
  }
}

test();
