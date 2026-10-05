# M2 log (measured; newest last)

## 2026-10-05: Sign in with Roblox is live (PR #30, `294e9086`)

- **CI:** 7 of 7 checks green. The first run failed only "Scan full history for secrets", on three fabricated
  values in `apps/worker/tests/secret-redaction.test.mjs`: two negative cases in the tree, and one keyboard-pattern
  value from the test's first version, in history only. Each declared hash was matched to its value before
  recording. They were declared in `scripts/known-fixtures.json` (`1a3d5efc`); the five real exposures on the
  register were not touched.
- **Worker:** `node infra/deploy-worker.mjs studpilot` verified that `https://studpilot.app` serves `294e9086`
  (version `e08f5493`).
  - Before the secrets: `/auth/roblox/status` answered `{"configured":false}`, and `/auth/roblox/start` answered 503.
- **Secrets set** (names only; no value was printed or written to the repo):
  - `ROBLOX_OAUTH_CLIENT_ID` and `ROBLOX_OAUTH_CLIENT_SECRET`, from `.env`.
  - `CREDENTIAL_KEY`: new, 32 random bytes, with a copy in `.env`. The Worker had no `CREDENTIAL_KEY` before, so
    Open Cloud key storage had been refusing (`user-credentials.ts`, "no key, no storage"). `user_credentials` held
    0 rows, so no stored value is affected. Setting the key also switches that storage on.
  - `SUPABASE_SECRET_KEY`: a new, dedicated Supabase secret key named `studpilot_worker`, created through the
    Management API. The `default` secret key was not reused.
  - The Worker now holds 16 secret names.
- **Live checks after the secrets:**
  - `/api/health` `buildSha` is `294e9086`, and `/auth/roblox/status` answers `{"configured":true}`.
  - `curl -sI /auth/roblox/start` answers `HTTP/2 302`. The `location` is `https://apis.roblox.com/oauth/v1/authorize`,
    with:
    - `client_id=5523165872353873834`, `response_type=code`, `scope=openid profile`;
    - `code_challenge_method=S256`, a 43-character challenge and a 43-character state;
    - `redirect_uri=https://studpilot.app/auth/roblox/callback`.
  - The headers are `cache-control: no-store` and `referrer-policy: no-referrer`, and
    `set-cookie: __Host-rbx_oauth_state=…; Max-Age=600; Path=/; HttpOnly; SameSite=Lax; Secure`.
  - Roblox's authorize endpoint answers 302 to `www.roblox.com/login`, both for our redirect URI and for an
    unregistered one (`https://example.invalid/cb`). So whether the redirect is registered can't be seen without a
    signed-in Roblox session. That is owner step O2 in `BLOCKED.md`.
  - Roblox's discovery document (`apis.roblox.com/oauth/.well-known/openid-configuration`):
    - the endpoints are the ones the code uses (`v1/authorize`, `v1/token`, `v1/userinfo`, `v1/token/revoke`);
    - `token_endpoint_auth_methods_supported` is `client_secret_post` and `client_secret_basic`, and the code sends
      the secret in the form body;
    - `claims_supported` includes `preferred_username`, `nickname` and `name`;
    - it lists no `prompt_values_supported`, so `prompt=login` and `max_age=0` stay unconfirmed
      (ROBLOX-SIGNIN.md section 6, item 8).
- **Static:** the web app and site were built in the deploy clone. `node infra/deploy-static.mjs` uploaded 853 files
  and verified that every page serves the bytes just uploaded.
- **Spend** before this deploy: $3.92 for the month and 0 neurons today (`/api/admin/spend`). The deploy ran no model
  calls.

## 2026-10-05: privacy, terms and the data page are live (PR #31, `cd451a32`)

- **Review:** a three-lens review with two skeptics per finding. 11 of 19 findings survived, plus 15 minor items.
  Fix cycle 1 closed 27 of the 32 items and left 5 partly done (the checkers' counts: 15 fixed and 2 partial, 12
  fixed and 3 partial). A checker of cycle 1 found 6 more, all closed in fix cycle 2.
- **CI:** 7 of 7 checks green on the first run.
- **Worker:** `node infra/deploy-worker.mjs studpilot` verified `https://studpilot.app` serves `cd451a32`.
- **Static:** site and app built, 853 files uploaded and verified.
- **Live:** `/privacy` shows "Updated: October 2026", and `/auth/roblox/status` still answers `{"configured":true}`.
- **Open** (`LEGAL-CLAIMS.md`, section 8):
  - a reading-level target, for the owner;
  - Discord unlink on deletion and the analytics opt-out on run events, both in M6;
  - the Analytics Engine retention figure, which still needs confirming;
  - the in-app policy notice, which has to exist before the training gate may open;
  - the owner's legal read (BLOCKED N7).

## 2026-10-05: the design system is live (PR #32, `b306a33e`)

