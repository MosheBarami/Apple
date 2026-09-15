// The public HTTP surface: `/v1/*`. Route table, OpenAI-compatible translation, SSE framing, and
// the headers every public response carries.
//
// WHAT LIVES HERE AND WHY. index.ts owns bindings — Durable Objects, KV, D1, the AI gateway — and
// nothing in this file touches any of them. Everything here is a pure function of its arguments,
// which is the only way the interesting cases can be tested at all: a malformed OpenAI request, a
// model id that names a foundation model, an expired idempotency record, a run that ends in error.
// Those are inputs a test supplies, not states a test has to arrange in a database.
//
// THE ROUTE TABLE IS THE SINGLE SOURCE OF TRUTH. `PUBLIC_ROUTES` decides three things at once:
// which paths exist, which scope each demands, and what `/v1/openapi.json` publishes. One table,
// so the published schema cannot describe a route that is not there and a route cannot exist
// without a declared scope. A path Hono serves but this table omits is answered 404 by the
// middleware — an undeclared route is unreachable rather than unguarded.
import type { GatewayMessage, GatewayResponse } from '@golem/shared';
import type { ApiScope } from './api-keys';

// ---------------------------------------------------------------------------
// versioning
// ---------------------------------------------------------------------------

/**
 * Dated API versions, newest last. A client pins one with `Golem-Version: 2026-09-15`.
 *
 * Dates rather than `v2`, for the same reason Stripe uses them: the URL prefix `/v1` is the
 * COMPATIBILITY promise ("your code keeps working"), and the date is the CHANGE ledger ("this is
 * the shape you were written against"). Bumping a major version for every additive change trains
 * everybody to ignore it.
 */
export const API_VERSIONS = ['2026-09-15'] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];
export const CURRENT_API_VERSION: ApiVersion = API_VERSIONS[API_VERSIONS.length - 1]!;
export const API_VERSION_HEADER = 'Golem-Version';

export type VersionVerdict = { ok: true; version: ApiVersion } | { ok: false; requested: string };

/**
 * Resolve the pinned version.
 *
 * An UNKNOWN version is refused, never quietly served as the current one. Silently upgrading a
 * client that asked for a version we do not have is how a caller ends up parsing a shape nobody
 * promised them — and it makes the header decorative, since it would then have no failure mode.
 */
export function resolveApiVersion(raw: string | null | undefined): VersionVerdict {
  if (raw === null || raw === undefined || raw.trim() === '') return { ok: true, version: CURRENT_API_VERSION };
  const want = raw.trim();
  const hit = API_VERSIONS.find((v) => v === want);
  return hit ? { ok: true, version: hit } : { ok: false, requested: want.slice(0, 40) };
}

// ---------------------------------------------------------------------------
// route table
// ---------------------------------------------------------------------------

export interface Deprecation {
  /** RFC 8594 sunset instant, epoch ms. After this the route may be removed. */
  sunsetAt: number;
  /** The path that replaces it, published in a `Link: …; rel="successor-version"`. */
  successor: string;
  note: string;
}

export interface PublicRoute {
  method: 'GET' | 'POST';
  /** Hono-style path with `:param` segments. */
  path: string;
  /**
   * The scope a key must hold. `null` means "any valid key" and is spelled explicitly so that a
   * route which merely forgot to declare one cannot read as a route that needs none.
   */
  scope: ApiScope | null;
  summary: string;
  /** POST routes that honour `Idempotency-Key`. */
  idempotent?: true;
  /** GET routes that answer with `text/event-stream`. */
  sse?: true;
  deprecated?: Deprecation;
}

