# Golem scripting curriculum

Master Mission §U names Roblox **scripting** as the highest-weight long-term capability, and §AJ
asks for a benchmark that tracks Luau correctness, debugging, multi-file architecture, project
comprehension, tool use and failure recovery. This document describes the scripting half of that
benchmark: what it tests, how heavily, and — the part that matters more — what it does not test.

Everything below is machine-checked. The weighting is asserted arithmetically in
`packages/evals/src/scripting-curriculum.test.mjs` and in `src/selftest.mjs`; the topic coverage
table is generated from the task files, not maintained by hand. If this document and the suite
disagree, the suite fails.

## Why the existing checks were not enough

The pre-existing grader has four check types: `contains`, `not_contains`, `regex` and
`luau_syntax`. Between them they can prove that a snippet **parses** and that it **mentions** the
right API. On scripting material those two properties come apart badly. This answer:

```luau
remote.OnServerEvent:Connect(function(player, price)
	player.leaderstats.Coins.Value = player.leaderstats.Coins.Value - price
end)
```

parses, contains `OnServerEvent`, contains `leaderstats`, avoids every deprecated global — and
lets any client send `price = -99999` and mint currency. Under the old check types it scores 1.0.

So the curriculum ships with a fifth check type, `no_antipattern`, backed by
`packages/evals/src/roblox-antipatterns.mjs`: nineteen static rules that read the code rather than
its vocabulary. `src/selftest.mjs` grades exactly the snippet above and requires it to score 0.

## Weighting

The runner's overall score is a **task-weight-weighted mean** across every task
(`aggregate()` in `packages/evals/src/run.mjs`). Scripting therefore dominates by carrying most of
that weight, not by having the most files. Every scripting task is weight 3 or 4; every other task
is weight 1 or 2.

| category | tasks | weight | share of total |
|---|---:|---:|---:|
| scripting-persistence | 7 | 24 | 15.6% |
| scripting-security | 7 | 23 | 14.9% |
| scripting-gameplay | 7 | 21 | 13.6% |
| scripting-systems | 7 | 21 | 13.6% |
| **scripting subtotal** | **28** | **89** | **57.8%** |
| api-knowledge | 12 | 14 | 9.1% |
| luau-correctness | 10 | 11 | 7.1% |
| debugging | 8 | 9 | 5.8% |
| project-comprehension | 6 | 8 | 5.2% |
| multi-file | 5 | 7 | 4.5% |
| tool-selection | 6 | 6 | 3.9% |
| ui-implementation | 5 | 6 | 3.9% |
| failure-recovery | 4 | 4 | 2.6% |
| **total** | **84** | **154** | 100% |

Two invariants are enforced by tests rather than by convention:

- scripting must exceed 50% of total weight;
- no scripting task may be lighter than weight 3, so a single non-scripting task can never outrank
  a scripting one.

Note what the weighting does **not** do: it does not change the per-category scores that
`report.mjs` prints. Each category is still scored on its own 0–100 scale. The weighting only moves
the OVERALL column, which is the number a model-selection decision is made on.

## The four categories

**scripting-security** (7 tasks) — the client/server trust boundary. Remote argument validation
against arbitrary attacker-controlled input, server-authoritative pricing, choosing RemoteEvent over
a RemoteFunction invoked on a client, per-player rate limiting, idempotent promo-code redemption,
Instance-argument ownership checks, and one prose review task that asks the model to explain why a
plausible-looking client-side shop is both broken and exploitable.

**scripting-persistence** (7 tasks) — the failure modes that lose player data. pcall plus bounded
retry with back-off, atomic read-modify-write via `UpdateAsync`, a `JobId` session lock across a
fast rejoin, `BindToClose` flushing, OrderedDataStore leaderboards under throttle budgets, an atomic
rebirth transaction, and a prose task on the specific trap of treating a failed load as a fresh
account and then saving it over the real one.

**scripting-systems** (7 tasks) — the genres this product actually gets asked for. Tycoon droppers
and collectors with a live-part cap, buy-buttons that survive the touch storm a single footstep
produces, upgrade ladders with server-side cost tables, zone detection sampled rather than polled
per frame, quest progress that pays exactly once, leaderstats driven by attributes, and the client
half of a shop that sends an id and nothing else.

**scripting-gameplay** (7 tasks) — everything the player feels. PathfindingService with a
compute failure and a blocked path, a server-authoritative weapon with no remote to forge,
animations loaded on the Animator rather than the deprecated Humanoid path, StreamingEnabled-safe
client lookups, one ContextActionService binding covering keyboard, gamepad and touch, a
per-frame-cost refactor, and a strict-mode typed module.

