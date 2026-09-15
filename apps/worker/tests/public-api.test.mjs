/**
 * THE PUBLIC HTTP SURFACE: /v1, API keys, scopes, OpenAI compatibility, SSE.
 *
 * WHAT THIS FILE HOLDS. The public API is the first thing in this worker that a stranger's program
 * talks to with a credential that is NOT the user's login. Three things can go wrong in a way no
 * user would ever report:
 *
 *   1. A key reaches a project it was never granted.
 *   2. A guard that is supposed to reject something walks the healthy path and rejects nothing.
 *   3. A call that FAILED comes back looking like a call that succeeded — an empty assistant turn
 *      with `finish_reason: "stop"` is indistinguishable from a model choosing to say nothing.
 *
 * So every guard here is fed an actual violating input and watched refusing it: a revoked key, an
 * expired key, a key whose `expiresAt` is NaN, a model id that resolves through Object.prototype,
 * `max_tokens: "8"`, a project id belonging to somebody else. The happy path is tested too, but
 * the happy path is not what this file is for.
 *
 * HOW IT TESTS. The worker's real Hono app is bundled with esbuild and driven as HTTP inside Node,
 * with a fake edge (Durable Object namespaces, KV, a D1 that understands exactly the statements
 * api-keys.ts issues and throws on anything else). Assertions about authorisation are behavioural
 * — a real 401/403 out of the real middleware chain — and several of them additionally assert that
 * the Durable Object was NEVER ADDRESSED, because "refused with a 403" and "refused after already
 * asking the session for the data" are different failures and only one of them is visible in a
 * status code.
 *
 * NOTHING IS PAID FOR. `globalThis.fetch` is replaced; a dedicated test asserts no provider host
 * was ever contacted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');
const SRC = (...p) => join(WORKER, 'src', ...p);

const TMP = mkdtempSync(join(tmpdir(), 'golem-public-api-'));
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));

const CF_SHIM = join(TMP, 'cf-shim.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');

let seq = 0;
function bundle(entry, label) {
  const dest = join(TMP, `${label}-${seq++}.mjs`);
  execFileSync(
    ESBUILD,
    [entry, '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${dest}`],
    { stdio: 'pipe', cwd: WORKER },
  );
  return dest;
}

const APP = (await import(`file://${bundle(SRC('index.ts'), 'worker')}`)).default;
const K = await import(`file://${bundle(SRC('api-keys.ts'), 'api-keys')}`);
const P = await import(`file://${bundle(SRC('public-api.ts'), 'public-api')}`);
const INDEX_SRC = readFileSync(SRC('index.ts'), 'utf8');

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------
const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');

const SUPABASE_URL = 'https://supa.golem.test';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_PROJECT_ID = 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const JWKS_BODY = JSON.stringify({ keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'golem-test', alg: 'ES256', use: 'sig' }] });
const OWNER_JWT = await new jose.SignJWT({ email: 'owner@golem.test', role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'golem-test' })
  .setIssuer(`${SUPABASE_URL}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(OWNER_ID)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(privateKey);

// ---------------------------------------------------------------------------
// the fake edge
// ---------------------------------------------------------------------------
const PROVIDER_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com', 'api.deepseek.com', 'apis.roblox.com'];
const everFetched = [];
let postgrestProjects = [];

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  everFetched.push(url);
  const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json(JSON.parse(JWKS_BODY));
  if (url.includes('/rest/v1/projects')) {
    const m = /id=eq\.([0-9a-f-]+)/i.exec(url);
    const hit = postgrestProjects.find((p) => p.id === m?.[1]);
    return json(hit ? [hit] : []);
  }
  if (url.includes('/rest/v1/profiles')) return json([{ id: OWNER_ID, plan: 'free', is_admin: false, display_name: null }]);
  return json([]);
};

/**
 * A D1 that understands EXACTLY the statements api-keys.ts issues, and throws on anything else.
 *
 * A permissive fake is the failure this whole file is about: it would accept a rewritten query,
 * return nothing, and every authorisation test below would then pass by finding no key and
 * refusing — green, and measuring nothing. So an unrecognised statement is an error.
 */
function newStore() {
  return { keys: new Map() };
}

function fakeD1(store) {
  const columns = (r) => ({
    id: r.id,
    user_id: r.user_id,
    mode: r.mode,
    name: r.name,
    scopes: r.scopes,
    projects: r.projects,
    created_at: r.created_at,
    expires_at: r.expires_at,
    last_used_at: r.last_used_at,
    revoked_at: r.revoked_at,
  });
  const run = (sql, args) => {
    if (/^insert into api_keys\(/i.test(sql)) {
      const [id, user_id, mode, name, key_hash, scopes, projects, created_at, expires_at] = args;
      store.keys.set(id, { id, user_id, mode, name, key_hash, scopes, projects, created_at, expires_at, last_used_at: null, revoked_at: null });
      return { first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) };
    }
    if (/^select .* from api_keys where key_hash = \?$/i.test(sql)) {
      const hit = [...store.keys.values()].find((r) => r.key_hash === args[0]);
      return { first: async () => (hit ? columns(hit) : null), all: async () => ({ results: hit ? [columns(hit)] : [] }), run: async () => ({}) };
    }
    if (/^select .* from api_keys where user_id = \? order by created_at desc$/i.test(sql)) {
      const rows = [...store.keys.values()].filter((r) => r.user_id === args[0]).map(columns);
      return { first: async () => rows[0] ?? null, all: async () => ({ results: rows }), run: async () => ({}) };
    }
    if (/^update api_keys set revoked_at = \? where id = \? and user_id = \? and revoked_at is null$/i.test(sql)) {
      const [now, id, userId] = args;
      const row = store.keys.get(id);
      if (!row || row.user_id !== userId || row.revoked_at !== null) return { run: async () => ({ meta: { changes: 0 } }) };
      row.revoked_at = now;
      return { run: async () => ({ meta: { changes: 1 } }) };
    }
    if (/^update api_keys set last_used_at = \? where id = \?$/i.test(sql)) {
      const row = store.keys.get(args[1]);
      if (row) row.last_used_at = args[0];
      return { run: async () => ({ meta: { changes: row ? 1 : 0 } }) };
    }
    throw new Error(`fakeD1 does not know this statement — if api-keys.ts changed, update the fake: ${sql}`);
  };
  return {
    async exec(sql) {
      if (!/^create (table|index)/i.test(sql)) throw new Error(`fakeD1 unexpected exec: ${sql}`);
    },
    prepare(sql) {
      return {
        bind: (...args) => run(sql, args),
        first: async () => run(sql, []).first(),
        all: async () => run(sql, []).all(),
        run: async () => run(sql, []).run(),
      };
    },
  };
}

function doNamespace(name, handler, trace) {
  return {
    idFromName(n) {
      trace.addressed.push({ ns: name, name: n });
      return { toString: () => `${name}:${n}`, __name: n };
    },
    idFromString(s) {
      return { toString: () => `${name}:${s}`, __name: s };
    },
    get(id) {
      return {
        async fetch(url, init) {
          const path = new URL(typeof url === 'string' ? url : url.url).pathname;
          let body = null;
          try {
            body = init?.body ? JSON.parse(init.body) : null;
          } catch {
            body = init?.body ?? null;
          }
          const reqId = new Headers(init?.headers ?? {}).get('X-Request-Id');
          trace.calls.push({ ns: name, id: id.__name, path, body, requestId: reqId });
          const out = await handler({ path, body, id: id.__name });
          const status = out && typeof out === 'object' && '__status' in out ? out.__status : 200;
          return new Response(JSON.stringify(out ?? { ok: true }), { status, headers: { 'Content-Type': 'application/json' } });
        },
      };
    },
  };
}

const QUOTA_STATE = { sparksRemaining: 90, sparksLimit: 120, plan: 'free', day: '2026-09-15' };

