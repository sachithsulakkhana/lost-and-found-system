# Real-Time Online Learning System

## Overview

This system implements **real-time incremental learning** for the Lost & Found ML model. As users report lost items with their locations and times, the system automatically collects this data, updates the training dataset, and retrains the model to continuously improve predictions.

## Key Features

### 1. Data Collection Buffer
- Collects new lost item reports in real-time
- Stores them in a buffer file (`ml-service/data/buffer/new_samples.csv`)
- Thread-safe operations for concurrent data collection

### 2. Automatic Retraining
The model automatically retrains when:
- **Buffer threshold is reached**: Default is 50 new samples
- **Time interval passes**: Default is every 24 hours
- **Manual trigger**: Via API endpoint

### 3. Model Versioning
- Tracks all model versions with timestamps
- Stores performance metrics for each version
- Maintains history of improvements over time

### 4. Continuous Learning
- Merges new data with historical training data
- Preserves all previous data while adding new samples
- Removes duplicates to maintain data quality

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   USER REPORTS                           │
│          (Lost items with location & time)               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│          POST /api/online-learning/report-lost-item     │
│                  (FastAPI Endpoint)                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              OnlineLearningBuffer                        │
│          Stores new samples in buffer                    │
│     (ml-service/data/buffer/new_samples.csv)            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│             Automatic Check (Scheduler)                  │
│   • Check buffer size >= threshold (50 samples)         │
│   • Check time since last training (24 hours)           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓ (If conditions met)
┌─────────────────────────────────────────────────────────┐
│              OnlineModelUpdater                          │
│   1. Merge buffer data with historical data             │
│   2. Run complete training pipeline                      │
│   3. Save new model version                              │
│   4. Clear buffer                                        │
│   5. Reload model in production                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              Updated Model in Production                 │
│        Ready for new predictions with improved           │
│           accuracy based on recent data                  │
└─────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Report Lost Item
Submit a new lost item report to the training buffer.

```http
POST /api/online-learning/report-lost-item
Content-Type: application/json

{
  "location": "Library",
  "itemType": "phone",
  "crowdLevel": "High",
  "weather": "Sunny",
  "dayType": "Weekday",
  "time": "14:30",
  "lostCount": 5,
  "incident_occurred": 1,
  "timestamp": "2024-01-09T14:30:00"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Lost item report received and added to training buffer",
  "report": {...},
  "buffer_status": {
    "buffer_size": 15,
    "retrain_threshold": 50,
    "will_retrain_soon": false
  },
  "retrain_triggered": false,
  "timestamp": "2024-01-09T14:30:05"
}
```

### 2. Trigger Manual Retraining
Manually trigger model retraining regardless of buffer size or time.

```http
POST /api/online-learning/trigger-retraining
```

**Response:**
```json
{
  "success": true,
  "version": 2,
  "new_samples_added": 45,
  "total_samples": 1045,
  "metrics": {
    "model_name": "XGBoost",
    "accuracy": 0.89,
    "precision": 0.85,
    "recall": 0.82,
    "f1_score": 0.83,
    "roc_auc": 0.91
  },
  "timestamp": "2024-01-09T15:00:00"
}
```

### 3. Get Buffer Status
Check current buffer status and retraining readiness.

```http
GET /api/online-learning/buffer-status
```

**Response:**
```json
{
  "buffer_size": 45,
  "retrain_threshold": 50,
  "should_retrain": false,
  "latest_version": {
    "version": 1,
    "timestamp": "2024-01-08T10:00:00",
    "metrics": {...},
    "training_samples": 1000,
    "new_samples_added": 0
  },
  "total_versions": 1
}
```

### 4. Get Model Versions
View all model versions and their performance history.

```http
GET /api/online-learning/versions
```

**Response:**
```json
{
  "total_versions": 3,
  "versions": [
    {
      "version": 1,
      "timestamp": "2024-01-08T10:00:00",
      "metrics": {
        "accuracy": 0.85,
        "f1_score": 0.78
      },
      "training_samples": 1000,
      "new_samples_added": 0
    },
    {
      "version": 2,
      "timestamp": "2024-01-09T15:00:00",
      "metrics": {
        "accuracy": 0.89,
        "f1_score": 0.83
      },
      "training_samples": 1045,
      "new_samples_added": 45
    }
  ],
  "latest_version": {...}
}
```

