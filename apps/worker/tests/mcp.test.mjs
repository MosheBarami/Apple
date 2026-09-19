/**
 * THE MCP SURFACE: /v1/mcp, spoken with real MCP messages against the real Hono app.
 *
 * WHAT THIS FILE IS FOR. An MCP server is a door that a program the user did not write — Claude,
 * Cursor, some agent framework — knocks on with a credential. Three things can go wrong here in a
 * way no user would ever report:
 *
 *   1. THE DOOR IS UNLOCKED. A JSON-RPC envelope arrives with no key, or a revoked one, and the
 *      server answers it. Every assertion about that is behavioural AND checks that the SessionDO
 *      was never addressed — "refused with a 401" and "refused after already reading the project"
 *      are different failures and only one of them shows up in a status code.
 *
 *   2. THE SUBSET LEAKS. The MCP surface is a DELIBERATE subset of the agent's tools. The failure
 *      mode that matters is not "a tool is missing" but "a tool nobody decided about is present":
 *      somebody adds `delete_everything` to the registry next month and it appears on a public
 *      endpoint because the filter was a denylist. So the classification here is total — every
 *      name in the registry is either allowed or excluded WITH A WRITTEN REASON, and a tool that
 *      is neither fails this file rather than shipping.
 *
 *   3. A READ TOOL STOPS BEING A READ TOOL. Membership of the allowed list is a claim about what
 *      the tool DOES. That claim is re-derived from the implementation, not trusted: every allowed
 *      tool is scraped for the Studio ops it issues and every one of them must be on the read-only
 *      op list.
 *
 * HOW IT TESTS. The worker's real Hono app is bundled with esbuild and driven as HTTP inside Node
 * against a fake edge — the same technique as public-api.test.mjs, whose fake D1 understands
 * exactly the statements api-keys.ts issues and throws on anything else, so an authorisation test
 * cannot pass by finding no key and refusing.
 *
 * Nothing here contacts a network. The MCP subset was chosen so that no tool on it runs a model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');
const SRC = (...p) => join(WORKER, 'src', ...p);

const TMP = mkdtempSync(join(tmpdir(), 'golem-mcp-'));
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
const M = await import(`file://${bundle(SRC('mcp.ts'), 'mcp')}`);
const T = await import(`file://${bundle(SRC('tools.ts'), 'tools')}`);
const P = await import(`file://${bundle(SRC('public-api.ts'), 'public-api')}`);
const TOOLS_SRC = readFileSync(SRC('tools.ts'), 'utf8');
const SESSION_SRC = readFileSync(SRC('do', 'session.ts'), 'utf8');
const INDEX_SRC = readFileSync(SRC('index.ts'), 'utf8');

// ---------------------------------------------------------------------------
// the fake edge
// ---------------------------------------------------------------------------
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_PROJECT_ID = 'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb';
const GRANTED = [{ id: PROJECT_ID, name: 'Test Place' }];

const everFetched = [];
globalThis.fetch = async (input) => {
  everFetched.push(typeof input === 'string' ? input : input.url);
  return new Response('[]', { headers: { 'content-type': 'application/json' } });
};

function fakeD1(store) {
  const columns = (r) => ({
    id: r.id, user_id: r.user_id, mode: r.mode, name: r.name, scopes: r.scopes, projects: r.projects,
    created_at: r.created_at, expires_at: r.expires_at, last_used_at: r.last_used_at, revoked_at: r.revoked_at,
  });
  const run = (sql, args) => {
    if (/^insert into api_keys\(/i.test(sql)) {
      const [id, user_id, mode, name, key_hash, scopes, projects, created_at, expires_at] = args;
      store.keys.set(id, { id, user_id, mode, name, key_hash, scopes, projects, created_at, expires_at, last_used_at: null, revoked_at: null });
      return { first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) };
    }
    if (/^select .* from api_keys where key_hash = \?$/i.test(sql)) {
      const hit = [...store.keys.values()].find((r) => r.key_hash === args[0]);
      return { first: async () => (hit ? columns(hit) : null), all: async () => ({ results: [] }), run: async () => ({}) };
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
          trace.calls.push({ ns: name, id: id.__name, path, body });
          const out = await handler({ path, body, id: id.__name });
          const status = out && typeof out === 'object' && '__status' in out ? out.__status : 200;
          return new Response(JSON.stringify(out ?? { ok: true }), { status, headers: { 'Content-Type': 'application/json' } });
        },
      };
    },
  };
}

function makeEnv(opts = {}) {
  const store = opts.store ?? { keys: new Map() };
  const trace = opts.trace ?? { addressed: [], calls: [] };
  const kv = new Map();
  const env = {
    SUPABASE_URL: 'https://supa.golem.test',
    SUPABASE_ANON_KEY: 'anon-test',
    ENVIRONMENT: 'test',
    BUILD_SHA: 'testsha',
    AI: { run: async () => { throw new Error('the MCP surface must never run a model'); } },
    KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
    VEC: { query: async () => ({ matches: [] }), upsert: async () => ({}) },
    CORPUS: fakeD1(store),
    SESSION_DO: doNamespace('SESSION_DO', opts.session ?? (async () => ({ ok: true })), trace),
    QUOTA_DO: doNamespace('QUOTA_DO', async () => ({ ok: true }), trace),
    PAIRING_DO: doNamespace('PAIRING_DO', async () => ({ ok: true }), trace),
    ADMIN_DO: doNamespace('ADMIN_DO', async () => ({ ok: true }), trace),
    BUDGET_DO: doNamespace('BUDGET_DO', async () => ({ ok: true }), trace),
  };
  return { env, store, trace };
}

/**
 * The project sessions this request materialised, in order.
 *
 * Narrowed to SESSION_DO rather than "nothing was addressed at all", because the claim being made
 * is about a customer's place: the operational counter on ADMIN_DO is not a tenant boundary, and an
 * assertion that breaks when somebody adds a counter is an assertion people learn to edit.
 */
