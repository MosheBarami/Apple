import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(readFileSync(join(ROOT, 'packages/corpus/data/genre-references.json'), 'utf8'));
const MINIMUM = 5;

/**
 * The genre catalogue already did the hard part — 45 references, every one visually inspected,
 * every one marked reference-only with copying refused by default. What it had no guard for was
 * COVERAGE, and four genres are under the owner's five-reference minimum.
 *
 * So this is a ratchet, matching `tests/ui-references.test.mjs`: a genre outside THIN fails below
 * five, and a genre inside THIN that reaches five ALSO fails, so the list of known holes cannot
 * outlive the holes. Counted, not estimated — the numbers below came from counting the file.
 */
const THIN = new Map([
  ['obby', 4],
  ['roleplay', 3],
  ['tower_defense', 4],
  ['anime_battle', 3],
  // Added to the taxonomy on 2026-09-20 because the UI harvest had inspected shipped examples of it
  // and the catalogue did not carry the genre at all. It has NO external references here yet, which
  // is a known hole stated out loud: the ratchet fails the day it reaches five and this entry is
  // still here, so the list cannot outlive the gap.
  ['pet_simulator', 0],
]);

const refsFor = (genreId) => catalogue.externalReferences.filter((r) => (r.genreIds ?? []).includes(genreId));

test('every genre in the taxonomy is either covered or openly thin', () => {
  assert.ok(catalogue.genres.length >= 8, 'the taxonomy shrank — this check would be vacuous');
  const thin = [];
  for (const genre of catalogue.genres) {
    const n = refsFor(genre.id).length;
    if (n < MINIMUM && !THIN.has(genre.id)) thin.push(`${genre.id} has ${n} and is not declared thin`);
  }
  assert.deepEqual(thin, [], thin.join('; '));
});

test('the thin list cannot outlive the gap it describes', () => {
  const ready = [];
  for (const [genreId, recorded] of THIN) {
    const n = refsFor(genreId).length;
    if (n >= MINIMUM) ready.push(`${genreId} now has ${n} and must be removed from THIN`);
    else if (n !== recorded) ready.push(`${genreId} has ${n}, not the ${recorded} recorded — recount and update`);
  }
  assert.deepEqual(ready, [], ready.join('; '));
});

test('every reference says it was looked at, and what was seen', () => {
  // w31 asks for RECORDED VISUAL OBSERVATIONS, which is a different thing from a bookmark. A row
  // with a url and no observations is a link somebody meant to read.
  const bad = [];
  for (const ref of catalogue.externalReferences) {
    if (ref.inspection?.status !== 'visual_inspected') bad.push(`${ref.id}: inspection status is ${ref.inspection?.status ?? 'missing'}`);
    const seen = ref.observations;
    if (!Array.isArray(seen) || seen.length === 0) bad.push(`${ref.id}: records no observations, so it is a bookmark`);
    if (typeof ref.url !== 'string' || !/^https?:\/\//.test(ref.url)) bad.push(`${ref.id}: no fetchable url, so the observation cannot be checked`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('reference-only and reusable are distinguished per row, not assumed from the policy', () => {
  // The distinction w31 names. A catalogue whose policy says "reference only" while individual
  // rows say nothing invites the next agent to treat a screenshot as an asset it may ship.
  assert.equal(catalogue.policy.externalReferenceUse, 'reference_only');
  assert.equal(catalogue.policy.copyPermissionDefault, false);

  const bad = [];
  for (const ref of catalogue.externalReferences) {
    if (!ref.referenceUse) bad.push(`${ref.id}: does not say how it may be used`);
    if (ref.licence?.status !== 'unverified_reference_only') {
      bad.push(`${ref.id}: licence status is ${ref.licence?.status ?? 'missing'} — a row claiming reusability needs a verified licence, not a default`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('nothing in the catalogue is a reusable asset, and that is stated rather than inferred', () => {
  // Today every row is reference-only. If a genuinely reusable one is ever added, this test is
  // where the distinction has to be made explicit — it fails rather than letting a licensed asset
  // slip in under a catalogue whose whole policy assumes nothing here can be shipped.
  const reusable = catalogue.externalReferences.filter((r) => r.licence?.status !== 'unverified_reference_only');
  assert.deepEqual(reusable.map((r) => r.id), [],
    'a reusable row appeared in a reference-only catalogue: give it a verified licence and a separate home, or the next agent will ship it');
});

test('the UI reference library and the genre catalogue do not disagree about a genre', () => {
  // Two libraries, one taxonomy. `ui-references` covers interface construction; this covers genre
  // visual language. A genre named in one and unknown to the other is a split that will drift.
  const known = new Set(catalogue.genres.map((g) => g.id));
  const uiDir = join(ROOT, 'packages/corpus/data/ui-references');
  assert.ok(existsSync(uiDir), 'the UI reference library is gone — this check would be vacuous');
  // NOT EVERY INTERFACE IS A GENRE. 'studio' is the plugin panel and 'web-landing' is the public
  // marketing site; neither is a Roblox game genre and neither belongs in the taxonomy. They are
  // listed rather than pattern-matched so that adding a third non-genre surface is a decision
  // somebody makes on purpose, and each one must actually EXIST — a name left here after its file
  // is gone would quietly widen the exemption.
  // 'studio' was exempted here for as long as this test has existed and HAS NO FILE — the old
  // spelling `id !== 'studio'` could not tell an exemption in use from one left behind, so nobody
  // found out. It is gone; if a studio.json is ever written, add it back deliberately.
  //
  // A SECOND AXIS ARRIVED ON 2026-09-20. The library now also covers SCREEN TYPES — shop, inventory,
  // rewards, codes, leaderboard, settings, HUD, battle pass — because a shop is built the same way
  // whether the game is a tycoon or a pet simulator, and the screen question is the one the model is
  // actually asked. A screen is not a genre and must never be added to the genre taxonomy; matching
  // the prefix is right here where listing each one would turn every new screen into a red build for
  // no reason. `studio` is the plugin panel, which the comment above invited adding back
  // deliberately once a file existed for it — one now does.
  const NON_GENRE_SURFACES = new Set(['web-landing', 'studio']);
  const isScreen = (id) => id.startsWith('screen-');
  const files = readdirSync(uiDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  const stale = [...NON_GENRE_SURFACES].filter((id) => !files.includes(id));
  assert.deepEqual(stale, [], `exempted surfaces with no file: ${stale.join(', ')}`);
  // Non-vacuity: if the prefix ever matched everything, the genre half of this check would quietly
  // stop running while still reporting green.
  assert.ok(files.some((id) => !isScreen(id)), 'every file looks like a screen — the genre half of this check is dead');
  const orphans = files.filter((id) => !known.has(id) && !NON_GENRE_SURFACES.has(id) && !isScreen(id));
  assert.deepEqual(orphans, [], `these UI reference genres are not in the genre taxonomy: ${orphans.join(', ')}`);
});
