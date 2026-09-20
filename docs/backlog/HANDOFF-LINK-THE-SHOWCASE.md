# Handoff: link /showcase from the site

**Written by the assets-ui lane, 2026-09-21. Two lines of work, both blocked on a file another lane
is holding open — not on a decision.**

## What is already done

`https://apple.moshe-barami111.workers.dev/showcase` is **live and verified**: sixteen Roblox screens
and six playable maps the deployed model built from the product's own library, with the failures
shown at the same size as the successes, and a closing section — in English and Hebrew — stating
what the library is and what it will never be.

Re-publish it any time with:

```sh
set -a && . ./.env && set +a
node infra/deploy-showcase.mjs          # 22 images + 1 page, every URL fetched back and sha-compared
```

It touches nothing but `/showcase*` keys. It is safe to run from a dirty tree, which is why it
exists instead of `node infra/deploy-static.mjs`.

## What is NOT done, and why

**Nothing on the marketing site links to it.** The owner has to be told the URL by hand, which for a
fifteen-year-old who does not read git is most of the way back to "the gallery is on one laptop".

I did not add the link because `apps/site` is not mine to touch right now. Measured at 2026-09-21
with `git status --porcelain apps/site`:

```
 M apps/site/src/layouts/Base.astro
 M apps/site/src/layouts/Landing.astro
 M apps/site/src/pages/docs/modes.astro
 M apps/site/src/pages/index.astro
 M apps/site/tests/free-lane-steps.test.mjs
 M apps/site/tests/withdrawn-modes.test.mjs
?? apps/site/src/components/Cursor.astro
?? apps/site/tests/cursor-never-blinds.test.mjs
```

`Nav.astro` itself is clean, but that does not help: shipping a nav change means
`pnpm --filter site build && node infra/deploy-static.mjs --only site`, and that builds
`apps/site/dist` **from the working tree** — so it would publish another lane's half-finished
`Base.astro`, `Landing.astro` and `index.astro` along with it. A one-line link is not worth
deploying someone else's unfinished layout.

## The exact change, for whoever owns apps/site next

`apps/site/src/components/Nav.astro`, the `links` array at **lines 15–20**:

```ts
const links = [
  { href: '/#inside', label: 'Product' },
  { href: '/#models', label: 'Models' },
  { href: '/showcase', label: 'Showcase' },   // <- add this line
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
];
```

Three things to know before you do:

1. **`isCurrent` already handles it.** Line 22 does `path.startsWith(href)` for any href without a
   `#`, so `/showcase` gets `aria-current="page"` with no further change.

2. **`/showcase` is NOT an Astro route.** It is an object in the worker's D1 static store, uploaded
   by `infra/deploy-showcase.mjs`. Nothing in `apps/site` builds it and nothing in `apps/site`
   should try to; a link is all that is wanted. A checker that asserts every nav href resolves to a
   file under `apps/site/src/pages` will fail on it — that assertion would be wrong, and the fix is
   to let it accept a route served from the static store.

3. **Do not upload `/showcase` from `deploy-static.mjs`.** The images live under
   `/showcase/ui-showcase/…`, and the page's src attributes are rewritten to absolute paths at
   deploy time. Running the gallery builder without `--ui-prefix` produces relative paths that
   resolve to `/ui-showcase/…` from `/showcase` — a page of broken pictures that still reports
   success. `infra/deploy-showcase.mjs` is the only correct publisher.

## A second, smaller one

`apps/worker/src/assets.ts` now says an asset id must come from a Creator Store search **or be one
you supplied yourself** — the previous text offered "the curated library", deleted on 2026-09-20.
That is committed but **not deployed**, for the same reason: `apps/worker/src/do/session.ts` carries
89 uncommitted insertions belonging to another lane, and `wrangler deploy` builds from the working
tree. Until that lane ships, the live worker still names the deleted library in that refusal. It
will go out with their next deploy at no extra cost; nothing needs to be done for it.
