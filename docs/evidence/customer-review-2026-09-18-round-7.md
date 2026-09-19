# Harsh ordinary-customer review — local public pages (round 7)

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one dedicated Chrome tab (`1045984319`) against the local preview at
`http://127.0.0.1:4322/` and `http://127.0.0.1:4322/docs/plugin`, as an ordinary prospective
Roblox creator. The visible desktop viewport was approximately 1273×778. I did not sign in,
create an account, use an `/app` route, send a prompt, pair Studio, purchase anything, or mutate
Roblox/Studio state. This is evidence about the local preview only, not a deployment claim.

The local Astro dev toolbar visible at the bottom of screenshots was treated as preview tooling,
not as a customer-product finding. The CUA Chrome surface exposed no narrow/mobile viewport
control, so mobile behavior is unverified.

## What is working

- The refreshed landing page is dark, restrained, and cinematic with a clean sans hierarchy. MAX
  is the only colored accent (lavender); no promotional banner competes with the hero.
- The plugin page is unusually direct about the blocker: **“Public installation is unavailable”**,
  the previous listing was removed, the replacement is local-only, and no release date is
  confirmed. This is honest copy.
- After a reload, the docs header consistently showed Product/Models/Pricing/Docs, and Product
  navigated to the `#inside` section. I did not count the older labels seen on the first, stale
  page load as a reproducible navigation bug.

## Top actionable findings

### P0 — The advertised Studio workflow is still blocked at installation

**Observed:** The landing hero says **“Early preview. Public Studio installation is not
available yet”**. `/docs/plugin` says the public listing is unavailable and that the numbered
installation steps apply only after an approved listing exists.

**Impact:** A new creator cannot reach Apple’s defining promise—building inside their own Roblox
Studio—from the supported customer path. This is a release blocker even though the disclosure is
honest.

**Action:** Keep the status truthful, but do not treat the Studio path as launch-ready until an
approved, installable listing is independently verified end-to-end. Until then, route the primary
CTA to a clearly labeled status/waitlist/preview action.

### P1 — The blocked page still presents an active install funnel

**Observed:** The plugin page has a prominent white **Start building** button in its header, then
an **Installing** heading and bright numbered steps immediately below the unavailable callout.
The landing page likewise leads with **Open Apple** and ends with **Create an account**, while the
availability sentence is small, muted text below the hero card and idea labels.

**Impact:** The warning is correct, but its visual hierarchy competes poorly with the actions that
send a newcomer toward signup and an install guide that cannot work. The page also exposes a raw
asset ID and explains a local replacement, details that add uncertainty for a normal customer.

**Action:** Make the unavailable state the primary action (`Plugin unavailable — see status` or a
waitlist/preview path), and place the future steps under a clearly disabled **When an approved
listing is available** disclosure. Move local replacement/asset details to developer-only docs.

### P1 — The hero looks like a ChatGPT composer, but it is not an input

**Observed:** The large rounded card says **“Start with an idea…”**, with an **Open Apple** link
at the lower right. Accessibility exposes it as one link, not a textbox. The three lines beneath
it—**A world worth exploring**, **A shop that feels alive**, and **One more impossible jump**—are
plain text, not links or buttons.

**Impact:** An ordinary visitor can reasonably try to type in the card or click an idea to seed a
conversation. Neither affordance exists, so the first interaction is ambiguous and the marketing
surface promises more directness than it provides.

**Action:** Either make the card a real prompt field with an explicit account handoff, or style and
label it unmistakably as a CTA card. If the idea lines are examples, keep them visibly static; if
they are meant to start a prompt, make them keyboard-accessible buttons and preserve the selected
text through signup.

## Verdict

The public surface now looks polished and the plugin limitation is plainly disclosed, but I would
not recommend Apple for a creator who needs the Studio workflow today. The next customer-facing
release should make the blocked state the dominant action and remove the fake-composer ambiguity;
mobile remains unverified in this pass.
