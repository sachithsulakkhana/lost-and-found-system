import { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import api from '../services/api';
import 'leaflet/dist/leaflet.css';

// Fit map bounds whenever path changes
function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [40, 40] });
    } else if (positions.length === 1) {
      map.setView(positions[0], 17);
    }
  }, [positions, map]);
  return null;
}

const ANOMALY_THRESHOLD = 0.5;

export default function DevicePathMap({ deviceId, onAnomalyDetected }) {
  const [pings, setPings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('24h');
  const wsRef = useRef(null);
  const notifiedRef = useRef(new Set());

  const fetchHistory = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/location/history/${deviceId}?limit=500`);
      const list = Array.isArray(data) ? data : [];

      // Filter by time range
      const now = Date.now();
      const rangeMs = timeRange === '1h' ? 3600000
        : timeRange === '6h' ? 21600000
        : timeRange === '24h' ? 86400000
        : 604800000; // 7d

      const filtered = list.filter(p => (now - new Date(p.timestamp).getTime()) <= rangeMs);
      // Sort oldest-first for polyline drawing
      filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      setPings(filtered);

      // Check for anomalies in loaded pings
      filtered.forEach(p => {
        if (p.anomalyScore >= ANOMALY_THRESHOLD && !notifiedRef.current.has(p._id)) {
          notifiedRef.current.add(p._id);
          onAnomalyDetected?.(p);
        }
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [deviceId, timeRange, onAnomalyDetected]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // WebSocket for live updates
  useEffect(() => {
    if (!deviceId) return;
    const base = api.defaults.baseURL || '/api';
    const u = new URL(base, window.location.origin);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${u.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', payload: { deviceId } }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data));
          if (msg?.type === 'ping_saved' && msg.payload?.ping) {
            const newPing = msg.payload.ping;
            setPings(prev => [...prev, newPing]);

            // Instant anomaly check
            if (newPing.anomalyScore >= ANOMALY_THRESHOLD && !notifiedRef.current.has(newPing._id)) {
              notifiedRef.current.add(newPing._id);
              onAnomalyDetected?.(newPing);
            }
          }
          if (msg?.type === 'anomaly_alert') {
            onAnomalyDetected?.(msg.payload);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [deviceId, onAnomalyDetected]);

  // Build path segments (normal vs anomaly)
  const positions = pings
    .filter(p => p.location?.lat && p.location?.lng)
    .map(p => [p.location.lat, p.location.lng]);

  // Split path into normal and anomaly segments for color coding
  const normalSegments = [];
  const anomalySegments = [];

  for (let i = 1; i < pings.length; i++) {
    const prev = pings[i - 1];
    const curr = pings[i];
    if (!prev.location?.lat || !curr.location?.lat) continue;

    const segment = [
      [prev.location.lat, prev.location.lng],
      [curr.location.lat, curr.location.lng]
    ];

    if (curr.anomalyScore >= ANOMALY_THRESHOLD) {
      anomalySegments.push(segment);
    } else {
      normalSegments.push(segment);
    }
  }

  // Anomaly points for markers
  const anomalyPoints = pings.filter(p =>
    p.anomalyScore >= ANOMALY_THRESHOLD && p.location?.lat && p.location?.lng
  );

  const latestPing = pings.length > 0 ? pings[pings.length - 1] : null;

  // SLIIT campus center as fallback
  const defaultCenter = [6.914831936575134, 79.97288012698459];

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h5 className="card-title mb-0">
            <i className="mdi mdi-map-marker-path me-2 text-primary" />
            Device Travel Path
          </h5>
          <div className="d-flex align-items-center gap-2">
            {['1h', '6h', '24h', '7d'].map(r => (
              <button
                key={r}
                className={`btn btn-sm ${timeRange === r ? 'btn-cp' : 'btn-outline-secondary'}`}
                onClick={() => setTimeRange(r)}
              >
                {r}
              </button>
            ))}
            <button className="btn btn-sm btn-light border" onClick={fetchHistory} disabled={loading}>
              <i className={`mdi mdi-refresh ${loading ? 'mdi-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="d-flex gap-3 mb-2 small">
          <span><span style={{ display: 'inline-block', width: 20, height: 3, background: '#4e64ff', verticalAlign: 'middle', marginRight: 4 }} /> Normal path</span>
          <span><span style={{ display: 'inline-block', width: 20, height: 3, background: '#dc2626', verticalAlign: 'middle', marginRight: 4 }} /> Anomaly detected</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#22c55e', verticalAlign: 'middle', marginRight: 4 }} /> Current location</span>
          <span className="text-muted">({pings.length} points)</span>
        </div>

        <div style={{ height: 420, borderRadius: 14, overflow: 'hidden' }}>
          <MapContainer
            center={latestPing ? [latestPing.location.lat, latestPing.location.lng] : defaultCenter}
            zoom={17}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {positions.length > 1 && <FitBounds positions={positions} />}

            {/* Normal path segments */}
            {normalSegments.map((seg, i) => (
              <Polyline key={`n-${i}`} positions={seg} pathOptions={{ color: '#4e64ff', weight: 3, opacity: 0.7 }} />
            ))}

            {/* Anomaly path segments */}
            {anomalySegments.map((seg, i) => (
              <Polyline key={`a-${i}`} positions={seg} pathOptions={{ color: '#dc2626', weight: 4, opacity: 0.9, dashArray: '8,6' }} />
            ))}

            {/* Anomaly markers */}
            {anomalyPoints.map((p, i) => (
              <CircleMarker
                key={`ap-${i}`}
                center={[p.location.lat, p.location.lng]}
                radius={7}
                pathOptions={{ color: '#dc2626', fillColor: '#fee2e2', fillOpacity: 0.9, weight: 2 }}
              >
                <Popup>
                  <div style={{ minWidth: 160 }}>
                    <strong style={{ color: '#dc2626' }}>Anomaly Detected</strong><br />
                    <small>Score: {(p.anomalyScore * 100).toFixed(1)}%</small><br />
                    <small>Speed: {p.speed?.toFixed(1) || '?'} m/s</small><br />
                    <small>{new Date(p.timestamp).toLocaleString()}</small><br />
                    {p.zoneId?.name && <small>Zone: {p.zoneId.name}</small>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Start point */}
            {pings.length > 0 && pings[0].location?.lat && (
              <CircleMarker
                center={[pings[0].location.lat, pings[0].location.lng]}
                radius={6}
                pathOptions={{ color: '#6b7280', fillColor: '#d1d5db', fillOpacity: 1, weight: 2 }}
              >
                <Popup>
                  <strong>Start</strong><br />
                  <small>{new Date(pings[0].timestamp).toLocaleString()}</small>
                </Popup>
              </CircleMarker>
            )}

            {/* Current location (latest ping) */}
            {latestPing?.location?.lat && (
              <CircleMarker
                center={[latestPing.location.lat, latestPing.location.lng]}
                radius={8}
                pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1, weight: 3 }}
              >
                <Popup>
                  <div style={{ minWidth: 140 }}>
                    <strong style={{ color: '#16a34a' }}>Current Location</strong><br />
                    <small>{latestPing.location.lat.toFixed(6)}, {latestPing.location.lng.toFixed(6)}</small><br />
                    <small>Speed: {latestPing.speed?.toFixed(1) || '?'} m/s</small><br />
                    <small>{new Date(latestPing.timestamp).toLocaleString()}</small>
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
