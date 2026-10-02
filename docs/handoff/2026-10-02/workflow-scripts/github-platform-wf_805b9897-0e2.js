export const meta = {
  name: 'github-platform',
  description: 'GitHub platform setup: Codespaces devcontainer, GitHub Packages publishing, rulesets (as code, not applied), templates/CODEOWNERS/dependabot, docs',
  phases: [
    { title: 'Inventory', detail: 'what exists on GitHub and in .github' },
    { title: 'Build', detail: 'one worktree, all platform files' },
    { title: 'Verify', detail: 'adversarial review' },
  ],
}

const RULES = `
HARD RULES:
- Repo /Users/moshe/Developer/RbxAI, GitHub remote MosheBarami/Apple (PRIVATE). Read CLAUDE.md, AGENTS.md first.
- READ-ONLY on GitHub: gh api GET calls only (repo settings, rulesets, branches, workflows, environments, secrets NAMES only, packages). Do NOT create/modify rulesets, branch protection, settings, secrets, packages, codespaces, or push anything. Produce files and an apply script; the orchestrator applies them later.
- Never print secret values. Never git add -A, pnpm install, stash/reset/checkout in the main checkout. In your worktree commit with \`git commit -q -F <msgfile> -- <explicit paths>\` and end messages with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Facts that matter: the workspace packages are currently named @golem/* and a separate branch renames them to @apple/* (merged later). Main's CI (.github/workflows) has been failing all day on "Typecheck and tests", "Build site and web" (web app bundle budget) and "Playwright smoke"; another agent fixes those later — do not try to fix them here. The live product runs on Cloudflare Workers (apps/worker) and needs the owner's Mac for Roblox Studio and a local library gateway on 127.0.0.1:63747, so a Codespace can do code/tests/typecheck/site builds but never live Studio work. Node 26, pnpm 11.13 (package.json packageManager). Cloudflare Workers Builds is connected to the repo and uploads a preview version for every PR branch (not a production deploy).
`

phase('Inventory')
const inv = await agent(`${RULES}\nRead-only inventory: .github/ (workflows, templates, CODEOWNERS, dependabot), gh api repos/MosheBarami/Apple (visibility, default branch, merge settings, features), gh api repos/MosheBarami/Apple/rulesets and /branches/main/protection, environments, secrets and variables NAMES, packages (gh api /user/packages?package_type=npm), codespaces devcontainer presence, which workspace packages are publishable (package.json name/private/exports/build), and what CI jobs exist and their names. Output a concise brief.`, { label: 'inventory', phase: 'Inventory' })

phase('Build')
const impl = await agent(`${RULES}\nBrief:\n${inv}\n\nIn your own git worktree build:
1. Codespaces: .devcontainer/devcontainer.json (+ Dockerfile or features) with Node 26, pnpm 11.13 via corepack, Python 3 (packages/owner-classify tests), Luau/lune/rojo if practical, postCreateCommand that installs deps and runs a smoke typecheck; forwardPorts for wrangler dev / vite / astro dev; a README note that Studio and the library gateway are Mac-only.
2. GitHub Packages: publishConfig for the workspace packages that are meant to be consumed outside the repo (decide from the brief: likely the shared wire contract and the public SDK; make the scope-agnostic: read the package name, publish to https://npm.pkg.github.com with the owner scope required by GitHub Packages — note GitHub Packages requires the npm scope to equal the repo owner, so document the scope mapping and do the minimal correct thing), and .github/workflows/publish-packages.yml: on tags 'packages-v*' and workflow_dispatch, permissions packages:write + contents:read, build/typecheck then publish with GITHUB_TOKEN; never runs on PRs; dry-run job on PRs that touch those packages (npm publish --dry-run).
3. Rulesets as code: .github/rulesets/main.json (require PR before merging to main, require the CI status checks by their real job names, block force-push and deletion, linear history optional — choose and justify) and scripts/github/apply-rulesets.mjs that applies them via gh api (with --dry-run printing the request). Do NOT apply. Also a docs note that the ruleset must only be applied after main's CI is green, or it blocks every merge.
4. "And more": .github/CODEOWNERS (owner MosheBarami), PR template with the owner's checklist (generalization test: >=3 unseen requests per category in fresh chats; no subject-specific code; tests red-first; what was measured live), issue templates (bug, capability gap, benchmark failure), dependabot.yml (npm weekly, github-actions weekly, grouped, no auto-merge), a Codespaces prebuild note.
5. docs/operations/GITHUB.md: what each file does, how to apply rulesets, how to publish packages, how to open a Codespace, and what cannot run in the cloud.
Validate: JSON/YAML parse, actionlint if available (npx --no-install actionlint or skip and say so), node --check on scripts, a dry-run of apply-rulesets printing the payload, and npm pack --dry-run on the publishable packages. Report worktree, branch, SHAs, and what you could not verify.`, { label: 'build', phase: 'Build', isolation: 'worktree' })

phase('Verify')
const verify = await agent(`${RULES}\nThe builder reported:\n${impl}\n\nAdversarially review the worktree it names: would the ruleset lock the owner or the agents out (required checks named correctly? bypass for the owner/admin?), would publish-packages leak anything (files field / .npmignore — check npm pack --dry-run contents for secrets, tests, large data), does the devcontainer actually build the toolchain versions claimed, do workflows have least-privilege permissions and pinned actions, is anything applied to GitHub (must not be)? Default to fail when uncertain.`, { label: 'verify', phase: 'Verify' })
return { inv, impl, verify }
