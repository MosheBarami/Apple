# Agent prompt: make CI green on the integration branch (stopped mid-work 2026-10-02 ~17:50)

Status when stopped: it had committed two fixes on `integration/giant` (`def76bd5` security pin for the bench-reset admin
route = the long-standing evals A4 failure; `6aa3c4bc` web build: lazy route chunk naming, motion kept out of the entry
chunk = the app bundle budget). It was about to run the per-package tests. Re-launch from the current HEAD.

---

Make the repo's GitHub Actions CI green on the integration branch of the Apple (RbxAI) repo.

WHERE
- Work ONLY in the worktree /Users/moshe/Developer/RbxAI-integration (branch `integration/giant`). Its node_modules:
  apps/worker, apps/web, packages/evals, apps/site have node_modules DIRECTORIES whose entries are symlinks into the
  main checkout (/Users/moshe/Developer/RbxAI/<pkg>/node_modules/*), with @golem/* pointing at this worktree's packages;
  other packages symlink their node_modules to the main checkout. NEVER run pnpm install/add here or in the main checkout.
  Never push, never deploy, never touch Studio/Chrome/live APIs. Commit with `git commit -q -F <msgfile> -- <paths>`;
  never git add -A. End commit messages with: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- Read CLAUDE.md, AGENTS.md and .claude/skills/rbxai-working-rules/SKILL.md first. Never delete or weaken a test to go
  green (restate only when the pinned behaviour was deliberately changed, and say why); fix root causes; report only what
  you ran.

WHAT IS RED
.github/workflows/ci.yml (Node 22 = NODE_VERSION, pnpm 11.13). On main every run on 2026-10-02 failed "Typecheck and
tests", "Build site and web" (the "Web app bundle budget" step) and "Playwright smoke" (landing composition/header,
"/docs/modes should resolve", "canUseProductModel is not a function"). Read main's logs read-only:
`gh run view 37010547663 --repo MosheBarami/Apple --log-failed`. The integration branch differs a lot from main, so first
reproduce each ci.yml job LOCALLY on this branch exactly as ci.yml runs it, then fix what is red here. Use a Node 22 binary
if one exists locally (~/.nvm, /opt/homebrew/opt/node@22, volta, fnm); do not download one silently. Playwright: use the
installed @playwright/test and its browsers; if browsers are missing, report it.

DONE WHEN every ci.yml job's commands pass locally (list each job and result), with a commit per fix; plus full worker,
web, site (after astro build), evals, root tests and the plugin build pass; `node scripts/clean-test-tmp.mjs` after.
