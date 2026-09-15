// The wire contract, as data.
//
// Everything in this file is a fact about the deployed worker (apps/worker/src/index.ts)
// and the shared protocol types (packages/shared/src/index.ts). It is kept apart from the
// client so that the paths, header names and subprotocols a test asserts on are the same
// strings the client sends — a test that rebuilt the path itself would agree with a broken
// client forever.
//
// THE LITERALS BELOW ARE CLOSED. `golem.v1`, `golem.jwt.` and the `X-Golem-` header family
// are the wire identity of this product; renaming one breaks every client mid-session and
// every already-installed Studio plugin, which updates only when a user clicks Update.

/** WebSocket subprotocol the worker echoes back on a successful upgrade. */
export const WS_SUBPROTOCOL = 'golem.v1';

/**
 * Prefix for the credential-carrying subprotocol.
 *
 * A browser WebSocket cannot set an Authorization header, so the worker also reads the
 * bearer token out of `Sec-WebSocket-Protocol` (apps/worker/src/auth.ts `bearerToken`).
 * That is the ONLY reason this exists; every non-socket call uses the header.
 */
export const WS_JWT_PREFIX = 'golem.jwt.';

export const HEADERS = Object.freeze({
  auth: 'Authorization',
  adminKey: 'X-Admin-Key',
  studioToken: 'X-Golem-Token',
  pluginVersion: 'X-Golem-Plugin-Version',
  pluginProtocol: 'X-Golem-Plugin-Protocol',
});

/** Modes the agent protocol accepts. Mirrors `GolemMode` in @golem/shared. */
export const MODES = Object.freeze(['clay', 'stone', 'rune']);

/**
 * Client message types the session socket accepts. Mirrors `ClientMsg` in @golem/shared.
 *
 * A TypeScript union is a COMPILE-TIME promise. This SDK is called from plain JavaScript,
 * from a CLI whose arguments are strings a user typed, and from Python — none of which the
 * compiler ever sees. So the set is repeated here as a runtime allowlist, and `sendRaw`
 * checks against it.
 */
export const CLIENT_MSG_TYPES = Object.freeze([
  'chat',
  'edit_resend',
  'stop',
  'resume',
  'checkpoint_create',
  'checkpoint_restore',
  'presence',
  'ping',
]);

/** Activities a `presence` message may report. Mirrors the union in @golem/shared. */
export const PRESENCE_ACTIVITIES = Object.freeze(['viewing', 'typing', 'building']);

/** The public base URL of the production worker. */
export const DEFAULT_BASE_URL = 'https://golem.moshe-barami111.workers.dev';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for the id shape the worker's own `UUID_RE` admits. */
export function isProjectId(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * The path for one project's sub-resource.
 *
 * THE VALIDATION IS THE POINT, not the string concatenation. `/api/projects/${id}/messages`
 * with an unvalidated id is a path-traversal primitive: an id of `../../admin/stats` turns a
 * project read into an admin read, and `x?limit=1#` turns the rest of the path into a
 * fragment the server never sees. The worker refuses a non-UUID id with a 404, so a caller
 * that got here with one has a bug, and the honest place to say so is before the request
 * leaves rather than in a 404 that reads like "no such project".
 */
export function projectPath(projectId, suffix = '') {
  if (!isProjectId(projectId)) {
    throw new TypeError(`invalid project id: ${JSON.stringify(projectId)} (expected a UUID)`);
  }
  return `/api/projects/${projectId}${suffix}`;
}

/** Absolute URL for a project's session socket, carrying no credential. */
export function socketUrl(baseUrl, projectId) {
  const base = normalizeBaseUrl(baseUrl);
  const path = projectPath(projectId, '/ws');
  return `${base.replace(/^http/, 'ws')}${path}`;
}

/**
 * The two subprotocols a session socket opens with, in order.
 *
 * `golem.v1` first because the worker echoes exactly that one back, and browsers abort the
 * handshake when the echoed value is not among the requested ones.
 */
export function socketProtocols(token) {
  if (typeof token !== 'string' || token === '') {
    throw new TypeError('a session socket needs an access token');
  }
  return [WS_SUBPROTOCOL, `${WS_JWT_PREFIX}${token}`];
}

/** Trailing slashes removed, so path joining never produces `//api`. */
export function normalizeBaseUrl(baseUrl) {
  const raw = typeof baseUrl === 'string' && baseUrl.trim() !== '' ? baseUrl.trim() : DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(raw)) throw new TypeError(`base URL must be http(s): ${JSON.stringify(baseUrl)}`);
  return raw.replace(/\/+$/, '');
}
