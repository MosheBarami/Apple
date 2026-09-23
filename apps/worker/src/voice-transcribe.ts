// VOICE IN THE COMPOSER: a kid presses the mic, speaks English, and the words land in the box.
//
// POST /api/voice/transcribe, body = a 16-bit PCM WAV (the web app records and encodes it at 16 kHz
// mono), Content-Type audio/wav. Answers { heard, text, provider, seconds, credits }.
//
// THE AUDIO IS NEVER STORED (D-VISION-1, the FTC/COPPA path for children's voices):
//   * the bytes live in this request's memory only — no KV, R2, D1, Durable Object or cache write;
//   * nothing about them is logged: no console line carries audio, and the Workers AI call goes
//     through AI Gateway with `collectLog: false`, so the gateway's log never holds the clip;
//   * with our own AssemblyAI key the transcript is DELETEd right after it is read, which also
//     deletes the uploaded file on AssemblyAI's side (their documented behaviour for /v2/upload).
//
// PROVIDER ORDER: AssemblyAI Universal-3.5 Pro when the worker secret ASSEMBLYAI_API_KEY exists
// (so the product switches by itself the moment the owner sets it — OWNER_QUEUE Q-008), otherwise
// Workers AI Whisper large-v3-turbo on the AI binding, through speech.ts `transcribe()` (its
// reservation, settlement and response parsing). If AssemblyAI fails, Whisper answers instead.
//
// BILLING: the same two ledgers as everything else. The global BudgetDO holds a reservation before
// any provider runs (Whisper on the neuron day, via speech.ts; AssemblyAI, a third-party service
// paid in dollars, on BudgetDO's third-party wallet — its model id routes there by
// pricing.routeForModelId). The person pays Credits from QuotaDO after the provider answered, from
// the duration this worker MEASURED by decoding the WAV — never from a number the client sent.
import type { Env } from './env';
import { decodeWav, durationSeconds, isAudioFault } from './audio';
import { creditsForNeurons, USD_PER_NEURON } from './pricing';
import { ASR_MODEL, transcribe, type SpeechProvider } from './speech';
import { BudgetError } from './gateway';

export const VOICE_LIMITS = {
  /** Longest clip. A composer prompt, not a podcast; the web app stops recording here too. */
  maxSeconds: 60,
  /** 60 s of 16 kHz mono 16-bit is 1.92 MB; anything bigger was not made by our recorder. */
  maxBytes: 2_000_000,
  /** Below this it is a click, and inference on it is waste. */
  minSeconds: 0.3,
  /** Per person, per isolate, per minute — on top of the 240/min account ceiling. */
  perMinute: 12,
} as const;

const WAV_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/wave']);

/** AssemblyAI pre-recorded Universal-3.5 Pro: $0.21 per audio hour (assemblyai.com/docs/getting-started/models). */
export const ASSEMBLY = { id: 'assemblyai/universal-3-5-pro', usdPerAudioHour: 0.21 } as const;

export type VoiceProvider = 'assemblyai' | 'workers-ai';

export function neuronsFor(provider: VoiceProvider, seconds: number): number {
  if (!(seconds > 0)) return 0;
  const n = provider === 'assemblyai'
    ? ((seconds / 3600) * ASSEMBLY.usdPerAudioHour) / USD_PER_NEURON
    : (seconds / 60) * ASR_MODEL.neuronsPerAudioMinute;
  return Math.max(1, Math.ceil(n));
}

// ------------------------------------------------------------------------------ rate limit ---

const recent = new Map<string, number[]>();
function limited(userId: string, now: number): boolean {
  const since = now - 60_000;
  const hits = (recent.get(userId) ?? []).filter((t) => t > since);
  if (hits.length >= VOICE_LIMITS.perMinute) {
    recent.set(userId, hits);
    return true;
  }
  hits.push(now);
  recent.set(userId, hits);
  if (recent.size > 5_000) recent.clear();
  return false;
}
/** Tests only. */
export function resetVoiceRateLimit(): void {
  recent.clear();
}

// ------------------------------------------------------------------------------- providers ---

