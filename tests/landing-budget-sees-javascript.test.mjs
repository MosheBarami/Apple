// THE LANDING BUDGET CAN FAIL, AND IN PARTICULAR ITS JAVASCRIPT LINE CAN FAIL.
//
// This file exists because of one number. `scripts/check-landing-budget.mjs` printed
// `JavaScript (raw)  0 B` against `ALLOW_JS_BYTES = 0` on every run, and passed that line, while
// the built landing page carried seven inline <script> blocks totalling 32,079 B. The scan behind
// the zero matched `(href|src)="/….js"` and nothing else; Astro inlines this page's scripts, so
// there was no such attribute to find and never had been. The budget's strictest rule — no
// JavaScript, full stop — was the one rule in the file that could not be broken, because it could
// not be read.
//
// A zero is the most trusted reading an instrument can produce. "0 B" is heard as "looked, and
// there is none", never as "did not look".
//
// ================================ WHY THESE FIXTURES ARE SYNTHETIC
//
// The obvious way to write this file is to point it at apps/site/dist and mutate copies of the
// real page. That was the first version and it was wrong twice over. ci.yml runs "Root tests" at
// line 90 and builds the marketing site at line 127, so every case would have been asserting
// against a directory that does not exist yet on a fresh runner — either a red build I caused or,
// worse, a skip that reads as a pass. And this is a shared working tree: dist is a build artefact
// another lane may be rewriting mid-run.
//
// So each case writes a whole throwaway root — index.html, one stylesheet, one image — under the
// system temp directory and runs the real script with cwd set there, because the script takes its
// root from cwd. Nothing inside the repository is written, read or waited on.
//
// WHAT COVERS THE REAL PAGE, THEN. The checker's own instrument guard: it exits 1 if the document
// holds a `<script` that neither scan matched. The last case below is what proves that guard
// fires, and ci.yml runs the checker against the built page at line 164. The blindness cannot
// return to production without one of those two going red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-landing-budget.mjs');

/** Unique words from a fixed seed. A gzip budget can only be moved by entropy: the first version
 *  of the markup case repeated one sentence 4,000 times, 180 KB that gzip folded to 1,079 B, and
 *  the case failed for the wrong reason. */
function noise(words, seed = 20260921) {
  let s = seed;
  return Array.from({ length: words }, () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s.toString(36);
  }).join(' ');
}

/** A page shaped like the real one: inline scripts, a linked stylesheet, an image. Comfortably
 *  inside all three budgets, so any red below is the mutation and not the fixture. */
function page({ scripts = ['const a=1;', 'const b=2;'], body = '<p>hello</p>', extraHead = '' } = {}) {
  return `<!DOCTYPE html><html><head><link rel="stylesheet" href="/s.css">${extraHead}</head><body>
${body}
<img src="/i.png" alt="">
${scripts.map((s) => `<script>${s}</script>`).join('\n')}
</body></html>`;
}

