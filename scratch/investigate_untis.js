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

    console.log('\n--- Trying getStudents with extra fields ---');
    try {
        const studentsFields = await client._request('getStudents', {
            fields: ['id', 'name', 'foreName', 'longName', 'gender', 'klassId', 'klasseName']
        });
        console.log(`getStudents with fields success! Count: ${studentsFields.length}`);
        if (studentsFields.length > 0) {
            console.log('First student with fields:', JSON.stringify(studentsFields[0], null, 2));
        }
    } catch (e) {
        console.error('getStudents with fields failed:', e.message);
    }

    try {
        const studentsShow = await client._request('getStudents', {
            showKlasse: true
        });
        console.log(`getStudents with showKlasse success! Count: ${studentsShow.length}`);
        if (studentsShow.length > 0) {
            console.log('First student with showKlasse:', JSON.stringify(studentsShow[0], null, 2));
        }
    } catch (e) {
        console.error('getStudents with showKlasse failed:', e.message);
    }
    try {
        // We try to get students. If it fails with "no right", we might have to use a different way.
        // But in the first run it worked! Let's try again.
        const students = await client.getStudents();
        console.log(`Found ${students.length} students.`);
        
        if (students.length > 0) {
            const s = students[0];
            console.log(`Testing with student: ${s.foreName} ${s.longName} (ID: ${s.id})`);
            
            const date = 20250915;
            const timetable = await client.getTimetable(s.id, 5, date, date + 4);
            console.log(`Fetched ${timetable.length} periods for student.`);
            
            const classCounts = {};
            for (const p of timetable) {
                if (p.kl && p.kl.length > 0) {
                    for (const k of p.kl) {
                        classCounts[k.id] = (classCounts[k.id] || 0) + 1;
                    }
                }
            }
            
            console.log('Class occurrence counts:', classCounts);
            const mostFrequent = Object.keys(classCounts).reduce((a, b) => classCounts[a] > classCounts[b] ? a : b, null);
            if (mostFrequent) {
                console.log(`DETERMINED CLASS ID: ${mostFrequent}`);
                const classObj = classes.find(c => c.id == mostFrequent);
                if (classObj) {
                    console.log(`Student ${s.foreName} ${s.longName} belongs to class ${classObj.name}`);
                }
            }
        }
    } catch (e) {
        console.error('Method 1 failed:', e.message);
    }

    await client.logout();
    console.log('\n--- Done ---');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

main();
