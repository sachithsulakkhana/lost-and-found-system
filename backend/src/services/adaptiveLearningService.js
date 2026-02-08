/**
 * ADAPTIVE LEARNING SERVICE - Real-time Model Updates
 *
 * This service implements online learning that continuously updates
 * the risk prediction model based on new incidents and patterns.
 *
 * Features:
 * - Incremental learning (no full retraining needed)
 * - Concept drift detection
 * - Automatic pattern adaptation
 * - Feedback loop integration
 */

const DeviceActivity = require('../models/DeviceActivity');
const RiskSnapshot = require('../models/RiskSnapshot');
const Alert = require('../models/Alert');
const Zone = require('../models/Zone');
const weatherService = require('./weatherService');

// Simple online learning using weighted moving averages
class OnlineRiskModel {
    constructor() {
        // Zone-specific risk patterns (learned over time)
        this.zonePatterns = new Map();

        // Time-based patterns (hourly risk profiles)
        this.temporalPatterns = new Map();

        // Crowd-risk correlation (learned dynamically)
        this.crowdRiskWeights = new Map();

        // Learning rate (how fast model adapts to new data)
        this.learningRate = 0.1;

        // Drift detection
        this.recentAccuracy = [];
        this.accuracyWindowSize = 50;

        // Load existing patterns from database
        this.loadPatterns();
    }

    /**
     * Load historical patterns from database
     */
    async loadPatterns() {
        try {
            console.log('Loading historical patterns for adaptive learning...');

            // Get all zones
            const zones = await Zone.find();

            for (const zone of zones) {
                // Initialize zone pattern
                this.zonePatterns.set(zone._id.toString(), {
                    baseRisk: 0.3,
                    incidentCount: 0,
                    crowdSensitivity: 0.5,
                    lastUpdated: new Date()
                });

                // Calculate historical risk from past incidents
                const historicalIncidents = await Alert.countDocuments({
                    zoneId: zone._id,
                    type: 'ITEM_LOST',
                    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
                });

                const historicalActivities = await DeviceActivity.countDocuments({
                    zoneId: zone._id,
                    timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                });

                // Calculate base risk
                const baseRisk = historicalActivities > 0
                    ? historicalIncidents / historicalActivities
                    : 0.3;

                this.zonePatterns.get(zone._id.toString()).baseRisk = Math.min(baseRisk, 1.0);
                this.zonePatterns.get(zone._id.toString()).incidentCount = historicalIncidents;
            }

            // Load temporal patterns (risk by hour of day)
            for (let hour = 0; hour < 24; hour++) {
                const hourIncidents = await Alert.countDocuments({
                    type: 'ITEM_LOST',
                    createdAt: {
                        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    }
                });

                this.temporalPatterns.set(hour, {
                    riskMultiplier: 1.0,
                    incidentCount: 0
                });
            }

            console.log(`Loaded patterns for ${zones.length} zones`);
        } catch (error) {
            console.error('Error loading patterns:', error);
        }
    }

    /**
     * CORE: Predict risk using current learned patterns
     */
    async predictRisk(zoneId, timestamp = new Date()) {
        const zoneIdStr = zoneId.toString();

        // Get current zone pattern (or initialize)
        if (!this.zonePatterns.has(zoneIdStr)) {
            this.zonePatterns.set(zoneIdStr, {
                baseRisk: 0.3,
                incidentCount: 0,
                crowdSensitivity: 0.5,
                lastUpdated: new Date()
            });
        }

        const zonePattern = this.zonePatterns.get(zoneIdStr);

        // Extract features
        const features = await this.extractFeatures(zoneId, timestamp);

        // Calculate risk using learned patterns
        let risk = zonePattern.baseRisk;

        // Temporal factor (learned from past incidents at this hour)
        const hour = timestamp.getHours();
        const temporalPattern = this.temporalPatterns.get(hour) || { riskMultiplier: 1.0 };
        risk *= temporalPattern.riskMultiplier;

        // Crowd factor (learned sensitivity)
        const crowdFactor = features.crowdLevel / 100; // Normalize to 0-1
        risk += crowdFactor * zonePattern.crowdSensitivity;

        // Weather factor
        if (features.weather === 'Rain' || features.weather === 'Storm') {
            risk *= 1.3;
        }

        // Weekend/exam period adjustments
        if (features.isWeekend) {
            risk *= 0.7; // Lower risk on weekends
        }

        // Recent incident spike detection
        const recentIncidents = await this.getRecentIncidents(zoneId, 60); // Last hour
        if (recentIncidents > 2) {
            risk *= 1.5; // Spike detected!
        }

        // Normalize to 0-1
        risk = Math.max(0, Math.min(1, risk));

        // Convert to risk level
        const riskLevel = this.getRiskLevel(risk);

        return {
            riskScore: risk,
            riskLevel,
            features,
            confidence: this.calculateConfidence(zoneIdStr),
            modelVersion: 'adaptive-v1',
            lastUpdated: zonePattern.lastUpdated
        };
    }

