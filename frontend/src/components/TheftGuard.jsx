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
  const [suppressLeft,    setSuppressLeft]    = useState(0); // seconds remaining countdown
  const countdownRef = useRef(null);

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
          // Only designated devices respond to alarms
          if (msg.type === 'alarm' && isDesignated) {
            startSiren(msg.payload?.deviceId, msg.payload?.deviceName || '');
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

  // ── Heartbeat (1 min) ───────────────────────────────────────────
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
    const t = setInterval(tick, 60 * 1000);
    return () => clearInterval(t);
  }, [myDeviceId, startSiren]);

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

  // Non-designated — render nothing
  if (!isDesignated) return badge;
  if (!alarm) return badge;

  const suppressMins = Math.ceil(SUPPRESS_MS / 60000);

  return (
    <>
      {badge}
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

        <div style={{ fontSize: 80 }}>🚨</div>
        <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '2.5rem', margin: '16px 0 4px', textAlign: 'center' }}>
          THEFT ALERT
        </h1>
        {alarmDeviceName ? (
          <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px' }}>
            Device: {alarmDeviceName}
          </p>
        ) : null}
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', textAlign: 'center', margin: '0 24px 32px' }}>
          A monitored device has gone offline or been moved unexpectedly.
          <br />An alert has been logged to your account.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Primary: owner confirms it's them */}
          <button
            onClick={() => stopSiren(true)}
            style={{
              padding: '14px 36px', fontSize: '1rem', fontWeight: 700,
              borderRadius: 8, border: 'none', background: '#fff',
              color: '#16a34a', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            ✅ It's Me — Ignore ({suppressMins} min)
          </button>

          {/* Secondary: silence siren only, alarm may re-fire */}
          <button
            onClick={() => stopSiren(false)}
            style={{
              padding: '14px 36px', fontSize: '1rem', fontWeight: 700,
              borderRadius: 8, border: '2px solid rgba(255,255,255,0.6)',
              background: 'transparent', color: '#fff', cursor: 'pointer',
            }}
          >
            🔇 Silence Only
          </button>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 16, textAlign: 'center' }}>
          "It's Me" pauses the alarm for {suppressMins} minutes. If the device stays offline after {suppressMins} minutes, the alarm will fire again.
        </p>
      </div>
    </>
  );
}
