/**
 * LOOK, THE VISION HALF: frames in, OBSERVATIONS out — never a score.
 *
 * The owner's directive is that the harness gives information and checks, and the agent decides what looks good and
 * what fits. So what the vision role is asked for is what it SEES: for each thing the request expects, seen / not
 * seen / cannot tell. A number would be the harness deciding quality; an unsupported "seen" would be the failure this
 * whole milestone exists to stop. The cheap way to be wrong here is flattery, so the prompt prefers "cannot tell".
 *
 * The model call is injected, so everything below runs with no model and no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { OBSERVE_SCHEMA, buildObserveMessages, parseObservation, observeFrames, LOOK_FRAME_MAX } from '../src/look-observe.ts';

const png = (n = 1) => ({ label: `view ${n}`, source: 'studio_viewport', pngBase64: 'iVBORw0KGgo=', width: 320, height: 180 });
const reply = (obj) => ({ text: JSON.stringify(obj), neurons: 123 });
const calls = [];
const fakeChat = (answer) => async (req, opts) => {
  calls.push({ req, opts });
  if (answer instanceof Error) throw answer;
  return typeof answer === 'function' ? answer(req) : answer;
};
const base = { request: 'a small garden with a fountain', expect: ['a fountain in the middle', 'a path to the gate'], questions: [], frames: [png(1), png(2)], source: 'studio_viewport', touched: [] };

test('the schema asks for observations and has no score, grade or rating anywhere in it', () => {
  const text = JSON.stringify(OBSERVE_SCHEMA);
  assert.doesNotMatch(text, /score|grade|rating|quality|\"passed\"/i);
  const verdicts = OBSERVE_SCHEMA.schema.properties.observations.items.properties.verdict.enum;
  assert.deepEqual([...verdicts].sort(), ['cannot_tell', 'not_seen', 'seen']);
});

test('the prompt says what a look is for: observations, no score, prefer "cannot tell", untrusted text stays data', () => {
  const { system, content } = buildObserveMessages(base);
  assert.match(system, /observ/i);
  assert.match(system, /never (?:give|write|produce) a score/i);
  assert.match(system, /cannot_tell/);
  assert.match(system, /untrusted/i);
  assert.match(system, /eye level/i);
  const text = content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  assert.match(text, /a fountain in the middle/);
  assert.match(text, /a path to the gate/);
  assert.match(text, /a small garden with a fountain/);
  assert.equal(content.filter((p) => p.type === 'image_url').length, 2);
});

test('frames go in order with their labels, as PNG data URLs', () => {
  const { content } = buildObserveMessages({ ...base, frames: [{ ...png(1), label: 'front' }, { ...png(2), label: 'eye (player eye level from the spawn)' }] });
  const text = content.find((p) => p.type === 'text').text;
  assert.ok(text.indexOf('front') < text.indexOf('eye (player eye level'));
  for (const p of content.filter((x) => x.type === 'image_url')) assert.match(p.image_url.url, /^data:image\/png;base64,/);
});

test('a crude box approximation says so, and tells the model what it cannot see in one', () => {
  const { system, content } = buildObserveMessages({ ...base, source: 'box_approximation', frames: [{ ...png(1), source: 'box_approximation' }] });
  const text = [system, ...content.filter((p) => p.type === 'text').map((p) => p.text)].join('\n');
  assert.match(text, /box approximation/i);
  assert.match(text, /no (?:lighting|textures)|draws no/i);
});

test('with no checklist the model is asked to name what the request expects before answering', () => {
  const { content } = buildObserveMessages({ ...base, expect: [] });
  assert.match(content.find((p) => p.type === 'text').text, /list (?:up to )?\d+ concrete things the request/i);
});

test('inputs are bounded: frames, checklist items, questions and the request text', () => {
  const many = Array.from({ length: 9 }, (_, i) => png(i));
  const { content } = buildObserveMessages({ ...base, frames: many, expect: Array.from({ length: 20 }, (_, i) => `item ${i} ${'x'.repeat(400)}`), questions: ['q1', 'q2', 'q3', 'q4', 'q5'], request: 'r'.repeat(5000) });
  assert.equal(content.filter((p) => p.type === 'image_url').length, LOOK_FRAME_MAX);
  const text = content.find((p) => p.type === 'text').text;
  assert.ok(text.length < 6000, `${text.length}`);
  assert.doesNotMatch(text, /item 9\b/);
  assert.doesNotMatch(text, /q4/);
});

test('parseObservation reads fenced JSON, bounds every field and turns an unknown verdict into "cannot tell"', () => {
  const out = parseObservation('```json\n' + JSON.stringify({
    observations: [
      { about: 'the fountain', verdict: 'seen', note: 'a stone basin with water', view: 'front' },
      { about: 'the path', verdict: 'definitely', note: 'x'.repeat(900) },
      'not an object', { verdict: 'seen' },
    ],
    answers: [{ question: 'is it crowded?', answer: 'no', verdict: 'seen' }],
    issues: ['a wall floats above the ground', 7, ''],
  }) + '\n```');
  assert.deepEqual(out.observations.map((o) => [o.about, o.verdict]), [['the fountain', 'seen'], ['the path', 'cannot_tell']]);
  assert.ok(out.observations[1].note.length <= 200);
  assert.equal(out.answers.length, 1);
  assert.deepEqual(out.issues, ['a wall floats above the ground']);
});

test('parseObservation returns null for anything that is not an observation, never a guess', () => {
  assert.equal(parseObservation('I think it looks great!'), null);
  assert.equal(parseObservation('{"score": 8}'), null);
  assert.equal(parseObservation(''), null);
});

test('observeFrames: one model call with the images, the vision role and the look kind, and the cost reported', async () => {
  calls.length = 0;
  const r = await observeFrames(base, fakeChat(reply({ observations: [{ about: 'a fountain in the middle', verdict: 'seen', note: 'basin' }, { about: 'a path to the gate', verdict: 'not_seen', note: 'grass only' }], answers: [], issues: [] })));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].req.model, 'vision');
  assert.equal(calls[0].opts.kind, 'visual:look');
  assert.deepEqual(r.observations.map((o) => o.verdict), ['seen', 'not_seen']);
  assert.equal(r.neurons, 123);
  assert.equal(r.ok, true);
});

test('observeFrames: a checklist item the model never answered is recorded as "cannot tell", not dropped', async () => {
  const r = await observeFrames(base, fakeChat(reply({ observations: [{ about: 'a fountain in the middle', verdict: 'seen', note: 'basin' }], answers: [], issues: [] })));
  assert.deepEqual(r.observations.map((o) => [o.about, o.verdict]), [['a fountain in the middle', 'seen'], ['a path to the gate', 'cannot_tell']]);
  assert.match(r.observations[1].note, /did not say/i);
});

test('observeFrames: no usable frame means no model call', async () => {
  calls.length = 0;
  const r = await observeFrames({ ...base, frames: [{ ...png(1), pngBase64: '' }] }, fakeChat(reply({})));
  assert.equal(calls.length, 0);
  assert.equal(r.ok, false);
});

test('observeFrames: a model that throws, or answers nothing readable, is a failure to observe — never an observation', async () => {
  const thrown = await observeFrames(base, fakeChat(new Error('workers-ai 503 for model @cf/zai-org/glm-5.3-flash')));
  assert.equal(thrown.ok, false);
  assert.deepEqual(thrown.observations, []);
  assert.doesNotMatch(thrown.error, /@cf\/|workers-ai|glm/i, 'engine identity must not leak into an error the agent repeats');
  const unreadable = await observeFrames(base, fakeChat({ text: 'Looks great, 9/10', neurons: 50 }));
  assert.equal(unreadable.ok, false);
  assert.equal(unreadable.neurons, 50, 'the model was paid for, so its cost is still reported');
  assert.deepEqual(unreadable.observations, []);
});
