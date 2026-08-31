// Intent expansion: twelve axes beyond interior/exterior, and the discipline that keeps eleven of
// them out of the gate.
//
// Two properties matter more than any single assertion here:
//   1. NOTHING new can block a build. The only hard failure in the system is still the enclosure
//      gate proven on real Studio captures. There is a property test for that below.
//   2. Negation is right. "no zombies" excludes zombies; "not just a plain room" does NOT exclude
//      rooms, it demands more than one. That distinction is the whole difference between a useful
//      exclusion list and one that fights the user.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..', '..', '..', 'apps', 'worker');
const dest = join(tmpdir(), `golem-intent-${process.pid}.mjs`);
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'semantic.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${dest}`],
  { stdio: 'pipe', cwd: WORKER },
);
const S = await import(`file://${dest}`);
rmSync(dest, { force: true });

// The same two live Studio captures the enclosure gate was calibrated on.
const TAVERN_INTERIOR = [
  [0, 0.5, 0, 40, 1, 30, 0], [0, 12.5, 0, 40, 1, 30, 0],
  [-20, 6.5, 0, 1, 12, 30, 0], [20, 6.5, 0, 1, 12, 30, 0],
  [0, 6.5, -15, 40, 12, 1, 0], [0, 6.5, 15, 40, 12, 1, 0],
  [-8, 3, -10, 16, 4, 2, 0],
  [-11, 2, -7, 1.5, 3, 1.5, 0], [-8, 2, -7, 1.5, 3, 1.5, 0], [-5, 2, -7, 1.5, 3, 1.5, 0], [-2, 2, -7, 1.5, 3, 1.5, 0],
  [10, 2.5, 5, 6, 0.4, 6, 0], [18, 4, 10, 4, 7, 3, 0],
];
const COTTAGE_EXTERIOR = [
  [200, 0.5, 0, 90, 1, 90, 0], [200, 5.5, 0, 18, 10, 14, 0],
  [200, 11.5, 0, 22, 1, 18, 0], [200, 12.5, 0, 20, 1, 16, 0],
  [192, 2, 22, 2, 3, 2, 0], [198, 2, 22, 2, 3, 2, 0], [204, 2, 22, 2, 3, 2, 0], [210, 2, 22, 2, 3, 2, 0],
  [224, 3, -20, 4, 5, 4, 0],
];
/** A bare slab: a floor with nothing whatsoever above head height. */
const BARE_SLAB = [[0, 0.5, 0, 60, 1, 60, 0], [10, 2, 10, 3, 3, 3, 0]];

const B4_PROMPT =
  'Build a cosy tavern interior in game.Workspace: walls with a doorway and windows, a wooden floor, ' +
  'a bar counter with stools, tables and chairs, a fireplace, and warm interior lighting. Make it look good.';

const axis = (i, name) => i.constraints.filter((c) => c.axis === name);
const values = (i, name) => axis(i, name).map((c) => c.value);
const excluded = (req) => values(S.extractIntent(req), 'exclusion');

// =================================================================================================
// NEGATION. The highest-value axis and the easiest to get wrong, so it is tested hardest.
// =================================================================================================

test('plain exclusions are caught', () => {
  assert.deepEqual(excluded('Build a village with no zombies'), ['zombies']);
  assert.deepEqual(excluded('Build a village without water'), ['water']);
  assert.deepEqual(excluded("Build a village, don't add water"), ['water']);
  assert.deepEqual(excluded('Build a village, avoid neon colours'), ['neon colours']);
  assert.deepEqual(excluded('Build a village and leave out the fountain'), ['fountain']);
  assert.deepEqual(excluded('Build a lobby free of clutter'), ['clutter']);
  assert.deepEqual(excluded('Build a hall, never include lava'), ['lava']);
});

test('THE TRAP: "not just a plain room" is not an exclusion of "room"', () => {
  const i = S.extractIntent('I want a shop but not just a plain room - give it character.');
  assert.deepEqual(values(i, 'exclusion'), [], '"not just X" asks for MORE than X, never for less');
  // and the emphasis it actually carries is kept, rather than thrown away
  assert.ok(values(i, 'feature').some((v) => v.includes('plain room')), 'the demand for more should survive');
});

test('"not only" and "more than just" are the same trap and are handled the same way', () => {
  assert.deepEqual(excluded('not only a corridor, make it interesting'), []);
  assert.deepEqual(excluded('I want more than just a box'), []);
  assert.deepEqual(excluded('not merely a flat plane'), []);
});

