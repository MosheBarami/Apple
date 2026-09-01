# Quality, era, and a ranker that had been returning zero

`docs/SOURCE-INTELLIGENCE.md` §1 lists the intake pipeline. Two stages in it —
QUALITY SCORE and DOMAIN TAG — had never run. This records building them, and the
three defects that running them exposed.

---

## 1. The fields were there the whole time

`contentRecord()` has carried `libraries`, `engineEra`, `deprecatedPatterns` and
`qualityScore` since it was written. Every record in `data/content.json` held the
defaults:

```json
{ "libraries": [], "engineEra": "unknown", "deprecatedPatterns": [], "qualityScore": null }
```

And `retrievalRank` reads the last of those:

```js
const quality = typeof contentRecord.qualityScore === 'number' ? contentRecord.qualityScore : 0.5;
```

So every source in the corpus sat at the fallback midpoint and was ordered by
popularity alone. **The field existing and the stage having run are different
facts** — the same distinction the manifest already draws about the scanner.

## 2. Era is a density, not a presence

A maintained library can contain one five-year-old `wait()`. Classifying it
`legacy` for that would make the tag useless, and the tag exists to answer *"will
learning from this teach an API that no longer behaves the way the code assumes?"*

So era is decided by the share of era-relevant markers that are legacy, against two
thresholds, with a floor below which the answer is `unknown`:

| | |
| --- | --- |
| `legacyShare <= 0.2` | `modern` |
| `0.2 < share < 0.6` | `transitional` |
| `share >= 0.6` | `legacy` |
| fewer than 5 markers total | `unknown` — no evidence, not a guess |

`transitional` is a real state — a maintained library part-way through a migration —
and collapsing it into either neighbour would misdescribe a third of the corpus.

The legacy vocabulary is deliberately the **same** vocabulary the eval harness lints
for under `deprecated-api`, and a test asserts that every construct that rule flags
is recognised here. Two independent lists of deprecated APIs is exactly the
arrangement where one of them quietly stops being true.

## 3. Quality scores hygiene, and says so

| component | weight | decides |
| --- | --- | --- |
| `licensed` | 3 | a source that cannot prove a licence cannot lawfully teach anything |
| `clean` | 3 | the security gate is §1's second stage |
| `tested` | 2 | the only evidence in a checkout that its claims were executed |
| `documented` | 2 | a guessed intent is what produces a mis-extracted pattern |
| `currentEra` | 2 | legacy APIs no longer behave the way the code assumes |
| `typed` | 1 | `--!strict` turns a class of extraction mistakes into errors |
| `maintained` | 1 | CI is evidence the tests are run, not merely present |

This measures **engineering hygiene and not whether the patterns inside are good
ones.** A thoroughly tested, CI-gated repository full of terrible UI decisions scores
high here and should; judging the patterns is what extraction and the design checks
are for, and conflating the two produces a number meaning neither.

An undecidable component is **excluded from the denominator**, never scored zero — a
source whose scan has not run must not look low-quality for a fact nobody
established.

Stars and forks are absent by design: popularity already enters through
`retrievalRank`, and counting it here too would double it while dressing the second
count up as quality. Measured on the real corpus, **quality correlates with
`log(stars)` at r = 0.10**, and a test fails the build above 0.8.

## 4. What running it found

### F-47 — `retrievalRank` had been returning 0 for every source

Not mis-ordered. Dead, for all 170 provenance records, while returning a plausible
number the whole time.

`scan.mjs` wrote its verdict to `record.security`, under a comment saying that is
"where the claim lives". `retrievalRank` gates on `p.security?.safe === true` where
`p` is a **provenance** record — and every provenance record still read
`{safe: false, class: 'unscanned'}`, so `usable` was empty on every call.

`hash.mjs` had already established the convention that was missed:

```js
rec.contentHash = h.hash;
if (rec.provenance) rec.provenance.contentHash = h.hash;   // <- the mirror scan.mjs lacked
```

Every unit test passed, because each stage was right about its own half and nothing
tested the join.

### F-48 — one provenance id, two records, last-write-wins

After that fix, 22 of 23 sources ranked. `Roblox/creator-docs` stayed at 0.

A provenance id is `host/owner/repo/sha` and carries no path, because a file inside a
repo at a SHA has the same provenance as the repo. The seed manifest holds both
`gh-roblox-creator-docs` and a file-level citation of one `SurfaceType.yaml` inside
it; the two mint the same id, only the first matched a checkout URL, and a map keyed
by provenance id handed retrieval the unscanned twin.

### F-49 — the tagger condemned Flipper for its own naming

`Reselim/Flipper` was classified `legacy` on 9 markers, 8 of them `:connect(`.
Flipper does not use the removed alias — it ships its own `Signal` with
`function Signal:connect(handler)`, and every flagged site is a call into its own
API. Fixed with a signal that *is* decidable: if a checkout defines the method, its
calls are presumed to be its own, and the suppression is **reported** rather than
silent.

What did *not* go wrong is worth recording too. `MadStudioRoblox/ProfileService`
shows 10 bare `wait()` calls and is still `modern` — correctly, because all ten are
in `ProfileTest.server.lua` while `ProfileService.lua` makes 32 `task.*` calls.
Density got that right where a presence test would not have.

## 5. The result

23 of 23 records scored, 13 tagged with an era, 13 with detected libraries.
**23 of 23 sources now rank where all of them returned 0, and 17 of 22 positions
changed** against the pre-quality ordering.

```
before   after    quality   source
  5.07    9.42    0.9286    Sleitnick/Knit
  4.58    8.50    0.9286    SirMallard/Iris
  3.58    7.16    1.0000    chriscerie/roact-spring
  3.90    5.20    0.6667    Sleitnick/RbxCameraShaker
  0.67    1.25    0.9286    LolplePlays/framer
```

Zero sources classify `legacy`. That is plausible for a corpus curated from
maintained MIT libraries rather than evidence of a broken classifier — the class is
reachable, and a test drives it.

## 6. The test that would have caught F-47

`pipeline-data.test.mjs` asserts against the **data on disk** rather than against the
functions:

- a scanned source must carry its verdict in both places
- no licence-clear, security-clean record may rank 0
- every content record must carry a quality score
- quality must not correlate with popularity above r = 0.8

A stage is not done when its function passes. It is done when the field the next
stage reads is populated on disk.
