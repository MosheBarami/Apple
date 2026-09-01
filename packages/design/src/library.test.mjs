// Tests for the design intelligence library.
//
// The assertion that matters most is the LICENCE one, and it is driven against a
// deliberate violation rather than only against the shipped set. The corpus
// classification found that all 24 free cartoon UI kits and world packs are
// unlicensed DevForum threads, so "learn the grammar, never copy the values" is
// not a style preference here — it is the only lawful route for those categories,
// and a guard that has never been seen to fire cannot be trusted to hold it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { RULES, COMPONENTS, STYLE_FAMILIES, PLATFORMS, PROVENANCE_KINDS, assertLicenceSafety } from './rules.mjs';
import { score, retrieve, composeBrief, coverage } from './retrieve.mjs';

// ------------------------------------------------------------------ shape
test('every rule states an imperative, a reason, and the failure it prevents', () => {
  assert.ok(RULES.length >= 20, `expected a substantive library, got ${RULES.length}`);
  const ids = new Set();
  for (const r of RULES) {
    assert.ok(!ids.has(r.id), `duplicate rule id ${r.id}`);
    ids.add(r.id);
    for (const field of ['rule', 'because', 'prevents']) {
      assert.equal(typeof r[field], 'string', `${r.id} is missing ${field}`);
      // A one-word reason is a rule nobody can transfer to a different genre.
      assert.ok(r[field].length > 25, `${r.id}.${field} is too thin to be useful: ${r[field]}`);
    }
    assert.ok(COMPONENTS.includes(r.component), `${r.id} has unknown component ${r.component}`);
    assert.ok(Array.isArray(r.styleFamilies) && r.styleFamilies.length > 0, `${r.id} claims no style family`);
    for (const f of r.styleFamilies) {
      assert.ok(STYLE_FAMILIES.includes(f), `${r.id} names unknown style family ${f}`);
    }
    assert.ok(PROVENANCE_KINDS.includes(r.provenance?.kind), `${r.id} has no valid provenance kind`);
    assert.ok(r.provenance.source, `${r.id} has no provenance source`);
  }
});

// ------------------------------------------------------------------ the licence line
test('the shipped library carries no licence violation', () => {
  assert.deepEqual(assertLicenceSafety(), []);
});

test('a reference-only rule carrying concrete tokens is REFUSED', () => {
  // The violation, constructed on purpose: this is what copying values out of a
  // source we may only read looks like.
  const bad = [{
    id: 'test.copied-kit-values',
    component: 'panel',
    styleFamilies: ['cartoon-simulator'],
    platforms: ['desktop'],
    rule: 'Use the exact panel metrics from the free cartoon UI pack thread.',
    because: 'They look right and the thread says the pack is free to use.',
    prevents: 'Nothing — this is the failure, not a fix.',
    provenance: { kind: 'reference-only', source: 'an unlicensed DevForum thread' },
    tokens: { cornerRadiusPx: 12, strokePx: 4 },
  }];
  const violations = assertLicenceSafety(bad);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /reference-only/);
  assert.match(violations[0], /cornerRadiusPx/);
});

test('the same rule WITHOUT tokens is allowed — grammar may be learned', () => {
  const okRule = [{
    id: 'test.learned-grammar',
    component: 'panel',
    styleFamilies: ['cartoon-simulator'],
    platforms: ['desktop'],
    rule: 'Cartoon panels use a thick outline and a visible bottom face.',
    because: 'The extrusion is what reads as chunky, independent of the exact values.',
    prevents: 'Flat rectangles that look unfinished.',
    provenance: { kind: 'reference-only', source: 'an unlicensed DevForum thread' },
  }];
  assert.deepEqual(assertLicenceSafety(okRule), []);
});

// ------------------------------------------------------------------ retrieval
test('retrieve rejects a component or family it does not know', () => {
  assert.throws(() => retrieve({ component: 'carousel' }), /unknown component/);
  assert.throws(() => retrieve({ styleFamily: 'vaporwave' }), /unknown style family/);
});

test('an exact component match outranks a cross-cutting one', () => {
  const hits = retrieve({ component: 'modal' });
  assert.ok(hits.length > 0);
  assert.equal(hits[0].rule.component, 'modal', 'a modal query should lead with modal rules');
});