### 5. Get Online Learning Info
Get configuration and capabilities of the online learning system.

```http
GET /api/online-learning/info
```

**Response:**
```json
{
  "available": true,
  "retrain_threshold": 50,
  "auto_retrain_interval_hours": 24,
  "description": "Real-time online learning system that continuously updates the model with new lost item reports",
  "features": [
    "Automatic retraining when buffer reaches threshold",
    "Time-based automatic retraining",
    "Model versioning and tracking",
    "Performance metrics for each version",
    "Incremental learning with historical data preservation"
  ]
}
```

### 6. Get Scheduler Status
Check the status of the automatic retraining scheduler.

```http
GET /api/online-learning/scheduler-status
```

**Response:**
```json
{
  "available": true,
  "scheduler": {
    "is_running": true,
    "check_interval_minutes": 60,
    "last_check": "2024-01-09T14:00:00",
    "last_retrain": "2024-01-09T10:00:00"
  }
}
```

## Configuration

### Environment Variables

You can customize the online learning behavior by modifying constants in `online_learning.py`:

```python
# Retrain after collecting this many new samples
RETRAIN_THRESHOLD = 50

# Auto-retrain every N hours regardless of buffer size
AUTO_RETRAIN_INTERVAL_HOURS = 24
```

### Scheduler Configuration

Modify the scheduler check interval in `main.py`:

```python
# Check every hour for retraining needs
start_scheduler(check_interval_minutes=60)
```

## File Structure

```
ml-service/
├── online_learning.py          # Core online learning logic
├── scheduler.py                # Automatic retraining scheduler
├── main.py                     # FastAPI app with endpoints
├── train.py                    # Training pipeline
├── models/
│   ├── risk_model.pkl         # Current model
│   ├── model_metrics.json     # Current metrics
│   └── model_version.json     # Version history
└── data/
    ├── training_data.csv      # Main training dataset
    ├── historical_training_data.csv  # Backup
    └── buffer/
        └── new_samples.csv    # New samples buffer
```

## Usage Examples

### Example 1: User Reports Lost Phone

When a user reports a lost phone:

```python
import requests

# User report
report = {
    "location": "Cafeteria",
    "itemType": "phone",
    "crowdLevel": "High",
    "weather": "Rainy",
    "dayType": "Weekday",
    "time": "12:30",
    "lostCount": 8,
    "incident_occurred": 1
}

# Submit to system
response = requests.post(
    "http://localhost:5001/api/online-learning/report-lost-item",
    json=report
)

print(response.json())
```

### Example 2: Check if Model Needs Updating

```python
import requests

# Check buffer status
response = requests.get(
    "http://localhost:5001/api/online-learning/buffer-status"
)

status = response.json()
print(f"Buffer size: {status['buffer_size']}")
print(f"Should retrain: {status['should_retrain']}")
```

### Example 3: Manually Trigger Retraining

```python
import requests

# Trigger retraining
response = requests.post(
    "http://localhost:5001/api/online-learning/trigger-retraining"
)

result = response.json()
if result['success']:
    print(f"✅ Model retrained!")
    print(f"Version: {result['version']}")
    print(f"New accuracy: {result['metrics']['accuracy']:.2%}")
```

### Example 4: View Model Improvement Over Time

```python
import requests

# Get all versions
response = requests.get(
    "http://localhost:5001/api/online-learning/versions"
)

versions = response.json()['versions']

print("Model Performance History:")
for v in versions:
    print(f"\nVersion {v['version']} - {v['timestamp']}")
    print(f"  Accuracy: {v['metrics']['accuracy']:.2%}")
    print(f"  F1-Score: {v['metrics']['f1_score']:.2%}")
    print(f"  Training samples: {v['training_samples']}")
    print(f"  New samples added: {v['new_samples_added']}")
```

## Integration with Backend

### Node.js Backend Integration

In your Node.js backend (`backend/src/services/`), create a service to report lost items:

