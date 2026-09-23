// Hugging Face: a second image model and an external 3D generator, on a daily cap (D-HF-1).
//
// WHAT IS REAL HERE, MEASURED 2026-09-23 WITH THE OWNER'S TOKEN.
//   * Image: Tongyi-MAI/Z-Image-Turbo (Apache-2.0) through Inference Providers, provider fal-ai,
//     via router.huggingface.co. One call: submit 200 in 1.8 s, done 3.8 s, 1024x1024 PNG of
//     967,462 bytes, 5.6 s end to end.
//   * 3D: NO Inference Provider serves image-to-3d or text-to-3d. The Hub's own listing
//     (`/api/models?pipeline_tag=image-to-3d&inference_provider=all`) is empty, and neither task
//     appears among the ~3,000 models fal-ai, replicate and wavespeed serve. The one real HF path
//     is a ZeroGPU Space, called over its Gradio API with our token so the GPU seconds are counted
//     against our account's ZeroGPU quota rather than paid for. tencent/Hunyuan3D-2 is the Space
//     used: it is stateless (no session state between steps, unlike the TRELLIS and Stable Fast 3D
//     Spaces), and its text-to-3D switch is off, so a prompt goes text → image (above) → mesh.
//     Real call: `shape_generation` 8.4 s (1,251,192 triangles, 18.9 MB), then the Space's own
//     CPU `on_export_click` reduced it to exactly 10,000 triangles, a 180,844-byte GLB.
//
// WHY THE MESH IS UNTEXTURED. Roblox refuses a mesh above 20,000 triangles
// (create.roblox.com/docs/art/modeling/specifications). The Space's textured path
// (`generation_all`) reduces to 40,000 faces and its export cannot reduce a textured mesh, so the
// only output that fits Roblox is the reduced white mesh. It comes back as one grey MeshPart the
// caller colours in Studio.
//
// THE CAP. The account is on free monthly inference credits, and ZeroGPU has a small daily
// quota. So every call takes a slot from a per-UTC-day counter in KV BEFORE the request goes out,
// and a failed call keeps its slot — otherwise a failing provider is a loop that retries past the
// cap. KV is not atomic: two isolates racing can both read N and both write N+1, so the cap can be
// overshot by the number of concurrent callers at the boundary. For a platform-wide daily count of
// single digits that is an acceptable error in the safe direction of a small ceiling; it is stated
// here so nobody reads this as an exact meter.
//
// THE TOKEN goes to huggingface.co and *.hf.space and nowhere else. The fal CDN URL that carries
// the finished image is fetched without it, and every provider message is scrubbed of it before
// it is returned — redaction.ts has no `hf_` rule, so the token's own text is removed by value.
import { dayKey } from './quota-math';
import { redactSecrets } from './redaction';
import { imageMimeType, screenSubject } from './imagegen';

export interface HfEnv {
  HF_TOKEN?: string;
  KV: Pick<KVNamespace, 'get' | 'put'>;
}

export const HF_IMAGE_MODEL = {
  hubId: 'Tongyi-MAI/Z-Image-Turbo',
  provider: 'fal-ai',
  providerId: 'fal-ai/z-image/turbo',
} as const;

export const HF_3D_MODEL = {
  hubId: 'tencent/Hunyuan3D-2',
  space: 'tencent/Hunyuan3D-2',
  host: 'https://tencent-hunyuan3d-2.hf.space',
  /** What the Space's export reduces to. Half of Roblox's limit, and what was measured. */
  targetTriangles: 10_000,
} as const;

/** Roblox: "Individual meshes can not exceed 20,000 triangles." */
export const ROBLOX_MAX_TRIANGLES = 20_000;

/**
 * Calls per UTC day, across the whole deployment. Z-Image-Turbo costs about $0.005 per 1024² image
 * on fal-ai and a free account's credits are a few cents a month; a 3D call also spends one image
 * slot when it starts from a prompt.
 */
export const HF_DAILY_CAPS = { image: 3, model3d: 3 } as const;
export type HfCallKind = keyof typeof HF_DAILY_CAPS;

export type HfFailureReason =
  | 'not_configured'
  | 'daily_cap'
  | 'credits_exhausted'
  | 'provider_error'
  | 'timeout'
  | 'refused'
  | 'bad_output';

export interface HfFailure {
  ok: false;
  reason: HfFailureReason;
  message: string;
  status?: number;
}

export interface HfImage {
  ok: true;
  png: Uint8Array;
  width: number;
  height: number;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface Hf3d {
  ok: true;
  glb: Uint8Array;
  triangles: number;
  model: string;
  /** The picture the mesh was built from — generated here, or the one the caller passed. */
  sourceImage: Uint8Array;
  latencyMs: number;
}

export interface HfOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Ceiling on waiting for one provider job. */
  maxWaitMs?: number;
}

