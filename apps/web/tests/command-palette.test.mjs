// The command palette, as a thing that is actually REACHABLE.
//
// `command-match.test.mjs` pins the ranking, which is the part that decides whether the palette
// feels good. It cannot tell you whether the palette exists on screen. This file is the other
// half, and it exists because of this repo's own rule (docs/audit/APPLE-LEDGER.md):
//
//     "Code that compiles, is tested, and has no caller is a DEAD END, not a feature."
//
// A ranked list nothing renders would pass every test in the other file.
//
// THE DEFECTS THIS PINS, all of which were live and all of which were invisible in a screenshot:
//
//   1. `new-project` was titled "New project" and ran `navigate('/')`. It did not create a
//      project. Pressing it from a conversation dropped you on the shelf with the dialog shut and
//      the button still to be found by hand — a command that does not do what its own title says.
//      Same for the ⌘⇧N binding. Both now go through the shell's opener.
//   2. The dashboard contributed nothing to the palette at all, so the one route whose entire
//      purpose is starting and managing projects was the one route the palette could not act on.
//   3. Disabled commands without a `why` render as a dead row with no explanation — the palette's
//      whole reason for listing them rather than hiding them.
//
// What this file can and cannot prove, stated rather than glossed: these are source assertions,
// not a render. They prove the wiring is present and coherent. They cannot prove the palette
// paints, and `tests/shortcuts.test.mjs` owns the chord that opens it.
//
// Run with:  node --test           (from apps/web)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const SRC = join(WEB, 'src');

const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8');

/** Every .ts/.tsx file under src/, so a new contributor cannot be missed by a hard-coded list. */
function sources(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry)) out.push({ file: relative(SRC, full), src: readFileSync(full, 'utf8') });
  }
  return out;
}

const ALL = sources();

/* ------------------------------------------------------------------ parsing --- */

/**
 * The text inside each `useCommands([ ... ])`.
 *
 * Bracket-matched rather than regexed to the next `])`, because the command objects contain
 * nested arrays (`keywords`) and a lazy regex stops at the first one — which silently truncates
 * the command list and makes every assertion below weaker than it looks.
 */
function commandBlocks(src) {
  const blocks = [];
  const marker = 'useCommands([';
  let from = 0;
  for (;;) {
    const start = src.indexOf(marker, from);
    if (start < 0) break;
    let depth = 0;
    let i = start + marker.length - 1;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '[') depth += 1;
      else if (ch === ']') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(src.slice(start + marker.length, i));
    from = i + 1;
  }
  return blocks;
}

/** One entry per `id:` found, with the slice of source belonging to that command. */
function parseCommands(block, file) {
  const out = [];
  const idRe = /\bid:\s*'([^']+)'/g;
  const starts = [];
  for (let m = idRe.exec(block); m; m = idRe.exec(block)) starts.push({ id: m[1], at: m.index });
  for (const [i, { id, at }] of starts.entries()) {
    const body = block.slice(at, starts[i + 1]?.at ?? block.length);
    out.push({
      id,
      file,
      body,
      // A title may be a literal or an expression — `railCollapsed ? 'Expand…' : 'Collapse…'`
      // is a legitimate title and reading only the quoted form would report it as missing.
      title: (() => {
        const m = /\btitle:\s*(?:'([^']*)'|([^\n]+?),?\s*$)/m.exec(body);
        return m ? (m[1] ?? m[2]?.trim() ?? null) : null;
      })(),
      section: /\bsection:\s*'([^']+)'/.exec(body)?.[1] ?? null,
      hasEnabled: /\benabled:/.test(body),
      hasWhy: /\bwhy:\s*'[^']+'/.test(body),
      run: /\brun:\s*([\s\S]*)$/.exec(body)?.[1] ?? '',
    });
  }
  return out;
}

const CONTRIBUTORS = ALL.filter(({ src }) => src.includes('useCommands('));
const COMMANDS = CONTRIBUTORS.flatMap(({ file, src }) =>
  commandBlocks(src).flatMap((block) => parseCommands(block, file)),
);

/* ------------------------------------------------------------- not vacuous --- */

test('there are commands to check, so nothing below can pass on an empty set', () => {
  assert.ok(COMMANDS.length >= 12, `expected a real command set, parsed ${COMMANDS.length}`);
  assert.ok(CONTRIBUTORS.length >= 3, `expected several contributors, found ${CONTRIBUTORS.length}`);
});

/* --------------------------------------------------------------- reachable --- */

