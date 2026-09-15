// Where generated audio lives between being made and being heard.
//
// This is imagegen.ts's KV-plus-route pattern, applied to audio, and it exists because of what
// happened the first time that pattern was only half built: `generate_image` parked PNGs in KV and
// handed back a key, nothing served them, and every image the product generated rendered as the
// client's "expired" state — telling users their image had expired when it had never once been
// reachable. tests/image-route.test.mjs opens with that story. Audio arrives with the route already
// written and a live test that issues real requests through the app.
//
// TWO THINGS ARE DIFFERENT FROM IMAGES, and both are in here rather than in the route:
//
//   1. THE CONTENT TYPE IS STORED, because audio is not one format. A generated effect is a WAV and
//      a spoken line is an MP3, and the browser needs to be told which. That makes the stored type
//      a value that ends up in a response HEADER — which is exactly the kind of value that must
//      never be echoed back unchecked. `servableAudioType` is the allowlist, and the route uses it
//      rather than trusting what is in KV.
//   2. There is no equivalent of the flatness gate. Nothing here judges the audio.
import type { Env } from './env';

/** How long generated audio stays retrievable. Long enough to listen and download, short enough not to accrete. */
export const AUDIO_TTL_SECONDS = 3600;

/**
 * The only media types this worker will hand back, and the extension each one downloads as.
 *
 * AN ALLOWLIST BECAUSE THE VALUE ENDS UP IN A HEADER. A `Content-Type` taken from storage and
 * echoed into a response is a value a writer chooses and a browser obeys: `text/html` there turns
 * a generated-audio URL on our own origin into a page that runs script. The route therefore never
 * uses the stored string directly — it looks it up here, and a type that is not in this table is
 * served as a download rather than as anything a browser will interpret.
 */
export const SERVABLE_AUDIO_TYPES: Readonly<Record<string, string>> = {
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

/** The stored type, or null when it is not one this worker will serve. */
export function servableAudioType(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const type = raw.split(';')[0]!.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SERVABLE_AUDIO_TYPES, type) ? type : null;
}

export interface AudioMeta {
  /** The unix second at which KV drops the object. Anchored at WRITE time — see below. */
  expiresAt: number;
  contentType: string;
  /** Seconds of audio, when it was known at write time. For the panel, never for billing. */
  seconds?: number;
}

/**
 * The KV key generated audio lives under.
 *
 * SCOPED TO THE PROJECT, and that scoping IS the authorisation — the reasoning is imagegen.ts's,
 * and it is worth restating because it is the part that looks like tidiness and is not. A key of
 * `audio:<uuid>` with nothing tying the bytes to anyone forces the serving route to trust the
 * caller's own identifier, and a route whose only protection is that an id is hard to guess has no
 * protection at all, one shared transcript later. With the project in the key, the route asks the
 * question it already knows how to ask — does this user own this project? — and a caller who owns
 * a different project cannot construct a key into someone else's audio whatever id they present.
 */
export function audioKvKey(projectId: string, audioId: string): string {
  return `audio:${projectId}:${audioId}`;
}

/** The same-origin path the browser fetches. Shared so the tool and the route agree on one shape. */
export function audioPathFor(projectId: string, audioId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/audio/${encodeURIComponent(audioId)}`;
}

/**
 * Park audio in KV and return its id.
 *
 * `expiresAt` is written alongside because the TTL is anchored HERE, at write time, and every
 * reader is somewhere else in time. A reader that assumes a full life remains hands out a
 * Cache-Control that outlives the object — the same defect the image route's header carries a
 * comment about.
 */
export async function storeAudio(
  env: Env,
  base64: string,
  projectId: string,
  contentType: string,
  seconds?: number,
): Promise<string | null> {
  const type = servableAudioType(contentType);
  if (!type) return null;
  const audioId = crypto.randomUUID();
  await env.KV.put(audioKvKey(projectId, audioId), base64, {
    expirationTtl: AUDIO_TTL_SECONDS,
    metadata: {
      expiresAt: Math.floor(Date.now() / 1000) + AUDIO_TTL_SECONDS,
      contentType: type,
      ...(typeof seconds === 'number' && Number.isFinite(seconds) ? { seconds: Number(seconds.toFixed(3)) } : {}),
    } satisfies AudioMeta,
  });
  return audioId;
}
