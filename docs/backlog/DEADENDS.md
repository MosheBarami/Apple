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

## apps/worker/src/collab-routes.ts — DELETE

**Found:** imported by nothing in the tree. `registerSharedRoutes` has no call site anywhere;
the only reference in the repository was `collab-routes.test.mjs` doing `readFileSync` on it as
TEXT, and that test now reads `index.ts`.

**It is a duplicate of routes that ship inline in `index.ts`, and it made a test lie.** The
verification pass broke FIVE security mechanisms inside it — `headers.set('X-Golem-Role')` changed
to `append`, the `GRANTABLE_ROLES` invite allowlist deleted, the link-revoke `project_id` check
deleted, `versions/restore` downgraded from its own action to `build`, and the exported entry point
renamed away — and all 117 tests stayed green every time, because none of that code runs.

Worse, the property its test asserted was FALSE of the file that actually ships: `index.ts`
registered ten of the seventeen shared paths from a `for` loop with a template-literal path, so
seven shared routes were invisible to every source-scanning guard in the repository, including the
A3 ownership sweep in `packages/evals/src/security.test.mjs`. That is repaired — `index.ts` now
registers all twenty collab-side routes literally — and the test measures the shipping file.

**Deleting rather than wiring, and the reason is the 333 lines rather than in spite of them.** A
dead module with a 117-test suite reads as more thoroughly covered than most live code here. Wiring
it would mean choosing between two implementations of the same routes on the strength of which one
had tests, when the one with tests is the one nothing has ever executed.

**Owner statement, 2026-09-15.** Removed by the session holding the integrator lane, under the
owner's standing authority for this pass. Not removed to make a checker green — the disposition
gate is satisfied by the disposition, and this entry would pass with the file still present. It is
removed because a second, unexecuted implementation of the shared routes is a trap: the next person
to change collaboration authorisation has two files to choose from, one of which has tests and no
callers, and the tests will agree with whatever they write. Recoverable from git history; the
commit that removes it names this entry.

## apps/worker/src/meshgen.ts — WIRE

**Found:** imported by nothing in the tree. 2,138 lines, 75 exports, 51 passing tests.

**Unfinished, not abandoned.** It is the productised 3D pipeline — a part spec goes in, geometry,
glTF/OBJ export and a credit bill come out — and it is the far half of the 3D creation screen in the
design prototype. What is missing is the tool that calls it: nothing in `tools.ts` reaches
`assemble()` or `exportGlb()`, so a user cannot ask for a model and get one.

Its tests are real: the sRGB→linear conversion is pinned at both branches of the piecewise function
after a falsification found that `return c` and `Math.sqrt(c)` both passed, which would have made
every exported colour wrong in any renderer.

**The wire is a tool entry plus the credit accounting per mesh.** Whoever takes it should start from
`meshgen.test.mjs`, which already describes the contract.

## apps/worker/src/user-export.ts — WIRE

**Found:** imported by nothing in the tree. 141 lines, 5 exports, no test file.

**Unfinished.** It answers CHECKLIST-V2 §48 "User data export": what the product holds about one
person and what it will not hand back. The module exists and the schema it reads was separately
audited against a real Postgres — that audit found thirteen discrepancies in a spec written by
reading the migrations carefully, which is why the audit exists.

What is missing is the route, the identity verification §48 also requires, and the expiry on the
download. It is the only one of these four with no tests, and it should not be wired without them:
an export route is the single place where "everything about you" and "nothing about anybody else"
pull hardest against each other.

## apps/worker/src/voice-commands.ts — WIRE

**Found:** imported by nothing in the tree. 325 lines, 8 exports, with its own passing tests.

**Unfinished.** It turns a transcript into one of four actions, or declines honestly — which is the
narrow, correct shape for a voice channel, and the declining is the part worth keeping. Nothing
calls it because the voice ingress route was not built.

**Not DELETE**, because the hard part is done and tested: the refusal path. A later implementation
that skipped it would accept any string as a command, which is the failure this module was written
to prevent.

---

## apps/worker/src/collab-routes.ts — WIRE, pass 12

**Found:** imported by nothing in the tree. 333 lines.

**Its own header describes the wiring that does not exist.** It says the routes live in their own
module so that "index.ts holds a single call" — and index.ts holds none. The file makes the case
for its own separation and then never gets the one line that separation was for.

The header also names the stake: "a security surface that vanishes quietly is worse than one that
was never written." That is exactly what happened to it.

**Outstanding:** a single call in index.ts mounting the route table, and a probe that a
collaborator can reach one of these routes against the deployed origin.

---

## apps/worker/src/meshgen.ts — WIRE, pass 12

**Found:** imported by nothing in the tree. 2,138 lines — the largest unreached module here.

**What it is:** the 3D pipeline, "a part spec goes in, geometry and a bill come out" — the
productised version of the design prototype's hard-coded parts table, with the exporters meant as
real output rather than decoration.

**Why this matters more than its size suggests:** `generate_model` and the Text-to-3D rows in
FEATURES.json describe a capability whose implementation is this file. Until something reaches it,
those rows describe a module rather than a product, which is the precise distinction this ledger
exists to keep.

**Outstanding:** a caller on the tool path, and a probe that a part spec produces geometry a user
receives.

---

## apps/worker/src/user-export.ts — WIRE, pass 12

