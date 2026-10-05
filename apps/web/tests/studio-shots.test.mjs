/**
 * THE STUDIO SCREENSHOTS STRIP IN A TURN (M2 step 2.3, item C4).
 *
 * The worker sends a `studio_frame` message each time a tool captures Studio, and the socket hook keeps the newest eight in memory.
 * This holds what the turn does with them, by running the shipped code:
 *
 *   1. WHICH FRAMES. Only the ones stamped for this turn's own run; the last eight; oldest left, newest right; never one from an
 *      earlier run or one the worker could not attribute.
 *   2. WHAT IT SAYS. A Studio capture is a "Studio screenshot"; anything else is a "Preview render", so a preview is never read as
 *      a screenshot. With no frame yet the strip says "Studio screenshots appear here while StudPilot builds" and draws no picture.
 *   3. WHERE IT SHOWS. On the latest assistant turn while it runs, once it has a frame, or when it was a build at all. A plain chat
 *      reply, and every earlier turn, gets nothing.
 *   4. THE PERSON ONLY, IN MEMORY ONLY. The strip and its dialog persist nothing and send nothing: no storage, no request, no
 *      model. (What the worker does with a frame is its own; this page says only what this page does.)
 *   5. CLICK TO ENLARGE, with the keyboard: a thumbnail is a real button with a name, and the dialog moves earlier and later.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { findAll, loadPage, textOf } from './page-harness.mjs';
import { SHOT_LIMIT, SHOTS_EMPTY, SHOTS_KEPT, shotCaption, shotKind, shotKindLabel, shotsForTurn } from '../src/lib/studio-shots.ts';

const T0 = 1_700_000_000_000;
const frame = (n, extra = {}) => ({
  rgbBase64: 'AAAA', encoding: 'rgb24', width: 1, height: 1, view: 'eye', subject: 'game.Workspace',
  capturedAt: T0 + n * 1000, msgId: 'run-1', source: 'studio_viewport', ...extra,
});

/* ------------------------------------------------------------------ which frames --- */

test('only the frames stamped for this turn’s own run are shown', () => {
  const frames = [frame(1), frame(2, { msgId: 'run-0' }), frame(3), frame(4, { msgId: undefined }), frame(5, { msgId: 'run-2' })];
  assert.deepEqual(shotsForTurn(frames, 'run-1').map((f) => f.capturedAt), [T0 + 1000, T0 + 3000]);
  assert.deepEqual(shotsForTurn(frames, 'run-2').map((f) => f.capturedAt), [T0 + 5000]);
  assert.deepEqual(shotsForTurn(frames, 'nobody'), []);
  assert.deepEqual(shotsForTurn(frames, ''), [], 'a turn with no id owns nothing, not the frames that have no run either');
  assert.deepEqual(shotsForTurn([], 'run-1'), []);
});

test('the last eight, oldest first and newest last, placed by the worker’s capture time and not by arrival', () => {
  assert.equal(SHOT_LIMIT, 8);
  const twelve = Array.from({ length: 12 }, (_, i) => frame(i + 1));
  const shown = shotsForTurn(twelve, 'run-1');
  assert.equal(shown.length, 8);
  assert.deepEqual(shown.map((f) => f.capturedAt), [5, 6, 7, 8, 9, 10, 11, 12].map((n) => T0 + n * 1000), 'the newest eight, oldest to newest');
  const late = shotsForTurn([frame(3), frame(1), frame(2)], 'run-1');
  assert.deepEqual(late.map((f) => f.capturedAt), [1, 2, 3].map((n) => T0 + n * 1000), 'a frame that arrived out of order is placed by its capture time');
  const ties = shotsForTurn([frame(1, { view: 'a' }), frame(1, { view: 'b' })], 'run-1');
  assert.deepEqual(ties.map((f) => f.view), ['a', 'b'], 'two with one time keep the order they arrived in');
});

test('choosing the frames does not change what the page holds', () => {
  const held = [frame(2), frame(1)];
  const before = JSON.stringify(held);
  shotsForTurn(held, 'run-1');
  assert.equal(JSON.stringify(held), before);
});

/* ------------------------------------------------------------------ what it says --- */

test('a Studio capture is a screenshot; anything else is a preview render, and the caption says which and when', () => {
  assert.equal(shotKind({ source: 'studio_viewport' }), 'studio');
  for (const source of ['software_render', undefined, 'something-new']) assert.equal(shotKind({ source }), 'preview', `${source}`);
  assert.equal(shotKindLabel({ source: 'studio_viewport' }), 'Studio screenshot');
  assert.equal(shotKindLabel({}), 'Preview render');
  assert.equal(shotCaption({ source: 'studio_viewport', capturedAt: 5 }, () => '14:32'), 'Studio screenshot, 14:32');
  assert.equal(shotCaption({ source: 'software_render', capturedAt: 5 }, () => '14:32'), 'Preview render, 14:32');
  assert.equal(shotCaption({ source: 'studio_viewport', capturedAt: 5 }, () => ''), 'Studio screenshot', 'no time is never invented');
});

