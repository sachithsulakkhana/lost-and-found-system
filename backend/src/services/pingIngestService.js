const Device = require('../models/Device');
const DevicePing = require('../models/DevicePing');
const Alert = require('../models/Alert');
const zoneService = require('./zoneService');
const mlService = require('./mlService');
const wsService = require('./wsService');

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function validatePing({ deviceMongoId, lat, lng, accuracy, timestamp }) {
  const maxAcc = Number(process.env.MAX_ACCURACY_METERS || 50);
  const maxSpeed = Number(process.env.MAX_SPEED_MPS || 15); // ~54 km/h

  // 1) Accuracy check
  if (typeof accuracy === 'number' && accuracy > maxAcc) {
    return { valid: false, rejectReason: 'accuracy_high', zone: null, computedSpeed: null };
  }

  // 2) Bounds / zone check
  const zone = await zoneService.findZoneByLocation(lat, lng);
  // NOTE: Allow pings outside zones for testing - just mark them with zone=null
  // if (!zone) {
  //   return { valid: false, rejectReason: 'out_of_bounds', zone: null, computedSpeed: null };
  // }

  // 3) Speed sanity check (compare with last ping)
  let computedSpeed = null;
  const last = await DevicePing.findOne({ deviceId: deviceMongoId }).sort({ timestamp: -1 });
  if (last) {
    const dt = Math.max(1, (timestamp.getTime() - last.timestamp.getTime()) / 1000);
    const dist = haversineMeters(lat, lng, last.location.lat, last.location.lng);
    computedSpeed = dist / dt;
    if (computedSpeed > maxSpeed) {
      return { valid: false, rejectReason: 'speed_jump', zone, computedSpeed };
    }
  }

  return { valid: true, rejectReason: null, zone, computedSpeed };
}

/**
 * ingestPing
 * Shared ingest logic used by both:
 *  - HTTP POST /api/location/ping
 *  - WebSocket messages (type: 'ping')
 */
async function ingestPing(payload, { source = 'http' } = {}) {
  const { deviceId, macAddress, lat, lng, accuracy, speed, ts } = payload || {};

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    const err = new Error('lat and lng are required numbers');
    err.status = 400;
    throw err;
  }

  let device = null;
  if (deviceId) {
    // deviceId from frontend is Mongo _id
    device = await Device.findById(deviceId);
  }
  if (!device && macAddress) {
    device = await Device.findOne({ macAddress });
  }
  if (!device) {
    const err = new Error('Device not found (provide deviceId or macAddress)');
    err.status = 404;
    throw err;
  }

  const timestamp = ts ? new Date(ts) : new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const validation = await validatePing({
    deviceMongoId: device._id,
    lat,
    lng,
    accuracy,
    timestamp
  });

  const pingData = {
    deviceId: device._id,
    timestamp,
    source,
    location: { lat, lng },
    accuracy,
    zoneId: validation.zone?._id || undefined,
    // prefer provided speed from GPS; else use computed speed from last ping
    speed: typeof speed === 'number' ? speed : validation.computedSpeed,
    hourOfDay: timestamp.getHours(),
    dayOfWeek: dayNames[timestamp.getDay()],
    isWithinPreference: validation.valid && validation.zone ? zoneService.isWithinPreference(device, timestamp, validation.zone._id) : false,
    wasClosedZone: false,
    anomalyScore: 0,
    valid: validation.valid,
    rejectReason: validation.rejectReason
  };

  // Learning auto-promote: after 7 days since first learning start
  if (device.status === 'LEARNING') {
    const now = timestamp;
    const learningDays = Math.floor((now - device.learningStartDate) / (1000 * 60 * 60 * 24));
    if (learningDays >= 7) {
      device.status = 'ACTIVE';
      await device.save();
    }
  }

  // Only score anomalies for *valid* pings
  if (device.status === 'ACTIVE' && pingData.valid) {
    const anomalyScore = await mlService.calculateAnomalyScore(device._id, pingData);
    pingData.anomalyScore = anomalyScore;
    if (mlService.shouldGenerateAlert(anomalyScore)) {
      const alert = await Alert.create({
        deviceId: device._id,
        type: 'ANOMALY',
        severity: 'HIGH',
        message: `Unusual activity detected (score: ${anomalyScore.toFixed(2)})`,
        location: { lat, lng }
      });
      // Broadcast anomaly alert to all connected clients instantly
      wsService.broadcast('anomaly_alert', {
        alert,
        deviceId: device._id.toString(),
        deviceName: device.name,
        anomalyScore,
        location: { lat, lng },
        timestamp: new Date()
      });
    }
  }

  // Update device lastSeen and lastLocation
  device.lastSeen = timestamp;
  if (validation.zone?._id) {
    device.lastLocation = { zoneId: validation.zone._id, timestamp };
  }
  await device.save();

  const ping = await DevicePing.create(pingData);
  return {
    ping,
    deviceStatus: device.status,
    zoneName: validation.zone?.name || null,
    deviceKey: device.macAddress || device._id.toString()
  };
}

module.exports = { ingestPing };
