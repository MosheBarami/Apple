/**
 * The activity state machine, pinned.
 *
 * Two properties matter here, and they pull in different directions.
 *
 * HONESTY. Every phase, step, duration and terminal row must trace to an event
 * that actually arrived. There is no default phase list, no interpolation, no
 * predicted next step, and — critically — no duration presented as a
 * measurement when its clocks were replayed rather than observed.
 *
 * ROBUSTNESS. The log is not ordered and not deduplicated. `run_state` replays
 * a snapshot of a run that is still emitting live events, so a reconnect can
 * deliver the same `tool_start` twice and a `tool_end` whose partner start never
 * arrived. The old merge-on-arrival path dropped the latter silently, leaving a
 * row that spun forever. These tests pin that both cases now resolve.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  eventsFromTurn,
  formatElapsed,
  kindForPhase,
  kindForTool,
  motionPlan,
  reduceActivity,
  stepLabel,
} from '../src/components/ws/activity-model.ts';

const T0 = 1_700_000_000_000;
const run = (events, over = {}) =>
  reduceActivity({ events, now: T0 + 60_000, streaming: false, ...over });

const start = (toolId, tool, at) => ({ type: 'tool_start', at, toolId, tool });
const end = (toolId, at, over = {}) => ({
  type: 'tool_end',
  at,
  toolId,
  ok: over.ok ?? true,
  summary: over.summary,
  durationMs: over.durationMs,
  tool: over.tool,
});

const kinds = (r) => r.phases.map((p) => p.kind);
const phase = (name, at) => ({ type: 'phase', at, phase: name });
const labels = (r) => r.phases.flatMap((p) => p.steps.map((s) => s.label));

// ---------------------------------------------------------------------------
// 1. Nothing in means nothing out
// ---------------------------------------------------------------------------

test('an empty log produces no phases, no terminal and no upcoming', () => {
  const r = run([]);
  assert.deepEqual(r.phases, []);
  assert.equal(r.terminal, null);
  assert.deepEqual(r.upcoming, []);
});

test('a live run that has reported nothing yet still invents no phase', () => {
  const r = run([], { streaming: true });
  assert.deepEqual(r.phases, []);
});

// ---------------------------------------------------------------------------
// 2. Ordering — the log is not trusted to arrive sorted
// ---------------------------------------------------------------------------

test('events shuffled in the array still produce the timeline in real time order', () => {
  const ordered = run([
    start('a', 'get_project_tree', T0),
    end('a', T0 + 1000, { durationMs: 1000 }),
    start('b', 'edit_script', T0 + 2000),
    end('b', T0 + 3000, { durationMs: 1000 }),
  ]);
  const shuffled = run([
    end('b', T0 + 3000, { durationMs: 1000 }),
    start('b', 'edit_script', T0 + 2000),
    end('a', T0 + 1000, { durationMs: 1000 }),
    start('a', 'get_project_tree', T0),
  ]);
  assert.deepEqual(labels(shuffled), labels(ordered));
  assert.deepEqual(labels(shuffled), ['Read the project tree', 'Edited a script']);
});

test('a tool_end that arrives before its own tool_start still closes that step', () => {
  const r = run([end('a', T0 + 1000, { durationMs: 1000 }), start('a', 'render_view', T0)]);
  assert.equal(r.phases.length, 1);
  const [step] = r.phases[0].steps;
  assert.equal(step.state, 'done', 'the row must not be left spinning');
  assert.equal(step.elapsed.ms, 1000);
});

test('an end whose start never arrived becomes a finished step with an unobserved start', () => {
  const r = run([end('ghost', T0 + 4000, { durationMs: 4000, tool: 'render_view' })]);
  const [step] = r.phases[0].steps;
  assert.equal(step.state, 'done');
  assert.equal(step.startObserved, false, 'we did not watch it start and must not claim we did');
  assert.equal(step.elapsed.ms, 4000, 'the measured duration is still real');
});

test('an orphan end with no tool name is labelled as unnamed, never guessed', () => {
  const r = run([end('ghost', T0 + 1000, { durationMs: 1000 })]);
  const [step] = r.phases[0].steps;
  assert.equal(step.kind, 'working');
  assert.equal(step.label, 'A step with no reported name');
});

test('a clock that puts the end before the start yields zero, never a negative duration', () => {
  const r = run([start('a', 'run_luau', T0 + 5000), end('a', T0)]);
  const [step] = r.phases[0].steps;
  assert.equal(step.elapsed.ms, 0);
});

// ---------------------------------------------------------------------------
// 3. Duplicates — a reconnect replays what the socket already has
// ---------------------------------------------------------------------------

test('a tool_start delivered twice is one step, not two', () => {
  const r = run([
    start('a', 'render_view', T0),
    start('a', 'render_view', T0),
    end('a', T0 + 500, { durationMs: 500 }),
  ]);
  assert.equal(r.phases.length, 1);
  assert.equal(r.phases[0].steps.length, 1);
});

test('duplicate halves keep the EARLIEST clock, so a replay cannot inflate a duration', () => {
  const r = run([
    start('a', 'render_view', T0),
    start('a', 'render_view', T0 + 9000), // the replayed copy, seen later
    end('a', T0 + 1000),
    end('a', T0 + 9500),
  ]);
  const [step] = r.phases[0].steps;
  assert.equal(step.startedAt, T0);
  assert.equal(step.elapsed.ms, 1000);
});

test('a repeated agent_status for the same phase does not restart its clock', () => {
  const r = run(
    [
      { type: 'phase', at: T0, phase: 'planning' },
      { type: 'phase', at: T0 + 1000, phase: 'planning' },
      { type: 'phase', at: T0 + 2000, phase: 'planning' },
      start('a', 'edit_script', T0 + 3000),
      end('a', T0 + 3500, { durationMs: 500 }),
    ],
    { streaming: false },
  );
  assert.deepEqual(kinds(r), ['planning', 'writing_luau']);
  assert.equal(r.phases[0].steps.length, 1, 'three announcements of one state are one state');
  assert.equal(r.phases[0].elapsed.ms, 3000, 'the phase ran until the next step began');
});

// ---------------------------------------------------------------------------
// 4. Grouping and state
// ---------------------------------------------------------------------------

test('adjacent steps of the same kind merge into one phase; a different kind opens a new one', () => {
  const r = run([
    start('a', 'get_project_tree', T0),
    end('a', T0 + 100, { durationMs: 100 }),
    start('b', 'inspect_model', T0 + 200),
    end('b', T0 + 300, { durationMs: 100 }),
    start('c', 'create_instances', T0 + 400),
    end('c', T0 + 500, { durationMs: 100 }),
  ]);
  assert.deepEqual(kinds(r), ['inspecting', 'building']);
  assert.equal(r.phases[0].steps.length, 2);
});

test('reading the project and reading its scripts are different activities', () => {
  // §16.1 Board C separates C02 "Inspecting project" from C06 "Reading scripts",
  // and it is a real distinction: the instance tree and the code answer different
  // questions. This fixture used to be the merge case above, which is how the two
  // came to share one heading.
  const r = run([
    start('a', 'get_project_tree', T0),
    end('a', T0 + 100, { durationMs: 100 }),
    start('b', 'read_script', T0 + 200),
    end('b', T0 + 300, { durationMs: 100 }),
  ]);
  assert.deepEqual(kinds(r), ['inspecting', 'reading_scripts']);
});

test('searching the Roblox docs is not inspecting the user project', () => {
  // C04. `search_docs` reads Roblox's documentation, which is not in the place at
  // all — calling that "Inspecting project" told the user the wrong thing about
  // where Golem was looking.
  assert.equal(kindForTool('search_docs'), 'searching_knowledge');
  assert.equal(kindForTool('get_project_tree'), 'inspecting');
});

test('changing what exists is editing; adding to the world is building', () => {
  // C08 against C09.
  assert.equal(kindForTool('set_properties'), 'editing');
  assert.equal(kindForTool('delete_instances'), 'editing');
  assert.equal(kindForTool('create_instances'), 'building');
  assert.equal(kindForTool('insert_asset'), 'building');
});

test('a tool name separates states that agent_status collapses together', () => {
  // The worker reports search_asset_library as phase `inspecting`; only the tool
  // name can say "Searching assets".
  assert.equal(kindForPhase('inspecting'), 'inspecting');
  assert.equal(kindForTool('search_asset_library'), 'searching_assets');
  assert.equal(kindForTool('find_verified_asset'), 'searching_assets');
});

test('an unmapped tool is `working` and keeps its own name — no invented prose', () => {
  assert.equal(kindForTool('some_new_tool'), 'working');
  assert.equal(stepLabel('some_new_tool'), 'some new tool');
});

test('the phase between two tools is a row; the phase during a tool is not', () => {
  const during = run([
    start('a', 'render_view', T0),
    { type: 'phase', at: T0 + 100, phase: 'rendering' },
    end('a', T0 + 1000, { durationMs: 1000 }),
  ]);
  assert.equal(during.phases[0].steps.length, 1, 'the tool is the better evidence for its own span');

  const between = run([
    start('a', 'render_view', T0),
    end('a', T0 + 100, { durationMs: 100 }),
    { type: 'phase', at: T0 + 500, phase: 'critiquing' },
    start('b', 'create_instances', T0 + 900),
    end('b', T0 + 1000, { durationMs: 100 }),
  ]);
  assert.deepEqual(kinds(between), ['rendering', 'critiquing', 'building']);
  assert.equal(between.phases[1].elapsed.ms, 400);
});

test('a covered announcement never swallows the uncovered one that follows it', () => {
  const r = run([
    start('a', 'create_instances', T0),
    { type: 'phase', at: T0 + 50, phase: 'building' }, // inside the tool span
    end('a', T0 + 100, { durationMs: 100 }),
    { type: 'phase', at: T0 + 400, phase: 'building' }, // the model, between tools
    start('b', 'render_view', T0 + 900),
    end('b', T0 + 1000, { durationMs: 100 }),
  ]);
  // The second `building` announcement survives: it was not covered by a tool,
  // and it is not redundant with the `rendering` step that follows. Had the
  // covered one collapsed it as a duplicate, its 500ms of model time would be
  // missing from the timeline entirely.
  assert.deepEqual(kinds(r), ['building', 'rendering']);
  assert.equal(r.phases[0].steps.length, 2);
  assert.equal(r.phases[0].elapsed.ms, 900);
});

test('the announcement that merely introduces the next tool is dropped, not printed twice', () => {
  // The worker broadcasts agent_status immediately before the tool_start it
  // describes, so keeping both would say "Rendering" twice and hang a ~0ms clock
  // on the first of them.
  const r = run([
    { type: 'phase', at: T0, phase: 'rendering' },
    start('a', 'render_view', T0 + 2),
    end('a', T0 + 700, { durationMs: 698 }),
  ]);
  assert.deepEqual(kinds(r), ['rendering']);
  assert.equal(r.phases[0].steps.length, 1);
  assert.equal(r.phases[0].steps[0].label, 'Rendered the scene');
});

test('an unnamed step joins the phase that was open, without renaming it', () => {
  // The live case: the auto visual critique emits a tool_end with no tool_start,
  // preceded by an agent_status of `critiquing`. The heading is the state the
  // worker announced; the row itself still refuses to guess the step's name.
  const r = run([
    start('a', 'create_instances', T0),
    end('a', T0 + 100, { durationMs: 100 }),
    { type: 'phase', at: T0 + 200, phase: 'critiquing' },
    end('auto_3', T0 + 900), // no start, and `tool_end` carries no duration
  ]);
  assert.deepEqual(kinds(r), ['building', 'critiquing']);
  assert.equal(r.phases[1].steps.length, 2);
  assert.equal(r.phases[1].steps[1].label, 'A step with no reported name');
  assert.equal(r.phases[1].kind, 'critiquing', 'the heading is not rewritten by an unnamed row');
});

test('a step that started and never reported is `unknown`, not `failed`', () => {
  const r = run([
    start('a', 'run_and_check', T0),
    { type: 'run_end', at: T0 + 5000, stopReason: 'error', error: 'Studio disconnected' },
  ]);
  const [step] = r.phases[0].steps;
  assert.equal(step.state, 'unknown', 'the wire never said it failed, only that no result came');
});

test('while the run is live an unfinished step is active, and its elapsed advances', () => {
  const r = reduceActivity({
    events: [start('a', 'render_view', T0)],
    now: T0 + 2500,
    streaming: true,
  });
  const [step] = r.phases[0].steps;
  assert.equal(step.state, 'active');
  assert.equal(step.elapsed.ms, 2500);
  assert.equal(r.phases[0].state, 'active');
});

// ---------------------------------------------------------------------------
// 5. Elapsed time never becomes fiction
// ---------------------------------------------------------------------------

test('a phase whose starts were all observed reports wall time, gaps included', () => {
  const r = run([
    start('a', 'get_project_tree', T0),
    end('a', T0 + 100, { durationMs: 100 }),
    // Same kind on purpose: this measures ONE phase's clock, so both tools have
    // to land in one phase. `read_script` used to sit here and now opens its own.
    start('b', 'inspect_model', T0 + 900),
    end('b', T0 + 1000, { durationMs: 100 }),
  ]);
  assert.equal(r.phases[0].elapsed.basis, 'wall');
  assert.equal(r.phases[0].elapsed.ms, 1000, 'the 800ms between the tools is real time too');
});

test('a phase whose starts were replayed reports measured tool time, and says so', () => {
  // eventsFromTurn omits tool_start for an unobserved start, exactly as a
  // run_state replay does — every tool there carries the RUN's start, not its own.
  const events = eventsFromTurn({
    tools: [
      { toolId: 'a', tool: 'get_project_tree', summary: 's', ok: true, startedAt: T0, durationMs: 100, done: true, startObserved: false },
      { toolId: 'b', tool: 'inspect_model', summary: 's', ok: true, startedAt: T0, durationMs: 400, done: true, startObserved: false },
    ],
  });
  const r = run(events);
  assert.equal(r.phases[0].elapsed.basis, 'tool');
  assert.equal(r.phases[0].elapsed.ms, 500, 'the sum of what was measured, not a wall clock we never watched');
});

test('a phase with no measurable duration reports none rather than zero', () => {
  const r = run([end('ghost', T0 + 1000)]); // no start, no durationMs
  assert.equal(r.phases[0].elapsed, undefined);
});

test('formatElapsed never rounds an unfinished figure up into a round number', () => {
  assert.equal(formatElapsed({ ms: 340, basis: 'wall' }), '0.3s');
  assert.equal(formatElapsed({ ms: 4200, basis: 'wall' }), '4.2s');
  assert.equal(formatElapsed({ ms: 42_400, basis: 'wall' }), '42s');
  assert.equal(formatElapsed({ ms: 64_000, basis: 'wall' }), '1m 04s');
  assert.equal(formatElapsed(undefined), '');
});

// ---------------------------------------------------------------------------
// 6. Terminal state
// ---------------------------------------------------------------------------

test('no msg_end means no terminal row — a run whose outcome we never saw says nothing', () => {
  const r = run([start('a', 'render_view', T0), end('a', T0 + 100, { durationMs: 100 })]);
  assert.equal(r.terminal, null);
});

test('a clean finish is `done`', () => {
  const r = run([
    start('a', 'render_view', T0),
    end('a', T0 + 100, { durationMs: 100 }),
    { type: 'run_end', at: T0 + 200, stopReason: 'done' },
  ]);
  assert.equal(r.terminal.kind, 'done');
  assert.equal(r.terminal.failures, 0);
});

test('a finish after a real failure is `recovered`, and counts the failures', () => {
  const r = run([
    start('a', 'run_luau', T0),
    end('a', T0 + 100, { ok: false, durationMs: 100 }),
    start('b', 'run_luau', T0 + 200),
    end('b', T0 + 300, { durationMs: 100 }),
    { type: 'run_end', at: T0 + 400, stopReason: 'done' },
  ]);
  assert.equal(r.terminal.kind, 'recovered');
  assert.equal(r.terminal.failures, 1);
  assert.match(r.terminal.note, /recovering/);
});

test('each stopReason keeps its own terminal state and its own words', () => {
  const of = (stopReason) => run([{ type: 'run_end', at: T0, stopReason }]).terminal;
  assert.equal(of('error').kind, 'failed');
  assert.equal(of('stopped').kind, 'stopped');
  assert.equal(of('quota').kind, 'quota');
  assert.equal(of('incomplete').kind, 'incomplete');
  const notes = new Set(['error', 'stopped', 'quota', 'incomplete', 'done'].map((s) => of(s).note));
  assert.equal(notes.size, 5, 'five different outcomes must not share one sentence');
});

test("the worker's own error text is carried through, never paraphrased", () => {
  const r = run([{ type: 'run_end', at: T0, stopReason: 'error', error: 'Studio closed the socket' }]);
  assert.equal(r.terminal.error, 'Studio closed the socket');
});

test('a phase whose last step failed is failed; an earlier failure it survived is counted, not shouted', () => {
  const r = run([
    start('a', 'run_luau', T0),
    end('a', T0 + 100, { ok: false, durationMs: 100 }),
    start('b', 'run_luau', T0 + 200),
    end('b', T0 + 300, { durationMs: 100 }),
  ]);
  assert.equal(r.phases[0].state, 'done');
  assert.equal(r.phases[0].failures, 1);
});

// ---------------------------------------------------------------------------
// 7. Upcoming steps come only from what the backend announced
// ---------------------------------------------------------------------------

test('with nothing announced there is never an upcoming row', () => {
  const r = run([start('a', 'render_view', T0), end('a', T0 + 100, { durationMs: 100 })]);
  assert.deepEqual(r.upcoming, []);
});

test('an announced step is upcoming; one that already happened is dropped', () => {
  const r = reduceActivity({
    events: [start('a', 'render_view', T0), end('a', T0 + 100, { durationMs: 100 })],
    upcoming: [
      { key: 'p1', title: 'Lay out a seating cluster' },
      { key: 'p2', title: 'rendered the scene' },
    ],
    now: T0 + 1000,
    streaming: false,
  });
  assert.deepEqual(
    r.upcoming.map((s) => s.label),
    ['Lay out a seating cluster'],
  );
});

// ---------------------------------------------------------------------------
// 8. The adapter and the reducer agree
// ---------------------------------------------------------------------------

test('a merged turn and a live log produce the same timeline', () => {
  const live = run([
    start('a', 'get_project_tree', T0),
    end('a', T0 + 100, { durationMs: 100, summary: 'Read 386 instances' }),
    start('b', 'render_view', T0 + 200),
    end('b', T0 + 900, { durationMs: 700, summary: 'Rendered 5 views' }),
    { type: 'run_end', at: T0 + 1000, stopReason: 'done' },
  ]);
  const merged = run(
    eventsFromTurn({
      tools: [
        { toolId: 'a', tool: 'get_project_tree', summary: 'Read 386 instances', ok: true, startedAt: T0, durationMs: 100, done: true, startObserved: true },
        { toolId: 'b', tool: 'render_view', summary: 'Rendered 5 views', ok: true, startedAt: T0 + 200, durationMs: 700, done: true, startObserved: true },
      ],
      stopReason: 'done',
      endedAt: T0 + 1000,
    }),
  );
  assert.deepEqual(kinds(merged), kinds(live));
  assert.deepEqual(labels(merged), labels(live));
  assert.equal(merged.terminal.kind, live.terminal.kind);
  assert.deepEqual(
    merged.phases.map((p) => p.elapsed.ms),
    live.phases.map((p) => p.elapsed.ms),
  );
});

test('a stopReason with no clock to attach it to produces no terminal row', () => {
  // A reloaded conversation has no per-tool timing and no end time, so the one
  // row that says "this is over" would need a made-up timestamp. It is omitted.
  const events = eventsFromTurn({ tools: [], stopReason: 'done' });
  assert.equal(events.some((e) => e.type === 'run_end'), false);
});

// ---------------------------------------------------------------------------
// 9. Nothing anywhere claims progress
// ---------------------------------------------------------------------------

test('the reduced run never contains a percentage or a step counter', () => {
  const r = run([
    start('a', 'get_project_tree', T0),
    end('a', T0 + 100, { durationMs: 100 }),
    { type: 'phase', at: T0 + 200, phase: 'planning' },
    start('b', 'run_and_check', T0 + 300),
    end('b', T0 + 400, { ok: false, durationMs: 100 }),
    { type: 'run_end', at: T0 + 500, stopReason: 'done' },
  ]);
  const json = JSON.stringify(r);
  assert.equal(json.includes('%'), false);
  assert.equal(/\b\d+\s*(of|\/)\s*\d+\b/.test(json), false, 'no "3 of 9" — a step counter is not progress');
});

// ---------------------------------------------------------------------------
// 10. Motion policy
// ---------------------------------------------------------------------------

test('reduced motion removes travel and keeps feedback', () => {
  const still = motionPlan(true);
  assert.equal(still.travel, false);
  assert.equal(still.feedback, true);
  assert.equal(still.className, 'is-still');
});

test('with no motion preference the timeline may travel', () => {
  const moving = motionPlan(false);
  assert.equal(moving.travel, true);
  assert.equal(moving.feedback, true);
  assert.equal(moving.className, 'is-moving');
});

test('the announcement derived from a tool is dropped even when their vocabularies differ', () => {
  // THE REGRESSION THE C-SERIES SPLIT CAUSED, and the reason the suppression compares
  // the wire PHASE rather than the web's kind.
  //
  // The worker sets `agent.phase = phaseForTool(name)` on the line before it broadcasts
  // tool_start, so the announcement is redundant exactly when it was derived from the
  // tool that follows. Comparing kinds was the same test only while the two vocabularies
  // were one-to-one. After C04/C06/C08 were split out, the wire still announced
  // `building` before set_properties while the web called that tool `editing`, so the
  // announcement survived — as an EMPTY "Building world" heading directly above
  // "Editing project · Set properties", reinstating as its own row the exact claim the
  // split was made to remove.
  const r = run([
    phase('inspecting', T0),
    start('a', 'get_project_tree', T0 + 10),
    end('a', T0 + 100, { durationMs: 90 }),
    phase('building', T0 + 200),
    start('b', 'set_properties', T0 + 210),
    end('b', T0 + 300, { durationMs: 90 }),
    phase('inspecting', T0 + 400),
    start('c', 'read_script', T0 + 410),
    end('c', T0 + 500, { durationMs: 90 }),
  ]);

  assert.deepEqual(kinds(r), ['inspecting', 'editing', 'reading_scripts']);

  // The real signature of the phantom, and NOT `steps.length > 0`: every ActivityPhase
  // is built with one step already in it, so a zero-step phase is unrepresentable and
  // that assertion could never fire. What the phantom actually looked like was
  // "Building world :: Building world" — a phase whose only step was the ANNOUNCEMENT
  // itself, which is a step with no toolId.
  for (const phase of r.phases) {
    for (const step of phase.steps) {
      assert.ok(
        step.toolId !== undefined,
        `"${phase.label}" contains the announcement "${step.label}" as a step — it was not suppressed`,
      );
    }
  }
});

test('an announcement separated from the next tool by real thinking time is kept', () => {
  // The suppression's justification has always been that the announcement is broadcast
  // immediately before the tool_start it describes. session.ts also re-broadcasts the
  // STICKY previous phase at the top of every step, before the model call — so an
  // announcement can sit seconds of measured model time away from the tool that
  // follows, and deleting it deletes a duration the user is entitled to see.
  const r = run([
    phase('building', T0),
    start('a', 'set_properties', T0 + 45_000),
    end('a', T0 + 45_100, { durationMs: 100 }),
  ]);
  assert.equal(r.phases.length, 2, 'the announcement is its own row when it carries real time');
  assert.equal(r.phases[0].label, 'Building world');
  assert.ok(r.phases[0].elapsed.ms >= 44_000, `kept only ${r.phases[0].elapsed?.ms}ms of thinking`);
});

test('an unknown tool does not eat a real announcement through the phase default', () => {
  // phaseForTool answers 'building' for any name it does not recognise, and its own
  // JSDoc calls that "for a name this build has never heard of" and "NOT a resting
  // place". Comparing against it for an unknown tool would let a browser one version
  // behind a worker silently drop "Building world" whenever the default coincided.
  const r = run([
    phase('building', T0),
    start('a', 'some_tool_from_a_newer_worker', T0 + 10),
    end('a', T0 + 100, { durationMs: 90 }),
  ]);
  const labels = r.phases.map((p) => p.label);
  assert.ok(labels.includes('Building world'), `announcement was eaten; got ${labels.join(', ')}`);
});
