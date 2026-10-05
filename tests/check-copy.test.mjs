// The copy guard runs, and it can fail.
//
// A checker that reports "COPY CLEAN" across 83 pages is worth exactly as much as its ability to
// say the opposite. The first version of this rule set said CLEAN on a tree where all five prose
// shapes had been injected — because it stripped Astro frontmatter, which is where a third of the
// page's words live. So the cases below inject each shape and require the checker to name it.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Root test files run in parallel. Injecting copy into the checkout's pricing page raced the
// credit-figure guard in CI, which sometimes read our temporary line instead of the real page.
// Copy only the trees the checker walks; the mutation stays inside this test's private fixture.
const FIXTURE = mkdtempSync(join(tmpdir(), 'check-copy-'));
for (const path of ['scripts/check-copy.mjs', 'scripts/lib/copy-shapes.mjs', 'apps/site/src', 'apps/site/brand/og.html', 'apps/site/public/site.webmanifest', 'apps/web/src', 'apps/web/index.html', 'apps/site/index.html']) {
  const from = join(ROOT, path);
  if (!existsSync(from)) continue;
  const to = join(FIXTURE, path);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}
after(() => rmSync(FIXTURE, { recursive: true, force: true }));
const SCRIPT = join(FIXTURE, 'scripts', 'check-copy.mjs');
const VICTIM = join(FIXTURE, 'apps', 'site', 'src', 'pages', 'pricing.astro');
const SOURCE_VICTIM = join(ROOT, 'apps', 'site', 'src', 'pages', 'pricing.astro');

function run() {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT], { cwd: FIXTURE, encoding: 'utf8' }) };
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

test('copy injection never edits the shared checkout', () => {
  const original = readFileSync(SOURCE_VICTIM, 'utf8');
  withCopy('Create your dream game in minutes', () => {
    assert.equal(readFileSync(SOURCE_VICTIM, 'utf8'), original,
      'the copy test changed pricing.astro while other root tests were reading it');
  });
});

//[[ THE SHARE CARD AND THE WEB MANIFEST ARE READ (2026-10-05).
//
//   Both carried "Describe a Roblox game. StudPilot builds it." (whole-game framing, and the competitor shape this checker bans) while it printed
//   CLEAN, because neither is a page and the walk only opened pages. Each is put back in its old state inside the private fixture below and the
//   checker must name the file and the rule. The sentence is also a construction the first version of the rule could not see ("Describe a Roblox
//   game", with a noun phrase after the verb), so that widening is held here too. ]]
const OG_VICTIM = join(FIXTURE, 'apps', 'site', 'brand', 'og.html');
const MANIFEST_VICTIM = join(FIXTURE, 'apps', 'site', 'public', 'site.webmanifest');
function withFileEdited(victim, edit, fn) {
  const original = readFileSync(victim, 'utf8');
  try {
    writeFileSync(victim, edit(original));
    fn(run());
  } finally {
    writeFileSync(victim, original);
  }
}
const OLD_CARD = '<h1><span>Describe a</span> <span>Roblox game.</span> <span>StudPilot builds it.</span></h1>';

test('it reads the share card: the old headline put back in og.html is named, with its file', () => {
  withFileEdited(OG_VICTIM, (t) => t.replace(/<h1>[\s\S]*?<\/h1>/, OLD_CARD), (r) => {
    assert.equal(r.code, 1, `the checker passed on the old share card:\n${r.out}`);
    assert.match(r.out, /describe-it-then-builds-it/);
    assert.match(r.out, /apps\/site\/brand\/og\.html/);
  });
});

test('it reads the web manifest: the old description put back is named, with its file', () => {
  withFileEdited(MANIFEST_VICTIM, (t) => t.replace(/"description": "[^"]*"/, '"description": "Describe a Roblox game. StudPilot builds it, straight into the place you have open in Studio."'), (r) => {
    assert.equal(r.code, 1, `the checker passed on the old manifest:\n${r.out}`);
    assert.match(r.out, /apps\/site\/public\/site\.webmanifest/);
  });
});

test('the explanation inside the share card is not copy: its own comment names the banned shapes and the checker stays clean', () => {
  assert.equal(run().code, 0);
  assert.match(readFileSync(OG_VICTIM, 'utf8'), /<!--[\s\S]*whole game[\s\S]*-->/, 'the card no longer explains itself, so this proves nothing');
});

for (const [line, rule] of [
  ['Describe what you want and StudPilot builds it for you', 'describe-it-builds-it'],
  ['Turn one prompt into a whole playable game', 'one-x-whole-y'],
  ['StudPilot is not just another code assistant', 'x-not-y'],
  ['Make Roblox games without learning to code', 'without-learning'],
  ['Create your dream game in minutes', 'dream-vague'],
  ['Describe a Roblox game. StudPilot builds it.', 'describe-it-then-builds-it'],
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
  const src = readFileSync(join(FIXTURE, 'scripts', 'lib', 'copy-shapes.mjs'), 'utf8');
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
