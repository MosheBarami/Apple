// Speech in and speech out, EXECUTED against a stub provider — no paid call is ever made.
//
// `SpeechProvider` exists so this file can exist. Every branch that matters here is a branch you
// cannot reach by calling a real engine and hoping: a refused reservation, an engine that throws,
// an engine whose response shape has drifted, an engine that heard nothing. The stub makes each of
// them a one-line fixture, and the assertions are about ORDER and ARITHMETIC — did the reservation
// happen before the call, was the client's number allowed anywhere near the bill, was the
// settlement the duration that was really produced.
//
// THE THREE TESTS TO READ FIRST:
//   * "a client-declared duration cannot lower the reservation" — the endpoint performs paid
//     inference proportional to a number in a request body. Trusting it is free inference for
//     whoever lies, and every log agrees with the lie.
//   * "a missing text field is a FAULT, an empty one is SILENCE" — the same two bytes on the wire,
//     two different events, and collapsing them means a changed API reports as a quiet user
//     forever.
//   * "a refused reservation means the engine is never called" — a spend gate that runs after the
//     spend is a receipt, not a gate.
//
// Run with:  node --test tests/speech.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-speech-${process.pid}.mjs`);
const AUDIO_OUT = join(tmpdir(), `apple-speech-audio-${process.pid}.mjs`);

