// Shared helpers for the Executive Control Center routes: the repo .env loaded into memory only, a
// 10-second upstream fetch, a per-platform 60-second cache, `gh` without a shell, and a JSON writer
// that scrubs every secret value before a byte leaves the process.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const TIMEOUT = 10000;

// Same parse as packages/asset-library/upload.mjs: KEY=VALUE lines, never overwriting what the
// environment already carries. The values stay in process.env and are never logged.
export function loadEnv(file = path.join(REPO, '.env')) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* no .env: every platform reports itself unconfigured */ }
}

export const now = () => new Date().toISOString();
export const ok = (body) => ({ ok: true, fetchedAt: now(), ...body });
export const fail = (reason, extra) => ({ ok: false, fetchedAt: now(), reason, ...extra });

// Values of every env var that names a credential. Short values are skipped so a stray "1" does not
// shred the whole body.
function secrets() {
  return Object.entries(process.env)
    .filter(([k, v]) => /TOKEN|KEY|SECRET|PASSWORD|AUTH/i.test(k) && typeof v === 'string' && v.length >= 8)
    .map(([, v]) => v);
}
export function redact(text) {
  let s = String(text);
  for (const v of secrets()) s = s.split(v).join('[redacted]');
  return s;
}

export function sendJson(res, status, obj) {
  const body = redact(JSON.stringify(obj));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff' });
  res.end(body);
}

export async function readJsonBody(req, limit = 64 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('body too large'); chunks.push(c); }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Plain-language Hebrew reason for an upstream failure. Never carries the upstream body — an error
// page can echo a header back.
export function reasonFor(label, status, what) {
  const x = what ? `${what} ב-${label}` : label;
  if (status === 401) return `הטוקן של ${label} לא תקף או שפג תוקפו`;
  if (status === 403) return `לטוקן של ${label} אין הרשאה ל${what ? `-${what}` : 'פעולה הזו'}`;
  if (status === 404) return `${x} לא נמצא`;
  if (status === 429) return `${label} מגביל כרגע את קצב הבקשות — נסו שוב בעוד דקה`;
  if (status === 'timeout') return `${label} לא ענה תוך 10 שניות`;
  if (status === 'network') return `אין חיבור ל-${label}`;
  return `${label} החזיר שגיאה (${status})`;
}

export class UpstreamError extends Error {
  constructor(status, reason) { super(reason); this.status = status; this.reason = reason; }
}

// One upstream call: 10-second timeout, JSON parsed, failure thrown as UpstreamError with a Hebrew
// reason. `label` names the platform, `what` names the thing asked for (for the permission message).
export async function fetchJson(url, { label, what, headers = {}, method = 'GET', body, raw = false } = {}) {
  let r;
  try {
    r = await fetch(url, { method, headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' });
  } catch (e) {
    throw new UpstreamError(e?.name === 'TimeoutError' ? 'timeout' : 'network', reasonFor(label, e?.name === 'TimeoutError' ? 'timeout' : 'network'));
  }
  if (raw) return r;
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) {
    const e = new UpstreamError(r.status, reasonFor(label, r.status, what));
    e.json = json; // for callers that read a structured error code — never forwarded to the browser
    throw e;
  }
  return json;
}

// Runs a promise-returning section and turns an UpstreamError into { error } so one failing section
// never breaks its neighbours.
export async function section(fn) {
  try { return { value: await fn() }; } catch (e) { return { error: e?.reason || 'שגיאה לא צפויה' }; }
}

// ---- cache: one entry per key, 60 s for a good answer, 10 s for a failure ---------------------------
const cache = new Map();
// Listeners told (key, value) each time a cached fn produced a fresh answer: the SSE stream turns it
// into a `platform:<id>` event.
export const onRefresh = new Set();
export function cached(key, fn, ttl = 60000) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.p;
  const p = Promise.resolve().then(fn).then((v) => {
    cache.set(key, { p, until: Date.now() + (v?.ok === false ? 10000 : ttl) });
    for (const f of onRefresh) { try { f(key, v); } catch { /* a listener never breaks a read */ } }
    return v;
  }, (e) => { cache.delete(key); throw e; });
  cache.set(key, { p, until: Date.now() + ttl });
  return p;
}
export const uncache = (prefix) => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); };

// ---- gh without a shell: the server never holds a GitHub token --------------------------------------
export function run(cmd, args, { timeout = TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 32 << 20, cwd: REPO, env: process.env }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = String(stderr || ''); return reject(err); }
      resolve(stdout);
    });
  });
}

export function ghReason(err, what) {
  const s = String(err?.stderr || err?.message || '');
  if (err?.code === 'ENOENT') return 'הכלי gh לא מותקן במחשב';
  if (err?.killed || err?.signal === 'SIGTERM') return 'GitHub לא ענה תוך 10 שניות';
  if (/auth login|not logged/i.test(s)) return 'gh לא מחובר לחשבון GitHub — הריצו gh auth login';
  const m = s.match(/HTTP (\d{3})/);
  const code = m ? Number(m[1]) : null;
  if (code === 422 && /own pull request/i.test(s)) return 'GitHub לא מאפשר לאשר PR שפתחתם בעצמכם';
  if (code === 422) return `GitHub דחה את הבקשה${what ? ` (${what})` : ''} — ייתכן שהפעולה לא מתאימה למצב הנוכחי`;
  if (code) return reasonFor('GitHub', code, what);
  return `הפקודה gh נכשלה${what ? ` (${what})` : ''}`;
}

// `gh api <path>` → parsed JSON. Fields go as -f/-F pairs, never through a shell.
export async function ghApi(apiPath, { method, fields, what } = {}) {
  const args = ['api', apiPath];
  if (method) args.push('-X', method);
  for (const [k, v] of Object.entries(fields || {})) args.push(typeof v === 'string' ? '-f' : '-F', `${k}=${v}`);
  try {
    const out = await run('gh', args);
    return out.trim() ? JSON.parse(out) : null;
  } catch (e) {
    throw new UpstreamError(e?.code || 'gh', ghReason(e, what));
  }
}

// ---- POST guard -------------------------------------------------------------------------------------
export const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');
const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]']);
const hostnameOf = (h) => { try { return new URL(`http://${h}`).hostname; } catch { return null; } };

// Host must be local on every /api/cc request (a rebound DNS name cannot read the session token).
export function localHost(req) { return LOCAL.has(hostnameOf(req.headers.host || '')); }

export function postAllowed(req) {
  if (!localHost(req)) return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let h; try { h = new URL(origin).hostname; } catch { return false; }
    if (!LOCAL.has(h)) return false;
  }
  const t = String(req.headers['x-cc-token'] || '');
  const a = Buffer.from(t), b = Buffer.from(SESSION_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
