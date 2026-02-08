const mongoose = require('mongoose');

const storedItemSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  itemName: { type: String, required: true },
  description: { type: String },
  category: { 
    type: String, 
    enum: ['Electronics', 'Personal', 'Documents', 'Keys', 'Bags', 'Other'],
    default: 'Other'
  },
  imageUrl: { type: String },
  zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true },
  storageDate: { type: Date, default: Date.now },
  retrievalDate: { type: Date },
  status: { 
    type: String, 
    enum: ['STORED', 'RETRIEVED', 'LOST', 'FOUND'], 
    default: 'STORED' 
  },
  reminderScheduled: { type: Boolean, default: false },
  lastReminderSent: { type: Date },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StoredItem', storedItemSchema);
