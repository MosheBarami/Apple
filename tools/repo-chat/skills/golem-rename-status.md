---
name: golem-rename-status
description: Report how far the golem-to-Apple rename has got - which names are still golem, which are renamed, and what must stay for compatibility.
---
# Golem rename status

Use for "is golem gone", "what is still called golem", "what was renamed".

1. Background: `search_knowledge` "two names Apple golem rename" and read `AGENTS.md` section 1 ("Two names") and `docs/DECISIONS.md` ADR-001. The owner's standing consent to remove "golem" autonomously is in `search_knowledge` "standing consent golem".
2. Measure what remains: `search_code` query `golem` (case-insensitive by smart-case) with several globs - `*.ts`, `*.json`, `*.toml`, `*.md`, `*.luau`, `*.yml` - and note the match counts and the biggest areas (use `maxResults` 100 and refine by directory: `apps/worker`, `apps/web`, `apps/site`, `packages`). The count is "match lines shown (capped)"; say when output was truncated rather than claiming a total.
3. Identify what must stay: wire literals other clients depend on (`golem.v1`, `X-Golem-`, `golem_session`) and the deployed worker name - search for them and read the notes explaining why. Published Studio plugins in the wild constrain what can change.
4. Find rename work in git: `git_log` with `n=30` and look for subjects mentioning golem/rename; `git_branches` for a rename branch; `git_show` one representative commit.
5. Answer: what is renamed (with evidence), what remains and why, and a rough measure from step 2 labelled as a sample. Cite `path:line`.
