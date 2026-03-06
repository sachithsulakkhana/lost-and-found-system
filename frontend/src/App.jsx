import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AppLayout from './layout/AppLayout';
import api from './services/api';

import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DeviceMonitoringPage from './pages/DeviceMonitoringPage';
import AlertsPage from './pages/AlertsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminZonesPage from './pages/AdminZonesPage';
import RiskDashboardPage from './pages/RiskDashboardPage';
import DeviceLearningPage from './pages/DeviceLearningPage';

const STUDENT_EMAIL = 'student@example.com';
const STUDENT_PASSWORD = 'student123';

// Auto-login as student if no token present
function AutoAuthRoute({ children }) {
  const [ready, setReady] = useState(!!localStorage.getItem('token'));

  useEffect(() => {
    if (localStorage.getItem('token')) {
      setReady(true);
      return;
    }
    api.post('/auth/login', { email: STUDENT_EMAIL, password: STUDENT_PASSWORD })
      .then(({ data }) => {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setReady(true);
      })
      .catch(() => {
        window.location.href = '/login';
      });
  }, []);

  if (!ready) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return children;
}

// Admin routes require manual login + admin role
function AdminRoute({ children }) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!token || user.role !== 'admin') return <Navigate to="/login" replace />;
  return children;
}

function WithLayout({ children, adminOnly = false }) {
  const Wrapper = adminOnly ? AdminRoute : AutoAuthRoute;
  return <Wrapper><AppLayout>{children}</AppLayout></Wrapper>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/dashboard" element={<WithLayout><DashboardPage /></WithLayout>} />
        <Route path="/devices" element={<WithLayout><DevicesPage /></WithLayout>} />
        <Route path="/monitoring" element={<WithLayout><DeviceMonitoringPage /></WithLayout>} />
        <Route path="/alerts" element={<WithLayout><AlertsPage /></WithLayout>} />
        <Route path="/learning" element={<WithLayout><DeviceLearningPage /></WithLayout>} />
        <Route path="/risk-dashboard" element={<WithLayout><RiskDashboardPage /></WithLayout>} />

        <Route path="/admin/users" element={<WithLayout adminOnly><AdminUsersPage /></WithLayout>} />
        <Route path="/admin/zones" element={<WithLayout adminOnly><AdminZonesPage /></WithLayout>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
