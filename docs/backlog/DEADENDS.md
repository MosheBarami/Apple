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

## Internal asset sourcing dispositions — DELETE, owner direction 2026-09-25

The owner removed the customer-facing UI catalogue and the Creator Store versus scratch choice.
Both routes are now absent from the shipped app, and the worker refuses the old catalogue URL.
These source files remain only for legacy tests and must be removed with those tests in a separate
cleanup; reconnecting either to the customer app would reverse the owner's direction.

- `apps/web/src/components/asset-source-dialog.tsx` — DELETE; the choice is internal to Apple.
- `apps/web/src/routes/library.tsx` — DELETE; the catalogue is backend-only.

---

## Thinking redesign dispositions — DELETE, owner direction 2026-09-24

The owner directed that thinking show one friendly changing step and offer no way to inspect
technical details. The new `ws/thinking.tsx` implements that surface. These formerly reachable
modules became dead ends when the old disclosure and accumulated step UI were removed:

- `apps/web/src/components/ai-elements/chain-of-thought.tsx` — DELETE; the expandable reasoning tree contradicts the new surface.
- `apps/web/src/components/ai-elements/reasoning.tsx` — DELETE; the reasoning disclosure is no longer rendered.
- `apps/web/src/components/ai-elements/stack-trace.tsx` — DELETE; the Studio history no longer opens raw failure traces for customers.
- `apps/web/src/components/ai-elements/terminal.tsx` — DELETE; the Studio history no longer offers its internal operation log.
- `apps/web/src/components/ai-elements/tool.tsx` — DELETE; its only importer is a test of the retired tool-step display.
- `apps/web/src/components/picks/chat/source-preview.tsx` — DELETE; the detailed source preview has no product caller.
- `apps/web/src/components/picks/chat/turn-checkpoint.tsx` — DELETE; the retired per-turn step UI has no caller.
- `apps/web/src/components/picks/thinking/lattice-glyph.tsx` — DELETE; the new single-line status uses its own visual treatment.
- `apps/web/src/components/picks/thinking/skeleton.tsx` — DELETE; the retired thinking placeholder has no caller.

Two other modules exposed by the same import-graph pass have different destinations:

- `apps/web/src/components/ws/playtest-card.tsx` — WIRE; the game review surface needs a friendly playtest result after a Studio run, outside the thinking line. It is not evidence that a playtest has run.
- `apps/web/src/lib/doc-sources.ts` — WIRE; citation labels belong with user-facing help answers, outside the thinking line. The current module has no product caller.

This is a dated disposition, not a deletion of the files. Their removal or wiring remains work;
the checker continues to report them as dead ends until that work lands.

---

## apps/web/src/components/ai-elements/task.tsx — WIRE, 2026-09-23

**Found:** imported by nothing after the BYOK/short-replies track (workflow wf_46d0bb34-725).

**Why it lost its caller:** `ws/thinking.tsx` rendered the plan checklist with it. The owner's
direction D-UX-2 (docs/autonomy/DECISIONS.md) removed plan checklists from the conversation; the
checklist became one "Next:" row, so the vendored AI Elements Task had nothing left to draw.

**Caller being added:** the step list inside the Thinking disclosure, in the component-library
rollout the owner asked for on 2026-09-23 ("use all of them … not a few"). It stays vendored,
hash-verified, for that; if the rollout chooses another component for the step list, this entry
becomes DELETE with that decision recorded.

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

## apps/web/src/components/ws/files-panel.tsx — WIRED, pass 13, closed 2026-09-15

**Found:** imported by nothing in the tree. 361 lines.

**What it is:** the drawer that opens the project's workspace files. Apple writes notes, plans and
generated data there, and without this panel the only way to read one is to ask Apple to read it
back.

**Wired:** `apps/web/src/routes/workspace.tsx` mounts it as the `files` drawer, with a topbar
opener, a `ws-files` command, and `'files'` added to `DRAWERS` so the drawer survives a reload.
`canEdit` comes from `/api/shared/:id` through `lib/capabilities`, not from a literal. Three
stylesheet classes the panel used — `.gx-files`, `.gx-files__table`, `.gx-files__text` — were
defined nowhere and are now in `styles/workspace.css`. Pinned by
`apps/web/tests/files-drawer-wiring.test.mjs`.

