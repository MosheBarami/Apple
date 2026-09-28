# The plugin's Creator Store listing flipped from 404 to 200 between 19 and 22 September

**Measured 2026-09-22, ~18:15 GMT+3.** The probe the repository already documents, run with the two
controls it already names, plus two more. Nothing here is a new instrument.

```
$ curl -s -o /dev/null -w '%{http_code}\n' \
    "https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=<id>"
```

| what | id | 2026-09-19 | **2026-09-22** | name returned |
|---|---|---:|---:|---|
| Rojo 7 (control) | `6415005344` | 200 | **200** | `Rojo 7` |
| Moon Animator 2 (control) | `4725618216` | 200 | **200** | `Moon Animator 2 [sale!]` |
| **Apple Studio (ours)** | `107230158271368` | **404** | **200** | **`Apple Studio`** |
| Golem (retired id) | `132128477945417` | 404 | **404** | — |
| an id that cannot exist (control) | `99999999999999999` | — | **404** | — |

## Why the controls decide it

The probe was once distrusted on a mistyped control, and the comment above
`STUDIO_PLUGIN_LIVENESS_PROBE_URL` records that it now runs **beside a control, always**. That is
what makes this a measurement rather than a belief:

- Both known-listed plugins still answer **200**, so the endpoint is not blanket-404ing.
- An id that cannot exist answers **404**, so it is not blanket-200ing either.
- Our asset moved **404 → 200** while the controls held still.

So the discrimination still works, and the change is in our asset's status rather than in the
instrument. The asset details payload is consistent with a live listing: `typeId: 38` (Plugin),
`hasScripts: true`, `scriptCount: 5`, `isAssetHashApproved: true`, `visibilityStatus: 1`,
`createdUtc: 2026-09-19T18:13:20.949Z`, `updatedUtc: 2026-09-19T18:13:21.016Z`.

## What this does NOT establish, stated plainly

`packages/shared/src/index.ts` already says it: **"a probe reports distribution, not cause."** The
same sentence applies in the other direction. A 200 says the asset resolves through
toolbox-service. It does **not** say the appeal recorded in `STUDIO_PLUGIN_STORE_REFUSAL` succeeded,
that the Creator Dashboard's *Distribute on Creator Store* toggle is on today, or that the listing
will survive the week. The refusal record still names an appeal window open until
**2026-10-19T21:26+03:00**, and only the authenticated Creator Dashboard or the appeals page can say
what Roblox decided.

`STUDIO_PLUGIN_STORE_LIVE` is therefore **left at `false`**. Flipping it is not a verification step —
it changes what every customer is told ("you can install this") across nine files, including the
landing copy, the plan table, and the system prompt's caveat for a disconnected user. The constant's
own comment says the flip "waits on the appeal succeeding rather than on a probe changing its mind",
and a probe changing its mind is not an appeal succeeding. **This is the owner's call, and it now has
a measurement to make it on.**

What is unambiguously stale is the comment's own record — `Last checked 2026-09-19: 404` — which is
no longer true and would mislead the next reader in the direction of "nothing has changed".

## The id question

`132128477945417` (the retired listing, named *Golem*) is **404 and appears nowhere in the
repository** — verified by search across `*.ts`, `*.mjs`, `*.md` and `*.luau`. The current asset is
`107230158271368` (*Apple Studio*, a Plugin), which is the id every surface already uses and the one
this probe was run against.

---

## Correction, appended 2026-09-22 ~21:30 IDT (release-path pass). The text above is left as written.

**1. The flag has since been flipped.** `STUDIO_PLUGIN_STORE_LIVE` in `packages/shared/src/index.ts`
is now `true` and `STUDIO_PLUGIN_STORE_REFUSAL` is `null`. The flip was made by the orchestrating
agent session of this run (its brief to this pass says so), at about 21:03 IDT per the comment it
left above the constant — not by the owner's own hand. That comment records the evidence: a re-probe
at 18:02:59Z with the same controls, the store page rendered signed out showing "Apple Studio -
Creator Store" with a **Get Plugin** button, Creator Store search for "Apple Studio" returning exactly
this id, and **the owner reporting the plugin approved**. That last item is what the "owner's call"
paragraph above was waiting for; this pass did not itself observe the owner's report.

