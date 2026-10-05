# Sign in with Roblox: design, the key decision, and how to switch it on

Handoff M2, "Roblox sign-in moves here": tasks O0 to O3 and O5 of `planning/roblox-oauth-setup.md`.
Built on branch `studpilot/m2-roblox`. **Nothing here is switched on or deployed.** No network was called while
building it: Roblox and Supabase are mocked in the tests, and what the mocks assume is listed in section 6.

**Updated 2026-10-05 after an independent review of this branch.** It found a login CSRF, an address-squatting lock-out,
a disconnect that could delete the only handle on a grant, and four weaker points. Section 10 says what each was and
what changed; sections 1, 2, 5 to 9 below are already rewritten to the current design. Where an old line of section 9
tested the fragment design that was replaced, it says so.

## 1. What a person sees

1. On the sign-in and sign-up pages a "Continue with Roblox" button appears, but only when the worker says it can
   finish a sign-in (`GET /auth/roblox/status` answers `{"configured": true}`). Today it answers `false`, so
   the button stays hidden until the three secrets of section 4 are on the Worker.
2. The button goes to `/auth/roblox/start`, then to Roblox, then back to `/auth/roblox/callback`, then to the app at
   `/app/auth/roblox`, which signs them in and sends them where they were going. If somebody is already signed in in
   that browser, the page asks first ("Switch to my Roblox account" or "Stay signed in") and replaces nothing until they
   choose.
3. In Settings, under Connections, a card "Sign in with Roblox" shows the linked Roblox username and a
   "Disconnect Roblox" button.
4. Only `openid profile` is requested. The asset scopes (`asset:read asset:write`) arrive with uploads (M5c), with
   their own consent screen. Adding scopes later makes every user consent again, so none is asked for early.

O0 (the domain) was done in M1, step 1.5 (commit `a7d23218`: `https://studpilot.app` is the product origin). The
redirect URI here is built on it.

## 2. How it works

```
browser            worker (studpilot.app)                       Roblox                 Supabase Auth
  | GET /auth/roblox/start          |                              |                        |
  |-------------------------------->| state + PKCE verifier -> KV (600 s, single use)
  |<-- 302 authorize?...S256 --------| Set-Cookie rbx_oauth_state (HttpOnly, Lax)
  |------------------------------------------------------------>| user consents
  |<-- 302 /auth/roblox/callback?code&state ---------------------|
  |-------------------------------->| state read and DELETED; cookie must match
  |                                 |-- POST v1/token (code + verifier + client secret) -->|
  |                                 |-- GET v1/userinfo ---------->|  sub, preferred_username
  |                                 | link by sub (D1 roblox_identities); a link to a deleted user is dropped; first sight:
  |                                 |-- POST /auth/v1/admin/users (KEYED synthetic address) -->|
  |                                 |-- POST .../generate_link (the user's CURRENT address) -->|
  |                                 | token_hash -> KV under a random handle (300 s, single use)
  |<-- 302 /app/auth/roblox   NOTHING in the URL; Set-Cookie rbx_oauth_handle (HttpOnly, Secure, Lax, Path=/auth/roblox/redeem)
  | SPA: somebody already signed in here? Ask, redeem nothing. Otherwise:
  |-- POST /auth/roblox/redeem (same Origin, cookie, no body) -->| handle read and DELETED; cookie cleared
  |<-- { token_hash, next } ---------------------------------------|
  | SPA: supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) ------------------------>|
  |<-- a real Supabase session (the worker never signed a JWT) ---------------------------------|
```

- **Accounts are found by the Roblox `sub` and by nothing else.** A Roblox username can be changed and reused, so
  linking by it would let a second person take an account over. A new username on the same `sub` is a rename
  (`roblox_identities.username` is updated); the same username on another `sub` is a different user.
- **The Supabase user** has the address `roblox-<32 hex>@users.studpilot.invalid` (RFC 2606 `.invalid` can never be
  delivered to), `email_confirm: true`, `user_metadata.display_name` = the cleaned Roblox name (so the profile is
  not named after the synthetic address), and `app_metadata.roblox_sub` = the `sub`, which is the real link.
- **The address is a keyed digest of the `sub`, not the `sub`.** A Roblox id is public, so `roblox-<sub>@...` could be
  registered by anybody through the open sign-up before the real Roblox user arrived, and that user would be refused
  for good. The 32 hex characters are the first 128 bits of HMAC-SHA-256 of the `sub` under a subkey (an HMAC of the fixed
  label `studpilot:roblox-signin-address` under `CREDENTIAL_KEY`), made by `keyedId` in `user-credentials.ts`; an outsider
  cannot compute it. Nothing is deployed, so no user holds the old, derivable address.
- **An address somebody holds is never adopted unless our `app_metadata` is on it.** If Supabase says the address exists,
  the worker mints a link to read the user's `app_metadata` and adopts the user only if it names the same `sub` (people
  cannot write `app_metadata`; only the Auth admin API can). That lets a sign-in that stopped halfway finish next time.
  Any other holder fails closed with its own answer: status 409, the reference `roblox_address_taken` on the page,
  and the log stage `synthetic address taken`, so an operator can tell it from a Roblox or Supabase outage.
- **A link to a deleted user is dropped.** If `roblox_identities` points at a Supabase user that Auth no longer has (GoTrue's
  own 404 `user_not_found`), the identity row and that user's token row are deleted and the sign-in goes on as a first
  sight. A 404 that is not GoTrue's (a wrong `SUPABASE_URL`, a proxy page) and an unreachable Auth are NOT read as "gone":
  the sign-in fails, because acting on them would delete every returning person's link or make a second account.
- **The sign-in token is bound to the browser that finished the callback.** The callback stores the token hash in KV under a
  random 256-bit handle (300 s) and sets the handle in a cookie that is HttpOnly, Secure (on https), SameSite=Lax and scoped
  to `Path=/auth/roblox/redeem`. The redirect carries nothing, so no link anyone can make signs in a person who does not
  hold the cookie. `POST /auth/roblox/redeem` requires the request's own `Origin` (checked before anything is spent), reads
  and burns the handle, returns `{token_hash, next}` once and clears the cookie.
- **The refresh token** is sealed with `CREDENTIAL_KEY` (the same AES-GCM helper the Open Cloud key uses) in
  `roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, rotated_at, lease_until)`. Roblox refresh
  tokens are single use. A fresh sign-in REPLACES the stored token and deliberately does not revoke the previous one
  (section 10, item 5). `refreshRobloxAccessToken` first claims a lease on the row (a conditional update on
  `version` and `lease_until`), only then calls Roblox, then stores the replacement by compare-and-swap on
  `version`. Two requests at once: one refreshes, the other is told `busy`. A sign-in or disconnect that lands
  while Roblox is answering wins, and the stale replacement is discarded and revoked. The 15-minute access token is cached
  per person in the isolate's memory and handed out only while it is unexpired and the row is still at the version it was
  issued under, so a new sign-in voids it and a disconnect (no row) is answered before the cache is read. A Roblox 429 is
  `unavailable` (try again), not `refused` (the grant is dead). Nothing calls it yet; it is the building block for uploads (M5c).
