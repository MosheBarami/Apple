// PCM audio: the container, the measurements, and the repairs — all of it pure.
//
// WHY THIS FILE HAS NO `Env` AND CALLS NOTHING. Every function here is a pure function of its
// arguments, which is what lets the tests feed it the violating input directly instead of
// arranging for the tree to produce one. A guard that is only ever walked on healthy audio has
// not been tested, and the audio path is unusually good at hiding that: a broken decoder returns
// silence, a broken gate returns silence, and a microphone that was muted returns silence. All
// three look identical downstream. So every failure here is a VALUE — an `AudioFault` — never an
// empty buffer and never a zero.
//
// THE FAILURE MODE THIS FILE IS BUILT AGAINST, in the repo's own words: a failure to observe must
// not render as an observation. Concretely, three shapes of it recur in audio DSP and each one is
// guarded here, with the guard named at the site:
//
//   1. A noise floor measured from digital silence is -Infinity. `-Infinity + 9` is still
//      -Infinity, and every finite frame is greater than -Infinity, so an energy gate calibrated
//      that way calls a silent recording "speech from 0.00s to the end". See SILENCE_FLOOR_DBFS.
//   2. A peak of exactly 0 makes a normalisation gain `target / 0` — Infinity — and scaling silence
//      by Infinity yields NaN, which then propagates through every later stage as quiet garbage
//      rather than as an error. See `normalize`.
//   3. A NaN sample compares false against every threshold, so it is never over one. A gate keeps
//      it, a limiter does not limit it, a clip counter does not count it. NaN is therefore refused
//      at the door by `finiteFault` rather than tested for downstream.
//
// SAMPLES ARE FLOATS IN [-1, 1], INTERLEAVED. Float is the working format because every stage here
// (gain, mixing, filtering, limiting) either overshoots 1.0 in the middle of the arithmetic or
// needs headroom to avoid quantising twice. Integers arrive and leave through `decodeWav` and
// `encodeWav`; nothing in between rounds.

// ---------------------------------------------------------------------------------------------
// The container
// ---------------------------------------------------------------------------------------------

export interface PcmAudio {
  sampleRate: number;
  /** 1 = mono, 2 = stereo. Samples are interleaved: L R L R … */
  channels: number;
  /** Interleaved samples in [-1, 1]. `length === frames * channels`. */
  samples: Float32Array;
}

/**
 * Every failure in this file, as a value.
 *
 * A code AND a sentence, because both readers matter: the tool dispatcher switches on the code and
 * the model reads the sentence. A bare `null` return would tell neither of them which of the
 * fifteen refusals below happened.
 */
export interface AudioFault {
  fault: true;
  code: AudioFaultCode;
  detail: string;
}

export type AudioFaultCode =
  | 'not_riff'
  | 'truncated'
  | 'no_fmt_chunk'
  | 'no_data_chunk'
  | 'unsupported_encoding'
  | 'unsupported_bit_depth'
  | 'unsupported_channels'
  | 'unsupported_sample_rate'
  | 'too_large'
  | 'too_long'
  | 'empty'
  | 'non_finite_sample'
  | 'rate_mismatch'
  | 'channel_mismatch'
  | 'bad_parameter';

export function isAudioFault(value: unknown): value is AudioFault {
  return typeof value === 'object' && value !== null && (value as AudioFault).fault === true;
}

const fault = (code: AudioFaultCode, detail: string): AudioFault => ({ fault: true, code, detail });

/**
 * Hard limits, enforced on DECODE rather than on use.
 *
 * The decoder is the trust boundary: a WAV header is an attacker-supplied description of how much
 * memory to allocate, and the two numbers that matter (`sampleRate`, `channels`) are read from it
 * and then multiplied. The caps are generous for the product's actual job — a voice command is
 * seconds, a voice-over line is a minute — and exist so that a crafted header cannot ask for a
 * gigabyte before a single sample has been read.
 */
export const AUDIO_LIMITS = {
  /** Longest clip this worker will decode. Voice input is seconds; nothing here needs an hour. */
  maxSeconds: 300,
  /** Largest encoded payload accepted. 12 MB is ~2 minutes of 48 kHz stereo 16-bit. */
  maxBytes: 12_000_000,
  minSampleRate: 8_000,
  maxSampleRate: 48_000,
  maxChannels: 2,
} as const;

/** Frames (per-channel samples) in a buffer. */
export function frameCount(audio: PcmAudio): number {
  return audio.channels > 0 ? Math.floor(audio.samples.length / audio.channels) : 0;
}

export function durationSeconds(audio: PcmAudio): number {
  return audio.sampleRate > 0 ? frameCount(audio) / audio.sampleRate : 0;
}

/**
 * Refuse a buffer carrying NaN or Infinity, at the door.
 *
 * NOT a formality. `NaN > threshold` is false, so a NaN sample is never "over" anything: a gate
 * keeps it, a limiter leaves it alone, a clipping counter does not count it, and a peak meter that
 * uses `Math.max` returns NaN for the whole file — which then compares false against every
 * threshold in turn. One NaN therefore turns every subsequent guard in the chain into a guard that
 * passes. It is cheaper and far more honest to reject the buffer once, here.
 */
