# Handoff — BUILT 2026-09-21. The hero carries `?start=` and the app now reads it

**Closed.** `apps/web/src/lib/pending-start.ts` holds it for the tab and MOVES it into the first
project created; `SignupPage` captures it from `location.search`, `CreateProjectModal` uses it as
the seed when no template was chosen. 4 tests, apps/web 2070/2070, typecheck clean.

**One reason this lane gave for stopping was already stale when it was written.** It says sign-up
"ends on 'check your email' and the confirmation mail has never reached the owner's inbox". Read
from the Supabase Management API the same day: `mailer_autoconfirm: true`. Sign-up sends no mail at
all — `signUp` returns a session, `signupOutcome` classifies it `signed-in`, and the page navigates
straight into the app. The real defect was `site_url: "http://localhost:3000"` with an empty
`uri_allow_list`, which broke every redirect the auth service generates; both are fixed.

What remains unproven is the same thing it was: **nobody has completed a real sign-up**, because
that needs a person with a browser and an inbox. The hop below is built and unit-tested; it is not
yet witnessed end to end by a human, and this document does not claim it is.

---

## The original handoff, kept because its reasoning is still worth reading

Written 2026-09-21 by the design lane. One hop is missing and it is not this lane's to build.

## What now happens

`apps/site/src/pages/index.astro` — the hero composer is a real `<form action="/app/signup"
method="get">` holding a real `<textarea name="start" maxlength="280">` and a real
`<button type="submit">`. It was `aria-hidden="true"` and three `<span>`s: a photograph of a text
field, unreachable by keyboard, announced to a screen reader as nothing.

Typing "a lobby with a round timer" and pressing **Build** now lands on

```
/app/signup?start=a+lobby+with+a+round+timer
```

Verified against the live origin, not inferred: a real Chromium typed into the field and followed
the submit, and the resulting URL is the one above.

## What is missing

**Nothing in `apps/web` reads `start`.** `apps/web/src/routes/auth-pages.tsx` `SignupPage` ignores
it, and so does everything after it. A reader's sentence reaches the sign-up screen in the address
bar and stops there.

This is written down rather than left to be found because this repository has exactly that scar:
`data-cursor="link"` and `data-cursor="drag"` sat on three elements for weeks with no renderer, and
every reader of those files reasonably concluded a cursor system existed. The parameter is the
reader's own words being preserved rather than discarded between two pages of one product; it is
not a claim, and **no copy on the landing says anything about a prefill**. The page says "Create a
free account", which is what happens.

## The hop somebody has to build

Owner of `apps/web`:

1. `SignupPage` reads `start` from `useLocation().search`, caps it at the same 280 characters the
   field does, and keeps it — `sessionStorage` is enough; it must not outlive the tab.
2. The project-creation flow (`apps/web/src/routes/dashboard.tsx`, `setShowCreate(true)`) uses it as
   the new project's first message when it is present, then clears it.
3. It is cleared on any path that does not use it, so a sentence typed on Monday cannot arrive in a
   project created on Friday.

## Why this lane stopped here

- **The middle of the chain is owner-blocked.** Sign-up ends on "check your email" and the
  confirmation mail has never reached the owner's inbox — `signup-verification-email` in the
  outstanding ledger, `NOT-STARTED`. A prefill carried into a flow nobody can finish would be
  untestable end to end, and testing it end to end is the only way to know it works.
- **`apps/web` is another lane's surface.** Three files, one of them the dashboard, is not a change
  to make in a shared checkout against a flow that cannot be exercised.
- **Half-wiring it would be worse than not wiring it.** A sign-up page that shows the sentence back
  and then drops it is a placeholder workflow, which is the thing the owner's own instruction
  forbids by name.

## How to know it is done

Type a sentence in the hero on the live origin, complete sign-up, create a project, and find the
sentence already in the workspace composer. Not "the parameter is read" — the sentence, in the box,
on the screen a person is looking at.
