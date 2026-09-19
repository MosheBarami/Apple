# SaaS readiness follow-through — 2026-09-18

This is a read-only follow-through on paid checkout, Sentry, and Supabase/RLS readiness. It records
what the repository requires, what the two live Cloudflare Workers expose, and what could be read
from the connected Supabase project without changing any account or customer data.

Audit window: 2026-09-18 13:23–14:10 UTC. Repository HEAD was
`6d7a5bec3a741de9cbe97459bcc82e760bd3e089` in a dirty shared checkout. Other workers were editing
the backend during this audit, so every local outbox result below names its source fingerprint. No
provider purchase, subscription, credential change, account mutation, deployment, remote SQL write,
or customer-chat read was performed. Secret values were
neither printed nor copied into this document.

## Release decision

| Area | Current live state | Release blocker |
|---|---|---|
| Paid checkout | **Closed** | Both active Workers lack every Stripe binding used by the checkout path. Stripe products/prices, Tax, portal configuration, webhook endpoints, event selection, signing secrets, and live/test mode could not be read from an account connector and remain unverified. The two live hostnames also own separate `QuotaDO` namespaces, so a single webhook endpoint cannot keep both entitlement stores current. |
| Worker error capture | **Off** | `SENTRY_DSN` is absent from both active Worker versions. The reporter is implemented and tested, but no live error can reach Sentry without this binding. |
| Browser error capture | **Off** | The served SPA bundle contains no Sentry DSN, Sentry host, client identifier, envelope content type, or global rejection handler. `VITE_SENTRY_DSN` was not present when the live bundle was built. |
| Supabase base schema/RLS | **Usable with known drift** | The connected project is healthy and the live schema contains the collaboration/lifecycle, pinning, and tagging changes. Existing same-day evidence found RLS enabled on every public table and self-falsified owner isolation, but the migration ledger and live schema disagree, `usage_events` still uses `sparks`, and the same evidence records several hardening findings. |
| Membership outbox migration 0009 | **Locally verified; not live** | The final local migration/transport/SessionDO snapshot passed focused ordering, token, expiry, TypeScript, and PostgreSQL/RLS checks. None of its tables or RPCs exists in the connected project, and neither live Worker has the outbox consumer binding or token. Migration-first rollout is mandatory because the new Worker reads `membership_access_state` on the request path and fails closed when that authority cannot be read. |

The application is behaving consistently with those facts: both public pricing pages say paid
checkout is not open, and both reporters treat a missing DSN as an intentional no-op. This is a
safe closed state. It is not a production-ready paid/monitored state.

## Connected live observations

### Cloudflare Workers

Read-only Wrangler deployment/version inspection found two active Workers:

- `apple`: active version `a67537e8-1599-4694-91c5-a0709a287664`, observed at 100% traffic. Public
  `/api/health` returned 200 with `buildSha: 6d7a5be-dirty`.
- `golem`: active version `1600e4ec-6035-4d40-bacb-9cf8b3fb20d8`, observed at 100% traffic. Public
  `/api/health` returned 200 with `buildSha: e0926cf`.

Both active versions expose the ordinary runtime variables `BUILD_SHA`, `ENVIRONMENT`,
`SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Both lack all of the following bindings:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BUILDER`
- `STRIPE_PRICE_STUDIO`
- `STRIPE_PORTAL_CONFIGURATION`
- `SENTRY_DSN`
- `MEMBERSHIP_OUTBOX_TOKEN`
- `MEMBERSHIP_OUTBOX_CONSUMER`

The secret-list read returned binding names only. No secret values were requested or displayed.

The two live origins served byte-identical product surfaces during the audit:

- `/pricing`: 39,843 bytes, SHA-256
  `71d0e422f6e2d9851ff20b5fac3f37ff6ea45b9dfc78d4782c5f5ba68dcd16a6` on each origin. The page
  contains the closed-checkout copy.
- `/app/`: 1,797 bytes, SHA-256
  `bed179d0407c0df695a9567dff24777f4d78ebcc3e216a95d4045856af5a3ea3` on each origin, loading
  `/app/assets/index-Cg4BRK_q.js`.

An unauthenticated request to the live Apple `/api/billing/config` returned the expected 401 body
`{"error":"unauthorized"}`. The signed-in billing response was not read because no customer session
was used and the main agent owns account/browser checks.

