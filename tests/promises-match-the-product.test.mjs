/**
 * TWO THINGS THE PRODUCT PUBLISHED THAT IT DID NOT HAVE.
 *
 * Both were found by an adversarial sweep on 2026-09-20 and both were removed by the owner's
 * decision. They are pinned here because neither was noticed for months, and the way each came back
 * would be a one-line edit by somebody who did not know the history.
 *
 * 1. "Priority during busy periods" was the third reason to pay $12/month on the Builder card, on
 *    the live pricing page and in the signed-in app. The product's own documentation says the
 *    opposite two clicks away: no plan buys a place in the queue. Paying changes your allowance,
 *    not your turn.
 *
 * 2. The account settings offered a switch to "Contribute anonymised snippets to improve StudPilot",
 *    while both published privacy pages promised StudPilot never trains on a customer's work — the
 *    policy stated outright that no opt-in programme exists. A careful reader could not reconcile
 *    them, and whichever they believed, one of the two was lying to them.
 *
 *    The owner removed the switch (2026-09-20) and the pages' promise stood. On 2026-10-05 the owner decided the other half
 *    (planning/STUDPILOT-FINAL-PLAN.md section 7): StudPilot may collect ANONYMISED improvement data, as an OPT-OUT, never
 *    including data from Roblox, an Open Cloud key, credentials or payment details, and Roblox data is never used for AI training
 *    at all (Roblox Third-Party App Policy). Collection is NOT active. So the blanket promise is gone from the pages, and what must
 *    hold instead is the THREE-WAY LOCK below: the published rule, the Settings control and the gate in the training pipeline say
 *    one thing, and none of the three can move without the other two (the test fails on whichever moved).
 *
 * The rule these share: a sentence a customer can act on is a promise, and a promise with no
 * mechanism behind it is the defect — not the missing feature.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const SOURCES = [
  ...walk(join(ROOT, 'apps/site/src'), ['.astro', '.ts', '.tsx']),
  ...walk(join(ROOT, 'apps/web/src'), ['.ts', '.tsx']),
  ...walk(join(ROOT, 'packages/shared/src'), ['.ts']),
];

/** Strip comments, so a rule EXPLAINING the ban does not trip the rule. */
function code(file) {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/**
 * A RETRACTED CLAIM IS NOT A LIVE ONE, and this guard has to know the difference.
 *
 * The first version of this test flagged changelog.astro, which announces the withdrawn Pro tier
 * with "priority queue" in it — directly above a visible `release__since` note reading "Since
 * withdrawn: there is no Pro tier." That page is doing the right thing: it records what was
 * announced and corrects it in the open, which is more honest than quietly rewriting history.
 *
 * A guard wide enough to flag that is a guard somebody switches off. So the rule is: the claim may
 * appear where it is RETRACTED in the same breath, and nowhere else.
 */
const PRIORITY = /priority\s+(during|in)\s+busy|\bqueue\s+priority\b|\bpriority\s+queue\b/i;

test('no plan advertises queue priority, unless the same entry retracts it', () => {
  const offenders = [];
  for (const f of SOURCES) {
    const body = code(f);
    if (!PRIORITY.test(body)) continue;
    // Check each list item / block that carries the phrase for an accompanying correction.
    const blocks = body.split(/<\/li>|<\/p>|\n\n/);
    for (const block of blocks) {
      if (PRIORITY.test(block) && !/release__since|Since withdrawn|no longer|withdrawn/i.test(block)) {
        offenders.push(f.slice(ROOT.length + 1));
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], `queue priority is advertised without a retraction in: ${offenders.join(', ')}`);
});

test('the app offers no training opt-IN: the only control is an opt-OUT from improvement data', () => {
  const offenders = [];
  for (const f of SOURCES) {
    const body = code(f);
    // The control, not the word: a page may DESCRIBE the rule. What must not exist is a switch that opts somebody IN to training.
    if (/name=["']trainingOptIn["']/.test(body) || /id=["']training-opt-in["']/.test(body)) {
      offenders.push(f.slice(ROOT.length + 1));
    }
  }
  assert.deepEqual(offenders, [], `a training opt-in control is back in: ${offenders.join(', ')}`);
});

// -------------------------------------------------------------------------- the three-way lock ---

const norm = (src) =>
  src
    .replace(/^---[\s\S]*?\n---/, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const PRIVACY = norm(readFileSync(join(ROOT, 'apps/site/src/pages/privacy.astro'), 'utf8'));
const DOCS = norm(readFileSync(join(ROOT, 'apps/site/src/pages/docs/privacy-and-data.astro'), 'utf8'));
const SETTINGS_SRC = readFileSync(join(ROOT, 'apps/web/src/routes/settings.tsx'), 'utf8');
const ROW = SETTINGS_SRC.slice(SETTINGS_SRC.indexOf('<Row id="improvement-opt-out"'), SETTINGS_SRC.indexOf('</Row>', SETTINGS_SRC.indexOf('<Row id="improvement-opt-out"')));
const WORKER_PREFS = readFileSync(join(ROOT, 'apps/worker/src/preferences.ts'), 'utf8');
const GATE = readFileSync(join(ROOT, 'packages/training/src/consent-staging.mjs'), 'utf8');

const RULE = 'never includes data from Roblox, an Open Cloud key, credentials or payment details';
const NOT_ACTIVE = 'Collection is not active yet';

test('LOCK 1 of 3, the published rule: both privacy pages state the improvement-data rule, and that Roblox data is never used for AI training', () => {
  for (const [where, text] of [['privacy.astro', PRIVACY], ['docs/privacy-and-data.astro', DOCS]]) {
    assert.ok(text.includes(RULE), `${where} does not state the rule: "${RULE}"`);
    assert.match(text, /anonymised/, `${where} does not say improvement data is anonymised`);
    assert.match(text, /opt-out/, `${where} does not say it is opt-out`);
    assert.match(text, /Roblox data is never used for AI training/, `${where} does not say Roblox data is never used for AI training`);
  }
});

test('LOCK 2 of 3, the Settings control: an opt-OUT switch in Settings > Privacy, written through the preferences layer the worker accepts, saying the same rule', () => {
  assert.ok(ROW.length > 200, 'the improvement-data row is not in settings.tsx');
  assert.match(ROW, /<Switch[\s\S]*?name="improvementOptOut"/, 'the control is not a switch named improvementOptOut');
  assert.match(SETTINGS_SRC, /savePreferences\('user', userId, \{ \.\.\.base, improvement_opt_out: optOut \}\)/, 'the switch does not write improvement_opt_out at user scope');
  assert.match(WORKER_PREFS, /'improvement_opt_out',\n\] as const;/, 'the worker would refuse the key the switch writes');
  assert.ok(norm(ROW).includes(RULE), 'the Settings row does not say what the published pages say');
  assert.ok(norm(ROW).includes(NOT_ACTIVE), 'the Settings row does not say collection is not active');
});

test('LOCK 3 of 3, the gate: the training pipeline refuses customer work, and the surfaces say "not active" exactly while it does', () => {
  const closed = /export const CUSTOMER_WORK_TRAINING_ENABLED = false;/.test(GATE);
  const open = /export const CUSTOMER_WORK_TRAINING_ENABLED = true;/.test(GATE);
  assert.ok(closed !== open, 'could not read the gate out of packages/training/src/consent-staging.mjs');
  // THE THREE MOVE TOGETHER. With the gate closed every surface must say collection is not active; with it open none may.
  // Opening the gate alone, or deleting the sentence alone, fails here. Turning collection on is a product decision that changes
  // the pages, the Settings row (its copy and the email to account holders) and this constant in one change.
  for (const [where, text] of [['privacy.astro', PRIVACY], ['docs/privacy-and-data.astro', DOCS], ['the Settings row', norm(ROW)]]) {
    assert.equal(text.includes(NOT_ACTIVE), closed,
      closed
        ? `${where} does not say "${NOT_ACTIVE}" while the gate is closed`
        : `${where} still says "${NOT_ACTIVE}" while the gate is OPEN: collection is on, and the email to every account holder and the policy update are owed first`);
  }
  assert.equal(closed, true, 'the pipeline may process customer work: the published rule says collection is not active');
});