```javascript
// backend/src/services/onlineLearningService.js

const axios = require('axios');
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

async function reportLostItem(itemData) {
  try {
    const report = {
      location: itemData.location,
      itemType: itemData.itemType,
      crowdLevel: itemData.crowdLevel || 'Medium',
      weather: itemData.weather || 'Sunny',
      dayType: itemData.dayType || 'Weekday',
      time: itemData.time || new Date().toTimeString().slice(0, 5),
      lostCount: itemData.historicalCount || 5,
      incident_occurred: 1,  // Lost item = incident
      timestamp: itemData.timestamp || new Date().toISOString()
    };

    const response = await axios.post(
      `${ML_SERVICE_URL}/api/online-learning/report-lost-item`,
      report
    );

    console.log('✅ Lost item reported to ML service:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error reporting to ML service:', error.message);
    // Don't fail the main operation if ML reporting fails
    return null;
  }
}

async function checkModelStatus() {
  try {
    const response = await axios.get(
      `${ML_SERVICE_URL}/api/online-learning/buffer-status`
    );
    return response.data;
  } catch (error) {
    console.error('❌ Error checking ML status:', error.message);
    return null;
  }
}

module.exports = {
  reportLostItem,
  checkModelStatus
};
```

### Using in Routes

```javascript
// backend/src/routes/storedItemRoutes.js

const onlineLearningService = require('../services/onlineLearningService');

// When a user reports a lost item
router.post('/stored-items', async (req, res) => {
  try {
    // Save to database
    const item = await StoredItem.create(req.body);

    // Report to ML service for online learning
    onlineLearningService.reportLostItem({
      location: item.location,
      itemType: item.itemType,
      crowdLevel: item.crowdLevel,
      weather: item.weather,
      dayType: item.dayType,
      time: item.time,
      timestamp: item.timestamp
    });

    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Best Practices

### 1. Data Quality
- Validate data before adding to buffer
- Remove duplicates regularly
- Ensure consistent field formats

### 2. Retraining Strategy
- Don't retrain too frequently (at least 50 new samples)
- Monitor model performance after each version
- Keep backups of previous model versions

### 3. Monitoring
- Track buffer growth rate
- Monitor retraining frequency
- Check model performance trends

### 4. Production Deployment
- Use background tasks for retraining
- Implement proper logging
- Set up alerts for retraining failures
- Monitor model degradation

## Troubleshooting

### Buffer Not Growing
**Problem:** New samples aren't being added to buffer

**Solution:**
- Check API endpoint is working: `GET /api/online-learning/buffer-status`
- Verify data format matches `LostItemReport` model
- Check file permissions on `data/buffer/new_samples.csv`

### Model Not Retraining
**Problem:** Buffer reaches threshold but model doesn't retrain

**Solution:**
- Check scheduler status: `GET /api/online-learning/scheduler-status`
- Review logs for training errors
- Manually trigger: `POST /api/online-learning/trigger-retraining`

### Performance Degradation
**Problem:** New model versions perform worse than previous ones

**Solution:**
- Review data quality in buffer
- Check for label errors (incident_occurred field)
- Increase minimum buffer size before retraining
- Review feature engineering pipeline

### High Memory Usage
**Problem:** System uses too much memory during retraining

**Solution:**
- Reduce buffer size threshold
- Clear historical data periodically
- Use incremental learning algorithms (future enhancement)

## Future Enhancements

1. **True Incremental Learning**
   - Implement algorithms like `SGDClassifier` with `partial_fit()`
   - Update model weights without full retraining

2. **A/B Testing**
   - Deploy multiple model versions
   - Compare performance in production
   - Roll back if new version underperforms

3. **Active Learning**
   - Identify uncertain predictions
   - Request human labeling for difficult cases
   - Prioritize important samples for training

4. **Distributed Training**
   - Use multiple workers for faster retraining
   - Implement model ensembling

5. **Real-time Feature Engineering**
   - Calculate rolling features in real-time
   - Use streaming data processing (e.g., Apache Kafka)

## Performance Benchmarks

Typical performance on standard hardware:

- **Buffer Write**: < 10ms per sample
- **Buffer Read**: < 50ms for 1000 samples
- **Retraining** (1000 samples): 30-60 seconds
- **Retraining** (10000 samples): 3-5 minutes
- **Model Loading**: < 500ms

## Contact & Support

For questions or issues:
- Review the API documentation: `http://localhost:5001/docs`
- Check logs in console output
- Review model metrics: `GET /api/model/info`

---

**Built with:** FastAPI, scikit-learn, XGBoost, pandas, joblib
