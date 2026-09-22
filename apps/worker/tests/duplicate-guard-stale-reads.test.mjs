/**
 * A READ MADE BEFORE THE PLACE CHANGED IS NOT THE SAME READ AFTER IT.
 *
 * Run 1870ecfe (2026-09-22, the vis-01 street lamp): create_instances built the lamp, then the model
 * re-read the place with get_project_tree. The duplicate guard matched `name:arguments` against every
 * earlier call of the run and answered "You already made this exact call earlier in this run and have
 * the result above" — a result from BEFORE the lamp existed. The model asked again, and again.
 *
 * The property: when a tool reports that it changed the project, the remembered signatures of calls
 * that do NOT change the project are forgotten, and those of calls that do are kept. The session loop
 * needs a live Studio to exercise end to end, so this reads the loop's source for that property —
 * red-first below proves it bites.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('a project change forgets remembered READ signatures and keeps WRITE ones', () => {
  // Every reaction to a project change, wherever it sits and however the lines are grouped: the
  // property is that one of them forgets reads, not the spelling of the line before it.
  const blocks = [...src.matchAll(/if \(out\.mutatedProject === true\) \{([\s\S]*?)\n\s*\}/g)].map((m) => m[1]);
  assert.ok(blocks.some((b) => /agent\.mutated = true/.test(b)), 'the mutation-truth line was not found — this test would check nothing');
  const block = [null, blocks.find((b) => /agent\.seenCalls/.test(b))];
  assert.ok(block[1], 'no reaction to a project change forgets remembered signatures');
  assert.match(block[1], /projectMutatingToolNames\(\)/, 'the kept set must be derived from the registry, not a hand-written list');
  assert.match(block[1], /agent\.seenCalls\s*=\s*agent\.seenCalls\.filter\(/, 'remembered signatures must be filtered');
});

test('the duplicate streak is bounded and the bound ends the run', () => {
  assert.match(src, /const MAX_DUPLICATE_STREAK = [1-9]\d*;/);
  assert.match(src, /agent\.duplicateStreak\s*>=\s*MAX_DUPLICATE_STREAK/);
});
