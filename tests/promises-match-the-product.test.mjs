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
  // The property, not the spelling: user scope, on top of the LOADED preferences (preferencesToSave refuses a blank base), carrying the key.
  assert.match(SETTINGS_SRC, /savePreferences\('user', userId, preferencesToSave\(storedPrefs\.data, \{ improvement_opt_out: optOut \}\)\)/, 'the switch does not write improvement_opt_out at user scope');
  // Read OUT of the array with its comments stripped: it holds wherever in the list the key sits, and not once it is gone.
  const declared = /PREFERENCE_KEYS = \[([\s\S]*?)\n\] as const/.exec(WORKER_PREFS)?.[1].replace(/\/\/.*$/gm, '').match(/'[a-z_]+'/g) ?? [];
  assert.ok(declared.length > 5, 'could not read PREFERENCE_KEYS out of the worker: this test would check nothing');
  assert.ok(declared.includes("'improvement_opt_out'"), 'the worker would refuse the key the switch writes');
  assert.ok(norm(ROW).includes(RULE), 'the Settings row does not say what the published pages say');
  // "Collection is not active yet" is held by LOCK 3, as an equivalence with the gate: asserted here too it would forbid ever opening the gate.
});

/**
 * WHAT MUST EXIST BEFORE THE GATE MAY BE TRUE.
 *
 * The pages promise two things about the day collection starts, and neither has a mechanism today:
 *
 *   1. THE OPT-OUT IS HONOURED. `improvement_opt_out` is stored (preferences.ts) and nothing reads it. The only consent reader in
 *      the training pipeline accepts proof from `profiles.training_opt_in`, an opt-IN column the switch never writes, so opening
 *      the gate with the pipeline as it stands would stage the work of people who opted out. The gate source must READ the
 *      preference (comments do not count).
 *   2. EVERY ACCOUNT HOLDER IS TOLD FIRST, including an account that signs in only with Roblox, which has no email address
 *      (its address is a placeholder nothing can deliver to). The pages say "in the app" for those accounts, and no in-app
 *      notice exists. The evidence this test looks for is a notification kind named `policy_notice` in the worker's
 *      NOTIFICATION_KINDS: the inbox is the one in-app channel that reaches every account. If the notice is built some other
 *      way, re-aim THIS check in the same change that builds it; do not delete it (planning/proof/M2/LEGAL-CLAIMS.md, section 5).
 *
 * So the gate cannot be flipped alone: opening it needs both pieces of evidence AND every surface to stop saying "not active".
 */
const NOTICE_KIND = 'policy_notice';
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** What is missing before the gate may be open: [] means nothing is. Pure, so the cases below can be fed by hand. */
export function gateEvidenceMissing({ gateSrc, notificationsSrc }) {
  const missing = [];
  if (!/\bimprovement_opt_out\b|\bimprovementOptOut\b/.test(stripComments(gateSrc))) {
    missing.push('the training gate does not read improvement_opt_out (the only consent proof it accepts is profiles.training_opt_in, an opt-in column the Settings switch never writes)');
  }
  const kinds = /NOTIFICATION_KINDS = \[([\s\S]*?)\] as const/.exec(stripComments(notificationsSrc))?.[1] ?? '';
  if (!new RegExp(`'${NOTICE_KIND}'`).test(kinds)) {
    missing.push(`no in-app notice exists: the worker's NOTIFICATION_KINDS has no '${NOTICE_KIND}', and an account that signs in only with Roblox has no email address to be told at`);
  }
  return missing;
}

const NOTIFICATIONS_SRC = readFileSync(join(ROOT, 'apps/worker/src/notifications.ts'), 'utf8');

test('LOCK 3 of 3, the gate: the training pipeline refuses customer work, and the surfaces say "not active" exactly while it does', () => {
  const closed = /export const CUSTOMER_WORK_TRAINING_ENABLED = false;/.test(GATE);
  const open = /export const CUSTOMER_WORK_TRAINING_ENABLED = true;/.test(GATE);
  assert.ok(closed !== open, 'could not read the gate out of packages/training/src/consent-staging.mjs');
  // THE THREE MOVE TOGETHER. With the gate closed every surface must say collection is not active; with it open none may.
  // Opening the gate alone, or deleting the sentence alone, fails here. Turning collection on is a product decision that changes
  // the pages, the Settings row (its copy and the notice to account holders) and this constant in one change.
  for (const [where, text] of [['privacy.astro', PRIVACY], ['docs/privacy-and-data.astro', DOCS], ['the Settings row', norm(ROW)]]) {
    assert.equal(text.includes(NOT_ACTIVE), closed,
      closed
        ? `${where} does not say "${NOT_ACTIVE}" while the gate is closed`
        : `${where} still says "${NOT_ACTIVE}" while the gate is OPEN: collection is on, and the notice to every account holder and the policy update are owed first`);
  }
  // AND THE GATE MAY BE OPEN ONLY WITH THE TWO THINGS THE PAGES PROMISE (see above). Closed, nothing is demanded.
  if (open) {
    const missing = gateEvidenceMissing({ gateSrc: GATE, notificationsSrc: NOTIFICATIONS_SRC });
    assert.deepEqual(missing, [], `the gate is open and the pages' promises have no mechanism:\n  - ${missing.join('\n  - ')}`);
  }
});

test('the gate evidence check can fail: opened alone, with only the opt-out read, with only the notice, and with the read in a comment, it refuses', () => {
  const GATE_WITHOUT = 'export const CUSTOMER_WORK_TRAINING_ENABLED = true;\n// reads improvement_opt_out one day\nif (proof.source !== "profiles.training_opt_in") fail();';
  const GATE_WITH = 'export const CUSTOMER_WORK_TRAINING_ENABLED = true;\nif (profile.improvement_opt_out === true) skip();';
  const KINDS_WITHOUT = "export const NOTIFICATION_KINDS = [\n  'run_complete',\n  'security_event',\n] as const;";
  const KINDS_WITH = "export const NOTIFICATION_KINDS = [\n  'run_complete',\n  'policy_notice',\n] as const;";
  const asks = (g, n) => gateEvidenceMissing({ gateSrc: g, notificationsSrc: n });
  assert.equal(asks(GATE_WITHOUT, KINDS_WITHOUT).length, 2, 'opened alone, both pieces of evidence are missing');
  assert.equal(asks(GATE_WITH, KINDS_WITHOUT).length, 1, 'the opt-out is read but nobody can be told');
  assert.match(asks(GATE_WITH, KINDS_WITHOUT)[0], /no in-app notice/);
  assert.equal(asks(GATE_WITHOUT, KINDS_WITH).length, 1, 'the notice exists but the gate ignores the opt-out (a mention in a comment is not a read)');
  assert.match(asks(GATE_WITHOUT, KINDS_WITH)[0], /does not read improvement_opt_out/);
  assert.deepEqual(asks(GATE_WITH, KINDS_WITH), [], 'with both, the gate may be open');
  // The check is reading the real sources (LOCK 3 above runs it on them whenever the gate is open).
  assert.ok(GATE.length > 500 && NOTIFICATIONS_SRC.includes('NOTIFICATION_KINDS'), 'the real sources were not read: this test would check nothing');
});
