'use strict';

const { syncFromWebUntis, saveSyncStatus } = require('./webuntisSyncService');
const logger = require('../utils/logger');

const CTX = '[Scheduler]';

/**
 * The Scheduler Service manages automated background tasks, 
 * primarily the WebUntis 'Clever Sync'.
 */
class SchedulerService {
  constructor(pool) {
    this.pool = pool;
    this.intervalId = null;
    this.isSyncing = false;
  }

  /**
   * Start the scheduler heartbeat.
   */
  start() {
    logger.info(CTX, 'Starting Mission Control Scheduler...');
    
    // Check every minute if a task is due
    this.intervalId = setInterval(() => this.heartbeat(), 60000);
    
    // Run an initial check 10 seconds after boot
    setTimeout(() => this.heartbeat(), 10000);
  }

  /**
   * Stop the scheduler.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Main heartbeat logic.
   */
  async heartbeat() {
    if (this.isSyncing) return;

    try {
      // 1. Load WebUntis settings
      const settingsRes = await this.pool.query(`
        SELECT key, value FROM system_settings 
        WHERE key IN ('webuntis_url', 'webuntis_username', 'webuntis_password', 'webuntis_school', 
                      'webuntis_sync_interval', 'webuntis_last_sync')
      `);
      
      const s = {};
      settingsRes.rows.forEach(r => { s[r.key] = r.value; });

      if (!s.webuntis_url || !s.webuntis_username || !s.webuntis_password) return;

      const intervalHours = parseInt(s.webuntis_sync_interval || '1', 10);
      if (intervalHours <= 0) return; // Automatic sync disabled

      const lastSync = s.webuntis_last_sync ? new Date(s.webuntis_last_sync) : new Date(0);
      const now = new Date();
      const diffMs = now - lastSync;
      const intervalMs = intervalHours * 60 * 60 * 1000;

      // Also support fixed "Mission Windows" (e.g., 07:00, 11:00, 16:00)
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const isMissionWindow = (currentHour === 7 || currentHour === 11 || currentHour === 16) && currentMin < 5;

      if (diffMs >= intervalMs || isMissionWindow) {
        await this.triggerSync({
          url: s.webuntis_url,
          username: s.webuntis_username,
          password: s.webuntis_password,
          school: s.webuntis_school
        });
      }
    } catch (err) {
      logger.error(CTX, 'Heartbeat check failed', err);
    }
  }

  /**
   * Execute the sync process.
   */
  async triggerSync(settings) {
    this.isSyncing = true;
    logger.info(CTX, '🚀 Engaging Scheduled Clever Sync...');
    
    try {
      await syncFromWebUntis(this.pool, settings);
      logger.info(CTX, '✨ Scheduled Sync completed successfully.');
    } catch (err) {
      logger.error(CTX, '❌ Scheduled Sync failed', err);
    } finally {
      this.isSyncing = false;
    }
  }
}

module.exports = SchedulerService;
