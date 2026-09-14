# GATES — Apple product completion

Every gate states one observable outcome. A gate counts as met only when its `CHECK:` exits zero
and its `EXPECT:` matches. A checked box with no evidence is unmet.

Scope: the engineering-only blockers in `docs/backlog/BLOCKERS.md` §D, plus the highest-value
unbuilt items in `docs/backlog/FEATURES.json`. Owner-blocked items (§A, §B, §C) are out of scope
and are tracked as handoffs, not gates.

---

## Closed in earlier sessions — re-verified here, not assumed

- [ ] G1: The render payload cannot crash the workspace
    CHECK: cd apps/web && node --test src/lib/generative-ui/adapters.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=e253db45422d0dcc05c8ad0f9ddbeb508c23d69502b562d8ad75c8643554f50f; output-bytes=653

- [ ] G2: Conversation is not routed through the build harness, in English or Hebrew
    CHECK: cd apps/worker && node --test tests/conversational-routing.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=54213e7106c7b2773dba2db4d25689f3e8c21aadb07f76eddaf0d073aa143657; output-bytes=595

- [ ] G3: An idle project stops holding a Durable Object open
    CHECK: cd apps/worker && node --test tests/poll-residency.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=df8bbee6bca735e9bfb606b370468a6429b46f41237ce784bc5f7b9c472d8a28; output-bytes=543

- [ ] G4: The admin spend route can only ratchet down
    CHECK: cd apps/worker && node --test tests/spend-ratchet.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=7cb0f655e672eaf88e3174d1c6bcb22fab65308a060c5592acdd5929853db9c0; output-bytes=385

- [ ] G5: A checkpoint restore reports what it actually put back
    CHECK: cd apps/worker && node --test tests/restore-fidelity.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=600802abf00e3ae73817a6d490b75cba654393d1ebe9f4671b2639ef38cd96e5; output-bytes=626

- [ ] G6: Asset provenance survives the step boundary
    CHECK: cd apps/worker && node --test tests/asset-provenance.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=b6e78dc2206a0b03f5fbac0608420d6a1ff14feb85feb37f09b9cd3de0c54996; output-bytes=549

- [ ] G7: No tool is offered that this deployment cannot run
    CHECK: cd apps/worker && node --test tests/asset-library-gating.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=dc2c7a4702b601a5aeb78d152a6b95ffcf9c8bd6680ae96ad421f4d61ab9d379; output-bytes=663

- [ ] G8: Billing refuses an unsigned, forged, stale or tampered webhook
    CHECK: cd apps/worker && node --test tests/billing.test.mjs tests/billing-route.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=80404cd173b255ad14995cbbdd9f9c49d309e5f671abb1b3bfd2391e7724aa3a; output-bytes=1660

- [ ] G9: The door benchmark separates a correct door from the real broken outputs
    CHECK: cd packages/evals && node --test src/door-benchmark.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=46d629f76a5001658f5fef05f66141cccfc4a42191ad5ecea6a8b234e362dfe8; output-bytes=320

- [ ] G10: The MLX adapter converts to PEFT with proven delta-W equivalence
    CHECK: cd packages/training && node --test src/mlx-to-peft.test.mjs src/build-dataset.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=a2ef3468e7e2343986db5d48ed296850c9a40cb0660d4d5969cf7b3d74440523; output-bytes=1470

---

## Open

- [ ] G11: The workspace mirrors correctly in RTL, not just the auth screen
    CHECK: cd apps/web && node --test tests/rtl-workspace.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=d89a95842367d0710f1dfd831e5030eea9f9ef1d98dfff09e5c115656a17ef15; output-bytes=476

- [ ] G12: Every user-facing surface has an explicit empty, loading and error state
    CHECK: cd apps/web && node --test tests/ui-states.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=501ee60b3de430a690663b5962fd1f45b829d31318f592321bd3f9c9b3f9071a; output-bytes=489

