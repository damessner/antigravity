/**
 * WebUntis Read-Only JSON-RPC 2.0 Client
 *
 * This client is strictly read-only — it never calls any write/mutating
 * WebUntis methods. It authenticates with a JSESSIONID cookie and fetches
 * school structure data (classes, teachers, students) as well as live data
 * (substitutions, timetable).
 */

'use strict';

const https = require('https');
const http  = require('http');

class WebUntisClient {
  /**
   * @param {string} schoolName   - The WebUntis school identifier (e.g. "ms-telfs")
   * @param {string} baseUrl      - The base URL (e.g. "https://ms-telfs.webuntis.com")
   */
  constructor(schoolName, baseUrl) {
    this.schoolName = schoolName;
    this.baseUrl    = baseUrl.replace(/\/+$/, '');
    this.sessionId  = null;
    this._rpcId     = 0;
  }

  _nextId() {
    return ++this._rpcId;
  }

  /**
   * Make a JSON-RPC 2.0 POST request to the WebUntis endpoint.
   *
   * @param {string} method
   * @param {object} params
   * @returns {Promise<any>}  Resolved with `result` from the JSON-RPC response.
   */
  _request(method, params) {
    const endpoint = `${this.baseUrl}/WebUntis/jsonrpc.do?school=${encodeURIComponent(this.schoolName)}`;
    const body = JSON.stringify({
      id:      this._nextId(),
      method,
      params,
      jsonrpc: '2.0',
    });

    const headers = {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent':     'antigravity-sync/1.0',
    };

    if (this.sessionId) {
      headers['Cookie'] = `JSESSIONID=${this.sessionId}`;
    }

    const parsedUrl  = new URL(endpoint);
    const transport  = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path:     parsedUrl.pathname + parsedUrl.search,
      method:   'POST',
      headers,
      timeout:  15000,
    };

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              reject(new Error(`WebUntis RPC Error ${parsed.error.code}: ${parsed.error.message}`));
            } else {
              resolve(parsed.result);
            }
          } catch (e) {
            reject(new Error(`WebUntis: invalid JSON response — ${raw.substring(0, 120)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('WebUntis request timed out after 15s'));
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ─── Authentication ───────────────────────────────────────────────────────

  /**
   * Authenticate with WebUntis. Stores the returned sessionId for subsequent calls.
   *
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{sessionId: string}>}
   */
  async authenticate(username, password) {
    const result = await this._request('authenticate', {
      user:     username,
      password,
      client:   'antigravity-sync',
    });
    this.sessionId = result.sessionId;
    return result;
  }

  /**
   * Log out and discard the session. Always call this when done.
   */
  async logout() {
    if (!this.sessionId) return;
    try {
      await this._request('logout', {});
    } finally {
      this.sessionId = null;
    }
  }

  // ─── Read-Only Data Methods ────────────────────────────────────────────────

  /** Fetch all active classes (Klassen). */
  getClasses() {
    return this._request('getKlassen', {});
  }

  /** Fetch all teachers. */
  getTeachers() {
    return this._request('getTeachers', {});
  }

  /** Fetch all students. */
  getStudents() {
    return this._request('getStudents', {});
  }

  /**
   * Fetch substitutions for a date range.
   *
   * @param {number} startDate  - YYYYMMDD integer (e.g. 20240101)
   * @param {number} endDate    - YYYYMMDD integer (e.g. 20240107)
   * @returns {Promise<Array>}
   */
  getSubstitutions(startDate, endDate) {
    return this._request('getSubstitutions', {
      startDate,
      endDate,
      departmentId: 0,
    });
  }

  /**
   * Fetch the timetable for a single entity (class, teacher, etc.).
   *
   * @param {number} id         - Entity ID (e.g. class ID)
   * @param {number} type       - 1=class, 2=teacher, 3=subject, 4=room, 5=student
   * @param {number} startDate  - YYYYMMDD integer
   * @param {number} endDate    - YYYYMMDD integer
   * @returns {Promise<Array>}
   */
  getTimetable(id, type, startDate, endDate) {
    return this._request('getTimetable', {
      id,
      type,
      startDate,
      endDate,
    });
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  /**
   * Convert a JS Date to the YYYYMMDD integer format WebUntis expects.
   *
   * @param {Date} date
   * @returns {number}
   */
  static toUntisDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return Number(`${y}${m}${d}`);
  }

  /**
   * Get the Monday of the current week.
   *
   * @returns {Date}
   */
  static getWeekStart() {
    const now  = new Date();
    const day  = now.getDay(); // 0 = Sunday
    const diff = (day === 0 ? -6 : 1 - day);
    const mon  = new Date(now);
    mon.setDate(now.getDate() + diff);
    mon.setHours(0, 0, 0, 0);
    return mon;
  }

  /**
   * Get the Friday of the current week.
   *
   * @returns {Date}
   */
  static getWeekEnd() {
    const mon = WebUntisClient.getWeekStart();
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return fri;
  }
}

module.exports = WebUntisClient;
