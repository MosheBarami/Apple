# Docs

Start with these six, in this order.

| # | Read | Why |
|---|---|---|
| 1 | [`autonomy/v3/Apple_RbxAI_HANDOFF_V3.md`](autonomy/v3/Apple_RbxAI_HANDOFF_V3.md) | the owner's locked scope (V3); it wins over every older document |
| 2 | [`autonomy/MISSION.md`](autonomy/MISSION.md) | the mission in one page |
| 3 | [`autonomy/CURRENT_STATE.md`](autonomy/CURRENT_STATE.md) | what is measured and what is not |
| 4 | [`autonomy/NEXT_ACTION.md`](autonomy/NEXT_ACTION.md) | the queue |
| 5 | [`../AGENTS.md`](../AGENTS.md) | the map of the repository and what will bite you |
| 6 | [`../platforms/README.md`](../platforms/README.md) | how Cloudflare, Supabase, Sentry, Stripe, Discord, Roblox and GitHub are wired |

**Which document wins when two disagree:** V3 (`autonomy/v3/`) over `autonomy/DECISIONS.md` over `DECISIONS.md`.
Anything dated before 2026-09-28 is history unless a newer document repeats it.

## Folder map

| Folder | What is in it |
|---|---|
| [`autonomy/`](autonomy/README.md) | live status, the V3 scope and gates (`ACCEPTANCE.json`), decisions, the owner queue. Other tooling reads these paths; do not move them |
| [`architecture/`](architecture/) | how the system works: composition, thinking UX, the visual loop, playtest viewport, scale and budget sharding, scripting curriculum, source intelligence, asset pipeline; [`knowledge/`](architecture/knowledge/) holds the retrieval design and its measurements |
| [`design/`](design/) | the visual design system: lock, type, style spec, tenancy, palette split. `DESIGN-SPEC.md` is superseded and kept because code comments cite it |
| [`operations/`](operations/) | releasing the plugin, security review and triage, load test, the Apple OS notes ([`apple-os/`](operations/apple-os/)), and `REPO-CLEANUP-PENDING.md` (what still needs the owner's yes) |
| [`playbook/`](playbook/README.md) | the working rules and guards agents follow; tests check it, so it stays |
| [`research/`](research/README.md) | pre-V3 research: competitors, models, pricing, free-tier limits, art direction. Dated 2026-08-30 to 2026-09-25 |
| [`evals/`](evals/) | evaluation method, results and findings. `RESULTS.md` is generated: do not hand-edit |
| [`training/`](training/) | the archived training and corpus research (training itself is cancelled in V3; `packages/training` is not a workspace member) |
| [`gauntlet/`](gauntlet/README.md) | the visual gauntlet: rubrics, rounds, reference libraries (large; the dashboard and langflow read it) |
| [`audit/`](audit/) | the 2026-09-14 audits still cited by code: provider audit, safety models, training v1 report |
| [`backlog/`](backlog/) | open handoffs and `DEADENDS.md` (read by `scripts/checks/check-deadends.mjs`) |
| [`evidence/`](evidence/README.md) | one file per experiment or run. Frozen history: never rewritten, only pruned when nothing cites it |
| [`spec/`](spec/DONE.md) | the owner's definition of "finished" (2026-09-20); V3 supersedes its scope |
| [`sgsd/`](sgsd/SGSD-ORCHESTRATOR.md) | the archived SGSD loop; read only when asked to run it |
| [`releases/`](releases/) | release notes (written by `scripts/release.mjs`) |

## Single files that stay at the top level (tests or tools read these paths)

| File | Bound by |
|---|---|
| `COST-MODEL.md` | `economics.test.mjs`, `scripts/checks/check-credit-figures.mjs` |
| `DECISIONS.md` | `success-metrics.test.mjs`, the owner dashboard |
| `FAILURES.md` | `failures-linked.test.mjs`, `failure-coverage.test.mjs` |
| `DISCORD-SETUP.md` | `discord-route.test.mjs` |
| `GO-LIVE.md` | the secret-scan fixture register |
| `SOURCE_MANIFEST.md` | written by `packages/corpus/src/manifest.mjs` |
| `RELEASES.json` | `scripts/release.mjs` |
| `WORLD-BUILDER-HISTORY.md` | cited by the frozen Crystal Canyon benchmark source |
| `BLOCKERS.md`, `CHECKPOINT*.md`, `FINISH-REPORT*.md`, `MISSION-*.md`, `PASS-*.md` | the earlier "finish the product" ledger cluster, kept until the owner agrees to retire it (see `operations/REPO-CLEANUP-PENDING.md`) |
