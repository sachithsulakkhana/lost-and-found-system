/**
 * Remove duplicate device records.
 * Keeps the oldest device per (ownerId, deviceFingerprint) pair.
 * Devices with blank/missing fingerprint are skipped (can't be safely deduped).
 *
 * Usage:  node src/scripts/deduplicateDevices.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('../models/Device');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lost-and-found';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // Find all (ownerId, deviceFingerprint) groups with more than one record
  const dupes = await Device.aggregate([
    { $match: { deviceFingerprint: { $ne: '' } } },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: { ownerId: '$ownerId', deviceFingerprint: '$deviceFingerprint' },
        ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  if (dupes.length === 0) {
    console.log('No duplicates found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${dupes.length} duplicate group(s):`);

  let totalDeleted = 0;
  for (const group of dupes) {
    // ids are sorted by createdAt asc — keep first, delete the rest
    const [keep, ...remove] = group.ids;
    console.log(`  fingerprint=${group._id.deviceFingerprint}  keep=${keep}  deleting=${remove.length}`);
    await Device.deleteMany({ _id: { $in: remove } });
    totalDeleted += remove.length;
  }

  console.log(`Done. Deleted ${totalDeleted} duplicate device(s).`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
