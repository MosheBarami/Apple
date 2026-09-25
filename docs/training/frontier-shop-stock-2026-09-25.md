# Frontier shop fixture: stock must exist before a purchase is judged

Measured 2026-09-25 06:05 UTC. The recorded Apple MAX rep15 answer for `shop-debit`
validated the item and balance, debited 100 coins, then refunded when it could not
find a `Sword` Tool to deliver. The benchmark's probe had created buyers and coins
but no sword. Its `legit-purchase-works` check therefore failed for a handler that
correctly refused to charge for undeliverable stock.

The `shop-debit` setup now puts a `Sword` Tool in ReplicatedStorage **before** the
candidate script starts. The request text and all model answer bytes stay unchanged.
A regression test using the saved real answer failed before this correction and passed
afterward. The full frontier control suite passed 87/87; it still proves that each
check has both passing and failing controls.

Scratch copies of all available runs under the 2026-09-25 library/UI arm were
re-executed by `rescore-roblox-frontier.mjs`. The source run files were not rewritten
and no model or Workers AI call was made:

| Run | Before | After |
| --- | ---: | ---: |
| rep10 (one-item preflight) | 1/1 | 1/1 |
| rep11 | 16/16 | 16/16 |
| rep13 | 16/16 | 16/16 |
| rep14 | 16/16 | 16/16 |
| rep15 | 12/16 | 13/16 |

The four complete reps now score **61/64 (95.3%)**, compared with 60/64 (93.8%)
under the stockless fixture. The corrected last rep is **13/16 (81.3%)**. This is a
correction to the measurement of stored answers, not a new improvement by the model.
The Apple lane's separately recorded 15/16 was not rescored here.

The three remaining rep15 misses are still observed failures, not fixture corrections:

- `chat-system-message`: the handler calls a method that the local TextChatService
  harness reports missing before it displays the announcement.
- `pet-rename`: `LastRename` defaults to zero; the five-second guard suppresses the
  first rename at the probe's initial clock, so the filtering call is never reached.
- `shutdown-save`: a successful `UpdateAsync` with no returned value is treated as a
  failed save; formatting the absent error then throws inside BindToClose, after one
  of two player writes.

These are code-harness results for the same Workers AI model used in both product
lanes. They do not establish a 100% frontier model or a finished Studio game.
