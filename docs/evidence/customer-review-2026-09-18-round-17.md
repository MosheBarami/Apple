# Customer review — 2026-09-18, round 17

Observed live at approximately 04:51 EEST through the existing signed-in Chrome session. I did not read prior review evidence before this pass. I did not open an existing project, pair Studio, submit a build, upload anything, or inspect a Roblox place; therefore this review makes no claim about build quality.

## Bounded journey observed

1. **Public home (`/`)** — Hero says “Built with you, inside Roblox Studio.” The two primary actions are “Open your workspace” and “Create a free account.” The same hero also says: “Early preview. Public Studio installation is not available yet.” The models section labels Apple as the limited free tier, Apple MAX as paid, and says custom Roblox training is in development.
2. **Authenticated workspace (`/app`)** — Following the home CTA in the already-authenticated session landed on Projects. After the list loaded, the page displayed: “Public Studio installation is unavailable. You can use chat now; building in Studio requires an existing plugin connection.” I did not open any project cards.
3. **Usage (`/app/usage`)** — The page showed Apple as “Limited daily use on the free tier” and Apple MAX as “Available with a paid subscription.” Free was marked “Your plan”; Builder and Studio were marked “Not available yet.” The Free card listed “Every build mode,” “Studio plugin,” and “Checkpoints and restore.”
4. **Public pricing (`/pricing`)** — The page says paid checkout is not open and paid cards are planned. The Free card says “Studio integration · public installation pending.” In the side-by-side table, “ROBLOX STUDIO PLUGIN” is “Included” for every plan; the closing note says Studio access still requires a connected plugin and public installation is unavailable.
5. **Docs (`/docs/getting-started`, `/docs/plugin`, `/docs/modes`)** — Getting started explicitly says steps 1–2 work now, new users can chat, and Studio steps are only for users who already have a working plugin. Plugin docs say the Creator Store listing is unavailable, the old listing was removed, a replacement is only being tested locally, and there is no confirmed release date. Model docs say Apple MAX is for eligible paid subscribers, paid checkout is not open, and custom Roblox training is not yet a completed independent model.
6. **Status (`/status`)** — API was shown operational. Known issues included “The Studio plugin is not listed in the Roblox creator store yet” and “Apple cannot tell whether the plugin is installed”; the latter says the workspace can wait for a Studio connection without stating the reason on screen.

## Findings

### F17-1 — Core Studio job is unavailable to an ordinary new customer

**Severity: P1 (core-path blocker).** The live product promise centers on building “inside Roblox Studio,” but the public installation path is unavailable. A new user can create an account and chat, yet cannot change a place without already possessing a working plugin. This is clearly disclosed in several places, so it is not a hidden-failure claim; it is a direct availability gap in the primary job-to-be-done.

**Reproduction:** Open `/`; follow the visible “See status”/plugin documentation path, or sign in and open `/app`. The home notice, Projects banner, `/docs/getting-started`, and `/docs/plugin` all lead to the same conclusion: no public install path exists.

### F17-2 — “Plugin included” is technically qualified but easy to misread as usable now

**Severity: P2 (entitlement comprehension).** `/pricing` and `/app/usage` both present “Studio plugin”/“ROBLOX STUDIO PLUGIN — Included,” while the same surfaces say public installation is pending/unavailable and paid tiers cannot be purchased. An ordinary customer scanning the plan table can reasonably read “included” as “available to install now.” The qualification is present, but it is separated from the entitlement row rather than expressed as the current state of that capability.

**Reproduction:** Open `/pricing`, read the Free card and the side-by-side `ROBLOX STUDIO PLUGIN` row, then read the final note; compare with `/app/usage` → Free plan. No payment or plugin action was attempted.

### F17-3 — Plugin presence/connection remains unknowable from the browser

**Severity: P2 (onboarding state ambiguity).** The live Status page itself says Apple cannot detect whether Studio has the plugin and may wait for a connection without saying why. The Projects page gives a general public-installation warning, but there is no observed per-user “plugin connected/missing” state. A user who already has a local/legacy plugin and a user who has no plugin can receive the same browser-side uncertainty until Studio connects.

**Reproduction:** Open `/status` and read the “Apple cannot tell whether the plugin is installed” known issue. I did not open an existing project or attempt pairing, so I am not claiming a particular project’s connection state.

## What was clear / limits of this pass

Model entitlement language was comparatively direct: Apple is the free model, Apple MAX is paid-only, paid checkout is closed, and training is not claimed as complete. The home copy, models docs, pricing, and Usage page were consistent on those points. The authenticated session also redirected `/app/login` and the home `/app/signup` CTA to `/app`, which is expected for an already-signed-in account; I did not log out or create credentials, so anonymous signup-form behavior is unverified.
