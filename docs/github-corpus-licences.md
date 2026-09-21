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


# Third pass: does any of it compile, and how much of it is UI?

Measured 2026-09-21. Artifacts: `packages/training/runs/luau-syntax-github-v1.json` and
`packages/corpus/data/ui-assets-github-v1.json`.

## 27,437 of 27,671 rows are Luau

The card said `"luau_compiler": "not_run"` and it was true. Rows had been licence-cleared,
deduplicated, shape-hashed, byte-counted and split generated-from-hand-written, and nobody had
asked whether any of them parse.

| | count |
| --- | ---: |
| rows checked | 27,671 |
| **parse as Luau** | **27,437 (99.15%)** |
| do not parse | 233, across 80 repositories |
| not measured | 1 |

The 233 are worth having found rather than being noise:

- `Sift/LICENSE.luau` and `t/LICENSE.luau` are the **MIT licence text saved with a `.luau`
  extension**. Two rows of a Luau corpus that are not Luau and never were.
- `k.d.luau`, `zune.d.luau` are **declaration files** — `declare Enum: { ... }` — a Luau dialect
  the runtime analyzer rejects outside definitions mode. Not runnable Luau.
- 88 of the 233, more than a third, come from one decompiler's malformed-output fixtures.

## The exit code says the corpus is perfect

```
$ luau-analyze --formatter=plain bad.luau        # contents: local x = = 1
./bad.luau:1:11-11: (W0) SyntaxError: Expected identifier when parsing expression, got '='
$ echo $?
0
```

`luau-analyze` exits **0** on a file it could not parse. A gate reading the exit code would have
certified all 27,671 rows, and would have been believed, because a clean result is what a corpus
check is expected to print. The signal is the diagnostic **text**; the exit code is deliberately
unused, and `luau-syntax.test.mjs` asserts the exit code is 0 so a later reader cannot quietly
"fix" the gate by trusting it.

Only `SyntaxError` counts. Roblox source analysed outside Roblox reports `TypeError: Unknown
global 'game'` on nearly every interesting file; a gate counting those would reject the corpus for
being Roblox code.

## Three outcomes, because one row hangs the analyzer

The first full run reached 27,500 rows and stopped for twenty-two minutes with no output and no
error. One row: `underonunicom/IsEvenLuau/IsEven.luau`, **10.18 MB** of hardcoded answers, which
`luau-analyze` never finishes.

Without a timeout the gate hangs on the last batch of the corpus. With a timeout but only two
outcomes, that row gets filed as parsing or as not parsing, and both are inventions. So a row has
three fates — parses, does not parse, and **not measured, with the reason** — and the parse rate
keeps the unread row in its denominator rather than raising the headline by dropping it.

A canary file with a known syntax error rides in every invocation. A batch whose canary stays
silent was not observed and is re-run one file at a time rather than recorded as clean.

## 1,051 UI assets, which is the third answer to that question

The standing ask is that the model almost never builds an interface from scratch. It has been
answered with a count of **genres** covered (a count of the map) and then with **1,060 rows that
construct a GUI class** — a measurement, not a library, because nothing could be looked up in it.

`packages/corpus/data/ui-assets-github-v1.json` is the index:

| | count |
| --- | ---: |
| assets, from 211 repositories | 1,060 |
| **hand-written and observed to parse** | **1,051** |
| distinct shapes among those | 1,047 |
| distinct composition keys | 444 |
| machine-generated | 2 |
| fail to parse | 7 |
| **name the screen they build** | **99** |

**Only about a tenth of Roblox UI source says which screen it is.** Keying on the file path lands
65 of 1,060; adding the names the code gives its own instances (`.Name = "ShopFrame"`, a local
holding an `Instance.new` of a GUI class) lands 99. The rest is `init.luau` in a component folder.
A library keyed on genre would hold 99 reachable assets and 961 unreachable ones, and would report
"16 screens covered".

So the primary key is the **composition signature** — the sorted GUI classes the file constructs,
derived from Roblox's own engine reference. Every asset has one. The screen is secondary, is
`null` where the file never claimed one, and is `null` where a file claims two, because two claims
are not an answer.

The source bytes are not copied in. 1,060 files is 25.9 MiB of other people's Luau; each asset
carries its pinned revision, a permalink at it, the SPDX id, and the sha256 of the licence
document that granted it — the same treatment `repos.jsonl` already gives the ignored
`rows.jsonl`.

## Still not admission

`training_approved`, `semantic_quality_pass` and `production_training_ready` are false or null on
every row, and this pass changes none of them. Parsing is the **floor**, not the bar: it removes
the possibility of training on bytes that are not Luau at all, and establishes nothing about
whether any file is worth training on.
