/**
 * Auto-Enrollment Service
 * Automatically enrolls device on first app load/login
 * No manual action required
 */

import api from './api';
import { getAutoDeviceInfo, getDeviceIdentifier, storeDeviceInfo } from './deviceFingerprint';

/**
 * Auto-enroll device on app load
 * Called once when user logs in
 */
export async function autoEnrollDevice() {
  try {
    const deviceInfo = getAutoDeviceInfo();
    const deviceId = getDeviceIdentifier();

    console.log(`🆕 Auto-enrolling device: ${deviceId}`);
    console.log(`📱 Device: ${deviceInfo.deviceType} - ${deviceInfo.manufacturer} ${deviceInfo.model}`);

    // Call auto-enrollment endpoint with fingerprint
    const response = await api.post('/devices', {
      name: `${deviceInfo.deviceType} (Auto)`,
      identifier: deviceInfo.deviceType,
      manufacturer: deviceInfo.manufacturer,
      model: deviceInfo.model,
      deviceFingerprint: deviceId,
      userAgent: deviceInfo.userAgent
    });

    console.log(`✅ Device auto-enrolled: ${response.data._id}`);

    // Store device info locally
    storeDeviceInfo(deviceId, deviceInfo);

    return response.data;
  } catch (error) {
    // If device already exists, that's OK
    if (error.response?.status === 400) {
      console.log('✅ Device already enrolled');
      return null;
    }

    console.error('⚠️ Auto-enrollment warning:', error.message);
    // Don't throw - app should work even if auto-enrollment fails
    return null;
  }
}

/**
 * Check if device is already enrolled
 */
export async function checkDeviceEnrolled() {
  try {
    const response = await api.get('/devices');
    return Array.isArray(response.data) && response.data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get first device (for auto-selection)
 */
export async function getFirstDevice() {
  try {
    const response = await api.get('/devices');
    const devices = Array.isArray(response.data) ? response.data : [];
    return devices.length > 0 ? devices[0] : null;
  } catch {
    return null;
  }
}
