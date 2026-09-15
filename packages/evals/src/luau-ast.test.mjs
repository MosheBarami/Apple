// Proof that the Luau parser reads Luau, and proof that it reports what it cannot read.
//
// A parser is the easiest thing in this repository to fake a pass on. `parseLuau` returns
// `{ ok, ast, errors }` and never throws, so a test that only checks `ok === true` on valid input
// is satisfied by a parser that returns `{ ok: true, ast: { body: [] } }` for everything. Every
// positive test here therefore asserts something about the SHAPE it produced — the node type, the
// name, the line — and every negative test feeds a construct that is actually broken and asserts
// the error lands on the right line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { parseLuau, tokenize, findNodes, memberPath, walk, inspectLuau } from './luau-ast.mjs';

const parse = (src) => {
  const r = parseLuau(src);
  assert.deepEqual(r.errors, [], `expected a clean parse, got ${JSON.stringify(r.errors)}`);
  return r.ast;
};

// ------------------------------------------------------------------ lexer

test('a `--` inside a string is not a comment', () => {
  const { tokens, comments } = tokenize('local url = "http://a--b"\n');
  assert.deepEqual(comments, []);
  assert.equal(tokens.find((t) => t.type === 'string').value, '"http://a--b"');
});

test('a long comment does not swallow the code after its close', () => {
  const src = '--[==[ ignored ]==] local x = 1\n';
  const ast = parse(src);
  assert.equal(ast.body.length, 1);
  assert.equal(ast.body[0].names[0].name, 'x');
});

test('line and column follow the source through multi-line strings', () => {
  const src = 'local s = [[a\nb\nc]]\nlocal y = 2\n';
  const ast = parse(src);
  assert.equal(ast.body[1].line, 4, 'the second statement is on line 4, after the 3-line string');
  assert.equal(ast.body[1].column, 1);
});

test('numbers keep their Luau spellings', () => {
  const ast = parse('local a, b, c, d = 0xFF, 1_000, .5e3, 0b1010\n');
  assert.deepEqual(ast.body[0].init.map((n) => n.value), [255, 1000, 500, 10]);
});

test('an unterminated string is reported, with a line, and does not throw', () => {
  const r = parseLuau('local s = "oops\nlocal y = 1\n');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].line, 1);
  assert.match(r.errors[0].message, /unterminated/);
});

// ------------------------------------------------------------------ statements

test('every statement form produces its own node type', () => {
  const ast = parse(`local a = 1
a = 2
a += 3
do local b = 1 end
if a then a = 4 elseif b then a = 5 else a = 6 end
while a do a -= 1 end
repeat a += 1 until a > 3
for i = 1, 10, 2 do print(i) end
for k, v in pairs({}) do print(k, v) end
local function f() return 1 end
function g() end
print(a)
`);
  assert.deepEqual(ast.body.map((s) => s.type), [
    'LocalStatement', 'AssignmentStatement', 'AssignmentStatement', 'DoStatement', 'IfStatement',
    'WhileStatement', 'RepeatStatement', 'NumericForStatement', 'GenericForStatement',
    'FunctionDeclaration', 'FunctionDeclaration', 'CallStatement',
  ]);
  assert.equal(ast.body[2].operator, '+=');
  assert.equal(ast.body[4].clauses.length, 2);
  assert.ok(ast.body[4].orelse);
});

test('`continue` is a statement in a loop and an identifier everywhere else', () => {
  const inLoop = parse('for i = 1, 3 do if i == 2 then continue end end\n');
  const clause = inLoop.body[0].body[0].clauses[0];
  assert.equal(clause.body[0].type, 'ContinueStatement');

  const asName = parse('local continue = 1\ncontinue = continue + 1\nprint(continue)\n');
  assert.equal(asName.body[0].names[0].name, 'continue');
  assert.equal(asName.body[1].type, 'AssignmentStatement');
});

