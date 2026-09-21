# OPEN — `tests/playbook-claims.test.mjs` fails on the runner, and the file it is about is held by another lane

**Measured 2026-09-21 from CI run 35554147167, job "Typecheck and tests", step "Root tests".
Not fixed. `AGENTS.md` is dirty in the shared checkout and is being rewritten right now.**

## What fails

```
not ok 347 - every repository path the guidance names exists
  the guidance points at files that are not there:
    AGENTS.md -> .claude/worktrees/
    AGENTS.md -> apps/worker/.dev.vars
    AGENTS.md -> packages/corpus/data/chunks.jsonl
    AGENTS.md -> packages/corpus/data/library/
```

It passes on this machine — all four exist here except the last, and the working copy of `AGENTS.md`
no longer names that one. It fails in a clone, which is the only place it matters.

## The four are not one problem

| path | AGENTS.md line | what it is |
|---|---|---|
| `packages/corpus/data/library/` | 114 | **STALE.** The asset catalogue was deleted by the owner on 2026-09-20. The guidance still describes 510,014 rows and an `index.json` manifest that are gone. |
| `packages/corpus/data/chunks.jsonl` | 132 | **Correct and deliberately absent.** A 10 MB gitignored build artefact; `packages/corpus/src/chunk.mjs` still produces it. Documenting it is the point. |
| `apps/worker/.dev.vars` | 178 | **Correct and deliberately absent.** The line says so itself: "`.env` and `apps/worker/.dev.vars` are untracked and stay that way." |
| `.claude/worktrees/` | 39 | **Correct and deliberately absent.** It is a row in a disk-usage table about the author's machine, annotated "Not project data." |

So one of the four is a real drift and three are the guidance doing its job.

## Why it is not fixed here

`git status --porcelain AGENTS.md` is dirty. The other lane's uncommitted diff is a rewrite of
exactly section 5 — it replaces the `data/library/` block with a record of the deletion, which
fixes row one. Editing that file from here would collide with a rewrite already in flight.

**Committing their edit is worse than not deploying.** So this is a handoff.

## What still fails after they commit, and the decision it needs

Rows two to four. The test asserts "every repository path the guidance names exists", and three
paths the guidance *should* name do not exist in a clone. Two honest endings, and the third is the
one this file exists to make harder:

1. **A convention in the guidance.** `AGENTS.md` marks a path that is absent from a clone by
   design, and the test requires the mark. This keeps full strength: an unmarked missing path is
   still a defect, and `data/library/` would have failed under it. It costs an edit to `AGENTS.md`,
   which is why it is not done here.
2. **The test learns the distinction some other way.** Note that "is it gitignored" does **not**
   work: `.gitignore` covers `packages/corpus/data/*`, so `data/library/` is ignored too, and that
   rule would have excused the one genuine drift. Any rule proposed here must be checked against
   `data/library/` first.
3. **Excusing the four by name, or deleting the assertion.** No. The assertion caught a real stale
   reference on its first honest run in CI; that is what it is for.

## How to re-check

```
node --test tests/playbook-claims.test.mjs        # passes here, which is the misleading part
git clone <repo> /tmp/x && cd /tmp/x && node --test tests/playbook-claims.test.mjs
```

The second is the one that tells the truth.
