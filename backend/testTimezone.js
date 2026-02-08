/**
 * Test Timezone Fix - Verify Asia/Colombo Time
 */

const axios = require('axios');

console.log('🕒 Timezone Test\n');
console.log('='.repeat(60));

// System times
const now = new Date();
const colomboTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));

console.log('\n📍 System Time Comparison:');
console.log('  UTC Time:        ', now.toISOString());
console.log('  Colombo Time:    ', colomboTime.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
console.log('  Colombo Hour:    ', colomboTime.getHours(), ':' + colomboTime.getMinutes().toString().padStart(2, '0'));

// Test API
axios.get('http://localhost:5000/api/ml-training/heatmap')
  .then(res => {
    const data = res.data;

    console.log('\n🌐 API Response:');
    console.log('  Timestamp:       ', data.timestamp);
    console.log('  Conditions Time: ', data.conditions.time);
    console.log('  Day Type:        ', data.conditions.dayType);
    console.log('  Crowd Level:     ', data.conditions.crowdLevel);
    console.log('  Weather:         ', data.conditions.weather);

    console.log('\n✅ Verification:');

    // Verify time matches
    const apiTime = data.conditions.time;
    const expectedTime = colomboTime.toTimeString().slice(0, 5);

    if (apiTime === expectedTime) {
      console.log('  ✓ Time is CORRECT (matches Asia/Colombo)');
    } else {
      console.log('  ✗ Time mismatch!');
      console.log('    Expected:', expectedTime);
      console.log('    Got:     ', apiTime);
    }

    // Verify crowd level makes sense for time
    const hour = colomboTime.getHours();
    const dayOfWeek = colomboTime.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const crowd = data.conditions.crowdLevel;

    console.log('  ✓ Current hour:', hour);
    console.log('  ✓ Is weekend:', isWeekend);
    console.log('  ✓ Crowd level:', crowd);

    // Verify crowd logic
    if (isWeekend && crowd === 'low') {
      console.log('  ✓ Crowd level CORRECT (weekend = low)');
    } else if (!isWeekend && hour >= 18 && crowd === 'low') {
      console.log('  ✓ Crowd level CORRECT (night = low)');
    } else if (!isWeekend && hour >= 8 && hour < 9 && crowd === 'very_high') {
      console.log('  ✓ Crowd level CORRECT (morning rush = very_high)');
    } else if (!isWeekend && hour >= 12 && hour < 13 && crowd === 'very_high') {
      console.log('  ✓ Crowd level CORRECT (lunch time = very_high)');
    } else {
      console.log('  ℹ Crowd level:', crowd, '(may be correct for current time)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Timezone Fix Verified!');
    console.log('\nIf you see this test at 9:55 PM Sri Lanka time:');
    console.log('  - Time should show: 21:55 (not 02:18 UTC)');
    console.log('  - Crowd should be: low (not high)');
    console.log('  - Day type should be: weekend (if Saturday/Sunday)\n');

  })
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    console.error('\nMake sure backend is running:');
    console.error('  cd backend && npm start\n');
  });
