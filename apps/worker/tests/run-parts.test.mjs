// F-064 round 5 (2026-09-23, run 2e381849): the run ended "made and checked" with half the request's
// list unbuilt, because every signal of open work (plan steps ticked by tool, "any ScreenGui") read
// closed. run-parts.ts keeps the request's own list as the checklist. Properties, not spellings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  requestedParts, evidenceWords, addEvidence, missingParts, partSteerAllowed, partSteer,
  PART_STEERS_WITHOUT_PROGRESS, EVIDENCE_WORDS_MAX,
} from '../src/run-parts.ts';

// The fixed round-5 customer prompt (docs/gauntlet/visual/GAUNTLET.md), verbatim.
const ROUND5 = 'Build a full simulator game like the popular ones: a bright cartoon hub map with grass hills, paths, trees, fences, a shop building, market stalls, a rebirth circle and a leaderboard, and the full UI: currency bar on top, round buttons on the sides, a shop with gamepasses and packs, and settings. Make the full game, make no mistakes';
const made = (...names) => evidenceWords('create_instances', JSON.stringify({ items: names.map((name) => ({ className: 'Model', name, parent: 'Workspace' })) }));
const labels = (parts) => parts.map((p) => p.label);

test('a listed request becomes a checklist of its items; the headline and the constraints are not parts', () => {
  const parts = requestedParts(ROUND5);
  const l = labels(parts);
  for (const item of ['market stalls', 'currency bar on top', 'a leaderboard', 'settings']) assert.ok(l.includes(item), `${item} is not on the checklist: ${l}`);
  assert.ok(!l.some((x) => /mistake/i.test(x)), 'a constraint became a part');
  assert.ok(!l.some((x) => /popular/i.test(x)), 'the headline became a part');
});

test('the round-5 state reads as open: what it built is named, what it did not build is missing', () => {
  const evidence = addEvidence(made('HubMap', 'Trees', 'ShopBuilding'), made('RebirthCircle'));
  const missing = labels(missingParts(requestedParts(ROUND5), evidence));
  assert.ok(missing.includes('market stalls') && missing.includes('currency bar on top'), `missing: ${missing}`);
  assert.ok(!missing.includes('a shop building') && !missing.includes('trees') && !missing.includes('a rebirth circle'));
});

test('a part counts as built from the names a change gave, not from a script body that mentions it', () => {
  const parts = requestedParts('Add a lighthouse, a pier, and a tavern');
  const body = `-- the tavern will go here later\n${'print(1)\n'.repeat(40)}`;
  const script = evidenceWords('create_instances', JSON.stringify({ items: [{ className: 'Script', name: 'Main', parent: 'ServerScriptService', props: { Source: { t: 'string', v: body } } }] }));
  assert.ok(labels(missingParts(parts, script)).includes('a tavern'), 'a comment in a script body counted as a built part');
  assert.ok(!labels(missingParts(parts, made('TavernHall'))).includes('a tavern'), 'a camelCase name did not count');
});

test('a request that names one thing is not a checklist', () => {
  assert.deepEqual(requestedParts('make the door red'), []);
  assert.deepEqual(requestedParts('hi'), []);
});

test('the plan: a building step whose tool never ran is open; a check step is not a part', () => {
  const steps = [
    { title: 'Harbour pier and boats', tool: 'create_instances', status: 'done' },
    { title: 'Tavern interior', tool: 'create_instances', status: 'pending' },
    { title: 'Check the build', tool: 'audit_build', status: 'pending' },
  ];
  const parts = requestedParts('build a harbour', steps, (tool) => tool !== 'audit_build');
  assert.ok(!labels(parts).includes('Check the build'));
  const missing = labels(missingParts(parts, made('Pier', 'FishingBoat', 'TavernInterior')));
  assert.deepEqual(missing, ['Tavern interior'], 'a pending step must stay open until its tool runs');
});

test('the steers are bounded: a run that makes no progress stops being steered, progress earns more', () => {
  let state;
  let steers = 0;
  for (let i = 0; i < 10; i++) {
    const gate = partSteerAllowed(state, 5);
    state = gate.next;
    if (gate.allowed) steers += 1;
  }
  assert.equal(steers, PART_STEERS_WITHOUT_PROGRESS);
  assert.equal(partSteerAllowed(state, 4).allowed, true, 'a part got built and the run was not steered again');
  assert.equal(partSteerAllowed(state, 0).allowed, false, 'nothing missing, yet steered');
});

test('the steer names the missing part, and a second steer leads with another one', () => {
  const missing = missingParts(requestedParts('Add a lighthouse, a pier, and a tavern'), []);
  const first = partSteer(missing, 0);
  const second = partSteer(missing, 1);
  assert.match(first, /lighthouse/);
  assert.notEqual(first.match(/asked for "([^"]+)"/)[1], second.match(/asked for "([^"]+)"/)[1]);
  assert.doesNotMatch(first, /\?\s*$/, 'the steer ends on a question');
});

test('the evidence kept per run is bounded', () => {
  const many = Array.from({ length: EVIDENCE_WORDS_MAX + 500 }, (_, i) => `word${i}`);
  assert.equal(addEvidence([], many).length, EVIDENCE_WORDS_MAX);
});

test('the module knows no genre: no game-specific word in its code', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'run-parts.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\b(shop|currency|coin|stall|rebirth|simulator|tycoon|obby|garden|plot|pet|leaderboard|gamepass)\b/i);
});
