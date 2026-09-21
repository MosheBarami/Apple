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

# Fourth pass: is it *current* Luau?

Measured 2026-09-21. Artifact: `packages/training/runs/luau-currency-github-v1.json`.

The request names it — "כל סוגי הluau העדכניים", all the *current* kinds of Luau — and the third
pass's own card still listed the gap: *"That the corpus is current Luau. These are repositories as
they stood at their pinned commits."*

The deprecated vocabulary is **derived from Roblox's engine reference**, which the corpus already
holds pinned: a member carrying a `Deprecated` tag. 12 globals, 230 method names, 638 class files
read. Nothing typed by hand, because a hand-typed list of deprecated APIs is the kind that goes
stale fastest.

| | rows | share |
| --- | ---: | ---: |
| call a deprecated **global** | 664 | 2.40% |
| name a deprecated **method** (upper bound) | 1,642 | 5.93% |
| carry a **modern-Luau marker** | 13,349 | 48.24% |
| **current-Luau candidates** | **18,464** | |

`getfenv` 223, `wait` 183, `version` 166, `spawn` 133, `collectgarbage` 80, `delay` 64.
Markers: annotation 8,003 · `--!strict` 7,409 · type alias 6,127 · compound assignment 3,756 ·
string interpolation 3,547 · `continue` 1,651.

## Three qualities of evidence, kept apart

**Globals are precise.** The match requires the name not to be preceded by a dot, colon or word
character, so `task.wait(` — the *correct* modern call, the thing a good corpus should be full of
— does not count, and neither does `signal:wait()`. A substring scanner would have reported the
best code in the corpus as the worst, and the better the code the worse the number.

**Methods are an upper bound**, and are labelled one everywhere they appear. `:Remove()` is
deprecated on `Instance` and is also the name of a method on half the hand-rolled list classes in
the corpus. A call site shows the method name, never the receiver's class.

**Properties are not counted at all.** The deprecated property names include `.Rotation`, `.Scale`
and `.Transparency`. Matching those by name would fire on nearly every file in the corpus and
produce a large, confident, meaningless number. A measurement that cannot be made honestly is left
unmade, and said to be unmade.

## `--!strict` is a comment, and this scan strips comments

The scan strips comments before matching, because four scanners in this repository have counted a
file's own prose about what it deliberately does *not* do. Stripping also deletes `--!strict` —
Luau's mode line, and the commonest mark of modern Luau there is.

The first run reported `strict_mode` firing **zero** times. It did not look like an error: the
marker was simply absent from the tally, while the other five carried a plausible total. Read from
the raw source instead, it is **7,409 rows**. With `continue` also fixed to be seen where it is
actually written — `if done then continue end`, not only at end of line — the modern share moved
from 11,730 (42.39%) to 13,349 (48.24%).

## What none of this establishes

- That a row free of deprecated calls is modern. Lua 5.1 that never needed `wait()` is
  indistinguishable here from Luau that avoided it. This counts evidence **of** modernity, never
  evidence against it.
- That a row using a deprecated global is bad. `wait()` in a 2019 repository is that repository
  being its age, not a defect.
- That a `.lua` extension means old code. Roblox accepted `.lua` long after Luau shipped; the
  corpus is 26,264 `.luau` to 1,407 `.lua`.
- That anything is approved for training. `training_approved` is false and `semantic_quality_pass`
  is null on every row, and this pass changes neither.

# Fifth pass: 41 repositories that were in no ledger row, and the two reasons

Measured 2026-09-21. Artifacts: `packages/training/discovery/v2/github-trees.jsonl` (re-read),
`packages/training/data/roblox-github-v1/repos.jsonl`, `packages/training/runs/offtopic-leads-probed.json`.

The headline above says **1,063 licence-verified, Roblox-relevant repositories**. `repos.jsonl`
held **1,024**. Nothing in this document, in the ledger or in the card accounted for the other 39,
and two of the 1,024 wrote no rows, so the real gap to the 1,022 acquired was 41.

Absence is the one verdict nobody reviews. A repository that is excluded with a reason gets read;
a repository that is simply not there gets counted as "not relevant" by whoever notices, which is
nobody. Both halves of the gap turned out to be recoverable, and one of them was a false statement.

## Eleven repositories were recorded as having no licence file, and every one has one

