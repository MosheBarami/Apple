# Harsh customer review — 2026-09-18, round 14

Date: 2026-09-18 (Asia/Jerusalem)

Observed: 2026-09-18 04:03 IDT

## Scope and method

I used one fresh Chrome tab (`1045984392`) against the deployed site at
`https://apple.moshe-barami111.workers.dev`. This was a bounded, read-only review of two
journeys:

1. `/docs/modes` → `/pricing` → a paid-plan `Check availability` link → `/app/usage`, including
   the pricing disclosure `Can I subscribe now?`.
2. `/pricing` → the Free card's `Start building — free` link. The browser was already signed in,
   so this resolved to the authenticated `/app` project shelf.

I did not submit a purchase, prompt, credential, form, or setting; create a project; change a
project; connect Studio or Roblox; or make a paid call. I did not re-score the known public plugin
installation blocker. The temporary tab was closed after inspection.

## What was clear and honest

- `/docs/modes` clearly separates the product model selector from the Plan/Agent work modes. It
  describes Apple as the limited free model and Apple MAX as paid-subscriber access, says MAX does
  not silently switch or charge a free account, and explicitly says extra Credits do not grant a
  paid subscription.
- `/pricing` repeats that identity split and prominently says paid checkout is not open in this
  preview. Its expanded `Can I subscribe now?` disclosure says Builder and Studio are planned
  tiers and that no subscription starts without a confirmed checkout.
- The paid links did resolve to `/app/usage`. After the initial loading state settled, the page
  showed `Apple: Limited daily use on the free tier`, `Apple MAX: Available with a paid
  subscription`, and both Builder and Studio marked `Not available yet`. No purchase control was
  exposed. Enterprise alone had a `Get in touch` email link.
- The Free link did not dead-end for this already-authenticated account: it opened `/app`, which
  loaded the Projects shelf. I did not test anonymous signup because the existing session would
  not provide that journey.

## New findings

### P2 — Public pricing blurs planned paid limits with enforced entitlements

**Repro:** Read the `/pricing` intro, compare-section note, and then follow either paid
`Check availability` link to `/app/usage`.

**Observed:** The pricing intro says paid checkout is closed and that the paid cards describe a
`planned offering`. Later on the same page it says the figures are `the same limits the service
enforces`, and the comparison note says the table is read from `the same tables the service
enforces` so it cannot drift from `what you actually get`. The linked Usage page, however, marks
the Builder and Studio plans `Not available yet`.

**Impact:** A prospective creator cannot tell whether the $12/$40 limits are currently usable
entitlements or only a future specification. The prominent preview disclaimer is honest, but the
later “enforces”/“what you actually get” language makes the status internally inconsistent and
weakens confidence in the Apple MAX access promise.

**Suggested fix:** Label paid figures consistently as planned while checkout is closed, or show a
visible `Not available yet` status on each paid pricing card. Do not describe unavailable paid
tiers as something a customer already gets.

### P2 — Paid `Check availability` is a dead-end with no next action

**Repro:** From either Builder or Studio on `/pricing`, activate `Check availability` and inspect
the settled `/app/usage` plan cards.

**Observed:** The destination shows the Free plan as `Your plan`, while Builder and Studio each
end with `Not available yet`. There is no waitlist, interest form, notification option, or
Builder/Studio contact action. The only actionable paid contact is the separate Enterprise
`Get in touch` email link.

**Impact:** Someone who clicks a paid upgrade CTA to obtain Apple MAX reaches a page that confirms
they cannot buy it and offers no route to continue. The copy is candid, but the CTA still presents
an availability journey that terminates without a customer action.

**Suggested fix:** Replace the paid CTA with a clearly non-actionable `Paid plans not yet
available` label plus an approved waitlist/notification or general paid-plan contact path, or
remove the CTA until Builder and Studio can actually be requested.

### P2 — Free CTA is immediately contradicted by “there is nothing to start”

**Repro:** Inspect the Free card on `/pricing`, then activate its `Start building — free` link.

**Observed:** The card offers a live `Start building — free` link to `/app/signup`, immediately
followed by the sentence `Nothing to cancel, because there is nothing to start.` In the existing
signed-in session, activating the link opened `/app` and loaded the Projects shelf with `New
project` and existing projects.

**Impact:** The sentence reads as if the free tier is not actually available, directly under a
button that starts it. A new visitor can reasonably hesitate over whether “free” is merely a
planned offer or whether there is a real workspace to enter.

**Suggested fix:** Keep the cancellation reassurance but remove the false implication that the
product cannot be started, for example `No subscription to cancel — start building for free.`

## Verdict

Apple vs Apple MAX identity is understandable and the preview/checkout limitation is stated
plainly. The linked paid path is honest about unavailability, but it is still a dead-end, and the
pricing page mixes “planned” language with claims that paid limits are already enforced and are what
the customer gets. The Free card's “nothing to start” sentence further muddies an otherwise working
entry path. These are three fresh copy/flow findings; I did not count the already-documented plugin
installation outage as a new finding.

## Coverage limits

This completed both bounded journeys requested for this pass (100% of this task's planned
coverage); it is only a narrow slice of the product, not a whole-product score (well under 10% of
customer surfaces).

I did not test an anonymous browser, signup validation, the model picker inside a project, a real
subscription, checkout, a purchase, a MAX request, or any Studio/plugin action. The displayed
`/app/usage` balance belonged to the existing signed-in account; I did not generalize its
account-specific purchased-Credit value to other users.
