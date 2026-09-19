# Worker backend final gate — 2026-09-19

## Scope

Local verification of the frozen backend integration after `edit_script.source_file`, SessionDO terminal
metadata / finish-reason / stop-after-settlement work, and the shared DTO landed. No deployment, paid
provider call, remote SQL, credential use, upload, Roblox Studio execution, or account mutation was
performed.

The previous final Worker observation in
`docs/evidence/resume-integrated-worker-tests-2026-09-18.md` was 230 recursive test files and
3434/3434 passing. The current tree has 232 recursive `*.test.mjs` files and 3452 tests, so a fresh
gate was warranted; the old result was not reused as current evidence.

Repository HEAD throughout these checks:

`6d7a5bec3a741de9cbe97459bcc82e760bd3e089`

## Exact initial pre-run fingerprints

Each aggregate is the SHA-256 of a newline-terminated sorted manifest whose rows are
`<sha256>  <relative-path>`.

| Set | Files | Aggregate SHA-256 |
|---|---:|---|
| `apps/worker/src/**` | 151 | `893466f908f168709267d8e22db1188c11e2c688ce46e46eafd6b93c311b21fa` |
| `apps/worker/tests/**` | 242 | `84263522203192cd5176321bd32d3356dd5b5da0b591d292eaeef1d4d097f290` |
| Worker package/config: `package.json`, `tsconfig.json`, `wrangler.jsonc`, `wrangler.apple.jsonc` | 4 | `dd41ed006b89f6c123ed89226e00be7686f081942b63771bacc1fbcc2ecf2eb4` |
| `packages/shared/src/**` | 2 | `696084ae7cd1eed7876d9a26153557bef276e4fdac575a9c1f66dfcf8030595a` |
| Shared/root config: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `tsconfig.base.json` | 3 | `efca66000fb95ee242b115231a40fa02619163e83d26c7b0d274014ec3221287` |

Key files at that boundary:

```text
fee5051453eacc9b8a171b083df825619779567ba3d9a2b4ed2af55dbe4adc2e  apps/worker/src/tools.ts
2185e6df046bc6e9e7592ac815d8494a4a84631e0a30e843922812c022dd51ee  apps/worker/src/do/session.ts
515142967b50898e610c7d8f0caccab2fdfc4a4ce9b0dd10626a423d2fa054f8  packages/shared/src/index.ts
0948958bf7b521903f1b659bbf363734c8543c81cc17d61296204d007d28d695  apps/worker/tests/edit-script-source-file.test.mjs
```

## Initial full recursive Worker run — preserved red observation

All 232 recursive test files were sorted and passed explicitly to:

```text
node --test --test-concurrency=2 <all 232 recursive test files>
```

An external Python parent started Node in a new process session, waited at most 900 seconds, and
would `SIGKILL` the entire child process group and reap it on timeout.

Observed result:

| Counter | Result |
|---|---:|
| test files | 232 |
| tests | 3452 |
| pass | 3449 |
| fail | 3 |
| skipped | 0 |
| cancelled | 0 |
| todo | 0 |
| suites | 0 |

- watchdog timeout: **false**
- process return code: **1**
- Node-reported duration: **21232.821125 ms**
- watchdog wall time: **21.312 s**
- log SHA-256: `108540a27dab9db5daf586c2e8edea15d79deac21c4a48c1d5416ad201ebe5d0`
- after `wait()` the child process group no longer existed: **true**

The three reds were concrete stale test contracts, reported before any repair:

1. `edit-resend.test.mjs` expected the older exact spelling
   `editable={item.role === 'user' && !running}`. Current UI also requires `chatAllowed`, so a revoked
   collaborator cannot retain an edit affordance.
2. `presence-activity.test.mjs` searched only the first 1,200 characters of `finishRun`. Added terminal
   metadata comments moved the still-present `this.clearBuildingBeats()` beyond that magic slice.
3. `tool-detail-history.test.mjs` expected history mapping to inline `detail: t.detail` inside
   `use-project-socket.ts`. Current history delegates to `chatItemFromMessageDto`, whose real mapper in
   `project-socket-state.ts` carries `detail: trace.detail`.

The initial post-run Worker/shared manifests were byte-identical to the initial pre-run manifests, so
none of those failures can be attributed to Worker/shared source, test, or config movement during the
run.

## Narrow stale-test repairs and falsification

Only these three test files were edited:

- `apps/worker/tests/edit-resend.test.mjs`
- `apps/worker/tests/presence-activity.test.mjs`
- `apps/worker/tests/tool-detail-history.test.mjs`

No Worker, shared, or web production source was changed to satisfy them.

The edit-control assertion now inspects the actual `editable={...}` gate and independently requires
the user-message role check, `!running`, and `chatAllowed`. Its in-test falsification removes
`chatAllowed`; the property checker must throw.

The presence assertion now executes the real bundled `SessionDO.clearBuildingBeats()` helper against
two sockets that are actually marked `building`, proves both attachments become `viewing`, and proves
the room receives the withdrawal. The `finishRun` source check is bounded to the exact method body
rather than 1,200 characters and requires the helper call before the first `await`. Its in-test
falsification removes that call; the guard must throw.

The history assertion now executes the real bundled `chatItemFromMessageDto` with structured tool
detail and proves the mapped tool row preserves the same object. It also checks the history path calls
that mapper. Its source-property falsification changes `detail: trace.detail` to `detail: undefined`;
the guard must throw.

