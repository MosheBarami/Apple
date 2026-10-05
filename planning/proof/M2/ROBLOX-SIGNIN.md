# Sign in with Roblox: design, the key decision, and how to switch it on

Handoff M2, "Roblox sign-in moves here": tasks O0 to O3 and O5 of `planning/roblox-oauth-setup.md`.
Built on branch `studpilot/m2-roblox`. **Nothing here is switched on or deployed.** No network was called while
building it: Roblox and Supabase are mocked in the tests, and what the mocks assume is listed in section 6.

## 1. What a person sees

1. On the sign-in and sign-up pages a "Continue with Roblox" button appears, but only when the worker says it can
   finish a sign-in (`GET /auth/roblox/status` answers `{"configured": true}`). Today it answers `false`, so
   the button stays hidden until the three secrets of section 4 are on the Worker.
2. The button goes to `/auth/roblox/start`, then to Roblox, then back to `/auth/roblox/callback`, then to the app at
   `/app/auth/roblox`, which signs them in and sends them where they were going.
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
  |                                 | link by sub (D1 roblox_identities); first sight:
  |                                 |-- POST /auth/v1/admin/users (synthetic address) ------>|
  |                                 |-- GET  /auth/v1/admin/users/{id}; POST .../generate_link ->|
  |<-- 302 /app/auth/roblox#token_hash=... (fragment) -----------|
  | SPA: supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) ------------------------>|
  |<-- a real Supabase session (the worker never signed a JWT) ---------------------------------|
