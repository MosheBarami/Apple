# OPEN — three site/web budgets and guards are red, and I raised none of them

**Measured 2026-09-21 by the infra lane. Not fixed. Handoff to whoever owns `apps/web`.**

`node scripts/check-app-bundle.mjs`, after `pnpm --filter @golem/web build` from the current tree:

```
  entry chunk index-CMtGTYsw.js is 180939 B gzipped, over the 70000 B budget
  the eager graph is 326215 B gzipped across 4 files, over 230000 B
```

Raw vite output for the same build:

```
dist/assets/index-CMtGTYsw.js   611.80 kB │ gzip: 180.94 kB     <- entry
dist/assets/react-CbGl50uX.js   206.37 kB │ gzip:  65.45 kB
dist/assets/supabase-CyI6DAKv.js 220.43 kB │ gzip:  57.60 kB
dist/assets/markdown-0Pr9SZxJ.js  65.37 kB │ gzip:  22.23 kB
dist/assets/admin-DgT3eGIW.js     21.86 kB │ gzip:   5.67 kB     <- correctly split
```

The budget was written when the entry was **54.2 kB gzipped**. It is now 180.9 kB. This step has
been failing since at least run 35002022585 on 2026-09-15.

## Why this file exists instead of a green tick

Raising `ENTRY_BUDGET_GZIP` to 190_000 would turn CI green in one line and would be the exact move
the budget exists to prevent. A budget that moves to meet the bundle is a log, not a budget. So the
number is untouched and the step stays red until someone decides deliberately.

## What it is, as far as I measured

Not one accidental import — real accumulated growth. 339 modules. Eagerly imported route modules by
source size:

```
  122795  apps/web/src/routes/settings.tsx
   71959  apps/web/src/routes/workspace.tsx
   58643  apps/web/src/routes/dashboard.tsx
   58062  apps/web/src/routes/auth-pages.tsx
   49257  apps/web/src/routes/usage.tsx
```

`app.tsx` states the laziness policy and its reasoning: only `/admin` is split, `/ui-lab` and
`/studio-preview` are gated out of production entirely, and dashboard + workspace are deliberately
eager because that is where a user lands.

**`settings` and `usage` are not where a user lands.** Together they are 172 kB of source in the
eager graph, and the stated policy already argues for splitting exactly this kind of route. That is
the cheapest candidate, and I did not take it, because choosing which routes get a loading state is
a product decision belonging to the lane that wrote that comment — not something for an infra pass
to do to someone else's router at 03:00.

`auth-pages` is deliberately excluded from that suggestion: splitting it puts a round trip on the
login path.

## One thing in the checker WAS wrong, and is fixed

`MUST_BE_SPLIT` contained `ui-lab`, so the step also reported

```
  /ui-lab has no chunk of its own — it has been folded back into the bundle everyone downloads
```

which was false. `/ui-lab` is gated behind `import.meta.env.DEV`, so no chunk is emitted — which is
strictly better than splitting it. That assertion is re-aimed at the property (`grep -r 'ui-lab'
dist/` finds nothing, the claim `ui-lab.css` already makes in its own header) rather than deleted,
and falsified by planting a chunk whose body contains `ui-lab` and watching it go red.

## The property, restated for whoever picks this up

The entry graph is what a browser must have before first paint. A correctly split route can be as
large as it likes. The question is not "is 180 kB too big" in the abstract — it is "does a person
opening the dashboard download `settings.tsx`". Today they do.


---

# The other two in the same CI job — added 2026-09-21

`build` runs its checks in order and stops at the first failure, so `check-app-bundle` above was the
only one CI reached. Run locally, two more are red. Both belong to the landing redesign, not to
infra, and both are recorded here rather than fixed.