### Served browser monitoring bundle

The served Apple SPA JavaScript was 567,720 bytes, SHA-256
`5827d78b87db5380c930b4bf6bbdb51452285fe159249a125662d80cc37c519a`. It contained none of:

- a `sentry.io` hostname;
- the browser reporter identifier `apple-web/1.0`;
- `application/x-sentry-envelope`;
- `unhandledrejection`;
- the build token `VITE_SENTRY_DSN`.

That is direct evidence that browser reporting is not merely unverified; it is absent from the
deployed bytes.

### Supabase project and schema

Read-only Supabase CLI access found project `npqvyijsvzkuwddyhtpm` (`AppleAI`) in
`ACTIVE_HEALTHY`, region `eu-central-1`, PostgreSQL `17.6.1.166`.

Generating public-schema TypeScript from that connected project produced 18,056 bytes, SHA-256
`602eb6e5e14af9afaa7e29d1d2990ffc9a6bdb94b4f1eec6d782ea10dae1626f`. The generated structure and
safe zero-row PostgREST reads established:

- `project_members` has the membership-lifecycle columns from migration 0006;
- `projects` has `archived_at`, `pinned_at`, and `tags`, including the effects of 0007 and 0008;
- `profiles` has `training_opt_in` but no `training_opt_in_at`;
- `usage_events.sparks` exists and `usage_events.credits` does not;
- `membership_access_state`, `membership_access_outbox`, `membership_outbox_consumers`,
  `membership_outbox_secret`, and every 0009 outbox RPC are absent.

The last item is decisive: migration 0009 is not deployed. It is not inferred from a ledger entry;
the live API schema and direct zero-row reads do not expose its objects.

## Checkout configuration and exact blockers

### What the source requires

The worker exposes a paid plan only when the whole path can be completed:

1. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are both required for checkout to be reported as
   configured.
2. Each plan is independently purchasable only when its matching price binding exists:
   `STRIPE_PRICE_BUILDER` or `STRIPE_PRICE_STUDIO`.
3. The public price contract is USD 12/month for Builder and USD 40/month for Studio. Those amounts
   are product copy; the Stripe Price object is what actually charges the customer and must be
   checked independently for recurring interval, currency, amount, and mode.
4. Checkout creates a subscription with one item, copies user/plan metadata to the subscription,
   requires a billing address, enables automatic Stripe Tax, enables tax-ID collection and promotion
   codes, and expires an unfinished session after one hour.
5. Entitlement is granted from signed webhook events, not from the success redirect. The webhook
   interpreter handles `customer.subscription.created`, `.updated`, `.deleted`,
   `checkout.session.completed`, and `checkout.session.expired`. Dunning also reads
   `invoice.payment_failed`, `invoice.payment_action_required`, and recovered
   `invoice.payment_succeeded` events.
6. `STRIPE_PORTAL_CONFIGURATION` is optional to Stripe but operationally required to pin the product
   promise. Without it Stripe uses the account default, which this repository cannot inspect. The
   selected portal configuration needs payment-method update, invoice history, and subscription
   cancellation enabled.

The local billing suite covered the current implementation: **191/191 tests passed** in
`/tmp/apple-worker1-billing-tests.log`. That proves request construction, signature/replay handling,
event interpretation, persistence and route behavior against fixtures. It does not prove any Stripe
account object exists or is configured correctly.

### Live blockers

1. **No live Stripe runtime configuration.** Both live Workers lack the API key, webhook signing
   secret, both Price bindings and the portal configuration binding. Checkout is therefore closed by
   construction.
2. **No account-side evidence.** There is no connected Stripe read tool in this worker session. The
   existence/mode of products and recurring Prices, Tax registration/settings, portal feature
   configuration, webhook endpoint URLs, event selection and webhook signing secrets remain
   unverified. Repository tests cannot establish them.
3. **Two public entitlement stores.** `apple` and `golem` serve the same application, but their
   Durable Object bindings are attached to different Cloudflare Worker namespaces. A Stripe webhook
   changes the `QuotaDO` reached by the hostname that received it. Checkout metadata records user and
   plan, but not a second Durable Object namespace to update. A customer can therefore be paid in one
   active origin and still appear Free in the other unless the release deliberately closes this
   split.

Before paid checkout opens, the main agent must choose and verify one of these operational shapes:

