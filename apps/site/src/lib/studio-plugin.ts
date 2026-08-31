/**
 * The Studio plugin's canonical URLs, for the Astro site.
 *
 * This file holds NO literal of its own. apps/site is an Astro package and does
 * not (and must not) depend on the worker, so it reaches the shared package by
 * relative path rather than through pnpm. That is deliberate: a mirrored copy of
 * the asset id would be free to drift, and this cannot — there is exactly one
 * definition, in packages/shared/src/index.ts, and this is a re-export of it.
 *
 * Frontmatter only. Astro evaluates this at build time; nothing here reaches the
 * browser, so the landing route still ships zero JavaScript.
 */
export {
  STUDIO_PLUGIN_ASSET_ID,
  STUDIO_PLUGIN_URL,
  STUDIO_PLUGIN_STORE_LIVE,
  STUDIO_PLUGIN_INSTALL_HREF,
} from '../../../../packages/shared/src/index';
