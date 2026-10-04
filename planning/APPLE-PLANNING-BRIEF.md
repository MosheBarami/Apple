# APPLE: PLANNING BRIEF (for the Cowork project Context)

This short brief is meant to sit in the project Context. The full dossier (about 128k words) is `planning/APPLE-PLANNING-DOSSIER.md`, and each part is in `planning/sections/`. Open a section from the folder when you need its detail: do not load the whole dossier at once. Section files: 03 product and business, 04 research, 05 agent brain, 06 architecture, 07-09 knowledge and plugin, 08 quality evidence, 10 web and brand, 11 security, 12 repo and ops, 13 testing, 14 history, 16 glossary and numbers.

# APPLE (RbxAI): THE PLANNING DOSSIER

**Purpose.** This is everything known about the Apple project as of **2026-10-04**, gathered so that a planning agent
(Claude Cowork or similar) can decide **what the final product should be**, plan all of it, and then write the final
step-by-step handoff for Claude Code. It is a planning document, not a build order.

**How it was made.**
- **Sections 2 and 15:** written first-hand by the Claude Code session that ran 2026-10-02 → 10-04.
- **Sections 3–14 and 16:** compiled by 12 research agents that read the entire repository, its git history and the
  owner's memory notes, read-only.
- **Citations:** every fact cites a file path, a commit or a research-note source.
- **Total size:** about 130,000 words. Read the summary first, then follow §0.2.

---

## 0.1 Corrections and the true current state (read before anything else)
Sections were written in parallel, and the repo kept moving while they were written. Where a section disagrees with
this list, this list wins:
1. **Production runs `2ffd22db`.**
   - At 14:17 on 2026-10-04, a **Codex** session (ChatGPT's Codex, running on the owner's Mac) finished the round-3
     fix: concrete build steps for composed worlds.
   - It merged the fix into `research-feed` and deployed it.
   - Some sections still say `f598acb8` or describe `fix-r3` as unfinished. It is finished and deployed, but **not yet
     measured** by a new blind-critic round.
   - **Two agents (Codex and Claude) must not work on the same branches at the same time.** The owner should pause
     one.
2. **Self-check is ON in production.** The code default is off, and `wrangler.apple.jsonc` sets `SELF_CHECK: "on"`.
   Some sections say "off by default in production"; that is the code default, not the deployed configuration.
3. **There is no real "round 4" yet.** The run some sections call round 4 was the cancelled GLM 5.3 (full) attempt.
   Game 1 has three judged rounds: 2, 1.5 and 1.5 out of 10.
4. **The build model is GLM 5.3 Flash (owner decision).** The stronger-model comparison was cancelled before any run
   finished, and its price rows and step caps were reverted.
5. **The deployed code is on no GitHub ref.** `research-feed`, `fix-r3` and the parked branches exist only locally,
   and some only in the separate clone `/Users/moshe/Developer/RbxAI-rename`. Copies are saved as `handoff/*` refs in
   the main repo.
   - `GOAL.md`, `research/` and `planning/` are untracked files in the main checkout.
   - `docs/handoff/2026-10-04/` is git-ignored.
   - Commit them before anyone cleans anything.
6. **The GitHub repo `MosheBarami/Apple` is PUBLIC** per the API (section 12). An older memory note says private.
   This matters for the private game library and for secrets.

## 0.2 Reading order
| If you are… | Read |
|---|---|
| Deciding the final product | **1 (summary) → 2 (owner) → 8 (evidence) → 15 (decisions and planning frame)**, then 4 (research), 3 (business), 5 (agent brain) |
| Designing the agent | 5 → 6 → 7–9 → 8 → 13 |
| Planning business and launch | 3 → 11 → 4 → 15 |
| Planning web and brand | 10 → 4 §4.3 → 3 |
| Writing the Claude Code handoff | 12 → 6 → 13 → 14 → 15 |
| New to the vocabulary | 16 (glossary) |

## 0.3 Contents
0. README, corrections and executive summary *(this part)*
2. The owner, his directives, and what happened (first-hand)
3. Product, business model and vision history
4. What the market and the research say (the 23 notes, distilled)
5. The agent's brain: prompts, skills, composers, components, decisions
6. Architecture and technology inventory
7–9. The knowledge system and the Studio plugin
8. Quality evidence: what the agent can and cannot do
10. Website, web app, brand and design history
11. Security, privacy, safety and compliance
12. Repository map, operations and tooling
13. Testing, CI and evaluation infrastructure
14. History: timeline, decision log, failure log
15. Open decisions, risks and the planning frame
16. Training ambitions, data assets, analytics, glossary and key numbers

