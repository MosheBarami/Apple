# What is red in CI, measured 2026-09-21, and which of it is real

Written by the infra lane. The point of this file is that **three different things look like a
failing check** and only one of them is one:

1. a check that found a real defect,
2. a check that could not run and said so,
3. a check that is stricter on a developer's machine than on the runner, so it is red here and
   green there.

Every row below says which it is.

## Green after this pass

| job | state | what changed |
|---|---|---|
| Secrets and dependencies | **success**, verified on the runner in run 35546303030 | `scripts/known-fixtures.json`; see GO-LIVE §5 |
| Static checks | success | plus two new steps: the scanner's own tests, and `check-ci-references` |
| Build Studio plugin | success | untouched |

## Still red, and real

### `Build site and web` — three regressions, none of them infra's

See `WEB-BUNDLE-BUDGET-OPEN.md` in this directory. Entry bundle 180939 B gzip against a 70000 B
budget; landing payload 28208 B gzip against 12000 B; `check-asset-wall` exits 2 because the
redesigned landing has no `<section id="library">`. No budget was raised and no guard deleted.

### `Typecheck and tests` — one defect, fixed; the rest is measurement noise

- **`pnpm -r typecheck`**: was 37 errors in two files, both fixed this pass —
  `apps/site/src/components/FlowField.astro` (26, narrowing lost inside hoisted function
  declarations) and `apps/site/src/data/consent-proof.ts` (11, `from` typed as a label where every
  call site passes a path). `pnpm -r typecheck` now exits 0 across the monorepo.
- **`node --test tests/*.test.mjs`**: one real failure, `no current source file contains a raw
  control byte`, on a literal NUL in `packages/training/src/acquire-github-luau.mjs:271`. Fixed by
  writing the two-character escape; runtime-identical, verified.

## Red on my machine and NOT red on the runner — do not "fix" these

**`check-deadends --gate`** reported two undispositioned modules:

```
UNDISPOSITIONED  packages/training/src/build-ui-asset-library.mjs
UNDISPOSITIONED  packages/training/src/check-luau-syntax.mjs
```

Both are **untracked**. `check-deadends` walks `git ls-files --cached --others --exclude-standard`,
deliberately — `tests/check-escape-hatches.test.mjs` has a test called *"an untracked file in a
published directory is caught before it ships"* — so it is stricter than the runner by design. The
runner checks out a commit and never sees either file. Writing dispositions for them from here would
be inventing a judgement about another lane's unfinished work, which is the thing
`check-dispositions.mjs` exists to refuse. When that lane commits them, both carry
`node packages/training/src/… [--flags]` usage in their own headers, so the disposition is a
package.json script or a WIRE line, and it is theirs to write.

**`check-escape-hatches`** failed once locally on:

```
Error: the checker did not finish: spawnSync node ETIMEDOUT after 300000 ms. That is a timeout,
not a verdict — nothing was measured here, so do not read it as the checker having missed the
planted defect.
```

The test says the right thing about its own failure. Three lanes were driving this machine; 41 of
its 42 tests passed and the 42nd ran out of wall clock. **Nothing was measured.** It is recorded
here as unmeasured, not as passing and not as failing.

Likewise `a scratch clone of the tracked tree is clean` failed in one combined run of all 36 test
files and passed when `tests/check-escape-hatches.test.mjs` was run alone. Under contention, in a
tree three lanes are writing to, a clone-and-compare is not a stable instrument.

## The rule this file is an instance of

A red check is a question, not an answer. Before acting on one: did it run, did it run against the
thing you think it did, and is the tree it measured the tree the runner will see.