function makeEnv(opts = {}) {
  const store = opts.store ?? newStore();
  const trace = opts.trace ?? { addressed: [], calls: [], ai: [] };
  const kv = opts.kv ?? new Map();
  const env = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: 'anon-test',
    ENVIRONMENT: 'test',
    BUILD_SHA: 'testsha',
    AI: {
      run: async (model, payload) => {
        trace.ai.push({ model, payload });
        if (String(model).includes('bge')) return { data: [new Array(384).fill(0.01)] };
        if (opts.aiResponse) return opts.aiResponse;
        return {
          choices: [{ message: { content: opts.aiText ?? 'Hello from the model.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
        };
      },
    },
    KV: {
      get: async (k) => kv.get(k) ?? null,
      put: async (k, v) => void kv.set(k, v),
    },
    VEC: { query: async () => ({ matches: [] }), upsert: async () => ({}) },
    CORPUS: fakeD1(store),
    SESSION_DO: doNamespace('SESSION_DO', opts.session ?? (async () => ({ ok: true })), trace),
    QUOTA_DO: doNamespace('QUOTA_DO', opts.quota ?? (async ({ path }) => (path === '/spend' ? { ok: true, state: QUOTA_STATE } : QUOTA_STATE)), trace),
    PAIRING_DO: doNamespace('PAIRING_DO', async () => ({ ok: true }), trace),
    ADMIN_DO: doNamespace('ADMIN_DO', async () => ({ ok: true }), trace),
    BUDGET_DO: doNamespace(
      'BUDGET_DO',
      async ({ path, body }) => {
        if (path === '/reserve') return { ok: true, reserved: Math.max(1, Math.ceil(body?.neurons ?? 1)) };
        if (path === '/state') return { dayRemainingFraction: 0.9, killed: false };
        return { ok: true };
      },
      trace,
    ),
  };
  return { env, store, trace, kv };
}

async function call(path, { method = 'GET', key, jwt, headers = {}, body, env, raw = false } = {}) {
  const h = { ...headers };
  if (key) h.Authorization = `Bearer ${key}`;
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  if (body !== undefined && h['Content-Type'] === undefined) h['Content-Type'] = 'application/json';
  const res = await APP.fetch(
    new Request(`https://golem.test${path}`, {
      method,
      headers: h,
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    }),
    env,
  );
  const text = await res.text();
  if (raw) return { res, text };
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { res, text, json, status: res.status };
}

/** Put a key straight into the fake store through the REAL insert path. */
async function seedKey(envBundle, { mode = 'live', scopes = [...K.API_SCOPES], projects = [], expiresAt = null, revokedAt = null } = {}) {
  const minted = await K.mintKey(mode);
  const rec = {
    id: minted.id,
    userId: OWNER_ID,
    mode: minted.mode,
    name: 'seeded',
    scopes,
    projects,
    createdAt: Date.now(),
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
  };
  await K.insertApiKey(envBundle.env, { ...rec, hash: minted.hash });
  if (revokedAt !== null) envBundle.store.keys.get(minted.id).revoked_at = revokedAt;
  return { key: minted.key, id: minted.id, record: rec };
}

const GRANTED = [{ id: PROJECT_ID, name: 'Test Place' }];

// ===========================================================================
// PURE — api-keys.ts
// ===========================================================================

test('parseApiKey refuses every malformed credential it is handed', () => {
  const bad = [
    null,
    undefined,
    42,
    '',
    'gk_live_',
    'gk_live_0123456789abcdef01234567', // id only, no secret
    `gk_live_${'0'.repeat(24)}_${'0'.repeat(47)}`, // secret one char short
    `gk_live_${'0'.repeat(24)}_${'0'.repeat(49)}`, // one char long
    `gk_live_${'0'.repeat(23)}_${'0'.repeat(48)}`, // id one short
    `gk_LIVE_${'0'.repeat(24)}_${'0'.repeat(48)}`, // prefix case
    `gk_live_${'A'.repeat(24)}_${'0'.repeat(48)}`, // uppercase hex
    `gk_live_${'z'.repeat(24)}_${'0'.repeat(48)}`, // non-hex
    `gk_prod_${'0'.repeat(24)}_${'0'.repeat(48)}`, // unknown mode
    ` gk_live_${'0'.repeat(24)}_${'0'.repeat(48)}`, // leading space
    `gk_live_${'0'.repeat(24)}_${'0'.repeat(48)}x`, // trailing junk
    `gk_live_${'0'.repeat(24)}_${'0'.repeat(48)}\ngk_live_x`, // embedded newline
    `gk_live_${'0'.repeat(24)}_${'0'.repeat(48)}`.padEnd(200, '0'), // absurd length
  ];
  for (const b of bad) {
    assert.equal(K.parseApiKey(b), null, `parseApiKey accepted ${JSON.stringify(String(b)).slice(0, 70)}`);
  }
});

test('a minted key parses back to the mode it was minted in, and two mints differ', async () => {
  for (const mode of K.KEY_MODES) {
    const a = await K.mintKey(mode);
    const b = await K.mintKey(mode);
    assert.notEqual(a.key, b.key);
    assert.notEqual(a.hash, b.hash);
    const parsed = K.parseApiKey(a.key);
    assert.ok(parsed, `${mode} key did not parse`);
    assert.equal(parsed.mode, mode);
    assert.equal(parsed.id, a.id);
    assert.ok(a.key.startsWith(K.KEY_PREFIX[mode]));
  }
});

test('normaliseScopes: every real scope is accepted, and anything else is refused outright', () => {
  // Guards the guard. If a scope is renamed and this list is not, the refusal cases below would
  // be asserting about strings nobody uses and would pass by measuring nothing.
  assert.ok(K.API_SCOPES.length >= 5, 'the scope table shrank unexpectedly');
  assert.deepEqual(K.normaliseScopes([...K.API_SCOPES]), [...K.API_SCOPES]);
  for (const s of K.API_SCOPES) assert.deepEqual(K.normaliseScopes([s]), [s]);

  for (const bad of [null, undefined, 'chat:write', [], {}, [1], [null], ['chat:write', 'nope'], ['CHAT:WRITE'], ['chat:write ']]) {
    assert.equal(K.normaliseScopes(bad), null, `normaliseScopes accepted ${JSON.stringify(bad)}`);
  }
  // A single unknown entry poisons the whole list rather than being filtered out: a key whose
  // printed scopes differ from its real scopes is a lie told to its owner.
  assert.equal(K.normaliseScopes([...K.API_SCOPES, 'admin:everything']), null);
  // dedupe
  assert.deepEqual(K.normaliseScopes(['chat:write', 'chat:write']), ['chat:write']);
});

test('scopesFromStorage re-validates our own past writes', () => {
  assert.deepEqual(K.scopesFromStorage(JSON.stringify(['chat:write', 'admin:everything'])), ['chat:write']);
  assert.deepEqual(K.scopesFromStorage('not json'), []);
  assert.deepEqual(K.scopesFromStorage(JSON.stringify({ chat: true })), []);
});

test('authorizeKey refuses a revoked key, an expired key and a key with a corrupt expiry', () => {
  const base = {
    id: 'k', userId: OWNER_ID, mode: 'live', name: 'n',
    scopes: ['chat:write'], projects: GRANTED, createdAt: 0, expiresAt: null, lastUsedAt: null, revokedAt: null,
  };
  const now = 1_000_000;
  const demand = { scope: 'chat:write', projectId: null, now };

  assert.equal(K.authorizeKey(base, demand).ok, true);

  const revoked = K.authorizeKey({ ...base, revokedAt: now - 1 }, demand);
  assert.equal(revoked.ok, false);
  assert.equal(revoked.code, 'revoked_api_key');
  assert.equal(revoked.status, 401);

  const expired = K.authorizeKey({ ...base, expiresAt: now - 1 }, demand);
  assert.equal(expired.ok, false);
  assert.equal(expired.code, 'expired_api_key');

  // Exactly at the expiry instant the key is already gone: `<=`, not `<`.
  assert.equal(K.authorizeKey({ ...base, expiresAt: now }, demand).ok, false);
  assert.equal(K.authorizeKey({ ...base, expiresAt: now + 1 }, demand).ok, true);

  // THE FAIL-OPEN CASE. `expiresAt <= now` is FALSE for NaN, so without the finiteness check a
  // corrupt expiry reads as "not expired" and the key lives forever.
  for (const junk of [NaN, Infinity, -Infinity]) {
    const v = K.authorizeKey({ ...base, expiresAt: junk }, demand);
    assert.equal(v.ok, false, `expiresAt ${junk} was treated as a live key`);
    assert.equal(v.code, 'expired_api_key');
  }
});

test('authorizeKey enforces scope and project grant separately', () => {
  const base = {
    id: 'k', userId: OWNER_ID, mode: 'live', name: 'n',
    scopes: ['projects:read'], projects: GRANTED, createdAt: 0, expiresAt: null, lastUsedAt: null, revokedAt: null,
  };
  const now = 5;
  // Holding one scope is not holding another — the claim is the RELATIONSHIP, not the literal.
  assert.equal(K.authorizeKey(base, { scope: 'projects:read', projectId: null, now }).ok, true);
  const missing = K.authorizeKey(base, { scope: 'chat:write', projectId: null, now });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'insufficient_scope');
  assert.equal(missing.status, 403);

  // A granted project is reachable; one that merely exists is not.
  assert.equal(K.authorizeKey(base, { scope: 'projects:read', projectId: PROJECT_ID, now }).ok, true);
  const other = K.authorizeKey(base, { scope: 'projects:read', projectId: OTHER_PROJECT_ID, now });
  assert.equal(other.ok, false);
  assert.equal(other.code, 'project_not_granted');
  // A key granted nothing reaches nothing, including the project id it was minted beside.
  assert.equal(K.authorizeKey({ ...base, projects: [] }, { scope: 'projects:read', projectId: PROJECT_ID, now }).ok, false);

  // `scope: null` is the discovery case and must NOT become a bypass for the project check.
  assert.equal(K.authorizeKey(base, { scope: null, projectId: OTHER_PROJECT_ID, now }).ok, false);
});

test('a stored key whose mode column is unrecognised is not coerced into a live key', async () => {
  const bundle = makeEnv();
  const seeded = await seedKey(bundle, { mode: 'test' });
  bundle.store.keys.get(seeded.id).mode = 'superuser';
  const hash = await K.sha256hex(seeded.key);
  assert.equal(await K.findApiKeyByHash(bundle.env, hash), null);
});

test('test keys are rate-limited more tightly than live keys', () => {
  assert.ok(K.rateLimitFor('test') < K.rateLimitFor('live'));
  for (const m of K.KEY_MODES) assert.ok(Number.isFinite(K.rateLimitFor(m)) && K.rateLimitFor(m) > 0);
});

// ===========================================================================
// PURE — public-api.ts
// ===========================================================================

test('matchRoute matches every declared route and nothing else', () => {
  assert.ok(P.PUBLIC_ROUTES.length >= 10, 'the route table shrank unexpectedly');
  for (const r of P.PUBLIC_ROUTES) {
    const concrete = r.path.replace(/:id/g, PROJECT_ID);
    const hit = P.matchRoute(r.method, concrete);
    assert.ok(hit, `${r.method} ${concrete} did not match its own table entry`);
    assert.equal(hit.route.path, r.path);
    if (r.path.includes(':id')) assert.equal(hit.params.id, PROJECT_ID);
    // Right path, wrong verb, is not a match: a GET-only route must not be POSTable.
    const otherVerb = r.method === 'GET' ? 'POST' : 'GET';
    const wrong = P.matchRoute(otherVerb, concrete);
    if (wrong) assert.notEqual(wrong.route.path + wrong.route.method, r.path + r.method);
  }
});

test('matchRoute fails CLOSED on anything the table does not describe', () => {
  const nope = [
    ['GET', '/v1/secret'],
    ['POST', '/v1/chat/completions/extra'],
    ['GET', '/v1/projects/a/b/c/d'],
    ['GET', '/v1/projects//messages'],
    ['GET', '/v2/models'],
    ['GET', '/api/me'],
    ['DELETE', '/v1/projects/x'],
  ];
  for (const [m, p] of nope) assert.equal(P.matchRoute(m, p), undefined, `${m} ${p} matched something`);
  // A trailing slash is the same resource, not a bypass — `/v1/` is `/v1`, and `/v1/models/` is
  // `/v1/models`. Both still resolve to the SAME table entry, so neither slips past the scope
  // check.
  assert.equal(P.matchRoute('GET', '/v1/models/').route.path, '/v1/models');
  assert.equal(P.matchRoute('GET', '/v1/').route.path, '/v1');
});

test('every /v1 route registered in index.ts is in the route table, and vice versa', () => {
  const registered = new Set(
    [...INDEX_SRC.matchAll(/app\.(get|post|put|patch|delete)\('(\/v1[^']*)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`),
  );
  assert.ok(registered.size >= 10, `found only ${registered.size} /v1 routes in index.ts — the scrape broke`);
  const declared = new Set(P.PUBLIC_ROUTES.map((r) => `${r.method} ${r.path}`));
  assert.deepEqual([...registered].filter((r) => !declared.has(r)), [],
    'a /v1 route exists in index.ts but not in PUBLIC_ROUTES — the middleware will 404 it');
  assert.deepEqual([...declared].filter((r) => !registered.has(r)), [],
    'PUBLIC_ROUTES (and therefore the OpenAPI schema) describes a route index.ts does not serve');
});

test('STATIC — no /v1 handler addresses a session except through grantedStub', () => {
  // The behavioural test above proves an ungranted id never materialises a SessionDO TODAY. This
  // is the standing version of that claim: a handler added next month that reads `:id` out of the
  // path and calls sessionStub directly would pass every behavioural test in this file (it would
  // simply have no test of its own) and would reach any project on earth.
  const v1Start = INDEX_SRC.indexOf("app.use('/v1/*'");
  assert.ok(v1Start > 0, 'could not find the /v1 middleware — this scrape broke');
  const v1Region = INDEX_SRC.slice(v1Start);
  assert.equal(
    /\bsessionStub\(/.test(v1Region),
    false,
    'a /v1 handler calls sessionStub directly instead of going through grantedStub',
  );

  // …and grantedStub is the thing that makes that safe, so it has to still ask the question.
  const helper = INDEX_SRC.slice(
    INDEX_SRC.indexOf('function grantedStub'),
    INDEX_SRC.indexOf('function ungranted'),
  );
  assert.ok(helper.length > 50, 'grantedStub was not found where this test looks for it');
  assert.match(helper, /key\.projects\.some\(\(p\) => p\.id === id\)/, 'grantedStub no longer checks the key grant');
  assert.match(helper, /return null/, 'grantedStub no longer refuses an ungranted project');

  // Every handler that takes an :id must consume that null. A handler that destructures the
  // result without checking would be a TypeScript error, but the refusal itself has to be here.
  const idRoutes = P.PUBLIC_ROUTES.filter((r) => r.path.includes(':id'));
  assert.ok(idRoutes.length >= 4);
  assert.equal(
    (v1Region.match(/if \(!g\) return ungranted\(c\);/g) ?? []).length,
    idRoutes.length,
    'a project-scoped /v1 route does not refuse when the grant check says no',
  );
});

test('the OpenAI request parser refuses numbers that are not numbers', () => {
  const ok = { model: 'golem-chat', messages: [{ role: 'user', content: 'hi' }] };
  assert.equal(P.parseChatCompletionRequest(ok).ok, true);

  // `??` defends undefined and null only. Each of these survives it, and then every `>` and
  // Math.min against the value silently gives up the ceiling.
  for (const bad of ['8', NaN, Infinity, -Infinity, null_to_string(), 1.5, 0, -1, 1e9, true, {}]) {
    const r = P.parseChatCompletionRequest({ ...ok, max_tokens: bad });
    assert.equal(r.ok, false, `max_tokens ${String(bad)} was accepted`);
    assert.equal(r.fault.param, 'max_tokens');
  }
  for (const bad of ['0.5', NaN, Infinity, -0.1, 2.1, []]) {
    const r = P.parseChatCompletionRequest({ ...ok, temperature: bad });
    assert.equal(r.ok, false, `temperature ${String(bad)} was accepted`);
  }
  // and the legal values still pass
  assert.equal(P.parseChatCompletionRequest({ ...ok, max_tokens: 64, temperature: 0.7 }).ok, true);
  function null_to_string() {
    return '8';
  }
});

test('the model id is looked up on the table itself, not through Object.prototype', () => {
  const base = { messages: [{ role: 'user', content: 'hi' }] };
  // `PUBLIC_MODELS['constructor']` is truthy through the prototype chain. Without Object.hasOwn
  // this reaches the gateway with an internal model key of `undefined`.
  for (const evil of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    const r = P.parseChatCompletionRequest({ ...base, model: evil });
    assert.equal(r.ok, false, `model '${evil}' resolved through the prototype chain`);
    assert.equal(r.fault.code, 'model_not_found');
  }
  // Guards the guard: the real ids still resolve, so the check above is not passing vacuously.
  for (const id of Object.keys(P.PUBLIC_MODELS)) {
    const r = P.parseChatCompletionRequest({ ...base, model: id });
    assert.equal(r.ok, true, `real model '${id}' was refused`);
    assert.equal(r.value.internalModel, P.PUBLIC_MODELS[id].internal);
  }
});

test('a foundation-model id is refused by name rather than silently aliased', () => {
  for (const id of ['gpt-4o', 'gpt-5.6-luna', 'gemini-3.7-flash', 'deepseek-v4', '@cf/openai/gpt-oss-120b']) {
    const r = P.parseChatCompletionRequest({ model: id, messages: [{ role: 'user', content: 'x' }] });
    assert.equal(r.ok, false, `${id} was accepted as a model`);
    assert.equal(r.fault.status, 404);
  }
});

test('the request parser refuses the shapes this surface cannot honour', () => {
  const base = { model: 'golem-chat', messages: [{ role: 'user', content: 'hi' }] };
  const cases = [
    [{ ...base, tools: [{ type: 'function' }] }, 'tools_not_supported'],
    [{ ...base, functions: [] }, 'tools_not_supported'],
    [{ ...base, n: 2 }, 'invalid_request_error'],
    [{ model: 'golem-chat', messages: [] }, 'invalid_request_error'],
    [{ model: 'golem-chat' }, 'invalid_request_error'],
    [{ ...base, messages: [{ role: 'tool', content: 'x' }] }, 'invalid_request_error'],
    [{ ...base, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: {} }] }] }, 'invalid_request_error'],
    [{ ...base, messages: [{ role: 'user' }] }, 'invalid_request_error'],
    [{ ...base, stream: 'yes' }, 'invalid_request_error'],
    ['a string body', 'invalid_request_error'],
    [null, 'invalid_request_error'],
    [[], 'invalid_request_error'],
  ];
  for (const [body, code] of cases) {
    const r = P.parseChatCompletionRequest(body);
    assert.equal(r.ok, false, `accepted ${JSON.stringify(body)?.slice(0, 60)}`);
    assert.equal(r.fault.code, code, `wrong code for ${JSON.stringify(body)?.slice(0, 60)}`);
  }
  // text parts are the one array form that IS supported
  const parts = P.parseChatCompletionRequest({ ...base, messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }] });
  assert.equal(parts.ok, true);
  assert.equal(parts.value.messages[0].content, 'a\nb');
});

test('the deprecated /v1/completions parser is the same validator, not a laxer one', () => {
  const r = P.parseLegacyCompletionRequest({ model: 'golem-chat', prompt: 'hello', max_tokens: '8' });
  assert.equal(r.ok, false, 'the legacy route accepted a max_tokens the chat route rejects');
  assert.equal(P.parseLegacyCompletionRequest({ model: 'golem-chat', prompt: '' }).ok, false);
  assert.equal(P.parseLegacyCompletionRequest({ model: 'golem-chat' }).ok, false);
  const good = P.parseLegacyCompletionRequest({ model: 'golem-chat', prompt: 'hello' });
  assert.equal(good.ok, true);
  assert.equal(good.value.legacy, true);
  assert.equal(good.value.messages[0].content, 'hello');
});

test('a finish reason this API cannot represent never becomes "stop"', () => {
  assert.equal(P.openAiFinishReason('stop'), 'stop');
  assert.equal(P.openAiFinishReason('length'), 'length');
  // The whole point: a failed call and a tool-seeking call are NOT completions.
  assert.equal(P.openAiFinishReason('error'), null);
  assert.equal(P.openAiFinishReason('tool_calls'), null);
  assert.equal(P.openAiFinishReason('something-new'), null);
});

test('streamed chunks carry the finish reason last, and usage only when asked', () => {
  const resp = { text: 'hello', toolCalls: [], usage: { inputTokens: 3, outputTokens: 2 }, neurons: 1, provider: 'p', model: 'm', finishReason: 'stop' };
  const meta = { id: 'chatcmpl_1', model: 'golem-chat', createdAtMs: 1_700_000_000_000, fingerprint: 'fp' };

  const without = P.chatCompletionChunks(resp, meta, 'stop', false);
  assert.equal(without[0].choices[0].delta.role, 'assistant');
  assert.equal(without[1].choices[0].delta.content, 'hello');
  assert.equal(without.at(-1).choices[0].finish_reason, 'stop');
  assert.equal(without.some((c) => c.usage), false, 'usage was sent without include_usage');
  for (const c of without) assert.equal(c.object, 'chat.completion.chunk');

  const with_ = P.chatCompletionChunks(resp, meta, 'stop', true);
  assert.ok(with_.at(-1).usage, 'include_usage did not produce a usage chunk');
  assert.equal(with_.at(-1).usage.total_tokens, 5);
  // The relationship, not the literal: asking for usage adds exactly one frame.
  assert.equal(with_.length, without.length + 1);

  // An empty completion emits no content delta rather than an empty one.
  const empty = P.chatCompletionChunks({ ...resp, text: '' }, meta, 'stop', false);
  assert.equal(empty.some((c) => c.choices[0]?.delta?.content === ''), true); // the role frame
  assert.equal(empty.length, without.length - 1);
});

test('sseFrame cannot be split by a newline in its payload', () => {
  const frame = P.sseFrame({ a: 'one\ntwo' }, { event: 'state' });
  assert.ok(frame.startsWith('event: state\n'));
  assert.ok(frame.endsWith('\n\n'));
  // JSON.stringify escapes the newline, so the payload is one data line.
  assert.equal(frame.split('\n').filter((l) => l.startsWith('data: ')).length, 1);
  // A raw multi-line string becomes one data line per line — never a stray field name.
  const multi = P.sseFrame('one\ntwo');
  assert.deepEqual(multi.split('\n').filter((l) => l !== ''), ['data: one', 'data: two']);
});

test('projectEvents reports transitions and nothing else', () => {
  const s = (over = {}) => ({ agentStatus: 'idle', messages: 3, pluginConnected: false, ...over });
  assert.deepEqual(P.projectEvents(null, s()).map((e) => e.event), ['state']);
  assert.deepEqual(P.projectEvents(s(), s()), [], 'an unchanged poll emitted an event');
  assert.deepEqual(P.projectEvents(s(), s({ agentStatus: 'running' })).map((e) => e.event), ['run.status']);
  assert.deepEqual(P.projectEvents(s(), s({ messages: 5 })).map((e) => e.event), ['messages']);
  assert.equal(P.projectEvents(s(), s({ messages: 5 }))[0].data.added, 2);
  // A count going DOWN is not "new messages".
  assert.deepEqual(P.projectEvents(s(), s({ messages: 1 })), []);
  assert.deepEqual(P.projectEvents(s(), s({ pluginConnected: true })).map((e) => e.event), ['studio']);
  assert.equal(P.projectEvents(s(), s({ agentStatus: 'running', messages: 4, pluginConnected: true })).length, 3);
});

test('the event stream closes when the run it was watching ends, and not before', () => {
  const s = (st) => ({ agentStatus: st, messages: 0, pluginConnected: false });
  assert.equal(P.streamShouldClose(null, s('idle')), false);
  assert.equal(P.streamShouldClose(null, s('running')), false);
  assert.equal(P.streamShouldClose(s('idle'), s('running')), false);
  assert.equal(P.streamShouldClose(s('running'), s('running')), false);
  assert.equal(P.streamShouldClose(s('running'), s('idle')), true);
  assert.equal(P.streamShouldClose(s('running'), s('error')), true);
});

test('rateLimitCheck lets the limit through and refuses the one after it', () => {
  const buckets = new Map();
  const t0 = 1_000_000;
  let last;
  for (let i = 1; i <= 5; i += 1) {
    last = P.rateLimitCheck(buckets, 'k', 5, 60_000, t0 + i);
    assert.equal(last.allowed, true, `request ${i} of 5 was refused`);
    assert.equal(last.remaining, 5 - i, 'remaining did not count down');
  }
  const over = P.rateLimitCheck(buckets, 'k', 5, 60_000, t0 + 6);
  assert.equal(over.allowed, false, 'the sixth request in a 5/window was allowed');
  assert.equal(over.remaining, 0);
  assert.ok(over.retryAfter >= 1, 'Retry-After must be a positive number of seconds');
  assert.ok(over.resetAt * 1000 > t0, 'reset is in the past');

  // A second key has its own budget.
  assert.equal(P.rateLimitCheck(buckets, 'other', 5, 60_000, t0 + 7).allowed, true);
  // Once the window rolls, the first key is allowed again.
  assert.equal(P.rateLimitCheck(buckets, 'k', 5, 60_000, t0 + 60_001).allowed, true);
});

test('idempotency: same body replays, different body conflicts', () => {
  const rec = { fingerprint: 'abc', status: 200, body: '{}' };
  assert.equal(P.idempotencyVerdict(null, 'abc').kind, 'fresh');
  assert.equal(P.idempotencyVerdict(rec, 'abc').kind, 'replay');
  assert.equal(P.idempotencyVerdict(rec, 'different').kind, 'conflict');

  assert.equal(P.idempotencyKeyValid('order-42'), true);
  for (const bad of ['', null, undefined, 42, 'a'.repeat(256), 'has space', 'has\nnewline', 'tab\there']) {
    assert.equal(P.idempotencyKeyValid(bad), false, `accepted idempotency key ${JSON.stringify(bad)}`);
  }
});

test('a caller-supplied request id cannot inject a header', () => {
  assert.equal(P.sanitizeRequestId('req_abc-123.4:5'), 'req_abc-123.4:5');
  for (const bad of ['a\r\nX-Evil: 1', 'a\nb', 'a b', '<script>', 'x'.repeat(129), '', null, 7, 'a;b']) {
    assert.equal(P.sanitizeRequestId(bad), null, `sanitizeRequestId passed ${JSON.stringify(bad)}`);
  }
  assert.notEqual(P.newRequestId(), P.newRequestId());
});

test('an unknown API version is refused, never quietly upgraded', () => {
  assert.deepEqual(P.resolveApiVersion(undefined), { ok: true, version: P.CURRENT_API_VERSION });
  assert.deepEqual(P.resolveApiVersion('  '), { ok: true, version: P.CURRENT_API_VERSION });
  assert.deepEqual(P.resolveApiVersion(P.CURRENT_API_VERSION), { ok: true, version: P.CURRENT_API_VERSION });
  const bad = P.resolveApiVersion('2019-01-01');
  assert.equal(bad.ok, false);
  assert.equal(bad.requested, '2019-01-01');
});

test('the OpenAPI document is generated from the enforced table, at the caller\'s own origin', () => {
  const doc = P.openApiDocument('https://example.test');
  assert.equal(doc.servers[0].url, 'https://example.test');
  for (const r of P.PUBLIC_ROUTES) {
    const p = r.path.replace(/:([a-zA-Z]+)/g, '{$1}');
    assert.ok(doc.paths[p], `${p} is enforced but not published`);
    const op = doc.paths[p][r.method.toLowerCase()];
    assert.ok(op, `${r.method} ${p} is enforced but not published`);
    assert.deepEqual(op.security, [{ apiKey: r.scope === null ? [] : [r.scope] }]);
    assert.equal(Boolean(op.deprecated), Boolean(r.deprecated));
  }
  const published = Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`));
  assert.equal(published.length, P.PUBLIC_ROUTES.length, 'the schema publishes a different number of operations than the table enforces');
});

test('the deprecation policy is stated on the response, with a sunset in the future', () => {
  const dep = P.PUBLIC_ROUTES.find((r) => r.deprecated);
  assert.ok(dep, 'no route is marked deprecated — the policy has no subject');
  const h = P.deprecationHeaders(dep);
  assert.equal(h.Deprecation, 'true');
  assert.ok(h.Sunset, 'a deprecated route must announce a sunset date');
  assert.ok(Date.parse(h.Sunset) > Date.now(), 'the sunset has already passed');
  assert.match(h.Link, /rel="successor-version"/);
  assert.ok(P.PUBLIC_ROUTES.some((r) => r.path === dep.deprecated.successor), 'the successor is not a route that exists');
  // A route that is not deprecated says nothing.
  const live = P.PUBLIC_ROUTES.find((r) => !r.deprecated);
  assert.deepEqual(P.deprecationHeaders(live), {});
});

test('usage headers omit headroom rather than inventing it', () => {
  const full = P.usageHeaders({ inputTokens: 10, outputTokens: 4, sparksSpent: 2, sparksRemaining: 88 });
  assert.equal(full['X-Golem-Usage-Input-Tokens'], '10');
  assert.equal(full['X-Golem-Usage-Output-Tokens'], '4');
  assert.equal(full['X-Golem-Usage-Sparks'], '2');
  assert.equal(full['X-Golem-Sparks-Remaining'], '88');
  for (const unknown of [null, NaN, Infinity]) {
    const h = P.usageHeaders({ inputTokens: 1, outputTokens: 1, sparksSpent: 1, sparksRemaining: unknown });
    assert.equal('X-Golem-Sparks-Remaining' in h, false, `a headroom of ${unknown} was published as a number`);
  }
});

test('the sandbox completion is deterministic and labels itself', () => {
  const req = P.parseChatCompletionRequest({ model: 'golem-chat', messages: [{ role: 'user', content: 'ping' }] }).value;
  const a = P.sandboxCompletion(req);
  const b = P.sandboxCompletion(req);
  assert.equal(a.text, b.text, 'the sandbox is not deterministic');
  assert.match(a.text, /sandbox/i);
  assert.equal(a.neurons, 0, 'the sandbox must cost nothing');
  assert.equal(a.finishReason, 'stop');
  const other = P.sandboxCompletion(P.parseChatCompletionRequest({ model: 'golem-chat', messages: [{ role: 'user', content: 'pong' }] }).value);
  assert.notEqual(a.text, other.text, 'the sandbox ignores the request');
});

// ===========================================================================
// BEHAVIOURAL — the real app
// ===========================================================================

test('no credential, a malformed one, and an unknown one are all 401 with a JSON envelope', async () => {
  const bundle = makeEnv();
  for (const headers of [{}, { Authorization: 'Bearer nonsense' }, { Authorization: 'Basic abc' }]) {
    const r = await call('/v1/models', { headers, env: bundle.env });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.type, 'authentication_error');
    assert.equal(r.json.error.code, 'invalid_api_key');
    assert.ok(r.json.request_id, 'every error carries a request id');
    assert.equal(r.res.headers.get('X-Request-Id'), r.json.request_id);
  }
  // Structurally perfect, never issued.
  const ghost = `gk_live_${'a'.repeat(24)}_${'b'.repeat(48)}`;
  const r = await call('/v1/models', { key: ghost, env: bundle.env });
  assert.equal(r.status, 401);
  assert.equal(r.json.error.code, 'invalid_api_key');
});

