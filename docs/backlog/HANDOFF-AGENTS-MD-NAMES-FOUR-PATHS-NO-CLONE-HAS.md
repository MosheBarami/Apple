# PARTLY CLOSED — the test is fixed; one stale sentence in `AGENTS.md` is not, and that file is held

**First written 2026-09-21 from CI run 35554147167. Rewritten the same night after the test was
re-aimed in `9ffba9f`. Read the last section first if you hold `AGENTS.md`.**

## What it was

`tests/playbook-claims.test.mjs` resolved every backticked repository path the guidance names with
`existsSync`, and four of them are on a machine that has worked here and in no fresh checkout:

```
not ok 347 - every repository path the guidance names exists
    AGENTS.md -> .claude/worktrees/
    AGENTS.md -> apps/worker/.dev.vars
    AGENTS.md -> packages/corpus/data/chunks.jsonl
    AGENTS.md -> packages/corpus/data/library/
```

Re-measured on 2026-09-21 by cloning `f6b1944` into a scratch directory rather than by reading the
runner's log: **five**, not four. `docs/playbook/GUARDS.md -> apps/site/dist` fails too; CI never
saw it because the job builds the site two steps earlier.

## What was done: the test asks git now

The question `existsSync` answers is "is this on the machine I am running on", and that was never
the question. Two tiers, in `9ffba9f`:

- **in HEAD's tree** — assert it is in HEAD's tree. This is strictly stronger than what was there:
  a path that LEFT git and is still lying on somebody's disk used to read as present.
- **not in HEAD's tree** — `.gitignore` must declare it. No clone can observe whether such a path
  exists, and a secret file and a build directory are still worth naming in the guidance.

A typo is in neither tier and fails. Watched red on both cases and restored byte-identical; the
second mutation is the one that matters, because `HEAD`'s version of the test passes it.

There is a trap inside the fix worth knowing about. `git check-ignore` decides whether a rule
written `dist/` applies by asking the filesystem whether the path is a **directory** — so the first
version reproduced the exact defect it was fixing, and `apps/site/dist` read as declared here and
undeclared in a clone. Every candidate is now offered with a trailing slash, which is how you tell
git a path is a directory when no directory is there.

## The previous version of this file said not to do that, and it was half right

It said: *"'is it gitignored' does **not** work: `.gitignore` covers `packages/corpus/data/*`, so
`data/library/` is ignored too, and that rule would have excused the one genuine drift."*

That is true, and it is why the row below is still open. What the argument missed is that the old
test had **no discriminating power over ignored paths either** — on the runner it failed for all
four, of which three were the guidance doing its job. A check that returns the same answer for a
correct claim and a wrong one has not detected anything; it has failed to observe, in the shape
where the failure renders as red rather than as green. The new rule at least distinguishes the
cases it CAN see, and the limit is written into the test file in as many words rather than left to
be rediscovered here.

## Still open, and it is one sentence

| path | state |
|---|---|
| `packages/corpus/data/chunks.jsonl` | **closed.** Declared by `.gitignore:19`. A 10 MB build artefact; documenting it is the point. |
| `apps/worker/.dev.vars` | **closed.** Declared by `.gitignore:13`. The line says so itself. |
| `.claude/worktrees/` | **closed.** Declared by `.gitignore:148`. A row in a disk-usage table, annotated "Not project data." |
| `apps/site/dist` | **closed.** Declared by `.gitignore:2`. |
| `packages/corpus/data/library/` | **OPEN. Not a path problem — a false sentence.** |

`AGENTS.md` §5 at HEAD describes the asset catalogue as present: 510,014 items, an `index.json`
manifest, D1 row counts. The owner deleted it on 2026-09-20. `.gitignore` in the same tree already
records the deletion in a paragraph of its own. Nothing mechanical will catch this now, by
construction: the directory is invisible to every clone whether it is there or not.

**Why it was not fixed here.** `git status --porcelain AGENTS.md` is dirty, and the other lane's
uncommitted diff is a rewrite of exactly section 5 — it replaces the `data/library/` block with a
record of the deletion. Committing somebody else's uncommitted work is worse than leaving a stale
paragraph for an hour.

**If you hold `AGENTS.md`: commit that rewrite.** It is the whole of what is left here. If you are
starting from a clean copy instead, the sentence to delete begins
``**`packages/corpus/data/library/` (429 M)** — the asset library.`` and runs to the end of that
fenced block.

## How to re-check, and how not to

```
node --test tests/playbook-claims.test.mjs     # green here, and green in a clone: that is the fix
node scripts/ci-parity.mjs                     # clones HEAD and runs the suite where it matters
```

`node scripts/ci-parity.mjs` is the one to trust. It measures HEAD, so it cannot be fooled by an
uncommitted fix — which is the other thing that cost this repository a night.
