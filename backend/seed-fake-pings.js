/**
 * seed-fake-pings.js
 * Inserts demo ping data for "Myphone" device to prove anomaly detection concept.
 *
 * Usage (from backend/ folder):
 *   node seed-fake-pings.js
 *   node seed-fake-pings.js --clear     ← clears existing pings for this device first
 */

require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

const DEVICE_ID = '69759f7f6ded46b0e9683fc3'; // Myphone (Vivo V30) - ACTIVE

// ─── SLIIT Malabe campus buildings (normal zones) ─────────────────
// Slight variation simulates moving between buildings on campus
const SLIIT_ZONES = [
  { lat: 6.91483, lng: 79.97288 }, // Main building
  { lat: 6.91510, lng: 79.97320 }, // Library
  { lat: 6.91455, lng: 79.97260 }, // Canteen
  { lat: 6.91495, lng: 79.97250 }, // Lab block
  { lat: 6.91470, lng: 79.97310 }, // Lecture halls
];

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

/**
 * Compute what mlService.calculateAnomalyScore() would return
 * given 'histPings' history and a new 'ping'.
 */
function computeScore(histPings, newPing) {
  if (histPings.length < 10) return 0;
  const avgLat = histPings.reduce((s, p) => s + p.location.lat, 0) / histPings.length;
  const avgLng = histPings.reduce((s, p) => s + p.location.lng, 0) / histPings.length;
  const dist = Math.sqrt(
    Math.pow(newPing.location.lat - avgLat, 2) +
    Math.pow(newPing.location.lng - avgLng, 2)
  );
  const normalizedDist = Math.min(dist * 1000, 1);
  const avgHour = histPings.reduce((s, p) => s + p.hourOfDay, 0) / histPings.length;
  const timeDiff = Math.abs(newPing.hourOfDay - avgHour) / 24;
  return normalizedDist * 0.7 + timeDiff * 0.3;
}

async function main() {
  const clearFirst = process.argv.includes('--clear');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const DevicePing = mongoose.model(
    'DevicePing',
    new mongoose.Schema({
      deviceId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
      timestamp:         { type: Date, default: Date.now },
      source:            { type: String, enum: ['http','ws','simulator','import'], default: 'http' },
      location:          { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
      accuracy:          Number,
      zoneId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
      speed:             Number,
      hourOfDay:         Number,
      dayOfWeek:         String,
      isWithinPreference:Boolean,
      wasClosedZone:     Boolean,
      anomalyScore:      { type: Number, default: 0 },
      valid:             { type: Boolean, default: true },
      rejectReason:      String,
    }, { collection: 'devicepings' })
  );

  const Device = mongoose.model(
    'Device',
    new mongoose.Schema({}, { collection: 'devices', strict: false })
  );

  if (clearFirst) {
    const del = await DevicePing.deleteMany({ deviceId: new mongoose.Types.ObjectId(DEVICE_ID) });
    console.log(`🗑️  Cleared ${del.deletedCount} existing pings for Myphone`);
  }

  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const docs = [];

  // ── 500 NORMAL pings at SLIIT Malabe — past 7 days only ──────────────
  // ~71 pings/day, 8am–7pm, device moves between campus buildings
  console.log('\n📍 Building 500 SLIIT pings (7 days)…');
  // All random pings must be older than the anchor (3h ago)
  // so anchor stays as the most-recent ping in DB
  const ANCHOR_OFFSET_MS = 3 * 60 * 60 * 1000;
  for (let i = 0; i < 500; i++) {
    const msAgo = rand(ANCHOR_OFFSET_MS + 60000, SEVEN_DAYS_MS); // at least 3h+1min ago
    const ts = new Date(now - msAgo);
    const hour = randInt(8, 19);
    ts.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
    // If setHours pushed it forward past anchor, clamp it
    if (ts.getTime() > now - ANCHOR_OFFSET_MS) ts.setTime(now - ANCHOR_OFFSET_MS - 60000);

    // Pick a random SLIIT campus building/zone with small GPS noise
    const zone = SLIIT_ZONES[Math.floor(Math.random() * SLIIT_ZONES.length)];

    docs.push({
      deviceId:           new mongoose.Types.ObjectId(DEVICE_ID),
      timestamp:          ts,
      source:             'import',
      location:           { lat: zone.lat + rand(-0.00015, 0.00015), lng: zone.lng + rand(-0.00015, 0.00015) },
      accuracy:           randInt(3, 20),
      speed:              rand(0, 1.2),
      hourOfDay:          hour,
      dayOfWeek:          dayNames[ts.getDay()],
      isWithinPreference: true,
      wasClosedZone:      false,
      valid:              true,
      rejectReason:       null,
      anomalyScore:       0,
    });
  }

  // ── Anchor ping: SLIIT, exactly 3 hours ago ──────────────────────────
  // This ensures real-time GPS pings (from user's actual location) pass
  // the speed check (3h gap = can travel up to ~160 km at max 15 m/s)
  const anchorTs = new Date(now - 3 * 60 * 60 * 1000);
  const anchorZone = SLIIT_ZONES[0];
  docs.push({
    deviceId:           new mongoose.Types.ObjectId(DEVICE_ID),
    timestamp:          anchorTs,
    source:             'import',
    location:           { lat: anchorZone.lat, lng: anchorZone.lng },
    accuracy:           8,
    speed:              0.3,
    hourOfDay:          anchorTs.getHours(),
    dayOfWeek:          dayNames[anchorTs.getDay()],
    isWithinPreference: true,
    wasClosedZone:      false,
    valid:              true,
    rejectReason:       null,
    anomalyScore:       0,
  });
  console.log(`⚓ Anchor ping at SLIIT → ${anchorTs.toISOString()} (3h ago)`);

  // Sort by time so history window makes sense when computing scores
  docs.sort((a, b) => a.timestamp - b.timestamp);

  // Compute realistic anomaly scores (all near-zero since same location/hours)
  for (let i = 0; i < docs.length; i++) {
    const hist = docs.slice(Math.max(0, i - 100), i); // last 100 pings as history
    docs[i].anomalyScore = hist.length >= 10
      ? parseFloat(computeScore(hist, docs[i]).toFixed(4))
      : 0;
  }

  // Insert pings
  const inserted = await DevicePing.insertMany(docs);
  console.log(`\n✅ Inserted ${inserted.length} pings`);

  const maxScore = Math.max(...inserted.map(p => p.anomalyScore));
  console.log(`   📊 Max anomaly score: ${maxScore.toFixed(4)} (all SLIIT → should be near 0)`);

  // Update device: ACTIVE + learningPhaseComplete + lastSeen = anchor ping (3h ago)
  const sortedInserted = [...inserted].sort((a,b) => a.timestamp - b.timestamp);
  const earliest = sortedInserted[0];
  const anchor   = sortedInserted[sortedInserted.length - 1]; // anchor is last (3h ago)
  await Device.updateOne(
    { _id: new mongoose.Types.ObjectId(DEVICE_ID) },
    {
      $set: {
        status:                'ACTIVE',
        learningPhaseComplete: true,
        learningStartDate:     earliest.timestamp,
        lastSeen:              anchor.timestamp,
        lastLocation:          { timestamp: anchor.timestamp },
      }
    }
  );
  console.log(`\n📱 Myphone updated:`);
  console.log(`   status              = ACTIVE`);
  console.log(`   learningPhaseComplete = true`);
  console.log(`   learningStartDate   = ${earliest.timestamp.toISOString()}`);
  console.log(`   lastSeen (anchor)   = ${anchor.timestamp.toISOString()}`);

  await mongoose.disconnect();
  console.log('\nDone.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
