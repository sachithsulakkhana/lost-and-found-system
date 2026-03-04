const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const PushSubscription = require('../models/PushSubscription');

// Public: frontend needs the VAPID public key before the user logs in
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Save a new push subscription for the logged-in user
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    // Upsert: update if same endpoint already saved (re-subscribe on key rotation)
    await PushSubscription.findOneAndUpdate(
      { 'subscription.endpoint': subscription.endpoint },
      { userId: req.user._id, subscription },
      { upsert: true, new: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove subscription (called on logout or permission revoke)
router.delete('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await PushSubscription.deleteOne({ userId: req.user._id, 'subscription.endpoint': endpoint });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
