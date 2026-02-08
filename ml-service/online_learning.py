"""
Real-Time Online Learning Module for Lost & Found System

This module implements incremental learning capabilities:
1. Collects new lost item reports in real-time
2. Buffers data for batch updates
3. Incrementally updates the model with new data
4. Maintains model versions and tracks performance over time
5. Automatically retrains when enough new data is collected
"""

import pandas as pd
import numpy as np
import joblib
import json
import warnings
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
import threading
import queue

warnings.filterwarnings('ignore')

from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score
)
import xgboost as xgb

# Configuration
MODEL_DIR = Path(__file__).parent / 'models'
DATA_DIR = Path(__file__).parent / 'data'
BUFFER_DIR = DATA_DIR / 'buffer'
BUFFER_DIR.mkdir(exist_ok=True, parents=True)

# Online learning configuration
RETRAIN_THRESHOLD = 10  # Retrain after collecting 10 new samples (for real-time daily updates)
AUTO_RETRAIN_INTERVAL_HOURS = 24  # Auto-retrain every 24 hours (ensures daily updates)
MODEL_VERSION_FILE = MODEL_DIR / 'model_version.json'


class OnlineLearningBuffer:
    """Buffer for collecting new training samples"""

    def __init__(self):
        self.buffer_file = BUFFER_DIR / 'new_samples.csv'
        self.lock = threading.Lock()
        self._initialize_buffer()

    def _initialize_buffer(self):
        """Initialize buffer file if it doesn't exist"""
        if not self.buffer_file.exists():
            # Create empty DataFrame with required columns
            columns = [
                'timestamp', 'location', 'itemType', 'crowdLevel',
                'weather', 'dayType', 'time', 'lostCount',
                'incident_occurred', 'reported_at'
            ]
            df = pd.DataFrame(columns=columns)
            df.to_csv(self.buffer_file, index=False)

    def add_sample(self, sample: Dict) -> bool:
        """Add a new sample to the buffer"""
        with self.lock:
            try:
                # Add timestamp and reporting time
                sample['reported_at'] = datetime.now().isoformat()

                # Convert to DataFrame
                df_new = pd.DataFrame([sample])

                # Append to buffer
                if self.buffer_file.exists():
                    df_existing = pd.read_csv(self.buffer_file)
                    df_combined = pd.concat([df_existing, df_new], ignore_index=True)
                else:
                    df_combined = df_new

                df_combined.to_csv(self.buffer_file, index=False)
                print(f"✅ Added sample to buffer. Total samples: {len(df_combined)}")
                return True
            except Exception as e:
                print(f"❌ Error adding sample to buffer: {e}")
                return False

    def get_buffer_size(self) -> int:
        """Get number of samples in buffer"""
        try:
            if self.buffer_file.exists():
                df = pd.read_csv(self.buffer_file)
                return len(df)
            return 0
        except:
            return 0

    def get_buffer_data(self) -> pd.DataFrame:
        """Get all buffered samples"""
        if self.buffer_file.exists():
            return pd.read_csv(self.buffer_file)
        return pd.DataFrame()

    def clear_buffer(self):
        """Clear the buffer after successful retraining"""
        with self.lock:
            self._initialize_buffer()
            print("✅ Buffer cleared")


class ModelVersioning:
    """Track model versions and performance over time"""

    def __init__(self):
        self.version_file = MODEL_VERSION_FILE
        self.versions = self._load_versions()

    def _load_versions(self) -> List[Dict]:
        """Load version history"""
        if self.version_file.exists():
            with open(self.version_file, 'r') as f:
                return json.load(f)
        return []

    def _save_versions(self):
        """Save version history"""
        with open(self.version_file, 'w') as f:
            json.dump(self.versions, f, indent=2)

    def add_version(self, metrics: Dict, training_samples: int, new_samples: int = 0):
        """Add a new model version"""
        version = {
            'version': len(self.versions) + 1,
            'timestamp': datetime.now().isoformat(),
            'metrics': metrics,
            'training_samples': training_samples,
            'new_samples_added': new_samples
        }
        self.versions.append(version)
        self._save_versions()
        print(f"✅ Model version {version['version']} saved")
        return version

    def get_latest_version(self) -> Optional[Dict]:
        """Get the latest model version"""
        return self.versions[-1] if self.versions else None

    def get_version_history(self) -> List[Dict]:
        """Get all versions"""
        return self.versions


