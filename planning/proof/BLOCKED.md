# Waiting on the owner

Only what needs the owner: an owner-only action from the handoff (X4, X5, X7–X9), money, a legal step, or a console
no token here can reach. Work that does not depend on an item goes on. Done and decided items are removed (see
`OWNER-DECISIONS.md`, D-10 to D-16, 2026-10-05).

## Urgent

### N2. Google and Discord sign-in: the four `.env` lines were not found
On 2026-10-05 `~/Developer/StudPilot/.env` had no Google lines and no Discord OAuth secret. Supabase shows both providers
off, with no client id or secret set. Add these four lines to that file, with these exact names, and tell Claude Code "N2
lines in":
```
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
DISCORD_OAUTH_CLIENT_ID=
DISCORD_OAUTH_CLIENT_SECRET=
```
The Discord client id is the application id (`DISCORD_APPLICATION_ID` is already there). The secret is on the Discord
developer page, under **OAuth2** → **Reset Secret**. That is not the bot token. Both apps need the redirect
`https://npqvyijsvzkuwddyhtpm.supabase.co/auth/v1/callback`.

## Before charging money

### N9. An adult or a company becomes the named operator (D-15)
The legal pages name "StudPilot" as the operator, with support@studpilot.app. Before any money is charged, an adult or a
registered company must become the named operator: the party in the terms, on the privacy policy and on the Stripe
account (X5). Tell Claude Code the legal name, and it updates `/privacy` and `/terms`.

### X5. An adult holds the Stripe account
Charging stays off until then (plan section 7). When it is done, also do N5.

### N5. Stripe: webhook URL and product names (after X5)
The webhook still points at `https://apple.moshe-barami111.workers.dev/api/billing/webhook`. It keeps working
through the stand-in until 2027-01-02.
1. https://dashboard.stripe.com → **Developers** → **Webhooks** → the endpoint ending `/api/billing/webhook`.
2. **Update endpoint**: set the URL to `https://studpilot.app/api/billing/webhook`, then save. The signing
   secret stays the same.
3. **Product catalog**: rename each test-mode product to its StudPilot plan name. In **Settings → Public
   details**, set the statement descriptor to `STUDPILOT`.

## Before public launch

### X4. Regenerate the Roblox OAuth client secret (it was shared in chat)
1. https://create.roblox.com/dashboard/credentials → **OAuth 2.0 Apps** → **StudPilot**.
2. Click **Regenerate secret** and copy the new value.
3. Open `~/Developer/StudPilot/.env` and replace the value after `ROBLOX_OAUTH_CLIENT_SECRET=`. Save.
4. Tell Claude Code "secret rotated". It puts the new value on the Worker and checks that sign-in still works.

## M7 only

- **X7. Publish the plugin:** decide whether and when to publish the Studio plugin to the Creator Store (after
  M7), and rename the listing "Apple Studio" to "StudPilot". Until a plugin with the `studpilot.app` base is
  published, the `apple` stand-in must stay. It is due to be deleted on 2027-01-02.
- **X8. The hidden test set:** hand it over at M7 only.
- **X9. The Roblox OAuth review:** record the demo video (under one minute; Claude Code writes the script) and
  submit it in the Roblox Creator Dashboard.

## Anytime

### N4. One narrow Cloudflare token for the Worker (`CF_WORKER_OPS_TOKEN`); due before 2026-11-03
Claude Code now works through a Wrangler OAuth login (2026-10-05). It covers Workers, D1, R2, KV, Vectorize, Queues,
Turnstile and Email Routing, but it has no AI Gateway, DNS or API-token scope, so this token is still needed. Two jobs
need it. The 30-day AI Gateway log retention you approved (D-14) is a daily deletion run by the Worker. The
second is the optional analytics readback. The main token cannot create tokens (measured 2026-10-04), and it is far too
broad to put on the Worker. Until this token exists the deletion is run by hand. The new gateway's oldest log is from
2026-10-04, so nothing passes 30 days before 2026-11-03.
1. https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Create Custom Token**.
2. Name it `studpilot-worker-ops`.
3. Permissions: **Account** · **AI Gateway** · **Edit**, and **Account** · **Account Analytics** · **Read**. Account
   resources: your account.
4. **Continue to summary** → **Create Token**, then copy it.
5. Add a line `CF_WORKER_OPS_TOKEN=<token>` to `~/Developer/StudPilot/.env`. Claude Code puts it on the Worker as a
   secret, and the daily cron starts deleting logs older than 30 days.
