// Golem worker entry: API routes + static serving + DO exports.
import { Hono } from 'hono';
import type { Env, AuthedUser } from './env';
import { verifyJwt, bearerToken } from './auth';
import { getOwnedProject, getProfile } from './supa';
import { chat as llmChat, embed, getModels, budgetReport, budgetState, setKillSwitch, BudgetError } from './gateway';
import { searchDocs } from './rag';
import { serveStatic, ensureStaticTables } from './static';

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

const AUTH_EXEMPT = ['/api/health', '/api/studio/claim', '/api/studio/poll', '/api/waitlist'];
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

app.use('/api/admin/*', async (c, next) => {
  const key = c.req.header('X-Admin-Key');
  if (!c.env.ADMIN_KEY || key !== c.env.ADMIN_KEY) return c.json({ error: 'forbidden' }, 403);
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

app.get('/api/projects/:id/checkpoints', async (c) => {
  const ctx = await withOwnedProject(c, c.req.param('id'));
  if (!ctx) return c.json({ error: 'not found' }, 404);
  return ctx.stub.fetch('https://do/checkpoints');
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
  await stub.fetch('https://do/plugin/register', { method: 'POST', body: JSON.stringify({ tokenHash: await sha256hex(token) }) });
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
  return stub.fetch('https://do/plugin/poll', { method: 'POST', headers, body: await c.req.raw.text() });
});

// ---------------------------------------------------------------- me
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
