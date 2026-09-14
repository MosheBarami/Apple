
================================================================================
PASS 1  (mission prompt adopted)  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

§18 UNTRACKED/UNCOMMITTED MAP — every path present at pass start, mapped to the ledger
row it might implement. Recorded BEFORE the rescue commit.

  ?? apps/web/src/components/plans.tsx
       -> WORKLIST.md w12 "Plans and credits surfaced in the product, not only in the
          webhook". Mid-flight: renders PLAN_COPY/PLAN_LIMITS from @golem/shared. NOT yet
          imported by any route, so by §2.3 it is a DEAD END until wired.
  ?? docs/MISSION-PROMPT.md
       -> no ledger row; this is §14.3 step 0 itself.
   M GATES.md
       -> gate id collision repair (a second G25 had been introduced); renumbered to G26.
   M apps/worker/src/pricing.ts
       -> w12. PLAN_LIMITS/PLAN_IDS/isPlanId/SPARKS_PER_BUILD moved to @golem/shared and
          re-exported, so the plan page and the QuotaDO ledger read one table.
   M packages/shared/src/index.ts
       -> w12. PLAN_LIMITS + PLAN_COPY + buildsPerMonth/buildsPerDay added.

  WORKLIST.md: git-tracked (verified with `git ls-files --error-unmatch`).

--------------------------------------------------------------------------------
PASS 1  2026-09-14T17:04:54Z  HEAD 1012feb  tree-clean=yes  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

STATION: none probed. Pass 1 is §6 oracle repair and §11.3 permits exactly one NULL
  PASS for it. No station claim is made, because no deployed-origin probe ran.

DERIVED OPEN: gates 1 met / 30 open | worklist 6 | mission not re-derived this pass
  | features 1084 not-started of 1249 | blockers not re-derived this pass

CLOSED:
  G-ORACLE-1 — the gate checker can now say no — falsified 30cda94 / evidence cd075ec

WHAT §6.1 ACTUALLY FOUND, measured not inherited:
  - `gate-check.mjs --reverify GATES.md` was a SILENT NO-OP. Flags were parsed with
    `args.includes()`, so an unrecognised flag fell through to an ordinary verify and
    printed a green summary. Every pass that believed it had re-verified fingerprints
    had not. §16.1 was vacuously satisfiable. Unknown flags now exit 2, proven by an
    executed test, and by the red-first break that removed that exact branch.
  - The typed ledger summary said 26 gates / 26 met. The file had 30 boxes, all ticked.
    The tally is now computed from the checkboxes and `--lint` fails on disagreement.
  - `output-sha256` was taken over raw output containing per-test durations, so NO test
    gate's fingerprint could ever reproduce. The first real --reverify quarantined all
    31 gates for a reason unrelated to the code. Fixed by normalising noise and proven
    to still discriminate: a changed command, test set or assertion message each move
    the sha; two runs of an unchanged gate now agree.
  - Four tracked source files were BINARY to grep. `grep -c e` over
    apps/web/src/lib/commands.tsx printed nothing and exited 1 — read by every
    grep-based check as "no matches" rather than "I could not look". One was written
    earlier in this same session by a heredoc emitting a raw byte instead of an escape.
  - TWO EVAL SUITES WERE REPORTING THE NETWORK. asset-qc and provenance shelled to
    `npx esbuild` from a package that does not declare esbuild, so npx fetched it from
    the registry: green on a warm machine, red on a clean one. Both also used
    --platform=neutral, which defaults mainFields to EMPTY and cannot resolve a
    workspace package at all. Seven files had the shape; all fixed.
  - `gate-suite.mjs` was NOT a superset of root `pnpm test`: it skipped
    check-workspace-coverage.mjs, so it could print SUITE GREEN while a package had
    dropped out of the recursion — the exact defect that checker exists to catch.

DISPOSITIONS: CLOSED 1 | BOOKKEEPING-FLIP 0 | MERGE 0 | FACET 0 | STRUCTURAL 0 | OWNER 0 | TIME-GATED 0

