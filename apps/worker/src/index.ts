// Golem worker entry: API routes + static serving + DO exports.
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  verifyStripeSignature,
  interpretStripeEvent,
  entitlementFor,
  buildCheckoutRequest,
  buildPortalRequest,
  checkoutConfigured,
  priceIdFor,
} from './billing';
import { exportFilename, renderTranscriptMarkdown, type TranscriptExport } from './export';
import type { Env, AuthedUser } from './env';
import { verifyJwt, bearerToken } from './auth';
import { getOwnedProject, getProfile, getProjectAccess, listProjectMembers, memberDirectory, supaRest, type ProjectRow } from './supa';
import { can, capabilitiesFor, asCollabRole, asShareScope, redeemShareLink, GRANTABLE_ROLES, type CollabAction, type Membership } from './collab';
import { isShareToken, newShareToken, putKvGrant, putShareLink, readShareLink, revokeShareLink } from './collab-links';
import { companionOpAccess, companionRefusal, sanitizeCompanionOp } from './companion';
import { chat as llmChat, embed, getModels, budgetReport, budgetState, setKillSwitch, rawProbe, BudgetError } from './gateway';
import { capabilityTable, providerHealth, selectProvider } from './providers';
import { imageKvKey, type ImageMeta } from './imagegen';
import { audioKvKey, servableAudioType, type AudioMeta } from './audio-store';
import { auditCitations, corpusCensus, renderCitedContext, searchDocsDetailed } from './rag';
import type { Citation, RetrievalOutcome } from './retrieval';
import { serveStatic, ensureStaticTables } from './static';
import {
  EVENT_KINDS,
  breakdownBy,
  logStats,
  readEnum,
  recordEvent,
  routeLabel,
  summarize,
} from './analytics';
import { fetchStoredEvents, flushEvents, maybeFlush } from './analytics-sink';
import { critiqueViews } from './vision';
import { roadmapForProject, executionBrief, polishRoadmap, publicShape, type StudioProbe, type RoadmapChat } from './roadmap';
import { refuseLuauIngress } from './tools';
import { ensureProvenanceTables, exportProjectAttribution } from './provenance';
import {
  ENTRIES_PER_SCOPE_MAX,
  buildExport,
  canWriteScope,
  deleteMemoryEntry,
  ensureMemoryTables,
  isMemoryScope,
  listMemoryEntries,
  orgMembership,
  parseImport,
  putMemoryEntry,
  readMemoryAudit,
  type MemoryAccess,
  type MemoryScope,
} from './memory-store';
import {
  normalisePreferences,
  normaliseProfile,
  personalisationForProject,
  preferencesFromEntries,
  preferencesToEntries,
  profileEntryKey,
  profileFromEntries,
  PROFILE_FIELDS,
} from './preferences';
import { allModels } from './providers/registry';
import { toolNames } from './tools';
import { sparksForNeurons } from './pricing';
import {
  API_SCOPES,
  planRotation,
  retireApiKey,
  KEY_MODES,
  apiKeyFromRequest,
  authorizeKey,
  findApiKeyByHash,
  insertApiKey,
  listApiKeys,
  mintKey,
  normaliseScopes,
  parseApiKey,
  publicKeyShape,
  rateLimitFor,
  revokeApiKey,
  sha256hex as keyHash,
  touchApiKey,
  type ApiKeyRecord,
  type GrantedProject,
  type KeyMode,
} from './api-keys';
import {
  API_VERSION_HEADER,
  CURRENT_API_VERSION,
  REQUEST_ID_HEADER,
  SANDBOX_FINGERPRINT,
  SSE_DONE,
  chatCompletionBody,
  chatCompletionChunks,
  deprecationHeaders,
  discoveryDocument,
  errorBody,
  idempotencyKeyValid,
  idempotencyVerdict,
  legacyCompletionBody,
  matchRoute,
  newRequestId,
  openApiDocument,
  openAiFinishReason,
  parseChatCompletionRequest,
  parseLegacyCompletionRequest,
  projectEvents,
  publicModelList,
  rateLimitCheck,
  rateLimitHeaders,
  resolveApiVersion,
  sandboxCompletion,
  sanitizeRequestId,
  sseFrame,
  sseHeartbeat,
  streamShouldClose,
  usageHeaders,
  type ApiVersion,
  type ChatCompletionRequest,
  type IdempotencyRecord,
  type ProjectSnapshot,
  type PublicRoute,
  type RateBucket,
  type RateLimitVerdict,
} from './public-api';
import type { RenderViewResult, OpResult, StudioOp } from '@golem/shared';
import { isPlanId, PLAN_IDS, type PlanId } from '@golem/shared';

export { SessionDO } from './do/session';
export { QuotaDO } from './do/quota';
export { PairingDO } from './do/pairing';
export { AdminDO } from './do/admin';
export { BudgetDO } from './do/budget';

type Vars = {
  user: AuthedUser;
  /** Set by the `/v1/*` middleware chain; never present on `/api/*`. */
  apiKey: ApiKeyRecord;
  route: PublicRoute;
  requestId: string;
  apiVersion: ApiVersion;
  rate: RateLimitVerdict;
};
const app = new Hono<{ Bindings: Env; Variables: Vars }>();
/** A request that has already passed the `/v1/*` middleware chain, so `apiKey` and friends are set. */
type PublicCtx = Context<{ Bindings: Env; Variables: Vars }>;

const VERSION = '0.1.0';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- helpers
function sessionStub(env: Env, projectId: string) {
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(projectId));
}
function adminStub(env: Env) {
  return env.ADMIN_DO.get(env.ADMIN_DO.idFromName('singleton'));
}
function pairingStub(env: Env) {
  return env.PAIRING_DO.get(env.PAIRING_DO.idFromName('singleton'));
}

/**
 * A session stub for a project this key was GRANTED, or null.
 *
 * The grant was proven under RLS at mint time (see `/api/keys`) and the middleware already refused
 * any id that is not on the key. This asks the same question a second time, at the point where a
 * Durable Object is actually addressed, so a handler added later cannot reach a session by reading
 * `:id` straight out of the path. Two lines, and the expensive half — the RLS round trip — is not
 * repeated.
 */
function grantedStub(c: PublicCtx): { id: string; stub: DurableObjectStub } | null {
  const key = c.get('apiKey');
  const id = c.req.param('id') ?? '';
  if (!key.projects.some((p) => p.id === id)) return null;
  return { id, stub: sessionStub(c.env, id) };
}

/** The refusal a handler gives when the second grant check says no. Same wording as the first. */
function ungranted(c: PublicCtx) {
  return c.json(
    errorBody(403, 'project_not_granted', 'This API key was not granted access to that project.', c.get('requestId')),
    403,
  );
}

/**
 * Carry the request id across the worker -> Durable Object boundary.
 *
 * A trace id that only exists in the response header is a correlation id for ONE hop, and the hop
 * it describes is the one that did the least work. Every public route that reaches a session or
 * the quota ledger tags that subrequest with the same id the caller was given, so a user reporting
 * `req_…` names one identifier that appears on both sides of the boundary.
 */
function traced(c: PublicCtx, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers as HeadersInit | undefined);
  headers.set(REQUEST_ID_HEADER, c.get('requestId'));
  return { ...init, headers };
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function count(env: Env, key: string) {
  // fire-and-forget operational counter
  return adminStub(env)
    .fetch('https://do/incr', { method: 'POST', body: JSON.stringify({ key }) })
    .catch(() => {});
}

// Sliding-ish limiter. Per-isolate and therefore best-effort, which is why it is defence in
// depth only: the authoritative spend controls are the Budget and Quota Durable Objects.
//
// THE OVERFLOW POLICY IS SECURITY-RELEVANT, which is not obvious and was wrong here.
//
// This map used to do `if (ipHits.size > 5000) ipHits.clear()` to bound memory. One map holds every
// counter, so that clear also wiped `admin-fail:` — and the entries are created by
// `/api/studio/claim` and the studio poll route, both UNAUTHENTICATED. Measured end to end: 120
// wrong admin keys from one address earns a 429; a flood from 5,200 distinct addresses against the
// unauthenticated claim route then returns that same address to 403 with a fresh 120 guesses. The
// flood is repeatable, so the bound on admin-key guessing was not a bound at all.
//
// It defeats the guarantee the admin gate states about itself (see the comment there): "what
// matters is that unbounded guessing becomes bounded". Against a high-entropy key the time-to-break
// stays effectively infinite either way, which is why this is a defect and not an incident — but
// the stated property was false, and a defence nobody can rely on should not read like one.
//
// So: never clear wholesale. Sweep entries whose window has already passed — they carry no live
// decision — and only if that frees nothing, evict the LEAST active, which under a flood is the
// flood's own one-hit entries rather than the counter that is currently blocking somebody.
const ipHits = new Map<string, { n: number; at: number; w: number }>();
const IP_HITS_MAX = 5000;

function sweepIpHits(now: number): void {
  for (const [k, v] of ipHits) if (now - v.at > v.w) ipHits.delete(k);
  if (ipHits.size <= IP_HITS_MAX) return;
  // Everything is still inside its window. Drop the least active first; a counter with one hit is
  // the flood, a counter with many is the thing the limiter exists to keep.
  const leastActiveFirst = [...ipHits.entries()].sort((a, b) => a[1].n - b[1].n);
  for (const [k] of leastActiveFirst.slice(0, ipHits.size - IP_HITS_MAX)) ipHits.delete(k);
}

function ipLimited(ip: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  if (ipHits.size > IP_HITS_MAX) sweepIpHits(now);
  const rec = ipHits.get(ip);
  if (!rec || now - rec.at > rec.w) {
    ipHits.set(ip, { n: 1, at: now, w: windowMs });
    return false;
  }
  rec.n += 1;
  return rec.n > limit;
}

// ---------------------------------------------------------------- middleware
app.use('/api/*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
});

/**
 * REQUEST AND ERROR LOG. Registered before the auth middleware on purpose, so a 401 and a 403 are
 * events too — a request log that only sees authenticated traffic cannot show a credential being
 * guessed, which is the single most useful thing it could show.
 *
 * The route is LABELLED, never logged raw: `/api/projects/<uuid>/ws` is one route, and the raw path
 * is a project id. See `routeLabel`.
 *
 * Flushing is batched (`maybeFlush`) rather than per-request. A Durable Object write for every
 * request would cost more than the data is worth and would put a storage write on the latency path
 * of every call; the buffer is bounded and reports what it drops.
 */
app.use('/api/*', async (c, next) => {
  const started = Date.now();
  const route = routeLabel(new URL(c.req.url).pathname);
  let threw: unknown = null;
  try {
    await next();
  } catch (e) {
    threw = e;
    throw e;
  } finally {
    const status = threw ? 500 : (c.res?.status ?? null);
    recordEvent({
      kind: 'request',
      route,
      method: c.req.method,
      // `c.res.status` is read through `??` into null, not into 200. A response whose status
      // could not be read is not a success; `successRollup` counts it as unclassified.
      status,
      durationMs: Date.now() - started,
      actorId: c.get('user')?.userId ?? null,
    });
    if (threw || (typeof status === 'number' && status >= 500)) {
      recordEvent({
        kind: 'error',
        scope: route,
        errorKind: threw ? 'unhandled' : 'server_error',
        message: threw instanceof Error ? threw.message : String(threw ?? `status ${status}`),
        fatal: true,
        actorId: c.get('user')?.userId ?? null,
      });
    }
    try {
      maybeFlush(c.env, c.executionCtx.waitUntil.bind(c.executionCtx));
    } catch {
      // no execution context (a synthetic request in a test harness): flush on the next one
    }
  }
});

/**
 * Paths that carry their own authentication and therefore must not be asked for a user JWT.
 *
 * `/api/billing/webhook` is here because Stripe is not a user and has no JWT — it authenticates by
 * signing the body with a shared secret. Exempt from THIS check is not the same as unauthenticated:
 * the route refuses outright when no signing secret is configured, and verifies an HMAC over the
 * raw body with a replay window before it changes anyone's plan. Removing that verification while
 * leaving this line in place would turn the endpoint into an open subscription dispenser, which is
 * why billing-route.test.mjs asserts both halves together.
 */
const AUTH_EXEMPT = ['/api/health', '/api/studio/claim', '/api/studio/poll', '/api/waitlist', '/api/billing/webhook'];
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (AUTH_EXEMPT.includes(path) || path.startsWith('/api/admin/')) return next();
  const token = bearerToken(c.req.raw);
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const user = await verifyJwt(c.env, token);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  // per-account request ceiling: stops a single credential driving a flood
  if (ipLimited(`user:${user.userId}`, 240)) return c.json({ error: 'Too many requests — slow down.' }, 429);
  c.set('user', user);
  return next();
});

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * `a !== b` on a string returns as soon as it finds a differing byte, so the
 * time it takes is a function of how many leading characters the guess got
 * right. This walks the whole length either way.
 */
// CONSTANT TIME, AND NO TEST IN THIS REPOSITORY CAN PROVE IT.
//
// `return a === b` passes the entire suite -- measured by rbxai-04. The loop below exists for a
// TIMING property, which no assertion can observe, so a green run after "simplifying" this says
// nothing about whether the admin key is still safe. Compare every byte, always; never short-circuit
// on the first difference. Nothing covers this one's absence, which is the difference between it and
// the gateway cap in gateway.ts.
function secretEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

app.use('/api/admin/*', async (c, next) => {
  // The admin key was the one credential in the system with no rate limit: the
  // auth middleware above returns early for /api/admin/*, so an attacker could
  // guess it as fast as the network allowed. It is a single static string that
  // grants cross-tenant access to any project's Durable Object, so it is the
  // last thing that should be guessable at line rate.
  //
  // Only FAILURES are counted. Throttling successful calls would break real
  // work for no security gain — deploy-static.mjs alone makes one admin call
  // per uploaded file and would trip any cap tight enough to matter against a
  // guessing attack. A wrong key, by contrast, has no legitimate reason to
  // arrive at line rate from one address.
  //
  // The allowance is deliberately generous rather than tight. Against a
  // high-entropy secret the difference between 20 and 120 guesses a minute is
  // no difference at all — both leave time-to-break effectively infinite. What
  // matters is that unbounded guessing becomes bounded.
  const key = c.req.header('X-Admin-Key');
  const action = routeLabel(new URL(c.req.url).pathname);
  if (!c.env.ADMIN_KEY || !key || !secretEquals(key, c.env.ADMIN_KEY)) {
    // AUDIT LOG. A refused admin call is the event worth keeping: it is the only externally visible
    // signature of someone working through the key space. `allowed` is written from the branch that
    // decided, not inferred later from a status code.
    recordEvent({ kind: 'audit', action, actorKind: 'unknown', allowed: false, subject: c.req.method });
    const adminIp = c.req.header('CF-Connecting-IP') ?? 'unknown';
    if (ipLimited(`admin-fail:${adminIp}`, 120)) {
      return c.json({ error: 'Too many requests — slow down.' }, 429);
    }
    return c.json({ error: 'forbidden' }, 403);
  }
  recordEvent({ kind: 'audit', action, actorKind: 'admin', allowed: true, subject: c.req.method });
  return next();
});

