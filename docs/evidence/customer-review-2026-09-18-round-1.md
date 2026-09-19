# Independent customer review — 18 Sep 2026

## Scope and evidence

I reviewed the live product in a separate Chrome tab at `https://apple.moshe-barami111.workers.dev/app` as an ordinary prospective Roblox creator. I inspected the rendered Projects, workspace, usage, pricing, plugin docs, and connection UI. I also inspected the currently visible Roblox Studio window read-only; no message was sent, no conversation/draft was edited, no asset was uploaded, and no place was published.

The Studio screenshots and active-run observations below were captured before the 01:23 local deployment notice; the pricing, docs, image re-check, and project-list re-check were captured after it. They remained reproducible on the live URL after that notice.

Roblox Studio was available at `/Applications/RobloxStudio.app`. Its visible `Place2` had the Apple panel green and connected to `Laundry Simulator`. That is an owner/dev environment, not proof that a new customer can install the plugin.

## Five strongest findings

### P0 — The core onboarding path is unavailable to a new customer

**Repro:** Projects → “Getting Apple into Studio” → “Install Apple for Studio”.

**Expected:** A prospective customer can obtain the plugin and follow the stated three-step path.

**Observed:** The live docs say “Not available yet”; the Creator Store asset exists but “will not offer the plugin for install.” The app still presents the install path and the public homepage invites “Start building — free.”

**Impact:** A normal customer cannot reach Apple’s defining value—building in their own Studio. The locally connected plugin visible in this review does not make the customer path available. This alone prevents approval or a paid recommendation.

### P0 — An explicit build request produced only a small fragment of the promised result

**Repro:** Open active project `4d96a88c-79e6-4147-9f5d-040c7735aa2f` (“Laundry Simulator”) and compare the request with the visible connected Studio place.

**Expected:** A clicker loop with a touch pad, Coins in leaderstats, a shop GUI with three upgrades, and a current-total display, followed by a usable playtest.

**Observed:** Studio shows an otherwise empty grey scene with one white plate and a coin pad labelled “CLICK FOR COINS.” The conversation says “I reached the step limit for this run” and later only “Pad is built. Now the shared config module and the server script.” No shop, three upgrades, or total display is visible. I did not infer success from the chat prose.

**Impact:** The result is not a usable feature or an excellent Roblox experience; the user must continue manually and still cannot see that the requested systems work.

### P0 — “Finished” playtest evidence is contradictory and unsafe to trust

**Repro:** In the same project, open the `Studio` / Project stage panel.

**Expected:** A finished run has a visible first frame/viewport and a clear clean-result state.

**Observed:** The panel says `Project stage — Finished` and `Playtest finished — last frame captured (7s)`, but also says `Waiting for the first frame from Studio…` and `Rasterised geometry from Studio — not a viewport capture. No characters, particles or lighting effects.` It reports `2 errors` and `2 warnings`, without actionable details.

**Impact:** A creator cannot verify what Apple changed or whether it works before publishing. “Finished” reads as success while the evidence is missing and the console is not clean. I therefore mark the build verification unverified.

### P1 — Image generation reports success but delivers no visible usable image

**Repro:** Open active project `d47e8b3b-1b23-4d34-917b-737494e0099f` (“Image verification — 18 Sep”); inspect the generated message and expand Activity. Repeat the observation in the fresh Laundry project `52a4b8c5-7ac9-482c-acd1-1a16f9b980a4`.

**Expected:** An inline image preview with an obvious save/download action, or a clear failure.

**Observed:** Activity shows `✓ generate_image`, while the rendered conversation contains only prose saying the image is “generated and shown,” an opaque image ID, and a one-hour retrieval caveat. No image, preview, save, or download control is visible. The fresh project also contains an earlier “I’m not able to generate images directly here” response followed by a later generated/shown claim. The `3D` control is present, but I could not verify a 3D result without running a request.

**Impact:** The user cannot inspect or use the claimed asset, and the conflicting capability messages undermine trust. Image and 3D promises remain unverified.

### P1 — Connection, availability, and pricing states do not agree

**Repro:** Compare the Projects cards, connected project, and public/authenticated plan pages.

**Expected:** One consistent readiness state and a purchase path that reflects what is actually available.

**Observed:** The active Laundry card says `Not linked`, while the same project’s web toast says `Studio connected · Place2` and the native Studio Apple panel is green `Connected · Laundry Simulator`. Opening a project briefly shows `Connecting…` with the composer disabled before recovering. Public `/pricing` exposes `Choose Builder` and `Choose Studio`; clicking Builder leads to authenticated Usage, where both paid plans say `Not available yet`. The unlinked project’s connection panel also renders the first step as the run-on text `Install Apple for StudioInstall`.

**Impact:** A new user cannot tell whether they are ready to build or whether payment is possible. The transient disabled composer and contradictory “Not linked” label make the primary loop feel unreliable; the pricing CTA creates a false expectation.

## Coverage limits and verdict

I did not send a new build request, regenerate, upload, publish, or alter Studio. I could not exercise a real customer install because the documented plugin path is unavailable. CUA exposed no mobile-viewport control in this review, so mobile behavior is **unverified**; I do not approve the product on that basis. I also did not verify a working 3D generation/result.

Verdict: **I would not pay for or recommend Apple today.** I would revisit a free trial after the plugin is obtainable, a complete requested feature is visible in Studio, and a clean viewport/playtest plus image/3D result can be independently inspected. The current evidence is a partial build and contradictory “finished”/availability states, not a reliable end-to-end customer result.
