/**
 * offlineDetectionService
 *
 * Polls every 2 minutes for ACTIVE devices that have gone silent.
 * When a device hasn't pinged for OFFLINE_THRESHOLD_MS, an alert is
 * created and broadcast ONLY to the owner's designated device sessions.
 *
 * Suppression logic:
 *  - alarmSuppressedUntil > now  → owner confirmed "not theft", skip
 *  - offlineAlertSentAt > (now - COOLDOWN_MS) → already alerted recently, skip
 */

const Device = require('../models/Device');
const Alert  = require('../models/Alert');
const wsService = require('./wsService');

const OFFLINE_THRESHOLD_MS = 5  * 60 * 1000;  // 5 minutes offline → suspect
const RECENTLY_SEEN_MS     = 2  * 60 * 60 * 1000; // only alert if device was seen within 2 hours
const COOLDOWN_MS          = 5  * 60 * 1000;  // don't re-alert within 5 min
const CHECK_INTERVAL_MS    = 2  * 60 * 1000;  // check every 2 minutes

async function checkOfflineDevices() {
  try {
    const now            = new Date();
    const offlineCutoff  = new Date(now - OFFLINE_THRESHOLD_MS);
    const recentlySeen   = new Date(now - RECENTLY_SEEN_MS);  // device must have been active recently
    const cooldownCutoff = new Date(now - COOLDOWN_MS);

    // ACTIVE devices that went silent recently (not just always-off/unused)
    const candidates = await Device.find({
      status: 'ACTIVE',
      $and: [
        // 1. Offline: hasn't pinged for > OFFLINE_THRESHOLD
        { lastSeen: { $lt: offlineCutoff } },
        // 2. Was seen within the RECENTLY_SEEN window (went offline recently, not weeks ago)
        { lastSeen: { $gt: recentlySeen } },
        // 3. Not suppressed by owner ("it's me" confirmation)
        {
          $or: [
            { alarmSuppressedUntil: null },
            { alarmSuppressedUntil: { $lt: now } }
          ]
        },
        // 4. Cooldown: don't re-alert within 5 min
        {
          $or: [
            { offlineAlertSentAt: null },
            { offlineAlertSentAt: { $lt: cooldownCutoff } }
          ]
        }
      ]
    });

    for (const device of candidates) {
      const lastSeenStr = device.lastSeen
        ? `${Math.round((now - device.lastSeen) / 60000)} min ago`
        : 'never';

      console.log(`🔴 Offline device detected: ${device.name} (last seen ${lastSeenStr})`);

      // Create theft-suspected alert
      await Alert.create({
        deviceId: device._id,
        type:     'THEFT_SUSPECTED',
        severity: 'CRITICAL',
        message:  `Device "${device.name}" has gone offline — possible theft or removal (last seen ${lastSeenStr})`,
        location: device.lastLocation?.lat
          ? { lat: device.lastLocation.lat, lng: device.lastLocation.lng }
          : undefined
      });

      // Stamp so we don't re-send within the cooldown window
      device.offlineAlertSentAt = now;
      await device.save();

      // Broadcast alarm ONLY to owner's designated sessions
      wsService.broadcastAlarmToDesignated(device.ownerId, device._id, device.name);

      console.log(`🚨 Offline alarm sent for device "${device.name}" (owner: ${device.ownerId})`);
    }
  } catch (err) {
    console.error('[offlineDetection] Error:', err.message);
  }
}

function start() {
  console.log(`✅ Offline Detection Service started (threshold: 5 min, check interval: 2 min)`);
  // Initial check after 30 s so the server has time to fully boot
  setTimeout(() => {
    checkOfflineDevices();
    setInterval(checkOfflineDevices, CHECK_INTERVAL_MS);
  }, 30 * 1000);
}

module.exports = { start };
