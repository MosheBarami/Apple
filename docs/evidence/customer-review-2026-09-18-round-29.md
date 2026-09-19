# Harsh customer review — round 29

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one temporary Chrome tab against the deployed public site
(`https://apple.moshe-barami111.workers.dev/`). I reviewed the landing page, documentation
overview, plugin/install, getting started, project connection, model, Credits/limits, billing,
privacy, FAQ, pricing, status, and changelog pages. I used the visible accessibility tree and a
landing-page screenshot; I also searched the public docs for `3D`, `mesh`, and `asset`.

This was read-only. I did not sign up, enter credentials, inspect account or project data, send a
prompt, generate, pay, upload, pair Studio, touch Roblox Studio, or change anything. The browser
already had a session, so a public sign-up link resolved to `/app`; I stopped there without
inspecting the workspace. The temporary tab was closed after the review.

## What passed in this round

- The landing page's visible hero says **“Built with you, inside Roblox Studio”** and places the
  equally visible disclosure **“Early preview. Public Studio installation is not available yet.”**
  The docs overview and getting-started page repeat the same blocker before their setup steps.
- `/docs/plugin`, `/status`, and the FAQ consistently say that the old Creator Store listing is
  not a working install path, no public workaround or release date is confirmed, and a working
  existing plugin is required for Studio changes. I did not re-score that already-known blocker as
  a new finding.
- The current model copy is internally aligned: Apple is the limited free model, Apple MAX is for
  eligible paid subscribers, paid checkout is closed in this preview, and custom Roblox training
  is still in development. `/pricing` and `/docs/credits-and-limits` agree on the current Free
  allowance of 231 Credits per day.
- The public docs do not make a positive 3D promise. Searches for `3D` and `mesh` returned
  **“Nothing matches”**; the limits page distinguishes generated images from Roblox models that
  live in the place. This is a transparency gap noted below, not evidence that a private feature is
  broken.

## New findings

### 1. P2 — The public changelog retains obsolete quota and paid-plan facts without an explicit historical cue

**Repro:** Open [`/changelog`](https://apple.moshe-barami111.workers.dev/changelog) and compare the
V0.1 “THE DEAL” bullets with [`/pricing`](https://apple.moshe-barami111.workers.dev/pricing) and
[`/docs/credits-and-limits`](https://apple.moshe-barami111.workers.dev/docs/credits-and-limits).

**Observed:** The V0.1 entry says **“Free tier: 60 Credits per day”** and **“Pro (400 Credits/day,
priority queue, extended checkpoints) opens as a waitlist.”** The current pricing and limits pages
say Free is **231 Credits per day**, Builder is **416**, Studio is **700**, and paid checkout is not
open. The changelog is headed “V0.1 First public release” and dated 2026, but the obsolete figures
are not labelled “at launch” or otherwise separated from current product facts.

**Impact:** A creator using the public changelog to budget a first session can reasonably believe
the current allowance is 60 Credits or that a 400-Credit Pro waitlist is the available paid path.
The canonical pricing page is correct, but the public product still tells two different quota
stories.

**Suggested fix:** Keep the historical entry, but mark the figures explicitly as “at V0.1 launch”
and link to the current pricing/limits page. If the changelog is intended to describe current
behavior, replace the obsolete numbers from the shared plan configuration.

### 2. P2 — Billing documentation reads as live paid-product support while checkout is closed

**Repro:** Open [`/docs/billing`](https://apple.moshe-barami111.workers.dev/docs/billing) and
compare it with [`/pricing`](https://apple.moshe-barami111.workers.dev/pricing) and
[`/docs/modes`](https://apple.moshe-barami111.workers.dev/docs/modes).

**Observed:** Pricing and Models visibly say **“Paid checkout is not open in this preview”** and
the paid cards say they are not available to purchase. Billing documentation instead opens with
“Everything to do with money … lives in the billing portal” and describes failed renewals, paid
customer allowances, cancellation, invoices, and changing between paid tiers in the present tense.
It never leads with the fact that a new visitor cannot start any of those flows today.

**Impact:** A prospect can follow the docs expecting a Manage billing portal or a subscription
recovery path that cannot be reached from the current preview. This is more than the known checkout
blocker: the public help page sets the wrong expectation about the lifecycle a new customer can
actually enter.

**Suggested fix:** Add a top-level “Planned; paid checkout is currently closed” notice and phrase
the operational sections as “once paid plans open” until the first subscription can be purchased.
Keep the detailed recovery/cancellation text ready for launch.

### 3. P3 — Public 3D/model availability is left undefined

**Repro:** Search the docs for `3D` and `mesh`; both return **“Nothing matches.”** The limits page
does say **“Generated images are separate … Roblox models live in your place,”** while the privacy
page says Roblox receives assets you ask Apple to upload if you provide an Open Cloud key. No
public page states whether Apple can generate, import, or edit 3D models/meshes in the current
preview, or explicitly says that it cannot.

**Impact:** A creator seeing “build Roblox games” and “assets” cannot tell whether 3D model/mesh
work is supported, planned, or outside the product. The silence avoids a false claim but leaves a
central capability boundary unclear.

**Suggested fix:** Add one short availability statement to the overview/FAQ and limits page,
distinguishing supported Studio instance edits and generated 2D images from any 3D generation or
asset-upload workflow. If 3D is not public, say so plainly.

## Verdict and coverage limit

The refreshed landing page, installation disclosure, model claims, and current Credit numbers are
mostly candid and mutually consistent. The fresh risks are stale public-history numbers, a billing
help page that sounds live while paid checkout is closed, and an unspecified 3D boundary. I did not
re-score the known plugin-unavailable, paid-checkout-closed, or in-development-training states as
new defects; I used them only to test whether other public surfaces explained them consistently.
No authenticated private data, Studio connection, generation, purchase, upload, or destructive
action was used.
