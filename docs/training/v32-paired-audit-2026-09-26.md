# v32 paired audit — 2026-09-26

The sole CPU train-forever supervisor35962 completed v32 training400iterations (best validation0.814@275). Its paired evaluation has38rows in the same ordered IDs on both sides: v32 trajectory17/23, game logic0/8, finish5/7 = **22/38**; fresh comparator v29 trajectory16/23, game logic0/8, finish7/7 = **23/38**. Promotion threshold25, therefore no promotion. These are local scores, not Frontier evidence. v29 selection remains provisional due to the previously recorded v22 generation drift.

The supervisor uploaded v32 privately at10:24:00.795UTC and automatically started v33 at10:24:04.826UTC. Fresh process listing showed only35962. The active supervisor predates the paired-comparator upload change; its upload again omitted the comparator. Owner follow-up uploaded that existing scored file without restarting or duplicating training. Both score files were force-downloaded and compared byte-for-byte with local source. Adapter configuration374bytes and weights48,679,320bytes were downloaded; weight SHA256 matches HF LFS metadata. Repository private=true at verification. Exact hashes and revision in [HF audit](v32-hf-20260926.json).

Full product gate still fails F059/F064 and0/3 passing independent reviews. Next: preserve sole v33 training, follow paired evaluation/private upload/automatic next start, and improve real cartoon game quality.
