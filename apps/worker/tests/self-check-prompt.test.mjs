/**
 * THE SELF-CHECK'S ONE RULE IN THE PROMPT: the product has no vision, so every builder run is told it cannot see pictures and may
 * say only what it read back, measured or played. The rule never orders a call to a tool the run does not have (the guard in
 * prompt-matches-offered-tools.test.mjs holds the general property; this holds the rule itself).
 *
 * RESTATED in M4: this file used to hold the rule that told a run offered `look` to look at what it built. The look is gone; the
 * honesty half of that rule stays and is now said to every builder run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompts.ts';

const BASE = { fenceId: 'f3c0d91a', mode: 'agent', studioConnected: true, placeName: 'Test Place', projectName: 'Test', memorySummary: null, memoryFacts: [] };
const PLAN_AND_VERIFY = ['propose_plan', 'run_and_check', 'audit_build', 'check_composition'];

test('a builder run is told it cannot see pictures and may say only what it read back, measured or played', () => {
  const prompt = systemPrompt({ ...BASE, offeredTools: new Set(PLAN_AND_VERIFY) });
  assert.match(prompt, /You cannot see pictures, so never say how something looks on screen/);
  assert.match(prompt, /Say only what you read back, measured or played in this run/);
  assert.match(prompt, /say plainly what you did not check/);
});

test('it is said in both shapes of the builder rules: with a plan and without one', () => {
  const planned = systemPrompt({ ...BASE, offeredTools: new Set(PLAN_AND_VERIFY) });
  const unplanned = systemPrompt({ ...BASE, offeredTools: new Set(['run_and_check']) });
  assert.match(planned, /FIRST call is propose_plan/);
  assert.match(unplanned, /no build checklist in this session/);
  assert.match(planned, /You cannot see pictures/);
  assert.match(unplanned, /You cannot see pictures/);
});

test('no prompt names a look tool or orders a look: there is none to call', () => {
  for (const offeredTools of [new Set(PLAN_AND_VERIFY), new Set(['run_and_check', 'play_check']), undefined]) {
    const prompt = systemPrompt({ ...BASE, ...(offeredTools ? { offeredTools } : {}) });
    assert.doesNotMatch(prompt, /call look\b|inspect_visually|judge_game|blind critique/i);
    assert.doesNotMatch(prompt, /\bLOOK at it\b/, 'the old "then LOOK at it with render_view" order is gone');
  }
});
