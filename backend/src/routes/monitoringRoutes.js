const express = require('express');
const router = express.Router();
const DeviceActivity = require('../models/DeviceActivity');
const Device = require('../models/Device');
const anomalyDetectionService = require('../services/anomalyDetectionService');
const { requireAuth } = require('../middleware/auth');

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

module.exports = router;
