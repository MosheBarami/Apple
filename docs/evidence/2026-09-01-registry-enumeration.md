# Wally and Pesde, enumerated in full

**Date:** 2026-09-01
**Answers:** §J ("The seed list is a floor… **Enumerate Wally and Pesde indexes rather
than relying only on search engines**"), DoD gate 22.
**Data:** `packages/corpus/data/registries.json`

---

## The expansion

| | |
|---|---|
| seed manifest (Appendix A) | **217** URLs |
| Wally packages | **5,807** across 1,509 scopes, 28,782 versions |
| Pesde packages | **781** across 180 scopes |
| **total discovered** | **6,588** — a **30×** expansion on the floor |

Both were enumerated by shallow-cloning the index repositories rather than by API
pagination: Wally alone is 5,807 packages, and resolving those one call at a time would
exhaust an hour's authenticated GitHub rate limit for a result one clone returns
completely.

## Declared licences — and the number that matters

Counts are of each package's **latest** version.

| licence | Wally | | Pesde | |
|---|---:|---:|---:|---:|
| MIT | 3,003 | 51.7% | 490 | 62.7% |
| **(none declared)** | **2,425** | **41.8%** | **211** | **27.0%** |
| Apache-2.0 | 163 | 2.8% | 17 | 2.2% |
| MPL-2.0 | 102 | 1.8% | 11 | 1.4% |
| MIT OR Apache-2.0 | 30 | 0.5% | — | — |
| GPL-3.0 | 22 | 0.4% | **42** | **5.4%** |
| Public domain / CC0 | 14 | 0.2% | 2 | 0.3% |
| LGPL | 10 | 0.2% | — | — |

### 41.8% of Wally declares no licence at all

That is §H at registry scale: *"A source with no license is not training data by
default."* Nearly half of the Roblox package ecosystem's flagship registry would enter
this corpus as `UNCLEAR_QUARANTINE`, and any pipeline that treats "it is on Wally" as
permission is wrong about 2,425 packages.

### Pesde carries **ten times** Wally's proportion of GPL-3.0

5.4% against 0.4%. In absolute terms that is 42 packages against 22, from a registry
one-seventh the size. This is the finding with the sharpest product consequence: a
GPL-3.0 module dropped into a Roblox experience is a copyleft obligation on a commercial
game, and it is not a thing most Roblox developers would think to check. A Golem that
recommends packages must read the licence before it recommends, and it must read it
per-registry rather than assuming the ecosystem is uniformly permissive.

## Normalisation was not cosmetic

The raw tally splits one licence across several spellings — `MPL-2.0`, `MPL2` and
`MPL 2.0`; `Apache-2.0`, `Apache License 2.0` and `Apache2`. Before normalising, MPL
appeared as 66 + 25 + 10 rather than 102, so the third-largest licence in the registry
read as three minor ones. A licence tally that does not normalise **understates copyleft
and overstates fragmentation**, which is the wrong direction to be wrong in.

These strings are publisher-declared free text in an index file. They are `CLAIMS` under
§H, not verified evidence — no LICENSE file has been read for any of these 6,588
packages, and `registries.json` says so in its own `note` field so a later reader cannot
mistake the tally for adjudication.

## What this does not do

- **No package was downloaded, scanned or ingested.** This is discovery and licence
  *claim* collection. The security scanner in `packages/corpus/src/intake/security.mjs`
  still has nothing to scan.
- **No cross-reference to the seed manifest yet.** Several seed repositories are certainly
  published Wally packages; linking the two would let a seed inherit registry metadata and
  vice versa. Not done here.
- **DevForum and Creator Store crawling remain unrun.** §J names both, and this pass
  covers only the two package indexes it names explicitly.
- The two index clones are scratch, not committed — 38 MB of Wally is re-fetchable, and
  `registries.json` (1.9 KB) is the durable artefact.
