# StudPilot: the final plan (v1, 2026-10-04)

**Written by:** the planning session (Claude, Cowork), from the owner's ~80 decisions on 2026-10-04.
**Sources of truth:** the decision log (claude.ai Project doc `claude/decision-log.md`) and these planning files:
- `rename-inventory.md`
- `pricing-2026-10-04.md`
- `roblox-oauth-setup.md`
- `knowledge/video-tutorials-2026-10-04.md`
- `STUDPILOT-TEST-SET-DEV.md`

**Who executes it:** Claude Code, using `STUDPILOT-HANDOFF.md`.

**Status of the numbers:** "measured" means read from a file or a live system on 2026-10-04. "est." means the planner's arithmetic. Everything else is a decision or a design.

---

## 1. One-page product definition

**StudPilot** (formerly Apple, formerly Golem) is an AI co-pilot for Roblox Studio. In the web app you ask for any piece of your game, and within minutes it is built in your own Studio and proven to work. A piece can be a shop screen, a pet system with eggs, a chest that opens, or a lava zone.

- **For:** Roblox creators aged 13 and up. One neutral, simple product for every age. PC-first design.
- **Promise:** "Ask for any piece. It looks pro, it works, and we never claim what we didn't prove."
- **What it builds:** ANY custom UI, game system, interactive prop or map area, of any size. A build takes up to 10 minutes. Version 1 is tuned first for simulator and tycoon games, on new or small places.

**How it works:**
1. Sign in (Google, Discord, email, or Roblox).
2. Pair the plugin with a 6-character code.
3. Type a request. StudPilot builds right away. It asks one multiple-choice question first only if the request is unclear.
4. While it builds, the user sees a live step list and Studio screenshots. The AI never looks at them; they are for the user only.
5. The build is put together from **reviewed building blocks** plus custom code where no block exists.
6. Every build is checked by non-visual checks: play test, button presses, layout check, audit, and claim check. Pieces come alive by default (sound, motion, effects).
7. The reply is short and friendly. It says what was proven and lists any gaps.
8. To change a piece, ask in chat or use the piece's settings panel.

**Quality bar:** every piece passes a fresh blind Claude critic, who sees only screenshots and the request.
- ≥8/10 in every area, with no severe flaw;
- 0 play-test errors;
- 0 false claims.

**AI:** GLM 5.3 Flash on Cloudflare Workers AI, behind one switch. No vision model in the product.

**Money:**
- Credits charged by real AI usage, shown with two decimals (1 credit = $0.05 of AI cost).
- Free: 5 credits a day, at most 30 a month.
- Pro: $9.99 a month for 100 credits. Max: $24.99 a month for 300 credits. Packs: $4.99 for 50.
- Free until every build type passes the bar **and** an adult holds the Stripe account.

**Brand:** StudPilot at `studpilot.app`. A dark, professional look with one bright accent colour. English only.

**Not in version 1:**
- whole games from one line;
- vision inside the product;
- the owner's 565-game library;
- under-13 users;
- AI-generated meshes;
- Team Create;
- fitting pieces into large existing games;
- publishing the plugin to the Creator Store (deferred until the bar passes).

---

## 2. Where we start (measured, 2026-10-04)

| Fact | Evidence |
|---|---|
| Game 1 scored 2, 1.5 and 1.5/10 from a blind critic; best area UI at 5/10; round 4 has no result | `research/roblox/phase-t/t1-round{1,2,3}/critique.md`; `t1-round4/session-messages.json` holds only the prompt |
| Best of 40 bench rows is 12/18; "professional", "polished", "sound" and "animation" never reached 2 | planning section 08 |
| Production runs `2ffd22db`, which is **not in the main repo** and on no GitHub ref | `git cat-file -t 2ffd22db` fails in `~/Developer/RbxAI`; health `buildSha` |
| The GitHub repo `MosheBarami/Apple` is public | GitHub API `"visibility":"public"` |
| Spend caps were lifted to 30 billion neurons a month (≈ $330k) | `apps/worker/src/pricing.ts` on `handoff/research-feed` |
| The model is GLM 5.3 Flash for plan, agent and vision; self-check is on in production | `gateway.ts` `DEFAULT_MODELS`; `wrangler.apple.jsonc` `SELF_CHECK: "on"` |
| 122 tools (92 offered at step 1, ~85k characters of schemas); a 28.6k-character prompt; 3 composers | planning section 05 |
| Cloudflare holds Workers `apple`, `golem` and `apple-cf-probe`; D1 `golem-corpus`; KV `golem-kv`; R2 `apple-media`; Vectorize `golem-docs`. Supabase project `AppleAI` | Cloudflare and Supabase MCP listings |
| `studpilot.app` is live (200, valid TLS). The Roblox OAuth app "StudPilot" is saved in private mode | curl; owner screenshots |