`summariseTree` matched a root licence file with `/^(LICEN[CS]E|COPYING)(\.[A-Za-z0-9]+)?$/i`, and
`acquire-github-luau.mjs` requires `license_file_name` — without a file there is no text to read,
and a repository whose only evidence is GitHub's detection cannot reach the `licence_text` tier.
That is the right rule. The matcher was not:

| what the root actually held | repositories | what the old pattern did |
| --- | ---: | --- |
| `UNLICENSE` | 7 | does not begin with `LICEN[CS]E`, so no match |
| `LICENSE-APACHE.md` / `.txt` / bare | 4 | a `-APACHE` stem is not a dot extension, so no match |

All eleven were probed against the GitHub API before anything was changed. Every one has a licence
file at its root. The artifact had written **"NO licence file found at the repository root"** onto
all eleven — a failure to match rendered as an observation about a repository — and 310
licence-clean Luau files sat outside the corpus behind it.

Four of the eleven are **dual-licensed**: `LICENSE-APACHE` beside `LICENSE-MIT`. Picking by tree
order is picking at random, and picking wrong is not cosmetic — acquisition fetches exactly
`license_file_name` and rejects the repository when the text does not corroborate the detected SPDX
id, so an Apache-2.0 repository whose MIT file was fetched becomes `licence_text_mismatch`: a false
rejection wearing the costume of a real rights finding. `preferredLicenceFile` takes the SPDX id and
prefers the file that names it, falling back to the bare `LICENSE` by a stable order.

Re-read: **11 repositories, 0 errors.** Exactly 11 rows changed and only in their four licence
fields — 36,366 Luau files, 260,346,115 bytes and 75,868 total files are byte-identical before and
after. **1,063 of 1,063 now have a licence file at their root.** Acquired: **241 rows** from 310
files, the other 69 being content already held.

## Two repositories were skipped for size, and held 1,956 Luau files

The snapshot cap is on REPOSITORY size, and it is there for a real reason: `sploithunter/HaloAndHorns`
is **1.8 GiB**, and buffering that tarball takes the process down. Its status line has always said
honestly that "its 1,936 Luau files are NOT in the corpus", which is why this was a gap and not a
defect. But 1.8 GiB of repository is 16 MB of Luau, and the tree already named a sha for every file.

`--oversized` takes those repositories one blob at a time: one tree request at the **pinned** commit,
then one `git/blobs/{sha}` request per Luau file, written into the same `{owner}-{repo}-{sha}/`
layout the archive produces so that the walk, the vendored exclusion, the dedupe, the row literal and
every count below are the same code on the same bytes. A second row builder would be a second
definition of what a row is.

A blob arriving alone has none of the integrity a tar archive gives for free, so every one is hashed
as git names it — `sha1("blob <len>\0" + bytes)` — and compared against the sha the pinned tree
recorded. A truncated body or a substituted file fails and is dropped rather than written under this
repository's licence.

| | HaloAndHorns | GodotLuau |
| --- | ---: | ---: |
| Luau blobs in the pinned tree | 1,936 | 20 |
| fetched | 1,936 | 20 |
| **integrity failures** | **0** | **0** |
| vendored, excluded | 635 | 0 |
| already held | 0 | 1 |
| **rows** | **1,301** | **19** |

**1,320 rows, 0 integrity failures, both licence texts corroborated.**

**635 of HaloAndHorns' 1,936 Luau files are wally's `Packages/_Index/` store** — somebody else's
library vendored into an MIT repository, which that MIT grants none of. They are excluded by the
same rule that has always excluded them, and the 1.8 GiB is mostly neither Luau nor this author's.

## The first --oversized run did nothing, and exited 0

It printed `0 repositories processed, rows written: 0` and returned success. Both target repositories
were sitting in the resume set wearing a `skipped_repository_too_large` row, and a skipped row is not
a repository that is done. Nothing failed; nothing happened either, and the exit code said the same
thing it says on a good run.

Their skipped rows are now dropped from the ledger rather than left behind an appended acquired row.
One repository, one row: two would make `repos.length` larger than the number of repositories, and
`eligible_by_rights` and the licence tally in the card are both derived from it.

## The 1,063 now partition, and a guard keeps them partitioned

Every one of the 1,063 tree rows is now either in `repos.jsonl` or fails a NAMED clause of the
rights predicate, and `summarise-github-corpus.test.mjs` restates that predicate and fails if any
repository passes all of it and appears in no ledger row:

