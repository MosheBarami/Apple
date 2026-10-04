# Waiting on the owner

Only what needs the owner: an owner-only action from the handoff (X1, X4–X9), money, a legal step, or a console
no token here can reach. Work that does not depend on an item goes on. Decided items were removed (see
`OWNER-DECISIONS.md`). "Urgent" means something live does not work until it is done.

## Urgent

### N1. Turnstile: allow `studpilot.app` (the account-recovery form on studpilot.app needs it)
The Worker requires a Turnstile token on `POST /api/recovery-request`, and the widget only allows the old
hosts. The API token cannot edit widgets (10000 "Authentication error", measured 2026-10-04).
1. Open https://dash.cloudflare.com → your account → **Turnstile**.
2. Click the widget whose site key starts `0x4AAAAAAFBZ` (named `apple-auth`).
3. Under **Hostname management**, click **Add hostnames**, type `studpilot.app`, and confirm. Keep the existing
   three hostnames.
4. Optionally rename the widget to `studpilot-auth`. The site key does not change.
5. Click **Save**. Nothing else is needed; the code already uses this site key.

## Before charging money

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

### X6. Trademark check for "StudPilot"
Search USPTO (https://tmsearch.uspto.gov), EUIPO and the Israeli register for "StudPilot" in classes 9 and 42.
Record the result in `planning/proof/M7/` or tell Claude Code.

### N2. Sign-in with Google and Discord (Supabase providers)
Only email sign-in is on. Google and Discord need OAuth clients that only your accounts can create.
- **Google:**
  1. https://console.cloud.google.com → **APIs & Services** → **Credentials** → **Create credentials** → **OAuth
     client ID** → type **Web application**.
  2. Under **Authorized redirect URIs**, add `https://npqvyijsvzkuwddyhtpm.supabase.co/auth/v1/callback`.
  3. Click **Create** and copy the client ID and secret.
- **Discord:**
  1. https://discord.com/developers/applications → your app → **OAuth2**.
  2. Under **Redirects**, add the same Supabase callback URL.
  3. Copy the **Client ID** and click **Reset Secret** to get the secret.
- **Supabase:**
  1. https://supabase.com/dashboard/project/npqvyijsvzkuwddyhtpm/auth/providers.
  2. Enable **Google**, paste its ID and secret, and save. Do the same for **Discord**.
  3. Alternatively, put the four values in `.env` as `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
     `DISCORD_OAUTH_CLIENT_ID` and `DISCORD_OAUTH_CLIENT_SECRET`, and Claude Code enables the providers through
     the Management API.

### N3. Discord application name and avatar
The API ignores `name` (measured; the bot is already named "StudPilot").
1. https://discord.com/developers/applications → the **AppleAI** app → **General Information**.
2. Set **Name** to `StudPilot`.
3. Upload the new icon, `packages/design/brand/icon-512.png`, which M2 makes.
4. Click **Save Changes**.

### N6. Operator name and support inbox for the legal pages
The privacy and terms pages still name "Apple Labs" and its Gmail inbox.
1. Decide the legal operator name (a person or company) and a support address (for example
   `support@studpilot.app`).
2. Write both into `planning/proof/OWNER-DECISIONS.md`.
Claude Code then replaces every occurrence. Until then the M2 rewrite keeps the old operator line, marked for
replacement.

### N7. Legal review of the rewritten privacy and terms pages
Claude Code drafts them in M2: 13+, the Roblox OAuth data held, no AI training on Roblox data, deletion, and
anonymised opt-out improvement data. Before the Roblox OAuth review, read `/privacy` and `/terms` on
studpilot.app, or have a lawyer do so, and reply "legal ok" or with the changes.

## M7 only

- **X7. Publish the plugin:** decide whether and when to publish the Studio plugin to the Creator Store (after
  M7), and rename the listing "Apple Studio" to "StudPilot". Until a plugin with the `studpilot.app` base is
  published, the `apple` stand-in must stay. It is due to be deleted on 2027-01-02.
- **X8. The hidden test set:** hand it over at M7 only.
- **X9. The Roblox OAuth review:** record the demo video (under one minute; Claude Code writes the script) and
  submit it in the Roblox Creator Dashboard.

## Anytime

### X1. Close the Codex app fully
Quit the Codex app (on macOS, ⌘Q in the Codex window) so that only one agent works in the repo.

### N4. A Cloudflare token for analytics readback (`CF_ANALYTICS_TOKEN`), optional
Nothing reads product analytics back today. Creating the token through the API was refused: the main token
cannot manage tokens, and `CLOUDFLARE_API_TOKEN_WRITE_ALL` is invalid.
1. https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Create Custom Token**.
2. Name it `studpilot-analytics-read`.
3. Permissions: **Account** · **Account Analytics** · **Read**. Account resources: your account.
4. **Continue to summary** → **Create Token**, then copy it.
5. Add a line `CF_ANALYTICS_TOKEN=<token>` to `.env`. Claude Code puts it on the Worker as a secret.

### N8. One live pairing (1 minute; it closes the last M1 check)
Minting a pairing code needs a signed-in account, and Claude Code does not sign in with a password.
1. Open https://studpilot.app/app and sign in.
2. Open any project and click **Pair**.
3. In Roblox Studio, with the StudPilot or Apple Studio plugin open, enter the 6-character code.
4. If the plugin says it is connected, the check passes. Tell Claude Code, or leave it: it can read
   `pluginConnected` from the session.
