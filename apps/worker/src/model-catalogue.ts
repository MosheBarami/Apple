// The model picker's catalogue: Apple's own models, a curated set of paid models reachable on the
// customer's own OpenRouter key, and the models OpenRouter prices at zero TODAY.
//
// D-FREE-1: free promotions are time-limited, so the free list is DERIVED from OpenRouter's live
// catalogue — prompt and completion price both zero, and "tools" among the supported parameters,
// because a model that cannot call tools cannot build anything — and cached for an hour. The
// embedded snapshot (openrouter-snapshot.ts) is used only when that read fails, and the response
// says so and says when the list it is showing was read.
//
// The paid list is a curation, not a derivation: which of OpenRouter's hundreds of models a young
// creator should be offered is a product decision. It names ids only; every label and vendor is
// taken from OpenRouter's own record of that id, so nothing here can invent a model.
import type { Env } from './env';
import { PRODUCT_MODELS, PRODUCT_MODEL_INFO, type CatalogueModel, type ModelCatalogue } from '@golem/shared';
import { OPENROUTER_SNAPSHOT, OPENROUTER_SNAPSHOT_READ_AT } from './openrouter-snapshot';
import { OPENROUTER_BASE_URL, type FetchLike } from './providers';

/** Paid models offered on the customer's own key, in display order. Every id is in the snapshot. */
export const CURATED_PAID_IDS: readonly string[] = [
  'openai/gpt-6-astra',
  'openai/gpt-6-sol',
  'openai/gpt-6-luna',
  'anthropic/claude-fable-5.1',
  'anthropic/claude-opus-5.5',
  'google/gemini-3.8-flash',
  'deepseek/deepseek-v4.1-flash',
  'x-ai/grok-4.7',
  'qwen/qwen3.8-max-0902',
  'z-ai/glm-5.3-flash',
  'xiaomi/mimo-v2.6-pro',
  'meta/muse-spark-1.3',
];

export const FREE_CACHE_MS = 60 * 60 * 1000;
/** A failed read is retried sooner than an hour: the snapshot is the worse answer. */
export const FREE_RETRY_MS = 5 * 60 * 1000;

interface FreeRow {
  id: string;
  name: string;
}

/** "OpenAI: GPT-6 Astra" -> vendor "OpenAI", label "GPT-6 Astra". OpenRouter's own convention. */
export function splitOpenRouterName(id: string, name: string): { vendor: string; label: string } {
  const i = name.indexOf(': ');
  if (i > 0) return { vendor: name.slice(0, i), label: name.slice(i + 2) };
  return { vendor: id.split('/')[0] ?? id, label: name || id };
}

function isZeroPrice(v: unknown): boolean {
  return (typeof v === 'string' || typeof v === 'number') && String(v).trim() !== '' && Number(v) === 0;
}

/**
 * The free, tool-capable models in one `/api/v1/models` response.
 *
 * Router ids (`openrouter/…`, e.g. `openrouter/free`) are left out: they hand each request to
 * whichever free model is up, so a build could change models mid-run with no one choosing it.
 */
export function freeFromLive(body: unknown): FreeRow[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: FreeRow[] = [];
  for (const m of data as { id?: unknown; name?: unknown; pricing?: { prompt?: unknown; completion?: unknown }; supported_parameters?: unknown }[]) {
    if (typeof m?.id !== 'string' || !m.id || m.id.startsWith('openrouter/')) continue;
    if (!isZeroPrice(m.pricing?.prompt) || !isZeroPrice(m.pricing?.completion)) continue;
    if (!Array.isArray(m.supported_parameters) || !m.supported_parameters.includes('tools')) continue;
    out.push({ id: m.id, name: typeof m.name === 'string' ? m.name : m.id });
  }
  return out;
}

function freeFromSnapshot(): FreeRow[] {
  return OPENROUTER_SNAPSHOT.filter((m) => m.free && m.tools && !m.id.startsWith('openrouter/')).map(({ id, name }) => ({ id, name }));
}

let cache: { expires: number; readAt: string; source: 'live' | 'snapshot'; rows: FreeRow[] } | null = null;

export function resetCatalogueCache(): void {
  cache = null;
}

export interface CatalogueOptions {
  now?: number;
  fetchImpl?: FetchLike;
}

async function freeRows(env: Env, opts: CatalogueOptions): Promise<{ readAt: string; source: 'live' | 'snapshot'; rows: FreeRow[] }> {
  const now = opts.now ?? Date.now();
  if (cache && cache.expires > now) return cache;
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const platformKey = env.OPENROUTER_API_KEY?.trim();
    const res = await fetchImpl(`${OPENROUTER_BASE_URL}/models`, {
      method: 'GET',
      headers: platformKey ? { authorization: `Bearer ${platformKey}` } : {},
    });
    if (!res.ok) throw new Error(`models HTTP ${res.status}`);
    const body = await res.json();
    // An answer with NO models at all is a failed read that happened to return 200, not news that
    // every model became paid: fall back rather than show an empty free list as a fact.
    if (!Array.isArray((body as { data?: unknown })?.data) || !(body as { data: unknown[] }).data.length) {
      throw new Error('models response carried no models');
    }
    cache = { expires: now + FREE_CACHE_MS, readAt: new Date(now).toISOString(), source: 'live', rows: freeFromLive(body) };
  } catch {
    cache = { expires: now + FREE_RETRY_MS, readAt: OPENROUTER_SNAPSHOT_READ_AT, source: 'snapshot', rows: freeFromSnapshot() };
  }
  return cache;
}

function builtIns(): CatalogueModel[] {
  return PRODUCT_MODELS.map((id) => ({
    id,
    label: PRODUCT_MODEL_INFO[id].name,
    vendor: 'Apple',
    requiresKey: false,
    free: false,
    supportsTools: true,
    builtIn: true,
  }));
}

function curatedPaid(): CatalogueModel[] {
  const out: CatalogueModel[] = [];
  for (const id of CURATED_PAID_IDS) {
    const row = OPENROUTER_SNAPSHOT.find((m) => m.id === id);
    if (!row || !row.tools) continue;
    out.push({ id, ...splitOpenRouterName(id, row.name), requiresKey: true, free: false, supportsTools: true, builtIn: false });
  }
  return out;
}

/** True when a platform OpenRouter key exists, so free models run without the customer's own. */
export function keylessFree(env: Pick<Env, 'OPENROUTER_API_KEY'>): boolean {
  return !!env.OPENROUTER_API_KEY?.trim();
}

export async function modelCatalogue(env: Env, opts: CatalogueOptions = {}): Promise<ModelCatalogue> {
  const free = await freeRows(env, opts);
  const keyless = keylessFree(env);
  const paid = curatedPaid();
  const paidIds = new Set(paid.map((m) => m.id));
  const freeModels: CatalogueModel[] = free.rows
    .filter((r) => !paidIds.has(r.id))
    .map((r) => ({ id: r.id, ...splitOpenRouterName(r.id, r.name), requiresKey: !keyless, free: true, supportsTools: true, builtIn: false }));
  return {
    models: [...builtIns(), ...paid, ...freeModels],
    free: { readAt: free.readAt, source: free.source, keyless },
  };
}

/**
 * The catalogue entry a chat frame's `model` names, or null when it names nothing on offer.
 * Built-in ids are returned too, so the caller can tell "Apple model" from "unknown id".
 */
export async function catalogueEntry(env: Env, id: string, opts: CatalogueOptions = {}): Promise<CatalogueModel | null> {
  const cat = await modelCatalogue(env, opts);
  return cat.models.find((m) => m.id === id) ?? null;
}
