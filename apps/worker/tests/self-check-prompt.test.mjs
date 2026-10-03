/**
 * THE SELF-CHECK'S ONE RULE IN THE PROMPT: said to a run that was offered `look`, to nobody else, and never ordering a call to a
 * tool the run does not have (the guard in prompt-matches-offered-tools.test.mjs holds the general property; this holds the new rule).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompts.ts';

const BASE = { fenceId: 'f3c0d91a', mode: 'agent', studioConnected: true, placeName: 'Test Place', projectName: 'Test', memorySummary: null, memoryFacts: [] };
const PLAN_AND_VERIFY = ['propose_plan', 'run_and_check', 'audit_build', 'inspect_visually'];

test('a run offered look is told to look at what it built, to fix what is not seen, and to say only what it saw', () => {
  const prompt = systemPrompt({ ...BASE, offeredTools: new Set([...PLAN_AND_VERIFY, 'look']) });
  assert.match(prompt, /call look with `expect`/);
  assert.match(prompt, /several angles, including a player's eye level/);
  assert.match(prompt, /seen, not seen or cannot tell/);
  assert.match(prompt, /Say only what you saw or read back in this run/);
  assert.match(prompt, /say plainly what you did not check/);
});

test('it is said in both shapes of the builder rules: with a plan and without one', () => {
  const planned = systemPrompt({ ...BASE, offeredTools: new Set([...PLAN_AND_VERIFY, 'look']) });
  const unplanned = systemPrompt({ ...BASE, offeredTools: new Set(['look']) });
  assert.match(planned, /FIRST call is propose_plan/);
  assert.match(unplanned, /no build checklist in this session/);
  assert.match(planned, /call look with/);
  assert.match(unplanned, /call look with/);
});

test('a run that was not offered look (the check is off, the plugin cannot render, the user denied it) is not told to call it', () => {
  const prompt = systemPrompt({ ...BASE, offeredTools: new Set(PLAN_AND_VERIFY) });
  assert.doesNotMatch(prompt, /call look with/);
  assert.doesNotMatch(prompt, /\blook\b[^.]*frames your work/);
});

test('the pointer to the player check is made only when the player check is offered', () => {
  const without = systemPrompt({ ...BASE, offeredTools: new Set(['look']) });
  const withIt = systemPrompt({ ...BASE, offeredTools: new Set(['look', 'play_check']) });
  const block = (p) => p.slice(p.indexOf('After you build or change something the user will look at'), p.indexOf('After you build or change something the user will look at') + 700);
  assert.doesNotMatch(block(without), /play_check/);
  assert.match(block(withIt), /play_check shows what a player's screen says/);
});

test('with no offered set given, the rule is not said: the default set is the mode\'s own and names no look', () => {
  assert.doesNotMatch(systemPrompt({ ...BASE }), /call look with/);
});
