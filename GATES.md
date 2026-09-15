# GATES — Apple product completion

Every gate states one observable outcome. A gate counts as met only when its `CHECK:` exits zero
and its `EXPECT:` matches. A checked box with no evidence is unmet.

Scope: the engineering-only blockers in `docs/backlog/BLOCKERS.md` §D, plus the highest-value
unbuilt items in `docs/backlog/FEATURES.json`. Owner-blocked items (§A, §B, §C) are out of scope
and are tracked as handoffs, not gates.

---

## Closed in earlier sessions — re-verified here, not assumed

- [x] G1: The render payload cannot crash the workspace
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 7 --label G1 -- node --test src/lib/generative-ui/adapters.test.mjs
    EXPECT: G1 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G1; path=6765c31f4f12/53 entries; git-sha=899069f; tree-clean=yes; break-sha=899069f; EXPECT=unmatched; output-sha256=c7c999c8609f15a4085729693ab4d0235ee666d337264257d1bfe394abdfab1c; output-bytes=1426; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=dca3770ad7fb788cc98c3495; at=2026-09-14T19:06:50.027Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=b3208d6be44b3c6002d07128eabd1dd51cafa058c41ec36093896f2fce6b2b9d; output-bytes=671; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=7; deps-sha=07a71c5bc682a7f2d766544e; at=2026-09-15T00:25:13.582Z
  EXPECT-CHANGE: old=fail 0 new=G1 OK reason=derived-floor-7-measured-7-passing

- [x] G2: Conversation is not routed through the build harness, in English or Hebrew
    CHECK: cd apps/worker && node --test tests/conversational-routing.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G2; path=6765c31f4f12/53 entries; git-sha=fbb9806; tree-clean=yes; break-sha=fbb9806; EXPECT=unmatched; output-sha256=27e0912805306413d3d860b7bc790b0cf5e40077028e54d0908c7ce2cb6ebd23; output-bytes=1726; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=854299834cf2c20410f858f4; at=2026-09-14T17:55:18.854Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=736f18478220b2917291e67b6606e3cef5b9c4db3ef08e0f12b339f97df6561a; output-bytes=593; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=854299834cf2c20410f858f4; at=2026-09-15T00:25:13.570Z

- [x] G3: An idle project stops holding a Durable Object open
    CHECK: cd apps/worker && node --test tests/poll-residency.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G3; path=6765c31f4f12/53 entries; git-sha=3173a92; tree-clean=yes; break-sha=3173a92; EXPECT=unmatched; output-sha256=cbd3baa4bba4cfc82148f1a3cbefe4e25d5d3c6a7b787ec984d4f8b75a7e1c57; output-bytes=1550; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=18005bfa758f00f46425ec3b; at=2026-09-14T17:55:26.351Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=54f1b892b0c3bf99d61f64d6b5fa7e25cce2e871e1db461767b1d9c32ec88815; output-bytes=539; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=18005bfa758f00f46425ec3b; at=2026-09-15T00:25:13.559Z

- [x] G4: The admin spend route can only ratchet down
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 36 --label G4 -- node --test tests/budget-admission.test.mjs
  CHECK-CHANGE: old=cd apps/worker && node --test tests/spend-ratchet.test.mjs new=budget-admission reason=the-old-check-regexed-source-text-and-never-constructed-the-object
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G4; path=6765c31f4f12/53 entries; git-sha=3176b02; tree-clean=yes; break-sha=3176b02; EXPECT=unmatched; output-sha256=54b036ecb6807dc4e7cd4a69d7cc00564c1c37bb487aefcfd0807ae41ecd2820; output-bytes=1839; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=69008038199854508413fb01; at=2026-09-14T21:34:23.889Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=8efbf14a706fa01bfe164f2ade333da8e2ec2c73a4a5e8a4eb2dc440f9d676ac; output-bytes=3020; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=69008038199854508413fb01; at=2026-09-15T00:25:13.547Z
    EXPECT: G4 OK

- [x] G5: A checkpoint restore reports what it actually put back
    CHECK: cd apps/worker && node --test tests/restore-fidelity.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G5; path=6765c31f4f12/53 entries; git-sha=b2e57dc; tree-clean=yes; break-sha=b2e57dc; EXPECT=unmatched; output-sha256=88cdeec0431e38457e7ed6e782acb3e6b67ea449a8c9dd4dd220ea236a997022; output-bytes=4532; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=4ce93b82a015292c07372566; at=2026-09-14T17:57:08.700Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=06afe2a56b33e82f3adf6dc3ebc37e0deff5a8617b83b0fc3ab9a657ac0a26e7; output-bytes=628; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=4ce93b82a015292c07372566; at=2026-09-15T00:25:13.536Z

- [x] G6: Asset provenance survives the step boundary
    CHECK: cd apps/worker && node --test tests/asset-provenance.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G6; path=6765c31f4f12/53 entries; git-sha=85a6bdc; tree-clean=yes; break-sha=85a6bdc; EXPECT=unmatched; output-sha256=18a9b4cd90aa39cd0660fbd144844358fa4675c4e997934adf766c392e766dcd; output-bytes=1466; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=0a443a1a3cda7802f88ec4ec; at=2026-09-14T17:57:12.823Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=d73baf876d31b412cd5ef03ad6a71bb7048bd6b423b167847475224af373886d; output-bytes=555; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=0a443a1a3cda7802f88ec4ec; at=2026-09-15T00:25:13.524Z

