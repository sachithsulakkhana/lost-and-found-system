const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const DevicePing = require('../models/DevicePing');
const Alert = require('../models/Alert');
const ClosureEvent = require('../models/ClosureEvent');
const { requireAuth, requireApproved } = require('../middleware/auth');
const zoneService = require('../services/zoneService');
const mlService = require('../services/mlService');

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
    const { macAddress: _ignore, ...body } = req.body;
    const device = await Device.create({
      ...body,
      macAddress: generateRandomMac(),
      ownerId: req.user._id
    });
    res.status(201).json(device);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.macAddress) {
      try {
        const { macAddress: _ig, ...retryBody } = req.body;
        const device = await Device.create({
          ...retryBody,
          macAddress: generateRandomMac(),
          ownerId: req.user._id
        });
        return res.status(201).json(device);
      } catch (retryError) {
        return res.status(500).json({ error: retryError.message });
      }
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
    const { deviceId, lat, lng, speed } = req.body;
    
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const zone = await zoneService.findZoneByLocation(lat, lng);
    const now = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const pingData = {
      deviceId,
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
      const anomalyScore = await mlService.calculateAnomalyScore(deviceId, pingData);
      pingData.anomalyScore = anomalyScore;
      
      if (mlService.shouldGenerateAlert(anomalyScore)) {
        await Alert.create({
          deviceId,
          type: 'ANOMALY',
          severity: 'HIGH',
          message: `Unusual activity detected (score: ${anomalyScore.toFixed(2)})`,
          location: { lat, lng }
        });
      }
    }
    
    const ping = await DevicePing.create(pingData);
    
    res.json({ ping, deviceStatus: device.status });
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
