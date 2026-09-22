# Harness setup evidence — 2026-09-22 ~21:45 IDT

Everything the research report's "Priority tooling checklist" asks to be verified, with what was
measured. Nothing here is inferred unless it says so.

| Priority | Item | Verification performed | Result |
|---|---|---|---|
| P0 | Git/recovery baseline | `git diff --binary` patch + untracked tar into `.autonomy/backups/` (not stash); patch `git apply --check --reverse` against the tree | 2.1 MB patch reverse-applies cleanly; 14 MB untracked archive (244 files) — `git-before.txt` |
| P0 | Supervisor | `scripts/autonomy-supervisor.py`, driven through every branch with a fake agent: STOP, crash → RECOVERY MODE, 3-failure ceiling, wall-clock kill, stale result.json, refused candidate_complete, role isolation, review streak, Product-Owner lock | 9 supervisor tests green — `harness-tests.txt` |
| P0 | Permissions + deterministic guard | `.claude/hooks/autonomy_guard.py` wired as PreToolUse in `.claude/settings.json`; 22 planted forbidden commands denied, 11 ordinary ones allowed; STOP freezes mutating tools | green — `harness-tests.txt`. **Observed live**: the guard denied a Bash command of this very session whose text contained the literal git-stash pattern (hook error "Hard safety policy (git stash …) blocked a command") — the hook is active in real sessions, not only in tests |
| P0 | Guard/gate falsification | each of three mechanisms broken in turn → exactly its own test red → restored byte-identical → suite green | `harness-falsification.txt` |
| P0 | Browser + Studio | owner's signed-in Chrome drove production; Studio Place1.rbxl paired to project 81b7c2f8… with edits allowed; two real Agent runs executed | see docs/autonomy/EXPERIMENTS.md E-1, E-2 |
| P0 | Cloudflare | MCP read `workers_get_worker apple` | `apple  efccd9391e8d40318b5c476ca6717ce5` (read-only; no write test needed) |
| P0 | Supabase | `node infra/supabase/tests/rls-isolation.mjs` (real postgres:16, 13 migrations, self-falsifying); live `pg_class.relrowsecurity` for every public table | 43/43 ok, falsification step saw the leak — `rls-isolation.txt`; RLS on for all 15 live tables |
| P1 | Wrangler | repository scripts `infra/deploy-worker.mjs` / `infra/deploy-static.mjs` remain the only deploy path | used for every deploy from here on |
| P1 | Sentry | `search_issues is:unresolved lastSeen:-7d` on org moshe-s6 (apple-web, apple-worker) | 9 unresolved; triaged in CUSTOMER_FINDINGS.md F-016 and the handoff |
| P1 | Ralph | `ralph-loop@claude-plugins-official` installed at **project** scope (`.claude/settings.json` enabledPlugins); its installed Stop hook driven directly through 6 cases | 6/6 — `ralph-hook-verify.txt`. Silent when no loop is active (no per-turn notice) |
| P2 | AI Elements provenance | in progress in the running implementation track | — |

## A human-only blocker found during setup (affects ONE branch)

The standalone CLI at `~/.local/bin/claude` is **not logged in** — `claude auth status` reports
`loggedIn: false`, and a real `claude -p` child failed with "Failed to authenticate: OAuth session
expired and could not be refreshed" (`.autonomy/sessions/ralph-verify-*.json`). Therefore the
unattended supervisor cannot start children until the owner runs, in a real terminal:

```bash
claude auth login
```

This does not block the current run, which is driven from the interactive desktop session
(DECISIONS.md D-AUT-1). Logging in is authentication, which an agent must not do for the owner.