test('a revoked key and an expired key are refused with reasons that differ', async () => {
  const bundle = makeEnv();
  const revoked = await seedKey(bundle, { revokedAt: Date.now() - 1 });
  const expired = await seedKey(bundle, { expiresAt: Date.now() - 1 });
  const live = await seedKey(bundle, {});

  const a = await call('/v1/models', { key: revoked.key, env: bundle.env });
  assert.equal(a.status, 401);
  assert.equal(a.json.error.code, 'revoked_api_key');

  const b = await call('/v1/models', { key: expired.key, env: bundle.env });
  assert.equal(b.status, 401);
  assert.equal(b.json.error.code, 'expired_api_key');

  // Guards the guard: an ordinary key on the same store does work, so the two refusals above are
  // not simply "the fake store returns nothing".
  const c = await call('/v1/models', { key: live.key, env: bundle.env });
  assert.equal(c.status, 200);
  assert.ok(Array.isArray(c.json.data) && c.json.data.length > 0);
});

test('a key without chat:write cannot create a completion, and the model is never run', async () => {
  const bundle = makeEnv();
  const reader = await seedKey(bundle, { scopes: ['projects:read'] });
  const r = await call('/v1/chat/completions', {
    method: 'POST',
    key: reader.key,
    env: bundle.env,
    body: { model: 'golem-chat', messages: [{ role: 'user', content: 'hi' }] },
  });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'insufficient_scope');
  assert.match(r.json.error.message, /chat:write/);
  assert.equal(bundle.trace.ai.length, 0, 'a refused request still ran the model');
  assert.equal(bundle.trace.calls.filter((c) => c.ns === 'QUOTA_DO').length, 0, 'a refused request still spent Sparks');
});

