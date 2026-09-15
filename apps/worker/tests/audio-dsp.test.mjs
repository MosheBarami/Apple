// The PCM core, EXECUTED — with the violating input built by the test, not found in the tree.
//
// Every guard in apps/worker/src/audio.ts exists because the audio path's failures are silent:
// a broken decoder, a mis-calibrated gate and a muted microphone all produce the same thing, and
// that thing is a valid buffer nobody can hear. So this file does not walk the healthy path and
// call it coverage. Each test that claims "X is rejected" CONSTRUCTS an X here — a µ-law header,
// a float payload carrying NaN, a chunk whose declared size overruns the buffer, a digitally
// silent recording — and watches the rejection happen.
//
// THE FOUR TESTS THAT MATTER MOST, because each one is a guard that would otherwise fail open and
// still look green:
//   * "silence is not speech"        — a relative threshold on a file with no noise floor calls
//                                      every sample speech. -Infinity + 9 is -Infinity.
//   * "normalising silence"          — target / 0 is Infinity; Infinity * 0 is NaN; a NaN buffer
//                                      passes every later threshold in the file.
//   * "encode clamps, never wraps"   — +1.5 quantised without a clamp becomes a large NEGATIVE
//                                      integer: one hot sample becomes a loud click.
//   * "the ceiling is a guarantee"   — a limiter that reacts after the peak has not limited it.
//
// Run with:  node --test tests/audio-dsp.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-audio-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'audio.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
});
const A = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));

// --------------------------------------------------------------------------- fixtures ---

const RATE = 16_000;

function buffer(frames, channels = 1, sampleRate = RATE, fill = () => 0) {
  const samples = new Float32Array(frames * channels);
  for (let f = 0; f < frames; f++) for (let c = 0; c < channels; c++) samples[f * channels + c] = fill(f, c);
  return { sampleRate, channels, samples };
}

const sine = (hz, seconds, amplitude = 0.5, sampleRate = RATE, channels = 1) =>
  buffer(Math.round(seconds * sampleRate), channels, sampleRate, (f) => amplitude * Math.sin((2 * Math.PI * hz * f) / sampleRate));

const silence = (seconds, sampleRate = RATE) => buffer(Math.round(seconds * sampleRate), 1, sampleRate, () => 0);

/** Deterministic pseudo-noise: the same bytes on every machine, so a threshold can be asserted. */
function noise(seconds, amplitude, seed = 7, sampleRate = RATE) {
  let s = seed >>> 0;
  return buffer(Math.round(seconds * sampleRate), 1, sampleRate, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s / 0xffffffff) * 2 - 1) * amplitude;
  });
}

/** Concatenate mono buffers of one rate. */
function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.samples.length, 0);
  const samples = new Float32Array(total);
  let at = 0;
  for (const p of parts) { samples.set(p.samples, at); at += p.samples.length; }
  return { sampleRate: parts[0].sampleRate, channels: 1, samples };
}

/** A hand-built WAV, so the header under test is the one this file wrote. */
function wavBytes({ formatTag = 1, channels = 1, sampleRate = RATE, bits = 16, data = new Uint8Array(0), dataId = 'data', declaredDataSize = null, extraChunk = null }) {
  const chunks = [];
  const fmt = new Uint8Array(16);
  const fv = new DataView(fmt.buffer);
  fv.setUint16(0, formatTag, true);
  fv.setUint16(2, channels, true);
  fv.setUint32(4, sampleRate, true);
  fv.setUint32(8, sampleRate * channels * (bits / 8), true);
  fv.setUint16(12, channels * (bits / 8), true);
  fv.setUint16(14, bits, true);
  chunks.push({ id: 'fmt ', payload: fmt, declared: 16 });
  if (extraChunk) chunks.push(extraChunk);
  chunks.push({ id: dataId, payload: data, declared: declaredDataSize ?? data.length });

  let size = 4;
  for (const c of chunks) size += 8 + ((c.payload.length + 1) & ~1);
  const out = new Uint8Array(8 + size);
  const view = new DataView(out.buffer);
  const ascii = (at, s) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF');
  view.setUint32(4, size, true);
  ascii(8, 'WAVE');
  let at = 12;
  for (const c of chunks) {
    ascii(at, c.id);
    view.setUint32(at + 4, c.declared, true);
    out.set(c.payload, at + 8);
    at += 8 + ((c.payload.length + 1) & ~1);
  }
  return out;
}

