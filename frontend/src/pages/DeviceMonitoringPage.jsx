import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import QuickLocationLogger from '../components/QuickLocationLogger';
import DevicePathMap from '../components/DevicePathMap';

function Pill({ text, tone = 'secondary', icon }) {
  const cls = useMemo(() => {
    if (tone === 'success') return 'bg-success-subtle text-success border border-success-subtle';
    if (tone === 'warning') return 'bg-warning-subtle text-warning border border-warning-subtle';
    if (tone === 'danger') return 'bg-danger-subtle text-danger border border-danger-subtle';
    if (tone === 'info') return 'bg-info-subtle text-info border border-info-subtle';
    return 'bg-light text-muted border';
  }, [tone]);

  return (
    <span className={`badge rounded-pill ${cls} px-3 py-2 fw-semibold`}>
      {icon ? <i className={`mdi ${icon} me-1`} /> : null}
      {text}
    </span>
  );
}

export default function DeviceMonitoringPage() {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [monitoringStatus, setMonitoringStatus] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [anomalyAlerts, setAnomalyAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState('tracking');

  const selectedDevice = useMemo(
    () => devices.find((d) => d._id === selectedDeviceId) || null,
    [devices, selectedDeviceId]
  );

  const fetchDevices = async () => {
    try {
      setRefreshing(true);
      const { data } = await api.get('/devices');
      const list = Array.isArray(data) ? data : [];
      setDevices(list);
      if (!selectedDeviceId && list.length > 0) {
        setSelectedDeviceId(list[0]._id);
      }
    } catch {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchDeviceStatus = async (deviceId) => {
    if (!deviceId) return;
    try {
      const { data } = await api.get(`/monitoring/device/${deviceId}/status`);
      setMonitoringStatus({
        deviceStatus: data?.device?.status || null,
        lastSeen: data?.device?.lastSeen || null,
        inLearningPhase: data?.monitoring?.inLearningPhase || false,
        learningProgress: data?.monitoring?.learningProgress || 0,
        modelTrained: data?.monitoring?.modelTrained || false,
        lastTrainedAt: data?.monitoring?.lastTrainedAt || null,
        anomalyCount: data?.statistics?.anomalyCount || 0,
      });
      setRecentActivities(Array.isArray(data?.recentActivities) ? data.recentActivities : []);
    } catch {
      setMonitoringStatus(null);
      setRecentActivities([]);
    }
  };

  useEffect(() => {
    fetchDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedDeviceId) fetchDeviceStatus(selectedDeviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId]);

  const handleTrainModel = async (deviceId) => {
    try {
      const { data } = await api.post(`/monitoring/device/${deviceId}/train`);
      toast.success(data?.message || 'Training started');
      fetchDeviceStatus(deviceId);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Training failed');
    }
  };

  // Instant anomaly notification handler
  const handleAnomalyDetected = useCallback((pingOrAlert) => {
    const score = pingOrAlert.anomalyScore || 0;
    const ts = pingOrAlert.timestamp ? new Date(pingOrAlert.timestamp).toLocaleTimeString() : 'now';

    // Add to alerts list
    setAnomalyAlerts(prev => [{
      id: Date.now(),
      score,
      lat: pingOrAlert.location?.lat,
      lng: pingOrAlert.location?.lng,
      time: ts,
      timestamp: new Date()
    }, ...prev].slice(0, 20));

    // Instant toast notification
    toast.error(
      `Abnormal behavior detected! Score: ${(score * 100).toFixed(0)}% at ${ts}`,
      {
        position: 'top-right',
        autoClose: 8000,
        icon: '\u{1F6A8}'
      }
    );

    // Browser notification (if permission granted)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Anomaly Alert - Lost & Found', {
        body: `Abnormal device behavior detected!\nAnomaly Score: ${(score * 100).toFixed(0)}%\nTime: ${ts}`,
        icon: '/favicon.ico',
        tag: 'anomaly-alert'
      });
    }
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const statusTone = (status) => {
    if (status === 'ACTIVE') return 'success';
    if (status === 'LEARNING') return 'info';
    if (status === 'LOST') return 'danger';
    if (status === 'FOUND') return 'warning';
    return 'secondary';
  };

  const riskTone = (level) => {
    if (level === 'CRITICAL') return 'danger';
    if (level === 'HIGH') return 'warning';
    if (level === 'MEDIUM') return 'info';
    if (level === 'LOW') return 'success';
    return 'secondary';
  };

  if (loading) {
    return (
      <div className="container-fluid">
        <div className="card">
          <div className="card-body">
            <div className="d-flex align-items-center gap-2 text-muted">
              <span className="spinner-border spinner-border-sm" role="status" /> Loading…
            </div>
            <div className="progress mt-3" style={{ height: 6 }}>
              <div className="progress-bar" style={{ width: '40%' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <i className="mdi mdi-eye text-primary" /> Device Monitoring
          </h2>
          <div className="text-muted small">Real-time travel path, anomaly detection and device activity.</div>
        </div>
        <button className="btn btn-light border" onClick={fetchDevices} disabled={refreshing}>
          <i className={`mdi mdi-refresh me-1 ${refreshing ? 'mdi-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'tracking' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracking')}
          >
            <i className="mdi mdi-map-marker-path me-1" /> Device Tracking
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'predictions' ? 'active' : ''}`}
            onClick={() => setActiveTab('predictions')}
          >
            <i className="mdi mdi-brain me-1" /> Predictions
            {anomalyAlerts.length > 0 && (
              <span className="badge bg-danger ms-2">{anomalyAlerts.length}</span>
            )}
          </button>
        </li>
      </ul>

      {/* ===== TAB 1: Device Tracking ===== */}
      {/* Use display:none instead of conditional rendering to keep DevicePathMap WebSocket alive */}
      <div style={{ display: activeTab === 'tracking' ? 'block' : 'none' }}>
        <div className="row g-4">
          <div className="col-xl-4">
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="card-title mb-0">Devices</h5>
                  <span className="badge bg-light text-muted border">{devices.length}</span>
                </div>

                {devices.length === 0 ? (
                  <div className="text-muted">No devices found. Add a device first.</div>
                ) : (
                  <>
                    <label className="form-label fw-semibold">Select device</label>
                    <select className="form-select" value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)}>
                      {devices.map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                    {selectedDevice ? (
                      <div className="mt-3 p-3 bg-light border rounded-3">
                        <div className="fw-semibold d-flex align-items-center gap-2">
                          <i className="mdi mdi-laptop" /> {selectedDevice.name}
                        </div>
                        <div className="small text-muted">{selectedDevice.macAddress || 'MAC not set'}</div>
                        <div className="mt-2">
                          <Pill text={selectedDevice.status || 'UNKNOWN'} tone={statusTone(selectedDevice.status)} icon="mdi-shield-outline" />
                        </div>
                        <div className="mt-3">
                          <button className="btn btn-cp w-100" onClick={() => handleTrainModel(selectedDevice._id)}>
                            <i className="mdi mdi-brain me-1" /> Train / Refresh ML Model
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* Quick Location Logger */}
            <div className="mt-4">
              <QuickLocationLogger deviceId={selectedDeviceId} />
            </div>
          </div>

          <div className="col-xl-8">
            <div className="row g-4">
              {/* Current Status */}
              <div className="col-md-6">
                <div className="card cp-stat">
                  <div className="card-body d-flex align-items-center justify-content-between">
                    <div>
                      <div className="label">Current Status</div>
                      <div className="value" style={{ fontSize: '1.4rem' }}>{monitoringStatus?.deviceStatus || '—'}</div>
                    </div>
                    <div className="icon"><i className="mdi mdi-shield-check-outline" /></div>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card cp-stat">
                  <div className="card-body d-flex align-items-center justify-content-between">
                    <div>
                      <div className="label">Last Seen</div>
                      <div className="value" style={{ fontSize: '1rem' }}>{monitoringStatus?.lastSeen ? new Date(monitoringStatus.lastSeen).toLocaleString() : '—'}</div>
                    </div>
                    <div className="icon"><i className="mdi mdi-clock-outline" /></div>
                  </div>
                </div>
              </div>

              {/* Travel Path Map */}
              <div className="col-12">
                <DevicePathMap
                  deviceId={selectedDeviceId}
                  onAnomalyDetected={handleAnomalyDetected}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== TAB 2: Predictions ===== */}
      {activeTab === 'predictions' && (
        <div>
          {/* Anomaly alert banner */}
          {anomalyAlerts.length > 0 && (
            <div className="alert alert-danger d-flex align-items-center gap-2 mb-4" role="alert">
              <i className="mdi mdi-alert-circle fs-4" />
              <div className="flex-grow-1">
                <strong>Anomaly Detected!</strong> {anomalyAlerts.length} abnormal behavior event(s) detected.
                Latest: Score {(anomalyAlerts[0].score * 100).toFixed(0)}% at {anomalyAlerts[0].time}
              </div>
              <button className="btn btn-sm btn-outline-danger" onClick={() => setAnomalyAlerts([])}>
                Dismiss
              </button>
            </div>
          )}

          <div className="row g-4">
            {/* ML Summary Cards */}
            <div className="col-md-4">
              <div className="card cp-stat">
                <div className="card-body d-flex align-items-center justify-content-between">
                  <div>
                    <div className="label">Anomaly Count</div>
                    <div className="value" style={{ fontSize: '1.4rem' }}>{monitoringStatus?.anomalyCount ?? '—'}</div>
                  </div>
                  <div className="icon"><i className="mdi mdi-alert-outline" /></div>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card cp-stat">
                <div className="card-body d-flex align-items-center justify-content-between">
                  <div>
                    <div className="label">Learning Phase</div>
                    <div className="value" style={{ fontSize: '1.4rem' }}>
                      {monitoringStatus?.inLearningPhase ? `${Math.round(monitoringStatus.learningProgress)}%` : 'Complete'}
                    </div>
                  </div>
                  <div className="icon"><i className="mdi mdi-school-outline" /></div>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card cp-stat">
                <div className="card-body d-flex align-items-center justify-content-between">
                  <div>
                    <div className="label">Model Status</div>
                    <div className="value" style={{ fontSize: '1.4rem' }}>
                      {monitoringStatus?.modelTrained ? 'Trained' : 'Not Trained'}
                    </div>
                  </div>
                  <div className="icon"><i className="mdi mdi-brain" /></div>
                </div>
              </div>
            </div>

            {/* ML Details */}
            <div className="col-12">
              <div className="card">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h5 className="card-title mb-0">ML Monitoring Summary</h5>
                    {monitoringStatus?.modelTrained ? (
                      <Pill text="Model Ready" tone="success" icon="mdi-check-circle" />
                    ) : (
                      <Pill text="Learning" tone="warning" icon="mdi-timer-sand" />
                    )}
                  </div>

                  <div className="row g-3">
                    <div className="col-md-4">
                      <div className="p-3 bg-light border rounded-3">
                        <div className="text-muted small">Device Status</div>
                        <div className="fw-bold fs-4">{monitoringStatus?.deviceStatus || '—'}</div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="p-3 bg-light border rounded-3">
                        <div className="text-muted small">Last Seen</div>
                        <div className="fw-semibold">{monitoringStatus?.lastSeen ? new Date(monitoringStatus.lastSeen).toLocaleString() : '—'}</div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="p-3 bg-light border rounded-3">
                        <div className="text-muted small">Last Trained</div>
                        <div className="fw-semibold">{monitoringStatus?.lastTrainedAt ? new Date(monitoringStatus.lastTrainedAt).toLocaleString() : '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Anomaly History */}
            {anomalyAlerts.length > 0 && (
              <div className="col-12">
                <div className="card border-danger">
                  <div className="card-body">
                    <h5 className="card-title mb-3 text-danger">
                      <i className="mdi mdi-alert-octagon me-2" />
                      Anomaly Alerts ({anomalyAlerts.length})
                    </h5>
                    <div className="table-responsive">
                      <table className="table align-middle mb-0">
                        <thead>
                          <tr className="text-muted small" style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>
                            <th>Time</th>
                            <th>Score</th>
                            <th>Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {anomalyAlerts.map(a => (
                            <tr key={a.id}>
                              <td className="text-muted">{a.time}</td>
                              <td>
                                <span className="badge bg-danger">{(a.score * 100).toFixed(0)}%</span>
                              </td>
                              <td className="small text-muted">
                                {a.lat?.toFixed(5)}, {a.lng?.toFixed(5)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="col-12">
              <div className="card">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h5 className="card-title mb-0">Recent Activity</h5>
                    <span className="text-muted small">Last 24h</span>
                  </div>
                  <div className="table-responsive">
                    <table className="table align-middle mb-0">
                      <thead>
                        <tr className="text-muted small" style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>
                          <th>Time</th>
                          <th>Event</th>
                          <th className="text-end">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentActivities.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-4 text-center text-muted">No recent activity.</td>
                          </tr>
                        ) : (
                          recentActivities.map((a, idx) => (
                            <tr key={`${a.timestamp || idx}`}>
                              <td className="text-muted">{a.timestamp ? new Date(a.timestamp).toLocaleString() : '—'}</td>
                              <td>
                                <div className="fw-semibold">{a.status || 'Activity'}</div>
                                <div className="text-muted small">
                                  {a.zoneId?.name || ''}
                                  {a.isAnomaly ? ' — Anomaly detected' : ''}
                                </div>
                              </td>
                              <td className="text-end">
                                {a.isAnomaly ? (
                                  <Pill text={`${((a.anomalyScore || 0) * 100).toFixed(0)}%`} tone="danger" icon="mdi-alert" />
                                ) : (
                                  <Pill text="Normal" tone="success" icon="mdi-check" />
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
