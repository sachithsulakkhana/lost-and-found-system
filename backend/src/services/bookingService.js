const ZoneBooking = require('../models/ZoneBooking');
const Zone = require('../models/Zone');
const StoredItem = require('../models/StoredItem');
const smsService = require('./smsService');
const asteriskService = require('./asteriskService');

/**
 * Zone Booking Service
 * Handles slot booking, approval workflow, and reminder scheduling
 */

class BookingService {
  /**
   * Create a new zone booking
   */
  async createBooking(userId, zoneId, slotsBooked, bookingDate, timeSlot, itemsToStore = []) {
    const zone = await Zone.findById(zoneId);

    if (!zone) {
      throw new Error('Zone not found');
    }

    if (!zone.isActive) {
      throw new Error('Zone is not active for bookings');
    }

    if (zone.availableSlots < slotsBooked) {
      throw new Error(`Only ${zone.availableSlots} slots available. You requested ${slotsBooked}.`);
    }

    const booking = new ZoneBooking({
      userId,
      zoneId,
      slotsBooked,
      bookingDate: new Date(bookingDate),
      timeSlot,
      itemsToStore: itemsToStore || [],
      status: 'PENDING'
    });

    await booking.save();

    zone.availableSlots -= slotsBooked;
    await zone.save();

    return booking;
  }

  /**
   * Store items after booking approval
   */
  async storeItems(bookingId) {
    const booking = await ZoneBooking.findById(bookingId).populate('userId');

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.status !== 'APPROVED') {
      throw new Error('Only approved bookings can store items');
    }

    if (booking.storedItemIds && booking.storedItemIds.length > 0) {
      throw new Error('Items already stored for this booking');
    }

    const storedItems = [];

    for (const item of booking.itemsToStore) {
      const storedItem = new StoredItem({
        ownerId: booking.userId._id,
        itemName: item.itemName,
        description: item.description,
        category: item.category || 'Other',
        zoneId: booking.zoneId,
        storageDate: booking.bookingDate,
        status: 'STORED'
      });

      await storedItem.save();
      storedItems.push(storedItem._id);
    }

    booking.storedItemIds = storedItems;
    booking.status = 'STORED';
    await booking.save();

    return booking;
  }

  /**
   * Get bookings by user
   */
  async getUserBookings(userId, status = null) {
    const query = { userId };
    if (status) {
      query.status = status;
    }

    return await ZoneBooking.find(query)
      .populate('zoneId', 'name center totalSlots availableSlots')
      .sort({ bookingDate: -1 });
  }

  /**
   * Get bookings by zone
   */
  async getZoneBookings(zoneId, status = null) {
    const query = { zoneId };
    if (status) {
      query.status = status;
    }

    return await ZoneBooking.find(query)
      .populate('userId', 'name email phone')
      .sort({ bookingDate: -1 });
  }

  /**
   * Get all pending bookings (for admin approval)
   */
  async getPendingBookings() {
    return await ZoneBooking.find({ status: 'PENDING' })
      .populate('userId', 'name email phone')
      .populate('zoneId', 'name center')
      .sort({ createdAt: 1 });
  }

  /**
   * Approve a booking and enable reminder scheduling
   */
  async approveBooking(bookingId, approvedBy) {
    const booking = await ZoneBooking.findById(bookingId)
      .populate('userId', 'name phone email timezone')
      .populate('zoneId', 'name');

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.status !== 'PENDING') {
      throw new Error('Only pending bookings can be approved');
    }

    booking.status = 'APPROVED';
    booking.approvedBy = approvedBy;
    booking.approvedAt = new Date();

    await booking.save();

    return booking;
  }

  /**
   * Reject a booking and restore slots
   */
  async rejectBooking(bookingId, rejectionReason, rejectedBy) {
    const booking = await ZoneBooking.findById(bookingId);

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.status !== 'PENDING') {
      throw new Error('Only pending bookings can be rejected');
    }

    booking.status = 'REJECTED';
    booking.rejectionReason = rejectionReason;
    booking.approvedBy = rejectedBy;
    booking.approvedAt = new Date();

    await booking.save();

    const zone = await Zone.findById(booking.zoneId);
    if (zone) {
      zone.availableSlots += booking.slotsBooked;
      await zone.save();
    }

    return booking;
  }

  /**
   * Send SMS reminder for an approved booking
   */
  async sendSMSReminder(bookingId) {
    const booking = await ZoneBooking.findById(bookingId)
      .populate('userId', 'name phone timezone')
      .populate('zoneId', 'name');

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.status !== 'APPROVED') {
      throw new Error('Only approved bookings can have reminders');
    }

    if (booking.remindersSent.sms) {
      throw new Error('SMS reminder already sent');
    }

    const message = `Reminder: Your booking for ${booking.zoneId.name} on ${booking.bookingDate.toLocaleDateString()} at ${booking.timeSlot.hour}:${booking.timeSlot.minute.toString().padStart(2, '0')} is confirmed. Slots: ${booking.slotsBooked}`;

    const smsReminder = await smsService.sendReminder(
      booking.userId._id,
      booking.userId.phone,
      message,
      booking.bookingDate
    );

    booking.smsReminderId = smsReminder._id;
    booking.remindersSent.sms = true;
    await booking.save();

    return smsReminder;
  }

  /**
   * Send IVR call reminder for an approved booking
   */
  async sendIVRReminder(bookingId) {
    const booking = await ZoneBooking.findById(bookingId)
      .populate('userId', 'name phone timezone')
      .populate('zoneId', 'name');

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.status !== 'APPROVED') {
      throw new Error('Only approved bookings can have reminders');
    }

    if (booking.remindersSent.ivr) {
      throw new Error('IVR reminder already sent');
    }

    const message = `Hello ${booking.userId.name}. This is a reminder for your booking at ${booking.zoneId.name} on ${booking.bookingDate.toLocaleDateString()} at ${booking.timeSlot.hour}:${booking.timeSlot.minute.toString().padStart(2, '0')}. You have booked ${booking.slotsBooked} slots.`;

    const ivrCall = await asteriskService.scheduleIVRCall(
      booking.userId._id,
      booking.userId.phone,
      message,
      booking.bookingDate
    );

    booking.ivrReminderId = ivrCall._id;
    booking.remindersSent.ivr = true;
    await booking.save();

    return ivrCall;
  }

  /**
   * Cancel a booking and restore slots
   */
  async cancelBooking(bookingId, userId) {
    const booking = await ZoneBooking.findById(bookingId);

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.userId.toString() !== userId.toString()) {
      throw new Error('You can only cancel your own bookings');
    }

    if (booking.status === 'CANCELLED') {
      throw new Error('Booking is already cancelled');
    }

    booking.status = 'CANCELLED';
    await booking.save();

    const zone = await Zone.findById(booking.zoneId);
    if (zone) {
      zone.availableSlots += booking.slotsBooked;
      await zone.save();
    }

    return booking;
  }

  /**
   * Get booking statistics
   */
  async getBookingStats() {
    const totalBookings = await ZoneBooking.countDocuments();
    const pendingBookings = await ZoneBooking.countDocuments({ status: 'PENDING' });
    const approvedBookings = await ZoneBooking.countDocuments({ status: 'APPROVED' });
    const rejectedBookings = await ZoneBooking.countDocuments({ status: 'REJECTED' });

    return {
      total: totalBookings,
      pending: pendingBookings,
      approved: approvedBookings,
      rejected: rejectedBookings
    };
  }
}

const bookingService = new BookingService();

module.exports = bookingService;