await esbuild.build({ entryPoints: [join(WORKER, 'src', 'speech.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT });
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'audio.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: AUDIO_OUT });
const SP = await import(pathToFileURL(OUT).href);
const A = await import(pathToFileURL(AUDIO_OUT).href);
process.on('exit', () => { rmSync(OUT, { force: true }); rmSync(AUDIO_OUT, { force: true }); });

// ------------------------------------------------------------------------- the stubs ---

/**
 * A BudgetDO that records every call. The recording IS the test for most of this file: what was
 * reserved, what was settled, whether anything was released, and in what order.
 */
function budget({ allow = true, reason = 'daily_cap' } = {}) {
  const calls = [];
  const env = {
    BUDGET_DO: {
      idFromName: (n) => n,
      get: () => ({
        async fetch(url, init) {
          const path = new URL(url).pathname;
          const body = JSON.parse(init.body);
          calls.push({ path, ...body });
          if (path === '/reserve') {
            return new Response(JSON.stringify(allow ? { ok: true, reserved: body.neurons } : { ok: false, reason, message: 'capped' }), { status: 200 });
          }
          return new Response('{}', { status: 200 });
        },
      }),
    },
  };
  return {
    env,
    calls,
    reserved: () => calls.filter((c) => c.path === '/reserve'),
    settled: () => calls.filter((c) => c.path === '/settle'),
    released: () => calls.filter((c) => c.path === '/release'),
  };
}

/** A provider that records what it was asked for and returns whatever the fixture says. */
function provider({ transcribeResult, synthesizeResult, throws = false } = {}) {
  const seen = [];
  return {
    seen,
    provider: {
      name: 'stub',
      async transcribe(req) {
        seen.push({ op: 'transcribe', modelId: req.modelId, contentType: req.contentType, language: req.language, vadFilter: req.vadFilter, bytes: req.audioBase64.length });
        if (throws) throw new Error('engine unavailable');
        return transcribeResult;
      },
      async synthesize(req) {
        seen.push({ op: 'synthesize', modelId: req.modelId, text: req.text, lang: req.lang });
        if (throws) throw new Error('engine unavailable');
        return synthesizeResult;
      },
    },
  };
}

const bytesToBase64 = (bytes) => Buffer.from(bytes).toString('base64');

/** A real WAV of `seconds`, so a decoded duration is a decoded duration. */
function wavBase64(seconds, sampleRate = 16_000) {
  const frames = Math.round(seconds * sampleRate);
  const samples = new Float32Array(frames);
  for (let f = 0; f < frames; f++) samples[f] = 0.3 * Math.sin((2 * Math.PI * 220 * f) / sampleRate);
  const bytes = A.encodeWav({ sampleRate, channels: 1, samples }, 16);
  assert.ok(!A.isAudioFault(bytes), 'the fixture WAV did not encode');
  return bytesToBase64(bytes);
}

/** Real MPEG-1 Layer III frame headers, so the duration walker has something true to walk. */
function mp3Bytes(frameSpecs, { id3 = false } = {}) {
  const parts = [];
  if (id3) {
    const tag = new Uint8Array(10 + 32);
    tag[0] = 0x49; tag[1] = 0x44; tag[2] = 0x33; tag[3] = 3;
    tag[6] = 0; tag[7] = 0; tag[8] = 0; tag[9] = 32; // syncsafe 32
    parts.push(tag);
  }
  const INDEX = { 128: 9, 192: 11 };
  for (const kbps of frameSpecs) {
    const bitrateIndex = INDEX[kbps];
    assert.ok(bitrateIndex, `no table entry for ${kbps} kbps`);
    const frameBytes = Math.floor((1152 / 8) * ((kbps * 1000) / 44100));
    const frame = new Uint8Array(frameBytes);
    frame[0] = 0xff;
    frame[1] = 0xfb; // MPEG-1, Layer III, no CRC
    frame[2] = (bitrateIndex << 4) | (0 << 2); // 44100 Hz, no padding
    frame[3] = 0xc0;
    parts.push(frame);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const OK_TRANSCRIPT = { text: 'move the red block to the left', transcription_info: { language: 'en', language_probability: 0.98, duration: 3.2 }, segments: [{ start: 0, end: 3.2, text: 'move the red block to the left' }] };

/* ================================================== the number that must not be trusted === */

test('A CLIENT-DECLARED DURATION CANNOT LOWER THE RESERVATION', async () => {
  // The exploit this closes: an opaque container (webm, which is what a browser's MediaRecorder
  // produces) carrying two minutes of audio, with `clientSeconds: 0.1` beside it. If the request
  // body decides the reservation, that is two minutes of paid inference for a fifth of a second of
  // budget — and the ledger, the logs and the spend dashboard all agree, because the number they
  // recorded is the number the caller supplied.
  const b = budget();
  const p = provider({ transcribeResult: OK_TRANSCRIPT });
  const opaque = bytesToBase64(new Uint8Array(200_000).fill(7));

  const honest = await SP.transcribe(b.env, p.provider, { audioBase64: opaque, contentType: 'audio/webm' });
  const liar = await SP.transcribe(b.env, p.provider, { audioBase64: opaque, contentType: 'audio/webm', clientSeconds: 0.1 });

  assert.ok(honest.ok && liar.ok);
  const [first, second] = b.reserved();
  assert.equal(first.neurons, second.neurons, 'the declared duration changed the reservation');
  const cap = SP.neuronsForAudio(SP.ASR_MODEL.neuronsPerAudioMinute, SP.SPEECH_LIMITS.maxAudioSeconds);
  assert.equal(first.neurons, cap, `an opaque container reserved ${first.neurons} neurons instead of the ${cap}-neuron cap`);
});

test('a WAV is MEASURED, so the reservation is exact rather than pessimistic', async () => {
  // The other half of the same rule: when the worker can open the container it does, and the
  // reservation is the truth rather than the cap. The client's claim is still ignored.
  const b = budget();
  const p = provider({ transcribeResult: OK_TRANSCRIPT });
  const r = await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(4), contentType: 'audio/wav', clientSeconds: 0.05 });
  assert.ok(r.ok, JSON.stringify(r));
  const reservedNeurons = b.reserved()[0].neurons;
  const forFourSeconds = SP.neuronsForAudio(SP.ASR_MODEL.neuronsPerAudioMinute, 4);
  assert.equal(reservedNeurons, forFourSeconds, `reserved ${reservedNeurons} for a 4-second file`);
  assert.ok(reservedNeurons < SP.neuronsForAudio(SP.ASR_MODEL.neuronsPerAudioMinute, SP.SPEECH_LIMITS.maxAudioSeconds));
});

test('measureBillableSeconds says HOW it knows, and falls back to the cap for a corrupt WAV', () => {
  // A WAV that will not decode must not take the cheap path. Falling through to the cap is the
  // pessimistic direction, and pessimism is the only safe direction for a reservation.
  const good = SP.measureBillableSeconds(Buffer.from(wavBase64(2), 'base64'), 'audio/wav');
  assert.equal(good.measured, 'decoded');
  assert.ok(Math.abs(good.seconds - 2) < 0.01);

  const corrupt = SP.measureBillableSeconds(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]), 'audio/wav');
  assert.equal(corrupt.measured, 'capped');
  assert.equal(corrupt.seconds, SP.SPEECH_LIMITS.maxAudioSeconds);
});

/* ============================================================== the gate is before the call === */

test('A REFUSED RESERVATION MEANS THE ENGINE IS NEVER CALLED', async () => {
  // Order, not presence. A spend gate that runs after the spend is a receipt.
  const b = budget({ allow: false, reason: 'daily_cap' });
  const p = provider({ transcribeResult: OK_TRANSCRIPT });
  await assert.rejects(
    () => SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(2), contentType: 'audio/wav' }),
    (e) => e.name === 'BudgetError' && e.reason === 'daily_cap',
  );
  assert.equal(p.seen.length, 0, 'the engine was called despite a refused reservation');
  assert.equal(b.settled().length, 0);
});

