// 2026-09-23: "make the lighting warmer" took 7m44s, also resized trees and added boulders and paths nobody
// asked for, and replied with RGB triples. The prompt must carry both rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/prompts.ts', import.meta.url), 'utf8');

test('the prompt says to change only what was asked, and to reply in plain words', () => {
  assert.match(src, /Change only what the latest message asks for/);
  assert.match(src, /If a check suggests other improvements, do not make\s+them/);
  assert.match(src, /young player: plain words, no numbers, colour values or property names/);
});
