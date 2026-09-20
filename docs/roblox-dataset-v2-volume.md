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
| 2,069,435 | permissively licensed across 21 datasets (MIT, Apache-2.0, ODC-By, CC-BY-4.0) |
| 1,995,636 | of those, after collapsing suspected re-uploads of one corpus |
| 568,645 | no grant at all — licence "not stated", "other" or "unknown" |
| 5,351 | share-alike, excluded by policy |

So the ceiling for acquisition is about **2.0M permissively-declared rows**, against the 55,331 v1
shipped. The word "declared" is load-bearing and is the subject of the next section.

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