test('comparative bounds are quantities, not prohibitions', () => {
  assert.deepEqual(excluded('Build a room with no more than three floors'), []);
  assert.deepEqual(excluded('no bigger than 40 studs'), []);
  assert.deepEqual(excluded('no taller than the tower'), []);
});

test('idioms after "no" and "without" forbid nothing', () => {
  assert.deepEqual(excluded('without a doubt the best tavern you can build'), []);
  assert.deepEqual(excluded('no matter what, make it warm'), []);
  assert.deepEqual(excluded('no problem if it takes a while'), []);
});

test('double negation asks FOR the thing', () => {
  assert.deepEqual(excluded('Build it not without water'), [], '"not without water" wants water');
});

test('hedging is not exclusion, and exclusion is not hedging', () => {
  assert.deepEqual(excluded("I'm not sure I want a fireplace"), []);
  assert.deepEqual(excluded('not certain about the roof'), []);
});

test('"there is no X yet" describes the scene; "make sure there is no X" forbids it', () => {
  assert.deepEqual(excluded('There is no fireplace yet, add one.'), [], 'a report of absence is not a ban');
  assert.deepEqual(excluded('Make sure there is no lava.'), ['lava'], 'an instruction is a ban');
});

test('an exclusion list stops at the first thing that is not a thing', () => {
  const i = S.extractIntent('Build a plaza with no zombies and build a tower in the middle');
  assert.deepEqual(values(i, 'exclusion'), ['zombies'], 'the tower was requested, not excluded');
});

test('a list of exclusions is read to the end of the list', () => {
  assert.deepEqual(excluded('Build a house with no windows or doors'), ['windows', 'doors']);
  assert.deepEqual(excluded('Build a swamp with no zombies and no skeletons'), ['zombies', 'skeletons']);
  assert.deepEqual(excluded('Build a village with no zombies and without water'), ['zombies', 'water']);
});

test('"no" inside a word is not a negation', () => {
  assert.deepEqual(excluded('Build a casino with a nook by the window'), []);
  assert.deepEqual(excluded('Build a north tower'), []);
});

test('degree limiters are soft, absolute prohibitions are strong', () => {
  const soft = axis(S.extractIntent('Nothing too modern please'), 'exclusion');
  assert.equal(soft.length, 1);
  assert.equal(soft[0].value, 'modern');
  assert.equal(soft[0].strength, 'soft', 'a degree limiter still allows some of the thing');

  const hardish = axis(S.extractIntent('Build a plaza with no zombies'), 'exclusion');
  assert.equal(hardish[0].strength, 'strong');
  assert.notEqual(hardish[0].strength, 'hard', 'we cannot see a zombie in a bounding box — never gate on it');
});

test('an excluded noun is masked before the lexicons read the request', () => {
  // "zombie" is a horror keyword and "fighting" a combat one. A request that FORBIDS them must not
  // therefore be classified as a horror map or a combat arena.
  const i = S.extractIntent('Build a plaza with no zombies');
  assert.deepEqual(values(i, 'exclusion'), ['zombies']);
  assert.deepEqual(values(i, 'genre'), [], 'an excluded word must not drive the genre');

  const j = S.extractIntent('Build a market square with no fighting');
  assert.deepEqual(values(j, 'exclusion'), ['fighting']);
  assert.deepEqual(values(j, 'purpose'), [], 'an excluded word must not drive the purpose');
});

test('an exclusion is a warning, never a failure', () => {
  const r = S.intentCheck('Build a town plaza with no water', COTTAGE_EXTERIOR);
  assert.ok(r.warnings.some((w) => w.includes('water')), 'it must be said loudly');
  assert.deepEqual(r.hardFailures, [], 'and it must not block the build');
});

// =================================================================================================
// THE INVARIANT: nothing new may gate.
// =================================================================================================

test('PROPERTY: the only hard failure in the system is still the enclosure gate', () => {
  const prompts = [
    B4_PROMPT,
    'Build a town plaza with a monument',
    'Build a medieval tavern interior with no zombies, a fireplace centrepiece and two floors',
    'Make me an old-fashioned street lamp',
    'Build a cozy bedroom - bed, desk, wardrobe, a window',
    'Build a fighting pit with no roof',
    'Build a tavern',
  ];
  for (const p of prompts) {
    for (const parts of [TAVERN_INTERIOR, COTTAGE_EXTERIOR, BARE_SLAB, undefined]) {
      const r = S.intentCheck(p, parts);
      const proven = S.semanticCheck(p, parts)?.failures ?? [];
      assert.deepEqual(r.hardFailures, proven, `intentCheck invented a gate for: ${p}`);
      for (const c of r.intent.constraints) {
        if (c.strength !== 'hard') continue;
        assert.equal(c.axis, 'enclosure', `axis "${c.axis}" claimed hard strength — only enclosure may`);
      }
    }
  }
});

