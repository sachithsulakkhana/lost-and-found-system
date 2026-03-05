import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import { getAutoDeviceInfo, getDeviceIdentifier, storeDeviceInfo } from '../services/deviceFingerprint';

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
  const [togglingDesignated, setTogglingDesignated] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [verifyStep, setVerifyStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
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

  const toggleDesignated = async (deviceId) => {
    setTogglingDesignated(deviceId);
    try {
      const { data } = await api.put(`/devices/${deviceId}/designated`);
      setDevices((prev) => prev.map((d) => d._id === deviceId ? { ...d, isDesignated: data.isDesignated } : d));
      toast.success(data.isDesignated ? 'Marked as designated device — alarms suppressed after owner dismiss' : 'Designation removed');
    } catch {
      toast.error('Failed to update device');
    } finally {
      setTogglingDesignated(null);
    }
  };

  const onSubmit = async () => {
    try {
      // Get auto-detected device info
      const deviceInfo = getAutoDeviceInfo();
      const deviceIdentifier = getDeviceIdentifier();

      // Submit with auto-detected info
      const deviceData = {
        name: form.name || deviceInfo.name,
        identifier: deviceInfo.name,
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        deviceFingerprint: deviceIdentifier,
        userAgent: deviceInfo.userAgent
      };

      await simulateVerification();
      const response = await api.post('/devices', deviceData);

      // Store device info locally for future reference
      storeDeviceInfo(deviceIdentifier, deviceInfo);

      toast.success('Device registered successfully. ML learning period started.');
      setOpen(false);
      setVerifying(false);
      setForm({ name: '' });
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
          <div className="text-muted small">
            <i className="mdi mdi-information-outline me-1" />
            Devices are automatically detected and enrolled. They appear here once you start using the app.
          </div>
        </div>
      </div>

      <div className="alert alert-info mb-4">
        <i className="mdi mdi-auto-fix me-2" />
        <strong>Automatic Device Detection Enabled:</strong> Your devices are being automatically detected and registered. No manual setup required!
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr className="text-muted small" style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>
                  <th>Device</th>
                  <th>Type / Identifier</th>
                  <th>Manufacturer</th>
                  <th>ML Status</th>
                  <th>Designated</th>
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
                      <i className="mdi mdi-devices-off fs-2 d-block mb-2 opacity-50" />
                      No devices detected yet.<br />
                      <small>Use the app on your device and it will automatically appear here.</small>
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
                              <div className="text-muted small">{d.deviceFingerprint || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>{d.identifier || d.deviceType || '—'}</td>
                        <td>{d.manufacturer || '—'}</td>
                        <td>
                          {isLearning ? (
                            <Badge text="Learning" tone="warning" icon="mdi-brain" />
                          ) : (
                            <Badge text="Ready" tone="success" icon="mdi-check" />
                          )}
                        </td>
                        <td>
                          <button
                            className={`btn btn-sm ${d.isDesignated ? 'btn-success' : 'btn-outline-secondary'}`}
                            onClick={() => toggleDesignated(d._id)}
                            disabled={togglingDesignated === d._id}
                            title={d.isDesignated ? 'Designated: owner dismiss will suppress future alarms. Click to remove.' : 'Mark as designated owner device'}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            <i className={`mdi ${d.isDesignated ? 'mdi-shield-check' : 'mdi-shield-outline'} me-1`} />
                            {togglingDesignated === d._id ? '...' : d.isDesignated ? 'Designated' : 'Set Designated'}
                          </button>
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
          <div className="col-12">
            <label className="form-label fw-semibold">Device Name</label>
            <input
              className="form-control"
              placeholder="e.g., My iPhone, Personal Laptop"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <small className="text-muted d-block mt-2">
              Device info (type, manufacturer, model) will be automatically detected from your device.
            </small>
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
