# Sign in with Roblox: design, the key decision, and how to switch it on

Handoff M2, "Roblox sign-in moves here": tasks O0 to O3 and O5 of `planning/roblox-oauth-setup.md`.
Built on branch `studpilot/m2-roblox`. **Nothing here is switched on or deployed.** No network was called while
building it: Roblox and Supabase are mocked in the tests, and what the mocks assume is listed in section 6.

**Updated 2026-10-05 after an independent review of this branch.** It found a login CSRF, an address-squatting lock-out,
a disconnect that could delete the only handle on a grant, and four weaker points. Section 10 says what each was and
what changed; sections 1, 2, 5 to 9 below are already rewritten to the current design. Where an old line of section 9
tested the fragment design that was replaced, it says so.

**Updated again 2026-10-05 after a second review round ("cycle 2").** It found that the two flow cookies could be planted
(reopening login CSRF), a rate limit that locked a school lab out at its seventh sign-in, Settings that a Roblox-only account
could not use, a Connections card that sent people to a dead end, tests that did not execute the landing page or the catch
handlers, and two minor gaps. Section 11 says what each was and what changed. Sections 1, 2, 4 to 8 are rewritten to the
current design; section 9c is the cycle's mutations.

**Updated a third time 2026-10-05 after a third review round ("cycle 3", the last).** It found that re-authenticating a Roblox-only
account proved nothing while roblox.com was still signed in in that browser, that a device clock that was off could send the same
account round the re-authentication for ever, that "Continue with Roblox" under the password form quietly made a second, empty
account for somebody who already had an email account, that the stray allowance was consulted after the KV read it was meant to
protect, and gaps in the tests. Section 12 says what each was and what changed. Sections 1, 2, 5 to 8 are rewritten to the current
design; section 9d is the cycle's mutations.

**Updated a fourth time 2026-10-05 after a final narrow pass ("final pass").** It found that a deletion that part-failed could not be run
again by a Roblox-only account (the retry answered 403), that a page on another site could use up an address's stray allowance and so
refuse the person's own real flow for a minute, that on the dev origin the handle cookie never reached Continue or Go back, and four
places where a test was weaker than its name. Section 13 says what each was and what changed; sections 2, 5, 7 and 8 carry the current
design and numbers; section 9e is the pass's mutations.

## 1. What a person sees

1. On the sign-in and sign-up pages a "Continue with Roblox" button appears, but only when the worker says it can
   finish a sign-in (`GET /auth/roblox/status` answers `{"configured": true}`). Today it answers `false`, so
   the button stays hidden until the three secrets of section 4 are on the Worker.
2. The button goes to `/auth/roblox/start`, then to Roblox, then back to `/auth/roblox/callback`, then to the app at
   `/app/auth/roblox`, which signs them in and sends them where they were going. If somebody is already signed in in
   that browser, the page asks first ("Switch to my Roblox account" or "Stay signed in"; for a session that is itself a Roblox
   account, which is how a Roblox-only account confirms it is the person in Settings, "Continue with Roblox" or "Cancel") and
   replaces nothing until they choose. When the session that results belongs to a different account, the previous account's
   drafts, recent searches and view state are cleared. **A Roblox account that nobody here has seen is not given an account
   straight away.** The page says "This creates a new StudPilot account. Already have one? Sign in with your email instead." and
   names the Roblox account, with Continue and Go back. Only Continue makes the user; Go back goes to the sign-in page and
   withdraws the Roblox authorization that was given for it.
3. In Settings, under Connections, a card "Sign in with Roblox" shows the linked Roblox username and a "Disconnect Roblox"
   button. While Roblox is the account's only way in (a Roblox-only account) there is no button: the card says Roblox is how
   the account signs in, that it cannot be disconnected because there would be no way back in, and how to withdraw StudPilot's
   access (section 11, item 4). Such an account is shown by its Roblox username, never by its placeholder address, and has no
   email or password form; export, delete and the other gated actions ask it to sign in with Roblox again, and the action carries on
   by itself when it comes back (sections 11 and 12).
4. Only `openid profile` is requested. The asset scopes (`asset:read asset:write`) arrive with uploads (M5c), with
   their own consent screen. Adding scopes later makes every user consent again, so none is asked for early.

O0 (the domain) was done in M1, step 1.5 (commit `a7d23218`: `https://studpilot.app` is the product origin). The
redirect URI here is built on it.

## 2. How it works

```
browser            worker (studpilot.app)                       Roblox                 Supabase Auth
  | GET /auth/roblox/start          |                              |                        |
  |-------------------------------->| state + PKCE verifier + purpose -> KV (600 s, single use)
  |<-- 302 authorize?...S256 --------| Set-Cookie __Host-rbx_oauth_state (HttpOnly, Secure, Lax, Path=/)
  |                                 |   a re-authentication (start?reauth=<action>) adds prompt=login and max_age=0
  |------------------------------------------------------------>| user consents
  |<-- 302 /auth/roblox/callback?code&state ---------------------|
  |-------------------------------->| state read and DELETED; cookie must match
  |                                 |-- POST v1/token (code + verifier + client secret) -->|
  |                                 |-- GET v1/userinfo ---------->|  sub, preferred_username
  |                                 | link by sub (D1 roblox_identities); a link to a deleted user is dropped
  |                                 | KNOWN: token_hash -> KV under a random handle (300 s, single use), READY
  |                                 |   (a re-authentication also writes reauth_at = the server's clock)
  |                                 |   -- POST .../generate_link (the user's CURRENT address) -->|
  |                                 | NEW:   nothing is made. The Roblox identity and the SEALED refresh token wait in KV
  |                                 |        under the handle as PENDING. (A re-authentication never makes an account: 403.)
  |<-- 302 /app/auth/roblox   NOTHING in the URL; Set-Cookie __Host-rbx_oauth_handle (HttpOnly, Secure, Lax, Path=/)
  | SPA: somebody already signed in here? Ask, redeem nothing. Otherwise:
  |-- POST /auth/roblox/redeem (same Origin, cookie, no body) -->| READY: handle read and DELETED; cookie cleared
  |<-- { token_hash, next } ---------------------------------------|   PENDING: { confirm: "new-account", username }, nothing spent
  | SPA, a first sight: "This creates a new StudPilot account. Already have one? Sign in with your email instead."
  |-- POST /auth/roblox/create  (Continue) -->| NOW the user is made (admin API), the token stored, the link minted:
  |                                            | the record becomes READY under the same handle; { created: true }
  |-- POST /auth/roblox/redeem -->| { token_hash, next } once
  |-- POST /auth/roblox/decline (Go back) -->| the pending record is deleted, the Roblox authorization revoked; nothing was made
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
  random 256-bit handle (300 s) and sets the handle in a cookie named `__Host-rbx_oauth_handle` (HttpOnly, Secure, SameSite=Lax,
  Path=/, no Domain). The redirect carries nothing, so no link anyone can make signs in a person who does not hold the cookie. `POST /auth/roblox/redeem` requires the request's own `Origin` (checked before anything is spent), reads
  and burns the handle, returns `{token_hash, next}` once and clears the cookie.
- **The two flow cookies cannot be planted.** A cookie with an ordinary name can be set on this host by a response over plain
  http before HSTS is known, or by any sibling subdomain, and a planted state or handle reopens login CSRF. On https the state
  and handle cookies are therefore `__Host-rbx_oauth_state` and `__Host-rbx_oauth_handle`, which a browser accepts only when
  they are Secure, Path=/ and carry no Domain, so neither of those can set them; only the prefixed names are read there, so a
  request with just the bare names has no state and no handle. `__Secure-` was not used for the path-scoped cookie it would
  have suited: a sibling subdomain can still set one with `Domain=studpilot.app`. The price of `Path=/` is that each cookie
  travels with every request to this host while it lives (state until the callback clears it, at most 10 minutes; handle
  until redeem clears it, at most 5); both are HttpOnly and single use. The registered `http://localhost:5173` dev origin,
  where a Secure cookie is not reliable, keeps the bare names and the narrow paths: the state cookie `/auth/roblox`, the handle cookie
  `/auth/roblox/`, the directory that redeem, create and decline share (it was `/auth/roblox/redeem`, which the browser never sent to the
  other two; section 13, item 3).
- **A NEW account is made only after the person has said so (cycle 3).** The callback for a Roblox account nobody here has seen makes
  nothing: no Supabase user, no D1 row. It writes a `pending` record to KV under the handle (the verified `sub`, the cleaned username,
  the Roblox refresh token sealed with `CREDENTIAL_KEY`, the scope; five minutes) and redirects as for any sign-in. `POST
  /auth/roblox/redeem` answers such a record `{confirm: "new-account", username}` and spends nothing, so a reload asks again. The SPA
  shows the card. **Continue** is `POST /auth/roblox/create`: only then does the worker find or make the user (the existing keyed
  address logic, unchanged), store the held token, mint the sign-in link and turn the same record into a ready one, which `redeem`
  hands over once. Nothing is burned when a Continue fails, so it can be pressed again; making the user is idempotent. **Go back** is
  `POST /auth/roblox/decline`: the record is deleted and the held token is revoked at Roblox (a failed revoke is logged as `decline
  revoke` and the record is deleted all the same). Both are same-origin POSTs checked before anything is read, and both share the
  handle's own bucket with `redeem`. A returning account (found by `sub`) is never asked. A link to a deleted user (the stale link
  of cycle 1) is dropped and the sign-in then IS a first sight, so it is asked like one.
- **A re-authentication is a flow of its own (cycle 3).** `/auth/roblox/start?reauth=<action>` (an action id is lower-case words and
  hyphens, nothing else; anything else is an ordinary sign-in) stores `purpose: "reauth"` with the state, asks Roblox for a fresh
  login (`prompt=login` and `max_age=0`; section 6, item 8 says what is and is not confirmed about them) and sends the browser back to
  `/settings?resume=<action>`. At the callback a re-authentication never makes an account (an unlinked Roblox account is refused with
  403, and the authorization it was just given is revoked; the one exception is an account whose Roblox access was lost and wiped, which is
  found by the one-way code the wipe left next to its account id in `roblox_wiped`, must prove itself as a sign-in does, and is linked again:
  planning/proof/M2/LEGAL-CLAIMS.md section 10), and on success the worker writes `roblox_identities.reauth_at`, the time by
  its own clock, as the last step, after the sign-in token has been minted. An ordinary sign-in writes nothing. That record is what
  decides a Roblox-only account's gate, in two places: `GET /api/me/export` and `POST /api/me/delete` refuse a Roblox-only account
  (its address is the placeholder) with 403 `reauth_required` unless it was written in the last ten minutes, and
  `GET /api/me/roblox/connection` answers `reauthFresh` for the SPA's gate. The window is the web's `REAUTH_WINDOW_MS`, held equal by a
  test, and is read and written by the worker's clock only: a device clock never takes part. The session's `last_sign_in_at` is not
  consulted for a Roblox-only account at all (any sign-in sets it, and a roblox.com session that is still open satisfies a sign-in by
  itself). Everyone else proves who they are with their password in the SPA, as before.
