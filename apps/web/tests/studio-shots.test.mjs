/**
 * THE STUDIO SCREENSHOTS STRIP IN A TURN (M2 step 2.3, item C4).
 *
 * The worker sends a `studio_frame` message each time a tool captures Studio, and the socket hook keeps the newest eight in memory.
 * This holds what the turn does with them, by running the shipped code:
 *
 *   1. WHICH FRAMES. Only the ones stamped for this turn's own run; the last eight; oldest left, newest right; never one from an
 *      earlier run or one the worker could not attribute.
 *   1b. EACH CAPTURE ONCE. The worker replays the frames it holds each time a socket attaches during a playtest, so a reconnect must not
 *      repeat the strip or push the run's older frames out of the newest eight (M2 fix cycle 1).
 *   1c. A NEW PLAYTEST FRAME IS NOT A REPLAY EVEN WHEN THE WORKER'S COUNTER RESTARTS. The counter lives in the Durable Object's memory and
 *      the playtest run id survives an eviction, so new frames can arrive under a run id and a counter the page already holds; the capture
 *      time tells them apart, and a true replay carries the same one (M2 fix cycle 2).
 *   2. WHAT IT SAYS. A Studio capture is a "Studio screenshot"; anything else is a "Preview render", so a preview is never read as
 *      a screenshot. With no frame the strip says what is true of THIS turn: still coming, how to get them (connect Studio), or nothing
 *      at all once a finished request took none. No finished turn keeps a sentence about "while StudPilot builds", and none says that no
 *      screenshot was taken: the page keeps frames in memory only, so after a reload it cannot know (M2 fix cycle 2).
 *   3. WHERE IT SHOWS. On the latest assistant turn while it runs, once it has a frame, or when it was a build at all. A plain chat
 *      reply, and every earlier turn, gets nothing. The offer to the latest turn only is held where it is made (workspace.tsx).
 *   4. THE PERSON ONLY, IN MEMORY ONLY. The strip and its dialog persist nothing and send nothing: no storage, no request, no
 *      model. (What the worker does with a frame is its own; this page says only what this page does.)
 *   5. CLICK TO ENLARGE, with the keyboard: a thumbnail is a real button with a name, and the dialog moves earlier and later with two
 *      buttons that look like buttons in the workspace, show when they are disabled and carry the focus ring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { findAll, loadPage, textOf } from './page-harness.mjs';
import { SHOT_LIMIT, SHOTS_CONNECT, SHOTS_EMPTY, SHOTS_KEPT, SHOTS_NONE_HERE, appendFrame, sameFrame, shotCaption, shotKind, shotKindLabel, shotsEmptyLine, shotsForTurn } from '../src/lib/studio-shots.ts';
import ts from 'typescript';

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

/* ------------------------------------------------------------------ each capture once --- */

const copy = (f) => JSON.parse(JSON.stringify(f));

test('A REPLAYED RING IS NOT A SECOND STRIP: a capture that arrives again is shown once, in its place', () => {
  const ring = [frame(1), frame(2), frame(3)];
  const replay = ring.map(copy);
  assert.deepEqual(shotsForTurn([...ring, ...replay], 'run-1').map((f) => f.capturedAt), [T0 + 1000, T0 + 2000, T0 + 3000]);
  // The worst case the review named: the page's newest eight, then the ring replayed, must not push older frames out.
  const six = Array.from({ length: 6 }, (_, i) => frame(i + 1));
  const held = six.reduce((list, f) => appendFrame(list, f, 8), []);
  const afterReconnect = six.map(copy).reduce((list, f) => appendFrame(list, f, 8), held);
  assert.equal(afterReconnect.length, 6, 'the replay added copies');
  assert.deepEqual(afterReconnect.map((f) => f.capturedAt), six.map((f) => f.capturedAt));
});

test('two different pictures are never taken for one: same second and view but different pixels, or different playtest counters, both stay', () => {
  assert.equal(shotsForTurn([frame(1, { rgbBase64: 'AAAA' }), frame(1, { rgbBase64: 'BBBB' })], 'run-1').length, 2, 'different pixels');
  assert.equal(shotsForTurn([frame(1, { view: 'eye' }), frame(1, { view: 'top' })], 'run-1').length, 2, 'different view');
  const play = (seq, extra = {}) => frame(1, { playtestRunId: 'p1', seq, ...extra });
  assert.equal(shotsForTurn([play(1), play(2)], 'run-1').length, 2, 'two counters of one playtest');
  assert.equal(shotsForTurn([play(1), copy(play(1))], 'run-1').length, 1, 'one counter, replayed');
  assert.equal(shotsForTurn([play(1), play(1, { playtestRunId: 'p2' })], 'run-1').length, 2, 'the same counter in another playtest');
  assert.equal(sameFrame(frame(1), frame(1)), true);
  assert.equal(sameFrame(frame(1), frame(2)), false);
  assert.equal(sameFrame(frame(1), frame(1, { msgId: 'run-2' })), false, 'the same capture time under another run');
});

