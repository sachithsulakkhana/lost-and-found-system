const DeviceActivity = require('../models/DeviceActivity');
const Device = require('../models/Device');
const Alert = require('../models/Alert');

/**
 * Simplified Isolation Forest Implementation
 * Based on the paper "Isolation Forest" by Liu, Ting and Zhou
 */

class IsolationTree {
  constructor(data, height = 0, maxHeight = 10) {
    this.height = height;
    this.size = data.length;

    if (height >= maxHeight || data.length <= 1) {
      this.externalNode = true;
      return;
    }

    // Randomly select a feature
    const features = Object.keys(data[0]);
    const splitFeature = features[Math.floor(Math.random() * features.length)];

    // Get min and max values for the feature
    const values = data.map(d => d[splitFeature]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Random split value
    const splitValue = min + Math.random() * (max - min);

    // Split data
    const leftData = data.filter(d => d[splitFeature] < splitValue);
    const rightData = data.filter(d => d[splitFeature] >= splitValue);

    if (leftData.length === 0 || rightData.length === 0) {
      this.externalNode = true;
      return;
    }

    this.splitFeature = splitFeature;
    this.splitValue = splitValue;
    this.left = new IsolationTree(leftData, height + 1, maxHeight);
    this.right = new IsolationTree(rightData, height + 1, maxHeight);
  }

  pathLength(point) {
    if (this.externalNode) {
      return this.height + this._c(this.size);
    }

    if (point[this.splitFeature] < this.splitValue) {
      return this.left.pathLength(point);
    } else {
      return this.right.pathLength(point);
    }
  }

  _c(n) {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }
}

class IsolationForest {
  constructor(numTrees = 100, sampleSize = 256) {
    this.numTrees = numTrees;
    this.sampleSize = sampleSize;
    this.trees = [];
    this.trained = false;
  }

  train(data) {
    if (!data || data.length === 0) {
      throw new Error('Training data cannot be empty');
    }

    this.trees = [];
    const sampleSize = Math.min(this.sampleSize, data.length);

    for (let i = 0; i < this.numTrees; i++) {
      // Random sampling
      const sample = this._randomSample(data, sampleSize);
      const maxHeight = Math.ceil(Math.log2(sampleSize));
      this.trees.push(new IsolationTree(sample, 0, maxHeight));
    }

    this.trained = true;
    this.avgPathLength = this._c(sampleSize);
  }

  predict(point) {
    if (!this.trained) {
      throw new Error('Model must be trained before prediction');
    }

    const avgPathLength = this.trees.reduce((sum, tree) => {
      return sum + tree.pathLength(point);
    }, 0) / this.numTrees;

    // Anomaly score: 2^(-avgPathLength/c(n))
    // Score closer to 1 = anomaly, closer to 0 = normal
    const score = Math.pow(2, -avgPathLength / this.avgPathLength);
    return score;
  }

  _randomSample(data, size) {
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }

  _c(n) {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  // Serialize model for storage
  toJSON() {
    return {
      numTrees: this.numTrees,
      sampleSize: this.sampleSize,
      avgPathLength: this.avgPathLength,
      trained: this.trained
    };
  }
}

class AnomalyDetectionService {
  constructor() {
    this.models = new Map(); // deviceId -> IsolationForest model
    this.learningPeriodDays = 14; // 2 weeks
    this.anomalyThreshold = 0.6; // Scores above this are anomalies
  }

