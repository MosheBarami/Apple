# Harsh customer review — round 9

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one dedicated Chrome tab against the deployed public site
(`https://apple.moshe-barami111.workers.dev/`). I reviewed the new dark homepage on desktop,
the public docs/plugin and pricing pages, the docs landing/getting-started path, and the
availability destination linked from paid pricing cards. The browser exposed a viewport control,
so I also checked the homepage, docs, plugin, and pricing layouts at a 390×844 mobile viewport,
then reset it to the default desktop size.

This was read-only. I did not sign up, submit a form, create a project, send a prompt, generate or
pay, pair Studio, touch Roblox Studio, or alter account state. I did not re-score the known public
plugin blocker, unavailable Stripe checkout, unfinished custom training, or round-8 expired-image
Save action.

## What passed in this round

- The refreshed homepage rendered as the intended black, restrained landing surface on desktop and
  mobile. Its visible CTAs had understandable destinations: `Open your workspace` → `/app`,
  `Create a free account` → `/app/signup`, and the early-preview status link → `/docs/plugin`.
- `/docs/plugin` visibly states that public installation is unavailable, that the old store URL is
  not a working install path, and that the numbered steps apply only after an approved listing.
  Its desktop and mobile layouts were readable. The mobile hamburger opened and closed the primary
  navigation, and the docs navigation control was exposed.
- `/pricing` showed the three planned tiers and its paid `Check availability` links resolved to
  `/app/usage`; the page explicitly says paid checkout is not open in this preview. The comparison
  and per-request tables were readable after scrolling into their sections.

## New findings

### 1. P1 — The docs entry points still instruct a newcomer to install an unavailable plugin

**Repro:** Open `/docs`, then `/docs/getting-started`, and compare both with `/docs/plugin`.

**Observed:** The docs landing page says **“Install the plugin — get Apple for Studio from the
Roblox Creator Store”** and its one-sentence manual says **“install the plugin from the Creator
Store”**. Getting started step 3 likewise says the plugin is installed from the Creator Store and
describes acquiring it on the web. The canonical plugin page instead says **“Public installation is
unavailable”**, the store URL is not a working install path, and those instructions apply only
after an approved listing is available.

**Impact:** A first-time creator can enter the docs through the normal overview or getting-started
guide and be told to perform an action that the canonical status page says cannot work. The warning
is one click away, but the onboarding entry points do not carry it, so the journey reads as
actionable until the customer has already spent time following it.

**Suggested fix:** Derive the overview and getting-started install language from the same public
availability flag as `/docs/plugin`; while unavailable, lead with the blocked state and the next
safe action rather than an install instruction.

### 2. P1 — Getting-started promises the old 60-Credit allowance

**Repro:** Open `/docs/getting-started` and compare step 1 with the public `/pricing` Free card
and `/docs/credits-and-limits`.

**Observed:** Step 1 says **“You start with your full daily allowance of 60 Credits immediately.”**
The deployed pricing page and credits documentation both say the Free plan is **231 Credits per
day** (and the pricing page says 2,310 per month). The live Usage page reached from pricing also
showed the current 231-Credit daily allowance.

**Impact:** A new customer budgeting a first session receives a materially wrong quota promise in
the primary setup guide. The guide contradicts the pricing/limits surfaces that are supposed to
describe the enforced allowance.

**Suggested fix:** Remove the hardcoded 60 and read the Free daily allowance from the shared plan
limits used by pricing and the service.

### 3. P2 — Usage model bullets run together at the pricing CTA destination

**Repro:** From `/pricing`, follow either paid-plan **Check availability** link to `/app/usage`.
Inspect the Today’s Credits card on desktop and at the 390×844 mobile viewport.

**Observed:** The two visible model bullets render without whitespace around the logo/label:
**“AppleLimited daily use on the free tier.”** and **“Apple MAXAvailable with a paid
subscription.”** The same run-together text was visible at both viewport sizes.

**Impact:** The entitlement explanation is harder to scan and makes the Apple/Apple MAX labels look
like malformed words at the exact screen a pricing visitor reaches to understand availability.

**Suggested fix:** Keep the icon decorative (or give it an empty accessible name) and add explicit
spacing/markup between the icon and each label.

## Verdict and coverage limit

The new homepage and the public plugin warning are visually clear, and the key navigation controls
worked in the checked desktop/mobile states. I found three fresh copy/readability defects above;
the first two make the public onboarding and quota promise internally inconsistent. I did not test
anonymous authentication behavior because the browser already had an authenticated session, and I
did not perform any mutating or paid action.