/** 2027-09-15: one year of overlap, the shortest window a dependent build system can absorb. */
const COMPLETIONS_SUNSET = Date.UTC(2027, 8, 15);

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { method: 'GET', path: '/v1', scope: null, summary: 'Discovery document: versions, routes and the scopes they need.' },
  { method: 'GET', path: '/v1/openapi.json', scope: null, summary: 'OpenAPI 3.1 description of this API.' },
  { method: 'GET', path: '/v1/models', scope: null, summary: 'Models this API will accept in a completion request.' },
  { method: 'POST', path: '/v1/chat/completions', scope: 'chat:write', summary: 'Create a chat completion. OpenAI-compatible; set `stream` for SSE.', idempotent: true },
  {
    method: 'POST',
    path: '/v1/completions',
    scope: 'chat:write',
    summary: 'Legacy text completion. Deprecated: use /v1/chat/completions.',
    idempotent: true,
    deprecated: {
      sunsetAt: COMPLETIONS_SUNSET,
      successor: '/v1/chat/completions',
      note: 'A prompt string cannot carry a system instruction or a conversation, so every caller ends up rebuilding chat badly. Use /v1/chat/completions.',
    },
  },
  { method: 'GET', path: '/v1/projects', scope: 'projects:read', summary: 'Projects this key was granted at mint time.' },
  { method: 'GET', path: '/v1/projects/:id', scope: 'projects:read', summary: 'One project: name, agent status, Studio connection.' },
  { method: 'GET', path: '/v1/projects/:id/messages', scope: 'messages:read', summary: 'Transcript, newest-last, paginated with `before` and `limit`.' },
  { method: 'POST', path: '/v1/projects/:id/runs', scope: 'runs:write', summary: 'Start an agent run from a text instruction.', idempotent: true },
  { method: 'GET', path: '/v1/projects/:id/runs/current', scope: 'runs:read', summary: 'The run in flight, or null when idle.' },
  { method: 'GET', path: '/v1/projects/:id/events', scope: 'events:read', summary: 'Server-sent event stream of run and Studio state changes.', sse: true },
];

export interface RouteMatch {
  route: PublicRoute;
  params: Record<string, string>;
}

/**
 * Find the table entry for a request.
 *
 * Returns undefined for anything the table does not describe, and the middleware turns that into a
 * 404. That direction matters: the failure mode of a routing guard must be "unreachable", never
 * "unguarded". A new `/v1/…` route added to index.ts and not added here is dead on arrival, which
 * is loud; the reverse — reachable with no scope check — would be silent.
 */
