import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';

function Modal({ title, open, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="modal d-block" tabIndex={-1} role="dialog" style={{ background: 'rgba(0,0,0,.5)' }}>
      <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow-lg" style={{ borderRadius: 14 }}>
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title fw-bold">{title}</h5>
            <button type="button" className="btn btn-sm btn-light border" onClick={onClose}>
              <i className="mdi mdi-close" />
            </button>
          </div>
          <div className="modal-body pt-2">{children}</div>
          {footer ? <div className="modal-footer border-0 pt-0">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

function formatRange(evt) {
  const start = new Date(evt.start);
  const end = new Date(evt.end);
  return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [zones, setZones] = useState([]);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  const timeSlots = useMemo(
    () => Array.from({ length: 13 }, (_, i) => `${(i + 8).toString().padStart(2, '0')}:00`),
    []
  );

  const [form, setForm] = useState({
    title: '',
    description: '',
    reason: '',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '17:00',
    zoneId: '',
    wholeCampus: false,
    notifyUsers: true,
  });

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setIsAdmin(user.role === 'admin');
      } catch {
        // ignore
      }
    }
    fetchEvents();
    fetchZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchZones = async () => {
    try {
      const { data } = await api.get('/risk/zones');
      const list = Array.isArray(data) ? data : [];
      setZones(list);
      if (!form.zoneId && list.length > 0) {
        setForm((p) => ({ ...p, zoneId: list[0].zoneId }));
      }
    } catch {
      // non-blocking
    }
  };

  const fetchEvents = async () => {
    try {
      const { data } = await api.get('/calendar/events');
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load events');
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      reason: '',
      startDate: '',
      startTime: '09:00',
      endDate: '',
      endTime: '17:00',
      zoneId: zones?.[0]?.zoneId || '',
      wholeCampus: false,
      notifyUsers: true,
    });
  };

  const handleSubmit = async () => {
    try {
      if (!form.title || !form.startDate || !form.endDate) {
        toast.error('Please fill title, start date and end date');
        return;
      }
      setSaving(true);
      const start = new Date(`${form.startDate}T${form.startTime}:00`).toISOString();
      const end = new Date(`${form.endDate}T${form.endTime}:00`).toISOString();
      const payload = {
        title: form.title,
        description: form.description,
        reason: form.reason || form.title,
        start,
        end,
        zoneId: form.wholeCampus ? undefined : form.zoneId,
        isWholeCampus: form.wholeCampus,
        notifyUsers: form.notifyUsers,
      };
      await api.post('/calendar/events', payload);
      toast.success('Event created successfully');
      setOpen(false);
      resetForm();
      fetchEvents();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try {
      await api.delete(`/calendar/events/${id}`);
      toast.success('Event deleted');
      fetchEvents();
    } catch {
      toast.error('Failed to delete event');
    }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <i className="mdi mdi-calendar-month text-primary" /> Calendar
          </h2>
          <div className="text-muted small">Campus events and zone closures (admin can create announcements).</div>
        </div>

        {isAdmin ? (
          <button className="btn btn-cp" onClick={() => setOpen(true)}>
            <i className="mdi mdi-plus me-1" /> New Event
          </button>
        ) : null}
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr className="text-muted small" style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>
                  <th>Event</th>
                  <th>When</th>
                  <th>Scope</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-5 text-center text-muted">
                      <i className="mdi mdi-calendar-blank fs-2 d-block mb-2 opacity-50" />
                      No events.
                    </td>
                  </tr>
                ) : (
                  events.map((evt) => (
                    <tr key={evt._id}>
                      <td>
                        <div className="fw-semibold d-flex align-items-center gap-2">
                          <i className="mdi mdi-calendar-text text-primary" /> {evt.title}
                        </div>
                        <div className="text-muted small">{evt.description || evt.reason || ''}</div>
                      </td>
                      <td>
                        <div className="fw-semibold">{formatRange(evt)}</div>
                      </td>
                      <td>
                        {evt.isWholeCampus ? (
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-3 py-2 fw-semibold">
                            <i className="mdi mdi-map me-1" /> Whole campus
                          </span>
                        ) : (
                          <span className="badge bg-light text-dark border rounded-pill px-3 py-2 fw-semibold">
                            <i className="mdi mdi-map-marker-outline me-1" /> {evt.zoneName || evt.zoneId || 'Zone'}
                          </span>
                        )}
                      </td>
                      <td className="text-end">
                        {isAdmin ? (
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(evt._id)}>
                            <i className="mdi mdi-delete-outline me-1" /> Delete
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

      <Modal
        title="Create Event"
        open={open}
        onClose={() => (saving ? null : setOpen(false))}
        footer={
          <>
            <button className="btn btn-light border" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-cp" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving…' : 'Create'}
            </button>
          </>
        }
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label fw-semibold">Title</label>
            <input className="form-control" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold">Reason (optional)</label>
            <input className="form-control" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
          </div>

          <div className="col-12">
            <label className="form-label fw-semibold">Description</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>

          <div className="col-md-6">
            <label className="form-label fw-semibold">Start</label>
            <div className="d-flex gap-2">
              <input type="date" className="form-control" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
              <select className="form-select" value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}>
                {timeSlots.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label fw-semibold">End</label>
            <div className="d-flex gap-2">
              <input type="date" className="form-control" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
              <select className="form-select" value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}>
                {timeSlots.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="col-12">
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" checked={form.wholeCampus} onChange={(e) => setForm((p) => ({ ...p, wholeCampus: e.target.checked }))} id="wholeCampus" />
              <label className="form-check-label fw-semibold" htmlFor="wholeCampus">Whole campus (no specific zone)</label>
            </div>
          </div>

          {!form.wholeCampus ? (
            <div className="col-12">
              <label className="form-label fw-semibold">Zone</label>
              <select className="form-select" value={form.zoneId} onChange={(e) => setForm((p) => ({ ...p, zoneId: e.target.value }))}>
                {zones.map((z) => (
                  <option key={z.zoneId} value={z.zoneId}>{z.name || z.location || z.zoneId}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="col-12">
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" checked={form.notifyUsers} onChange={(e) => setForm((p) => ({ ...p, notifyUsers: e.target.checked }))} id="notifyUsers" />
              <label className="form-check-label" htmlFor="notifyUsers">Notify users</label>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