const int16Data = (values) => {
  const out = new Uint8Array(values.length * 2);
  const v = new DataView(out.buffer);
  values.forEach((n, i) => v.setInt16(i * 2, n, true));
  return out;
};

const float32Data = (values) => {
  const out = new Uint8Array(values.length * 4);
  const v = new DataView(out.buffer);
  values.forEach((n, i) => v.setFloat32(i * 4, n, true));
  return out;
};

/* =========================================================== decode: the trust boundary === */

test('a payload that is not RIFF/WAVE is refused, not guessed at', () => {
  const mp3ish = new Uint8Array(200).fill(0xff);
  const r = A.decodeWav(mp3ish);
  assert.ok(A.isAudioFault(r), 'arbitrary bytes decoded as audio');
  assert.equal(r.code, 'not_riff');
});

test('µ-law is REFUSED rather than read as linear PCM', () => {
  // The dangerous case: format tag 7 is companded 8-bit. Reading those bytes as linear PCM
  // succeeds, produces a plausible buffer, and is wrong — a failure to decode rendered as audio.
  const bytes = wavBytes({ formatTag: 7, bits: 8, data: new Uint8Array([0x7f, 0x80, 0x7f, 0x80]) });
  const r = A.decodeWav(bytes);
  assert.ok(A.isAudioFault(r), 'µ-law was decoded instead of refused');
  assert.equal(r.code, 'unsupported_encoding');
  assert.match(r.detail, /µ-law|compressed|companded/i);
});

test('8-bit PCM is read as UNSIGNED — silence is 0x80, not -1.0', () => {
  // The bug this catches produces a file that is quiet nowhere: read as signed, every 0x80 byte
  // becomes -1.0 and a silent recording decodes as a DC-pinned square wave at full scale.
  const bytes = wavBytes({ bits: 8, data: new Uint8Array([128, 128, 128, 128]) });
  const r = A.decodeWav(bytes);
  assert.ok(!A.isAudioFault(r), `refused a valid 8-bit file: ${r.detail}`);
  for (const s of r.samples) assert.ok(Math.abs(s) < 0.01, `8-bit silence decoded to ${s}`);
});

test('a float payload carrying NaN is refused at the door', () => {
  // NaN compares false against every threshold in audio.ts, so one NaN sample turns every later
  // guard into a guard that passes. It has to die here or not at all.
  const bytes = wavBytes({ formatTag: 3, bits: 32, data: float32Data([0.1, NaN, 0.2, 0.3]) });
  const r = A.decodeWav(bytes);
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'non_finite_sample');
});

test('a chunk whose declared size overruns the buffer is clamped, not read past', () => {
  // The header is attacker-supplied. A data chunk claiming 4 GB inside a 60-byte file must not
  // throw out of DataView and must not walk into the next allocation.
  const bytes = wavBytes({ data: int16Data([100, -100, 200, -200]), declaredDataSize: 0xffffff00 });
  const r = A.decodeWav(bytes);
  assert.ok(!A.isAudioFault(r), `a clampable overrun was refused instead: ${r.detail}`);
  assert.equal(r.samples.length, 4, 'the decoder returned more frames than the file contains');
});

test('a chunk declaring size 0 terminates the walk', { timeout: 5000 }, () => {
  // `at = payloadAt + max(2, …)` is the infinite-loop guard. Without it the walker sits on the
  // same offset forever and this test never returns — which is why it carries a timeout.
  const zero = { id: 'LIST', payload: new Uint8Array(0), declared: 0 };
  const r = A.decodeWav(wavBytes({ data: int16Data([1, 2, 3, 4]), extraChunk: zero }));
  assert.ok(!A.isAudioFault(r), `the zero-length chunk broke the walk: ${r.detail}`);
  assert.equal(r.samples.length, 4);
});

test('a file with no data chunk is "no audio", not "silent audio"', () => {
  const bytes = wavBytes({ data: new Uint8Array(0), dataId: 'junk' });
  const r = A.decodeWav(bytes);
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'no_data_chunk');
});