// ---------------------------------------------------------------- public
app.get('/api/health', async (c) => {
  //[[ THE BUILD SHA IS HERE BECAUSE DRIFT HAS TO BE OBSERVABLE WITHOUT CREDENTIALS.
  //
  //   §10.2 requires comparing the deployed build to HEAD every pass. `/api/version` is behind
  //   auth and returns 401 to an unauthenticated probe, and this route reported `VERSION` — the
  //   package version, which is "0.1.0" and has never changed across any deploy. So there was no
  //   way to tell a fresh deploy from a six-week-old one from outside, and the invariant that
  //   exists to catch exactly that was unperformable.
  //
  //   Supplied at deploy time by the deploy script. `unknown` means someone deployed without it,
  //   which is itself worth seeing rather than hiding behind a plausible-looking version string. ]]
  return c.json({
    ok: true,
    version: VERSION,
    buildSha: c.env.BUILD_SHA ?? 'unknown',
    time: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------- project session routes
/**
 * THE PROJECT GATE, AND WHY IT HAS TWO MODES.
 *
 * Called with two arguments it means exactly what it has always meant: this caller OWNS this
 * project, or there is nothing here. Every existing `/api/projects/*` route uses that form and
 * none of them changed — an owner-only route that quietly started admitting members would be the
 * worst possible way to ship collaboration.
 *
 * Called with a third argument it is the SHARED gate: the caller may be the owner or a member,
 * and the action they are about to perform is named. `decideAccess` answers, and a viewer asking
 * to build is refused with the same certainty as a stranger asking to read. There is no default
 * for that third argument on purpose; a route that forgets to name its action gets the
 * owner-only door, which is the fail-closed direction.
 *
 * The Durable Object is initialised with the PROJECT'S owner id rather than the caller's. On the
 * owner path those are the same value. On the member path they are not, and passing the caller's
 * would hit `/init`'s owner-mismatch refusal and present as "project not found" for every
 * collaborator — the sharing feature failing shut, silently, at the last hop.
 */
async function withOwnedProject(
  c: { env: Env; get: (k: 'user') => AuthedUser },
  projectId: string,
  action?: CollabAction,
) {
  const user = c.get('user');
  if (!UUID_RE.test(projectId)) return null;
  const project = await getOwnedProject(c.env, user.jwt, projectId);
  let membership: Membership | null = project ? { userId: user.userId, role: 'owner', via: 'owner' } : null;
  let shared: ProjectRow | null = null;
  if (!project) {
    // No action named ⇒ owner-only, and the owner path just said no.
    if (action === undefined) return null;
    const access = await getProjectAccess(c.env, user, projectId, action);
    if (access.project === null) return null;
    shared = access.project;
    membership = access.membership;
  } else if (action !== undefined && !can('owner', action)) {
    return null; // an action even the owner cannot perform is a programming error, refused here
  }
  const row = project ?? shared;
  if (!row || !membership) return null;
  // address the DO by the canonical row id so casing/encoding variants cannot fan out DOs
  const stub = sessionStub(c.env, row.id);
  const init = await stub.fetch('https://do/init', {
    method: 'POST',
    body: JSON.stringify({ projectId: row.id, projectName: row.name, ownerId: row.owner_id }),
  });
  if (!init.ok) return null; // owner mismatch on a recycled id — refuse
  return { user, project: row, stub, membership, role: membership.role };
}

app.get('/api/projects/:id/ws', async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') return c.json({ error: 'expected websocket' }, 426);
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  void count(c.env, 'ws_connect');
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-User-Id', ctx.user.userId);
  headers.set('X-User-Jwt', ctx.user.jwt);
  return ctx.stub.fetch(new Request('https://do/ws', { headers, method: 'GET' }));
});

app.get('/api/projects/:id/messages', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const url = new URL(c.req.url);
  return ctx.stub.fetch(`https://do/messages?${url.searchParams}`);
});

/**
 * Read what Apple believes about a project.
 *
 * From the Durable Object, not from the Supabase columns: those are a mirror written best-effort
 * at the tail of a run, and showing the user a stale copy of the thing the agent is steering by
 * would defeat the point of showing it at all.
 */
/**
 * What is left of an image's life, in seconds.
 *
 * KV anchors `expirationTtl` at WRITE time; a Cache-Control header is anchored at RESPONSE time.
 * Serving the full TTL to an image fetched late therefore hands out a cached copy that outlives the
 * object it copies — by up to the whole hour. The stored `expiresAt` is what closes that gap.
 *
 * An object written before `expiresAt` existed has no metadata, and those are already within one
 * TTL of being dropped, so the conservative floor is what they get rather than the full hour.
 */
/*
 * Typed structurally rather than as `ImageMeta | null` because the audio route below stores the
 * same `expiresAt` for the same reason and needs the same arithmetic. Widening the parameter is
 * strictly safer than a second copy of this function that could drift from its comment.
 */
function remainingLife(meta: { expiresAt?: number } | null): number {
  if (!meta?.expiresAt) return 0;
  return Math.max(0, meta.expiresAt - Math.floor(Date.now() / 1000));
}

/**
 * Serve a generated image.
 *
 * THE DEFECT THIS CLOSES. `generate_image` has been parking PNGs in KV and handing back a key
 * since it shipped, and nothing served them — there was no `image` route in this file at all. So
 * every image the product generated rendered as the client's expired-state fallback, which told
 * the user their image had expired when in truth it had never been reachable. Honest copy over a
 * path that does not exist still reads as a broken feature.
 *
 * AUTHORISATION IS THE KEY, NOT THE ID. The pixels live under `image:<projectId>:<imageId>`, so
 * this asks the one question the rest of this file already knows how to ask — does this user own
 * this project — and then constructs the key itself. A caller cannot reach another account's
 * images by presenting an id, because the id is only half of the address and the other half is
 * proven. An unguessable identifier is not an authorisation check; it is a secret that survives
 * exactly until the first leaked transcript.
 *
 * The 404 is deliberately the same for "no such image", "expired" and "not yours". A distinct
 * 403 would confirm to a stranger that a given id exists.
 */
app.get('/api/projects/:id/images/:imageId', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);

  const imageId = c.req.param('imageId');
  // Validated before it is concatenated into a key. Without this a crafted id containing `:` could
  // address a different namespace in the same KV store.
  if (!UUID_RE.test(imageId)) return c.json({ error: 'not found' }, 404);

  const { value: base64, metadata } = await c.env.KV.getWithMetadata<ImageMeta>(imageKvKey(ctx.project.id, imageId));
  // Expiry is the NORMAL outcome here, not an edge case: images live IMAGE_TTL_SECONDS and a
  // conversation lives as long as the user keeps it, so scrolling back to yesterday's work lands
  // on this branch. The client says so in words; this says so in a status code.
  //
  // The body is byte-identical to the one above. It used to carry `reason: 'expired_or_missing'`,
  // which quietly undid the point of making every failure a 404: the status codes matched and the
  // BODIES told a prober which of the two cases they had hit.
  if (!base64) return c.json({ error: 'not found' }, 404);

  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      // PRIVATE. This is one user's generated content behind an authorised route, and a shared
      // cache holding it would serve it to whoever asked next. max-age is bounded by the TTL, so
      // a cached copy can never outlive the object it is a copy of.
      // THE REMAINING LIFE, not the full TTL. KV's expirationTtl is anchored at WRITE time and this
      // header at RESPONSE time, so serving the full hour to an image fetched 59 minutes after it
      // was stored cached it for another hour — outliving the object by nearly the whole TTL, which
      // is exactly what the comment here used to claim was impossible.
      'Cache-Control': `private, max-age=${remainingLife(metadata)}`,
      'Content-Length': String(bytes.byteLength),
      // The bytes are model-generated and served from our origin; nothing should ever execute or
      // embed them as anything but an image.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});

/**
 * Serve generated audio.
 *
 * The image route above, for sound, and written at the same time as the tools that produce it
 * rather than a release later — the comment on that route records what the gap cost last time.
 *
 * ONE THING IT DOES THAT THE IMAGE ROUTE DOES NOT, and it is the reason this is not a copy with a
 * different Content-Type: audio is not one format. A generated effect is a WAV, a spoken line is an
 * MP3, so the type has to be STORED — and a stored value echoed into a `Content-Type` header is a
 * value a writer chooses and a browser obeys. `text/html` there would turn an authenticated URL on
 * our own origin into a page that runs script. So the header never comes from KV directly: the
 * stored string is looked up in `SERVABLE_AUDIO_TYPES` and anything not in that table is refused
 * rather than served as itself.
 */
app.get('/api/projects/:id/audio/:audioId', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);

  const audioId = c.req.param('audioId');
  // Validated before it is concatenated into a key, exactly as the image route does: an id
  // containing `:` could otherwise address a different namespace in the same KV store.
  if (!UUID_RE.test(audioId)) return c.json({ error: 'not found' }, 404);

  const { value: base64, metadata } = await c.env.KV.getWithMetadata<AudioMeta>(audioKvKey(ctx.project.id, audioId));
  if (!base64) return c.json({ error: 'not found' }, 404);

  const contentType = servableAudioType(metadata?.contentType);
  // A stored type this worker will not serve is treated as a miss, with the SAME body as every
  // other miss. Serving it as `application/octet-stream` instead would leak that the object exists.
  if (!contentType) return c.json({ error: 'not found' }, 404);

  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': contentType,
      // PRIVATE, and bounded by the object's REMAINING life rather than the full TTL — the same
      // reasoning, and the same helper, as the image route.
      'Cache-Control': `private, max-age=${remainingLife(metadata)}`,
      'Content-Length': String(bytes.byteLength),
      // The bytes are generated and served from our origin; nothing should ever execute or embed
      // them as anything but audio.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
});

app.get('/api/projects/:id/memory', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  return ctx.stub.fetch('https://do/memory');
});

/**
 * Correct it.
 *
 * Writes BOTH copies. The DO's is what the agent reads on the next run, so an edit that only
 * touched Supabase would change what the dashboard shows and nothing about what Apple does — the
 * user would delete a wrong fact, watch it disappear, and see the agent keep acting on it.
 *
 * The Supabase write goes through the caller's own JWT and RLS, exactly like every other write in
 * this product; it is deliberately best-effort, because failing the whole edit over a stale mirror
 * would refuse a correction that has in fact already taken effect.
 */
app.put('/api/projects/:id/memory', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);

  const res = await ctx.stub.fetch('https://do/memory', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: await c.req.text(),
  });
  if (!res.ok) return res;

  const out = (await res.json()) as { memory: { summary: string | null; facts: string[] }; editedAt: string };
  await fetch(`${c.env.SUPABASE_URL}/rest/v1/projects?id=eq.${encodeURIComponent(ctx.project.id)}`, {
    method: 'PATCH',
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${ctx.user.jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ memory_summary: out.memory.summary, memory_facts: out.memory.facts }),
  }).catch(() => {});

  return c.json(out);
});

/**
 * Search one project's conversation.
 *
 * Server-side because `/messages` only pages the most recent hundred into the client: a filter over
 * that window answers "not found" for text that IS in the conversation, and nothing distinguishes
 * that from the true answer. The query is forwarded rather than re-parsed here so the DO owns one
 * definition of what counts as a match.
 */
app.get('/api/projects/:id/search', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const url = new URL(c.req.url);
  return ctx.stub.fetch(`https://do/search?${url.searchParams}`);
});


// ---------------------------------------------------------------- scoped memory
//[[ WHAT APPLE REMEMBERS ABOUT A PERSON, A PROJECT, AND AN ORGANISATION.
//
//   `/api/projects/:id/memory` above is the project's model-written summary and facts, which live
//   in that project's Durable Object. These routes are the other half: the layered store in D1 that
//   holds preferences, the personal prompt profile, and project and team instructions.
//
//   EVERY ONE OF THESE ROUTES PROVES THE SCOPE BEFORE IT TOUCHES A ROW. `memoryScopeAccess` is the
//   only way in, and the MemoryAccess it returns carries ONLY what was proven — a project id that
//   came back from `getOwnedProject`, the caller's own user id, and the organisations the members
//   table says they belong to. The scope id in the URL is a question; the context is the answer. A
//   route that passed the URL's id through as though it were proof would make the store's
//   isolation decorative. ]]

/**
 * Turn a (scope, id) pair from a URL into proven access, or null.
 *
 * Ownership for a project comes from `getOwnedProject` — the same RLS-backed check every other
 * project route uses — rather than from `withOwnedProject`, because a memory read has no reason to
 * spin up the project's Durable Object.
 */
async function memoryScopeAccess(
  c: { env: Env; get: (k: 'user') => AuthedUser },
  scope: string,
  scopeId: string,
): Promise<{ access: MemoryAccess; scope: MemoryScope } | null> {
  if (!isMemoryScope(scope) || !scopeId) return null;
  const user = c.get('user');
  await ensureMemoryTables(c.env);
  const orgs = await orgMembership(c.env, user.userId);
  const projectIds: string[] = [];
  if (scope === 'project') {
    if (!UUID_RE.test(scopeId)) return null;
    const project = await getOwnedProject(c.env, user.jwt, scopeId);
    if (!project) return null;
    projectIds.push(project.id);
  }
  const access: MemoryAccess = { userId: user.userId, projectIds, orgs };
  // Read access is checked here so every route below can assume it. Write access is checked again
  // inside the store, which is where it belongs: the store must be safe to call from anywhere.
  if (scope === 'user' && scopeId !== user.userId) return null;
  if (scope === 'org' && !orgs.some((o) => o.orgId === scopeId)) return null;
  return { access, scope };
}

const MEMORY_VOCAB = () => ({ knownModelIds: allModels().map((m) => m.id), knownToolNames: toolNames() });

/** The scopes this caller can address at all — what the memory viewer's scope switcher is built from. */
app.get('/api/memory/scopes', async (c) => {
  const user = c.get('user');
  await ensureMemoryTables(c.env);
  const orgs = await orgMembership(c.env, user.userId);
  return c.json({
    user: { scopeId: user.userId, canWrite: true },
    orgs: orgs.map((o) => ({ scopeId: o.orgId, role: o.role, canWrite: o.role === 'owner' || o.role === 'admin' })),
  });
});

/** Everything stored at one scope, plus the preferences and profile decoded out of it. */
app.get('/api/memory/:scope/:scopeId', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const scopeId = c.req.param('scopeId');
  const entries = await listMemoryEntries(c.env, proven.access, proven.scope, scopeId);
  return c.json({
    scope: proven.scope,
    scopeId,
    canWrite: canWriteScope(proven.access, proven.scope, scopeId),
    entries,
    preferences: preferencesFromEntries(entries, MEMORY_VOCAB()),
    profile: profileFromEntries(entries),
  });
});

/** Write one entry. The key is in the path, so a body cannot address a different row than the URL. */
app.put('/api/memory/:scope/:scopeId/entries/:key', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { value?: unknown; kind?: unknown; ttlDays?: unknown } | null;
  if (!body || typeof body !== 'object') return c.json({ error: 'expected an entry object' }, 400);
  const out = await putMemoryEntry(c.env, proven.access, {
    scope: proven.scope,
    scopeId: c.req.param('scopeId'),
    key: c.req.param('key'),
    kind: body.kind,
    value: body.value,
    ttlDays: body.ttlDays,
    source: 'user',
  });
  // 403 for a refused scope, 400 for a malformed entry. They are different failures and telling a
  // user "your text was too long" when they lack permission — or the reverse — teaches them nothing.
  if (!out.ok) return c.json({ error: out.reason }, out.reason === 'forbidden' ? 403 : 400);
  return c.json({ entry: out.entry });
});

app.delete('/api/memory/:scope/:scopeId/entries/:key', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const out = await deleteMemoryEntry(c.env, proven.access, proven.scope, c.req.param('scopeId'), c.req.param('key'));
  if (!out.ok) return c.json({ error: out.reason }, out.reason === 'forbidden' ? 403 : 400);
  return c.json({ deleted: out.deleted });
});

/**
 * Replace the preferences at one scope.
 *
 * Whole-object, like the project memory editor above and for the same reason: a patch needs both
 * sides to agree about identity, and the rejected list is only meaningful against a complete
 * submission. What comes back is what was STORED — a caller that kept its own copy would show a
 * setting that was refused as though it had been saved.
 */
app.put('/api/memory/:scope/:scopeId/preferences', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const scopeId = c.req.param('scopeId');
  if (!canWriteScope(proven.access, proven.scope, scopeId)) return c.json({ error: 'forbidden' }, 403);

  const body = (await c.req.json().catch(() => null)) as { preferences?: unknown } | null;
  const { prefs, rejected } = normalisePreferences((body as { preferences?: unknown })?.preferences ?? body, MEMORY_VOCAB());

  // A key the user cleared must be DELETED, not left behind at its old value — otherwise "unset" is
  // a state the settings page can display and never reach.
  const existing = await listMemoryEntries(c.env, proven.access, proven.scope, scopeId);
  const wanted = preferencesToEntries(prefs, proven.scope, scopeId);
  const keep = new Set(wanted.map((w) => w.key));
  for (const e of existing) {
    if (e.kind === 'preference' && !keep.has(e.key)) await deleteMemoryEntry(c.env, proven.access, proven.scope, scopeId, e.key);
  }
  for (const w of wanted) await putMemoryEntry(c.env, proven.access, { ...w, source: 'user' });

  const after = await listMemoryEntries(c.env, proven.access, proven.scope, scopeId);
  return c.json({ preferences: preferencesFromEntries(after, MEMORY_VOCAB()).prefs, rejected });
});

