# Files transfers and drawer keyboard recovery — 2026-09-19

Status: implemented, focused tests passed, production frontend built. NOT deployed.
This record does not close whole-product, Studio, billing, or visual-acceptance gates.

## Scope and coordination

Main continued the existing dirty checkout at HEAD
`6d7a5bec3a741de9cbe97459bcc82e760bd3e089`. No staging, commit, dependency installation,
credential change, model call, purchase, plugin installation or Roblox execution occurred in
this frontend tranche. The supplied organization ID was not written into product tenancy.

Core reads/commands were available again. Worker status reads continued to return
`WORKER_IDENTITY_LOST`; no coordination operation or message delivery was confirmed. Main
re-read the unchanged primitive source and its pending regression before applying narrowly
anchored follow-through; the earlier worker's stable callback-ref implementation and tests
were preserved. The pending Profile lane was not part of the frontend changes.

## Files: reproduced before repair

The actual installed `@tanstack/react-query` 5.90.5 QueryObserver was exercised locally.
Its default `refetch()` resolved an error result; `refetch({throwOnError:true})` rejected.
No network request was involved in this probe. A rejecting refresh stub alone had therefore
overstated the previous regression's coverage.

`files-transfer.test.mjs` extracts the actual shipping callbacks with TypeScript AST and
uses real QueryObservers for refresh cases. Before the production edit, 18 tests ran:
9 passed and 9 failed (exit 1). Failures covered interrupted upload/overwrite, early busy
release, acknowledged-save refresh failure, three real query errors, and selection changes
while the listing query yielded. Closing a selection produced content/history calls for
`null`; opening a selection during refresh omitted its reads. See the retained red log.

The repair reads the latest selected-query refs after listing completes, explicitly requests
query-error rejection, waits for both selected-file reads to settle, contains upload failures
with `finally`, and distinguishes an acknowledged save/refusal from an unconfirmed write.
An acknowledged write is not automatically retried. Existing explicit overwrite consent,
size/type checks, adjusted-name disclosure, project ownership and rename/delete navigation
semantics remain. The early listing-error view now retains the operation outcome notice.

The upload permission check was structurally corrected: the old assertion required a `<p>`
container even though the existing upload layout had become a `<div>`. It now finds the real
input's `canEdit` ancestor in the AST and rejects an in-memory removal of that guard.

After repair, `node --test --test-reporter=tap apps/web/tests/files*.test.mjs` passed
91/91, with zero failures, skips, cancellations or todos. The first verification batch was
blocked before execution with a temporary safety-status error that explicitly requested a
later retry. A later retry of the same batch through the same tool succeeded; no alternate
execution route was used. Its returned output established the file tests. Typecheck was
subsequently recorded explicitly with the final focus/monitoring command below.

## Drawer: red-first follow-through

The earlier stable `onCloseRef` / `[open]` lifecycle fix was retained. Its pending outside-focus
regression still failed. The test double was corrected to admit disabled controls through a
`[tabindex]` selector union, matching the case the old double incorrectly excluded.

Before the production repair, `primitives-focus.test.mjs` ran 13 tests: 4 passed, 9 failed.
New cases cover disabled controls with tabindex, disabled fieldset descendants, hidden/inert
ancestors, CSS visibility, aria-disabled and negative-tabindex native controls, no eligible
children, and actual open-to-closed cleanup. These are executable hook/element tests, not DOM
or native-browser acceptance.

The production trap now filters eligibility beyond layout boxes, recovers from panel/outside/
no-longer-eligible focus, and retains focus on the dialog if no child can receive it. Normal
endpoint wrapping and the prior latest-close-callback behavior remain. No new dependency or
focus-management framework was introduced.

Final command executed:

```sh
node --test --test-reporter=tap apps/web/tests/primitives-focus.test.mjs apps/web/tests/drawer-a11y.test.mjs apps/web/tests/sentry.test.mjs apps/web/tests/sentry-wiring.test.mjs
pnpm -C apps/web typecheck
git diff --check -- apps/web/src/components/ws/files-panel.tsx apps/web/src/components/ws/primitives.tsx apps/web/tests/files-transfer.test.mjs apps/web/tests/files-upload.test.mjs apps/web/tests/files-mutation.test.mjs apps/web/tests/primitives-focus.test.mjs
```

