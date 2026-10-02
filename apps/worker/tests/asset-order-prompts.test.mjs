/**
 * THE ASSET ORDER IS STATED ONCE AND NO PROMPT, DESCRIPTION OR CARD CONTRADICTS IT.
 *
 * Owner, 2026-10-02: library, then Creator Store, then adapt or combine, then build from Parts in full
 * detail. The old text said "NEVER make a model from scratch", "do not substitute a handmade complex
 * model" and "leave it unbuilt", so step 4 was unreachable even where the code allowed it, and the live
 * benchmark's maps stopped as a white slab. This reads the sources that reach the model and fails when a
 * phrase that forbids the last step comes back. It reads text, so it strips nothing: a phrase in a
 * comment would be a false finding, which is why the patterns are the prompts' own sentences.
 *
 * Run with:  node --test tests/asset-order-prompts.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (f) => readFileSync(join(WORKER, 'src', f), 'utf8');
/** Comments are not prompts; a comment that documents the old rule must not fail this. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FILES = ['prompts.ts', 'worldbuilding.ts', 'asset-policy.ts', 'tools.ts', 'roadmap.ts', 'model-rule.ts', 'model-library.ts'];
const CARDS = readFileSync(join(WORKER, '..', '..', 'packages', 'corpus', 'data', 'skill-cards.json'), 'utf8');

const FORBIDDEN = [
  /NEVER make a model from scratch/i,
  /do not substitute a handmade/i,
  /never (assemble|build|hand-?build)(?! sun| a sun)[^.\n]{0,60}from parts/i, // sun, sky and clouds are a different rule: they are Lighting, never Parts
  /never build a prop from parts/i,
  /never from parts/i,
  /never hand-?build (a |the )?(props?|models?|objects?|trees?|buildings?)/i, // particle effects and UI are different rules (D-FXLIB-1, D-UIONLY-1)
  /leave (it|this( asset| prop)?) unbuilt/i,
  /never substitute hand-built/i,
  /Parts rather than looking for assets/i,
  /never (a )?generate[^.\n]{0,20}from scratch models/i,
];

test('no prompt, tool description, roadmap step or skill card forbids the last step of the asset order', () => {
  for (const f of FILES) {
    const text = code(SRC(f));
    assert.ok(text.length > 1000, `${f} was not read`);
    for (const re of FORBIDDEN) assert.doesNotMatch(text, re, `${f} still says: ${re}`);
  }
  assert.ok(CARDS.length > 1000, 'the skill cards were not read');
  for (const re of FORBIDDEN) assert.doesNotMatch(CARDS, re, `skill-cards.json still says: ${re}`);
});

test('the skill cards follow the order and teach build-once-then-repeat, not per-copy coordinates or scatter-everything', () => {
  const cards = JSON.parse(CARDS).cards;
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const text = (id) => byId[id].recipe.join('\n');
  for (const id of ['props-low-poly-from-primitives', 'map-buildings-from-parts']) {
    assert.ok(byId[id], `${id} is gone — re-aim this test`);
    assert.match(text(id), /asset order of the system prompt applies/, `${id} does not point at the order`);
    assert.match(text(id), /step 4/, `${id} does not say Parts is step 4, not a fallback to avoid`);
    assert.match(text(id), /origin/, `${id} does not teach building once in local space`);
    assert.match(text(id), /clone_instances (at|\(?at)|clone_instances at \/ along \/ within|at \/ along \/ within/, `${id} does not teach repeating with at / along / within`);
    assert.doesNotMatch(text(id), /Library first \(D-MODELLIB-1\)/, `${id} still states the order in its own words`);
    assert.doesNotMatch(byId[id].title, /as the fallback/, `${id}'s title calls Parts a fallback`);
  }
  const map = text('map-layered-composition');
  assert.match(map, /edit_terrain call, action path/, 'the map card does not teach a line of terrain as one path call');
  assert.match(map, /clone_instances within an area/, 'the map card does not teach repeating an inserted model with clone_instances');
  assert.doesNotMatch(map, /scatter_instances trees\/rocks\/bushes/, 'the map card still says to scatter trees, rocks and bushes');
  assert.match(map, /overrides for the exact hour/, 'the map card does not hand the hour to set_mood overrides');
  assert.equal(CARDS.includes('never build from Parts'), false);
});

test('the order is stated once, in prompts.ts, and the other files point at it instead of restating it', () => {
  const prompts = code(SRC('prompts.ts'));
  assert.equal((prompts.match(/ASSET ORDER, for every prop/g) ?? []).length, 1, 'the order must be stated exactly once in prompts.ts');
  assert.match(prompts, /find_library_model[\s\S]{0,400}find_verified_asset[\s\S]{0,400}adapt or combine[\s\S]{0,400}Parts/);
  assert.match(prompts, /a source that is off is a skip, not a stop/);
  for (const f of ['worldbuilding.ts', 'asset-policy.ts']) {
    assert.doesNotMatch(code(SRC(f)), /library, (then )?Creator Store, (then )?adapt or combine, (then )?build from Parts[^.]*\.[^.]*\.[^.]*library, (then )?Creator Store/, `${f} restates the order twice`);
  }
});
