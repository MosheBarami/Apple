# GATES — Apple product completion

Every gate states one observable outcome. A gate counts as met only when its `CHECK:` exits zero
and its `EXPECT:` matches. A checked box with no evidence is unmet.

Scope: the engineering-only blockers in `docs/backlog/BLOCKERS.md` §D, plus the highest-value
unbuilt items in `docs/backlog/FEATURES.json`. Owner-blocked items (§A, §B, §C) are out of scope
and are tracked as handoffs, not gates.

---

## Closed in earlier sessions — re-verified here, not assumed

- [ ] G1: The render payload cannot crash the workspace
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 7 --label G1 -- node --test src/lib/generative-ui/adapters.test.mjs
    EXPECT: G1 OK
  EXPECT-CHANGE: old=fail 0 new=G1 OK reason=derived-floor-7-measured-7-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=e253db45422d0dcc05c8ad0f9ddbeb508c23d69502b562d8ad75c8643554f50f; output-bytes=653

- [x] G2: Conversation is not routed through the build harness, in English or Hebrew
    CHECK: cd apps/worker && node --test tests/conversational-routing.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G2; path=6765c31f4f12/53 entries; git-sha=fbb9806; tree-clean=yes; break-sha=fbb9806; EXPECT=unmatched; output-sha256=27e0912805306413d3d860b7bc790b0cf5e40077028e54d0908c7ce2cb6ebd23; output-bytes=1726; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=854299834cf2c20410f858f4; at=2026-09-14T17:55:18.854Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=3ff955d; tree-clean=yes; EXPECT=matched; output-sha256=736f18478220b2917291e67b6606e3cef5b9c4db3ef08e0f12b339f97df6561a; output-bytes=592; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=854299834cf2c20410f858f4; at=2026-09-14T18:05:46.643Z

- [x] G3: An idle project stops holding a Durable Object open
    CHECK: cd apps/worker && node --test tests/poll-residency.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G3; path=6765c31f4f12/53 entries; git-sha=3173a92; tree-clean=yes; break-sha=3173a92; EXPECT=unmatched; output-sha256=cbd3baa4bba4cfc82148f1a3cbefe4e25d5d3c6a7b787ec984d4f8b75a7e1c57; output-bytes=1550; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=18005bfa758f00f46425ec3b; at=2026-09-14T17:55:26.351Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=3ff955d; tree-clean=yes; EXPECT=matched; output-sha256=54f1b892b0c3bf99d61f64d6b5fa7e25cce2e871e1db461767b1d9c32ec88815; output-bytes=545; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=18005bfa758f00f46425ec3b; at=2026-09-14T18:05:46.642Z

- [x] G4: The admin spend route can only ratchet down
    CHECK: cd apps/worker && node --test tests/spend-ratchet.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G4; path=6765c31f4f12/53 entries; git-sha=1e2bec8; tree-clean=yes; break-sha=1e2bec8; EXPECT=unmatched; output-sha256=cf4252b250ac98ea69b0ff633f031b3263de04090c365203f267b49abb151093; output-bytes=2600; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=893d2ab9f9581a6beb43754c; at=2026-09-14T17:55:10.747Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=3ff955d; tree-clean=yes; EXPECT=matched; output-sha256=334a2e14f52e200add332ec6637cf84932628526c84536a656127a0d117b21f9; output-bytes=381; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=893d2ab9f9581a6beb43754c; at=2026-09-14T18:05:46.642Z

- [x] G5: A checkpoint restore reports what it actually put back
    CHECK: cd apps/worker && node --test tests/restore-fidelity.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G5; path=6765c31f4f12/53 entries; git-sha=b2e57dc; tree-clean=yes; break-sha=b2e57dc; EXPECT=unmatched; output-sha256=88cdeec0431e38457e7ed6e782acb3e6b67ea449a8c9dd4dd220ea236a997022; output-bytes=4532; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=4ce93b82a015292c07372566; at=2026-09-14T17:57:08.700Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=3ff955d; tree-clean=yes; EXPECT=matched; output-sha256=06afe2a56b33e82f3adf6dc3ebc37e0deff5a8617b83b0fc3ab9a657ac0a26e7; output-bytes=626; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=4ce93b82a015292c07372566; at=2026-09-14T18:05:46.642Z