function sessionsAddressed(b) {
  return b.trace.addressed.filter((a) => a.ns === 'SESSION_DO').map((a) => a.name);
}

async function seedKey(bundleEnv, { mode = 'live', scopes = [...K.API_SCOPES], projects = GRANTED, revoked = false } = {}) {
  const minted = await K.mintKey(mode);
  await K.insertApiKey(bundleEnv.env, {
    id: minted.id, userId: OWNER_ID, mode: minted.mode, name: 'seeded', scopes, projects,
    createdAt: Date.now(), expiresAt: null, lastUsedAt: null, revokedAt: null, hash: minted.hash,
  });
  if (revoked) bundleEnv.store.keys.get(minted.id).revoked_at = Date.now();
  return minted.key;
}

/** One MCP request over HTTP, exactly as a client would send it. */
async function rpc(body, { key, env, version = M.MCP_LATEST_VERSION, method = 'POST', headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', ...headers };
  if (key) h.Authorization = `Bearer ${key}`;
  if (version !== null) h['MCP-Protocol-Version'] = version;
  const res = await APP.fetch(
    new Request('https://golem.test/v1/mcp', {
      method,
      headers: h,
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
    env,
  );
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, res };
}

/** The `_meta` every 2026-07-28 request carries. */
const META = (version = M.MCP_LATEST_VERSION) => ({
  'io.modelcontextprotocol/protocolVersion': version,
  'io.modelcontextprotocol/clientInfo': { name: 'TestClient', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
});

// ===========================================================================
// THE SUBSET — what this surface exposes, and what it refuses to
// ===========================================================================

test('every tool in the agent registry is classified: allowed, or excluded with a reason', () => {
  // THE POINT OF THIS TEST. The exposure filter must be an allowlist whose complement is WRITTEN
  // DOWN, not a denylist. With a denylist, a tool added to the registry next month is exposed by
  // default and nobody has to decide anything. With this, an unclassified tool fails here.
  const registry = T.toolNames();
  assert.ok(registry.length >= 30, `the registry scrape broke — found only ${registry.length} tools`);

  const allowed = new Set(M.MCP_TOOL_NAMES);
  const excluded = M.MCP_EXCLUDED;

  const unclassified = registry.filter((n) => !allowed.has(n) && !Object.hasOwn(excluded, n));
  assert.deepEqual(unclassified, [], 'a tool exists in the registry that the MCP surface neither exposes nor excludes — decide about it in mcp.ts');

  const bothWays = registry.filter((n) => allowed.has(n) && Object.hasOwn(excluded, n));
  assert.deepEqual(bothWays, [], 'a tool is both allowed and excluded');

  const ghosts = [...allowed, ...Object.keys(excluded)].filter((n) => !registry.includes(n));
  assert.deepEqual(ghosts, [], 'mcp.ts classifies a tool the registry does not have');

  for (const [name, reason] of Object.entries(excluded)) {
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length >= 20, `the exclusion reason for ${name} is not a reason: ${JSON.stringify(reason)}`);
  }
});

test('the writing tools are excluded by name — this is the list a reviewer reads', () => {
  // Named explicitly rather than derived, so that "we exposed edit_script" can never be a quiet
  // consequence of a refactor somewhere else.
  for (const name of ['edit_script', 'create_instances', 'set_properties', 'delete_instances', 'run_luau', 'run_and_check', 'insert_asset', 'generate_model', 'install_module', 'create_checkpoint']) {
    assert.equal(M.MCP_TOOL_NAMES.includes(name), false, `${name} writes into a customer's place and must not be on the MCP surface`);
    assert.ok(Object.hasOwn(M.MCP_EXCLUDED, name), `${name} must be excluded with a stated reason`);
  }
});

/**
 * The ops a tool can reach, following the helpers it calls.
 *
 * A scrape that stopped at the tool's own block would be the defect this codebase keeps naming.
 * `review_scripts` sends `dump_scripts` — the op that reads every script in the place — from inside
 * `dumpScripts`, a module-level helper. A block-local scrape sees only the `read_script` on the
 * single-file branch, finds it read-only, and reports a tool as verified without having looked at
 * the branch that does most of its work. That is a failure to observe rendering as an observation.
 */
const TOOL_BOUNDS = [...TOOLS_SRC.matchAll(/^ {2}([a-z_0-9]+): \{$/gm)].map((m) => [m[1], m.index]);
const HELPER_BODIES = (() => {
  const map = new Map();
  const starts = [...TOOLS_SRC.matchAll(/^(?:export )?(?:async )?function ([a-zA-Z_][\w]*)\(/gm)];
  for (const [i, m] of starts.entries()) {
    const end = i + 1 < starts.length ? starts[i + 1].index : TOOLS_SRC.length;
    map.set(m[1], TOOLS_SRC.slice(m.index, end));
  }
  return map;
})();

function opsReachableFrom(source, seen = new Set()) {
  const ops = new Set([...source.matchAll(/\bop: '([a-z_]+)'/g)].map((m) => m[1]));
  for (const m of source.matchAll(/\b([a-zA-Z_][\w]*)\s*\(/g)) {
    const callee = m[1];
    if (seen.has(callee) || !HELPER_BODIES.has(callee)) continue;
    seen.add(callee);
    for (const op of opsReachableFrom(HELPER_BODIES.get(callee), seen)) ops.add(op);
  }
  return ops;
}

test('every exposed tool is either a read-only Studio reader or an explicitly reviewed offline static reader', () => {
  assert.ok(TOOL_BOUNDS.length >= 30, 'the tools.ts scrape broke');
  assert.ok(HELPER_BODIES.has('dumpScripts'), 'the helper scrape broke — it must find dumpScripts');

  for (const [i, [name, start]] of TOOL_BOUNDS.entries()) {
    if (!M.MCP_TOOL_NAMES.includes(name)) continue;
    const end = i + 1 < TOOL_BOUNDS.length ? TOOL_BOUNDS[i + 1][1] : TOOLS_SRC.length;
    const ops = [...opsReachableFrom(TOOLS_SRC.slice(start, end))];
    if (ops.length === 0) {
      assert.ok(M.MCP_OFFLINE_STATIC_TOOLS.includes(name), `${name} is exposed without a Studio op but was never reviewed as offline-static`);
      assert.equal(T.TOOLS[name].studio, false, `${name} is classified offline-static but the registry says it needs Studio`);
      continue;
    }
    assert.equal(M.MCP_OFFLINE_STATIC_TOOLS.includes(name), false, `${name} is classified offline-static but can issue Studio ops`);
    for (const op of ops) {
      assert.ok(
        M.MCP_READ_ONLY_STUDIO_OPS.includes(op),
        `${name} is on the MCP surface but can issue the op '${op}', which is not on the read-only list`,
      );
    }
  }
});

test('the three bounded offline guidance tools are explicitly on MCP and remain non-Studio', () => {
  assert.deepEqual([...M.MCP_OFFLINE_STATIC_TOOLS], [
    'search_creation_skills',
    'read_creation_skill',
    'get_genre_references',
  ]);
  for (const name of M.MCP_OFFLINE_STATIC_TOOLS) {
    assert.ok(M.MCP_TOOL_NAMES.includes(name), `${name} was reviewed as safe but is not published`);
    assert.equal(T.TOOLS[name].studio, false, `${name} unexpectedly became Studio-backed`);
    assert.equal(T.TOOLS[name].studioOps, undefined, `${name} unexpectedly gained Studio operations`);
  }
});

test('the op scrape actually follows helpers — the positive control for the test above', () => {
  // Without this, the guard above could pass by resolving nothing at all. `review_scripts` reaches
  // `dump_scripts` only through `dumpScripts`, so seeing that op proves the traversal ran.
  const i = TOOL_BOUNDS.findIndex(([n]) => n === 'review_scripts');
  assert.ok(i >= 0);
  const body = TOOLS_SRC.slice(TOOL_BOUNDS[i][1], TOOL_BOUNDS[i + 1][1]);
  assert.equal(/\bop: 'dump_scripts'/.test(body), false, 'dump_scripts is now inline — this control no longer proves traversal');
  assert.ok(opsReachableFrom(body).has('dump_scripts'), 'the scrape did not follow dumpScripts, so the guard above measured nothing');
});

test('every exposed tool demands a scope the API actually defines, and a project', () => {
  for (const entry of M.MCP_TOOLS) {
    assert.ok(K.API_SCOPES.includes(entry.scope), `${entry.tool} demands '${entry.scope}', which is not an API scope`);
    assert.equal(entry.needsProject, true, `${entry.tool} must be project-scoped — an ungated door on this surface is one a key's grant does not describe`);
  }
});

// ===========================================================================
// THE PROTOCOL — pure
// ===========================================================================

test('the server speaks the current spec revision, not a deprecated one', () => {
  // 2026-07-28 removed protocol-level sessions and the GET stream. Pinning the newest supported
  // version here means a downgrade cannot be an accident.
  assert.equal(M.MCP_LATEST_VERSION, '2026-07-28');
  assert.equal(M.MCP_SUPPORTED_VERSIONS[0], '2026-07-28', 'the current revision must be offered first');
  assert.ok(M.MCP_SUPPORTED_VERSIONS.includes('2025-11-25'), 'clients still on the initialize handshake have to be able to connect');
});

test('an unsupported protocol version is refused by name, with the supported list', () => {
  const v = M.negotiateVersion('1900-01-01');
  assert.equal(v.ok, false);
  assert.equal(v.code, -32022);
  assert.deepEqual(v.supported, [...M.MCP_SUPPORTED_VERSIONS]);
  assert.equal(v.requested, '1900-01-01');
});

// ===========================================================================
// THE DOOR — behavioural, over real HTTP
// ===========================================================================

test('an unauthenticated MCP call is refused, and the session is never addressed', async () => {
  // THE ASSERTION THIS WHOLE FILE EXISTS FOR. An MCP server that trusts its caller is a hole in
  // the product: the endpoint reaches a customer's live Roblox place.
  const b = makeEnv();
  const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META() } }, { env: b.env });
  assert.equal(res.status, 401, 'an MCP request with no credential must be refused');
  assert.deepEqual(sessionsAddressed(b), [], 'the SessionDO was addressed by an unauthenticated caller');

  // …and the refusal must not have handed back a tool list anyway.
  assert.equal(res.json?.result?.tools, undefined, 'a refused call returned a tool list');
});

test('a well-formed key that was never issued is refused, and the session is never addressed', async () => {
  // FOUND BY FALSIFICATION, and it is the case the other credential tests leave uncovered. There
  // are two independent refusals in front of this endpoint: the parser rejects a string that is not
  // shaped like a key, and the storage lookup rejects a well-shaped key nobody ever minted. A
  // malformed credential only ever exercises the FIRST, so with the second deleted every existing
  // assertion here still passed — the surface had a gate no test was holding.
  //
  // This is the credential an attacker actually presents: `gk_live_` plus the right number of hex
  // digits costs nothing to generate, and is indistinguishable from a real key until it is looked up.
  const b = makeEnv();
  const wellFormedButUnissued = `gk_live_${'a'.repeat(24)}_${'b'.repeat(48)}`;
  assert.notEqual(K.parseApiKey(wellFormedButUnissued), null, 'this test must present a key that PASSES the parser');

  const res = await rpc(
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META() } },
    { env: b.env, key: wellFormedButUnissued },
  );
  assert.equal(res.status, 401, 'a syntactically valid key that was never minted must still be refused');
  assert.equal(res.json?.result?.tools, undefined, 'an unissued key was handed the tool list');
  assert.deepEqual(sessionsAddressed(b), [], 'the SessionDO was addressed by a key that does not exist');
});

