/**
 * ONE FRIENDLY LINE, NO TECHNICAL DETAIL (owner decision D-THINK-1, 2026-09-24).
 *
 * The owner: "you basically see what it is doing in steps, and the steps disappear so they do not pile
 * up ... and there must be no way at all to see technical details". Customers are young, non-technical
 * Roblox creators.
 *
 * Held two ways: the phrase helper (lib/live-status.ts) on real activity, and whole Turns rendered to
 * the markup a browser receives — a live one and settled ones built to be full of the things that
 * must not show (tool names, instance paths, JSON, durations, error codes, doc links, disclosures).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEB, bundle, count, renderWith, text } from './ui-bundle.mjs';

const SRC = join(WEB, 'src');
const live = await import(pathToFileURL(join(SRC, 'lib/live-status.ts')).href);
const activity = await import(pathToFileURL(join(SRC, 'components/ws/activity-model.ts')).href);
const { TOOL } = await import(pathToFileURL(join(SRC, 'components/ws/tool-vocabulary.ts')).href);

const T0 = 1_700_000_000_000;
const run = (tools, { streaming = true, stopReason, error } = {}) =>
  activity.reduceActivity({
    events: activity.eventsFromTurn({ tools, stopReason, error, endedAt: streaming ? undefined : T0 + 9000 }),
    now: T0 + 10_000,
    streaming,
  });
const tool = (toolId, name, extra = {}) => ({
  toolId, tool: name, summary: name, ok: true, done: true, startedAt: T0 + Number(toolId.slice(1)) * 1000,
  durationMs: 700, startObserved: true, ...extra,
});

// ---------------------------------------------------------------- the phrases ---

test('every tool has a present-tense phrase, and none of them says a tool name', () => {
  const names = Object.keys(TOOL);
  assert.ok(names.length >= 50, `read ${names.length} tools; the check below would be vacuous`);
  for (const [name, spec] of Object.entries(TOOL)) {
    assert.match(spec.live, /^[A-Z][a-z-]*ing\b/, `${name}: "${spec.live}" does not read as something happening now`);
    if (spec.on) assert.match(spec.on, /^[A-Z][a-z-]*ing\b.*\{\}/, `${name}: its named form has no place for the name`);
    for (const phrase of [spec.live, spec.on ?? '']) {
      assert.doesNotMatch(phrase, /_|[A-Z][a-z]+[A-Z]/, `${name}: "${phrase}" reads like code`);
    }
  }
});

test('an object name becomes plain words, or nothing when that would be a guess', () => {
  assert.equal(live.friendlyName('game.Workspace.Market.Stall1'), 'stall');
  assert.equal(live.friendlyName('ServerScriptService.CoinScript'), 'coin script');
  assert.equal(live.friendlyName('StarterGui.ShopGui'), 'shop screen');
  assert.equal(live.friendlyName('Tree1, Tree2, Tree3 +4 more'), 'trees');
  assert.equal(live.friendlyName('Tree1, Rock2'), null, 'two different things are not one name');
  assert.equal(live.friendlyName('game.Workspace'), null, 'a container is not a thing a creator made');
  assert.equal(live.friendlyName('{"t":"Vector3"}'), null);
  assert.equal(live.friendlyName('Part[3]'), null);
  assert.equal(live.friendlyName('VeryLongGeneratedNameForSomethingElse'), null);
  assert.equal(live.friendlyName(undefined), null);
});

test('the line names the step running now, in words, and falls back to a friendly generic', () => {
  assert.equal(live.toolPhrase('set_properties', 'game.Workspace.Shop'), 'Editing the shop');
  assert.equal(live.toolPhrase('edit_script', 'ServerScriptService.CoinScript'), 'Writing the coin script');
  assert.equal(live.toolPhrase('edit_script', 'ServerScriptService.Coins'), 'Writing the coins script');
  assert.equal(live.toolPhrase('set_properties', 'game.Workspace'), 'Tweaking the details');
  assert.equal(live.toolPhrase('scatter_instances'), 'Placing things around the map');
  assert.equal(live.toolPhrase('a_tool_from_the_future', 'x'), live.GENERIC_PHRASE);
  assert.equal(live.toolPhrase(undefined), live.GENERIC_PHRASE);
  assert.doesNotMatch(live.GENERIC_PHRASE, /_/);
});

test('only the running step speaks; finished ones are gone from the line', () => {
  const r = run([tool('t1', 'get_project_tree'), tool('t2', 'set_properties', { done: false, ok: undefined, target: 'game.Workspace.Market.Stall1' })]);
  assert.equal(live.livePhrase(r), 'Editing the stall');
  assert.equal(live.livePhrase(run([])), 'Reading your idea');
  assert.equal(live.livePhrase(run([]), 'playtesting'), 'Playing your game');
});

test('a finished run keeps at most one line, and only when it went well', () => {
  const tools = [tool('t1', 'create_instances'), tool('t2', 'edit_script'), tool('t3', 'play_check'), tool('t4', 'create_instances')];
  assert.equal(live.doneSummary(run(tools, { streaming: false, stopReason: 'done' })), 'Built, scripted and playtested your game');
  assert.equal(live.doneSummary(run([tool('t1', 'read_script')], { streaming: false, stopReason: 'done' })), null, 'reading is not a change');
  assert.equal(live.doneSummary(run(tools, { streaming: false, stopReason: 'error', error: 'rate_limited' })), null);
  assert.equal(live.doneSummary(run(tools, { streaming: false, stopReason: 'stopped' })), null);
});

test('bounded placement completion describes edits without claiming visual polish', () => {
  const bounded = run([tool('t1', 'transform_instances'), tool('t2', 'transform_instances'), tool('t3', 'move_instances'), tool('t4', 'move_instances')], { streaming: false, stopReason: 'done' });
  const summary = live.doneSummary(bounded);
  assert.ok(summary);
  assert.doesNotMatch(summary, /polished|finished|complete|ready/i);
});

// ------------------------------------------------------------- the turn, rendered ---

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { Turn } from './src/components/ws/turn';
`, { name: 'live-status', resolveDir: WEB });

const JSONISH = '{"t":"Vector3","v":[1,2,3]}';
const busy = [
  tool('t1', 'get_project_tree', { summary: 'Read 41 instances', durationMs: 1234 }),
  tool('t2', 'search_docs', { summary: 'Found 3 pages', detail: [{ title: 'TweenService', url: 'https://create.roblox.com/docs/reference/engine/classes/TweenService', excerpt: 'x' }] }),
  tool('t3', 'create_instances', { summary: `Created game.Workspace.Market.Stall1 ${JSONISH}`, target: 'Stall1, Stall2', durationMs: 5100 }),
  tool('t4', 'set_properties', { ok: false, summary: 'E_PATH_NOT_FOUND game.Workspace.Nope', target: 'game.Workspace.Nope' }),
];

function turn(item, extra = {}) {
  return renderWith(ui.renderToStaticMarkup, ui.h(ui.Turn, { status: null, isLast: true, ...extra, item: {
    id: 'm1', role: 'assistant', content: '', streaming: false, createdAt: T0, ...item,
  } }));
}

/** Everything a customer could read or open in the turn: the text, and every attribute a reader announces. */
function visible(html) {
  const attrs = [...html.matchAll(/\s(?:title|aria-label|alt|href)="([^"]*)"/g)].map((m) => m[1]).join('\n');
  return `${text(html)}\n${attrs}`;
}

