/**
 * REVOCATION V1 ARRIVING AFTER REGRANT V2 MUST NOT WIN.
 *
 * This bundles and drives the real SessionDO endpoint. The outbox is at-least-once and its two
 * consumers can race an immediate push, so transport order is intentionally not trusted. The DO
 * persists the greatest accepted version per member and re-applies equality for crash recovery.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'membership-order-')), 'session.mjs');
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

const OWNER = 'owner';
const MEMBER = 'member';

function socket() {
  let attachment = { userId: MEMBER, role: 'editor', connectionId: 'c-member', activity: 'viewing', lastSeenMs: Date.now() };
  const closes = [];
  return {
    closes,
    get role() { return attachment.role; },
    ws: {
      readyState: 1,
      send() {},
      close: (code, reason) => closes.push({ code, reason }),
      deserializeAttachment: () => attachment,
      serializeAttachment: (next) => { attachment = next; },
    },
  };
}

function session() {
  const client = socket();
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Project', ownerId: OWNER }]]);
  const storage = {
    async get(key) { return store.get(key); },
    async put(key, value) {
      if (typeof key === 'object' && key !== null) for (const [k, v] of Object.entries(key)) store.set(k, v);
      else store.set(key, value);
    },
    async delete(key) { return store.delete(key); },
    async list() { return new Map(); },
    async setAlarm() {},
    async getAlarm() { return null; },
    sql: { exec: () => ({ toArray: () => [], one: () => null }) },
  };
  const ctx = {
    storage,
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [client.ws],
    acceptWebSocket() {},
  };
  const doBinding = { idFromName: () => 'id', get: () => ({ fetch: async () => Response.json({ ok: true }) }) };
  const instance = new SessionDO(ctx, {
    AI: { run: async () => ({ response: 'unused' }) },
    QUOTA_DO: doBinding,
    BUDGET_DO: doBinding,
    ADMIN_DO: doBinding,
  });
  const send = async (body) => {
    const res = await instance.fetch(new Request('https://do/collab/access-changed', {
      method: 'POST',
      body: JSON.stringify({ userId: MEMBER, ...body }),
    }));
    return { status: res.status, body: await res.json() };
  };
  return { client, store, send };
}

test('a stale revoke cannot undo a newer regrant, including an old unversioned push', async () => {
  const s = session();

  const regrant = await s.send({ role: 'editor', access: 'clear', version: 2, expiresAt: null });
  assert.equal(regrant.status, 200);
  assert.equal(regrant.body.applied, true);
  assert.equal(s.client.role, 'editor');

  const sameVersionDifferentEvent = await s.send({ role: null, access: 'removed', version: 2, expiresAt: null });
  assert.equal(sameVersionDifferentEvent.status, 409, 'one sequence cannot be replayed with a different access event');
  assert.equal(sameVersionDifferentEvent.body.error, 'access_event_conflict');
  assert.equal(s.client.closes.length, 0);

  const stale = await s.send({ role: null, access: 'removed', version: 1, expiresAt: null });
  assert.deepEqual(
    { applied: stale.body.applied, stale: stale.body.stale, previous: stale.body.previous },
    { applied: false, stale: true, previous: 2 },
  );
  assert.equal(s.client.closes.length, 0, 'the old removal cannot close the regranted socket');
  assert.equal(s.store.get('accessRevoked')?.[MEMBER], undefined, 'the old removal cannot recreate the run fence');

  const legacy = await s.send({ role: null, access: 'removed' });
  assert.equal(legacy.body.applied, false, 'an older Worker direct push is stale after a versioned event');
  assert.equal(s.client.closes.length, 0);
});

test('a newer revoke applies, equality re-applies for crash recovery, and an older retry stays stale', async () => {
  const s = session();
  await s.send({ role: 'editor', access: 'clear', version: 2, expiresAt: null });

  const revoke = await s.send({ role: null, access: 'removed', version: 3, expiresAt: null });
  assert.equal(revoke.body.applied, true);
  assert.equal(revoke.body.duplicate, false);
  assert.equal(s.client.closes.length, 1);
  assert.equal(s.store.get('accessRevoked')[MEMBER].reason, 'removed');

  const duplicate = await s.send({ role: null, access: 'removed', version: 3, expiresAt: null });
  assert.equal(duplicate.body.applied, true, 'equality is retried because the prior attempt may have crashed after sequencing');
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(s.client.closes.length, 2, 'the idempotent socket effect is attempted again');

  const clear = await s.send({ role: 'editor', access: 'clear', version: 4, expiresAt: null });
  assert.equal(clear.body.applied, true);
  assert.equal(s.store.get('accessRevoked')?.[MEMBER], undefined);

  const late = await s.send({ role: null, access: 'removed', version: 3, expiresAt: null });
  assert.equal(late.body.stale, true);
  assert.equal(s.store.get('accessRevoked')?.[MEMBER], undefined, 'the late retry cannot undo version 4');
});

test('a corrupt persisted version table refuses delivery instead of guessing an order', async () => {
  const s = session();
  s.store.set('accessChangeVersions', { [MEMBER]: 'four' });
  const res = await s.send({ role: null, access: 'removed', version: 5, expiresAt: null });
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'access_version_unavailable');
  assert.equal(s.client.closes.length, 0);
});
