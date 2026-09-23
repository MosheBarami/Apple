/**
 * The scorer that decided "training bought nothing on game logic" had no test saying it could
 * ever report a pass.
 *
 * `eval-v4` reported game-logic 0/8 for the BASE and 0/8 for the ADAPTER. Two identical zeroes on
 * the same track have two possible causes and the totals cannot tell them apart: either both
 * models genuinely fail, or `scoreGameLogic` cannot observe a success at all — a wrong wrapper, a
 * checks fragment that never runs, a harness that is missing. A failure to observe must not render
 * as an observation, so the zero is not usable evidence until the scorer has been seen going
 * green.
 *
 * These tests fix that in both directions, on the real curriculum rather than a fixture:
 *
 *   - every held-out example's OWN reference source, fenced exactly as a model would emit it,
 *     scores `ok` — so a pass is reachable and the 0/8 is the models, not the pipe;
 *   - each refusal reason is reachable from an input that deserves it — so a scorer that simply
 *     answered `ok` to everything would fail here too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { scoreGameLogic, scoreTrajectory, extractToolCall, fencedLuau } from './score-eval.mjs';

/** The ids eval-v4 held out, named rather than sampled so the test pins the run it explains. */
const HELD_OUT = [
  'unlock-prerequisites', 'weighted-selection', 'grid-cell-position', 'scrollbar-thumb',
  'honest-percent', 'remap-range', 'snap-slider-value', 'notification-queue',
];

const byId = new Map(ALL_GAME_LOGIC_CURRICULUM.map((e) => [e.id, e]));
const fenced = (source) => '```luau\n' + source + '\n```';

test('every held-out example is still in the curriculum the scorer reads', () => {
  for (const id of HELD_OUT) assert.ok(byId.has(id), `${id} is not in ALL_GAME_LOGIC_CURRICULUM`);
});

test('the reference source passes its own checks — so scoreGameLogic can report a pass', () => {
  for (const id of HELD_OUT) {
    const example = byId.get(id);
    const outcome = scoreGameLogic(example, fenced(example.source));
    assert.equal(outcome.ok, true, `${id}: reference source scored ${outcome.reason}`);
  }
});

test('an answer that is right for a DIFFERENT example fails — the checks are the example\'s own', () => {
  const [a, b] = [byId.get(HELD_OUT[0]), byId.get(HELD_OUT[1])];
  const outcome = scoreGameLogic(a, fenced(b.source));
  assert.equal(outcome.ok, false);
});

test('each refusal is reachable, so a green is a green rather than the only answer', () => {
  const example = byId.get('honest-percent');
  assert.equal(scoreGameLogic(example, 'here is how you would do it, in prose').reason, 'no_code_block');
  assert.equal(scoreGameLogic(example, fenced('return function( end')).reason, 'does_not_parse');
  // Right shape, one arithmetic constant wrong: exactly what apple-v4 produced for this example.
  const nearMiss = 'return function(value, maximum)\n  if maximum <= 0 then return nil end\n  return math.min(100, math.max(0, value / maximum * 99))\nend';
  assert.equal(scoreGameLogic(example, fenced(nearMiss)).reason, 'fails_own_checks');
});

test('fencedLuau takes the first block and ignores the prose around it', () => {
  assert.equal(fencedLuau('talk\n```luau\nreturn 1\n```\nmore'), 'return 1');
  assert.equal(fencedLuau('no block here'), null);
});

test('a trajectory scores against a registry, and every refusal reason is reachable', () => {
  const registry = { TOOLS: { real_tool: { def: { parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } } } };
  assert.equal(scoreTrajectory(null, registry).reason, 'no_tool_call');
  assert.equal(scoreTrajectory(extractToolCall('{"name":"made_up","parameters":{}}'), registry).reason, 'tool_does_not_exist');
  assert.equal(scoreTrajectory(extractToolCall('{"name":"real_tool","parameters":{}}'), registry).reason, 'arguments_rejected');
  assert.equal(scoreTrajectory(extractToolCall('{"name":"real_tool","parameters":{"path":"a.lua"}}'), registry).ok, true);
});

// A valid call is not a styled one: the visual gauntlet failed on calls the registry accepted
// (no outline, no gradient, default font, flat lighting). styleRecall scores how much of the
// reference call's craft the produced call carries.
test('styleFeatures reads the craft a call carries, and styleRecall compares it with the reference', async () => {
  const { styleFeatures, styleRecall } = await import('./score-eval.mjs');
  const ref = {
    name: 'create_instances',
    args: { items: [{ className: 'TextButton', props: { Font: { t: 'EnumItem', v: 'Enum.Font.FredokaOne' } }, children: [{ className: 'UIStroke' }, { className: 'UIGradient' }] }] },
  };
  assert.deepEqual([...styleFeatures(ref)].sort(), ['class:TextButton', 'class:UIGradient', 'class:UIStroke', 'font:Enum.Font.FredokaOne']);
  assert.deepEqual([...styleFeatures({ name: 'set_mood', args: { mood: 'golden' } })], ['mood:golden']);
  assert.deepEqual([...styleFeatures({ name: 'edit_terrain', args: { operations: [{ action: 'fill_ball' }] } })], ['op:fill_ball']);
  assert.equal(styleRecall(ref, ref), 1);
  const bare = { name: 'create_instances', args: { items: [{ className: 'TextButton' }] } };
  assert.equal(styleRecall(ref, bare), 0.25);
  assert.equal(styleRecall(ref, null), 0);
  assert.equal(styleRecall({ name: 'run_spec', args: { name: 'x' } }, bare), null, 'a call with no craft features is not a visual row');
});

// A trajectory's last turn is the prose wrap-up, not a call. Counting "no tool call" there as a
// miss scored the right behaviour as wrong and hid an adapter that invents tools instead of finishing.
test('scoreFinish passes a prose wrap-up and fails an invented call', async () => {
  const { scoreFinish } = await import('./score-eval.mjs');
  assert.deepEqual(scoreFinish('SideRail is on the left edge, vertically centred.'), { ok: true });
  assert.equal(scoreFinish('{"name": "get_screenshot", "parameters": {}}').reason, 'called_a_tool_instead_of_finishing');
});
