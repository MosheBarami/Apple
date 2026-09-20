/**
 * "DOWNLOAD MY DATA" WHEN IT MEANS ALL OF IT.
 *
 * The worker's `/api/me/export` answers with the Postgres slice of an account plus a MAP: four
 * tables marked `not_recorded_here` and every non-Postgres store named with the route that really
 * serves it. Measured on the live product on 2026-09-20, one click produced a 23,899-byte file
 * reading `"complete": false` with `["messages","checkpoints","usage_events","studio_pairings"]`
 * outstanding — the conversations, the checkpoints and the spend history were all somewhere else.
 * The clause the owner wrote is "downloads all their data", one action; the product was four-plus.
 *
 * settings.tsx now follows the map itself. These tests EXECUTE that walk rather than grep it: the
 * block between the two sentinels in settings.tsx is compiled on its own — it depends on nothing
 * but `getAccessToken`, which is stubbed — and driven with a fetch that answers like the live
 * worker does, including when it does not answer at all.
 *
 * The cases are the ones that would ship broken:
 *
 *   the conversation must be IN the saved bytes, not pointed at from them;
 *   a route that fails must be named in the file and must stop it calling itself complete,
 *     because a file that is quietly missing a store is worse than one that says so;
 *   the server's own signed document must survive verbatim, sha256 and all, or the file has
 *     replaced evidence with a summary of evidence;
 *   the pairing code must stay out, always, with the reason printed — it is a live key;
 *   and every store the WORKER's own inventory calls personal must be either followed or
 *     explained. That inventory is read from apps/worker/src/user-export.ts, so a store added
 *     there tomorrow is this test's problem rather than nobody's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const PAGE = readFileSync(join(WEB, 'src', 'routes', 'settings.tsx'), 'utf8');

/* ------------------------------------------------ the block, compiled and imported --- */

const BEGIN = '/* ===== ACCOUNT EXPORT: BEGIN';
const END = '/* ===== ACCOUNT EXPORT: END ===== */';
const from = PAGE.indexOf(BEGIN);
const to = PAGE.indexOf(END);
assert.ok(from > 0 && to > from, 'the account-export block sentinels are gone from settings.tsx');

const dir = mkdtempSync(join(tmpdir(), 'acctexport-'));
const src = join(dir, 'block.ts');
writeFileSync(
  src,
  // The only thing the block reaches outside itself for. Stubbed rather than imported, so this
  // test never touches the auth client and never needs a browser.
  'const getAccessToken = async (): Promise<string | null> => null;\nvoid getAccessToken;\n' +
    PAGE.slice(from, to),
);
const out = join(dir, 'block.mjs');
execFileSync(ESBUILD, [src, '--bundle', '--format=esm', '--platform=neutral', '--outfile=' + out], { stdio: 'pipe' });
const {
  planAccountExport,
  assembleAccountExport,
  automationRunFollowUps,
  accountExportCoverage,
  buildCompleteAccountExport,
} = await import(`file://${out}`);

/* --------------------------------------------------------------- a worker, stubbed --- */

const USER_ID = 'u-1';
const PROJECTS = [
  { id: 'p-1', name: 'Lava obby' },
  { id: 'p-2', name: 'Tycoon' },
];

