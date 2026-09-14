# DEAD ENDS

Code that compiles, is tested, and has no caller. A capability exists only if a reachable product
path executes it, so a module nothing reaches is not a feature — however good it is, and however
green its tests.

This repository has shipped one: `apps/worker/src/critic.ts` was nine hundred lines of measured
rules with a full suite, and zero bytes of it reached the deployed bundle. Every unit test passed
the whole time. The audit that noticed was prose nobody could run, and it sat there for weeks. It
is wired now, and this file exists so the next one is found by a command rather than by an
adversary.

`scripts/check-deadends.mjs` REPORTS the list; it never fails the suite on its own. Failing on the
list would train people to widen the exception list until it was empty. What fails is the
disposition gate: every entry below needs **WIRE**, **DELETE** or **STRUCTURALLY-BLOCKED**.

**Deleting source to make the checker green is a violation, not a fix.** A module that should not
exist is DELETE with a dated owner statement, per §6.6.

---

## apps/web/src/components/plans.tsx — WIRE, pass 6

**Found:** imported by nothing in the tree.

**Correct, and it is this session's own.** It renders the plan ladder from `PLAN_COPY` and
`PLAN_LIMITS`, and it was written mid-flight for worklist row w12 — "plans and credits surfaced in
the product" — and never given an importer. It is the exact shape of the defect this checker exists
to find, produced by the agent that wrote the checker, which is the most useful possible
demonstration that the checker works.

**Caller being added:** the `/usage` route, when w12 lands. Until then it is a dead end and is
recorded as one rather than as work in progress, because the two are indistinguishable from
outside and only one of them is honest.

**Blocked behind:** OH-1 and OH-2. Publishing a plans surface while the offer itself is incoherent
would ship the exact numbers the owner has not settled (§12.5).

---

## packages/design/src/index.mjs — WIRE, pass 6

**Found:** imported by nothing in the tree.

**Verified:** nothing anywhere imports `@golem/design`. The package is a retrievable UI grammar —
validated rules for composing a generated interface instead of inventing one from a blank
ScreenGui — and the product never asks it anything.

**Caller being added:** the tool that generates UI. Recorded here rather than fixed in the same
breath, because wiring it is a product decision about what a generated interface should be composed
from, and that is a larger question than this checker's finding.

---

## packages/corpus/src/discover.mjs — STRUCTURALLY-BLOCKED

**Found:** imported only by `packages/corpus/src/intake/discover-cli.test.mjs`.

**The constraint is outside this repository.** `discover.mjs` enumerates candidate corpus
repositories from the GitHub API. It is a one-shot ingestion step run by a human with a token, and
its output is the vendored `packages/corpus/raw/` tree that IS in the repository. There is no
product path that should call it: a running worker discovering and cloning repositories at request
time is not a design anyone wants.

It is not in `DECLARED_ENTRIES` only because the package's manifest does not name it as a script,
which is a gap in the manifest rather than in the code.

---

## What the checker does NOT look for, and why

**Exports with zero references outside their own package.** §6.6 asks for it; this checker does not
yet do it. An export used only inside its own module is a private function that forgot to be
private — a real finding, and a different one from an unreachable module. Recorded as missing
rather than quietly omitted.

**Routes with no caller.** Also asked for, also not yet implemented. The worker's route table is
`app.get/post(...)` in `index.ts`, and matching those against the client's `fetch` calls is the
same graph problem one layer up.

**Duplicated implementations.** Two copies of one function, both with callers, are invisible to a
dead-end checker by construction — both look alive. `geometryMask` and `figureGroundContrast` exist
in both `apps/worker/src/composition.ts` and `packages/evals/src/props.mjs`, one deciding what the
offline grader believes and the other what the product would. That is `OH-6`, and it needs a
different checker.