function assertNothingTechnical(html, where) {
  const seen = visible(html);
  const names = Object.keys(TOOL).filter((name) => new RegExp(`\\b${name}\\b`).test(seen));
  assert.deepEqual(names, [], `${where}: a tool name reached the customer`);
  assert.doesNotMatch(seen, /\bgame\.|Workspace\.|Stall1|Stall2|Nope/, `${where}: an instance path or raw object name reached the customer`);
  assert.doesNotMatch(seen, /[{}]|Vector3/, `${where}: JSON reached the customer`);
  assert.doesNotMatch(seen, /\b\d+(?:\.\d+)?\s?(?:ms|s)\b|\b\d+m \d+s\b|Thought for/, `${where}: a duration reached the customer`);
  assert.doesNotMatch(seen, /E_PATH_NOT_FOUND|rate_limited|\b[a-z]+_[a-z_]+\b/, `${where}: an error code reached the customer`);
  assert.doesNotMatch(seen, /Read 41 instances|Found 3 pages|documentation page/, `${where}: a step's own report reached the customer`);
  assert.doesNotMatch(html, /<details\b|aria-expanded=|aria-controls=|<pre\b/, `${where}: something can be opened to show detail`);
}

test('LIVE: one friendly line says what is happening now; finished steps are not listed', () => {
  const html = turn({ streaming: true, tools: [...busy, tool('t5', 'set_properties', { done: false, ok: undefined, target: 'game.Workspace.Market.Stall1' })] },
    { status: { phase: 'building', creditsSpent: 3 } });
  assertNothingTechnical(html, 'live turn');
  assert.equal(count(html, 'role="status"'), 1, 'exactly one status line');
  assert.match(text(html), /Editing the stall/);
  for (const earlier of ['Looking around your game', 'Looking up how Roblox does it', 'Building']) {
    assert.doesNotMatch(text(html), new RegExp(earlier), `"${earlier}" is a finished step and piled up under the line`);
  }
  assert.match(text(html), /3 Credits/, 'the running cost stays on screen');
});

test('SETTLED, worked: the reply, and at most one friendly summary line', () => {
  const html = turn({ content: 'Your market has two stalls now.', stopReason: 'done', endedAt: T0 + 9000,
    tools: busy.slice(0, 3) });
  assertNothingTechnical(html, 'settled turn');
  assert.match(text(html), /Your market has two stalls now\./);
  assert.ok((html.match(/class="apple-status__line"/g) ?? []).length <= 1, 'more than one status line on a settled turn');
  assert.match(text(html), /Built your game/, 'the one line a finished build keeps');
});

test('SETTLED, failed: one plain sentence, and Try again still works', () => {
  const html = turn({ content: '', stopReason: 'error', error: 'rate_limited', endedAt: T0 + 9000, tools: busy }, { onRetry: () => {} });
  assertNothingTechnical(html, 'failed turn');
  assert.match(html, /Try again/);
});

test('SETTLED, the model wrote its build instruction out as text: the JSON is not shown or openable', () => {
  const spill = '{"t":"Vector3","v":[4,1,4]} {"t":"Vector3","v":[0,2,0]} {"t":"Color3","v":[1,1,1]}';
  const html = turn({ content: `Here is the shop.\n${spill}`, stopReason: 'done', endedAt: T0 + 9000, tools: [] });
  assert.match(text(html), /Here is the shop\./);
  assert.doesNotMatch(visible(html), /Vector3|Color3|[{}]/, 'the spilled payload is on screen');
  assert.doesNotMatch(html, /<details\b|<pre\b/, 'the spilled payload can still be opened');
});