- [x] G7: No tool is offered that this deployment cannot run
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 7 --label G7 -- node --test tests/asset-library-gating.test.mjs
    EXPECT: G7 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G7; path=6765c31f4f12/53 entries; git-sha=62536fc; tree-clean=yes; break-sha=62536fc; EXPECT=unmatched; output-sha256=92521bec39b5a983214ecf7765efb425848907052403e7510bfced8f5d16736b; output-bytes=1714; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=340a4123b10fd90a8963033a; at=2026-09-14T18:52:01.460Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=b19fd59a4ceeff4e7f0c28883d3182d1e6b58f972d17dc0b553a9f8b5e3784a7; output-bytes=679; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=340a4123b10fd90a8963033a; at=2026-09-15T00:25:13.512Z
  EXPECT-CHANGE: old=fail 0 new=G7 OK reason=derived-floor-7-measured-7-passing

- [x] G8: Billing refuses an unsigned, forged, stale or tampered webhook
    CHECK: cd apps/worker && node --test tests/billing.test.mjs tests/billing-route.test.mjs
    EXPECT: fail 0
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G8; path=6765c31f4f12/53 entries; git-sha=323f1bc; tree-clean=yes; break-sha=323f1bc; EXPECT=unmatched; output-sha256=60e445bcc8de8f3223964dc6f060510482696bf214db72db377cf8271156c2e5; output-bytes=2153; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=616c838cf664b1dc7e73e217; at=2026-09-14T17:55:17.480Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=3d9b6f6acc5c854d043e6c87e2eaac46d00445ef7e85df5cf9d8a8ae0338832a; output-bytes=1654; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=077a2ceb384e24b324cd0c12; at=2026-09-15T00:25:13.500Z

- [x] G9: The door benchmark separates a correct door from the real broken outputs
    CHECK: cd packages/evals && node ../../scripts/assert-tests.mjs --floor 3 --label G9 -- node --test src/door-benchmark.test.mjs
    EXPECT: G9 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G9; path=6765c31f4f12/53 entries; git-sha=ac2c5f6; tree-clean=yes; break-sha=ac2c5f6; EXPECT=unmatched; output-sha256=ce4dcf7d908279f10fe24d55e097b802bc43365657999884b6ac58fe6fd38ce7; output-bytes=1386; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=1; deps-sha=dca3770ad7fb788cc98c3495; at=2026-09-14T19:06:51.668Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=f975d2e6f2b103c38167e5958032f8d1a48700c5385f06e7c37a2a34aa185917; output-bytes=333; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=13; deps-sha=3e0bdbaabda0d6a40c60c96e; at=2026-09-15T00:25:13.488Z
  EXPECT-CHANGE: old=fail 0 new=G9 OK reason=derived-floor-3-measured-3-passing

- [x] G10: The MLX adapter converts to PEFT with proven delta-W equivalence
    CHECK: cd packages/training && node ../../scripts/assert-tests.mjs --floor 20 --label G10 -- node --test src/mlx-to-peft.test.mjs src/build-dataset.test.mjs
    EXPECT: G10 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G10; path=6765c31f4f12/53 entries; git-sha=eb69314; tree-clean=yes; break-sha=eb69314; EXPECT=unmatched; output-sha256=3cef487ca8e3fe34a880828372ae37778823326f41ea922d09b494eb43bd83f8; output-bytes=1758; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=6; deps-sha=72a42f4c08ace0f10d6072a5; at=2026-09-14T19:06:59.758Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=64c68d77de2e49d0d73be6fb73647ecf36a9ae755efdb5eeadb25908d1ffd730; output-bytes=1488; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=6; deps-sha=2aaf116c9b4c0832a1e558ae; at=2026-09-15T00:25:13.476Z
  EXPECT-CHANGE: old=fail 0 new=G10 OK reason=derived-floor-20-measured-20-passing

---

## Open

- [x] G11: The workspace mirrors correctly in RTL, not just the auth screen
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 4 --label G11 -- node --test tests/rtl-workspace.test.mjs
    EXPECT: G11 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G11; path=6765c31f4f12/53 entries; git-sha=683cdf7; tree-clean=yes; break-sha=683cdf7; EXPECT=unmatched; output-sha256=ee5671b27554dd9b338e3f8bc05c13f9f1899db457bf617c7071fe65ad251416; output-bytes=1376; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=74411d82e7e57151303819cd; at=2026-09-14T18:53:55.594Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=8c14021c05fa90eca8ee096ee75bdc27b6b2c494da902c009173eab7db8976f4; output-bytes=492; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=74411d82e7e57151303819cd; at=2026-09-15T00:25:13.462Z
  EXPECT-CHANGE: old=fail 0 new=G11 OK reason=derived-floor-4-measured-4-passing

- [x] G12: Every user-facing surface has an explicit empty, loading and error state
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 5 --label G12 -- node --test tests/ui-states.test.mjs
    EXPECT: G12 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G12; path=6765c31f4f12/53 entries; git-sha=12fb96d; tree-clean=yes; break-sha=12fb96d; EXPECT=unmatched; output-sha256=2cd9baccee7fce26fb3403c93d574fa61804152e38171d7b9e023610ddbc27a5; output-bytes=1278; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=8f591d9cadb89e13ff15c64a; at=2026-09-14T19:29:07.187Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=5e2e35f4e87cfcb2075f3c833ea8b3fdd29345762a79705fe0e23848ea98056b; output-bytes=511; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=44093a469170583c27215375; at=2026-09-15T00:25:13.446Z
  EXPECT-CHANGE: old=fail 0 new=G12 OK reason=derived-floor-5-measured-5-passing

