// ERROR MONITORING — the worker half.
//
// Until this file existed, a production failure was invisible unless somebody happened to be
// watching `wrangler tail`. The request log in analytics.ts records that an error HAPPENED — a
// route, a kind, a redacted message — and that log is drained into AdminDO where somebody has to
// go and look. Nothing pushed. Nothing paged. A 500 at 04:00 on a Sunday was a row in a table
// nobody would read until the customer wrote in.
//
// ---------------------------------------------------------------------------------------------
// WHY THERE IS NO `@sentry/cloudflare` IMPORT HERE
// ---------------------------------------------------------------------------------------------
// The documented integration is `Sentry.withSentry(env => ({...}), handler)`, which WRAPS the
// exported handler. Two reasons that is not what this file does:
//
//   1. The SDK is not installed and this tree does not add dependencies on a whim. Sentry's
//      ingestion contract is a documented HTTP envelope (develop-docs/sdk/foundations/envelopes)
//      — one POST, three JSON lines — and that is what `serialiseEnvelope` writes.
//
//   2. `withSentry`'s `dataCollection` defaults are PERMISSIVE: userInfo, cookies, HTTP bodies
//      and genAI prompts/responses all go to Sentry unless each is turned off by name. This is a
//      product whose request bodies ARE the customer's prompts and whose Authorization headers
//      are Supabase JWTs. A monitoring integration that ships those by default, and is kept safe
//      only by a list of opt-outs somebody has to remember to maintain, is the wrong shape. The
//      event below is built from a CLOSED allowlist instead: there is no code path in this file
//      that can read a request body, a header, a cookie or a query string, so none of them can
//      leave. See `buildEvent`.
//
// Wrapping the default export was also not available: `index.ts` exports
// `Object.assign(app, { scheduled })`, and a dozen route suites drive that same object through
// `app.request(...)`. Replacing it would satisfy the runtime and break every one of them. So the
// capture point is an outermost Hono middleware that RE-THROWS — see `sentryMiddleware`.
//
// ---------------------------------------------------------------------------------------------
// THE THREE PROMISES
// ---------------------------------------------------------------------------------------------
//   1. NO DSN IS NOT A CRASH AND NOT A SWALLOW. With `SENTRY_DSN` unset this module sends
//      nothing, throws nothing, and — critically — changes nothing about the response the client
//      gets. The middleware re-throws the original error in every branch.
//
//   2. A FAILURE TO SEND MUST NOT READ AS A SEND (docs/FAILURES.md). `reportToSentry` returns a
//      discriminated outcome, never a boolean and never `void`. `{ sent: false, reason: … }` is a
//      different answer from `{ sent: true }`, and "the DSN was absent" is a different answer from
//      "Sentry refused the envelope".
//
//   3. SCRUB BEFORE SEND, TWICE. The event is assembled from an allowlist (structural), and then
//      every string in the assembled object is walked through redaction.ts (content). The second
//      pass exists because the first one is a property of code somebody may edit later.
import type { Env } from './env';
import { redact } from './redaction.ts';

/** Identifies this client to Sentry in the auth header. Arbitrary, but it should name us. */
export const SENTRY_CLIENT = 'apple-worker/1.0';

/** Sentry's protocol version. 7 is current and is what the envelope endpoint expects. */
export const SENTRY_VERSION = 7;

/**
 * Caps. Both exist to BOUND accidental spillage rather than to prevent it — the prevention is the
 * allowlist in `buildEvent`. An error message is a string some other module composed, and if a
 * future caller interpolates a transcript into one, a cap is the difference between a leak and a
 * catastrophe. 1000 characters is comfortably more than any diagnostic message in this tree.
 */
export const MESSAGE_MAX = 1000;
export const FRAME_MAX = 40;

/* ------------------------------------------------------------------- the DSN --- */

export interface SentryDsn {
  /** `https` in every real deployment; parsed rather than assumed so a typo is refused, not sent. */
  protocol: string;
  /** `o123.ingest.us.sentry.io` */
  host: string;
  /** Everything between the host and the project id, usually empty. Leading slash, no trailing. */
  path: string;
  /** The public key — the DSN's user component. Goes in `X-Sentry-Auth`. */
  publicKey: string;
  /** The numeric project id — the DSN's last path segment. */
  projectId: string;
}

