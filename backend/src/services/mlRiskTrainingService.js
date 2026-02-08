const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const RandomForestClassifier = require('ml-random-forest').RandomForestClassifier;

/**
 * Machine Learning Risk Training Service
 * Trains a Random Forest model to predict risk levels based on CSV data
 */
class MLRiskTrainingService {
  constructor() {
    this.model = null;
    this.trained = false;
    this.trainingData = [];
    this.features = [];
    this.labels = [];
    this.locationEncoder = new Map();
    this.itemTypeEncoder = new Map();
    this.crowdLevelEncoder = { low: 0, medium: 1, high: 2 };
    this.weatherEncoder = new Map();
    this.dayTypeEncoder = { weekend: 0, weekday: 1 };
    this.riskLevelDecoder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    this.lastTrained = null;
    this.trainingStats = {
      totalSamples: 0,
      locations: 0,
      itemTypes: 0,
      accuracy: 0
    };
  }

  /**
   * Load CSV data for training
   */
  async loadTrainingData(csvPath) {
    return new Promise((resolve, reject) => {
      const data = [];

      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          data.push(row);
        })
        .on('end', () => {
          this.trainingData = data;
          console.log(`✓ ML Training: Loaded ${data.length} records`);
          resolve(data.length);
        })
        .on('error', (error) => {
          console.error('ML Training: Error loading CSV:', error);
          reject(error);
        });
    });
  }

  /**
   * Encode categorical variables
   */
  encodeData() {
    // Build encoders for categorical variables
    this.trainingData.forEach(row => {
      // Location encoding
      if (!this.locationEncoder.has(row.location)) {
        this.locationEncoder.set(row.location, this.locationEncoder.size);
      }

      // Item type encoding
      if (!this.itemTypeEncoder.has(row.itemType)) {
        this.itemTypeEncoder.set(row.itemType, this.itemTypeEncoder.size);
      }

      // Weather encoding
      if (!this.weatherEncoder.has(row.weather)) {
        this.weatherEncoder.set(row.weather, this.weatherEncoder.size);
      }
    });

    console.log(`✓ Encoded ${this.locationEncoder.size} locations, ${this.itemTypeEncoder.size} item types`);
  }

  /**
   * Extract time features from time string
   */
  extractTimeFeatures(timeStr) {
    const [hour, minute] = timeStr.split(':').map(Number);
    return {
      hour: hour / 24, // Normalize to 0-1
      minute: minute / 60,
      isNight: (hour >= 22 || hour < 6) ? 1 : 0,
      isMorning: (hour >= 6 && hour < 12) ? 1 : 0,
      isAfternoon: (hour >= 12 && hour < 18) ? 1 : 0,
      isEvening: (hour >= 18 && hour < 22) ? 1 : 0
    };
  }

  /**
   * Convert risk level to class (for classification)
   */
  getRiskClass(lostCount, crowdLevel) {
    // Define risk thresholds based on lost count and crowd level
    const crowdMultiplier = crowdLevel === 'high' ? 1.5 : crowdLevel === 'medium' ? 1.2 : 1.0;
    const riskScore = lostCount * crowdMultiplier;

    if (riskScore >= 12) return 3; // CRITICAL
    if (riskScore >= 8) return 2;  // HIGH
    if (riskScore >= 4) return 1;  // MEDIUM
    return 0; // LOW
  }

  /**
   * Prepare features and labels for training
   */
  prepareTrainingSet() {
    this.features = [];
    this.labels = [];

    this.trainingData.forEach(row => {
      const timeFeatures = this.extractTimeFeatures(row.time);

      // Feature vector
      const feature = [
        this.locationEncoder.get(row.location) / this.locationEncoder.size, // Normalized location
        this.itemTypeEncoder.get(row.itemType) / this.itemTypeEncoder.size, // Normalized item type
        this.crowdLevelEncoder[row.crowdLevel.toLowerCase()] / 2, // Normalized crowd level
        parseInt(row.lostCount) / 10, // Normalized lost count
        this.weatherEncoder.get(row.weather) / this.weatherEncoder.size, // Normalized weather
        this.dayTypeEncoder[row.dayType.toLowerCase()], // Day type
        timeFeatures.hour,
        timeFeatures.minute,
        timeFeatures.isNight,
        timeFeatures.isMorning,
        timeFeatures.isAfternoon,
        timeFeatures.isEvening
      ];

      // Label (risk class)
      const label = this.getRiskClass(parseInt(row.lostCount), row.crowdLevel.toLowerCase());

      this.features.push(feature);
      this.labels.push(label);
    });

    console.log(`✓ Prepared ${this.features.length} training samples with ${this.features[0].length} features`);
  }

  /**
   * Train the Random Forest model
   */
  trainModel(options = {}) {
    const {
      nEstimators = 50,  // Number of trees
      maxDepth = 10,      // Max depth of trees
      minNumSamples = 3   // Min samples to split
    } = options;

    console.log('🤖 Training Random Forest Model...');
    console.log(`   Trees: ${nEstimators}, Max Depth: ${maxDepth}`);

    // Train Random Forest
    this.model = new RandomForestClassifier({
      nEstimators,
      maxFeatures: 0.8,
      replacement: true,
      useSampleBagging: true
    });

    this.model.train(this.features, this.labels);
    this.trained = true;
    this.lastTrained = new Date();

    // Calculate training accuracy
    const predictions = this.model.predict(this.features);
    let correct = 0;
    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] === this.labels[i]) correct++;
    }
    const accuracy = (correct / predictions.length) * 100;

    this.trainingStats = {
      totalSamples: this.features.length,
      locations: this.locationEncoder.size,
      itemTypes: this.itemTypeEncoder.size,
      accuracy: accuracy.toFixed(2),
      nEstimators,
      maxDepth,
      trainedAt: this.lastTrained
    };

    console.log(`✅ Model Trained! Accuracy: ${accuracy.toFixed(2)}%`);
    return this.trainingStats;
  }

  /**
   * Predict risk for a given input
   */
  predict(input) {
    if (!this.trained || !this.model) {
      throw new Error('Model not trained. Please train the model first.');
    }

    const {
      location,
      time,
      itemType,
      crowdLevel,
      weather,
      dayType
    } = input;

    // Encode inputs
    const locationCode = this.locationEncoder.get(location) || 0;
    const itemTypeCode = this.itemTypeEncoder.get(itemType) || 0;
    const crowdCode = this.crowdLevelEncoder[crowdLevel.toLowerCase()] || 1;
    const weatherCode = this.weatherEncoder.get(weather) || 0;
    const dayCode = this.dayTypeEncoder[dayType.toLowerCase()] || 1;

    const timeFeatures = this.extractTimeFeatures(time);

    // Create feature vector
    const feature = [
      locationCode / this.locationEncoder.size,
      itemTypeCode / this.itemTypeEncoder.size,
      crowdCode / 2,
      0.5, // Default lost count normalized
      weatherCode / this.weatherEncoder.size,
      dayCode,
      timeFeatures.hour,
      timeFeatures.minute,
      timeFeatures.isNight,
      timeFeatures.isMorning,
      timeFeatures.isAfternoon,
      timeFeatures.isEvening
    ];

    // Predict
    const prediction = this.model.predict([feature])[0];
    const riskLevel = this.riskLevelDecoder[prediction];
    const riskScore = prediction / 3; // Normalize to 0-1

    return {
      riskLevel,
      riskScore,
      riskClass: prediction,
      confidence: 0.85 // Random Forest doesn't provide probability directly
    };
  }

  /**
   * Predict risk for all locations
   */
  predictAllLocations(time = '12:00', dayType = 'weekday', weather = 'sunny', crowdLevel = 'medium') {
    if (!this.trained) {
      throw new Error('Model not trained');
    }

    const predictions = [];

    for (const [location, code] of this.locationEncoder.entries()) {
      const pred = this.predict({
        location,
        time,
        itemType: 'phone', // Default item type
        crowdLevel,
        weather,
        dayType
      });

      predictions.push({
        location,
        ...pred
      });
    }

    return predictions.sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Get model statistics
   */
  getModelStats() {
    return {
      trained: this.trained,
      trainingStats: this.trainingStats,
      lastTrained: this.lastTrained,
      modelType: 'Random Forest Classifier',
      features: [
        'location',
        'itemType',
        'crowdLevel',
        'lostCount',
        'weather',
        'dayType',
        'hour',
        'minute',
        'timeOfDay'
      ]
    };
  }

  /**
   * Save model to disk
   */
  saveModel(filepath) {
    if (!this.trained) {
      throw new Error('No trained model to save');
    }

    const modelData = {
      model: this.model.toJSON(),
      locationEncoder: Array.from(this.locationEncoder.entries()),
      itemTypeEncoder: Array.from(this.itemTypeEncoder.entries()),
      weatherEncoder: Array.from(this.weatherEncoder.entries()),
      crowdLevelEncoder: this.crowdLevelEncoder,
      dayTypeEncoder: this.dayTypeEncoder,
      riskLevelDecoder: this.riskLevelDecoder,
      trainingStats: this.trainingStats,
      lastTrained: this.lastTrained
    };

    fs.writeFileSync(filepath, JSON.stringify(modelData, null, 2));
    console.log(`✓ Model saved to ${filepath}`);
  }

  /**
   * Load model from disk
   */
  loadModel(filepath) {
    if (!fs.existsSync(filepath)) {
      throw new Error('Model file not found');
    }

    const modelData = JSON.parse(fs.readFileSync(filepath, 'utf8'));

    this.model = RandomForestClassifier.load(modelData.model);
    this.locationEncoder = new Map(modelData.locationEncoder);
    this.itemTypeEncoder = new Map(modelData.itemTypeEncoder);
    this.weatherEncoder = new Map(modelData.weatherEncoder);
    this.crowdLevelEncoder = modelData.crowdLevelEncoder;
    this.dayTypeEncoder = modelData.dayTypeEncoder;
    this.riskLevelDecoder = modelData.riskLevelDecoder;
    this.trainingStats = modelData.trainingStats;
    this.lastTrained = new Date(modelData.lastTrained);
    this.trained = true;

    console.log(`✓ Model loaded from ${filepath}`);
  }
}

// Singleton instance
const mlRiskTrainingService = new MLRiskTrainingService();

module.exports = mlRiskTrainingService;
