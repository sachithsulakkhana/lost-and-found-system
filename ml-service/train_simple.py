# -*- coding: utf-8 -*-
"""
Simple ML Training Script (Windows Compatible)
No emojis, simplified output
"""

import pandas as pd
import numpy as np
import joblib
import json
import warnings
from datetime import datetime, timedelta
from pathlib import Path
import sys

# Force UTF-8 output on Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

warnings.filterwarnings('ignore')

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score
)

try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

# Configuration
MODEL_DIR = Path(__file__).parent / 'models'
DATA_DIR = Path(__file__).parent / 'data'
MODEL_DIR.mkdir(exist_ok=True)

print("="*70)
print("ML TRAINING PIPELINE - Lost & Found Risk Prediction")
print("="*70)

# 1. Load data
print("\n[1/6] Loading data...")
csv_path = DATA_DIR / 'training_data.csv'
if not csv_path.exists():
    csv_path = Path(__file__).parent.parent / 'backend' / 'data' / 'risk_data.csv'

df = pd.read_csv(csv_path)
print(f"Loaded {len(df)} records")
print(f"Columns: {list(df.columns)}")

# 2. Create features
print("\n[2/6] Creating features...")

# Time features
if 'time' in df.columns:
    df['hour'] = df['time'].str.split(':').str[0].astype(int)
    df['minute'] = df['time'].str.split(':').str[1].astype(int)
else:
    df['hour'] = 12
    df['minute'] = 0

# Day features
df['day_of_week'] = 2  # Default to Wednesday
df['is_weekend'] = 0
df['is_peak_hour'] = df['hour'].isin([12, 13, 17, 18]).astype(int)

# Create synthetic incident flag (for demo purposes)
# In production, you'd have real historical incident data
np.random.seed(42)
df['incident_next_window'] = 0

# High risk = high crowd + peak hours
high_risk = (df.get('crowdLevel', 'medium').str.lower() == 'high') & (df['is_peak_hour'] == 1)
df.loc[high_risk, 'incident_next_window'] = np.random.choice([0, 1], size=high_risk.sum(), p=[0.3, 0.7])

# Medium risk = medium crowd
medium_risk = (df.get('crowdLevel', 'medium').str.lower() == 'medium')
df.loc[medium_risk & ~high_risk, 'incident_next_window'] = np.random.choice([0, 1], size=(medium_risk & ~high_risk).sum(), p=[0.6, 0.4])

# Low risk = low crowd
low_risk = (df.get('crowdLevel', 'medium').str.lower() == 'low')
df.loc[low_risk & ~high_risk & ~medium_risk, 'incident_next_window'] = np.random.choice([0, 1], size=(low_risk & ~high_risk & ~medium_risk).sum(), p=[0.8, 0.2])

print(f"Labels created:")
print(f"  No incident: {(df['incident_next_window'] == 0).sum()}")
print(f"  Incident: {(df['incident_next_window'] == 1).sum()}")

# Encode categorical features
encoders = {}
categorical_cols = ['location', 'itemType', 'crowdLevel', 'weather', 'dayType']

for col in categorical_cols:
    if col in df.columns:
        le = LabelEncoder()
        df[f'{col}_encoded'] = le.fit_transform(df[col].astype(str))
        encoders[col] = le

# Rolling features (simplified - using random for demo)
df['incidents_last_1h'] = np.random.randint(0, 3, len(df))
df['incidents_last_6h'] = np.random.randint(0, 10, len(df))
df['incidents_last_24h'] = np.random.randint(0, 20, len(df))
df['avg_crowd_last_6h'] = df.get('crowdLevel_encoded', 1)

# Lost count as numeric
if 'lostCount' in df.columns:
    df['lostCount_numeric'] = pd.to_numeric(df['lostCount'], errors='coerce').fillna(5)
else:
    df['lostCount_numeric'] = 5

print(f"Features created: {len(df.columns)} columns")

# 3. Prepare train/test
print("\n[3/6] Preparing train/test split...")

feature_cols = [
    'hour', 'day_of_week', 'is_weekend', 'is_peak_hour',
    'location_encoded', 'itemType_encoded', 'crowdLevel_encoded',
    'weather_encoded', 'dayType_encoded',
    'incidents_last_1h', 'incidents_last_6h', 'incidents_last_24h',
    'avg_crowd_last_6h', 'lostCount_numeric'
]

# Filter to existing columns
feature_cols = [col for col in feature_cols if col in df.columns]

X = df[feature_cols].fillna(0)
y = df['incident_next_window']

# Time-based split (80/20)
split_idx = int(len(df) * 0.8)
X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

print(f"Train set: {len(X_train)} samples")
print(f"Test set: {len(X_test)} samples")
print(f"Train labels - 0: {(y_train == 0).sum()}, 1: {(y_train == 1).sum()}")
print(f"Test labels - 0: {(y_test == 0).sum()}, 1: {(y_test == 1).sum()}")