test('scoring is explainable — every point is attributable', () => {
  const modalRule = RULES.find((r) => r.component === 'modal');
  const { points, why } = score(modalRule, { component: 'modal', styleFamily: 'tycoon', platform: 'mobile' });
  assert.ok(points > 0);
  assert.ok(why.some((w) => w.includes('component modal')));
  assert.ok(why.some((w) => w.includes('style tycoon')));
});

test('ranking is deterministic — two identical queries agree', () => {
  const a = retrieve({ component: 'motion', styleFamily: 'cartoon-simulator' }).map((h) => h.rule.id);
  const b = retrieve({ component: 'motion', styleFamily: 'cartoon-simulator' }).map((h) => h.rule.id);
  assert.deepEqual(a, b);
});

test('retrieve rejects a platform it does not know', () => {
  // A typo'd platform scores nothing and therefore looks exactly like "no rule
  // covers this platform" — the one wrong answer this library must never give by
  // accident. The vocabulary is closed so the mistake is loud.
  assert.throws(() => retrieve({ platform: 'console' }), /unknown platform/);
  assert.equal(retrieve({ component: 'nav', platform: 'gamepad' }).length > 0, true);
});

test('the validated bonus is a TIE-BREAK, never an entry ticket', () => {
  // This was a real defect, and it was invisible while the library knew one genre.
  // Awarding +2 unconditionally meant every validated rule cleared minPoints on its
  // own, so a brief for a genre with two rules returned those two followed by ten
  // rules from the simulator — and composeBrief handed the generator all twelve.
  // §L's overfitting failure, arriving through the retrieval layer.
  const horror = retrieve({ styleFamily: 'horror' });
  assert.ok(horror.length > 0, 'horror has rules');
  for (const hit of horror) {
    assert.ok(
      hit.rule.styleFamilies.includes('horror'),
      `${hit.rule.id} matched a horror brief without being a horror rule`,
    );
  }
  // And the mechanism, directly: a validated rule that matches nothing scores zero.
  const validatedElsewhere = RULES.find(
    (r) => r.component === 'modal' && r.provenance.validated && !/not yet/i.test(r.provenance.validated),
  );
  assert.equal(score(validatedElsewhere, { component: 'gauge' }).points, 0);
});

test('a validated rule outranks an identical unvalidated one', () => {
  const base = {
    id: 'z', component: 'panel', styleFamilies: ['cartoon-simulator'], platforms: ['desktop'],
    rule: 'x'.repeat(30), because: 'y'.repeat(30), prevents: 'z'.repeat(30),
  };
  const validated = { ...base, id: 'a', provenance: { kind: 'golem-authored', source: 's', validated: 'rendered' } };
  const written = { ...base, id: 'b', provenance: { kind: 'golem-authored', source: 's', validated: 'not yet built' } };
  const q = { component: 'panel' };
  assert.ok(score(validated, q).points > score(written, q).points, 'seen-to-work must beat written-down');
});

// ------------------------------------------------------------------ the brief
test('composeBrief produces constraints with reasons, not a style adjective', () => {
  const { text, count } = composeBrief({ component: 'modal', styleFamily: 'tycoon' });
  assert.ok(count > 0);
  assert.match(text, /Do not start from a blank ScreenGui/);
  assert.match(text, /why:/);
  assert.match(text, /prevents:/);
});

test('a brief NEVER emits concrete values for a reference-only rule', () => {
  const refOnly = {
    id: 'test.ref', component: 'panel', styleFamilies: ['cartoon-simulator'], platforms: ['desktop'],
    rule: 'r'.repeat(30), because: 'b'.repeat(30), prevents: 'p'.repeat(30),
    provenance: { kind: 'reference-only', source: 'thread' },
    tokens: { secretRadius: 99 },
  };
  const { text } = composeBrief({ component: 'panel' }, { rules: [refOnly] });
  assert.ok(!text.includes('99'), 'a reference-only rule must not leak its values into a generator prompt');
  assert.ok(!text.includes('secretRadius'));
  assert.match(text, /r{10}/, 'but its grammar must still be taught');
});

test('an empty match says so rather than inventing', () => {
  const { text, count } = composeBrief({ component: 'tab', styleFamily: 'horror' }, { minPoints: 99 });
  assert.equal(count, 0);
  assert.match(text, /does not yet cover it/);
});

// ------------------------------------------------------------------ honesty
test('every component the library names now has at least one rule', () => {
  const c = coverage();
  assert.equal(c.total, RULES.length);
  assert.deepEqual(
    c.uncovered.components,
    [],
    'nav, card, counter and tab were the four gaps; if one reopens, say so rather than shipping a silent hole',
  );
});

