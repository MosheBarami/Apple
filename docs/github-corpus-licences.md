# The 4,269 repositories, opened

Measured 2026-09-20 by `packages/training/src/probe-github-leads.mjs`. Artifact:
`packages/training/discovery/v2/github-probed.jsonl`.

## What was blocked

`discovery/v2/github.jsonl` holds 4,851 rows. 577 had been opened. The other **4,269 carried
`license_class: "unverified_no_file_read"`** — seen in a GitHub search result and never looked at.
A lead with an unknown licence cannot enter a training corpus, so four fifths of the discovery was
unusable, and had been for 21 days: `gh auth status` failed on this machine, and unauthenticated
GitHub allows 60 requests an hour against a job needing thousands.

The owner supplied a token. The licence comes back on the repository object, so this is one request
per repo: 4,269 against a 5,000/hour ceiling. **4,229 probed this run, 0 errors, 0 not-found.**

## Licence, all 4,269

| class | count |
| --- | ---: |
| permissive (OSI) | 2,046 |
| no licence declared | 2,060 |
| copyleft (strong) | 153 |
| custom, needs a read | 10 |

`none_declared` is the single largest group. A repository with no LICENSE file grants nothing, so
those are rejected rather than treated as public-domain.

## The number that matters, and the one that would have been quoted

By licence alone there are **1,986 admit candidates**. That number is misleading and should not be
used, because the original search sweep pulled in repositories that have nothing to do with Roblox.
The largest by stars are `sindresorhus/awesome` (508k), `public-apis/public-apis` (481k),
`fffaraz/awesome-cpp` and `rust-unofficial/awesome-rust`. Training on that is training on
awesome-lists.

Filtering to repositories whose primary language is Lua or Luau, **or** whose path names
roblox/rbx/luau:

| | count |
| --- | ---: |
| admit candidates by licence | 1,986 |
| …of which Lua or Luau | 1,017 |
| …of which named roblox/rbx/luau | 280 |
| **relevant (union)** | **1,063** |
| irrelevant, licence-clean but off-topic | 923 |

**1,063 licence-verified, Roblox-relevant repositories. 5.45 GB.** The largest are `luau-lang/lute`,
`Roblox/Sentinel`, `daily3014/rbx-cryptography`, `boatbomber/Highlighter`.

## What this is not

- **Not a legal opinion.** `license_class` records GitHub's own detection from the LICENSE file.
  `NOASSERTION` and a missing licence are written as exactly that rather than rounded up.
- ~~**Not a file count.**~~ **It is one now.** The second pass ran on 2026-09-21; see below. This
  bullet is kept rather than deleted because the number it warned about — 5.45 GB — is still in the
  headline above, and it was wrong by a factor of twenty as a description of Luau.
- **Not admission.** Whether a repository enters a corpus is a separate decision made against these
  values. Nothing here flips `training_approved`.

## The second pass: the trees, opened

Measured 2026-09-21 by `packages/training/src/read-github-trees.mjs`. Artifact:
`packages/training/discovery/v2/github-trees.jsonl`. One recursive tree request per repository,
1,063 of them. **1,060 read this run, 0 errors, 0 not-found, 0 empty, 0 truncated.**

The bullet above warned that the 5.45 GB was repository size — checkouts, images, binaries,
vendored dependencies — and not Luau. It was right, and the gap is larger than the warning
implied:

| | |
| --- | ---: |
| files of every kind, across all 1,063 trees | 75,868 |
| **Luau/Lua files** | **36,366** |
| …`.luau` | 30,276 |
| …`.lua` | 6,090 |
| **Luau/Lua bytes** | **260,346,115 (248.3 MiB)** |
| as a share of the 5.45 GB | **4.8%** |

**5.45 GB was twenty times the Luau that is there.** `size_kb` summed over the 1,063 is 5,445,741
KB, and 260,346,115 bytes of it is Luau — 4.78% by the same thousands the GB figure uses, 4.67% if
both are read as binary. Either way the remaining 95% is checkouts, images, binaries and vendored
dependencies. The honest figure for this corpus is 36,366 files and 248 MiB.

What else the trees say:

| | count |
| --- | ---: |
| repositories with a licence FILE at the root | 1,052 |
| repositories shipping a Rojo project | 506 |
| repositories shipping a wally manifest | 345 |
| repositories holding no Luau at all | 28 |

The 1,052 with a licence file are the ones on which `licence_text` is reachable at all — the tier
`clear-rights.mjs` reserves for a licence document that was retrieved and read, and the tier no
Hugging Face dataset in the acquisition queue reaches. Seeing a licence file in a tree is not
reading it; `license_verified` on these rows says `github_api_detection+licence_file_present` and
nothing stronger.

## And a floor is not a total

`tree_truncated` came back false on all 1,060. GitHub truncates a recursive tree above roughly
100k entries, and when it does the count is a lower bound on one of the largest repositories in
the set — so the error would run in the direction of understating exactly what matters most, and
it would do it silently. `summariseTree` writes `FLOOR ONLY: …a lower bound, not a total` into
`estimated_rows_basis` when that happens, and `github-trees.test.mjs` is what keeps it there. On
this run nothing was truncated, so nothing carries the label. That is a measurement, not a
reassurance about the next run.

## The volume trap, found on the first repository opened

`tijnepema/lucide-roblox` is the largest contributor in the corpus by file count: **8,187 Luau
files, 23% of all 36,366.** Every one of them is a five-line icon stub carrying the banner
`This file was @generated by Tarmac. It is not intended for manual editing.`

They are MIT, they are real files, and they are one template used 8,187 times. A corpus that
reported them beside hand-written game code would claim something four times larger than what it
holds. `acquire-github-luau.mjs` therefore marks two things per row and drops neither, because
dropping is a quality judgement and that file makes rights judgements:

- `generated` — the generator banner, read from the first 600 bytes.
- `shape_sha256` — the program with every literal placeholdered, so instances of one template
  collapse to one shape. It answers the question content hashing cannot: how many *different*
  programs are in here.

## Still not admission

Nothing in either pass flips `training_approved`, `semantic_quality_pass` or
`production_training_ready`. Rights clearance says a file MAY be used. Whether it SHOULD is a
judgement neither pass has made, and every acquired row is written with all three unset.

