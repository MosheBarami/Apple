// Procedural sound effects, EXECUTED — every preset rendered and measured, not spot-checked.
//
// The failure this file is built against is the one a sound catalogue is uniquely good at hiding:
// a preset that renders silence, or renders the same thing as its neighbour, and reports success
// either way. Nobody listens to twenty-two presets, and a test that only asserts "no exception"
// would pass on a synthesiser that returns zeros. So every preset is measured, and the assertions
// are RELATIONSHIPS — gravel is brighter than snow, ambience loops without a seam, a transposed
// clip is higher than the one it came from — because a literal ("peak is -1 dBFS") is satisfied by
// a normaliser running on garbage.
//
// Run with:  node --test tests/sfx.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-sfx-${process.pid}.mjs`);

await esbuild.build({ entryPoints: [join(WORKER, 'src', 'sfx.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT });
const S = await import(pathToFileURL(OUT).href);

const AUDIO_OUT = join(tmpdir(), `apple-sfx-audio-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'audio.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: AUDIO_OUT });
const A = await import(pathToFileURL(AUDIO_OUT).href);
process.on('exit', () => { rmSync(OUT, { force: true }); rmSync(AUDIO_OUT, { force: true }); });

// ---------------------------------------------------------------- measurement helpers ---

/** Energy above `hz`, as a fraction of total energy. Brightness, using the module's own filter. */
function highBandFraction(audio, hz) {
  const hi = A.highPass(audio, hz);
  assert.ok(!A.isAudioFault(hi), `highPass failed: ${hi.detail}`);
  const energy = (a) => { let s = 0; for (let i = 0; i < a.samples.length; i++) s += a.samples[i] ** 2; return s; };
  const total = energy(audio);
  return total > 0 ? energy(hi) / total : 0;
}

/** Zero crossings per second: a cheap, deterministic proxy for pitch and brightness. */
function zeroCrossingRate(audio) {
  let crossings = 0;
  for (let i = 1; i < audio.samples.length; i++) {
    if ((audio.samples[i - 1] < 0) !== (audio.samples[i] < 0)) crossings++;
  }
  return crossings / (audio.samples.length / audio.sampleRate);
}

function energyIn(audio, fromFraction, toFraction) {
  const from = Math.floor(audio.samples.length * fromFraction);
  const to = Math.floor(audio.samples.length * toFraction);
  let s = 0;
  for (let i = from; i < to; i++) s += audio.samples[i] ** 2;
  return s / Math.max(1, to - from);
}

const render = (preset, opts = {}) => {
  const r = S.renderSfx({ preset, ...opts });
  assert.ok(!A.isAudioFault(r), `${preset} refused: ${r.detail}`);
  return r;
};

/* ============================================================ every preset, measured === */

test('EVERY preset renders audible, finite, unclipped audio — none of them is silence', () => {
  // The assertion a catalogue actually needs. A preset that returns zeros passes "it did not
  // throw", passes "the duration is right", and is a dead entry nobody notices for a year.
  assert.ok(S.SFX_NAMES.length >= 20, `only ${S.SFX_NAMES.length} presets in the catalogue`);
  for (const name of S.SFX_NAMES) {
    const r = render(name);
    assert.ok(Number.isFinite(r.peakDbfs), `${name}: peak is ${r.peakDbfs}`);
    assert.ok(r.peakDbfs > -20, `${name} rendered at ${r.peakDbfs} dBFS peak — that is not a sound`);
    assert.ok(r.peakDbfs <= -0.95, `${name} peaked at ${r.peakDbfs} dBFS, over the mastering ceiling`);
    assert.ok(r.rmsDbfs > -60, `${name} has an RMS of ${r.rmsDbfs} dBFS — effectively silent`);
    for (let i = 0; i < r.audio.samples.length; i++) {
      assert.ok(Number.isFinite(r.audio.samples[i]), `${name} sample ${i} is ${r.audio.samples[i]}`);
    }
  }
});

test('every preset is a DISTINCT sound, not the same recipe under twenty-two names', () => {
  // Cheap fingerprint, strong claim: two presets whose rounded brightness AND length AND loudness
  // all coincide are almost certainly the same render.
  const seen = new Map();
  for (const name of S.SFX_NAMES) {
    const r = render(name);
    const key = [
      Math.round(zeroCrossingRate(r.audio) / 50),
      Math.round(r.seconds * 100),
      Math.round(r.rmsDbfs),
    ].join('/');
    assert.ok(!seen.has(key), `${name} is indistinguishable from ${seen.get(key)} (${key})`);
    seen.set(key, name);
  }
});

test('the catalogue advertises exactly what it can render', () => {
  const listed = S.sfxCatalogue();
  assert.equal(listed.length, S.SFX_NAMES.length);
  for (const entry of listed) {
    assert.ok(entry.summary.length > 10, `${entry.name} has no usable summary`);
    assert.ok(entry.use.length > 10, `${entry.name} does not say when to use it`);
    assert.ok(['footstep', 'ui', 'combat', 'ambience'].includes(entry.family), `${entry.name} has family ${entry.family}`);
    // The advertised length has to be the rendered length, or the model plans a timeline out of
    // numbers that are not true.
    const r = render(entry.name);
    assert.ok(Math.abs(r.seconds - entry.seconds) < 0.05, `${entry.name} advertises ${entry.seconds}s and renders ${r.seconds}s`);
  }
});

/* ==================================================================== the trust boundary === */

test('an unknown preset is refused, and the refusal names what this synthesiser actually is', () => {
  const r = S.renderSfx({ preset: 'the sound of a dragon eating a bell' });
  assert.ok(A.isAudioFault(r), 'a made-up preset rendered something');
  assert.equal(r.code, 'bad_parameter');
  assert.match(r.detail, /recipes, not descriptions/);
});

test('a prototype key is not a preset — `__proto__` and `constructor` are refused', () => {
  // `SFX['constructor']` on a plain object is a FUNCTION, and `.layers` off it is undefined: the
  // renderer would then loop over nothing and return a clip of silence with a valid report
  // attached. That is the shape this repository calls a failure to observe rendered as an
  // observation, and it is why the lookup uses hasOwnProperty rather than indexing.
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const r = S.renderSfx({ preset: key });
    assert.ok(A.isAudioFault(r), `"${key}" was accepted as a preset name`);
    assert.equal(r.code, 'bad_parameter');
  }
});

test('an absurd duration or sample rate is clamped into range rather than obeyed', () => {
  const huge = render('ui_click', { seconds: 1e9 });
  assert.ok(huge.seconds <= S.SFX_LIMITS.maxSeconds + 0.01, `rendered ${huge.seconds}s`);
  const nan = render('ui_click', { seconds: NaN, sampleRate: NaN, semitones: NaN, seed: NaN });
  // NaN must not reach the arithmetic: `frames = round(NaN * rate)` is NaN, and `new
  // Float32Array(NaN)` is a zero-length buffer — a silent clip reported as a success.
  assert.ok(nan.audio.samples.length > 100, `NaN options produced a ${nan.audio.samples.length}-sample clip`);
  assert.equal(nan.seed, 0);
  assert.equal(nan.semitones, 0);
});

/* ========================================================================= determinism === */

test('the same seed renders the SAME BYTES, and a different seed does not', () => {
  const a = render('footstep_gravel', { seed: 42 });
  const b = render('footstep_gravel', { seed: 42 });
  const c = render('footstep_gravel', { seed: 43 });
  assert.deepEqual([...a.audio.samples], [...b.audio.samples], 'the same seed produced different audio');
  assert.notDeepEqual([...a.audio.samples], [...c.audio.samples], 'the seed has no effect — the noise is not seeded at all');
});

test('a tonal preset with no noise layer is identical across seeds — the seed only moves noise', () => {
  const a = render('ui_confirm', { seed: 1 });
  const b = render('ui_confirm', { seed: 999 });
  assert.deepEqual([...a.audio.samples], [...b.audio.samples]);
});

/* ============================================================= the surfaces differ === */

test('FOOTSTEP SURFACES ARE ORDERED BY BRIGHTNESS: gravel > water > grass > snow', () => {
  // The whole claim of a footstep set. If every surface is the same filtered noise, the set is one
  // sound with seven names and the scene sounds wrong everywhere except by accident.
  //
  // Asserted as an ORDERING over the four surfaces whose character lives in the noise layer,
  // because an ordering cannot be satisfied by a shared filter with a different name on it. The
  // two tonal surfaces (wood, metal) are deliberately not in this list: their energy sits in a
  // ringing body, so they measure DARK on a brightness metric and belong to the ring test below.
  const brightness = (n) => highBandFraction(render(n).audio, 3000);
  const gravel = brightness('footstep_gravel');
  const water = brightness('footstep_water');
  const grass = brightness('footstep_grass');
  const snow = brightness('footstep_snow');
  assert.ok(gravel > water, `gravel ${gravel.toFixed(4)} is not brighter than water ${water.toFixed(4)}`);
  assert.ok(water > grass, `water ${water.toFixed(4)} is not brighter than grass ${grass.toFixed(4)}`);
  assert.ok(grass > snow, `grass ${grass.toFixed(4)} is not brighter than snow ${snow.toFixed(4)}`);
  assert.ok(gravel > snow * 3, `the whole range is only ${(gravel / snow).toFixed(2)}x — the filters barely differ`);
});

test('metal rings and grass does not — the tail is what carries the material', () => {
  // Measured as a RATIO of late energy to early energy, so it survives the mastering stage that
  // equalises the two clips' overall loudness.
  const ring = (name) => {
    const r = render(name);
    return energyIn(r.audio, 0.6, 1.0) / Math.max(1e-12, energyIn(r.audio, 0, 0.2));
  };
  assert.ok(ring('footstep_metal') > ring('footstep_grass') * 3, `metal ${ring('footstep_metal').toFixed(4)} vs grass ${ring('footstep_grass').toFixed(4)}`);
});

test('one-shots decay: the end is quieter than the beginning, for every non-looping preset', () => {
  for (const entry of S.sfxCatalogue()) {
    if (entry.loop) continue;
    const r = render(entry.name);
    const head = energyIn(r.audio, 0.0, 0.15);
    const tail = energyIn(r.audio, 0.9, 1.0);
    assert.ok(tail < head, `${entry.name} ends louder than it starts (${tail.toExponential(2)} vs ${head.toExponential(2)})`);
  }
});

test('every one-shot ENDS AT SILENCE, so nothing clicks on release', () => {
  // The most common defect in a generated effect, and completely invisible in a spectrum: the
  // final sample is not near zero, so playback ends on a step.
  for (const entry of S.sfxCatalogue()) {
    if (entry.loop) continue;
    const r = render(entry.name);
    const last = Math.abs(r.audio.samples[r.audio.samples.length - 1]);
    assert.ok(last < 0.02, `${entry.name} ends at ${last.toFixed(4)} — that is a click`);
  }
});

/* ================================================================= UI sounds are short === */

test('UI sounds stay under 200 ms unless they are a rare event', () => {
  // A sound the player hears ten thousand times has a different budget from one they hear twice.
  const frequent = ['ui_click', 'ui_open', 'ui_close'];
  for (const name of frequent) {
    const r = render(name);
    assert.ok(r.seconds <= 0.2, `${name} runs ${r.seconds}s — too long for a sound fired on every tap`);
  }
  assert.ok(render('ui_purchase').seconds >= 0.4, 'a purchase flourish that short does not read as an event');
});

test('ui_open and ui_close are mirror images — the sweep goes the other way', () => {
  // Asserted as a relationship between the two clips rather than as a property of either, because
  // "a sweep exists" is satisfied by two identical sweeps and the pair is the whole design.
  const open = render('ui_open').audio;
  const close = render('ui_close').audio;
  // Measured as the shift in high-band energy between the two halves of the clip. Zero-crossing
  // rate was the first metric here and it could not see the sweep at all: both presets carry a
  // noise layer whose crossings swamp a 420 Hz tone's, so the number reported the noise, not the
  // design. The band fraction weights by ENERGY, and the tone is where the energy is.
  const shift = (a) => {
    const half = Math.floor(a.samples.length / 2);
    const first = highBandFraction({ ...a, samples: a.samples.slice(0, half) }, 900);
    const second = highBandFraction({ ...a, samples: a.samples.slice(half) }, 900);
    return second - first;
  };
  assert.ok(shift(open) > 0.05, `ui_open does not rise in pitch (shift ${shift(open).toFixed(4)})`);
  assert.ok(shift(close) < -0.05, `ui_close does not fall in pitch (shift ${shift(close).toFixed(4)})`);
});

/* ======================================================================= transposition === */

test('transposing up raises the pitch, and transposing down lowers it', () => {
  const base = zeroCrossingRate(render('ui_coin', { semitones: 0 }).audio);
  const up = zeroCrossingRate(render('ui_coin', { semitones: 12 }).audio);
  const down = zeroCrossingRate(render('ui_coin', { semitones: -12 }).audio);
  assert.ok(up > base * 1.5, `+12 semitones moved the crossing rate from ${base.toFixed(0)} to ${up.toFixed(0)}`);
  assert.ok(down < base * 0.75, `-12 semitones moved it to ${down.toFixed(0)}`);
});

test('transposition is clamped, so a nonsense value cannot fold the oscillator past Nyquist', () => {
  const r = render('ui_coin', { semitones: 400 });
  assert.equal(r.semitones, S.SFX_LIMITS.maxSemitones);
  for (const s of r.audio.samples) assert.ok(Number.isFinite(s));
});

/* ============================================================================= loops === */

test('AMBIENCE LOOPS WITHOUT A SEAM, and a one-shot does not pretend to', () => {
  // A bed that clicks once every six seconds is worse than no bed: the click is the only thing
  // anyone hears. The seam is measured as the step from the last sample to the first, relative to
  // the clip's own peak, so it is a real property of the bytes rather than a claim by the renderer.
  for (const entry of S.sfxCatalogue()) {
    if (!entry.loop) continue;
    const r = render(entry.name);
    const seamDb = S.seamDiscontinuityDb(r.audio);
    // 9 dB: the wrap may not be more than ~2.8x a typical sample step. Measured, by mutation, on
    // the one bed the metric can see — ambience_machine reads 5.8 dB folded, 18.1 dB with the
    // crossfade ramps swapped and 17.1 dB with the fold removed entirely. So this threshold sits
    // between a correct fold and both of the ways of getting it wrong, rather than above both.
    assert.ok(seamDb < 9, `${entry.name} has a ${seamDb} dB anomaly at the loop point`);
    assert.ok(r.crossfadeMs > 0, `${entry.name} claims to loop but folded no crossfade`);
  }
});

test('an ambience bed is EVEN — no part of it is twice as loud as another', () => {
  // A loop with an event in it announces its own length as surely as a click does.
  for (const entry of S.sfxCatalogue()) {
    if (!entry.loop) continue;
    const r = render(entry.name);
    const slices = [0, 0.2, 0.4, 0.6, 0.8].map((from) => energyIn(r.audio, from, from + 0.2));
    const loudest = Math.max(...slices);
    const quietest = Math.min(...slices);
    assert.ok(loudest / quietest < 9, `${entry.name} varies by ${(10 * Math.log10(loudest / quietest)).toFixed(1)} dB across the loop`);
  }
});

test('ambience is mastered quieter than a one-shot, because it plays under everything', () => {
  const bed = render('ambience_wind').rmsDbfs;
  const hit = render('combat_impact_metal').rmsDbfs;
  assert.ok(bed < hit - 4, `bed at ${bed} dBFS against a one-shot at ${hit} dBFS — the bed will fight the action`);
});

/* ====================================================================== it is real WAV === */

test('a rendered effect survives the round trip through the WAV encoder', () => {
  const r = render('combat_explosion', { sampleRate: 22_050 });
  const bytes = A.encodeWav(r.audio, 16);
  assert.ok(!A.isAudioFault(bytes), bytes.detail);
  const back = A.decodeWav(bytes);
  assert.ok(!A.isAudioFault(back), back.detail);
  assert.equal(back.sampleRate, 22_050);
  assert.equal(back.channels, 1);
  assert.equal(back.samples.length, r.audio.samples.length);
  const peak = Math.max(...[...back.samples].map(Math.abs));
  assert.ok(peak > 0.7, `the encoded file peaks at ${peak} — the explosion did not survive`);
});