test('an engine that throws RELEASES the reservation — nothing ran, so nothing is owed', async () => {
  const b = budget();
  const p = provider({ throws: true });
  await assert.rejects(() => SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(2), contentType: 'audio/wav' }));
  assert.equal(b.released().length, 1, 'a failed call did not release its reservation');
  assert.equal(b.settled().length, 0, 'a failed call settled as though it had run');
});

test('an unreadable RESPONSE settles instead of releasing — the inference really happened', async () => {
  // The direction matters: releasing here credits budget back for work the provider performed and
  // will bill us for. Over-charging our own ledger is the safe error; under-charging is how a bill
  // escapes the caps entirely.
  const b = budget();
  const p = provider({ transcribeResult: { unexpected: 'shape' } });
  const r = await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(2), contentType: 'audio/wav' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'provider_shape');
  assert.equal(b.settled().length, 1, 'a billed-but-unreadable response did not settle');
  assert.equal(b.released().length, 0);
});

test('a payload that is refused before the gate costs nothing at all', async () => {
  const b = budget();
  const p = provider({ transcribeResult: OK_TRANSCRIPT });
  const badType = await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(1), contentType: 'video/mp4' });
  assert.equal(badType.ok, false);
  assert.equal(badType.code, 'unsupported_type');

  const huge = await SP.transcribe(b.env, p.provider, { audioBase64: bytesToBase64(new Uint8Array(SP.SPEECH_LIMITS.maxAudioBytes + 10)), contentType: 'audio/webm' });
  assert.equal(huge.code, 'too_large');

  const empty = await SP.transcribe(b.env, p.provider, { audioBase64: '', contentType: 'audio/wav' });
  assert.equal(empty.code, 'empty_payload');

  assert.equal(b.calls.length, 0, 'a refused request touched the budget');
  assert.equal(p.seen.length, 0, 'a refused request reached the engine');
});

test('a clip too short to contain speech is refused rather than transcribed', async () => {
  const b = budget();
  const p = provider({ transcribeResult: OK_TRANSCRIPT });
  const r = await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(0.05), contentType: 'audio/wav' });
  assert.equal(r.code, 'too_short');
  assert.equal(p.seen.length, 0);
});

/* ================================================== silence is not the same as a failure === */

test('A MISSING text FIELD IS A FAULT; AN EMPTY ONE IS SILENCE', async () => {
  // Two different events that a naive reader collapses into "". A missing field means the schema
  // moved, and defaulting it to an empty string turns every future response from a changed API
  // into a confident report that the user said nothing — which nobody will ever report as a bug.
  const b = budget();

  const missing = await SP.transcribe(b.env, provider({ transcribeResult: { transcription_info: { language: 'en' } } }).provider, { audioBase64: wavBase64(2), contentType: 'audio/wav' });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'provider_shape');
  assert.match(missing.detail, /schema change, not silence/);

  const silent = await SP.transcribe(b.env, provider({ transcribeResult: { text: '   ', transcription_info: { language: 'en' } } }).provider, { audioBase64: wavBase64(2), contentType: 'audio/wav' });
  assert.equal(silent.ok, true);
  assert.equal(silent.heard, false);
  assert.equal(silent.reason, 'silence');
  // And it was still billed: the engine ran on a silent recording, which costs the same as a loud one.
  assert.ok(silent.neurons > 0, 'a silent transcription was billed nothing, so the ledger is short');
});

