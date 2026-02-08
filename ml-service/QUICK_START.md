# Quick Start Guide - Real-Time Online Learning

This guide will help you get the real-time online learning system up and running in 5 minutes.

## Step 1: Install Dependencies

```bash
cd ml-service
pip install -r requirements.txt
```

The new dependency added is `schedule==1.2.0` for automatic retraining.

## Step 2: Train Initial Model

Before using online learning, you need an initial trained model:

```bash
python train.py
```

This will:
- Load training data from `data/training_data.csv`
- Train the ensemble model
- Save to `models/risk_model.pkl`
- Create initial version in `models/model_version.json`

## Step 3: Start the ML Service

```bash
python main.py
```

The service will:
- Start on port 5001
- Load the trained model
- Initialize online learning buffer
- Start automatic retraining scheduler (checks every hour)

You should see:
```
✅ Online learning module loaded successfully
✅ Scheduler module loaded successfully
ML PREDICTION SERVICE WITH ONLINE LEARNING
✅ Model loaded from models/risk_model.pkl
[STARTUP] Starting automatic retraining scheduler...
[STARTUP] ✅ Scheduler started successfully
```

## Step 4: Test the System

### Test 1: Report a Lost Item

```bash
curl -X POST http://localhost:5001/api/online-learning/report-lost-item \
  -H "Content-Type: application/json" \
  -d '{
    "location": "Library",
    "itemType": "phone",
    "crowdLevel": "High",
    "weather": "Sunny",
    "dayType": "Weekday",
    "time": "14:30",
    "lostCount": 5,
    "incident_occurred": 1
  }'
```

### Test 2: Check Buffer Status

```bash
curl http://localhost:5001/api/online-learning/buffer-status
```

### Test 3: View API Documentation

Open your browser and go to:
```
http://localhost:5001/docs
```

You'll see all the new online learning endpoints in the interactive documentation.

## Step 5: Integrate with Your App

### Python Example

```python
import requests

def report_lost_item(location, item_type, crowd_level, time):
    """Report a lost item to the ML service"""
    url = "http://localhost:5001/api/online-learning/report-lost-item"

    data = {
        "location": location,
        "itemType": item_type,
        "crowdLevel": crowd_level,
        "weather": "Sunny",
        "dayType": "Weekday",
        "time": time,
        "lostCount": 5,
        "incident_occurred": 1
    }

    response = requests.post(url, json=data)
    return response.json()

# Use it
result = report_lost_item("Cafeteria", "wallet", "Medium", "12:30")
print(f"Buffer size: {result['buffer_status']['buffer_size']}")
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

async function reportLostItem(location, itemType, crowdLevel, time) {
  const url = 'http://localhost:5001/api/online-learning/report-lost-item';

  const data = {
    location: location,
    itemType: itemType,
    crowdLevel: crowdLevel,
    weather: 'Sunny',
    dayType: 'Weekday',
    time: time,
    lostCount: 5,
    incident_occurred: 1
  };

  const response = await axios.post(url, data);
  return response.data;
}

// Use it
reportLostItem('Library', 'phone', 'High', '14:30')
  .then(result => console.log('Buffer size:', result.buffer_status.buffer_size))
  .catch(error => console.error('Error:', error));
```

## How It Works

### Automatic Retraining

The model will automatically retrain when:

1. **Buffer reaches 50 samples**
   ```
   Report 1 → Buffer: 1
   Report 2 → Buffer: 2
   ...
   Report 50 → Buffer: 50 → RETRAIN! → Buffer: 0
   ```

2. **24 hours pass since last training**
   ```
   Day 1, 10:00 AM → Train
   Day 2, 10:00 AM → Auto-retrain (even if buffer < 50)
   ```

### Model Versioning

Each retraining creates a new version:

```
Version 1: Initial training (1000 samples)
Version 2: Added 50 new samples (1050 samples total) → Accuracy: 85% → 87%
Version 3: Added 45 new samples (1095 samples total) → Accuracy: 87% → 89%
```

