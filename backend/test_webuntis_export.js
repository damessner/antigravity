const https = require('https');

async function exportRequest(baseUrl, school, type, user, password) {
  const url = `${baseUrl}/WebUntis/export.do?type=${type}&school=${school}&user=${user}&password=${password}`;
  console.log(`Export Request: ${url.replace(password, '••••••••')}`);
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(raw);
        } else {
          resolve(`FAILED (Status ${res.statusCode}): ${raw.substring(0, 100)}`);
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  const school = 'PG9539789c-69f6-4c8a-9e50-e2343bfb3ec5';
  const url = 'https://playground.webuntis.com';
  const username = 'untis_monitor';
  const password = '1Antigravity!';

  console.log('--- Testing Export API (Experimental) ---');
  
  const types = ['classes', 'teachers', 'students', 'subjects'];
  for (const t of types) {
    const result = await exportRequest(url, school, t, username, password);
    if (result.startsWith('FAILED')) {
      console.log(`${t}: ${result}`);
    } else {
      console.log(`${t}: SUCCESS (${result.length} bytes)`);
      console.log(`  Preview: ${result.substring(0, 50).replace(/\r\n/g, ' ')}...`);
    }
  }
}

test();
