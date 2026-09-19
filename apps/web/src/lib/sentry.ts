// ERROR MONITORING — the browser half.
//
// The crash card in components/error-boundary.tsx used to say, in its own header, "Nothing is
// reported to the server. There is no endpoint for client errors … the console is what exists, so
// the console is what is claimed." That was honest and it was also the whole problem: a React
// render error, a failed dynamic import, a rejected promise in an effect — every one of them
// happened inside somebody else's browser, was written to a console nobody would ever read, and
// left no trace anywhere a maintainer could look.
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS IS AND IS NOT
// ---------------------------------------------------------------------------------------------
// It is a transport: it turns an error into Sentry's documented envelope and POSTs it. It is not
// `@sentry/browser`, and it deliberately does not try to be — no breadcrumbs, no session replay,
// no automatic fetch instrumentation, no user context. Every one of those features works by
// recording things the user did and things the app sent, and in this product the things the user
// did are prompts and the things the app sent carry a Supabase JWT.
//
// THE EVENT IS BUILT FROM A CLOSED ALLOWLIST (see `buildEvent`), which is the structural half of
// the guarantee: this module holds no reference to localStorage, to the auth session, to the
// query string, to the URL fragment or to any request body, so none of them can be sent. Then
// every string in the assembled event is walked through `redactText`, which is the content half:
// a credential or an address that got INTO an error message upstream is removed before send.
//
// ---------------------------------------------------------------------------------------------
// NO DSN IS THE DEFAULT, AND IT IS NOT A DEGRADED MODE
// ---------------------------------------------------------------------------------------------
// `installSentry({})` registers no listeners, sends nothing, throws nothing and returns a client
// that says so by name. A developer running `pnpm dev` with no VITE_SENTRY_DSN gets an app that
// behaves identically to the deployed one, minus the reporting — and, critically, the handlers
// this module installs NEVER call `preventDefault()` on the events they observe, so the browser's
// own uncaught-error reporting (the red console entry, the devtools pause-on-exception) happens
// exactly as it would if this file did not exist. Monitoring that swallows the error it is
// monitoring is worse than no monitoring.
//
// NOTHING HERE READS `import.meta.env`. The DSN arrives as an argument from main.tsx. That keeps
// the module loadable by `node --test` without Vite's define pass — the same reason
// lib/error-taxonomy.ts gives in its own header — and it makes "what happens with no DSN" a thing
// a test can drive directly rather than a thing that depends on a build flag.

export const SENTRY_CLIENT = 'apple-web/1.0';
export const SENTRY_VERSION = 7;

/** Bounds accidental spillage into a message. The prevention is the allowlist; this is the belt. */
export const MESSAGE_MAX = 1000;
export const FRAME_MAX = 40;

/* ------------------------------------------------------------------- the DSN --- */

export interface SentryDsn {
  protocol: string;
  host: string;
  path: string;
  publicKey: string;
  projectId: string;
}

/**
 * A DSN, or null for anything unusable — absent, blank, malformed, or missing its project id.
 *
 * Null rather than a throw, because the one caller is a bootstrap line in main.tsx that runs
 * before React mounts. An exception there is a white screen, and "the monitoring is misconfigured"
 * must never be a worse outcome for the user than "there is no monitoring".
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
  if (!url.username || !url.hostname) return null;
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  const projectId = segments.pop();
  if (!projectId || !/^\d+$/.test(projectId)) return null;
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.host,
    path: segments.length ? `/${segments.join('/')}` : '',
    publicKey: url.username,
    projectId,
  };
}

export function envelopeEndpoint(dsn: SentryDsn): string {
  return `${dsn.protocol}://${dsn.host}${dsn.path}/api/${dsn.projectId}/envelope/`;
}

export function sentryAuthHeader(dsn: SentryDsn): string {
  return `Sentry sentry_version=${SENTRY_VERSION}, sentry_client=${SENTRY_CLIENT}, sentry_key=${dsn.publicKey}`;
}

/* --------------------------------------------------------------- the scrubber --- */

