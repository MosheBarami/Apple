/**
 * FIVE WAYS TO CHECK A BUILD, AND THE MODEL HAS TO KNOW WHICH ONE.
 *
 * check_composition, audit_build, run_spec, run_and_check and inspect_visually all answer "is this
 * any good" and answer completely different questions. Two of them cost money: inspect_visually
 * renders and calls a vision model, run_and_check runs the place. Three are free.
 *
 * Until now none of their descriptions mentioned any of the others, so the model chose between
 * them on vibes — and the cheapest correct answer is frequently one of the free ones. A tool
 * description is the ONLY place that choice can be informed: the model reads it before it reads
 * anything else, and there is no other channel where "run the free one first" can be said.
 *
 * This file pins the decision structure, not the prose. Each tool must say what it does NOT prove
 * and name the sibling that does, so a future edit cannot quietly leave the model guessing again.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'vt-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

const VERIFIERS = ['check_composition', 'audit_build', 'run_spec', 'run_and_check', 'inspect_visually'];
const describe = (name) => {
  const def = T.toolDefs(true, undefined).find((d) => d.name === name);
  assert.ok(def, `${name} is not offered`);
  return def.description;
};

test('all five verifiers exist and are offered, so nothing below is vacuous', () => {
  const offered = T.toolDefs(true, undefined).map((d) => d.name);
  for (const v of VERIFIERS) assert.ok(offered.includes(v), `${v} missing`);
});

test('THE PAID ONES SAY THEY COST, and name the free one to try first', () => {
  // The whole point. A model that does not know inspect_visually costs Credits will reach for it
  // when audit_build would have found the defect for nothing.
  const visual = describe('inspect_visually');
  assert.match(visual, /costs Credits|cost/i, 'it must say it costs');
  assert.match(visual, /audit_build/, 'and name the free alternative');
  assert.match(visual, /free/i, 'and say that it is free');
});

test('run_and_check says what it does NOT prove, and names what does', () => {
  // "Nothing errored" is the absence of one signal rendered as the presence of another — the same
  // shape as every other finding on this branch, one level up.
  const d = describe('run_and_check');
  assert.match(d, /NOTHING ERRORED|not.*same as.*correct/i, 'it must disclaim');
  assert.match(d, /run_spec/, 'and name the tool that asserts behaviour');
});

test('run_spec says what run_and_check cannot do', () => {
  const d = describe('run_spec');
  assert.match(d, /run_and_check/, 'it must name the tool it complements');
  assert.match(d, /errored|error/i);
});

test('audit_build says it does not replace the visual one', () => {
  const d = describe('audit_build');
  assert.match(d, /inspect_visually/, 'it must name the tool it complements');
  assert.match(d, /render/i, 'and say it does not look at one');
});

test('every snake_case name in a verifier description is a real tool', () => {
  // The same drift guard as the prompt and the roadmap briefs: a description naming a tool that
  // does not exist — `audit_buildd`, a renamed sibling — is an instruction the model follows,
  // fails, and works around, having spent a turn finding out.
  //
  // I first wrote this with `if (!names.has(token)) continue;` before the assertion, which made
  // the assertion unreachable on failure: the test could only ever pass. Exactly the shape this
  // branch keeps finding elsewhere, self-inflicted. The exceptions are now an explicit list, so
  // an unregistered token FAILS unless somebody decided otherwise in writing.
  const names = new Set(T.toolNames());
  const PROSE = new Set(['run_mode']); // Studio's Run mode, named in run_and_check as a concept
  for (const v of VERIFIERS) {
    for (const token of new Set(describe(v).match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [])) {
      if (PROSE.has(token)) continue;
      assert.ok(
        names.has(token),
        `${v}'s description names "${token}", which is neither a registered tool nor a declared prose term`,
      );
    }
  }
});

test('each of the three free verifiers says so, so cost is comparable at a glance', () => {
  // THE LOOP USED TO NAME THREE AND CHECK TWO. run_spec is free by this file's own opening
  // paragraph and was left out of the list, and its description said nothing about cost — so the
  // invariant this test is named after was already false of the shipped product while the test was
  // green. A test that names more than it checks is a worse failure than one that checks nothing,
  // because the name is what anybody reads.
  const free = ['check_composition', 'audit_build', 'run_spec'];
  assert.equal(free.length, 3, 'the name says three');
  for (const v of free) {
    assert.match(describe(v), /costs? nothing|free|no model call/i, `${v} should say it is free`);
  }
});

test('no two verifiers claim the same job in the same words', () => {
  // A cheap guard against the obvious regression: someone copies a description and edits half of
  // it, and two tools end up telling the model the same thing.
  const seen = new Map();
  for (const v of VERIFIERS) {
    const first = describe(v).split('.')[0].trim().toLowerCase();
    assert.equal(seen.get(first), undefined, `${v} and ${seen.get(first)} open identically: "${first}"`);
    seen.set(first, v);
  }
});
