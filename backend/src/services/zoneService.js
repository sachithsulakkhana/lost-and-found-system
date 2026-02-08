const Zone = require('../models/Zone');

exports.findZoneByLocation = async (lat, lng) => {
  const zones = await Zone.find({ isActive: true });
  
  for (const zone of zones) {
    const distance = Math.sqrt(
      Math.pow(zone.center.lat - lat, 2) + 
      Math.pow(zone.center.lng - lng, 2)
    );
    
    if (distance * 111000 <= zone.radius) {
      return zone;
    }
  }
  
  return null;
};

exports.isWithinPreference = (device, currentTime, currentZoneId) => {
  if (!device.preferredZoneId || !device.preferredTimeWindow) {
    return true;
  }
  
  if (device.preferredZoneId.toString() !== currentZoneId.toString()) {
    return false;
  }
  
  const hour = currentTime.getHours();
  const startHour = parseInt(device.preferredTimeWindow.start.split(':')[0]);
  const endHour = parseInt(device.preferredTimeWindow.end.split(':')[0]);
  
  if (hour < startHour || hour > endHour) {
    return false;
  }
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDay = dayNames[currentTime.getDay()];
  
  if (device.allowedDays && device.allowedDays.length > 0) {
    if (!device.allowedDays.includes(currentDay)) {
      return false;
    }
  }
  
  return true;
};
