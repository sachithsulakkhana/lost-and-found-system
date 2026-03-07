const express = require('express');
const router = express.Router();
const DeviceActivity = require('../models/DeviceActivity');
const DevicePing = require('../models/DevicePing');
const Device = require('../models/Device');
const Alert = require('../models/Alert');
const anomalyDetectionService = require('../services/anomalyDetectionService');
const wsService = require('../services/wsService');
const pushService = require('../services/pushService');
const { sendSMS, formatPhoneNumber } = require('../services/smsService');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const LearnedPattern = require('../models/LearnedPattern');

// All theft/alarm broadcasts go ONLY to the owner's designated sessions.
const sendAlarm = (ownerId, deviceId, deviceName) =>
  wsService.broadcastAlarmToDesignated(ownerId, deviceId, deviceName);

router.use(requireAuth);

/**
 * POST /api/monitoring/ping
 * Log device status ping (called by client application or network monitoring)
 */
router.post('/ping', async (req, res) => {
  try {
    const { deviceId, status, zoneId, networkInfo, location } = req.body;

    if (!deviceId || !status) {
      return res.status(400).json({ error: 'deviceId and status are required' });
    }

    // Verify device belongs to user
    const device = await Device.findOne({
      _id: deviceId,
      ownerId: req.user._id
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Create activity record
    const activity = await DeviceActivity.create({
      deviceId,
      userId: req.user._id,
      status,
      zoneId,
      networkInfo,
      location,
      timestamp: new Date()
    });

    // Update device last seen
    await Device.findByIdAndUpdate(deviceId, {
      lastSeen: new Date(),
      lastLocation: {
        zoneId,
        timestamp: new Date()
      }
    });

    // Check if device is in learning phase
    const inLearning = await anomalyDetectionService.isInLearningPhase(deviceId);

    if (inLearning) {
      // Mark as training data
      activity.isTrainingData = true;
      await activity.save();

      return res.json({
        success: true,
        activityId: activity._id,
        learningPhase: true,
        message: 'Device is in learning phase'
      });
    }

    // Run anomaly detection
    const detection = await anomalyDetectionService.detectAnomaly({
      deviceId,
      userId: req.user._id,
      status,
      zoneId,
      networkInfo,
      location,
      timestamp: new Date()
    });

    // Update activity with detection results
    activity.anomalyScore = detection.score;
    activity.isAnomaly = detection.isAnomaly;
    activity.isTrainingData = false;
    await activity.save();

    res.json({
      success: true,
      activityId: activity._id,
      learningPhase: false,
      anomalyDetected: detection.isAnomaly,
      anomalyScore: detection.score,
      reason: detection.reason
    });
  } catch (error) {
    console.error('Error processing device ping:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/device/:deviceId/status
 * Get current monitoring status for a device
 */
router.get('/device/:deviceId/status', async (req, res) => {
  try {
    const device = await Device.findOne({
      _id: req.params.deviceId,
      ownerId: req.user._id
    }).populate('lastLocation.zoneId', 'name');

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Get recent activities
    const recentActivities = await DeviceActivity.find({ deviceId: device._id })
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('zoneId', 'name');

    // Check learning phase
    const inLearning = await anomalyDetectionService.isInLearningPhase(device._id);

    // Get learning progress
    let learningProgress = 0;
    if (inLearning) {
      const activityCount = await DeviceActivity.countDocuments({
        deviceId: device._id,
        isTrainingData: true
      });
      learningProgress = Math.min((activityCount / 50) * 100, 100);
    }

    // Get anomaly count
    const anomalyCount = await DeviceActivity.countDocuments({
      deviceId: device._id,
      isAnomaly: true
    });

    res.json({
      device: {
        id: device._id,
        name: device.name,
        status: device.status,
        lastSeen: device.lastSeen,
        lastLocation: device.lastLocation,
        monitoringEnabled: device.monitoringEnabled
      },
      monitoring: {
        inLearningPhase: inLearning,
        learningProgress,
        modelTrained: device.learningPhaseComplete,
        lastTrainedAt: device.modelLastTrained
      },
      statistics: {
        anomalyCount,
        recentActivities: recentActivities.length
      },
      recentActivities
    });
  } catch (error) {
    console.error('Error getting device status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/device/:deviceId/activities
 * Get activity history for a device
 */
router.get('/device/:deviceId/activities', async (req, res) => {
  try {
    const { limit = 100, includeAnomalies } = req.query;

    const device = await Device.findOne({
      _id: req.params.deviceId,
      ownerId: req.user._id
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const query = { deviceId: device._id };
    if (includeAnomalies === 'true') {
      query.isAnomaly = true;
    }

    const activities = await DeviceActivity.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('zoneId', 'name');

    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/device/:deviceId/train
 * Manually trigger model training for a device
 */
router.post('/device/:deviceId/train', async (req, res) => {
  try {
    const device = await Device.findOne({
      _id: req.params.deviceId,
      ownerId: req.user._id
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Check if enough training data
    const trainingDataCount = await DeviceActivity.countDocuments({
      deviceId: device._id,
      isTrainingData: true
    });

    if (trainingDataCount < 50) {
      return res.status(400).json({
        error: 'Not enough training data',
        required: 50,
        current: trainingDataCount
      });
    }

    // Train model
    const success = await anomalyDetectionService.trainDeviceModel(device._id);

    if (success) {
      res.json({
        success: true,
        message: 'Model trained successfully',
        trainingDataCount
      });
    } else {
      res.status(500).json({ error: 'Model training failed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/retrain-all
 * Admin: Retrain all device models
 */
router.post('/retrain-all', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Run in background
    anomalyDetectionService.retrainAllModels().catch(err => {
      console.error('Background retraining error:', err);
    });

    res.json({
      success: true,
      message: 'Model retraining started in background'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/stats
 * Get overall monitoring statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { ownerId: req.user._id };

    const totalDevices = await Device.countDocuments(query);
    const devicesInLearning = await Device.countDocuments({
      ...query,
      status: 'LEARNING'
    });
    const devicesActive = await Device.countDocuments({
      ...query,
      status: 'ACTIVE',
      learningPhaseComplete: true
    });

    const totalActivities = await DeviceActivity.countDocuments(
      req.user.role === 'admin' ? {} : { userId: req.user._id }
    );

    const totalAnomalies = await DeviceActivity.countDocuments({
      ...(req.user.role === 'admin' ? {} : { userId: req.user._id }),
      isAnomaly: true
    });

    // Recent anomalies (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAnomalies = await DeviceActivity.countDocuments({
      ...(req.user.role === 'admin' ? {} : { userId: req.user._id }),
      isAnomaly: true,
      timestamp: { $gte: yesterday }
    });

    res.json({
      devices: {
        total: totalDevices,
        inLearning: devicesInLearning,
        active: devicesActive
      },
      activities: {
        total: totalActivities,
        anomalies: totalAnomalies,
        recentAnomalies
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/dismiss-alarm
 * Owner confirmed "it's me" on their designated device.
 * Suppresses the MONITORED device's alarms for 5 minutes.
 * After 5 minutes, if it's still offline the alarm fires again automatically.
 * Body: { deviceId: <mongo id of the monitored device that triggered the alarm> }
 */
router.post('/dismiss-alarm', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    const device = await Device.findOne({ _id: deviceId, ownerId: req.user._id });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const suppressUntil = new Date(Date.now() + 5 * 60 * 1000);
    // Suppress alarms for 5 min
    device.alarmSuppressedUntil = suppressUntil;
    // Reset the alert-sent stamp so the 5-min cycle starts fresh from this dismiss
    device.offlineAlertSentAt = new Date();
    await device.save();

    res.json({ ok: true, suppressedUntil: device.alarmSuppressedUntil });
  } catch (error) {
    console.error('dismiss-alarm error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/wake-ping
 * Called by TheftGuard when device screen wakes (lid open / tab visible).
 * Compares wake location vs sleep location — fires alarm if device moved.
 */
router.post('/wake-ping', async (req, res) => {
  try {
    const { deviceId, sleepLat, sleepLng, sleepTime, wakeLat, wakeLng } = req.body;

    const device = await Device.findOne({ _id: deviceId, ownerId: req.user._id });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // If this is a designated device and the owner recently dismissed an alarm, skip
    if (device.isDesignated && device.alarmSuppressedUntil && device.alarmSuppressedUntil > new Date()) {
      return res.json({ alarm: false, reason: 'OWNER_DISMISSED', suppressedUntil: device.alarmSuppressedUntil, deviceId });
    }

    let alarm = false;
    let reason = 'NORMAL';

    // 1. Location-change check (threshold ~55 m = 0.0005 degrees)
    if (sleepLat != null && sleepLng != null && wakeLat != null && wakeLng != null) {
      const dist = Math.sqrt(
        Math.pow(wakeLat - sleepLat, 2) + Math.pow(wakeLng - sleepLng, 2)
      );
      if (dist > 0.0005) {
        alarm = true;
        reason = 'LOCATION_CHANGED';
      }
    }

    // 2. Unusual-hour check (if no location data available)
    if (!alarm) {
      const recentPings = await DevicePing.find({ deviceId })
        .sort({ timestamp: -1 })
        .limit(100);

      if (recentPings.length >= 10) {
        const avgHour = recentPings.reduce((s, p) => s + new Date(p.timestamp).getHours(), 0) / recentPings.length;
        const currentHour = new Date().getHours();
        if (Math.abs(currentHour - avgHour) > 6) {
          alarm = true;
          reason = 'UNUSUAL_TIME';
        }
      }
    }

    if (alarm) {
      await Alert.create({
        deviceId: device._id,
        type: 'THEFT_SUSPECTED',
        severity: 'CRITICAL',
        message: `Possible theft detected (${reason}) — device "${device.name}" moved while sleeping`,
        location: wakeLat ? { lat: wakeLat, lng: wakeLng } : undefined
      });

      // WebSocket: only to owner's designated device sessions
      sendAlarm(device.ownerId, deviceId, device.name);
      // Web Push: reaches the owner even when the browser is closed
      pushService.sendAlarmToOwner(device.ownerId, device.name, reason).catch(err =>
        console.error('Push notification error:', err)
      );
      // SMS: notify owner's phone number
      User.findById(device.ownerId).then(owner => {
        if (owner?.phone) {
          const phone = formatPhoneNumber(owner.phone);
          const msg = `🚨 THEFT ALERT: Your device "${device.name}" was moved while sleeping! Reason: ${reason}. Check your Lost & Found app immediately.`;
          sendSMS(phone, msg).catch(err => console.error('SMS error:', err));
        }
      }).catch(() => {});
      console.log(`🚨 THEFT ALARM sent for device ${device.name} (${reason})`);
    }

    res.json({ alarm, reason, deviceId });
  } catch (error) {
    console.error('wake-ping error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/pulse
 * Lightweight keep-alive — no GPS needed. Just stamps device.lastSeen.
 * Called every 5 s so offline detection fires within ~10 s of phone going off.
 */
router.post('/pulse', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
    await Device.findByIdAndUpdate(deviceId, { lastSeen: new Date() });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/heartbeat
 * Sent by TheftGuard periodically while the app is open (lid-open coverage).
 * Compares current GPS with the last saved DevicePing — alarms if moved >55 m.
 * Also saves a new DevicePing so the reference point stays up-to-date.
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const { deviceId, lat, lng } = req.body;
    if (!deviceId || lat == null || lng == null) {
      return res.status(400).json({ error: 'deviceId, lat and lng are required' });
    }

    const device = await Device.findOne({ _id: deviceId, ownerId: req.user._id });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // If this is a designated device and the owner recently dismissed an alarm, skip
    if (device.isDesignated && device.alarmSuppressedUntil && device.alarmSuppressedUntil > new Date()) {
      return res.json({ alarm: false, reason: 'OWNER_DISMISSED', suppressedUntil: device.alarmSuppressedUntil, deviceId });
    }

    let alarm = false;
    let reason = 'NORMAL';

    // Compare against the last saved ping location
    const lastPing = await DevicePing.findOne({ deviceId }).sort({ timestamp: -1 });

    if (lastPing?.location?.lat != null && lastPing?.location?.lng != null) {
      const dist = Math.sqrt(
        Math.pow(lat - lastPing.location.lat, 2) +
        Math.pow(lng - lastPing.location.lng, 2)
      );
      if (dist > 0.0005) {
        alarm = true;
        reason = 'LOCATION_CHANGED';
      }
    }

    // Save current position as the new reference ping
    await DevicePing.create({
      deviceId,
      location: { lat, lng },
      source: 'http'
    });

    if (alarm) {
      await Alert.create({
        deviceId: device._id,
        type: 'THEFT_SUSPECTED',
        severity: 'CRITICAL',
        message: `Possible theft detected (heartbeat) — device "${device.name}" moved while screen was on`,
        location: { lat, lng }
      });

      sendAlarm(device.ownerId, deviceId, device.name);
      pushService.sendAlarmToOwner(device.ownerId, device.name, reason).catch(err =>
        console.error('Push notification error:', err)
      );
      User.findById(device.ownerId).then(owner => {
        if (owner?.phone) {
          const phone = formatPhoneNumber(owner.phone);
          const msg = `🚨 THEFT ALERT: Your device "${device.name}" moved while the screen was on! Check your Lost & Found app.`;
          sendSMS(phone, msg).catch(err => console.error('SMS error:', err));
        }
      }).catch(() => {});

      console.log(`🚨 HEARTBEAT ALARM — device ${device.name} moved while open`);
    }

    res.json({ alarm, reason, deviceId });
  } catch (error) {
    console.error('heartbeat error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/sleep-ping
 * Called by TheftGuard when the device lid closes / tab hides.
 * Sends a quiet push notification to the owner's other devices.
 */
router.post('/sleep-ping', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    const device = await Device.findOne({ _id: deviceId, ownerId: req.user._id });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    pushService.sendSleepAlert(device.ownerId, device.name).catch(err =>
      console.error('Sleep alert push error:', err)
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('sleep-ping error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/monitoring/confirm-normal
 * Owner confirmed an anomaly as a legitimate/normal pattern.
 * Saves it as a LearnedPattern so future pings at that location+time score 0.
 * Body: { deviceId, alertId, lat, lng, hourOfDay, dayOfWeek, note }
 */
router.post('/confirm-normal', async (req, res) => {
  try {
    const { deviceId, alertId, lat, lng, hourOfDay, dayOfWeek, note } = req.body;
    if (!deviceId || lat == null || lng == null) {
      return res.status(400).json({ error: 'deviceId, lat and lng are required' });
    }

    const device = await Device.findOne({ _id: deviceId, ownerId: req.user._id });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    // Save the learned pattern
    const pattern = await LearnedPattern.create({
      deviceId:   device._id,
      ownerId:    req.user._id,
      lat:        parseFloat(lat),
      lng:        parseFloat(lng),
      hourOfDay:  parseInt(hourOfDay, 10) || new Date().getHours(),
      dayOfWeek:  dayOfWeek || '',
      note:       note || '',
      alertId:    alertId || undefined,
      confirmedAt: new Date()
    });

    // Resolve the originating alert if provided
    if (alertId) {
      await Alert.findByIdAndUpdate(alertId, {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: req.user._id
      });
    }

    console.log(`✅ Learned normal pattern for "${device.name}" at (${lat}, ${lng}) hour ${hourOfDay}`);
    res.json({ ok: true, pattern });
  } catch (error) {
    console.error('confirm-normal error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/monitoring/patterns/:deviceId
 * Returns all learned (confirmed normal) patterns for a device.
 */
router.get('/patterns/:deviceId', async (req, res) => {
  try {
    const device = await Device.findOne({ _id: req.params.deviceId, ownerId: req.user._id });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const patterns = await LearnedPattern.find({ deviceId: device._id })
      .sort({ confirmedAt: -1 });
    res.json(patterns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/monitoring/patterns/:patternId
 * Remove a learned pattern (so that location is scored normally again).
 */
router.delete('/patterns/:patternId', async (req, res) => {
  try {
    const pattern = await LearnedPattern.findOne({ _id: req.params.patternId, ownerId: req.user._id });
    if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
    await LearnedPattern.deleteOne({ _id: pattern._id });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
