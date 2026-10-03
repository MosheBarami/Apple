export const meta = {
  name: 'world-building-reliability',
  description: 'Diagnose why world/map builds fail (failed create calls, failed library inserts, a phantom "build with Parts" instruction, loop stops) and add the missing capabilities',
  phases: [
    { title: 'Diagnose', detail: '4 parallel investigations' },
    { title: 'Plan', detail: 'one capability plan' },
    { title: 'Implement', detail: 'worktree' },
    { title: 'Verify', detail: '2 adversarial reviewers' },
  ],
}

const RULES = `
HARD RULES (owner's, binding):
- A live benchmark is running against the DEPLOYED worker and the owner's Roblox Studio. NEVER deploy, never push, never touch Roblox Studio, Chrome or the live API, never restart anything on port 63747. No paid model/provider calls. The owner wants to SAVE CREDITS.
- Repo: /Users/moshe/Developer/RbxAI (shared checkout; other workflows are editing session.ts/tools.ts/library-object.ts in their own worktrees right now). Read-only there unless you were given a worktree. In a worktree: \`git commit -q -F <msgfile> -- <explicit paths>\`; never git add -A, never pnpm install, never stash/reset/checkout. Symlink node_modules from the main checkout if missing (root + each package you test).
- Run \`node scripts/clean-test-tmp.mjs\` after test suites.
- Owner directive "generalize-not-patch": never fix one request's result; never add code that recognises a subject ("village", "canyon", "snow"...). Every failure is a missing agent CAPABILITY. The harness gives information, tools and checks; the agent decides what looks good. Nothing leaks between projects. Asset order: library, Creator Store, combine/adapt, then build from scratch (highly detailed).
- Never use the benchmark's request texts (packages/evals/owner-bench/requests.json) in code, prompts, skills, or tests. Use your own different examples.
- Report only what you measured. Read CLAUDE.md, AGENTS.md, .claude/skills/rbxai-working-rules/SKILL.md first.
`

const EVIDENCE = `
LIVE EVIDENCE (owner benchmark, 2026-10-02; three map requests, fresh chats, clean Baseplate):
- p16 (a forest-with-river map): 25+ min, 63 steps then more, 584 credits, 6/18. Many steps "Did not work": "Placing things around the map" (place/scatter) failed 8+ times, "Building new things" (create_instances) failed repeatedly, "Adding something to your game"/"Adding a model" (library insert) failed; "Tidying up" failed 4 times. The agent's own words: "The library tree insertions keep failing, so I'll build a simple studded tree template from parts and scatter copies". Ended "Stopped." at the cap.
- p17 (a canyon-with-cave map): 23 min, 434 credits, 7/18. The model spent 131 s and 155 s of thinking hand-computing coordinates for ~75 parts, then "Building the desert canyon: Did not work" then "Done"; "Building the hidden cave: Did not work"; "Building new things: Did not work" x many; "Adding a model: Did not work". Ended with: "Apple stopped because it kept changing the same thing over and over" (a loop guard) after ten alternating "Checking the build"/"Tweaking lots of things at once" steps.
- In p17 the model's reasoning says "The user wants me to build now with Parts" and "user said build geometry from Parts rather than looking for assets" — the user's ONLY message was the one-line request; nobody said that. Something in the harness (plan gate, a nudge, a tool result, a system message, a skill card) put it there.
- p18 (a village-at-night map): after 10 min only a white ground slab and paths; "Building the village map: Did not work" x3, "Building the cottage ...: Did not work". No houses, not night.
- Earlier today the plugin refused writes of properties not on its allowlists (Neutral, Duration, TextStrokeTransparency) — apps/apple-plugin/src/Commands.luau "X = true," lines.
`

