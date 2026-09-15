// Golem worker entry: API routes + static serving + DO exports.
import { ingestAssets, type IngestRequest } from './asset-ingest';
import { importPending, unimportAssets } from './asset-import';
import { putRobloxCredential, describeRobloxCredential, deleteRobloxCredential } from './user-credentials';
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  verifyStripeSignature,
  interpretStripeEvent,
  entitlementFor,
  buildCheckoutRequest,
  buildInvoicePreviewRequest,
  buildPortalRequest,
  checkoutConfigured,
  checkoutGuard,
  priceIdFor,
  readInvoicePreview,
  subscriptionView,
  type Subscription,
} from './billing';
import { exportFilename, renderTranscriptMarkdown, type TranscriptExport } from './export';
import type { Env, AuthedUser } from './env';
import { verifyJwt, bearerToken } from './auth';
import { getOwnedProject, getProfile, getProjectAccess, listProjectMembers, memberDirectory, supaRest, type MemberRow, type ProjectRow } from './supa';
import { can, capabilitiesFor, asCollabRole, asShareScope, effectivePermissions, redeemShareLink, GRANTABLE_ROLES, type CollabAction, type CollabRole, type Membership, type ShareResource } from './collab';
import {
  isShareToken,
  kvGrantBarred,
  listKvGrants,
  listShareLinks,
  newShareToken,
  patchKvGrant,
  putKvGrant,
  putShareLink,
  readKvGrant,
  readShareLink,
  restoreKvGrant,
  revokeKvGrant,
  revokeShareLink,
} from './collab-links';
import {
  BULK_INVITE_MAX,
  EVENT_REASON_MAX,
  buildMembershipEvent,
  buildRoster,
  filterRoster,
  inviteEventKind,
  parseRosterQuery,
  planBulkInvite,
  type MembershipEventInput,
} from './membership';
import { companionOpAccess, companionRefusal, sanitizeCompanionOp } from './companion';
import { chat as llmChat, embed, getModels, budgetReport, budgetState, setKillSwitch, rawProbe, BudgetError } from './gateway';
import { capabilityTable, providerHealth, selectProvider } from './providers';
import { imageKvKey, type ImageMeta } from './imagegen';
import { audioKvKey, servableAudioType, type AudioMeta } from './audio-store';
import { kvWorkspace } from './webtools';
import {
  copyWorkspaceFile,
  deleteWorkspaceFile,
  freeCopyPath,
  historyOf,
  listWorkspace,
  moveWorkspaceFile,
  readVersionOf,
  restoreWorkspaceFile,
  revertWorkspaceFile,
  trashOf,
  writeWorkspaceFile,
  WORKSPACE_OP_STATUS,
  type WorkspaceOpCode,
} from './workspace-files';
import { auditCitations, corpusCensus, renderCitedContext, searchDocsDetailed } from './rag';
import type { Citation, RetrievalOutcome } from './retrieval';
import { serveStatic, ensureStaticTables } from './static';
import {
  handleDiscordRequest,
  editOriginal,
  registerCommands,
  type DiscordPorts,
  type LinkRecord,
  type RedeemResult,
} from './discord';
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
import {
  INBOX_KINDS,
  ensureNotificationTables,
  groupNotifications,
  listNotifications,
  markRead,
  unreadCount,
} from './notification-store';
import { notify, notifyMany } from './notify';
import {
  authorizeFire,
  describeSchedule,
  manualFireKey,
  nextFireAfter,
  normaliseAutomation,
  startVerdict,
  type AutomationInput,
} from './automations';
import {
  automationSpend,
  claimFire,
  deleteAutomation,
  ensureAutomationTables,
  finishFire,
  firesSince,
  getAutomation,
  listAutomations,
  listExecutions,
  saveAutomation,
  setAutomationEnabled,
  transferAutomation,
  type StoredAutomation,
} from './automation-store';
import { dstDisclosure, instantForWall, wallPartsAt } from './zoned-time';
import { dunningCopy, interpretDunningEvent } from './dunning';
import { critiqueViews } from './vision';
import { roadmapForProject, executionBrief, polishRoadmap, publicShape, type StudioProbe, type RoadmapChat } from './roadmap';
import { refuseLuauIngress } from './tools';
import { ensureProvenanceTables, exportProjectAttribution } from './provenance';
import {
  ENTRIES_PER_SCOPE_MAX,
  buildExport,
  canAdministerOrg,
  canWriteScope,
  createOrg,
  deleteMemoryEntry,
  ensureMemoryTables,
  isMemoryScope,
  listMemoryEntries,
  listOrgsFor,
  moveMemoryEntry,
  orgMembersOf,
  orgMembership,
  parseImport,
  personalDisclosures,
  putMemoryEntry,
  readMemoryAudit,
  removeOrgMember,
  updateOrgMember,
  type MemoryAccess,
  type MemoryEntry,
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
import { toolNames, toolDefs } from './tools';
import {
  MCP_METHOD_HEADER,
  MCP_NAME_HEADER,
  MCP_PROTOCOL_HEADER,
  MCP_TOOL_NAMES,
  RPC,
  discoverResult,
  headerDisagreement,
  initializeResult,
  mcpTool,
  mcpToolList,
  metaVersion,
  negotiateVersion,
  parseRpc,
  rpcError,
  rpcResult,
  toolResult,
} from './mcp';
import { creditsForNeurons } from './pricing';
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
import type { RenderViewResult, OpResult, StudioOp, QuotaState, RunSnapshot, PairingCodeDto, StudioLinkSummary } from '@golem/shared';
import { isPlanId, PLAN_IDS, PRICE_CURRENCY, type PlanId } from '@golem/shared';
import { withSchema } from './schema-once';

export { SessionDO } from './do/session';
export { QuotaDO } from './do/quota';
export { PairingDO } from './do/pairing';
export { AdminDO } from './do/admin';
export { BudgetDO } from './do/budget';
export { DiscordDO } from './do/discord';

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
  return grantedProjectStub(c, id);
}

/**
 * The same question for a project id that did NOT come out of the path.
 *
 * `/v1/mcp` is one path carrying many operations, so the project a call acts on arrives in the
 * JSON-RPC arguments. That is a more dangerous shape than a path parameter — the middleware's own
 * grant check keys off `match.params.id` and therefore cannot see it — so the id gets the identical
 * set-membership test against the grant that was proven under RLS at mint time, and a session is
 * materialised only after it passes.
 *
 * Both callers go through here, so there is one place where an id becomes a SessionDO on this
 * surface, and `sessionStub` is not reachable from a `/v1` handler at all.
 */
function grantedProjectStub(c: PublicCtx, id: string): { id: string; stub: DurableObjectStub } | null {
  const key = c.get('apiKey');
  if (!id || !key.projects.some((p) => p.id === id)) return null;
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
const AUTH_EXEMPT = ['/api/health', '/api/studio/claim', '/api/studio/poll', '/api/waitlist', '/api/billing/webhook', '/api/discord/interactions'];
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
  /** What this route is reaching for, so a scoped grant opens its own resource and nothing else. */
  resource?: ShareResource,
) {
  const user = c.get('user');
  if (!UUID_RE.test(projectId)) return null;
  const project = await getOwnedProject(c.env, user.jwt, projectId);
  let membership: Membership | null = project
    ? { userId: user.userId, role: 'owner', via: 'owner', scope: 'project', resourceId: null }
    : null;
  let shared: ProjectRow | null = null;
  if (!project) {
    // No action named ⇒ owner-only, and the owner path just said no.
    if (action === undefined) return null;
    const access = await getProjectAccess(c.env, user, projectId, action, Date.now(), resource);
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
  // `'read'` RATHER THAN OWNER-ONLY, and it is the whole point of sharing a project.
  //
  // A collaborator could open the conversation, read the message that says "here is the icon I
  // generated", see the card — and get a 404 for the pixels, because this route asked whether they
  // OWNED the project rather than whether they could read it. The artifact a run produced is part of
  // what the run produced; a share that hands over the prose and withholds the output is a share of
  // the transcript, not of the work. A stranger still gets the same 404 as a project that does not
  // exist, because `withOwnedProject` answers null for both.
  const ctx = await withOwnedProject(c, c.req.param('id'), 'read');
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
  // Readable by any member who can read the project, for the reason written out on the image route.
  const ctx = await withOwnedProject(c, c.req.param('id'), 'read');
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
  //[[ A SOUND THE TOOL SAID WAS DOWNLOADABLE, AND WAS NOT.
  //
  //   `generate_sound` tells the model the user can download the result. Nothing served a
  //   Content-Disposition, so the browser played it inline and a right-click was the only way to
  //   keep it — a promise made in a tool description and broken by a missing header.
  //
  //   The filename is BUILT here from the id and the served type, never taken from anything stored:
  //   a name out of KV would be a writer-chosen string in a response header, and that is how a
  //   download acquires an extension nobody intended. `inline` remains the default so the existing
  //   player is unaffected. ]]
  const download = c.req.query('download') === '1';
  const extension = contentType.includes('wav') ? 'wav' : contentType.includes('ogg') ? 'ogg' : 'mp3';
  return new Response(bytes, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="golem-${audioId}.${extension}"`,
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
 * Accept or discard what Apple has asked to remember.
 *
 * Only reachable when the project's memory setting is `review`, which is what puts anything in the
 * queue in the first place. The DO owns the decision — it holds the queue, and a second
 * implementation of "does this proposal still exist" would be a second answer to it — so this
 * route proves ownership, forwards, and mirrors the ACTIVE memory afterwards for the dashboard.
 *
 * A 404 from the DO means the proposal is no longer pending, and it is passed through rather than
 * flattened into a 200: a panel that had been open while another tab accepted the same suggestion
 * would otherwise report a decision the user never made.
 */
app.post('/api/projects/:id/memory/suggestions', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const res = await ctx.stub.fetch('https://do/memory/suggestions', {
    method: 'POST',
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
  // The NAME comes back with the id. A switcher that offered "org-9f2c…" would be a control nobody
  // can use correctly — and the name is null for a membership whose organisation row is missing,
  // which the panel renders as the id rather than as a blank.
  const orgs = await listOrgsFor(c.env, user.userId);
  return c.json({
    user: { scopeId: user.userId, canWrite: true },
    orgs: orgs.map((o) => ({ scopeId: o.id, name: o.name, role: o.role, canWrite: o.role === 'owner' || o.role === 'admin' })),
  });
});

// ---------------------------------------------------------------- organisations
//[[ SOMETHING HAS TO CREATE A MEMBERSHIP.
//
//   The org layer was complete except for this: `memory_org_members` authorises every org-scoped
//   read and write, and no code path anywhere wrote a row to it. Team instructions, the org
//   preference floor and the org tool policy were therefore all unreachable — implemented, tested,
//   and impossible to be subject to.
//
//   Every route below proves membership from the table before it acts, exactly like the scoped
//   memory routes: `canAdministerOrg` reads the MemoryAccess built from the members table, never
//   the body or the URL. ]]

/** The organisations this caller is in. The same rows the scope switcher is built from. */
app.get('/api/orgs', async (c) => {
  await ensureMemoryTables(c.env);
  return c.json({ orgs: await listOrgsFor(c.env, c.get('user').userId) });
});

/** Make one. The creator is its owner — see `createOrg` for why that is not optional. */
app.post('/api/orgs', async (c) => {
  await ensureMemoryTables(c.env);
  const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
  const out = await createOrg(c.env, c.get('user').userId, (body as { name?: unknown })?.name);
  if (!out.ok) return c.json({ error: out.reason }, 400);
  return c.json({ org: out.org }, 201);
});

/** Who is in it. Members only — a non-member is told nothing, including who is in it. */
app.get('/api/orgs/:id/members', async (c) => {
  const orgId = c.req.param('id');
  const proven = await memoryScopeAccess(c, 'org', orgId);
  if (!proven) return c.json({ error: 'not found' }, 404);
  return c.json({ members: await orgMembersOf(c.env, proven.access, orgId), canAdminister: canAdministerOrg(proven.access, orgId) });
});

/**
 * Add someone, or change their role.
 *
 * The user id is in the path and the role in the body, so a body cannot address a different person
 * than the URL — the same rule as the memory entry routes. `last_owner` comes back as 409 rather
 * than 403: the caller is allowed to do this in general, and it is the state of the organisation
 * that refuses, which is a different sentence and a different fix.
 */
app.put('/api/orgs/:id/members/:userId', async (c) => {
  const orgId = c.req.param('id');
  const proven = await memoryScopeAccess(c, 'org', orgId);
  if (!proven) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { role?: unknown } | null;
  const out = await updateOrgMember(c.env, proven.access, orgId, c.req.param('userId'), (body as { role?: unknown })?.role);
  if (!out.ok) return c.json({ error: out.reason }, out.reason === 'forbidden' ? 403 : out.reason === 'last_owner' ? 409 : 400);
  return c.json({ member: out.member });
});

app.delete('/api/orgs/:id/members/:userId', async (c) => {
  const orgId = c.req.param('id');
  const proven = await memoryScopeAccess(c, 'org', orgId);
  if (!proven) return c.json({ error: 'not found' }, 404);
  const out = await removeOrgMember(c.env, proven.access, orgId, c.req.param('userId'));
  if (!out.ok) {
    return c.json({ error: out.reason }, out.reason === 'forbidden' ? 403 : out.reason === 'last_owner' ? 409 : out.reason === 'not_a_member' ? 404 : 400);
  }
  return c.json({ removed: true });
});

/** Everything stored at one scope, plus the preferences and profile decoded out of it. */
app.get('/api/memory/:scope/:scopeId', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const scopeId = c.req.param('scopeId');
  //[[ SEARCH, AND WHY IT IS NOT A FILTER IN THE BROWSER.
  //
  //   The panel renders every row today, so a client-side filter would work — right up until the
  //   list is paged, at which point it answers "no matches" for text that IS stored and nothing
  //   distinguishes that from the true answer. The query goes to the store, which runs it in SQL
  //   bound to this one scope.
  //
  //   `preferences` and `profile` are decoded from the UNFILTERED rows on purpose: they are the
  //   settings in force, and a search box that silently emptied someone's preferences form while
  //   they typed in it would be a search that edits. ]]
  const query = c.req.query('q');
  const entries = await listMemoryEntries(c.env, proven.access, proven.scope, scopeId, { query });
  const all = query ? await listMemoryEntries(c.env, proven.access, proven.scope, scopeId) : entries;
  return c.json({
    scope: proven.scope,
    scopeId,
    canWrite: canWriteScope(proven.access, proven.scope, scopeId),
    query: query ?? null,
    entries: entries.map(withSensitivity),
    preferences: preferencesFromEntries(all, MEMORY_VOCAB()),
    profile: profileFromEntries(all),
  });
});

/**
 * Tag a row with the personal data it contains, so the viewer can mask it.
 *
 * Computed on the way out rather than stored in a column, and that is the point: a stored flag is a
 * second opinion that goes stale the moment the row is edited or the scanner learns a new shape,
 * and a stale "this is safe to show" is the one direction that matters. Credentials never reach
 * this function — `normaliseEntry` refuses them at the door — so what is left is the legitimate
 * personal data a person may well have asked Apple to remember.
 */
function withSensitivity(e: MemoryEntry): MemoryEntry & { sensitive: string[] } {
  return { ...e, sensitive: [...new Set(personalDisclosures(e.value).map((d) => d.kind))] };
}

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
  // The DETAIL is carried through: "that looks like an API key (sk-…)" is a sentence a person can
  // act on, and `sensitive_value` on its own is not.
  if (!out.ok) return c.json({ error: out.reason, detail: out.detail ?? null }, out.reason === 'forbidden' ? 403 : 400);
  return c.json({ entry: withSensitivity(out.entry) });
});

/**
 * Move one row to another scope — "actually, this should apply to everything I build".
 *
 * There was no way to do this: export refuses to cross scopes by design, so the only route was to
 * retype the rule in the other scope and delete the original, and between those two steps the rule
 * either applies twice or not at all. The store checks write access to BOTH ends and refuses to
 * overwrite anything already at the destination; this route only carries the answer.
 */
app.post('/api/memory/:scope/:scopeId/entries/:key/move', async (c) => {
  const proven = await memoryScopeAccess(c, c.req.param('scope'), c.req.param('scopeId'));
  if (!proven) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { toScope?: unknown; toScopeId?: unknown } | null;
  if (!body || typeof body !== 'object') return c.json({ error: 'expected a destination' }, 400);
  // The DESTINATION is proven separately, through the same function: a project id in a body is a
  // claim, and `memoryScopeAccess` is the only thing in this file that turns one into a fact.
  const toScope = body.toScope;
  const toScopeId = typeof body.toScopeId === 'string' ? body.toScopeId : '';
  const target = typeof toScope === 'string' ? await memoryScopeAccess(c, toScope, toScopeId) : null;
  if (!target) return c.json({ error: 'forbidden' }, 403);
  const out = await moveMemoryEntry(
    c.env,
    { ...proven.access, projectIds: [...new Set([...proven.access.projectIds, ...target.access.projectIds])] },
    { scope: proven.scope, scopeId: c.req.param('scopeId') },
    { scope: target.scope, scopeId: toScopeId },
    c.req.param('key'),
  );
  if (!out.ok) {
    return c.json({ error: out.reason }, out.reason === 'forbidden' ? 403 : out.reason === 'not_found' ? 404 : out.reason === 'target_exists' ? 409 : 400);
  }
  return c.json({ entry: withSensitivity(out.entry) });
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
  // THE JSON FILE CARRIES ITS OWN CHECK. `truncated` and `messageCount` already say whether the
  // transcript is COMPLETE; neither says whether the bytes arrived intact, and a transfer cut in
  // half is a file that ends mid-sentence. The digest is over `data.messages` — the part that can
  // be clipped — and it travels inside the file because a header only exists during the download.
  // Markdown gets no such line: a hex string in the prose would be part of the transcript.
  const body = md
    ? renderTranscriptMarkdown(data)
    : JSON.stringify({ ...data, sha256: await sha256hex(JSON.stringify(data.messages)) }, null, 2);
  const bytes = new TextEncoder().encode(body);
  return new Response(bytes, {
    headers: {
      'Content-Type': md ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(data.project.name, data.exportedAt, md ? 'md' : 'json')}"`,
      // BYTES, NOT CHARACTERS, and that is the whole reason the body is encoded here rather than
      // handed over as a string: a transcript is full of em dashes and emoji, and a length in
      // characters is a progress meter that reaches 100% with bytes still arriving.
      'Content-Length': String(bytes.byteLength),
      // The digest of what was ACTUALLY SENT, so the client can tell a short file from a short
      // conversation. Nothing else on the wire can: JSON that will not parse and Markdown that
      // stops mid-sentence both save without complaint.
      'X-Golem-Export-SHA256': await sha256hex(body),
    },
  });
});