---

# 1. Executive summary

## 1.1 What Apple is
**An AI SaaS that builds Roblox games inside the user's own Roblox Studio.** A Cloudflare Worker runs the agent loop
(122 tools, on GLM 5.3 Flash via Workers AI). A Luau Studio plugin, paired by a 6-character code, executes typed
operations in the place. Around it:
- a React web app: dashboard and chat;
- an Astro marketing site;
- Supabase auth;
- credit-based subscriptions: Free 231 credits/day, Pro $12 for 12,600/month, Max $40 for 21,000/month;
- a private library of 565 games and 97k assets on the owner's Mac;
- 23 cited research notes about Roblox (269k words, 2,212 sources).

**Built by one person.** The owner is a non-technical solo founder, and the launch docs state he is 15. Commits are
recorded as his, but written by AI agents. 2,486 commits since 30 August 2026.

## 1.2 The ten truths a planner must start from
1. **The core promise is not met.** "A complete game from one line" scored **2, 1.5 and 1.5 out of 10** from an
   independent blind critic over three rounds. Each fix worked locally (real assets, layout rules, self-checks), but
   the small build model either stamps a fixed template or stalls (§8, §2).
2. **The brain is wider than it is deep.**
   - Only **3 of 11 genres** have a template or runtime code: tycoon, plot-sim and lane-defense.
   - **442 of 519 skills** are prose with no code behind them.
   - Key tools (UI components, terrain) are hidden behind `more_tools`, although the prompt tells the model to use them.
   - Tool schemas cost about 3× the prompt on every step (§5).
3. **The product's own judge is too generous.** It gave 8/18 and 6/18 where the blind critic gave 1.5/10. The judge
   and the builder are the same small model (§8, §13).
4. **Distribution is blocked.**
   - The Studio plugin was **removed twice** from the Creator Store for "Misusing Roblox Systems".
   - The listing is **not live**, and the public version is 1.0.0.
   - The local 1.5.0 build uses a `game:GetObjects` insert path that conflicts with an earlier decision to ban it
     (§7–9, §3, §11).
5. **The economics are mispriced.**
   - Cost to serve is tiny: one game ≈ 1,000–1,800 credits ≈ **$0.35–0.60**.
   - But a game exceeds the daily cap on every self-serve plan.
   - The pricing copy overstates "builds per month" by **13–23×**.
   - The self-check raised small-build cost ~16× for a +2.3/18 gain.
   - Global spend caps were removed on 2026-09-29: the theoretical maximum bill is ≈ $330k/month (§3, §6).
6. **Legal and compliance gates come before revenue.**
   - Stripe needs an adult account holder.
   - The name **"Apple"** has an open, never-answered trademark question.
   - The owner library's rights are only owner-attested, and some content is described as copies of others' games.
   - The privacy page contradicts a training-opt-in column.
   - Generated games must respect 2026 Roblox rules (age-checked chat, Kids/Select, maturity labels, paid-random-item
     odds, 16+ hangouts) (§11, §3, §4).
7. **Roblox is the competitor.** Assistant, Planning Mode, mesh generation, a live **Studio MCP server that works with
   Claude Code**, Build and a Playtest Agent are free or coming. Apple must win on **complete, verified, compliant
   games**, not on "an AI in Studio" (§4).
8. **The research says what wins on Roblox:**
   - mobile first (80%+ of players);
   - one-sentence loops;
   - 28-day retention, which is now the ranking signal;
   - evergreen genres (simulator, obby, tycoon, TD) with a novel twist.

   Clones fail 87–838× behind originals, and trend formats decay 95–99% within months. Real per-genre numbers are in §4.
9. **The repository needs consolidation before any big plan executes.**
   - 16 checkouts in 3 git stores.
   - The deployed code exists on no remote.
   - Key planning files are untracked.
   - The repo is public.
   - The owner's settings emptied Claude's deny list, so `.env` is readable.
   - Docs (`AGENTS.md`, `CLAUDE.md`) are stale in ~14 places.
   - A ~12-character margin on the tool-definition budget test blocks adding tools.
   - About 130 of 410 worker test files read source text, so refactors break tests (§12, §13, §6).
