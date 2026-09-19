// The dataset builder's judgement calls, tested.
//
// Every test here corresponds to a bug that was actually in this file. Two of them were found only
// because the output looked wrong, not because anything failed — which is the argument for pinning
// them: a dataset builder that is subtly wrong produces a model that is subtly wrong, and the loss
// curve looks healthy the whole way down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findBlockEnd, maskLiterals, looksLikeDescription, assignSplits, admissibleSources } from './build-dataset.mjs';

// --------------------------------------------------------------- block matching ---
// THE BUG: the first version matched `function ... end` with a lazy quantifier and an indentation
// backreference. It stopped at the first `end` of any NESTED block, so 68% of candidates reached
// the parser truncated mid-function and were discarded as syntax errors. That looked like
// "third-party code is low quality" and was entirely self-inflicted.

function extract(src) {
  const end = findBlockEnd(src, 0);
  return end === -1 ? null : src.slice(0, end);
}

test('a nested if does not end the function early', () => {
  const src = 'function f()\n\tif x then\n\t\treturn 1\n\tend\n\treturn 2\nend\ntrailing()';
  assert.equal(extract(src), 'function f()\n\tif x then\n\t\treturn 1\n\tend\n\treturn 2\nend');
});

test('`for ... do` is ONE block, not two', () => {
  // Counting `for` and its `do` separately double-counts, and the scan never terminates.
  const src = 'function f()\n\tfor i = 1, 10 do\n\t\tprint(i)\n\tend\nend\nafter()';
  assert.equal(extract(src), 'function f()\n\tfor i = 1, 10 do\n\t\tprint(i)\n\tend\nend');
});

test('`while ... do` is also one block', () => {
  const src = 'function f()\n\twhile true do\n\t\tbreak\n\tend\nend\nafter()';
  assert.equal(extract(src), 'function f()\n\twhile true do\n\t\tbreak\n\tend\nend');
});

test('a bare `do` block still opens a level', () => {
  const src = 'function f()\n\tdo\n\t\tlocal x = 1\n\tend\nend\nafter()';
  assert.equal(extract(src), 'function f()\n\tdo\n\t\tlocal x = 1\n\tend\nend');
});

test('repeat/until closes without an `end`', () => {
  const src = 'function f()\n\trepeat\n\t\tx = x + 1\n\tuntil x > 3\nend\nafter()';
  const got = extract(src);
  assert.ok(got.endsWith('end'), `expected the function to close, got: ${JSON.stringify(got)}`);
  assert.ok(got.includes('until x > 3'));
});

test('deeply nested blocks all close before the function does', () => {
  const src = [
    'function f()',
    '\tfor i = 1, 3 do',
    '\t\tif i > 1 then',
    '\t\t\twhile true do',
    '\t\t\t\tbreak',
    '\t\t\tend',
    '\t\tend',
    '\tend',
    'end',
    'after()',
  ].join('\n');
  const got = extract(src);
  assert.ok(got.endsWith('\nend'), 'the outermost end must be the one that closes it');
  assert.equal(got.includes('after()'), false, 'it must not run past the function');
});

test('the word `end` inside a string or comment does not close a block', () => {
  // Without masking, either of these terminates the function early and truncates the example.
  const s1 = 'function f()\n\tlocal msg = "the end"\n\treturn msg\nend\nafter()';
  assert.equal(extract(s1).includes('return msg'), true);
  const s2 = 'function f()\n\t-- end of the line\n\treturn 1\nend\nafter()';
  assert.equal(extract(s2).includes('return 1'), true);
});

test('maskLiterals blanks content but preserves offsets and newlines', () => {
  const src = 'local a = "xx"\n-- yy\nprint(a)';
  const masked = maskLiterals(src);
  assert.equal(masked.length, src.length, 'offsets must be preserved or every index shifts');
  assert.equal(masked.split('\n').length, src.split('\n').length, 'newlines must survive');
  assert.equal(masked.includes('xx'), false, 'string content must be blanked');
  assert.equal(masked.includes('yy'), false, 'comment content must be blanked');
  assert.ok(masked.includes('print(a)'), 'code outside literals is untouched');
});

test('an unterminated function reports no end rather than guessing one', () => {
  assert.equal(findBlockEnd('function f()\n\tif x then\n', 0), -1);
});

// ----------------------------------------------------- instruction quality ---
// THE BUG: real code puts section banners, return annotations and commented-out code immediately
// above a function. Pairing those with a body teaches the model to emit a specific library's
// internals in response to a prompt that does not describe them.

test('a real description is accepted', () => {
  for (const doc of [
    'Returns the distance between two positions in studs.',
    'Creates a new door model and parents it to the workspace.',
    'This handles the case where the player leaves mid-purchase.',
    'Sets the humanoid walk speed, clamped to a sane range.',
  ]) {
    assert.equal(looksLikeDescription(doc), true, doc);
  }
});

test('section banners and annotations are rejected', () => {
  for (const doc of [
    'ONLY WHEN FROM "Profile.GlobalUpdates":', // the one that shipped into v1's dataset
    '--> [ScriptConnection] listener(update_id, update_data)',
    'TODO fix this later when the API settles down',
    'SEE ALSO THE OTHER MODULE FOR DETAILS HERE',
    '@param listener function to call on update',
  ]) {
    assert.equal(looksLikeDescription(doc), false, doc);
  }
});

test('too short and too long are both rejected', () => {
  assert.equal(looksLikeDescription('Returns x.'), false, 'under the word floor');
  assert.equal(looksLikeDescription('word '.repeat(200)), false, 'over the ceiling');
});