/**
 * THE PROJECT'S FILES, FOR THE PERSON WHOSE PROJECT IT IS.
 *
 * The workspace has existed since the web tools shipped and NOBODY COULD SEE IT. The agent wrote
 * notes, plans, generated CSVs and design briefs into `ws:<project>:<path>` through
 * `workspace_write`, the activity feed said "Listed the project files", and there was no route that
 * returned one — so the only way to read a file Apple had written was to ask Apple to read it back
 * to you. Files a user cannot open are not the user's files.
 *
 * FIVE DECISIONS, and each of them is the same decision the rest of this file already makes:
 *
 *   1. AUTHORISATION IS THE PROJECT, NOT THE PATH. `kvWorkspace(env.KV, project.id)` puts the
 *      project id in every key it builds, so a caller cannot address another project's workspace
 *      even with a valid path — exactly the reasoning `imageKvKey` records above.
 *   2. READS ARE FOR MEMBERS, WRITES ARE FOR BUILDERS. A shared collaborator who can read the
 *      conversation can read the files that conversation produced; renaming and deleting take
 *      `build`, because they change the project rather than describe it.
 *   3. THE RULES LIVE IN workspace-files.ts, NOT HERE. Both paths of a move are validated there,
 *      collisions are refused there, and this route only maps a named code onto a status. A route
 *      that re-implemented "is this path safe" would be a second answer free to disagree with the
 *      one the tools use.
 *   4. A DOWNLOAD IS ALWAYS AN ATTACHMENT, AND ALWAYS text/plain. The stored bytes are authored by
 *      a model and a user; echoing an extension into a Content-Type would let `notes/x.js` be
 *      served as script from our own origin, and `Content-Disposition: inline` would let it be a
 *      page. The export route already serves files this way.
 *   5. NOTHING IS DELETED OUTRIGHT. `delete` moves the file to a trash with a real expiry, and the
 *      response says when it stops being recoverable.
 */
function workspaceRefusal(res: { code: WorkspaceOpCode; error: string }): Response {
  return new Response(JSON.stringify({ error: res.error, code: res.code }), {
    status: WORKSPACE_OP_STATUS[res.code],
    headers: { 'Content-Type': 'application/json' },
  });
}

app.get('/api/projects/:id/files', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'), 'read');
  if (!ctx) return c.json({ error: 'not found' }, 404);
  if (!c.env.KV) return c.json({ error: 'this deployment has no file storage' }, 503);
  const store = kvWorkspace(c.env.KV, ctx.project.id);
  const listing = await listWorkspace(store, c.req.query('prefix') ?? '');
  const bin = await trashOf(store);
  // The trash travels with the listing rather than behind its own route: a file browser that shows
  // 0 files and says nothing about the 12 recoverable ones is telling the user their work is gone.
  return c.json({ ...listing, trash: bin.entries, trashRetentionDays: bin.retentionDays });
});

app.get('/api/projects/:id/files/content', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'), 'read');
  if (!ctx) return c.json({ error: 'not found' }, 404);
  if (!c.env.KV) return c.json({ error: 'this deployment has no file storage' }, 503);
  const store = kvWorkspace(c.env.KV, ctx.project.id);
  const path = c.req.query('path') ?? '';
  const versionRaw = c.req.query('version');

  // A version was ASKED FOR, so a version that is not kept is a 404 rather than a silent fall back
  // to the current text. Serving today's file under yesterday's version number is a lie the caller
  // cannot detect.
  const version = versionRaw === undefined || versionRaw === '' ? null : Number(versionRaw);
  const got =
    version === null
      ? await (async () => {
          const history = await historyOf(store, path);
          if (!history.ok) return history;
          const current = history.versions.find((v) => v.current);
          if (!current) return { ok: false as const, code: 'not_found' as WorkspaceOpCode, error: `${history.path} is in the trash, not in the workspace` };
          return readVersionOf(store, path, current.version);
        })()
      : await readVersionOf(store, path, version);
  if (!got.ok) return workspaceRefusal(got);

  if (c.req.query('download') === '1') {
    const name = got.path.split('/').pop() ?? 'file.txt';
    return new Response(got.content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return c.json({ path: got.path, version: got.version, bytes: got.bytes, savedAt: got.savedAt, content: got.content });
});

/**
 * PUT A FILE IN, WITHOUT ASKING APPLE TO TYPE IT OUT.
 *
 * Every file in a workspace arrived through `workspace_write`, which is a TOOL: to get a design
 * brief or a CSV of level data where Apple can read it, a user had to paste the whole thing into
 * the chat and ask for it to be saved — a turn, the credits for that turn, and a model in the
 * middle that may reword it.
 *
 * TEXT ONLY, and that is not a limitation to apologise for: the workspace is a text store with a
 * declared extension list and a per-file ceiling, and `checkWorkspacePath` already enforces both.
 * There is no object store behind this worker and this route does not pretend otherwise.
 *
 * `sharedAccess(…, 'build')` rather than owner-only, exactly as /files/op is gated, so a viewer is
 * told 403 and looks at their role rather than at a missing file.
 */
app.post('/api/projects/:id/files/content', async (c) => {
  const access = await sharedAccess(c, c.req.param('id'), 'build');
  if (!access.ctx) return collabRefusal(c, access.status);
  const ctx = access.ctx;
  if (!c.env.KV) return c.json({ error: 'this deployment has no file storage' }, 503);
  const store = kvWorkspace(c.env.KV, ctx.project.id);
  const body = (await c.req.json().catch(() => null)) as { path?: unknown; content?: unknown; overwrite?: unknown } | null;
  const res = await writeWorkspaceFile(store, typeof body?.path === 'string' ? body.path : '', body?.content, {
    overwrite: body?.overwrite === true,
  });
  return res.ok ? c.json(res) : workspaceRefusal(res);
});

app.get('/api/projects/:id/files/history', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'), 'read');
  if (!ctx) return c.json({ error: 'not found' }, 404);
  if (!c.env.KV) return c.json({ error: 'this deployment has no file storage' }, 503);
  const res = await historyOf(kvWorkspace(c.env.KV, ctx.project.id), c.req.query('path') ?? '');
  if (!res.ok) return workspaceRefusal(res);
  return c.json(res);
});

app.post('/api/projects/:id/files/op', async (c) => {
  // `sharedAccess` rather than `withOwnedProject` alone, so a member who CAN read the project but
  // may not change it is told 403 — they already know the project exists, and a 404 would send them
  // looking for a missing file instead of at their own role.
  const access = await sharedAccess(c, c.req.param('id'), 'build');
  if (!access.ctx) return collabRefusal(c, access.status, access.detail);
  const ctx = access.ctx;
  if (!c.env.KV) return c.json({ error: 'this deployment has no file storage' }, 503);
  const store = kvWorkspace(c.env.KV, ctx.project.id);
  const body = (await c.req.json().catch(() => null)) as { op?: string; path?: string; to?: string; version?: number } | null;
  const path = typeof body?.path === 'string' ? body.path : '';
  const to = typeof body?.to === 'string' ? body.to : '';

  switch (body?.op) {
    // Rename and move are ONE operation named twice, because they are one operation: a rename is a
    // move whose destination happens to share a folder. Two routes would be two chances to validate
    // differently.
    case 'rename':
    case 'move': {
      const res = await moveWorkspaceFile(store, path, to);
      return res.ok ? c.json(res) : workspaceRefusal(res);
    }
    case 'copy': {
      // An explicit destination is honoured; an absent one is answered with a free name rather than
      // with a refusal the user has to solve by guessing.
      const destination = to || (await freeCopyPath(store, path));
      if (!destination) return c.json({ error: 'no free name is available near that path', code: 'occupied' }, 409);
      const res = await copyWorkspaceFile(store, path, destination);
      return res.ok ? c.json(res) : workspaceRefusal(res);
    }
    case 'delete': {
      const res = await deleteWorkspaceFile(store, path);
      return res.ok ? c.json(res) : workspaceRefusal(res);
    }
    case 'undelete': {
      const res = await restoreWorkspaceFile(store, path);
      return res.ok ? c.json(res) : workspaceRefusal(res);
    }
    case 'revert': {
      const res = await revertWorkspaceFile(store, path, Number(body?.version));
      return res.ok ? c.json(res) : workspaceRefusal(res);
    }
    default:
      // Named rather than defaulted. An unknown op silently treated as one of the others is how a
      // typo becomes a deletion.
      return c.json({ error: `unknown file operation: ${String(body?.op ?? '')}`, code: 'bad_path' }, 400);
  }
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
  const res = await pairingStub(c.env).fetch('https://do/create', {
    method: 'POST',
    body: JSON.stringify({ projectId: ctx.project.id, userId: ctx.user.userId, projectName: ctx.project.name }),
  });
  if (!res.ok) return res; // the 429 for too many live codes, passed through unchanged
  //[[ A SECOND PAIRING SUPERSEDES THE FIRST, AND THE USER IS TOLD BEFORE IT HAPPENS.
  //
  //   The session holds exactly one plugin token, so pairing again disconnects whatever was paired
  //   — and the Studio that loses it finds out on its next poll, in a different window, as a
  //   status label going grey. Nothing anywhere detected or reported that a project already had a
  //   live pairing.
  //
  //   The link is read AFTER the code is minted, not before: a failure to read it must not cost
  //   the user their code. `existingLink` is therefore null both for "nothing is paired" and for
  //   "we could not tell", and the dialog treats an absent warning as no warning rather than as an
  //   assurance — the two are not the same and it does not claim otherwise. ]]
  const dto = (await res.json()) as PairingCodeDto;
  let existingLink: StudioLinkSummary | null = null;
  try {
    const link = await ctx.stub.fetch('https://do/studio/link');
    if (link.ok) {
      const summary = (await link.json()) as StudioLinkSummary;
      if (summary.paired) existingLink = summary;
    }
  } catch {
    /* the code is already minted and is what the user came for */
  }
  return c.json({ ...dto, existingLink } satisfies PairingCodeDto);
});

/**
 * Abandon a code that was minted and not used.
 *
 * Closing the pairing dialog did nothing to the code it had just shown: it stayed claimable for
 * its full ten minutes against an UNAUTHENTICATED claim endpoint. The dialog now calls this when
 * it closes and before it mints a replacement.
 *
 * Owner-scoped here, and checked AGAIN inside PairingDO against the user who minted the code —
 * two different questions. This route answers "may you act on this project"; the object answers
 * "is this your code", which is what stops a cancel on project A from revoking a code for project
 * B. Neither check subsumes the other.
 */
app.post('/api/projects/:id/pairing/cancel', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ code?: string }>().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.slice(0, 32) : '';
  if (!code) return c.json({ error: 'code required' }, 400);
  return pairingStub(c.env).fetch('https://do/cancel', {
    method: 'POST',
    body: JSON.stringify({ code, userId: ctx.user.userId }),
  });
});

//[[ THE STUDIO LINK, FOR THE PERSON WHO OWNS THE PROJECT.
//
//   All three of these read or write state the SessionDO already held and that no signed-in user
//   could reach: `/info` carries most of it and is behind the admin key. docs/troubleshooting and
//   docs/plugin have both been telling users to "disconnect from the web workspace" — a thing that
//   did not exist until /disconnect below. ]]
app.get('/api/projects/:id/studio/diagnostics', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  return ctx.stub.fetch('https://do/studio/diagnostics');
});

/**
 * Revoke this project's pairing.
 *
 * The plugin's next poll is answered 401 and it clears its own saved session, which is the path it
 * has always taken for an expired token — so nothing new has to be installed in Studio for this to
 * work on the builds already out there.
 */
app.post('/api/projects/:id/studio/disconnect', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  void count(c.env, 'studio_revoked');
  return ctx.stub.fetch('https://do/studio/revoke', { method: 'POST' });
});

/**
 * Bind this project to whichever place Studio has open now.
 *
 * The escape hatch for the place guard, and the reason that guard is safe to ship: a user who
 * genuinely moved their work into a new place ("Save As", a republish under a new id) would
 * otherwise face a permanent refusal with re-pairing as the only way out.
 */
app.post('/api/projects/:id/studio/place/rebind', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  return ctx.stub.fetch('https://do/studio/place/rebind', { method: 'POST' });
});

