# Sentry (error monitoring)

Replaces `docs/MONITORING.md`. Until monitoring existed, a production failure was invisible unless somebody was
watching `wrangler tail`; the request log in `apps/worker/src/analytics.ts` records that an error happened and
drains it to AdminDO, where a person has to go and look.

Two reporters exist. Both are **no-ops when their DSN is unset**, which is a supported state.

| | Where | Reports | DSN comes from |
|---|---|---|---|
| Worker | `apps/worker/src/sentry.ts` | unhandled exceptions, 5xx responses that never threw, cron failures | `env.SENTRY_DSN` |
| Browser | `apps/web/src/lib/sentry.ts` | `window.onerror`, unhandled rejections, React boundary crashes | `import.meta.env.VITE_SENTRY_DSN` |

No Sentry config file is committed and no DSN is in the repo.

## State on 2026-10-02 (read-only sweep)

`SENTRY_DSN` is set as a secret on both Cloudflare workers (`apple` and the legacy `golem`). The 2026-09-21
version of the old doc said the Sentry organisation `moshe-s6` had zero projects; that is no longer true of the
worker. `docs/GO-LIVE.md` records the browser half as closed on 2026-09-20 (`VITE_SENTRY_DSN` in the ignored
`apps/web/.env.local`); whether the current web bundle carries it was not re-checked.

## Setting it up

1. In the Sentry org create two projects: **Cloudflare Workers** (API) and **Browser JavaScript** (SPA). Two, not
   one: different release schemes (git sha vs bundle build) and different noise.
2. Copy each project's DSN (Settings, Projects, Client Keys).
3. Set the names (values never go in git; `.env`, `.env.*` and `.dev.vars` are git-ignored):

   ```sh
   cd apps/worker && npx wrangler secret put SENTRY_DSN      # production
   echo 'SENTRY_DSN=...'      >> apps/worker/.dev.vars        # local worker
   echo 'VITE_SENTRY_DSN=...' >> apps/web/.env.local          # read by Vite at BUILD time
   ```

4. Deploy and hit a route that 500s; the issue should appear within seconds carrying `release` equal to the
   deployed `BUILD_SHA`.

A DSN is a public key (the browser bundle ships it), but deployment-specific config still does not belong in git.
A set-but-unusable DSN is reported as `bad_dsn`, deliberately different from `no_dsn`.

## What is sent, and what cannot be

The event is built from a closed allowlist and every string is then scrubbed.

- **Sent:** error type, message (capped at 1000 characters), stack, the labelled route (`/api/projects/:id/ws`,
  never the raw path), HTTP method, status, build sha, environment.
- **Unreachable by the reporting code:** request bodies (the customer's prompts), `Authorization` and the Supabase
  JWT, cookies, query strings, fragments, transcripts, account ids, emails.
- **Deliberately off:** breadcrumbs, session replay, automatic fetch instrumentation, user context.
- `@sentry/cloudflare`'s `withSentry()` is not used: its data-collection defaults are permissive and it wraps the
  exported handler, which this worker cannot do. The modules write Sentry's documented HTTP envelope directly.

**Not guaranteed:** prose. The scrubber (`apps/worker/src/redaction.ts`; a documented subset in the web module,
kept in step by `apps/web/tests/sentry-wiring.test.mjs`) removes credentials and addresses, but cannot catch a
user's prompt interpolated into an error message. Do not put user content in error messages.

## Tests

| File | Holds |
|---|---|
| `apps/worker/tests/sentry.test.mjs` | DSN parsing, the no-DSN no-op, scrubbing, the envelope, the capture shapes |
| `apps/worker/tests/sentry-live.test.mjs` | the wiring through the real Hono chain: response byte-identical with and without a DSN; JWT, prompt, query token and project id absent from the envelope |
| `apps/web/tests/sentry.test.mjs` | the browser module (handlers never call `preventDefault()`) |
| `apps/web/tests/sentry-wiring.test.mjs` | `main.tsx` and the crash card call it; the two scrubbers have not drifted |
