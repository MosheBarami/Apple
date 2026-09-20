# Apple Roblox Research Dataset v1

This is an isolated dataset-construction pipeline, not a change to Apple's
production model, product, existing training splits, or customer data.

## Output and status

Default output: `packages/training/data/roblox-research-v1-20260920/`.

The release has three **different** data types:

- `code_candidates/`: original code/completion records after static screening.
- `sft_candidates/`: publisher-generated conversations, retaining whole dialogues.
- `knowledge/references.jsonl`: official documentation sections and API entries,
  for retrieval/reference, not silently mixed into SFT.

Every emitted record keeps source identity, revision, path/row, and its validation
and rights status. `release/manifest.json` is the count and checksum authority.
`release/coverage.json` is keyword-derived topic coverage, not an expert quality score.

**This is a research candidate release, not production-approved training data.**
Compiling code does not prove its runtime behavior, security, instruction alignment,
visual quality, or licensing clearance. Do not change these flags to satisfy a
training loader. Do not advertise it as a frontier model or a complete Creator Store.

## Recorded continuation boundaries

Public acquisition had already completed before this continuation. The first
normalization left official-reference output on disk. The HF-only continuation
preserves that output, skips local-repository licence inspection after a tool
safety block, and keeps prior raw-sample inspection blocked rather than using an
alternative route to obtain those samples. Local source snapshots are therefore
not counted as newly ingested training data by this continuation.

One HF normalization was interrupted after **31,609 code records** had been written.
Its log and code checkpoint are retained. SFT normalization resumed independently
instead of redownloading or reprocessing the completed code checkpoint.

No harvested Luau is executed. `luau-compile --null` produces compilation diagnostics
only; controls require valid source to pass, malformed source to fail, and a
runtime-error sentinel to compile without executing. The static analyzer imports
the repository's existing anti-pattern scanner and treats all input as text.

## Commands

Run from repository root, with the existing Python environment and Luau compiler.
No dependency installation is performed by these scripts.

```sh
python3 -m unittest discover -s packages/training/src/roblox-dataset-v1 -p 'test_*.py' -v

# The present acquisition is complete. This command is for a NEW output version:
python3 packages/training/src/roblox-dataset-v1/acquire.py --out /absolute/new/output

# For a NEW build with local-source inspection independently permitted:
python3 packages/training/src/roblox-dataset-v1/build.py --out /absolute/new/output

# Existing HF-only normalization checkpoint continuation:
python3 packages/training/src/roblox-dataset-v1/build.py --phase sft-normalize

# Independent validation stages (existing outputs refuse silent overwrites):
python3 packages/training/src/roblox-dataset-v1/validate.py --phase code
python3 packages/training/src/roblox-dataset-v1/validate.py --phase sft
python3 packages/training/src/roblox-dataset-v1/finalize.py
python3 packages/training/src/roblox-dataset-v1/verify_release.py
```

Do not rerun a completed stage merely to obtain a newer timestamp. A failed or
interrupted stage leaves its log/partial output for diagnosis; a completed stage
has an atomic JSONL output plus a receipt. Use another output version for changes
to inputs, admission logic, or frozen release files.

## What the screening means

The pipeline rejects or isolates malformed conversations, unclosed reasoning
sections, discarded tool-call structures, credential patterns, exact normalized
duplicates, explicit holdout overlaps, parse/compile failures, selected executor
APIs, dynamic loaders, known anti-pattern errors, unresolved explicit API names,
and stub markers. User-provided broken code inside a debugging request is not
mistaken for the assistant's answer.

All assistant Luau-fenced blocks are compiled; code in other languages, unfenced
answers, prose correctness, and engine integration remain separate review work.
The existing official corpus test split is an exclusion source, never training
data. Local JSON evaluation tasks and RobloxQA questions also supply exclusion
fingerprints. This does not establish protection against every private benchmark,
paraphrase, or undocumented upstream training set.

Near-duplicate detection uses bounded bottom-eight token-shingle retrieval and a
full Jaccard decision. It is heuristic, not an exhaustive equivalence check.
Detected duplicate families are grouped before splits. Shared normalized code
and long identical assistant answers also connect groups across the two candidate
tracks. The split names are candidate partitions, not a claim of a new benchmark.

## Rights and publication

Source-code licences, dataset-compilation licences, documentation licences, and
publisher declarations are distinct. The ODC-By compilation licence does not
relicense the underlying code. Publisher tags alone are not an independent
rights audit. The 2023 official corpus remains a labelled historical lane.
Documentation stays retrieval-only under this project's current policy; this
is not a blanket assertion that CC-BY universally forbids machine learning.

No blanket MIT/Apache licence is granted over the combined release. Keep original
attribution and review unresolved rights before redistribution or commercial
training. This pipeline does not upload to Hugging Face, publish assets to Roblox,
accept gated terms, spend money, or train/serve a model.

## Remaining release gates

Rights review; representative expert/manual review; instruction-answer alignment;
real engine tests; complete project context; current-API method/property checking;
tool-call/result association and truthful completion traces; decontamination
against additional held-out evaluations; family-balanced curriculum construction;
first-party build/repair trajectories; and before/after model evaluation.

Do not pad row counts with line splitting, paraphrase multiplication, repeated
templates, or invented tool observations. Static-screened candidates, research
references, and expert/engine-verified training examples must retain separate counts.
