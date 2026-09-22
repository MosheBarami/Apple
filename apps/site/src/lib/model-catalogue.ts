/**
 * THE MODEL LIST THE PUBLIC SITE SHOWS, ASKED OF THE WORKER'S OWN CODE.
 *
 * Nothing in this file names a model. The page calls the same `modelCatalogue()` the worker answers
 * `GET /api/models` with, and hands it a fetch that always fails — so what comes back is exactly
 * what a signed-in customer's picker shows when OpenRouter cannot be reached: Apple's two built-in
 * models, the curated paid list, and the free list from the snapshot the worker embeds, labelled
 * with the time that snapshot was read. The site never calls OpenRouter at build time; a build that
 * depended on the network would print a different page each time it ran.
 *
 * WHY THE SNAPSHOT AND NOT A LIVE READ. The free list is time-limited by nature (owner decision
 * D-FREE-1). The app re-reads it every hour; a static page cannot. So the page states when its list
 * was read and says the app has the current one — it never presents a dated row as today's fact.
 *
 * Build-time only (Astro frontmatter). Nothing here reaches the browser.
 */
import { modelCatalogue } from '../../../worker/src/model-catalogue';
import { BYOK_PROVIDERS, type ByokProvider, type CatalogueModel, type ModelCatalogue } from '@golem/shared';

/** The failure the worker's catalogue treats as "OpenRouter is unreachable". */
const offline = async (): Promise<Response> => {
  throw new Error('the public site does not call OpenRouter at build time');
};

export async function siteCatalogue(): Promise<ModelCatalogue> {
  // `{}` is an Env with no platform OpenRouter key: the page describes the product as it is
  // deployed without one, so free models are shown as needing the customer's own key — which is
  // what D-FREE-1 says they need until the owner adds a platform key.
  return modelCatalogue({} as never, { fetchImpl: offline });
}

/** Display names for the providers a customer may save a key for. One row per BYOK_PROVIDERS id. */
export const BYOK_PROVIDER_NAMES: Record<ByokProvider, string> = {
  openrouter: 'OpenRouter',
};

export const byokProviderNames = (): string[] => BYOK_PROVIDERS.map((p) => BYOK_PROVIDER_NAMES[p]);

/*
 * VENDOR ICONS. Each file under ../assets/model-logos is a byte-identical copy of one icon from
 * @lobehub/icons-static-svg (MIT), recorded with its source URL and sha256 in the NOTICE beside
 * it. The map is keyed on the OpenRouter id's vendor prefix — the part before the slash — with a
 * model-family override where one vendor ships two marks (Google: Gemini and Gemma). A vendor with
 * no icon in that collection gets its initial in a plain disc rather than a drawn guess at a logo.
 */
const svgs = import.meta.glob('../assets/model-logos/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const svg = (file: string): string | null => svgs[`../assets/model-logos/${file}.svg`] ?? null;

const BY_PREFIX: Record<string, string> = {
  apple: '',
  openai: 'openai',
  anthropic: 'anthropic',
  deepseek: 'deepseek',
  'x-ai': 'grok',
  qwen: 'qwen',
  'z-ai': 'zai',
  xiaomi: 'xiaomimimo',
  meta: 'meta',
  nvidia: 'nvidia',
  'dots-studio': 'dotsstudio',
  poolside: 'poolside',
};

/** The icon file a model is drawn with, or null for the initial-in-a-disc fallback. */
export function logoFileFor(model: Pick<CatalogueModel, 'id' | 'builtIn'>): string | null {
  if (model.builtIn) return null;
  const [prefix, rest = ''] = model.id.split('/');
  if (prefix === 'google') return rest.startsWith('gemma') ? 'gemma' : 'gemini';
  return BY_PREFIX[prefix] || null;
}

/**
 * The inline SVG for a model, with its fixed 1em sizing and inline style removed so the page's CSS
 * sizes it, and made decorative: the model's name is printed beside it, so a screen reader hearing
 * the vendor's <title> as well would hear every name twice.
 */
export function logoSvg(file: string | null): string | null {
  if (!file) return null;
  const raw = svg(file);
  if (!raw) return null;
  return raw
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/ (?:height|width)="1em"/g, '')
    .replace(/ style="[^"]*"/, '')
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
}
