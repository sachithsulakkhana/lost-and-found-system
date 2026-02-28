/**
 * Helper functions to detect device information from browser navigator
 */

export function getDeviceInfo() {
  const ua = navigator.userAgent;
  let deviceType = 'Unknown';
  let manufacturer = 'Unknown';
  let model = 'Unknown';

  // Basic device detection from User-Agent
  if (/iPhone/.test(ua)) {
    deviceType = 'iPhone';
    manufacturer = 'Apple';
    // Extract model from UA
    const match = ua.match(/iPhone OS (\d+)/);
    model = match ? `iPhone (iOS ${match[1]})` : 'iPhone';
  } else if (/Android/.test(ua)) {
    deviceType = 'Android Device';
    manufacturer = 'Android';
    // Try to extract Android model
    const match = ua.match(/Android.*?;.*?([^;]+);/);
    model = match ? match[1].trim() : 'Android Device';
  } else if (/Windows/.test(ua)) {
    deviceType = 'Windows PC';
    manufacturer = 'Windows';
    model = 'Windows Computer';
  } else if (/Macintosh/.test(ua)) {
    deviceType = 'Mac';
    manufacturer = 'Apple';
    model = 'Mac Computer';
  } else if (/Linux/.test(ua)) {
    deviceType = 'Linux';
    manufacturer = 'Linux';
    model = 'Linux Device';
  }

  return {
    deviceType,
    manufacturer,
    model,
    userAgent: ua
  };
}

export function getMacAddressInstructions() {
  return {
    'iPhone/iPad': {
      steps: [
        'Open Settings app',
        'Go to General → About',
        'Look for "WiFi Address"',
        'That\'s your WiFi MAC address'
      ],
      example: 'A4:C3:F0:2D:11:9E'
    },
    'Android': {
      steps: [
        'Open Settings',
        'Go to About Phone',
        'Look for "Status" or "Device Status"',
        'Find "WiFi MAC Address" or "Bluetooth Address"',
        'You can also find it under Network → WiFi → (Connected network) → Properties'
      ],
      example: '2C:F0:EE:48:6A:5C'
    },
    'Windows': {
      steps: [
        'Open Command Prompt (cmd)',
        'Type: ipconfig /all',
        'Look for "Physical Address" under your network adapter',
        'That\'s your MAC address'
      ],
      example: '00-11-22-33-44-55'
    },
    'Mac/Linux': {
      steps: [
        'Open Terminal',
        'Type: ifconfig | grep "ether" (Mac) or "HWaddr" (Linux)',
        'The ether/HWaddr value is your MAC address',
        'You can also use: ip link show'
      ],
      example: 'a4:c3:f0:2d:11:9e'
    },
    'Laptop': {
      steps: [
        'Go to Device Manager (Windows) or System Preferences (Mac)',
        'Find your network adapter',
        'Right-click → Properties',
        'Look for "Physical Address" or "MAC Address"'
      ],
      example: 'AA:BB:CC:DD:EE:FF'
    }
  };
}

export function formatMacAddress(mac) {
  if (!mac) return '';
  // Remove any existing separators and add colons
  const cleaned = mac.replace(/[-:]/g, '');
  if (cleaned.length !== 12) return mac; // Invalid length
  return cleaned.match(/.{1,2}/g).join(':').toUpperCase();
}

export function validateMacAddress(mac) {
  const macRegex = /^([0-9A-F]{2}:){5}([0-9A-F]{2})$/i;
  return macRegex.test(mac);
}