/**
 * THE STUDIO COMPANION'S CHANNEL: one direct-manipulation op, driven by a person.
 *
 * This is what the companion panel's own controls talk to — the transform handles, the Explorer
 * edits, the test controls, selection and camera. No model is involved and no Credit is spent,
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

  // The deterministic roadmap is the product (§39). The model pass is opt-in, costs a Credit, and
  // can only reorder and rephrase what the scan already decided — so every failure below leaves a
  // complete roadmap on the wire, with `polished: false` saying plainly that it did not run.
  if (c.req.query('polish') !== '1') return c.json({ projectId: ctx.project.id, ...out.roadmap, shape: publicShape(out.shape) });
  const user = c.get('user');
  const spend = await c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId)).fetch('https://do/spend', {
    method: 'POST',
    body: JSON.stringify({ credits: 1, kind: 'roadmap_rank' }),
  });
  const { ok } = (await spend.json()) as { ok: boolean };
  if (!ok) {
    return c.json({
      projectId: ctx.project.id,
      ...out.roadmap,
      shape: publicShape(out.shape),
      notes: [...out.roadmap.notes, 'Daily Credits are used up, so this is the unranked roadmap.'],
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
  const body = await c.req.json<{ code?: string; place?: unknown }>().catch(() => null);
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
  const registered = await stub.fetch('https://do/plugin/register', {
    method: 'POST',
    body: JSON.stringify({
      tokenHash: await sha256hex(token),
      pluginVersion: c.req.header('X-Golem-Plugin-Version') ?? null,
      pluginProtocol: c.req.header('X-Golem-Plugin-Protocol') ?? null,
      //[[ WHICH PLACE THIS PAIRING IS FOR, recorded at the moment it is made.
      //
      //   The plugin's session is a plugin-wide Studio setting, so without this the project is
      //   bound to no place at all and its ops execute in whatever the user later opens. It rides
      //   in the body rather than on a header because it is three values, and because a plugin too
      //   old to send it simply omits the field — which studio-place.ts reads as "cannot tell",
      //   binds nothing, and refuses nothing. ]]
      place: body.place ?? null,
    }),
  });
  const bound = registered.ok ? (((await registered.json()) as { place?: unknown }).place ?? null) : null;
  void count(c.env, 'studio_paired');
  // `place` goes back so the plugin can CONFIRM the binding to the user in the dock — "paired to
  // <project> in <place>" — instead of leaving them to discover it when an op lands somewhere
  // unexpected. Null means the open place could not be identified, which is not an error.
  return c.json({ token, projectId: pairing.projectId, projectName: pairing.projectName, place: bound });
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
 * The billing record for one account, read from the DO that owns it.
 *
 * One reader rather than three call sites parsing the same payload: the checkout guard, /api/me and
 * the history route all need the same record, and three independent readings of one JSON body is
 * how two of them come to disagree about what "no subscription" looks like.
 */
async function readBillingRecord(
  env: Env,
  userId: string,
): Promise<{ plan: string; customerId: string | null; subscription: Subscription | null; events: unknown[] }> {
  const res = await env.QUOTA_DO.get(env.QUOTA_DO.idFromName(userId)).fetch('https://do/billing');
  const body = (await res.json()) as { plan?: string; customerId?: string | null; subscription?: Subscription | null; events?: unknown[] };
  return {
    plan: body.plan ?? 'free',
    customerId: body.customerId ?? null,
    subscription: body.subscription ?? null,
    events: body.events ?? [],
  };
}

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

  //[[ THE PAYMENT PROBLEM NOBODY WAS EVER TOLD ABOUT.
  //
  //   `billing.ts` keeps `past_due` ENTITLING on purpose - a failed renewal is usually an expired
  //   card, and cutting a paying customer off at the first retry is worse service than carrying
  //   them through it. The consequence was that a card could fail, Stripe could retry it over a
  //   fortnight, the subscription could lapse to free at the end, and the product never said a
  //   word: the generous grace period was invisible, so it read as the service breaking for no
  //   reason.
  //
  //   Read BEFORE the entitlement path and independently of it. `interpretDunningEvent` handles
  //   the invoice events `interpretStripeEvent` returns `ignored` for, and it returns no plan:
  //   entitlement stays the single opinion of `entitlementFor`, computed from status and period.
  //
  //   The INVOICE is the dedupe subject, so Stripe's three retries of one invoice are one line in
  //   the inbox with a count, rather than three alarms about one card. ]]
  const dunning = interpretDunningEvent(event);
  if (dunning) {
    const copy = dunningCopy(dunning);
    c.executionCtx.waitUntil(
      notify(c.env, {
        kind: 'billing_issue',
        recipientId: dunning.userId,
        subject: dunning.invoiceId ?? dunning.eventId,
        title: copy.title,
        body: copy.body,
        at: Date.now(),
      }).then(() => undefined),
    );
  }

  // The env goes in so the TIER can be read from the price Stripe is actually billing. A tier change
  // made in the Billing Portal never touches subscription metadata, so without this an upgrade
  // bought there charged the new plan and entitled the old one.
  const outcome = interpretStripeEvent(event, c.env);
  if (!outcome.userId) return c.json({ ok: true, ignored: outcome.ignored ?? 'no user', dunning: dunning?.kind ?? null });

  const quota = c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(outcome.userId));
  if (outcome.subscription) {
    // Entitlement is recomputed from status and period rather than trusting the plan field, so a
    // cancelled or lapsed subscription cannot leave a paid tier behind.
    const plan = entitlementFor(outcome.subscription, Math.floor(Date.now() / 1000));
    await quota.fetch('https://do/set-plan', {
      method: 'POST',
      // The customer id rides along so the billing portal has an account to open later. It is the
      // only way back to a subscription the user started, and it arrives on these events alone.
      //
      // THE WHOLE SUBSCRIPTION GOES TOO. status, currentPeriodEnd and cancelAtPeriodEnd were read
      // from the event and then dropped here, which is why the product could not tell a renewal
      // from a cancellation after the webhook returned. The event id goes with it so a redelivery
      // is applied once — the signature window bounds a replay, it does not make one a no-op.
      body: JSON.stringify({
        plan,
        customerId: outcome.subscription.customerId,
        subscription: outcome.subscription,
        eventId: outcome.eventId,
      }),
    });
  }
  if (outcome.creditsDelta) {
    await quota.fetch('https://do/grant-credits', {
      method: 'POST',
      body: JSON.stringify({ credits: outcome.creditsDelta, eventId: outcome.eventId }),
    });
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

  /*
   * ONE SUBSCRIPTION PER ACCOUNT, ENFORCED HERE RATHER THAN IN THE BROWSER.
   *
   * A Stripe Checkout ADDS a subscription; it never replaces one. The plan ladder already sends a
   * paying user to the portal instead, but this route did not look at the caller's state at all —
   * so a direct POST created a second subscription beside the running one and the customer was
   * charged for both. The comment above `allow_promotion_codes` in billing.ts claimed this guard
   * existed; it did not.
   *
   * A LAPSED CUSTOMER IS NOT REFUSED: coming back after a cancellation is a first subscription
   * again, and that is the reactivation path.
   */
  const record = await readBillingRecord(c.env, user.userId);
  const guard = checkoutGuard(subscriptionView(record.subscription, Math.floor(Date.now() / 1000)));
  if (!guard.ok) return c.json({ error: guard.error }, guard.status);

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

  /*
   * THE FLAG IS HOW THE PAGE KNOWS THERE IS ANYTHING TO SAY.
   *
   * Cancelling happens on Stripe's page, and with a bare return_url the product had no moment at
   * which to acknowledge it: the user came back to a page identical to the one they left, and it
   * stayed that way until the webhook landed. It carries no claim about WHAT changed — the page
   * refetches and reports the server's own state, exactly as the checkout return does, because a
   * URL parameter is not evidence that a subscription was cancelled.
   */
  const returnTo = new URL('/app/usage?billing=returned', new URL(c.req.url).origin).toString();
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

/**
 * WHAT A TIER CHANGE WOULD COST THIS ACCOUNT, ASKED BEFORE THE USER COMMITS TO IT.
 *
 * The ladder on /app/usage prints every tier's monthly price, and for anyone already paying that is
 * not the number they will be charged: a mid-period change is prorated, net of a credit for the
 * time already paid for on the old tier, and applies from a date neither price implies. Until this
 * route existed the whole of that was first seen on Stripe's own page, AFTER the user had clicked
 * through to it — nothing in this worker had ever asked Stripe what a change would cost.
 *
 * READ-ONLY, AND THAT IS THE POINT. It moves nothing, grants nothing and writes nothing; the change
 * is still made in the Billing Portal and still lands here as a webhook. GET, so it can be nothing
 * else. `entitlementFor` remains the only thing that decides what anyone may spend.
 *
 * IT REFUSES RATHER THAN GUESSES. No running subscription, a record with no item id, or a Stripe
 * that will not answer all produce an error status and no amount. A 200 carrying a zero would be a
 * sentence about money — "this change costs nothing today" — assembled out of a failure to observe.
 *
 * Scoped to the caller's own DO by construction: the id comes from the verified JWT subject, and
 * the only parameter is which tier to price.
 */
app.get('/api/billing/preview', async (c) => {
  const user = c.get('user');
  const plan: string = String(c.req.query('plan') ?? '');
  if (!isPlanId(plan)) return c.json({ error: `unknown plan "${plan}"` }, 400);

  const record = await readBillingRecord(c.env, user.userId);
  const built = buildInvoicePreviewRequest(c.env, {
    // The subscription's own customer first: it is the one the item belongs to. The DO's stored id
    // is the fallback, and is the same value in every case where both exist.
    customerId: record.subscription?.customerId ?? record.customerId,
    subscriptionId: record.subscription?.subscriptionId ?? null,
    itemId: record.subscription?.itemId ?? null,
    plan,
  });
  if (!built.ok) return c.json({ error: built.error }, built.status);

  const res = await fetch('https://api.stripe.com/v1/invoices/create_preview', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: built.body,
  });
  if (!res.ok) {
    // Stripe's own message names prices and accounts; it is not for the user.
    console.warn('stripe invoice preview failed:', res.status, await res.text().catch(() => ''));
    return c.json({ error: 'could not price this change' }, 502);
  }
  const preview = readInvoicePreview(await res.json().catch(() => null));
  if (!preview) return c.json({ error: 'could not read the price of this change' }, 502);
  return c.json(preview);
});

/**
 * THIS ACCOUNT'S BILLING HISTORY.
 *
 * `plan` used to be overwritten in place by the webhook, so "when did this account go from Studio
 * to Free, and on which Stripe event" had no answer on our side at all — not for the user, and not
 * for whoever had to answer their email about it. QuotaDO now records each change; this is where
 * the person it is about can read it.
 *
 * Scoped to the caller's own DO by construction: the id is derived from the verified JWT subject,
 * so there is no parameter here that could address somebody else's record.
 */
app.get('/api/billing/history', async (c) => {
  const user = c.get('user');
  const record = await readBillingRecord(c.env, user.userId);
  return c.json({ events: record.events });
});

/** What the plan controls should offer, so the UI never shows a button that cannot work. */
app.get('/api/billing/config', async (c) => {
  return c.json({
    checkout: checkoutConfigured(c.env),
    purchasable: PLAN_IDS.filter((p: PlanId) => priceIdFor(c.env, p) !== null),
    // THE SERVER SAYS WHAT IT CHARGES IN. A '$' on a page is not a currency — the same glyph is the
    // US, Canadian and Australian dollar — and before this the only place the real charge currency
    // appeared was Stripe's own page, after the user had already committed to paying.
    currency: PRICE_CURRENCY,
  });
});

app.get('/api/providers', async (c) => {
  // `selectProvider` is a pure function of `env` — no network, no cache. Its
  // `reasoning` string names providers and is therefore NOT returned; only
  // the boolean survives.
  const ready = selectProvider(c.env, {}).ok;
  return c.json({ ready, models: [], auto: { model: null, reasoning: '' } });
});

// ---------------------------------------------------------------- discord
/**
 * APPLE ON DISCORD.
 *
 * `/api/discord/interactions` is the bot. It is PUBLIC — Discord is not a user and carries no JWT
 * — and it authenticates by an Ed25519 signature over `timestamp + rawBody`, made with a key only
 * Discord holds. The refusals have the same shape as the Stripe webhook's, for the same reason:
 * this endpoint can spend a customer's Credits, so unverified it is a button anyone on the internet
 * may press on somebody else's account.
 *
 *   - no public key configured -> 503. Never "no key, so trust the body".
 *   - bad, forged or stale signature -> 401 BEFORE parsing and BEFORE dispatch, with the reason
 *     logged and not returned, so a prober cannot use the answer to improve a forgery.
 *
 * The raw body is read with .text() inside the handler and parsed only after verification:
 * re-serialising parsed JSON changes bytes and the signature could never match again.
 */
function discordStub(env: Env) {
  return env.DISCORD_DO.get(env.DISCORD_DO.idFromName('singleton'));
}

async function okJson<T>(p: Promise<Response>): Promise<T | null> {
  const res = await p.catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

function discordPorts(env: Env, origin: string): DiscordPorts {
  const d = discordStub(env);
  const projectUrl = (projectId: string) => `${origin}/app/projects/${projectId}`;
  return {
    redeemLinkCode: async (discordUserId, code) =>
      (await okJson<RedeemResult>(
        d.fetch('https://do/redeem', { method: 'POST', body: JSON.stringify({ discordUserId, code }) }),
      )) ?? { ok: false, reason: 'invalid' },
    removeLink: async (discordUserId) =>
      (await okJson<{ removed: boolean }>(
        d.fetch('https://do/unlink', { method: 'POST', body: JSON.stringify({ discordUserId }) }),
      ))?.removed === true,
    findLink: async (discordUserId) =>
      (
        await okJson<{ link: LinkRecord | null }>(
          d.fetch(`https://do/link?discordUserId=${encodeURIComponent(discordUserId)}`),
        )
      )?.link ?? null,
    quota: async (appleUserId) =>
      await okJson<QuotaState>(env.QUOTA_DO.get(env.QUOTA_DO.idFromName(appleUserId)).fetch('https://do/state')),
    projectHealth: async (projectId) =>
      await okJson<{ agentStatus: string; pluginConnected: boolean }>(sessionStub(env, projectId).fetch('https://do/info')),
    run: async (projectId) =>
      (await okJson<{ run: RunSnapshot | null }>(sessionStub(env, projectId).fetch('https://do/run-state')))?.run ?? null,
    startBuild: async (projectId, prompt) => {
      // The same door a chat message goes through: same run loop, same tools, same quota, same
      // budget. A separate "Discord build" path would be a second agent to keep in step.
      const body = await okJson<{ ok?: boolean; error?: string }>(
        sessionStub(env, projectId).fetch('https://do/agent-run', {
          method: 'POST',
          body: JSON.stringify({ text: prompt, mode: 'stone' }),
        }),
      );
      return body?.ok ? { ok: true } : { ok: false, error: body?.error ?? 'the project would not start a run' };
    },
    watchRun: async (link, applicationId, token) => {
      await d
        .fetch('https://do/watch', {
          method: 'POST',
          body: JSON.stringify({
            projectId: link.projectId,
            projectName: link.projectName,
            projectUrl: projectUrl(link.projectId),
            applicationId,
            token,
          }),
        })
        .catch(() => {});
    },
    projectUrl,
  };
}

app.post('/api/discord/interactions', async (c) => {
  const out = await handleDiscordRequest(c.req.raw, {
    publicKeyHex: c.env.DISCORD_PUBLIC_KEY,
    ports: discordPorts(c.env, new URL(c.req.url).origin),
  });
  // Reachable only once the signature verified: every other path returns before dispatch, so
  // nothing below can run for a request that is not from Discord.
  if (out.deferred && out.reply) {
    const { applicationId, token } = out.reply;
    const work = out.deferred;
    c.executionCtx.waitUntil(work((content) => editOriginal(applicationId, token, content).then(() => undefined)));
  }
  return c.json(out.body as Record<string, unknown>, out.status as 200);
});

/**
 * Mint a link code for ONE project the caller owns.
 *
 * The authenticated half of the proof. Ownership is checked by `withOwnedProject` with the user's
 * own Supabase token — exactly as pairing and checkpoints are — so a code can only ever carry a
 * project this user really owns. Whoever presents it in Discord has thereby demonstrated they
 * were signed in to this account, which is the whole point of the flow.
 */
app.post('/api/projects/:id/discord-code', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  void count(c.env, 'discord_code_create');
  return discordStub(c.env).fetch('https://do/mint', {
    method: 'POST',
    body: JSON.stringify({ appleUserId: ctx.user.userId, projectId: ctx.project.id, projectName: ctx.project.name }),
  });
});

