// `task.wait(1)` is the modern replacement, and a scanner looking for `wait(` counts it as the
// thing it replaced.
//
// WHY THIS EXISTS. The standing ask names current Luau — "כל סוגי הluau העדכניים" — and the corpus
// card lists the gap in its own words: it does not know whether any of this is current. Measuring
// it has three ways to go wrong, and all three return a confident number.
//
//   THE FIRST is matching the deprecated global as a substring. A corpus full of the CORRECT
//   modern call — `task.wait(...)` — would be reported as a corpus full of the deprecated one, and
//   the better the code, the worse the number. The same for `signal:wait()`, which is a method.
//
//   THE SECOND is counting a method NAME as a method call on the deprecated class. `:Remove()` is
//   deprecated on Instance and is also the name of a method on half the hand-rolled list classes
//   in the corpus. This is reported as an upper bound and must stay labelled one.
//
//   THE THIRD, which this file was born from: `--!strict` IS A COMMENT. The scan strips comments
//   before matching, because four scanners in this repository have counted a file's own prose
//   description of what it does not do. Stripping deletes Luau's mode line — the commonest mark of
//   modern Luau there is. The first run over 27,671 rows reported `strict_mode` firing ZERO times,
//   and it did not look like an error: the marker was simply absent from the tally while the other
//   five carried a plausible total.
//
// WHAT THIS PROVES, STATED NARROWLY: that `task.wait(`, `signal:wait(` and `mywait(` are not the
// deprecated global and a bare `wait(` is; that the deprecated vocabulary is DERIVED from Roblox's
// engine reference and a Deprecated tag is attributed to the member it belongs to rather than the
// one above it; that the mode line survives comment stripping; that `continue` is seen where it is
// actually written, before `end`; and that the committed report keeps its own precision labels.
//
// It proves nothing about whether a row free of deprecated calls is modern. Lua 5.1 that never
// needed `wait()` is indistinguishable here from Luau that avoided it, and the report says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deprecatedMembers,
  deriveDeprecated,
  deprecatedGlobalsUsed,
  deprecatedMethodNamesUsed,
  modernMarkers,
} from './measure-luau-currency.mjs';
import { stripLuauComments } from './measure-ui-yield.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..', '..');
const ENGINE = join(REPO, 'packages/corpus/raw/Roblox__creator-docs/content/en-us/reference/engine');
const REPORT = join(ROOT, 'runs/luau-currency-github-v1.json');

const GLOBALS = new Set(['wait', 'spawn', 'delay', 'getfenv']);

test('the modern replacement is not counted as the thing it replaced', () => {
  assert.equal(deprecatedGlobalsUsed('wait(1)', GLOBALS).has('wait'), true,
    'the bare deprecated global was not seen');
  assert.equal(deprecatedGlobalsUsed('task.wait(1)', GLOBALS).size, 0,
    'task.wait — the CORRECT modern call — was counted as the deprecated global');
  assert.equal(deprecatedGlobalsUsed('signal:wait()', GLOBALS).size, 0,
    'a method named wait was counted as the global');
  assert.equal(deprecatedGlobalsUsed('mywait(1)', GLOBALS).size, 0,
    'a longer identifier ending in the global name was counted');
  assert.equal(deprecatedGlobalsUsed('task.spawn(f)', GLOBALS).size, 0);
  assert.equal(deprecatedGlobalsUsed('spawn(function() end)', GLOBALS).has('spawn'), true);
});

test('a deprecated global mentioned but not called is not a call', () => {
  assert.equal(deprecatedGlobalsUsed('local t = wait\n', GLOBALS).size, 0,
    'a reference to the global without calling it was counted as a call');
});

test('a Deprecated tag belongs to its own member, not the one above it', () => {
  // Scanning line by line attributes a tag to whichever member was last seen. Splitting on the
  // member boundary is what keeps `Fine` clean.
  const yaml = [
    '  - name: Fine',
    '    tags: []',
    '  - name: Old',
    '    tags:',
    '      - Deprecated',
    '  - name: AlsoFine',
    '    tags:',
    '      - NotBrowsable',
    '',
  ].join('\n');
  assert.deepEqual(deprecatedMembers(yaml), ['Old']);
});

test('the deprecated vocabulary is derived from the engine reference, not typed here',
  { skip: existsSync(ENGINE) ? false : 'the engine reference is not in this checkout' }, () => {
    const d = deriveDeprecated(ENGINE);
    assert.ok(d.globals.size > 0, 'an empty global set would report the whole corpus modern');
    assert.ok(d.methods.size > 0, 'an empty method set would report the whole corpus modern');
    // The ones any Roblox engineer would name. If Roblox un-deprecates them this fails, which is
    // the right failure: the list is supposed to follow the reference.
    for (const g of ['wait', 'spawn', 'delay']) {
      assert.ok(d.globals.has(g), `${g} is not in the derived deprecated globals`);
    }
    assert.ok(d.methods.has('LoadAnimation'), 'LoadAnimation is not in the derived deprecated methods');
    assert.ok(d.class_files_read > 100, `only ${d.class_files_read} class files read`);
    assert.ok(d.properties_seen_but_not_matched > 0,
      'no deprecated properties were seen, which means either the reference changed or the split is wrong');
  });

