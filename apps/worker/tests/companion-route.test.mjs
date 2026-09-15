/**
 * THE COMPANION ROUTE, DRIVEN AS A REAL HTTP SURFACE.
 *
 * `POST /api/projects/:id/studio/op` is what the Studio companion panel talks to: one
 * direct-manipulation op, a person's own click, forwarded to their own Studio. It is the
 * first route in this worker that lets a BROWSER address the plugin without going through
 * the agent, so the two questions it has to answer correctly are which ops it carries and
 * which callers may send them.
 *
 * WHY THIS IS NOT A STATIC CHECK. `companion.ts` is unit-tested on its own, and a regex
 * over index.ts would only prove that the words appear near each other. What is asserted
 * here is the WIRING: the real Hono app is bundled and driven with a real ES256 identity,
 * a real JWKS, and a fake edge that records every Durable Object it is asked to address.
 * "Refused" and "forwarded" are therefore separable facts — a refusal that still reached
 * the plugin would pass a test that only looked at the status code.
 *
 * The harness is the one packages/evals/src/security.test.mjs established, trimmed to the
 * bindings this route touches.
 *
 *   node --test apps/worker/tests/companion-route.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');
const TMP = mkdtempSync(join(tmpdir(), 'companion-route-'));

// `cloudflare:workers` has no Node implementation; the only thing the entry module needs
// from it is the DurableObject base class.
const CF_SHIM = join(TMP, 'cf-workers-shim.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');

const bundleOut = join(TMP, 'worker.mjs');
execFileSync(
  ESBUILD,
  [
    join(WORKER, 'src', 'index.ts'),
    '--bundle',
    '--format=esm',
    '--target=es2022',
    `--alias:cloudflare:workers=${CF_SHIM}`,
    `--outfile=${bundleOut}`,
  ],
  { stdio: 'pipe', cwd: WORKER },
);
const APP = (await import(`file://${bundleOut}`)).default;

// ------------------------------------------------------------------ a real identity

const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');

const SUPABASE_URL = 'https://supa.companion.test';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const VIEWER_ID = '22222222-2222-4222-8222-222222222222';
const EDITOR_ID = '33333333-3333-4333-8333-333333333333';
const STRANGER_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const JWKS = { keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'companion-test', alg: 'ES256', use: 'sig' }] };

async function mintJwt(sub) {
  return new jose.SignJWT({ email: `${sub}@companion.test`, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'companion-test' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}
const JWT = {
  owner: await mintJwt(OWNER_ID),
  viewer: await mintJwt(VIEWER_ID),
  editor: await mintJwt(EDITOR_ID),
  stranger: await mintJwt(STRANGER_ID),
};

// ------------------------------------------------------------------ the fake edge

const PROJECT_ROW = {
  id: PROJECT_ID,
  owner_id: OWNER_ID,
  name: 'Test Place',
  place_name: null,
  memory_summary: null,
  memory_facts: [],
};

/** Grants PostgREST will hand back for the caller currently under test. */
let grantsFor = {};
/** Every Durable Object request the route made, and every namespace it addressed. */
let trace;

function resetTrace() {
  trace = { addressed: [], doCalls: [] };
}
resetTrace();

function doNamespace(name, handler) {
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
          trace.doCalls.push({ ns: name, path, body });
          return new Response(JSON.stringify(await handler({ path, body })), {
            headers: { 'Content-Type': 'application/json' },
          });
        },
      };
    },
  };
}

