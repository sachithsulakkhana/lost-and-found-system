import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';

function Badge({ text, tone = 'secondary', icon }) {
  const cls = useMemo(() => {
    if (tone === 'success') return 'bg-success-subtle text-success border border-success-subtle';
    if (tone === 'warning') return 'bg-warning-subtle text-warning border border-warning-subtle';
    if (tone === 'danger') return 'bg-danger-subtle text-danger border border-danger-subtle';
    if (tone === 'info') return 'bg-info-subtle text-info border border-info-subtle';
    return 'bg-light text-muted border';
  }, [tone]);
  return (
    <span className={`badge rounded-pill ${cls} px-3 py-2 fw-semibold`}>
      {icon ? <i className={`mdi ${icon} me-1`} /> : null}
      {text}
    </span>
  );
}

function deviceIcon(d) {
  const t = (d.deviceType || d.manufacturer || '').toLowerCase();
  if (t.includes('iphone') || t.includes('apple') || (d.name || '').toLowerCase().includes('iphone')) return 'mdi-cellphone';
  if (t.includes('android')) return 'mdi-android';
  if (t.includes('windows')) return 'mdi-microsoft-windows';
  if (t.includes('mac')) return 'mdi-apple';
  if (t.includes('linux')) return 'mdi-linux';
  if (t.includes('mobile') || t.includes('phone')) return 'mdi-cellphone';
  return 'mdi-laptop';
}

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingDesignated, setTogglingDesignated] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // The fingerprint of THIS browser — used to highlight "This Device"
  const currentFingerprint = localStorage.getItem('deviceId') || '';
  const enrolledDeviceId   = localStorage.getItem('enrolledDeviceId') || '';

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

  useEffect(() => { fetchDevices(); }, []);

  const toggleDesignated = async (deviceId) => {
    setTogglingDesignated(deviceId);
    try {
      const { data } = await api.put(`/devices/${deviceId}/designated`);
      setDevices(prev => prev.map(d =>
        d._id === deviceId ? { ...d, isDesignated: data.isDesignated } : d
      ));
      toast.success(data.isDesignated
        ? 'Designated — theft alarms will ring on this device'
        : 'Designation removed');
    } catch {
      toast.error('Failed to update device');
    } finally {
      setTogglingDesignated(null);
    }
  };

  const deleteDevice = async (deviceId, name) => {
    if (!window.confirm(`Remove "${name}" from your device list?`)) return;
    setDeleting(deviceId);
    try {
      await api.delete(`/devices/${deviceId}`);
      setDevices(prev => prev.filter(d => d._id !== deviceId));
      toast.success('Device removed');
    } catch {
      toast.error('Failed to remove device');
    } finally {
      setDeleting(null);
    }
  };

  // Split into "this device", monitored targets, and unknown/auto sessions
  const thisDevice   = devices.find(d =>
    d.deviceFingerprint === currentFingerprint || d._id === enrolledDeviceId
  );
  const otherDevices = devices.filter(d => d._id !== thisDevice?._id);

  const renderRow = (d, isThis = false) => {
    const icon = deviceIcon(d);
    const isLearning = d.status === 'LEARNING';

    return (
      <tr key={d._id} style={isThis ? { background: '#f0f7ff' } : {}}>
        <td>
          <div className="d-flex align-items-center gap-2">
            <span className="cp-stat icon" style={{ width: 38, height: 38, borderRadius: 12, background: isThis ? '#dbeafe' : undefined }}>
              <i className={`mdi ${icon}`} style={{ color: isThis ? '#2563eb' : undefined }} />
            </span>
            <div>
              <div className="fw-semibold d-flex align-items-center gap-2">
                {d.name}
                {isThis && (
                  <span className="badge bg-primary rounded-pill px-2 py-1" style={{ fontSize: '0.7rem' }}>
                    This Device
                  </span>
                )}
                {d.isDesignated && (
                  <span className="badge bg-success rounded-pill px-2 py-1" style={{ fontSize: '0.7rem' }}>
                    <i className="mdi mdi-shield-check me-1" />Designated
                  </span>
                )}
              </div>
              <div className="text-muted small" style={{ fontFamily: 'monospace' }}>
                {d.deviceFingerprint || '—'}
              </div>
            </div>
          </div>
        </td>
        <td>
          <div>{d.manufacturer || '—'}</div>
          <div className="text-muted small">{d.model || d.deviceType || '—'}</div>
        </td>
        <td>
          {isLearning
            ? <Badge text="Learning" tone="warning" icon="mdi-brain" />
            : <Badge text="Active" tone="success" icon="mdi-check" />
          }
        </td>
        <td>
          <button
            className={`btn btn-sm ${d.isDesignated ? 'btn-success' : 'btn-outline-secondary'}`}
            onClick={() => toggleDesignated(d._id)}
            disabled={togglingDesignated === d._id}
            title={d.isDesignated
              ? 'Designated: theft alarms ring here. Click to remove.'
              : 'Mark as designated — theft alarms will ring on this device'}
            style={{ whiteSpace: 'nowrap' }}
          >
            <i className={`mdi ${d.isDesignated ? 'mdi-shield-check' : 'mdi-shield-outline'} me-1`} />
            {togglingDesignated === d._id ? '…' : d.isDesignated ? 'Designated' : 'Set Designated'}
          </button>
        </td>
        <td className="text-end">
          <div className="d-flex align-items-center justify-content-end gap-2">
            <Badge
              text={d.status || 'UNKNOWN'}
              tone={d.status === 'ACTIVE' ? 'success' : d.status === 'LEARNING' ? 'warning' : 'secondary'}
              icon={d.status === 'ACTIVE' ? 'mdi-check-decagram' : d.status === 'LEARNING' ? 'mdi-timer-sand' : 'mdi-help-circle-outline'}
            />
            {!isThis && (
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={() => deleteDevice(d._id, d.name)}
                disabled={deleting === d._id}
                title="Remove this device"
              >
                <i className="mdi mdi-delete-outline" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
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
            Devices auto-detect from your browser. Mark your phone/laptop as <strong>Designated</strong> to receive theft alarms.
          </div>
        </div>
      </div>

      <div className="alert alert-info mb-4 d-flex gap-2">
        <i className="mdi mdi-shield-alert-outline fs-5 mt-1" />
        <div>
          <strong>How theft alerts work:</strong> Mark your primary phone or laptop as <strong>Designated</strong>.
          When any of your monitored devices goes offline unexpectedly, only your designated device will receive the alarm.
          <br />
          <span className="text-primary fw-semibold">Look for "This Device" below — that is the current browser/device you're on.</span>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr className="text-muted small" style={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>
                  <th>Device</th>
                  <th>Make / Model</th>
                  <th>ML Status</th>
                  <th>Alarm Designation</th>
                  <th className="text-end">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-4">
                      <div className="d-flex align-items-center gap-2 text-muted">
                        <span className="spinner-border spinner-border-sm" role="status" /> Loading…
                      </div>
                    </td>
                  </tr>
                ) : devices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-5 text-center text-muted">
                      <i className="mdi mdi-devices-off fs-2 d-block mb-2 opacity-50" />
                      No devices detected yet.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* This Device — always first */}
                    {thisDevice && renderRow(thisDevice, true)}

                    {/* Separator if there are other devices */}
                    {thisDevice && otherDevices.length > 0 && (
                      <tr>
                        <td colSpan={5} className="py-1 px-3 text-muted small" style={{ background: '#f8f9fa', fontStyle: 'italic' }}>
                          Other registered devices
                        </td>
                      </tr>
                    )}

                    {otherDevices.map(d => renderRow(d, false))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {devices.length > 0 && (
        <div className="mt-3 text-muted small">
          <i className="mdi mdi-information-outline me-1" />
          Auto-enrolled "Learning" devices from old browser sessions can be removed using <i className="mdi mdi-delete-outline" />. They will not affect monitoring.
        </div>
      )}
    </div>
  );
}
