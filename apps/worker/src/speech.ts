// Speech in and speech out, behind an interface, on a budget.
//
// Two jobs and one shared discipline. The jobs are transcription (a user speaks to Golem instead
// of typing) and synthesis (a line of NPC dialogue comes back as audio). The discipline is that
// BOTH are billed per AUDIO MINUTE rather than per token, which breaks the assumption every other
// spend path in this worker rests on:
//
//   * gateway.ts reserves from a token estimate it can compute from the prompt it is about to send.
//   * imagegen.ts reserves an EXACT number, because tiles and steps are known before the call.
//   * Here, the billable quantity is the LENGTH OF THE AUDIO — which, for transcription, is a
//     property of a payload this worker may not be able to decode, and for synthesis does not
//     exist yet when the reservation has to be made.
//
// That produces the one guard this file exists for, stated as a rule:
//
//   A DURATION THIS WORKER DID NOT MEASURE IS NEVER BILLED AS ZERO, AND IS NEVER TAKEN FROM THE
//   CALLER.
//
// A WAV is decoded and its duration is known exactly. Anything else — webm/opus out of a browser's
// MediaRecorder, an mp4, an mp3 — is opaque here, so the reservation is made at the CAP and
// settled down to what the provider reports it actually processed. The alternative, trusting the
// client's `seconds` field, is an endpoint that performs five minutes of inference for whoever
// claims 0.1 — and it would look correct in every log, because the number it billed is a number
// somebody supplied.
//
// PROVIDERS ARE AN INTERFACE, NOT A CALL SITE. `SpeechProvider` has two methods and one real
// implementation (`workersAiSpeech`, over the Workers AI binding). Tests pass their own, which is
// what lets every branch in this file — a refused reservation, a provider that throws, a provider
// that returns a shape nobody expected, silence — be exercised without a paid call ever happening.
import type { Env } from './env';
import { BudgetError } from './gateway';
import { gatewayOpts } from './providers/workers-ai';
import { MAX_NEURONS_PER_REQUEST, usdFor } from './pricing';
import { decodeWav, durationSeconds, isAudioFault } from './audio';

// ---------------------------------------------------------------------------------------------
// Models, and what they actually cost
// ---------------------------------------------------------------------------------------------

/**
 * Rates read from developers.cloudflare.com/workers-ai/platform/pricing on 2026-09-15, in the SAME
 * neuron unit as pricing.ts, and taken from the "Price in Neurons" column rather than converted
 * from dollars — Cloudflare publishes both and the neuron column is what the account is metered in.
 *
 *   @cf/openai/whisper                  41.14 neurons / audio minute
 *   @cf/openai/whisper-large-v3-turbo   46.63 neurons / audio minute
 *   @cf/myshell-ai/melotts              18.63 neurons / audio minute
 *
 * Also in the catalogue and DELIBERATELY NOT REGISTERED: @cf/deepgram/aura-1 and aura-2, the only
 * models here that expose a choice of VOICE. aura-1 is 1,363.64 neurons per 1,000 characters of
 * input — for a 120-character line of dialogue that is ~164 neurons against melotts's ~2, an 80x
 * difference for the same sentence. A product whose entire architecture exists to cost nothing
 * recurring does not put an 80x line item behind a tool the model can call in a loop. The
 * consequence is stated honestly at the point it bites: see `TIMBRE_SELECTABLE`.
 */
export interface AsrModelSpec {
  id: string;
  neuronsPerAudioMinute: number;
  /** Whether the response carries per-segment timings. Drives what `segments` can contain. */
  reportsSegments: boolean;
  /** Whether the response reports which language it heard. Drives language detection. */
  reportsLanguage: boolean;
}

export interface TtsModelSpec {
  id: string;
  neuronsPerAudioMinute: number;
  /** MIME type of the bytes this model returns. */
  contentType: string;
  /** Whether the model exposes a voice/timbre parameter at all. */
  timbreSelectable: boolean;
  maxInputChars: number;
}

export const ASR_MODEL: AsrModelSpec = {
  id: '@cf/openai/whisper-large-v3-turbo',
  neuronsPerAudioMinute: 46.63,
  reportsSegments: true,
  reportsLanguage: true,
};

export const TTS_MODEL: TtsModelSpec = {
  id: '@cf/myshell-ai/melotts',
  neuronsPerAudioMinute: 18.63,
  contentType: 'audio/mpeg',
  // FALSE, and every result says so. MeloTTS's published schema is `prompt` and `lang` — there is
  // no speaker, no style and no speed. A preset here therefore selects a LANGUAGE and shapes the
  // WRITING; it cannot select a voice. Reporting `voice: 'narrator'` while sending the same two
  // fields for every preset would be a field that describes an intention nobody acted on.
  timbreSelectable: false,
  maxInputChars: 1_000,
};

export const TIMBRE_SELECTABLE = TTS_MODEL.timbreSelectable;

