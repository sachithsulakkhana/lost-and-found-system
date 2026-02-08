const express = require('express');
const router = express.Router();
const User = require('../models/User');
const otpService = require('../services/otpService');
const jwtService = require('../services/jwtService');

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Email or phone already registered' });
    }
    
    const user = await User.create({
      name,
      email,
      phone,
      passwordHash: password,
      status: 'PENDING_OTP'
    });
    
    await otpService.createOtpSession(user._id);
    
    res.status(201).json({
      userId: user._id,
      status: user.status,
      message: 'OTP sent (check console)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, phone, otp } = req.body;
    
    const user = await User.findOne({ $or: [{ email }, { phone }] });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const result = await otpService.verifyOTP(user._id, otp);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    user.status = 'PENDING_APPROVAL';
    await user.save();
    
    res.json({
      status: user.status,
      message: 'OTP verified. Awaiting admin approval.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ 
        error: 'Account not active',
        status: user.status
      });
    }
    
    const token = jwtService.generateToken(user._id);
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