test('an out-of-range sample rate is refused on decode', () => {
  const tooFast = A.decodeWav(wavBytes({ sampleRate: 192_000, data: int16Data([1, 2]) }));
  assert.ok(A.isAudioFault(tooFast));
  assert.equal(tooFast.code, 'unsupported_sample_rate');
});

test('a file that REALLY is longer than the duration cap is refused', () => {
  // Built for real, not declared. An earlier version of this test set a huge `declaredDataSize`
  // over four bytes of payload and asserted a refusal — and got a pass, because the decoder
  // clamps a lying chunk size to the bytes actually present, which is the behaviour the overrun
  // test above demands. A cap that can only be tripped by a lie has not been tested.
  const seconds = A.AUDIO_LIMITS.maxSeconds + 10;
  const rate = 8_000;
  const bytes = A.decodeWav(wavBytes({ sampleRate: rate, data: new Uint8Array(rate * 2 * seconds) }));
  assert.ok(A.isAudioFault(bytes), `${seconds}s decoded despite a ${A.AUDIO_LIMITS.maxSeconds}s cap`);
  assert.equal(bytes.code, 'too_long');
});

test('a payload over the byte cap is refused before it is parsed', () => {
  const r = A.decodeWav(new Uint8Array(A.AUDIO_LIMITS.maxBytes + 1));
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'too_large');
});

/* ================================================================== encode: round trips === */

test('32-bit float round-trips EXACTLY, so a decode mismatch is a codec bug not a rounding one', () => {
  const src = sine(440, 0.05, 0.731);
  const bytes = A.encodeWav(src, 32);
  assert.ok(!A.isAudioFault(bytes), 'float encode refused a healthy buffer');
  const back = A.decodeWav(bytes);
  assert.ok(!A.isAudioFault(back), `float decode refused our own encode: ${back.detail}`);
  assert.equal(back.sampleRate, src.sampleRate);
  assert.equal(back.channels, src.channels);
  assert.equal(back.samples.length, src.samples.length);
  for (let i = 0; i < src.samples.length; i++) {
    assert.equal(back.samples[i], src.samples[i], `float sample ${i} changed in the round trip`);
  }
});

test('16-bit round-trips within one quantisation step, and stereo interleaving survives', () => {
  const src = buffer(64, 2, RATE, (f, c) => (c === 0 ? 0.5 : -0.25) * Math.sin(f / 5));
  const back = A.decodeWav(A.encodeWav(src, 16));
  assert.ok(!A.isAudioFault(back), back.detail);
  assert.equal(back.channels, 2);
  for (let i = 0; i < src.samples.length; i++) {
    assert.ok(Math.abs(back.samples[i] - src.samples[i]) <= 1 / 32768 + 1e-7, `sample ${i} moved by more than one LSB`);
  }
  // Interleaving, stated as the relationship it is: channel 0 and channel 1 carry different
  // signals, so a decoder that lost the interleave would make them equal.
  assert.notEqual(back.samples[2], back.samples[3]);
});

test('ENCODE CLAMPS, NEVER WRAPS — a sample above full scale must not become a negative one', () => {
  // Quantising +1.5 as `round(1.5 * 32767)` overflows Int16 and wraps to a large negative value:
  // one hot sample becomes a full-scale click in the opposite direction. The clamp is the whole
  // reason this is not a one-line multiply.
  const hot = buffer(4, 1, RATE, (f) => [1.5, -1.9, 0.5, -0.5][f]);
  const back = A.decodeWav(A.encodeWav(hot, 16));
  assert.ok(!A.isAudioFault(back), back.detail);
  assert.ok(back.samples[0] > 0.99, `+1.5 encoded to ${back.samples[0]} — it wrapped`);
  assert.ok(back.samples[1] < -0.99, `-1.9 encoded to ${back.samples[1]} — it wrapped`);
  assert.ok(Math.abs(back.samples[2] - 0.5) < 0.001);
});

test('encoding a buffer that carries NaN is refused rather than written as zeros', () => {
  const broken = { sampleRate: RATE, channels: 1, samples: Float32Array.from([0.1, NaN, 0.2]) };
  const r = A.encodeWav(broken, 16);
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'non_finite_sample');
});