test('a malformed credential and a revoked key are both refused', async () => {
  const b = makeEnv();
  const bad = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META() } }, { env: b.env, key: 'not-a-golem-key' });
  assert.equal(bad.status, 401);

  const revoked = await seedKey(b, { revoked: true });
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META() } }, { env: b.env, key: revoked });
  assert.equal(r.status, 401);
  assert.equal(r.json?.error?.code, 'revoked_api_key');
  assert.deepEqual(sessionsAddressed(b), []);
});

test('server/discover answers with identity, capabilities and the versions it speaks', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  const res = await rpc({ jsonrpc: '2.0', id: 'd1', method: 'server/discover', params: { _meta: META() } }, { env: b.env, key });
  assert.equal(res.status, 200);
  assert.equal(res.json.jsonrpc, '2.0');
  assert.equal(res.json.id, 'd1');
  assert.equal(res.json.result.resultType, 'complete');
  assert.deepEqual(res.json.result.supportedVersions, [...M.MCP_SUPPORTED_VERSIONS]);
  assert.ok(res.json.result.capabilities.tools, 'a server that lists tools must declare the tools capability');
  assert.ok(res.json.result._meta['io.modelcontextprotocol/serverInfo'].name);
});

test('the legacy initialize handshake still works, because that is what clients send today', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  const res = await rpc(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Legacy', version: '1' } } },
    { env: b.env, key, version: null },
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.result.protocolVersion, '2025-11-25');
  assert.ok(res.json.result.capabilities.tools);
  assert.ok(res.json.result.serverInfo.name);

  // The notification that follows it is acknowledged and carries no body.
  const note = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, { env: b.env, key, version: null });
  assert.equal(note.status, 202);
  assert.equal(note.text, '');
});

