/**
 * THE THINKING SURFACE — what it shows, rendered, and what it must never show.
 *
 * RESTATED 2026-09-24 (owner decision D-THINK-1). This file used to hold the rules of the Thinking
 * CARD: a Reasoning disclosure, a ChainOfThought of tool rows with On / Result / Time facts, earlier
 * steps behind a header, Details, and the playtest card inside it. The owner replaced all of it: a
 * running turn shows ONE friendly line about the step running now, the steps do not pile up, and
 * there is no way to open technical detail. The honesty rules survive in the new shape:
 *
 *   * nothing is drawn for a run nobody observed (no placeholder activity);
 *   * a tool's untrusted `detail` payload, its summary, its target path and its timing never reach
 *     the markup — now for every step, not only the closed ones;
 *   * a failure is never painted as work done, and the run-level sentence stays with the turn's
 *     outcome row (outcome-model.ts);
 *   * nothing outside ai-elements prints ToolInput / ToolOutput.
 *
 * The phrase rules themselves are held in tests/live-status.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEB, bundle, count, decomment, renderWith, text } from './ui-bundle.mjs';

const SRC = join(WEB, 'src');
const activity = await import(pathToFileURL(join(SRC, 'components/ws/activity-model.ts')).href);

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { Thinking } from './src/components/ws/thinking';
`, { name: 'thinking-surface', resolveDir: WEB });
const render = (props) => renderWith(ui.renderToStaticMarkup, ui.h(ui.Thinking, { status: null, streaming: false, ...props }));

const T0 = 1_700_000_000_000;
let clock = T0;
function tool(name, over = {}, duration = 800) {
  const startedAt = clock;
  clock += duration + 500;
  return { toolId: `${name}-${startedAt}`, tool: name, summary: name, ok: true, startedAt, durationMs: duration, done: true, startObserved: true, ...over };
}
function run(tools, { streaming = false, stopReason, error, now = clock + 1000 } = {}) {
  return activity.reduceActivity({
    events: activity.eventsFromTurn({ tools, stopReason, error, endedAt: stopReason ? clock : undefined }),
    now,
    streaming,
  });
}

// The canary a tool's untrusted structured payload carries, and the facts the old rows printed.
const DETAIL = { canary: 'DETAIL_CANARY_7f3a', nested: { json: 'DETAIL_JSON_9c1e' } };
const LEAKS = /DETAIL_CANARY|DETAIL_JSON|SUMMARY_CANARY|ServerScriptService|\bMain\b|\d+(?:\.\d+)?\s?(?:ms|s)\b|[{}]/;
/** The markup with inline styles removed: a CSS duration is decoration, not a fact about the run. */
const shown = (html) => html.replace(/\sstyle="[^"]*"/g, '');

test('an unobserved run draws nothing at all', () => {
  assert.equal(render({ activity: activity.reduceActivity({ events: [], now: T0, streaming: false }) }), '');
});

test('LIVE: one line about the running step; no row, fact, payload or timing of any step', () => {
  clock = T0;
  const tools = [
    tool('get_project_tree', { summary: 'SUMMARY_CANARY read 40', detail: DETAIL }),
    tool('edit_script', { summary: 'SUMMARY_CANARY wrote', target: 'ServerScriptService.Main', detail: DETAIL }, 4200),
    tool('set_properties', { done: false, ok: undefined, target: 'game.Workspace.Shop', detail: DETAIL }),
  ];
  const html = render({ streaming: true, activity: run(tools, { streaming: true }) });
  assert.equal(count(html, 'class="apple-status__line"'), 1, 'exactly one line');
  assert.match(text(html), /Editing the shop/);
  assert.doesNotMatch(text(html), /Looking around|Writing the main/, 'a finished step is still on screen');
  assert.doesNotMatch(shown(html), LEAKS);
  assert.doesNotMatch(html, /<button\b|aria-expanded|aria-controls|<details\b/, 'there is something to open');
});

test('SETTLED: a recovered run keeps one quiet line and no failure mark', () => {
  clock = T0;
  const html = render({ activity: run([tool('create_instances', { ok: false, detail: DETAIL }), tool('create_instances', { summary: 'SUMMARY_CANARY' })], { stopReason: 'done' }) });
  assert.equal(count(html, 'class="apple-status__line"'), 1);
  assert.match(text(html), /^Built your game$/);
  assert.doesNotMatch(html, /is-bad|error|fail/i, 'a recovered attempt is painted as a failure');
  assert.doesNotMatch(shown(html), LEAKS);
});

test('SETTLED: a failed or stopped run says nothing here — the outcome row says it once', () => {
  clock = T0;
  const failed = render({ activity: run([tool('get_project_tree'), tool('insert_asset', { ok: false })], { stopReason: 'error', error: 'model_failed' }) });
  assert.equal(failed, '', 'the failure is painted in the Thinking area as well as the outcome row');
  clock = T0;
  assert.equal(render({ activity: run([tool('create_instances')], { stopReason: 'stopped' }) }), '');
});

test('tools the run was not given: one plain sentence, never a tool name', () => {
  clock = T0;
  const html = render({ activity: run([tool('get_project_tree')], { stopReason: 'done' }), deniedTools: ['delete_instances', 'run_luau'] });
  assert.match(text(html), /turned off in your settings/);
  assert.doesNotMatch(text(html), /delete|luau|_/i);
  assert.equal(render({ activity: run([tool('get_project_tree')], { stopReason: 'done' }), deniedTools: [] }), '', 'nothing withheld is no line');
});

test('nothing outside ai-elements renders ToolInput or ToolOutput, which print JSON payloads', () => {
  const offenders = [];
  let read = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== 'ai-elements') walk(path);
      } else if (/\.(?:ts|tsx)$/.test(entry)) {
        read++;
        if (/\bTool(?:Input|Output)\b/.test(decomment(readFileSync(path, 'utf8')))) offenders.push(relative(SRC, path));
      }
    }
  };
  walk(SRC);
  assert.ok(read > 100, `only ${read} source files read`);
  assert.deepEqual(offenders, []);
  assert.match(readFileSync(join(SRC, 'components/ai-elements/tool.tsx'), 'utf8'), /export const ToolInput\b/, 'the scan would be vacuous without the export it looks for');
});

test('the morph and the orb stop for a reader who asked for less motion', () => {
  const css = decomment(readFileSync(join(SRC, 'components/ws/thinking.css'), 'utf8'));
  const animated = [...css.matchAll(/([^{}]+)\{[^}]*\banimation\s*:\s*(?!none)[^;}]+/g)].map((m) => m[1].trim());
  assert.ok(animated.length >= 3, `found ${animated.length} animated rules; the check would be vacuous`);
  const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  for (const selector of animated) {
    const last = selector.split(',').pop().trim().split(/\s+/).pop().replace(/\.is-[a-z]+$/, '');
    assert.ok(reduced.includes(last.replace(/::before$/, '')), `${selector} keeps moving under reduced motion`);
  }
  assert.match(reduced, /\.is-leaving \{ display:none; \}/, 'the leaving words are not drawn at all');
  assert.match(css, /\.motion-reduced \.apple-status__phrase\.is-leaving \{ display:none; \}/, 'the app\'s own switch too');
});