test('C/Flow comment remnants and licence headers are not training instructions', () => {
  // These were real rows in the 404-row artefact: the extractor stripped Luau `--` markers but
  // left vendored React's `//`, `/**`, `*`, and `@param` prose behind. The response may parse, but
  // a model cannot act on a source header as a user request.
  for (const doc of [
    '// This returns the highest priority pending lanes regardless of whether they are suspended.',
    '/** Ensure that every element is passed in a static location. */',
    '* Copyright (c) Facebook, Inc. and its affiliates. * @flow',
    'Returns a value. @param value the value to return.',
  ]) {
    assert.equal(looksLikeDescription(doc), false, doc);
  }
});

// ------------------------------------------------------------------- splits ---
// THE BUG: hashing repo ids into percentage buckets produced train=216 / val=1 / test=5, because
// example counts across repos are wildly uneven. A one-example validation split cannot detect
// overfitting, which is the only thing validation is for.

test('splits are balanced by EXAMPLE COUNT, not by repo count', () => {
  const counts = { big: 400, medium: 60, small1: 20, small2: 15, small3: 5 };
  const { assignment, have, total } = assignSplits(counts);
  assert.equal(total, 500);
  assert.ok(have.val > 0, 'validation must not be empty');
  assert.ok(have.test > 0, 'test must not be empty');
  // Every repo lands in exactly one split — no repo may span splits, or the test set leaks.
  for (const repo of Object.keys(counts)) {
    assert.ok(['train', 'val', 'test'].includes(assignment[repo]), `${repo} unassigned`);
  }
});

test('train takes the largest share', () => {
  const counts = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`r${i}`, 10 + i]));
  const { have, total } = assignSplits(counts);
  assert.ok(have.train / total > 0.6, `train is only ${(have.train / total * 100).toFixed(0)}%`);
});

test('the assignment is deterministic across runs', () => {
  const counts = { a: 100, b: 50, c: 25, d: 10 };
  assert.deepEqual(assignSplits(counts).assignment, assignSplits(counts).assignment);
});

test('an empty corpus does not divide by zero', () => {
  const { have, total } = assignSplits({});
  assert.equal(total, 0);
  assert.equal(have.train + have.val + have.test, 0);
});

// ------------------------------------------------------- admissibility verdicts ---
// THE BUG: the verdict chain tested `!dir` FIRST, so a source the registry marks
// `training: forbidden` was recorded as "no checkout on disk" whenever nobody had cloned it.
// Both verdicts exclude the source, so the admitted set never changed and nothing failed — the
// only symptom was a provenance record that blamed the operator's disk for a licence decision, and
// described a permanent refusal in the language of a transient one. Found by rebuilding the
// dataset on a machine that deliberately did not hold the CC-BY repo and diffing the regenerated
// card against the committed one.

function manifestFixture(sources) {
  const dir = mkdtempSync(join(tmpdir(), 'golem-admissible-'));
  const raw = join(dir, 'raw');
  mkdirSync(raw, { recursive: true });
  writeFileSync(join(raw, 'manifest.json'), JSON.stringify({ sources }));
  return {
    manifestPath: join(raw, 'manifest.json'),
    rawDir: raw,
    mk: (name) => mkdirSync(join(raw, name), { recursive: true }),
  };
}

test('A FORBIDDEN SOURCE IS REPORTED AS FORBIDDEN EVEN WITH NOTHING ON DISK', () => {
  const f = manifestFixture({
    'Roblox__creator-docs': { url: 'https://github.com/Roblox/creator-docs', licence: { spdx: 'CC-BY-4.0' } },
  });
  const { admitted, rejected } = admissibleSources(f);
  assert.equal(admitted.length, 0);
  assert.match(rejected[0].reason, /training: forbidden/, 'absence must not overwrite the licence verdict');
});

test('and it is reported the same way once the files ARE there — the verdict does not depend on disk', () => {
  const f = manifestFixture({
    'Roblox__creator-docs': { url: 'https://github.com/Roblox/creator-docs', licence: { spdx: 'CC-BY-4.0' } },
  });
  f.mk('Roblox__creator-docs');
  assert.match(admissibleSources(f).rejected[0].reason, /training: forbidden/);
});

test('THE CONTROL — the absence clause still fires for a source with nothing else against it', () => {
  // Moving a clause to the end of a ternary chain is worthless if it stops firing at all.
  const f = manifestFixture({ ok__repo: { url: 'https://github.com/ok/repo', licence: { spdx: 'MIT' } } });
  const r = admissibleSources(f);
  assert.equal(r.admitted.length, 0);
  assert.equal(r.rejected[0].reason, 'no checkout on disk');
});

test('THE OTHER CONTROL — a permissive source that IS present is admitted', () => {
  // Without this, a chain that rejected everything would pass every test above.
  const f = manifestFixture({ ok__repo: { url: 'https://github.com/ok/repo', licence: { spdx: 'MIT' }, sha: 'abc' } });
  f.mk('ok__repo');
  const r = admissibleSources(f);
  assert.deepEqual(r.rejected, []);
  assert.equal(r.admitted[0].spdx, 'MIT');
});

test('a non-permissive SPDX is named by its SPDX id, not by absence', () => {
  const f = manifestFixture({ x__y: { url: 'https://github.com/x/y', licence: { spdx: 'GPL-3.0' } } });
  assert.match(admissibleSources(f).rejected[0].reason, /GPL-3\.0 not permissive/);
});
