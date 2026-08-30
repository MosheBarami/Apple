# Supabase Free Tier (2026) + Verifying Supabase Auth JWTs in a Cloudflare Worker

Research for **Golem** (AI SaaS that builds Roblox games; Cloudflare Workers + Workers AI + Supabase; ~$5/month target).
Researched 2026-08-30 against official Supabase docs and pricing pages. Anything not confirmed on an official page is marked **UNVERIFIED**.

---

## 1. Free tier — exact current numbers (supabase.com/pricing, fetched 2026-08-30)

| Resource | Free plan limit |
|---|---|
| Monthly Active Users (MAU) | **50,000** (no overage billing on Free — it is a hard quota) |
| Database size | **500 MB** (Shared CPU, 500 MB RAM "Nano" compute) |
| File storage | **1 GB** (max **50 MB** per file upload) |
| Egress | **5 GB** + **5 GB cached egress** |
| Edge Function invocations | **500,000 / month** |
| Realtime | **200** concurrent peak connections, **2,000,000** messages/month |
| Active projects | **2 active free projects** (paused projects do NOT count toward the limit) |
| Log retention | **1 day** API/database logs; **1 hour** auth audit log |
| Backups / PITR | Not included on Free |
| Custom SMTP | Allowed (config), but no email support/SLA; branching, SAML/SSO, advanced MFA not included |
| Support | Community only |

Pro plan for comparison: **$25/month** — 100,000 MAU (then $0.00325/MAU), 8 GB disk (then $0.125/GB), 100 GB storage, 250 GB egress (then $0.09/GB), 2M edge function invocations, 7-day backups/logs, **projects never pause**.

MAU counting: each unique user counts once per billing cycle when they perform an auth event (sign in, token refresh, sign out). Anonymous users count toward the same 50K MAU once they authenticate (they keep the same UUID across refreshes until they sign out).

---

## 2. Project PAUSING policy (critical for a production SaaS on Free)

Official page: https://supabase.com/docs/guides/platform/free-project-pausing

- Free projects are **paused after low activity over a 7-day period** ("Free projects are paused after 1 week of inactivity" on the pricing page).
- What counts as activity: **user database activity** — API calls to the project / requests from your connected application. The threshold is intentionally vague; docs say "a few user requests to the database each day over the previous week" typically prevents pausing. Dashboard visits alone are not reliable activity.
- **Warning email ~1 week before** the pause, plus a confirmation email once paused (sent to the project owner).
- Restore: one click ("Resume project") from the dashboard. **1-year window to restore**; after that you can only download backups/Storage objects and restore into a new project. Paused free projects are restored onto the latest minor Postgres version.
- Paid (Pro) projects **cannot be paused**.

### Mitigation for Golem
1. Cheapest reliable fix: a **Cloudflare Worker Cron Trigger** (free — cron triggers are included on the Workers free plan) that hits Supabase daily, e.g. a `select 1`-style read through PostgREST (`GET /rest/v1/<table>?select=id&limit=1` with the publishable/anon key) or an insert into a tiny `heartbeat` table. Any real DB query resets the 7-day timer. Community patterns confirm a scheduled ping (GitHub Actions / cron / uptime monitor) keeps the timer from reaching zero.
2. Real user traffic counts — once Golem has daily users, the DB queries their sessions generate are themselves the activity.
3. The only guaranteed fix is Pro ($25/mo), which breaks the $5/mo budget — so ship the cron ping from day one and keep the warning-email address monitored.
4. Note the knock-on risk: if the project ever pauses, **auth, DB, storage, and edge functions all go down** until manually resumed — there is no auto-resume on incoming traffic.

---

## 3. Auth emails WITHOUT custom SMTP (default built-in email service)

Official pages: https://supabase.com/docs/guides/auth/auth-smtp, https://supabase.com/docs/guides/auth/rate-limits

- Default (no custom SMTP) email limit: **2 emails per hour** (covers signup confirmations, magic links, password recovery, email change). Supabase says this "can change without notice."
- **Emails are only delivered to pre-authorized addresses — members of the project's team.** Random end-user signups will NOT receive confirmation emails on the default service.
- Explicitly "**not meant for production use**" — no delivery SLA.
- With **custom SMTP** configured: emails go to all addresses; an initial default rate limit of **30 emails per hour** applies and is adjustable in the dashboard (Auth → Rate Limits).

### Does email+password signup work without custom SMTP?
- **Yes, if you disable "Confirm email"** in Auth settings — users sign up and get a session immediately, no email is ever sent. This is the practical Free-tier path for Golem.
- **Effectively no, if email confirmation is on** — confirmation mail only reaches team-member addresses and is capped at 2/hour.
- Password reset ("forgot password") always needs email, so without custom SMTP it only works for team members. Plan to add custom SMTP before real users need resets. Free SMTP options that fit a $5 budget: Resend / Brevo / Mailtrap free tiers (**UNVERIFIED** current free quotas — check before wiring one up).

