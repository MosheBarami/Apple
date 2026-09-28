# Production deploy — `bd6ab34-dirty`, 2026-09-22

**What shipped:** the worker `apple` and the `/app` SPA, in that order, through the repository's own
scripts. The static site was **not** deployed, deliberately — see "What was not deployed" below.

**Result:** production answers `/api/health` with `buildSha: "bd6ab34-dirty"` and serves the SPA
bundle `assets/index-uqDfSY7l.js`, both verified by fetching them back from the live origin.

```
deploying apple as BUILD_SHA=bd6ab34-dirty
Uploaded apple (13.08 sec)
Deployed apple triggers (4.20 sec)
Current Version ID: b477cd57-1595-42f0-9124-724cae18822b
verified — https://apple.moshe-barami111.workers.dev is serving bd6ab34-dirty
/app 14 file(s) — done
verified — every page serves the bytes just uploaded
```

Commands, exactly:

```
node infra/deploy-worker.mjs apple
node infra/deploy-static.mjs --only web
```

---

## 1. Why the order was worker-first, and it was not a guess

The rename to `plan | agent` is a **breaking wire change**, and the measurement that says so is not
inference:

| | measured value |
|---|---|
| deployed worker (`89becd9`) accepted | `const VALID_MODES = new Set<GolemMode>(['clay', 'stone', 'rune'])` |
| deployed SPA sent | `Lt={plan:"clay",agent:"stone",super:"rune"}` — it mapped the product names onto the legacy wire names and put the legacy ones on the socket |
| the new worker accepts | `plan \| agent` only |
| the new SPA sends | `plan \| agent` |
| scale | 102 projects, 32 profiles |

Both orders therefore have a window in which an already-open tab cannot send a message. The two are
not equal, and the difference is what the person is told while it lasts:

- **worker first** → the old bundle hits the **new** worker, which refuses with
  `MODE_SKEW_REFUSAL` — *"This connection is out of date — reload the page to keep building."* The
  person knows what to do, and the reload is what picks up the new bundle.
- **web first** → the new bundle hits the **old** worker, whose message is
  `'Unknown mode for this request.'` — true, and useless. There is nothing to act on.

So the refusal message is the migration mechanism, which is why it was reworded before the deploy
rather than after. The window was closed by running the second deploy in the same shell chain as the
first; the elapsed time between the two uploads is the window, and it is seconds.

**Nothing about this is self-healing on its own.** It works because the refusal names the fix. A
refusal that said "unknown mode" would have left every open tab stuck until the second deploy
landed, and would have looked like a product outage rather than a reload.

## 2. Pre-flight: the schema, not the ledger

The documented failure mode in this repository is code shipping ahead of an unapplied migration
(AGENTS.md §4). The ledger disagrees with the schema, so the ledger was not used.

`mcp__supabase__list_migrations` returns **8** rows and does not contain `0013_product_modes_only`
or `0007`–`0011`. `infra/supabase/migrate.mjs` applies SQL and records nothing — so the ledger
under-reports and has never been the source of truth.

Measured against the live schema instead:

| object | expected from | present |
|---|---|---|
| `messages_mode_check` = `CHECK ((mode IS NULL) OR (mode = ANY (ARRAY['plan','agent'])))` | 0013 | yes |
| rows in `public.messages` / carrying a mode / carrying a retired mode | 0013 | `0 / 0 / 0` |
| `profiles_plan_check` = `free \| builder \| studio \| enterprise` | 0012 | yes |
| `projects.pinned_at` | 0007 | yes |
| `projects.tags` | 0008 | yes |
| `membership_access_outbox` | 0009 | yes |
| `usage_events.credits` + `sync_usage_event_credit_columns()` | 0010 | yes |
| `project_for_link_grant()` | 0011 | yes |
| `projects_owner_pinned_idx`, `projects_tags_idx` | 0007/0008 | yes |

Every migration is applied. Nothing needed to run before the deploy.

`public.messages` is a deprecated mirror — the transcript lives in `SessionDO`'s SQLite, and
`user-export.ts` records `recordedElsewhere: 'messages'` for exactly that reason — so the old worker
cannot violate the new constraint either. The 0 rows are consistent with that, not a coincidence.

## 3. What was verified afterwards, and how

Fetching the bytes back, not reading the deploy log:

```
/api/health                       200  {"ok":true,"buildSha":"bd6ab34-dirty"}
/app/assets/index-uqDfSY7l.js     200  478541 bytes   ← the NEW bundle name
```

The live bundle was then downloaded and searched, because "the new bundle is served" and "the new
bundle sends the new names" are two different claims:

- `plan:"clay"` / `agent:"stone"` — **0 occurrences** (was present in `index-D5BNsDFW.js`)
- `clay` / `rune` / `super-agent` — **0 occurrences**

The three `stone` matches in the local build were checked before shipping and are `milestoneId`,
`milestones` and `milestone`. Retired *mode* vocabulary is gone; an ordinary English word that
happens to contain it is not the same thing.

Full public surface, live:

```
/                    200  60250      /app                 200  1797
/pricing             200  62270      /app/assets/…js      200  478541
/docs                200  44101      /api/health          200  90
/changelog           200  47255      /showcase            200  54634
/privacy             200  48112      /proof               200  46993
/terms               200  42314      /status              200  42951
```

## 4. What was NOT deployed, and why

**The static site.** `apps/site` is being rewritten in place by another worker — `pricing.astro` was
written at 19:45:48, `apple-minimal.css` / `DocsLayout.astro` / `LegalLayout.astro` at 18:26:11–18,
and `tests/e2e/landing.spec.ts` is itself uncommitted and currently red. `node
infra/deploy-static.mjs --only site` uploads `apps/site/dist` straight to `/`; running it would
publish a half-finished landing page to the live marketing site. `--only web` uploads
`apps/web/dist` to `/app` and cannot touch `apps/site`, which is why the SPA went and the site did
not.

That also means **the site's own defects are not fixed by this deploy** — see
`2026-09-22-browser-qa.md`, where two of the three findings live in `apps/site`.

## 5. One thing that was checked because it can throw

`systemPrompt` now refuses an unknown mode rather than silently dropping the whole mode block. A
throw in production is worse than a degraded prompt, so every path into it was traced before the
deploy:

- `systemPrompt(` has exactly **one** call site: `do/session.ts:3016`.
- It receives `mode` from `startRunInner`, whose `mode` comes from `startRun`.
- All three `startRun` call sites are guarded: `/agent-run` returns 400 on `if (!runMode)`
  (line 2203); both WebSocket paths refuse on `if (!mode)` before reaching it (lines 2627, 2708).

The throw is therefore unreachable from any request. It is a development-time invariant that turns a
future silent degradation into a loud failure, which is the whole reason it exists.
