// Voice typing, the browser half: a recording becomes a 16 kHz mono WAV and goes to the worker,
// which transcribes it and keeps nothing (apps/worker/src/voice-transcribe.ts). Replaces the
// browser's own speech recognition, which in Chrome sends the voice to Google — for children's
// voices the audio has to go only through Apple, and only to be transcribed (D-VISION-1).
import { getAccessToken } from './supabase';

export const VOICE_RATE = 16_000;
/** The worker refuses anything longer; the composer stops recording here. */
export const VOICE_MAX_SECONDS = 60;

/** 16-bit PCM mono WAV. Samples are clamped to [-1, 1]. */
export function encodeWav(samples: Float32Array, rate = VOICE_RATE): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/** Whatever MediaRecorder produced (webm/opus, mp4/aac) → a 16 kHz mono WAV, decoded in the page. */
export async function recordingToWav(recording: Blob): Promise<Blob> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
  } finally {
    void ctx.close().catch(() => {});
  }
  const seconds = Math.min(decoded.duration, VOICE_MAX_SECONDS);
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * VOICE_RATE)), VOICE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const mono = await off.startRendering();
  return new Blob([encodeWav(mono.getChannelData(0))], { type: 'audio/wav' });
}

export interface VoiceTranscript {
  heard: boolean;
  text: string;
  provider?: string;
  seconds?: number;
  credits?: number;
}

/** POST the WAV; resolves with the words, rejects with a sentence a kid can read. */
export async function transcribeVoice(wav: Blob, fetcher: typeof fetch = fetch): Promise<VoiceTranscript> {
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetcher('/api/voice/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: wav,
    });
  } catch {
    throw new Error('Could not reach Apple to hear you. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as (VoiceTranscript & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? 'Voice typing did not work. You can still type.');
  return { ...body, text: typeof body.text === 'string' ? body.text : '', heard: body.heard === true };
}