### Other auth rate limits (defaults, token-bucket, HTTP 429 on breach)
| Endpoint | Default limit |
|---|---|
| Emails (magic link / confirm / recovery) via built-in service | **2/hour** (project-wide) |
| Emails via custom SMTP | **30/hour** initially, configurable |
| OTP (sms/email OTP) | **30/hour** project-wide (configurable); **60 s** per-user cooldown between resends |
| Sign-up / sign-in confirmation | **60 s** per-user cooldown (configurable) |
| Password reset | **60 s** per-user cooldown (configurable) |
| Token refresh (`/token`) | **1,800/hour per IP** (bursts up to 30) — not configurable |
| Verification requests (`/verify`) | **360/hour per IP** (bursts up to 30) — not configurable |
| Anonymous sign-ins | **30/hour per IP** (bursts up to 30) — the anonymous sign-ins doc says this default can be modified in the dashboard |
| MFA challenges | **15/hour per IP** — not configurable |

---

## 4. Verifying Supabase Auth JWTs inside a Cloudflare Worker

Official pages: https://supabase.com/docs/guides/auth/signing-keys, https://supabase.com/docs/guides/auth/jwts, https://supabase.com/docs/guides/auth/jwt-fields

### Current best practice: asymmetric JWT signing keys + JWKS
- Supabase's **JWT signing keys** feature lets Auth sign access tokens with an asymmetric key instead of the legacy shared `HS256` secret:
  - **ES256 (NIST P-256)** — recommended default (short signatures, fast).
  - **RS256 (RSA 2048)** — widest library support, slower.
  - **EdDSA (Ed25519)** — listed as in development.
- Public keys are served at the JWKS endpoint:
  `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
  (cached by Supabase's edge for **10 minutes**).
- Migration from legacy HS256: dashboard → JWT signing keys → "Migrate JWT secret" (imports the legacy secret, creates an asymmetric standby key) → "Rotate keys" to make the asymmetric key current. Rotation states: **standby → current → previously used → revoked**; previously-used keys keep validating outstanding tokens until revoked.
- Consequence for the Worker: **never verify with the legacy shared secret; never call `/auth/v1/user` on every request.** Verify locally against JWKS — zero extra latency, zero Supabase load, works entirely inside the Worker.

### Worker implementation (jose — works on Workers, uses WebCrypto)
```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL(`https://${PROJECT_REF}.supabase.co/auth/v1/.well-known/jwks.json`)
)
// createRemoteJWKSet caches keys in isolate memory and re-fetches on unknown `kid`,
// which is exactly what key rotation needs.

export async function requireUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!token) throw new Response('unauthorized', { status: 401 })
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://${PROJECT_REF}.supabase.co/auth/v1`,
    audience: 'authenticated',
    algorithms: ['ES256', 'RS256'], // never allow HS256 fallback
  })
  return {
    userId: payload.sub as string,           // auth.users.id (UUID)
    role: payload.role as string,            // 'authenticated'
    isAnonymous: payload.is_anonymous === true,
  }
}
```
(The jose `createRemoteJWKSet` snippet is Supabase's own documented example for third-party verification. Supabase's alternative recommendation, `supabase.auth.getClaims()` from supabase-js, does the same JWKS verification for you.)

### JWT claims (access token)
Always present: `iss` (`https://<ref>.supabase.co/auth/v1`), `aud` (`"authenticated"` for user tokens, `"anon"` for the publishable/anon key token), `sub` (user UUID), `role` (`"authenticated"` / `"anon"` / `"service_role"`), `exp`, `iat`, `session_id`, `email`, `phone`, `is_anonymous` (boolean), `aal` (`"aal1"`/`"aal2"`). Optional: `app_metadata`, `user_metadata`, `amr`, `jti`, `nbf`, `ref`.
Authorization tip: put entitlements (e.g. Golem plan tier) in `app_metadata` (user-immutable), never in `user_metadata` (user-editable).