test('tools/list is exactly the decided subset — no writer appears on it', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: META() } }, { env: b.env, key });
  assert.equal(res.status, 200);
  const names = res.json.result.tools.map((t) => t.name);
  assert.deepEqual([...names].sort(), [...M.MCP_TOOL_NAMES].sort());
  for (const forbidden of ['edit_script', 'run_luau', 'insert_asset', 'delete_instances']) {
    assert.equal(names.includes(forbidden), false, `${forbidden} is on the wire`);
  }
  // Every entry is usable: a name, a description and a schema that asks for the project.
  for (const t of res.json.result.tools) {
    assert.ok(t.description.length > 10, `${t.name} has no description`);
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.inputSchema.properties.project_id, `${t.name} does not ask which project it acts on`);
    assert.ok(t.inputSchema.required.includes('project_id'), `${t.name} treats the project as optional`);
  }
});

test('the tool list is generated from the agent registry, so the two cannot drift', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: META() } }, { env: b.env, key });
  const defs = new Map(T.toolDefs(true).map((d) => [d.name, d]));
  for (const t of res.json.result.tools) {
    assert.ok(defs.has(t.name), `${t.name} is published but is not a registry tool`);
    assert.equal(t.description, defs.get(t.name).description, `${t.name}'s description was re-typed rather than taken from the registry`);
  }
});

