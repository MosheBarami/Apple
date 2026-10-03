---
name: what-changed-recently
description: Summarise recent changes from git - latest commits, per-path history, a specific commit, branches and parallel worktrees.
---
# What changed recently

Use for "what changed", "what landed this week", "who touched X", "what is on branch Y".

1. `git_branches` for the current branch and the freshest branches (note: other agents work in parallel worktrees; `git_worktrees` lists them).
2. `git_log` with n=20-30 on HEAD; add `path` to follow one file or directory, or `rev` for another branch. Group commits by theme (docs, worker, plugin, evals, design), keep dates (YYYY-MM-DD) and hashes.
3. For the most important commits, `git_show` (optionally with a `path`) and read the message and stat; do not dump diffs, summarise them.
4. Cross-check with the docs: `search_knowledge` "latest state" and read the top of `docs/autonomy/CURRENT_STATE.md` / `HANDOFF.md` for what the owner has been told; flag when the docs lag the commits.
5. Note that the working tree may have uncommitted changes you cannot see (no `git status` tool); say so if the question depends on them.
6. Answer as a short dated list with hashes, then one paragraph of "what this adds up to". Cite hashes and `path:line` where you read files.
