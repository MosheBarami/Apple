/**
 * THE OTHER PLACE THE OLD NAMES COULD COME BACK: the two tables every mode LABEL is read from.
 *
 * `apps/worker/tests/mode-names-are-the-product.test.mjs` guards the system prompt — the model's
 * account of itself. It does not look at `MODE_INFO` or `PRODUCT_MODE_INFO`, and those are where
 * the words a PERSON reads come from. Measured 2026-09-21 against the deployed SPA bundle
 * `/app/assets/index-CMtGTYsw.js` at buildSha 29c91d0, so this is not a theory about what ships:
 *
 *   "Apple Max Auto"                              2 occurrences   (MODE_INFO.rune.name)
 *   "Apple Max"                                   4               (MODE_INFO.stone.name)
 *   "Builds features across your project"         1               (MODE_INFO.stone.blurb)
 *   "Plans, builds, tests and fixes autonomously" 1               (MODE_INFO.rune.blurb)
 *   "Super Agent"                                 3               (PRODUCT_MODE_INFO.super.name)
 *
 * and `"stone"`, `"clay"`, `"rune"` appear in that bundle exactly once each, all three inside the
 * single wire map `{plan:"clay",agent:"stone",super:"rune"}` and its inverse. Capitalised
 * `Stone`/`Clay`/`Rune`: zero. That is the state this file freezes.
 *
 * The owner's complaint that this answers names both halves in one sentence:
 *
 *   "when we said to delete golem a hundred times you left its previous names, which are stone,
 *    clay and all that nonsense — it is long since bullshit, not current."
 *
 * `scripts/check-rebrand.mjs` covers the first half and only the first half: its denominator is
 * `/golem/gi` and nothing else, so the specialist names could return to a label tomorrow and the
 * rebrand checker would still print a clean run. That is the gap this file closes, for the two
 * tables that actually feed a label. It does NOT claim to cover every string in the product — a
 * repo-wide sweep for "stone" would have to be right about Roblox's `Medium stone grey`, the
 * `.rune-spinner` class name and an asset called `Stone Archway`, and a guard full of exceptions
 * is a guard nobody can trust. See ADR-024 in docs/DECISIONS.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE_INFO, PRODUCT_MODE_INFO, PRODUCT_MODE_TO_SPECIALIST, SPECIALIST_TO_PRODUCT_MODE } from '@golem/shared';

const LEGACY = /\b(stone|clay|rune)\b/i;

/** Every string a person could be shown, paired with where it came from. */
function labels() {
  const out = [];
  for (const [key, info] of Object.entries(MODE_INFO)) {
    for (const field of ['name', 'blurb', 'entryUnit']) out.push([`MODE_INFO.${key}.${field}`, info[field]]);
  }
  for (const [key, info] of Object.entries(PRODUCT_MODE_INFO)) {
    for (const field of ['name', 'blurb']) out.push([`PRODUCT_MODE_INFO.${key}.${field}`, info[field]]);
  }
  return out;
}

// The instrument first: this only means something if `labels()` is actually reading the tables.
test('the labels under test are the ones that ship', () => {
  const found = Object.fromEntries(labels());
  assert.equal(found['MODE_INFO.stone.name'], 'Apple Max');
  assert.equal(found['PRODUCT_MODE_INFO.super.name'], 'Super Agent');
  assert.equal(labels().length, 15, 'three specialists x three fields, three product modes x two');
});

test('no legacy specialist name appears in anything a person is shown', () => {
  const hits = labels().filter(([, text]) => LEGACY.test(text));
  assert.deepEqual(hits, [], `a label names a specialist: ${JSON.stringify(hits)}`);
});

// THE HOLD IS PART OF THE PROPERTY, NOT A SEPARATE CONCERN. ADR-024 decided the keys STAY: they are
// the stored `mode` column, the plugin's wire value and the browser's. A future session that made
// the assertion above pass by renaming the keys would have satisfied this file and broken every
// session already in storage, so the keys are asserted here, beside it, where that trade is visible.
test('the wire values are still the legacy words, because renaming them is a protocol bump', () => {
  assert.deepEqual(PRODUCT_MODE_TO_SPECIALIST, { plan: 'clay', agent: 'stone', super: 'rune' });
  assert.deepEqual(SPECIALIST_TO_PRODUCT_MODE, { clay: 'plan', stone: 'agent', rune: 'super' });
  assert.deepEqual(Object.keys(MODE_INFO).sort(), ['clay', 'rune', 'stone']);
});
