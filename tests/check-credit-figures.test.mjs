/**
 * A GUARD MAY ONLY NAME SURFACES IT ACTUALLY VERIFIED.
 *
 * check-credit-figures.mjs ends a passing run with a sentence listing what it compared: "COST-MODEL
 * neurons, the worker's arithmetic, the page and the calculator". Three of those four are real. The
 * calculator is apps/site/src/components/CreditMeter.astro, and no page or layout has imported it
 * since the usage explorer was pulled off /pricing — so for as long as that has been true, a money
 * guard has been reporting coverage of a surface no customer can reach, in the one sentence a
 * reader uses to decide the published prices were checked.
 *
 * That is this repository's own failure shape pointed at its own tooling: a thing that was not
 * observed rendering as an observation. The fix is not to make the guard louder; every shipped
 * figure it names IS checked and no customer is misled by a price. The fix is that the sentence
 * says what happened.
 *
 * WHAT THIS TEST IS, precisely: it recomputes the import graph itself — from the same directories,
 * by a different route than the script — and asserts the script's claim and the graph agree. It is
 * therefore not a spelling test for today's wording. Re-import CreditMeter.astro and this still
 * passes, because then the claim becomes true; break the script's detection so it always says one
 * thing, and this goes red in whichever direction the tree is actually in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-credit-figures.mjs');

const run = () => {
  const p = spawnSync('node', [CHECKER], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
};

/**
 * Does anything Astro will actually render import the calculator? Walked with a plain recursive
 * readdir over pages and layouts — the two roots a component can only reach a browser through.
 */
function componentIsRendered(component) {
  const roots = [join(ROOT, 'apps/site/src/pages'), join(ROOT, 'apps/site/src/layouts')];
  const files = roots.flatMap((dir) =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.astro'))
      .map((e) => join(e.parentPath, e.name)),
  );
  assert.ok(files.length > 5, `only ${files.length} .astro files found — the walk is wrong, not the tree`);
  return files.some((f) => readFileSync(f, 'utf8').includes(component));
}

test('the guard still reaches a verdict on the real repository', () => {
  const r = run();
  assert.equal(r.exit, 0, `check-credit-figures failed:\n${r.out}`);
  assert.match(r.out, /modes agree — COST-MODEL neurons/, 'and it still prints the sentence under test');
});

test('THE SUCCESS LINE CLAIMS THE CALCULATOR ONLY IF A PAGE RENDERS IT', () => {
  const rendered = componentIsRendered('components/CreditMeter.astro');
  const { out } = run();
  const claimsCalculator = /the page and the calculator/.test(out);

  assert.equal(
    claimsCalculator,
    rendered,
    rendered
      ? 'a page renders CreditMeter.astro and the guard no longer counts it'
      : 'the guard reports verifying "the calculator" while no page or layout imports CreditMeter.astro — ' +
        'a money guard claiming coverage of a component that ships to nobody',
  );

  if (!rendered) {
    // Silence would be the other half of the same defect: dropping the claim and saying nothing
    // leaves an unrendered 600-line component with retired plan copy in it and no reader informed.
    assert.match(out, /NOTHING RENDERS IT/,
      'dropping the claim is not enough — the orphan has to be reported to whoever reads this run');
    assert.match(out, /CreditMeter\.astro/, 'and named, so the decision has a file attached to it');
  }
});
