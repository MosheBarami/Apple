/**
 * THE REASON WRITTEN BESIDE A SPEND CEILING MUST POINT THE SAME WAY AS THE PRICE TABLE ABOVE IT.
 *
 * pricing.ts calls itself the single source of truth for what inference costs, and the comment on
 * BILLABLE_NEURONS_PER_DAY is where the next person deciding whether these caps can absorb another
 * paying customer starts. For a day it told them the opposite of the truth: it justified the
 * unchanged ceiling with "GLM is cheaper per token than the model it replaced ($0.35/$0.75), so the
 * same ceiling now buys materially more work", 55 lines below the row that says the same migration
 * was +41%. Nothing executed, so nothing failed — a prose rationale has no caller to break.
 *
 * WHY THIS IS NOT A SPELLING TEST. The forbidden claim is not forbidden because someone dislikes
 * it; it is forbidden ONLY while MODEL_PRICES says it is false, and that condition is computed
 * here from the table rather than assumed. Put glm-5.3-flash back below glm-4.7-flash on both
 * rates and these assertions stop applying on their own — which is the behaviour you want, because
 * on that day the sentence would be true again.
 *
 * The prices themselves are verified against Cloudflare and are not this file's business. It
 * checks the DIRECTION the comment claims, nothing else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BILLABLE_NEURONS_PER_DAY, MODEL_PRICES, neuronsFor } from '../src/pricing.ts';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'pricing.ts'), 'utf8');

/** The model Apple MAX runs on today, and the one it moved off on 2026-09-19. */
const MAX_TODAY = '@cf/zai-org/glm-5.3-flash';
const MAX_BEFORE = '@cf/zai-org/glm-4.7-flash';

/** The doc comment attached to BILLABLE_NEURONS_PER_DAY, and nothing else in the file. */
function capRationale() {
  const decl = SOURCE.indexOf('export const BILLABLE_NEURONS_PER_DAY');
  assert.ok(decl > 0, 'BILLABLE_NEURONS_PER_DAY is no longer declared here');
  const open = SOURCE.lastIndexOf('/**', decl);
  assert.ok(open > 0 && open < decl, 'the ceiling lost its doc comment entirely');
  return SOURCE.slice(open, decl);
}

test('the slice is the rationale, so nothing below passes vacuously', () => {
  const text = capRationale();
  assert.ok(text.length > 300, `sliced only ${text.length} chars of comment`);
  //[[ RE-AIMED 2026-09-20. THIS LINE USED TO REQUIRE THE LITERAL PHRASE "DELIBERATELY UNCHANGED".
  //
  //   That was a fair anchor for as long as the ceiling sat at 15,000: the rationale's whole
  //   subject was why it had NOT moved. On 2026-09-20 it moved, to 90,000, because the product was
  //   refusing every build at $0.165 a day. The phrase then described a reversed decision, and the
  //   guard required it to survive: deleting the now-false paragraph — the correct cleanup — would
  //   have turned this red, and keeping it means the file opens its explanation of a raised cap
  //   with the words "deliberately unchanged".
  //
  //   The history is not deleted; the aim moved. What a rationale must do is account for the value
  //   the file actually exports, so that is what is asserted, read FROM the constant rather than
  //   restated. It re-aims itself on the next change. ]]
  const ceiling = BILLABLE_NEURONS_PER_DAY;
  const spellings = [ceiling.toLocaleString('en-US'), String(ceiling), String(ceiling).replace(/\B(?=(\d{3})+$)/g, '_')];
  assert.ok(
    spellings.some((n) => text.includes(n)),
    `the rationale never names the ceiling it explains (${spellings.join(' / ')})`,
  );
});

test('the migration this ceiling survived really did make the paid lane dearer', () => {
  // Stated as arithmetic rather than trusted, because everything below is conditional on it.
  const before = MODEL_PRICES[MAX_BEFORE];
  const after = MODEL_PRICES[MAX_TODAY];
  assert.ok(before && after, 'both MAX lane models must still be priced here');
  assert.ok(after.usdPerMInput > before.usdPerMInput, 'input got dearer');
  assert.ok(after.usdPerMOutput > before.usdPerMOutput, 'output got dearer');
  // The reservation path, which is the one the day ceiling gates: no cached tokens, by design.
  const reservedNow = neuronsFor(MAX_TODAY, 1_000_000, 1_000_000);
  const reservedBefore = neuronsFor(MAX_BEFORE, 1_000_000, 1_000_000);
  assert.equal(reservedBefore, 41_864);
  assert.equal(reservedNow, 59_091);
  assert.ok(reservedNow > reservedBefore, 'so an unchanged ceiling buys FEWER reserved steps');
});

test('THE CEILING IS NOT JUSTIFIED BY A SAVING THAT DID NOT HAPPEN', () => {
  const dearer = MODEL_PRICES[MAX_TODAY].usdPerMInput > MODEL_PRICES[MAX_BEFORE].usdPerMInput
    && MODEL_PRICES[MAX_TODAY].usdPerMOutput > MODEL_PRICES[MAX_BEFORE].usdPerMOutput;
  if (!dearer) return; // the claim would be true; this guard has nothing to say.

  const text = capRationale();
  // The exact shipped sentence, and the conclusion it drew. Both are listed, because the defect
  // survives either half alone: the price pair without the conclusion is a stale citation, and the
  // conclusion without the pair is the same wrong direction with the evidence removed.
  assert.doesNotMatch(text, /cheaper per token than the model it replaced/,
    'the cap is justified by a per-token saving the price table says did not happen');
  assert.doesNotMatch(text, /buys materially more work|capacity behind it goes up/,
    'the cap is justified by capacity that went down');
  // And it must still SAY something: deleting the wrong direction and leaving silence is how the
  // next repricing ends up guessing.
  assert.match(text, /dearer|\+41%|FEWER/,
    'the rationale no longer states which way the migration moved the cost');
});
