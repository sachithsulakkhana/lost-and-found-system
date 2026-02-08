const express = require('express');
const router = express.Router();
const RiskSnapshot = require('../models/RiskSnapshot');
const Zone = require('../models/Zone');
const { requireAuth, requireApproved } = require('../middleware/auth');
const riskService = require('../services/riskService');
const riskAnalysisService = require('../services/riskAnalysisService');

router.use(requireAuth);
router.use(requireApproved);

router.get('/current', async (req, res) => {
  try {
    const { deviceId } = req.query;
    
    if (deviceId) {
      const device = await require('../models/Device').findById(deviceId);
      if (!device || !device.preferredZoneId) {
        return res.json({ riskLevel: 'LOW' });
      }
      
      const risk = await riskService.calculateRiskLevel(device.preferredZoneId);
      return res.json(risk);
    }
    
    const zones = await Zone.find({ isActive: true });
    const risks = await Promise.all(
      zones.map(async (zone) => {
        const risk = await riskService.calculateRiskLevel(zone._id);
        return { zone: zone.name, ...risk };
      })
    );
    
    res.json(risks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/zones', async (req, res) => {
  try {
    const zones = await Zone.find({ isActive: true });

    const heatmap = await Promise.all(
      zones.map(async (zone) => {
        const risk = await riskService.calculateRiskLevel(zone._id);
        return {
          zoneId: zone._id,
          name: zone.name,
          center: zone.center,
          radius: zone.radius,
          boundary: zone.boundary,
          totalSlots: zone.totalSlots,
          availableSlots: zone.availableSlots,
          riskLevel: risk.riskLevel,
          riskScore: risk.riskScore
        };
      })
    );

    res.json(heatmap);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risk/analysis/heatmap
 * Get ML-powered spatio-temporal risk heatmap
 */
router.get('/analysis/heatmap', async (req, res) => {
  try {
    const heatmap = await riskAnalysisService.getRiskHeatmap();
    res.json(heatmap);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risk/analysis/zone/:zoneId
 * Get detailed risk analysis for a specific zone
 */
router.get('/analysis/zone/:zoneId', async (req, res) => {
  try {
    const risk = await riskAnalysisService.calculateZoneRisk(req.params.zoneId);
    res.json(risk);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risk/analysis/forecast/:zoneId
 * Get risk forecast for next 24 hours
 */
router.get('/analysis/forecast/:zoneId', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const forecast = await riskAnalysisService.getRiskForecast(req.params.zoneId, hours);
    res.json(forecast);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/risk/analysis/refresh
 * Clear risk cache and recalculate
 */
router.post('/analysis/refresh', async (req, res) => {
  try {
    riskAnalysisService.clearCache();
    const risks = await riskAnalysisService.getAllZonesRisk();
    res.json({ success: true, zones: risks.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
