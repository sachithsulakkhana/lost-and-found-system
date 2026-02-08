import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';

function Badge({ text, tone = 'secondary', icon }) {
  const cls = useMemo(() => {
    if (tone === 'success') return 'bg-success-subtle text-success border border-success-subtle';
    if (tone === 'warning') return 'bg-warning-subtle text-warning border border-warning-subtle';
    if (tone === 'danger') return 'bg-danger-subtle text-danger border border-danger-subtle';
    return 'bg-light text-muted border';
  }, [tone]);

  return (
    <span className={`badge rounded-pill ${cls} px-3 py-2 fw-semibold`}>
      {icon ? <i className={`mdi ${icon} me-1`} /> : null}
      {text}
    </span>
  );
}

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

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [verifyStep, setVerifyStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    identifier: '',
    manufacturer: '',
    model: '',
  });

  const steps = [
    { label: 'Preparing Device', icon: 'mdi-shield-check-outline' },
    { label: 'ML Device Recognition', icon: 'mdi-brain' },
    { label: 'Learning Device Patterns', icon: 'mdi-chart-line' },
    { label: 'Finalizing Registration', icon: 'mdi-check-circle-outline' },
  ];

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/devices');
      setDevices(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const simulateVerification = async () => {
    setVerifying(true);
    setVerifyProgress(0);
    setVerifyStep(0);

    for (let step = 0; step < steps.length; step++) {
      setVerifyStep(step);
      for (let progress = 0; progress <= 100; progress += 5) {
        setVerifyProgress(progress);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 25));
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 220));
    }
  };

  const onSubmit = async () => {
    try {
      await simulateVerification();
      await api.post('/devices', form);
      toast.success('Device registered successfully. ML learning period started.');
      setOpen(false);
      setVerifying(false);
      setForm({ name: '', identifier: '', manufacturer: '', model: '' });
      fetchDevices();
    } catch (e) {
      setVerifying(false);
      toast.error(e?.response?.data?.error || 'Failed to add device');
    }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <i className="mdi mdi-devices text-primary" /> My Devices
          </h2>
          <div className="text-muted small">Register devices to enable monitoring and ML-assisted risk scoring.</div>
        </div>

        <button className="btn btn-cp" onClick={() => setOpen(true)}>
          <i className="mdi mdi-plus me-1" /> Add Device
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr className="text-muted small" style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>
                  <th>Device</th>
                  <th>MAC Address</th>
                  <th>Manufacturer</th>
                  <th>Model</th>
                  <th>ML Status</th>
                  <th className="text-end">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-4">
                      <div className="d-flex align-items-center gap-2 text-muted">
                        <span className="spinner-border spinner-border-sm" role="status" /> Loading…
                      </div>
                    </td>
                  </tr>
                ) : devices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-5 text-center text-muted">
                      <i className="mdi mdi-devices fs-2 d-block mb-2 opacity-50" />
                      No devices registered yet. Add your first device to get started.
                    </td>
                  </tr>
                ) : (
                  devices.map((d) => {
                    const isLearning = d.status === 'LEARNING';
                    return (
                      <tr key={d._id}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <span className="cp-stat icon" style={{ width: 38, height: 38, borderRadius: 12 }}>
                              <i className="mdi mdi-laptop" />
                            </span>
                            <div>
                              <div className="fw-semibold">{d.name}</div>
                              <div className="text-muted small">{d.identifier || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge bg-light text-dark border" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                            {d.macAddress || 'N/A'}
                          </span>
                        </td>
                        <td>{d.manufacturer || '—'}</td>
                        <td>{d.model || '—'}</td>
                        <td>
                          {isLearning ? (
                            <Badge text="Learning" tone="warning" icon="mdi-brain" />
                          ) : (
                            <Badge text="Ready" tone="success" icon="mdi-check" />
                          )}
                        </td>
                        <td className="text-end">
                          <Badge
                            text={d.status || 'UNKNOWN'}
                            tone={d.status === 'ACTIVE' ? 'success' : d.status === 'LEARNING' ? 'warning' : 'secondary'}
                            icon={d.status === 'ACTIVE' ? 'mdi-check-decagram' : d.status === 'LEARNING' ? 'mdi-timer-sand' : 'mdi-help-circle-outline'}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        title="Add Device"
        open={open}
        onClose={() => (!verifying ? setOpen(false) : null)}
        footer={
          <>
            <button className="btn btn-light border" onClick={() => setOpen(false)} disabled={verifying}>
              Cancel
            </button>
            <button className="btn btn-cp" onClick={onSubmit} disabled={verifying || !form.name.trim()}>
              {verifying ? 'Verifying…' : 'Register'}
            </button>
          </>
        }
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label fw-semibold">Device Name</label>
            <input className="form-control" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold">Identifier</label>
            <input className="form-control" value={form.identifier} onChange={(e) => setForm((p) => ({ ...p, identifier: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold">Manufacturer</label>
            <input className="form-control" value={form.manufacturer} onChange={(e) => setForm((p) => ({ ...p, manufacturer: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold">Model</label>
            <input className="form-control" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
          </div>
        </div>

        {verifying ? (
          <div className="mt-4">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="fw-semibold d-flex align-items-center gap-2">
                <i className={`mdi ${steps[verifyStep]?.icon}`} /> {steps[verifyStep]?.label}
              </div>
              <div className="small text-muted">{verifyProgress}%</div>
            </div>
            <div className="progress" style={{ height: 8 }}>
              <div className="progress-bar" role="progressbar" style={{ width: `${verifyProgress}%` }} />
            </div>
            <div className="mt-3 d-flex flex-wrap gap-2">
              {steps.map((s, idx) => (
                <span
                  key={s.label}
                  className={`badge rounded-pill px-3 py-2 ${idx <= verifyStep ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-light text-muted border'}`}
                >
                  <i className={`mdi ${s.icon} me-1`} /> {s.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