- **Disconnect** (`POST /api/me/roblox/disconnect`, JWT-authed) revokes the grant at Roblox with the stored token,
  deletes the token row and the identity link, and is idempotent. NOTHING is deleted, and no success is reported, unless
  the revoke is confirmed (the sealed token is the only handle to revoke with): a missing secret is a 503
  (`unavailable`), a sealed token that cannot be opened (a rotated key) is a 500 (`token_unreadable`), Roblox not
  answering or refusing is a 502 (`revoke_failed`), and none of them carries a `revoked` field. Roblox answering 400
  counts as "already revoked" ONLY when its body says `invalid_token`, the documented case; any other 400 (our own request
  or credentials were wrong, so the token may be live), a 401, a 429 or a 5xx is a failure. A success says `revoked: true`
  (Roblox confirmed) or `null` (there was no stored token), and the web card words a withdrawal only for those.
- **Export and erasure.** Both tables are in the account export (`user-export.ts`; the sealed token and the
  lease are withheld and the file says why) and in account erasure (`erasure.ts`): the grant is revoked at Roblox
  first, then both tables are swept, with a receipt line each and a note on whether Roblox was reached.
- **Hardening on `/auth/roblox/*`:** `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, the router's `ipLimited` (20 a minute for start, callback and redeem, 120 for status),
  one fixed sentence on every error page (nothing Roblox sent is reflected), and no log line that carries a query
  string, a token, a code, a state, a handle or a response body (the only line is `[roblox-oauth] <stage>`). An `oauth_token`
  redaction rule was added to the worker's `redaction.ts` (credential shapes only; it blocks egress, so a field NAME is not
  enough) and, as a wider net for a log line, to the browser's Sentry scrub.

## 3. The decision: the Worker now holds a Supabase secret key

Until now the worker held no Supabase secret: every database call travels with the caller's own JWT, so row-level
security decides, and `docs/SECURITY.md` says "the worker never uses a service-role key". **`SUPABASE_SECRET_KEY` is
the first credential on the Worker that can act as anyone.**

**Why it is needed.** Roblox gives no email (`openid profile` has none), and Supabase's Auth needs an identity to put
a session on. The worker has to create a user and ask Supabase to sign them in, and only the Auth admin API can do
either without the person's password or an inbox.

**What limits it.** It is used in one file (`roblox-oauth.ts`) for three Auth admin calls (create a user, read a
user's address, mint a one-time sign-in token) and never for a table query. With any secret missing, every route
answers 503 and `SUPABASE_SECRET_KEY` is never used. The worker still signs no JWT. The key can be revoked on its own
in the Supabase dashboard; create a **dedicated** secret key for this (name it for the Worker) so that it can.

**Alternatives rejected.**
- *The worker signs its own JWT.* Needs Supabase's JWT signing key, which is a larger secret than a secret API
  key (it mints any session for any claim, and cannot be revoked separately) and makes the worker an identity provider.
- *A Supabase Edge Function holds the key and the worker calls it.* The same secret in another place, a second
  deploy target, and one more hop in a sign-in; the blast radius is the same.
- *A session system outside Supabase.* Every table's RLS policy is written against `auth.uid()`; nothing would work.
- *Link Roblox to an email account by asking for an email.* Possible later as a Connect step; it does not give "Continue with
  Roblox" a way to make an account.
- *Supabase's own provider list.* There is no Roblox provider.

**What else it changes.** The account-deletion receipt used to say the worker holds no service credential; its text
now says it holds one only for Roblox sign-in and never uses it to delete accounts. `docs/SECURITY.md` has a dated
update under its design properties, and `AGENTS.md` section 4 says where it is used.

## 4. What the operator must do to switch it on

Four secrets must all be on the Worker, or every route answers 503 and the button stays hidden:

| Secret | Value |
|---|---|
| `ROBLOX_OAUTH_CLIENT_ID` | `5523165872353873834` (public; the registered app) |
| `ROBLOX_OAUTH_CLIENT_SECRET` | the secret from the Creator Dashboard (owner action X4: regenerate it before public launch) |
| `SUPABASE_SECRET_KEY` | a **new, dedicated** secret key from Supabase, Settings, API Keys (`sb_secret_...`) |
| `CREDENTIAL_KEY` | already needed by the Open Cloud key feature; confirm it is set with `wrangler secret list` |

```
cd apps/worker
npx wrangler secret put ROBLOX_OAUTH_CLIENT_ID     --config wrangler.studpilot.jsonc
npx wrangler secret put ROBLOX_OAUTH_CLIENT_SECRET --config wrangler.studpilot.jsonc
npx wrangler secret put SUPABASE_SECRET_KEY        --config wrangler.studpilot.jsonc
```

Then deploy only through the two scripts, from a clean tree: `node infra/deploy-worker.mjs studpilot`, then
`node infra/deploy-static.mjs` (the SPA is in the static store), and check that `buildSha` at `/api/health` equals the
`main` HEAD. Never paste a secret value into a chat, a file or a commit.

**The live check to run afterwards:**

```
curl -sI https://studpilot.app/auth/roblox/start
```

must show `HTTP/2 302` and a `location:` that starts `https://apis.roblox.com/oauth/v1/authorize?` and contains
`client_id=5523165872353873834`, `code_challenge_method=S256` and `scope=openid%20profile`, plus a `set-cookie:
rbx_oauth_state=` and `cache-control: no-store`. Before the secrets are set the same command shows `503`, and
`curl -s https://studpilot.app/auth/roblox/status` shows `{"configured":false}`; after, `{"configured":true}`.
Then the handoff's own check for O2: the owner signs in with Roblox in a private window (the app is in Roblox's
private mode, 10 users, until review) and lands in the app.

## 5. What was built, and where

Worker: `apps/worker/src/roblox-oauth.ts` (new); `keyedId` in `user-credentials.ts`; wiring in `index.ts`; `env.ts` (three
optional secrets); `erasure.ts`, `user-export.ts`, `account-export.ts`; `redaction.ts`.
Web: `lib/roblox-signin.ts` (the button's and the landing page's logic and hooks), `components/roblox-connection-card.tsx`
(new); `routes/auth-pages.tsx` (button, landing page), `app.tsx` (route `/auth/roblox`, outside both guards like
`/confirm`), `routes/settings.tsx`, `lib/settings-search.ts`, `lib/api.ts`, `lib/sentry.ts`.
Tests: `apps/worker/tests/roblox-oauth.test.mjs` (64), `apps/web/tests/roblox-signin.test.mjs` (23) with its helper
`apps/web/tests/hook-harness.mjs`, plus cases in `secret-redaction.test.mjs` and `sentry.test.mjs`.

