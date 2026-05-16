'use strict';

const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../server');
const logger = require('../utils/logger');

const CTX = '[Karriere API]';

/**
 * GET /api/karriere/dashboard
 * Aggregates school-wide performance data for the Karriere-Dashboard.
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    // 1. Class Averages
    const classStats = await req.pool.query(`
      SELECT 
        c.id, 
        c.name, 
        AVG(CAST(g.grade_value AS FLOAT)) as avg_grade,
        COUNT(DISTINCT p.id) as pupil_count
      FROM classes c
      JOIN pupils p ON p.class_id = c.id
      JOIN grades g ON g.pupil_id = p.id
      WHERE g.grade_value ~ '^[0-9.]+$' -- Only numeric grades
      GROUP BY c.id, c.name
      ORDER BY avg_grade ASC
    `);

    // 2. Top Pupils (School-wide)
    const topPupils = await req.pool.query(`
      SELECT 
        u.full_name, 
        c.name as class_name,
        AVG(CAST(g.grade_value AS FLOAT)) as avg_grade
      FROM users u
      JOIN pupils p ON p.user_id = u.id
      JOIN classes c ON p.class_id = c.id
      JOIN grades g ON g.pupil_id = p.id
      WHERE g.grade_value ~ '^[0-9.]+$'
      GROUP BY u.full_name, c.name
      ORDER BY avg_grade ASC
      LIMIT 10
    `);

    // 3. Rising Stars (Most improvement in the last 30 days)
    // Logic: Compare avg of grades in last 30 days vs grades before that.
    const risingStars = await req.pool.query(`
      WITH RecentGrades AS (
        SELECT pupil_id, AVG(CAST(grade_value AS FLOAT)) as recent_avg
        FROM grades 
        WHERE date > NOW() - INTERVAL '30 days' AND grade_value ~ '^[0-9.]+$'
        GROUP BY pupil_id
      ),
      OlderGrades AS (
        SELECT pupil_id, AVG(CAST(grade_value AS FLOAT)) as old_avg
        FROM grades 
        WHERE date <= NOW() - INTERVAL '30 days' AND grade_value ~ '^[0-9.]+$'
        GROUP BY pupil_id
      )
      SELECT 
        u.full_name,
        c.name as class_name,
        (o.old_avg - r.recent_avg) as improvement
      FROM RecentGrades r
      JOIN OlderGrades o ON r.pupil_id = o.pupil_id
      JOIN pupils p ON r.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      JOIN classes c ON p.class_id = c.id
      WHERE (o.old_avg - r.recent_avg) > 0
      ORDER BY improvement DESC
      LIMIT 5
    `);

    // 4. Support Radar (Pupils with lowest averages)
    const supportNeeded = await req.pool.query(`
      SELECT 
        u.full_name, 
        c.name as class_name,
        AVG(CAST(g.grade_value AS FLOAT)) as avg_grade
      FROM users u
      JOIN pupils p ON p.user_id = u.id
      JOIN classes c ON p.class_id = c.id
      JOIN grades g ON g.pupil_id = p.id
      WHERE g.grade_value ~ '^[0-9.]+$'
      GROUP BY u.full_name, c.name
      HAVING AVG(CAST(g.grade_value AS FLOAT)) > 4.0
      ORDER BY avg_grade DESC
      LIMIT 10
    `);

    // 5. Active Participators (Top 5 pupils with most 'excellent' or 'engaged' ratings)
    const activeParticipators = await req.pool.query(`
      SELECT 
        u.full_name,
        c.name as class_name,
        COUNT(l.id) as active_count
      FROM participation_logs l
      JOIN pupils p ON l.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      JOIN classes c ON p.class_id = c.id
      WHERE l.rating IN ('excellent', 'engaged')
      GROUP BY u.full_name, c.name
      ORDER BY active_count DESC
      LIMIT 5
    `);

    // 6. Recent Achievements
    const recentAchievements = await req.pool.query(`
      SELECT 
        u.full_name,
        a.title,
        a.created_at
      FROM achievements a
      JOIN pupils p ON a.pupil_id = p.id
      JOIN users u ON p.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 5
    `);

    // 7. Fun Insights (Pulling from our new table)
    const insights = await req.pool.query('SELECT title, content, category FROM fun_insights ORDER BY created_at DESC LIMIT 5');

    res.json({
      classes: classStats.rows,
      topPupils: topPupils.rows,
      risingStars: risingStars.rows,
      supportNeeded: supportNeeded.rows,
      activeParticipators: activeParticipators.rows,
      recentAchievements: recentAchievements.rows,
      insights: insights.rows
    });

  } catch (err) {
    logger.error(CTX, 'Failed to fetch Karriere dashboard', err);
    res.status(500).json({ error: 'Dashboard-Daten konnten nicht geladen werden' });
  }
});

module.exports = router;
