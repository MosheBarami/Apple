# How much Luau there actually is

Measured 2026-09-20 by `packages/training/src/measure-hf-corpus.mjs`, against the Hub's public
dataset index and `datasets-server`. Re-runnable; the artifact is
`packages/training/runs/hf-luau-corpus-measured.jsonl`.

## The number

**2,643,431 rows, 11.6 GB, across 35 Luau/Roblox-code datasets.**

v1 shipped 55,331 physical rows from 6 sources. What is measurably available on the Hub today is
**48x that**, and it is not a new discovery: **1,042,408 of those rows sit inside the source
families v1 already used**, of which v1 kept 55,331 after filtering.

## The ten largest

| rows | size | dataset |
| ---: | ---: | --- |
| 845,351 | 5.3 GB | Pinkstack/luau-pretrain-corpus-unfiltered |
| 565,760 | 1.7 GB | jayras/roblox-luau-dataset |
| 259,342 | 304 MB | PatoFlamejanteTV/RobloxCodeXL |
| 113,976 | 117 MB | casnityy/roblox-luau-sharegpt-v2 |
| 113,923 | 162 MB | casnityy/roblox-luau-sharegpt |
| 102,684 | 132 MB | kefir090/luau_github |
| 82,813 | 1.4 GB | PatoFlamejanteTV/RobloxCodeLarge2UNFILTRED-Lua-Luau |
| 63,568 | 84 MB | renvx0/Luau-Minified |
| 60,235 | 495 MB | PatoFlamejanteTV/robloxdb-large |
| 47,300 | — | Pinkstack/luau-coding-instructions-pretrain |

## What this number is not

It is **volume only**. Nothing here is an admission decision. Licence, provenance,
question/answer correspondence, API currency and eval-set overlap all stay with the disposition
register, and the v1 report's three false flags — `production_training_ready`, `training_approved`,
`semantic_quality_pass` — are untouched by it.

Two numbers are deliberately kept separate from the headline:

- **22 datasets could not be measured** — gated, private, or never parquet-converted. They are
  written to the artifact with `rows: 0` and the reason in `why` rather than dropped, because a
  dataset that could not be measured and a dataset measured as empty are different facts.
- **418,956 rows matched the search and are not Luau code** — usernames, meshes, avatars, clothing,
  PII benchmarks, YouTube comments. Real Roblox data; teaches nothing about writing Luau. The
  classifier that separates them is in the script, where the decision can be read and argued with.

## What the register already knew — a correction

An earlier revision of this file said of `packages/training/discovery/v2/hf-datasets.jsonl`:
"Every one of its `row_count` fields is 0. It recorded what each dataset IS and never what each
dataset HOLDS." **Both sentences are false, and they are corrected here rather than quietly
removed, because the error is the exact one this repository exists to refuse: a failure to read
was written down as a finding about the thing being read.**

`row_count` in that register is not a number. It is an object — `{value, source, per_config}` —
and reading it as a number is what produced the zero. Measured against the field it actually has:
**114 of 115 records carry that object, 90 carry a non-null `value`, 86 carry a positive one, and
those sum to 3,632,969 rows.** Each one names where it came from: `"huggingface dataset-viewer
/size endpoint, read 2026-09-20"`. The register did record what each dataset holds, from the same
endpoint family this re-measure used.

The two registers in fact agree exactly where it counts. Restricted to the ids this re-measure
classifies as Luau code, the register's own row counts sum to **2,643,431 — the same number, to
the row, as the headline above**, produced by a different person on a different pass. The whole
3,632,969 − 2,643,431 gap is non-Luau material: 418,956 rows the re-measure visited and rejected
as usernames, meshes and avatars, plus 571,396 rows on 17 ids the re-measure never visited.

What remains true of the register, and is why the re-measure was still worth running: it had no
script behind it, so it was reproducible by nothing; and it drew no line between Roblox data and
Luau *code*, which is the line that separates the 2.6M from the rest.

The same gap is open on the GitHub side and is worse. `discovery/v2/github.jsonl` holds 4,851
repositories, but only **577 were opened**; 4,269 are search-result leads whose licence is
`unverified_no_file_read`. 396 are verified-permissive admit candidates. The 69,103 Luau files
counted there come only from the 577.

**Blocked, explicitly:** converting those 4,269 leads needs the GitHub API, and `gh auth status` on
this machine reports the keyring login failing for account MPROGAMING. Unauthenticated that is 60
requests an hour against a job needing roughly 8,500 — about six days. This is not done and is not
being worked around. It needs one working GitHub token.

## How much of it may we use

Volume is not permission. Every measured Luau dataset was given a licence verdict against a stated
policy — the product charges money, so non-commercial is fatal, and share-alike and copyleft are
excluded because the obligation would reach the weights and the service. The register is
`packages/training/runs/rights-clearance.json`, rebuilt by
`node packages/training/src/clear-rights.mjs`, and guarded by `src/rights-clearance.test.mjs`.

| rows | disposition |
| ---: | --- |
| 2,069,435 | carry a permissive licence tag **on the repository**, across 21 datasets |
| 568,645 | no grant at all — licence "not stated", "other" or "unknown" |
| 5,351 | share-alike, excluded by policy |

That first row is a tag, not a finding, and the next section is what happened when it was checked
against the data.

## The tag was covering a corpus that is 95.6% unlicensed

Most of these corpora are scrapes. The uploader tags the compilation; the files inside came from
thousands of third parties who never saw that tag. So every dataset the queue called acquirable was
screened for per-row licence evidence — `node packages/training/src/screen-row-licences.mjs`,
artifact `runs/row-licence-screening.json`, guarded by `src/row-licence-screening.test.mjs`.

