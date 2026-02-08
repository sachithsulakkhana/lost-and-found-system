const axios = require('axios');
const env = require('../config/env');
const DevicePing = require('../models/DevicePing');

exports.calculateAnomalyScore = async (deviceId, ping) => {
  try {
    const historicalPings = await DevicePing.find({ deviceId })
      .sort({ timestamp: -1 })
      .limit(100);
    
    if (historicalPings.length < 10) {
      return 0;
    }
    
    const avgLat = historicalPings.reduce((sum, p) => sum + p.location.lat, 0) / historicalPings.length;
    const avgLng = historicalPings.reduce((sum, p) => sum + p.location.lng, 0) / historicalPings.length;
    
    const distance = Math.sqrt(
      Math.pow(ping.location.lat - avgLat, 2) + 
      Math.pow(ping.location.lng - avgLng, 2)
    );
    
    const normalizedDistance = Math.min(distance * 1000, 1);
    
    const currentHour = new Date(ping.timestamp).getHours();
    const historicalHours = historicalPings.map(p => new Date(p.timestamp).getHours());
    const avgHour = historicalHours.reduce((sum, h) => sum + h, 0) / historicalHours.length;
    const timeDiff = Math.abs(currentHour - avgHour) / 24;
    
    return (normalizedDistance * 0.7 + timeDiff * 0.3);
  } catch (error) {
    console.error('ML anomaly calculation error:', error.message);
    return 0;
  }
};

exports.shouldGenerateAlert = (anomalyScore) => {
  return anomalyScore > 0.7;
};