test('a live key returns an OpenAI-shaped completion with usage and rate-limit headers', async () => {
  const bundle = makeEnv({ aiText: 'A stone plaza with a clock tower.' });
  const key = await seedKey(bundle, { scopes: ['chat:write'] });
  const r = await call('/v1/chat/completions', {
    method: 'POST',
    key: key.key,
    env: bundle.env,
    body: { model: 'golem-chat', messages: [{ role: 'user', content: 'describe a plaza' }], max_tokens: 64 },
  });
  assert.equal(r.status, 200, r.text.slice(0, 300));
  assert.equal(r.json.object, 'chat.completion');
  assert.equal(r.json.model, 'golem-chat');
  assert.equal(r.json.choices[0].message.role, 'assistant');
  assert.equal(r.json.choices[0].message.content, 'A stone plaza with a clock tower.');
  assert.equal(r.json.choices[0].finish_reason, 'stop');
  assert.equal(r.json.usage.total_tokens, r.json.usage.prompt_tokens + r.json.usage.completion_tokens);
  // The response must not name the provider or the foundation model anywhere.
  assert.equal(/gpt-oss|@cf\/|workers-ai/i.test(r.text), false, 'the completion leaked provider identity');

  assert.ok(r.res.headers.get('X-Golem-Usage-Input-Tokens'));
  assert.ok(r.res.headers.get('X-Golem-Usage-Output-Tokens'));
  assert.ok(r.res.headers.get('X-Golem-Usage-Sparks'));
  // Rate-limit headers belong on the 200, not only on the 429.
  assert.equal(r.res.headers.get('X-RateLimit-Limit'), String(K.rateLimitFor('live')));
  assert.ok(Number(r.res.headers.get('X-RateLimit-Remaining')) < Number(r.res.headers.get('X-RateLimit-Limit')));
  assert.ok(Number(r.res.headers.get('X-RateLimit-Reset')) > 0);
  assert.equal(r.res.headers.get('Golem-Version'), P.CURRENT_API_VERSION);
  assert.equal(r.res.headers.get('Deprecation'), null, 'the current route announced a deprecation');

  assert.equal(bundle.trace.ai.length, 1, 'the model should have run exactly once');
  assert.ok(bundle.trace.calls.some((c) => c.ns === 'QUOTA_DO' && c.path === '/spend'), 'a live call did not spend Sparks');
});

