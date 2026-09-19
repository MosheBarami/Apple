# Go live — the exact things a human must do, and nothing else

Everything in this file is blocked on an account or a credential that an agent may not create. The
code behind each one is written, tested and deployed; it is dark because nothing is connected to it.

Each section ends with a **probe** — a command that proves the thing actually works afterwards.
Do not mark one done because a value was pasted somewhere.

---

## 1. Payments — the product cannot take a single dollar today

**Measured 2026-09-19:**

```
$ npx wrangler secret list --config wrangler.apple.jsonc
[ { "name": "ADMIN_KEY" }, { "name": "ROBLOX_API_KEY" } ]
```

No Stripe credential exists on the live Worker, and none is in `.env`. `checkoutConfigured()` is
therefore false, `/api/billing/config` answers `purchasable: []`, and `POST /api/billing/checkout`
refuses with 503.

The route is not a stub: it refuses a second subscription on one account, refuses a caller-supplied
`returnTo` as an open redirect, carries a reactivation path for a lapsed customer, and is covered by
143 tests. It has simply never been given a key.

### What only you can do

1. Create (or sign in to) the Stripe account this product bills through. **An agent must not create
   a financial account or handle card details** — this step is yours, by rule and not by
   convenience.
2. Create two recurring products in Stripe, monthly, in the currency `PRICE_CURRENCY` names:
   - **Builder** — $12 / month
   - **Studio** — $40 / month
   Copy each one's **price id** (`price_…`, not the product id).
3. Create a webhook endpoint pointing at `https://apple.moshe-barami111.workers.dev/api/billing/webhook`
   and copy its **signing secret** (`whsec_…`).
4. Create a Billing Portal configuration and copy its id (`bpc_…`).
5. Set them as Worker secrets — these prompt for the value and never echo it:

```bash
cd apps/worker
npx wrangler secret put STRIPE_SECRET_KEY            --config wrangler.apple.jsonc
npx wrangler secret put STRIPE_PRICE_BUILDER         --config wrangler.apple.jsonc
npx wrangler secret put STRIPE_PRICE_STUDIO          --config wrangler.apple.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET        --config wrangler.apple.jsonc
npx wrangler secret put STRIPE_PORTAL_CONFIGURATION  --config wrangler.apple.jsonc
```

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

## 2. Error monitoring — every production failure is currently invisible

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
