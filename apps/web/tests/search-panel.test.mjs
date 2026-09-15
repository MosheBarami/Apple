// The project search panel.
//
// The worker owns matching, ranking and filtering (apps/worker/tests/search.test.mjs runs them);
// the client/server filter contract is held from both ends in search-filters.test.mjs. What can go
// wrong HERE is everything around the request: searching the wrong thing, showing a stale answer,
// showing nothing at all and leaving the user unable to tell "thinking" from "found nothing" — and
// now, presenting a filtered or truncated answer as though it were the whole one.
//
// The race is still the one worth naming. Type "door" and four requests go out; the response for
// "do" can land after the response for "door" and overwrite it, so the list shows results for a
// query the box no longer contains. It is intermittent, it never reproduces on a fast connection,
// and it looks like the search is simply wrong.
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
const CODE = stripComments(PANEL);

// ------------------------------------------------------ it asks the server ---

test('the search goes to the worker, not to the messages already in the client', () => {
  // A filter over the loaded window answers "no results" for text that IS in the conversation, and
  // the user cannot tell that apart from the true answer.
  assert.match(CODE, /searchProject\(projectId, params\)/);
  assert.equal(/messages\.filter|\.filter\(\s*\(?m\)?\s*=>/.test(CODE), false, 'no client-side filtering');
});

test('the client route is the project-scoped search endpoint, with the filters attached', () => {
  assert.match(API, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/search\?\$\{params\.toString\(\)\}/);
});

test('the filters are built by the module the worker’s parser is tested against', () => {
  // Building a query string inline here is how the two sides drift: the spellings would no longer
  // be the ones apps/web/tests/search-filters.test.mjs holds against the worker.
  assert.match(CODE, /searchParams\(filter, q, Date\.now\(\)\)/);
  assert.equal(/params\.set\(/.test(CODE), false, 'the panel must not assemble parameters of its own');
});

// ----------------------------------------------------------------- the race ---

test('a response for an older question is dropped — filters included', () => {
  // Keyed on the whole query string rather than on the text: changing a filter is a different
  // question, and the previous answer must not paint over this one.
  assert.match(CODE, /const key = params\.toString\(\)/);
  assert.match(CODE, /inFlight\.current = key/);
  const body = CODE.slice(CODE.indexOf('const timer = setTimeout'));
  assert.ok((body.match(/inFlight\.current !== key/g) ?? []).length >= 2, 'both the success and the failure path must check');
});

test('the failure path drops stale errors too', () => {
  // Otherwise a failed request for "do" paints an error over good results for "door".
  const cat = CODE.slice(CODE.indexOf('} catch'));
  assert.match(cat, /if \(inFlight\.current !== key\) return;/);
});

test('typing is debounced, and the pending request is cancelled on the next keystroke', () => {
  assert.match(CODE, /setTimeout\(/);
  assert.match(CODE, /return \(\) => clearTimeout\(timer\)/);
});

test('changing a filter re-runs the search rather than leaving a stale list on screen', () => {
  const deps = CODE.slice(CODE.indexOf('const timer = setTimeout'));
  assert.match(deps, /\}, \[query, filter, projectId\]\)/);
});

test('clearing the box cancels anything outstanding rather than letting it land', () => {
  const short = CODE.slice(CODE.indexOf('q.length < MIN_QUERY'), CODE.indexOf("setState('loading')"));
  assert.match(short, /inFlight\.current = ''/);
});

// ---------------------------------------------------------------- the states ---

test('thinking, empty, error and results are each said out loud', () => {
  // A panel that renders nothing while it works is indistinguishable from one that found nothing.
  for (const marker of ["state === 'loading'", "state === 'error'", 'hits.length === 0', 'hits.length > 0']) {
    assert.ok(CODE.includes(marker), `missing the ${marker} state`);
  }
  assert.match(PANEL, /Searching…/);
  assert.match(PANEL, /Nothing in this project matches/);
});

test('a one-character query explains itself instead of returning the transcript', () => {
  assert.match(CODE, /MIN_QUERY/);
  assert.match(PANEL, /Keep typing/);
});

test('the error is announced, not just coloured', () => {
  assert.match(CODE, /role="alert"/);
});

// ------------------------------------------------- the answer is described honestly ---

test('a capped list is described by relevance, not by recency', () => {
  // It used to say "showing the most recent — there are more", which was true of the old
  // `order by created_at desc` and would be a lie about a ranked list.
  assert.match(PANEL, /best of/);
  assert.equal(/most recent/.test(PANEL), false, 'the results are no longer ordered by time');
});

test('an unscanned tail is admitted rather than passed off as the whole project', () => {
  assert.match(CODE, /scanTruncated/);
  assert.match(PANEL, /were not scanned/);
});

test('a filter the server could not read is announced before any count', () => {
  // A blank list under a broken filter reads as "there is nothing here", which is the exact
  // failure the whole `ignored` channel exists to prevent.
  assert.match(CODE, /res\?\.impossible/);
  assert.match(CODE, /ignoredText/);
  const impossible = CODE.slice(CODE.indexOf('res?.impossible'));
  assert.match(impossible, /role="alert"/);
  assert.match(PANEL, /Clear filters/);
});

test('an empty result under filters offers the way out of them', () => {
  const empty = CODE.slice(CODE.indexOf('hits.length === 0'));
  assert.match(empty, /Search everything/);
});

// ----------------------------------------------------------------- the facets ---

test('the count beside each kind comes from the server, not from the visible rows', () => {
  // Counting the rows on screen would report the capped page rather than the matches, and would
  // read zero for every kind the type filter excluded — which is exactly the number that makes a
  // facet look like a dead end.
  assert.match(CODE, /const counts = res\?\.counts/);
  assert.match(CODE, /counts\[t\]/);
  assert.equal(/hits\.filter\(/.test(CODE), false, 'the panel must not count matches for itself');
});

test('every kind is offered, and so is “everything”', () => {
  assert.match(CODE, /SEARCH_TYPES\.map/);
  assert.match(PANEL, /Everything/);
  assert.match(CODE, /types: \[\]/, 'clearing the type filter must mean every type, not none');
});

test('the kind and date filters are pressed-state controls, not colour alone', () => {
  assert.match(CODE, /aria-pressed=/);
  assert.match(CODE, /aria-expanded=\{showFilters\}/);
});

// -------------------------------------------------------------- the keyboard ---

test('the arrow keys move a selection and Enter opens it', () => {
  // The hits used to be plain buttons: reaching the third meant three tabs, and there was no way
  // to open anything without leaving the box you were typing in.
  for (const key of ["e.key === 'ArrowDown'", "e.key === 'ArrowUp'", "e.key === 'Enter'", "e.key === 'Home'", "e.key === 'End'"]) {
    assert.ok(CODE.includes(key), `missing ${key}`);
  }
  assert.match(CODE, /open\(hits\[index\]\)/);
});

test('the selection wraps rather than sticking at either end', () => {
  const down = CODE.slice(CODE.indexOf("e.key === 'ArrowDown'"), CODE.indexOf("e.key === 'ArrowUp'"));
  assert.match(down, /% hits\.length/);
});

test('the selection cannot dangle past the end when the list shrinks under it', () => {
  assert.match(CODE, /const index = Math\.min\(selected, Math\.max\(0, hits\.length - 1\)\)/);
});

test('the list is a listbox, and the input says which option is current', () => {
  assert.match(CODE, /role="listbox"/);
  assert.match(CODE, /role="option"/);
  assert.match(CODE, /aria-selected=\{i === index\}/);
  assert.match(CODE, /aria-activedescendant=/);
});

test('the selected row is scrolled into view in the same frame it is highlighted', () => {
  // In a passive effect the row visibly jumps after the fact.
  assert.match(CODE, /useLayoutEffect/);
  assert.match(CODE, /scrollIntoView\(\{ block: 'nearest' \}\)/);
});

test('a click opens on mousedown, before the blur that would move the selection', () => {
  assert.match(CODE, /onMouseDown=/);
});

// --------------------------------------------------------------- the history ---

test('recent searches are offered when the box is empty', () => {
  assert.match(CODE, /readSearchHistory\(projectId\)/);
  assert.match(PANEL, /Recent searches/);
  assert.match(CODE, /setQuery\(h\)/);
});

test('a remembered search can be forgotten', () => {
  assert.match(CODE, /forgetSearch\(projectId, h\)/);
});

test('the question is remembered, not the typing', () => {
  // Recording inside the debounced request would store "d", "do", "doo" on the way to "door" and
  // bury the one entry worth keeping.
  const request = CODE.slice(CODE.indexOf('const timer = setTimeout'), CODE.indexOf('}, [query, filter, projectId])'));
  assert.equal(/rememberSearch/.test(request), false, 'a keystroke is not a search');
  assert.match(CODE, /rememberSearch\(projectId, query\)/);
  assert.match(CODE, /commit\.current\(\)/);
});

// ------------------------------------------------------------ what is restored ---

test('the question and its filters survive closing the drawer', () => {
  assert.match(CODE, /readViewState\(`search\.q\.\$\{projectId\}`/);
  assert.match(CODE, /readViewState\(`search\.filter\.\$\{projectId\}`, normaliseFilter\)/);
  assert.match(CODE, /writeViewState\(`search\.q\.\$\{projectId\}`, query\)/);
});

test('a restored filter is validated before it is used', () => {
  // Straight from storage into state is how a filter from an older build reaches the server, comes
  // back refused, and turns every search from that browser into an unexplainable refusal.
  assert.match(CODE, /normaliseFilter/);
});

// ------------------------------------------------------------- highlighting ---

test('the highlight uses the offset the server reported', () => {
  // Re-finding the match here is a second implementation of "what matched": the server matched
  // case-insensitively, so a client-side indexOf silently highlights nothing on "Door" vs "door".
  assert.match(CODE, /text\.slice\(start, start \+ length\)/);
  assert.equal(/snippet\.indexOf|\.toLowerCase\(\)\.indexOf/.test(CODE), false, 'must not search the snippet again');
});

test('an out-of-range offset degrades to plain text rather than throwing', () => {
  assert.match(CODE, /if \(length <= 0 \|\| start < 0 \|\| start \+ length > text\.length\)/);
});

// ------------------------------------------------------------- the workspace ---

const WSCODE = stripComments(WS);

test('search is reachable by shortcut and from the palette', () => {
  assert.match(WSCODE, /useGlobalShortcut\(SHORTCUTS\.search/);
  assert.match(WSCODE, /id: 'ws-search'/);
  assert.match(WSCODE, /hint: shortcutLabel\(SHORTCUTS\.search\)/);
});

test('every message carries a jump target', () => {
  assert.match(WSCODE, /id=\{`msg-\$\{item\.id\}`\}/);
});

test('a jump to a message that is not loaded says so rather than scrolling nowhere', () => {
  // The workspace pages backwards from the newest hundred, so a hit from months ago is not in the
  // DOM. Scrolling to nothing looks like a broken result.
  const jump = WSCODE.slice(WSCODE.indexOf('const jumpToMessage'), WSCODE.indexOf('const openHit'));
  assert.match(jump, /if \(!el\)/);
  assert.match(jump, /toast\(/);
  assert.ok(jump.indexOf('if (!el)') < jump.indexOf('scrollIntoView'), 'check before scrolling');
});

test('the jump closes the drawer it was launched from', () => {
  const jump = WSCODE.slice(WSCODE.indexOf('const jumpToMessage'), WSCODE.indexOf('const openHit'));
  assert.match(jump, /setDrawer\(null\)/);
});

test('a hit that is not a message opens the surface that actually holds it', () => {
  // Sending every hit through `jumpToMessage` would hunt for a `msg-` element that never existed
  // and then toast "further back than the loaded history" about a checkpoint — a wrong
  // explanation, which sends the user looking for history that is not missing.
  const open = WSCODE.slice(WSCODE.indexOf('const openHit'), WSCODE.indexOf('useGlobalShortcut(SHORTCUTS.search'));
  assert.match(open, /if \(hit\.messageId\)/);
  assert.match(open, /hit\.type === 'checkpoint'/);
  assert.match(open, /setDrawer\('checkpoints'\)/);
  assert.match(open, /hit\.type === 'memory'/);
  assert.match(open, /setDrawer\('memory'\)/);
  assert.ok(open.indexOf('hit.messageId') < open.indexOf("hit.type === 'checkpoint'"), 'the anchor decides first');
});

test('a hit with nowhere to go says so instead of doing nothing', () => {
  const open = WSCODE.slice(WSCODE.indexOf('const openHit'), WSCODE.indexOf('useGlobalShortcut(SHORTCUTS.search'));
  assert.match(open, /toast\(/);
});

test('the drawer you left open is the drawer you come back to', () => {
  assert.match(WSCODE, /readViewChoice<DrawerName>\(`drawer\.\$\{projectId\}`, DRAWERS, 'none'\)/);
  assert.match(WSCODE, /writeViewChoice\(`drawer\.\$\{projectId\}`, next \?\? 'none'\)/);
});

test('“closed” and “a name this build does not know” are different stored states', () => {
  // Storing the empty string for closed would collapse them, and the validation that makes
  // restoring safe would have nothing left to distinguish.
  //
  // Asserted as the PROPERTY rather than as the literal list it used to be: pinning the exact
  // five names made adding a sixth drawer fail this test for a reason that has nothing to do with
  // what it is guarding, and the cheapest way past that failure is to paste the new list in, which
  // teaches nobody anything. What must hold is that 'none' is a real name in the list, that no
  // name is blank, and that the runtime list and the type union describe the same set — a drawer
  // in one and not the other is either a state that cannot be restored or a name that restores to
  // nothing, i.e. a drawer that comes back closed for ever.
  const list = /const DRAWERS = \[([^\]]+)\] as const/.exec(WSCODE);
  assert.ok(list, 'the DRAWERS list is gone');
  const names = [...list[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  assert.ok(names.includes('none'), "'none' is not a stored name, so closed has no name of its own");
  assert.ok(!names.includes(''), 'the empty string is a drawer name, which collapses closed and unknown');

  const union = /type DrawerName = ([^;]+);/.exec(WSCODE);
  assert.ok(union, 'the DrawerName union is gone');
  const declared = [...union[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  // Set equality, not containment: it catches the drawer that can be stored but not restored AND
  // the name that restores to nothing, which is the pair of failures this guard exists for.
  assert.deepEqual([...names].sort(), [...declared].sort(), 'DRAWERS and DrawerName disagree');

  // Three declarations have to agree, not two. DrawerName is what gets STORED; Drawer is what the
  // component actually switches on, and it is the one a new drawer gets added to first. A name in
  // Drawer that never reached DRAWERS is validated away on restore, so that drawer comes back
  // closed for ever and looks like a user who simply never opened it.
  const type = WSCODE.match(/type Drawer = null \| ([^;]+);/);
  assert.ok(type, 'the drawer union must still be spelled out');
  for (const d of [...type[1].matchAll(/'([^']+)'/g)].map((m) => m[1])) {
    assert.ok(names.includes(d), `'${d}' is a drawer this build has and the validator would reject`);
  }
});
