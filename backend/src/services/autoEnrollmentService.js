/**
 * Device Auto-Enrollment Service
 * Automatically creates and enrolls devices on first ping or login
 * No manual registration required
 */

const Device = require('../models/Device');

/**
 * Get or create device on first ping
 * If device with fingerprint doesn't exist, create it automatically
 */
async function getOrCreateDevice(userId, deviceFingerprint, deviceInfo = {}) {
  try {
    // Try to find existing device by fingerprint
    let device = await Device.findOne({
      ownerId: userId,
      deviceFingerprint: deviceFingerprint
    });

    // If device exists, return it
    if (device) {
      return device;
    }

    // Device doesn't exist - auto-create it
    console.log(`🆕 Auto-enrolling new device: ${deviceFingerprint}`);

    device = await Device.create({
      ownerId: userId,
      deviceFingerprint: deviceFingerprint,
      name: deviceInfo.name || `${deviceInfo.deviceType || 'Device'} (Auto)`,
      identifier: deviceInfo.identifier || deviceInfo.deviceType || 'Unknown',
      manufacturer: deviceInfo.manufacturer || 'Unknown',
      model: deviceInfo.model || 'Unknown',
      deviceType: deviceInfo.deviceType || 'mobile',
      userAgent: deviceInfo.userAgent || '',
      macAddress: generateRandomMac(),
      status: 'LEARNING',
      learningStartDate: new Date()
    });

    console.log(`✅ Device auto-created: ${device._id}`);
    return device;
  } catch (error) {
    console.error('❌ Failed to auto-create device:', error);
    throw error;
  }
}

/**
 * Auto-create device on first login
 * Called from login endpoint
 */
async function autoCreateDeviceOnLogin(userId, deviceFingerprint, deviceInfo = {}) {
  try {
    // Check if user already has any device
    const existingDevices = await Device.countDocuments({ ownerId: userId });

    // If no devices exist, auto-create default device
    if (existingDevices === 0) {
      console.log(`🆕 First login - auto-creating device for user: ${userId}`);

      const device = await Device.create({
        ownerId: userId,
        deviceFingerprint: deviceFingerprint,
        name: `${deviceInfo.deviceType || 'My Device'} (Auto)`,
        identifier: deviceInfo.identifier || deviceInfo.deviceType || 'Unknown',
        manufacturer: deviceInfo.manufacturer || 'Unknown',
        model: deviceInfo.model || 'Unknown',
        deviceType: deviceInfo.deviceType || 'mobile',
        userAgent: deviceInfo.userAgent || '',
        macAddress: generateRandomMac(),
        status: 'LEARNING',
        learningStartDate: new Date()
      });

      console.log(`✅ Default device auto-created on login: ${device._id}`);
      return device;
    }

    // User already has devices, just return first one or find matching fingerprint
    return getOrCreateDevice(userId, deviceFingerprint, deviceInfo);
  } catch (error) {
    console.error('❌ Failed to auto-create device on login:', error);
    // Don't throw - login should succeed even if device creation fails
    return null;
  }
}

/**
 * Generate random MAC address
 */
function generateRandomMac() {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

module.exports = {
  getOrCreateDevice,
  autoCreateDeviceOnLogin,
  generateRandomMac
};
