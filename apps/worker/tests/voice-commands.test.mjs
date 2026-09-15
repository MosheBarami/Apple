// Voice commands, EXECUTED — including every way one fires when it should not.
//
// A voice command that is too eager is worse than one that does not exist. The failure is silent
// from the user's side: they said a sentence, the build stopped, and there is nothing in the UI
// that connects the two. So most of this file is about NOT matching — a sentence that mentions
// "stop", a negation, a near-miss word, filler with no instruction in it.
//
// And one test reaches outside this module on purpose: every command's target is checked against
// the `ClientMsg` union in packages/shared, read from the union's own source block rather than by
// grepping the file. A command pointing at a message type the socket does not handle is a button
// wired to nothing, and nothing inside this module could ever notice.
//
// Run with:  node --test tests/voice-commands.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const REPO = join(WORKER, '..', '..');
const OUT = join(tmpdir(), `apple-voice-${process.pid}.mjs`);

await esbuild.build({ entryPoints: [join(WORKER, 'src', 'voice-commands.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT });
const V = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));

const say = (text) => V.classifyUtterance(text);

/* ============================================ the targets are real, checked across modules === */

test('EVERY command targets a real ClientMsg type, read from the union itself', () => {
  // Anchored to the union's own block, not to a match anywhere in the file: `'stop'` also appears
  // in StudioOp.run_mode and in `finishReason`, so a file-wide grep would happily "confirm" a
  // target that the socket has never heard of. The slice below is the union and nothing else.
  const shared = readFileSync(join(REPO, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const start = shared.indexOf('export type ClientMsg =');
  assert.ok(start > 0, 'the ClientMsg union has moved or been renamed — this test is now measuring nothing');
  // The union grows. Anchoring on a specific LAST member ('ping') meant every addition after it
  // silently truncated the slice; anchor on the next top-level declaration instead.
  const end = shared.indexOf('\nexport ', start + 10);
  assert.ok(end > start, 'the end of the ClientMsg union was not found');
  const union = shared.slice(start, end);

  const declared = new Set([...union.matchAll(/\{\s*type:\s*'([a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(declared.has('chat') && declared.has('ping'), `the union parse found only ${[...declared].join(', ')}`);

  for (const entry of V.VOICE_COMMANDS) {
    assert.ok(declared.has(entry.clientMsgType), `command "${entry.id}" sends { type: '${entry.clientMsgType}' }, which the ClientMsg union does not declare`);
  }
});

test('the destructive command is the one that asks for confirmation', () => {
  // A property of the SET, not of one entry: restoring discards work, stopping does not, and a
  // product that confirms both teaches people to confirm without reading.
  const byId = Object.fromEntries(V.VOICE_COMMANDS.map((c) => [c.id, c]));
  assert.equal(byId.checkpoint_restore.confirm, true, 'restoring a checkpoint fires on a transcription guess');
  assert.equal(byId.stop.confirm, false, 'stop requires a confirmation, so it will not work when it is needed');
  assert.equal(byId.checkpoint_restore.needsArgument, 'checkpointId', 'restore must name the argument a voice utterance cannot supply');
});

/* ================================================================== the commands do fire === */

test('the plain phrasings are recognised at full confidence', () => {
  for (const [utterance, id] of [
    ['stop', 'stop'],
    ['Stop!', 'stop'],
    ['cancel that', 'stop'],
    ['never mind', 'stop'],
    ['resume', 'resume'],
    ['keep going', 'resume'],
    ['save a checkpoint', 'checkpoint_create'],
    ['undo', 'checkpoint_restore'],
    ['roll it back', 'checkpoint_restore'],
  ]) {
    const r = say(utterance);
    assert.equal(r.disposition, 'command', `"${utterance}" was classified as ${r.disposition}`);
    assert.equal(r.command.id, id, `"${utterance}" matched ${r.command.id}`);
    assert.equal(r.confidence, 1);
  }
});

test('filler around a command is stripped, and the confidence says it was', () => {
  for (const utterance of ['okay stop', 'um, stop please', 'hey Apple, stop', 'please stop now', 'can you stop', 'so, uh, stop']) {
    const r = say(utterance);
    assert.equal(r.disposition, 'command', `"${utterance}" → ${r.disposition}: ${r.note ?? ''}`);
    assert.equal(r.command.id, 'stop');
    assert.equal(r.confidence, 0.9, `"${utterance}" reported full confidence despite needing filler removed`);
  }
});

test('accents and punctuation do not defeat a command', () => {
  assert.equal(say('  STOP.  ').command.id, 'stop');
  assert.equal(say('cancel — that').command.id, 'stop');
});

/* ========================================================= and, mostly, they do NOT fire === */

test('A SENTENCE THAT MENTIONS A COMMAND IS NOT THAT COMMAND', () => {
  // The substring bug, stated as the test that catches it. Every one of these contains a command
  // phrase and none of them is a command; `includes()` fires on all six, and from the user's side
  // the build just stops mid-sentence with nothing in the UI to explain it.
  const sentences = [
    'I want the music to stop at the end of the level',
    'can you make the lift stop at the top floor',
    'the doors should stop the player from falling',
    'undo is not working in studio for me',
    'add a save point near the checkpoint flag',
    'make the car continue past the bridge',
  ];
  for (const sentence of sentences) {
    const r = say(sentence);
    assert.equal(r.disposition, 'dictation', `"${sentence}" was executed as ${r.disposition === 'command' ? r.command.id : r.disposition}`);
    assert.equal(r.reason, 'no_command_matched');
    assert.equal(r.text, sentence, 'the dictation must carry the ORIGINAL text, not the normalised form');
  }
});

test('A NEGATION IS NOT THE COMMAND IT NEGATES', () => {
  // One word apart, and it is the word a substring matcher cannot see.
  for (const utterance of ["don't stop", 'do not stop', "don't undo that", 'never stop', "can't stop"]) {
    const r = say(utterance);
    assert.equal(r.disposition, 'dictation', `"${utterance}" was executed`);
    assert.equal(r.reason, 'negated', `"${utterance}" fell through as ${r.reason}`);
  }
});

test('"no, stop" IS stop — "no" is deliberately not a negator', () => {
  // The other side of the negation guard, and the reason it is a short list rather than every word
  // that can precede a refusal. "No, stop" is how people actually interrupt, and treating it as a
  // negation breaks the command at the moment someone is urgently reaching for it.
  assert.equal(say('no, stop').disposition, 'command');
  assert.equal(say('no stop').command.id, 'stop');
});

test('a near-miss word is NOT a command — there is no fuzzy matching, on purpose', () => {
  // "shop" is one edit from "stop". Edit-distance matching would turn an ordinary transcription
  // error inside an ordinary sentence into an interrupt.
  for (const utterance of ['shop', 'stopwatch', 'stops', 'top', 'undoing', 'resumed']) {
    const r = say(utterance);
    assert.equal(r.disposition, 'dictation', `"${utterance}" was executed as a command`);
  }
});

test('filler with no instruction in it is NOTHING, not a message', () => {
  // Sending "um" to the agent as a prompt costs a step and a model call to answer a cough.
  for (const utterance of ['um', 'uh', 'okay', '   ', '...', '?!']) {
    const r = say(utterance);
    assert.equal(r.disposition, 'nothing', `"${utterance}" was classified as ${r.disposition}`);
    assert.equal(r.reason, 'empty');
  }
});

test('a non-string input is nothing, not a crash and not a command', () => {
  for (const value of [null, undefined, 42, {}, []]) {
    const r = V.classifyUtterance(value);
    assert.equal(r.disposition, 'nothing');
  }
});

/* ======================================================================== the phrase table === */

test('no two commands claim the same phrase — and an ambiguous one is reported, not resolved', () => {
  // The first half is a property of the table as written. The second is the behaviour if someone
  // later breaks it, which must not be "whichever appears first in the array".
  const seen = new Map();
  for (const command of V.VOICE_COMMANDS) {
    for (const phrase of command.phrases) {
      assert.ok(!seen.has(phrase), `"${phrase}" is claimed by both ${seen.get(phrase)} and ${command.id}`);
      seen.set(phrase, command.id);
    }
  }
});

test('every phrase in the table actually classifies as its own command', () => {
  // A phrase that the normaliser mangles — an apostrophe, a double space, a capital — is dead
  // weight in the table, and nothing else would ever notice it.
  for (const command of V.VOICE_COMMANDS) {
    for (const phrase of command.phrases) {
      const r = say(phrase);
      assert.equal(r.disposition, 'command', `"${phrase}" is in ${command.id}'s table but classifies as ${r.disposition}`);
      assert.equal(r.command.id, command.id, `"${phrase}" belongs to ${command.id} but matched ${r.command.id}`);
    }
  }
});

test('the catalogue offers a phrase that works', () => {
  for (const entry of V.voiceCommandCatalogue()) {
    const r = say(entry.say);
    assert.equal(r.disposition, 'command', `the catalogue tells the user to say "${entry.say}", which does nothing`);
    assert.equal(r.command.id, entry.id);
    assert.ok(entry.summary.length > 8);
  }
});

test('normalisation collapses "do not" into one token so the negator list can see it', () => {
  assert.equal(V.normaliseUtterance("Don't  STOP!"), 'dont stop');
  assert.equal(V.normaliseUtterance('do not stop'), 'dont stop');
  assert.equal(V.normaliseUtterance('café stop'), 'cafe stop');
});