test('the registry provider wraps the app', () => {
  const app = read('app.tsx');
  assert.match(app, /<CommandProvider>/, 'app.tsx must mount CommandProvider');
  assert.match(app, /from '\.\/lib\/commands'/);
});

test('the palette is rendered by the shell, which is mounted on every route', () => {
  const layout = read('components', 'layout.tsx');
  assert.match(layout, /<CommandPalette\s*\/>/, 'layout.tsx must render <CommandPalette />');
  // Mounted in the shell itself, not inside a conditional branch of one route.
  assert.match(layout, /<Outlet\s*\/>[\s\S]*<CommandPalette\s*\/>/);
});

test('every signed-in route is a child of the shell, so every one of them has the palette', () => {
  // A route mounted as a SIBLING of the layout route gets no shell: no rail, no palette, no ⌘K.
  // Nothing about that screen looks broken, which is why it is pinned here rather than noticed.
  const app = read('app.tsx');

  // The layout route is `<Route element={<AuthGuard><AppLayout /></AuthGuard>}>` with its children
  // nested inside, so its element cannot be read with a single-tag regex.
  const block = /<AppLayout[\s\S]*?\n\s*>\n([\s\S]*?)\n\s*<\/Route>/.exec(app);
  assert.ok(block, 'could not find the AppLayout layout route — has the route tree changed shape?');

  // `[^>]*` CANNOT CROSS THE `>` INSIDE A JSX ARROW FUNCTION. `<Route element={() => …} path="/y" />`
  // truncates at the arrow and the path is never seen. Today every Route here writes `path=` before
  // `element=`, so this finds all of them — which is the dangerous kind of correct: it starts
  // silently checking fewer routes the day someone reorders two attributes, and a sweep that
  // quietly shrinks passes rather than failing.
  //
  // So the tag is matched up to its self-closing `/>` rather than the first `>`, and the number of
  // paths found is reconciled against the number of Route tags present. Reported by rbxai-a3, who
  // hit the same idiom in two of their own tests where the loop matched nothing at all.
  // A SCANNER, NOT A CLEVERER REGEX. No regex reads this correctly: the `>` that ends the tag and
  // the `>` inside `element={<WorkspacePage />}` are the same character, so every pattern either
  // stops early or runs past the end. Brace depth is the thing that distinguishes them, and a
  // scanner can count braces where a regex cannot.
  const routeTags = (chunk) => {
    const tags = [];
    for (let i = chunk.indexOf('<Route'); i !== -1; i = chunk.indexOf('<Route', i + 1)) {
      let depth = 0;
      for (let j = i; j < chunk.length; j += 1) {
        const c = chunk[j];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '>' && depth === 0) { tags.push(chunk.slice(i, j + 1)); break; }
      }
    }
    return tags;
  };
  const paths = (chunk) => routeTags(chunk).map((t) => /\bpath="([^"]+)"/.exec(t)?.[1]).filter(Boolean);
  const routeCount = (chunk) => [...chunk.matchAll(/<Route\b/g)].length;

  const inside = paths(block[1]);
  const outside = paths(app.replace(block[0], ''));

  // The reconciliation. An index route legitimately has no path, so this is an upper bound, not an
  // equality — but a sweep finding far fewer paths than there are Routes has stopped looking.
  const totalRoutes = routeCount(app);
  assert.ok(totalRoutes > 0, 'no Route tags found at all — the route tree moved');
  assert.ok(
    inside.length + outside.length >= totalRoutes - 2,
    `found ${inside.length + outside.length} paths across ${totalRoutes} Route tags — the sweep is missing routes`,
  );

  // The only routes that legitimately live outside the shell are the guest pages: someone who is
  // not signed in has no projects to command.
  assert.deepEqual(
    outside.sort(),
    ['/login', '/signup'],
    `these routes are outside the shell and therefore have no command palette: ${outside.join(', ')}`,
  );
  // And the signed-in surfaces really are in there, so the assertion above cannot pass by the
  // layout route having been emptied.
  for (const path of ['/projects/:id', '/usage', '/settings']) {
    assert.ok(inside.includes(path), `${path} must be inside the shell`);
  }
  assert.match(block[1], /<Route index\b/, 'the project shelf must be inside the shell');
});

/* ------------------------------------------------------------ well-formed --- */

test('command ids are unique across every contributor', () => {
  // Two commands sharing an id collide on the palette's React key and on aria-activedescendant,
  // so the wrong row is announced to a screen reader.
  const seen = new Map();
  for (const c of COMMANDS) {
    const prev = seen.get(c.id);
    assert.equal(prev, undefined, `duplicate command id "${c.id}" in ${prev} and ${c.file}`);
    seen.set(c.id, c.file);
  }
});

