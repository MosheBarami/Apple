/**
 * The roadmap layout, pinned.
 *
 * The view draws whatever this function returns, so these tests fix the two
 * properties the page depends on. **Order is honest**: a milestone is never
 * drawn above something it declares as a prerequisite, and readiness is derived
 * from those declarations rather than assumed. **Bad data still renders**: an
 * agent-authored plan can contain a cycle or a dangling id, and the page has to
 * survive both and say so rather than throwing or silently inventing an order.
 *
 * Run with:  node --test           (from apps/web)
 * No test framework: the model is plain TypeScript with no imports at all, so
 * Node loads it directly via native type stripping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoadmapLayout,
  creditRangeLabel,
  deriveReadiness,
  effortLabel,
  genreConfidenceLabel,
  progressLabel,
} from '../src/components/roadmap/model.ts';

const ms = (id, over = {}) => ({
  id,
  title: over.title ?? id,
  why: over.why ?? '',
  impact: over.impact ?? '',
  status: over.status ?? 'future',
  dependsOn: over.dependsOn ?? [],
  blockedBy: over.blockedBy ?? [],
  complexity: over.complexity ?? 'small',
  effort: over.effort ?? 'about one run',
  detected: over.detected ?? 'absent',
  evidence: over.evidence ?? [],
  verify: over.verify ?? null,
});

const idsOf = (stage) => stage.milestones.map((p) => p.milestone.id);

// ---------------------------------------------------------------------------
// 1. Nothing in, nothing out
// ---------------------------------------------------------------------------

test('an empty plan produces no stages and no current milestone', () => {
  const layout = buildRoadmapLayout([]);
  assert.deepEqual(layout.stages, []);
  assert.equal(layout.current, null);
  assert.equal(layout.progress.total, 0);
  assert.equal(layout.progress.fraction, 0);
});

test('a missing milestone list is treated as an empty one, not a crash', () => {
  assert.equal(buildRoadmapLayout(undefined).progress.total, 0);
  assert.equal(buildRoadmapLayout(null).stages.length, 0);
});

// ---------------------------------------------------------------------------
// 2. Dependency order
// ---------------------------------------------------------------------------

test('a milestone is placed one stage below its deepest prerequisite', () => {
  const layout = buildRoadmapLayout([
    ms('c', { dependsOn: ['b'] }),
    ms('a'),
    ms('b', { dependsOn: ['a'] }),
  ]);
  assert.deepEqual(
    layout.stages.map(idsOf),
    [['a'], ['b'], ['c']],
    'input order must not survive a dependency chain',
  );
  assert.deepEqual(layout.stages.map((s) => s.label), ['Stage 1', 'Stage 2', 'Stage 3']);
});

test('two independent milestones share a stage, in the order the worker sent them', () => {
  const layout = buildRoadmapLayout([ms('second'), ms('first')]);
  assert.equal(layout.stages.length, 1);
  assert.deepEqual(idsOf(layout.stages[0]), ['second', 'first']);
});

test('depth is the longest path, so a milestone never renders above a prerequisite', () => {
  // d depends on both a (depth 0) and c (depth 2) — it must sit at depth 3.
  const layout = buildRoadmapLayout([
    ms('a'),
    ms('b', { dependsOn: ['a'] }),
    ms('c', { dependsOn: ['b'] }),
    ms('d', { dependsOn: ['a', 'c'] }),
  ]);
  assert.deepEqual(layout.stages.map(idsOf), [['a'], ['b'], ['c'], ['d']]);
});

test('unlocks are the reverse edges, named', () => {
  const layout = buildRoadmapLayout([ms('a', { title: 'Lobby' }), ms('b', { title: 'Coins', dependsOn: ['a'] })]);
  const lobby = layout.stages[0].milestones[0];
  assert.deepEqual(lobby.unlocks.map((u) => u.title), ['Coins']);
});

// ---------------------------------------------------------------------------
// 3. Bad data still renders, and says so
// ---------------------------------------------------------------------------

test('a dependency cycle is reported and the plan still lays out', () => {
  const layout = buildRoadmapLayout([ms('a', { dependsOn: ['b'] }), ms('b', { dependsOn: ['a'] })]);
  assert.equal(layout.hasCycle, true);
  assert.equal(layout.progress.total, 2, 'both milestones survive the broken edge');
});

test('a prerequisite that names no known milestone is reported, not silently kept', () => {
  const layout = buildRoadmapLayout([ms('a', { dependsOn: ['ghost'] })]);
  assert.deepEqual(layout.unknownDependencies, ['ghost']);
  assert.deepEqual(layout.stages[0].milestones[0].dependencies, [], 'the dangling edge is not drawn');
  assert.equal(layout.stages[0].milestones[0].readiness, 'ready', 'and it does not block the milestone either');
});

test('a milestone depending on itself neither loops nor deepens', () => {
  const layout = buildRoadmapLayout([ms('a', { dependsOn: ['a'] })]);
  assert.equal(layout.stages.length, 1);
  assert.equal(layout.stages[0].milestones[0].depth, 0);
});

test('a duplicated id is kept once', () => {
  const layout = buildRoadmapLayout([ms('a', { title: 'First' }), ms('a', { title: 'Second' })]);
  assert.equal(layout.progress.total, 1);
  assert.equal(layout.stages[0].milestones[0].milestone.title, 'First');
});

// ---------------------------------------------------------------------------
// 4. Readiness is derived, never assumed
// ---------------------------------------------------------------------------

test('readiness follows the reported status first', () => {
  assert.equal(deriveReadiness(ms('a', { status: 'done' }), []), 'landed');
  assert.equal(deriveReadiness(ms('a', { status: 'current' }), []), 'in-progress');
});

test('a reported block is believed even when the dependency list looks clear', () => {
  assert.equal(deriveReadiness(ms('a', { status: 'blocked' }), []), 'waiting');
});

test('a future milestone is ready only when nothing is outstanding', () => {
  const outstanding = [{ id: 'y', title: 'Y', status: 'future' }];
  assert.equal(deriveReadiness(ms('a'), []), 'ready');
  assert.equal(deriveReadiness(ms('a'), outstanding), 'waiting');
});

test('waitingOn lists exactly the prerequisites that have not landed', () => {
  const layout = buildRoadmapLayout([
    ms('a', { status: 'done', title: 'Lobby' }),
    ms('b', { title: 'Parkour' }),
    ms('c', { dependsOn: ['a', 'b'] }),
  ]);
  const c = layout.stages[1].milestones.find((p) => p.milestone.id === 'c');
  assert.deepEqual(c.waitingOn.map((w) => w.title), ['Parkour']);
  assert.equal(c.readiness, 'waiting');
});

test("the worker's own blockedBy wins over the derivation when it is populated", () => {
  const layout = buildRoadmapLayout([
    ms('a', { status: 'done', title: 'Lobby' }),
    ms('b', { status: 'done', title: 'Parkour' }),
    // Both prerequisites have landed, so a derivation would say "ready" — the
    // worker says otherwise, and the worker can see the project.
    ms('c', { status: 'blocked', dependsOn: ['a', 'b'], blockedBy: ['b'] }),
  ]);
  const c = layout.stages[1].milestones[0];
  assert.deepEqual(c.waitingOn.map((w) => w.title), ['Parkour']);
  assert.equal(c.readiness, 'waiting');
});

// ---------------------------------------------------------------------------
// 5. "Now" and progress
// ---------------------------------------------------------------------------

test('the current milestone is whatever is genuinely running', () => {
  const layout = buildRoadmapLayout([ms('a', { status: 'done' }), ms('b', { status: 'current', dependsOn: ['a'] })]);
  assert.equal(layout.current.milestone.id, 'b');
});

test('with nothing running, the current milestone is the shallowest ready one', () => {
  const layout = buildRoadmapLayout([ms('a'), ms('b', { dependsOn: ['a'] })]);
  assert.equal(layout.current.milestone.id, 'a');
});

test('a finished plan names nothing as current rather than picking one', () => {
  const layout = buildRoadmapLayout([ms('a', { status: 'done' }), ms('b', { status: 'done', dependsOn: ['a'] })]);
  assert.equal(layout.current, null);
  assert.equal(layout.progress.fraction, 1);
  assert.equal(progressLabel(layout.progress), 'All 2 milestones landed');
});

test('progress counts landed milestones and states the counts in words', () => {
  const layout = buildRoadmapLayout([
    ms('a', { status: 'done' }),
    ms('b', { status: 'current', dependsOn: ['a'] }),
    ms('c', { dependsOn: ['b'] }),
  ]);
  assert.deepEqual(
    { done: layout.progress.done, active: layout.progress.active, total: layout.progress.total },
    { done: 1, active: 1, total: 3 },
  );
  assert.equal(progressLabel(layout.progress), '1 of 3 landed');
  assert.equal(progressLabel({ done: 0, active: 0, total: 4, fraction: 0 }), 'Nothing landed yet — 4 planned');
});

// ---------------------------------------------------------------------------
// 6. Stage flags the view folds on
// ---------------------------------------------------------------------------

test('a stage of only landed milestones is marked landed, so the view can fold it', () => {
  const layout = buildRoadmapLayout([
    ms('a', { status: 'done' }),
    ms('b', { status: 'done' }),
    ms('c', { dependsOn: ['a'] }),
  ]);
  assert.equal(layout.stages[0].landed, true, 'both roots have landed');
  assert.equal(layout.stages[1].landed, false);
});

test('a stage with one unfinished milestone is never marked landed', () => {
  const layout = buildRoadmapLayout([ms('a', { status: 'done' }), ms('b', { status: 'current' })]);
  assert.equal(layout.stages[0].landed, false);
});

test('milestones at the same depth are flagged parallel — nothing orders them', () => {
  const layout = buildRoadmapLayout([ms('a'), ms('b'), ms('c', { dependsOn: ['a'] })]);
  assert.equal(layout.stages[0].parallel, true);
  assert.equal(layout.stages[1].parallel, false);
});

// ---------------------------------------------------------------------------
// 7. The genre read is banded, never a percentage
// ---------------------------------------------------------------------------

test('genre confidence is words, and a weak signal says so', () => {
  assert.equal(genreConfidenceLabel(0.9), 'clear');
  assert.equal(genreConfidenceLabel(0.6), 'likely');
  assert.equal(genreConfidenceLabel(0.2), 'a guess');
});

// ---------------------------------------------------------------------------
// 8. Engine identity never reaches the card
// ---------------------------------------------------------------------------

test('the internal specialist names are stripped out of the effort line', () => {
  // The worker composes effort as "about two Stone runs". §1 keeps that name
  // off every non-admin surface, so the card must never be able to print it.
  assert.equal(effortLabel('about one Stone run'), 'about one Agent run');
  assert.equal(effortLabel('about two Clay runs'), 'about two Plan runs');
  assert.equal(effortLabel('about three Rune runs'), 'about three Super Agent runs');
});

// --- what it costs, not just how much work it is --------------------------
//
// The effort line is in runs. Nobody is billed in runs. The worker now derives the milestone's
// credit range from the same `runs` the effort line is built from, and the card has to render it
// without inventing anything the worker did not send.

test('A CREDIT RANGE IS SHOWN AS A RANGE, in the unit the user is billed in', () => {
  assert.equal(creditRangeLabel(20, 60), '20–60 Credits');
});

test('a range of one number is not printed as a fake spread', () => {
  // Plan is published as "2", not "2-2". Rendering "2–2 Credits" would invent a spread.
  assert.equal(creditRangeLabel(2, 2), '2 Credits');
  assert.equal(creditRangeLabel(1, 1), '1 Credit');
});

test('NO RANGE MEANS NO CHIP — a missing price is never rendered as a zero', () => {
  // The worker sends null when the derivation could not be made. A card that turned that into
  // "0 Credits" would be quoting a price of nothing for work that costs something.
  assert.equal(creditRangeLabel(null, null), '');
  assert.equal(creditRangeLabel(undefined, undefined), '');
  assert.equal(creditRangeLabel(20, null), '');
  assert.equal(creditRangeLabel(null, 60), '');
  assert.equal(creditRangeLabel(0, 0), '');
});

test('a range that runs backwards is refused rather than silently reordered', () => {
  // Reordering would hide a worker bug behind a plausible-looking chip.
  assert.equal(creditRangeLabel(60, 20), '');
});

test('the card actually renders the range it is handed', async () => {
  // The field exists on the model and on the wire; a field no component reads is the dead branch
  // this section of the audit keeps finding.
  const { readFileSync: read } = await import('node:fs');
  const tsx = read(new URL('../src/components/roadmap/milestone-card.tsx', import.meta.url), 'utf8');
  assert.match(tsx, /creditRangeLabel\(/, 'the milestone card never prints the credit range');
});

test('an effort line that never named a specialist is left exactly as it is', () => {
  assert.equal(effortLabel('about two runs'), 'about two runs');
  assert.equal(effortLabel(''), '');
  assert.equal(effortLabel(null), '');
});

test('no readable specialist name survives any effort line the catalogue can produce', () => {
  for (const runs of ['one', 'two', 'three', 'four']) {
    for (const mode of ['Clay', 'Stone', 'Rune']) {
      const out = effortLabel(`about ${runs} ${mode} run${runs === 'one' ? '' : 's'}`);
      assert.ok(!/\b(Clay|Stone|Rune)\b/.test(out), `"${out}" still names a specialist`);
    }
  }
});

// ---------------------------------------------------------------------------
// 9. The contract, pinned to the worker that serves it
// ---------------------------------------------------------------------------

/**
 * These read the worker's own source. That is the point.
 *
 * The roadmap engine is the source of truth and it is the tested half; this
 * client is the half that moves. An earlier pass of this page was written
 * against a guessed contract — POST /roadmap/suggest, statuses `active` and
 * `planned` — and nothing failed, because a client that asks for a route the
 * worker does not serve only breaks at runtime, in a browser, against a live
 * Studio. So the alignment is asserted here, off the filesystem, with no
 * network and no worker running: rename a status or move a route in
 * apps/worker and this file is what says so.
 */
