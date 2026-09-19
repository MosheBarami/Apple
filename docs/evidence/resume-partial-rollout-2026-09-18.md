# Resume partial rollout — 2026-09-18

Read-only postflight after the successful Golem Worker deployment and the subsequently blocked Apple
deployment attempt. This is **partial rollout evidence only**. No Apple deployment was retried or
repackaged in this lane, and no remote mutation, SQL, customer/project/chat access, secret-value read,
or model/provider call was performed.

## Inputs already produced by main

The successful Golem deployment is preserved in:

- `docs/evidence/deploy-golem-resume-2026-09-18.json`
- `docs/evidence/deploy-golem-resume-2026-09-18.log`

Their current SHA-256 values are:

- JSON: `2642f7299c80f72dfac07629a22413f1a740a4b283aeb3bafa952b0ce7289bb2`
- log: `e656c30ce9014ca07016704066516a921411a878257c5f89ecbb1997fbc68ab7`

That deployment record states:

- target `golem`
- process exit code `0`
- source aggregate before and after deployment both
  `d6562221c939ee672572f24f15af6401879ca24e53a5f16fb5383b83d23572a6`
- `sourceUnchanged=true`
- existing release secret names used: `MEMBERSHIP_OUTBOX_TOKEN`, `SENTRY_DSN`
- `billingKeysAdded=false`
- no token regeneration

The official Wrangler deployment log records version
`0adfa419-ba2a-4a46-a85a-feaff76ed213`, health verification at
`buildSha=6d7a5be-dirty`, and successful trigger deployment for:

- `* * * * *`
- `0 3 * * *`

Current source names the first schedule `MEMBERSHIP_OUTBOX_CRON` and routes it to
`drainMembershipAccessOutbox(env)`. The second remains the Golem-only nightly retention sweep.

The already-created read-only readiness receipt
`docs/evidence/outbox-release-readiness-2026-09-18.json` has SHA-256
`84899b44ac5405510cbd6c337f902d145d8a417bef0e35ded7bbf5d4e94d4d70` and records all four expected
token/consumer checks passing without regenerating tokens:

- Apple token → Apple consumer: ready `true`
- Apple token → Golem consumer: ready `false`
- Golem token → Golem consumer: ready `true`
- Golem token → Apple consumer: ready `false`

This proves the two existing purpose-scoped tokens are distinct and accepted only for their intended
consumer at the readiness RPC boundary. This postflight did not repeat those RPC calls.

## Current Cloudflare production state

Fresh read-only `wrangler deployments status` after the Golem deployment reports:

| Worker | Active deployment | Created | Active version | Version no. | Traffic |
|---|---|---|---|---:|---:|
| `golem` | `4954d546-e275-43ba-a242-96729ff5ac6e` | `2026-09-18T20:39:32.799799Z` | `0adfa419-ba2a-4a46-a85a-feaff76ed213` | 96 | 100% |
| `apple` | `d58bf644-13fb-4836-91b1-45c37d840a55` | `2026-09-18T04:30:25.075521Z` | `a67537e8-1599-4694-91c5-a0709a287664` | 39 | 100% |

This confirms the Golem deployment became the sole active production version and Apple did **not**
change. The Apple deployment/tool action was blocked by the platform safety check after Golem had
completed; it was not retried by this worker and there is no evidence of an Apple production change.

## Binding names and deployment roles

Fresh read-only `wrangler versions view` for Golem version 96 shows the following relevant names:

| Binding | Type | Safe observed role/state |
|---|---|---|
| `BILLING_WORKER_NAME` | `plain_text` | deployment log records value `golem` |
| `MEMBERSHIP_OUTBOX_CONSUMER` | `plain_text` | deployment log records value `golem` |
| `MEMBERSHIP_OUTBOX_TOKEN` | `secret_text` | present; value not read or printed |
| `SENTRY_DSN` | `secret_text` | present; value not read or printed |

Golem version 96 also retains the expected core bindings including `QUOTA_DO` (`QuotaDO`),
`SESSION_DO`, `PAIRING_DO`, `ADMIN_DO`, `BUDGET_DO`, `DISCORD_DO`, D1 `CORPUS`, KV `KV`, Vectorize
`VEC`, and `AI`.

The current Golem version still has **no** Stripe binding names in the filtered inventory:
`STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_BUILDER`, `STRIPE_PRICE_STUDIO`, and
`STRIPE_PORTAL_CONFIGURATION` are absent. This matches the intended partial-rollout state: billing
remains disabled while only the replica side has been upgraded.

