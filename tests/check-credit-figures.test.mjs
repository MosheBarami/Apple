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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unusedNames } from '../scripts/lib/config-reads.mjs';

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

const METER = 'components/CreditMeter.astro';
const METER_ABS = join(ROOT, 'apps/site/src', METER);

test('THE SUCCESS LINE CLAIMS THE CALCULATOR ONLY IF A PAGE RENDERS IT', () => {
  const rendered = componentIsRendered(METER);
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
    assert.match(out, /CreditMeter\.astro/, 'and named, so the decision has a file attached to it');

    // WHY THE TWO STATES ARE ASSERTED SEPARATELY. "Exists and nothing imports it" and "does not
    // exist" are different situations with opposite next actions, and the guard used to print the
    // first for both — so once the minimal site rebuild deleted the file, the run still told the
    // reader to "wire it back or delete it" about a file that was already gone. A guard that names
    // the wrong state sends the next person to wire up something that is not there.
    if (existsSync(METER_ABS)) {
      assert.match(out, /NOTHING RENDERS IT/, 'an orphan is reported as an orphan');
    } else {
      assert.match(out, /no longer exists/, 'a deletion is reported as a deletion');
      assert.doesNotMatch(
        out,
        /NOTHING RENDERS IT/,
        'and not as an orphan — the file is gone, so there is nothing to wire back',
      );
    }
  }
});

/**
 * THE PAGE MUST READ THE CONFIG, NOT ONLY IMPORT IT.
 *
 * "pricing.astro reads PLAN_TABLE, BUILD_COSTS, CREDIT_USD and TYPICAL_BUILD_CREDITS" was checked by
 * finding each name anywhere in the source, so the import list alone satisfied it and a page that had
 * typed every figure still counted four "config reads". unusedNames takes comments and imports out first.
 */
test('a page that only IMPORTS the config has not read it, and a page that uses it has', () => {
  const NAMES = ['PLAN_TABLE', 'BUILD_COSTS', 'CREDIT_USD', 'TYPICAL_BUILD_CREDITS'];
  const importOnly = [
    '---',
    "import {",
    '  PLAN_TABLE,',
    '  BUILD_COSTS,',
    '  CREDIT_USD,',
    '  type PlanId,',
    '  TYPICAL_BUILD_CREDITS } from \'@studpilot/shared\';',
    '---',
    '<h1>Free: 5 Credits a day</h1>',
  ].join('\n');
  assert.deepEqual(unusedNames(importOnly, NAMES), NAMES, 'an import list was counted as a use');

  const used = importOnly.replace('<h1>Free: 5 Credits a day</h1>',
    '<p>{PLAN_TABLE.free.creditsPerDay} {BUILD_COSTS.length} {CREDIT_USD} {TYPICAL_BUILD_CREDITS}</p>');
  assert.deepEqual(unusedNames(used, NAMES), [], 'a page that uses every name was reported');

  // One use among four: only the other three are reported. And a name that is only in a comment is not a use.
  const some = importOnly.replace('<h1>Free: 5 Credits a day</h1>', '<p>{PLAN_TABLE.free.name}</p>\n<!-- BUILD_COSTS CREDIT_USD -->\n{/* TYPICAL_BUILD_CREDITS */}');
  assert.deepEqual(unusedNames(some, NAMES), ['BUILD_COSTS', 'CREDIT_USD', 'TYPICAL_BUILD_CREDITS']);
});

test('the real pricing page does use all four config names', () => {
  const page = readFileSync(join(ROOT, 'apps/site/src/pages/pricing.astro'), 'utf8');
  assert.deepEqual(unusedNames(page, ['PLAN_TABLE', 'BUILD_COSTS', 'CREDIT_USD', 'TYPICAL_BUILD_CREDITS']), [], 'pricing.astro only imports one of them');
});

/* ============================================================================================
   THE SCRIPT IS RUN, NOT READ.

   This section used to match the text of the script (`unusedNames(page, CONFIG_NAMES)`), which stays true while
   the loop that REPORTS what unusedNames returns is deleted, and while CONFIG_NAMES is cut from four names to
   three (the dropped name is then never asked about). The real script (and the helpers it imports) is run here
   against a copy of the site's sources in which only the pricing page is replaced by a fixture, and what it says
   and how it exits is what is asserted.
   ============================================================================================ */

const NAMES = ['PLAN_TABLE', 'BUILD_COSTS', 'CREDIT_USD', 'TYPICAL_BUILD_CREDITS'];
const USES = { PLAN_TABLE: '{PLAN_TABLE.free.creditsPerDay}', BUILD_COSTS: '{BUILD_COSTS.length}', CREDIT_USD: '{CREDIT_USD}', TYPICAL_BUILD_CREDITS: '{TYPICAL_BUILD_CREDITS}' };

/** A pricing page that imports all four names and USES the ones in `used`. It says "midnight UTC", which the script also asks of it. */
const fixturePage = (used) => [
  '---',
  `import { ${NAMES.join(', ')} } from '@studpilot/shared';`,
  '---',
  '<p>Credits refill at midnight UTC.</p>',
  `<p>${used.map((n) => USES[n]).join(' ')}</p>`,
].join('\n');

