# Verified UI logic training shard — 2026-09-25

The best valid local LoRA, v22, passed only 1 of the 8 game-logic items in the fixed 38-row
evaluation. To test a broader training curriculum without using the held-out questions, I authored
nine new standalone Luau modules for menu tabs, focus navigation, sort state, shop button state,
panel stacks, help-tour state, title validation, keybinding conflicts and quest pinning.

- Source: `packages/training/src/ui-logic-curriculum-f.mjs`; builder:
  `packages/training/src/build-ui-logic-shard.mjs`.
- Immutable training-only shard: `packages/training/data/ui-logic-seeds-v1/shard-1.jsonl`, 9 rows,
  9 distinct families, 16,949 bytes, SHA-256
  `8993bb021c65fa9508b1051042329cfe0b5ffb3d908448131c4d27ea9e7ccb46`.
- Each answer and its assertions executed with the local Luau evaluator. Each one-site behavioral
  mutation failed an assertion. The training reader re-executed all nine answers, checked their
  provenance and rejected shared eight-word spans or family names from the pinned held-out set.
  One drafted example was excluded after the overlap check found a shared answer span.
- Appending to v22's 303 training rows yielded 312 distinct row ids in a read-only derivation.
  Validation, test and the 38-row evaluation remain unchanged.
- The hypothesis `ui-logic-verified-shard` is queued as one data lever. It has **not** been trained
  or scored yet; no model capability claim follows from these checks.

Focused shard tests passed 2/2. The full training package passed 655/655 after updating the
queue-size test, whose former upper bound of 12 rejected a legitimate new hypothesis.

The same shard and its card were uploaded atomically to the existing **private** Hugging Face
dataset `moshebarami/apple-roblox-corpus` at revision `2bad31d64845`. A forced download
matched the local shard byte-for-byte (the SHA-256 above), the card mentioned its path once,
and the repository still reported private visibility. This is a dataset update, not an
adapter upload or a new model score.

CI for the first shard commit found that the one-shot builder lacked a disposition in the
repository's dead-end ledger. The ledger now records that its generated, digest-pinned
training shard is the consumed artifact. The local dead-end gate and all 15 focused tests
passed after that correction; the full root suite passed 555/555. The next CI run must
confirm the whole repository.
