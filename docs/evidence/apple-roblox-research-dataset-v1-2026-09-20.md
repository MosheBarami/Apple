# Apple Roblox research dataset v1 — actual files, candidate status

Recorded 2026-09-20. Local repository HEAD observed:
`ea4229d312ea0f51d3fafa144cddd9ccd08af2c1`.

## Owner request and boundary

Continue the large Roblox/Luau dataset, using Hugging Face and external primary
sources, rather than delivering only a proposed research plan. Quality must not
be manufactured by multiplying lines, turns or paraphrases. A dataset does not
establish frontier-model capability without subsequent training and evaluation.

Only the isolated dataset code/output and this evidence file were changed. No
production code, canonical training split, existing rejection ledger, model
route, customer data, asset catalogue or cloud deployment was modified.

## Delivered files

Directory:
`packages/training/data/roblox-research-v1-20260920/release/`

Archive:
`packages/training/data/roblox-research-v1-20260920/delivery/Apple_Roblox_Research_v1_candidates.zip`

Archive size: **64,217,833 bytes**. SHA256:
`a4c5c3a0516685e80a8e3cb86d714999b53b2db0135b7203663fd54f863d597d`.

All 35 source/evidence/data members listed in the bundle contents were read
back from the compressed archive and compared with their frozen source hashes.
The bundle also contains its contents manifest. No raw acquisition files,
rejected snippets, credentials or model weights were included. No upload or
publication was performed.

## Counts verified from the actual release

| Track | Retained records | Train | Validation | Test |
| --- | ---: | ---: | ---: | ---: |
| Source-code candidates | 24,411 | 21,915 | 1,381 | 1,115 |
| Synthetic conversation candidates | 13,708 | 11,258 | 1,263 | 1,187 |
| Retrieval-only reference records | 17,212 | — | — | — |

Total physical records: **55,331**. Candidate code/conversation records: **38,119**.
These are not 55,331 expert/engine-verified training examples.

The code pass considered 31,609 normalized records: 25,919 static passes and
5,690 review records. Near-duplicate filtering then removed 1,508 static passes.
The SFT pass considered 24,121 conversations containing 94,031 assistant Luau
blocks: 13,834 static passes and 10,287 review records, followed by 126 duplicate
removals. Review flags overlap and do not sum to unique record counts.

Normalization separately retained exclusion records for malformed/provenance-
deficient material, trivial content, exact duplicates, possible credentials,
oversized inputs and matches with the configured evaluation exclusions.
The code input counter (56,050) is after 3,850 pre-emit provenance refusals;
59,900 is the combined considered population, not 56,050 plus the retained count.

References represent 631 engine classes, 507 enums, 49 datatypes and 8,477
member entries in the acquired index. This is not full API type validation.

## Verification actually run

1. Existing 19 dataset tests recovered; 22 passed after conversation fences.
2. Nine focused static-validator tests passed, including real compiler controls.
3. Thirty-five focused tests passed before the SFT validation run.
4. The release-integrity test initially passed 7/10; three actual failures showed
   that omission of a split, a contradictory training-approval flag and an
   unpinned revision could escape the verifier. The verifier was repaired.
5. Final focused suite: **45/45 passed**, 0.150s. This is the dataset scope only,
   not the full product test suite.
6. Real code and SFT validation completed, with separate SHA256 output receipts.
7. Finalization completed at **2026-09-20T14:26:53.159860+00:00**.
8. Release read-back verification completed at
   **2026-09-20T14:27:21.250645+00:00**: seven data files, 55,331 records, unique
   IDs, immutable provenance revisions, consistent candidate flags and counts,
   15,790 groups, zero detected exact cross-split normalized-code conflicts.
9. Archive compression/read-back completed at
   **2026-09-20T14:30:34.687678+00:00**.

Compilation used `luau-compile --null`, not the interpreter or Studio.
Compiler SHA256:
`abee05fccaa70a9ab18da77a6d35be82973c150f79d6c44179e63d9b106d5e07`.

Controls expected and observed: valid source PASS; malformed source FAIL;
runtime-error sentinel PASS at compilation without execution; typed function PASS.
Unavailable/unattributed compiler or scanner results remain unverified/review.

