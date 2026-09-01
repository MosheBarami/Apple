# Blockers

Mission §AG: when blocked by a human-only action, record the exact blocker and
continue every independent workstream. This file is that record. Each entry states
what is blocked, what proves it, and what continued anyway.

Last verified: **2026-09-01**.

---

## 1. AI Gateway has no credit — HUMAN-BLOCKED, and closed for this run

> **Owner ruling, 2026-09-01:** *"Do not buy credits. Do not ask again during this run. Classify
> real third-party model inference as HUMAN-BLOCKED. Continue all model-router architecture, mock
> testing, observability and non-paid work that does not require the credit. One blocked provider
> experiment does not block Phase IV."*
>
> So this is settled rather than pending. Nothing below is a request. The router's architecture,
> its mock-driven tests and its observability are all reachable without the credit and are not
> gated on this; only *real third-party inference* is. It will not be raised again this run.

**Status:** HUMAN-ONLY. Unchanged this session.

Every third-party model reachable through Cloudflare's Unified AI returns
`2021: Insufficient balance`. That error is itself the proof the architecture is
right: the request was recognised, routed and priced, so credentials and routing
are not the problem. The account simply holds zero prepaid AI Gateway credits.

Recorded in `docs/evidence/PHASE4-MODEL-ROUTING.md`.

**Why it stays blocked:** §AG forbids adding prepaid credits, enabling a new paid
service, or raising spend caps autonomously. §AC forbids buying capacity to make a
benchmark easier.

**Blocks:** DoD 14 (routing driven by measured results) and the measured half of
DoD 15.

**What continued anyway:** Workers AI models are free to this account and are what
production actually runs on. Routing, adapters and the mode system are all
exercised; only the *third-party comparison* is unbuyable.

---

## 2. Roblox Studio's MCP `screen_capture` stopped responding

**Status:** TOOLING DEGRADATION, worked around. Not a mission blocker.

`mcp__Roblox_Studio__screen_capture` timed out on every call this session — three
attempts, both with a manually-set camera and with the tool's own
`camera_position`/`look_at_position` arguments. `execute_luau` against the same
Studio instance stayed fully responsive throughout, so the connection is healthy
and the capture path specifically is not.

**Workaround, used for every image in this session:** drive the camera with
`execute_luau`, then capture the Studio window through the computer-use screenshot
tool and crop to the viewport rect. This produced every render behind the art and
UI findings, so no visual gate was left unmet by it.

**Cost of the workaround:** captures are screen-space rather than engine-space, so
they carry Studio chrome and depend on window geometry. Acceptable for review; not
suitable for an automated pixel-diff harness.

---

## 3. Two live account passwords are recoverable from git history — ROTATE THEM

**Status:** HUMAN-ONLY. Found by the independent security review, 2026-09-01.

| account | now supplied by | removed from source in |
|---|---|---|
| `e2e-test@golem.internal` | `GOLEM_E2E_PASSWORD` | `d8cfafa` |
| `load{i}@golem.internal` | `GOLEM_LOAD_PASSWORD` | `5b6896a` |

**The values are deliberately not written here.** They were, until 2026-09-01, in
this very table — which meant the document recording the leak was republishing it,
in a file tracked in the same repository whose history is the exposure. Worse, it
was invisible: `scripts/secret-scan.py` reports the working tree clean, because both
of its credential rules require a `password`/`secret` keyword followed by `=` or `:`
and then a QUOTED value, and a Markdown table cell has neither the assignment
operator nor the quotes. The register and the scanner disagreed and nothing said so.

Rotation does not need the old value. It needs the account, which is above.

### This blocks the merge, and it is the only gate the owner alone can clear

Master mission §5.1 is explicit: *"do not merge a release that still relies on known
live credentials exposed in repository history."* §11 lists "historical exposed live
credentials invalidated or release remains blocked" as a hard release gate. **It is
not met, so PR #1 stays Draft.**

It is not the only §11 gate outstanding, and saying so would be the overstatement
class this project keeps correcting in itself. Three are open as of 2026-09-01:

| §11 gate | state |
|---|---|
| historical exposed live credentials invalidated | **HUMAN-ONLY** — this entry |
| at least two fresh creation exercises demonstrate generality | **one done**, second quota-blocked until the daily Spark reset. The gate asks for two *because one cannot demonstrate generality* — so this is not "nearly met", it is half-evidenced |
| no unresolved release-blocking critic finding | **the final independent pass has not run** |