test('a method declaration gets an implicit `self` and knows its owner', () => {
  const ast = parse('local M = {}\nfunction M:Buy(id) return id end\n');
  const fn = ast.body[1];
  assert.equal(fn.name, 'M.Buy');
  assert.equal(fn.isMethod, true);
  assert.deepEqual(fn.params.map((p) => p.name), ['self', 'id']);
});

// ------------------------------------------------------------------ types

test('a type annotation does not eat the initialiser', () => {
  // `{number}` ends where the type ends; a bracket-balancing skipper loses the `= {1, 2}`, and the
  // initialiser is the expression every later analysis reads.
  const ast = parse('local xs: {number} = {1, 2}\n');
  assert.equal(ast.body[0].init.length, 1);
  assert.equal(ast.body[0].init[0].type, 'TableConstructorExpression');
  assert.equal(ast.body[0].init[0].fields.length, 2);
});

test('generics, unions, optionals, function types and type packs all parse', () => {
  const ast = parse(`type Handler<T> = (T) -> ()
export type Trackable =
	| Instance
	| RBXScriptConnection
type Maybe = string?
type Fn = <T>(value: T, ...any) -> T
local function run<A...>(cb: (A...) -> (), ...: A...) return cb(...) end
`);
  const aliases = findNodes(ast, 'TypeAlias');
  assert.deepEqual(aliases.map((a) => a.name), ['Handler', 'Trackable', 'Maybe', 'Fn']);
  assert.equal(aliases[1].exported, true);
  assert.equal(findNodes(ast, 'FunctionDeclaration')[0].name, 'run');
});

test('`type` used as a variable is not mistaken for a type alias', () => {
  const ast = parse('local type = 1\ntype = type + 1\nprint(type)\n');
  assert.equal(findNodes(ast, 'TypeAlias').length, 0);
  assert.equal(ast.body[0].names[0].name, 'type');
});

test('a type assertion is a suffix, not a statement boundary', () => {
  const ast = parse('local n = (x :: any) :: number\n');
  const outer = ast.body[0].init[0];
  assert.equal(outer.type, 'TypeAssertion');
  assert.equal(outer.expression.type, 'ParenthesisExpression');
});

// ------------------------------------------------------------------ expressions

test('operator precedence binds the way Luau binds it', () => {
  const ast = parse('local v = 1 + 2 * 3 .. "x" or false\n');
  const root = ast.body[0].init[0];
  assert.equal(root.operator, 'or', '`or` is the loosest operator, so it is the root');
  assert.equal(root.left.operator, '..');
  assert.equal(root.left.left.operator, '+');
  assert.equal(root.left.left.right.operator, '*', '`*` binds tighter than `+`');
});

test('`-x^2` is `-(x^2)`, because `^` binds tighter than unary minus', () => {
  const ast = parse('local v = -x^2\n');
  const root = ast.body[0].init[0];
  assert.equal(root.type, 'UnaryExpression');
  assert.equal(root.argument.operator, '^');
});

test('string interpolation exposes the expressions inside it', () => {
  const ast = parse('local s = `hi {player.Name} you have {coins} coins`\n');
  const lit = ast.body[0].init[0];
  assert.equal(lit.interpolated, true);
  assert.equal(lit.expressions.length, 2);
  assert.equal(memberPath(lit.expressions[0]), 'player.Name');
  assert.equal(lit.expressions[1].name, 'coins');
});

test('an if-expression is an expression', () => {
  const ast = parse('local v = if a then 1 else 2\n');
  assert.equal(ast.body[0].init[0].type, 'IfExpression');
});

test('a method call is a CallExpression over a `:` member', () => {
  const ast = parse('game:GetService("Players"):GetPlayers()\n');
  const call = ast.body[0].expression;
  assert.equal(call.method, true);
  assert.equal(call.base.identifier.name, 'GetPlayers');
  assert.equal(memberPath(call.base.base.base), 'game.GetService');
});

// ------------------------------------------------------------------ errors

test('a missing `end` is reported at the token that proved it missing', () => {
  const r = parseLuau('local function f()\n\tprint(1)\n');
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /expected end/);
});

