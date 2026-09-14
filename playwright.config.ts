import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests for the marketing site.
 *
 * These run against the BUILT output via `astro preview`, not the dev server,
 * so what CI checks is what ships. Nothing here talks to the worker, Supabase
 * or a model provider: the suite is free to run and cannot flake on a backend.
 */
/**
 * The preview port, in ONE place so every process agrees on it.
 *
 * It must be the same in the main runner and in every worker, because each worker re-loads this
 * config in its own process. A port derived from `process.pid` was tried and is wrong for exactly
 * that reason: the workers computed different ports from the runner and every navigation came back
 * ERR_CONNECTION_REFUSED — 60 failures that looked like a broken site.
 *
 * `E2E_PORT` overrides it, which is the supported way to run two suites at once.
 */
const PORT = Number(process.env.E2E_PORT ?? 4322);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm --filter @golem/site exec astro preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
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
    /**
     * TERMINATE THE SERVER, don't assume it dies with us.
     *
     * `astro preview` is a grandchild: playwright spawns pnpm, pnpm spawns astro. When the runner
     * is killed rather than exiting — a CI timeout, a gate checker's own timeout, an interrupted
     * run — only the parent gets the signal and the preview server survives holding port 4322.
     *
     * With `reuseExistingServer: false` above, which is correct, every orphan makes the NEXT run
     * fail with "port already in use". Eight accumulated during one session of re-running G92, and
     * the gate became unrunnable twice in a row — a flake that looks exactly like a real failure
     * and trains whoever meets it to rerun until green.
     */
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
