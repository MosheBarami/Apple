/**
 * THE PRODUCT DOES NOT OFFER HEBREW, AND THAT IS A REMOVAL OF A CLAIM ONLY.
 *
 * An audit drove a Hebrew prompt through the deployed product on 2026-09-20. The failure was not a
 * translation gap, it was silent data loss: "אובי עם לבה ו3 שלבים" produced a skill query for an
 * obby with a collectible HEART — לבה (lava) had become לב (heart) — and the run_intent for it came
 * back with an empty checklist, empty questions and empty assumptions where the identical English
 * prompt was fully populated. The person is told none of that; they get a build missing the thing
 * they asked for. The owner's decision was to stop offering it rather than ship it broken.
 *
 * Offering a language chip or a locale is a promise the product works in that language. Those are
 * gone. What must NOT go with them is text handling: somebody may still type Hebrew, and their own
 * words must render the right way round. A test that only checked for absence would happily pass on
 * a product that had also deleted `dir="auto"` and now renders their sentence backwards — so both
 * halves are asserted here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

test('no reply-language choice is offered at all', () => {
  // Hebrew went first (2026-09-20); every other reply language followed with the V3 handoff §1:
  // all customer-facing output is English. So the property is now "no language choice", not
  // "no Hebrew in the choice".
  const panel = read('components', 'ws', 'instructions-panel.tsx');
  assert.match(panel, /setPref\('response_length'/, 'the panel parse is wrong: its other settings are missing too');
  assert.doesNotMatch(panel, /setPref\('language'|const LANGUAGES\b/, 'a reply-language control is back');
  const api = read('lib', 'api.ts');
  const prefsType = /export interface Preferences \{([\s\S]*?)\n\}/.exec(api);
  assert.ok(prefsType, 'the Preferences type could not be found — re-read this guard');
  assert.doesNotMatch(prefsType[1], /^\s*language\??:/m, 'the wire type carries a language field again');
});

test('no region offers Hebrew', () => {
  const prefs = read('lib', 'prefs.ts');
  const regions = /const REGIONS[^=]*=\s*\[([\s\S]*?)\]\s*as const;/.exec(prefs);
  assert.ok(regions, 'the REGIONS list could not be found — re-read this guard');
  assert.ok(regions[1].includes("'en-US'"), 'the list parse is wrong: en-US is missing too');
  assert.ok(!/'he-IL'/.test(regions[1]), "'he-IL' is back in the region list");
});

test('AND text a person types still renders the right way round', () => {
  // The opposite failure, and the one a removal invites: stripping the language claim AND the
  // bidirectional handling, so Hebrew someone types anyway comes out backwards.
  assert.match(read('components', 'ws', 'turn.tsx'), /dir="auto"/, 'a message must carry its own direction');
  const direction = read('lib', 'direction.ts');
  assert.match(direction, /\bhe\b/, 'direction.ts must still know Hebrew is right-to-left');
});
