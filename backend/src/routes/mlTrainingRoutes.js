const express = require('express');
const router = express.Router();
const pythonMLService = require('../services/pythonMLService');
const Zone = require('../models/Zone');
const { requireAuth, requireRole } = require('../middleware/auth');
const weatherService = require('../services/weatherService');

/**
 * POST /api/ml-training/train
 * Trigger Python ML model training
 */
router.post('/train', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    // Note: Python ML training is done via the Python service directly
    // Call http://localhost:5001/api/train to train the model
    res.json({
      success: false,
      message: 'Training should be done via Python ML Service at http://localhost:5001/api/train',
      info: 'Or run: cd ml-service && python train_simple.py'
    });
  } catch (error) {
    console.error('Training error:', error);
    res.status(500).json({
      error: 'Failed to train model',
      message: error.message
    });
  }
});

/**
 * POST /api/ml-training/predict
 * Get prediction for specific input using Python XGBoost
 */
router.post('/predict', requireAuth, async (req, res) => {
  try {
    const { location, time, crowdLevel, weather, dayType, itemType } = req.body;

    if (!location || !time) {
      return res.status(400).json({ error: 'location and time are required' });
    }

    const prediction = await pythonMLService.predict(
      location,
      crowdLevel || 'medium',
      time || '12:00',
      weather || 'sunny',
      dayType || 'weekday',
      itemType || 'phone'
    );

    res.json(prediction);
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({
      error: 'Failed to make prediction',
      message: error.message
    });
  }
});

/**
 * GET /api/ml-training/predict/all
 * Get predictions for all locations using Python XGBoost
 */
router.get('/predict/all', async (req, res) => {
  try {
    const { time, dayType, weather, crowdLevel } = req.query;

    // Get all zones
    const zones = await Zone.find({}).lean();
    const locationNames = zones.map(z => z.name);

    const predictions = await pythonMLService.predictAllLocations(
      locationNames,
      time || '12:00',
      dayType || 'weekday',
      weather || 'sunny',
      crowdLevel || 'medium'
    );

    res.json({
      predictions,
      count: predictions.length,
      timestamp: new Date(),
      modelType: 'Python XGBoost'
    });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({
      error: 'Failed to make predictions',
      message: error.message
    });
  }
});

/**
 * GET /api/ml-training/heatmap
 * Get ML heatmap data for visualization with real-time weather/crowd
 * Uses Python XGBoost for all predictions
 */
router.get('/heatmap', async (req, res) => {
  try {
    const { time, dayType, weather, crowdLevel } = req.query;

    // Get real-time conditions
    const currentWeather = weather || await weatherService.getCurrentWeather();
    const currentCrowd = crowdLevel || weatherService.getCurrentCrowdLevel();

    // Get current time in Asia/Colombo timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const currentTime = formatter.format(now);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      weekday: 'short'
    });
    const dayName = dayFormatter.format(now);
    const currentDayType = (dayName === 'Sat' || dayName === 'Sun') ? 'weekend' : 'weekday';

    // Get all zones first
    const zones = await Zone.find({}).lean();
    const zoneMap = new Map(zones.map(z => [z.name, z]));
    const locationNames = zones.map(z => z.name);

    // Use Python ML service for predictions
    const predictions = await pythonMLService.predictAllLocations(
      locationNames,
      time || currentTime,
      dayType || currentDayType,
      currentWeather,
      currentCrowd
    );
    console.log('✅ Using Python XGBoost ML Service for predictions');

    const enrichedPredictions = predictions.map(pred => {
      const zone = zoneMap.get(pred.location);
      return {
        location: pred.location,
        riskLevel: pred.riskLevel,
        riskScore: pred.riskScore,
        confidence: pred.confidence,
        rfPrediction: pred.rfPrediction,
        nnPrediction: pred.nnPrediction,
        ensemblePrediction: pred.ensemblePrediction,
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
      timestamp: new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }),
      locations: enrichedPredictions,
      conditions: {
        weather: currentWeather,
        crowdLevel: currentCrowd,
        time: time || currentTime,
        dayType: dayType || currentDayType
      },
      modelType: 'Python XGBoost Gradient Boosting'
    });
  } catch (error) {
    console.error('Heatmap error:', error);
    res.status(500).json({
      error: 'Failed to generate heatmap',
      message: error.message
    });
  }
});

/**
 * GET /api/ml-training/zones/:zoneId/risk
 * Get ML risk prediction for specific zone using Python XGBoost
 */
router.get('/zones/:zoneId/risk', async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { time, dayType, weather, crowdLevel, itemType } = req.query;

    // Find zone by MongoDB _id
    const zone = await Zone.findById(zoneId).lean();
    if (!zone) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    // Get real-time conditions
    const currentWeather = weather || await weatherService.getCurrentWeather();
    const currentCrowd = crowdLevel || weatherService.getCurrentCrowdLevel();
    const currentTime = time || new Date().toTimeString().slice(0, 5);
    const currentDayType = dayType || (new Date().getDay() === 0 || new Date().getDay() === 6 ? 'weekend' : 'weekday');

    // Use Python ML service
    const prediction = await pythonMLService.predict(
      zone.name,
      currentCrowd,
      currentTime,
      currentWeather,
      currentDayType,
      itemType || 'phone'
    );
    console.log(`✅ Using Python XGBoost for zone ${zone.name}`);

    res.json({
      loaded: true,
      zoneId,
      zoneName: zone.name,
      ...prediction,
      modelType: prediction.modelType || 'Python XGBoost'
    });
  } catch (error) {
    console.error('Zone risk error:', error);
    res.status(500).json({
      error: 'Failed to predict zone risk',
      message: error.message
    });
  }
});

/**
 * GET /api/ml-training/stats
 * Get Python XGBoost model statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const modelInfo = await pythonMLService.getModelInfo();

    if (!modelInfo) {
      return res.status(503).json({
        error: 'Python ML Service unavailable',
        message: 'Cannot fetch model statistics'
      });
    }

    res.json({
      modelType: 'Python XGBoost',
      ...modelInfo
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * GET /api/ml-training/status
 * Check Python XGBoost model status
 */
router.get('/status', async (req, res) => {
  try {
    const isAvailable = await pythonMLService.checkHealth();
    const modelInfo = await pythonMLService.getModelInfo();

    res.json({
      trained: isAvailable,
      available: isAvailable,
      modelType: 'Python XGBoost Gradient Boosting',
      accuracy: modelInfo?.metrics?.accuracy || 'N/A',
      service: 'Python ML Service (http://localhost:5001)'
    });
  } catch (error) {
    res.status(200).json({
      trained: false,
      available: false,
      modelType: 'Python XGBoost Gradient Boosting',
      error: error.message
    });
  }
});

module.exports = router;
