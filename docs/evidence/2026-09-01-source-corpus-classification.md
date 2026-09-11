# The seed corpus, actually classified

**Date:** 2026-09-01
**Closes toward:** DoD 21 (free kits discovered and classified), 23 (licences/provenance
preserved), 24 (unsafe/unlicensed quarantined); advances 20 and 22.

---

## What existed before

`packages/corpus/src/intake/` already held good machinery — content hashing, MinHash
dedupe, fork enumeration, licence classification, a security scanner, and the
ProvenanceRecord/ContentRecord split — all tested. It had been applied to **two**
sources: `Roblox/creator-docs` and `luau-lang/site`.

The Master Mission's Appendix A supplies 217 URLs across 13 categories. Machinery
that has never met the corpus it was built for is not a proven capability (§A), so
this pass ran it.

## What was added

- `packages/corpus/seeds/manifest.json` — the appendix extracted to structured data.
  217 entries, **118 unique GitHub repositories**. A `path` field distinguishes a
  file-of-interest inside a repo (e.g. `SurfaceType.yaml`, which is the *studs*
  reference) from the repo itself, which the first extraction collapsed — caught by
  a test asserting id uniqueness, not by review.
- `packages/corpus/src/intake/seeds.mjs` + tests — the **kind capability policy**.
- `packages/corpus/src/discover.mjs` — the transport that resolves seeds through the
  existing pure classifiers. It decides nothing itself.

### The policy that does the work

§H states it twice: *"'Open source' in a forum title is not a license"* and *"A source
with no license is not training data by default."*

That is encoded as a property of the **kind**, not as a check someone must remember:

| kind | can prove a licence? | why |
|---|---|---|
| `repo` | **yes** | LICENSE file, SPDX id and a commit SHA are all reachable |
| `devforum` | no | a thread is a *claim* about a licence, never the licence |
| `huggingface` | no | a card's licence says nothing about what was scraped into it |
| `registry` | no | an index is a place to find sources, not a source |

`capKind()` runs **after** the classifier, never instead of it: the classifier decides
what the evidence says, and the cap decides whether that kind of evidence is allowed
to mean it. A DevForum thread claiming MIT is demoted to REFERENCE_ONLY **with the
original finding kept in the reason** — the difference between "we refused" and "we
failed to notice".

## Result — 217 sources, 119 resolved, 2 dead

| category | COMMERCIAL | ATTRIB | COPYLEFT | QUARANTINE | total |
|---|---:|---:|---:|---:|---:|
| ui-framework | **28** | 0 | 4 | 16 | 48 |
| engineering | **16** | 0 | 0 | 0 | 16 |
| full-game | 8 | 0 | 2 | 23 | 33 |
| motion | 5 | 0 | 0 | 12 | 17 |
| ui-tooling | 5 | 0 | 1 | 9 | 15 |
| official | 4 | 1 | 1 | 18 | 24 |
| ux-system | 2 | 0 | 0 | 13 | 15 |
| **ui-kit** | **0** | 0 | 0 | **11** | 11 |
| **world-pack** | **0** | 0 | 0 | **13** | 13 |
| studs | 0 | 1 | 0 | 2 | 3 |
| generation | 0 | 0 | 0 | 6 | 6 |
| huggingface | 0 | 0 | 0 | 16 | 16 |

SPDX among resolved repos: MIT 56 · none 41 · Apache-2.0 10 · GPL-3.0 5 ·
CC-BY-4.0 2 · MPL-2.0 2 · GPL-2.0 1 · CC0-1.0 1 · Unlicense 1.

## The finding that should change the strategy

**The two categories the owner most wants Golem to learn from are the two with zero
reusable sources.** Every `ui-kit` (the free cartoon/simulator UI packs) and every
`world-pack` (the low-poly asset packs) is a DevForum thread. Not one can prove a
licence about itself, so all 24 are quarantined pending human review, and none may be
redistributed.

That is not a failure of the pass — it is the answer. It means the design-intelligence
route for exactly those categories **cannot be ingestion**; it has to be §K's
route — extract the grammar, build ORIGINAL Golem-owned primitives — because the
alternative is a licence violation baked into the product. The categories that *are*
reusable (ui-framework 28, engineering 16) are code libraries, which is a different
kind of learning.

## Other real findings

- **34 resolved repositories carry no LICENSE file at all** and are quarantined under
  §H. They are reachable, popular, and unusable until a human resolves them.
- **2 seeds are dead** — `oh-ashen-one/roblox-infected` and `1Estatic/flore` both 404.
  Recorded rather than dropped: a source that vanished is a finding.
- **8 upstreams are archived**, including `Sleitnick/Knit`, `Roblox/roact`,
  `evaera/plasma`, `Finchasaurus/UIBlox`, `EgoMoose/Rbx-Gui-Library`. Frozen, not
  maintained — which matters for a library Golem might otherwise recommend.
- **2 forks resolved to their upstreams** (`ddust1n/CameraShaker` ←
  `Sleitnick/RbxCameraShaker`; `LolplePlays/framer` ← `Starstruck-Studios-Developers/framer`),
  flagged for content-hashing before either is granted independent weight (§J).

## What this does NOT yet do

- No source has been **downloaded** yet, so no content hash, no security scan, and no
  ContentRecord. The security scanner is built and tested and has nothing to scan.
- Recursive discovery (§J — forks, Wally/Pesde enumeration, DevForum tag crawling) has
  **not** run. This is the seed floor only.
- No design tokens or component patterns extracted yet; that is the next milestone and
  it depends on nothing here being blocked.
