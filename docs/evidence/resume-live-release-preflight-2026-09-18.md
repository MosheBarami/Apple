# Resume live release preflight — 2026-09-18

Read-only production preflight for the current Apple/Golem Worker rollout. No deployment, config
write, secret write/read, remote SQL, customer/project/chat access, model call, upload, or browser
mutation was performed in this lane.

## Scope and database prerequisite

Main supplied the immediately preceding read-only Supabase audit from 2026-09-18 20:28Z. This lane
did **not** rerun SQL. That audit reported all ten ledger migration SHAs matching (including 0009 and
0010), both membership-outbox consumers enabled and configured, queue depth 0, ledger RLS enabled,
and no ledger table grant to `anon` or `authenticated`.

The checks below start at the Worker/release boundary: Cloudflare's active deployment metadata,
binding **names/types only**, public health responses, and bounded public static bytes.

## Wrangler and active production versions

Wrangler used: `4.127.1`, authenticated through the already-authorized local Wrangler profile.
No credential file was opened.

At approximately 20:33Z, `wrangler deployments status` reported:

| Worker | Active deployment | Deployment created | Active version | Version number | Traffic |
|---|---|---|---|---:|---:|
| `apple` | `d58bf644-13fb-4836-91b1-45c37d840a55` | `2026-09-18T04:30:25.075521Z` | `a67537e8-1599-4694-91c5-a0709a287664` | 39 | 100% |
| `golem` | `9cfd7be5-ad80-431d-b8f6-1fd5651867cc` | `2026-09-15T17:22:49.383739Z` | `1600e4ec-6035-4d40-bacb-9cf8b3fb20d8` | 95 | 100% |

The active-version binding inventory was filtered before display to these release-relevant names:

