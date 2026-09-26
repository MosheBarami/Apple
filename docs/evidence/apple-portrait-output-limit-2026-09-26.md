# Portrait shop failure and finite workflow output limit — 2026-09-26

Native Studio Play at portrait 375×667 showed the imported Studded shop's three cards squeezed into one row, clipping Tomato/Pumpkin names and wrapping prices. Screenshot: apple-studded-live-20260926/portrait-before.png. The Grid has three Frame children and no UIGridLayout. No portrait fix is proven.

Bounded Apple MAX run d310e3e2-63db-4f1e-b884-bfec64da5487 successfully read GardenClient, then produced three 6,500-token reasoning-only truncated responses without an edit. The run was stopped; persisted trace contains only that read, stopReason stopped, 42 Credits. No refund was recorded. Provider gateway costs were $0.0010886698455810546, $0.005217670135498047, $0.003661300048828125 and $0.003663519989013672; total $0.013631160018920898. Private raw gateway records remain outside the repository.

Commit 5e2b80d stops an explicitly finite tool workflow as incomplete when model output ends at its length limit without tool calls. It avoids the general run loop's automatic retry in this specific case. Ordinary full-game continuation remains unchanged. The regression exercises the real SessionDO after one successful read: no edit, no next provider call, incomplete termination. It failed before the change and passed afterward.

Validation: 19 focused tests passed; full worker suite 4,224 tests / 4,220 passes / four skips / zero failures; TypeScript and diff check passed. Clean archive deployed through infra/deploy-worker.mjs; live health verified 5e2b80d. The new refusal branch has no live model proof yet. Previous dashboard head 2d31013 CI passed; 5e2b80d CI run 36225631116 subsequently completed successfully.

Studio was stopped, edits disabled, and device override closed in the saved isolated local place. No permanent Roblox upload occurred. F-059/F-064 and 0/3 independent reviews remain open.
