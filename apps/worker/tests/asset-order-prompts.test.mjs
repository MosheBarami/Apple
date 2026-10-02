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

test('the order is stated once, in prompts.ts, and the other files point at it instead of restating it', () => {
  const prompts = code(SRC('prompts.ts'));
  assert.equal((prompts.match(/ASSET ORDER, for every prop/g) ?? []).length, 1, 'the order must be stated exactly once in prompts.ts');
  assert.match(prompts, /find_library_model[\s\S]{0,400}find_verified_asset[\s\S]{0,400}adapt or combine[\s\S]{0,400}Parts/);
  assert.match(prompts, /a source that is off is a skip, not a stop/);
  for (const f of ['worldbuilding.ts', 'asset-policy.ts']) {
    assert.doesNotMatch(code(SRC(f)), /library, (then )?Creator Store, (then )?adapt or combine, (then )?build from Parts[^.]*\.[^.]*\.[^.]*library, (then )?Creator Store/, `${f} restates the order twice`);
  }
});