- `LEGACY_QUOTA_DO`
- `BILLING_WORKER_NAME`
- `MEMBERSHIP_OUTBOX_TOKEN`
- `MEMBERSHIP_OUTBOX_CONSUMER`
- `SENTRY_DSN`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_BUILDER`
- `STRIPE_PRICE_STUDIO`
- `STRIPE_PORTAL_CONFIGURATION`

For **both active versions**, the filtered binding list was empty. This is a live-version observation,
not an inference from the checked-in Wrangler files. In particular, the currently active Apple
version does not yet have the new external `LEGACY_QUOTA_DO` binding or the explicit
`BILLING_WORKER_NAME` binding, and neither active Worker version exposes the outbox, Stripe, or
Sentry binding names above.

The checked-in current source/config expects a newer topology:

- `wrangler.apple.jsonc`: `BILLING_WORKER_NAME="apple"`,
  `MEMBERSHIP_OUTBOX_CONSUMER="apple"`, and `LEGACY_QUOTA_DO` bound to class `QuotaDO` in script
  `golem`.
- `wrangler.jsonc`: `BILLING_WORKER_NAME="golem"` and
  `MEMBERSHIP_OUTBOX_CONSUMER="golem"`; it deliberately has no `LEGACY_QUOTA_DO` binding.
- `Env` declares the purpose-scoped `MEMBERSHIP_OUTBOX_TOKEN`, Stripe billing bindings, and
  `SENTRY_DSN`. Their values are deployment-specific and were not read here.

`SENTRY_DSN` is explicitly optional in source: unset is a supported state and changes observability,
not request behavior. `STRIPE_PORTAL_CONFIGURATION` is also optional in the transport; if absent,
Stripe's default portal configuration is used. The Stripe signing/API key and tier price identifiers
are the material billing bindings when billing is enabled.

## Current billing-authority source contract

Current source fixes the billing roles in `billing-origin-authority.ts`:

- authority: `apple`
- replica: `golem`

`/api/billing/webhook` checks the deployment role before applying money. It refuses with 503 unless
`BILLING_WORKER_NAME` is `apple` **and** `LEGACY_QUOTA_DO` exists. A valid Apple event is applied to
Apple's own `QUOTA_DO`, then the acknowledged mutation is delivered to the Golem QuotaDO through
`LEGACY_QUOTA_DO`. The route does not answer success until both stores acknowledge. This is why the
Golem Worker/QuotaDO namespace must remain available during this migration.

Current source SHA-256 identities for this preflight:

| File | SHA-256 |
|---|---|
| `apps/worker/src/index.ts` | `e69ff33d3938f20c8f7626a2904f25600168df7c85cea0b696062b4730042359` |
| `apps/worker/src/billing-origin-authority.ts` | `1155b3be5e714e4a29c048ed75751fff22e1ae39eb2cbcf85f7f3c9893264824` |
| `apps/worker/src/membership-access-outbox.ts` | `3fc62b6637b139f05042d7d878e0a78cbc4e1a0ffeef694928f22d0b62db0848` |
| `apps/worker/src/env.ts` | `d90af885ed33543b678085ac613fc51623dbe6145d00de5f6633c5071aa94dcd` |
| `apps/worker/wrangler.apple.jsonc` | `f053584ca47affb68c2a29868a16cee7423b0851b9ff15abc737096f167ba564` |
| `apps/worker/wrangler.jsonc` | `7e385d3494d02ee487811dd114ac1a9318d40dd02682c787b0272987abe31ef3` |
| `infra/deploy-worker.mjs` | `d68872a02e5314276bafc7d13430c0707b1c9a21ce262da5d0bb711370286e6c` |

The checkout is currently at git base `6d7a5be` with a dirty working tree. A `-dirty` health stamp
therefore identifies only the base commit plus the fact that uncommitted bytes existed; it cannot
uniquely identify which dirty source bytes were deployed.

## Public health observation

Both health endpoints returned HTTP 200 and product version `0.1.0`:

| Worker | Public `buildSha` | Raw response SHA-256 | Normalized SHA-256 without `time` |
|---|---|---|---|
| Apple | `6d7a5be-dirty` | `74a815068a1578ef50970a907f17a15d4fe34b435e85abb21354b8e971a85eb5` | `ef7fdcb4bfdf2b604bef902e2e83b85a29767efead6dc095dc7b770d6129bedc` |
| Golem | `e0926cf` | `73180634dd6357720a8fb751237ca6739fe7a09a5d36d87e89d3c50c154deac1` | `ac8ace15e692dd19755743763599f2e5e1321658903ad17be50986101c9258fd` |

The raw hashes include the changing health `time` field and are only receipts for these exact reads.
The normalized fingerprints intentionally remove that field. Apple naming the current base commit as
`6d7a5be-dirty` does **not** prove the current dirty checkout is what version 39 contains; the active
Cloudflare version ID is the stronger live identity.

## Bounded public static-byte comparison

The public root was fetched from each Worker with a 1 MiB response cap. Both returned 9,938 bytes and
were byte-identical to each other and to the current local site build:

- Apple `/`: `94c0a2f24cdcfd2654659c6fbf2748fa9e9598ec0f2b8e3ae3156ce453e1d241`
- Golem `/`: `94c0a2f24cdcfd2654659c6fbf2748fa9e9598ec0f2b8e3ae3156ce453e1d241`
- `apps/site/dist/index.html`: same SHA-256

That HTML contains one local JS/CSS reference in the bounded scan, the CSS asset
`/_astro/index.DzHJKUkz.css`. It was fetched from both domains with a 1 MiB cap; each response was
5,558 bytes and matched the local build exactly:

- Apple CSS: `69bf057cbf339de1c7ada2fa1e2ce0885b7e41fce8f0694ea01e6cede7d5499f`
- Golem CSS: same SHA-256
- `apps/site/dist/_astro/index.DzHJKUkz.css`: same SHA-256

This establishes no drift for the root HTML and that referenced CSS asset only. It is not a checksum
of every static row in D1 and not a visual/browser acceptance result.

## Deploy prerequisites from the current source

The database-side prerequisite is already reported green by main's 20:28Z audit. The Worker-side
prerequisites are not yet present in either active version and must be satisfied before activating
the current source:

1. **Membership outbox on both Workers.** Each deployment needs its own raw
   `MEMBERSHIP_OUTBOX_TOKEN` matching its already-configured Supabase digest, plus the checked-in
   `MEMBERSHIP_OUTBOX_CONSUMER` value (`apple` or `golem`). The tokens must remain distinct. Source
   fails the scheduled claim closed when these are absent or do not match the DB-side consumer.
2. **Apple billing authority.** Apple needs `BILLING_WORKER_NAME=apple` and the external
   `LEGACY_QUOTA_DO -> golem/QuotaDO` binding in the same active version. Billing must not be enabled
   until the Apple deployment also has its Stripe webhook signing secret, Stripe API key, and the
   Builder/Studio price identifiers required by the billing routes. The portal configuration is
   optional in code but should be deliberately set if the product is relying on specific portal
   capabilities rather than Stripe's dashboard default.
3. **Golem role.** Golem needs `BILLING_WORKER_NAME=golem` and its own outbox consumer/token. It must
   remain deployed because Apple's authority currently replicates every committed billing mutation
   into Golem's existing QuotaDO namespace.
4. **Billing endpoint ownership.** Before activating the new Golem revision, confirm the external
   Stripe webhook/billing traffic is owned by Apple. The new Golem code is intentionally not a second
   billing authority; its webhook path will fail closed instead of applying money independently.
5. **Sentry.** `SENTRY_DSN` is absent from both active versions, but source explicitly supports that
   state. Configure it if release observability is desired; do not treat its absence as a functional
   billing/outbox blocker.

## Safe rolling order

The general authority design requires Apple to remain paired with a compatible Golem replica, but the
**current live versions add an extra ordering constraint**. The public Golem health endpoint reports
build `e0926cf`; that commit exists in this checkout, and its `QuotaDO.fetch()` has `/billing`,
`/billing-customer`, and `/grant-credits` handlers but **no `/billing-replica` handler**. The current
source adds `/billing-replica` at `apps/worker/src/do/quota.ts`. Therefore the existing Golem deployment
cannot be treated as a compatible replica for the new Apple authority.

The earlier generic Apple-first sequence is safe only after the currently-live Golem version has been
replaced by a revision that implements `/billing-replica`. For the concrete state observed in this
preflight, use this conditional order instead:

1. **Keep billing disabled.** Both active Worker versions currently lack the Stripe webhook/API/price
   binding names in their Cloudflare version metadata, so do not configure or cut over Stripe while
   either side of the authority/replica pair is still incompatible.
2. Keep the already-validated Supabase migrations/consumers in place. Use the existing ignored release
   files/tokens that main has already located to verify readiness read-only; do not regenerate outbox
   credentials merely for this rollout. Each Worker still needs its distinct
   `MEMBERSHIP_OUTBOX_TOKEN` and matching consumer identity when its new revision becomes active.
3. Deploy **Golem first** with the current source/config so its QuotaDO namespace gains the
   `/billing-replica` handler, `BILLING_WORKER_NAME=golem`, and the Golem outbox consumer/token. Keep
   Stripe disabled. Verify the new Golem active version, safe binding names, health stamp, and outbox
   readiness before proceeding.
4. Deploy **Apple second** with `BILLING_WORKER_NAME=apple`, its own outbox consumer/token, and
   `LEGACY_QUOTA_DO -> golem/QuotaDO`. Keep Stripe disabled until the Apple active version and the
   external legacy binding are verified. At this point both sides of the billing transport are
   compatible, but no external billing event needs to have been accepted yet.
5. **Only after both Worker revisions are verified**, configure/enable the Stripe webhook/API/price
   bindings and perform the main-owned external billing cutover so Stripe webhook traffic targets
   Apple. Apple may then sequence the authoritative mutation and deliver it to a Golem replica that
   is known to implement `/billing-replica`.
6. Re-run the read-only post-deploy checks: Cloudflare active version IDs and safe binding names,
   both public health stamps, and the Supabase outbox/ledger audit. The queue should return/remain at
   zero after scheduled consumption. This lane does not prescribe a paid transaction as a release
   probe.

Why this order matters: deploying/cutting billing to the new Apple authority while the old Golem
`e0926cf` QuotaDO is still live could let Apple apply the authority mutation and then receive a failed
or non-acknowledging replica response. Current Apple source correctly turns that partial delivery into
a 503 so Stripe retries, but the safer release procedure is to make the replica protocol compatible
before enabling an authority that depends on it.

The checked root HTML/CSS already match local `apps/site/dist`, so this backend authority rollout does
not require a static-site redeploy on the evidence observed here. Any later UI changes remain a
separate static/browser acceptance lane and should follow backend readiness.

## Read-only commands used

No command below contains a credential or secret value.

```sh
node_modules/.bin/wrangler --version

