/**
 * A PERMISSION CHANGE, APPLIED TO THE TAB THAT IS ALREADY OPEN.
 *
 * The HTTP half of this was correct and is proved elsewhere: every shared route re-resolves
 * membership on every request, and collab-routes.test.mjs drives "a REVOKED member is a stranger
 * again, on the next request". A WEBSOCKET MAKES NO NEXT REQUEST. The role was decided once at the
 * handshake, frozen into the socket attachment, and every later frame is gated against that frozen
 * value — so a member who was removed, suspended or demoted kept every capability they held until
 * they happened to reload the page. For a workspace tab, that is indefinitely.
 *
 * Nothing in the product closed that gap: `grep ws.close` across do/session.ts found exactly one
 * call ("project deleted"), and the membership routes never spoke to the Durable Object at all.
 *
 * So this file drives the Durable Object itself, with real sockets carrying real attachments, and
 * asks what the socket can DO after the change rather than what an object says about it.
 *
 * Run with:  node --test tests/collab-access-change.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'access-change-')), 'session.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [
    join(WORKER, 'src', 'do', 'session.ts'),
    '--bundle',
    '--format=esm',
    '--target=es2022',
    '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
    '--outfile=' + out,
  ],
  { cwd: WORKER, stdio: 'pipe' },
);
const { SessionDO } = await import(`file://${out}`);

const OWNER = 'u-owner';
const MEMBER = 'u-member';
const OTHER = 'u-other';

/** One attached client socket, with the attachment production gives it. */
function socket(userId, role) {
  let attachment = { userId, role, connectionId: `c-${userId}`, activity: 'viewing', lastSeenMs: Date.now() };
  const sent = [];
  const closes = [];
  return {
    userId,
    sent,
    closes,
    get role() {
      return attachment?.role ?? null;
    },
    ws: {
      readyState: 1,
      send: (d) => sent.push(JSON.parse(d)),
      close: (code, reason) => closes.push({ code, reason }),
      deserializeAttachment: () => attachment,
      serializeAttachment: (v) => {
        attachment = v;
      },
    },
  };
}

function session(sockets) {
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Proj', ownerId: OWNER }]]);
  const ctx = {
    storage: {
      async get(k) {
        return store.get(k);
      },
      async put(a, b) {
        if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v);
        else store.set(a, b);
      },
      async delete(k) {
        store.delete(k);
      },
      async list() {
        return new Map();
      },
      setAlarm() {},
      getAlarm() {
        return null;
      },
      sql: { exec: () => ({ toArray: () => [], one: () => null }) },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => sockets.map((s) => s.ws),
    acceptWebSocket() {},
  };
  const doStub = (body) => ({ idFromName: () => 'id', get: () => ({ fetch: async () => Response.json(body) }) });
  const env = {
    AI: { run: async () => ({ response: 'ok' }) },
    QUOTA_DO: doStub({ ok: true, allowed: true, remaining: 100, credits: 100, plan: 'free' }),
    BUDGET_DO: doStub({ ok: true, reserved: 10, state: { killed: false } }),
    ADMIN_DO: doStub({ ok: true }),
  };
  const s = new SessionDO(ctx, env);
  return {
    store,
    async accessChanged(body) {
      const res = await s.fetch(new Request('https://do/collab/access-changed', { method: 'POST', body: JSON.stringify(body) }));
      return { status: res.status, json: await res.json() };
    },
    async chat(from, text = 'build a house') {
      try {
        await s.webSocketMessage(from.ws, JSON.stringify({ type: 'chat', text, mode: 'clay' }));
      } catch {
        /* downstream stubs */
      }
      return { agent: store.get('agent'), errors: from.sent.filter((m) => m.type === 'error') };
    },
  };
}

// =============================================================================================

test('CONTROL: an editor on an open socket can start a run', async () => {
  // Without this the refusals below could all be a dead harness, which is the shape that makes a
  // permission test pass by doing nothing at all.
  const editor = socket(MEMBER, 'editor');
  const s = session([editor]);
  const { agent, errors } = await s.chat(editor);
  assert.ok(agent, 'the editor must be able to build before anything is changed');
  assert.deepEqual(errors, []);
});

