# Storage outcome training experiment — 2026-09-25

The Apple MAX rep16 code benchmark missed `failed-load-no-wipe`: it treated an
empty successful read as a load failure and blocked the first save. This is a
measured model error, not a reason to relax the evaluator. The training change
adds a small, separate experiment rather than editing the saved answer or the
benchmark probe.

`packages/training/data/storage-outcome-seeds-v1/shard-1.jsonl` holds four
first-party standalone Luau lessons across distinct families: document load,
cache refresh, settings bootstrap, and a write gate. Every source was executed
by the local Luau CLI, its assertions passed, and a deliberate one-site mutation
failed an assertion. The training supervisor independently re-executed all four
through its production checker. The builder rejects eight-word overlaps with
the pinned eval corpus and the frontier prompts. These are pure modules; none
claims Roblox Studio, networking, or DataStore engine verification.

The exact shard SHA-256 is
`77350a388b3b1345a2274bcb0795087d3efd85cb282069f02c9c968aa566c46d`.
The private Hugging Face dataset `moshebarami/apple-roblox-corpus` now holds it
at `training/storage-outcome-seeds-v1/shard-1.jsonl`; a fresh download matched
the local file byte for byte. The `storage-outcome-verified-shard` hypothesis
appends the four rows only to the training split, leaving validation and the
fixed 38-row promotion set unchanged. Local focused tests passed 36/36 and the
full training package passed 661/661.

At this writing v24 is still training, and this shard has **not** produced a
trained version or a score. A later gain on `failed-load-no-wipe` would be a
diagnostic result after training on the concept, not an independent frontier
claim. Confirm transfer on new unseen storage tasks and a full Studio run.
