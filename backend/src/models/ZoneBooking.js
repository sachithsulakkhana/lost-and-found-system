const mongoose = require('mongoose');

const zoneBookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    required: true
  },
  slotsBooked: {
    type: Number,
    required: true,
    min: 1
  },
  bookingDate: {
    type: Date,
    required: true
  },
  timeSlot: {
    hour: { type: Number, required: true, min: 0, max: 23 },
    minute: { type: Number, required: true, min: 0, max: 59 }
  },
  // Item storage details
  itemsToStore: [{
    itemName: { type: String, required: true },
    description: { type: String },
    category: {
      type: String,
      enum: ['Electronics', 'Personal', 'Documents', 'Keys', 'Bags', 'Other'],
      default: 'Other'
    }
  }],
  storedItemIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StoredItem'
  }],
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'STORED', 'RETRIEVED'],
    default: 'PENDING'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectionReason: {
    type: String
  },
  remindersSent: {
    ivr: { type: Boolean, default: false },
    sms: { type: Boolean, default: false }
  },
  smsReminderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SmsReminder'
  },
  ivrReminderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IvrCall'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

zoneBookingSchema.index({ userId: 1, zoneId: 1, bookingDate: 1 });
zoneBookingSchema.index({ status: 1 });
zoneBookingSchema.index({ zoneId: 1, bookingDate: 1 });

zoneBookingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ZoneBooking', zoneBookingSchema);