REFUTERS: dispatched 0 | status-changes 1 | NOT RUN — this is a §9.1 debt, scheduled pass 2.
  The one status change is G-ORACLE-1, whose red-first record is its own adversary: it was
  observed failing at break-sha 30cda94 with the shipping path removed. That does not
  discharge §9.1 and I am not calling it discharged.

ORACLES: checkers added 1 (assert-tests.mjs) | gate-check.mjs rewritten | falsification
  records 1 | quarantined gates 30 | gate count 31 (was 30)

VERIFICATION:
  gate-check.mjs --reverify GATES.md    exit 1   31 gates, 1 met, 30 unmet
  gate-suite.mjs                        exit 0   SUITE GREEN, 2163 passed, 0 failed
  gate-typecheck.mjs                    exit 0   TYPECHECK CLEAN
  neurons spent 0 — no model-invoking probe ran this pass

DEPLOYED: not probed, not deployed. Drift unmeasured — a §10.2 debt, scheduled pass 2.

PIXELS: 0 routes captured. check-pixels.mjs does not exist (§6.9 NOT STARTED).

NOT DONE:
  §6.2 red-first back-fill | 30 gates have no falsification record; each needs a worktree,
    a break of its shipping path, and a recorded red. This is the bulk of §6. | SCHEDULED pass 2
  §6.3-§6.10 checkers | none written | SCHEDULED pass 2
  §9.1 refuters | not dispatched this pass | SCHEDULED pass 2
  §10.2 drift invariant | deployed origin not probed | SCHEDULED pass 2

NUMBERS CORRECTED:
  prompt §6.1 "knows only --approve/--lint/--gate" -> it also knew --status, --timeout, --file
  ledger typed summary "26 gates, 26 met" -> 30 boxes, now 31 gates / 1 met
  suite 2138 passed -> 2163, because two suites that were silently failing now run

SELF-REFUTER: not dispatched. §9.5 debt, scheduled pass 2. The sentence I would expect it to
  find is "SUITE GREEN — 2,163 passed": true, and materially misleading, because 30 of the 31
  gates that suite backs have never been observed failing, so the number measures how much runs,
  not how much is proven.

HANDOFFS OPEN: none re-probed this pass. OWNER-HANDOFF.md not yet written — §13.1 debt.

NEXT: node scripts/check-escape-hatches.mjs does not exist; write it red-first (§6.4).

--------------------------------------------------------------------------------
PASS 2  2026-09-14T17:14:09Z  HEAD 64096c8  tree-clean=false  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

STATION: none PROVEN. No deployed-origin probe ran. S1 advanced in the repo only — two
  contractual terms removed from the pricing page — which is not a station claim and is
  not recorded as one.

DERIVED OPEN: gates 4 met / 31 open of 35 | worklist 6
  | features 1084 not-started of 1249

CLOSED:
  G-CRITIC-1  — the critic cannot report clean for checks it never ran — a50e9d2 / e0ba958
  G-ORACLE-2  — the escape-hatch checker, 22 detectors each driven by a planted violation — 61768ab / (recorded)
  G-ORACLE-3  — the offer checker, measuring four numbers a plan must reconcile — e3f864b / (recorded)

OPEN AND HONESTLY RED:
  G-OFFER-1 [S1] — blocked on OH-1 and OH-2, which are numbers §12.5 reserves to the owner.
    Not abandoned, not deferred: the checker exists, is red, and names what is wrong.