- [x] G13: A run's cost and context use are visible to the user while it happens
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 6 --label G13 -- node --test tests/run-meters.test.mjs
    EXPECT: G13 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G13; path=6765c31f4f12/53 entries; git-sha=c39a17f; tree-clean=yes; break-sha=c39a17f; EXPECT=unmatched; output-sha256=3b6fa398262474e05f87876a47de6b8ae789c9a61cde4029e28c862f94f09a6e; output-bytes=9618; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=efff751d43ea004adb87f7c3; at=2026-09-14T19:06:08.527Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=eb1ef68b75b9dd6026398150619a7aa8d980b32d81589e1160fa516839348208; output-bytes=1127; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=18183589752bb8ff04949aa3; at=2026-09-15T00:25:13.417Z
  EXPECT-CHANGE: old=fail 0 new=G13 OK reason=derived-floor-6-measured-6-passing

- [x] G14: A conversation export is the whole conversation, and cannot forge its own filename
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 18 --label G14 -- node --test tests/export.test.mjs
    EXPECT: G14 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G14; path=6765c31f4f12/53 entries; git-sha=165b283; tree-clean=yes; break-sha=165b283; EXPECT=unmatched; output-sha256=098f05151491fa8a44e00c57313fac6fb5fc44902d14789c1df4ff74831c9ca8; output-bytes=1663; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=edcf3e1c6ae8be2f1af3380c; at=2026-09-14T18:47:23.853Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=2e4450c5c689bd431467c714c6fa3c1dfaeab6985b76734c7d61eea39f87091f; output-bytes=1477; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=edcf3e1c6ae8be2f1af3380c; at=2026-09-15T00:25:13.405Z
  EXPECT-CHANGE: old=fail 0 new=G14 OK reason=derived-floor-18-measured-18-passing

- [x] G15: A project can be renamed from either surface, and Escape does not save
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 15 --label G15 -- node --test tests/rename-project.test.mjs
    EXPECT: G15 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G15; path=6765c31f4f12/53 entries; git-sha=64fdb97; tree-clean=yes; break-sha=64fdb97; EXPECT=unmatched; output-sha256=61d7ecdfc572a2a6002af46fafd61c63899f3c25d8438f422c578f1ae815583c; output-bytes=944; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=904c2ee18c9d64b85cfc67eb; at=2026-09-14T18:52:06.904Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=ba13bbd374e327b188c851fdf3904a90ccd625d135ac141fabb96f526d7608cf; output-bytes=1141; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=fe930c44ca1c9c2a55a29c48; at=2026-09-15T00:25:13.392Z
  EXPECT-CHANGE: old=fail 0 new=G15 OK reason=derived-floor-15-measured-15-passing

- [x] G16: Every action in the product is reachable from the command palette, and the palette is reachable from every signed-in route
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 59 --label G16 -- node --test tests/command-palette.test.mjs tests/command-match.test.mjs tests/shortcuts.test.mjs
    EXPECT: G16 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G16; path=6765c31f4f12/53 entries; git-sha=56b553d; tree-clean=yes; break-sha=56b553d; EXPECT=unmatched; output-sha256=d5591cfbdbc0cad78fb2b5f8b5c4dab7fad521a00d52ec053a7baa15f826fdd4; output-bytes=5146; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=6; deps-sha=ddb21e8a8c27ab6f6b910ab2; at=2026-09-14T19:06:33.059Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=7bbaae6df0cdc8c15da4c98eb58c2546d545273940b415365c20a70a06b47b6a; output-bytes=4232; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=6; deps-sha=ddb21e8a8c27ab6f6b910ab2; at=2026-09-15T00:25:13.380Z
  EXPECT-CHANGE: old=fail 0 new=G16 OK reason=derived-floor-59-measured-59-passing

- [x] G17: The palette puts the command you meant first, and lists each one once
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 26 --label G17 -- node --test tests/command-match.test.mjs
    EXPECT: G17 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G17; path=6765c31f4f12/53 entries; git-sha=a8f668a; tree-clean=yes; break-sha=a8f668a; EXPECT=unmatched; output-sha256=9ca82f29faa7dce01d935b6c720301f0918bedbf347e505072c1a8b3a4f850ce; output-bytes=968; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=76e5123a3f930d4f96e1ad98; at=2026-09-14T19:06:16.516Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=115eda219ebf90f584d8a4175d32540807991bd3f58ea3a5f9618aa213897d78; output-bytes=1909; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=d5b06eef0dc2de4ff25defa0; at=2026-09-15T00:25:13.368Z
  EXPECT-CHANGE: old=fail 0 new=G17 OK reason=derived-floor-26-measured-26-passing

