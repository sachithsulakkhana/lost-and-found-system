const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Send a theft alarm push notification to all registered devices of an owner.
 * Stale/expired subscriptions are cleaned up automatically.
 */
async function sendAlarmToOwner(ownerId, deviceName, reason) {
  const subs = await PushSubscription.find({ userId: ownerId });
  if (!subs.length) return;

  const payload = JSON.stringify({
    title: '🚨 THEFT ALERT',
    body: `"${deviceName}" was moved while sleeping! (${reason})`,
    tag: 'theft-alarm',
    renotify: true,
    requireInteraction: true   // notification stays until dismissed
  });

  const staleIds = [];

  await Promise.allSettled(
    subs.map(async (doc) => {
      try {
        await webpush.sendNotification(doc.subscription, payload);
      } catch (err) {
        // 410 Gone / 404 = subscription expired — clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleIds.push(doc._id);
        } else {
          console.error('Push send error:', err.message);
        }
      }
    })
  );

  if (staleIds.length) {
    await PushSubscription.deleteMany({ _id: { $in: staleIds } });
    console.log(`🧹 Removed ${staleIds.length} stale push subscriptions`);
  }
}

module.exports = { sendAlarmToOwner };
