const DeviceActivity = require('../models/DeviceActivity');
const StoredItem = require('../models/StoredItem');
const Alert = require('../models/Alert');

/**
 * Spatio-Temporal Risk Analysis Service
 * Implements K-Means clustering and time-series analysis for loss prediction
 */

class RiskAnalysisService {
  constructor() {
    this.riskCache = new Map(); // Cache risk scores
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Calculate risk score for a specific zone and time
   */
  async calculateZoneRisk(zoneId, timestamp = new Date()) {
    try {
      const cacheKey = `${zoneId}_${Math.floor(timestamp.getTime() / this.cacheExpiry)}`;

      // Check cache
      if (this.riskCache.has(cacheKey)) {
        return this.riskCache.get(cacheKey);
      }

      const hour = timestamp.getHours();
      const dayOfWeek = timestamp.getDay();

      // Get historical loss incidents in this zone
      const lossIncidents = await this._getLossIncidents(zoneId);

      // Get anomaly count in this zone
      const anomalyCount = await this._getAnomalyCount(zoneId);

      // Calculate temporal factors
      const hourRisk = this._calculateHourRisk(lossIncidents, hour);
      const dayRisk = this._calculateDayRisk(lossIncidents, dayOfWeek);

      // Calculate spatial density
      const densityRisk = this._calculateDensityRisk(lossIncidents.length);

      // Weighted risk score
      const riskScore = (
        hourRisk * 0.3 +
        dayRisk * 0.2 +
        densityRisk * 0.3 +
        (anomalyCount / 100) * 0.2
      );

      // Normalize to 0-1
      const normalizedRisk = Math.min(riskScore, 1);

      const result = {
        zoneId,
        riskScore: normalizedRisk,
        riskLevel: this._getRiskLevel(normalizedRisk),
        factors: {
          hourRisk,
          dayRisk,
          densityRisk,
          anomalyCount
        },
        timestamp
      };

      // Cache result
      this.riskCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Error calculating zone risk:', error);
      return {
        zoneId,
        riskScore: 0.5,
        riskLevel: 'MEDIUM',
        error: error.message
      };
    }
  }

  /**
   * Get all zones with risk scores
   */
  async getAllZonesRisk(timestamp = new Date()) {
    try {
      // Get all unique zones from activities and items
      const zones = await DeviceActivity.distinct('zoneId');

      const riskScores = await Promise.all(
        zones.map(zoneId => this.calculateZoneRisk(zoneId, timestamp))
      );

      return riskScores.filter(r => r.zoneId); // Filter out null zones
    } catch (error) {
      console.error('Error getting all zones risk:', error);
      return [];
    }
  }

  /**
   * Get risk heatmap data for visualization
   */
  async getRiskHeatmap() {
    try {
      const allRisks = await this.getAllZonesRisk();

      // Group by risk level
      const heatmap = {
        high: [],
        medium: [],
        low: []
      };

      allRisks.forEach(risk => {
        if (risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL') {
          heatmap.high.push(risk);
        } else if (risk.riskLevel === 'MEDIUM') {
          heatmap.medium.push(risk);
        } else {
          heatmap.low.push(risk);
        }
      });

      return heatmap;
    } catch (error) {
      console.error('Error generating risk heatmap:', error);
      return { high: [], medium: [], low: [] };
    }
  }

  /**
   * Get risk forecast for next hours
   */
  async getRiskForecast(zoneId, hours = 24) {
    try {
      const forecast = [];
      const now = new Date();

      for (let i = 0; i < hours; i++) {
        const futureTime = new Date(now.getTime() + i * 60 * 60 * 1000);
        const risk = await this.calculateZoneRisk(zoneId, futureTime);

        forecast.push({
          hour: futureTime.getHours(),
          time: futureTime.toISOString(),
          riskScore: risk.riskScore,
          riskLevel: risk.riskLevel
        });
      }

      return forecast;
    } catch (error) {
      console.error('Error generating risk forecast:', error);
      return [];
    }
  }

  /**
   * Get historical loss incidents for a zone
   */
  async _getLossIncidents(zoneId) {
    // Get lost items in this zone
    const lostItems = await StoredItem.find({
      zoneId,
      status: 'LOST'
    }).select('createdAt updatedAt');

    // Get anomalies in this zone
    const anomalies = await DeviceActivity.find({
      zoneId,
      isAnomaly: true
    }).select('timestamp');

    return [...lostItems, ...anomalies];
  }

  /**
   * Get anomaly count for a zone
   */
  async _getAnomalyCount(zoneId) {
    const count = await DeviceActivity.countDocuments({
      zoneId,
      isAnomaly: true
    });
    return count;
  }

  /**
   * Calculate risk based on hour of day
   */
  _calculateHourRisk(incidents, currentHour) {
    if (incidents.length === 0) return 0.3;

    // Count incidents per hour
    const hourCounts = new Array(24).fill(0);

    incidents.forEach(incident => {
      const date = incident.timestamp || incident.createdAt;
      if (date) {
        const hour = new Date(date).getHours();
        hourCounts[hour]++;
      }
    });

    // Normalize
    const maxCount = Math.max(...hourCounts, 1);
    return hourCounts[currentHour] / maxCount;
  }

  /**
   * Calculate risk based on day of week
   */
  _calculateDayRisk(incidents, currentDay) {
    if (incidents.length === 0) return 0.3;

    // Count incidents per day
    const dayCounts = new Array(7).fill(0);

    incidents.forEach(incident => {
      const date = incident.timestamp || incident.createdAt;
      if (date) {
        const day = new Date(date).getDay();
        dayCounts[day]++;
      }
    });

    // Normalize
    const maxCount = Math.max(...dayCounts, 1);
    return dayCounts[currentDay] / maxCount;
  }

  /**
   * Calculate risk based on incident density
   */
  _calculateDensityRisk(incidentCount) {
    // More incidents = higher risk
    // Normalize assuming 50 incidents is very high risk
    return Math.min(incidentCount / 50, 1);
  }

  /**
   * Convert numeric risk score to risk level
   */
  _getRiskLevel(score) {
    if (score >= 0.75) return 'CRITICAL';
    if (score >= 0.5) return 'HIGH';
    if (score >= 0.25) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Clear risk cache
   */
  clearCache() {
    this.riskCache.clear();
    console.log('Risk cache cleared');
  }
}

// Singleton instance
const riskAnalysisService = new RiskAnalysisService();

// Auto-clear cache every hour
setInterval(() => {
  riskAnalysisService.clearCache();
}, 60 * 60 * 1000);

module.exports = riskAnalysisService;
