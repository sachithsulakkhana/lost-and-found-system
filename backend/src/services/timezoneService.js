/**
 * Timezone Service
 * Handles all timezone conversions and date formatting for the application
 * Default timezone: Asia/Colombo (UTC+5:30)
 */

const DEFAULT_TIMEZONE = 'Asia/Colombo';

/**
 * Convert a date string and time string to a proper Date object in the user's timezone
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {string} timeStr - Time string in HH:mm format
 * @param {string} timezone - User's timezone (default: Asia/Colombo)
 * @returns {Date} Date object
 */
function createDateInTimezone(dateStr, timeStr, timezone = DEFAULT_TIMEZONE) {
  // Combine date and time
  const dateTimeStr = `${dateStr}T${timeStr}:00`;

  // Parse the date as if it's in the target timezone
  // We create a UTC date then adjust for the timezone offset
  const date = new Date(dateTimeStr);

  // For Asia/Colombo, the offset is +5:30 (330 minutes)
  // We need to subtract this offset to get the correct UTC time
  const offsetMinutes = getTimezoneOffset(timezone);
  date.setMinutes(date.getMinutes() - offsetMinutes);

  return date;
}

/**
 * Get timezone offset in minutes for a given timezone
 * @param {string} timezone - Timezone name
 * @returns {number} Offset in minutes
 */
function getTimezoneOffset(timezone) {
  // For Asia/Colombo (UTC+5:30)
  if (timezone === 'Asia/Colombo') {
    return 330; // 5 hours 30 minutes = 330 minutes
  }

  // Default fallback
  return 0;
}

/**
 * Format a Date object to a readable string in the user's timezone
 * @param {Date} date - Date object
 * @param {string} timezone - User's timezone
 * @returns {string} Formatted date string
 */
function formatDateInTimezone(date, timezone = DEFAULT_TIMEZONE) {
  if (!date) return '';

  try {
    return new Date(date).toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return new Date(date).toISOString();
  }
}

/**
 * Get current date/time in the user's timezone
 * @param {string} timezone - User's timezone
 * @returns {Date} Current date
 */
function getCurrentDateInTimezone(timezone = DEFAULT_TIMEZONE) {
  return new Date();
}

/**
 * Extract date and time components from a Date object in a specific timezone
 * @param {Date} date - Date object
 * @param {string} timezone - User's timezone
 * @returns {Object} Object with date and time strings
 */
function extractDateTimeComponents(date, timezone = DEFAULT_TIMEZONE) {
  const dateStr = new Date(date).toLocaleString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const timeStr = new Date(date).toLocaleString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return { dateStr, timeStr };
}

module.exports = {
  DEFAULT_TIMEZONE,
  createDateInTimezone,
  getTimezoneOffset,
  formatDateInTimezone,
  getCurrentDateInTimezone,
  extractDateTimeComponents
};