node_modules/.bin/wrangler deployments status --name apple --json \
  | jq '{id,created_on,source,strategy,versions:(.versions|map({version_id,percentage}))}'
node_modules/.bin/wrangler deployments status --name golem --json \
  | jq '{id,created_on,source,strategy,versions:(.versions|map({version_id,percentage}))}'

node_modules/.bin/wrangler versions view a67537e8-1599-4694-91c5-a0709a287664 --name apple --json \
  | jq '{id,number,requiredBindings:(.resources.bindings|map(select(.name=="LEGACY_QUOTA_DO" or .name=="BILLING_WORKER_NAME" or .name=="MEMBERSHIP_OUTBOX_TOKEN" or .name=="MEMBERSHIP_OUTBOX_CONSUMER" or .name=="SENTRY_DSN" or .name=="STRIPE_WEBHOOK_SECRET" or .name=="STRIPE_SECRET_KEY" or .name=="STRIPE_PRICE_BUILDER" or .name=="STRIPE_PRICE_STUDIO" or .name=="STRIPE_PORTAL_CONFIGURATION")|{name,type,class_name,service}))}'
node_modules/.bin/wrangler versions view 1600e4ec-6035-4d40-bacb-9cf8b3fb20d8 --name golem --json \
  | jq '{id,number,requiredBindings:(.resources.bindings|map(select(.name=="LEGACY_QUOTA_DO" or .name=="BILLING_WORKER_NAME" or .name=="MEMBERSHIP_OUTBOX_TOKEN" or .name=="MEMBERSHIP_OUTBOX_CONSUMER" or .name=="SENTRY_DSN" or .name=="STRIPE_WEBHOOK_SECRET" or .name=="STRIPE_SECRET_KEY" or .name=="STRIPE_PRICE_BUILDER" or .name=="STRIPE_PRICE_STUDIO" or .name=="STRIPE_PORTAL_CONFIGURATION")|{name,type,class_name,service}))}'