The difference matters for what happens next: the second and third clear themselves
with time and work inside this environment. This one cannot, at any amount of effort,
without the owner.

### What actually depends on these two accounts

Established 2026-09-01 by searching every workflow, script and source file. Recorded
because it scopes the exposure, and because the owner's decision about the merge gate
turns on it:

| consumer | uses them |
|---|---|
| `.github/workflows/ci.yml` | **no** — zero references in any workflow |
| the deployed worker, web app, site, plugin | **no** — no shipped code reads either variable |
| `infra/smoke.mjs`, `infra/pair-helper.mjs`, `infra/checkpoint-test.mjs`, `infra/store-validation.mjs` | yes — operator scripts run by hand |

So the exposure is two Supabase **test** accounts used by local operator tooling. It is
still a live-credential exposure and still has to be fixed: anyone reading this public
history can sign in as either account against the real project, and `load{i}@` is a
family of them.

What this does *not* settle is the merge gate, and this document does not settle it
either. §5.1's wording is "a release that still relies on known live credentials"; on
the narrow reading nothing in the release relies on them, and on the broad reading the
repository being merged is the one carrying the exposure. That is the owner's call to
make, not this environment's, and it is recorded here as a question rather than
answered in the direction that happens to unblock the work.

### Why this session did not rotate them

§5.1 permits rotation *"if authorized connected access allows rotation without
exposing new secrets"*. The access is technically there — the E2E account's current
password is in the local gitignored `.env`, and GoTrue lets a signed-in user change
their own password with `PUT /auth/v1/user`.

It was not done, deliberately. Rotating an authentication credential on the owner's
live identity provider is a security-settings change on an account this environment
does not own, where a half-completed attempt locks the account out and the only copy
of the new secret would be one untracked local file. That is the kind of action that
belongs to the person who owns the account, and §5.1 provides for exactly this case.
There is no Supabase `service_role` key or admin session available here, so the
dashboard route is human-only regardless.

### The minimal owner action

Two password changes in the Supabase dashboard for project `npqvyijsvzkuwddyhtpm`
(**Authentication → Users**):

1. `e2e-test@golem.internal` — set a new password, then put it in the repo-root
   `.env` as `GOLEM_E2E_PASSWORD=` (that file is gitignored and has never been
   committed — verified: `git log --all --full-history -- .env` is empty).
2. the `load{i}@golem.internal` load-test accounts — same, into `GOLEM_LOAD_PASSWORD=`.

Nothing else needs updating. CI holds no secrets by design, so there is no GitHub
Actions secret to change, and no deployed configuration reads either password.

Afterwards, to confirm and to clear this blocker:

```bash
node infra/e2e.mjs                      # must still pass with the NEW password
python3 scripts/secret-scan.py          # must still exit 0
```

The old values stay in git history forever and that is fine once they authenticate
nothing. `scripts/known-exposures.json` keeps them acknowledged so the scanner reports
them without failing the build; the register is what makes a *new* leak fail instead.



Both are gone from the working tree and both are still in history. `d8cfafa` is
reachable from `origin/main`, `origin/HEAD`, this feature branch and all three
dependabot branches, so **anyone with read access to the private repository has
them**. The commits titled "get a real account password out of the source tree"
removed the source, not the exposure.

**A commit cannot un-leak a credential.** The only fix is rotating both accounts,
which requires the owner. History rewriting is not proposed: it would break every
existing clone and the credentials would still exist in anyone's local copy.

`scripts/secret-scan.py` does catch these — and emits `::warning::` with exit 0, so
CI reminds forever and never blocks.

## 3b. The world-building brief is over its own stated token budget

**Status:** DECISION NEEDED — small, and the owner's call rather than a test's.

`apps/worker/src/worldbuilding.ts` opens with: *"Token budget is a hard product
constraint — worldBuildingBrief() must stay ~1.5k tokens."* Measured 2026-09-01 while
writing the module's first tests, at the usual ~4 characters per token:

| kind | characters | ~tokens |
|---|---:|---:|
| `obby` | 7,529 | **1,883** |
| `tycoon` / `simulator` / `showcase` / unknown | 6,947 | **1,737** |

16–26 % over, on **every build request**. Nothing enforced it, which is how it drifted.

Two honest resolutions, and the choice is a product one:

1. **Trim the brief** back under ~6,000 characters. The universal section is shared by
   every kind, so most of the saving is there.
2. **Restate the budget** in the header to the number that is actually intended.

