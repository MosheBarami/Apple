// The typed surface: one method per documented route of the Apple worker API.
//
// Every path here exists in apps/worker/src/index.ts. Nothing in this file invents an
// endpoint, and nothing reshapes a response — the worker's JSON is what a caller gets,
// because a client that renames fields becomes a second definition of the wire format and
// the two disagree the first time either one changes.
import { createTransport } from './http.mjs';
import { projectPath, MODES } from './wire.mjs';
import { HEADERS } from './wire.mjs';

/**
 * Plans this client will send to `/api/billing/checkout`.
 *
 * A COPY of `PLAN_IDS` in @golem/shared, and deliberately so: that module is TypeScript and
 * this one is plain JavaScript that a browser, a CLI and Node all load without a build step.
 * A copy that nothing checks is drift waiting to happen, so `tests/protocol-parity.test.mjs`
 * reads the declaration in packages/shared/src/index.ts and fails when the two disagree.
 */
export const PLAN_IDS = Object.freeze(['free', 'builder', 'studio', 'enterprise']);

function assertOneOf(value, allowed, what) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${what} must be one of ${allowed.join(', ')} — got ${JSON.stringify(value)}`);
  }
}

/**
 * A client for one deployment, holding one credential.
 *
 * `token` may be a string or a function returning one (possibly async), which is what lets
 * a long-lived process hand over a session that refreshes without rebuilding the client.
 */
export class AppleClient {
  constructor(options = {}) {
    this.transport = options.transport ?? createTransport(options);
    this.baseUrl = this.transport.baseUrl;
    this.adminKey = typeof options.adminKey === 'string' ? options.adminKey : null;
  }

  // ------------------------------------------------------------------ service

  /** Liveness and the deployed build sha. The one route that needs no credential. */
  health() {
    return this.transport.request('/api/health', { token: null });
  }

  /** Whether this deployment can serve inference at all. Says nothing about which model. */
  providers() {
    return this.transport.request('/api/providers');
  }

  // --------------------------------------------------------------------- me

  me() {
    return this.transport.request('/api/me');
  }

  usage() {
    return this.transport.request('/api/me/usage');
  }

  /** Semantic search over the ingested Roblox documentation. Metered: costs one Credit. */
  searchDocs(query) {
    return this.transport.request('/api/docs/search', { query: { q: String(query ?? '') } });
  }

  // ---------------------------------------------------------------- billing

  billingConfig() {
    return this.transport.request('/api/billing/config');
  }

  /**
   * Open a Stripe Checkout session. Returns a URL and changes NOTHING about entitlement —
   * the plan moves when the signed webhook arrives, so coming back from Stripe means
   * "refetch and see", never "you are on that plan now".
   */
  startCheckout(plan) {
    assertOneOf(plan, PLAN_IDS, 'plan');
    return this.transport.request('/api/billing/checkout', { method: 'POST', body: { plan } });
  }

  billingPortal() {
    return this.transport.request('/api/billing/portal', { method: 'POST' });
  }

  // --------------------------------------------------------------- projects

  messages(projectId, { limit = 100 } = {}) {
    return this.transport.request(projectPath(projectId, '/messages'), { query: { limit } });
  }

  /**
   * Search one project's whole conversation, server-side.
   *
   * Not a filter over `messages()`: that pages only the most recent hundred, so filtering
   * it answers "not found" for text that IS in the conversation and nothing distinguishes
   * that from the true answer.
   */
  searchConversation(projectId, query) {
    return this.transport.request(projectPath(projectId, '/search'), { query: { q: String(query ?? '') } });
  }

  memory(projectId) {
    return this.transport.request(projectPath(projectId, '/memory'), {});
  }

  /** Replace what Apple believes about a project. The WHOLE memory is sent, never a patch. */
  saveMemory(projectId, memory) {
    if (!memory || typeof memory !== 'object') throw new TypeError('memory must be an object');
    if (!Array.isArray(memory.facts)) throw new TypeError('memory.facts must be an array');
    return this.transport.request(projectPath(projectId, '/memory'), { method: 'PUT', body: { memory } });
  }

  checkpoints(projectId) {
    return this.transport.request(projectPath(projectId, '/checkpoints'));
  }

  createCheckpoint(projectId, label = 'checkpoint') {
    return this.transport.request(projectPath(projectId, '/checkpoints'), {
      method: 'POST',
      body: { label: String(label) },
    });
  }

  restoreCheckpoint(projectId, checkpointId) {
    if (typeof checkpointId !== 'string' || checkpointId === '') throw new TypeError('checkpointId required');
    return this.transport.request(projectPath(projectId, '/restore'), {
      method: 'POST',
      body: { checkpointId },
    });
  }

  purge(projectId) {
    return this.transport.request(projectPath(projectId, '/purge'), { method: 'POST' });
  }

  /** A one-time pairing code for the Studio plugin. Expires; see `expiresAtIso`. */
  createPairingCode(projectId) {
    return this.transport.request(projectPath(projectId, '/pairing'), { method: 'POST' });
  }

  attribution(projectId) {
    return this.transport.request(projectPath(projectId, '/attribution'));
  }

  roadmap(projectId, { polish = false } = {}) {
    return this.transport.request(projectPath(projectId, '/roadmap'), {
      query: polish ? { polish: 1 } : undefined,
    });
  }

  nextMilestones(projectId) {
    return this.transport.request(projectPath(projectId, '/roadmap/next'));
  }

  milestoneBrief(projectId, milestoneId) {
    if (typeof milestoneId !== 'string' || milestoneId === '') throw new TypeError('milestoneId required');
    return this.transport.request(projectPath(projectId, '/roadmap/brief'), {
      method: 'POST',
      body: { milestoneId },
    });
  }

  /**
   * The whole conversation as a file.
   *
   * THE SERVER NAMES THE FILE. The name is in Content-Disposition and nowhere else, and
   * re-deriving it here from the project name would be a second implementation of the
   * worker's slug rule that disagrees the first time either changes.
   */
  async exportTranscript(projectId, format = 'json') {
    assertOneOf(format, ['json', 'md'], 'format');
    const res = await this.transport.raw(projectPath(projectId, '/export'), {
      query: { format },
      as: 'text',
    });
    return {
      filename: filenameFromDisposition(res.headers.get('Content-Disposition')) ?? `project-export.${format}`,
      contentType: res.headers.get('Content-Type') ?? '',
      body: res.body,
    };
  }

  /** A generated image's PNG bytes. 404 means expired, missing, or not yours — deliberately. */
  async image(projectId, imageId) {
    const res = await this.transport.raw(projectPath(projectId, `/images/${encodeURIComponent(imageId)}`), {
      as: 'bytes',
    });
    return res.body;
  }

  // ------------------------------------------------------------------ admin
  //
  // Behind X-Admin-Key, not a user JWT. Present because operators drive this deployment
  // from scripts; a client with no admin key refuses rather than sending an empty header,
  // because an empty header is a 403 that reads like a missing route.

  admin(path, init = {}) {
    if (!this.adminKey) throw new TypeError('this client has no adminKey — admin routes need one');
    return this.transport.request(path, {
      ...init,
      headers: { ...(init.headers ?? {}), [HEADERS.adminKey]: this.adminKey },
    });
  }

  adminStats() {
    return this.admin('/api/admin/stats');
  }

  adminSpend() {
    return this.admin('/api/admin/spend');
  }
}

/** Modes a chat turn may be sent in, re-exported so callers need not import wire.mjs. */
export { MODES };

/** RFC 6266 `filename="..."`, or null. */
export function filenameFromDisposition(raw) {
  if (typeof raw !== 'string') return null;
  const quoted = /filename="([^"]+)"/.exec(raw);
  if (quoted) return quoted[1];
  const bare = /filename=([^;]+)/.exec(raw);
  return bare ? bare[1].trim() : null;
}
