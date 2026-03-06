/**
 * seed-iphone.js
 * Creates iPhone IPH-58E475 for the student account with 14 days of fake pings
 * at the Viva Happening Room (6.91481 N, 79.97327 E), status ACTIVE.
 *
 * Usage (from backend/ folder):
 *   node seed-iphone.js
 *   node seed-iphone.js --clear    ← removes existing device + pings first
 */

require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

const STUDENT_EMAIL = 'student@example.com';
const IPHONE_NAME   = 'iPhone IPH-58E475';
const IPHONE_MAC    = 'IP:H5:8E:47:50:00';
const IPHONE_FINGERPRINT = 'iph-58e475-demo';

// Viva Happening Room — slight GPS jitter for realism
const VIVA_LAT = 6.91481;
const VIVA_LNG = 79.97327;

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

async function main() {
  const clearFirst = process.argv.includes('--clear');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const User = mongoose.model('User', new mongoose.Schema({}, { collection: 'users', strict: false }));
  const Device = mongoose.model('Device', new mongoose.Schema({}, { collection: 'devices', strict: false }));
  const DevicePing = mongoose.model('DevicePing', new mongoose.Schema({
    deviceId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
    timestamp:          { type: Date, default: Date.now },
    source:             { type: String, default: 'import' },
    location:           { lat: Number, lng: Number },
    accuracy:           Number,
    zoneId:             mongoose.Schema.Types.ObjectId,
    speed:              Number,
    hourOfDay:          Number,
    dayOfWeek:          String,
    isWithinPreference: Boolean,
    wasClosedZone:      Boolean,
    anomalyScore:       { type: Number, default: 0 },
    valid:              { type: Boolean, default: true },
    rejectReason:       String,
  }, { collection: 'devicepings' }));

  // Find student user
  const user = await User.findOne({ email: STUDENT_EMAIL });
  if (!user) {
    console.error(`❌ Student user not found: ${STUDENT_EMAIL}`);
    process.exit(1);
  }
  console.log(`👤 Student: ${user.name} (${user._id})`);

  // Handle --clear
  if (clearFirst) {
    const existing = await Device.findOne({ ownerId: user._id, deviceFingerprint: IPHONE_FINGERPRINT });
    if (existing) {
      const del = await DevicePing.deleteMany({ deviceId: existing._id });
      await Device.deleteOne({ _id: existing._id });
      console.log(`🗑️  Cleared ${del.deletedCount} pings + device record for ${IPHONE_NAME}`);
    }
  }

  // Create or find device
  let device = await Device.findOne({ ownerId: user._id, deviceFingerprint: IPHONE_FINGERPRINT });
  if (!device) {
    const now14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    device = await Device.create({
      ownerId:              user._id,
      name:                 IPHONE_NAME,
      identifier:           'IPH-58E475',
      manufacturer:         'Apple',
      model:                'iPhone 14',
      deviceType:           'mobile',
      deviceFingerprint:    IPHONE_FINGERPRINT,
      macAddress:           IPHONE_MAC,
      status:               'ACTIVE',
      learningStartDate:    now14,
      learningPhaseComplete: true,
      monitoringEnabled:    true,
      isDesignated:         false,
      createdAt:            now14,
    });
    console.log(`📱 Created device: ${device._id} — ${IPHONE_NAME}`);
  } else {
    console.log(`📱 Using existing device: ${device._id} — ${IPHONE_NAME}`);
  }

  // Build 14 days of pings (~50/day = 700 total) at Viva Happening Room
  const now = Date.now();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  const docs = [];

  console.log('📍 Building 14 days of pings at Viva Happening Room…');

  for (let i = 0; i < 700; i++) {
    const msAgo = rand(30 * 60 * 1000, FOURTEEN_DAYS_MS - 60 * 1000); // between 30 min ago and 14 days ago
    const ts = new Date(now - msAgo);
    const hour = randInt(8, 20); // 8am–8pm classes
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

  // Anchor: last known ping ~30 minutes ago (device was here, then switched off)
  const anchorTs = new Date(now - 30 * 60 * 1000);
  docs.push({
    deviceId:           device._id,
    timestamp:          anchorTs,
    source:             'import',
    location:           { lat: VIVA_LAT, lng: VIVA_LNG },
    accuracy:           5,
    speed:              0,
    hourOfDay:          anchorTs.getHours(),
    dayOfWeek:          dayNames[anchorTs.getDay()],
    isWithinPreference: true,
    wasClosedZone:      false,
    valid:              true,
    rejectReason:       null,
    anomalyScore:       0,
  });

  docs.sort((a, b) => a.timestamp - b.timestamp);
  const inserted = await DevicePing.insertMany(docs);
  console.log(`✅ Inserted ${inserted.length} pings`);

  // Update device: lastSeen = anchor (30 min ago), status = ACTIVE
  await Device.updateOne(
    { _id: device._id },
    {
      $set: {
        status:               'ACTIVE',
        learningPhaseComplete: true,
        lastSeen:             anchorTs,
        lastLocation:         { timestamp: anchorTs },
        offlineAlertSentAt:   null,
      }
    }
  );

  console.log(`\n📱 ${IPHONE_NAME} ready:`);
  console.log(`   _id        = ${device._id}`);
  console.log(`   status     = ACTIVE`);
  console.log(`   lastSeen   = ${anchorTs.toISOString()} (30 min ago — simulates phone switched off)`);
  console.log(`   location   = ${VIVA_LAT}, ${VIVA_LNG} (Viva Happening Room)`);
  console.log(`   pings      = ${inserted.length} over 14 days`);

  await mongoose.disconnect();
  console.log('\nDone. The offline detection service will alert designated devices shortly.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