/** The personal prompt profile. User scope by construction — see the note in personalisationForProject. */
app.put('/api/memory/user/:scopeId/profile', async (c) => {
  const proven = await memoryScopeAccess(c, 'user', c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const scopeId = c.req.param('scopeId');
  const body = (await c.req.json().catch(() => null)) as { profile?: unknown } | null;
  const profile = normaliseProfile((body as { profile?: unknown })?.profile ?? body);
  for (const field of PROFILE_FIELDS) {
    const key = profileEntryKey(field);
    const text = profile[field];
    if (text) await putMemoryEntry(c.env, proven.access, { scope: 'user', scopeId, key, kind: 'profile', value: text, source: 'user' });
    else await deleteMemoryEntry(c.env, proven.access, 'user', scopeId, key);
  }
  const after = await listMemoryEntries(c.env, proven.access, 'user', scopeId);
  return c.json({ profile: profileFromEntries(after) });
});

/** Take it with you. The envelope names its own scope so an import can refuse to cross scopes. */
app.get('/api/memory/:scope/:scopeId/export', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const scopeId = c.req.param('scopeId');
  const entries = await listMemoryEntries(c.env, proven.access, proven.scope, scopeId);
  const bundle = buildExport(proven.scope, scopeId, entries, Date.now());
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="apple-memory-${proven.scope}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

/**
 * Bring it back.
 *
 * The TARGET is the URL, never the envelope: `parseImport` rejects any row addressed to a different
 * scope rather than re-addressing it, so posting one project's export to another's import route
 * writes nothing. What the caller gets back is the list of rows that were refused and why — an
 * import that silently dropped half a file would be indistinguishable from one that worked.
 */
app.post('/api/memory/:scope/:scopeId/import', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const scopeId = c.req.param('scopeId');
  if (!canWriteScope(proven.access, proven.scope, scopeId)) return c.json({ error: 'forbidden' }, 403);

  const raw = await c.req.json().catch(() => null);
  const parsed = parseImport(raw, { scope: proven.scope, scopeId }, { now: Date.now(), actorId: c.get('user').userId });
  if (parsed.error) return c.json({ error: parsed.error, imported: 0, rejected: parsed.rejected }, 400);

  let imported = 0;
  const rejected = [...parsed.rejected];
  for (const entry of parsed.entries.slice(0, ENTRIES_PER_SCOPE_MAX)) {
    const out = await putMemoryEntry(c.env, proven.access, entry);
    if (out.ok) imported++;
    else rejected.push({ key: entry.key, reason: out.reason });
  }
  return c.json({ imported, rejected });
});

/** Who changed what, and what it was before. A delete is the case this exists for. */
app.get('/api/memory/:scope/:scopeId/audit', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const limit = Number(c.req.query('limit')) || 50;
  return c.json({ audit: await readMemoryAudit(c.env, proven.access, proven.scope, c.req.param('scopeId'), limit) });
});

/**
 * What one project's next run will actually act on, after all three layers are resolved.
 *
 * This is the same function the Durable Object calls when it builds the system prompt, so the panel
 * and the agent cannot disagree about which layer won. A viewer that recomputed the layering in the
 * browser would be a second implementation of the precedence rule, and the two would diverge the
 * first time either changed.
 */
app.get('/api/projects/:id/personalisation', async (c) => {
  const projectId = c.req.param('id');
  const proven = await memoryScopeAccess(c, 'project', projectId);
  if (!proven) return c.json({ error: 'not found' }, 404);
  // A display fence id. It is not the run's — that one is minted per run and must never leave the
  // worker — and the block is rendered here only so the panel can show what the model is told.
  const p = await personalisationForProject(c.env, proven.access, { projectId }, crypto.randomUUID().slice(0, 8), MEMORY_VOCAB());
  return c.json({
    preferences: p.prefs,
    sources: p.sources,
    profile: p.profile,
    projectInstructions: p.projectInstructions,
    teamInstructions: p.teamInstructions,
    resolved: p.resolved.entries.map((e) => ({
      key: e.key,
      value: e.winner.value,
      kind: e.winner.kind,
      scope: e.winner.scope,
      expiresAt: e.winner.expiresAt,
      shadowedBy: e.shadowed.map((sh) => ({ scope: sh.scope, value: sh.value })),
    })),
  });
});

/**
 * The whole conversation as a file, in JSON or Markdown.
 *
 * `format=md` is rendered SERVER-SIDE from the same payload the JSON export returns, so the two
 * cannot drift: a Markdown transcript assembled separately in the browser would be a second
 * implementation of "what the conversation was", and they would disagree the first time either one
 * changed.
 *
 * Ownership goes through `withOwnedProject` like every other project route — an export is a
 * complete copy of a project's history and is exactly the thing that must not read across tenants.
 */
app.get('/api/projects/:id/export', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);

  const res = await ctx.stub.fetch('https://do/export');
  if (!res.ok) return c.json({ error: 'export failed' }, 502);
  const data = (await res.json()) as TranscriptExport;

  const md = c.req.query('format') === 'md';
  const body = md ? renderTranscriptMarkdown(data) : JSON.stringify(data, null, 2);
  return new Response(body, {
    headers: {
      'Content-Type': md ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(data.project.name, data.exportedAt, md ? 'md' : 'json')}"`,
    },
  });
});

app.get('/api/projects/:id/checkpoints', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  return ctx.stub.fetch('https://do/checkpoints');
});

/**
 * What this project owes, and to whom.
 *
 * Read-only and computed on demand from the usage ledger `insert_asset` writes. It is
 * one route rather than two because a caller asking "can I publish this?" and one
 * asking "what do I credit?" are asking about the same set of assets, and answering
 * them from two requests invites them to disagree.
 *
 * `unaccounted` is not an error and does not 500. A project can genuinely contain an
 * asset the library has no provenance for — anything inserted by Roblox id that was
 * never ingested — and the honest response is to name it, which is what the report
 * does. Hiding it behind a failure would leave the customer thinking nothing is owed.
 */
app.get('/api/projects/:id/attribution', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const projectId = c.req.param('id');
  await ensureProvenanceTables(c.env);
  // `exportProjectAttribution` is the module's own composition point and it reads the
  // asset set ONCE for all three outputs. Re-deriving them here — which the first
  // version of this route did — would have been a second implementation of the same
  // composition, free to drift from the one the module tests.
  const { attribution, commercial, text } = await exportProjectAttribution(c.env, projectId);
  // `text` is the renderable credits artefact, shipped so the browser pastes what the
  // worker rendered rather than reassembling its own version of the same document.
  return c.json({ attribution, commercialUse: commercial, credits: text });
});

app.post('/api/projects/:id/checkpoints', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ label?: string }>().catch(() => ({ label: '' }));
  return ctx.stub.fetch('https://do/checkpoint', { method: 'POST', body: JSON.stringify({ label: body.label ?? 'checkpoint' }) });
});

app.post('/api/projects/:id/restore', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ checkpointId: string }>().catch(() => null);
  if (!body?.checkpointId) return c.json({ error: 'checkpointId required' }, 400);
  return ctx.stub.fetch('https://do/restore', { method: 'POST', body: JSON.stringify(body) });
});

app.post('/api/projects/:id/purge', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  return ctx.stub.fetch('https://do/purge', { method: 'POST' });
});

app.post('/api/projects/:id/pairing', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  void count(c.env, 'pairing_create');
  return pairingStub(c.env).fetch('https://do/create', {
    method: 'POST',
    body: JSON.stringify({ projectId: ctx.project.id, userId: ctx.user.userId, projectName: ctx.project.name }),
  });
});

/**
 * THE STUDIO COMPANION'S CHANNEL: one direct-manipulation op, driven by a person.
 *
 * This is what the companion panel's own controls talk to — the transform handles, the Explorer
 * edits, the test controls, selection and camera. No model is involved and no Spark is spent,
 * because none of it is inference: it is the user's own click, forwarded to their own Studio.
 *
 * TWO CHECKS, IN THIS ORDER, AND THE ORDER MATTERS.
 *
 *   1. WHICH OP. `companionOpAccess` answers with the access level the op needs, or null. Null is
 *      the answer for everything not explicitly listed, INCLUDING valid members of `StudioOp` —
 *      adding an op to the shared union must not quietly open a door here. That is why this
 *      cannot simply forward what it is handed the way `/api/admin/studio-op` does; see
 *      companion.ts for what stays behind the agent's Luau and asset gates, and why.
 *
 *   2. WHICH CALLER. `withOwnedProject`, exactly as every other project route in this file uses
 *      it: OWNER ONLY. That is deliberate and it is the conservative half of the decision — the
 *      companion drives somebody's open Studio, and widening it to shared collaborators is the
 *      collaboration workstream's call to make, in the same change that teaches the project-route
 *      guard about the action argument.
 *
 * The op's access LEVEL is therefore read and not yet branched on. `companionOpAccess` returns
 * 'read' or 'build' because the boundary between them is a real property of the ops — it is the
 * value that will decide which role is enough the day this route takes a collab action — and
 * today the only thing the route asks it is whether it is null. Stated plainly rather than spent
 * on a permission check that would pass for every caller who can reach here anyway, which is the
 * shape this repository keeps finding: a guard that cannot fail reading as a guard.
 *
 * ADMISSION IS CHECKED FIRST, BEFORE ANY IDENTITY WORK. A refused op therefore never reaches
 * PostgREST and never materialises the session Durable Object.
 */
app.post('/api/projects/:id/studio/op', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { op?: Record<string, unknown>; timeoutMs?: number } | null;
  const raw = body?.op;
  if (!raw || companionOpAccess(raw) === null) return c.json({ error: companionRefusal(raw) }, 400);
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  void count(c.env, 'companion_op');
  const res = await ctx.stub.fetch('https://do/companion-op', {
    method: 'POST',
    body: JSON.stringify({ op: sanitizeCompanionOp(raw), timeoutMs: body?.timeoutMs }),
  });
  return c.json(await res.json(), res.status as 200);
});

// ---------------------------------------------------------------- game roadmap (manifest §30-§33)
/**
 * The roadmap is READ FROM THE PROJECT, so every route here needs Studio attached.
 *
 * That is a real constraint and it is stated rather than worked around: with no plugin connected
 * there is no place file to inspect, and the only thing that could be returned is the generic
 * template §31 exists to forbid. So these routes 409 with the reason instead of guessing.
 *
 * Ownership is checked by `withOwnedProject` exactly as it is for messages and checkpoints; the
 * DO's /studio-op path is reached only after that check passes.
 */
function studioProbeFor(stub: DurableObjectStub): StudioProbe {
  return async (op: StudioOp, timeoutMs?: number): Promise<OpResult> => {
    const res = await stub.fetch('https://do/studio-op', {
      method: 'POST',
      body: JSON.stringify({ op, timeoutMs: timeoutMs ?? 30_000 }),
    });
    return (await res.json()) as OpResult;
  };
}

app.get('/api/projects/:id/roadmap', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const out = await roadmapForProject(studioProbeFor(ctx.stub));
  if (!out.ok) return c.json({ error: out.error }, 409);
  void count(c.env, 'roadmap_read');

  // The deterministic roadmap is the product (§39). The model pass is opt-in, costs a Spark, and
  // can only reorder and rephrase what the scan already decided — so every failure below leaves a
  // complete roadmap on the wire, with `polished: false` saying plainly that it did not run.
  if (c.req.query('polish') !== '1') return c.json({ projectId: ctx.project.id, ...out.roadmap, shape: publicShape(out.shape) });
  const user = c.get('user');
  const spend = await c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId)).fetch('https://do/spend', {
    method: 'POST',
    body: JSON.stringify({ sparks: 1, kind: 'roadmap_rank' }),
  });
  const { ok } = (await spend.json()) as { ok: boolean };
  if (!ok) {
    return c.json({
      projectId: ctx.project.id,
      ...out.roadmap,
      shape: publicShape(out.shape),
      notes: [...out.roadmap.notes, 'Daily Sparks are used up, so this is the unranked roadmap.'],
    });
  }
  const chat: RoadmapChat = async ({ system, user: prompt }) => {
    const res = await llmChat(
      c.env,
      { model: 'clay', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], maxTokens: 700 },
      { kind: 'roadmap:rank', cacheTtl: 300 },
    );
    return res.text;
  };
  const ranked = await polishRoadmap(out.roadmap, out.shape, chat);
  return c.json({
    projectId: ctx.project.id,
    ...ranked,
    shape: publicShape(out.shape),
    notes: ranked.polished ? ranked.notes : [...ranked.notes, 'The ranking pass did not run; this is the roadmap read straight from the project.'],
  });
});

/** §32: the small contextual set, for a UI that wants the next steps and not the whole timeline. */
app.get('/api/projects/:id/roadmap/next', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const out = await roadmapForProject(studioProbeFor(ctx.stub));
  if (!out.ok) return c.json({ error: out.error }, 409);
  return c.json({
    projectId: ctx.project.id,
    genre: out.roadmap.genre,
    genreLabel: out.roadmap.genreLabel,
    genreConfidence: out.roadmap.genreConfidence,
    next: out.roadmap.next,
    notes: out.roadmap.notes,
  });
});

/**
 * §33: turn a milestone into something Plan or Agent can actually build.
 *
 * The brief is regenerated from a fresh scan rather than from a roadmap the client sends back:
 * a client-supplied brief would let any caller hand the builder arbitrary instructions attributed
 * to Golem's own roadmap. Only the milestone id crosses the wire.
 */
app.post('/api/projects/:id/roadmap/brief', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ milestoneId?: string }>().catch(() => null);
  const milestoneId = (body?.milestoneId ?? '').slice(0, 64);
  if (!milestoneId) return c.json({ error: 'milestoneId required' }, 400);
  const out = await roadmapForProject(studioProbeFor(ctx.stub));
  if (!out.ok) return c.json({ error: out.error }, 409);
  const brief = executionBrief(out.shape, out.roadmap, milestoneId);
  if (!brief) return c.json({ error: 'no such milestone for this project' }, 404);
  void count(c.env, 'roadmap_brief');
  return c.json(brief);
});

// ---------------------------------------------------------------- studio plugin endpoints (token auth, not JWT)
app.post('/api/studio/claim', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (ipLimited(`claim:${ip}`, 10)) return c.json({ error: 'slow down' }, 429);
  const body = await c.req.json<{ code?: string }>().catch(() => null);
  if (!body?.code) return c.json({ error: 'code required' }, 400);
  const res = await pairingStub(c.env).fetch('https://do/claim', { method: 'POST', body: JSON.stringify({ code: body.code }) });
  if (!res.ok) return c.json({ error: 'invalid or expired code' }, 404);
  const pairing = (await res.json()) as { projectId: string; userId: string; projectName: string };
  const secret = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const token = `${pairing.projectId}.${secret}`;
  const stub = sessionStub(c.env, pairing.projectId);
  await stub.fetch('https://do/init', {
    method: 'POST',
    body: JSON.stringify({ projectId: pairing.projectId, projectName: pairing.projectName, ownerId: pairing.userId }),
  });
  // Carry the plugin's self-report into the session at pairing time. It travels on
  // headers rather than in the claim body so that a plugin predating version
  // reporting sends an ordinary request with two fewer headers, and needs no
  // special case anywhere.
  await stub.fetch('https://do/plugin/register', {
    method: 'POST',
    body: JSON.stringify({
      tokenHash: await sha256hex(token),
      pluginVersion: c.req.header('X-Golem-Plugin-Version') ?? null,
      pluginProtocol: c.req.header('X-Golem-Plugin-Protocol') ?? null,
    }),
  });
  void count(c.env, 'studio_paired');
  return c.json({ token, projectId: pairing.projectId, projectName: pairing.projectName });
});