- [ ] G13: A run's cost and context use are visible to the user while it happens
    CHECK: cd apps/web && node --test tests/run-meters.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=f61d6198e9a1b52479a487e9ba1cda5c31eec5d8caee08f9f3fb248c1956bba5; output-bytes=592

- [ ] G14: A conversation export is the whole conversation, and cannot forge its own filename
    CHECK: cd apps/worker && node --test tests/export.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=2b99c8c854e0ec6bef7bd64a1420e0e75017278aadf448a296ff921a80be9036; output-bytes=1463

- [ ] G15: A project can be renamed from either surface, and Escape does not save
    CHECK: cd apps/web && node --test tests/rename-project.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=f88e95c00fa38fa4f90170bd67c857c905acbbca0efef94a319faa8288b2cd8e; output-bytes=1120

- [ ] G16: Every action in the product is reachable from the command palette, and the palette is reachable from every signed-in route
    CHECK: cd apps/web && node --test tests/command-palette.test.mjs tests/command-match.test.mjs tests/shortcuts.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=9eef9172bd22f3daf2edebe1656fe09161c5881ace6e207ada05bbcbcce8b429; output-bytes=4219

- [ ] G17: The palette puts the command you meant first, and lists each one once
    CHECK: cd apps/web && node --test tests/command-match.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=8945c1bb1c57a46547481182ca58bac084cebbbd6b092e56209c9907fb6a2666; output-bytes=1891

- [ ] G18: One keyboard map, with no chord claimed twice and none stolen from the browser
    CHECK: cd apps/web && node --test tests/shortcuts.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=311ea7a211e4ba24a7f9488a74bf0a80cf11bd174f3b444d38c2ae7cd43b12a6; output-bytes=1329

- [ ] G19: Search reads every message, and its results cannot be stale or mis-highlighted
    CHECK: cd apps/worker && node --test tests/search.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=a9786747f645dec7e090cd628ee4bf0c44a1ccd56bce1b46dee52b80bd9dcb82; output-bytes=1867

- [ ] G20: The search panel names every state and drops responses for a query the user has moved past
    CHECK: cd apps/web && node --test tests/search-panel.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=c30700df765c4a778bcd9419e9d2f840fd4f23e727e710545d6b45793d7bffe4; output-bytes=1343

- [ ] G21: Archiving hides a project everywhere and loses nothing, and restoring brings it all back
    CHECK: cd apps/web && node --test tests/archive.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=9339756b8e7cf3a802d0e74bdcaaaf7abeb2f17ec1c6f5a24c3ee35c317e6d54; output-bytes=1188

- [ ] G81: A package cannot silently fall out of `pnpm -r test`, and the checker that says so is itself checked
    CHECK: node --test tests/workspace-coverage.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=e53747d; tree=dirty; EXPECT=matched; output-sha256=e38fd0e1fccd11b30f9f1406d692ee91c3db677a040646fd43549075cce49003; output-bytes=983

<!-- G80+ gates the verification machinery itself, kept clear of the G1..G79 feature range so two
     sessions appending gates at the same time cannot collide on a number. Two did, twice, on the
     same afternoon; gate-check.mjs now refuses a ledger with duplicate ids. -->

- [ ] G80: The gate checker itself is measured, and cannot report green over a gate that fails
    CHECK: node --test tests/gate-check.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=e53747d; tree=dirty; EXPECT=matched; output-sha256=c1a7e85d6485cb16c1024b787a60502f9eae91e6c64043ccd594d2f55bc20f37; output-bytes=2262

- [ ] G22: Editing a prompt refuses before it destroys, and says what it does not undo
    CHECK: cd apps/worker && node --test tests/edit-resend.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=4bc6a0e42828c223f347428ec10019794e70fc9dde24881167df4c0a4e8a1236; output-bytes=1333

- [ ] G23: A failed run can be stopped and run again from the workspace, without retyping
    CHECK: cd apps/web && node --test tests/retry-run.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=e53747d; tree=dirty; EXPECT=matched; output-sha256=b5f7b8dd1e9e38a26acee9dcfc2f4135b4014d3eb15fced5bfe35ab4b055335f; output-bytes=1018

