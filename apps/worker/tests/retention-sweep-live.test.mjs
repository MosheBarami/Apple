/**
 * THE SWEEPS HAD NO CALLER, AND A SWEEP NOBODY RUNS IS A POLICY THAT IS NOT HAPPENING.
 *
 * `purgeExpired` (memory entries past their expiry), `pruneNotifications` (read after 30 days,
 * unread after 90) and `pruneExecutions` (automation runs after 90) were written, exported and
 * unit-tested. Nothing called any of them. `grep -rn 'purgeExpired' src` found the definition and
 * its test and no third line — so every expired memory entry a user had deliberately given a TTL
 * to, every notification they had read months ago and every automation run from last year was
 * still there, under three published retention windows that read like they were being enforced.
 *
 * A window with no sweep is the same defect as a comment asserting an invariant nothing enforces,
 * and this repository has a name for that. So: a cron trigger in wrangler.jsonc, a `scheduled`
 * export on the worker, and this file, which drives that export against a real (in-memory) SQL
 * database and counts rows before and after.
 *
 * The tests are shaped around the two ways a sweep goes wrong:
 *
 *   - IT DELETES TOO MUCH. A live memory entry, an unread notification from yesterday and this
 *     week's automation run are each seeded and each must survive. A sweep asserted only by "the
 *     old rows are gone" passes if it deletes the table.
 *   - IT REPORTS SUCCESS WITHOUT RUNNING. The counts come from the stores, the handler records what
 *     it did, and a store that throws is reported as a failure rather than as zero rows swept —
 *     zero and "could not look" are the same number and different facts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `golem-retention-sweep-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
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
process.on('exit', () => rmSync(OUT, { force: true }));

const NOW = Date.UTC(2026, 8, 15, 3, 0, 0);
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();

let DB = null;
const ADMIN_POSTS = [];

function seed() {
  if (DB) DB.close();
  DB = d1();
  ADMIN_POSTS.length = 0;
  const x = (sql, ...p) => DB.raw.prepare(sql).run(...p);
  DB.raw.exec(`create table if not exists memory_entries(scope text not null, scope_id text not null, key text not null, kind text not null, value text not null, source text not null, created_at text not null, updated_at text not null, expires_at text, updated_by text not null, primary key(scope, scope_id, key))`);
  DB.raw.exec(`create table if not exists notifications(id text primary key, recipient_id text not null, kind text not null, severity text not null, title text not null, body text, project_id text, project_name text, subject text, href text not null, dedupe_key text not null, group_key text not null, created_at integer not null, updated_at integer not null, deliver_at integer not null, read_at integer, occurrences integer not null)`);
  DB.raw.exec(`create table if not exists automation_runs(id text primary key, automation_id text not null, owner_id text not null, project_id text not null, fire_key text not null unique, trigger_kind text not null, due_at integer, started_at integer not null, finished_at integer, outcome text, attempt integer not null, run_id text, credits integer, error text, fold text)`);

  // memory: one long expired, one not yet, one with no expiry at all
  x(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`, 'user', 'u1', 'stale', 'fact', 'old', 'user', iso(NOW - 40 * DAY), iso(NOW - 40 * DAY), iso(NOW - DAY), 'u1');
  x(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`, 'user', 'u1', 'fresh', 'fact', 'live', 'user', iso(NOW), iso(NOW), iso(NOW + 30 * DAY), 'u1');
  x(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`, 'user', 'u1', 'forever', 'fact', 'keep', 'user', iso(NOW), iso(NOW), null, 'u1');

  const note = (id, createdAt, readAt) =>
    x(`insert into notifications values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, 'u1', 'mention', 'info', id, null, null, null, null, '/x', id, 'g', createdAt, createdAt, createdAt, readAt, 1);
  note('read-old', NOW - 100 * DAY, NOW - 31 * DAY);     // read, past the read window
  note('read-recent', NOW - 3 * DAY, NOW - 2 * DAY);     // read, inside it
  note('unread-ancient', NOW - 100 * DAY, null);          // unread, past the unread window
  note('unread-recent', NOW - 2 * DAY, null);             // unread, inside it

  const run = (id, startedAt) =>
    x(`insert into automation_runs values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, 'a1', 'u1', 'p1', id, 'schedule', startedAt, startedAt, startedAt, 'ok', 1, null, 1, null, null);
  run('run-old', NOW - 120 * DAY);
  run('run-recent', NOW - 5 * DAY);
}

const env = () => ({
  CORPUS: DB.CORPUS,
  KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
  ADMIN_DO: {
    idFromName: (n) => n,
    get: () => ({
      async fetch(url, init) {
        ADMIN_POSTS.push({ path: new URL(url).pathname, body: init?.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({ stored: 1 }), { status: 200 });
      },
    }),
  },
  SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}'); } }) },
});

const ctx = () => ({ waitUntil: (p) => { void p; }, passThroughOnException() {} });
const event = () => ({ scheduledTime: NOW, cron: '0 3 * * *' });

// ------------------------------------------------------------------ it is wired ---

test('the worker declares a cron trigger, or nothing ever calls the sweep', () => {
  const wrangler = readFileSync(join(WORKER, 'wrangler.jsonc'), 'utf8');
  const config = JSON.parse(wrangler.replace(/^\s*\/\/[^\n]*$/gm, ''));
  assert.ok(config.triggers, 'wrangler.jsonc declares no triggers block');
  assert.ok(Array.isArray(config.triggers.crons) && config.triggers.crons.length > 0, 'no cron is declared');
  for (const cron of config.triggers.crons) {
    assert.equal(cron.trim().split(/\s+/).length, 5, `"${cron}" is not a five-field cron expression`);
  }
});

test('the worker exports a scheduled handler beside its fetch handler', () => {
  assert.equal(typeof worker.scheduled, 'function', 'there is no scheduled export for the cron to call');
  // And the fetch surface is untouched: every other suite drives this same default export.
  assert.equal(typeof worker.fetch, 'function');
  assert.equal(typeof worker.request, 'function');
});

// ------------------------------------------------------------------ it sweeps ---

test('the sweep removes what is past its window', async () => {
  seed();
  await worker.scheduled(event(), env(), ctx());
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where key = 'stale'`), 0);
  assert.equal(countRows(DB.raw, `select count(*) from notifications where id = 'read-old'`), 0);
  assert.equal(countRows(DB.raw, `select count(*) from notifications where id = 'unread-ancient'`), 0);
  assert.equal(countRows(DB.raw, `select count(*) from automation_runs where id = 'run-old'`), 0);
});

test('the sweep leaves alone what is inside its window — the control for the test above', async () => {
  seed();
  await worker.scheduled(event(), env(), ctx());
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where key = 'fresh'`), 1);
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where key = 'forever'`), 1, 'an entry with no expiry must never expire');
  assert.equal(countRows(DB.raw, `select count(*) from notifications where id = 'read-recent'`), 1);
  assert.equal(countRows(DB.raw, `select count(*) from notifications where id = 'unread-recent'`), 1);
  assert.equal(countRows(DB.raw, `select count(*) from automation_runs where id = 'run-recent'`), 1);
});

test('the sweep records what it did, so a night it did not run is visible', async () => {
  seed();
  await worker.scheduled(event(), env(), ctx());
  const events = ADMIN_POSTS.filter((p) => p.path === '/events').flatMap((p) => p.body?.events ?? []);
  assert.ok(events.length > 0, 'the sweep left no trace at all');
  const audit = events.find((e) => e.kind === 'audit' && e.action === 'retention_sweep');
  assert.ok(audit, `no retention_sweep event was recorded — got ${events.map((e) => e.action ?? e.kind).join(', ')}`);
  assert.equal(audit.allowed, true);
  assert.equal(audit.actorKind, 'system');
  // The subject carries the counts, so the log answers "how much did it clear" and not just "it ran".
  assert.match(audit.subject ?? '', /\d/);
});

test('a store that cannot be swept is reported, not counted as nothing to do', async () => {
  seed();
  DB.raw.exec(`drop table automation_runs`);
  await worker.scheduled(event(), env(), ctx());
  const events = ADMIN_POSTS.filter((p) => p.path === '/events').flatMap((p) => p.body?.events ?? []);
  const errors = events.filter((e) => e.kind === 'error');
  assert.ok(errors.length > 0, 'a sweep that could not run reported nothing wrong');
  assert.match(errors.map((e) => e.scope ?? '').join(' '), /retention/);
  // And the sweeps that CAN run still run: one broken store must not cancel the others.
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where key = 'stale'`), 0);
  assert.equal(countRows(DB.raw, `select count(*) from notifications where id = 'read-old'`), 0);
});
