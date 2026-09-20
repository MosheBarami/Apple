# Billing wiring, the golem ledger repair, and the signup funnel — what was measured

2026-09-20, billing lane. Every figure below is a command and its output. Where
something could not be measured, it says so in those words rather than being
inferred into an answer.

---

## 1. Does the sparks→credits repair hold on golem?

**Yes, and it is measured on a real account whose whole history predates the
rename.**

The rename landed on **2026-09-15** (`04d3800`, "Sparks -> Credits across the
product"). `create table if not exists` does nothing to a table that already
exists, so every QuotaDO created before that date kept a `sparks` column and had
no `credits` one, and `state()` — which `/state`, the charge path and every
refund call — threw `no such column: credits` for that user.

`golem` now serves build `3568b05`, which contains both the
`pragma_table_info('ledger')` migration (quota.ts:129) and the
`/billing-replica` handler (quota.ts:436). Measured:

```
$ curl -s https://golem.moshe-barami111.workers.dev/api/health
{"ok":true,"version":"0.1.0","buildSha":"3568b05",...}
$ git merge-base --is-ancestor 3568b05 HEAD && echo ancestor
ancestor
```

The decisive read is a real account through `GET /api/admin/account/:userId`
against **golem's own origin**, which addresses the same QuotaDO namespace that
`apple`'s `LEGACY_QUOTA_DO` binding reaches:

```
golem QuotaDO ledger for 8722e4df-ab9c-47f6-8a57-02f5a5dd1d44
  total rows in store: 128   returned: 128   truncated: False
  rows dated BEFORE the 2026-09-15 rename: 128
  their days: ['2026-08-30','2026-08-31','2026-09-01','2026-09-02','2026-09-11']
  their credits sum: 256
  every row has a readable integer credits: True
  quota: {"creditsRemaining":351,"creditsDaily":231,"creditsMonthly":2310,
          "creditsUsedToday":0,"creditsUsedThisMonth":162,"plan":"free",
          "allowanceRemaining":231,"credits":120}
```

All 128 rows were written between 2026-08-30 and 2026-09-11 — every one of them
into a `sparks` column — and every one now reads a readable integer `credits`.
`/ledger` selects `credits` by name, so on an unrepaired DO this read is a 500
and the field would be absent entirely. `state()` answers, which is the call that
was throwing in production through Sentry APPLE-WORKER-6.

`apple`'s own QuotaDO for the same user is a fresh one (231 remaining, 0 credits,
empty ledger). That is expected: `apple` has a separate DO namespace.

**Not claimed:** the migration is idempotent and leaves no trace of having run,
so this shows the schema is *correct now*, not the exact moment it became so.
The pre-rename dates on 128 surviving rows are what make the reading unambiguous.

---

## 2. Would a mutation now apply to both stores?

**The wiring is complete and correct. The only thing missing is a live Stripe
key, which is owner-blocked.**

This took four hours to establish on 2026-09-20 because nothing the product
serves said anything about it, so it is now a one-line read:
`GET /api/admin/billing-wiring`, added in `c74b4a7` and live:

```
$ curl -H "X-Admin-Key: …" https://apple.moshe-barami111.workers.dev/api/admin/billing-wiring
{"worker":"apple","canonicalAuthority":"apple","isAuthority":true,
 "replicaBound":true,"replicaWorker":"golem","webhookSecret":true,
 "stripeApiKey":"test","production":true,
 "priceIds":{"builder":true,"studio":true},
 "mutationWouldApplyToBoth":false,
 "why":"stripe_api_key_is_a_test_key_in_production"}
```

Read straight: `apple` **is** the canonical authority, golem's namespace **is**
bound as the replica, the webhook secret **is** present, and both price ids
**are** present. The single blocking condition is that `STRIPE_SECRET_KEY` is a
**test** key and `ENVIRONMENT` is `production`, so `checkoutConfigured` refuses
it — correctly; a test key in production sells subscriptions that charge nobody.
That is the known owner-blocked item: Stripe needs an adult account holder.

