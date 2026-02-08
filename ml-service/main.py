"""
FastAPI ML Prediction Service with Real-Time Online Learning
Professional ML microservice for Lost & Found risk prediction

Features:
- Real-time risk prediction
- Incremental model updating
- Automatic retraining when new data arrives
- Model versioning and tracking
"""

import sys
import io

# Fix Windows encoding issues
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
import pytz
import json

# Import online learning module
try:
    from online_learning import (
        add_lost_item,
        trigger_retraining,
        get_buffer_status,
        get_model_versions,
        online_updater
    )
    ONLINE_LEARNING_AVAILABLE = True
    print("✅ Online learning module loaded successfully")
except ImportError as e:
    ONLINE_LEARNING_AVAILABLE = False
    print(f"⚠️ Online learning module not available: {e}")

# Import scheduler
try:
    from scheduler import start_scheduler, stop_scheduler, get_scheduler_status
    SCHEDULER_AVAILABLE = True
    print("✅ Scheduler module loaded successfully")
except ImportError as e:
    SCHEDULER_AVAILABLE = False
    print(f"⚠️ Scheduler module not available: {e}")

# Configuration
MODEL_DIR = Path(__file__).parent / 'models'
DATA_DIR = Path(__file__).parent / 'data'
MODEL_PATH = MODEL_DIR / 'risk_model.pkl'
METRICS_PATH = MODEL_DIR / 'model_metrics.json'
SL_TZ = pytz.timezone('Asia/Colombo')

