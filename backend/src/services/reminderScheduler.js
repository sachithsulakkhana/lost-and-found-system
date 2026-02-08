/**
 * Reminder Scheduler Service
 * Processes pending reminders and sends SMS/IVR calls at scheduled times
 * Runs as a cron job every minute
 */

const cron = require('node-cron');
const SmsReminder = require('../models/SmsReminder');
const IvrCall = require('../models/IvrCall');
const StoredItem = require('../models/StoredItem');
const User = require('../models/User');
const { sendSMS, formatPhoneNumber } = require('./smsService');
const { initiateIVRCall, generateIVRScript } = require('./asteriskService');
const { formatDateInTimezone } = require('./timezoneService');

let schedulerRunning = false;

/**
 * Process pending SMS reminders
 */
async function processSMSReminders() {
  try {
    const now = new Date();

    // Find all pending SMS reminders that are due
    const dueReminders = await SmsReminder.find({
      status: 'PENDING',
      scheduledFor: { $lte: now }
    })
      .populate('userId', 'name phone timezone')
      .populate('storedItemId', 'itemName');

    console.log(`📱 Processing ${dueReminders.length} due SMS reminders...`);

    for (const reminder of dueReminders) {
      try {
        // Format phone number
        const phoneNumber = formatPhoneNumber(reminder.phone);

        // Send SMS
        const result = await sendSMS(phoneNumber, reminder.message);

        // Update reminder status
        reminder.status = 'SENT';
        reminder.sentAt = new Date();
        await reminder.save();

        console.log(`✅ SMS sent to ${phoneNumber} for item: ${reminder.storedItemId?.itemName || 'Unknown'}`);
      } catch (error) {
        console.error(`❌ Failed to send SMS to ${reminder.phone}:`, error.message);

        // Mark as failed
        reminder.status = 'FAILED';
        await reminder.save();
      }
    }
  } catch (error) {
    console.error('Error processing SMS reminders:', error);
  }
}

/**
 * Process pending IVR call reminders
 */
async function processIVRReminders() {
  try {
    const now = new Date();

    // Find all scheduled IVR calls that are due
    const dueCalls = await IvrCall.find({
      scheduledStatus: 'SCHEDULED',
      scheduledFor: { $lte: now }
    })
      .populate('userId', 'name phone timezone')
      .populate('storedItemId', 'itemName');

    console.log(`📞 Processing ${dueCalls.length} due IVR calls...`);

    for (const call of dueCalls) {
      try {
        // Format phone number
        const phoneNumber = formatPhoneNumber(call.phone);

        // Generate IVR script
        const script = generateIVRScript({
          itemName: call.storedItemId?.itemName || 'your stored item',
          userName: call.userId?.name || 'there',
          scheduledDate: formatDateInTimezone(call.scheduledFor, call.userId?.timezone)
        });

        // Initiate IVR call
        const result = await initiateIVRCall(phoneNumber, script, {
          itemName: call.storedItemId?.itemName,
          userName: call.userId?.name
        });

        // Update call status
        call.scheduledStatus = 'TRIGGERED';
        call.callStatus = result.status === 'completed' ? 'COMPLETED' : 'IN_PROGRESS';
        if (result.duration) {
          call.callDuration = result.duration;
        }
        await call.save();

        console.log(`✅ IVR call initiated to ${phoneNumber} for item: ${call.storedItemId?.itemName || 'Unknown'}`);
      } catch (error) {
        console.error(`❌ Failed to initiate IVR call to ${call.phone}:`, error.message);

        // Mark as failed
        call.scheduledStatus = 'FAILED';
        call.callStatus = 'FAILED';
        await call.save();
      }
    }
  } catch (error) {
    console.error('Error processing IVR reminders:', error);
  }
}

/**
 * Main scheduler function - runs every minute
 */
async function processReminders() {
  if (schedulerRunning) {
    console.log('⏸️ Scheduler already running, skipping this cycle');
    return;
  }

  schedulerRunning = true;

  try {
    console.log(`⏰ Reminder scheduler running at ${new Date().toISOString()}`);

    // Process SMS and IVR reminders in parallel
    await Promise.all([
      processSMSReminders(),
      processIVRReminders()
    ]);

    console.log('✅ Reminder processing completed');
  } catch (error) {
    console.error('❌ Error in reminder scheduler:', error);
  } finally {
    schedulerRunning = false;
  }
}

/**
 * Start the reminder scheduler
 */
function startScheduler() {
  console.log('🚀 Starting reminder scheduler...');
  console.log('⏰ Scheduler will run every minute');

  // Run every minute: '* * * * *'
  // For testing, you can use '*/30 * * * * *' to run every 30 seconds
  const schedule = process.env.REMINDER_CRON_SCHEDULE || '* * * * *';

  cron.schedule(schedule, async () => {
    await processReminders();
  });

  // Run immediately on startup
  processReminders();

  console.log('✅ Reminder scheduler started');
}

/**
 * Manually trigger reminder processing (for testing)
 */
async function triggerManualProcessing() {
  console.log('🔧 Manual reminder processing triggered');
  await processReminders();
}

module.exports = {
  startScheduler,
  processReminders,
  triggerManualProcessing,
  processSMSReminders,
  processIVRReminders
};