test('the b4 regression still fails hard through the wider entry point', () => {
  const r = S.intentCheck(B4_PROMPT, COTTAGE_EXTERIOR);
  assert.equal(r.intent.enclosure, 'interior');
  assert.ok(r.hardFailures.length > 0);
  assert.match(r.hardFailures[0], /asked for an INTERIOR but this is built as an exterior/);
});

test('and a correct interior still passes it', () => {
  const r = S.intentCheck(B4_PROMPT, TAVERN_INTERIOR);
  assert.deepEqual(r.hardFailures, []);
});

// =================================================================================================
// Per-axis: positive, negative, ambiguous.
// =================================================================================================

test('enclosure: stated is hard, unstated-but-building is ambiguous and asked about', () => {
  assert.equal(axis(S.extractIntent(B4_PROMPT), 'enclosure')[0].strength, 'hard');

  const amb = S.extractIntent('Build a tavern. Make it look good.');
  assert.equal(amb.enclosure, 'unstated');
  assert.equal(axis(amb, 'enclosure')[0].strength, 'ambiguous');
  assert.ok(amb.questions.some((q) => /tavern/.test(q)), 'ambiguity becomes a question, not a gate');

  // No building noun, nothing stated: silence rather than an invented question.
  assert.deepEqual(axis(S.extractIntent('Make a nice rock'), 'enclosure'), []);
});

test('environment: positive, absent, and a genuine tie', () => {
  assert.deepEqual(values(S.extractIntent('Build a dark cave with a tunnel'), 'environment'), ['underground']);
  assert.deepEqual(values(S.extractIntent('Make a nice rock'), 'environment'), []);
  const tie = axis(S.extractIntent('a cave right on the beach'), 'environment');
  assert.equal(tie.length, 1);
  assert.equal(tie[0].strength, 'ambiguous', 'one keyword each way is a tie, not a winner');
  assert.match(tie[0].value, / or /);
});

test('genre: positive, absent, and a deliberate mix reads as ambiguous', () => {
  assert.deepEqual(values(S.extractIntent('a medieval castle with a blacksmith and a knight'), 'genre'), ['medieval']);
  assert.deepEqual(values(S.extractIntent('Build a box'), 'genre'), []);
  const mix = axis(S.extractIntent('a medieval spaceship'), 'genre');
  assert.equal(mix[0].strength, 'ambiguous');
});

test('genre never gates, however confident it is', () => {
  const i = S.extractIntent('a medieval castle with a blacksmith and a knight and a drawbridge');
  assert.equal(axis(i, 'genre')[0].strength, 'soft');
});

test('purpose: positive and absent', () => {
  assert.deepEqual(values(S.extractIntent('an arena where players fight a boss'), 'purpose'), ['combat']);
  assert.deepEqual(values(S.extractIntent('a shop where players buy and sell'), 'purpose'), ['commerce']);
  assert.deepEqual(values(S.extractIntent('Build a wall'), 'purpose'), []);
});

test('structure: literal architecture only, and furniture is not architecture', () => {
  const i = S.extractIntent('walls with a doorway and windows, a wooden floor');
  const st = values(i, 'structure');
  assert.ok(['wall', 'doorway', 'window', 'floor'].every((v) => st.includes(v)));
  assert.ok(!st.includes('bar'), 'a bar counter is furniture, not structure');
  assert.deepEqual(values(S.extractIntent('Make a nice rock'), 'structure'), []);
  assert.ok(axis(i, 'structure').every((c) => c.strength === 'strong'));
});

test('object: the enumeration the visual critic had to build a whole scene to discover', () => {
  const r = S.intentCheck(B4_PROMPT, undefined);
  for (const want of ['bar counter', 'stools', 'tables', 'chairs', 'fireplace']) {
    assert.ok(r.checklist.includes(want), `"${want}" should be on the checklist — the critic named it by hand`);
  }
  // and the list is deduplicated against the structure lexicon rather than repeating it: the
  // structure scan also found "wall", "window" and "floor", and the richer enumerated phrasing wins.
  assert.deepEqual(r.checklist, [
    'walls', 'doorway', 'windows', 'wooden floor', 'bar counter',
    'stools', 'tables', 'chairs', 'fireplace', 'warm interior lighting',
  ]);
});

