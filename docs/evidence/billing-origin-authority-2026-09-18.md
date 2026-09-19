# Billing origin authority — 2026-09-18

## Scope

Source-only investigation and bounded implementation. No Stripe account writes, product/price
changes, payments, remote data writes, credential changes, or deployment were performed.

## Measured current behavior

`golem` and `apple` each bind `QUOTA_DO` locally to `QuotaDO` in their own Worker script. Durable
Object identity therefore includes the worker namespace; the same user id addresses two independent
quota objects. D1/KV sharing does not merge those objects.

Webhook idempotency is also local to each QuotaDO. `QuotaDO.claimEvent()` reads and writes the
object-local SQLite `applied_events` table. There is no shared KV webhook latch in the current
implementation, so a second public endpoint is not being suppressed by shared KV; the two stores
can simply receive different deliveries or different outcomes.

The current `/api/billing/webhook` route awaits `quota.fetch(...)` but does not inspect the returned
HTTP status or JSON body. A QuotaDO transport that returns HTTP 500, or HTTP 200 with `{ok:false}`,
can therefore be followed by a webhook HTTP 200. Stripe then has no reason to retry that delivery.

The current route applies the subscription snapshot carried by the event. Stripe does not guarantee
webhook event ordering. A delayed older `customer.subscription.updated` or `.deleted` delivery can
therefore overwrite newer local state if it is processed later.

## Chosen authority model

`apple` is the explicit billing authority. Stripe should have one entitlement webhook destination:
the Apple public worker. Existing `golem` sessions remain compatible by mirroring each normalized
billing mutation into the existing golem QuotaDO namespace; no Durable Object namespace is moved or
renamed.

For a subscription event, the authority re-reads that exact subscription from Stripe while handling
the user inside Apple's QuotaDO serialization boundary. It verifies the returned subscription id and
`metadata.userId`, parses the state through the existing `billing.ts` functions, computes current
entitlement, and derives an idempotency id from the normalized current state. Different delayed
Stripe events that resolve to the same current state therefore produce the same mutation id.

For a one-off credit purchase, there is no provider re-read. The signed `checkout.session.completed`
event is the purchase fact, and its Stripe event id becomes the namespaced idempotency key.

After Apple applies the mutation locally, the webhook route sends the same normalized mutation to
the existing golem QuotaDO through an external Durable Object binding. The webhook succeeds only
after both targets return 2xx JSON with `ok:true`. If golem delivery fails after Apple succeeds,
Stripe retries; Apple's local apply is a replay, but the route still retries the golem delivery.

This keeps both existing quota stores converged while old sessions are still routed through golem.
It does not move DO storage or require a bulk data migration.

## Implemented helper contract

New file: `apps/worker/src/billing-origin-authority.ts`.

Exports:

- `BILLING_AUTHORITY_WORKER = 'apple'`
- `BILLING_REPLICA_WORKER = 'golem'`
- `resolveBillingAuthorityMutation(event, env, fetcher?, nowSeconds?)`
- `quotaRequestForBillingMutation(mutation)`
- `deliverBillingMutation(target, mutation, worker)`
- `invokeBillingAuthority(authorityStub, event)`
- `isBillingMutation(value)`

Provider and DO responses are bounded and JSON-only. Provider failure bodies and thrown transport
messages are not reflected into the helper's errors. Stripe API credentials are used only on the
fixed `api.stripe.com/v1/subscriptions/<id>` read and are not included in QuotaDO mutation payloads.

## Required integration owned by the main agent

1. Add a private `POST /billing-authority` branch to `QuotaDO`. It should call
   `resolveBillingAuthorityMutation()` inside that per-user DO, apply a non-null mutation to the same
   local QuotaDO, and return `{ok:true,replayed,mutation}`. It must return non-2xx on resolution or
   local-apply failure. The user id in the mutation must match the DO selected by the route.
2. Change the verified webhook route to address Apple's authority QuotaDO for `outcome.userId`, call
   `invokeBillingAuthority()`, then always attempt the golem replica for a non-null returned mutation
   using `deliverBillingMutation()`. Do not skip replica delivery merely because authority reports
   `replayed:true`.
3. In `wrangler.apple.jsonc`, add an external Durable Object binding for the existing golem quota
   namespace using `class_name: "QuotaDO"` and `script_name: "golem"`. Cloudflare Wrangler treats a
   DO binding whose `script_name` differs from the current worker as a remote Durable Object binding.
4. Keep Stripe entitlement webhook configuration canonical to the Apple endpoint. Do not configure
   a second entitlement endpoint on golem as a replication mechanism. Existing golem sessions are
   covered by the explicit DO replica write above.
5. Add the binding type to `Env` and route tests proving a replica failure causes webhook non-2xx,
   then a replay retries the replica and succeeds.

## Validation run

From `apps/worker` on 2026-09-18:

```text
node --test tests/billing-origin-authority.test.mjs
13 tests, 13 pass, 0 fail

npx tsc --noEmit --project tsconfig.json
exit 0
```

