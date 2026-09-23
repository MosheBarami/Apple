/**
 * WHAT A USER IS TOLD BEFORE A FOLDER MOVES OR GOES.
 *
 * A folder operation is the largest thing this panel can do: one click moves or bins every file
 * under a prefix, including the ones a level down that are not on screen at the time. So the two
 * sentences that precede it carry the count — "Delete notes?" invites a yes from someone who is
 * thinking of the two files they can see and not of the eleven they cannot.
 *
 * The wiring half is here too, deliberately: the worker's move_folder and delete_folder are real,
 * route-tested operations, and an op no button sends is the dead branch this codebase keeps
 * finding. These assertions fail if the buttons leave the panel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const { deleteFolderConfirm, renameFolderPrompt } = await import('../src/components/ws/files-model.ts');
const panel = readFileSync(join(WEB, 'src', 'components', 'ws', 'files-panel.tsx'), 'utf8');
/** Comments stripped, as toast-model.test.mjs does it: prose describing a rule — including the one
 *  above the folder row, which contains the words "<button>" — must not satisfy a test for it. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

/**
 * The folder branch of the files list: from `row.kind === 'folder'` to the `) : (` that starts the
 * file branch, at whatever indentation the markup sits. Asserts it found both ends, so a moved
 * branch fails here instead of silently slicing to the end of the file.
 */
function folderRow(src) {
  const start = src.indexOf("row.kind === 'folder'");
  const end = /\n\s*\) : \(/g;
  end.lastIndex = start;
  const hit = start < 0 ? null : end.exec(src);
  assert.ok(start >= 0 && hit, 'the folder branch of the files list was not found');
  return src.slice(start, hit.index);
}

/* ------------------------------------------------------------------- the copy --- */

test('THE DELETE CONFIRMATION COUNTS THE FILES, including the ones not on screen', () => {
  const said = deleteFolderConfirm('notes', 11, 30);
  assert.match(said, /notes/);
  assert.match(said, /11/, 'a folder delete that does not say how much it takes is a yes given in the dark');
  assert.match(said, /30 days/, 'and the window has to be in the same sentence as the deletion');
});

test('one file is one file, not "1 files"', () => {
  assert.match(deleteFolderConfirm('notes', 1, 30), /1 file\b/);
  assert.doesNotMatch(deleteFolderConfirm('notes', 1, 30), /1 files/);
});

test('the rename prompt says it takes a path, because it does', () => {
  // A folder move and a folder rename are the same operation on the worker — typing "old/notes"
  // relocates the folder. With no drag target, the prompt is the only place that is discoverable.
  const said = renameFolderPrompt('notes');
  assert.match(said, /folder/i);
  assert.match(said, /path|move/i);
});

/* ----------------------------------------------------------------- the wiring --- */

test('the folder row sends both operations the worker serves', () => {
  assert.match(panel, /op: 'move_folder'/, 'the folder rename must reach the route');
  assert.match(panel, /op: 'delete_folder'/, 'and so must the folder delete');
  assert.match(panel, /deleteFolderConfirm\(/, 'and the delete must be confirmed with the count');
});

test('a viewer is not shown folder controls they would be refused', () => {
  const row = folderRow(panel);
  assert.ok(row.length > 200, 'the folder row must still be there');
  assert.match(row, /canEdit &&/, 'the folder actions must sit behind the build permission');
});

test('the client type admits the folder operations, or TypeScript refuses the call', () => {
  const shape = api.slice(api.indexOf('export interface FileOpRequest'), api.indexOf('export interface FileOpRequest') + 400);
  assert.match(shape, /'move_folder'/);
  assert.match(shape, /'delete_folder'/);
});

test('A FOLDER ROW IS NOT A BUTTON INSIDE A BUTTON', () => {
  // The row used to be one <button> wrapping everything, which is why the actions could not live
  // on it: nested interactive elements are invalid HTML and the inner one is unreachable by
  // keyboard in some engines. The name is its own control now.
  const row = code(folderRow(panel));
  const opens = (row.match(/<button/g) ?? []).length;
  const closes = (row.match(/<\/button>/g) ?? []).length;
  assert.equal(opens, closes, 'every button in the folder row must be closed before the next one opens');
  assert.ok(opens >= 3, 'the row has a name control and two actions');
});
