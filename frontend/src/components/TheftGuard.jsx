/**
 * TheftGuard — Background theft detection component
 *
 * Rules:
 *  - ONLY designated devices show alarm overlays / play sirens
 *  - Non-designated devices receive nothing
 *  - "It's me — ignore" suppresses alarms for the MONITORED device for 5 minutes
 *  - After 5 minutes, if device still offline/anomalous, alarm re-fires
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import api from '../services/api';

const MIN_SLEEP_MS     = 5000;           // ignore hides shorter than this
const SIREN_DURATION_MS = 30000;         // auto-stop after 30 s
const SUPPRESS_MS      = 5 * 60 * 1000; // "it's me" suppresses for 5 minutes

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 0 }
    );
  });
}

function buildSiren(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0.7, ctx.currentTime);
  const t0 = ctx.currentTime;
  for (let i = 0; i < 40; i++) {
    osc.frequency.setValueAtTime(500, t0 + i * 0.8);
    osc.frequency.linearRampToValueAtTime(1100, t0 + i * 0.8 + 0.4);
    osc.frequency.linearRampToValueAtTime(500, t0 + i * 0.8 + 0.8);
  }
  osc.start(t0);
  return osc;
}

export default function TheftGuard() {
  // This device (the one this browser is running on)
  const myDeviceId = localStorage.getItem('enrolledDeviceId');
  const userId = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; } })();

  const sleepRef      = useRef(null);
  const sirenRef      = useRef(null);
  const wsRef         = useRef(null);
  // The device that TRIGGERED the alarm (not this device)
  const alarmingIdRef = useRef(null);

  const [alarm,           setAlarm]           = useState(false);
  const [alarmDeviceName, setAlarmDeviceName] = useState('');
  const [isDesignated,    setIsDesignated]    = useState(false);
  const [suppressLeft,    setSuppressLeft]    = useState(0);
  const countdownRef = useRef(null);

  // Anomaly notification state (separate from full-screen theft alarm)
  const [anomalyNote, setAnomalyNote] = useState(null);
  // { deviceId, deviceName, score, lat, lng, hourOfDay, dayOfWeek, alertId }
  const [learningNote, setLearningNote] = useState(''); // optional note from user

  // Fetch designated status when mount / when myDeviceId changes
  useEffect(() => {
    if (!myDeviceId) return;
    api.get('/devices').then(({ data }) => {
      if (!Array.isArray(data)) return;
      const mine = data.find(d => d._id === myDeviceId);
      setIsDesignated(!!mine?.isDesignated);
    }).catch(() => {});
  }, [myDeviceId]);

  // ── Siren controls ──────────────────────────────────────────────
  const startSiren = useCallback((triggerDeviceId, deviceName = '') => {
    if (!isDesignated) return;  // only designated devices alarm
    if (sirenRef.current) return; // already ringing

    // Check if this specific monitored device's alarm was suppressed ("it's me")
    const suppressed = localStorage.getItem(`alarmSuppressed_${triggerDeviceId}`);
    if (suppressed && Number(suppressed) > Date.now()) return;

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = buildSiren(ctx);
      const timer = setTimeout(() => stopSiren(false), SIREN_DURATION_MS);
      sirenRef.current = { osc, ctx, timer };
      alarmingIdRef.current = triggerDeviceId;
      setAlarmDeviceName(deviceName);
      setAlarm(true);
    } catch (e) {
      console.error('[TheftGuard] Siren error:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesignated]);

  const stopSiren = useCallback((itsMe = false) => {
    if (!sirenRef.current) return;
    try {
      sirenRef.current.osc.stop();
      sirenRef.current.ctx.close();
      clearTimeout(sirenRef.current.timer);
    } catch {}
    sirenRef.current = null;
    setAlarm(false);

    if (itsMe) {
      const targetId = alarmingIdRef.current;
      if (targetId) {
        // Tell backend: suppress alarms for this monitored device for 5 minutes
        api.post('/monitoring/dismiss-alarm', { deviceId: targetId }).catch(() => {});
        // Local suppression so the overlay won't re-appear within this tab's session either
        localStorage.setItem(`alarmSuppressed_${targetId}`, String(Date.now() + SUPPRESS_MS));
      }
      alarmingIdRef.current = null;

      // Show countdown badge so user knows when guard re-activates
      clearInterval(countdownRef.current);
      let secs = Math.ceil(SUPPRESS_MS / 1000);
      setSuppressLeft(secs);
      countdownRef.current = setInterval(() => {
        secs -= 1;
        setSuppressLeft(secs > 0 ? secs : 0);
        if (secs <= 0) clearInterval(countdownRef.current);
      }, 1000);
    }
  }, []);

  // ── WebSocket ───────────────────────────────────────────────────
  useEffect(() => {
    if (!myDeviceId) return;
    let ws;
    let retryTimer;

    function connect() {
      ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          payload: { deviceId: myDeviceId, userId, isDesignated }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (!isDesignated) return; // non-designated devices receive nothing

          if (msg.type === 'alarm') {
            startSiren(msg.payload?.deviceId, msg.payload?.deviceName || '');
          }

          if (msg.type === 'anomaly_alert') {
            const p = msg.payload || {};
            const ts = p.timestamp ? new Date(p.timestamp) : new Date();
            setAnomalyNote({
              deviceId:   p.deviceId,
              deviceName: p.deviceName || 'Unknown device',
              score:      p.anomalyScore || 0,
              lat:        p.location?.lat,
              lng:        p.location?.lng,
              hourOfDay:  ts.getHours(),
              dayOfWeek:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][ts.getDay()],
              alertId:    p.alert?._id,
            });
            setLearningNote('');
          }
        } catch {}
      };

      ws.onclose = () => { retryTimer = setTimeout(connect, 5000); };
    }

    connect();
    return () => { clearTimeout(retryTimer); ws?.close(); };
  }, [myDeviceId, userId, isDesignated, startSiren]);

  // ── Page Visibility (lid close/open) ────────────────────────────
  useEffect(() => {
    if (!myDeviceId) return;

    const handleVisibility = async () => {
      if (document.hidden) {
        const loc = await getLocation();
        sleepRef.current = { lat: loc?.lat, lng: loc?.lng, time: Date.now() };
        const token = localStorage.getItem('token');
        const base  = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        fetch(`${base}/monitoring/sleep-ping`, {
          method: 'POST', keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ deviceId: myDeviceId }),
        }).catch(() => {});
      } else {
        const sleep = sleepRef.current;
        if (!sleep) return;
        const sleptMs = Date.now() - sleep.time;
        if (sleptMs < MIN_SLEEP_MS) { sleepRef.current = null; return; }

        const wakeLoc = await getLocation();
        sleepRef.current = null;
        try {
          const { data } = await api.post('/monitoring/wake-ping', {
            deviceId: myDeviceId,
            sleepLat: sleep.lat, sleepLng: sleep.lng, sleepTime: sleep.time,
            wakeLat: wakeLoc?.lat, wakeLng: wakeLoc?.lng,
          });
          if (data.alarm) startSiren(myDeviceId, 'this device');
        } catch (e) {
          console.warn('[TheftGuard] wake-ping failed:', e.message);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [myDeviceId, startSiren]);

  // ── Pulse (every 5 s) — fast keep-alive, no GPS needed ─────────
  useEffect(() => {
    if (!myDeviceId) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      api.post('/monitoring/pulse', { deviceId: myDeviceId }).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [myDeviceId]);

  // ── Heartbeat (30 sec) — GPS movement check ─────────────────────
  useEffect(() => {
    if (!myDeviceId) return;
    const tick = async () => {
      if (document.hidden) return;
      const loc = await getLocation();
      if (!loc) return;
      try {
        const { data } = await api.post('/monitoring/heartbeat', {
          deviceId: myDeviceId, lat: loc.lat, lng: loc.lng,
        });
        if (data.alarm) startSiren(myDeviceId, 'this device');
      } catch (e) {
        console.debug('[TheftGuard] heartbeat skipped:', e.message);
      }
    };
    const t = setInterval(tick, 30 * 1000);
    return () => clearInterval(t);
  }, [myDeviceId, startSiren]);

  // ── Anomaly handlers ────────────────────────────────────────────
  const confirmNormal = useCallback(async () => {
    if (!anomalyNote) return;
    try {
      await api.post('/monitoring/confirm-normal', {
        deviceId:  anomalyNote.deviceId,
        alertId:   anomalyNote.alertId,
        lat:       anomalyNote.lat,
        lng:       anomalyNote.lng,
        hourOfDay: anomalyNote.hourOfDay,
        dayOfWeek: anomalyNote.dayOfWeek,
        note:      learningNote,
      });
    } catch (e) {
      console.warn('[TheftGuard] confirm-normal failed:', e.message);
    }
    setAnomalyNote(null);
    setLearningNote('');
  }, [anomalyNote, learningNote]);

  const dismissAnomaly = useCallback(() => {
    setAnomalyNote(null);
    setLearningNote('');
  }, []);

  // ── Countdown badge ─────────────────────────────────────────────
  const badge = suppressLeft > 0 && !alarm ? (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      background: 'rgba(30,30,30,0.85)', color: '#fff',
      borderRadius: 12, padding: '8px 16px', fontSize: '0.8rem',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span>🛡️</span>
      <span>
        Alarm guard restores in{' '}
        <strong>
          {Math.floor(suppressLeft / 60)}:{String(suppressLeft % 60).padStart(2, '0')}
        </strong>
      </span>
    </div>
  ) : null;

  // ── Anomaly notification panel (amber, non-full-screen) ─────────
  const anomalyPanel = anomalyNote && isDesignated ? (
    <div style={{
      position: 'fixed', bottom: 80, right: 16, zIndex: 99998,
      width: 'min(340px, calc(100vw - 32px))', borderRadius: 14,
      background: 'linear-gradient(135deg,#78350f,#92400e)',
      color: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,.45)',
      padding: '16px 18px', fontSize: '0.87rem',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Anomaly Detected</div>
          <div style={{ opacity: 0.85 }}>{anomalyNote.deviceName}</div>
        </div>
        <div style={{
          marginLeft: 'auto', background: 'rgba(255,255,255,.15)',
          borderRadius: 8, padding: '2px 10px', fontWeight: 700, fontSize: '0.9rem'
        }}>
          {(anomalyNote.score * 100).toFixed(0)}%
        </div>
      </div>

      <div style={{ opacity: 0.75, marginBottom: 10, fontSize: '0.8rem' }}>
        Unusual location or time detected at {anomalyNote.hourOfDay}:00 · {anomalyNote.dayOfWeek}
        {anomalyNote.lat ? ` · (${anomalyNote.lat.toFixed(4)}, ${anomalyNote.lng.toFixed(4)})` : ''}
      </div>

      <input
        type="text"
        placeholder="Optional note: e.g. 'library visit'"
        value={learningNote}
        onChange={e => setLearningNote(e.target.value)}
        style={{
          width: '100%', borderRadius: 7, border: 'none', padding: '6px 10px',
          marginBottom: 10, fontSize: '0.82rem', background: 'rgba(255,255,255,.15)',
          color: '#fff', outline: 'none',
        }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={confirmNormal}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 7, border: 'none',
            background: '#fff', color: '#92400e', fontWeight: 700,
            fontSize: '0.8rem', cursor: 'pointer'
          }}
        >
          ✅ It's Normal — Learn It
        </button>
        <button
          onClick={dismissAnomaly}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 7,
            border: '1.5px solid rgba(255,255,255,.5)',
            background: 'transparent', color: '#fff', fontWeight: 600,
            fontSize: '0.8rem', cursor: 'pointer'
          }}
        >
          🚨 Keep Alert
        </button>
      </div>
    </div>
  ) : null;

  // Non-designated — render nothing
  if (!isDesignated) return badge;
  if (!alarm) return <>{badge}{anomalyPanel}</>;

  const suppressMins = Math.ceil(SUPPRESS_MS / 60000);

  return (
    <>
      {badge}
      {anomalyPanel}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(220,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        animation: 'theftFlash 0.5s infinite alternate',
      }}>
        <style>{`
          @keyframes theftFlash {
            from { background: rgba(220,0,0,0.92); }
            to   { background: rgba(180,0,0,0.98); }
          }
        `}</style>

        <div style={{ fontSize: 'clamp(48px, 12vw, 80px)' }}>🚨</div>
        <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(1.6rem, 5vw, 2.5rem)', margin: '16px 0 4px', textAlign: 'center' }}>
          THEFT ALERT
        </h1>
        {alarmDeviceName ? (
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 'clamp(0.9rem, 3vw, 1.15rem)', fontWeight: 700, margin: '0 0 8px' }}>
            Device: {alarmDeviceName}
          </p>
        ) : null}
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 'clamp(0.8rem, 2.5vw, 1rem)', textAlign: 'center', margin: '0 16px 24px' }}>
          A monitored device has gone offline or been moved unexpectedly.
          <br />An alert has been logged to your account.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', padding: '0 16px' }}>
          {/* Primary: owner confirms it's them */}
          <button
            onClick={() => stopSiren(true)}
            style={{
              padding: '12px 24px', fontSize: 'clamp(0.85rem, 2.5vw, 1rem)', fontWeight: 700,
              borderRadius: 8, border: 'none', background: '#fff',
              color: '#16a34a', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              flexShrink: 0,
            }}
          >
            ✅ It's Me — Ignore ({suppressMins} min)
          </button>

          {/* Secondary: silence siren only, alarm may re-fire */}
          <button
            onClick={() => stopSiren(false)}
            style={{
              padding: '12px 24px', fontSize: 'clamp(0.85rem, 2.5vw, 1rem)', fontWeight: 700,
              borderRadius: 8, border: '2px solid rgba(255,255,255,0.6)',
              background: 'transparent', color: '#fff', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            🔇 Silence Only
          </button>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 16, textAlign: 'center', padding: '0 16px' }}>
          "It's Me" pauses the alarm for {suppressMins} minutes. If the device stays offline after {suppressMins} minutes, the alarm will fire again.
        </p>
      </div>
    </>
  );
}