    /**
     * CORE: Update model with new incident (online learning)
     */
    async updateFromIncident(zoneId, incidentData) {
        const zoneIdStr = zoneId.toString();

        if (!this.zonePatterns.has(zoneIdStr)) {
            await this.loadPatterns();
        }

        const zonePattern = this.zonePatterns.get(zoneIdStr);
        const timestamp = incidentData.timestamp || new Date();
        const hour = timestamp.getHours();

        // Extract features at time of incident
        const features = await this.extractFeatures(zoneId, timestamp);

        // Get current prediction to calculate error
        const prediction = await this.predictRisk(zoneId, timestamp);
        const actualOutcome = incidentData.lossOccurred ? 1.0 : 0.0;
        const predictionError = actualOutcome - prediction.riskScore;

        // Update zone base risk (using exponential moving average)
        const alpha = this.learningRate;
        zonePattern.baseRisk = (1 - alpha) * zonePattern.baseRisk + alpha * actualOutcome;

        // Update crowd sensitivity
        const crowdFactor = features.crowdLevel / 100;
        if (actualOutcome === 1.0 && crowdFactor > 0.5) {
            // High crowd led to loss - increase sensitivity
            zonePattern.crowdSensitivity = Math.min(
                1.0,
                zonePattern.crowdSensitivity + alpha * 0.1
            );
        } else if (actualOutcome === 0.0 && crowdFactor > 0.5) {
            // High crowd but no loss - decrease sensitivity
            zonePattern.crowdSensitivity = Math.max(
                0.1,
                zonePattern.crowdSensitivity - alpha * 0.05
            );
        }

        // Update temporal pattern
        const temporalPattern = this.temporalPatterns.get(hour);
        if (temporalPattern) {
            temporalPattern.incidentCount += actualOutcome;

            // Recalculate multiplier
            const avgIncidents = Array.from(this.temporalPatterns.values())
                .reduce((sum, p) => sum + p.incidentCount, 0) / 24;

            temporalPattern.riskMultiplier = avgIncidents > 0
                ? temporalPattern.incidentCount / avgIncidents
                : 1.0;
        }

        // Update incident count
        zonePattern.incidentCount += actualOutcome;
        zonePattern.lastUpdated = new Date();

        // Track prediction accuracy for drift detection
        const accurate = Math.abs(predictionError) < 0.3; // Within 30% margin
        this.recentAccuracy.push(accurate ? 1 : 0);
        if (this.recentAccuracy.length > this.accuracyWindowSize) {
            this.recentAccuracy.shift();
        }

        // Check for concept drift
        await this.checkConceptDrift();

        // Save updated patterns to database
        await this.savePatterns(zoneIdStr);

        console.log(`✓ Model updated from incident at zone ${zoneIdStr}: Risk ${prediction.riskScore.toFixed(2)} → Actual ${actualOutcome}, Error: ${predictionError.toFixed(2)}`);

        return {
            predictionError,
            updatedBaseRisk: zonePattern.baseRisk,
            updatedCrowdSensitivity: zonePattern.crowdSensitivity
        };
    }

    /**
     * Detect if patterns have changed (concept drift)
     */
    async checkConceptDrift() {
        if (this.recentAccuracy.length < this.accuracyWindowSize) {
            return false; // Not enough data
        }

        const currentAccuracy = this.recentAccuracy.reduce((a, b) => a + b) / this.recentAccuracy.length;

        console.log(`Current model accuracy: ${(currentAccuracy * 100).toFixed(1)}%`);

        // If accuracy drops below 60%, drift detected
        if (currentAccuracy < 0.6) {
            console.warn('⚠️  CONCEPT DRIFT DETECTED - Model accuracy dropped below 60%');

            // Increase learning rate temporarily to adapt faster
            this.learningRate = Math.min(0.3, this.learningRate * 1.5);

            // Create alert for admin
            await Alert.create({
                type: 'MODEL_DRIFT',
                severity: 'HIGH',
                message: `Risk model accuracy dropped to ${(currentAccuracy * 100).toFixed(1)}%. Model adapting to new patterns.`,
                metadata: {
                    accuracy: currentAccuracy,
                    learningRate: this.learningRate
                }
            });

            return true;
        }

        // Gradually reduce learning rate as model stabilizes
        if (currentAccuracy > 0.8) {
            this.learningRate = Math.max(0.05, this.learningRate * 0.95);
        }

        return false;
    }