/** Which Discord account, if any, may currently spend this user's Credits. */
app.get('/api/discord/link', async (c) => {
  const user = c.get('user');
  const body = await okJson<{ link: LinkRecord | null }>(
    discordStub(c.env).fetch(`https://do/link-for-owner?appleUserId=${encodeURIComponent(user.userId)}`),
  );
  return c.json({ link: body?.link ?? null });
});

/** Revoke from the Apple side. Discord's own `/unlink` revokes the same link from the other end. */
app.delete('/api/discord/link', async (c) => {
  const user = c.get('user');
  const body = await okJson<{ removed: boolean }>(
    discordStub(c.env).fetch('https://do/unlink', { method: 'POST', body: JSON.stringify({ appleUserId: user.userId }) }),
  );
  return c.json({ removed: body?.removed === true });
});

/**
 * Publish the slash commands to Discord. The ONLY use of the bot token.
 *
 * Owner-key gated and idempotent — the PUT replaces the whole list, so running it twice changes
 * nothing. It must be run once after the application exists, and again whenever COMMANDS changes,
 * or Discord keeps offering commands the worker no longer has.
 */
app.post('/api/admin/discord/register-commands', async (c) => {
  if (!c.env.DISCORD_BOT_TOKEN) return c.json({ error: 'no bot token configured' }, 503);
  const res = await registerCommands(c.env.DISCORD_BOT_TOKEN);
  if (!res.ok) {
    console.warn('discord command registration failed:', res.status, res.detail);
    return c.json({ error: 'discord refused the command list', status: res.status }, 502);
  }
  return c.json({ ok: true, registered: res.names });
});

app.get('/api/me', async (c) => {
  const user = c.get('user');
  const [profile, quotaRes, record] = await Promise.all([
    getProfile(c.env, user.jwt, user.userId),
    c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId)).fetch('https://do/state'),
    readBillingRecord(c.env, user.userId),
  ]);
  const budget = (await budgetState(c.env)) as { dayRemainingFraction: number; killed: boolean };
  return c.json({
    userId: user.userId,
    email: user.email,
    profile,
    quota: await quotaRes.json(),
    /*
     * THE SUBSCRIPTION, NOT JUST THE TIER.
     *
     * `quota.plan` says what may be spent. It cannot say when the plan renews, that it cancels at
     * the end of the period, that a renewal failed and is being retried, or that a payment is
     * waiting on a card authentication — all of which arrived on the same Stripe event and were
     * discarded. `subscriptionView` is the single reading of that record; every surface derives
     * from it rather than interpreting the raw fields again.
     */
    billing: subscriptionView(record.subscription, Math.floor(Date.now() / 1000)),
    // service-wide headroom, so the app can explain a shared-capacity stop honestly
    service: { capacityRemaining: budget.dayRemainingFraction, paused: budget.killed },
  });
});

app.get('/api/me/usage', async (c) => {
  const user = c.get('user');
  const res = await c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId)).fetch('https://do/history');
  return c.json(await res.json());
});

/**
 * THE INBOX.
 *
 * ADDRESSED BY THE TOKEN, NEVER BY A PARAMETER. There is no `?user=` on this route and there is no
 * variant of the store that takes one: `c.get('user').userId` comes from the verified JWT, and the
 * store binds it into every clause. An inbox is the densest concentration of "who did what with
 * whom" the product has - a mention says who is on a project, a security event says when a key
 * moved - so a listing that could be addressed by user id would be a directory of everyone's
 * activity behind one bad `if`.
 *
 * `groups` rides along with the rows rather than sitting behind a second route, because a client
 * that renders a collapsed view and a count needs both to agree about the same instant. Two routes
 * would be two reads at two times, and the number under the heading would disagree with the list
 * under it often enough for somebody to file it.
 */
app.get('/api/notifications', async (c) => {
  const user = c.get('user');
  await ensureNotificationTables(c.env);
  const now = Date.now();
  const unreadOnly = c.req.query('unread') === 'true';
  const limit = Number(c.req.query('limit'));
  const [items, unread, groups] = await Promise.all([
    listNotifications(c.env, user.userId, { now, unreadOnly, limit: Number.isFinite(limit) ? limit : undefined }),
    unreadCount(c.env, user.userId, { now }),
    groupNotifications(c.env, user.userId, { now }),
  ]);
  return c.json({ items, unread, groups, kinds: INBOX_KINDS });
});

/**
 * Mark rows read.
 *
 * The count comes back from the WRITE. "Marked 4 read" when the ids belonged to someone else's
 * inbox is exactly what the recipient binding exists to prevent, and echoing the request back as
 * if it were the result is how that would go unnoticed.
 */
app.post('/api/notifications/read', async (c) => {
  const user = c.get('user');
  const body = (await c.req.json().catch(() => null)) as { ids?: unknown; all?: unknown } | null;
  await ensureNotificationTables(c.env);
  const all = body?.all === true;
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  if (!all && ids.length === 0) return c.json({ error: 'name some ids, or pass all' }, 400);
  const marked = await markRead(c.env, user.userId, { ids, all, now: Date.now() });
  return c.json({ marked, unread: await unreadCount(c.env, user.userId, { now: Date.now() }) });
});

app.get('/api/docs/search', async (c) => {
  const q = (c.req.query('q') ?? '').slice(0, 300);
  if (!q.trim()) return c.json({ hits: [] });
  // embeddings cost neurons, so this is metered like any other inference
  const user = c.get('user');
  const spend = await c.env.QUOTA_DO.get(c.env.QUOTA_DO.idFromName(user.userId)).fetch('https://do/spend', {
    method: 'POST',
    body: JSON.stringify({ credits: 1, kind: 'docs_search' }),
  });
  const { ok } = (await spend.json()) as { ok: boolean };
  if (!ok) return c.json({ error: 'Daily Credits used up', hits: [] }, 429);
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
 * spend model tokens without a reservation. It charges no user Credits: QuotaDO is untouched.
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

/**
 * Populate the curated asset library. The harvest lives in packages/corpus/data/asset-seeds.json
 * and is pushed here in batches by scripts/ingest-assets.mjs.
 */
app.post('/api/admin/assets/ingest', async (c) => {
  const body = await c.req.json<IngestRequest>().catch(() => null);
  if (!body || !Array.isArray(body.assets)) {
    return c.json({ error: 'assets must be an array of provenance records' }, 400);
  }
  return c.json(await ingestAssets(c.env, body));
});

/**
 * Import pending library rows into Roblox as Open Use assets. Bounded per call; driven in a loop
 * by scripts/import-assets.mjs so no single request runs long enough to be killed mid-upload.
 */
app.post('/api/admin/assets/import', async (c) => {
  const body = await c.req.json<{ limit?: number; source?: string; idPrefix?: string; after?: string }>().catch(() => null);
  const limit = Number.isFinite(body?.limit) ? Number(body?.limit) : 5;
  return c.json(await importPending(c.env as never, limit, body?.source, body?.idPrefix, body?.after));
});

/**
 * Undo imports: archive the assets on Roblox and return the rows to pending. Bounded per call.
 * Exists because 299 assets were uploaded to the owner's personal account before he had agreed to
 * it, and an action with a reverse is a different decision from one without.
 */
app.post('/api/admin/assets/unimport', async (c) => {
  const body = await c.req.json<{ limit?: number; force?: boolean }>().catch(() => null);
  const limit = Number.isFinite(body?.limit) ? Number(body?.limit) : 5;
  // `force` unlinks a row whose Roblox asset cannot be archived — Images and Decals cannot be.
  return c.json(await unimportAssets(c.env as never, limit, body?.force === true));
});

/**
 * The customer's OWN Roblox key: connect, inspect, disconnect.
 *
 * Under `/api/me/` rather than `/api/admin/` because the credential belongs to the person, not to
 * the deployment — and because an admin route that could reach a customer's Roblox key would be a
 * cross-tenant hole with a friendly name. Every handler takes the user id off the verified JWT and
 * never off the body.
 */
app.put('/api/me/roblox-key', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'not signed in' }, 401);
  const body = await c.req.json<{ apiKey?: string; robloxCreatorId?: string; creatorType?: string; scopes?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: 'a JSON body is required' }, 400);
  const res = await putRobloxCredential(c.env as never, {
    userId: user.userId,
    apiKey: String(body.apiKey ?? ''),
    robloxCreatorId: String(body.robloxCreatorId ?? ''),
    creatorType: body.creatorType === 'group' ? 'group' : 'user',
    scopes: body.scopes,
  });
  // The response carries the DESCRIPTION, never the key — see user-credentials.ts rule 1.
  return res.ok ? c.json({ credential: res.credential }) : c.json({ error: res.error }, 400);
});

app.get('/api/me/roblox-key', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'not signed in' }, 401);
  return c.json({ credential: await describeRobloxCredential(c.env as never, user.userId) });
});

app.delete('/api/me/roblox-key', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'not signed in' }, 401);
  return c.json({ removed: await deleteRobloxCredential(c.env as never, user.userId) });
});

/**
 * Import library assets into the CALLER'S OWN Roblox account, using the key they connected.
 *
 * Under `/api/me/` and not `/api/admin/`: the assets land in the caller's account, so the caller
 * is the only person who may ask for it. The admin route beside it exists for Apple's own library
 * work and writes to the deployment's account — two different acts that would be one route, and
 * one accident, if they shared a path.
 */
app.post('/api/me/roblox-import', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'not signed in' }, 401);
  const body = await c.req.json<{ limit?: number; idPrefix?: string; after?: string }>().catch(() => null);
  const limit = Number.isFinite(body?.limit) ? Number(body?.limit) : 3;
  return c.json(await importPending(c.env as never, limit, undefined, body?.idPrefix, body?.after, user.userId));
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

/** Clear a user's Credit usage for a day, so the visual benchmark can be run more than once daily. */
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
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  //[[ NO DDL ON THE HAPPY PATH. A deploy is one POST per file and each lands on a different
  //   isolate, so `ensureStaticTables` ran its whole list on very nearly every request — and under
  //   a concurrent bulk ingest D1 answered "is overloaded. Requests queued for too long." on the
  //   first `create table if not exists`, before a single byte was stored. The tables have existed
  //   since the first deploy; the work now simply runs, and the schema is built only if SQLite
  //   itself says it is missing. ]]
  return await withSchema(async () => {
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
  }, () => ensureStaticTables(c.env));
});

app.get('/api/admin/static-list', async (c) => {
  await ensureStaticTables(c.env);
  const rows = await c.env.CORPUS.prepare(`select path, n_chunks, content_type, immutable, updated_at from static_assets order by path`).all();
  return c.json(rows.results);
});

/**
 * Tell the account holder that something security-relevant happened on their account.
 *
 * SENT EVEN WHEN THEY DID IT THEMSELVES, which is the whole point and the one place this product
 * deliberately notifies somebody about their own action. "A new API key was created" is unremarkable
 * on the day you create one and is the only warning you get on the day you did not. A log that is
 * never read while nothing is wrong is a log nobody thinks to read on the day something is - and
 * `analytics.ts`'s AuditEvent was exactly that: written on every one of these paths, visible to an
 * operator, and never to the person whose account it was about.
 *
 * `security_event` is a kind nobody may mute (notifications.ts), so this needs no preference check.
 */
function securityNotice(c: Context, recipientId: string, subject: string, title: string, body: string): void {
  const sending = notify(c.env, {
    kind: 'security_event',
    recipientId,
    actorId: c.get('user')?.userId,
    subject,
    title,
    body,
    at: Date.now(),
  })
    .then(() => undefined)
    // A notification that cannot be DELIVERED must not surface as a failure of the thing it is
    // about. The key was minted; the member was removed; those are done and the answer is true.
    .catch(() => undefined);
  //[[ `c.executionCtx` THROWS — it does not return undefined — when the worker was invoked without
  //   one. Every test harness in this repository calls `app.fetch(request, env)` with two
  //   arguments, so reaching for it unguarded turned an API-key mint and a member removal into
  //   500s: a security NOTICE taking down the security ACTION it was reporting on. ]]
  try {
    c.executionCtx.waitUntil(sending);
  } catch {
    void sending;
  }
}

/**
 * "The password on your account was changed."
 *
 * THE ONE SECURITY EVENT THIS WORKER CANNOT SEE FOR ITSELF. Every other `securityNotice` call site
 * sits inside the action it reports: this worker mints the key, so it knows a key was minted.
 * Supabase performs a password change and this worker only ever verifies the JWT that comes back
 * afterwards, so there is no moment in this process where the change is observable. The browser
 * reports it instead — apps/web/src/routes/settings.tsx, straight after `updateUser` succeeds.
 *
 * WHAT THAT DOES AND DOES NOT COVER, said plainly rather than left for someone to discover: an
 * attacker who has taken the account over can change the password without making this call, and
 * nothing here would know. It is not a tripwire. What it is, is the ordinary case — a machine left
 * signed in, a password changed on it, and the owner reading their own history later from
 * somewhere else and finding the line. The day a Supabase auth hook exists in this deployment, the
 * event should be raised from there and this route can go.
 *
 * NOT `securityNotice`, WHICH IS FIRE-AND-FORGET. That is right for the key routes, where the
 * notice must never take down the action it reports on; here the notice IS the action, and the
 * page prints "noted in your account history" on the strength of the answer. So this awaits the
 * write and returns what actually happened. A failure is a 200 with `recorded: false`, never a
 * 500: the password genuinely did change, and reporting that as failed because the diary entry
 * failed is the worse of the two wrong answers.
 *
 * The recipient is the token's subject. There is no id in the path and none is read from the body
 * — a route that took one would be a way to post "your password was changed" into anybody's inbox.
 */