test('tools/call reaches the granted project and returns what the session returned', async () => {
  const b = makeEnv({
    session: async ({ path, body }) => {
      if (path === '/mcp-tool') {
        assert.equal(body.tool, 'get_project_tree');
        return { ok: true, summary: '✓ get_project_tree', resultForLlm: '{"children":["Workspace"]}' };
      }
      return { ok: true };
    },
  });
  const key = await seedKey(b);
  const res = await rpc(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_project_tree', arguments: { project_id: PROJECT_ID }, _meta: META() } },
    { env: b.env, key },
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.result.isError, false);
  assert.equal(res.json.result.content[0].type, 'text');
  assert.match(res.json.result.content[0].text, /Workspace/);
  assert.deepEqual(sessionsAddressed(b), [PROJECT_ID], 'the call addressed a session other than the granted project');
});

test('offline guidance MCP calls keep the project authorization anchor and strip project_id before the registry tool', async () => {
  const seen = [];
  const b = makeEnv({
    session: async ({ path, body }) => {
      if (path === '/mcp-tool') {
        seen.push(body);
        return { ok: true, summary: `✓ ${body.tool}`, resultForLlm: '{"ok":true}' };
      }
      return { ok: true };
    },
  });
  const key = await seedKey(b);
  const calls = [
    ['search_creation_skills', { query: 'responsive HUD' }],
    ['read_creation_skill', { id: 'ui-responsive-hud-anchors' }],
    ['get_genre_references', { genre: 'horror', aspect: 'lighting' }],
  ];
  for (const [name, args] of calls) {
    const res = await rpc(
      { jsonrpc: '2.0', id: name, method: 'tools/call', params: { name, arguments: { project_id: PROJECT_ID, ...args }, _meta: META() } },
      { env: b.env, key },
    );
    assert.equal(res.status, 200, `${name} was not served`);
    assert.equal(res.json.result.isError, false, `${name} returned a tool error`);
  }
  assert.deepEqual(seen.map((call) => call.tool), calls.map(([name]) => name));
  for (const call of seen) assert.equal(Object.hasOwn(call.args, 'project_id'), false, 'project_id leaked into registry tool arguments');
  assert.deepEqual(sessionsAddressed(b), [PROJECT_ID, PROJECT_ID, PROJECT_ID]);
});

