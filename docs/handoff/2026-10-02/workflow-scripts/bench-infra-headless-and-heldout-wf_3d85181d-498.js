export const meta = {
  name: 'bench-infra-headless-and-heldout',
  description: 'A headless Node benchmark runner (no Chrome), a blind held-out generalization bank, and photo-review tooling — built and unit-tested, not run',
  phases: [
    { title: 'Understand', detail: 'existing bench, admin routes, e2e chat scripts' },
    { title: 'Build', detail: 'runner + review tool in a worktree; held-out bank written blind' },
    { title: 'Verify', detail: 'adversarial review' },
  ],
}

const RULES = `
HARD RULES (owner's, binding):
- A live benchmark is running in the owner's Chrome against the DEPLOYED worker and Studio. Do NOT run any benchmark, do not call /bench/*, /restore, chat sockets or any live API route, never deploy, never push, never touch Studio or Chrome. No paid calls. The owner wants to SAVE CREDITS.
- Secrets: /Users/moshe/Developer/RbxAI/.env holds GOLEM_ADMIN_KEY and E2E credentials. Never print, log, commit or copy secret values; read them only via process.env / the existing loaders the infra scripts use. Tests must not need real secrets.
- Repo: /Users/moshe/Developer/RbxAI (shared checkout). Read-only there unless given a worktree. In a worktree: \`git commit -q -F <msgfile> -- <explicit paths>\`; never git add -A, never pnpm install, never stash/reset/checkout. Symlink node_modules from the main checkout if missing.
- Run \`node scripts/clean-test-tmp.mjs\` after test suites.
- Report only what you measured. Read CLAUDE.md, AGENTS.md first.
`

phase('Understand')
const map = await agent(`${RULES}\nRead-only. Map what a headless benchmark runner needs: packages/evals/owner-bench (README.md, runner.js — the browser runner, its protocol and today's fixes: 25-min turn cap then POST /stop, whenIdle retries on 409 "a run is in progress", credits counted after evaluate; score.mjs), the owner-gated and admin bench routes in apps/worker/src/index.ts (/api/projects/:id/bench/reset, /bench/evaluate, /api/admin/bench-reset/:id and any admin evaluate twin, /restore, /checkpoints, /messages, /stop, the ws route and its subprotocols golem.v1 / golem.jwt.<token>), how infra/real-chat.mjs and infra/pair-helper.mjs authenticate (E2E account sign-in through Supabase, admin key header) and talk over the socket, how photos are stored (storeImage) and served (/api/projects/<id>/images/<imageId>), and what an evaluate result row contains (apps/worker/src/owner-bench.ts). Output an implementer's brief.`, { label: 'understand', phase: 'Understand' })

phase('Build')
const [runner, heldout] = await parallel([
  () => agent(`${RULES}\nBrief:\n${map}\n\nIn your own worktree build: (1) packages/evals/owner-bench/run.mjs — a Node CLI that runs a bank (any bank file, e.g. requests.json or a held-out bank) against a project with the same protocol as runner.js (reset, restore bench-baseline, each turn over the socket, 25-min cap then stop, wait for idle, evaluate, count credits after), authenticating like the infra scripts (env vars, never printed), with --from/--only/--ids/--max-credits (a hard credit budget: stop before starting an item once spent >= budget) and --dry-run; results to packages/evals/owner-bench/results/<run>.json in the shape score.mjs reads; resumable. (2) packages/evals/owner-bench/review.mjs — downloads an evaluated run's photos to a local folder and writes a review sheet (per item: request, scores, critique, photo paths) so a human/Claude can lower scores with evidence, and an apply step that records lowered scores with a reason (never raises). Unit-test both with a fake server (node:test, no network). Commit (subjects start "owner bench:"). Report worktree, branch, SHAs, test counts.`, { label: 'build:runner', phase: 'Build', isolation: 'worktree' }),
  () => agent(`${RULES}\nYou write a HELD-OUT generalization bank, blind. Do NOT open packages/evals/owner-bench/requests.json, apps/worker/src/prompts.ts, creator-skills.ts, skill-cards.ts, recipes.ts, or any knowledge/skills/RAG content. Write packages/evals/owner-bench/heldout-v1.json: version "owner-heldout-v1", frozen today, 21 items = 3 per category (object, silly, modify [2 turns each], map, system, ui, game), the kind of one-line requests real young Roblox creators type, varied in theme, style, colour, size and genre, each different from typical examples. Keep it short and natural. Do not commit it — return the JSON in your answer only, plus one line on how you chose them. (The orchestrator will commit it.)`, { label: 'build:heldout', phase: 'Build' }),
])

phase('Verify')
const verify = await agent(`${RULES}\nThe runner builder reported:\n${runner}\n\nIn the worktree it names: run its tests; review run.mjs for protocol fidelity with runner.js (reset before restore, abort on a non-empty place, stop at the cap, wait for idle, credits after evaluate), secret handling (never printed/logged/committed), the --max-credits guard really stopping before an item starts, resumability, and that review.mjs can only lower scores. Do NOT run it against the live API. Report pass/fail per point with evidence.`, { label: 'verify', phase: 'Verify' })
return { runner, heldout, verify }
