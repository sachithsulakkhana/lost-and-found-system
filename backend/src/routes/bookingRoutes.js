const express = require('express');
const router = express.Router();

const Booking = require('../models/Booking');
const StoredItem = require('../models/StoredItem');
const ClosureEvent = require('../models/ClosureEvent');
const SmsReminder = require('../models/SmsReminder');
const IvrCall = require('../models/IvrCall');
const { requireAuth, requireApproved, requireRole } = require('../middleware/auth');
const { createDateInTimezone } = require('../services/timezoneService');

router.use(requireAuth);
router.use(requireApproved);

// Student: create booking request for an item
router.post('/', async (req, res) => {
  try {
    const { itemId, start, end, notes } = req.body;
    if (!itemId || !start || !end) {
      return res.status(400).json({ error: 'itemId, start and end are required' });
    }

    const startDt = new Date(start);
    const endDt = new Date(end);
    if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime()) || endDt <= startDt) {
      return res.status(400).json({ error: 'Invalid booking time range' });
    }

    const item = await StoredItem.findOne({ _id: itemId, ownerId: req.user._id }).populate('zoneId', 'name');
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (item.status !== 'STORED') {
      return res.status(400).json({ error: `Item is not available for booking (status: ${item.status})` });
    }

    // Block if zone/campus is closed during the requested time
    const closure = await ClosureEvent.findOne({
      $or: [{ zoneId: item.zoneId }, { isWholeCampus: true }],
      start: { $lt: endDt },
      end: { $gt: startDt }
    });
    if (closure) {
      return res.status(400).json({ error: 'Booking not allowed during a closure', reason: closure.reason });
    }

    // Block if overlapping approved booking exists
    const conflict = await Booking.findOne({
      itemId,
      status: 'APPROVED',
      start: { $lt: endDt },
      end: { $gt: startDt }
    });
    if (conflict) {
      return res.status(400).json({ error: 'Item is already booked for this time' });
    }

    const booking = await Booking.create({
      itemId,
      userId: req.user._id,
      start: startDt,
      end: endDt,
      notes
    });

    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Student: list my bookings
router.get('/my', async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate('itemId', 'itemName status')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Student: cancel my booking (pending or approved)
router.put('/:id/cancel', async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.status === 'REJECTED' || booking.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Booking is not cancellable' });
    }

    booking.status = 'CANCELLED';
    await booking.save();
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: list all bookings
router.get('/admin', requireRole('admin'), async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate('itemId', 'itemName status')
      .populate('userId', 'name email')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: approve booking
router.put('/admin/:id/approve', requireRole('admin'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('itemId');
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Ensure no conflict with other approved bookings
    const conflict = await Booking.findOne({
      _id: { $ne: booking._id },
      itemId: booking.itemId,
      status: 'APPROVED',
      start: { $lt: booking.end },
      end: { $gt: booking.start }
    });
    if (conflict) {
      return res.status(400).json({ error: 'Cannot approve due to conflict with another approved booking' });
    }

    booking.status = 'APPROVED';
    booking.approvedBy = req.user._id;
    await booking.save();
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: reject booking
router.put('/admin/:id/reject', requireRole('admin'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    booking.status = 'REJECTED';
    booking.approvedBy = req.user._id;
    await booking.save();
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Student: Set reminder for an approved booking
router.post('/:id/reminder', async (req, res) => {
  try {
    const { type, scheduledDate, scheduledTime, message } = req.body;

    if (!type || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ error: 'Missing required fields: type, scheduledDate, scheduledTime' });
    }

    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Can only set reminders for approved bookings' });
    }

    // Use timezone service to create proper date
    const userTimezone = req.user.timezone || 'Asia/Colombo';
    const scheduledFor = createDateInTimezone(scheduledDate, scheduledTime, userTimezone);

    if (Number.isNaN(scheduledFor.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled time' });
    }

    if (type === 'SMS') {
      // Check if SMS reminder already exists for this booking
      if (booking.smsReminderId) {
        return res.status(400).json({ error: 'SMS reminder already set for this booking' });
      }

      const reminder = await SmsReminder.create({
        userId: req.user._id,
        storedItemId: booking.itemId,
        message: message || `Reminder: Your booking for item retrieval is coming up on ${scheduledDate}`,
        phone: req.user.phone,
        scheduledFor
      });

      booking.smsReminderId = reminder._id;
      booking.reminderSet = true;
      await booking.save();

      return res.status(201).json({ booking, reminder });
    }

    if (type === 'IVR') {
      // Check if IVR reminder already exists for this booking
      if (booking.ivrReminderId) {
        return res.status(400).json({ error: 'IVR reminder already set for this booking' });
      }

      const call = await IvrCall.create({
        userId: req.user._id,
        storedItemId: booking.itemId,
        phone: req.user.phone,
        scheduledFor,
        scheduledStatus: 'SCHEDULED'
      });

      booking.ivrReminderId = call._id;
      booking.reminderSet = true;
      await booking.save();

      return res.status(201).json({ booking, reminder: call });
    }

    return res.status(400).json({ error: 'Invalid reminder type. Must be SMS or IVR' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
