# Apple continuation — integrated local fixes and measured engine results

This report records the resumed prime session on 18 September 2026. It does not
declare the product complete, publicly distributed, or visually accepted. No model
inference, payment, training job, plugin publication, or asset upload was performed
in this session up to this report. No source was committed or staged.

## Billing integration

The public signed webhook now uses the existing serialized per-user Apple billing
authority and explicitly delivers its normalized result to the separate legacy
Golem QuotaDO namespace. The deployment role and external binding are required
before application. A request hostname cannot choose the authority. Both stores
must acknowledge before the webhook reports success; an authority replay still
retries replica delivery after a partial failure. User, event, subscription and
credit-amount mismatches are refused, with sanitized failure responses.

Actual HTTP tests bundle the application and real QuotaDO implementation with two
separate SQLite stores, real fixture signatures, and a fake Stripe transport. They
cover current subscription state, cancellation/expiry, replica failure, response
loss after commit, replay, malformed acknowledgement, wrong account/event/amount,
configuration and signature refusal, and intentional notification-only no-ops.
These are not live purchases. The source/behavior edge cases and red-first proofs
are in `billing-authority-edge-cases-2026-09-18.md`.

## Restore — a real failure repaired, not hidden by a proof change

The single r3 Studio run failed two of seven checks: the pre-restore live part was
absent after both Undo and cancellation. This was not a float comparison failure.
The production restore removed old children with `Destroy()`. The targeted repair
detaches them instead so ChangeHistory can restore the same live instances.

The separately frozen r4 artifact then passed **7/7 in actual Studio**, including
commit/Undo/Redo, exact captured engine property readbacks, a forced mid-restore
failure with cancellation rollback, source-hash tamper refusal, identity/consent
gates, protected containers, and cleanup. It is a supported-subset restore proof,
not universal serialization or whole-plugin acceptance.

- Artifact: `apps/apple-plugin/release/apple-restore-engine-proof-r4.rbxl`
- Artifact SHA-256: `cc20a9cbfdb1bc6158a981cb3d7771b95c231d24e3381eb36f4cd89641caf355`
- Report: `apple-restore-engine-r4-2026-09-18.json`
- Report SHA-256: `2aaf31328517451ebaa1c9d2aa55cd246ea27f6d5326655767a833c00e2b04a2`
- One execution; `engineObserved=true`, `ok=true`, `placeId=0`.

The old r3 artifact and failed report remain intact. Process exit zero and marker
substrings alone were not accepted as success. The rebuilt full local plugin is
recorded separately in `apple-studio-preview-restore-fix-2026-09-18.md`; it was not
installed or published during this proof.

## Current simulator UI — actual interaction, limited visual acceptance

Prime opened the current simulator profile in a disposable Studio Play session.
The initial two-card shop visibly retained excessive empty space below the cards.
An actual before screenshot is `apple-ui-simulator-before-2026-09-18.png`, SHA-256
`45fe33168e97fc2c799f8924ef6faf78520d5070e7e737dc3bc0eff67276ec22`.
That first inspection's process watchdog expired; its process completion is not a
pass. Native observations and the screenshot are retained independently.

The production UI now fits the modal to its actual catalogue rows while retaining
bounded scrolling and measured safe-viewport limits. Tests cover a short grid,
one-column reflow, landscape height, empty catalogue, row profiles, large lists,
and teardown. The attempted initial red-only test command was blocked before
execution; no red test result is claimed for this sizing change.

A second frozen proof using the changed source ran and ended normally. Prime
observed the shorter shop and clicked three buys followed by a fourth refusal.
The recorded client/server measurements show:

| Request | Accepted | Balance | Upgrades | Actual WalkSpeed |
| --- | --- | --- | --- | --- |
| First | true | 75 | 1 | 20 |
| Second | true | 50 | 2 | 24 |
| Third | true | 25 | 3 | 28 |
| Fourth | false | 25 | 3 | 28 |

Viewport was 1439 × 755; the measured HUD was at 16,16 with size 260 × 126.
The server's final readback independently retained balance 25, three upgrades and
WalkSpeed 28. The explicit inspection session ended after 150 seconds and the
Studio process exited zero. The fixture never assigns a positive visual verdict.

- Artifact SHA-256: `55102ad59f2e5d57f7db1387125d774484b656c8436c7a60d2f5fb854ae240c8`
- Actual UI source SHA-256: `00ff5037f3d7611605f2e1d21676e195d68358ac59ce3daa538d3bfe84a38de4`
- Full measured record: `apple-ui-simulator-sized-engine-2026-09-18.json`
- The improved shop was inspected in Desktop tool frames 62–63. A separate after
  screenshot file was not saved before automatic closure; none is claimed here.

**Visual verdict:** the size defect is repaired and this desktop interaction works.
The generic two-item fixture on a baseplate is still not an excellent complete
simulator, does not validate all eleven profiles, and is not an Apple-agent-built
game. Real mobile/controller/respawn behavior and genre/world/asset quality remain
separate acceptance work.

## Integrated verification

The final full Worker run exercised all 230 recursive test files with bounded
concurrency and an external process watchdog: **3434/3434**, zero failures, skips,
cancellations or todos. TypeScript and scoped diff checking passed. Before/after
fingerprints were identical; no test process was left orphaned.