Corroborated independently, before the route existed, from the deployed binding
lists (Cloudflare `workers/scripts/{name}/settings`):

| | apple | golem |
|---|---|---|
| `BILLING_WORKER_NAME` | `apple` | `golem` |
| `LEGACY_QUOTA_DO` | `QuotaDO` in script `golem` | *absent* |
| `STRIPE_WEBHOOK_SECRET` | present | *absent* |
| `STRIPE_SECRET_KEY` | present | *absent* |
| `STRIPE_PRICE_BUILDER` / `_STUDIO` | present | *absent* |
| `BUILD_SHA` | `c74b4a7` | `3568b05` |

and by the two live refusals, which agree with it:

```
apple  POST /api/billing/webhook (no signature) -> 400 {"error":"invalid signature"}
golem  POST /api/billing/webhook (no signature) -> 503 {"error":"billing not configured"}
apple  GET  /api/billing/config -> {"checkout":false,"purchasable":[],"currency":"USD"}
golem  GET  /api/billing/config -> {"checkout":false,"purchasable":[],"currency":"USD"}
```

golem's 503 is correct behaviour, not a fault: it holds no webhook secret and is
the replica, not the authority. Before the wiring route existed there was no way
to tell that from a misconfiguration without reading two wrangler files.

**What is proved about "both stores", and what is not.** The two-store contract
is proved *locally*, by 82 passing tests including
`apps/worker/tests/billing-webhook-authority.test.mjs`, which drives signed HTTP
into two real `node:sqlite` QuotaDOs — among them "signed subscription uses
current Stripe state and converges both named SQLite namespaces", "replica
failure keeps HTTP failed; retry completes without granting either namespace
twice", and "trusted deployment role and replica binding are required BEFORE
authority applies money". It is **not** proved in production, and cannot be by
this lane: reaching the replica requires a signature-verified Stripe event, which
requires a live Stripe account. No forged event gets past the signature check,
and extracting the signing secret to make one is not something to do.

So: **a mutation would apply to both as soon as a live key is installed, and
until then no mutation can originate at all.** Both halves are now readable in
one admin call after every deploy.

---

## 3. The signup funnel, without creating an account

Supabase project `npqvyijsvzkuwddyhtpm`, read through the Management API.

**Fixed and verified:**

```
site_url       = https://apple.moshe-barami111.workers.dev/app
uri_allow_list = https://apple.moshe-barami111.workers.dev/app/**,
                 https://apple.moshe-barami111.workers.dev/app,
                 https://apple.moshe-barami111.workers.dev/**,
                 https://golem.moshe-barami111.workers.dev/app/**
```

No `localhost` anywhere in the auth config. And — the half that actually matters,
because a fix in the repo is not a fix on the site — no `http://localhost` in the
**deployed** app bundle either:

```
$ curl -s https://apple.moshe-barami111.workers.dev/app/assets/index-CCCtnng6.js   # 612,751 B
$ grep -oE 'https?://localhost[:0-9]*' …   → no matches
$ grep -oE '.{90}location\.origin.{40}' …
  …const af="/app";function hn(e,n=typeof window>"u"?"":window.location.origin){const s=rf(e);return `${n}${af}…
