# @golem/sdk

Clients for the Apple REST + streaming API, in the three languages this product is used
from, plus the command line.

| | where | entry point |
|---|---|---|
| JavaScript | `src/` | `import { AppleClient } from '@golem/sdk'` |
| TypeScript | `types/index.d.ts` | the same import, typed |
| Python | `python/apple_sdk/` | `from apple_sdk import AppleClient` |
| Luau (in Studio) | `luau/AppleClient.luau` | `local Client = require(script.AppleClient)` |
| CLI | `bin/apple.mjs` | `apple health` |

They are four implementations of **one** protocol, not four protocols. Every route, header
name, token shape and subprotocol comes from `apps/worker/src/index.ts` and
`packages/shared/src/index.ts`; nothing here invents an endpoint, and no response is
reshaped on the way through.

## Why the JavaScript is JavaScript

`src/` is plain ESM with no build step, so a browser, a Cloudflare Worker, Node and the
`apple` binary all load the same bytes. TypeScript callers get `types/index.d.ts`, which is
hand-written — and therefore a second description of one thing. Two tests keep the two
honest:

- `tests/types.test.mjs` compares the declared value names against the runtime exports, and
  compiles a deliberately **wrong** consumer to prove the declarations are not `any`.
- `tests/protocol-parity.test.mjs` reads `packages/shared/src/index.ts` and fails when a
  runtime allowlist here stops matching the union there. It has already caught one real
  drift: a `presence` variant added to `ClientMsg` while this package was being written.

## Using it

```js
import { AppleClient, SessionStream } from '@golem/sdk';

const client = new AppleClient({ token: process.env.APPLE_TOKEN });
const { messages } = await client.messages(projectId, { limit: 20 });

const stream = new SessionStream({ baseUrl: client.baseUrl, projectId, token }).connect();
stream.sendChat('build a door on the north wall', 'agent');
const run = await stream.waitForRun();
console.log(run.text, run.creditsSpent);
```

```python
from apple_sdk import AppleClient
client = AppleClient(token=os.environ["APPLE_TOKEN"])
print(client.health())
```

```lua
local Client = require(script.AppleClient)
local client = Client.new({ version = "0.2.0", protocol = 1 })
local res = client:claim(code)
```

```
apple health
apple messages <project-id> --limit 20
apple export <project-id> --format md
apple purge <project-id> --yes
```

The CLI's exit codes are part of its contract: `0` success, `1` the API answered with an
error or could not be reached, `2` the command line was wrong.

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