10. **Design has never actually changed.** Eight redesigns changed palettes and effects but kept the same layouts,
    which is the owner's stated complaint. The v4 direction (ai-sdk.dev / awesome-llm) is a WIP whose site branch does
    not build. Three different logos are live (§10).

## 1.3 What already works (keep it)
- **Knowledge:** the research library and its live search (1,025 passages), 23 auto-pushed craft cards, and
  per-step skill pushes.
- **Assets:** live Creator Store search that finds real, verified, script-free assets, and insert in the local plugin.
- **UI:** the studded UI library, the upgrades panels and layout rules. UI is the strongest output.
- **Checks:** the self-check stack (look, claim audit, blind critique, judge gate, world pass, layout flags) now
  fires.
- **Process:** the owner's blind-critic loop as an evaluation method; strong guards against spend, scripts and
  injection; a large test suite.

## 1.4 The decisions the owner must make (details and trade-offs in §15)
- **D1** what the final product is: full game from one line / genre kits / co-pilot / hybrid
- **D2** the build model and cost strategy (the owner chose to stay on GLM 5.3 Flash, which favours kits and recipes)
- **D3** the agent architecture: templates → themeable genre kits; a harness-driven recipe engine; asset-first worlds
- **D4** the customer: age band, creator type
- **D5** first genres
- **D6** website and brand, including the name
- **D7** plugin distribution
- **D8** repo and GitHub
- **D9** success metrics

## 1.5 What the planner should produce
1. A one-page final product definition.
2. The quality bar: the blind critic at ≥8/10 in every area, plus the research checklists.
3. An agent architecture fit for the chosen model.
4. The experience.
5. Business and pricing.
6. Website and brand.
7. Compliance.
8. Operations.
9. Milestones with verifiable acceptance tests.
10. The final step-by-step handoff for Claude Code.

See §15.4 and §15.5.


---

# 2. The owner, his directives, and what happened (session of 2026-10-02 → 2026-10-04)

_Written by the Claude Code session that ran these days (the only first-hand account; other sections were compiled
from the repository). Dates are the owner's local time (Israel)._

## 2.1 Who the owner is and how he works
- **Moshe Barami**, solo founder. Non-technical, reads Hebrew and English, does not read code or `docs/`.
- He judges by **seeing and playing**. He sends screenshots and screen recordings, and he rejects technically correct
  but ugly or amateur output immediately and bluntly. In his words, about game 1: "clearly a broken ass game that a
  child just dragged ui and placed them and a dog built every part from scratch".
- He changes direction decisively. Expect pivots, and record them.
- He wants honest status: no overclaiming, and measured numbers rather than estimates.
- He wants **visible progress**. He asked for a live progress bar of the product's TOTAL completion (mod #38 in Claude
  Code) and for the 36 helper mods to visibly appear in the Claude desktop app.
- He uses the same Mac while agents work. He asked agents to work **in background windows**, not take over the
  screen, so he can watch videos.
- **Budget stance:** cost-aware. He approved up to **10,000 credits** for testing. He **cancelled** a comparison of
  stronger, more expensive build models and ordered a return to the cheap default model.
- **Consent:** standing consent (recorded in memory, 2026-10-02) covers deleting untracked files, deleting GitHub
  branches, changing Cloudflare/Supabase/Sentry, and removing the old "golem" name. Anything paid, external or
  destructive beyond that needs his yes. Publishing the Studio plugin to the Creator Store is his call.

## 2.2 The arc of directives (newest last)
1. **2026-10-02/03, the "complete the product 100% end to end" goal**, with 11 items: method (no request-specific
   hacks), library ≥90% top-3 search, asset order, visual quality with self-check, UI, systems/anim/sound/VFX,
   knowledge, a frontier benchmark ≥11/12 per item, a website rebuilt from zero (Lighthouse ≥90, motion, dark mode,
   a gimmick), GitHub (green CI, rulesets, Codespaces, Packages, "golem" removed), and a final giant integration PR
   reviewed with ultrareview. There was also a fixed meter: 25% agent, 20% knowledge+library, 15% visual, 10% UI,
   10% sound/anim/FX, 20% website. Progress was measured by a 30-request benchmark (baseline mean 7.27/18).
