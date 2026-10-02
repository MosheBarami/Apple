# Discord

A bot (slash commands `/link /unlink /build /status /credits`) and a community server.

| Piece | Where |
|---|---|
| Interactions endpoint | `POST /api/discord/interactions` on the worker (`DiscordDO` holds link state); refuses with 503 when its secrets are absent |
| Secret names | `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` (`apps/worker/src/env.ts`) |
| Server provisioning | `discord-server.mjs` here: idempotent, re-run it after editing its declaration of roles, channels, forums, AutoMod and onboarding |
| Setup runbook | `docs/DISCORD-SETUP.md` (kept at that path: `apps/worker/tests/discord-route.test.mjs` reads it) |
| Tests | `apps/worker/tests/discord-*.test.mjs` |

Status 2026-09-24 per `docs/DISCORD-SETUP.md`: live. The 2026-09-21 backlog note that the bot answers 503 was
stale; an unsigned request is correctly refused with 401.