# 4. Train baseline
print("\n[4/6] Training baseline (Logistic Regression)...")
baseline = LogisticRegression(max_iter=1000, random_state=42)
baseline.fit(X_train, y_train)
baseline_pred = baseline.predict(X_test)
baseline_acc = accuracy_score(y_test, baseline_pred)
baseline_f1 = f1_score(y_test, baseline_pred, zero_division=0)
print(f"Baseline - Accuracy: {baseline_acc:.4f}, F1: {baseline_f1:.4f}")

# 5. Train advanced models
print("\n[5/6] Training advanced models...")

models = {}

# Random Forest
print("  Training Random Forest...")
rf = RandomForestClassifier(
    n_estimators=100,
    max_depth=10,
    min_samples_split=5,
    random_state=42,
    n_jobs=-1
)
rf.fit(X_train, y_train)
rf_pred = rf.predict(X_test)
rf_pred_proba = rf.predict_proba(X_test)[:, 1]
rf_acc = accuracy_score(y_test, rf_pred)
rf_f1 = f1_score(y_test, rf_pred, zero_division=0)
rf_roc = roc_auc_score(y_test, rf_pred_proba) if len(np.unique(y_test)) > 1 else 0.0
print(f"    Accuracy: {rf_acc:.4f}, F1: {rf_f1:.4f}, ROC-AUC: {rf_roc:.4f}")
models['RandomForest'] = {'model': rf, 'acc': rf_acc, 'f1': rf_f1, 'roc': rf_roc}

# XGBoost (if available)
if XGBOOST_AVAILABLE:
    print("  Training XGBoost...")
    xgb_model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        random_state=42,
        eval_metric='logloss',
        use_label_encoder=False
    )
    xgb_model.fit(X_train, y_train)
    xgb_pred = xgb_model.predict(X_test)
    xgb_pred_proba = xgb_model.predict_proba(X_test)[:, 1]
    xgb_acc = accuracy_score(y_test, xgb_pred)
    xgb_f1 = f1_score(y_test, xgb_pred, zero_division=0)
    xgb_roc = roc_auc_score(y_test, xgb_pred_proba) if len(np.unique(y_test)) > 1 else 0.0
    print(f"    Accuracy: {xgb_acc:.4f}, F1: {xgb_f1:.4f}, ROC-AUC: {xgb_roc:.4f}")
    models['XGBoost'] = {'model': xgb_model, 'acc': xgb_acc, 'f1': xgb_f1, 'roc': xgb_roc}

# Select best model by F1 score
best_name = max(models, key=lambda x: models[x]['f1'])
best_model = models[best_name]['model']
best_metrics = models[best_name]

print(f"\nBest Model: {best_name}")
print(f"  Baseline:  Acc={baseline_acc:.4f}, F1={baseline_f1:.4f}")
print(f"  {best_name}: Acc={best_metrics['acc']:.4f}, F1={best_metrics['f1']:.4f}")
print(f"  Improvement: +{(best_metrics['f1'] - baseline_f1):.4f} F1")

# 6. Save model
print("\n[6/6] Saving model...")

model_data = {
    'model': best_model,
    'baseline_model': baseline,
    'encoders': encoders,
    'feature_names': feature_cols,
    'feature_importance': dict(zip(feature_cols, best_model.feature_importances_)) if hasattr(best_model, 'feature_importances_') else {}
}

model_path = MODEL_DIR / 'risk_model.pkl'
joblib.dump(model_data, model_path)
print(f"Model saved to: {model_path}")

# Save metrics
metrics = {
    'model_name': best_name,
    'accuracy': float(best_metrics['acc']),
    'precision': float(precision_score(y_test, best_model.predict(X_test), zero_division=0)),
    'recall': float(recall_score(y_test, best_model.predict(X_test), zero_division=0)),
    'f1_score': float(best_metrics['f1']),
    'roc_auc': float(best_metrics['roc']),
    'feature_importance': {k: float(v) for k, v in model_data['feature_importance'].items()},
    'training_date': datetime.now().isoformat(),
    'features_used': feature_cols
}

metrics_path = MODEL_DIR / 'model_metrics.json'
with open(metrics_path, 'w') as f:
    json.dump(metrics, f, indent=2)
print(f"Metrics saved to: {metrics_path}")

print("\n" + "="*70)
print("TRAINING COMPLETE!")
print("="*70)
print(f"Model: {best_name}")
print(f"Accuracy: {best_metrics['acc']:.2%}")
print(f"F1-Score: {best_metrics['f1']:.2%}")
print(f"ROC-AUC: {best_metrics['roc']:.2%}")
print("="*70)
print("\nYou can now start the ML service with: python main.py")