class OnlineModelUpdater:
    """Handle incremental model updates"""

    def __init__(self):
        self.buffer = OnlineLearningBuffer()
        self.versioning = ModelVersioning()
        self.training_data_file = DATA_DIR / 'training_data.csv'
        self.historical_data_file = DATA_DIR / 'historical_training_data.csv'

    def should_retrain(self) -> bool:
        """Check if model should be retrained"""
        buffer_size = self.buffer.get_buffer_size()

        # Check buffer threshold
        if buffer_size >= RETRAIN_THRESHOLD:
            print(f"🔄 Retrain triggered: Buffer size ({buffer_size}) >= threshold ({RETRAIN_THRESHOLD})")
            return True

        # Check time-based retraining
        latest_version = self.versioning.get_latest_version()
        if latest_version:
            last_training = datetime.fromisoformat(latest_version['timestamp'])
            hours_since_training = (datetime.now() - last_training).total_seconds() / 3600

            if hours_since_training >= AUTO_RETRAIN_INTERVAL_HOURS:
                print(f"🔄 Retrain triggered: {hours_since_training:.1f} hours since last training")
                return True

        return False

    def merge_training_data(self) -> pd.DataFrame:
        """Merge historical data with new buffer data"""
        print("\n[MERGE] Merging historical data with new samples...")

        # Load historical data
        if self.training_data_file.exists():
            df_historical = pd.read_csv(self.training_data_file)
            print(f"✅ Loaded {len(df_historical)} historical samples")
        else:
            print("⚠️ No historical data found")
            df_historical = pd.DataFrame()

        # Load buffer data
        df_new = self.buffer.get_buffer_data()
        new_samples_count = len(df_new)

        if new_samples_count > 0:
            print(f"✅ Loaded {new_samples_count} new samples from buffer")

            # Combine data
            df_combined = pd.concat([df_historical, df_new], ignore_index=True)

            # Remove duplicates based on timestamp and location
            df_combined = df_combined.drop_duplicates(
                subset=['timestamp', 'location', 'itemType'],
                keep='last'
            )

            print(f"✅ Combined dataset: {len(df_combined)} total samples")

            # Save updated training data
            df_combined.to_csv(self.training_data_file, index=False)

            # Backup historical data
            if not self.historical_data_file.exists():
                df_combined.to_csv(self.historical_data_file, index=False)

            return df_combined, new_samples_count
        else:
            print("⚠️ No new samples to merge")
            return df_historical, 0

    def retrain_model(self) -> Dict:
        """Retrain the model with updated data"""
        print("\n" + "="*70)
        print("🔄 STARTING INCREMENTAL MODEL RETRAINING")
        print("="*70)

        try:
            # Merge data
            df_combined, new_samples_count = self.merge_training_data()

            if len(df_combined) == 0:
                return {
                    'success': False,
                    'message': 'No training data available',
                    'timestamp': datetime.now().isoformat()
                }

            # Import and use existing training pipeline
            from train import RiskPredictor

            predictor = RiskPredictor()

            # Prepare data
            df_combined = predictor.load_and_prepare_data(self.training_data_file)
            df_combined = predictor.create_predictive_labels(df_combined, prediction_window_hours=2)
            df_combined = predictor.engineer_features(df_combined)

            # Train/test split
            X_train, X_test, y_train, y_test = predictor.prepare_train_test(df_combined)

            # Train models
            predictor.train_baseline(X_train, y_train)
            results = predictor.train_models(X_train, y_train, X_test, y_test)

            # Evaluate
            predictor.evaluate(X_test, y_test)
            predictor.compute_feature_importance(X_train)

            # Save model
            predictor.save_model()

            # Update version (ensure metrics are JSON-serializable)
            def make_json_safe(obj):
                """Convert numpy types to Python types"""
                if isinstance(obj, (np.integer, np.floating)):
                    return float(obj)
                elif isinstance(obj, np.ndarray):
                    return obj.tolist()
                elif isinstance(obj, dict):
                    return {k: make_json_safe(v) for k, v in obj.items()}
                elif isinstance(obj, (list, tuple)):
                    return [make_json_safe(item) for item in obj]
                else:
                    return obj

            json_safe_metrics = {
                k: make_json_safe(v)
                for k, v in predictor.metrics.items()
                if not k.startswith('model') and not callable(v) and not hasattr(v, 'predict')
            }
            version = self.versioning.add_version(
                metrics=json_safe_metrics,
                training_samples=len(df_combined),
                new_samples=new_samples_count
            )

            # Clear buffer
            self.buffer.clear_buffer()

            print("\n" + "="*70)
            print("✅ INCREMENTAL RETRAINING COMPLETE!")
            print("="*70)
            print(f"Version: {version['version']}")
            print(f"New samples added: {new_samples_count}")
            print(f"Total training samples: {len(df_combined)}")
            print(f"Accuracy: {predictor.metrics.get('accuracy', 0):.2%}")
            print(f"F1-Score: {predictor.metrics.get('f1_score', 0):.2%}")
            print("="*70)

            return {
                'success': True,
                'version': version['version'],
                'new_samples_added': new_samples_count,
                'total_samples': len(df_combined),
                'metrics': json_safe_metrics,
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            print(f"\n❌ Retraining failed: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }

    def add_lost_item_report(self, report: Dict) -> Dict:
        """
        Add a new lost item report to the training buffer

        Args:
            report: Dictionary containing:
                - location: Location where item was lost
                - itemType: Type of item (phone, wallet, keys, etc.)
                - crowdLevel: Crowd level at that time (Low, Medium, High)
                - weather: Weather condition
                - dayType: Weekday or Weekend
                - time: Time in HH:MM format
                - lostCount: Historical lost count for this location
                - incident_occurred: 1 if incident, 0 if no incident
        """
        print(f"\n📥 Receiving new lost item report: {report.get('location')} - {report.get('itemType')}")

        # Add timestamp if not present
        if 'timestamp' not in report:
            report['timestamp'] = datetime.now().isoformat()

        # Add to buffer
        success = self.buffer.add_sample(report)

        if not success:
            return {
                'success': False,
                'message': 'Failed to add report to buffer'
            }

        # Check if retraining should be triggered
        buffer_size = self.buffer.get_buffer_size()
        should_retrain = self.should_retrain()

        response = {
            'success': True,
            'message': 'Report added to training buffer',
            'buffer_size': buffer_size,
            'retrain_threshold': RETRAIN_THRESHOLD,
            'will_retrain_soon': should_retrain
        }

        # Auto-retrain if threshold reached
        if should_retrain:
            print("\n🔄 Auto-triggering model retraining...")
            retrain_result = self.retrain_model()
            response['retrain_result'] = retrain_result

        return response


# Global instance
online_updater = OnlineModelUpdater()


def add_lost_item(report: Dict) -> Dict:
    """Convenience function to add a lost item report"""
    return online_updater.add_lost_item_report(report)


def trigger_retraining() -> Dict:
    """Manually trigger model retraining"""
    return online_updater.retrain_model()


def get_buffer_status() -> Dict:
    """Get current buffer status"""
    buffer_size = online_updater.buffer.get_buffer_size()
    latest_version = online_updater.versioning.get_latest_version()

    return {
        'buffer_size': buffer_size,
        'retrain_threshold': RETRAIN_THRESHOLD,
        'should_retrain': online_updater.should_retrain(),
        'latest_version': latest_version,
        'total_versions': len(online_updater.versioning.versions)
    }


def get_model_versions() -> List[Dict]:
    """Get all model versions"""
    return online_updater.versioning.get_version_history()


if __name__ == '__main__':
    # Test the online learning system
    print("\n" + "="*70)
    print("ONLINE LEARNING SYSTEM TEST")
    print("="*70)

    # Test adding a sample
    test_report = {
        'location': 'Library',
        'itemType': 'phone',
        'crowdLevel': 'High',
        'weather': 'Sunny',
        'dayType': 'Weekday',
        'time': '14:30',
        'lostCount': 5,
        'timestamp': datetime.now().isoformat(),
        'incident_occurred': 1
    }

    result = add_lost_item(test_report)
    print("\n✅ Test report added:")
    print(json.dumps(result, indent=2))

    # Check status
    status = get_buffer_status()
    print("\n📊 Buffer Status:")
    print(json.dumps(status, indent=2))