    /**
     * Extract real-time features for prediction
     */
    async extractFeatures(zoneId, timestamp = new Date()) {
        const hour = timestamp.getHours();
        const dayOfWeek = timestamp.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // Get current crowd level (active devices in last 5 minutes)
        const crowdLevel = await DeviceActivity.countDocuments({
            zoneId,
            status: 'ONLINE',
            timestamp: { $gte: new Date(timestamp.getTime() - 5 * 60 * 1000) }
        });

        // Get weather
        let weather = 'Clear';
        try {
            const weatherData = await weatherService.getCurrentWeather();
            weather = weatherData?.condition || 'Clear';
        } catch (error) {
            // Use default if weather service fails
        }

        // Get recent incidents (last 6 hours)
        const recentIncidents = await Alert.countDocuments({
            zoneId,
            type: 'ITEM_LOST',
            createdAt: { $gte: new Date(timestamp.getTime() - 6 * 60 * 60 * 1000) }
        });

        return {
            hour,
            dayOfWeek,
            isWeekend,
            crowdLevel,
            weather,
            recentIncidents,
            timestamp
        };
    }

    /**
     * Get recent incidents count
     */
    async getRecentIncidents(zoneId, minutesAgo) {
        return await Alert.countDocuments({
            zoneId,
            type: 'ITEM_LOST',
            createdAt: { $gte: new Date(Date.now() - minutesAgo * 60 * 1000) }
        });
    }

    /**
     * Convert risk score to level
     */
    getRiskLevel(score) {
        if (score < 0.25) return 'LOW';
        if (score < 0.5) return 'MEDIUM';
        if (score < 0.75) return 'HIGH';
        return 'CRITICAL';
    }

    /**
     * Calculate prediction confidence
     */
    calculateConfidence(zoneId) {
        const pattern = this.zonePatterns.get(zoneId);
        if (!pattern) return 0.5;

        // More incidents = higher confidence
        const incidentConfidence = Math.min(1.0, pattern.incidentCount / 50);

        // Recent updates = higher confidence
        const hoursSinceUpdate = (Date.now() - pattern.lastUpdated.getTime()) / (1000 * 60 * 60);
        const recencyConfidence = Math.max(0.3, 1.0 - (hoursSinceUpdate / 168)); // Decay over 1 week

        return (incidentConfidence + recencyConfidence) / 2;
    }

    /**
     * Save patterns to database (for persistence)
     */
    async savePatterns(zoneId) {
        try {
            const pattern = this.zonePatterns.get(zoneId);

            await RiskSnapshot.findOneAndUpdate(
                {
                    zoneId,
                    snapshotType: 'LEARNED_PATTERN'
                },
                {
                    zoneId,
                    snapshotType: 'LEARNED_PATTERN',
                    riskLevel: this.getRiskLevel(pattern.baseRisk),
                    crowdDensity: pattern.crowdSensitivity * 100,
                    metadata: {
                        baseRisk: pattern.baseRisk,
                        incidentCount: pattern.incidentCount,
                        crowdSensitivity: pattern.crowdSensitivity,
                        learningRate: this.learningRate
                    },
                    timestamp: pattern.lastUpdated
                },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error saving patterns:', error);
        }
    }

    /**
     * Get all zone risk predictions
     */
    async predictAllZones() {
        const zones = await Zone.find();
        const predictions = [];

        for (const zone of zones) {
            const prediction = await this.predictRisk(zone._id);
            predictions.push({
                zoneId: zone._id,
                zoneName: zone.name,
                ...prediction
            });
        }

        return predictions;
    }

    /**
     * Force model retraining from scratch
     */
    async retrain() {
        console.log('Retraining adaptive model from scratch...');
        this.zonePatterns.clear();
        this.temporalPatterns.clear();
        this.recentAccuracy = [];
        await this.loadPatterns();
        console.log('Model retrained successfully');
    }
}

// Singleton instance
let modelInstance = null;

const getModel = () => {
    if (!modelInstance) {
        modelInstance = new OnlineRiskModel();
    }
    return modelInstance;
};

module.exports = {
    getModel,
    OnlineRiskModel
};