**Found:** imported by nothing in the tree, AND it has no test — the only one of these four with
neither. 141 lines.

**What it is:** f-624a203a, the data-export spec — "EVERYTHING about you, and NOTHING about anybody
else", audited against the real schema.

**This one carries a legal edge the others do not.** An export route is a privacy commitment, and
a commitment implemented in an unreachable module is not a commitment. It should not be cited as
satisfying any privacy row while nothing calls it.

**Outstanding:** a route, a test, and a probe that a real account can download its own data.

---

## apps/worker/src/voice-commands.ts — WIRE, pass 12

**Found:** imported by nothing in the tree. 325 lines.

**What it is:** a classifier with three outcomes — stop, resume, checkpoint, restore, or "the user
wants to SAY this" — deliberately not a command interpreter. Its header is explicit that the
narrowness is the design.

**Outstanding:** a caller on whatever surface produces a transcript. Until one exists the
classifier is well-tested and unreachable, which is the critic.ts shape this file was opened for.

---

**A note on all four, written by the session that found them rather than the ones that wrote
them.** WIRE is a statement of fact plus the intent each module's own header states: nothing
reaches it, and each describes a product capability rather than an experiment. None is
dispositioned DELETE, and none should be on this evidence — §6.6 requires a dated owner statement
for that, and deleting source to make a checker green is a violation rather than a fix. If an
author intended something other than WIRE for one of these, the entry is wrong and should be
corrected by them.

---

# Pass 13 — six modules, written by other sessions, dispositioned by the one that found them

The same convention as the pass-12 note below the four before them: WIRE here is a statement of
fact plus the intent each module's own header states. Nothing reaches it, and each describes a
product capability rather than an experiment. None is dispositioned DELETE and none should be on
this evidence — §6.6 requires a dated owner statement, and deleting source to make a checker green
is a violation rather than a fix. If an author meant something other than WIRE for one of these,
the entry is wrong and they should correct it.

**Two of the six are reached only by their own tests, and that is a different shape from the other
four.** A module with a passing test suite and no product caller is the most expensive kind of
dead code, because the green suite reads as coverage of a shipped feature. It is not. It is
coverage of a function nobody can reach.

## apps/web/src/components/ws/context-model.ts — WIRE, pass 13

**Found:** imported by nothing in the tree. 76 lines.

**What it is:** the strings that tell a user how much of the context budget a run used and what the
trim discarded. Its header names the symptom it exists to prevent: the agent silently drops the
oldest turns, the user asks about something still on their screen, and the answer reads as a bad
model rather than a dropped record.

**Outstanding:** a caller in the run view, and `context` on the wire from the worker. Unreached,
the product still has that symptom and nothing on screen distinguishes it from a poor answer.

## apps/web/src/components/ws/files-panel.tsx — WIRE, pass 13

**Found:** imported by nothing in the tree. 361 lines.

**What it is:** the drawer that opens the project's workspace files. Apple writes notes, plans and
generated data there, and without this panel the only way to read one is to ask Apple to read it
back.

**Outstanding:** a route or a drawer trigger in the workspace shell. Its own `files-model.ts` is
reached, so the decisions are tested; the markup is not mounted anywhere.

## apps/web/src/components/ws/members-panel.tsx — WIRE, pass 13

**Found:** imported by nothing in the tree. 422 lines.

**What it is:** the project roster with invite, role change, suspend, reactivate and revoke. Its
header states the sharper fact: every one of those routes already exists on the server, gated and
audited, and nothing in the web app calls any of them — so adding a collaborator is a curl.

**Outstanding:** a mount point. This is the entry on this list with the largest gap between what
the backend can do and what a person can reach.

## apps/web/src/lib/selection-reference.ts — WIRE, pass 13

**Found:** imported only by `apps/web/tests/studio-selection.test.mjs`. 93 lines.

**What it is:** lets the person typing say "this one" about whatever is selected in Studio. The
selection already travels end to end — plugin captures it, worker re-derives every field, the
model can pull it with `get_selection` — and this is the missing half that lets a human point at
it instead of typing a path.

**Outstanding:** a caller in the composer. Reached only by its own test, so its suite is green and
the capability is unavailable.

## apps/worker/src/automation-store.ts — WIRE, pass 13

**Found:** imported by nothing in the tree. 506 lines.

**What it is:** storage for automations and their execution history, with the policy deliberately
left in `automations.ts`. The header argues D1 over a Durable Object on two grounds, the second of
which is load-bearing: a run history that vanished when somebody cleared a transcript would be a
record of spending that the spender can erase.

**Outstanding:** a dispatcher and a cron. Until then the product has automation policy, automation
storage, and no automations.

## apps/worker/src/run-access.ts — WIRE, pass 13

**Found:** imported only by `apps/worker/tests/run-access.test.mjs`. 198 lines.

**What it is:** re-asks who may drive a run after the request that started it is gone. Its header
states the live bug precisely: revoke a member's grant mid-build and every remaining alarm-driven
step still runs, spending the owner's Credits and mutating the owner's place on behalf of somebody
removed an hour ago.

**Outstanding:** the push from the route that ends a membership, and a check in the alarm path.
This is the one of the six whose absence is a security hole rather than a missing feature, and its
passing test suite is exactly the reason it could sit here unnoticed.
