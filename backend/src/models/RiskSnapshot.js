const mongoose = require('mongoose');

const riskSnapshotSchema = new mongoose.Schema({
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
  timestamp: { type: Date, default: Date.now },
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
  crowdDensity: { type: Number, default: 0 },
  recentIncidents: { type: Number, default: 0 },
  anomalyScore: { type: Number, default: 0 }
});

riskSnapshotSchema.index({ timestamp: -1 });

module.exports = mongoose.model('RiskSnapshot', riskSnapshotSchema);
