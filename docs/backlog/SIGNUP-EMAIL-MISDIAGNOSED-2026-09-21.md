# The signup row's remedy is aimed at a flow that sends no mail — 2026-09-21

**Row:** `signup-verification-email`, state NOT-STARTED.
**Owner's words:** `אני לא מצליח להכנס בlogin/signup כי שליחת אימיין אימות מעולם לא מופיעה לי בinbox`
("I can't get in through login/signup because the verification email has never appeared in my inbox.")
**Recorded next action:** *"Configure a custom SMTP sender on the Supabase project (a free Resend or
Brevo domain sender clears the 2/hour ceiling), then have the owner run one real signup."*

That remedy is real work. It is aimed at the wrong flow.

## Measured, not inferred

Read from the live project `npqvyijsvzkuwddyhtpm` through the Supabase Management API with the
`SUPABASE_ACCESS_TOKEN` already in `.env` (`GET /v1/projects/{ref}/config/auth`, HTTP 200):

| setting | value |
|---|---|
| `mailer_autoconfirm` | **`true`** |
| `smtp_host` / `smtp_user` / `smtp_admin_email` | `null` — no custom sender |
| `rate_limit_email_sent` | `2` per hour |
| `disable_signup` | `false` |
| `security_captcha_enabled` | `false` |
| `password_min_length` | `6` |
| `site_url` | `https://apple.moshe-barami111.workers.dev/app` |

**`mailer_autoconfirm: true` means Supabase sends no signup confirmation email at all.** The account
is confirmed at creation and `signUp` returns a session immediately. There is no message in flight
to be delayed by the 2/hour ceiling, filtered into spam, or lost by a shared sender — because none is
generated.

The client agrees with that, correctly. `apps/web/src/lib/auth-flows.ts:152` —
`if (!error && result && result.session) return { kind: 'signed-in' };` — and
`apps/web/src/routes/auth-pages.tsx:673` navigates straight into the app on that outcome. The
"Check your email" card is only reached when no session comes back. So the code is not the thing
putting him in front of an empty inbox either.

## So what IS wrong — and what is not established

**Not established: why he cannot sign up.** I did not attempt a signup. Creating an account is
outside what this lane may do, and one real signup by a person with a browser is already on the
owner-blocked list. Anything past that point is unmeasured, and this note does not guess at it.

**Established: two real defects, neither of which is "the email was delayed".**

1. **The product ships a whole email-confirmation experience against a project that has confirmation
   switched off.** `CheckEmailCard`, a resend control, a `/confirm` route, the
   `'Confirm your email first — check your inbox for the link.'` string at `auth-flows.ts:100`, and
   twelve configured mailer templates including `mailer_subjects_confirmation`. All of it is
   unreachable while `mailer_autoconfirm` is `true`. This is the "one consistent production truth"
   problem living in the auth surface: whichever of the two is intended, the other is a lie, and
   a reader of the code would conclude confirmation is required.

   It also means **anyone can create an account on an address they do not own**, which is a
   different conversation from a missing email and a more expensive one.

2. **The SMTP gap is real, for the flows that actually send.** With `smtp_host: null` the project
   uses Supabase's shared sender, capped at `rate_limit_email_sent: 2` per hour and widely
   spam-filtered. **Password reset, magic link, email change and invite mail all go through it.** So
   if he ever asked for a password reset — the obvious thing to try when a signup seems not to
   work — that message is exactly the kind that vanishes. The recorded remedy fixes those flows.
   It just does not fix signup, because signup sends nothing.

## What to do next, in order

1. **Ask him which screen he is actually on** and what it says. "Login/signup" covers two flows and
   at least three failure screens; one sentence from him replaces all the guessing above. This is
   cheaper than any code change and nothing should be built before it.
2. **Decide `mailer_autoconfirm` deliberately and write the decision down.** On means no
   confirmation and unverified addresses; off means the existing UX becomes reachable and a custom
   SMTP sender becomes a hard prerequisite rather than an improvement. Do not flip it as a
   side effect of fixing something else — it is a production auth setting and changing it logs
   every existing user into a different reality.
3. **Then** configure the custom sender, because it is required either way for reset and invite mail.

**Not done here, deliberately:** no Supabase setting was changed. Configuration of a production
authentication project is an owner decision, and the account creation a Resend or Brevo sender needs
is on the prohibited list for this lane. The measurement above needed no new account and no write.