- [x] G18: One keyboard map, with no chord claimed twice and none stolen from the browser
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 18 --label G18 -- node --test tests/shortcuts.test.mjs
    EXPECT: G18 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G18; path=6765c31f4f12/53 entries; git-sha=93b721a; tree-clean=yes; break-sha=93b721a; EXPECT=unmatched; output-sha256=a8b2d8a325916c7b0083f3b84d85e1adc60f03540fe8c298a9f7ee375d1aca40; output-bytes=22189; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=7c1068911d5f6bd741ca6405; at=2026-09-14T19:06:14.850Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=cc38aeef3a9d4d712773a1c5a1fa9948fa0e3063ffd5e9dbebc7788c2e44375d; output-bytes=1340; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=7c1068911d5f6bd741ca6405; at=2026-09-15T00:25:13.355Z
  EXPECT-CHANGE: old=fail 0 new=G18 OK reason=derived-floor-18-measured-18-passing

- [x] G19: Search reads every message, and its results cannot be stale or mis-highlighted
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 25 --label G19 -- node --test tests/search.test.mjs
    EXPECT: G19 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G19; path=6765c31f4f12/53 entries; git-sha=f79bfe6; tree-clean=yes; break-sha=f79bfe6; EXPECT=unmatched; output-sha256=9c7223eb0e6110283e99526cd04756d0bf66c3dd1fd255a82e9223676d796b2b; output-bytes=1664; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=3c1faa07adcbc2d0fdaa0da7; at=2026-09-14T18:47:27.862Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=f76629f5afd566db5cb5e863148fe4ddc36f40cd5e151c2e5798977fb917bb62; output-bytes=1884; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=3c1faa07adcbc2d0fdaa0da7; at=2026-09-15T00:25:13.343Z
  EXPECT-CHANGE: old=fail 0 new=G19 OK reason=derived-floor-25-measured-25-passing

- [x] G20: The search panel names every state and drops responses for a query the user has moved past
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 17 --label G20 -- node --test tests/search-panel.test.mjs
    EXPECT: G20 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G20; path=6765c31f4f12/53 entries; git-sha=811ac75; tree-clean=yes; break-sha=811ac75; EXPECT=unmatched; output-sha256=d6d26c576dcf95a47df9e0490aad33d8d89b93b4c65991aec3e60b28f3c3dfe1; output-bytes=22068; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=c3f763068680902f8daf853f; at=2026-09-14T19:05:50.520Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=ff7aea6bdb815b01c5bc1768d017b215e280f303b6152015cc508f6b4a076bf5; output-bytes=1359; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=c3f763068680902f8daf853f; at=2026-09-15T00:25:13.331Z
  EXPECT-CHANGE: old=fail 0 new=G20 OK reason=derived-floor-17-measured-17-passing

- [x] G21: Archiving hides a project everywhere and loses nothing, and restoring brings it all back
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 15 --label G21 -- node --test tests/archive.test.mjs
    EXPECT: G21 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G21; path=6765c31f4f12/53 entries; git-sha=bfaa9b6; tree-clean=yes; break-sha=bfaa9b6; EXPECT=unmatched; output-sha256=f2dfff0201ee698be8a843951a3e07fd8f8b292bd5e8a4e5afe395a7f9285e58; output-bytes=923; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=a5e275b486836ce8bb8ba3ab; at=2026-09-14T18:47:32.909Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=d97548f91dc9bbc64e6b8ce4ac4637fea48681b56aa9647edb7e176427abb39d; output-bytes=1208; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=8f594881071fb0d0b6029566; at=2026-09-15T00:25:13.319Z
  EXPECT-CHANGE: old=fail 0 new=G21 OK reason=derived-floor-15-measured-15-passing

- [x] G81: A package cannot silently fall out of `pnpm -r test`, and the checker that says so is itself checked
    CHECK: node scripts/assert-tests.mjs --floor 12 --label G81 -- node --test tests/workspace-coverage.test.mjs
    EXPECT: G81 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G81; path=6765c31f4f12/53 entries; git-sha=83561ea; tree-clean=yes; break-sha=83561ea; EXPECT=unmatched; output-sha256=230277763c442fda5087d3d10ffcfab1475721d517cba65109a59d74dd477e8e; output-bytes=15000; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=82354b912d237878efb67a2c; at=2026-09-14T18:52:20.000Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=0cd0cfd2e841d2c72e94fe144106b9a2fb10437ddce741a1e2114ffab66ceb90; output-bytes=1094; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=a9e78e7d99e826e381715f1b; at=2026-09-15T00:25:13.307Z
  EXPECT-CHANGE: old=fail 0 new=G81 OK reason=derived-floor-12-measured-12-passing

<!-- G80+ gates the verification machinery itself, kept clear of the G1..G79 feature range so two
     sessions appending gates at the same time cannot collide on a number. Two did, twice, on the
     same afternoon; gate-check.mjs now refuses a ledger with duplicate ids. -->

- [x] G80: The gate checker itself is measured, and cannot report green over a gate that fails
    CHECK: node scripts/assert-tests.mjs --floor 60 --label G80 -- node --test tests/gate-check.test.mjs
    EXPECT: G80 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G80; path=6765c31f4f12/53 entries; git-sha=0f63a44; tree-clean=yes; break-sha=0f63a44; EXPECT=unmatched; output-sha256=eb28cdad4ca98e832f0749e688ce658be421f8680fdb19d3a32b4c6bce732208; output-bytes=10953; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=2744b3ba51d2f9dcd5722de2; at=2026-09-14T18:48:40.482Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=60af86523fd4a20234f0c58ee157eb5bc2368710b7ba3ceb8266e0892fd24c3d; output-bytes=5411; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=727b6dc292932e63862993a8; at=2026-09-15T00:25:13.296Z
  EXPECT-CHANGE: old=fail 0 new=G80 OK reason=derived-floor-60-measured-60-passing

