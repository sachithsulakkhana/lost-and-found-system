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
  async predict(location, crowdLevel, timeOfDay, weather = 'Sunny', dayType = 'Weekday', itemType = 'phone') {
    try {
      const response = await axios.post(`${this.baseURL}/api/predict`, {
        location,
        crowd_level: crowdLevel,
        time_of_day: timeOfDay,
        weather,
        day_type: dayType,
        item_type: itemType,
        lost_count: 5
      }, {
        timeout: 5000
      });

      const data = response.data;

      // Convert to format expected by frontend
      // For XGBoost (single model), we use the risk_level as both RF and NN prediction
      const riskPercentage = this.getRiskPercentage(data.risk_category, data.confidence);

      return {
        location,
        riskLevel: this.mapRiskCategory(data.risk_category),
        riskScore: riskPercentage, // Use percentage as risk score
        confidence: data.confidence,
        probability: riskPercentage / 100,
        rfPrediction: riskPercentage, // Use XGBoost prediction as RF equivalent
        nnPrediction: riskPercentage, // Use XGBoost prediction as NN equivalent
        ensemblePrediction: riskPercentage, // XGBoost is the ensemble
        modelType: data.model_info?.model_type || 'Python XGBoost',
        timestamp: data.timestamp
      };
    } catch (error) {
      console.error(`ML prediction failed for ${location}:`, error.message);

      // Return fallback prediction
      return {
        location,
        riskLevel: 'MEDIUM',
        riskScore: 0.5,
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
   * Map Python risk category to legacy format
   */
  mapRiskCategory(category) {
    if (category === 'No Incident') return 'LOW';
    if (category === 'Incident Expected') return 'HIGH';
    if (category === 'Low') return 'LOW';
    if (category === 'High') return 'HIGH';
    return 'MEDIUM';
  }

  /**
   * Get risk percentage from category and confidence
   */
  getRiskPercentage(category, confidence) {
    // Return the confidence score as percentage
    if (category === 'Low' || category === 'No Incident') {
      return Math.max(confidence.Low || 0, 1 - (confidence.High || 0)) * 100;
    } else if (category === 'High' || category === 'Incident Expected') {
      return Math.max(confidence.High || 0, confidence.Medium || 0, confidence.Low || 0) * 100;
    } else {
      return Math.max(confidence.Medium || 0, confidence.High || 0, confidence.Low || 0) * 100;
    }
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