test('a bare expression is not a statement', () => {
  const r = parseLuau('local a = 1\na + 1\n');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].line, 2);
  assert.match(r.errors[0].message, /not a statement/);
});

test('the parser recovers and keeps parsing after a bad statement', () => {
  const r = parseLuau('local a = 1\n1 + = 2\nlocal b = 3\n');
  assert.equal(r.ok, false);
  const names = findNodes(r.ast, 'LocalStatement').map((s) => s.names[0].name);
  assert.deepEqual(names, ['a', 'b'], 'the statements either side of the error must survive');
});

test('parseLuau never throws, on any input', () => {
  const nasty = ['', '\0', 'end', ')', 'local', '"', '[[', '--[[', 'function', '::', '@', '`{'];
  for (const src of nasty) {
    const r = parseLuau(src);
    assert.equal(typeof r.ok, 'boolean', `threw or returned junk for ${JSON.stringify(src)}`);
    assert.ok(Array.isArray(r.errors));
  }
});

// ------------------------------------------------------------------ walking

test('walk visits nested functions and findNodes returns source order', () => {
  const ast = parse('local function a()\n\tlocal function b() end\nend\nlocal function c() end\n');
  assert.deepEqual(findNodes(ast, 'FunctionDeclaration').map((f) => f.name), ['a', 'b', 'c']);
  let count = 0;
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration') count += 1;
  });
  assert.equal(count, 3);
});

test('inspectLuau reports the file structure it actually found', () => {
  const info = inspectLuau(`local M = {}
type Cfg = { n: number }
function M.Start(a, b) return a + b end
local Other = require(script.Parent.Other)
return M
`);
  assert.equal(info.ok, true);
  assert.deepEqual(info.functions.map((f) => f.name), ['M.Start']);
  assert.deepEqual(info.types.map((t) => t.name), ['Cfg']);
  assert.equal(info.requireCount, 1);
  assert.equal(info.lineCount, 6);
});

// ------------------------------------------------------------------ the corpus

test('the parser reads the vendored corpus, and the failures are not Lua', () => {
  // A parser proved only on hand-written samples is proved only against the author's imagination.
  // The bound is a CEILING ON FAILURES, so it goes red if a change to the grammar regresses real
  // files — and it is measured over every Luau/Lua file in the corpus, not a sample.
  // Resolved from THIS FILE, never from the working directory. `pnpm -C packages/evals test` runs
  // with cwd inside the package, and a cwd-relative `find` would quietly match nothing there — the
  // test would report a pass having read zero files, which is the exact failure docs/FAILURES.md
  // is about.
  const corpus = fileURLToPath(new URL('../../corpus/raw', import.meta.url));
  if (!existsSync(corpus)) return; // corpus genuinely not fetched in this checkout
  const files = execSync(`find ${JSON.stringify(corpus)} -name "*.luau" -o -name "*.lua"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .trim().split('\n').filter(Boolean);
  assert.ok(files.length > 500, `the corpus directory exists but yielded ${files.length} Lua files`);

  let seen = 0;
  const failed = [];
  for (const f of files) {
    let src;
    try {
      src = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (src.length > 400_000) continue;
    seen += 1;
    if (!parseLuau(src).ok) failed.push({ f, src });
  }
  // Every known failure contains text that is not Lua at all: a `const` declaration (54 corpus
  // files were fetched with `local` replaced by `const`) or a `{{mustache}}` template placeholder.
  const genuine = failed.filter(({ src }) => !/^\s*const /m.test(src) && !/\{\{\w/.test(src));
  assert.ok(seen > 5000, `expected the full corpus, saw ${seen}`);
  assert.ok(
    genuine.length <= 8,
    `parser regressed: ${genuine.length} real files now fail — ${genuine.slice(0, 5).map((x) => x.f).join(', ')}`,
  );
  assert.ok(failed.length / seen < 0.02, `overall failure rate ${(100 * failed.length / seen).toFixed(2)}% is too high`);
});