- [x] G22: Editing a prompt refuses before it destroys, and says what it does not undo
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 18 --label G22 -- node --test tests/edit-resend.test.mjs
    EXPECT: G22 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G22; path=6765c31f4f12/53 entries; git-sha=b59682e; tree-clean=yes; break-sha=b59682e; EXPECT=unmatched; output-sha256=d49a075ee98b4cdf8797d3d530b6b7194a565651a07164355fafb8735519a037; output-bytes=9378; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=a8781dee10cb11c747a6c947; at=2026-09-14T19:05:54.606Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=219c0e2d49f67dbbe59c729fd8e0b58773339f99b86389ce957a2d42b56749c3; output-bytes=1350; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=a8781dee10cb11c747a6c947; at=2026-09-15T00:25:13.284Z
  EXPECT-CHANGE: old=fail 0 new=G22 OK reason=derived-floor-18-measured-18-passing

- [x] G23: A failed run can be stopped and run again from the workspace, without retyping
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 13 --label G23 -- node --test tests/retry-run.test.mjs
    EXPECT: G23 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G23; path=6765c31f4f12/53 entries; git-sha=3f0de27; tree-clean=yes; break-sha=3f0de27; EXPECT=unmatched; output-sha256=9a11a64f28acc510fd523a9f008b4af8498710a7fde05e04c32444e7b13114ff; output-bytes=21433; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=de09c5affe12a4db865b3877; at=2026-09-14T18:54:13.670Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=d85115a1b318f77b174491092d69d7bd040f80b8514f59157fae28073548c4f8; output-bytes=1032; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=de09c5affe12a4db865b3877; at=2026-09-15T00:25:13.272Z
  EXPECT-CHANGE: old=fail 0 new=G23 OK reason=derived-floor-13-measured-13-passing

- [x] G24: An unsent message survives a reload, stays with its own project, never breaks the composer, and does not outlive the session that wrote it
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 20 --label G24 -- node --test tests/draft.test.mjs
    EXPECT: G24 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G24; path=6765c31f4f12/53 entries; git-sha=f2d4bef; tree-clean=yes; break-sha=f2d4bef; EXPECT=unmatched; output-sha256=b24ce861a9da7bf310a648ff384ec78a9f5470079d513c81725a6bea532fec74; output-bytes=11275; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=20c202fe5853d3bbc991f6a9; at=2026-09-14T18:47:29.384Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=9f411f2345cc4ae986b1335e51f5911d92ea7008ff235d3c143a0a79ef7f070e; output-bytes=1419; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=b684c34f06c0ea84af04c574; at=2026-09-15T00:25:13.260Z
  EXPECT-CHANGE: old=fail 0 new=G24 OK reason=derived-floor-20-measured-20-passing

- [x] G26: What Apple believes is visible and correctable, and a correction reaches the copy the agent reads
    CHECK: cd apps/worker && node ../../scripts/assert-tests.mjs --floor 29 --label G26 -- node --test tests/memory.test.mjs
    EXPECT: G26 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G26; path=6765c31f4f12/53 entries; git-sha=e30ef66; tree-clean=yes; break-sha=e30ef66; EXPECT=unmatched; output-sha256=4a31710975899e41fca4bcb9e656d691d4d61b205f61dd7d67994fb36143aef3; output-bytes=1664; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=dd60196cedfb574a3cb4e58e; at=2026-09-14T18:52:02.874Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=f9059e8a126952116528f51e7d18c8816f701169fb22a74d9b542af93e9aebe7; output-bytes=2159; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=dd60196cedfb574a3cb4e58e; at=2026-09-15T00:25:13.247Z
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
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=c533a7b1c4b67ae5cfbcdc1036d2d7c8cb154a34ae5d61d42bc7293f6d48d016; output-bytes=5411; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=727b6dc292932e63862993a8; at=2026-09-15T00:25:13.234Z

- [x] G-CRITIC-1: The visual critic runs on a product path and cannot report a clean build for checks it never ran
    STATION: S7
    CHECK: node scripts/assert-tests.mjs --floor 13 --label G-CRITIC-1 -- node --test apps/worker/tests/critic-wiring.test.mjs
    EXPECT: G-CRITIC-1 OK
  EXPECT-CHANGE: old=critic-wiring.test.mjs-floor-12 new=critic-wiring.test.mjs-floor-13 reason=derived-floor
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-CRITIC-1; path=6765c31f4f12/53 entries; git-sha=ae01cac; tree-clean=yes; break-sha=ae01cac; EXPECT=unmatched; output-sha256=143ac253d82767fe4cbdcc36b3096dc224c8c4818b05a4f896e59fe9b2b6919d; output-bytes=1845; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=2; deps-sha=88bf45437e7bd708867b6d88; at=2026-09-14T17:47:16.380Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=03a3d2a1adda9aabd0b0ddb456cba69cfd3b04cb91faf14d16904839806fd457; output-bytes=1383; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=3f9b08dda13985ff4fdfda14; at=2026-09-15T00:25:13.222Z

