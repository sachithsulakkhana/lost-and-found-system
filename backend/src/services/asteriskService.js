/**
 * Asterisk IVR Service
 * Handles IVR call initiation via Asterisk AMI (Asterisk Manager Interface)
 * Supports SIP-based calls for reminders
 */

const net = require('net');
const EventEmitter = require('events');

// Asterisk AMI Configuration (loaded from environment variables)
const ASTERISK_HOST = process.env.ASTERISK_HOST || 'localhost';
const ASTERISK_PORT = process.env.ASTERISK_PORT || 5038;
const ASTERISK_USERNAME = process.env.ASTERISK_USERNAME || 'admin';
const ASTERISK_PASSWORD = process.env.ASTERISK_PASSWORD || '';
const ASTERISK_CONTEXT = process.env.ASTERISK_CONTEXT || 'from-internal';
const ASTERISK_CALLER_ID = process.env.ASTERISK_CALLER_ID || 'Lost & Found <1000>';
const ASTERISK_ENABLED = process.env.ASTERISK_ENABLED === 'true';

// IVR Audio file configuration
const IVR_AUDIO_PATH = process.env.IVR_AUDIO_PATH || '/var/lib/asterisk/sounds/custom/';

class AsteriskAMI extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.authenticated = false;
    this.actionId = 0;
    this.pendingActions = new Map();
  }

  /**
   * Connect to Asterisk AMI
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(ASTERISK_PORT, ASTERISK_HOST);

      this.socket.on('connect', () => {
        console.log(`✅ Connected to Asterisk AMI at ${ASTERISK_HOST}:${ASTERISK_PORT}`);
      });

      this.socket.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.socket.on('error', (error) => {
        console.error('❌ Asterisk AMI error:', error.message);
        reject(error);
      });

      this.socket.on('close', () => {
        console.log('🔌 Asterisk AMI connection closed');
        this.authenticated = false;
      });

      // Wait for initial greeting and authenticate
      setTimeout(() => {
        this.authenticate()
          .then(() => resolve())
          .catch(reject);
      }, 1000);
    });
  }

  /**
   * Authenticate with Asterisk AMI
   */
  async authenticate() {
    return this.sendAction('Login', {
      Username: ASTERISK_USERNAME,
      Secret: ASTERISK_PASSWORD
    }).then(() => {
      this.authenticated = true;
      console.log('✅ Asterisk AMI authenticated');
    });
  }

  /**
   * Send an AMI action
   */
  sendAction(action, params = {}) {
    return new Promise((resolve, reject) => {
      const actionId = ++this.actionId;
      const lines = [`Action: ${action}`, `ActionID: ${actionId}`];

      for (const [key, value] of Object.entries(params)) {
        lines.push(`${key}: ${value}`);
      }

      lines.push('', ''); // Double newline ends the action

      const message = lines.join('\r\n');
      this.socket.write(message);

      // Store pending action
      this.pendingActions.set(actionId, { resolve, reject, timeout: setTimeout(() => {
        this.pendingActions.delete(actionId);
        reject(new Error('AMI action timeout'));
      }, 10000) });
    });
  }

  /**
   * Handle incoming AMI data
   */
  handleData(data) {
    const lines = data.split('\r\n');
    let actionId = null;
    let response = {};

    for (const line of lines) {
      if (line.includes('ActionID:')) {
        actionId = parseInt(line.split(':')[1].trim());
      }
      if (line.includes('Response:')) {
        response.status = line.split(':')[1].trim();
      }
      if (line.includes('Message:')) {
        response.message = line.split(':')[1].trim();
      }
    }

    if (actionId && this.pendingActions.has(actionId)) {
      const pending = this.pendingActions.get(actionId);
      clearTimeout(pending.timeout);
      this.pendingActions.delete(actionId);

      if (response.status === 'Success') {
        pending.resolve(response);
      } else {
        pending.reject(new Error(response.message || 'AMI action failed'));
      }
    }
  }

  /**
   * Disconnect from AMI
   */
  disconnect() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}

