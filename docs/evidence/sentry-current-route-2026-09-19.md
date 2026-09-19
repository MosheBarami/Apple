# Sentry current SPA route attribution — 2026-09-19

Scope: `apps/web/src/lib/sentry.ts` and its focused Sentry tests only. This evidence records source behavior; no build, deploy, browser session, account action, inference, plugin replacement, or Roblox/Lumen execution was performed.

## Defect reproduced

`installSentry()` builds its dependencies once. With the previous browser dependency shape:

```ts
location: typeof window === 'undefined' ? null : { origin: window.location.origin, pathname: window.location.pathname },
```

`origin` and `pathname` were copied at install time. A client-side SPA navigation after installation therefore left later error reports attributed to the earlier route.

Focused regression: `the browser dependency reads the current SPA route when the error is captured` in `apps/web/tests/sentry.test.mjs`. The test uses the actual `installSentry` browser dependency path: it installs with a mocked global `window`, does not override `location`, mutates `window.location.pathname` after install, captures an exception, and reads the serialised Sentry event.

Red-first command with the source temporarily restored to the old plain location snapshot:

```text
node --test --test-name-pattern='the browser dependency reads the current SPA route when the error is captured' apps/web/tests/sentry.test.mjs
```

Observed result: exit 1, 0 passed / 1 failed. The assertion showed the stale route directly:

```text
actual:   '/projects/:id/files'
expected: '/settings/security'
AssertionError: the report kept the route from install time
```

## Narrow source fix

`browserDeps.location` now retains the existing `SentryDeps` contract while exposing `origin` and `pathname` as getters:

```ts
location: typeof window === 'undefined'
  ? null
  : {
      get origin() { return window.location.origin; },
      get pathname() { return window.location.pathname; },
    },
```

`capture()` still reads only those two scalars, labels the pathname with `routeLabel`, and constructs `request.url` from the origin plus labelled route. No query string, hash, headers, auth/session state, request body, transcript, prompt, or user field was added to the event surface.

## Green verification

Relevant Sentry tests:

```text
node --test apps/web/tests/sentry.test.mjs apps/web/tests/sentry-wiring.test.mjs
```

Observed result: exit 0, 21 tests passed / 0 failed. This includes the new current-route regression and the existing structural privacy checks for query/hash and event/request fields.

Web TypeScript check:

```text
pnpm --filter @golem/web typecheck
```

Observed result: exit 0 (`tsc --noEmit`).

## Source/test fingerprints

SHA-256 after green verification:

```text
f6814798978addeea4539a1adacb928d284975ceab73baa44f7a19f535ac2afe  apps/web/src/lib/sentry.ts
71f6a5d8e931d6fa8931e2c8c45e4bea6781a763390f6ba70aa5279f5741e8af  apps/web/tests/sentry.test.mjs
```

The shared checkout already contained the getter source hunk and regression test when this worker picked up the failed prior monitoring lane. This worker verified the exact diff, performed the required red-first falsification against the old snapshot, restored the getter implementation, and recorded the focused green checks above.
