# The Hugging Face Roblox/Luau landscape, characterised

**Date:** 2026-09-01
**Answers:** §X ("Use the connected Hugging Face account as a private research/evaluation
workspace… The official Roblox Luau corpus is a high-priority benchmark/training
candidate… Broad community corpora must be filtered for license, exploit/unsafe code,
duplicates, quality, provenance"), DoD gate 32.

Account: `moshebarami`. **Nothing was uploaded, downloaded or trained.** This pass
characterises what exists and what its terms actually permit, which §X asks for before
any of that.

---

## The official corpus — the one clean training candidate

**[`Roblox/luau_corpus`](https://hf.co/datasets/Roblox/luau_corpus)** · MIT · 4.8K downloads

| | |
|---|---|
| rows | **27.6K** (22.6K train / 5.0K test) |
| size | 17.1 MB parquet |
| schema | `prompt`, `completion` — already instruction-shaped |
| consent | *"collected from the Roblox Luau Data Sharing program. **Only experiences where creators gave us permission** to contribute to the public Luau Dataset were used."* |

This is the only Roblox-specific corpus found whose licence, provenance **and consent
basis** are all clean and all first-party. §X calls it high-priority and that is
justified: MIT, per-creator opt-in, and a prompt/completion shape that needs no
reformatting to serve as an eval set.

It is also **small and old** — 27.6K rows, last modified Nov 2023 — so it is a better
*benchmark* than a training set, which is how §X frames it.

## The big one, and why its MIT tag is misleading

**[`TorpedoSoftware/the-luau-stack`](https://hf.co/datasets/TorpedoSoftware/the-luau-stack)**
· card licence MIT · **🔒 Gated** · 88.0K rows · 103.6 MB

Its schema is the interesting part, and it is close to this project's own
`ProvenanceRecord`:

`file_path` · `file_url` · `repo_name` · `repo_description` · `contributors` ·
`commit_hash` · **`license`** · **`license_url`** · `file_content`

And the card says plainly:

> *"Any use of all or part of the code gathered in The Luau Stack must abide by the terms
> of the **original licenses**, including attribution clauses when relevant."*
> *"The Luau Stack may be updated to enact validated **data removal requests**. You agree
> to keep your copies up to date."*

**So the dataset's `license: mit` tag describes the COLLECTION, not the CONTENTS.** The
88K files inside carry whatever licence their source repository carried — which is exactly
§H's rule that *"'free to download' is not a synonym for 'free to train on / redistribute'"*,
found in the wild.

Under this project's own buckets that makes the stack **`ATTRIBUTION_REQUIRED` at best and
per-row variable in reality** — usable as a *reference* and as a source of provenance
metadata, and not usable as an undifferentiated training pile. The removal-request clause
also means any local copy carries an ongoing obligation, which is a commitment rather than
a download.

## The specialist models, and a dead-provenance finding

The strongest Roblox Luau specialists come from one author:

| model | base | licence | note |
|---|---|---|---|
| `TorpedoSoftware/Gemma-3-27B-Roblox-Luau` | Gemma 3 27B | **gemma** | use-restricted, not open |
| `TorpedoSoftware/R1-Distill-Qwen-14B-Roblox-Luau` | DeepSeek R1 Distill 14B | mit | |
| `TorpedoSoftware/R1-Distill-Qwen-1.5B-Roblox-Luau` | R1 Distill 1.5B | mit | small enough to be cheap |
| `TorpedoSoftware/Gemma-3-1B-Roblox-Luau` | Gemma 3 1B | **gemma** | use-restricted |
| `squaredcuber/roblox-luau-mistral-7b` | Mistral-7B-Instruct | apache-2.0 | **LoRA adapter**, not full weights |

Two things worth recording:

1. **The Gemma licence is not an open-source licence.** It carries use restrictions and a
   redistribution obligation. A Gemma-derived specialist cannot be treated as
   `COMMERCIAL_REUSABLE` on the strength of appearing on the Hub.
2. **Their cited training data is partly dead.** Every one of these cards lists
   `dataset:boatbomber/roblox-info-dump` and `dataset:boatbomber/the-luau-stack`.
   `boatbomber/roblox-info-dump` returns **not found**, and `boatbomber/the-luau-stack`
   404s with *"The dataset has been renamed"* — it is now `TorpedoSoftware/the-luau-stack`.
   So the best available specialists cite provenance that no longer resolves at the path
   given. Recoverable, but it has to be *recovered*, not assumed.

## Duplicates, per §J

`487798RGW/Roblox-Luau-Reasoning-v1.0` carries **verbatim the same card text** as
`TorpedoSoftware/Roblox-Luau-Reasoning-v1.0`, including the sentence describing how the
authors built it. It is a mirror. §J's rule applies directly: preserve the URL and the
provenance, count the content **once**. The same applies to `Pinkstack/roblox-luau-corpus-text`,
`lilacai/lilac-roblox_luau_corpus` and `darwinkernelpanic/roblox-luau-reasoning-formatted`,
all of which are restatements of either the official corpus or the Torpedo reasoning set.

Counting these as independent evidence would inflate the apparent size of the Roblox
training landscape by roughly **4×** over what is actually distinct.

## What this changes

- **Benchmark candidate:** `Roblox/luau_corpus` test split (5.0K rows, MIT, consent-based)
  is a legitimate held-out eval for Luau completion, and it needs no reformatting.
- **Training pile:** there is no clean one. The largest corpus is per-row licensed and
  gated with an ongoing removal obligation.
- **Specialist adoption:** §W says fine-tune only when there is a measured weakness, a
  legal dataset, a compatible base, and no new paid spend. The measured weakness does not
  exist yet — that measurement is gate 26 and is blocked on AI Gateway credit — so
  **adopting a specialist now would be choosing by brand, which §F forbids explicitly.**

## Not done

- No dataset downloaded, no model pulled, no upload, no training. §X permits a private
  workspace; nothing yet needs one.
- The gated stack was not accepted — accepting its terms is a commitment (removal-request
  compliance) and it buys nothing until there is a measured weakness to address.
- Licence verdicts here are read from cards and tags, not from a fetched LICENSE file, so
  they are **claims** under §H, not proof. The 19 Hugging Face entries in
  `packages/corpus/data/sources.json` stay `UNCLEAR_QUARANTINE` for that reason, which is
  the policy working rather than an omission.
