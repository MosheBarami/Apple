export const meta = {
  name: 'phase1-strip-request-specific',
  description: 'Phase 1: audit and remove request-specific code and harness taste decisions, replace with agent capability',
  phases: [
    { title: 'Audit', detail: '3 auditors, different lenses' },
    { title: 'Plan', detail: 'one change plan from all findings' },
    { title: 'Implement', detail: 'one worktree agent makes the change + CI guard' },
    { title: 'Verify', detail: 'two adversarial reviewers' },
  ],
}

const RULES = `
HARD RULES (owner's, binding):
- A live benchmark is running against the DEPLOYED worker and the owner's Roblox Studio. NEVER deploy, never push, never touch Roblox Studio, Chrome, or the live API. Never restart anything on port 63747. No paid model/provider calls.
- Repo: /Users/moshe/Developer/RbxAI (shared checkout; other agents work in it). Read-only there unless you were given a worktree. In a worktree: commit with \`git commit -q -F <msgfile> -- <explicit paths>\` (git add -- <path> for new files first). Never git add -A, never pnpm install, never stash/reset/checkout.
- If node_modules are missing in your worktree, symlink them from the main checkout (root and each package you test), e.g. \`ln -s /Users/moshe/Developer/RbxAI/node_modules node_modules\` and \`ln -s /Users/moshe/Developer/RbxAI/apps/worker/node_modules apps/worker/node_modules\`.
- After running test suites run \`node scripts/clean-test-tmp.mjs\` (tests leave many temp dirs; disk filled up once today).
- Owner directive "generalize-not-patch": never hand-fix one result; never add code that recognises a specific request or subject ("if duck", a laundry: map). Every failure is a missing agent CAPABILITY. Expand the agent, don't restrict it. The harness never decides what is pretty/cool or which model fits: the agent decides; the harness gives it information, tools and checks. Every project is new: nothing from one project may leak into another. Library/Creator Store are preferred sources.
- Report only what you measured (real test counts from real runs). Read CLAUDE.md, AGENTS.md and .claude/skills/rbxai-working-rules/SKILL.md first.
`

const CONTEXT = `
CONTEXT (from the 2026-10-02 benchmark, 13 items): the library-object step picks by NAME not meaning and adds the same kit to everything:
knife for "treasure chest", Doge head for "robot pet", shrine for "sword on a stand", party balloons for "hot air balloon",
trampoline for "cloud you can bounce on". matches mean = 0.38/2. libraryObjectStep runs BEFORE any model call, takes the first name
match, then adds a stage, a wobble, a counter HUD and "Click it!" to every object. The agent cannot reject all candidates, compose, or build instead.
Known targets (verify each, find more):
- THINGS (laundry, bakery, pizza, farm, mining, coffee) and KIN (keyboard, piano, car...) in apps/worker/src/compose-tool.ts
- KNOWN (laundry, pizza) in apps/worker/src/compose-tycoon.ts
- the crown + sparkles fallback in coolChoice
- the stage/counter/"Click it!"/wobble kit added by placeChosenObject and build_object
- libraryObjectStep in apps/worker/src/do/session.ts running before any model call
- the tier-recolour top-up in compose-plotsim.ts machineLadder
- objectQueries/rankCatalog name ranking in apps/worker/src/library-object.ts
- cross-project leakage: builtObject, builtGame, project memory, saved instructions
`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' }, line: { type: 'number' }, symbol: { type: 'string' },
          kind: { type: 'string', enum: ['subject-specific', 'harness-taste', 'pre-model-decision', 'cross-project-leak', 'other'] },
          what: { type: 'string' }, why_it_breaks_generalization: { type: 'string' },
          replacement_capability: { type: 'string' }, tests_that_pin_it: { type: 'array', items: { type: 'string' } },
        },
        required: ['file', 'symbol', 'kind', 'what', 'replacement_capability'],
      },
    },
  },
  required: ['findings'],
}

const LENSES = [
  { key: 'literals', prompt: 'Lens: SUBJECT LITERALS. Sweep apps/worker/src (all compose-*.ts, library-*.ts, object-tool.ts, prefabs.ts, scene-kits.ts, genre-kits.ts, recipes.ts, prompts.ts, tools.ts and any other file) and packages/components for code that recognises a specific subject/request word or carries a hard-coded subject->design mapping (maps of nouns, regexes over request text, special cases).' },
  { key: 'taste', prompt: 'Lens: HARNESS TASTE + PRE-MODEL DECISIONS. Find every place where harness code (not the model) decides what looks good, which asset fits, adds decorations/kits/HUDs/wobbles/stages to everything, recolours, picks the first name match, or acts before the model has been asked. Start from libraryObjectStep in apps/worker/src/do/session.ts and library-object.ts (offerLibraryObjects, findObjectCandidates, objectQueries, rankCatalog, placeChosenObject, pickPrompt), coolChoice, build_object, machineLadder.' },
  { key: 'leak', prompt: 'Lens: CROSS-PROJECT LEAKAGE. Find every path by which state, UI, maps, models or instructions from one project (or one benchmark item) can reach another: builtObject, builtGame, plannedGame, project memory, saved instructions, any KV/D1/global caches keyed by user not project, any "reuse last build" logic, components copied from earlier projects. Note bench-reset (session.ts) clears some keys; check what it misses.' },
]