// ADDED 2026-10-05 (M2 fix cycle 2). The worker's playtest counter `seq` is a plain in-memory field of the Durable Object (apps/worker/src/do/session.ts,
// `playtestSeq`, reset only when a playtest begins) while the playtest run itself is stored, so after an eviction in the middle of a playtest the
// worker keeps the SAME run id and counts from 1 again. Keyed on the run and the counter alone, the page took those new pictures for a replay and
// never showed them. The capture time tells them apart: a replay carries the capture's original one.
test('A NEW PLAYTEST FRAME AFTER THE WORKER’S COUNTER RESTARTS IS NOT A REPLAY: the same run and counter at another moment both stay, and an exact replay is still dropped', () => {
  const play = (seq, n, pixels) => frame(n, { playtestRunId: 'pt_1', seq, rgbBase64: pixels });
  const held = [play(1, 1, 'AAAA'), play(2, 2, 'AAAA'), play(3, 3, 'AAAA')];
  // After the eviction: new pictures (other pixels, later times) arrive as seq 1 and 2 of the run the page already holds.
  const fresh = [play(1, 10, 'BBBB'), play(2, 11, 'CCCC')];
  assert.equal(sameFrame(held[0], fresh[0]), false, 'a later capture with other pixels, under the same run and counter, is not the held one');
  assert.equal(sameFrame(held[1], fresh[1]), false);
  const grown = fresh.reduce((list, f) => appendFrame(list, f, 8), held);
  assert.deepEqual(grown.map((f) => f.rgbBase64), ['AAAA', 'AAAA', 'AAAA', 'BBBB', 'CCCC'], 'the new frames were dropped as replays');
  assert.deepEqual(shotsForTurn(grown, 'run-1').map((f) => f.capturedAt), [1, 2, 3, 10, 11].map((n) => T0 + n * 1000), 'and the strip shows all five, in time order');
  // The worker's replay (same run, same counter, the capture's own time) still adds nothing, however often it arrives.
  const replay = [...held, ...fresh].map(copy);
  for (const [i, f] of replay.entries()) assert.equal(sameFrame(f, [...held, ...fresh][i]), true, `a copy of capture ${i} is that capture`);
  const again = replay.reduce((list, f) => appendFrame(list, f, 8), grown);
  assert.equal(again, grown, 'a replayed ring changed the list');
  assert.equal(shotsForTurn([...grown, ...replay], 'run-1').length, 5, 'and the strip still shows each once');
});