- make one hostname canonical for all signed-in/API/billing traffic and retire or redirect the other;
  or
- configure matching Stripe bindings on both Workers and register/verify webhook delivery to both
  origins, accepting the duplicate-processing design and proving both `QuotaDO` namespaces converge.

The first shape has one entitlement authority and is easier to reason about. The audit does not make
that account/routing change.

### Concrete owner sequence

Keep the current closed-checkout copy until all of these are measured:

1. In Stripe test mode, inspect or create the recurring monthly Builder and Studio Price objects and
   verify their amounts/currency against the repository contract. Record their IDs without putting
   them in git.
2. Verify Stripe Tax is enabled for the intended selling jurisdictions and that the account has the
   registrations/business details required for automatic tax. The code requesting automatic tax does
   not configure the Stripe account.
3. Create or inspect a Billing Portal configuration with payment-method update, invoice history and
   cancellation enabled; capture its `bpc_…` ID.
4. Create webhook endpoint(s) for the canonical live worker shape and subscribe to every event the
   interpreters above consume. Capture the endpoint signing secret(s).
5. Put the API key, signing secret, two Price IDs and portal configuration into the correct Worker
   configuration(s). Do not paste values into tracked JSON or this evidence file.
6. Deploy through `infra/deploy-worker.mjs`, not bare Wrangler, and verify `/api/health` on each
   intended origin.
7. With an owner-controlled test customer in Stripe test mode, complete one Builder checkout, observe
   a signed webhook updating entitlement, open the portal, cancel, and verify the account returns to
   Free from the webhook. Repeat the entitlement read on every public hostname that will remain
   active.
8. Reconcile the Stripe objects and event history before replacing test bindings with live-mode
   bindings. No live purchase is needed to prove the code path before launch.

## Sentry configuration and exact blockers

### Implemented capture boundary

The worker has an outermost Hono reporter for unhandled exceptions, explicit 5xx responses and
scheduled-handler failures. The browser has handlers for top-level errors, unhandled promise
rejections and React error boundaries. Both serialize the documented Sentry envelope directly and
are total no-ops when their DSN is missing.

The event builders use a closed allowlist and then recursively scrub strings. They do not receive a
request body, authorization header, cookie, query string, transcript, account ID, email address or
browser storage. Breadcrumbs, session replay, automatic fetch instrumentation and user context are
deliberately absent.

Focused verification against unchanged monitoring sources passed:

- worker Sentry/webhook visibility: **32/32** in `/tmp/apple-worker1-sentry-tests.log`;
- browser Sentry/wiring/scrubbing: **20/20** in `/tmp/apple-worker1-web-sentry-tests.log`.

### Live blockers

1. **Both worker reporters are off.** Neither active Worker has `SENTRY_DSN`.
2. **The browser reporter is absent from served bytes.** `VITE_SENTRY_DSN` is a Vite build-time value;
   adding a Worker secret later cannot enable the existing bundle.
3. **Project existence and event receipt are unverified.** This session has no connected Sentry
   account read tool. `docs/MONITORING.md` records that the account had zero projects when that file
   was written, but that statement is historical and was not treated as current evidence.
4. **No source-map release pipeline is configured.** `apps/web/vite.config.ts` does not enable build
   source maps, and the repository contains no Sentry CLI/release artifact upload. Events can still
   arrive, but browser stacks will be minified and harder to act on. The custom Worker reporter also
   has no release artifact upload path.

### Concrete owner sequence

1. In the Sentry account, verify or create separate Worker and Browser JavaScript projects. Their
   release/noise profiles are different and the existing monitoring design expects two DSNs.
2. Put the Worker DSN into `SENTRY_DSN` on every Worker origin that will remain active.
3. Build the SPA with `VITE_SENTRY_DSN`, the exact `VITE_BUILD_SHA`, and the intended production mode,
   then deploy the static bundle and verify that the canonical `/app/` serves the new bytes.
4. Add a source-map build/upload process tied to the same release identifier before relying on stack
   traces for production diagnosis.
5. From an owner-controlled, non-customer fixture, emit one sanitized Worker error and one sanitized
   browser error. Confirm both issues arrive with the expected project, environment, release and
   labelled route, and confirm the event has no request body, token, email, query string or project ID.
