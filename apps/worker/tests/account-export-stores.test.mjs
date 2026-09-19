/**
 * THE EXPORT MUST NOT COUNT A TABLE NOTHING WRITES.
 *
 * `public.messages`, `public.checkpoints` and `public.usage_events` each have a select policy
 * (0001_init.sql: "own messages read", "own checkpoints read", "own usage read") and no insert
 * policy, no writer in apps/worker/src, and no service-role credential anywhere in `Env` that could
 * get past the missing policy. The only inserts into them in this repository are fixtures under
 * infra/supabase/tests. The transcript is written to SESSION_DO and the credit ledger to QUOTA_DO.
 *
 * So a select on them answers `[]` to a person with thousands of messages, and the export printed
 * that as `{"status":"ok","rows":[],"count":0}` beside the word `messages` — which reads as "you
 * have no conversations" to the one person who would go looking, immediately before a Danger-zone
 * dialog that deletes them. Measured by running the collector against an empty PostgREST, which is
 * the production shape: every one of the three came back `ok`, `count: 0`.
 *
 * THIS SUITE IS THE GUARD ON THAT, and it is deliberately not a test of the strings in the app. It
 * asserts the FILE is honest about itself:
 *
 *   - an empty read of a writerless table reports `not_recorded_here`, with no `count` anybody can
 *     quote back, naming the store that does hold it and the route that serves it;
 *   - a row that DOES turn up in one of them is still handed over, because the live catalogue is
 *     older than the migrations and a legacy row is still this person's data;
 *   - an empty read of a table this product DOES write still reports `ok`, `count: 0` — the
 *     positive control, without which the rule above would just be "empty means missing";
 *   - the route beside the empty table is the same string `elsewhere` publishes, resolved from one
 *     inventory rather than copied, so the two cannot come to disagree.
 *
 * Run with:  node --test tests/account-export-stores.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-account-export-stores-${process.pid}.mjs`);

// PostgREST, modelled as the only thing this suite needs it to be: a table name in, rows out. It
// answers `[]` for anything unseeded, which is exactly what the live database does for the three
// tables under test.
const SUPA_FIXTURE = `
  const state = globalThis.__APPLE_EXPORT_STORES_FIXTURE ??= { rows: new Map(), asked: [] };
  export const rows = state.rows;
  export const asked = state.asked;
  export async function supaRest(env, jwt, path) {
    const table = path.replace(/^\\//, '').split('?')[0];
    asked.push(table);
    return { ok: true, status: 200, data: rows.get(table) ?? [] };
  }
`;

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'account-export.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
  plugins: [{
    name: 'stub-supabase-boundary',
    setup(build) {
      build.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: 'supa-fixture', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: SUPA_FIXTURE, loader: 'js' }));
    },
  }],
});

const { collectAccountExport, elsewhereFor, recordedElsewhereAnswer } = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));
const { rows, asked } = globalThis.__APPLE_EXPORT_STORES_FIXTURE;

const SPEC_OUT = join(tmpdir(), `apple-account-export-stores-spec-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'user-export.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: SPEC_OUT,
});
const { USER_EXPORT, NON_POSTGRES_STORES } = await import(pathToFileURL(SPEC_OUT).href);
process.on('exit', () => rmSync(SPEC_OUT, { force: true }));

/** The three tables the defect was about, taken from the spec so a fourth cannot be added unseen. */
const WRITERLESS = USER_EXPORT.filter((t) => t.recordedElsewhere).map((t) => t.table);

const USER = { userId: 'alice', email: 'alice@example.com', role: 'user', jwt: 'jwt-owned-by-alice' };
// D1 answers nothing; `api_keys` is not what this suite is about and an empty answer from it is a
// true one, because the worker really does write that table.
const ENV = {
  SUPABASE_URL: 'https://supabase.invalid',
  SUPABASE_ANON_KEY: 'test-only',
  CORPUS: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) },
};

function reset() {
  rows.clear();
  asked.length = 0;
}

const exportNow = () => collectAccountExport(ENV, USER, { now: Date.parse('2026-09-20T00:00:00Z') });

// ------------------------------------------------------ the empty answer nobody measured ---

test('the three writerless tables are still declared, and still named as such', () => {
  // If this product ever starts writing one of these, delete its `recordedElsewhere` AND this
  // expectation in the same change. The list is here so the annotation cannot quietly come off and
  // restore `count: 0` without a red.
  assert.deepEqual(WRITERLESS, ['messages', 'checkpoints', 'usage_events']);
});

test('a table with a reader and no writer does not report an empty one of yours', async () => {
  reset();
  const doc = await exportNow();
  assert.ok(asked.includes('messages'), 'the table was not even queried — this suite would prove nothing');

  for (const table of WRITERLESS) {
    const result = doc.tables[table];
    assert.ok(result, `${table} vanished from the export entirely`);
    assert.equal(result.status, 'not_recorded_here', `${table} reports "${result.status}" for an answer nothing measured`);
    // The count is the whole defect: a zero in a downloaded file is a sentence a person believes.
    assert.equal('count' in result, false, `${table} still carries a count somebody could quote back`);
    assert.equal('rows' in result, false, `${table} still carries a rows array somebody could measure`);
    assert.ok(result.reason.length > 60, `${table}: an unmeasured table must say why in full sentences`);
    assert.ok(result.storedIn.length > 0, `${table}: the store that does hold it is not named`);
    assert.ok(result.holds.length > 10, `${table}: what the person is actually missing is not described`);
    assert.ok(result.where.length > 10, `${table}: no route to the data this file does not contain`);
  }

  // The three routes, pinned: these are the sentences a customer acts on before deleting.
  assert.equal(doc.tables.messages.storedIn, 'SESSION_DO');
  assert.match(doc.tables.messages.where, /\/api\/projects\/\{projectId\}\/export/);
  assert.equal(doc.tables.checkpoints.storedIn, 'SESSION_DO');
  assert.match(doc.tables.checkpoints.where, /\/api\/projects\/\{projectId\}\/checkpoints/);
  assert.equal(doc.tables.usage_events.storedIn, 'QUOTA_DO');
  assert.match(doc.tables.usage_events.where, /\/api\/me\/usage/);
});

