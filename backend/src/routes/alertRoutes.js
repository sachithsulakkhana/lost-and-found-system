const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const { requireAuth, requireApproved } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireApproved);

router.get('/', async (req, res) => {
  try {
    const { deviceId, isResolved } = req.query;
    const query = {};
    
    if (deviceId) query.deviceId = deviceId;
    if (isResolved !== undefined) query.isResolved = isResolved === 'true';
    
    const alerts = await Alert.find(query)
      .populate('deviceId', 'deviceName deviceType')
      .populate('storedItemId', 'itemName category status')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/resolve', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    alert.isResolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = req.user._id;
    await alert.save();
    
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