`apps/worker/tests/worldbuilding.test.mjs` now ratchets it at ~2,000 tokens so it
cannot grow further while this is open. That threshold is a holding position, not an
endorsement — the test says so where it is set.

## 4. Creator Store public distribution of the plugin

**Status:** HUMAN-ONLY GATE. Inherited, not re-verified this session.

Official plugin asset `132128477945417`. Public availability on the Creator Store
is a Roblox-side review/publish step, and §AG forbids publishing autonomously.

**What continued anyway:** the local `.rbxm` build, release pipeline and
version/compatibility diagnostics are all in place, and the paired-plugin path was
validated end to end in `f132425`. The install *path* is proven; only the public
listing is gated.

---

## 4b. The curated asset library has never existed — HUMAN-BLOCKED

**Found 2026-09-01**, by auditing for exported code with no production caller — the same
audit that found the attribution ledger had none.

### What is true

`apps/worker/src/asset-library.ts` has a complete read path, a provenance validator, and a
20-entry `SEED_MANIFEST`. It also has `ensureAssetTables`, `upsertAssets`,
`recordVerification`, `staleAssets` and `markHealth` — **none of which is called by
anything**, verified across `apps/`, `packages/`, `scripts/` and `.github/`.

The tables were therefore never created. Production D1 `golem-corpus`
(`32c9471e-a7d7-49ee-a8fe-0a7def2c68bd`) contains `chunks`, `chunks_fts*`, `static_assets`
and `static_chunks`. There is no `asset_library` and no `asset_library_fts`:

```
select l.id, bm25(asset_library_fts) as rank from asset_library_fts
  join asset_library l on l.id = asset_library_fts.asset_id ...
-> 7500 no such table: asset_library_fts: SQLITE_ERROR
```

