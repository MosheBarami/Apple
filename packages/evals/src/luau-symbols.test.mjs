// Proof that the symbol index resolves names the way Lua resolves them.
//
// The expensive failure here is silent: an index that binds `x` to the wrong declaration still
// answers every question, just wrongly, and every diagnostic built on it inherits the error. So the
// three scoping rules each get a test whose EXPECTED ANSWER DIFFERS from the naive one — if the
// index were counting occurrences of a name, each of these would come out the other way.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSymbolTable, unusedLocals, shadowedLocals, crossReference, symbolAt, searchSymbols,
  isScalarExpression, ROBLOX_GLOBALS,
} from './luau-symbols.mjs';
import { parseLuau } from './luau-ast.mjs';

const table = (src) => {
  const parsed = parseLuau(src);
  assert.deepEqual(parsed.errors, [], `sample must parse: ${JSON.stringify(parsed.errors)}`);
  return buildSymbolTable(parsed);
};

const symbolNamed = (t, name, line) => t.symbols.find((s) => s.name === name && (line === undefined || s.line === line));

// ------------------------------------------------------------------ the three scoping rules

test('`local x = x` reads the OUTER x, not the one being declared', () => {
  const t = table('local x = 1\nlocal x = x + 1\nprint(x)\n');
  const outer = symbolNamed(t, 'x', 1);
  const inner = symbolNamed(t, 'x', 2);
  assert.notEqual(outer.id, inner.id, 'two declarations must be two symbols');
  assert.equal(outer.reads, 1, 'the initialiser on line 2 reads the line-1 binding');
  assert.deepEqual(outer.references.map((r) => r.line), [2]);
  assert.equal(inner.reads, 1, 'only the print on line 3 reads the line-2 binding');
  assert.deepEqual(inner.references.map((r) => r.line), [3]);
});

test('`local function f` is in scope inside its own body; `local f = function` is not', () => {
  const recursive = table('local function f(n)\n\treturn f(n - 1)\nend\nreturn f\n');
  assert.equal(symbolNamed(recursive, 'f').reads, 2, 'the recursive call and the return both read it');
  assert.deepEqual(recursive.unknownGlobals.map((g) => g.name), []);

  const notRecursive = table('local f = function(n)\n\treturn f(n - 1)\nend\nreturn f\n');
  assert.equal(symbolNamed(notRecursive, 'f').reads, 1, 'only the return reads it; the inner `f` is a global');
  assert.deepEqual(notRecursive.unknownGlobals.map((g) => g.name), ['f']);
});

test('a `repeat` condition can see the locals its body declared', () => {
  const t = table('repeat\n\tlocal ok = check()\nuntil ok\n');
  const ok = symbolNamed(t, 'ok');
  assert.equal(ok.reads, 1, 'the `until` reads the body-scoped local');
  assert.deepEqual(t.unknownGlobals.map((g) => g.name), ['check'], '`ok` must not leak into globals');
});

// ------------------------------------------------------------------ reads vs writes

test('a local that is only assigned is reported separately from one never touched', () => {
  const t = table('local never = 1\nlocal total\ntotal = 10\nlocal used = 2\nprint(used)\n');
  assert.deepEqual(unusedLocals(t).map((f) => [f.rule, f.symbol, f.line]), [
    ['unused-local', 'never', 1],
    ['write-only-local', 'total', 2],
  ]);
});

test('a compound assignment counts as both a read and a write', () => {
  const t = table('local n = 0\nn += 1\n');
  const n = symbolNamed(t, 'n');
  assert.equal(n.writes, 1);
  assert.equal(n.reads, 1, '`n += 1` reads n before writing it, so it is not write-only');
  assert.deepEqual(unusedLocals(t), []);
});

test('`x.field = 1` READS x — it does not write the variable', () => {
  const t = table('local t = {}\nt.field = 1\n');
  const sym = symbolNamed(t, 't');
  assert.equal(sym.reads, 1);
  assert.equal(sym.writes, 0);
});

test('an `_`-prefixed local is never reported', () => {
  const t = table('local _unused = 1\nfor _, v in pairs({}) do print(v) end\n');
  assert.deepEqual(unusedLocals(t), []);
});

test('parameters and loop counters are off by default and reportable on request', () => {
  const t = table('local function f(a, b)\n\treturn a\nend\nfor i = 1, 2 do print("x") end\nreturn f\n');
  assert.deepEqual(unusedLocals(t), []);
  const opted = unusedLocals(t, { includeParams: true, includeLoopVariables: true });
  assert.deepEqual(opted.map((f) => f.symbol).sort(), ['b', 'i']);
});

