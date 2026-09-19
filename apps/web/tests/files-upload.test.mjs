/**
 * THE RULES A FILE PICKER HAS TO KNOW BEFORE IT PICKS.
 *
 * The workspace holds text, in a declared list of extensions, up to 48 KB per file. Those limits
 * were enforced in exactly one place — the worker, at the moment of the write — so the first time a
 * user met any of them was as a refusal after choosing a file, and the sentence they got back was
 * about a path they had not typed.
 *
 * `uploadCheck` is that decision moved in front of the click, and it is pure so the cases can be
 * enumerated here rather than discovered by a customer:
 *
 *   A NAME OFF SOMEBODY'S DISK IS NOT A WORKSPACE PATH. "Level Data (final).csv" contains three
 *   characters the store's own path rule refuses. It is rewritten — and the rewrite is RETURNED, so
 *   the panel can say what the file will be called instead of quietly saving it under another name.
 *   THE CEILING IS STATED, NOT DISCOVERED. Over the limit is refused here, with the number in the
 *   sentence, before anything is read or sent.
 *   BYTES, NOT CHARACTERS, everywhere a size is compared.
 *
 * `refusalCopy` is asserted for the new code alongside them: a body that arrived as something other
 * than text must not be reported as a bad file NAME, which is the one field the user got right.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

const { uploadCheck, looksBinary, refusalCopy, replaceConfirm } = await import('../src/components/ws/files-model.ts');

const LIMITS = { maxFileBytes: 48 * 1024, maxVersions: 20, trashDays: 30, extensions: ['.md', '.txt', '.json', '.csv', '.luau'] };

/* ------------------------------------------------------------------ the name --- */

test('a plain name in the current folder is taken as it is', () => {
  const got = uploadCheck({ name: 'brief.md', size: 400 }, LIMITS, 'notes/');
  assert.equal(got.ok, true);
  assert.equal(got.path, 'notes/brief.md');
  assert.equal(got.renamed, false, 'nothing was changed, so nothing should be announced');
});

test('A NAME THE STORE WOULD REFUSE IS REWRITTEN, and the rewrite is reported', () => {
  const got = uploadCheck({ name: 'Level Data (final).csv', size: 900 }, LIMITS, '');
  assert.equal(got.ok, true);
  assert.match(got.path, /^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/, 'the result must satisfy the store\'s own segment rule');
  assert.equal(got.renamed, true, 'a silently renamed file is a file the user cannot find again');
});

test('a name with nothing usable in it is refused rather than turned into a guess', () => {
  const got = uploadCheck({ name: '((( ))).md', size: 10 }, LIMITS, '');
  assert.equal(got.ok, false);
  assert.match(got.why, /name/i);
});

test('a path is never built by concatenating a folder that does not end in a slash', () => {
  const got = uploadCheck({ name: 'a.md', size: 10 }, LIMITS, 'notes');
  assert.equal(got.ok, true);
  assert.equal(got.path, 'notes/a.md');
});

/* ----------------------------------------------------------------- the limits --- */

test('AN EXTENSION THE WORKSPACE DOES NOT HOLD IS REFUSED, and the sentence lists what it does', () => {
  const got = uploadCheck({ name: 'logo.png', size: 100 }, LIMITS, '');
  assert.equal(got.ok, false);
  assert.match(got.why, /\.md/, 'telling someone "no" without telling them "yes, these" is half a refusal');
  assert.match(got.why, /\.csv/);
});

test('a file with no extension at all is refused', () => {
  assert.equal(uploadCheck({ name: 'README', size: 100 }, LIMITS, '').ok, false);
});

test('THE CEILING IS STATED BEFORE THE UPLOAD, with the number in it', () => {
  const got = uploadCheck({ name: 'big.md', size: 48 * 1024 + 1 }, LIMITS, '');
  assert.equal(got.ok, false);
  assert.match(got.why, /48/, 'the limit the user just met must be in the sentence');
  // Exactly at the limit is allowed: the worker refuses only what is PAST it, and a client that
  // refused one byte earlier would be a second, stricter limit nobody declared.
  assert.equal(uploadCheck({ name: 'big.md', size: 48 * 1024 }, LIMITS, '').ok, true);
});

