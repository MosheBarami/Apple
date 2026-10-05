// The worker's admin API, as the harness uses it. Every call carries the admin key in X-Admin-Key, has a
// timeout, and fails with a message that names the path and the status but never the key or the response body
// beyond a short, redacted excerpt.
import { redact } from './env.mjs';

export class ApiError extends Error {
  constructor(message, { status, path } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

export function makeAdminApi({ apiBase, adminKey, fetchImpl = fetch, timeoutMs = 30_000 }) {
  if (!apiBase) throw new ApiError('no API base');
  const base = apiBase.replace(/\/+$/, '');
  async function call(method, path, body, { admin = true, allow = [] } = {}) {
    if (admin && !adminKey) throw new ApiError('no admin key: set STUDPILOT_ADMIN_KEY or point --env-file at the .env that holds it', { path });
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: { ...(admin ? { 'X-Admin-Key': adminKey } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new ApiError(redact(`${method} ${path}: ${e.name === 'TimeoutError' ? `no answer in ${timeoutMs} ms` : e.message}`, [adminKey]), { path });
    }
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = undefined;
    }
    if (!res.ok && !allow.includes(res.status)) {
      const why = redact(typeof json?.error === 'string' ? json.error : text.slice(0, 160), [adminKey]);
      throw new ApiError(`${method} ${path}: HTTP ${res.status} ${why}`.trim(), { status: res.status, path });
    }
    return { status: res.status, json };
  }
  return {
    base,
    call,
    health: () => call('GET', '/api/health', undefined, { admin: false }).then((r) => r.json),
    spend: () => call('GET', '/api/admin/spend').then((r) => r.json),
    sessionInfo: (projectId) => call('GET', `/api/admin/session-info/${projectId}`).then((r) => r.json),
    messages: (projectId, limit = 100) => call('GET', `/api/admin/session-messages/${projectId}?limit=${limit}`).then((r) => r.json),
    account: (userId, days = 1) => call('GET', `/api/admin/account/${userId}?days=${days}`).then((r) => r.json),
    setPlan: (userId, plan) => call('POST', '/api/admin/set-plan', { userId, plan }).then((r) => r.json),
    grantCredits: (userId, credits, eventId) => call('POST', '/api/admin/grant-credits', { userId, credits, eventId }, { allow: [409] }),
    // 409 is the worker's own "a run is already in progress"; the caller decides what that means.
    agentRun: (projectId, body) => call('POST', `/api/admin/agent-run/${projectId}`, body, { allow: [403, 409] }),
    agentStop: (projectId) => call('POST', `/api/admin/agent-stop/${projectId}`, {}).then((r) => r.json),
    mintPairingCode: (projectId, userId) => call('POST', `/api/admin/pairing/${projectId}`, { userId }, { allow: [403, 409, 429] }),
  };
}