WHAT PASS 2 FOUND, measured not inherited:
  - THE FREE PLAN CANNOT FINISH ONE BUILD. PLAN_LIMITS.free.sparksPerDay is 60 and
    SPARKS_PER_BUILD is 77, so buildsPerDay('free') is literally 0. A free tier that
    completes nothing is not a trial; it demonstrates the product not working.
  - TWO PLANS PROMISE MORE THAN THE SERVICE CAN SERVE. team grants 1,500 Sparks/day and
    enterprise 6,000, against DAILY_NEURON_CEILING of 25,000 neurons = 833 Sparks for
    EVERY USER COMBINED. One Team subscriber exhausts the day for everyone. That is not a
    pricing mistake; it is a promise that fails when someone uses what they bought.
  - THE PRICING PAGE CARRIED TWO CONTRACTUAL TERMS the owner never authorised: "No card
    required, ever" and "You will never be charged". Removed; replaced with what is true
    today and no promise about tomorrow.
  - THE CRITIC COULD NOT SAY "I DID NOT LOOK". applyMetricRules skipped a rule whose
    metric was missing, silently, so a partial metric set produced a short defect list
    indistinguishable from a clean build. Reported now, attributed to lens and subject,
    and the caveat prints ABOVE the tally because the tally is the sentence a reader
    forms an opinion from.
  - apps/site's typecheck was behind || true and therefore could not fail. Removed and
    proven: a planted type error gives 3 errors, restoring the file gives 0.
  - EVERY GENERATED IMAGE IS BILLED AND DISCARDED. storeImage writes image:<uuid> to KV,
    generate_image returns the key, and nothing in apps/worker/src, apps/web/src or
    packages reads it back. Live, billed, output never seen. Contract for the fix agreed
    with rbxai-a3; the route is mine. SCHEDULED pass 3.

DISPOSITIONS: CLOSED 3 | BOOKKEEPING-FLIP 0 | MERGE 0 | FACET 0 | STRUCTURAL 0 | OWNER 2 (OH-1, OH-2) | TIME-GATED 0

REFUTERS: dispatched 2 of 3 status changes, results not yet returned at the time this
  record was written. This is an incomplete discharge of §9.1 and is recorded as such
  rather than as a pass. G-ORACLE-3's refuter is the missing one. SCHEDULED pass 3.

ORACLES: checkers added 2 (check-escape-hatches, check-offer) | falsification records 3
  | gate count 35 (was 31) | OWNER-HANDOFF.md created with 4 rows

VERIFICATION:
  gate-check.mjs --lint          exit 0   LEDGER WELL-FORMED — 35 gates, 0 problems
  gate-suite.mjs                 exit 0   SUITE GREEN, 2206 passed, 0 failed
  gate-typecheck.mjs             exit 0   TYPECHECK CLEAN
  check-escape-hatches.mjs       exit 0   CLEAN, 421 files examined
  check-offer.mjs                exit 1   INCOHERENT, 3 problems — the honest state
  neurons spent 0

DEPLOYED: not probed, not deployed. §10.2 drift invariant outstanding for a second pass.

PIXELS: 0 routes captured. check-pixels.mjs still does not exist (§6.9).

NOT DONE:
  §6.2 back-fill  | 31 gates still have no falsification record | SCHEDULED pass 3
  §6.5 check-backlog.mjs | not written | SCHEDULED pass 3
  §6.6 check-deadends.mjs | not written | SCHEDULED pass 3
  §6.7 check-dispositions.mjs | not written | SCHEDULED pass 3
  §6.9 check-pixels.mjs | not written | SCHEDULED pass 3
  §6.10 check-rebrand.mjs | not written | SCHEDULED pass 3
  §10.2 drift | deployed origin unprobed for two passes | SCHEDULED pass 3
  image leak | route is mine, contract agreed | SCHEDULED pass 3

NUMBERS CORRECTED:
  pass 1 said 31 gates -> 35 now
  suite 2163 -> 2206
  prompt §17 lists 12 defects; a 13th is now measured — the billed-and-discarded image path

SELF-REFUTER: not dispatched. §9.5 debt carried from pass 1, SCHEDULED pass 3. The sentence
  I expect it to find is "3 gates CLOSED this pass": true, and materially misleading, because
  all three are gates on ORACLES rather than on product behaviour a user could notice. The
  product diff this pass is real but small — one critic fix, two copy lines, four escaped
  control bytes — and calling three oracle closures progress toward a shippable product
  overstates what changed for anyone using it.

