/**
 * ADAPTIVE RISK API ROUTES
 *
 * Endpoints for real-time adaptive learning system
 */

const express = require('express');
const router = express.Router();
const { getModel } = require('../services/adaptiveLearningService');
const { getProcessor } = require('../services/realTimeStreamService');
const auth = require('../middleware/auth');
const Alert = require('../models/Alert');
const RiskSnapshot = require('../models/RiskSnapshot');
const Zone = require('../models/Zone');

/**
 * GET /api/adaptive-risk/predict/:zoneId
 * Get current risk prediction for a zone
 */
router.get('/predict/:zoneId', auth, async (req, res) => {
    try {
        const model = getModel();
        const prediction = await model.predictRisk(req.params.zoneId);

        res.json({
            success: true,
            prediction
        });
    } catch (error) {
        console.error('Error getting prediction:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get prediction',
            error: error.message
        });
    }
});

/**
 * GET /api/adaptive-risk/predict-all
 * Get predictions for all zones
 */
router.get('/predict-all', auth, async (req, res) => {
    try {
        const model = getModel();
        const predictions = await model.predictAllZones();

        res.json({
            success: true,
            predictions,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error getting all predictions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get predictions',
            error: error.message
        });
    }
});

/**
 * POST /api/adaptive-risk/feedback
 * Submit feedback on a prediction (to improve model)
 */
router.post('/feedback', auth, async (req, res) => {
    try {
        const { zoneId, actualOutcome, predictionId, comments } = req.body;

        // Validate input
        if (!zoneId || actualOutcome === undefined) {
            return res.status(400).json({
                success: false,
                message: 'zoneId and actualOutcome are required'
            });
        }

        const model = getModel();

        // Update model with feedback
        const incidentData = {
            zoneId,
            timestamp: new Date(),
            lossOccurred: actualOutcome === true || actualOutcome === 'loss',
            feedback: true,
            comments,
            userId: req.user.userId
        };

        const updateResult = await model.updateFromIncident(zoneId, incidentData);

        // Save feedback to database
        await Alert.create({
            type: 'USER_FEEDBACK',
            severity: 'LOW',
            zoneId,
            userId: req.user.userId,
            message: `User feedback: ${actualOutcome ? 'Loss occurred' : 'No loss'} - ${comments || 'No comment'}`,
            metadata: {
                predictionId,
                actualOutcome,
                updateResult,
                comments
            }
        });

        res.json({
            success: true,
            message: 'Feedback recorded and model updated',
            updateResult
        });
    } catch (error) {
        console.error('Error processing feedback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process feedback',
            error: error.message
        });
    }
});

/**
 * POST /api/adaptive-risk/incident
 * Report a new incident (triggers immediate model update)
 */
router.post('/incident', auth, async (req, res) => {
    try {
        const { zoneId, description, severity = 'MEDIUM' } = req.body;

        if (!zoneId) {
            return res.status(400).json({
                success: false,
                message: 'zoneId is required'
            });
        }

        // Create alert
        const alert = await Alert.create({
            type: 'ITEM_LOST',
            severity,
            zoneId,
            userId: req.user.userId,
            message: description || 'Item loss reported',
            metadata: {
                reportedBy: req.user.userId,
                source: 'USER_REPORT'
            }
        });

        // Immediately update model
        const model = getModel();
        const updateResult = await model.updateFromIncident(zoneId, {
            zoneId,
            timestamp: new Date(),
            lossOccurred: true,
            severity,
            alertId: alert._id
        });

        // Trigger immediate risk recalculation for affected zone
        const newPrediction = await model.predictRisk(zoneId);

        res.json({
            success: true,
            message: 'Incident reported and model updated',
            alert,
            updateResult,
            newPrediction
        });
    } catch (error) {
        console.error('Error reporting incident:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to report incident',
            error: error.message
        });
    }
});

/**
 * GET /api/adaptive-risk/model-stats
 * Get model performance statistics
 */