```

That is `emailRedirectTo` minified: the origin is read from the page at runtime,
so it is whatever origin the user is actually on. The client sends
`…/app/confirm` and `…/app/reset`. Per Supabase's documented glob rules (`**`
matches any sequence of characters; `.` and `/` are separators), both are matched
by `…/app/**` and again by `…/**`.

**Wired and exercised:** 32 users, 32 profiles, 0 users without a profile, and
the `on_auth_user_created` → `public.handle_new_user` trigger is present and
enabled (`tgenabled = 'O'`).

**Nobody has signed up in three weeks — measured, not assumed:**

```
select count(*) users, count(*) filter (where email_confirmed_at is not null) confirmed,
       min(created_at) oldest, max(created_at) newest from auth.users;
→ users 32, confirmed 32,
  oldest 2026-08-30 16:50:15+00, newest 2026-08-30 17:21:54+00
```

Every account in the project was created inside one 32-minute window on
2026-08-30. Nothing since.

**Live, reachable, and refusing correctly:**

```
/app/signup 200   /app/login 200   /app/confirm 200   /app/reset 200
/api/me with no token        -> 401
/api/me with a forged bearer -> 401 {"error":"unauthorized"}
```

### What remains unprovable without a person

1. **That a human can complete the form.** No account was created; the standing
   instruction forbids it. Everything up to the POST is verified; the POST, the
   session it returns, and the workspace it lands in are not.
2. **That any email is delivered.** `mailer_autoconfirm: true`, so signup sends
   no mail and this does not block a signup. It *does* block password recovery,
   which is the one flow that must send. `smtp_host` is unset, so recovery runs
   on Supabase's built-in mailer at `rate_limit_email_sent: 2` per hour for the
   whole project. That is a real production limitation, it is **OPEN**, and
   fixing it means creating an account with a mail provider — which this lane may
   not do.
3. **That the issued JWT is accepted end to end.** The gate refuses absent and
   forged tokens (above); a valid one has not been exercised, because obtaining
   one means signing in.

---

## 4. The owner's own worst case was published 2.5x too low

His row `published-agent-credit-figure` asks for *"the exact expected monthly bill at low, medium,
and heavy usage, and the exact hard maximum bill your safeguards allow."*

On 2026-09-20 the caps were raised on purpose — `BILLABLE_NEURONS_PER_DAY` 15,000 → 90,000 and
`BILLABLE_NEURONS_PER_MONTH` 460,000 → 1,800,000 — because at the old cap the live product was
refusing every build with *"Apple has reached today's shared building capacity."* The constants,
the enforcement and `packages/evals/src/economics.test.mjs` all moved that day. Four documents did
not.

Measured live, from `GET /api/admin/spend`:

```
"limits": {"freeNeuronsPerDay":10000,"billableNeuronsPerDay":90000,
           "billableNeuronsPerMonth":1800000,"maxNeuronsPerRequest":1200},
"maxMonthlyUsd": 19.8,
"state": {"estimatedMonthUsd": 0.8719, ...}
```

$19.80 of AI plus $5.00 Workers Paid is **$24.80/month**. `docs/COST-MODEL.md` was still headed
`## Hard maximum: $10.06 / month`, and said in prose *"The ceiling has not moved — the hard maximum
is still $10.06/month."* Both false, and the difference is the owner's money.

`docs/COST-MODEL.md` and the pointer row in `docs/SCALE-V2.md` are corrected and every figure is
re-derived from the constants: low $5.00, medium $13.25, heavy $24.80, with the monthly backstop
biting on day 20 at the daily cap. A guard in `economics.test.mjs` now fails when any document
under `docs/` states a hard monthly maximum that is not
`BILLABLE_NEURONS_PER_MONTH × USD_PER_NEURON + WORKERS_PAID_USD_PER_MONTH`.

**OPEN, and left alone deliberately:** `docs/BUDGET-SHARDING.md:370, 373, 401` still say $10.06,
and its neighbouring `25,000 / 1,200 = 20.8` is the old daily ceiling. Those figures sit inside a
ratio argument (`77 / 10.06 ≈ 7.6×`, which becomes `77 / 24.80 ≈ 3.1×`), so they need the
document's author rather than a find-and-replace. The file is exempted BY NAME in the guard with
that reason written out, so the staleness is owned rather than hidden. Its conclusion — that T1
cannot be satisfied today — survives the correction.

### Residue worth someone's decision

`https://golem.moshe-barami111.workers.dev/app/**` is still on the allow list.
It is a legitimate origin today, but a recovery link aimed there lands on the
legacy app. Remove it when golem stops serving.
