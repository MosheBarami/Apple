# Customer review — 2026-09-18, round 41

Observed: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one fresh temporary browser tab against the deployed Apple site and read `/pricing` and
`/docs/billing`. This was a bounded, read-only newcomer review focused on whether a customer can
tell what is purchasable today. I did not sign up or sign in, submit a form, open a pairing dialog,
open Usage, start checkout, enter credentials or payment data, generate, download or upload, or
change an account or preference. The temporary tab was closed after the review.

## What the pages make clear

- `/pricing` says plainly at the top: “Paid checkout is not open in this preview; the paid plans
  below describe the planned offering.” The Free plan is `$0 forever` and has a visible `Start
  building — free` link.
- The Builder and Studio cards show `$12 a month` and `$40 a month`, but each is labelled
  “Planned tier — not available to purchase yet.” The comparison section repeats that free access
  is available now while paid tiers and Apple MAX subscriptions are not yet available to purchase.
- The expanded `Can I subscribe now?` answer repeats that paid checkout is not open and says an
  account’s Plans & Credits page shows live purchase availability. That account-only surface is
  not a current paid CTA on the public pricing page; the page has no visible link to `/docs/billing`.
- The pricing comparison table says `BUY EXTRA CREDITS ... Included` for Free, Builder, Studio,
  and Enterprise, and the Builder card says “Buy credits when you need more.” No extra-credit
  price, bundle, or public purchase route is shown, so the page does not establish whether extra
  Credits can actually be bought today.
- `/docs/billing` opens with a different present-tense frame: money “lives in the billing portal,”
  reached from Usage at `/app/usage` via `Manage billing, invoices and cancellation`, which
  “appears once you are on a paid plan.” The rest of the page discusses failed renewals, invoices,
  cancellation, changing paid tiers, webhook application after payment, and a second checkout as
  if paid subscriptions are an operating product surface.

## Fresh finding

### R41-01 — Pricing says “not purchasable”; Billing reads like paid service is live (P1)

**Repro:** Read the public `/pricing` status copy, the expanded `Can I subscribe now?` answer,
then open the linked Billing & payments documentation.

**Observed:** Pricing gives a reasonably direct answer for subscriptions: Free is the only
clearly current offer; Builder, Studio, and Apple MAX are planned and unavailable. The billing
documentation never repeats that status. Instead, it tells a customer to use a Stripe billing
portal from Usage and explains what happens after a failed renewal, how to find invoices, how to
cancel, how to move between paid tiers, and how Stripe webhooks apply a payment. A customer who
follows the docs cannot tell whether those are instructions for a product they can buy now or
support copy retained for a future paid launch. The extra-Credit row creates a second ambiguity:
“Included” sounds like a current purchasable add-on, but there is no price or route.

**Impact:** A customer ready to pay can answer only “free access is available; paid subscriptions
are not” by reading Pricing, then encounters Billing copy that implies an existing paid lifecycle.
They may waste time looking for a portal or assume the paid plan/extra-Credit purchase exists,
while a customer who wants more than the free allowance has no reliable current offer to choose.
The public pages therefore communicate planned prices and post-purchase policy more clearly than
the actual catalog of things a visitor can buy today.

**Suggested fix:** Put the same current-status notice at the top of `/docs/billing` (paid checkout
closed; Builder/Studio/Apple MAX are planned), and label the rest as “for existing paid accounts
when checkout is open” if that is the intended future policy. Separately state whether extra
Credits are currently purchasable; if not, mark that table row as planned, and if yes, show the
unit/bundle price and the authenticated purchase entry point.

## Verdict

The public pricing page is clear enough to establish one current offer: Free access. It is not
clear enough to establish the current status of extra Credits, and it conflicts in tone and timing
with `/docs/billing`, which reads like a live Stripe-backed paid product. The result is a partial
answer to “what can I buy today?” rather than a trustworthy purchase boundary.

## Coverage limit

This is evidence from the two deployed public pages only. I did not verify signup, login, the
authenticated Plans & Credits or Usage screen, Stripe checkout, a billing portal, extra-Credit
availability, payment webhooks, or whether any paid backend route works. The finding is a
customer-facing copy/status contradiction and ambiguity, not a claim that the payment backend is
broken or that a charge can occur.