test('a real transcript comes back with its words, its segments and its language', async () => {
  const b = budget();
  const p = provider({ transcribeResult: OK_TRANSCRIPT });
  const r = await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(4), contentType: 'audio/wav' });
  assert.ok(r.ok && r.heard);
  assert.equal(r.text, 'move the red block to the left');
  assert.equal(r.segments.length, 1);
  assert.equal(r.droppedSegments, 0);
  assert.equal(r.language.code, 'en');
  assert.equal(r.language.name, 'English');
  assert.equal(r.language.confidence, 0.98);
});

/* ======================================================================= language detection === */

test('a regional tag is normalised, and an unknown language is reported as unknown', () => {
  assert.equal(SP.normaliseLanguage('en-US').code, 'en');
  assert.equal(SP.normaliseLanguage('PT_BR').code, 'pt');
  assert.equal(SP.normaliseLanguage('he').name, 'Hebrew');

  const alien = SP.normaliseLanguage('klingon');
  assert.equal(alien.code, null, 'an unrecognised code was passed straight through into product content');
  assert.equal(alien.unrecognised, 'klingon', 'the raw value must survive for diagnosis');
});

test('a prototype key is not a language — the allowlist is checked with hasOwnProperty', () => {
  // `ASR_LANGUAGES['constructor']` is a truthy function on any plain object. Indexed rather than
  // guarded, it would make `constructor` a recognised language with a name of "function Object()".
  for (const key of ['__proto__', 'constructor', 'toString', 'valueOf']) {
    const r = SP.normaliseLanguage(key);
    assert.equal(r.code, null, `"${key}" was accepted as a language`);
    assert.equal(r.name, null);
  }
});

test('a confidence the engine did not report is null, not zero', () => {
  // Zero is a claim of certainty about uncertainty. Null is the absence of a measurement.
  assert.equal(SP.normaliseLanguage('en').confidence, null);
  assert.equal(SP.normaliseLanguage('en', 0.4).confidence, 0.4);
  assert.equal(SP.normaliseLanguage('en', 'very sure').confidence, null);
});

test('asking for a language this worker does not know is refused before any spend', async () => {
  const b = budget();
  const p = provider({ transcribeResult: OK_TRANSCRIPT });
  const r = await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(2), contentType: 'audio/wav', language: 'elvish' });
  assert.equal(r.code, 'unknown_language');
  assert.equal(b.calls.length, 0);
  assert.equal(p.seen.length, 0);
});

test('a requested language reaches the engine; an absent one lets it detect', async () => {
  const b = budget();
  const p = provider({ transcribeResult: OK_TRANSCRIPT });
  await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(2), contentType: 'audio/wav', language: 'fr-CA' });
  assert.equal(p.seen[0].language, 'fr', 'the normalised code did not reach the engine');
  await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(2), contentType: 'audio/wav' });
  assert.equal(p.seen[1].language, undefined, 'a language was invented when none was asked for');
});

/* ============================================================================ segments === */

