# Strategic owner lifecycle verification — 2026-09-26

## Measured implementation

The strategic owner uses an explicit Opus configuration and native `/goal`; independent reviewers have a separate lifecycle. Durable state, process birth identities and inherited execution leases reconcile surviving children rather than duplicate them. STOP and canonical pauses cooperate with verified child identities. Retry/backoff is bounded and persisted. Completion requires an explicit candidate receipt, a full-objective audit report and a passing independent acceptance gate; the file check does not verify audit substance.

The first independent technical review found three P1 defects: terminal intent erased by startup publication, relay death before child identity publication, and a legacy builder survivor losing its execution lease. Four regressions failed against the earlier source. The fixes persist terminal intent before any startup pulse, self-publish the agent identity before exec, check canonical controls and inherit the legacy execution lease.

A second review found that an unpublished wrapper could outlast pause grace and revive after canonical reactivation. A further regression covers that sequence. The wrapper now requires its durable child token and refuses a terminal runtime before exec. Final independent read-only review reported no material findings in that delta.

## Verification

`node --test tests/autonomy-owner-lifecycle.test.mjs tests/autonomy-harness.test.mjs tests/owner-autonomy-hooks.test.mjs`: **62 passed, 0 failed, 0 skipped**. These use isolated fake children, including real local SIGKILL/crash windows, and make no paid provider calls. The four earlier regressions were red on the previous source; all five review regressions are green on the repaired source.

Configuration/plist previews were rendered for the approved durable repository. No user LaunchAgent was installed or loaded. CPU supervisor PID35962 was observed alive and was not restarted or duplicated. The latest preceding CI head7739875 passed all six jobs; subsequent CI must be checked after this change.

## Limits and next proof

[Account access evidence](claude-owner-access-2026-09-26.md) records the actual native goal parser recognition and provider refusal: visible Billing Free versus cached CLI Max for the same privately matched account. No actual Opus response was obtained and no API route, purchase or new subscription was used.

Real native goal agency, compaction, process recovery, multi-turn continuation and launchd behavior remain unverified. Keep the preview inactive until existing subscription access works, then prove those boundaries with real evidence. Fake lifecycle tests do not satisfy the full owner objective. F-059/F-064 and 0/3 independent full-product reviews remain open.
