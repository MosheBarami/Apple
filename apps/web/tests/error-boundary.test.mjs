/**
 * ONE PANE CRASHING SHOULD NOT TAKE THE WHOLE APPLICATION WITH IT.
 *
 * There was exactly one boundary, wrapped around everything in app.tsx — outside ThemeProvider,
 * QueryClientProvider, ToastProvider and BrowserRouter. Two consequences, both invisible until
 * something throws:
 *
 *   A render error anywhere replaced the entire application with the crash card. The rail, the
 *   command palette and the toasts all went with it, so the one thing that would actually
 *   recover the user — navigating somewhere else — was no longer on screen.
 *
 *   Because it sits OUTSIDE the router it cannot reset on navigation, and it has no route
 *   identity to reset against. "Try to continue" re-rendered the same crashing route, which
 *   crashed again. A recovery button that cannot recover is worse than no button.
 *
 * So there is now a second boundary inside the shell, around <Outlet/> only, keyed on the
 * pathname: the shell survives, and walking away from the broken route clears it because the
 * key change remounts the boundary. The root one stays as the last resort for a crash in the
 * providers themselves.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const APP = read('app.tsx');
const LAYOUT = read('components', 'layout.tsx');
const BOUNDARY = read('components', 'error-boundary.tsx');

test('the shell wraps the route, so a crashing route keeps the rail and the palette', () => {
  const main = /<main id="main-content"[\s\S]*?<\/main>/.exec(LAYOUT);
  assert.ok(main, 'could not find the shell <main>');
  assert.match(
    main[0],
    /<ErrorBoundary[\s\S]*?<Outlet\s*\/>[\s\S]*?<\/ErrorBoundary>/,
    'the shell must wrap <Outlet/> — and only <Outlet/> — in an ErrorBoundary',
  );
  assert.match(LAYOUT, /from '\.\/error-boundary'/, 'layout.tsx must import the boundary');
});

test('the route boundary is keyed on the path, so navigating away clears the crash', () => {
  const main = /<main id="main-content"[\s\S]*?<\/main>/.exec(LAYOUT)[0];
  const tag = /<ErrorBoundary[^>]*>/.exec(main);
  assert.ok(tag, 'no <ErrorBoundary> tag inside <main>');
  assert.match(
    tag[0],
    /key=\{location\.pathname\}/,
    'without a key on the pathname the boundary holds the crash across navigation',
  );
});

test('the route boundary renders inside the shell rather than taking the screen', () => {
  const main = /<main id="main-content"[\s\S]*?<\/main>/.exec(LAYOUT)[0];
  assert.match(/<ErrorBoundary[^>]*>/.exec(main)[0], /scope="route"/);
  // The two scopes must actually render differently, or `scope` is a prop nothing reads.
  assert.match(BOUNDARY, /scope\?:\s*'app'\s*\|\s*'route'/);
  assert.match(BOUNDARY, /crash-screen/, 'the app scope keeps the full-screen card');
  assert.match(BOUNDARY, /crash-card--route|is-route/, 'the route scope needs its own presentation');
});

test('the root boundary is still there, for a crash in the providers themselves', () => {
  assert.match(APP, /<ErrorBoundary>[\s\S]*<ThemeProvider>/, 'app.tsx must still wrap everything');
  assert.match(APP, /<\/ErrorBoundary>\s*\);/);
});

test('"Try to continue" clears the boundary and tells its owner it was cleared', () => {
  assert.match(BOUNDARY, /this\.setState\(\{ error: null \}\)/, 'the reset must clear the caught error');
  assert.match(BOUNDARY, /onReset\?:\s*\(\)\s*=>\s*void/, 'the boundary must let its owner react to a reset');
  assert.match(BOUNDARY, /this\.props\.onReset\?\.\(\)/, 'declaring onReset and never calling it is a dead prop');
});

test('a crash is still written somewhere a human can find it', () => {
  // Nothing is posted to the worker: there is no endpoint for client errors, and a UI that
  // POSTs to a route which does not exist is the defect this codebase keeps finding. The
  // console is what exists, so the console is what is claimed.
  assert.match(BOUNDARY, /console\.error\(/);
  assert.match(BOUNDARY, /componentStack/);
});

/* ===========================================================================================
 * THE CARD HAD NO LAYOUT. (D9864e3)
 *
 * Everything above this line checks the boundary's BEHAVIOUR — which scope wraps what, what
 * resets, what is logged. All of it passed while the card itself had no CSS whatsoever: not one
 * of the five `crash-*` class names in error-boundary.tsx matched a single rule in the shipped
 * bundle, so the product's worst moment was the only failure state nobody drew.
 *
 * MEASURED IN CHROMIUM against the real component and the real stylesheet, at 1280x800, BEFORE
 * the fix:
 *
 *   .crash-screen   display:block  box 0,0 1280x285  padding:0px
 *   .crash-card     max-width:none  padding:0px  border:0px none  radius:0px
 *   .crash-card h1  font-size:54px  (the element rule's clamp() top — a landing-page size)
 *   .crash-detail   white-space:pre  max-height:none   (an unbroken message scrolls sideways)
 *   .crash-actions  display:block   the two buttons at a gap of 0.0px, 36px and 44.8px tall
 *
 * AFTER: the card is 520px wide, centred at x=380 in a 1280px viewport and vertically centred at
 * y=400, 28px padding, a 1px --line hairline at --r-lg, h1 at 25px, the detail wrapped and capped
 * at 150px, and the two buttons 10px apart and both 36px tall.
 *
 * These tests read source rather than a browser, which is the bound apps/web has always had: it
 * mounts nothing in `node --test`. The rendered numbers above are the evidence; what is pinned
 * here is the thing whose absence produced them — a class name used by the component and drawn by
 * nobody. That is the drift this repository keeps finding, so it is checked by construction:
 * every `crash-*` the component emits must be declared, and the specific properties whose absence
 * WAS the defect must be among the declarations.
 * ======================================================================================== */