2. **Website direction.** He rejected the "Ember Rail" orange design and the older blue look. His reason: the
   redesigns never created a *new design language*; the dashboard, pages and chat still looked like the old product.
   He then ordered: **"build the new website based on https://github.com/uhub/awesome-llm and https://ai-sdk.dev/"**.
   A v4 spec was written: a Vercel/Geist-like black-and-white developer aesthetic, code-window hero, stats row,
   bento cards, and a "/catalog" page modelled on awesome-llm. Two agents started it; it is parked as WIP branches
   `site-v4` / `web-v4`.
3. **Claude Code mods.** He had 36 workflow mods built, loaded in every session, then a 37th (a techy progress bar)
   and a 38th (the product's TOTAL completion). See the tooling section.
4. **2026-10-04 morning: the RESET (most important).** He ordered: stop everything (agents, workflows, tests, the
   benchmark), **delete the old directions and the goal completely**, and let the agent choose the best goal. He
   said, in substance: *stop the non-stop testing that burns the agent; instead research, research, research; feed
   the agent real prompts, skills and knowledge about everything in Roblox and about making viral games from
   scratch; only when confident, test by building real games; if not confident, research more; the point is to move
   from stupid non-stop tests to real internet facts and deep human research.*
   - The session wrote `GOAL.md`. **Phase R:** research and feed. **Phase T:** 3–5 real games, judged against a
     research-derived bar; gaps go back to research, not patches.
   - It deleted 7 memory notes that held old directions (the 23 Sep "definition of finished", the blue visual
     direction, the studded look and visual bar, the comparison and test-flow procedures, "library first").
   - It marked `docs/autonomy/` (the V3 scope and ACCEPTANCE gates) as history.
5. **Research rounds.** After round 1 (11 notes) he chose **"more research first"** over deploying. After round 2
   (12 more notes) he chose **"plugin release, then deploy, then build games"**.
6. **The blind critic (2026-10-04):** *"on each game send a fresh blind agent with the final screenshots of the
   game and the agent has to critique everything until perfection."* This is now the core quality loop: no context
   for the critic, only the screenshots and the one-line idea; fix the product, never hand-edit the game; repeat
   until every area scores ≥8/10 with no severe flaw.
7. **Model decision.**
   - The session proposed testing stronger build models (GLM 5.3 full, DeepSeek V4 Pro, Kimi K2.7 Code; 6–10× the
     per-token price of GLM 5.3 Flash). He chose "compare 3", then **cancelled it** mid-run:
     **"cancel all of that and return to the glm 5.3 flash"**.
   - The stronger-model plumbing (price rows, step caps) was reverted.
8. **Handoffs.** He asked for a handoff to Codex, changed his mind ("a new CLAUDE not codex"), then asked to
   **delete the handoff** and first produce **this planning dossier**. Planning agents (e.g. Claude Cowork) will use
   it to decide "what the final product should look like" and plan everything. Only then will a final handoff to
   Claude Code be generated.

## 2.3 What was built and measured in these three days (chronological)
- **CI/deps:** Dependabot vulnerabilities fixed and pushed; red CI jobs fixed. `main` is green at `f8991a96`.
- **Integration:**
  - The capability tracks were merged into `integration/giant`: self-check M1, duplicate-name editing, behaviour
    M4/add_behaviour, credits waste cut, Phase 1 strip of request-specific code, Phase 2 library classification,
    world-building.
  - Self-check is on in production. The golem→Apple rename phases A and B1 are merged; the worker accepts both wire
    spellings (`compat: wire-both`).
- **Benchmark runs on the owner's 30-request bank** (old goal, before the reset):
  - `2026-10-04-selfcheck` had a mean of about 9.4/18 over 11 items, against a 7.27 baseline. Then it was stopped.
  - Typical failures: a renamed object broke the scripts that referred to it, claims of objects that did not exist,
    and things built at the wrong scale (a hamster house at human scale).
- **Phase R (research): 23 cited notes.**
  - Topics: viral hits; discovery and growth; genre design; Luau architecture; worlds and visuals; UI/UX;
    animation, audio and VFX; monetisation and policy; tools ecosystem; from-scratch playbook; RDC 2026 and roadmap;
    then 7 genre families, a visual study of hits, a systems cookbook, building craft, player psychology, and asset
    and audio sourcing.
  - Each has 47–159 sources and a gap-pass.
  - **Fed into the agent:** 1,025 passages in the live search, 23 auto-pushed skill cards, 519 look-up skills (302
    new) and researched prompt principles.
  - The plugin was extended to 1.5.0 (audio API, Animator/IK, safe Explosion).
- **Phase T (real games), game 1** = *"a game where you mine glowing crystals, upgrade your pickaxe and rebirth to
  unlock deeper caves"*. Each round got a fresh blind critic:

  | Round | Score | What happened |
  |---|---|---|
  | r1 | **2/10** | No real assets (store search and insert broken), 0 knowledge lookups, a 32-node mirrored grid of magenta blocks, duplicate UI buttons, looked once at the end |
  | r2 | **1.5/10** | Stamped the plot-sim tycoon template as the whole game, shipped over its own judge's "not ready (79/100)", self-checks never fired. The owner's recording showed no mining at all, "$" text in a crystal game, a mirrored floor label and the default spawn decal |
  | r3 | **1.5/10** | Found and inserted 4 real crystal meshes from the live Creator Store but left them stacked at the origin, used the template again, then read code for ~30 steps without building until a guard stopped it |

- **Fixes shipped between rounds** (all deployed):
  - live Creator Store search for verified, free, script-free assets, plus a `GetObjects` insert path in the
    local plugin;
  - UI tools share one layout (no duplicates, safe zones, honest icons, rebirth cost and progress, modal
    backdrop);
  - researched skills pushed into every plan step;
  - layout flags (grids, objects outside bounds, open maps, dark lighting);
  - failed tools keep their error text;
  - every answer passes the look, an in-product blind critique and the judge gate;
  - a composer counts only as a base, so a world pass is required after it;
  - pressable machines with feedback;
  - honest currency text.

  Branch `fix-r3` holds four more fixes (asset placement, gem icon, spawn decal, label overlap) and a WIP for concrete
  step-by-step build plans.
- **Diagnosis after three rounds:**
  - Each product fix worked.
  - But the build model (**GLM 5.3 Flash**, a small fast model) cannot carry a multi-step creative build: it either
    stamps a template or stalls.
  - The owner rejected the stronger-model route on cost, so **the plan must make a small model succeed**:
    harness-driven step plans, better composers or kits, and asset auto-placement. Alternatively, the owner's
    model decision should be revisited with clear economics.

## 2.4 Things the owner explicitly asked for that remain undone
- A website and app redesign in a genuinely new design language (v4 parked).
- Real games that pass a blind critic (0 of 5 so far).
- A clean, organised GitHub repo: rulesets, Codespaces, Packages, a giant integration PR with ultrareview. Old goal
  items, not re-confirmed after the reset.
- An honest product-completion meter (35.6% as of 2026-10-04 15:00: games 3%, agent capability 45%, knowledge 90%,
  website 15%, plugin and release 50%, ops 50%).


---

# 15. Open decisions, risks, and the planning frame

_Written by the Claude Code session that ran 2026-10-02 → 10-04, from first-hand evidence. This is the section to
plan from. Every decision below is the owner's; options and trade-offs are laid out so a planner can ask him
multiple-choice questions._

## 15.1 The central problem, stated plainly
Apple's agent **knows** a lot now: 23 cited research notes, 1,025 searchable passages, 519 skills, 23 auto-pushed
craft cards. Its **tools** are now mostly fit for purpose: live Creator Store assets, UI that obeys layout rules,
self-checks that fire, and a blind critique before answering.

Yet three rounds of the same game scored **2, 1.5 and 1.5 out of 10** from an independent blind critic. The traces
show why:
- The build model, **GLM 5.3 Flash** (small, fast, cheap), cannot carry a long creative build.
- It reaches for a fixed **template** (`compose_game`: tycoon / plot-sim / lane-defense) and stops.
- Or it gets lost: it read code for 30 steps and built nothing.
- It cannot turn "build a crystal cave world" into dozens of correct, coordinated tool calls.

The owner chose to **keep the cheap model**. So the final product must be designed so that a small model succeeds,
or the model decision must be reopened with honest economics. Everything else is secondary to this.

## 15.2 Decisions the owner must make (in dependency order)

### D1. What exactly is "the final product"?
| Option | What the user gets | Feasibility with today's stack |
|---|---|---|
| A. **Full game from one line** (today's promise) | A complete, publishable game: loop, world, UI, systems, sound, VFX, monetisation | Not reached in 3 rounds. Needs the D2/D3 answers below |
| B. **Genre kits, deeply customised** | The user picks a genre (simulator, obby, tycoon, TD, horror…); the agent assembles a high-quality kit and themes it deeply to the idea | Much more feasible for a small model. The kits carry the quality and the model does the theming |
| C. **Co-pilot inside Studio** | Builds parts on request (a map area, a shop UI, a system), and the user steers | Closest to what works today. Competes directly with Roblox's free Assistant (`research/roblox/09`, `11`) |
| D. Hybrid: B as the default path, A as "magic mode", C for edits | Covers all users | The most work, and the best product |

### D2. Build model and economics
| Option | Quality outlook | Cost per build (rough) | Notes |
|---|---|---|---|
| Stay on GLM 5.3 Flash ($0.15/$0.50 per M tokens) | Low ceiling unless the harness and kits do the heavy lifting | Cheapest (a round cost 82–192 credits) | The owner's current choice |
| Stronger Workers AI models (GLM 5.3 full, DeepSeek V4 Pro, Kimi K2.7 Code: $0.95–1.40 in / $3.96–4.40 out) | Unmeasured. The comparison was cancelled before any run completed | ~6–10× | Needs price rows and per-step caps (both were reverted). Tool support confirmed in the Workers AI catalog |
| Mixed: a strong model for planning and design, Flash for execution | Plausible best value | Modest increase | Not built |
| An external frontier model via AI Gateway | Highest ceiling | Highest cost; new provider dependency | Not built; conflicts with the "zero-cost architecture" memory |

### D3. How the agent builds (architecture)
- **Templates → kits.** Turn `compose_game`'s three fixed maps into a library of high-quality, themeable genre kits:
  world, systems, UI and audio as one coherent package. The small model only fills in a structured theme spec:
  names, palette, assets, numbers.
- **The harness plans and the model fills.** Harness-driven step plans already exist as WIP on branch `fix-r3`: a
  numbered list of exact tool calls built from facts. This could become the core execution engine, a "build
  recipe" interpreter, with the model filling parameters rather than inventing the sequence.
- **Asset-first world building.** The live Creator Store search works. Placement is the weak link: auto-placement,
  clustering and scale normalisation.
- **Keep the blind critique** in the product, and the owner's external blind-critic loop for evaluation.

### D4. Who is the customer?
Options:
- young Roblox creators (13–17; must respect age rules);
- adult hobbyists (18+; growing fastest and the highest spenders);
- small studios;
- the owner himself as a game factory.

The research (`research/roblox/22`) shows 35% under 13, 38% 13–17 and 27% 18+. Under-16 reach for new games requires
Plus or a fee plus engaged-player thresholds. This changes onboarding, safety, pricing and tone.

### D5. Which genres first?
The research gives real economics per genre (`research/roblox/12`–`18`). A small model plus kits favours genres with
strong templates:
- simulator / incremental
- tycoon
- obby
- tower defense

Story horror and PvP combat are harder: AI, netcode and hitboxes. Trend formats (steal or raid, brainrot) decay fast
(-95–99% within months), which argues for evergreen genres plus fast theming.

### D6. Website and brand
- The v4 direction (ai-sdk.dev / awesome-llm aesthetic) is parked WIP.
- Decide:
  - finish v4 or restart;
  - whether "Apple" is a safe name (trademark risk, unexamined);
  - how much the site matters before the product quality is real.

### D7. Plugin distribution
- The free-model insert uses `game:GetObjects`, which the Creator Store's rules restrict for published assets.
- Options:
  - keep it local-only for the owner;
  - publish and risk moderation;
  - find a compliant path (owner uploads, `AssetService`).

### D8. Repository and GitHub (old-goal items, not re-confirmed after the reset)
- Push `research-feed` and open the giant PR.
- Apply rulesets, Codespaces and Packages.
- Finish the repo reorganisation.
- Clean up dozens of stale worktrees.

### D9. Success metrics
Today's measure is the blind critic (target ≥8/10 in every area). For the final product, also consider:
- time to first playable game;
- credits per game;
- user retention;
- the share of games the owner would publish.

## 15.3 Risks
| Risk | Likelihood | Impact | Evidence | Mitigation options |
|---|---|---|---|---|
| A small model cannot reach the quality bar | High | Fatal to promise A | 3 rounds at 1.5–2/10 | D1-B/D, D2 mixed, D3 kits and recipes |
| Roblox ships the same thing for free (Assistant, Planning Mode, Playtest Agent, scene generation) | Medium–high | High | `research/roblox/09`, `11` | Differentiate on full games, kits, quality and speed |
| Policy and moderation: plugin rules, paid random items, maturity labels, Kids/Select gating, the 2026 publishing requirements | Medium | High | `research/roblox/08`, `22` | Build compliance into kits; owner publishes |
| Cost exposure on Workers AI | Medium | Medium | `pricing.ts` caps, BudgetDO | Keep per-step and daily caps; mixed models |
| Solo non-technical owner, giant codebase (5,400+ tests, huge `session.ts` and `tools.ts`) | High | Medium | `planning/sections/06` | Simplify; plan in verifiable small steps |
| The name "Apple" | Unknown | Potentially high | Never examined | Legal check before any launch |
| Scope churn (frequent pivots) | High | Medium | `planning/sections/02` | Lock a final spec and change it only through an explicit decision log |
| The owner library depends on one Mac (gateway at 127.0.0.1:63747) | High | Medium | `planning/sections/03`, `06` | Decide whether the library is a product feature or a private tool |
| **Plugin removed twice from the Creator Store** for "Misusing Roblox Systems"; listing not live; the new `GetObjects` insert path conflicts with an earlier decision to ban it | High | High | section 3 (`03-product-business-vision.md`) | A compliant distribution plan before any publish; owner decision D7 |
| **The account holder's age.** `docs/GO-LIVE.md` states the owner is 15, which blocks Stripe/payments until an adult holds the account | Certain (per docs) | Blocks revenue | section 3 | An adult account holder or guardian arrangement before launch |
| **Spend caps removed** (2026-09-29): theoretical maximum bill ≈ $330,005/month; AI Gateway overage uncapped | Low–medium | Very high | section 3 | Restore global daily/monthly caps before any public traffic |
| **Pricing copy is wrong by 13–23×.** "~163 builds/month" assumed a 77-credit build; real games cost 1,000–1,800 credits, more than every self-serve daily cap | Certain | High (trust, churn) | section 3 | Reprice around measured cost per game; never tested as a paying customer (the owner is unmetered) |
| **Self-check cost.** It made small builds ~16× dearer (139 → 2,273 credits on 11 items) for a judge gain of 7.09 → 9.36/18 | Certain | Medium | section 3 | Decide where checks pay for themselves; tier them |
| **Owner library rights.** Commercial use is only owner-attested; a memory note calls some content "saveinstance dumps" (copies of others' published games) | Medium | High (legal, moderation) | section 3 | Rights audit; keep it private or drop it from the product |

## 15.4 What the final-product spec should contain (for the planner to produce)
1. A product definition in one page: user, promise, core flow, out of scope.
2. The quality bar: the blind-critic rubric with the ≥8/10 target, plus the research-derived checklists per genre.
3. The agent design: model strategy, kit and recipe architecture, asset strategy, checks.
4. The experience: onboarding, pairing, the chat or flow, how users see progress, how they fix things.
5. Business: pricing, credits, costs per build, margins.
6. Website and brand.
7. Compliance: Roblox policies, age rules, the plugin's Creator Store rules.
8. Operations: deploy, monitoring, cost guardrails.
9. Milestones, each with verifiable acceptance tests. For example: "Game 1 scores ≥8 in every area from a fresh blind critic", "credits per game ≤ X".
10. **The final handoff for Claude Code:** an ordered, verifiable task list with file paths and commands, built from the dossier's section 12 and section 6.

## 15.5 Suggested planning process (for Claude Cowork)
1. Read sections 2 (owner), 8 (evidence) and 15 (this section) first. Then 4 (research), 3 (business), 6
   (architecture), 10 (web) and 12 (repo).
2. Ask the owner D1, D2 and D4 as multiple-choice questions, with these trade-offs.
3. Draft the one-page product definition. Review it with the owner.
4. Design the agent architecture for the chosen D1/D2. If a cheap model is kept, make the kit and recipe engine the
   centrepiece.
5. Define milestones, each with acceptance tests the blind critic can check.
6. Produce the Claude Code handoff: current state (from sections 6 and 12), the ordered tasks, the commands and the
   verification steps.
