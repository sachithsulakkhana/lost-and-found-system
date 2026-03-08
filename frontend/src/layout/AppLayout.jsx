import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { autoEnrollDevice } from '../services/autoEnrollment';
import api from '../services/api';
import TheftGuard from '../components/TheftGuard';

function getUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Register service worker and subscribe to Web Push so alarms reach the owner
// even when this tab is closed (e.g. on their phone or another laptop).
async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    // 1. Register the service worker
    const reg = await navigator.serviceWorker.register('/sw.js');

    // 2. Ask notification permission (no-op if already granted/denied)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // 3. Fetch VAPID public key from backend
    const { data } = await api.get('/push/vapid-public-key');
    const publicKey = data.publicKey;

    // Convert base64 VAPID key to Uint8Array
    const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    // 4. Subscribe (browser generates endpoint + key pair)
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: raw
    });

    // 5. Save subscription on backend (linked to this user account)
    await api.post('/push/subscribe', { subscription: subscription.toJSON() });
    console.log('[Push] Subscribed for theft notifications');
  } catch (err) {
    // Non-critical — silently ignore (incognito mode, blocked permissions, etc.)
    console.debug('[Push] Setup skipped:', err.message);
  }
}

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => getUser());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deviceReady, setDeviceReady] = useState(!!localStorage.getItem('enrolledDeviceId'));

  useEffect(() => {
    setUser(getUser());

    // If not already marked enrolled, check DB (returning user from a prior session).
    // Match by THIS browser's fingerprint so TheftGuard attaches to the correct device.
    if (!localStorage.getItem('enrolledDeviceId')) {
      api.get('/devices').then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          const currentFp = localStorage.getItem('deviceId');
          const myDevice = currentFp
            ? res.data.find(d => d.deviceFingerprint === currentFp)
            : null;
          localStorage.setItem('enrolledDeviceId', (myDevice || res.data[0])._id);
          setDeviceReady(true);
        }
      }).catch(() => {});
    }

    // Auto-enroll device; if a new device was created, unlock the full menu
    autoEnrollDevice().then(device => {
      if (device) setDeviceReady(true);
    }).catch(() => {});

    // Register Web Push so theft alarms reach the owner even when app is closed
    registerPush();
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const menu = useMemo(() => {
    const studentRestricted = [
      { label: 'Device Monitoring', to: '/monitoring', icon: 'mdi-eye' },
      { label: 'Learning Insights', to: '/learning', icon: 'mdi-brain' },
    ];

    const student = deviceReady ? [
      { label: 'Dashboard', to: '/dashboard', icon: 'mdi-view-dashboard' },
      { label: 'Risk Dashboard', to: '/risk-dashboard', icon: 'mdi-map-marker-radius' },
      { label: 'My Devices', to: '/devices', icon: 'mdi-devices' },
      { label: 'Device Monitoring', to: '/monitoring', icon: 'mdi-eye' },
      { label: 'Learning Insights', to: '/learning', icon: 'mdi-brain' },
      { label: 'Alerts', to: '/alerts', icon: 'mdi-bell-alert-outline' },
    ] : studentRestricted;

    const admin = [
      { label: 'Dashboard', to: '/dashboard', icon: 'mdi-view-dashboard' },
      { label: 'Risk Dashboard', to: '/risk-dashboard', icon: 'mdi-map-marker-radius' },
      { label: 'Alerts', to: '/alerts', icon: 'mdi-bell-alert-outline' },
      { label: 'User Management', to: '/admin/users', icon: 'mdi-account-multiple' },
      { label: 'Zone Management', to: '/admin/zones', icon: 'mdi-map-marker-multiple' },
    ];

    return user?.role === 'admin' ? admin : student;
  }, [user?.role, deviceReady]);

  const onLogout = () => {
    localStorage.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="cp-app">
      <TheftGuard />

      {/* Overlay backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div className="cp-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`cp-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="logo-dot" />
          <div className="fw-bold">Device Tracking</div>
          <div className="ms-2 small opacity-75">SLIIT</div>
          {/* Close button visible only on mobile */}
          <button
            className="btn btn-sm text-white ms-auto d-lg-none"
            onClick={() => setSidebarOpen(false)}
            style={{ fontSize: '1.3rem' }}
          >
            <i className="mdi mdi-close" />
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-title">{user?.role === 'admin' ? 'Admin' : ''} Menu</div>
          <nav className="nav flex-column">
            {menu.map((m) => (
              <NavLink key={m.to} to={m.to} className={({ isActive }) => `nav-link cp-nav ${isActive ? 'active' : ''}`.trim()}>
                <i className={`mdi ${m.icon}`} />
                <span>{m.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <main className="cp-main">
        <header className="cp-topbar d-flex align-items-center">
          <div className="container-fluid d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              {/* Hamburger button - visible only on mobile */}
              <button
                className="btn btn-sm btn-light border d-lg-none"
                onClick={() => setSidebarOpen(true)}
                title="Open menu"
                type="button"
              >
                <i className="mdi mdi-menu" />
              </button>
              <div className="fw-bold">Device Tracking</div>
              <div className="d-none d-md-block" style={{ width: 360 }}>
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-white"><i className="mdi mdi-magnify" /></span>
                  <input className="form-control" placeholder="Search" />
                </div>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-light border d-none d-sm-inline-block" title="Notifications" type="button">
                <i className="mdi mdi-bell-outline" />
              </button>
              <button className="btn btn-sm btn-light border d-none d-sm-inline-block" title="Settings" type="button">
                <i className="mdi mdi-cog-outline" />
              </button>
              <div className="vr mx-1 d-none d-sm-block" />
              <div className="text-end d-none d-sm-block">
                <div className="fw-semibold" style={{ lineHeight: 1.1 }}>{user?.name || 'User'}</div>
                <div className="small text-muted">{user?.role || 'member'}</div>
              </div>
              <button className="btn btn-sm btn-outline-dark" onClick={onLogout}>
                <i className="mdi mdi-logout me-1" />
                <span className="d-none d-sm-inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <div className="cp-content">
          {children}
        </div>

        <footer className="py-3 text-center text-muted small">
          &copy; {new Date().getFullYear()} SLIIT Device Tracking
        </footer>
      </main>
    </div>
  );
}
