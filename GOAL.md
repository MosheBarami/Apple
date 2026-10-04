# GOAL (set 2026-10-04; replaces every earlier goal, mission, meter and direction)

**Make Apple's agent know Roblox game-making as deeply as a top professional studio does, and then prove it by building
real, complete games from scratch.**

Everything earlier is retired: the 11-point `/goal`, the fixed meter, the V3 scope and `ACCEPTANCE.json` gates, the
frontier benchmark loop and the "generalize-not-patch" test protocol. Those files stay in git as history only.

## Why this goal

The benchmark loop kept measuring an agent that doesn't yet *know* enough. Each run cost credits and produced
critiques ("no sound", "not to scale", "looks generic", "claimed what it never built") that all come from the same
missing thing: deep, factual, current knowledge of how good Roblox games are actually made. Testing harder doesn't
create knowledge; research does.

## Phase R: research and feed (now). No benchmark runs and no test loops in this phase.

1. **Research** from real sources: official Roblox docs and the DevForum, Roblox's own blog, RDC talks and its
   2025–2026 announcements, developer postmortems and interviews, analytics write-ups, and GDC talks. Every fact
   cites its source and date. Topics live in `research/roblox/BRIEF.md` (coverage map).
2. **Distil** each topic into what the agent can use:
   - **Knowledge** (the docs corpus that `search_docs` reads): facts, numbers and API usage.
   - **Skills** (`search_creation_skills` / `read_creation_skill`): step-by-step recipes for building a thing well.
   - **Prompt** (`apps/worker/src/prompts.ts`): only the few principles the agent needs on every turn.
3. **Feed** them through the existing channels and keep the existing size budgets.
   - The only checks run in this phase are the unit tests that guard the format of what was added.
   - No live builds, no bench and no credits spent on judging.

**Exit criteria:** every row of the coverage map is marked *fed*, with:
- a cited research doc;
- distilled knowledge in the corpus;
- at least one skill for each buildable thing it covers;
- a self-review answering "could a new game designer build a good version of this from what the agent can read?"

When that holds and I'm confident, go to Phase T. If not, research more.

## Phase T: real games (only after R)

1. Build 3–5 complete games from scratch in Studio, each in a different genre. Each starts from a one-line idea.
2. Each game must be playable and publish-ready, and must have everything a viral game of its genre has: core loop,
   progression, onboarding, UI, sound, VFX and monetisation hooks.
3. Judge each one against the research-derived quality bar, not against the old benchmark.
4. Every gap found goes back to Phase R as a research question, not as a patch.

## Parked work (kept, not deleted; resume after Phase T or when useful)

The website redesign (`site-v4`, `web-v4`), the library search (`search-90`, 86% top-3), the repo reorganisation
(`repo-reorg`) and worker fixes (`fixes-0410`). These are saved as `handoff/*` branches in this repo. Their restore
prompts are in `docs/handoff/2026-10-04/`.
