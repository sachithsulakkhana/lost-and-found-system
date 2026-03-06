/**
 * Device Fingerprinting Utility
 * Creates a unique device identifier from browser/device characteristics
 * Used for automatic device detection and MAC address inference
 */

/**
 * Generate a unique device fingerprint from multiple characteristics
 * Format: DEVICE_TYPE-HASH(screen-browser-useragent)
 * Examples: ANDROID-A4C3F0, IPHONE-2D119E, WINDOWS-7D8E9F
 */
export function generateDeviceFingerprint() {
  const components = [];

  // 1. Screen characteristics
  const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  components.push(screenInfo);

  // 2. Browser/UserAgent info
  const ua = navigator.userAgent;
  components.push(ua);

  // 3. Languages
  components.push(navigator.language);

  // 4. Platform
  components.push(navigator.platform);

  // 5. Timezone offset
  components.push(new Date().getTimezoneOffset().toString());

  // 6. Hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency) {
    components.push(navigator.hardwareConcurrency.toString());
  }

  // 7. Device memory (if available)
  if (navigator.deviceMemory) {
    components.push(navigator.deviceMemory.toString());
  }

  // NOTE: connection.effectiveType intentionally excluded — it changes between
  // WiFi and mobile data, which would create a new fingerprint (and duplicate device)
  // every time the user switches networks on the same device.

  // Simple hash function
  let hash = 0;
  const combined = components.join('|');
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const hashStr = Math.abs(hash).toString(16).padStart(6, '0').toUpperCase().slice(0, 6);
  const deviceType = detectDeviceType();

  return `${deviceType.substring(0, 3).toUpperCase()}-${hashStr}`;
}

/**
 * Detect device type from User-Agent
 */
export function detectDeviceType() {
  const ua = navigator.userAgent;

  if (/iPhone|iPad/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  if (/iPad/.test(ua)) return 'iPad';

  return 'Unknown';
}

/**
 * Get device info for auto-creation
 */
export function getAutoDeviceInfo() {
  const ua = navigator.userAgent;
  const deviceType = detectDeviceType();
  let manufacturer = 'Unknown';
  let model = 'Unknown';
  let name = deviceType;

  if (/iPhone/.test(ua)) {
    manufacturer = 'Apple';
    name = 'iPhone';
    const match = ua.match(/OS (\d+)/);
    if (match) model = `iOS ${match[1]}`;
  } else if (/iPad/.test(ua)) {
    manufacturer = 'Apple';
    name = 'iPad';
    const match = ua.match(/OS (\d+)/);
    if (match) model = `iPadOS ${match[1]}`;
  } else if (/Android/.test(ua)) {
    manufacturer = 'Google';
    name = 'Android Device';
    const match = ua.match(/Android (\d+)/);
    if (match) model = `Android ${match[1]}`;
  } else if (/Windows/.test(ua)) {
    manufacturer = 'Windows';
    name = 'Windows PC';
    model = 'Windows Computer';
  } else if (/Macintosh/.test(ua)) {
    manufacturer = 'Apple';
    name = 'Mac';
    model = 'Mac Computer';
  } else if (/Linux/.test(ua)) {
    manufacturer = 'Linux';
    name = 'Linux Device';
    model = 'Linux System';
  }

  const fingerprint = generateDeviceFingerprint();

  return {
    name,
    manufacturer,
    model,
    deviceType,
    fingerprint,
    userAgent: ua
  };
}

/**
 * Extract potential MAC address from client IP info
 * Note: This is very limited - browsers don't expose MAC addresses directly
 * Instead, we use the fingerprint as a unique identifier
 */
export function generateMacFromFingerprint(fingerprint) {
  // Convert fingerprint to plausible MAC format for internal use
  // Format: AA:BB:CC:DD:EE:FF
  const hash = fingerprint.replace(/[^0-9A-F]/g, '');
  const padded = (hash + 'AABBCCDDEE').slice(0, 12);
  const mac = padded.match(/.{1,2}/g).join(':');
  return mac;
}

/**
 * Create a standardized device identifier for API requests
 */
export function getDeviceIdentifier() {
  // Try to get from localStorage (persist across sessions)
  let deviceId = localStorage.getItem('deviceId');

  if (!deviceId) {
    // Generate new one
    const info = getAutoDeviceInfo();
    deviceId = info.fingerprint;
    localStorage.setItem('deviceId', deviceId);
    localStorage.setItem('deviceInfo', JSON.stringify(info));
  }

  return deviceId;
}

/**
 * Store device info in localStorage for later reference
 */
export function storeDeviceInfo(deviceId, info) {
  localStorage.setItem('deviceId', deviceId);
  localStorage.setItem('deviceInfo', JSON.stringify(info));
}

/**
 * Get stored device info
 */
export function getStoredDeviceInfo() {
  const stored = localStorage.getItem('deviceInfo');
  return stored ? JSON.parse(stored) : getAutoDeviceInfo();
}