router.get('/model-stats', auth, async (req, res) => {
    try {
        const model = getModel();

        // Get recent predictions
        const recentPredictions = await RiskSnapshot.find({
            modelVersion: 'adaptive-v1',
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        // Get actual incidents
        const actualIncidents = await Alert.find({
            type: 'ITEM_LOST',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        // Calculate accuracy (simplified)
        let correctPredictions = 0;
        let totalPredictions = 0;

        for (const prediction of recentPredictions) {
            const incident = actualIncidents.find(inc =>
                inc.zoneId.toString() === prediction.zoneId.toString() &&
                Math.abs(inc.createdAt - prediction.timestamp) < 60 * 60 * 1000 // Within 1 hour
            );

            totalPredictions++;

            if (incident && (prediction.riskLevel === 'HIGH' || prediction.riskLevel === 'CRITICAL')) {
                correctPredictions++;
            } else if (!incident && (prediction.riskLevel === 'LOW' || prediction.riskLevel === 'MEDIUM')) {
                correctPredictions++;
            }
        }

        const accuracy = totalPredictions > 0 ? (correctPredictions / totalPredictions) : 0;

        // Get zone-specific stats
        const zoneStats = [];
        const zones = await Zone.find();

        for (const zone of zones) {
            const pattern = model.zonePatterns.get(zone._id.toString());
            if (pattern) {
                zoneStats.push({
                    zoneName: zone.name,
                    baseRisk: pattern.baseRisk.toFixed(3),
                    incidentCount: pattern.incidentCount,
                    crowdSensitivity: pattern.crowdSensitivity.toFixed(3),
                    lastUpdated: pattern.lastUpdated
                });
            }
        }

        res.json({
            success: true,
            stats: {
                accuracy: (accuracy * 100).toFixed(1) + '%',
                totalPredictions,
                correctPredictions,
                learningRate: model.learningRate.toFixed(3),
                recentAccuracyWindow: model.recentAccuracy.length,
                lastUpdate: new Date()
            },
            zoneStats
        });
    } catch (error) {
        console.error('Error getting model stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get model stats',
            error: error.message
        });
    }
});

/**
 * POST /api/adaptive-risk/retrain
 * Force model retraining (admin only)
 */
router.post('/retrain', auth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can trigger retraining'
            });
        }

        const model = getModel();
        await model.retrain();

        res.json({
            success: true,
            message: 'Model retrained successfully'
        });
    } catch (error) {
        console.error('Error retraining model:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrain model',
            error: error.message
        });
    }
});

/**
 * GET /api/adaptive-risk/stream-status
 * Get real-time stream processor status
 */
router.get('/stream-status', auth, async (req, res) => {
    try {
        const processor = getProcessor();

        res.json({
            success: true,
            status: {
                isRunning: processor.isRunning,
                lastProcessed: processor.lastProcessedTime,
                bufferSize: processor.incidentBuffer.length
            }
        });
    } catch (error) {
        console.error('Error getting stream status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get stream status',
            error: error.message
        });
    }
});

/**
 * POST /api/adaptive-risk/process-now
 * Trigger immediate processing (admin only)
 */
router.post('/process-now', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can trigger immediate processing'
            });
        }

        const processor = getProcessor();
        await processor.processNow();

        res.json({
            success: true,
            message: 'Processing triggered successfully'
        });
    } catch (error) {
        console.error('Error triggering processing:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to trigger processing',
            error: error.message
        });
    }
});

/**
 * GET /api/adaptive-risk/history/:zoneId
 * Get risk prediction history for a zone
 */
router.get('/history/:zoneId', auth, async (req, res) => {
    try {
        const { hours = 24 } = req.query;

        const history = await RiskSnapshot.find({
            zoneId: req.params.zoneId,
            timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
        }).sort({ timestamp: -1 }).limit(100);

        // Also get actual incidents for comparison
        const incidents = await Alert.find({
            zoneId: req.params.zoneId,
            type: 'ITEM_LOST',
            createdAt: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            history,
            incidents,
            zoneId: req.params.zoneId
        });
    } catch (error) {
        console.error('Error getting history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get history',
            error: error.message
        });
    }
});

module.exports = router;
