# Customer review — 2026-09-18, round 33

## Scope and method

I used one disposable Chrome tab against the deployed Apple site
([https://apple.moshe-barami111.workers.dev/](https://apple.moshe-barami111.workers.dev/)). This was a
short, read-only pass through the normal discovery path: the public homepage and pricing/docs
surfaces, then the model selector and MAX-only controls in an already-authenticated project. The
browser profile was already signed in, so I did not log out, create an account, or inspect the
project's private history beyond the visible controls.

I did not submit a form, send a prompt, spend money, upload/download content, change settings, or
open Studio. I opened and closed the existing pairing dialog without entering or sharing its
short-lived code. Opening that dialog itself minted a pairing code: this was an accidental
deviation from the read-only review scope, not a state-free action. The code was not used or
shared; the dialog was closed. Expiration was not independently observed.
I am not re-reporting the known public-plugin or paid-checkout blockers.

## New finding

### P2 — Choosing unavailable Apple MAX has no plan-availability recovery, despite the docs promise

**Repro:**

1. Open [`/docs/modes`](https://apple.moshe-barami111.workers.dev/docs/modes) and read the
   **Availability** section.
2. Open the composer in the observed project at
   [`/app/projects/d47e8b3b-1b23-4d34-917b-737494e0099f`](https://apple.moshe-barami111.workers.dev/app/projects/d47e8b3b-1b23-4d34-917b-737494e0099f).
3. Open **Model: Apple** and choose **Apple MAX Subscribers · not available yet**. Also try the
   visible **Images · MAX** checkbox.

**Observed:** The docs say that choosing MAX on a free account **“opens plan availability”** and
does not silently switch or charge the account. In the live composer, the MAX menu item is
discoverable and not marked disabled, but selecting it only shows:

> Apple MAX is required. Paid subscriptions are not available yet. Your draft is kept.

The selector remains **Model: Apple**. There is no link to pricing, plan availability, status, or
support in that notification—only **Dismiss notification**. The visible **Images · MAX** control has
the help text **“Images require Apple MAX; paid subscriptions are not available yet”** and produces
the same no-action notification; it does not expose the public availability destination either.
Unlike those controls, **3D · MAX** is visibly disabled, so the affordances do not communicate one
consistent unavailable state.

**Customer impact:** A new/free customer can discover MAX from the product UI but cannot learn what
to do next, whether a plan is waitlisted, or where to check eligibility. The “draft is kept” wording
suggests a recoverable action, yet the only recovery is dismissing a toast and continuing with Apple.
This is an inference about confusion from the observed controls; no subscription or checkout was
attempted.

**Suggested fix:** When MAX is unavailable, either disable the MAX menu item and Images control like
3D, or replace the no-op with an inline link to the same plan-availability page used by pricing and
the docs (with the current “no checkout” explanation). Update the docs promise to match the actual
route, and keep the draft-preservation message alongside that route.

## What passed in this pass

- The public pages clearly distinguish Apple as the free, limited model and Apple MAX as the larger
  paid tier; the public docs also explain that model access is separate from the Plan/Agent work
  mode.
- Getting started explicitly says that new users can chat now and that Studio changes require an
  existing plugin connection. The known public-installation blocker was visible and not counted as
  a new finding.
- The composer exposed the current model and MAX-only capabilities with accessible labels; the
  unavailable-selection response preserved the draft and did not submit or charge anything.

## Coverage limit

This is evidence from public docs plus the visible composer state in an already-authenticated
session. I did not test anonymous signup/login or a successful paid account, and I did not run a
prompt or verify a Studio build.