Re-probed again by this pass at **2026-09-22T18:22:25Z**: `107230158271368` 200, `6415005344` (Rojo
7) 200, `4725618216` (Moon Animator 2) 200, `132128477945417` 404, `99999999999999999` 404. The 200
still carries `scriptCount: 5`, `createdUtc = updatedUtc = 2026-09-19T18:13Z` and no `categoryPath`.
Still not measured by anyone: a stranger installing it on another machine.

**2. "132128477945417 appears nowhere in the repository" was false when written.** `git grep` at
HEAD (`bd6ab34`) finds it in 17 tracked files, among them `packages/shared/src/index.ts` (two
comments, lines ~1674 and ~1741), `docs/PLUGIN-RELEASE.md` (two), `.github/workflows/plugin-release.yml`
(three — including the instruction telling a human to overwrite that asset), a comment in
`apps/worker/wrangler.jsonc`, `docs/DECISIONS.md`, `docs/BLOCKERS.md` and ten files under
`docs/evidence/`. What is true is narrower: **no served surface and no runtime code uses it** — every
install link derives from `STUDIO_PLUGIN_ASSET_ID = '107230158271368'`. The release workflow's
instruction was the one reference that could have done harm; it now names 107230158271368 and says
never to publish to 132128477945417.

**3. The count of consumers.** "across nine files" undercounts: the flag is read by 12 source files
plus the site's re-export (`apps/site/src/lib/studio-plugin.ts`) and the definition — 7 site pages,
4 web files, 1 worker prompt (per the store-and-copy survey of this run).

**4. What the store serves is not the working tree.** The listed build is the 1.0.0 upload of
2026-09-19 (5 scripts, no `StudioCapture`). The working-tree source now declares `PLUGIN_VERSION`
**1.1.0** (`apps/apple-plugin/src/Bridge.luau`) because it adds native capture, Run-mode control and
model inspection, and it is not published. The worker's `LATEST_PLUGIN_VERSION` was moved from the
legacy `0.2.0` to `1.0.0`, the version the store serves. See `docs/PLUGIN-RELEASE.md` §0.

## Second correction, appended 2026-09-22 ~21:42 IDT (review of the release-path pass). Everything above is left as written.

Re-measured by the reviewer, not copied from the note above:

- **Item 2's figures are slightly off, though its conclusion holds.** `git grep -l 132128477945417 bd6ab34`
  finds **18** files, not 17, and **9** of them are under `docs/evidence/`, not ten. The note also leaves
  out `docs/backlog/CHECKLIST-V2.md`, `docs/backlog/OWNER-ONE-STEP-VISUAL-BENCH.md` and
  `docs/requirements/CONTRACTS.json`. Its `packages/shared/src/index.ts` line numbers (~1674, ~1741) come
  from the working tree. At `bd6ab34` the same two comments sit at lines 1763 and 1827. The claim it
  corrects ("appears nowhere in the repository") is still false either way.
- **Item 3's count is already out of date.** In the working tree at 21:40 IDT, `grep -rl
  STUDIO_PLUGIN_STORE_LIVE apps/*/src packages/*/src` finds 18 files. Apart from the definition and the
  site re-export, 16 read the flag: 10 in `apps/site/src` (8 pages, `DocsLayout.astro` and
  `data/known-issues.ts`), 4 in `apps/web`, and 1 each in `apps/worker/src/prompts.ts` and
  `packages/evals/src/acceptance.mjs`.
- **Item 4's "1.0.0" is an inference, not a reading.** Both commits of `apps/apple-plugin/src/Bridge.luau`
  (`eac3f01`, `dc5a41b`) declare `PLUGIN_VERSION = "1.0.0"`, and the tree committed before the
  18:13Z upload (`f6ad60a`) had exactly the five scripts toolbox-service reports. Nobody has inspected the
  published bytes.
- **The artifact claim was checked independently.** `apps/apple-plugin/release/apple-studio.rbxm`
  (120,575 B, sha256 `fcf56842…600a`) was decoded chunk by chunk and each script's `Source` compared
  with `apps/apple-plugin/src/`: 6 of 6 byte-identical at 21:42:52 IDT. A one-byte change to a copy of
  `Render.luau` made that comparison fail, as it should. `verify-artifact.py` exits 0.