**Correcting this entry's own claim.** It previously read "its own `files-model.ts` is reached, so
the decisions are tested". Both halves were false. `files-model.ts` was reached only by an
`import type` in `lib/api.ts`, which compiles away; and the tests did not exist — the module's
header said `tests/files-model.test.mjs` ran it under `node --test`, and no such file was anywhere
in the tree. That is the observation-failure shape in a dead-end register, which is the worst place
for it: a claim of coverage standing in for the coverage, inside the document whose job is to find
exactly that. `apps/web/tests/files-model.test.mjs` now exists and asserts the four rules the
module's header names.

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

## apps/web/src/lib/planted-dead-end.ts — DELETE, 2026-09-15

**Found:** imported by nothing in the tree. One line.

**What it is:** not product source at all. It is the fixture a test in `tests/check-deadends.test.mjs`
used to write into the REAL working tree and `git add` into the REAL index, so that
`git ls-files` would see it, before removing it with `git rm -f` in a finally block.

**Why it is being deleted rather than wired or blocked:** there is nothing to wire. It exists only
because a test left it behind — and in a checkout shared by several live sessions, that test was a
race rather than a test. Twice on 2026-09-15 a session's `git commit` swept the file in or its
deletion out, under an author who had never touched it, because `git commit` writes the whole index
and not the paths that session staged.

The test has been removed. `it finds a module nothing imports` already plants the same orphan into
a temporary clone through `--root`, counts it, AND carries the control the deleted test had no
version of: a module that DOES have an importer and must not be reported. The checker's `--root`
flag was added for precisely this, and its own comment says so; one test was moved across and this
one was left behind.

Recorded here rather than removed quietly, per the rule at the head of `scripts/check-deadends.mjs`:
the disposition for a module that should not exist is DELETE with a dated statement.

## apps/worker/src/training-trajectory.ts — STRUCTURALLY-BLOCKED, 2026-09-18

Pure bounded trajectory ledger, reached only by its six tests. It does not authenticate consent,
collect live sessions, persist records, or create training-ready data. Connecting it requires an
append-only consent-event source, owner/project/run-bound verification and a trusted exporter with
independent outcome evidence. Current mutable opt-in flags are not historical consent proof.
No customer data collection or paid training has started.

## packages/training/src/consent-staging.mjs — STRUCTURALLY-BLOCKED, 2026-09-18

Offline envelope validator and redactor, reached only by its tests. Caller-supplied consent and
outcome assertions are not authenticated here; pattern redaction does not anonymize arbitrary
free text. It must remain disconnected from production data until trusted consent/export and
human review are available. Its output is explicitly not training-ready.

---

# Pass 14 — two modules found by the gate after the 507-file merge, dispositioned by the session that ran it

Same convention as the pass-12 and pass-13 notes above: WIRE here is a statement of fact plus the
intent each module's own header states. Neither is dispositioned DELETE and neither should be on
this evidence — §6.6 requires a dated owner statement for that, and deleting source to make a
checker green is a violation rather than a fix. If an author meant something else, the entry is
wrong and they should correct it.

**The other six entries the gate reported in the same run are not here, because they were not dead
ends.** All six are CLIs a person runs — five `#!/usr/bin/env node` diagnostics in
`packages/training/src` with main-module guards and usage lines, and
`apps/apple-plugin/scripts/build-restore-engine-proof.mjs` — and their packages' manifests did not
name them, so `DECLARED_ENTRIES` could not see them. That is the same gap this file already records
under `packages/corpus/src/discover.mjs`: "a gap in the manifest rather than in the code." The
manifests now name them, which is also how a person finds the command.

## packages/corpus/src/genre-references.mjs — WIRE, pass 14

**Found:** imported only by `packages/corpus/src/genre-references.test.mjs`. 269 lines, 7 exports,
9 passing tests.

**What it is:** bounded, offline retrieval over the curated genre-reference manifest —
`queryGenreReferences`, `getGenreReferenceCoverage`, and the two list functions — with the rights
boundary enforced in code: an external URL is returned as evidence metadata and never fetched.

**Its consumer exists and does not call it.** `apps/worker/src/genre-reference-guide.ts` reaches the
same corpus by statically importing `packages/corpus/data/genre-references.json` and projecting it
itself, so the Worker bundle carries a second implementation of this module's job. Both look alive
to a dead-end checker — one has callers, one has tests — which is the duplicated-implementation
shape already recorded as `OH-6` at the top of this file, arrived at from the other side.

