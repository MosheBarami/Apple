/**
 * HOW LONG THIS PRODUCT KEEPS THINGS — in one place, and actually enforced.
 *
 * Every retention window in this worker was a literal sitting beside the query that applied it:
 * 30 days in do/admin.ts, 90 in automation-store.ts, 30 and 90 in notification-store.ts, a bare
 * `35 * 864e5` twice inside do/quota.ts, `62 * 864e5` in do/budget.ts, `offset 25` twice in
 * do/session.ts. Nothing could answer "what does this product keep, and for how long" without
 * reading eight files, which is why the privacy page's answer to that question was written from
 * memory and why nobody noticed that three of the sweeps HAD NO CALLER AT ALL.
 *
 * Two properties, and the second is the one that matters:
 *
 *   1. ONE DECLARATION. Each consumer imports its window from retention.ts; this test compares the
 *      constants they still export against that table at RUNTIME, so a module that keeps its own
 *      copy in step today and drifts tomorrow fails tomorrow.
 *   2. EVERY DECLARED WINDOW IS ENFORCED SOMEWHERE. A retention policy nothing applies is a
 *      published promise with no mechanism — the exact shape this repository keeps finding. Each
 *      key must be referenced by a file other than the one that declares it, and the count of keys
 *      checked is asserted, because a walk that finds nothing must not read as a clean result.
 *
 * And the sweeps are DRIVEN: purgeExpired, pruneNotifications and pruneExecutions were written,
 * tested, exported — and called by nothing. Expired memory entries, read notifications and
 * automation runs accumulated forever while three functions sat there looking like a policy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const SRC = join(WORKER, 'src');

const OUT = join(tmpdir(), `golem-retention-${process.pid}.mjs`);
await esbuild.build({
  stdin: {
    contents: `
      export { RETENTION, RETENTION_POLICY, days, seconds } from './src/retention';
      export { EVENT_RETENTION_DAYS, EVENT_TABLE_LIMIT } from './src/do/admin';
      export { RETAIN_RUNS_MS } from './src/automation-store';
      export { RETAIN_READ_MS, RETAIN_UNREAD_MS } from './src/notification-store';
      export { IMAGE_TTL_SECONDS } from './src/imagegen';
      export { AUDIO_TTL_SECONDS } from './src/audio-store';
      export { WORKSPACE_TRASH_TTL_SECONDS } from './src/webtools';
      export { MAX_TTL_DAYS } from './src/memory-store';
    `,
    resolveDir: WORKER,
    loader: 'ts',
  },
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const M = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));

const DAY_MS = 86_400_000;

test('every window is declared once, as a finite positive number', () => {
  const keys = Object.keys(M.RETENTION);
  assert.ok(keys.length >= 11, `only ${keys.length} retention windows are declared`);
  for (const [k, v] of Object.entries(M.RETENTION)) {
    assert.equal(typeof v, 'number', `${k} is not a number`);
    assert.ok(Number.isFinite(v) && v > 0, `${k} is ${v}`);
  }
});

test('the stores that still export their own constant take it from the one table', () => {
  // Runtime identity, not a source-text match: a module that reads the table at import time and a
  // module that happens to have typed the same number look identical in a grep and differ the day
  // one of them is edited.
  assert.equal(M.EVENT_RETENTION_DAYS, M.RETENTION.analyticsEventDays);
  assert.equal(M.EVENT_TABLE_LIMIT, M.RETENTION.analyticsEventRows);
  assert.equal(M.RETAIN_RUNS_MS, M.RETENTION.automationRunDays * DAY_MS);
  assert.equal(M.RETAIN_READ_MS, M.RETENTION.notificationReadDays * DAY_MS);
  assert.equal(M.RETAIN_UNREAD_MS, M.RETENTION.notificationUnreadDays * DAY_MS);
  assert.equal(M.IMAGE_TTL_SECONDS, M.RETENTION.generatedImageSeconds);
  assert.equal(M.AUDIO_TTL_SECONDS, M.RETENTION.generatedAudioSeconds);
  assert.equal(M.WORKSPACE_TRASH_TTL_SECONDS, M.RETENTION.workspaceTrashDays * 86_400);
  assert.equal(M.MAX_TTL_DAYS, M.RETENTION.memoryMaxTtlDays);
});

test('the windows kept their values — this is a rehoming, not a policy change', () => {
  // A refactor that quietly shortened a retention window would delete people's data early and
  // every test above would still pass. The numbers are pinned here, on purpose, one by one.
  assert.equal(M.RETENTION.analyticsEventDays, 30);
  assert.equal(M.RETENTION.analyticsEventRows, 5000);
  assert.equal(M.RETENTION.automationRunDays, 90);
  assert.equal(M.RETENTION.notificationReadDays, 30);
  assert.equal(M.RETENTION.notificationUnreadDays, 90);
  assert.equal(M.RETENTION.quotaLedgerDays, 35);
  assert.equal(M.RETENTION.serviceSpendDays, 62);
  assert.equal(M.RETENTION.checkpointsKept, 25);
  assert.equal(M.RETENTION.generatedImageSeconds, 3600);
  assert.equal(M.RETENTION.generatedAudioSeconds, 3600);
  assert.equal(M.RETENTION.workspaceTrashDays, 30);
  assert.equal(M.RETENTION.memoryMaxTtlDays, 730);
});

test('every declared window is enforced by a file other than the one that declares it', () => {
  const sources = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && e.name !== 'retention.ts') sources.set(p.slice(SRC.length + 1), readFileSync(p, 'utf8'));
    }
  };
  walk(SRC);
  assert.ok(sources.size > 50, `only ${sources.size} source files were read — the walk is broken`);

  let checked = 0;
  for (const key of Object.keys(M.RETENTION)) {
    checked += 1;
    const users = [...sources].filter(([, src]) => src.includes(`RETENTION.${key}`)).map(([f]) => f);
    assert.ok(users.length > 0, `RETENTION.${key} is declared and nothing applies it`);
  }
  assert.ok(checked >= 11, `only ${checked} windows were checked`);
});

test('the numbers are gone from the queries that used to carry them', () => {
  const read = (p) => readFileSync(join(SRC, p), 'utf8');
  // Each of these was a literal beside the statement that applied it. The pairing is what matters:
  // the file must reference the table AND no longer carry its own copy of the number.
  assert.match(read(join('do', 'quota.ts')), /RETENTION\.quotaLedgerDays/);
  assert.equal(/35 \* 864e5/.test(read(join('do', 'quota.ts'))), false, 'quota.ts still has its own 35 days');
  assert.match(read(join('do', 'budget.ts')), /RETENTION\.serviceSpendDays/);
  assert.equal(/62 \* 864e5/.test(read(join('do', 'budget.ts'))), false, 'budget.ts still has its own 62 days');
  assert.match(read(join('do', 'session.ts')), /RETENTION\.checkpointsKept/);
  assert.equal(/offset 25/.test(read(join('do', 'session.ts'))), false, 'session.ts still has its own checkpoint cap');
});

test('the policy renders as prose a person could be shown', () => {
  assert.ok(M.RETENTION_POLICY.length >= 11, `only ${M.RETENTION_POLICY.length} windows are described`);
  const described = new Set(M.RETENTION_POLICY.map((p) => p.key));
  for (const key of Object.keys(M.RETENTION)) {
    assert.ok(described.has(key), `RETENTION.${key} has a number and no description`);
  }
  for (const p of M.RETENTION_POLICY) {
    assert.ok(p.what.length > 15, `${p.key}: "${p.what}" does not say what is kept`);
    assert.ok(p.window.length > 2, `${p.key}: "${p.window}" is not a readable window`);
    assert.equal(typeof p.personal, 'boolean', `${p.key}: whether it is one person's data must be decided`);
  }
});
