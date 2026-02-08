const express = require('express');
const router = express.Router();
const ClosureEvent = require('../models/ClosureEvent');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// Get all events (public + filtered by role)
router.get('/events', async (req, res) => {
  try {
    const { start, end, zoneId } = req.query;
    const query = {};
    
    if (start && end) {
      query.$or = [
        { start: { $gte: new Date(start), $lte: new Date(end) } },
        { end: { $gte: new Date(start), $lte: new Date(end) } }
      ];
    }
    
    if (zoneId) {
      query.$or = [{ zoneId }, { isWholeCampus: true }];
    }
    
    const events = await ClosureEvent.find(query)
      .populate('zoneId', 'name')
      .populate('createdBy', 'name')
      .sort({ start: 1 });
    
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create event (admin only)
router.post('/events', requireRole('admin'), async (req, res) => {
  try {
    const event = await ClosureEvent.create({
      ...req.body,
      createdBy: req.user._id
    });
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update event
router.put('/events/:id', requireRole('admin'), async (req, res) => {
  try {
    const event = await ClosureEvent.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete event
router.delete('/events/:id', requireRole('admin'), async (req, res) => {
  try {
    await ClosureEvent.findByIdAndDelete(req.params.id);
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
