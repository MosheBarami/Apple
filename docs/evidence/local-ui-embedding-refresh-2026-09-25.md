# UI embedding refresh without Workers AI

The 2026-09-20 BGE index held 29 UI rows. The current `ui-construction.json` has 30, and the
UI text hash changed from `9d8a4988abb289b9` to `a6d5aae9af33ffca`. The worker's staleness
test correctly failed. Workers AI was over the free allowance, so no provider build was run.

I downloaded the public, MIT-licensed
[BAAI/bge-base-en-v1.5](https://huggingface.co/BAAI/bge-base-en-v1.5) revision
`a5beb1e3e68b9ab74eb54cfd186867f64f240e1a`: `model.safetensors` (437,955,512 bytes),
`tokenizer.json` (711,396 bytes), `vocab.txt` (231,508 bytes), and small config files. A local CPU
encoder used the model's CLS pooling and L2 normalisation. It rewrote only the UI vectors, using
the repository's existing text and int8 quantisation functions; all module vectors remained as
they were. `scripts/rebuild-ui-embeddings-local.mjs` reproduces the operation from a locally cached
model with `BGE_PYTHON` pointing to Python with torch, transformers and huggingface_hub.

Before replacement, local document vectors compared to the existing Cloudflare-built UI vectors
at mean cosine **0.9769**, minimum **0.9662**, across the 29 prior rows. All 29 documents ranked
themselves first against the old index. On the 53 recorded UI lookups in
`packages/training/runs/knowledge-reach.json`, 18 have a known positive row. Using *local* BGE
query vectors, top-1 was **17/18 before and 17/18 after**; top-5 was **18/18 before and 18/18
after**. These are parity and regression checks, not a production result: the worker's live query
encoder runs in Cloudflare and was not called here.

The 16 focused worker tests for embedding retrieval and asset-source asking passed after the
refresh, including the corpus hash and row-count checks. No Workers AI budget or paid service was
used. A live query comparison and the full CI suite remain separate release checks.
