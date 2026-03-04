/**
 * TheftGuard — Invisible background component
 *
 * Flow:
 *  Screen hides (lid close / tab switch) → record GPS as "sleep location"
 *  Screen wakes (lid open / tab visible) → get new GPS → send both to backend
 *  Backend detects location change → broadcasts WS "alarm"
 *  Browser receives "alarm" → plays siren via Web Audio API + shows overlay
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import api from '../services/api';

// Distance threshold: ~55 metres in degrees
const LOCATION_THRESHOLD = 0.0005;
// Ignore hides shorter than this (ms) — avoids false alarms on tab switches
const MIN_SLEEP_MS = 5000;
// Siren duration (ms)
const SIREN_DURATION_MS = 30000;

function getWsUrl() {
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

  // Wail: 500 Hz → 1100 Hz → 500 Hz, repeat
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
  const sleepRef = useRef(null);    // { lat, lng, time }
  const sirenRef = useRef(null);    // { osc, ctx, timer }
  const wsRef    = useRef(null);
  const [alarm, setAlarm] = useState(false);

  const startSiren = useCallback(() => {
    if (sirenRef.current) return; // already sounding
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = buildSiren(ctx);
      const timer = setTimeout(() => stopSiren(), SIREN_DURATION_MS);
      sirenRef.current = { osc, ctx, timer };
      setAlarm(true);
    } catch (e) {
      console.error('[TheftGuard] Siren error:', e);
    }
  }, []);

  const stopSiren = useCallback(() => {
    if (!sirenRef.current) return;
    try {
      sirenRef.current.osc.stop();
      sirenRef.current.ctx.close();
      clearTimeout(sirenRef.current.timer);
    } catch {}
    sirenRef.current = null;
    setAlarm(false);
  }, []);

  // WebSocket — subscribe to this device; listen for alarm command
  useEffect(() => {
    if (!deviceId) return;
    let ws;
    let retryTimer;

    function connect() {
      ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', payload: { deviceId, userId } }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'alarm' && msg.payload?.deviceId === deviceId) {
            startSiren();
          }
        } catch {}
      };

      ws.onclose = () => {
        // Reconnect after 5 s so the guard stays alive
        retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [deviceId, startSiren]);

  // Page Visibility API — lid close / lid open
  useEffect(() => {
    if (!deviceId) return;

    const handleVisibility = async () => {
      if (document.hidden) {
        // --- Lid closing ---
        const loc = await getLocation();
        sleepRef.current = { lat: loc?.lat, lng: loc?.lng, time: Date.now() };

        // Notify owner's other devices (phone) that this device went to sleep
        try {
          await api.post('/monitoring/sleep-ping', { deviceId });
        } catch (e) {
          console.debug('[TheftGuard] sleep-ping skipped:', e.message);
        }

      } else {
        // --- Lid opening ---
        const sleep = sleepRef.current;
        if (!sleep) return;

        const sleptMs = Date.now() - sleep.time;
        if (sleptMs < MIN_SLEEP_MS) {
          // Very brief hide — not suspicious (e.g. notification shade)
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

          if (data.alarm) {
            startSiren();
          }
        } catch (e) {
          console.warn('[TheftGuard] wake-ping failed:', e.message);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [deviceId, startSiren]);

  // Heartbeat ping every 1 minute while the screen is on (lid-open theft coverage)
  useEffect(() => {
    if (!deviceId) return;

    const HEARTBEAT_INTERVAL = 60 * 1000; // 1 minute

    const sendHeartbeat = async () => {
      if (document.hidden) return; // skip if screen is off — wake-ping covers that
      const loc = await getLocation();
      if (!loc) return;
      try {
        const { data } = await api.post('/monitoring/heartbeat', {
          deviceId,
          lat: loc.lat,
          lng: loc.lng,
        });
        if (data.alarm) startSiren();
      } catch (e) {
        console.debug('[TheftGuard] heartbeat skipped:', e.message);
      }
    };

    const timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    return () => clearInterval(timer);
  }, [deviceId, startSiren]);

  // Alarm overlay
  if (!alarm) return null;

  return (
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
      <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1.1rem', textAlign: 'center', margin: '0 24px 32px' }}>
        Device moved while sleeping. Location change detected.
        <br />An alert has been sent to your account.
      </p>
      <button
        onClick={stopSiren}
        style={{
          padding: '14px 48px', fontSize: '1rem', fontWeight: 700,
          borderRadius: 8, border: 'none', background: '#fff',
          color: '#dc2626', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}
      >
        I AM THE OWNER — STOP ALARM
      </button>
    </div>
  );
}