- [x] G6: Asset provenance survives the step boundary
    CHECK: cd apps/worker && node --test tests/asset-provenance.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G6; path=6765c31f4f12/53 entries; git-sha=85a6bdc; tree-clean=yes; break-sha=85a6bdc; EXPECT=unmatched; output-sha256=18a9b4cd90aa39cd0660fbd144844358fa4675c4e997934adf766c392e766dcd; output-bytes=1466; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=0a443a1a3cda7802f88ec4ec; at=2026-09-14T17:57:12.823Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=3ff955d; tree-clean=yes; EXPECT=matched; output-sha256=d73baf876d31b412cd5ef03ad6a71bb7048bd6b423b167847475224af373886d; output-bytes=552; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=0a443a1a3cda7802f88ec4ec; at=2026-09-14T18:05:46.642Z

- [ ] G7: No tool is offered that this deployment cannot run
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 7 --label G7 -- node --test tests/asset-library-gating.test.mjs
    EXPECT: G7 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G7; path=6765c31f4f12/53 entries; git-sha=62536fc; tree-clean=yes; break-sha=62536fc; EXPECT=unmatched; output-sha256=92521bec39b5a983214ecf7765efb425848907052403e7510bfced8f5d16736b; output-bytes=1714; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=340a4123b10fd90a8963033a; at=2026-09-14T18:52:01.460Z
  EXPECT-CHANGE: old=fail 0 new=G7 OK reason=derived-floor-7-measured-7-passing

- [x] G8: Billing refuses an unsigned, forged, stale or tampered webhook
    CHECK: cd apps/worker && node --test tests/billing.test.mjs tests/billing-route.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G8; path=6765c31f4f12/53 entries; git-sha=323f1bc; tree-clean=yes; break-sha=323f1bc; EXPECT=unmatched; output-sha256=60e445bcc8de8f3223964dc6f060510482696bf214db72db377cf8271156c2e5; output-bytes=2153; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=616c838cf664b1dc7e73e217; at=2026-09-14T17:55:17.480Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=3ff955d; tree-clean=yes; EXPECT=matched; output-sha256=3d9b6f6acc5c854d043e6c87e2eaac46d00445ef7e85df5cf9d8a8ae0338832a; output-bytes=1657; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=616c838cf664b1dc7e73e217; at=2026-09-14T18:05:46.641Z

- [ ] G9: The door benchmark separates a correct door from the real broken outputs
    CHECK: cd packages/evals && node ../../scripts/assert-tests.mjs --floor 3 --label G9 -- node --test src/door-benchmark.test.mjs
    EXPECT: G9 OK
  EXPECT-CHANGE: old=fail 0 new=G9 OK reason=derived-floor-3-measured-3-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=46d629f76a5001658f5fef05f66141cccfc4a42191ad5ecea6a8b234e362dfe8; output-bytes=320

- [ ] G10: The MLX adapter converts to PEFT with proven delta-W equivalence
    CHECK: cd packages/training && node ../../scripts/assert-tests.mjs --floor 20 --label G10 -- node --test src/mlx-to-peft.test.mjs src/build-dataset.test.mjs
    EXPECT: G10 OK
  EXPECT-CHANGE: old=fail 0 new=G10 OK reason=derived-floor-20-measured-20-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=a2ef3468e7e2343986db5d48ed296850c9a40cb0660d4d5969cf7b3d74440523; output-bytes=1470

---

## Open

- [ ] G11: The workspace mirrors correctly in RTL, not just the auth screen
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 4 --label G11 -- node --test tests/rtl-workspace.test.mjs
    EXPECT: G11 OK
  EXPECT-CHANGE: old=fail 0 new=G11 OK reason=derived-floor-4-measured-4-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=d89a95842367d0710f1dfd831e5030eea9f9ef1d98dfff09e5c115656a17ef15; output-bytes=476

- [ ] G12: Every user-facing surface has an explicit empty, loading and error state
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 5 --label G12 -- node --test tests/ui-states.test.mjs
    EXPECT: G12 OK
  EXPECT-CHANGE: old=fail 0 new=G12 OK reason=derived-floor-5-measured-5-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=501ee60b3de430a690663b5962fd1f45b829d31318f592321bd3f9c9b3f9071a; output-bytes=489