export const SPEECH_LIMITS = {
  /** Longest clip accepted for transcription. Also the pessimistic reservation for an opaque one. */
  maxAudioSeconds: 120,
  /** Largest encoded upload. 8 MB is minutes of opus and about 90 seconds of 16-bit WAV. */
  maxAudioBytes: 8_000_000,
  /** Shortest clip worth sending. Below this it is a click, and inference on it is waste. */
  minAudioSeconds: 0.2,
  maxTextChars: TTS_MODEL.maxInputChars,
  /** Floor on a synthesis reservation: even one word costs a minimum slice of a minute. */
  minSpeechSeconds: 0.5,
} as const;

/**
 * Container types accepted for transcription.
 *
 * AN ALLOWLIST, not a check for "audio/". `Record<Union, T>` and a `startsWith('audio/')` test are
 * both compile-time-shaped promises about a value that arrives from a request body. The list below
 * is what the provider documents it accepts; anything else is refused HERE, where the refusal is
 * free, rather than by the provider after a reservation has been taken.
 */
export const ACCEPTED_AUDIO_TYPES: readonly string[] = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/flac',
];

/** Containers this worker can open itself, and therefore measure the duration of before paying. */
const SELF_MEASURABLE = new Set(['audio/wav', 'audio/x-wav', 'audio/wave']);

// ---------------------------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------------------------

/**
 * The language codes this worker will REPEAT.
 *
 * Whisper detects roughly a hundred languages and returns the code as a bare string. That string
 * ends up in a tool result, in a transcript the model reads, and potentially in a UI label — so it
 * crosses from provider output into product content, which makes it untrusted input rather than a
 * fact. The list is the languages Cloudflare documents for this model's common set plus the ones
 * this product plausibly sees; anything outside it is reported as `null` with a note naming the raw
 * value, which is the honest shape: "it detected something this worker does not recognise" is a
 * different statement from both "it detected English" and "it detected nothing".
 */
export const ASR_LANGUAGES: Readonly<Record<string, string>> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ru: 'Russian',
  pl: 'Polish',
  tr: 'Turkish',
  ar: 'Arabic',
  he: 'Hebrew',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  yue: 'Cantonese',
  id: 'Indonesian',
  vi: 'Vietnamese',
  th: 'Thai',
  uk: 'Ukrainian',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  cs: 'Czech',
  ro: 'Romanian',
  el: 'Greek',
  fil: 'Filipino',
  ms: 'Malay',
};

export interface DetectedLanguage {
  /** The normalised code, or null when the provider said something this worker does not know. */
  code: string | null;
  name: string | null;
  /** 0–1 when the provider reports one. null means it did not, NOT that it was unsure. */
  confidence: number | null;
  /** Present only when the raw value was not recognised, carrying it verbatim for diagnosis. */
  unrecognised?: string;
}

/**
 * Normalise and validate a provider's language field.
 *
 * `en-US`, `EN` and `en` are the same language and arrive in all three shapes. A code that is not
 * in the allowlist is NOT passed through: `ASR_LANGUAGES[raw]` would be `undefined` for a hostile
 * or novel value and `undefined as string` would then travel as a name, but worse, indexing a
 * plain object with `constructor` or `__proto__` returns a truthy value that is not a language at
 * all. `hasOwnProperty` is what makes the allowlist an allowlist.
 */
export function normaliseLanguage(raw: unknown, confidence?: unknown): DetectedLanguage {
  const conf = typeof confidence === 'number' && Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null;
  if (typeof raw !== 'string' || raw.trim() === '') return { code: null, name: null, confidence: conf };
  const base = raw.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (!Object.prototype.hasOwnProperty.call(ASR_LANGUAGES, base)) {
    return { code: null, name: null, confidence: conf, unrecognised: raw.slice(0, 40) };
  }
  return { code: base, name: ASR_LANGUAGES[base]!, confidence: conf };
}

// ---------------------------------------------------------------------------------------------
// Voice presets
// ---------------------------------------------------------------------------------------------

/**
 * What a preset actually is, given the model that is registered.
 *
 * READ `TTS_MODEL.timbreSelectable` FIRST. MeloTTS takes a string and a language code and nothing
 * else, so a preset cannot pick a voice, a gender, an age or an emotion. What it CAN do, and what
 * each entry below does, is:
 *
 *   1. select the language the text is spoken in — the one parameter the model has;
 *   2. shape the WRITING, which changes the output because a TTS model's pacing is driven by
 *      punctuation: a comma is a short pause, a full stop is a long one, and a 40-word sentence
 *      with no punctuation comes back as an unbroken rush. `shape` is applied to the text and is
 *      visible in the result, so the caller can see exactly what was sent;
 *   3. carry a speaking rate, which is what the BUDGET RESERVATION is computed from. A narrator
 *      preset reserves more per word than an announcer because it will produce more audio, and the
 *      reservation is the only thing standing between a long line and an unbounded bill.
 *
 * `emotion` is deliberately absent from this type. There is no parameter to put it in.
 */
export interface VoicePreset {
  summary: string;
  use: string;
  lang: string;
  /** Words per minute this delivery produces. Drives the pre-flight duration estimate. */
  wordsPerMinute: number;
  /** Rewrites the text for pacing. Pure, and its output is reported. */
  shape(text: string): string;
}

