# Live model single-edit compatibility — 2026-09-26

## Measured failure

At 06:31–06:32 UTC the bounded Apple MAX run `2e6d68eb-429c-428c-9a93-b2e8375da077` read GardenClient successfully, then stopped on the exclusive source/edits/source_file check. Its 9 product Credits were refunded. Cloudflare AI Gateway's actual response shows a top-level `find` (206 characters), `replace` (1,669 characters), `path`, and `baseHash` (`080f8464`), with none of the three canonical payload keys. The supplied schema already advertised canonical `edits`.

Provider billing remains real despite the product refund: read request cost $0.0009392698516845703; edit request cost $0.0019727799072265626. Their sum is $0.0029120497589111329. Private raw gateway files remain outside the repository; no credentials or full customer source are included here.

## Change and safety

Worker commit eb5c7a1 explicitly normalizes a single top-level find/replace into one canonical edit and maps baseHash to base_hash. It refuses mixed payloads, incomplete pairs, nonstring values, empty anchors, invalid all flags and conflicting hash aliases. Existing fresh-source hash, match, Luau syntax and asset construction checks still execute before Studio receives a write.

The regression exercises the real bundled tool and the existing edit application function. It verifies the observed shape writes exactly once and stale hashes, mixed payloads, missing anchors and invalid syntax write nothing; empty replacement remains valid deletion.

## Local validation and release

- 11 focused tests passed.
- Worker suite: 4,223 tests, 4,219 passed, 4 skipped, zero failures.
- TypeScript check passed; git diff --check passed.
- Clean git archive deployed through infra/deploy-worker.mjs; health verified eb5c7a1.
- CI on prior dashboard head 9147b24 passed. Current eb5c7a1 CI is pending at this checkpoint.

## Bounded live proof

After deployment, run `16cbc617-a189-402a-b480-75ac6f17ddf7` completed exactly read_script then edit_script, no extra tools: successful read 2,809 ms, successful edit 388 ms, 11 Credits, stopReason done. The actual provider response used canonical edits (one exact block) and base_hash 70c4da05, so this model run does not prove the shorthand branch by itself. Fresh Studio read confirms the added CurrentCamera listener disconnects the previous viewport connection, reconnects the new camera and tolerates nil. This is an autonomous script edit, not proof of visual quality.

A separate operator compatibility probe supplied the original flat shape directly through the live tool. A stale baseHash 00000000 was refused; the fresh e53367fe hash accepted one comment correction, producing b5bcc630. A fresh read exactly equals the prior source with that single replacement. Thus the live shorthand path and stale-hash refusal are both measured; the operator probe is not counted as autonomous gameplay.

Gateway cost for this new model run: $0.0013478499603271485 + $0.0022680999298095705 = $0.003615949890136719. Native Studio saved the isolated local file. No permanent upload occurred. Commercial visual quality, full-game completion, camera replacement runtime behavior and independent acceptance remain unverified; F-059/F-064 and 0/3 reviews stay open.

## Desktop runtime check

Fresh native Play after the edit showed the imported desktop shop centered and readable, with the sourced Tulip visible. Clicking its 10 Coins button changed coins 60→50. Closing restored Sell. Screenshot: `apple-studded-live-20260926/desktop-after-edit.png`. Tomato and Pumpkin artwork remain absent; the sparse, mismatched map still fails commercial visual acceptance. Portrait and deliberate camera replacement tests remain outstanding.
