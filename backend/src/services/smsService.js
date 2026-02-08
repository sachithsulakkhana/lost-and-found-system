/**
 * SMS Service
 * Handles SMS sending via configured SMS gateway
 * Currently supports: Twilio, custom gateway, or mock mode
 */

const axios = require('axios');

// SMS Provider Configuration (loaded from environment variables)
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'mock'; // 'twilio', 'custom', or 'mock'
const SMS_API_URL = process.env.SMS_API_URL || '';
const SMS_API_KEY = process.env.SMS_API_KEY || '';
const SMS_FROM_NUMBER = process.env.SMS_FROM_NUMBER || '+94XXXXXXXXX';

// Twilio specific
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

/**
 * Send SMS using configured provider
 * @param {string} to - Recipient phone number (with country code)
 * @param {string} message - SMS message text
 * @returns {Promise<Object>} Result object with status and messageId
 */
async function sendSMS(to, message) {
  console.log(`📱 Sending SMS to ${to}: ${message}`);

  try {
    switch (SMS_PROVIDER) {
      case 'twilio':
        return await sendViaTwilio(to, message);

      case 'custom':
        return await sendViaCustomGateway(to, message);

      case 'mock':
      default:
        return await sendViaMock(to, message);
    }
  } catch (error) {
    console.error('SMS sending failed:', error.message);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
}

/**
 * Send SMS via Twilio
 */
async function sendViaTwilio(to, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials not configured');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  const response = await axios.post(
    url,
    new URLSearchParams({
      To: to,
      From: SMS_FROM_NUMBER,
      Body: message
    }),
    {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  return {
    success: true,
    provider: 'twilio',
    messageId: response.data.sid,
    status: response.data.status
  };
}

/**
 * Send SMS via custom gateway
 */
async function sendViaCustomGateway(to, message) {
  if (!SMS_API_URL || !SMS_API_KEY) {
    throw new Error('Custom SMS gateway not configured');
  }

  const response = await axios.post(
    SMS_API_URL,
    {
      to,
      message,
      from: SMS_FROM_NUMBER
    },
    {
      headers: {
        'Authorization': `Bearer ${SMS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    success: true,
    provider: 'custom',
    messageId: response.data.messageId || response.data.id,
    status: response.data.status || 'sent'
  };
}

/**
 * Mock SMS sending (for development/testing)
 */
async function sendViaMock(to, message) {
  console.log('═══════════════════════════════════════');
  console.log('📱 MOCK SMS SENT');
  console.log(`To: ${to}`);
  console.log(`Message: ${message}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════');

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    success: true,
    provider: 'mock',
    messageId: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'sent'
  };
}

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid
 */
function validatePhoneNumber(phone) {
  // Basic validation: should start with + and have 10-15 digits
  const phoneRegex = /^\+?[1-9]\d{9,14}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
}

/**
 * Format phone number to E.164 format (+94XXXXXXXXX)
 * @param {string} phone - Phone number to format
 * @param {string} defaultCountryCode - Default country code (e.g., '94' for Sri Lanka)
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(phone, defaultCountryCode = '94') {
  // Remove spaces, dashes, and parentheses
  let cleaned = phone.replace(/[\s\-()]/g, '');

  // If doesn't start with +, add country code
  if (!cleaned.startsWith('+')) {
    // If starts with 0, remove it (local format)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    // Add country code
    cleaned = `+${defaultCountryCode}${cleaned}`;
  }

  return cleaned;
}

module.exports = {
  sendSMS,
  validatePhoneNumber,
  formatPhoneNumber
};