test('segments with impossible timings are DROPPED AND COUNTED, never silently thinned', () => {
  // `??` is no defence here: NaN is not null, and `NaN >= 0` is false, so a NaN-timed segment
  // sails through any bounds test written as `if (start < 0) skip`. A caption track that is
  // quietly missing three lines is indistinguishable from one the model never produced.
  const parsed = SP.parseTranscript({
    text: 'one two three',
    segments: [
      { start: 0, end: 1, text: 'one' },
      { start: NaN, end: 2, text: 'two' },
      { start: 3, end: 2, text: 'backwards' },
      { start: -1, end: 4, text: 'before the file began' },
      { start: 'x', end: 'y', text: 'strings' },
      { start: 4, end: 5 },
      { start: 5, end: 6, text: 'three' },
    ],
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.segments.length, 2, `kept ${JSON.stringify(parsed.segments)}`);
  assert.equal(parsed.droppedSegments, 5, 'the dropped segments were not counted');
});

test('the nested `result` shape and the bare-string shape are both read', () => {
  assert.equal(SP.parseTranscript({ result: { text: 'nested' } }).text, 'nested');
  assert.equal(SP.parseTranscript('bare').text, 'bare');
  assert.equal(SP.parseTranscript(null).ok, false);
  assert.equal(SP.parseTranscript(42).ok, false);
});

/* ======================================================================== settlement === */

test('the settlement uses the duration the engine says it PROCESSED, when that is less', async () => {
  // The refund half of a pessimistic reservation. An opaque container reserves the cap; the engine
  // reports it processed 6 seconds; the ledger must be charged for 6 seconds, not 120.
  const b = budget();
  const p = provider({ transcribeResult: { text: 'hello', transcription_info: { language: 'en', duration: 6 } } });
  const r = await SP.transcribe(b.env, p.provider, { audioBase64: bytesToBase64(new Uint8Array(50_000)), contentType: 'audio/webm' });
  assert.ok(r.ok);
  assert.equal(r.measured, 'provider');
  const settle = b.settled()[0];
  assert.equal(settle.actual, SP.neuronsForAudio(SP.ASR_MODEL.neuronsPerAudioMinute, 6));
  assert.ok(settle.actual < settle.reserved, `settled ${settle.actual} against a reservation of ${settle.reserved}`);
  assert.equal(r.neurons, settle.actual, 'the result reported a different number from the one it settled');
});

test('an engine claiming a LONGER duration than was reserved cannot raise the bill', async () => {
  // The other direction, which is an over-charge rather than an under-charge and is equally a
  // fabrication: the reservation is the ceiling on what one call may cost.
  const b = budget();
  const p = provider({ transcribeResult: { text: 'hello', transcription_info: { language: 'en', duration: 9000 } } });
  const r = await SP.transcribe(b.env, p.provider, { audioBase64: wavBase64(3), contentType: 'audio/wav' });
  assert.ok(r.ok);
  const settle = b.settled()[0];
  assert.ok(settle.actual <= settle.reserved, `settled ${settle.actual} above the ${settle.reserved} reserved`);
  assert.equal(r.measured, 'decoded');
});

test('neuronsForAudio rounds UP and refuses to price a non-finite duration as anything', () => {
  assert.equal(SP.neuronsForAudio(60, 60), 60);
  assert.equal(SP.neuronsForAudio(60, 1), 1, 'one second of a 60-per-minute rate must round up to 1, not down to 0');
  assert.equal(SP.neuronsForAudio(60, NaN), 0);
  assert.equal(SP.neuronsForAudio(60, Infinity), 0);
  assert.equal(SP.neuronsForAudio(60, -5), 0);
});

/* ====================================================================== text to speech === */

test('every voice preset is real: it has a language this worker knows and a plausible rate', () => {
  assert.ok(SP.VOICE_PRESET_NAMES.length >= 5);
  for (const entry of SP.voicePresetCatalogue()) {
    assert.ok(SP.normaliseLanguage(entry.lang).code, `${entry.name} speaks "${entry.lang}", which is not in the allowlist`);
    assert.ok(entry.wordsPerMinute >= 100 && entry.wordsPerMinute <= 220, `${entry.name} speaks at ${entry.wordsPerMinute} wpm`);
    assert.ok(entry.summary.length > 10 && entry.use.length > 10);
  }
});

test('A PRESET CHANGES THE TEXT THAT IS SENT — it is not a label on an unchanged call', () => {
  // The honesty test for this feature. The registered engine exposes `prompt` and `lang` and
  // nothing else, so if a preset did not alter one of those two it would be a field describing an
  // intention nobody acted on. What a preset CAN do is pace the writing, and pacing is punctuation.
  const runOn = 'walk to the blue door and then turn left past the fountain and keep going until you reach the gate where the guard is standing and talk to him';
  const narrator = SP.VOICE_PRESETS.narrator.shape(runOn);
  const announcer = SP.VOICE_PRESETS.announcer.shape(runOn);
  const commas = (s) => (s.match(/,/g) ?? []).length;
  assert.ok(commas(narrator) > 0, 'the narrator preset left a 26-word run-on sentence unbroken');
  assert.ok(commas(announcer) > commas(narrator), `announcer broke it ${commas(announcer)} times against narrator's ${commas(narrator)} — the presets pace identically`);
  // And the words survive: a pacing transform that drops content is a rewrite, not a delivery.
  const words = (s) => s.replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);
  assert.deepEqual(words(announcer), words(runOn), 'the shaping changed the words, not just the pacing');
});

test('the result never claims a voice was selected, because this engine has none', () => {
  // The lie this refuses to tell. Reporting `voice: "narrator"` while sending the same two fields
  // for every preset would describe a choice the engine cannot make.
  assert.equal(SP.TIMBRE_SELECTABLE, false);
  assert.equal(SP.TTS_MODEL.timbreSelectable, false);
});