HANDOFFS OPEN: OH-1 free-plan allowance — approve-by node scripts/check-offer.mjs — flips 1 row
               OH-2 team/enterprise daily grant vs service ceiling — same command — flips 1 row
               OH-3 Stripe live keys — NOT PROBED this pass, opening balance only
               OH-4 Creator Store distribution — NOT PROBED this pass, opening balance only

NEXT: node scripts/check-rebrand.mjs does not exist; write it red-first (§6.10), then probe
  the deployed origin for §10.2 before anything else claims a station.

--------------------------------------------------------------------------------
PASS 3  2026-09-14T17:30:29Z  HEAD 7214e6c  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

STATION: S1 ADVANCED(2 of 4 sub-probes green, was 0). The deployed origin was probed for
  the first time this mission. / and /pricing return 200 and the two unauthorised
  contractual terms are gone from source — but the DEPLOYED site still says Golem, so S1
  is NOT proven and is not claimed.

DERIVED OPEN: gates 2 met / 33 open of 35 | worklist 6
  | features 1084 not-started of 1249

REOPENED — BOTH REFUTERS RETURNED REFUTED:
  G-CRITIC-1 — critic.ts has ZERO product importers. The refuter bundled the deployed
    entry point and found 0 occurrences of runCriticPanel, applyMetricRules or
    UncheckedRule, against controls of 6 and 3 for inspect_visually and lastRender. The
    product's visual path is vision.ts. The mechanism is sound and every behavioural claim
    reproduced independently — but in a module no user can reach, which is a §2.3 dead end.
  G-ORACLE-2 — the failing word was "every". Eight of twenty-two detectors had no test,
    and the refuter BOUGHT a green signal: floor 20 against a suite of 22, so deleting the
    denominator guard and the bare-grep guard left the gate passing at exactly 20.

WHAT THE REFUTATIONS FORCED, all executed:
  - Eight detectors given tests, plus a ninth that did not exist (a GATES.md containing no
    gates — §12.1 names removing the rows so a checklist appears complete). 22 -> 32 tests.
  - Floor raised 20 -> 32 with an adjacent EXPECT-CHANGE line.
  - Three deferral words §6.4 mandates restored (once, after, carried). They had been
    dropped to stop false positives; the sentence-plus-work-verb rule is what makes them
    safe to carry, and the refuter's three example sentences are now caught.
  - The EXPECT-CHANGE detector was INERT WHERE IT RUNS: it diffs HEAD~1, and CI only runs
    this checker inside a single-commit scratch clone. It now reports that it could not
    look. It was also searching the whole file for the note, so one line anywhere excused
    every change forever; §5.5 says adjacent, so it is adjacent.
  - The checker was wired into nothing. Now runs in gate-suite directly.

A PROCESS DEFECT OF MINE, found by both refuters independently:
  This session's blanket 'git add -A' swept each refuter's in-flight mutation into a commit
  about something else — critic.ts and check-escape-hatches.mjs, inside six minutes. The
  second left main shipping a DISABLED detector until it was found by hand. GATES.md
  records tree-clean=yes as a fingerprint of run integrity; with a second session editing
  concurrently that attestation is false. This session now commits explicit paths only.

DEPLOYED, MEASURED FOR THE FIRST TIME:
  GET /api/health   200  {"ok":true,"version":"0.1.0"}
  GET /api/version  401  — so there is NO anonymous way to tell what is deployed, and the
                          §10.2 drift invariant cannot be run as written. The version the
                          health route does return is the package version, which never moves.
  GET / /app /pricing  200
  bundle 808,238 bytes: Apple 2, Golem 86. Local build: Apple 98, Golem 4 (all exempt).
  THE REBRAND HAS NEVER BEEN DEPLOYED. A stranger sees "Golem builds it."

  A MEASUREMENT I GOT WRONG AND CORRECTED: my first bundle fetch used /assets/... and the
  page references /app/assets/..., so I fetched five 404 pages and counted those. Caught by
  checking a single asset directly. The first count was mine, not the product's.