test('the file says in one line that the conversations, checkpoints and spend are not in it', async () => {
  reset();
  const doc = await exportNow();
  for (const table of WRITERLESS) {
    assert.ok(doc.incomplete.includes(table), `${table} is missing from this file and the file does not say so`);
  }
  assert.equal(doc.complete, false, 'a file without the transcript, the checkpoints or the spend is not a complete export');
});

// ------------------------------------------------------------- what must NOT change ---

test('POSITIVE CONTROL: an empty table this product does write still reads as empty', async () => {
  reset();
  const doc = await exportNow();
  // `waitlist` and `profiles` have writers — an empty answer from them is a real measurement, and
  // if the rule above were "empty means missing" these would have changed too.
  assert.equal(doc.tables.waitlist.status, 'ok');
  assert.equal(doc.tables.waitlist.count, 0);
  assert.equal(doc.tables.profiles.status, 'ok');
  assert.equal(doc.tables.profiles.count, 0);
  assert.equal(doc.incomplete.includes('waitlist'), false);
});

test('a row that IS in one of those tables is still this person’s, and still leaves in the file', async () => {
  reset();
  // The live catalogue is older than the migrations — see the `sparks` compatibility retry in
  // account-export.ts — so a row left by a previous version of this product is possible. An export
  // that dropped it to make a point about emptiness would lose data to prove honesty.
  rows.set('messages', [{
    id: 'm1', project_id: 'p1', owner_id: 'alice', role: 'user', mode: 'clay',
    content: 'a message that really is in Postgres', tool_trace: null, created_at: '2026-01-05T00:00:00Z',
  }]);
  const doc = await exportNow();
  assert.equal(doc.tables.messages.status, 'ok');
  assert.equal(doc.tables.messages.count, 1);
  assert.equal(doc.tables.messages.rows[0].content, 'a message that really is in Postgres');
  assert.equal(doc.incomplete.includes('messages'), false, 'a table that DID answer with rows is not missing from the file');
  // And the other two are unaffected by the one that answered.
  assert.equal(doc.tables.checkpoints.status, 'not_recorded_here');
});

// ---------------------------------------------------- one inventory, not two copies ---

test('every pointer in the spec resolves to a store the inventory already names', () => {
  const names = new Set(NON_POSTGRES_STORES.map((s) => s.name));
  assert.ok(WRITERLESS.length > 0, 'nothing was examined');
  for (const spec of USER_EXPORT.filter((t) => t.recordedElsewhere)) {
    assert.ok(
      names.has(spec.recordedElsewhere),
      `${spec.table} points at "${spec.recordedElsewhere}" and no such store is in NON_POSTGRES_STORES`,
    );
    assert.ok(recordedElsewhereAnswer(spec.recordedElsewhere), `${spec.table}: the pointer resolves to nothing`);
  }
});

test('the route beside the empty table is the same string the elsewhere list publishes', async () => {
  reset();
  const doc = await exportNow();
  const listed = new Map(elsewhereFor().map((e) => [e.name, e]));
  for (const spec of USER_EXPORT.filter((t) => t.recordedElsewhere)) {
    const entry = listed.get(spec.recordedElsewhere);
    assert.ok(entry, `${spec.recordedElsewhere} is not in the elsewhere list at all`);
    // One source of truth: a second copy of the route would be a second thing to keep right, and
    // the export would eventually send a person to a route that moved.
    assert.equal(doc.tables[spec.table].where, entry.where, `${spec.table}: two different answers to "where do I get this"`);
    assert.equal(doc.tables[spec.table].holds, entry.holds);
  }
});

// ------------------------------------------------------------------ falsification ---

test('FALSIFICATION: a pointer at a store nobody inventoried resolves to nothing, not to a guess', () => {
  // The resolver must not invent a destination. If it fell back to a plausible-looking route, the
  // test above would pass over a spec that points nowhere, and a person would be sent to a 404 for
  // their own transcript.
  assert.equal(recordedElsewhereAnswer('no_such_store'), null);
});

test('FALSIFICATION: the collector reports a writerless table as counted if the guard is removed', async () => {
  reset();
  // The guard keyed on `recordedElsewhere`, exercised from the other side: a spec WITHOUT the
  // annotation must still take the old path, or the test above is passing because of something
  // other than the annotation.
  const unannotated = { ...USER_EXPORT.find((t) => t.table === 'messages') };
  delete unannotated.recordedElsewhere;
  const doc = await collectAccountExport(ENV, USER, { specs: [unannotated] });
  assert.equal(doc.tables.messages.status, 'ok');
  assert.equal(doc.tables.messages.count, 0);
});