/** Full stop between clauses, so the model takes a breath. Used by the slower presets. */
const slowDown = (text: string): string =>
  text
    .replace(/\s*—\s*/g, ', ')
    .replace(/([,;:])\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

/** Long sentences broken at conjunctions, because an unpunctuated rush is unintelligible. */
const breakLongSentences = (text: string, maxWords: number): string =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      const words = sentence.split(/\s+/);
      if (words.length <= maxWords) return sentence;
      const out: string[] = [];
      let run: string[] = [];
      for (const w of words) {
        run.push(w);
        if (run.length >= maxWords && /^(and|but|so|then|because|which|while|when|or)$/i.test(w) === false) {
          out.push(run.join(' ') + (/[.,;:!?]$/.test(w) ? '' : ','));
          run = [];
        }
      }
      if (run.length) out.push(run.join(' '));
      return out.join(' ');
    })
    .join(' ')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export const VOICE_PRESETS: Readonly<Record<string, VoicePreset>> = {
  narrator: {
    summary: 'Unhurried, fully punctuated English. The default for anything a player listens to rather than skims.',
    use: 'Intros, cutscene narration, tutorial voice-over.',
    lang: 'en',
    wordsPerMinute: 135,
    shape: (t) => breakLongSentences(slowDown(t), 14),
  },
  guide: {
    summary: 'Plain, brisk instruction. Short sentences, minimal ornament.',
    use: 'Objectives, hints, "go to the blue door" — anything the player needs to act on immediately.',
    lang: 'en',
    wordsPerMinute: 155,
    shape: (t) => breakLongSentences(slowDown(t), 11),
  },
  announcer: {
    summary: 'Clipped and punchy, one idea per sentence.',
    use: 'Round starts, scores, countdowns. Anything that has to land over gameplay noise.',
    lang: 'en',
    wordsPerMinute: 170,
    shape: (t) => breakLongSentences(slowDown(t), 8),
  },
  npc_calm: {
    summary: 'Conversational pacing with pauses left in.',
    use: 'Shopkeepers, quest givers, idle chatter. The preset to reach for by default for dialogue.',
    lang: 'en',
    wordsPerMinute: 145,
    shape: (t) => breakLongSentences(slowDown(t), 12),
  },
  npc_urgent: {
    summary: 'Short, hard-stopped lines.',
    use: 'Warnings, alarms, a character shouting across a room.',
    lang: 'en',
    wordsPerMinute: 180,
    shape: (t) => breakLongSentences(slowDown(t).replace(/,\s*/g, '. '), 7),
  },
  spanish_narrator: {
    summary: 'The narrator delivery, spoken in Spanish.',
    use: 'A Spanish-language build. The TEXT must already be Spanish — this selects the voice, it does not translate.',
    lang: 'es',
    wordsPerMinute: 140,
    shape: (t) => breakLongSentences(slowDown(t), 14),
  },
  french_narrator: {
    summary: 'The narrator delivery, spoken in French.',
    use: 'A French-language build. The TEXT must already be French — this selects the voice, it does not translate.',
    lang: 'fr',
    wordsPerMinute: 140,
    shape: (t) => breakLongSentences(slowDown(t), 14),
  },
};

export const VOICE_PRESET_NAMES = Object.keys(VOICE_PRESETS);

export function voicePresetCatalogue(): { name: string; summary: string; use: string; lang: string; wordsPerMinute: number }[] {
  return VOICE_PRESET_NAMES.map((name) => {
    const p = VOICE_PRESETS[name]!;
    return { name, summary: p.summary, use: p.use, lang: p.lang, wordsPerMinute: p.wordsPerMinute };
  });
}

// ---------------------------------------------------------------------------------------------
// The provider interface
// ---------------------------------------------------------------------------------------------

export interface ProviderTranscribeRequest {
  modelId: string;
  /** The encoded payload, base64. Providers differ on how they want it framed; the adapter decides. */
  audioBase64: string;
  contentType: string;
  /** A hint only. Absent means "detect it". */
  language?: string;
  /** Sent to the provider's own voice-activity preprocessor when it has one. */
  vadFilter?: boolean;
}

export interface ProviderSynthesizeRequest {
  modelId: string;
  text: string;
  lang: string;
}

/**
 * The seam between this file and anything that costs money.
 *
 * Both methods return `unknown` on purpose. A typed return would invite this file to trust the
 * provider's shape, and the shapes genuinely vary — whisper has returned `{text}`, `{result:{text}}`
 * and a bare string across versions, and a change there must surface as a REFUSAL here, not as an
 * `undefined` that becomes an empty transcript.
 */
export interface SpeechProvider {
  readonly name: string;
  transcribe(req: ProviderTranscribeRequest): Promise<unknown>;
  synthesize(req: ProviderSynthesizeRequest): Promise<unknown>;
}