  /**
   * Check if device is still in learning phase
   */
  async isInLearningPhase(deviceId) {
    const device = await Device.findById(deviceId);
    if (!device) return true;

    const firstActivity = await DeviceActivity.findOne({ deviceId })
      .sort({ timestamp: 1 });

    if (!firstActivity) return true;

    const daysSinceFirstActivity =
      (Date.now() - firstActivity.timestamp.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceFirstActivity < this.learningPeriodDays;
  }

  /**
   * Train model for a specific device
   */
  async trainDeviceModel(deviceId) {
    try {
      // Get training data (activities marked as training data)
      const activities = await DeviceActivity.find({
        deviceId,
        isTrainingData: true
      }).limit(1000);

      if (activities.length < 50) {
        console.log(`Not enough training data for device ${deviceId}: ${activities.length} records`);
        return false;
      }

      // Extract features
      const trainingData = activities.map(activity => this._extractFeatures(activity));

      // Train Isolation Forest
      const model = new IsolationForest(100, Math.min(256, activities.length));
      model.train(trainingData);

      // Store model
      this.models.set(deviceId.toString(), model);

      // Update device to mark learning phase complete
      await Device.findByIdAndUpdate(deviceId, {
        $set: {
          learningPhaseComplete: true,
          modelLastTrained: new Date()
        }
      });

      console.log(`✅ Model trained for device ${deviceId} with ${activities.length} samples`);
      return true;
    } catch (error) {
      console.error(`Error training model for device ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Detect anomaly in real-time activity
   */
  async detectAnomaly(activityData) {
    try {
      const { deviceId, userId } = activityData;

      // Check if still in learning phase
      const inLearning = await this.isInLearningPhase(deviceId);
      if (inLearning) {
        console.log(`Device ${deviceId} still in learning phase`);
        return { isAnomaly: false, score: 0, reason: 'LEARNING_PHASE' };
      }

      // Get or train model
      let model = this.models.get(deviceId.toString());
      if (!model) {
        const trained = await this.trainDeviceModel(deviceId);
        if (!trained) {
          return { isAnomaly: false, score: 0, reason: 'MODEL_NOT_READY' };
        }
        model = this.models.get(deviceId.toString());
      }

      // Extract features from current activity
      const features = this._extractFeatures(activityData);

      // Get anomaly score
      const score = model.predict(features);

      // Determine if anomaly
      const isAnomaly = score > this.anomalyThreshold;

      if (isAnomaly) {
        console.log(`🚨 ANOMALY DETECTED for device ${deviceId}: score ${score.toFixed(3)}`);

        // Create alert
        await this._createAnomalyAlert(deviceId, userId, score, activityData);
      }

      return { isAnomaly, score, reason: isAnomaly ? 'BEHAVIORAL_ANOMALY' : 'NORMAL' };
    } catch (error) {
      console.error('Error in anomaly detection:', error);
      return { isAnomaly: false, score: 0, reason: 'ERROR' };
    }
  }

  /**
   * Create anomaly alert
   */
  async _createAnomalyAlert(deviceId, userId, score, activityData) {
    try {
      const device = await Device.findById(deviceId);

      const alert = await Alert.create({
        deviceId,
        userId,
        type: 'ANOMALY',
        severity: score > 0.8 ? 'CRITICAL' : 'HIGH',
        message: `Unusual activity detected for device "${device?.deviceName || 'Unknown'}" (Anomaly score: ${(score * 100).toFixed(1)}%)`,
        location: activityData.location,
        metadata: {
          anomalyScore: score,
          zoneId: activityData.zoneId,
          detectedAt: new Date()
        }
      });

      console.log(`📢 Alert created: ${alert._id}`);
      return alert;
    } catch (error) {
      console.error('Error creating anomaly alert:', error);
    }
  }

  /**
   * Extract ML features from activity data
   */
  _extractFeatures(activity) {
    const date = new Date(activity.timestamp || Date.now());
    const hourOfDay = date.getHours();
    const dayOfWeek = date.getDay();

    return {
      hourOfDay: hourOfDay / 23,                    // Normalize to 0-1
      dayOfWeek: dayOfWeek / 6,                     // Normalize to 0-1
      isWeekend: (dayOfWeek === 0 || dayOfWeek === 6) ? 1 : 0,
      status: activity.status === 'ONLINE' ? 1 : 0,
      signalStrength: (activity.networkInfo?.signalStrength || 0) / 100,
      zoneHash: this._hashZone(activity.zoneId)     // Convert zone to numeric
    };
  }

  /**
   * Convert zone ID to numeric hash
   */
  _hashZone(zoneId) {
    if (!zoneId) return 0;
    const str = zoneId.toString();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash % 100) / 100; // Normalize to 0-1
  }

  /**
   * Retrain all device models
   */
  async retrainAllModels() {
    try {
      const devices = await Device.find({ learningPhaseComplete: true });
      console.log(`🔄 Retraining models for ${devices.length} devices...`);

      for (const device of devices) {
        await this.trainDeviceModel(device._id);
      }

      console.log('✅ All models retrained');
    } catch (error) {
      console.error('Error retraining models:', error);
    }
  }
}

// Singleton instance
const anomalyDetectionService = new AnomalyDetectionService();

module.exports = anomalyDetectionService;
