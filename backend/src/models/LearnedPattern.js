const mongoose = require('mongoose');

/**
 * LearnedPattern — a location+time combination confirmed by the owner as "normal".
 * The ML service checks these before scoring; matches return score = 0.
 */
const learnedPatternSchema = new mongoose.Schema({
  deviceId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true, index: true },
  ownerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  lat:        { type: Number, required: true },
  lng:        { type: Number, required: true },
  hourOfDay:  { type: Number, required: true },   // 0-23
  dayOfWeek:  { type: String },                   // 'Mon'…'Sun'
  note:       { type: String, default: '' },       // e.g. "library visit"
  alertId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Alert' }, // originating alert
  confirmedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LearnedPattern', learnedPatternSchema);