phase('Audit')
const audits = await parallel(LENSES.map(l => () => agent(
  `${RULES}\n${CONTEXT}\nYou are a read-only auditor for Phase 1 of the owner's plan. ${l.prompt}\nFor each finding give file, line, symbol, what it does, why it breaks generalization, the agent CAPABILITY that should replace it (information + tool + a decision the agent makes, including "none of these; compose or build instead"), and which tests pin the current behaviour (grep apps/worker/tests). Do not edit files.`,
  { label: `audit:${l.key}`, phase: 'Audit', schema: FINDINGS })))
const all = audits.filter(Boolean).flatMap(a => a.findings)
log(`${all.length} findings across ${audits.filter(Boolean).length} auditors`)

phase('Plan')
const plan = await agent(
  `${RULES}\n${CONTEXT}\nYou are the planner for Phase 1. Here are all audit findings as JSON:\n${JSON.stringify(all)}\n\nDeduplicate them and write ONE concrete change plan that: (1) removes every subject-specific branch and harness taste decision; (2) replaces libraryObjectStep's pre-model pick with candidate INFORMATION handed to the model (names, descriptions, sizes, colours, preview info) plus a tool/choice where the model can pick one, combine several, or reject all and build/compose instead; (3) stops adding the same kit (stage, counter HUD, Click it!, wobble, crown) to everything — the model may add such things only when the request calls for it; (4) closes every cross-project leak; (5) adds a CI test (apps/worker/tests/no-subject-literals.test.mjs or similar) that fails on subject-specific literals in harness code, with a falsification step (show it goes red when one is re-added). Keep it surgical and minimal (Karpathy principles in CLAUDE.md). List per step: files, the change, tests to update (tests that pin removed behaviour must be updated to pin the new contract, never deleted silently), and how to verify. Remember a new tool must be registered in packages/shared/src/index.ts, apps/worker/src/mcp.ts and apps/worker/src/run-idle.ts. Plugin allowlists in apps/apple-plugin/src/Commands.luau constrain what can be written. Do not edit files. Output the plan as markdown.`,
  { label: 'plan', phase: 'Plan' })

phase('Implement')
const impl = await agent(
  `${RULES}\n${CONTEXT}\nYou are the implementer for Phase 1, working in your own git worktree. Execute this plan:\n\n${plan}\n\nCommit in small logical commits on your worktree branch (explicit pathspecs; commit subjects start with "phase 1:"). Run the full worker suite (cd apps/worker && node --test) and typecheck (pnpm exec tsc --noEmit in apps/worker, or node_modules/.bin/tsc) and report the real pass/fail counts. Do the falsification check for the new CI guard (re-add a subject literal, see it fail, revert). At the end report: worktree path, branch name, commit SHAs, what changed, test counts, anything you could not do and why.`,
  { label: 'implement', phase: 'Implement', isolation: 'worktree' })

phase('Verify')
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fail', 'partial'] }, problems: { type: 'array', items: { type: 'string' } }, evidence: { type: 'string' } }, required: ['verdict', 'problems', 'evidence'] }
const verifies = await parallel([
  () => agent(`${RULES}\nYou are an adversarial reviewer. The Phase 1 implementer reported:\n${impl}\n\nOpen the worktree/branch it names (read-only; use git -C <worktree> log/diff). Try to REFUTE that phase 1 is done: grep the branch's harness code for remaining subject-specific literals/branches and harness taste decisions (stage/counter/Click it!/wobble/crown kits, name-first picks, recolours), check that the model now receives candidate information and can reject all candidates, and that the new CI guard actually fails when a literal is re-added (run it). Default to fail if uncertain.`, { label: 'verify:generalization', phase: 'Verify', schema: VERDICT }),
  () => agent(`${RULES}\nYou are an adversarial reviewer. The Phase 1 implementer reported:\n${impl}\n\nOpen the worktree/branch it names. Try to REFUTE that nothing regressed: run the worker test suite and typecheck there yourself (symlink node_modules if needed), check every new/changed tool is registered in packages/shared/src/index.ts, apps/worker/src/mcp.ts, apps/worker/src/run-idle.ts, check that no tests were deleted or weakened to make things pass (compare git diff of apps/worker/tests), check cross-project leaks are really closed. Report real counts. Default to fail if uncertain.`, { label: 'verify:regressions', phase: 'Verify', schema: VERDICT }),
])
return { findings: all.length, plan, impl, verifies }
