// A MODE THE PRODUCT DOES NOT OFFER MUST NOT BE SOLD BY THE DOCUMENTATION.
//
// packages/shared draws the distinction and the site did not keep it:
//
//   PRODUCT_MODES          — every mode the SYSTEM can produce (plan, agent, super)
//   PRODUCT_MODES_OFFERED  — the modes a PERSON may choose  (plan, agent)
//
// `super` — "Super Agent" — is in the first list and not the second. The composer dropped it, the
// sign-in page dropped it, /pricing dropped it. The DOCS did not: /docs/modes taught it in ten
// places with a heading, a price and a rule of thumb; /docs/credits-and-limits priced it in six,
// including a surcharge; the docs index and the getting-started page sent readers to it by name. A
// person could read the manual, decide Super Agent was the mode for their job, open the product,
// and find no way to select it — which is the most expensive kind of wrong a docs page can be,
// because the reader has already made a decision by the time they discover it.
//
// WHAT THIS GUARDS, AND WHY THAT IS THE RIGHT PROPERTY. Not "the word Super Agent is gone" — the
// name is legitimate in a changelog, in a comment explaining the withdrawal, and in the type that
// still routes stored sessions. The property is narrower and survives renames: NO PAGE A READER
// RECEIVES MAY NAME A MODE THAT IS IN PRODUCT_MODES AND NOT IN PRODUCT_MODES_OFFERED. Withdraw a
// fourth mode tomorrow and this catches its copy without anybody editing this file; rename Super
// Agent and it follows the name, because the name is read out of PRODUCT_MODE_INFO.
//
// IT READS THE BUILT PAGES, like tests/counted-copy.test.mjs and for the same reason: the source
// is full of prose ABOUT the withdrawal, and a guard that cannot tell a page from the commentary
// on it is a guard that either fires on its own explanation or has had its explanation deleted to
// keep it quiet. What a reader receives has no comments in it. The built pages also carry the
// <meta description>, which is copy a reader sees in a search result and which no tag-stripping
// scan of the source would look at.
//
// IT ALSO READS THE SOURCE, because apps/site's test job in CI builds nothing (see the "Typecheck
// and tests" job in .github/workflows/ci.yml, which runs `pnpm -r test` with no site build before
// it). A guard that only has teeth on a developer's machine is half a guard. The source pass
// strips frontmatter, comments and script/style blocks first, so the reasons written into the code
// are not mistaken for copy.
//
// Run with:  node --test tests/withdrawn-modes.test.mjs     (from apps/site, after a build)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const DIST = join(SITE, 'dist');
const SRC = join(SITE, 'src');

// ---------------------------------------------------------------------------
// What the product offers, read out of packages/shared.
//
// Parsed rather than imported: `@golem/shared` is TypeScript source with no build step, and
// whether `node --test` can load it at all depends on the runtime's type-stripping — CI pins
// Node 22, this machine runs 26. apps/site/tests/workspace-limits.test.mjs already reads the
// worker's constants this way for a comparable reason. Every parse below fails LOUDLY and names
// itself as the broken thing, because a regex that quietly stops matching turns this file into a
// test that passes by finding nothing.
// ---------------------------------------------------------------------------

/**
 * Comments stripped before anything is read out of it. The block above PRODUCT_MODES in
 * packages/shared spells out the words 'plan', 'agent' and 'super' while explaining which list is
 * which; check-credit-figures.mjs learned this the hard way, matching the comment that explained
 * why a constant had been removed. A guard that reads source must read the source, not the
 * commentary on it.
 */
const stripTsComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const shared = stripTsComments(readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8'));

function modeList(constant) {
  const m = new RegExp(`export const ${constant}: readonly ProductMode\\[\\] = \\[([^\\]]*)\\]`).exec(shared);
  assert.ok(
    m,
    `THIS TEST IS BROKEN, NOT THE SITE: ${constant} is no longer declared in packages/shared/src/index.ts the way this reads it`,
  );
  const list = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.ok(list.length > 0, `${constant} parsed to an empty list — the parse is wrong, not the product`);
  return list;
}

const PRODUCT_MODES = modeList('PRODUCT_MODES');
const OFFERED = modeList('PRODUCT_MODES_OFFERED');

const infoBlock = (() => {
  const at = shared.indexOf('export const PRODUCT_MODE_INFO');
  assert.notEqual(at, -1, 'THIS TEST IS BROKEN, NOT THE SITE: PRODUCT_MODE_INFO is gone from packages/shared');
  const next = shared.indexOf('export const', at + 1);
  return shared.slice(at, next === -1 ? shared.length : next);
})();

/** The customer-facing name of a mode, which is the string a page would leak. */
function displayName(mode) {
  const m = new RegExp(`\\b${mode}:\\s*\\{[\\s\\S]*?name:\\s*'([^']+)'`).exec(infoBlock);
  assert.ok(m, `THIS TEST IS BROKEN, NOT THE SITE: PRODUCT_MODE_INFO.${mode} has no name this can read`);
  return m[1];
}

const withdrawn = PRODUCT_MODES.filter((m) => !OFFERED.includes(m)).map((m) => ({ mode: m, name: displayName(m) }));

// ---------------------------------------------------------------------------
// The one exemption, by path, with the reason written in.
//
// A changelog entry describes what happened on a date. Super Agent shipped in v0.1 at 10 credits
// and that is true of v0.1 forever; editing the entry would not remove a false claim, it would
// remove a true one and leave a record that disagrees with the release it records. History is not
// documentation, and the fix for history that has been overtaken is an annotation — which is what
// the entry now carries — not a rewrite.
//
// This is the ONLY exemption. Anything else that wants one is a page teaching a reader how to use
// the product, and the whole point of this file is that such a page may not teach a mode nobody
// can select.
// ---------------------------------------------------------------------------
const HISTORY = {
  dist: 'changelog/index.html',
  src: join('pages', 'changelog.astro'),
  why: 'a changelog records what shipped on a date; rewriting it would make the record false',
};

/** Two views of one file, because a name can hide in either. */
function haystacks(text) {
  const collapse = (s) => s.replace(/\s+/g, ' ');
  return [
    // As served: attributes included, so a <meta description> or an alt text cannot slip past.
    collapse(text),
    // Tags gone: so `<strong>Super</strong> Agent` reads as the two words a person sees.
    collapse(text.replace(/<[^>]+>/g, ' ')),
  ];
}

function namesFound(text) {
  const hay = haystacks(text);
  return withdrawn.filter(({ name }) => {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return hay.some((h) => re.test(h));
  });
}

function walk(dir, keep) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath ?? entry.path, entry.name);
    if (keep(entry.name)) out.push(full);
  }
  return out;
}

