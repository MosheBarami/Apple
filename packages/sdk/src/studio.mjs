// The Studio-plugin half of the API: pair once, then long-poll for ops.
//
// This is the same contract apps/plugin/src/init.server.luau speaks, expressed for a
// JavaScript host (a test harness, a headless runner, an editor extension). It is NOT a
// second protocol: the routes, the header names and the token shape all come from
// apps/worker/src/index.ts, and the Luau client in ../luau/ answers to the same rules.
import { ApiError } from './errors.mjs';
import { finiteNumber } from './numbers.mjs';
import { HEADERS, isProjectId } from './wire.mjs';
import { createTransport } from './http.mjs';

/**
 * The token the worker issues at pairing: `<projectId>.<48 hex chars>`.
 *
 * The worker checks this shape BEFORE touching storage, precisely so an unauthenticated
 * caller cannot materialise a Durable Object for an arbitrary id. Checking it here as well
 * is not redundancy for its own sake: a client that sends a malformed token gets a 401 that
 * is indistinguishable from an expired session, and would reconnect forever.
 */
export function isStudioToken(token) {
  if (typeof token !== 'string' || token.length > 200) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  return isProjectId(token.slice(0, dot)) && /^[0-9a-f]{48}$/.test(token.slice(dot + 1));
}

/** Raised when the worker says this pairing is over. Reconnecting needs a NEW code. */
export class StudioSessionEnded extends Error {
  constructor(message = 'Session ended — reconnect with a new code') {
    super(message);
    this.name = 'StudioSessionEnded';
  }
}

/**
 * How long to wait before the next poll, in milliseconds.
 *
 * THE GUARD IS THE WHOLE FUNCTION. `data.waitMs || 2000` — what the shipped plugin does —
 * accepts anything truthy: a string, an object, Infinity. The Luau side then divides it by
 * 1000, which raises on a non-numeric string and kills the poll loop; the JavaScript side
 * hands Infinity to setTimeout, which fires immediately and hot-loops the worker. Neither
 * failure announces itself as a bad field.
 *
 * Clamped rather than rejected when it is a real number out of range: a server asking for a
 * long delay means it, and a floor keeps a zero or negative value from becoming a spin.
 */
export function pollWaitMs(response, fallback = 2000, { min = 200, max = 10_000 } = {}) {
  const raw = response && typeof response === 'object' ? response.waitMs : undefined;
  return finiteNumber(raw, fallback, { min, max });
}

export class StudioClient {
  /**
   * @param options.token   a token from `claim()`, when this client is already paired
   * @param options.version plugin version reported on every request (X-Golem-Plugin-Version)
   * @param options.protocol wire protocol integer (X-Golem-Plugin-Protocol)
   */
  constructor(options = {}) {
    this.transport = options.transport ?? createTransport(options);
    this.baseUrl = this.transport.baseUrl;
    this.token = options.token ?? null;
    this.version = options.version ?? null;
    this.protocol = options.protocol ?? null;
  }

  /**
   * Identity headers, sent on EVERY request including the pairing call.
   *
   * On headers rather than in the body because the server needs to know what it is talking
   * to before it parses anything, and `/api/studio/claim` has no body field to put it in. A
   * client that reports nothing simply omits them, which is indistinguishable at the HTTP
   * layer from any other client and needs no special case on either side.
   */
  headers(extra = {}) {
    const out = { ...extra };
    if (this.version !== null) out[HEADERS.pluginVersion] = String(this.version);
    if (this.protocol !== null) out[HEADERS.pluginProtocol] = String(this.protocol);
    return out;
  }

  /** Redeem a pairing code. Returns `{ token, projectId, projectName }` and stores the token. */
  async claim(code) {
    if (typeof code !== 'string' || code.trim() === '') throw new TypeError('a pairing code is required');
    const body = await this.transport.request('/api/studio/claim', {
      method: 'POST',
      token: null,
      headers: this.headers(),
      body: { code: code.trim() },
    });
    if (!body || typeof body.token !== 'string') {
      throw new ApiError('pairing succeeded but returned no token', 502, { body });
    }
    this.token = body.token;
    return body;
  }

  /**
   * One long-poll. Reports results and events, receives ops.
   *
   * A 401 is NOT a retryable error here and must not be treated as one: it means the
   * pairing was superseded or expired, and every subsequent poll with the same token will
   * answer the same way. It surfaces as `StudioSessionEnded` so a caller cannot mistake it
   * for a hiccup and spin.
   */
  async poll({ results = [], events = [], state = undefined } = {}) {
    if (!isStudioToken(this.token)) {
      throw new TypeError('this client is not paired — call claim() first');
    }
    const payload = { results, events };
    if (state) payload.state = state;
    try {
      return await this.transport.request('/api/studio/poll', {
        method: 'POST',
        token: null,
        headers: this.headers({ [HEADERS.studioToken]: this.token }),
        body: payload,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        this.token = null;
        throw new StudioSessionEnded();
      }
      throw e;
    }
  }
}
