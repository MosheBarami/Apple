# The Discord bot does not answer 503. Measured 2026-09-21 against the live origin.

The infra ledger carries "the Discord bot which answers 503 — `DISCORD_APPLICATION_ID` and
`DISCORD_PUBLIC_KEY` are in .env now, the bot token is not". The first clause is **stale**, and it
matters, because 503 and 401 are two different products.

## What the live origin actually says

```
$ curl -s -o /dev/null -w '%{http_code}' -X POST \
    https://apple.moshe-barami111.workers.dev/api/discord/interactions \
    -H 'content-type: application/json' -d '{}'
401   {"error":"invalid request signature"}
```

401, not 503. `apps/worker/src/index.ts:3046` defines the difference:

```ts
export function discordConfigured(env: Env): boolean {
  return typeof env.DISCORD_PUBLIC_KEY === 'string' && env.DISCORD_PUBLIC_KEY.length > 0;
}
```

503 is "this deployment has no public key, so nothing could ever be verified". 401 is "the key is
here, I checked your Ed25519 signature over `timestamp + rawBody`, and it is not Discord's". The
second is the endpoint working. An unsigned curl is exactly what it is supposed to refuse.

`npx wrangler secret list --config wrangler.apple.jsonc` on the apple worker:

```
ADMIN_KEY  DISCORD_PUBLIC_KEY  MEMBERSHIP_OUTBOX_TOKEN  ROBLOX_API_KEY  SENTRY_DSN
STRIPE_PRICE_BUILDER  STRIPE_PRICE_STUDIO  STRIPE_SECRET_KEY  STRIPE_WEBHOOK_SECRET
```

`DISCORD_PUBLIC_KEY` is already set. Somebody put it there and the ledger row was never re-read.

## What is genuinely still blocked, and it is not the endpoint

Two things, and only one of them is a credential.

**1. `DISCORD_BOT_TOKEN` — owner-only.** `index.ts:3089` refuses `/api/discord/register` without
it, and `discord.ts:537` needs it to `PUT /applications/{id}/commands`. No slash command exists on
Discord's side until that call succeeds, so no interaction is ever sent to us and the live 401
above is the only thing anyone will ever see. Creating a bot token needs the owner's Discord
developer account.

**2. The Interactions Endpoint URL — owner-only, and nobody has written it down before.** Even with
a token and registered commands, Discord only delivers to the URL configured in the application's
settings page. It must be set to
`https://apple.moshe-barami111.workers.dev/api/discord/interactions`, and Discord validates it by
sending a signed PING at the moment it is saved. That request will succeed today: the public key is
already deployed and the PING path is reachable. This is the one step that turns the endpoint from
correct-and-unused into live.

## A value in `.env` that the product never reads

`DISCORD_APPLICATION_ID` is in `.env` and appears **nowhere** in `apps/`, `packages/`, `scripts/`
or `infra/` — checked by grep across all four. `discord.ts:531` says why, deliberately:

> The application id is READ FROM DISCORD rather than configured, so the owner has one fewer value
> to copy correctly.

So of the two values the owner supplied, one was already deployed and the other is read by nothing.
The one that would unblock anything is the bot token, and it is not there.

## What does NOT need a bot token, which is worth knowing before anyone goes looking

The reply path. `discord.ts:521` edits the original interaction response with
`PATCH /webhooks/{application_id}/{interaction_token}/messages/@original` and sends **no
authorization header** — an interaction token authenticates itself. So once commands are
registered, every `/apple ...` command can answer, defer, and edit its reply with no bot token in
the worker at all. The token is needed once, to register; not per request.
