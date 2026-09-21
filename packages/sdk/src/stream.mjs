// The streaming half of the API: one WebSocket per project session.
//
// The worker streams a run over a socket, not over SSE — `GET /api/projects/:id/ws`, with
// the credential carried in the subprotocol because a browser socket cannot set headers
// (apps/worker/src/auth.ts). This module speaks that protocol and nothing else.
//
// THE SOCKET IS INJECTED. `socketFactory` defaults to the platform's WebSocket, and a test
// hands in a fake. That is not a convenience: the interesting behaviour here is what the
// client does with a MALFORMED, out-of-order or unknown message, and there is no way to
// make a real server produce those on demand. A test that only ever saw a healthy stream
// would exercise none of the handling that exists for the unhealthy one.
import { backoffMs } from './errors.mjs';
import { finiteNumber } from './numbers.mjs';
import { CLIENT_MSG_TYPES, MODES, PRESENCE_ACTIVITIES, socketProtocols, socketUrl } from './wire.mjs';

/** `stopReason` values this build knows. Mirrors `ServerMsg` msg_end in @golem/shared. */
export const STOP_REASONS = Object.freeze(['done', 'stopped', 'error', 'quota', 'incomplete']);

/**
 * Parse one frame off the wire.
 *
 * Returns null for anything that is not an object with a string `type`. A stream is not a
 * trusted input just because it is authenticated: a proxy can truncate a frame, and a
 * worker one version ahead can send a shape this build has never heard of. `JSON.parse`
 * throwing inside a socket handler takes the whole handler down and the connection with it.
 */
export function parseServerMsg(raw) {
  if (typeof raw !== 'string') return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || typeof value.type !== 'string') return null;
  return value;
}

/** A fresh, empty view of one assistant turn. */
export function emptyRun() {
  return {
    msgId: null,
    mode: null,
    text: '',
    tools: [],
    phase: null,
    stopReason: null,
    /** False when the server sent a stopReason this build does not know. */
    stopReasonRecognised: true,
    creditsSpent: null,
    error: null,
    done: false,
    /**
     * Deltas that named a message this run is not assembling.
     *
     * COUNTED, NOT DROPPED SILENTLY. An orphan delta means the client and the server
     * disagree about which turn is live — a real defect — and a client that ignored them
     * quietly would render a short answer and report nothing at all about the missing text.
     */
    orphanDeltas: 0,
  };
}

/**
 * Fold one server message into a run.
 *
 * PURE, and returns a NEW object rather than mutating: the interesting inputs are the
 * broken ones, and a pure fold lets a test supply them directly instead of coaxing a
 * server into emitting them.
 */
export function applyServerMsg(run, msg) {
  if (!msg || typeof msg.type !== 'string') return run;
  switch (msg.type) {
    case 'msg_start':
      return { ...emptyRun(), msgId: msg.msgId ?? null, mode: msg.mode ?? null };
    case 'delta': {
      if (typeof msg.text !== 'string') return run;
      // An id-less delta belongs to the live run by definition — there is nothing to
      // disagree with. A delta naming a DIFFERENT run is the defect this counts.
      if (msg.msgId !== undefined && run.msgId !== null && msg.msgId !== run.msgId) {
        return { ...run, orphanDeltas: run.orphanDeltas + 1 };
      }
      return { ...run, text: run.text + msg.text };
    }
    case 'tool_start':
      return { ...run, tools: [...run.tools, { toolId: msg.toolId, tool: msg.tool, summary: msg.summary, ok: null }] };
    case 'tool_end': {
      const tools = run.tools.map((t) =>
        t.toolId === msg.toolId ? { ...t, ok: msg.ok === true, summary: msg.summary ?? t.summary, detail: msg.detail } : t,
      );
      return { ...run, tools };
    }
    case 'agent_status':
      return {
        ...run,
        phase: typeof msg.phase === 'string' ? msg.phase : run.phase,
        // `?? run.creditsSpent` would have kept a NaN that arrived here forever, and every
        // later `>` against it reads false — a spend display that silently stops moving.
        creditsSpent: finiteNumber(msg.creditsSpent, run.creditsSpent),
      };
    case 'msg_end':
      return {
        ...run,
        done: true,
        stopReason: typeof msg.stopReason === 'string' ? msg.stopReason : 'error',
        stopReasonRecognised: STOP_REASONS.includes(msg.stopReason),
        error: typeof msg.error === 'string' ? msg.error : null,
        creditsSpent: finiteNumber(msg.creditsSpent, run.creditsSpent),
      };
    case 'error':
      // A modern worker distinguishes a refused request from an informational event such as a
      // collaborator role change. Undefined keeps the legacy behaviour, so an older worker cannot
      // strand an SDK waiting forever after a refusal.
      return msg.terminal === false
        ? { ...run, error: typeof msg.message === 'string' ? msg.message : 'error' }
        : { ...run, error: typeof msg.message === 'string' ? msg.message : 'error', done: true, stopReason: 'error' };
    default:
      return run;
  }
}