**Root cause, in one line:** a small model was asked to invent whole games through 92 tools, while a house rule forbade the system from doing the heavy lifting. The fix is to build the quality in advance, as reviewed blocks, and to let the system execute recipes that the model chooses and fills in.

---

## 3. Agent architecture

### 3.1 The shape

```
User request
  → Intake (model call 1): classify the piece type, pick 1–N blocks from the MENU, or "custom"; ask ≤1 question if unclear
  → Plan (model call 2): fill each block's typed parameter spec (names, colours, numbers, assets, placement)
       ↳ validated by JSON Schema; on failure the harness returns the exact field errors (max 2 retries)
  → Execute (harness, no model): the recipe interpreter runs each block's ordered steps through existing plugin ops
       ↳ each step has its own check (audit_build / check_ui_layout / play_check / play_check_ui press list)
       ↳ a failed check re-runs that step with the failing parameter named (max 2 per step)
  → Custom code (model calls 3+, only when no block fits): write Luau against the block APIs; must pass a generated test
  → Report (harness + model): the reply is assembled from the evidence ledger; free text may only restate ledger facts
```

### 3.2 Decisions this encodes
- **The model picks, the system runs.** This is the owner's decision (batch 3). It replaces "the agent decides every step".
  - Tests that forbid a harness-run recipe (`no-subject-literals` structural part, "no forced tool") are rewritten to the new rule.
  - New rule: **the system may execute any recipe the model selected. The system may never pick a recipe from request words.** Blocks stay keyed by structure (UI panel, currency system, zone), never by subject (pizza, laundry); the subject-word scan stays.
- **No vision in the product** (owner).
  - Removed: `look`, `blind-critique.ts`, `judge_game`, `inspect_visually`, the `vision` model role, `client-judge*`, `world-pass.ts`, and the 6-look budget.
  - Kept: `audit_build`, `check_ui_layout`, `check_composition` (model-free), `play_check`, `play_check_ui`, `scene-flags.ts`, `claim-audit.ts` and the evidence ledger.
- **Prompt and tool diet.**
  - System prompt ≤ **10,000 characters**, down from 28.6k. It keeps identity, safety and fencing, honesty, Luau house style, and the asset-ingress rules.
  - Removed from the prompt:
    - all owner-corpus text;
    - the art and UI briefs (moved into blocks);
    - the incident ledger paragraphs (moved into block docs).
  - Tools offered per run ≤ **25**: intake/plan tools, `run_block`, `write_custom_script`, `find_library_model`, `insert_library_model`, the checks, `edit_script` and `get_instance`.
  - Everything else is reachable only through blocks.
- **Delete:**
  - **The owner library and its tools:** `browse_owner_library`, `import_owner_library`, `install_owner_system`, `recreate_owner_game`, `plan_game`, `build_game`, the `query_owner_*` tools, `read_owner_*`, `list_owner_original_strings` and `insert_owner_component`.
  - **The owner-library code:** the gateway code paths, and `packages/owner-corpus` and `packages/owner-classify` from the product.
  - **The whole-game path:** `compose_game` as "the game", `composed-judge.ts` and `world-pass.ts`.
  - **The Luau components stay** and become system blocks.
- **Knowledge.**
  - The 519 skills and 23 cards no longer get pushed into every step.
  - What matters becomes **block code and block docs**.
  - At most 2 short **hint cards** (≤600 characters each) ride with a block when it runs.
  - `search_docs` stays as a tool for custom code.

### 3.3 The block library (the heart of the product)

A **block** is a folder: `packages/blocks/<kind>/<id>/`.

| File | What it holds |
|---|---|
| `block.json` | id, kind (`ui` / `system` / `prop` / `zone` / `fx` / `lighting`), a one-line summary for the menu, a parameter JSON Schema with defaults, the provided APIs (e.g. `Economy.grant`), and dependencies on other blocks |
| `recipe.json` | the ordered steps; each is a plugin op or a reviewed Luau file with `{{param}}` slots |
| `src/*.luau` | the runtime code shipped into the game: reviewed, server-authoritative, commented |
| `checks.json` | what proves this block works (e.g. "press Buy with 0 coins → no purchase; with 100 → item granted, coins −price") |
| `hint.md` | ≤600 characters for the model |
| `proof/` | a scripted Studio test |