- [ ] G24: An unsent message survives a reload, stays with its own project, never breaks the composer, and does not outlive the session that wrote it
    CHECK: cd apps/web && node --test tests/draft.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=e53747d; tree=dirty; EXPECT=matched; output-sha256=54f08e9139ced928046d7ff7754247203cabfc0c54d60c573f857a4fe68e944c; output-bytes=1405

- [ ] G26: What Apple believes is visible and correctable, and a correction reaches the copy the agent reads
    CHECK: cd apps/worker && node --test tests/memory.test.mjs
    EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=e53747d; tree=dirty; EXPECT=matched; output-sha256=4f198c34edd334b3db55fdda0571a8be67485acfc0c43ea90b0c4d1426d0b807; output-bytes=2148

## §6 oracle repair — the checks on the checkers

These gate the machinery every other gate depends on. Until they are green and red-first, no
ledger row means anything: `--reverify` was a silent no-op, so the first clause of the terminal
condition was vacuously satisfiable, and every EXPECT of `fail 0` was satisfiable by deleting the
test it gated.

- [x] G-ORACLE-1: The gate checker rejects an unknown flag, re-verifies fingerprints, and refuses evidence with no falsification
    CHECK: node scripts/assert-tests.mjs --floor 40 --label G-ORACLE-1 -- node --test tests/gate-check.test.mjs
    EXPECT: G-ORACLE-1 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-ORACLE-1; path=6765c31f4f12/53 entries; git-sha=30cda94; tree-clean=yes; break-sha=30cda94; EXPECT=unmatched; output-sha256=bea460253666d1ea3731f8cf65159556b5645376ba32c20e99fa758e575157f3; output-bytes=14772; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T16:47:32.181Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=4c8a015; tree-clean=yes; EXPECT=matched; output-sha256=cd32a979804433a7630498ab875c6aae088358b8add724d9b873bf54e739312b; output-bytes=3966; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T17:07:51.660Z

- [x] G-CRITIC-1: The visual critic cannot report a clean build for checks it never ran
    CHECK: node scripts/assert-tests.mjs --floor 50 --label G-CRITIC-1 -- node --test packages/evals/src/critic.test.mjs
    EXPECT: G-CRITIC-1 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-CRITIC-1; path=6765c31f4f12/53 entries; git-sha=a50e9d2; tree-clean=yes; break-sha=a50e9d2; EXPECT=unmatched; output-sha256=3745eb009d97881431b99e95b72fa8cb52fbef90ce95cf085d30eb6f1458ad02; output-bytes=35158; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T17:08:06.941Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e0ba958; tree-clean=yes; EXPECT=matched; output-sha256=5d9b92dadbc0f4e93ff52ea87c6b5e135761abdf0344d5f5450b2081810feaa8; output-bytes=5576; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T17:08:13.006Z

- [ ] G-ORACLE-2: The escape-hatch checker catches every cheap way to buy a green signal
    CHECK: node scripts/assert-tests.mjs --floor 20 --label G-ORACLE-2 -- node --test tests/check-escape-hatches.test.mjs
    EXPECT: G-ORACLE-2 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-ORACLE-2; path=6765c31f4f12/53 entries; git-sha=61768ab; tree-clean=yes; break-sha=61768ab; EXPECT=unmatched; output-sha256=8eef22c1a5d2c10adbd2db4604bb1541dffdfea51fa3c7193b3849eabdd10f8a; output-bytes=14354; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T17:10:18.358Z

---

## Whole-product gates

- [ ] G90: The full suite passes
    CHECK: node scripts/gate-suite.mjs
    EXPECT: SUITE GREEN
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=ae718dd1544d455f122ae28e52d73a7255bf0801651cb838823775fd8dfb175a; output-bytes=45

- [ ] G91: Every package typechecks
    CHECK: node scripts/gate-typecheck.mjs
    EXPECT: TYPECHECK CLEAN
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=a24e96ebf42e216f24b6a8156c34e4ccfc9fd4bbbabd2e6589cc8769d9da1900; output-bytes=31

