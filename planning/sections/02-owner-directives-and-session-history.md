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