/**
 * A DSN, or null.
 *
 * NULL FOR ANY UNUSABLE INPUT, INCLUDING A PRESENT-BUT-WRONG ONE. A misconfigured DSN and an
 * absent one both mean "this deployment is not reporting", and both must reach the caller as a
 * refusal it can name rather than as an exception thrown out of a `finally` block on the error
 * path of a live request. The caller distinguishes them by whether the raw value was there at all.
 *
 * `{PROTOCOL}://{PUBLIC_KEY}@{HOST}{PATH}/{PROJECT_ID}` — the secret-key half of the legacy format
 * is deliberately not read. Sentry deprecated it, `sentry_secret` is no longer sent, and accepting
 * one here would invite somebody to paste a credential into a config var that is not treated as a
 * credential anywhere else in this file.
 */
export function parseDsn(raw: unknown): SentryDsn | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const publicKey = url.username;
  if (!publicKey) return null;
  if (!url.hostname) return null;
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  const projectId = segments.pop();
  // A project id that is not a number is not a project id. Sentry's own ids are numeric, and the
  // failure this refuses is a DSN pasted with the trailing path cut off, which would otherwise POST
  // to `/api//envelope/` forever and be reported as a transport failure rather than a config one.
  if (!projectId || !/^\d+$/.test(projectId)) return null;
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.host,
    path: segments.length ? `/${segments.join('/')}` : '',
    publicKey,
    projectId,
  };
}

/** `https://host/api/42/envelope/` — the ingestion endpoint for envelopes. */
export function envelopeEndpoint(dsn: SentryDsn): string {
  return `${dsn.protocol}://${dsn.host}${dsn.path}/api/${dsn.projectId}/envelope/`;
}

/** The `X-Sentry-Auth` value. No `sentry_secret`: the DSN's secret half is not read. */
export function sentryAuthHeader(dsn: SentryDsn): string {
  return `Sentry sentry_version=${SENTRY_VERSION}, sentry_client=${SENTRY_CLIENT}, sentry_key=${dsn.publicKey}`;
}

/* ------------------------------------------------------------------ the event --- */

export interface StackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
}

export interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: 'javascript';
  level: 'error';
  logger: string;
  /** The build this ran on. `unknown` when nobody passed one — never a plausible-looking guess. */
  release: string;
  environment: string;
  /** The LABELLED route. `/api/projects/:id/ws`, never the path with the project id in it. */
  transaction: string;
  tags: Record<string, string>;
  exception: { values: [{ type: string; value: string; stacktrace?: { frames: StackFrame[] } }] };
  /** Method and labelled path only. No headers, no cookies, no query string, no body. */
  request: { method: string; url: string };
}

/** Why an error is being reported. Each is a different sentence on the Sentry issue. */
export type CaptureKind =
  /** The handler threw and Hono's error handler turned it into a 500. */
  | 'unhandled'
  /** The handler did not throw; it answered 5xx. Invisible to a `catch`, visible to a customer. */
  | 'server_error'
  /** The nightly cron threw. There is no request and nobody is watching. */
  | 'scheduled';

export interface CaptureContext {
  kind: CaptureKind;
  /**
   * ALREADY LABELLED. This module does not call `routeLabel` itself, and that is deliberate: a
   * function that accepts a raw path and promises to label it is one refactor away from a caller
   * that passes a path it forgot to label. The one caller that has a path — `sentryMiddleware` —
   * labels it at the call site, beside the analytics event that labels the same path the same way.
   */
  route: string;
  method: string;
  /** The status the client got, or null when the handler threw before producing one. */
  status: number | null;
  /** Scheme and host, for the `request.url`. The PATH is never taken from here. */
  origin?: string;
}

/**
 * One error, as the event that will be sent — and nothing else.
 *
 * THIS FUNCTION IS THE PRIVACY BOUNDARY, and it is a boundary because of what it does not take
 * rather than what it strips. It is handed an error and a context of five scalar fields. It has no
 * reference to the Request, so there is no request body, no Authorization header, no cookie and no
 * query string within its reach; it has no reference to the authenticated user, so there is no
 * account id and no email address; it has no reference to a session, so there is no prompt and no
 * transcript. A field that is not in `SentryEvent` cannot be populated by editing this function's
 * inputs — somebody would have to widen the type, which is a diff a reviewer sees.
 *
 * Pure: no clock, no crypto, no bindings. The event id and the timestamp come in as arguments so
 * the test can pin the exact bytes that go on the wire.
 */