Focused result after the repairs:

```text
tests 25
pass 25
fail 0
skipped 0
cancelled 0
todo 0
```

Selected adjacent SessionDO capability/terminal suites then reported 15/15 passing. Scoped
`git diff --check` over the three repaired files returned 0.

## Exact final pre-run fingerprint

The three test repairs intentionally changed only the Worker-test aggregate. Immediately before the
final recursive run:

| Set | Files | Aggregate SHA-256 | Movement from initial snapshot |
|---|---:|---|---|
| `apps/worker/src/**` | 151 | `893466f908f168709267d8e22db1188c11e2c688ce46e46eafd6b93c311b21fa` | none |
| `apps/worker/tests/**` | 242 | `e3e20b77183ae705b4e4cd5021d31572d7ad41427f4cc9ba3548aab21dfec777` | three assigned test repairs |
| Worker package/config | 4 | `dd41ed006b89f6c123ed89226e00be7686f081942b63771bacc1fbcc2ecf2eb4` | none |
| `packages/shared/src/**` | 2 | `696084ae7cd1eed7876d9a26153557bef276e4fdac575a9c1f66dfcf8030595a` | none |
| Shared/root config | 3 | `efca66000fb95ee242b115231a40fa02619163e83d26c7b0d274014ec3221287` | none |

Final repaired-test SHA-256 values:

```text
0bea392026d8e7c6039c2f36a0fa0314f33fcc97e5eb44a2a645af0e4a43189f  apps/worker/tests/edit-resend.test.mjs
eb0a275bca54adfb0384b3a4aabd2639d03b91df20ab4ba229efae6afff34afd  apps/worker/tests/presence-activity.test.mjs
67308778c3f453829f295ea4eaf832c3c7f52595f4ebdc40b4217605ac995946  apps/worker/tests/tool-detail-history.test.mjs
```

## Final full recursive Worker run

The repaired snapshot was run once with the same 232-file recursive enumeration, concurrency 2, and
900-second external process-group watchdog.

| Counter | Result |
|---|---:|
| tests | **3452** |
| pass | **3452** |
| fail | **0** |
| skipped | **0** |
| cancelled | **0** |
| todo | **0** |
| suites | 0 |

- watchdog timeout: **false**
- process return code: **0**
- Node-reported duration: **20033.107375 ms**
- watchdog wall time: **20.098 s**
- log SHA-256: `5bbd231e1b63bf85cd66182f30c4c97f3e6bf78c779fff43a5b790dcc836fd1f`
- after `wait()` the child process group no longer existed: **true**

Relative to the 18 September final gate, the current suite has **2 more test files and 18 more tests**:
230 → 232 files and 3434 → 3452 tests. All 18 additional tests are included in the current green
total; none are skipped.

## Worker and shared typechecks

After the final full run, both package scripts ran under separate 300-second external process-group
watchdogs:

```text
apps/worker:    npm run typecheck --silent
packages/shared: npm run typecheck --silent
```

Both returned **0**, timed out **false**, emitted **zero diagnostics / zero log bytes**, and left no
surviving process group. Each empty log has SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## Exact final post-run fingerprint and movement

After the final full run and both typechecks, every final pre-run aggregate was unchanged:

| Set | Final post-run aggregate | Compared with final pre-run |
|---|---|---|
| Worker source | `893466f908f168709267d8e22db1188c11e2c688ce46e46eafd6b93c311b21fa` | identical |
| Worker tests | `e3e20b77183ae705b4e4cd5021d31572d7ad41427f4cc9ba3548aab21dfec777` | identical |
| Worker config | `dd41ed006b89f6c123ed89226e00be7686f081942b63771bacc1fbcc2ecf2eb4` | identical |
| Shared source | `696084ae7cd1eed7876d9a26153557bef276e4fdac575a9c1f66dfcf8030595a` | identical |
| Shared/root config | `efca66000fb95ee242b115231a40fa02619163e83d26c7b0d274014ec3221287` | identical |

Scoped `git diff --check` over Worker source/tests/config and shared source/config returned 0. The only
intentional movement inside those measured sets between the initial red gate and the final green gate
is the three named stale-test repairs.

## `edit_script.source_file` Luau/asset-gate inspection

The frozen implementation reads the exact project-scoped saved version into `directSource`, feeds it
into the same `after` body used by the existing target read/base-hash and `checkSyntax` flow, and then,
when provenance is `source_file`, calls the existing `refuseLuauIngress(after)` helper before the typed
Studio `edit_script` operation. Therefore a fetched file with a blocked loader/asset-ingress primitive
is refused before Studio mutation; the focused source-file suite already exercises that boundary.

One existing asymmetry is recorded rather than changed here: inside `edit_script`, inline `source` and
`edits` do not call `refuseLuauIngress`; the explicit call is conditional on `sourceFile`. The fetched
file path therefore does run the established ingress helper and is stricter than those two inline
modes. No additional gate, op, endpoint, capability, or bypass was added in this verification pass.

## Evidence boundary

This report establishes the local Worker/shared backend and the Worker suite on the exact fingerprints
above. It does **not** verify the new Lumen Isles `World` / `Client` authored experience, its Roblox
Studio result, gameplay behavior, or visual quality. Those outputs are owned and judged by the main
customer/Studio lane and are not included in the 3452/3452 Worker claim.

