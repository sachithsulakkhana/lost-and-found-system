/**
 * Test Weather Service
 */

const weatherService = require('./src/services/weatherService');

async function test() {
  console.log('🧪 Testing Weather Service...\n');

  // Test weather detection
  const weather = await weatherService.getCurrentWeather();
  console.log('🌤️  Current Weather:', weather);

  // Test crowd estimation
  const crowd = weatherService.getCurrentCrowdLevel();
  console.log('👥 Current Crowd Level:', crowd);

  // Test detailed conditions
  const conditions = await weatherService.getDetailedConditions();
  console.log('\n📊 Detailed Conditions:');
  console.log(JSON.stringify(conditions, null, 2));

  console.log('\n✅ Weather service working correctly!');
  console.log('\n💡 These conditions will be used for ML predictions:');
  console.log(`   - If it's ${weather} weather → Risk ${weather === 'rainy' || weather === 'stormy' ? 'increases' : 'stays normal'}`);
  console.log(`   - With ${crowd} crowd → ${crowd === 'very_high' || crowd === 'high' ? 'Higher risk' : 'Lower risk'}`);
}

test().catch(console.error);