**Outstanding:** a decision about which projection is canonical, then one caller. Until then the
nine green tests cover a query surface nothing can reach, and the projection the product actually
serves is the untested one.

## packages/training/src/diagnosis-contract-cases.mjs — WIRE, pass 14

**Found:** imported only by `packages/training/src/diagnosis-contract-cases.test.mjs`. 90 lines,
2 exports, 10 passing tests.

**What it is:** probe tables — `originalContractCases` and `supplementalContractCases` — that check
a candidate against input-type, finite-number and safe-integer domains beyond the frozen
development checks. Its header states the constraint that makes it worth keeping separate:
"discovering more defects must not rewrite a historical score."

**It is the fourth of four sibling case modules and the only one with no consumer.**
`local-pilot-diagnosis-cases.mjs` is read by `saved-pilot-probe-audit.mjs`,
`pilot-diagnostic-cases.mjs` by `pilot-probe-replay.mjs`, and `local-pilot-diagnostic-cases.mjs` by
`diagnose-local-pilot.mjs`. This one is read by its own test and nothing else, which is what
concurrent sessions each writing their own case table looks like from outside.

**Outstanding:** whichever diagnostic runner these probes were written for has to read them, or one
of the three siblings has to absorb them. Recorded rather than resolved: choosing between four
overlapping case tables is the authors' call, not this session's.

---

## `packages/training/src/build-mlx-dataset.mjs` — WIRE

**What it is:** the producer for `mlxdata-apple-v4`. Nothing in the repository wrote `mlxdata/`
before it: the training pipeline consumed a directory that no committed code produced, so the
dataset was an artifact of somebody's shell history. This is the script that makes it reproducible.

**Why it is imported by nothing:** it is a CLI. It is invoked by hand at the start of a training
run, like the other `packages/training/src/*.mjs` entry points, and importing it from a test would
mean running a dataset build to assert on it.

**Outstanding:** WIRE — it belongs in the training manifest so the run that consumes `mlxdata-*`
names the script that produced it. Until then the link between dataset and producer is a sentence in
an evidence file rather than a path a tool can follow.

## `packages/training/src/score-eval.mjs` — WIRE

**What it is:** the scorer for an isolated base-vs-adapter evaluation. It scores by RUNNING the
model's answer — compiling the Luau, executing the trajectory against the live tool registry — never
by string similarity, which is the whole reason it exists.

**Why it is imported by nothing:** also a CLI, run once per evaluation against a `runs/eval-*.json`.

**Outstanding:** WIRE — same manifest. A scored run currently records its numbers in an evidence
document; the scorer that produced them should be reachable from the run file itself.

## `packages/training/src/tool-trajectory-curriculum-b.mjs` — STRUCTURALLY-BLOCKED

**What it is:** the second half of the tool-trajectory seed curriculum, eighteen seeds written by a
concurrent session beside the twelve in `tool-trajectory-curriculum.mjs`.

**Why it is imported only by its own test:** the dataset builder reads the first curriculum file by
name. Two curriculum modules with one consumer is what two sessions writing seeds at the same time
looks like from outside.

**Outstanding:** STRUCTURALLY-BLOCKED — merging the two, or teaching the builder to read both, is a
decision about whose seed set is canonical. Recorded rather than resolved: that is the authors'
call, not this session's, and guessing would silently drop eighteen seeds or duplicate twelve.

## `apps/web/src/components/ws/asset-catalog.tsx` — DELETE, and it has been

**What it was:** the dialog behind the composer's "Assets" chip. It listed the curated library,
filtered by kind, previewed each row and appended a reference into the draft message.

**Why it went:** the owner's instruction on 2026-09-19 — the asset library is not something the
customer searches. That is a change of who does the looking, not a feature being dropped for want
of time: the customer describes what the place needs and Apple finds it. A library the customer
browses is a database with a product around it, and the rows in this one repeat across sources,
carry licences of several shapes, and include kinds nothing can place. That is a thing to hand an
agent that can check each row before using it, not a search box.

**What did NOT go, and this is the part worth being precise about:** `src/lib/asset-catalog.ts`
stays and is still live — `lib/api.ts` imports `CatalogAsset` from it, and both
`asset-catalog.test.mjs` and `asset-catalog-preview.test.mjs` test it. The validation those tests
cover is not about the dialog: `catalogPreviewUrl` refuses a preview URL that is not a Roblox CDN
image, which is a guard on data the worker hands back, wherever it is eventually shown. The agent's
own path to the library is untouched; only the customer's door is closed.

