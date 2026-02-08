const mongoose = require('mongoose');

const smsReminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  storedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredItem' },
  message: { type: String, required: true },
  phone: { type: String, required: true },
  scheduledFor: { type: Date, required: true },
  sentAt: { type: Date },
  status: { 
    type: String, 
    enum: ['PENDING', 'SENT', 'FAILED'], 
    default: 'PENDING' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SmsReminder', smsReminderSchema);