export function buildEvent(input: {
  error: unknown;
  ctx: CaptureContext;
  eventId: string;
  timestampMs: number;
  release: string;
  environment: string;
}): SentryEvent {
  const { error, ctx } = input;
  const err = error instanceof Error ? error : null;
  const type = err ? err.name || 'Error' : nonErrorType(error);
  const value = err ? err.message : String(error ?? 'an error with no value');
  const frames = parseStack(err?.stack);
  return {
    event_id: input.eventId,
    timestamp: Math.floor(input.timestampMs / 1000),
    platform: 'javascript',
    level: 'error',
    logger: 'worker',
    release: input.release,
    environment: input.environment,
    transaction: ctx.route,
    tags: {
      route: ctx.route,
      method: ctx.method,
      // The STRING 'unknown', not the number 0 and not an omitted tag. A status nobody could read
      // is not a status of zero, and a missing tag on an issue reads as "this never had one".
      status: ctx.status === null ? 'unknown' : String(ctx.status),
      capture: ctx.kind,
      runtime: 'cloudflare-worker',
    },
    exception: {
      values: [
        frames.length
          ? { type, value, stacktrace: { frames } }
          : { type, value },
      ],
    },
    request: {
      method: ctx.method,
      // Origin + LABEL. Never `c.req.url`: that carries the project uuid in the path and whatever
      // the caller put in the query string.
      url: `${ctx.origin ?? 'https://worker.invalid'}${ctx.route}`,
    },
  };
}

/** What to call a thrown thing that is not an Error. Its constructor name, or its typeof. */
function nonErrorType(thrown: unknown): string {
  if (thrown === null) return 'null';
  if (typeof thrown === 'object') {
    const name = (thrown as { constructor?: { name?: unknown } }).constructor?.name;
    return typeof name === 'string' && name ? name : 'Object';
  }
  return typeof thrown;
}

/**
 * V8 stack text as Sentry frames, OLDEST FIRST.
 *
 * Sentry renders the last frame in the array as the innermost one, which is the opposite of the
 * order `Error.stack` writes, so the list is reversed. A stack that cannot be parsed yields an
 * empty array and the event simply carries no stacktrace — an empty `frames: []` would render in
 * the Sentry UI as "this error happened nowhere", which is a failure to observe wearing the
 * costume of an observation.
 */
export function parseStack(stack: unknown): StackFrame[] {
  if (typeof stack !== 'string' || !stack) return [];
  const out: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;
    const body = trimmed.slice(3);
    // `fn (file:line:col)` or bare `file:line:col`
    const withFn = /^(.*?)\s+\((.*)\)$/.exec(body);
    const fn = withFn ? withFn[1] ?? '<anonymous>' : '<anonymous>';
    const loc = withFn ? withFn[2] ?? '' : body;
    const at = /^(.*):(\d+):(\d+)$/.exec(loc);
    out.push({
      filename: at ? (at[1] ?? loc) : loc,
      function: fn,
      ...(at ? { lineno: Number(at[2]), colno: Number(at[3]) } : {}),
    });
    if (out.length >= FRAME_MAX) break;
  }
  return out.reverse();
}

/* ---------------------------------------------------------------- the scrubber --- */

/**
 * Every string in the event, through redaction.ts.
 *
 * DEFENCE IN DEPTH, AND THE DEPTH IS THE POINT. `buildEvent` already cannot see a credential,
 * because it cannot see anything a credential arrives in. This pass covers the other direction:
 * a credential that got into an ERROR MESSAGE somewhere upstream — `Error: upstream refused:
 * {"authorization":"Bearer eyJ…"}` is a shape this codebase has produced — and a field some
 * future edit adds to the event without thinking about it.
 *
 * It walks recursively rather than naming the fields it knows about, for exactly that second
 * reason: a scrubber that lists `exception.values[0].value` by name stops covering the event the
 * moment somebody adds a field, and stops silently.
 *
 * Both classes and both confidences run — this is a log, not an egress gate, so the wide net is
 * the right one. See the header of redaction.ts for why that distinction is a field and not a
 * comment.
 */
export function scrubEvent<T>(value: T): T {
  return scrubValue(value) as T;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return redact(value, { placeholder: 'labelled', max: MESSAGE_MAX }).text;
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubValue(v);
    return out;
  }
  return value;
}

/* ---------------------------------------------------------------- the envelope --- */

/**
 * The three lines Sentry's envelope endpoint expects: envelope header, item header, item payload.
 *
 * `\n`-separated, and the trailing newline after the payload is optional but harmless. The `dsn`
 * on the envelope header lets Relay route without re-reading the auth header; it carries the
 * public key, which is public by construction.
 */
export function serialiseEnvelope(dsn: SentryDsn, event: SentryEvent, sentAtMs: number): string {
  const header = {
    event_id: event.event_id,
    sent_at: new Date(sentAtMs).toISOString(),
    dsn: `${dsn.protocol}://${dsn.publicKey}@${dsn.host}${dsn.path}/${dsn.projectId}`,
  };
  const item = { type: 'event', content_type: 'application/json' };
  return `${JSON.stringify(header)}\n${JSON.stringify(item)}\n${JSON.stringify(event)}\n`;
}