app = FastAPI(
    title="ML Risk Prediction Service",
    description="Professional ML microservice for predicting lost item risk",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
model_data = None
metrics = {}


# Pydantic models
class PredictionRequest(BaseModel):
    location: str = Field(..., description="Location name")
    crowd_level: str = Field(..., description="Crowd level: Low, Medium, High")
    time_of_day: str = Field(..., description="Time in HH:MM format")
    weather: Optional[str] = Field("Sunny", description="Weather condition")
    day_type: Optional[str] = Field("Weekday", description="Weekday or Weekend")
    item_type: Optional[str] = Field("phone", description="Type of item")
    lost_count: Optional[int] = Field(5, description="Historical lost count")


class PredictionResponse(BaseModel):
    risk_level: int = Field(..., description="0=No Incident, 1=Incident Expected")
    risk_category: str = Field(..., description="No Incident or Incident")
    probability: float = Field(..., description="Probability of incident")
    confidence: Dict[str, float] = Field(..., description="Confidence scores")
    input_parameters: Dict = Field(..., description="Input parameters used")
    model_info: Dict = Field(..., description="Model information")
    timestamp: str = Field(..., description="Prediction timestamp")


class ModelInfo(BaseModel):
    model_name: str
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    roc_auc: float
    training_date: str
    features_used: List[str]


class FeatureImportance(BaseModel):
    features: Dict[str, float]
    top_10: List[Dict[str, float]]


class LostItemReport(BaseModel):
    """Model for real-time lost item reports"""
    location: str = Field(..., description="Location where item was lost")
    itemType: str = Field(..., description="Type of item (phone, wallet, keys, etc.)")
    crowdLevel: str = Field(..., description="Crowd level: Low, Medium, High")
    weather: Optional[str] = Field("Sunny", description="Weather condition")
    dayType: Optional[str] = Field("Weekday", description="Weekday or Weekend")
    time: str = Field(..., description="Time in HH:MM format")
    lostCount: Optional[int] = Field(5, description="Historical lost count")
    incident_occurred: int = Field(..., description="1 if incident, 0 if no incident")
    timestamp: Optional[str] = Field(None, description="Timestamp of the incident")


class BufferStatus(BaseModel):
    """Buffer status for online learning"""
    buffer_size: int
    retrain_threshold: int
    should_retrain: bool
    latest_version: Optional[Dict]
    total_versions: int


class ModelVersion(BaseModel):
    """Model version information"""
    version: int
    timestamp: str
    metrics: Dict
    training_samples: int
    new_samples_added: int


def load_model():
    """Load trained model"""
    global model_data, metrics

    try:
        if MODEL_PATH.exists():
            model_data = joblib.load(MODEL_PATH)
            print(f"✅ Model loaded from {MODEL_PATH}")
        else:
            print(f"⚠️ Model not found at {MODEL_PATH}")
            print("   Run train.py first to train the model")
            return False

        if METRICS_PATH.exists():
            with open(METRICS_PATH, 'r') as f:
                metrics = json.load(f)
            print(f"✅ Metrics loaded: Accuracy={metrics.get('accuracy', 0):.4f}")
        else:
            print("⚠️ Metrics file not found")

        return True
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        import traceback
        traceback.print_exc()
        return False


def preprocess_input(data: PredictionRequest) -> pd.DataFrame:
    """Preprocess input for prediction"""
    # Parse time
    try:
        hour = int(data.time_of_day.split(':')[0])
        minute = int(data.time_of_day.split(':')[1])
    except:
        hour, minute = 12, 0

    # Create feature dictionary
    features = {
        'hour': hour,
        'day_of_week': 2,  # Default to Wednesday
        'is_weekend': 1 if data.day_type.lower() == 'weekend' else 0,
        'is_peak_hour': 1 if hour in [12, 13, 17, 18] else 0,
    }

    # Encode categorical features
    if model_data and 'encoders' in model_data:
        encoders = model_data['encoders']

        # Location
        if 'location' in encoders:
            try:
                features['location_encoded'] = encoders['location'].transform([data.location])[0]
            except:
                features['location_encoded'] = 0

        # Item type
        if 'itemType' in encoders:
            try:
                features['itemType_encoded'] = encoders['itemType'].transform([data.item_type])[0]
            except:
                features['itemType_encoded'] = 0

        # Crowd level
        if 'crowdLevel' in encoders:
            try:
                features['crowdLevel_encoded'] = encoders['crowdLevel'].transform([data.crowd_level])[0]
            except:
                crowd_map = {'low': 0, 'medium': 1, 'high': 2}
                features['crowdLevel_encoded'] = crowd_map.get(data.crowd_level.lower(), 1)

        # Weather
        if 'weather' in encoders:
            try:
                features['weather_encoded'] = encoders['weather'].transform([data.weather])[0]
            except:
                features['weather_encoded'] = 0

        # Day type
        if 'dayType' in encoders:
            try:
                features['dayType_encoded'] = encoders['dayType'].transform([data.day_type])[0]
            except:
                features['dayType_encoded'] = 0 if data.day_type.lower() == 'weekday' else 1

    # Rolling features (use defaults since we don't have historical data in real-time)
    features['incidents_last_1h'] = 0
    features['incidents_last_6h'] = 1  # Assume some activity
    features['incidents_last_24h'] = 3
    features['avg_crowd_last_6h'] = features.get('crowdLevel_encoded', 1)
    features['lostCount_numeric'] = data.lost_count

    # Create DataFrame with all required features
    if model_data and 'feature_names' in model_data:
        feature_names = model_data['feature_names']
        # Ensure all features are present
        for fname in feature_names:
            if fname not in features:
                features[fname] = 0

        df = pd.DataFrame([features])[feature_names]
    else:
        df = pd.DataFrame([features])

    return df


@app.on_event("startup")
async def startup_event():
    """Load model on startup and start scheduler"""
    print("\n" + "="*70)
    print("ML PREDICTION SERVICE WITH ONLINE LEARNING")
    print("="*70)
    load_model()

    # Start automatic retraining scheduler
    if SCHEDULER_AVAILABLE and ONLINE_LEARNING_AVAILABLE:
        print("\n[STARTUP] Starting automatic retraining scheduler...")
        start_scheduler(check_interval_minutes=60)  # Check every hour
        print("[STARTUP] ✅ Scheduler started successfully")
    else:
        print("\n[STARTUP] ⚠️ Scheduler not available")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ML Prediction Service (FastAPI)",
        "model_loaded": model_data is not None,
        "timestamp": datetime.now(SL_TZ).isoformat()
    }


