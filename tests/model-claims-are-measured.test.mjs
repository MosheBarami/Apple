/**
 * THE SENTENCE THE OWNER MOST WANTS TO WRITE IS THE ONE NOTHING WAS STOPPING.
 *
 * The work queue's own words: *"the apple and apple max also have something you are ... 100%
 * confident about calling in the final turn of this big night 'the world's most trained and skilled
 * roblox ai model'"*, and the disposition on that row is **do not write the claim anywhere
 * user-facing** until an unseen-set number supports it.
 *
 * That disposition lived in a document. Documents do not fail builds. `docs/frontier-for-roblox.md`
 * §8.7 and §9.6 both say "nothing user-facing carries such a claim today" — which was TRUE when each
 * was written and is a fact about a moment, not a property of the repository. One marketing edit
 * makes it false and nothing anywhere says so.
 *
 * WHAT THE NUMBERS ACTUALLY ARE, so the failure message can name them rather than gesture:
 * **91.3%** on the eighty game-logic requests where the verified-module library holds the answer,
 * and **87.5%** on the sixteen engine-facing tasks where it does not (`docs/frontier-for-roblox.md`
 * §9.5). A customer's request does not know which set it is in, so the second one is the number any
 * superlative would have to be written against — and 87.5% of sixteen items is not a claim to
 * frontier, it is a good score on a small suite.
 *
 * THIS IS NOT A COPY RULE. It is the rule that a claim about TRAINING must be backed by a
 * measurement of training, and nothing in this repository has one: every model both lanes serve is
 * a third-party foundation model, and `docs/model-serving-reality.md` records the vendor refusing —
 * error 5005 — to apply this account's own adapters to it. A superlative about training would not be
 * an exaggeration; it would be about something that did not happen.
 *
 * WHAT IS DELIBERATELY NOT MATCHED. The word "trained", the word "frontier", the word "training".
 * The honest sentences use all three: the `/docs/modes` page says "neither is a model we trained"
 * and "a completed independently trained frontier model is not available". A guard that fires on
 * those would be deleted within a day, and rightly. Only superlatives that cannot appear in a
 * disclaimer are listed.
 *
 * Run with:  node --test tests/model-claims-are-measured.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

//[[ THE SURFACES A PERSON READS. `docs/` is NOT among them on purpose: the analysis that decided
//   this is allowed to quote the sentence it is refusing, and §9.6 of frontier-for-roblox.md does.
const SURFACES = ['apps/site/src', 'apps/web/src', 'apps/worker/src', 'packages/shared/src'];

/**
 * Superlatives that cannot occur inside an honest disclaimer about this product.
 * Each entry is [pattern, what it would be claiming].
 */
const CLAIMS = [
  [/\bmost[-\s]trained\b/i, 'that this model was trained more than others'],
  [/\bbest[-\s]trained\b/i, 'that this model was trained better than others'],
  [/\bmost[-\s]skilled\b/i, 'a superlative about capability'],
  [/\bworld'?s\s+most\b/i, 'a superlative about the whole world'],
  [/\b(best|finest|leading|top)\s+roblox\s+(ai\s+)?model\b/i, 'that this is the best Roblox model'],
  [/\bwe\s+trained\s+(it|this|the\s+model)\b/i, 'that training happened here'],
  [/\bour\s+own\s+(trained|fine-?tuned)\s+model\b/i, 'that a model here was trained or fine-tuned'],
];

/** Every claim found in one blob of text, with the line it is on. */
export function findClaims(text) {
  const out = [];
  for (const [i, line] of String(text).split('\n').entries()) {
    for (const [pattern, meaning] of CLAIMS) {
      if (pattern.test(line)) out.push({ line: i + 1, meaning, text: line.trim().slice(0, 120) });
    }
  }
  return out;
}

test('the matcher catches the sentence the work queue quoted, and leaves the honest ones alone', () => {
  // The owner's own words, and the near variants a marketing pass would reach for.
  for (const claim of [
    "the world's most trained and skilled roblox ai model",
    'The best-trained Roblox model available anywhere.',
    'Apple MAX is the most trained Roblox AI.',
    'the best Roblox model, by a distance',
    'we trained it on millions of Luau files',
  ]) {
    assert.equal(findClaims(claim).length > 0, true, `not caught: ${claim}`);
  }
  // The sentences that are on the site today, and must stay allowed.
  for (const honest of [
    'They currently run on the same third-party foundation model — neither is a model we trained.',
    'Custom Roblox training is in development; a completed independently trained frontier model is not available.',
    'Apple and Apple MAX are separate product choices with different access and working limits.',
    'trained on the Creator Store corpus is not a claim we make',
  ]) {
    assert.deepEqual(findClaims(honest), [], `false positive on: ${honest}`);
  }
});

test('no user-facing surface claims the model was trained here or is the most-trained', () => {
  const files = execFileSync('git', ['-C', REPO, 'ls-files', '--', ...SURFACES], { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n').filter(Boolean)
    .filter((f) => /\.(astro|tsx?|jsx?|mjs|md|html|json)$/.test(f));

  //[[ THE INSTRUMENT BEFORE THE FINDING. An empty file list, or a scan that cannot see the text it
  //   is scanning, would report zero claims and read exactly like a clean repository. So the scan is
  //   asserted to have found the surfaces AND to be able to see a phrase that is demonstrably there.
  assert.ok(files.length > 200, `only ${files.length} user-facing files were scanned; the scan is broken`);
  let controlHits = 0;
  const findings = [];
  for (const f of files) {
    let text;
    try { text = readFileSync(join(REPO, f), 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;
    if (/foundation model/i.test(text)) controlHits += 1;
    for (const hit of findClaims(text)) findings.push(`${f}:${hit.line} — claims ${hit.meaning}\n      ${hit.text}`);
  }
  assert.ok(controlHits > 0,
    'the control phrase "foundation model" was not found in any scanned file. It is on /docs/modes, so '
    + 'this scan is not reading what it thinks it is reading and a clean result would mean nothing.');

  assert.deepEqual(findings, [],
    'A user-facing surface makes a claim about TRAINING that no measurement in this repository '
    + 'supports.\n\n'
    + `${findings.join('\n')}\n\n`
    + 'Every model both lanes serve is a third-party foundation model, and docs/model-serving-reality.md '
    + 'records the vendor refusing (error 5005) to apply this account\'s own adapters to it. The numbers '
    + 'that DO exist are 91.3% where the verified-module library holds the answer and 87.5% where it does '
    + 'not (docs/frontier-for-roblox.md §9.5); a customer\'s request does not know which set it is in, so '
    + 'the second is the one a superlative would have to be written against. Rewrite the sentence, or '
    + 'produce the measurement first.');
});
