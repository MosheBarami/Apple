# Billing authority edge cases — 2026-09-18

## Scope

Local source/test follow-through only. No Stripe/model/network calls, account changes, remote SQL,
credentials, deployment, or paid operations were performed. This pass changed
`apps/worker/src/billing-origin-authority.ts`, the existing authority flow in
`apps/worker/src/do/quota.ts`, and the focused test. The QuotaDO sequence/replay schema and existing
idempotency mechanism were preserved.

## Reproduced defects

Before the fix, the focused red run was:

```text
node --test --test-name-pattern='canceled, unpaid|subscription lookup is bounded|authority reply' tests/billing-origin-authority.test.mjs
3 tests, 0 pass, 3 fail
```

The three failures demonstrated distinct boundaries:

1. A current Stripe subscription that was `canceled`, `unpaid`, or past `current_period_end` resolved
   to enforced `plan: "free"` while correctly retaining its purchased tier in
   `subscription.plan`. The replica validator required those two fields to be identical and rejected
   the legitimate mutation, so Apple could apply the demotion while the compatibility namespace
   failed to converge.
2. An oversized Stripe response rejected from `Content-Length` left its body stream uncancelled.
   The previous unknown-length path also used `response.text()`, which materialised the entire body
   before enforcing the byte limit and had no body-read deadline.
3. `invokeBillingAuthority()` treated missing `mutation` and `replayed` fields as
   `{ replayed:false, mutation:null }`, so a malformed `{ok:true}` acknowledgement was
   indistinguishable from an intentional ignored-event no-op.

A second red-first check covered subscription identity after re-subscription:

```text
node --test --test-name-pattern='delayed cancellation for old subscription A' tests/billing-origin-authority.test.mjs
1 test, 0 pass, 1 fail: expected 409, actual 200
```

The authority correctly re-read old `sub_A`, but that only proved `sub_A` was currently canceled. It
did not prove `sub_A` was still the subscription current for the account. After active `sub_B` had
already replaced it, the delayed A event was therefore able to overwrite B with free entitlement.

## Implemented behavior

Subscription mutation validation now distinguishes the Stripe purchase record from the entitlement
being enforced. A `free` entitlement may retain a valid purchased tier such as `builder` or `studio`
in the full subscription snapshot. Any elevated entitlement must still equal that purchased tier and
must carry an entitling Stripe status (`active`, `trialing`, or `past_due`). Thus a canceled/unpaid
snapshot cannot claim a paid entitlement, and `studio` cannot be asserted over a `builder` source
record.

The validator deliberately does not compare `currentPeriodEnd` against the current wall clock.
Authority resolution already computes the effective entitlement at the time Stripe is re-read. The
same validator is later used for a stored, sequenced replay; making validation depend on a later clock
would invalidate an exact mutation merely because its once-future period end had since elapsed. The
new replay test advances `Date.now()` past the stored period end and proves the authority returns the
same sequence/mutation without another Stripe read.

`invokeBillingAuthority()` now requires an explicit boolean `replayed` field and an explicit
`mutation` field. A null mutation is accepted only as the explicit non-replay no-op shape. A non-null
mutation must pass the full mutation validator and its `sourceEventId` must equal the Stripe event id
the caller actually sent. Missing fields, wrong types, `replayed:true` with null, or a valid mutation
for a different source event all fail closed.

Bounded JSON reads now stream through a reader with all three independent bounds: maximum decoded
body bytes, maximum 1,024 reads, and a 5-second body-read deadline. Declared oversize/invalid lengths,
read-limit failures, byte-limit failures, and deadline failures cancel the response body. Error text
remains generic and does not include provider bodies, thrown transport detail, Stripe secrets, or
response content.

The mutation wire shape and exported helper signatures are unchanged. Main-owned route code does not
need a payload migration for this follow-through.

QuotaDO now fences a resolved subscription against the full subscription record it already stores.
When the ids differ, the replacement is accepted only when the stored subscription no longer
entitles at the current time and the newly resolved subscription does entitle. This permits an
ordinary A-canceled/expired -> B-active re-subscription, while refusing a late cancellation/update
for old A after B is already active. The refusal is the existing authority error path with
`billing_subscription_superseded`/409; no new mutation kind or replay-sequence semantics were added.

Replay lookup still runs before provider resolution and before the cross-subscription fence. The
stored replay validator independently requires its mutation `sourceEventId` to equal the replay table
key, and the QuotaDO authority remains pinned to the first accepted user id. Tests corrupt a replay
row's embedded source event id and then send a same-subscription event attributed to another user to
prove both boundaries fail closed.

## SQLite integration coverage

The focused QuotaDO tests instantiate the production `QuotaDO` class over real in-memory SQLite.
Canceled, unpaid, and expired current Stripe states are each resolved through the authority endpoint,
applied to Apple's quota store, delivered through the real replica endpoint, and then read back from
both stores. Both enforce `free`; both retain the purchased `builder` tier and the exact Stripe status
inside the stored subscription record.

The same SQLite harness also applies active B and then delivers a late cancellation for old A with a
mocked current Stripe response selected by subscription id. The old A event is refused before a new
sequence/replay can replace B, and both authority and replica retain B. A companion test first stores
lapsed A and then active B, proving the identity fence still permits a real re-subscription.

The same suite retains the existing sequencing/idempotency proofs: concurrent provider reads are
serialised per user, stale subscription sequences cannot roll state backwards, lower-sequence credit
purchases remain additive, response loss remains retryable without double-granting, and pre-cutover
Stripe event ids retain their prior idempotency semantics.

## Green validation

Executed from `apps/worker` after the fix:

```text
node --test --test-name-pattern='canceled, unpaid|stored authority replay|mutation validation|subscription lookup is bounded|authority reply' tests/billing-origin-authority.test.mjs
5 tests, 5 pass, 0 fail

node --test tests/billing-origin-authority.test.mjs tests/billing-webhook-authority.test.mjs
35 tests, 35 pass, 0 fail

node --test tests/billing-subscription.test.mjs tests/billing-persistence.test.mjs
37 tests, 37 pass, 0 fail

pnpm run typecheck
tsc --noEmit, exit 0

git diff --check -- src/billing-origin-authority.ts tests/billing-origin-authority.test.mjs src/do/quota.ts
exit 0
```

An additional broad `node --test tests/billing*.test.mjs tests/quota*.test.mjs` run is currently red
on the main-owned `tests/billing-route.test.mjs` case `entitlement is recomputed, not taken from the
event`. That test source-pins the former public-route expression
`entitlementFor(outcome.subscription)`; the current main-owned route delegates recomputation to the
billing authority helper instead. The focused real-route integration above exercises the replacement
boundary and is green. This follow-through did not edit that route test.

The public-route integration test above is main-owned. Its current local version uses the real app,
real QuotaDO class, and two SQLite-backed quota stores; it includes cancellation/expiry convergence
and strict authority acknowledgement cases. Passing it here verifies that the helper tightening is
compatible with that current integration. This remains local evidence only; no deployed worker or
live Stripe configuration was inspected or changed by this pass.
