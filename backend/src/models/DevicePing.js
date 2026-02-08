const mongoose = require('mongoose');

const devicePingSchema = new mongoose.Schema({
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  timestamp: { type: Date, default: Date.now },
  // How this ping was ingested (useful for debugging + archive)
  source: { type: String, enum: ['http', 'ws', 'simulator', 'import'], default: 'http' },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  // GPS accuracy in meters (if available)
  accuracy: { type: Number },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
  speed: { type: Number },
  hourOfDay: { type: Number },
  dayOfWeek: { type: String },
  isWithinPreference: { type: Boolean },
  wasClosedZone: { type: Boolean },
  anomalyScore: { type: Number, default: 0 },
  // Validation flags so you can archive *everything* but still filter clean data
  valid: { type: Boolean, default: true },
  rejectReason: { type: String }
});

devicePingSchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model('DevicePing', devicePingSchema);
