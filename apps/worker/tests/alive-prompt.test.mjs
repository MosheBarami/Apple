/**
 * A FINISHED THING IS ALIVE, WITHOUT BEING ASKED.
 *
 * Benchmark 2026-10-04 (self-check on), items o01, o03, o04, o06: sound 0 and animation 0 on almost every object, the tools for
 * both unused unless the request named them, while the judge reads a chest that opens in silence or a balloon that never sways as
 * unfinished. The prompt states the general principle; it names no subject (phase 1: no noun lists, no request recognition).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const prompts = readFileSync(join(WORKER, 'src', 'prompts.ts'), 'utf8');

test('the prompt says what naturally moves, lights up or sounds does so in the game, unasked, with the tools for it', () => {
  const at = prompts.indexOf('A thing is not finished when its parts exist');
  assert.ok(at > 0, 'the principle is missing');
  const end = prompts.indexOf('\n- ', at);
  const rule = prompts.slice(at, end > at ? end : at + 600);
  for (const tool of ['add_behaviour', 'insert_sound', 'add_effect']) assert.match(rule, new RegExp(tool));
  assert.match(rule, /without being asked/);
  assert.match(rule, /still, silent prop/, 'the user can still ask for a still prop');
  assert.match(rule, /Do not claim motion or sound you did not add/);
  const subjects = JSON.parse(readFileSync(join(WORKER, 'tests', 'fixtures', 'subject-words.json'), 'utf8')).words;
  // The same generic words behaviour-tool.test.mjs allows: `light` is a verb of add_behaviour, `prop` means any placed thing.
  const generic = new Set(['light', 'prop']);
  const named = subjects.filter((w) => !generic.has(w) && new RegExp(`\\b${w}s?\\b`, 'i').test(rule));
  assert.deepEqual(named, [], 'the rule names a subject');
});
