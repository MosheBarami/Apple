/**
 * THE NETWORK FAILURE THE OLD MEMBERSHIP PUSH COULD NOT RECOVER FROM.
 *
 * These tests run the real outbox transport against a stateful fake Data API and a stateful fake
 * Durable Object namespace. They prove the boundaries, rather than a helper's return shape:
 *
 *   - a failed immediate DO fetch leaves the row pending and the scheduled pass delivers it;
 *   - a DO success followed by a failed acknowledgement is delivered again, then removed;
 *   - golem cannot acknowledge apple's distinct Durable Object delivery;
 *   - one scheduled invocation claims a bounded batch and never loops for the remainder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(mkdtempSync(join(tmpdir(), 'membership-outbox-')), 'outbox.mjs');
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'membership-access-outbox.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
});
const {
  MEMBERSHIP_OUTBOX_BATCH_DEFAULT,
  deliverMembershipAccessEvent,
  drainMembershipAccessOutbox,
  membershipAccessEvent,
} = await import(pathToFileURL(OUT).href);

const TOKENS = {
  golem: 'membership-outbox-golem-test-token-0123456789abcdef',
  apple: 'membership-outbox-apple-test-token-0123456789abcdef',
};
const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

function row(over = {}) {
  return {
    project_id: PROJECT,
    user_id: USER,
    version: 1,
    consumer: 'golem',
    role: null,
    access: 'removed',
    expires_at: null,
    attempts: 0,
    last_error: null,
    ...over,
  };
}

function dataApi(initial = []) {
  const state = {
    rows: initial.map((r) => ({ ...r })),
    ackFailures: 0,
    claims: [],
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const body = init.body ? JSON.parse(init.body) : {};
    const authorised = body.p_token === TOKENS[body.p_consumer];

    if (url.endsWith('/rpc/membership_access_outbox_ready')) {
      return json(authorised && ['golem', 'apple'].includes(body.p_consumer));
    }
    if (url.endsWith('/rpc/claim_membership_access_outbox')) {
      if (!authorised) return json({ message: 'refused' }, 403);
      state.claims.push({ consumer: body.p_consumer, limit: body.p_limit });
      const due = state.rows
        .filter((r) => r.consumer === body.p_consumer)
        .sort((a, b) => a.project_id.localeCompare(b.project_id) || a.user_id.localeCompare(b.user_id) || a.version - b.version)
        .slice(0, body.p_limit);
      for (const r of due) r.attempts += 1;
      return json(due.map(({ consumer: _consumer, last_error: _error, ...r }) => ({ ...r })));
    }
    if (url.endsWith('/rpc/ack_membership_access_outbox')) {
      if (!authorised) return json({ message: 'refused' }, 403);
      if (state.ackFailures > 0) {
        state.ackFailures -= 1;
        return json({ message: 'ack unavailable' }, 503);
      }
      const before = state.rows.length;
      state.rows = state.rows.filter(
        (r) => !(r.consumer === body.p_consumer && r.project_id === body.p_project && r.user_id === body.p_user && r.version === body.p_version),
      );
      return json(state.rows.length < before);
    }
    if (url.endsWith('/rpc/fail_membership_access_outbox')) {
      if (!authorised) return json({ message: 'refused' }, 403);
      const target = state.rows.find(
        (r) => r.consumer === body.p_consumer && r.project_id === body.p_project && r.user_id === body.p_user && r.version === body.p_version,
      );
      if (target) target.last_error = body.p_error;
      return json(Boolean(target));
    }
    return json({ message: `unexpected ${url}` }, 404);
  };
  return { state, fetch };
}

function namespace() {
  const state = {
    failures: 0,
    deliveries: [],
    versions: new Map(),
  };
  return {
    state,
    binding: {
      idFromName: (name) => name,
      get: (projectId) => ({
        async fetch(_url, init) {
          if (state.failures > 0) {
            state.failures -= 1;
            throw new Error('simulated DO transport loss');
          }
          const body = JSON.parse(init.body);
          assert.equal(projectId, body.userId === USER ? PROJECT : projectId, 'the event addresses its project namespace');
          const key = `${projectId}:${body.userId}`;
          const previous = state.versions.get(key) ?? 0;
          const stale = body.version < previous;
          if (!stale && body.version > previous) state.versions.set(key, body.version);
          state.deliveries.push({ ...body, stale });
          return Response.json(stale
            ? { matched: 0, closed: 0, demoted: 0, applied: false, stale: true }
            : { matched: 1, closed: body.role === null ? 1 : 0, demoted: body.role === null ? 0 : 1, applied: true });
        },
      }),
    },
  };
}

function env(api, ns, consumer = 'golem') {
  return {
    SUPABASE_URL: 'https://supa.outbox.test',
    SUPABASE_ANON_KEY: 'publishable-test-key',
    MEMBERSHIP_OUTBOX_TOKEN: TOKENS[consumer],
    MEMBERSHIP_OUTBOX_CONSUMER: consumer,
    SESSION_DO: ns.binding,
  };
}

test('a lost immediate push stays pending and the scheduled consumer recovers it', async (t) => {
  const api = dataApi([row()]);
  const ns = namespace();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = api.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });

  ns.state.failures = 1;
  const event = membershipAccessEvent(row());
  const immediate = await deliverMembershipAccessEvent(env(api, ns), event);
  assert.equal(immediate.accepted, false);
  assert.equal(immediate.acknowledged, false);
  assert.equal(api.state.rows.length, 1, 'failure cannot consume the durable row');
  assert.match(api.state.rows[0].last_error, /transport loss/);

  const retry = await drainMembershipAccessOutbox(env(api, ns));
  assert.deepEqual(
    { claimed: retry.claimed, accepted: retry.accepted, acknowledged: retry.acknowledged, failed: retry.failed },
    { claimed: 1, accepted: 1, acknowledged: 1, failed: 0 },
  );
  assert.equal(api.state.rows.length, 0, 'the exact consumer row is removed only after DO acceptance');
  assert.equal(ns.state.deliveries.length, 1);
});

test('DO success plus acknowledgement failure redelivers idempotently and then clears the row', async (t) => {
  const api = dataApi([row()]);
  const ns = namespace();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = api.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });

  api.state.ackFailures = 1;
  const first = await drainMembershipAccessOutbox(env(api, ns));
  assert.equal(first.accepted, 1, 'the DO accepted the first delivery');
  assert.equal(first.acknowledged, 0, 'the failed ack is not invented as success');
  assert.equal(api.state.rows.length, 1, 'the row remains due');

  const second = await drainMembershipAccessOutbox(env(api, ns));
  assert.equal(second.acknowledged, 1);
  assert.equal(api.state.rows.length, 0);
  assert.equal(ns.state.deliveries.length, 2, 'at-least-once transport repeats the same event');
  assert.deepEqual(ns.state.deliveries.map((d) => d.version), [1, 1]);
});

test('golem acknowledgement cannot consume apple delivery for its separate DO namespace', async (t) => {
  const api = dataApi([row({ consumer: 'golem' }), row({ consumer: 'apple' })]);
  const golem = namespace();
  const apple = namespace();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = api.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });

  const first = await drainMembershipAccessOutbox(env(api, golem, 'golem'));
  assert.equal(first.acknowledged, 1);
  assert.deepEqual(api.state.rows.map((r) => r.consumer), ['apple'], 'apple remains pending after golem succeeds');
  assert.equal(golem.state.deliveries.length, 1);
  assert.equal(apple.state.deliveries.length, 0);

  const second = await drainMembershipAccessOutbox(env(api, apple, 'apple'));
  assert.equal(second.acknowledged, 1);
  assert.equal(api.state.rows.length, 0);
  assert.equal(apple.state.deliveries.length, 1);
});

test('a valid golem credential cannot claim apple by forging the consumer field', async (t) => {
  const api = dataApi([row({ consumer: 'apple' })]);
  const apple = namespace();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = api.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });

  const forged = env(api, apple, 'apple');
  forged.MEMBERSHIP_OUTBOX_TOKEN = TOKENS.golem;
  await assert.rejects(
    drainMembershipAccessOutbox(forged),
    /token or consumer is not configured/,
  );
  assert.equal(api.state.claims.length, 0, 'readiness rejects before a forged consumer can claim');
  assert.equal(api.state.rows.length, 1);
});

test('one scheduled pass claims a bounded batch and does not spin on the remainder', async (t) => {
  const rows = Array.from({ length: 60 }, (_, i) => row({
    user_id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
    version: 1,
  }));
  const api = dataApi(rows);
  const ns = namespace();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = api.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });

  const report = await drainMembershipAccessOutbox(env(api, ns));
  assert.equal(report.claimed, MEMBERSHIP_OUTBOX_BATCH_DEFAULT);
  assert.equal(report.acknowledged, MEMBERSHIP_OUTBOX_BATCH_DEFAULT);
  assert.equal(api.state.rows.length, 60 - MEMBERSHIP_OUTBOX_BATCH_DEFAULT);
  assert.deepEqual(api.state.claims, [{ consumer: 'golem', limit: MEMBERSHIP_OUTBOX_BATCH_DEFAULT }]);
});

test('malformed or widening events are refused before a Durable Object can be addressed', () => {
  const missingExpiry = row();
  delete missingExpiry.expires_at;
  assert.equal(membershipAccessEvent({ ...row(), project_id: 'not-a-project' }), null);
  assert.equal(membershipAccessEvent({ ...row(), version: 0 }), null);
  assert.equal(membershipAccessEvent({ ...row(), access: 'clear', role: null }), null);
  assert.equal(membershipAccessEvent({ ...row(), access: 'removed', role: 'editor' }), null);
  assert.equal(membershipAccessEvent({ ...row(), access: 'clear', role: 'owner' }), null, 'an outbox row cannot confer ownership');
  assert.equal(membershipAccessEvent(missingExpiry), null, 'versioned event needs an explicit current expiry');
  assert.equal(membershipAccessEvent({ ...row(), expires_at: 'not-a-date' }), null);
});
