// Proof that the formatter changes whitespace and nothing else.
//
// The claim under test is not "the output looks nice" — taste is not falsifiable and a formatter
// that silently drops a statement can still look nice. The claim is:
//
//     tokens(format(src)) == tokens(src), for every file, forever.
//
// `tokenDrift` decides that, and it is run here over hand-picked hazards AND over every Lua file in
// the vendored corpus. The corpus run is the one that has already paid: it caught a global
// trailing-whitespace strip that was reaching inside multi-line comments and rewriting them, on 70
// real files. No hand-written sample in this file would have found it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { formatLuau, tokenDrift, mustSeparate } from './luau-format.mjs';

const format = (src, opts) => {
  const r = formatLuau(src, opts);
  assert.equal(r.ok, true, `expected the formatter to accept this input: ${JSON.stringify(r.errors)}`);
  assert.equal(tokenDrift(src, r.code), null, 'the formatter changed a token');
  return r.code;
};

// ------------------------------------------------------------------ token fusion

test('mustSeparate catches the pairs that fuse into something else', () => {
  assert.equal(mustSeparate('-', '-x'), true, '`- -x` written closed becomes a COMMENT');
  assert.equal(mustSeparate('[', '[s]'), true, '`[ [s]` written closed becomes a long STRING');
  assert.equal(mustSeparate('..', '.5'), true, '`.. .5` written closed becomes varargs');
  assert.equal(mustSeparate('local', 'x'), true, 'two words need a space');
  assert.equal(mustSeparate('f', '('), false, 'a call needs no space');
  assert.equal(mustSeparate(')', ','), false);
});

test('a double negation keeps its space, so it does not become a comment', () => {
  const out = format('local n = - -5\n');
  assert.equal(out, 'local n = - -5\n');
  assert.ok(!out.includes('--'), 'emitting `--5` would comment out the rest of the line');
});