test('every command has a title and a section', () => {
  for (const c of COMMANDS) {
    assert.ok(c.title, `${c.file}: command "${c.id}" has no title`);
    assert.ok(c.section, `${c.file}: command "${c.id}" has no section — it would group under undefined`);
  }
});

test('every command that can be unavailable says why', () => {
  // The palette lists a disabled command rather than hiding it, because a command that vanishes
  // teaches the user it does not exist. That only works if it explains itself.
  for (const c of COMMANDS) {
    if (!c.hasEnabled) continue;
    assert.ok(c.hasWhy, `${c.file}: command "${c.id}" can be disabled but has no \`why\``);
  }
});

test('the palette actually renders `why` and the disabled state', () => {
  const palette = read('components', 'command-palette.tsx');
  assert.match(palette, /command\.why/, 'a `why` nothing renders is a comment');
  assert.match(palette, /enabled === false/);
  assert.match(palette, /aria-disabled/);
});

/* ---------------------------------------------------- the commands are real --- */

test('New project creates a project rather than navigating near one', () => {
  // THE DEFECT: `run: () => navigate('/')`. The command was named for an action it did not take.
  const layout = read('components', 'layout.tsx');
  const global = COMMANDS.find((c) => c.id === 'new-project');
  assert.ok(global, 'the shell must contribute a New project command');
  assert.match(global.run, /newProject\(\)/, 'New project must ask the shell to open the dialog');
  // And the shell's own ⌘⇧N binding takes the same path, or the chord and the palette disagree.
  assert.match(
    layout,
    /matchesShortcut\(e, SHORTCUTS\.newProject\)[\s\S]{0,400}?newProject\(\)/,
    'the ⌘⇧N binding must open the dialog, not only navigate',
  );
});

test('the dashboard both contributes commands and provides the dialog', () => {
  // THE DEFECT: the project shelf contributed nothing, so the palette could not act on the one
  // route whose entire purpose is starting and managing projects.
  const dash = read('routes', 'dashboard.tsx');
  assert.match(dash, /useProvideNewProject\(/, 'the dashboard must lend the shell its create dialog');
  assert.ok(
    COMMANDS.some((c) => c.file.endsWith('dashboard.tsx')),
    'the dashboard must contribute commands',
  );
});

test('a request made before the dashboard exists is honoured when it mounts', () => {
  // Pressing ⌘⇧N inside a conversation navigates first; the dialog has to survive that hop, and
  // the flag has to be cleared as it is consumed or every later visit re-opens the dialog.
  const shell = read('lib', 'shell.tsx');
  assert.match(shell, /newProjectPending/);
  assert.match(shell, /clearNewProjectPending\(\)[\s\S]{0,60}open\(\)/, 'the pending request must be cleared as it is consumed');
});

test('a command that needs a live connection is gated on one, not offered blindly', () => {
  // Offering an action this deployment cannot run is the defect commit 44b6370 closed for tools.
  const checkpoint = COMMANDS.find((c) => c.id === 'ws-checkpoint');
  assert.ok(checkpoint, 'expected the workspace checkpoint command');
  assert.match(checkpoint.body, /enabled:\s*studioStatus === 'connected'/);
});

/* -------------------------------------------------------- keyboard-only ---- */

test('the palette is operable without a mouse', () => {
  const palette = read('components', 'command-palette.tsx');
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Home', 'End']) {
    assert.match(palette, new RegExp(`'${key}'`), `no handler for ${key}`);
  }
  // Arrowing past the last row must not strand the selection off-screen.
  assert.match(palette, /scrollIntoView/);
  // And the palette must hand focus back, or ⌘K-Escape dumps the user at the top of the document.
  assert.match(palette, /restoreTo\.current\?\.focus\(\)/);
});

test('the listbox is announced correctly', () => {
  const palette = read('components', 'command-palette.tsx');
  assert.match(palette, /role="listbox"/);
  assert.match(palette, /role="option"/);
  assert.match(palette, /aria-selected/);
  assert.match(palette, /aria-activedescendant/, 'without this a screen reader never hears the selection move');
  assert.match(palette, /aria-modal="true"/);
});

test('the mouse path does not race the blur that closes the palette', () => {
  // click fires after blur, and blur would already have closed the palette out from under the
  // pointer — so the row commits on mousedown.
  const palette = read('components', 'command-palette.tsx');
  assert.match(palette, /onMouseDown=\{\(e\) => \{\s*e\.preventDefault\(\);\s*runAt\(i\);/);
});