app.post('/api/security/password-changed', async (c) => {
  const user = c.get('user');
  const outcome = await notify(c.env, {
    kind: 'security_event',
    recipientId: user.userId,
    actorId: user.userId,
    // Constant, so the store coalesces a retry loop into an occurrence count instead of burying
    // the rows above it.
    subject: 'password',
    title: 'The password on your account was changed',
    body: 'If this was not you, reset your password from the sign-in page and sign out everywhere.',
    at: Date.now(),
  });
  return c.json(outcome.delivered ? { recorded: true } : { recorded: false, reason: outcome.reason });
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
  securityNotice(
    c,
    user.userId,
    `key:${minted.id}`,
    'A new API key was created on your account',
    `"${name}" (${minted.mode}) can reach ${projects.length} project(s) with ${scopes.length} scope(s). If this was not you, revoke it.`,
  );
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
  securityNotice(
    c,
    user.userId,
    `key:${minted.id}`,
    'An API key on your account was rotated',
    `"${existing.name}" was replaced. The old key stops working at ${new Date(plan.retireAt).toISOString()}.`,
  );
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
  securityNotice(c, user.userId, `key:${c.req.param('id')}`, 'An API key on your account was revoked', 'It stops working immediately.');
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
async function quotaSpend(env: Env, userId: string, credits: number, kind: string, requestId: string) {
  const res = await env.QUOTA_DO.get(env.QUOTA_DO.idFromName(userId)).fetch('https://do/spend', {
    method: 'POST',
    headers: { [REQUEST_ID_HEADER]: requestId },
    body: JSON.stringify({ credits, kind }),
  });
  return (await res.json()) as { ok: boolean; state?: { creditsRemaining?: number } };
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
  let creditsSpent = 0;
  let creditsRemaining: number | null = null;
  if (sandbox) {
    resp = sandboxCompletion(req);
  } else {
    // Admission first: one Credit before anything runs, settled against the real cost afterwards.
    // Same order the agent loop uses — a call that is refused must not have cost anything.
    const admission = await quotaSpend(c.env, key.userId, 1, legacy ? 'api_completion' : 'api_chat', requestId);
    if (!admission.ok) {
      return refuse(429, 'insufficient_quota', 'This account has no Credits left today.');
    }
    creditsSpent = 1;
    creditsRemaining = admission.state?.creditsRemaining ?? null;
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
    const owed = creditsForNeurons(resp.neurons) - creditsSpent;
    if (owed > 0) {
      const settle = await quotaSpend(c.env, key.userId, owed, legacy ? 'api_completion' : 'api_chat', requestId);
      creditsSpent += owed;
      creditsRemaining = settle.state?.creditsRemaining ?? creditsRemaining;
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
      creditsSpent,
      creditsRemaining,
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

// ---------------------------------------------------------------- /v1 MCP
/**
 * The Model Context Protocol endpoint, over Streamable HTTP.
 *
 * WHAT AN MCP CLIENT IS, HERE. Claude, Cursor or any other MCP host points at this URL with an API
 * key and gets a read-only view of a place the key was granted. It is the same credential, the same
 * grant and the same rate limit as the rest of `/v1` — an MCP server with a login of its own would
 * be a second front door to the same house, and the second one is always the weaker one.
 *
 * THE TRANSPORT IS THE CURRENT REVISION. 2026-07-28 removed protocol-level sessions and the
 * standalone GET stream, so there is no `Mcp-Session-Id` to issue and nothing to resume: one POST,
 * one JSON response. GET and DELETE answer 405 rather than 404 so a client on an older revision
 * learns "no stream here" instead of "no endpoint here". The `initialize` handshake is still served
 * because that is what shipping clients send today.
 *
 * WHERE THE AUTHORISATION IS. The `/v1/*` middleware has already proven the key is real, unrevoked,
 * unexpired and inside its rate limit — but it could not check scope or project, because the route
 * table's scope is per PATH and this path carries every MCP method. So `tools/call` asks
 * `authorizeKey` itself, with the called tool's own scope and the project id out of the arguments,
 * and only then resolves a session through `grantedProjectStub`. Removing either half would leave a
 * key able to read a project it was never granted.
 */
app.post('/v1/mcp', async (c) => {
  const key = c.get('apiKey');

  const raw = await c.req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw || 'null');
  } catch {
    return c.json(rpcError(null, RPC.parseError, 'The request body is not valid JSON.'), 400);
  }

  const parsed = parseRpc(body);
  if (!parsed.ok) return c.json(rpcError(null, parsed.code, parsed.message), 400);
  const { id, method, params, isNotification } = parsed.request;

  // ---- the headers must agree with the body ----
  // Checked BEFORE the version is resolved and long before anything is served, because the whole
  // point is that nothing acts on the body while something upstream acted on a header saying
  // otherwise. See `headerDisagreement` in mcp.ts for why a server is required to compare these.
  const disagreement = headerDisagreement(
    { method: c.req.header(MCP_METHOD_HEADER) ?? null, name: c.req.header(MCP_NAME_HEADER) ?? null },
    { method, params },
  );
  if (disagreement) return c.json(rpcError(id, RPC.headerMismatch, disagreement), 400);

  // The protocol version is the same rule applied to the third standard header. A server that
  // quietly preferred one of them would answer in a shape the client did not ask for, and the
  // mismatch is exactly the signal that a client is half-migrated between revisions.
  const header = c.req.header(MCP_PROTOCOL_HEADER) ?? null;
  const inBody = metaVersion(params);
  if (header && inBody && header !== inBody) {
    return c.json(
      rpcError(
        id,
        RPC.headerMismatch,
        `Header mismatch: ${MCP_PROTOCOL_HEADER} header value '${header}' does not match body protocol version '${inBody}'.`,
      ),
      400,
    );
  }
  const declared = header ?? inBody ?? (method === 'initialize' ? (params.protocolVersion as unknown) : null);
  const negotiated = negotiateVersion(declared);
  if (!negotiated.ok) {
    return c.json(
      rpcError(id, negotiated.code, 'Unsupported protocol version', { supported: negotiated.supported, requested: negotiated.requested }),
      400,
    );
  }
  const version = negotiated.version;

  // A notification has no id and therefore no answer. 202 with an empty body, per the transport.
  if (isNotification) {
    if (method.startsWith('notifications/')) return c.body(null, 202);
    return c.json(rpcError(null, RPC.invalidRequest, `'${method}' is a request, not a notification — it needs an id.`), 400);
  }

  const ok = (result: Record<string, unknown>) => c.json(rpcResult(id, result, version));
  const fail = (code: number, message: string, data?: unknown) => c.json(rpcError(id, code, message, data));

  switch (method) {
    case 'server/discover':
      void count(c.env, 'mcp_discover');
      return ok(discoverResult());

    case 'initialize':
      void count(c.env, 'mcp_initialize');
      return ok(initializeResult(version));

    case 'ping':
      return ok({});

    case 'tools/list':
      // `true` for studioConnected on purpose: the published list is a property of this SERVER, not
      // of whether one project's Studio happens to be open right now. A client lists tools once, at
      // connect, across every project the key holds. A call made while Studio is shut comes back as
      // an honest tool error instead of a tool that vanished.
      return ok({ tools: mcpToolList(toolDefs(true, new Set(MCP_TOOL_NAMES))) });

    case 'tools/call': {
      const entry = mcpTool(params.name);
      if (!entry) {
        // Deliberately the same answer for "no such tool" and "that tool is not on this surface":
        // a distinct message would tell a stranger's program which of the agent's tools exist.
        return fail(RPC.invalidParams, `Unknown tool '${String(params.name ?? '')}'. Call tools/list for what this server exposes.`);
      }
      const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? { ...(params.arguments as Record<string, unknown>) }
        : {};
      const projectId = typeof args.project_id === 'string' ? args.project_id : '';
      if (!projectId) return fail(RPC.invalidParams, "'project_id' is required. GET /v1/projects lists the projects this key was granted.");
      delete args.project_id; // the registry tool takes no such argument; it is addressed by session

      const verdict = authorizeKey(key, { scope: entry.scope, projectId, now: Date.now() });
      if (!verdict.ok) return fail(RPC.forbidden, verdict.message, { code: verdict.code });

      const g = grantedProjectStub(c, projectId);
      if (!g) return fail(RPC.forbidden, 'This API key was not granted access to that project.', { code: 'project_not_granted' });

      const res = await g.stub.fetch('https://do/mcp-tool', traced(c, {
        method: 'POST',
        body: JSON.stringify({ tool: entry.tool, args }),
      }));
      const out = (await res.json()) as { ok?: boolean; resultForLlm?: string; error?: string };
      // 403 is the session's own allowlist refusing — a boundary, so it goes back as a JSON-RPC
      // error that a model is not invited to retry around. Any OTHER failure (a project with no
      // session yet, a session that could not serve the call) is a condition the caller can act on
      // and is reported as a tool error, because dressing it as a permission refusal would send
      // somebody looking at their API key for a problem that is about their Studio.
      if (res.status === 403) {
        return fail(RPC.forbidden, out.error ?? 'That tool is not on the MCP surface.', { code: 'tool_not_on_surface' });
      }
      if (!res.ok) return ok(toolResult(JSON.stringify({ error: out.error ?? 'The session could not serve that call.' }), true));
      void count(c.env, 'mcp_tool_call');
      return ok(toolResult(out.resultForLlm ?? '{}', out.ok === false));
    }

    default:
      return fail(RPC.methodNotFound, `This server does not implement '${method}'. It offers tools only.`);
  }
});

/**
 * No stream, and no session to end.
 *
 * Both answer 405 rather than 404 because 404 means "no endpoint", which would send a client on an
 * older revision looking for another URL. `Allow: POST` says what this endpoint does take.
 */
const mcpMethodNotAllowed = (c: PublicCtx) =>
  c.json(
    errorBody(
      405,
      'method_not_allowed',
      'The MCP endpoint takes POST only. This server implements Streamable HTTP without the deprecated server-initiated SSE stream, and issues no session to delete.',
      c.get('requestId'),
    ),
    405,
    { Allow: 'POST' },
  );
app.get('/v1/mcp', mcpMethodNotAllowed);
app.delete('/v1/mcp', mcpMethodNotAllowed);

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
  /**
   * What this route touches. Omitted means PROJECT-WIDE, which is the safe default: a route that
   * forgets to name its surface refuses every scoped grant rather than admitting one. See
   * ShareResource in collab.ts for why `'any'` exists and who is allowed to pass it.
   */
  resource?: ShareResource,
): Promise<
  | { ctx: NonNullable<Awaited<ReturnType<typeof withOwnedProject>>>; status: 200 }
  | { ctx: null; status: 403 | 404; detail?: string }
> {
  const ctx = await withOwnedProject(c, projectId, action, resource);
  if (ctx) return { ctx, status: 200 };
  if (!UUID_RE.test(projectId)) return { ctx: null, status: 404 };
  const probe = await getProjectAccess(c.env, c.get('user'), projectId, 'read', Date.now(), resource);
  if (probe.project !== null) return { ctx: null, status: 403 };
  // A LIVE GRANT THAT DOES NOT REACH THIS ROUTE IS NOT "NO SUCH PROJECT". Someone holding a
  // chat link can already prove the project exists; 404 would hide the only fact they can act
  // on — that their link opens the conversation and not the project around it.
  return probe.decision.reason === 'scoped_grant'
    ? { ctx: null, status: 403, detail: 'scoped_grant' }
    : { ctx: null, status: 404 };
}

const collabRefusal = (c: Context, status: 403 | 404, detail?: string) =>
  c.json({ error: status === 403 ? 'forbidden' : 'not found', ...(detail === undefined ? {} : { detail }) }, status);

/**
 * WHICH SURFACE A COLLAB ROUTE TOUCHES, read from the target it names.
 *
 * A comment on a MESSAGE is on the chat surface; a comment on a BUILD or a VERSION is on that
 * build. Anything else — a comment on the project, a target this function does not recognise, a
 * build named with no id — is project-wide, which is the refusing answer for a scoped grant. The
 * default direction matters more than the mapping: an unrecognised target must narrow the caller's
 * access, never widen it.
 */
function targetResource(body: Record<string, unknown>): ShareResource | undefined {
  const kind = typeof body.targetKind === 'string' ? body.targetKind : null;
  const id = typeof body.targetId === 'string' && body.targetId.length > 0 ? body.targetId : null;
  if (kind === 'message') return { kind: 'chat', id: null };
  if ((kind === 'build' || kind === 'version') && id !== null) return { kind: 'build', id };
  return undefined;
}

/** The project's one conversation. `id: null` because there cannot be a different one. */
const CHAT_SURFACE: ShareResource = { kind: 'chat', id: null };

/** The member directory the store needs, built from the project's LIVE grants only. */
async function collabDirectory(c: Context, ctx: { user: AuthedUser; project: ProjectRow }) {
  const rows = await listProjectMembers(c.env, ctx.user, ctx.project);
  const profile = await getProfile(c.env, ctx.user.jwt, ctx.project.owner_id);
  return memberDirectory(ctx.project, rows, profile?.display_name ?? null);
}

/**
 * THE ROSTER: the same rows the directory is built from, INCLUDING the ones it hides.
 *
 * `collabDirectory` above is the live list — who can be @mentioned right now — and administration
 * needs the opposite: the expired invitation, the suspended member, the guest who walked in
 * through a link are exactly the rows somebody is about to act on. Both views classify through
 * `classifyGrant`, so neither can say a grant is live when the door says it is not.
 *
 * `complete` is not decoration. The link-derived grants live in KV, a store that can be
 * unreachable, and an empty list from a failed read is indistinguishable from "this project has no
 * guests" — a failure to observe rendering as an observation. The route says `partial: true`
 * rather than quietly showing a shorter list.
 */
async function collabRoster(c: Context, ctx: { user: AuthedUser; project: ProjectRow }, nowMs: number = Date.now()) {
  const rows = await listProjectMembers(c.env, ctx.user, ctx.project);
  const profile = await getProfile(c.env, ctx.user.jwt, ctx.project.owner_id);
  const links = await listKvGrants(c.env, ctx.project.id);
  return {
    roster: buildRoster({
      project: ctx.project,
      rows,
      kvGrants: links.grants,
      ownerHandle: profile?.display_name ?? null,
      nowMs,
    }),
    complete: links.complete,
  };
}

/**
 * One membership row as it stands right now — the BEFORE an audit event needs.
 *
 * `POST /members` merges on the primary key, so the row it lands on is gone the instant it
 * succeeds. An audit log written from the REQUEST would record "invited" for a demotion.
 */
async function membershipRow(
  c: Context,
  ctx: { user: AuthedUser; project: ProjectRow },
  userId: string,
): Promise<MemberRow | null> {
  const { ok, data } = await supaRest<MemberRow[]>(
    c.env,
    ctx.user.jwt,
    `/project_members?project_id=eq.${encodeURIComponent(ctx.project.id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return ok && Array.isArray(data) && data[0] ? data[0] : null;
}

/**
 * Append to the membership history, and SAY WHETHER IT WAS WRITTEN.
 *
 * The membership change has already happened by the time this runs; a failed append must not undo
 * it and must not be swallowed either. Every route that calls this returns `audited`, so a caller
 * who needs the record knows whether there is one. An unconditional `ok: true` over a failed
 * insert is the exact shape this repository keeps finding: the claim survives, the fact does not.
 */
async function recordMembershipEvents(
  c: Context,
  ctx: { user: AuthedUser; project: ProjectRow },
  inputs: readonly Omit<MembershipEventInput, 'projectId' | 'actorId' | 'at'>[],
): Promise<{ ok: boolean; written: number; requested: number }> {
  const at = new Date().toISOString();
  const built = inputs.map((i) => buildMembershipEvent({ ...i, projectId: ctx.project.id, actorId: ctx.user.userId, at }));
  const rows = built.filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return { ok: false, written: 0, requested: inputs.length };
  const { ok } = await supaRest(c.env, ctx.user.jwt, '/membership_events', {
    method: 'POST',
    prefer: 'return=minimal',
    body: JSON.stringify(rows),
  });
  // Complete only when every event asked for was built AND the insert took them.
  return { ok: ok && rows.length === inputs.length, written: ok ? rows.length : 0, requested: inputs.length };
}

/**
 * PUSH A MEMBERSHIP CHANGE INTO THE SOCKETS THAT ARE ALREADY OPEN.
 *
 * The HTTP half of this was already right and is tested: every shared route re-resolves membership
 * through `sharedAccess` on every request, so a removed member is a stranger on their next call.
 * A WEBSOCKET MAKES NO FURTHER CALLS. The role is decided once at the handshake, frozen onto the
 * socket, and every later frame is gated against that frozen value — so a member who was removed,
 * suspended or demoted kept every capability they had for as long as the tab stayed open, and a
 * workspace tab stays open for days.
 *
 * Best effort by design: the membership change has ALREADY LANDED by the time this runs, and a
 * Durable Object that cannot be reached must not undo it. What this must not do is let the route
 * claim it happened — the counts come back on the response, so `{ matched: 0 }` is a fact the
 * caller can read and `null` says the push could not be made at all.
 */
async function pushAccessChange(
  stub: DurableObjectStub,
  userId: string,
  role: CollabRole | null,
): Promise<{ matched: number; closed: number; demoted: number } | null> {
  try {
    const res = await stub.fetch('https://do/collab/access-changed', {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { matched?: unknown; closed?: unknown; demoted?: unknown };
    return typeof out?.matched === 'number'
      ? { matched: out.matched, closed: Number(out.closed) || 0, demoted: Number(out.demoted) || 0 }
      : null;
  } catch {
    return null;
  }
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
  // THE ONE ROUTE THAT TAKES `'any'`, and it earns it by narrowing its own answer. Someone who
  // redeemed a chat link needs to be told what they hold — a role and a scope — and must not be
  // handed the member directory along with it.
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read', 'any');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  const projectWide = ctx.membership.scope === 'project';
  const members = projectWide ? await collabDirectory(c, ctx) : [];
  return c.json({
    project: { id: ctx.project.id, name: ctx.project.name, ownerId: ctx.project.owner_id },
    role: ctx.role,
    scope: ctx.membership.scope,
    resourceId: ctx.membership.resourceId,
    capabilities: capabilitiesFor(ctx.role),
    members: members.map((m) => ({ userId: m.userId, handle: m.handle, role: m.role, displayName: m.displayName })),
    // NOT AN EMPTY LIST PRESENTED AS A LIST. `members: []` alone reads as "nobody else is here",
    // which is a failure to observe rendering as an observation. The flag says which it is.
    directoryWithheld: !projectWide,
  });
});

app.get('/api/shared/:id/ws', async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') return c.json({ error: 'expected websocket' }, 426);
  // `read` opens the socket; every WRITE the socket attempts is gated again inside the Durable
  // Object against the role sent below. Opening at `chat` instead would mean a viewer could not
  // watch a build at all, which is most of what being a viewer is for.
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read', CHAT_SURFACE);
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
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
  // The transcript IS the chat surface: this is the one route a chat-scoped link exists to open.
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read', CHAT_SURFACE);
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
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
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const url = new URL(c.req.url);
  return gate.ctx.stub.fetch(`https://do/checkpoints?${url.searchParams}`);
});

app.get('/api/shared/:id/members', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;

  // A FILTER THIS ROUTE CANNOT READ IS A 400, NEVER AN IGNORED FILTER. `?status=revokd` answered
  // with the live list reads as "nobody is revoked" — see membership.ts.
  const query = parseRosterQuery(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
  if (query.ok !== true) return c.json({ error: query.error }, 400);

  // The dead rows are administrative. A commenter asking for the revoked list is asking to audit
  // their colleagues, and narrowing their request silently would answer a question they did not
  // ask with a list that looks like the answer.
  if (query.status !== 'active' && !can(ctx.role, 'manage_members')) {
    return c.json({ error: 'forbidden', detail: 'status_filter_needs_manage_members' }, 403);
  }

  const { roster, complete } = await collabRoster(c, ctx);
  const page = filterRoster(roster, query);
  return c.json({
    members: page.entries,
    total: page.total,
    matched: page.matched,
    more: page.more,
    limit: page.limit,
    offset: page.offset,
    filters: { q: query.q, role: query.role, status: query.status, origin: query.origin },
    // The link-derived grants could not all be read. Said out loud so a short list is never
    // mistaken for a complete one.
    partial: !complete,
    ...(complete ? {} : { incomplete: ['link_grants'] }),
  });
});

/**
 * THE MEMBERSHIP HISTORY — what was done to whom, by whom, and when.
 *
 * `POST /members` merges onto the primary key, so a role change overwrites the row and the
 * previous role is gone. This is the only place that remembers it.
 *
 * TWO STORES, ONE LIST. Postgres holds what admins did; the acceptance of a share link is on the
 * grant in KV, because a stranger redeeming a link is not yet a member of anything and an insert
 * policy that let them write their own acceptance would let anybody write any line into any
 * project's history. Both are merged here, each entry saying which store it came from — and when
 * KV cannot be read the answer says `partial`, rather than showing a history with a hole in it.
 */
app.get('/api/shared/:id/members/events', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  const url = new URL(c.req.url);
  const subject = url.searchParams.get('userId');
  if (subject !== null && !UUID_RE.test(subject)) return c.json({ error: 'bad_user' }, 400);

  // The same division the RLS policies make: administrators read the project's history, and
  // everybody may read their own. A member asking about somebody else is refused here rather than
  // handed an empty list, which would read as "nothing ever happened to them".
  const mayAudit = can(ctx.role, 'manage_members');
  if (!mayAudit && subject !== ctx.user.userId) {
    return c.json({ error: 'forbidden', detail: 'history_of_another_member_needs_manage_members' }, 403);
  }
  const limitParam = url.searchParams.get('limit');
  if (limitParam !== null && !/^[1-9][0-9]{0,2}$/.test(limitParam)) return c.json({ error: 'bad_limit' }, 400);
  const limit = Math.min(200, Number(limitParam ?? 100));

  const filter = subject === null ? '' : `&subject_id=eq.${encodeURIComponent(subject)}`;
  const { ok, data } = await supaRest<Record<string, unknown>[]>(
    c.env,
    ctx.user.jwt,
    `/membership_events?project_id=eq.${encodeURIComponent(ctx.project.id)}${filter}&order=created_at.desc&limit=${limit}`,
  );
  if (!ok) return c.json({ error: 'history_unavailable' }, 502);

  const events = (Array.isArray(data) ? data : []).map((r) => ({
    kind: String(r.kind ?? ''),
    subjectId: r.subject_id === null || r.subject_id === undefined ? null : String(r.subject_id),
    actorId: r.actor_id === null || r.actor_id === undefined ? null : String(r.actor_id),
    fromRole: r.from_role === null || r.from_role === undefined ? null : String(r.from_role),
    toRole: r.to_role === null || r.to_role === undefined ? null : String(r.to_role),
    reason: r.reason === null || r.reason === undefined ? null : String(r.reason),
    viaToken: null as string | null,
    at: r.created_at === null || r.created_at === undefined ? null : String(r.created_at),
    source: 'history' as 'history' | 'grant',
  }));

  // The acceptances. A token is never echoed back — knowing that someone came in through a link is
  // the audit fact; the secret itself is not, and a history view is a place people paste from.
  let complete = true;
  const accepted: typeof events = [];
  if (subject === null) {
    const links = await listKvGrants(c.env, ctx.project.id);
    complete = links.complete;
    for (const g of links.grants) {
      if (typeof g.accepted_at !== 'string') continue;
      accepted.push({
        kind: 'link_accepted',
        subjectId: g.user_id,
        actorId: g.user_id,
        fromRole: null,
        toRole: g.role,
        reason: null,
        viaToken: null,
        at: g.accepted_at,
        source: 'grant',
      });
    }
  } else {
    const g = await readKvGrant(c.env, ctx.project.id, subject);
    if (g && typeof g.accepted_at === 'string') {
      accepted.push({
        kind: 'link_accepted',
        subjectId: subject,
        actorId: subject,
        fromRole: null,
        toRole: g.role,
        reason: null,
        viaToken: null,
        at: g.accepted_at,
        source: 'grant',
      });
    }
  }

  const merged = [...events, ...accepted].sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''));
  return c.json({
    events: merged.slice(0, limit),
    scope: subject === null ? 'project' : 'member',
    partial: !complete,
    ...(complete ? {} : { incomplete: ['link_grants'] }),
  });
});