6. Verify alert routing separately. Receiving an event proves ingestion, not that a human will be
   notified.

No synthetic production error was sent during this audit.

## Supabase/RLS and migration readiness

### Current live base

The fresh connected reads establish a healthy project and the schema observations listed above.
They do not expose policy definitions or advisor output through the generated Typescript surface.
For those, this follow-through relies on the separately recorded, same-day read-only inspection in
`docs/evidence/supabase-readiness-2026-09-18.md`, and labels it as inherited evidence:

- RLS was enabled on all ten public tables inspected; nine had explicit policies and
  `studio_pairings` was default-deny with no policies.
- The repository's two-tenant harness self-falsified isolation and then restored it.
- The migration ledger stopped at 0006 even though live columns from 0007 and 0008 existed.
- The live usage column was `sparks`, while the repository's initial migration calls it `credits`.
- Advisors flagged the mutable `search_path` on `force_project_id`; the report also found broader
  SECURITY DEFINER/grant surfaces than intended, leaked-password protection disabled, and broad
  legacy table privileges.

Those are not claims that a current exploit was demonstrated. They are concrete schema/configuration
cleanup items that should be re-read after any migration work rather than copied forever.

### Migration 0009 local review

Migration 0009 and its Worker transport are new, untracked files in the shared checkout. They are
not in the live project. Local PostgreSQL proved the following design properties during this audit:

- all nine migrations apply to a clean PostgreSQL container;
- one `project_members` mutation writes the authoritative lifecycle state and fans out one outbox row
  to each enabled consumer;
- each consumer now has a distinct token digest, and a token for one consumer is refused when paired
  with the other consumer name;
- mismatched claim and acknowledgement attempts do not consume another namespace's row;
- the owner, affected subject, and a project admin can read the lifecycle state they are entitled to;
  an unrelated user cannot, and anon cannot read the queue directly;
- each correctly authenticated consumer can claim and acknowledge only its own row;
- a real `project_members` sequence of insert, expiry extension, role demotion, removal, and
  reactivation produced versions 1–5 with the expected roles, access kinds, deadlines, and one row
  per consumer per version.

The redacted runtime transcripts are `/tmp/apple-worker1-outbox-final-postgres.log` and
`/tmp/apple-worker1-outbox-lifecycle-postgres.log`.

The existing isolation harness applied all nine migrations and passed **43/43 checks** in the final
stable run. That denominator still covers its original five owner-scoped
tables; it is not by itself proof of the new queue/token behavior. The separate runtime proof above
is the evidence for the 0009 boundary.

### Final expiry, ordering, and crash-recovery result

The final local snapshot carries `expires_at` through the state row, outbox row, claim RPC,
PostgREST parser, link-grant RPC, SessionDO event, socket attachment, and active-run access check.
The Durable Object persists an immutable cursor containing version, deadline, and role/access
fingerprint before applying side effects. Lower versions are consumed as stale, an equal identical
event is re-applied for crash recovery, and an equal version with different contents is refused with
409 rather than choosing one payload.

The socket and run recovery paths also use that cursor directly. This matters in the narrow crash
window after the cursor is durable but before the ordinary socket-close/demotion and run-fence writes
complete. A current cursor saying removed, suspended, or demoted is enough to close or narrow the
socket on its next alarm or frame and to stop the run on its next alarm. A later clear does not
resurrect a run that the earlier event invalidated; the old fence is cleared only after that run
becomes idle.

A bundled real-SessionDO fixture measured the expiry boundary directly:

- shortening a live member's deadline updated the socket and stopped the existing run after the new
  earlier instant;
- extending it updated the socket and allowed the run beyond the old ingress deadline;
- a lower-version expired event was consumed as stale without changing the newer socket state;
- the same version with a different deadline was refused with 409 and preserved the accepted state;
- an already-expired newer event closed the socket, stopped the run, and scheduled the access alarm;
- crash recovery with a simultaneous role demotion and expiry change rewrote the attachment once to
  the new role and new deadline rather than restoring either old field.

The final focused run passed **39/39 tests**, Worker TypeScript passed, all nine migrations applied,
and the existing RLS harness passed **43/43 checks** on one unchanged whole-worker fingerprint:
`362c40333425e0eda6dffdef4c380b3ca7c29347ac227b20f05836a1e5f6055e`. The transcript is
`/tmp/apple-worker1-saas-final-stable.log`.

