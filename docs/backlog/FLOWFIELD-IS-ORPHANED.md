# `FlowField.astro` held all of CI red and is imported by nobody — 2026-09-21

`pnpm -r typecheck` is the first step of the first CI job, so every other job was skipped and the
whole run was red. 26 of its 37 errors were in `apps/site/src/components/FlowField.astro`. They are
fixed (control-flow narrowing is not carried into a hoisted `function` declaration; the guard is
widened once and the two values re-bound with non-nullable declared types).

**Then I went to check whether the fix changed anything a person can see, and it does not, because
the component ships nothing at all.**

```
grep -rn "FlowField" apps/site/src/            # only landing.css comments and Horizon.astro's
find apps/site/dist -name '*.js'               # nothing
grep -c 'class="flow"' apps/site/dist/index.html   # 0
```

`apps/site/src/styles/landing.css:1784` records why: *"components/Horizon.astro replaced
FlowField.astro in the hero on 2026-09-20 and brought its own `<style>` with it, which is the
pattern to follow"*. `Horizon.astro:182` names FlowField's error count in a comment, so whoever
wrote the replacement had the count in front of them and fixed their own file.

So the state is: a dead component, still under `src/`, still typechecked by `astro check`, still
able to stop the entire pipeline — and now carrying a ~1 kB block in `landing.css` that
`landing.css:1792` says should leave with it.

## What I did and did not do

**Did:** fixed the 26 errors, because a dead file that blocks CI is a live problem.

**Did not:** delete it. `landing.css:1784-1792` reads as a deliberate parking rather than an
oversight — the author left the stylesheet block "for whoever remounts it" — and choosing between
*remount* and *delete* is the landing owner's call, not an infra pass's at 04:00. The repository's
own vocabulary for this is a disposition: WIRE, DELETE, or STRUCTURALLY-BLOCKED, with a dated owner
statement. `scripts/check-deadends.mjs` enforces exactly that for modules in the import graph and
does not reach `.astro` components, which is why this one could sit here silently.

## The measurement that says my fix is invisible

Built the site with the fix, reverted only the annotated lines, rebuilt, and fingerprinted every
`.html`, `.css`, `.js` and `.xml` under `dist`. Identical both ways.

**The first version of that experiment was vacuous and I nearly cited it.** I fingerprinted
FlowField's own output — of which there is none — so "identical" meant "I compared nothing". The
result above is from the same experiment run on `src/data/consent-proof.ts` instead, whose output
IS in the fingerprinted set (`ConsentProbe` appears twice in `dist/index.html`). That one is a real
before/after with a real control, and it is what licenses the claim that nothing needed deploying.