/** The real provider: the Workers AI binding, with the gateway options the rest of the worker uses. */
export function workersAiSpeech(env: Env): SpeechProvider {
  return {
    name: 'workers-ai',
    async transcribe(req) {
      // The binding takes the bytes as a plain number array for these models. Decoding here, rather
      // than at the call site, keeps the base64 representation an implementation detail of the
      // transport rather than something the spend logic has to know about.
      const bytes = base64ToBytes(req.audioBase64);
      const payload: Record<string, unknown> = { audio: Array.from(bytes) };
      if (req.language) payload.language = req.language;
      if (req.vadFilter) payload.vad_filter = true;
      // cacheTtl 0: two recordings are never the same request, and a cached transcript would be
      // one user's words returned to another.
      return env.AI.run(req.modelId as Parameters<Ai['run']>[0], payload as never, gatewayOpts(env, 'transcribe', 0) as never);
    },
    async synthesize(req) {
      return env.AI.run(
        req.modelId as Parameters<Ai['run']>[0],
        { prompt: req.text, lang: req.lang } as never,
        gatewayOpts(env, 'tts', 0) as never,
      );
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Spend
// ---------------------------------------------------------------------------------------------
//
// The same BudgetDO singleton, the same three endpoints, the same neuron unit. This is the third
// copy of these four functions (gateway.ts keeps its own private; imagegen.ts re-plumbed them with
// a note saying why). They are duplicated rather than shared for the reason imagegen.ts gives —
// widening gateway.ts's surface is a bigger change than it looks — and the thing that must not
// happen, and does not, is a SECOND LEDGER: every neuron below lands in the same day and month
// counters, under the same kill switch, that /api/admin/spend reports on.

function budgetStub(env: Env) {
  return env.BUDGET_DO.get(env.BUDGET_DO.idFromName('singleton'));
}

const BUDGET_MESSAGES: Record<string, string> = {
  daily_cap: "Apple has reached today's shared building capacity. It resets at midnight UTC.",
  monthly_cap: "Apple has reached this month's shared building capacity.",
  request_too_large: 'That recording needs more capacity than a single request allows.',
  killed: 'AI generation is paused right now.',
};

async function reserve(env: Env, model: string, neurons: number): Promise<number> {
  const res = await budgetStub(env).fetch('https://do/reserve', { method: 'POST', body: JSON.stringify({ neurons, model }) });
  const data = (await res.json()) as { ok: boolean; reserved?: number; reason?: string; message?: string };
  if (!data.ok) {
    const reason = (data.reason ?? 'daily_cap') as 'killed' | 'daily_cap' | 'monthly_cap' | 'request_too_large';
    throw new BudgetError(reason, data.message ?? BUDGET_MESSAGES[reason] ?? BUDGET_MESSAGES.daily_cap!);
  }
  return data.reserved ?? neurons;
}

async function settle(env: Env, reserved: number, actual: number, model: string, kind: string): Promise<void> {
  await budgetStub(env)
    .fetch('https://do/settle', { method: 'POST', body: JSON.stringify({ reserved, actual, model, kind }) })
    .catch(() => {});
}

async function release(env: Env, reserved: number): Promise<void> {
  await budgetStub(env).fetch('https://do/release', { method: 'POST', body: JSON.stringify({ reserved }) }).catch(() => {});
}

/** Neurons for `seconds` of audio on a per-audio-minute rate. Rounded UP, always. */
export function neuronsForAudio(neuronsPerAudioMinute: number, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.ceil((seconds / 60) * neuronsPerAudioMinute);
}

// ---------------------------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------------------------

export interface TranscribeRequest {
  audioBase64: string;
  contentType: string;
  /**
   * A hint the CLIENT supplies. It is used for nothing that costs money — see
   * `measureBillableSeconds`. It exists so a caller can say "this should be about 3 seconds" and
   * have the result say whether that matched.
   */
  clientSeconds?: number;
  /** Force a language instead of detecting one. Must be in ASR_LANGUAGES. */
  language?: string;
  /** Ask the provider to strip silence before transcribing. Cheaper and less prone to hallucination. */
  vadFilter?: boolean;
}

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export type TranscribeOutcome =
  | { ok: true; heard: true; text: string; language: DetectedLanguage; segments: TranscriptSegment[]; droppedSegments: number; billedSeconds: number; measured: 'decoded' | 'provider' | 'capped'; neurons: number; usd: number; model: string }
  | { ok: true; heard: false; reason: 'silence'; language: DetectedLanguage; billedSeconds: number; measured: 'decoded' | 'provider' | 'capped'; neurons: number; usd: number; model: string }
  | { ok: false; code: SpeechFaultCode; detail: string };

export type SpeechFaultCode =
  | 'empty_payload'
  | 'too_large'
  | 'too_long'
  | 'too_short'
  | 'unsupported_type'
  | 'undecodable'
  | 'unknown_language'
  | 'provider_shape'
  | 'empty_text'
  | 'text_too_long'
  | 'nothing_to_say'
  | 'unknown_preset';

const fail = (code: SpeechFaultCode, detail: string): { ok: false; code: SpeechFaultCode; detail: string } => ({ ok: false, code, detail });

export interface BillableMeasurement {
  seconds: number;
  /**
   * How the number was arrived at:
   *   decoded — this worker opened the container and counted frames. Exact.
   *   capped  — the container is opaque here, so the CAP is reserved. Pessimistic by construction.
   * A third value, `provider`, appears only in the settled result, when the provider reported what
   * it actually processed and that was less than the reservation.
   */
  measured: 'decoded' | 'capped';
  /** Only when `decoded` — what the client claimed, for the caller to compare against. */
  clientClaimedSeconds?: number;
}

/**
 * How many seconds to RESERVE for, and how that number was obtained.
 *
 * THE CLIENT'S NUMBER IS NEVER THE ANSWER. A `seconds` field in a request body is a claim by
 * whoever is calling, and the endpoint it feeds performs paid inference proportional to it. Trust
 * it and a caller who writes `seconds: 0.1` beside two minutes of audio gets two minutes of
 * transcription for a fifth of a second of budget — and every log, ledger entry and dashboard
 * agrees it was a fifth of a second, because the number that was billed is a number somebody
 * supplied. That is not an accounting bug that shows up as an anomaly; it is an accounting bug
 * that shows up as nothing at all.
 *
 * So there are exactly two sources: a container this worker can OPEN, or the cap.
 */
export function measureBillableSeconds(bytes: Uint8Array, contentType: string, clientSeconds?: number): BillableMeasurement {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (SELF_MEASURABLE.has(type)) {
    const decoded = decodeWav(bytes);
    if (!isAudioFault(decoded)) {
      const seconds = durationSeconds(decoded);
      return {
        seconds,
        measured: 'decoded',
        ...(typeof clientSeconds === 'number' && Number.isFinite(clientSeconds) ? { clientClaimedSeconds: clientSeconds } : {}),
      };
    }
    // A WAV that will not decode is not a free pass to the cheap path. Falling through to the cap
    // is the pessimistic direction, which is the only safe one for a reservation.
  }
  return { seconds: SPEECH_LIMITS.maxAudioSeconds, measured: 'capped' };
}

/**
 * Transcribe a recording.
 *
 * THE OUTCOME HAS THREE SHAPES, NOT TWO, and the third is the reason this function is not a
 * one-liner. `{heard: false}` means the model ran, was paid for, and heard no words — which is a
 * real and common answer for a muted microphone or a room recording. `{ok: false}` means the
 * transcription did not happen. Collapsing them into "returns a string, sometimes empty" is the
 * exact substitution docs/FAILURES.md names: a failure to observe rendering as an observation of
 * nothing. The caller can then tell a user "I did not hear anything, try again" instead of
 * "" — and can tell the difference between that and "the engine is down".
 */
export async function transcribe(
  env: Env,
  provider: SpeechProvider,
  req: TranscribeRequest,
  kind = 'transcribe',
): Promise<TranscribeOutcome> {
  const audioBase64 = typeof req.audioBase64 === 'string' ? req.audioBase64 : '';
  if (audioBase64.length === 0) return fail('empty_payload', 'there was no audio in the request');

  const type = String(req.contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (!ACCEPTED_AUDIO_TYPES.includes(type)) {
    return fail(
      'unsupported_type',
      `"${String(req.contentType).slice(0, 60)}" is not an audio type this worker accepts. Accepted: ${ACCEPTED_AUDIO_TYPES.join(', ')}.`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(audioBase64);
  } catch {
    return fail('undecodable', 'the audio payload was not valid base64');
  }
  if (bytes.byteLength === 0) return fail('empty_payload', 'the audio payload decoded to zero bytes');
  if (bytes.byteLength > SPEECH_LIMITS.maxAudioBytes) {
    return fail('too_large', `${bytes.byteLength} bytes is over the ${SPEECH_LIMITS.maxAudioBytes}-byte limit`);
  }

  const measurement = measureBillableSeconds(bytes, type, req.clientSeconds);
  if (measurement.measured === 'decoded' && measurement.seconds < SPEECH_LIMITS.minAudioSeconds) {
    return fail('too_short', `${measurement.seconds.toFixed(2)}s is too short to contain speech`);
  }
  if (measurement.seconds > SPEECH_LIMITS.maxAudioSeconds) {
    return fail('too_long', `${measurement.seconds.toFixed(1)}s is over the ${SPEECH_LIMITS.maxAudioSeconds}s limit`);
  }

  let language: string | undefined;
  if (req.language !== undefined) {
    const asked = normaliseLanguage(req.language);
    if (!asked.code) return fail('unknown_language', `"${String(req.language).slice(0, 20)}" is not a language this worker recognises`);
    language = asked.code;
  }

  const reservedNeurons = neuronsForAudio(ASR_MODEL.neuronsPerAudioMinute, measurement.seconds);
  if (reservedNeurons > MAX_NEURONS_PER_REQUEST) {
    throw new BudgetError('request_too_large', BUDGET_MESSAGES.request_too_large!);
  }

  // ---- spend gate: nothing below this line runs without a reservation ----
  const reserved = await reserve(env, ASR_MODEL.id, reservedNeurons);

  let raw: unknown;
  try {
    raw = await provider.transcribe({
      modelId: ASR_MODEL.id,
      audioBase64,
      contentType: type,
      ...(language ? { language } : {}),
      ...(req.vadFilter ? { vadFilter: true } : {}),
    });
  } catch (e) {
    // Nothing ran, so nothing is owed. This is the ONLY path that releases.
    await release(env, reserved);
    throw e;
  }

  const parsed = parseTranscript(raw);
  // Past the call the inference HAS happened and has been billed by the provider, so the
  // reservation is settled even when the response turns out to be unreadable. Releasing here would
  // hand back budget for work that was really done, which is the direction that lets a bill escape.
  const providerSeconds = parsed.durationSeconds;
  const billedSeconds =
    typeof providerSeconds === 'number' && providerSeconds > 0 && providerSeconds < measurement.seconds
      ? providerSeconds
      : measurement.seconds;
  const actualNeurons = neuronsForAudio(ASR_MODEL.neuronsPerAudioMinute, billedSeconds);
  await settle(env, reserved, actualNeurons, ASR_MODEL.id, kind);

  const measured: 'decoded' | 'provider' | 'capped' =
    billedSeconds !== measurement.seconds ? 'provider' : measurement.measured;
  const spend = { billedSeconds: Number(billedSeconds.toFixed(3)), measured, neurons: actualNeurons, usd: Number(usdFor(actualNeurons).toFixed(6)), model: ASR_MODEL.id };

  if (!parsed.ok) return fail('provider_shape', parsed.detail);

  const detected = normaliseLanguage(parsed.language, parsed.languageProbability);
  if (parsed.text.trim() === '') {
    return { ok: true, heard: false, reason: 'silence', language: detected, ...spend };
  }
  return { ok: true, heard: true, text: parsed.text, language: detected, segments: parsed.segments, droppedSegments: parsed.droppedSegments, ...spend };
}

interface ParsedTranscript {
  ok: boolean;
  detail: string;
  text: string;
  language: unknown;
  languageProbability: unknown;
  durationSeconds: number | null;
  segments: TranscriptSegment[];
  droppedSegments: number;
}

/**
 * Read whatever the provider returned.
 *
 * WHY `text` MISSING IS A FAULT AND `text: ""` IS NOT. They are different events and the difference
 * is the whole point of this function. An empty string is the model saying "I heard no words" —
 * normal, and the caller can act on it. A missing field is this worker failing to understand the
 * response, which means the schema moved, and defaulting it to `''` would turn every future
 * response from a changed API into a confident report of silence. The silent-schema-drift failure
 * is exactly the one nobody notices, because "the user said nothing" is not a bug anyone reports.
 *
 * Segments with non-finite timings are DROPPED AND COUNTED. A NaN timestamp sorts nowhere,
 * compares false against every bound, and would place a caption at an impossible position; a
 * silently shortened list, though, is a caption track that is simply missing words.
 */
export function parseTranscript(raw: unknown): ParsedTranscript {
  const empty: ParsedTranscript = { ok: false, detail: '', text: '', language: null, languageProbability: null, durationSeconds: null, segments: [], droppedSegments: 0 };

  // Observed shapes, in the order they have actually been returned by this family of models.
  const root = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null) ?? null;
  const result = root && typeof root.result === 'object' && root.result !== null ? (root.result as Record<string, unknown>) : root;

  let text: unknown;
  if (typeof raw === 'string') text = raw;
  else if (result && typeof result.text === 'string') text = result.text;

  if (typeof text !== 'string') {
    return {
      ...empty,
      detail: `the transcription engine returned no text field (keys: ${result ? Object.keys(result).slice(0, 8).join(', ') || 'none' : typeof raw}). This is a schema change, not silence — it is reported rather than rendered as an empty transcript.`,
    };
  }

  const info = result && typeof result.transcription_info === 'object' && result.transcription_info !== null
    ? (result.transcription_info as Record<string, unknown>)
    : {};

  const rawSegments = result && Array.isArray(result.segments) ? (result.segments as unknown[]) : [];
  const segments: TranscriptSegment[] = [];
  let dropped = 0;
  for (const s of rawSegments.slice(0, 500)) {
    const seg = s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
    const start = seg ? Number(seg.start) : NaN;
    const end = seg ? Number(seg.end) : NaN;
    const segText = seg && typeof seg.text === 'string' ? seg.text : null;
    // `??` would not have saved this: NaN is not null, and `NaN >= 0` is false, so a NaN-timed
    // segment sails past a bounds check written as `if (start < 0) skip`.
    if (segText === null || !Number.isFinite(start) || !Number.isFinite(end) || end < start || start < 0) {
      dropped++;
      continue;
    }
    segments.push({ startSeconds: Number(start.toFixed(3)), endSeconds: Number(end.toFixed(3)), text: segText });
  }

  const durationRaw = Number(info.duration ?? (result ? (result as Record<string, unknown>).duration : undefined));

  return {
    ok: true,
    detail: '',
    text,
    language: info.language ?? (result ? (result as Record<string, unknown>).language : undefined) ?? null,
    languageProbability: info.language_probability ?? null,
    durationSeconds: Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null,
    segments,
    droppedSegments: dropped,
  };
}

// ---------------------------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------------------------

export interface SynthesizeRequest {
  text: string;
  /** A key of VOICE_PRESETS. */
  preset?: string;
  /** Override the preset's language. Must be in ASR_LANGUAGES. */
  lang?: string;
}

export type SynthesizeOutcome =
  | {
      ok: true;
      audioBase64: string;
      contentType: string;
      bytes: number;
      /** What was actually produced, when it could be measured from the bytes. */
      seconds: number | null;
      /** What was billed. Equal to `seconds` when measurable, otherwise the estimate. */
      billedSeconds: number;
      measured: 'decoded' | 'estimated';
      estimatedSeconds: number;
      preset: string;
      lang: string;
      /** The text as SENT, after the preset's shaping. Reported because it is not what was passed in. */
      spokenText: string;
      /** False on the registered model. A result that said otherwise would be describing an intention. */
      timbreSelected: boolean;
      neurons: number;
      usd: number;
      model: string;
    }
  | { ok: false; code: SpeechFaultCode; detail: string };

/** Words, counted the way a speaking-rate estimate needs them counted. */
export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words.length;
}

/**
 * Screen text before it is spoken.
 *
 * `nothing_to_say` is its own refusal rather than a length check. A string of punctuation, emoji or
 * whitespace has a non-zero length and zero words: it passes "is it empty?", reserves budget, runs
 * a model, and comes back as a fraction of a second of nothing. Counting WORDS is what makes the
 * check mean what its name says.
 */
export function screenSpeechText(text: unknown): { ok: true; text: string; words: number } | { ok: false; code: SpeechFaultCode; detail: string } {
  if (typeof text !== 'string' || text.trim() === '') return fail('empty_text', 'there is no text to speak');
  const trimmed = text.trim();
  if (trimmed.length > SPEECH_LIMITS.maxTextChars) {
    return fail(
      'text_too_long',
      `${trimmed.length} characters is over the ${SPEECH_LIMITS.maxTextChars}-character limit for one line. Split it into separate lines — a single unbroken minute of speech is also unlistenable.`,
    );
  }
  const words = wordCount(trimmed);
  if (words === 0) {
    return fail('nothing_to_say', 'the text contains no words — only punctuation or symbols, which would synthesise to nothing');
  }
  return { ok: true, text: trimmed, words };
}

/** Seconds of speech `words` will take at `wordsPerMinute`, with a floor. */
export function estimateSpeechSeconds(words: number, wordsPerMinute: number): number {
  const wpm = Number.isFinite(wordsPerMinute) && wordsPerMinute > 0 ? wordsPerMinute : 150;
  return Math.max(SPEECH_LIMITS.minSpeechSeconds, (words / wpm) * 60);
}

/**
 * Speak a line.
 *
 * THE RESERVATION IS A GUESS AND THE SETTLEMENT IS NOT. Unlike transcription, where the audio
 * exists before the call, here the billable quantity is the length of audio the model has not
 * produced yet. So the reservation is an estimate from the word count and the preset's speaking
 * rate, taken PESSIMISTICALLY (a 30% margin, because under-reserving is what lets a bill escape —
 * pricing.ts's rule, applied to a different unit), and the settlement uses the real duration read
 * out of the returned MP3's frame headers. That is why `mp3DurationSeconds` exists: without it the
 * ledger would carry an estimate forever and would drift in whichever direction the estimate is
 * wrong, invisibly.
 */
export async function synthesize(
  env: Env,
  provider: SpeechProvider,
  req: SynthesizeRequest,
  kind = 'tts',
): Promise<SynthesizeOutcome> {
  const presetName = typeof req.preset === 'string' && req.preset !== '' ? req.preset : 'narrator';
  if (!Object.prototype.hasOwnProperty.call(VOICE_PRESETS, presetName)) {
    return fail('unknown_preset', `"${presetName}" is not a voice preset. Choose one of: ${VOICE_PRESET_NAMES.join(', ')}.`);
  }
  const preset = VOICE_PRESETS[presetName]!;

  const screened = screenSpeechText(req.text);
  if (!screened.ok) return screened;

  let lang = preset.lang;
  if (req.lang !== undefined) {
    const asked = normaliseLanguage(req.lang);
    if (!asked.code) return fail('unknown_language', `"${String(req.lang).slice(0, 20)}" is not a language this worker recognises`);
    lang = asked.code;
  }

  const spokenText = preset.shape(screened.text);
  const estimatedSeconds = estimateSpeechSeconds(wordCount(spokenText), preset.wordsPerMinute);
  // 1.3x: the estimate is a word-rate model and the model's real pacing depends on punctuation,
  // language and phrasing. Reserving the estimate exactly would under-reserve about half the time.
  const reservedNeurons = neuronsForAudio(TTS_MODEL.neuronsPerAudioMinute, estimatedSeconds * 1.3);
  if (reservedNeurons > MAX_NEURONS_PER_REQUEST) {
    throw new BudgetError('request_too_large', BUDGET_MESSAGES.request_too_large!);
  }

  const reserved = await reserve(env, TTS_MODEL.id, reservedNeurons);

  let raw: unknown;
  try {
    raw = await provider.synthesize({ modelId: TTS_MODEL.id, text: spokenText, lang });
  } catch (e) {
    await release(env, reserved);
    throw e;
  }

  const audioBase64 = extractAudioBase64(raw);
  if (!audioBase64) {
    // Billed but unusable: settle at the reservation. The alternative — releasing — would credit
    // back budget for inference the provider really performed.
    await settle(env, reserved, reservedNeurons, TTS_MODEL.id, kind);
    return fail('provider_shape', 'the speech engine returned no audio');
  }

  const bytes = base64ToBytes(audioBase64);
  const measuredSeconds = mp3DurationSeconds(bytes);
  const billedSeconds = measuredSeconds ?? estimatedSeconds;
  const actualNeurons = neuronsForAudio(TTS_MODEL.neuronsPerAudioMinute, billedSeconds);
  await settle(env, reserved, actualNeurons, TTS_MODEL.id, kind);

  return {
    ok: true,
    audioBase64,
    contentType: TTS_MODEL.contentType,
    bytes: bytes.byteLength,
    seconds: measuredSeconds === null ? null : Number(measuredSeconds.toFixed(3)),
    billedSeconds: Number(billedSeconds.toFixed(3)),
    measured: measuredSeconds === null ? 'estimated' : 'decoded',
    estimatedSeconds: Number(estimatedSeconds.toFixed(3)),
    preset: presetName,
    lang,
    spokenText,
    timbreSelected: TTS_MODEL.timbreSelectable,
    neurons: actualNeurons,
    usd: Number(usdFor(actualNeurons).toFixed(6)),
    model: TTS_MODEL.id,
  };
}

// ---------------------------------------------------------------------------------------------
// MP3 duration, without decoding the audio
// ---------------------------------------------------------------------------------------------

// MPEG audio bitrate table (kbps), [version][layer][index]. Only what Layer III needs is filled in.
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1];
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

/**
 * Duration of an MP3, by walking its frame headers.
 *
 * WHY NOT `bytes / bitrate`: a variable-bitrate file has no single bitrate, and the nominal one in
 * the first frame is wrong for the rest of the file — the estimate is off by whatever the encoder
 * decided, silently, in the direction nobody checks. Walking the frames costs one pass over a few
 * hundred kilobytes and is exact for both CBR and VBR, because every frame carries a fixed number
 * of samples (1152 for Layer III MPEG-1, 576 for MPEG-2/2.5).
 *
 * RETURNS NULL RATHER THAN A GUESS when the payload is not a frame-aligned MP3 — the caller then
 * bills the estimate and SAYS it billed the estimate (`measured: 'estimated'`). A fabricated
 * duration here would be a number in the ledger that came from nowhere.
 */
export function mp3DurationSeconds(bytes: Uint8Array): number | null {
  let at = 0;
  // Skip an ID3v2 tag if present: its header is 10 bytes and its size is a syncsafe integer.
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
    at = 10 + size;
  }

  let seconds = 0;
  let frames = 0;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff || (bytes[at + 1]! & 0xe0) !== 0xe0) {
      // Not a sync word. One byte at a time until we find one — but only while no frame has been
      // read yet. Once frames are being read, a broken sync means the walk has lost alignment and
      // continuing would count garbage as audio.
      if (frames > 0) break;
      at++;
      continue;
    }
    const versionBits = (bytes[at + 1]! >> 3) & 0x03;
    const layerBits = (bytes[at + 1]! >> 1) & 0x03;
    const bitrateIndex = (bytes[at + 2]! >> 4) & 0x0f;
    const rateIndex = (bytes[at + 2]! >> 2) & 0x03;
    const padding = (bytes[at + 2]! >> 1) & 0x01;

    // versionBits 1 is reserved; layerBits 1 is Layer III, which is the only layer these models emit.
    if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      if (frames > 0) break;
      at++;
      continue;
    }
    const sampleRate = SAMPLE_RATES[versionBits]?.[rateIndex];
    if (!sampleRate) {
      if (frames > 0) break;
      at++;
      continue;
    }
    const kbps = versionBits === 3 ? MPEG1_L3_BITRATES[bitrateIndex]! : MPEG2_L3_BITRATES[bitrateIndex]!;
    const samplesPerFrame = versionBits === 3 ? 1152 : 576;
    const frameBytes = Math.floor((samplesPerFrame / 8) * ((kbps * 1000) / sampleRate)) + padding;
    if (frameBytes <= 4) break; // would not advance; a malformed header must not spin the loop

    seconds += samplesPerFrame / sampleRate;
    frames++;
    at += frameBytes;
  }

  return frames > 0 ? seconds : null;
}

// ---------------------------------------------------------------------------------------------

/** melotts returns `{ audio: "<base64>" }`; the other shapes are defensive, not observed. */
function extractAudioBase64(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.length > 0) return raw;
  const r = raw as { audio?: unknown; result?: { audio?: unknown } } | null;
  const audio = r?.audio ?? r?.result?.audio;
  return typeof audio === 'string' && audio.length > 0 ? audio : null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