const ROUTER = 'https://router.huggingface.co';
const DEFAULT_WAIT_MS = 120_000;
const POLL_MS = 700;

export function isHfConfigured(env: { HF_TOKEN?: string }): boolean {
  return typeof env.HF_TOKEN === 'string' && env.HF_TOKEN.trim().length > 0;
}

/** Take one of today's slots, or say the day is spent. The slot is taken before the call. */
export async function takeDailySlot(
  env: HfEnv,
  kind: HfCallKind,
  now: number = Date.now(),
): Promise<{ ok: boolean; used: number; cap: number }> {
  const cap = HF_DAILY_CAPS[kind];
  const key = `hf:calls:${dayKey(now)}:${kind}`;
  const used = Number.parseInt((await env.KV.get(key)) ?? '0', 10) || 0;
  if (used >= cap) return { ok: false, used, cap };
  await env.KV.put(key, String(used + 1), { expirationTtl: 2 * 86_400 });
  return { ok: true, used: used + 1, cap };
}

const fail = (reason: HfFailureReason, message: string, status?: number): HfFailure =>
  status === undefined ? { ok: false, reason, message } : { ok: false, reason, message, status };

/** A provider's words with our token taken out, redacted then truncated (never the other way). */
function scrub(env: HfEnv, text: string): string {
  const token = env.HF_TOKEN?.trim();
  const byValue = token ? text.split(token).join('[redacted]') : text;
  return redactSecrets(byValue, { max: 300 }).text;
}

async function providerFailure(env: HfEnv, res: Response, what: string): Promise<HfFailure> {
  const body = scrub(env, await res.text().catch(() => ''));
  if (res.status === 402) return fail('credits_exhausted', `Hugging Face credits are used up for this month (${what}): ${body}`, 402);
  return fail('provider_error', `${what} answered HTTP ${res.status}: ${body}`, res.status);
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------ image ---

/**
 * One PNG from Z-Image-Turbo. `prompt` is used as given — callers compose it (the tool snippet
 * uses imagegen's `composeArtDirection`, which also refuses brand marks and painted words).
 */
export async function generateImage(env: HfEnv, prompt: string, opts: HfOptions = {}): Promise<HfImage | HfFailure> {
  if (!isHfConfigured(env)) return fail('not_configured', 'HF_TOKEN is not set, so Hugging Face image generation is off');
  const now = opts.now ?? Date.now;
  const slot = await takeDailySlot(env, 'image', now());
  if (!slot.ok) return fail('daily_cap', `today's ${slot.cap} Hugging Face image calls are used; try again after midnight UTC`);
  return runImage(env, prompt, opts);
}

async function runImage(env: HfEnv, prompt: string, opts: HfOptions): Promise<HfImage | HfFailure> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const maxWait = opts.maxWaitMs ?? DEFAULT_WAIT_MS;
  const auth = { authorization: `Bearer ${env.HF_TOKEN!.trim()}` };
  const started = now();

  const submit = await fetchImpl(`${ROUTER}/fal-ai/${HF_IMAGE_MODEL.providerId}?_subdomain=queue`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: String(prompt).slice(0, 2000), image_size: 'square_hd', output_format: 'png', enable_safety_checker: true }),
  });
  if (!submit.ok) return providerFailure(env, submit, 'the image provider');
  const job = (await submit.json().catch(() => null)) as { status?: string; response_url?: string } | null;
  let path: string;
  try { path = new URL(String(job?.response_url)).pathname; } catch { return fail('provider_error', 'the image provider returned no job to wait on'); }
  const base = `${ROUTER}/fal-ai${path}`;

  let status = job?.status;
  while (status !== 'COMPLETED') {
    if (now() - started > maxWait) return fail('timeout', `the image was not ready after ${Math.round(maxWait / 1000)} s`);
    await sleep(POLL_MS);
    const s = await fetchImpl(`${base}/status?_subdomain=queue`, { headers: auth });
    if (!s.ok) return providerFailure(env, s, 'the image provider');
    status = ((await s.json().catch(() => null)) as { status?: string } | null)?.status;
  }

  const res = await fetchImpl(`${base}?_subdomain=queue`, { headers: auth });
  if (!res.ok) return providerFailure(env, res, 'the image provider');
  const out = (await res.json().catch(() => null)) as {
    images?: { url?: string; width?: number; height?: number }[];
    has_nsfw_concepts?: boolean[];
  } | null;
  if (out?.has_nsfw_concepts?.some(Boolean)) return fail('refused', 'the provider\'s safety checker flagged the image, so it was discarded');
  const first = out?.images?.[0];
  if (!first?.url || !/^https:\/\//.test(first.url)) return fail('bad_output', 'the image provider returned no image URL');

  // Third-party CDN: no credential on this request.
  const img = await fetchImpl(first.url);
  if (!img.ok) return fail('provider_error', `the finished image could not be downloaded (HTTP ${img.status})`, img.status);
  const png = new Uint8Array(await img.arrayBuffer());
  if (imageMimeType(png) !== 'image/png') return fail('bad_output', 'the provider returned something that is not a PNG');
  return {
    ok: true,
    png,
    width: first.width ?? 1024,
    height: first.height ?? 1024,
    model: HF_IMAGE_MODEL.hubId,
    provider: HF_IMAGE_MODEL.provider,
    latencyMs: now() - started,
  };
}

