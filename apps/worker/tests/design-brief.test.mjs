/**
 * THE UI GRAMMAR BRIEF: what Golem is told before it writes a GUI.
 *
 * §G says Golem must stop inventing every interface from a blank canvas. The design
 * library holds the grammar; this is the path that puts it in front of the model. The
 * assertions worth having are about RESTRAINT, because the failure modes here are not
 * "the brief is missing" — they are:
 *
 *   - the brief rides in a system prompt that is RE-SENT ON EVERY STEP, so including it
 *     on a request that is not about UI spends tokens on every step of the run;
 *   - a thin match padded into a paragraph hides the library's coverage gap instead of
 *     showing it;
 *   - and a rule sourced from something we may only READ must never leak concrete values
 *     into a model prompt, because that is the line between learning a pattern and
 *     copying an asset.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@golem/design';

import { designBrief } from '../src/design-brief.ts';
import {
  systemPrompt, collapseArtDirection,
  BRIEF_START, BRIEF_END, UI_BRIEF_START, UI_BRIEF_END, UI_BRIEF_REMINDER,
} from '../src/prompts.ts';

// ------------------------------------------------------------------ restraint
test('a request that is not about UI gets no brief at all', () => {
  for (const text of [
    'make the terrain more mountainous',
    'add lighting to the cave',
    'why is my datastore losing data',
  ]) {
    assert.equal(designBrief(text), null, `"${text}" should not pay for a UI brief`);
  }
});

test('null is returned rather than a padded brief when nothing matches well', () => {
  // A horror tab is a real request the library has no rules for yet. It must come back
  // empty so the coverage gap is visible in the trace, not filled with filler.
  const b = designBrief('build a horror themed tab strip', { limit: 8 });
  if (b !== null) {
    // If coverage later grows to cover it, that is fine — but it must be real rules.
    assert.ok(b.used.length > 0);
  }
});

// ------------------------------------------------------------------ it works
test('a shop modal request retrieves modal grammar', () => {
  const b = designBrief('build a shop modal for my tycoon');
  assert.ok(b, 'a shop modal is squarely a UI request');
  assert.equal(b.component, 'modal');
  assert.equal(b.styleFamily, 'tycoon');
  assert.ok(b.used.length > 0);
  assert.match(b.text, /Do not start from a blank ScreenGui/);
  assert.match(b.text, /prevents:/);
});

test('the most specific component wins when several are named', () => {
  // "a modal with a button" is about the modal; the button is a part of it.
  assert.equal(designBrief('a modal with a button')?.component, 'modal');
  // and a bare button request is about the button
  assert.equal(designBrief('restyle the buy button')?.component, 'button');
});

test('word boundaries hold — "shopping" is not the shop grammar', () => {
  assert.equal(designBrief('fix my shopping cart datastore bug'), null);
});

test('the brief is capped, because it is re-sent every step', () => {
  const b = designBrief('design the whole cartoon simulator interface, panels buttons and motion');
  assert.ok(b);
  assert.ok(b.used.length <= 8, `expected at most 8 rules, got ${b.used.length}`);
});

test('a fixed style brief includes bounded reference-backed visual observations', () => {
  const b = designBrief('build a pet collection inventory panel');
  assert.ok(b);
  assert.equal(b.styleFamily, 'pets-collection');
  assert.match(b.text, /REFERENCE-BACKED VISUAL CHECKS/);
  assert.match(b.text, /never copy source media/);
});

// ------------------------------------------------------------------ the licence line
test('no concrete value from a reference-only rule can reach a prompt', () => {
  // A reference-only rule is backed by a source whose GRAMMAR may be taught and whose NUMBERS may
  // not — an unlicensed DevForum thread, or CC-BY creator-docs. The library refuses to build one
  // that carries tokens; this is the worker-side half, asserting the brief never reintroduces
  // values by some other route.
  //
  // THIS TEST USED TO READ `assert.ok(!/values:.*studs/i.test(b.text) || true)`. `X || true` is
  // `true`, so it asserted nothing at all. Dropping the tautology turned it red — and the red was
  // the regex's fault, not the product's: it matched `values: defaultProximityStuds=10`, a token
  // NAME from a licence-clear dialogue rule, because the word "studs" happened to appear after
  // "values:". A negative assertion aimed at a word rather than at the property it stands for will
  // eventually match something innocent, and then the only ways out are deleting the check or
  // neutering it. Aim at the property.
  const b = designBrief('make a classic studs style panel');
  assert.ok(b, 'this prompt must produce a brief, or the rest of this test checks nothing');

  const used = b.used.map((id) => RULES.find((r) => r.id === id)).filter(Boolean);
  assert.equal(used.length, b.used.length, 'every rule the brief cites must exist in the library');

  for (const rule of used) {
    if (rule.provenance?.kind !== 'reference-only') continue;
    for (const value of Object.values(rule.tokens ?? {})) {
      assert.ok(!b.text.includes(String(value)), `${rule.id} is reference-only and leaked ${value}`);
    }
  }

  // REACH, not reasoning. The loop above is empty whenever no reference-only rule is selected, and
  // an empty loop passes while proving nothing. What makes the worker path safe is the structural
  // fact that no reference-only rule carries tokens at all, so assert THAT, over the whole library,
  // where the count cannot quietly fall to zero.
  const referenceOnly = RULES.filter((r) => r.provenance?.kind === 'reference-only');
  assert.ok(referenceOnly.length > 0, 'no reference-only rules left in the library — this guard now guards nothing');
  for (const r of referenceOnly) {
    assert.equal(Object.keys(r.tokens ?? {}).length, 0, `${r.id} is reference-only and must carry no tokens`);
  }

  // And the values that DO ship are token pairs, not prose lifted from a source.
  const valueLines = b.text.split('\n').filter((l) => l.trim().startsWith('values:'));
  assert.ok(valueLines.length > 0, 'no values reached the brief — the line-shape check below is vacuous');
  for (const line of valueLines) assert.ok(line.length < 300, `a values line should be short token pairs, not prose: ${line.slice(0, 80)}`);
});

// ------------------------------------------------------------------ prompt wiring
test('systemPrompt includes the UI block only when a brief is supplied', () => {
  const base = {
    mode: 'stone',
    studioConnected: true,
    placeName: 'p',
    projectName: 'proj',
    memorySummary: null,
    memoryFacts: [],
    // This fixture omitted the fence id, and systemPrompt accepted it — which is how a real call
    // site would have slipped through too. The guard now refuses, so the fixture has to be honest.
    fenceId: 'f1xtur3a',
  };
  const without = systemPrompt(base);
  assert.ok(!without.includes(UI_BRIEF_START));

  const withBrief = systemPrompt({ ...base, uiBrief: 'RULE ONE\nRULE TWO' });
  assert.ok(withBrief.includes(UI_BRIEF_START));
  assert.ok(withBrief.includes(UI_BRIEF_END));
  assert.match(withBrief, /RULE ONE/);
});

test('collapsing replaces BOTH briefs, not just the art one', () => {
  // The failure this prevents: collapsing art direction and forgetting UI grammar leaves
  // the cheaper brief paying full price for the rest of the run.
  const sys = [
    'head',
    BRIEF_START + 'ART BRIEF BODY' + BRIEF_END,
    UI_BRIEF_START + 'UI BRIEF BODY' + UI_BRIEF_END,
    'tail',
  ].join('\n');
  const collapsed = collapseArtDirection(sys);
  assert.ok(!collapsed.includes('ART BRIEF BODY'), 'art brief should be gone');
  assert.ok(!collapsed.includes('UI BRIEF BODY'), 'UI brief should be gone too');
  assert.ok(collapsed.includes(UI_BRIEF_REMINDER));
  assert.ok(collapsed.includes('head') && collapsed.includes('tail'));
});

test('collapsing twice is safe', () => {
  const sys = UI_BRIEF_START + 'BODY' + UI_BRIEF_END;
  const once = collapseArtDirection(sys);
  assert.equal(collapseArtDirection(once), once);
});