/* ======================================================================== normalisation === */

test('NORMALISING SILENCE reports that it did nothing, and does not produce NaN', () => {
  // target / 0 is Infinity, and Infinity * 0 is NaN. A NaN buffer then passes every comparison in
  // the rest of this file, so the damage is unbounded and invisible.
  const r = A.normalize(silence(0.1));
  assert.ok(!A.isAudioFault(r), 'silence should be a normal answer, not a fault');
  assert.equal(r.skipped, 'silent', 'a skipped normalisation must say so, not report 0 dB of gain');
  for (const s of r.audio.samples) assert.ok(Number.isFinite(s), `silence normalised to ${s}`);
});

test('normalisation lands the peak on target, and says when the ceiling stopped it', () => {
  const quiet = sine(300, 0.2, 0.25);
  const r = A.normalize(quiet, { targetPeakDbfs: -1 });
  assert.ok(!A.isAudioFault(r), r.detail);
  assert.ok(Math.abs(r.afterPeakDbfs - -1) < 0.15, `peak landed at ${r.afterPeakDbfs} dBFS, not -1`);
  assert.equal(r.gainClamped, false);
  // The relationship, not the literal: the gain applied is exactly the distance it had to travel.
  assert.ok(Math.abs(r.afterPeakDbfs - r.beforePeakDbfs - r.gainDb) < 0.15);

  const roomTone = A.normalize(sine(300, 0.2, 0.0005), { targetPeakDbfs: -1, maxGainDb: 12 });
  assert.equal(roomTone.gainClamped, true, 'a 66 dB boost was applied without reporting the clamp');
  assert.ok(roomTone.gainDb <= 12.001, `gain ${roomTone.gainDb} exceeded the 12 dB ceiling`);
});

test('a target above full scale is refused — it would guarantee the clipping it claims to avoid', () => {
  const r = A.normalize(sine(300, 0.05, 0.5), { targetPeakDbfs: 3 });
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'bad_parameter');
});

/* ============================================================================== mixing === */

test('MIXING TWO SAMPLE RATES IS REFUSED, because summing them by index halves the pitch', () => {
  const r = A.mixdown([
    { audio: sine(440, 0.1, 0.4, 16_000), name: 'voice' },
    { audio: sine(440, 0.1, 0.4, 8_000), name: 'music' },
  ]);
  assert.ok(A.isAudioFault(r), 'a 2:1 rate mismatch was summed into a valid, wrong file');
  assert.equal(r.code, 'rate_mismatch');
  assert.match(r.detail, /music/, 'the fault must name the offending track');
  assert.match(r.detail, /speed/, 'and say what the silent version would have done');
});

test('a channel-count mismatch is refused too', () => {
  const r = A.mixdown([
    { audio: sine(440, 0.05, 0.4, RATE, 1) },
    { audio: sine(440, 0.05, 0.4, RATE, 2) },
  ]);
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'channel_mismatch');
});

test('offsets place a clip in time — the mix is an arrangement, not a pile', () => {
  const blip = sine(1000, 0.05, 0.5);
  const r = A.mixdown([
    { audio: blip, startSeconds: 0, name: 'first' },
    { audio: blip, startSeconds: 0.5, name: 'second' },
  ]);
  assert.ok(!A.isAudioFault(r), r.detail);
  assert.ok(Math.abs(r.durationSeconds - 0.55) < 0.002, `arrangement ran ${r.durationSeconds}s`);

  // The gap between the two clips must be silent. An implementation that ignored `startSeconds`
  // would sum them at zero and leave nothing after 0.05s.
  const at = (sec) => Math.abs(r.audio.samples[Math.round(sec * RATE)]);
  assert.ok(Math.max(at(0.2), at(0.25), at(0.3)) < 1e-6, 'the gap between the clips is not silent');
  let energyLate = 0;
  for (let f = Math.round(0.5 * RATE); f < Math.round(0.55 * RATE); f++) energyLate += r.audio.samples[f] ** 2;
  assert.ok(energyLate > 0.1, 'the second clip never landed at its offset');
  assert.equal(r.tracks[1].startSeconds, 0.5);
});

