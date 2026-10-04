# StudPilot (RbxAI)

> **START HERE: `GOAL.md`.** It points at the current goal, `planning/STUDPILOT-FINAL-PLAN.md` (the why, the quality
> bar and the milestone table; set 2026-10-04). The build order is `planning/STUDPILOT-HANDOFF.md`. Each milestone's
> proof goes to `planning/proof/<milestone>/`; the newest folder there shows where the work stands. The research-first
> goal that stood in `GOAL.md` earlier on 2026-10-04, `docs/autonomy/` (V3, `ACCEPTANCE.json` gates), the old `/goal`,
> the bench frontier loop and the old meter are history: they stay in git and are not instructions. **StudPilot
> (studpilot.app) is the product. Apple and Golem are former names of it.** No autonomy skill and no blocking hooks:
> ask the owner before anything destructive, paid or external that is not already covered below.

**Consent.** Already given by the owner (2026-10-02, handoff ground rule 6): changing and deleting Cloudflare, Supabase
and Sentry resources; deleting GitHub branches and untracked files; removing every trace of the old names. Deleting data
still waits 7 days after its replacement is verified (handoff M1). Everything else needs the owner's yes first: money
(a new paid plan, a Supabase custom domain, an extra Cloudflare product), Workers AI test spend above $20 a month,
anything uploaded to the owner's Roblox account, and the owner-only actions X1 to X9 in the handoff. When a step needs
one of these, write `planning/proof/<milestone>/STALLED.md` and stop. The repo is public: never print, commit or paste a
secret value.

