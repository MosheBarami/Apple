# CHECKPOINT — 2026-09-20

Written under FINISH-THE-PRODUCT §16.0. Not a FINAL report: §16 is not true and is not reachable
tonight. Numbers and commands only.

## Why §16 cannot be true tonight

§16.12 gates every other clause: *"A stranger with a fresh browser, a Stripe test card, and a
Roblox account has, in a transcript captured this pass, signed up … installed the plugin build …
and paid. No other clause of §16 is evaluated before that transcript exists."*

Three independent constraints, none of them engineering:

1. **Paid.** `/api/billing/config` answers `{"checkout":false,"purchasable":[]}`. Stripe requires an
   account holder of legal age with a bank account in their name; the owner is 15. `docs/GO-LIVE.md`
   §1 states this and that it must not be worked around. No code path changes it.
2. **Signed up / paid, by me.** Creating accounts and entering payment details are actions I am not
   permitted to perform, on any site, for any reason.
3. **Installed the plugin build.** `STUDIO_PLUGIN_STORE_LIVE` is `false`; Roblox refused the plugin
   and the appeal date is 2026-10-19.

Clause 10 also requires an owner-written `PIXELS-APPROVED:` line in `docs/DECISIONS.md`, which the
spec forbids me to write.

## Verified green this pass

| check | result |
| --- | --- |
| `node scripts/gate-suite.mjs` | `SUITE GREEN` — 8,631 passed, 0 failed |
| `gate-check.mjs --status` | `ALL MET (44 met)` |
| `WORKLIST.md` | 0 open, 0 in-flight |
| `check-backlog.mjs` | `BACKLOG HONEST — 1249 rows, 0 findings` |
| `check-dispositions.mjs` | `DISPOSITIONS SOUND — 0 findings` |
| `check-rebrand.mjs --deployed` | `REBRAND COMPLETE` — 473 files, deployed bundle, 19 rendered routes |
| `check-offer.mjs` | `OFFER COHERENT` — 4 plans, 210 copy files |
| `check-copy.mjs` | `COPY CLEAN` — 187 pages, 63 stylesheets |
| deployed sha | `b694dac` = HEAD at deploy time |

## Fixed and deployed this pass

- **Retry ladder.** Waited 7.6 s against recoveries measured at 12.1 s and 60.6 s; now 63 s over 7
  attempts. Retrying is free — the request never reaches the model and nothing is billed.
- **Two error misclassifications.** A transient reported to the customer as an exhausted allowance
  (`neurons` matched as a bare word), and a retryable capacity refusal surfaced as a raw crash.
- **`get_ui_construction` payload.** All 29 entries exceeded the 3,000-char transport cap and were
  cut mid-JSON. Now 0/29 over, 29/29 parseable; complete citations reaching the model 46 → 147.
- **Sparks → Credits migration.** A QuotaDO created before the rename has no `credits` column, so
  `state()` throws and that user cannot spend. Demonstrated on the legacy worker.
- **Error monitoring, both halves**, probed by a real 500 arriving in Sentry and by the DSN present
  in the served browser bundle.
- **Five checker defects**, each of which reported something other than what it found.

## Open, with owner action named

| item | state | what unblocks it |
| --- | --- | --- |
| Payments | `checkout:false` | An adult holds the Stripe account, or the owner turns 18 |
| Studio plugin | `STUDIO_PLUGIN_STORE_LIVE=false` | Roblox appeal, 2026-10-19 |
| Discord bot | answers 503 | A Discord application + two worker secrets |
| GitHub sweep | 4,269 repos unprobed | One working GitHub token (`gh auth status` fails, keyring) |
| `PIXELS-APPROVED` | absent | Owner writes the line; I may not |

## Open, engineering, not done

- **`session.ts` discards already-billed steps** when the retry ladder is exhausted. Owned by
  another lane tonight; not touched.
- **One run in four ends in `error`** with no recorded reason. Not explained, not fixed.
- **The legacy `golem` worker is still deployed, reachable, and has the sparks defect.** `.env`'s
  `API_BASE` points at it, which is what sent four deploys' worth of probes to the wrong host.
- **`FEATURES.json`: 902 of 1,249 rows not-started, 0 carrying a disposition.** §16.4 requires zero
  not-started. The file is an untriaged wishlist — `הרשמה והתחברות` is marked not-started while
  signup demonstrably works — so it is not a completeness measure, and no percentage should be
  quoted from it until it is triaged.

## What a stranger still cannot do

Pay. Install the plugin from the Creator Store. Everything upstream of those two — land, sign up,
create, chat, hit the limit — is served by `apple` and was not probed from a fresh externally-read
inbox this pass, because §3.3 requires a signup I am not permitted to perform.