**Additions beyond the brief, each with its reason:**
- *The state is also bound to the browser by a cookie, and so is the sign-in token.* A state that lives only in KV allows
  login CSRF: an attacker starts a flow, finishes it on their own Roblox account, and gives the callback link to somebody
  else, who is then signed in as the attacker. PKCE does not stop that, because the verifier is in KV, not in the victim's
  browser. The review found the same attack one step later (a token in the landing link); the handle cookie closes it.
- *The refresh row has a lease column.* A compare-and-swap at write time cannot stop two requests both spending a
  single-use token; claiming the row before calling Roblox does.
- *Disconnect keeps the sign-in link while Roblox is the account's only way in* (its address is still the synthetic
  one). Without the link the next Roblox sign-in would open a new empty account and this one would be unreachable.
  The grant is still revoked and the token deleted; the answer says `signInKept: true` and the card explains it.
- *A bad `return` path is dropped, not answered with an error.* The flow goes on to the default landing; a path
  that is not an app screen is never followed. Allowed: `/`, `/usage`, `/settings`, `/projects/<id>` (and
  `/roadmap`, `/branding`), `/join?token=...`.
- *A start on any other host is sent to `studpilot.app` first,* so the cookie is on the host Roblox returns to.
- *`CREDENTIAL_KEY` counts as required,* because the refresh token is sealed with it and a code exchanged and then
  not storable would be a wasted sign-in.
- *`roblox_identities.user_id` has a unique index:* one Roblox account per StudPilot account.
- *Two existing guards were restated because the code got better, not worse:* the export-inventory test read
  `api-keys.ts` by name and now finds each exported table's own file; the command-palette test is a tripwire on the
  routes outside the shell, and `/auth/roblox` is reviewed in its comment (a visitor has no session until the page
  finishes).

## 6. What is not verified, and the first things to watch on the first live run

The mocks encode my reading of the Roblox and Supabase documentation. None of this was observed against the live
services. In order of how likely each is to need a fix:
1. **The `.invalid` address.** If Supabase's address validation refuses `@users.studpilot.invalid` on admin create, the
   first sign-in fails with the generic error. The fix is one constant (`SYNTHETIC_EMAIL_DOMAIN`).
1a. **What the mock assumes GoTrue does** (review round). A magic link for an address nobody holds SIGNS THAT ADDRESS UP and
   mints the link for the new user, instead of answering 404; the worker therefore always asks for the user's CURRENT
   address, read fresh, and checks the link is for the same user id. And GoTrue's admin GET of an unknown id answers 404
   with `error_code: user_not_found`; that exact shape is what the stale-link rule believes. Both are from memory of
   GoTrue, not observed: the first live run should sign in, set a real address under Security, and sign in again.
1b. **Re-sign-in does not revoke the previous refresh token** (section 10, item 5). If Roblox ties all tokens of one
   authorization together, nothing is lost. If it does not, the old token stays live at Roblox and is held nowhere here. Watch
   for it by signing in twice and refreshing once; if Roblox lists two authorizations, revoke the old one in `storeRefreshToken`.
2. **`generate_link`'s response shape.** The worker reads `hashed_token`, `id` and `app_metadata` at the top level, or
   under `properties` and `user`.
3. **Secret key header.** An `sb_secret_` key is sent as `apikey` only; a JWT-shaped legacy key is sent as the bearer
   too. If the Auth server wants both, `admin()` in `roblox-oauth.ts` is the one place.
4. **Roblox token calls** send `client_id` and `client_secret` in the form body with `redirect_uri` and the verifier, and
   `userinfo` is read for `sub` and `preferred_username` (falling back to `nickname`, then `name`).
5. **The `RBX-` prefix** on Roblox tokens and secrets is from memory; the redaction rule also catches
   `refresh_token=`, `client_secret=` and the other names in a body, a fragment or JSON when the value has a credential's
   shape, so it does not depend on it. The revoke endpoint's `invalid_token` answer is the task's reading of Roblox's
   documentation; if Roblox words an already-revoked token differently, disconnect answers 502 for it (nothing is lost).

## 7. Deferred, and not done here

- **Local dev.** The registered dev redirect `http://localhost:5173/auth/roblox/callback` is honoured by the origin
  allowlist, but a dev run does not get there: `index.ts`'s global http to https redirect answers every plain-http
  request (including localhost) before any route, and Vite does not proxy `/auth`. Changing a security middleware
  was out of scope; the status check fails closed there, so the button stays hidden.
- **The privacy page** must say what Roblox data is held and that none of it trains AI (task O6, M7).
- **Nothing consumes the synthetic address.** Stripe checkout is off; when it is switched on, a receipt address of
  `@users.studpilot.invalid` must be handled, and a Roblox user has no inbox for password reset.
- **The account-deletion route still does not remove the Supabase login** (it never could); the worker now holds a
  key that could, and that is a decision for the owner, not a side effect of this change.
- **`ipLimited` is per isolate,** like every other limiter here: best effort, not a global ceiling.
- **KV is eventually consistent.** A replayed callback that reaches another colo within seconds could still see the
  state; the cookie (cleared on first use) and Roblox's own single-use code are what stop it. The same holds for the
  handle: a redeem that reached another colo before the callback's write had propagated would see no handle and the page
  would say it could not sign the person in (they try again); a replayed redeem needs the cookie as well.
- **"Stay signed in" leaves the handle for its five minutes.** It is HttpOnly, scoped to the redeem route, tied to this
  browser and its own Roblox account, and only same-origin script can spend it, so it is left to expire rather than spent.
- **The choice appears for any existing session,** including one for the same Roblox account: who the token is for is not
  known until it is redeemed, and redeeming is what must wait for the person.
- **The handle cookie is Secure only over https.** Production is always https; the registered dev origin
  `http://localhost:5173` is plain http, where some browsers refuse a Secure cookie (the same rule as the state cookie).
- **The access-token cache is per isolate.** Parallel callers in different isolates are still kept apart by the lease
  (one is told `busy`), not by the cache.
- **The web Sentry scrub keeps the wider `oauth_token` pattern.** It scrubs a log line and blocks nothing, so over-matching
  costs a reader nothing; only the worker's rule, which also blocks egress, is limited to credential shapes.
- **Uploads (O4), the 13+ check, the Roblox review package and the thumbnail** are later milestones.