test('object: a single-clause request has no enumeration, only a subject', () => {
  const i = S.extractIntent('Make me a nice old-fashioned street lamp I can copy around my town.');
  const objs = axis(i, 'object');
  assert.equal(objs.length, 1);
  assert.match(objs[0].value, /street lamp/);
  assert.equal(objs[0].strength, 'soft', 'an inferred subject is weaker than an enumerated element');
});

test('object: filler in an enumeration is dropped', () => {
  const r = S.intentCheck('Build a cozy bedroom for my roleplay game - bed, desk, wardrobe, a window, that kind of thing.');
  assert.deepEqual(r.checklist, ['bed', 'desk', 'wardrobe', 'window']);
  assert.ok(!r.checklist.some((v) => /kind of thing|make it look/.test(v)));
});

test('zone: multi-valued, and silent when nothing implies one', () => {
  const z = values(S.extractIntent(B4_PROMPT), 'zone');
  assert.ok(z.includes('bar'));
  assert.ok(z.includes('seating'));
  assert.deepEqual(values(S.extractIntent('Build a grey box'), 'zone'), []);
});

test('layout: positive and absent', () => {
  assert.ok(values(S.extractIntent('a tavern with two floors and a mezzanine'), 'layout').includes('multistorey'));
  assert.ok(values(S.extractIntent('stalls arranged in a circle'), 'layout').includes('circular'));
  assert.deepEqual(values(S.extractIntent('a chair'), 'layout'), []);
});

test('flow: positive and absent', () => {
  assert.ok(values(S.extractIntent('players spawn here and walk to the gate'), 'flow').includes('spawnFirst'));
  assert.deepEqual(values(S.extractIntent('a chair'), 'flow'), []);
});

test('style: multi-valued adjectives that can never gate', () => {
  const st = axis(S.extractIntent('a cosy, grimy, dimly lit dark tavern'), 'style');
  const vals = st.map((c) => c.value);
  assert.ok(vals.includes('cosy'));
  assert.ok(vals.includes('grimy'));
  assert.ok(st.every((c) => c.strength === 'soft' || c.strength === 'ambiguous'));
  assert.deepEqual(values(S.extractIntent('a wall'), 'style'), []);
});

test('feature: emphasis is captured, and its absence is not invented', () => {
  const i = S.extractIntent("Build a tavern. Make sure there's a chimney and don't forget the sign.");
  const f = values(i, 'feature');
  assert.ok(f.includes('chimney'));
  assert.ok(f.includes('sign'));
  assert.ok(axis(i, 'feature').every((c) => c.strength === 'strong'));
  assert.deepEqual(values(S.extractIntent('Build a tavern'), 'feature'), []);
});

test('feature emphasis is a warning, not a gate', () => {
  const r = S.intentCheck('Build a plaza. It needs a fountain.', BARE_SLAB);
  assert.ok(r.warnings.some((w) => w.includes('fountain')));
  assert.deepEqual(r.hardFailures, []);
});

test('focal: named beats inferred, inferred is soft, and structure is never focal', () => {
  const named = axis(S.extractIntent('A tavern with a fireplace as the centrepiece.'), 'focal');
  assert.equal(named[0].value, 'fireplace');
  assert.equal(named[0].strength, 'strong');

  const inferred = axis(S.extractIntent(B4_PROMPT), 'focal');
  assert.equal(inferred[0].strength, 'soft');
  assert.equal(inferred[0].value, 'bar counter', 'the eye does not land on "walls" or "a wooden floor"');

  assert.deepEqual(axis(S.extractIntent('walls, a floor and a ceiling'), 'focal'), [], 'all-structure means no focal');
});

test('focal: "focus on the forge" is read forwards as well as backwards', () => {
  assert.equal(axis(S.extractIntent('Build a smithy, focus on the forge'), 'focal')[0].value, 'forge');
});

// =================================================================================================
// Ambiguity: the request did not say, so we ask.
// =================================================================================================

test('a hedged clause downgrades whatever is inside it and raises a question', () => {
  const i = S.extractIntent('A dark dungeon, maybe a fireplace, definitely a locked gate.');
  const fireplace = i.constraints.find((c) => c.value === 'fireplace');
  assert.ok(fireplace, 'the fireplace is still extracted');
  assert.equal(fireplace.strength, 'ambiguous', 'but "maybe" means it is not a spec');
  assert.ok(i.questions.some((q) => q.includes('maybe a fireplace')));

  const gate = i.constraints.find((c) => c.axis === 'feature' && c.value === 'locked gate');
  assert.ok(gate && gate.strength === 'strong', '"definitely" in a different clause is untouched');
});

