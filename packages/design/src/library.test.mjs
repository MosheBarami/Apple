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

import { RULES, COMPONENTS, STYLE_FAMILIES, PROVENANCE_KINDS, assertLicenceSafety } from './rules.mjs';
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
test('coverage reports the gaps rather than implying completeness', () => {
  const c = coverage();
  assert.equal(c.total, RULES.length);
  assert.ok(Array.isArray(c.uncovered.components));
  assert.ok(Array.isArray(c.uncovered.styleFamilies));
  // §L asks for many genres. The library does not have them yet, and the point of
  // this assertion is that the gap stays VISIBLE rather than being quietly closed
  // by adding families to rules that were never written for them.
  assert.ok(c.uncovered.styleFamilies.length > 0, 'if this ever passes, genre coverage is real — update the note');
});
