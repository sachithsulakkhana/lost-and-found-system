import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';

// ── Helpers ──────────────────────────────────────────────────────────────────
function computeAnomalyScore(avgLat, avgLng, avgHour, lat, lng, hour) {
  const dist = Math.sqrt((lat - avgLat) ** 2 + (lng - avgLng) ** 2);
  const normalizedDist = Math.min(dist * 1000, 1);
  const timeDiff = Math.abs(hour - avgHour) / 24;
  return normalizedDist * 0.7 + timeDiff * 0.3;
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i - 12}pm`
);
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Custom red icon for learned center
const centerIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  const pct = (score * 100).toFixed(1);
  const color = score >= 0.7 ? '#dc2626' : score >= 0.5 ? '#f59e0b' : '#16a34a';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      background: color + '20', color, fontWeight: 700, fontSize: '.85rem', border: `1px solid ${color}40`
    }}>
      {pct}%
    </span>
  );
}

// ── Mini CSS bar chart ────────────────────────────────────────────────────────
function BarChart({ data, labels, color = '#4e64ff', height = 60 }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, overflowX: 'auto' }}>
      {data.map((v, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 18 }}>
          <div
            title={`${labels[i]}: ${v}`}
            style={{
              width: '100%', background: v > 0 ? color : '#e5e7eb',
              height: max > 0 ? `${(v / max) * height}px` : 2,
              borderRadius: '3px 3px 0 0', transition: 'height .3s', minHeight: v > 0 ? 3 : 0,
              cursor: 'default',
            }}
          />
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2, whiteSpace: 'nowrap' }}>{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeviceLearningPage() {
  const [devices, setDevices]   = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [pings, setPings]       = useState([]);
  const [allDeviceAnomalies, setAllDeviceAnomalies] = useState([]); // all devices' anomalies
  const [showAllDevices, setShowAllDevices] = useState(false); // toggle to show all devices
  const [loading, setLoading]   = useState(false);

  // Live calculator state
  const [calcLat,  setCalcLat]  = useState('');
  const [calcLng,  setCalcLng]  = useState('');
  const [calcHour, setCalcHour] = useState(new Date().getHours());
  const [calcScore, setCalcScore] = useState(null);

  // ── Replay animation state ──────────────────────────────────────────────────
  const [replayIdx,     setReplayIdx]     = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed,   setReplaySpeed]   = useState(80); // ms per ping
  const replayTimer = useRef(null);

  // Load device list
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const response = await api.get('/devices');
        console.log('✅ Devices API response:', response.data);
        const list = Array.isArray(response.data) ? response.data : [];
        console.log(`✅ Parsed ${list.length} devices`);
        setDevices(list);
        if (list.length > 0 && !deviceId) {
          setDeviceId(list[0]._id);
          console.log(`✅ Set initial device to: ${list[0].name}`);
        }
      } catch (error) {
        console.error('❌ Failed to load devices:', error.message || error);
        setDevices([]);
      }
    };
    loadDevices();
  }, []);

  // Load pings for selected device
  const loadPings = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/location/history/${deviceId}?limit=600`);
      const valid = (Array.isArray(data) ? data : []).filter(p => p.valid && p.location?.lat);
      setPings(valid);

      // Also load all devices' anomalies for comparison if toggled
      if (showAllDevices) {
        try {
          const allRes = await api.get('/alerts?type=ANOMALY');
          const anomalies = Array.isArray(allRes.data) ? allRes.data : [];
          setAllDeviceAnomalies(anomalies.slice(0, 50)); // limit to 50 recent
        } catch {
          setAllDeviceAnomalies([]);
        }
      }
    } catch { setPings([]); }
    finally { setLoading(false); }
  }, [deviceId, showAllDevices]);

  useEffect(() => { loadPings(); }, [loadPings]);

  // ── Sorted pings for replay ─────────────────────────────────────────────────
  const sortedPings = useMemo(() =>
    [...pings].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
  [pings]);

  // Replay controls
  const replayStart = () => {
    if (replayIdx >= sortedPings.length) setReplayIdx(0);
    setReplayPlaying(true);
  };
  const replayPause = () => { setReplayPlaying(false); clearInterval(replayTimer.current); };
  const replayReset = () => { replayPause(); setReplayIdx(0); };

  useEffect(() => {
    if (!replayPlaying) return;
    replayTimer.current = setInterval(() => {
      setReplayIdx(prev => {
        if (prev >= sortedPings.length) { setReplayPlaying(false); return prev; }
        return prev + 1;
      });
    }, replaySpeed);
    return () => clearInterval(replayTimer.current);
  }, [replayPlaying, replaySpeed, sortedPings.length]);

  // Stats derived from replay window
  const replayStats = useMemo(() => {
    const window = sortedPings.slice(0, replayIdx);
    if (window.length === 0) return null;
    const avgLat = window.reduce((s, p) => s + p.location.lat, 0) / window.length;
    const avgLng = window.reduce((s, p) => s + p.location.lng, 0) / window.length;
    const hourCounts = Array(24).fill(0);
    window.forEach(p => { hourCounts[p.hourOfDay ?? new Date(p.timestamp).getHours()]++; });
    const confidence = Math.min(window.length / 50, 1); // 0-1 confidence based on data
    return { avgLat, avgLng, hourCounts, confidence, count: window.length };
  }, [replayIdx, sortedPings]);

  // ── Derived stats ───────────────────────────────────────────────────────────
  const stats = (() => {
    if (pings.length === 0) return null;

    const avgLat  = pings.reduce((s, p) => s + p.location.lat, 0) / pings.length;
    const avgLng  = pings.reduce((s, p) => s + p.location.lng, 0) / pings.length;
    const avgHour = pings.reduce((s, p) => s + (p.hourOfDay ?? new Date(p.timestamp).getHours()), 0) / pings.length;

    // Hourly distribution
    const hourCounts = Array(24).fill(0);
    pings.forEach(p => { hourCounts[p.hourOfDay ?? new Date(p.timestamp).getHours()]++; });

    // Day of week distribution
    const dayCounts = Array(7).fill(0);
    pings.forEach(p => {
      const d = DAY_LABELS.indexOf(p.dayOfWeek);
      if (d >= 0) dayCounts[d]++;
    });

    // Score buckets
    const scoreBuckets = [0, 0, 0, 0]; // <0.25, 0.25-0.5, 0.5-0.75, 0.75+
    pings.forEach(p => {
      const s = p.anomalyScore || 0;
      if (s < 0.25)      scoreBuckets[0]++;
      else if (s < 0.5)  scoreBuckets[1]++;
      else if (s < 0.75) scoreBuckets[2]++;
      else               scoreBuckets[3]++;
    });

    const anomalies  = pings.filter(p => (p.anomalyScore || 0) >= 0.5);
    const minTs      = new Date(Math.min(...pings.map(p => new Date(p.timestamp))));
    const maxTs      = new Date(Math.max(...pings.map(p => new Date(p.timestamp))));
    const daysTrained = Math.round((maxTs - minTs) / 86400000);

    // Map sample — max 200 dots for performance
    const step     = pings.length > 200 ? Math.ceil(pings.length / 200) : 1;
    const mapSample = pings.filter((_, i) => i % step === 0);

    return { avgLat, avgLng, avgHour, hourCounts, dayCounts, scoreBuckets, anomalies, daysTrained, minTs, maxTs, mapSample };
  })();

  // Live score calculator
  const handleCalc = () => {
    if (!stats) return;
    const lat  = parseFloat(calcLat);
    const lng  = parseFloat(calcLng);
    const hour = parseInt(calcHour, 10);
    if (isNaN(lat) || isNaN(lng)) return;
    setCalcScore(computeAnomalyScore(stats.avgLat, stats.avgLng, stats.avgHour, lat, lng, hour));
  };

  const selectedDevice = devices.find(d => d._id === deviceId);

  return (
    <div className="container-fluid">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <i className="mdi mdi-brain text-primary" /> Learning Insights
          </h2>
          <div className="text-muted small">
            Device: <strong>{selectedDevice?.name || 'Select device'}</strong> • {selectedDevice?.status || 'unknown'}
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <div className="d-flex gap-1 align-items-center">
            <label className="form-check form-check-inline mb-0">
              <input
                type="checkbox"
                className="form-check-input"
                checked={showAllDevices}
                onChange={(e) => setShowAllDevices(e.target.checked)}
              />
              <span className="form-check-label small">Show all devices</span>
            </label>
          </div>
          <select className="form-select form-select-sm" style={{ width: 180 }} value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            {devices.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <button className="btn btn-sm btn-light border" onClick={loadPings} disabled={loading}>
            <i className={`mdi mdi-refresh ${loading ? 'mdi-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-5 text-muted">
          <span className="spinner-border spinner-border-sm me-2" /> Loading ping history…
        </div>
      )}

      {!loading && pings.length === 0 && (
        <div className="alert alert-warning">No valid pings found for this device.</div>
      )}

      {!loading && stats && (
        <>
          {/* ── Row 1: Stat cards ── */}
          <div className="row g-3 mb-4">
            {[
              { label: 'Total Valid Pings', value: pings.length, icon: 'mdi-map-marker-multiple', color: '#4e64ff' },
              { label: 'Days Trained',      value: stats.daysTrained, icon: 'mdi-calendar-check', color: '#16a34a' },
              { label: 'Anomalies Detected',value: stats.anomalies.length, icon: 'mdi-alert-circle', color: '#dc2626' },
              { label: 'Device Status',     value: selectedDevice?.status || '—', icon: 'mdi-shield-check', color: '#f59e0b' },
            ].map(c => (
              <div key={c.label} className="col-6 col-md-3">
                <div className="card h-100">
                  <div className="card-body d-flex align-items-center gap-3">
                    <div style={{ fontSize: 28, color: c.color }}>
                      <i className={`mdi ${c.icon}`} />
                    </div>
                    <div>
                      <div className="text-muted small">{c.label}</div>
                      <div className="fw-bold fs-5">{c.value}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Row 2: Map + Charts ── */}
          <div className="row g-4 mb-4">

            {/* Learned Zone Map */}
            <div className="col-lg-6">
              <div className="card h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-1">
                    <i className="mdi mdi-map-marker-radius me-1 text-primary" />
                    Learned Normal Zone
                  </h6>
                  <p className="text-muted small mb-3">
                    Blue dots = all pings. Red dot = computed centre of normal zone
                    &nbsp;(<code>{stats.avgLat.toFixed(5)}</code>, <code>{stats.avgLng.toFixed(5)}</code>).
                  </p>
                  <div style={{ height: 300, borderRadius: 10, overflow: 'hidden' }}>
                    <MapContainer
                      key={deviceId}
                      center={[stats.avgLat, stats.avgLng]}
                      zoom={16}
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      {/* Ping cloud */}
                      {stats.mapSample.map((p, i) => (
                        <CircleMarker
                          key={i}
                          center={[p.location.lat, p.location.lng]}
                          radius={4}
                          pathOptions={{ color: '#4e64ff', fillColor: '#4e64ff', fillOpacity: 0.4, weight: 0 }}
                        >
                          <Popup>
                            <small>
                              {new Date(p.timestamp).toLocaleString()}<br />
                              Score: {((p.anomalyScore || 0) * 100).toFixed(1)}%
                            </small>
                          </Popup>
                        </CircleMarker>
                      ))}
                      {/* Learned centre */}
                      <Marker position={[stats.avgLat, stats.avgLng]} icon={centerIcon}>
                        <Popup>
                          <strong>Learned Centre</strong><br />
                          <small>{stats.avgLat.toFixed(6)}, {stats.avgLng.toFixed(6)}</small>
                        </Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Hourly + Day charts */}
            <div className="col-lg-6">
              <div className="card mb-3">
                <div className="card-body">
                  <h6 className="fw-bold mb-1">
                    <i className="mdi mdi-clock-outline me-1 text-primary" />
                    Hourly Activity Pattern
                  </h6>
                  <p className="text-muted small mb-3">
                    Peak hours learned as "normal" — off-peak pings score higher.
                    Avg active hour: <strong>{Math.round(stats.avgHour)}:00</strong>
                  </p>
                  <BarChart data={stats.hourCounts} labels={HOUR_LABELS} color="#4e64ff" height={70} />
                </div>
              </div>
              <div className="card">
                <div className="card-body">
                  <h6 className="fw-bold mb-1">
                    <i className="mdi mdi-calendar-week me-1 text-primary" />
                    Day of Week Distribution
                  </h6>
                  <p className="text-muted small mb-3">Which days device was active during training.</p>
                  <BarChart data={stats.dayCounts} labels={DAY_LABELS} color="#16a34a" height={60} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 3: Score distribution + Algorithm ── */}
          <div className="row g-4 mb-4">

            {/* Score distribution */}
            <div className="col-lg-4">
              <div className="card h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-3">
                    <i className="mdi mdi-chart-bar me-1 text-primary" />
                    Anomaly Score Distribution
                  </h6>
                  {[
                    { label: '0 – 25%  (Very Normal)',  count: stats.scoreBuckets[0], color: '#16a34a' },
                    { label: '25 – 50%  (Slightly Off)', count: stats.scoreBuckets[1], color: '#84cc16' },
                    { label: '50 – 75%  (Suspicious)',   count: stats.scoreBuckets[2], color: '#f59e0b' },
                    { label: '75 – 100%  (Anomaly)',     count: stats.scoreBuckets[3], color: '#dc2626' },
                  ].map(b => (
                    <div key={b.label} className="mb-3">
                      <div className="d-flex justify-content-between small mb-1">
                        <span style={{ color: b.color, fontWeight: 600 }}>{b.label}</span>
                        <span className="text-muted">{b.count} pings</span>
                      </div>
                      <div className="progress" style={{ height: 8 }}>
                        <div
                          className="progress-bar"
                          style={{
                            width: `${pings.length > 0 ? (b.count / pings.length) * 100 : 0}%`,
                            background: b.color
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Algorithm explain */}
            <div className="col-lg-4">
              <div className="card h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-3">
                    <i className="mdi mdi-function-variant me-1 text-primary" />
                    How Score is Computed
                  </h6>
                  <div className="p-3 rounded-3 mb-3" style={{ background: '#f8faff', border: '1px solid #e0e7ff', fontFamily: 'monospace', fontSize: '.8rem' }}>
                    <div className="text-muted mb-1">// mlService.js formula</div>
                    <div>dist = √( (lat−avgLat)² + (lng−avgLng)² )</div>
                    <div>locScore = min(dist × 1000, 1.0)</div>
                    <div className="mt-1">timeDiff = |hour − avgHour| / 24</div>
                    <div className="mt-1 fw-bold text-primary">score = locScore×0.7 + timeDiff×0.3</div>
                  </div>
                  <div className="row g-2 text-center">
                    <div className="col-6">
                      <div className="p-2 rounded-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#4e64ff' }}>70%</div>
                        <div className="small text-muted">Location weight</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-2 rounded-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#16a34a' }}>30%</div>
                        <div className="small text-muted">Time weight</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 small text-muted">
                    <i className="mdi mdi-information-outline me-1" />
                    Distance {'>'} 111m from learned centre → location score = 1.0 (max)
                  </div>
                </div>
              </div>
            </div>

            {/* Live calculator */}
            <div className="col-lg-4">
              <div className="card h-100">
                <div className="card-body">
                  <h6 className="fw-bold mb-3">
                    <i className="mdi mdi-calculator me-1 text-primary" />
                    Live Anomaly Calculator
                  </h6>
                  <p className="text-muted small mb-3">
                    Test any location — see what score the system would give.
                  </p>
                  <div className="mb-2">
                    <label className="form-label small fw-semibold mb-1">Latitude</label>
                    <input className="form-control form-control-sm" placeholder="e.g. 6.9336"
                      value={calcLat} onChange={e => setCalcLat(e.target.value)} />
                  </div>
                  <div className="mb-2">
                    <label className="form-label small fw-semibold mb-1">Longitude</label>
                    <input className="form-control form-control-sm" placeholder="e.g. 79.8428"
                      value={calcLng} onChange={e => setCalcLng(e.target.value)} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold mb-1">Hour of day: <strong>{calcHour}:00</strong></label>
                    <input type="range" className="form-range" min={0} max={23}
                      value={calcHour} onChange={e => setCalcHour(e.target.value)} />
                  </div>
                  <button className="btn btn-cp btn-sm w-100 mb-3" onClick={handleCalc}>
                    <i className="mdi mdi-play me-1" /> Compute Score
                  </button>
                  {calcScore !== null && (
                    <div className="p-3 rounded-3 text-center" style={{
                      background: calcScore >= 0.7 ? '#fef2f2' : calcScore >= 0.5 ? '#fffbeb' : '#f0fdf4',
                      border: `1px solid ${calcScore >= 0.7 ? '#fecaca' : calcScore >= 0.5 ? '#fed7aa' : '#bbf7d0'}`
                    }}>
                      <div className="small text-muted mb-1">Anomaly Score</div>
                      <div style={{ fontSize: '2rem', fontWeight: 800 }}>
                        <ScoreBadge score={calcScore} />
                      </div>
                      <div className="small mt-2 fw-semibold" style={{
                        color: calcScore >= 0.7 ? '#dc2626' : calcScore >= 0.5 ? '#f59e0b' : '#16a34a'
                      }}>
                        {calcScore >= 0.7 ? '🚨 ANOMALY — Alert triggered!' : calcScore >= 0.5 ? '⚠️ Suspicious — Flagged on map' : '✅ Normal — Within learned zone'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 4: Recent anomalies table ── */}
          {stats.anomalies.length > 0 && (
            <div className="card mb-4">
              <div className="card-body">
                <h6 className="fw-bold mb-3">
                  <i className="mdi mdi-alert-octagon me-1 text-danger" />
                  Detected Anomalies ({stats.anomalies.length})
                </h6>
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead>
                      <tr className="text-muted small" style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        <th>Timestamp</th>
                        <th>Location</th>
                        <th>Hour</th>
                        <th>Score</th>
                        <th>Distance from Centre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.anomalies.slice(0, 15).map((p, i) => {
                        const dist = Math.sqrt(
                          (p.location.lat - stats.avgLat) ** 2 +
                          (p.location.lng - stats.avgLng) ** 2
                        );
                        const distKm = (dist * 111).toFixed(2);
                        return (
                          <tr key={i}>
                            <td className="text-muted small">{new Date(p.timestamp).toLocaleString()}</td>
                            <td className="small">{p.location.lat.toFixed(5)}, {p.location.lng.toFixed(5)}</td>
                            <td className="small">{p.hourOfDay ?? '—'}:00</td>
                            <td><ScoreBadge score={p.anomalyScore || 0} /></td>
                            <td className="small text-muted">{distKm} km</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Row 5: Replay Animation ── */}
          <div className="card mb-4" style={{ border: '2px solid #e0e7ff' }}>
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h6 className="fw-bold mb-0 d-flex align-items-center gap-2">
                  <i className="mdi mdi-play-circle text-primary" />
                  Learning Replay — Watch the model learn
                </h6>
                <div className="d-flex align-items-center gap-2">
                  <label className="small text-muted me-1">Speed:</label>
                  <select className="form-select form-select-sm" style={{ width: 110 }} value={replaySpeed}
                    onChange={e => setReplaySpeed(Number(e.target.value))}>
                    <option value={200}>Slow</option>
                    <option value={80}>Normal</option>
                    <option value={20}>Fast</option>
                    <option value={5}>Turbo</option>
                  </select>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-2">
                <div className="d-flex justify-content-between small text-muted mb-1">
                  <span>Pings learned: <strong>{replayIdx}</strong> / {sortedPings.length}</span>
                  <span>{sortedPings.length > 0 ? ((replayIdx / sortedPings.length) * 100).toFixed(0) : 0}%</span>
                </div>
                <div className="progress" style={{ height: 10 }}>
                  <div className="progress-bar"
                    style={{ width: `${sortedPings.length > 0 ? (replayIdx / sortedPings.length) * 100 : 0}%`, background: '#4e64ff', transition: 'width .1s' }} />
                </div>
              </div>

              {/* Controls */}
              <div className="d-flex gap-2 mb-4">
                {!replayPlaying
                  ? <button className="btn btn-cp btn-sm" onClick={replayStart} disabled={sortedPings.length === 0}>
                      <i className="mdi mdi-play me-1" />{replayIdx === 0 ? 'Start' : 'Resume'}
                    </button>
                  : <button className="btn btn-warning btn-sm" onClick={replayPause}>
                      <i className="mdi mdi-pause me-1" />Pause
                    </button>
                }
                <button className="btn btn-sm btn-outline-secondary" onClick={replayReset}>
                  <i className="mdi mdi-restart me-1" />Reset
                </button>
              </div>

              {/* Live stats */}
              <div className="row g-3">
                {/* Confidence meter */}
                <div className="col-md-4">
                  <div className="p-3 rounded-3" style={{ background: '#f8faff', border: '1px solid #e0e7ff' }}>
                    <div className="small text-muted mb-1">Model Confidence</div>
                    <div className="fw-bold fs-4" style={{ color: replayStats ? (replayStats.confidence > 0.7 ? '#16a34a' : replayStats.confidence > 0.3 ? '#f59e0b' : '#dc2626') : '#9ca3af' }}>
                      {replayStats ? (replayStats.confidence * 100).toFixed(0) : 0}%
                    </div>
                    <div className="progress mt-1" style={{ height: 6 }}>
                      <div className="progress-bar" style={{
                        width: `${replayStats ? replayStats.confidence * 100 : 0}%`,
                        background: replayStats?.confidence > 0.7 ? '#16a34a' : replayStats?.confidence > 0.3 ? '#f59e0b' : '#dc2626',
                        transition: 'width .2s'
                      }} />
                    </div>
                    <div className="small text-muted mt-1">
                      {!replayStats ? 'No data yet'
                        : replayStats.confidence < 0.3 ? 'Collecting data…'
                        : replayStats.confidence < 0.7 ? 'Learning pattern…'
                        : 'Pattern established!'}
                    </div>
                  </div>
                </div>

                {/* Learned centre */}
                <div className="col-md-4">
                  <div className="p-3 rounded-3" style={{ background: '#f8faff', border: '1px solid #e0e7ff' }}>
                    <div className="small text-muted mb-1">Learned Centre</div>
                    <div className="fw-semibold" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {replayStats
                        ? <>{replayStats.avgLat.toFixed(5)}<br />{replayStats.avgLng.toFixed(5)}</>
                        : <span className="text-muted">—</span>}
                    </div>
                    <div className="small text-muted mt-1">Normal zone centre</div>
                  </div>
                </div>

                {/* Latest ping time */}
                <div className="col-md-4">
                  <div className="p-3 rounded-3" style={{ background: '#f8faff', border: '1px solid #e0e7ff' }}>
                    <div className="small text-muted mb-1">Latest Ping</div>
                    <div className="fw-semibold small">
                      {replayIdx > 0 && sortedPings[replayIdx - 1]
                        ? new Date(sortedPings[replayIdx - 1].timestamp).toLocaleString()
                        : <span className="text-muted">—</span>}
                    </div>
                    <div className="small text-muted mt-1">
                      {replayIdx > 0 && sortedPings[replayIdx - 1]
                        ? `Hour: ${sortedPings[replayIdx - 1].hourOfDay}:00 · ${sortedPings[replayIdx - 1].dayOfWeek}`
                        : 'Not started'}
                    </div>
                  </div>
                </div>

                {/* Hourly chart updating live */}
                <div className="col-12">
                  <div className="small fw-semibold mb-2">Hourly Pattern (updating live)</div>
                  {replayStats
                    ? <BarChart data={replayStats.hourCounts} labels={HOUR_LABELS} color="#4e64ff" height={55} />
                    : <div className="text-muted small">Press Start to begin replay</div>}
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 6: Learning timeline ── */}
          <div className="card mb-4">
            <div className="card-body">
              <h6 className="fw-bold mb-3">
                <i className="mdi mdi-timeline me-1 text-primary" />
                Learning Timeline
              </h6>
              <div className="d-flex align-items-center gap-0" style={{ overflowX: 'auto', paddingBottom: 8 }}>
                {[
                  { icon: 'mdi-plus-circle', color: '#4e64ff', label: 'Device Registered', sub: stats.minTs.toLocaleDateString() },
                  { icon: 'mdi-database-arrow-down', color: '#8b5cf6', label: 'Collecting Pings', sub: `${pings.length} valid pings` },
                  { icon: 'mdi-map-marker-check', color: '#16a34a', label: 'Normal Zone Learned', sub: `${stats.avgLat.toFixed(4)}, ${stats.avgLng.toFixed(4)}` },
                  { icon: 'mdi-clock-check', color: '#f59e0b', label: 'Active Hours Learned', sub: `Avg ${Math.round(stats.avgHour)}:00` },
                  { icon: 'mdi-shield-check', color: '#16a34a', label: 'Monitoring ACTIVE', sub: selectedDevice?.status || '—' },
                  { icon: 'mdi-alert-circle', color: '#dc2626', label: 'Anomaly Detection', sub: 'Live scoring on each ping' },
                ].map((step, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ textAlign: 'center', width: 120 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', background: step.color + '18',
                        border: `2px solid ${step.color}`, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 6px', fontSize: 20, color: step.color
                      }}>
                        <i className={`mdi ${step.icon}`} />
                      </div>
                      <div style={{ fontSize: '.75rem', fontWeight: 600 }}>{step.label}</div>
                      <div style={{ fontSize: '.7rem', color: '#9ca3af' }}>{step.sub}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{ width: 40, height: 2, background: '#e5e7eb', flexShrink: 0 }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