import { readFileSync } from 'node:fs';

const workerRoadmap = readFileSync(new URL('../../worker/src/roadmap.ts', import.meta.url), 'utf8');
const workerRoutes = readFileSync(new URL('../../worker/src/index.ts', import.meta.url), 'utf8');
const clientApi = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

/** The string literals of an exported string-union type, sorted. */
const unionOf = (name, source) => {
  const decl = new RegExp(`export type ${name} =([^;]+);`).exec(source);
  assert.ok(decl, `apps/worker no longer exports a ${name} union`);
  return [...decl[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
};

test('the worker emits exactly the four milestone statuses this client handles', () => {
  assert.deepEqual(unionOf('MilestoneStatus', workerRoadmap), ['blocked', 'current', 'done', 'future']);
});

test('every status the worker can emit maps to a readiness — none falls through', () => {
  // The guard that matters: the union above is only worth pinning if the client
  // actually answers for each member. A status the worker adds and this client
  // ignores would silently render as "ready to start".
  const READINESS = {
    done: 'landed',
    current: 'in-progress',
    future: 'ready',
    blocked: 'waiting',
  };
  for (const status of unionOf('MilestoneStatus', workerRoadmap)) {
    const readiness = deriveReadiness(ms('x', { status }), []);
    assert.equal(readiness, READINESS[status], `status "${status}" has no readiness of its own`);
  }
});

test('the worker detects in three values, and `unknown` is one of them', () => {
  // Three-valued on purpose: `unknown` is "the scan hit a cap and could not
  // see", not "no". The card has to be able to say that rather than rounding it
  // down into a confident absence.
  assert.deepEqual(unionOf('Detected', workerRoadmap), ['absent', 'present', 'unknown']);
});

test('this client calls exactly the roadmap routes the worker serves', () => {
  // Both sides are reduced to the same shape: the worker's `:id` and the
  // client's interpolations are the same hole in the same path.
  const hole = (s) => s.replace(/\$\{[^}]*\}/g, '').replace(/:id/g, '');

  const served = [...workerRoutes.matchAll(/app\.(get|post)\('(\/api\/projects\/:id\/roadmap[^']*)'/g)]
    .map((m) => `${m[1].toUpperCase()} ${hole(m[2])}`)
    .sort();
  assert.deepEqual(served, [
    'GET /api/projects//roadmap',
    'GET /api/projects//roadmap/next',
    'POST /api/projects//roadmap/brief',
  ]);

  const called = [...clientApi.matchAll(/`(\/api\/projects\/[^`]*\/roadmap[^`]*)`/g)]
    .map((m) => hole(m[1]))
    .sort();
  // Every path the client asks for is one the worker answers. A guessed route
  // (`/roadmap/suggest`, `/roadmap/milestones/…/start`) fails right here.
  const servedPaths = new Set(served.map((r) => r.split(' ')[1]));
  assert.ok(called.length > 0, 'lib/api.ts no longer calls the roadmap at all');
  for (const path of called) {
    assert.ok(servedPaths.has(path), `the worker serves no roadmap route at "${path}"`);
  }
  assert.deepEqual([...new Set(called)], [...servedPaths].sort());
});

test('the ranking pass is opt-in, with the query key the worker actually checks', () => {
  // The deterministic roadmap is the product; polish costs a Credit and is asked
  // for explicitly. The worker gates on `query('polish') !== '1'`, so the client
  // has to send that exact key and value or it silently never ranks.
  assert.ok(/query\('polish'\)\s*!==\s*'1'/.test(workerRoutes), 'the worker no longer gates polish on ?polish=1');
  assert.ok(/\?polish=1/.test(clientApi), 'lib/api.ts no longer sends ?polish=1');
});

test('only the milestone id crosses the wire when asking for a brief', () => {
  // The worker rebuilds the brief from a fresh scan precisely so a caller
  // cannot hand the builder arbitrary instructions wearing Golem's roadmap as a
  // disguise. A client that started posting the brief back would undo that.
  const body = /roadmap\/brief`,\s*\{[^}]*body:\s*JSON\.stringify\(\{([^}]*)\}\)/.exec(clientApi);
  assert.ok(body, 'the brief call no longer posts a JSON body');
  assert.equal(body[1].trim(), 'milestoneId');
});