export function matchRoute(method: string, pathname: string): RouteMatch | undefined {
  const want = method.toUpperCase();
  // A trailing slash is the same resource; anything else is compared literally.
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const segs = path.split('/');
  for (const route of PUBLIC_ROUTES) {
    if (route.method !== want) continue;
    const rsegs = route.path.split('/');
    if (rsegs.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rsegs.length; i += 1) {
      const r = rsegs[i]!;
      const s = segs[i]!;
      if (r.startsWith(':')) {
        if (s === '') {
          ok = false;
          break;
        }
        params[r.slice(1)] = s;
      } else if (r !== s) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// public model ids
// ---------------------------------------------------------------------------

/**
 * The model ids this API accepts, and the internal gateway key each maps onto.
 *
 * PROVIDER IDENTITY IS NOT PUBLISHED HERE, deliberately and per the product manifest: a caller
 * names a Golem capability, not a foundation model. Accepting `gpt-4o` as an alias would be a
 * lie about what ran, and accepting it as a NO-OP alias for our own model is the worse version of
 * the same lie. Unknown ids — including every real provider id — are refused by name.
 */
export const PUBLIC_MODELS: Record<string, { internal: string; description: string }> = {
  'golem-chat': { internal: 'stone', description: 'The builder. Answers, explains and writes Roblox code.' },
  'golem-plan': { internal: 'clay', description: 'The planner. Reasons about a place without proposing edits to it.' },
};

export function publicModelList(createdAt: number): Record<string, unknown> {
  return {
    object: 'list',
    data: Object.entries(PUBLIC_MODELS).map(([id, m]) => ({
      id,
      object: 'model',
      created: Math.floor(createdAt / 1000),
      owned_by: 'golem',
      description: m.description,
    })),
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible request translation
// ---------------------------------------------------------------------------

export interface RequestFault {
  status: 400 | 404 | 413 | 422;
  code: string;
  message: string;
  param: string | null;
}
export type Parsed<T> = { ok: true; value: T } | { ok: false; fault: RequestFault };

export interface ChatCompletionRequest {
  publicModel: string;
  internalModel: string;
  messages: GatewayMessage[];
  maxTokens: number;
  temperature: number | undefined;
  stream: boolean;
  includeUsage: boolean;
  /** Present only for the legacy /v1/completions shape, which echoes `text` instead of a message. */
  legacy: boolean;
}

const MAX_MESSAGES = 200;
const MAX_TOTAL_CHARS = 60_000;
const MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_OUTPUT_TOKENS = 1024;

const fault = (status: RequestFault['status'], code: string, message: string, param: string | null = null): { ok: false; fault: RequestFault } => ({
  ok: false,
  fault: { status, code, message, param },
});

/**
 * A number field from an untrusted body.
 *
 * `??` defends undefined and null only. `max_tokens: "8"`, `max_tokens: NaN` and
 * `max_tokens: Infinity` all survive a `??` and then every `>` comparison against them is false,
 * so a ceiling written as `Math.min(x, LIMIT)` silently becomes NaN and the ceiling is gone. This
 * demands an actual finite number in range or it refuses.
 */
function finiteInRange(v: unknown, lo: number, hi: number, field: string, integer: boolean): Parsed<number | undefined> {
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return fault(400, 'invalid_request_error', `'${field}' must be a finite number.`, field);
  }
  if (integer && !Number.isInteger(v)) {
    return fault(400, 'invalid_request_error', `'${field}' must be an integer.`, field);
  }
  if (v < lo || v > hi) {
    return fault(400, 'invalid_request_error', `'${field}' must be between ${lo} and ${hi}.`, field);
  }
  return { ok: true, value: v };
}

function flattenContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const p of content) {
    if (!p || typeof p !== 'object') return null;
    const { type, text } = p as { type?: unknown; text?: unknown };
    // Images are not accepted on this surface: the vision path is metered and prompted very
    // differently, and quietly dropping an image part would answer a question the caller did not
    // ask while charging them for it.
    if (type !== 'text' || typeof text !== 'string') return null;
    parts.push(text);
  }
  return parts.join('\n');
}

const PUBLIC_ROLES = ['system', 'user', 'assistant'] as const;

export function parseChatCompletionRequest(body: unknown): Parsed<ChatCompletionRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fault(400, 'invalid_request_error', 'The request body must be a JSON object.');
  }
  const b = body as Record<string, unknown>;

  if (b.tools !== undefined || b.functions !== undefined || b.tool_choice !== undefined) {
    return fault(
      400,
      'tools_not_supported',
      'This API does not expose the agent tool surface. Start a run with POST /v1/projects/{id}/runs to have Golem act on a place.',
      'tools',
    );
  }
  const n = finiteInRange(b.n, 1, 1, 'n', true);
  if (!n.ok) return n;

  if (typeof b.model !== 'string' || b.model === '') {
    return fault(400, 'invalid_request_error', "'model' is required.", 'model');
  }
  // `Object.hasOwn` and not a bare index: `PUBLIC_MODELS['constructor']` inherits a truthy value
  // from Object.prototype, so a caller asking for the model named `constructor` — or `__proto__`,
  // or `toString` — would pass this check and then be routed to the internal model key
  // `undefined`. A Record<string, T> is a lookup table with a prototype attached, and the
  // prototype is reachable from the request body.
  const model = Object.hasOwn(PUBLIC_MODELS, b.model) ? PUBLIC_MODELS[b.model] : undefined;
  if (!model) {
    return fault(
      404,
      'model_not_found',
      `Unknown model '${b.model.slice(0, 60)}'. This API serves ${Object.keys(PUBLIC_MODELS).join(', ')} — it does not proxy foundation models.`,
      'model',
    );
  }

  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return fault(400, 'invalid_request_error', "'messages' must be a non-empty array.", 'messages');
  }
  if (b.messages.length > MAX_MESSAGES) {
    return fault(413, 'request_too_large', `At most ${MAX_MESSAGES} messages.`, 'messages');
  }
  const messages: GatewayMessage[] = [];
  let chars = 0;
  for (let i = 0; i < b.messages.length; i += 1) {
    const raw = b.messages[i];
    if (!raw || typeof raw !== 'object') {
      return fault(400, 'invalid_request_error', `messages[${i}] must be an object.`, 'messages');
    }
    const { role, content } = raw as { role?: unknown; content?: unknown };
    const hit = PUBLIC_ROLES.find((r) => r === role);
    if (!hit) {
      return fault(
        400,
        'invalid_request_error',
        `messages[${i}].role must be one of ${PUBLIC_ROLES.join(', ')}.`,
        'messages',
      );
    }
    const text = flattenContent(content);
    if (text === null) {
      return fault(400, 'invalid_request_error', `messages[${i}].content must be a string or an array of text parts.`, 'messages');
    }
    chars += text.length;
    if (chars > MAX_TOTAL_CHARS) {
      return fault(413, 'request_too_large', `The conversation exceeds ${MAX_TOTAL_CHARS} characters.`, 'messages');
    }
    messages.push({ role: hit, content: text });
  }

  const maxTokens = finiteInRange(b.max_completion_tokens ?? b.max_tokens, 1, MAX_OUTPUT_TOKENS, 'max_tokens', true);
  if (!maxTokens.ok) return maxTokens;
  const temperature = finiteInRange(b.temperature, 0, 2, 'temperature', false);
  if (!temperature.ok) return temperature;

  if (b.stream !== undefined && typeof b.stream !== 'boolean') {
    return fault(400, 'invalid_request_error', "'stream' must be a boolean.", 'stream');
  }
  const so = b.stream_options;
  if (so !== undefined && (so === null || typeof so !== 'object')) {
    return fault(400, 'invalid_request_error', "'stream_options' must be an object.", 'stream_options');
  }

  return {
    ok: true,
    value: {
      publicModel: b.model,
      internalModel: model.internal,
      messages,
      maxTokens: maxTokens.value ?? DEFAULT_OUTPUT_TOKENS,
      temperature: temperature.value,
      stream: b.stream === true,
      includeUsage: !!(so && (so as { include_usage?: unknown }).include_usage === true),
      legacy: false,
    },
  };
}

