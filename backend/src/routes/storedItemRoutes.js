const express = require('express');
const router = express.Router();
const StoredItem = require('../models/StoredItem');
const Zone = require('../models/Zone');
const ClosureEvent = require('../models/ClosureEvent');
const { requireAuth, requireApproved } = require('../middleware/auth');
const { reportLostItemToML, reportFoundItemToML } = require('../services/onlineLearningService');

router.use(requireAuth);
router.use(requireApproved);

// Get all stored items for current user
router.get('/', async (req, res) => {
  try {
    const items = await StoredItem.find({ ownerId: req.user._id })
      .populate('zoneId', 'name center')
      .populate('deviceId', 'name identifier')
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Store new item
router.post('/', async (req, res) => {
  try {
    const { itemName, description, category, zoneId, deviceId, notes } = req.body;
    
    // Check if zone is closed
    const closure = await ClosureEvent.findOne({
      $or: [{ zoneId }, { isWholeCampus: true }],
      start: { $lte: new Date() },
      end: { $gte: new Date() }
    });
    
    if (closure) {
      return res.status(400).json({ 
        error: 'Zone is currently closed',
        reason: closure.reason
      });
    }
    
    const item = await StoredItem.create({
      ownerId: req.user._id,
      itemName,
      description,
      category,
      zoneId,
      deviceId,
      notes
    });
    
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retrieve item
router.put('/:id/retrieve', async (req, res) => {
  try {
    const item = await StoredItem.findOne({
      _id: req.params.id,
      ownerId: req.user._id
    }).populate('zoneId');

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const wasLost = item.status === 'LOST';

    item.status = 'RETRIEVED';
    item.retrievalDate = new Date();
    await item.save();

    // If item was lost and now found, report to ML service
    if (wasLost) {
      reportFoundItemToML({
        location: item.zoneId?.name || 'Unknown',
        itemType: item.category || 'Other',
        crowdLevel: req.body.crowdLevel || 'Medium',
        weather: req.body.weather || 'Sunny',
        timestamp: new Date().toISOString()
      });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Report item as lost
router.put('/:id/report-lost', async (req, res) => {
  try {
    const item = await StoredItem.findOne({
      _id: req.params.id,
      ownerId: req.user._id
    }).populate('zoneId');

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    item.status = 'LOST';
    await item.save();

    // Create alert for lost item
    const Alert = require('../models/Alert');
    await Alert.create({
      storedItemId: item._id,
      userId: req.user._id,
      deviceId: item.deviceId || null,
      type: 'ITEM_LOST',
      severity: 'HIGH',
      message: `Item "${item.itemName}" reported as lost by ${req.user.name}`
    });

    // Report to ML service for real-time model updating
    reportLostItemToML({
      location: item.zoneId?.name || 'Unknown',
      itemType: item.category || 'Other',
      crowdLevel: req.body.crowdLevel || 'Medium',
      weather: req.body.weather || 'Sunny',
      timestamp: new Date().toISOString()
    });

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete item
router.delete('/:id', async (req, res) => {
  try {
    const item = await StoredItem.findOne({
      _id: req.params.id,
      ownerId: req.user._id
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Cascade delete related records
    const SmsReminder = require('../models/SmsReminder');
    const IvrCall = require('../models/IvrCall');
    const Alert = require('../models/Alert');

    // Delete all reminders for this item
    await SmsReminder.deleteMany({ storedItemId: req.params.id });

    // Delete all IVR calls for this item
    await IvrCall.deleteMany({ storedItemId: req.params.id });

    // Delete all alerts for this item
    await Alert.deleteMany({ storedItemId: req.params.id });

    // Finally delete the item itself
    await StoredItem.findByIdAndDelete(req.params.id);

    res.json({ message: 'Item and all related records deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
