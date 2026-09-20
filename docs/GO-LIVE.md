# Go live — the exact things a human must do, and nothing else

Everything in this file is blocked on an account or a credential that an agent may not create. The
code behind each one is written, tested and deployed; it is dark because nothing is connected to it.

Each section ends with a **probe** — a command that proves the thing actually works afterwards.
Do not mark one done because a value was pasted somewhere.

---

## 0. Signing up — the auth config pointed at localhost, and my first diagnosis of this was wrong

**Measured, 2026-09-20:**

```sql
select count(*), count(email_confirmed_at), min(created_at), max(created_at) from auth.users;
-- 32 | 32 | 2026-08-30 16:50:15 | 2026-08-30 17:21:54
```

Thirty-two accounts, every one created inside a single 31-minute window on 30 August, and **not one
account in the twenty-one days since**. The owner reported the reason he saw:

> אני לא מצליח להכנס בlogin/signup כי שליחת אימיין אימות מעולם לא מופיעה לי בinbox

### What I wrote here first, and why it was wrong

This section originally said the cause was Supabase's default mail service — which delivers only to
project team members and is capped at 2/hour — and told the owner to switch **Confirm email** off.
That reasoning came from `docs/research/supabase-auth-worker.md` and from `grep` finding no SMTP
anywhere. Both of those facts are true. The conclusion did not follow, because nobody had read the
live configuration.

Read through the Management API on 2026-09-20:

```
mailer_autoconfirm: true          <- confirmation was ALREADY off; no mail is sent on signup
disable_signup:     false         <- signup is enabled
smtp_host:          null          <- no custom SMTP, as found
site_url:           "http://localhost:3000"
uri_allow_list:     ""
```

**`site_url` was Supabase's factory default.** Every redirect the auth service generates — password
recovery, magic link, OAuth callback, and the confirmation link if it is ever turned on — was
pointing at `http://localhost:3000`, which on a customer's machine is nothing at all. And
`uri_allow_list` was empty, so the `emailRedirectTo` the app sends
(`https://apple.moshe-barami111.workers.dev/app/confirm`) was not an allowed destination and fell
back to that same localhost.

A toggle I asked the owner to flip was already in the position I asked for. The instruction cost him
nothing but it was wrong, and the reason it was wrong is worth keeping: a documented cause and a
matching symptom are not a diagnosis until the live configuration has been read.

### Fixed

```
site_url:       https://apple.moshe-barami111.workers.dev/app
uri_allow_list: https://apple.moshe-barami111.workers.dev/app/**, .../app, .../**,
                https://golem.moshe-barami111.workers.dev/app/**
```

Applied by PATCH and confirmed by re-reading the config back.

### Still open, and NOT claimed fixed

With `mailer_autoconfirm: true` a signup returns a session directly and sends no mail, so the
redirect fix does not by itself explain twenty-one days of zero signups. **Nobody has completed a
real signup since the change.** That probe needs a person with a browser and an email address, and
it is the only thing that closes this section.

**Owner action:** open <https://apple.moshe-barami111.workers.dev/app/signup>, create an account,
and say whether it works. Then:

```sql
select email, created_at from auth.users order by created_at desc limit 3;
```

A row newer than the attempt is the proof.

**Password reset stays broken** until custom SMTP exists — it always needs mail, and mail needs a
sender domain the owner controls. The product runs on `*.workers.dev`, which is Cloudflare's. That
is a smaller hole than "nobody can sign up" and it stays OPEN.

---

## 1. Payments — the product cannot take a single dollar today

**Measured 2026-09-19:**

```
$ npx wrangler secret list --config wrangler.apple.jsonc
[ ADMIN_KEY, ROBLOX_API_KEY, STRIPE_PRICE_BUILDER, STRIPE_PRICE_STUDIO,
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET ]
```

**The wiring is done and observed working, in TEST MODE.** `/api/billing/config` answers
`{"checkout": true, "purchasable": ["builder","studio"]}` without a credential, `/pricing` renders
Choose Builder and Choose Studio, and two real Stripe Checkout Sessions were created at $12.00 and
$40.00 with payable URLs. See `docs/evidence/payments-live-2026-09-19.md`.

### A defect on this path that was found and fixed on 2026-09-20

Worth recording here rather than in a commit nobody reads before go-live, because it would have
surfaced on the **first real payment** and not before.

`/api/billing/webhook` requires the legacy `golem` worker. `apps/worker/src/index.ts:2503` returns
503 when `LEGACY_QUOTA_DO` is absent, and every billing mutation is delivered to that replica as
well as to the authority. The comment on the catch is explicit: *"never answer success before both
stores acknowledge"* — a replica that fails makes the webhook answer 503, and Stripe then retries
an event that can never succeed.

golem's QuotaDO still carried the pre-rename `ledger` schema: a `sparks` column and no `credits`
one, so `state()` threw `no such column: credits` and every admin call to it answered 500. The
migration written for the authority had only been deployed to `apple`.