**If it comes back:** it is one file in git history, and this entry is where to find out why it was
not there.

---

## apps/worker/src/unzip.ts — STRUCTURALLY-BLOCKED, 2026-09-20

**Found:** imported by nothing in the tree, as of the asset library's removal.

**Its only product caller was `asset-import.ts`, and that file no longer exists.** The reader was
written for the catalogue: ambientCG, OpenGameArt and Kenney publish ZIP archives and nothing else,
Roblox takes png/jpeg/bmp/tga, so without a reader those rows could never become assets. The owner
removed the catalogue on 2026-09-20 and the import path went with it.

**It is NOT deleted, and the reason is a live guard rather than sentiment.** `zip-write.ts` is
reached from `index.ts` and builds the archive a customer downloads when they take a copy of their
whole workspace. `apps/worker/tests/files-archive-live.test.mjs` verifies that archive by parsing it
with `listZip`/`extractFromZip` **from this file** — deliberately, and it says so in its own header:
"A writer checked only by its own reader proves nothing; this one is checked by a reader that was
written for somebody else's files." Deleting `unzip.ts` would not remove dead code, it would remove
the independent oracle from a guard on a feature that ships, and leave the writer checked only by
itself.

**Structurally blocked on:** nothing in the product should import it. Its correct state is exactly
this — no product caller, one test caller, and an entry here saying why that is deliberate. If a
product path ever needs to read a ZIP again, this becomes a WIRE and this entry goes.

## `packages/training/src/roblox-frontier-controls.mjs` — STRUCTURALLY-BLOCKED

Imported only by `packages/training/src/roblox-frontier.test.mjs`, and that is its correct and
permanent state.

It is the FALSIFICATION CONTROL SET for the Roblox frontier benchmark: hand-written Luau whose only
job is to prove the benchmark's checks can fail. For each check id it carries an answer that MUST
fail that check, and a `pass` answer that must clear every check on the item. Its own header states
why it exists, and states it as a finding rather than a principle: two checks in the benchmark's
first draft were unfalsifiable, and they were caught here rather than by a wrong number in a report
later.

That is this repository's own failure shape written into a benchmark — a check that cannot fail
measures nothing while looking exactly like a check that passes, and a suite where everything
passes reads as good news. A fifty-check suite is the easiest possible place to commit it.

**Structurally blocked on:** nothing in the product may import it, ever. These are deliberately
broken Luau samples. A product path that could reach them is a path that could serve one to a
customer. One test caller and no product caller is not a gap to close — it is the design, and this
entry exists so the next person reading the dead-end report does not "fix" it by wiring it in.

If the benchmark itself is ever deleted, this goes with it in the same commit.

## `apps/worker/src/embedding-retrieval.ts` — STRUCTURALLY-BLOCKED

Imported by nothing in the tree, and that is the decision rather than an oversight.

It is the LOSING ARM of the retrieval bake-off. `docs/retrieval-bakeoff.md` records the row:
precomputed Workers AI embeddings scored **70/80 — 87%** at one embed call per query, against the
need-index ranker's 73/80 at zero model calls. The same document records why the gap is wider than
those numbers make it look: the embedding index was **already stale within an hour**, because eight
new screen files landed in the corpus and nothing re-embedded them. A retrieval path that silently
stops covering new knowledge is worse than a slightly weaker one that cannot go stale, and it costs
a model call per customer question to be worse.

So `searchVerifiedModules` delegates to `need-index-search.ts` and this file has no caller. It is
kept rather than deleted because the measurement behind it is real and the next person to propose
embeddings should read the arm that was already built and already beaten, not rebuild it. If the
staleness problem is ever solved — an index rebuilt on corpus change rather than on a schedule —
this becomes a WIRE and this entry goes.

---

## `.tmp-blue-matrix.mjs` — DELETE

**Found:** imported by nothing in the tree, 2026-09-22.

A one-off Playwright harness written during the minimal-redesign pass: it walked the site and the
app at four viewports, screenshotted each, and printed the ones that overflowed. Its siblings
(`.tmp-*.png`, `.tmp-*.b64`) are its output and are untracked alongside it.

**Why it goes:** it is scratch, not source. The `.tmp-` prefix is the only marker it ever had, and
a scratch file with no importer is indistinguishable from a module somebody forgot to wire up — so
it is disposed of here rather than left for the next dead-end report to re-derive. The visual QA it
performed is a standing requirement, not a one-off: it belongs in a committed harness under
`docs/evidence/`, which is where the real evidence for a release goes.

