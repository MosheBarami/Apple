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