/**
 * Initiate an IVR call to a phone number
 * @param {string} phoneNumber - Destination phone number
 * @param {string} message - Message to deliver (will use TTS or pre-recorded audio)
 * @param {Object} options - Additional options (itemName, userName, etc.)
 * @returns {Promise<Object>} Call result
 */
async function initiateIVRCall(phoneNumber, message, options = {}) {
  console.log(`📞 Initiating IVR call to ${phoneNumber}`);
  console.log(`Message: ${message}`);

  if (!ASTERISK_ENABLED) {
    console.log('⚠️ Asterisk is disabled. Using mock IVR call.');
    return mockIVRCall(phoneNumber, message, options);
  }

  try {
    const ami = new AsteriskAMI();
    await ami.connect();

    // Originate call using AMI
    const channel = `SIP/${phoneNumber}`;
    const result = await ami.sendAction('Originate', {
      Channel: channel,
      Context: ASTERISK_CONTEXT,
      Exten: 's',
      Priority: 1,
      CallerID: ASTERISK_CALLER_ID,
      Timeout: 30000,
      Variable: `MESSAGE="${encodeURIComponent(message)}",ITEM_NAME="${options.itemName || ''}",USER_NAME="${options.userName || ''}"`
    });

    ami.disconnect();

    return {
      success: true,
      provider: 'asterisk',
      callId: result.uniqueId || `call_${Date.now()}`,
      status: 'initiated',
      phoneNumber,
      message
    };
  } catch (error) {
    console.error('❌ Asterisk IVR call failed:', error.message);
    throw new Error(`Failed to initiate IVR call: ${error.message}`);
  }
}

/**
 * Mock IVR call for development/testing
 */
async function mockIVRCall(phoneNumber, message, options = {}) {
  console.log('═══════════════════════════════════════');
  console.log('📞 MOCK IVR CALL INITIATED');
  console.log(`To: ${phoneNumber}`);
  console.log(`Message: ${message}`);
  console.log(`Item: ${options.itemName || 'N/A'}`);
  console.log(`User: ${options.userName || 'N/A'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════');

  // Simulate call delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    success: true,
    provider: 'mock',
    callId: `mock_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'completed',
    duration: 45,
    phoneNumber,
    message
  };
}

/**
 * Generate IVR script for reminder
 * @param {Object} reminderData - Reminder information
 * @returns {string} IVR script text
 */
function generateIVRScript(reminderData) {
  const { itemName, userName, scheduledDate } = reminderData;

  return `
    Hello ${userName || 'there'}. This is an automated reminder from the Lost and Found System at SLIIT.

    You have a stored item: ${itemName}.

    This reminder was scheduled for ${scheduledDate}.

    Please remember to retrieve your item from the storage location.

    Press 1 to confirm you received this reminder.
    Press 2 to schedule another reminder.
    Press 3 to report the item as retrieved.

    Thank you.
  `.trim();
}

/**
 * Check Asterisk connection status
 */
async function checkAsteriskStatus() {
  if (!ASTERISK_ENABLED) {
    return {
      enabled: false,
      status: 'disabled',
      message: 'Asterisk integration is disabled'
    };
  }

  try {
    const ami = new AsteriskAMI();
    await ami.connect();
    await ami.sendAction('Ping');
    ami.disconnect();

    return {
      enabled: true,
      status: 'connected',
      message: 'Asterisk AMI is reachable',
      host: ASTERISK_HOST,
      port: ASTERISK_PORT
    };
  } catch (error) {
    return {
      enabled: true,
      status: 'error',
      message: error.message,
      host: ASTERISK_HOST,
      port: ASTERISK_PORT
    };
  }
}

module.exports = {
  initiateIVRCall,
  generateIVRScript,
  checkAsteriskStatus,
  AsteriskAMI
};
