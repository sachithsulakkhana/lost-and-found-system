const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

/**
 * CSV-based Risk Analysis Service
 * Calculates risk scores based on lost item data from CSV
 * Replaces ML-based predictions with simpler CSV-driven analysis
 */
class CSVRiskService {
  constructor() {
    this.locationData = new Map(); // Map<location, {lostCount, crowdLevel, incidents[]}>
    this.loaded = false;
    this.lastUpdated = null;
  }

  /**
   * Load and parse CSV data
   */
  async loadCSVData(csvPath) {
    return new Promise((resolve, reject) => {
      const results = [];

      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          results.push(row);
        })
        .on('end', () => {
          this.processCSVData(results);
          this.loaded = true;
          this.lastUpdated = new Date();
          console.log(`✓ CSV Risk Service: Loaded ${results.length} records from ${this.locationData.size} locations`);
          resolve(results.length);
        })
        .on('error', (error) => {
          console.error('CSV Risk Service: Error loading CSV:', error);
          reject(error);
        });
    });
  }

  /**
   * Process CSV data and build location risk profiles
   */
  processCSVData(rows) {
    this.locationData.clear();

    rows.forEach(row => {
      const location = row.location || '';
      const specificLocation = row.specificLocation || location;

      if (!this.locationData.has(location)) {
        this.locationData.set(location, {
          location,
          specificLocations: new Set(),
          totalLostCount: 0,
          incidents: [],
          crowdLevels: [],
          itemTypes: new Map(),
          timeSlots: new Map(),
          dayTypes: { weekday: 0, weekend: 0 }
        });
      }

      const locationProfile = this.locationData.get(location);

      // Add specific location
      if (specificLocation) {
        locationProfile.specificLocations.add(specificLocation);
      }

      // Track lost count
      const lostCount = parseInt(row.lostCount) || 0;
      locationProfile.totalLostCount += lostCount;

      // Track crowd levels
      if (row.crowdLevel) {
        locationProfile.crowdLevels.push(row.crowdLevel);
      }

      // Track item types
      if (row.itemType) {
        const count = locationProfile.itemTypes.get(row.itemType) || 0;
        locationProfile.itemTypes.set(row.itemType, count + 1);
      }

      // Track time slots (hour of day)
      if (row.time) {
        const hour = parseInt(row.time.split(':')[0]);
        const timeCount = locationProfile.timeSlots.get(hour) || 0;
        locationProfile.timeSlots.set(hour, timeCount + 1);
      }

      // Track day types
      if (row.dayType) {
        locationProfile.dayTypes[row.dayType] = (locationProfile.dayTypes[row.dayType] || 0) + 1;
      }

      // Store incident details
      locationProfile.incidents.push({
        time: row.time,
        itemType: row.itemType,
        crowdLevel: row.crowdLevel,
        lostCount,
        weather: row.weather,
        dayType: row.dayType,
        specificLocation
      });
    });
  }

  /**
   * Calculate risk score for a location (0-1 scale)
   * Based on:
   * - Total lost count (40%)
   * - Crowd level frequency (30%)
   * - Incident frequency (30%)
   */
  calculateLocationRisk(location) {
    if (!this.loaded || !this.locationData.has(location)) {
      return 0;
    }

    const profile = this.locationData.get(location);

    // 1. Lost Count Score (normalized)
    const maxLostCount = Math.max(...Array.from(this.locationData.values()).map(p => p.totalLostCount));
    const lostCountScore = maxLostCount > 0 ? profile.totalLostCount / maxLostCount : 0;

    // 2. Crowd Level Score
    const crowdLevelMap = { low: 0.2, medium: 0.5, high: 0.9 };
    const avgCrowdLevel = profile.crowdLevels.length > 0
      ? profile.crowdLevels.reduce((sum, level) => sum + (crowdLevelMap[level] || 0.5), 0) / profile.crowdLevels.length
      : 0.5;

    // 3. Incident Frequency Score
    const maxIncidents = Math.max(...Array.from(this.locationData.values()).map(p => p.incidents.length));
    const incidentScore = maxIncidents > 0 ? profile.incidents.length / maxIncidents : 0;

    // Weighted average
    const riskScore = (lostCountScore * 0.4) + (avgCrowdLevel * 0.3) + (incidentScore * 0.3);

    return Math.min(Math.max(riskScore, 0), 1); // Clamp to [0, 1]
  }

  /**
   * Get risk level category
   */
  getRiskLevel(riskScore) {
    if (riskScore >= 0.75) return 'CRITICAL';
    if (riskScore >= 0.50) return 'HIGH';
    if (riskScore >= 0.25) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get all locations with risk scores
   */
  getAllLocationRisks() {
    if (!this.loaded) {
      return [];
    }

    const risks = [];
    for (const [location, profile] of this.locationData.entries()) {
      const riskScore = this.calculateLocationRisk(location);
      risks.push({
        location,
        specificLocations: Array.from(profile.specificLocations),
        riskScore,
        riskLevel: this.getRiskLevel(riskScore),
        totalLostCount: profile.totalLostCount,
        incidentCount: profile.incidents.length,
        commonItemTypes: this.getTopItemTypes(profile),
        peakHours: this.getPeakHours(profile)
      });
    }

    // Sort by risk score (highest first)
    return risks.sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Get top 3 most commonly lost item types
   */
  getTopItemTypes(profile) {
    const sorted = Array.from(profile.itemTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return sorted.map(([type, count]) => ({ type, count }));
  }

  /**
   * Get peak hours for incidents
   */
  getPeakHours(profile) {
    const sorted = Array.from(profile.timeSlots.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return sorted.map(([hour, count]) => ({ hour, count }));
  }

  /**
   * Get risk heatmap data for map visualization
   */
  getHeatmapData() {
    const risks = this.getAllLocationRisks();
    return {
      timestamp: this.lastUpdated,
      locations: risks.map(r => ({
        location: r.location,
        specificLocations: r.specificLocations,
        risk: r.riskScore,
        level: r.riskLevel,
        lostCount: r.totalLostCount,
        incidents: r.incidentCount
      }))
    };
  }

  /**
   * Get risk statistics
   */
  getStatistics() {
    if (!this.loaded) {
      return null;
    }

    const risks = this.getAllLocationRisks();
    const totalLocations = risks.length;
    const totalIncidents = risks.reduce((sum, r) => sum + r.incidentCount, 0);
    const totalLostItems = risks.reduce((sum, r) => sum + r.totalLostCount, 0);

    const riskDistribution = {
      CRITICAL: risks.filter(r => r.riskLevel === 'CRITICAL').length,
      HIGH: risks.filter(r => r.riskLevel === 'HIGH').length,
      MEDIUM: risks.filter(r => r.riskLevel === 'MEDIUM').length,
      LOW: risks.filter(r => r.riskLevel === 'LOW').length
    };

    return {
      totalLocations,
      totalIncidents,
      totalLostItems,
      riskDistribution,
      highestRiskLocation: risks[0] || null,
      lastUpdated: this.lastUpdated
    };
  }
}

// Singleton instance
const csvRiskService = new CSVRiskService();

module.exports = csvRiskService;
