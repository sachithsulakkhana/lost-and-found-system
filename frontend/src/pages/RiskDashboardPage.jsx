import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
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

function getUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

const ITEM_TYPES = ['Phone', 'Laptop', 'Bag', 'Keys', 'Documents', 'Wallet', 'Other'];

export default function RiskDashboardPage() {
  const [activeTab, setActiveTab] = useState('risk-zones');

  // --- Risk Zones tab state ---
  const [heatmapData, setHeatmapData] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [locationDetails, setLocationDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentConditions, setCurrentConditions] = useState(null);

  // --- Incident Reporting tab state ---
  const [incidentForm, setIncidentForm] = useState({ location: '', itemType: 'Phone', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [lastIncidentResult, setLastIncidentResult] = useState(null);
  const [bufferStatus, setBufferStatus] = useState(null);
  const [bufferLoading, setBufferLoading] = useState(false);
  const [modelVersions, setModelVersions] = useState(null);
  const [forceRetraining, setForceRetraining] = useState(false);

  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role === 'admin';

  // ---- Risk zones data ----
  useEffect(() => {
    loadHeatmap();
    loadStatistics();
    if (!autoRefresh) return undefined;
    const interval = setInterval(() => { loadHeatmap(); loadStatistics(); }, 30000);
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
      // Pre-select first zone for incident form
      if (response.data?.locations?.length && !incidentForm.location) {
        setIncidentForm(prev => ({ ...prev, location: response.data.locations[0].location }));
      }
    } catch (error) {
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

  // ---- Incident Reporting ----
  const loadBufferStatus = useCallback(async () => {
    setBufferLoading(true);
    try {
      const { data } = await api.get('/ml-training/buffer-status');
      setBufferStatus(data);
    } catch {
      setBufferStatus(null);
    } finally {
      setBufferLoading(false);
    }
  }, []);

  const loadModelVersions = useCallback(async () => {
    try {
      const { data } = await api.get('/ml-training/model-versions');
      setModelVersions(data);
    } catch {
      setModelVersions(null);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'incidents') {
      loadBufferStatus();
      loadModelVersions();
    }
  }, [activeTab, loadBufferStatus, loadModelVersions]);

  const handleReportIncident = async () => {
    if (!incidentForm.location || !incidentForm.itemType) {
      toast.error('Please select a location and item type.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/ml-training/report-incident', incidentForm);
      setLastIncidentResult(data);
      setBufferStatus(data.bufferStatus);
      setIncidentForm(prev => ({ ...prev, description: '' }));

      if (data.retrainTriggered) {
        toast.success(`Model retrained! New version: ${data.newModelVersion || '—'}`);
        loadModelVersions();
      } else {
        toast.success(data.message || 'Incident reported successfully.');
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to report incident.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForceRetrain = async () => {
    setForceRetraining(true);
    try {
      const { data } = await api.post('/ml-training/force-retrain');
      if (data.success) {
        toast.success(`Model retrained successfully! Version: ${data.version}`);
        loadBufferStatus();
        loadModelVersions();
      } else {
        toast.error(data.error || 'Retraining failed.');
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to trigger retraining.');
    } finally {
      setForceRetraining(false);
    }
  };

  // ---- Helpers ----
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

  const bufferPct = bufferStatus
    ? Math.round((bufferStatus.buffer_size / (bufferStatus.retrain_threshold || 10)) * 100)
    : 0;

  const latestVersion = Array.isArray(modelVersions?.versions)
    ? modelVersions.versions[modelVersions.versions.length - 1]
    : null;

  if (loading) {
    return (
      <div className="container-fluid">
        <div className="card">
          <div className="card-body">
            <div className="d-flex align-items-center gap-2 text-muted">
              <span className="spinner-border spinner-border-sm" role="status" /> Loading risk data…
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
      {/* Page Header */}
      <div className="d-flex align-items-start justify-content-between mb-4">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <i className="mdi mdi-robot-outline text-primary" /> Risk Dashboard
          </h2>
          <div className="text-muted small">XGBoost Gradient Boosting · Online Learning · Real-time conditions</div>
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
            <label className="form-check-label small text-muted" htmlFor="autoRefresh">Auto-refresh</label>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'risk-zones' ? 'active' : ''}`}
            onClick={() => setActiveTab('risk-zones')}
          >
            <i className="mdi mdi-map-marker-radius me-1" /> Risk Zones
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'incidents' ? 'active' : ''}`}
            onClick={() => setActiveTab('incidents')}
          >
            <i className="mdi mdi-alert-plus-outline me-1" /> Incident Reporting
          </button>
        </li>
      </ul>

      {/* ===== TAB 1: Risk Zones ===== */}
      {activeTab === 'risk-zones' && (
        <>
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
                          <div className={`small ${selectedZone?.location === loc.location ? 'text-white-50' : 'text-muted'}`}>
                            Risk Score: {loc.riskScore?.toFixed(2) || '0.00'}%
                          </div>
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
                            <div className="text-muted small">Incident Probability</div>
                            <div className={`fw-bold fs-4 ${locationDetails.riskScore >= 50 ? 'text-danger' : locationDetails.riskScore >= 30 ? 'text-warning' : 'text-success'}`}>
                              {locationDetails.riskScore?.toFixed(2) || '0.00'}%
                            </div>
                            <div className="text-muted small">Chance of item loss</div>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="p-3 border rounded-3 h-100">
                            <div className="text-muted small">Safe Probability</div>
                            <div className={`fw-bold fs-4 ${(100 - locationDetails.riskScore) >= 70 ? 'text-success' : 'text-warning'}`}>
                              {(100 - (locationDetails.riskScore || 0)).toFixed(2)}%
                            </div>
                            <div className="text-muted small">No incident expected</div>
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
        </>
      )}

      {/* ===== TAB 2: Incident Reporting ===== */}
      {activeTab === 'incidents' && (
        <div className="row g-4">

          {/* Report Incident Form */}
          <div className="col-xl-6">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title mb-1 d-flex align-items-center gap-2">
                  <i className="mdi mdi-alert-plus-outline text-danger" /> Report New Incident
                </h5>
                <div className="text-muted small mb-4">
                  Reported incidents are fed into the ML model to improve risk predictions.
                </div>

                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label fw-semibold">Location</label>
                    <select
                      className="form-select"
                      value={incidentForm.location}
                      onChange={(e) => setIncidentForm(p => ({ ...p, location: e.target.value }))}
                    >
                      <option value="">— Select zone —</option>
                      {(heatmapData?.locations || []).map(loc => (
                        <option key={loc.location} value={loc.location}>
                          {loc.location} ({loc.riskLevel})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Item Type</label>
                    <select
                      className="form-select"
                      value={incidentForm.itemType}
                      onChange={(e) => setIncidentForm(p => ({ ...p, itemType: e.target.value }))}
                    >
                      {ITEM_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label fw-semibold">Description <span className="text-muted fw-normal">(optional)</span></label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="Brief description of what happened..."
                      value={incidentForm.description}
                      onChange={(e) => setIncidentForm(p => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div className="col-12">
                    <button
                      className="btn btn-danger w-100"
                      onClick={handleReportIncident}
                      disabled={submitting || !incidentForm.location || !incidentForm.itemType}
                    >
                      {submitting
                        ? <><span className="spinner-border spinner-border-sm me-2" role="status" /> Reporting…</>
                        : <><i className="mdi mdi-send me-1" /> Report Incident</>
                      }
                    </button>
                  </div>
                </div>

                {/* Inline result after submit */}
                {lastIncidentResult && (
                  <div className={`alert mt-3 mb-0 ${lastIncidentResult.retrainTriggered ? 'alert-success' : 'alert-info'}`}>
                    <div className="d-flex align-items-center gap-2">
                      <i className={`mdi fs-5 ${lastIncidentResult.retrainTriggered ? 'mdi-check-circle' : 'mdi-information-outline'}`} />
                      <div>
                        <div className="fw-semibold">{lastIncidentResult.message}</div>
                        {lastIncidentResult.retrainTriggered && lastIncidentResult.newAccuracy && (
                          <div className="small mt-1">
                            New accuracy: <strong>{(lastIncidentResult.newAccuracy * 100).toFixed(1)}%</strong>
                          </div>
                        )}
                        {!lastIncidentResult.retrainTriggered && lastIncidentResult.bufferStatus && (
                          <div className="mt-2">
                            <div className="small mb-1">
                              Buffer: {lastIncidentResult.bufferStatus.buffer_size} / {lastIncidentResult.bufferStatus.retrain_threshold} incidents
                            </div>
                            <div className="progress" style={{ height: 6 }}>
                              <div
                                className="progress-bar bg-warning"
                                style={{ width: `${Math.round((lastIncidentResult.bufferStatus.buffer_size / lastIncidentResult.bufferStatus.retrain_threshold) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Online Learning Status */}
          <div className="col-xl-6">
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="card-title mb-0 d-flex align-items-center gap-2">
                    <i className="mdi mdi-brain text-primary" /> Online Learning Status
                  </h5>
                  <button className="btn btn-sm btn-light border" onClick={() => { loadBufferStatus(); loadModelVersions(); }} disabled={bufferLoading}>
                    <i className={`mdi mdi-refresh ${bufferLoading ? 'mdi-spin' : ''}`} />
                  </button>
                </div>

                {bufferStatus ? (
                  <>
                    <div className="mb-3">
                      <div className="d-flex align-items-center justify-content-between mb-1">
                        <span className="fw-semibold small">Incident Buffer</span>
                        <span className="small text-muted">
                          {bufferStatus.buffer_size ?? 0} / {bufferStatus.retrain_threshold ?? 10} incidents
                        </span>
                      </div>
                      <div className="progress mb-2" style={{ height: 10 }}>
                        <div
                          className={`progress-bar ${bufferPct >= 80 ? 'bg-danger' : bufferPct >= 50 ? 'bg-warning' : 'bg-success'}`}
                          role="progressbar"
                          style={{ width: `${Math.min(bufferPct, 100)}%` }}
                        />
                      </div>
                      <div className="small text-muted">
                        <i className="mdi mdi-information-outline me-1" />
                        Model auto-retrains when {bufferStatus.retrain_threshold ?? 10} new incidents are buffered.
                      </div>
                    </div>

                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <div className="p-2 bg-light border rounded-3">
                          <div className="text-muted small">Buffer Size</div>
                          <div className="fw-bold">{bufferStatus.buffer_size ?? 0}</div>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="p-2 bg-light border rounded-3">
                          <div className="text-muted small">Threshold</div>
                          <div className="fw-bold">{bufferStatus.retrain_threshold ?? 10}</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-muted small mb-3">
                    {bufferLoading ? 'Loading buffer status…' : 'ML service unavailable or no buffer data.'}
                  </div>
                )}

                {/* Model Version Info */}
                {latestVersion && (
                  <div className="p-3 bg-light border rounded-3 mb-3">
                    <div className="text-muted small">Latest Model Version</div>
                    <div className="fw-semibold">{latestVersion.version || '—'}</div>
                    {latestVersion.metrics?.accuracy && (
                      <div className="small text-success mt-1">
                        <i className="mdi mdi-check-circle me-1" />
                        Accuracy: {(latestVersion.metrics.accuracy * 100).toFixed(1)}%
                      </div>
                    )}
                    {latestVersion.timestamp && (
                      <div className="small text-muted mt-1">
                        <i className="mdi mdi-clock-outline me-1" />
                        {new Date(latestVersion.timestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                {/* Admin: Force Retrain */}
                {isAdmin && (
                  <button
                    className="btn btn-outline-primary w-100"
                    onClick={handleForceRetrain}
                    disabled={forceRetraining}
                  >
                    {forceRetraining
                      ? <><span className="spinner-border spinner-border-sm me-2" role="status" /> Retraining model…</>
                      : <><i className="mdi mdi-refresh me-1" /> Force Retrain Model</>
                    }
                  </button>
                )}
              </div>
            </div>

            {/* Model Version History */}
            {Array.isArray(modelVersions?.versions) && modelVersions.versions.length > 0 && (
              <div className="card mt-4">
                <div className="card-body">
                  <h6 className="card-title mb-3">
                    <i className="mdi mdi-history me-1" /> Model Version History
                  </h6>
                  <div className="table-responsive">
                    <table className="table align-middle mb-0 table-sm">
                      <thead>
                        <tr className="text-muted small" style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>
                          <th>Version</th>
                          <th>Accuracy</th>
                          <th>Samples</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...modelVersions.versions].reverse().slice(0, 5).map((v, i) => (
                          <tr key={i}>
                            <td className="fw-semibold">{v.version || '—'}</td>
                            <td>
                              {v.metrics?.accuracy
                                ? <span className="badge bg-success-subtle text-success border border-success-subtle">{(v.metrics.accuracy * 100).toFixed(1)}%</span>
                                : '—'}
                            </td>
                            <td className="text-muted">{v.total_samples ?? '—'}</td>
                            <td className="text-muted small">{v.timestamp ? new Date(v.timestamp).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