**Deleted:** with this entry, along with `apps/web/vite.config.ts.timestamp-*.mjs`.

## `apps/web/vite.config.ts.timestamp-1790089612853-3b4c4637a4608.mjs` — DELETE

**Found:** imported by nothing in the tree, 2026-09-22.

A Vite build byproduct. When Vite loads a config that is not plain ESM it writes a timestamped
`.mjs` beside it and imports that instead; the file is meant to be transient and is regenerated on
the next build.

**Why it goes:** it is output, not input, and it is the one thing in this list whose absence is
guaranteed to be recreated. It is recorded rather than silently removed because a stray
`vite.config.ts.timestamp-*.mjs` at the top of a diff is exactly the kind of file that gets
committed by accident.

## `apps/web/src/components/aicss/index.ts` — STRUCTURALLY-BLOCKED

**Found:** imported by nothing in the tree, 2026-09-22.

It is the barrel for the vendored AICSS components: ten `export * from` lines, one per component
directory, matching the shape the upstream package publishes.

**Why nothing imports it, and why that is correct:** every call site reaches for the component it
actually wants, by subpath — `admin.tsx` imports `../components/aicss/data-table`, `usage.tsx`
imports `../components/aicss/comparison-table`, and `lib/generative-ui/render.tsx` imports
`../components/aicss/file-diff/FileDiff.runtime.js`. That is deliberate: the runtime `.js` entry
points and the CSS Module side-effects mean a barrel that re-exports all ten would pull the whole
vendored surface into any bundle that wanted one table.

**Structurally blocked on:** `apps/web/tests/aicss-vendor.test.mjs` and `UPSTREAM.md` in the same
directory, which pin the vendored tree against its upstream commit and its MIT licence. The barrel
is part of that pinned surface. Deleting it would be editing vendored source to satisfy a dead-end
report, which is the wrong direction — so it stays, and this entry says why nobody should "fix" it
by wiring the barrel in.

## `apps/web/src/components/ws/connect-studio.tsx` — DELETE, and it has been

**Found:** imported by nothing in the tree, 2026-09-22.

**What it was:** the compact connection block that sat at the foot of the conversation — the
"Install Apple for Studio" / "Connect Studio" prompt, with the pairing code a click away. It drew
nothing once `status === 'connected'`, and it was written so it could never claim the plugin was
installed, because the browser has no way to observe a Studio plugin.

**Why it went:** the minimal redesign replaced the block with two surfaces that say the same things
in less space. The studio pill in the workspace topbar (`routes/workspace.tsx`) carries the
connection state and opens the pairing dialog, and `components/ws/studio-link-note.tsx` carries the
one sentence worth reading — when Studio last polled, how much work is queued, how slow the round
trip is, and whether Studio is holding the wrong place open. The block was a third place for the
same facts.

**WHAT ALMOST WENT WITH IT, and this is the part worth recording.** The component was the only
element in the app carrying `data-tour="connect-studio"`, and `lib/onboarding.ts` still lists a step
anchored to it. The tour withholds a step whose anchor is not in the document rather than pointing
at nothing, so deleting this file did not break the tour — it silently removed the step that teaches
a new user to connect Studio, which is the one step this product cannot afford to lose. The anchor
now lives on the connect control in `routes/workspace.tsx`, which is the element the step was always
trying to describe. **If this component comes back, the anchor goes back with it and this entry is
where to find out why it left.**

## `apps/web/src/components/ws/evidence-model.ts` — STRUCTURALLY-BLOCKED

**Found:** imported only by `apps/web/tests/evidence-model.test.mjs`, 2026-09-22.

**Why it has no product caller:** the evidence-card RENDERER was retired with the rest of the old
activity pipeline — `ws/evidence-cards.tsx` and its stylesheet are gone, and the activity list no
longer draws evidence chips. This module is the DATA half of that pair: it decides what counts as
evidence, how a claim is tied to the tool call that produced it, and what a piece of evidence is
allowed to say about itself.

**Structurally blocked on:** the data model is kept on purpose, and the brief that retired the
renderer says so in as many words — "the activity DATA MODEL can remain for audit truth; do not
delete useful event data merely because the old renderer is gone." A run's claims and the calls
behind them are what an audit reads when a customer disputes a change, and that question does not
stop being askable because the UI stopped drawing chips.

