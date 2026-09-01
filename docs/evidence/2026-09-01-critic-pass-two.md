# Two critics on this session's product work, and what they found

**Date:** 2026-09-01 · **Mission §11 gate: "no unresolved release-blocking critic
finding".** Two adversarial passes over the commits made on
`feature/golem-product-experience` today, run with different briefs — correctness, and
whether the product tells the user only what it has established.

Between them they found **nine real defects**, two of them severe. Every one is fixed
below; none is argued away.

## The two that mattered

### 1. The credits feature 500s in production, so none of it renders

`projectAssets` LEFT JOINs `asset_library`. That table has never been created — which
this same session had proved and written up in `BLOCKERS.md` §4b — so D1 raised
`no such table` on every read, Hono returned 500, and the panel rendered
`connectionFailed`. The careful `nothing_recorded` and `unaccounted` verdicts could
never appear at all.

The missing-table case had been handled in `search_asset_library` earlier the same day
and simply not carried to the read path. It now falls back to the same query with every
library column forced to null — which is precisely what a join matching nothing
produces, and the honest answer for a project whose library does not exist. Anything
that is **not** the missing-table case still throws, because reporting a timeout as
"nothing is accounted for" would turn a fault into a confident answer.

### 2. Every user with a placed asset was told their game cannot ship

`commercialUseReport` grades `missing_provenance` as a `blocker`, which is right for the
export gate it was written for: you cannot certify what you cannot account for. But with
no curated library **every** asset `insert_asset` places lands unaccounted, so the panel
rendered a red *"N assets cannot ship commercially — each of these has to be replaced or
cleared first"* while, two sections lower, saying *"Nothing here is a claim that they are
unusable."* Both on the same screen, in the normal case, and the loud one was the
unestablished one.

Golem never made that determination. It checked the asset was free, publicly visible,
script-free and from a trusted creator, and then did not know its licence.

`readiness()` now separates a finding **against** an asset from the **absence** of one.
Missing provenance produces an `unaccounted` verdict, in amber, reading *"N assets Golem
cannot account for … that is not a finding that they cannot be used — it is the absence
of one, so nothing here clears them either."* Red is reserved for a licence that was read
and found incompatible, and a real determination still outranks an unknown.

## The rest

3. **A phantom phase heading, caused by this session's own C-series split.** The reducer
   suppressed an announcement when `next.kind === s.kind` — the right test only while the
   web's vocabulary and the wire's phases were one-to-one. After C04/C06/C08 were split
   out, the wire still announced `building` before `set_properties` while the web called
   it `editing`, so an **empty** "Building world" heading appeared directly above
   "Editing project · Set properties", reinstating as its own row the exact claim the
   split was made to remove. Reproduced against the real reducer:

   ```
   before:  Inspecting project :: Read the project tree
            Building world     :: Building world        <- phantom
            Editing project    :: Set properties
            Inspecting project :: Inspecting project    <- phantom
            Reading scripts    :: Read a script
   after:   Inspecting project :: Read the project tree
            Editing project    :: Set properties
            Reading scripts    :: Read a script
   ```

   The suppression now compares the wire **phase** against `phaseForTool(nextTool)`,
   which is exact rather than approximate: the worker sets `agent.phase` from that
   function on the line before it broadcasts `tool_start`. **The commit message of
   `b2fb1f8` claimed the transcript read cleanly. It did not, and this corrects it.**

4. **`boundProjectId` was lost on Durable Object revival.** The agent loop is driven by
   `alarm()`, which never reads the binding, and the constructor restored `opQueue`,
   `seq`, `pluginLastSeen` and `playtestRun` but not `bind`. An instance evicted mid-run
   came back with no project id, `recordPlacedAsset` returned on its first line, and
   every remaining `insert_asset` recorded nothing — an empty ledger, which reads clean.
   The original bug, re-entering through the recovery path.

5. **A vacuous assertion, mutation-proven.** `assert.ok(refusalGuard < record)` passes
   when `indexOf` returns `-1`, so deleting the refusal guard from `insert_asset` left
   the test green. `assert.ok(refusalGuard > 0, …)` was missing.

6. **A comment claiming a property the code lacks.** `recordPlacedAsset`'s note said a
   lost write "degrades into a visible unaccounted". It does not: the report reads
   `project_asset_use`, so a row never written is not unaccounted, it is *absent*. The
   key-space argument covers a row that was written with a sentinel and cannot cover one
   that does not exist. The comment now says that, `recorded: false` and the reason go
   into the tool result so the loss is in the transcript, and the panel's footer says a
   clean result covers only what is listed.

7. **The library lookup was gated on session membership.** `if (fromLibrary)` meant an
   asset that *is* in the curated library, but whose id was pasted by the user or carried
   from an earlier session — both supported paths — was keyed unaccounted anyway. The
   ingest in §4b would have landed and the panel would have kept making claim 2. The
   query answers for any id and is now asked for any id; provenance is a property of the
   asset, not of how its number arrived.

8. **A tool description promising what its own code denies.** `search_asset_library` told
   the model every hit is "licence-cleared and **safe to insert**"; a comment 43 lines
   below says "the library says an id is LICENSED, not that it is safe". The description
   is what the model paraphrases to the user.

9. **`credits: string` contradicted its own JSDoc**, which explained that an older worker
   sends no such field. Any future `res.credits.trim()` would have type-checked and
   crashed the workspace exactly as one already had. Now optional, so the compiler
   enforces what `copyableCredits` enforced by convention.

Also corrected: `BLOCKERS.md`'s heading "This blocks the merge, and it is the only thing
that does", contradicted by its own body two lines later; "capability is proven" for a
gate that asks for two exercises *because one cannot demonstrate generality*; a code
comment claiming a refused clipboard "is reported" when nothing reports it; and a test
failure message that stated the inverse of the condition it guarded.

## What the critics found clean

The deleted `tool-meta.ts` table removed nothing reachable. `provenanceTablesReady` is
safe as isolate-scoped state. The `unaccounted:roblox:<id>` sentinel genuinely cannot
collide with a library id. The activity labels each describe what their tool does, and
C10/C12's not-modelled reasons hold. `copyableCredits` handles the case it claims to.

## Suite

`pnpm -r test`: web 249, worker 161, evals 1029, corpus 231, design 80, benchmark 4,
plugin 168 + 40 mutations. `pnpm -r typecheck`: 0 errors. Panel re-checked in the
browser: verdict "1 asset Golem cannot account for", amber, and the section below it now
agrees with the heading above it.