/**
 * The legacy `/v1/completions` shape, mapped onto the chat parser rather than validated twice.
 *
 * Two validators for one set of limits is how the deprecated route ends up with a different — and
 * always laxer — idea of what `max_tokens` may be.
 */
export function parseLegacyCompletionRequest(body: unknown): Parsed<ChatCompletionRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fault(400, 'invalid_request_error', 'The request body must be a JSON object.');
  }
  const b = body as Record<string, unknown>;
  if (typeof b.prompt !== 'string' || b.prompt === '') {
    return fault(400, 'invalid_request_error', "'prompt' is required and must be a non-empty string.", 'prompt');
  }
  const { prompt, ...rest } = b;
  const parsed = parseChatCompletionRequest({ ...rest, messages: [{ role: 'user', content: prompt }] });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { ...parsed.value, legacy: true } };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible response translation
// ---------------------------------------------------------------------------

export type OpenAiFinish = 'stop' | 'length' | 'content_filter';

/**
 * Map the gateway's finish reason onto OpenAI's.
 *
 * `error` is NOT in the return type, and that is the point. The gateway reports `error` when the
 * model call did not produce a completion; rendering that as `finish_reason: "stop"` would hand a
 * caller an empty assistant turn that looks exactly like a model choosing to say nothing. A
 * failure to complete must not render as a completion — so this returns null and the route answers
 * with an error status instead of a choice.
 */
export function openAiFinishReason(r: GatewayResponse['finishReason']): OpenAiFinish | null {
  switch (r) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      // Tools are not exposed on this surface, so a tool-call finish means the model tried to do
      // something this endpoint cannot represent. Truncating it to `stop` would publish a partial
      // answer as a whole one.
      return null;
    case 'error':
      return null;
    default:
      return null;
  }
}

