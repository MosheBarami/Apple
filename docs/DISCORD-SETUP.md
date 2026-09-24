# Making the Discord bot live

> **Status 2026-09-24: live.** Application `AppleAI` (id 1549354044122865806) exists and its bot sits
> in the Apple server (1549352480658169866) with Administrator. The worker has `DISCORD_PUBLIC_KEY`
> and `DISCORD_BOT_TOKEN`; the interactions endpoint is
> `https://apple.moshe-barami111.workers.dev/api/discord/interactions` (Discord verified it);
> `/link /unlink /build /status /credits` are registered. The server itself (Community, roles,
> channels, forums, AutoMod, onboarding, webhooks, the permanent invite https://discord.gg/SjKr6dyG8X)
> is built by `infra/discord-server.mjs` — idempotent, rerun it after editing its declaration.
> The steps below are kept for rebuilding from nothing.

The code is already written and deployed. What is missing is a Discord application, which only
exists once someone with a Discord account creates one. That is this page.

**Every step here needs either your Discord account or your Cloudflare account, so all of it is
yours to do.** Nothing below can be done for you, and none of it touches anyone's data.
It takes about fifteen minutes. Steps 1–7 are in order and the order matters — Discord checks the
endpoint the moment you paste it in step 6, and that check fails unless step 5 has happened first.

Two values get copied out of Discord in this process: the **Public Key** and the **Bot Token**.
Paste them only into the terminal commands below. Do not put them in a file, a chat message, or a
commit — the bot token lets anyone control the application.

---

## 1. Create the application

1. Go to <https://discord.com/developers/applications>. Sign in with your Discord account.
2. Press **New Application** (top right).
3. Give it a name — this is the name users see, e.g. `Apple`.
4. Tick the terms checkbox and press **Create**.

## 2. Copy the Public Key

You land on **General Information**. Scroll to **Public Key**, press **Copy**, and keep it on your
clipboard for step 5. It is a long string of letters and numbers. It is not secret in the way a
password is, but it is what proves a request really came from Discord, so it still goes in as a
secret.

## 3. Create the bot and copy its token

1. In the left sidebar, press **Bot**.
2. Press **Reset Token**, then **Yes, do it!**. Confirm with your password or 2FA if asked.
3. Press **Copy**. **Discord shows this token once.** If you lose it, press **Reset Token** again
   and use the new one — resetting is safe and costs nothing.

## 4. Turn off "Public Bot" (optional but recommended)

Still on the **Bot** page, switch **Public Bot** OFF. That means only you can add this bot to a
server. Leave it on only if you want other people to be able to install it.

## 5. Put both values into Cloudflare

Open a terminal in the project and run these two commands. Each one asks you to paste a value and
press Enter. Nothing is echoed to the screen as you paste — that is normal.

```
cd apps/worker
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_BOT_TOKEN
```

- `DISCORD_PUBLIC_KEY` — the value from step 2.
- `DISCORD_BOT_TOKEN` — the value from step 3.

These two names are exact; the worker reads these and no others
(`apps/worker/src/env.ts`). If wrangler asks you to log in to Cloudflare, do that first.

> This targets the `golem` worker, which is the one serving production. If you have moved traffic
> to the `apple` worker, add `--config wrangler.apple.jsonc` to both commands and run them again —
> secrets are per-worker and do not travel.

Then redeploy so the worker picks them up:

```
pnpm run deploy:api
```

## 6. Point Discord at the worker

1. Back in the developer portal, go to **General Information**.
2. Find **Interactions Endpoint URL** and paste exactly:

   ```
   https://golem.moshe-barami111.workers.dev/api/discord/interactions
   ```

3. Press **Save Changes**.

Discord immediately sends the endpoint a test request and a deliberately corrupted one, and refuses
to save unless the worker accepts the first and rejects the second. **If it refuses to save, step 5
did not take** — most likely the public key was pasted with a stray space, or the deploy had not
finished. Redo step 5 and try again. A saved URL is your proof the signature checking works.

## 7. Publish the slash commands

The commands (`/link`, `/unlink`, `/build`, `/status`, `/credits`) do not appear in Discord until
they are published once.

1. Open <https://golem.moshe-barami111.workers.dev/app/admin>, signed in as your admin account —
   the page only renders for an admin profile.
2. Paste your admin key into the **Admin key** box (this is the `ADMIN_KEY` secret).
3. Find the **Discord commands** panel and press the button.

It lists the five commands back when it works. Pressing it twice changes nothing, so it is safe to
retry. Press it again any time the command list changes.

## 8. Add the bot to your server

1. In the portal sidebar, go to **OAuth2** → **URL Generator**.
2. Under **Scopes**, tick **`applications.commands`** (and **`bot`** if you want it to appear in the
   member list).
3. Copy the **Generated URL** at the bottom, open it in a new tab, choose your server, and press
   **Authorize**.

You need **Manage Server** permission on whichever server you pick — if it is your own server you
already have it.

---

## Checking it works

In your server, type `/` and you should see the commands. Then:

1. Open <https://golem.moshe-barami111.workers.dev/app/settings>, go to **Connections** →
   **Discord**, choose a project, press **Get a code**.
2. In Discord run `/link` and paste the code into the `code` box. Codes last 10 minutes and work
   once.
3. Run `/credits`. If it reports a balance, everything is wired up.

Every reply the bot sends is visible only to the person who typed the command, including in a
public channel.

## If something is wrong

- **Commands do not appear.** Redo step 7. Global commands can also take a few minutes to show up;
  fully quitting and reopening Discord forces a refresh.
- **"The application did not respond."** The worker did not answer within three seconds. Check it is
  deployed and that `/api/health` responds.
- **Discord will not save the endpoint URL.** See step 6 — this is always the public key or a
  missing deploy, never Discord.
- **`/build` says it could not reach the project.** That is the bot refusing to spend a Credit on a
  build it cannot confirm will land, not a bug. Try again in a moment.
- **`/build` says there are no Credits left.** The balance is checked before the run is started, so
  this refusal costs nothing — no Credit is spent on being told no. `/credits` shows when today's
  allowance refills.
- **"Too many commands too quickly."** Each Discord account gets 20 commands a minute, of which at
  most 4 may be `/build`. The limit is per Discord account, not per server, and it clears by
  itself within the minute. Nothing is spent on a command that was refused this way.

## What the bot cannot do, by design

It answers slash commands only — it cannot read ordinary chat messages and cannot speak unprompted.
One Discord account links to one project at a time, and **the linked Discord account spends that
Apple account's Credits**, so link only your own. `/unlink` in Discord and **Disconnect Discord** in
Settings both break the link immediately, from either end.
