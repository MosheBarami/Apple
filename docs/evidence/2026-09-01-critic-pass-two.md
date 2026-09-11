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

---

# The confirmation pass

A third agent was asked to verify the nine fixes above rather than trust them, running
the real code where it could: `projectAssets` against SQLite with `asset_library` absent,
`readiness()` over an eight-case matrix, and `reduceActivity` over seven adversarial
sequences.

**Four confirmed correct**: the missing-table fallback (all 21 columns come back under
the names `JoinRow` reads, and non-missing-table errors still throw); `boundProjectId`
(the key and shape match what `/init` writes, and the restore sits inside the
`blockConcurrencyWhile` that blocks `alarm()`); the `unaccounted` verdict (the panel's
filter and the model's are the identical predicate, and `commercialUse.ok` has no reader
that could contradict it); and `scrubEngineIdentity` being in scope with no §15.2 leak.

**Four more defects, one of them introduced by the fix itself:**

1. **The new inner catch did the exact thing the sibling fix forbade, and did it
   durably.** Wrapping the `asset_library` lookup in a bare `catch { key = null }` meant
   a transient D1 error fell through and wrote a **permanent** `unaccounted:` row for an
   asset that *is* in the library. The row outlives the blip, and because the usage
   table's primary key is `(project_id, asset_id)`, a later correct placement writes a
   **second** row under the real library id — listing one physical asset twice, once
   unaccounted and once credited. The read path fails loudly; the write path was
   guessing. It now re-throws anything that is not the missing table, guarded by a test.

2. **`phaseForTool`'s default made the suppression eat real announcements.** It answers
   `'building'` for any unrecognised name — its own JSDoc calls that "for a name this
   build has never heard of" and "NOT a resting place". So a browser one version behind a
   worker silently dropped "Building world" whenever the default coincided. The
   comparison now requires the tool to be one this build knows.

3. **The suppression justified itself by proximity and only ever checked adjacency.**
   `session.ts:870` re-broadcasts the *sticky previous* phase at the top of every step,
   before the model call, while the derived phase is set only when a tool starts. So the
   announcement being deleted was frequently not the one derived from the following tool
   — and deleting it deleted measured model thinking time. Verified: an announcement 45
   seconds before its tool was silently removed, taking 44,800ms of wall time with it. A
   one-second window now separates the two cases, and it is labelled in the code as the
   judgement it is.

4. **A vacuous assertion in the regression test I had just written** — the same class as
   defect 5 of the first pass. `assert.ok(p.steps.length > 0, '… is an empty heading')`
   can never fire, because every `ActivityPhase` is constructed with one step already in
   it, so a zero-step phase is unrepresentable. Only the `deepEqual` above it did any
   work. The phantom's real signature is a phase whose step is the **announcement**, so
   the test now asserts every step carries a `toolId`.

Also: `attribution: { recorded: false }` was emitted even when there was no project bound
at all, conflating "nothing to attribute to" with "the write failed"; and a numbering slip
in `BLOCKERS.md` §4b.

## The three cases, run against the real reducer after the fixes

```
A. sticky announcement 45s before its tool
   Building world  :: [announcement] Building world   (45000ms wall)
   Editing project :: Set properties                  (100ms wall)

B. unknown tool from a newer worker
   Building world  :: [announcement] Building world | some tool from a newer worker

C. the derived announcement, immediately before its tool
   Editing project :: Set properties                  (97ms wall)
```

A keeps the thinking time, B keeps the announcement, C still suppresses the duplicate.

## Suite

`pnpm -r test`: web 260, worker 162, evals 1029, corpus 231, design 80, benchmark 4,
plugin 168 + 40 mutations. `pnpm -r typecheck`: 0 errors.

**Thirteen real defects across three passes, four of them in fixes for earlier ones.**
That ratio is the argument for the third pass having been worth running.
