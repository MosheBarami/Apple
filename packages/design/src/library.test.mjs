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
  // for that family can do, not with an aesthetic guess. The three that remained were matters
  // of taste, and creator-docs documents behaviour rather than taste.
  //
  // 2026-09-01, later: `modern` closed from the second corpus — synthetic (Apache-2.0),
  // onyx-ui, cyan-ui and Iris (MIT), which are the modern idiom as practised in Roblox UI
  // rather than descriptions of it. Six rules carry the family, and each was kept because its
  // CONTENT would be different in a cartoon-simulator: a modular scale, surface/on-surface
  // colour pairing, elevation as a diminishing tone step, type steps as bundles, a total
  // interaction-state map, and press moving opposite to hover. A cartoon simulator gets depth
  // from strokes and drop shadows, so the tone-step rule is not a neutral truth wearing a
  // family label.
  //
  // The merge ARRIVED claiming `modern` on 25 rules and `fantasy` on 3, which is exactly the
  // cheap close this test was written against. Nineteen `modern` claims were stripped as
  // decoration on genre-neutral mechanics (GUI-inset arithmetic, z-order banding, UIScale
  // resolution). All three `fantasy` claims were stripped: they are asset-SOURCING hygiene
  // rules and none of them says what fantasy looks like.
  //
  // So `fantasy` and `sci-fi` remain open, and closing either still needs a source that can
  // teach taste in that genre and prove a licence about itself.
  const c = coverage();
  assert.deepEqual(c.uncovered.styleFamilies, [
    'fantasy',
    'sci-fi',
  ]);
});

test('`modern` is closed by rules that TEACH it, not by rules that merely list it', () => {
  // The list above is a name check; this is the content check behind it. Deleting the six
  // rules' bodies and keeping their family labels would pass the assertion above and would
  // mean the library knows nothing about the genre. So: the modern rules must say something
  // about colour, type, depth and state — the decisions that separate the idiom from a
  // cartoon HUD — and they must come from the kits, not from Crystal Canyon.
  const modern = RULES.filter((r) => r.styleFamilies.includes('modern'));
  assert.ok(modern.length >= 6, `expected a language, got ${modern.length} rule(s)`);
  const ids = modern.map((r) => r.id).join(' ');
  for (const topic of ['scale-step', 'surface-colour', 'type-step', 'depth', 'interaction-states']) {
    assert.match(ids, new RegExp(topic), `the modern language says nothing about ${topic}`);
  }
  for (const r of modern) {
    assert.equal(r.provenance.kind, 'learned-pattern', `${r.id} claims modern but was authored here`);
  }
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

test('every learned rule names its repo, its licence, and the path it was read at', () => {
  // This test used to require `Roblox/creator-docs` by name, because that was the only
  // licence-clear source in the corpus. Eleven more arrived, and the requirement it was
  // really making is source-agnostic: a rule that claims to have LEARNED something must say
  // from what, under what licence, and at which path — otherwise "learned-pattern" is an
  // assertion nobody can check, and the licence boundary this library enforces on `tokens`
  // rests on a provenance string nobody verified.
  //
  // The path may be a file or a directory. Four icon rules were measured ACROSS a directory
  // (134 files sharing one keyline), and naming a single arbitrary file out of that set would
  // be less honest than naming the set.
  const REPO = /[\w.-]+\/[\w.-]+/;
  const LICENCE = /\((MIT|Apache-2\.0|ISC|Unlicense|CC-BY-4\.0)[^)]*\)/;
  const PATH = /[\w.-]+\/[\w.-]+|[\w.-]+\.(lua|luau|md|sh|py|rbxm)/;

  const learned = RULES.filter((r) => r.provenance.kind === 'learned-pattern');
  assert.ok(learned.length > 0, 'the second source should be in use');
  for (const r of learned) {
    assert.match(r.provenance.source, REPO, `${r.id} is learned from an unnamed source`);
    assert.match(r.provenance.source, LICENCE, `${r.id} does not carry the licence it was read under`);
    assert.ok(
      PATH.test(r.provenance.source) || PATH.test(r.provenance.validated),
      `${r.id} names a repo but never says what was read inside it`,
    );
  }

  // CC-BY is stricter than MIT here: attribution to the specific work is a CONDITION of the
  // licence rather than good manners, so a creator-docs rule must cite the file in `source`
  // itself, where the citation travels with the rule.
  for (const r of learned.filter((x) => /creator-docs/.test(x.provenance.source))) {
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

// ------------------------------------------------------------- progression
test('the progression rule states arithmetic that is actually true', () => {
  // The rule's `because` carries three concrete numbers — 4.7x at growth 1.15,
  // 15x at 1.28, 643x at 1.8 — and a claim nobody can check is a claim that will
  // drift. This recomputes them from the formula the rule itself names.
  const lastOverFirst = (growth, levels) => growth ** (levels - 1);
  assert.equal(lastOverFirst(1.15, 12).toFixed(1), '4.7');
  assert.equal(lastOverFirst(1.28, 12).toFixed(0), '15');
  assert.equal(lastOverFirst(1.8, 12).toFixed(0), '643');

  const rule = RULES.find((r) => r.id === 'progression.cost-growth-is-shallow-over-many-levels-not-steep-over-few');
  assert.ok(rule.because.includes('4.7x'), 'the rule must still quote the figure this test pins');
  assert.ok(rule.because.includes('643x'));
  // And the token range must bracket the source's own observed rates.
  assert.equal(rule.tokens.growthPerLevel, '1.15 to 1.30');
  for (const observed of [1.15, 1.18, 1.22, 1.25, 1.28]) {
    assert.ok(observed >= 1.15 && observed <= 1.3, `${observed} falls outside the range the rule advertises`);
  }
});

test('progression rules are retrievable by their own brief and leak into no other', () => {
  // `progression` is the first non-visual component in the library. It must not
  // start appearing in panel or button briefs, where it would push out grammar the
  // generator actually needs — the overfitting failure retrieve.mjs already guards.
  const wanted = retrieve({ component: 'progression', styleFamily: 'tycoon' });
  const top = wanted.slice(0, 3).map((h) => h.rule.component);
  assert.deepEqual(top, ['progression', 'progression', 'progression'], 'a progression brief must rank them first');

  for (const component of ['panel', 'button', 'toast', 'modal', 'counter', 'nav']) {
    const leaked = retrieve({ component }).filter((h) => h.rule.component === 'progression');
    assert.deepEqual(leaked, [], `progression rules leaked into a ${component} brief`);
  }
});

test('a rule learned from a shipped game does not claim to be documented behaviour', () => {
  // Weaker evidence, described as weaker. One team's balance decisions are not a
  // measured genre consensus, and `validated` is where that distinction lives —
  // retrieve() reads it for its +2, so overstating it would also mis-rank them.
  const fromGame = RULES.filter((r) => /slime-factory-tycoon/.test(r.provenance.source ?? ''));
  assert.ok(fromGame.length >= 3);
  for (const r of fromGame) {
    assert.equal(r.provenance.kind, 'learned-pattern');
    assert.match(r.provenance.source, /@[0-9a-f]{10} .+ \(MIT\)$/, 'must pin a SHA and name its licence');
    assert.match(r.provenance.validated, /observed in one shipped tycoon/);
    assert.ok(!/genre standard|consensus|every tycoon/i.test(r.rule), 'n=1 cannot establish a genre consensus');
  }
});