/**
 * WHY THERE IS A SECOND SCANNER IN THIS REPOSITORY.
 *
 * The worker's src/redaction.ts is the real one — seventeen rules, egress-gate duty, its own
 * suite. It cannot be imported here: it is in another workspace package, it imports the worker's
 * `Env`, and dragging it into the browser bundle to redact a log line would be a strange trade.
 *
 * So this is a deliberate SUBSET, restricted to the shapes that can plausibly reach a browser
 * error message, and the drift between the two is not left to good intentions:
 * apps/web/tests/sentry-scrub.test.mjs runs a shared specimen list through BOTH this function and
 * the worker's `redact`, and fails if either one leaves a specimen in the clear. Weaken either
 * table and that test goes red.
 *
 * EVERY PATTERN IS COMPILED FRESH PER CALL, AND NO TEST IN THIS REPOSITORY CAN PROVE IT MATTERS.
 * That is said plainly because the first version of this header claimed otherwise and the first
 * version of the test asserted it — an assertion that passed against a deliberately broken copy,
 * which is the signature of a guard nobody is relying on.
 *
 * The truth: `String.prototype.replace` with a `/g` regex resets `lastIndex` before it starts and
 * after it finishes, so sharing one module-level regex across calls would be perfectly safe HERE.
 * The hazard is real one function over — the worker's `scanText` drives `re.exec` in a loop, where
 * a carried `lastIndex` skips matches on every second call and the observable behaviour is "the
 * second error's token was not redacted". The fresh compile stays so that switching this loop to
 * `exec` (to report WHAT was found, which is the obvious next feature) cannot silently
 * reintroduce that. It costs one regex construction per rule per error.
 */
export interface ScrubRule {
  kind: string;
  pattern: RegExp;
}

export const SCRUB_RULES: readonly ScrubRule[] = [
  // Specific before general: the same ordering rule the worker's table documents, for the same
  // reason — `long_hex` would otherwise claim the tail of a pairing token and leave its head.
  { kind: 'private_key_block', pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED |)?PRIVATE KEY-----(?:[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED |)?PRIVATE KEY-----|[A-Za-z0-9+/=\s:,.-]*)/g },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g },
  { kind: 'apple_api_key', pattern: /\bgk_(?:live|test)_[0-9a-f]{24}_[0-9a-f]{48}\b/g },
  { kind: 'pairing_token', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{48}\b/gi },
  { kind: 'anthropic_key', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { kind: 'openai_key', pattern: /\bsk-[A-Za-z0-9_-]{12,}/g },
  { kind: 'github_token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { kind: 'aws_access_key_id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'google_api_key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'slack_token', pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}/g },
  { kind: 'bearer_credential', pattern: /\bauthorization\s*[:=]\s*(?:bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi },
  { kind: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}\b/g },
  { kind: 'long_hex', pattern: /\b[A-Fa-f0-9]{32,}\b/g },
];

/**
 * The text with every known credential and person shape replaced by a labelled marker.
 *
 * TOTAL over its input, like the worker's `textOf`. Handed an object it stringifies rather than
 * returning it untouched: a scrubber that answers "nothing to redact" for every non-string has
 * told the caller the payload is clean without having looked at it, and the objects are where the
 * credentials are.
 *
 * Truncation happens AFTER redaction. Cutting first would leave the tail of a secret behind.
 */
export function redactText(input: unknown, max = MESSAGE_MAX): string {
  let text = textOf(input);
  if (!text) return '';
  for (const rule of SCRUB_RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    text = text.replace(re, `[redacted:${rule.kind}]`);
  }
  return text.length > max ? text.slice(0, max) : text;
}

function textOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '';
  if (input instanceof Error) return `${input.name}: ${input.message}`;
  if (typeof input === 'object') {
    try {
      const json = JSON.stringify(input);
      return typeof json === 'string' ? json : String(input);
    } catch {
      return String(input);
    }
  }
  return String(input);
}

