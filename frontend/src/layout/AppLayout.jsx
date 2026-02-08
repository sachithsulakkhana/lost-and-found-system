import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';

function getUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(() => getUser());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const menu = useMemo(() => {
    const student = [
      { label: 'Dashboard', to: '/dashboard', icon: 'mdi-view-dashboard' },
      { label: 'Risk Dashboard', to: '/risk-dashboard', icon: 'mdi-map-marker-radius' },
      { label: 'Zone Booking', to: '/zone-booking', icon: 'mdi-map' },
      { label: 'My Devices', to: '/devices', icon: 'mdi-devices' },
      { label: 'Device Monitoring', to: '/monitoring', icon: 'mdi-eye' },
      { label: 'Calendar', to: '/calendar', icon: 'mdi-calendar-month' },
      { label: 'Alerts', to: '/alerts', icon: 'mdi-bell-alert-outline' },
      { label: 'Reminders', to: '/reminders', icon: 'mdi-bell-ring-outline' },
    ];

    const admin = [
      { label: 'Dashboard', to: '/dashboard', icon: 'mdi-view-dashboard' },
      { label: 'Risk Dashboard', to: '/risk-dashboard', icon: 'mdi-map-marker-radius' },
      { label: 'Booking Approvals', to: '/admin/booking-approvals', icon: 'mdi-check-decagram' },
      { label: 'Alerts', to: '/alerts', icon: 'mdi-bell-alert-outline' },
      { label: 'All Reminders', to: '/reminders', icon: 'mdi-bell-ring-outline' },
      { label: 'User Management', to: '/admin/users', icon: 'mdi-account-multiple' },
      { label: 'Zone Management', to: '/admin/zones', icon: 'mdi-map-marker-multiple' },
      { label: 'All Bookings', to: '/admin/bookings', icon: 'mdi-calendar-text' },
      { label: 'Calendar Events', to: '/admin/calendar', icon: 'mdi-calendar' },
    ];

    return user?.role === 'admin' ? admin : student;
  }, [user?.role]);

  const onLogout = () => {
    localStorage.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="cp-app">
      {/* Overlay backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div className="cp-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`cp-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="logo-dot" />
          <div className="fw-bold">Lost &amp; Found</div>
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
          <div className="nav-title">{user?.role === 'admin' ? 'Admin' : 'Student'} menu</div>
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
              <div className="fw-bold">Lost &amp; Found</div>
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
          &copy; {new Date().getFullYear()} Lost &amp; Found &middot; SLIIT
        </footer>
      </main>
    </div>
  );
}