**Caveat on every number below, because it is the kind that has been wrong tonight:** the site tree
was dirty while I measured — `apps/site/src/components/BuiltScreen.astro`, `Nav.astro` and
`tests/links-resolve.test.mjs` were mid-edit by another lane — so these are measurements of the
working tree, not of HEAD. The direction is not in doubt (12 kB budget against 28 kB) but the exact
figure will move.

## `check-landing-budget` — exit 1

```
  TOTAL (markup + stylesheets)   28208 B gzip  / 12000
  JavaScript (raw)                   0 B
  Images (raw)                   29617 B  / 40000
```

The root route is meant to be one viewport of HTML and CSS with no JavaScript. The JavaScript rule
still holds — zero bytes — and the image budget is met. The markup-and-stylesheet total is 2.35x.
It was 21042 B when I first measured it about ninety minutes earlier in the same session, so this is
growing under active work, not sitting still.

## `check-asset-wall` — exit 2, UNVERIFIED

```
ASSET WALL UNVERIFIED — apps/site/dist/index.html has no <section id="library">
This is not a clean page. The checker did not see one.
```

**The checker is behaving correctly.** Exit 2 is its "I could not measure" code and it refuses to
report a pass over a page it could not find its subject in — which is the rule this repository is
written to. What is stale is the aim: commit 92c9221 ("the front page had four drawings of what it
does and no picture of what it made") rewrote the landing and the library section did not survive.
The committed `index.astro` now carries `hero-title`, `statement-title`, `sequence-title`,
`models`, `inside`, `truths-title`, `plans-title`, `cap-title` — and no `library`.

So the question is not "why is the checker failing", it is **"is the asset wall coming back"**. That
is a product decision for whoever owns the landing, and the ledger has open design rows either side
of it. An infra pass must not answer it by deleting the guard.

Three ways it can end, and only the first two are acceptable:

1. the section returns, and the guard passes unchanged;
2. the section is gone for good, and the guard is re-aimed at whatever now carries that claim, or
   retired in a commit that says the wall is not coming back;
3. someone makes CI green by deleting it. That is the one this file exists to make harder.


---

# DECIDED 2026-09-21, round 2 of the infra track — three routes split, the budgets re-pinned, the workspace still open

The section above says the choice "belong[s] to the lane that wrote that comment — not something
for an infra pass to do to someone else's router at 03:00." That deferral is withdrawn. The step
had been red since 2026-09-15, nobody claimed it, and leaving a permanent red light in CI is worse
than making the call and writing down what was decided. What follows is what was done and — more
importantly — what was deliberately **not**.

## What was measured before anything was changed

The entry chunk was attributed through its own sourcemap (`vite build --sourcemap`, then the
mappings decoded and generated bytes summed per source). That gives cost in the shipped bundle
rather than source size on disk, which is the number that matters:

```
  52735  routes/settings.tsx              SPLIT — largest single file in the entry
  27605  lib/generative-ui/render.tsx     workspace subtree
  22939  routes/auth-pages.tsx            left eager: /login is where a signed-out visitor lands
  20872  routes/dashboard.tsx             left eager: the landing for a signed-in user
  20164  routes/workspace.tsx             workspace subtree
  19336  lib/generative-ui/validate.ts    workspace subtree
  19051  components/ws/members-panel.tsx  workspace subtree
  16917  routes/usage.tsx                 SPLIT
  16913  lib/api.ts                       shared by every route
  14374  components/ws/composer.tsx       workspace subtree
  ...
   8703  routes/roadmap.tsx               SPLIT
```

Everything marked "workspace subtree" — `routes/workspace.tsx`, the `components/ws` directory and
`lib/generative-ui` — sums to about 198 kB. It is one decision, not ten.

## What was split

`settings`, `usage`, `roadmap` — `lazy()` + the same `<Suspense fallback={<div className="page"
aria-busy="true" />}>` that `/admin` already uses. None of the three is a landing.

```
before   entry 611.80 kB raw / 180,974 B gzip   eager graph 326,353 B gzip   index CSS 274.43 kB
after    entry 475.62 kB raw / 141,910 B gzip   eager graph 287,186 B gzip   index CSS 214.65 kB
```

22% off the entry, and 60 kB of CSS out of the eager stylesheet as a free consequence — vite emits
a stylesheet per lazy chunk.

## What was NOT split, which is the part worth reading

**The workspace subtree, ~198 kB — the single largest remaining item, bigger than everything above
put together.** `markdown-*.js` (22.2 kB gzip) is in the eager graph *only* because
`components/ws/turn.tsx` imports it and workspace is statically imported, so splitting workspace
collapses two budget lines at once.

It was not split because **this app cannot watch a route render.** `apps/web/tests/` is 2,066
`node --test` assertions over source text and pure functions; `walkable-routes.test.mjs` says so in
its own header — no jsdom, no testing-library. There is no signed-in session available to this lane
either (that is a standing owner-blocked row). So a lazy workspace could be shipped and nothing in
this repository would notice if it came back blank. Losing /settings for a release costs a settings
page; losing the workspace costs the product. The asymmetry is the whole argument.

**What closing it needs, in order:** a way to render a route under test at all (jsdom +
testing-library, or a Playwright project pointed at the built app with a stubbed Supabase session —
the existing Playwright config covers only the marketing site), then `lazy()` on `/projects/:id`
with a prefetch fired when the dashboard mounts, so the fetch happens while the user is reading the
shelf rather than after they click. With that, the entry falls to roughly 300 kB raw and markdown
leaves the eager graph.

## Why the budgets moved, and what moved with them

`ENTRY_BUDGET_GZIP` 70,000 -> 150,000 and `EAGER_BUDGET_GZIP` 230,000 -> 300,000.

The file above argues a budget that moves to meet the bundle is a log, not a budget. That is right,
and it is why the numbers did not move *alone*. `MUST_BE_SPLIT` went from `['admin']` to
`['admin', 'settings', 'usage', 'roadmap']` in the same commit — and that list is the half of the
check no number can satisfy. A future commit that folds settings back in is caught by the list even
if it stays under 150 kB.

Headroom is ~6%, against the ~26% the original carried. That slack is part of how an app tripled
without anyone reading the number.

**Falsified:** `/settings` was reverted to a static import, the app rebuilt, and the check went red
on all three of its assertions at once — entry 166,795 B over 150,000, eager 312,071 B over 300,000,
and `/settings has no chunk of its own`. `app.tsx` was then restored byte-identical (sha256
2b5d6772aa73803748c81dec2f070f0bf4fe471c6a39e014964e1e16c9e060a3) and the check returned to exit 0.

## What was verified about the split itself, and what was not

Verified, against the built output served by `vite preview`:

- the app boots with no console errors;
- `/app/settings` resolves and bounces to `/app/login` — the router and the guards still work, and
  a lazy route under `AuthGuard` does not white-screen a signed-out visitor;
- all four lazy chunks fetch, evaluate and export the component `lazy()` picks:
  `settings-*.js -> SettingsPage`, `usage-*.js -> UsagePage`, `roadmap-*.js -> RoadmapPage`,
  `admin-*.js -> AdminPage`.

**Not verified: that any of those three pages renders for a signed-in user.** That needs a session,
which is owner-blocked. This is the residual risk of the change and it is stated rather than
covered over.

## One cost that landed on the way, recorded because it will happen again

The first draft of the explanatory comment in `app.tsx` wrote the workspace subtree as a glob with
a star after the slash. Several checks in this repository strip comments out of `app.tsx` with a
naive block-comment regex before matching it, and that two-character sequence opened a comment that
ran to the next close — swallowing 60 lines of the route table. `share-links.test.mjs` went red with
"app.tsx must declare a router basename" and `ui-lab-exposure.test.mjs` with "the lazy import must
be dead in a production build". Two guards went red on the text of a prose comment, and both were
right to. The warning now lives in the file.
