/**
 * THE MODEL LIST THE PUBLIC SITE SHOWS, READ FROM THE MODEL REGISTRY (owner decision D-VISION-1).
 *
 * Nothing in this file names a model. /models and the landing read MODEL_REGISTRY in
 * @golem/shared — the same list the worker admits, the picker offers and GET /api/models returns —
 * so the site cannot show a model the product does not run, or leave out one it does. Which plan
 * includes a model is asked of `lockedReason`, the words the picker and the worker's refusal use.
 *
 * Models on a customer's own key are gone with BYOK (D-VISION-1): every model here runs inside
 * Apple and uses Apple Credits.
 *
 * Build-time only (Astro frontmatter). Nothing here reaches the browser.
 */
import { MODEL_REGISTRY, lockedReason, type RegistryModel } from '@golem/shared';

/** Apple's own lanes, in registry order. */
export const builtInModels = (): RegistryModel[] => MODEL_REGISTRY.filter((m) => m.vendor === 'Apple');

/** The models from other makers, in registry order. */
export const otherModels = (): RegistryModel[] => MODEL_REGISTRY.filter((m) => m.vendor !== 'Apple');

/** Which plans include a model, in the picker's own words. */
export const plansLine = (m: Pick<RegistryModel, 'id'>): string => lockedReason(m.id) || 'Included with every plan, Free too';

/** The "×N credits" badge, or null for a model that costs what Apple MAX costs. */
export const creditBadge = (m: Pick<RegistryModel, 'creditMultiplier'>): string | null =>
  m.creditMultiplier > 1 ? `×${m.creditMultiplier} credits` : null;

/*
 * VENDOR ICONS. Each file under ../assets/model-logos is a byte-identical copy of one icon from
 * @lobehub/icons-static-svg (MIT), recorded with its source URL and sha256 in the NOTICE beside
 * it. The map is keyed on the registry's vendor. A vendor with no icon in that collection gets its
 * initial in a plain disc rather than a drawn guess at a logo.
 */
const svgs = import.meta.glob('../assets/model-logos/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const svg = (file: string): string | null => svgs[`../assets/model-logos/${file}.svg`] ?? null;

const BY_VENDOR: Readonly<Record<string, string>> = {
  Google: 'gemini',
  OpenAI: 'openai',
};

/** The icon file a model is drawn with, or null: Apple's own lanes are drawn with Apple's mark. */
export function logoFileFor(model: Pick<RegistryModel, 'vendor'>): string | null {
  return BY_VENDOR[model.vendor] ?? null;
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
