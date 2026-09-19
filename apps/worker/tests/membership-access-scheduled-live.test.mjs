/** The configured minute cron reaches the real index.ts scheduled handler and drains one event. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(mkdtempSync(join(tmpdir(), 'membership-scheduled-')), 'worker.mjs');

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const worker = (await import(pathToFileURL(OUT).href)).default;

const TOKEN = 'membership-scheduled-test-token-0123456789abcdef';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

function harness() {
  const calls = [];
  const deliveries = [];
  const analytics = [];
  let claimed = false;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push({ url, body });
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.endsWith('/rpc/membership_access_outbox_ready')) {
      return json(body.p_token === TOKEN && body.p_consumer === 'golem');
    }
    if (url.endsWith('/rpc/claim_membership_access_outbox')) {
      if (claimed) return json([]);
      claimed = true;
      return json([{ project_id: PROJECT, user_id: USER, version: 7, role: null, access: 'removed', expires_at: null, attempts: 1 }]);
    }
    if (url.endsWith('/rpc/ack_membership_access_outbox')) return json(true);
    if (url.endsWith('/rpc/fail_membership_access_outbox')) return json(true);
    return json({ error: 'unexpected' }, 404);
  };

  const env = {
    SUPABASE_URL: 'https://supa.scheduled.test',
    SUPABASE_ANON_KEY: 'publishable-test-key',
    MEMBERSHIP_OUTBOX_TOKEN: TOKEN,
    MEMBERSHIP_OUTBOX_CONSUMER: 'golem',
    SESSION_DO: {
      idFromName: (name) => name,
      get: (projectId) => ({
        async fetch(_url, init) {
          const body = JSON.parse(init.body);
          deliveries.push({ projectId, body });
          return Response.json({ matched: 1, closed: 1, demoted: 0, applied: true });
        },
      }),
    },
    ADMIN_DO: {
      idFromName: (name) => name,
      get: () => ({
        async fetch(_url, init) {
          const body = JSON.parse(init.body);
          analytics.push(...(body.events ?? []));
          return Response.json({ stored: body.events?.length ?? 0 });
        },
      }),
    },
  };
  return { calls, deliveries, analytics, env, restore: () => { globalThis.fetch = oldFetch; } };
}

test('the minute cron claims, delivers and acknowledges through index.ts', async (t) => {
  const h = harness();
  t.after(h.restore);
  await worker.scheduled({ cron: '* * * * *', scheduledTime: Date.now() }, h.env, {});

  assert.deepEqual(h.deliveries, [{
    projectId: PROJECT,
    body: { userId: USER, role: null, access: 'removed', version: 7, expiresAt: null },
  }]);
  assert.ok(h.calls.some((c) => c.url.endsWith('/rpc/membership_access_outbox_ready')));
  assert.ok(h.calls.some((c) => c.url.endsWith('/rpc/claim_membership_access_outbox')));
  assert.ok(h.calls.some((c) => c.url.endsWith('/rpc/ack_membership_access_outbox')));
  const audit = h.analytics.find((e) => e.kind === 'audit' && e.action === 'membership_access_delivery');
  assert.ok(audit, 'a non-empty drain leaves an operational record');
  assert.match(audit.subject, /acknowledged=1/);
});

test('the minute cron refuses to claim when its purpose secret is absent', async (t) => {
  const h = harness();
  t.after(h.restore);
  delete h.env.MEMBERSHIP_OUTBOX_TOKEN;
  await assert.rejects(
    worker.scheduled({ cron: '* * * * *', scheduledTime: Date.now() }, h.env, {}),
    /membership outbox is not configured/,
  );
  assert.equal(h.calls.some((c) => c.url.endsWith('/rpc/claim_membership_access_outbox')), false);
  assert.equal(h.deliveries.length, 0);
});
