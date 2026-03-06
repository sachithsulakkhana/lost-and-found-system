const DevicePing     = require('../models/DevicePing');
const LearnedPattern = require('../models/LearnedPattern');

// Learned-pattern match tolerances
const PATTERN_DIST_THRESHOLD  = 0.0005; // ~55 metres in degrees
const PATTERN_HOUR_THRESHOLD  = 2;      // ±2 hours

exports.calculateAnomalyScore = async (deviceId, ping) => {
  try {
    // 1. Check confirmed-normal patterns first — if this ping matches, score = 0
    const patterns = await LearnedPattern.find({ deviceId });
    for (const p of patterns) {
      const dist     = Math.sqrt(Math.pow(ping.location.lat - p.lat, 2) + Math.pow(ping.location.lng - p.lng, 2));
      const hourDiff = Math.abs((ping.hourOfDay ?? new Date(ping.timestamp).getHours()) - p.hourOfDay);
      if (dist < PATTERN_DIST_THRESHOLD && hourDiff <= PATTERN_HOUR_THRESHOLD) {
        return 0; // owner confirmed this as normal
      }
    }

    // 2. Statistical baseline from historical pings
    const historicalPings = await DevicePing.find({ deviceId })
      .sort({ timestamp: -1 })
      .limit(100);

    if (historicalPings.length < 10) return 0;

    const avgLat = historicalPings.reduce((s, p) => s + p.location.lat, 0) / historicalPings.length;
    const avgLng = historicalPings.reduce((s, p) => s + p.location.lng, 0) / historicalPings.length;

    const distance = Math.sqrt(
      Math.pow(ping.location.lat - avgLat, 2) +
      Math.pow(ping.location.lng - avgLng, 2)
    );
    const normalizedDistance = Math.min(distance * 1000, 1);

    const currentHour      = ping.hourOfDay ?? new Date(ping.timestamp).getHours();
    const historicalHours  = historicalPings.map(p => new Date(p.timestamp).getHours());
    const avgHour          = historicalHours.reduce((s, h) => s + h, 0) / historicalHours.length;
    const timeDiff         = Math.abs(currentHour - avgHour) / 24;

    return normalizedDistance * 0.7 + timeDiff * 0.3;
  } catch (error) {
    console.error('ML anomaly calculation error:', error.message);
    return 0;
  }
};

exports.shouldGenerateAlert = (anomalyScore) => anomalyScore > 0.7;