The case that forced it: **`Pinkstack/luau-pretrain-corpus-unfiltered`**, tagged `odc-by`, 845,351
rows, the single largest entry in the queue. It ships a per-row `license_type` column, so the
question is answerable from the data. The answer, from the dataset-viewer's own statistics:

| rows | `license_type` |
| ---: | --- |
| 808,084 | `no_license` |
| 37,267 | `permissive` |

Its card says so plainly — it is the companion to the *filtered* release and "additionally includes
files where no license was detected at all". And those 37,267 permissive rows are exactly
`luau-pretrain-corpus-filtered`, which **v1 already holds**.

Across all 18 measurable datasets:

| rows | what is actually known about them |
| ---: | --- |
| 37,267 | permissive **by per-row evidence** — and already in v1, so net-new is zero |
| 808,084 | measured `no_license`; never acquirable |
| 448,793 | trace to a source repo (`repo`, `file_path`) but carry no licence |
| 738,024 | no per-row licence and no per-row source: the repository tag is all there is |

**So the licence-clean, net-new yield from Hugging Face Luau corpora is 0 rows.** The volume is
real and the rights are not. An earlier section of this same file said the ceiling was "about 2.0M
permissively-declared rows"; that sentence was written before the per-row screening and it is
corrected here rather than removed.

### What would actually unblock it

The 448,793 source-traceable rows are the ones worth wanting: each names the repository and file it
came from, so each could be resolved against that repository's real licence. That needs the GitHub
API — the same credential the 4,269 unprobed repos need, and the same one that is broken on this
machine. **One working GitHub token converts ~449K rows from "tagged" to "cleared", and is the
highest-value single unblock in the dataset track.** It is not worked around here.

## Declared is not cleared

Of the six sources v1 actually shipped from, **two are cleared and four are not**, and the
difference is evidentiary rather than legal:

| source | verdict | evidence |
| --- | --- | --- |
| `Roblox/creator-docs` | cleared, CC-BY-4.0 | LICENSE retrieved at pinned `6991e0e7`; attribution required |
| `luau-lang/site` | cleared, MIT | LICENSE.md retrieved at pinned `81c1c185`; notice must be retained |
| `Roblox/luau_corpus` | publisher declaration only | no licence file at `e739f802`; card tag `mit` |
| `Pinkstack/luau-pretrain-corpus-filtered` | publisher declaration only | no licence file at `a1289ea9`; card tag `odc-by` |
| `Pinkstack/LuauDev-instructions-SFT-preview` | publisher declaration only | no licence file at `b84175a2`; card tag `mit` |
| `khtsly/Luau-Coder-1.0-Preview-SFT` | publisher declaration only | no licence file at `1038c903`; card tag `apache-2.0` |

The two `null` licences that `release/sources.json` carried are now resolved, with retrieved text
and a sha256 of it. All four card tags match what `sources.json` declared, so nothing was
misreported — but a card tag is the uploader's assertion about a compilation they assembled, and
it is not a grant covering each underlying file. That is why the four stay uncleared and why
`training_approved` stays `false` on the code and SFT tracks.

`knowledge/references.jsonl` is the one release file whose every contributing source is cleared:
16,781 rows from `creator-docs` plus 431 from `luau-lang/site`, which is exactly its 17,212.

## Is that really all of it?

The inventory behind v1 carried its own disclaimer — `coverage_claim: "Named query families only;
not all Hub content."` — and between it and the volume measure, seven terms had been tried: roblox,
luau, rblx, robloxstudio, rbx, "roblox studio", "lua game". The order was "almost everything under
roblox on Hugging Face", and seven terms does not answer that.

Twenty more were tried — toolchain (`rojo`, `roblox-ts`), file formats (`rbxlx`, `rbxm`, `rbxl`),
engine surface (`datastore`, `rbxassetid`), genre words — by
`node packages/training/src/sweep-hub-coverage.mjs`, artifact `runs/hub-coverage-sweep.json`.

**20 terms searched, 0 failed, 30 datasets found that the baseline did not have, and 0 of the 30
are Roblox material.** `datastore` returns OpenScholar retrieval stores and Solana trade archives;
`rojo` is Spanish for red. Every one was classified and kept in the artifact rather than dropped.

That is as close to "everything under roblox on the Hub" as dataset search can get, and the guard
on it exists because a negative result is the same shape a broken search client produces: if a
future run has every search fail, `hub-coverage-sweep.test.mjs` goes red rather than reporting
complete coverage.

Also corrected: the ledger recorded "6 of 290 HF repositories acquired". The 290 in
`manifests/hf-inventory.json` is **94 datasets and 196 models**, and all 94 datasets are already in
both the discovery register and the measured corpus. There is no unexamined dataset tranche there.

## Why none of this flips `training_approved`

Rights clearance is necessary and it is not sufficient, and the release says so itself. The one
file whose sources are both cleared is `knowledge/references.jsonl` — and `release/README.md`
describes that track as *"Official documentation sections and engine-reference entries, kept
retrieval-only"*. It was never a training track. The same README states plainly that
"`training_approved` and `production_training_ready` are false intentionally", and keeps a
"Remaining quality work" section naming the semantic, integration and type validation that has not
been done.

So the three flags stay false, and the reason has changed shape rather than gone away: it is no
longer "nobody checked the licences". It is that the knowledge track is retrieval-only by design,
the code and SFT tracks rest on publisher declarations rather than clearances, and no semantic
validation has been run on any of them. Those are three different debts and they need three
different pieces of evidence.