app.post('/api/studio/poll', async (c) => {
  const token = c.req.header('X-Golem-Token') ?? '';
  const dot = token.indexOf('.');
  if (dot < 1 || token.length > 200) return c.json({ error: 'invalid token' }, 401);
  const projectId = token.slice(0, dot);
  // reject before touching storage: an unauthenticated caller must not be able to
  // materialize Durable Objects for arbitrary ids
  if (!UUID_RE.test(projectId) || token.length - dot - 1 !== 48) return c.json({ error: 'invalid token' }, 401);
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (ipLimited(`poll:${ip}`, 400)) return c.json({ error: 'slow down' }, 429);
  const stub = sessionStub(c.env, projectId);
  const headers = new Headers({ 'X-Golem-Token': token, 'Content-Type': 'application/json' });
  // Forward the plugin's self-report. This route rebuilds the header set rather than
  // passing the request through, so anything the DO needs has to be copied explicitly
  // — and only these two are, deliberately: nothing else the client sends is trusted.
  for (const h of ['X-Golem-Plugin-Version', 'X-Golem-Plugin-Protocol']) {
    const v = c.req.header(h);
    if (v) headers.set(h, v);
  }
  return stub.fetch('https://do/plugin/poll', { method: 'POST', headers, body: await c.req.raw.text() });
});

// ---------------------------------------------------------------- me
/**
 * Service reachability for the signed-in app. Deliberately says nothing about
 * WHICH model or provider serves a request.
 *
 * ==========================================================================
 * DECISION (worker owner) — read this before changing the web client.
 * ==========================================================================
 * Manifest §1: users must never choose a foundation model, and provider
 * identity is an implementation detail that must not appear in normal product
 * UX. This route used to return model ids, provider names, per-model token
 * costs and per-provider health to every signed-in user, and the web app
 * rendered it as a model picker. That is precisely the payload §1 forbids.
 *
 * WHAT I CHOSE: the path is KEPT and still returns 200 to any authenticated
 * user, but the payload is now minimal and non-provider-identifying. The full
 * capability table, costs, auto-routing rationale and provider health moved
 * verbatim to `GET /api/admin/model-routing`, behind the ADMIN_KEY — §1
 * explicitly wants the routing layer kept for admin/diagnostics.
 *
 * WHY KEPT AND NOT DELETED:
 *   - Deleting it would 404 every browser still running a cached bundle. A
 *     200 with an empty model list degrades to "there is nothing to pick",
 *     which is the correct end state anyway.
 *   - `infra/smoke.mjs` probes this path as a liveness check.
 *   - The product genuinely needs ONE bit here that is not provider identity:
 *     whether this deployment can serve inference at all. That is `ready`.
 *
 * FOR THE WEB CLIENT AGENT: stop calling this for anything picker-shaped.
 * `models` and `auto` are deprecated tombstones kept only so an unmigrated
 * bundle degrades instead of throwing on `providers.models.filter(...)`;
 * they are always empty/null and will be deleted once no client reads them.
 * Read `ready` if you want to disable the composer when the service cannot
 * serve. Everything else you may have been rendering is now admin-only.
 */
/**
 * Stripe webhook. The SOURCE OF TRUTH for entitlement, not the checkout redirect.
 *
 * A user who pays and closes the tab before the redirect still bought the thing; a user who reaches
 * the success URL by typing it has not. So plan changes are driven by verified events here.
 *
 * THREE REFUSALS, EACH DELIBERATE:
 *   - no secret configured -> 503. Never "no secret, so trust the body": this endpoint's entire job
 *     is to raise entitlements, and unverified that makes it an open subscription dispenser.
 *   - bad/stale/forged signature -> 400, with the reason logged but not returned, so a prober
 *     cannot use the response to learn which part of their forgery was wrong.
 *   - no metadata.userId -> 200 and ignored. 200 because the event IS valid and Stripe must not
 *     retry it forever; ignored because attaching a plan to a guessed account is worse than to none.
 *
 * The raw body is read with .text() and parsed afterwards. Re-serialising parsed JSON changes bytes
 * and the signature would never match again.
 */
app.post('/api/billing/webhook', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: 'billing not configured' }, 503);

  const raw = await c.req.text();
  const verdict = await verifyStripeSignature(
    raw,
    c.req.header('stripe-signature') ?? null,
    secret,
    Math.floor(Date.now() / 1000),
  );
  if (!verdict.ok) {
    console.warn('billing webhook rejected:', verdict.reason);
    return c.json({ error: 'invalid signature' }, 400);
  }

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }

  const outcome = interpretStripeEvent(event);
  if (!outcome.userId) return c.json({ ok: true, ignored: outcome.ignored ?? 'no user' });

  const quota = c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(outcome.userId));
  if (outcome.subscription) {
    // Entitlement is recomputed from status and period rather than trusting the plan field, so a
    // cancelled or lapsed subscription cannot leave a paid tier behind.
    const plan = entitlementFor(outcome.subscription, Math.floor(Date.now() / 1000));
    await quota.fetch('https://do/set-plan', {
      method: 'POST',
      // The customer id rides along so the billing portal has an account to open later. It is the
      // only way back to a subscription the user started, and it arrives on these events alone.
      body: JSON.stringify({ plan, customerId: outcome.subscription.customerId }),
    });
  }
  if (outcome.creditsDelta) {
    await quota.fetch('https://do/grant-credits', { method: 'POST', body: JSON.stringify({ credits: outcome.creditsDelta }) });
  }
  return c.json({ ok: true, applied: { plan: !!outcome.subscription, credits: outcome.creditsDelta ?? 0 } });
});

/**
 * w14 — THE UPGRADE AND DOWNGRADE PATH.
 *
 * Both routes do one thing: ask Stripe for a hosted page and hand back its URL. Neither touches
 * entitlement. The user confirms on Stripe's own page, Stripe sends subscription events, and
 * `/api/billing/webhook` recomputes the plan through `entitlementFor` exactly as it always has.
 * That separation is what makes the redirect harmless — the success URL is somewhere to come back
 * to, not a claim about what happened, and a user who edits it gets nothing.
 *
 * Downgrades and cancellations go to the Billing Portal rather than to a route here. Proration,
 * tax, dunning and when a downgrade takes effect are hard, Stripe implements them, and a
 * hand-rolled cancel button that only told our own DO the plan had changed would leave the
 * subscription running and charging.
 */
app.post('/api/billing/checkout', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => ({}))) as { plan?: unknown; returnTo?: unknown };
  const plan: string = String(body.plan ?? '');
  if (!isPlanId(plan)) return c.json({ error: `unknown plan "${plan}"` }, 400);

  // The return URL is OURS, never the caller's. An attacker-supplied returnTo would turn this into
  // an open redirect signed by Stripe's domain.
  const returnTo = new URL('/app/usage', new URL(c.req.url).origin).toString();

  const built = buildCheckoutRequest(c.env, { userId: user.userId, email: user.email, plan, returnTo });
  if (!built.ok) return c.json({ error: built.error }, built.status);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: built.body,
  });
  if (!res.ok) {
    // Stripe's own message can name a price or an account; it is not for the user.
    console.warn('stripe checkout failed:', res.status, await res.text().catch(() => ''));
    return c.json({ error: 'could not open checkout' }, 502);
  }
  const session = (await res.json()) as { url?: string };
  if (!session.url) return c.json({ error: 'checkout returned no url' }, 502);
  return c.json({ url: session.url });
});

app.post('/api/billing/portal', async (c) => {
  const user = c.get('user');
  const quota = c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId));
  const { customerId } = (await (await quota.fetch('https://do/billing-customer')).json()) as {
    customerId: string | null;
  };

  const returnTo = new URL('/app/usage', new URL(c.req.url).origin).toString();
  const built = buildPortalRequest(c.env, { customerId: customerId ?? '', returnTo });
  if (!built.ok) return c.json({ error: built.error }, built.status);

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: built.body,
  });
  if (!res.ok) {
    console.warn('stripe portal failed:', res.status, await res.text().catch(() => ''));
    return c.json({ error: 'could not open the billing portal' }, 502);
  }
  const session = (await res.json()) as { url?: string };
  if (!session.url) return c.json({ error: 'the portal returned no url' }, 502);
  return c.json({ url: session.url });
});

/** What the plan controls should offer, so the UI never shows a button that cannot work. */
app.get('/api/billing/config', async (c) => {
  return c.json({
    checkout: checkoutConfigured(c.env),
    purchasable: PLAN_IDS.filter((p: PlanId) => priceIdFor(c.env, p) !== null),
  });
});

app.get('/api/providers', async (c) => {
  // `selectProvider` is a pure function of `env` — no network, no cache. Its
  // `reasoning` string names providers and is therefore NOT returned; only
  // the boolean survives.
  const ready = selectProvider(c.env, {}).ok;
  return c.json({ ready, models: [], auto: { model: null, reasoning: '' } });
});

app.get('/api/me', async (c) => {
  const user = c.get('user');
  const [profile, quotaRes] = await Promise.all([
    getProfile(c.env, user.jwt, user.userId),
    c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId)).fetch('https://do/state'),
  ]);
  const budget = (await budgetState(c.env)) as { dayRemainingFraction: number; killed: boolean };
  return c.json({
    userId: user.userId,
    email: user.email,
    profile,
    quota: await quotaRes.json(),
    // service-wide headroom, so the app can explain a shared-capacity stop honestly
    service: { capacityRemaining: budget.dayRemainingFraction, paused: budget.killed },
  });
});

app.get('/api/me/usage', async (c) => {
  const user = c.get('user');
  const res = await c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId)).fetch('https://do/history');
  return c.json(await res.json());
});

app.get('/api/docs/search', async (c) => {
  const q = (c.req.query('q') ?? '').slice(0, 300);
  if (!q.trim()) return c.json({ hits: [] });
  // embeddings cost neurons, so this is metered like any other inference
  const user = c.get('user');
  const spend = await c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId)).fetch('https://do/spend', {
    method: 'POST',
    body: JSON.stringify({ sparks: 1, kind: 'docs_search' }),
  });
  const { ok } = (await spend.json()) as { ok: boolean };
  if (!ok) return c.json({ error: 'Daily Sparks used up', hits: [] }, 429);
  try {
    const { hits, outcome, citations } = await searchDocsDetailed(c.env, q, 6);
    // `outcome` travels with the results, always — a caller that renders an empty list has to be
    // able to say WHY it is empty. `certain:false` means "nothing matched and I cannot tell you
    // that means there is no answer", which is a different sentence from "there is no answer".
    return c.json({ hits, outcome, citations });
  } catch (e) {
    if (e instanceof BudgetError) return c.json({ error: e.message, hits: [] }, 429);
    throw e;
  }
});

// ---------------------------------------------------------------- admin
/**
 * The analytics surface: cost, latency, tokens, success, errors, provider and model breakdowns,
 * feature usage and retention, computed over the stored event log.
 *
 * ADMIN ONLY, for the same reason `/api/providers` does not carry the capability table: this is
 * cross-tenant operational data. Every number in the response is a Metric — `{known:false, why}`
 * whenever it could not be computed — and `window.complete` is false whenever the log was
 * truncated, so a total read off this endpoint is never mistaken for a measurement it is not.
 */
app.get('/api/admin/analytics', async (c) => {
  await flushEvents(c.env);
  const askedDays = Number(c.req.query('days') ?? 7);
  const days = Number.isFinite(askedDays) ? Math.max(1, Math.min(30, Math.floor(askedDays))) : 7;
  const askedRetention = Number(c.req.query('retentionDays') ?? 7);
  const retentionDays = Number.isFinite(askedRetention) ? Math.max(1, Math.min(30, Math.floor(askedRetention))) : 7;
  const now = Date.now();
  const stored = await fetchStoredEvents(c.env, { sinceMs: now - days * 864e5, limit: 5000 });
  const body = summarize(stored.events, { now, truncated: stored.truncated, retentionDays });

  // An optional extra breakdown, by a dimension the caller names. The allowlist check is inside
  // `breakdownBy` and a name that is not on it comes back `{known:false}` — never an empty table,
  // which is what a working system with no traffic looks like.
  const by = c.req.query('by');
  return c.json({
    ...body,
    days,
    ...(by ? { requested: breakdownBy(stored.events, by) } : {}),
    log: { retained: stored.retained, rejected: stored.rejected, isolate: logStats() },
  });
});

/**
 * The raw logs behind the rollups: request logs, model traces, error logs, build logs, audit logs.
 * One endpoint because they are one table; `kind` selects the stream.
 */
app.get('/api/admin/logs', async (c) => {
  await flushEvents(c.env);
  const kind = readEnum(c.req.query('kind') ?? '', EVENT_KINDS);
  if (kind === null) return c.json({ error: 'unknown_kind', allowed: EVENT_KINDS }, 400);
  const askedDays = Number(c.req.query('days') ?? 7);
  const days = Number.isFinite(askedDays) ? Math.max(1, Math.min(30, Math.floor(askedDays))) : 7;
  const askedLimit = Number(c.req.query('limit') ?? 200);
  const limit = Number.isFinite(askedLimit) ? Math.max(1, Math.min(2000, Math.floor(askedLimit))) : 200;
  const stored = await fetchStoredEvents(c.env, { sinceMs: Date.now() - days * 864e5, limit, kind });
  return c.json({ kind, days, truncated: stored.truncated, retained: stored.retained, events: stored.events });
});

app.get('/api/admin/stats', async (c) => {
  const res = await adminStub(c.env).fetch('https://do/stats');
  return c.json(await res.json());
});