### Token lifetimes and SPA refresh flow
- **Access token (JWT): default 1 hour** expiry. Docs recommend keeping the default; below 5 minutes (especially <2 min) is discouraged (server load + clock skew).
- **Refresh tokens: single-use**, with a **10-second reuse interval** grace window; reuse outside the window (and outside the parent-token exception) triggers reuse detection and **revokes the whole session**.
- SPA flow: supabase-js with `autoRefreshToken: true` (default) refreshes the session ahead of expiry in the background; the web app just attaches `session.access_token` as `Authorization: Bearer <jwt>` on calls to the Worker. On 401 (expired between refreshes), call `supabase.auth.refreshSession()` / `getSession()` and retry once.
- Session timeboxing / inactivity timeout / single-session-per-user are **Pro plan+** features — not available on Free.
- For the **Studio plugin** (Roblox Studio can't run supabase-js): simplest pattern is a short-lived token handoff — user authenticates in the web app, plugin receives/polls for a session (or a one-time code exchanged at the Worker). The Worker verifies the same JWT either way. (Pattern, not an official Supabase doc — design choice.)

### Anonymous sign-in
- Available as a dashboard toggle (Auth → Providers → Anonymous); the docs gate it by configuration, **not by plan** — it works on Free. Rate limit **30/hour per IP** by default.
- Anonymous users get `role: "authenticated"` with `is_anonymous: true`, count toward the 50K MAU, and can be converted to permanent users via `updateUser()` (email+password) or `linkIdentity()` (OAuth).
- Good fit for Golem's "try before signup" flow, but write **restrictive RLS policies** on `is_anonymous` so anonymous users can't reach paid features.

---

## 5. RLS multi-tenant patterns + performance (official docs)

Source: https://supabase.com/docs/guides/database/postgres/row-level-security

1. **Always wrap `auth.uid()` in a sub-select** so Postgres runs it once per statement (initPlan) instead of once per row:
```sql
create policy "own rows" on public.projects
for select to authenticated
using ( (select auth.uid()) = user_id );
```
2. **Index every column referenced by a policy** — unindexed policy filters turn reads into sequential scans:
```sql
create index projects_user_id_idx on public.projects using btree (user_id);
```
3. **Always specify `to authenticated`** (or the exact role) so policies never even evaluate for `anon` requests.
4. **Use `security definer` functions in a private schema** for membership/team lookups, avoiding recursive policy evaluation:
```sql
create function private.user_project_ids()
returns setof uuid
language sql security definer
set search_path = ''
as $$ select project_id from public.project_members
      where user_id = (select auth.uid()) $$;

create policy "team access" on public.projects
for select to authenticated
using ( id in (select private.user_project_ids()) );
```
5. Golem tenancy model: every table carries `user_id uuid not null default auth.uid() references auth.users(id)`, RLS enabled on all public tables, policies per operation (select/insert/update/delete), and the Worker uses the **publishable (anon) key + the user's JWT** for user-scoped queries — reserve the secret/service-role key for admin jobs only (it bypasses RLS).
6. For anonymous users, add **restrictive** policies checking `(auth.jwt()->>'is_anonymous')::boolean is false` on anything gated to permanent accounts.

---

## 6. Golem-specific verdict

- Free tier fits an MVP: 50K MAU and 500K edge invocations are generous; the real ceilings are **500 MB database**, **5 GB egress**, and **the 7-day pause** — schedule a Cloudflare cron ping immediately.
- **Disable email confirmation** at launch (or ship custom SMTP) — the default mailer's 2/hour + team-members-only restriction makes confirmed email signup unusable for the public.
- Verify JWTs **in the Worker via JWKS (ES256)** with `jose`; do not proxy auth checks to Supabase per-request.
- Budget: Supabase $0 + Workers paid plan $5 ≈ the $5/month target holds until DB size or pause-risk forces Pro ($25/mo).

---

## Sources

- https://supabase.com/pricing — Free/Pro plan quotas (fetched 2026-08-30)
- https://supabase.com/docs/guides/platform/free-project-pausing — pausing rules, warning emails, 1-year restore window
- https://supabase.com/docs/guides/platform/upgrading — restore behavior, "Paid projects can't be paused"
- https://supabase.com/docs/guides/auth/rate-limits — email 2/hr, OTP 30/hr, token refresh 1800/hr/IP, anon 30/hr/IP, verify 360/hr/IP, MFA 15/hr
- https://supabase.com/docs/guides/auth/auth-smtp — default mailer restrictions, custom SMTP 30/hr initial limit
- https://supabase.com/docs/guides/auth/signing-keys — ES256/RS256/EdDSA, JWKS endpoint, 10-min edge cache, rotation states, migration from HS256
- https://supabase.com/docs/guides/auth/jwts — issuer format, jose verification example
- https://supabase.com/docs/guides/auth/jwt-fields — full claim list incl. aud/role/session_id/is_anonymous/aal
- https://supabase.com/docs/guides/auth/sessions — 1-hour access token default, refresh token single-use + 10 s reuse interval, Pro-only session controls
- https://supabase.com/docs/guides/auth/auth-anonymous — enablement, 30/hr IP limit, is_anonymous RLS, conversion to permanent
- https://supabase.com/docs/guides/database/postgres/row-level-security — (select auth.uid()) initPlan caching, indexing, TO authenticated, security definer pattern
- https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users — MAU counting, $0.00325/MAU overage (paid)
- https://github.com/orgs/supabase/discussions/35933 — anonymous users count toward MAU
- https://supabase.com/docs/guides/platform/billing-faq — 2 active free projects; paused projects don't count
- Community pause-prevention patterns: https://github.com/travisvn/supabase-pause-prevention, https://natt.sh/blog/2024-03-17-supabase-activity-scheduler
