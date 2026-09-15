/**
 * THE FILES DRAWER IS REACHABLE.
 *
 * `files-panel.tsx` was 361 lines of finished markup that nothing imported — the worker had served
 * `/api/projects/:id/files` since the web tools shipped, with a listing, folders, history, trash and
 * a download, and a user's only way to read one of their own files was to ask Apple to read it back
 * aloud. `docs/backlog/DEADENDS.md` recorded it as WIRE, pass 13.
 *
 * WHAT THESE TESTS ARE, stated because it bounds what they prove: apps/web has no DOM renderer, so
 * nothing here mounts the route. These read the ROUTE'S SOURCE and pin the wiring, in the same
 * style and for the same reason as usage-page-wiring.test.mjs. Every one of them failed before the
 * change. The panel's own decisions are tested against the model in files-model.test.mjs.
 *
 * The last test is the one that is easiest to forget and worst to get wrong: a drawer name is
 * PERSISTED per project and validated against `DRAWERS` on the way back in, so a `Drawer` union
 * that gained 'files' without `DRAWERS` gaining it would restore as 'none' and the drawer you left
 * open would quietly close on every navigation — reachable once, then not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
const panel = readFileSync(join(WEB, 'src', 'components', 'ws', 'files-panel.tsx'), 'utf8');
const css = readFileSync(join(WEB, 'src', 'styles', 'workspace.css'), 'utf8');

/** Source with comments stripped, so a name discussed in prose is not mistaken for one in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ws = code(workspace);

test('THE PANEL IS ACTUALLY MOUNTED — it had zero importers', () => {
  assert.match(ws, /import \{ FilesPanel \} from '\.\.\/components\/ws\/files-panel'/, 'the workspace route must import it');
  assert.match(ws, /<FilesPanel\b/, 'and render it');
  assert.match(panel, /export function FilesPanel/, 'and that must still be what the panel exports');
});

test('it is rendered only while its drawer is open, like every other drawer here', () => {
  // Mounted unconditionally it would fetch the listing on every workspace load for everyone who
  // never opens it — the same reason the credits drawer guards its own panel.
  assert.match(ws, /drawer === 'files' && <FilesPanel/, 'guard the panel on the open drawer');
  assert.match(ws, /<Drawer open=\{drawer === 'files'\}/, 'and give it a Drawer to live in');
});

test('the drawer has an opener a user can find without the palette', () => {
  const openers = [...ws.matchAll(/setDrawer\('files'\)/g)].length;
  assert.ok(openers >= 2, `expected a control and a command to open it, found ${openers} call(s)`);
  assert.match(ws, /aria-label="[^"]*[Ff]iles[^"]*"/, 'the opener must carry a name when its label collapses');
});

test('and a command in the palette, because that is how this route exposes its drawers', () => {
  assert.match(ws, /id: 'ws-files'/, 'a command id');
  assert.match(ws, /keywords: \[[^\]]*'files'[^\]]*\]/, 'findable by the word a user would type');
});

test('the edit controls are gated on a permission that was actually checked', () => {
  // `canEdit` hides Rename/Duplicate/Delete. Handing it a literal `true` would put a viewer's
  // interface one click from three refusals; handing it a loading state as `false` is honest.
  assert.doesNotMatch(ws, /canEdit=\{true\}/, 'a hardcoded permission is not a permission');
  assert.match(ws, /canEdit=\{allows\(/, 'it must come from lib/capabilities');
  assert.match(ws, /allows\(\s*access\s*,\s*'build'\s*\)/, "and name the action the worker gates on: 'build'");
});

test('THE DRAWER NAME SURVIVES A RELOAD — the union and the validated list agree', () => {
  const union = /type Drawer = ([^\n;]+)/.exec(ws)?.[1] ?? '';
  const names = /const DRAWERS = \[([^\]]+)\]/.exec(ws)?.[1] ?? '';
  assert.match(union, /'files'/, "the Drawer union must admit 'files'");
  assert.match(names, /'files'/, "and DRAWERS must too, or readViewChoice discards it as unknown");
  assert.match(/type DrawerName = ([^\n;]+)/.exec(ws)?.[1] ?? '', /'files'/, 'and the stored-name union');
});

test('the panel is not mounted into a stylesheet that has never heard of it', () => {
  // gx-files__text is a <pre> of a file's contents inside a narrow drawer. With no rule it does not
  // wrap, and a single long line scrolls the whole drawer sideways.
  for (const cls of ['.gx-files', '.gx-files__table', '.gx-files__text']) {
    assert.ok(css.includes(cls), `${cls} is used by files-panel.tsx and defined nowhere`);
  }
  const pre = css.slice(css.indexOf('.gx-files__text'), css.indexOf('.gx-files__text') + 400);
  assert.match(pre, /white-space:\s*pre-wrap/, 'the preview must wrap rather than widen the drawer');
});

/* ------------------------------------------------------- what the panel says --- */

/** The panel with its prose removed, so a capability described in a comment is not one in use. */
const panelCode = code(panel);

test('MOVE IS DISCOVERABLE — the rename prompt admits it takes a path', () => {
  // There is no drag target and no folder picker. The Rename prompt accepts a path with slashes and
  // therefore already moves a file between folders — the worker treats rename and move as one
  // operation with one validation path — but the prompt said "New name for this file", so the only
  // way to find the move was to guess it. A capability nobody can find is not one the product has.
  const prompt = /window\.prompt\(([^)]*)\)/.exec(panelCode)?.[1] ?? '';
  assert.ok(prompt.length > 0, 'the rename prompt must still be there to be reworded');
  assert.match(prompt, /path/i, 'the prompt must say it takes a path');
  assert.match(prompt, /folder/i, 'and say what putting a folder in it does');
});

test('DUPLICATE NAMES THE FILE THE SERVER CHOSE', () => {
  // Duplicate posts no destination, which is the branch where the worker picks a free name by
  // probing the store — plan-copy.md, or plan-copy-2.md if that one was taken. A notice reading
  // "Duplicated" leaves the user unable to tell which of those now exists, in a list they then have
  // to re-read to find out.
  assert.match(panelCode, /Duplicated as \$\{/, 'the notice must name the duplicate');
  assert.match(panelCode, /result\??\.\s*to|\bto\b\s*===\s*'string'/, "read from the copy response's own `to`");
});