import { existsSync } from 'node:fs';

/** Comments stripped, so prose naming a class is never mistaken for a rule declaring it. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Every stylesheet that is actually in the bundle when this card renders: the global one
 * main.tsx imports, plus whatever error-boundary.tsx imports for itself. A rule written in a file
 * nothing imports is not a rule — that is the same failure one level up.
 */
function stylesheetsReaching(componentRelPath) {
  const sheets = [['design/system.css', read('design', 'system.css')]];
  const src = read(...componentRelPath.split('/'));
  for (const m of src.matchAll(/^import\s+'(\.[^']+\.css)';/gm)) {
    const rel = join(dirname(componentRelPath), m[1]);
    const abs = join(SRC, rel);
    assert.ok(existsSync(abs), `${componentRelPath} imports ${m[1]}, which does not exist`);
    sheets.push([rel, readFileSync(abs, 'utf8')]);
  }
  return sheets;
}

/** The declaration bodies of every rule whose selector list mentions `.name`. */
function rulesFor(css, name) {
  const out = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (new RegExp(`\\.${name}(?![\\w-])`).test(selector)) out.push({ selector, body: m[2].trim() });
  }
  return out;
}

const CRASH_SHEETS = stylesheetsReaching('components/error-boundary.tsx');
const CRASH_CSS = CRASH_SHEETS.map(([, css]) => css).join('\n');

test('every crash-* class the boundary emits is actually drawn by something in the bundle', () => {
  const used = [...new Set([...BOUNDARY.matchAll(/'(crash-[\w-]+)'|"(crash-[\w-]+)"/g)].map((m) => m[1] ?? m[2]))];
  // Five today: crash-screen, is-route is separate, crash-card, crash-card--route, crash-detail,
  // crash-actions, crash-hint. Guard the count so a sixth cannot be added and skipped.
  assert.ok(used.length >= 5, `expected the card to use at least 5 crash-* classes, found ${used.join(', ')}`);
  for (const name of used) {
    const rules = rulesFor(CRASH_CSS, name);
    assert.ok(
      rules.length > 0 && rules.some((r) => r.body.length > 0),
      `.${name} is used by error-boundary.tsx and has no rule in ${CRASH_SHEETS.map(([f]) => f).join(' or ')}`,
    );
  }
  // `is-route` is a modifier on .crash-screen rather than a crash-* name of its own, and the two
  // scopes must not render identically — that is what makes `scope` more than a logged string.
  assert.ok(rulesFor(CRASH_CSS, 'is-route').some((r) => /crash-screen/.test(r.selector)),
    '.crash-screen.is-route has no rule, so the route scope draws the same picture as the app scope');
});

test('the properties whose absence was measured are present', () => {
  const decls = (name) => rulesFor(CRASH_CSS, name).map((r) => r.body).join(';');

  // The screen was a bare block at 0,0 with no padding, so the card sat in the window's corner.
  const screen = decls('crash-screen');
  assert.match(screen, /display:\s*grid|display:\s*flex/, '.crash-screen must lay its card out, not stack it as a block');
  assert.match(screen, /padding:/, '.crash-screen had padding:0px — the card touched the window edge');
  assert.match(screen, /min-height:\s*100dvh/, 'the app-scope card takes the screen, because nothing else is on it');

  // The card was full-bleed and unframed.
  const card = decls('crash-card');
  assert.match(card, /max-width:/, '.crash-card was max-width:none — 1280px of prose on a desktop');
  assert.match(card, /padding:/, '.crash-card had no padding');
  assert.match(card, /border:\s*1px solid var\(--line\)/, 'the frame is a hairline, like every other panel here');

  // The <h1> inherited clamp(32px,5vw,54px) from the element rule.
  assert.ok(
    rulesFor(CRASH_CSS, 'crash-card').some((r) => /h1/.test(r.selector) && /font-size:/.test(r.body)),
    'the crash heading must set its own size, or it renders at the 54px landing-page clamp',
  );

  // An Error.message is unbounded and has no line breaks.
  const detail = decls('crash-detail');
  assert.match(detail, /white-space:\s*pre-wrap/, 'an unwrapped message scrolls sideways out of the card');
  assert.match(detail, /overflow-wrap:\s*anywhere/, 'and an unbroken 400-character token still would');
  assert.match(detail, /max-height:/, 'a stack-shaped message must not bury the recovery buttons');

  // The two recovery buttons touched at 0px and were 36px and 44.8px tall.
  const actions = decls('crash-actions');
  assert.match(actions, /display:\s*flex/, 'the two buttons sat as blocks, one under the other edge to edge');
  assert.match(actions, /gap:/, 'the measured gap between them was 0.0px');
  assert.match(actions, /flex-wrap:\s*wrap/, 'at 375px the second button must drop, not shrink its label');
  assert.ok(
    rulesFor(CRASH_CSS, 'crash-actions').some((r) => /\.btn/.test(r.selector) && /min-height:/.test(r.body)),
    'the secondary button carries no variant rule, so without this it is 8.8px taller than the primary',
  );
});