WHY NOT DEPLOYED: §12.6 permits a deploy only as the last action of a pass whose §10 block
  is fully green. check-offer.mjs is RED on OH-1 and OH-2. That coupling is correct rather
  than unfortunate — shipping the rebrand also ships the pricing page, and the offer behind
  it is incoherent. It does make OH-1/OH-2 station-blocking for S1.

DISPOSITIONS: CLOSED 0 | REOPENED 2 | OWNER 2 (unchanged) | others 0

REFUTERS: dispatched 2 | status-changes 2 | UPHELD 0 | REFUTED 2. Both refutations forced
  executed repairs in the same pass, per §9.4. §9.5 self-refuter still not dispatched.

ORACLES: checkers added 1 (check-rebrand) + 1 helper (rebrand-literals) | detectors 22 -> 32
  tested, 1 added | gate count 35 | quarantined 0 this pass

VERIFICATION:
  gate-suite.mjs            exit 0   SUITE GREEN, 2216 passed, 0 failed
  gate-typecheck.mjs        exit 0   TYPECHECK CLEAN
  check-escape-hatches.mjs  exit 0   CLEAN, 421 files
  check-rebrand.mjs         exit 1   INCOMPLETE — deployed bundle only; source is clean
  check-offer.mjs           exit 1   INCOHERENT, 3 problems — OH-1, OH-2
  gate-check.mjs --lint     exit 0   WELL-FORMED, 35 gates
  neurons spent 0

NOT DONE:
  §10.1 path-dependency per gate | evidence recorded at sha X is stale when the CHECK's own
    files have changed since X, even if re-running passes. Not implemented. This is what
    would have flagged both swept commits at the moment they landed. | SCHEDULED pass 4
  G-CRITIC-1 | wire critic.ts into inspect_visually or delete it | SCHEDULED pass 4
  §6.2 back-fill | 33 gates without a falsification record | SCHEDULED pass 4
  §6.5 check-backlog, §6.6 check-deadends, §6.7 check-dispositions, §6.9 check-pixels | SCHEDULED pass 4
  §9.5 self-refuter | carried from pass 1 and pass 2 | SCHEDULED pass 4

NUMBERS CORRECTED:
  my own first deployed-bundle count (Apple 0 / Golem 140) -> Apple 2 / Golem 86; the first
    was five 404 pages fetched from a wrong path
  suite 2206 -> 2216
  escape-hatch detectors: 22 claimed tested -> 14 actually tested -> 32 now

SELF-REFUTER: still not dispatched; third pass carrying it. The sentence I expect it to find
  is "SUITE GREEN, 2216 passed": true, and materially misleading, because 33 of 35 gates have
  never been observed failing and the one station probed this pass is not proven. The suite
  measures how much runs.

HANDOFFS OPEN: OH-1, OH-2 — now STATION-BLOCKING for S1, because §12.6 will not let the
  rebrand deploy while check-offer is red. OH-3, OH-4 still opening balances.

NEXT: implement §10.1 path-dependency in gate-check.mjs, then decide G-CRITIC-1 by wiring
  critic.ts into inspect_visually or deleting it.

--------------------------------------------------------------------------------
PASS 4  2026-09-14T17:37:35Z  HEAD d22d5e4  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

STATION: none claimed. This pass was §10.1 oracle work plus handoff accounting.

DERIVED OPEN: gates 1 met / 34 open of 35 | worklist 6
  | features 1084 not-started of 1249 | handoffs 6

CLOSED: none. One capability added, no gate ticked.

§10.1 — EVIDENCE NOW KNOWS WHICH CODE IT WAS ABOUT.
  A gate records the fingerprint of every file it ACTUALLY LOADED, taken from V8 coverage
  rather than declared by an author, because a declaration drifts the way a prose tally
  does. The list is written to docs/evidence/gate-deps/<id>.json; only the fingerprint goes
  on the record line. `--status` recomputes it and prints current or STALE, executing
  nothing.

  PROVEN, both directions: appending one line to scripts/assert-tests.mjs — a file
  G-ORACLE-1's CHECK never names but does load — flips it to STALE in under a second, and
  restoring the file flips it back to current. G-ORACLE-1's discovered dependency set is
  three files, only one of which its CHECK mentions.

  This is the thing that would have caught both swept commits at the moment they landed.

