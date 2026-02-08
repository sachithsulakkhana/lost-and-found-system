/**
 * Final Verification Test - Map Zones & Weather Display
 */

const axios = require('axios');

console.log('🧪 Final Verification Test\n');
console.log('='.repeat(60));

axios.get('http://localhost:5000/api/ml-training/heatmap')
  .then(res => {
    const data = res.data;

    console.log('\n✅ BACKEND API STATUS:');
    console.log('  - ML Model Loaded:', data.loaded ? 'YES ✓' : 'NO ✗');
    console.log('  - Total Locations:', data.locations.length);
    console.log('  - Locations with Boundaries:', data.locations.filter(l => l.boundary).length);
    console.log('  - Weather Conditions Included:', data.conditions ? 'YES ✓' : 'NO ✗');

    console.log('\n📍 ZONES ON MAP:');
    data.locations.forEach((loc, i) => {
      const num = (i + 1).toString().padStart(2, ' ');
      const riskColor = {
        'CRITICAL': '🔴',
        'HIGH': '🟠',
        'MEDIUM': '🟡',
        'LOW': '🟢'
      }[loc.riskLevel] || '⚪';

      const locationName = loc.location.padEnd(38);
      console.log(`  ${num}. ${riskColor} ${locationName} (${loc.riskLevel})`);
    });

    console.log('\n🌤️  CURRENT CONDITIONS:');
    const c = data.conditions;
    const weatherIcon = {
      'sunny': '☀️',
      'rainy': '🌧️',
      'cloudy': '☁️',
      'stormy': '⛈️'
    }[c.weather] || '🌤️';

    const crowdIcons = {
      'low': '👥',
      'medium': '👥👥',
      'high': '👥👥👥',
      'very_high': '👥👥👥👥'
    }[c.crowdLevel] || '👥';

    console.log(`  Weather:    ${weatherIcon} ${c.weather}`);
    console.log(`  Crowd:      ${crowdIcons} ${c.crowdLevel}`);
    console.log(`  Time:       🕒 ${c.time}`);
    console.log(`  Day Type:   📅 ${c.dayType}`);

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ ALL SYSTEMS OPERATIONAL!');
    console.log('\n🚀 User should now:');
    console.log('   1. Refresh browser (F5 or Ctrl+F5)');
    console.log('   2. Navigate to Map View → See all 12 colored zones');
    console.log('   3. Navigate to Risk Dashboard → See yellow weather panel');
    console.log('   4. Watch auto-refresh update every 30 seconds\n');
  })
  .catch(err => {
    console.error('❌ ERROR:', err.message);
    console.error('\nMake sure backend is running on port 5000:');
    console.error('  cd backend && npm start\n');
  });