function finiteFault(audio: PcmAudio, where: string): AudioFault | null {
  if (!Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0) {
    return fault('unsupported_sample_rate', `${where}: sample rate ${audio.sampleRate} is not a positive number`);
  }
  if (!Number.isInteger(audio.channels) || audio.channels < 1 || audio.channels > AUDIO_LIMITS.maxChannels) {
    return fault('unsupported_channels', `${where}: ${audio.channels} channels is not 1 or 2`);
  }
  if (audio.samples.length === 0) return fault('empty', `${where}: the buffer has no samples`);
  if (audio.samples.length % audio.channels !== 0) {
    return fault('truncated', `${where}: ${audio.samples.length} samples do not divide into ${audio.channels} channels`);
  }
  for (let i = 0; i < audio.samples.length; i++) {
    if (!Number.isFinite(audio.samples[i]!)) {
      return fault('non_finite_sample', `${where}: sample ${i} is ${audio.samples[i]}, which no threshold in this file can compare against`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------

/** Amplitude 1.0 is 0 dBFS. Digital silence is reported as this rather than as -Infinity. */
export const SILENCE_FLOOR_DBFS = -120;

/**
 * Amplitude → dBFS, with the -Infinity hole plugged.
 *
 * `20 * log10(0)` is -Infinity, and -Infinity poisons every comparison it later takes part in:
 * `floor + thresholdDb` stays -Infinity, and every finite frame is above it. The clamp turns the
 * unrepresentable answer into a representable one that is still unambiguously "silence" — no real
 * 16-bit recording reaches -120 dBFS, whose amplitude is a quarter of one LSB.
 */
export function toDbfs(amplitude: number): number {
  const a = Math.abs(amplitude);
  if (!Number.isFinite(a) || a <= 0) return SILENCE_FLOOR_DBFS;
  return Math.max(SILENCE_FLOOR_DBFS, 20 * Math.log10(a));
}

/** dB → linear gain. `fromDb(0) === 1`. */
export function fromDb(db: number): number {
  return Math.pow(10, db / 20);
}

/** Largest absolute sample. NaN-free by contract — callers validate first. */
export function peakAmplitude(audio: PcmAudio): number {
  let peak = 0;
  for (let i = 0; i < audio.samples.length; i++) {
    const a = Math.abs(audio.samples[i]!);
    if (a > peak) peak = a;
  }
  return peak;
}

export function rmsAmplitude(audio: PcmAudio): number {
  if (audio.samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < audio.samples.length; i++) sum += audio.samples[i]! * audio.samples[i]!;
  return Math.sqrt(sum / audio.samples.length);
}

export interface LevelReport {
  peakDbfs: number;
  rmsDbfs: number;
  /** Samples at or beyond full scale. Non-zero means the buffer will distort when quantised. */
  clippedSamples: number;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
}

export function measure(audio: PcmAudio): LevelReport | AudioFault {
  const bad = finiteFault(audio, 'measure');
  if (bad) return bad;
  let clipped = 0;
  for (let i = 0; i < audio.samples.length; i++) if (Math.abs(audio.samples[i]!) >= 1) clipped++;
  return {
    peakDbfs: Number(toDbfs(peakAmplitude(audio)).toFixed(2)),
    rmsDbfs: Number(toDbfs(rmsAmplitude(audio)).toFixed(2)),
    clippedSamples: clipped,
    durationSeconds: Number(durationSeconds(audio).toFixed(4)),
    sampleRate: audio.sampleRate,
    channels: audio.channels,
  };
}

// ---------------------------------------------------------------------------------------------
// WAV: decode
// ---------------------------------------------------------------------------------------------

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

const fourcc = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);

/**
 * Decode a RIFF/WAVE payload into float samples.
 *
 * EVERY LENGTH IN A WAV FILE IS ATTACKER-SUPPLIED. The RIFF size, each chunk size, the channel
 * count, the sample rate and the bit depth all come out of the header, and a naive reader
 * multiplies them together to decide how much to allocate and how far to walk. So each chunk
 * header is bounds-checked against the real buffer length before its payload is touched, the
 * advance is forced to be strictly positive (a declared size of 0 would otherwise spin forever on
 * the same chunk), and the data chunk is clamped to what is actually present rather than to what
 * the header claims. A file that lies is truncated at the truth, or refused.
 *
 * SUPPORTED: uncompressed PCM at 8/16/24/32 bit and IEEE float at 32 bit, mono or stereo,
 * 8–48 kHz. Everything else — µ-law, A-law, ADPCM, MP3-in-WAV, 64-bit float — is REFUSED rather
 * than approximated, because the one thing worse than "this worker cannot read that file" is a
 * decoder that reads µ-law bytes as linear PCM and hands back plausible-looking noise.
 */
export function decodeWav(bytes: Uint8Array): PcmAudio | AudioFault {
  if (bytes.length > AUDIO_LIMITS.maxBytes) {
    return fault('too_large', `${bytes.length} bytes is over the ${AUDIO_LIMITS.maxBytes}-byte limit`);
  }
  if (bytes.length < 44) return fault('truncated', `${bytes.length} bytes is shorter than the smallest possible WAV header`);
  if (fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WAVE') {
    return fault('not_riff', 'the payload does not begin with a RIFF/WAVE header, so it is not a WAV file');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let formatTag = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataAt = -1;
  let dataLength = 0;

  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = fourcc(bytes, at);
    const declared = view.getUint32(at + 4, true);
    const payloadAt = at + 8;
    // Clamp rather than trust: a chunk that claims to run past the end of the buffer is a lie, and
    // reading it would either throw inside DataView or walk into the next allocation.
    const payloadLength = Math.min(declared, bytes.length - payloadAt);

    if (id === 'fmt ' && payloadLength >= 16) {
      formatTag = view.getUint16(payloadAt, true);
      channels = view.getUint16(payloadAt + 2, true);
      sampleRate = view.getUint32(payloadAt + 4, true);
      bitsPerSample = view.getUint16(payloadAt + 14, true);
      if (formatTag === WAVE_FORMAT_EXTENSIBLE && payloadLength >= 40) {
        // WAVE_FORMAT_EXTENSIBLE hides the real encoding in the first two bytes of the SubFormat
        // GUID. Reading the tag alone and stopping would refuse every file written by a modern
        // recorder, all of which use EXTENSIBLE for anything above mono 16-bit.
        formatTag = view.getUint16(payloadAt + 24, true);
      }
    } else if (id === 'data') {
      dataAt = payloadAt;
      dataLength = payloadLength;
    }

    // RIFF pads odd-sized chunks to a word boundary. The advance is computed with ARITHMETIC, not
    // with `(declared + 1) & ~1`: bitwise operators coerce to int32, so a chunk declaring
    // 0xFFFFFF00 bytes — which a hostile or truncated file easily does — comes back NEGATIVE and
    // `at` moves backwards, which is an infinite loop on a file the decoder was about to refuse
    // anyway. Note also that progress is unconditionally at least 8 bytes (the chunk header),
    // even for a chunk declaring size 0, because `payloadAt` is already `at + 8`.
    at = payloadAt + (declared % 2 === 0 ? declared : declared + 1);
  }

  if (channels === 0 || sampleRate === 0) return fault('no_fmt_chunk', 'the file carries no readable fmt chunk, so its encoding is unknown');
  if (dataAt < 0) return fault('no_data_chunk', 'the file carries no data chunk, so it contains no audio');
  if (formatTag !== WAVE_FORMAT_PCM && formatTag !== WAVE_FORMAT_IEEE_FLOAT) {
    return fault(
      'unsupported_encoding',
      `format tag ${formatTag} is a compressed or companded encoding (µ-law, A-law, ADPCM and friends). This worker decodes uncompressed PCM and IEEE float only — reading those bytes as linear PCM would produce plausible noise rather than an error.`,
    );
  }
  if (formatTag === WAVE_FORMAT_IEEE_FLOAT && bitsPerSample !== 32) {
    return fault('unsupported_bit_depth', `IEEE float at ${bitsPerSample} bits is not supported; only 32-bit float is`);
  }
  if (formatTag === WAVE_FORMAT_PCM && ![8, 16, 24, 32].includes(bitsPerSample)) {
    return fault('unsupported_bit_depth', `${bitsPerSample}-bit PCM is not supported; 8, 16, 24 and 32 are`);
  }
  if (channels < 1 || channels > AUDIO_LIMITS.maxChannels) {
    return fault('unsupported_channels', `${channels} channels is outside the supported 1–${AUDIO_LIMITS.maxChannels}`);
  }
  if (sampleRate < AUDIO_LIMITS.minSampleRate || sampleRate > AUDIO_LIMITS.maxSampleRate) {
    return fault(
      'unsupported_sample_rate',
      `${sampleRate} Hz is outside the supported ${AUDIO_LIMITS.minSampleRate}–${AUDIO_LIMITS.maxSampleRate} Hz`,
    );
  }

  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = bytesPerSample * channels;
  const frames = Math.floor(dataLength / blockAlign);
  if (frames === 0) return fault('empty', 'the data chunk is present but holds no complete frame');
  if (frames / sampleRate > AUDIO_LIMITS.maxSeconds) {
    return fault('too_long', `${(frames / sampleRate).toFixed(1)}s is over the ${AUDIO_LIMITS.maxSeconds}s limit`);
  }

  const samples = new Float32Array(frames * channels);
  for (let i = 0; i < samples.length; i++) {
    const off = dataAt + i * bytesPerSample;
    let v: number;
    if (formatTag === WAVE_FORMAT_IEEE_FLOAT) {
      v = view.getFloat32(off, true);
      // A float WAV is the one encoding that can carry NaN and Infinity from disk straight into
      // the DSP chain. Refusing here is what makes `finiteFault` elsewhere a belt rather than the
      // only strap.
      if (!Number.isFinite(v)) return fault('non_finite_sample', `sample ${i} of the float payload is ${v}`);
      // Float WAV is not guaranteed to be inside [-1, 1]; keep the value, and let the caller's
      // level report say so, rather than silently clamping a legitimately hot master.
    } else if (bitsPerSample === 8) {
      // 8-bit PCM is UNSIGNED — the one depth in the format that is. Read as signed, silence
      // (0x80) decodes to -1.0 and the whole file arrives as a DC-pinned square wave.
      v = (view.getUint8(off) - 128) / 128;
    } else if (bitsPerSample === 16) {
      v = view.getInt16(off, true) / 32768;
    } else if (bitsPerSample === 24) {
      const lo = view.getUint8(off);
      const mid = view.getUint8(off + 1);
      const hi = view.getInt8(off + 2);
      v = ((hi << 16) | (mid << 8) | lo) / 8388608;
    } else {
      v = view.getInt32(off, true) / 2147483648;
    }
    samples[i] = v;
  }

  return { sampleRate, channels, samples };
}

// ---------------------------------------------------------------------------------------------
// WAV: encode
// ---------------------------------------------------------------------------------------------

export type WavBitDepth = 16 | 24 | 32;

/**
 * Encode float samples as a RIFF/WAVE file.
 *
 * 16-bit by default because that is what every tool on the other end reads without a question,
 * and what Roblox ingests. 32 selects IEEE float, which round-trips EXACTLY — the test uses that
 * property to separate "the codec is wrong" from "the codec quantised", which a 16-bit round-trip
 * alone cannot distinguish.
 *
 * CLAMPS, and says nothing about it. Quantising a sample above full scale wraps: +1.2 becomes a
 * large negative number and one hot sample turns into a loud click. Clamping is the only safe
 * behaviour at this layer — but it is also a silent repair, so the honest report of it belongs
 * upstream: `measure()` counts clipped samples, and `master()` prevents them existing at all.
 */
export function encodeWav(audio: PcmAudio, bitDepth: WavBitDepth = 16): Uint8Array | AudioFault {
  const bad = finiteFault(audio, 'encodeWav');
  if (bad) return bad;
  if (![16, 24, 32].includes(bitDepth)) return fault('unsupported_bit_depth', `${bitDepth}-bit output is not supported; 16, 24 and 32 are`);

  const floatOut = bitDepth === 32;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = bytesPerSample * audio.channels;
  const dataLength = audio.samples.length * bytesPerSample;
  const out = new Uint8Array(44 + dataLength);
  const view = new DataView(out.buffer);

  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, floatOut ? WAVE_FORMAT_IEEE_FLOAT : WAVE_FORMAT_PCM, true);
  view.setUint16(22, audio.channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  ascii(36, 'data');
  view.setUint32(40, dataLength, true);

  for (let i = 0; i < audio.samples.length; i++) {
    const at = 44 + i * bytesPerSample;
    const s = audio.samples[i]!;
    if (floatOut) {
      view.setFloat32(at, s, true);
      continue;
    }
    const clamped = Math.max(-1, Math.min(1, s));
    if (bitDepth === 16) {
      // Asymmetric on purpose: two's complement has one more negative step than positive, so
      // scaling by 32767 for positives and 32768 for negatives uses the full range without
      // wrapping +1.0 to -32768.
      view.setInt16(at, Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767), true);
    } else {
      const v = Math.round(clamped < 0 ? clamped * 8388608 : clamped * 8388607);
      view.setUint8(at, v & 0xff);
      view.setUint8(at + 1, (v >> 8) & 0xff);
      view.setUint8(at + 2, (v >> 16) & 0xff);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------

export interface NormalizeOptions {
  /** Where the loudest sample should land. -1 dBFS leaves a sliver of headroom for re-encoding. */
  targetPeakDbfs?: number;
  /** Ceiling on the boost. Without it, near-silence is amplified into a wall of room tone. */
  maxGainDb?: number;
}

export interface NormalizeResult {
  audio: PcmAudio;
  /** dB actually applied. 0 means the buffer was already at target. */
  gainDb: number;
  /** True when `maxGainDb` stopped the gain short of the target. */
  gainClamped: boolean;
  beforePeakDbfs: number;
  afterPeakDbfs: number;
  /** Set when nothing was done, and why. Never silently empty. */
  skipped?: 'silent';
}

/**
 * Bring the loudest sample to a target level.
 *
 * THE DIVISION THAT IS NOT PERFORMED. The gain is `target / peak`, and `peak` is 0 for digital
 * silence — so the natural expression yields Infinity, and `Infinity * 0` is NaN, which then
 * spreads through every later stage as a buffer that is neither loud nor quiet nor detectably
 * wrong. `??` does not help here: the value is not null, it is a number that is not a number. The
 * silent case is therefore answered explicitly, BEFORE the division, and reported as `skipped`
 * rather than as a gain of 0 dB — "I did nothing because there was nothing" and "it was already
 * at target" are different answers and the caller can act on the difference.
 *
 * THE CEILING IS NOT COSMETIC EITHER. A recording whose peak is -60 dBFS is not quiet speech, it
 * is room tone, and normalising it to -1 would raise the noise by 59 dB. `maxGainDb` bounds the
 * damage and says it was bounded.
 */
export function normalize(audio: PcmAudio, opts: NormalizeOptions = {}): NormalizeResult | AudioFault {
  const bad = finiteFault(audio, 'normalize');
  if (bad) return bad;
  const targetPeakDbfs = numberOr(opts.targetPeakDbfs, -1);
  const maxGainDb = numberOr(opts.maxGainDb, 24);
  if (targetPeakDbfs > 0) return fault('bad_parameter', `a target of ${targetPeakDbfs} dBFS is above full scale and would guarantee clipping`);
  if (maxGainDb < 0) return fault('bad_parameter', `maxGainDb ${maxGainDb} is negative, which would force attenuation regardless of level`);

  const peak = peakAmplitude(audio);
  const beforePeakDbfs = Number(toDbfs(peak).toFixed(2));
  if (peak <= 0) {
    return {
      audio,
      gainDb: 0,
      gainClamped: false,
      beforePeakDbfs,
      afterPeakDbfs: beforePeakDbfs,
      skipped: 'silent',
    };
  }

  const wanted = targetPeakDbfs - 20 * Math.log10(peak);
  const gainDb = Math.min(wanted, maxGainDb);
  const gain = fromDb(gainDb);
  const out = new Float32Array(audio.samples.length);
  for (let i = 0; i < audio.samples.length; i++) out[i] = audio.samples[i]! * gain;
  const scaled: PcmAudio = { sampleRate: audio.sampleRate, channels: audio.channels, samples: out };
  return {
    audio: scaled,
    gainDb: Number(gainDb.toFixed(2)),
    gainClamped: wanted > maxGainDb,
    beforePeakDbfs,
    afterPeakDbfs: Number(toDbfs(peakAmplitude(scaled)).toFixed(2)),
  };
}

// ---------------------------------------------------------------------------------------------
// Mixing, and the arrangement that mixing walks
// ---------------------------------------------------------------------------------------------

export interface MixTrack {
  audio: PcmAudio;
  /** Where this clip starts in the mix. Offsets are what make a mix an arrangement. */
  startSeconds?: number;
  gainDb?: number;
  /** For the report, so a clipped mix names the clip that pushed it over. */
  name?: string;
}

export interface MixResult {
  audio: PcmAudio;
  durationSeconds: number;
  peakDbfs: number;
  /**
   * Samples the SUM pushed past full scale. Reported, never silently fixed: automatic gain
   * riding here would make every mix quieter than the caller asked for and hide the fact that the
   * arrangement is too hot. `master()` is the stage that fixes it, on request.
   */
  clippedSamples: number;
  tracks: { name: string; startSeconds: number; endSeconds: number; gainDb: number }[];
}

/**
 * Sum clips onto one timeline.
 *
 * SAMPLE RATES ARE NOT RECONCILED, THEY ARE REFUSED. Mixing 44.1 kHz into a 22.05 kHz buffer by
 * index — which is what a loop that ignores the rate does — plays the clip at double speed, and
 * it does it without erroring: the output is a valid, plausible, wrong file. Resampling would be
 * the other honest answer, but a silent resample changes what the caller mixed. So the mismatch
 * is a fault with both rates in the message.
 */
export function mixdown(tracks: MixTrack[], opts: { channels?: number } = {}): MixResult | AudioFault {
  if (!Array.isArray(tracks) || tracks.length === 0) return fault('empty', 'mixdown was given no tracks');

  const first = tracks[0]!.audio;
  const sampleRate = first.sampleRate;
  const channels = numberOr(opts.channels, first.channels);

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    const bad = finiteFault(t.audio, `mixdown track ${i}${t.name ? ` (${t.name})` : ''}`);
    if (bad) return bad;
    if (t.audio.sampleRate !== sampleRate) {
      return fault(
        'rate_mismatch',
        `track ${i}${t.name ? ` (${t.name})` : ''} is ${t.audio.sampleRate} Hz but the mix is ${sampleRate} Hz — mixing them by index would play it at ${(t.audio.sampleRate / sampleRate).toFixed(2)}x speed`,
      );
    }
    if (t.audio.channels !== channels) {
      return fault(
        'channel_mismatch',
        `track ${i}${t.name ? ` (${t.name})` : ''} has ${t.audio.channels} channels but the mix has ${channels}`,
      );
    }
    if (t.startSeconds !== undefined && (!Number.isFinite(t.startSeconds) || t.startSeconds < 0)) {
      return fault('bad_parameter', `track ${i} starts at ${t.startSeconds}s, which is not a position on a timeline`);
    }
    if (t.gainDb !== undefined && !Number.isFinite(t.gainDb)) {
      return fault('bad_parameter', `track ${i} has gain ${t.gainDb} dB, which is not a number of decibels`);
    }
  }

  const placed = tracks.map((t, i) => {
    const startSeconds = numberOr(t.startSeconds, 0);
    const startFrame = Math.round(startSeconds * sampleRate);
    const frames = frameCount(t.audio);
    return {
      track: t,
      name: t.name ?? `track ${i + 1}`,
      startFrame,
      frames,
      gain: fromDb(numberOr(t.gainDb, 0)),
      gainDb: numberOr(t.gainDb, 0),
      startSeconds,
      endSeconds: (startFrame + frames) / sampleRate,
    };
  });

  const totalFrames = placed.reduce((n, p) => Math.max(n, p.startFrame + p.frames), 0);
  if (totalFrames <= 0) return fault('empty', 'every track in the mix is empty');
  if (totalFrames / sampleRate > AUDIO_LIMITS.maxSeconds) {
    return fault('too_long', `the arrangement runs ${(totalFrames / sampleRate).toFixed(1)}s, over the ${AUDIO_LIMITS.maxSeconds}s limit`);
  }

  const samples = new Float32Array(totalFrames * channels);
  for (const p of placed) {
    const src = p.track.audio.samples;
    const base = p.startFrame * channels;
    for (let i = 0; i < src.length; i++) samples[base + i] = samples[base + i]! + src[i]! * p.gain;
  }

  const mixed: PcmAudio = { sampleRate, channels, samples };
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]!) >= 1) clipped++;

  return {
    audio: mixed,
    durationSeconds: Number((totalFrames / sampleRate).toFixed(4)),
    peakDbfs: Number(toDbfs(peakAmplitude(mixed)).toFixed(2)),
    clippedSamples: clipped,
    tracks: placed.map((p) => ({
      name: p.name,
      startSeconds: Number(p.startSeconds.toFixed(3)),
      endSeconds: Number(p.endSeconds.toFixed(3)),
      gainDb: p.gainDb,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Filters and repairs
// ---------------------------------------------------------------------------------------------

/** Per-channel view of an interleaved buffer, so a filter never smears L into R. */
function channelOf(audio: PcmAudio, ch: number): Float32Array {
  const frames = frameCount(audio);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) out[f] = audio.samples[f * audio.channels + ch]!;
  return out;
}

function fromChannels(channels: Float32Array[], sampleRate: number): PcmAudio {
  const frames = channels[0]!.length;
  const samples = new Float32Array(frames * channels.length);
  for (let f = 0; f < frames; f++) for (let c = 0; c < channels.length; c++) samples[f * channels.length + c] = channels[c]![f]!;
  return { sampleRate, channels: channels.length, samples };
}

/**
 * A second-order Butterworth high-pass (RBJ cookbook coefficients, Q = 1/sqrt(2)).
 *
 * Why an actual biquad rather than a one-pole: the thing being removed is handling rumble and
 * breath under about 80 Hz, and a one-pole rolls off at 6 dB/octave — at 40 Hz, one octave down,
 * it has removed 6 dB of a component that is 30 dB too loud. 12 dB/octave is the shallowest
 * filter that does the job it claims to.
 */
export function highPass(audio: PcmAudio, cutoffHz: number): PcmAudio | AudioFault {
  const bad = finiteFault(audio, 'highPass');
  if (bad) return bad;
  if (!Number.isFinite(cutoffHz) || cutoffHz <= 0 || cutoffHz >= audio.sampleRate / 2) {
    return fault('bad_parameter', `a ${cutoffHz} Hz cutoff is not below the ${audio.sampleRate / 2} Hz Nyquist limit`);
  }
  const w0 = (2 * Math.PI * cutoffHz) / audio.sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const b0 = (1 + cos) / 2;
  const b1 = -(1 + cos);
  const b2 = (1 + cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  const out: Float32Array[] = [];
  for (let c = 0; c < audio.channels; c++) {
    const x = channelOf(audio, c);
    const y = new Float32Array(x.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xn = x[i]!;
      const yn = (b0 / a0) * xn + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
      y[i] = yn;
      x2 = x1;
      x1 = xn;
      y2 = y1;
      y1 = yn;
    }
    out.push(y);
  }
  return fromChannels(out, audio.sampleRate);
}

/** Subtract the mean. A DC offset costs headroom on one side and inaudibly thumps every edit. */
export function removeDcOffset(audio: PcmAudio): PcmAudio | AudioFault {
  const bad = finiteFault(audio, 'removeDcOffset');
  if (bad) return bad;
  const out: Float32Array[] = [];
  for (let c = 0; c < audio.channels; c++) {
    const x = channelOf(audio, c);
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i]!;
    const mean = sum / x.length;
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[i]! - mean;
    out.push(y);
  }
  return fromChannels(out, audio.sampleRate);
}

export interface DenoiseOptions {
  /** Frames this loud ABOVE the measured floor pass untouched. */
  thresholdDb?: number;
  /** How hard everything below the threshold is pushed down, in dB. */
  reductionDb?: number;
  /** Envelope smoothing, so the gate opens and closes without a click. */
  attackMs?: number;
  releaseMs?: number;
}

export interface DenoiseResult {
  audio: PcmAudio;
  /** What the quiet part of the recording actually measured. The whole gate hangs off this. */
  noiseFloorDbfs: number;
  /** Fraction of the file the gate attenuated, 0–1. Zero means it did nothing — say so. */
  attenuatedFraction: number;
  thresholdDbfs: number;
}

/**
 * A downward expander calibrated against the recording's OWN noise floor.
 *
 * NOT SPECTRAL SUBTRACTION, and the name in the result says so: this removes hiss between words,
 * not hiss underneath them. Claiming otherwise would be the more damaging kind of lie, because
 * the output of a bad spectral denoiser and of a good one both sound like "something happened".
 *
 * THE FLOOR IS MEASURED, NOT ASSUMED, and the measurement is the 10th percentile of frame RMS
 * rather than the minimum. The minimum of any real recording is a single near-zero frame between
 * two waveform zero-crossings, so a gate calibrated on it sits at -90 dB and never closes — a
 * denoiser that runs, reports success, and removes nothing.
 *
 * AND THE FLOOR IS CLAMPED. `toDbfs` already refuses to return -Infinity for silence (see
 * SILENCE_FLOOR_DBFS); without that, a digitally silent lead-in would set the floor to -Infinity,
 * the threshold to -Infinity, and every frame in the file would be above it.
 */
export function denoise(audio: PcmAudio, opts: DenoiseOptions = {}): DenoiseResult | AudioFault {
  const bad = finiteFault(audio, 'denoise');
  if (bad) return bad;
  const thresholdDb = numberOr(opts.thresholdDb, 8);
  const reductionDb = numberOr(opts.reductionDb, 18);
  if (reductionDb < 0) return fault('bad_parameter', `a reduction of ${reductionDb} dB would AMPLIFY the noise`);

  const frameLen = Math.max(1, Math.round((audio.sampleRate * 20) / 1000));
  const floorDbfs = noiseFloorDbfs(audio, frameLen);
  const thresholdDbfs = floorDbfs + thresholdDb;
  const threshold = fromDb(thresholdDbfs);
  const reduction = fromDb(-reductionDb);

  const attack = coefficient(numberOr(opts.attackMs, 5), audio.sampleRate);
  const release = coefficient(numberOr(opts.releaseMs, 80), audio.sampleRate);

  const frames = frameCount(audio);
  const samples = new Float32Array(audio.samples.length);
  let gain = 1;
  let attenuatedFrames = 0;
  for (let f = 0; f < frames; f++) {
    let level = 0;
    for (let c = 0; c < audio.channels; c++) level = Math.max(level, Math.abs(audio.samples[f * audio.channels + c]!));
    const target = level >= threshold ? 1 : reduction;
    // Envelope, not a switch: flipping gain between 1 and 0.12 on a sample boundary is a step
    // discontinuity, which is a click — and a denoiser that adds clicks is worse than none.
    gain = target > gain ? gain + (target - gain) * attack : gain + (target - gain) * release;
    if (gain < 0.999) attenuatedFrames++;
    for (let c = 0; c < audio.channels; c++) samples[f * audio.channels + c] = audio.samples[f * audio.channels + c]! * gain;
  }

  return {
    audio: { sampleRate: audio.sampleRate, channels: audio.channels, samples },
    noiseFloorDbfs: Number(floorDbfs.toFixed(2)),
    thresholdDbfs: Number(thresholdDbfs.toFixed(2)),
    attenuatedFraction: frames > 0 ? Number((attenuatedFrames / frames).toFixed(4)) : 0,
  };
}

/** One-pole smoothing coefficient for a time constant in ms. 0 ms means "instant", not "never". */
function coefficient(ms: number, sampleRate: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return 1 - Math.exp(-1 / ((ms / 1000) * sampleRate));
}

/** The 10th percentile of frame RMS, in dBFS. See `denoise` for why not the minimum. */
function noiseFloorDbfs(audio: PcmAudio, frameLen: number): number {
  const frames = frameCount(audio);
  const levels: number[] = [];
  for (let start = 0; start < frames; start += frameLen) {
    const end = Math.min(frames, start + frameLen);
    let sum = 0;
    let n = 0;
    for (let f = start; f < end; f++) {
      for (let c = 0; c < audio.channels; c++) {
        const s = audio.samples[f * audio.channels + c]!;
        sum += s * s;
        n++;
      }
    }
    if (n > 0) levels.push(Math.sqrt(sum / n));
  }
  if (levels.length === 0) return SILENCE_FLOOR_DBFS;
  levels.sort((a, b) => a - b);
  const idx = Math.min(levels.length - 1, Math.floor(levels.length * 0.1));
  return toDbfs(levels[idx]!);
}

export interface CleanupOptions {
  /** Rumble filter corner. 80 Hz is below every speech fundamental and above most handling noise. */
  highPassHz?: number;
  denoise?: DenoiseOptions | false;
  /** Trim leading and trailing non-speech using the same detector `detectVoiceActivity` uses. */
  trimSilence?: boolean;
  /** Repair isolated impulse spikes (a tap on the mic, a dropped packet). */
  repairClicks?: boolean;
}

export interface CleanupResult {
  audio: PcmAudio;
  /** Every stage that RAN, in order. An empty list is a legitimate answer and is visible as one. */
  applied: string[];
  clicksRepaired: number;
  trimmedSeconds: number;
  before: LevelReport;
  after: LevelReport;
}

/**
 * The repair chain for a RECORDING, as opposed to a single stage.
 *
 * Order is not arbitrary and is the reason this is a function rather than four calls at the call
 * site: DC first (an offset biases every later measurement), then rumble (so the noise floor is
 * measured on the band that carries speech, not on 20 Hz handling noise), then clicks (an impulse
 * would otherwise set the peak and defeat the gate's calibration), then the gate, then the trim.
 * Trimming before gating would cut on room tone; gating before de-clicking would open the gate on
 * the click.
 *
 * `applied` is the honest record of which stages ran, because every one of them is skippable and a
 * chain that silently did nothing must not return the same shape as one that did everything.
 */
export function cleanup(audio: PcmAudio, opts: CleanupOptions = {}): CleanupResult | AudioFault {
  const bad = finiteFault(audio, 'cleanup');
  if (bad) return bad;
  const before = measure(audio);
  if (isAudioFault(before)) return before;

  const applied: string[] = [];
  let work = audio;

  const dc = removeDcOffset(work);
  if (isAudioFault(dc)) return dc;
  work = dc;
  applied.push('dc_offset');

  const cutoff = numberOr(opts.highPassHz, 80);
  if (cutoff > 0) {
    const hp = highPass(work, cutoff);
    if (isAudioFault(hp)) return hp;
    work = hp;
    applied.push(`high_pass_${cutoff}hz`);
  }

  let clicksRepaired = 0;
  if (opts.repairClicks !== false) {
    const declicked = repairClicks(work);
    if (isAudioFault(declicked)) return declicked;
    work = declicked.audio;
    clicksRepaired = declicked.repaired;
    if (clicksRepaired > 0) applied.push(`declick_${clicksRepaired}`);
  }

  if (opts.denoise !== false) {
    const gated = denoise(work, opts.denoise ?? {});
    if (isAudioFault(gated)) return gated;
    work = gated.audio;
    applied.push(`denoise_floor_${gated.noiseFloorDbfs}dbfs`);
  }

  let trimmedSeconds = 0;
  if (opts.trimSilence) {
    const vad = detectVoiceActivity(work);
    if (isAudioFault(vad)) return vad;
    if (vad.segments.length > 0) {
      const startSeconds = vad.segments[0]!.startSeconds;
      const endSeconds = vad.segments[vad.segments.length - 1]!.endSeconds;
      const sliced = slice(work, startSeconds, endSeconds);
      if (isAudioFault(sliced)) return sliced;
      trimmedSeconds = Number((durationSeconds(work) - durationSeconds(sliced)).toFixed(3));
      work = sliced;
      applied.push(`trim_${trimmedSeconds}s`);
    }
    // No segments means the detector found no speech. The buffer is returned UNTRIMMED and
    // `trimmedSeconds` stays 0 — trimming to an empty selection would turn "I heard nothing" into
    // "there is nothing", which is the substitution this repository exists to refuse.
  }

  const after = measure(work);
  if (isAudioFault(after)) return after;
  return { audio: work, applied, clicksRepaired, trimmedSeconds, before, after };
}

/**
 * Replace isolated impulse spikes with a straight line across the gap.
 *
 * THE THRESHOLD IS BUILT FROM FIRST DIFFERENCES, NOT FROM RMS, and the difference is the whole
 * detector. A click is defined by how fast the waveform moves, not by how loud it is: a 300 Hz
 * sine at -10 dBFS has an RMS of 0.21 and moves about 0.035 per sample, so a full-scale click
 * inside it is a 20x anomaly in SLOPE and only a 4x anomaly in LEVEL. Calibrating on RMS
 * therefore misses the click in quiet material — and misses it silently, reporting zero repairs
 * on a file that audibly ticks.
 *
 * Relative for the same reason the gate is: an absolute slope threshold would call every drum
 * transient a click in bright material and find nothing at all in dull material.
 */
export function repairClicks(audio: PcmAudio, thresholdRatio = 8): { audio: PcmAudio; repaired: number } | AudioFault {
  const bad = finiteFault(audio, 'repairClicks');
  if (bad) return bad;
  if (!Number.isFinite(thresholdRatio) || thresholdRatio <= 1) {
    return fault('bad_parameter', `a ratio of ${thresholdRatio} would treat ordinary waveform motion as a click`);
  }

  // RMS of the sample-to-sample difference: the ordinary speed of this material.
  let diffSq = 0;
  let diffN = 0;
  for (let c = 0; c < audio.channels; c++) {
    const x = channelOf(audio, c);
    for (let i = 1; i < x.length; i++) {
      const d = x[i]! - x[i - 1]!;
      diffSq += d * d;
      diffN++;
    }
  }
  // A constant buffer has no slope at all, so nothing can be anomalous against it. Returning 0
  // repairs is the honest answer; dividing by it would not be.
  if (diffN === 0 || diffSq <= 0) return { audio, repaired: 0 };
  const limit = Math.sqrt(diffSq / diffN) * thresholdRatio;

  const out: Float32Array[] = [];
  let repaired = 0;
  for (let c = 0; c < audio.channels; c++) {
    const x = channelOf(audio, c);
    const y = Float32Array.from(x);
    for (let i = 1; i < x.length - 1; i++) {
      const prev = y[i - 1]!;
      const next = x[i + 1]!;
      const here = x[i]!;
      // Isolated: far from BOTH neighbours, and the neighbours are close to each other. A real
      // transient satisfies the first half and fails the second.
      if (Math.abs(here - prev) > limit && Math.abs(here - next) > limit && Math.abs(next - prev) < limit) {
        y[i] = (prev + next) / 2;
        repaired++;
      }
    }
    out.push(y);
  }
  return { audio: fromChannels(out, audio.sampleRate), repaired };
}

/** Cut [startSeconds, endSeconds) out of a buffer. Bounds are clamped, never wrapped. */
export function slice(audio: PcmAudio, startSeconds: number, endSeconds: number): PcmAudio | AudioFault {
  const bad = finiteFault(audio, 'slice');
  if (bad) return bad;
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    return fault('bad_parameter', `slice(${startSeconds}, ${endSeconds}) is not a range`);
  }
  const frames = frameCount(audio);
  const from = Math.max(0, Math.min(frames, Math.round(startSeconds * audio.sampleRate)));
  const to = Math.max(from, Math.min(frames, Math.round(endSeconds * audio.sampleRate)));
  if (to <= from) return fault('empty', `slice(${startSeconds}, ${endSeconds}) selects no frames`);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    samples: audio.samples.slice(from * audio.channels, to * audio.channels),
  };
}

// ---------------------------------------------------------------------------------------------
// Voice activity detection
// ---------------------------------------------------------------------------------------------

export interface VadOptions {
  frameMs?: number;
  /** dB above the measured noise floor at which a frame starts a speech run. */
  thresholdDb?: number;
  /** dB above the floor at which an ongoing run ENDS. Lower than `thresholdDb`: hysteresis. */
  releaseDb?: number;
  /** Runs shorter than this are not speech — they are a chair, a click, a breath. */
  minSpeechMs?: number;
  /** Gaps shorter than this do not end a run — they are the stop consonant inside a word. */
  minSilenceMs?: number;
  /** Extra audio kept either side of a run, so a segment does not begin mid-plosive. */
  padMs?: number;
  /**
   * An absolute floor below which nothing counts as speech whatever the relative measurement says.
   * This is the guard that stops a silent file reading as one long utterance.
   */
  absoluteFloorDbfs?: number;
}

export interface VoiceSegment {
  startSeconds: number;
  endSeconds: number;
  peakDbfs: number;
}

export interface VadResult {
  segments: VoiceSegment[];
  noiseFloorDbfs: number;
  thresholdDbfs: number;
  speechSeconds: number;
  frameMs: number;
}

/**
 * Where the speech is.
 *
 * TWO THRESHOLDS, NOT ONE. A single threshold chatters: every frame near it flips the decision,
 * and one word comes back as nine segments. Opening at `thresholdDb` and closing at the lower
 * `releaseDb` is standard hysteresis and is the difference between a usable segment list and
 * confetti.
 *
 * THE ABSOLUTE FLOOR IS THE POINT OF THE WHOLE FUNCTION. The threshold is relative to the file's
 * own noise floor, which is the only way to work on both a quiet studio take and a noisy laptop
 * mic — but a relative threshold on a file with no noise says everything is speech. A digitally
 * silent buffer has a floor of SILENCE_FLOOR_DBFS (-120, because `toDbfs` refuses to return
 * -Infinity), so `floor + 9` is -111 and every sample of a -100 dBFS dither is "speech". The
 * absolute floor at -55 dBFS is what makes "I heard nothing" representable, and the test feeds it
 * literal silence and demands zero segments.
 */
export function detectVoiceActivity(audio: PcmAudio, opts: VadOptions = {}): VadResult | AudioFault {
  const bad = finiteFault(audio, 'detectVoiceActivity');
  if (bad) return bad;

  const frameMs = numberOr(opts.frameMs, 20);
  if (frameMs <= 0) return fault('bad_parameter', `a frame of ${frameMs} ms cannot be analysed`);
  const thresholdDb = numberOr(opts.thresholdDb, 9);
  const releaseDb = numberOr(opts.releaseDb, 6);
  if (releaseDb > thresholdDb) {
    return fault('bad_parameter', `release ${releaseDb} dB above the floor is higher than the ${thresholdDb} dB open threshold, which inverts the hysteresis`);
  }
  const minSpeechMs = numberOr(opts.minSpeechMs, 120);
  const minSilenceMs = numberOr(opts.minSilenceMs, 220);
  const padMs = numberOr(opts.padMs, 60);
  const absoluteFloorDbfs = numberOr(opts.absoluteFloorDbfs, -55);

  const frameLen = Math.max(1, Math.round((audio.sampleRate * frameMs) / 1000));
  const frames = frameCount(audio);
  const frameCountTotal = Math.ceil(frames / frameLen);
  if (frameCountTotal === 0) return fault('empty', 'nothing to analyse');

  const levelsDbfs = new Float64Array(frameCountTotal);
  for (let k = 0; k < frameCountTotal; k++) {
    const start = k * frameLen;
    const end = Math.min(frames, start + frameLen);
    let sum = 0;
    let n = 0;
    for (let f = start; f < end; f++) {
      for (let c = 0; c < audio.channels; c++) {
        const s = audio.samples[f * audio.channels + c]!;
        sum += s * s;
        n++;
      }
    }
    levelsDbfs[k] = n > 0 ? toDbfs(Math.sqrt(sum / n)) : SILENCE_FLOOR_DBFS;
  }

  const sorted = Array.from(levelsDbfs).sort((a, b) => a - b);
  const floorDbfs = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.1))]!;
  // `Math.max` with the absolute floor, so the open threshold can never sit below the level at
  // which a person could hear anything. This single call is the difference between a detector and
  // a random number generator on a quiet file.
  const openDbfs = Math.max(floorDbfs + thresholdDb, absoluteFloorDbfs);
  const closeDbfs = Math.max(floorDbfs + releaseDb, absoluteFloorDbfs - 3);

  const minSpeechFrames = Math.max(1, Math.round(minSpeechMs / frameMs));
  const minSilenceFrames = Math.max(1, Math.round(minSilenceMs / frameMs));

  const runs: { from: number; to: number }[] = [];
  let inSpeech = false;
  let runStart = 0;
  let silenceRun = 0;
  for (let k = 0; k < frameCountTotal; k++) {
    const db = levelsDbfs[k]!;
    if (!inSpeech) {
      if (db >= openDbfs) {
        inSpeech = true;
        runStart = k;
        silenceRun = 0;
      }
    } else if (db < closeDbfs) {
      silenceRun++;
      if (silenceRun >= minSilenceFrames) {
        runs.push({ from: runStart, to: k - silenceRun + 1 });
        inSpeech = false;
        silenceRun = 0;
      }
    } else {
      silenceRun = 0;
    }
  }
  if (inSpeech) runs.push({ from: runStart, to: frameCountTotal - silenceRun });

  const padFrames = Math.round(padMs / frameMs);
  const segments: VoiceSegment[] = [];
  for (const run of runs) {
    if (run.to - run.from < minSpeechFrames) continue;
    const from = Math.max(0, run.from - padFrames);
    const to = Math.min(frameCountTotal, run.to + padFrames);
    let peak = 0;
    const startFrame = from * frameLen;
    const endFrame = Math.min(frames, to * frameLen);
    for (let f = startFrame; f < endFrame; f++) {
      for (let c = 0; c < audio.channels; c++) peak = Math.max(peak, Math.abs(audio.samples[f * audio.channels + c]!));
    }
    segments.push({
      startSeconds: Number((startFrame / audio.sampleRate).toFixed(3)),
      endSeconds: Number((endFrame / audio.sampleRate).toFixed(3)),
      peakDbfs: Number(toDbfs(peak).toFixed(2)),
    });
  }

  return {
    segments,
    noiseFloorDbfs: Number(floorDbfs.toFixed(2)),
    thresholdDbfs: Number(openDbfs.toFixed(2)),
    speechSeconds: Number(segments.reduce((n, s) => n + (s.endSeconds - s.startSeconds), 0).toFixed(3)),
    frameMs,
  };
}

