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

// 2026-09-30: replies listed script paths ("ReplicatedStorage.Modules.DumpTable (loadstring)"), instance counts and
// "suspicious scripts" to a young creator, partly because the prompt told the agent to. The reply rules now say what to
// talk about and what never to mention, and the code (not the prompt) keeps imported originals out of the audit and
// refuses to rename or move a recreated game.
test('the prompt tells the agent to talk about what the player sees, one plain sentence per real problem', () => {
  assert.match(src, /what the player will now see and do/);
  assert.match(src, /Never mention tools, paths, services, class or script names, counts of objects or scripts, error codes, ids or\s+"checkpoint"/);
  assert.match(src, /A real problem gets ONE plain sentence/);
  assert.match(src, /Progress saving will work once the game is published/);
});

test('nothing in the prompt still coaches jargon', () => {
  assert.doesNotMatch(src, /tell the user which scripts/i);
  assert.doesNotMatch(src, /flagged suspicious/i);
  assert.doesNotMatch(src, /possible backdoors/i);
  assert.doesNotMatch(src, /quote what (playerSees|each press)/);
});

test('rules the code already enforces are not repeated in the prompt', () => {
  assert.doesNotMatch(src, /EXCEPT imported library/, 'audit_build skips roots tagged AppleLibraryGame');
  assert.doesNotMatch(src, /never rename, move or\s+regroup/i, 'a recreated game refuses rename, move, group and ungroup');
  assert.doesNotMatch(src, /hunt them down/);
});
