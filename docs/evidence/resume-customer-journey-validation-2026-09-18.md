# Resume customer-journey validation — 2026-09-18

## Scope and customer boundary

This tranche followed the signed-in customer path in the current local source from saved-project
navigation through transcript hydration/reconnect, live progress, stop/retry/edit authority, composer
drafts/uploads/file mentions, and structured artifact rendering. It focused on integration state rather
than visual styling. Main retained ownership of the live browser/Studio/Sentry visual acceptance.

No account was opened or mutated, no private customer data was read, no remote API/database was
written, no provider/model call was made, and nothing was deployed or uploaded. Worker/server/shared
source was not edited in this tranche. The worker3 terminal-history integration consumed here was
identified by these exact current source hashes:

```text
packages/shared/src/index.ts
515142967b50898e610c7d8f0caccab2fdfc4a4ce9b0dd10626a423d2fa054f8

apps/worker/src/do/session.ts
2185e6df046bc6e9e7592ac815d8494a4a84631e0a30e843922812c022dd51ee
```

## Reproduced customer blockers

### 1. Project A state could appear under project B

React Router can reuse the `/projects/:id` route component when only `:id` changes. The old
`WorkspacePage` and `useProjectSocket` retained project-scoped React state while B's history and socket
were opening. A customer navigating A → B could therefore briefly see A's transcript, run/progress,
Studio state, frames/checkpoints, open edit state and related local state under B's URL.

The fix makes the project-owned workspace a child keyed by `projectId`, so A is unmounted before B's
project-owned state renders. In addition, async transport is fenced by project identity and generation:

- history and checkpoint reads receive request tickets and `AbortController`s;
- a newer same-project request invalidates the older request;
- selecting B invalidates every A ticket before callbacks are accepted;
- the WebSocket captures the project it was created for, and open/message/close/send paths refuse a
  socket whose project no longer matches;
- aborting an obsolete read is not reported to global connectivity as a network failure.

The behavioral test uses overlapping deferred A/B reads: B succeeds, then A errors late. Only B is
accepted. A second test proves both history and checkpoint tickets are invalidated by the switch.

### 2. Late transcript hydration could erase live truth

The old transcript merge let REST history win every duplicate message id. That created two races:

1. a history response arriving while the assistant was still streaming could replace the visible
   streamed text/tools with an older durable row;
2. a response arriving just after `msg_end` could erase live-only outcome/context fields.

`mergeHistoryWithLive` now keeps the whole live row while it is streaming. Once terminal, durable
history owns durable content/tool trace while any already-observed optional value is retained when an
older row omitted it. Prompt-derived `intent` remains intentionally live-only.

Worker3 subsequently added bounded terminal persistence to `MessageDto`. The one
`chatItemFromMessageDto` mapper now restores these five optional fields on reload when they are present:

```text
stopReason
error
creditsSpent
context
deniedTools
```

Tests prove a reloaded terminal row carries those values, and that a legacy row with none of the fields
does not acquire an invented success/cost/context/permission result.

### 3. Chat controls were shown before chat authority was known

Project access used to be fetched only when the Files or Members drawer was open. The normal workspace
composer, Edit, Retry and Stop therefore behaved as though the person could chat before the shared
access answer existed. WebSocket `send()` can succeed locally even when SessionDO later refuses that
member. The composer then treated the local send as accepted and could clear a draft/files; Edit could
also truncate local transcript optimistically before the refusal arrived.

The workspace now resolves its one project-access query as part of opening the project. The `chat`
capability gates:

- Send;
- Edit / edit confirmation;
- Retry / Regenerate;
- Stop in the composer and command palette.

Loading, unavailable and denied access all fail closed. Refused Send/Edit report that the draft/edit is
kept and return before the composer or transcript performs the destructive optimistic path. FilesPanel
itself remains lazy; only the small shared access read moved to workspace load.

### 4. Composer uploads and file mentions were not project-owned

Staged rows, `File` objects, abort controllers and the file-mention cache survived a project-id change
inside the composer. A late project-A upload could therefore complete while B was open, and cleanup of
an already-landed A attachment could be addressed using B's current project id. Old project filenames
could also stay in the `@` suggestions until B's list arrived.

Each upload row now records its immutable owner project. Progress/success/error callbacks check that
owner plus the active project. A late successful upload after navigation/removal/unmount is deleted
against its **origin project**. Old pending requests are aborted and old ready unsent attachments are
cleaned against the old project. Sent attachments are disowned before composer cleanup, because their
ids now belong to the sent message rather than unsent UI state.

Project cleanup also clears the staged reducer, `File`/abort ownership, the file-path mention cache,
mention query state, drop state and caret restoration. File-list responses are fenced to the project
that requested them.