- [x] G-ORACLE-2: Every detector in the escape-hatch checker is proven to fail against a planted violation
    CHECK: node scripts/assert-tests.mjs --floor 33 --label G-ORACLE-2 -- node --test tests/check-escape-hatches.test.mjs
    EXPECT: G-ORACLE-2 OK
  EXPECT-CHANGE: old=floor-32 new=floor-33 reason=derived-floor
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-ORACLE-2; path=6765c31f4f12/53 entries; git-sha=61768ab; tree-clean=yes; break-sha=61768ab; EXPECT=unmatched; output-sha256=8eef22c1a5d2c10adbd2db4604bb1541dffdfea51fa3c7193b3849eabdd10f8a; output-bytes=14354; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; at=2026-09-14T17:10:18.358Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=27d62178b729ca00d2907afd602e11b8b44beee5cbcc7ab0f01df711013663b1; output-bytes=2846; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=f42fa7aa0d90d5473c56491d; at=2026-09-15T00:25:13.210Z

- [x] G-ORACLE-3: The offer checker measures the four numbers a plan has to reconcile
    CHECK: node scripts/assert-tests.mjs --floor 10 --label G-ORACLE-3 -- node --test tests/check-offer.test.mjs
    EXPECT: G-ORACLE-3 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=bb950a2; tree-clean=yes; break-sha=bb950a2; EXPECT=unmatched; output-sha256=b0e693611e44be491249feb1d509c916abf43c600bd71898bc61d9ef834ea4fb; output-bytes=2708; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=6; deps-sha=ea1d9269dc458fe65a6c7077; at=2026-09-14T20:21:27.228Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=a31187467c7a29acaf5ca4018fef63f8e085c3f612a369df3329dfa65ff0ed0d; output-bytes=1803; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=6; deps-sha=40851af0fc0cc7900ec2c73b; at=2026-09-15T00:25:13.199Z

- [x] G-CRITIC-2: The critic's rules, evidence gate and adjudication behave as specified
    CHECK: node scripts/assert-tests.mjs --floor 50 --label G-CRITIC-2 -- node --test packages/evals/src/critic.test.mjs
    EXPECT: G-CRITIC-2 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-CRITIC-2; path=6765c31f4f12/53 entries; git-sha=d5ff368; tree-clean=yes; break-sha=d5ff368; EXPECT=unmatched; output-sha256=87668fcc923fa0dbf6e32cbf1e198e3f04abc400d8dcf084c0f4924f8bdc1f74; output-bytes=35162; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=6; deps-sha=840cb7b004c1332a28940755; at=2026-09-14T17:47:21.712Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=4c194efe67925ac74d0fab7f3392b59e3ce328d8931e7d5e9c1dfd9c1e548dda; output-bytes=5587; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=7; deps-sha=e5512dbb298beacf08f9e3b5; at=2026-09-15T00:25:13.187Z

- [x] G-ORACLE-4: Every module nothing reaches carries a disposition, and the checker sees past its own blind spots
    CHECK: node scripts/assert-tests.mjs --floor 13 --label G-ORACLE-4 -- node --test tests/check-deadends.test.mjs
    EXPECT: G-ORACLE-4 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/redfirst-G-ORACLE-4; path=6765c31f4f12/53 entries; git-sha=9e60f65; tree-clean=yes; break-sha=9e60f65; EXPECT=unmatched; output-sha256=d7a766db8e441089bc63819e48bdd0ad52ac0d8482d049f451cfb0a54e3effc7; output-bytes=1968; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=849a707d7e2395fdffe292e6; at=2026-09-14T17:53:27.432Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=0183aaa116510782d3002133ed59fdb98eca47c77d54cf9cd0a434ad088a0893; output-bytes=1073; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=61017c88de5b58016cab9ece; at=2026-09-15T00:25:13.175Z

- [x] G-BACKLOG-1: Every closed backlog row cites something a machine can run
    CHECK: node scripts/check-backlog.mjs --summary --floor-cited 127
    EXPECT: BACKLOG HONEST
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G-BACKLOG-1; path=6765c31f4f12/53 entries; git-sha=f822661; tree-clean=yes; deps-clean=yes; break-sha=f822661; EXPECT=unmatched; output-sha256=4445194edab4518db50eb6bca1ba7e58c623a55d5bc7a4d58eb38fcd736415de; output-bytes=196; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=2d36ee1251b233b5703d6e5b; at=2026-09-14T23:25:50.966Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=76553bef18d4b6390b1419d9262faad085b266cbd5f1a7ad0d9b593ab913c7a3; output-bytes=224; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=89; deps-sha=0cf10d874d5ebd238d449f54; at=2026-09-15T00:25:13.163Z

- [x] G-S1: A stranger's browser gets a page with no Golem, no forbidden promise, and the real free quota
    STATION: S1
    CHECK: node scripts/probe-s1.mjs
  FALSIFIED: exit=2; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G-S1; path=6765c31f4f12/53 entries; git-sha=ce3802e; tree-clean=yes; deps-clean=yes; break-sha=ce3802e; EXPECT=unmatched; output-sha256=f43139ff11a70c96a70db03bd1a94b72865747e834ef1ee1fd7a6aeec9abadd0; output-bytes=334; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=46e07c400de7c6d6b69f0116; at=2026-09-15T05:40:30.742Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=d44316e; tree-clean=no; deps-clean=yes; EXPECT=matched; output-sha256=9ca79bc3064cb32035f1871da24d36382bb3c033165c407ee59af4ef412dd788; output-bytes=360; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=2f40afcd76e7403b27c0a486; at=2026-09-15T05:40:34.562Z
    EXPECT: S1 PROVEN