/* ----------------------------------------------------------------- the bytes --- */

test('a file that is not text is recognised before it is sent', () => {
  // A .txt containing a NUL is the case the extension allowlist cannot catch: the name is legal
  // and the bytes are not text. Sent as-is it would be stored as replacement characters — a file
  // that uploaded "successfully" and cannot be opened.
  assert.equal(looksBinary('the plan\nis a good one\n'), false);
  assert.equal(looksBinary('PK' + '\u0003\u0004\u0000\u0000' + 'binary'), true);
  assert.equal(looksBinary('\uFFFD'.repeat(6) + 'mostly unreadable'), true, 'a page of replacement characters is a decode that failed');
  assert.equal(looksBinary(''), false, 'an empty file is empty, not binary');
});

/* --------------------------------------------------------------- the refusals --- */

test('a body that was not text is not reported as a bad file name', () => {
  const serverSaid = 'the file has to arrive as text';
  const said = refusalCopy('bad_content', serverSaid);
  assert.notEqual(said, serverSaid, 'the new code must be translated, not fall through to the wire sentence');
  assert.doesNotMatch(said, /name/i, 'the name was the one field they got right');
  assert.match(said, /text/i);
  // And the fallback still holds for a code this build has never heard of.
  assert.equal(refusalCopy('something_new', 'the server sentence'), 'the server sentence');
});

test('replacing an existing file says what happens to the text being replaced', () => {
  const said = replaceConfirm('notes/plan.md');
  assert.match(said, /notes\/plan\.md/);
  assert.match(said, /version|back/i, 'an overwrite the user cannot undo is one they must be warned about, not asked about');
});

/* ---------------------------------------------------------------- the wiring --- */
//
// The rules above are worth nothing if the picker is not on a screen. This repo has shipped a
// finished panel that nothing imported once already — files-panel.tsx itself — so the control, the
// client call and the route are checked to be joined up rather than each assumed from the others.

const panel = readFileSync(join(WEB, 'src', 'components', 'ws', 'files-panel.tsx'), 'utf8');
const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractedRefresh(source) {
  const tree = ts.createSourceFile('files-panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = null;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && node.name.getText(tree) === 'refresh'
      && node.initializer
      && ts.isCallExpression(node.initializer)
    ) {
      const first = node.initializer.arguments[0];
      if (first && (ts.isArrowFunction(first) || ts.isFunctionExpression(first)) && ts.isBlock(first.body)) {
        callback = first;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(callback, 'FilesPanel refresh callback was not found by the TypeScript AST');
  const body = callback.body.getText(tree);
  const run = new AsyncFunction('listing', 'file', 'history', 'open', 'selection', body.slice(1, -1));
  return (listing, file, history, open) => run(listing, file, history, open, { current: { open, file, history } });
}

async function refreshCalls(refresh, open) {
  const calls = [];
  const query = (name) => ({ refetch: async () => { calls.push(name); } });
  await refresh(query('listing'), query('file'), query('history'), open);
  return calls;
}

function pickerHasPermission(source) {
  const tree = ts.createSourceFile('files-panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pickers = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'input'
      && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(tree) === 'type'
        && attr.initializer && ts.isStringLiteral(attr.initializer) && attr.initializer.text === 'file')) {
      let guarded = false;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          && parent.left.getText(tree) === 'canEdit') guarded = true;
      }
      pickers.push(guarded);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return pickers.length === 1 && pickers[0];
}

