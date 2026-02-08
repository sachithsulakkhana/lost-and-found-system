import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';

/**
 * QuickLocationLogger
 * - Uses browser geolocation to send pings to backend for fast archiving.
 * - Transport: HTTP (POST /api/location/ping)
 *
 * Requirement: app must be served over HTTPS or localhost for geolocation.
 */
export default function QuickLocationLogger({ deviceId }) {
  const [running, setRunning] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);
  const [transport, setTransport] = useState('HTTP');
  const [wsState, setWsState] = useState('DISCONNECTED');
  const watchIdRef = useRef(null);
  const lastPostRef = useRef(0);
  const wsRef = useRef(null);

  const ingestKey = import.meta.env.VITE_DEVICE_INGEST_KEY;

  const getWsUrl = () => {
    const base = api.defaults.baseURL || '/api';
    // Handle relative URLs (e.g., "/api") by using current page origin
    const u = new URL(base, window.location.origin);
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${u.host}/ws`;
  };

  const ensureWs = () => {
    if (wsRef.current && (wsRef.current.readyState === 0 || wsRef.current.readyState === 1)) {
      return;
    }
    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;
      setWsState('CONNECTING');

      ws.onopen = () => setWsState('CONNECTED');
      ws.onclose = () => setWsState('DISCONNECTED');
      ws.onerror = () => setWsState('DISCONNECTED');

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data));
          if (msg?.type === 'ping_saved') {
            setLastResponse({ ping: msg.payload?.ping, deviceStatus: msg.payload?.deviceStatus, zoneName: msg.payload?.zoneName });
            setLastError(null);
          } else if (msg?.type === 'ack' && msg.payload?.ok === false) {
            setLastError(msg.payload?.error || 'Ping failed (WS)');
          } else if (msg?.type === 'ack' && msg.payload?.ok === true && msg.payload?.result) {
            setLastResponse(msg.payload.result);
            setLastError(null);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      setWsState('DISCONNECTED');
    }
  };

  const postPing = async (pos) => {
    const now = Date.now();
    // throttle: at most once per 5 seconds
    if (now - lastPostRef.current < 5000) return;
    lastPostRef.current = now;

    const { latitude, longitude, accuracy, speed } = pos.coords;
    // 1) Try WebSocket first (fallback to HTTP)
    try {
      if (wsState !== 'CONNECTED') ensureWs();
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) {
        const requestId = `req_${now}`;
        ws.send(
          JSON.stringify({
            type: 'ping',
            requestId,
            payload: {
              deviceId,
              lat: latitude,
              lng: longitude,
              accuracy: typeof accuracy === 'number' ? Math.round(accuracy) : undefined,
              speed: typeof speed === 'number' ? speed : undefined,
              ts: now,
              ingestKey
            }
          })
        );
        setTransport('WS');
        setLastSentAt(now);
        setLastError(null);
        return;
      }
    } catch {
      // ignore and fallback
    }

    // 2) HTTP fallback
    try {
      const { data } = await api.post(
        '/location/ping',
        {
          deviceId,
          lat: latitude,
          lng: longitude,
          accuracy: typeof accuracy === 'number' ? Math.round(accuracy) : undefined,
          speed: typeof speed === 'number' ? speed : undefined,
          ts: now,
          source: 'http'
        },
        ingestKey ? { headers: { 'x-device-key': ingestKey } } : undefined
      );
      setTransport('HTTP');
      setLastSentAt(now);
      setLastResponse(data);
      setLastError(null);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Failed to send ping';
      setLastError(msg);
      setTransport('HTTP');
    }
  };

  const start = async () => {
    if (!deviceId) {
      toast.error('Select a device first');
      return;
    }
    if (!('geolocation' in navigator)) {
      toast.error('Geolocation not supported in this browser');
      return;
    }
    setLastError(null);
    ensureWs();

    // Request permission + begin streaming
    try {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          postPing(pos);
        },
        (err) => {
          setLastError(err?.message || 'Geolocation error');
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000
        }
      );
      watchIdRef.current = id;
      setRunning(true);
      toast.success('Location logging started');
    } catch (err) {
      setLastError(err?.message || 'Failed to start geolocation');
    }
  };

  const stop = () => {
    const id = watchIdRef.current;
    if (id != null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(id);
    }
    watchIdRef.current = null;
    setRunning(false);
    toast.info('Location logging stopped');
  };

  useEffect(() => {
    // Auto-stop if device changes
    if (running) {
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      if (watchIdRef.current != null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div>
            <h5 className="card-title mb-0">Quick Location Logger</h5>
            <div className="text-muted small">
              Sends via WebSocket when available, otherwise falls back to HTTP.
            </div>
          </div>
          <div className="d-flex gap-2">
            {running ? (
              <button className="btn btn-outline-danger" onClick={stop}>
                <i className="mdi mdi-stop-circle-outline me-1" /> Stop
              </button>
            ) : (
              <button className="btn btn-cp" onClick={start}>
                <i className="mdi mdi-play-circle-outline me-1" /> Start
              </button>
            )}
          </div>
        </div>

        <div className="row g-3 mt-1">
          <div className="col-md-4">
            <div className="p-3 bg-light border rounded-3">
              <div className="text-muted small">Status</div>
              <div className="fw-semibold">{running ? 'RUNNING' : 'STOPPED'}</div>
              <div className="text-muted small mt-1">Transport: {transport} • WS: {wsState}</div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="p-3 bg-light border rounded-3">
              <div className="text-muted small">Last Sent</div>
              <div className="fw-semibold">{lastSentAt ? new Date(lastSentAt).toLocaleString() : '—'}</div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="p-3 bg-light border rounded-3">
              <div className="text-muted small">Last Result</div>
              <div className="fw-semibold">
                {lastResponse?.ping?.valid === false
                  ? `Rejected (${lastResponse?.ping?.rejectReason || 'unknown'})`
                  : lastResponse?.zoneName
                    ? `Zone: ${lastResponse.zoneName}`
                    : '—'}
              </div>
            </div>
          </div>
        </div>

        {lastError ? (
          <div className="alert alert-warning mt-3 mb-0">
            <i className="mdi mdi-alert-outline me-1" /> {lastError}
          </div>
        ) : null}

        {typeof window !== 'undefined' && window.location.protocol === 'http:' && !window.location.hostname.match(/^(localhost|127\.0\.0\.1)$/) && (
          <div className="alert alert-danger mt-3 mb-0">
            <i className="mdi mdi-shield-alert-outline me-1" />
            <strong>HTTPS required!</strong> Geolocation will not work over HTTP on phones/non-localhost.
            Use <code>localhost</code> or enable HTTPS.
          </div>
        )}

        <div className="mt-3 text-muted small">
          Pings are throttled to <span className="fw-semibold">1 per 5s</span>.
        </div>
      </div>
    </div>
  );
}
