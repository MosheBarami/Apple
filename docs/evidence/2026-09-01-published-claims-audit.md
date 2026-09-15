# Auditing what the site tells people against what the code does

**Date:** 2026-09-01 · **Mission Phase I / §15.** The product's rule is that it must
never tell a user something it has not established. That rule applies to the marketing
and documentation surfaces too, and nobody had checked them against the implementation.

Method: take every claim on the public site that is *checkable from the repository* —
numbers, thresholds, guarantees, capability lists — and verify it. Claims about policy or
about a third party's behaviour are out of scope, because the repository cannot settle
them.

## What was wrong

### A Plan request costs 2 credits, not 1

The worker charges `creditsForNeurons(n) = max(1, ceil(n / 30))`. `docs/COST-MODEL.md`
measures a Plan question at 37–43 neurons, so `ceil(43/30) = 2`, and 60 free credits buys
**30** a day rather than 60. Agent (111 → 4) and Super Agent (297 → 10) were both exactly
right, which is what makes this an arithmetic slip and not a different model of pricing.

The figure was in **six** places. Worse, inside the calculator it was in three more — the
visible label, the `data-cost` attribute, and a literal `c * 1` in the script that ignored
the attribute — so correcting the first two left the arithmetic unchanged. Caught only
because the rendered total disagreed with hand arithmetic.

Two pre-rendered figures were also already wrong before any of this: the no-JS fallback
said 46 where the script computed 48.

### The site named the internal specialists 96 times

`packages/shared/src/index.ts`:

> Clay, Stone and Rune are internal specialist identities, not user-facing brands:
> nothing in normal product UI should name them.

§15.3 gives the public modes as Plan / Agent / Super Agent. The app offers exactly those,
and `roadmap/model.ts` goes as far as regex-replacing the specialist names out of worker
copy before rendering. The documentation site named them across nine files — the docs nav
label, a page title, every mode heading, the pricing table, the changelog and the FAQ. A
reader learned "Clay", opened the app, and found no such thing.

### The quota does not reset on a rolling clock

`QuotaDO` does `setUTCHours(24, 0, 0, 0)` — one fixed instant shared by every account.
The pricing FAQ said "daily, on a rolling 24-hour clock per account" and the credits docs
said "every 24 hours per account, on a rolling clock". The worker's own error strings
already said the true thing: "It resets at midnight UTC."

Not academic. Under a rolling window, credits spent now return in 24 hours. Under a fixed
midnight, someone building at 23:00 UTC gets them back in an hour and someone starting at
00:30 waits nearly a full day.

### The Privacy Policy promised to be updated before a thing that already exists

Recorded in `BLOCKERS.md` and deliberately not fixed here, because it is legal text and a
consent control. `/privacy` says an opt-in training program will be "a separate, explicit,
off-by-default choice — and this policy will be updated before it exists". The toggle is
in Settings today, writing `profiles.training_opt_in`. `/docs/privacy-and-data` says more
strongly that there "is no fine-print exception".

Nothing reads the flag — no reader in the worker, evals or corpus — so no project data has
been or can be used. It is a consent-and-documentation inconsistency, not a data-handling
failure.

## What held up

Reporting only the failures would misrepresent the audit, so:

- **Pairing codes.** Every one of six precise claims verifies: six characters
  (`getRandomValues(new Uint8Array(6))`), an alphabet with no O, I, L or 1
  (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), a 10-minute expiry (`TTL_MS = 10 * 60 * 1000`),
  single use (`storage.delete(key)`), case-insensitive and punctuation-ignoring (the
  plugin's `gsub(upper(text), "[^A-Z0-9]", "")`).
- **The status page.** It says it "checks the live API from your own browser — the same
  endpoint the app uses", and it does: a relative `fetch('/api/health')`, which resolves
  because the worker serves the site and the API from one origin. `/api/health` answered
  200 in 145 ms when checked.
- **"Our own servers hold no master key."** The worker holds `SUPABASE_ANON_KEY` and
  `SUPABASE_URL` and no `service_role` key anywhere. The one `service_role` reference in
  the schema is a trigger that *blocks* users from editing their own `plan` and
  `is_admin`, which is the opposite of a bypass.
- **"Cannot act on places you did not connect."** True, and enforced by Studio rather
  than by Golem: the plugin runs per DataModel, each open place gets its own instance with
  its own `session` starting `nil`, and the plugin additionally refuses to drive from the
  Play Solo copy. I had this queued as a suspected defect — nothing binds a `placeId`
  anywhere — and it dissolved on reading how Studio loads plugins.
- **The plugin capability list.** Every "can" maps to a real op in `Ops.luau`, and no op
  exists for anything in the "cannot" list. There is no publish op.
- **"Deleting a project removes its chat history, checkpoints and Studio pairing
  forever."** This one needed an authoritative answer rather than a reading. Messages and
  checkpoints live in SQL tables created with `this.sql.exec`, and `/purge` calls
  `ctx.storage.deleteAlarm()` then `ctx.storage.deleteAll()` — so the question is whether
  `deleteAll()` reaches SQL tables or only the key-value API. Cloudflare's own
  documentation settles it, in the opposite direction to the intuition: *"It is not
  sufficient to simply delete the specific data that you wrote, such as deleting a key or
  dropping a table... The only way to remove all storage is to call `deleteAll()`."* The
  purge is correct, and the explicit `deleteAlarm()` before it is right for any
  compatibility date — `deleteAll()` only removes the alarm from `2026-02-24` onward.
  Live sockets are closed with `ws.close(1000, 'project deleted')` first.
- **`/docs/plugin`'s honesty about not being installable.** It states plainly that the
  Creator Store route does not work yet and that the steps below will not work — rather
  than sending a reader to a page with nothing on it.

## Guards

`scripts/check-credit-figures.mjs` walks the whole chain in CI — COST-MODEL neurons, the
worker's own constants, the page's stated cost, the slider attribute, requests per day,
every prose page that states a cost, and the reset wording against `QuotaDO`. It names
which COST-MODEL row each published figure derives from, because "Stone" has four rows and
only one is the advertised case, and it reads the neuron figure by the internal name while
checking the published figure by the public one.

`scripts/check-site-semantics.mjs` fails if any specialist name appears in visible copy on
a built page, with script and style contents stripped first so a CSS class like `is-clay`
is not mistaken for something a reader is told.

Both mutation-proved in both directions. One lookbehind in the credit guard is
load-bearing: "Agent" is a substring of "Super Agent", and without it every
"Super Agent — 10 credits" was reported as Agent costing 10 — five false positives against
a correct file.
