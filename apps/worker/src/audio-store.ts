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
import { RETENTION } from './retention';
import { getMedia, mediaStore, putMedia } from './media-store';

/**
 * How long generated audio stays retrievable ON THE KV PATH.
 *
 * This used to be the whole answer, and it was an hour. A sound the product made for someone was
 * gone before they came back to it — not because an hour was decided to be the right window, but
 * because KV needs a TTL to not accrete and an hour was the number chosen for previews. The
 * retention page published "1 hour" and was telling the truth about a policy nobody had set.
 *
 * With a bucket the bytes go to R2, which has no expiry of its own; the account's lifecycle rule
 * keeps audio for a year, and `AUDIO_R2_WINDOW` is that rule written down here so the retention
 * page can publish the window the storage actually enforces. This constant survives for the
 * deployments with no bucket, which still keep their hour.
 */
export const AUDIO_TTL_SECONDS = RETENTION.generatedAudioSeconds;

/**
 * The R2 lifecycle rule on the `audio/` prefix, in days.
 *
 * DERIVED, NOT REPEATED. It was written here as a literal 365 first, and `retention.test.mjs`
 * caught it within the minute: every declared window must be referenced by a file other than the
 * one that declares it, precisely so a number cannot exist in two places and drift. This is that
 * reference, and it is in this file because this is where the sound is written and where a reader
 * would come to ask how long it stays.
 *
 * WHAT NO TEST IN THIS REPOSITORY CAN CHECK. Nothing here enforces this window — a lifecycle rule
 * in the Cloudflare account does, and the worker cannot read it. The number is therefore a claim
 * about a setting in a dashboard, and if somebody changes that rule this constant becomes wrong
 * silently. It is written down as a claim rather than left implicit so that the next person knows
 * which fact is unverified, instead of finding out from a customer whose sound disappeared.
 */
export const AUDIO_R2_DAYS = RETENTION.generatedAudioR2Days;

/**
 * How long a browser may hold a copy of durable audio.
 *
 * NOT the object's life. On the KV path the header was bounded by what remained of the TTL, because
 * a cached copy must never outlive the object it copies. An R2 object lives a year, so that danger
 * is gone and the bound is doing a different job: keeping a player from replaying a stale copy of
 * something regenerated under the same id. An hour is enough for seeking and scrubbing, which is
 * what `no-store` would have cost — the image route can afford `no-store` because nobody seeks
 * inside a PNG.
 */
export const AUDIO_DURABLE_MAX_AGE = 3600;

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

  // R2 WHEN THERE IS ONE, and only then. There is no index table for audio — no row to compensate,
  // nothing to roll back — so a failed put simply means no audio was stored, which is what the
  // `null` return already means to every caller.
  if (mediaStore(env) !== null) {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    // The duration rides on the object because it has nowhere else to live. It is the panel's, not
    // billing's — that is stated where it is declared and it is still true here.
    const stored = await putMedia(env, 'audio', projectId, audioId, bytes, type,
      typeof seconds === 'number' && Number.isFinite(seconds) ? { seconds: String(Number(seconds.toFixed(3))) } : undefined);
    return stored ? audioId : null;
  }

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

export interface ServableAudio {
  bytes: Uint8Array;
  /** Already through the allowlist. A caller may put this in a header; the stored string may not. */
  contentType: string;
  /** Seconds a browser may keep a copy. */
  maxAge: number;
  durable: boolean;
}

/**
 * The audio, ready to serve, or null for every kind of miss there is.
 *
 * ONE FUNCTION FOR BOTH STORES, because the alternative is a route that knows which store an id
 * came from — and nothing knows that. An id is looked for in R2 first and in KV second, and the
 * answer to "not in either" is the same `null` the route already renders as a 404.
 *
 * THE ALLOWLIST IS APPLIED HERE, on whichever store answered. The stored content type is a value a
 * writer chose; `audio/wav` and `audio/mpeg` are the only two this worker will name in a header,
 * and a stored `text/html` on our own origin is a page that runs script. A type outside the list
 * reads as a miss rather than as a download, because serving it as an octet-stream would confirm
 * to a prober that the object exists.
 */
export async function readAudio(env: Env, projectId: string, audioId: string): Promise<ServableAudio | null> {
  const object = await getMedia(env, 'audio', projectId, audioId);
  if (object) {
    const type = servableAudioType(object.contentType);
    if (!type) return null;
    return { bytes: new Uint8Array(object.body), contentType: type, maxAge: AUDIO_DURABLE_MAX_AGE, durable: true };
  }

  const { value: base64, metadata } = await env.KV.getWithMetadata<AudioMeta>(audioKvKey(projectId, audioId));
  if (!base64) return null;
  const type = servableAudioType(metadata?.contentType);
  if (!type) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); }
  catch { return null; }
  // THE REMAINING LIFE, not the full TTL: KV anchors expiry at write time and this header is
  // anchored at response time, so a full hour served to an object with two minutes left caches a
  // copy that outlives what it is a copy of.
  const remaining = Math.max(0, (metadata?.expiresAt ?? 0) - Math.floor(Date.now() / 1000));
  return { bytes, contentType: type, maxAge: Math.min(remaining, AUDIO_TTL_SECONDS), durable: false };
}