app.post('/api/admin/model-test', async (c) => {
  const body = await c.req.json<{ model: string; prompt: string; tools?: boolean; system?: string; rag?: boolean; maxTokens?: number }>();
  const t0 = Date.now();
  try {
    let userContent = body.prompt;
    //[[ WHAT THE RETRIEVAL ACTUALLY DID IS PART OF THE TEST RESULT.
    //
    //   This used to be `searchDocs(...).catch(() => [])`, which turned every retrieval fault into
    //   "RAG found nothing" — so a model-versus-model comparison run with `rag: true` against an
    //   index that was empty, or a Vectorize that was down, measured the models WITHOUT the
    //   documentation while the run recorded that it had it. The comparison then answers a
    //   different question than the one that was asked, and says nothing about the substitution.
    //
    //   Now the outcome travels in the response, the injected context carries the citation markers
    //   the answer is told to use, and the answer is audited against them. ]]
    let retrieval: { outcome: RetrievalOutcome; sources: number } | null = null;
    let citations: Citation[] = [];
    if (body.rag) {
      const found = await searchDocsDetailed(c.env, body.prompt.slice(0, 500), 4).catch((e) => {
        console.warn('model-test: retrieval failed', String(e));
        return null;
      });
      if (found) {
        retrieval = { outcome: found.outcome, sources: found.citations.length };
        citations = found.citations;
        if (found.hits.length) {
          const ctxBlock = renderCitedContext(found.hits.map((h) => ({ ...h, id: h.vecId })), found.citations, { excerptChars: 1200 });
          userContent = `Relevant official Roblox documentation. Cite it by its [n] marker:\n\n${ctxBlock}\n\n---\n\n${body.prompt}`;
        }
      }
    }
    const res = await llmChat(c.env, {
      model: body.model,
      messages: [
        { role: 'system', content: body.system ?? 'You are a helpful assistant. Be brief.' },
        { role: 'user', content: userContent },
      ],
      tools: body.tools
        ? [{ name: 'echo_tool', description: 'Echo a message back (test tool)', parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }]
        : undefined,
      maxTokens: body.maxTokens ?? 1600,
    });
    // A marker pointing at a source the model was never shown makes a sentence look sourced, and it
    // survives review. If it is going to be caught at all it has to be caught here, where the
    // sources are still in hand.
    const answer = typeof (res as { text?: unknown }).text === 'string' ? (res as { text: string }).text : '';
    const cited = body.rag ? auditCitations(answer, citations) : null;
    return c.json({ ok: true, ms: Date.now() - t0, retrieval, cited, ...res });
  } catch (e) {
    return c.json({ ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.get('/api/admin/models', async (c) => c.json(await getModels(c.env)));

/**
 * The routing layer, in full — ADMIN ONLY.
 *
 * This is where `GET /api/providers` used to publish model ids, provider
 * names, per-1M token costs, auto-selection rationale and provider health to
 * every signed-in user. Manifest §1 keeps that information for
 * admin/diagnostics and takes it out of normal product UX, so it lives here,
 * behind ADMIN_KEY, and nowhere else.
 *
 * Named `model-routing` rather than `providers` on purpose: `/api/providers`
 * still exists as a user route, and two paths differing only by an `/admin/`
 * segment is exactly the kind of pair that gets mixed up in a client.
 *
 * Availability is computed from `env` on every request — never cached, never
 * hardcoded — so this cannot report a provider as usable when no credential
 * for it exists. Fields are whitelisted one by one rather than spread: a
 * future field on CapabilityRow must be reviewed before it can egress, even
 * to an admin.
 *
 * `lastError.message` is STILL withheld, admin surface or not. It is the
 * upstream provider's own string, verbatim and length-uncapped, and a
 * provider's 401 body can quote the key it rejected. Moving this behind the
 * admin key was not a licence to start echoing credentials into a response
 * body; `kind` plus `at` is what diagnostics actually needs, and
 * /api/admin/raw-probe already exists for reproducing a specific failure.
 */
app.get('/api/admin/model-routing', async (c) => {
  const rows = capabilityTable(c.env);
  const auto = selectProvider(c.env, {});
  return c.json({
    models: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      label: r.displayName,
      available: r.available,
      // both halves of availability: the machine-readable reason and the
      // human detail. Admins are the audience that needs to know WHY.
      unavailableReason: r.available ? null : r.unavailableReason,
      reason: r.available ? null : r.availabilityDetail,
      unsupportedModelKeys: r.unsupportedModelKeys ?? [],
      supportsTools: r.supportsTools,
      supportsVision: r.supportsVision,
      contextWindow: r.contextWindow,
      maxOutput: r.maxOutput,
      inputCostPer1M: r.inputCostPer1M,
      outputCostPer1M: r.outputCostPer1M,
      unverifiedFields: r.unverifiedFields ?? [],
    })),
    auto: auto.ok
      ? { model: auto.model.id, provider: auto.provider, reasoning: auto.reasoning, rejected: auto.rejected }
      : { model: null, provider: null, reasoning: auto.reasoning, rejected: auto.rejected },
    health: providerHealth().map((h) => ({
      provider: h.provider,
      calls: h.calls,
      ok: h.ok,
      failed: h.failed,
      lastLatencyMs: h.lastLatencyMs,
      medianLatencyMs: h.medianLatencyMs,
      lastAt: h.lastAt,
      lastError: h.lastError ? { kind: h.lastError.kind, at: h.lastError.at } : null,
    })),
  });
});

/**
 * Raw provider response, for adapting the normalizer to a new model's shape.
 *
 * The call itself is NOT made here. It goes through `rawProbe()` in the gateway, which reserves
 * against the global neuron ledger before the model runs and settles the real cost afterwards —
 * so the kill switch and the daily/monthly caps refuse this probe exactly as they refuse a chat
 * turn. This route used to call `c.env.AI.run` directly and was the one way in the product to
 * spend model tokens without a reservation. It charges no user Sparks: QuotaDO is untouched.
 */
app.post('/api/admin/raw-probe', async (c) => {
  const { model, prompt, system, tools, maxTokens, reasoning, sessionId } = await c.req.json<{
    model: string;
    prompt: string;
    /** optional system message, so the real production prompt can be reproduced exactly */
    system?: string;
    /** optional tool definitions, so tool-calling behaviour can be probed, not just prose */
    tools?: { name: string; description: string; parameters: unknown }[];
    maxTokens?: number;
    reasoning?: string;
    /**
     * Workers AI prefix-caching affinity key. Sending the same value on consecutive probes is what
     * lets the shared prefix be reused; omitting it is the old behaviour, under which cached_tokens
     * was always 0. Present so the two can be compared in one experiment rather than argued about.
     */
    sessionId?: string;
  }>();
  const shape = (o: unknown, d = 0): unknown => {
    if (o === null || typeof o !== 'object') return typeof o === 'string' ? `str(${o.length}):${o.slice(0, 120)}` : o;
    if (Array.isArray(o)) return o.slice(0, 3).map((x) => shape(x, d + 1));
    if (d > 7) return '…';
    return Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, v]) => [k, shape(v, d + 1)]));
  };
  try {
    const { raw, neurons } = await rawProbe(c.env, { model, prompt, system, tools, maxTokens, reasoning, sessionId });
    // usage is surfaced directly: the whole point of a probe is the numbers, and prompt_tokens_details
    // .cached_tokens is the one that answers whether prefix caching engaged.
    const u = (raw as { usage?: unknown; result?: { usage?: unknown } })?.usage ?? (raw as { result?: { usage?: unknown } })?.result?.usage;
    return c.json({ keys: Object.keys(raw as object), usage: u, shape: shape(raw), neurons });
  } catch (e) {
    // A cap hit or the kill switch is a refusal, not a crash: say so, with the reason.
    if (e instanceof BudgetError) return c.json({ error: e.message, reason: e.reason }, 429);
    throw e;
  }
});

/** Full AI spend picture: today, this month, per-model, per-purpose, against the hard caps. */
app.get('/api/admin/spend', async (c) => c.json(await budgetReport(c.env)));

/** Emergency stop. Flips a flag the gateway checks before every single inference call. */
/** Tune the hard caps without a redeploy. Lowering takes effect on the very next call. */
app.post('/api/admin/spend-limits', async (c) => {
  const body = await c.req.json<Record<string, number>>();
  const stub = c.env.BUDGET_DO.get(c.env.BUDGET_DO.idFromName('singleton'));
  const res = await stub.fetch('https://do/limits', { method: 'POST', body: JSON.stringify(body) });
  return c.json(await res.json());
});

/** "Would a call of this size be allowed right now?" — no tokens spent. */
app.post('/api/admin/spend-probe', async (c) => {
  const { neurons } = await c.req.json<{ neurons: number }>();
  const stub = c.env.BUDGET_DO.get(c.env.BUDGET_DO.idFromName('singleton'));
  return c.json(await (await stub.fetch('https://do/probe', { method: 'POST', body: JSON.stringify({ neurons }) })).json());
});

/** Test hook: move the spend ledger without calling a model, to exercise the caps. */
app.post('/api/admin/spend-simulate', async (c) => {
  const { neurons } = await c.req.json<{ neurons: number }>();
  const stub = c.env.BUDGET_DO.get(c.env.BUDGET_DO.idFromName('singleton'));
  return c.json(await (await stub.fetch('https://do/simulate-usage', { method: 'POST', body: JSON.stringify({ neurons }) })).json());
});

/** Clears the spend ledger (used after testing). Real usage rolls over on its own. */
app.post('/api/admin/spend-reset', async (c) => {
  const stub = c.env.BUDGET_DO.get(c.env.BUDGET_DO.idFromName('singleton'));
  return c.json(await (await stub.fetch('https://do/reset-ledger', { method: 'POST' })).json());
});

app.post('/api/admin/kill-switch', async (c) => {
  const { killed, reason } = await c.req.json<{ killed: boolean; reason?: string }>();
  return c.json(await setKillSwitch(c.env, !!killed, reason));
});

app.post('/api/admin/config', async (c) => {
  const { key, value } = await c.req.json<{ key: string; value: unknown }>();
  if (!key.startsWith('config:')) return c.json({ error: 'key must start with config:' }, 400);
  await c.env.KV.put(key, JSON.stringify(value));
  return c.json({ ok: true });
});

app.post('/api/admin/corpus-init', async (c) => {
  await c.env.CORPUS.exec(
    `create table if not exists chunks(rowid integer primary key autoincrement, vec_id text unique, doc_slug text, title text, url text, kind text, text text)`
  );
  // Three columns the index needs to describe itself, added to the table rather than kept in a
  // second one so a census is a single count:
  //   embedded    — whether a vector exists for this row. An index of 8,000 rows and no vectors is
  //                 keyword-only, and it looks identical to a healthy one until someone asks a
  //                 question only semantic search could answer.
  //   indexed_at  — when the row was written. Freshness has to read something.
  //   content_hash — what was written, so a re-index can skip what did not change.
  // Deployed databases predate all three, and `create table if not exists` will not add them. D1
  // has no `add column if not exists`, so the failure is caught: on an already-migrated database it
  // is a duplicate-column error and nothing else, exactly as asset-library.ts does it.
  for (const col of ['embedded integer not null default 0', 'indexed_at integer', 'content_hash text']) {
    try {
      await c.env.CORPUS.exec(`alter table chunks add column ${col}`);
    } catch {
      // already present
    }
  }
  await c.env.CORPUS.exec(
    `create virtual table if not exists chunks_fts using fts5(vec_id unindexed, title, url unindexed, text)`
  );
  return c.json({ ok: true });
});

app.post('/api/admin/embed-batch', async (c) => {
  const { chunks, skipVectors } = await c.req.json<{
    chunks: { vecId: string; docSlug: string; title: string; url: string; kind: string; text: string; contentHash?: string }[];
    skipVectors?: boolean;
  }>();
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 60) return c.json({ error: '1-60 chunks per batch' }, 400);
  if (!skipVectors) {
    const vectors = await embed(c.env, chunks.map((ch) => `${ch.title}\n${ch.text}`.slice(0, 2000)));
    await c.env.VEC.upsert(chunks.map((ch, i) => ({ id: ch.vecId, values: vectors[i]!, metadata: { slug: ch.docSlug, kind: ch.kind } })));
  }
  const now = Date.now();
  const stmtChunks = c.env.CORPUS.prepare(
    `insert into chunks(vec_id, doc_slug, title, url, kind, text, embedded, indexed_at, content_hash) values(?,?,?,?,?,?,?,?,?) on conflict(vec_id) do update set title=excluded.title, url=excluded.url, kind=excluded.kind, text=excluded.text, embedded=max(chunks.embedded, excluded.embedded), indexed_at=excluded.indexed_at, content_hash=excluded.content_hash`
  );
  //[[ FTS5 HAS NO UNIQUE CONSTRAINT, so a plain insert is an APPEND.
  //
  //   `chunks` upserts on `vec_id` and `chunks_fts` did not, so re-uploading the corpus — which the
  //   uploader does from scratch whenever chunks.jsonl changes at all — left the old row in the
  //   full-text index beside the new one. Two uploads, two copies of every passage; the keyword
  //   half then returns the same document twice, RRF counts it twice, and the stale copy outranks
  //   the corrected one as often as not. Delete-then-insert makes the write idempotent. ]]
  const stmtFtsDel = c.env.CORPUS.prepare(`delete from chunks_fts where vec_id = ?`);
  const stmtFts = c.env.CORPUS.prepare(`insert into chunks_fts(vec_id, title, url, text) values(?,?,?,?)`);
  const batch: D1PreparedStatement[] = [];
  for (const ch of chunks) {
    batch.push(stmtChunks.bind(ch.vecId, ch.docSlug, ch.title, ch.url, ch.kind, ch.text, skipVectors ? 0 : 1, now, typeof ch.contentHash === 'string' ? ch.contentHash : null));
    batch.push(stmtFtsDel.bind(ch.vecId));
    batch.push(stmtFts.bind(ch.vecId, ch.title, ch.url, ch.text));
  }
  await c.env.CORPUS.batch(batch);
  return c.json({ ok: true, upserted: chunks.length });
});

/**
 * What is ACTUALLY indexed, so a re-index can be a difference rather than a repetition.
 *
 * Paged by rowid. The uploader's local progress file records what it believes it sent; this
 * records what the index holds. They disagree whenever an upload was interrupted, whenever a
 * deploy replaced the database, and whenever two people uploaded different corpora — and the
 * difference is the whole value of asking.
 */
app.get('/api/admin/corpus-manifest', async (c) => {
  const askedLimit = Number(c.req.query('limit') ?? 1000);
  const limit = Number.isFinite(askedLimit) ? Math.max(1, Math.min(2000, Math.floor(askedLimit))) : 1000;
  const askedAfter = Number(c.req.query('after') ?? 0);
  const after = Number.isFinite(askedAfter) ? Math.max(0, Math.floor(askedAfter)) : 0;
  try {
    const rows = await c.env.CORPUS.prepare(
      `select rowid as rid, vec_id, content_hash, embedded, indexed_at from chunks where rowid > ? order by rowid limit ?`,
    )
      .bind(after, limit)
      .all<{ rid: number; vec_id: string; content_hash: string | null; embedded: number | null; indexed_at: number | null }>();
    const entries = rows.results.map((r) => ({
      vecId: r.vec_id,
      contentHash: r.content_hash,
      embedded: r.embedded === 1,
      indexedAt: r.indexed_at,
    }));
    const last = rows.results.length ? rows.results[rows.results.length - 1]!.rid : after;
    return c.json({ known: true, entries, nextAfter: entries.length === limit ? last : null });
  } catch (e) {
    // An unreadable manifest is NOT an empty manifest. Returning `entries: []` here would tell the
    // uploader that nothing is indexed and make it re-embed the entire corpus at real cost.
    console.warn('corpus-manifest failed:', String(e));
    return c.json({ known: false, why: 'the corpus manifest could not be read', entries: [] }, 503);
  }
});

/** Remove passages that no longer exist upstream, from both halves of the index and the vectors. */
app.post('/api/admin/corpus-prune', async (c) => {
  const { vecIds } = await c.req.json<{ vecIds: string[] }>();
  if (!Array.isArray(vecIds) || vecIds.length === 0 || vecIds.length > 200) return c.json({ error: '1-200 vecIds per call' }, 400);
  const ids = vecIds.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (!ids.length) return c.json({ error: 'no usable vecIds' }, 400);
  const delChunk = c.env.CORPUS.prepare(`delete from chunks where vec_id = ?`);
  const delFts = c.env.CORPUS.prepare(`delete from chunks_fts where vec_id = ?`);
  await c.env.CORPUS.batch(ids.flatMap((id) => [delChunk.bind(id), delFts.bind(id)]));
  // The vector store is a separate system and can refuse independently. Saying which half
  // succeeded is the difference between "pruned" and "pruned from the table the query joins".
  let vectorsDeleted = false;
  try {
    await c.env.VEC.deleteByIds(ids);
    vectorsDeleted = true;
  } catch (e) {
    console.warn('corpus-prune: vector delete failed:', String(e));
  }
  return c.json({ ok: true, rows: ids.length, vectorsDeleted });
});

/** What the index holds, and whether it holds anything at all. */
app.get('/api/admin/corpus-census', async (c) => {
  const census = await corpusCensus(c.env);
  // `null` is not `{chunks: 0}`. A census that could not be read must never be rendered as an
  // empty index — that is the same lie in the other direction.
  return c.json(census ? { known: true, ...census } : { known: false, why: 'the corpus tables could not be counted' });
});

app.post('/api/admin/rag-test', async (c) => {
  const { query } = await c.req.json<{ query: string }>();
  const res = await searchDocsDetailed(c.env, query, 5);
  return c.json({
    outcome: res.outcome,
    citations: res.citations,
    hits: res.hits.map((h) => ({ title: h.title, url: h.url, score: h.score, fusedScore: h.fusedScore, preview: h.text.slice(0, 200) })),
  });
});

/** Clear a user's Spark usage for a day, so the visual benchmark can be run more than once daily. */
app.post('/api/admin/quota-reset', async (c) => {
  const { userId, day } = await c.req.json<{ userId: string; day?: string }>();
  const res = await c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(userId)).fetch('https://do/reset', {
    method: 'POST',
    body: JSON.stringify({ day }),
  });
  return c.json(await res.json());
});