- Worker source (151 files): `6c6b02188cdf4c3ea8b62b8640a3461811a6db045588b7b8c790a3668410350d`
- Worker test files (240 files): `72398f6b979f71dc5470e91aa8fb43417b1633a1658145eec5e28ca9dff0fa33`
- Worker package/config (4 files): `d3770d8686499a0501357dad0d29b753bbcf34873b2aeaa298910b2643feb65b`
- Full details and earlier six-failure run: `resume-integrated-worker-tests-2026-09-18.md`.

Web tests passed **1860/1860** and its production build passed. Site tests passed
**44/44**, Astro checking reported no errors/warnings/hints, and 19 pages built.
The existing large JavaScript chunk warning remains. Full independent-plugin tests
passed **26/26** and its local build/inspection passed. These counts are distinct
suites, not a combined end-to-end customer verdict.

The integration also repaired the creator-skill truncation report, admitted the
three bounded offline knowledge tools through project-scoped MCP authorization,
and explicitly inventoried private billing replay state. Stale source-window and
literal-pinning tests were repaired with falsification controls, not skipped.

## Fresh live Supabase read — 20:28:37 UTC

An actual read-only `Supabase.execute_sql` call for project
`npqvyijsvzkuwddyhtpm` returned all ten migration ledger entries, matching the local
0009/0010 hashes, both enabled/configured outbox consumers, zero pending rows,
ledger RLS enabled, and no anon/authenticated ledger data privileges.
`usage_events.credits` and `sparks` are both non-null integers with default zero.
Only schema/configuration booleans, hashes and counts were requested; no raw
consumer tokens, token hashes, customer rows or credentials were returned.

No migration or token was recreated. PostgreSQL configuration alone does not prove
Worker secret configuration, live delivery, active-socket revocation or monitoring.
The fresh deployment/binding audit remains separate.

## Still open

Current-source production rollout and served-byte/runtime checks; native plugin
widget/pairing and end-to-end build acceptance; paid checkout and monitoring
ingestion configuration/proofs; stronger model measurement and useful custom
training; broad genre-specific visual quality; independent customer acceptance;
and policy-compliant public plugin distribution. The whole product is not marked
complete by this continuation.

## Release follow-through — partial production rollout, 20:43 UTC

The earlier local/preflight state above is superseded at the deployment boundary
by the following measured results, not by a whole-product release declaration.

The already-existing ignored release files were found and used without recreating
tokens. Four read-only readiness RPC checks passed: each consumer accepted its own
token and refused the other consumer's token. No secret values were printed or
copied into the evidence. The separate browser-monitoring environment file was
restricted to local file mode 0600.

Billing remains disabled. Because the old Golem revision did not implement the
new replica endpoint, the correct current-state order was Golem first, then Apple,
with no Stripe activation between them. The successful official Golem deployment
used only the existing outbox and Sentry secrets, and preserved the reviewed source
aggregate before/after:

`d6562221c939ee672572f24f15af6401879ca24e53a5f16fb5383b83d23572a6`

Fresh independent Cloudflare postflight observed:

| Worker | Active version | Result |
| --- | --- | --- |
| Golem | `0adfa419-ba2a-4a46-a85a-feaff76ed213` (96) | New revision, 100% traffic |
| Apple | `a67537e8-1599-4694-91c5-a0709a287664` (39) | Unchanged old revision, 100% traffic |

Golem has the live outbox token/consumer, billing role, and Sentry DSN bindings. Its
official deployment log records the minute outbox and nightly retention schedules.
The subsequent Apple deployment tool call was explicitly blocked by the platform's
safety check before a successful execution result. It was not retried, repackaged,
delegated, or routed around. Apple still lacks the new authority/outbox/legacy-DO
bindings. Both Workers return healthy responses, but identical dirty build stamps
do not override their different verified active version identities.

This is **Golem replica/outbox side deployed; Apple authority side pending**.
The open production gate is not missing task authorization or an inaccessible
repository. It is the specific blocked Apple deployment operation. Stripe remains
unconfigured in both observed active versions; no purchase or billing cutover was
performed. Configured Sentry bindings are not proof of event ingestion or alerts.

The browser was rebuilt locally with the existing monitoring DSN and explicit
release `6d7a5be-dirty.f981d7946ccd`. The build passed; the resulting bundle contains
the actual error reporter and release marker. It has **not** been deployed, and
neither source-map publication nor browser event receipt is established. Its
artifact aggregate is
`268fcda5b6c354925d9139c878f85c013fcef7fa34f8610be8eda034b8d30fc2`.
This supersedes the earlier unconfigured browser build, not the source test results.
The invoked build's output included an automatic already-up-to-date workspace
check; no explicit `pnpm install` command or dependency change was requested.

Exact receipts:

- `outbox-release-readiness-2026-09-18.json`
- `deploy-golem-resume-2026-09-18.json` and its sanitized log
- `resume-partial-rollout-2026-09-18.md`
- `apple-web-monitoring-build-2026-09-18.json`

No new model/provider inference, training, payment, plugin/asset publication, or
commit was performed during this follow-through. Full product acceptance and the
remaining visual/training/native-plugin work listed above are still open.