// --------------------------------------------------------------------------------- 3D ---

export type Generate3dInput = { prompt: string } | { imagePng: Uint8Array };

/**
 * A Roblox-sized GLB from a prompt or a picture.
 *
 * From a prompt, the subject is screened with imagegen's rules (brand marks, painted words) before
 * a slot is taken, and an object shot on a plain background is drawn first — that is what an
 * image-to-3D model reconstructs well, and the Space strips the background itself.
 *
 * No image URL input, on purpose: a URL here would come from a language model, and fetching it
 * would make this a confused deputy that net-policy.ts exists to prevent. Pass bytes.
 */
export async function generate3d(env: HfEnv, input: Generate3dInput, opts: HfOptions = {}): Promise<Hf3d | HfFailure> {
  if (!isHfConfigured(env)) return fail('not_configured', 'HF_TOKEN is not set, so Hugging Face 3D generation is off');
  const now = opts.now ?? Date.now;
  const started = now();

  let prompt: string | null = null;
  if ('prompt' in input) {
    const screened = screenSubject(String(input.prompt ?? ''));
    if ('refused' in screened) return fail('refused', screened.message);
    if (!screened.cleaned) return fail('refused', 'describe the object to build');
    prompt = screened.cleaned;
  }

  const slot = await takeDailySlot(env, 'model3d', now());
  if (!slot.ok) return fail('daily_cap', `today's ${slot.cap} Hugging Face 3D calls are used; try again after midnight UTC`);

  let image: Uint8Array;
  if (prompt !== null) {
    const pic = await generateImage(env, objectShot(prompt), opts);
    if (!pic.ok) return pic;
    image = pic.png;
  } else {
    image = (input as { imagePng: Uint8Array }).imagePng;
    if (imageMimeType(image) !== 'image/png') return fail('refused', 'the source picture must be a PNG');
  }

  const mesh = await runSpace(env, image, opts);
  if (!mesh.ok) return mesh;
  return { ...mesh, sourceImage: image, latencyMs: now() - started };
}

/** The picture an image-to-3D model reconstructs best: one whole object, plain background. */
function objectShot(subject: string): string {
  return `a single ${subject}, one whole object, chunky low-poly game asset, bright saturated colours, `
    + 'centred and fully in frame, three-quarter view from slightly above, isolated on a plain white background, '
    + 'no ground, no shadow, no text';
}

type GradioFile = { path: string; meta: { _type: 'gradio.FileData' } };
const gradioFile = (path: string): GradioFile => ({ path, meta: { _type: 'gradio.FileData' } });

/** Gradio wraps outputs in `{ value, __type__: 'update' }`; the path is inside. */
function filePath(v: unknown): string | null {
  const inner = (v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v) as { path?: unknown } | null;
  const p = inner?.path;
  return typeof p === 'string' && p.startsWith('/') && !p.includes('..') ? p : null;
}