The 13 helper tests cover named authority/replica selection, out-of-order subscription snapshots,
delayed deletion, deterministic replay ids, changed-state ids, subscription/user mismatch refusal,
provider failure secrecy, response size/content-type bounds, additive-credit event identity, mutation
secret boundaries, DO non-2xx/invalid-ack handling, partial-delivery replay, and authority transport
validation.

These tests prove the new helper contract only. They do not prove Stripe account configuration,
Cloudflare binding configuration, the live webhook route, or a deployed environment until the main
agent wires and tests those boundaries.

## Follow-through: QuotaDO authority and replica are implemented

The helper-only status above is superseded for the QuotaDO boundary by the follow-through work in
this same file set. `QuotaDO` now owns two private internal endpoints:

- `POST /billing-authority` serialises billing work for that user across the yielding Stripe
  subscription GET. A new actionable Stripe event receives a persisted, monotonically increasing
  `authoritySequence`. The exact sequenced mutation is stored by Stripe source event id before local
  apply. A retry returns that stored mutation and sequence instead of reading Stripe again.
- `POST /billing-replica` accepts only a validated sequenced mutation. Subscription mutations are
  fenced by the highest applied subscription authority sequence, so an older delivery cannot roll
  plan/status/cancellation state backwards. An already-superseded subscription mutation is
  acknowledged as `{ok:true, stale:true}` with the newer sequence because the replica is already
  converged; retrying that old state forever would not improve it.

Credits deliberately do not use the subscription stale fence. They are additive purchase facts, so a
credit mutation that arrives after a numerically newer subscription mutation still applies. Existing
`applied_events` idempotency remains the money guard. Authority mutations keep Stripe's original event
id rather than introducing a new namespaced id, so a purchase already applied by the pre-cutover
direct webhook is a replay instead of a second grant.

The authority sequence is persisted in Durable Object storage. Exact replay mutations are persisted
in the local `billing_authority_replays` SQLite table and pruned on the same 35-day horizon used for
Stripe event/ledger retention. The latest applied subscription sequence is persisted independently
for the authority and replica roles. A crash after local apply but before advancing that fence is
safe: retry reaches the existing `applied_events` row, performs no second mutation, then advances the
sequence.

### Exact main-agent wiring contract

`index.ts`, `env.ts`, and Wrangler configuration remain main-agent owned. The public signed webhook
must keep the existing dunning interpretation/notification path, then for an actionable
`interpretStripeEvent(event, env).userId`:

1. Address Apple's local `QUOTA_DO` by that user id and await
   `invokeBillingAuthority(authorityStub, event)`.
2. If its returned `mutation` is non-null, address `LEGACY_QUOTA_DO` by the same user id and await
   `deliverBillingMutation(replicaStub, mutation, BILLING_REPLICA_WORKER)`.
3. Only after both awaits succeed may the public webhook return HTTP 2xx. A
   `BillingAuthorityError` from either helper must become a non-2xx response; a thrown transport
   failure must also remain non-2xx. Do not skip step 2 when `replayed === true`, because that is the
   recovery path after Apple committed and the golem response/write failed.
4. `LEGACY_QUOTA_DO` is the external Durable Object binding to `class_name: "QuotaDO"` in
   `script_name: "golem"`. No shared KV dedupe is part of this path.
5. A null authority mutation is an intentional no-op for entitlement. Dunning remains handled by the
   existing dunning reader; credit purchases remain mutations and therefore still replicate.

The replica acknowledgement contract is strict. A normal/replayed apply returns the mutation's own
`authoritySequence`. A stale subscription acknowledgement returns a strictly greater sequence.
Network failure, non-2xx, non-JSON, `{ok:false}`, or an impossible sequence acknowledgement makes
`deliverBillingMutation` throw, so the public webhook cannot honestly answer success.

### Follow-through validation

Executed from `apps/worker` after the QuotaDO integration:

```text
node --test tests/billing-origin-authority.test.mjs
18 tests, 18 pass, 0 fail

node --test tests/billing-persistence.test.mjs tests/quota-spend.test.mjs tests/billing-subscription.test.mjs
47 tests, 47 pass, 0 fail

node --test tests/billing*.test.mjs tests/quota*.test.mjs
242 tests, 242 pass, 0 fail

npx tsc --noEmit --project tsconfig.json
exit 0
```

The executed QuotaDO tests instantiate the production `QuotaDO` class over a real in-memory SQLite
database through Node's `node:sqlite` adapter (the same thin `ctx.storage.sql` shape used by the
repository's SessionDO SQLite harness). They cover concurrent subscription events with a deliberately
blocked first Stripe GET (maximum one provider read in flight), monotonic sequences, subscription
replica out-of-order delivery, a lower-sequence credit arriving after a newer subscription, exact
authority replay after the replica committed but its response was lost, legacy-event-id rollout
idempotency, and dunning-only entitlement inertia. No test calls Stripe's network.

This work is source/test evidence only. It does not establish that the main-owned webhook route,
external `LEGACY_QUOTA_DO` binding, Stripe endpoint configuration, or a deployment has been changed
or verified live.