export interface CompletionMeta {
  id: string;
  model: string;
  createdAtMs: number;
  /** `sandbox` when the answer came from the test-mode sandbox rather than from a model. */
  fingerprint: string;
}

function usageBlock(resp: GatewayResponse) {
  const input = Math.max(0, Math.trunc(resp.usage.inputTokens));
  const output = Math.max(0, Math.trunc(resp.usage.outputTokens));
  return { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
}

export function chatCompletionBody(resp: GatewayResponse, meta: CompletionMeta, finish: OpenAiFinish): Record<string, unknown> {
  return {
    id: meta.id,
    object: 'chat.completion',
    created: Math.floor(meta.createdAtMs / 1000),
    model: meta.model,
    system_fingerprint: meta.fingerprint,
    choices: [{ index: 0, message: { role: 'assistant', content: resp.text }, logprobs: null, finish_reason: finish }],
    usage: usageBlock(resp),
  };
}

export function legacyCompletionBody(resp: GatewayResponse, meta: CompletionMeta, finish: OpenAiFinish): Record<string, unknown> {
  return {
    id: meta.id,
    object: 'text_completion',
    created: Math.floor(meta.createdAtMs / 1000),
    model: meta.model,
    system_fingerprint: meta.fingerprint,
    choices: [{ index: 0, text: resp.text, logprobs: null, finish_reason: finish }],
    usage: usageBlock(resp),
  };
}

/**
 * The chunk sequence for a streamed completion.
 *
 * HONEST ABOUT WHAT STREAMS. The gateway returns a whole response — the Workers AI binding this
 * worker runs on is invoked non-incrementally — so the CONTENT arrives in one delta. What is real
 * here is the protocol: a role frame, a content frame, a terminating frame carrying
 * `finish_reason`, and `[DONE]`, in the order and the object shapes an OpenAI streaming client
 * parses. A caller's streaming code works unchanged; it simply receives the text in one piece.
 * Splitting the finished text into fake token-sized deltas would be the alternative, and that is a
 * simulation of progress that never happened.
 */
export function chatCompletionChunks(
  resp: GatewayResponse,
  meta: CompletionMeta,
  finish: OpenAiFinish,
  includeUsage: boolean,
): Record<string, unknown>[] {
  const created = Math.floor(meta.createdAtMs / 1000);
  const base = { id: meta.id, object: 'chat.completion.chunk', created, model: meta.model, system_fingerprint: meta.fingerprint };
  const chunks: Record<string, unknown>[] = [
    { ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] },
  ];
  if (resp.text !== '') {
    chunks.push({ ...base, choices: [{ index: 0, delta: { content: resp.text }, finish_reason: null }] });
  }
  chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: finish }] });
  if (includeUsage) chunks.push({ ...base, choices: [], usage: usageBlock(resp) });
  return chunks;
}

// ---------------------------------------------------------------------------
// server-sent events
// ---------------------------------------------------------------------------

/** One SSE frame. `data` is serialised here so a newline inside it cannot split the frame. */
export function sseFrame(data: unknown, opts: { event?: string; id?: string } = {}): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  let out = '';
  if (opts.id) out += `id: ${opts.id}\n`;
  if (opts.event) out += `event: ${opts.event}\n`;
  // A multi-line payload needs one `data:` line per line, or everything after the first newline is
  // a new field name as far as the EventSource parser is concerned.
  for (const line of payload.split('\n')) out += `data: ${line}\n`;
  return `${out}\n`;
}

/** A comment frame. Keeps an idle connection alive through proxies without being an event. */
export function sseHeartbeat(now: number): string {
  return `: heartbeat ${now}\n\n`;
}

export const SSE_DONE = 'data: [DONE]\n\n';

export interface ProjectSnapshot {
  agentStatus: string;
  messages: number;
  pluginConnected: boolean;
}

