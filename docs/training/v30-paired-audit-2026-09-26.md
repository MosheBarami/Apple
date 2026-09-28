# v30 paired audit — 2026-09-26

v30 completed400 CPU training iterations and best validation loss0.859 at175. Pinned holdout SHA25665ad19abfe6ecf6a0e7cbe4ddba66c2b1fdee48b4af43392fb0228e61bf9c704. Candidate and reference raw/scored files contain exactly the38 unique pinned IDs; raw base answers and scored base outcomes match. No harness_unavailable or example_not_in_curriculum reasons.

Candidate v30: trajectory12/23,game logic0/8,finish5/7 =17/38. Freshly paired v29:16/23,0/8,7/7 =23/38. Base:0/23,0/8,4/7. Not promoted (bar25). This is a local task evaluation, not commercial visual quality or Frontier proof. v29 remains provisional because earlier paired v22 generation drift remains unexplained.

Supervisor35962 published v30 at03:31:39 UTC, then automatically began v31 drop-batch-c at03:31:44 without duplication/interruption. Private Hugging Face repository flag verified via authenticated model metadata. Adapter config374 bytes; adapter safetensors27816768 bytes, LFS SHA256282c566b6d1c072196583812d9c716ebf72eea8f8ffe88507505ef8e8e595186.

The running supervisor's upload contained candidate score only. The paired reference score was added to the same private v30 folder in audit commit477963dd7d6c4cbad542767d5d5c957538bf8a1a. Both remote scored files were downloaded through hf_hub_download and compared byte-for-byte with the original local files:

- candidate10293 bytes, SHA2565ef739589bf37220f2f15bf5c6fab6a6496f288a34cd3d128534780f1cd7bcb5
- paired reference9954 bytes, SHA25619dc38dc89e4cc4813dc1ca2d5d3f1c886a959a3142b615303b3fbd3c5d2d168

No score regeneration, supervisor restart, model promotion or served-model change was performed in this audit.