Deployed to golem and verified, same command against both hosts:

```
golem  ledgerColumns ["id","day","kind","sparks","created_at","credits"]  200   (was 500)
apple  ledgerColumns ["id","day","kind","credits","created_at"]           200
```

`sparks` is retained and `credits` was added and populated from it, so the ledger's history carried
over rather than reading as an account that had never spent.

**So golem must not be deleted.** It looks like a leftover from the rename and it is a live
dependency of the payments path.

### The blocker is not technical, and it does not have a workaround

**The owner is 15.** Stripe — and every comparable card processor — requires the account holder to
be of legal age to enter a binding contract, and requires a bank account in that person's name.
There is no configuration, no code path and no agent action that changes this.

It must also not be worked around. An account opened on incorrect details does not fail at signup;
it fails at the moment money starts arriving, and then the money is frozen inside it and the person
who opened it is the one holding the problem. The cheap-looking shortcut is the expensive one.

So this blocker stays OPEN. It is not "complete", it is not "pending", and the test-mode green does
not soften it. Two things unblock it, neither of them ours:

1. **An adult holds the account.** A parent, guardian or a registered company is the account
   holder, in their own name and with their own bank details. They do that step themselves.
2. **Time.** At 18 the owner can hold it directly.

When either arrives, the remaining work is small and already proven: issue LIVE keys, create a live
webhook endpoint for the five events `interpretStripeEvent` reads, and replace the six secrets
below. Nothing else changes, because the test-mode path exercised every line of it.

```bash
cd apps/worker
npx wrangler secret put STRIPE_SECRET_KEY            --config wrangler.apple.jsonc
npx wrangler secret put STRIPE_PRICE_BUILDER         --config wrangler.apple.jsonc
npx wrangler secret put STRIPE_PRICE_STUDIO          --config wrangler.apple.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET        --config wrangler.apple.jsonc
npx wrangler secret put STRIPE_PORTAL_CONFIGURATION  --config wrangler.apple.jsonc
```

Type them into that prompt. Not into a chat window, not into a file — the current keys arrived
pasted into a transcript, which is why they are test keys and why they should be rotated rather
than promoted.

### What this changes about the plan

Card payments are no longer the first revenue path; they are the second, and they are waiting on a
person rather than on work.

**The first is Roblox itself.** This product builds Roblox games, and Roblox lets developers under
18 earn Robux — selling the plugin on the Creator Store, or selling passes inside a place. It needs
no card processor and no bank account to start earning, and the audience is already there. The
distribution work is done: see `docs/PLUGIN-RELEASE.md`, whose remaining steps are Studio and
Creator Dashboard actions the owner can perform at 15.

Read the Roblox blocker below as the priority one. This section is the one that waits.


6. Redeploy the site so the pricing page re-asks:

```bash
cd apps/site && npx astro build && cd ../.. && node infra/deploy-static.mjs --only site
```

### Probe

```bash
curl -s https://apple.moshe-barami111.workers.dev/api/billing/config
```

`{"checkout":true,"purchasable":["builder","studio"],...}` is the answer that means it worked.
Anything else and the pricing page will keep saying "planned tier", correctly.

The pricing page derives every purchasability claim from that response — the lede, the per-card
note, the comparison table's "(planned)" suffix, the FAQ, and whether a **Choose Builder** button
exists at all. Nobody edits copy to open the shop.

---

## 2. Error monitoring — DONE 2026-09-20, and this section was wrong before that

**This heading used to read "every production failure is currently invisible". It was false.** Both
Sentry projects existed, the worker had been reporting for at least 22 hours, and the section was
describing work that had already been done. A launch checklist that overstates what is missing
costs the same as one that understates it.

Closed and probed on 2026-09-20: `SENTRY_DSN` is set on the `apple` worker, and the probe is an
issue that actually arrived — `APPLE-WORKER-6`, a real 500 caught within a minute of being
triggered. Reading its stack trace is what revealed that the failure was on the legacy `golem`
worker rather than on the product, which four deploys had failed to establish.

The SPA half is closed too, same night. `VITE_SENTRY_DSN` is in `apps/web/.env.local` (gitignored,
and the DSN is public by design — it ships inside the browser bundle), the bundle was rebuilt and
deployed, and the probe is the served bytes rather than the build output:

```
$ curl -s https://apple.moshe-barami111.workers.dev/app/assets/index-BQuYYOhY.js | grep -c 4512107888246784
1
```

All five assets the deployed `/app` references return 200. A caution for whoever probes this next:
the HTML references `/app/assets/...`, and a pattern matching `/assets/...` will match that as a
substring, strip the prefix, and return 404s for URLs that never existed. That looks exactly like a
broken deploy and is not one.

<details><summary>The original section, kept because the instructions in it are still the right
ones for the SPA half</summary>

### Error monitoring — every production failure is currently invisible