/** Validate a client message before it reaches the wire. Throws for a programmer error. */
export function validateClientMsg(msg) {
  if (!msg || typeof msg !== 'object') throw new TypeError('a client message must be an object');
  if (!CLIENT_MSG_TYPES.includes(msg.type)) {
    throw new TypeError(`unknown client message type ${JSON.stringify(msg.type)}`);
  }
  if (msg.type === 'chat' || msg.type === 'edit_resend') {
    if (typeof msg.text !== 'string' || msg.text.trim() === '') throw new TypeError('chat text must be a non-empty string');
    // A TypeScript union does not exist at runtime, and this value routinely comes from a
    // CLI flag or a Python caller. The server would take an unknown mode and reach the
    // ingress guard with it; refusing here names the mistake where it was made.
    if (!MODES.includes(msg.mode)) throw new TypeError(`mode must be one of ${MODES.join(', ')}`);
  }
  if (msg.type === 'edit_resend' && (typeof msg.messageId !== 'string' || msg.messageId === '')) {
    throw new TypeError('edit_resend needs a messageId');
  }
  if (msg.type === 'checkpoint_restore' && (typeof msg.checkpointId !== 'string' || msg.checkpointId === '')) {
    throw new TypeError('checkpoint_restore needs a checkpointId');
  }
  // The server never takes the client's word for WHO is present — identity comes from the
  // socket — only for what they are up to, so the activity is the one field worth checking
  // here, and it is checked against the allowlist rather than for being a string.
  if (msg.type === 'presence' && !PRESENCE_ACTIVITIES.includes(msg.activity)) {
    throw new TypeError(`presence activity must be one of ${PRESENCE_ACTIVITIES.join(', ')}`);
  }
  return msg;
}

const OPEN = 1;

/**
 * A live session on one project.
 *
 * Reconnects with exponential backoff, because the socket drops routinely — a laptop lid, a
 * Cloudflare rolling deploy — and a client that gave up on the first close would leave a
 * running build with nobody watching it.
 */
export class SessionStream {
  constructor(options = {}) {
    this.url = socketUrl(options.baseUrl, options.projectId);
    this.projectId = options.projectId;
    this.token = options.token;
    this.socketFactory =
      options.socketFactory ??
      ((url, protocols) => {
        if (typeof globalThis.WebSocket !== 'function') {
          throw new TypeError('no WebSocket available — pass options.socketFactory');
        }
        return new globalThis.WebSocket(url, protocols);
      });
    this.setTimeout = options.setTimeout ?? setTimeout;
    this.clearTimeout = options.clearTimeout ?? clearTimeout;
    this.jitter = typeof options.jitter === 'function' ? options.jitter : Math.random;
    this.maxReconnects = finiteNumber(options.maxReconnects, 8, { min: 0, max: 100 });
    this.socket = null;
    this.run = emptyRun();
    this.closedByUs = false;
    this.attempt = 0;
    this.listeners = new Map();
    this.reconnectTimer = null;
  }

  on(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(type, list.filter((h) => h !== handler));
  }

