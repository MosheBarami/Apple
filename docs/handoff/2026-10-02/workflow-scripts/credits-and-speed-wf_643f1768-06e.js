export const meta = {
  name: 'credits-and-speed',
  description: 'Find where a run spends its credits and time, and cut the waste without lowering quality',
  phases: [
    { title: 'Measure', detail: '3 parallel cost studies' },
    { title: 'Plan', detail: 'ranked savings plan' },
    { title: 'Implement', detail: 'worktree' },
    { title: 'Verify', detail: 'adversarial review' },
  ],
}

const RULES = `
HARD RULES (owner's, binding):
- A live benchmark is running against the DEPLOYED worker and the owner's Roblox Studio. NEVER deploy, never push, never touch Studio, Chrome or the live API. No paid model calls. The owner explicitly wants to SAVE CREDITS.
- Repo: /Users/moshe/Developer/RbxAI (shared checkout; other workflows edit session.ts/tools.ts in their own worktrees). Read-only there unless given a worktree. In a worktree: \`git commit -q -F <msgfile> -- <explicit paths>\`; never git add -A, never pnpm install, never stash/reset/checkout. Symlink node_modules from the main checkout if missing.
- Run \`node scripts/clean-test-tmp.mjs\` after test suites.
- Owner directive "generalize-not-patch": no subject-specific code; never cut capability to save money (expand the agent, don't restrict it); the agent decides, the harness informs. Savings must come from waste: repeated work, oversized prompts, unused tool definitions, loops, wasted retries, oversized thinking, failed calls.
- docs/COST-MODEL.md drives every Credit figure on the site: do not change prices or plan limits; change what a run consumes.
- Report only what you measured. Read CLAUDE.md, AGENTS.md first.
`

const EVIDENCE = `
LIVE EVIDENCE (owner benchmark, 2026-10-02, fresh chats): library-object items cost ~1 credit; hand-built items 5-112 credits (s08 112 credits / 4 min, m13 87 credits / 4.5 min, m14 66, m15 43); maps: p16 584 credits (25+ min, stopped at the cap), p17 434 credits (23 min). Map runs show the model thinking 131 s and 155 s to hand-compute coordinates for ~75 parts, many failed calls retried ("Did not work" dozens of times), ten alternating check/tweak steps before a loop guard stopped it, and a forced "Planning it out" step that failed once. Model: @cf/zai-org/glm-5.3-flash for plan/agent/vision roles (apps/worker/src/gateway.ts), ctx 1.3M tokens, maxTokens 6500.
`

const STUDIES = [
  { key: 'meter', prompt: 'How is a run charged? Trace credits from model usage (neurons/tokens) through quota-math.ts, pricing.ts, run-refund.ts, BudgetDO/QuotaDO, the creditsSpent on messages, and docs/COST-MODEL.md. What exactly makes a 25-minute map run cost 584 credits: input tokens re-sent each step (system prompt + tool definitions + growing transcript), output/thinking tokens, vision calls, tool-internal model calls? Build a per-step cost model from the code with numbers (prompt size in tokens: measure the real system prompt and tool-definition JSON sizes by running the builders in tests or a node script).' },
  { key: 'context', prompt: 'Context growth: per agent step, what is sent to the model (prompts.ts, prompt-budget.ts, schema-once.ts, transcript.ts, run-parts.ts, tools-for-mode, compaction/summarisation if any)? Measure the size of the tool definitions for a building run, how big tool results get (get_tree, inspect, audit_build outputs) and whether old tool results are trimmed. Identify the biggest per-step waste with measured numbers.' },
  { key: 'loops', prompt: 'Wasted steps: failed tool calls and their retries, check/tweak oscillation, the loop guard (what triggers "kept changing the same thing over and over" and how late), forced planning steps, repeated get_tree/inspect calls, retries on the same error. Use apps/worker/tests and the run loop in do/session.ts, run-flow.ts, run-plan.ts, tool-recovery.ts. Quantify how many steps per run these can burn and what a run could do instead.' },
]

phase('Measure')
const studies = await parallel(STUDIES.map(s => () => agent(`${RULES}\n${EVIDENCE}\nRead-only (you may run local node scripts/tests that do not call any network). ${s.prompt}\nOutput markdown with file:line references and measured numbers.`, { label: `measure:${s.key}`, phase: 'Measure' })))

phase('Plan')
const plan = await agent(`${RULES}\n${EVIDENCE}\nThree studies:\n\n${studies.filter(Boolean).map((s, i) => `--- ${STUDIES[i].key} ---\n${s}`).join('\n\n')}\n\nWrite a RANKED savings plan: each item = the waste, the change, files, estimated saving per typical run (with the arithmetic), risk to quality, and how to verify with tests (no live runs). Only changes that remove waste; none that remove capability. Do not edit files. Markdown.`, { label: 'plan', phase: 'Plan' })

phase('Implement')
const impl = await agent(`${RULES}\n${EVIDENCE}\nImplement the top items of this plan (as many as are safe and testable) in your own git worktree:\n\n${plan}\n\nFor each: a test that measures the before/after size or step count (red first where it is a guard). Commit in logical commits (subjects start "credits:"). Run the full worker suite and typecheck; report real counts and the measured before/after numbers. Report: worktree, branch, SHAs, savings measured, what remains.`, { label: 'implement', phase: 'Implement', isolation: 'worktree' })

phase('Verify')
const verify = await agent(`${RULES}\nPlan:\n${plan}\n\nThe implementer reported:\n${impl}\n\nAdversarially verify in the worktree it names: re-measure the before/after numbers yourself; check nothing removed a capability the agent needs (tools still reachable when relevant, context the model needs still there), no prices or plan limits changed, tests not weakened; run the worker suite. Report confirmed vs claimed savings. Default to refuting when uncertain.`, { label: 'verify', phase: 'Verify' })
return { plan, impl, verify }