Fresh read-only inspection of the unchanged Apple version 39 shows none of the rollout bindings:

- no `BILLING_WORKER_NAME`
- no `MEMBERSHIP_OUTBOX_CONSUMER`
- no `MEMBERSHIP_OUTBOX_TOKEN`
- no `SENTRY_DSN`
- no `LEGACY_QUOTA_DO`
- no Stripe binding names listed above

Apple therefore remains the old pre-authority deployment. It must not be described as having the new
billing authority or membership-outbox configuration.

## Golem cron observation

The official Golem deploy log says `Deployed golem triggers` and lists both configured schedules:

```text
schedule: * * * * *
schedule: 0 3 * * *
```

Wrangler `4.127.1` exposes `wrangler triggers deploy` but no read-only `triggers list` command, so this
postflight cannot independently enumerate current trigger state from the control plane through the
available CLI. The cron claim above is therefore tied to the successful official deployment log plus
the fresh observation that the exact deployed version `0adfa419-...` is now 100% active. It is not a
claim based on checked-in config alone.

## Public health

Fresh bounded public health reads returned HTTP-success JSON for both Workers:

| Worker | `ok` | product version | `buildSha` |
|---|---:|---|---|
| Golem | `true` | `0.1.0` | `6d7a5be-dirty` |
| Apple | `true` | `0.1.0` | `6d7a5be-dirty` |

For Golem, that health stamp agrees with the successful deployment script's post-deploy verification.
For Apple, the matching text does **not** imply a new deployment: Cloudflare still reports the same
old version 39 and deployment id observed before the blocked Apple action. Active Cloudflare version
identity is the stronger fact.

## Rollout status and remaining block

The production migration is **not complete**.

Completed and observed:

- Supabase migrations/outbox prerequisites had already been audited green by main before this step.
- Existing purpose-scoped outbox credentials passed the four-way read-only readiness matrix; none
  were regenerated.
- Golem was deployed successfully from unchanged source aggregate
  `d6562221c939ee672572f24f15af6401879ca24e53a5f16fb5383b83d23572a6`.
- Golem version 96 is 100% active with the new replica-capable source and the Golem billing/outbox
  role bindings present.
- Golem's deployment log records the minute outbox cron and nightly retention cron as deployed.
- Public Golem health reports the expected `6d7a5be-dirty` stamp.

Still incomplete:

- Apple remains version 39 with none of the new authority/outbox/legacy-replica bindings.
- The attempted Apple deployment was explicitly blocked by the platform safety check. This worker
  will not retry, repackage, or route around that block.
- Because Apple is unchanged, `LEGACY_QUOTA_DO -> golem/QuotaDO` is not live on Apple and the new
  Apple billing-authority path is not live.
- Stripe remains disabled in the observed active binding inventories. No billing cutover should be
  claimed from this partial rollout.

The next production mutation remains main-owned and blocked at the Apple deployment step. Until an
authorized Apple deployment succeeds and its version/bindings are verified, this state should be
described only as **Golem replica/outbox side deployed; Apple authority side pending**.

## Read-only commands used in this postflight

No command contains credential or secret values.

```sh
node_modules/.bin/wrangler deployments status --name golem --json \
  | jq '{id,created_on,source,strategy,versions:(.versions|map({version_id,percentage}))}'
node_modules/.bin/wrangler deployments status --name apple --json \
  | jq '{id,created_on,source,strategy,versions:(.versions|map({version_id,percentage}))}'

node_modules/.bin/wrangler versions view 0adfa419-ba2a-4a46-a85a-feaff76ed213 --name golem --json
node_modules/.bin/wrangler versions view a67537e8-1599-4694-91c5-a0709a287664 --name apple --json

curl -sS -L --max-time 15 --max-filesize 65536 \
  https://golem.moshe-barami111.workers.dev/api/health
curl -sS -L --max-time 15 --max-filesize 65536 \
  https://apple.moshe-barami111.workers.dev/api/health

node_modules/.bin/wrangler triggers --help
```

The version-detail output was filtered before reporting so only binding names/types/classes were
retained; secret values were never requested for output.

## Limits

This postflight did not deploy or modify Apple, retry a blocked operation, write Cloudflare config,
read release secret values, run remote SQL, inspect private customer data, call a model/provider, or
perform a paid billing action. It also does not claim that the full Apple/Golem authority migration,
Stripe billing, UI/browser work, or product release is complete.