A generator compiles all blocks into the worker, as `gen-components.mjs` already does today.

**First catalogue (version 1).** "Any custom piece" comes from *combining* blocks plus custom code; the catalogue is not a menu of finished pieces.

| Kind | Blocks |
|---|---|
| UI (≈14) | `panel` (the clean-stud header + shadow + inner-stroke recipe from the video note), `button` (green price variant, `AutoButtonColor` off, bevel text stroke), `tab-bar`, `item-card`, `grid/scroll-list`, `counter/HUD-currency`, `progress-bar`, `modal+backdrop`, `toast`, `icon` (37 keys plus user-uploaded images via OAuth), `layout-engine` (safe areas, PC-first breakpoints, ≥44 px targets, no overlap), `ui-fx` (tag-driven click/shine/rotate runtime), `rays/glow`, `close-button` |
| Systems (≈16) | `currency+save` (ProfileStore-style, versioned), `shop`, `upgrades`, `rebirth`, `pets+eggs` (odds shown; warn-only per owner), `inventory`, `leaderboard` (global + session), `daily-reward`, `quests`, `codes`, `checkpoints`, `round-loop`, `tycoon-dropper-chain`, `plots`, `waves+defenders`, `remote-guard` |
| Props (≈8) | `asset-place` (Creator Store search → preview → scale-normalise to the avatar → place on ground → cluster/scatter), `behave` (9 verbs × 5 triggers × 4 modes, from the existing component), `interactable` (prompt/click/touch + feedback), `rig+procedural-animation` (welds vs Motor6D, PrimaryPart, AnimationController; no published IDs), `pickup/collectible`, `door/chest/machine` archetypes, `sound-on-action`, `vfx-on-action` |
| Zones (≈8) | `terrain-base`, `zone-shell` (bounds, walls/cliffs, entrance), `scatter` (clustered, not grids), `path`, `landmark-slot`, `lighting-preset` (the 4 presets tuned from the video note: Realistic, Atmosphere 0.3–0.4, Bloom, SunRays, ColorCorrection +contrast), `ambient-sound`, `gate/portal` |

**Curated asset pack.** A hand-checked list of Creator Store models per theme, ≤60k triangles and script-free (the existing vetting), stored as `packages/blocks/assets/pack.json`. It ships with StudPilot; there are no binaries, only IDs plus measured sizes.

**Uploads into the user's account.** Images (UI icons and panels), animations and sounds go through Roblox OAuth `asset:write`. This needs the user to have signed in with Roblox. Without that, blocks fall back to native UI and procedural animation.

### 3.4 Honesty by construction
- **The final reply is built from the evidence ledger.** Statements about sound, visuals or tests that the ledger cannot back are removed by the claim audit; they are not just flagged.
- **Every block's checks run.** A check that cannot run is reported as "not verified", never as passed.
- **Cost:** the credit estimate is shown before the build and the exact credits after (pricing file).

---

## 4. Quality bar and evaluation

### 4.1 The test sets
- **Dev set:** `planning/STUDPILOT-TEST-SET-DEV.md`, 60 requests (15 UI, 15 systems, 15 props, 15 zones, mostly simulator and tycoon flavoured). Claude Code builds against it.
- **Hidden set:** 40 requests written by the planner and stored **only in the claude.ai Project** (`claude/hidden-test-set.md`). Claude Code never sees it. The owner pastes it in at the final milestone only. Passing it is the proof that StudPilot handles "any request", not just the ones it was tuned on.

### 4.2 Capture
For each request, on a fresh Baseplate place:
1. Run StudPilot through the real product path: web app → worker → plugin.
2. Capture 4 fixed screenshots: overview, three-quarter, close-up, and the player's eye at spawn.
   - UI pieces: the screen at PC resolution (1920×1080), plus a 1280×720 shot.
3. Save the play-test log and the button-press log.
4. Save the reply.

Capture uses Roblox's own **Studio MCP** (`screen_capture`, `start_stop_play`, `execute_luau`) from Claude Code, not the product's own tools. Store everything under `planning/proof/<milestone>/<request-id>/`.

### 4.3 The critic
Two **fresh Claude subagents** per piece, with no shared context. Each sees only:
- the request text;
- the screenshots;
- the fixed rubric (`planning/critic-rubric.md`, written in handoff task Q1).