**If a renderer returns:** it reads this module rather than re-deriving the rules, and
`tests/evidence-model.test.mjs` is already the guard on them.

---

## packages/training/src/generate-eval-remote.mjs — WIRE, 2026-09-23

**Found:** imported by nothing in the tree (landed in 141a1ad).

**What it is:** a CLI, the remote twin of `generate_eval.py`. It produces the same output shape
from the SERVED models through `/api/admin/model-test`, so `score-eval.mjs` scores it unchanged.
Bases that do not fit on this Mac can only be measured this way. It is run by hand with
`GOLEM_ADMIN_KEY`, like `score-eval.mjs` above.

**Caller being added:** a `scripts` entry in `packages/training/package.json`, which is what makes
it a declared entry point for this checker. That manifest belongs to the knowledge lane, so the
entry is theirs to add. Until then, this line is where the CLI is recorded.

---

## packages/training/src/synthesize-game-logic.mjs — WIRE, 2026-09-23

**Found:** imported only by `packages/training/src/synthesize-game-logic.test.mjs` (141a1ad).

**What it is:** a CLI that grows the game-logic curriculum by executor-verified synthesis. A
teacher model drafts examples. A draft is kept only when `verifyExample` runs it with the real
`luau` binary and its mutation turns an assertion red. It writes `data/game-logic-synth-v1/`, and
`build-mlx-dataset.mjs` consumes that through `assemble({ extraLogic })`.

**Caller being added:** the same manifest `scripts` entry as the one above, owned by the same lane.
The test exercises only the pure helpers. It does not import the CLI to run it, because running it
spends teacher calls.

---

## packages/training/src/tool-trajectory-curriculum-c.mjs — WIRE, 2026-09-23

**Found:** reported as imported only by `packages/training/src/tool-trajectory-curriculum-c.test.mjs`.

**It already has a product caller, and the resolver cannot see it.** `build-mlx-dataset.mjs`
`assemble()` loads it through
`loadExtraCurricula(['./tool-trajectory-curriculum-b.mjs', './tool-trajectory-curriculum-c.mjs'])`.
That is a dynamic `import()` of a computed path, which this checker does not follow, by design,
because it resolves only literal specifiers. Batch C is in the v5 dataset (fe2bdf2).

That also makes the `curriculum-b` entry above stale: the builder does read both. The
STRUCTURALLY-BLOCKED reasoning given there no longer holds for the MLX dataset.

**Caller being added:** none is needed. The WIRE here records that the wire exists. The finding
clears if `loadExtraCurricula` takes static imports, which is an edit to `packages/training`, the
knowledge lane's package.

## packages/training/src/build-ui-logic-shard.mjs — WIRE, 2026-09-25

**Found:** imported only by `packages/training/src/ui-logic-curriculum-f.test.mjs`.

**The operator ran this one-shot builder.** It generated the committed, digest-pinned
`packages/training/data/ui-logic-seeds-v1/shard-1.jsonl`. The training supervisor does not call
the builder; it reads the verified shard through `appendVerified`, re-executes all answers and
checks the pinned SHA-256 before using it. The output was also uploaded to the private Hugging
Face dataset and read back byte-for-byte. This is a provenance tool, not a runtime capability.

**Caller being added:** none. The generated training shard is the reachable artifact; the
builder remains available for reproducing its origin in a fresh workspace, where its output
directory does not yet exist.

## packages/training/src/build-storage-outcome-shard.mjs — WIRE, 2026-09-25

**Found:** imported only by `packages/training/src/build-storage-outcome-shard.test.mjs`.

**The operator ran this one-shot builder.** It produced the committed,
SHA-256-pinned `packages/training/data/storage-outcome-seeds-v1/shard-1.jsonl`.
The ordered `storage-outcome-verified-shard` training hypothesis reads that
artifact through `appendVerified`; the supervisor checks its digest and
re-executes every answer. The same bytes were uploaded to the private Hugging
Face dataset and downloaded back. The builder is retained to reproduce the
first-party evidence, not as a runtime product feature.

**Caller being added:** none. The training shard is the reachable artifact;
the builder's test and CLI entry point establish its provenance.

## packages/training/src/storage-transfer-holdout.mjs — WIRE, 2026-09-25

**Found:** imported only by `packages/training/src/storage-transfer-holdout.test.mjs`.

