# Customer review — 2026-09-18, round 31

## Scope and method

I used one fresh temporary Chrome tab (`1045984484`) against the deployed Apple site
([https://apple.moshe-barami111.workers.dev/](https://apple.moshe-barami111.workers.dev/)). This
was a bounded, read-only pass focused on signup/sign-in recovery clarity: empty validation,
disabled controls, escape/back links, and public help. The Chrome profile already had a complete
session: the public **Sign in** and **Create an account** links redirected to `/app`, so I did not
log out or submit credentials just to force an anonymous form.

I did not create an account, request or complete a reset, enter real credentials, send a prompt,
generate, pay, pair Studio, upload, publish, or change account data. I used only the inert dummy
address `test@example.invalid` to verify recovery-button gating and did not submit it. The
temporary tab was closed after the review.

## New finding

### P2 — `/app/reset` treats an ordinary signed-in session as a password-reset session

**Repro:** With the existing signed-in browser session, open
[`/app/reset`](https://apple.moshe-barami111.workers.dev/app/reset) directly, with no recovery
token in the URL.

**Observed:** The page presents **“Choose a new password”**, two empty fields (**New password**
and **New password again**), and a **Set the new password** action. The action starts disabled while
the fields are empty, but the page does not say that a reset link is required and has no **Back to
sign in**, cancel, or other escape link. This is the ordinary authenticated profile that had just
redirected `/app/login` to `/app`; no reset link was opened.

**Impact:** A signed-in customer who follows a stale bookmark, mistypes a route, or reaches `/reset`
after a broken/missing link is shown a password-changing surface rather than “Nothing to reset.”
The form does not change anything by itself, but it makes an unrelated account session look like a
valid recovery flow and offers no obvious way back. A customer can enter two new passwords and click
the action without ever having requested a reset link.

**Suggested fix:** Require both a valid recovery link/session and the authenticated session before
rendering the change form. If there is no recovery link, render the existing **Nothing to reset**
state with **Send me a link** and **Back to sign in** (and keep an explicit cancel/back link on the
form). Verify the ordinary signed-in, anonymous, expired-link, and valid-link cases separately.

## What passed in this pass

- `/app/recovery` is reachable without an anonymous session. With both fields empty, **Ask for
  help** is visibly disabled and **Back to sign in** is present. Entering only the inert dummy email
  enabled the help action without submitting it; the note is optional in the rendered form.
- The recovery page points first to a password reset and then to a human-help form, which is a
  sensible order for a person who has lost access to email or a second factor.
- Public Docs navigation has **Sign in**, **Create an account**, and a generic email contact. A
  Docs search for `password` returned Getting started and Privacy & data; the FAQ itself had no
  account-recovery question. I did not count this as a separate defect because the intended
  self-service entry is the sign-in page, whose anonymous form was not observable in this already
  authenticated profile.

## Coverage limit

This is evidence about the deployed pages observed in the signed-in profile. Anonymous empty
login/signup validation, the actual reset-email response, expired/invalid link copy, and a valid
reset-token flow remain unverified because testing them would require logging out or using account
credentials. No account or password was changed.