- [ ] G13: A run's cost and context use are visible to the user while it happens
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 6 --label G13 -- node --test tests/run-meters.test.mjs
    EXPECT: G13 OK
  EXPECT-CHANGE: old=fail 0 new=G13 OK reason=derived-floor-6-measured-6-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=f61d6198e9a1b52479a487e9ba1cda5c31eec5d8caee08f9f3fb248c1956bba5; output-bytes=592

- [x] G14: A conversation export is the whole conversation, and cannot forge its own filename
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 18 --label G14 -- node --test tests/export.test.mjs
    EXPECT: G14 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G14; path=6765c31f4f12/53 entries; git-sha=165b283; tree-clean=yes; break-sha=165b283; EXPECT=unmatched; output-sha256=098f05151491fa8a44e00c57313fac6fb5fc44902d14789c1df4ff74831c9ca8; output-bytes=1663; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=edcf3e1c6ae8be2f1af3380c; at=2026-09-14T18:47:23.853Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=8462c0a; tree-clean=yes; EXPECT=matched; output-sha256=2e4450c5c689bd431467c714c6fa3c1dfaeab6985b76734c7d61eea39f87091f; output-bytes=1476; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=edcf3e1c6ae8be2f1af3380c; at=2026-09-14T18:51:50.037Z
  EXPECT-CHANGE: old=fail 0 new=G14 OK reason=derived-floor-18-measured-18-passing

- [ ] G15: A project can be renamed from either surface, and Escape does not save
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 15 --label G15 -- node --test tests/rename-project.test.mjs
    EXPECT: G15 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G15; path=6765c31f4f12/53 entries; git-sha=64fdb97; tree-clean=yes; break-sha=64fdb97; EXPECT=unmatched; output-sha256=61d7ecdfc572a2a6002af46fafd61c63899f3c25d8438f422c578f1ae815583c; output-bytes=944; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=904c2ee18c9d64b85cfc67eb; at=2026-09-14T18:52:06.904Z
  EXPECT-CHANGE: old=fail 0 new=G15 OK reason=derived-floor-15-measured-15-passing

- [ ] G16: Every action in the product is reachable from the command palette, and the palette is reachable from every signed-in route
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 59 --label G16 -- node --test tests/command-palette.test.mjs tests/command-match.test.mjs tests/shortcuts.test.mjs
    EXPECT: G16 OK
  EXPECT-CHANGE: old=fail 0 new=G16 OK reason=derived-floor-59-measured-59-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=9eef9172bd22f3daf2edebe1656fe09161c5881ace6e207ada05bbcbcce8b429; output-bytes=4219

- [ ] G17: The palette puts the command you meant first, and lists each one once
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 26 --label G17 -- node --test tests/command-match.test.mjs
    EXPECT: G17 OK
  EXPECT-CHANGE: old=fail 0 new=G17 OK reason=derived-floor-26-measured-26-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=8945c1bb1c57a46547481182ca58bac084cebbbd6b092e56209c9907fb6a2666; output-bytes=1891

- [ ] G18: One keyboard map, with no chord claimed twice and none stolen from the browser
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 18 --label G18 -- node --test tests/shortcuts.test.mjs
    EXPECT: G18 OK
  EXPECT-CHANGE: old=fail 0 new=G18 OK reason=derived-floor-18-measured-18-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=311ea7a211e4ba24a7f9488a74bf0a80cf11bd174f3b444d38c2ae7cd43b12a6; output-bytes=1329

- [x] G19: Search reads every message, and its results cannot be stale or mis-highlighted
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 25 --label G19 -- node --test tests/search.test.mjs
    EXPECT: G19 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G19; path=6765c31f4f12/53 entries; git-sha=f79bfe6; tree-clean=yes; break-sha=f79bfe6; EXPECT=unmatched; output-sha256=9c7223eb0e6110283e99526cd04756d0bf66c3dd1fd255a82e9223676d796b2b; output-bytes=1664; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=3c1faa07adcbc2d0fdaa0da7; at=2026-09-14T18:47:27.862Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=8462c0a; tree-clean=yes; EXPECT=matched; output-sha256=f76629f5afd566db5cb5e863148fe4ddc36f40cd5e151c2e5798977fb917bb62; output-bytes=1884; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=3c1faa07adcbc2d0fdaa0da7; at=2026-09-14T18:51:50.037Z
  EXPECT-CHANGE: old=fail 0 new=G19 OK reason=derived-floor-25-measured-25-passing

