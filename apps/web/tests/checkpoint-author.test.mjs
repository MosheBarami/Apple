/**
 * THE CHECKPOINT DRAWER MUST NOT CALL SOMEONE ELSE'S WORK YOURS.
 *
 * The row showed a timestamp, an object count and a script count — auto-derived metadata and not
 * one word about who took it. The one surface that did claim an author, search, derived it from
 * the KIND: every manual checkpoint was "you", including a teammate's, on exactly the row that a
 * restore argument turns on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const { checkpointAuthorView, rosterNames } = await import('../src/lib/checkpoint-author.ts');

const manual = (authorId) => ({ kind: 'manual', authorId });

function hasOptionalNullableStringProperty(source, interfaceName, propertyName) {
  const file = ts.createSourceFile('shared-index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const iface = file.statements.find((node) => ts.isInterfaceDeclaration(node) && node.name.text === interfaceName);
  if (!iface) return false;
  const member = iface.members.find((node) => (
    ts.isPropertySignature(node)
    && ts.isIdentifier(node.name)
    && node.name.text === propertyName
  ));
  if (!member?.questionToken || !member.type) return false;
  const types = ts.isUnionTypeNode(member.type) ? [...member.type.types] : [member.type];
  const hasString = types.some((node) => node.kind === ts.SyntaxKind.StringKeyword);
  const hasNull = types.some((node) => (
    ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword
  ));
  return types.length === 2 && hasString && hasNull;
}

test('your own checkpoint is yours', () => {
  assert.deepEqual(checkpointAuthorView(manual('u-me'), 'u-me'), { who: 'you', label: 'You' });
});

test("a teammate's checkpoint is named, not claimed", () => {
  const v = checkpointAuthorView(manual('u-maya'), 'u-me', { 'u-maya': 'Maya' });
  assert.equal(v.who, 'member');
  assert.equal(v.label, 'Maya');
});

test('a member we cannot name is unknown, never you', () => {
  // They left the project, or the roster has not loaded yet. Both are "we do not know", and the
  // reader is the one wrong answer that looks right.
  const v = checkpointAuthorView(manual('u-gone'), 'u-me');
  assert.equal(v.who, 'unknown-member');
  assert.notEqual(v.label, 'You');
});

test('a checkpoint from before the column says so instead of picking someone', () => {
  const v = checkpointAuthorView(manual(null), 'u-me');
  assert.equal(v.who, 'unrecorded');
  assert.match(v.label, /not recorded/i);
});

test("Apple's own checkpoints are Apple's, whatever is in the column", () => {
  for (const kind of ['auto', 'pre_agent']) {
    assert.equal(checkpointAuthorView({ kind, authorId: null }, 'u-me').who, 'apple');
    // A bug that wrote an author onto an automatic checkpoint must not turn into a claim about a
    // person: the kind is the stronger fact.
    assert.equal(checkpointAuthorView({ kind, authorId: 'u-me' }, 'u-me').who, 'apple');
  }
});

test('an unknown viewer claims nothing', () => {
  // Signed-in state has not resolved. "You" cannot be true of nobody.
  assert.notEqual(checkpointAuthorView(manual('u-me'), null).who, 'you');
});

test('a member with no display name is still named by their handle', () => {
  const names = rosterNames([{ userId: 'u-1', displayName: null, handle: 'maya' }]);
  assert.equal(names['u-1'], 'maya');
  assert.equal(checkpointAuthorView(manual('u-1'), 'u-me', names).label, 'maya');
});

test('the drawer renders the author beside the date', () => {
  const ws = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
  assert.match(ws, /checkpointAuthorView/, 'the row must say who took it');
  assert.match(ws, /rosterNames/, 'and name the people the roster can name');
});

test('the shape the browser reads actually carries an author', () => {
  const shared = readFileSync(join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  assert.equal(
    hasOptionalNullableStringProperty(shared, 'CheckpointMeta', 'authorId'),
    true,
    'CheckpointMeta.authorId must remain optional and nullable rather than merely appearing nearby in source text',
  );
});

test('the checkpoint author contract guard fails when optionality or nullability is removed', () => {
  const shared = readFileSync(join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const exact = 'authorId?: string | null;';
  assert.equal(shared.split(exact).length - 1, 1, 'falsification requires one exact authorId contract to mutate');
  assert.equal(
    hasOptionalNullableStringProperty(shared.replace(exact, 'authorId: string | null;'), 'CheckpointMeta', 'authorId'),
    false,
    'the guard must fail if authorId becomes required',
  );
  assert.equal(
    hasOptionalNullableStringProperty(shared.replace(exact, 'authorId?: string;'), 'CheckpointMeta', 'authorId'),
    false,
    'the guard must fail if authorId stops accepting legacy/unrecorded null',
  );
});

test('search has a word for a record that is neither yours nor Apple’s', () => {
  // Without one, the only options were a lie and a different lie.
  const worker = readFileSync(join(WEB, '..', 'worker', 'src', 'search.ts'), 'utf8');
  assert.match(worker, /SEARCH_AUTHORS = \[[^\]]*'teammate'/);
  const panel = readFileSync(join(WEB, 'src', 'components', 'ws', 'search-panel.tsx'), 'utf8');
  assert.match(panel, /teammate:/, 'and the panel must have a noun for it, or it renders as a raw token');
});
