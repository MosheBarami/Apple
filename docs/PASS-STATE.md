# PASS STATE

A pointer, never a source of rules. The rules are `docs/MISSION-PROMPT.md`; re-read that file in
full at every re-entry and verify its sha below before acting on anything here.

PASS: 12
PROMPT-SHA256: 6428cb9e38a43e198554a593416b64a1940af7886ac32ea1a3c35984b4f83ecd
HEAD: e2f019f
TREE-CLEAN: yes
AT: 2026-09-15T00:32:50Z

## Derived open counts — computed this pass, not remembered

| ledger | command | value |
|---|---|---|
| gates ticked | `grep -cE '^- \[x\] G' GATES.md` | 41 |
| gates open | `grep -cE '^- \[ \] G' GATES.md` | 0 |
| features not-started | `node -e "…FEATURES.json…"` | 1086 |
| features done | same | 132 |
| features partial / blocked | same | 21 / 10 |
| features total | same | 1249 |
| blockers §D | `docs/backlog/BLOCKERS.md` | re-derive next pass |

`features not-started` went UP against pass 1's 1084, and that is the honest direction: falsely
`done` rows were demoted on measurement, twice this pass. The number that measures distance to a
finished product is allowed to move backwards when the earlier figure was wrong.

## Observable live surfaces (§8.1)

Enumerated this pass from what this session can actually reach:

| surface | observable now? | how |
|---|---|---|
| repository working tree | YES | filesystem |
| deployed worker `golem.moshe-barami111.workers.dev` | PROBED pass 12 | `/api/health` 200, no buildSha — the worker predates that change, so it is STALE against HEAD. `/api/version` returns unauthorized, which is why the drift probe reads health instead. |
| deployed site | PROBED pass 12 | `/` and `/pricing` 200. 58 user-visible "Golem", "No card required, ever" x3, "never be charged" x1, free quota published as 60 Credits/day against PLAN_LIMITS 231. All four absent from the built artifact. |
| Supabase `npqvyijsvzkuwddyhtpm` | anon key only | no service-role key by design (§1.1) |
| Roblox Studio + sideloaded .rbxm | NO | needs a human at a Studio install |
| Stripe test mode | NO | no keys in this session |

## Rows in flight

None in a worktree. The one thing waiting is not a row: the D1 static re-upload is built,
measured and held for the owner's go-ahead. §10.2 makes it my action rather than a handoff, which
settles who does it, not when it may be published.

## §6 discharge status

| clause | state |
|---|---|
| 6.1 `--reverify`, unknown-flag exit 2, tally from checkboxes, G-ORACLE-1 | DONE, red-first at break-sha 30cda94 |
| 6.2 red-first back-fill across the existing ledger | IN PROGRESS — 30 pre-existing gates carry no FALSIFIED record |
| 6.3 DENOMINATOR line on every §6 checker | NOT STARTED |
| 6.4 check-escape-hatches.mjs | NOT STARTED |
| 6.5 check-backlog.mjs | NOT STARTED |
| 6.6 check-deadends.mjs | NOT STARTED |
| 6.7 check-dispositions.mjs | NOT STARTED |
| 6.8 check-offer.mjs | NOT STARTED |
| 6.9 check-pixels.mjs | NOT STARTED |
| 6.10 check-rebrand.mjs | NOT STARTED |
| 6.11 real coverage, toolchain gate, suite superset | PARTIAL — gate-suite is now a superset of root `pnpm test` |

## Exact next action

`node scripts/gate-check.mjs --reverify GATES.md` to completion, then §6.4
`scripts/check-escape-hatches.mjs`, red-first.

## Second agent

`rbxai-a3` is working additively on branch `grow/*` in a worktree at
`/Users/moshe/Desktop/RbxAI-grow`, outside this repo directory. It has committed to never touching
the five ledgers, `scripts/gate-*.mjs`, `scripts/check-*.mjs`, `.github/workflows/`,
`apps/plugin/**`, or this pass's in-flight file list, and never to deploy. Its work is parked on a
branch, not merged, so it creates no untracked gate surface here.