TWO DEFECTS IN MY OWN NEW CODE, both caught by this session's own checkers:
  - Two NUL bytes in scripts written twenty minutes earlier: masking an exempt span with a
    raw byte where a space was meant. Third time the control-byte detector has earned its
    place in one session — once on code from an hour before, once on a file a peer's
    NUL-only scan missed, now on my own.
  - The three-consecutive-confessions detector used G[\w-]+ as a row id, which matches
    GREEN in "SUITE GREEN", so three passes of a passing suite read as a stall. A detector
    that fires on its own success message is worse than one that does not fire: it teaches
    the reader to ignore it. Narrowed to real ids.

HANDOFFS: 4 -> 6.
  OH-5 image retention. IMAGE_TTL_SECONDS is 3,600 against a panel that lives as long as
    the conversation, so a returning user scrolling back to yesterday is the normal path.
    Everything on this side is built; the number is a storage bill.
  OH-6 geometryMask and figureGroundContrast exist in BOTH apps/worker/src/composition.ts
    and packages/evals/src/props.mjs — one deciding what the offline grader believes, the
    other what the product would. Recorded because no dead-end checker will find it: both
    copies have callers, which is precisely why they can disagree indefinitely.

DISPOSITIONS: CLOSED 0 | OWNER 6 | others 0

REFUTERS: 0 dispatched. No row changed status this pass, so §9.1 requires none. §9.5's
  self-refuter is still carried, fourth pass.

VERIFICATION:
  gate-suite.mjs            exit 0   SUITE GREEN, 2216 passed, 0 failed
  gate-typecheck.mjs        exit 0   TYPECHECK CLEAN
  check-escape-hatches.mjs  exit 0   CLEAN, 423 files
  gate-check.mjs --lint     exit 0   WELL-FORMED, 35 gates
  neurons spent 0

DEPLOYED: not deployed. Still blocked by §12.6 on check-offer being red, which is OH-1/OH-2.

NOT DONE:
  G-CRITIC-1 | wire critic.ts into inspect_visually or delete it | SCHEDULED pass 5
  §6.6 check-deadends | would find every critic.ts-shaped case systematically rather than
    one at a time | SCHEDULED pass 5
  §6.2 back-fill | 33 gates without a falsification record | SCHEDULED pass 5
  §6.5 check-backlog, §6.7 check-dispositions, §6.9 check-pixels | SCHEDULED pass 5
  §9.5 self-refuter | carried four passes | SCHEDULED pass 5
  OH-6 | decide which pixel-metric implementation survives | SCHEDULED pass 5

NUMBERS CORRECTED: handoffs 4 -> 6. Denominator 421 -> 423 files as two scripts landed.

SELF-REFUTER: still not dispatched. The sentence I expect it to find this pass is "§10.1 —
  evidence now knows which code it was about": true of the mechanism, and misleading because
  only 2 of 35 gates carry a dependency fingerprint at all. The other 33 have no evidence to
  be stale, so the staleness check currently has almost nothing to check.

NEXT: node scripts/check-deadends.mjs does not exist; write it, and let it decide
  G-CRITIC-1 rather than deciding that one by hand.

--------------------------------------------------------------------------------
PASS 5  2026-09-14T17:47:54Z  HEAD 91a8c70  prompt-sha=6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd

STATION: S7 ADVANCED(1 of 3 sub-probes green, was 0) — a successful render now also produces a
  measured critique that reaches the browser. NOT proven: no deployed probe, and the tool is
  Studio-gated.

DERIVED OPEN: gates 5 met / 31 open of 36 | handoffs 6 | features 1084 of 1249

CLOSED:
  G-CRITIC-1 [S7] — the critic runs on a product path — ae01cac / recorded
  G-CRITIC-2      — the critic's rules and evidence gate behave as specified — d5ff368 / recorded

