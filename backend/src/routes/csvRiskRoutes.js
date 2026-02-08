const express = require('express');
const router = express.Router();
const csvRiskService = require('../services/csvRiskService');
const Zone = require('../models/Zone');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

/**
 * GET /api/csv-risk/heatmap
 * Get risk heatmap data for map visualization
 */
router.get('/heatmap', async (req, res) => {
  try {
    if (!csvRiskService.loaded) {
      return res.json({
        loaded: false,
        message: 'Risk data not loaded. Please upload CSV data first.',
        locations: []
      });
    }

    const heatmapData = csvRiskService.getHeatmapData();

    // Enrich with zone data
    const zones = await Zone.find({}).lean();
    const zoneMap = new Map(zones.map(z => [z.name, z]));

    const enrichedLocations = heatmapData.locations.map(loc => {
      const zone = zoneMap.get(loc.location);
      return {
        ...loc,
        zoneId: zone?._id,
        coordinates: zone?.center,
        boundary: zone?.boundary,
        radius: zone?.radius,
        availableSlots: zone?.availableSlots,
        totalSlots: zone?.totalSlots
      };
    });

    res.json({
      loaded: true,
      timestamp: heatmapData.timestamp,
      locations: enrichedLocations
    });
  } catch (error) {
    console.error('Heatmap error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/csv-risk/locations
 * Get all locations with risk scores
 */
router.get('/locations', async (req, res) => {
  try {
    if (!csvRiskService.loaded) {
      return res.json({
        loaded: false,
        message: 'Risk data not loaded',
        locations: []
      });
    }

    const locations = csvRiskService.getAllLocationRisks();
    res.json({
      loaded: true,
      count: locations.length,
      locations
    });
  } catch (error) {
    console.error('Locations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/csv-risk/location/:name
 * Get risk data for specific location
 */
router.get('/location/:name', async (req, res) => {
  try {
    const { name } = req.params;

    if (!csvRiskService.loaded) {
      return res.json({
        loaded: false,
        message: 'Risk data not loaded'
      });
    }

    const riskScore = csvRiskService.calculateLocationRisk(name);
    const riskLevel = csvRiskService.getRiskLevel(riskScore);

    const allLocations = csvRiskService.getAllLocationRisks();
    const locationData = allLocations.find(l => l.location === name);

    if (!locationData) {
      return res.status(404).json({
        error: 'Location not found in risk data'
      });
    }

    res.json({
      loaded: true,
      location: name,
      riskScore,
      riskLevel,
      ...locationData
    });
  } catch (error) {
    console.error('Location risk error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/csv-risk/statistics
 * Get overall risk statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    if (!csvRiskService.loaded) {
      return res.json({
        loaded: false,
        message: 'Risk data not loaded',
        statistics: null
      });
    }

    const stats = csvRiskService.getStatistics();
    res.json({
      loaded: true,
      statistics: stats
    });
  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/csv-risk/zones/:zoneId/risk
 * Get risk score for a specific zone by ID
 */
router.get('/zones/:zoneId/risk', async (req, res) => {
  try {
    const { zoneId } = req.params;

    // Find zone
    const zone = await Zone.findOne({ zoneId }).lean();
    if (!zone) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    if (!csvRiskService.loaded) {
      return res.json({
        loaded: false,
        zoneId,
        zoneName: zone.name,
        message: 'Risk data not loaded'
      });
    }

    const riskScore = csvRiskService.calculateLocationRisk(zone.name);
    const riskLevel = csvRiskService.getRiskLevel(riskScore);

    res.json({
      loaded: true,
      zoneId,
      zoneName: zone.name,
      riskScore,
      riskLevel
    });
  } catch (error) {
    console.error('Zone risk error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/csv-risk/status
 * Get service status
 */
router.get('/status', async (req, res) => {
  try {
    res.json({
      loaded: csvRiskService.loaded,
      lastUpdated: csvRiskService.lastUpdated,
      locationCount: csvRiskService.locationData.size
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
