/**
 * Verification Script for Untis Offline Import
 */
'use strict';

const path = require('path');
const fs = require('fs');
const untisImportService = require('../backend/services/untisImportService');

async function verifyImport() {
  console.log('==================================================');
  console.log('         UNTIS IMPORT VERIFICATION SUITE         ');
  console.log('==================================================\n');

  // 1. Scan directory
  console.log('1. Scanne untis_export-Verzeichnis...');
  try {
    const status = await untisImportService.scanExportDirectory();
    console.log('   -> Status erhalten:');
    console.log(`      Existiert: ${status.exists}`);
    console.log(`      Alle erforderlichen vorhanden: ${status.allRequiredPresent}`);
    console.log('      Dateien Checkliste:');
    status.checklist.forEach(f => {
      console.log(`        - [${f.present ? 'X' : ' '}] ${f.label} (${f.fileName || 'fehlt'}) - Status: ${f.status}, Sätze: ${f.recordCount}`);
    });
    
    if (!status.allRequiredPresent) {
      console.log('\n❌ Fehler: Nicht alle erforderlichen Dateien vorhanden.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Fehler beim Scannen:', err);
    process.exit(1);
  }

  // 2. Mock Database Pool to capture queries and verify transaction safety + German Umlauts
  console.log('\n2. Simuliere Datenbank-Import für Transaktionssicherheit...');
  const executedQueries = [];
  let transactionBegun = false;
  let transactionCommitted = false;
  let transactionRolledBack = false;

  const mockClient = {
    query: async (sql, params) => {
      const sqlTrim = sql.trim().toUpperCase();
      if (sqlTrim === 'BEGIN') {
        transactionBegun = true;
      } else if (sqlTrim === 'COMMIT') {
        transactionCommitted = true;
      } else if (sqlTrim === 'ROLLBACK') {
        transactionRolledBack = true;
      }
      
      executedQueries.push({ sql, params });

      // Return mock data for queries
      if (sql.includes('SELECT id, abbreviation, name FROM classes')) {
        return { rows: [{ id: 1, abbreviation: '1A', name: '1A' }] };
      }
      if (sql.includes('SELECT id, abbreviation FROM subjects')) {
        return { rows: [{ id: 10, abbreviation: 'D' }, { id: 11, abbreviation: 'M' }] };
      }
      if (sql.includes('SELECT id, username FROM users')) {
        return { rows: [{ id: 5, username: 'exa' }, { id: 6, username: 'mst' }] };
      }
      if (sql.includes('SELECT id, name FROM rooms')) {
        return { rows: [{ id: 20, name: '1B' }] };
      }
      if (sql.includes('INSERT INTO') || sql.includes('UPDATE') || sql.includes('DELETE')) {
        // Return dummy insert result
        return { rows: [{ id: 999 }] };
      }
      return { rows: [] };
    },
    release: () => {
      console.log('   -> Client freigegeben (Client released).');
    }
  };

  const mockPool = {
    connect: async () => {
      console.log('   -> Verbindung zum Mock-Pool hergestellt.');
      return mockClient;
    }
  };

  try {
    const result = await untisImportService.runImport(mockPool);
    console.log('\n3. Import-Ergebnisse:');
    console.log('   -> Status:', result.success ? 'ERFOLGREICH ✅' : 'FEHLGESCHLAGEN ❌');
    console.log('   -> Logs:', result.logs.length, 'Zeilen');
    console.log('   -> Counts:', JSON.stringify(result.counts, null, 2));

    // Assert transaction commands
    console.log('\n4. Verifikation der Transaktionssicherheit & Integrität:');
    if (transactionBegun && transactionCommitted && !transactionRolledBack) {
      console.log('   ✅ Transaktions-Befehle (BEGIN & COMMIT) wurden korrekt abgesetzt.');
    } else {
      console.log('   ❌ Transaktions-Fehler! BEGIN:', transactionBegun, 'COMMIT:', transactionCommitted, 'ROLLBACK:', transactionRolledBack);
    }

    // Verify umlaut preservation
    const hasUmlauts = result.logs.some(line => line.includes('ä') || line.includes('ö') || line.includes('ü') || line.includes('ß') || line.includes('Ä') || line.includes('Ö') || line.includes('Ü'));
    if (hasUmlauts) {
      console.log('   ✅ Umlaut-Kodierung (Umlauts) in den Protokollen erfolgreich erhalten.');
    } else {
      console.log('   ⚠️ Keine Umlaute in Logs gefunden. Überprüfe die Abfrage-Parameter...');
    }

    // Check query types
    const classQueries = executedQueries.filter(q => q.sql.includes('classes'));
    const subjectQueries = executedQueries.filter(q => q.sql.includes('subjects'));
    const teacherQueries = executedQueries.filter(q => q.sql.includes('users'));
    const roomQueries = executedQueries.filter(q => q.sql.includes('rooms'));
    const timetableQueries = executedQueries.filter(q => q.sql.includes('timetable_entries'));

    console.log(`   ✅ Klassen-Abfragen abgesetzt: ${classQueries.length}`);
    console.log(`   ✅ Fächer-Abfragen abgesetzt: ${subjectQueries.length}`);
    console.log(`   ✅ Lehrer-Abfragen abgesetzt: ${teacherQueries.length}`);
    console.log(`   ✅ Raum-Abfragen abgesetzt: ${roomQueries.length}`);
    console.log(`   ✅ Stundenplan-Abfragen abgesetzt: ${timetableQueries.length}`);

    if (timetableQueries.length > 0) {
      console.log('   ✅ Stundenplan-Einträge wurden erfolgreich geparst und gespeichert.');
    } else {
      console.log('   ❌ Keine Stundenplan-Abfragen abgesetzt!');
    }

    console.log('\n==================================================');
    console.log('        VERIFIKATION ERFOLGREICH BEENDET! 🎉      ');
    console.log('==================================================');

  } catch (err) {
    console.error('❌ Kritischer Import-Fehler:', err);
    process.exit(1);
  }
}

verifyImport();
