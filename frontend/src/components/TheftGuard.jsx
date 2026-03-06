/**
 * TheftGuard — Invisible background component
 *
 * Flow:
 *  Screen hides (lid close / tab switch) → record GPS as "sleep location"
 *  Screen wakes (lid open / tab visible) → get new GPS → send both to backend
 *  Backend detects location change → broadcasts WS "alarm"
 *  Browser receives "alarm" → plays siren via Web Audio API + shows overlay
 *
 * Designated devices:
 *  Only sessions that subscribed with isDesignated=true receive offline-device
 *  theft alarms from the server. The alarm overlay shows a 5-minute "not a theft"
 *  confirmation timer.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import api from '../services/api';

// Distance threshold: ~55 metres in degrees
const LOCATION_THRESHOLD = 0.0005;
// Ignore hides shorter than this (ms) — avoids false alarms on tab switches
const MIN_SLEEP_MS = 5000;
// Siren duration (ms)
const SIREN_DURATION_MS = 30000;
// Confirmation suppression window (ms) — "not a theft" lasts this long
const SUPPRESS_MS = 5 * 60 * 1000; // 5 minutes

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
  const deviceId = localStorage.getItem('enrolledDeviceId');
  const userId = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').id; } catch { return null; } })();

  const sleepRef = useRef(null);
  const sirenRef = useRef(null);
  const wsRef    = useRef(null);
  const [alarm, setAlarm] = useState(false);
  const [alarmDeviceName, setAlarmDeviceName] = useState('');
  const [isDesignated, setIsDesignated] = useState(false);
  // 5-minute countdown state
  const [suppressSecondsLeft, setSuppressSecondsLeft] = useState(0);
  const countdownRef = useRef(null);

  // Fetch designated status from backend on mount
  useEffect(() => {
    if (!deviceId) return;
    api.get('/devices').then(({ data }) => {
      if (Array.isArray(data)) {
        const mine = data.find(d => d._id === deviceId);
        if (mine) setIsDesignated(!!mine.isDesignated);
      }
    }).catch(() => {});
  }, [deviceId]);

  const startSiren = useCallback((deviceName = '') => {
    if (sirenRef.current) return;
    // Check local suppression (owner confirmed "not theft" within last 5 min)
    const suppressed = localStorage.getItem(`alarmSuppressed_${deviceId}`);
    if (suppressed && Number(suppressed) > Date.now()) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = buildSiren(ctx);
      const timer = setTimeout(() => stopSiren(), SIREN_DURATION_MS);
      sirenRef.current = { osc, ctx, timer };
      setAlarmDeviceName(deviceName);
      setAlarm(true);
    } catch (e) {
      console.error('[TheftGuard] Siren error:', e);
    }
  }, [deviceId]);

  const stopSiren = useCallback((ownerDismiss = false) => {
    if (!sirenRef.current) return;
    try {
      sirenRef.current.osc.stop();
      sirenRef.current.ctx.close();
      clearTimeout(sirenRef.current.timer);
    } catch {}
    sirenRef.current = null;
    setAlarm(false);
    clearInterval(countdownRef.current);
    setSuppressSecondsLeft(0);

    if (ownerDismiss && deviceId) {
      // Tell backend to suppress for 5 minutes
      api.post('/monitoring/dismiss-alarm', { deviceId }).catch(() => {});
      // Store local suppression so overlay won't re-appear this session
      localStorage.setItem(`alarmSuppressed_${deviceId}`, String(Date.now() + SUPPRESS_MS));
      // Start a visible 5-minute countdown so user knows when the guard re-activates
      let secs = Math.ceil(SUPPRESS_MS / 1000);
      setSuppressSecondsLeft(secs);
      countdownRef.current = setInterval(() => {
        secs -= 1;
        setSuppressSecondsLeft(secs);
        if (secs <= 0) clearInterval(countdownRef.current);
      }, 1000);
    }
  }, [deviceId]);

  // WebSocket — subscribe to this device; listen for alarm command
  useEffect(() => {
    if (!deviceId) return;
    let ws;
    let retryTimer;

    function connect() {
      ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          payload: { deviceId, userId, isDesignated }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'alarm') {
            // Designated devices respond to any owner alarm (other device went missing).
            // Non-designated devices only respond if the alarm is for their own deviceId.
            const isForMe = isDesignated || msg.payload?.deviceId === deviceId;
            if (isForMe) {
              startSiren(msg.payload?.deviceName || '');
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [deviceId, userId, isDesignated, startSiren]);

  // Page Visibility API — lid close / lid open
  useEffect(() => {
    if (!deviceId) return;

    const handleVisibility = async () => {
      if (document.hidden) {
        const loc = await getLocation();
        sleepRef.current = { lat: loc?.lat, lng: loc?.lng, time: Date.now() };

        const token = localStorage.getItem('token');
        const base  = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        fetch(`${base}/monitoring/sleep-ping`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ deviceId }),
        }).catch(() => {});
      } else {
        const sleep = sleepRef.current;
        if (!sleep) return;

        const sleptMs = Date.now() - sleep.time;
        if (sleptMs < MIN_SLEEP_MS) {
          sleepRef.current = null;
          return;
        }

        const wakeLoc = await getLocation();
        sleepRef.current = null;

        try {
          const { data } = await api.post('/monitoring/wake-ping', {
            deviceId,
            sleepLat: sleep.lat,
            sleepLng: sleep.lng,
            sleepTime: sleep.time,
            wakeLat: wakeLoc?.lat,
            wakeLng: wakeLoc?.lng,
          });

          if (data.alarm) startSiren();
        } catch (e) {
          console.warn('[TheftGuard] wake-ping failed:', e.message);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [deviceId, startSiren]);

  // Heartbeat ping every 1 minute while screen is on
  useEffect(() => {
    if (!deviceId) return;

    const sendHeartbeat = async () => {
      if (document.hidden) return;
      const loc = await getLocation();
      if (!loc) return;
      try {
        const { data } = await api.post('/monitoring/heartbeat', {
          deviceId, lat: loc.lat, lng: loc.lng,
        });
        if (data.alarm) startSiren();
      } catch (e) {
        console.debug('[TheftGuard] heartbeat skipped:', e.message);
      }
    };

    const timer = setInterval(sendHeartbeat, 60 * 1000);
    return () => clearInterval(timer);
  }, [deviceId, startSiren]);

  // Suppress countdown badge (shown after dismiss, below the main page)
  const suppressBadge = suppressSecondsLeft > 0 && !alarm ? (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      background: 'rgba(30,30,30,0.85)', color: '#fff',
      borderRadius: 12, padding: '8px 16px', fontSize: '0.8rem',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 8
    }}>
      <span>🛡️</span>
      <span>
        Guard re-activates in{' '}
        <strong>{Math.floor(suppressSecondsLeft / 60)}:{String(suppressSecondsLeft % 60).padStart(2, '0')}</strong>
      </span>
    </div>
  ) : null;

  if (!alarm) return suppressBadge;

  const mins = Math.ceil(SUPPRESS_MS / 60000);

  return (
    <>
      {suppressBadge}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(220,0,0,0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          animation: 'theftFlash 0.5s infinite alternate'
        }}
      >
        <style>{`
          @keyframes theftFlash {
            from { background: rgba(220,0,0,0.92); }
            to   { background: rgba(180,0,0,0.98); }
          }
        `}</style>

        <div style={{ fontSize: 80 }}>🚨</div>
        <h1 style={{ color: '#fff', fontWeight: 900, fontSize: '2.5rem', margin: '16px 0 8px', textAlign: 'center' }}>
          THEFT ALERT
        </h1>
        {alarmDeviceName ? (
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.2rem', fontWeight: 600, margin: '0 0 4px' }}>
            Device: {alarmDeviceName}
          </p>
        ) : null}
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1.1rem', textAlign: 'center', margin: '0 24px 32px' }}>
          A monitored device has gone offline or been moved.
          <br />An alert has been logged to your account.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => stopSiren(true)}
            style={{
              padding: '14px 36px', fontSize: '1rem', fontWeight: 700,
              borderRadius: 8, border: 'none', background: '#fff',
              color: '#dc2626', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
          >
            ✅ NOT A THEFT — Dismiss ({mins} min)
          </button>

          <button
            onClick={() => stopSiren(false)}
            style={{
              padding: '14px 36px', fontSize: '1rem', fontWeight: 700,
              borderRadius: 8, border: '2px solid rgba(255,255,255,0.6)',
              background: 'transparent', color: '#fff', cursor: 'pointer'
            }}
          >
            🔇 Silence Only
          </button>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginTop: 16, textAlign: 'center' }}>
          "NOT A THEFT" suppresses future alerts for {mins} minutes on this designated device.
          <br />After {mins} minutes, if the device is still offline the alarm will re-activate.
        </p>
      </div>
    </>
  );
}