- [ ] G92: The landing and site E2E pass in every viewport
    CHECK: npx playwright test tests/e2e/landing.spec.ts --reporter=line
    EXPECT: 54 passed
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=4372e08d737d268c5cdab3285675d4d0f75cb9795c538d65388058500cefeeb8; output-bytes=5650

---

## Evidence — measured 2026-09-14, not asserted

**There is no tally here on purpose.** A number written in prose drifts from the checkboxes above
it silently, and a reader trusts the sentence over counting thirty boxes. This one did: it said
*26 gates, 26 met* over a file that held 30, all ticked. The count is now DERIVED, and
`gate-check.mjs --lint` fails if any sentence in this file disagrees with the boxes:

```
node scripts/gate-check.mjs --reverify GATES.md    # the only answer that counts
```

**What the first real `--reverify` found.** Until pass 1, `gate-check.mjs` parsed its flags with
`args.includes()`, so `--reverify` — the first command of the verification block — fell through to
an ordinary verify and printed a green summary. Every pass that believed it had re-verified
fingerprints had done nothing of the kind. Unknown flags now exit 2, and `--reverify` re-executes
every gate, recomputes each fingerprint, and clears the checkbox of any gate that does not
reproduce, carries no `FALSIFIED:` record, was recorded against a dirty tree, or names a path git
does not track.

Run against this ledger for the first time, it cleared every box. That is not a regression in the
product: it is the first time these gates have been measured by a checker that could say no. Thirty
of them have never been observed FAILING, so nothing establishes that they can fail — which is what
the red-first back-fill in §6.2 of `docs/MISSION-PROMPT.md` exists to repair, one gate at a time.

Each evidence line now carries two fields the hand-written ones never did — `git=` and `tree=` —
because evidence that does not name the commit it measured, or admit that the tree was dirty, is a
number without a subject.

Whole-product gates as executed by the checker:

| gate | measured |
|---|---|
| G90 suite | `SUITE GREEN` — 2,063 passed, 0 failed |
| G91 typecheck | `TYPECHECK CLEAN` — 0 TS errors |
| G92 landing E2E | `54 passed` across desktop, laptop and mobile viewports |

The suite oracle is success-only by construction: grepping for `fail 0` would match a run where five
packages pass and one fails, so `scripts/gate-suite.mjs` sums every `fail N` and requires the total
to be zero as well as a zero exit. Proven able to fail: it reported `SUITE RED` on
`security.test.mjs` before that gate was closed.

**And it was not the whole suite.** `pnpm -r test` recurses over workspace MEMBERS, so tests at the
repository root were in no member and ran nowhere — including `tests/gate-check.test.mjs`, the test
of the program that decides whether every gate here is met. `gate-suite.mjs` now runs and sums both,
CI runs both, and a deliberately failing root test was confirmed to turn the suite `SUITE RED`.

`gate-check.mjs --lint` executes nothing and checks this file's SHAPE in seconds — no duplicate gate
ids, every gate falsifiable, no box ticked without evidence beneath it, and no box ticked ABOVE
evidence that records a failure. It runs in CI on every push, because every defect found in this
ledger so far has been a shape defect rather than a failing command. It has already caught two: the
missing checker, and two sessions appending a `G19` within minutes of each other.

## Handoffs — blocked on the owner, deliberately not gated

- `A1` Creator Store distribution is off, so nobody can install the plugin. Owner deferred.
- `A2` The shipped plugin artifact is VERSION 0.1.0 and predates 3D generation. Owner deferred.
- `C2` Generated geometry cannot persist as a Roblox asset. Needs an upload-route decision.
- Hosted LoRA serving: only `gemma-7b-it-lora` and `llama-2-7b-chat-hf-lora` accept an adapter, and
  both are weaker than the model production runs. Recorded in `docs/audit/TRAINING-V1-REPORT.md`.