@app.post("/api/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Predict risk of incident in next 2 hours

    This endpoint uses professional ML with:
    - Time-based training (no data leakage)
    - Real predictive labels
    - Rolling/historical features
    - RandomForest/XGBoost models
    """
    if model_data is None or 'model' not in model_data:
        raise HTTPException(status_code=503, detail="Model not loaded. Train the model first.")

    try:
        # Preprocess
        X = preprocess_input(request)

        # Predict
        model = model_data['model']
        prediction = model.predict(X)[0]
        probabilities = model.predict_proba(X)[0]

        # Build response
        risk_category = "No Incident" if prediction == 0 else "Incident Expected"
        probability = float(probabilities[1])  # Probability of incident

        response = PredictionResponse(
            risk_level=int(prediction),
            risk_category=risk_category,
            probability=probability,
            confidence={
                "No Incident": float(probabilities[0]),
                "Incident": float(probabilities[1])
            },
            input_parameters={
                "location": request.location,
                "crowd_level": request.crowd_level,
                "time_of_day": request.time_of_day,
                "weather": request.weather,
                "day_type": request.day_type,
                "item_type": request.item_type
            },
            model_info={
                "model_type": metrics.get('model_name', 'RandomForest/XGBoost'),
                "accuracy": metrics.get('accuracy', 0.0),
                "f1_score": metrics.get('f1_score', 0.0),
                "roc_auc": metrics.get('roc_auc', 0.0),
                "training_date": metrics.get('training_date', '')
            },
            timestamp=datetime.now(SL_TZ).isoformat()
        )

        return response

    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}\n{traceback.format_exc()}"
        )


@app.get("/api/model/info", response_model=ModelInfo)
async def get_model_info():
    """Get detailed model information and metrics"""
    if model_data is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    return ModelInfo(
        model_name=metrics.get('model_name', 'Unknown'),
        accuracy=metrics.get('accuracy', 0.0),
        precision=metrics.get('precision', 0.0),
        recall=metrics.get('recall', 0.0),
        f1_score=metrics.get('f1_score', 0.0),
        roc_auc=metrics.get('roc_auc', 0.0),
        training_date=metrics.get('training_date', ''),
        features_used=metrics.get('features_used', [])
    )


@app.get("/api/model/feature-importance", response_model=FeatureImportance)
async def get_feature_importance():
    """Get feature importance from trained model"""
    if model_data is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    feature_importance = metrics.get('feature_importance', {})

    # Sort by importance
    sorted_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
    top_10 = [{"feature": feat, "importance": imp} for feat, imp in sorted_features[:10]]

    return FeatureImportance(
        features=feature_importance,
        top_10=top_10
    )


@app.post("/api/train")
async def train_model(csv_path: Optional[str] = None):
    """
    Trigger model training

    This runs the professional training pipeline with:
    - Time-based split
    - Real predictive labels
    - Baseline comparison
    - Proper evaluation metrics
    """
    try:
        import sys
        sys.path.append(str(Path(__file__).parent))
        from train import main as train_main

        # Train
        result = train_main(csv_path)

        # Reload model
        load_model()

        return {
            "success": True,
            "message": "Model trained successfully",
            "metrics": result,
            "timestamp": datetime.now(SL_TZ).isoformat()
        }

    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Training failed: {str(e)}\n{traceback.format_exc()}"
        )


@app.post("/api/upload/training-data")
async def upload_training_data(file: UploadFile = File(...)):
    """Upload new training data CSV"""
    try:
        # Save file
        DATA_DIR.mkdir(exist_ok=True)
        filepath = DATA_DIR / 'training_data.csv'

        contents = await file.read()
        with open(filepath, 'wb') as f:
            f.write(contents)

        # Validate
        df = pd.read_csv(filepath)

        return {
            "success": True,
            "message": "Training data uploaded successfully",
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "path": str(filepath)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# ============================================================================
# ONLINE LEARNING ENDPOINTS (Real-Time Model Updating)
# ============================================================================

@app.post("/api/online-learning/report-lost-item")
async def report_lost_item(report: LostItemReport, background_tasks: BackgroundTasks):
    """
    Report a new lost item and add it to the training buffer

    This endpoint:
    1. Receives real-time lost item reports
    2. Adds them to the training buffer
    3. Automatically triggers retraining when threshold is reached
    4. Updates the model with new patterns from user reports
    """
    if not ONLINE_LEARNING_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Online learning module not available"
        )

    try:
        # Convert to dict
        report_dict = report.dict()

        # Add to buffer and check if retraining is needed
        result = add_lost_item(report_dict)

        return {
            "success": True,
            "message": "Lost item report received and added to training buffer",
            "report": report_dict,
            "buffer_status": {
                "buffer_size": result.get('buffer_size', 0),
                "retrain_threshold": result.get('retrain_threshold', 0),
                "will_retrain_soon": result.get('will_retrain_soon', False)
            },
            "retrain_triggered": 'retrain_result' in result,
            "retrain_result": result.get('retrain_result'),
            "timestamp": datetime.now(SL_TZ).isoformat()
        }

    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process lost item report: {str(e)}\n{traceback.format_exc()}"
        )


@app.post("/api/online-learning/trigger-retraining")
async def trigger_manual_retraining(background_tasks: BackgroundTasks):
    """
    Manually trigger model retraining

    This will:
    1. Merge buffered data with historical training data
    2. Retrain the model with updated dataset
    3. Save new model version
    4. Clear the buffer
    """
    if not ONLINE_LEARNING_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Online learning module not available"
        )

    try:
        print("\n🔄 Manual retraining triggered via API")
        result = trigger_retraining()

        # Reload model after retraining
        if result.get('success'):
            load_model()

        return result

    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Retraining failed: {str(e)}\n{traceback.format_exc()}"
        )


@app.get("/api/online-learning/buffer-status", response_model=BufferStatus)
async def get_online_buffer_status():
    """
    Get current buffer status

    Returns:
    - Number of samples in buffer
    - Retraining threshold
    - Whether retraining should be triggered
    - Latest model version info
    """
    if not ONLINE_LEARNING_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Online learning module not available"
        )

    try:
        status = get_buffer_status()
        return BufferStatus(**status)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get buffer status: {str(e)}"
        )


@app.get("/api/online-learning/versions")
async def get_online_model_versions():
    """
    Get all model versions and their performance metrics

    Returns history of:
    - Version numbers
    - Training timestamps
    - Performance metrics (accuracy, F1, etc.)
    - Number of training samples
    - Number of new samples added in each version
    """
    if not ONLINE_LEARNING_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Online learning module not available"
        )

    try:
        versions = get_model_versions()
        return {
            "total_versions": len(versions),
            "versions": versions,
            "latest_version": versions[-1] if versions else None
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get model versions: {str(e)}"
        )


@app.get("/api/online-learning/info")
async def get_online_learning_info():
    """
    Get information about the online learning system
    """
    if not ONLINE_LEARNING_AVAILABLE:
        return {
            "available": False,
            "message": "Online learning module not loaded"
        }

    try:
        from online_learning import (
            RETRAIN_THRESHOLD,
            AUTO_RETRAIN_INTERVAL_HOURS
        )

        return {
            "available": True,
            "retrain_threshold": RETRAIN_THRESHOLD,
            "auto_retrain_interval_hours": AUTO_RETRAIN_INTERVAL_HOURS,
            "description": "Real-time online learning system that continuously updates the model with new lost item reports",
            "features": [
                "Automatic retraining when buffer reaches threshold",
                "Time-based automatic retraining",
                "Model versioning and tracking",
                "Performance metrics for each version",
                "Incremental learning with historical data preservation"
            ]
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get online learning info: {str(e)}"
        )


@app.get("/api/online-learning/scheduler-status")
async def get_scheduler_status_endpoint():
    """
    Get status of the automatic retraining scheduler
    """
    if not SCHEDULER_AVAILABLE:
        return {
            "available": False,
            "message": "Scheduler not available"
        }

    try:
        status = get_scheduler_status()
        return {
            "available": True,
            "scheduler": status
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get scheduler status: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    port = 5001
    print(f"\n🚀 Starting ML service on port {port}...")
    print(f"📊 API Docs: http://localhost:{port}/docs")
    print(f"📊 OpenAPI: http://localhost:{port}/openapi.json\n")

    # Load model on startup
    load_model()

    # Start server (reload=False for stability)
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
