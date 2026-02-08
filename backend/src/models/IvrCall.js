const mongoose = require('mongoose');

const ivrCallSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  storedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredItem' },
  phone: { type: String, required: true },
  callDuration: { type: Number },
  callStatus: { 
    type: String, 
    enum: ['INITIATED', 'ANSWERED', 'COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER'],
    default: 'INITIATED'
  },
  userResponse: { type: String },
  scheduledFor: { type: Date },
  scheduledStatus: {
    type: String,
    enum: ['SCHEDULED', 'TRIGGERED'],
    default: 'TRIGGERED'
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('IvrCall', ivrCallSchema);
