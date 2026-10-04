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