- **Review:** one implementation pass, a two-lens review with two skeptics per finding, then three fix cycles, each
  checked. Cycle 3 closed the sign-in button's hover and press label (1.96:1 → 9.25:1 hover, 4.99:1 press, dark),
  the roadmap node focus ring (clipped, and dimmed to 1.18:1 → 3.65:1 at worst), and selection on accent fills
  (2.77:1 → 6.54:1).
- **On the rebased tree before the PR** (run by me):
  - design 165/165, web 2537/2537, site 381/381;
  - root 643/661 (the 2 known check-pixels cases);
  - brand check OK; landing budget markup + CSS 17,481 / 20,000 B gzip; check-offer coherent; old names CLEAN.
- **CI:** 7 of 7 green.
- **Deploys:** the Worker verified `b306a33e` on studpilot.app; static uploaded and verified.
- **Residuals** (DESIGN-SYSTEM.md, section 12): `gx-chip` hovered in light at 4.41:1; pixel-read rings cover the map
  nodes only; the owner dashboards hand-copy the accent.
- **Process:** the cycle-3 agent ran `git checkout --` on one file in its own scratch clone (the rule forbids it in the
  shared checkout only), and it wrote one draft into `/tmp/_x` and then removed it.

## 2026-10-05: owner update applied (OWNER-DECISIONS D-10 to D-16)
- **O2 (Sign in with Roblox):** the owner reports that it works. Read-only checks on the live store, counts only:
  - `roblox_identities` holds 1 row and `roblox_oauth_tokens` holds 1 row, at version 1 with a generation set;
  - no stored token looks like plain text (0 rows match `RBX-%` or `%refresh%`);
  - `reauth_at` is null in every row (no re-authentication has run yet).
  - The second sign-in and Disconnect need the owner's browser, and stay unobserved.
- **N2 (Google and Discord):** not done. `.env` had no Google lines and no Discord OAuth secret (names checked, no values
  read), and Supabase shows both providers off, with no client id or secret. Back in BLOCKED.md with the exact names.
- **AI Gateway retention (D-14):**
  - Logs older than 30 days were deleted from the old `golem` gateway with the logs API (filter
    `created_at < 2026-09-05T14:22:49Z`; 920 matched). The oldest log is now 2026-09-05T16:52Z; the API's counts stay
    stale for a while.
  - The new `studpilot` gateway's oldest log is from 2026-10-04.
  - The daily deletion needs a narrow token on the Worker (BLOCKED N4) before 2026-11-03.
- **Email Routing (D-13):** the API token cannot manage Email Routing or DNS (10000), so this is BLOCKED E1, with
  dashboard steps.
- **Studio computer access:** Studio was not running, and the request could not find the app. It will be asked again when
  M3 needs it.
- **X6 trademark:** `planning/proof/M7/trademark.md`.
- **BLOCKED.md:** rewritten to the owner's list (X4, X5, N5, X7, X8, X9, N4), plus N9 (the named operator), E1 (email
  routing) and N2 (the missing lines).
- **Next:** one code lane for D-13 and D-14:
  - the operator rename;
  - automatic removal of the sign-in identity and the Discord link on deletion;
  - the 30-day log deletion cron;
  - Roblox-derived data deleted on loss of access;
  - the 6-bullet short version.

## 2026-10-05: Cloudflare access through OAuth, and support@ forwarding is live
- At 17:27 the owner replaced `CLOUDFLARE_API_TOKEN` in `.env`. Cloudflare rejects the new value (code 1000 on both
  verify endpoints, 9109 from `wrangler whoami`).
- At the owner's request, Claude Code ran `wrangler login` asking for every scope Wrangler offers (29). The owner
  approved it.
  - `whoami` lists 28 granted scopes, without email routing, yet the Email Routing API answers OK.
  - Reached: Workers, D1, R2, KV, Vectorize, Queues, Turnstile, Email Routing and zone read.
  - Not reached: AI Gateway, DNS and API tokens (Wrangler offers no scope for them).
  - Deploys run with `CLOUDFLARE_API_TOKEN` unset, so Wrangler uses the OAuth login; `.env` is left as the owner
    wrote it. `wrangler deployments list` and `wrangler secret list` (16 names) work that way.
- **Email Routing (D-13, E1):**
  - Switched on for studpilot.app; status `ready`.
  - The destination is the owner's Gmail, which Cloudflare reported as already verified.
  - The rule "support to owner" forwards `support@studpilot.app` there.
  - Public DNS (1.1.1.1): `route1`/`route2`/`route3.mx.cloudflare.net` and `v=spf1 include:_spf.mx.cloudflare.net ~all`;
    DKIM is still propagating.
  - Not yet observed: a test message actually arriving.
- **BLOCKED.md:** C1 and E1 removed. N4 stays, because the OAuth login cannot reach AI Gateway.
