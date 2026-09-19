# Harsh customer review — round 4

Date: 2026-09-18 (Asia/Jerusalem)

Scope: one fresh Chrome tab, one bounded read-only pass. I inspected the public landing/docs/pricing/status screens and existing conversations that were already visible in the authenticated browser session. I did not create an account, send a prompt, generate anything, enter a pairing code, touch Studio, upload to Roblox, open checkout, or change account state.

## Verdict

I would not pay today. The core Studio path cannot be completed from the supported install route, the paid tiers have no purchase path, and the visible chat evidence is not reliable enough to trust a build.

## Five highest-impact findings

### 1. P0 — The core install path is unavailable, so a newcomer cannot reach the product’s value

Exact repro:

1. Open the landing page: `https://apple.moshe-barami111.workers.dev/`.
2. Follow **Install for Studio** to `https://apple.moshe-barami111.workers.dev/docs/plugin`.
3. The page says the only supported route is the Roblox Creator Store, then explicitly says **“Not available yet”** and that the store page “will not offer the plugin for install.”
4. The same page says the asset exists at `https://create.roblox.com/store/asset/132128477945417`, but it is not distributed through the Store.

The status screen (`https://apple.moshe-barami111.workers.dev/status`) confirms this has been open since 1 Sept 2026. It also says Apple cannot detect a missing plugin: the workspace can wait for a Studio that will never connect “and the reason is not stated on screen.” A newcomer can sign up and create a project, but cannot perform the first essential action.

### 2. P0 — Pricing advertises Builder and Studio, but a free customer has no way to buy either

Exact repro:

1. Open `https://apple.moshe-barami111.workers.dev/pricing`.
2. The Builder card advertises **$12/month** with a **Choose Builder** link; Studio advertises **$40/month** with **Choose Studio**.
3. Both links resolve to `https://apple.moshe-barami111.workers.dev/app/usage`.
4. On the Usage screen, the Builder and Studio cards both say **“Not available yet”**. There is no checkout or upgrade control for a Free customer.

This also conflicts with `https://apple.moshe-barami111.workers.dev/docs/billing`, which describes a Stripe billing portal and says **“Manage billing, invoices and cancellation”** appears once paid. A customer cannot become paid from the observed flow. The pricing calculator additionally labels the paid allowance **“PRO (WAITLIST)”** while the cards call it Builder/Studio (`/pricing`, visible Usage Explorer section), making the commercial state harder to interpret.

### 3. P1 — Apple versus Apple MAX is named three different ways

Exact repro across the visible screens:

- Landing page `https://apple.moshe-barami111.workers.dev/#modes`: the second card is headed **Apple MAX**, but its eyebrow says **MODE / AGENT**.
- Getting-started docs `https://apple.moshe-barami111.workers.dev/docs/getting-started`: tells the customer to **“start with Agent for a real build.”**
- Modes docs `https://apple.moshe-barami111.workers.dev/docs/modes`: calls the modes **Apple** and **Apple MAX**.
- Existing project workspace `https://apple.moshe-barami111.workers.dev/app/projects/4d96a88c-79e6-4147-9f5d-040c7735aa2f`: the composer says **“Model: Apple MAX.”**

The customer is left guessing whether Agent is a mode, Apple MAX is a model, or they are the same thing. That matters because the product ties the choice to autonomy and Credits.

### 4. P1 — A direct question was ignored while the chat continued an unrelated build

I did not send this message; it was already visible in the existing project conversation at the URL above.

Exact visible transcript:

- User, 1:16 AM: **“how many skills do you have”**
- Assistant, 1:20 AM: **“Pad is built. Now the shared config module and the server script.”**

The reply does not answer the question and instead continues the earlier clicker-simulator task. The same screen showed the composer unavailable while the session was connecting. This is a basic steerability/trust failure: even a harmless clarification can be swallowed by an old run.

### 5. P1 — Build completion is not handed off as a clear, trustworthy result

On the same existing project screen, the observed Project stage first showed **“Playtest finished — 2 console errors · frame unavailable”**, with **“No frame is available for this completed playtest. Inspect the result in Studio.”** and **“Check the Output panel in Roblox Studio for error details before publishing.”** The conversation’s latest activity simultaneously said **“Pad is built. Now the shared config module and the server script.”**

After reloading the same URL during this read-only pass, the stage changed to **“Checking Studio”**, with **“Checking for Roblox Studio…”** and the assistant footer reading **“Connecting…”**. I did not run or repair anything, so I cannot claim which state is correct. The observable result is that the customer has no single answer to “is this build done and working, or does it need attention?” and no in-app frame/evidence to settle it.

## What I would need before paying

The supported plugin must be installable, paid plans must have an actual checkout/upgrade path, the mode terminology must be unified, and a stale/in-progress run must not answer a newer user message. A failed playtest also needs a concise, prominent handoff that reconciles errors with the assistant’s “built” claim.