test('a deprecated method name is found at a call site', () => {
  const methods = new Set(['LoadAnimation', 'Remove']);
  assert.deepEqual([...deprecatedMethodNamesUsed('h:LoadAnimation(track)', methods)], ['LoadAnimation']);
  assert.equal(deprecatedMethodNamesUsed('h.LoadAnimation', methods).size, 0,
    'a property access was counted as a method call');
});

// ---------------------------------------------------------------------------------------------
// The mode line, which comment stripping deletes.
// ---------------------------------------------------------------------------------------------

test('--!strict survives, because it is read from the raw source and it is a comment', () => {
  const raw = '--!strict\nlocal x = 1\nreturn x\n';
  const code = stripLuauComments(raw);
  assert.equal(code.includes('--!strict'), false,
    'the premise of this test is gone: comment stripping no longer removes the mode line');

  assert.equal(modernMarkers(code, raw).strict_mode, true,
    'the mode line was not found in the raw source');
  // And the bug, stated as the test that would have caught it: reading only the stripped code.
  assert.equal(modernMarkers(code).strict_mode, false,
    'this asserts the FAILING path, so that the two-argument call is provably doing the work');
});

test('continue is seen where it is actually written, which is before end', () => {
  assert.equal(modernMarkers('for i=1,3 do if i==2 then continue end end').continue_statement, true,
    'the common form `continue end` was missed');
  assert.equal(modernMarkers('for i=1,3 do\ncontinue\nend').continue_statement, true);
  assert.equal(modernMarkers('local continueFlag = 1').continue_statement, false,
    'an identifier beginning with continue was counted');
  assert.equal(modernMarkers('t.continue = 1').continue_statement, false,
    'a field named continue was counted');
});

test('each modern marker fires for its own form and no other', () => {
  const only = (src, key) => {
    const m = modernMarkers(src);
    assert.equal(m[key], true, `${key} did not fire for its own form`);
    for (const [k, v] of Object.entries(m)) {
      if (k !== key) assert.equal(v, false, `${key}'s fixture also lit ${k}`);
    }
  };
  only('type Foo = {a: number}\n', 'type_alias');
  only('local x: number = 1\n', 'annotation');
  only('local s = `hi {n}`\n', 'string_interpolation');
  only('x += 1\n', 'compound_assignment');
  const plain = modernMarkers('local x = 1\nreturn x\n');
  assert.equal(Object.values(plain).some(Boolean), false, 'plain Lua 5.1 lit a modern marker');
});

// ---------------------------------------------------------------------------------------------
// The committed report.
// ---------------------------------------------------------------------------------------------

test('the committed report keeps its precision labels and its limits',
  { skip: existsSync(REPORT) ? false : 'runs/luau-currency-github-v1.json is not in this checkout' }, () => {
    const r = JSON.parse(readFileSync(REPORT, 'utf8'));
    assert.ok(r.rows_in_corpus > 0);
    assert.ok(r.deprecated_globals.rows_calling_at_least_one <= r.rows_in_corpus);
    assert.ok(r.modern_luau.rows_with_at_least_one_marker <= r.rows_in_corpus);

    // The labels are the finding. Without them the two numbers look equally solid, and one is not.
    assert.match(r.deprecated_globals.precision, /PRECISE/);
    assert.match(r.deprecated_method_names.precision, /UPPER BOUND/,
      'the method count stopped saying it is an upper bound, and it will be quoted as a fact');
    assert.match(r.derived_from.why_properties_are_not_matched, /meaningless|Rotation/,
      'the report stopped explaining why deprecated PROPERTIES are not counted');
    assert.ok(Array.isArray(r.what_this_does_not_establish) && r.what_this_does_not_establish.length >= 3);
    assert.match(r.what_this_does_not_establish.join(' '), /training_approved is false/,
      'the report stopped saying nothing here approves anything for training');

    // The tally must not silently lose a marker, which is exactly how strict_mode read as zero.
    const markers = Object.keys(modernMarkers('--!strict\ntype T = {a:number}\nlocal x: T = {a=1}\nlocal s = `{x}`\nx += 1\nfor i=1,2 do continue end\n', '--!strict\n'));
    for (const k of markers) {
      assert.ok(k in r.modern_luau.by_marker,
        `marker ${k} is absent from the committed tally — a marker that can never fire contributes `
        + 'zero and looks exactly like a marker that is simply rare');
    }
  });
