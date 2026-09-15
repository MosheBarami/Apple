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
