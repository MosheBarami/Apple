// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Must match the host the site is actually served from — the Worker serves the built site out of
  // D1 (see infra/deploy-static.mjs). This value is written into every canonical/OG URL and into
  // the sitemap, so a stale value points search engines at a domain that serves nothing.
  // Change it here when a custom domain is attached, then rebuild and redeploy.
  site: 'https://golem.moshe-barami111.workers.dev',
  output: 'static',
  integrations: [sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
});