// ---------------------------------------------------------------------------------------------
// Mastering
// ---------------------------------------------------------------------------------------------

export interface MasterOptions {
  /** Where the average level should land. -18 dBFS RMS is a conventional game-audio bed. */
  targetLoudnessDbfs?: number;
  /** Nothing may exceed this after limiting. */
  ceilingDbfs?: number;
  maxGainDb?: number;
  /** Limiter lookahead. Longer is more transparent and smears transients more. */
  lookaheadMs?: number;
  releaseMs?: number;
}

export interface MasterResult {
  audio: PcmAudio;
  gainDb: number;
  /** The most the limiter had to pull down, in dB. 0 means it never engaged. */
  maxGainReductionDb: number;
  before: LevelReport;
  after: LevelReport;
  skipped?: 'silent';
}

/**
 * Loudness target plus a brickwall limiter — and an explicit list of what this is NOT.
 *
 * WHAT IT IS: RMS measured over the whole file, a single static gain to bring that RMS to target,
 * then a lookahead peak limiter that guarantees the ceiling. That is enough to make a set of
 * generated sound effects sit at one level and never clip, which is the actual job.
 *
 * WHAT IT IS NOT, said plainly because "mastering" promises more than this delivers: there is no
 * EQ, no multiband compression, no stereo work, and the loudness measure is RMS, NOT
 * ITU-R BS.1770 / LUFS — no K-weighting, no gating of quiet passages. A file mastered here will
 * measure differently on a LUFS meter, and for speech the difference is typically a couple of dB.
 *
 * THE CEILING IS A GUARANTEE, NOT A HOPE, and the test states it as one: after this function the
 * peak is at or below the ceiling for every input, including a transient 30 dB above the bed.
 * What makes it a guarantee is the ASYMMETRIC envelope below — the gain drops to the required
 * value on the sample that requires it and only recovers slowly. Smoothing the attack as well as
 * the release was measured, by mutation, to let that transient out at +9.9 dBFS. The lookahead
 * window is a separate and lesser thing: it starts the reduction slightly early so the ear hears
 * a duck rather than a dent, and removing it does NOT break the ceiling.
 */
