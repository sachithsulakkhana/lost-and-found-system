/**
 * Python ML Service Integration
 * Calls the FastAPI Python ML service for predictions
 */

const axios = require('axios');

// Python ML Service URL
const PYTHON_ML_URL = process.env.PYTHON_ML_URL || 'http://localhost:5001';

class PythonMLService {
  constructor() {
    this.baseURL = PYTHON_ML_URL;
    this.isAvailable = false;
    this.checkHealth();
  }

  /**
   * Check if Python ML service is available
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.baseURL}/health`, { timeout: 3000 });
      this.isAvailable = response.data.model_loaded === true;
      if (this.isAvailable) {
        console.log('✅ Python ML Service is available and model is loaded');
      } else {
        console.log('⚠️ Python ML Service is running but model not loaded');
      }
      return this.isAvailable;
    } catch (error) {
      this.isAvailable = false;
      console.log('⚠️ Python ML Service not available:', error.message);
      return false;
    }
  }

  /**
   * Get prediction for a single location
   */
  // Expected daily record count per zone (matches training data distribution).
  // Used as `incidents_last_24h` proxy so the model receives realistic context.
  static zoneDailyRate(location) {
    const rates = {
      'P and S Cafeteria': 10,
      'Anohana Canteen': 7,
      'Bird Nest Canteen': 7,
      'Basement Canteen': 4,
      'New Building Canteen': 4,
      'Juice Bar': 3,
      'Library': 6,
      'Old Library Space': 4,
      'Bird Nest Study Area': 4,
      'Business Faculty Study Area': 3,
      'Study Area 4th Floor New Building': 3,
      '3rd Floor Study Area': 3,
      'Library outdoor Space storage': 2,
      'New Building Bio Laboratory outside space Storage Cabins': 2,
      'Main building 4th floor B401 Laboratory outside space Storage Cabins': 2,
      'Main Building 5th floor outside space Storage Cabin': 2,
    };
    return rates[location] ?? 4;
  }

  async predict(location, crowdLevel, timeOfDay, weather = 'Sunny', dayType = 'Weekday', itemType = 'phone') {
    try {
      const response = await axios.post(`${this.baseURL}/api/predict`, {
        location,
        crowd_level: crowdLevel,
        time_of_day: timeOfDay,
        weather,
        day_type: dayType,
        item_type: itemType,
        lost_count: PythonMLService.zoneDailyRate(location)
      }, {
        timeout: 5000
      });

      const data = response.data;

      // Extract the incident probability from the confidence object.
      // FastAPI returns: {"No Incident": 0.95, "Incident": 0.05}
      // Flask returns:   {"Low": 0.70, "Medium": 0.20, "High": 0.10}
      let incidentProb = 0;
      const conf = data.confidence || {};
      if ('Incident' in conf) {
        // FastAPI binary format
        incidentProb = conf['Incident'];
      } else if ('Incident Expected' in conf) {
        incidentProb = conf['Incident Expected'];
      } else if ('Low' in conf || 'Medium' in conf || 'High' in conf) {
        // Flask 3-class format: risk = P(Medium) + P(High)
        // (only the predicted category has a non-zero value in Flask's response)
        incidentProb = (conf['High'] || 0) + (conf['Medium'] || 0);
      } else if (typeof data.probability === 'number') {
        incidentProb = data.probability;
      }
      const riskPercentage = Math.round(incidentProb * 10000) / 100;

      return {
        location,
        riskLevel: this.mapRiskByProbability(incidentProb),
        riskScore: riskPercentage,
        confidence: data.confidence,
        probability: incidentProb,
        rfPrediction: riskPercentage,
        nnPrediction: riskPercentage,
        ensemblePrediction: riskPercentage,
        modelType: data.model_info?.model_type || 'Python XGBoost',
        timestamp: data.timestamp
      };
    } catch (error) {
      console.error(`ML prediction failed for ${location}:`, error.message);

      // Return fallback prediction
      return {
        location,
        riskLevel: 'MEDIUM',
        riskScore: 50,
        confidence: { 'No Incident': 0.5, 'Incident': 0.5 },
        probability: 0.5,
        modelType: 'Fallback',
        error: error.message
      };
    }
  }

  /**
   * Get predictions for all locations
   */
  async predictAllLocations(locations, timeOfDay, dayType, weather, crowdLevel) {
    // Check if service is available
    if (!this.isAvailable) {
      await this.checkHealth();
    }

    // Make predictions for each location
    const predictions = await Promise.all(
      locations.map(location =>
        this.predict(location, crowdLevel, timeOfDay, weather, dayType)
      )
    );

    return predictions;
  }

  /**
   * Get model information
   */
  async getModelInfo() {
    try {
      const response = await axios.get(`${this.baseURL}/api/model/info`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.error('Failed to get model info:', error.message);
      return null;
    }
  }

  /**
   * Get feature importance
   */
  async getFeatureImportance() {
    try {
      const response = await axios.get(`${this.baseURL}/api/model/feature-importance`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.error('Failed to get feature importance:', error.message);
      return null;
    }
  }

  /**
   * Map incident probability to 4-level risk classification
   * Thresholds tuned for a binary classifier (probability of incident occurring)
   */
  mapRiskByProbability(prob) {
    if (prob >= 0.70) return 'CRITICAL';
    if (prob >= 0.50) return 'HIGH';
    if (prob >= 0.30) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Map legacy risk level to probability
   */
  mapRiskToScore(riskLevel) {
    const map = {
      'LOW': 0.2,
      'MEDIUM': 0.5,
      'HIGH': 0.8,
      'CRITICAL': 0.95
    };
    return map[riskLevel] || 0.5;
  }
}

// Export singleton instance
module.exports = new PythonMLService();