The system prompt tells the model to prefer this tool **first** ("Ids come from
search_asset_library (curated, licence-cleared, try this first)"). Every one of those
calls has failed, in production, for the life of the deployment, and the model received
the raw SQLite string.

`staleAssets` is documented as feeding "the nightly health-check cron". There is no cron
trigger in `wrangler.jsonc` and no `scheduled` handler in `index.ts`.

### What was fixed without the owner

`search_asset_library` now recognises the missing-table case and returns a plain
statement of it, naming `find_verified_asset` and `create_instances` as the deliberate
alternatives. Anything that is not the missing-table case is still thrown.

**Deliberately NOT done:** calling `ensureAssetTables` lazily. It would create the tables,
the search would return `[]`, and the model would read "the curated library has nothing
like that" — a claim about a table nobody has ever filled. That is the same defect as an
attribution report giving a clean bill from an empty ledger, and it would be harder to
find the second time. `apps/worker/tests/asset-library-availability.test.mjs` pins this,
including a guard that fails the moment a write-path caller appears, so this section
cannot quietly go stale.

### Why the owner has to do the rest

Populating the library is not a code change. Every `SEED_MANIFEST` entry is a *pre-ingest
candidate* with `robloxAssetId: null`, and `SEED_MANIFEST_NOTE` states what ingest must
do: re-read each licence string live, then fill `sha256`, `triangles`,
`textureResolution`, `boundsStuds` and `robloxAssetId` **after importing to Studio**.

That last step means downloading third-party binaries and uploading them to Roblox under
Golem's own account. That is an outward-facing operation on a real account with real
credentials, and it is not one to take unilaterally.

### Steps for the owner

1. Decide whether the curated library is still wanted. The alternative is to delete the
   read path and the seed manifest and let `find_verified_asset` be the only asset route
   — smaller and honest. Roughly 1,000 lines would go.
2. If it is wanted: run an ingest that, per `SEED_MANIFEST_NOTE`, re-reads each licence
   live, downloads the binaries, imports each to Studio, uploads under the Golem account,
   and records `robloxAssetId` + `sha256`.
3. Call `ensureAssetTables` then `upsertAssets` with the ingested records against
   `golem-corpus`.
4. Add a `scheduled` handler and a cron trigger so `staleAssets` / `markHealth` run, or
   delete the sentence in `staleAssets` that promises a cron that does not exist.
5. Nothing further in the ingest itself. The extra step this list used to need — dropping a `fromLibrary`
   guard in `recordPlacedAsset` that keyed a library asset as *unaccounted* whenever
   its id had not come from this session's own search — was fixed in code on
   2026-09-01, so the ingest alone is now sufficient.
6. Re-run `apps/worker/tests/asset-library-availability.test.mjs`; the last test is
   expected to fail once step 3 lands, and that failure is the signal to rewrite this
   section.

### Impact while it stands

Every asset acquisition falls through to the Creator Store — the path with unverified
creators and script-bearing models, which the insertion gate then has to catch. The
library exists to avoid needing that gate so often, and has never once been available.

**And every asset Golem places is recorded as unaccounted.** The attribution ledger keys
on `asset_library.id`; with no library there is no key, so every placement writes the
`unaccounted:` sentinel and the compliance report grades each one `missing_provenance`,
which it treats as a blocker. That is correct as a fact — Golem checked the asset was
free, publicly visible, script-free and from a trusted creator, and then genuinely did
not know its licence — but the credits panel first rendered it as a red *"N assets cannot
ship commercially"*, a determination nobody made. The panel now distinguishes a finding
against an asset from the absence of one and says the second in amber. Until this blocker
clears, the honest state of the credits surface for every project is "Golem cannot account
for these", and that is what it says.

This does not invalidate `evidence/2026-09-01-rock-palette-supply.md`, which searched the
Creator Store directly and whose conclusion stands on its own.

## 5. Dependabot: 27 advisories on the default branch

**Status:** OPEN, previously triaged, not re-triaged this session.

GitHub reports 27 advisories (7 high, 15 moderate, 5 low) on `main`, surfaced on
every push. `docs/SECURITY-TRIAGE-2026-08-31.md` records the prior finding that the
highs are build/dev exposure rather than production exposure, and that the one
reachable sink — a react-router open redirect — was fixed directly.

Dependabot PRs #2 (esbuild), #3 (astro) and #4 (vite) are open against `main`.

**Not a mission blocker,** but it is noise on every push and the triage is a day old.
It should be re-run before this branch merges.

---

## For the owner to review — a published figure was corrected

**Not a blocker, and not a price change, but §33 says public pricing is the owner's, so
this is surfaced rather than left in a commit message.**

The pricing page stated **Clay · 1 spark** and **60 requests a free day**. The worker
charges `sparksForNeurons(n) = max(1, ceil(n / 30))`, and `docs/COST-MODEL.md` measures a
Clay question at 37–43 neurons — so it is **2 sparks and 30 requests a day**. Stone
(111 → 4) and Rune (297 → 10) were both correct.

Corrected on 2026-09-01, with `scripts/check-spark-figures.mjs` now checking the whole
chain in CI. Nothing about what anyone is charged changed: the free tier is 60 sparks a
day at $0 and Pro remains an unpriced waitlist. What changed is a claim about consumption
that the code contradicted, and the reason not to leave it is that a reader planning
around "60 questions a day" hits the limit at 30.

**If the intent was that a Plan question should cost 1 spark**, that is a change to the
worker — `NEURONS_PER_SPARK`, or a per-mode floor — and not to the page. This correction
assumed the code is right and the page was wrong, because the code is what actually
charges people. Say if that assumption is backwards.

### And the public site was naming the internal specialists

Found while fixing the above. `packages/shared/src/index.ts` states it plainly:

> Clay, Stone and Rune are internal specialist identities, not user-facing brands:
> nothing in normal product UI should name them.

Mission §15.3 gives the public modes as **Plan / Agent / Super Agent**, the app offers
exactly those, and `apps/web/src/components/roadmap/model.ts` goes as far as
regex-replacing the specialist names out of worker copy before rendering it. The
documentation site named them **96 times** across nine files — including the docs nav
label, a page title and every mode heading — so a reader learned "Clay", went to the app,
and found no such thing.

Renamed on 2026-09-01: Clay → Plan, Stone → Agent, Rune → Super Agent, across the site
only. `docs/COST-MODEL.md` keeps the specialist names, which is correct — it is internal.
`check-site-semantics.mjs` now fails if any of the three appears in visible copy on a
built page.

**This is a vocabulary change to public documentation**, so it is recorded here rather
than only in a commit. It aligns the docs with §15.3 and with the product; it does not
change any behaviour, price or URL.

---

## Not blockers, though previously believed to be

- **Persistence needed a published place.** It did not: the benchmark place is
  PlaceId `116648235878426`, GameId `10764643912`, PlaceVersion 2, with Studio API
  services enabled. A full save/restart/load round trip is now measured. See
  `docs/evidence/2026-09-01-persistence-roundtrip.md`.
- **A textured mesh could not take a biome tint.** It can, once the texture is
  cleared on the clone. See `docs/evidence/2026-09-01-detexture-ab.md`.
