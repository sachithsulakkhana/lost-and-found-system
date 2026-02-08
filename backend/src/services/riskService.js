const RiskSnapshot = require('../models/RiskSnapshot');
const DevicePing = require('../models/DevicePing');
const Alert = require('../models/Alert');

exports.calculateRiskLevel = async (zoneId) => {
  try {
    const recentPings = await DevicePing.countDocuments({
      zoneId,
      timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    });
    
    const recentAlerts = await Alert.countDocuments({
      'location.zoneId': zoneId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      isResolved: false
    });
    
    const crowdDensity = recentPings / 10;
    const riskScore = (crowdDensity * 0.5) + (recentAlerts * 0.5);
    
    let riskLevel = 'LOW';
    if (riskScore > 0.7) riskLevel = 'HIGH';
    else if (riskScore > 0.4) riskLevel = 'MEDIUM';
    
    return {
      riskLevel,
      crowdDensity: recentPings,
      recentIncidents: recentAlerts,
      riskScore
    };
  } catch (error) {
    console.error('Risk calculation error:', error.message);
    return { riskLevel: 'LOW', crowdDensity: 0, recentIncidents: 0, riskScore: 0 };
  }
};

exports.createRiskSnapshot = async (zoneId, riskData) => {
  return await RiskSnapshot.create({
    zoneId,
    riskLevel: riskData.riskLevel,
    crowdDensity: riskData.crowdDensity,
    recentIncidents: riskData.recentIncidents
  });
};