## Topic coverage

Each task declares `topics` drawn from the closed list `SCRIPTING_TOPICS` in
`packages/evals/src/tasks.mjs`. An unrecognised topic is a task-file load error, and a topic with no
task fails `scripting-curriculum.test.mjs` — so the claim "the curriculum covers X" cannot drift
away from the tasks.

| §U topic | tasks |
|---|---|
| luau-correctness | sg-07 |
| client-server-boundary | ss-01, ss-03, ss-06, sy-07, sg-04, sg-05 |
| remotes-validation | ss-01, ss-04, ss-07, sg-02 |
| persistence-datastore | sp-01 … sp-07, ss-05 |
| session-locking | sp-03 |
| economy-currency | ss-02, ss-06, sp-02, sp-07, sy-01, sy-02, sy-03, sy-05, sy-06 |
| shops | ss-02, sy-02, sy-07 |
| upgrades | sy-03 |
| tycoon | sy-01, sy-02 |
| rebirth | sp-07 |
| zones | sy-04 |
| quests | sy-05 |
| codes | ss-05 |
| leaderboards | sp-06, sy-06 |
| npc-pathfinding | sg-01 |
| tools-and-equipment | ss-07, sg-02, sg-03 |
| animation | sg-03 |
| streaming-enabled | sg-04 |
| mobile-controller | sg-05 |
| exploit-resistance | ss-01 … ss-07, sy-03, sy-07, sg-02 |
| error-recovery | sp-01, sp-04, sp-05, sg-01 |
| idempotency | ss-05, sp-02, sp-05, sp-07, sy-02, sy-05 |
| race-conditions | ss-02, ss-04, sp-02, sp-03 |
| performance | sy-01, sy-04, sp-06, sg-06 |

Coverage is uneven on purpose. `exploit-resistance` and `economy-currency` appear in nine or ten
tasks because they are where wrong code costs a real game real money; `zones`, `codes` and
`rebirth` get one task each because they are narrow, well-defined mechanics where one task is
enough to tell whether the model knows the shape.

## The anti-pattern rules

`packages/evals/src/roblox-antipatterns.mjs`. Each rule names the exploit or the outage it prevents,
in the source, next to the regex. Errors are things that cost money or data; warns are things that
cost players or frames.

| rule | severity | what it prevents |
|---|---|---|
| `remote-function-to-client` | error | a client that never returns hangs the server thread forever |
| `client-authoritative-currency` | error | the client owning a balance: either the write does not replicate, or it is free currency |
| `server-trusts-client-amount` | error | the client choosing its own price or reward |
| `unvalidated-remote-arg` | error | attacker-controlled arguments used without a type, nil or range check |
| `busy-wait-loop` | error | a loop with no yield, killed by the watchdog in a live server but not in Studio |
| `datastore-without-pcall` | error | a throttle throw aborting a save half-finished |
| `set-async-read-modify-write` | error | the lost update behind every "my items disappeared" report |
| `yield-inside-currency-debit` | error | re-entrancy between the balance check and the debit: two items, one payment |
| `unbounded-wait-for-child` | warn | a silent forever-yield on a renamed, deleted or unstreamed instance |
| `datastore-without-retry` | warn | pcall turning a recoverable throttle into silent data loss |
| `no-session-lock` | warn | two servers holding one profile; the stale one wins |
| `no-bindtoclose-save` | warn | shutdown dropping the last unsaved session |
| `deprecated-api` | warn | `wait`/`spawn`/`delay` drift and legacy Body\* movers |
| `keyboard-only-input` | warn | a feature that does not exist on phones and gamepads |
| `expensive-call-per-frame` | warn | progressive frame-rate collapse from per-frame instance lookups |
| `streaming-unsafe-descendant` | warn | a client dot-index into Workspace that throws by player distance |
| `process-receipt-without-purchase-id` | error | one payment granting a product two or three times, because Roblox re-delivers receipts until one is granted |
| `remote-parented-before-handler` | error | a remote that is callable before it is listening, silently dropping the player's first click |

Every rule carries a bad sample it must fire on and a good sample it must stay silent on, in
`src/roblox-antipatterns.test.mjs`. A rule with no such pair fails the suite: a rule never seen to
fire is indistinguishable from one wired up wrong, and a broken rule makes scores go **up**.

### The two extracted from canonical libraries

