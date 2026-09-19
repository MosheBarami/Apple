# Customer review — 2026-09-18 (round 2)

## Scope and method

I opened the live Apple app at `https://apple.moshe-barami111.workers.dev/app` in a separate Chrome tab and reviewed it as a first-time customer for about five minutes. I inspected the active project list, the newest **Image verification — 18 Sep** project (`d47e8b3b-1b23-4d34-917b-737494e0099f`), and the **Laundry Simulator** project (`4d96a88c-79e6-4147-9f5d-040c7735aa2f`). I also looked at the already-open Roblox Studio window read-only. I did not send prompts, regenerate, run a paid model, modify Studio, upload or publish anything, or open billing/settings.

## What I could verify

- The project list is understandable at a glance: project cards show their descriptions, update time, and `Not linked` status. The onboarding copy gives three concrete steps—install the plugin, open it in Studio, and pair the project.
- In the image project, expanding **View results** exposes the generated image and a **Save image** control. The UI explicitly says the result is available for one hour and should be saved to keep it. Clicking Save image produced a local download.
- The saved file was named `apple-image-f5bb8dbb-e46d-464e-a9fb-243abb56dba4 (1).png`, but the downloaded bytes identify as JPEG (1024×1024). This was measured with the local `file` utility after the download.
- The displayed result is not a close match to the request for a *silver* crescent: it visibly has a gold/bronze gradient on a dark slate background. Apple’s own activity text acknowledges that the generator may not honor the exact background and applies a thick outline. The image is viewable, but the alt text still calls it a silver crescent.
- The Laundry project’s stage is explicit: `Playtest finished — 2 console errors · frame unavailable`, with `2 errors` and `2 warnings`, and the instruction to inspect Roblox Studio’s Output panel. This is a visible failed/unfinished run, not an inferred failure.
- In the existing Studio place I could see a connected Apple panel (`Connected · Laundry Simulator`), a `CLICK FOR COINS` pad, `ClickerRemotes`/`ClickerConfig` in ReplicatedStorage, and `ClickerServer` in ServerScriptService. The viewport showed the pad and a blank white platform. I did not execute the game or inspect script contents, so the shop, leaderstats, and total-display behavior are unverified.
- The project **Files** drawer says `0 files · 0 B stored` and that Apple has not written any files; it explains that notes, plans, and generated data live in Apple’s storage rather than the Roblox place. A checkpoint drawer does contain history with object/script counts and Restore buttons; I did not restore anything.

## Prioritized customer problems

1. **P1 — The demonstrated Studio build is not publish-ready.** The current playtest ends with two console errors, two warnings, and no frame. The web UI gives no error text or repair/retry path and sends the customer to Studio Output. The underlying causes and whether a continuation would fix them were not tested because this review did not send a prompt.
2. **P1 — No inspectable/exportable code artifact in the web workspace.** The chat claims that the shared config module and server script are being created, but the Files drawer is empty. The customer has to trust what was written in Studio and cannot review or back up the Luau from Apple’s UI. Explorer confirms that some objects/scripts exist, but their contents and correctness were not verified.
3. **P1/P2 — Image fidelity and metadata undermine confidence.** A requested silver moon appears gold/bronze, while the result description/alt text says silver. The caveat is honest, but it still leaves the customer with a result that does not meet the plain-language request and no evidence that a correction would be cheap.
4. **P2 — Download format mismatch.** The Save image flow labels the artifact `.png`, while the bytes are JPEG. This can confuse downstream tools and may cause import failures; the effect on Roblox upload was not tested.
5. **P2 — Fixed composer can cover evidence.** At the bottom of the image conversation the composer initially obscured the lower part of the generated image; I had to scroll to reposition it. The image became fully viewable after scrolling, so this is a friction issue rather than a blocked flow.
6. **P2 — Small copy/selection clarity issues.** The Studio-stage onboarding renders `Install Apple for StudioInstall` (missing whitespace between the instruction and link). This account also has two active cards both named `Laundry Simulator`, which makes project selection ambiguous unless the descriptions are read carefully; this may be seeded account data rather than a universal behavior.

## Unverified / deliberately not attempted

Anonymous signup and empty-account onboarding, pricing/credits, Studio Output’s individual error messages, code correctness, actual playtest behavior, and whether the JPEG-with-`.png` file is rejected by Roblox were not checked. I did not use any mutating or paid action to answer them.

## Verdict

I would not honestly pay for hands-off Roblox building yet. I would consider a free/low-commitment trial for quickly prototyping a scene or generating an image, because the app makes the Studio connection state, checkpoint history, and image-save affordance visible. For a paid workflow, I need clean playtests (or actionable error details and repair), inspectable/exportable Luau, and downloads whose file type matches their extension.