test('a tool that failed comes back as isError, never as a successful empty result', async () => {
  const b = makeEnv({
    session: async () => ({ ok: false, summary: '✗ get_project_tree', resultForLlm: '{"error":"Studio is not connected."}' }),
  });
  const key = await seedKey(b);
  const res = await rpc(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_project_tree', arguments: { project_id: PROJECT_ID }, _meta: META() } },
    { env: b.env, key },
  );
  assert.equal(res.json.result.isError, true);
  assert.match(res.json.result.content[0].text, /not connected/);
});

test('a project the key was not granted is refused, and that session is never addressed', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  const res = await rpc(
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_project_tree', arguments: { project_id: OTHER_PROJECT_ID }, _meta: META() } },
    { env: b.env, key },
  );
  assert.equal(res.json.error.data.code, 'project_not_granted');
  assert.deepEqual(sessionsAddressed(b), [], 'an ungranted project id materialised a SessionDO');
  // Not an isError tool result: a credential refusal is not something a model should retry around.
  assert.equal(res.json.result, undefined);
});

test('a key without projects:read cannot call a read tool, and the session is never addressed', async () => {
  const b = makeEnv();
  const key = await seedKey(b, { scopes: ['chat:write'] });
  const res = await rpc(
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_project_tree', arguments: { project_id: PROJECT_ID }, _meta: META() } },
    { env: b.env, key },
  );
  assert.equal(res.json.error.data.code, 'insufficient_scope');
  assert.deepEqual(sessionsAddressed(b), []);
});

test('a project with no session yet is a tool error, not a permission refusal', async () => {
  // The SessionDO answers 400 "session not initialized" for a project nobody has opened. Reporting
  // that as a credential problem would send the caller to look at their API key for something that
  // is about their Studio; reporting it as a tool error puts the true sentence in front of them.
  const b = makeEnv({ session: async () => ({ __status: 400, error: 'session not initialized' }) });
  const key = await seedKey(b);
  const res = await rpc(
    { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_scripts', arguments: { project_id: PROJECT_ID }, _meta: META() } },
    { env: b.env, key },
  );
  assert.equal(res.json.error, undefined, 'a project with no session must not read as a permission refusal');
  assert.equal(res.json.result.isError, true);
  assert.match(res.json.result.content[0].text, /session not initialized/);
});

test('the session refusing a tool by its own allowlist IS a permission refusal', async () => {
  // The other half: a 403 out of the second boundary is not something a model should retry around.
  const b = makeEnv({ session: async () => ({ __status: 403, error: 'edit_script is not on the MCP surface.' }) });
  const key = await seedKey(b);
  const res = await rpc(
    { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'list_scripts', arguments: { project_id: PROJECT_ID }, _meta: META() } },
    { env: b.env, key },
  );
  assert.equal(res.json.result, undefined);
  assert.equal(res.json.error.data.code, 'tool_not_on_surface');
});

test('a tool that is off the surface cannot be called through it', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  for (const name of ['edit_script', 'run_luau', 'nonexistent_tool']) {
    const res = await rpc(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: { project_id: PROJECT_ID, path: 'x', source: 'y' }, _meta: META() } },
      { env: b.env, key },
    );
    assert.equal(res.json.error.code, -32602, `${name} was not refused as an unknown tool`);
    assert.deepEqual(sessionsAddressed(b), [], `${name} reached a session`);
  }
});

