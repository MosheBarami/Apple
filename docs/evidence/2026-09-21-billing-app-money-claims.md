# The app's own money claims, and what is still open on billing — 2026-09-21

Round 3 of the billing track. Rounds 1 and 2 are in
`docs/evidence/2026-09-20-billing-wiring-and-signup-funnel.md` and are not repeated here; this
records what they did not cover, what was re-measured tonight, and what remains OPEN.

---

## 1. Two false money sentences were shipping in `apps/web`

`apps/site/tests/credit-refund-claims.test.mjs` holds four published pages to the refund
`apps/worker/src/run-refund.ts` actually gives. It reads `apps/site/src/pages/**/*.astro` and
nothing else. Both sentences below were on the other side of that glob, and both were true when
they were written and became false on 2026-09-20, when QuotaDO gained `/refund` and SessionDO began
calling it.

### `ws/outcome-model.ts` — "That used the last of today's Credits."

Rendered for **every** `quota` stop. `do/session.ts` sends `quota` from four places:

| ending | whose allowance | worker's own reply |
|---|---|---|
| `BudgetError` (daily/monthly cap, **or an administrator pause**) | the service's | "An administrator paused generation…" |
| `CAPACITY_EXHAUSTED` | the service's | "Apple has reached today's shared building capacity…" |
| `creditsRemaining <= 0` at a step boundary | the reader's | "I paused because your daily Credits ran out." |
| allowance exhausted mid-settlement | the reader's | "That used the last of your Credits for today." |

So the sentence was false about *whose* on two of the four. It was also wrong about the money on
all four: `'quota'` is in `REFUNDABLE_REASONS`, so a run that ended there having kept nothing has
every Credit put back — and `finishRun` appends `refundSentence` to the reply, which `turn.tsx`
renders **directly above** this line. The product contradicted its own signed sentence about
somebody's money, one line apart.

### `lib/announce.ts` — the same sentence again

`OUTCOME_SPEECH` keeps a second copy for the live region. Fixing `outcome-model.ts` and grepping
the source read as complete; the sentence survived in the **built bundle**. A listener has less
chance than a reader of catching it, because the reply that states the refund has already been
spoken and gone.

### `routes/admin.tsx` — the owner's own kill switch

The confirm dialog for "Stop all AI generation?" said anyone mid-build "loses the steps they were on
and the Credits those steps cost, and **nothing is refunded automatically**". Pausing raises
`BudgetError('killed')` → `finishRun(agent, 'quota')` → refundable. A paused run that had not yet
changed anything has every Credit put back automatically. The half that survived is the other
branch: a run that had already built something delivered, so it is charged.

**Shipped and verified live.** `node infra/deploy-static.mjs --only web` — deliberately not a full
deploy, because `apps/site/src/pages/index.astro` and `Nav.astro` were dirty in the landing lane's
hands. Verified by sha256 of the served bytes against the local build
(`index-CMtGTYsw.js` d3dbe5a3…, `admin-DgT3eGIW.js` ac7f9281…, `index.html` 284419b7…, all three
identical) and then by reading the sentences back off the live origin.

**A failed measurement, recorded as one.** The first fetch of the admin chunk used the pre-commit
build's hash and returned 1,797 bytes of `index.html` — the SPA fallback. Its "0 hits for the stale
sentence" was the fallback page, not the chunk. The real chunk was fetched by name afterwards.

**Guard:** `apps/web/tests/failed-run-money-claims.test.mjs`, 7 tests, aimed at the surface the
site's guard cannot see. It asserts its premise first — `'quota'` refundable, `BudgetError`
carrying `'killed'`, `session.ts` still writing all four endings — so it fails naming *itself* stale
if the product drops the rule.

---

## 2. Re-measured tonight, and holding

* **golem's QuotaDO ledger repair holds.** golem still serves `3568b05`, which carries the
  `pragma_table_info('ledger')` migration and the `/billing-replica` handler.
* **`mutationWouldApplyToBoth` is still `false`**, `why: stripe_api_key_is_a_test_key_in_production`.
  Owner-blocked: Stripe needs an adult account holder.
* **Supabase auth config, read live through the Management API:** `site_url` and `uri_allow_list`
  both on the apple origin, **no `localhost` anywhere**, `mailer_autoconfirm: true`,
  `smtp_host: null`, `rate_limit_email_sent: 2`.
* **The bundle I shipped tonight does not regress the funnel.** Zero `http(s)://localhost` in the
  served JavaScript; `emailRedirectTo: hn("/confirm")` and `redirectTo: hn("/reset")`, where `hn`
  is `${window.location.origin}/app${path}` — read off the live bytes, not the source. Both are
  matched by `…/app/**` and again by `…/**`.
* **`/app/signup`, `/app/login`, `/app/confirm`, `/app/reset`, `/app/admin` all 200.** `/api/me`
  answers 401 with no token and 401 with a forged bearer.
* **No account was created by this lane.** `select count(*) … from auth.users` → 32 users, newest
  `2026-08-30 17:21:54+00` — byte-identical to round 1's reading. Nobody has signed up since
  2026-08-30, and this session did not change that.

---

## 3. Still OPEN

1. **A failed run records THAT it failed and never WHY.** The whole patch is written out in
   `docs/backlog/HANDOFF-BILLING-RUN-FAILURE-REASON.md`. Its session.ts half is one line, and
   `apps/worker/src/do/session.ts` has been dirty with another lane's uncommitted retry ladder for
   the whole of rounds 2 and 3. Not started, by the shared-tree rule. Do not apply the analytics
   half alone: it ships a field nothing writes.
2. **No mutation can originate at all** until a live Stripe key exists. Owner-blocked.
3. **Password recovery mail runs on Supabase's shared sender at 2/hour.** `mailer_autoconfirm: true`
   means signup sends nothing, so this does not block a signup — it blocks the flow a person reaches
   for when a signup seems not to work. Fixing it means creating an account with a mail provider.
4. **`replicaBound` is a presence check, not a reachability one.** It is
   `Boolean(env.LEGACY_QUOTA_DO)`. apple has never called golem's `/billing-replica` in production
   and nothing in the product shows it would answer; the two-store contract is proved locally by
   `apps/worker/tests/billing-webhook-authority.test.mjs` against two real `node:sqlite` QuotaDOs,
   and reaching the real replica needs a signature-verified Stripe event. Not fixable from here.

---

## 4. Found, not billing, not fixed

**CI is red on `main` and it is not this track.** `apps/web/tests/contrast.test.mjs`, "the landing
declares no colour token it does not use", fails on a **clean, committed**
`apps/site/src/styles/landing.css`: `card`, `font-display`, `font-sans`. `pnpm -r test` runs
apps/web, so this fails the whole CI run.

One of the three is a **false positive, and the obvious fix would break the site.** The test looks
for `var(--x)` inside `landing.css` only. `--font-display` is read by
`apps/site/src/styles/global.css`, `components/Footer.astro`, `components/Nav.astro` and
`pages/proof.astro` — it is doing exactly the job it was declared for. This is the blind spot the
test's own comment already documents for `--theme-color` (read from a script), recurring in a second
form: read from another stylesheet. `--card` and `--font-sans` have no reader I could find anywhere
in `apps/site/src` or `apps/web/src`.

Left alone: it is the landing lane's stylesheet and the design lane's test, and deleting
`--font-display` — which is what a person reading the failure would do — changes the typography of
four files.
