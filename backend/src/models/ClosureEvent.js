const mongoose = require('mongoose');

const closureEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  reason: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isWholeCampus: { type: Boolean, default: false },
  isRecurring: { type: Boolean, default: false },
  recurrenceRule: { type: String },
  notifyUsers: { type: Boolean, default: true },
  color: { type: String, default: '#f44336' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ClosureEvent', closureEventSchema);