## Draft, bidi and focus behavior

Draft storage remains project-keyed. On a draft-key change the new draft is read once, used for both
text and caret position, and the previous project cannot write into the new key through this path.
Refused sends still leave the current draft and staged files visible.

The primary composer textarea now carries `dir="auto"`, so Hebrew/Arabic/LTR typed text chooses its
own content direction independently of the English interface direction. Existing dialog focus tests
remain green; no visual/focus-trap redesign was made.

## Stop/cancel boundary

The client still sends the existing `{ type: 'stop' }` frame and waits for the server-owned terminal
outcome. Worker3 hardened stop-during-inference and terminal persistence. This tranche deliberately did
**not** invent a client-side "Stopping" acknowledgement because the current wire has no authoritative
stop-accepted event. The Stop control is access-gated and remains disabled when the workspace itself is
not allowed to chat; `msg_end` remains the outcome authority.

That means there is still no separate, server-confirmed pending-stop state between the click and the
terminal event. This is a wire/product limitation, not something the browser can safely infer by itself.

## Artifact UX inspection

No artifact-durability blocker was reproduced in this tranche. The current worker trace persists
structured tool result detail, history maps persisted tool trace back to the turn, and the web turn
renderer sends structured detail through its validator before rendering. Capability-blocked/generated
artifact honesty remains owned by the existing worker/runtime evidence. No visual-quality claim is made
from these source/tests.

## Behavioral validation

The new customer-journey suite exercises the actual pure fence/merge helpers and pins their React wiring.
Its meaningful controls include:

- overlapping A/B history success/error callbacks;
- newer same-project request superseding the older request;
- history + checkpoint invalidation on A → B;
- mid-stream history unable to roll back visible assistant text/tool state;
- terminal live/history merge;
- persisted terminal fields equal after reload;
- legacy rows remaining unknown;
- Workspace project-key remount;
- access gating for Send/Edit/Retry/Stop;
- falsification that removing chat gates is detectable;
- abortable REST and abort not becoming an offline observation;
- upload origin ownership and late-success cleanup;
- falsification that current-project cleanup would be rejected;
- `dir="auto"` on the primary composer.

Final focused run:

```text
node --test \
  apps/web/tests/customer-journey-state.test.mjs \
  apps/web/tests/message-history.test.mjs \
  apps/web/tests/retry-run.test.mjs

41 tests · 41 passed · 0 failed

pnpm --filter @golem/web typecheck
tsc --noEmit · exit 0
```

The relevant larger focused sets were also green during implementation: 92/92 before the terminal
history addition, and 64/64 after the AbortError/connectivity fence correction.

Final complete web validation against the current integration:

```text
pnpm --filter @golem/web test
1875 tests · 1875 passed · 0 failed · 0 skipped · 0 todo

pnpm --filter @golem/web build
tsc --noEmit · passed
Vite modules transformed · 297
build · exit 0
```

The existing Vite warning remains: the main minified JS chunk is above the configured 500 kB warning
threshold. It is a warning; the build exits 0.

## Local browser-helper boundary

The existing safe helper `scripts/verify-catalog-browser.mjs` is designed to create and close its own
Playwright browser context and block/mimic external APIs. An attempt was made to invoke that helper
through the available browser connector without navigating the page object owned by main. The connector
rejected the module import before a fresh context could run:

```text
TypeError [ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING]:
A dynamic import callback was not specified.
```

No workaround was used. Main's live browser/Sentry tab was not navigated, clicked or reused. Therefore
this report contains hook/reducer/source/build proof, not new browser DOM acceptance. Main owns actual
browser visual acceptance.

## Exact source and test fingerprints

Aggregate algorithm: sort the listed repository-relative paths lexicographically; for each path update
SHA-256 with UTF-8 path, NUL, exact bytes, NUL.

Customer-journey source set (5 files):

| path | SHA-256 |
|---|---|
| `apps/web/src/lib/project-socket-state.ts` | `07edd59b2a68a8a30cb786bd3105340300b1b5582f8a4f4a3f1fbc32a5ca91c1` |
| `apps/web/src/lib/api.ts` | `105769d0cab7a1e4f2e3936818c0b3a0668155b083d196565d40cc35c0f70fcd` |
| `apps/web/src/lib/use-project-socket.ts` | `a9750ec13afa9498af3931348e40a712c4c4c42614bcbf989558f40898f1ac9e` |
| `apps/web/src/routes/workspace.tsx` | `e50be06fbe9ce7302bb9407e8a1b7e859bcb5ea20cb7825def32f590bb1e9783` |
| `apps/web/src/components/ws/composer.tsx` | `638237e8654de4c4e54aaa187b1fae502625f529b9dd10dc945adc36bc05b211` |

