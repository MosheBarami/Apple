// What went wrong, in a shape a caller can branch on.
import { finiteInt, isFiniteNumber, retryAfterSeconds } from './numbers.mjs';

/**
 * A failed call to the Apple API.
 *
 * `status` is 0 for a transport failure — DNS, TLS, a dropped connection, an offline
 * laptop. That is deliberately distinct from every HTTP status: "the server said no" and
 * "there was no server" need different words in front of a user, and collapsing them is
 * how a client ends up telling someone their project does not exist because their wifi
 * dropped.
 */
export class ApiError extends Error {
  constructor(message, status, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = finiteInt(status, 0, { min: 0, max: 599 });
    /** The parsed error body, when the server sent one. */
    this.body = options.body ?? null;
    /** Seconds the server asked us to wait, when it said so. */
    this.retryAfter = typeof options.retryAfter === 'number' ? options.retryAfter : null;
    /** How many attempts were made in total, including this one. */
    this.attempts = finiteInt(options.attempts, 1, { min: 1, max: 100 });
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /** True when this is the transport failing rather than the API answering. */
  get isTransport() {
    return this.status === 0;
  }
}

/**
 * The status codes worth trying again.
 *
 * 429 is in the list even though this deployment uses it for BOTH "slow down" and "you are
 * out of Credits for today". Retrying the second is useless but bounded — three attempts
 * over a few seconds — while NOT retrying the first would hand a caller a hard failure for
 * a condition that clears on its own. The wrong answer costs a few hundred milliseconds;
 * the other wrong answer costs the call.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Methods that may be repeated without repeating their effect. */
const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/**
 * May this attempt be repeated?
 *
 * A PURE FUNCTION OF ITS INPUTS, so the violating case can come from a test rather than
 * from a live server that has to be coaxed into misbehaving.
 *
 * POST IS NOT RETRIED BY DEFAULT, and that is the load-bearing half. `POST /api/projects/
 * :id/checkpoints` creates a checkpoint; `POST /api/billing/checkout` opens a Stripe
 * session. A request that timed out may well have been executed, and a client that retries
 * it turns one user action into two. The worker implements no idempotency key, so there is
 * nothing on the server that would collapse the duplicate — which is exactly why the
 * decision has to be made here and defaulted to "no".
 */
export function shouldRetry({ method, status, attempt, maxAttempts, retryNonIdempotent = false }) {
  // AN UNREADABLE COUNTER REFUSES, it does not restart. `finiteInt(attempt, 1)` would answer
  // "this is attempt 1" for a counter that arrived as NaN or Infinity — which is the caller
  // having lost count, and treating that as the first attempt licenses an unbounded retry
  // loop while the cap above still looks like a cap.
  if (!isFiniteNumber(attempt) || !isFiniteNumber(maxAttempts)) return false;
  const attemptNo = finiteInt(attempt, 1, { min: 1, max: 1000 });
  const cap = finiteInt(maxAttempts, 1, { min: 1, max: 100 });
  if (attemptNo >= cap) return false;
  const verb = typeof method === 'string' ? method.toUpperCase() : '';
  if (!IDEMPOTENT.has(verb) && !retryNonIdempotent) return false;
  const code = finiteInt(status, -1, { min: -1, max: 599 });
  // A transport failure (status 0) is retried for an idempotent method only, and the gate
  // above is what enforces that. It is tempting to read status 0 as "the request never
  // arrived" and retry anything — but a connection reset AFTER the worker committed the
  // write throws in exactly the same way, and the client cannot tell the two apart. So a
  // POST that died in transit is reported, not repeated.
  if (code === 0) return true;
  return RETRYABLE_STATUS.has(code);
}

/**
 * How long to wait before attempt `attempt + 1`, in milliseconds.
 *
 * Exponential with a ceiling, and the server's own `Retry-After` wins when it sent one —
 * a server that says "60 seconds" knows something the client does not, and backing off for
 * 400ms instead is how a rate limit turns into a stampede.
 *
 * `jitter` is a caller-supplied 0..1 so the schedule is deterministic under test. The
 * default is Math.random, which is what makes a thundering herd spread out in production.
 */
export function backoffMs(attempt, { retryAfter = null, jitter = Math.random, base = 300, cap = 20_000 } = {}) {
  const seconds = typeof retryAfter === 'string' ? retryAfterSeconds(retryAfter) : retryAfter;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    return Math.min(cap, Math.max(0, Math.round(seconds * 1000)));
  }
  const n = finiteInt(attempt, 1, { min: 1, max: 30 });
  const exponential = Math.min(cap, base * 2 ** (n - 1));
  const spread = typeof jitter === 'function' ? jitter() : 0;
  const factor = 0.5 + (Number.isFinite(spread) ? Math.min(1, Math.max(0, spread)) : 0) * 0.5;
  return Math.round(exponential * factor);
}

/** Pull the server's error sentence out of a parsed body, or fall back to the status. */
export function messageFromBody(body, status) {
  if (body && typeof body === 'object' && typeof body.error === 'string' && body.error.trim() !== '') {
    return body.error;
  }
  if (typeof body === 'string' && body.trim() !== '' && body.length <= 300) return body.trim();
  return `Request failed (${status})`;
}
