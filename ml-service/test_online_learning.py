"""
Test Script for Online Learning System

This script demonstrates the real-time online learning capabilities
by simulating multiple lost item reports.
"""

import requests
import time
import json
from datetime import datetime
import random

BASE_URL = "http://localhost:5001"

# Sample data
LOCATIONS = ["Library", "Cafeteria", "Parking Lot", "Gym", "Classroom A", "Lab"]
ITEM_TYPES = ["phone", "wallet", "keys", "laptop", "bag", "watch"]
CROWD_LEVELS = ["Low", "Medium", "High"]
WEATHER_CONDITIONS = ["Sunny", "Rainy", "Cloudy"]
DAY_TYPES = ["Weekday", "Weekend"]


def print_header(text):
    """Print a formatted header"""
    print("\n" + "="*70)
    print(f"  {text}")
    print("="*70)


def print_success(text):
    """Print success message"""
    print(f"✅ {text}")


def print_info(text):
    """Print info message"""
    print(f"ℹ️  {text}")


def print_error(text):
    """Print error message"""
    print(f"❌ {text}")


def check_service_health():
    """Check if ML service is running"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print_success("ML Service is running")
            return True
        else:
            print_error("ML Service returned error")
            return False
    except requests.exceptions.RequestException as e:
        print_error(f"Cannot connect to ML Service: {e}")
        print_info("Make sure the service is running: python main.py")
        return False


def get_online_learning_info():
    """Get online learning system information"""
    try:
        response = requests.get(f"{BASE_URL}/api/online-learning/info")
        if response.status_code == 200:
            info = response.json()
            if info.get('available'):
                print_success("Online Learning is available")
                print_info(f"  Retrain threshold: {info['retrain_threshold']} samples")
                print_info(f"  Auto-retrain interval: {info['auto_retrain_interval_hours']} hours")
                return True
            else:
                print_error("Online Learning is not available")
                return False
        else:
            print_error("Failed to get online learning info")
            return False
    except requests.exceptions.RequestException as e:
        print_error(f"Error getting info: {e}")
        return False


def get_buffer_status():
    """Get current buffer status"""
    try:
        response = requests.get(f"{BASE_URL}/api/online-learning/buffer-status")
        if response.status_code == 200:
            status = response.json()
            print_info(f"Buffer size: {status['buffer_size']}/{status['retrain_threshold']}")
            print_info(f"Should retrain: {status['should_retrain']}")
            return status
        else:
            print_error("Failed to get buffer status")
            return None
    except requests.exceptions.RequestException as e:
        print_error(f"Error getting buffer status: {e}")
        return None


def report_lost_item(location, item_type, crowd_level, time_str):
    """Report a lost item"""
    try:
        data = {
            "location": location,
            "itemType": item_type,
            "crowdLevel": crowd_level,
            "weather": random.choice(WEATHER_CONDITIONS),
            "dayType": random.choice(DAY_TYPES),
            "time": time_str,
            "lostCount": random.randint(1, 10),
            "incident_occurred": 1,
            "timestamp": datetime.now().isoformat()
        }

        response = requests.post(
            f"{BASE_URL}/api/online-learning/report-lost-item",
            json=data
        )

        if response.status_code == 200:
            result = response.json()
            print_success(f"Reported: {item_type} at {location}")
            print_info(f"  Buffer: {result['buffer_status']['buffer_size']}/{result['buffer_status']['retrain_threshold']}")

            if result.get('retrain_triggered'):
                print_success("🔄 RETRAINING TRIGGERED!")
                retrain_result = result.get('retrain_result', {})
                if retrain_result.get('success'):
                    print_success(f"  New model version: {retrain_result.get('version')}")
                    print_success(f"  Accuracy: {retrain_result.get('metrics', {}).get('accuracy', 0):.2%}")

            return result
        else:
            print_error(f"Failed to report item: {response.status_code}")
            return None

    except requests.exceptions.RequestException as e:
        print_error(f"Error reporting item: {e}")
        return None


def get_model_versions():
    """Get all model versions"""
    try:
        response = requests.get(f"{BASE_URL}/api/online-learning/versions")
        if response.status_code == 200:
            data = response.json()
            versions = data.get('versions', [])

            if versions:
                print_header("MODEL VERSION HISTORY")
                for v in versions:
                    print(f"\n  Version {v['version']} - {v['timestamp']}")
                    metrics = v.get('metrics', {})
                    print(f"    Accuracy: {metrics.get('accuracy', 0):.2%}")
                    print(f"    F1-Score: {metrics.get('f1_score', 0):.2%}")
                    print(f"    Training samples: {v['training_samples']}")
                    print(f"    New samples added: {v['new_samples_added']}")
            else:
                print_info("No model versions yet")

            return versions
        else:
            print_error("Failed to get model versions")
            return None
    except requests.exceptions.RequestException as e:
        print_error(f"Error getting versions: {e}")
        return None


def simulate_reports(num_reports=10):
    """Simulate multiple lost item reports"""
    print_header(f"SIMULATING {num_reports} LOST ITEM REPORTS")

    for i in range(num_reports):
        location = random.choice(LOCATIONS)
        item_type = random.choice(ITEM_TYPES)
        crowd_level = random.choice(CROWD_LEVELS)
        hour = random.randint(8, 20)
        minute = random.randint(0, 59)
        time_str = f"{hour:02d}:{minute:02d}"

        print(f"\n[{i+1}/{num_reports}] ", end="")
        report_lost_item(location, item_type, crowd_level, time_str)

        # Small delay between reports
        time.sleep(0.5)


def trigger_manual_retraining():
    """Manually trigger retraining"""
    print_header("TRIGGERING MANUAL RETRAINING")

    try:
        response = requests.post(f"{BASE_URL}/api/online-learning/trigger-retraining")
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print_success("Retraining completed successfully!")
                print_info(f"  Version: {result.get('version')}")
                print_info(f"  New samples added: {result.get('new_samples_added')}")
                print_info(f"  Total samples: {result.get('total_samples')}")
                metrics = result.get('metrics', {})
                print_info(f"  Accuracy: {metrics.get('accuracy', 0):.2%}")
                print_info(f"  F1-Score: {metrics.get('f1_score', 0):.2%}")
            else:
                print_error(f"Retraining failed: {result.get('error')}")
        else:
            print_error(f"Failed to trigger retraining: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print_error(f"Error triggering retraining: {e}")


def main():
    """Main test function"""
    print_header("ONLINE LEARNING SYSTEM TEST")

    # Step 1: Check service health
    print("\n[1/6] Checking ML Service...")
    if not check_service_health():
        return

    # Step 2: Check online learning availability
    print("\n[2/6] Checking Online Learning System...")
    if not get_online_learning_info():
        return

    # Step 3: Get initial buffer status
    print("\n[3/6] Getting Initial Buffer Status...")
    initial_status = get_buffer_status()

    # Step 4: Simulate lost item reports
    print("\n[4/6] Simulating Lost Item Reports...")
    simulate_reports(num_reports=10)

    # Step 5: Check buffer status after reports
    print("\n[5/6] Checking Buffer Status After Reports...")
    final_status = get_buffer_status()

    # Step 6: View model versions
    print("\n[6/6] Viewing Model Version History...")
    get_model_versions()

    # Summary
    print_header("TEST SUMMARY")
    if initial_status and final_status:
        print(f"  Initial buffer size: {initial_status['buffer_size']}")
        print(f"  Final buffer size: {final_status['buffer_size']}")
        print(f"  Reports added: {final_status['buffer_size'] - initial_status['buffer_size']}")

    print("\n" + "="*70)
    print("✅ TEST COMPLETED SUCCESSFULLY!")
    print("="*70)

    # Interactive menu
    print("\nWhat would you like to do next?")
    print("  1. Add more reports")
    print("  2. Trigger manual retraining")
    print("  3. View model versions")
    print("  4. Check buffer status")
    print("  5. Exit")

    choice = input("\nEnter choice (1-5): ").strip()

    if choice == "1":
        num = input("How many reports? (default 10): ").strip()
        num = int(num) if num.isdigit() else 10
        simulate_reports(num)
        main()  # Show menu again
    elif choice == "2":
        trigger_manual_retraining()
        main()
    elif choice == "3":
        get_model_versions()
        main()
    elif choice == "4":
        get_buffer_status()
        main()
    elif choice == "5":
        print("\n👋 Goodbye!")
        return
    else:
        print_info("Invalid choice, exiting...")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
