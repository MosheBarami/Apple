# Apple / RbxAI — historical stop and transition to V3

This file preserves evidence, not active instructions. It is not a live checkout/deployment audit. V3 product decisions are recorded in the main handoff and decision register; old milestones are not redefined retroactively.

## Sources and coverage

The original Claude session was `97464f8d-2373-4986-8891-45b9c35e572d`, under the Drive folder `-Users-moshe-Desktop-RbxAI`. The prior audit recorded 45,488 JSONL records and seven late subagent transcripts, two workflow journals and three verification transcripts. The original transcript Drive ID is `1HPCrbkavtdEV1iiDuSNRHjl3BEMdMAwh`; its recorded size is 198,941,289 bytes and SHA-256 `7919c03a5b1103b8efe3dc8698aee4cd7994dcc20e727e68fa2b91fb7970e354`. Those underlying sources were not all re-read during V3 preparation.

The continuation source is `page-2026-09-28-00-28-15.md`: 5,801 physical lines, 1,191,210 bytes, SHA-256 `8743ea04816577cf220d549c2b21ab8e4ed8b524705b3a9580f84da7227633e1`. It is a rendered shared-chat Markdown export, not a full Codex rollout. It includes the continued Claude context `3c468a17-78dd-46d6-b07c-1366412d616c` and the move to Codex. The share ID `cx_6ab9af28b85c81918a11e0931191c32e` is not a verified local rollout ID.

The prior V2 analysis reports structural scanning of the export and reading its substantive unique content and ending. Repeated heartbeat text, “Show more,” edited-file summaries and linked screenshots are not complete raw tool results. The raw screenshot links were not freshly opened in V3. The proof descriptions below are the previous agent's reports, not newly reproduced results.

`C:n–m` refers to physical lines of that exact export. The owner Q1–Q38 and UI-LATEST decisions happened later in the current conversation and are not falsely assigned C line numbers.

## Exact work stop

- C:5773–5777: a private gateway returned **203 model readiness records from 230 reviewed files**. Product/plugin consumer integration was still in progress.
- C:5779: last reported weekly Codex usage **99%**. This is historical, not today's usage.
- C:5783: edited-file summary names `packages/owner-corpus/gateway.py`, `gateway_native_readiness.py`, `test_gateway_native_readiness.py`. It is not a full patch or deployment record.
- **C:5787–5791, especially C:5789:** a mismatch would prevent the plugin from reading the catalog. A background agent was fixing it against the real service response, before loading the updated version. A large-map reconstruction discrepancy was still unresolved. No later completion result is shown.
- C:5793: “Worked for 21s” cannot be attached confidently to a specific code action.
- C:5795–5801: quota-monitor instructions only, at 2026-09-27 04:30:17.504, 05:31:18.238, 06:33:18.022 and **07:35:18.262 UTC** (last = **10:35:18.262 Jerusalem**). They are not development or quota-result events.

There is no exact timestamp for the last substantive message, raw final tool call, completed patch, explicit final exhaustion event or reset timestamp in this export. Do not attach the last heartbeat time to the last code action. The last reported whole-goal percentage was about 55%, an unvalidated estimate for an older scope.

## Useful historical results

| Reported layer/result | Recorded quantity | Limit of the evidence |
|---|---:|---|
| Unique sources | 438 = 411 binary + 27 XML | Not 438 finished playable games. |
| Binary source extraction | 411/411; 9,619,989 nodes | Not all nodes materialized, inserted and functionally tested. |
| XML index | 194,593 nodes; 4,458 script segments | Not proof every output file is byte-equal. |
| Media references | 1,069,744 | References are not downloaded media files; 175 real media files were recorded at an earlier stage. |
| Retained XML component files | 230; 42 missing files were recovered | Readiness applies to this artifact layer, not the entire corpus. |
| Native-readiness models | 203 out of 230 reviewed files | Consumer contract remained unfinished. |
| ItemShop inserted through Apple | 363 nodes; later 1 call / 5 Apple Credits | Visual analysis reported, not all shop mechanics proven. |
| Map fragment inserted through Apple | 2,875 original IDs, zero duplicates/scripts | Not a complete game. |
| Simulator inserted through Apple | 244 objects; 14,669 properties in materialization | Six bridges/189 anchored parts do not prove gameplay. |
| Cross-unit references | 19 matching refs on one checked page; undo sample of 3 | Not complete corpus/game reference coverage. |
| Batch insertion | 3 units / 2,296 nodes in 1 call | Task-specific 3→1 calls, not a proven total quota/speed multiplier. |
| Lobby insertion | 832 nodes, 627 physical map parts, 9 cameras | Inserted through Studio tools; not yet proven via Apple. Terrain/world settings/gameplay incomplete. |

Relevant anchors: C:5030–5034,5151–5158,5363–5367,5434–5443,5468,5480–5486,5569–5608,5634–5654,5684–5695,5731–5735,5775–5791. Do not add counts across potentially overlapping insertion experiments.

`building_simulator.rbxl` had a reported reconstructed decoded representation from 13,295 nodes. The retained original was byte-identical; a new serialized Roblox file of 1,128,895 bytes was not. That distinction stays true historically, even though V3 no longer makes serialization equality a release condition. Raw strings/code had separate preservation paths to avoid earlier conversion changes. [C:4883–4889,4921,5355]

## Historical work not to redo blindly

F-069 Stop was reported closed in Round 8C; further bounded runs also stopped. F-068 had a prior closure from terrain evidence. Basic Discord was built and linked; its historical snapshot was 33 channels/19 roles and bot commands. Training advanced to v33 but was unrelated to the production GLM path and later cancelled. Do not reactivate it.

F-059 (visual quality) and F-064 (complete requested game parts) had no demonstrated full closure. Old full-product review records were 0/3. V3 replaces the obsolete acceptance machinery, but does not convert those missing quality proofs into passes. Public plugin availability was later reported moderated/404, and a formal appeal remained unsent. Public distribution is now held by the owner, while an approved installation path remains necessary.

Last named assignments: Mencius for readiness indexing; Einstein for resumable batch processing. Earlier Epicurus/Huygens/Mendel worked on source fidelity, plugin integration and the 20-map queue. Their names do not establish current active processes, and the last consumer fix cannot be assigned to a named agent with certainty.

Historical code anchors include `authoritative_materialize.py`, `gateway_authoritative_materialize.py`, `authoritative_raw_batch.py`, `authoritative_raw_normalize.py`, `retry_authoritative_after_batch.py`, `authoritative_lookup.py`, `OwnerAuthoritativeComponent.luau`, `owner-native-visual.ts`, `bounded-owner-outcome.ts` and `tool-sequence.ts`. Resolve actual paths/current revisions before editing. Existing source migration/security/plugin capability boundaries are not obsolete simply because branding and product modes changed.

## V3 changes what comes next

The next task is no longer “continue exact corpus reconstruction until all source games are byte-identical” or “restart every old unfinished lane.” Reconcile the last real work, adopt the single Apple vX model/flow, repair reusable functional blockers, finish the scoped library and cloud delivery, and prove the complete customer path. Preserve historical results; remove superseded requirements from active guidance.

The competitor HAR remains an unmodified observation under `observed_har` in the V3 FLOW JSON. It ran after the final timestamped Codex record. Its recorded mandatory approval, runtime search and visual-check behavior are not requirements when superseded by the owner's later decisions. There is no pixel-perfect website claim or complete-game success proof in that capture.