test('a run that ends in a tool call is an error, not an empty completion', async () => {
  // The central discipline: a call that did not produce an answer must not come back looking like
  // an answer. Without the finish-reason guard this is a 200 with content "" and finish_reason
  // "stop" — indistinguishable from the model choosing to say nothing.
  const bundle = makeEnv({
    aiResponse: {
      choices: [{ message: { content: '', tool_calls: [{ id: 'tc1', function: { name: 'read_script', arguments: '{}' } }] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 5, completion_tokens: 1 },
    },
  });
  const key = await seedKey(bundle, { scopes: ['chat:write'] });
  const r = await call('/v1/chat/completions', {
    method: 'POST',
    key: key.key,
    env: bundle.env,
    body: { model: 'golem-chat', messages: [{ role: 'user', content: 'edit my script' }] },
  });
  assert.equal(r.status, 502, `expected a refusal, got ${r.status}: ${r.text.slice(0, 200)}`);
  assert.equal(r.json.error.code, 'upstream_incomplete');
  assert.equal(r.json.choices, undefined, 'a failure was rendered with choices');
});

test('a test key is served by the sandbox: no model, no Sparks, and it says so', async () => {
  const bundle = makeEnv();
  const key = await seedKey(bundle, { mode: 'test', scopes: ['chat:write'] });
  const r = await call('/v1/chat/completions', {
    method: 'POST',
    key: key.key,
    env: bundle.env,
    body: { model: 'golem-chat', messages: [{ role: 'user', content: 'ping' }] },
  });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.json.system_fingerprint, P.SANDBOX_FINGERPRINT);
  assert.equal(r.res.headers.get('X-Golem-Sandbox'), 'true');
  assert.match(r.json.choices[0].message.content, /sandbox/i);
  assert.equal(r.res.headers.get('X-Golem-Usage-Sparks'), '0');
  assert.equal(bundle.trace.ai.length, 0, 'a TEST key ran the model');
  assert.equal(bundle.trace.calls.filter((c) => c.ns === 'QUOTA_DO').length, 0, 'a TEST key spent Sparks');
  // Same request, same answer — that is what makes a test key assertable in somebody else's CI.
  const again = await call('/v1/chat/completions', {
    method: 'POST',
    key: key.key,
    env: bundle.env,
    body: { model: 'golem-chat', messages: [{ role: 'user', content: 'ping' }] },
  });
  assert.equal(again.json.choices[0].message.content, r.json.choices[0].message.content);
  // The live key's rate limit is not the test key's.
  assert.equal(r.res.headers.get('X-RateLimit-Limit'), String(K.rateLimitFor('test')));
});

test('a key not granted a project cannot reach it, and the session is never addressed', async () => {
  const bundle = makeEnv();
  const key = await seedKey(bundle, { scopes: [...K.API_SCOPES], projects: GRANTED });

  for (const path of [
    `/v1/projects/${OTHER_PROJECT_ID}`,
    `/v1/projects/${OTHER_PROJECT_ID}/messages`,
    `/v1/projects/${OTHER_PROJECT_ID}/runs/current`,
    `/v1/projects/${OTHER_PROJECT_ID}/events`,
  ]) {
    const r = await call(path, { key: key.key, env: bundle.env });
    assert.equal(r.status, 403, `${path} was not refused`);
    assert.equal(r.json.error.code, 'project_not_granted');
  }
  const post = await call(`/v1/projects/${OTHER_PROJECT_ID}/runs`, {
    method: 'POST', key: key.key, env: bundle.env, body: { input: 'build a tower' },
  });
  assert.equal(post.status, 403);

  // The strong claim: refusing AFTER asking the session for the data is a different failure from
  // refusing, and only one of those is visible in the status code.
  assert.deepEqual(
    bundle.trace.addressed.filter((a) => a.ns === 'SESSION_DO'),
    [],
    'an ungranted project id still materialised a SessionDO',
  );
});

test('a granted project is readable, and the transcript comes from that project\'s session', async () => {
  const bundle = makeEnv({
    session: async ({ path }) => {
      if (path === '/info') return { project: { id: PROJECT_ID, name: 'Test Place' }, agentStatus: 'idle', messages: 4, pluginConnected: true };
      if (path === '/messages') return { messages: [{ id: 'm1', role: 'user', content: 'hi' }] };
      return { ok: true };
    },
  });
  const key = await seedKey(bundle, { scopes: [...K.API_SCOPES], projects: GRANTED });

  const list = await call('/v1/projects', { key: key.key, env: bundle.env });
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.data.map((p) => p.id), [PROJECT_ID]);

  const one = await call(`/v1/projects/${PROJECT_ID}`, { key: key.key, env: bundle.env });
  assert.equal(one.status, 200, one.text.slice(0, 200));
  assert.equal(one.json.name, 'Test Place');
  assert.equal(one.json.studio_connected, true);
  assert.equal(one.json.agent_status, 'idle');

  const msgs = await call(`/v1/projects/${PROJECT_ID}/messages?limit=5`, { key: key.key, env: bundle.env });
  assert.equal(msgs.status, 200);
  assert.equal(msgs.json.data[0].id, 'm1');
  assert.deepEqual(
    bundle.trace.addressed.filter((a) => a.ns === 'SESSION_DO').map((a) => a.name),
    [PROJECT_ID, PROJECT_ID],
    'a session other than the granted one was addressed',
  );
});