- [ ] G20: The search panel names every state and drops responses for a query the user has moved past
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 17 --label G20 -- node --test tests/search-panel.test.mjs
    EXPECT: G20 OK
  EXPECT-CHANGE: old=fail 0 new=G20 OK reason=derived-floor-17-measured-17-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=c30700df765c4a778bcd9419e9d2f840fd4f23e727e710545d6b45793d7bffe4; output-bytes=1343

- [x] G21: Archiving hides a project everywhere and loses nothing, and restoring brings it all back
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 15 --label G21 -- node --test tests/archive.test.mjs
    EXPECT: G21 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G21; path=6765c31f4f12/53 entries; git-sha=bfaa9b6; tree-clean=yes; break-sha=bfaa9b6; EXPECT=unmatched; output-sha256=f2dfff0201ee698be8a843951a3e07fd8f8b292bd5e8a4e5afe395a7f9285e58; output-bytes=923; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=a5e275b486836ce8bb8ba3ab; at=2026-09-14T18:47:32.909Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=8462c0a; tree-clean=yes; EXPECT=matched; output-sha256=d97548f91dc9bbc64e6b8ce4ac4637fea48681b56aa9647edb7e176427abb39d; output-bytes=1206; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=8f594881071fb0d0b6029566; at=2026-09-14T18:51:50.037Z
  EXPECT-CHANGE: old=fail 0 new=G21 OK reason=derived-floor-15-measured-15-passing

- [ ] G81: A package cannot silently fall out of `pnpm -r test`, and the checker that says so is itself checked
    CHECK: node scripts/assert-tests.mjs --floor 12 --label G81 -- node --test tests/workspace-coverage.test.mjs
    EXPECT: G81 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G81; path=6765c31f4f12/53 entries; git-sha=83561ea; tree-clean=yes; break-sha=83561ea; EXPECT=unmatched; output-sha256=230277763c442fda5087d3d10ffcfab1475721d517cba65109a59d74dd477e8e; output-bytes=15000; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=82354b912d237878efb67a2c; at=2026-09-14T18:52:20.000Z
  EXPECT-CHANGE: old=fail 0 new=G81 OK reason=derived-floor-12-measured-12-passing

<!-- G80+ gates the verification machinery itself, kept clear of the G1..G79 feature range so two
     sessions appending gates at the same time cannot collide on a number. Two did, twice, on the
     same afternoon; gate-check.mjs now refuses a ledger with duplicate ids. -->

- [x] G80: The gate checker itself is measured, and cannot report green over a gate that fails
    CHECK: node scripts/assert-tests.mjs --floor 60 --label G80 -- node --test tests/gate-check.test.mjs
    EXPECT: G80 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G80; path=6765c31f4f12/53 entries; git-sha=0f63a44; tree-clean=yes; break-sha=0f63a44; EXPECT=unmatched; output-sha256=eb28cdad4ca98e832f0749e688ce658be421f8680fdb19d3a32b4c6bce732208; output-bytes=10953; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=2744b3ba51d2f9dcd5722de2; at=2026-09-14T18:48:40.482Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=8462c0a; tree-clean=yes; EXPECT=matched; output-sha256=0602062226529790ab634dd441722656f0bd8a68e7c30f5278c585aeb9f7eded; output-bytes=5081; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=34a92da96dc325438a2cc579; at=2026-09-14T18:51:50.037Z
  EXPECT-CHANGE: old=fail 0 new=G80 OK reason=derived-floor-60-measured-60-passing

- [ ] G22: Editing a prompt refuses before it destroys, and says what it does not undo
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 18 --label G22 -- node --test tests/edit-resend.test.mjs
    EXPECT: G22 OK
  EXPECT-CHANGE: old=fail 0 new=G22 OK reason=derived-floor-18-measured-18-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=2ba8bd4; tree=dirty; EXPECT=matched; output-sha256=4bc6a0e42828c223f347428ec10019794e70fc9dde24881167df4c0a4e8a1236; output-bytes=1333

- [ ] G23: A failed run can be stopped and run again from the workspace, without retyping
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 13 --label G23 -- node --test tests/retry-run.test.mjs
    EXPECT: G23 OK
  EXPECT-CHANGE: old=fail 0 new=G23 OK reason=derived-floor-13-measured-13-passing
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git=e53747d; tree=dirty; EXPECT=matched; output-sha256=b5f7b8dd1e9e38a26acee9dcfc2f4135b4014d3eb15fced5bfe35ab4b055335f; output-bytes=1018