test('the session re-checks the allowlist rather than running whatever it is handed', () => {
  // `/run-tool` in the SessionDO forwards any tool name; it is admin-gated. The MCP channel gets
  // its own path that enforces the same allowlist a second time, because the difference between
  // the two paths IS the security boundary — the precedent is /studio-op versus /companion-op.
  const route = SESSION_SRC.slice(SESSION_SRC.indexOf("path === '/mcp-tool'"), SESSION_SRC.indexOf("path === '/studio-op'"));
  assert.ok(route.length > 50, 'the SessionDO has no /mcp-tool route');
  assert.match(route, /MCP_TOOL_NAMES/, 'the MCP session route does not check the allowlist');
  assert.ok(route.indexOf('MCP_TOOL_NAMES') < route.indexOf('runTool'), 'the allowlist is checked after the tool already ran');
});

// ===========================================================================
// TRANSPORT — the current revision's rules
// ===========================================================================

test('GET and DELETE are 405: this endpoint does not implement the deprecated SSE transport', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  for (const method of ['GET', 'DELETE']) {
    const res = await rpc(undefined, { env: b.env, key, method });
    assert.equal(res.status, 405, `${method} /v1/mcp should be 405, not ${res.status}`);
  }
});

test('a protocol version header that contradicts the body is a 400, not a guess', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  const res = await rpc(
    { jsonrpc: '2.0', id: 8, method: 'tools/list', params: { _meta: META('2025-11-25') } },
    { env: b.env, key, version: '2026-07-28' },
  );
  assert.equal(res.status, 400);
  assert.match(String(res.json.error.message), /version/i);
  // -32020 is the spec's HeaderMismatch, and the code is the part a CLIENT acts on: 2026-07-28
  // tells clients to refresh a tool's inputSchema and retry when they see it. Reporting a generic
  // -32600 describes the same fact in a dialect no client recognises, so the prescribed recovery
  // never runs.
  assert.equal(res.json.error.code, M.RPC.headerMismatch, 'a header/body disagreement must be reported as HeaderMismatch');
});

// ===========================================================================
// HEADERS AND BODY MUST AGREE
// ===========================================================================
// WHY THIS IS A SECURITY TEST AND NOT A CONFORMANCE ONE. 2026-07-28 makes `Mcp-Method` and
// `Mcp-Name` standard request headers that restate what the body already says, and requires the
// server to validate them against it — because anything between the client and this worker may
// read the HEADER while the worker acts on the BODY. A proxy, a WAF or a gateway rule that allows
// `Mcp-Method: tools/list` through would, against a server that never compares the two, be
// allowing a `tools/call` in the body it never inspected. Two sources of truth that are permitted
// to disagree mean the one doing the enforcing is not the one doing the work.
//
// The headers are validated WHEN PRESENT rather than demanded. Absence cannot create the
// disagreement this guards — nothing upstream can have keyed off a header that was not sent — and
// the endpoint still answers the handshake-based revisions, whose clients send neither.

test('an Mcp-Method header that disagrees with the body is refused, and nothing runs', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  // The shape that matters: a gateway sees the innocent `tools/list` in the header, the worker
  // would otherwise act on the `tools/call` in the body.
  const res = await rpc(
    {
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: { name: 'get_output_logs', arguments: { project_id: PROJECT_ID }, _meta: META() },
    },
    { env: b.env, key, headers: { 'Mcp-Method': 'tools/list' } },
  );
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, M.RPC.headerMismatch);
  assert.match(String(res.json.error.message), /Mcp-Method/);
  assert.deepEqual(sessionsAddressed(b), [], 'the call was served before the headers were checked');
});

test('an Mcp-Name header that disagrees with the called tool is refused, and nothing runs', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  const res = await rpc(
    {
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: { name: 'get_output_logs', arguments: { project_id: PROJECT_ID }, _meta: META() },
    },
    { env: b.env, key, headers: { 'Mcp-Method': 'tools/call', 'Mcp-Name': 'list_scripts' } },
  );
  assert.equal(res.status, 400);
  assert.equal(res.json.error.code, M.RPC.headerMismatch);
  assert.match(String(res.json.error.message), /Mcp-Name/);
  assert.deepEqual(sessionsAddressed(b), [], 'the call was served before the headers were checked');
});