This audit did not rerun the entire Worker suite after worker2's final handoff because the prime agent
asked workers not to duplicate completed full-suite runs merely for status. If no other worker or
main-agent record covers the final source snapshot, an up-to-date full Worker run remains a release
evidence requirement; this document does not claim one.

The shared checkout continued changing outside this outbox scope after that run. The fingerprint is
the exact tested snapshot, not a claim that the entire checkout remained frozen afterward.

### Required production rollout order

Code-first rollout is unsafe. The correct order is:

1. reconcile the remote migration ledger with the already-present 0007/0008 schema so the migration
   process has one truthful starting point;
2. apply migration 0009 to Supabase;
3. generate two independent high-entropy raw tokens, write only their SHA-256 digests into the
   matching `golem` and `apple` secret rows, and keep the raw values out of SQL history and git;
4. set the matching raw `MEMBERSHIP_OUTBOX_TOKEN` secret on each Worker and confirm the tracked
   `MEMBERSHIP_OUTBOX_CONSUMER` names are correct;
5. deploy both Worker revisions through `infra/deploy-worker.mjs`;
6. verify each readiness RPC accepts only its own consumer/token pair, then perform an owner-controlled
   membership change and observe both outbox rows drain to zero;
7. verify an open socket and an in-flight member-started run react correctly to removal, demotion,
   suspension and a shortened expiry;
8. rerun the Supabase advisors and RLS isolation evidence after the production migration.

No part of that production sequence was executed here.

## Historical blocker documents

`docs/BLOCKERS.md` says it was last verified on 2026-09-01. It was read for leads only. No item from
that file is presented here as current unless it was independently observed through source, a current
test, or a connected live read. `docs/MONITORING.md` received the same treatment for its historical
statement about Sentry project count.

## Evidence and limitations

Measured logs:

- `/tmp/apple-worker1-billing-tests.log` — 191/191 billing tests.
- `/tmp/apple-worker1-sentry-tests.log` — 32/32 Worker Sentry/webhook-visibility tests.
- `/tmp/apple-worker1-web-sentry-tests.log` — 20/20 browser Sentry tests.
- `/tmp/apple-worker1-saas-final-stable.log` — 39/39 final outbox/ordering/access tests, Worker
  TypeScript, nine migrations, 43/43 existing RLS checks, and both current SessionDO expiry fixtures
  on one unchanged fingerprint.
- `/tmp/apple-worker1-outbox-final-postgres.log` — real PostgreSQL trigger fanout,
  per-consumer-token, queue-grant and lifecycle-state RLS proof.
- `/tmp/apple-worker1-outbox-lifecycle-postgres.log` — real PostgreSQL insert, deadline update,
  demotion, removal, reactivation, admin-read and ordered-claim proof.
- `/tmp/apple-worker1-session-expiry-final.log` — current bundled SessionDO deadline shortening,
  extension, stale/conflict, expiry closure and active-run proof.
- `/tmp/apple-worker1-recovery-role-expiry.log` — current crash-recovery role-plus-deadline proof.

Stable source hashes for the billing/monitoring portion:

- `apps/worker/src/billing.ts`:
  `ec7bf3a0eb41af926649119e2c08240646d967a55f3ecd4c9fcae1586ceba5a2`
- `apps/worker/src/sentry.ts`:
  `2c5c868690cf57d00f54ef8f075bde6f35b4223d2b8001b3d3f3cfa66a72de49`
- `apps/web/src/lib/sentry.ts`:
  `d475043e1121f82bd58269b3b6fb43a4d41df72a374d7ec421e4ea28f5913c80`
- `apps/web/src/main.tsx`:
  `a99648bebe949cb45506b735614a31f4b8bdc07ce0a0c22c903004a90bca25f5`
- `apps/web/vite.config.ts`:
  `8a21e8ac0c77b9c822f21659b49325540ffd4ebbf667f664b39446d813b6210f`

No Stripe or Sentry account-specific connector was available. The audit therefore does not claim
that a Stripe product, Price, webhook, Tax registration, portal configuration, Sentry project, alert
rule or ingested issue exists. Those account-side checks belong to the main agent's controlled
browser/account review. No authenticated customer API response, private customer content, secret
value, remote database row, payment, provider inference or Roblox account was used.
