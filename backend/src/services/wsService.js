const WebSocket = require('ws');

/**
 * wsService
 * - Provides a small WebSocket hub for:
 *   1) Ingesting pings via WS (fallback: HTTP)
 *   2) Broadcasting saved pings + alerts to dashboard clients
 *
 * Message format (JSON):
 *  Client -> Server:
 *   { type: 'ping', payload: { macAddress|deviceId, lat, lng, accuracy, speed?, ts? } }
 *   { type: 'subscribe', payload: { macAddress?: string, deviceId?: string } }
 *
 *  Server -> Client:
 *   { type: 'hello', payload: { ok: true } }
 *   { type: 'ack', payload: { ok: true, requestId?: string } }
 *   { type: 'ping_saved', payload: { ping, deviceStatus, zoneName } }
 *   { type: 'alert', payload: { alert } }
 */

let wss = null;
const clientMeta = new WeakMap();

function safeSend(ws, obj) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function init(httpServer, { path = '/ws' } = {}) {
  wss = new WebSocket.Server({ server: httpServer, path });

  wss.on('connection', (ws) => {
    clientMeta.set(ws, { subscribedTo: null });
    safeSend(ws, { type: 'hello', payload: { ok: true } });

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return safeSend(ws, { type: 'error', payload: { error: 'Invalid JSON' } });
      }

      if (!msg || typeof msg !== 'object') return;
      const { type, payload, requestId } = msg;

      if (type === 'subscribe') {
        const meta = clientMeta.get(ws) || {};
        meta.subscribedTo = payload?.macAddress || payload?.deviceId || null;
        clientMeta.set(ws, meta);
        return safeSend(ws, { type: 'ack', payload: { ok: true, subscribedTo: meta.subscribedTo }, requestId });
      }

      // Ingest is handled elsewhere (locationRoutes) via HTTP.
      // For WS ingest, the server.js will attach a handler through onPing callback.
      if (type === 'ping' && typeof exports._onPing === 'function') {
        try {
          const result = await exports._onPing(payload);
          safeSend(ws, { type: 'ack', payload: { ok: true, result }, requestId });
        } catch (e) {
          safeSend(ws, { type: 'ack', payload: { ok: false, error: e?.message || 'Ping failed' }, requestId });
        }
      }
    });
  });

  return wss;
}

function broadcast(type, payload, { match } = {}) {
  if (!wss) return;
  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (typeof match === 'function') {
      const meta = clientMeta.get(ws) || {};
      if (!match(meta)) continue;
    }
    safeSend(ws, { type, payload });
  }
}

/**
 * Convenience: broadcast a ping to dashboard subscribers.
 */
function broadcastPingSaved({ ping, deviceStatus, zoneName, deviceKey }) {
  broadcast(
    'ping_saved',
    { ping, deviceStatus, zoneName },
    {
      match: (meta) => {
        if (!meta?.subscribedTo) return true; // broadcast to all if no filters
        return (
          meta.subscribedTo === ping?.deviceId?.toString?.() ||
          meta.subscribedTo === deviceKey
        );
      }
    }
  );
}

/**
 * Attach a WS-ingest handler.
 * The callback should accept the payload and return the same shape as HTTP /api/location/ping.
 */
function setOnPing(handler) {
  exports._onPing = handler;
}

module.exports = {
  init,
  broadcast,
  broadcastPingSaved,
  setOnPing
};