- **The refresh token** is sealed with `CREDENTIAL_KEY` (the same AES-GCM helper the Open Cloud key uses) in
  `roblox_oauth_tokens(user_id, sealed_refresh, sub, scopes, version, rotated_at, lease_until)`. Roblox refresh
  tokens are single use. A fresh sign-in REPLACES the stored token and deliberately does not revoke the previous one
  (section 10, item 5). `refreshRobloxAccessToken` first claims a lease on the row (a conditional update on
  `version` and `lease_until`), only then calls Roblox, then stores the replacement by compare-and-swap on
  `version` and `generation`. Two requests at once: one refreshes, the other is told `busy`. A sign-in or disconnect that lands
  while Roblox is answering wins, and the stale replacement is discarded and revoked. The 15-minute access token is cached
  per person in the isolate's memory and handed out only while it is unexpired and the row is still at the version AND the generation it was
  issued under (the generation is a random label made at every sign-in and kept by every refresh; `version` alone restarts at 1
  when a disconnect deletes the row), so a new sign-in voids it, a disconnect (no row) is answered before the cache is read, and
  a token from a revoked grant is never served after sign-ins that bring the row back to the same version number. A Roblox 429 is
  `unavailable` (try again), not `refused` (the grant is dead). Nothing calls it yet; it is the building block for uploads (M5c).
- **Disconnect** (`POST /api/me/roblox/disconnect`, JWT-authed) revokes the grant at Roblox with the stored token,
  deletes the token row and the identity link, and is idempotent. NOTHING is deleted, and no success is reported, unless
  the revoke is confirmed (the sealed token is the only handle to revoke with): a missing secret is a 503
  (`unavailable`), a sealed token that cannot be opened (a rotated key) is a 500 (`token_unreadable`), Roblox not
  answering or refusing is a 502 (`revoke_failed`), and none of them carries a `revoked` field. Roblox answering 400
  counts as "already revoked" ONLY when its body says `invalid_token`, the documented case; any other 400 (our own request
  or credentials were wrong, so the token may be live), a 401, a 429 or a 5xx is a failure. A success says `revoked: true`
  (Roblox confirmed) or `null` (there was no stored token), and the web card words a withdrawal only for those. The card does not offer the button while Roblox is the account's only way in;
  the route still answers that case as above for any other caller.
- **Export and erasure.** Both tables are in the account export (`user-export.ts`; the sealed token and the
  lease are withheld and the file says why) and in account erasure (`erasure.ts`): the grant is revoked at Roblox
  first, then the token table is swept, with a receipt line each and a note on whether Roblox was reached. **The `roblox_identities` row
  is swept last of the stores, just before the Supabase account, and only when every other step succeeded; and when the sign-in then cannot be removed it is put back
  (LEGAL-CLAIMS section 10).** For a Roblox-only account that row is the proof of its re-authentication
  (`reauth_at`) and the thing a re-authentication needs to exist at all, so while any other step has failed it stays, the receipt carries a
  `failed` step for it that says to run the deletion again, and the run that completes the rest removes it. Swept earlier, a part-failed
  deletion (207, "run it again") could not be run again by such an account: the retry answered 403 `reauth_required` (section 13, item 1).
  An account with no such row is not told about one.
- **Hardening on `/auth/roblox/*`:** `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, the router's `ipLimited` with a bucket per kind of request (next bullet),
  one fixed sentence on every error page (nothing Roblox sent is reflected), and no log line that carries a query
  string, a token, a code, a state, a handle or a response body (the only line is `[roblox-oauth] <stage>`). An `oauth_token`
  redaction rule was added to the worker's `redaction.ts` (credential shapes only; it blocks egress, so a field NAME is not
  enough) and, as a wider net for a log line, to the browser's Sentry scrub.

- **Rate limits are per kind of request, sized for a shared address.** `status` 120 a minute per address (pinned by a test: a hundred
  calls from one address are served, the 121st is not, and thirty other addresses never meet it). `start` 60 a minute per
  address (a lab of thirty can sign in together). `callback` and the handle routes (`redeem`, `create`, `decline`) come after the person
  has consented at Roblox, so a refusal there throws a sign-in away: they are keyed by their OWN state or handle (5 a minute: one use and
  a reload or two), never by the shared address, and a request from another origin never spends a handle's bucket. A request with no
  usable state or handle, and a well-formed state or handle that nobody holds (random, replayed, expired), count against a per-address
  stray allowance (60 a minute). **That allowance has two buckets per kind (the final pass):** `stray` for a request that carries a
  well-formed flow cookie of the right name (the state cookie at the callback, the handle cookie at redeem, create and decline), and `junk`
  for one that does not (no cookie, a malformed one, only the bare name production never reads) or that comes from another origin. A page
  on another site can send any number of the second kind (an `<img>` of the callback, a cross-site POST: the browser sends it no
  SameSite=Lax cookie) and, when they shared a bucket with the first, sixty of them refused the person's own real flow at that address for
  a minute. The real flow never reads or writes `junk`; both are bounded at 60. **The stray bucket is asked BEFORE KV is read (cycle 3):** an address that
  has already used its sixty is answered 429 without a single KV read, so fresh random values cannot cost reads; the price is that a
  real flow from that same address is refused too until the minute is out (nothing of it is read, burned or cleared, so it finishes
  afterwards: its state lives ten minutes). Replay protection is unchanged: a state and a handle are single use and burned on first
  read; the buckets only bound how hard a spent value can be hammered. One shared bucket of 20 for all three, which cycle 2 replaced,
  locked a lab out at its seventh sign-in.

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
__Host-rbx_oauth_state=` (with `Secure` and `Path=/`) and `cache-control: no-store`. Before the secrets are set the same command shows `503`, and
`curl -s https://studpilot.app/auth/roblox/status` shows `{"configured":false}`; after, `{"configured":true}`.
Then the handoff's own check for O2: the owner signs in with Roblox in a private window (the app is in Roblox's
private mode, 10 users, until review) and lands in the app.

## 5. What was built, and where

Worker: `apps/worker/src/roblox-oauth.ts` (new; cycle 2 changed its cookies, limits and token row; cycle 3 added the re-authentication purpose
and its server-side record, the held first sight with `/create` and `/decline`, and the stray allowance asked first; the final pass split the
stray allowance into `stray` and `junk` and gave the dev handle cookie the path `/auth/roblox/`); `erasure.ts` (the final pass sweeps the Roblox
link last, and only when everything else succeeded); `keyedId` in `user-credentials.ts`;
wiring in `index.ts` (cycle 3: `ipSpent`, the read-only twin of `ipLimited`, and the gate on `GET /api/me/export` and `POST /api/me/delete`); `env.ts` (three
optional secrets); `erasure.ts`, `user-export.ts` (cycle 3: `reauth_at` named as bookkeeping), `account-export.ts`; `redaction.ts`.
Web: `lib/roblox-signin.ts` (the button's and the landing page's logic and hooks), `components/roblox-connection-card.tsx`
(new); `routes/auth-pages.tsx` (button, landing page), `app.tsx` (route `/auth/roblox`, outside both guards like
`/confirm`), `routes/settings.tsx`, `lib/settings-search.ts`, `lib/api.ts`, `lib/sentry.ts`. Cycle 2 added
`lib/account-identity.ts` (who an account is: Roblox-only by `app_metadata.roblox_sub`; what to show instead of a placeholder
address), `lib/account-state.ts` (clears the previous account's drafts, searches and view state) and `lib/use-roblox-username.ts`,
and changed `components/reauth-dialog.tsx`, `components/layout.tsx` and `lib/auth.tsx` (one word: `AuthContext` is exported). Cycle 3
added to `lib/roblox-signin.ts` the first-sight card's calls (`createRobloxAccount`, `declineRobloxAccount`, `continueRobloxNewAccount`, the
`confirm-new` state, `robloxReauthHref`), to `lib/auth-flows.ts` `resumeActionFrom`, and changed `routes/settings.tsx` (the Roblox gate and the
resume on arrival), `routes/auth-pages.tsx` (the card and its wiring) and `components/reauth-dialog.tsx` (the link carries the action).
Tests: `apps/worker/tests/roblox-oauth.test.mjs` (98), `apps/web/tests/roblox-signin.test.mjs` (60) with its helpers
`apps/web/tests/hook-harness.mjs` and `apps/web/tests/page-harness.mjs` (runs a page component's own code: section 11, item 5; cycle 3 gave
it a stand-in for the query layer, `fakes` that replace a module for every importer, and `expose` for an export the app does not make, so
`SettingsPage`, the shell and `useRobloxUsername` are executed), plus cases in `secret-redaction.test.mjs` and `sentry.test.mjs`.

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

6. **Cycle 2: the `__Host-` cookies in a real browser.** The state cookie is set on a 302 that answers a top-level navigation and
   must come back on the callback, a cross-site top-level GET from Roblox; `SameSite=Lax` allows that. Not observed. If a
   browser refused it, every sign-in would answer 400 "state not bound to this browser".