| | count |
| --- | ---: |
| licence-verified, Roblox-relevant, tree-read | 1,063 |
| eligible by rights and acquired | **1,035** |
| holds no Luau at all | 28 |
| **passing every clause and in no ledger row** | **0** |

The same test asserts one row per repository, which is what the superseded-skipped-row fix above is
there to keep true.

## What the corpus is now

| | third pass | fifth pass |
| --- | ---: | ---: |
| repositories acquired | 1,022 | **1,035** |
| rows | 27,671 | **29,232** |
| hand-written | 19,322 | **20,877** |
| machine-generated | 8,349 | 8,355 |
| distinct shapes | 18,816 | 20,351 |
| bytes | 221,092,562 | 237,752,817 |

**The third and fourth pass figures above them are superseded, not corrected.** They were true of a
27,671-row corpus that no longer exists; they are left standing as the record of what was measured
then, exactly as the "Not a file count" bullet was left standing when it stopped being true.

## And the 923 the relevance filter rejected

Separately measured, because "irrelevant" was also a word about repositories nobody had opened. Of
the 1,986 licence-clean admit candidates, `isRobloxRelevant` keeps 1,063 on `primary_language` and
the owner/name string alone. The other 923 were written up as off-topic without a byte being counted.

39 of them name roblox/rbx/luau/rojo/wally in their **topics or description** — the two fields the
filter never reads. All 39 trees were read: **252 Luau files, in 10 of the 39**, 195 of them in one
repository. Against the corpus's 36,366 that is 0.69%. The filter is not hiding a corpus, and that
is now a measurement rather than an assumption. The remaining **884, which name Roblox nowhere,
were not opened** — they are recorded as counted and unopened, never as empty.

## Still not admission

`training_approved` is `false`, `semantic_quality_pass` is `null` and `production_training_ready` is
`false` on all 29,232 rows, including all 1,561 added by this pass, and a guard walks every row in
`rows.jsonl` asserting it. Everything here is a RIGHTS finding: these files MAY be used. Whether any
of them SHOULD be is a judgement nothing in this document has made.

## The four passes, re-run over the larger corpus

Nothing in the third or fourth pass supports a corpus it never read, so all of it ran again. The
parse rate barely moved, which is the point — 1,561 rows arriving from a wally-heavy game project
and a Godot extension did not quietly change what the corpus is:

| | third/fourth pass, 27,671 rows | fifth pass, 29,232 rows |
| --- | ---: | ---: |
| parse as Luau | 27,437 (99.15%) | **28,993 (99.18%)** |
| do not parse | 233, in 80 repositories | 238, in 85 repositories |
| not measured | 1 | 1 |
| call a deprecated **global** | 664 (2.40%) | 730 (2.5%) |
| **name** a deprecated method (upper bound) | 1,642 (5.93%) | 1,755 (6%) |
| carry a modern-Luau marker | 13,349 (48.24%) | 13,911 (47.59%) |
| current-Luau **candidates** | 18,464 | **19,950** |
| usable UI assets, across 214 repositories | 1,051 | **1,212** |
| …distinct shapes among them | 1,047 | 1,207 |
| …naming the screen they build | 99 of 1,060 | 123 of 1,221 |
| distinct composition keys | 444 | 528 |

The one row `luau-analyze` never finishes is still `underonunicom/IsEvenLuau/IsEven.luau`, 10.18 MB
of hardcoded answers, and it is still counted in the denominator rather than dropped to raise the
headline.

## The card had no currency row, and the card is the only thing a fresh clone reads

The fourth pass measured currency on 2026-09-21 and wrote it up in this document. `dataset-card.json`
— the one part of this corpus that reaches a fresh clone, because `rows.jsonl` is gitignored — had
no `luau_currency` field at all, and its `what_this_does_not_establish` list still told a reader
the corpus had never been checked for it.

A document does not fail a build. The card now carries the measurement, wired the same way the
parse row already was and with the same staleness guard: `currencyReportApplies` quotes the report
only when it is about this corpus at this row count, and says `not_measured` otherwise. That guard
is why the card refused the currency report for the ten minutes when the corpus had grown to 29,232
and the report still described 27,671.

Two of the four disclaimers were **re-aimed rather than deleted**, and guards check both:

