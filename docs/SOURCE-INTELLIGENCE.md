# Golem — Roblox source intelligence

The architecture the incoming source manifest plugs into. Written before the
manifest arrives so that the manifest is *data* and this is *policy*: adding a
hundred repositories must not require a design decision, and must not be able to
quietly widen what Golem is allowed to learn from.

This extends `packages/corpus`, which already fetches license-verified sources,
pins each to a commit SHA in `raw/manifest.json`, chunks them and uploads to
Vectorize + D1. That discipline is the baseline, not something to redo.

---

## 0. The two questions every source must answer

Everything here exists to answer two questions **separately**, because they have
different answers and conflating them is how a project ends up with a licence
violation baked into a model:

1. **May Golem's output reuse this code?** (reuse rights)
2. **May Golem learn from this code?** (training rights)

MIT grants (1) freely and says nothing explicit about (2). A proprietary game
dump grants neither. A CC-BY dataset may grant (2) with attribution while (1)
is irrelevant. A repository whose DevForum thread says "open source" but which
carries no LICENSE file grants **neither** — a title is not a licence.

Every record therefore carries two independent verdicts. A source may be
`REFERENCE_ONLY` for training and still be perfectly good for retrieval-time
citation, and that is a useful, common outcome.

---

## 1. Pipeline

```
DISCOVER
  → RECORD PROVENANCE
  → LICENSE CLASSIFY            (reuse rights AND training rights, separately)
  → SECURITY SCAN               (quarantine before anything else reads it)
  → FIND UPSTREAM               (is this a fork? of what?)
  → ENUMERATE ALL FORKS         (preserve every one as provenance)
  → CONTENT HASH                (normalised; identical content collapses)
  → NEAR-DUPLICATE DETECTION    (divergent forks are separate examples)
  → QUALITY SCORE
  → DOMAIN TAG                  (which library/libraries it belongs to)
  → EXTRACT PATTERNS/EXAMPLES
  → RETRIEVAL                   (progressive disclosure, never bulk injection)
  → PLAYBOOKS
  → EVALS
  → LEGAL TRAINING SUBSET       (the intersection of allowed and useful)
  → OPTIONAL SPECIALIST TRAINING
  → BLIND EVALUATION
  → ACCEPT / REJECT
```

Two ordering decisions are load-bearing:

**Security scanning happens before extraction, not after.** A malicious loader
must never reach a chunker, an embedder, or a reviewer's clipboard. The scan is
the second gate, immediately after provenance is recorded, so that even a
quarantined source keeps a complete audit trail of *why* it was quarantined.

**Content hashing happens before quality scoring.** Scoring a hundred identical
forks a hundred times is wasted work, and worse, it produces a hundred
independent-looking quality signals for one artifact.

---

## 2. Forks: preserve everything, count it once

The owner's requirement is explicit and has two halves that pull against each
other, so the resolution has to be precise:

> preserve every fork as a source/provenance record … but content-identical
> forks MUST share a content hash and MUST NOT multiply training/retrieval
> weight. 100 identical forks must not count as 100 independent examples.

The resolution is that **provenance multiplicity and evidential weight are
different quantities, stored separately.**

```
ProvenanceRecord   one per fork.         Never deduplicated. Never deleted.
ContentRecord      one per content hash. Carries the weight.
```

A `ContentRecord` holds `observedIn: ProvenanceRecord[]`. One hundred identical
forks produce one hundred `ProvenanceRecord`s and exactly one `ContentRecord`
whose `observedIn` has a hundred entries — and whose weight is **1**.

### What the content hash normalises away

The hash must be stable against the things a fork changes without changing the
code, or the deduplication does nothing:

- line endings, trailing whitespace, final newline
- file mode bits, and the fork's own `.git` metadata
- the repository's own name where it appears only in a path

Comment-only and whitespace-only diffs **are** included in the hash, so a fork
that edits only comments is recorded as divergent — but the near-duplicate stage
will then score it as trivially divergent and it will not earn extra weight.
Recording the difference and rewarding it are separate decisions.