## 8. Measured results (2026-10-05, branch `studpilot/m2-roblox`, Node 26.8.1)

After the review round (section 10). The last column is what this section said before it.

| Command | Result | Before the review round |
|---|---|---|
| `cd apps/worker && pnpm typecheck` | exit 0 | exit 0 |
| `cd apps/worker && node --test` | tests 5495, pass 5489, fail 0, skipped 6 | 5472, 5466, 0, 6 |
| `cd apps/web && pnpm typecheck` | exit 0 | exit 0 |
| `cd apps/web && node --test` | tests 2478, pass 2478, fail 0 | 2466, 2466, 0 |
| `node --test tests/` (root) | tests 631, pass 613, fail 2, skipped 16. The two failures are the scratchpad-location cases in `tests/check-pixels.test.mjs` ("THE CONTROL: against a SAME-ORIGIN baseline..." and "against a baseline with NO provenance..."), which fail when the clone lives under a scratchpad path | the same |
| `node scripts/check-old-names.mjs` | CLEAN, 0 violations, 46138 hits, all allowlisted (the count did not move; UNCLASSIFIED 0) | the same |
| `pnpm build` in `apps/web`, then `node scripts/check-app-bundle.mjs` | entry 141.5 kB gzipped (budget 150), eager graph 267.1 kB | 141.0 kB, 266.6 kB |

New tests since the first version: `roblox-oauth.test.mjs` 42 to 64 (+22), `roblox-signin.test.mjs` 11 to 23 (+12, and every
one of the 11 old ones was replaced or restated as behaviour), `secret-redaction.test.mjs` +1. Worker +23, web +12.

A local-only browser check was made on the first version (the Vite dev server, every non-localhost request aborted, the
status route stubbed): the button shows on `/app/login` and `/app/signup` at 1280 and at 375 pixels with no horizontal
scroll and is absent when the status says `false`. **It was not repeated after the review round**: the landing page now
needs the worker's redeem route, which the dev server does not serve, so what was observed there (the failure card) is
what the behaviour tests now execute, and the live check of section 4 is the first time the whole path is seen.

## 9. The mutations: every new test was made red, then green

Each line is one change to the source, made one at a time with the tests that should notice it run immediately, then
undone by the exact reverse replacement (the harness checks the file is byte-identical afterwards; `git diff` before
the first and after the last had the same SHA-256). `red N (N of M)` is how many tests in that file failed. 71
mutations, 71 red. One test was mis-aimed on the first run (`M08`: the forged-state case was refused by the cookie
check, not by the missing state) and was fixed before it was recorded as red.

