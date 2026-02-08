import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import MapView from '../components/MapView';

function getUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function StatCard({ label, value, icon }) {
  return (
    <div className="cp-card cp-stat">
      <div className="cp-card-body d-flex align-items-center justify-content-between">
        <div>
          <div className="label mb-1">{label}</div>
          <div className="value">{value}</div>
        </div>
        <div className="icon">
          <i className={`mdi ${icon}`} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ devices: 0, alerts: 0, items: 0, zones: 5, users: 0, bookings: 0 });
  const [loading, setLoading] = useState(true);

  const isAdmin = useMemo(() => getUser()?.role === 'admin', []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async () => {
    try {
      const requests = [api.get('/alerts').catch(() => ({ data: [] }))];
      const user = getUser();

      if (user?.role === 'admin') {
        requests.push(
          api.get('/auth/users').catch(() => ({ data: [] })),
          api.get('/bookings').catch(() => ({ data: [] })),
          api.get('/risk/zones').catch(() => ({ data: [] })),
        );
      } else {
        requests.push(
          api.get('/devices').catch(() => ({ data: [] })),
          api.get('/stored-items').catch(() => ({ data: [] })),
        );
      }

      const results = await Promise.all(requests);

      if (user?.role === 'admin') {
        setStats({
          alerts: results[0].data.length,
          users: results[1].data.length,
          bookings: results[2].data.length,
          zones: results[3].data.length,
        });
      } else {
        setStats({
          alerts: results[0].data.length,
          devices: results[1].data.length,
          items: results[2].data.length,
          zones: 5,
        });
      }
    } catch (e) {
      console.error('Error fetching stats:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="fw-bold mb-1">Dashboard</h2>
          <div className="text-muted">A Connect Plus–style overview of your system.</div>
        </div>
        <div className="d-flex gap-2">
          <span className="badge cp-badge-soft">Live</span>
          <span className="badge text-bg-light border">Auto refresh 30s</span>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="row g-3 mb-4">
        {isAdmin ? (
          <>
            <div className="col-12 col-md-6 col-xl-3">
              <StatCard label="Total Users" value={loading ? '—' : stats.users} icon="mdi-account-multiple" />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <StatCard label="Active Alerts" value={loading ? '—' : stats.alerts} icon="mdi-bell-alert-outline" />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <StatCard label="All Bookings" value={loading ? '—' : stats.bookings} icon="mdi-calendar-text" />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <StatCard label="Campus Zones" value={loading ? '—' : stats.zones} icon="mdi-map-marker-multiple" />
            </div>
          </>
        ) : (
          <>
            <div className="col-12 col-md-6 col-xl-3">
              <StatCard label="My Devices" value={loading ? '—' : stats.devices} icon="mdi-devices" />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <StatCard label="Active Alerts" value={loading ? '—' : stats.alerts} icon="mdi-bell-alert-outline" />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <StatCard label="Stored Items" value={loading ? '—' : stats.items} icon="mdi-package-variant" />
            </div>
            <div className="col-12 col-md-6 col-xl-3">
              <StatCard label="Campus Zones" value={loading ? '—' : stats.zones} icon="mdi-map-marker-multiple" />
            </div>
          </>
        )}
      </div>

      {/* Map */}
      <div className="row g-3">
        <div className="col-12 col-xl-8">
          <div className="cp-card" style={{ height: 520 }}>
            <div className="cp-card-header cp-gradient d-flex align-items-center justify-content-between">
              <div>
                <div className="fw-bold d-flex align-items-center gap-2">
                  <i className="mdi mdi-map-marker" />
                  SLIIT Malabe Campus
                </div>
                <div className="small opacity-90">Real-time zone monitoring</div>
              </div>
              <span className="badge bg-light text-dark">Map</span>
            </div>
            <div className="cp-card-body" style={{ height: 'calc(520px - 56px)' }}>
              <div style={{ height: '100%' }}>
                <MapView />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="cp-card">
            <div className="cp-card-header">
              <div className="fw-bold">Quick actions</div>
              <div className="text-muted small">Common tasks in one place.</div>
            </div>
            <div className="cp-card-body">
              <div className="d-grid gap-2">
                <a className="btn btn-outline-dark" href="/alerts">
                  <i className="mdi mdi-bell-alert-outline me-1" /> View alerts
                </a>
                <a className="btn btn-outline-dark" href={isAdmin ? "/admin/booking-approvals" : "/bookings"}>
                  <i className="mdi mdi-calendar-check me-1" /> {isAdmin ? 'Review bookings' : 'My bookings'}
                </a>
                <a className="btn btn-outline-dark" href={isAdmin ? "/admin/zones" : "/zone-booking"}>
                  <i className="mdi mdi-map me-1" /> {isAdmin ? 'Manage zones' : 'Book a zone'}
                </a>
                <a className="btn btn-outline-dark" href="/devices">
                  <i className="mdi mdi-devices me-1" /> Devices
                </a>
              </div>

              <div className="mt-4 p-3 rounded" style={{ background: 'rgba(182,109,255,.10)', border: '1px solid rgba(182,109,255,.20)' }}>
                <div className="fw-bold mb-1">Tip</div>
                <div className="small text-muted">
                  Use the <span className="fw-semibold">Risk Dashboard</span> to identify hotspots before you book a zone.
                </div>
              </div>
            </div>
          </div>

          <div className="cp-card mt-3">
            <div className="cp-card-body">
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <div className="fw-bold">System status</div>
                  <div className="small text-muted">All services operational</div>
                </div>
                <span className="badge text-bg-success">OK</span>
              </div>
              <div className="progress mt-3" style={{ height: 8 }}>
                <div className="progress-bar" role="progressbar" style={{ width: '78%' }} aria-valuenow="78" aria-valuemin="0" aria-valuemax="100" />
              </div>
              <div className="small text-muted mt-2">Last check: just now</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