export interface ProjectEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * What changed between two polls of a project's session.
 *
 * Pure, so the event stream's behaviour at a run's END — the case that decides whether a client
 * hangs forever — is testable without a Durable Object or a clock.
 *
 * `prev === null` is the first poll and emits the whole state, because a client that connects
 * mid-run must not have to wait for the next transition to learn there is one.
 */
export function projectEvents(prev: ProjectSnapshot | null, next: ProjectSnapshot): ProjectEvent[] {
  if (prev === null) return [{ event: 'state', data: { ...next } }];
  const out: ProjectEvent[] = [];
  if (prev.agentStatus !== next.agentStatus) {
    out.push({ event: 'run.status', data: { from: prev.agentStatus, to: next.agentStatus } });
  }
  if (next.messages > prev.messages) {
    out.push({ event: 'messages', data: { count: next.messages, added: next.messages - prev.messages } });
  }
  if (prev.pluginConnected !== next.pluginConnected) {
    out.push({ event: 'studio', data: { connected: next.pluginConnected } });
  }
  return out;
}

/**
 * Should the stream close?
 *
 * A run that has finished is the reason a caller opened the stream, so the stream ends with it —
 * holding the connection open afterwards costs a worker subrequest slot for nothing and teaches
 * clients to rely on a timeout instead of an end-of-stream. A stream opened while already idle
 * stays open (the caller is waiting for a run to START).
 */
export function streamShouldClose(prev: ProjectSnapshot | null, next: ProjectSnapshot): boolean {
  if (prev === null) return false;
  return prev.agentStatus === 'running' && next.agentStatus !== 'running';
}

// ---------------------------------------------------------------------------
// headers
// ---------------------------------------------------------------------------

export const REQUEST_ID_HEADER = 'X-Request-Id';
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Adopt a caller's request id, or refuse it.
 *
 * The value is echoed into response headers and error bodies, so an unchecked one is a header
 * injection (a CR or LF would end the header and start another) and a log-forging primitive. The
 * allowlist is characters, not a denylist of the two that are dangerous today.
 */