Hashing is per-file over a normalised byte stream, then a Merkle root over the
sorted file list. A fork that adds one file diverges only in that file and still
shares every other file's hash, which is what makes partial reuse measurable
rather than all-or-nothing.

### Divergence

A fork is *meaningfully divergent* when its normalised content differs beyond a
similarity threshold. Divergent forks are ingested as genuine additional
examples — that is where a community's real variations live. Non-divergent forks
contribute provenance and popularity signal only.

**Popularity is not weight.** A high fork count is evidence a pattern is
*widespread*, which legitimately helps rank retrieval results. It is not
evidence the pattern is *correct*, and it must never multiply training weight.

---

## 3. Licence classes

Assigned per source, with **independent** `reuse` and `training` verdicts.

| class | meaning |
|---|---|
| `COMMERCIAL_REUSABLE` | permissive (MIT/Apache-2.0/BSD/CC0/Unlicense). Output may reuse it, subject to notice requirements. |
| `ATTRIBUTION_REQUIRED` | reusable but attribution must survive into the user's project (CC-BY, Poly Haven's credit requirement, many Sketchfab assets). |
| `COPYLEFT` | GPL/AGPL/CC-BY-SA. Reuse would impose obligations on a user's own game, so Golem does **not** emit derived code. Reference and evaluation only. |
| `REFERENCE_ONLY` | may be read and cited at retrieval time; may not be reproduced and may not be trained on. |
| `EVALUATION_ONLY` | may be used to measure Golem, never to build it. Holdout sets live here. |
| `UNCLEAR_QUARANTINE` | no LICENSE file, ambiguous terms, or a claim of openness without evidence. **The default for anything unproven.** Unused until a human resolves it. |
| `UNSAFE_EXCLUDED` | see §4. Excluded from every use, including retrieval. |

Rules:

- **The default is `UNCLEAR_QUARANTINE`, not `COMMERCIAL_REUSABLE`.** Absence of
  evidence is not permission.
- A DevForum post title, a README sentence, or a "free to use" comment is **not**
  a licence. The evidence must be a LICENSE/COPYING file, an SPDX identifier, or
  explicit terms — and the classifier records *which*, so the verdict is
  auditable rather than asserted.
- `COPYLEFT` is deliberately not treated as unusable. It is excellent reference
  material; it simply may not be reproduced into a user's commercial game.
- **User projects are never training data** without explicit opt-in, regardless
  of anything above. That is a separate switch and this table does not override
  it.
- Third-party source is not uploaded to any external dataset host (including
  *private* Hugging Face datasets) unless redistribution rights clearly permit
  it. Private is not the same as licensed.

---

## 4. Security: what must never be learned from

Roblox search results are heavily polluted with executor, exploit, dupe and
script-hub code. It is abundant, it ranks well, and it is precisely the wrong
thing to teach a model that writes game code.

Quarantined to `UNSAFE_EXCLUDED` on detection:

- executor / exploit hub code, script hubs, "universal" cheat scripts
- dupe, autofarm and aimbot implementations
- obfuscated loaders — very long single-line sources, dense `\xNN` escapes,
  heavy string-concatenation chains, base64-looking blobs
- `loadstring` / `HttpGet` payload fetchers and remote code loaders
- credential or token theft, `.ROBLOSECURITY` handling
- backdoors, especially `require(<numeric asset id>)`, the classic marketplace
  backdoor
- malicious model scripts inside Creator Store assets
- unlicensed proprietary game dumps

Two standing rules:

1. **Downloaded Roblox code is never executed.** Analysis is static. No sandbox
   is permissive enough to make running an unknown exploit loader a good idea.
2. **Creator Store models are untrusted until inspected** — every `Script`,
   `LocalScript`, `ModuleScript`, external `require`, HTTP call and remote is
   enumerated and judged before insertion. Ambiguity rejects.

