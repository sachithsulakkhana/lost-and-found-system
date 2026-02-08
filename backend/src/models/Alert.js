const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  storedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredItem' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: ['ANOMALY', 'OUT_OF_ZONE', 'UNUSUAL_TIME', 'HIGH_RISK', 'ITEM_LOST'],
    required: true
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM'
  },
  message: { type: String, required: true },
  location: {
    lat: Number,
    lng: Number
  },
  isResolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Alert', alertSchema);
