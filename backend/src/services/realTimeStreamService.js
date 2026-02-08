/**
 * REAL-TIME STREAM SERVICE
 *
 * Continuously processes incoming data and feeds it to the adaptive model
 * Handles: Device pings, incidents, zone changes, weather updates
 */

const cron = require('node-cron');
const { getModel } = require('./adaptiveLearningService');
const DeviceActivity = require('../models/DeviceActivity');
const DevicePing = require('../models/DevicePing');
const Alert = require('../models/Alert');
const Zone = require('../models/Zone');
const RiskSnapshot = require('../models/RiskSnapshot');

class RealTimeStreamProcessor {
    constructor() {
        this.isRunning = false;
        this.updateInterval = null;
        this.lastProcessedTime = new Date();
        this.model = getModel();

        // Buffer for batch processing
        this.incidentBuffer = [];
        this.bufferFlushInterval = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Start real-time processing
     */
    start() {
        if (this.isRunning) {
            console.log('Stream processor already running');
            return;
        }

        console.log('🚀 Starting Real-Time Stream Processor...');
        this.isRunning = true;

        // Process new data every 2 minutes
        this.updateInterval = cron.schedule('*/2 * * * *', async () => {
            await this.processNewData();
        });

        // Update risk predictions every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            await this.updateRiskPredictions();
        });

        // Flush incident buffer every 5 minutes
        setInterval(async () => {
            await this.flushIncidentBuffer();
        }, this.bufferFlushInterval);

        // Daily model health check (at 2 AM)
        cron.schedule('0 2 * * *', async () => {
            await this.dailyHealthCheck();
        });

