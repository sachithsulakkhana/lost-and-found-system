require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Device = mongoose.model('Device', new mongoose.Schema({}, { collection: 'devices', strict: false }));
  const now = new Date();
  const cut = new Date(now - 5 * 60 * 1000);

  // Check all ACTIVE devices and their lastSeen
  const active = await Device.find({ status: 'ACTIVE' }, { name: 1, lastSeen: 1, offlineAlertSentAt: 1, alarmSuppressedUntil: 1, isDesignated: 1, deviceFingerprint: 1 });
  console.log('All ACTIVE devices:');
  active.forEach(d => {
    const ago = d.lastSeen ? Math.round((now - new Date(d.lastSeen)) / 60000) + ' min ago' : 'never';
    const shouldAlert = !d.lastSeen || new Date(d.lastSeen) < cut;
    console.log(` [${shouldAlert ? 'OFFLINE' : 'online '}] ${d.name} (${d.deviceFingerprint || 'no-fp'}) lastSeen: ${ago}`);
    if (d.offlineAlertSentAt) console.log('          offlineAlertSentAt:', d.offlineAlertSentAt);
    if (d.alarmSuppressedUntil) console.log('          suppressedUntil:', d.alarmSuppressedUntil);
  });

  const desig = await Device.find({ isDesignated: true }, { name: 1, deviceFingerprint: 1, ownerId: 1 });
  console.log('\nDesignated devices:', desig.map(d => d.name + ' ' + d.deviceFingerprint));
  await mongoose.disconnect();
}).catch(e => { console.error(e); process.exit(1); });