The sixteen above were authored. These two were **extracted**, on 2026-09-01, by reading five
libraries that exist because somebody already hit the bug — ProfileService, Janitor,
roblox-lua-promise, Knit and goodsignal — on the principle that a good library is a list of bugs
somebody already hit, and its defensive code is preventing something specific.

Nineteen were proposed and **seventeen were rejected** by a reviewer whose default was to reject.
That ratio is the useful number, and the rejections are worth more than the survivors: most were
thrown out for firing on correct code (`player-keyed-table-never-cleared` fires on delegated
cleanup; `client-dot-index-replicated-storage` fires on the standard Rojo/Wally require idiom),
one for being factually wrong about Luau (`uncancelled-per-player-thread` treated `task.wait` as
an error boundary), and several for duplicating a rule already here.

Both survivors carry a narrowing the reviewer demanded, and both narrowings are tested:

- `process-receipt-without-purchase-id` searches the whole **file** for `PurchaseId`, not the
  handler body. ProfileService's own reference implementation delegates the idempotency check to
  a helper, so a body-scoped rule would condemn the code the rule was derived from.
- `remote-parented-before-handler` fires only when something **yields** between the parenting and
  the connect. Without a yield the two statements are one resumption of the same thread, no
  client can run in between, and there is no window.

## Reference answers

`packages/evals/tasks/reference/<task-id>.md` holds a hand-written correct answer for all 28
scripting tasks. Each is graded by `scripting-curriculum.test.mjs` and must score exactly 1.0.

This exists because the second-worst thing a benchmark can do is contain a check no correct answer
can pass. Such a check is invisible: it deducts the same point from every model on every run, and
the deficit reads as a capability gap. Pinning a reference answer turns that failure into a red
test instead. It also means the 28 reference files are, incidentally, a specification of what the
project considers correct Roblox code — they were all verified against the real `luau-lsp` parser.

## What this does NOT cover

Stated plainly, because a benchmark that oversells its coverage is worse than a small one:

- **The rules are regex and block scanning, not a parser.** They see one file at a time with no
  project context, so a value that crosses a ModuleScript boundary is invisible to them. They
  answer "does this contain a known-bad shape", never "is this correct".
- **Nothing here executes.** No task is run in Studio, no remote is actually fired, no DataStore is
  actually written. `luau_syntax` proves the code parses; `no_antipattern` proves it avoids sixteen
  named mistakes. Neither proves the feature works. The Studio-side evidence lives in the visual and
  playtest harnesses, not here.
- **Single-turn only.** Every task is one prompt and one response. Multi-turn repair — the model
  reading its own error and fixing it — is only proxied, by the four `failure-recovery` tasks that
  ask what the *next* action would be. §AJ's "failure recovery" axis is therefore covered much more
  weakly than its "Luau correctness" axis.
- **No multi-file scripting task.** The scripting categories are all single-file. §AJ's multi-file
  architecture axis is still served only by the 5 pre-existing `multi-file` tasks at weight 7 of
  154, which is thin for something the mission calls out by name.
- **The checks are necessary, not sufficient.** A task's checks describe what a correct answer must
  contain; an answer can satisfy all of them and still be bad in a way nobody wrote a rule for.
  Scores near 100 mean "no known mistake was made", not "this is good code".
- **Three rules are heuristics with known false-negative modes.** `datastore-without-retry` accepts
  any loop naming an attempt counter as evidence of a retry; `no-session-lock` accepts the mere
  presence of `JobId`; `unvalidated-remote-arg` accepts any one of several validation tokens
  anywhere in the handler body. Each was loosened deliberately after it fired on correct code — a
  false positive on a good answer costs a model a point it earned, which corrupts the benchmark in
  the direction that is hardest to notice.
- **No calibration against human judgement.** Nobody has ranked model outputs on these tasks by
  hand and compared the ranking to the scores. The rules encode well-documented Roblox failure
  modes, but the *weighting between them* — an exploit is worth the same as a syntax error — is a
  modelling choice, not a measured one.

## Running it

The runner spends real money against the paid gateway. Everything in this document is verifiable
offline and for free:

```sh
cd packages/evals
node src/selftest.mjs                                 # task files, grader, real Luau CLI
node --test src/roblox-antipatterns.test.mjs          # every rule fires and stays silent
node --test src/scripting-curriculum.test.mjs         # weighting, coverage, 28 reference answers
```

The paid path, for reference only:

```sh
API_BASE=https://<worker-host> ADMIN_KEY=<key> \
  node src/run.mjs --categories scripting-security,scripting-persistence --tag scripting-baseline
```