test('gain is real decibels: +6 dB doubles the amplitude', () => {
  const src = sine(440, 0.05, 0.25);
  const flat = A.mixdown([{ audio: src }]);
  const up = A.mixdown([{ audio: src, gainDb: 6 }]);
  const ratio = Math.pow(10, (up.peakDbfs - flat.peakDbfs) / 20);
  assert.ok(Math.abs(ratio - 2) < 0.05, `+6 dB multiplied the amplitude by ${ratio.toFixed(3)}`);
});

test('a mix that clips REPORTS it instead of quietly riding the gain down', () => {
  // Silent auto-normalisation here would hide that the arrangement is too hot and would make
  // every mix quieter than the caller asked for. The number is the product.
  const loud = sine(300, 0.05, 0.8);
  const r = A.mixdown([{ audio: loud, name: 'a' }, { audio: loud, name: 'b' }]);
  assert.ok(!A.isAudioFault(r), r.detail);
  assert.ok(r.clippedSamples > 0, 'summing 0.8 + 0.8 did not report a single clipped sample');
  assert.ok(r.peakDbfs >= 0, `peak came back at ${r.peakDbfs} dBFS, so something silently attenuated`);
});

test('a non-finite offset or gain is refused — NaN would place a clip nowhere', () => {
  const src = sine(440, 0.02, 0.3);
  assert.equal(A.mixdown([{ audio: src, startSeconds: NaN }]).code, 'bad_parameter');
  assert.equal(A.mixdown([{ audio: src, gainDb: Infinity }]).code, 'bad_parameter');
  assert.equal(A.mixdown([{ audio: src, startSeconds: -1 }]).code, 'bad_parameter');
});

/* =============================================================== voice activity detection === */

test('SILENCE IS NOT SPEECH — the guard the whole detector hangs on', () => {
  // The bug: the threshold is relative to the file's own noise floor, and a silent file has none.
  // toDbfs clamps -Infinity to -120, so floor + 9 = -111, and every sample of any dither at all
  // is "above" that. Without the absolute floor this returns one segment covering the file and
  // every caller downstream believes it heard a sentence.
  const r = A.detectVoiceActivity(silence(2));
  assert.ok(!A.isAudioFault(r), r.detail);
  assert.deepEqual(r.segments, [], 'digital silence was detected as speech');
  assert.equal(r.speechSeconds, 0);
});

test('a MODULATED near-silent room is not speech — the fixture that pins the absolute floor', () => {
  // A fan, a fridge, a laptop coil: nothing here is speech, and the level pulses by 20 dB. That
  // modulation is what a purely relative threshold latches onto — its floor lands at -89 dBFS, it
  // opens at -80, and the louder half of the hum at -69 clears it. Mutating BOTH clamps out of
  // detectVoiceActivity turns this file into four confident segments of a silent room (verified by
  // mutation, not assumed). Uniform dither does NOT pin the guard — its frame levels are too even
  // to cross a relative threshold — so an earlier version of this test passed against the broken
  // code and proved nothing.
  const hum = buffer(RATE * 3, 1, RATE, (f) => {
    const loud = Math.floor(f / (RATE * 0.4)) % 2 === 0;
    return (loud ? 0.0005 : 0.00005) * Math.sin((2 * Math.PI * 120 * f) / RATE);
  });
  const r = A.detectVoiceActivity(hum);
  assert.deepEqual(r.segments, [], `a room at ${r.noiseFloorDbfs} dBFS was reported as speech`);
  assert.ok(r.thresholdDbfs >= -56, `the open threshold fell to ${r.thresholdDbfs} dBFS, below anything audible`);
});

test('uniform near-silent dither is not speech either', () => {
  const r = A.detectVoiceActivity(noise(2, 0.0004));
  assert.deepEqual(r.segments, [], `room tone at ${r.noiseFloorDbfs} dBFS was reported as speech`);
});

test('one burst in a quiet room comes back as ONE segment that contains it', () => {
  const room = () => noise(0.6, 0.002, 3);
  const speech = sine(220, 0.8, 0.4);
  const clip = concat(room(), speech, room());
  const r = A.detectVoiceActivity(clip);
  assert.equal(r.segments.length, 1, `expected one segment, got ${JSON.stringify(r.segments)}`);
  // The relationship that matters for a trimmer: the segment must CONTAIN the burst, never clip it.
  assert.ok(r.segments[0].startSeconds <= 0.6, `segment starts at ${r.segments[0].startSeconds}, after the speech began`);
  assert.ok(r.segments[0].endSeconds >= 1.4, `segment ends at ${r.segments[0].endSeconds}, before the speech ended`);
  assert.ok(r.speechSeconds >= 0.8);
});

