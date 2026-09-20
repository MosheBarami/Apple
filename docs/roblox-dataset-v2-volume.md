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

## Why the register could not answer this

`packages/training/discovery/v2/hf-datasets.jsonl` catalogued 115 datasets with a licence, a
disposition and a reason each — careful work, and the licence half of the job is done well. Every
one of its `row_count` fields is 0. It recorded what each dataset IS and never what each dataset
HOLDS. It also had no script behind it: produced once by hand, reproducible by nothing.

The same gap is open on the GitHub side and is worse. `discovery/v2/github.jsonl` holds 4,851
repositories, but only **577 were opened**; 4,269 are search-result leads whose licence is
`unverified_no_file_read`. 396 are verified-permissive admit candidates. The 69,103 Luau files
counted there come only from the 577.

**Blocked, explicitly:** converting those 4,269 leads needs the GitHub API, and `gh auth status` on
this machine reports the keyring login failing for account MPROGAMING. Unauthenticated that is 60
requests an hour against a job needing roughly 8,500 — about six days. This is not done and is not
being worked around. It needs one working GitHub token.
