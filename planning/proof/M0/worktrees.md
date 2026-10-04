# M0 task 0.7: worktrees (measured 2026-10-04)

Rule applied: delete a worktree only when its tip is an ancestor of `origin/main` (6fd0f019 or later)
and it holds no uncommitted work. The only untracked entries in the nine removed ones were
`node_modules` symlinks into the main checkout (unlinked first, never followed).

## The four fix worktrees of `~/Developer/RbxAI-rename` (removed)

| Worktree | Branch | Tip | Uncommitted | Tip in the deployed lineage | Ref kept in the main repo |
|---|---|---|---|---|---|
| RbxAI-fix-agent | fix-agent | eb7bbbdb | 0 | yes | `fix-agent` |
| RbxAI-fix-assets | fix-assets | ae6f7c36 | 0 | yes | `fix-assets` |
| RbxAI-fix-r2 | fix-r2 | 42697f17 | 0 | yes | `fix-r2` |
| RbxAI-fix-ui | fix-ui | b3b86133 | 0 | yes | `fix-ui` |

`git -C ~/Developer/RbxAI-rename worktree prune` also dropped two stale entries whose folders were gone
(`/private/tmp/.../deploy-wt`, `/private/tmp/.../scratchpad/wt`).

## The 13 `.claude/worktrees/wf_*` worktrees

| Worktree | Tip | Commits not in main | Uncommitted (besides node_modules links) | Action |
|---|---|---|---|---|
| wf_369225d7-1ee-4 | a0e9f80b | 0 | 0 | removed, branch deleted |
| wf_446213df-e2e-7 | 82503356 | 0 | 0 | removed, branch deleted |
| wf_604cc6a7-8d3-5 | 4c8b5fea | 0 | 0 | removed, branch deleted |
| wf_643f1768-06e-5 | f94443d1 | 0 | 0 | removed, branch deleted |
| wf_805b9897-0e2-2 | 738ef663 | 0 | 0 | removed, branch deleted |
| wf_90b4b7a1-0cd-2 | aa95deea | 0 | 0 | removed, branch deleted |
| wf_90b4b7a1-0cd-3 | 86ab909f | 0 | 0 | removed, branch deleted |
| wf_90b4b7a1-0cd-4 | 249a652a | 0 | 0 | removed, branch deleted |
| wf_952a3c4c-35e-6 | ee77445c | 0 | 0 | removed, branch deleted |
| wf_1cadd7fe-3c0-6 | 431779ce | 16 | 0 | **kept for the owner** (golem→apple rename phases A+B1 and the runbook) |
| wf_3d85181d-498-2 | 0c9bf7c9 | 2 | 0 | **kept for the owner** (owner bench review sheet) |
| wf_73a32ca7-af0-6 | d9354ed2 | 9 | 0 | **kept for the owner** (repo reorganisation, plugin build fix) |
| wf_90b4b7a1-0cd-1 | 5873496a | 4 | 0 | **kept for the owner** (asset-order decision D-MODELLIB-3) |

## `git worktree list` after the cleanup (main repo)

```
/Users/moshe/Developer/RbxAI                                     [main]
/Users/moshe/Developer/RbxAI-caps                                5174017b [integration/caps]
/Users/moshe/Developer/RbxAI-design2                             f0ab5be6 [design/round-2]
/Users/moshe/Developer/RbxAI-integration                         25955635 [integration/giant]
/Users/moshe/Developer/RbxAI/.claude/worktrees/wf_1cadd7fe-3c0-6 431779ce [worktree-wf_1cadd7fe-3c0-6]
/Users/moshe/Developer/RbxAI/.claude/worktrees/wf_3d85181d-498-2 0c9bf7c9 [worktree-wf_3d85181d-498-2]
/Users/moshe/Developer/RbxAI/.claude/worktrees/wf_73a32ca7-af0-6 d9354ed2 [worktree-wf_73a32ca7-af0-6]
/Users/moshe/Developer/RbxAI/.claude/worktrees/wf_90b4b7a1-0cd-1 5873496a [worktree-wf_90b4b7a1-0cd-1]
```

The three sibling worktrees (`RbxAI-caps`, `RbxAI-design2`, `RbxAI-integration`) are not in the task's
scope and were left alone; `RbxAI-design2` has 5 uncommitted files and `RbxAI-integration` has 1.
