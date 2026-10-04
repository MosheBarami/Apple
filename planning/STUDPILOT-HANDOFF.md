# StudPilot: Claude Code handoff (v1, 2026-10-04)

**Read this whole file, then `planning/STUDPILOT-FINAL-PLAN.md`, then start at task 0.1.**

This file is the build order. The plan says *why*; this says *what, where, in which order, and how to prove it*.

---

## Start-here prompt (the owner pastes this into a new Claude Code session in `~/Developer/RbxAI`)

> You are building StudPilot (formerly Apple/Golem). Read `planning/STUDPILOT-HANDOFF.md` and `planning/STUDPILOT-FINAL-PLAN.md` fully. Then read `.claude/skills/rbxai-working-rules/SKILL.md` and follow it.
>
> Execute the handoff tasks in order. Work autonomously; the owner checks in only at the end.
>
> After each milestone, write `planning/proof/<M>/SUMMARY.md` with measured numbers only.
>
> Stop and write `planning/proof/<M>/STALLED.md` if a milestone fails its acceptance test after 3 honest fix cycles, or if a step needs money, a legal action or a decision listed under "Owner-only".
>
> Never report a test as passing that you did not just run.

---

## Ground rules (apply to every task)

1. **Honesty is the product.**
   - Measured numbers only.
   - "Not verified" is an allowed answer; a claimed pass you did not observe is not.
   - The owner's top frustrations: false success claims, endless testing with no progress, and redesigns that change nothing.
2. **Git rules** (from the working-rules skill):
   - Never `git add -A`, `git add -u`, `git checkout`, `git switch`, `git stash` or `git reset` in the shared checkout.
   - Commit explicit paths with `git commit -F <msgfile> -- <paths>`.
   - Never run `pnpm install` inside an in-repo worktree.
3. **Secrets:**
   - Never print, commit or paste secret values.
   - **Owner decision (2026-10-04, after M0):** Claude Code and other agents have full read and write access to `.env`. The `.env` deny entries were removed from `.claude/settings.json` at his request; do not re-add them. Values must still never be printed, pasted into chat or logs, or committed.
   - The repo is **public**.
4. **One agent:** Codex is paused (owner task X1). If you see recent commits from another agent on your branch, stop and write `STALLED.md`.
5. **Budget:**
   - Workers AI spend for testing must stay ≤ **$20/month**. Check `GET /api/admin/spend` before and after each test batch, and log it to `planning/proof/ops/spend.md`.
   - Anything that costs money needs the owner's yes. Examples: new paid plans, a Supabase custom domain, extra Cloudflare products.
6. **Consent already given** (2026-10-02, still valid):
   - changing and deleting Cloudflare, Supabase and Sentry resources;
   - deleting GitHub branches and untracked files;
   - removing every trace of the old names.
   - Data deletions still follow the 7-day hold in M1.
7. **No vision in the product. No owner library in the product.** Do not re-add either.
8. **Tests that pin source text** (about 111 worker test files) will break on refactors. Rewrite them to assert the *property*, not the text.

---

## Owner-only actions (Claude Code cannot do these; list them in the final report if still open)