7. **Cycle 3, replacing cycle 2's item 7: a re-authentication no longer rests on `last_sign_in_at`.** The worker records it itself
   (`roblox_identities.reauth_at`, its own clock) and the gate reads that. What is unobserved is the whole round trip: press Export in
   Settings as a Roblox-only account, confirm with Roblox, come back, and the export starts by itself with no second press; press it
   again within ten minutes and nothing asks; wait eleven and it asks. If a browser does not return to `/settings?resume=<action>`
   intact, the action does not resume and the person presses it again (the gate is still the server's record, so no loop).
8. **Cycle 3: `prompt=login` and `max_age=0` are TO VERIFY LIVE and are not claimed as documented.** A re-authentication adds both to the
   authorize request, so that a roblox.com session that is already open in the browser is not enough by itself. What the repository's own
   saved Roblox notes say (`planning/roblox-oauth-setup.md`, "Endpoints") is that the discovery document is
   `https://apis.roblox.com/oauth/.well-known/openid-configuration` and that the endpoints are `v1/authorize`, `v1/token`, `v1/userinfo`,
   `v1/token/revoke` and `v1/token/introspect`; it lists no authorize parameters, and nothing could be fetched here, so neither parameter is
   confirmed. They are OpenID Connect Core's own parameters and are sent because they cost nothing if ignored. First live checks, in
   order: read the discovery document for what the authorize endpoint supports; run a re-authentication with roblox.com signed in and see
   whether Roblox asks for the password. If it does not, a re-authentication proves only that somebody at that browser can finish a Roblox
   sign-in, which is the weaker proof of cycle 2 (and the id token's `auth_time` is the next thing to look at: nothing here reads it,
   because whether Roblox sends one is not known either). If Roblox REJECTS a parameter it does not know, every re-authentication fails at
   the authorize step (the callback answers 400 "no code"): remove that parameter in `start()`, one line.
9. **Cycle 2: `session.user.app_metadata.roblox_sub`** is what the SPA reads to recognise a Roblox-only account. The Auth API returns
   `app_metadata` on the user object supabase-js hands the page; not observed. Cycle 3 leans on it twice more: the Settings gate and the
   resume only apply to an account the SPA recognises this way (the worker's own gate on export and delete reads the placeholder address
   instead, as `disconnect` does).
10. **Cycle 3: the held first sight lives in KV for five minutes.** `redeem`, `create` and `decline` read and rewrite one KV key across
   several requests, and KV is eventually consistent, so a Continue that reaches another location within seconds of the question may find
   nothing (the failure card; the person starts again). The record carries the Roblox refresh token sealed with `CREDENTIAL_KEY`, like the
   stored one. Not observed.
11. **Cycle 3: Go back revokes the authorization it was given.** For a Roblox account with no StudPilot account here that is the only
   token anywhere; for one whose link was dropped as stale, revoking may also end the old, dead user's token, which nobody holds. Not
   observed. If Roblox words an already-revoked token differently the revoke is logged (`decline revoke`) and the record is deleted
   all the same.
12. **D-14 (2026-10-05): the lost-grant wipe and the daily introspection check.** `v1/token/introspect` was written from the endpoint list in
   `planning/roblox-oauth-setup.md` and never observed; whether it accepts a refresh token and answers `{"active": false}` for a revoked one is the
   first thing to watch (an `inactive` answer is confirmed by a refresh before anything is deleted, so a misreading wipes nobody). Also unobserved:
   GoTrue's admin `PUT` removing a metadata key set to `null`, and PostgREST taking the `sb_secret_` key in `apikey` alone for the one profile `PATCH`.
   The full list, with the guards, is in `planning/proof/M2/LEGAL-CLAIMS.md` section 9.4.

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
- **`ipLimited` is per isolate,** like every other limiter here: best effort, not a global ceiling. Flooding is for Cloudflare's own
  rate limiting in front of the worker; a per-state or per-handle bucket cannot stop it.
- **KV is eventually consistent.** A replayed callback that reaches another colo within seconds could still see the
  state; the cookie (cleared on first use) and Roblox's own single-use code are what stop it. The same holds for the
  handle: a redeem that reached another colo before the callback's write had propagated would see no handle and the page
  would say it could not sign the person in (they try again); a replayed redeem needs the cookie as well.
- **"Stay signed in" leaves the handle for its five minutes.** It is HttpOnly, tied to this browser and its own Roblox account (in
  production `Path=/`, as `__Host-` demands; on the dev origin `/auth/roblox/`), and only same-origin script can spend it, so it is left to
  expire rather than spent.
- **The choice appears for any existing session,** including one for the same Roblox account: who the token is for is not
  known until it is redeemed, and redeeming is what must wait for the person.
- **The dev origin's cookies are bare-named and not Secure.** Production is always https and uses the `__Host-` names; the
  registered dev origin `http://localhost:5173` is plain http, where some browsers refuse a Secure cookie, so it has no prefix to
  lean on and keeps the narrow paths (`/auth/roblox` for the state, `/auth/roblox/` for the handle). A planted cookie is therefore possible
  there, which is acceptable for a developer's machine.
- **A Roblox-only account cannot change its email or set a password.** Settings shows no form for either (the address is a
  placeholder, so Supabase's secure email change would wait for a confirmation nobody can give). Making that possible needs a
  decision about the Supabase setting and a real-address step; it is the owner's.
- **On return from a re-authentication the landing page still asks "Confirm it is you?"** (Continue or Cancel), because a session exists
  in that browser (cycle 2): one more click after Roblox's own login. The action then resumes by itself (cycle 3). Skipping the click
  would need the redeem answer before the choice, and the choice exists to keep the handle unspent.
- **A flood of strays that carry a cookie of the right name from one address also refuses that address's real flows for the rest of the
  minute** (cycle 3: the stray allowance is asked before KV is read). Nothing of a refused flow is read, burned or cleared, so it finishes
  afterwards. **Requests with no usable cookie, or from another origin, no longer do that** (the final pass: the `junk` bucket, section 2),
  which is every request a page on another site can make. What is left: somebody at the same address who can send a well-formed cookie of the
  right name AND, for the handle routes, this site's own Origin (a script on this origin, or a hand-made request) can still spend that
  address's `stray` bucket; that is a person inside the lab, and a per-address bucket cannot tell them from their neighbour.
- **`/auth/roblox/start` still shares one bucket per address** (60 a minute). A request to it carries no cookie yet, real or not, so nothing
  tells a person's start from an `<img>` of it on another site, and sixty of those refuse the address's starts for a minute. A refused start
  costs the person a retry and nothing else (nothing was spent at Roblox); the stray allowance is the one that threw away a consented sign-in.
- **`strike()` in the stray count is redundant with `spent()` when requests arrive one after another** (mutation `f.J6` survived and is
  reported as it was): `spent()` refuses the sixty-first before any read, so `strike()` can only answer `true` for requests that interleave
  inside one isolate, and then the read has already happened. It changes the status of those requests, not what they cost.
- **A password account is still gated by `last_sign_in_at` against the device clock** (`needsReauth`). It does not loop: the dialog runs the
  action at once and does not re-evaluate it; only a second gated action within ten minutes, on a device whose clock is off, asks again.
- **The first-sight hold is five minutes,** the handle's life.
- **The data export file records what is stored:** `user.email` and the `profiles` row carry the placeholder address of a Roblox-only
  account. It is a data record, not a screen; no screen shows it.
- **The Settings page is not rendered to a browser** (no DOM): since cycle 3 `SettingsPage` is CALLED in a test and the element tree it
  returns is read (the email and password rows, the gate, the resume), and the pieces that carry the words (the dialog, the card, the
  landing view) are rendered to markup; what no test has seen is the page painted. The first live run is the first time the page is seen
  as such an account.
- **The worker's `signInKept` disconnect answer is no longer reachable from the UI.** The route still produces it, tested.
- **The access-token cache is per isolate.** Parallel callers in different isolates are still kept apart by the lease
  (one is told `busy`), not by the cache.
- **The web Sentry scrub keeps the wider `oauth_token` pattern.** It scrubs a log line and blocks nothing, so over-matching
  costs a reader nothing; only the worker's rule, which also blocks egress, is limited to credential shapes.
- **Uploads (O4), the 13+ check, the Roblox review package and the thumbnail** are later milestones.

## 8. Measured results (2026-10-05, branch `studpilot/m2-roblox`, Node 26.8.1)

After the final pass (section 13). The next columns are what this section said after the third review round (section 12), the second
(section 11) and the first (section 10).

| Command | After the final pass | After the third round | After the second round | After the first round |
|---|---|---|---|---|
| `cd apps/worker && pnpm typecheck` | exit 0 | exit 0 | exit 0 | exit 0 |
| `cd apps/worker && node --test` | tests 5529, pass 5523, fail 0, skipped 6 | 5523, 5517, 0, 6 | 5508, 5502, 0, 6 | 5495, 5489, 0, 6 |
| `cd apps/web && pnpm typecheck` | exit 0 | exit 0 | exit 0 | exit 0 |
| `cd apps/web && node --test` | tests 2515, pass 2515, fail 0 | 2515, 2515, 0 | 2496, 2496, 0 | 2478, 2478, 0 |
| `node --test tests/` (root) | tests 631, pass 613, fail 2, skipped 16. The two failures are the scratchpad-location cases in `tests/check-pixels.test.mjs` ("THE CONTROL: against a SAME-ORIGIN baseline..." and "against a baseline with NO provenance..."), which fail when the clone lives under a scratchpad path | the same | the same | the same |
| `node scripts/check-old-names.mjs` | CLEAN, 0 violations, 46138 hits, all allowlisted (the count did not move) | CLEAN, 0 violations, 46138 hits, all allowlisted | the same | the same |
| `pnpm build` in `apps/web` (exit 0), then `node scripts/check-app-bundle.mjs` | entry 142.4 kB gzipped (budget 150), eager graph 268.0 kB | 142.4 kB, 268.0 kB | 141.9 kB, 267.6 kB | 141.5 kB, 267.1 kB |

New tests in the final pass: `roblox-oauth.test.mjs` 92 to 98 (+6: a part-failed erasure that can be run again, an erasure that fails for an account with no
link, junk that cannot spend a real flow's allowance (nine shapes), strays at `/create` and `/decline`, a refused handle route that touches nothing of
the person's, and the browser's path match in production and on the dev origin); `roblox-signin.test.mjs` stays at 60 (two assertions restored in one test).
Restated, not added: the dev-origin test's path assertion (now `/auth/roblox/`), and the `NO SECRET, TOKEN, CODE, STATE OR QUERY STRING...` test, which
now runs a real sign-in through Continue and the two new routes' log lines. The fresh-address helper of the worker test no longer wraps at 250 (the file
allocated 318), so a test that exhausts an address never meets it again.

New tests in cycle 3: `roblox-oauth.test.mjs` 77 to 92 (+15), `roblox-signin.test.mjs` 41 to 60 (+19). Several of the existing ones were restated,
not only added to, because the contract changed on purpose: a first sight is made by Continue, not by the callback (the helpers `signIn` and
`tokenHashOf` press Continue for the tests that are not about it); a Roblox-only account's export and delete need a re-authentication; an
address over its stray allowance is refused before KV is read, so "a real flow from that address is untouched" became "nothing of it is
burned"; the landing hook and view gained the first-sight state and props; the dialog's link carries the action; and the old "the gate lets a
Roblox-only account through after a fresh sign-in" test, which asserted the device-clock comparison this cycle removed, was replaced by tests
that execute `SettingsPage`.

A local-only browser check was made on the first version (the Vite dev server, every non-localhost request aborted, the
status route stubbed): the button shows on `/app/login` and `/app/signup` at 1280 and at 375 pixels with no horizontal
scroll and is absent when the status says `false`. **It was not repeated after either review round**: the landing page needs the
worker's redeem route, which the dev server does not serve, and what a Roblox-only account sees in Settings needs a signed-in Roblox
account on a live Supabase. What was observed there (the failure card) is what the behaviour tests now execute, and the live
check of section 4 is the first time the whole path is seen.

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

**Superseded in cycle 2 (cookies).** `r.W03` to `r.W06` and `r.W10` mutated a cookie's attributes or clearing, and `r.W06` ("handle
cookie sent to the whole site") named a path scope that is now the required design: on https a `__Host-` cookie must be `Path=/`.
Every test that read a cookie's name, path or attributes was restated, and `c2.K01` to `c2.K15` below are the mutations of the
restated tests. The other lines of 9 and 9b still hold; the web tests that `r.B..` aimed at (the landing hook, the choice card and
the Connections card) were restated in cycle 2 with the new state shape and card text, and `c2.W..` are their counterparts.

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

### 9c. Cycle 2: 95 changes, 95 red

Same method and the same runner as 9b (each change made alone, the named test file run, the exact reverse replacement made, the
file checked byte-identical afterwards, a baseline run first that must be green). `red N (N of M)` is how many tests in that file
failed; M is the same on every run of a file (77 for the worker file, 41 for the web file), so a red is a failing assertion and
not a file that stopped loading. The first runs found two survivors, each a real gap in the tests and each fixed before it was
recorded as red: `c2.G03` (a re-sign-in kept the previous generation: the worker test now requires a new random one at every
sign-in) and `c2.W38` (the Roblox re-auth dialog could drop the sentence that says why the action asks: each action must have
its own explanation). The prefixes: `K` cookies, `L` limits, `S` strays, `G` generation, `T` the test additions (minted link,
foreign `roblox_sub`, route-level catches, stray calls), `E` export and delete for a Roblox-only account, `W` the web changes.

```
RED  c2.K01 the flow cookies lose the __Host- prefix on https: roblox-oauth.ts -> red 64 (64 of 77)
RED  c2.K02 the production cookies are not Secure: roblox-oauth.ts -> red 6 (6 of 77)
RED  c2.K03 the production cookies are path-scoped (a __Host- cookie must be Path=/): roblox-oauth.ts -> red 5 (5 of 77)
RED  c2.K04 the production cookies carry a Domain: roblox-oauth.ts -> red 5 (5 of 77)
RED  c2.K05 the production cookies are readable by script (no HttpOnly): roblox-oauth.ts -> red 5 (5 of 77)
RED  c2.K06 the production cookies are SameSite=None: roblox-oauth.ts -> red 5 (5 of 77)
RED  c2.K07 the callback reads the BARE state cookie name in production: roblox-oauth.ts -> red 61 (61 of 77)
RED  c2.K08 the callback accepts the bare state cookie as well as the prefixed one: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.K09 the redeem reads the BARE handle cookie name in production: roblox-oauth.ts -> red 19 (19 of 77)
RED  c2.K10 the redeem accepts the bare handle cookie as well as the prefixed one: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.K11 the dev origin is given prefixed names (nothing is the dev origin): roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.K12 production is given the bare names (everything is the dev origin): roblox-oauth.ts -> red 64 (64 of 77)
RED  c2.K13 the cleared state cookie loses its prefix: roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.K14 the cleared handle cookie loses its prefix: roblox-oauth.ts -> red 3 (3 of 77)
RED  c2.K15 the dev cookies are Secure (they would not work on http://localhost in Safari): roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.L01 start is back on the shared 20-a-minute bucket: roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.L02 start allows 20 a minute for an address: roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.L03 start allows 600 a minute (no real ceiling): roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.L04 callback is limited by the shared address, 20 a minute: roblox-oauth.ts -> red 3 (3 of 77)
RED  c2.L05 redeem is limited by the shared address, 20 a minute: roblox-oauth.ts -> red 3 (3 of 77)
RED  c2.L06 a replayed state is never limited: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.L07 a replayed handle is never limited: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.L08 a callback with no usable state is never limited: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.L09 a redeem with no usable handle is never limited: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.L10 a request from another origin spends the handle's bucket: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.L11 the status check shares the start bucket: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.L12 stray callbacks spend the address's start bucket: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.L13 the state bucket is shared by every flow (a constant key): roblox-oauth.ts -> red 63 (63 of 77)
RED  c2.S01 a state nobody holds is not counted against the address: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.S02 a handle nobody holds is not counted against the address: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.S03 a state of invalid shape is counted twice against the address: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.S04 an unknown handle is refused with 429 but the cookie is left: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.S05 a state HELD by a flow is counted as a stray: roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.G01 the access-token cache ignores the generation: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.G02 the compare-and-swap ignores the generation: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.G03 a sign-in keeps the old generation: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.G04 every sign-in mints the same generation: roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.G05 a refresh forgets the generation in the cache entry: roblox-oauth.ts -> red 2 (2 of 77)
RED  c2.T01 the minted link is trusted without checking whose it is: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T02 an address held by a user with ANY roblox_sub is adopted: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T03 the /start catch logs the error text: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T04 the /start catch reflects the error in the page: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T05 the /callback catch logs the error text: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T06 the /callback catch answers the request URL (which carries the code) in the page: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T07 the /start catch does not clear the state cookie: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T08 the /callback catch does not clear the state cookie: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T08b the /redeem catch logs the error text: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T08c the /redeem catch answers the error text: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T08d the /redeem catch does not clear the handle cookie: roblox-oauth.ts -> red 1 (1 of 77)
RED  c2.T09 the callback uses the secret key for a table query after a sign-in (a stray call, answered by nothing): roblox-oauth.ts -> red 62 (62 of 77)
RED  c2.E01 the export refuses an account whose address is a placeholder (asks for a password): index.ts -> red 1 (1 of 77)
RED  c2.E02 the deletion refuses an account whose address is a placeholder (asks for a password): index.ts -> red 1 (1 of 77)
RED  c2.W01 the page's redeem reads window.location.hash instead of asking the worker: auth-pages.tsx -> red 4 (4 of 41)
RED  c2.W02 the page's currentAccount always answers null (a silent replacement): auth-pages.tsx -> red 4 (4 of 41)
RED  c2.W03 the landing never shows the choice (startRobloxLanding redeems straight away): roblox-signin.ts -> red 5 (5 of 41)
RED  c2.W04 the page does not wire onSwitch: auth-pages.tsx -> red 2 (2 of 41)
RED  c2.W05 the page's onStay goes to Settings instead of home: auth-pages.tsx -> red 1 (1 of 41)
RED  c2.W06 the page navigates on without replacing the history entry: auth-pages.tsx -> red 3 (3 of 41)
RED  c2.W07 the page trades the token as another OTP type: auth-pages.tsx -> red 1 (1 of 41)
RED  c2.W08 the page does not hand the hook the account-switched cleanup: auth-pages.tsx -> red 2 (2 of 41)
RED  c2.W09 the page never tells the hook the account is a Roblox one: auth-pages.tsx -> red 1 (1 of 41)
RED  c2.W10 the page ignores an error from getSession: auth-pages.tsx -> red 1 (1 of 41)
RED  c2.W11 the page asks the choice view for a failure card: auth-pages.tsx -> red 2 (2 of 41)
RED  c2.W12 the cleanup also runs when the SAME account signs in again: roblox-signin.ts -> red 2 (2 of 41)
RED  c2.W13 the cleanup never runs: roblox-signin.ts -> red 4 (4 of 41)
RED  c2.W14 the cleanup runs when nobody was signed in before: roblox-signin.ts -> red 2 (2 of 41)
RED  c2.W15 a cleanup that throws undoes the sign-in: roblox-signin.ts -> red 1 (1 of 41)
RED  c2.W16 the switch forgets who was signed in: roblox-signin.ts -> red 3 (3 of 41)
RED  c2.W17 the cleanup forgets the view state: account-state.ts -> red 4 (4 of 41)
RED  c2.W18 the cleanup forgets the drafts: account-state.ts -> red 4 (4 of 41)
RED  c2.W19 the cleanup forgets the search history: account-state.ts -> red 4 (4 of 41)
RED  c2.W20 the cleanup clears everything in storage: account-state.ts -> red 3 (3 of 41)
RED  c2.W21 a Roblox-only account is offered Disconnect: roblox-signin.ts -> red 2 (2 of 41)
RED  c2.W22 the dead-end advice is back: roblox-signin.ts -> red 1 (1 of 41)
RED  c2.W23 the card drops the reason Disconnect is unavailable: roblox-signin.ts -> red 2 (2 of 41)
RED  c2.W24 the card does not say how to withdraw access: roblox-signin.ts -> red 1 (1 of 41)
RED  c2.W25 a Roblox account is recognised from user_metadata (which a person can write): account-identity.ts -> red 5 (5 of 41)
RED  c2.W26 any non-empty roblox_sub string is accepted: account-identity.ts -> red 1 (1 of 41)
RED  c2.W27 a Roblox account is recognised by the shape of its address: account-identity.ts -> red 2 (2 of 41)
RED  c2.W28 the identity shows the address of a Roblox account: account-identity.ts -> red 1 (1 of 41)
RED  c2.W29 a placeholder address alone does not make an identity a Roblox one: account-identity.ts -> red 1 (1 of 41)
RED  c2.W30 the sentence under the Settings title names the address again: settings.tsx -> red 1 (1 of 41)
RED  c2.W31 the shell prints the raw address again: layout.tsx -> red 1 (1 of 41)
RED  c2.W32 the email row offers its form to a Roblox-only account: settings.tsx -> red 1 (1 of 41)
RED  c2.W33 the password row offers its form to a Roblox-only account: settings.tsx -> red 1 (1 of 41)
RED  c2.W34 the dialog never asks a Roblox account to sign in with Roblox: reauth-dialog.tsx -> red 2 (2 of 41)
RED  c2.W35 the dialog asks every account to sign in with Roblox: reauth-dialog.tsx -> red 1 (1 of 41)
RED  c2.W36 the Roblox re-auth returns to the dashboard instead of Settings: reauth-dialog.tsx -> red 1 (1 of 41)
RED  c2.W37 the Roblox re-auth dialog has no Cancel: reauth-dialog.tsx -> red 1 (1 of 41)
RED  c2.W38 the Roblox re-auth dialog does not say why the action asks: reauth-dialog.tsx -> red 1 (1 of 41)
RED  c2.W39 the confirmation card is worded as a switch: auth-pages.tsx -> red 1 (1 of 41)
RED  c2.W40 the window the dialog names is not the real one: reauth-dialog.tsx -> red 1 (1 of 41)
RED  c2.W41 the landing route is moved inside the guarded layout Route: app.tsx -> red 1 (1 of 41)
RED  c2.W42 the landing route is wrapped in AuthGuard itself: app.tsx -> red 1 (1 of 41)
RED  c2.W43 the landing route is wrapped in GuestGuard itself: app.tsx -> red 1 (1 of 41)
```

### 9d. Cycle 3: 168 changes, 168 red

Same method and the same runner as 9b and 9c (each change made alone, the named test file run, the exact reverse replacement made, the
file checked byte-identical afterwards, `git diff` before the first and after the last the same SHA-256, a baseline run first that must
be green, and each red checked to be a test of the group it was aimed at, not a different guard that happened to fail first). `red N (N
of M)` is how many tests in that file failed; M is the same on every run of a file (92 for the worker file, 60 for the web file), so a
red is a failing assertion and not a file that stopped loading. The first runs found five survivors, each a real gap in the tests and each
fixed before it was recorded as red: `c3.A09` (a state stored without a purpose could be read as a re-authentication), `c3.B06` (the
stamp could be written before the sign-in token was minted), `c3.D22` (a held record without a numeric `sub` was accepted), `c3.L12`
(stray callbacks could spend the address's start bucket) and `c3.N08` (Go back left the card on screen while the worker was told); and
one more, `c3.H01`, was aimed at the wrong test file first. The prefixes: `A` the authorize request, `B` the stamp and its window, `C`
the gate on export and delete, `D` the first sight (and `D26` to `D29` the squatter tests this cycle restated), `E` the stray allowance
asked first, `F` the status ceiling, `G` the refresh lease, `H` the export spec, `L` and `S` the limits and strays the restated tests
guard; in the web file `W` Settings, `U` the username hook and the shell, `P` `isPlaceholderAddress`, `R` the dialog and helpers, `N`
the first-sight card, calls and page wiring..

```
RED  c3.A01 a re-authentication does not ask Roblox to prompt for a login: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.A02 a re-authentication does not say max_age=0: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.A03 every sign-in asks for a fresh login (the lab would type its password at every sign-in): roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.A04 the purpose is never stored as a re-authentication: roblox-oauth.ts -> red 5 (5 of 92)
RED  c3.A05 the action does not ride back to Settings: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.A06 the action id is not checked at all: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.A07 the action id may be upper case: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.A08 the action id may be unanchored (a query smuggled behind a word): roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.A09 a record without a purpose is read as a re-authentication: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B01 an ordinary sign-in is stamped as a re-authentication too: roblox-oauth.ts -> red 3 (3 of 92)
RED  c3.B02 a re-authentication writes no stamp: roblox-oauth.ts -> red 3 (3 of 92)
RED  c3.B03 the stamp is written to every account, not the one that confirmed: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B04 the stamp is written for the wrong user (a constant): roblox-oauth.ts -> red 3 (3 of 92)
RED  c3.B05 the stamp is a counter, not the time: roblox-oauth.ts -> red 3 (3 of 92)
RED  c3.B06 the stamp is written before the sign-in token has been minted: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B07 the window is twenty minutes: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.B08 the window is five minutes: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B09 a stamp from a minute in the future is believed: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B10 a stamp ahead of this clock by any amount is not believed (no noise allowed): roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B11 a stamp never expires: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.B12 a stamp is believed from the future without limit: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B13 the connection answer says fresh whatever the record says: roblox-oauth.ts -> red 3 (3 of 92)
RED  c3.B14 the connection answer never says fresh: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B15 a reauthentication for an unlinked Roblox account makes an account: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B16 a reauthentication for an unlinked account is held as a first sight: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.B17 the authorization given to an unlinked reauthentication is left alive: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.C01 export is not gated: index.ts -> red 2 (2 of 92)
RED  c3.C02 delete is not gated: index.ts -> red 2 (2 of 92)
RED  c3.C03 the gate asks every account, not only a Roblox-only one: roblox-oauth.ts -> red 6 (6 of 92)
RED  c3.C04 the gate never refuses: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.C06 a refusal still lets a stale stamp through (window ignored): roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.D01 the callback makes the account itself (no question): roblox-oauth.ts -> red 9 (9 of 92)
RED  c3.D02 a returning account is asked too: roblox-oauth.ts -> red 3 (3 of 92)
RED  c3.D03 the held refresh token is stored in the clear: roblox-oauth.ts -> red 21 (21 of 92)
RED  c3.D04 the held record is kept for an hour: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D05 asking burns the held record: roblox-oauth.ts -> red 4 (4 of 92)
RED  c3.D06 asking clears the handle cookie: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D07 asking also hands over a token: roblox-oauth.ts -> red 3 (3 of 92)
RED  c3.D08 the question does not name the account: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D09 Continue does not check the origin: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D10 Go back does not check the origin: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D11 Continue makes an account for a sign-in that is not waiting: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D12 Go back answers for a sign-in that is not waiting: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D13 Continue stores no token for the new account: roblox-oauth.ts -> red 27 (27 of 92)
RED  c3.D14 Continue burns the held record before it has worked: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D15 Continue leaves the held record as it was (no ready sign-in): roblox-oauth.ts -> red 10 (10 of 92)
RED  c3.D16 a failed Continue loses the reference: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.D17 Go back does not withdraw the authorization: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D18 Go back keeps what was held: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D19 Go back leaves the handle cookie: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D20 Go back hides a failed withdrawal from the operator: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D21 Continue and Go back have no bucket of their own for the handle: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D22 a pending record without a numeric sub is accepted: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D23 the route for Continue is not mounted: roblox-oauth.ts -> red 70 (70 of 92)
RED  c3.D24 the route for Go back is not mounted: roblox-oauth.ts -> red 4 (4 of 92)
RED  c3.D25 a stale link is no longer a first sight (it is signed in as nobody): roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.E01 the callback does not ask the stray budget before it reads KV: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.E02 the handle routes do not ask the stray budget before they read KV: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.E03 the callback asks the stray budget only AFTER the read: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.E04 the refusal before the read clears the state cookie: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.E05 the stray budget is read through a different bucket than the strikes: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.E06 the router is not given the read-only twin: index.ts -> red 1 (1 of 92)
RED  c3.E07 the read-only twin allows one read more: index.ts -> red 1 (1 of 92)
RED  c3.E08 the read-only twin forgets the window: index.ts -> red 1 (1 of 92)
RED  c3.E09 the read-only twin counts a hit: index.ts -> red 1 (1 of 92)
RED  c3.E10 the stray allowance is 120: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.F01 the status check is limited to 60 a minute: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.F02 the status check is limited to 1000 a minute: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.F03 the status check has one bucket for every address: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.F04 the status check shares the start bucket: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.G01 the lease claim ignores the generation: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.G02 the lease release ignores the generation: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.G04 the lease release is never run after a refusal: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.H01 the new column is neither exported nor excluded: user-export.ts -> red 1 (1 of 13)
RED  c3.L01 start allows 20 a minute for an address: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.L02 start allows 600 a minute for an address: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.L04 callback is limited by the shared address, 20 a minute: roblox-oauth.ts -> red 3 (3 of 92)
RED  c3.L05 the handle routes are limited by the shared address, 20 a minute: roblox-oauth.ts -> red 5 (5 of 92)
RED  c3.L06 a replayed state is never limited: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.L07 a replayed handle is never limited: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.L08 a callback with no usable state is never limited: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.L09 a handle request with no usable handle is never limited: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.L10 a request from another origin spends the handle’s bucket: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.L12 stray callbacks spend the address’s start bucket: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.L13 the state bucket is shared by every flow: roblox-oauth.ts -> red 75 (75 of 92)
RED  c3.S01 a state nobody holds is not counted against the address: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.S02 a handle nobody holds is not counted against the address: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.S05 a state HELD by a flow is counted as a stray: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.S06 a handle HELD by a flow is counted as a stray: roblox-oauth.ts -> red 1 (1 of 92)
RED  c3.D26 a squatter on the address is adopted when the account is made: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.D27 an address that is taken is answered as a generic failure: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.D28 an address that is taken logs the generic stage word: roblox-oauth.ts -> red 2 (2 of 92)
RED  c3.D29 an address that is taken answers 502: roblox-oauth.ts -> red 2 (2 of 92)
```

The web file:

```
RED  c3.W01 a Roblox-only account is gated like everyone else (timestamp against the device clock): settings.tsx -> red 3 (3 of 60)
RED  c3.W02 the gate also trusts the session’s last_sign_in_at: settings.tsx -> red 2 (2 of 60)
RED  c3.W03 any truthy answer is a yes: settings.tsx -> red 1 (1 of 60)
RED  c3.W04 a failed request lets the action through: settings.tsx -> red 2 (2 of 60)
RED  c3.W05 the gate re-checks the server’s yes against the device clock: settings.tsx -> red 2 (2 of 60)
RED  c3.W06 a yes opens the dialog and a no runs the action: settings.tsx -> red 3 (3 of 60)
RED  c3.W07 the password gate no longer asks: settings.tsx -> red 1 (1 of 60)
RED  c3.W08 the gate is decided by the account’s address, not by roblox_sub: settings.tsx -> red 3 (3 of 60)
RED  c3.W09 the resume never runs: settings.tsx -> red 2 (2 of 60)
RED  c3.W10 the resume leaves ?resume= in the address: settings.tsx -> red 2 (2 of 60)
RED  c3.W11 the resume runs for any account, not only a Roblox one: settings.tsx -> red 1 (1 of 60)
RED  c3.W12 the resume strips every query parameter, not only its own: settings.tsx -> red 1 (1 of 60)
RED  c3.W13 the resume runs on every render, not once on arrival: settings.tsx -> red 1 (1 of 60)
RED  c3.W14 the resume does not ask the server, it runs the action: settings.tsx -> red 1 (1 of 60)
RED  c3.W15 resumeActionFrom accepts any word: auth-flows.ts -> red 2 (2 of 60)
RED  c3.W16 resumeActionFrom reads the wrong parameter: auth-flows.ts -> red 3 (3 of 60)
RED  c3.W17 the Roblox account row control branch is inverted (email): settings.tsx -> red 2 (2 of 60)
RED  c3.W18 the Roblox account row control branch is inverted (password): settings.tsx -> red 2 (2 of 60)
RED  c3.W19 the password note is inverted: settings.tsx -> red 2 (2 of 60)
RED  c3.W20 the email note is inverted: settings.tsx -> red 2 (2 of 60)
RED  c3.W21 identity.roblox is disabled for every account: settings.tsx -> red 1 (1 of 60)
RED  c3.W22 identity.roblox is on for every account: settings.tsx -> red 1 (1 of 60)
RED  c3.W23 Settings never asks for the Roblox username: settings.tsx -> red 1 (1 of 60)
RED  c3.W24 Settings drops the Roblox username from the identity: settings.tsx -> red 1 (1 of 60)
RED  c3.W25 Settings names the account by the session address: settings.tsx -> red 1 (1 of 60)
RED  c3.U01 the username query is asked for every account: use-roblox-username.ts -> red 2 (2 of 60)
RED  c3.U02 the username query is never asked: use-roblox-username.ts -> red 2 (2 of 60)
RED  c3.U03 the username is returned for every account: use-roblox-username.ts -> red 1 (1 of 60)
RED  c3.U04 the username query has another key: use-roblox-username.ts -> red 4 (4 of 60)
RED  c3.U05 the username query asks something else: use-roblox-username.ts -> red 1 (1 of 60)
RED  c3.U06 the username is never returned: use-roblox-username.ts -> red 3 (3 of 60)
RED  c3.U07 the shell never asks for the Roblox username: layout.tsx -> red 1 (1 of 60)
RED  c3.U08 the shell drops the username from the label: layout.tsx -> red 1 (1 of 60)
RED  c3.U09 the shell shows the address instead of the label: layout.tsx -> red 1 (1 of 60)
RED  c3.U10 the shell prints the session address: layout.tsx -> red 2 (2 of 60)
RED  c3.P01 a placeholder address is any .invalid anywhere: account-identity.ts -> red 1 (1 of 60)
RED  c3.P02 the dot before invalid is any character: account-identity.ts -> red 1 (1 of 60)
RED  c3.P03 a placeholder address is case sensitive: account-identity.ts -> red 1 (1 of 60)
RED  c3.P04 a placeholder address is not trimmed: account-identity.ts -> red 1 (1 of 60)
RED  c3.P05 every string is a placeholder address: account-identity.ts -> red 5 (5 of 60)
RED  c3.R01 the dialog links to a plain sign-in: reauth-dialog.tsx -> red 1 (1 of 60)
RED  c3.R02 the dialog does not say the action resumes: reauth-dialog.tsx -> red 1 (1 of 60)
RED  c3.R03 robloxReauthHref is a plain sign-in: roblox-signin.ts -> red 2 (2 of 60)
RED  c3.R04 robloxReauthHref does not encode: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.R05 robloxReauthHref uses the wrong parameter: roblox-signin.ts -> red 2 (2 of 60)
RED  c3.N01 the landing page signs in on a question (ignores confirmNew): roblox-signin.ts -> red 5 (5 of 60)
RED  c3.N02 Continue redeems even when the account could not be made: roblox-signin.ts -> red 3 (3 of 60)
RED  c3.N03 a failed Continue loses the reference: roblox-signin.ts -> red 3 (3 of 60)
RED  c3.N04 Continue forgets who was signed in: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N05 Go back does not tell the worker: roblox-signin.ts -> red 2 (2 of 60)
RED  c3.N06 Go back does not leave: roblox-signin.ts -> red 2 (2 of 60)
RED  c3.N07 Continue does not show it is working: roblox-signin.ts -> red 2 (2 of 60)
RED  c3.N08 Go back leaves the card on screen: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N09 create is a GET: roblox-signin.ts -> red 2 (2 of 60)
RED  c3.N10 create goes to the wrong path: roblox-signin.ts -> red 4 (4 of 60)
RED  c3.N11 decline goes to the wrong path: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N12 any 200 from create is a success: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N13 a failed status with created:true is a success: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N14 a hostile reference is shown: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N15 a thrown decline is not swallowed: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N16 an empty username is a question: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N17 the question is only read on a 200: roblox-signin.ts -> red 2 (2 of 60)
RED  c3.N18 the question is not a question unless it says new-account: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N19 the page does not wire Continue: auth-pages.tsx -> red 3 (3 of 60)
RED  c3.N20 the page does not wire Go back: auth-pages.tsx -> red 1 (1 of 60)
RED  c3.N21 the page sends Go back home, not to sign-in: auth-pages.tsx -> red 1 (1 of 60)
RED  c3.N22 the page does not hand the hook the create call: auth-pages.tsx -> red 2 (2 of 60)
RED  c3.N23 the page does not hand the hook the decline call: auth-pages.tsx -> red 1 (1 of 60)
RED  c3.N24 the card words the question differently: roblox-signin.ts -> red 1 (1 of 60)
RED  c3.N25 the card has no Go back: auth-pages.tsx -> red 1 (1 of 60)
RED  c3.N26 the card has no Continue: auth-pages.tsx -> red 1 (1 of 60)
RED  c3.N27 the card does not name the Roblox account: auth-pages.tsx -> red 1 (1 of 60)
RED  c3.N28 the card is an alert: auth-pages.tsx -> red 1 (1 of 60)
RED  c3.N29 the failure card hides the reference: auth-pages.tsx -> red 1 (1 of 60)
RED  c3.N30 the first-sight card is never drawn: auth-pages.tsx -> red 1 (1 of 60)
```

The new test files, run against the sources as they were at the start of this cycle: the worker file, 92 tests, 70 pass, 22 fail;
the web file does not load at all (`SyntaxError: The requested module '../src/lib/roblox-signin.ts' does not provide an export named
'ROBLOX_CREATE_PATH'`), so for it the mutations are the evidence.

### 9e. The final pass: 35 changes, 34 red, 1 survivor

Made the way 9d was: one exact replacement in one source file at a time (it must match exactly once), the test file that should notice it run
at once, then the file put back from a saved copy and checked to be byte-identical by SHA-256 (`restored identical: true` on all 35).
`red N (N of M)` is how many tests failed; M is 98 for the worker file and 60 for the web file. Prefixes: `E` erasure (the Roblox link is last),
`J` the stray and junk buckets, `P` cookie paths, `R` a refused handle route touches nothing of the person's, `L` the log test, `W` the web card.

```
RED  f.E1 the Roblox link is swept even when another step failed: erasure.ts -> red 1 (1 of 98)
RED  f.E2 a kept-link step is reported for an account with no link: erasure.ts -> red 1 (1 of 98)
RED  f.E3 a link lookup that throws is not caught (the receipt is lost): erasure.ts -> red 1 (1 of 98)
RED  f.E4 a link that cannot be looked at is swept as if absent: erasure.ts -> red 1 (1 of 98)
RED  f.E5 the kept step claims it was erased: erasure.ts -> red 1 (1 of 98)
RED  f.E6 the kept step does not say to run it again: erasure.ts -> red 1 (1 of 98)
RED  f.J1 the junk and the stray bucket are one (key ignores the cookie): roblox-oauth.ts -> red 2 (2 of 98)
RED  f.J2 handle-route junk counted in the cookie-carrying stray bucket: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.J3 callback junk with no state counted in the cookie-carrying stray bucket: roblox-oauth.ts -> red 1 (1 of 98)
RED  f.J4 the handler spends the stray bucket whatever the request carries: roblox-oauth.ts -> red 1 (1 of 98)
RED  f.J5 the handle-route junk bucket is unbounded: roblox-oauth.ts -> red 2 (2 of 98)
SURVIVED f.J6 the callback junk bucket is unbounded (handler side): roblox-oauth.ts -> red 0 (0 of 98)
RED  f.J7 Continue counts its strays in the callback bucket: roblox-oauth.ts -> red 4 (4 of 98)
RED  f.J8 Go back counts its strays in the callback bucket: roblox-oauth.ts -> red 4 (4 of 98)
RED  f.J9 Continue counts no strays at all: roblox-oauth.ts -> red 3 (3 of 98)
RED  f.J10 Go back counts no strays at all: roblox-oauth.ts -> red 3 (3 of 98)
RED  f.J11 a foreign Origin spends the handle bucket again: roblox-oauth.ts -> red 3 (3 of 98)
RED  f.P1 dev handle cookie scoped to /redeem only: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.P2 dev handle cookie scoped to /create only: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.P3 dev handle cookie scoped to /decline only: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.P4 the clearing line has another path than the cookie (dev): roblox-oauth.ts -> red 1 (1 of 98)
RED  f.P5 production handle cookie narrowed to /redeem: roblox-oauth.ts -> red 5 (5 of 98)
RED  f.P6 dev state cookie scoped so the callback does not receive it: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.R1 a cross-origin refusal clears the handle cookie: roblox-oauth.ts -> red 1 (1 of 98)
RED  f.R2 a spent address allowance clears the handle cookie: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.R3 a missing secret on Continue clears the handle cookie: roblox-oauth.ts -> red 1 (1 of 98)
RED  f.R4 Continue on a ready sign-in deletes the held handle: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.R5 Go back on a ready sign-in deletes the held handle: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.R6 Continue on a ready sign-in clears the handle cookie: roblox-oauth.ts -> red 1 (1 of 98)
RED  f.R7 the per-handle allowance refusal clears the handle cookie: roblox-oauth.ts -> red 1 (1 of 98)
RED  f.L1 sign-in token logged on Continue: roblox-oauth.ts -> red 1 (1 of 98)
RED  f.L2 the Roblox token logged when Go back cannot revoke it: roblox-oauth.ts -> red 2 (2 of 98)
RED  f.W1 the confirm card for a Roblox session shows the email-account sentence: auth-pages.tsx -> red 1 (1 of 60)
RED  f.W2 the email-account card shows the Roblox sentence: auth-pages.tsx -> red 1 (1 of 60)
RED  f.J12 the callback junk bucket (no state in the URL) is unbounded: roblox-oauth.ts -> red 2 (2 of 98)
```

**The one survivor, `f.J6`,** makes the `strike()` half of the stray count unbounded (`limited(key, 1_000_000)`). It is not caught because
`spent()` is asked first and refuses the sixty-first request before anything is read, so `strike()` can only answer `true` for requests that
interleave in one isolate, after their read; the two are redundant in sequential use (section 7). It is old code and none of this pass's
tests is aimed at it. The first run of the harness also showed that its `--test-name-pattern` flag must come before the file name (after it, Node
treats it as a file), which is why `f.L1` is run with the pattern in front.

**Measured, besides the mutations.** (1) The new worker file run against the sources as they were at the start of the pass (`89f45997`):
98 tests, 93 pass, 5 fail: the part-failed erasure test, the junk-flood test, the create/decline strays test, the path-match test and the
restated dev-origin test. The two tests that pin behaviour that was already right (a refused handle route, the log test) pass there;
`f.R1` to `f.R7` and `f.L1` and `f.L2` show them. (2) The defect of item 1 itself: the new erasure test with its three assertions on the kept step
taken out, run against the old `erasure.ts`, fails at the retry with `403 !== 200`. (3) The old log test (the commit before this pass), filtered to
that one test, with the sign-in token logged on Continue (`f.L1`): green, 0 of 1, because it never pressed Continue; the new one is red, 1 of 1.

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

## 11. The second independent review, and what it changed (2026-10-05, "cycle 2")

Six items, each with tests that failed before the fix or fail when the fix is undone (9c). Where "before" is quoted it is measured.

1. **The flow cookies could be planted (security).** The state cookie (`rbx_oauth_state`) and the handle cookie (`rbx_oauth_handle`)
   had ordinary names, so a cookie set over plain http before HSTS is known, or by a sibling subdomain, could plant a state or a
   handle and reopen login CSRF (the victim signs in as the attacker). Now, on https, they are `__Host-rbx_oauth_state` and
   `__Host-rbx_oauth_handle` with `Secure`, `Path=/`, no `Domain`, `HttpOnly`, `SameSite=Lax`, on set and on clear, and only the
   prefixed name is read: a request carrying just the bare name is refused (the callback answers 400 and burns the state; redeem
   answers 400 and spends nothing). The plain names survive only on the registered `http://localhost:5173` dev origin. Why `__Host-`
   for both and not `__Secure-` for the path-scoped handle: a sibling subdomain can set a `__Secure-` cookie with
   `Domain=studpilot.app`, so it would not stop the attack the finding names; the price is `Path=/` (section 2). Tests: the state
   and handle cookie tests assert every required attribute on set and on clear; `COOKIE PLANTING` offers the bare name alone, the
   bare name beside a wrong prefixed one, and a planted bare cookie beside the real one; the dev-origin test completes a whole flow
   with bare names. Mutations `c2.K01` to `c2.K15`.
2. **A school lab was locked out (breaks users).** Start, callback and redeem shared one bucket of 20 a minute per address, three
   requests per sign-in, so the seventh sign-in from one address was refused, and a refusal on redeem failed a sign-in the person had
   already consented to at Roblox. Now: start 60 a minute per address; callback and redeem keyed by their own single-use state or
   handle (5 a minute), never by the address; a stray bucket (60 a minute per address) for requests with no usable state or handle and
   for well-formed values nobody holds, so fresh random values cannot be used to hammer KV; a request from another origin never spends
   a handle's bucket (section 2). Tests: 20 sign-ins from one address in a minute, each step answered; 60 flows started (the 61st start
   is the one refused) and every one of them still completes its callback and redeem; a replayed state or handle is a 400 and then a 429
   with no second exchange; strays are limited per address and a real flow from that address is untouched. Mutations `c2.L01` to
   `c2.L13`, `c2.S01` to `c2.S05`.
3. **A Roblox-only account could not use Settings (breaks users).** It has no password, but export, delete, change email, change
   password, sign out everywhere and remove two-step all asked for one. Now `ReauthDialog` asks such an account to sign in with Roblox
   again (a link to `/auth/roblox/start?return=/settings`); **superseded in cycle 3 (section 12): the link is now a re-authentication that
   carries the action, and the proof is the worker's own record, not the new session's `last_sign_in_at`.** The account is recognised by `app_metadata.roblox_sub`, which only the Auth admin API can write: not by the
   shape of its address (an email account whose address merely looks like the placeholder still gets the password box), and not by
   `user_metadata`, which a person can write. The landing page words a Roblox account that is already signed in as a confirmation
   ("Continue with Roblox" / "Cancel"). Tests: the dialog for every gated action; the unchanged password dialog; the gate's window;
   in the worker harness a Roblox-only account (bearer carrying only the placeholder address) exports its data and deletes it with no
   password step, the Roblox grant is revoked by the erasure, and the same Roblox account then signs back in to the same user.
   Mutations `c2.W25` to `c2.W27`, `c2.W34` to `c2.W40`, `c2.E01`, `c2.E02`. Not done in cycle 2 (done in cycle 3): resuming the action after
   the round trip. `c2.E01` and `c2.E02` were restated in cycle 3: export and delete now need the re-authentication first.
4. **The Connections card told people to do something impossible (breaks users).** "Change your email address and set a password"
   cannot work while the address is a placeholder that Supabase's secure email change would need a confirmation from. The card now says
   that Roblox is how the account signs in, that it cannot be disconnected and why (no email address or password, so no way back in),
   and how to withdraw StudPilot's access (Connected apps in Roblox, or delete the StudPilot account). It offers no Disconnect button
   in that state. The placeholder address is never shown as an account's address: the shell's account line and Settings use the Roblox
   username (`Roblox: <username>`, `Signed in with Roblox as <username>`, or "Roblox account" until the name is known), and Settings
   shows no email or password form for such an account. Tests: the card rendered with and without another way in; the identity rules; a
   syntax-tree check that no screen prints an address straight from the session and that both rows branch on the account kind.
   Mutations `c2.W21` to `c2.W24`, `c2.W28` to `c2.W33`.
5. **The tests.**
   - The landing page itself is run. `RobloxCallbackPage` hands its hook `currentAccount`, `redeem`, `verifyOtp`, an
     account-switched cleanup and a `navigate` callback, and its view `onSwitch` and `onStay`. `tests/page-harness.mjs` bundles the page
     with `react` replaced by the hook stand-in, `react-router-dom` by a recorder, the Supabase client by a controllable stand-in, and
     every other module the page imports by an inert stand-in (the logic under test stays real); calling the component returns the
     element tree, and the test reads and calls the view's props. A redeem that reads `window.location.hash`, a `currentAccount` that
     answers null (a silent replacement), a landing that skips the choice, and a mis-wired `onSwitch`, `onStay`, `navigate` or `verifyOtp`
     each fail (`c2.W01` to `c2.W11`). It does not render children, reconcile, or run a hook the stand-in lacks.
   - The minted link must belong to the linked user (`link.userId === userId`): a test makes Auth mint it for another user (`c2.T01`).
     An address held by a user with a DIFFERENT `roblox_sub` is refused, not adopted (`c2.T02`).
   - Every test in the worker file now fails on any call the Roblox or Supabase mock does not know, and on the Supabase secret key being
     sent anywhere but `/auth/v1/admin/...`, in every scenario, not only the first sign-in (the worker swallows a failed outbound call, so
     the mock records it and the wrapper around `test` checks at the end). `c2.T09` adds a table query with the secret key to the callback
     and 62 of the 77 tests go red.
   - The route-level catch handlers are reached with a store that throws an error whose message carries a URL with a code: each answers
     the one generic page (JSON for redeem), clears its cookie with its attributes, and logs only `unexpected failure`
     (`c2.T03` to `c2.T08d`).
   - The tautology in the log test (`assert.ok(boom.res.status >= 200)`, true of every response) is replaced by the status and stage it was
     meant to check (a storage failure answers 502 and logs `storage`).
   - The "outside both guards" route test read the tags that enclose the route, but a guard is written in a Route's `element`, so a route
     moved inside the guarded layout Route was not seen. It now reads the `element` of every ancestor Route and has positive controls
     (`/settings` is found guarded by `AuthGuard`, `/login` by `GuestGuard`, `/confirm` by neither): `c2.W41` to `c2.W43`.
6. **Minor, done.** When the landing page replaces one account's session with another account's, the previous account's drafts, recent
   searches and view state are cleared (the same three families the sign-out handler clears; the same account confirming itself keeps its
   own): a session replaced by `verifyOtp` sends SIGNED_IN, not SIGNED_OUT, so the existing handler never ran (`c2.W12` to `c2.W20`).
   The per-isolate access-token cache is bound to the row's version and to a generation (a random label made at every sign-in and kept by
   every refresh), and so are the refresh lease and the compare-and-swap: a token issued under a revoked grant is no longer served after a
   disconnect and two sign-ins that bring the row back to the same version number (`c2.G01` to `c2.G05`). The `roblox_oauth_tokens`
   table gained a `generation` column in its create statement; nothing is deployed, so no existing table needs migrating, and the account
   export names the column as withheld bookkeeping.