test('starting a run maps the public mode onto the internal specialist, and refuses anything else', async () => {
  const bundle = makeEnv({ session: async ({ path }) => (path === '/agent-run' ? { ok: true, started: true } : { ok: true }) });
  const key = await seedKey(bundle, { scopes: [...K.API_SCOPES], projects: GRANTED });

  const r = await call(`/v1/projects/${PROJECT_ID}/runs`, {
    method: 'POST', key: key.key, env: bundle.env, body: { input: 'build a market stall', mode: 'plan' },
  });
  assert.equal(r.status, 202, r.text.slice(0, 200));
  const started = bundle.trace.calls.find((c) => c.path === '/agent-run');
  assert.ok(started, 'no run was started');
  assert.equal(started.body.mode, 'clay', 'the public mode did not map onto the internal specialist');
  assert.equal(started.body.text, 'build a market stall');
  // Internal specialist names must not be accepted on the wire, and neither must a prototype key.
  for (const mode of ['clay', 'stone', 'constructor', '__proto__', 'toString', 7, {}]) {
    const bad = await call(`/v1/projects/${PROJECT_ID}/runs`, {
      method: 'POST', key: key.key, env: bundle.env, body: { input: 'x', mode },
    });
    assert.equal(bad.status, 400, `mode ${JSON.stringify(mode)} was accepted`);
    assert.equal(bad.json.error.param, 'mode');
  }
  const noInput = await call(`/v1/projects/${PROJECT_ID}/runs`, { method: 'POST', key: key.key, env: bundle.env, body: { input: '   ' } });
  assert.equal(noInput.status, 400);
  assert.equal(noInput.json.error.param, 'input');
});

test('a test key cannot start a real run — the sandbox simulates it and says so', async () => {
  const bundle = makeEnv({ session: async () => ({ ok: true }) });
  const key = await seedKey(bundle, { mode: 'test', scopes: [...K.API_SCOPES], projects: GRANTED });
  const r = await call(`/v1/projects/${PROJECT_ID}/runs`, {
    method: 'POST', key: key.key, env: bundle.env, body: { input: 'delete everything' },
  });
  assert.equal(r.status, 202);
  assert.equal(r.json.status, 'simulated');
  assert.equal(r.json.sandbox, true);
  assert.equal(r.res.headers.get('X-Golem-Sandbox'), 'true');
  assert.deepEqual(bundle.trace.calls.filter((c) => c.path === '/agent-run'), [], 'a TEST key started a real run');
});

test('stream: true produces a real SSE body terminated by [DONE]', async () => {
  const bundle = makeEnv({ aiText: 'streamed answer' });
  const key = await seedKey(bundle, { scopes: ['chat:write'] });
  const { res, text } = await call('/v1/chat/completions', {
    method: 'POST',
    key: key.key,
    env: bundle.env,
    raw: true,
    body: { model: 'golem-chat', messages: [{ role: 'user', content: 'go' }], stream: true, stream_options: { include_usage: true } },
  });
  assert.equal(res.status, 200, text.slice(0, 200));
  assert.match(res.headers.get('Content-Type') ?? '', /text\/event-stream/);
  assert.ok(text.endsWith('data: [DONE]\n\n'), 'the stream did not terminate with [DONE]');
  const frames = text
    .split('\n\n')
    .filter((f) => f.startsWith('data: ') && !f.includes('[DONE]'))
    .map((f) => JSON.parse(f.slice('data: '.length)));
  assert.ok(frames.length >= 3, `expected role, content and finish frames, got ${frames.length}`);
  assert.equal(frames[0].choices[0].delta.role, 'assistant');
  assert.ok(frames.some((f) => f.choices[0]?.delta?.content === 'streamed answer'));
  assert.ok(frames.some((f) => f.choices[0]?.finish_reason === 'stop'));
  assert.ok(frames.at(-1).usage, 'include_usage was honoured in the parser but not on the wire');
  for (const f of frames) assert.equal(f.object, 'chat.completion.chunk');
});