        console.log('✓ Stream processor started successfully');
    }

    /**
     * Stop processing
     */
    stop() {
        if (this.updateInterval) {
            this.updateInterval.stop();
        }
        this.isRunning = false;
        console.log('Stream processor stopped');
    }

    /**
     * Process new data since last check
     */
    async processNewData() {
        try {
            const now = new Date();
            console.log(`Processing new data since ${this.lastProcessedTime.toISOString()}`);

            // 1. Process new incidents (actual loss events)
            const newIncidents = await Alert.find({
                type: 'ITEM_LOST',
                createdAt: { $gt: this.lastProcessedTime, $lte: now }
            }).populate('zoneId');

            for (const incident of newIncidents) {
                await this.processIncident(incident);
            }

            // 2. Process device anomalies (potential losses)
            const newAnomalies = await DeviceActivity.find({
                isAnomaly: true,
                timestamp: { $gt: this.lastProcessedTime, $lte: now }
            });

            for (const anomaly of newAnomalies) {
                await this.processAnomaly(anomaly);
            }

            // 3. Update zone status changes
            await this.processZoneChanges();

            // 4. Check for pattern shifts
            await this.detectPatternShifts();

            this.lastProcessedTime = now;

            console.log(`✓ Processed ${newIncidents.length} incidents, ${newAnomalies.length} anomalies`);
        } catch (error) {
            console.error('Error processing new data:', error);
        }
    }

    /**
     * Process individual incident and update model
     */
    async processIncident(incident) {
        if (!incident.zoneId) {
            console.warn(`Incident ${incident._id} has no zone - skipping`);
            return;
        }

        const incidentData = {
            zoneId: incident.zoneId._id || incident.zoneId,
            timestamp: incident.createdAt,
            lossOccurred: true,
            severity: incident.severity,
            metadata: incident.metadata
        };

        // Add to buffer for batch processing
        this.incidentBuffer.push(incidentData);

        // Update model immediately for high-severity incidents
        if (incident.severity === 'HIGH' || incident.severity === 'CRITICAL') {
            console.log(`⚠️  High-severity incident detected - immediate model update`);
            await this.model.updateFromIncident(incidentData.zoneId, incidentData);
        }
    }

    /**
     * Process anomaly detection
     */
    async processAnomaly(anomaly) {
        // Anomalies are potential losses - treat as soft signal
        const incidentData = {
            zoneId: anomaly.zoneId,
            timestamp: anomaly.timestamp,
            lossOccurred: false, // Not confirmed loss, just anomaly
            anomalyScore: anomaly.anomalyScore || 0,
            metadata: {
                type: 'ANOMALY',
                deviceId: anomaly.deviceId
            }
        };

        // Update model with lower weight (not confirmed loss)
        this.incidentBuffer.push(incidentData);
    }

    /**
     * Flush buffered incidents to model
     */
    async flushIncidentBuffer() {
        if (this.incidentBuffer.length === 0) {
            return;
        }

        console.log(`Flushing ${this.incidentBuffer.length} incidents to model`);

        for (const incident of this.incidentBuffer) {
            try {
                await this.model.updateFromIncident(incident.zoneId, incident);
            } catch (error) {
                console.error(`Error updating model with incident:`, error);
            }
        }

        // Clear buffer
        this.incidentBuffer = [];
        console.log('✓ Incident buffer flushed');
    }

    /**
     * Update risk predictions for all zones
     */
    async updateRiskPredictions() {
        try {
            console.log('Updating risk predictions for all zones...');

            const zones = await Zone.find({ status: 'OPEN' });
            const predictions = [];

            for (const zone of zones) {
                const prediction = await this.model.predictRisk(zone._id);

                // Save to database
                await RiskSnapshot.create({
                    zoneId: zone._id,
                    timestamp: new Date(),
                    riskLevel: prediction.riskLevel,
                    riskScore: prediction.riskScore,
                    crowdDensity: prediction.features.crowdLevel,
                    metadata: {
                        confidence: prediction.confidence,
                        modelVersion: prediction.modelVersion,
                        features: prediction.features
                    }
                });

                predictions.push({
                    zoneName: zone.name,
                    risk: prediction.riskLevel,
                    score: prediction.riskScore.toFixed(2)
                });

                // Create alert if risk suddenly spikes
                if (prediction.riskLevel === 'HIGH' || prediction.riskLevel === 'CRITICAL') {
                    await this.createRiskAlert(zone, prediction);
                }
            }

            console.log(`✓ Updated predictions for ${zones.length} zones:`, predictions);
        } catch (error) {
            console.error('Error updating risk predictions:', error);
        }
    }

    /**
     * Create alert for high-risk zones
     */
    async createRiskAlert(zone, prediction) {
        // Check if alert already exists for this zone in last 30 minutes
        const existingAlert = await Alert.findOne({
            zoneId: zone._id,
            type: 'HIGH_RISK',
            createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
        });

        if (existingAlert) {
            return; // Don't spam alerts
        }

        await Alert.create({
            type: 'HIGH_RISK',
            severity: prediction.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
            zoneId: zone._id,
            message: `${zone.name} is at ${prediction.riskLevel} risk (${(prediction.riskScore * 100).toFixed(0)}%). Crowd: ${prediction.features.crowdLevel} devices`,
            metadata: {
                riskScore: prediction.riskScore,
                crowdLevel: prediction.features.crowdLevel,
                weather: prediction.features.weather,
                confidence: prediction.confidence
            }
        });

        console.log(`🚨 Risk alert created for ${zone.name}: ${prediction.riskLevel}`);
    }

    /**
     * Detect sudden pattern shifts
     */
    async detectPatternShifts() {
        try {
            // Get risk snapshots from last 2 hours
            const recentSnapshots = await RiskSnapshot.find({
                timestamp: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
            }).sort({ timestamp: -1 });

            // Group by zone
            const zoneSnapshots = {};
            for (const snapshot of recentSnapshots) {
                const zoneId = snapshot.zoneId.toString();
                if (!zoneSnapshots[zoneId]) {
                    zoneSnapshots[zoneId] = [];
                }
                zoneSnapshots[zoneId].push(snapshot);
            }

            // Check for sudden shifts
            for (const [zoneId, snapshots] of Object.entries(zoneSnapshots)) {
                if (snapshots.length < 5) continue; // Need enough data

                const riskScores = snapshots.map(s => {
                    const levels = { LOW: 0.2, MEDIUM: 0.4, HIGH: 0.7, CRITICAL: 0.9 };
                    return levels[s.riskLevel] || 0.3;
                });

                // Calculate variance
                const mean = riskScores.reduce((a, b) => a + b) / riskScores.length;
                const variance = riskScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / riskScores.length;

                // If high variance, pattern is shifting
                if (variance > 0.15) {
                    console.log(`⚠️  Pattern shift detected in zone ${zoneId}: variance=${variance.toFixed(3)}`);

                    // Increase learning rate for this zone temporarily
                    // (This would require zone-specific learning rates - enhancement for later)
                }
            }
        } catch (error) {
            console.error('Error detecting pattern shifts:', error);
        }
    }

    /**
     * Process zone status changes
     */
    async processZoneChanges() {
        // When zone closes/opens, immediately recalculate nearby zones
        // (zones might get overflow traffic)
        const recentlyChangedZones = await Zone.find({
            lastStatusChange: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        });

        for (const zone of recentlyChangedZones) {
            console.log(`Zone ${zone.name} status changed to ${zone.status}`);

            if (zone.status === 'CLOSED') {
                // Find nearby zones (simplified - assumes zones are in array order)
                // In production, use geospatial queries
                const nearbyZones = await Zone.find({
                    _id: { $ne: zone._id },
                    status: 'OPEN'
                }).limit(3);

                // Recalculate risk for nearby zones (might receive overflow crowd)
                for (const nearbyZone of nearbyZones) {
                    await this.model.predictRisk(nearbyZone._id);
                }
            }
        }
    }

    /**
     * Daily health check
     */
    async dailyHealthCheck() {
        console.log('Running daily model health check...');

        try {
            // Check model accuracy over last 24 hours
            const predictions = await RiskSnapshot.find({
                timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
                modelVersion: 'adaptive-v1'
            });

            const actualIncidents = await Alert.find({
                type: 'ITEM_LOST',
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            });

            // Calculate metrics
            console.log(`Daily Stats: ${predictions.length} predictions, ${actualIncidents.length} actual incidents`);

            // If model hasn't been updated in 7 days, trigger refresh
            const oldestUpdate = await RiskSnapshot.findOne({ snapshotType: 'LEARNED_PATTERN' })
                .sort({ timestamp: 1 });

            if (oldestUpdate) {
                const daysSinceUpdate = (Date.now() - oldestUpdate.timestamp.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceUpdate > 7) {
                    console.log('⚠️  Model patterns are stale - triggering refresh');
                    await this.model.retrain();
                }
            }

            console.log('✓ Health check complete');
        } catch (error) {
            console.error('Error in health check:', error);
        }
    }

    /**
     * Manual trigger for immediate processing
     */
    async processNow() {
        await this.processNewData();
        await this.updateRiskPredictions();
        console.log('Manual processing complete');
    }
}

// Singleton instance
let processorInstance = null;

const getProcessor = () => {
    if (!processorInstance) {
        processorInstance = new RealTimeStreamProcessor();
    }
    return processorInstance;
};

module.exports = {
    getProcessor,
    RealTimeStreamProcessor
};