/**
 * WHAT REMOVING THIS PERSON WOULD DO — before it is done.
 *
 * The removal route answers `{ok, userId, revoked}`, which is a fine answer to "did it work" and
 * no answer at all to "what am I about to do". The typed-name ceremony the dashboard uses for a
 * project deletion (apps/web/src/lib/confirm-model.ts) exists because an irreversible act deserves
 * an enumeration of what it costs; a member removal had none.
 *
 * NOTHING HERE WRITES. The counts come from the collaboration store, the standing from the roster,
 * and both are reads.
 */
app.get('/api/shared/:id/members/:userId/impact', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  const userId = c.req.param('userId') ?? '';
  if (!UUID_RE.test(userId)) return c.json({ error: 'bad_user' }, 400);

  const { roster, complete } = await collabRoster(c, ctx);
  const member = roster.find((m) => m.userId === userId) ?? null;
  const res = await collabCall(ctx.stub, 'GET', '/collab/members/footprint', { userId }, ctx);
  const footprint = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  return c.json({
    userId,
    // Null means "no membership row and no link grant" — the honest answer for someone who was
    // never here, and different from a member with nothing to their name.
    member,
    footprint: res.ok ? footprint : null,
    footprintAvailable: res.ok,
    // What the removal itself does, stated rather than implied by the numbers above.
    effects: {
      accessEndsImmediately: member !== null,
      linkGrantRevoked: member?.origin === 'link',
      reRedemptionBarred: member?.origin === 'link',
      ownershipUnchanged: true,
      historyRetained: true,
    },
    partial: !complete,
    ...(complete ? {} : { incomplete: ['link_grants'] }),
  });
});

app.post('/api/shared/:id/members', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
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

  // THE SAME REFUSAL `planBulkInvite` MAKES (membership.ts, 'bad_expiry'), because the two routes
  // write the same column. `classifyGrant` treats an expires_at it cannot parse as DEAD, so a
  // pass-through here accepted `expiresAt: 'next tuesday'` with a 201 and wrote a member who could
  // never open the project and whom the roster then reports as 'expired'. An invitation that was
  // never going to work must be refused, not stored. Absent, null and empty all mean "no expiry" —
  // the empty string is what an untouched date input sends, and it was being written verbatim.
  let expiresAt: string | null = null;
  const rawExpiry = body?.expiresAt;
  if (rawExpiry !== undefined && rawExpiry !== null && rawExpiry !== '') {
    if (typeof rawExpiry !== 'string' || !Number.isFinite(Date.parse(rawExpiry))) {
      return c.json({ error: 'bad_expiry' }, 400);
    }
    expiresAt = rawExpiry;
  }

  // READ BEFORE WRITE. The insert merges onto (project_id, user_id), so the row this lands on is
  // gone the moment it succeeds — and with it the only evidence of what this request actually did.
  // `invited`, `role_changed`, `renewed` and `reactivated` are all this one route.
  const before = await membershipRow(c, ctx, userId);

  const { ok, status } = await supaRest(c.env, ctx.user.jwt, '/project_members', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify({
      project_id: ctx.project.id,
      user_id: userId,
      role,
      invited_by: ctx.user.userId,
      expires_at: expiresAt,
      revoked_at: null,
      // An explicit invitation says "this person is a member, at this role, from now". Leaving a
      // suspension in place under it would produce a member the roster calls suspended and the
      // history calls reactivated — two answers to one question.
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null,
    }),
  });
  if (!ok) return c.json({ error: 'invite_failed', status }, 502);

  const kind = inviteEventKind(before, { role });
  // A DEMOTION MUST REACH THE TAB, not wait for a reload. See `pushAccessChange`.
  const live = await pushAccessChange(ctx.stub, userId, role);
  const audit = await recordMembershipEvents(c, ctx, [
    { kind, subjectId: userId, fromRole: before?.role ?? null, toRole: role },
  ]);
  // The project's OWNER is told, not the invitee. Who can reach a place is the owner's business,
  // and the audit row that already recorded it has never been visible to them. The invitee finds
  // out by the project appearing in their list, which is the arrival they actually care about.
  securityNotice(
    c,
    ctx.project.owner_id,
    `member:${ctx.project.id}:${userId}`,
    `Someone was given access to ${ctx.project.name}`,
    `A member was ${before ? 'changed to' : 'added as'} ${role}.`,
  );
  return c.json({ ok: true, userId, role, event: kind, audited: audit.ok, liveSockets: live }, 201);
});

/**
 * MANY INVITATIONS, ONE REQUEST — and a per-row answer for every one of them.
 *
 * The single-invite route takes one `userId` and answers 201 or a status. A class of twenty
 * playtesters through that route is twenty requests, and the first bad row stops the person
 * halfway with no way to tell which ones already landed.
 *
 * REFUSED WHOLE, NEVER TRUNCATED, AND VALIDATED BEFORE ANYTHING IS WRITTEN. `planBulkInvite` is
 * pure and tested directly; this route writes what it accepted and reports what it refused, by
 * index, with the reason. The insert is ONE PostgREST call, so it is one transaction: either every
 * accepted row is there or none is, and `applied` says which.
 */
app.post('/api/shared/:id/members/bulk', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  const body = await c.req.json().catch(() => null);
  const plan = planBulkInvite(body, { ownerId: ctx.project.owner_id, actorId: ctx.user.userId });
  if (plan.ok !== true) return c.json({ error: plan.error, max: BULK_INVITE_MAX }, 400);
  if (plan.accepted.length === 0) {
    return c.json({ applied: false, invited: [], rejected: plan.rejected, audited: false, counts: { invited: 0, rejected: plan.rejected.length } }, 400);
  }

  const before = new Map<string, MemberRow | null>();
  for (const row of plan.accepted) before.set(row.userId, await membershipRow(c, ctx, row.userId));
  // Every accepted row is a role change for somebody, and a bulk demotion must reach their tabs by
  // the same route a single one does — see `pushAccessChange`. Applied after the insert below.

  const { ok, status } = await supaRest(c.env, ctx.user.jwt, '/project_members', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify(
      plan.accepted.map((row) => ({
        project_id: ctx.project.id,
        user_id: row.userId,
        role: row.role,
        invited_by: ctx.user.userId,
        expires_at: row.expiresAt,
        revoked_at: null,
        suspended_at: null,
        suspended_reason: null,
        suspended_by: null,
      })),
    ),
  });

  // The demotions in this batch reach the open tabs, one push each, for the reason a single
  // invite does. Only when the insert landed: pushing a role nobody was actually given would be
  // the claim outliving the fact in the other direction.
  let liveSockets = 0;
  if (ok) {
    for (const row of plan.accepted) {
      const live = await pushAccessChange(ctx.stub, row.userId, row.role);
      liveSockets += live?.matched ?? 0;
    }
  }

  const invited = plan.accepted.map((row) => ({
    userId: row.userId,
    role: row.role,
    expiresAt: row.expiresAt,
    ok,
    event: inviteEventKind(before.get(row.userId) ?? null, { role: row.role }),
  }));
  const audit = ok
    ? await recordMembershipEvents(
        c,
        ctx,
        invited.map((row) => ({
          kind: row.event,
          subjectId: row.userId,
          fromRole: before.get(row.userId)?.role ?? null,
          toRole: row.role,
        })),
      )
    : { ok: false, written: 0, requested: 0 };

  return c.json(
    {
      applied: ok,
      ...(ok ? {} : { error: 'invite_failed', status }),
      invited,
      rejected: plan.rejected,
      audited: audit.ok,
      liveSockets,
      counts: { invited: ok ? invited.length : 0, rejected: plan.rejected.length },
    },
    ok ? 201 : 502,
  );
});