/** Build a throwaway root, run the real checker in it, hand back code and output. */
function check(html, { css = 'body{color:#000}', image = Buffer.alloc(64, 7) } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'landing-budget-'));
  try {
    const dist = join(tmp, 'apps', 'site', 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), html);
    writeFileSync(join(dist, 's.css'), css);
    writeFileSync(join(dist, 'i.png'), image);
    try {
      return { code: 0, out: execFileSync('node', [SCRIPT], { cwd: tmp, encoding: 'utf8' }) };
    } catch (e) {
      return { code: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('THE CONTROL: a small page passes, on three separately labelled lines', () => {
  const r = check(page());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /TOTAL \(markup \+ stylesheets\)\s+\d+ B gzip\s+\/ \d+/, r.out);
  assert.match(r.out, /JavaScript \(raw, 2 inline block\(s\)\)\s+\d+ B\s+\/ \d+/, r.out);
  assert.match(r.out, /Images \(raw\)\s+\d+ B\s+\/ \d+/, r.out);
});

test('THE BLIND ZERO: inline script is counted as JavaScript, not as nothing', () => {
  // The assertion that did not exist. `<script>` with no `src` was invisible to the old scan, so
  // this page would have reported 0 B and passed a budget of 0.
  const r = check(page({ scripts: ['const x = 1;'.padEnd(5_000, ' ')] }));
  const line = /JavaScript \(raw, (\d+) inline block\(s\)\)\s+(\d+) B/.exec(r.out);
  assert.ok(line, `no JavaScript line in the output:\n${r.out}`);
  assert.equal(Number(line[1]), 1, r.out);
  assert.ok(
    Number(line[2]) >= 5_000,
    `the checker reported ${line[2]} B for a page carrying 5,000 B of inline script — the scan is blind`,
  );
});

test('the JavaScript budget goes red when the page ships more script', () => {
  const r = check(page({ scripts: [`// ${'x'.repeat(60_000)}`] }));
  assert.equal(r.code, 1, `the checker passed a page carrying 60 KB of inline script:\n${r.out}`);
  assert.match(r.out, /ships \d+ B of JavaScript; the budget is/, r.out);
});

test('an inline script does NOT quietly land on the markup line instead', () => {
  // The two lines partition index.html. If script bytes were still inside the gzipped markup
  // figure — which is how the old file reported a "markup + stylesheets" total that was a third
  // script — then adding only script would move the markup total.
  const markupOf = (out) => Number(/TOTAL \(markup \+ stylesheets\)\s+(\d+)/.exec(out)?.[1] ?? NaN);
  const before = markupOf(check(page()).out);
  const after = markupOf(check(page({ scripts: [noise(4_000)] })).out);
  assert.ok(Number.isFinite(before) && Number.isFinite(after), 'no markup total in the output');
  assert.ok(
    Math.abs(after - before) < 100,
    `the markup total moved from ${before} to ${after} when only script was added — the lines overlap`,
  );
});

test('the markup budget goes red when the markup grows', () => {
  const r = check(page({ body: `<p>${noise(6_000)}</p>` }));
  assert.equal(r.code, 1, `the checker passed a page with 40 KB of incompressible prose:\n${r.out}`);
  assert.match(r.out, /landing payload \d+ B gzip exceeds budget/, r.out);
});

test('the image budget goes red, and a referenced image the build did not produce is named', () => {
  const fat = check(page(), { image: Buffer.from(noise(12_000)) });
  assert.equal(fat.code, 1, fat.out);
  assert.match(fat.out, /landing images total \d+ B/, fat.out);

  const missing = check(page({ body: '<img src="/gone.webp" alt="">' }));
  assert.equal(missing.code, 1, missing.out);
  assert.match(missing.out, /\/gone\.webp, which is not in the build/, missing.out);
});

test('the checker reports ITSELF as broken when it cannot see a script it is budgeting', () => {
  // The historical failure, reproduced: a document holding scripts the scan cannot match. The
  // required behaviour is an error about the checker, not a serene `0 B`.
  // `\0` is the two-character ESCAPE. A raw NUL byte here makes this file BINARY to grep, to
  // file(1) and to every source-walking checker in the repository, and tests/gate-check.test.mjs
  // fails the suite on exactly that. The escape builds the identical string at runtime and the
  // NUL stays load-bearing: it is what makes the tag unmatchable by the scan.
  const html = page().replace(/<script>/g, '<script\0>').replace(/<\/script>/g, '</script\0>');
  const r = check(html);
  assert.equal(r.code, 1, `a page whose scripts are invisible to the scan was reported as passing:\n${r.out}`);
  assert.match(r.out, /cannot see the page it is budgeting/, r.out);
});

test('ci.yml still runs this checker against a BUILT page, after building it', () => {
  // The fixtures above prove the script's behaviour; they cannot prove it is ever pointed at the
  // real landing. Same guard, and the same reason, as tests/check-asset-wall.test.mjs.
  const ci = join(ROOT, '.github', 'workflows', 'ci.yml');
  assert.ok(existsSync(ci), `${ci} is gone — this checker may no longer run against a real page anywhere`);
  const yml = readFileSync(ci, 'utf8');
  const build = yml.indexOf('pnpm --filter @studpilot/site build');
  const budget = yml.indexOf('node scripts/check-landing-budget.mjs');
  assert.ok(build > -1, 'ci.yml no longer builds the marketing site');
  assert.ok(budget > -1, 'ci.yml no longer runs the landing payload budget');
  assert.ok(
    build < budget,
    'ci.yml runs the landing budget BEFORE it builds the site, so the checker reads a stale or absent dist',
  );
});
