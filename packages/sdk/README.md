# @studpilot/sdk

Clients for the StudPilot REST + streaming API, in the three languages this product is used
from, plus the command line.

| | where | entry point |
|---|---|---|
| JavaScript | `src/` | `import { StudPilotClient } from '@studpilot/sdk'` |
| TypeScript | `types/index.d.ts` | the same import, typed |
| Python | `python/studpilot_sdk/` | `from studpilot_sdk import StudPilotClient` |
| Luau (in Studio) | `luau/StudPilotClient.luau` | `local Client = require(script.StudPilotClient)` |
| CLI | `bin/studpilot.mjs` | `studpilot health` |

They are four implementations of **one** protocol, not four protocols. Every route, header
name, token shape and subprotocol comes from `apps/worker/src/index.ts` and
`packages/shared/src/index.ts`; nothing here invents an endpoint, and no response is
reshaped on the way through.

## Why the JavaScript is JavaScript

`src/` is plain ESM with no build step, so a browser, a Cloudflare Worker, Node and the
`studpilot` binary all load the same bytes. TypeScript callers get `types/index.d.ts`, which is
hand-written — and therefore a second description of one thing. Two tests keep the two
honest:

- `tests/types.test.mjs` compares the declared value names against the runtime exports, and
  compiles a deliberately **wrong** consumer to prove the declarations are not `any`.
- `tests/protocol-parity.test.mjs` reads `packages/shared/src/index.ts` and fails when a
  runtime allowlist here stops matching the union there. It has already caught one real
  drift: a `presence` variant added to `ClientMsg` while this package was being written.

## Using it

```js
import { StudPilotClient, SessionStream } from '@studpilot/sdk';

const client = new StudPilotClient({ token: process.env.STUDPILOT_TOKEN });
const { messages } = await client.messages(projectId, { limit: 20 });

const stream = new SessionStream({ baseUrl: client.baseUrl, projectId, token }).connect();
stream.sendChat('build a door on the north wall', 'agent');
const run = await stream.waitForRun();
console.log(run.text, run.creditsSpent);
```

```python
from studpilot_sdk import StudPilotClient
client = StudPilotClient(token=os.environ["STUDPILOT_TOKEN"])
print(client.health())
```

```lua
local Client = require(script.StudPilotClient)
local client = Client.new({ version = "0.2.0", protocol = 1 })
local res = client:claim(code)
```

```
studpilot health
studpilot messages <project-id> --limit 20
studpilot export <project-id> --format md
studpilot purge <project-id> --yes
```

The CLI's exit codes are part of its contract: `0` success, `1` the API answered with an
error or could not be reached, `2` the command line was wrong.

## The former names

The product was called Apple, and a consumer written against the old names keeps working for one
release. Each of these is removed in the next major version; new code uses the StudPilot names.

| Was | Is now | Still works |
|---|---|---|
| `AppleClient` (JavaScript, TypeScript) | `StudPilotClient` | yes: the same class under its former name, and `AppleClientOptions` for its options |
| `apple_sdk` (Python) | `studpilot_sdk` | yes: `import apple_sdk` re-exports everything and raises a `DeprecationWarning` |
| `luau/AppleClient.luau` | `luau/StudPilotClient.luau` | yes: the old module requires the new one and returns it |
| the `apple` command | `studpilot` | yes: both names are installed and run the same file |
| `APPLE_TOKEN`, `APPLE_API_URL`, `APPLE_ADMIN_KEY` | `STUDPILOT_TOKEN`, `STUDPILOT_API_URL`, `STUDPILOT_ADMIN_KEY` | yes, and the older `GOLEM_TOKEN` / `GOLEM_API_URL` too; the `STUDPILOT_` name wins |

The clients send the StudPilot spelling of the wire names (`studpilot.v1`, `studpilot.jwt.`, the
`X-StudPilot-*` headers). The worker accepts the two former spellings as well, so this does not
depend on which side is upgraded first.

## What it refuses to do

Most of the code here is refusals, and each one exists because the alternative fails
quietly:

- **A POST is never retried** unless the caller opts in. A request that timed out may have
  been executed, and the worker implements no idempotency key, so nothing would collapse
  the duplicate.
- **A project id must be a UUID before it is concatenated into a path.** `../../admin/stats`
  is a path-traversal primitive, and the worker's 404 for it reads as "no such project".
- **A number that arrives non-finite is replaced, never used.** `waitMs ?? 2000` accepts
  `"5000"`, `NaN` and `Infinity`; every `>` against those is false, so the cap that looks
  like a cap is not one.
- **A `stopReason` this build has never heard of is kept and flagged**, not reported as a
  clean finish — a worker one version ahead is a normal state, not a corruption.
- **An unreadable frame is announced as unreadable**, never counted as a frame that was read.

## Running the tests

```
cd packages/sdk && node --test          # everything, including the Python and Luau suites
```

The Python and Luau suites are driven from `node --test` through `tests/python.test.mjs`
and `tests/luau.test.mjs` so that `pnpm -r test` reaches them. On a machine without
`python3` or `luau` those two **skip loudly** — they never report a pass for a suite that
did not run.
