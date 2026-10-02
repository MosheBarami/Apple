# Dependabot triage — 27 open findings

Triaged 2026-08-31 against `main`. **7 high, 15 medium, 5 low.**

The headline result is an inversion: **none of the seven high findings can reach
production Golem, and the one finding that genuinely could was rated medium.**
That one is fixed; the highs are deferred with reasons.

## What actually runs in production

Establishing this first, because every exposure verdict below depends on it:

- **The Cloudflare Worker** (`apps/worker`) is the only thing executing in
  production. `grep` for imports of `astro`, `vite` or `sharp` across
  `apps/worker/src` returns **nothing**.
- **The marketing site is `output: 'static'`** (`apps/site/astro.config`), built
  to HTML and served from D1 by the worker. There is **no Astro server at
  runtime**.
- **`apps/web` is a Vite build**; production serves prebuilt assets. No Vite dev
  server runs in production.

So astro, vite, esbuild and sharp are **build-time tooling**. That is not a
dismissal — a compromised build tool is a supply-chain problem — but it is a
different exposure from a live request path, and it changes what is urgent.

## The seven high findings — four distinct advisories

| advisory | package | vulnerable | fixed in | reachable in production? |
|---|---|---|---|---|
| libvips CVEs | `sharp` < 0.35.0 | 0.34.5 (transitive via astro) | 0.35.0 | **No** — build-time image optimisation only |
| Host header SSRF in prerendered error page fetch | `astro` < 6.4.6 | 5.18.2 | 6.4.6 | **No** — requires a running Astro server; output is static |
| Reflected XSS via unescaped slot name | `astro` < 6.3.3 | 5.18.2 | 6.3.3 | **No** — slot names in our `.astro` files are static literals, never user input |
| `server.fs.deny` bypass on Windows alternate paths | `vite` <= 6.4.2 | 5.x | 6.4.3 | **No** — dev server only, and Windows-specific; this project develops on darwin |

The 7 alerts are these 4 advisories counted once per manifest.

**Every fix is a major version upgrade** — astro 5 → 6 (and 7 for the mediums),
vite 5 → 6. There is no patched 5.x for either. So "upgrade the highs" is not a
patch bump; it is a framework migration of the marketing site and a bundler
major for the web app, with no production exposure being closed by it.

Deferred, deliberately, per the instruction not to mass-upgrade or derail the
mission for low-risk noise. They should be scheduled as their own piece of work
with the site build re-verified, not folded into a product phase.

## The one that mattered — and it was rated medium

`react-router` >= 6.0.0 < 7.18.0 — **open redirect via backslash in `<Link>` and
`useNavigate`**. Resolved version: **6.30.6**, vulnerable.

Unlike everything above, react-router runs **in the shipped browser app**. And
the sink is reachable:

```tsx
// app.tsx — the catch-all is INSIDE the guard, so EVERY path reaches it
<Route element={<AuthGuard><AppLayout /></AuthGuard>}>
  …
  <Route path="*" element={<NotFoundPage />} />
</Route>

// lib/auth.tsx:75
<Navigate to="/login" replace state={{ from: location.pathname }} />

// routes/auth-pages.tsx — post-login
navigate(from, { replace: true });
```

A link to `https://app.golem/\evil.com` matches `*`, hits `AuthGuard`, is stored
as `from`, and on a vulnerable router `navigate('/\evil.com')` resolves
protocol-relative and leaves the origin — **at the exact moment the user has just
authenticated**, which is when they are most inclined to trust the screen.

**Fixed at the sink, not by upgrading.** `apps/web/src/lib/safe-redirect.ts`
folds backslashes, then requires a rooted same-origin path — rejecting `//host`,
`/\host`, any scheme, and control characters. Four regression tests cover the
hostile spellings, prove every real protected route still round-trips, and assert
the sink still calls it so a refactor cannot silently reopen it.

Chosen over react-router 6 → 7 because the guard holds regardless of router
version and costs nothing. **Keep it after any future upgrade.**

## Everything else — deferred

- **`astro` (4 more: 1 low, 3 medium)** — XSS via spread attribute names,
  `transition:*` directive values, View Transition animation properties,
  `define:vars` script sanitisation. All need a running Astro renderer or
  attacker-controlled component input; the site is static with no user input.
  Fixes are astro 7.x, a two-major migration.
- **`vite` medium** (path traversal in optimized-deps `.map`) and **`launch-editor`
  NTLMv2 disclosure** — dev server, Windows.
- **`esbuild` (2 low/medium)** — dev server request forgery and arbitrary file
  read, both dev-server-on-Windows.
- **`react-router` second advisory** — arbitrary constructor injection via
  `deserializeErrors()` **in React Router SSR**. This app is client-side only and
  runs no React Router SSR, so the code path does not exist here.

## Verification added

`apps/web/tests/safe-redirect.test.mjs` — 4 tests, in the existing node:test
idiom, no network. The last one reads `auth-pages.tsx` and fails if the raw
unvalidated read returns, so the fix cannot regress quietly.

## Not done, and why

No dependency was upgraded. Every available fix for a high finding is a major
version bump that closes no production exposure, and blind mass-upgrading was
explicitly out of scope. The recommendation is a separate, scheduled dependency
sprint — astro 5 → 7, vite 5 → 6, react-router 6 → 7 — each with its build and
route surface re-verified.