/** The non-Postgres inventory, read from the worker rather than retyped. */
function personalStores() {
  const inv = readFileSync(join(WEB, '..', 'worker', 'src', 'user-export.ts'), 'utf8');
  const names = [];
  const re = /name:\s*'((?:[^'\\]|\\.)*)'[\s\S]{0,400}?personal:\s*(true|false)/g;
  for (const m of inv.matchAll(re)) if (m[2] === 'true') names.push(m[1].replace(/\\'/g, "'"));
  return [...new Set(names)];
}

function baseDocument() {
  return {
    format: 'apple.account-export.v1',
    exportedAt: '2026-09-20T09:48:04.000Z',
    user: { id: USER_ID, email: 'e2e-test@golem.internal' },
    complete: false,
    incomplete: ['messages', 'checkpoints', 'usage_events', 'studio_pairings'],
    tables: {
      profiles: { status: 'ok', rows: [{ id: USER_ID, training_opt_in: false }] },
      projects: { status: 'ok', rows: PROJECTS.map((p) => ({ ...p, owner_id: USER_ID })) },
      messages: { status: 'not_recorded_here', storedIn: 'SESSION_DO', where: 'GET /api/projects/{projectId}/export' },
      checkpoints: { status: 'not_recorded_here', storedIn: 'SESSION_DO', where: 'GET /api/projects/{projectId}/checkpoints' },
      usage_events: { status: 'not_recorded_here', storedIn: 'QUOTA_DO', where: 'GET /api/me/usage' },
      studio_pairings: { status: 'unreadable', withheld: { code: 'THE PAIRING SECRET.' } },
    },
    elsewhere: personalStores().map((name) => ({
      store: 'd1',
      binding: 'CORPUS',
      name,
      holds: `what ${name} holds`,
      where: `GET /api/something/${name}`,
    })),
    sha256: 'f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0',
  };
}

const TRANSCRIPT_SENTENCE = 'make me an obby with lava and three stages';

/** Answers the way the live worker answered when each of these was measured. */
function worker({ failing = new Set(), automations = [] } = {}) {
  const asked = [];
  return {
    asked,
    async fetchRecord(path) {
      asked.push(path);
      if (failing.has(path)) return { endpoint: path, status: 500, error: 'the server answered 500' };
      if (path === '/api/me/export') return { endpoint: path, status: 200, body: baseDocument() };
      if (path === '/api/me/usage') {
        return { endpoint: path, status: 200, body: { days: [{ day: '2026-09-20', credits: 29, events: 24 }] } };
      }
      if (path.endsWith('/export') && path.startsWith('/api/projects/')) {
        return {
          endpoint: path,
          status: 200,
          body: { project: { id: path.split('/')[3] }, messages: [{ role: 'user', text: TRANSCRIPT_SENTENCE }] },
        };
      }
      if (path.endsWith('/checkpoints')) {
        return { endpoint: path, status: 200, body: { checkpoints: [{ id: 'c-1', takenAt: '2026-09-20T00:00:00Z' }] } };
      }
      if (path.endsWith('/automations')) return { endpoint: path, status: 200, body: { automations } };
      if (path.includes('/automations/')) return { endpoint: path, status: 200, body: { runs: [{ id: 'r-1' }] } };
      return { endpoint: path, status: 200, body: { ok: true } };
    },
  };
}

async function run(opts = {}) {
  const w = worker(opts);
  const saved = [];
  const slept = [];
  const outcome = await buildCompleteAccountExport(() => {}, {
    fetchRecord: w.fetchRecord,
    save: (text, filename) => saved.push({ text, filename }),
    token: 'stub-token',
    now: () => new Date('2026-09-20T10:00:00.000Z'),
    // The backoff is real in the browser and instant here: a test that waits 1.15s per retry is a
    // test somebody eventually deletes.
    sleep: async (ms) => { slept.push(ms); },
  });
  assert.equal(saved.length, 1, 'one click has to produce exactly one file');
  return { outcome, file: saved[0], doc: JSON.parse(saved[0].text), asked: w.asked, slept };
}

/* ------------------------------------------------------------------ what it does --- */

test('one click writes one file, and the conversations are inside it', async () => {
  const { outcome, file, doc, asked } = await run();

  assert.equal(asked[0], '/api/me/export', 'the walk starts from the document that holds the map');
  for (const p of PROJECTS) {
    assert.ok(asked.includes(`/api/projects/${p.id}/export`), `${p.name}'s transcript was never fetched`);
    assert.ok(asked.includes(`/api/projects/${p.id}/checkpoints`), `${p.name}'s checkpoints were never fetched`);
  }
  assert.ok(asked.includes('/api/me/usage'), 'the Credit spend was never fetched');

  // THE BYTES, not the plan. What the person opens has to contain the sentence they typed.
  const occurrences = file.text.split(TRANSCRIPT_SENTENCE).length - 1;
  assert.equal(occurrences, PROJECTS.length, 'every project’s messages must be in the saved file');
  assert.match(file.text, /"checkpoints": \[/, 'the checkpoints must be in the saved file');
  assert.match(file.text, /"credits": 29/, 'the Credit spend must be in the saved file');

  assert.equal(doc.format, 'apple.account-export.v2');
  assert.equal(doc.complete, true, 'every route answered, so the file may say so');
  assert.deepEqual(doc.incomplete, []);
  assert.equal(outcome.complete, true);
  assert.equal(outcome.requests, asked.length, 'the count reported to the user is the count actually made');
  assert.match(file.filename, /^apple-data-2026-09-20\.json$/);
});

test('a route that does not answer is named, and the file refuses to call itself complete', async () => {
  const { outcome, doc } = await run({ failing: new Set(['/api/projects/p-2/export', '/api/notifications']) });

  assert.equal(doc.complete, false, 'two stores are missing and the file must not claim otherwise');
  assert.deepEqual(doc.incomplete.sort(), ['notifications', 'transcript:p-2']);
  assert.equal(doc.failed['transcript:p-2'].status, 500);
  assert.equal(doc.failed['transcript:p-2'].endpoint, '/api/projects/p-2/export');
  assert.equal(doc.failed['transcript:p-2'].project.name, 'Tycoon', 'a reader has to know WHICH project is missing');
  // And the surviving project is still there — a partial walk saves what it got.
  assert.ok(doc.followed['transcript:p-1'], 'the project that answered must still be in the file');
  assert.equal(outcome.complete, false);
  assert.deepEqual(outcome.missing.sort(), ['notifications', 'transcript:p-2']);
});

test('the server’s own signed document survives verbatim, sha256 and all', async () => {
  const { doc } = await run();
  assert.deepEqual(doc.database, baseDocument(), 'the v1 document must be carried, not summarised');
  assert.equal(doc.database.sha256, baseDocument().sha256);
});

/* ------------------------------------------------------- what it will not put in --- */

test('the pairing code is always declared withheld, with the reason, even on a perfect walk', async () => {
  const { doc } = await run();
  const entry = doc.notInThisFile.find((o) => o.store === 'studio_pairings.code');
  assert.ok(entry, 'a file that silently drops a credential teaches nobody anything');
  assert.match(entry.why, /credential/i);
  assert.match(entry.why, /studio\/claim/, 'the reason has to name the route that makes it dangerous');
  // The readable half is NOT withheld.
  assert.ok(doc.followed['studio:p-1'], 'the pairing’s readable half must still be followed');
});

test('bytes are listed with the route that serves them, never inlined and never dropped', async () => {
  const { doc } = await run();
  for (const store of ['image/<project>/', 'audio/<project>/', 'checkpoint_chunks']) {
    const entry = doc.notInThisFile.find((o) => o.store === store);
    assert.ok(entry, `${store} vanished from the file instead of being explained`);
    assert.match(entry.why, /bytes, not text/i);
    assert.ok(entry.where.length > 0, `${store} is explained but not located`);
  }
});

/* --------------------------------------------------------------- the coverage --- */

test('the stores the old file could only point at are followed now', () => {
  const covered = accountExportCoverage();
  // The four the live file listed as outstanding, plus the ones behind them.
  for (const store of [
    'messages',
    'message_models',
    'message_revisions',
    'checkpoints',
    'usage_events',
    'ledger',
    'month_totals',
    'studio_pairings',
    'notifications',
    'memory_entries',
    'memory_audit',
    'automations',
    'automation_runs',
    'billing_events',
    'user_credentials',
    'creator_write_log',
    'account_deletions',
    'oplog',
    'project_asset_use',
    'collab_comments',
    'collab_reviews',
    'collab_versions',
    'share:link:',
    'share:grant:<project>:',
  ]) {
    assert.ok(covered.has(store), `${store} is still only a pointer — nothing fetches it`);
  }
});

test('every personal store the worker knows about is either followed or explained', async () => {
  const { doc } = await run();
  const covered = accountExportCoverage();
  const explained = new Set(doc.notInThisFile.map((o) => o.store));
  const unaccounted = personalStores().filter((n) => !covered.has(n) && !explained.has(n));
  assert.deepEqual(unaccounted, [], `these stores are in neither list: ${unaccounted.join(', ')}`);
  for (const o of doc.notInThisFile) {
    assert.ok(o.why.length > 0, `${o.store} is listed with no reason`);
  }
});

test('automation runs are fetched from the ids the first wave returned, not guessed at', async () => {
  const automations = [{ id: 'a-1' }, { id: 'a-2' }];
  const { asked, doc } = await run({ automations });
  for (const a of automations) {
    assert.ok(asked.includes(`/api/automations/${a.id}/runs`), `${a.id}'s runs were never fetched`);
    assert.ok(doc.followed[`automation_runs:${a.id}`], `${a.id}'s runs are not in the file`);
  }
  // And nothing is invented when there are none.
  const none = await run();
  assert.equal(none.asked.some((p) => p.includes('/runs')), false);
  assert.deepEqual(automationRunFollowUps({ follow: [] }, {}), []);
});

/* ------------------------------------------------------------ the crowded account --- */

test('a rate limit is asked again, and a refusal is not', async () => {
  // One request per project per store: seven projects made 101 of them on the live account, and a
  // two-hundred-project account makes thousands. 429 is the failure that scales with how much a
  // person has to lose, so it is the one worth asking twice.
  const tries = new Map();
  const count = (p) => tries.set(p, (tries.get(p) ?? 0) + 1);
  const base = worker();
  const saved = [];
  const slept = [];
  const outcome = await buildCompleteAccountExport(() => {}, {
    token: 't',
    now: () => new Date('2026-09-20T10:00:00.000Z'),
    sleep: async (ms) => { slept.push(ms); },
    save: (text, filename) => saved.push({ text, filename }),
    async fetchRecord(path) {
      count(path);
      // Rate-limited twice, then served.
      if (path === '/api/me/usage' && tries.get(path) < 3) return { endpoint: path, status: 429, error: 'too many requests' };
      // Forbidden, forever. Asking again is noise on a worker that is already busy.
      if (path === '/api/notifications') return { endpoint: path, status: 403, error: 'not yours' };
      return base.fetchRecord(path);
    },
  });
  const doc = JSON.parse(saved[0].text);

  assert.equal(tries.get('/api/me/usage'), 3, 'a 429 must be retried, twice, and then believed');
  assert.ok(doc.followed.usage, 'the retry has to actually land the answer in the file');
  assert.equal(tries.get('/api/notifications'), 1, 'a 403 will say the same thing next time');
  assert.deepEqual(slept, [250, 900], 'the backoff grows, and is not a busy loop');
  assert.equal(outcome.complete, false);
  assert.deepEqual(outcome.missing, ['notifications']);
});

/* ------------------------------------------------------------------- the screen --- */

test('the page says what the file holds and what it does not, and neither claim is bigger than the file', () => {
  const copy = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const at = copy.indexOf('<Row id="download-my-data"');
  assert.ok(at > 0, 'the download row is not on the page');
  const row = copy.slice(at, copy.indexOf('</Row>', at));
  assert.match(row, /every message of every conversation/i, 'the transcripts are the thing that was missing; say so');
  assert.match(row, /bytes/i, 'what stays out has to be on the screen, not only in the file');
  assert.match(row, /pairing code/i);
  // The plan is exercised above; here the page must not promise a completeness it cannot know.
  assert.equal(
    /everything Apple holds about you/i.test(row),
    false,
    'bytes and a credential are not in the file, so the row must not say everything',
  );
});
