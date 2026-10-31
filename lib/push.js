const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

let configured = false;

// Lazily configures web-push from env on first use. Returns false when the
// VAPID keys aren't set, so push features degrade gracefully instead of
// crashing (push is optional until the deploy sets the keys).
function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:example@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

function vapidConfigured() {
  return ensureConfigured();
}

// Sends a push notification to every subscribed device of a user.
// Dead subscriptions (404/410 from the push service) are dropped.
// Never throws: a push failure must not break the request that triggered it.
async function sendPushToUser(userId, { title, body, url }) {
  if (!ensureConfigured()) return { sent: 0, skipped: 'vapid-not-configured' };
  const subs = await PushSubscription.find({ userId });
  const payload = JSON.stringify({ title, body, url: url || '/' });
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload
      );
      sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        // Subscription is dead (user uninstalled / revoked); drop it.
        await PushSubscription.deleteOne({ _id: sub._id });
      } else {
        console.error('Push send failed:', err && err.message ? err.message : err);
      }
    }
  }
  return { sent };
}

module.exports = { sendPushToUser, vapidConfigured };