**Not fixed, or not verifiable here, and why.** Everything in the second half of section 7 added in cycle 2, and sections 6.6 to 6.9. In
short: nothing was run against Roblox, Supabase or a browser (the rules of this work); a Roblox-only account cannot change its email or set
a password (an owner decision about Supabase); (re-authentication did not resume the action: fixed in cycle 3); its strength is that of the person's Roblox
session (cycle 3 asks Roblox for a fresh login, which is unconfirmed: section 6, item 8); the Settings page is checked by its syntax tree and its pieces, not rendered whole; the export file records the placeholder
address as stored.

## 12. The third independent review, and what it changed (2026-10-05, "cycle 3", the last)

Five items, each with tests that failed before the fix or fail when the fix is undone (9d). Where a number is quoted it is measured.

1. **A re-authentication proved nothing while roblox.com was still signed in (security).** The authorize request had no `prompt` or
   `max_age`, so for a person who was already signed in to Roblox in that browser, Roblox bounced straight back, and whoever sat at an
   unlocked screen "confirmed it was them" by clicking. And the gate trusted the new session's `last_sign_in_at`, which every sign-in
   sets, ordinary or not. Now:
   - a re-authentication is a flow of its own: `/auth/roblox/start?reauth=<action>` stores `purpose: "reauth"` with the state (an
     action id is lower-case words and hyphens; anything else is an ordinary sign-in), and adds `prompt=login` and `max_age=0` to the
     authorize request. **Whether Roblox honours them is not confirmed from anything saved in this repository; see section 6, item 8,
     which marks them "to verify live". They are not claimed as documented.** What the repository's own saved Roblox notes
     (`planning/roblox-oauth-setup.md`, "Endpoints") do name is the discovery document, `https://apis.roblox.com/oauth/.well-known/openid-configuration`,
     and the five endpoints; they list no authorize parameters, and nothing could be fetched in this work;
   - the callback of a re-authentication never makes an account (403, and the authorization it was given is revoked), and on success
     writes `roblox_identities.reauth_at`, by the worker's clock, as its last step. An ordinary sign-in writes nothing;
   - that record, and nothing else, is what a Roblox-only account's gate reads: `GET /api/me/export` and `POST /api/me/delete`
     refuse it with 403 `reauth_required` until it is fresh (ten minutes, the web's `REAUTH_WINDOW_MS`, held equal by a test), and
     `GET /api/me/roblox/connection` answers `reauthFresh` for the SPA's gate. Settings asks that, on every gated action, for a
     Roblox-only account (`app_metadata.roblox_sub`, as the dialog does) and never consults `last_sign_in_at`.

   Tests: the authorize request with and without the parameters, for every action in the web's own `SENSITIVE_ACTIONS` and for eleven
   things that are not an action id; the stamp written by a re-authentication and by nothing else, by the server's clock, for exactly
   the window (to the millisecond) and with five seconds of tolerance for a stamp a little ahead; another Roblox account's
   re-authentication opening nothing; a start that is never finished confirming nothing; a re-authentication that cannot finish its
   sign-in leaving no stamp; a state stored before purposes existed being an ordinary sign-in; export and delete refused, then
   allowed, then refused again when the stamp is ten minutes and a second old; an email account asked nothing. Mutations `c3.A01` to `c3.A09`,
   `c3.B01` to `c3.B17`, `c3.C01` to `c3.C04`, `c3.C06`, `c3.H01`.
2. **A device clock that was off looped a Roblox-only account (breaks users).** `needsReauth` compared the server's `last_sign_in_at` with
   the device's `Date.now()`: a device 30 seconds behind (the stamp is "in the future") or ten minutes ahead (it is "too old") was
   asked again after every confirmation, for ever. Now (a) the decision for a Roblox-only account is the server's answer in the
   server's own time, so no clock of the device's takes part, and (b) the round trip carries the action: the browser comes back to
   `/settings?resume=<action>` and Settings carries the action on by itself, once (the parameter is taken out of the address, so a
   reload does not repeat it; a link that names an action opens nothing, because the gate is still asked; only a real gated action is
   accepted; nothing is resumed for an account with a password). Tests execute `SettingsPage` (below) with the device clock 31 seconds
   behind, an hour behind, 11 minutes ahead and a day ahead, for every gated action: with a confirmation on record the action goes
   ahead, without one it asks, once; and the resume under three clocks. A password account is gated exactly as before, by its sign-in
   time against the device clock, and a test shows the server is never asked for it. Mutations `c3.W01` to `c3.W16`.
3. **"Continue with Roblox" silently made a second, empty account (breaks users).** Somebody with an email account who pressed it under
   the password form was given a brand-new account with none of their projects (and a second free allowance), and believed their work
   was gone. Now the callback makes nothing for a Roblox account nobody here has seen: it holds it (section 2) and the page asks, in the
   words "This creates a new StudPilot account. Already have one? Sign in with your email instead.", naming the Roblox account, with
   Continue and Go back. Only Continue (`POST /auth/roblox/create`) makes the user, and Go back (`POST /auth/roblox/decline`) deletes
   what was held and revokes the Roblox authorization. Tests: the callback creates no Supabase user, no D1 row and no token row, and
   makes no Supabase call at all; what is held is sealed and is not a sign-in; asking repeatedly spends nothing; Continue makes exactly
   one user and the held token is the one stored; Go back makes nothing, deletes the record and revokes at Roblox (and is logged when
   Roblox cannot be reached); a returning account is never asked; Continue and Go back are same-origin POSTs that burn nothing when
   refused and do nothing for a sign-in that is not a waiting first sight; a failed Continue burns nothing and can be pressed again;
   the handle's bucket covers all three routes; two callbacks and two presses at once still make one user. In the browser half: the
   card in its exact words, the redeem answer read as a question, the calls Continue and Go back make (same-origin POSTs, no body),
   and the landing PAGE run end to end: asked, then create, then redeem, then trade; Go back declines, leaves for `/login` and trades
   nothing; a failure shows the worker's reference; somebody already signed in is asked twice, in order. Mutations `c3.D01` to
   `c3.D29`, `c3.N01` to `c3.N30`.
4. **The stray allowance came after the read it was meant to protect.** `callback` and `redeem` read KV, and only then counted a
   state or handle nobody held, so fresh random values cost a read each, however many. Now the address's allowance is asked first
   (`ipSpent`, the read-only twin of `ipLimited`, in `index.ts`): an address that has used its sixty gets 429 with no KV read at
   all, and nothing of a real flow from it is read, burned or cleared. The test counts the reads: twenty requests of every kind
   (callback, redeem, create, decline, fresh random values) over budget make zero, a flow from that address is refused and its state is
   still in KV, and a minute later the same state finishes the flow. Ten real sign-ins from the address before the strays leave the
   allowance whole. **The price is stated in section 2:** a flood from one address also refuses that address's real flows until
   the minute is out. The two earlier tests that said a real flow from that address "is untouched" were restated, because the contract
   changed on purpose. Mutations `c3.E01` to `c3.E10`, `c3.S01`, `c3.S02`, `c3.S05` and `c3.S06` (the strays), `c3.L01` to `c3.L13` (the limits).
5. **The tests.**
   - *Settings' Roblox-only branching is executed.* `SettingsPage` is called for real (`tests/page-harness.mjs`, extended: a stand-in
     for the query layer that records every query and answers it, `fakes` that replace a module for every importer, and `expose` for an
     export the app does not make) and the element tree it returns is read: the control of the email and password rows is `null` for a
     Roblox-only account and a form for everyone else, the notes and the identity line say what they should, and the Roblox username
     is asked for only by the account that has one. Inverting or disabling `identity.roblox`, either row, either note, the username
     hook or the identity it feeds each fail (`c3.W17` to `c3.W25`).
   - *`/auth/roblox/status` is pinned:* a hundred calls from one address are all served, the 121st is not, thirty other addresses
     are never refused, and it is its own bucket (`c3.F01` to `c3.F04`).
   - *The generation guard on the refresh lease is pinned with the two probe scenarios.* Claim: the row is replaced between the read
     and the claim by another grant at the same version, which must not be claimed and must not cost a Roblox call. Release: Roblox
     refuses, and the row has meanwhile become another grant that holds a lease of its own, which must be left alone (`c3.G01`,
     `c3.G02`, `c3.G04`). `release`'s `version` term is redundant with its `generation` term (a sign-in always makes a new
     generation, and a refresh keeps it), so no test can tell them apart; it is left as it was.
   - *`useRobloxUsername` and its call sites run:* the hook (key, `enabled`, the function it asks, what it returns for a Roblox-only
     account, an email account, nobody and an account with no id), the Settings page (above) and the shell's account line, run with
     its own `Shell` exposed (`c3.U01` to `c3.U10`).
   - *A near-miss negative control for `isPlaceholderAddress`:* eleven addresses that resemble the `.invalid` ending without being it
     (`me@example.invalid.com`, `me@exampleinvalid`, `invalid@example.com`, and so on), against four that are (`c3.P01` to `c3.P05`).
   - *The assertion on `EXISTING_ROBLOX_SESSION_LINE` was dropped here, and restored in the final pass (section 13, item 4).* The
     argument for dropping it was that the card is made of that constant; the card chooses between it and the email-account sentence, and
     only an assertion on the sentence notices the choice swapped (`f.W1`, `f.W2`).