ORIGIN-SCOPED, UNLIKE EVERY OTHER GATE HERE. G-S1's CHECK reads the DEPLOYED origin, so its
EVIDENCE is a statement about what Cloudflare was serving at that instant, not about this tree.
Two consequences a future reader should not have to infer: a green recorded now stops being true
the moment anyone re-uploads the site, and its FALSIFIED record cannot be reproduced from a git
sha alone, because the break changes the probe while the thing probed lives elsewhere. Raised by
rbxai-04, who ran the probe independently and declined to write the evidence line on the grounds
that the run which records a gate should be the one that proves it.

- [x] G-SEC-1: Two tenants cannot read, write or plant rows in each other's data
    CHECK: node infra/supabase/tests/rls-isolation.mjs
    EXPECT: RLS ISOLATION HOLDS
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G-SEC-1; path=6765c31f4f12/53 entries; git-sha=f062caf; tree-clean=yes; deps-clean=yes; break-sha=f062caf; EXPECT=unmatched; output-sha256=a730b6e9f70f56bd4c4237cba644804455b531bdfb2622be2d24a21d1a7fd831; output-bytes=3227; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=1b24f3adc6d69e02e0b72e13; at=2026-09-15T05:22:52.967Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=3c16f75; tree-clean=no; deps-clean=yes; EXPECT=matched; output-sha256=628fd251f578d90f96e9c0483e4144b7a304eaacc8cc79cc7048b324313058c0; output-bytes=3280; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=1; deps-sha=1b24f3adc6d69e02e0b72e13; at=2026-09-15T05:22:59.934Z