View history:
```bash
curl http://localhost:5001/api/online-learning/versions
```

## Configuration

### Change Retrain Threshold

Edit `ml-service/online_learning.py`:

```python
# Retrain after 100 samples instead of 50
RETRAIN_THRESHOLD = 100
```

### Change Auto-Retrain Interval

Edit `ml-service/online_learning.py`:

```python
# Auto-retrain every 12 hours instead of 24
AUTO_RETRAIN_INTERVAL_HOURS = 12
```

### Change Scheduler Check Frequency

Edit `ml-service/main.py`:

```python
# Check every 30 minutes instead of 60
start_scheduler(check_interval_minutes=30)
```

## Monitoring

### Check System Status

```bash
# Buffer status
curl http://localhost:5001/api/online-learning/buffer-status

# Scheduler status
curl http://localhost:5001/api/online-learning/scheduler-status

# System info
curl http://localhost:5001/api/online-learning/info

# Model versions
curl http://localhost:5001/api/online-learning/versions
```

### View Logs

The system logs all activities to console:
- Sample additions: `📥 Receiving new lost item report`
- Retraining triggers: `🔄 Retrain triggered`
- Version updates: `✅ Model version X saved`

## Manual Operations

### Force Retraining

```bash
curl -X POST http://localhost:5001/api/online-learning/trigger-retraining
```

### Upload Training Data

```bash
curl -X POST http://localhost:5001/api/upload/training-data \
  -F "file=@new_training_data.csv"
```

## Common Issues

### Issue: "Online learning module not available"

**Solution:** Make sure you're in the ml-service directory and have run:
```bash
pip install -r requirements.txt
```

### Issue: "Model not loaded"

**Solution:** Train the initial model first:
```bash
python train.py
```

### Issue: Retraining takes too long

**Solution:** This is normal for large datasets. Retraining happens in the background and doesn't block predictions.

## Next Steps

1. **Read the full guide**: `ONLINE_LEARNING_GUIDE.md`
2. **Integrate with backend**: Add to your Node.js routes
3. **Set up monitoring**: Track model performance over time
4. **Customize thresholds**: Adjust for your use case

## Example: Complete Workflow

```bash
# 1. Start service
python main.py

# 2. In another terminal, simulate 5 lost item reports
for i in {1..5}; do
  curl -X POST http://localhost:5001/api/online-learning/report-lost-item \
    -H "Content-Type: application/json" \
    -d "{
      \"location\": \"Library\",
      \"itemType\": \"phone\",
      \"crowdLevel\": \"High\",
      \"weather\": \"Sunny\",
      \"dayType\": \"Weekday\",
      \"time\": \"14:3$i\",
      \"lostCount\": 5,
      \"incident_occurred\": 1
    }"
  sleep 1
done

# 3. Check buffer
curl http://localhost:5001/api/online-learning/buffer-status

# 4. Continue until 50 samples, then watch it auto-retrain!
```

## Testing with Postman

Import these endpoints to Postman:

```json
{
  "info": { "name": "ML Online Learning", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  "item": [
    {
      "name": "Report Lost Item",
      "request": {
        "method": "POST",
        "url": "http://localhost:5001/api/online-learning/report-lost-item",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"location\": \"Library\",\n  \"itemType\": \"phone\",\n  \"crowdLevel\": \"High\",\n  \"weather\": \"Sunny\",\n  \"dayType\": \"Weekday\",\n  \"time\": \"14:30\",\n  \"lostCount\": 5,\n  \"incident_occurred\": 1\n}",
          "options": { "raw": { "language": "json" } }
        }
      }
    },
    {
      "name": "Get Buffer Status",
      "request": {
        "method": "GET",
        "url": "http://localhost:5001/api/online-learning/buffer-status"
      }
    },
    {
      "name": "Trigger Retraining",
      "request": {
        "method": "POST",
        "url": "http://localhost:5001/api/online-learning/trigger-retraining"
      }
    }
  ]
}
```

---

**Ready to go!** Your system now learns from every lost item report in real-time.