export function master(audio: PcmAudio, opts: MasterOptions = {}): MasterResult | AudioFault {
  const bad = finiteFault(audio, 'master');
  if (bad) return bad;
  const before = measure(audio);
  if (isAudioFault(before)) return before;

  const targetLoudnessDbfs = numberOr(opts.targetLoudnessDbfs, -18);
  const ceilingDbfs = numberOr(opts.ceilingDbfs, -1);
  const maxGainDb = numberOr(opts.maxGainDb, 24);
  if (ceilingDbfs > 0) return fault('bad_parameter', `a ceiling of ${ceilingDbfs} dBFS is above full scale`);
  if (targetLoudnessDbfs > ceilingDbfs) {
    return fault('bad_parameter', `an RMS target of ${targetLoudnessDbfs} dBFS above the ${ceilingDbfs} dBFS peak ceiling is unreachable — RMS is never above peak`);
  }

  const rms = rmsAmplitude(audio);
  if (rms <= 0) {
    // Silence, again explicitly. `target / 0` is Infinity and scaling silence by it gives NaN.
    return { audio, gainDb: 0, maxGainReductionDb: 0, before, after: before, skipped: 'silent' };
  }

  const gainDb = Math.min(targetLoudnessDbfs - toDbfs(rms), maxGainDb);
  const gain = fromDb(gainDb);
  const ceiling = fromDb(ceilingDbfs);

  const frames = frameCount(audio);
  const lookahead = Math.max(1, Math.round((numberOr(opts.lookaheadMs, 3) / 1000) * audio.sampleRate));
  const release = coefficient(numberOr(opts.releaseMs, 50), audio.sampleRate);

  // Per-frame target gain: the reduction needed by the loudest sample in the lookahead window.
  const targetGain = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let loudest = 0;
    const end = Math.min(frames, f + lookahead);
    for (let g = f; g < end; g++) {
      for (let c = 0; c < audio.channels; c++) loudest = Math.max(loudest, Math.abs(audio.samples[g * audio.channels + c]!) * gain);
    }
    targetGain[f] = loudest > ceiling ? ceiling / loudest : 1;
  }

  const samples = new Float32Array(audio.samples.length);
  let envelope = 1;
  let maxReduction = 1;
  for (let f = 0; f < frames; f++) {
    const t = targetGain[f]!;
    // Attack is INSTANT and release is smoothed. The other way round lets the first sample of a
    // transient through above the ceiling, which is precisely the event being limited.
    envelope = t < envelope ? t : envelope + (t - envelope) * release;
    if (envelope < maxReduction) maxReduction = envelope;
    for (let c = 0; c < audio.channels; c++) {
      samples[f * audio.channels + c] = audio.samples[f * audio.channels + c]! * gain * envelope;
    }
  }

  const out: PcmAudio = { sampleRate: audio.sampleRate, channels: audio.channels, samples };
  const after = measure(out);
  if (isAudioFault(after)) return after;
  return {
    audio: out,
    gainDb: Number(gainDb.toFixed(2)),
    maxGainReductionDb: Number((-toDbfs(maxReduction)).toFixed(2)),
    before,
    after,
  };
}

