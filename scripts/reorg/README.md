# scripts/reorg/

The repository reorganisation as data. `scripts/reorg-repo.mjs` is the engine; this folder is its input.

| File | What |
|---|---|
| `plan.json` | every delete, move, edit and the phases (P1 deletions, P2 docs, P3 platforms, P4 scripts subfolders) |
| `evidence-delete.txt` | the frozen list of `docs/evidence` entries that no live text named on 2026-10-02 (the engine re-checks each one when it runs) |

```sh
node scripts/reorg-repo.mjs --list                      # the plan as a table
node scripts/reorg-repo.mjs                             # dry run of P1-P3: prints every delete, move and rewrite, writes nothing
node scripts/reorg-repo.mjs --phase P4                  # dry run of the optional scripts/ phase
node scripts/reorg-repo.mjs --apply --touched /tmp/t.txt   # do it (refuses the main checkout; run it in a worktree)
node scripts/reorg-repo.mjs --check                     # afterwards: no stale references, relative paths resolve, CI paths exist
```

What it does, in order: `git rm` the deletes, `git mv` the moves, rewrite every reference in tracked live text
(literal paths, quoted path segments such as `join(ROOT, 'infra', 'x.mjs')`, relative imports and
`new URL(..., import.meta.url)`, relative markdown links, and a moved script's own `..` roots), apply the planned edits
(each with an expected match count: a mismatch stops the run before anything is written), add the moved fixtures'
declarations to `known-fixtures.json`, then write the touched-path list. It never commits.

Properties, each covered by `tests/reorg-repo.test.mjs`: dry run by default; refuses the main checkout; a move whose destination
exists is a conflict, never an overwrite; a second run changes nothing; `--check` fails on a stale reference.
Frozen history (`docs/evidence`, `docs/PASS-LOG.md`, `CHANGELOG.md`, `docs/releases`, `pnpm-lock.yaml`) is read but never rewritten.
Only `git ls-files` is in scope: untracked and ignored files are never touched.

Not in the plan (owner-gated, see `docs/operations/REPO-CLEANUP-PENDING.md`): the "FINISH THE PRODUCT" cluster (P5), the training
prune (P6), untracked files, and everything on GitHub or in Cloudflare, Supabase and Sentry.
