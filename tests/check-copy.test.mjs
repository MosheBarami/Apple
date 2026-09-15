// The copy guard runs, and it can fail.
//
// A checker that reports "COPY CLEAN" across 83 pages is worth exactly as much as its ability to
// say the opposite. The first version of this rule set said CLEAN on a tree where all five prose
// shapes had been injected — because it stripped Astro frontmatter, which is where a third of the
// page's words live. So the cases below inject each shape and require the checker to name it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-copy.mjs');
const VICTIM = join(ROOT, 'apps', 'site', 'src', 'pages', 'pricing.astro');

function run() {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

/** Put a line of copy into a real page, run the checker, put the page back. */
function withCopy(line, fn) {
  const original = readFileSync(VICTIM, 'utf8');
  try {
    const at = original.indexOf('---', 3) + 3;
    writeFileSync(VICTIM, `${original.slice(0, at)}\n<p>${line}</p>\n${original.slice(at)}`);
    fn(run());
  } finally {
    writeFileSync(VICTIM, original);
  }
}

test('THE TREE IS CLEAN — the control, without which nothing below means anything', () => {
  const r = run();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /COPY CLEAN/);
  assert.match(r.out, /\d+ pages/, 'and it must say how many pages it read');
});

test('it reads every page, not the one somebody was looking at', () => {
  // The owner asked for this to cover the whole site and the app, so the count is asserted rather
  // than trusted: a checker that quietly walked one directory would still say CLEAN.
  const r = run();
  const pages = Number(/(\d+) pages/.exec(r.out)?.[1] ?? 0);
  assert.ok(pages > 40, `only ${pages} pages scanned — the walk is missing a directory`);
});

for (const [line, rule] of [
  ['Describe what you want and Apple builds it for you', 'describe-it-builds-it'],
  ['Turn one prompt into a whole playable game', 'one-x-whole-y'],
  ['Apple is not just another code assistant', 'x-not-y'],
  ['Make Roblox games without learning to code', 'without-learning'],
  ['Create your dream game in minutes', 'dream-vague'],
]) {
  test(`it catches "${line}" as ${rule}`, () => {
    withCopy(line, (r) => {
      assert.equal(r.code, 1, `the checker passed on: ${line}`);
      assert.match(r.out, new RegExp(rule), 'and it must name WHICH rule, not just fail');
      assert.match(r.out, /seen on:/, 'with the competitor page it was quoted from');
      assert.match(r.out, /why not:/, 'and the reason, so a writer can disagree with it');
    });
  });
}

test('IT DOES NOT REPORT ITS OWN EXAMPLES — the trap this repo keeps falling into', () => {
  // check-copy.mjs quotes every banned construction verbatim in its own table, and the site files
  // explain in comments why they avoid them. A guard that read its commentary as data would fail
  // on a clean tree, every time, and be deleted within a day.
  const src = readFileSync(SCRIPT, 'utf8');
  assert.match(src, /describe\|tell\|type\|say/, 'the shapes really are in this file');
  assert.equal(run().code, 0, 'and the checker is still clean while they are');
});

test('a form validation message is not marketing copy', () => {
  // "That is not a user ID — it should look like the example above" was reported as the X-not-Y
  // shape. It is the opposite: a specific sentence telling somebody exactly what to fix. The rule
  // is anchored on the PRODUCT being the subject.
  withCopy('That is not a user ID — it should look like the example above.', (r) => {
    assert.equal(r.code, 0, `a validation message was reported as slop:\n${r.out}`);
  });
});
