/**
 * seed-iph16d448.js
 * Seeds 7 days of pings for the iPhone (Auto) IPH-16D448 device,
 * promotes it to ACTIVE, and sets lastSeen = 6 minutes ago
 * so the offline detection service triggers an alarm immediately.
 *
 * Usage (from backend/ folder):
 *   node seed-iph16d448.js
 *   node seed-iph16d448.js --clear
 */

require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

const DEVICE_FINGERPRINT = 'IPH-16D448';

// Viva Happening Room (same location as the other demo device)
const VIVA_LAT = 6.91481;
const VIVA_LNG = 79.97327;

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

async function main() {
  const clearFirst = process.argv.includes('--clear');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const Device = mongoose.model('Device', new mongoose.Schema({}, { collection: 'devices', strict: false }));
  const DevicePing = mongoose.model('DevicePing', new mongoose.Schema({
    deviceId:           { type: mongoose.Schema.Types.ObjectId, required: true },
    timestamp:          { type: Date, default: Date.now },
    source:             { type: String, default: 'import' },
    location:           { lat: Number, lng: Number },
    accuracy:           Number,
    speed:              Number,
    hourOfDay:          Number,
    dayOfWeek:          String,
    isWithinPreference: Boolean,
    wasClosedZone:      Boolean,
    anomalyScore:       { type: Number, default: 0 },
    valid:              { type: Boolean, default: true },
    rejectReason:       String,
  }, { collection: 'devicepings' }));

  const device = await Device.findOne({ deviceFingerprint: DEVICE_FINGERPRINT });
  if (!device) {
    console.error(`❌ Device with fingerprint "${DEVICE_FINGERPRINT}" not found.`);
    console.error('   Make sure the user has visited the app on that iPhone at least once.');
    process.exit(1);
  }
  console.log(`📱 Found: ${device.name} (${device._id})`);

  if (clearFirst) {
    const del = await DevicePing.deleteMany({ deviceId: device._id });
    console.log(`🗑️  Cleared ${del.deletedCount} existing pings`);
  }

  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const docs = [];

  console.log('📍 Building 7 days of pings at Viva Happening Room…');

  // 350 normal pings spread across 7 days (8am–8pm class hours)
  for (let i = 0; i < 350; i++) {
    const msAgo = rand(10 * 60 * 1000, SEVEN_DAYS_MS - 60 * 1000); // older than 10 min
    const ts = new Date(now - msAgo);
    const hour = randInt(8, 20);
    ts.setHours(hour, randInt(0, 59), randInt(0, 59), 0);

    docs.push({
      deviceId:           device._id,
      timestamp:          ts,
      source:             'import',
      location: {
        lat: VIVA_LAT + rand(-0.00010, 0.00010),
        lng: VIVA_LNG + rand(-0.00010, 0.00010),
      },
      accuracy:           randInt(3, 15),
      speed:              rand(0, 0.5),
      hourOfDay:          hour,
      dayOfWeek:          dayNames[ts.getDay()],
      isWithinPreference: true,
      wasClosedZone:      false,
      valid:              true,
      rejectReason:       null,
      anomalyScore:       0,
    });
  }

  // Last known ping: exactly 6 minutes ago (device was active, then went silent)
  const lastPingTs = new Date(now - 6 * 60 * 1000);
  docs.push({
    deviceId:           device._id,
    timestamp:          lastPingTs,
    source:             'import',
    location:           { lat: VIVA_LAT, lng: VIVA_LNG },
    accuracy:           5,
    speed:              0,
    hourOfDay:          lastPingTs.getHours(),
    dayOfWeek:          dayNames[lastPingTs.getDay()],
    isWithinPreference: true,
    wasClosedZone:      false,
    valid:              true,
    rejectReason:       null,
    anomalyScore:       0,
  });

  docs.sort((a, b) => a.timestamp - b.timestamp);
  const inserted = await DevicePing.insertMany(docs);
  console.log(`✅ Inserted ${inserted.length} pings`);

  // Promote device to ACTIVE, set lastSeen = 6 min ago
  const earliest = docs[0].timestamp;
  await Device.updateOne(
    { _id: device._id },
    {
      $set: {
        status:                'ACTIVE',
        learningPhaseComplete: true,
        learningStartDate:     earliest,
        lastSeen:              lastPingTs,
        lastLocation:          { timestamp: lastPingTs },
        offlineAlertSentAt:    null,
        alarmSuppressedUntil:  null,
      }
    }
  );

  console.log(`\n📱 ${device.name} (${DEVICE_FINGERPRINT}) ready:`);
  console.log(`   status   = ACTIVE`);
  console.log(`   lastSeen = ${lastPingTs.toISOString()} (6 min ago)`);
  console.log(`   location = ${VIVA_LAT}, ${VIVA_LNG} (Viva Happening Room)`);
  console.log(`\n⚡ The offline detection service will alarm the designated device within 2 minutes.`);

  await mongoose.disconnect();
  console.log('\nDone.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