// ---------------------------------------------------------------------------------------------
// Waveform preview
// ---------------------------------------------------------------------------------------------

export interface WaveformBucket {
  /** Most negative sample in the bucket, in [-1, 0]. */
  min: number;
  /** Most positive sample in the bucket, in [0, 1]. */
  max: number;
  /** RMS of the bucket, which is what the eye reads as loudness. */
  rms: number;
}

/**
 * Reduce a buffer to N min/max/RMS buckets for drawing.
 *
 * MIN AND MAX, NOT AVERAGE. Averaging a symmetric waveform gives approximately zero for every
 * bucket, so an averaged "waveform" of loud music is a flat line — the classic version of drawing
 * a picture of nothing and calling it a measurement. Min/max preserves the envelope, which is the
 * only thing a waveform preview is for.
 */
export function waveformPeaks(audio: PcmAudio, buckets: number): WaveformBucket[] | AudioFault {
  const bad = finiteFault(audio, 'waveformPeaks');
  if (bad) return bad;
  if (!Number.isInteger(buckets) || buckets < 1 || buckets > 4096) {
    return fault('bad_parameter', `${buckets} buckets is not a drawable width (1–4096)`);
  }
  const frames = frameCount(audio);
  const out: WaveformBucket[] = [];
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b * frames) / buckets);
    const end = Math.max(start + 1, Math.floor(((b + 1) * frames) / buckets));
    let min = 0;
    let max = 0;
    let sum = 0;
    let n = 0;
    for (let f = start; f < Math.min(end, frames); f++) {
      for (let c = 0; c < audio.channels; c++) {
        const s = audio.samples[f * audio.channels + c]!;
        if (s < min) min = s;
        if (s > max) max = s;
        sum += s * s;
        n++;
      }
    }
    out.push({
      min: Number(min.toFixed(5)),
      max: Number(max.toFixed(5)),
      rms: Number((n > 0 ? Math.sqrt(sum / n) : 0).toFixed(5)),
    });
  }
  return out;
}

