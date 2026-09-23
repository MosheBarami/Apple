/**
 * THE SPEND RESET SAYS WHAT IT CLEARS, AND LEAVES A RECORD.
 *
 * `/api/admin/spend-reset` took no body and zeroed the day AND the month ledgers at once. The month
 * ledger is the backstop the whole AI Gateway bill rests on (overage is uncapped; BudgetDO is the
 * only guard), so one stray POST with the admin key — a script run twice, a curl from shell history
 * — erased the only record of a month's billable spend and nothing said it had happened.
 *
 * Now: the caller must name a scope (`day`, `month` or `all`) and send `confirm: true`; anything
 * else is refused BEFORE the ledger is touched; and an accepted reset files an audit row naming the
 * scope. The DO enforces the scope itself too, so a caller that reaches it by another route cannot
 * fall back to "clear everything".
 *
 * Run with:  node --test tests/spend-reset-scope.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');

// ------------------------------------------------------------------ the ledger itself ---

const doOut = join(mkdtempSync(join(tmpdir(), 'spend-reset-')), 'budget.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'budget.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + doOut], { cwd: WORKER, stdio: 'pipe' });
const { BudgetDO } = await import(`file://${doOut}`);

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const USED = { day: today(), month: thisMonth(), dayNeurons: 50_000, dayPending: 0, dayBillableNeurons: 40_000, monthBillableNeurons: 700_000 };

function ledger() {
  const m = new Map([['budget', structuredClone(USED)]]);
  const deletes = [];
  const storage = {
    async get(k) { const v = m.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(a, b) { if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) m.set(k, structuredClone(v)); else m.set(a, structuredClone(b)); },
    async delete(k) { m.delete(k); },
    sql: { exec(q, ...args) { if (/^\s*delete/i.test(q)) deletes.push({ q, args }); return { toArray: () => [] }; } },
  };
  const o = new BudgetDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  return {
    deletes,
    stored: () => m.get('budget'),
    reset: async (body) => {
      const res = await o.fetch(new Request('https://do/reset-ledger', { method: 'POST', body: JSON.stringify(body ?? {}) }));
      return { status: res.status, body: await res.json() };
    },
  };
}

for (const body of [undefined, {}, { scope: 'everything' }, { scope: 'day' }, { scope: 'all', confirm: 'yes' }]) {
  test(`the ledger refuses a reset without a named scope and confirm:true — ${JSON.stringify(body)}`, async () => {
    const l = ledger();
    const r = await l.reset(body);
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
    assert.deepEqual(l.stored(), USED, 'nothing was cleared');
    assert.equal(l.deletes.length, 0, 'no spend rows were deleted');
  });
}

test('scope "day" clears today and leaves the month backstop standing', async () => {
  const l = ledger();
  const r = await l.reset({ scope: 'day', confirm: true });
  assert.equal(r.status, 200);
  assert.equal(l.stored().dayNeurons, 0);
  assert.equal(l.stored().dayBillableNeurons, 0);
  assert.equal(l.stored().monthBillableNeurons, USED.monthBillableNeurons, 'the month ledger must survive a day reset');
  assert.equal(l.deletes.length, 1, "today's spend rows are cleared");
});

test('scope "month" clears the month and leaves today standing', async () => {
  const l = ledger();
  await l.reset({ scope: 'month', confirm: true });
  assert.equal(l.stored().monthBillableNeurons, 0);
  assert.equal(l.stored().dayNeurons, USED.dayNeurons, "today's ledger must survive a month reset");
  assert.equal(l.deletes.length, 0);
});

test('scope "all" clears both, and only when asked for by name', async () => {
  const l = ledger();
  await l.reset({ scope: 'all', confirm: true });
  assert.equal(l.stored().dayNeurons, 0);
  assert.equal(l.stored().monthBillableNeurons, 0);
});

// ------------------------------------------------------------------ the admin route ---

const OUT = join(tmpdir(), `apple-spend-reset-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent',
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const ADMIN_KEY = 'a-high-entropy-admin-key';

async function adminReset(body) {
  const shipped = [];
  const budgetCalls = [];
  const inert = { idFromName: (n) => n, get: () => ({ async fetch() { return Response.json({ ok: true, state: {} }); } }) };
  const env = {
    ADMIN_KEY, SUPABASE_URL: 'https://supa.test', SUPABASE_ANON_KEY: 'anon', ENVIRONMENT: 'test',
    ADMIN_DO: {
      idFromName: () => 'singleton',
      get: () => ({
        async fetch(url, init) {
          const u = new URL(typeof url === 'string' ? url : url.url);
          if (u.pathname === '/events' && init?.method === 'POST') { shipped.push(...JSON.parse(init.body).events); return Response.json({ ok: true, stored: 0, rejected: {} }); }
          if (u.pathname === '/events') return Response.json({ events: [], retained: 0, truncated: false });
          return Response.json({ counters: [] });
        },
      }),
    },
    BUDGET_DO: {
      idFromName: () => 'singleton',
      get: () => ({ async fetch(url, init) { budgetCalls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return Response.json({ ok: true, state: {} }); } }),
    },
    QUOTA_DO: inert, SESSION_DO: inert, PAIRING_DO: inert, DISCORD_DO: inert,
    KV: { get: async () => null, put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  };
  const CTX = { waitUntil() {}, passThroughOnException() {} };
  const headers = { 'CF-Connecting-IP': '198.51.100.9', 'X-Admin-Key': ADMIN_KEY, 'Content-Type': 'application/json' };
  const res = await app.fetch(new Request('https://w/api/admin/spend-reset', { method: 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, CTX);
  await app.fetch(new Request('https://w/api/admin/logs?kind=audit', { headers: { 'X-Admin-Key': ADMIN_KEY } }), env, CTX);
  return { status: res.status, body: await res.json(), budgetCalls, audit: shipped.filter((e) => e.kind === 'audit') };
}

test('the admin route refuses a bare POST and never reaches the ledger', async () => {
  for (const body of [undefined, {}, { scope: 'all' }, { confirm: true }]) {
    const r = await adminReset(body);
    assert.equal(r.status, 400, `a reset without scope + confirm must be refused: ${JSON.stringify(body)}`);
    assert.equal(r.budgetCalls.length, 0, 'the ledger was not touched');
    assert.match(r.body.error, /scope/);
  }
});

test('an accepted reset forwards its scope and files an audit row naming it', async () => {
  const r = await adminReset({ scope: 'day', confirm: true });
  assert.equal(r.status, 200);
  assert.equal(r.budgetCalls.length, 1);
  assert.deepEqual(r.budgetCalls[0].body, { scope: 'day', confirm: true }, 'the scope reaches the ledger');
  const row = r.audit.find((e) => /spend-reset/.test(e.action) && /day/.test(e.action));
  assert.ok(row, `no audit row named the reset and its scope: ${JSON.stringify(r.audit)}`);
  assert.equal(row.allowed, true);
});

test('CONTROL: a refused reset files no "reset happened" row', async () => {
  const r = await adminReset({ scope: 'all' });
  assert.equal(r.audit.some((e) => /spend-reset\.(day|month|all)/.test(e.action)), false);
});