test('hysteresis: a short gap inside a word does not split it, a long pause does', () => {
  const room = (s) => noise(s, 0.002, 11);
  const word = () => sine(220, 0.5, 0.4);
  const oneWord = A.detectVoiceActivity(concat(room(0.4), word(), room(0.08), word(), room(0.4)));
  assert.equal(oneWord.segments.length, 1, 'an 80 ms stop consonant split one word into two segments');

  const twoWords = A.detectVoiceActivity(concat(room(0.4), word(), room(1.0), word(), room(0.4)));
  assert.equal(twoWords.segments.length, 2, 'a one-second pause did not end the utterance');
});

test('a buffer carrying NaN is a fault, not an empty segment list', () => {
  // The dangerous alternative: NaN RMS compares false against the threshold, so every frame is
  // "not speech" and the detector reports a clean, confident, wrong nothing.
  const broken = { sampleRate: RATE, channels: 1, samples: Float32Array.from({ length: 800 }, (_, i) => (i === 400 ? NaN : 0.4)) };
  const r = A.detectVoiceActivity(broken);
  assert.ok(A.isAudioFault(r), 'a NaN buffer was analysed and reported as containing no speech');
  assert.equal(r.code, 'non_finite_sample');
});

test('inverted hysteresis is refused rather than run', () => {
  const r = A.detectVoiceActivity(sine(220, 0.3, 0.4), { thresholdDb: 3, releaseDb: 12 });
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'bad_parameter');
});

/* =========================================================================== denoise === */

test('the gate is calibrated on a MEASURED floor and attenuates the quiet part, not the loud one', () => {
  const room = () => noise(0.5, 0.01, 5);
  const speech = sine(300, 0.6, 0.5);
  const clip = concat(room(), speech, room());
  const r = A.denoise(clip, { thresholdDb: 10, reductionDb: 20 });
  assert.ok(!A.isAudioFault(r), r.detail);
  assert.ok(r.attenuatedFraction > 0.2, `the gate attenuated ${r.attenuatedFraction} of the file — it barely ran`);
  assert.ok(r.noiseFloorDbfs > -120 && r.noiseFloorDbfs < -20, `floor measured at ${r.noiseFloorDbfs} dBFS, which is not room tone`);

  // The claim is a RATIO, not a level: the noise must fall further than the speech does.
  const energy = (audio, from, to) => {
    let sum = 0;
    for (let f = Math.round(from * RATE); f < Math.round(to * RATE); f++) sum += audio.samples[f] ** 2;
    return sum;
  };
  const noiseBefore = energy(clip, 0.05, 0.45);
  const noiseAfter = energy(r.audio, 0.05, 0.45);
  const speechBefore = energy(clip, 0.7, 1.0);
  const speechAfter = energy(r.audio, 0.7, 1.0);
  assert.ok(noiseAfter < noiseBefore * 0.2, `noise energy only fell to ${(noiseAfter / noiseBefore).toFixed(3)} of itself`);
  assert.ok(speechAfter > speechBefore * 0.9, `the gate ate the speech too: ${(speechAfter / speechBefore).toFixed(3)} left`);
});

test('a negative reduction is refused — it would amplify the noise it claims to remove', () => {
  const r = A.denoise(noise(0.2, 0.05), { reductionDb: -12 });
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'bad_parameter');
});

/* =========================================================================== cleanup === */

test('cleanup removes a DC offset, and reports every stage that ran', () => {
  const offset = buffer(RATE, 1, RATE, (f) => 0.3 + 0.2 * Math.sin((2 * Math.PI * 300 * f) / RATE));
  const r = A.cleanup(offset, { denoise: false, repairClicks: false });
  assert.ok(!A.isAudioFault(r), r.detail);
  let mean = 0;
  for (const s of r.audio.samples) mean += s;
  mean /= r.audio.samples.length;
  assert.ok(Math.abs(mean) < 0.005, `mean is still ${mean.toFixed(4)} — the offset survived`);
  assert.ok(r.applied.includes('dc_offset'), `applied list was ${JSON.stringify(r.applied)}`);
  assert.ok(r.applied.some((s) => s.startsWith('high_pass')));
  assert.ok(!r.applied.some((s) => s.startsWith('denoise')), 'a disabled stage reported itself as applied');
});