**Areas, 0–10 each:**
1. Delivers the request
2. Visual quality and art direction
3. Layout, composition and scale
4. UI/UX clarity (N/A for non-UI)
5. Feedback and life (visible motion/VFX cues; sound is proven by the log, not the critic)
6. Polish: nothing placeholder, broken or amateur

**A piece passes when all of these hold:**
- the **lower** of the two critic scores is ≥8 in every applicable area;
- neither critic lists a severe flaw;
- the play test shows 0 errors;
- every scripted functional check passes;
- the claim audit finds 0 unsupported claims.

**Metric:** critic pass rate = passing pieces ÷ attempted pieces. **Bar: 100%** on the dev set *and* the hidden set.

*Honest note:* 100% with the lower of two strict critics is a very high bar. Claude Code must report the real rate at every milestone and must never round it up.

### 4.4 Budget for testing
- **Runtime:** Workers AI for test runs ≤ **$20 a month**, out of the $50 dev budget. Track it via `/api/admin/spend`.
- **Critics:** they run inside the owner's Claude Max plan, at no extra cost.
- **When to test:** the full dev set at each milestone, plus a 5-request smoke test after big changes. No endless loops.

---

## 5. Business and pricing
See `pricing-2026-10-04.md`. Summary:
- 1 credit = $0.05 of AI cost, charged by real usage, shown with 2 decimals.
- Plans: Free 5 a day (max 30 a month), Pro $9.99/100, Max $24.99/300, pack $4.99/50.
- Every plan is profitable in the worst case after card fees (est.).
- A global free-spend cap protects the budget.
- Charging starts after the bar is passed and an adult holds Stripe.
- Growth: a share button, a referral bonus (credits only), and a "Made with StudPilot" credit (optional badge).

## 6. Website, app and brand
- **Name, domain and voice:** StudPilot, `studpilot.app`. Short, friendly copy.
- **Visual system:** a new design language, not a reskin. The look is dark and professional (Cursor/Linear-like) with **one bright accent colour**, using real Studio screenshots of pieces that passed the critic.
- **Logo and favicon:** one new logo. All three old logos are retired.
- **Marketing site (full):** landing, how it works, piece catalog (live examples that passed the bar), pricing, docs, blog, privacy, terms, Discord link.
- **Web app:**
  - sign-in;
  - Projects (create = one click, no description);
  - chat with a live step list and screenshots;
  - piece history;
  - per-piece settings panel (numbers and colours edited directly);
  - usage and credits;
  - account (connections: Roblox, Discord, Google).
- **Bars:**
  - Lighthouse ≥90 on landing and pricing;
  - WCAG AA contrast;
  - the blind critic rates the landing page ≥8/10 on "looks like a top-tier product".
- **Owner's frustration rule:** a redesign that keeps the old layouts fails. The plan requires new layouts, judged side by side against the old ones.

## 7. Compliance and safety
- **13+ only.** Sign-up asks for a birth date and blocks under-13s. Google and Discord already require 13+, and Roblox OAuth requires a 13+ account.
- **Roblox rules:** refuse rule-breakers (gambling, scams, fake Robux) and mature content. Warn (do not block) on rule gaps such as paid random items without odds. Text filtering stays built in where the block owns chat or text input.
- **Roblox Third-Party App Policy:**
  - no Roblox-API data used for AI training;
  - wipe all Roblox-API data if access is lost;
  - the minimum scopes only.
- **Privacy page:** rewrite it to match the anonymised opt-out improvement data (excluding Roblox data), the Roblox OAuth data held, and data deletion. Fix the old training-opt-in contradiction.
- **Secrets:**
  - restore the `.claude/settings.json` deny list for `.env`;
  - `chmod 600 .env`;
  - rotate the Roblox OAuth secret before launch (it was shared in chat);
  - review the unrelated tokens in `.env` (Clerk, Vercel, Resend, the `*_WRITE_ALL` Cloudflare token) with the owner.
- **Payments:** blocked until an adult holds the Stripe account. No workaround.
- **Trademark:** the "StudPilot" check is still owed before the public launch. The "Apple" name is fully retired.

## 8. Operations
- **One repo, one main.**
  - Consolidate to `~/Developer/RbxAI` (renamed last).
  - The deployed lineage becomes `main`.
  - Parked branches stay as refs.
  - Stale worktrees are removed with the owner's consent.
