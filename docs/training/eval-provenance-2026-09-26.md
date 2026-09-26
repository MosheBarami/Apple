# Local evaluation provenance repair — 2026-09-26

## Measured drift

Fresh comparison of existing raw38-row artifacts found identical ordered row IDs throughout. v22 and v27 base/comparator text are identical. Compared with v22, v28/v29 base text differs on19/38 rows and the same named v22 comparator differs on17/38; base text in v30/v31/v32 still differs on19/38. Historical artifacts have no generation provenance. This confirms the drift boundary but does not identify its cause or overturn the provisional v29 selection.

## Repair and actual cache verification

`generate_eval.py` resolves the existing cached model snapshot once, offline, and gives that exact local path to base/candidate/best loads. It records the heldout digest, generator digest, Python/platform/MLX device and package versions, model/tokenizer/generation configuration hashes, adapter config/weight hashes and base weight sizes. Base-weight hashes are explicitly unverified; no full-model weight hash claim.

An actual offline metadata-only probe first reproduced `IncompleteSnapshotError`: the usable MLX cache omits README.md/.gitattributes. The resolver now uses the installed MLX loader's model/tokenizer patterns. After repair the real cached snapshot resolved successfully to006f5dcd1393c3add266de40994ba96225e9689d. Default evaluation runtime device is GPU0; the training supervisor remains CPU. Seven model metadata files and both v29 adapter files were hashed. No model load/generation was invoked by this probe, no provider call, and no training process was interrupted. See [current runtime fingerprint](eval-provenance-20260926/current-runtime.json).

Scored JSON preserves raw provenance and adds an explicit selected adapter side/hash identity; split-best scores point to best hashes. Historical missing provenance remains null. This avoids dropping the fingerprints from the scored evidence uploaded privately to Hugging Face.

## Verification and limits

The generator regression failed against original code; the cache-pattern regression failed against the first patch; the scored-file regression failed against the original scorer. After fixes, the complete training test suite reports652 passed,0failed,14skipped (666total). CLI fake-generation tests and real scorer execution cover same-snapshot selection, actual input digests and candidate/best identity retention. Independent read-only technical review found and repaired cache compatibility, generation-config omission and selected-side ambiguity; final review returned no material findings.

The changed generator/scorer will be read when the existing supervisor launches its next evaluation subprocess, without a supervisor restart. No new actual paired generation, promotion, private upload or version start was performed in this repair. Verify provenance in the next completed paired38-row artifact and its private upload. Cause of historical generation drift remains unknown; local scores are not Frontier or real Studio quality evidence.

The prior owner lifecycle commitc219628 CI36238825124 passed all six jobs. Product F059/F064 and0/3 fresh full-product reviews remain open. GUI observation currently cannot resolve the main Studio document/screenshot, while actual server state reports pluginConnected=true,idle,queuedOps0. No new Studio mutations were attempted through that unreliable observation boundary.