/* ------------------------------------------------------------------ the sender --- */

export type SentryOutcome =
  | { sent: true; eventId: string; status: number }
  /**
   * WHY THIS IS NOT A BOOLEAN. `false` collapses "this deployment has no DSN, which is the
   * configured and expected state" with "Sentry rejected the envelope, which means the monitoring
   * everyone believes is on is off". Those need different reactions from whoever reads them, so
   * they are different values. `no_dsn` is not an error; the other three are.
   */
  | { sent: false; reason: 'no_dsn'; detail?: undefined }
  | { sent: false; reason: 'bad_dsn' | 'transport_failed' | 'refused'; detail: string };

export interface SentryDeps {
  fetch: typeof fetch;
  now: () => number;
  eventId: () => string;
}

const defaultDeps = (): SentryDeps => ({
  fetch: globalThis.fetch.bind(globalThis),
  now: () => Date.now(),
  eventId: () => crypto.randomUUID().replace(/-/g, ''),
});

/**
 * Report one error. TOTAL — this function does not throw and does not reject, ever.
 *
 * That is a hard requirement rather than tidiness. It is called from a `finally` block on the
 * error path of a live request, and its promise is handed to `waitUntil` without an attached
 * catch. A monitoring call that can reject would turn every reported error into a SECOND,
 * unhandled one, and the second one is the one that takes the isolate down.
 */
export async function reportToSentry(
  env: Partial<Env>,
  error: unknown,
  ctx: CaptureContext,
  deps: Partial<SentryDeps> = {},
): Promise<SentryOutcome> {
  const raw = env.SENTRY_DSN;
  // Absent — and absent is the DEFAULT, not a degradation. This is a product that runs fine
  // without monitoring; it is not a product that crashes because monitoring is not configured.
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { sent: false, reason: 'no_dsn' };
  }
  const dsn = parseDsn(raw);
  if (!dsn) {
    // Present and unusable. Named separately because somebody set this on purpose and believes it
    // is working — and the value is NOT echoed into the detail: a mis-pasted DSN is often a
    // mis-pasted something-else.
    return { sent: false, reason: 'bad_dsn', detail: 'SENTRY_DSN is set but is not a usable DSN' };
  }
  const d = { ...defaultDeps(), ...deps };
  try {
    const at = d.now();
    const eventId = d.eventId();
    const event = scrubEvent(
      buildEvent({
        error,
        ctx,
        eventId,
        timestampMs: at,
        release: typeof env.BUILD_SHA === 'string' && env.BUILD_SHA ? env.BUILD_SHA : 'unknown',
        environment: typeof env.ENVIRONMENT === 'string' && env.ENVIRONMENT ? env.ENVIRONMENT : 'unknown',
      }),
    );
    //[[ THE EVENT ID IS RESTAMPED AFTER THE SCRUB, AND THIS IS NOT A CARVE-OUT FOR CONVENIENCE.
    //
    //   A Sentry event id is 32 hex characters, which is precisely the shape of redaction.ts's
    //   `long_hex` rule — "a session id, an HMAC or a raw key". The scrubber is RIGHT to claim it
    //   by its own lights, and the rule is not going to be narrowed to accommodate this file: it
    //   is the rule that catches raw keys with no distinguishing prefix.
    //
    //   So the id is written back over the scrubbed copy rather than exempted from the walk. The
    //   difference matters: exempting a field by name is a hole that stays open for whatever
    //   somebody puts in that field later, while this restores one value the code upstairs just
    //   generated and knows the provenance of. Everything else stays scrubbed.
    //
    //   Found by sentry.test.mjs, which read the envelope's id and got `[redacted:long_hex]` —
    //   an envelope Sentry would have rejected, reported by this function as `sent: true`. ]]
    event.event_id = eventId;
    const res = await d.fetch(envelopeEndpoint(dsn), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': sentryAuthHeader(dsn),
      },
      body: serialiseEnvelope(dsn, event, at),
    });
    if (!res.ok) {
      return { sent: false, reason: 'refused', detail: `Sentry answered ${res.status}` };
    }
    return { sent: true, eventId, status: res.status };
  } catch (e) {
    return { sent: false, reason: 'transport_failed', detail: String((e as Error)?.message ?? e) };
  }
}

/* --------------------------------------------------------------- the middleware --- */