```
RED  M01 callback never succeeds: roblox-oauth.ts -> red 12 (12 of 42); expected: POSITIVE CONTROL
RED  M02 PKCE method plain: roblox-oauth.ts -> red 1 (1 of 42); expected: the authorize request carries
RED  M03 asks for asset scopes at sign-in: roblox-oauth.ts -> red 1 (1 of 42); expected: the authorize request carries
RED  M04 challenge made from the state, not the verifier: roblox-oauth.ts -> red 30 (30 of 42); expected: the authorize request carries, the code exchange sends
RED  M05 verifier not sent: roblox-oauth.ts -> red 29 (29 of 42); expected: the code exchange sends
RED  M06 client secret not sent: roblox-oauth.ts -> red 29 (29 of 42); expected: the code exchange sends
RED  M07 redirect_uri origin taken from the request unchecked: roblox-oauth.ts -> red 1 (1 of 42); expected: the redirect_uri is built
RED  M08 unknown state accepted: roblox-oauth.ts -> red 2 (2 of 42); expected: a state nobody issued
RED  M09 state not burned: roblox-oauth.ts -> red 3 (3 of 42); expected: a state can be used once
RED  M10 browser cookie not checked: roblox-oauth.ts -> red 1 (1 of 42); expected: a state issued to one browser is refused
RED  M11 cookie not HttpOnly: roblox-oauth.ts -> red 1 (1 of 42); expected: the state cookie is HttpOnly
RED  M12 cookie not cleared after the callback: roblox-oauth.ts -> red 1 (1 of 42); expected: the state cookie is HttpOnly
RED  M13 failed exchange not checked: roblox-oauth.ts -> red 1 (1 of 42); expected: a failed code exchange gives a generic error
RED  M14 provider error text reflected: roblox-oauth.ts -> red 1 (1 of 42); expected: an error sent back by Roblox
RED  M15 non-numeric sub accepted: roblox-oauth.ts -> red 1 (1 of 42); expected: a userinfo answer whose sub is not a number
RED  M16 any return path followed: roblox-oauth.ts -> red 1 (1 of 42); expected: a return path that is not an app screen
RED  M17 return path never carried: roblox-oauth.ts -> red 1 (1 of 42); expected: a return path that is an app screen travels
RED  M18 synthetic address can be delivered to: roblox-oauth.ts -> red 5 (5 of 42); expected: FIRST SIGHT
RED  M19 user not confirmed on creation: roblox-oauth.ts -> red 1 (1 of 42); expected: FIRST SIGHT
RED  M20 profile named after the synthetic address: roblox-oauth.ts -> red 1 (1 of 42); expected: FIRST SIGHT
RED  M21 account found by username, not sub: roblox-oauth.ts -> red 2 (2 of 42); expected: the same Roblox account signing in again, a different Roblox account with the same username
RED  M22 no unique index on user_id: roblox-oauth.ts -> red 1 (1 of 42); expected: already linked to a user cannot be linked
RED  M23 existing synthetic user never adopted: roblox-oauth.ts -> red 2 (2 of 42); expected: two callbacks for the same new sub, a user this worker made for the same sub
RED  M24 squatter adopted: roblox-oauth.ts -> red 1 (1 of 42); expected: an address somebody registered by hand
RED  M25 token hash in the query string: roblox-oauth.ts -> red 7 (7 of 42); expected: the sign-in token reaches the browser in the URL fragment
RED  M26 secret key always sent as bearer: roblox-oauth.ts -> red 1 (1 of 42); expected: the Supabase secret key goes in
RED  M27 refresh token stored in plaintext: roblox-oauth.ts -> red 10 (10 of 42); expected: the refresh token is stored sealed
RED  M28 sign-in does not bump the version: roblox-oauth.ts -> red 1 (1 of 42); expected: signing in again replaces the stored token
RED  M29 rotation does not bump the version: roblox-oauth.ts -> red 2 (2 of 42); expected: ROTATION
RED  M30 refresh takes no lease: roblox-oauth.ts -> red 2 (2 of 42); expected: CONCURRENT REFRESH, a lease left by a request that died
RED  M31 store without compare-and-swap: roblox-oauth.ts -> red 1 (1 of 42); expected: COMPARE-AND-SWAP
RED  M32 a lease never expires: roblox-oauth.ts -> red 1 (1 of 42); expected: a lease left by a request that died
RED  M33 lease not released after a refusal: roblox-oauth.ts -> red 1 (1 of 42); expected: a refresh Roblox refuses releases the lease
RED  M34 disconnect does not revoke: roblox-oauth.ts -> red 3 (3 of 42); expected: DISCONNECT revokes the grant
RED  M35 disconnect deletes even when Roblox is unreachable: roblox-oauth.ts -> red 1 (1 of 42); expected: DISCONNECT with Roblox unreachable
RED  M36 disconnect strands a Roblox-only account: roblox-oauth.ts -> red 1 (1 of 42); expected: DISCONNECT keeps the sign-in link
RED  M37 card never told Roblox is the only way in: roblox-oauth.ts -> red 1 (1 of 42); expected: the connection card is told
RED  M38 routes work without the credential key: roblox-oauth.ts -> red 1 (1 of 42); expected: with any one secret missing
RED  M39 no Referrer-Policy: roblox-oauth.ts -> red 1 (1 of 42); expected: every response under /auth/roblox
RED  M40 limiter ceiling raised: roblox-oauth.ts -> red 1 (1 of 42); expected: the IP limiter
RED  M41 query string written to the log: roblox-oauth.ts -> red 1 (1 of 42); expected: NO SECRET, TOKEN, CODE
RED  M42 status check shares the start bucket: roblox-oauth.ts -> red 1 (1 of 42); expected: the IP limiter
RED  M43 connection routes exempt from the JWT check: index.ts -> red 5 (5 of 42); expected: DISCONNECT needs a signed-in caller
RED  M44 index hands the routes no limiter: index.ts -> red 1 (1 of 42); expected: the IP limiter
RED  M45 routes not mounted: index.ts -> red 41 (41 of 42); expected: POSITIVE CONTROL
RED  M46 export carries the sealed token: user-export.ts -> red 1 (1 of 42); expected: the account export includes both tables
RED  M47 export spec leaves a column undeclared: user-export.ts -> red 1 (1 of 13); expected: every column of every exported D1 table
RED  M48 export does not make the tables first: account-export.ts -> red 1 (1 of 42); expected: the export of someone who never signed in with Roblox
RED  M49 erasure keeps the token row: erasure.ts -> red 2 (2 of 42); expected: account erasure revokes the grant
RED  M50 erasure keeps the identity link: erasure.ts -> red 2 (2 of 42); expected: account erasure revokes the grant
RED  M51 erasure does not revoke at Roblox: erasure.ts -> red 2 (2 of 42); expected: account erasure revokes the grant
RED  M52 receipt claims a revoke that did not happen: erasure.ts -> red 1 (1 of 42); expected: account erasure still deletes the rows when Roblox cannot be asked
RED  M53 redaction forgets the sign-in token hash: redaction.ts -> red 1 (1 of 37); expected: an OAuth token named in a form body
RED  M54 redaction forgets the RBX- prefix: redaction.ts -> red 1 (1 of 37); expected: a oauth_token in a message
RED  M55 web scrub forgets the sign-in token hash: sentry.ts -> red 1 (1 of 17); expected: an OAuth token or a sign-in token hash is scrubbed
RED  W01 button shown for any answer: roblox-signin.ts -> red 1 (1 of 11); expected: the button is offered only when
RED  W02 status check cacheable: roblox-signin.ts -> red 1 (1 of 11); expected: the status check asks the worker route and is never cached
RED  W03 return path not cleaned: roblox-signin.ts -> red 1 (1 of 11); expected: the button links to the worker start route
RED  W04 any fragment accepted: roblox-signin.ts -> red 1 (1 of 11); expected: the fragment is read for a token hash of a sane shape
RED  W05 next not checked: roblox-signin.ts -> red 1 (1 of 11); expected: the fragment is read for a token hash of a sane shape
RED  W06 wrong OTP type: roblox-signin.ts -> red 1 (1 of 11); expected: the landing route trades the hash
RED  W07 a Supabase error still signs in: roblox-signin.ts -> red 1 (1 of 11); expected: the landing route trades the hash
RED  W08 card hides that Roblox is the only way in: roblox-signin.ts -> red 1 (1 of 11); expected: the Connections card says what is linked
RED  W09 disconnect message ignores signInKept: roblox-signin.ts -> red 1 (1 of 11); expected: the Disconnect message matches
RED  W10 no button on the sign-up page: auth-pages.tsx -> red 1 (1 of 11); expected: "Continue with Roblox" is on the sign-in page
RED  W11 button drawn before the worker says yes: auth-pages.tsx -> red 1 (1 of 11); expected: "Continue with Roblox" is on the sign-in page
RED  W12 a second OAuth provider added: auth-pages.tsx -> red 1 (1 of 11); expected: only Roblox is added
RED  W13 landing route behind a guard: app.tsx -> red 1 (1 of 11); expected: the landing route is declared outside both guards
RED  W14 fragment cleared after it is traded: auth-pages.tsx -> red 1 (1 of 11); expected: the landing route is declared outside both guards
RED  W15 no settings row: settings.tsx -> red 1 (1 of 11); expected: the Connections card is a row in settings
RED  W16 landing route path drifts (palette tripwire): app.tsx -> red 1 (1 of 16); expected: every signed-in route is a child of the shell
```

**Superseded.** The review round replaced the design these lines tested in two places. `M25` (token hash in the query string)
and the old web lines `W01` to `W16` aimed at the fragment parser and at tests that read source text in a certain order; those tests
no longer exist. Their replacements are `r.W01` to `r.W16` and `r.B01` to `r.B43` below. Every other line above still holds: its test
is unchanged or was restated and run again in 9b.

### 9b. The review round: 114 changes, 114 red

Same method as above (each change made alone, the named test file run, the exact reverse replacement made, the file checked
byte-identical afterwards; one runner, three definition files). `red N (N of M)` is how many tests in that file failed; the
test count is the same on every run, so a red is a failing assertion and not a file that stopped loading. The first runs
found three survivors, each a real gap in the test and each fixed before it was recorded as red: `r.D07` (a refusal that still
carried a success field was asserted only on the 503 and the 500, not on the 502), `r.X04` and `r.X05` (no false-positive fixture
distinguished the upper-case and lower-case requirements of the redaction rule), and one mutation (`r.B36`) that aimed at two
places at once and was narrowed. The prefix `r.W` is the worker's handle and CSRF group, `A` the address, `D` disconnect,
`S` the stale link, `R` `L` `P` `H` `T` `C` randomness, lease, re-sign-in, names, 429 and cache, `X` the redaction rule and
`B` the browser.