function makeEnv() {
  return {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: 'anon-key',
    ADMIN_KEY: 'admin-key',
    ENVIRONMENT: 'test',
    KV: { get: async () => null, put: async () => {}, list: async () => ({ keys: [] }) },
    SESSION_DO: doNamespace('SESSION_DO', async ({ path }) => {
      if (path === '/init') return { ok: true };
      if (path === '/companion-op') return { id: 'op_1', ok: true, data: { reached: true } };
      return { ok: true };
    }),
    QUOTA_DO: doNamespace('QUOTA_DO', async () => ({ sparksRemaining: 10, sparksLimit: 20, plan: 'free', day: '2026-09-15' })),
    PAIRING_DO: doNamespace('PAIRING_DO', async () => ({ ok: true })),
    ADMIN_DO: doNamespace('ADMIN_DO', async () => ({ ok: true })),
    BUDGET_DO: doNamespace('BUDGET_DO', async () => ({ ok: true })),
  };
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const headers = new Headers((typeof input === 'string' ? init?.headers : input.headers) ?? init?.headers ?? {});
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

  if (url.includes('/.well-known/jwks.json')) return json(JWKS);
  if (url.includes('/rest/v1/projects')) {
    // getOwnedProject filters by owner_id; getProjectAccess does not. Answering the
    // owner-filtered query for a non-owner would make every caller an owner and quietly
    // delete the distinction these tests exist to measure.
    const ownerFiltered = /owner_id=eq\.([0-9a-f-]+)/i.exec(url);
    if (ownerFiltered) return json(ownerFiltered[1] === OWNER_ID ? [PROJECT_ROW] : []);
    return json([PROJECT_ROW]);
  }
  if (url.includes('/rest/v1/project_members')) {
    const who = /user_id=eq\.([0-9a-f-]+)/i.exec(url)?.[1];
    const role = grantsFor[who];
    const auth = headers.get('Authorization');
    assert.ok(auth, 'PostgREST must always be called with the caller\'s own JWT');
    return json(
      role
        ? [{ user_id: who, role, display_name: null, invited_by: OWNER_ID, created_at: null, expires_at: null, revoked_at: null }]
        : [],
    );
  }
  return json([]);
};

/** POST one companion op as `who`, and report both the answer and what reached the edge. */
async function companionOp(op, { who = 'owner', timeoutMs, projectId = PROJECT_ID } = {}) {
  resetTrace();
  const headers = { 'Content-Type': 'application/json' };
  if (who) headers.Authorization = `Bearer ${JWT[who]}`;
  const res = await APP.fetch(
    new Request(`https://golem.test/api/projects/${projectId}/studio/op`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ op, timeoutMs }),
    }),
    makeEnv(),
  );
  const body = await res.json().catch(() => null);
  return {
    status: res.status,
    body,
    forwarded: trace.doCalls.filter((c) => c.path === '/companion-op'),
    sessionAddressed: trace.addressed.filter((a) => a.ns === 'SESSION_DO'),
  };
}

const MOVE = { op: 'transform_instances', paths: ['game.Workspace.Crate'], move: [1, 0, 0] };

test.beforeEach(() => {
  grantsFor = {};
});

// ========================================================================== admission

test('the route exists and carries a companion op through to the plugin channel', () => {
  // The non-vacuity test. Every refusal below is only meaningful because this passes.
  return companionOp(MOVE).then((r) => {
    assert.equal(r.status, 200);
    assert.equal(r.forwarded.length, 1, 'exactly one op reached the session DO');
    assert.equal(r.forwarded[0].body.op.op, 'transform_instances');
    assert.deepEqual(r.forwarded[0].body.op.move, [1, 0, 0], 'and it arrived intact');
  });
});

test('RUN_CODE IS REFUSED, and nothing at all reaches the plugin', async () => {
  //[[ The whole point of a second channel having its own allowlist. `run_code` on the
  //   tool path is filtered by `refuseLuauIngress`; this route runs no such filter, so it
  //   must not carry it. A 400 that still forwarded the op would be a refusal in the
  //   response body and an execution in the user's place. ]]
  const r = await companionOp({ op: 'run_code', code: 'while true do end', timeoutMs: 1000 });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /run_code/);
  assert.deepEqual(r.forwarded, [], 'nothing may reach the Durable Object');
});

test('every asset-bearing and source-bearing op is refused before the DO is even addressed', async () => {
  for (const op of [
    { op: 'edit_script', path: 'game.Workspace.S', source: 'print(1)' },
    { op: 'create_instances', items: [] },
    { op: 'set_props', path: 'game.Workspace.P', props: {} },
    { op: 'insert_asset', assetId: 12345, parent: 'game.Workspace' },
    { op: 'generate_model', prompt: 'a crate', parent: 'game.Workspace' },
    { op: 'restore', root: 'game', snapshot: {} },
    { op: 'render_view', view: 'hero' },
  ]) {
    const r = await companionOp(op);
    assert.equal(r.status, 400, `${op.op} must be refused`);
    assert.deepEqual(r.forwarded, [], `${op.op} must not reach the DO`);
    // Stronger than "not forwarded": an unauthorised op must not even cause the session
    // Durable Object to be materialised.
    assert.deepEqual(r.sessionAddressed, [], `${op.op} must not address the session DO at all`);
  }
});

