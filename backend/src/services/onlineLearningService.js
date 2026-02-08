const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

/**
 * Report a lost item to the ML service for online learning
 * This automatically updates the model with new data
 */
async function reportLostItemToML(itemData) {
  try {
    const report = {
      location: itemData.location || 'Unknown',
      itemType: itemData.itemType || 'Other',
      crowdLevel: itemData.crowdLevel || 'Medium',
      weather: itemData.weather || 'Sunny',
      dayType: itemData.dayType || (new Date().getDay() >= 1 && new Date().getDay() <= 5 ? 'Weekday' : 'Weekend'),
      time: itemData.time || new Date().toTimeString().slice(0, 5),
      lostCount: itemData.lostCount || 5,
      incident_occurred: 1, // Lost item = incident
      timestamp: itemData.timestamp || new Date().toISOString()
    };

    console.log(`📤 Reporting lost item to ML service: ${report.location} - ${report.itemType}`);

    const response = await axios.post(
      `${ML_SERVICE_URL}/api/online-learning/report-lost-item`,
      report,
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      console.log(`✅ Lost item reported successfully`);
      console.log(`   Buffer size: ${response.data.buffer_status.buffer_size}/${response.data.buffer_status.retrain_threshold}`);

      if (response.data.retrain_triggered) {
        console.log(`🔄 Model retraining was triggered!`);
        if (response.data.retrain_result && response.data.retrain_result.success) {
          console.log(`   ✅ New model version: ${response.data.retrain_result.version}`);
          console.log(`   📊 New accuracy: ${(response.data.retrain_result.metrics.accuracy * 100).toFixed(2)}%`);
        }
      }
    }

    return response.data;
  } catch (error) {
    console.error('❌ Error reporting to ML service:', error.message);
    // Don't fail the main operation if ML reporting fails
    return null;
  }
}

/**
 * Report a found item to the ML service
 * This helps the model understand resolution patterns
 */
async function reportFoundItemToML(itemData) {
  try {
    const report = {
      location: itemData.location || 'Unknown',
      itemType: itemData.itemType || 'Other',
      crowdLevel: itemData.crowdLevel || 'Medium',
      weather: itemData.weather || 'Sunny',
      dayType: itemData.dayType || (new Date().getDay() >= 1 && new Date().getDay() <= 5 ? 'Weekday' : 'Weekend'),
      time: itemData.time || new Date().toTimeString().slice(0, 5),
      lostCount: itemData.lostCount || 5,
      incident_occurred: 0, // Found item = resolved incident
      timestamp: itemData.timestamp || new Date().toISOString()
    };

    console.log(`📥 Reporting found item to ML service: ${report.location} - ${report.itemType}`);

    const response = await axios.post(
      `${ML_SERVICE_URL}/api/online-learning/report-lost-item`,
      report,
      {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      console.log(`✅ Found item reported successfully`);
    }

    return response.data;
  } catch (error) {
    console.error('❌ Error reporting found item to ML service:', error.message);
    return null;
  }
}

/**
 * Get current buffer status from ML service
 */
async function getBufferStatus() {
  try {
    const response = await axios.get(
      `${ML_SERVICE_URL}/api/online-learning/buffer-status`,
      { timeout: 3000 }
    );
    return response.data;
  } catch (error) {
    console.error('❌ Error getting buffer status:', error.message);
    return null;
  }
}

/**
 * Manually trigger model retraining
 */
async function triggerRetraining() {
  try {
    console.log('🔄 Manually triggering model retraining...');

    const response = await axios.post(
      `${ML_SERVICE_URL}/api/online-learning/trigger-retraining`,
      {},
      { timeout: 300000 } // 5 minutes timeout for retraining
    );

    if (response.data.success) {
      console.log(`✅ Model retrained successfully!`);
      console.log(`   Version: ${response.data.version}`);
      console.log(`   New samples: ${response.data.new_samples_added}`);
      console.log(`   Total samples: ${response.data.total_samples}`);
      console.log(`   Accuracy: ${(response.data.metrics.accuracy * 100).toFixed(2)}%`);
    }

    return response.data;
  } catch (error) {
    console.error('❌ Error triggering retraining:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get model version history
 */
async function getModelVersions() {
  try {
    const response = await axios.get(
      `${ML_SERVICE_URL}/api/online-learning/versions`,
      { timeout: 3000 }
    );
    return response.data;
  } catch (error) {
    console.error('❌ Error getting model versions:', error.message);
    return null;
  }
}

module.exports = {
  reportLostItemToML,
  reportFoundItemToML,
  getBufferStatus,
  triggerRetraining,
  getModelVersions
};