test('an index of a long string keeps the brackets apart', () => {
  const out = format('local v = t[ [=[key]=] ]\n');
  assert.ok(!/\[\[/.test(out), 'emitting `[[` would start a long string and swallow the file');
});

// ------------------------------------------------------------------ layout

test('blocks are indented, and `else`/`elseif` sit with their `if`', () => {
  const out = format(`if a then
print(1)
elseif b then
print(2)
else
print(3)
end
`);
  assert.equal(out, `if a then
\tprint(1)
elseif b then
\tprint(2)
else
\tprint(3)
end
`);
});

test('the callback idiom indents its body once, not twice', () => {
  const out = format('Remote.OnServerEvent:Connect(function(player)\nprint(player)\nend)\n');
  assert.equal(out, 'Remote.OnServerEvent:Connect(function(player)\n\tprint(player)\nend)\n');
});

test('a multi-line table indents its fields and closes at the outer level', () => {
  const out = format('local t = {\na = function()\nreturn 1\nend,\nb = 2,\n}\n');
  assert.equal(out, 'local t = {\n\ta = function()\n\t\treturn 1\n\tend,\n\tb = 2,\n}\n');
});

test('operators, commas and calls get house spacing', () => {
  assert.equal(format('local  x=1+2*3\n'), 'local x = 1 + 2 * 3\n');
  assert.equal(format('f( a ,b )\n'), 'f(a, b)\n');
  assert.equal(format('local t={a=1,b=2}\n'), 'local t = { a = 1, b = 2 }\n');
  assert.equal(format('local s=#t\n'), 'local s = #t\n');
});

test('a type colon takes a space after it and a method colon does not', () => {
  assert.equal(format('local function f(n:number):number return n end\n'),
    'local function f(n: number): number return n end\n');
  assert.equal(format('game : GetService("Players")\n'), 'game:GetService("Players")\n');
});

test('comments keep their place, and blank lines are capped rather than deleted', () => {
  const out = format('local a = 1 -- trailing\n\n\n\n-- own line\nlocal b = 2\n');
  assert.equal(out, 'local a = 1 -- trailing\n\n-- own line\nlocal b = 2\n');
});

test('a long comment is reproduced byte for byte, interior whitespace included', () => {
  // The bug this pins: a `/[ \t]+$/gm` pass over the output edits the inside of multi-line tokens.
  const src = 'local a = 1\n--[=[\n\tline one\n\t\n\tline two\n]=]\nlocal b = 2\n';
  const out = format(src);
  assert.ok(out.includes('\tline one\n\t\n\tline two'), 'the blank line inside the comment kept its tab');
});

test('a long string is reproduced byte for byte', () => {
  const src = 'local s = [[\n  indented   \n  content\n]]\nreturn s\n';
  const out = format(src);
  assert.ok(out.includes('[[\n  indented   \n  content\n]]'), 'string data must never be reindented or trimmed');
});

// ------------------------------------------------------------------ properties

test('formatting is idempotent', () => {
  const src = 'local  t={a=1}\nif a then\nprint(1)\nend\n';
  const once = format(src);
  assert.equal(formatLuau(once).code, once);
});

test('the formatter declines a file it cannot lex, and returns it unchanged', () => {
  const broken = 'local s = "unterminated\nlocal x = 1\n';
  const r = formatLuau(broken);
  assert.equal(r.ok, false);
  assert.equal(r.code, broken, 'declining must mean leaving the file exactly as it was');
  assert.equal(r.changed, false);
  assert.ok(r.errors.length > 0);
});

test('tokenDrift actually detects a dropped token', () => {
  // Without this, every `assert.equal(tokenDrift(...), null)` above could be satisfied by a
  // tokenDrift that always returns null.
  assert.notEqual(tokenDrift('local a = 1\nlocal b = 2\n', 'local a = 1\n'), null);
  assert.notEqual(tokenDrift('print("a")\n', 'print("b")\n'), null);
  assert.equal(tokenDrift('local a = 1\n', 'local   a=1\n'), null, 'whitespace alone is not drift');
});

test('the formatter is token-safe and idempotent over the whole vendored corpus', (t) => {
  // THE EXISTENCE CHECK WAS ON THE DIRECTORY AND IT MEANT THE CONTENT. `packages/corpus/raw/`
  // holds two TRACKED manifests (`.gitignore:96,102` re-include them, because the corpus is
  // described as "re-fetchable from raw/manifest.json" and a recipe nobody has is not a recipe),
  // so the directory is in every clone and `existsSync` was true in every clone. The early return
  // never fired, the find matched nothing, and the assertion below failed with "yielded 0 Lua
  // files" — which took `pnpm -r test` down at @golem/evals on the runner while passing on any
  // machine that had fetched the corpus.
  //
  // ZERO is the discriminator, and nothing else is. Zero means the fetch never ran. Any count at
  // all means a corpus is here, and a corpus with fewer than 500 files is a degraded one that must
  // still go red — which is why the floor is untouched.
  const corpus = fileURLToPath(new URL('../../corpus/raw', import.meta.url));
  const files = existsSync(corpus)
    ? execSync(`find ${JSON.stringify(corpus)} -name "*.luau" -o -name "*.lua"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .trim().split('\n').filter(Boolean)
    : [];
  if (files.length === 0) {
    t.diagnostic(`${corpus} holds no Lua at all — the corpus is not fetched in this checkout, so `
      + 'NOTHING below was measured here. Fetch it with `pnpm --filter @golem/corpus fetch`.');
    return;
  }
  assert.ok(files.length > 500, `the corpus directory exists but yielded ${files.length} Lua files`);

  let seen = 0;
  const drifted = [];
  const unstable = [];
  for (const f of files) {
    let src;
    try {
      src = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (src.length > 300_000) continue;
    seen += 1;
    const r = formatLuau(src);
    if (!r.ok) continue; // a file that does not lex is declined by design
    if (tokenDrift(src, r.code)) {
      drifted.push(f);
      continue;
    }
    if (formatLuau(r.code).code !== r.code) unstable.push(f);
  }
  assert.ok(seen > 5000, `expected the full corpus, saw ${seen}`);
  assert.deepEqual(drifted, [], `the formatter changed tokens in ${drifted.length} file(s)`);
  assert.deepEqual(unstable, [], `the formatter is not idempotent on ${unstable.length} file(s)`);
});