- [x] G24: An unsent message survives a reload, stays with its own project, never breaks the composer, and does not outlive the session that wrote it
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 20 --label G24 -- node --test tests/draft.test.mjs
    EXPECT: G24 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G24; path=6765c31f4f12/53 entries; git-sha=f2d4bef; tree-clean=yes; break-sha=f2d4bef; EXPECT=unmatched; output-sha256=b24ce861a9da7bf310a648ff384ec78a9f5470079d513c81725a6bea532fec74; output-bytes=11275; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=20c202fe5853d3bbc991f6a9; at=2026-09-14T18:47:29.384Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=8462c0a; tree-clean=yes; EXPECT=matched; output-sha256=9f411f2345cc4ae986b1335e51f5911d92ea7008ff235d3c143a0a79ef7f070e; output-bytes=1418; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=b684c34f06c0ea84af04c574; at=2026-09-14T18:51:50.036Z
  EXPECT-CHANGE: old=fail 0 new=G24 OK reason=derived-floor-20-measured-20-passing

- [ ] G26: What Apple believes is visible and correctable, and a correction reaches the copy the agent reads
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 29 --label G26 -- node --test tests/memory.test.mjs
    EXPECT: G26 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G26; path=6765c31f4f12/53 entries; git-sha=e30ef66; tree-clean=yes; break-sha=e30ef66; EXPECT=unmatched; output-sha256=4a31710975899e41fca4bcb9e656d691d4d61b205f61dd7d67994fb36143aef3; output-bytes=1664; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=dd60196cedfb574a3cb4e58e; at=2026-09-14T18:52:02.874Z
  EXPECT-CHANGE: old=fail 0 new=G26 OK reason=derived-floor-29-measured-29-passing

## §6 oracle repair — the checks on the checkers

These gate the machinery every other gate depends on. Until they are green and red-first, no
ledger row means anything: `--reverify` was a silent no-op, so the first clause of the terminal
condition was vacuously satisfiable, and every EXPECT of `fail 0` was satisfiable by deleting the
test it gated.

- [x] G-ORACLE-1: The gate checker rejects an unknown flag, re-verifies fingerprints, and refuses evidence with no falsification
    CHECK: node scripts/assert-tests.mjs --floor 40 --label G-ORACLE-1 -- node --test tests/gate-check.test.mjs
    EXPECT: G-ORACLE-1 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-ORACLE-1; path=6765c31f4f12/53 entries; git-sha=30cda94; tree-clean=yes; break-sha=30cda94; EXPECT=unmatched; output-sha256=bea460253666d1ea3731f8cf65159556b5645376ba32c20e99fa758e575157f3; output-bytes=14772; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T16:47:32.181Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=7693a2a; tree-clean=yes; EXPECT=matched; output-sha256=89ae3014af0f0293668c5d8dc0181a50e6fd1adf3dd4ed239b492ccba5de5b8c; output-bytes=4982; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=d2d90c792bf985a454fe4aa1; at=2026-09-14T18:40:38.640Z

- [x] G-CRITIC-1: The visual critic runs on a product path and cannot report a clean build for checks it never ran
    STATION: S7
    CHECK: node scripts/assert-tests.mjs --floor 13 --label G-CRITIC-1 -- node --test apps/worker/tests/critic-wiring.test.mjs
    EXPECT: G-CRITIC-1 OK
  EXPECT-CHANGE: old=critic-wiring.test.mjs-floor-12 new=critic-wiring.test.mjs-floor-13 reason=derived-floor
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-CRITIC-1; path=6765c31f4f12/53 entries; git-sha=ae01cac; tree-clean=yes; break-sha=ae01cac; EXPECT=unmatched; output-sha256=143ac253d82767fe4cbdcc36b3096dc224c8c4818b05a4f896e59fe9b2b6919d; output-bytes=1845; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=88bf45437e7bd708867b6d88; at=2026-09-14T17:47:16.380Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=47778cb; tree-clean=yes; EXPECT=matched; output-sha256=d9001e8a110704c2140cee8bd8d77069ff5c97f528bc068e99b4c54bcb7d6df2; output-bytes=1303; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=e2c4b5003f7943fcea7a1e3d; at=2026-09-14T18:31:37.549Z