```
RED  r.W01 token back in the redirect fragment: roblox-oauth.ts -> red 13 (13 of 64); expected: POSITIVE CONTROL|NO token in any URL|REDEEM:
RED  r.W02 handle also put in the redirect query: roblox-oauth.ts -> red 5 (5 of 64); expected: NO token in any URL|POSITIVE CONTROL
RED  r.W03 handle cookie not HttpOnly: roblox-oauth.ts -> red 1 (1 of 64); expected: NO token in any URL
RED  r.W04 handle cookie without SameSite: roblox-oauth.ts -> red 1 (1 of 64); expected: NO token in any URL
RED  r.W05 handle cookie not Secure over https: roblox-oauth.ts -> red 1 (1 of 64); expected: NO token in any URL
RED  r.W06 handle cookie sent to the whole site: roblox-oauth.ts -> red 1 (1 of 64); expected: NO token in any URL
RED  r.W07 handle outlives five minutes: roblox-oauth.ts -> red 1 (1 of 64); expected: NO token in any URL
RED  r.W08 KV entry stored without a TTL: roblox-oauth.ts -> red 1 (1 of 64); expected: NO token in any URL
RED  r.W09 handle not burned when redeemed: roblox-oauth.ts -> red 1 (1 of 64); expected: REDEEM: the browser
RED  r.W10 handle cookie not cleared on redeem: roblox-oauth.ts -> red 1 (1 of 64); expected: REDEEM: the browser
RED  r.W11 redeem accepts any origin: roblox-oauth.ts -> red 1 (1 of 64); expected: same-origin POST
RED  r.W12 a refused origin burns the handle: roblox-oauth.ts -> red 1 (1 of 64); expected: same-origin POST
RED  r.W13 redeem answers a GET too: roblox-oauth.ts -> red 1 (1 of 64); expected: same-origin POST
RED  r.W14 unknown handle still answers 200: roblox-oauth.ts -> red 3 (3 of 64); expected: LOGIN CSRF|outlived|REDEEM:
RED  r.W15 redeem works with a secret missing: roblox-oauth.ts -> red 1 (1 of 64); expected: secret missing REDEEM
RED  r.W16 redeem answers 200 without reading the cookie: roblox-oauth.ts -> red 1 (1 of 64); expected: LOGIN CSRF
RED  r.A01 address derived from the public id: roblox-oauth.ts -> red 6 (6 of 64); expected: keyed digest|SQUATTING|FIRST SIGHT
RED  r.A02 address derived from an UNKEYED sha-256 of the id: roblox-oauth.ts -> red 6 (6 of 64); expected: keyed digest|FIRST SIGHT|SQUATTING
RED  r.A03 purpose label dropped from the subkey: user-credentials.ts -> red 7 (7 of 64); expected: purpose label|keyed digest
RED  r.A04 keyed id ignores CREDENTIAL_KEY: user-credentials.ts -> red 7 (7 of 64); expected: keyed digest|purpose label|FIRST SIGHT
RED  r.A05 keyed id falls back to a fixed key when none is set: user-credentials.ts -> red 1 (1 of 64); expected: purpose label
RED  r.A06 a squatter on the address is adopted: roblox-oauth.ts -> red 1 (1 of 64); expected: NEVER adopted
RED  r.A07 address taken answers the generic 502: roblox-oauth.ts -> red 1 (1 of 64); expected: NEVER adopted
RED  r.A08 address taken shows no reference: roblox-oauth.ts -> red 1 (1 of 64); expected: NEVER adopted
RED  r.A09 address taken logs the generic stage word: roblox-oauth.ts -> red 1 (1 of 64); expected: NEVER adopted
RED  r.A10 a half-finished sign-in is never adopted: roblox-oauth.ts -> red 2 (2 of 64); expected: left behind by a sign-in
RED  r.D01 disconnect carries on without credentials and reports success: roblox-oauth.ts -> red 1 (1 of 64); expected: cannot even be ASKED
RED  r.D02 disconnect deletes when the sealed token cannot be opened: roblox-oauth.ts -> red 1 (1 of 64); expected: cannot be OPENED
RED  r.D03 any 400 counts as already revoked: roblox-oauth.ts -> red 2 (2 of 64); expected: ONLY for invalid_token|erasure does not call
RED  r.D04 invalid_token is believed on any status: roblox-oauth.ts -> red 1 (1 of 64); expected: ONLY for invalid_token
RED  r.D05 invalid_token no longer counts as revoked: roblox-oauth.ts -> red 1 (1 of 64); expected: unreachable
RED  r.D06 a revoked disconnect does not say revoked: roblox-oauth.ts -> red 3 (3 of 64); expected: DISCONNECT revokes|unreachable
RED  r.D07 a refused disconnect still carries a success field: roblox-oauth.ts -> red 1 (1 of 64); expected: cannot even be ASKED|cannot be OPENED|ONLY for invalid_token
RED  r.S01 a stale identity row is not deleted: roblox-oauth.ts -> red 1 (1 of 64); expected: STALE LINK
RED  r.S02 a stale token row is not deleted: roblox-oauth.ts -> red 1 (1 of 64); expected: STALE LINK
RED  r.S03 any 404 is believed to mean the user is gone: roblox-oauth.ts -> red 1 (1 of 64); expected: a 404 that is not GoTrue
RED  r.S04 when Auth cannot be reached the link is treated as stale: roblox-oauth.ts -> red 1 (1 of 64); expected: a 404 that is not GoTrue
RED  r.S05 the stale sign-in is never retried as a first sight: roblox-oauth.ts -> red 1 (1 of 64); expected: STALE LINK
RED  r.R01 the state and verifier are Math.random: roblox-oauth.ts -> red 1 (1 of 64); expected: drawn from crypto.getRandomValues
RED  r.R02 every flow gets the same state: roblox-oauth.ts -> red 3 (3 of 64); expected: different states
RED  r.R03 every flow gets the same verifier: roblox-oauth.ts -> red 1 (1 of 64); expected: different states
RED  r.R04 the verifier is drawn short: roblox-oauth.ts -> red 1 (1 of 64); expected: drawn from crypto.getRandomValues
RED  r.L01 the refresh lease is an hour: roblox-oauth.ts -> red 1 (1 of 64); expected: lease is 30 seconds
RED  r.L02 the refresh lease is a millisecond: roblox-oauth.ts -> red 1 (1 of 64); expected: lease is 30 seconds
RED  r.P01 a re-sign-in revokes the previous token: roblox-oauth.ts -> red 1 (1 of 64); expected: RE-SIGN-IN REPLACES
RED  r.P02 a re-sign-in keeps the previous token: roblox-oauth.ts -> red 2 (2 of 64); expected: RE-SIGN-IN REPLACES|signing in again replaces
RED  r.H01 format characters (bidi, zero-width) not stripped: roblox-oauth.ts -> red 2 (2 of 64); expected: HOSTILE USERNAMES|every name is invisible
RED  r.H02 control characters not stripped: roblox-oauth.ts -> red 2 (2 of 64); expected: HOSTILE USERNAMES
RED  r.H03 line separators not stripped: roblox-oauth.ts -> red 1 (1 of 64); expected: HOSTILE USERNAMES
RED  r.H04 blank letters not stripped: roblox-oauth.ts -> red 1 (1 of 64); expected: every name is invisible
RED  r.H05 length cut in UTF-16 units, not code points: roblox-oauth.ts -> red 1 (1 of 64); expected: HOSTILE USERNAMES
RED  r.H06 no length cap: roblox-oauth.ts -> red 1 (1 of 64); expected: HOSTILE USERNAMES
RED  r.H07 whitespace runs not collapsed or trimmed: roblox-oauth.ts -> red 1 (1 of 64); expected: HOSTILE USERNAMES
RED  r.H08 the first name is taken before it is cleaned: roblox-oauth.ts -> red 1 (1 of 64); expected: every name is invisible
RED  r.H09 no fallback name: roblox-oauth.ts -> red 1 (1 of 64); expected: every name is invisible
RED  r.T01 a 429 is a refused grant: roblox-oauth.ts -> red 1 (1 of 64); expected: Roblox 429
RED  r.C01 the cache ignores the row version: roblox-oauth.ts -> red 1 (1 of 64); expected: ACCESS TOKEN CACHE
RED  r.C02 the cache ignores expiry: roblox-oauth.ts -> red 2 (2 of 64); expected: ACCESS TOKEN CACHE
RED  r.C03 the cache is consulted before the row, so a disconnect does not void it: roblox-oauth.ts -> red 1 (1 of 64); expected: ACCESS TOKEN CACHE
RED  r.C04 nothing is ever cached: roblox-oauth.ts -> red 2 (2 of 64); expected: ACCESS TOKEN CACHE|CONCURRENT REFRESH
RED  r.C05 a cached token is held past its 15 minutes: roblox-oauth.ts -> red 2 (2 of 64); expected: ACCESS TOKEN CACHE
RED  r.X01 the name alone is enough (the old rule): redaction.ts -> red 1 (1 of 38); expected: merely NAMES
RED  r.X02 a dot may be part of the value: redaction.ts -> red 1 (1 of 38); expected: merely NAMES
RED  r.X03 no digit required: redaction.ts -> red 1 (1 of 38); expected: merely NAMES
RED  r.X04 no upper case required: redaction.ts -> red 1 (1 of 38); expected: merely NAMES
RED  r.X05 no lower case required: redaction.ts -> red 1 (1 of 38); expected: merely NAMES
RED  r.X06 any short value counts: redaction.ts -> red 1 (1 of 38); expected: merely NAMES
RED  r.X07 a sign-in token hash (hex) is no longer found: redaction.ts -> red 1 (1 of 38); expected: named in a form body
RED  r.X08 an opaque mixed-case token is no longer found: redaction.ts -> red 2 (2 of 38); expected: named in a form body
RED  r.X09 the rule is demoted to heuristic (the egress gate no longer reads it): redaction.ts -> red 2 (2 of 38); expected: named in a form body|merely NAMES|oauth_token
RED  r.X10 the RBX- prefix is no longer found: redaction.ts -> red 1 (1 of 38); expected: oauth_token in a message
RED  r.B01 the status check says yes to anything: roblox-signin.ts -> red 2 (2 of 23); expected: status check says yes|THE BUTTON is not there
RED  r.B02 the button is visible before the status arrives (hook starts true): roblox-signin.ts -> red 2 (2 of 23); expected: THE BUTTON is not there|NOT in the first render
RED  r.B03 the hook turns the button on whatever the worker said: roblox-signin.ts -> red 1 (1 of 23); expected: THE BUTTON is not there
RED  r.B04 the hook applies an answer after the page has gone: roblox-signin.ts -> red 1 (1 of 23); expected: after the page has gone
RED  r.B05 the button is drawn although the worker said not configured (view): auth-pages.tsx -> red 2 (2 of 23); expected: is drawn only when told
RED  r.B06 the page forces the button on (glue): auth-pages.tsx -> red 1 (1 of 23); expected: NOT in the first render
RED  r.B07 the status check may be cached: roblox-signin.ts -> red 1 (1 of 23); expected: never cached
RED  r.B08 a non-200 status answer is believed: roblox-signin.ts -> red 2 (2 of 23); expected: status check says yes
RED  r.B09 a hostile return path is carried: roblox-signin.ts -> red 1 (1 of 23); expected: return path only when
RED  r.B10 the landing page trades the fragment instead of what it redeemed (the reviewer's hash mutation): roblox-signin.ts -> red 3 (3 of 23); expected: never takes a token from the URL
RED  r.B11 redeem is sent without the cookie: roblox-signin.ts -> red 1 (1 of 23); expected: REDEEM is a same-origin POST
RED  r.B12 redeem is a GET: roblox-signin.ts -> red 1 (1 of 23); expected: REDEEM is a same-origin POST
RED  r.B13 redeem is cacheable: roblox-signin.ts -> red 1 (1 of 23); expected: REDEEM is a same-origin POST
RED  r.B14 redeem puts something in the URL: roblox-signin.ts -> red 1 (1 of 23); expected: REDEEM is a same-origin POST
RED  r.B15 redeem believes an error status: roblox-signin.ts -> red 1 (1 of 23); expected: REDEEM is a same-origin POST
RED  r.B16 redeem does not check the token shape: roblox-signin.ts -> red 1 (1 of 23); expected: REDEEM is a same-origin POST
RED  r.B17 redeem follows a hostile next: roblox-signin.ts -> red 1 (1 of 23); expected: REDEEM is a same-origin POST
RED  r.B18 verifyOtp is called with the wrong type: roblox-signin.ts -> red 4 (4 of 23); expected: trades what it redeemed
RED  r.B19 a Supabase error still signs in: roblox-signin.ts -> red 2 (2 of 23); expected: trades what it redeemed
RED  r.B20 a verifyOtp throw is not caught: roblox-signin.ts -> red 1 (1 of 23); expected: trades what it redeemed
RED  r.B21 an existing session is replaced without asking: roblox-signin.ts -> red 1 (1 of 23); expected: ASKS first|startRobloxLanding asks
RED  r.B22 when it cannot be told who is signed in, it carries on: roblox-signin.ts -> red 1 (1 of 23); expected: failures end in a failed state
RED  r.B23 the landing hook redeems on every render: roblox-signin.ts -> red 4 (4 of 23); expected: nobody signed in here
RED  r.B24 the choice does not show working while it switches: roblox-signin.ts -> red 1 (1 of 23); expected: ASKS first
RED  r.B25 the landing starts in the failed state: roblox-signin.ts -> red 2 (2 of 23); expected: nobody signed in here|starts in the working state
RED  r.B26 the sentence about the session names a placeholder address: roblox-signin.ts -> red 1 (1 of 23); expected: never a placeholder
RED  r.B27 the choice card has no Stay button: auth-pages.tsx -> red 1 (1 of 23); expected: one card per state
RED  r.B28 the choice card has no Switch button: auth-pages.tsx -> red 1 (1 of 23); expected: one card per state
RED  r.B29 the failure card has no way out: auth-pages.tsx -> red 1 (1 of 23); expected: one card per state
RED  r.B30 the failure card is not an alert: auth-pages.tsx -> red 1 (1 of 23); expected: one card per state
RED  r.B31 the landing route renders the failure card first: auth-pages.tsx -> red 1 (1 of 23); expected: landing ROUTE starts
RED  r.B32 the disconnect message ignores `revoked`: roblox-signin.ts -> red 1 (1 of 23); expected: reads `revoked`
RED  r.B33 a plain disconnect is worded as a withdrawal even when not confirmed: roblox-signin.ts -> red 1 (1 of 23); expected: reads `revoked`
RED  r.B34 the card hides that Roblox is the only way in: roblox-signin.ts -> red 1 (1 of 23); expected: what is linked
RED  r.B35 no button on the sign-up page: auth-pages.tsx -> red 1 (1 of 23); expected: both offer Roblox
RED  r.B36 no button on the sign-in page: auth-pages.tsx -> red 1 (1 of 23); expected: both offer Roblox
RED  r.B37 a Supabase OAuth button is added: auth-pages.tsx -> red 1 (1 of 23); expected: only Roblox is added
RED  r.B38 the landing route renders something else: app.tsx -> red 1 (1 of 23); expected: sits outside both guards
RED  r.B39 the landing route is moved inside the guarded group: app.tsx -> red 1 (1 of 23); expected: sits outside both guards
RED  r.B40 the landing route path drifts: app.tsx -> red 1 (1 of 23); expected: sits outside both guards
RED  r.B41 no settings row: settings.tsx -> red 1 (1 of 23); expected: row in settings
RED  r.B42 the settings row does not hold the card: settings.tsx -> red 1 (1 of 23); expected: row in settings
RED  r.B43 the settings search forgets the card: settings-search.ts -> red 1 (1 of 23); expected: row in settings
```

