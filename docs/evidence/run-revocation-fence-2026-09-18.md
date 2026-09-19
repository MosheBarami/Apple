# Durable run access fence

Implemented by Luna agent; root reviewed and independently verified before deploying.

Owner billing remains `AgentState.userId`; verified initiating identity and grant expiry
are stored separately, without saving JWTs. Membership removal, suspension and build-capability
demotion write a separate durable revocation mark. Alarms, model-step boundaries, Studio
enqueue and delivery check the mark/expiry. Pending run operations are purged. Regrant is
deferred until the invalidated run ends, so it cannot resume stale in-flight work.

Root validation: worker TypeScript passed; current worker test directory3249/3249 passed.
Agent reported3250 from its invocation; root records its own measured denominator, not that
larger count. Tests cover real SessionDO admission/alarm/poll/queue handling, owner billing,
legacy unidentifiable initiators, regrant and deterministic in-flight model-await fencing.
The model-await race fixture substitutes runStep's model wait; it is not a live provider or
Cloudflare scheduling experiment. Pure helper and route tests cover reasons/trusted ingress.

Root replaced a brittle exact hold-condition test with the actual extracted expression run
against all eight stop/park/queue combinations and a missing-access-fence mutant. Focused6/6.
Source scanners strip comments before inspecting the conditions.

Deployment: official `infra/deploy-worker.mjs apple` completed, Cloudflare reported active
version `a316ba77-c05c-4b03-8a52-0c6072c55b3b`; health returned `6d7a5be-dirty`.
The dirty buildSha is shared with earlier uncommitted releases, so it alone is not unique
release proof. Version activation is recorded from deployment output. No real customer's
membership or Studio place was modified to test this release.

## Residual risk

Membership notification to the Durable Object is best-effort after DB/KV changes. A failed
push can still leave an existing run alive. No durable outbox or notification retry was added;
this patch does not claim unconditional immediate revocation. Operations already delivered to
Studio cannot be recalled. Unknown legacy initiating identity is not guessed to be a member.
Closing delivery reliability and an isolated end-to-end Studio scenario remain outstanding.