`apps/worker/src/sentry.ts` and `apps/web/src/lib/sentry.ts` are written, scrubbed and tested. With
no DSN they are deliberate no-ops: nothing is sent, and the original error still surfaces.

1. In Sentry org `moshe-s6`, create two projects — **Cloudflare Workers** for the API and
   **Browser JavaScript** for the SPA. Two, not one: different release schemes and noise profiles.
2. Copy each DSN from *Settings → Projects → <project> → Client Keys (DSN)*.
3. `cd apps/worker && npx wrangler secret put SENTRY_DSN --config wrangler.apple.jsonc`
4. `VITE_SENTRY_DSN` in `apps/web/.env.local`, then rebuild and redeploy the web bundle.

**Probe:** trigger a handled error and confirm the issue appears in Sentry within a minute. A DSN
that is set but wrong fails silently, which is why the probe is the issue list and not the config.

---

</details>

## 3. Discord — the bot answers 503

`/api/discord/interactions` verifies an Ed25519 signature over `timestamp + rawBody`, refuses with
503 when no public key is configured, and 401 before parsing on a bad signature. The commands
(`/build`, `/status`, `/link`, `/unlink`, `/credits`), the per-user rate limits and the credit gate
are all implemented and tested.

Full runbook: `docs/DISCORD-SETUP.md`. In short: create the Discord application, set
`DISCORD_PUBLIC_KEY` and `DISCORD_BOT_TOKEN` as Worker secrets, deploy, paste the interactions URL,
publish the commands from the admin page, invite the bot.

**Probe:** Discord's own "Save Changes" on the interactions URL performs a signed PING. If it saves,
verification works.

---

## 4. The Studio plugin — public installation

`STUDIO_PLUGIN_STORE_LIVE` is `false` in `packages/shared/src/index.ts`, and because of it every
install affordance on the public site degrades honestly to `/docs/plugin`. That is why the landing
page reads *"Early preview. Public Studio installation is not available yet."*

**That sentence is true. Do not remove it until it is false.** Deleting it without publishing the
plugin is the one thing this repository is built not to do.

See `docs/PLUGIN-RELEASE.md` for the release path and for what must be proven before the flag flips.

---

## What "live" means, and what it does not

A pasted credential is not a working feature. Each probe above is the smallest thing that
distinguishes *configured* from *working*, and the difference between them has cost this product
real time before: a deploy that printed `done` while serving a year-old page, and a health endpoint
that named a build four commits behind.

---

## 5. The secret scanner fails on its own test fixtures, and I did not weaken it to make CI green

**Measured 2026-09-20.** `python3 scripts/secret-scan.py` exits 1 with `RESULT: CREDENTIALS IN THE
CURRENT TREE` — 32 hits across nine patterns, in exactly three files:

```
apps/web/tests/sentry-wiring.test.mjs
apps/worker/tests/secret-redaction.test.mjs
apps/worker/tests/memory-store.test.mjs
```

Every value is fabricated: `AKIAIOSFODNN7EXAMPLE` is AWS's own published example key,
`sk-ant-api03-abcdefghij` and `ghp_abcdefghijkl…` are the alphabet, `xoxb-1234567890-` and
`AIzaSyA123456789` are sequential digits. All three files exist to prove the redactor catches
credential-shaped text. `secret-redaction.test.mjs` says so in its header:

> EVERY GUARD HERE IS FED THE THING IT IS SUPPOSED TO CATCH. A redactor tested on a clean string
> proves that one string survived; it says nothing about whether a JWT would.

### Why this is not a five-minute fix

The scanner's premise is *"anything present in the CURRENT tree fails the build, because that is
fixable by editing a file"*. For a redaction test that premise is false — the file must contain
credential-shaped strings or the test proves nothing.

Its `ALLOW` list (`example|fake|placeholder|SENTINEL|…`) deliberately **cannot** suppress a
`HARD_SIGNATURE`, and AWS / OpenAI / Anthropic / Google / GitHub / Slack keys and JWTs are all hard
signatures. That is correct: a real AWS key looks exactly like a real AWS key. The register is
history-only by design and refuses to record while anything is in-tree.

So the three available moves are:

1. **Weaken the fixtures** so they stop matching — which guts the tests that protect every
   outbound request and error log.
2. **Add an in-tree path exemption** to the scanner — a new hole in a security control, and the
   standard way scanners get quietly neutered.
3. **Teach the scanner that a fixture is a fixture** in a way that a real leak cannot imitate.

Option 3 is the right one and it is a design decision, not a patch. **I did not take options 1 or 2
to turn a badge green at the end of a long night.**

### State

**OPEN.** CI's "Scan full history for secrets" step stays red until this is designed. It is
pre-existing — `tail -4` on an earlier run showed me only the last pattern's output, which is how I
first read this as three hits rather than thirty-two.

Nothing here is a live credential. No rotation is required.