```

- **Accounts are found by the Roblox `sub` and by nothing else.** A Roblox username can be changed and reused, so
  linking by it would let a second person take an account over. A new username on the same `sub` is a rename
  (`roblox_identities.username` is updated); the same username on another `sub` is a different user.
- **The Supabase user** has the address `roblox-<sub>@users.studpilot.invalid` (RFC 2606 `.invalid` can never be
  delivered to), `email_confirm: true`, `user_metadata.display_name` = the Roblox username (so the profile is
  not named after the synthetic address), and `app_metadata.roblox_sub` = the `sub`.
- **An address somebody registered by hand is never adopted.** Anyone can sign up with
  `roblox-<sub>@users.studpilot.invalid`. If Supabase says that address exists, the worker mints a link to read the
  user's `app_metadata` and adopts the user only if it names the same `sub` (people cannot write `app_metadata`;
  only the Auth admin API can). That also lets a sign-in that stopped halfway finish next time.
- **The refresh token** is sealed with `CREDENTIAL_KEY` (the same AES-GCM helper the Open Cloud key uses) in
  `roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, rotated_at, lease_until)`. Roblox refresh
  tokens are single use. `refreshRobloxAccessToken` first claims a lease on the row (a conditional update on
  `version` and `lease_until`), only then calls Roblox, then stores the replacement by compare-and-swap on
  `version`. Two requests at once: one refreshes, the other is told `busy`. A sign-in or disconnect that lands
  while Roblox is answering wins, and the stale replacement is discarded and revoked. Nothing calls it yet; it is
  the building block for uploads (M5c).
- **Disconnect** (`POST /api/me/roblox/disconnect`, JWT-authed) revokes the grant at Roblox with the stored token,
  deletes the token row and the identity link, and is idempotent. If Roblox cannot be asked, nothing is deleted
  (the sealed token is the only handle to revoke with) and the answer is 502. Roblox answering 400 means the
  token was already dead, which counts as revoked.
- **Export and erasure.** Both tables are in the account export (`user-export.ts`; the sealed token and the
  lease are withheld and the file says why) and in account erasure (`erasure.ts`): the grant is revoked at Roblox
  first, then both tables are swept, with a receipt line each and a note on whether Roblox was reached.
- **Hardening on `/auth/roblox/*`:** `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, the router's `ipLimited` (20 a minute for start and callback, 120 for status),
  one fixed sentence on every error page (nothing Roblox sent is reflected), and no log line that carries a query
  string, a token, a code, a state or a response body (the only line is `[roblox-oauth] <stage>`). An `oauth_token`
  redaction rule was added to the worker's `redaction.ts` and to the browser's Sentry scrub.

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

Worker: `apps/worker/src/roblox-oauth.ts` (new); wiring in `index.ts`; `env.ts` (three optional secrets);
`erasure.ts`, `user-export.ts`, `account-export.ts`; `redaction.ts`.
Web: `lib/roblox-signin.ts`, `components/roblox-connection-card.tsx` (new); `routes/auth-pages.tsx` (button, landing
page), `app.tsx` (route `/auth/roblox`, outside both guards like `/confirm`), `routes/settings.tsx`,
`lib/settings-search.ts`, `lib/api.ts`, `lib/sentry.ts`.
Tests: `apps/worker/tests/roblox-oauth.test.mjs` (42), `apps/web/tests/roblox-signin.test.mjs` (11), plus cases in
`secret-redaction.test.mjs` and `sentry.test.mjs`.

**Additions beyond the brief, each with its reason:**
- *The state is also bound to the browser by a cookie.* A state that lives only in KV allows login CSRF: an attacker
  starts a flow, finishes it on their own Roblox account, and gives the callback link to somebody else, who is then
  signed in as the attacker. PKCE does not stop that, because the verifier is in KV, not in the victim's browser.
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
2. **`generate_link`'s response shape.** The worker reads `hashed_token`, `id` and `app_metadata` at the top level, or
   under `properties` and `user`.
3. **Secret key header.** An `sb_secret_` key is sent as `apikey` only; a JWT-shaped legacy key is sent as the bearer
   too. If the Auth server wants both, `admin()` in `roblox-oauth.ts` is the one place.
4. **Roblox token calls** send `client_id` and `client_secret` in the form body with `redirect_uri` and the verifier, and
   `userinfo` is read for `sub` and `preferred_username` (falling back to `nickname`, then `name`).
5. **The `RBX-` prefix** on Roblox tokens and secrets is from memory; the redaction rule also catches
   `refresh_token=`, `client_secret=` and the other names in a body, a fragment or JSON, so it does not depend on it.

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
  state; the cookie (cleared on first use) and Roblox's own single-use code are what stop it.
- **Uploads (O4), the 13+ check, the Roblox review package and the thumbnail** are later milestones.

## 8. Measured results (2026-10-05, branch `studpilot/m2-roblox`, Node 26.8.1)

| Command | Result |
|---|---|
| `cd apps/worker && pnpm typecheck` | exit 0 |
| `cd apps/worker && node --test` | tests 5472, pass 5466, fail 0, skipped 6 (before this change: 5428, 5422, 0, 6) |
| `cd apps/web && pnpm typecheck` | exit 0 |
| `cd apps/web && node --test` | tests 2466, pass 2466, fail 0 |
| `node --test tests/` (root) | tests 631, pass 613, fail 2, skipped 16. The two failures are the scratchpad-location cases in `tests/check-pixels.test.mjs` ("THE CONTROL: against a SAME-ORIGIN baseline..." and "against a baseline with NO provenance..."), which fail when the clone lives under a scratchpad path |
| `node scripts/check-old-names.mjs` | CLEAN, 0 violations (46138 hits, all allowlisted; the count did not move) |
| `pnpm build` in `apps/web`, then `node scripts/check-app-bundle.mjs` | entry 141.0 kB gzipped (budget 150), eager graph 266.6 kB |

New tests: 42 in `roblox-oauth.test.mjs` (worker), 11 in `roblox-signin.test.mjs` (web), 2 in `secret-redaction.test.mjs`
(an `oauth_token` row in the per-kind loop, and the three body shapes with the false-positive direction), 1 in
`sentry.test.mjs`. Two existing tests were restated, not weakened (section 5).

A local-only browser check (the Vite dev server, every non-localhost request aborted, the status route stubbed): the
button shows on `/app/login` and `/app/signup` at 1280 and at 375 pixels with no horizontal scroll, is absent when the
status says `false`, and `/app/auth/roblox#token_hash=...` removes the fragment from the address bar and shows the
failure card when Supabase cannot be reached.

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
