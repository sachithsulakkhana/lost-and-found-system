"""
ML Prediction Service API
Flask API for serving the enhanced XGBoost risk prediction model
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import joblib
import json
import pandas as pd
import numpy as np
from datetime import datetime
import pytz
import os
import sys
import io

# Fix Windows encoding issues
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

app = Flask(__name__)
CORS(app)

# Configuration
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'risk_model.pkl')
METRICS_PATH = os.path.join(os.path.dirname(__file__), 'models', 'model_metrics.json')
TRAINING_DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'training_data.csv')

SL_TZ = pytz.timezone('Asia/Colombo')

# Global model and encoders
model = None
encoders = {}
metrics = {}
feature_columns = []

def load_model():
    """Load the trained model and encoders"""
    global model, encoders, metrics, feature_columns

    try:
        # Load model
        if os.path.exists(MODEL_PATH):
            model_data = joblib.load(MODEL_PATH)
            model = model_data['model']
            encoders = model_data['encoders']
            feature_columns = model_data.get('feature_names', model_data.get('feature_columns', []))
            print(f"✅ Model loaded successfully from {MODEL_PATH}")
        else:
            print(f"⚠️ Model file not found at {MODEL_PATH}")
            print("   Run train_simple.py first")

        # Load metrics
        if os.path.exists(METRICS_PATH):
            with open(METRICS_PATH, 'r') as f:
                metrics = json.load(f)
            print(f"✅ Metrics loaded: Accuracy = {metrics['accuracy']:.4f}")
        else:
            print("⚠️ Metrics file not found")

    except Exception as e:
        print(f"❌ Error loading model: {e}")
        import traceback
        traceback.print_exc()

def preprocess_input(data):
    """Preprocess input data for prediction"""
    import numpy as np

    # Parse time
    time_str = data.get('time_of_day', '12:00')
    if ':' in str(time_str):
        hour = int(str(time_str).split(':')[0])
    else:
        hour = 12

    # Create DataFrame with expected structure
    df = pd.DataFrame([{
        'location': data.get('location', 'Library'),
        'itemType': data.get('item_type', 'Other'),
        'crowdLevel': data.get('crowd_level', 'Medium'),
        'weather': data.get('weather', 'Sunny'),
        'dayType': data.get('day_type', 'Weekday'),
        'hour': hour,
        'day_of_week': 2,
        'is_weekend': 0,
        'is_peak_hour': 1 if hour in [12, 13, 17, 18] else 0,
        'incidents_last_1h': 1,
        'incidents_last_6h': 5,
        'incidents_last_24h': 12,
        'avg_crowd_last_6h': 1,
        'lostCount_numeric': 5
    }])

    # Encode categorical variables
    for col in ['location', 'itemType', 'crowdLevel', 'weather', 'dayType']:
        if col in encoders and col in df.columns:
            le = encoders[col]
            try:
                df[f'{col}_encoded'] = le.transform(df[col].astype(str))
            except ValueError:
                # Handle unknown values - use most common value
                df[f'{col}_encoded'] = le.transform([le.classes_[0]])[0]

    # Select only the features used in training
    available_features = [col for col in feature_columns if col in df.columns]
    return df[available_features].fillna(0)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'ML Prediction Service',
        'model_loaded': model is not None,
        'timestamp': datetime.now(SL_TZ).isoformat()
    })

@app.route('/api/predict', methods=['POST'])
def predict():
    """
    Predict risk level for given parameters

    Request body:
    {
        "location": "Library",
        "crowd_level": "High",
        "time_of_day": "Afternoon",
        "weather": "Sunny",
        "day_type": "Weekday"
    }
    """
    try:
        if model is None:
            return jsonify({
                'error': 'Model not loaded. Please train the model first.'
            }), 503

        data = request.json

        # Validate required fields
        required_fields = ['location', 'crowd_level', 'time_of_day']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Preprocess input
        X = preprocess_input(data)

        # Make prediction
        prediction = model.predict(X)[0]
        probabilities = model.predict_proba(X)[0]

        # Map binary prediction to risk category based on probability
        # 0 = no incident (low risk), 1 = incident (high risk)
        if len(probabilities) == 2:
            # Binary classification
            incident_prob = float(probabilities[1])
            if incident_prob < 0.33:
                risk_category = 'Low'
                risk_level = 0
            elif incident_prob < 0.67:
                risk_category = 'Medium'
                risk_level = 1
            else:
                risk_category = 'High'
                risk_level = 2

            # Build confidence scores for 3 categories from binary prediction
            confidence = {
                'Low': float(probabilities[0]) if incident_prob < 0.33 else 0.0,
                'Medium': float(incident_prob) if 0.33 <= incident_prob < 0.67 else 0.0,
                'High': float(probabilities[1]) if incident_prob >= 0.67 else 0.0
            }
        else:
            # Multi-class classification
            risk_categories = {0: 'Low', 1: 'Medium', 2: 'High'}
            risk_category = risk_categories.get(prediction, 'Unknown')
            risk_level = int(prediction)
            confidence = {
                'Low': float(probabilities[0]) if len(probabilities) > 0 else 0.0,
                'Medium': float(probabilities[1]) if len(probabilities) > 1 else 0.0,
                'High': float(probabilities[2]) if len(probabilities) > 2 else 0.0
            }

        result = {
            'risk_level': risk_level,
            'risk_category': risk_category,
            'confidence': confidence,
            'input_parameters': {
                'location': data.get('location'),
                'crowd_level': data.get('crowd_level'),
                'time_of_day': data.get('time_of_day'),
                'weather': data.get('weather', 'Sunny'),
                'day_type': data.get('day_type', 'Weekday')
            },
            'model_info': {
                'model_type': metrics.get('model_name', 'XGBoost'),
                'accuracy': metrics.get('accuracy'),
                'training_date': metrics.get('training_date')
            },
            'timestamp': datetime.now(SL_TZ).isoformat()
        }

        return jsonify(result)

    except Exception as e:
        import traceback
        return jsonify({
            'error': 'Prediction failed',
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/model/info', methods=['GET'])
def model_info():
    """Get model information and metrics"""
    if model is None:
        return jsonify({'error': 'Model not loaded'}), 503

    return jsonify({
        'model': metrics.get('model_name', 'Unknown'),
        'metrics': {
            'accuracy': metrics.get('accuracy'),
            'precision': metrics.get('precision'),
            'recall': metrics.get('recall'),
            'f1_score': metrics.get('f1_score'),
            'cv_mean': metrics.get('cv_mean'),
            'cv_std': metrics.get('cv_std')
        },
        'training_info': {
            'training_date': metrics.get('training_date'),
            'original_records': metrics.get('original_records'),
            'augmented_records': metrics.get('augmented_records'),
            'final_training_samples': metrics.get('final_training_samples')
        },
        'features': metrics.get('features_used', []),
        'risk_thresholds': metrics.get('risk_thresholds', {}),
        'model_loaded': True
    })

@app.route('/api/train', methods=['POST'])
def train_model():
    """
    Train/retrain the model with uploaded CSV data

    Request body:
    {
        "csv_path": "/path/to/training_data.csv"  (optional, uses default if not provided)
    }
    """
    try:
        data = request.json or {}
        csv_path = data.get('csv_path', TRAINING_DATA_PATH)

        if not os.path.exists(csv_path):
            return jsonify({
                'error': 'Training data not found',
                'path': csv_path
            }), 404

        # Import training module
        sys.path.append(os.path.dirname(__file__))
        from train_model_enhanced import main as train_main

        # Train model
        print(f"Starting model training with data from: {csv_path}")
        result = train_main(csv_path)

        # Reload the model
        load_model()

        return jsonify({
            'success': True,
            'message': 'Model trained successfully',
            'metrics': result if result else metrics,
            'timestamp': datetime.now(SL_TZ).isoformat()
        })

    except Exception as e:
        import traceback
        return jsonify({
            'error': 'Training failed',
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/upload/training-data', methods=['POST'])
def upload_training_data():
    """Upload CSV training data"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Empty filename'}), 400

        # Ensure data directory exists
        data_dir = os.path.join(os.path.dirname(__file__), 'data')
        os.makedirs(data_dir, exist_ok=True)

        # Save file
        filepath = os.path.join(data_dir, 'training_data.csv')
        file.save(filepath)

        # Validate CSV
        df = pd.read_csv(filepath)

        return jsonify({
            'success': True,
            'message': 'Training data uploaded successfully',
            'filename': 'training_data.csv',
            'rows': len(df),
            'columns': list(df.columns),
            'path': filepath
        })

    except Exception as e:
        return jsonify({
            'error': 'Upload failed',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    print("="*70)
    print("ML PREDICTION SERVICE")
    print("="*70)

    # Load model on startup
    load_model()

    # Start Flask app
    port = int(os.environ.get('ML_SERVICE_PORT', 5001))
    print(f"\n🚀 Starting ML service on port {port}...")
    print(f"📊 API Endpoints:")
    print(f"   - GET  /health - Health check")
    print(f"   - POST /api/predict - Make prediction")
    print(f"   - GET  /api/model/info - Model information")
    print(f"   - POST /api/train - Train/retrain model")
    print(f"   - POST /api/upload/training-data - Upload training CSV")
    print("\n")

    app.run(host='0.0.0.0', port=port, debug=True)
