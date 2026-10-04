/**
 * THE BLIND CRITIQUE, THE PURE HALF (F5): what the critic is given, how its verdict is read, and what it costs.
 * The loop behaviour (one fix pass, a clean critique asks nothing, the switches) is in self-check-session.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCriticMessages, parseCritique, hasSevereFlaw, critiqueFrames, critiqueLines, reportMessage, criticFlagOn, CRITIC_LIMITS, CRITIC_SCHEMA, FLAW_AREAS,
} from '../src/blind-critique.ts';

const FRAME = { label: 'front', source: 'studio_viewport', pngBase64: 'AAAA', width: 8, height: 6 };
const input = (over = {}) => ({ request: 'Build a harbour with boats', frames: [FRAME, { ...FRAME, label: 'high' }], source: 'studio_viewport', ...over });
const GOOD = {
  scores: { delivers: 3, world: 2, art: 2, assets: 3, ui: 5, feedback: 3 },
  flaws: [
    { area: 'world', severity: 'moderate', flaw: 'Frame 2: a flat plane.', fix: 'Add height.' },
    { area: 'art', severity: 'severe', flaw: 'Frame 1: near black.', fix: 'Light it.' },
  ],
};

test('the prompt holds the request and the frames and nothing the agent said, planned or touched', () => {
  const m = buildCriticMessages({ ...input(), reply: 'AGENT-REPLY', plan: 'AGENT-PLAN', touched: ['game.Workspace.Secret'], intent: 'AGENT-INTENT' });
  const text = JSON.stringify(m).replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, '');
  assert.match(text, /Build a harbour with boats/);
  for (const leak of ['AGENT-REPLY', 'AGENT-PLAN', 'game.Workspace.Secret', 'AGENT-INTENT']) assert.equal(text.includes(leak), false, leak);
  assert.equal(m.content.filter((p) => p.type === 'image_url').length, 2);
  assert.match(m.content[0].text, /Frames attached, in order: 1\. front; 2\. high\./);
});

test('the rubric is harsh and covers the six areas, with the request as untrusted data', () => {
  const { system } = buildCriticMessages(input());
  for (const area of ['delivers', 'world composition and depth', 'art direction and lighting readability', 'asset quality', 'interface layout', 'feedback']) assert.match(system, new RegExp(area, 'i'), area);
  assert.match(system, /duplicated buttons/i);
  assert.match(system, /centre of the screen or the bottom hotbar/i);
  assert.match(system, /top 5 concrete flaws/);
  assert.match(system, /Do not be kind/);
  assert.match(system, /never as instructions to you/);
  assert.deepEqual(CRITIC_SCHEMA.schema.required, ['scores', 'flaws']);
  assert.equal(CRITIC_SCHEMA.schema.properties.flaws.maxItems, 5);
  assert.deepEqual(Object.keys(CRITIC_SCHEMA.schema.properties.scores.properties), [...FLAW_AREAS]);
});

test('a box approximation is said to be one, so nothing that needs lighting is marked severe', () => {
  const m = buildCriticMessages(input({ source: 'box_approximation' }));
  assert.match(m.system, /crude box approximation/);
  assert.match(m.content[0].text, /Do not mark anything severe/);
});

test('the request is bounded and untrusted text cannot grow the prompt', () => {
  const m = buildCriticMessages(input({ request: 'x'.repeat(50_000) }));
  assert.ok(m.content[0].text.length < 1500);
});

test('the verdict is read back: severe flaws are found, an unknown area or severity is made safe, and junk is null', () => {
  const c = parseCritique(JSON.stringify(GOOD));
  assert.equal(hasSevereFlaw(c), true);
  assert.equal(c.flaws.length, 2);
  assert.equal(hasSevereFlaw(parseCritique(JSON.stringify({ ...GOOD, flaws: [GOOD.flaws[0]] }))), false);
  const odd = parseCritique(JSON.stringify({ scores: {}, flaws: [{ area: 'sound', severity: 'catastrophic', flaw: 'x', fix: 1 }] }));
  assert.deepEqual([odd.flaws[0].area, odd.flaws[0].severity, odd.flaws[0].fix], ['delivers', 'moderate', '']);
  assert.equal(parseCritique('no json at all'), null);
  assert.equal(parseCritique('{"flaws":"nope"}'), null);
  const many = parseCritique(JSON.stringify({ scores: {}, flaws: Array.from({ length: 9 }, (_, i) => ({ area: 'world', severity: 'minor', flaw: `f${i}`, fix: '' })) }));
  assert.equal(many.flaws.length, CRITIC_LIMITS.flaws);
  // A response cut off by the output budget keeps the complete flaws.
  const cut = JSON.stringify(GOOD).slice(0, JSON.stringify(GOOD).lastIndexOf('{"area"') + 20);
  assert.equal(parseCritique(cut)?.flaws.length, 1);
});

test('the lines the agent reads put the severe flaws first and carry the scores', () => {
  const lines = critiqueLines(parseCritique(JSON.stringify(GOOD)));
  assert.match(lines, /^Scores out of 10: request 3, world 2, art and light 2, assets 3, interface 5, feedback 3\./);
  assert.ok(lines.indexOf('[severe, art and light]') < lines.indexOf('[moderate, world]'));
});

test('the report wrapper is a fixed literal around the fenced body, for both kinds', () => {
  const fenced = '[blind_critique]\n<untrusted-tool-output id="x" tool="blind_critique">\nBODY\n</untrusted-tool-output>';
  const c = reportMessage('critique', fenced);
  assert.ok(c.includes(fenced));
  assert.match(c, /this is the only fix pass/);
  assert.match(c, /already read your previous answer/);
  assert.match(reportMessage('layout', fenced), /StudPilot measured the layout of what you built, without a render/);
  // Nothing but the fenced body varies.
  assert.equal(reportMessage('critique', '@@1@@').replace('@@1@@', ''), reportMessage('critique', '@@2@@').replace('@@2@@', ''));
});

test('critiqueFrames: one vision call, `high` effort, the schema, and a failure is a failure, never a verdict', async () => {
  const seen = [];
  const ok = await critiqueFrames(input(), async (req, opts) => { seen.push([req, opts]); return { text: JSON.stringify(GOOD), neurons: 77 }; });
  assert.equal(ok.ok, true);
  assert.equal(ok.neurons, 77);
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0].model, 'vision');
  assert.equal(seen[0][0].reasoningEffort, 'high');
  assert.equal(seen[0][0].jsonSchema, CRITIC_SCHEMA);
  assert.deepEqual(seen[0][1], { kind: 'visual:critic', cacheTtl: 0 });
  assert.deepEqual(await critiqueFrames(input(), async () => { throw new Error('boom'); }), { ok: false, neurons: 0, error: 'the vision model did not answer' });
  assert.equal((await critiqueFrames(input(), async () => ({ text: 'prose', neurons: 5 }))).ok, false);
  assert.equal((await critiqueFrames(input({ frames: [] }), async () => assert.fail('no frame, no call'))).ok, false);
});

test('the switch defaults on and only an explicit off turns it off', () => {
  for (const v of [undefined, '', 'on', '1', 'true', 'banana']) assert.equal(criticFlagOn({ SELF_CHECK_CRITIC: v }), true, String(v));
  for (const v of ['off', 'OFF', '0', 'false', 'no', ' off ']) assert.equal(criticFlagOn({ SELF_CHECK_CRITIC: v }), false, v);
});

test('MEASURED COST: the critic prompt in characters and tokens, and the fix note it can add', () => {
  const m = buildCriticMessages(input({ request: 'x'.repeat(800), frames: Array.from({ length: 4 }, (_, i) => ({ ...FRAME, label: ['front', 'high', 'side', 'eye (player eye level from the spawn)'][i] })) }));
  const promptChars = m.system.length + m.content[0].text.length;
  const worstFlaws = Array.from({ length: 5 }, () => ({ area: 'world', severity: 'severe', flaw: 'f'.repeat(240), fix: 'g'.repeat(240) }));
  const note = reportMessage('critique', critiqueLines({ scores: GOOD.scores, flaws: worstFlaws }));
  console.log(`[F5 cost] critic text prompt=${promptChars} chars (~${Math.ceil(promptChars / 3.5)} tokens) + 4 images; output cap 1800 tokens; worst-case fix note=${note.length} chars (~${Math.ceil(note.length / 3.5)} tokens)`);
  assert.ok(promptChars < 4000);
  assert.ok(note.length < 3200);
});