## Split and decontamination limits

The original official test completions supplied 4,569 normalized exclusion
hashes. Local JSON tasks and the pinned RobloxQA questions supplied 57,221
question 12-grams. SFT assistant blocks were also compared with official test
code. No claim is made for undisclosed/private tests or all paraphrases.

Near-deduplication uses bounded bottom-eight token-shingle retrieval and full
Jaccard >=0.90 decisions. Candidate-bucket truncations were 4,773 for code and
126 for SFT; these are search-limit events, not unique record counts. The method
can miss near duplicates and can conservatively group distinct close examples.

7,218 detected shared-code/shared-answer links align groups across tracks before
candidate splits are written. The original raw normalization used first-retained
deduplication and did not preserve every duplicate-to-kept family mapping. Thus
the final group check is a check of recorded groups and detected code links,
not a proof that every upstream fork/repository family is independent.

## Rights, history, and semantic status

The retained source set is six sources: two code datasets, two conversation
datasets and two official documentation repositories. Seven HF sources were
acquired, but acquisition is not admission. The HQ corpus and trajectory sample
are not included in the screened release; RobloxQA is exclusion-only.

The 12,310 official-corpus code records remain explicitly historical (2023).
The 12,101 filtered-corpus records retain per-row detected licences and original
upstream identity, but local licence-text review is not complete. All 13,708
synthetic conversations retain publisher declarations rather than invented
independent rights clearance. The ODC-By compilation licence does not relicense
the underlying code. Documentation remains retrieval-only under project policy.

`production_training_ready` and every file's `training_approved` are **false**.
`semantic_quality_pass` is **false**, and engine tests/model training are zero.
Static screening does not establish instruction alignment, complete context,
privacy clearance, runtime/security correctness, visual quality, or improvement
to a model. The public research notes cite official Cube/CubePart/RobloxGuard,
data-sharing and compiler sources; they are not private leaks or training rows.

## Blocked operations and honest continuation

An earlier raw manual-sample inspection was already recorded blocked.
In this continuation, a combined compiler-help/local-repository licence check
was blocked before execution. That local licence inspection was not retried;
HF-only normalization continued independently. A raw HF metadata/row-count
helper was also blocked, not retried. Final source metadata was derived from
already-processed record provenance, not by reproducing that blocked inspection.

The first HF normalization run was intentionally interrupted after its complete
31,609-record code checkpoint while SFT was still running. Its traceback/log
was retained. SFT resumed from that checkpoint, without repeating acquisition
or overwriting the completed code output. An offset-based tokenizer avoids
copying each file's remaining suffix for every token.

Worker status failed twice with WORKER_IDENTITY_LOST. The plan update also failed
for missing exact chat identity. No independent worker/reviewer or updated app
plan is claimed. HF Jobs listing returned zero jobs. No paid compute, model
inference, training, account mutation or publication was initiated.

## Source and evidence paths

Implementation: `packages/training/src/roblox-dataset-v1/`.
Current pipeline source snapshots and their hashes are inside the delivery ZIP.
The code-validator receipt names an earlier whole-file validator hash than the
SFT receipt because SFT holdout/grouping functionality was added after the code
pass. These receipts are preserved separately, not falsely reported as identical
source snapshots.

Measurements under the isolated output's `audit/`:

- `code-normalization-counts.json`, `sft-normalization-counts.json`
- `knowledge-counts.json`, `code-validation-counts.json`, `sft-validation-counts.json`
- `compiler-controls.json`, `release-integrity-red.log`, `final-focused-tests.log`
- `code-near-dedupe.json`, `sft-near-dedupe.json`, `cross-track-group-links.json`
- `release-verification.json`, `finalize.log`, `bundle.log`

`release/manifest.json` is the frozen data/checksum authority.
`delivery/archive-receipt.json` records the compressed archive and every member hash.

Next priority is evidence-backed quality rather than volume padding: unblock
legitimate expert/rights inspection, repair or quarantine context-dependent and
misaligned examples, expand current-API checks, build real consented tool/result
trajectories, execute representative engine tests and evaluate the eventual model
on untouched tasks. No frontier-model or complete Creator Store claim is justified
by this candidate release.