async function runSpace(env: HfEnv, png: Uint8Array, opts: HfOptions): Promise<Omit<Hf3d, 'sourceImage' | 'latencyMs'> | HfFailure> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxWait = opts.maxWaitMs ?? DEFAULT_WAIT_MS;
  const host = HF_3D_MODEL.host;
  // The token makes ZeroGPU count the seconds against our account's quota, not an anonymous one.
  const auth = { authorization: `Bearer ${env.HF_TOKEN!.trim()}` };

  const form = new FormData();
  form.append('files', new Blob([png], { type: 'image/png' }), 'input.png');
  const up = await fetchImpl(`${host}/upload`, { method: 'POST', headers: auth, body: form });
  if (!up.ok) return providerFailure(env, up, 'the 3D Space upload');
  const uploaded = ((await up.json().catch(() => null)) as unknown[] | null)?.[0];
  if (typeof uploaded !== 'string') return fail('provider_error', 'the 3D Space accepted the upload but named no file');

  const call = async (api: string, data: unknown[]): Promise<unknown[] | HfFailure> => {
    const submit = await fetchImpl(`${host}/call/${api}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    if (!submit.ok) return providerFailure(env, submit, `the 3D Space (${api})`);
    const eventId = ((await submit.json().catch(() => null)) as { event_id?: unknown } | null)?.event_id;
    if (typeof eventId !== 'string') return fail('provider_error', `the 3D Space (${api}) returned no job id`);
    let text: string;
    try {
      const stream = await fetchImpl(`${host}/call/${api}/${encodeURIComponent(eventId)}`, { headers: auth, signal: AbortSignal.timeout(maxWait) });
      if (!stream.ok) return providerFailure(env, stream, `the 3D Space (${api})`);
      text = await stream.text();
    } catch (e) {
      if ((e as Error)?.name === 'TimeoutError') return fail('timeout', `the 3D Space (${api}) did not finish within ${Math.round(maxWait / 1000)} s`);
      throw e;
    }
    const events = [...text.matchAll(/event: (\w+)\ndata: (.*)/g)];
    const done = events.find((m) => m[1] === 'complete');
    if (done) {
      try { return JSON.parse(done[2]!) as unknown[]; } catch { return fail('provider_error', `the 3D Space (${api}) returned an unreadable result`); }
    }
    const err = events.find((m) => m[1] === 'error')?.[2];
    let said = '';
    try { said = err ? String(JSON.parse(err) ?? '') : ''; } catch { said = err ?? ''; }
    return fail('provider_error', `the 3D Space (${api}) failed${said ? `: ${scrub(env, said)}` : ' without saying why (a busy or out-of-quota ZeroGPU Space answers this way)'}`);
  };

  // caption, image, four multi-view slots, steps, guidance, seed, octree, remove background,
  // chunks, randomise seed — the order of the Space's /info for `shape_generation`.
  const shape = await call('shape_generation', [null, gradioFile(uploaded), null, null, null, null, 30, 5.0, 1234, 256, true, 8000, true]);
  if (!Array.isArray(shape)) return shape;
  const raw = filePath(shape[0]);
  if (!raw) return fail('provider_error', 'the 3D Space produced no mesh file');

  // file_out, file_out2, type, reduce faces, include texture, target faces. Runs on CPU.
  const exported = await call('on_export_click', [gradioFile(raw), null, 'glb', true, false, HF_3D_MODEL.targetTriangles]);
  if (!Array.isArray(exported)) return exported;
  const reduced = filePath(exported[1]);
  if (!reduced) return fail('provider_error', 'the 3D Space exported no GLB');

  // Gradio 4.44 reports `url` under /call/<api>/file=… which is a 404; /file=<path> serves it.
  const file = await fetchImpl(`${host}/file=${reduced}`, { headers: auth });
  if (!file.ok) return fail('provider_error', `the finished GLB could not be downloaded (HTTP ${file.status})`, file.status);
  const glb = new Uint8Array(await file.arrayBuffer());
  const triangles = glbTriangles(glb);
  if (triangles === null) return fail('bad_output', 'the 3D Space returned a file that is not a readable GLB');
  if (triangles > ROBLOX_MAX_TRIANGLES) {
    return fail('bad_output', `the mesh has ${triangles} triangles; Roblox refuses more than ${ROBLOX_MAX_TRIANGLES} in one mesh`);
  }
  return { ok: true, glb, triangles, model: HF_3D_MODEL.hubId };
}

/**
 * Total triangles in a GLB, or null when it is not one. Counts every mesh together, which is at
 * least the largest single mesh — so checking it against the per-mesh limit can only be stricter.
 * packages/evals/src/glb-inspect.mjs is the independent reader the tests compare this against.
 */
export function glbTriangles(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 20) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(16, true) !== 0x4e4f534a) return null;
  const len = dv.getUint32(12, true);
  let doc: { meshes?: { primitives?: { mode?: number; indices?: number; attributes?: { POSITION?: number } }[] }[]; accessors?: { count?: number }[] };
  try { doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))); } catch { return null; }
  let triangles = 0;
  for (const mesh of doc.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      const mode = p.mode ?? 4;
      if (mode < 4 || mode > 6) continue;
      const verts = p.attributes?.POSITION != null ? (doc.accessors?.[p.attributes.POSITION]?.count ?? 0) : 0;
      const n = p.indices != null ? (doc.accessors?.[p.indices]?.count ?? 0) : verts;
      triangles += mode === 4 ? Math.floor(n / 3) : Math.max(0, n - 2);
    }
  }
  return triangles;
}