test('appendFrame keeps the newest eight, returns the very same list for a capture it holds, and never changes its input', () => {
  const nine = Array.from({ length: 9 }, (_, i) => frame(i + 1));
  const grown = nine.reduce((list, f) => appendFrame(list, f, 8), []);
  assert.deepEqual(grown.map((f) => f.capturedAt), nine.slice(1).map((f) => f.capturedAt), 'the oldest left');
  assert.equal(appendFrame(grown, copy(grown[3]), 8), grown, 'a held capture is not a change (the same list, so nothing re-renders)');
  const before = JSON.stringify(grown);
  appendFrame(grown, frame(20), 8);
  assert.equal(JSON.stringify(grown), before);
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

test('WHAT THE EMPTY STRIP SAYS follows the run and Studio, and a finished turn keeps no promise about "while it builds"', () => {
  assert.equal(shotsEmptyLine({ running: true, studioConnected: true }), SHOTS_EMPTY, 'on its way');
  assert.equal(shotsEmptyLine({ running: true, studioConnected: false }), SHOTS_CONNECT, 'waiting will not fill it: say what to do');
  assert.equal(shotsEmptyLine({ running: false, studioConnected: false }), SHOTS_NONE_HERE, 'over, with nothing, and Studio is the reason to act on');
  assert.equal(shotsEmptyLine({ running: false, studioConnected: true }), null, 'over, Studio was there: nothing true and useful to add');
  for (const finished of [SHOTS_NONE_HERE]) assert.doesNotMatch(finished, /while StudPilot builds|appear here/, 'a finished turn must not say screenshots are coming');
  assert.match(SHOTS_CONNECT, /^Connect Studio/);
  assert.match(SHOTS_NONE_HERE, /connect Studio/i);
});

// ADDED 2026-10-05 (M2 fix cycle 2). The line under a finished turn said "No screenshots were taken for this request.", which the page cannot know:
// frames are held in memory only (use-project-socket.ts) and a reloaded conversation carries its tool steps, not its frames, so a build that did
// capture Studio, opened again after a reload, was told it took none. The line says what is true instead: why there is nothing to show, and what
// to do next time.
test('THE FINISHED-TURN LINE NEVER SAYS NONE WERE TAKEN (the page cannot know after a reload); it says how long they are kept and what to do next time', () => {
  for (const claim of [/\bwere taken\b/i, /\bwas taken\b/i, /\bnone\b/i, /\btook (no|none)\b/i, /\bno screenshots (were|was)\b/i, /\bnever\b/i]) {
    assert.doesNotMatch(SHOTS_NONE_HERE, claim, `the line asserts what happened in the run: ${claim}`);
  }
  assert.match(SHOTS_NONE_HERE, /only while this tab stays open/i, 'it does not say how long the screenshots are kept');
  assert.match(SHOTS_NONE_HERE, /reload/i, 'it does not say what clears them');
  assert.match(SHOTS_NONE_HERE, /next time/i);
  assert.match(SHOTS_NONE_HERE, /connect Studio/i);
  assert.match(SHOTS_NONE_HERE, /keep this tab open/i, 'it does not say how to see them next time');
  assert.equal(SHOTS_NONE_HERE, 'No screenshots to show for this request: they are kept only while this tab stays open, so a reload clears them. To see them next time, connect Studio and keep this tab open during the request.');
});

// What the sentence rests on: the page's frames live in memory and nowhere else. If a frame is ever kept across a reload (from history, storage or a
// request), the line above is wrong again, so this fails and the line must be re-worded with the change that keeps them.
test('THE LINE RESTS ON THIS: the frames come into the page from the socket alone, and nothing reloads them', () => {
  const hook = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  const sets = [...hook.matchAll(/setFrames\(/g)];
  assert.equal(sets.length, 2, 'the page sets its frames somewhere new: from the fixture (dev) and from a `studio_frame` message only');
  assert.match(hook, /case 'studio_frame':[\s\S]*?setFrames\(\(list\) => appendFrame\(list, msg\.frame, MAX_FRAMES\)\)/);
  assert.match(hook, /withFrames \? mockFrames\(\)/);
  assert.doesNotMatch(hook, /useState<StudioFrame\[\]>\([^)]*(localStorage|sessionStorage|JSON\.parse)/, 'the frames start from stored data');
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

test('NO FRAME YET: the one sentence for this turn and no picture, no placeholder image', () => {
  const html = render(ui.h(ui.StudioShots, { frames: [], running: true, studioConnected: true }));
  assert.equal(text(html), SHOTS_EMPTY);
  assert.doesNotMatch(html, /<canvas|<img|<button|<svg/, 'nothing that could be mistaken for a result');
  assert.match(html, /aria-label="Studio screenshots from this run"/);
  assert.equal(text(render(ui.h(ui.StudioShots, { frames: [], running: true, studioConnected: false }))), SHOTS_CONNECT, 'Studio off: what to do');
  assert.equal(text(render(ui.h(ui.StudioShots, { frames: [], running: false, studioConnected: false }))), SHOTS_NONE_HERE);
  assert.equal(render(ui.h(ui.StudioShots, { frames: [], running: false, studioConnected: true })), '', 'a finished request with nothing to say draws no box at all');
});

test('WITH FRAMES: one named button each, in time order, a canvas for raw pixels and an image for a PNG', () => {
  const frames = [frame(1), frame(2, { encoding: 'png', rgbBase64: 'iVBORw0KGgo=' }), frame(3, { source: 'software_render' })];
  const html = render(ui.h(ui.StudioShots, { frames, running: false, studioConnected: true }));
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

test('A LIVE RUN with no frame yet shows the strip’s own sentence (what to do when Studio is off); once frames arrive it shows them', () => {
  assert.equal(text(strip(turn({ streaming: true }, { frames: [], studioConnected: true }))), SHOTS_EMPTY);
  assert.equal(text(strip(turn({ streaming: true }, { frames: [], studioConnected: false }))), SHOTS_CONNECT);
  assert.equal(text(strip(turn({ streaming: true }, { frames: [] }))), SHOTS_CONNECT, 'a caller that does not say is told to connect, never promised screenshots');
  const full = turn({ streaming: true }, { frames: [frame(1), frame(2)], studioConnected: true });
  assert.equal((strip(full).match(/shots__thumb/g) ?? []).length, 2);
});

test('A FINISHED BUILD keeps its screenshots; one with none says what to do when Studio is off, and nothing under it when Studio was there', () => {
  const tool = { toolId: 't1', tool: 'create_instances', summary: 'x', ok: true, done: true, startedAt: T0, durationMs: 5, startObserved: true };
  assert.equal((strip(turn({ tools: [tool] }, { frames: [frame(1)], studioConnected: true })).match(/shots__thumb/g) ?? []).length, 1);
  assert.equal(text(strip(turn({ tools: [tool] }, { frames: [], studioConnected: false }))), SHOTS_NONE_HERE);
  assert.equal(strip(turn({ tools: [tool] }, { frames: [], studioConnected: true })), null, 'a finished turn that took no screenshot keeps no "appear here while it builds" sentence');
  assert.doesNotMatch(strip(turn({ tools: [tool] }, { frames: [], studioConnected: false })), /while StudPilot builds/);
});

test('a plain chat reply (no tools, not running) gets no strip at all, and neither does an earlier turn', () => {
  assert.equal(strip(turn({ content: 'Sure, here is how that works.' }, { frames: [] })), null, 'a reply that built nothing');
  assert.equal(strip(turn({ content: 'x', streaming: true }, { frames: undefined })), null, 'a turn that was not offered the frames');
});

test('frames from another run are not shown under this turn', () => {
  const html = turn({ streaming: true }, { frames: [frame(1, { msgId: 'run-0' }), frame(2, { msgId: undefined })], studioConnected: true });
  assert.equal(text(strip(html)), SHOTS_EMPTY, 'neither an earlier run’s frame nor an unattributed one is this turn’s');
});

test('the strip carries nothing technical: no tool name, path, view name or JSON', () => {
  const html = turn({ streaming: true }, { frames: [frame(1, { view: 'eye', subject: 'game.Workspace' })], studioConnected: true });
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
  const page = Strip.mountStub(() => Strip.StudioShots({ frames, running: false, studioConnected: true }));
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
  const page = Strip.mountStub(() => Strip.StudioShots({ frames: current, running: false, studioConnected: true }));
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

//[[ RESTATED 2026-10-05 (M2 fix cycle 1). It pinned `.slice(-MAX_FRAMES)` in the hook's own case. The cap and the repeat check moved into
//   `appendFrame` (lib/studio-shots.ts) so a replayed ring can be run, not read; the property is the same and stronger: the hook keeps at
//   most MAX_FRAMES (8, the strip's own limit), through the function whose cap and repeat check the tests above run, and persists nothing. ]]
test('the socket hook keeps at most the strip’s limit, through appendFrame, and persists nothing', () => {
  const hook = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
  assert.match(hook, /const MAX_FRAMES = 8;/);
  assert.equal(Number(/const MAX_FRAMES = (\d+);/.exec(hook)?.[1]), SHOT_LIMIT, 'the hook and the strip disagree about how many frames there are');
  assert.match(hook, /setFrames\(\(list\) => appendFrame\(list, msg\.frame, MAX_FRAMES\)\)/, 'a frame is added some way other than appendFrame, which keeps the cap and drops a repeat');
  const around = hook.slice(hook.indexOf("case 'studio_frame':"), hook.indexOf("case 'playtest_state':"));
  assert.ok(around.length > 100, 'could not read the frame case out of the hook');
  assert.doesNotMatch(around.replace(/\/\/.*$/gm, ''), /localStorage|sessionStorage|indexedDB|fetch\(/, 'a frame is stored or sent from the socket hook');
});

test('the strip is mounted by the turn, and is the only thing that draws frames there', () => {
  const src = readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  // Restated 2026-10-05 (M2 fix cycle 1): the strip is also told whether the run is still going and whether Studio is connected, so its
  // empty sentence is true of this turn. The property is unchanged: it is handed this run's frames and nothing else draws them.
  assert.match(src, /<StudioShots frames=\{shots\} running=\{item\.streaming\} studioConnected=\{studioConnected \?\? false\} \/>/);
  assert.doesNotMatch(src, /PlaytestCard|<canvas|paintFrame/, 'the turn draws frames some other way');
});

/* ------------------------------------------------------------------ the offer is made to the latest turn only (workspace) --- */

// A turn draws the strip whenever it is handed `frames`, so "every earlier turn gets nothing" lives in ONE place: the workspace hands them to
// the latest assistant turn and to no other. Walked in the syntax tree, so it is the property and not the spelling that is held.
test('THE FRAMES ARE OFFERED TO THE LATEST ASSISTANT TURN ONLY: `frames` on <Turn> is `frames` when the turn is the latest assistant message and undefined otherwise', () => {
  const src = ts.createSourceFile('workspace.tsx', readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const all = []; const visit = (n) => { all.push(n); ts.forEachChild(n, visit); }; visit(src);
  const turns = all.filter((n) => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'Turn');
  assert.equal(turns.length, 1, 'the workspace mounts <Turn> in one place; a second mount needs its own guard and a line here');
  const attr = turns[0].attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === 'frames');
  assert.ok(attr?.initializer && ts.isJsxExpression(attr.initializer), 'the Turn is not handed `frames` as an expression');
  const expr = attr.initializer.expression;
  assert.ok(expr && ts.isConditionalExpression(expr), 'frames is handed to every turn: it must be conditional on the turn being the latest assistant message');
  const test = expr.condition;
  assert.ok(ts.isBinaryExpression(test) && test.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken, 'the condition is not a strict comparison');
  assert.deepEqual([test.left.getText(), test.right.getText()].sort(), ['item.id', 'lastAssistantId']);
  assert.equal(expr.whenTrue.getText(), 'frames');
  assert.equal(expr.whenFalse.getText(), 'undefined', 'an earlier turn is handed something other than nothing');
  // And lastAssistantId really is the latest ASSISTANT message, not the latest message.
  const def = all.find((n) => ts.isVariableDeclaration(n) && n.name.getText() === 'lastAssistantId');
  assert.ok(def, 'lastAssistantId is not defined where the Turn is');
  assert.match(def.initializer.getText(), /\.reverse\(\)\.find\(\(m\) => m\.role === 'assistant'\)\?\.id/);
});

/* ------------------------------------------------------------------ the enlarge dialog's buttons --- */

const shotsCss = readFileSync(join(WEB, 'src', 'components', 'ws', 'studio-shots.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

test('EARLIER AND LATER LOOK LIKE BUTTONS IN THE WORKSPACE, SHOW WHEN THEY ARE DISABLED, AND CARRY THE FOCUS RING', async () => {
  // The shared `.btn` chrome is scoped to the shelf, usage and settings pages; in the workspace it drew 18px of bare text. The workspace's own
  // outline button is `gx-btn gx-btn--outline`, and the dialog's two buttons use it (the same class as the checkpoints drawer's Restore).
  const { page, thumbs, dialog } = await shown([frame(1), frame(2)]);
  thumbs()[0].props.onClick();
  await page.settle();
  const nav = findAll(dialog(), (n) => n.type === 'button');
  assert.deepEqual(nav.map((b) => textOf(b)), ['Earlier', 'Later']);
  for (const b of nav) {
    assert.match(b.props.className, /\bgx-btn\b/);
    assert.match(b.props.className, /\bgx-btn--outline\b/);
    assert.match(b.props.className, /\bshots__nav\b/);
    assert.doesNotMatch(b.props.className, /(^|\s)btn(\s|$)/, 'the shelf-scoped `.btn` is back, and in the workspace it draws nothing');
  }
  // The two states the generic button rules would have drawn, written for this subtree: disabled is quiet and says so, focus has the ring.
  assert.match(shotsCss, /\.shots__nav:disabled\s*\{[^}]*cursor:\s*not-allowed[^}]*background:\s*transparent[^}]*border-color:\s*var\(--quiet-line\)[^}]*color:\s*var\(--quiet-ink\)/);
  assert.match(shotsCss, /\.shots__nav:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent-ring\);\s*outline-offset:\s*2px;\s*\}/);
  assert.doesNotMatch(shotsCss, /outline:\s*(none|0)\b/, 'a rule removes a focus ring');
});
