import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

function Pill({ tone = 'secondary', icon, children }) {
  const cls = tone === 'success'
    ? 'bg-success-subtle text-success border border-success-subtle'
    : tone === 'warning'
      ? 'bg-warning-subtle text-warning border border-warning-subtle'
      : tone === 'danger'
        ? 'bg-danger-subtle text-danger border border-danger-subtle'
        : tone === 'info'
          ? 'bg-info-subtle text-info border border-info-subtle'
          : 'bg-light text-muted border';

  return (
    <span className={`badge rounded-pill ${cls} px-3 py-2 fw-semibold`}>
      {icon ? <i className={`mdi ${icon} me-1`} /> : null}
      {children}
    </span>
  );
}

function StatTile({ icon, label, value, hint }) {
  return (
    <div className="card cp-stat h-100">
      <div className="card-body d-flex align-items-center justify-content-between">
        <div>
          <div className="label">{label}</div>
          <div className="value">{value}</div>
          {hint ? <div className="small text-muted mt-1">{hint}</div> : null}
        </div>
        <div className="icon"><i className={`mdi ${icon}`} /></div>
      </div>
    </div>
  );
}

export default function RiskDashboardPage() {
  const [heatmapData, setHeatmapData] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [locationDetails, setLocationDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentConditions, setCurrentConditions] = useState(null);

  useEffect(() => {
    loadHeatmap();
    loadStatistics();

    if (!autoRefresh) return undefined;
    const interval = setInterval(() => {
      loadHeatmap();
      loadStatistics();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  useEffect(() => {
    if (selectedZone?.location) loadLocationDetails(selectedZone.location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZone]);

  const loadHeatmap = async () => {
    try {
      const response = await api.get('/ml-training/heatmap');
      setHeatmapData(response.data);
      setCurrentConditions(response.data?.conditions || null);
    } catch (error) {
      // Keep UI stable even if ML service is temporarily down
      console.warn('Heatmap unavailable:', error?.response?.status || error?.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLocationDetails = async (location) => {
    try {
      if (heatmapData?.locations) {
        const loc = heatmapData.locations.find((l) => l.location === location);
        if (loc) {
          setLocationDetails({
            loaded: true,
            location: loc.location,
            riskLevel: loc.riskLevel,
            riskScore: loc.riskScore,
            confidence: loc.confidence,
            rfPrediction: loc.rfPrediction,
            nnPrediction: loc.nnPrediction,
          });
        }
      }
    } catch (error) {
      console.warn('Location details unavailable:', error?.message);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await api.get('/ml-training/stats');
      setStatistics(response.data);
    } catch (error) {
      console.warn('ML stats unavailable:', error?.response?.status || error?.message);
    }
  };

  const groupedByRisk = useMemo(() => {
    const grouped = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
    (heatmapData?.locations || []).forEach((loc) => {
      if (grouped[loc.riskLevel]) grouped[loc.riskLevel].push(loc);
    });
    return grouped;
  }, [heatmapData]);

  const riskTone = (level) => {
    if (level === 'CRITICAL') return 'danger';
    if (level === 'HIGH') return 'warning';
    if (level === 'MEDIUM') return 'info';
    if (level === 'LOW') return 'success';
    return 'secondary';
  };

  const weatherLabel = (w) => {
    if (w === 'sunny') return { label: 'Sunny', icon: 'mdi-weather-sunny' };
    if (w === 'rainy') return { label: 'Rainy', icon: 'mdi-weather-pouring' };
    if (w === 'cloudy') return { label: 'Cloudy', icon: 'mdi-weather-cloudy' };
    if (w === 'stormy') return { label: 'Stormy', icon: 'mdi-weather-lightning' };
    return { label: '—', icon: 'mdi-weather-partly-cloudy' };
  };

  const crowdLabel = (c) => {
    if (!c) return '—';
    return c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  };

  if (loading) {
    return (
      <div className="container-fluid">
        <div className="card">
          <div className="card-body">
            <div className="d-flex align-items-center gap-2 text-muted">
              <span className="spinner-border spinner-border-sm" role="status" /> Loading real-time risk data…
            </div>
            <div className="progress mt-3" style={{ height: 6 }}>
              <div className="progress-bar" style={{ width: '45%' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-start justify-content-between mb-4">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <i className="mdi mdi-robot-outline text-primary" /> XGBoost Risk Dashboard
          </h2>
          <div className="text-muted small">XGBoost Gradient Boosting · Real-time conditions via Open-Meteo</div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <div className="form-check form-switch m-0">
            <input
              className="form-check-input"
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <label className="form-check-label small text-muted" htmlFor="autoRefresh">Auto-refresh (30s)</label>
          </div>
        </div>
      </div>

      {currentConditions ? (
        <div className="card mb-4">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="fw-bold d-flex align-items-center gap-2">
                <i className="mdi mdi-weather-partly-cloudy" /> Current Conditions
              </div>
              <span className="text-muted small">Updated {new Date().toLocaleTimeString()}</span>
            </div>

            <div className="row g-3">
              <div className="col-md-3">
                <div className="p-3 bg-light border rounded-3 h-100">
                  <div className="text-muted small">Weather</div>
                  <div className="fw-bold mt-1 d-flex align-items-center gap-2">
                    <i className={`mdi ${weatherLabel(currentConditions.weather).icon}`} /> {weatherLabel(currentConditions.weather).label}
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="p-3 bg-light border rounded-3 h-100">
                  <div className="text-muted small">Crowd Level</div>
                  <div className="fw-bold mt-1 d-flex align-items-center gap-2">
                    <i className="mdi mdi-account-group" /> {crowdLabel(currentConditions.crowdLevel)}
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="p-3 bg-light border rounded-3 h-100">
                  <div className="text-muted small">Time</div>
                  <div className="fw-bold mt-1 d-flex align-items-center gap-2">
                    <i className="mdi mdi-clock-outline" /> {currentConditions.time || '—'}
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="p-3 bg-light border rounded-3 h-100">
                  <div className="text-muted small">Day Type</div>
                  <div className="fw-bold mt-1 d-flex align-items-center gap-2">
                    <i className="mdi mdi-calendar" /> {currentConditions.dayType === 'weekend' ? 'Weekend' : 'Weekday'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 small text-muted">
              <i className="mdi mdi-information-outline me-1" /> Risk scores update as real-time conditions change.
            </div>
          </div>
        </div>
      ) : null}

      {statistics?.trained && statistics?.trainingStats ? (
        <div className="row g-4 mb-4">
          <div className="col-md-4">
            <StatTile icon="mdi-chart-tree" label="XGBoost Model" value={`${statistics.trainingStats.rfAccuracy}%`} />
          </div>
          <div className="col-md-4">
            <StatTile icon="mdi-brain" label="Training Accuracy" value={`${statistics.trainingStats.nnAccuracy}%`} />
          </div>
          <div className="col-md-4">
            <StatTile icon="mdi-bullseye-arrow" label="Test Accuracy" value={`${statistics.trainingStats.ensembleAccuracy}%`} />
          </div>
        </div>
      ) : null}

      <div className="row g-4">
        <div className="col-xl-7">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h5 className="card-title mb-0">Campus Risk Map</h5>
                <span className="text-muted small">Select a location</span>
              </div>

              <div className="d-flex gap-2 flex-wrap mb-3">
                <Pill tone="danger" icon="mdi-alert">Critical {groupedByRisk.CRITICAL.length}</Pill>
                <Pill tone="warning" icon="mdi-fire">High {groupedByRisk.HIGH.length}</Pill>
                <Pill tone="info" icon="mdi-alert-circle-outline">Medium {groupedByRisk.MEDIUM.length}</Pill>
                <Pill tone="success" icon="mdi-check-circle-outline">Low {groupedByRisk.LOW.length}</Pill>
              </div>

              <div className="list-group list-group-flush" style={{ maxHeight: 520, overflow: 'auto' }}>
                {(heatmapData?.locations || []).map((loc) => (
                  <button
                    key={loc.location}
                    type="button"
                    className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between ${selectedZone?.location === loc.location ? 'active' : ''}`}
                    onClick={() => setSelectedZone(loc)}
                    style={{ border: 0, borderRadius: 12, marginBottom: 10 }}
                  >
                    <div>
                      <div className="fw-semibold">{loc.location}</div>
                      <div className={`small ${selectedZone?.location === loc.location ? 'text-white-50' : 'text-muted'}`}>Risk Score: {loc.riskScore?.toFixed(2) || '0.00'}%</div>
                    </div>
                    <Pill tone={riskTone(loc.riskLevel)} icon="mdi-speedometer">{loc.riskLevel}</Pill>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-5">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h5 className="card-title mb-0">Location Details</h5>
                {locationDetails?.riskLevel ? <Pill tone={riskTone(locationDetails.riskLevel)} icon="mdi-alert">{locationDetails.riskLevel}</Pill> : null}
              </div>

              {!locationDetails ? (
                <div className="text-center text-muted py-5">
                  <i className="mdi mdi-map-marker-radius fs-2 d-block mb-2 opacity-50" />
                  Select a location to view XGBoost prediction details.
                </div>
              ) : (
                <>
                  <div className="p-3 bg-light border rounded-3 mb-3">
                    <div className="fw-bold">{locationDetails.location}</div>
                    <div className="text-muted small">Risk Score: {locationDetails.riskScore?.toFixed(2) || '0.00'}%</div>
                  </div>

                  <div className="row g-3">
                    <div className="col-md-6">
                      <div className="p-3 border rounded-3 h-100">
                        <div className="text-muted small">XGBoost Prediction</div>
                        <div className="fw-bold fs-4">{locationDetails.rfPrediction?.toFixed(2) || '0.00'}%</div>
                        <div className="text-muted small">Predicted risk</div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="p-3 border rounded-3 h-100">
                        <div className="text-muted small">Model Confidence</div>
                        <div className="fw-bold fs-4">{locationDetails.nnPrediction?.toFixed(2) || '0.00'}%</div>
                        <div className="text-muted small">Confidence score</div>
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="p-3 border rounded-3">
                        <div className="text-muted small">Final Risk Assessment</div>
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="fw-bold fs-4">{locationDetails.riskScore?.toFixed(2) || '0.00'}%</div>
                          <Pill tone={riskTone(locationDetails.riskLevel)} icon="mdi-bullseye-arrow">{locationDetails.riskLevel}</Pill>
                        </div>
                        <div className="progress mt-2" style={{ height: 8 }}>
                          <div className="progress-bar" role="progressbar" style={{ width: `${locationDetails.riskScore || 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
