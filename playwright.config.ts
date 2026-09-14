import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests for the marketing site.
 *
 * These run against the BUILT output via `astro preview`, not the dev server,
 * so what CI checks is what ships. Nothing here talks to the worker, Supabase
 * or a model provider: the suite is free to run and cannot flake on a backend.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm --filter @golem/site exec astro preview --port 4322',
    url: 'http://localhost:4322',
    /**
     * NEVER REUSE. This was `!process.env.CI`, which meant that outside CI Playwright attached to
     * whatever already held port 4322 instead of serving THIS tree's build — so the suite, and G92
     * with it, could report green over a page that is not the page in the repository.
     *
     * Measured rather than reasoned about: with a deliberate `<script>` committed to
     * apps/site/src/pages/index.astro and `astro build` run, the break was present in
     * apps/site/dist/index.html and absent from what localhost:4322 returned. G92 passed anyway,
     * and `gate-check --falsify` reported the gate could not be falsified — the tell that it was
     * measuring something else entirely.
     *
     * The cost of false is a loud "port already in use" when a dev server is running. That is the
     * right trade: a gate that fails when it cannot see the tree is doing its job, and one that
     * passes over a stale server is worth nothing at all.
     */
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