  emit(type, payload) {
    for (const handler of this.listeners.get(type) ?? []) handler(payload);
    if (type !== '*') for (const handler of this.listeners.get('*') ?? []) handler(payload, type);
  }

  connect() {
    this.closedByUs = false;
    const socket = this.socketFactory(this.url, socketProtocols(this.token));
    this.socket = socket;
    socket.onopen = () => {
      // NOTE WHAT IS *NOT* HERE: `this.attempt = 0`.
      //
      // Resetting the backoff the moment a socket opens is the obvious thing and it is
      // wrong, because a FLAPPING connection opens every time. A worker that accepts the
      // upgrade and drops it — mid-deploy, or a session the DO refuses after init — would
      // be retried at the base delay forever, which is the stampede the backoff exists to
      // prevent, while the schedule still looks exponential in the code.
      //
      // The counter resets on the first frame we could actually read instead (see
      // handleFrame): the worker sends `hello` immediately on a good connect, so a socket
      // that delivered one is healthy by evidence rather than by assumption.
      this.emit('open', { url: this.url });
    };
    socket.onmessage = (event) => this.handleFrame(event && typeof event === 'object' ? event.data : event);
    socket.onerror = (event) => this.emit('socket_error', event);
    socket.onclose = (event) => {
      this.emit('close', event);
      if (!this.closedByUs) this.scheduleReconnect();
    };
    return this;
  }

  handleFrame(data) {
    const msg = parseServerMsg(typeof data === 'string' ? data : String(data ?? ''));
    if (!msg) {
      // A frame we could not read is reported, never counted as a frame we read.
      this.emit('unreadable', data);
      return;
    }
    // A frame we could read is the evidence that this connection works. See connect().
    this.attempt = 0;
    this.run = applyServerMsg(this.run, msg);
    this.emit(msg.type, msg);
    this.emit('message', msg);
  }

  scheduleReconnect() {
    if (this.attempt >= this.maxReconnects) {
      this.emit('gave_up', { attempts: this.attempt });
      return;
    }
    this.attempt += 1;
    const delay = backoffMs(this.attempt, { jitter: this.jitter });
    this.emit('reconnecting', { attempt: this.attempt, delayMs: delay });
    this.reconnectTimer = this.setTimeout(() => this.connect(), delay);
  }

  /** Send a validated client message. False when the socket is not open — never a throw. */
  send(msg) {
    validateClientMsg(msg);
    if (!this.socket || this.socket.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  sendChat(text, mode = 'stone') {
    return this.send({ type: 'chat', text, mode });
  }

  editAndResend(messageId, text, mode = 'stone') {
    return this.send({ type: 'edit_resend', messageId, text, mode });
  }

  stop() {
    return this.send({ type: 'stop' });
  }

  resume() {
    return this.send({ type: 'resume' });
  }

  ping() {
    return this.send({ type: 'ping' });
  }

  /** "I am still here, and this is what I am doing." Sent alongside the keepalive. */
  presence(activity) {
    return this.send({ type: 'presence', activity });
  }

  createCheckpoint(label = 'checkpoint') {
    return this.send({ type: 'checkpoint_create', label: String(label) });
  }

  restoreCheckpoint(checkpointId) {
    return this.send({ type: 'checkpoint_restore', checkpointId });
  }

  /** Close for good. No reconnect follows a close we asked for. */
  close(code = 1000, reason = 'client closed') {
    this.closedByUs = true;
    if (this.reconnectTimer !== null) this.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket && typeof this.socket.close === 'function') this.socket.close(code, reason);
  }

  /** Resolve once the live run ends, with the assembled turn. */
  waitForRun() {
    return new Promise((resolve) => {
      if (this.run.done) {
        resolve(this.run);
        return;
      }
      const offEnd = this.on('msg_end', () => {
        offEnd();
        offErr();
        resolve(this.run);
      });
      const offErr = this.on('error', () => {
        offEnd();
        offErr();
        resolve(this.run);
      });
    });
  }
}
