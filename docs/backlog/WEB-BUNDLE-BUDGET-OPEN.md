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
