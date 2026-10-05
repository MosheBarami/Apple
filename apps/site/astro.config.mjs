// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Must match the host the site is actually served from. The Worker serves the built site out of D1 (see
  // infra/deploy-static.mjs). This value is written into every canonical and OG URL and into the sitemap, so a
  // stale value points search engines at a domain that serves nothing. It is the custom domain; keep it equal to
  // PRODUCT_ORIGIN in packages/shared/src/index.ts, then rebuild and redeploy. tests/hermetic-build.test.mjs holds it.
  site: 'https://studpilot.app',
  output: 'static',
  // THE REMOVED ROUTES. /models, /proof, /showcase and /changelog were pages of the old site (an engine table, a recorded
  // run, a gallery of model-built screens, a release log). The M2 rebuild shows no build result that did not really
  // happen, so they go. Each is a redirect rather than a 404: the build emits dist/<route>/index.html, and uploading the
  // site overwrites the old rows in the Worker's static store (infra/deploy-static.mjs). /showcase was published by
  // infra/deploy-showcase.mjs: that script must not be run again, because it would put the old gallery back over this redirect
  // (an open item in planning/proof/M2/DECISIONS.md section 12). tests/nav-and-routes.test.mjs holds the targets.
  redirects: {
    '/models': '/',
    '/proof': '/catalog',
    '/showcase': '/catalog',
    '/changelog': '/blog',
  },
  integrations: [sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
});
