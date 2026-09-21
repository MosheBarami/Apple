# All 44 gates re-run, 2026-09-21 — 41 met, 3 unmet, and one of the three is a broken instrument

The ledger row `gates-evidence-is-stale` reads *"35 STALE gates; re-run the CHECK line for each
against the current tree and refresh their EVIDENCE lines, or demote the ones that no longer pass."*
Stale means the stored `git-sha=e2f019f` is six days and several hundred commits old — it does not
mean unmet. So the first thing worth having is the current answer.

```
$ node scripts/gate-check.mjs
GATES RED — 44 run, 41 met, 3 unmet
note: measured against a dirty working tree
```

About forty minutes, every CHECK actually executed. `gate-check` prints that last line itself; three
other lanes hold uncommitted files in this checkout and the run cannot see past them, so this is a
measurement of the working tree and not of HEAD. It is still the first full re-run since 09-15.

**GATES.md was not written to.** Plain verify writes nothing; `--approve` is what refreshes EVIDENCE
lines and was deliberately not used, for the reason in the last section.

## The three that are unmet

### G7 — the CHECK names a file that was deleted, so this one is not a product failure

```
CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 7 --label G7 \
       -- node --test tests/asset-library-gating.test.mjs

  Could not find 'tests/asset-library-gating.test.mjs'
  G7 FAIL — no pass/fail totals in the output; the runner did not report a summary
```

`apps/worker/tests/asset-library-gating.test.mjs` was deleted in `ac82f9c`, *"the asset library is
gone, on the owner's decision"*. The gate is measuring nothing, and it says so rather than passing —
`assert-tests` refuses an absent summary, which is the one thing that keeps this from being a gate
that reports green over a file nobody has.

**The property did not go away with the library.** The deleted test's own first line was *"Do not
OFFER a tool that cannot work in this deployment"*, and the library was one instance of it. Two
files in the tree today defend exactly that, from the two directions it can fail:

| file | what it holds | tests |
|---|---|---|
| `apps/worker/tests/discord-capability-live.test.mjs` | the DEPLOYMENT cannot run it — an unconfigured deployment says so in the response the Connections panel reads, and refuses to mint a code rather than handing out a dead one | 5 |
| `apps/worker/tests/plugin-capability-session.test.mjs` | the connected PLUGIN cannot run it — SessionDO never executes a `run_luau` the plugin withheld, a capability-blocked `generate_model` stays a failed attempt, auto-inspection stays off when `render_view` is unsupported | 5 |

The re-aimed CHECK, run and measured rather than proposed:

```
$ cd apps/worker && node ../../scripts/assert-tests.mjs --floor 10 --label G7 \
    -- node --test tests/discord-capability-live.test.mjs tests/plugin-capability-session.test.mjs
G7 OK 10 passed
```

Ten instead of seven, and it covers a case the old one did not.

### G90 — The full suite passes

```
SUITE RED — check-proof-figures
  PROOF FIGURES UNACCOUNTED — the landing page prints numbers that are typed rather than derived:
    · 10
```

One typed `10`. Already diagnosed in `dfc00bc`, whose subject says the two reasons previously given
for this gate being unticked both stopped being true and that the real one is a typed "/10" in a
demo. Site content; not infra's to change.

### G92 — The landing and site E2E pass in every viewport

Four failures, all `[mobile]`, in `tests/e2e/landing.spec.ts`: keyboard reachability and a visible
focus ring (:433), text enlargement scrolling rather than clipping (:452), WCAG AA against what is
actually behind the text (:465), and no link pointing at a section that no longer exists (:718).
18 passed. Site and design; not infra's.

## Why G7 was left for somebody else to apply, which is the uncomfortable part

Re-aiming the CHECK is one line. Making the gate honest afterwards is not.

`§5.1` requires the block to read CHECK, EXPECT, **FALSIFIED**, EVIDENCE — the red before the green,
"because a gate nobody has watched fail is a gate that may be incapable of failing". G7's FALSIFIED
line records `break-sha=62536fc` against the *asset-library* command. It is a record of a different
experiment. Changing the CHECK without re-making it would leave a gate whose proof-of-failure
describes a command that no longer exists — which is the same defect as the CHECK naming a deleted
file, moved one line down.

`gate-check --falsify` runs the gate in the tree it is standing in and **requires it to be RED**, so
a new record needs the capability code deliberately broken and committed. This repository's way of
doing that is a dedicated checkout under `.claude/worktrees/` — every existing FALSIFIED line on
this page has such a path in its `cwd=`. That needs `pnpm install` inside an in-repo worktree, which
this session is under an explicit instruction never to do, and the alternative of committing a
deliberate break to a `main` that three other lanes are committing to is worse.

So: the analysis is done, the replacement CHECK is measured, and applying it needs one thing this
session was not allowed to do. Whoever has a worktree they may install into:

1. `gate-check --falsify --gate G7 --break-sha <sha>` in a checkout where the capability gating is
   broken, to replace the stale FALSIFIED line.
2. Swap the CHECK to the ten-test command above and add
   `CHECK-CHANGE: old=asset-library-gating new=capability-gating reason=the-asset-library-was-deleted-in-ac82f9c`,
   matching the shape G4 already uses.
3. `gate-check --gate G7 --approve`.

## What is worth knowing about the other 41

They are **met**, today, on this tree — not "met in September and unverified since". Their stored
EVIDENCE lines still carry `git-sha=e2f019f`, so `--status` will keep calling them stale until
somebody runs `--approve`, and that is a bookkeeping gap rather than an unmeasured claim. The
measurement in this file is the answer to "are they actually still true", and the answer is yes for
41 of 44.
