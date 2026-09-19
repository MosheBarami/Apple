/**
 * NO PAGE MAY PROMISE A WARNING BEFORE AN EXPENSIVE RUN STARTS.
 *
 * Two live pages did. /pricing answered "Can one request cost more than the price in the table?"
 * with "...a request never silently drains your day — Apple warns before starting work it estimates
 * will be expensive", and /docs/credits-and-limits said "If Apple estimates a run will be unusually
 * expensive, it says so before starting instead of silently draining your day."
 *
 * Neither had anything behind it. A run is admitted on a one-Credit spend whose only refusal is a
 * zero balance; the rest is settled from measured compute AFTER each model call. There is no
 * cost-warning message in the wire protocol, no cost field on the run intent, and no credit copy in
 * the composer at all. The one estimate in the product reserves budget inside the gateway for the
 * owner's bill and is never shown to anybody.
 *
 * WHY THAT IS WORSE THAN A MISSING FEATURE. It is a safety guarantee, and a reader acts on it: a
 * free account with 6 Credits left sends one more Agent build because the page said they would be
 * warned first, and the run is admitted, bills measured usage until the balance is gone, and stops
 * mid-build. They lost the day's allowance to a sentence.
 *
 * THE PROPERTY IS THE PROMISE, NOT THE WORDING. A warning that fires before work starts needs a
 * mechanism, and the shapes below are the ways English says it. Building the estimator is the
 * larger fix and remains open; until it exists, the sentence may not.
 *
 * IT ALSO ASSERTS ITS OWN PREMISE. If a confirmation path is ever built, the worker's statement
 * that it has none goes away and this file fails, naming itself — so the guard cannot outlive the
 * gap it describes and quietly forbid a sentence that has become true.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleText } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..', '..');

/** Every page a reader can land on, by path, so a new page is covered the day it is written. */
function pages() {
  const dir = join(SITE, 'src', 'pages');
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.astro'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

/**
 * The shapes a pre-start cost warning takes in English.
 *
 * Deliberately not anchored on "expensive": the sentence could return as "before a big build Apple
 * checks with you" and be the same unkept guarantee. Each entry names what it is looking for so a
 * failure reads as an instruction rather than a regex.
 */
const PROMISES = [
  { id: 'warns-before-starting', re: /\b(warns?|tells?|asks?|checks?)\b[^.]{0,60}\bbefore\s+(it\s+)?start(s|ing)?\b/i },
  { id: 'says-so-before-starting', re: /\bsays?\s+so\b[^.]{0,40}\bbefore\s+start/i },
  { id: 'estimates-expensive', re: /\bestimat\w+\b[^.]{0,60}\b(expensive|costly|cost a lot)\b/i },
  { id: 'unusually-expensive', re: /\bunusually\s+expensive\b/i },
  { id: 'never-silently-drains', re: /\bsilently\s+drain\w*\b/i },
];

function scan(named) {
  const found = [];
  for (const [name, text] of named) {
    const hay = visibleText(text);
    for (const { id, re } of PROMISES) {
      const hit = re.exec(hay);
      if (hit) found.push(`${name}: [${id}] "${hit[0].trim()}"`);
    }
  }
  return found;
}

test('THE PREMISE IS STILL TRUE: the worker has no way to interrupt a run and ask', () => {
  // Read from the worker's own words rather than from an absence-grep. applyToolPermissions
  // downgrades the `ask` permission to `deny` and says why, and that sentence is the single
  // clearest statement in the tree that no confirmation path exists. When somebody builds one,
  // this line changes and this test fails FIRST — pointing at the guard, not at the pages.
  const prefs = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'preferences.ts'), 'utf8');
  assert.match(
    prefs,
    /nothing in this product can interrupt a run to ask/,
    'THIS GUARD IS STALE, NOT THE PAGES: apps/worker/src/preferences.ts no longer states that a run ' +
      'cannot be interrupted to ask. If a confirmation or pre-run estimate path now exists, re-read ' +
      'this file and decide what the pages may say — do not delete it to get quiet.',
  );

  // The admission path, asserted rather than assumed: one Credit, refused only on an empty balance.
  const session = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8');
  assert.match(
    session,
    /quotaSpend\(bind\.ownerId,\s*1,/,
    'THIS GUARD IS STALE, NOT THE PAGES: a run is no longer admitted on a flat one-Credit spend in ' +
      'apps/worker/src/do/session.ts. Whatever replaced it may or may not warn first — go and look.',
  );
});

test('no page promises a warning before an expensive run starts', () => {
  const named = pages().map((p) => [p.slice(SITE.length + 1), readFileSync(p, 'utf8')]);
  assert.ok(named.length > 0, 'found no .astro pages — this guard is looking in the wrong place');

  const found = scan(named);
  assert.deepEqual(
    found,
    [],
    `a page promises a pre-run cost warning that nothing implements:\n  ${found.join('\n  ')}\n` +
      'Either build the estimator — a cost-warning message in ServerMsg, checked before the ' +
      'one-Credit admission — or say what the product does instead: it stops when the Credits run ' +
      'out and saves what it finished.',
  );
});

test('the guard has teeth: it fails on the two sentences that shipped', () => {
  // Both live sentences, verbatim from the deployed pages, fed back in. A guard nobody has watched
  // fail is a guard nobody knows the shape of.
  const shipped = [
    [
      'pricing.astro (as deployed 2026-09-19)',
      '<p>You see the running total live in the workspace, and a request never silently drains your ' +
        'day — Apple warns before starting work it estimates will be expensive.</p>',
    ],
    [
      'credits-and-limits.astro (as deployed 2026-09-19)',
      '<p>If Apple estimates a run will be unusually expensive, it says so before starting instead ' +
        'of silently draining your day.</p>',
    ],
  ];
  for (const [name, text] of shipped) {
    assert.ok(scan([[name, text]]).length > 0, `${name} slipped past every pattern — re-aim them`);
  }

  // And it does not fire on the replacement copy, which describes the behaviour that is real.
  const replacement =
    '<p>You see the running total live in the workspace while it climbs, and if a run reaches the ' +
    'end of your Credits it stops there and says so — everything it finished by then is saved.</p>';
  assert.deepEqual(scan([['replacement', replacement]]), []);
});