- [x] G-ORACLE-2: Every detector in the escape-hatch checker is proven to fail against a planted violation
    CHECK: node scripts/assert-tests.mjs --floor 33 --label G-ORACLE-2 -- node --test tests/check-escape-hatches.test.mjs
    EXPECT: G-ORACLE-2 OK
  EXPECT-CHANGE: old=floor-32 new=floor-33 reason=derived-floor
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-ORACLE-2; path=6765c31f4f12/53 entries; git-sha=61768ab; tree-clean=yes; break-sha=61768ab; EXPECT=unmatched; output-sha256=8eef22c1a5d2c10adbd2db4604bb1541dffdfea51fa3c7193b3849eabdd10f8a; output-bytes=14354; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T17:10:18.358Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=7693a2a; tree-clean=yes; EXPECT=matched; output-sha256=2034fd679cc136ca8369f84af39012dfc6313ccb011570fbd0a9dfff18b98c30; output-bytes=2759; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=9f3f199104624ac1807194c8; at=2026-09-14T18:40:38.639Z

- [x] G-ORACLE-3: The offer checker measures the four numbers a plan has to reconcile
    CHECK: node scripts/assert-tests.mjs --floor 10 --label G-ORACLE-3 -- node --test tests/check-offer.test.mjs
    EXPECT: G-ORACLE-3 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-ORACLE-3; path=6765c31f4f12/53 entries; git-sha=e3f864b; tree-clean=yes; break-sha=e3f864b; EXPECT=unmatched; output-sha256=46a50e46a62a8bbd7c13a58ad0eeaf888afd4f4f59e466081c2ae4c312a65975; output-bytes=1390; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T17:12:02.906Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=670a974; tree-clean=yes; EXPECT=matched; output-sha256=1f9cc07b14d6eb4fbc22b13ef4f6d8bb57c63bf9fd840a7bc3f17cb2c18bb5c5; output-bytes=1077; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=5; deps-sha=fc379c2ad2e80a77a98bbadf; at=2026-09-14T17:44:09.024Z

- [x] G-CRITIC-2: The critic's rules, evidence gate and adjudication behave as specified
    CHECK: node scripts/assert-tests.mjs --floor 50 --label G-CRITIC-2 -- node --test packages/evals/src/critic.test.mjs
    EXPECT: G-CRITIC-2 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-CRITIC-2; path=6765c31f4f12/53 entries; git-sha=d5ff368; tree-clean=yes; break-sha=d5ff368; EXPECT=unmatched; output-sha256=87668fcc923fa0dbf6e32cbf1e198e3f04abc400d8dcf084c0f4924f8bdc1f74; output-bytes=35162; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=6; deps-sha=840cb7b004c1332a28940755; at=2026-09-14T17:47:21.712Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=7693a2a; tree-clean=yes; EXPECT=matched; output-sha256=4c194efe67925ac74d0fab7f3392b59e3ce328d8931e7d5e9c1dfd9c1e548dda; output-bytes=5576; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=7; deps-sha=e5512dbb298beacf08f9e3b5; at=2026-09-14T18:40:38.639Z

- [x] G-ORACLE-4: Every module nothing reaches carries a disposition, and the checker sees past its own blind spots
    CHECK: node scripts/assert-tests.mjs --floor 13 --label G-ORACLE-4 -- node --test tests/check-deadends.test.mjs
    EXPECT: G-ORACLE-4 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-ORACLE-4; path=6765c31f4f12/53 entries; git-sha=9e60f65; tree-clean=yes; break-sha=9e60f65; EXPECT=unmatched; output-sha256=d7a766db8e441089bc63819e48bdd0ad52ac0d8482d049f451cfb0a54e3effc7; output-bytes=1968; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=849a707d7e2395fdffe292e6; at=2026-09-14T17:53:27.432Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=7693a2a; tree-clean=yes; EXPECT=matched; output-sha256=0183aaa116510782d3002133ed59fdb98eca47c77d54cf9cd0a434ad088a0893; output-bytes=1074; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=725a1855f9984f9403e8fed3; at=2026-09-14T18:40:38.638Z

- [ ] G-OFFER-1: Every plan charges more than it costs to serve, grants no more than the service can deliver, and lets a free user finish one build
    STATION: S1
    CHECK: node scripts/check-offer.mjs
    EXPECT: OFFER COHERENT

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