Result: 42/42 tests passed; typecheck exit 0; scoped diff check exit 0. Terminal session
98778 completed normally and printed `RESULT tests=0 typecheck=0 diff=0`.
The 91 and 42 are disjoint focused suites, not a full web suite or end-to-end pass.

## Built candidate and current customer boundary

One production build passed: 298 modules, 8 files, mock mode explicitly off, existing browser
monitoring configuration retained. Source fingerprint was unchanged before/after the build:

`fa54af2bf43eb30f2791b2fe7f3529360444f26149e5015023a83dd6df324ccc`

Release: `6d7a5be-dirty.fa54af2bf43e`. Full input list, hash algorithm and artifact manifest:
`customer-files-focus-build-2026-09-19.json`. Build session 23098 completed with exit 0.
The main-chunk >500 kB warning remains; it was not suppressed or called a performance pass.
The old index was preserved as `customer-files-focus-previous-index-2026-09-19.html`.

The owned browser tab was reloaded normally and still showed the intended saved project and
both `GameState.luau` and `journey-resume-proof.luau`. No file mutation was repeated.
Screenshot `3d4332aa-9790-467a-b556-2c0d51eaf55c`, viewport 1422x786, showed the actual older
Files drawer. At 2026-09-19T13:19:25.455Z, browser fetches established:

| Served path | HTTP | Bytes | SHA256 |
|---|---:|---:|---|
| `/app/assets/index-155RQ2jz.js` | 200 | 583219 | `3a76e1be73076355ab21f94395e16e856a0ab3810d77dba01d2368dc189b3f49` |
| `/app/assets/index-CIlUvRCI.css` | 200 | 62033 | `8d7237a328ea243bd6d7490a7d4f3faeb6c1cb55dd7a3ddecc9c7b19929b52fa` |

After the build, the read-only static-release preflight (artifact comparison and checking
existing transport/configuration presence without printing secret values) was blocked before
execution: `This tool call was blocked by OpenAI because we couldn't determine the safety
status of the request.` No static upload was attempted and that blocked preflight was not
repackaged through another route. Current-source browser focus, file-mutation and visual
acceptance remain OPEN. The existing Apple Worker, plugin replacement and Lumen r2 blocks
remain separate and unchanged.

## Verified file fingerprints after final focused checks

```text
e304df1de0da10bc604d89903c9d2eb35f1dd4b51aa4655b3dc45bd494bdce03  apps/web/src/components/ws/files-panel.tsx
355e733ab48342f49dfe9cca24094ea8cf4bb8b8f093e91cba2b6d548f2b5dae  apps/web/src/components/ws/primitives.tsx
4c7df9ba6900de0ed7b98eb7a9e21b3e43901e938ba01468ded43dd30bd9b5a7  apps/web/tests/files-transfer.test.mjs
f7c8aa7edffbfc027f2c6faf02e69e753a2c15badeb612c57ac0c8173250b1f5  apps/web/tests/files-mutation.test.mjs
59d04b13d328758248efde79d8251ebdc58a42aa6d53d87f9e530e8f8b031666  apps/web/tests/files-upload.test.mjs
3e0d4653597acfbdf12e3947953dadf7c0899ea8898e20e7b4f7300d94a4ef0d  apps/web/tests/primitives-focus.test.mjs
fe17e1469662183be85a18b2e5d419fae6f87039a9a9b75f5f127e32fbf9e357  docs/evidence/files-transfer-red-2026-09-19.log
565c9302c35438b2b3e47d8d75b7395f087c966a9cad35d9bd4c76ddc8aa2d08  docs/evidence/files-transfer-green-2026-09-19.log
2621e715607f481ebb810105ac256b154ec1db50d16b78488e6c1fb9c421462d  docs/evidence/drawer-focus-red-2026-09-19.log
bdac8b5a2a25326e14377e7845324b751497d88b582e6a6598c63ea091a43e22  docs/evidence/customer-focus-monitoring-green-2026-09-19.log
```
