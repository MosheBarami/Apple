# Selected preview insertion repair — 2026-09-26

## Reproduced product failure
The sealed garden-r1 full-game trial selected Oak Tree through the ordinary preview, but its continuation never attempted insertion and searched/building instead. The existing prose instruction was insufficient. This repair preserves the exact selected library id as durable agent state, allows two bounded preparation-only turns, then schedules insertion through the normal tool path before unrelated searching/construction. Correct model-supplied placement arguments are preserved.

Insertion still obeys access, Stop, capabilities, tool restrictions, source consent, rights and security. An actual denial ends incomplete with the failed result, no retry or detailed primitive fallback. Successful insertion releases subsequent work; it is not game completion.

## Verification
Subagent red-first: all six initial behavioral tests failed before implementation (unrelated tools ran first, prose avoided insertion, withheld insertion ended done). Parent reviewed the patch and independently ran 13 lifecycle behavior tests: all passed, including persisted state/reload, preparation bound, denial, real missing-source consent, Plan/stale choices, explicit restriction, capability withdrawal, access expiry, Stop during inference and truncated structured responses.

Parent full worker suite: **4,244 passed, four skipped, zero failed**. Parent worker TypeScript check passed. Diff whitespace check passed. No paid calls or Studio writes occurred in these tests. Deployment and live Studio verification are pending; F-059/F-064 and 0/3 release reviews remain open.