**The operator ran this diagnostic CLI and its tests.** It writes and scores a
three-row, digest-pinned transfer holdout after a model evaluation. The local
reference modules passed Luau execution and deliberate mutations failed. No
trained model has answered these rows yet. The documented command in
`docs/training/storage-transfer-holdout-2026-09-25.md` is the current caller;
the CLI does not run on a customer request path and supplies no promotion score.

**Caller being added:** the post-training diagnostic step for a valid v25
result. Until that integration lands, this remains an explicit manual check
rather than an automatically run frontier measure.

## packages/asset-library/build-ui-components.mjs — WIRE, 2026-09-24

**Found:** reported as imported only by `packages/asset-library/ui-components.test.mjs`.

**It is a build step, and its product is reached.** Run by hand (`node packages/asset-library/build-ui-components.mjs`),
it writes `ui-components.json`, which the worker's `insert_ui_component` tool reads (D-UIONLY-1). The
import graph sees the builder and not the JSON edge, so the reachable thing is the file it writes.

**Caller being added:** none is needed. The WIRE here records that the wire exists: the operator runs it
when the UI library changes, and its test pins that the output matches the committed JSON.

## packages/asset-library/models/build.mjs — WIRE, 2026-09-24

**Found:** imported by nothing. **It is the model library's manifest builder** (D-MODELLIB-1): run by hand,
it writes `models/manifest.json`, which `find_library_model` and `insert_library_model` read.
**Caller being added:** none is needed; the operator is the caller and the manifest is the wire.

## packages/asset-library/models/fetch.mjs — WIRE, 2026-09-24

**Found:** imported by nothing. **It is the model library's download step** (D-MODELLIB-1): run by hand, it
fills the gitignored store with licence-cleared packs that `build.mjs` then indexes.
**Caller being added:** none is needed; it is an operator CLI, first link of fetch → build → upload.

## packages/asset-library/models/harvest-creator-store.mjs — WIRE, 2026-09-24

**Found:** imported by nothing. **It is the model library's Creator Store harvester** (D-MODELLIB-1): run by
hand, it writes the free-model rows `build.mjs` folds into the manifest.
**Caller being added:** none is needed; it is an operator CLI feeding the same manifest.

## packages/asset-library/models/upload.mjs — WIRE, 2026-09-24

**Found:** imported by nothing. **It is the model library's publish step** (D-MODELLIB-1): run by hand, it
puts the insertable files into the worker's static store at `/model-library/<path>`, where
`insert_library_model` reads them. Same shape as `../upload.mjs`.
**Caller being added:** none is needed; the operator is the caller and the static store is the wire.

## apps/worker/src/hf-3d-pipeline.ts — STRUCTURALLY-BLOCKED, 2026-09-24

The Hugging Face (Hunyuan3D) text-to-3D pipeline behind `generate_model_external`. D-MODELLIB-2 (owner
order: Apple never generates a 3D model from scratch) closed that tool to the agent, so its run now
refuses and nothing imports the pipeline. Kept, not deleted, because reversing D-MODELLIB-2 is one line
in tools.ts; `apps/worker/tests/hf.test.mjs` keeps it honest meanwhile.

## packages/asset-library/ui-store/harvest-creator-store-ui.mjs — WIRE, 2026-09-24

**Found:** imported by nothing. **It is the Creator Store UI image harvester** (D-UISTORE-1): run by hand, it
searches free decals keyless (toolbox-service v2, searchCategoryType=Decal), keeps each one's Image id
(`asset.textureId`) and writes `sources/ui-creator-store.jsonl.gz`, which `build.mjs` beside it compiles.
**Caller being added:** none is needed; it is an operator CLI, first link of harvest → build → index.json.

## packages/asset-library/ui-store/build.mjs — WIRE, 2026-09-24

**Found:** imported by nothing. **It is the UI image library's index builder** (D-UISTORE-1): run by hand, it
writes `ui-store/index.json`, which the worker search module `ui-store-search.ts` imports into the bundle.
**Caller being added:** none is needed; the operator is the caller and the index is the wire.

## apps/worker/src/ui-store-search.ts — WIRE, 2026-09-24

**Found:** imported only by `packages/evals/src/ui-store-search.test.mjs`. **It is the search over the
50,000+ Creator Store UI images** (D-UISTORE-1), a pure module built for `find_ui_asset`.
**Caller being added:** `find_ui_asset` in `apps/worker/src/tools.ts`, wired by the lead engineer, who
held tools.ts while this module was written.
