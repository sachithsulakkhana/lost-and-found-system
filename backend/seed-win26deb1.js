/**
 * seed-win26deb1.js
 * Seeds 14 days of realistic DevicePing + DeviceActivity records for
 * Windows (Auto) / WIN-26DEB1 at location 6.913519, 79.973929, then
 * trains the IsolationForest anomaly model and activates the device.
 *
 * Usage (from backend/ folder):
 *   node seed-win26deb1.js           ← keeps existing data
 *   node seed-win26deb1.js --clear   ← clears existing pings/activities first (recommended)
 */

require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

const DEVICE_ID = '69a8060cc6f3d3b75291bf1f';  // Windows (Auto) / WIN-26DEB1
const OWNER_ID  = '696b332a9812a2ebb6472040';  // John Student
const ZONE_ID   = '696b332a9812a2ebb6472047';  // P and S Cafeteria (nearest zone)

// Normal home location for this device
const HOME_LAT = 6.913519;
const HOME_LNG = 79.973929;

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

async function main() {
  const clearFirst = process.argv.includes('--clear');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Use the actual model files so they don't conflict when anomalyDetectionService imports them
  const DevicePing     = require('./src/models/DevicePing');
  const DeviceActivity = require('./src/models/DeviceActivity');
  const Device         = require('./src/models/Device');

  const deviceOid  = new mongoose.Types.ObjectId(DEVICE_ID);
  const ownerOid   = new mongoose.Types.ObjectId(OWNER_ID);
  const zoneOid    = new mongoose.Types.ObjectId(ZONE_ID);

  // ── Optional clear ─────────────────────────────────────────────────────
  if (clearFirst) {
    const dp = await DevicePing.deleteMany({ deviceId: deviceOid });
    const da = await DeviceActivity.deleteMany({ deviceId: deviceOid });
    console.log(`🗑️  Cleared ${dp.deletedCount} pings + ${da.deletedCount} activities for WIN-26DEB1`);
  }

  const now      = Date.now();
  const DAYS14   = 14 * 24 * 60 * 60 * 1000;
  const ANCHOR   = 60 * 60 * 1000;   // 1 hour ago

  // ── 1. Build 500 DevicePing records ────────────────────────────────────
  console.log('\n📍 Building 500 DevicePings (14 days at 6.913519, 79.973929)…');
  const pingDocs = [];
  for (let i = 0; i < 500; i++) {
    const msAgo = rand(ANCHOR + 60000, DAYS14);
    const ts    = new Date(now - msAgo);
    const hour  = randInt(8, 19);
    ts.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
    if (ts.getTime() > now - ANCHOR) ts.setTime(now - ANCHOR - 60000);

    pingDocs.push({
      deviceId:           deviceOid,
      timestamp:          ts,
      source:             'import',
      location:           { lat: HOME_LAT + rand(-0.00015, 0.00015), lng: HOME_LNG + rand(-0.00015, 0.00015) },
      accuracy:           randInt(3, 20),
      zoneId:             zoneOid,
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

  // Anchor: exactly 1 hour ago at the precise home location
  const anchorTs = new Date(now - ANCHOR);
  pingDocs.push({
    deviceId:           deviceOid,
    timestamp:          anchorTs,
    source:             'import',
    location:           { lat: HOME_LAT, lng: HOME_LNG },
    accuracy:           5,
    zoneId:             zoneOid,
    speed:              0,
    hourOfDay:          anchorTs.getHours(),
    dayOfWeek:          dayNames[anchorTs.getDay()],
    isWithinPreference: true,
    wasClosedZone:      false,
    valid:              true,
    rejectReason:       null,
    anomalyScore:       0,
  });

  pingDocs.sort((a, b) => a.timestamp - b.timestamp);
  const insertedPings = await DevicePing.insertMany(pingDocs);
  console.log(`✅ Inserted ${insertedPings.length} pings`);

  // ── 2. Build 200 DeviceActivity records (training data) ────────────────
  console.log('\n🧠 Building 200 DeviceActivity records (isTrainingData=true)…');
  const actDocs = [];
  for (let i = 0; i < 200; i++) {
    const msAgo = rand(ANCHOR + 60000, DAYS14);
    const ts    = new Date(now - msAgo);
    const hour  = randInt(8, 19);
    ts.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
    if (ts.getTime() > now - ANCHOR) ts.setTime(now - ANCHOR - 60000);

    const dow = ts.getDay();
    actDocs.push({
      deviceId:       deviceOid,
      userId:         ownerOid,
      timestamp:      ts,
      status:         'ONLINE',
      zoneId:         zoneOid,
      networkInfo:    { ssid: 'SLIIT-WiFi', signalStrength: randInt(70, 95) },
      location:       { lat: HOME_LAT + rand(-0.00015, 0.00015), lng: HOME_LNG + rand(-0.00015, 0.00015), accuracy: randInt(5, 20) },
      features: {
        hourOfDay:              hour,
        dayOfWeek:              dow,
        isWeekend:              dow === 0 || dow === 6,
        sessionDuration:        randInt(10, 120),
        locationChangeFrequency: rand(0, 0.2),
        avgSignalStrength:      randInt(70, 95),
      },
      anomalyScore:   0,
      isAnomaly:      false,
      isTrainingData: true,
    });
  }

  actDocs.sort((a, b) => a.timestamp - b.timestamp);
  const insertedActs = await DeviceActivity.insertMany(actDocs);
  console.log(`✅ Inserted ${insertedActs.length} activities`);

  // ── 3. Train the IsolationForest model ─────────────────────────────────
  console.log('\n🤖 Training IsolationForest model…');
  const anomalyDetectionService = require('./src/services/anomalyDetectionService');
  const trained = await anomalyDetectionService.trainDeviceModel(deviceOid);
  if (trained) {
    console.log('✅ Model trained and saved to Device.modelData');
  } else {
    console.warn('⚠️  Model training returned false — check activity count');
  }

  // ── 4. Update device to ACTIVE ─────────────────────────────────────────
  const earliest = insertedActs[0].timestamp;
  await Device.updateOne(
    { _id: deviceOid },
    {
      $set: {
        status:                'ACTIVE',
        learningPhaseComplete: true,
        learningStartDate:     new Date(now - DAYS14),
        lastSeen:              anchorTs,
        lastLocation:          { timestamp: anchorTs },
      }
    }
  );

  console.log('\n📱 Windows (Auto) / WIN-26DEB1 updated:');
  console.log('   status               = ACTIVE');
  console.log('   learningPhaseComplete = true');
  console.log(`   learningStartDate    = ${new Date(now - DAYS14).toISOString()}`);
  console.log(`   lastSeen (anchor)    = ${anchorTs.toISOString()}`);
  console.log(`   home location        = ${HOME_LAT}, ${HOME_LNG}`);

  console.log('\n🎯 Ready! If the device lid closes at this location then opens');
  console.log('   somewhere >55m away, THEFT_SUSPECTED alarm will fire.\n');

  await mongoose.disconnect();
  console.log('Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