**Not fixed, or not verifiable here, and why.**
- **Whether Roblox honours `prompt=login` and `max_age=0` is not known** (section 6, item 8). If it does not, a re-authentication is
  still only as strong as the person's Roblox session. Nothing here checks the id token's `auth_time`, because whether Roblox sends one
  is not known either.
- Nothing was run against Roblox, Supabase or a browser (the rules of this work). The first-sight card, the re-authentication round
  trip and the resume are executed against stand-ins, and the first live run is the first time they are seen together.
- Only the two gated actions that are worker routes (export and delete) are enforced on the server. The others (sign out everywhere, reset
  settings, remove two-step, change email and password) are Supabase calls or per-user preference writes the worker never sees, so their
  gate stays in the SPA, now on the server's answer; a client that skips the SPA is not stopped from them by this work.
- A password account is still gated by `last_sign_in_at` against the device clock (`needsReauth`). It does not loop: after the password
  is accepted the action runs at once and is not re-evaluated; only a SECOND gated action within ten minutes, on a device whose clock is
  off, asks again. The finding was the Roblox-only loop.
- On return from a re-authentication the landing page still shows "Confirm it is you?" with Continue and Cancel, because a session
  exists in that browser (cycle 2): one more click after Roblox's own login. Skipping it would need the redeem answer before the choice,
  and the choice exists to keep the handle unspent.