/** Run the REAL check-credit-figures.mjs in a tree whose pricing page is `page`; everything else is the real thing. */
function runOnFixture(page, { shared = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-credit-figures-'));
  try {
    mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
    for (const f of ['check-credit-figures.mjs', 'lib/config-reads.mjs', 'lib/offer-rules.mjs']) {
      writeFileSync(join(dir, 'scripts', f), readFileSync(join(ROOT, 'scripts', f), 'utf8'));
    }
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    mkdirSync(join(dir, 'apps'), { recursive: true });
    const links = [['docs', 'docs'], ['apps/worker', 'apps/worker']];
    if (shared === null) links.push(['packages', 'packages']);
    for (const [link, target] of links) symlinkSync(join(ROOT, target), join(dir, link));
    if (shared !== null) {
      // A real copy of the shared package's sources, with `shared(text)` applied to index.ts: the figures the script reads.
      cpSync(join(ROOT, 'packages/shared/src'), join(dir, 'packages/shared/src'), { recursive: true });
      const index = join(dir, 'packages/shared/src/index.ts');
      writeFileSync(index, shared(readFileSync(index, 'utf8')));
    }
    // A real copy, not links: the script walks apps/site/src for .astro files and a symbolic link is not a file to that walk.
    cpSync(join(ROOT, 'apps/site/src'), join(dir, 'apps/site/src'), { recursive: true });
    writeFileSync(join(dir, 'apps/site/src/pages/pricing.astro'), page);
    const p = spawnSync('node', [join(dir, 'scripts', 'check-credit-figures.mjs')], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
    return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('FIXTURE CONTROL: a page that uses all four names passes, and the run counts four config reads', () => {
  // Without this every case below could fail because the fixture tree is broken, not because of the guard.
  const r = runOnFixture(fixturePage(NAMES));
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /plan figures: 4 config reads on \/pricing/);
});

test('THE SCRIPT REPORTS EVERY ONE OF THE FOUR NAMES a page imports and does not use, one at a time', () => {
  // One case per name, each page using the other three: the name left out must be reported and no other. A script that
  // stopped reporting what unusedNames returns passes none of them; a CONFIG_NAMES that lost a name passes the case for it.
  for (const name of NAMES) {
    const r = runOnFixture(fixturePage(NAMES.filter((n) => n !== name)));
    assert.equal(r.exit, 1, `${name}: ${r.out}`);
    assert.match(r.out, new RegExp(`pricing\\.astro no longer reads ${name} from packages/shared`), name);
    const reported = NAMES.filter((n) => r.out.includes(`no longer reads ${n} `));
    assert.deepEqual(reported, [name], `${name}: only the unused name is reported`);
  }
});

test('THE SCRIPT REPORTS A PAGE THAT ONLY IMPORTS THE CONFIG: all four, and it counts none as read', () => {
  const r = runOnFixture(fixturePage([]));
  assert.equal(r.exit, 1, r.out);
  for (const name of NAMES) assert.match(r.out, new RegExp(`no longer reads ${name} from packages/shared`), name);
  assert.match(r.out, /4 disagreement\(s\)/, 'exactly the four, and nothing else is wrong with the fixture');
});

test('THE SCRIPT HOLDS THE MILESTONE PRICE TO THE BUILD TABLE: a derivation that reads the per-request edit price, or types a build figure, fails the run', () => {
  const body = (text) => text.slice(text.indexOf('export function creditRangeForRuns'));
  const edit = (from, to) => (text) => {
    const at = text.indexOf('export function creditRangeForRuns');
    const end = text.indexOf('\n}\n', at);
    const fn = text.slice(at, end);
    assert.ok(fn.includes(from), `the fixture edit found no "${from}" in creditRangeForRuns`);
    return text.slice(0, at) + fn.replace(from, to) + text.slice(end);
  };
  assert.ok(body(readFileSync(join(ROOT, 'packages/shared/src/index.ts'), 'utf8')).includes('BUILD_COSTS.find('), 'the real derivation reads BUILD_COSTS');
  assert.equal(runOnFixture(fixturePage(NAMES), { shared: (t) => t }).exit, 0, 'control: an unedited copy of the shared package passes');

  const edit1 = runOnFixture(fixturePage(NAMES), { shared: edit('BUILD_COSTS.find(', 'MODE_INFO.agent.typicalCredits.concat(') });
  assert.equal(edit1.exit, 1, edit1.out);
  assert.match(edit1.out, /creditRangeForRuns does not read BUILD_COSTS/);
  assert.match(edit1.out, /creditRangeForRuns reads MODE_INFO, the per-request edit price/);

  const typed = runOnFixture(fixturePage(NAMES), { shared: edit('const low = Math.round(build.creditsLow * INTERNAL_PER_CREDIT);', 'const low = 210;') });
  assert.equal(typed.exit, 1, typed.out);
  assert.match(typed.out, /creditRangeForRuns hard-codes the published figure 210; it must read it from BUILD_COSTS/);
});