- **Deploy:** only through `infra/deploy-worker.mjs`, from a clean tree, so the health `buildSha` equals the `main` HEAD.
- **Spend guardrails:**
  - daily and monthly neuron caps back in `pricing.ts` (owner-approved figures);
  - the global free-spend pool;
  - per-build credit ceiling.
- **Monitoring:** Sentry (renamed) for worker and web errors, plus a weekly cost report written to `planning/proof/ops/`.
- **Agents:** Claude Code only. Codex paused. Never two agents on one branch.

## 9. Milestones and acceptance tests

All proof goes to `planning/proof/<milestone>/`. The owner checks in only at the end, so each milestone also writes a 10-line `SUMMARY.md` with measured numbers only.

| # | Milestone | Acceptance tests (all must pass) |
|---|---|---|
| **M0** | Safety and one repo | (1) `2ffd22db` (or its successor) is on GitHub `main`; health `buildSha` == `main` HEAD with no `-dirty`. (2) `GOAL.md` replaced by a pointer to this plan; `research/` and `planning/` committed. (3) Spend caps restored; a test asserts the monthly cap ≤ the owner-approved figure. (4) `.env` mode 600; deny list restored. (5) CI green. |
| **M1** | Rename and domain | Every check in `rename-inventory.md` "Acceptance test", including data counts before and after, and `studpilot.app` serving sign-in, chat, pairing and history. |
| **M2** | Evaluation harness and baseline | (1) `critic-rubric.md` exists. (2) The capture and critic pipeline runs end to end on 5 dev requests. (3) A baseline over the full dev set with the *current* agent is recorded, with per-area scores and credits per piece. No fixes are allowed in M2. |
| **M3** | Brain diet and no vision | (1) Prompt ≤10,000 characters (test). (2) ≤25 tools offered (test). (3) Owner-library, vision and whole-game code removed; `git grep` proves it. (4) Tests rewritten to the new rule; full suite green. (5) 5-request smoke test is not worse than the M2 baseline on any area. |
| **M4a** | Block engine and UI blocks | (1) Block schema, generator, recipe interpreter and per-step checks, with unit tests. (2) The 15 UI dev requests reach a **100% critic pass**, with `check_ui_layout` clean at 1920×1080 and 1280×720. |
| **M4b** | System blocks | The 15 system dev requests reach 100% pass. Every scripted functional check passes, including save → rejoin → value kept, server authority (a client-fired remote cannot grant), and odds shown on eggs. |
| **M4c** | Prop blocks and uploads | (1) The OAuth tasks O0–O5 are done. (2) The 15 prop dev requests reach 100% pass. (3) At least one piece uses an image and one an animation uploaded to the test user's account, and both play in-game. |
| **M4d** | Zone blocks | The 15 zone dev requests reach 100% pass. Layout flags show no `repeated_grid`, `open_flat_map` or `dark_lighting` issues. |
| **M5** | Cost and pricing live | (1) Credits per piece measured over the dev set; the credit value is re-checked. (2) A plan-profit test passes. (3) The credit estimate is shown before the build and the exact credits after. (4) The free 5/day, 30/month limits and the global cap are enforced (tests). |
| **M6** | Web app and site | Every bar in §6, plus the screenshots of the old vs. new layouts in `planning/proof/M6/`. |
| **M7** | Final proof and launch readiness | (1) The owner gives the hidden set; **100% pass** on dev + hidden. (2) A proof bundle of screenshots, scores, logs and credits per piece. (3) A launch checklist: OAuth review submitted with the <1 min demo, trademark check done, privacy updated, OAuth secret rotated, plugin publish decision brought to the owner, Stripe holder status. |

**What I can't promise:** that M4 reaches 100% with a small model. The plan makes that as likely as it can: quality is built into the blocks, and the model only chooses and fills them in. If a sub-milestone stalls below 100% after 3 honest fix cycles, Claude Code stops and writes `planning/proof/<M>/STALLED.md`. It lists the failing areas with screenshots, plus options, and one of them is a measured test of a stronger model for the Plan step only. The owner decides.

## 10. What is dropped or deferred
- **Dropped:** whole-game promise; templates as games; in-product vision; owner library; old bench, meter and 38 mods (the mods stay installed but are no longer the progress measure); v4 site and app branches; LoRA training; Langflow; `apps/plugin` (legacy); `apps/benchmark`; `apps/experiences`.
- **Deferred:** Creator Store plugin publishing (after the bar; owner decision); Team Create; existing-game fitting; AI meshes; under-13; payments (until there is an adult account holder); languages other than English.
