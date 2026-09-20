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
 * 2. The account settings offered a switch to "Contribute anonymised snippets to improve Apple",
 *    while both published privacy pages promise Apple never trains on a customer's work — the
 *    policy states outright that no opt-in programme exists. A careful reader could not reconcile
 *    them, and whichever they believed, one of the two was lying to them.
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

test('the app offers no training opt-in, because the privacy policy promises there is none', () => {
  const offenders = [];
  for (const f of SOURCES) {
    const body = code(f);
    // The control, not the word: a page may DESCRIBE the promise. What must not exist is a switch.
    if (/name=["']trainingOptIn["']/.test(body) || /id=["']training-opt-in["']/.test(body)) {
      offenders.push(f.slice(ROOT.length + 1));
    }
  }
  assert.deepEqual(offenders, [], `a training opt-in control is back in: ${offenders.join(', ')}`);
});

test('the promise itself is still published — removing the switch must not remove the commitment', () => {
  // The opposite failure: someone deletes the privacy copy along with the control, and the product
  // quietly stops promising anything at all.
  const privacy = SOURCES.filter((f) => /privacy/i.test(f));
  assert.ok(privacy.length > 0, 'no privacy page found at all');
  const text = privacy.map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.match(text, /train/i, 'the privacy pages no longer say anything about training');
});