test('ambiguous constraints never reach the checklist', () => {
  const r = S.intentCheck('A dungeon, maybe a fireplace, and a locked gate.', undefined);
  assert.ok(!r.checklist.includes('fireplace'), 'do not put a maybe on the build checklist');
  assert.ok(r.questions.length > 0);
});

test('hedging cannot soften the proven enclosure gate', () => {
  const r = S.intentCheck('Maybe build a tavern interior, if you like', COTTAGE_EXTERIOR);
  assert.equal(axis(r.intent, 'enclosure')[0].strength, 'hard', 'the geometry gate is not up for negotiation');
  assert.ok(r.hardFailures.length > 0);
});

// =================================================================================================
// Geometry cross-checks. Real, and still only warnings.
// =================================================================================================

test('a roof that was asked for and is not there is a warning, not a failure', () => {
  const r = S.intentCheck('Build a garden shed with a roof and four walls', BARE_SLAB);
  assert.ok(r.warnings.some((w) => /roof or ceiling was asked for/.test(w)));
  assert.deepEqual(r.hardFailures, [], 'a pitched roof over a partial floor is a legitimate build');
});

test('a roof that was excluded and is there is a warning, not a failure', () => {
  const r = S.intentCheck('Build a fighting pit with no roof', TAVERN_INTERIOR);
  assert.equal(r.intent.enclosure, 'unstated', 'the enclosure gate must stay out of this');
  assert.deepEqual(r.hardFailures, []);
  assert.ok(r.warnings.some((w) => /excluded a roof/.test(w)));
});

test('with no geometry the intent still extracts and nothing fails', () => {
  const r = S.intentCheck(B4_PROMPT, undefined);
  assert.equal(r.semantic, null);
  assert.deepEqual(r.hardFailures, []);
  assert.ok(r.checklist.length >= 8, 'the checklist is available before a single part is placed');
});

// =================================================================================================
// The model seam. Nothing calls it; when something does, it cannot gate.
// =================================================================================================

test('model-suggested constraints are capped at soft and tagged', () => {
  const base = S.extractIntent('Build a tavern');
  const merged = S.mergeModelConstraints(base, [
    { axis: 'object', value: 'hanging lantern', confidence: 0.99 },
    { axis: 'enclosure', value: 'interior', confidence: 1 },
  ]);
  const added = merged.constraints.filter((c) => c.source === 'model');
  assert.equal(added.length, 2);
  assert.ok(added.every((c) => c.strength === 'soft'), 'a model may suggest, never gate');
  assert.ok(added.every((c) => c.confidence <= 0.5), 'and never outrank the text extractor');
  assert.equal(merged.enclosure, base.enclosure, 'the proven axis is not overwritten by a suggestion');
});

test('merging is idempotent against what the text already found', () => {
  const base = S.extractIntent(B4_PROMPT);
  const merged = S.mergeModelConstraints(base, [{ axis: 'object', value: 'fireplace' }]);
  assert.equal(merged.constraints.filter((c) => c.value === 'fireplace' && c.axis === 'object').length, 1);
});

test('extraction is pure: the same request gives the same answer', () => {
  const a = JSON.stringify(S.extractIntent(B4_PROMPT));
  const b = JSON.stringify(S.extractIntent(B4_PROMPT));
  assert.equal(a, b);
});

test('every constraint carries auditable evidence', () => {
  for (const c of S.extractIntent(B4_PROMPT).constraints) {
    assert.ok(typeof c.evidence === 'string' && c.evidence.length > 0, `${c.axis}:${c.value} has no evidence`);
    assert.ok(c.confidence > 0 && c.confidence <= 1);
    assert.ok(['text', 'geometry', 'model'].includes(c.source));
  }
});

test('the one-line summary says the useful things and omits the guesses', () => {
  const line = S.intentLine(S.intentCheck(B4_PROMPT, TAVERN_INTERIOR));
  assert.match(line, /interior/);
  assert.match(line, /focal: bar counter/);
  assert.match(line, /10 requested elements/);
  const exc = S.intentLine(S.intentCheck('Build a plaza with no zombies', BARE_SLAB));
  assert.match(exc, /excludes zombies/);
});

test('an empty or junk request produces nothing rather than noise', () => {
  const i = S.extractIntent('');
  assert.deepEqual(i.constraints, []);
  assert.deepEqual(i.questions, []);
  assert.equal(S.intentCheck('', undefined).checklist.length, 0);
});