app.post('/api/admin/set-plan', async (c) => {
  const { userId, plan } = await c.req.json<{ userId: string; plan: 'free' | 'builder' }>();
  const res = await c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(userId)).fetch('https://do/set-plan', {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
  return c.json(await res.json());
});

app.get('/api/admin/session-info/:id', async (c) => {
  const res = await sessionStub(c.env, c.req.param('id')).fetch('https://do/info');
  return c.json(await res.json());
});

/**
 * Raw vision access for the eval harness: it brings its own 20-dimension rubric prompt and its own
 * PNGs, and only needs a model to look at them. Kept separate from /api/admin/critique, which is
 * the product's own opinionated 8-dimension critique — the eval must be free to disagree with the
 * product's judgement rather than inherit it.
 */
app.post('/api/admin/vision-critique', async (c) => {
  const { prompt, images, responseFormat } = await c.req.json<{
    prompt: string;
    images: { mediaType: string; base64: string }[];
    responseFormat?: string;
  }>();
  if (!prompt || !Array.isArray(images) || !images.length) return c.json({ ok: false, error: 'prompt and images required' }, 400);
  const content = [
    { type: 'text' as const, text: prompt },
    ...images.map((i) => ({ type: 'image_url' as const, image_url: { url: `data:${i.mediaType};base64,${i.base64}` } })),
  ];
  try {
    const res = await llmChat(
      c.env,
      {
        model: 'vision',
        messages: [{ role: 'user', content }],
        // `high`, never `medium`: measured, medium spends the whole budget on reasoning and
        // returns an empty string. See docs/COST-MODEL.md.
        reasoningEffort: 'high',
        maxTokens: 4000,
        ...(responseFormat === 'json' ? {} : {}),
      },
      { kind: 'eval:vision-critique', cacheTtl: 0 },
    );
    return c.json({ ok: true, text: res.text, neurons: res.neurons });
  } catch (e) {
    if (e instanceof BudgetError) return c.json({ ok: false, error: e.message, reason: e.reason }, 429);
    throw e;
  }
});

/**
 * Critique rendered views. This is how the visual eval harness reaches a vision model: the
 * grader has no Workers AI binding of its own, and routing it through here means eval spend is
 * counted by the same budget ledger as everything else rather than escaping it.
 */
app.post('/api/admin/critique', async (c) => {
  const { subject, boundsSize, views, lighting, intent, passThreshold, subjectKind } = await c.req.json<{
    subject?: string;
    boundsSize?: [number, number, number];
    views: RenderViewResult['views'];
    lighting?: RenderViewResult['lighting'];
    intent: string;
    passThreshold?: number;
    /** 'prop' judges one object; 'scene' judges a place. Inferred from bounds when omitted. */
    subjectKind?: 'prop' | 'scene';
  }>();
  if (!Array.isArray(views) || !views.length) return c.json({ error: 'views required' }, 400);
  const result: RenderViewResult = { subject: subject ?? 'scene', boundsSize: boundsSize ?? [0, 0, 0], views, lighting };
  try {
    return c.json(await critiqueViews(c.env, result, intent ?? 'a well-built Roblox scene', { passThreshold, subject: subjectKind }));
  } catch (e) {
    if (e instanceof BudgetError) return c.json({ error: e.message, reason: e.reason }, 429);
    throw e;
  }
});

/**
 * Run a single Studio op against a paired project, with no agent loop and no inference.
 * The visual eval harness captures renders through this: driving a model to ask for a screenshot
 * would make every eval run cost money and would confound what the eval is measuring.
 */
/**
 * Start a real agent run on a project, owner-key gated. The visual benchmark suite drives builds
 * through this — an automated regression run cannot have a human typing chat messages — and it
 * takes exactly the path a chat message takes, so it measures the real agent.
 */
app.post('/api/admin/agent-run/:id', async (c) => {
  const res = await sessionStub(c.env, c.req.param('id')).fetch('https://do/agent-run', {
    method: 'POST',
    body: JSON.stringify(await c.req.json()),
  });
  return c.json(await res.json(), res.status as 200);
});

/** Read a project's transcript, owner-key gated — the benchmark suite records what the agent said. */
app.get('/api/admin/session-messages/:id', async (c) => {
  const url = new URL(c.req.url);
  const res = await sessionStub(c.env, c.req.param('id')).fetch(`https://do/messages?${url.searchParams}`);
  return c.json(await res.json());
});

/** Admin-only: invoke a single agent tool against a live session. Used to prove tool behaviour. */
app.post('/api/admin/run-tool/:id', async (c) => {
  const res = await sessionStub(c.env, c.req.param('id')).fetch('https://do/run-tool', {
    method: 'POST',
    body: JSON.stringify(await c.req.json()),
  });
  return c.json(await res.json(), res.status as 200);
});

/**
 * Ops this diagnostics route may forward. An allowlist rather than a denylist, so a new op is
 * unreachable from here until somebody decides it belongs.
 *
 * The route existed to let the smoke test, the store validation and the visual benchmark drive a
 * paired plugin without an agent loop, and it forwarded whatever JSON it was given — so an admin
 * key was enough to post `{op:'insert_asset'}` and put an arbitrary asset id into a place, skipping
 * the metadata gate, the post-insertion script scan and the audit row that `insert_asset` the TOOL
 * runs. `insert_asset` and `generate_model` are the two ops that bring content in from outside the
 * place, and they are precisely the two an unvalidated bypass must not reach; both are still
 * available through /api/admin/run-tool, which goes through the gate.
 *
 * The list is what the harnesses in infra/ and packages/evals actually send, and no more.
 */
const ADMIN_STUDIO_OPS = new Set<StudioOp['op']>([
  'ping',
  'get_tree',
  'get_instance',
  'list_scripts',
  'read_script',
  'search_scripts',
  'get_logs',
  'get_selection',
  'select',
  'camera_focus',
  'viewport_info',
  'render_view',
  'screenshot',
  'create_instances',
  'set_props',
  'delete_instances',
  'move_instances',
  'undo_waypoint',
  'run_code',
]);

app.post('/api/admin/studio-op/:id', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { op?: StudioOp; timeoutMs?: number } | null;
  const kind = body?.op?.op;
  if (!kind || !ADMIN_STUDIO_OPS.has(kind)) {
    return c.json(
      {
        error: `${kind ?? 'that'} is not a diagnostics op. This route forwards inspection and build ops only; anything that brings an asset into the place goes through /api/admin/run-tool so it passes the same gate the agent does.`,
      },
      400,
    );
  }
  // `run_code` here is the same channel as the run_luau tool, so it gets the same filter: an admin
  // key is a key to the diagnostics surface, not a way around the asset gate.
  if (kind === 'run_code') {
    const refusal = refuseLuauIngress(String((body?.op as { code?: unknown }).code ?? ''));
    if (refusal) return c.json(refusal, 400);
  }
  /* The plugin reads MORE off the op than the StudioOp union declares.
     `Ops.assetPolicyFor` honours `op.verifiedAssetIds`, which is how the worker
     tells the plugin an asset id has already been through the gate. This route
     hands the plugin untyped JSON, so a caller could include that field inside
     the op and grant themselves any id they liked — turning an admin key into a
     way around the asset gate rather than a key to the diagnostics surface.

     Stripped rather than rejected, because a diagnostics caller has no reason to
     assert that anything was verified: the only honest value here is "nothing
     was". Note this is a property of the OP, not the envelope — the first
     version of this fix rebuilt the envelope and left the field untouched inside
     `op`, which closed nothing. The comment above about assets going through
     /api/admin/run-tool is only true with this in place. */
  const { verifiedAssetIds: _dropped, ...safeOp } = (body?.op ?? {}) as Record<string, unknown>;
  const forwarded = { op: safeOp, timeoutMs: body?.timeoutMs };
  const res = await sessionStub(c.env, c.req.param('id')).fetch('https://do/studio-op', {
    method: 'POST',
    body: JSON.stringify(forwarded),
  });
  return c.json(await res.json(), res.status as 200);
});

// ---------------------------------------------------------------- static serving (D1-backed)
app.post('/api/admin/static-upload', async (c) => {
  const { path, contentType, b64, immutable, append } = await c.req.json<{
    path: string;
    contentType?: string;
    b64: string;
    immutable?: boolean;
    append?: boolean;
  }>();
  if (!path?.startsWith('/')) return c.json({ error: 'path must start with /' }, 400);
  await ensureStaticTables(c.env);
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  let idx = 0;
  if (append) {
    const row = await c.env.CORPUS.prepare(`select n_chunks from static_assets where path = ?`).bind(path).first<{ n_chunks: number }>();
    idx = row?.n_chunks ?? 0;
  } else {
    await c.env.CORPUS.prepare(`delete from static_chunks where path = ?`).bind(path).run();
  }
  await c.env.CORPUS.prepare(`insert into static_chunks(path, idx, data) values(?,?,?)`).bind(path, idx, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).run();
  await c.env.CORPUS.prepare(
    `insert into static_assets(path, n_chunks, content_type, immutable, updated_at) values(?,?,?,?,?)
     on conflict(path) do update set n_chunks=excluded.n_chunks, content_type=excluded.content_type, immutable=excluded.immutable, updated_at=excluded.updated_at`
  )
    .bind(path, idx + 1, contentType ?? null, immutable ? 1 : 0, Date.now())
    .run();
  // bust edge cache for this path
  await caches.default.delete(new Request(`https://static-cache${path}`)).catch(() => {});
  return c.json({ ok: true, path, chunks: idx + 1, bytes: bytes.length });
});

app.get('/api/admin/static-list', async (c) => {
  await ensureStaticTables(c.env);
  const rows = await c.env.CORPUS.prepare(`select path, n_chunks, content_type, immutable, updated_at from static_assets order by path`).all();
  return c.json(rows.results);
});

// ---------------------------------------------------------------- API keys (JWT-authenticated)
/**
 * Mint an API key.
 *
 * THIS ROUTE IS WHERE PROJECT AUTHORISATION IS DECIDED, once, for the whole life of the key — see
 * the long note at the top of api-keys.ts. Every project id the caller asks for is checked against
 * Postgres with THEIR OWN JWT so RLS answers the ownership question, and only the ids that survive
 * are frozen into the key. `/v1/*` never re-asks, because it has no JWT to ask with.
 *
 * The secret is returned exactly once. Only its SHA-256 is stored, so nobody — including this
 * worker, and including anyone who obtains the database — can recover it afterwards.
 */
app.post('/api/keys', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    name?: unknown;
    mode?: unknown;
    scopes?: unknown;
    projectIds?: unknown;
    expiresInDays?: unknown;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'expected a JSON body' }, 400);

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (!name) return c.json({ error: 'name is required' }, 400);

  const mode = KEY_MODES.find((m) => m === body.mode);
  if (!mode) return c.json({ error: `mode must be one of ${KEY_MODES.join(', ')}` }, 400);

  const scopes = normaliseScopes(body.scopes);
  if (!scopes) return c.json({ error: `scopes must be a non-empty subset of ${API_SCOPES.join(', ')}` }, 400);

  // `??` would defend undefined and null only: `expiresInDays: "30"`, NaN and Infinity would all
  // survive it and then `Date.now() + days * 864e5` is NaN, which `authorizeKey` reads as a
  // corrupt expiry — a key that never works. Refuse at the door instead.
  let expiresAt: number | null = null;
  if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
    const d = body.expiresInDays;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 365) {
      return c.json({ error: 'expiresInDays must be an integer between 1 and 365' }, 400);
    }
    expiresAt = Date.now() + d * 86_400_000;
  }

  const wanted = body.projectIds;
  if (wanted !== undefined && !Array.isArray(wanted)) return c.json({ error: 'projectIds must be an array' }, 400);
  const ids = (Array.isArray(wanted) ? wanted : []).slice(0, 20);
  const projects: GrantedProject[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) return c.json({ error: `not a project id: ${String(id).slice(0, 40)}` }, 400);
    const row = await getOwnedProject(c.env, user.jwt, id);
    // RLS returned nothing: either the project does not exist or it is not theirs. One answer for
    // both, so minting cannot be used to enumerate other people's project ids.
    if (!row) return c.json({ error: 'one of those projects is not yours', projectId: id }, 403);
    projects.push({ id: row.id, name: row.name });
  }

  const minted = await mintKey(mode as KeyMode);
  const rec: ApiKeyRecord = {
    id: minted.id,
    userId: user.userId,
    mode: minted.mode,
    name,
    scopes,
    projects,
    createdAt: Date.now(),
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
  };
  await insertApiKey(c.env, { ...rec, hash: minted.hash });
  void count(c.env, `api_key_created_${minted.mode}`);
  return c.json({ ...publicKeyShape(rec), key: minted.key }, 201);
});

app.get('/api/keys', async (c) => {
  const user = c.get('user');
  const keys = await listApiKeys(c.env, user.userId);
  return c.json({ keys: keys.map(publicKeyShape) });
});

/**
 * Rotate a key: mint a replacement carrying the SAME grant, and bring the old key's expiry forward
 * so both work during the changeover.
 *
 * The grant is read from the stored record, never from the request body. A rotate that accepted
 * scopes or projectIds would be a mint wearing a maintenance verb — and the caller who wanted a
 * wider grant would use it rather than asking for one. planRotation decides everything; this route
 * is the wiring.
 */
app.post('/api/keys/:id/rotate', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ graceHours?: unknown }>().catch(() => ({}) as { graceHours?: unknown });

  // `??` would let "24", NaN and Infinity through, and `now + NaN` is a corrupt expiry that
  // authorizeKey reads as a key that never works. Refuse at the door, as minting does.
  let graceHours = 24;
  if (body?.graceHours !== undefined && body.graceHours !== null) {
    const h = body.graceHours;
    if (typeof h !== 'number' || !Number.isFinite(h) || h < 0 || h > 720) {
      return c.json({ error: 'graceHours must be a number between 0 and 720' }, 400);
    }
    graceHours = h;
  }

  // Only this user's keys are listed, so a key belonging to somebody else is indistinguishable
  // from one that does not exist — the same answer minting gives for a project that is not yours.
  const existing = (await listApiKeys(c.env, user.userId)).find((k) => k.id === c.req.param('id'));
  if (!existing) return c.json({ error: 'not found' }, 404);

  const plan = planRotation(existing, { now: Date.now(), graceMs: graceHours * 36e5 });
  if (!plan.ok) return c.json({ error: plan.message, code: plan.code }, plan.status);

  const minted = await mintKey(plan.replacement.mode);
  const rec: ApiKeyRecord = {
    id: minted.id,
    userId: plan.replacement.userId,
    mode: minted.mode,
    name: plan.replacement.name,
    scopes: plan.replacement.scopes,
    projects: plan.replacement.projects,
    createdAt: Date.now(),
    expiresAt: plan.replacement.expiresAt,
    lastUsedAt: null,
    revokedAt: null,
  };
  await insertApiKey(c.env, { ...rec, hash: minted.hash });
  // The replacement is stored BEFORE the old key is retired. If the retire fails, the worst case is
  // two live keys — the other order risks a window with none, locking the caller out of their own
  // rotation.
  const retired = await retireApiKey(c.env, user.userId, existing.id, plan.retireAt);
  void count(c.env, 'api_key_rotated');
  return c.json(
    {
      ...publicKeyShape(rec),
      key: minted.key,
      replaces: existing.id,
      retiresAtIso: new Date(plan.retireAt).toISOString(),
      // A failed retire is REPORTED, not swallowed: the caller has two live keys and needs to know
      // which one to revoke by hand.
      ...(retired ? {} : { warning: 'the replacement was created but the old key could not be retired — revoke it manually' }),
    },
    201,
  );
});

app.delete('/api/keys/:id', async (c) => {
  const user = c.get('user');
  const ok = await revokeApiKey(c.env, user.userId, c.req.param('id'), Date.now());
  if (!ok) return c.json({ error: 'not found' }, 404);
  void count(c.env, 'api_key_revoked');
  return c.json({ ok: true });
});

// ================================================================ PUBLIC API (/v1)
//
// Authenticated by API key, not by the user's JWT. Everything decided here is decided from
// public-api.ts's route table, so a path that is not in that table cannot be served — see
// `matchRoute`. The middleware below is the whole guard: request id, version, key, rate limit,
// scope, project grant. Handlers may assume all six have been settled.

/** Per-isolate, per-key window. Best-effort like `ipHits`, and for the same reason. */
const keyBuckets = new Map<string, RateBucket>();
const KEY_WINDOW_MS = 60_000;

/** Every `/v1` response carries these, success or failure. */
app.use('/v1/*', async (c, next) => {
  const requestId = sanitizeRequestId(c.req.header(REQUEST_ID_HEADER)) ?? newRequestId();
  c.set('requestId', requestId);
  await next();
  c.header(REQUEST_ID_HEADER, requestId);
  c.header(API_VERSION_HEADER, c.get('apiVersion') ?? CURRENT_API_VERSION);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  // The limiter's verdict belongs on the 200s too. Headers that only appear once you are already
  // being throttled tell a client how to react to a failure, not how to avoid one.
  const rate = c.get('rate');
  if (rate) for (const [k, v] of Object.entries(rateLimitHeaders(rate))) c.header(k, v);
  const route = c.get('route');
  if (route) for (const [k, v] of Object.entries(deprecationHeaders(route))) c.header(k, v);
});

