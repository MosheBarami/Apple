# Handoff: put the landing's anchor to /showcase back

Written 2026-09-21 by the site lane, after commit `92c9221` shipped the model-built screen band
(`apps/site/src/components/BuiltScreen.astro`) to the landing.

## What is missing

The band names the gallery and prints its counts, but it does not LINK to it. A visitor on the
landing can read `/showcase` and must type it. That is the one thing this band is still short of.

## Why it came out rather than being fixed

`apps/site/tests/links-resolve.test.mjs` fails the built landing with:

```
a link to a route nothing serves:
  / -> /showcase
```

`/showcase` is real and live — an object in the worker's D1 static store, published by
`infra/deploy-showcase.mjs`, not a page under `apps/site/src/pages` — so `fileFor()` cannot see it.

A peer lane's WORKING COPY of that test already fixes this properly and was uncommitted when this
was written. Their version adds:

- `const WORKER_SERVED = new Map([['/showcase', 'infra/deploy-showcase.mjs']]);` above
  `const built = …` (around line 58 of the committed file),
- `if (WORKER_SERVED.has(href.replace(/\/$/, '') || '/')) continue;` inside
  `every internal link resolves to a page that exists`, after the asset-extension skip
  (around line 94),
- a test `the exempt routes are published by something in this repository`, which reads the named
  publisher and fails if it does not mention the route — so the exemption has to be earned,
- a test `the navigation reaches the showcase from every page`, which excludes `index.html`.

Editing a file another lane is holding open in this shared checkout is how one lane's commit
swallows another's, so nothing in that file was touched. `scripts/check-site-links.mjs` already
carries the equivalent exemption with its reason, in a file this lane owns.

## Exactly what to put back, once that exemption is committed

In `apps/site/src/components/BuiltScreen.astro`, in the `.built-more` paragraph, replace:

```astro
      <a href={BUILT_SCREEN.capture.src}>This render at full size &rarr;</a>
```

with:

```astro
      <a href={BUILT_SCREEN.gallery}>
        All {BUILT_SCREEN.galleryScreens.value} {BUILT_SCREEN.galleryScreens.label} and {BUILT_SCREEN.galleryMaps.value} {BUILT_SCREEN.galleryMaps.label}, with the failures at the same size &rarr;
      </a>
```

and delete the `.built-rest` paragraph below it together with the `{/* THE DOOR POINTS AT THE
RENDER … */}` comment that explains why it is there. Keep `.built-rest` and `.built-route` out of
the `<style>` block when the paragraph goes.

`BUILT_SCREEN.gallery`, `galleryScreens` and `galleryMaps` are already declared in
`apps/site/src/data/showcase-proof.ts` and both counts are already resolved against their manifests
by `apps/site/tests/built-screen-is-evidence.test.mjs`, so nothing else has to move.

## How to know it is done

From `apps/site`, against a tree built from the COMMITTED state, not the working tree:

```
npx astro build && node --test tests/links-resolve.test.mjs tests/built-screen-is-evidence.test.mjs
node ../../scripts/check-site-links.mjs        # expects: served elsewhere: /app, /showcase
```

and then deploy the landing, because a link nobody can click is the same as no link:

```
node infra/deploy-static.mjs --file apps/site/dist/index.html /index.html
curl -s https://apple.moshe-barami111.workers.dev/ | grep -c 'href="/showcase"'
```
