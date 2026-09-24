/**
 * THE OWNER'S PICKS, THINKING LANE — every pick is mounted where it belongs, in the product.
 *
 * The owner ticked components in a picker; this lane put each one into the Thinking card or into a
 * loading / empty / error state. A pick that is only a file under components/picks/ is a demo, not
 * a feature, so this file holds two things for every pick:
 *
 *   1. the product surface imports it AND renders it (a source check that fails when the mount is
 *      removed), and that surface is itself reached from the app (auth splash, pairing dialog,
 *      workspace, turn, routes);
 *   2. rendered through the real component tree (esbuild + react-dom/server), the pick's markup is
 *      actually in what a browser receives.
 *
 * Plus the lane's rules: no motion/gsap/radix/three import, nothing copied from a Motion-Plus
 * source, every animated sheet has a reduced-motion escape, and no green.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEB, bundle, count, decomment, element, renderWith, text } from './ui-bundle.mjs';

const SRC = join(WEB, 'src');
const PICKS = join(SRC, 'components', 'picks', 'thinking');
const read = (rel) => decomment(readFileSync(join(SRC, rel), 'utf8'));

/** `file` imports `name` from a picks/thinking module and renders `<name` in JSX. */
function mounts(file, name, from) {
  const src = read(file);
  assert.match(src, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from ['"][./]*(?:components/)?${from.replace(/[./]/g, '\\$&')}['"]`),
    `${file} does not import ${name} from ${from}`);
  assert.match(src, new RegExp(`<${name}\\b`), `${file} imports ${name} but never renders it`);
}

// ------------------------------------------------------------- 1. the mounts, in source ---

const MOUNTS = [
  // id                                  surface file                                 component       module
  //[[ RESTATED 2026-09-24 (owner decision D-THINK-1): the Lattice glyph, Skeleton and Reveal lived in
  //   the Thinking card's header and trace, which the owner replaced with one morphing status line.
  //   Their rows are gone from here; the line's own motion is held below and in thinking-surface. ]]
  ['motion--to-do-list',                'components/ai-elements/chain-of-thought.tsx', 'StepMark',    'picks/thinking/step-mark'],
  ['motion--svg-loading-spinner',       'components/loading.tsx',                     'ArcSpinner',   'picks/thinking/arc-spinner'],
  ['eldora--hacker-background',         'components/loading.tsx',                     'CodeRain',     'picks/thinking/code-rain'],
  ['reactbits--hyperspeed',             'components/loading.tsx',                     'WarpField',    'picks/thinking/warp-field'],
  ['motion--fill-text',                 'components/loading.tsx',                     'FillText',     'picks/thinking/fill-text'],
  ['motion--infinite-path-drawing',     'components/loading.tsx',                     'InfinityPath', 'picks/thinking/infinity-path'],
  ['eldora--svg-ripple-effect',         'components/loading.tsx',                     'RippleField',  'picks/thinking/ripple-field'],
  ['eldora--svg-ripple-effect (empty)', 'components/empty-state.tsx',                 'RippleField',  'picks/thinking/ripple-field'],
  ['motion--physical-stagger',          'components/empty-state.tsx',                 'TileBurst',    'picks/thinking/tile-burst'],
  ['componentry--ascii-effect',         'components/error-boundary.tsx',              'AsciiMark',    'picks/thinking/ascii-mark'],
  ['animate-ui--collapsible (crash)',   'components/error-boundary.tsx',              'FoldedDetails','picks/thinking/folded-details'],
  ['animate-ui--collapsible (failure)', 'components/failure.tsx',                     'FoldedDetails','picks/thinking/folded-details'],
  ['ae-shimmer / shiny / shimmering',   'components/ws/thinking.tsx',                 'Shimmer',      'ai-elements/shimmer'],
  ['animate-ui--shimmering-text',       'components/loading.tsx',                     'Shimmer',      'ai-elements/shimmer'],
];

for (const [id, file, name, from] of MOUNTS) {
  test(`${id} is mounted: ${file} renders <${name}>`, () => mounts(file, name, from));
}

test('the disclosure motion (Collapsible + Thought Line) drives Reasoning and ChainOfThought', () => {
  for (const file of ['components/ai-elements/reasoning.tsx', 'components/ai-elements/chain-of-thought.tsx']) {
    const src = read(file);
    assert.match(src, /import \{ useAnimatedClose, useExpandOnOpen \} from ["']\.\.\/picks\/thinking\/disclosure["']/, `${file} lost the disclosure motion`);
    assert.match(src, /= useAnimatedClose\(contentIdRef, setOpenState\)/, `${file} no longer collapses before it hides`);
    assert.match(src, /useExpandOnOpen\(id, isOpen\)/, `${file} no longer expands on open`);
  }
  const motion = read('components/picks/thinking/disclosure.ts');
  assert.match(motion, /collapse\(/);
  assert.match(motion, /expand\(/);
});

test('Thought Line: the status line arrives, and its words morph in and out', () => {
  //[[ RESTATED 2026-09-24 (D-THINK-1): the settle-in and the Lattice glyph in the Reasoning trigger
  //   became the status pill's arrival and the leaving/entering words of MorphingWords. ]]
  const src = read('components/ws/thinking.tsx');
  assert.match(src, /className="apple-status__phrase is-leaving"/);
  assert.match(src, /className="apple-status__phrase is-entering"/);
  const css = readFileSync(join(SRC, 'components/ws/thinking.css'), 'utf8');
  for (const rule of ['\\.apple-status\\.is-live \\.apple-status__line', '\\.apple-status__phrase\\.is-entering', '\\.apple-status__phrase\\.is-leaving']) {
    assert.match(css, new RegExp(`${rule} \\{[^}]*animation:`), `${rule} does not move`);
  }
});

test('the shimmer is one component with both qualities: the Shiny Text sweep and the per-glyph wave', () => {
  const src = read('components/ai-elements/shimmer.tsx');
  assert.match(src, /variant === 'sweep'/);
  assert.match(src, /ai-elements-shimmer__glyph/);
  assert.match(src, /REST_PER_CHAR = 0\.05/, 'Shimmering Text\'s rest between passes is what keeps a long line from strobing');
  assert.match(read('components/loading.tsx'), /<Shimmer as="span" variant="wave"/);
  assert.match(readFileSync(join(SRC, 'components/ai-elements/reasoning.css'), 'utf8'), /linear-gradient\(\s*120deg/, 'the sweep is drawn with Shiny Text\'s 120deg band');
});

test('the surfaces the picks sit in are reached from the running app', () => {
  assert.match(read('lib/auth.tsx'), /<Forge kind="recalling"/, 'the first screen (Hyperspeed, Fill text) is the auth splash');
  assert.match(read('components/pairing-dialog.tsx'), /<Forge kind="connecting"/, 'the pairing wait (Ripple, Hacker Background) is the pairing dialog');
  assert.match(read('routes/workspace.tsx'), /<Spinner label=/, 'the spinner with its shimmering caption opens a project');
  assert.match(read('components/ws/turn.tsx'), /<Thinking\b/, 'the Thinking card is drawn on every turn');
  assert.match(read('app.tsx'), /<ErrorBoundary>/);
  assert.match(read('components/layout.tsx'), /<ErrorBoundary\b[^>]*scope="route"/);
  const emptyCallers = ['routes/workspace.tsx', 'routes/roadmap.tsx', 'routes/dashboard.tsx'].filter((f) => /<EmptyState\b/.test(read(f)));
  assert.ok(emptyCallers.length >= 2, 'EmptyState is not mounted where the tile plate and ripple are expected to appear');
  const loading = read('components/loading.tsx');
  assert.match(loading, /kind === 'connecting' && <CodeRain/);
  assert.match(loading, /kind === 'recalling' && <WarpField/);
  assert.match(loading, /kind === 'recalling'\s*\?\s*<FillText/);
  assert.match(loading, /<InfinityPath className="forge-bar"/);
});

// ---------------------------------------------------------- 2. the rendered markup ---

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { Thinking } from './src/components/ws/thinking';
  export { Forge, Spinner } from './src/components/loading';
  export { EmptyState } from './src/components/empty-state';
  export { Failure } from './src/components/failure';
  export { StepMark } from './src/components/picks/thinking/step-mark';
`, { name: 'picks-thinking', resolveDir: WEB });
const html = (el) => renderWith(ui.renderToStaticMarkup, el);
const activity = await import(pathToFileURL(join(SRC, 'components/ws/activity-model.ts')).href);

const T0 = 1_700_000_000_000;
function settled(stopReason, ok = true) {
  const tools = [{ toolId: 'a', tool: 'read_script', summary: 'Read 12 lines', ok, startedAt: T0, durationMs: 800, done: true, startObserved: true }];
  return activity.reduceActivity({ events: activity.eventsFromTurn({ tools, stopReason, endedAt: T0 + 2000 }), now: T0 + 3000, streaming: false });
}
const thinking = (props) => html(ui.h(ui.Thinking, { status: null, streaming: false, ...props }));

test('a settled run is marked only when it went well; failure and stop are the outcome row\'s to say', () => {
  //[[ RESTATED 2026-09-24 (D-THINK-1): the Lattice glyph drew done / failed / stopped in the header.
  //   Now a run that went well keeps one tick beside its summary, and nothing else is marked here. ]]
  const tools = [{ toolId: 'a', tool: 'create_instances', summary: 'x', ok: true, startedAt: T0, durationMs: 800, done: true, startObserved: true }];
  const built = activity.reduceActivity({ events: activity.eventsFromTurn({ tools, stopReason: 'done', endedAt: T0 + 2000 }), now: T0 + 3000, streaming: false });
  const done = element(thinking({ activity: built }), /<span class="apple-status__tick"/);
  assert.ok(done, 'a finished build has no mark');
  assert.match(done, /aria-hidden="true"/, 'the tick repeats the words; it must not be read twice');
  assert.equal(thinking({ activity: settled('error', false) }), '');
  assert.equal(thinking({ activity: settled('stopped') }), '');
});

test('To-do list / Thought Line: a step is marked by its status', () => {
  const complete = html(ui.h(ui.StepMark, { status: 'complete' }));
  assert.match(complete, /picks-step--complete/);
  assert.match(complete, /class="picks-step__tick"/);
  assert.match(html(ui.h(ui.StepMark, { status: 'active' })), /picks-step__dot/);
  assert.match(html(ui.h(ui.StepMark, { status: 'pending' })), /picks-step--pending/);
});

test('Forge recalling: Hyperspeed behind, Fill text headline, the infinity loop', () => {
  const out = html(ui.h(ui.Forge, { kind: 'recalling', label: 'Waking the apple', compact: true }));
  assert.match(out, /<canvas[^>]*picks-backdrop--warp/);
  const fill = element(out, /<p class="picks-fill/);
  assert.ok(fill, 'the headline is not the fill text');
  assert.equal(count(fill, 'Waking the apple'), 2, 'drawn twice, base and ink');
  assert.match(fill, /picks-fill__ink" aria-hidden="true"/, 'and heard once');
  assert.doesNotMatch(text(out), /\d+%/, 'no invented percentage');
  assert.match(out, /picks-infinity forge-bar/);
});

test('Forge connecting: the ripple round the mark and the pairing-code rain behind it', () => {
  const out = html(ui.h(ui.Forge, { kind: 'connecting', label: 'Creating a pairing code', compact: true }));
  assert.match(out, /<canvas[^>]*picks-backdrop--rain/);
  const mark = element(out, /<span class="forge-mark"/);
  assert.match(mark, /picks-ripple/);
  assert.match(mark, /apple-pulse/, 'the brand mark stays at the centre of the rings');
});

test('Spinner: the arc spinner, and a caption that shimmers glyph by glyph but is read once', () => {
  const out = html(ui.h(ui.Spinner, { label: 'Opening your project…' }));
  assert.match(out, /class="picks-arc"/);
  assert.match(out, /ai-elements-shimmer--wave/);
  assert.match(out, /<span class="visually-hidden">Opening your project…<\/span><span aria-hidden="true">/);
  assert.ok(count(out, 'ai-elements-shimmer__glyph') >= 10);
  assert.match(html(ui.h(ui.Spinner, {})), /class="picks-arc"/);
});

test('EmptyState: the tile plate invites building, the ripple waits for Studio, a failure is not decorated', () => {
  const creation = html(ui.h(ui.EmptyState, { state: 'noConversation' }));
  assert.equal(count(element(creation, /<div class="es__art"/) ?? '', 'picks-tiles__tile'), 49);
  assert.match(html(ui.h(ui.EmptyState, { state: 'waitingForStudio' })), /es__art[\s\S]*picks-ripple/);
  assert.doesNotMatch(html(ui.h(ui.EmptyState, { state: 'connectionFailed' })), /es__art/);
  const own = html(ui.h(ui.EmptyState, { state: 'noConversation', illustration: ui.h('svg', { id: 'own' }) }));
  assert.match(own, /id="own"/);
  assert.doesNotMatch(own, /picks-tiles/, 'a surface\'s own illustration wins');
});

test('Failure: the server\'s own words are folded behind "Details"', () => {
  const explained = { kind: 'ours', title: 'Apple hit a problem', safety: 'Nothing was changed.', next: null, retryable: false };
  const out = html(ui.h(ui.Failure, { error: new Error('x'), explain: () => ({ ...explained, detail: 'upstream 502 from provider' }) }));
  const fold = element(out, /<details class="picks-fold failure__detail"/);
  assert.ok(fold, 'the detail is not folded');
  assert.match(fold, /<summary class="picks-fold__summary"><span>Details<\/span>/);
  assert.doesNotMatch(fold, /<details[^>]*\bopen=/, 'folded until somebody opens it');
  assert.match(fold, /<code>upstream 502 from provider<\/code>/);
  const none = html(ui.h(ui.Failure, { error: new Error('x'), explain: () => explained }));
  assert.doesNotMatch(none, /picks-fold/, 'no detail, no fold');
});

// ------------------------------------------------------------------ 3. the lane's rules ---

const files = readdirSync(PICKS);
const sources = files.filter((f) => /\.tsx?$/.test(f));
const sheets = files.filter((f) => f.endsWith('.css'));

test('no animation library, no WebGL library, nothing but React and the platform', () => {
  assert.ok(sources.length >= 10, `only ${sources.length} pick sources found`);
  for (const f of sources) {
    const src = readFileSync(join(PICKS, f), 'utf8');
    assert.doesNotMatch(src, /from ['"](?:motion|motion\/react|framer-motion|gsap|@gsap\/[\w-]+|@radix-ui\/[\w-]+|radix-ui|three|ogl)['"]/, `${f} imports a library this app does not have`);
  }
});

test('Motion-Plus picks are re-implemented, and say so', () => {
  for (const f of ['step-mark.tsx', 'fill-text.tsx', 'infinity-path.tsx', 'tile-burst.tsx']) {
    const src = readFileSync(join(PICKS, f), 'utf8');
    assert.match(src, /LicenseRef-Motion-Plus/, `${f} does not record why none of its source was used`);
    assert.match(src, /none of its code is used|re-implemented/i);
  }
});

test('every animated pick sheet stops for a reader who asked for less motion, and none of it is green', () => {
  for (const f of sheets) {
    const css = readFileSync(join(PICKS, f), 'utf8');
    if (/animation:|transition:/.test(css)) assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, `${f} animates with no reduced-motion escape`);
    assert.doesNotMatch(css, /var\(--good\)|#[0-9a-f]{0,2}(?:c5|cf)[0-9a-f]{2}(?:5e|8e)\b|\bgreen\b/i, `${f} spends green`);
  }
  const canvases = sources.filter((s) => /<canvas\b/.test(readFileSync(join(PICKS, s), 'utf8')));
  assert.equal(canvases.length, 3, `expected the three canvas picks, found ${canvases.join(', ')}`);
  for (const f of canvases) {
    assert.match(readFileSync(join(PICKS, f), 'utf8'), /useCanvasLoop/, `${f} draws a canvas outside the loop that honours reduced motion`);
  }
  assert.match(readFileSync(join(PICKS, 'canvas-loop.ts'), 'utf8'), /lessMotion\(\)/);
});
