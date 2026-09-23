// GET /api/cc/stream — Server-Sent Events for the control center. One shared 10-second loop runs while
// at least one browser listens: it sends `pulse` (the pulse payload plus the derived insights) and,
// whenever a platform's cached read produces a fresh answer, `platform:<api name>` with {id, at}.
// Every frame goes through redact(), same as sendJson. The caller (router.mjs) has already checked
// that the Host is local.
import { redact, onRefresh } from './http.mjs';

export const PULSE_MS = 10_000;
const clients = new Set();
let timer = null;
let busy = false;
let source = null; // async () => payload for the `pulse` event

/** Formats one SSE frame. The data is JSON on a single line, so it can never inject a field. */
export function frame(event, data) {
  return `event: ${String(event).replace(/[^\w:.-]/g, '')}\ndata: ${redact(JSON.stringify(data))}\n\n`;
}
const send = (res, event, data) => { try { res.write(frame(event, data)); } catch { /* socket gone; close handler drops it */ } };
const broadcast = (event, data) => { for (const res of clients) send(res, event, data); };

// cache key → the api name the front end fetches: 'conn:posthog' → 'connectors'
const apiOf = (key) => (String(key).startsWith('conn:') ? 'connectors' : String(key));
onRefresh.add((key) => { if (clients.size) broadcast(`platform:${apiOf(key)}`, { id: apiOf(key), at: new Date().toISOString() }); });

async function tick() {
  if (busy || !source) return; busy = true;
  try { broadcast('pulse', await source()); } catch { broadcast('pulse', { ok: false, reason: 'הדופק לא חושב הפעם', at: new Date().toISOString() }); } finally { busy = false; }
}

export function stream(req, res, pulseSource) {
  source = pulseSource;
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive',
    'x-content-type-options': 'nosniff', 'x-accel-buffering': 'no' });
  res.write(`retry: 5000\n\n`);
  send(res, 'hello', { ok: true, everyMs: PULSE_MS, at: new Date().toISOString() });
  clients.add(res);
  req.on('close', () => { clients.delete(res); if (!clients.size) { clearInterval(timer); timer = null; } });
  if (!timer) { timer = setInterval(tick, PULSE_MS); timer.unref?.(); }
  // First pulse right away for this client only, so a fresh tab does not wait 10 s.
  Promise.resolve().then(pulseSource).then((v) => send(res, 'pulse', v), () => {});
}
export const listeners = () => clients.size;