test('THERE IS A WITHDRAWN MODE TO LOOK FOR', () => {
  // The blind check. If PRODUCT_MODES and PRODUCT_MODES_OFFERED are ever the same list, every
  // assertion below passes by having nothing to search for, and this file would report clean
  // forever while guarding nothing. Loud, with the two ways out named.
  assert.ok(
    withdrawn.length > 0,
    'PRODUCT_MODES and PRODUCT_MODES_OFFERED name the same modes, so this test has nothing to look for. ' +
      'If every mode is now offered, delete this file deliberately; if it is not, this test can no longer read packages/shared.',
  );
});

test('NO BUILT PAGE NAMES A MODE THE PRODUCT DOES NOT OFFER', () => {
  if (!existsSync(DIST)) {
    // Not a pass. The built pages are what a reader receives, and a green tick on a missing build
    // is the exact shape of failure this file exists to prevent.
    assert.fail('apps/site/dist is missing — run `npx astro build` in apps/site first');
  }
  const pages = walk(DIST, (n) => n.endsWith('.html') || n === 'docs-index.json');
  assert.ok(pages.length > 0, 'apps/site/dist holds no pages — the build did not produce what this reads');

  // POSITIVE CONTROL. The changelog is the one page we know names a withdrawn mode, so it proves
  // the scanner can actually see text. Without it, a broken reader — wrong directory, a stripper
  // that swallows the body — would report every page clean and this test would be decorative.
  const history = pages.find((p) => relative(DIST, p).split(sep).join('/') === HISTORY.dist);
  assert.ok(history, `${HISTORY.dist} is not in the build — this test cannot prove it can see`);
  assert.ok(
    namesFound(readFileSync(history, 'utf8')).length > 0,
    `${HISTORY.dist} names no withdrawn mode, so this scanner has proved nothing about the pages it just called clean. ` +
      'If the changelog legitimately stopped mentioning one, give this control another page that does.',
  );

  const leaks = [];
  for (const file of pages) {
    const rel = relative(DIST, file).split(sep).join('/');
    if (rel === HISTORY.dist) continue; // exempt, and HISTORY.why says why
    for (const { mode, name } of namesFound(readFileSync(file, 'utf8'))) {
      leaks.push(`dist/${rel} names "${name}" (${mode}), which is in PRODUCT_MODES and not in PRODUCT_MODES_OFFERED`);
    }
  }
  assert.deepEqual(
    leaks,
    [],
    `a built page sells a mode nobody can choose:\n  ${leaks.join('\n  ')}\n` +
      'Derive the copy from PRODUCT_MODES_OFFERED, as /pricing and /docs/modes do, or remove it.',
  );
});

test('and neither does any page source, comments and code excluded', () => {
  // The same property one step earlier, so the check still has teeth in a checkout with no build.
  // Frontmatter, comments and <script>/<style> blocks come out first: this file, modes.astro,
  // credits-and-limits.astro and CreditMeter.astro all EXPLAIN the withdrawal at length, and a
  // guard that fired on its own reasons would be silenced by deleting them.
  const pages = walk(SRC, (n) => n.endsWith('.astro'));
  assert.ok(pages.length > 0, 'found no .astro pages under apps/site/src — this test is looking in the wrong place');

  const leaks = [];
  for (const file of pages) {
    const rel = relative(SRC, file);
    if (rel === HISTORY.src) continue; // exempt, and HISTORY.why says why
    const copy = readFileSync(file, 'utf8')
      .replace(/^---[\s\S]*?\n---\n/, ' ')
      //[[ 2026-09-21: Astro has TWO comment forms and this stripped one of them. `{/* … */}` is the
      //   form used inside a template — it is what modes.astro, this page's main subject, writes its
      //   explanations in — and it was reaching the scanner as visible copy. The failure message
      //   below has always promised "this reads neither comments nor frontmatter"; for the commoner
      //   of the two comment forms that promise was false, and the first comment to explain the
      //   withdrawal inside one was reported as a page naming a withdrawn mode to a customer.
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ');
    for (const { mode, name } of namesFound(copy)) {
      leaks.push(`src/${rel.split(sep).join('/')} names "${name}" (${mode}) in visible copy`);
    }
  }
  assert.deepEqual(
    leaks,
    [],
    `page copy names a mode nobody can choose:\n  ${leaks.join('\n  ')}\n` +
      'A comment explaining the withdrawal is fine — this reads neither comments nor frontmatter. Rendered copy is not.',
  );
});
