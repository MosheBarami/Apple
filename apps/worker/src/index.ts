// Golem worker entry: API routes + static serving + DO exports.
import { Hono } from 'hono';
import { verifyStripeSignature, interpretStripeEvent, entitlementFor } from './billing';
import { exportFilename, renderTranscriptMarkdown, type TranscriptExport } from './export';
import type { Env, AuthedUser } from './env';
import { verifyJwt, bearerToken } from './auth';
import { getOwnedProject, getProfile } from './supa';
import { chat as llmChat, embed, getModels, budgetReport, budgetState, setKillSwitch, rawProbe, BudgetError } from './gateway';
import { capabilityTable, providerHealth, selectProvider } from './providers';
import { searchDocs } from './rag';
import { serveStatic, ensureStaticTables } from './static';
import { critiqueViews } from './vision';
import { roadmapForProject, executionBrief, polishRoadmap, publicShape, type StudioProbe, type RoadmapChat } from './roadmap';
import { refuseLuauIngress } from './tools';
import { ensureProvenanceTables, exportProjectAttribution } from './provenance';
import type { RenderViewResult, OpResult, StudioOp } from '@golem/shared';

export { SessionDO } from './do/session';
export { QuotaDO } from './do/quota';
export { PairingDO } from './do/pairing';
export { AdminDO } from './do/admin';
export { BudgetDO } from './do/budget';

type Vars = { user: AuthedUser };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

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
const ipHits = new Map<string, { n: number; at: number }>();
function ipLimited(ip: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  if (ipHits.size > 5000) ipHits.clear(); // bound memory under a distributed flood
  const rec = ipHits.get(ip);
  if (!rec || now - rec.at > windowMs) {
    ipHits.set(ip, { n: 1, at: now });
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
  if (!c.env.ADMIN_KEY || !key || !secretEquals(key, c.env.ADMIN_KEY)) {
    const adminIp = c.req.header('CF-Connecting-IP') ?? 'unknown';
    if (ipLimited(`admin-fail:${adminIp}`, 120)) {
      return c.json({ error: 'Too many requests — slow down.' }, 429);
    }
    return c.json({ error: 'forbidden' }, 403);
  }
  return next();
});

// ---------------------------------------------------------------- public
app.get('/api/health', async (c) => {
  return c.json({ ok: true, version: VERSION, time: new Date().toISOString() });
});

// ---------------------------------------------------------------- project session routes
async function withOwnedProject(c: { env: Env; get: (k: 'user') => AuthedUser }, projectId: string) {
  const user = c.get('user');
  if (!UUID_RE.test(projectId)) return null;
  const project = await getOwnedProject(c.env, user.jwt, projectId);
  if (!project) return null;
  // address the DO by the canonical row id so casing/encoding variants cannot fan out DOs
  const stub = sessionStub(c.env, project.id);
  const init = await stub.fetch('https://do/init', {
    method: 'POST',
    body: JSON.stringify({ projectId: project.id, projectName: project.name, ownerId: user.userId }),
  });
  if (!init.ok) return null; // owner mismatch on a recycled id — refuse
  return { user, project, stub };
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
    await quota.fetch('https://do/set-plan', { method: 'POST', body: JSON.stringify({ plan }) });
  }
  if (outcome.creditsDelta) {
    await quota.fetch('https://do/grant-credits', { method: 'POST', body: JSON.stringify({ credits: outcome.creditsDelta }) });
  }
  return c.json({ ok: true, applied: { plan: !!outcome.subscription, credits: outcome.creditsDelta ?? 0 } });
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
    const hits = await searchDocs(c.env, q, 6);
    return c.json({ hits });
  } catch (e) {
    if (e instanceof BudgetError) return c.json({ error: e.message, hits: [] }, 429);
    throw e;
  }
});

// ---------------------------------------------------------------- admin
app.get('/api/admin/stats', async (c) => {
  const res = await adminStub(c.env).fetch('https://do/stats');
  return c.json(await res.json());
});

app.post('/api/admin/model-test', async (c) => {
  const body = await c.req.json<{ model: string; prompt: string; tools?: boolean; system?: string; rag?: boolean; maxTokens?: number }>();
  const t0 = Date.now();
  try {
    let userContent = body.prompt;
    if (body.rag) {
      const hits = await searchDocs(c.env, body.prompt.slice(0, 500), 4).catch(() => []);
      if (hits.length) {
        const ctxBlock = hits.map((h) => `## ${h.title}\n${h.text.slice(0, 1200)}`).join('\n\n');
        userContent = `Relevant official Roblox documentation:\n\n${ctxBlock}\n\n---\n\n${body.prompt}`;
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
    return c.json({ ok: true, ms: Date.now() - t0, ...res });
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
  await c.env.CORPUS.exec(
    `create virtual table if not exists chunks_fts using fts5(vec_id unindexed, title, url unindexed, text)`
  );
  return c.json({ ok: true });
});

app.post('/api/admin/embed-batch', async (c) => {
  const { chunks, skipVectors } = await c.req.json<{
    chunks: { vecId: string; docSlug: string; title: string; url: string; kind: string; text: string }[];
    skipVectors?: boolean;
  }>();
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 60) return c.json({ error: '1-60 chunks per batch' }, 400);
  if (!skipVectors) {
    const vectors = await embed(c.env, chunks.map((ch) => `${ch.title}\n${ch.text}`.slice(0, 2000)));
    await c.env.VEC.upsert(chunks.map((ch, i) => ({ id: ch.vecId, values: vectors[i]!, metadata: { slug: ch.docSlug, kind: ch.kind } })));
  }
  const stmtChunks = c.env.CORPUS.prepare(
    `insert into chunks(vec_id, doc_slug, title, url, kind, text) values(?,?,?,?,?,?) on conflict(vec_id) do update set title=excluded.title, url=excluded.url, kind=excluded.kind, text=excluded.text`
  );
  const stmtFts = c.env.CORPUS.prepare(`insert into chunks_fts(vec_id, title, url, text) values(?,?,?,?)`);
  const batch: D1PreparedStatement[] = [];
  for (const ch of chunks) {
    batch.push(stmtChunks.bind(ch.vecId, ch.docSlug, ch.title, ch.url, ch.kind, ch.text));
    batch.push(stmtFts.bind(ch.vecId, ch.title, ch.url, ch.text));
  }
  await c.env.CORPUS.batch(batch);
  return c.json({ ok: true, upserted: chunks.length });
});

app.post('/api/admin/rag-test', async (c) => {
  const { query } = await c.req.json<{ query: string }>();
  const hits = await searchDocs(c.env, query, 5);
  return c.json({ hits: hits.map((h) => ({ title: h.title, url: h.url, score: h.score, preview: h.text.slice(0, 200) })) });
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
  const { userId, plan } = await c.req.json<{ userId: string; plan: 'free' | 'pro' }>();
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

app.notFound(async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
  return serveStatic(c.env, c.req.raw);
});

export default app;
