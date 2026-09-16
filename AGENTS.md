# AGENTS.md — what this repository is, where everything is, and what will bite you

You are almost certainly an agent. This file is the map. Read it before the first edit, together
with `.claude/skills/rbxai-working-rules/SKILL.md`, which is the **method** and loads automatically.

Every number below was measured on 2026-09-16, not remembered. Where a number will drift, the
command that produced it is beside it.

---

## 1. The product

**Apple** — an AI that builds Roblox experiences *inside the user's own Roblox Studio*. Not a
generator that hands you a file: a Studio plugin pairs to a project, the agent reads the place the
user actually has open, takes a checkpoint, then writes Luau and places parts into it. Every step is
named while it happens and can be stopped mid-run.

It is a SaaS: subscriptions plus Credits, a free daily allowance, and a hard quota that is the same
number shown burning down in the workspace.

Live at `https://apple.moshe-barami111.workers.dev`. The owner is one person, non-technical, who
reads Hebrew and reads neither `docs/` nor code.

**Two names.** The product is **Apple**. The infrastructure is still **golem** — worker name, D1
database, KV namespaces, wire literals (`golem.v1`, `X-Golem-`, `golem_session`, `@golem/`).
That is deliberate: renaming a binding or a wire literal breaks live sessions and stored rows.
Rename neither. `scripts/check-rebrand.mjs` polices the user-visible half only.

---

## 2. Where the 18 GB actually are

```
du -sh .claude node_modules packages docs .git apps
```

| | Size | What it is |
|---|---:|---|
| `.claude/worktrees/` | **15 G** | **58 abandoned agent worktrees.** Not project data. |
| `packages/training/` | 752 M | LoRA adapters (210 M) and MLX training data |
| `packages/corpus/` | 770 M | the knowledge and asset corpus — see §5 |
| `node_modules/` | 506 M | |
| `.git/` | 211 M | |
| `docs/` | 91 M | 88 M of it is `docs/evidence/` — 49 recorded runs |
| `apps/` | 54 M | all five applications |

**The source you will actually edit is about 2 MB of it.** If you are looking for something and
finding gigabytes, you are in the corpus, the adapters, or the worktrees.

---

## 3. The code

```
apps/
  worker/     the whole backend — Hono on Cloudflare Workers. 137 TypeScript files.
              index.ts is the router (~7k lines); do/ holds the Durable Objects;
              tools.ts is the agent's tool registry.
  web/        the app SPA — React + Vite. Routes in src/routes, the workspace in
              src/components/ws (chat, thinking card, composer, panels).
  site/       the marketing site + docs — Astro, static, served from D1.
  plugin/     the Roblox Studio plugin — 8 Luau files. Ships as release/apple-plugin.rbxm.
  benchmark/  model comparison harness.

packages/
  shared/     the wire contract. Types, mode tables, plan limits. Both sides import it.
  corpus/     the knowledge base and the asset library (§5).
  evals/      the eval + security suites. security.test.mjs is the standing proof of the
              trust boundaries; acceptance.mjs runs the brief's 20 release scenarios.
  sdk/        the public /v1 API client.
  training/   LoRA training on an M2 Pro via MLX. Not in the request path.
  design/     design tokens. NOT a UI library.

infra/        deploy and operations. deploy-static.mjs and deploy-worker.mjs both verify
              what they deployed — do not bypass them with bare wrangler.
scripts/      the checkers. check-copy, check-deadends, check-backlog, check-credit-figures,
              check-dispositions, gate-check, pick-asset-wall, and others.
tests/        repository-level tests that cross app boundaries.
```

**Test counts** (`ls <dir>/*.mjs | wc -l`): worker 199 · web 136 · evals 96 · root 28 · site 8.
Current totals: **worker 3,184 · web 1,799 · evals 1,328 · site 34**, all green.

---

## 4. The live system

**Two workers, one database.** `golem` and `apple` share the D1 `golem-corpus`. The static site and
the SPA live in D1 tables `static_assets` / `static_chunks` and are served by the worker — there is
no CDN origin to deploy to.

**Durable Objects**, one class each: `SessionDO` (one per project — WebSocket to the browser,
long-poll queue for the plugin, the agent run loop), `QuotaDO`, `BudgetDO`, `PairingDO`, `AdminDO`
(analytics sink), `DiscordDO`.

**Bindings:** `AI` (Workers AI via AI Gateway), `CORPUS` (D1), `KV`, `VEC` (Vectorize).

