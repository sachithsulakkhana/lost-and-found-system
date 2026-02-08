const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');
const { requireAuth, requireApproved, requireRole } = require('../middleware/auth');

const requireAdmin = requireRole('admin');

router.use(requireAuth);
router.use(requireApproved);

/**
 * POST /api/zone-bookings
 * Create a new zone booking
 */
router.post('/', async (req, res) => {
  try {
    const { zoneId, slotsBooked, bookingDate, timeSlot, itemsToStore } = req.body;

    if (!zoneId || !slotsBooked || !bookingDate || !timeSlot) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const booking = await bookingService.createBooking(
      req.user._id,
      zoneId,
      slotsBooked,
      bookingDate,
      timeSlot,
      itemsToStore || []
    );

    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/zone-bookings/my
 * Get current user's bookings
 */
router.get('/my', async (req, res) => {
  try {
    const { status } = req.query;
    const bookings = await bookingService.getUserBookings(req.user._id, status);

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/zone-bookings/zone/:zoneId
 * Get bookings for a specific zone
 */
router.get('/zone/:zoneId', async (req, res) => {
  try {
    const { status } = req.query;
    const bookings = await bookingService.getZoneBookings(req.params.zoneId, status);

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/zone-bookings/pending
 * Get all pending bookings (admin only)
 */
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const bookings = await bookingService.getPendingBookings();

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/zone-bookings/:id/approve
 * Approve a booking (admin only)
 */
router.post('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const booking = await bookingService.approveBooking(req.params.id, req.user._id);

    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/zone-bookings/:id/reject
 * Reject a booking (admin only)
 */
router.post('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const booking = await bookingService.rejectBooking(req.params.id, reason, req.user._id);

    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/zone-bookings/:id/store-items
 * Store items for an approved booking
 */
router.post('/:id/store-items', async (req, res) => {
  try {
    const booking = await bookingService.storeItems(req.params.id);

    res.json({ success: true, booking });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/zone-bookings/:id/reminders/sms
 * Send SMS reminder for approved booking
 */
router.post('/:id/reminders/sms', async (req, res) => {
  try {
    const reminder = await bookingService.sendSMSReminder(req.params.id);

    res.json({ success: true, reminder });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/zone-bookings/:id/reminders/ivr
 * Send IVR call reminder for approved booking
 */
router.post('/:id/reminders/ivr', async (req, res) => {
  try {
    const reminder = await bookingService.sendIVRReminder(req.params.id);

    res.json({ success: true, reminder });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/zone-bookings/:id
 * Cancel a booking
 */
router.delete('/:id', async (req, res) => {
  try {
    const booking = await bookingService.cancelBooking(req.params.id, req.user._id);

    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/zone-bookings/stats
 * Get booking statistics (admin only)
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await bookingService.getBookingStats();

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
