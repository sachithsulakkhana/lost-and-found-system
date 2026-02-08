import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, Polygon, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function MapView() {
  const sliitCenter = [6.914831936575134, 79.97288012698459];
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/ml-training/heatmap');
        if (data?.loaded && data?.locations) {
          const zoneData = data.locations
            .filter((loc) => loc.coordinates || loc.boundary)
            .map((loc) => ({
              name: loc.location,
              riskLevel: loc.riskLevel,
              riskScore: loc.riskScore,
              confidence: loc.confidence,
              rfPrediction: loc.rfPrediction,
              nnPrediction: loc.nnPrediction,
              center: loc.coordinates,
              boundary: loc.boundary,
              radius: loc.radius,
              availableSlots: loc.availableSlots,
              totalSlots: loc.totalSlots,
            }));
          setZones(zoneData);
        } else {
          const { data: fallbackData } = await api.get('/risk/zones');
          setZones(fallbackData || []);
        }
      } catch (e) {
        console.error('Failed to load risk zones:', e);
        try {
          const { data } = await api.get('/risk/zones');
          setZones(data || []);
        } catch (err) {
          console.error('Fallback also failed:', err);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const riskColor = (riskLevel) => {
    if (riskLevel === 'CRITICAL') return '#dc2626';
    if (riskLevel === 'HIGH') return '#ea580c';
    if (riskLevel === 'MEDIUM') return '#f59e0b';
    return '#10b981';
  };

  const riskIcon = (riskLevel) => {
    if (riskLevel === 'CRITICAL') return 'mdi-alert-octagon';
    if (riskLevel === 'HIGH') return 'mdi-alert';
    if (riskLevel === 'MEDIUM') return 'mdi-alert-circle-outline';
    return 'mdi-check-circle-outline';
  };

  const polygonPositions = (zone) => {
    const ring = zone?.boundary?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 3) return null;
    return ring.map(([lng, lat]) => [lat, lng]);
  };

  if (loading) {
    return (
      <div className="h-100 d-flex flex-column align-items-center justify-content-center gap-2">
        <div className="spinner-border" role="status" />
        <div className="text-muted small">Loading real-time risk zones...</div>
      </div>
    );
  }

  return (
    <div className="h-100 position-relative">
      {/* Legend */}
      <div
        className="cp-card"
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, padding: 12, width: 170 }}
      >
        <div className="fw-bold small mb-2">Risk level</div>
        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => (
          <div key={level} className="d-flex align-items-center gap-2 mb-1">
            <span style={{ width: 14, height: 14, borderRadius: 4, background: riskColor(level), display: 'inline-block' }} />
            <span className="small">{level}</span>
          </div>
        ))}
      </div>

      <MapContainer center={sliitCenter} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {zones.map((zone, index) => {
          const poly = polygonPositions(zone);
          const color = riskColor(zone.riskLevel);

          const popup = (
            <div style={{ minWidth: 220 }}>
              <div className="fw-bold mb-1">{zone.name}</div>
              <div className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded" style={{ background: color, color: '#fff', fontWeight: 700, fontSize: 12 }}>
                <i className={`mdi ${riskIcon(zone.riskLevel)}`} /> {zone.riskLevel} RISK
              </div>
              <div className="mt-2 small">
                <div>
                  <i className="mdi mdi-target me-1" />
                  Risk Score: {((zone.riskScore ?? 0) * 100).toFixed(0)}%
                </div>
                {zone.confidence !== undefined && (
                  <div className="text-muted">
                    <i className="mdi mdi-robot-outline me-1" />
                    ML Confidence: {((zone.confidence ?? 0) * 100).toFixed(0)}%
                  </div>
                )}
                {zone.rfPrediction !== undefined && zone.nnPrediction !== undefined && (
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    <i className="mdi mdi-chart-line me-1" />
                    RF: {zone.rfPrediction} | NN: {zone.nnPrediction}
                  </div>
                )}
                {zone.availableSlots !== undefined && (
                  <div className="text-muted">
                    <i className="mdi mdi-package-variant-closed me-1" />
                    Slots: {zone.availableSlots}/{zone.totalSlots}
                  </div>
                )}
              </div>
            </div>
          );

          if (poly) {
            return (
              <Polygon
                key={`poly-${index}`}
                positions={poly}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.15, weight: 2 }}
              >
                <Tooltip sticky>{zone.name}</Tooltip>
                <Popup>{popup}</Popup>
              </Polygon>
            );
          }

          if (zone.center && zone.radius) {
            return (
              <Circle
                key={`circle-${index}`}
                center={[zone.center[0], zone.center[1]]}
                radius={zone.radius}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.15, weight: 2 }}
              >
                <Tooltip sticky>{zone.name}</Tooltip>
                <Popup>{popup}</Popup>
              </Circle>
            );
          }

          if (zone.center) {
            return (
              <Marker key={`marker-${index}`} position={[zone.center[0], zone.center[1]]}>
                <Popup>{popup}</Popup>
              </Marker>
            );
          }

          return null;
        })}
      </MapContainer>
    </div>
  );
}
