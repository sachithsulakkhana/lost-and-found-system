/**
 * Device Monitoring Simulator
 * Simulates device activity pings for testing the ML anomaly detection system
 *
 * Usage: node src/scripts/deviceMonitoringSimulator.js <deviceId> <userId> <token>
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5000/api';

class DeviceSimulator {
  constructor(deviceId, userId, token) {
    this.deviceId = deviceId;
    this.userId = userId;
    this.token = token;
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Simulate normal behavior pattern
   */
  generateNormalActivity() {
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();

    // Typical student pattern: active 8AM-6PM on weekdays
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWorkingHours = hour >= 8 && hour <= 18;

    const zones = [
      '507f1f77bcf86cd799439011', // Library
      '507f1f77bcf86cd799439012', // Cafeteria
      '507f1f77bcf86cd799439013'  // Lab
    ];

    return {
      deviceId: this.deviceId,
      status: isWeekday && isWorkingHours ? 'ONLINE' : 'OFFLINE',
      zoneId: isWeekday && isWorkingHours ? zones[Math.floor(Math.random() * zones.length)] : null,
      networkInfo: {
        ssid: 'SLIIT-WiFi',
        signalStrength: 70 + Math.random() * 20
      },
      location: {
        lat: 6.9147 + (Math.random() - 0.5) * 0.001,
        lng: 79.9729 + (Math.random() - 0.5) * 0.001
      }
    };
  }

  /**
   * Simulate anomalous behavior
   */
  generateAnomalousActivity() {
    return {
      deviceId: this.deviceId,
      status: 'ONLINE',
      zoneId: '507f1f77bcf86cd799439099', // Unusual zone
      networkInfo: {
        ssid: 'Unknown-Network',
        signalStrength: 30 + Math.random() * 20
      },
      location: {
        lat: 6.9147 + (Math.random() - 0.5) * 0.1, // Far from campus
        lng: 79.9729 + (Math.random() - 0.5) * 0.1
      }
    };
  }

  /**
   * Send activity ping to server
   */
  async sendPing(activity) {
    try {
      const response = await this.api.post('/monitoring/ping', activity);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Run continuous simulation
   */
  async run(options = {}) {
    const {
      interval = 60000, // 1 minute
      anomalyProbability = 0.05, // 5% chance of anomaly
      duration = 60 * 60 * 1000 // 1 hour
    } = options;

    console.log('🚀 Starting device monitoring simulator');
    console.log(`Device ID: ${this.deviceId}`);
    console.log(`Interval: ${interval}ms`);
    console.log(`Anomaly Probability: ${anomalyProbability * 100}%`);

    const startTime = Date.now();
    let count = 0;
    let anomalyCount = 0;

    const intervalId = setInterval(async () => {
      try {
        // Decide if this is an anomaly
        const isAnomaly = Math.random() < anomalyProbability;

        // Generate activity
        const activity = isAnomaly
          ? this.generateAnomalousActivity()
          : this.generateNormalActivity();

        // Send ping
        const result = await this.sendPing(activity);

        count++;
        if (isAnomaly) anomalyCount++;

        // Log result
        if (result.anomalyDetected) {
          console.log(`🚨 [${count}] ANOMALY DETECTED! Score: ${(result.anomalyScore * 100).toFixed(1)}%`);
        } else if (result.learningPhase) {
          console.log(`📚 [${count}] Learning phase - training data collected`);
        } else {
          console.log(`✅ [${count}] Normal activity - Score: ${(result.anomalyScore * 100).toFixed(1)}%`);
        }

        // Check duration
        if (Date.now() - startTime >= duration) {
          clearInterval(intervalId);
          console.log('\n📊 Simulation Complete');
          console.log(`Total pings: ${count}`);
          console.log(`Anomalies injected: ${anomalyCount}`);
          process.exit(0);
        }
      } catch (error) {
        console.error(`❌ Error:`, error.message);
      }
    }, interval);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n⏹️  Stopping simulator...');
      clearInterval(intervalId);
      console.log(`Total pings: ${count}`);
      console.log(`Anomalies injected: ${anomalyCount}`);
      process.exit(0);
    });
  }

  /**
   * Generate bulk training data
   */
  async generateTrainingData(count = 50) {
    console.log(`📚 Generating ${count} training data points...`);

    for (let i = 0; i < count; i++) {
      try {
        const activity = this.generateNormalActivity();
        await this.sendPing(activity);
        console.log(`✅ [${i + 1}/${count}] Training data sent`);

        // Small delay to avoid overwhelming server
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Error at ${i + 1}:`, error.message);
      }
    }

    console.log('✅ Training data generation complete');
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: node deviceMonitoringSimulator.js <deviceId> <userId> <token> [mode]');
    console.log('');
    console.log('Modes:');
    console.log('  train     - Generate 50 training data points');
    console.log('  simulate  - Run continuous simulation (default)');
    console.log('');
    console.log('Example:');
    console.log('  node deviceMonitoringSimulator.js 507f1f77bcf86cd799439011 507f191e810c19729de860ea YOUR_JWT_TOKEN train');
    process.exit(1);
  }

  const [deviceId, userId, token, mode = 'simulate'] = args;

  const simulator = new DeviceSimulator(deviceId, userId, token);

  if (mode === 'train') {
    simulator.generateTrainingData(50);
  } else {
    simulator.run({
      interval: 10000, // 10 seconds for testing
      anomalyProbability: 0.1, // 10% for testing
      duration: 10 * 60 * 1000 // 10 minutes
    });
  }
}

module.exports = DeviceSimulator;