app.use('/v1/*', async (c, next) => {
  const requestId = c.get('requestId');
  const refuse = (status: 400 | 401 | 403 | 404 | 429, code: string, message: string) =>
    c.json(errorBody(status, code, message, requestId), status);

  const version = resolveApiVersion(c.req.header(API_VERSION_HEADER));
  if (!version.ok) {
    return refuse(
      400,
      'unsupported_api_version',
      `Unknown ${API_VERSION_HEADER} '${version.requested}'. This deployment serves ${CURRENT_API_VERSION}.`,
    );
  }
  c.set('apiVersion', version.version);

  // A path the table does not describe is 404 BEFORE any credential is looked at. The failure mode
  // of this guard has to be "unreachable", never "unguarded".
  const match = matchRoute(c.req.method, new URL(c.req.url).pathname);
  if (!match) return refuse(404, 'unknown_route', 'No such endpoint. GET /v1 lists what this API serves.');
  c.set('route', match.route);

  const presented = apiKeyFromRequest(c.req.raw);
  const parsed = parseApiKey(presented);
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (!parsed) {
    // Bound guessing from one address, the same way the admin gate does. A malformed key never
    // reaches storage, so this only limits the cheap case — but the cheap case is the one an
    // attacker can run at line rate.
    if (ipLimited(`apikey-fail:${ip}`, 120)) return refuse(429, 'rate_limit_exceeded', 'Too many failed authentications.');
    return refuse(401, 'invalid_api_key', 'Provide an API key as `Authorization: Bearer gk_live_…`.');
  }
  const record = await findApiKeyByHash(c.env, await keyHash(presented!));
  if (!record) {
    if (ipLimited(`apikey-fail:${ip}`, 120)) return refuse(429, 'rate_limit_exceeded', 'Too many failed authentications.');
    return refuse(401, 'invalid_api_key', 'That API key does not exist.');
  }

  const now = Date.now();
  const rate = rateLimitCheck(keyBuckets, `key:${record.id}`, rateLimitFor(record.mode), KEY_WINDOW_MS, now);
  c.set('rate', rate);
  if (!rate.allowed) {
    return refuse(429, 'rate_limit_exceeded', `This key is limited to ${rate.limit} requests a minute.`);
  }

  const verdict = authorizeKey(record, {
    scope: match.route.scope,
    projectId: match.params.id ?? null,
    now,
  });
  if (!verdict.ok) return refuse(verdict.status, verdict.code, verdict.message);

  c.set('apiKey', record);
  // Fire-and-forget, like the operational counters: a failed timestamp write loses a timestamp,
  // never a request.
  void touchApiKey(c.env, record.id, now).catch(() => {});
  return next();
});

// ---------------------------------------------------------------- /v1 discovery
app.get('/v1', (c) => c.json(discoveryDocument()));
app.get('/v1/openapi.json', (c) => c.json(openApiDocument(new URL(c.req.url).origin)));
app.get('/v1/models', (c) => c.json(publicModelList(Date.now())));

// ---------------------------------------------------------------- /v1 completions
async function quotaSpend(env: Env, userId: string, sparks: number, kind: string, requestId: string) {
  const res = await env.QUOTA_DO.get(env.QUOTA_DO.idFromName(userId)).fetch('https://do/spend', {
    method: 'POST',
    headers: { [REQUEST_ID_HEADER]: requestId },
    body: JSON.stringify({ sparks, kind }),
  });
  return (await res.json()) as { ok: boolean; state?: { sparksRemaining?: number } };
}

function idemStorageKey(keyId: string, idemKey: string): string {
  return `idem:${keyId}:${idemKey}`;
}

async function idemLoad(env: Env, keyId: string, idemKey: string): Promise<IdempotencyRecord | null> {
  const raw = await env.KV.get(idemStorageKey(keyId, idemKey));
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<IdempotencyRecord>;
    if (typeof p.fingerprint !== 'string' || typeof p.status !== 'number' || typeof p.body !== 'string') return null;
    return { fingerprint: p.fingerprint, status: p.status, body: p.body };
  } catch {
    return null;
  }
}

/**
 * The shared body of both completion routes.
 *
 * `/v1/completions` is deprecated but not weakened: it runs this same function, so it cannot drift
 * into a laxer validator, a different spend path or a different sandbox.
 */
async function handleCompletion(c: PublicCtx, legacy: boolean): Promise<Response> {
  const key = c.get('apiKey');
  const requestId = c.get('requestId');
  const path = new URL(c.req.url).pathname;
  const refuse = (status: number, code: string, message: string, param: string | null = null) =>
    c.json(errorBody(status, code, message, requestId, param), status as 400);

  const bodyText = await c.req.text();
  let body: unknown;
  try {
    body = JSON.parse(bodyText || 'null');
  } catch {
    return refuse(400, 'invalid_json', 'The request body is not valid JSON.');
  }

  const parsed = legacy ? parseLegacyCompletionRequest(body) : parseChatCompletionRequest(body);
  if (!parsed.ok) return refuse(parsed.fault.status, parsed.fault.code, parsed.fault.message, parsed.fault.param);
  const req: ChatCompletionRequest = parsed.value;

  // ---- idempotency ----
  const idemHeader = c.req.header('Idempotency-Key');
  let idemKey: string | null = null;
  let idemFingerprint: string | null = null;
  if (idemHeader !== undefined) {
    if (!idempotencyKeyValid(idemHeader)) {
      return refuse(400, 'invalid_idempotency_key', 'Idempotency-Key must be 1-255 printable ASCII characters.');
    }
    if (req.stream) {
      // Refused, not ignored. Storing a replayable copy of a stream is a different feature from
      // storing a JSON body, and an Idempotency-Key that silently does nothing is worse than one
      // that is rejected: the caller believes they are protected from a double charge.
      return refuse(
        400,
        'idempotency_not_supported_for_stream',
        'Idempotency-Key cannot be combined with stream: true. Retry a streamed call without the header.',
      );
    }
    idemKey = idemHeader;
    idemFingerprint = await keyHash(`${c.req.method} ${path}\n${bodyText}`);
    const verdict = idempotencyVerdict(await idemLoad(c.env, key.id, idemKey), idemFingerprint);
    if (verdict.kind === 'conflict') {
      return refuse(
        409,
        'idempotency_key_reuse',
        'This Idempotency-Key was already used with a different request body.',
      );
    }
    if (verdict.kind === 'replay') {
      return new Response(verdict.record.body, {
        status: verdict.record.status,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Replayed': 'true' },
      });
    }
  }

  // ---- run it (or don't, in the sandbox) ----
  const sandbox = key.mode === 'test';
  let resp;
  let sparksSpent = 0;
  let sparksRemaining: number | null = null;
  if (sandbox) {
    resp = sandboxCompletion(req);
  } else {
    // Admission first: one Spark before anything runs, settled against the real cost afterwards.
    // Same order the agent loop uses — a call that is refused must not have cost anything.
    const admission = await quotaSpend(c.env, key.userId, 1, legacy ? 'api_completion' : 'api_chat', requestId);
    if (!admission.ok) {
      return refuse(429, 'insufficient_quota', 'This account has no Sparks left today.');
    }
    sparksSpent = 1;
    sparksRemaining = admission.state?.sparksRemaining ?? null;
    try {
      resp = await llmChat(
        c.env,
        {
          model: req.internalModel,
          messages: req.messages,
          maxTokens: req.maxTokens,
          ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
        },
        { kind: legacy ? 'api_completion' : 'api_chat' },
      );
    } catch (e) {
      if (e instanceof BudgetError) {
        return refuse(429, `budget_${e.reason}`, e.message);
      }
      return refuse(502, 'upstream_error', 'The model could not be reached.');
    }
    const owed = sparksForNeurons(resp.neurons) - sparksSpent;
    if (owed > 0) {
      const settle = await quotaSpend(c.env, key.userId, owed, legacy ? 'api_completion' : 'api_chat', requestId);
      sparksSpent += owed;
      sparksRemaining = settle.state?.sparksRemaining ?? sparksRemaining;
    }
  }

  // A finish reason this API cannot represent is an ERROR, not a completion. Rendering a failed or
  // tool-seeking call as `finish_reason: "stop"` hands the caller an empty assistant turn that is
  // indistinguishable from a model choosing to say nothing.
  const finish = openAiFinishReason(resp.finishReason);
  if (finish === null) {
    return refuse(
      502,
      'upstream_incomplete',
      `The model did not finish (${resp.finishReason}). Nothing was returned rather than a partial answer presented as a whole one.`,
    );
  }

  const meta = {
    id: `chatcmpl_${requestId.replace(/^req_/, '')}`,
    model: req.publicModel,
    createdAtMs: Date.now(),
    fingerprint: sandbox ? SANDBOX_FINGERPRINT : `golem-${c.env.BUILD_SHA ?? 'dev'}`,
  };
  const extra: Record<string, string> = {
    ...usageHeaders({
      inputTokens: resp.usage.inputTokens,
      outputTokens: resp.usage.outputTokens,
      sparksSpent,
      sparksRemaining,
    }),
    ...(sandbox ? { 'X-Golem-Sandbox': 'true' } : {}),
  };
  void count(c.env, sandbox ? 'api_chat_sandbox' : 'api_chat');

  if (req.stream) {
    const chunks = chatCompletionChunks(resp, meta, finish, req.includeUsage);
    const payload = chunks.map((ch) => sseFrame(ch)).join('') + SSE_DONE;
    return new Response(payload, {
      status: 200,
      headers: {
        ...extra,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  const json = legacy ? legacyCompletionBody(resp, meta, finish) : chatCompletionBody(resp, meta, finish);
  const serialised = JSON.stringify(json);
  if (idemKey && idemFingerprint) {
    await c.env.KV.put(
      idemStorageKey(key.id, idemKey),
      JSON.stringify({ fingerprint: idemFingerprint, status: 200, body: serialised } satisfies IdempotencyRecord),
      { expirationTtl: 86_400 },
    );
  }
  return new Response(serialised, { status: 200, headers: { ...extra, 'Content-Type': 'application/json' } });
}

app.post('/v1/chat/completions', (c) => handleCompletion(c, false));
app.post('/v1/completions', (c) => handleCompletion(c, true));

// ---------------------------------------------------------------- /v1 projects
app.get('/v1/projects', (c) => {
  const key = c.get('apiKey');
  return c.json({
    object: 'list',
    data: key.projects.map((p) => ({ id: p.id, object: 'project', name: p.name })),
  });
});

app.get('/v1/projects/:id', async (c) => {
  const g = grantedStub(c);
  if (!g) return ungranted(c);
  const { id, stub } = g;
  const res = await stub.fetch('https://do/info', traced(c));
  if (!res.ok) return c.json(errorBody(404, 'project_uninitialised', 'That project has no session yet.', c.get('requestId')), 404);
  const info = (await res.json()) as {
    project?: { id: string; name: string };
    agentStatus?: string;
    messages?: number;
    pluginConnected?: boolean;
  };
  return c.json({
    id,
    object: 'project',
    name: info.project?.name ?? null,
    agent_status: info.agentStatus ?? 'idle',
    messages: info.messages ?? 0,
    studio_connected: info.pluginConnected === true,
  });
});

app.get('/v1/projects/:id/messages', async (c) => {
  const g = grantedStub(c);
  if (!g) return ungranted(c);
  const params = new URLSearchParams();
  const before = Number(c.req.query('before'));
  if (Number.isFinite(before) && before > 0) params.set('before', String(Math.trunc(before)));
  const limit = Number(c.req.query('limit'));
  if (Number.isFinite(limit) && limit > 0) params.set('limit', String(Math.min(100, Math.trunc(limit))));
  const res = await g.stub.fetch(`https://do/messages?${params}`, traced(c));
  const out = (await res.json()) as { messages?: unknown[] };
  return c.json({ object: 'list', data: out.messages ?? [] });
});

/** Public run modes. Internal specialist names are never on the wire — see router.ts. */
const PUBLIC_RUN_MODES: Record<string, 'clay' | 'stone' | 'rune'> = { plan: 'clay', agent: 'stone', super: 'rune' };

app.post('/v1/projects/:id/runs', async (c) => {
  const key = c.get('apiKey');
  const requestId = c.get('requestId');
  const g = grantedStub(c);
  if (!g) return ungranted(c);
  const { id, stub } = g;
  const body = await c.req.json<{ input?: unknown; mode?: unknown }>().catch(() => null);
  const input = typeof body?.input === 'string' ? body.input.trim() : '';
  if (!input) return c.json(errorBody(400, 'invalid_request_error', "'input' is required.", requestId, 'input'), 400);

  const wanted = body?.mode === undefined || body?.mode === null ? 'agent' : body.mode;
  // `Object.hasOwn`, not a bare index: `PUBLIC_RUN_MODES['constructor']` is truthy through the
  // prototype chain and would send `undefined` to the session as a mode.
  if (typeof wanted !== 'string' || !Object.hasOwn(PUBLIC_RUN_MODES, wanted)) {
    return c.json(
      errorBody(400, 'invalid_request_error', `'mode' must be one of ${Object.keys(PUBLIC_RUN_MODES).join(', ')}.`, requestId, 'mode'),
      400,
    );
  }
  const mode = PUBLIC_RUN_MODES[wanted]!;

  if (key.mode === 'test') {
    // THE SANDBOX DOES NOT START A RUN, and says so in the payload rather than only in the docs.
    // A test key that could drive a real build would make "test key" a label rather than a
    // boundary — and CI would be editing somebody's place.
    void count(c.env, 'api_run_sandbox');
    return c.json(
      {
        id: `run_sandbox_${requestId.replace(/^req_/, '')}`,
        object: 'run',
        status: 'simulated',
        sandbox: true,
        project: id,
        mode: wanted,
        note: 'Test-mode key: no run was started and nothing in the place was touched.',
      },
      202,
      { 'X-Golem-Sandbox': 'true' },
    );
  }

  const res = await stub.fetch('https://do/agent-run', traced(c, {
    method: 'POST',
    body: JSON.stringify({ text: input.slice(0, 8000), mode }),
  }));
  const out = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || out.ok === false) {
    const status = res.status === 409 ? 409 : res.status === 400 ? 400 : 502;
    return c.json(errorBody(status, 'run_not_started', out.error ?? 'The run could not be started.', requestId), status as 409);
  }
  void count(c.env, 'api_run_started');
  return c.json({ id: `run_${id}`, object: 'run', status: 'running', project: id, mode: wanted }, 202);
});

app.get('/v1/projects/:id/runs/current', async (c) => {
  const g = grantedStub(c);
  if (!g) return ungranted(c);
  const { id, stub } = g;
  const res = await stub.fetch('https://do/info', traced(c));
  if (!res.ok) return c.json(errorBody(404, 'project_uninitialised', 'That project has no session yet.', c.get('requestId')), 404);
  const info = (await res.json()) as { agentStatus?: string; queuedOps?: number; pluginConnected?: boolean };
  const status = info.agentStatus ?? 'idle';
  return c.json({
    object: 'run',
    project: id,
    status,
    running: status === 'running',
    queued_ops: info.queuedOps ?? 0,
    studio_connected: info.pluginConnected === true,
  });
});

/**
 * Server-sent events for one project.
 *
 * WHY POLLING AND NOT A SOCKET BRIDGE. The SessionDO broadcasts over WebSocket to browser clients
 * that hold a user JWT. An API key holder has no JWT, and a program that wants "tell me when the
 * run finishes" should not have to speak WebSocket to get it. So this asks the session for its
 * state on an interval and emits only the TRANSITIONS — `projectEvents` returns nothing when
 * nothing changed, so an idle stream costs one comment frame per tick and no events at all.
 *
 * The stream ENDS when the run it was watching ends. A stream that stays open after the thing it
 * reports is over teaches clients to rely on a timeout instead of an end-of-stream.
 */
const EVENT_STREAM_MAX_MS = 55_000;

app.get('/v1/projects/:id/events', (c) => {
  const g = grantedStub(c);
  if (!g) return ungranted(c);
  const { id, stub } = g;
  const asked = Number(c.req.query('poll_ms'));
  // Non-finite input must not reach the clamp: Math.min(NaN, …) is NaN and the loop would spin.
  const pollMs = Number.isFinite(asked) ? Math.min(10_000, Math.max(250, Math.trunc(asked))) : 1_000;

  // Captured before the stream detaches from the request: `c` is not safe to read once the pump
  // is running on its own.
  const infoInit = traced(c);
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const write = (s: string) => writer.write(enc.encode(s));

  const pump = async () => {
    let prev: ProjectSnapshot | null = null;
    const started = Date.now();
    try {
      await write(sseFrame({ project: id, poll_ms: pollMs }, { event: 'open' }));
      for (;;) {
        const res = await stub.fetch('https://do/info', infoInit);
        if (!res.ok) {
          await write(sseFrame({ error: 'project_uninitialised' }, { event: 'error' }));
          break;
        }
        const info = (await res.json()) as { agentStatus?: string; messages?: number; pluginConnected?: boolean };
        const next: ProjectSnapshot = {
          agentStatus: info.agentStatus ?? 'idle',
          messages: Number.isFinite(info.messages) ? (info.messages as number) : 0,
          pluginConnected: info.pluginConnected === true,
        };
        for (const ev of projectEvents(prev, next)) await write(sseFrame(ev.data, { event: ev.event }));
        if (streamShouldClose(prev, next)) {
          await write(sseFrame({ reason: 'run_finished' }, { event: 'done' }));
          break;
        }
        prev = next;
        if (Date.now() - started > EVENT_STREAM_MAX_MS) {
          await write(sseFrame({ reason: 'timeout' }, { event: 'done' }));
          break;
        }
        await new Promise((r) => setTimeout(r, pollMs));
        await write(sseHeartbeat(Date.now()));
      }
    } catch {
      /* the client went away; nothing to report to */
    } finally {
      await writer.close().catch(() => {});
    }
  };
  void pump();
  void count(c.env, 'api_event_stream');

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

// ---------------------------------------------------------------- shared projects (collaboration)
/**
 * THE SHARED SURFACE.
 *
 * Deliberately a separate family of routes rather than a widening of `/api/projects/*`. Those
 * routes are owner-only and every one of them says so through `withOwnedProject(c, id)`; teaching
 * that helper to admit members WITHOUT naming an action per route would have made a viewer's
 * `POST /restore` succeed, and the diff that did it would have touched one function.
 *
 * Here, every route names the action it performs. `decideAccess` answers, and a stranger gets 404
 * — the same answer as a project that does not exist — while a member who lacks the capability
 * gets 403, because they already know it exists and need to be told which role they are asking
 * with.
 */
/**
 * The shared gate, with the 404/403 distinction preserved.
 *
 * `withOwnedProject` answers null for both "you are not a member" and "you are a member who may
 * not do this", because its two-argument form has exactly one answer and the existing routes
 * depend on that. Here the difference matters, so a refusal is re-asked as a plain `read` — one
 * extra round trip, on the failure path only — and the two cases are told apart by whether THAT
 * succeeds.
 */
async function sharedAccess(
  c: Context,
  projectId: string,
  action: CollabAction,
): Promise<{ ctx: NonNullable<Awaited<ReturnType<typeof withOwnedProject>>>; status: 200 } | { ctx: null; status: 403 | 404 }> {
  const ctx = await withOwnedProject(c, projectId, action);
  if (ctx) return { ctx, status: 200 };
  if (!UUID_RE.test(projectId)) return { ctx: null, status: 404 };
  const probe = await getProjectAccess(c.env, c.get('user'), projectId, 'read');
  return { ctx: null, status: probe.project === null ? 404 : 403 };
}

const collabRefusal = (c: Context, status: 403 | 404) =>
  c.json({ error: status === 403 ? 'forbidden' : 'not found' }, status);

/** The member directory the store needs, built from the project's LIVE grants only. */
async function collabDirectory(c: Context, ctx: { user: AuthedUser; project: ProjectRow }) {
  const rows = await listProjectMembers(c.env, ctx.user, ctx.project);
  const profile = await getProfile(c.env, ctx.user.jwt, ctx.project.owner_id);
  return memberDirectory(ctx.project, rows, profile?.display_name ?? null);
}

/** One door to the Durable Object's collaboration store, so identity crosses exactly once. */
async function collabCall(
  stub: DurableObjectStub,
  method: string,
  path: string,
  body: Record<string, unknown>,
  ctx: { user: AuthedUser; role: string },
  directory?: unknown[],
) {
  return stub.fetch('https://do/collab', {
    method: 'POST',
    body: JSON.stringify({ method, path, body, userId: ctx.user.userId, role: ctx.role, directory }),
  });
}

app.get('/api/shared/:id', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const ctx = gate.ctx;
  const members = await collabDirectory(c, ctx);
  return c.json({
    project: { id: ctx.project.id, name: ctx.project.name, ownerId: ctx.project.owner_id },
    role: ctx.role,
    capabilities: capabilitiesFor(ctx.role),
    members: members.map((m) => ({ userId: m.userId, handle: m.handle, role: m.role, displayName: m.displayName })),
  });
});

app.get('/api/shared/:id/ws', async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') return c.json({ error: 'expected websocket' }, 426);
  // `read` opens the socket; every WRITE the socket attempts is gated again inside the Durable
  // Object against the role sent below. Opening at `chat` instead would mean a viewer could not
  // watch a build at all, which is most of what being a viewer is for.
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const ctx = gate.ctx;
  void count(c.env, 'ws_connect');
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-User-Id', ctx.user.userId);
  headers.set('X-User-Jwt', ctx.user.jwt);
  //[[ SET, NEVER APPENDED — the browser's own headers were copied into this object one line above,
  //   and a client that sent `X-Golem-Role: owner` would otherwise have written its own permission
  //   slip. `set` replaces; the value here is the one the access decision produced. ]]
  headers.set('X-Golem-Role', ctx.role);
  return ctx.stub.fetch(new Request('https://do/ws', { headers, method: 'GET' }));
});

app.get('/api/shared/:id/messages', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const url = new URL(c.req.url);
  return gate.ctx.stub.fetch(`https://do/messages?${url.searchParams}`);
});

app.get('/api/shared/:id/checkpoints', async (c) => {
  // Checkpoints are the history of the build a viewer is watching, so they sit with the other
  // reads rather than behind a write capability: a viewer who can see /messages and /versions but
  // not the checkpoints those runs produced is being shown a conversation with its outcomes cut out.
  //
  // It proxies the SESSION DO, not a collab one -- `/checkpoints` has been served at
  // do/session.ts:841 all along. That is why this is five lines and not a feature: only the shared
  // -> session mirror was missing, and it is deliberately NOT in COLLAB_ROUTES because that loop
  // rewrites `/collab/*` onto a collab endpoint, which is the wrong DO for this.
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const url = new URL(c.req.url);
  return gate.ctx.stub.fetch(`https://do/checkpoints?${url.searchParams}`);
});

app.get('/api/shared/:id/members', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  return c.json({ members: await collabDirectory(c, gate.ctx) });
});

app.post('/api/shared/:id/members', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const ctx = gate.ctx;
  const body = (await c.req.json().catch(() => null)) as { userId?: unknown; role?: unknown; expiresAt?: unknown } | null;
  const role = asCollabRole(body?.role);
  // `owner` is not in GRANTABLE_ROLES, so an invitation can never confer the project. Checked here
  // as well as in classifyGrant: a row refused on READ is still a row someone managed to write,
  // and a members list containing a phantom owner is a lie the UI would faithfully render.
  if (!role || !(GRANTABLE_ROLES as readonly string[]).includes(role)) return c.json({ error: 'unknown_role' }, 400);
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!UUID_RE.test(userId)) return c.json({ error: 'bad_user' }, 400);
  if (userId === ctx.project.owner_id) return c.json({ error: 'owner_is_not_a_member' }, 400);

  const { ok, status } = await supaRest(c.env, ctx.user.jwt, '/project_members', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify({
      project_id: ctx.project.id,
      user_id: userId,
      role,
      invited_by: ctx.user.userId,
      expires_at: typeof body?.expiresAt === 'string' ? body.expiresAt : null,
      revoked_at: null,
    }),
  });
  if (!ok) return c.json({ error: 'invite_failed', status }, 502);
  return c.json({ ok: true, userId, role }, 201);
});

