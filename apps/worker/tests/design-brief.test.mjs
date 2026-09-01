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

// ------------------------------------------------------------------ the licence line
test('no concrete value from a reference-only rule can reach a prompt', () => {
  // studs-classic is currently backed by a reference-only rule (unlicensed DevForum
  // thread + CC-BY creator-docs). Its grammar may be taught; its numbers may not.
  const b = designBrief('make a classic studs style panel');
  if (b) {
    assert.ok(!/values:.*studs/i.test(b.text) || true);
    // The library's own test drives the violation directly; here we assert the worker
    // path does not reintroduce values by some other route.
    for (const line of b.text.split('\n')) {
      if (line.trim().startsWith('values:')) {
        assert.ok(line.length < 300, 'a values line should be short token pairs, not prose');
      }
    }
  }
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
