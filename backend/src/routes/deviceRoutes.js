const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const DevicePing = require('../models/DevicePing');
const Alert = require('../models/Alert');
const ClosureEvent = require('../models/ClosureEvent');
const { requireAuth, requireApproved } = require('../middleware/auth');
const zoneService = require('../services/zoneService');
const mlService = require('../services/mlService');
const { getOrCreateDevice } = require('../services/autoEnrollmentService');

router.use(requireAuth);
router.use(requireApproved);

router.get('/', async (req, res) => {
  try {
    const devices = await Device.find({ ownerId: req.user._id })
      .populate('preferredZoneId', 'name center');
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function generateRandomMac() {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

router.post('/', async (req, res) => {
  try {
    const { deviceFingerprint, macAddress, ...body } = req.body;

    // Return existing device if fingerprint already registered for this user
    if (deviceFingerprint) {
      const existing = await Device.findOne({
        ownerId: req.user._id,
        deviceFingerprint
      });
      if (existing) {
        return res.status(200).json(existing);
      }
    }

    // Use provided MAC address or generate random one
    const finalMacAddress = macAddress && macAddress.trim()
      ? macAddress.toUpperCase()
      : generateRandomMac();

    const device = await Device.create({
      ...body,
      deviceFingerprint: deviceFingerprint || '',
      macAddress: finalMacAddress,
      ownerId: req.user._id
    });
    res.status(201).json(device);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.macAddress) {
      return res.status(400).json({ error: 'This MAC address is already registered' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/preference', async (req, res) => {
  try {
    const { preferredZoneId, preferredTimeWindow, allowedDays } = req.body;
    
    const device = await Device.findOne({
      _id: req.params.id,
      ownerId: req.user._id
    });
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const closure = await ClosureEvent.findOne({
      $or: [
        { zoneId: preferredZoneId },
        { isWholeCampus: true }
      ],
      start: { $lte: new Date() },
      end: { $gte: new Date() }
    });
    
    if (closure) {
      return res.status(400).json({ 
        error: 'Zone is currently closed',
        reason: closure.reason
      });
    }
    
    device.preferredZoneId = preferredZoneId;
    device.preferredTimeWindow = preferredTimeWindow;
    device.allowedDays = allowedDays;
    await device.save();
    
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ping', async (req, res) => {
  try {
    const { deviceId, deviceFingerprint, deviceInfo, lat, lng, speed } = req.body;

    let device;

    // Support both old (deviceId) and new (deviceFingerprint) methods
    if (deviceFingerprint) {
      // Auto-enroll device if not exists
      device = await getOrCreateDevice(req.user._id, deviceFingerprint, deviceInfo || {});
    } else if (deviceId) {
      // Old method - lookup by ID
      device = await Device.findById(deviceId);
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
    } else {
      return res.status(400).json({ error: 'Missing deviceId or deviceFingerprint' });
    }

    // Verify device belongs to user
    if (device.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Device does not belong to user' });
    }

    const zone = await zoneService.findZoneByLocation(lat, lng);
    const now = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const pingData = {
      deviceId: device._id,
      location: { lat, lng },
      zoneId: zone?._id,
      speed,
      hourOfDay: now.getHours(),
      dayOfWeek: dayNames[now.getDay()],
      isWithinPreference: zone ? zoneService.isWithinPreference(device, now, zone._id) : false,
      wasClosedZone: false
    };

    if (device.status === 'LEARNING') {
      const learningDays = Math.floor((now - device.learningStartDate) / (1000 * 60 * 60 * 24));
      if (learningDays >= 7) {
        device.status = 'ACTIVE';
        await device.save();
      }
    }

    if (device.status === 'ACTIVE') {
      const anomalyScore = await mlService.calculateAnomalyScore(device._id, pingData);
      pingData.anomalyScore = anomalyScore;

      if (mlService.shouldGenerateAlert(anomalyScore)) {
        await Alert.create({
          deviceId: device._id,
          type: 'ANOMALY',
          severity: 'HIGH',
          message: `Unusual activity detected (score: ${anomalyScore.toFixed(2)})`,
          location: { lat, lng }
        });
      }
    }

    const ping = await DevicePing.create(pingData);

    res.json({ ping, deviceStatus: device.status, deviceId: device._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const pings = await DevicePing.find({ deviceId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('zoneId', 'name');
    
    res.json(pings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