test('a name used ONLY in a type annotation is used', () => {
  // A module required solely for its exported types is the commonest module shape in the corpus;
  // counting only value positions reported one in every five files as an unused local.
  const t = table('local common = require(script.types)\nexport type A = common.Thing\nreturn nil\n');
  assert.equal(symbolNamed(t, 'common').reads, 1);
  assert.deepEqual(unusedLocals(t), []);
});

test('a type name that resolves to nothing is not filed as an unknown global', () => {
  const t = table('local function f(p: Player): number\n\treturn 1\nend\nreturn f\n');
  assert.deepEqual(t.unknownGlobals.map((g) => g.name), [], '`Player` and `number` are types, not variables');
});

// ------------------------------------------------------------------ globals

test('an assignment with no `local` is an implicit global; a read of an undefined name is not', () => {
  const t = table('Leaked = 1\nprint(Typoed)\nprint(game, workspace, task)\n');
  assert.deepEqual(t.implicitGlobals.map((g) => g.name), ['Leaked']);
  assert.deepEqual(t.unknownGlobals.map((g) => g.name), ['Typoed']);
  for (const known of ['game', 'workspace', 'task']) assert.ok(ROBLOX_GLOBALS.has(known));
});

test('extraGlobals lets a caller declare an injected environment without widening it for everyone', () => {
  const src = 'describe("x", function()\n\texpect(1).to.equal(1)\nend)\n';
  const bare = buildSymbolTable(parseLuau(src));
  assert.deepEqual(bare.unknownGlobals.map((g) => g.name).sort(), ['describe', 'expect']);
  const injected = buildSymbolTable(parseLuau(src), { extraGlobals: new Set(['describe', 'expect']) });
  assert.deepEqual(injected.unknownGlobals, []);
});

// ------------------------------------------------------------------ shadowing and lookup

test('shadowing points at the declaration it hides', () => {
  const t = table('local value = 1\nlocal function f()\n\tlocal value = 2\n\treturn value\nend\nreturn f, value\n');
  assert.deepEqual(shadowedLocals(t).map((s) => [s.symbol, s.line, s.shadowsLine]), [['value', 3, 1]]);
});

test('crossReference finds the definition and every reference of the symbol under the cursor', () => {
  const src = 'local coins = 0\ncoins = coins + 1\nprint(coins)\n';
  const t = table(src);
  const xref = crossReference(t, 2, 9); // the `coins` being read on line 2
  assert.equal(xref.symbol.name, 'coins');
  assert.equal(xref.definition.line, 1);
  assert.deepEqual(xref.references.map((r) => `${r.line}:${r.kind}`), ['2:read', '2:write', '3:read']);
  assert.equal(xref.reads, 2);
  assert.equal(xref.writes, 1);
});

test('symbolAt returns null between symbols rather than guessing', () => {
  const t = table('local coins = 0\n');
  assert.equal(symbolAt(t, 1, 1)?.name, undefined, 'column 1 is the `local` keyword, not a symbol');
  assert.equal(symbolAt(t, 1, 7).name, 'coins');
});

test('searchSymbols filters by kind and substring', () => {
  const t = table('local shopPrice = 1\nlocal function shopBuy() end\ntype ShopCfg = {}\nreturn shopBuy, shopPrice\n');
  assert.deepEqual(searchSymbols(t, 'shop').map((s) => s.name), ['shopPrice', 'shopBuy', 'ShopCfg']);
  assert.deepEqual(searchSymbols(t, 'shop', { kinds: ['function'] }).map((s) => s.name), ['shopBuy']);
});

// ------------------------------------------------------------------ scalars

test('isScalarExpression separates values from references', () => {
  const cases = [
    ['local x = 1', true], ['local x = "s"', true], ['local x = a + 1', true], ['local x = -n', true],
    ['local x = {}', false], ['local x = f()', false], ['local x = a or {}', false], ['local x = t.n', false],
  ];
  for (const [src, expected] of cases) {
    const init = parseLuau(`${src}\n`).ast.body[0].init[0];
    assert.equal(isScalarExpression(init), expected, src);
  }
});

test('a local assigned a table is not marked scalar even if it started as a number', () => {
  const t = table('local x = 1\nx = {}\nprint(x)\n');
  const sym = symbolNamed(t, 'x');
  assert.equal(sym.scalarInit, true);
  assert.equal(sym.nonScalarWrites, 1, 'the table assignment must be recorded, or termination analysis over-fires');
});
