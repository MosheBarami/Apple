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
  // THE SPACE BETWEEN A WORD AND THE INLINE TAG AFTER IT. Since Astro 7 the default is `compressHTML: 'jsx'`, which applies React's JSX whitespace
  // rules: a line break between the last word of a source line and an inline tag that starts the next one is REMOVED, so `with it?\n<a href>Build</a>`
  // was built as `with it?<a href>Build</a>` and a reader saw "with it?Build the plugin". Measured on the build before this was set: 61 such joins on
  // 13 pages (the docs, /privacy and /terms), and a new one in the first page written after the count ("Credits.<a href>The details</a>"). The cause
  // is this one setting, not 61 sites. `true` compresses losslessly (it keeps the space a reader sees), so it is set once. The cost is under 300 bytes
  // of gzip on the front page, inside the landing budget. tests/rendered-text-joins.test.mjs holds every built page to zero and goes red if this
  // line is removed (the default comes back).
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
});
