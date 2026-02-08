"""
Professional ML Training Pipeline for Lost & Found Risk Prediction

Features:
1. Time-based train/test split (no data leakage)
2. Real predictive labels (incident in next N hours)
3. RandomForest + XGBoost models
4. Rolling/historical features
5. Proper evaluation metrics (Precision, Recall, F1, ROC-AUC)
6. Feature importance + SHAP explainability
7. Baseline vs final model comparison
"""

import pandas as pd
import numpy as np
import joblib
import json
import warnings
from datetime import datetime, timedelta
from pathlib import Path

warnings.filterwarnings('ignore')

from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    roc_curve
)

import xgboost as xgb

try:
    import matplotlib.pyplot as plt
    import seaborn as sns
    PLOTTING_AVAILABLE = True
except ImportError:
    PLOTTING_AVAILABLE = False
    print("WARNING: Matplotlib/Seaborn not available (optional)")

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    print("WARNING: SHAP not available (optional)")

# Configuration
MODEL_DIR = Path(__file__).parent / 'models'
DATA_DIR = Path(__file__).parent / 'data'
MODEL_DIR.mkdir(exist_ok=True)


class RiskPredictor:
    """Professional Risk Prediction Model"""

    def __init__(self):
        self.model = None
        self.baseline_model = None
        self.encoders = {}
        self.feature_names = []
        self.feature_importance = None
        self.shap_values = None
        self.metrics = {}

    def load_and_prepare_data(self, csv_path):
        """Load CSV and prepare data with timestamp handling"""
        print("\n[1/8] Loading data...")
        df = pd.read_csv(csv_path)
        print(f"✅ Loaded {len(df)} records")
        print(f"Columns: {list(df.columns)}")

        # Create timestamp from time field
        if 'time' in df.columns:
            # Parse time as HH:MM format
            df['hour'] = df['time'].str.split(':').str[0].astype(int)
            df['minute'] = df['time'].str.split(':').str[1].astype(int)

            # Create a sortable timestamp (using dates from index as proxy)
            # In real scenario, you'd have actual dates
            df['timestamp'] = pd.to_datetime(
                df.index.to_series().astype(str) + ' ' + df['time'],
                format='%Y-%m-%d %H:%M',
                errors='coerce'
            )

            # If timestamp parsing fails, create synthetic timestamps
            if df['timestamp'].isna().any():
                base_date = datetime(2024, 1, 1)
                df['timestamp'] = [base_date + timedelta(hours=i) for i in range(len(df))]

        # Sort by timestamp for time-based split
        df = df.sort_values('timestamp').reset_index(drop=True)

        return df

    def create_predictive_labels(self, df, prediction_window_hours=2):
        """
        Create REAL PREDICTIVE labels: Will there be an incident in next N hours?
        This is the key change from rule-based to predictive ML!
        """
        print(f"\n[2/8] Creating predictive labels (incident in next {prediction_window_hours}h)...")

        # Group by location to track incidents
        df['incident_next_window'] = 0

        for location in df['location'].unique():
            location_mask = df['location'] == location
            location_df = df[location_mask].copy()

            for idx in location_df.index:
                current_time = df.loc[idx, 'timestamp']
                window_end = current_time + timedelta(hours=prediction_window_hours)

                # Check if there's an incident in the next window
                future_incidents = df[
                    (df['location'] == location) &
                    (df['timestamp'] > current_time) &
                    (df['timestamp'] <= window_end)
                ]

                if len(future_incidents) > 0:
                    df.loc[idx, 'incident_next_window'] = 1

        print(f"✅ Labels created:")
        print(f"   No incident: {(df['incident_next_window'] == 0).sum()}")
        print(f"   Incident: {(df['incident_next_window'] == 1).sum()}")

        return df

    def engineer_features(self, df):
        """Feature engineering with rolling/historical features"""
        print("\n[3/8] Feature engineering...")

        df_features = df.copy()

        # Time features
        df_features['hour'] = df_features['timestamp'].dt.hour
        df_features['day_of_week'] = df_features['timestamp'].dt.dayofweek
        df_features['is_weekend'] = (df_features['day_of_week'] >= 5).astype(int)
        df_features['is_peak_hour'] = df_features['hour'].isin([12, 13, 17, 18]).astype(int)

        # Categorical encodings
        categorical_cols = ['location', 'itemType', 'crowdLevel', 'weather', 'dayType']

        for col in categorical_cols:
            if col in df_features.columns:
                le = LabelEncoder()
                df_features[f'{col}_encoded'] = le.fit_transform(df_features[col].astype(str))
                self.encoders[col] = le

        # ROLLING/HISTORICAL FEATURES (very powerful!)
        print("   Adding rolling features...")
        df_features = df_features.sort_values('timestamp')

        # For each location, compute rolling statistics
        for location in df_features['location'].unique():
            location_mask = df_features['location'] == location
            location_indices = df_features[location_mask].index

            # Initialize rolling columns
            if 'incidents_last_1h' not in df_features.columns:
                df_features['incidents_last_1h'] = 0
                df_features['incidents_last_6h'] = 0
                df_features['incidents_last_24h'] = 0
                df_features['avg_crowd_last_6h'] = 0

            for idx in location_indices:
                current_time = df_features.loc[idx, 'timestamp']

                # Count incidents in various time windows
                past_1h = df_features[
                    (df_features['location'] == location) &
                    (df_features['timestamp'] < current_time) &
                    (df_features['timestamp'] >= current_time - timedelta(hours=1))
                ]
                df_features.loc[idx, 'incidents_last_1h'] = len(past_1h)

                past_6h = df_features[
                    (df_features['location'] == location) &
                    (df_features['timestamp'] < current_time) &
                    (df_features['timestamp'] >= current_time - timedelta(hours=6))
                ]
                df_features.loc[idx, 'incidents_last_6h'] = len(past_6h)

                past_24h = df_features[
                    (df_features['location'] == location) &
                    (df_features['timestamp'] < current_time) &
                    (df_features['timestamp'] >= current_time - timedelta(hours=24))
                ]
                df_features.loc[idx, 'incidents_last_24h'] = len(past_24h)

                # Average crowd level in last 6 hours
                if len(past_6h) > 0 and 'crowdLevel_encoded' in df_features.columns:
                    df_features.loc[idx, 'avg_crowd_last_6h'] = past_6h['crowdLevel_encoded'].mean()

        # Lost count as numeric
        if 'lostCount' in df_features.columns:
            df_features['lostCount_numeric'] = pd.to_numeric(df_features['lostCount'], errors='coerce').fillna(5)

        print(f"✅ Features engineered: {len(df_features.columns)} total columns")

        return df_features

    def prepare_train_test(self, df, test_size=0.2):
        """Time-based split (NO random split for time series!)"""
        print("\n[4/8] Preparing train/test split (time-based)...")

        # Select features
        feature_cols = [
            'hour', 'day_of_week', 'is_weekend', 'is_peak_hour',
            'location_encoded', 'itemType_encoded', 'crowdLevel_encoded',
            'weather_encoded', 'dayType_encoded',
            'incidents_last_1h', 'incidents_last_6h', 'incidents_last_24h',
            'avg_crowd_last_6h'
        ]

        if 'lostCount_numeric' in df.columns:
            feature_cols.append('lostCount_numeric')

        # Filter to existing columns
        feature_cols = [col for col in feature_cols if col in df.columns]
        self.feature_names = feature_cols

        X = df[feature_cols].fillna(0)
        y = df['incident_next_window']

        # TIME-BASED SPLIT (train on early data, test on later data)
        split_idx = int(len(df) * (1 - test_size))
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        print(f"✅ Train set: {len(X_train)} samples (early data)")
        print(f"✅ Test set: {len(X_test)} samples (later data)")
        print(f"   Train labels - 0: {(y_train == 0).sum()}, 1: {(y_train == 1).sum()}")
        print(f"   Test labels - 0: {(y_test == 0).sum()}, 1: {(y_test == 1).sum()}")

        return X_train, X_test, y_train, y_test

    def train_baseline(self, X_train, y_train):
        """Baseline model (Logistic Regression)"""
        print("\n[5/8] Training baseline model (Logistic Regression)...")
        self.baseline_model = LogisticRegression(max_iter=1000, random_state=42)
        self.baseline_model.fit(X_train, y_train)
        print("✅ Baseline model trained")

    def train_models(self, X_train, y_train, X_test, y_test):
        """Train and compare multiple models"""
        print("\n[6/8] Training advanced models...")

        models = {
            'Random Forest': RandomForestClassifier(
                n_estimators=200,
                max_depth=10,
                min_samples_split=5,
                random_state=42,
                class_weight='balanced',
                n_jobs=-1
            ),
            'XGBoost': xgb.XGBClassifier(
                n_estimators=200,
                max_depth=6,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                eval_metric='logloss',
                use_label_encoder=False
            )
        }

        results = {}

        for name, model in models.items():
            print(f"\n   Training {name}...")
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            y_pred_proba = model.predict_proba(X_test)[:, 1]

            # Metrics
            accuracy = accuracy_score(y_test, y_pred)
            precision = precision_score(y_test, y_pred, zero_division=0)
            recall = recall_score(y_test, y_pred, zero_division=0)
            f1 = f1_score(y_test, y_pred, zero_division=0)

            # ROC-AUC for binary classification
            try:
                roc_auc = roc_auc_score(y_test, y_pred_proba)
            except:
                roc_auc = 0.0

            results[name] = {
                'model': model,
                'accuracy': accuracy,
                'precision': precision,
                'recall': recall,
                'f1_score': f1,
                'roc_auc': roc_auc,
                'predictions': y_pred,
                'pred_proba': y_pred_proba
            }

            print(f"      Accuracy: {accuracy:.4f}")
            print(f"      Precision: {precision:.4f}")
            print(f"      Recall: {recall:.4f}")
            print(f"      F1-Score: {f1:.4f}")
            print(f"      ROC-AUC: {roc_auc:.4f}")

        # Select best model by F1 score
        best_name = max(results, key=lambda x: results[x]['f1_score'])
        self.model = results[best_name]['model']
        self.metrics = results[best_name]
        self.metrics['model_name'] = best_name

        # Baseline comparison
        baseline_pred = self.baseline_model.predict(X_test)
        baseline_acc = accuracy_score(y_test, baseline_pred)
        baseline_f1 = f1_score(y_test, baseline_pred, zero_division=0)

        print(f"\n   {'='*60}")
        print(f"   BEST MODEL: {best_name}")
        print(f"   {'='*60}")
        print(f"   Baseline (Logistic):  Acc={baseline_acc:.4f}, F1={baseline_f1:.4f}")
        print(f"   Final ({best_name}):  Acc={self.metrics['accuracy']:.4f}, F1={self.metrics['f1_score']:.4f}")
        print(f"   Improvement:          +{(self.metrics['f1_score'] - baseline_f1):.4f} F1")

        return results

    def evaluate(self, X_test, y_test):
        """Generate evaluation report"""
        print("\n[7/8] Detailed evaluation...")

        y_pred = self.model.predict(X_test)

        print("\n   Classification Report:")
        print(classification_report(y_test, y_pred,
                                    target_names=['No Incident', 'Incident'],
                                    zero_division=0))

        print("\n   Confusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        print(cm)
        print(f"   TN: {cm[0,0]}, FP: {cm[0,1]}")
        print(f"   FN: {cm[1,0]}, TP: {cm[1,1]}")

    def compute_feature_importance(self, X_train):
        """Compute and display feature importance"""
        print("\n[8/8] Computing feature importance...")

        if hasattr(self.model, 'feature_importances_'):
            importances = self.model.feature_importances_
            self.feature_importance = dict(zip(self.feature_names, importances))

            # Sort by importance
            sorted_features = sorted(self.feature_importance.items(),
                                   key=lambda x: x[1], reverse=True)

            print("\n   Top 10 Features:")
            for feat, imp in sorted_features[:10]:
                print(f"      {feat}: {imp:.4f}")

        # SHAP values (explainability)
        if SHAP_AVAILABLE and hasattr(self.model, 'predict_proba'):
            print("\n   Computing SHAP values...")
            try:
                explainer = shap.TreeExplainer(self.model)
                shap_values = explainer.shap_values(X_train[:100])  # Sample for speed
                self.shap_values = shap_values
                print("   ✅ SHAP values computed successfully")
            except Exception as e:
                print(f"   ⚠️ SHAP computation failed: {e}")

    def save_model(self):
        """Save model, encoders, and metrics"""
        print("\n[SAVE] Saving model...")

        model_data = {
            'model': self.model,
            'baseline_model': self.baseline_model,
            'encoders': self.encoders,
            'feature_names': self.feature_names,
            'feature_importance': self.feature_importance
        }

        model_path = MODEL_DIR / 'risk_model.pkl'
        joblib.dump(model_data, model_path)
        print(f"✅ Model saved to: {model_path}")

        # Save metrics
        metrics_summary = {
            'model_name': self.metrics.get('model_name', 'Unknown'),
            'accuracy': float(self.metrics.get('accuracy', 0)),
            'precision': float(self.metrics.get('precision', 0)),
            'recall': float(self.metrics.get('recall', 0)),
            'f1_score': float(self.metrics.get('f1_score', 0)),
            'roc_auc': float(self.metrics.get('roc_auc', 0)),
            'feature_importance': {k: float(v) for k, v in (self.feature_importance or {}).items()},
            'training_date': datetime.now().isoformat(),
            'features_used': self.feature_names
        }

        metrics_path = MODEL_DIR / 'model_metrics.json'
        with open(metrics_path, 'w') as f:
            json.dump(metrics_summary, f, indent=2)
        print(f"✅ Metrics saved to: {metrics_path}")


def main(csv_path=None):
    """Main training pipeline"""
    print("\n" + "="*70)
    print("PROFESSIONAL ML TRAINING PIPELINE")
    print("Lost & Found Risk Prediction")
    print("="*70)

    if csv_path is None:
        csv_path = DATA_DIR / 'training_data.csv'
        if not csv_path.exists():
            csv_path = Path(__file__).parent.parent / 'backend' / 'data' / 'risk_data.csv'

    predictor = RiskPredictor()

    # 1. Load data
    df = predictor.load_and_prepare_data(csv_path)

    # 2. Create predictive labels
    df = predictor.create_predictive_labels(df, prediction_window_hours=2)

    # 3. Feature engineering
    df = predictor.engineer_features(df)

    # 4. Train/test split
    X_train, X_test, y_train, y_test = predictor.prepare_train_test(df)

    # 5. Train baseline
    predictor.train_baseline(X_train, y_train)

    # 6. Train advanced models
    results = predictor.train_models(X_train, y_train, X_test, y_test)

    # 7. Evaluate
    predictor.evaluate(X_test, y_test)

    # 8. Feature importance
    predictor.compute_feature_importance(X_train)

    # 9. Save
    predictor.save_model()

    print("\n" + "="*70)
    print("✅ TRAINING COMPLETE!")
    print("="*70)
    print(f"Model Type: {predictor.metrics.get('model_name')}")
    print(f"Accuracy: {predictor.metrics.get('accuracy', 0):.2%}")
    print(f"F1-Score: {predictor.metrics.get('f1_score', 0):.2%}")
    print(f"ROC-AUC: {predictor.metrics.get('roc_auc', 0):.2%}")
    print("="*70)

    return predictor.metrics


if __name__ == '__main__':
    main()
