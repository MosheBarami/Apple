// The one place this SDK talks to the network.
//
// Everything above it — the typed client, the CLI, the streaming session — goes through
// `createTransport`, so authentication, retry, error shape and JSON handling have exactly
// one implementation. `fetch` and `sleep` are injected rather than imported so a test can
// drive the whole policy without a socket and without waiting out a real backoff.
import { ApiError, backoffMs, messageFromBody, shouldRetry } from './errors.mjs';
import { finiteInt, retryAfterSeconds } from './numbers.mjs';
import { HEADERS, normalizeBaseUrl } from './wire.mjs';

/**
 * Resolve the caller's credential.
 *
 * A string for a script that already has a token; a function for anything with a session
 * that refreshes — the web app's `getAccessToken` is exactly that shape. Returning null is
 * legal and means "send no Authorization header", which is what the public routes want.
 */
async function resolveToken(token) {
  const value = typeof token === 'function' ? await token() : token;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new TypeError('access token must be a string or a function returning one');
  return value === '' ? null : value;
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s === '' ? '' : `?${s}`;
}

export function createTransport(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('no fetch available — pass one as options.fetch');
  }
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  // `?? 3` would have accepted NaN, "3" and Infinity. NaN survives every `>=` comparison
  // in shouldRetry as false, which turns the attempt cap into no cap at all.
  const maxAttempts = finiteInt(options.maxAttempts, 3, { min: 1, max: 10 });
  const jitter = typeof options.jitter === 'function' ? options.jitter : Math.random;
  const staticHeaders = { ...(options.headers ?? {}) };

  /** One attempt. Returns the raw response; throws ApiError(0) only for transport failure. */
  async function attempt(url, init) {
    try {
      return await fetchImpl(url, init);
    } catch (cause) {
      throw new ApiError('Network error — the API could not be reached.', 0, { cause });
    }
  }

  /**
   * A request, with retries, returning the raw response and its parsed body.
   *
   * The body is read ONCE and handed back, because a Response body is a stream that cannot
   * be read twice and callers legitimately need both the bytes and the headers (the export
   * route puts the filename in Content-Disposition and nowhere else).
   */
  async function raw(path, init = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    const url = `${baseUrl}${path}${buildQuery(init.query)}`;
    const token = await resolveToken(init.token === undefined ? options.token : init.token);

    const headers = { ...staticHeaders, ...(init.headers ?? {}) };
    if (token && !headers[HEADERS.auth]) headers[HEADERS.auth] = `Bearer ${token}`;
    let body;
    if (init.body !== undefined && init.body !== null) {
      body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    const as = init.as ?? 'json';
    let attemptNo = 1;
    for (;;) {
      let res = null;
      let transportError = null;
      try {
        res = await attempt(url, { method, headers, body, signal: init.signal });
      } catch (e) {
        transportError = e;
      }

      const status = res ? res.status : 0;
      const retryAfter = res ? retryAfterSeconds(res.headers.get('Retry-After')) : null;
      const retrying = shouldRetry({
        method,
        status,
        attempt: attemptNo,
        maxAttempts,
        retryNonIdempotent: init.retryNonIdempotent === true,
      });

      if (retrying) {
        // A retried response still holds an unread body. Draining it is not optional on
        // undici: an undrained body keeps the connection out of the pool.
        if (res) await res.text().catch(() => {});
        await sleep(backoffMs(attemptNo, { retryAfter, jitter }));
        attemptNo += 1;
        continue;
      }
      if (transportError) {
        transportError.attempts = attemptNo;
        throw transportError;
      }

      const payload = await readBody(res, as);
      if (!res.ok) {
        throw new ApiError(messageFromBody(payload, status), status, {
          body: payload,
          retryAfter,
          attempts: attemptNo,
        });
      }
      return { status, headers: res.headers, body: payload, attempts: attemptNo };
    }
  }

  async function readBody(res, as) {
    if (as === 'bytes') return new Uint8Array(await res.arrayBuffer());
    if (as === 'text') return res.text();
    // JSON, but an error body is not guaranteed to be JSON: a 502 from an edge can be HTML,
    // and `res.json()` on that throws a SyntaxError that would reach the caller INSTEAD of
    // the status they need to branch on. So the text is kept and offered as the message.
    const text = await res.text();
    if (text === '') return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** The common case: a JSON request that returns its parsed body. */
  async function request(path, init = {}) {
    const { body } = await raw(path, init);
    return body;
  }

  return { baseUrl, request, raw };
}