test('the words are exact, short and plain', () => {
  assert.equal(SHOTS_EMPTY, 'Studio screenshots appear here while StudPilot builds');
  assert.doesNotMatch(SHOTS_KEPT, /\b(model|AI|never|guarantee)\b/i, 'it claims only what this page does');
  assert.match(SHOTS_KEPT, /does not save or send them/);
});

/* ------------------------------------------------------------------ the strip, rendered --- */

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { StudioShots } from './src/components/ws/studio-shots';
  export { Turn } from './src/components/ws/turn';
`, { name: 'studio-shots', resolveDir: WEB });
const render = (el) => renderWith(ui.renderToStaticMarkup, el);

test('NO FRAME YET: the one sentence and no picture, no placeholder image', () => {
  const html = render(ui.h(ui.StudioShots, { frames: [] }));
  assert.equal(text(html), SHOTS_EMPTY);
  assert.doesNotMatch(html, /<canvas|<img|<button|<svg/, 'nothing that could be mistaken for a result');
  assert.match(html, /aria-label="Studio screenshots from this run"/);
});

test('WITH FRAMES: one named button each, in time order, a canvas for raw pixels and an image for a PNG', () => {
  const frames = [frame(1), frame(2, { encoding: 'png', rgbBase64: 'iVBORw0KGgo=' }), frame(3, { source: 'software_render' })];
  const html = render(ui.h(ui.StudioShots, { frames }));
  const buttons = [...html.matchAll(/<button[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(buttons.length, 3);
  assert.match(buttons[0], /^Enlarge screenshot 1 of 3: Studio screenshot/);
  assert.match(buttons[2], /^Enlarge screenshot 3 of 3: Preview render/, 'a preview is named a preview');
  assert.equal((html.match(/<canvas/g) ?? []).length, 2, 'raw pixels are painted into a canvas');
  assert.equal((html.match(/<img[^>]*src="data:image\/png;base64,iVBORw0KGgo="/g) ?? []).length, 1, 'a PNG is an image');
  assert.equal(text(html), '', 'a strip of pictures carries no stray words');
  assert.equal((html.match(/type="button"/g) ?? []).length, 3);
  assert.equal(/<canvas[^>]*role="img"[^>]*aria-label="Studio screenshot/.test(html), true, 'each picture has a name');
});

/* ------------------------------------------------------------------ where it shows --- */

const turn = (item, extra = {}) => render(ui.h(ui.Turn, { status: null, isLast: true, ...extra, item: {
  id: 'run-1', role: 'assistant', content: '', streaming: false, createdAt: T0, tools: [], ...item,
} }));
const strip = (html) => element(html, /<section class="shots"/);

test('A LIVE RUN with no frame yet shows the strip’s own sentence; once frames arrive it shows them', () => {
  const live = turn({ streaming: true }, { frames: [] });
  assert.equal(text(strip(live)), SHOTS_EMPTY);
  const full = turn({ streaming: true }, { frames: [frame(1), frame(2)] });
  assert.equal((strip(full).match(/shots__thumb/g) ?? []).length, 2);
});

test('A FINISHED BUILD keeps its screenshots, and one with none says where they would be', () => {
  const tool = { toolId: 't1', tool: 'create_instances', summary: 'x', ok: true, done: true, startedAt: T0, durationMs: 5, startObserved: true };
  assert.equal((strip(turn({ tools: [tool] }, { frames: [frame(1)] })).match(/shots__thumb/g) ?? []).length, 1);
  assert.equal(text(strip(turn({ tools: [tool] }, { frames: [] }))), SHOTS_EMPTY);
});

test('a plain chat reply (no tools, not running) gets no strip at all, and neither does an earlier turn', () => {
  assert.equal(strip(turn({ content: 'Sure, here is how that works.' }, { frames: [] })), null, 'a reply that built nothing');
  assert.equal(strip(turn({ content: 'x', streaming: true }, { frames: undefined })), null, 'a turn that was not offered the frames');
});

test('frames from another run are not shown under this turn', () => {
  const html = turn({ streaming: true }, { frames: [frame(1, { msgId: 'run-0' }), frame(2, { msgId: undefined })] });
  assert.equal(text(strip(html)), SHOTS_EMPTY, 'neither an earlier run’s frame nor an unattributed one is this turn’s');
});

test('the strip carries nothing technical: no tool name, path, view name or JSON', () => {
  const html = turn({ streaming: true }, { frames: [frame(1, { view: 'eye', subject: 'game.Workspace' })] });
  const seen = `${text(strip(html))}\n${[...strip(html).matchAll(/\s(?:title|aria-label|alt)="([^"]*)"/g)].map((m) => m[1]).join('\n')}`;
  assert.doesNotMatch(seen, /game\.|Workspace|\beye\b|[{}]|render_view|capture_studio/);
});

/* ------------------------------------------------------------------ click to enlarge, run --- */

const Strip = await loadPage({
  entry: 'src/components/ws/studio-shots.tsx',
  name: 'studio-shots-page',
  real: ['lib/studio-shots.ts'],
  fakes: { 'lib/format.ts': { clockTime: '(at) => `t${at - 1700000000000}`' } },
});