/**
 * Every string in the event, scrubbed, recursively.
 *
 * Recursive rather than field-by-field on purpose: a scrubber that names `exception.values[0]
 * .value` stops covering the event the moment somebody adds a field, and stops silently.
 */
export function scrubEvent<T>(value: T): T {
  return scrubValue(value) as T;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubValue(v);
    return out;
  }
  return value;
}

/* ------------------------------------------------------------------ the route --- */

/**
 * `/projects/8f1c…-…/files` → `/projects/:id/files`.
 *
 * The twin of the worker's `analytics.routeLabel`, and it exists for the same reason: the SPA's
 * own paths carry project uuids, and a transaction name with a customer's project id in it turns
 * a list of issues into a list of who was using the product when it broke.
 *
 * apps/web/tests/sentry-scrub.test.mjs drives this and the worker's `routeLabel` over the same
 * paths and requires the same answer, so the two cannot quietly disagree about what an id is.
 */
export function routeLabel(pathname: unknown): string {
  if (typeof pathname !== 'string' || !pathname) return 'unknown';
  const raw = pathname.slice(0, 200);
  const label = raw
    .split('/')
    .map((seg) => (seg && looksLikeId(seg) ? ':id' : seg))
    .join('/');
  return label.length > 120 ? label.slice(0, 120) : label;
}

function looksLikeId(seg: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true;
  if (/^\d+$/.test(seg)) return true;
  if (/^[A-Fa-f0-9]{16,}$/.test(seg)) return true;
  return seg.length > 40;
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
  release: string;
  environment: string;
  transaction: string;
  tags: Record<string, string>;
  exception: { values: [{ type: string; value: string; stacktrace?: { frames: StackFrame[] } }] };
  /** Origin and LABELLED path. Never `location.href`: that carries the query and the fragment. */
  request: { url: string };
}

/** Where the error was observed. Each is a different question when an issue comes in. */
export type CaptureKind =
  /** `window.onerror` — a script error that reached the top. */
  | 'window_error'
  /** `unhandledrejection` — a promise nobody caught. */
  | 'unhandled_rejection'
  /** React's `componentDidCatch` — a render threw and the crash card is on screen. */
  | 'react_boundary';

export interface CaptureContext {
  kind: CaptureKind;
  /** Already labelled. The callers label at the call site; this module never sees a raw path. */
  route: string;
  origin: string;
  /** `app` or `route`, from the boundary that caught it. Absent for the global handlers. */
  scope?: string | undefined;
}

/**
 * THE PRIVACY BOUNDARY, and it is a boundary because of what it cannot reach.
 *
 * Handed an error, three scalars, an id and a clock. No `window`, no `document`, no
 * `localStorage`, no auth session, no `location.search`, no `location.hash`, no fetch body. There
 * is therefore no edit to this function's ARGUMENTS that puts a JWT, an email address or a prompt
 * into the event; somebody would have to widen `SentryEvent` itself, which is a diff a reviewer
 * sees rather than a default nobody notices.
 *
 * Pure, so the test can pin the exact bytes that go on the wire.
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
    logger: 'web',
    release: input.release,
    environment: input.environment,
    transaction: ctx.route,
    tags: {
      route: ctx.route,
      capture: ctx.kind,
      runtime: 'browser',
      ...(ctx.scope ? { boundary: ctx.scope } : {}),
    },
    exception: {
      values: [frames.length ? { type, value, stacktrace: { frames } } : { type, value }],
    },
    request: { url: `${ctx.origin}${ctx.route}` },
  };
}

function nonErrorType(thrown: unknown): string {
  if (thrown === null) return 'null';
  if (typeof thrown === 'object') {
    const name = (thrown as { constructor?: { name?: unknown } }).constructor?.name;
    return typeof name === 'string' && name ? name : 'Object';
  }
  return typeof thrown;
}

/**
 * V8 stack text as Sentry frames, oldest first.
 *
 * An unparseable stack yields `[]` and the event carries no `stacktrace` at all — `frames: []`
 * renders in Sentry as "this happened nowhere", which is a failure to observe dressed as an
 * observation.
 */