test('headers that agree with the body are served normally', async () => {
  const b = makeEnv({ session: async ({ path }) => (path === '/mcp-tool' ? { ok: true, resultForLlm: '{"lines":[]}' } : { ok: true }) });
  const key = await seedKey(b);
  const res = await rpc(
    {
      jsonrpc: '2.0',
      id: 32,
      method: 'tools/call',
      params: { name: 'get_output_logs', arguments: { project_id: PROJECT_ID }, _meta: META() },
    },
    { env: b.env, key, headers: { 'Mcp-Method': 'tools/call', 'Mcp-Name': 'get_output_logs' } },
  );
  assert.equal(res.status, 200);
  assert.equal(res.json.result.isError, false, 'a request whose headers restate the body must not be refused');
  assert.deepEqual(sessionsAddressed(b), [PROJECT_ID]);
});

test('a non-ASCII Mcp-Name is compared after the spec\'s base64 decoding, not byte-for-byte', () => {
  // Clients must send a sentinel-encoded value when the name is not plain ASCII. A server that
  // compared the raw header against the body would reject every such call as a mismatch — a
  // refusal caused by the encoding rather than by any disagreement.
  assert.equal(M.decodeHeaderValue('=?B?' + Buffer.from('café_tool', 'utf8').toString('base64') + '?='), 'café_tool');
  assert.equal(M.decodeHeaderValue('plain_tool'), 'plain_tool');
});

test('an unknown protocol version is refused with -32022 and the list of supported ones', async () => {
  const b = makeEnv();
  const key = await seedKey(b);
  const res = await rpc(
    { jsonrpc: '2.0', id: 9, method: 'tools/list', params: { _meta: META('1900-01-01') } },
    { env: b.env, key, version: '1900-01-01' },
  );
  assert.equal(res.json.error.code, -32022);
  assert.deepEqual(res.json.error.data.supported, [...M.MCP_SUPPORTED_VERSIONS]);
});

test('malformed JSON, a non-JSON-RPC body and a batch are each refused distinctly', async () => {
  const b = makeEnv();
  const key = await seedKey(b);

  const parse = await rpc('{not json', { env: b.env, key });
  assert.equal(parse.json.error.code, -32700);

  const shape = await rpc({ hello: 'world' }, { env: b.env, key });
  assert.equal(shape.json.error.code, -32600);

  // JSON-RPC batching was removed from MCP in 2025-06-18. Accepting an array would be implementing
  // a transport feature the spec dropped.
  const batch = await rpc([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }], { env: b.env, key });
  assert.equal(batch.json.error.code, -32600);

  const unknown = await rpc({ jsonrpc: '2.0', id: 1, method: 'resources/list', params: { _meta: META() } }, { env: b.env, key });
  assert.equal(unknown.json.error.code, -32601);
});

// ===========================================================================
// STANDING INVARIANTS
// ===========================================================================

test('the MCP routes are in the published route table, like every other /v1 route', () => {
  const declared = P.PUBLIC_ROUTES.filter((r) => r.path === '/v1/mcp');
  assert.deepEqual(declared.map((r) => r.method).sort(), ['DELETE', 'GET', 'POST']);
  // `scope: null` on the POST is deliberate and has to stay deliberate: the real scope demand is
  // per-tool and enforced inside, which the next test pins down.
  assert.equal(declared.find((r) => r.method === 'POST').scope, null);
});

test('the per-tool scope check is not optional — tools/call runs authorizeKey', () => {
  // The route table demands no scope for POST /v1/mcp because one path multiplexes many
  // operations. That is only safe while the handler asks authorizeKey for each call, with the
  // tool's own scope and the project id out of the ARGUMENTS.
  const handler = INDEX_SRC.slice(INDEX_SRC.indexOf("app.post('/v1/mcp'"), INDEX_SRC.indexOf("app.get('/v1/mcp'"));
  assert.ok(handler.length > 100, 'the /v1/mcp handler was not found where this test looks for it');
  assert.match(handler, /authorizeKey\(/, 'tools/call does not re-authorise per tool');
  assert.match(handler, /grantedProjectStub\(/, 'the handler resolves a session without the grant check');
  assert.equal(/\bsessionStub\(/.test(handler), false, 'the MCP handler addresses a session directly');
});

test('nothing in this file ever contacted a network', () => {
  const offNetwork = everFetched.filter((u) => !u.includes('golem.test') && !u.includes('supa.golem.test'));
  assert.deepEqual(offNetwork, [], `the MCP surface reached out: ${offNetwork.join(', ')}`);
});