**Auth and data:** Supabase Postgres with RLS on every table. The worker forwards the caller's own
JWT to PostgREST, so **RLS is the thing deciding** — not the worker. `infra/supabase/tests/rls-isolation.mjs`
is 43 checks proving tenants cannot read each other, and it is the strongest evidence in the repo.

**Migrations are applied by hand.** `infra/supabase/migrations/` holds them; `migrate.mjs` runs
them. Two sat unapplied while the code that needed them shipped, and the dashboard showed loading
skeletons forever. **If a query 400s on a missing column, look here first.**

---

## 5. The data

**`packages/corpus/data/library/` (429 M)** — the asset library. `index.json` is the manifest:

```
total 474,745 assets · 115,803 usable with no upload
creator_store 102,780 · iconify · game_icons · opengameart · cgbookcase · kenney · creator_store_audio 13,023
never harvested: poly_haven, sketchfab
```

Every row carries its licence. That provenance is the product's argument — no rival shows it —
so **never add an asset without one**.

**`packages/corpus/data/chunks.jsonl` (10 M, 8,326 chunks)** — the Roblox creator-docs corpus, the
RAG source behind `search_docs`. **This is the current API.** Do not answer Roblox questions from
memory; the model's training data is older than the platform.

**`packages/corpus/raw/` (316 M, 41 repositories)** — harvested community Luau projects
(ProfileService, Knit, Fusion, …). Read-only reference. **Their CSS and code are not ours** — a
scanner that reports findings in here is scoped wrong.

**`docs/evidence/` (88 M, 49 runs)** — recorded product runs. When a claim needs proof that
something really happened, it is here.

---

## 6. The documents that matter, and when

29 files in `docs/`. These are the ones to read, in this order:

| Read | When |
|---|---|
| `.claude/skills/rbxai-working-rules/SKILL.md` | **before your first edit — always** |
| `docs/playbook/` | you want the worked example behind a rule |
| `docs/FAILURES.md` | before repeating an experiment. 2,000 lines, newest first. F-58 first. |
| `docs/DECISIONS.md` | before changing architecture. ADR-021 is why 73 checklist items are `⊘`. |
| `GATES.md` | 44 gates. A ticked box with no evidence line is unmet. |
| `docs/backlog/CHECKLIST-V2.md` | the owner's list of record — 1,200 items in 60 sections |
| `docs/BLOCKERS.md` | what is known broken |
| `docs/COST-MODEL.md` | every Credit figure on the site derives from this |
| `docs/SECURITY.md`, `docs/MONITORING.md` | trust boundaries; Sentry |
| `docs/THINKING-UX.md`, `docs/VISUAL-LOOP.md` | the run surface and the visual gate |

`packages/evals/src/success-metrics.mjs` prints the current completion figure recomputed from the
marks — **run it rather than quoting a number from a document.**

---

## 7. What will bite you

**The shared checkout.** Several agents edit one tree at once. `git commit` writes the whole
**index**, so staging explicit paths does not protect you — use `git commit -F <msg> -- <pathspec>`
and read `git diff --cached --stat` first. Never `git add -A`, `checkout`, `switch`, `stash`,
`reset`. Never `pnpm install` (F-68: it rewrites the main checkout's workspace symlinks). Never
`cp` a whole-file backup over a source file — a peer may edit it in between.

**Never upload to the owner's Roblox account.** 299 assets were once uploaded without permission and
Roblox refuses to delete Images and Decals. They are permanent.

**Never commit secrets.** `.env` and `apps/worker/.dev.vars` are untracked and stay that way.

**CI must never call a paid provider.** Anything that spends is opt-in and skipped by default.

**Do not rename** D1/KV/Vectorize/DO bindings, or the wire literals in §1.

**Look up library APIs rather than recalling them.** Use Context7. Two defects this week came from
writing an API from memory — a Stripe field that does not exist on that object, and a Cloudflare
method that exists and does nothing.

---

## 8. Ten minutes to orientation

```bash
node packages/evals/src/success-metrics.mjs   # where the product actually stands
git log --oneline -20                         # commit subjects here say what was FOUND
node --test tests/                            # the cross-cutting suite
curl -s https://apple.moshe-barami111.workers.dev/api/health   # what is really running
```

Then open the product. Every finding worth having this week came from looking at the deployed page
or the owner's own account — not from reading the source.

**Commit messages here are the real changelog.** They state what was believed, what was true, and
how it was caught. `git log` is faster than any document in `docs/`.