export function parseStack(stack: unknown): StackFrame[] {
  if (typeof stack !== 'string' || !stack) return [];
  const out: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;
    const body = trimmed.slice(3);
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

export function serialiseEnvelope(dsn: SentryDsn, event: SentryEvent, sentAtMs: number): string {
  const header = {
    event_id: event.event_id,
    sent_at: new Date(sentAtMs).toISOString(),
    dsn: `${dsn.protocol}://${dsn.publicKey}@${dsn.host}${dsn.path}/${dsn.projectId}`,
  };
  const item = { type: 'event', content_type: 'application/json' };
  return `${JSON.stringify(header)}\n${JSON.stringify(item)}\n${JSON.stringify(event)}\n`;
}

/* ----------------------------------------------------------------- the client --- */

export type SentryOutcome =
  | { sent: true; eventId: string }
  /**
   * Four refusals, not one `false`. "No DSN is configured here" is the expected state of a dev
   * machine; "Sentry refused the envelope" means the monitoring everyone believes is running is
   * not. A caller that cannot tell them apart will report the second as the first.
   */
  | { sent: false; reason: 'not_installed' | 'no_dsn' }
  | { sent: false; reason: 'bad_dsn' | 'transport_failed'; detail: string };

export interface SentryConfig {
  dsn?: string | undefined;
  /** The build this bundle came from. `unknown` when nobody passed one — never a fake. */
  release?: string | undefined;
  environment?: string | undefined;
}

export interface SentryDeps {
  now: () => number;
  eventId: () => string;
  /** The transport. Injected so the test can read the exact envelope instead of a network log. */
  send: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;
  /** Where the global handlers are registered. `window` in the browser. */
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  /** Read for the origin and the path at capture time. */
  location: { origin: string; pathname: string } | null;
}

export interface SentryClient {
  installed: boolean;
  /** Why not, when `installed` is false. Absent when it is true. */
  reason?: 'no_dsn' | 'bad_dsn' | 'no_target';
  captureException(error: unknown, ctx?: { kind?: CaptureKind; scope?: string }): Promise<SentryOutcome>;
  uninstall(): void;
}

/**
 * The installed client, or null.
 *
 * A module-level singleton exists for exactly one caller: `components/error-boundary.tsx`, which
 * is a class component several providers deep and cannot be handed a client through props without
 * threading it through every surface that renders a boundary. Everything else takes the client
 * `installSentry` returns.
 */
let active: SentryClient | null = null;

/**
 * Report an error from anywhere, whether or not monitoring is installed.
 *
 * NEVER THROWS AND NEVER SWALLOWS. With nothing installed it answers `not_installed` and the
 * caller carries on doing what it was already doing — the crash card still renders, the console
 * entry is still written. Reporting is an addition to the existing handling of an error, never a
 * replacement for it.
 */
export function captureException(error: unknown, ctx?: { kind?: CaptureKind; scope?: string }): Promise<SentryOutcome> {
  if (!active) return Promise.resolve({ sent: false, reason: 'not_installed' });
  return active.captureException(error, ctx);
}

const browserDeps = (): SentryDeps => ({
  now: () => Date.now(),
  eventId: () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(32, '0').slice(0, 32),
  send: async (url, init) => {
    const res = await fetch(url, { ...init, keepalive: true, mode: 'cors' });
    return { ok: res.ok, status: res.status };
  },
  target: typeof window === 'undefined' ? null : window,
  location: typeof window === 'undefined'
    ? null
    : {
        get origin() { return window.location.origin; },
        get pathname() { return window.location.pathname; },
      },
});

/**
 * Install the global handlers and return a client.
 *
 * WHAT IS CAPTURED:
 *   - `error` on the window — a script error that reached the top, including one React re-threw.
 *   - `unhandledrejection` — a promise nobody caught, which is the majority of this app's failure
 *     surface: every query, mutation and websocket handler is a promise.
 *   - whatever calls `captureException`, which is the React boundary.
 *
 * WHAT IS NOT, DELIBERATELY: `console.error`, network failures, and user interactions. Each is a
 * stream of things people typed and things the app sent, and neither belongs in an error tracker
 * for this product.
 *
 * NEITHER HANDLER CALLS `preventDefault()`. That is the difference between observing an error and
 * eating it: with `preventDefault` the browser stops reporting the error itself, devtools stops
 * pausing on it, and every developer downstream loses the console entry they were relying on in
 * exchange for a dashboard they may not have open.
 */
export function installSentry(config: SentryConfig, overrides: Partial<SentryDeps> = {}): SentryClient {
  const deps: SentryDeps = { ...browserDeps(), ...overrides };
  const release = config.release && config.release.trim() ? config.release : 'unknown';
  const environment = config.environment && config.environment.trim() ? config.environment : 'unknown';

  const disabled = (reason: 'no_dsn' | 'bad_dsn' | 'no_target'): SentryClient => {
    const client: SentryClient = {
      installed: false,
      reason,
      captureException: () =>
        Promise.resolve(reason === 'no_dsn' ? { sent: false, reason: 'no_dsn' } : { sent: false, reason: 'bad_dsn', detail: `monitoring is not installed (${reason})` }),
      uninstall: () => {
        if (active === client) active = null;
      },
    };
    active = client;
    return client;
  };

  const raw = config.dsn;
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return disabled('no_dsn');
  const dsn = parseDsn(raw);
  if (!dsn) return disabled('bad_dsn');
  if (!deps.target) return disabled('no_target');

  const capture = async (error: unknown, ctx?: { kind?: CaptureKind; scope?: string }): Promise<SentryOutcome> => {
    try {
      const at = deps.now();
      const here = deps.location ?? { origin: 'https://app.invalid', pathname: '/' };
      const eventId = deps.eventId();
      const event = scrubEvent(
        buildEvent({
          error,
          ctx: {
            kind: ctx?.kind ?? 'react_boundary',
            route: routeLabel(here.pathname),
            origin: here.origin,
            scope: ctx?.scope,
          },
          eventId,
          timestampMs: at,
          release,
          environment,
        }),
      );
      //[[ RESTAMPED AFTER THE SCRUB, for the reason the worker's copy documents at length: a
      //   Sentry event id is 32 hex characters, which is exactly the `long_hex` shape, and the
      //   scrubber is right to claim it. Writing the known value back is safer than exempting the
      //   field by name — an exemption stays open for whatever ends up in that field later. ]]
      event.event_id = eventId;
      const res = await deps.send(envelopeEndpoint(dsn), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': sentryAuthHeader(dsn),
        },
        body: serialiseEnvelope(dsn, event, at),
      });
      if (!res.ok) return { sent: false, reason: 'transport_failed', detail: `Sentry answered ${res.status}` };
      return { sent: true, eventId };
    } catch (e) {
      // Total, like the worker's. This runs inside a window `error` handler; a throw here would
      // raise a second error from the handler for the first one.
      return { sent: false, reason: 'transport_failed', detail: String((e as Error)?.message ?? e) };
    }
  };

  const onError = (e: Event) => {
    const err = (e as ErrorEvent).error ?? (e as ErrorEvent).message ?? 'an error with no value';
    void capture(err, { kind: 'window_error' });
    // No preventDefault. See the header above.
  };
  const onRejection = (e: Event) => {
    void capture((e as PromiseRejectionEvent).reason, { kind: 'unhandled_rejection' });
  };

  deps.target.addEventListener('error', onError);
  deps.target.addEventListener('unhandledrejection', onRejection);

  const client: SentryClient = {
    installed: true,
    captureException: capture,
    uninstall: () => {
      deps.target?.removeEventListener('error', onError);
      deps.target?.removeEventListener('unhandledrejection', onRejection);
      if (active === client) active = null;
    },
  };
  active = client;
  return client;
}
