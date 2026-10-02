export const meta = {
  name: 'phase3-4-capability-design',
  description: 'Phases 3+4 design only: Creator Store pipeline and agent capabilities (self-critique, knowledge, sound, VFX, RigEdit, lighting, terrain)',
  phases: [
    { title: 'Research', detail: '4 parallel read-only studies' },
    { title: 'Synthesize', detail: 'one ordered build plan with generalization tests' },
  ],
}

const RULES = `
HARD RULES: read-only research and design. Do NOT edit or commit anything, never deploy, never push, never touch Roblox Studio or Chrome, never call paid APIs,
never upload to Roblox. A live benchmark is running. Repo: /Users/moshe/Developer/RbxAI. Read CLAUDE.md, AGENTS.md first.
Owner directive "generalize-not-patch": every failure is a missing agent CAPABILITY; no subject-specific code; the harness gives information, tools
and checks and the agent decides; nothing leaks between projects; asset order = library, then Creator Store (Roblox-owned/quality first), then combine/adapt, then build from scratch (highly detailed).
A separate workflow is concurrently rewriting libraryObjectStep/library-object.ts/compose-*.ts (phase 1) and library search (phase 2) — design around those, do not duplicate them.
Use the docs corpus (packages/corpus/data/chunks.jsonl, Roblox creator docs) for Roblox API facts instead of memory; cite doc paths.
`

const EVIDENCE = `
BENCHMARK EVIDENCE (owner-30-v1, 2026-10-02, judge 0-2 per criterion): means over the first 13 items: works 1.23, professional 0.46, matches 0.38,
polished 0.38, noErrors 1.62, performance 1.92, sound 0.08, animation 0.92, fx 0.31. Library pieces are imported with every script and sound stripped
(security gate), and the agent cannot re-add requested behaviour (hinge a lid, play music on click, bounce). No self-check before answering: it claimed
visible joke text that was hidden, and red paint that was white. Hand-built routes are slow/expensive (112 and 87 credits); a map request (p16) ran 25+
minutes, 63 steps with many failed steps, 584 credits, scored 6/18. Evaluator: apps/worker/src/owner-bench.ts (4 viewport photos + play_check + vision judge).
`

const STUDIES = [
  { key: 'store', prompt: 'PHASE 3 Creator Store pipeline: search, insert, inspect, modify, combine; safety scan; verify in Play. Study what exists (find_verified_asset, insert_asset, asset-policy.ts, asset-provenance.ts, library-guard.ts, ui-store-search.ts, roblox-check.ts, the plugin ops) and design the full pipeline, including how to RE-ADD requested behaviour to stripped/inserted models safely (agent-written scripts, reviewed by luau-review.ts/sandbox rules), and define 10 different Store tasks as the done-test.' },
  { key: 'critique', prompt: 'PHASE 4 visual self-critique loop: the agent must check its own work with multi-angle screenshots and improve it before saying it is done, and must not claim things it has not verified. Study what exists (critic.ts, composed-judge.ts, client-judge*.ts, owner-bench.ts photo capture, render/viewport tools, playtest.ts, docs/VISUAL-LOOP.md) and design the loop: when it runs, what it captures, what the critique sees, budget/credit limits, stop conditions, and how claims in the final reply are checked against the place.' },
  { key: 'senses', prompt: 'PHASE 4 sound, animation and VFX: real sound design (SoundGroups, SoundService, spatial sound, music/ambience/SFX from the library sfx index and Roblox audio), real animation (RigEdit / AnimationController / Motor6D / TweenService; check whether RigEdit is a plugin the agent can drive or not and what that requires), context-fitting VFX (ParticleEmitter, Beam, Trail, lighting post-effects). Study sound-design.ts, sfx.ts, audio-tools.ts, animate-tool.ts, effects.ts, fx-library.ts, packages/components/{animate,fx,motion}, packages/asset-library/{sfx,vfx}, the plugin allowlists in apps/apple-plugin/src/Commands.luau, and design the capabilities so the AGENT chooses what fits.' },
  { key: 'knowledge', prompt: 'PHASE 4 knowledge and skills: a huge knowledge base (all Creator Docs, Luau, Studio services, game design, optimization) and a skills/recipes library, plus more tools (lighting, terrain). Study rag.ts, retrieval.ts, semantic.ts, embedding-retrieval.ts, skill-cards.ts, creator-skills.ts, recipes.ts, terrain-recipes.ts, mechanics.ts, prompts.ts and the corpus (packages/corpus). Measure current coverage (what docs are indexed, counts) and design what to add, how the agent retrieves it, and how to keep benchmark prompts out of it (the bank must never leak into skills/RAG).' },
]

phase('Research')
const studies = await parallel(STUDIES.map(s => () => agent(`${RULES}\n${EVIDENCE}\n${s.prompt}\nOutput markdown: what exists (with file paths and what it really does, verified by reading code), the gaps against the evidence, the proposed design, the files it would touch, risks, and a done-test that uses >= 3 never-tried requests per category in fresh chats.`, { label: `study:${s.key}`, phase: 'Research' })))

phase('Synthesize')
const plan = await agent(`${RULES}\n${EVIDENCE}\nFour studies:\n\n${studies.filter(Boolean).map((s, i) => `--- STUDY ${STUDIES[i].key} ---\n${s}`).join('\n\n')}\n\nSynthesize ONE ordered build plan for phases 3 and 4 that starts after phase 1 lands: milestones, each with files, the capability added, the generalization test (>= 3 unseen requests per category, fresh chats), the benchmark criterion it should move (works/professional/matches/polished/noErrors/performance/sound/animation/fx) and by how much you expect, cost/credit impact, and dependencies. Flag anything that needs the owner (paid calls, Studio plugins to install, Roblox account actions). Write it as markdown suitable for docs/autonomy/PHASE-3-4-PLAN.md (do not write the file).`, { label: 'synthesize', phase: 'Synthesize' })
return { plan }