test('A DEMOTION REACHES THE SOCKET: the next chat frame is refused by the role it now holds', async () => {
  const editor = socket(MEMBER, 'editor');
  const s = session([editor]);

  const applied = await s.accessChanged({ userId: MEMBER, role: 'viewer' });
  assert.equal(applied.status, 200);
  assert.deepEqual(applied.json, { matched: 1, closed: 0, demoted: 1 });
  assert.equal(editor.role, 'viewer', 'the attachment every later frame is gated against was rewritten');

  const { agent, errors } = await s.chat(editor);
  assert.equal(agent, undefined, 'a viewer must not start a run on a socket opened as an editor');
  assert.ok(
    errors.some((e) => e.code === 'forbidden'),
    'and must be told why, on their own socket',
  );
  // The tab is told at the moment of the change, not only when it next presses something.
  assert.ok(
    editor.sent.some((m) => m.type === 'error' && m.code === 'role_changed'),
    'the socket is told its role changed',
  );
});

test('A REMOVAL CLOSES THE SOCKET, because there is no lesser role to hold', async () => {
  const member = socket(MEMBER, 'editor');
  const s = session([member]);
  const applied = await s.accessChanged({ userId: MEMBER, role: null });
  assert.deepEqual(applied.json, { matched: 1, closed: 1, demoted: 0 });
  assert.deepEqual(member.closes, [{ code: 1008, reason: 'access changed' }]);
});

test('A ROLE THIS BUILD CANNOT READ IS A REMOVAL, not a role left as it was', async () => {
  // The direction that must never be the default: an unreadable value leaving the socket at the
  // capabilities it already had is a permission change that silently did not happen.
  for (const hostile of ['superuser', 'Editor', '', 7, {}, []]) {
    const member = socket(MEMBER, 'editor');
    const s = session([member]);
    await s.accessChanged({ userId: MEMBER, role: hostile });
    assert.deepEqual(member.closes, [{ code: 1008, reason: 'access changed' }], `role ${JSON.stringify(hostile)} must close the socket`);
  }
});

test('NOBODY ELSE IS TOUCHED — one person changed, one socket changed', async () => {
  const member = socket(MEMBER, 'editor');
  const other = socket(OTHER, 'editor');
  const s = session([member, other]);
  await s.accessChanged({ userId: MEMBER, role: 'viewer' });
  assert.equal(other.role, 'editor', "a colleague's role is not collateral");
  assert.deepEqual(other.closes, []);
  const { agent } = await s.chat(other);
  assert.ok(agent, 'and they can still build');
});

test("THE OWNER'S ROLE IS THE PROJECT ROW, and no membership push can move it", async () => {
  const owner = socket(OWNER, 'owner');
  const s = session([owner]);
  const applied = await s.accessChanged({ userId: OWNER, role: 'viewer' });
  assert.equal(applied.status, 400);
  assert.equal(applied.json.error, 'owner_is_not_a_member');
  assert.equal(owner.role, 'owner');
  assert.deepEqual(owner.closes, []);
});

test('a push naming nobody is refused, and a push naming somebody absent says so', async () => {
  const member = socket(MEMBER, 'editor');
  const s = session([member]);
  for (const bad of [{}, { userId: '' }, { userId: 7 }, { userId: null }]) {
    const res = await s.accessChanged(bad);
    assert.equal(res.status, 400, `${JSON.stringify(bad)} must be refused`);
  }
  // "Nobody was connected" is a real and common answer. It must be reported as a count rather
  // than as an unconditional success, so the route can say what it actually did.
  const absent = await s.accessChanged({ userId: 'u-nobody', role: null });
  assert.deepEqual(absent.json, { matched: 0, closed: 0, demoted: 0 });
  assert.equal(member.role, 'editor');
});
