/**
 * Seed 1000 fake pings across campus zones for demo purposes.
 *
 * Usage:  node src/scripts/seedPings.js
 *
 * Requires MONGODB_URI in .env (or falls back to the default in config/env).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Zone = require('../models/Zone');
const Device = require('../models/Device');
const DevicePing = require('../models/DevicePing');

const TOTAL_PINGS = 1000;

// Jitter: random offset within a zone's radius (in degrees, approx)
function jitter(center, radiusMeters) {
  const r = radiusMeters / 111000; // rough meters-to-degrees
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.random() * r;
  return {
    lat: center.lat + dist * Math.cos(angle),
    lng: center.lng + dist * Math.sin(angle)
  };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // 1) Fetch zones
  const zones = await Zone.find({ isActive: true });
  if (zones.length === 0) {
    console.error('No active zones found. Create zones first via Admin panel.');
    process.exit(1);
  }
  console.log(`Found ${zones.length} active zones`);

  // 2) Fetch a device to attach pings to
  let device = await Device.findOne();
  if (!device) {
    console.log('No device found — creating a demo device...');
    const User = require('../models/User');
    let user = await User.findOne();
    if (!user) {
      console.error('No users in DB. Register at least one user first.');
      process.exit(1);
    }
    device = await Device.create({
      ownerId: user._id,
      name: 'Demo Phone',
      identifier: 'demo-phone-001',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      deviceType: 'mobile',
      manufacturer: 'Samsung',
      model: 'Galaxy S24',
      status: 'ACTIVE',
      learningStartDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
    });
    console.log('Demo device created:', device._id);
  }
  console.log(`Using device: ${device.name} (${device._id})`);

  // 3) Generate 1000 pings spread over the last 7 days
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const pings = [];

  for (let i = 0; i < TOTAL_PINGS; i++) {
    // Pick a random zone (weighted: some zones get more traffic)
    const zone = zones[randomInt(0, zones.length - 1)];
    const loc = jitter(zone.center, zone.radius || 50);

    // Spread timestamps over last 7 days
    const ts = new Date(now - Math.random() * sevenDaysMs);
    const hour = ts.getHours();
    const day = dayNames[ts.getDay()];

    // Simulate realistic speeds (0-3 m/s walking)
    const speed = Math.random() * 3;

    pings.push({
      deviceId: device._id,
      timestamp: ts,
      source: 'simulator',
      location: { lat: loc.lat, lng: loc.lng },
      accuracy: randomInt(3, 25),
      zoneId: zone._id,
      speed: parseFloat(speed.toFixed(2)),
      hourOfDay: hour,
      dayOfWeek: day,
      isWithinPreference: Math.random() > 0.3,
      wasClosedZone: false,
      anomalyScore: parseFloat((Math.random() * 0.4).toFixed(3)),
      valid: true,
      rejectReason: null
    });
  }

  // 4) Bulk insert
  await DevicePing.insertMany(pings);
  console.log(`\n✅ Successfully inserted ${TOTAL_PINGS} demo pings across ${zones.length} zones!`);

  // Print summary per zone
  const summary = {};
  pings.forEach(p => {
    const zId = p.zoneId.toString();
    summary[zId] = (summary[zId] || 0) + 1;
  });
  for (const zone of zones) {
    const count = summary[zone._id.toString()] || 0;
    console.log(`  ${zone.name}: ${count} pings`);
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