- The first-sight hold is five minutes (the handle's life): a person who takes longer finds the sign-in gone and starts again.
- The pending record is read by redeem, create and decline across requests; KV is eventually consistent (section 7), so a Continue
  that reaches another location within seconds of the question may find nothing and show the failure card. The person starts again.

## 13. The final narrow pass, and what it changed (2026-10-05)

Four items, narrow on purpose. Each has tests that fail when the fix is undone (9e); where a number is quoted it is measured.

1. **A deletion that part-failed could not be run again by a Roblox-only account (breaks users).** `POST /api/me/delete` lets such an
   account through only inside ten minutes of a Roblox re-authentication, and that proof is `roblox_identities.reauth_at`.
   `eraseAccountData` swept the whole `roblox_identities` row before the Postgres steps, so when one of them failed the route answered 207
   "run it again", and the retry found no row and answered 403 `reauth_required`, which no re-authentication could satisfy either (it needs
   the row too: it never makes an account). Now the link is the last thing swept, and only when every other step succeeded. While any step
   has failed it stays, and the receipt carries a `failed` step for it that says why and to run the deletion again, so the receipt does not
   claim a sweep that was not done; the run that completes the rest removes it. An account with no link is not told about one (an
   email account's receipt is unchanged), a lookup of the link that throws (even synchronously) keeps the link and still returns the
   receipt, and a sweep of the link that itself fails is a `failed` step that the next run finishes. Tests: a Postgres step fails on the
   first run (207), the same account's retry inside the window answers 200 and removes the link; a retry after the window is asked to
   confirm (403) and CAN, because the link survived, then succeeds; the failing link sweep and the unreadable link above; an account
   with no link. Measured: against the old `erasure.ts` the retry answers `403 !== 200`. Mutations `f.E1` to `f.E6`.
2. **A page on another site could refuse the person's own sign-in for a minute (breaks users).** Sixty cross-site POSTs to
   `/auth/roblox/redeem` (no cookie, a foreign Origin), or sixty `<img>` loads of the callback, spent the per-address stray allowance that
   the person's own real redeem, create, decline or callback at that address also consult, so each of those was answered 429. Each kind now
   has two buckets per address, `stray` and `junk`, 60 a minute each (section 2): `junk` takes a request with no usable cookie of the right
   name (absent, malformed, only the bare name production never reads) or a foreign Origin, `stray` takes only one that carries a
   well-formed cookie of the right name. The real flow never reads or writes `junk`, and `junk` is bounded and costs no KV read once spent.
   Tests: nine shapes of junk (cross-site POSTs to redeem, create and decline; no Origin; a foreign Origin with a well-formed cookie, which
   is what a sibling subdomain sends; the bare cookie name; three `<img>` shapes for the callback), sixty each from the address, each
   answered and not refused, the sixty-first and sixty-second refused without a KV read, and then the same address's own callback (a flow
   already at Roblox), redeem, Continue, the redeem after it, and Go back, all served. Mutations `f.J1` to `f.J5`, `f.J11`, `f.J12`.
3. **On the dev origin the handle cookie never reached Continue or Go back (breaks developers).** It was `Path=/auth/roblox/redeem`, so the
   browser sent it to redeem only; create and decline answered 400 for want of a cookie. It is `Path=/auth/roblox/` now, on set and on clear
   (a clearing line must carry the same path or the browser keeps the cookie). Production is unchanged: `Path=/` is what `__Host-` demands.
   The test implements RFC 6265 section 5.1.4 (checked first against eight cases whose answers are known), and drives the whole dev first
   sight, and a Go back, through a cookie jar that sends the cookie to a route only when that rule says a browser would: redeem asks, Continue
   is answered, redeem hands over the sign-in, Go back is answered; and the same path match for the three routes in production, for the state
   cookie at the callback in both, and for the clearing lines. The dev path must not match `/api/me/export`, `/app/auth/roblox` or `/`.
   Mutations `f.P1` to `f.P6`.
4. **Tests that were weaker than their names.**
   - *The log test now runs a real sign-in through Continue*: the callback holds the first sight, the person is asked, Continue makes the
     account and mints the sign-in token, the token is redeemed, and every value on the way (state, code, verifier, handle, refresh token,
     sealed refresh token, every access token, every sign-in token Auth made, the redeemed token hash) must be absent from every log line. It
     also reaches the two new routes' own log lines (`decline revoke`, `account link`). Measured: with the sign-in token logged on Continue
     the old log test stayed green (it never pressed Continue) and the new one is red (`f.L1`, `f.L2`).
   - *Stray counting at `/create` and `/decline` is pinned.* Sixty strays through either route are answered and cost one read each;
     then all three handle routes are refused with no read (it is one bucket for the three); the callback's stray bucket and the junk bucket
     are untouched; the person's own redeem is refused too, with no cookie cleared and the held record kept, and a minute later it is
     served. `f.J7` to `f.J10`.
   - *A refused handle route touches nothing of the person's.* For redeem, create and decline, and for each refusal (another origin, no
     Origin, a missing secret, the handle's own allowance spent, the address's stray allowance spent, and Continue or Go back on a sign-in that is
     not a waiting first sight): no `Set-Cookie` line at all, so the handle cookie stays in the person's browser; the held record is byte for byte
     as it was; nothing was made; and a minute later the person's own redeem still answers with what was held. `f.R1` to `f.R7`.
   - *The confirm card for a signed-in Roblox account is asserted to show `EXISTING_ROBLOX_SESSION_LINE` again,* with its converse (the
     email-account choice card does not). `f.W1`, `f.W2`.

**Not fixed, or not verifiable here, and why.**
- **`/auth/roblox/start` still has one bucket per address (60 a minute)** shared by real and junk starts (section 7). A start carries no
  cookie, so nothing separates them; a refused start costs a retry and nothing spent at Roblox. Telling them apart would need a header
  such as `Sec-Fetch-Site`, which the brief did not ask for.
- **A request that carries a well-formed cookie of the right name and, for the handle routes, this site's own Origin can still spend the
  `stray` bucket** (section 7): that is somebody inside the lab, not a page on another site.
- **`f.J6` survived** (9e): `strike()` and `spent()` are redundant in sequential use, and the difference only shows for interleaved requests.
- **A `failed` step for a link that was kept on purpose** counts in the receipt's `complete: false` and its summary line ("N of M stores
  could not be cleared: ..., roblox_identities"), which is true, and the same text as any other failure. A person who reads "Ask support
  to finish the rest" is told to run the deletion again by the step's own detail; the summary sentence is old text and was not reworded.
- Nothing was run against Roblox, Supabase or a browser (the rules of this work). The cookie path match is the RFC's rule executed in a
  test, not a browser, and the dev origin is still unreachable end to end (section 7, "Local dev").