export interface TranscriptResult {
  text: string;
  /** Seconds the provider says it processed, when it says. */
  seconds: number | null;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Whisper large-v3-turbo on the AI binding, for speech.ts `transcribe()`.
 *
 * Not speech.ts's own `workersAiSpeech`, for two reasons: large-v3-turbo takes `audio` as a BASE64
 * STRING (its published input schema), not the number array that adapter sends; and this call asks
 * AI Gateway for `collectLog: false`, because the gateway log would otherwise keep the request
 * body — which is a child's voice.
 */
export function voiceWhisper(env: Env): SpeechProvider {
  return {
    name: 'workers-ai',
    async transcribe(req) {
      const gateway = env.AI_GATEWAY_ID
        ? { gateway: { id: env.AI_GATEWAY_ID, skipCache: true, cacheTtl: 0, collectLog: false, metadata: { kind: 'voice' } } }
        : undefined;
      const raw = (await env.AI.run(
        req.modelId as Parameters<Ai['run']>[0],
        { audio: req.audioBase64, ...(req.language ? { language: req.language } : {}), ...(req.vadFilter ? { vad_filter: true } : {}) } as never,
        gateway as never,
      )) as Record<string, unknown> | null;
      // Some responses carry the text only inside transcription_info; lift it so parseTranscript
      // reads it. A response with neither stays a schema fault there, never a silent "".
      const info = raw && typeof raw.transcription_info === 'object' && raw.transcription_info !== null
        ? (raw.transcription_info as Record<string, unknown>)
        : null;
      if (raw && typeof raw.text !== 'string' && typeof info?.text === 'string') return { ...raw, text: info.text };
      return raw;
    },
    async synthesize() {
      throw new Error('voiceWhisper transcribes only');
    },
  };
}

const AAI = 'https://api.assemblyai.com/v2';

async function assembly(key: string, bytes: Uint8Array, fetcher: typeof fetch, sleep: (ms: number) => Promise<void>): Promise<TranscriptResult> {
  const headers = { authorization: key };
  const up = await fetcher(`${AAI}/upload`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream' }, body: bytes });
  if (!up.ok) throw new Error(`assemblyai upload ${up.status}`);
  const { upload_url } = (await up.json()) as { upload_url?: string };
  if (!upload_url) throw new Error('assemblyai upload returned no url');
  const created = await fetcher(`${AAI}/transcript`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, speech_models: ['universal-3-5-pro', 'universal-2'], language_code: 'en' }),
  });
  if (!created.ok) throw new Error(`assemblyai transcript ${created.status}`);
  const { id } = (await created.json()) as { id?: string };
  if (!id) throw new Error('assemblyai returned no transcript id');
  try {
    for (let i = 0; i < 40; i += 1) {
      const res = await fetcher(`${AAI}/transcript/${encodeURIComponent(id)}`, { headers });
      const t = (await res.json()) as { status?: string; text?: unknown; audio_duration?: unknown; error?: unknown };
      if (t.status === 'completed') {
        if (typeof t.text !== 'string' && t.text !== null) throw new Error('assemblyai returned no text field');
        const d = Number(t.audio_duration);
        return { text: typeof t.text === 'string' ? t.text : '', seconds: Number.isFinite(d) && d > 0 ? d : null };
      }
      if (t.status === 'error') throw new Error(`assemblyai error: ${String(t.error).slice(0, 120)}`);
      await sleep(i < 10 ? 400 : 1000);
    }
    throw new Error('assemblyai did not finish in time');
  } finally {
    // Transcribed then deleted: this also deletes the /upload file. Awaited, so it is not dropped.
    await fetcher(`${AAI}/transcript/${encodeURIComponent(id)}`, { method: 'DELETE', headers }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------------- ledgers ---

function budget(env: Env) {
  return env.BUDGET_DO.get(env.BUDGET_DO.idFromName('singleton'));
}
async function reserve(env: Env, model: string, neurons: number): Promise<{ ok: true; reserved: number } | { ok: false; message: string }> {
  const res = await budget(env).fetch('https://do/reserve', { method: 'POST', body: JSON.stringify({ neurons, model }) });
  const data = (await res.json()) as { ok?: boolean; reserved?: number; reason?: string };
  if (!data.ok) {
    return { ok: false, message: data.reason === 'killed' ? 'Voice is paused right now. You can still type.' : 'Voice has reached today\'s shared limit. You can still type.' };
  }
  return { ok: true, reserved: data.reserved ?? neurons };
}
async function settle(env: Env, model: string, reserved: number, actual: number): Promise<void> {
  await budget(env).fetch('https://do/settle', { method: 'POST', body: JSON.stringify({ reserved, actual, model, kind: 'voice' }) }).catch(() => {});
}
function quota(env: Env, userId: string) {
  return env.QUOTA_DO.get(env.QUOTA_DO.idFromName(userId));
}

// ---------------------------------------------------------------------------------- handler ---

export interface VoiceDeps {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function handleVoiceTranscribe(req: Request, env: Env, userId: string | null | undefined, deps: VoiceDeps = {}): Promise<Response> {
  if (!userId) return json({ error: 'unauthorized' }, 401);
  if (limited(userId, (deps.now ?? Date.now)())) return json({ error: 'That was a lot of talking at once. Wait a moment and try again.', reason: 'rate_limited' }, 429);

  const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!WAV_TYPES.has(type)) return json({ error: 'Send the recording as a WAV file.', reason: 'unsupported_type' }, 415);
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > VOICE_LIMITS.maxBytes) return json({ error: 'That recording is too long. Keep it under a minute.', reason: 'too_large' }, 413);

  // The real size check is on what arrived, not on what the header claimed.
  let bytes: Uint8Array | null = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > VOICE_LIMITS.maxBytes) return json({ error: 'That recording is too long. Keep it under a minute.', reason: 'too_large' }, 413);
  const pcm = decodeWav(bytes);
  if (isAudioFault(pcm)) return json({ error: 'That recording could not be read. Try again.', reason: 'undecodable' }, 400);
  const seconds = durationSeconds(pcm);
  if (seconds > VOICE_LIMITS.maxSeconds) return json({ error: 'That recording is too long. Keep it under a minute.', reason: 'too_long' }, 413);
  if (seconds < VOICE_LIMITS.minSeconds) return json({ heard: false, text: '', reason: 'too_short', seconds, credits: 0 });

  const key = (env as Env & { ASSEMBLYAI_API_KEY?: string }).ASSEMBLYAI_API_KEY;
  const order: VoiceProvider[] = key ? ['assemblyai', 'workers-ai'] : ['workers-ai'];

  // Affordability before any provider runs; the charge itself follows the measured work.
  const est = creditsForNeurons(neuronsFor(order[0]!, seconds));
  const stateRes = await quota(env, userId).fetch('https://do/state');
  const state = (await stateRes.json().catch(() => null)) as { creditsRemaining?: number; unmetered?: boolean } | null;
  if (!state || (state.unmetered !== true && !((state.creditsRemaining ?? 0) >= est))) {
    return json({ error: 'Your Credits are used up for today. They refill at midnight UTC. You can still type.', reason: 'quota' }, 402);
  }

  let result: TranscriptResult | null = null;
  let used: VoiceProvider | null = null;
  let neurons = 0;
  let lastRefusal: string | null = null;
  try {
    for (const provider of order) {
      if (provider === 'workers-ai') {
        try {
          const out = await transcribe(env, voiceWhisper(env), { audioBase64: toBase64(bytes), contentType: 'audio/wav', language: 'en', vadFilter: true }, 'voice');
          if (!out.ok) {
            console.warn(`voice: workers-ai refused: ${out.code}`);
            continue;
          }
          result = { text: out.ok && out.heard ? out.text : '', seconds: out.billedSeconds };
          neurons = out.neurons;
          used = provider;
          break;
        } catch (e) {
          if (e instanceof BudgetError) lastRefusal = e.reason === 'killed' ? 'Voice is paused right now. You can still type.' : 'Voice has reached today\'s shared limit. You can still type.';
          else console.warn(`voice: workers-ai failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown'}`);
          continue;
        }
      }
      const held = await reserve(env, ASSEMBLY.id, neuronsFor(provider, seconds));
      if (!held.ok) { lastRefusal = held.message; continue; }
      try {
        result = await assembly(key!, bytes, deps.fetcher ?? fetch, deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))));
      } catch (e) {
        // Settled at the reservation, not released: a provider that failed mid-way may still bill.
        await settle(env, ASSEMBLY.id, held.reserved, held.reserved);
        // The error names the provider and status only — never the audio, never the key.
        console.warn(`voice: assemblyai failed: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown'}`);
        continue;
      }
      const billedSeconds = result.seconds !== null && result.seconds < seconds ? result.seconds : seconds;
      neurons = neuronsFor(provider, billedSeconds);
      await settle(env, ASSEMBLY.id, held.reserved, neurons);
      used = provider;
      break;
    }
  } finally {
    bytes = null; // dropped: the only reference to the audio in this worker
  }

  if (!result || !used) {
    return lastRefusal
      ? json({ error: lastRefusal, reason: 'budget' }, 503)
      : json({ error: 'Voice typing is not working right now. You can still type.', reason: 'provider' }, 502);
  }

  const credits = creditsForNeurons(neurons);
  // Charged after the work: the provider ran, so the person pays for it even when it heard nothing.
  await quota(env, userId)
    .fetch('https://do/spend', { method: 'POST', body: JSON.stringify({ credits, kind: 'voice' }) })
    .catch(() => {});

  const text = result.text.trim();
  return json({ heard: text.length > 0, text, provider: used, seconds: Number(seconds.toFixed(2)), credits });
}
