/**
 * The API reference text — the exact strings the model quotes back as Luau.
 *
 * `chunkClassLike` turns creator-docs YAML into lines like
 *   `Method MoveTo(pos: Vector3) -> boolean — Moves it.`
 * and those lines are embedded, retrieved and quoted. A wrong signature here is not a wrong
 * document: it is a wrong API, handed to a model that has no way to check it.
 *
 * Five exports build those lines — typeStr, paramSig, returnSig, memberLine, cleanRefs — and none
 * of them had a test.
 *
 * ONE LATENT DEFECT, and it is latent rather than live: `typeStr` ends `t.name ?? String(t)`, so a
 * type object the schema does not describe stringifies to "[object Object]" and lands in the
 * reference as `Property Weird: [object Object]`. The function ALREADY has an `unknown` path for
 * null and undefined; it simply did not use it for an object it could not read.
 *
 * Measured against the built corpus before changing anything: data/chunks.jsonl contains ZERO
 * occurrences of "[object Object]", so nothing shipped is affected. Today's creator-docs YAML uses
 * strings and `{name}`. This is one schema change away, which is why it is worth a line and a test
 * rather than an alarm.
 *
 * Run with:  npm test           (from packages/corpus)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { typeStr, paramSig, returnSig, memberLine, cleanRefs } from './chunk.mjs';

test('CONTROL: the shapes creator-docs actually uses render exactly', () => {
  // If these ever change, every assertion below is about a format that no longer exists.
  assert.equal(typeStr('Vector3'), 'Vector3', 'a plain string type is itself');
  assert.equal(typeStr({ name: 'CFrame' }), 'CFrame', 'a named type is its name');
  assert.equal(paramSig({ name: 'pos', type: 'Vector3' }), 'pos: Vector3');
  assert.equal(returnSig([{ type: 'Vector3' }]), ' -> Vector3');
  assert.equal(
    memberLine('Method', { name: 'MoveTo', parameters: [{ name: 'pos', type: 'Vector3' }], returns: [{ type: 'boolean' }], summary: 'Moves it.' }),
    'Method MoveTo(pos: Vector3) -> boolean — Moves it.',
  );
});

test('A TYPE NOBODY COULD READ IS "unknown", NEVER "[object Object]"', () => {
  for (const weird of [{}, { kind: 'primitive' }, { name: null }, { name: '' }]) {
    const out = typeStr(weird);
    assert.doesNotMatch(out, /\[object/, `${JSON.stringify(weird)} rendered as "${out}" — that reads as a type name`);
    assert.equal(out, 'unknown', `${JSON.stringify(weird)} should read as unknown, got "${out}"`);
  }
});

test('an unreadable type does not leak into a parameter, a return or a member line', () => {
  assert.doesNotMatch(paramSig({ name: 'x', type: {} }), /\[object/);
  assert.doesNotMatch(returnSig([{ type: {} }]), /\[object/);
  assert.doesNotMatch(memberLine('Property', { name: 'Weird', type: {} }), /\[object/);
  assert.equal(memberLine('Property', { name: 'Weird', type: {} }), 'Property Weird: unknown');
});

test('a missing type is already unknown, and stays that way', () => {
  assert.equal(typeStr(null), 'unknown');
  assert.equal(typeStr(undefined), 'unknown');
  assert.equal(paramSig({ name: 'y' }), 'y: unknown');
});

test('an optional parameter is marked, and a required one is not', () => {
  assert.equal(paramSig({ name: 'cf', type: 'CFrame', default: 'nil' }), 'cf: CFrame?');
  assert.equal(paramSig({ name: 'cf', type: 'CFrame' }), 'cf: CFrame', 'no default means required');
  assert.equal(paramSig({ name: 'cf', type: 'CFrame', default: '' }), 'cf: CFrame', 'an empty default is not a default');
  assert.equal(paramSig({ name: 'cf', type: 'CFrame', default: null }), 'cf: CFrame');
});

test('returnSig drops the types that say nothing, and keeps the ones that do', () => {
  // void/null/() are noise in a reference line — "-> void" tells a reader nothing Luau needs.
  for (const empty of [[{ type: 'void' }], [{ type: 'null' }], [{ type: '()' }], [], null, undefined, 'nonsense']) {
    assert.equal(returnSig(empty), '', `${JSON.stringify(empty)} should produce no return clause`);
  }
  assert.equal(returnSig([{ type: 'a' }, { type: 'b' }]), ' -> a, b', 'multiple returns are listed');
});

test('deprecation is marked, whether it comes from a message or a tag', () => {
  assert.match(memberLine('Property', { name: 'Old', type: 'number', tags: ['Deprecated'] }), /\[Deprecated\]/);
  assert.match(memberLine('Property', { name: 'Old', type: 'number', deprecation_message: 'use New' }), /\[Deprecated\]/);
  assert.doesNotMatch(memberLine('Property', { name: 'Fine', type: 'number' }), /\[Deprecated\]/,
    'a live member must not be marked deprecated');
  assert.doesNotMatch(memberLine('Property', { name: 'Fine', type: 'number', tags: ['NotBrowsable'] }), /\[Deprecated\]/,
    'some other tag is not deprecation');
});

test('cleanRefs turns creator-docs cross-reference syntax into what a reader sees', () => {
  assert.equal(cleanRefs('`Class.Humanoid.WalkSpeed|WalkSpeed`'), 'WalkSpeed');
  assert.equal(cleanRefs('`Class.Part`'), '`Part`');
  assert.equal(cleanRefs('`Enum.Material.Neon`'), '`Enum.Material.Neon`', 'an Enum keeps its path — it is how you write it in Luau');
  assert.equal(cleanRefs('see [the guide](https://example.test/x)'), 'see the guide');
  assert.equal(cleanRefs(''), '');
  assert.equal(cleanRefs(null), '', 'a missing summary is empty, not "null"');
});
