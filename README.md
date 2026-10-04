# StudPilot

An AI co-pilot for Roblox Studio. In the web app you describe a piece of your game, such as a shop screen, a pet
system with eggs or a lava zone. A Studio plugin builds it in your own place and checks it.

Site: https://studpilot.app

StudPilot was called Apple, and before that Golem.

## Status

Pre-launch, private beta, free. Payments are switched off. The product is being rebuilt around reviewed building
blocks, and it has not yet met the quality bar set for launch, so this repository makes no claim about how good
the results are. The plan and its milestones are in `planning/STUDPILOT-FINAL-PLAN.md`.

## How it works

You sign in on the web app and pair the Studio plugin with a 6-character code. You type a request. A Cloudflare
Worker runs an agent loop on GLM 5.3 Flash (Cloudflare Workers AI) and sends typed operations to the plugin,
which applies them to your open place. The agent checks its work with a play test, a UI layout check and a build
audit, and the reply is meant to say only what those checks prove. Supabase provides sign-in and the project
registry behind row-level security.

```
browser ── WebSocket ──▶ SessionDO ◀── long-poll ── Studio plugin
                           │  agent loop (alarm-driven steps)
                           │  checkpoints (gzipped snapshots in DO SQLite)
                           ▼
                      Workers AI  +  Vectorize/D1 RAG
```

## Repository layout

| Path | What |
| --- | --- |
| `apps/worker` | The backend: API, Durable Objects, model gateway, retrieval, static serving |
| `apps/web` | The web app (Vite and React) |
| `apps/site` | The marketing site and docs (Astro) |
| `apps/studpilot-plugin` | The Roblox Studio plugin (Luau). Release runbook: `docs/PLUGIN-RELEASE.md` |
| `packages/shared` | The wire protocol and shared types |
| `packages/components` | Luau components the agent installs into a place |
| `packages/corpus` | The retrieval corpus pipeline over the Roblox creator docs. Licences: `packages/corpus/PROVENANCE.md` |
| `packages/asset-library` | Openly licensed (CC0) UI and icon packs |
| `packages/evals` | Eval and security test suites |
| `packages/sdk` | Client for the public API |
| `packages/design` | Design tokens |
| `infra` | Deploy scripts and Supabase migrations |
| `scripts` | Repository checks |
| `tests` | Tests that cross app boundaries |
| `docs` | Decisions, runbooks and recorded evidence |
| `planning` | The plan, the build order and the proof for each milestone |

`apps/plugin`, `apps/benchmark`, `apps/experiences` and a few packages are older code that is still in the tree
and is being removed.

## Run the tests

You need Node 26 and pnpm 11 (the exact version is `packageManager` in `package.json`).

```bash
pnpm install
pnpm -r typecheck
pnpm -r test                        # every workspace
node --test tests/*.test.mjs        # tests at the root that cross app boundaries
cd apps/worker && node --test       # the worker suite alone: about 5.4k tests, a few minutes
```

Tests run offline. CI runs them with no secrets, and no test calls a paid service. A few site tests read the built
site and use Chromium, so CI first runs `pnpm --filter @studpilot/site build` and `pnpm exec playwright install
chromium`. The plugin build, `node apps/studpilot-plugin/scripts/build.mjs`, needs Luau's `luau-analyze` on your
PATH.

## Working on it

`AGENTS.md` is the map of the repository and `CLAUDE.md` holds the working rules; read both before a first edit.
Secrets live in a gitignored `.env`. Never commit one.
