const express = require('express');
const webpush = require('web-push');
const { authenticateToken } = require('../server');

const router = express.Router();
const preferencesRouter = express.Router();

// Initialize dynamic or static VAPID configuration parameters
let publicKey = process.env.VAPID_PUBLIC_KEY;
let privateKey = process.env.VAPID_PRIVATE_KEY;

if (!publicKey || !privateKey) {
  const vapidKeys = webpush.generateVAPIDKeys();
  publicKey = vapidKeys.publicKey;
  privateKey = vapidKeys.privateKey;
  console.log('[Web Push] Bootstrapped ephemeral active VAPID keypair for push notifications.');
  process.env.VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  publicKey,
  privateKey
);

// GET /api/push/vapid-public-key
// Serves client-side safe application server authentication credentials
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe
// Persists active client device subscriptions mapping securely to req.user.id
router.post('/subscribe', authenticateToken, async (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Ungültiges Push-Abonnement-Objekt' });
  }

  const { endpoint, keys } = subscription;
  const userId = Number(req.user.id);

  try {
    const upsertQuery = `
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint) DO UPDATE 
      SET 
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        created_at = NOW()
      RETURNING id
    `;
    await req.pool.query(upsertQuery, [userId, endpoint, keys.p256dh, keys.auth]);
    res.status(201).json({ success: true, message: 'Gerät erfolgreich für Push-Benachrichtigungen registriert' });
  } catch (err) {
    console.error('[Web Push] Subscribe persistence exception:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Geräte-Subscription' });
  }
});

// GET /api/users/preferences
// Returns targeted active notification toggles mapped to req.user.id
preferencesRouter.get('/', authenticateToken, async (req, res) => {
  const userId = Number(req.user.id);

  try {
    // Query existing record or safely construct dynamic defaults inline
    const resPref = await req.pool.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId]);
    if (resPref.rows.length > 0) {
      return res.json(resPref.rows[0]);
    }

    // Provision fallback row
    const insertFallback = `
      INSERT INTO user_preferences (user_id) VALUES ($1)
      ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING *
    `;
    const inserted = await req.pool.query(insertFallback, [userId]);
    res.json(inserted.rows[0]);
  } catch (err) {
    console.error('[Web Push] Fetch user preferences execution error:', err);
    res.status(500).json({ error: 'Fehler beim Abrufen der Benachrichtigungseinstellungen' });
  }
});

// PUT /api/users/preferences
// Updates configuration state boolean switches
preferencesRouter.put('/', authenticateToken, async (req, res) => {
  const userId = Number(req.user.id);
  const { notify_help_requests, notify_timers, notify_system } = req.body;

  try {
    const updateQuery = `
      INSERT INTO user_preferences (user_id, notify_help_requests, notify_timers, notify_system)
      VALUES ($1, COALESCE($2, true), COALESCE($3, true), COALESCE($4, true))
      ON CONFLICT (user_id) DO UPDATE 
      SET 
        notify_help_requests = COALESCE($2, user_preferences.notify_help_requests),
        notify_timers = COALESCE($3, user_preferences.notify_timers),
        notify_system = COALESCE($4, user_preferences.notify_system)
      RETURNING *
    `;
    const updated = await req.pool.query(updateQuery, [
      userId, 
      notify_help_requests !== undefined ? notify_help_requests : null,
      notify_timers !== undefined ? notify_timers : null,
      notify_system !== undefined ? notify_system : null
    ]);

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[Web Push] Update preferences state exception:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Einstellungen' });
  }
});

// Helper Function: sendNotification(userId, category, payload)
// Dispatches async web push events observing customized granular preferences targeting logic
const sendNotification = async (poolTarget, userId, category, payloadObj) => {
  try {
    // Evaluate target category switch authorization
    const prefRes = await poolTarget.query('SELECT * FROM user_preferences WHERE user_id = $1', [Number(userId)]);
    let shouldNotify = true;
    
    if (prefRes.rows.length > 0) {
      const prefs = prefRes.rows[0];
      if (category === 'help_requests' && prefs.notify_help_requests === false) shouldNotify = false;
      if (category === 'timers' && prefs.notify_timers === false) shouldNotify = false;
      if (category === 'system' && prefs.notify_system === false) shouldNotify = false;
    }

    if (!shouldNotify) return;

    // Fetch active device endpoint configurations
    const subRes = await poolTarget.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [Number(userId)]);
    if (subRes.rows.length === 0) return;

    const payloadString = JSON.stringify({
      title: payloadObj.title || 'Schulmanagement Benachrichtigung',
      body: payloadObj.body || '',
      url: payloadObj.url || '/',
      ...payloadObj
    });

    // Traverse active device subscriptions broadcasting target payloads
    for (const sub of subRes.rows) {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushConfig, payloadString);
      } catch (err) {
        // Automatically cleanup expired/revoked client endpoint rows mapping 410/404 exceptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await poolTarget.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
          console.log('[Web Push] Automated cleanup purge sweep cleared inactive expired endpoint.');
        } else {
          console.error('[Web Push] Transmission payload failure exception:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Web Push] Helper wrapper internal error:', err);
  }
};

module.exports = { router, preferencesRouter, sendNotification };
