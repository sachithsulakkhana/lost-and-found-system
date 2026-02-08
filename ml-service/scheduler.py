"""
Automatic Retraining Scheduler for Online Learning

This module handles scheduled automatic retraining of the ML model:
- Runs periodic checks for retraining needs
- Triggers retraining based on time intervals
- Monitors buffer size and triggers retraining when threshold is reached
- Can be integrated with cron jobs or background tasks
"""

import schedule
import time
import threading
from datetime import datetime
from pathlib import Path
import json

try:
    from online_learning import (
        online_updater,
        get_buffer_status,
        trigger_retraining
    )
    ONLINE_LEARNING_AVAILABLE = True
except ImportError:
    ONLINE_LEARNING_AVAILABLE = False
    print("⚠️ Online learning module not available")


class RetrainingScheduler:
    """Scheduler for automatic model retraining"""

    def __init__(self, check_interval_minutes=60):
        """
        Initialize scheduler

        Args:
            check_interval_minutes: How often to check if retraining is needed (default: 60 minutes)
        """
        self.check_interval = check_interval_minutes
        self.is_running = False
        self.thread = None
        self.last_check = None
        self.last_retrain = None

    def check_and_retrain(self):
        """Check if retraining is needed and trigger it"""
        if not ONLINE_LEARNING_AVAILABLE:
            print("⚠️ Online learning not available, skipping check")
            return

        self.last_check = datetime.now()
        print(f"\n[SCHEDULER] Checking retraining needs at {self.last_check.strftime('%Y-%m-%d %H:%M:%S')}")

        try:
            # Check buffer status
            status = get_buffer_status()
            buffer_size = status.get('buffer_size', 0)
            should_retrain = status.get('should_retrain', False)

            print(f"[SCHEDULER] Buffer size: {buffer_size}")
            print(f"[SCHEDULER] Should retrain: {should_retrain}")

            if should_retrain:
                print(f"\n[SCHEDULER] 🔄 Triggering automatic retraining...")
                result = trigger_retraining()

                if result.get('success'):
                    self.last_retrain = datetime.now()
                    print(f"[SCHEDULER] ✅ Retraining completed successfully")
                    print(f"[SCHEDULER] Version: {result.get('version')}")
                    print(f"[SCHEDULER] New samples: {result.get('new_samples_added')}")
                else:
                    print(f"[SCHEDULER] ❌ Retraining failed: {result.get('error')}")
            else:
                print(f"[SCHEDULER] ℹ️ No retraining needed at this time")

        except Exception as e:
            print(f"[SCHEDULER] ❌ Error during check: {e}")
            import traceback
            traceback.print_exc()

    def run_scheduler(self):
        """Run the scheduler in a loop"""
        print(f"\n[SCHEDULER] Starting automatic retraining scheduler")
        print(f"[SCHEDULER] Check interval: {self.check_interval} minutes")

        # Schedule the job
        schedule.every(self.check_interval).minutes.do(self.check_and_retrain)

        # Also do an immediate check
        self.check_and_retrain()

        # Run the scheduler
        self.is_running = True
        while self.is_running:
            schedule.run_pending()
            time.sleep(60)  # Check every minute if any scheduled job needs to run

    def start_background(self):
        """Start the scheduler in a background thread"""
        if self.thread and self.thread.is_alive():
            print("[SCHEDULER] Scheduler already running")
            return

        print("[SCHEDULER] Starting scheduler in background thread")
        self.thread = threading.Thread(target=self.run_scheduler, daemon=True)
        self.thread.start()
        print("[SCHEDULER] ✅ Background scheduler started")

    def stop(self):
        """Stop the scheduler"""
        print("[SCHEDULER] Stopping scheduler...")
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=5)
        print("[SCHEDULER] ✅ Scheduler stopped")

    def get_status(self):
        """Get scheduler status"""
        return {
            'is_running': self.is_running,
            'check_interval_minutes': self.check_interval,
            'last_check': self.last_check.isoformat() if self.last_check else None,
            'last_retrain': self.last_retrain.isoformat() if self.last_retrain else None
        }


# Global scheduler instance
scheduler = None


def start_scheduler(check_interval_minutes=60):
    """Start the global scheduler"""
    global scheduler

    if not ONLINE_LEARNING_AVAILABLE:
        print("⚠️ Cannot start scheduler: Online learning not available")
        return None

    if scheduler is None:
        scheduler = RetrainingScheduler(check_interval_minutes)

    scheduler.start_background()
    return scheduler


def stop_scheduler():
    """Stop the global scheduler"""
    global scheduler

    if scheduler:
        scheduler.stop()
        scheduler = None


def get_scheduler_status():
    """Get status of the global scheduler"""
    if scheduler:
        return scheduler.get_status()
    return {
        'is_running': False,
        'message': 'Scheduler not started'
    }


if __name__ == '__main__':
    # Test the scheduler
    print("\n" + "="*70)
    print("TESTING AUTOMATIC RETRAINING SCHEDULER")
    print("="*70)

    # Start with 1-minute intervals for testing
    test_scheduler = RetrainingScheduler(check_interval_minutes=1)

    try:
        print("\nStarting scheduler (will run for 5 minutes)...")
        test_scheduler.start_background()

        # Let it run for 5 minutes
        time.sleep(300)

        print("\nStopping scheduler...")
        test_scheduler.stop()

        print("\n✅ Scheduler test completed")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        test_scheduler.stop()