- *current Luau* now says 19,950 rows are CANDIDATES and repeats that this counts evidence OF
  modernity and never evidence against it. Lua 5.1 that never needed `wait()` is indistinguishable
  here from Luau that avoided it.
- *left out for size* said repositories over the cap are recorded skipped with their Luau file count.
  None are any more. A disclaimer that goes on warning about missing files when none are missing is
  a disclaimer standing in for a fact — the same defect as a fact standing in for a disclaimer.

# Sixth pass: sixty repositories were filed under a reason that was not the reason

Measured 2026-09-21. Artifacts: `packages/training/discovery/v2/github-probed.jsonl` (relabelled),
`packages/training/discovery/v2/github-trees-archived.jsonl`.

The probe's disposition ladder read:

```
permissive && !archived ? 'admit_candidate'
  : none_declared      ? 'reject_no_licence_grant'
    : copyleft         ? 'hold_copyleft_review'
      :                  'hold_licence_unmapped'
```

An **archived** repository with an ordinary MIT licence fails the first clause, is not
`none_declared` and is not `copyleft`, so it falls off the end onto *"the licence could not be
mapped"*. Sixty repositories sat under that sentence: **53 MIT, 5 Apache-2.0, 1 CC0-1.0, 1
Unlicense.** Every one of those ids is in the permit policy. None of them was unmapped. What they
are is archived.

A wrong reason is worse than no reason, because a reason gets believed and never re-opened. This is
the third instance of one shape in this document — a fall-through rendering as a finding, beside
"NO licence file found at the repository root" written over eleven roots that had one, and 5.45 GB
of repository standing in for Luau volume.

| disposition | before | after |
| --- | ---: | ---: |
| `admit_candidate` | 1,986 | 1,986 |
| `reject_no_licence_grant` | 2,060 | 2,060 |
| `hold_copyleft_review` | 153 | 153 |
| `hold_licence_unmapped` | 70 | **10** |
| `hold_archived` | — | **60** |

The ten still under `hold_licence_unmapped` are CC-BY and CC-BY-SA awesome-lists and dataset
indexes, none of them Luau, and that label is correct for them. The disposition is a pure function
of fields every row already carried, so the relabel needed no network: `dispositionFor` is exported
and a guard asserts every row in the artifact carries the disposition its own fields derive.

`hold_archived` is a HOLD, not a rejection. Archiving a repository makes it read-only; it does not
withdraw the licence, and MIT does not expire.

## The hold now has a number in it, which is the whole lesson of this document

A bucket with a word on it and no number in it is indistinguishable from an empty bucket, and the
two get treated the same way — which is to say not at all. That is how 4,269 leads stayed unopened
for 21 days and how 923 repositories were called irrelevant. So the 50 Roblox-relevant archived
repositories were tree-read: **50 of 50, 0 errors, 0 truncated.**

| | |
| --- | ---: |
| repositories | 50 |
| **Luau/Lua files** | **756** |
| Luau/Lua bytes | 3,961,247 (3.8 MiB) |
| holding at least one Luau file | 50 |
| with a licence FILE at the root | 50 |
| licences | 48 MIT, 2 Apache-2.0 |

756 files is 2.1% of the 36,366 already measured. The largest are `unnixu/ZO-like-Combat-System`
(168), `christopher-buss/luau-lint` (61) and `lutest-dev/lutest` (57).

## The decision, made rather than deferred

**They are not acquired, and the reason is a choice, not the old fall-through.**

The argument for taking them is real and is this document's own: rights clearance is not a quality
judgement, and the fourth pass says in its own words that `wait()` in a 2019 repository "is that
repository being its age, not a defect". By that standard, dropping 756 licence-clean files because
their repository is read-only is a quality filter wearing a rights filter's clothes.

The argument against is the invariant. `github-trees.jsonl` and `repos.jsonl` now partition
exactly — 1,063 tree rows, 1,035 in the ledger, 28 holding no Luau, 0 passing every clause and
absent — and a guard fails if that stops being true. Acquiring from a second tree file breaks the
one property that makes the ledger auditable, for 2.1% more rows of source that stopped being
maintained, in a corpus whose stated purpose is *current* Luau.

The invariant wins. What changes is that the hold is now a hold: a true reason, a measured volume,
a per-repository artifact, and the evidence anyone needs to reverse this decision in one run.
