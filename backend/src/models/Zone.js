const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  center: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  boundary: {
    type: { type: String, enum: ['Polygon'], default: 'Polygon' },
    coordinates: { type: [[[Number]]], required: true }
  },
  radius: { type: Number, default: 50 },
  isActive: { type: Boolean, default: true },
  totalSlots: { type: Number, default: 10 },
  availableSlots: { type: Number, default: 10 },
  slotBookings: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    slotsBooked: { type: Number, default: 1 },
    bookingDate: { type: Date },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Zone', zoneSchema);