test('Idempotency-Key replays the first answer and refuses a second, different body', async () => {
  const bundle = makeEnv({ aiText: 'once' });
  const key = await seedKey(bundle, { scopes: ['chat:write'] });
  const body = { model: 'golem-chat', messages: [{ role: 'user', content: 'charge me once' }] };
  const headers = { 'Idempotency-Key': 'order-42' };

  const first = await call('/v1/chat/completions', { method: 'POST', key: key.key, env: bundle.env, headers, body });
  assert.equal(first.status, 200, first.text.slice(0, 200));
  assert.equal(first.res.headers.get('Idempotency-Replayed'), null);

  const second = await call('/v1/chat/completions', { method: 'POST', key: key.key, env: bundle.env, headers, body });
  assert.equal(second.status, 200);
  assert.equal(second.res.headers.get('Idempotency-Replayed'), 'true');
  assert.equal(second.text, first.text, 'the replay was not byte-identical');
  assert.equal(bundle.trace.ai.length, 1, 'the replayed call ran the model a second time');

  const reused = await call('/v1/chat/completions', {
    method: 'POST', key: key.key, env: bundle.env, headers,
    body: { ...body, messages: [{ role: 'user', content: 'something else entirely' }] },
  });
  assert.equal(reused.status, 409);
  assert.equal(reused.json.error.code, 'idempotency_key_reuse');
  assert.equal(bundle.trace.ai.length, 1, 'a conflicting idempotency key still ran the model');

  // A malformed key is refused rather than ignored.
  const bad = await call('/v1/chat/completions', {
    method: 'POST', key: key.key, env: bundle.env, headers: { 'Idempotency-Key': 'has space' }, body,
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'invalid_idempotency_key');

  // Combined with streaming it is REFUSED, never silently dropped: a caller who believes they are
  // protected from a double charge and is not, is worse off than one who is told no.
  const streamed = await call('/v1/chat/completions', {
    method: 'POST', key: key.key, env: bundle.env, headers: { 'Idempotency-Key': 'stream-1' }, body: { ...body, stream: true },
  });
  assert.equal(streamed.status, 400);
  assert.equal(streamed.json.error.code, 'idempotency_not_supported_for_stream');
});

test('an unknown /v1 path is a JSON 404, not the marketing 404 page', async () => {
  const bundle = makeEnv();
  const key = await seedKey(bundle, {});
  for (const path of ['/v1/nope', '/v1/chat/completions/extra', '/v1/projects/x/y/z']) {
    const r = await call(path, { key: key.key, env: bundle.env });
    assert.equal(r.status, 404, `${path} was not 404`);
    assert.match(r.res.headers.get('Content-Type') ?? '', /application\/json/, `${path} answered with HTML`);
    assert.equal(r.json.error.code, 'unknown_route');
    assert.ok(r.json.request_id);
  }
  // Wrong verb on a real path is also 404 from the table, not 405-by-accident from Hono.
  for (const [method, path] of [['POST', '/v1/models'], ['PUT', '/v1/models'], ['DELETE', `/v1/projects/${PROJECT_ID}`]]) {
    const r = await call(path, { method, key: key.key, env: bundle.env, ...(method === 'GET' ? {} : { body: {} }) });
    assert.equal(r.status, 404, `${method} ${path} was not 404`);
    assert.match(r.res.headers.get('Content-Type') ?? '', /application\/json/);
  }
  // The bare `/v1` with a verb the table does not serve. It matters because app.notFound hands
  // anything that is NOT refused earlier to the STATIC SITE, which answers a program with the
  // marketing 404 page — HTML, with a 404 status. The middleware's own table lookup is what keeps
  // every `/v1` shape out of there.
  const bare = await call('/v1', { method: 'POST', key: key.key, env: bundle.env, body: {} });
  assert.equal(bare.status, 404);
  assert.match(bare.res.headers.get('Content-Type') ?? '', /application\/json/, 'POST /v1 answered with HTML');
  assert.equal(bare.json.error.code, 'unknown_route');
  assert.ok(bare.res.headers.get('X-Request-Id'));
});

test('an unknown Golem-Version is refused before anything else happens', async () => {
  const bundle = makeEnv();
  const key = await seedKey(bundle, { scopes: ['chat:write'] });
  const r = await call('/v1/chat/completions', {
    method: 'POST',
    key: key.key,
    env: bundle.env,
    headers: { 'Golem-Version': '2019-01-01' },
    body: { model: 'golem-chat', messages: [{ role: 'user', content: 'hi' }] },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'unsupported_api_version');
  assert.equal(bundle.trace.ai.length, 0);
  // The current version is accepted and echoed.
  const ok = await call('/v1/models', { key: key.key, env: bundle.env, headers: { 'Golem-Version': P.CURRENT_API_VERSION } });
  assert.equal(ok.status, 200);
  assert.equal(ok.res.headers.get('Golem-Version'), P.CURRENT_API_VERSION);
});

test('the deprecated completion route still works and announces its own sunset', async () => {
  const bundle = makeEnv({ aiText: 'legacy answer' });
  const key = await seedKey(bundle, { scopes: ['chat:write'] });
  const r = await call('/v1/completions', {
    method: 'POST', key: key.key, env: bundle.env, body: { model: 'golem-chat', prompt: 'hello' },
  });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.json.object, 'text_completion');
  assert.equal(r.json.choices[0].text, 'legacy answer');
  assert.equal(r.res.headers.get('Deprecation'), 'true');
  assert.ok(Date.parse(r.res.headers.get('Sunset')) > Date.now());
  assert.match(r.res.headers.get('Link') ?? '', /\/v1\/chat\/completions/);
});

test('a caller\'s request id is echoed when it is safe, replaced when it is not, and carried inward', async () => {
  const bundle = makeEnv({
    session: async ({ path }) => (path === '/info' ? { project: { id: PROJECT_ID, name: 'T' }, agentStatus: 'idle', messages: 0, pluginConnected: false } : { ok: true }),
  });
  const key = await seedKey(bundle, { scopes: [...K.API_SCOPES], projects: GRANTED });
  const mine = await call('/v1/models', { key: key.key, env: bundle.env, headers: { 'X-Request-Id': 'trace-abc-1' } });
  assert.equal(mine.res.headers.get('X-Request-Id'), 'trace-abc-1');

  const evil = await call('/v1/models', { key: key.key, env: bundle.env, headers: { 'X-Request-Id': 'evil trace' } });
  assert.notEqual(evil.res.headers.get('X-Request-Id'), 'evil trace');
  assert.match(evil.res.headers.get('X-Request-Id'), /^req_[0-9a-f]{32}$/);

  // The id the caller was given is the id the Durable Object was called with. A trace that stops
  // at the edge describes only the hop that did the least work.
  const traced = await call(`/v1/projects/${PROJECT_ID}`, { key: key.key, env: bundle.env, headers: { 'X-Request-Id': 'trace-inward-9' } });
  assert.equal(traced.status, 200, traced.text.slice(0, 200));
  const inward = bundle.trace.calls.filter((cc) => cc.ns === 'SESSION_DO');
  assert.ok(inward.length > 0, 'the session was never called — this assertion would prove nothing');
  for (const cc of inward) assert.equal(cc.requestId, 'trace-inward-9', `${cc.path} was not tagged with the caller's request id`);

  // A run start and a Spark spend carry it too.
  const runBundle = makeEnv({ session: async () => ({ ok: true }) });
  const runKey = await seedKey(runBundle, { scopes: [...K.API_SCOPES], projects: GRANTED });
  await call(`/v1/projects/${PROJECT_ID}/runs`, {
    method: 'POST', key: runKey.key, env: runBundle.env, headers: { 'X-Request-Id': 'run-trace-2' }, body: { input: 'go' },
  });
  assert.equal(runBundle.trace.calls.find((cc) => cc.path === '/agent-run').requestId, 'run-trace-2');

  const chatBundle = makeEnv();
  const chatKey = await seedKey(chatBundle, { scopes: ['chat:write'] });
  await call('/v1/chat/completions', {
    method: 'POST', key: chatKey.key, env: chatBundle.env, headers: { 'X-Request-Id': 'chat-trace-3' },
    body: { model: 'golem-chat', messages: [{ role: 'user', content: 'hi' }] },
  });
  const spend = chatBundle.trace.calls.find((cc) => cc.ns === 'QUOTA_DO' && cc.path === '/spend');
  assert.ok(spend, 'no Spark spend was recorded');
  assert.equal(spend.requestId, 'chat-trace-3');
});

test('the per-key rate limit bites, and says when to come back', async () => {
  const bundle = makeEnv();
  const key = await seedKey(bundle, { mode: 'test', scopes: ['chat:write'] });
  const limit = K.rateLimitFor('test');
  let last = null;
  for (let i = 0; i < limit; i += 1) {
    last = await call('/v1/models', { key: key.key, env: bundle.env });
    assert.equal(last.status, 200, `request ${i + 1} of ${limit} was refused early`);
  }
  assert.equal(last.res.headers.get('X-RateLimit-Remaining'), '0');
  const over = await call('/v1/models', { key: key.key, env: bundle.env });
  assert.equal(over.status, 429);
  assert.equal(over.json.error.code, 'rate_limit_exceeded');
  assert.equal(over.json.error.type, 'rate_limit_error');
  assert.ok(Number(over.res.headers.get('Retry-After')) >= 1);

  // A different key is unaffected: the limit is per key, not global.
  const other = await seedKey(bundle, { mode: 'test' });
  assert.equal((await call('/v1/models', { key: other.key, env: bundle.env })).status, 200);
});

test('an account out of Sparks gets 429 and the model does not run', async () => {
  const bundle = makeEnv({ quota: async ({ path }) => (path === '/spend' ? { ok: false, state: { ...QUOTA_STATE, sparksRemaining: 0 } } : QUOTA_STATE) });
  const key = await seedKey(bundle, { scopes: ['chat:write'] });
  const r = await call('/v1/chat/completions', {
    method: 'POST', key: key.key, env: bundle.env, body: { model: 'golem-chat', messages: [{ role: 'user', content: 'hi' }] },
  });
  assert.equal(r.status, 429);
  assert.equal(r.json.error.code, 'insufficient_quota');
  assert.equal(bundle.trace.ai.length, 0, 'the model ran after the quota refused admission');
});

test('the event stream opens, reports the transition, and ends when the run ends', async () => {
  let poll = 0;
  const bundle = makeEnv({
    session: async ({ path }) => {
      if (path !== '/info') return { ok: true };
      poll += 1;
      return poll <= 1
        ? { project: { id: PROJECT_ID, name: 'Test Place' }, agentStatus: 'running', messages: 2, pluginConnected: true }
        : { project: { id: PROJECT_ID, name: 'Test Place' }, agentStatus: 'idle', messages: 5, pluginConnected: true };
    },
  });
  const key = await seedKey(bundle, { scopes: [...K.API_SCOPES], projects: GRANTED });
  const { res, text } = await call(`/v1/projects/${PROJECT_ID}/events?poll_ms=250`, { key: key.key, env: bundle.env, raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type') ?? '', /text\/event-stream/);

  const events = [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(events, ['open', 'state', 'run.status', 'messages', 'done'], text.slice(0, 500));
  assert.match(text, /"from":"running","to":"idle"/);
  assert.match(text, /"added":3/);
  assert.ok(text.includes(': heartbeat'), 'an idle tick sent no keep-alive comment');
  // The stream ENDED: a client that waits for end-of-stream is not left hanging.
  assert.ok(text.includes('"reason":"run_finished"'));
});

test('minting a key: JWT required, ownership proven under RLS, secret shown once', async () => {
  const bundle = makeEnv();
  postgrestProjects = [{ id: PROJECT_ID, owner_id: OWNER_ID, name: 'Test Place', place_name: null, memory_summary: null, memory_facts: [] }];

  const anon = await call('/api/keys', { method: 'POST', env: bundle.env, body: { name: 'x', mode: 'live', scopes: ['chat:write'] } });
  assert.equal(anon.status, 401);

  // A project RLS will not return is refused, and the key is not created.
  const stolen = await call('/api/keys', {
    method: 'POST', jwt: OWNER_JWT, env: bundle.env,
    body: { name: 'ci', mode: 'live', scopes: ['projects:read'], projectIds: [OTHER_PROJECT_ID] },
  });
  assert.equal(stolen.status, 403);
  assert.equal(bundle.store.keys.size, 0, 'a key was created for a project the caller does not own');

  for (const bad of [
    { name: '', mode: 'live', scopes: ['chat:write'] },
    { name: 'x', mode: 'sudo', scopes: ['chat:write'] },
    { name: 'x', mode: 'live', scopes: [] },
    { name: 'x', mode: 'live', scopes: ['admin:everything'] },
    { name: 'x', mode: 'live', scopes: ['chat:write'], expiresInDays: '30' },
    { name: 'x', mode: 'live', scopes: ['chat:write'], expiresInDays: 0 },
    { name: 'x', mode: 'live', scopes: ['chat:write'], expiresInDays: 366 },
    { name: 'x', mode: 'live', scopes: ['chat:write'], expiresInDays: 1.5 },
    { name: 'x', mode: 'live', scopes: ['chat:write'], expiresInDays: true },
    { name: 'x', mode: 'live', scopes: ['chat:write'], projectIds: ['not-a-uuid'] },
    { name: 'x', mode: 'live', scopes: ['chat:write'], projectIds: 'all' },
  ]) {
    const r = await call('/api/keys', { method: 'POST', jwt: OWNER_JWT, env: bundle.env, body: bad });
    assert.equal(r.status >= 400, true, `mint accepted ${JSON.stringify(bad)}`);
  }
  assert.equal(bundle.store.keys.size, 0);

  const made = await call('/api/keys', {
    method: 'POST', jwt: OWNER_JWT, env: bundle.env,
    body: { name: 'ci', mode: 'live', scopes: ['chat:write', 'projects:read'], projectIds: [PROJECT_ID], expiresInDays: 30 },
  });
  assert.equal(made.status, 201, made.text.slice(0, 300));
  assert.ok(K.parseApiKey(made.json.key), 'the minted key is not a key');
  assert.deepEqual(made.json.projects, [{ id: PROJECT_ID, name: 'Test Place' }]);

  // It actually works, on the project it was granted.
  const used = await call(`/v1/projects`, { key: made.json.key, env: bundle.env });
  assert.equal(used.status, 200);
  assert.deepEqual(used.json.data.map((p) => p.id), [PROJECT_ID]);

  // The secret is shown ONCE. The listing must not contain it, and neither must the stored row.
  const listed = await call('/api/keys', { jwt: OWNER_JWT, env: bundle.env });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.keys.length, 1);
  assert.equal(listed.text.includes(made.json.key), false, 'the key listing returned the secret');
  assert.equal(JSON.stringify([...bundle.store.keys.values()]).includes(made.json.key), false, 'the plaintext key was stored');

  // Revoking it takes effect on the very next call.
  const revoked = await call(`/api/keys/${made.json.id}`, { method: 'DELETE', jwt: OWNER_JWT, env: bundle.env });
  assert.equal(revoked.status, 200);
  const after = await call('/v1/projects', { key: made.json.key, env: bundle.env });
  assert.equal(after.status, 401);
  assert.equal(after.json.error.code, 'revoked_api_key');
  // Revoking something that is not yours, or not there, is a 404 and changes nothing.
  assert.equal((await call('/api/keys/does-not-exist', { method: 'DELETE', jwt: OWNER_JWT, env: bundle.env })).status, 404);
  postgrestProjects = [];
});

test('the discovery document and the OpenAPI schema are served at the caller\'s origin', async () => {
  const bundle = makeEnv();
  const key = await seedKey(bundle, { scopes: ['projects:read'] }); // deliberately NOT chat:write
  const root = await call('/v1', { key: key.key, env: bundle.env });
  assert.equal(root.status, 200, 'discovery must be reachable by any valid key');
  assert.equal(root.json.version, P.CURRENT_API_VERSION);
  assert.equal(root.json.routes.length, P.PUBLIC_ROUTES.length);

  const schema = await call('/v1/openapi.json', { key: key.key, env: bundle.env });
  assert.equal(schema.status, 200);
  assert.equal(schema.json.openapi, '3.1.0');
  assert.equal(schema.json.servers[0].url, 'https://golem.test');
  assert.ok(schema.json.paths['/v1/chat/completions'].post);
  assert.ok(schema.json.paths['/v1/projects/{id}/messages'].get);
});

test('nothing in this file ever contacted a paid provider', () => {
  const paid = everFetched.filter((u) => PROVIDER_HOSTS.some((h) => u.includes(h)));
  assert.deepEqual(paid, [], 'a provider host was contacted');
  assert.ok(everFetched.some((u) => u.includes('jwks')), 'the fetch trace recorded nothing — this assertion proves nothing');
});
