const OtpSession = require('../models/OtpSession');
const env = require('../config/env');

exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

exports.createOtpSession = async (userId) => {
  const code = exports.generateOTP();
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);
  
  await OtpSession.deleteMany({ userId, verified: false });
  
  const session = await OtpSession.create({
    userId,
    code,
    expiresAt
  });
  
  console.log(`📱 OTP for user ${userId}: ${code}`);
  
  return session;
};

exports.verifyOTP = async (userId, code) => {
  const session = await OtpSession.findOne({
    userId,
    verified: false,
    expiresAt: { $gt: new Date() }
  });
  
  if (!session) {
    return { success: false, error: 'OTP expired or not found' };
  }
  
  if (session.attempts >= 3) {
    return { success: false, error: 'Too many attempts' };
  }
  
  if (session.code !== code) {
    session.attempts += 1;
    await session.save();
    return { success: false, error: 'Invalid OTP' };
  }
  
  session.verified = true;
  await session.save();
  
  return { success: true };
};