test('an isolated click is repaired and counted; a clean file reports zero repairs', () => {
  const clean = sine(300, 0.2, 0.3);
  const clicked = { ...clean, samples: Float32Array.from(clean.samples) };
  clicked.samples[800] = 0.98;
  const r = A.repairClicks(clicked);
  assert.ok(!A.isAudioFault(r), r.detail);
  assert.equal(r.repaired, 1, `expected one repair, got ${r.repaired}`);
  assert.ok(Math.abs(r.audio.samples[800]) < 0.4, `the click is still at ${r.audio.samples[800]}`);

  // The other half: a de-clicker that "repairs" ordinary waveform motion has destroyed the file.
  const untouched = A.repairClicks(clean);
  assert.equal(untouched.repaired, 0, 'a clean sine was reported as containing clicks');
});

test('trimming a file with NO speech leaves it alone instead of trimming it to nothing', () => {
  // "I heard nothing" must not become "there is nothing". An empty selection here would return a
  // zero-length buffer and every caller downstream would read that as a successful trim.
  const r = A.cleanup(noise(1, 0.002, 21), { trimSilence: true });
  assert.ok(!A.isAudioFault(r), r.detail);
  assert.equal(r.trimmedSeconds, 0);
  assert.equal(r.audio.samples.length, RATE, 'a silent file was trimmed away');
});

test('trimming a file WITH speech actually shortens it', () => {
  const clip = concat(noise(0.8, 0.002, 31), sine(220, 0.7, 0.5), noise(0.8, 0.002, 41));
  const r = A.cleanup(clip, { trimSilence: true });
  assert.ok(r.trimmedSeconds > 0.5, `only ${r.trimmedSeconds}s were trimmed from 1.6s of room tone`);
  assert.ok(A.durationSeconds(r.audio) >= 0.7, 'the trim ate into the speech');
});

test('the high-pass attenuates rumble far more than it attenuates speech', () => {
  const rumble = A.highPass(sine(30, 0.3, 0.5), 80);
  const voice = A.highPass(sine(400, 0.3, 0.5), 80);
  const peak = (a) => Math.max(...a.samples.map(Math.abs));
  // The relationship is the claim: a filter that attenuated both equally is a volume knob.
  assert.ok(peak(rumble) < peak(voice) * 0.35, `30 Hz survived at ${peak(rumble).toFixed(3)} against 400 Hz at ${peak(voice).toFixed(3)}`);
  assert.ok(peak(voice) > 0.4, 'the "high pass" also ate the speech');
});

test('a cutoff at or above Nyquist is refused', () => {
  const r = A.highPass(sine(300, 0.05, 0.4), RATE);
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'bad_parameter');
});

/* ========================================================================== mastering === */

test('THE CEILING IS A GUARANTEE: a transient 30 dB over the bed comes back under it', () => {
  // A limiter that reacts after the peak has not limited it. The fixture is the shape that makes
  // the limiter necessary — a quiet bed whose RMS pulls the static gain UP, plus a short transient
  // that the raised gain would throw far past full scale. (A first draft used a constant loud sine
  // instead and proved nothing: the RMS target alone attenuated it below the ceiling and the
  // limiter never ran, so "the ceiling held" was true without the code under test doing anything.)
  const frames = RATE;
  const hot = buffer(frames, 1, RATE, (f) => {
    const bed = 0.02 * Math.sin((2 * Math.PI * 200 * f) / RATE);
    const inBurst = f >= 5_000 && f < 5_040;
    return inBurst ? bed + 0.95 * Math.sin((2 * Math.PI * 900 * f) / RATE) : bed;
  });
  const r = A.master(hot, { ceilingDbfs: -1, targetLoudnessDbfs: -18 });
  assert.ok(!A.isAudioFault(r), r.detail);
  assert.ok(r.gainDb > 6, `the bed should have been raised; gain was ${r.gainDb} dB`);
  assert.ok(r.after.peakDbfs <= -1 + 0.05, `peak came back at ${r.after.peakDbfs} dBFS, above the -1 ceiling`);
  assert.equal(r.after.clippedSamples, 0);
  assert.ok(r.maxGainReductionDb > 6, `the limiter reported only ${r.maxGainReductionDb} dB of reduction on a transient it had to pull down by far more`);
});