test('synthesis reserves from an ESTIMATE and settles from the real MP3', async () => {
  const b = budget();
  const twentyFrames = mp3Bytes(Array(20).fill(128));
  const p = provider({ synthesizeResult: { audio: bytesToBase64(twentyFrames) } });
  const r = await SP.synthesize(b.env, p.provider, { text: 'The gate is open. Go north.', preset: 'guide' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.measured, 'decoded');
  const realSeconds = 20 * (1152 / 44100);
  assert.ok(Math.abs(r.seconds - realSeconds) < 0.001, `read ${r.seconds}s from a file that is ${realSeconds}s long`);
  assert.equal(r.billedSeconds, r.seconds);
  assert.equal(r.neurons, SP.neuronsForAudio(SP.TTS_MODEL.neuronsPerAudioMinute, realSeconds));
  // The reservation must have been the ESTIMATE, and the estimate must have been bigger.
  const reserved = b.reserved()[0].neurons;
  assert.ok(reserved >= r.neurons, `reserved ${reserved} but settled ${r.neurons} — the reservation under-covered the call`);
});

test('synthesis with an unmeasurable payload bills the estimate AND SAYS SO', async () => {
  // The alternative is a number in the ledger that came from nowhere. `measured: 'estimated'` is
  // the whole difference between a figure and a fabrication.
  const b = budget();
  const p = provider({ synthesizeResult: { audio: bytesToBase64(new Uint8Array(4000).fill(0x33)) } });
  const r = await SP.synthesize(b.env, p.provider, { text: 'Hello there, traveller.', preset: 'npc_calm' });
  assert.ok(r.ok);
  assert.equal(r.measured, 'estimated');
  assert.equal(r.seconds, null, 'an unmeasurable file reported a duration anyway');
  assert.equal(r.billedSeconds, r.estimatedSeconds);
});

test('the preset shaping is what actually reaches the engine', async () => {
  const b = budget();
  const p = provider({ synthesizeResult: { audio: bytesToBase64(mp3Bytes([128, 128])) } });
  const runOn = 'go to the tower and climb the stairs and open the chest and take the key and come back to me before the sun sets';
  const r = await SP.synthesize(b.env, p.provider, { text: runOn, preset: 'announcer' });
  assert.ok(r.ok);
  assert.equal(p.seen[0].text, r.spokenText, 'the result reported text the engine was not sent');
  assert.notEqual(p.seen[0].text, runOn, 'the preset shaped nothing');
  assert.equal(p.seen[0].lang, 'en');
});

test('text with nothing to say is refused before anything is reserved', async () => {
  const b = budget();
  const p = provider({ synthesizeResult: { audio: 'x' } });
  for (const [text, code] of [['', 'empty_text'], ['   ', 'empty_text'], ['!!! ... ??? ***', 'nothing_to_say'], ['x'.repeat(SP.SPEECH_LIMITS.maxTextChars + 1), 'text_too_long']]) {
    const r = await SP.synthesize(b.env, p.provider, { text });
    assert.equal(r.ok, false, `"${text.slice(0, 20)}" was synthesised`);
    assert.equal(r.code, code);
  }
  assert.equal(b.calls.length, 0, 'a refused line still reserved budget');
  assert.equal(p.seen.length, 0);
});

test('an unknown preset is refused and the refusal lists the real ones', async () => {
  const b = budget();
  const p = provider({ synthesizeResult: { audio: 'x' } });
  const r = await SP.synthesize(b.env, p.provider, { text: 'hello', preset: 'sexy_robot' });
  assert.equal(r.code, 'unknown_preset');
  assert.match(r.detail, /narrator/);

  // And a prototype key is not a preset either, for the same reason it is not a language.
  const proto = await SP.synthesize(b.env, p.provider, { text: 'hello', preset: '__proto__' });
  assert.equal(proto.code, 'unknown_preset');
  assert.equal(b.calls.length, 0);
});

test('a synthesis engine that throws releases; one that returns nothing settles', async () => {
  const thrown = budget();
  await assert.rejects(() => SP.synthesize(thrown.env, provider({ throws: true }).provider, { text: 'hello there' }));
  assert.equal(thrown.released().length, 1);
  assert.equal(thrown.settled().length, 0);

  const empty = budget();
  const r = await SP.synthesize(empty.env, provider({ synthesizeResult: {} }).provider, { text: 'hello there' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'provider_shape');
  assert.equal(empty.settled().length, 1, 'a billed call that returned nothing did not settle');
});

/* ========================================================================== mp3 duration === */

test('MP3 duration is walked frame by frame, so VARIABLE BITRATE is exact', () => {
  // `bytes / bitrate` is the obvious shortcut and it is wrong for every VBR file by whatever the
  // encoder decided — silently, in the direction nobody checks. Here the file is deliberately
  // mixed: ten frames at 128 kbps and ten at 192, all carrying the same 1152 samples.
  const mixed = mp3Bytes([...Array(10).fill(128), ...Array(10).fill(192)]);
  const seconds = SP.mp3DurationSeconds(mixed);
  const expected = 20 * (1152 / 44100);
  assert.ok(Math.abs(seconds - expected) < 1e-9, `walked ${seconds}s, expected ${expected}s`);

  // What the shortcut would have said, using the first frame's bitrate for the whole file.
  const naive = (mixed.length * 8) / 128_000;
  assert.ok(Math.abs(naive - expected) > 0.05, 'the fixture is not actually variable-bitrate');
});

test('an ID3 tag is skipped rather than parsed as audio', () => {
  const tagged = SP.mp3DurationSeconds(mp3Bytes(Array(8).fill(128), { id3: true }));
  const plain = SP.mp3DurationSeconds(mp3Bytes(Array(8).fill(128)));
  assert.equal(tagged, plain, 'the ID3 header changed the measured duration');
});

test('a payload that is not an MP3 returns null — never a fabricated duration', () => {
  assert.equal(SP.mp3DurationSeconds(new Uint8Array(5000).fill(0x00)), null);
  assert.equal(SP.mp3DurationSeconds(new Uint8Array(0)), null);
  // A sync word with a reserved bitrate index is a malformed header, not a frame: it must not be
  // counted, and the walk must not spin on it.
  const bogus = new Uint8Array(400);
  bogus[0] = 0xff; bogus[1] = 0xfb; bogus[2] = 0xf0;
  assert.equal(SP.mp3DurationSeconds(bogus), null);
});

test('once frames are being read, a broken sync STOPS the walk instead of resyncing on noise', () => {
  // Resyncing past garbage would count arbitrary bytes as audio and inflate the settled duration,
  // which is a bill nobody can trace. The fixture is the one that actually pins the guard: three
  // junk bytes followed by MORE VALID FRAME HEADERS. Junk alone proves nothing — there is no sync
  // word in it to resync onto, so a walker that resyncs and a walker that stops agree (measured:
  // both returned exactly 4 frames on 5 kB of 0x5A). With frames on the far side of the gap, a
  // resyncing walker reports eight frames of audio for a file that holds four and a gap.
  const good = mp3Bytes(Array(4).fill(128));
  const more = mp3Bytes(Array(4).fill(128));
  const spliced = new Uint8Array(good.length + 3 + more.length);
  spliced.set(good, 0);
  spliced.set(more, good.length + 3);
  const seconds = SP.mp3DurationSeconds(spliced);
  const fourFrames = 4 * (1152 / 44100);
  assert.ok(Math.abs(seconds - fourFrames) < 1e-9, `the walk resynced past the gap and counted ${(seconds / (1152 / 44100)).toFixed(0)} frames instead of 4`);
});

/* ============================================================================ estimates === */

test('the speech estimate is monotonic in length and has a floor', () => {
  const short = SP.estimateSpeechSeconds(2, 150);
  const long = SP.estimateSpeechSeconds(200, 150);
  assert.ok(long > short, 'more words did not estimate more speech');
  assert.ok(short >= SP.SPEECH_LIMITS.minSpeechSeconds, 'a two-word line estimated below the floor');
  assert.ok(Math.abs(SP.estimateSpeechSeconds(150, 150) - 60) < 0.01, '150 words at 150 wpm must be a minute');
  // A nonsense rate must not produce a nonsense reservation.
  assert.ok(Number.isFinite(SP.estimateSpeechSeconds(50, NaN)));
  assert.ok(Number.isFinite(SP.estimateSpeechSeconds(50, 0)));
});

test('wordCount counts words, not tokens of punctuation', () => {
  assert.equal(SP.wordCount('one two three'), 3);
  assert.equal(SP.wordCount('  ...  !!!  '), 0);
  assert.equal(SP.wordCount('Level 7 — go!'), 3);
});