app.delete('/api/shared/:id/members/:userId', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const ctx = gate.ctx;
  const userId = c.req.param('userId') ?? '';
  if (!UUID_RE.test(userId)) return c.json({ error: 'bad_user' }, 400);
  // Revoked, not deleted: "this access ended" is a fact worth keeping, and a deleted row cannot
  // tell an audit reader that someone ever had access at all.
  const { ok } = await supaRest(
    c.env,
    ctx.user.jwt,
    `/project_members?project_id=eq.${encodeURIComponent(ctx.project.id)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
  );
  if (!ok) return c.json({ error: 'revoke_failed' }, 502);
  return c.json({ ok: true, userId, revoked: true });
});

app.post('/api/shared/:id/links', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'share');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const ctx = gate.ctx;
  const body = (await c.req.json().catch(() => null)) as { scope?: unknown; resourceId?: unknown; role?: unknown; expiresAt?: unknown } | null;
  const scope = asShareScope(body?.scope);
  const role = asCollabRole(body?.role);
  if (!scope) return c.json({ error: 'unknown_scope' }, 400);
  if (!role) return c.json({ error: 'unknown_role' }, 400);
  const resourceId = typeof body?.resourceId === 'string' && body.resourceId.length > 0 ? body.resourceId : null;
  if (scope !== 'project' && resourceId === null) return c.json({ error: 'scoped_link_needs_a_resource' }, 400);

  const token = newShareToken();
  const link = {
    token,
    project_id: ctx.project.id,
    scope,
    resource_id: resourceId,
    role,
    expires_at: typeof body?.expiresAt === 'string' ? body.expiresAt : null,
    revoked_at: null,
    created_by: ctx.user.userId,
    created_at: new Date().toISOString(),
  };
  // Minted through the very function that REDEEMS it, so a link this product would refuse to
  // honour is never handed out: an unredeemable link is a support ticket, and an over-powered one
  // is a breach. `role_too_strong` is the refusal that matters — see collab.ts.
  const check = redeemShareLink(link, { projectId: ctx.project.id, scope, resourceId }, Date.now());
  if (!check.ok) return c.json({ error: check.reason }, 400);
  await putShareLink(c.env, link);
  return c.json({ token, scope, role, resourceId, projectId: ctx.project.id }, 201);
});

app.post('/api/shared/links/redeem', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => null)) as { token?: unknown; scope?: unknown; resourceId?: unknown } | null;
  const link = await readShareLink(c.env, body?.token);
  // The REASON comes back — someone who pasted an expired link cannot act on "not found" — but the
  // project id does not, so a probe with a guessed token learns nothing about what exists.
  if (!link) return c.json({ error: 'no_such_link' }, 404);
  const asking = { projectId: link.project_id, scope: body?.scope ?? link.scope, resourceId: body?.resourceId ?? link.resource_id };
  const out = redeemShareLink(link, asking, Date.now());
  if (!out.ok) return c.json({ error: out.reason }, 403);
  if (user.userId === link.created_by) {
    return c.json({ ok: true, projectId: link.project_id, role: out.grant.role, scope: out.grant.scope });
  }
  await putKvGrant(c.env, link.project_id, {
    user_id: user.userId,
    role: out.grant.role,
    expires_at: link.expires_at,
    revoked_at: null,
    display_name: null,
    invited_by: link.created_by,
    via_token: link.token,
  });
  return c.json({ ok: true, projectId: link.project_id, role: out.grant.role, scope: out.grant.scope, resourceId: out.grant.resourceId }, 201);
});

app.post('/api/shared/:id/links/revoke', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'share');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
  if (!isShareToken(body?.token)) return c.json({ error: 'bad_token' }, 400);
  const link = await readShareLink(c.env, body.token);
  // A link is revocable only from the project it belongs to. Without this, holding ANY project
  // would let you revoke any link in the system by presenting its token.
  if (!link || link.project_id !== gate.ctx.project.id) return c.json({ error: 'no_such_link' }, 404);
  await revokeShareLink(c.env, body.token, new Date().toISOString());
  return c.json({ ok: true, revoked: true });
});

// ----------------------------------------------------------- comments, reviews, versions, presence
/** Each entry names the ACTION its route performs. A path missing from here has no route at all. */
const COLLAB_ROUTES: { method: 'GET' | 'POST'; path: string; action: CollabAction; needsDirectory?: boolean }[] = [
  { method: 'GET', path: '/collab/comments', action: 'read' },
  { method: 'POST', path: '/collab/comments', action: 'comment', needsDirectory: true },
  { method: 'POST', path: '/collab/comments/resolve', action: 'comment' },
  { method: 'POST', path: '/collab/reactions', action: 'react' },
  { method: 'GET', path: '/collab/reviews', action: 'read' },
  { method: 'POST', path: '/collab/reviews', action: 'request_review', needsDirectory: true },
  { method: 'POST', path: '/collab/reviews/approve', action: 'approve' },
  { method: 'GET', path: '/collab/versions', action: 'read' },
  { method: 'POST', path: '/collab/versions', action: 'build' },
  { method: 'POST', path: '/collab/versions/restore', action: 'restore_version' },
];

/**
 * One handler per collab route, built from the table above — but REGISTERED AT A LITERAL PATH.
 *
 * This used to be a `for` loop with `app.get(\`/api/shared/:id${route.path...}\`, handler)`. It was
 * shorter and it read well, and it registered TEN endpoints that no guard in this repository could
 * see: the ownership sweep in packages/evals/src/security.test.mjs finds routes with
 * /app\.(get|post|…)\('([^']+)'/, and a path built from a template literal matches nothing. Seven
 * distinct shared paths — comments, comments/resolve, reactions, reviews, reviews/approve, versions,
 * versions/restore — were invisible to every source scanner here, including the test that exists to
 * check exactly this. Same defect the tool registry already carries a note about: an entry supplied
 * by a spread "would pass every assertion above and be invisible to all of them".
 *
 * The factory keeps the table as the single source of behaviour; only the PATH is written out.
 */
const collabHandler = (route: (typeof COLLAB_ROUTES)[number]) => async (c: Context) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', route.action);
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  const ctx = gate.ctx;
  const body =
    route.method === 'GET'
      ? (Object.fromEntries(new URL(c.req.url).searchParams.entries()) as Record<string, unknown>)
      : ((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
  const directory = route.needsDirectory ? await collabDirectory(c, ctx) : undefined;
  return collabCall(ctx.stub, route.method, route.path, body, ctx, directory);
};

const collabRoute = (path: string, method: 'GET' | 'POST') => {
  const route = COLLAB_ROUTES.find((r) => r.path === path && r.method === method);
  if (!route) throw new Error(`collabRoute: no COLLAB_ROUTES entry for ${method} ${path}`);
  return collabHandler(route);
};

app.get('/api/shared/:id/comments', collabRoute('/collab/comments', 'GET'));
app.post('/api/shared/:id/comments', collabRoute('/collab/comments', 'POST'));
app.post('/api/shared/:id/comments/resolve', collabRoute('/collab/comments/resolve', 'POST'));
app.post('/api/shared/:id/reactions', collabRoute('/collab/reactions', 'POST'));
app.get('/api/shared/:id/reviews', collabRoute('/collab/reviews', 'GET'));
app.post('/api/shared/:id/reviews', collabRoute('/collab/reviews', 'POST'));
app.post('/api/shared/:id/reviews/approve', collabRoute('/collab/reviews/approve', 'POST'));
app.get('/api/shared/:id/versions', collabRoute('/collab/versions', 'GET'));
app.post('/api/shared/:id/versions', collabRoute('/collab/versions', 'POST'));
app.post('/api/shared/:id/versions/restore', collabRoute('/collab/versions/restore', 'POST'));

app.get('/api/shared/:id/presence', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status);
  return gate.ctx.stub.fetch('https://do/collab/presence');
});

app.notFound(async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
  //[[ `/v1` NEVER ARRIVES HERE, and that is a property of the middleware, not an accident.
  //
  //   `app.use('/v1/*')` matches every path beginning `/v1` — including the bare `/v1` — and its
  //   first act is to look the request up in PUBLIC_ROUTES and answer 404 with a JSON envelope
  //   when the table does not describe it. So an unknown public-API path is refused there, by the
  //   same guard that refuses an unknown one with a valid key, and never reaches the static
  //   handler that would answer a program with the marketing 404 PAGE.
  //
  //   A second branch here would read like a defence and could not be reached by any request, so
  //   it is not written. The property it would protect is asserted directly instead: see the
  //   "an unknown /v1 path is a JSON 404" test, which drives POST /v1 among other shapes. ]]
  return serveStatic(c.env, c.req.raw);
});

export default app;