THE DEAD END IS CLOSED, and the measurement is the point. Before this pass the deployed
  worker bundle contained ZERO occurrences of runCriticPanel, applyMetricRules or
  lightingConfigCriticisms, against a control of six for inspect_visually. All four now
  appear. Nine hundred lines of measured rules with an evidence gate were running nowhere
  while the product asked a vision model for a score instead.

  The missing piece was never the critic. It was twenty lines turning a render result and a
  Lighting report into a CriticInput.

  FIVE OF EIGHTEEN METRICS ARE DELIBERATELY ABSENT. Their semantics are defined by the eval
  harness; reproducing them would mean inferring a downsample and a masking rule. A guessed
  metric feeds the critic a confident wrong number, which is worse than a lens that honestly
  did not run — and this is only safe BECAUSE pass 2's unchecked work made "partial" a state
  that can be reported. The earlier fix is what makes this wiring honest.

  The browser renders it, with the incompleteness callout BEFORE the findings. A payload
  nothing reads is the same dead-end shape one layer out.

WHAT THE RED-FIRST RECORDS LOOK LIKE NOW. Each break removes the NARROWEST path its gate's
  sentence claims, which is the lesson from the last refutation: stubbing a shared helper
  neuters everything at once and proves only that the harness is connected.
    G-CRITIC-1 — the CALLER is unwired; critic.ts is untouched and still correct.
    G-CRITIC-2 — the silent skip is restored inside applyMetricRules.

ALSO REPAIRED THIS PASS:
  - .unlazy-hook-state.json was TRACKED, so the working tree was permanently dirty and every
    evidence record this session had taken carried tree-clean=no for one file of
    machine-specific session state. Untracked. The five gates now met are the first records
    with tree-clean=yes.
  - The stall detector scanned the whole pass record, so it reported OH-1 and OH-2 as stalls
    for doing exactly what a handoff row is for. §6.4 says confessions; §13.1 says the handoff
    table is regenerated every pass. Scoped to NOT DONE, with a positive control.
  - G-ORACLE-2's claim was reworded from "catches every cheap way to buy a green signal" —
    a claim about a set nobody has enumerated, which is how a refuter bought one — to
    "every detector is proven to fail against a planted violation", which is what the tests
    establish.

DISPOSITIONS: CLOSED 2 | OWNER 6 | others 0

REFUTERS: 1 dispatched against G-CRITIC-1's new evidence, per §9.4. Result not yet returned
  at the time this record was written and is NOT assumed. §9.5's self-refuter still carried,
  fifth pass.

VERIFICATION:
  gate-suite.mjs            exit 0   SUITE GREEN, 2230 passed, 0 failed
  gate-typecheck.mjs        exit 0   TYPECHECK CLEAN
  check-escape-hatches.mjs  exit 0   CLEAN, 423 files
  gate-check.mjs --lint     exit 0   WELL-FORMED, 36 gates
  neurons spent 0 — the panel runs with no judge and makes no model call

DEPLOYED: not deployed. §12.6 blocks it while check-offer is red, which is OH-1 and OH-2.

NOT DONE:
  §6.2 back-fill | 31 gates without a falsification record | SCHEDULED pass 6
  §6.5 check-backlog, §6.6 check-deadends, §6.7 check-dispositions, §6.9 check-pixels | SCHEDULED pass 6
  §9.5 self-refuter | carried five passes | SCHEDULED pass 6
  OH-6 | the duplicated pixel metric | SCHEDULED pass 6

NUMBERS CORRECTED: gates 35 -> 36. Suite 2216 -> 2230. Met 3 -> 5.

SELF-REFUTER: still not dispatched. The sentence I expect it to find is "the dead end is
  closed": true of the bundle, and misleading because inspect_visually is Studio-gated, so
  the path only executes for a user with a paired plugin — and plugin distribution is itself
  an open handoff. Being in the bundle is not the same as being reached.

NEXT: node scripts/check-deadends.mjs — find every remaining critic.ts-shaped module
  systematically rather than one refutation at a time.
