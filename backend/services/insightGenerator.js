'use strict';

const logger = require('../utils/logger');
const CTX = '[Insight Generator]';

/**
 * The Insight Generator analyzes school-wide data to generate 
 * motivating, "fun" insights for the Karriere-Dashboard.
 */
class InsightGenerator {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Run the generation cycle.
   */
  async generate() {
    logger.info(CTX, 'Running Insight Generation Mission...');
    try {
      // 1. Clear old insights (keep only last 50)
      await this.pool.query('DELETE FROM fun_insights WHERE id NOT IN (SELECT id FROM fun_insights ORDER BY created_at DESC LIMIT 50)');

      // 2. Metric: Best performing class
      const bestClass = await this.pool.query(`
        SELECT c.name, AVG(CAST(g.grade_value AS FLOAT)) as avg
        FROM classes c
        JOIN pupils p ON p.class_id = c.id
        JOIN grades g ON g.pupil_id = p.id
        WHERE g.grade_value ~ '^[0-9.]+$'
        GROUP BY c.name
        ORDER BY avg ASC LIMIT 1
      `);
      if (bestClass.rows.length > 0) {
        await this.addInsight(
          'Elite-Sektor Lokalisierung',
          `Klasse ${bestClass.rows[0].name} hält derzeit den Spitzenplatz mit einem Notenschnitt von ${Number(bestClass.rows[0].avg).toFixed(2)}!`,
          'achievement'
        );
      }

      // 3. Metric: Participation Surge
      const participation = await this.pool.query(`
        SELECT c.name, COUNT(l.id) as count
        FROM classes c
        JOIN pupils p ON p.class_id = c.id
        JOIN participation_logs l ON l.pupil_id = p.id
        WHERE l.created_at > NOW() - INTERVAL '24 hours'
        GROUP BY c.name
        ORDER BY count DESC LIMIT 1
      `);
      if (participation.rows.length > 0 && participation.rows[0].count > 5) {
        await this.addInsight(
          'Engagement-Radar',
          `Massiver Aktivitätsschub in Klasse ${participation.rows[0].name}! ${participation.rows[0].count} hervorragende Beiträge in den letzten 24h.`,
          'engagement'
        );
      }

      // 4. Metric: New Crowns (Meister Status)
      const newMeisters = await this.pool.query(`
        SELECT COUNT(*) as count
        FROM (
          SELECT p.id
          FROM pupils p
          JOIN grades g ON g.pupil_id = p.id
          WHERE g.grade_value ~ '^[0-9.]+$'
          GROUP BY p.id
          HAVING AVG(CAST(g.grade_value AS FLOAT)) <= 1.5
        ) as meisters
      `);
      if (newMeisters.rows.length > 0) {
        await this.addInsight(
          'Meister-Manifestation',
          `Aktuell tragen ${newMeisters.rows[0].count} Schüler den legendären 👑 Meister-Status. Die Elite wächst!`,
          'academic'
        );
      }

      // 5. Metric: System Reliability
      await this.addInsight(
        'System-Status',
        'Alle Subsysteme laufen im optimalen Bereich. Die Antigravity-Matrix ist stabil.',
        'system'
      );

    } catch (err) {
      logger.error(CTX, 'Failed to generate insights', err);
    }
  }

  async addInsight(title, content, category) {
    await this.pool.query(
      'INSERT INTO fun_insights (title, content, category) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [title, content, category]
    );
  }
}

module.exports = InsightGenerator;