```text
CUSTOMER_JOURNEY_SOURCE_AGGREGATE_SHA256
e39c55e8ea575291ef5f236244112c07cd630f317c29f151c0fdcb2d7ddb588c
```

Owned/reconciled test set (7 files):

| path | SHA-256 |
|---|---|
| `apps/web/tests/customer-journey-state.test.mjs` | `415ec6f6ca70e2266af97599ba1972d64ce0d0f96327fc2e80dfb99cde3f962a` |
| `apps/web/tests/draft.test.mjs` | `0de2bf0c1b6888613814fede99473217c717d562f2e80947020596477163f909` |
| `apps/web/tests/retry-run.test.mjs` | `1039e9fb0b287519e8fdf10665049c3311ee6f52755dccaa4ea6c61c65eab362` |
| `apps/web/tests/command-palette.test.mjs` | `8a18c4a1c593843f7425661ab50c05d80cf6aa8b435411a6c7d0f9faf85c2732` |
| `apps/web/tests/files-drawer.test.mjs` | `b9773cddee3a8d78a8bc75043737e06882d253ee7347c8738dc359dfcaa9a859` |
| `apps/web/tests/presence-signal.test.mjs` | `4d87815fdec7e6f9b6cfe2a220a41d7652353ee310f7035318ad169b2539d6dd` |
| `apps/web/tests/message-history.test.mjs` | `e41101a4a0882558b00ffb7d69c9234db557f923cf4fad7fe46467eccc123535` |

```text
CUSTOMER_JOURNEY_TEST_AGGREGATE_SHA256
b9fe26861ab0146394a97101d6ea14a21d504f94ca6f3b4d61a40ad25926e00a

WEB_TEST_FILES = 150
WEB_TEST_AGGREGATE_SHA256
aca8ca56c4857c2e233b2572dc55d2b5c3d31cf7b2aac622a5271d3e0c812e82
```

These are fingerprints of the exact current dirty shared-working-tree bytes; several files contained
pre-existing unrelated changes before this tranche, so the hashes identify the validated integration
state rather than claiming every byte as authored here.

## Final local web build outputs

The final `apps/web/dist/` contains 8 files. Aggregate:

```text
WEB_DIST_AGGREGATE_SHA256
1065df5ae8c59873d2d224fe106eedcee134cfafbb084dc6212bac4fc63d0724
```

The seven hashed Vite assets are:

| asset | bytes | SHA-256 |
|---|---:|---|
| `admin-BZeGnn_0.js` | 21,870 | `48941957fa8e848026fac9f125393f62e7ec9fda2227d7e25641b6af6a0f2e16` |
| `index-CIlUvRCI.css` | 62,033 | `8d7237a328ea243bd6d7490a7d4f3faeb6c1cb55dd7a3ddecc9c7b19929b52fa` |
| `index-CeUn7wSy.js` | 575,298 | `241e4ab782146c4db9fe8705a1cc0b1efdc85036998e966005afb59703895647` |
| `markdown-0Pr9SZxJ.js` | 65,370 | `a339f16f9cb095ea96875ddcdd43b83ea95acfd6556058fa9d1c1b38bc96a152` |
| `react-CbGl50uX.js` | 206,368 | `145aaa68bf4d33528a703f786f2a31a3e97458e55ce9642ddd88360b1eaf8b81` |
| `supabase-CyI6DAKv.js` | 220,436 | `dc9f86b4e2192723b8dfd24562fb3e61ac0354f3e014ffb8d78ab5ff6ef0d1fc` |
| `ui-lab-e9ewdMFS.js` | 13,835 | `5efd9ddebeb110e1c00b9ba2de1a341f0bbc09cd1ea58ae2f4dca21c0926e617` |

Asset aggregate:

```text
ac8a581ef9a80a6c94a197ada93564f604222c717c6a1782fc4ee2a66f6e234c
```

`dist/index.html` is 1,797 bytes, SHA-256
`9ff75bb4b9154084058cbdb363fe2767d6b63bb3ccb2fce68d18c06ca216f00c`.

## Evidence limits

- This proves the local state/reducer/API integration, focused behavior, full web tests/typecheck and
  production build on the fingerprinted working tree.
- It does not claim that the local build is deployed.
- It does not replace main's real browser/Studio visual acceptance.
- It makes no claim that a Stop click has been server-acknowledged before a terminal event, because the
  current protocol provides no such acknowledgement.
- It does not infer artifact visual quality from stored structured tool detail.