/**
 * The capture point: OUTERMOST, and it RE-THROWS.
 *
 * Registered with `app.use('*')` before every other middleware in index.ts, so it wraps `/api/*`,
 * `/v1/*`, the static handler and the not-found handler alike — the request log in index.ts only
 * covers `/api/*`, so a public-API 500 was invisible even in the table nobody reads.
 *
 * WHY NOT `app.onError`. An error handler REPLACES the response. Hono's default answers
 * `Internal Server Error` with 500, and a dozen suites and every customer depend on exactly that.
 * A middleware that catches, reports and re-throws leaves the response to the same handler that
 * produced it before this file existed, which is why "the error response is unchanged by the
 * presence of Sentry" is a property a test can assert rather than a thing to hope about.
 *
 * ---------------------------------------------------------------------------------------------
 * `c.error` IS THE ERROR. THE `catch` IS THE MINORITY CASE.
 * ---------------------------------------------------------------------------------------------
 * This is the thing about Hono that a middleware written from intuition gets wrong, and it was
 * caught by sentry-live.test.mjs rather than by reading: **an outer middleware does not see an
 * inner one's exception.**
 *
 * `compose()` wraps EVERY dispatch frame in its own try/catch. When the auth middleware throws,
 * the catch in ITS frame — not an outer one — parks the error on `context.error`, calls the error
 * handler, assigns the 500 to `context.res` and returns normally. Every middleware outside it
 * then observes `await next()` RESOLVING, with a 500 sitting in `c.res`.
 *
 * So a middleware that reports only what it catches reports almost nothing. The first version of
 * this file did exactly that, and the live test showed the result: a real `TypeError` with a real
 * stack arrived in Sentry as the string "the handler answered 500 without throwing", with no
 * stack at all. Every production 500 would have been an issue with no cause in it — monitoring
 * that is switched on, sending events, and useless.
 *
 * `compose` does still re-throw one class: a thrown value that is NOT an `instanceof Error`
 * (`throw 'nope'`, `throw {code:1}`) fails its guard and propagates. That is what the catch below
 * is for, and it is why removing either half leaves a hole.
 *
 * THREE SHAPES ARE THEREFORE CAPTURED:
 *   - `c.error` was set — the ordinary unhandled exception, with its real stack (`unhandled`);
 *   - the middleware itself caught something — a non-Error throw (`unhandled`);
 *   - a 5xx with NO error behind it — a handler that chose to answer 500. No `catch` anywhere
 *     sees that one, and it is what a customer actually experiences (`server_error`).
 */
export function sentryMiddleware<E extends { Bindings: Env }>(
  label: (pathname: string) => string,
  deps: Partial<SentryDeps> = {},
): (c: MiniContext<E>, next: () => Promise<void>) => Promise<void> {
  return async (c, next) => {
    let threw: unknown = null;
    try {
      await next();
    } catch (e) {
      threw = e;
      // RE-THROWN IMMEDIATELY. The reporting happens in `finally`, so there is no branch in which
      // an error is observed by this middleware and not by the error handler underneath it.
      throw e;
    } finally {
      const status = threw ? null : (c.res?.status ?? null);
      // `c.error` first: it is the real exception with the real stack, parked there by the compose
      // frame that caught it. `threw` is the non-Error case compose re-threw. A 5xx with neither is
      // a handler that chose to answer 500, and gets a synthetic error saying exactly that.
      const cause = threw ?? c.error ?? null;
      const interesting = cause !== null || (typeof status === 'number' && status >= 500);
      if (interesting) {
        const url = safeUrl(c.req.url);
        const report = reportToSentry(
          c.env,
          cause ?? new Error(`the handler answered ${status} without throwing`),
          {
            kind: cause ? 'unhandled' : 'server_error',
            route: label(url?.pathname ?? '/'),
            method: c.req.method,
            status,
            origin: url?.origin,
          },
          deps,
        );
        try {
          c.executionCtx.waitUntil(report);
        } catch {
          // No execution context — a synthetic request in a test harness. `reportToSentry` is
          // total, so the floating promise cannot reject; it simply finishes unobserved.
        }
      }
    }
  };
}

/** Just enough of Hono's Context to write the middleware against, so tests need no Hono app. */
export interface MiniContext<E extends { Bindings: Env }> {
  env: E['Bindings'];
  req: { url: string; method: string };
  res?: { status: number } | undefined;
  /** Set by `compose` when a frame below this one threw an Error. The real cause and stack. */
  error?: unknown;
  executionCtx: { waitUntil: (p: Promise<unknown>) => void };
}

function safeUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}