test('THE PICKER EXISTS, IS GATED ON PERMISSION, AND CALLS THE UPLOAD', () => {
  assert.match(panel, /type="file"/, 'there must be a real file input');
  assert.match(panel, /uploadCheck\(/, 'and the limits must be checked before it is read');
  assert.match(panel, /uploadProjectFile\(/, 'and something must actually send it');
  // canEdit hides Rename, Duplicate and Delete for a viewer; an upload control outside that guard
  // would put a viewer one click from a 403 they cannot do anything about.
  // The permission, not the layout container's tag name, is the contract.
  assert.equal(pickerHasPermission(panel), true, 'the file input must sit behind the build permission');
  const guard = '{canEdit && (\n        <div className="gx-files__upload">';
  assert.equal(panel.split(guard).length - 1, 1, 'falsification must remove the actual upload permission');
  assert.equal(pickerHasPermission(panel.replace(guard, '{true && (\n        <div className="gx-files__upload">')), false,
    'an unguarded file input must fail independently of its container');
});

test('ADD A FILE IS A NATIVE KEYBOARD BUTTON THAT FORWARDS ONCE TO THE HIDDEN PICKER', () => {
  const start = panel.indexOf('{canEdit && (');
  const end = panel.indexOf('Text only —', start);
  assert.notEqual(start, -1, 'the editable upload block is missing');
  assert.notEqual(end, -1, 'the upload block no longer reaches its limit copy');
  const upload = panel.slice(start, end);

  // A native button supplies Enter/Space activation. The old <label> around a display:none input
  // had mouse activation but no keyboard control of its own.
  assert.match(upload, /<button\b[\s\S]*?type="button"[\s\S]*?>[\s\S]*?Add a file[\s\S]*?<\/button>/,
    'Add a file must remain a native button');
  assert.match(upload, /<button\b[\s\S]*?disabled=\{busy\}/,
    'the picker button must be disabled while an upload is already running');
  assert.match(upload, /<input\b[\s\S]*?ref=\{picker\}[\s\S]*?type="file"[\s\S]*?disabled=\{busy\}/,
    'the hidden picker must share the same busy gate');

  const forwards = upload.match(/picker\.current\?\.click\(\)/g) ?? [];
  assert.equal(forwards.length, 1, 'one activation must forward exactly once to the file input');
});

test('REFRESH DOES NOT MANUALLY FETCH path=null, BUT REFRESHES BOTH OPEN-FILE QUERIES WHEN SELECTED', async () => {
  const refresh = extractedRefresh(panel);
  assert.deepEqual(
    await refreshCalls(refresh, null),
    ['listing'],
    'manual refetch bypasses enabled; open=null must not issue content/history requests',
  );
  assert.deepEqual(
    await refreshCalls(refresh, 'GameState.luau'),
    ['listing', 'file', 'history'],
    'an actual open file must refresh its content and version history after a mutation',
  );
});

test('THE REFRESH REGRESSION WOULD REJECT THE OLD UNCONDITIONAL CALLBACK', async () => {
  const oldRefresh = new AsyncFunction(
    'listing', 'file', 'history', 'open',
    'await listing.refetch(); await file.refetch(); await history.refetch();',
  );
  await assert.rejects(
    async () => assert.deepEqual(await refreshCalls(oldRefresh, null), ['listing']),
    { name: 'AssertionError' },
    'the guard must fail if file/history refetch becomes unconditional again',
  );
});

test('the occupied path is asked about, not reported as a failure', () => {
  assert.match(panel, /res\.code === 'occupied'/, 'the refusal must be recognised');
  assert.match(panel, /replaceConfirm\(/, 'and turned into a question');
  assert.match(panel, /\{ overwrite: true \}/, 'whose yes carries the overwrite');
});

test('the client posts to the route the worker actually serves', () => {
  const fn = api.slice(api.indexOf('export async function uploadProjectFile'));
  assert.match(fn.slice(0, 1800), /\/files\/content/, 'the path must be the one index.ts registers');
  assert.match(fn.slice(0, 1800), /method: 'POST'/);
  assert.match(fn.slice(0, 1800), /parsed\?\.code/, 'and the machine-readable code must survive, or refusalCopy has nothing to translate');
});
