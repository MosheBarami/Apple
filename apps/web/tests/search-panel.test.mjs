// The conversation search panel.
//
// The worker owns matching (apps/worker/tests/search.test.mjs covers it). What can go wrong HERE is
// everything around the request: searching the wrong thing, showing a stale answer, or showing
// nothing at all and leaving the user unable to tell "thinking" from "found nothing".
//
// The race is the one worth naming. Type "door" and four requests go out; the response for "do"
// can land after the response for "door" and overwrite it, so the list shows results for a query
// the box no longer contains. It is intermittent, it never reproduces on a fast connection, and it
// looks like the search is simply wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const PANEL = readFileSync(join(WEB, 'src', 'components', 'ws', 'search-panel.tsx'), 'utf8');
const API = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ------------------------------------------------------ it asks the server ---

test('the search goes to the worker, not to the messages already in the client', () => {
  // A filter over the loaded window answers "no results" for text that IS in the conversation, and
  // the user cannot tell that apart from the true answer.
  assert.match(PANEL, /searchConversation\(projectId, q\)/);
  assert.equal(/messages\.filter|\.filter\(\s*\(?m\)?\s*=>/.test(stripComments(PANEL)), false, 'no client-side filtering');
});

test('the client route is the project-scoped search endpoint', () => {
  assert.match(API, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/search\?q=\$\{encodeURIComponent\(q\)\}/);
});

// ----------------------------------------------------------------- the race ---

test('a response for an older query is dropped', () => {
  // Without this the slower response for "do" overwrites the results for "door".
  assert.match(PANEL, /inFlight\.current !== q/);
  const body = PANEL.slice(PANEL.indexOf('const timer = setTimeout'));
  assert.ok((body.match(/inFlight\.current !== q/g) ?? []).length >= 2, 'both the success and the failure path must check');
});

test('the failure path drops stale errors too', () => {
  // Otherwise a failed request for "do" paints an error over good results for "door".
  const cat = PANEL.slice(PANEL.indexOf('} catch'));
  assert.match(cat, /if \(inFlight\.current !== q\) return;/);
});

test('typing is debounced, and the pending request is cancelled on the next keystroke', () => {
  assert.match(PANEL, /setTimeout\(/);
  assert.match(PANEL, /return \(\) => clearTimeout\(timer\)/);
});

test('clearing the box cancels anything outstanding rather than letting it land', () => {
  const short = PANEL.slice(PANEL.indexOf('q.length < MIN_QUERY'), PANEL.indexOf('setState(\'loading\')'));
  assert.match(short, /inFlight\.current = ''/);
});

// ---------------------------------------------------------------- the states ---

test('thinking, empty, error and results are each said out loud', () => {
  // A panel that renders nothing while it works is indistinguishable from one that found nothing.
  for (const marker of ["state === 'loading'", "state === 'error'", "hits.length === 0", "hits.length > 0"]) {
    assert.ok(PANEL.includes(marker), `missing the ${marker} state`);
  }
  assert.match(PANEL, /Searching…/);
  assert.match(PANEL, /Nothing in this conversation matches/);
});

test('a capped result set says there are more', () => {
  // Silently showing 40 of 900 and calling them the results is the same defect as a truncated
  // export: it looks complete.
  assert.match(PANEL, /there are more/);
  assert.match(PANEL, /setMore\(res\.more\)/);
});

test('a one-character query explains itself instead of returning the transcript', () => {
  assert.match(PANEL, /MIN_QUERY/);
  assert.match(PANEL, /Keep typing/);
});

test('the error is announced, not just coloured', () => {
  assert.match(PANEL, /role="alert"/);
});

// ------------------------------------------------------------- highlighting ---

test('the highlight uses the offset the server reported', () => {
  // Re-finding the match here is a second implementation of "what matched": the server matched
  // case-insensitively, so a client-side indexOf silently highlights nothing on "Door" vs "door".
  assert.match(PANEL, /text\.slice\(start, start \+ length\)/);
  assert.equal(/snippet\.indexOf|\.toLowerCase\(\)\.indexOf/.test(stripComments(PANEL)), false, 'must not search the snippet again');
});

test('an out-of-range offset degrades to plain text rather than throwing', () => {
  assert.match(PANEL, /if \(length <= 0 \|\| start < 0 \|\| start \+ length > text\.length\)/);
});

// ------------------------------------------------------------- the workspace ---

test('search is reachable by shortcut and from the palette', () => {
  assert.match(WS, /useGlobalShortcut\(SHORTCUTS\.search/);
  assert.match(WS, /id: 'ws-search'/);
  assert.match(WS, /hint: shortcutLabel\(SHORTCUTS\.search\)/);
});

test('every message carries a jump target', () => {
  assert.match(WS, /id=\{`msg-\$\{item\.id\}`\}/);
});

test('a jump to a message that is not loaded says so rather than scrolling nowhere', () => {
  // The workspace pages backwards from the newest hundred, so a hit from months ago is not in the
  // DOM. Scrolling to nothing looks like a broken result.
  const jump = WS.slice(WS.indexOf('const jumpToMessage'), WS.indexOf('useGlobalShortcut(SHORTCUTS.search'));
  assert.match(jump, /if \(!el\)/);
  assert.match(jump, /toast\(/);
  assert.ok(jump.indexOf('if (!el)') < jump.indexOf('scrollIntoView'), 'check before scrolling');
});

test('the jump closes the drawer it was launched from', () => {
  const jump = WS.slice(WS.indexOf('const jumpToMessage'), WS.indexOf('useGlobalShortcut(SHORTCUTS.search'));
  assert.match(jump, /setDrawer\(null\)/);
});

test('the found flash respects reduced motion', () => {
  const CSS = readFileSync(join(WEB, 'src', 'styles', 'workspace.css'), 'utf8');
  const reduced = CSS.slice(CSS.lastIndexOf('prefers-reduced-motion'));
  assert.match(reduced, /\.is-found/);
  assert.match(reduced, /animation: none/);
  // And it still marks the message — removing the animation must not remove the answer to
  // "which one".
  assert.match(reduced, /outline:/);
});