test('an unknown op is refused rather than passed through as JSON', async () => {
  const r = await companionOp({ op: 'drop_everything', paths: [] });
  assert.equal(r.status, 400);
  assert.deepEqual(r.forwarded, []);
});

test('a request with no op at all is refused without a crash', async () => {
  const r = await companionOp(undefined);
  assert.equal(r.status, 400);
  assert.deepEqual(r.forwarded, []);
});

test('verifiedAssetIds inside the op does not survive the route', async () => {
  // Asserted on the FORWARDED op, not on the envelope: the first attempt at this fix on
  // the admin route rebuilt the envelope and left the field untouched inside `op`.
  const r = await companionOp({ ...MOVE, verifiedAssetIds: [12345] });
  assert.equal(r.status, 200);
  assert.equal(r.forwarded.length, 1);
  assert.equal('verifiedAssetIds' in r.forwarded[0].body.op, false);
  assert.equal(r.forwarded[0].body.op.op, 'transform_instances', 'and the op itself still arrived');
});

// ======================================================================= who may act

test('an unauthenticated caller gets 401 and addresses nothing', async () => {
  const r = await companionOp(MOVE, { who: null });
  assert.equal(r.status, 401);
  assert.deepEqual(r.sessionAddressed, []);
});

test('a stranger with a valid token gets 404 and addresses nothing', async () => {
  const r = await companionOp(MOVE, { who: 'stranger' });
  assert.equal(r.status, 404);
  assert.deepEqual(r.forwarded, []);
  assert.deepEqual(r.sessionAddressed, [], 'a caller with no access must not materialise the project DO');
});

test('THE COMPANION IS OWNER-ONLY: a granted collaborator is refused, whatever their role', async () => {
  //[[ The conservative half of the decision, asserted so it is a DECISION and not a gap.
  //
  //   The route drives somebody's open Studio. `withOwnedProject` can take a collab action —
  //   the machinery for "a viewer may inspect, an editor may act" exists — and this route
  //   deliberately does not use it yet: widening the companion to shared collaborators belongs
  //   in the same change that teaches the project-route guard about the action argument.
  //
  //   Both halves are checked, because "an editor is refused" alone would also be true of a
  //   route that was simply broken for everyone. ]]
  grantsFor = { [VIEWER_ID]: 'viewer', [EDITOR_ID]: 'editor' };

  for (const who of ['viewer', 'editor']) {
    const read = await companionOp({ op: 'get_tree', maxDepth: 2 }, { who });
    assert.equal(read.status, 404, `a ${who} may not drive the companion today`);
    assert.deepEqual(read.forwarded, [], `and nothing a ${who} sends reaches the plugin`);

    const build = await companionOp({ op: 'delete_instances', paths: ['game.Workspace.Crate'] }, { who });
    assert.equal(build.status, 404, `a ${who} certainly may not delete`);
    assert.deepEqual(build.forwarded, []);
  }
});

test('the owner may drive both halves of the allowlist', async () => {
  // Non-vacuity for the refusals above: the same two ops, from the owner, go through.
  const read = await companionOp({ op: 'get_tree', maxDepth: 2 });
  assert.equal(read.status, 200);
  assert.equal(read.forwarded.length, 1);
  const build = await companionOp({ op: 'run_mode', action: 'restart' });
  assert.equal(build.status, 200);
  assert.equal(build.forwarded[0].body.op.action, 'restart');
});

test('a malformed project id is refused without addressing a Durable Object', async () => {
  const r = await companionOp(MOVE, { projectId: 'not-a-uuid' });
  assert.equal(r.status, 404);
  assert.deepEqual(r.sessionAddressed, []);
});

test('the caller may ask for a shorter timeout and it travels with the op', async () => {
  const r = await companionOp(MOVE, { timeoutMs: 3000 });
  assert.equal(r.status, 200);
  assert.equal(r.forwarded[0].body.timeoutMs, 3000);
});
