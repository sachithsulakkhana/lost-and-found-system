import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layout/AppLayout';

import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DeviceMonitoringPage from './pages/DeviceMonitoringPage';
import CalendarPage from './pages/CalendarPage';
import AlertsPage from './pages/AlertsPage';
import StudentBookingsPage from './pages/StudentBookingsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RemindersPage from './pages/RemindersPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminZonesPage from './pages/AdminZonesPage';
import AdminBookingsPage from './pages/AdminBookingsPage';
import AdminBookingCalendarPage from './pages/AdminBookingCalendarPage';
import RiskDashboardPage from './pages/RiskDashboardPage';
import EnhancedZoneBookingPage from './pages/EnhancedZoneBookingPage';
import AdminBookingApprovalsPage from './pages/AdminBookingApprovalsPage';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function WithLayout({ children }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
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
        <Route path="/calendar" element={<WithLayout><CalendarPage /></WithLayout>} />
        <Route path="/alerts" element={<WithLayout><AlertsPage /></WithLayout>} />
        <Route path="/bookings" element={<WithLayout><StudentBookingsPage /></WithLayout>} />
        <Route path="/reminders" element={<WithLayout><RemindersPage /></WithLayout>} />

        <Route path="/admin/users" element={<WithLayout><AdminUsersPage /></WithLayout>} />
        <Route path="/admin/zones" element={<WithLayout><AdminZonesPage /></WithLayout>} />
        <Route path="/admin/calendar" element={<WithLayout><AdminBookingCalendarPage /></WithLayout>} />
        <Route path="/admin/bookings" element={<WithLayout><AdminBookingsPage /></WithLayout>} />
        <Route path="/admin/booking-approvals" element={<WithLayout><AdminBookingApprovalsPage /></WithLayout>} />

        <Route path="/risk-dashboard" element={<WithLayout><RiskDashboardPage /></WithLayout>} />
        <Route path="/zone-booking" element={<WithLayout><EnhancedZoneBookingPage /></WithLayout>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
