# OPEN — the web app entry bundle is 2.6x its budget, and I did not raise the budget

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