async function shown(frames) {
  const page = Strip.mountStub(() => Strip.StudioShots({ frames }));
  await page.settle();
  const thumbs = () => findAll(page.result, (n) => n.type === 'button' && n.props.className === 'shots__thumb');
  const dialog = () => findAll(page.result, (n) => n.props?.title !== undefined && typeof n.props.onClose === 'function')[0] ?? null;
  return { page, thumbs, dialog };
}

test('a thumbnail is a button: pressing it opens that screenshot large, and the dialog says what and when', async () => {
  const { page, thumbs, dialog } = await shown([frame(1), frame(2), frame(3)]);
  assert.equal(dialog(), null, 'nothing is open until one is chosen');
  thumbs()[1].props.onClick();
  await page.settle();
  const open = dialog();
  assert.ok(open, 'the dialog opened');
  assert.equal(open.props.title, 'Studio screenshot');
  assert.equal(open.props.wide, true);
  const words = textOf(open);
  assert.match(words, /Studio screenshot, t2000 \(2 of 3\)/);
  assert.ok(words.includes(SHOTS_KEPT), 'the dialog says what the page does with it');
});

test('the dialog moves Earlier and Later, holds at both ends, and closes', async () => {
  const { page, thumbs, dialog } = await shown([frame(1), frame(2), frame(3)]);
  const buttons = () => findAll(dialog(), (n) => n.type === 'button');
  const named = (label) => buttons().find((b) => textOf(b) === label);
  thumbs()[0].props.onClick();
  await page.settle();
  assert.equal(named('Earlier').props.disabled, true, 'nothing earlier than the first');
  assert.equal(named('Later').props.disabled, false);
  named('Later').props.onClick();
  await page.settle();
  assert.match(textOf(dialog()), /\(2 of 3\)/);
  named('Later').props.onClick();
  await page.settle();
  assert.match(textOf(dialog()), /\(3 of 3\)/);
  assert.equal(named('Later').props.disabled, true, 'nothing later than the last');
  named('Earlier').props.onClick();
  await page.settle();
  assert.match(textOf(dialog()), /\(2 of 3\)/);
  dialog().props.onClose();
  await page.settle();
  assert.equal(dialog(), null);
});

test('a screenshot that scrolled out of the newest eight while it was open stays open, and cannot be stepped from', async () => {
  const eight = Array.from({ length: 8 }, (_, i) => frame(i + 1));
  let current = eight;
  const page = Strip.mountStub(() => Strip.StudioShots({ frames: current }));
  await page.settle();
  const dialog = () => findAll(page.result, (n) => n.props?.title !== undefined && typeof n.props.onClose === 'function')[0] ?? null;
  findAll(page.result, (n) => n.type === 'button' && n.props.className === 'shots__thumb')[0].props.onClick();
  await page.settle();
  assert.match(textOf(dialog()), /\(1 of 8\)/);
  // A ninth frame arrives and the oldest leaves the strip: the same page, a newer list.
  current = [...eight.slice(1), frame(9)];
  page.rerender();
  await page.settle();
  assert.ok(dialog(), 'the screenshot being looked at is not taken away');
  assert.doesNotMatch(textOf(dialog()), /\d of \d/, 'it no longer has a place in the strip, and does not claim one');
  const nav = findAll(dialog(), (n) => n.type === 'button');
  assert.deepEqual(nav.map((b) => [textOf(b), b.props.disabled]), [['Earlier', true], ['Later', true]], 'nothing to step to from a screenshot that left the strip');
});

/* ------------------------------------------------------------------ memory only --- */

test('the strip, its dialog and its model touch no storage and make no request', () => {
  const strip = readFileSync(join(WEB, 'src', 'components', 'ws', 'studio-shots.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  const model = readFileSync(join(WEB, 'src', 'lib', 'studio-shots.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  for (const [where, src] of [['studio-shots.tsx', strip], ['studio-shots.ts', model]]) {
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.clipboard|\.toDataURL|\.toBlob|createObjectURL/, `${where} stores or sends something`);
    assert.doesNotMatch(src, /from '\.\.?\/(\.\.\/)?lib\/api'|from '\.\/api'/, `${where} reaches for the API client`);
  }
  assert.ok(strip.length > 500 && model.length > 300, 'the scan read real source');
});

test('the socket hook keeps at most the strip’s limit, and persists nothing', () => {
  const hook = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
  assert.match(hook, /const MAX_FRAMES = 8;/);
  assert.match(hook, /\.slice\(-MAX_FRAMES\)/);
  const around = hook.slice(hook.indexOf("case 'studio_frame':"), hook.indexOf("case 'playtest_state':"));
  assert.ok(around.length > 100, 'could not read the frame case out of the hook');
  assert.doesNotMatch(around.replace(/\/\/.*$/gm, ''), /localStorage|sessionStorage|indexedDB|fetch\(/, 'a frame is stored or sent from the socket hook');
});

test('the strip is mounted by the turn, and is the only thing that draws frames there', () => {
  const src = readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /<StudioShots frames=\{shots\} \/>/);
  assert.doesNotMatch(src, /PlaytestCard|<canvas|paintFrame/, 'the turn draws frames some other way');
});
