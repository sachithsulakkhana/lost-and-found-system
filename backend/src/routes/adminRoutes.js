const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Zone = require('../models/Zone');
const ClosureEvent = require('../models/ClosureEvent');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/users', async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    
    const users = await User.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 });
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/approve', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = 'ACTIVE';
    await user.save();
    
    res.json({ message: 'User approved', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users/:id/reject', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.status = 'REJECTED';
    await user.save();
    
    res.json({ message: 'User rejected', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/zones', async (req, res) => {
  try {
    const zones = await Zone.find().sort({ createdAt: -1 });
    res.json(zones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/zones', async (req, res) => {
  try {
    const zone = await Zone.create(req.body);
    res.status(201).json(zone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/zones/:id', async (req, res) => {
  try {
    const zone = await Zone.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(zone);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/zones/:id', async (req, res) => {
  try {
    await Zone.findByIdAndDelete(req.params.id);
    res.json({ message: 'Zone deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/closures', async (req, res) => {
  try {
    const closures = await ClosureEvent.find()
      .populate('zoneId', 'name')
      .populate('createdBy', 'name email')
      .sort({ start: -1 });
    res.json(closures);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/closures', async (req, res) => {
  try {
    const closure = await ClosureEvent.create({
      ...req.body,
      createdBy: req.user._id
    });
    res.status(201).json(closure);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
