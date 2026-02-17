"""
Generate realistic training data for the Lost & Found ML model.

The training pipeline creates labels from temporal density:
- If a zone has another record within 2 hours → incident_next_window = 1 (HIGH risk)
- If no record within 2 hours → incident_next_window = 0 (LOW risk)

So high-traffic zones (cafeterias) get frequent records → labeled HIGH risk.
Low-traffic zones (storage cabins) get sparse records → labeled LOW risk.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random

random.seed(42)
np.random.seed(42)

# ── Zone definitions ──────────────────────────────────────────────────────────
# freq_hours: average hours between records (lower = higher risk)
# active:     (start_hour, end_hour) when the zone is used
ZONES = {
    # Very high traffic – canteens / cafeterias
    'P and S Cafeteria':                {'freq': 1.1, 'active': (8, 20)},
    'Anohana Canteen':                  {'freq': 1.3, 'active': (8, 18)},
    'Bird Nest Canteen':                {'freq': 1.4, 'active': (8, 18)},
    'Basement Canteen':                 {'freq': 1.8, 'active': (9, 17)},
    'New Building Canteen':             {'freq': 2.0, 'active': (9, 17)},
    'Juice Bar':                        {'freq': 2.2, 'active': (9, 17)},
    # Medium traffic – libraries and study areas
    'Library':                          {'freq': 2.4, 'active': (8, 22)},
    'Old Library Space':                {'freq': 2.8, 'active': (8, 20)},
    'Bird Nest Study Area':             {'freq': 3.0, 'active': (8, 20)},
    'Business Faculty Study Area':      {'freq': 3.0, 'active': (9, 19)},
    'Study Area 4th Floor New Building':{'freq': 3.2, 'active': (9, 20)},
    '3rd Floor Study Area':             {'freq': 3.5, 'active': (9, 20)},
    # Low traffic – secured storage areas
    'New Building Bio Laboratory outside space Storage Cabins':              {'freq': 6.5, 'active': (8, 18)},
    'Main building 4th floor B401 Laboratory outside space Storage Cabins': {'freq': 6.5, 'active': (8, 18)},
    'Main Building 5th floor outside space Storage Cabin':                  {'freq': 6.5, 'active': (8, 18)},
    'Library outdoor Space storage':                                         {'freq': 5.5, 'active': (8, 18)},
}

ITEM_TYPES  = ['phone', 'laptop', 'document', 'keys', 'wallet', 'bag', 'other']
WEATHER     = ['sunny', 'sunny', 'sunny', 'cloudy', 'cloudy', 'rainy', 'stormy']


def crowd_for(hour, is_weekend):
    if is_weekend:
        return random.choice(['high', 'very_high', 'high', 'medium']) if 8 <= hour < 18 else 'low'
    if hour in (8, 12, 13):
        return 'very_high'
    if 9 <= hour < 18:
        return random.choice(['medium', 'high', 'high'])
    return 'low'


records = []
start = datetime(2024, 10, 1)
end   = datetime(2025, 1, 1)   # 3 months of data

for zone, cfg in ZONES.items():
    cur = start
    while cur < end:
        hour = cur.hour
        a_start, a_end = cfg['active']

        if a_start <= hour < a_end:
            is_weekend = cur.weekday() >= 5
            records.append({
                'location':         zone,
                'time':             cur.strftime('%H:%M'),
                'itemType':         random.choice(ITEM_TYPES),
                'crowdLevel':       crowd_for(hour, is_weekend),
                'lostCount':        max(1, int(np.random.poisson(8.0 / cfg['freq']))),
                'weather':          random.choice(WEATHER),
                'dayType':          'weekend' if is_weekend else 'weekday',
                'timestamp':        cur.strftime('%Y-%m-%d %H:%M:%S'),
                'incident_occurred': '',
                'reported_at':      '',
            })

        # Advance by freq ± 30 % noise, then jump to next active window if needed
        cur += timedelta(hours=cfg['freq'] * random.uniform(0.7, 1.3))

df = pd.DataFrame(records)
df = df.sort_values('timestamp').reset_index(drop=True)

out = 'data/training_data.csv'
df.to_csv(out, index=False)

print(f"[OK] Generated {len(df):,} records across {df['location'].nunique()} zones")
print(f"     Saved to {out}")
print("\nRecords per zone:")
counts = df.groupby('location').size().sort_values(ascending=False)
for zone, n in counts.items():
    print(f"   {zone:<65} {n:>4}")