| ID | Action | When |
|---|---|---|
| X1 | Pause Codex (close its app and sessions on this Mac) | Before task 0.1 |
| X2 | Install the video plugin in Claude Code: `/plugin marketplace add bradautomates/claude-video` then `/plugin install watch@claude-video` | Before task 5.1 (the owner's settings already show `watch@claude-video` enabled) |
| X3 | Approve the spend caps proposed in task 0.5 (or give other figures) | During M0 |
| X4 | Regenerate the Roblox OAuth client secret (Creator Dashboard → OAuth apps → StudPilot) and put the new one in `.env` | Before public launch (M7) |
| X5 | Find an adult Stripe account holder | Before charging |
| X6 | Trademark check of "StudPilot" | Before public launch |
| X7 | Decide on Creator Store plugin publishing | After M7 |
| X8 | Give the hidden test set (claude.ai Project doc `claude/hidden-test-set.md`) to Claude Code | At M7 only |
| X9 | Record and upload the <1-minute OAuth demo video, then press "Submit for review" | M7 (Claude Code prepares the script) |

---

## M0: Safety and one repo

**0.1 Gather the deployed code into the main repo.**
- Production runs `2ffd22db` (branch `research-feed`). It lives in `/Users/moshe/Developer/RbxAI-rename/.git` (worktrees `RbxAI-feed` and `RbxAI-fix-r3`) and in `RbxAI-ci`, but **not** in `~/Developer/RbxAI`.
- Run:
  ```
  git -C ~/Developer/RbxAI fetch ~/Developer/RbxAI-rename research-feed:refs/heads/research-feed fixes-0410:refs/heads/fixes-0410 site-v4:refs/heads/site-v4 web-v4:refs/heads/web-v4
  git -C ~/Developer/RbxAI fetch ~/Developer/RbxAI-search search-90:refs/heads/search-90
  git -C ~/Developer/RbxAI fetch ~/Developer/RbxAI-reorg repo-reorg:refs/heads/repo-reorg
  ```
- **Verify:**
  - `git cat-file -t 2ffd22db` prints `commit`.
  - `curl -s https://studpilot.app/api/health` shows `buildSha` starting `2ffd22db`. If the health route has moved, use the `apple.moshe-barami111.workers.dev` URL.

**0.2 Make the deployed lineage `main`.**
- Create `studpilot/main` from `research-feed` and push it.
- Open a PR into `main` titled "Make the deployed lineage main", and merge it with a merge commit, not a squash.
  - `main` (`f8991a96`) has 0 commits that `research-feed` lacks except those listed by `git log research-feed..main`. Cherry-pick any that are missing.
- **Verify:** `git rev-parse origin/main` contains `2ffd22db` as an ancestor (`git merge-base --is-ancestor 2ffd22db origin/main`). CI is green on `main`.

**0.3 Commit the planning work.**
- Commit `GOAL.md` (rewritten to a 5-line pointer: "The current goal is planning/STUDPILOT-FINAL-PLAN.md"), `research/` and `planning/`. Do **not** commit raw video transcripts.
- Narrow `.gitignore:250` (`handoff/`) so that `docs/handoff/` is tracked.
- **Verify:** `git ls-files research planning | wc -l` > 0. `git check-ignore docs/handoff/2026-10-04/design-language-v4.md` prints nothing.

**0.4 Secrets hygiene.**
- `chmod 600 .env`.
- ~~Restore the `.env` deny entries in `.claude/settings.json`.~~ Superseded 2026-10-04: the owner granted agents full read and write access to `.env`, and the `.env` deny entries were removed. Only `Read(**/.dev.vars)` remains denied.
- Move `.backups/` out of the repo folder, to `~/StudPilot-backups/`.
- **Verify:** `stat -f %Sp .env` → `-rw-------`. `scripts/secret-scan.py` passes.

**0.5 Restore spend caps.**
- In `apps/worker/src/pricing.ts`, replace the never-binding values. Planner defaults, pending owner task X3:
  - `BILLABLE_NEURONS_PER_MONTH = 2_270_000` (≈ $25/month; corrected, the first version said 2_270_000_000, 1,000× too high);
  - `BILLABLE_NEURONS_PER_DAY = 150_000` (≈ $1.65/day; corrected from 150_000_000).
- Add a test: monthly cap × $0.011/1000 ≤ $25.
- **Verify:** `pnpm --filter ./apps/worker test` green. `/api/admin/spend` shows the new caps after deploy.

**0.6 Deploy cleanly.**
- Run `node infra/deploy-worker.mjs apple` from a clean tree.
- **Verify:** health `buildSha` equals `git rev-parse --short HEAD`, with no `-dirty`.

**0.7 Clean the worktrees.**
- Remove the 4 finished fix worktrees (`RbxAI-fix-agent`, `-fix-assets`, `-fix-r2`, `-fix-ui`) and `git worktree prune`.
- List the 13 `.claude/worktrees/wf_*` worktrees and their status in `planning/proof/M0/worktrees.md`. Delete only those whose tip is contained in `main` and that have no uncommitted files. Leave the rest for the owner.
- **Verify:** `git worktree list` matches the file.

**M0 acceptance:** plan §9 M0 (1)–(5). Write `planning/proof/M0/SUMMARY.md`.

---

## M1: Full rename to StudPilot and the move to `studpilot.app`

Source of truth: `planning/rename-inventory.md`. Also read `docs/operations/GOLEM-REMOVAL-RUNBOOK.md` (feed lineage). Do one step per sitting, with verification and a rollback note for each step.

**1.1 Take counts before changing anything.**
- Record counts for every Durable Object class (sessions/projects, quota rows, pairings, budget ledger, admin audit, discord links), D1 tables (`chunks`, `static_assets`, …), Vectorize vector count, R2 object count, KV key count, and the Supabase table row counts.
- Write them to `planning/proof/M1/counts-before.json`, using the admin API (`/api/admin/stats`, `corpus-census`) plus the Cloudflare and Supabase MCP tools.

**1.2 Rename the code. One PR, many commits, in this order:**
1. Packages `@apple/*` → `@studpilot/*`. Update every import and `pnpm-workspace.yaml`. Run `pnpm install` in the main checkout only, never in a worktree.
2. Env and config names:
   - `APPLE_*` / `GOLEM_*` → `STUDPILOT_*`;
   - `GOLEM_ADMIN_KEY` → `STUDPILOT_ADMIN_KEY`, keeping the old names as fallbacks for one release;
   - `wrangler.apple.jsonc` → `wrangler.studpilot.jsonc`;
   - delete `wrangler.jsonc` (the `golem` Worker).
3. User-facing copy: page titles (`apps/site`, `apps/web`), emails, the plugin UI and its name ("StudPilot"), Discord bot text, logo and favicon placeholders.
4. Wire protocol (plugin ↔ Worker):
   - add `X-StudPilot-*` headers and the `studpilot.v1` protocol;
   - keep accepting `X-Apple-*`, `X-Golem-*`, `golem.v1` and `apple` for one release (`compat: wire-all`).
   - **Verify:** health reports legacy-spelling counters.
5. Docs: rewrite `README.md`, `AGENTS.md` and `CLAUDE.md` from scratch to match the new plan (they are stale in about 14 places).
   - Add one line to the history docs: "Apple and Golem are former names of StudPilot".
   - Leave `docs/autonomy/` and the ADRs unchanged.
6. Guards:
   - extend `scripts/check-no-golem.mjs` → `scripts/check-old-names.mjs`, covering apple and golem, case-insensitive;
   - its allowlist goes in `planning/rename-allowlist.txt`, one reason per line;
   - add it to CI.
- **Verify:** `pnpm -r typecheck`, `pnpm -r test`, `node --test tests/*.test.mjs` and the plugin build `node apps/apple-plugin/scripts/build.mjs` (renamed path afterwards) all pass. `node scripts/check-old-names.mjs` prints 0 un-allowlisted hits.

**1.3 Rename Cloudflare. Data first, names second.**
1. Create a new Worker `studpilot` from `wrangler.studpilot.jsonc`:
   - new D1 `studpilot-corpus`: export `golem-corpus` with `wrangler d1 export`, import, compare row counts;
   - new Vectorize `studpilot-docs`: re-insert, compare counts, run one search;
   - new R2 `studpilot-media`: copy objects, compare counts;
   - KV: rename the title `golem-kv` → `studpilot-kv` (the ID is kept);
   - new queue `studpilot-notifications`, Analytics Engine `studpilot_product_events`, Workflow `studpilot-model-upload`.
2. Durable Objects: a new script name means **new, empty** DO namespaces.
   - Write a one-time migration: admin route `/api/admin/migrate-do` on the old Worker streams each DO's storage to the new one, under an owner-approved maintenance window of ≤15 minutes with a banner.
   - Or bridge with `script_name` bindings and migrate lazily.
   - Pick the option that keeps **0 data loss**, and prove it with counts.
3. Move the custom domain `studpilot.app` from `apple` to `studpilot`.
4. Make `apple.moshe-barami111.workers.dev` and `golem.moshe-barami111.workers.dev` return 301 to `https://studpilot.app` (keep for 90 days).
- **Verify:**
  - `planning/proof/M1/counts-after.json` equals counts-before for every store;
  - a real old project opens with its chat history on `studpilot.app`;
  - the plugin pairs;
  - a chat run completes.
- Delete the old resources after 7 days, with the counts re-checked first. The deletions are listed in `planning/proof/M1/deletions.md`.

**1.4 Rename the other platforms.**

| Platform | Change | Notes |
|---|---|---|
| Supabase | Project `AppleAI` → `StudPilot` | Management API with `SUPABASE_ACCESS_TOKEN`, or ask the owner |
| Supabase Auth | Site URL `https://studpilot.app`; redirect allow-list (`https://studpilot.app/**`, keep the old URLs for 90 days) | Email templates and sender name "StudPilot" |
| Sentry | Read the org and project names first (`SENTRY_ORG`), then rename to `studpilot` | Releases `studpilot@<sha>`. The DSN does not change |
| GitHub | Rename `MosheBarami/Apple` → `MosheBarami/StudPilot` (`gh repo rename`) | Update remotes and badges |
| Discord | App and bot name → StudPilot; new avatar | Discord Developer API with `DISCORD_BOT_TOKEN`, or ask the owner |
| Stripe | Test-mode product names and statement descriptor | |

- **Verify:** screenshots or API output for each platform are saved in `planning/proof/M1/platforms/`.

**1.5 Domain follow-through (task O0 in `roblox-oauth-setup.md`).**
- Check CORS and allowed origins, cookie domain, the Supabase redirect, and the plugin's API base URL. Set the plugin's API base to `https://studpilot.app` and keep the old base as a fallback for one release.
- **Verify:** Google, Discord and email sign-in work on `studpilot.app`. Roblox sign-in comes in M2.

**1.6 Local folders (last).**
- Ask the owner in `STALLED.md` before renaming `~/Developer/RbxAI` → `~/Developer/StudPilot`. The Claude Code project paths and memory folders change with it.
- Delete the sibling clones only after confirming that every ref they hold is in the main repo.

**M1 acceptance:** the "Acceptance test" section of `rename-inventory.md`, in full.

---

## M2: Web app, site and brand (moved up by the owner on 2026-10-04: right after M1)

**Why it moved, and the rules that follow from it:**
- The owner wants the new design language before the agent work. The site and app therefore ship **before** any piece has passed the bar.
- **No fake output.** Do not show any build result that did not really happen. The landing hero and the catalog use real product UI (the web app and the plugin in Studio). They also explain the four piece types, with no example results yet.
- Pieces that pass the critic in M5 are added to the catalog and hero in M7.
- **Pricing page:** shows the decided plans from `planning/pricing-2026-10-04.md`, marked "Free while in beta. Paid plans start later". Checkout stays off.
- **Copy:** must not claim anything the product does not yet do. Use the honest promise wording from plan §1, marked as beta.
- **Roblox sign-in moves here:** do OAuth tasks O0–O3 and O5 from `planning/roblox-oauth-setup.md` in this milestone. Upload task O4 stays in M5c.


**2.1 Design system (new design language).**
- Dark professional base with **one bright accent colour**. Propose 3 accents, render them on the landing hero, and pick the one the blind critic rates highest.
- New logo and favicon. Delete the 3 old logos.
- Tokens go in `packages/design`.

**2.2 Rebuild the site in `apps/site` (Astro).**
- Pages: landing, how it works, catalog (in M2: the four piece types with real product UI. Pieces that passed in M5 are added at M7), pricing (beta label), docs, blog index, privacy, terms.
- Do not reuse old layouts. Save old vs. new screenshots side by side in `planning/proof/M2/`.

**2.3 Rebuild the app in `apps/web` (React).**
- Sign-in: Google, Discord, email, and Roblox.
- 13+ birth-date gate at sign-up.
- Projects: one-click create, no description.
- Chat: live step list plus screenshots.
- Piece history.
- Per-piece settings panel. In M2 the UI is built against a stub. It is wired to block params in M5, where it edits a block's params and re-runs only that block.
- Usage and credits.
- Account connections.
- Growth features: share button, referral (credits), optional "Made with StudPilot" badge block.

**2.4 Rewrite the privacy and terms pages.**
- Cover the Roblox OAuth data held, no AI training on Roblox data, anonymised opt-out improvement data, deletion, and 13+.
- Fix the old training-opt-in contradiction (`apps/site/tests/privacy-claims.test.mjs` must reflect it).

**2.5 Deploy.**
- Run `node infra/deploy-static.mjs`.
- **Verify:**
  - Lighthouse ≥90 on landing and pricing;
  - WCAG AA contrast;
  - the critic scores the landing ≥8 on "looks like a top-tier product".

**M2 acceptance:** plan §9 M2.

---

## M3: Evaluation harness and baseline (no fixes in this milestone)

**3.1 Write `planning/critic-rubric.md`.**
- The 6 areas and the pass rule come from plan §4.3.
- For each area, describe in words what 2, 5, 8 and 10 look like. Use the Phase T critiques as calibration (`research/roblox/phase-t/t1-round*/critique.md`): the round-2 shop UI is a "4–5" example.
- Define a severe flaw. Examples: the main subject is missing; a broken or obviously placeholder element; text that is unreadable or overlapping; the wrong scale for the avatar; a dead mechanic.

**3.2 Build the capture runner: `scripts/eval/run-piece.mjs <request-id>`.**
1. Reset a test place to Baseplate.
2. Send the request through the real web API, as a test user on the free plan with an admin credit grant.
3. Wait for done.
4. Capture screenshots with Roblox's Studio MCP (`screen_capture`), at fixed camera CFrames computed from the built bounds. UI pieces are captured at 1920×1080 and 1280×720.
5. Run the play test (`start_stop_play`) and read the console (`get_console_output`).
6. Save the request, reply, credits, steps, time, screenshots and logs to `planning/proof/<M>/<id>/`.

**3.3 Build the critic runner.**
- It launches **2 fresh subagents** per piece. Each gets only the request, the screenshots and `critic-rubric.md`.
- It writes `critic-a.json`, `critic-b.json` and `verdict.json` (pass/fail, the lower score per area).
- Use the Agent tool with a prompt that contains nothing else.

**3.4 Baseline.**
- Run all 60 dev requests (`planning/STUDPILOT-TEST-SET-DEV.md`) on the current agent.
- Write `planning/proof/M3/baseline.md`: pass rate, the mean of the lower score per area per category, credits per piece (mean and max) and minutes per piece.
- **Do not fix anything in M3.**
- **Verify:** 60 folders exist, each with a verdict. Spend is logged.

**M3 acceptance:** plan §9 M3.

---

## M4: Brain diet, no vision, and the new decision rule

**4.1 Remove vision.**
- Delete `look`, `inspect_visually`, `judge_game`, `blind-critique.ts`, `client-judge*.ts`, `world-pass.ts`, `world-steps.ts`, the `look-gate.ts` vision parts, and the `vision` role in `gateway.ts` `DEFAULT_MODELS`.
- Remove `SELF_CHECK_CRITIC` and the look limits.
- Keep `evidence-ledger.ts`, `claim-audit.ts`, `scene-flags.ts`, `audit_build`, `check_ui_layout`, `check_composition`, `play_check` and `play_check_ui`.
- **Verify:** `git grep -n "vision" apps/worker/src` shows only allowlisted lines.

**4.2 Remove the owner library.**
- Delete these tools, their code, and their prompt text:
  - `browse_owner_library`, `import_owner_library`, `install_owner_system`, `recreate_owner_game`, `plan_game`, `build_game`;
  - `query_owner_catalog`, `query_owner_assembly`, `read_owner_component`, `read_owner_media`, `list_owner_original_strings`, `read_owner_original_string`, `insert_owner_component`;
  - the owner tiers in `find_library_model`.
- Remove these from the product workspace: `packages/owner-corpus` (it's git-ignored; leave it on disk), `packages/owner-classify`, `packages/training`, `packages/langflow`, `apps/plugin`, `apps/benchmark` and `apps/experiences`.
- The plugin's `LocalOwnerCorpus` and `OwnerCorpus` ops are removed in the next plugin build.
- The LaunchAgent `com.moshe.apple.owner-gateway` stays on the owner's Mac. Tell him he can unload it.

**4.3 Remove the whole-game path.**
- Delete the `compose_game` tool, `compose-tool.ts`, `compose-run.ts`, `composed-judge.ts`, `build_scene` and the `BASE_NOTE` world pass.
- **Keep** `packages/components/*`, `compose-tycoon.ts` and `compose-plotsim.ts` geometry helpers, and `compose-lane.ts`. They become source material for blocks in M5.

**4.4 Prompt diet.**
- Rewrite `apps/worker/src/prompts.ts` to ≤ **10,000 characters** in total, covering:
  - identity (StudPilot, a co-pilot that builds pieces);
  - the untrusted-content fence;
  - honesty ("say only what the ledger proves");
  - Luau house style;
  - the asset-ingress rules;
  - English output;
  - a short, friendly reply style for ages 13 and up.
- Delete the briefs (`worldbuilding.ts` brief, `design-brief.ts`), the owner-corpus paragraphs and the incident ledger.
- Add a test: `systemPrompt().length <= 10000`.

**4.5 Tool diet.**
- Offer ≤ **25** tools per run (test). Everything removed above is gone from `tools.ts`, `packages/shared/src/index.ts`, `mcp.ts` and `run-idle.ts`.
- Each tool must still be registered in these places, or `phase-coverage.test.mjs` fails.

**4.6 Rewrite the method tests to the new rule.**
- In `no-subject-literals.test.mjs`, replace the "no forced tool / no harness pre-step" checks with: **"the harness may execute only a block the model selected in this run; no code path selects a block from request words."**
- Keep the subject-word scan for prompts, blocks, hints and tool definitions. Blocks are keyed by structure.
- Rewrite source-text-pinning tests that break so they assert behaviour.

**4.7 Knowledge diet.**
- Stop pushing creator skills and cards into every step (`skill-push.ts`, `skill-cards.ts` → removed or reduced to the block hint cards in M5).
- `search_docs` stays as a tool. The 519 skills stay in `packages/corpus` as reference for block authors.

**4.8 Smoke test.**
- Run 5 dev requests (U01, S01, P01, Z01, U07). They must not score worse than the M3 baseline on any area.

**M4 acceptance:** plan §9 M4.

---

## M5: The block engine and the four block families

**5.0 Engine.**
- Create `packages/blocks/` with the folder format from plan §3.3, plus `scripts/gen-blocks.mjs` → `apps/worker/src/blocks.generated.ts` (follow the pattern of `gen-components.mjs`, including `--check`).
- New worker modules:
  - `intake.ts`: model call 1. Takes the request plus a compact block menu of id and one-line summary, and returns `{blocks:[ids], custom:boolean, question?:string}`.
  - `plan-fill.ts`: model call 2. Fills each block's params, validated by JSON Schema, with field-level errors fed back (max 2 retries).
  - `recipe.ts`: the interpreter. It runs each step through the existing plugin ops (`create_instances`, `set_properties`, `edit_script`, `clone_instances`, `insert_library_model`, …). After each step it runs that block's checks; on failure it re-runs the step with the failing parameter named (max 2).
  - `custom-code.ts`: writes Luau when no block fits. It must call block APIs, and it must pass a generated `proof/run-steps.luau`-style test in a play test before it counts.
  - The reply composer reads only the evidence ledger, plus the credits estimate and charge.
- The plugin allowlist (`apps/<plugin>/src/Commands.luau`) must contain every class and property a block writes. A test derives the list from the blocks, so nobody hand-writes it.
- **Verify:** unit tests for schema validation, interpreter ordering, retry, check-failure reporting and the "only selected blocks run" rule.

**5.1 Video knowledge (needs owner task X2).**
- Re-watch the 8 videos in `planning/knowledge/video-tutorials-2026-10-04.md` with frames, using the `watch` plugin.
- Fill every `[frames]` item (hex colours, asset IDs, the tag script's timings) into that note.
- Commit only the distilled note.

**M5a: UI blocks.**
- Build the UI blocks from plan §3.3.
- `panel`/`button` must implement the clean-stud recipe: Header + darker Shadow layer, Inner bright stroke ≈5, outer black strokes ≈5, `LineJoinMode=Bevel` on text strokes, studs only on headers and buttons, dark-blue translucent body, green price buttons with a currency icon, `AutoButtonColor=false`.
- `ui-fx` is a tag runtime (`UI_Click`, `UI_Shine`, `UI_Rotate`).
- The layout engine targets PC first, plus 1280×720. `check_ui_layout` must be clean.
- **Acceptance:** U01–U15 reach a 100% critic pass.

**M5b: System blocks.**
- Build the system blocks from §3.3 out of `packages/components/*` (economy, shop, machines, upgrades, tycoon, waves, defenders) and the `install_module` and verified-module material.
- Each has scripted functional checks:
  - save → leave → rejoin → value kept;
  - a client-fired remote cannot grant currency;
  - a purchase with insufficient funds is refused;
  - egg odds are shown;
  - cooldowns are enforced.
- **Acceptance:** S01–S15 reach a 100% critic pass, and every functional check passes.

**M5c: Props, assets and uploads.**
1. Roblox sign-in was done in M2. Now do upload task O4 in `planning/roblox-oauth-setup.md` (the full O0–O5 details, kept for reference):
   - secrets via `wrangler secret put ROBLOX_OAUTH_CLIENT_ID`, `ROBLOX_OAUTH_CLIENT_SECRET`;
   - routes `/auth/roblox/start` and `/auth/roblox/callback` with PKCE;
   - encrypted, rotating refresh tokens, and revoke;
   - `POST /assets/v1/assets` uploads with polling;
   - a "Continue with Roblox" button.
   - Client ID: `5523165872353873834`. Redirect: `https://studpilot.app/auth/roblox/callback`.
2. Build the prop blocks:
   - `asset-place`: scale-normalise to a ~5-stud avatar; place on the measured ground; cluster, never grid.
   - `rig+procedural-animation`: no published animation IDs. Upload an `.rbxm` to the user's account only when the user has connected Roblox.
3. Build the curated asset pack: `packages/blocks/assets/pack.json`, IDs plus measured size, vetted by the existing fail-closed Creator Store checks.
- **Acceptance:** P01–P15 reach a 100% critic pass. At least one uploaded image and one uploaded animation work in-game on the test user's account.

**M5d: Zone blocks.**
- Build the zone blocks from §3.3. Lighting presets come from the video note.
- Layout flags must be clean.
- **Acceptance:** Z01–Z15 reach a 100% critic pass.

**Every M5 sub-milestone:** run its 15 requests, fix only through blocks and the engine (never hand-edit a built place), and re-run.
- After 3 cycles below 100%, write `STALLED.md` with the failing areas, screenshots and options. One option must be a measured test of a stronger model for the plan-fill step only, with its cost.

---

## M6: Cost and pricing live

Source: `planning/pricing-2026-10-04.md`.

**6.1 Measure.** Record credits per piece over the dev set (from M5 runs) in `planning/proof/M6/cost.md`. Re-check the 1-credit = $0.05 assumption against the real figures.

**6.2 Put the new plans in config.**
- New plan config in `packages/shared` (the old `PLAN_LIMITS` rows are superseded):
  - Free: 5 a day, max 30 a month;
  - Pro: $9.99 for 100 a month;
  - Max: $24.99 for 300 a month;
  - Top-up pack: $4.99 for 50.
- Store credits in hundredths: 1 credit = 100 units internally.
- Add the global free-spend pool. Its size is an owner-approved figure; until approved, use a $10/month default.
- Add a test that fails if any plan's worst-case profit, after a 2.9% + $0.30 card fee, is below $0.

**6.3 Build the user-facing credit flow.**
- Show an estimate before the build and the exact charge after it.
- Warn before continuing if a build is going over its estimate by more than 50%.
- Rewrite the pricing page copy from these numbers. Remove "~163 builds/month".

**6.4 Keep checkout off.** Stripe stays dark until owner task X5. Test mode only.

**M6 acceptance:** plan §9 M6.

---

## M7: Final proof and launch readiness

**7.1 Full dev set.** Run all 60 dev requests on the final build. 100% pass is required.

**7.2 Hidden set.**
- Ask the owner for the hidden set (owner task X8). Run all 40 requests with **no code changes during the run**.
- Report the real pass rate. If it is below 100%, list the failures. Fixes happen afterwards, and the hidden set stays burned: the owner gets a new one from the planner.

**7.3 Proof bundle: `planning/proof/M7/FINAL-REPORT.md`.**
- Pass rates.
- Per-area minimum scores.
- Credits per piece.
- Spend to date.
- Links to every piece's folder.
- The open owner-only actions (X4–X9).

**7.4 OAuth review package.**
- A demo-video script for owner task X9.
- The justification text (in `roblox-oauth-setup.md`).
- The thumbnail: the StudPilot logo at 512×512.

**7.5 Launch checklist.**
- Trademark (X6).
- Secret rotated (X4).
- Plugin publish decision (X7).
- Stripe holder (X5).
- Global free-spend pool figure approved.
- Sentry alerts on.
- Discord announcement drafted. Claude prepares it; the owner posts it.

**7.6 Fill the site with proof.**
- Add pieces that passed in M5 (with their real screenshots) to the site catalog and the landing hero.
- Remove the beta wording that no longer applies.
- Re-run the M2 site checks: Lighthouse, contrast and the critic.

**M7 acceptance:** plan §9 M7.

---

## Appendix A: commands (current lineage; renamed paths after M1)

| Purpose | Command |
|---|---|
| Typecheck and all tests | `pnpm -r typecheck && pnpm -r test && node --test tests/*.test.mjs` |
| Worker suite only (~3 min, ~5.4k tests) | `pnpm --filter ./apps/worker test` |
| Plugin build and verify | `node apps/apple-plugin/scripts/build.mjs` (→ `apps/studpilot-plugin/...` after M1) |
| Regenerate components / blocks | `node scripts/gen-components.mjs --check` / `node scripts/gen-blocks.mjs --check` |
| Deploy the Worker (verifies health) | `node infra/deploy-worker.mjs apple` (→ `studpilot` after M1) |
| Deploy site and app | `node infra/deploy-static.mjs [--only site\|web]` |
| Supabase migrations | `node infra/supabase/migrate.mjs --url <db> --status \| --apply --yes \| --verify` |
| Spend | `curl -s -H "X-Admin-Key: $STUDPILOT_ADMIN_KEY" https://studpilot.app/api/admin/spend` (key from `.env` via the loader; never print it) |
| Old-name guard | `node scripts/check-old-names.mjs` (created in 1.2) |

## Appendix B: files this handoff depends on
- `planning/STUDPILOT-FINAL-PLAN.md`: the why, and the acceptance table.
- `planning/STUDPILOT-TEST-SET-DEV.md`: the 60 frozen dev requests.
- `planning/rename-inventory.md`: the rename scope and its acceptance test.
- `planning/pricing-2026-10-04.md`: credits and plans.
- `planning/roblox-oauth-setup.md`: the OAuth app, tasks O0–O6, and the review justification.
- `planning/knowledge/video-tutorials-2026-10-04.md`: UI, lighting and animation knowledge for the blocks.
- `planning/sections/*`: the 2026-10-04 dossier (background; trust the code over it).
- The claude.ai Project docs `claude/decision-log.md` and `claude/hidden-test-set.md`. The owner keeps the hidden set; never request it before M7.
