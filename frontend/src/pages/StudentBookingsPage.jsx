import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';

function StatusBadge({ status }) {
  const cfg = useMemo(() => {
    if (status === 'APPROVED') return { tone: 'success', icon: 'mdi-check-circle-outline' };
    if (status === 'REJECTED') return { tone: 'danger', icon: 'mdi-close-circle-outline' };
    if (status === 'CANCELLED') return { tone: 'secondary', icon: 'mdi-cancel' };
    return { tone: 'warning', icon: 'mdi-timer-sand' };
  }, [status]);

  const cls = cfg.tone === 'success'
    ? 'bg-success-subtle text-success border border-success-subtle'
    : cfg.tone === 'danger'
      ? 'bg-danger-subtle text-danger border border-danger-subtle'
      : cfg.tone === 'warning'
        ? 'bg-warning-subtle text-warning border border-warning-subtle'
        : 'bg-light text-muted border';

  return (
    <span className={`badge rounded-pill ${cls} px-3 py-2 fw-semibold`}>
      <i className={`mdi ${cfg.icon} me-1`} /> {status}
    </span>
  );
}

export default function StudentBookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/bookings/my');
      setBookings(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cancel = async (id) => {
    if (!window.confirm('Cancel this booking request?')) return;
    try {
      await api.put(`/bookings/${id}/cancel`);
      toast.success('Booking cancelled');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to cancel booking');
    }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <i className="mdi mdi-calendar-check text-primary" /> My Bookings
          </h2>
          <div className="text-muted small">Track approval status and manage your storage bookings.</div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr className="text-muted small" style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>
                  <th>Zone</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Slots</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-4">
                      <div className="d-flex align-items-center gap-2 text-muted">
                        <span className="spinner-border spinner-border-sm" role="status" /> Loading…
                      </div>
                    </td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-5 text-center text-muted">
                      <i className="mdi mdi-calendar-remove fs-2 d-block mb-2 opacity-50" />
                      No bookings yet.
                    </td>
                  </tr>
                ) : (
                  bookings.map((b) => (
                    <tr key={b._id}>
                      <td>
                        <div className="fw-semibold">{b.zoneName || b.zone?.name || '—'}</div>
                        <div className="text-muted small">{b.location || b.zone?.location || ''}</div>
                      </td>
                      <td>{b.date || (b.bookingDate ? new Date(b.bookingDate).toLocaleDateString() : '—')}</td>
                      <td>{b.time || (b.startTime ? b.startTime : '—')}</td>
                      <td className="fw-semibold">{b.slots || b.slotsBooked || 1}</td>
                      <td className="text-muted small">{Array.isArray(b.items) ? b.items.length : (Array.isArray(b.itemsToStore) ? b.itemsToStore.length : '—')}</td>
                      <td><StatusBadge status={b.status || 'PENDING'} /></td>
                      <td className="text-end">
                        {['PENDING', 'APPROVED'].includes(b.status) ? (
                          <button className="btn btn-sm btn-outline-danger" onClick={() => cancel(b._id)}>
                            <i className="mdi mdi-cancel me-1" /> Cancel
                          </button>
                        ) : (
                          <span className="text-muted small">—</span>
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
  );
}