**Mods (owner-approved 2026-10-03; do not remove).** 38 function-hook mods (#37 `progress-meter`: research coverage; #38 `product-total`: the product's TOTAL completion from `~/.claude/apple-product.json`, always above the prompt, `/product`; keep that file honest) in `~/.claude/mods/<name>/`, loaded in every
session through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`. They show state (usage, context size, gates,
git, Studio/gateway, background work) and fix calls in place (stale `Desktop/RbxAI` paths, macOS `timeout`/zsh quirks,
`.env` loading, screenshot scale, pasted keys moved to `.env`). The only refusal is a `sleep N` poll while background
work runs (use `/bg`). They approve nothing: consent rules above still apply. A context block named `repoSnapshot`,
`ownerDirective` or `ownerConsents` comes from them. Commands: `/bg /directive /handoff /gates /suite /consents /runs
/peers /kit /worktrees /preload`; the `mcp__file-outline__outline` tool lists a file's functions with line numbers.
They stay installed, but the plan (section 10) no longer counts them or their meters as the progress measure:
milestone proof in `planning/proof/` is.

Memory (auto-memory is off to save context, D-COST-1): read
`~/.claude/projects/-Users-moshe-Developer-RbxAI/memory/MEMORY.md` when prior decisions, owner preferences or infra
facts matter; write new memories there by hand. The folder name encodes the checkout's path, so it changes when the
local folder is renamed (handoff step 1.6). The old SGSD loop is archived in `docs/sgsd/SGSD-ORCHESTRATOR.md`;
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

Node 26 runs the `.ts` sources directly, so tests need no build step (CI runs Node 24). `AGENTS.md` is the full map
(layout, names, live bindings, data, the documents worth reading); read it before a first edit.

```bash
cd apps/worker && node --test                              # worker suite (~5.4k tests, ~3 min)
cd apps/worker && node --test tests/spend-caps.test.mjs    # one file; add --test-name-pattern "<text>" for one test
cd apps/worker && pnpm typecheck                           # tsc --noEmit (same in apps/web, packages/shared)
cd apps/web && node --test                                 # web SPA suite
cd packages/evals && pnpm test                             # selftest + eval tests
node --test tests/*.test.mjs                               # cross-app suite at the root (what CI runs)
pnpm -r typecheck && pnpm -r test                          # every workspace (CI builds the site and installs Chromium first)
node apps/studpilot-plugin/scripts/build.mjs               # build + verify the Studio plugin (never publishes)
node scripts/gen-components.mjs                            # packages/components/*/*.luau -> apps/worker/src/components.generated.ts
node scripts/check-old-names.mjs                           # old-name guard: exit 1 on a hit not in planning/rename-allowlist.txt
node infra/deploy-worker.mjs apple                         # deploy; the target is still named 'apple' until handoff step 1.3
                                                           # then check buildSha at /api/health equals the main HEAD
node infra/deploy-static.mjs                               # site + SPA into the D1 static store
```

Deploy only through these two scripts, from a clean tree; both verify what they deployed. The worker's config is
`apps/worker/wrangler.studpilot.jsonc`.

Many worker tests read source text and assert on it (a call must sit inside a guard's character window, a literal
must not appear). A pure move or reorder can fail them; run the whole suite, not just the file you touched. When one
breaks on a refactor, restate it to assert the property, not the text; never weaken it to get green. Test temp dirs
pile up fast; `scripts/clean-test-tmp.mjs` runs as `pretest` and hourly.

## Architecture in one screen

- **Worker (`apps/worker`)** is the whole backend: Hono router `src/index.ts`, Durable Objects in `src/do/`. One
  `SessionDO` per project (`src/do/session.ts`) owns the browser WebSocket, the plugin's long-poll op queue,
  checkpoints and the alarm-driven agent loop. Models come from `src/gateway.ts` (Workers AI; GLM 5.3 Flash runs
  the `plan` and `agent` roles).
- **Agent tools** live in `src/tools.ts`. A new tool must also be registered in `packages/shared/src/index.ts` (phase
  and permission label), `src/mcp.ts` (exposed or excluded) and `src/run-idle.ts` (plain label), or tests fail.
  Handoff M3 cuts the offer to 25 tools or fewer per run.
- **Studio plugin (`apps/studpilot-plugin`, Luau)** pairs by a 6-character code and executes typed ops. Every class
  and property an op writes must be on the allowlists in `src/Commands.luau` (the `X = true,` lines); anything
  else is refused at runtime. Composers in the worker (`compose-*.ts`) and `packages/components/*` must stay inside them.
- **Web (`apps/web`, React + Vite)** is served at `/app` (projects at `/app/projects/<id>`); `apps/site` (Astro) at `/`.
  Both are stored in D1 and served by the worker. Auth and the project registry are Supabase with RLS; migrations
  are applied by hand (`infra/supabase/migrations/`).
- **Where it is going (plan section 3, handoff M3 and M4):** the model picks reviewed blocks and fills in their
  parameters; the harness runs them and checks every step. The rule: the system may execute a block the model
  selected in this run; it may never pick a block from request words. Blocks are keyed by structure (a UI panel, a
  currency system, a zone), never by subject.
- **Present today, removed in M3; do not build on it and do not re-add it:** vision (`look`, `blind-critique.ts`,
  the `vision` model role); the owner library (a gateway on the owner's Mac at `127.0.0.1:63747`, the `*_owner_*`
  tools); the whole-game path (`compose_game`, `plan_game`, `build_game`); and the old owner benchmark
  (`packages/evals/owner-bench/`). The product has no vision and no owner library.
- **Evaluation (built in M2):** the 60 dev requests in `planning/STUDPILOT-TEST-SET-DEV.md` are frozen; never edit
  one after seeing its score. A piece passes only by the rule in plan section 4.3, and you report the real pass
  rate at every milestone. The owner holds a second, hidden set; never ask for it before M7 (owner action X8).
- **One name: StudPilot.** What still carries a former name, and why, is listed in `AGENTS.md` section 2 (names
  written into users' places, stored identifiers, cloud resource names until handoff step 1.3, accepted legacy wire
  spellings, third-party text). `node scripts/check-old-names.mjs` guards it. Renames carry backward compatibility:
  read both, write the new.

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