export function sanitizeRequestId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return REQUEST_ID_RE.test(t) ? t : null;
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '')}`;
}

export interface RateLimitVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** epoch seconds at which the window rolls over */
  resetAt: number;
  retryAfter: number;
}

export interface RateBucket {
  n: number;
  startedAt: number;
}

/**
 * Fixed-window counter over a caller-supplied map.
 *
 * The map and the clock are ARGUMENTS. The per-isolate limiter in index.ts reads a wall clock and
 * cannot be rewound, so every interesting case — the request that crosses the limit, the one that
 * arrives after the window rolls — would be untestable if the state lived inside this function.
 */
export function rateLimitCheck(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitVerdict {
  const b = buckets.get(key);
  const fresh = !b || now - b.startedAt >= windowMs;
  const bucket = fresh ? { n: 0, startedAt: now } : b!;
  bucket.n += 1;
  buckets.set(key, bucket);
  const resetMs = bucket.startedAt + windowMs;
  const allowed = bucket.n <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - bucket.n),
    resetAt: Math.ceil(resetMs / 1000),
    retryAfter: Math.max(1, Math.ceil((resetMs - now) / 1000)),
  };
}

export function rateLimitHeaders(v: RateLimitVerdict): Record<string, string> {
  const h: Record<string, string> = {
    'X-RateLimit-Limit': String(v.limit),
    'X-RateLimit-Remaining': String(v.remaining),
    'X-RateLimit-Reset': String(v.resetAt),
  };
  if (!v.allowed) h['Retry-After'] = String(v.retryAfter);
  return h;
}

export interface UsageFacts {
  inputTokens: number;
  outputTokens: number;
  sparksSpent: number;
  sparksRemaining: number | null;
}

/**
 * What this call cost, on the response itself.
 *
 * A caller should not have to make a second, separately-billed request to find out what the first
 * one spent — and a number that arrives after the fact cannot be used to stop before the limit.
 * `sparksRemaining` is omitted rather than guessed when the quota answer is unavailable: a
 * fabricated headroom figure is worse than none, because a client will act on it.
 */
export function usageHeaders(u: UsageFacts): Record<string, string> {
  const h: Record<string, string> = {
    'X-Golem-Usage-Input-Tokens': String(Math.max(0, Math.trunc(u.inputTokens))),
    'X-Golem-Usage-Output-Tokens': String(Math.max(0, Math.trunc(u.outputTokens))),
    'X-Golem-Usage-Sparks': String(Math.max(0, Math.trunc(u.sparksSpent))),
  };
  if (u.sparksRemaining !== null && Number.isFinite(u.sparksRemaining)) {
    h['X-Golem-Sparks-Remaining'] = String(Math.max(0, Math.trunc(u.sparksRemaining)));
  }
  return h;
}

/** RFC 9110 IMF-fixdate, the only date format an HTTP header may carry. */
export function httpDate(ms: number): string {
  return new Date(ms).toUTCString();
}

/**
 * RFC 8594 deprecation signalling.
 *
 * The policy is that a deprecated route keeps WORKING and says so on every response until its
 * sunset. A changelog entry nobody reads is not a deprecation policy; a header on the response of
 * the exact call that will break is.
 */
export function deprecationHeaders(route: PublicRoute): Record<string, string> {
  if (!route.deprecated) return {};
  return {
    Deprecation: 'true',
    Sunset: httpDate(route.deprecated.sunsetAt),
    Link: `<${route.deprecated.successor}>; rel="successor-version"`,
    Warning: `299 - "${route.deprecated.note}"`,
  };
}

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export type ErrorType = 'invalid_request_error' | 'authentication_error' | 'permission_error' | 'not_found_error' | 'rate_limit_error' | 'api_error';

export function errorTypeFor(status: number): ErrorType {
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 404) return 'not_found_error';
  if (status === 429) return 'rate_limit_error';
  if (status >= 500) return 'api_error';
  return 'invalid_request_error';
}

/** OpenAI's error envelope, plus the request id so a report can be traced without a screenshot. */
export function errorBody(status: number, code: string, message: string, requestId: string, param: string | null = null): Record<string, unknown> {
  return { error: { message, type: errorTypeFor(status), code, param }, request_id: requestId };
}

// ---------------------------------------------------------------------------
// idempotency
// ---------------------------------------------------------------------------

const IDEMPOTENCY_RE = /^[\x21-\x7e]{1,255}$/;

export function idempotencyKeyValid(raw: string | null | undefined): raw is string {
  return typeof raw === 'string' && IDEMPOTENCY_RE.test(raw);
}

export interface IdempotencyRecord {
  fingerprint: string;
  status: number;
  body: string;
}

export type IdempotencyVerdict =
  | { kind: 'fresh' }
  | { kind: 'replay'; record: IdempotencyRecord }
  | { kind: 'conflict' };

/**
 * What to do with an `Idempotency-Key` that has been seen before.
 *
 * REUSE WITH A DIFFERENT BODY IS A CONFLICT, not a replay and not a fresh call. Replaying the old
 * response would answer a question the caller did not ask; running the new body would mean the key
 * guaranteed nothing. Both are silent; 409 is not.
 */
export function idempotencyVerdict(stored: IdempotencyRecord | null, fingerprint: string): IdempotencyVerdict {
  if (!stored) return { kind: 'fresh' };
  return stored.fingerprint === fingerprint ? { kind: 'replay', record: stored } : { kind: 'conflict' };
}

// ---------------------------------------------------------------------------
// sandbox (test-mode keys)
// ---------------------------------------------------------------------------

/**
 * The sandbox completion.
 *
 * A test key must be able to exercise the WHOLE request path — auth, scopes, validation, headers,
 * streaming, idempotency — without a model running, because the point of a test credential is that
 * a CI job can hammer it. So this produces a deterministic answer derived from the request: the
 * same messages always yield the same text, which is what makes it assertable in somebody else's
 * test suite.
 *
 * It is labelled everywhere it can be: `system_fingerprint: "golem-sandbox"`, an
 * `X-Golem-Sandbox: true` response header, and text that says so. A sandbox answer that could be
 * mistaken for a model answer is a trap, not a feature.
 */
export const SANDBOX_FINGERPRINT = 'golem-sandbox';

export function sandboxCompletion(req: ChatCompletionRequest): GatewayResponse {
  const last = [...req.messages].reverse().find((m) => m.role === 'user');
  const asked = typeof last?.content === 'string' ? last.content : '';
  const trimmed = asked.length > 200 ? `${asked.slice(0, 200)}…` : asked;
  const text =
    `[golem sandbox] This is a deterministic test-mode response from ${req.publicModel}; no model ran and no Sparks were spent. ` +
    `You said: ${JSON.stringify(trimmed)}`;
  // Token counts are the character estimate the rest of the worker uses (~4 chars/token), so a
  // caller's cost arithmetic exercises the same shape it will see in live mode.
  const inputChars = req.messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
  return {
    text,
    toolCalls: [],
    usage: { inputTokens: Math.ceil(inputChars / 4), outputTokens: Math.ceil(text.length / 4) },
    neurons: 0,
    provider: 'sandbox',
    model: req.publicModel,
    finishReason: 'stop',
  };
}

// ---------------------------------------------------------------------------
// discovery + OpenAPI
// ---------------------------------------------------------------------------

export function discoveryDocument(): Record<string, unknown> {
  return {
    object: 'api',
    version: CURRENT_API_VERSION,
    versions: [...API_VERSIONS],
    version_header: API_VERSION_HEADER,
    openapi: '/v1/openapi.json',
    authentication: {
      scheme: 'bearer',
      description: 'Authorization: Bearer gk_live_… (or gk_test_… for the sandbox). Mint keys in the Golem dashboard.',
      modes: { live: 'Runs the model and spends Sparks.', test: 'Deterministic sandbox; nothing runs and nothing is spent.' },
    },
    routes: PUBLIC_ROUTES.map((r) => ({
      method: r.method,
      path: r.path,
      scope: r.scope,
      summary: r.summary,
      ...(r.deprecated ? { deprecated: { sunset: new Date(r.deprecated.sunsetAt).toISOString(), successor: r.deprecated.successor } } : {}),
    })),
  };
}

function openApiOperation(route: PublicRoute): Record<string, unknown> {
  const params = [...route.path.matchAll(/:([a-zA-Z]+)/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  }));
  return {
    summary: route.summary,
    operationId: `${route.method.toLowerCase()}${route.path.replace(/[/:]+/g, '_')}`,
    ...(route.deprecated ? { deprecated: true } : {}),
    ...(params.length ? { parameters: params } : {}),
    security: route.scope === null ? [{ apiKey: [] }] : [{ apiKey: [route.scope] }],
    responses: {
      '200': {
        description: route.sse ? 'An SSE stream.' : 'Success.',
        content: route.sse ? { 'text/event-stream': {} } : { 'application/json': {} },
      },
      '401': { description: 'Missing, malformed, revoked or expired API key.' },
      '403': { description: 'The key lacks the scope, or was not granted this project.' },
      '429': { description: 'Per-key rate limit, or the account is out of Sparks.' },
    },
  };
}

/**
 * The published schema, built from the same table the middleware enforces.
 *
 * `origin` comes from the request that asked for it, never from a constant. This worker is
 * deployed to more than one hostname and a schema that names the wrong one sends every generated
 * client to a host the caller cannot reach — an invented domain in a published schema is a
 * documented lie with a curl command attached.
 */
export function openApiDocument(origin: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of PUBLIC_ROUTES) {
    const openApiPath = route.path.replace(/:([a-zA-Z]+)/g, '{$1}');
    paths[openApiPath] ??= {};
    paths[openApiPath]![route.method.toLowerCase()] = openApiOperation(route);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Golem API',
      version: CURRENT_API_VERSION,
      description: 'The public HTTP surface of Golem. OpenAI-compatible chat completions, plus project and run resources.',
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'gk_live_<id>_<secret>' },
      },
    },
    security: [{ apiKey: [] }],
    paths,
  };
}
