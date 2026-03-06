// Clears offlineAlertSentAt for IPH-16D448 and IPH-58E475
// so they trigger the offline alert immediately after backend restart
require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Device = mongoose.model('Device', new mongoose.Schema({}, { collection: 'devices', strict: false }));
  const res = await Device.updateMany(
    { deviceFingerprint: { $in: ['IPH-16D448', 'iph-58e475-demo'] } },
    { $set: { offlineAlertSentAt: null, alarmSuppressedUntil: null } }
  );
  console.log('Reset offlineAlertSentAt for', res.modifiedCount, 'device(s)');
  await mongoose.disconnect();
}).catch(e => { console.error(e); process.exit(1); });