Quarantine is recorded, not silent: an excluded source keeps its provenance
record and the specific signal that excluded it, so a false positive is
reviewable rather than invisible.

---

## 5. Current engine knowledge beats popular old code

This is the failure mode most likely to make Golem *worse* while appearing to
make it better: the community's most-forked UI code predates the engine's own UI
system, so a naively-weighted corpus teaches Golem to hand-roll what the engine
now does natively.

**Modern engine UI is the default.** Investigate and encode: `StyleSheet`,
`StyleRule`, design tokens, themes, style and state selectors, style queries,
adaptive layouts, mobile, gamepad/touch/mouse input fluidity, accessibility,
nine-slice, sprite sheets.

Old repositories stay valuable for *design* and *historical* patterns — how a
shop is composed, what a good rebirth flow feels like — and that value is real.
But every record carries an `engineEra` tag and a `deprecatedPatterns` list, and
retrieval **down-ranks** deprecated mechanics for implementation questions while
still surfacing them for design questions. A pattern being popular is not a
reason to ship it in 2026.

---

## 6. Libraries

Independently searchable, so retrieval is scoped to the question instead of
searching one undifferentiated pile:

`roblox-ui-components` · `roblox-ui-art-direction` · `roblox-ux-flows` ·
`roblox-motion-animation` · `roblox-responsive-mobile-controller` ·
`roblox-icons-sprites-nine-slice` · `roblox-simulator-tycoon-ui` ·
`roblox-game-system-ui` · `roblox-world-lowpoly-cartoon` ·
`roblox-full-game-architectures` · `roblox-luau-engineering` ·
`roblox-state-network-persistence` · `roblox-genre-templates` ·
`roblox-asset-security` · `roblox-cube-generation` · `roblox-training-evals`

A source may belong to several; domain tagging is multi-label.

### Progressive disclosure

**The corpus is never bulk-injected into a prompt.** The worker already
retrieves per-request against Vectorize; that stays. The addition is scoping — a
UI question searches the UI libraries first and widens only if it returns thin.
§39's cost discipline applies: retrieve narrowly, escalate deliberately.

---

## 7. Training ladder

| level | what it means | what counts as done |
|---|---|---|
| L0 | deterministic tooling and rules | the check runs and catches a real case |
| L1 | retrieval knowledge | measurably better answers with retrieval on vs off |
| L2 | curated exemplars | exemplars beat the unaided baseline on a held-out set |
| L3 | task playbooks | the playbook's task class improves |
| L4 | failure → diagnosis → regression data | the regression reproduces, then stops reproducing |
| L5 | Golem-owned synthetic curriculum | generated tasks discriminate between models |
| L6 | blind / multi-judge evaluation | judges agree above chance and disagree with the author |
| L7 | specialist fine-tuning / LoRA | only when legally clean AND L0–L6 are exhausted |
| L8 | promotion | the new thing beat the old thing on a blind eval |

Two rules make this a ladder rather than a list:

- **Every rung must beat the rung below it, measured.** An unmeasured technique
  is not a rung.
- **"Trained" means weights changed.** A changed system prompt is L2 or L3. It is
  never L7, and calling it training is the specific dishonesty the access
  manifest's §7 prohibits.

L7 additionally requires that the training subset be the *intersection* of
legally-permitted-for-training and actually-useful — which, given §3, will be a
small fraction of what is discovered. That is expected and correct.

---

## 8. Why this exists

Not to build a research archive. The corpus is judged by one thing: **does the
simulator/tycoon build get better?**

Concretely, the first questions it must answer better than this phase's build
managed on its own:

- What does a shop panel look like built on `StyleSheet`/`StyleRule` rather than
  hand-set properties on every instance?
- What do real simulator progression curves look like, against the ones guessed
  in `Config.luau`?
- Which deprecated UI patterns did this phase's own build already use?

If the corpus cannot improve a build that already exists and is already measured,
it has not earned its cost.