NEEDS DOCKER, and says so rather than skipping. The test applies infra/supabase/migrations/*.sql
in order to a real Postgres, so it proves the MIGRATIONS' policies — not the deployed database,
which may have drifted from them. It exits 2 when no daemon is reachable instead of reporting a
pass over nothing, which is why this row can be red for an environment reason and that is the
correct behaviour. Written by rbxai-04; wired here because GATES.md is mine.

AND IT DOES NOT PROVE THE DEPLOYED DATABASE. Anything configured in the Supabase dashboard rather
than in a migration is invisible to this, and a production database that has drifted from these
files would still let this gate go green. There is no probe anywhere in this repository comparing
the deployed schema against the migrations — G-S1 does that for the site's ORIGIN and nothing does
it for the DATABASE. Recorded in BLOCKERS.md §D, because the hole is hidden by this gate looking
like it covers it.

- [x] G-ORACLE-7: Every pixel rule fires, and the drift rule says which build it compared
    CHECK: node scripts/assert-tests.mjs --floor 12 --label G-ORACLE-7 -- node --test tests/check-pixels.test.mjs
    EXPECT: G-ORACLE-7 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G-ORACLE-7; path=6765c31f4f12/53 entries; git-sha=5f442e6; tree-clean=yes; deps-clean=yes; break-sha=5f442e6; EXPECT=unmatched; output-sha256=c3d757b007c971317e5b6b0140dd0e1a279623f2a0de80e8f44d0d1e012e18fb; output-bytes=9553; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=4; deps-sha=cb8399b8db51ac3c8b15ae72; at=2026-09-15T01:34:12.926Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e66fac3; tree-clean=no; deps-clean=yes; EXPECT=matched; output-sha256=7a26e1723861dd916466b527b560012e48d1ce9823bf082d0c61c3f31cbc356e; output-bytes=1166; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=4; deps-sha=59b947b34fe94897cdd6eb46; at=2026-09-15T05:53:29.014Z

- [x] G-COST-1: The settled run cost is wired from the last charge through to the rendered turn
    CHECK: cd apps/web && node ../../scripts/assert-tests.mjs --floor 12 --label G-COST-1 -- node --test tests/run-meters.test.mjs
    EXPECT: G-COST-1 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G-COST-1; path=6765c31f4f12/53 entries; git-sha=e431dee; tree-clean=yes; deps-clean=yes; break-sha=e431dee; EXPECT=unmatched; output-sha256=2a3cb518db904887cc0c2f10b0760cb010154ae4ac9fe8c9eebb4c9ca6eed171; output-bytes=2150; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=18183589752bb8ff04949aa3; at=2026-09-14T23:42:55.516Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=00b34bae2ae11836f76a357e6d1cd5b27695fc610428fe569c97c441e5f4a0a8; output-bytes=1133; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=18183589752bb8ff04949aa3; at=2026-09-15T00:25:13.148Z

- [x] G-ORACLE-6: Every rule in the backlog checker is proven to fire, and the floor has a control
    CHECK: node scripts/assert-tests.mjs --floor 29 --label G-ORACLE-6 -- node --test tests/check-backlog.test.mjs
    EXPECT: G-ORACLE-6 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G-ORACLE-6; path=6765c31f4f12/53 entries; git-sha=0ad417f; tree-clean=yes; deps-clean=yes; break-sha=0ad417f; EXPECT=unmatched; output-sha256=81af4261000cc4f947e1bca612db3ca165d603387648e9065a7d9c418ade9a79; output-bytes=4305; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=e32fdcb88870ce5d5369834e; at=2026-09-14T23:25:54.622Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=2da3f2d7bb60cca6b96c37b2dae9dacfa4e9e270bb7d7f1305384f32b474350b; output-bytes=2573; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=2; deps-sha=e32fdcb88870ce5d5369834e; at=2026-09-15T00:25:13.137Z

- [x] G-ORACLE-5: Every disposition rule is proven to fire, and every one carries a control
    CHECK: node scripts/assert-tests.mjs --floor 17 --label G-ORACLE-5 -- node --test tests/check-dispositions.test.mjs
    EXPECT: G-ORACLE-5 OK
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G-ORACLE-5; path=6765c31f4f12/53 entries; git-sha=dbb3c2d; tree-clean=yes; break-sha=dbb3c2d; EXPECT=unmatched; output-sha256=e794b7577303bad0a37278f2cb272acd90514b549f64d866f3e84aa2ff91b9f8; output-bytes=2436; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=933ed645b29cea142a3bfaea; at=2026-09-14T20:49:49.710Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=acb0f998e30a53d5706c5d392a7999a7fd4fd4d31d0993cffe09f93db37d203e; output-bytes=1381; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=9721b078dabf71700315a5c1; at=2026-09-15T00:25:13.125Z


- [x] G-OFFER-1: Every plan charges more than it costs to serve, grants no more than the service can deliver, and lets a free user finish one build
    STATION: S1
    CHECK: node scripts/check-offer.mjs
    EXPECT: OFFER COHERENT
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=29018b9; tree-clean=yes; break-sha=29018b9; EXPECT=unmatched; output-sha256=fcebe58a239c5b68fa57a47aec6dd3b5bc655e8207d73817bca996d5a3e1e599; output-bytes=596; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=648cbe8fc366b1efbb1cc5a6; at=2026-09-14T20:20:09.342Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=146e4614a670ec29ec1dbd2599679b12e7909d32b52979200c58f91148ade40d; output-bytes=451; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=4; deps-sha=9679969d1eedfc033dd7b6a5; inputs-sha=3bacd1ea788de80f6ca0807e; at=2026-09-15T00:25:13.113Z

---

## Whole-product gates

- [x] G90: The full suite passes
    CHECK: node scripts/gate-suite.mjs
    EXPECT: SUITE GREEN
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=1cbbd2d; tree-clean=yes; break-sha=1cbbd2d; EXPECT=unmatched; output-sha256=d3ca83a0f1c28c107d19848521978c0fed503026b5dd9621c7b7078b3a626ac6; output-bytes=43; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=224; deps-sha=26ef956a96cd451b185f2c1f; at=2026-09-14T20:29:15.030Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=376fee90deee/55 entries; EXPECT=matched; output-sha256=35181ed01f9275d0e17030aee8053c28de14bf8d35ed8be366ca4c1b38d7f2b4; output-bytes=45

- [x] G91: Every package typechecks
    CHECK: node scripts/gate-typecheck.mjs
    EXPECT: TYPECHECK CLEAN
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI/.claude/worktrees/rf-G91; path=6765c31f4f12/53 entries; git-sha=318ff3e; tree-clean=yes; break-sha=318ff3e; EXPECT=unmatched; output-sha256=1032c62f2d845efa7ab7c2f3f017919e5cd7aa00cd336900e657dfe710a09002; output-bytes=378; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=3; deps-sha=e271e0f8a11de1a04df7a4f5; at=2026-09-14T19:07:26.983Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=a24e96ebf42e216f24b6a8156c34e4ccfc9fd4bbbabd2e6589cc8769d9da1900; output-bytes=31; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=3; deps-sha=0df903344301a299821dbcb4; at=2026-09-15T00:25:13.083Z

- [x] G92: The landing and site E2E pass in every viewport
    CHECK: pnpm --filter @golem/site build >/dev/null && npx playwright test tests/e2e/landing.spec.ts --reporter=dot
    EXPECT: 60 passed
  FALSIFIED: exit=1; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=3a825c0; tree-clean=yes; break-sha=3a825c0; EXPECT=unmatched; output-sha256=c84fc0b7a479215ac47948e34621caeb9e0737ae5c5ff8e41b55429d44f602d8; output-bytes=5408; node=v26.8.1; luau=ABSENT; playwright=Version 1.62.1; deps=4; deps-sha=186d6090e4971af90e4e14fb; at=2026-09-14T20:44:21.540Z
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/moshe/Desktop/RbxAI; path=6765c31f4f12/53 entries; git-sha=e2f019f; tree-clean=yes; deps-clean=yes; EXPECT=matched; output-sha256=0a11c719657228ae440a6bcdb24537f2feb8866775b134991c2d60c50bceed80; output-bytes=189; node=v26.8.1; luau=present; playwright=Version 1.62.1; deps=4; deps-sha=3b6612f08424780a06bbe32c; at=2026-09-15T00:25:13.069Z
  CHECK-CHANGE: old=--reporter=line new=--reporter=dot reason=line-reporter-orders-by-worker-completion-so-output-differed-every-run

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
| G92 landing E2E | `60 passed` across desktop, laptop and mobile viewports |

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
