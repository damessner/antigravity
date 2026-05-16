const https = require('https');

async function restRequest(baseUrl, school, path, sessionId) {
  const url = `${baseUrl}/WebUntis/api/${path}?school=${school}`;
  console.log(`REST Request: ${url}`);
  
  const options = {
    headers: {
      'Cookie': `JSESSIONID=${sessionId}`,
      'Accept': 'application/json'
    }
  };

  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve(`ERROR (JSON): ${raw.substring(0, 100)}`);
          }
        } else {
          resolve(`FAILED (Status ${res.statusCode}): ${raw.substring(0, 100)}`);
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  const WebUntisClient = require('./services/webuntisClient');
  const school = 'PG9539789c-69f6-4c8a-9e50-e2343bfb3ec5';
  const url = 'https://playground.webuntis.com';
  const username = 'untis_monitor';
  const password = '1Antigravity!';

  const client = new WebUntisClient(school, url);
  try {
    console.log('--- Authenticating via JSON-RPC to get Session ID ---');
    await client.authenticate(username, password);
    const sid = client.sessionId;
    console.log('Session ID:', sid);

    console.log('\n--- Testing REST API (Experimental v1) ---');
    
    const endpoints = ['v1/classes', 'v1/teachers', 'v1/students', 'v1/subjects'];
    for (const ep of endpoints) {
      const result = await restRequest(url, school, ep, sid);
      if (typeof result === 'object') {
        console.log(`${ep}: SUCCESS (${result.length || Object.keys(result).length} items)`);
      } else {
        console.log(`${ep}: ${result}`);
      }
    }

    await client.logout();
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

test();