const STUDIES = [
  { key: 'create-failures', prompt: 'Why do create_instances / build calls fail so often on large builds? Trace the tool from apps/worker/src/tools.ts through validation (schemas, limits on instance count/payload size, property typing, allowlists in apps/apple-plugin/src/Commands.luau, op-failure.ts, tool-recovery.ts, tool-call-integrity.ts) to the plugin. List every rejection path with the exact error text the model receives, and whether that text tells it how to fix the call. Reproduce failure modes with the existing worker tests/harness (no live calls).' },
  { key: 'library-insert', prompt: 'Why do library model inserts ("Adding a model", "Adding a piece", "Adding something to your game") fail? Trace insert paths for owner-library pieces (library-*.ts, local-owner-corpus.ts, owner-corpus.ts, model-library.ts, insert_asset, assets.ts, asset-policy.ts, library-guard.ts) and the plugin ops (apps/apple-plugin/src/ops/LocalOwnerCorpus.luau and friends). List each failure mode and its error text. Also: is there a tool for placing MANY copies of a chosen piece at agent-chosen positions in one call (clone with per-copy transforms, scatter along points/paths/areas)? The model currently hand-writes coordinates for every part.' },
  { key: 'phantom-instruction', prompt: 'Find where "build with Parts" / "build from parts rather than looking for assets" / "build now" reaches the model when the user never said it. Search prompts.ts, run-plan.ts, run-flow.ts, run-intent.ts, router.ts, asset-policy.ts, creator-skills.ts, skill-cards.ts, recipes.ts, design-brief.ts, game-plan.ts, the plan gate ("Planning it out: Did not work" then "Done"), tool results and session.ts system/assistant injections. Show the exact text, the condition that triggers it, and any place the harness speaks AS the user. Also find the loop guard that produced "Apple stopped because it kept changing the same thing over and over" and what counts as "the same thing".' },
  { key: 'world-capabilities', prompt: 'Inventory the world-building capabilities the agent has today for maps: terrain (terrain-recipes.ts, Terrain ops: fill, paint, water/rivers, caves), lighting/time of day (set_mood, Lighting ops: ClockTime, atmosphere), scatter/placement (layout.ts, library-placement.ts, studded-map.ts, hub-layout.ts), grouping/cloning, and look/self-check (render_view, check_composition, audit_build, inspect_visually). For each: what it can do, its limits, its failure rate signals in code/tests. Identify the missing CAPABILITIES that force the model to hand-place ~75 parts with computed coordinates (e.g. terrain shaping, path/area scatter of a chosen piece, parametric clone, set time of day) and what a model-driven version looks like (the model decides what and where; the tool does the arithmetic).' },
]

phase('Diagnose')
const studies = await parallel(STUDIES.map(s => () => agent(`${RULES}\n${EVIDENCE}\nRead-only investigation. ${s.prompt}\nOutput markdown with file:line references and exact strings. Do not edit files.`, { label: `diagnose:${s.key}`, phase: 'Diagnose' })))

phase('Plan')
const plan = await agent(`${RULES}\n${EVIDENCE}\nFour investigations:\n\n${studies.filter(Boolean).map((s, i) => `--- ${STUDIES[i].key} ---\n${s}`).join('\n\n')}\n\nWrite ONE surgical capability plan that (1) makes failed build calls rare and every remaining failure self-explaining (error text says exactly what to change); (2) fixes library inserts or makes their failure reason explicit and actionable; (3) removes any harness text that speaks for the user or steers away from the library (the asset order is library first); (4) adds the missing world-building capabilities as general tools where the MODEL chooses what and where and the tool does the arithmetic (no subject logic, no taste); (5) makes the loop guard tell the agent what it was repeating so it can change approach, instead of only stopping. Prefer extending existing tools to adding new ones (each new visible tool costs tokens every call). New tools must be registered in packages/shared/src/index.ts, apps/worker/src/mcp.ts and apps/worker/src/run-idle.ts. Anything needing a plugin change: list separately (a plugin release needs the owner). Files, changes, tests, verification per step. Do not edit files. Markdown.`, { label: 'plan', phase: 'Plan' })

phase('Implement')
const impl = await agent(`${RULES}\n${EVIDENCE}\nImplement this plan in your own git worktree:\n\n${plan}\n\nCommit in logical commits (subjects start "world-building:"). Add tests that would have caught each failure mode (red first: show the test fails before the fix). Run the full worker suite (cd apps/worker && node --test), typecheck (tsc --noEmit), and apps/apple-plugin tests if you touched the plugin; report the real counts. Report: worktree path, branch, SHAs, what changed, the plugin changes that need a release, what remains.`, { label: 'implement', phase: 'Implement', isolation: 'worktree' })

phase('Verify')
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fail', 'partial'] }, problems: { type: 'array', items: { type: 'string' } }, evidence: { type: 'string' } }, required: ['verdict', 'problems', 'evidence'] }
const verifies = await parallel([
  () => agent(`${RULES}\nThe implementer reported:\n${impl}\n\nAdversarially review the worktree/branch it names: any subject-specific code, taste decisions in the harness, benchmark text leakage, or the harness still speaking for the user? Do the new/extended tools leave choices to the model? Default to fail when uncertain.`, { label: 'verify:generalization', phase: 'Verify', schema: VERDICT }),
  () => agent(`${RULES}\nThe implementer reported:\n${impl}\n\nIn the worktree it names: run the worker suite and typecheck yourself (symlink node_modules if needed), confirm the red-first tests really fail without the fix (revert the fix locally, run, restore), check tool registrations and that no tests were deleted or weakened. Report real counts. Default to fail when uncertain.`, { label: 'verify:tests', phase: 'Verify', schema: VERDICT }),
])
return { plan, impl, verifies }
