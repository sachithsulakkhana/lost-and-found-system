const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredItem', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING'
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
    // Reminder linkage
    smsReminderId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsReminder' },
    ivrReminderId: { type: mongoose.Schema.Types.ObjectId, ref: 'IvrCall' },
    reminderSet: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
