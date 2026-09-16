# Error monitoring

Until this existed, a production failure was invisible unless somebody happened to be watching
`wrangler tail`. The request log in `apps/worker/src/analytics.ts` records *that* an error happened
and drains it to AdminDO, where a person has to go and look; nothing pushed and nothing paged.

Two reporters now exist. Both are **no-ops when their DSN is unset**, which is the default and a
supported state: with no DSN the product runs exactly as it does today, sends nothing, and crashes
at nothing.

| | where | reports | DSN comes from |
|---|---|---|---|
| Worker | `apps/worker/src/sentry.ts` | unhandled exceptions, 5xx responses that never threw, cron failures | `env.SENTRY_DSN` |
| Browser | `apps/web/src/lib/sentry.ts` | `window.onerror`, unhandled promise rejections, React boundary crashes | `import.meta.env.VITE_SENTRY_DSN` |

## What a human has to do

Nothing in this repository creates a Sentry project, and nothing here has a DSN in it. As of this
commit the Sentry account has **one organisation, `moshe-s6`, with zero projects**.

1. In <https://moshe-s6.sentry.io>, create two projects — platform **Cloudflare Workers** for the
   API and **Browser JavaScript** for the SPA. Two, not one: they have different release schemes
   (a git sha vs. a bundle build) and different noise profiles, and a single project makes the
   browser's noise bury the worker's signal.
2. Copy each project's DSN from *Settings → Projects → \<project\> → Client Keys (DSN)*.
3. Set them:

   ```sh
   # Worker, production
   cd apps/worker && npx wrangler secret put SENTRY_DSN

   # Worker, local dev — .dev.vars is untracked and stays untracked
   echo 'SENTRY_DSN=https://…@o0.ingest.us.sentry.io/0' >> apps/worker/.dev.vars

   # Browser — read at BUILD time by Vite, so it must be set wherever the bundle is built
   echo 'VITE_SENTRY_DSN=https://…@o0.ingest.us.sentry.io/0' >> apps/web/.env.local
   ```

   `.env`, `.env.*` and `.dev.vars` are git-ignored. Do not add a DSN to `wrangler.jsonc`.

4. Confirm it works. Set the worker DSN, then deploy and hit any route that 500s; the issue should
   appear within seconds carrying `release` equal to the deployed `BUILD_SHA`.

### Is the DSN a secret?

No — it carries a *public* key, and the browser half ships its DSN inside the JavaScript bundle
where anyone can read it. It grants only the ability to send that project events. It is still kept
out of the repository, because deployment-specific configuration does not belong in git and a DSN
committed here follows every fork of this tree forever. `wrangler secret put` is used for the
worker because it is the mechanism that already exists, not because the value needs encrypting.

### If the DSN is wrong

A DSN that is *set but unusable* is reported as `bad_dsn`, which is deliberately a different answer
from `no_dsn`. "This deployment has no monitoring, as configured" and "somebody configured
monitoring and it is silently not running" need different reactions, and a single `false` would
collapse them.

## What is sent, and what cannot be

The event is assembled from a **closed allowlist** and then every string in it is passed through a
scrubber. The allowlist is the real guarantee; the scrubber is defence in depth.

**Sent:** the error type, its message, its stack, the *labelled* route (`/api/projects/:id/ws` —
never the path with the id in it), the HTTP method, the status, the build sha, and the environment.

**Not sent, and not reachable by the reporting code at all:** request bodies (which in this product
are the customer's prompts), the `Authorization` header and the Supabase JWT in it, cookies, query
strings, URL fragments, transcripts, account ids and email addresses. Neither `buildEvent` holds a
reference to a `Request`, a session or `localStorage`, so there is no argument through which any of
it could arrive — a field would have to be added to the event type, which is a diff a reviewer sees.

**Deliberately not enabled:** breadcrumbs, session replay, automatic fetch instrumentation and user
context. Every one of those works by recording what the user did and what the app sent.

This is also why `@sentry/cloudflare`'s `withSentry()` is not used: its `dataCollection` defaults
are permissive — user info, cookies, HTTP bodies and genAI prompts all go by default unless each is
turned off by name — and it wraps the exported handler, which this worker cannot do (`index.ts`
exports `Object.assign(app, { scheduled })` and a dozen route suites drive that object directly).
Sentry's ingestion contract is a documented HTTP envelope, and that is what these modules write.

### The one thing that is *not* guaranteed

A credential or an address that ends up inside an error *message* is removed by the scrubber
(`apps/worker/src/redaction.ts` for the worker, a documented subset in `apps/web/src/lib/sentry.ts`
for the browser, kept in step by `apps/web/tests/sentry-wiring.test.mjs`). **Prose is not.** If
future code interpolates a user's prompt into an error message — `throw new Error(\`model refused:
${prompt}\`)` — no pattern will catch it. Messages are capped at 1000 characters to bound that, and
the cap is a bound, not a fix. Do not put user content in error messages.

## Where the tests are

| file | holds |
|---|---|
| `apps/worker/tests/sentry.test.mjs` | the module: DSN parsing, the no-DSN no-op, scrubbing, the envelope, all three capture shapes |
| `apps/worker/tests/sentry-live.test.mjs` | the wiring, through the real Hono chain: the response is byte-identical with and without a DSN, and a real request's JWT, prompt, query token and project id are all absent from the envelope |
| `apps/web/tests/sentry.test.mjs` | the browser module, including that the handlers never call `preventDefault()` |
| `apps/web/tests/sentry-wiring.test.mjs` | that `main.tsx` and the crash card actually call it, and that the two scrubbers have not drifted apart |
