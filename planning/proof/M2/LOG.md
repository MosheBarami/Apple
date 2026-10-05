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
