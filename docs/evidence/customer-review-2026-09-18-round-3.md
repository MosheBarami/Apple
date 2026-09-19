# Independent customer review — 2026-09-18 (round 3)

## Scope and method

Read-only review in an isolated Chrome tab against the live site. I inspected the public home page,
Getting started and plugin docs, the Roblox Creator Store listing, and two existing projects:

- [Plugin docs](https://apple.moshe-barami111.workers.dev/docs/plugin)
- [Getting started](https://apple.moshe-barami111.workers.dev/docs/getting-started)
- [Existing Laundry Simulator run](https://apple.moshe-barami111.workers.dev/app/projects/4d96a88c-79e6-4149-7f5d-040c7735aa2f)
- [Existing image transcript](https://apple.moshe-barami111.workers.dev/app/projects/52a4b8c5-7ac9-482c-acd1-1a16f9b980a4)
- [Creator Store asset 132128477945417](https://create.roblox.com/store/asset/132128477945417/Golem)

I did not open the protected image-test project `d47e8b3b-1b23-4d34-917b-737494e0099f`, use Roblox
Studio, send a prompt, start a paid run, upload/publish anything, or change the account. One narrow
transient side effect did occur: opening the pairing modal minted a six-character pairing code; I did
not enter it, pair Studio, or submit anything. No previous review report was used.

## Findings

### P0 — the only Studio install path is unavailable

**Evidence.** The public page offers “Install for Studio,” but the linked plugin page says “Not
available yet” and says the Creator Store asset will not offer an install. The live Roblox listing
is titled **Golem** (not Apple), shows a disabled **Get Plugin** control, and says **This item is not
currently for sale**.

**Repro.** Open the home page → **Install for Studio** → follow the plugin page’s Creator Store
URL. The authoritative store page cannot be acquired or installed.

**Impact.** A new customer cannot complete the first-time journey or connect Studio, so the product’s
core paid promise—building in the customer’s place—is not usable. This is a release blocker, not a
minor onboarding rough edge.

**Action.** Publish the correct Apple plugin under the correct store identity and verify the enabled
install path end-to-end. Until then, remove the install/paying funnel or provide a clearly labeled,
actually usable demo path.

### P1 — existing build evidence says “done” and “two errors” at the same time

**Evidence.** In the recorded Laundry Simulator run, the activity transcript marks planning,
checkpointing, Luau edits, playtest, and inspection as done. The visible assistant text ends with
“Pad is built. Now the shared config module and the server script.” The project-stage panel instead
shows **Playtest finished — 2 console errors · frame unavailable**, **No frame is available**, and
only the counts **2 errors / 2 warnings**. It provides no error text, frame, log link, or clear list of
which requested parts were completed. An earlier message also says the run reached its step limit.

**Repro.** Open the existing run above, expand Activity, and inspect Project stage → Playtest.

**Impact.** A paying customer cannot decide whether the clicker loop is safe to keep, what failed, or
what to ask for next. “Done” chips read like a successful build while the only verification surface
reports an uninspectable failed playtest.

**Action.** Show the actual error messages and a playtest frame/thumbnail when available; otherwise
label the result partial/failed. End each run with a short changed/omitted/next-step summary tied to
the original request, and do not imply publish-readiness while errors remain.

### P1 — generated image result is claimed, but the workspace does not deliver it

**Evidence.** The existing image transcript contains the activity **Generated an image — done ✓
generate_image** and the assistant says the icon was “generated and shown in the workspace,” with an
`imageId` and “retrievable for an hour.” On a fresh reload of that project, the visible result is only
the text; there is no image card, download/save control, or expired-result placeholder. The composer
helper says **Images expire after 1 hour; download yours**, but there is no download action for this
old result. The same project also contains an earlier image request answered “I’m not able to generate
images directly here,” which makes the capability history harder to trust.

**Repro.** Open the existing image transcript and scroll to the generated-image reply. Compare the
“shown in the workspace” claim with the rendered chat.

**Impact.** An image is only useful if the customer can see and save it. A returning customer gets a
technical identifier and an expired promise, not an asset or a clear explanation of what happened.

**Action.** Render a durable result card with preview, download, and expiry state. If the result has
expired, show an explicit “expired” tombstone and a safe regenerate action instead of retaining the
unqualified “shown” claim.

### P2 — 3D can be selected before its prerequisites exist

On the unconnected project, selecting **3D** is allowed while the project stage says **Studio not
connected**. The composer changes to “Describe a 3D prop to create in Studio…” and the small helper
text says it requires connected Studio and **GenerationService access**; it does not link to setup or
explain how a normal creator enables that access. Generated models are described as session-only until
accepted and saved in Studio.

Gate 3D until those prerequisites are detected, or make the disabled state and setup instructions
explicit. The image/3D labels themselves are understandable; the problem is the apparently actionable
3D path before it can work.

## Unverified flows

I did not create an account, test signup/password validation, create a project, install/pair the plugin,
send any new prompt, run a fresh build or image/3D generation, inspect Studio output, restore a
checkpoint, or test billing. The pairing modal itself did mint a six-character code and showed a clear
10-minute expiry, but I did not enter it anywhere.

## Would I pay today?

No. The web workspace has a promising activity/checkpoint model and the connection instructions are
legible, but I cannot reach the core product because the required plugin is not installable. The only
visible build evidence also exposes two console errors without enough information to verify or repair
the result, and the image transcript does not provide a usable saved asset. I would reconsider after a
verified install path and verifiable, honest completion/failure artifacts for every run.
