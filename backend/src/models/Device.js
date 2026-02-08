const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  identifier: { type: String, default: '' },
  macAddress: { type: String, required: true, unique: true },
  deviceType: { type: String, default: 'mobile' },
  manufacturer: { type: String },
  model: { type: String },
  preferredZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
  preferredTimeWindow: {
    start: String,
    end: String
  },
  allowedDays: [{ type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }],
  status: {
    type: String,
    enum: ['LEARNING', 'ACTIVE', 'LOST', 'FOUND'],
    default: 'LEARNING'
  },
  learningStartDate: { type: Date, default: Date.now },
  learningPhaseComplete: { type: Boolean, default: false },
  modelLastTrained: { type: Date },
  lastSeen: { type: Date },
  lastLocation: {
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
    timestamp: Date
  },
  monitoringEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Device', deviceSchema);
