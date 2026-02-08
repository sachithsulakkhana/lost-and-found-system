const express = require('express');
const router = express.Router();
const SmsReminder = require('../models/SmsReminder');
const IvrCall = require('../models/IvrCall');
const { requireAuth } = require('../middleware/auth');
const { createDateInTimezone } = require('../services/timezoneService');
const { sendSMS, formatPhoneNumber } = require('../services/smsService');
const { initiateIVRCall, generateIVRScript } = require('../services/asteriskService');

router.use(requireAuth);

// Compatibility endpoint used by the frontend UI
// Body: { itemId, type: 'SMS'|'IVR', scheduledDate: 'YYYY-MM-DD', scheduledTime: 'HH:mm' }
router.post('/schedule', async (req, res) => {
  try {
    const { itemId, type, scheduledDate, scheduledTime, message } = req.body;
    if (!itemId || !type || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Use timezone service to create proper date in user's timezone
    const userTimezone = req.user.timezone || 'Asia/Colombo';
    const scheduledFor = createDateInTimezone(scheduledDate, scheduledTime, userTimezone);

    if (Number.isNaN(scheduledFor.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled time' });
    }

    if (type === 'SMS') {
      // Check for existing SMS reminder for this item
      const existing = await SmsReminder.findOne({
        userId: req.user._id,
        storedItemId: itemId
      });

      if (existing) {
        return res.status(400).json({
          error: 'You already have an SMS reminder set for this item. Only 1 reminder per item is allowed.'
        });
      }

      const reminder = await SmsReminder.create({
        userId: req.user._id,
        storedItemId: itemId,
        message: message || `Reminder for your stored item (${itemId})`,
        phone: req.user.phone,
        scheduledFor
      });
      console.log(`📱 SMS Reminder scheduled for ${req.user.phone}: ${reminder.message}`);
      return res.status(201).json(reminder);
    }

    if (type === 'IVR') {
      // Check for existing IVR call for this item
      const existing = await IvrCall.findOne({
        userId: req.user._id,
        storedItemId: itemId
      });

      if (existing) {
        return res.status(400).json({
          error: 'You already have an IVR call reminder set for this item. Only 1 reminder per item is allowed.'
        });
      }

      const call = await IvrCall.create({
        userId: req.user._id,
        storedItemId: itemId,
        phone: req.user.phone,
        scheduledFor,
        scheduledStatus: 'SCHEDULED'
      });
      console.log(`📞 IVR Call scheduled to ${req.user.phone} for item ${itemId} at ${scheduledFor.toISOString()}`);

      // Simulate call trigger around scheduled time
      const delay = Math.max(0, scheduledFor.getTime() - Date.now());
      setTimeout(async () => {
        try {
          call.scheduledStatus = 'TRIGGERED';
          call.callStatus = 'COMPLETED';
          call.callDuration = 45;
          await call.save();
        } catch (e) {
          console.error('Failed to complete scheduled IVR call', e);
        }
      }, delay);

      return res.status(201).json(call);
    }

    return res.status(400).json({ error: 'Invalid reminder type' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule SMS reminder
router.post('/sms', async (req, res) => {
  try {
    const { storedItemId, message, scheduledFor } = req.body;
    
    const reminder = await SmsReminder.create({
      userId: req.user._id,
      storedItemId,
      message,
      phone: req.user.phone,
      scheduledFor: new Date(scheduledFor)
    });
    
    console.log(`📱 SMS Reminder scheduled for ${req.user.phone}: ${message}`);
    
    res.status(201).json(reminder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if reminder exists for an item
router.get('/check/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    const smsReminder = await SmsReminder.findOne({
      userId: req.user._id,
      storedItemId: itemId
    });

    const ivrCall = await IvrCall.findOne({
      userId: req.user._id,
      storedItemId: itemId
    });

    res.json({
      hasSmsReminder: !!smsReminder,
      hasIvrReminder: !!ivrCall
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's reminders
router.get('/sms', async (req, res) => {
  try {
    // If admin, return all reminders; otherwise only user's reminders
    const query = req.user.role === 'admin' ? {} : { userId: req.user._id };
    const reminders = await SmsReminder.find(query)
      .populate('storedItemId', 'itemName')
      .populate('userId', 'name email')
      .sort({ scheduledFor: -1 });
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initiate IVR call
router.post('/ivr/call', async (req, res) => {
  try {
    const { storedItemId } = req.body;
    
    const call = await IvrCall.create({
      userId: req.user._id,
      storedItemId,
      phone: req.user.phone
    });
    
    console.log(`📞 IVR Call initiated to ${req.user.phone} for item ${storedItemId}`);
    
    // Simulate call completion
    setTimeout(async () => {
      call.callStatus = 'COMPLETED';
      call.callDuration = 45;
      await call.save();
    }, 5000);
    
    res.status(201).json(call);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get call history
router.get('/ivr/calls', async (req, res) => {
  try {
    // If admin, return all calls; otherwise only user's calls
    const query = req.user.role === 'admin' ? {} : { userId: req.user._id };
    const calls = await IvrCall.find(query)
      .populate('storedItemId', 'itemName')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json(calls);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