app.delete('/api/shared/:id/members/:userId', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  const userId = c.req.param('userId') ?? '';
  if (!UUID_RE.test(userId)) return c.json({ error: 'bad_user' }, 400);
  // Ownership is the `projects.owner_id` column; no membership write has ever been able to move
  // it, and a PATCH that matches no row would have answered `revoked: true` to a request that
  // revoked nothing.
  if (userId === ctx.project.owner_id) return c.json({ error: 'owner_is_not_a_member' }, 400);

  const at = new Date().toISOString();
  const before = await membershipRow(c, ctx, userId);
  // Revoked, not deleted: "this access ended" is a fact worth keeping, and a deleted row cannot
  // tell an audit reader that someone ever had access at all.
  const { ok } = await supaRest(
    c.env,
    ctx.user.jwt,
    `/project_members?project_id=eq.${encodeURIComponent(ctx.project.id)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: JSON.stringify({ revoked_at: at }) },
  );
  if (!ok) return c.json({ error: 'revoke_failed' }, 502);

  //[[ BOTH STORES, OR THE REMOVAL IS A SUGGESTION.
  //
  //   Access is resolved from TWO sources — `getProjectAccess` merges the Postgres rows with the
  //   grants a redeemed share link minted in KV — and this route used to PATCH one of them. A
  //   member who came in through a link was "revoked" by a route that never touched their grant,
  //   and kept every capability they had. The test beside it asserted the intended division of
  //   labour in a comment — "that is a membership revocation, and the route above does it" — about
  //   a route that did not do it.
  //
  //   `removed: true` is the second half: the same link, presented again, must not undo an
  //   administrator's decision. Re-admission is an explicit act — an invitation, or the reactivate
  //   route below — not a second click on a URL the person still has in their inbox. ]]
  const linkGrantRevoked = await revokeKvGrant(c.env, ctx.project.id, userId, { at, by: ctx.user.userId, removed: true });

  // The open tab is closed here, not left holding the capabilities it had at handshake.
  const live = await pushAccessChange(ctx.stub, userId, null);

  //[[ AND THE STANDING ACTORS THEY LEFT BEHIND.
  //
  //   A removed member's automations already cannot FIRE — `authorizeFire` re-asks about the
  //   owner's access on every attempt and refuses. But nothing switched them off, so they stayed
  //   listed as running, failing silently at every attempt, forever. Removing somebody has to have
  //   a visible effect on the thing they left pointed at the project, or the administrator who
  //   removed them cannot tell that it was dealt with. `-1` means the store could not be read —
  //   see stopAutomationsFor: "none to stop" and "could not look" are not the same answer. ]]
  const automationsStopped = await stopAutomationsFor(c.env, userId, ctx.project.id);

  const audit = await recordMembershipEvents(c, ctx, [
    { kind: 'removed', subjectId: userId, fromRole: before?.role ?? null, reason: c.req.query('reason') ?? null },
  ]);
  securityNotice(
    c,
    ctx.project.owner_id,
    `member:${ctx.project.id}:${userId}`,
    `Someone lost access to ${ctx.project.name}`,
    `A ${before?.role ?? 'member'} was removed from the project.`,
  );
  return c.json({ ok: true, userId, revoked: true, linkGrantRevoked, automationsStopped, audited: audit.ok, liveSockets: live });
});

/**
 * SUSPENSION — a membership paused rather than ended.
 *
 * Revocation was the only lever this product had, and it is the wrong one for "stop, while we talk
 * about it": the row keeps `revoked_at`, the person is indistinguishable from someone who was
 * thrown out, and putting them back is the same act as inviting a stranger. A suspended grant is
 * DEAD WHILE IT LASTS — `classifyGrant` returns no grant for it, so the door, the directory and
 * the roster all close at once — and it carries the reason, the actor and the instant.
 *
 * It suspends in BOTH STORES for the reason the removal route does: a guest's grant lives in KV,
 * and `classifyGrant` reads `suspended_at` off that record by exactly the same rule.
 */
app.post('/api/shared/:id/members/:userId/suspend', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  const userId = c.req.param('userId') ?? '';
  if (!UUID_RE.test(userId)) return c.json({ error: 'bad_user' }, 400);
  // The owner's access is the projects row; there is no grant to pause, and a route that answered
  // `suspended: true` would be describing something that did not happen.
  if (userId === ctx.project.owner_id) return c.json({ error: 'owner_cannot_be_suspended' }, 400);

  const body = (await c.req.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, EVENT_REASON_MAX) : '';
  const at = new Date().toISOString();

  const before = await membershipRow(c, ctx, userId);
  const grant = await readKvGrant(c.env, ctx.project.id, userId);
  // NOTHING TO SUSPEND IS A 404, NOT AN `ok: true`. A PATCH that matches no row succeeds, and the
  // cheerful answer over it would tell an admin they had paused somebody who was never here.
  if (before === null && grant === null) return c.json({ error: 'not_a_member' }, 404);

  let ok = true;
  if (before !== null) {
    const patched = await supaRest(
      c.env,
      ctx.user.jwt,
      `/project_members?project_id=eq.${encodeURIComponent(ctx.project.id)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ suspended_at: at, suspended_reason: reason.length === 0 ? null : reason, suspended_by: ctx.user.userId }),
      },
    );
    ok = patched.ok;
  }
  if (!ok) return c.json({ error: 'suspend_failed' }, 502);
  const linkGrantSuspended =
    grant === null
      ? false
      : await patchKvGrant(c.env, ctx.project.id, userId, {
          suspended_at: at,
          suspended_reason: reason.length === 0 ? null : reason,
          suspended_by: ctx.user.userId,
        });

  // A SUSPENDED GRANT IS DEAD WHILE IT LASTS, which is why this closes rather than demotes: there
  // is no role a suspension leaves behind, and `classifyGrant` already refuses the row at the door.
  const live = await pushAccessChange(ctx.stub, userId, null);
  const audit = await recordMembershipEvents(c, ctx, [
    { kind: 'suspended', subjectId: userId, fromRole: before?.role ?? null, reason: reason.length === 0 ? null : reason },
  ]);
  return c.json({ ok: true, userId, suspended: true, at, reason: reason.length === 0 ? null : reason, linkGrantSuspended, audited: audit.ok, liveSockets: live });
});

/**
 * REACTIVATION — the way back, for a suspension and for a removal alike.
 *
 * Until now the only way back was to re-invite, which works (the invite body sets `revoked_at:
 * null`) and records nothing: an audit reader sees an invitation, not a reinstatement, and a guest
 * whose grant lives in KV was not reachable by that route at all.
 *
 * The grant comes back AT THE ROLE IT CARRIED. A reactivation that had to be told a role would be
 * an invitation with a friendlier name, and would quietly let an admin promote somebody while
 * appearing to restore them.
 */