## 10. The independent review of this branch, and what it changed (2026-10-05)

Seven findings, each fixed with a test that failed before the fix. Measured: the worker test file, run against the unfixed
source, had 31 of its 64 tests red (the other 33 are the old tests, restated where the redirect changed, plus guards for
behaviour that was already right, which section 9b proves by mutation). The redaction test, run against the old rule, had 1 of 38
red (the false-positive test; the true-positive test passed, because the old rule over-matched). The web test file cannot load
against the old web source at all, since the functions it tests did not exist; its worth is shown by section 9b.

1. **Login CSRF (security).** The callback put a bearer `token_hash` in the redirect fragment and `/app/auth/roblox` redeemed
   any fragment, so an attacker could finish a flow on their own Roblox account, send the landing link to a victim, and the
   victim's browser would sign in as the attacker. Now the redirect carries nothing, the token waits in KV behind a random
   one-time handle held only in the finishing browser's cookie, and the page redeems it with a same-origin POST. The page never
   reads the URL for a token (`r.B10` is that exact mistake, red). If somebody is already signed in, the page asks before
   replacing the session. The old comment above the web test said the page cleared the fragment before trading it; that
   ordering no longer exists, and the reviewer's "reads `window.location.hash` after `replaceState`" mutation is now `r.B10`
   (the landing page trades the fragment), red in a test that poisons `window.location` and fails on any read of it.
