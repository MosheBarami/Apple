# Explicit tool workflow termination — 2026-09-26

## Measured failure

Repair 322b3b0d-7a8c-4a38-b789-8c05b886d9af requested exactly read_script, edit_script, finish. It executed 27 tools, repeated its completion text and cost 160 Credits / 4,773 neurons before operator Stop. Generic missing-part and visual/autonomous continuation paths could enlarge that finite request.

## Change

78f3320 recognizes an explicit standalone instruction such as `Exactly read_script then edit_script then finish.` using registered tool names. The provider is offered only the next requested tool, intersected with existing permissions/capabilities. The execution boundary stops an unexpected call before Studio. Persisted successful trace completes the workflow immediately, before another model call or automatic visual/whole-game steer. Failure or prose without the next call stops incomplete. It does not create wider permissions or claim gameplay verified. Automatic rollback checkpoints remain; full-game requests retain ordinary autonomy. Recognition currently covers this English named-tool syntax, not arbitrary natural-language limits.

## Validation

Four sequence tests plus real SessionDO regressions: 37 focused tests passed. Disabling the persisted completion guard made the real-session regression fail specifically because it purchased another model call; restoring it passed. The session tests also prove out-of-sequence tools cannot reach Studio, failures do not retry and eviction does not reset the allowance. Full worker suite: 4,214 passed, zero failed, four skipped. TypeScript noEmit passed.

Deployed a clean git archive through infra/deploy-worker.mjs; deployment verifier and independent /api/health both returned buildSha78f3320 at 05:29 UTC.

## Live product evidence

Chrome Apple MAX / Agent / Autonomous, paired Studio1.4.3:

- Run65446263-b82f-4c96-8a30-86779e5e6e0a: exactly one successful read_script, done, idle and zero queue without operator Stop. 4 Credits, one model event, 120 neurons. No mutations.
- Runca69888b-1869-4cfc-a0dc-593615ceace7: requested read+edit readiness toast. Provider returned prose instead of calling a tool. Stopped incomplete with zero tool trace. Gross5 Credits refunded, net0; one model event141 neurons.
- Runfc63fdc1-bccf-4700-8cf2-19cd765b15d4: simpler read+edit request also returned no tool. Stopped incomplete with zero tool trace. Gross3 Credits refunded, net0; one model event71 neurons.

These prove live one-tool termination and failure termination, not successful two-tool editing in production. No new toast edit or native Play occurred in these probes. Total provider usage332 neurons; net customer debit4 Credits. The earlier functional Tulip loop proof remains valid, but readiness feedback and commercial visuals are open. Studio was left visibly inspect-only; no active Apple run or queued operation remains.

Private runtime evidence: /private/tmp/apple-sequence-provider.json, /private/tmp/apple-flower-messages.json, /private/tmp/apple-sequence-red.log, /private/tmp/apple-sequence-green.log, /private/tmp/apple-sequence-worker-tests.log, /private/tmp/apple-sequence-deploy.log. Raw runtime files remain private.