app.post('/api/shared/:id/members/:userId/reactivate', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  const userId = c.req.param('userId') ?? '';
  if (!UUID_RE.test(userId)) return c.json({ error: 'bad_user' }, 400);
  if (userId === ctx.project.owner_id) return c.json({ error: 'owner_is_not_a_member' }, 400);

  const before = await membershipRow(c, ctx, userId);
  const grant = await readKvGrant(c.env, ctx.project.id, userId);
  if (before === null && grant === null) return c.json({ error: 'not_a_member' }, 404);

  let ok = true;
  if (before !== null) {
    const patched = await supaRest(
      c.env,
      ctx.user.jwt,
      `/project_members?project_id=eq.${encodeURIComponent(ctx.project.id)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ revoked_at: null, suspended_at: null, suspended_reason: null, suspended_by: null }),
      },
    );
    ok = patched.ok;
  }
  if (!ok) return c.json({ error: 'reactivate_failed' }, 502);
  // …and the bar a removal put on the link grant is lifted here, by the same administrator
  // capability that set it.
  const linkGrantRestored = grant === null ? false : await restoreKvGrant(c.env, ctx.project.id, userId);

  const role = before?.role ?? grant?.role ?? null;
  const audit = await recordMembershipEvents(c, ctx, [
    { kind: 'reactivated', subjectId: userId, toRole: role, reason: typeof c.req.query('reason') === 'string' ? c.req.query('reason') : null },
  ]);
  return c.json({ ok: true, userId, reactivated: true, role, linkGrantRestored, audited: audit.ok });
});

/**
 * THE LINKS THIS PROJECT HAS HANDED OUT.
 *
 * Revocation has worked from the day it was written and is driven over HTTP — and the token it
 * takes was unrecoverable the instant the mint response scrolled away. `shareLinkKey` is keyed by
 * the secret and `shareGrantPrefix` indexes the redeemed GRANTS, not the links, so there was no
 * way to ask "what links exist on this project": a link already sent to somebody could never be
 * listed and therefore never revoked, by UI or by curl.
 *
 * THE TOKEN COMES BACK, and that is a decision. The token IS the link — an admin who cannot see it
 * cannot re-send it and, before this route, could not revoke it either. It is gated on `share`,
 * which is admin and owner only.
 *
 * `state` is computed by `redeemShareLink` — the function that actually decides — rather than by
 * a second reading of the same columns here, so this list can never call a link live that the
 * door will refuse.
 *
 * `partial` mirrors the roster's flag: KV is a separate store that can be unreachable, and a short
 * list presented as a whole one is how an admin concludes a link was already revoked.
 */
app.get('/api/shared/:id/links', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'share');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const { links, complete } = await listShareLinks(c.env, gate.ctx.project.id);
  const now = Date.now();
  return c.json({
    links: links.map((l) => {
      const probe = redeemShareLink(l, { projectId: l.project_id, scope: l.scope, resourceId: l.resource_id }, now);
      return {
        token: l.token,
        scope: l.scope,
        resourceId: l.resource_id,
        role: l.role,
        expiresAt: l.expires_at,
        revokedAt: l.revoked_at,
        createdBy: l.created_by,
        createdAt: l.created_at,
        state: probe.ok ? 'live' : probe.reason,
      };
    }),
    partial: !complete,
  });
});

app.post('/api/shared/:id/links', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'share');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
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
  return c.json({ token, scope, role, resourceId, expiresAt: link.expires_at, projectId: ctx.project.id }, 201);
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
  // A REMOVAL IS NOT UNDONE BY PRESSING THE LINK AGAIN. Someone an administrator removed still has
  // the URL in their inbox; without this the removal lasted exactly as long as it took them to
  // re-click it, and nothing anywhere would have said so. Re-admission is an explicit act — an
  // invitation, or POST /members/:userId/reactivate.
  if (await kvGrantBarred(c.env, link.project_id, user.userId)) {
    return c.json({ error: 'removed_from_project' }, 403);
  }
  const acceptedAt = new Date().toISOString();
  await putKvGrant(c.env, link.project_id, {
    user_id: user.userId,
    role: out.grant.role,
    // THE SCOPE SURVIVES REDEMPTION. `out.grant` is what `redeemShareLink` decided this link
    // opens, and writing it here is what stops a chat link from becoming an ordinary project
    // membership the instant it is accepted. Taken from the redemption, never from the request
    // body, for the same reason the role is.
    scope: out.grant.scope,
    resource_id: out.grant.resourceId,
    expires_at: link.expires_at,
    revoked_at: null,
    display_name: null,
    invited_by: link.created_by,
    via_token: link.token,
    // THE ACCEPTANCE. An invitation in this product has no acceptance step — POST /members writes
    // a live grant — so this is the only moment anybody actually says yes, and it is recorded
    // where the person saying yes cannot reach it. The membership history merges it in.
    accepted_at: acceptedAt,
  });
  return c.json({ ok: true, projectId: link.project_id, role: out.grant.role, scope: out.grant.scope, resourceId: out.grant.resourceId }, 201);
});

app.post('/api/shared/:id/links/revoke', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'share');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
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
const COLLAB_ROUTES: {
  method: 'GET' | 'POST';
  path: string;
  action: CollabAction;
  needsDirectory?: boolean;
  /** The surface this route touches, from its body. Absent ⇒ project-wide ⇒ no scoped grant. */
  resource?: (body: Record<string, unknown>) => ShareResource | undefined;
}[] = [
  { method: 'GET', path: '/collab/comments', action: 'read', resource: targetResource },
  { method: 'POST', path: '/collab/comments', action: 'comment', needsDirectory: true, resource: targetResource },
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
  // THE BODY IS READ BEFORE THE GATE, because the gate needs it: a comment on a message and a
  // comment on the project are the same route reaching two different surfaces, and a chat-scoped
  // guest may have the first and not the second. Reading it changes nothing — no write happens
  // until the gate says yes.
  const body =
    route.method === 'GET'
      ? (Object.fromEntries(new URL(c.req.url).searchParams.entries()) as Record<string, unknown>)
      : ((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
  const gate = await sharedAccess(c, c.req.param('id') ?? '', route.action, route.resource?.(body));
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  const directory = route.needsDirectory ? await collabDirectory(c, ctx) : undefined;
  const res = await collabCall(ctx.stub, route.method, route.path, body, ctx, directory);
  //[[ THE MENTION AND THE REVIEW REQUEST WERE ALREADY RECORDS. NOW SOMEBODY IS TOLD.
  //
  //   collab-threads.ts calls mentions "notification targets" and refuses one that names a
  //   non-member; do/collab-store.ts writes the rows into `collab_mentions`. Both halves were
  //   right and nothing joined them: the target was recorded and then the named person had to
  //   happen to open that project and look. A review request had the same shape - a first-class
  //   record with a reviewer on it who was never told.
  //
  //   Read from the DO'S RESPONSE rather than re-derived from the request body. The store applied
  //   the policy - a mention of a stranger resolves to nobody, a reviewer who cannot approve is
  //   refused - and notifying from the body would be notifying from the claim rather than from
  //   what was actually written. The response is cloned so the client still gets it whole.
  //
  //   The project id passed here is `ctx.project.id`, which `sharedAccess` has already proven the
  //   recipients belong to: the directory the mentions were resolved against IS that project's
  //   membership. That is the proof obligation `notificationPrefsFor` documents. ]]
  if (res.status === 201 && (route.path === '/collab/comments' || route.path === '/collab/reviews')) {
    const written = (await res
      .clone()
      .json()
      .catch(() => null)) as { id?: unknown; mentions?: { userId?: unknown }[]; reviewers?: unknown[] } | null;
    const targets =
      route.path === '/collab/comments'
        ? (written?.mentions ?? []).map((m) => m?.userId)
        : (written?.reviewers ?? []);
    const kind = route.path === '/collab/comments' ? 'mention' : 'approval_requested';
    const subject = typeof written?.id === 'string' ? written.id : null;
    const inputs = targets
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .map((recipientId) => ({
        kind,
        recipientId,
        actorId: ctx.user.userId,
        projectId: ctx.project.id,
        projectName: ctx.project.name,
        subject,
        title: kind === 'mention' ? `You were mentioned in ${ctx.project.name}` : `A review was requested in ${ctx.project.name}`,
        body: kind === 'mention' ? 'Someone named you in a comment.' : 'Someone asked you to review a change.',
        at: Date.now(),
      }));
    if (inputs.length > 0) c.executionCtx.waitUntil(notifyMany(c.env, inputs).then(() => undefined));
  }
  return res;
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

/**
 * "What may I do here, and why?" — CHECKLIST-V2 §08.12-14.
 *
 * A NON-MEMBER STILL GETS 404, not an honest `member: false`. The pure function can say "you are
 * not a member" because it is called from inside, where the project is already known to exist;
 * answering that over HTTP would confirm the id to a stranger, which is the one thing §08.16 and
 * the rest of this file are careful never to do.
 */
app.get('/api/shared/:id/permissions', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  const ctx = gate.ctx;
  // Only the caller's own rows are consulted. The effective role is already decided — this is the
  // provenance for it, not a second decision.
  const mine = (await listProjectMembers(c.env, ctx.user, ctx.project)).filter((r) => r.user_id === ctx.user.userId);
  return c.json(effectivePermissions(ctx.membership, { now: Date.now(), grants: mine }));
});

app.get('/api/shared/:id/presence', async (c) => {
  const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
  if (gate.ctx === null) return collabRefusal(c, gate.status, gate.detail);
  return gate.ctx.stub.fetch('https://do/collab/presence');
});

// ---------------------------------------------------------------- automations
/*
 * WORK THAT HAPPENS WITHOUT SOMEBODY SITTING THERE — reachable at last.
 *
 * `automations.ts` decided and `automation-store.ts` stored, and for the whole of their existence
 * neither had a caller outside a test. `grep -ni automation src/index.ts` returned nothing: the
 * product had automation policy, automation storage, and no automations. These routes are the
 * request half of that feature — the half where a person with a verified JWT is present, so the
 * question "does this automation's owner still have access to this project" has a real answer.
 *
 * WHAT IS DELIBERATELY NOT HERE: the cron dispatcher. Its every fire must re-authorise against the
 * owner's project access (decision 4 in automations.ts), and every access lookup in this tree goes
 * through PostgREST under the USER's own JWT — `getProjectAccess`, `getOwnedProject`, the lot. A
 * scheduled handler has no user and no token, and this deployment has no service-role credential
 * to ask on the owner's behalf. A dispatcher written anyway would have to pass
 * `ownerHasAccess: true` — an answer it did not obtain, presented as one it did, for the exact
 * decision that keeps a standing actor from outliving its owner's access. That is not a dispatcher
 * with a small gap in it; it is the security property inverted. So it is absent, and its absence is
 * stated rather than papered over with a `crons` trigger that fires something dishonest.
 */

/** The automation as the client sees it: the row, plus the two sentences a person checks it by. */
function automationView(a: StoredAutomation) {
  return {
    ...a,
    // A schedule a person cannot read back is a schedule they cannot check, and the commonest
    // automation bug is the one set for the right time in the wrong zone. The zone is in the words.
    describes: describeSchedule(a),
    //[[ THE DAYLIGHT-SAVING DISCLOSURE IS COPY, NOT A COMMENT.
    //
    //   `zoned-time.ts` makes a deliberate choice about the two mornings a year — a run at a wall
    //   time that does not exist is moved, not skipped; a wall time that happens twice fires once —
    //   and a choice the user cannot see is indistinguishable to them from a bug. Only for `day`
    //   and `week`: an hourly schedule has no wall hour to be moved, so the paragraph would be
    //   describing something that cannot happen to it. Null rather than '' so "nothing to say" and
    //   "said nothing" stay different states. ]]
    dstNote: a.schedule && a.schedule.every !== 'hour' ? dstDisclosure(a.schedule) : null,
  };
}

/**
 * Midnight today, on the automation's own wall clock.
 *
 * The daily cap counts fires "today in its own zone" (see FireContext) — counting them from UTC
 * midnight would reset a Sydney user's allowance in the middle of their working afternoon.
 */
function startOfDayInZone(tz: string, now: number): number {
  const parts = wallPartsAt(tz, now);
  return instantForWall(tz, { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0 }).instant;
}

/**
 * The automation, and the project gate its OWNER passes right now.
 *
 * Two lookups in this order, and the order is the whole argument. `getAutomation` binds `owner_id`,
 * so a caller who gets a row back IS the owner; a collaborator asking about somebody else's
 * standing actor gets null, a 404, and no confirmation that it exists. That is what makes the
 * second lookup an answer about the OWNER's access rather than the caller's — they are the same
 * person, established rather than assumed.
 *
 * `ctx === null` with a non-null automation means exactly one thing: the owner has lost access to
 * the project since. The callers distinguish it, because "your automation is gone" and "your
 * automation can no longer reach that project" need different next steps from the person.
 */
async function automationGate(
  // The SAME structural parameter `withOwnedProject` takes, not a full `Context`. Spelling a
  // `Context<{ Variables: { user } }>` here declared a narrower Variables map than the app's own
  // `Vars`, so every call site failed to typecheck (TS2345, three of them) while the routes
  // themselves were correct — a signature that described a Hono app this tree does not have.
  c: { env: Env; get: (k: 'user') => AuthedUser },
  id: string,
  action: CollabAction,
): Promise<{ automation: StoredAutomation; ctx: Awaited<ReturnType<typeof withOwnedProject>> } | null> {
  const user = c.get('user');
  await ensureAutomationTables(c.env);
  const automation = await getAutomation(c.env, user.userId, id);
  if (!automation) return null;
  return { automation, ctx: await withOwnedProject(c, automation.projectId, action) };
}

/** Is a run already in flight on this project? `null` means the question could not be answered. */
async function projectRunInFlight(stub: { fetch: (url: string) => Promise<Response> }): Promise<boolean | null> {
  try {
    const res = await stub.fetch('https://do/info');
    if (!res.ok) return null;
    const body = (await res.json()) as { agentStatus?: unknown };
    if (typeof body?.agentStatus !== 'string') return null;
    return body.agentStatus !== 'idle';
  } catch {
    // A FAILURE TO OBSERVE MUST NOT RENDER AS AN OBSERVATION. Returning `false` here would be this
    // route inventing the single fact that decides whether a second build starts on a busy project.
    return null;
  }
}

/** The service-wide stop. `null` means the question could not be answered. */
async function killSwitchOn(env: Env): Promise<boolean | null> {
  try {
    const state = (await budgetState(env)) as { killed?: unknown };
    return typeof state?.killed === 'boolean' ? state.killed : null;
  } catch {
    return null;
  }
}

/**
 * Start the claimed fire, and close its record with what actually happened.
 *
 * Run under `waitUntil` rather than awaited: `/agent-run` returns when the BUILD returns, which is
 * minutes, and an HTTP request held open for a build is a request that times out and leaves a fire
 * claimed with no outcome. The caller gets the execution id instead and follows it in the history.
 */
async function runAutomationFire(
  env: Env,
  a: StoredAutomation,
  projectName: string,
  stub: { fetch: (url: string, init?: RequestInit) => Promise<Response> },
  executionId: string,
): Promise<void> {
  let outcome: 'ok' | 'busy' | 'failed' | 'error' = 'error';
  let error: string | null = null;
  try {
    const res = await stub.fetch('https://do/agent-run', {
      method: 'POST',
      body: JSON.stringify({ text: a.prompt, mode: a.mode }),
    });
    const body = (await res.json().catch(() => null)) as { started?: unknown; error?: unknown } | null;
    if (res.ok && body?.started === true) outcome = 'ok';
    else if (res.status === 409) outcome = 'busy';
    else outcome = 'failed';
    if (outcome !== 'ok') error = typeof body?.error === 'string' ? body.error : `session answered ${res.status}`;
  } catch (err) {
    outcome = 'error';
    error = String((err as Error)?.message ?? err);
  }
  //[[ THE CREDITS COLUMN IS LEFT NULL, AND THAT IS THE HONEST VALUE.
  //
  //   The run is billed inside the session, against the owner's quota, after this fetch returns.
  //   This layer never learns the number. `automationSpend` counts a null-cost run as `unreadable`
  //   rather than as zero for exactly this case — writing 0 here would make a spending report
  //   understate by the whole cost of every automated build. ]]
  await finishFire(env, executionId, { outcome, now: Date.now(), error });
  if (outcome === 'ok') return;
  //[[ THE SUBJECT IS THE EXECUTION, NOT THE AUTOMATION.
  //
  //   `notifications.ts` dedupes by subject. An automation-id subject would collapse every night's
  //   failure into the one line the owner already read and dismissed, and the second failure — the
  //   one that means it is not a blip — would never be delivered at all. ]]
  await notify(env, {
    kind: 'automation_failed',
    recipientId: a.ownerId,
    projectId: a.projectId,
    projectName,
    subject: executionId,
    title: `"${a.name}" did not run in ${projectName}`,
    body: error ?? 'The run could not be started.',
    at: Date.now(),
  });
}

app.get('/api/projects/:id/automations', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id') ?? '', 'read');
  if (!ctx) return c.json({ error: 'not found' }, 404);
  await ensureAutomationTables(c.env);
  const rows = await listAutomations(c.env, ctx.user.userId, { projectId: ctx.project.id });
  return c.json({ automations: rows.map(automationView) });
});

app.post('/api/projects/:id/automations', async (c) => {
  // `'build'` rather than `'read'`: an automation is a standing instruction to spend Credits on
  // this project, so the capability it needs is the capability to start a build.
  const ctx = await withOwnedProject(c, c.req.param('id') ?? '', 'build');
  if (!ctx) return c.json({ error: 'not found' }, 404);
  await ensureAutomationTables(c.env);
  const body = (await c.req.json().catch(() => ({}))) as AutomationInput;
  const now = Date.now();
  const result = normaliseAutomation(body, { ownerId: ctx.user.userId, projectId: ctx.project.id, now });
  // The reason travels, because the client has to put the message on the field that caused it. The
  // server REFUSES an over-long name rather than trimming one, so a client that trimmed first would
  // be silently storing a different name than the person typed.
  if (!result.ok) return c.json({ error: result.reason }, 400);
  const saved = await saveAutomation(c.env, result.automation, nextFireAfter(result.automation, now).at);
  if (!saved.ok) return c.json({ error: saved.reason }, saved.reason === 'too_many' ? 409 : 500);
  void count(c.env, 'automation_created');
  return c.json({ automation: automationView(saved.automation) }, 201);
});

app.patch('/api/automations/:id', async (c) => {
  const gate = await automationGate(c, c.req.param('id') ?? '', 'build');
  if (!gate || !gate.ctx) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as AutomationInput;
  const now = Date.now();
  // Re-normalised whole, with the identity preserved: an edit that minted a new id would be a
  // create wearing an edit's clothes, and would orphan the run history keyed to the old one.
  const result = normaliseAutomation(body, {
    ownerId: gate.automation.ownerId,
    projectId: gate.automation.projectId,
    now,
    id: gate.automation.id,
    createdAt: gate.automation.createdAt,
  });
  if (!result.ok) return c.json({ error: result.reason }, 400);
  const saved = await saveAutomation(c.env, result.automation, nextFireAfter(result.automation, now).at);
  if (!saved.ok) return c.json({ error: saved.reason }, 409);
  return c.json({ automation: automationView(saved.automation) });
});

app.delete('/api/automations/:id', async (c) => {
  const user = c.get('user');
  await ensureAutomationTables(c.env);
  // No project gate: deleting your own standing actor must keep working on the day you lost access
  // to the project it pointed at. That is precisely when you most want it gone.
  const gone = await deleteAutomation(c.env, user.userId, c.req.param('id') ?? '');
  return gone ? c.json({ ok: true, deleted: true }) : c.json({ error: 'not found' }, 404);
});

/**
 * Pause or resume.
 *
 * A dedicated single-column write, and no project gate, for the reason automation-store.ts argues:
 * the automation somebody urgently needs to stop is the one this version of the code may not be
 * able to parse, or the one on a project they have just been removed from. A full save round trip
 * would fail on the first and a gate would refuse the second.
 */
app.post('/api/automations/:id/enabled', async (c) => {
  const user = c.get('user');
  await ensureAutomationTables(c.env);
  const body = (await c.req.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== 'boolean') return c.json({ error: 'bad_enabled' }, 400);
  const ok = await setAutomationEnabled(c.env, user.userId, c.req.param('id') ?? '', body.enabled, Date.now());
  if (!ok) return c.json({ error: 'not found' }, 404);
  // The state is returned from the write's own outcome rather than echoed from the request, so a
  // toggle that did nothing cannot render as a toggle that worked.
  return c.json({ ok: true, enabled: body.enabled });
});

/**
 * Fire it now.
 *
 * Every decision below is read from `automations.ts`; nothing here re-decides any of them, and
 * every input it feeds them is an observation rather than a default. The two it cannot always
 * obtain — is the project busy, is spending switched off — are refused out loud when unreadable.
 */
app.post('/api/automations/:id/run', async (c) => {
  const gate = await automationGate(c, c.req.param('id') ?? '', 'build');
  if (!gate) return c.json({ error: 'not found' }, 404);
  const a = gate.automation;
  //[[ EVERY FIRE IS RE-AUTHORISED, and `ownerHasAccess` is what the gate just established rather
  //   than anything the row carries. The automation was created with access its owner may since
  //   have lost; that is the whole hazard of a standing actor. ]]
  const auth = authorizeFire(a, { projectId: a.projectId, ownerHasAccess: gate.ctx !== null });
  if (!auth.ok) return c.json({ error: auth.reason }, 403);
  const ctx = gate.ctx;
  if (!ctx) return c.json({ error: 'owner_lost_access' }, 403); // unreachable; narrows the type

  const inFlight = await projectRunInFlight(ctx.stub);
  if (inFlight === null) return c.json({ error: 'run_state_unreadable' }, 503);
  const killed = await killSwitchOn(c.env);
  if (killed === null) return c.json({ error: 'kill_switch_unreadable' }, 503);

  const now = Date.now();
  const runsToday = await firesSince(c.env, a.id, startOfDayInZone(a.timezone, now));
  const verdict = startVerdict(a, { inFlight, runsToday, authorized: true, killed });
  // `requeue` travels so the client can say "it will be retried" rather than "it was dropped" —
  // the two are different facts and the automation's own overlap policy decides which one it is.
  if (!verdict.start) return c.json({ error: verdict.reason, requeue: verdict.requeue }, 409);

  //[[ CLAIMED BEFORE STARTED. The unique `fire_key` is only protection while the claim sits on the
  //   near side of the spend — a claim taken afterwards arbitrates a race whose bill is already
  //   paid. `dueAt` is null because a manual fire was never due; it happened when somebody asked.
  //
  //   `manualFireKey`, NOT `fireKey(a.id, now)`. The scheduled key is the due instant on purpose,
  //   so two dispatchers waking in one minute compute one key. A press has no due instant, and
  //   keying it by the clock made the millisecond the identity: two presses inside one were
  //   answered `already_fired` — a fire that never started, reported as one that already had. ]]
  const claim = await claimFire(c.env, a, manualFireKey(a.id, crypto.randomUUID()), { dueAt: null, now });
  if (!claim.claimed) return c.json({ error: claim.reason }, 409);

  c.executionCtx.waitUntil(runAutomationFire(c.env, a, ctx.project.name, ctx.stub, claim.executionId));
  void count(c.env, 'automation_fired');
  return c.json({ ok: true, executionId: claim.executionId }, 202);
});

app.get('/api/automations/:id/runs', async (c) => {
  const user = c.get('user');
  await ensureAutomationTables(c.env);
  const id = c.req.param('id') ?? '';
  // Owner-bound at the store, so no project gate is needed and none is wanted: the history of what
  // an automation spent must stay readable to the person it spent it on after the project is gone.
  if (!(await getAutomation(c.env, user.userId, id))) return c.json({ error: 'not found' }, 404);
  const limit = Number(c.req.query('limit') ?? 25);
  return c.json({ runs: await listExecutions(c.env, user.userId, id, limit) });
});

app.get('/api/automations/:id/spend', async (c) => {
  const user = c.get('user');
  await ensureAutomationTables(c.env);
  const id = c.req.param('id') ?? '';
  if (!(await getAutomation(c.env, user.userId, id))) return c.json({ error: 'not found' }, 404);
  const days = Math.min(90, Math.max(1, Number(c.req.query('days') ?? 30) || 30));
  return c.json(await automationSpend(c.env, user.userId, id, Date.now() - days * 86_400_000));
});

/**
 * Hand it to somebody else.
 *
 * The new owner's access is resolved here, from the project's live member directory, because
 * `transferAutomation` refuses to take the caller's word for it. Transferring to somebody who
 * cannot open the project would create an automation that can never fire — a worse outcome than
 * refusing, because it looks like it worked.
 */
app.post('/api/automations/:id/transfer', async (c) => {
  const gate = await automationGate(c, c.req.param('id') ?? '', 'manage_members');
  if (!gate || !gate.ctx) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { toUserId?: unknown };
  const toUserId = typeof body.toUserId === 'string' ? body.toUserId : '';
  if (!UUID_RE.test(toUserId)) return c.json({ error: 'bad_user' }, 400);
  const rows = await listProjectMembers(c.env, gate.ctx.user, gate.ctx.project);
  // The live directory: the owner plus every grant that is not expired, revoked or suspended.
  const directory = memberDirectory(gate.ctx.project, rows, null);
  const newOwnerHasAccess = directory.some((m) => m.userId === toUserId);
  const res = await transferAutomation(c.env, gate.ctx.user.userId, gate.automation.id, toUserId, {
    newOwnerHasAccess,
    now: Date.now(),
  });
  if (res.ok) return c.json({ ok: true, ownerId: toUserId });
  return c.json({ error: res.reason }, res.reason === 'no_access' ? 403 : res.reason === 'same_owner' ? 400 : 404);
});

/**
 * Switch off every standing actor a departing member pointed at this project.
 *
 * REFUSAL AT FIRE AND DISABLEMENT ARE TWO DIFFERENT BEHAVIOURS and this product needs both.
 * `authorizeFire` refuses, which keeps the automation from running; without this it would also
 * stay listed as ON forever, failing silently at every attempt, and the person who removed the
 * member would have no way to see that the standing actor had been dealt with.
 *
 * Best-effort by construction: `setAutomationEnabled` writes one column, so a row this version
 * cannot parse is still switched off, and a D1 that is unavailable does not fail the revocation
 * itself — the revocation is the security act and it has already landed.
 */
async function stopAutomationsFor(env: Env, userId: string, projectId: string): Promise<number> {
  try {
    await ensureAutomationTables(env);
    const rows = await listAutomations(env, userId, { projectId });
    const now = Date.now();
    let stopped = 0;
    for (const a of rows) {
      if (!a.enabled) continue;
      if (await setAutomationEnabled(env, userId, a.id, false, now)) stopped += 1;
    }
    return stopped;
  } catch (err) {
    console.warn(`[automations] could not stop ${userId}'s automations on ${projectId}: ${String((err as Error)?.message ?? err)}`);
    // -1, NOT 0. "None to stop" and "could not look" are different answers, and a caller that read
    // a zero here would report "nothing was left running" having never looked.
    return -1;
  }
}

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