curl -sS -L --max-time 15 --max-filesize 65536 -o /tmp/apple-health.json \
  https://apple.moshe-barami111.workers.dev/api/health
curl -sS -L --max-time 15 --max-filesize 65536 -o /tmp/golem-health.json \
  https://golem.moshe-barami111.workers.dev/api/health

curl -sS -L --max-time 15 --max-filesize 1048576 -o /tmp/apple-root.html \
  https://apple.moshe-barami111.workers.dev/
curl -sS -L --max-time 15 --max-filesize 1048576 -o /tmp/golem-root.html \
  https://golem.moshe-barami111.workers.dev/
curl -sS -L --max-time 15 --max-filesize 1048576 -o /tmp/apple-root.css \
  https://apple.moshe-barami111.workers.dev/_astro/index.DzHJKUkz.css
curl -sS -L --max-time 15 --max-filesize 1048576 -o /tmp/golem-root.css \
  https://golem.moshe-barami111.workers.dev/_astro/index.DzHJKUkz.css

shasum -a 256 /tmp/apple-health.json /tmp/golem-health.json
shasum -a 256 /tmp/apple-root.html /tmp/golem-root.html /tmp/apple-root.css /tmp/golem-root.css
shasum -a 256 apps/site/dist/index.html apps/site/dist/_astro/index.DzHJKUkz.css
```

## Limits

This preflight did not read deployment credential values, inspect customer data, execute remote SQL,
call an AI/model provider, perform a paid billing action, deploy a Worker, write a Cloudflare config,
or validate browser/native-widget/visual behavior. Active Cloudflare version IDs plus the filtered
binding inventory are the live Worker facts; checked-in config and source describe the intended next
revision, not what production is currently running.