test('the genre gap is PINNED, not merely non-empty', () => {
  // The first version of this test asserted only `length > 0`. That was enough to
  // stop the gap being closed by deleting the check, and not enough to stop it
  // being closed the way §L actually warns about — by adding a family to a rule
  // that was never written for it, which costs nothing and reads as progress.
  //
  // So the remaining gap is named. Each of these has NO rule because the library
  // has no licence-clear source and no built fixture for it, and §AK is explicit
  // that a rule invented because it sounded plausible is worse than an absence.
  // Covering one of them is welcome — it just has to come with an edit here, and
  // to this list in docs/evidence/2026-09-01-design-intelligence.md.
  //
  // 2026-09-01: social, battleground-fps and dialogue-story were closed from
  // Roblox/creator-docs (CC-BY-4.0) — each with an ENGINE FACT that constrains what a design
  // for that family can do, not with an aesthetic guess. The three that remain are matters of
  // taste, and the one licence-clear source documents behaviour rather than taste. Closing
  // them needs a source that can teach taste and can prove a licence about itself; the corpus
  // classification found none.
  const c = coverage();
  assert.deepEqual(c.uncovered.styleFamilies, [
    'fantasy',
    'sci-fi',
    'modern',
  ]);
});

test('§M is answered: studs/classic is an art language, not one rule', () => {
  // "STUDS / CLASSIC ROBLOX must become a first-class art language — not a texture
  // checkbox." One rule saying "use studs" would satisfy a coverage count and not
  // that sentence, so this asserts the SPREAD: the classic language is only
  // first-class if it says something about surface, colour, material and
  // proportion, which are the four decisions a build actually makes.
  const classic = RULES.filter((r) =>
    r.styleFamilies.some((f) => f === 'studs-classic' || f === 'retro-roblox'),
  );
  assert.ok(classic.length >= 8, `expected a language, got ${classic.length} rule(s)`);
  const ids = classic.map((r) => r.id).join(' ');
  for (const topic of ['surface', 'palette', 'material-variant', 'module', 'ergonomics']) {
    assert.match(ids, new RegExp(topic), `the classic language says nothing about ${topic}`);
  }
});

test('a rule learned from creator-docs cites the exact file, because CC-BY requires it', () => {
  const learned = RULES.filter((r) => r.provenance.kind === 'learned-pattern');
  assert.ok(learned.length > 0, 'the second source should be in use');
  for (const r of learned) {
    assert.match(r.provenance.source, /Roblox\/creator-docs/, `${r.id} is learned from an unnamed source`);
    assert.match(r.provenance.source, /content\/en-us\//, `${r.id} cites the repo but not the file`);
    assert.match(r.provenance.source, /\(CC-BY-4\.0\)/, `${r.id} does not carry the licence`);
  }
});

test('a MIXED source takes the stricter classification, not the kinder one', () => {
  // This assertion exists because the test above caught the case while being
  // written. `studs.surface-language-is-geometry-not-a-texture-flag` reads BOTH
  // creator-docs (CC-BY-4.0, licence-clear) and a DevForum thread (unlicensed).
  // Being partly licence-clear does not make a rule licence-clear: §H's point is
  // that a thread is a claim, so the moment an unlicensed source contributes, the
  // whole rule is `reference-only` and may carry no values. That is the same
  // demotion `capKind()` applies in the corpus intake, held here by a test rather
  // than by whoever writes the next mixed-source rule remembering to.
  const mixed = RULES.filter(
    (r) => /creator-docs/.test(r.provenance.source) && /unlicensed|REFERENCE_ONLY|DevForum/i.test(r.provenance.source),
  );
  assert.ok(mixed.length > 0, 'the mixed-source rule should still be here');
  for (const r of mixed) {
    assert.equal(r.provenance.kind, 'reference-only', `${r.id} was promoted by its licence-clear half`);
    assert.equal(r.tokens, undefined, `${r.id} is reference-only and must carry no values`);
  }
});

test('the library still says out loud how much of it is one game', () => {
  // §L's risk is concentration, and a count is the only honest way to show it.
  // This is not a threshold to pass; it is a number that must stay visible.
  const fromOneGame = RULES.filter((r) => r.provenance.source.includes('crystal-canyon')).length;
  assert.ok(fromOneGame > 0);
  assert.ok(
    fromOneGame < RULES.length,
    'if every rule comes from one game again, the library has stopped generalising',
  );
});
