#!/usr/bin/env node
// The three numbers on the landing page, recomputed from the data they claim to come from.
//
// THE COMMENT ABOVE THEM SAID "tests/check-proof-figures asserts they still match it".
// That file did not exist. Nothing had ever checked them, and one of the three was false in both
// halves: "3,017 game templates, checked against current Roblox APIs" took the harvest's TOTAL,
// attached to it a check the harvest records for 300 repositories, and called the result game
// templates — a set whose first entries include a Rust CSV tool, a Lua code formatter, and a Bee
// Swarm Simulator macro.
//
// A comment claiming a guard exists is worse than no comment, because it stops the next person
// looking. So the guard is real now, and it does the only thing that keeps a public number
// honest: it computes the figure itself and compares.
//
// WHAT IT CANNOT DO, said plainly: it checks the NUMBER against its source and the LABEL against a
// list of claims it knows how to verify. It cannot read English. A label that says something true
// of the data in words this file does not know will pass — so the `from` pointer beside each
// figure is the real discipline, and this script is what makes the pointer binding.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'packages', 'corpus', 'data');
const PAGE = join(ROOT, 'apps', 'site', 'src', 'pages', 'index.astro');

/* ------------------------------------------------------------------- the figures, computed --- */

/** Every harvested asset, deduplicated by id exactly as the ingest deduplicates them. */
function libraryTotals() {
  const files = [
    join(DATA, 'asset-seeds.json'),
    ...readdirSync(join(DATA, 'library'))
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => join(DATA, 'library', f)),
  ];
  const seen = new Set();
  let total = 0;
  let withRobloxId = 0;
  let withoutLicence = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    const part = JSON.parse(readFileSync(f, 'utf8'));
    // A harvest that recorded its own failure is not evidence of anything. Counting its rows
    // would be counting a file that says "I did not finish".
    if (part.failed === true) continue;
    for (const a of part.assets ?? []) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      total++;
      if (a.robloxAssetId) withRobloxId++;
      if (!a.licence) withoutLicence++;
    }
  }
  return { total, withRobloxId, withoutLicence };
}

function templateTotals() {
  const t = JSON.parse(readFileSync(join(DATA, 'template-seeds.json'), 'utf8'));
  return t.counts ?? {};
}

const lib = libraryTotals();
const tpl = templateTotals();

/**
 * What each `from` pointer resolves to.
 *
 * `library.usable` is deliberately NOT `template.total`: the harvester's own `usable` flag means
 * not archived, carrying a real licence, and using no API Roblox has removed. 3,017 is what a
 * GitHub search returned; 1,034 is what survived a gate.
 */
const RESOLVE = {
  'library.total': lib.total,
  'library.withRobloxId': lib.withRobloxId,
  'templates.usable': tpl.usable,
  'templates.total': tpl.total,
  'templates.apiChecked': tpl.apiChecked,
};

/* ------------------------------------------------------------------ the figures, as written --- */

const page = readFileSync(PAGE, 'utf8');
const block = page.slice(page.indexOf('const proof = ['), page.indexOf('];', page.indexOf('const proof = [')));
const written = [...block.matchAll(/\{\s*n:\s*'([\d,]+)'\s*,\s*what:\s*'([^']*)'\s*,\s*from:\s*'([^']+)'\s*\}/g)]
  .map((m) => ({ n: Number(m[1].replace(/,/g, '')), what: m[2], from: m[3] }));

const problems = [];

// A DEAD HARNESS IS THE FAILURE THIS SCRIPT IS MOST LIKELY TO HAVE. If the array is reformatted,
// the regex above matches nothing and every comparison below passes vacuously — a clean run over
// zero figures, indistinguishable from a clean run over three.
if (written.length === 0) {
  console.error('PROOF FIGURES UNREADABLE — the `const proof = [...]` array in\n'
    + '  apps/site/src/pages/index.astro\n'
    + 'did not parse. Every entry must be { n: \'…\', what: \'…\', from: \'…\' }. This is a broken\n'
    + 'checker, not a clean page: it has verified nothing.');
  process.exit(2);
}

for (const f of written) {
  const actual = RESOLVE[f.from];
  if (actual === undefined) {
    problems.push(`"${f.what}" points at \`${f.from}\`, which resolves to nothing. Known pointers: ${Object.keys(RESOLVE).join(', ')}`);
    continue;
  }
  if (actual !== f.n) {
    problems.push(`"${f.what}" is written as ${f.n.toLocaleString()} but \`${f.from}\` is ${actual.toLocaleString()}`);
  }
}

/* ---------------------------------------------------------------- the claims, where knowable --- */

//[[ THE CLAIM IS PART OF THE FIGURE.
//
//   A number can match its source and still be a lie about what it counts. These are the specific
//   claims this file knows how to test, each written because the page made it falsely once. ]]
for (const f of written) {
  const says = f.what.toLowerCase();

  if (/every licence|licence recorded|licensed/.test(says) && f.from === 'library.total' && lib.withoutLicence > 0) {
    problems.push(`"${f.what}" claims every row carries a licence, and ${lib.withoutLicence} do not`);
  }

  // "checked against current Roblox APIs" was attached to 3,017 while the harvest records the
  // check for 300. A claim of a check may only ride on the count that was checked.
  if (/\bapi\b|apis\b/.test(says) && f.n !== RESOLVE['templates.apiChecked']) {
    problems.push(`"${f.what}" claims an API check over ${f.n.toLocaleString()} rows; the harvest records that check for ${RESOLVE['templates.apiChecked']}`);
  }

  // The harvest is a GitHub search over Roblox-adjacent topics. It contains compilers, formatters,
  // bootstrappers and at least one Bee Swarm macro, so "game templates" is a claim about curation
  // that nothing in this repository performs.
  if (/game template/.test(says)) {
    problems.push(`"${f.what}" calls the template harvest game templates. It is a GitHub search result: `
      + `it contains tooling (rojo, StyLua, roblox-ts), engines, and macros. Nothing curates it into templates yet.`);
  }
}

if (problems.length) {
  console.error('PROOF FIGURES WRONG — the landing page states things the data does not say:\n');
  for (const p of problems) console.error(`  · ${p}`);
  console.error('\nThese are the three numbers a visitor is invited to check. Fix the page, or fix the claim.');
  process.exit(1);
}

console.log(`PROOF FIGURES OK — ${written.length} figures on the landing page each match the data they point at `
  + `(${written.map((f) => `${f.n.toLocaleString()} = ${f.from}`).join(' · ')}).`);
