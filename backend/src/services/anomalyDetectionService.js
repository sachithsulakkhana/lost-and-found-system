const DeviceActivity = require('../models/DeviceActivity');
const Device = require('../models/Device');
const Alert = require('../models/Alert');
const wsService = require('./wsService');
const pushService = require('./pushService');
const { sendSMS, formatPhoneNumber } = require('./smsService');
const User = require('../models/User');

// Retrain after every N new (post-learning) activities
const RETRAIN_EVERY = 50;
// Sliding window size for continuous learning retrains
const SLIDING_WINDOW = 500;

// ---------------------------------------------------------------------------
// IsolationTree
// ---------------------------------------------------------------------------

class IsolationTree {
  constructor(data, height = 0, maxHeight = 10) {
    this.height = height;
    this.size = data.length;

    if (height >= maxHeight || data.length <= 1) {
      this.externalNode = true;
      return;
    }

    const features = Object.keys(data[0]);
    const splitFeature = features[Math.floor(Math.random() * features.length)];
    const values = data.map(d => d[splitFeature]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const splitValue = min + Math.random() * (max - min);

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
    if (this.externalNode) return this.height + this._c(this.size);
    if (point[this.splitFeature] < this.splitValue) return this.left.pathLength(point);
    return this.right.pathLength(point);
  }

  _c(n) {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  // Compact serialization (short keys to reduce DB size)
  serialize() {
    if (this.externalNode) return { e: 1, h: this.height, s: this.size };
    return {
      e: 0,
      h: this.height,
      s: this.size,
      f: this.splitFeature,
      v: this.splitValue,
      l: this.left.serialize(),
      r: this.right.serialize()
    };
  }

  static deserialize(d) {
    const tree = Object.create(IsolationTree.prototype);
    tree.height = d.h;
    tree.size = d.s;
    if (d.e) {
      tree.externalNode = true;
    } else {
      tree.externalNode = false;
      tree.splitFeature = d.f;
      tree.splitValue = d.v;
      tree.left = IsolationTree.deserialize(d.l);
      tree.right = IsolationTree.deserialize(d.r);
    }
    return tree;
  }
}

// ---------------------------------------------------------------------------
// IsolationForest
// ---------------------------------------------------------------------------

class IsolationForest {
  constructor(numTrees = 100, sampleSize = 256) {
    this.numTrees = numTrees;
    this.sampleSize = sampleSize;
    this.trees = [];
    this.trained = false;
  }

  train(data) {
    if (!data || data.length === 0) throw new Error('Training data cannot be empty');

    this.trees = [];
    const sampleSize = Math.min(this.sampleSize, data.length);

    for (let i = 0; i < this.numTrees; i++) {
      const sample = this._randomSample(data, sampleSize);
      const maxHeight = Math.ceil(Math.log2(sampleSize));
      this.trees.push(new IsolationTree(sample, 0, maxHeight));
    }

    this.trained = true;
    this.avgPathLength = this._c(sampleSize);
  }

  predict(point) {
    if (!this.trained) throw new Error('Model not trained');
    const avg = this.trees.reduce((s, t) => s + t.pathLength(point), 0) / this.numTrees;
    return Math.pow(2, -avg / this.avgPathLength);
  }

  _randomSample(data, size) {
    return [...data].sort(() => Math.random() - 0.5).slice(0, size);
  }

  _c(n) {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  // Full serialization — includes tree structure so model survives server restarts
  toJSON() {
    return {
      numTrees: this.numTrees,
      sampleSize: this.sampleSize,
      avgPathLength: this.avgPathLength,
      trained: this.trained,
      trees: this.trees.map(t => t.serialize())
    };
  }

  static fromJSON(data) {
    const forest = new IsolationForest(data.numTrees, data.sampleSize);
    forest.avgPathLength = data.avgPathLength;
    forest.trained = data.trained;
    forest.trees = data.trees.map(t => IsolationTree.deserialize(t));
    return forest;
  }
}

// ---------------------------------------------------------------------------
// AnomalyDetectionService
// ---------------------------------------------------------------------------

class AnomalyDetectionService {
  constructor() {
    this.models = new Map();         // deviceId → IsolationForest (in-memory cache)
    this.learningPeriodDays = 14;
    this.anomalyThreshold = 0.6;
  }

  // ── Learning phase ──────────────────────────────────────────────────────

  async isInLearningPhase(deviceId) {
    const device = await Device.findById(deviceId);
    if (!device) return true;

    const first = await DeviceActivity.findOne({ deviceId }).sort({ timestamp: 1 });
    if (!first) return true;

    const days = (Date.now() - first.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    return days < this.learningPeriodDays;
  }

  // ── Model persistence ───────────────────────────────────────────────────

  /**
   * Get model: memory cache → DB snapshot → retrain from scratch
   */
  async _getOrLoadModel(deviceId) {
    const key = deviceId.toString();

    // 1. In-memory cache (fastest)
    if (this.models.has(key)) return this.models.get(key);

    // 2. Deserialize from DB (survives server restarts without full retrain)
    const device = await Device.findById(deviceId);
    if (device?.modelData?.trees?.length) {
      try {
        const model = IsolationForest.fromJSON(device.modelData);
        this.models.set(key, model);
        console.log(`📂 Model restored from DB for device ${key}`);
        return model;
      } catch (e) {
        console.warn(`Could not deserialize model for ${key}:`, e.message);
      }
    }

    // 3. Cold retrain
    const ok = await this.trainDeviceModel(deviceId);
    return ok ? this.models.get(key) : null;
  }

  // ── Training ─────────────────────────────────────────────────────────────

  /**
   * Train (or retrain) the model for a device.
   *
   * Initial training  → uses only isTrainingData:true records (first 14 days).
   * Sliding retrain   → uses the most recent `windowSize` activities regardless
   *                     of flag, so newly-learned locations become "normal".
   */
  async trainDeviceModel(deviceId, windowSize = null) {
    try {
      let activities;
      if (windowSize) {
        // Continuous learning: slide over the most recent N activities
        activities = await DeviceActivity.find({ deviceId })
          .sort({ timestamp: -1 })
          .limit(windowSize);
      } else {
        // Initial training: only the supervised learning-phase data
        activities = await DeviceActivity.find({ deviceId, isTrainingData: true })
          .limit(1000);
      }

      if (activities.length < 50) {
        console.log(`Not enough data for device ${deviceId}: ${activities.length} records`);
        return false;
      }

      const features = activities.map(a => this._extractFeatures(a));
      const model = new IsolationForest(100, Math.min(256, activities.length));
      model.train(features);

      this.models.set(deviceId.toString(), model);

      // Persist full tree structure to DB so the next server start skips cold retrain
      await Device.findByIdAndUpdate(deviceId, {
        $set: {
          learningPhaseComplete: true,
          modelLastTrained: new Date(),
          modelData: model.toJSON()   // serialized tree structure
        }
      });

      console.log(`✅ Model trained for device ${deviceId} (${activities.length} samples, window=${windowSize ?? 'initial'})`);
      return true;
    } catch (err) {
      console.error(`Error training model for device ${deviceId}:`, err);
      return false;
    }
  }

  /**
   * Trigger a sliding-window retrain after every RETRAIN_EVERY new activities.
   * Called fire-and-forget from detectAnomaly so it never blocks a response.
   */
  async _maybeRetrain(deviceId) {
    const newCount = await DeviceActivity.countDocuments({ deviceId, isTrainingData: false });
    if (newCount > 0 && newCount % RETRAIN_EVERY === 0) {
      console.log(`🔄 Sliding retrain triggered for device ${deviceId} (${newCount} post-learning activities)`);
      await this.trainDeviceModel(deviceId, SLIDING_WINDOW);
    }
  }

  // ── Detection ─────────────────────────────────────────────────────────────

  async detectAnomaly(activityData) {
    try {
      const { deviceId, userId } = activityData;

      if (await this.isInLearningPhase(deviceId)) {
        return { isAnomaly: false, score: 0, reason: 'LEARNING_PHASE' };
      }

      const model = await this._getOrLoadModel(deviceId);
      if (!model) {
        return { isAnomaly: false, score: 0, reason: 'MODEL_NOT_READY' };
      }

      const features = this._extractFeatures(activityData);
      const score = model.predict(features);
      const isAnomaly = score > this.anomalyThreshold;

      if (isAnomaly) {
        console.log(`🚨 ANOMALY for device ${deviceId}: score ${score.toFixed(3)}`);
        await this._createAnomalyAlert(deviceId, userId, score, activityData);
      }

      // Continuous learning — runs in background, never blocks the response
      this._maybeRetrain(deviceId).catch(err =>
        console.error('Background retrain error:', err)
      );

      return { isAnomaly, score, reason: isAnomaly ? 'BEHAVIORAL_ANOMALY' : 'NORMAL' };
    } catch (err) {
      console.error('detectAnomaly error:', err);
      return { isAnomaly: false, score: 0, reason: 'ERROR' };
    }
  }

  // ── Alert + real-time push ───────────────────────────────────────────────

  async _createAnomalyAlert(deviceId, userId, score, activityData) {
    try {
      const device = await Device.findById(deviceId);

      const alert = await Alert.create({
        deviceId,
        userId,
        type: 'ANOMALY',
        severity: score > 0.8 ? 'CRITICAL' : 'HIGH',
        message: `Unusual activity detected for device "${device?.name ?? 'Unknown'}" (score: ${(score * 100).toFixed(1)}%)`,
        location: activityData.location
      });

      // WebSocket: send anomaly_alert (amber panel) ONLY to the owner's designated sessions
      wsService.broadcastToDesignated(device.ownerId, 'anomaly_alert', {
        alert,
        deviceId: deviceId.toString(),
        deviceName: device?.name ?? 'Unknown',
        anomalyScore: score,
        location: activityData.location,
        timestamp: new Date().toISOString(),
      });
      // Web Push: reaches the owner even when the browser is closed
      pushService.sendAlarmToOwner(device.ownerId, device?.name ?? 'Unknown', 'BEHAVIORAL_ANOMALY')
        .catch(err => console.error('Push notification error:', err));
      // SMS: notify owner's registered phone number
      User.findById(device.ownerId).then(owner => {
        if (owner?.phone) {
          const phone = formatPhoneNumber(owner.phone);
          const msg = `⚠️ ANOMALY ALERT: Unusual activity detected on your device "${device?.name ?? 'Unknown'}" (score: ${(score * 100).toFixed(1)}%). Check your Lost & Found app.`;
          sendSMS(phone, msg).catch(err => console.error('SMS error:', err));
        }
      }).catch(() => {});

      console.log(`📢 Anomaly alert sent: ${alert._id}`);
      return alert;
    } catch (err) {
      console.error('Error creating anomaly alert:', err);
    }
  }

  // ── Feature extraction ───────────────────────────────────────────────────

  _extractFeatures(activity) {
    const d = new Date(activity.timestamp || Date.now());
    const hour = d.getHours();
    const dow = d.getDay();
    return {
      hourOfDay:      hour / 23,
      dayOfWeek:      dow / 6,
      isWeekend:      (dow === 0 || dow === 6) ? 1 : 0,
      status:         activity.status === 'ONLINE' ? 1 : 0,
      signalStrength: (activity.networkInfo?.signalStrength || 0) / 100,
      zoneHash:       this._hashZone(activity.zoneId)
    };
  }

  _hashZone(zoneId) {
    if (!zoneId) return 0;
    const s = zoneId.toString();
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h = h & h;
    }
    return Math.abs(h % 100) / 100;
  }

  // ── Admin: retrain all ───────────────────────────────────────────────────

  async retrainAllModels() {
    const devices = await Device.find({ learningPhaseComplete: true });
    console.log(`🔄 Retraining ${devices.length} device models...`);
    for (const device of devices) {
      await this.trainDeviceModel(device._id, SLIDING_WINDOW);
    }
    console.log('✅ All models retrained');
  }
}

module.exports = new AnomalyDetectionService();
