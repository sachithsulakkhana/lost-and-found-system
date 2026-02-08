const mongoose = require('mongoose');

const deviceActivitySchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['ONLINE', 'OFFLINE'],
    required: true
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone'
  },
  networkInfo: {
    ssid: String,
    macAddress: String,
    ipAddress: String,
    signalStrength: Number
  },
  location: {
    lat: Number,
    lng: Number,
    accuracy: Number
  },
  // Behavioral features for ML
  features: {
    hourOfDay: Number,           // 0-23
    dayOfWeek: Number,            // 0-6 (Sunday-Saturday)
    isWeekend: Boolean,
    sessionDuration: Number,      // minutes
    locationChangeFrequency: Number,
    avgSignalStrength: Number
  },
  // Anomaly detection results
  anomalyScore: {
    type: Number,
    default: 0
  },
  isAnomaly: {
    type: Boolean,
    default: false
  },
  // Learning phase tracking
  isTrainingData: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient querying
deviceActivitySchema.index({ deviceId: 1, timestamp: -1 });
deviceActivitySchema.index({ userId: 1, timestamp: -1 });
deviceActivitySchema.index({ isAnomaly: 1, timestamp: -1 });

// Method to extract features for ML
deviceActivitySchema.methods.extractFeatures = function() {
  const date = new Date(this.timestamp);
  return {
    hourOfDay: date.getHours(),
    dayOfWeek: date.getDay(),
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
    zoneId: this.zoneId ? this.zoneId.toString() : 'unknown',
    signalStrength: this.networkInfo?.signalStrength || 0,
    status: this.status === 'ONLINE' ? 1 : 0
  };
};

module.exports = mongoose.model('DeviceActivity', deviceActivitySchema);
