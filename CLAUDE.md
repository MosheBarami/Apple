# Apple (RbxAI)

> **START HERE: `GOAL.md`** (set 2026-10-04 at the owner's instruction; the full planning dossier is `planning/APPLE-PLANNING-DOSSIER.md`). It replaces every earlier goal, mission,
> meter and direction, including `docs/autonomy/` (V3, `ACCEPTANCE.json` gates), the old `/goal`, the bench
> frontier loop and the meter. Those stay in git as history only. Phase now: **research and feed the agent; no
> benchmark runs or test loops.** No autonomy skill and no blocking hooks: ask the owner for consent on anything
> destructive, paid or external.

**Mods (owner-approved 2026-10-03; do not remove).** 38 function-hook mods (#37 `progress-meter`: research coverage; #38 `product-total`: the product's TOTAL completion from `~/.claude/apple-product.json`, always above the prompt, `/product`; keep that file honest) in `~/.claude/mods/<name>/`, loaded in every
session through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`. They show state (usage, context size, gates,
git, Studio/gateway, background work) and fix calls in place (stale `Desktop/RbxAI` paths, macOS `timeout`/zsh quirks,
`.env` loading, screenshot scale, pasted keys moved to `.env`). The only refusal is a `sleep N` poll while background
work runs (use `/bg`). They approve nothing: consent rules above still apply. A context block named `repoSnapshot`,
`ownerDirective` or `ownerConsents` comes from them. Commands: `/bg /directive /handoff /gates /suite /consents /runs
/peers /kit /worktrees /preload`; the `mcp__file-outline__outline` tool lists a file's functions with line numbers.

Memory (auto-memory is off to save context, D-COST-1): read
`~/.claude/projects/-Users-moshe-Desktop-RbxAI/memory/MEMORY.md` when prior decisions, owner preferences or infra
facts matter; write new memories there by hand. The old SGSD loop is archived in `docs/sgsd/SGSD-ORCHESTRATOR.md`;
read it only when asked to run SGSD.

## Karpathy principles (override everything below)

1. **Think before coding.** State assumptions; surface tradeoffs and competing readings instead of picking silently;
   say when a simpler approach exists; name what is unclear.
2. **Simplicity first.** Minimum code for the request. No speculative features, single-use abstractions, unrequested
   configurability, or handling of impossible cases. If 200 lines could be 50, rewrite.
3. **Surgical changes.** Touch only what the task needs; match existing style; don't refactor or reformat adjacent
   code; mention unrelated dead code instead of deleting it; remove only what your change made unused.
4. **Goal-driven.** Turn the task into verifiable success criteria, state a short plan with per-step checks, loop
   until verified.

## Commands

Node 26 runs the `.ts` sources directly, so tests need no build step. `AGENTS.md` is the full map (sizes, live
bindings, data, the documents worth reading); read it before a first edit.

```bash
cd apps/worker && node --test                              # worker suite (~4.7k tests, ~3 min)
cd apps/worker && node --test tests/owner-bench.test.mjs   # one file; add --test-name-pattern "<text>" for one test
cd apps/worker && pnpm typecheck                           # tsc --noEmit (same in apps/web, packages/shared)
cd apps/web && node --test                                 # web SPA suite
cd packages/evals && pnpm test                             # selftest + eval/bench tests
node --test tests/                                         # cross-app suite at the root
node apps/apple-plugin/scripts/build.mjs                   # build + verify the Studio plugin (never publishes)
node scripts/gen-components.mjs                            # packages/components/*.luau -> apps/worker/src/components.generated.ts
node infra/deploy-worker.mjs apple                         # deploy; then check buildSha at /api/health
node infra/deploy-static.mjs                               # site + SPA into the D1 static store
```

Many worker tests read source text and assert on it (a call must sit inside a guard's character window, a literal
must not appear). A pure move or reorder can fail them; run the whole suite, not just the file you touched. Test
temp dirs pile up fast; `scripts/clean-test-tmp.mjs` runs as `pretest` and hourly.

## Architecture in one screen

- **Worker (`apps/worker`)** is the whole backend: Hono router `src/index.ts`, Durable Objects in `src/do/`. One
  `SessionDO` per project (`src/do/session.ts`) owns the browser WebSocket, the plugin's long-poll op queue,
  checkpoints and the alarm-driven agent loop. Models come from `src/gateway.ts` (Workers AI, GLM); the `vision`
  role is also the benchmark judge.
- **Agent tools** live in `src/tools.ts`. A new tool must also be registered in `packages/shared/src/index.ts` (phase
  and permission label), `src/mcp.ts` (exposed or excluded) and `src/run-idle.ts` (plain label), or tests fail.
- **Studio plugin (`apps/apple-plugin`, Luau)** pairs by a 6-character code and executes typed ops. Every class
  and property an op writes must be on the allowlists in `src/Commands.luau` (the `X = true,` lines); anything
  else is refused at runtime. Composers in the worker (`compose-*.ts`) and `packages/components/*` must stay inside them.
- **Owner library:** a gateway on the owner's Mac (`127.0.0.1:63747`) that the plugin reaches; it does not exist in
  CI or the cloud. Live builds, pairing and the benchmark only run on that Mac.
- **Web (`apps/web`, React + Vite)** is served at `/app` (projects at `/app/projects/<id>`); `apps/site` (Astro) at `/`.
  Both are stored in D1 and served by the worker. Auth and the project registry are Supabase with RLS; migrations
  are applied by hand (`infra/supabase/migrations/`).
- **Owner benchmark (`packages/evals/owner-bench/`):** the frozen 30-request bank, `runner.js` (pasted into the
  owner's signed-in browser tab) and `score.mjs`. The evaluator is `apps/worker/src/owner-bench.ts`. Never edit a
  bank item after seeing its score; version the bank instead.
- **Infrastructure names stay `golem`** (worker, D1, KV, wire literals such as `golem.v1`). Renaming breaks live
  sessions; the product name is Apple.

## Closing Recap (repos with `.planning/`)

End every response with this block, last, after answering:

```markdown
## Recap
- **Milestone:** <id and title, or "none, ad-hoc work">
- **Phase:** <id and title, or "n/a">
- **Stage:** <discussed / planned / executing / verifying / closed>
- **Why:** <business/engineering reason in one clause, prefer the milestone core value>
- **Building:** <what is actually being produced>
- **Next:** <one action with owner and trigger, or "none">
```

Source values from `.planning/STATE.md` frontmatter, the milestone `INTENT.md` and `ROADMAP.md`; write `unknown`
rather than guess; never invent a Next action. STATE.md is known to go stale and contradict itself: when sources
disagree, name both values once in the affected line.
