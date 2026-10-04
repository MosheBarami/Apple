# Rename proof

`planning/rename-inventory.md` asks for the platform proof here; handoff 1.4 asks for it in
`planning/proof/M1/platforms/`. It lives in the second place, and this file points to it:

- `../M1/platforms/sentry.json`: the Sentry projects `studpilot-worker` and `studpilot-web` (ids unchanged).
- `../M1/platforms/discord.json`: the bot is "StudPilot" and the interactions endpoint is on `studpilot.app`.
  The application name waits on the owner (`../BLOCKED.md` N3).
- `../M1/platforms/supabase.json`: the project is "StudPilot", the Auth site URL is `studpilot.app`, and the
  allow-list was extended.
- `../M1/platforms/turnstile.json`: the hostname edit was refused (`../BLOCKED.md` N1).
- `../M1/platforms/github.json`: the repository rename (written when it runs).
- Stripe: waits on the owner (`../BLOCKED.md` X5, N5).
- Cloudflare: `../M1/counts-after.json` and `../M1/LOG.md`.
