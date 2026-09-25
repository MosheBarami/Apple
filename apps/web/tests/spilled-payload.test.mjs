/**
 * THE OWNER ASKED FOR A LAVA OBBY AND GOT THE WIRE FORMAT.
 *
 * Verbatim from his transcript, 2026-09-20:
 *
 *   {"t": "Vector3", "v": [4, 1, 4]}}}, {"className": "Part", "name": "MovingPlatform3", "parent":
 *   "game.Workspace", "props": {"Anchored": {"t": "bool", "v": false}, …
 *
 * — several screens of it, and then the worker's own sentence: "The model reached its output limit
 * before finishing this step." That sentence is right. Everything above it is a tool payload the
 * model wrote as message TEXT rather than as a call, and the transcript printed it because the rule
 * was "anything that is not a UI fence is prose".
 *
 * The detector has to be narrow or it does more harm than the defect: this product's whole job is
 * explaining what it did, and an explanation that mentions the format must survive.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
// Imported straight from the TypeScript, the way every other test in this directory does it — node
// strips the types. The first version bundled it with esbuild, which apps/web does not depend on.
import { splitSpilledPayload } from '../src/lib/spilled-payload.ts';

/** Close to what was actually on screen, including the truncation mid-structure. */
const REAL = `{"t": "Vector3", "v": [4, 1, 4]}}}, {"className": "Part", "name": "MovingPlatform3", "parent": "game.Workspace", "props": {"Anchored": {"t": "bool", "v": false}, "Color": {"t": "Color3", "v": [1, 0.5, 0]}, "Material": {"t": "EnumItem", "v": "Enum.Material.Neon"}, "Position": {"t": "Vector3", "v": [4, 5, -8]}, "Size": {"t": "Vector3", "v": [4, 1, 4]}}}, {"className": "Part", "name": "MovingPlatform4", "props": {"Anchored": {"t": "bool", "v": false}, "Position": {"t": "Vector3", "v": [-2, 5`;

test('THE PAYLOAD IS TAKEN OUT OF THE TRANSCRIPT', () => {
  const r = splitSpilledPayload(REAL);
  assert.ok(r.collapsed, 'the payload was left in the message');
  assert.equal(r.prose, '', 'the message was nothing but payload, so no prose should remain');
  assert.ok(r.collapsed.includes('MovingPlatform3'), 'the raw text must be kept verbatim');
});

test('NOTHING IS DELETED — the collapsed text is the input, character for character', () => {
  // A customer quoting this to support must be able to. Hiding output the model really produced is
  // how a product starts lying about what happened; collapsing it is not the same thing.
  const r = splitSpilledPayload(REAL);
  assert.equal(r.collapsed, REAL);
});

test('the sentence AFTER the payload survives, which is the one that explains the failure', () => {
  const text = `${REAL}\nThe model reached its output limit before finishing this step.`;
  const r = splitSpilledPayload(text);
  assert.match(r.prose, /output limit before finishing/);
  assert.doesNotMatch(r.prose, /MovingPlatform3/);
});

test('AN EXPLANATION OF THE FORMAT IS PROSE AND STAYS PROSE', () => {
  // This is the case that decides whether the detector is worth having. This product's job is
  // explaining what it did, and it names the wire format when it does. Three occurrences is the
  // count threshold, so this passes the count and must fail the share.
  const teaching = 'Every property is tagged with its type. Write {"t":"Vector3","v":[0,5,0]} for a '
    + 'position, {"t":"Color3","v":[1,0.5,0]} for a colour, and {"t":"UDim2","v":[0.5,0,0.1,0]} for a '
    + 'GUI size. An array on its own cannot be read, because [1,0.5,0] is a valid Vector3 and a valid '
    + 'Color3, and Size is a Vector3 on a Part and a UDim2 on a TextLabel — so only you know which '
    + 'you meant. I have left the rest of the properties alone rather than half-building the set.';
  const r = splitSpilledPayload(teaching);
  assert.equal(r.collapsed, null, 'an explanation that names the format was collapsed');
  assert.equal(r.prose, teaching);
});

test('one or two mentions are never touched, whatever else is in the message', () => {
  for (const text of [
    'I set Position to {"t":"Vector3","v":[0,5,0]} on the platform.',
    'Two of them failed: {"t":"Vector3"} and {"className":"Part"} were rejected by Studio.',
    'No JSON here at all, just a sentence about your obby.',
    '',
  ]) {
    assert.equal(splitSpilledPayload(text).collapsed, null, `collapsed: ${text.slice(0, 40)}`);
  }
});

test('a short lead-in before the payload is kept', () => {
  const text = `Here are the platforms.\n${REAL}`;
  const r = splitSpilledPayload(text);
  assert.equal(r.prose, 'Here are the platforms.');
  assert.ok(r.collapsed.startsWith('{"t": "Vector3"'));
});

test('a single standalone typed wire value is removed', () => {
  const wire = '{"t":"Vector3","v":[4,1,4]}';
  assert.deepEqual(splitSpilledPayload(wire), { prose: '', collapsed: wire });
});

test('a short properties-only wire object is removed', () => {
  const wire = '{"props":{"Position":{"t":"Vector3","v":[4,1,4]}}}';
  assert.deepEqual(splitSpilledPayload(wire), { prose: '', collapsed: wire });
});

test('one instance object between ordinary sentences leaves both sentences intact', () => {
  const wire = '{"className":"Part","name":"MovingPlatform3","parent":"game.Workspace","props":{"Anchored":{"t":"bool","v":false}}}';
  const prose = 'I built a moving platform.\nIt is ready to try.';
  const result = splitSpilledPayload(`I built a moving platform.\n${wire}\nIt is ready to try.`);
  assert.equal(result.prose, prose);
  assert.equal(result.collapsed, wire);
});

test('a fenced wire example and prose mentioning wire syntax stay visible', () => {
  const example = 'Here is the value format:\n```json\n{"t":"Vector3","v":[4,1,4]}\n```\nUse it for a position.';
  assert.deepEqual(splitSpilledPayload(example), { prose: example, collapsed: null });
  const inline = 'Position uses {"t":"Vector3","v":[4,1,4]} here.';
  assert.deepEqual(splitSpilledPayload(inline), { prose: inline, collapsed: null });
  const unrelated = '{"title":"Moving platform","size":[4,1,4]}';
  assert.deepEqual(splitSpilledPayload(unrelated), { prose: unrelated, collapsed: null });
});

test('a dense fenced example with several wire shapes stays visible', () => {
  const example = 'Example:\n```json\n{"className":"Part","props":{"Anchored":{"t":"bool","v":true}}}\n```\nThat is the structure.';
  assert.deepEqual(splitSpilledPayload(example), { prose: example, collapsed: null });
});

test('two short standalone wire lines do not leave the second line visible', () => {
  const first = '{"t":"Vector3","v":[4,1,4]}';
  const second = '{"t":"Color3","v":[1,0.5,0]}';
  const result = splitSpilledPayload(`Ready.\n${first}\n${second}\nTry it now.`);
  assert.equal(result.prose, 'Ready.\nTry it now.');
  assert.equal(result.collapsed, `${first}\n${second}`);
});
