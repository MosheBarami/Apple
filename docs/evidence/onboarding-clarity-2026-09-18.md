# Public onboarding clarity — deployed

Root implemented this release following customer reviews 33–37. This is a documentation and recovery-navigation repair, not completion of billing, public plugin distribution, or custom-model training.

## Changes

- `/docs/connect` states before the steps that public installation is unavailable and these instructions require an existing working plugin. Pairing codes are described as temporary credentials, not as non-sensitive clipboard content.
- `/docs/modes` describes the observed free-account MAX availability notice and preserved draft, rather than promising automatic navigation. It links to Usage explicitly.
- `/status` renders typed, labelled recovery links to installation availability and troubleshooting, instead of plain route strings.
- Privacy summary/details no longer claim checkpoints are readable only by the user while also permitting operator debugging. Export descriptions now distinguish available database records from separate transcripts/checkpoints/files/media/usage, and API-key metadata from secrets. The short summary mentions existing deletion exclusions. Image retention copy was aligned with the already deployed private-image storage behavior. No data access, retention implementation, or export behavior was changed in this release.

Export wording was checked against `apps/worker/src/account-export.ts` (`elsewhere`, table failure/cap reporting) and `user-export.ts` (`api_keys` allowlisted metadata, excluded key hash). This is not a new legal or production security audit.

## Verification

- `pnpm --filter @golem/site build` passed.
- `pnpm --filter @golem/site typecheck`: 33 files, zero errors/warnings/hints.
- `node --test apps/site/tests/ tests/known-issues.test.mjs`: 52/52 passed, including built-output checks and an executed inert-link mutation that the recovery guard rejected.
- `git diff --check` passed.
- Official static deployment uploaded 74 files but correctly exited 3: `/status` served a stale shadowing key. `/status/index.html` matched the build while `/status` did not and `/status.html` was 404.
- Targeted repair used `node infra/deploy-static.mjs --file apps/site/dist/status/index.html /status`, without deleting anything. Subsequent SHA-256 comparisons of all five changed canonical Apple-origin routes matched local built bytes: status, privacy, docs/connect, docs/modes, docs/privacy-and-data. The initial full deploy failure is not described as a clean deployment.
- Chrome visually showed the new connection availability callout above instructions, readable and unclipped. After repair, the status AX tree exposed all three recovery links; clicking Plugin availability reached `/docs/plugin`. No pairing dialog, generation, payment, or Studio action was taken.

Logs: `/tmp/apple-onboarding-site-build.log`, `/tmp/apple-onboarding-site-typecheck.log`, `/tmp/apple-onboarding-tests.log`, `/tmp/apple-onboarding-deploy.log`, `/tmp/apple-onboarding-status-repair.log`, `/tmp/apple-onboarding-live-proof.log`.

## Remaining work and resources

Public plugin installation and paid checkout remain unavailable. Studio engine/UI proof remains unperformed. Asset discovery was criticized again in fresh round 39; round 40 immediately followed. No claim of customer delight or product completion.

No new paid inference, GPU purchase, subscription, or training job. Canonical $20 ledger remains $0.06 allocated / $19.94 unallocated, not invoice-reconciled spending. Latest Codex weekly reading: 94% consumed, 6% remaining. Recomputed checklist coverage remains 59.3% weighted repository coverage (413 done, 511 partial, 203 not found, 73 not planned), not production readiness.