test('an ordinary clip lands on the loudness target and the limiter stays out of the way', () => {
  const src = sine(300, 0.5, 0.05);
  const r = A.master(src, { targetLoudnessDbfs: -18, ceilingDbfs: -1 });
  assert.ok(Math.abs(r.after.rmsDbfs - -18) < 0.5, `RMS landed at ${r.after.rmsDbfs} dBFS`);
  assert.ok(r.maxGainReductionDb < 0.01, `the limiter engaged (${r.maxGainReductionDb} dB) on a clip that never reached the ceiling`);
  assert.ok(r.after.peakDbfs > r.after.rmsDbfs, 'peak below RMS is arithmetically impossible — something is mis-measured');
});

test('mastering silence says it skipped, and returns finite samples', () => {
  const r = A.master(silence(0.2));
  assert.equal(r.skipped, 'silent');
  for (const s of r.audio.samples) assert.ok(Number.isFinite(s));
});

test('an RMS target above the peak ceiling is refused as arithmetically unreachable', () => {
  const r = A.master(sine(300, 0.1, 0.3), { targetLoudnessDbfs: -2, ceilingDbfs: -6 });
  assert.ok(A.isAudioFault(r));
  assert.equal(r.code, 'bad_parameter');
});

/* =========================================================================== waveform === */

test('peaks keep the envelope — the averaging trap would draw a flat line', () => {
  // A symmetric waveform averages to ~0 in every bucket, so an "average" waveform preview of loud
  // music is a straight line: a picture of nothing, presented as a measurement.
  const buckets = A.waveformPeaks(sine(200, 1, 0.9), 64);
  assert.ok(!A.isAudioFault(buckets), buckets.detail);
  assert.equal(buckets.length, 64);
  for (const b of buckets) {
    assert.ok(b.max > 0.8, `a full-scale sine produced a max of ${b.max}`);
    assert.ok(b.min < -0.8, `a full-scale sine produced a min of ${b.min}`);
  }
});

test('a quiet passage draws shorter than a loud one', () => {
  const clip = concat(sine(200, 0.5, 0.9), sine(200, 0.5, 0.05));
  const buckets = A.waveformPeaks(clip, 32);
  const loud = buckets[4];
  const quiet = buckets[28];
  assert.ok(loud.max > quiet.max * 5, `loud ${loud.max} against quiet ${quiet.max} — the preview is not level-dependent`);
});

test('an undrawable bucket count is refused', () => {
  assert.equal(A.waveformPeaks(sine(200, 0.1, 0.5), 0).code, 'bad_parameter');
  assert.equal(A.waveformPeaks(sine(200, 0.1, 0.5), 99_999).code, 'bad_parameter');
});

test('the rendered pixels paint more rows for a loud bucket than for a quiet one', () => {
  const clip = concat(sine(200, 0.5, 0.95), sine(200, 0.5, 0.03));
  const buckets = A.waveformPeaks(clip, 64);
  const img = A.waveformPixels(buckets, { width: 64, height: 40, background: [0, 0, 0], foreground: [255, 255, 255] });
  assert.ok(!A.isAudioFault(img), img.detail);
  assert.equal(img.rgb.length, 64 * 40 * 3);

  const litRows = (x) => {
    let n = 0;
    for (let y = 0; y < img.height; y++) if (img.rgb[(y * img.width + x) * 3] === 255) n++;
    return n;
  };
  assert.ok(litRows(8) > litRows(56) * 3, `loud column lit ${litRows(8)} rows, quiet column lit ${litRows(56)}`);
  // Even silence draws the centre line, so an empty column reads as silence rather than as a
  // renderer that gave up halfway through the image.
  assert.ok(litRows(56) >= 1, 'a quiet column painted nothing at all');
});
