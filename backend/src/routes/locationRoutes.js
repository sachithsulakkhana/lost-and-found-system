const express = require('express');
const router = express.Router();

const DevicePing = require('../models/DevicePing');
const { ingestPing } = require('../services/pingIngestService');
const wsService = require('../services/wsService');

// NOTE: This is intentionally lightweight to help you "archive fast" during prototyping.
// If DEVICE_INGEST_KEY is set, require it via the x-device-key header.

function requireIngestKey(req, res, next) {
  const requiredKey = process.env.DEVICE_INGEST_KEY;
  if (!requiredKey) return next();
  const provided = req.header('x-device-key');
  if (provided && provided === requiredKey) return next();
  return res.status(401).json({ error: 'Missing or invalid device ingest key' });
}

// (Validation + scoring logic moved to services/pingIngestService so HTTP + WS share one path)

/**
 * POST /api/location/ping
 * Body (recommended): { deviceId, lat, lng, accuracy, speed, ts }
 * Alternative: { macAddress } instead of deviceId for quick setup.
 */
router.post('/ping', requireIngestKey, async (req, res) => {
  try {
    const { source } = req.body || {};
    const result = await ingestPing(req.body, { source: source || 'http' });

    // Broadcast to dashboards listening over WebSocket
    wsService.broadcastPingSaved(result);
    return res.json({ ping: result.ping, deviceStatus: result.deviceStatus, zoneName: result.zoneName });
  } catch (error) {
    const status = error?.status || 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({ error: error.message });
  }
});

// Quick archive/history view (no auth; protect via DEVICE_INGEST_KEY if needed)
router.get('/history/:deviceId', requireIngestKey, async (req, res) => {
  try {
    const { limit = 200 } = req.query;
    const pings = await DevicePing.find({ deviceId: req.params.deviceId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit, 10))
      .populate('zoneId', 'name');
    res.json(pings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