2. **Address squatting (security).** Keyed digest of the `sub`, a fixed purpose label, `CREDENTIAL_KEY` through the repo's own
   crypto module (`keyedId`). A test pre-registers the old public address through the mock's sign-up and the Roblox user still
   signs in; another pins the derivation by recomputing it with `node:crypto` in the test; another shows the same value
   under another purpose or another key is another identifier. `exists` for an address with no `roblox_sub` fails closed:
   409, `roblox_address_taken` on the page, `synthetic address taken` in the log.
3. **Disconnect.** Described in section 2. The web message reads `revoked`.
4. **Stale link.** Described in section 2, with the guard that only GoTrue's own `user_not_found` counts.
5. **The missing tests.** Two flows differ in state and verifier and both are draws from `crypto.getRandomValues` (the test
   wraps it and matches each draw to the value); a sign-in after the person changed their address works, against a mock that
   now behaves like GoTrue for an unknown address (it signs the address up, counted as `ghosts`); nine hostile usernames, and
   the names the worker keeps; the refresh lease length (30 s) pinned through the row; the web tests run the hooks and render
   the components. **Re-sign-in decision: REPLACE, do not revoke.** A fresh sign-in overwrites the stored refresh token and the
   previous one is not sent to Roblox for revocation. Revoking would be wrong if Roblox ties the tokens of one authorization
   together (the new token would die with the old) and gains nothing if it does not, because the old token is held nowhere in
   this system once overwritten, so nobody here can use it. The cost is a possible stale authorization in the person's
   Roblox list; the first live run checks it (section 6, 1b). It is pinned by a test and by mutation `r.P01`.
   The same reasoning is why the stale-link path deletes the dead user's token row without revoking it.
6. **Redaction.** Credential shapes only, see section 2. The rule stays `high`: with the shape requirement the egress gate
   can safely read it, and a real `refresh_token=<opaque value>` leaving in an agent's request is what the gate is for.
7. **Optional, done because it was cheap.** The access-token cache and the 429 classification.

**Not fixed, or not verifiable here, and why.**
- Nothing was run against Roblox or Supabase (the rules of this work). Every behaviour of theirs is in section 6, with the first
  live check for each; the two new ones are GoTrue's magic-link-signs-up behaviour and its `user_not_found` 404 shape.
- The web Sentry scrub still uses the wide `oauth_token` pattern (section 7). Left on purpose; the finding was about the worker's
  gate.
- The handle cookie is not `Secure` on the plain-http dev origin, and a "Stay signed in" leaves the handle to expire in
  five minutes (section 7).
- KV's eventual consistency can make an early redeem see no handle (the person tries again). A strongly consistent store
  (D1 or a Durable Object) would remove it; the review asked for KV, so it stayed.
- The in-page browser check of section 8 was not repeated for the new landing flow, for the reason given there.
