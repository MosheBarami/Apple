# The agent, measured against production — 2026-09-21

Everything below was run against `https://apple.moshe-barami111.workers.dev`, the origin a person is
sent to, at `buildSha 29c91d0`. Nothing here is read out of the source tree. Where something could
not be measured it says so rather than guessing.

The owner's standing instruction this answers, verbatim:

> אני פוקד עליך לבדוק את הagent לא מהקוד אלה ממש מהאתר עצמו ולראות מה שגוי מה שבור

("check the agent not from the code but from the site itself, and see what is wrong, what is
broken"). What follows is that check as far as it could honestly be taken — see
**What this is not** at the end.

## What was shipped, and how it was built

`apps/worker/src/do/session.ts` carries 89 uncommitted lines belonging to the rate-limit lane, and
`wrangler deploy` builds from the working tree. Deploying the documented way would have shipped their
unfinished work. Instead the worker was built from `git archive HEAD` extracted to a scratch
directory with `node_modules` symlinked, and the result was checked rather than trusted:
`wrangler deploy --dry-run --outdir` was run from **both** trees and the two bundles diffed. Ignoring
esbuild's path comments, the only difference is 27 lines — `RATE_LIMIT_WAIT_MS`, `StepRefusedError`
and the `resumeAt` ladder, present in the working-tree bundle and absent from the HEAD bundle. That
is exactly the peer's uncommitted change and nothing else.

`GET /api/health` → `{"ok":true,"buildSha":"29c91d0",...}`.

A first upload went out labelled `BUILD_SHA:49d1297` because `git rev-parse` was read after the
archive was taken and another lane had committed in between. The bytes were the `29c91d0` extract,
so the label was wrong; it was redeployed immediately as `29c91d0`. `git diff 29c91d0..dbc7a41 --
apps/worker/src packages/shared/src` is empty, so no worker source landed in that window and the
deployed binary is current.

`/app`, `/docs`, `/changelog` and `/app/assets/index-CMtGTYsw.js` are byte-identical before and after
the worker deploy. `/` gained a new section and a new stylesheet hash in the same window — new
marketing content and a fresh Astro build, i.e. another lane's static deploy, not this one.

## 1. A refusal still ends the run on the server and says nothing on the wire

`docs/backlog/HANDOFF-SESSION-AGENT-LOOP.md` §C diagnosed this from the code. It is now measured in
production, on two different refusal call sites. The probe opened the real socket, sent one `chat`,
recorded every frame with its arrival time, and kept listening for 45 seconds.

| asked for | server answered | time | terminal frame within 45s |
|---|---|---|---|
| `productModel: "max"` (not a real id) | `error code=bad_product_model — Unknown product model for this request.` | +1118ms | **none** |
| `productModel: "apple-max"` on a free plan | `error code=product_model_unavailable — Apple MAX requires a paid subscription. Choose Apple to continue free.` | +1024ms | **none** |

Frames received, both runs: `["presence","hello","error"]`. No `msg_end`, no `run_state`, and the
socket stayed open until the probe closed it.

The browser build has its own fix (`use-project-socket.ts` clears `running` on any `error` frame), so
a person on the website does not see a hang today. Every other consumer — the e2e harness,
`infra/real-chat.mjs`, the Discord path, automations — is still entitled to believe a run that started
has not ended. §C remains **OPEN**, and the file it has to be fixed in is held by another lane.

## 2. The free lane spends two of its three steps refusing its own plan

One full run through the deployed worker with a connected (simulated) plugin, `infra/e2e.mjs`,
exit code 0 read from `node` itself rather than from a pipe:

```
tool: ✗ propose_plan — this plan never checks its own work. Add at least one verification step…
tool: ↺ propose_plan (already done)
tool: ✓ create_instances
→ reply: I reached the step limit for this run. Progress so far is saved — send another message to continue.
```

This is handoff §B and §D compounding, and the causal chain is now on record rather than inferred:
the plan is rejected (step 1), the model repeats it verbatim and the duplicate-call guard refuses it
while still charging a step (step 2), one real mutation lands (step 3), and the run is out of steps.
A free user's first build ends with "I reached the step limit" having made one change. Both fixes are
in `session.ts`. Both remain **OPEN**.

## 3. Apple MAX cannot be exercised from any account this repository can sign in as

The e2e account is `plan=free`. The deployed worker's own sentence is
*"Apple MAX requires a paid subscription. Choose Apple to continue free."* Paid checkout needs an
adult account holder, which is owner-blocked. So the ledger row `max-must-not-think-on-low` — "close
it out when a live MAX run is captured showing high effort" — is **blocked on the owner**, not on
engineering. The effort floor itself is already guarded in
`apps/worker/tests/effort-applied.test.mjs`, including that the free lane is sent no effort at all
rather than a downgraded one.

## 4. The Studio plugin on disk has never been executed

- `~/Documents/Roblox/Plugins/AppleStudio.rbxm` — sha256 `f37dd538900c2927f1b3207763eec7d1a36d27cc7ea07328a0da9a359f679ba8`, written 2026-09-21 02:46 local.
- Roblox Studio pid 67077 started 2026-09-20 02:14:52 local. Its log holds exactly **one**
  `loadPlugin user_AppleStudio.rbxm` line, at `2026-09-19T23:14:58Z` — startup. Studio loads a plugin
  once; the running process is executing the bytes that were on disk then, not these.

So the current build is installed and unvalidated. Restarting Studio would validate it and was not
done: Place1.rbxl has an auto-recovery file (`'Place1.rbxl' auto-recovery file was created`,
`2026-09-20T13:24:58Z`), i.e. unsaved work belonging to the owner.

The plugin process does hold an established TCP connection to `172.67.197.41:443`, which is what
`apple.moshe-barami111.workers.dev` resolves to — consistent with a paired, polling plugin, though
that address is Cloudflare anycast and shared, so it is suggestive and not proof.

## What this is not

**This is not a probe driven through the website's own interface.** Reaching the signed-in app in a
browser means typing a password into a login form, which this agent does not do. What was driven
instead is the same production origin the browser talks to — the real WebSocket, the real auth, the
real Durable Object — from `infra/e2e.mjs` and a purpose-built frame recorder. That covers the
protocol and the agent loop. It does not cover anything that only exists in the rendered page.

**No claim is made about the checkpoint snapshot admission against a real Studio session.** `6b/6c/6d`
in the e2e run exercise `checkpoint-evidence.ts` against the v1 payload shapes the real
`Commands.luau` emits (kept honest by `apps/worker/tests/checkpoint-evidence-live-plugin.test.mjs`),
and they pass against the deployed worker. That is not the same as a real Studio, and pairing one
would require typing a pairing code into the plugin inside the owner's Studio window.
