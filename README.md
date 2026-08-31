# Golem

**Describe it. Golem builds it.** — an AI SaaS that takes a Roblox game from idea to working
experience, through one assistant that lives in a web workspace and inside Roblox Studio.

- **Live**: https://golem.moshe-barami111.workers.dev
- App: `/app` · Docs: `/docs` · Status: `/status`
- Studio plugin: installed from the Roblox Creator Store (see ADR-017). The legacy
  `/plugin.rbxm` download is retired and is no longer a supported install path.

## How it works

A Cloudflare Worker is the entire backend: Hono API + Durable Objects
(per-project agent sessions, quota ledgers, pairing) + Workers AI (open-weight models:
gpt-oss-120b, Qwen3-30B) + Vectorize/D1 hybrid RAG over the Roblox creator docs.
Supabase provides auth (ES256/JWKS — the worker holds no auth secrets) and the project
registry behind RLS. The Studio plugin (Luau, built with Rojo) long-polls the project's
Durable Object and executes typed ops with ChangeHistoryService undo around every change.

```
browser ── WebSocket ──▶ SessionDO ◀── long-poll ── Studio plugin
                          │  agent loop (alarm-driven steps)
                          │  checkpoints (gzipped snapshots in DO SQLite)
                          ▼
                     Workers AI  +  Vectorize/D1 RAG
```

## Repo layout

| Path | What |
| --- | --- |
| `apps/worker` | The backend: API, DOs, gateway, RAG, static serving |
| `apps/web` | App SPA (Vite + React) served at `/app` |
| `apps/site` | Marketing site (Astro) served at `/` |
| `apps/plugin` | "Golem for Studio" plugin (Luau + Rojo) |
| `packages/shared` | Wire protocol + domain types |
| `packages/corpus` | RAG corpus pipeline (creator-docs, CC-BY-4.0) |
| `packages/evals` | Roblox-specific model eval harness + tasks |
| `infra` | Migrations, deploy scripts, e2e tests |
| `docs` | Decisions (ADRs), research, eval results |

## Develop & deploy

Secrets live in `.env` (gitignored). See `docs/DECISIONS.md` for architecture rationale and
the deploy runbook in memory/`infra`:

```
pnpm install
cd apps/worker && pnpm exec wrangler deploy     # API
node infra/deploy-static.mjs                    # site + app -> D1 static store
cd apps/plugin && rojo build -o release/golem-plugin.rbxm
node infra/e2e.mjs                              # production end-to-end test
```