export interface WaveformImageOptions {
  width?: number;
  height?: number;
  /** [r, g, b] 0–255. Defaults are the product's charcoal ground and its accent. */
  background?: [number, number, number];
  foreground?: [number, number, number];
}

/**
 * Render buckets as packed RGB pixels, ready for `encodePng`.
 *
 * WHY PIXELS AND NOT SVG. The generative-UI validator (apps/web/src/lib/generative-ui/validate.ts,
 * `isSafeImageSrc`) admits exactly two things: a base64 data URL of a RASTER image, or the app's
 * own image route. SVG is refused there deliberately, so a waveform delivered as SVG would be
 * dropped by the validator and the panel would render with no preview at all — a feature that
 * exists in the worker and is invisible in the product, which is the failure `generate_image`
 * already had once.
 *
 * Returns the buffer `encodePng(rgb, width, height)` expects, so this stays pure and testable
 * without a deflate stream.
 */
export function waveformPixels(
  buckets: WaveformBucket[],
  opts: WaveformImageOptions = {},
): { rgb: Uint8Array; width: number; height: number } | AudioFault {
  if (!Array.isArray(buckets) || buckets.length === 0) return fault('empty', 'no buckets to draw');
  const width = Math.max(1, Math.min(2048, Math.floor(numberOr(opts.width, buckets.length))));
  const height = Math.max(8, Math.min(512, Math.floor(numberOr(opts.height, 96))));
  const bg = opts.background ?? [24, 24, 27];
  const fg = opts.foreground ?? [212, 212, 216];

  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = bg[0];
    rgb[i * 3 + 1] = bg[1];
    rgb[i * 3 + 2] = bg[2];
  }

  const mid = (height - 1) / 2;
  for (let x = 0; x < width; x++) {
    const bucket = buckets[Math.min(buckets.length - 1, Math.floor((x * buckets.length) / width))]!;
    const top = Math.round(mid - Math.max(0, Math.min(1, bucket.max)) * mid);
    const bottom = Math.round(mid - Math.max(-1, Math.min(0, bucket.min)) * mid);
    // Always at least one pixel: a silent column still draws the centre line, so the image reads
    // as "silence here" rather than as a rendering that failed halfway.
    for (let y = Math.min(top, Math.floor(mid)); y <= Math.max(bottom, Math.ceil(mid)); y++) {
      if (y < 0 || y >= height) continue;
      const at = (y * width + x) * 3;
      rgb[at] = fg[0];
      rgb[at + 1] = fg[1];
      rgb[at + 2] = fg[2];
    }
  }
  return { rgb, width, height };
}

// ---------------------------------------------------------------------------------------------

/**
 * `??` defends undefined and null and NOTHING ELSE — not NaN, not Infinity, not a string that
 * arrived from JSON. Every option in this file is a number that later takes part in a comparison,
 * and `NaN > x` is false, so an option that arrives as NaN turns its guard off silently. This is
 * the one helper that stops that, and it is used on every numeric option rather than on the ones
 * that looked risky.
 */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
