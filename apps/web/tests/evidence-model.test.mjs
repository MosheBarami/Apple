/**
 * Evidence cards: four kinds, four states, no fabrication.
 *
 * The card is where a wrong answer would be most persuasive — a thumbnail, a
 * diff and a pass/fail bar all LOOK like proof. So the properties pinned here
 * are about what a card refuses to draw:
 *
 *   * a tool that returned no structured result gets NO card at all — an
 *     absence is not an error and not an empty result;
 *   * a render whose views carry no pixels is `empty`, never a row of grey
 *     rectangles labelled as a render;
 *   * "the tool failed" and "the result was unreadable" stay separate, because
 *     they are different events with different fixes;
 *   * the loading skeleton is shaped by the tool NAME, which is genuinely known
 *     at `tool_start` — that is the only reason a card may exist before a result.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_COPY,
  FAULT_COPY,
  LOADING_COPY,
  buildEvidence,
  evidenceFor,
  evidenceKindForTool,
} from '../src/components/ws/evidence-model.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const source = (over = {}) => ({
  toolId: over.toolId ?? 't1',
  tool: over.tool ?? 'render_view',
  summary: over.summary,
  ok: over.ok,
  done: over.done ?? true,
  hasDetail: over.hasDetail ?? true,
});

const doc = (...blocks) => ({ v: 1, blocks });

// ---------------------------------------------------------------------------
// 1. Which tools produce a card at all
// ---------------------------------------------------------------------------

test('only tools whose result reliably carries a block get a card', () => {
  assert.equal(evidenceKindForTool('render_view'), 'render');
  assert.equal(evidenceKindForTool('edit_script'), 'diff');
  assert.equal(evidenceKindForTool('run_and_check'), 'test');
  assert.equal(evidenceKindForTool('search_asset_library'), 'assets');
  assert.equal(evidenceKindForTool('find_verified_asset'), 'assets');
});

test('the visual gates get no card — their verdict is already the Validation row', () => {
  // Drawing the critique here as well would make one judgement look like two.
  assert.equal(evidenceKindForTool('visual_critique'), null);
  assert.equal(evidenceKindForTool('check_composition'), null);
  assert.equal(evidenceKindForTool('inspect_visually'), null);
});

test('an unknown tool gets no card rather than a generic one', () => {
  assert.equal(evidenceKindForTool('some_new_tool'), null);
  assert.equal(evidenceFor(source({ tool: 'some_new_tool' }), null), null);
});

test('a finished tool that sent no structured result draws nothing', () => {
  // An absence is not an error and not an empty result. It gets no box.
  assert.equal(evidenceFor(source({ hasDetail: false }), null), null);
});

// ---------------------------------------------------------------------------
// 2. Loading — the shape is known before the result is
// ---------------------------------------------------------------------------

test('every card kind has a loading state, shaped by the tool name alone', () => {
  const kinds = [
    ['render_view', 'render'],
    ['edit_script', 'diff'],
    ['run_and_check', 'test'],
    ['search_asset_library', 'assets'],
  ];
  for (const [tool, kind] of kinds) {
    const e = evidenceFor(source({ tool, done: false, hasDetail: false }), null);
    assert.equal(e.state, 'loading', `${tool} should show a ${kind} skeleton`);
    assert.equal(e.kind, kind);
    assert.ok(LOADING_COPY[kind].length > 0);
  }
});

test('a running tool is loading even though it has sent no detail yet', () => {
  const e = evidenceFor(source({ done: false, hasDetail: false }), null);
  assert.equal(e.state, 'loading');
  assert.equal(e.fault, undefined);
});

// ---------------------------------------------------------------------------
// 3. Error — two faults, two sentences
// ---------------------------------------------------------------------------

test('a tool that reported failure is an error card with the tool_failed fault', () => {
  const e = evidenceFor(source({ ok: false, summary: 'Studio refused the render' }), null);
  assert.equal(e.state, 'error');
  assert.equal(e.fault, 'tool_failed');
  assert.equal(e.note, 'Studio refused the render', "the worker's own words, unedited");
});

test('a result that was sent but did not validate is unreadable, not a failure', () => {
  const e = evidenceFor(source({ ok: true, hasDetail: true }), null);
  assert.equal(e.state, 'error');
  assert.equal(e.fault, 'unreadable');
  assert.notEqual(FAULT_COPY.unreadable, FAULT_COPY.tool_failed, 'two events, two sentences');
});

test('every card kind can express both faults', () => {
  for (const tool of ['render_view', 'edit_script', 'run_and_check', 'search_asset_library']) {
    assert.equal(evidenceFor(source({ tool, ok: false }), null).fault, 'tool_failed');
    assert.equal(evidenceFor(source({ tool, ok: true }), null).fault, 'unreadable');
  }
});

// ---------------------------------------------------------------------------
// 4. Render card
// ---------------------------------------------------------------------------

test('a render with pixels is ready and carries only the views that exist', () => {
  const e = evidenceFor(
    source({ summary: 'Rendered 2 views' }),
    doc({
      type: 'render_review',
      subject: 'Lobby',
      score: 6.5,
      passed: false,
      views: [
        { name: 'hero', image: { src: PNG, alt: 'hero' }, coverage: 0.42 },
        { name: 'top', image: { src: PNG, alt: 'top' } },
      ],
    }),
  );
  assert.equal(e.state, 'ready');
  assert.equal(e.subject, 'Lobby');
  assert.equal(e.score, 6.5);
  assert.equal(e.views.length, 2);
  assert.equal(e.views[0].coverage, 0.42);
});

test('a render whose views carry no pixels is empty, not a row of grey rectangles', () => {
  const e = evidenceFor(
    source(),
    doc({ type: 'render_review', subject: 'Lobby', views: [{ name: 'hero' }, { name: 'top' }] }),
  );
  assert.equal(e.state, 'empty');
  assert.equal(EMPTY_COPY.render, 'The render came back with no pixels.');
});

test('a validated document with no render block at all is empty', () => {
  const e = evidenceFor(source(), doc({ type: 'text', text: 'nothing to see' }));
  assert.equal(e.state, 'empty');
  assert.equal(e.kind, 'render');
});

// ---------------------------------------------------------------------------
// 5. Diff card
// ---------------------------------------------------------------------------

test('a diff counts real added and removed lines and samples only the changed ones', () => {
  const e = evidenceFor(
    source({ tool: 'edit_script' }),
    doc({
      type: 'code_diff',
      path: 'ServerScriptService/Main',
      language: 'luau',
      hunks: [
        {
          lines: [
            { kind: 'ctx', text: 'local x = 1', n: 1 },
            { kind: 'del', text: 'local y = 2', n: 2 },
            { kind: 'add', text: 'local y = 3', n: 2 },
            { kind: 'add', text: 'local z = 4', n: 3 },
          ],
        },
      ],
    }),
  );
  assert.equal(e.state, 'ready');
  assert.equal(e.added, 2);
  assert.equal(e.removed, 1);
  assert.equal(e.path, 'ServerScriptService/Main');
  assert.deepEqual(
    e.sample.map((l) => l.kind),
    ['del', 'add', 'add'],
    'context lines are not the change',
  );
});

test('a diff of context lines only changed nothing and is empty', () => {
  const e = evidenceFor(
    source({ tool: 'edit_script' }),
    doc({ type: 'code_diff', path: 'a', hunks: [{ lines: [{ kind: 'ctx', text: 'same' }] }] }),
  );
  assert.equal(e.state, 'empty');
  assert.equal(e.added, 0);
  assert.equal(e.removed, 0);
});

test('a diff with no hunks at all is empty', () => {
  const e = evidenceFor(source({ tool: 'edit_script' }), doc({ type: 'code_diff', path: 'a', hunks: [] }));
  assert.equal(e.state, 'empty');
});

test('the diff sample is capped so the card stays a card', () => {
  const lines = Array.from({ length: 40 }, (_, i) => ({ kind: 'add', text: `line ${i}`, n: i }));
  const e = evidenceFor(source({ tool: 'edit_script' }), doc({ type: 'code_diff', path: 'a', hunks: [{ lines }] }));
  assert.equal(e.added, 40, 'the COUNT is the whole truth');
  assert.equal(e.sample.length, 6, 'the excerpt is an excerpt');
});

// ---------------------------------------------------------------------------
// 6. Test-result card
// ---------------------------------------------------------------------------

test('a test report reports its own counts and names the failing cases', () => {
  const e = evidenceFor(
    source({ tool: 'run_and_check' }),
    doc({
      type: 'test_report',
      title: 'Playtest · 6s',
      passed: 3,
      failed: 1,
      skipped: 1,
      durationMs: 6000,
      cases: [
        { name: 'spawns a player', status: 'pass' },
        { name: 'door opens', status: 'fail', message: 'Touched never fired' },
        { name: 'skipped one', status: 'skip' },
      ],
    }),
  );
  assert.equal(e.state, 'ready');
  assert.equal(e.passed, 3);
  assert.equal(e.failed, 1);
  assert.equal(e.skipped, 1);
  assert.deepEqual(e.failing, [{ name: 'door opens', message: 'Touched never fired' }]);
});

test('a run that reported no cases and no counts is empty', () => {
  const e = evidenceFor(
    source({ tool: 'run_and_check' }),
    doc({ type: 'test_report', passed: 0, failed: 0, cases: [] }),
  );
  assert.equal(e.state, 'empty');
  assert.equal(e.title, 'Playtest');
});

test('a report with counts but no case list is still real evidence', () => {
  const e = evidenceFor(
    source({ tool: 'run_and_check' }),
    doc({ type: 'test_report', passed: 4, failed: 0, cases: [] }),
  );
  assert.equal(e.state, 'ready');
  assert.deepEqual(e.failing, []);
});

// ---------------------------------------------------------------------------
// 7. Asset card
// ---------------------------------------------------------------------------

test('an asset search shows what it matched, thumbnail or not', () => {
  const e = evidenceFor(
    source({ tool: 'search_asset_library' }),
    doc({
      type: 'asset_picker',
      title: 'Stools',
      assets: [
        { id: '1', name: 'Bar stool', kind: 'model', thumbnail: { src: PNG, alt: 'stool' }, creator: 'Roblox' },
        { id: '2', name: 'Wooden stool', kind: 'model' },
      ],
    }),
  );
  assert.equal(e.state, 'ready');
  assert.equal(e.items.length, 2);
  assert.equal(e.items[0].src, PNG);
  assert.equal(e.items[1].src, undefined, 'a missing thumbnail stays missing');
});

test('a search that matched nothing is empty', () => {
  const e = evidenceFor(source({ tool: 'find_verified_asset' }), doc({ type: 'asset_picker', assets: [] }));
  assert.equal(e.state, 'empty');
  assert.equal(EMPTY_COPY.assets, 'The search matched no assets.');
});

// ---------------------------------------------------------------------------
// 8. Whole-turn assembly
// ---------------------------------------------------------------------------

test('buildEvidence keys by toolId and skips the steps that have none', () => {
  const map = buildEvidence(
    [
      source({ toolId: 'a', tool: 'render_view' }),
      source({ toolId: 'b', tool: 'get_project_tree' }), // no card kind
      source({ toolId: 'c', tool: 'edit_script', hasDetail: false }), // nothing returned
      source({ toolId: 'd', tool: 'run_and_check', done: false, hasDetail: false }),
    ],
    new Map([
      ['a', doc({ type: 'render_review', subject: 'Lobby', views: [{ name: 'hero', image: { src: PNG, alt: 'h' } }] })],
    ]),
  );
  assert.deepEqual([...map.keys()], ['a', 'd']);
  assert.equal(map.get('a').state, 'ready');
  assert.equal(map.get('d').state, 'loading');
});

test('every state has copy, and no two states share a sentence', () => {
  const all = [
    ...Object.values(FAULT_COPY),
    ...Object.values(EMPTY_COPY),
    ...Object.values(LOADING_COPY),
  ];
  assert.equal(all.every((s) => typeof s === 'string' && s.length > 0), true);
  assert.equal(new Set(all).size, all.length, 'distinct situations must read distinctly');
});
