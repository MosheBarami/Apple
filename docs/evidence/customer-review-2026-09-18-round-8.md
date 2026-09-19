# Harsh ordinary-customer review — round 8

Date: 2026-09-18 (Asia/Jerusalem)
Observed: 2026-09-18 03:15 IDT

## Scope and method

I used a fresh Chrome tab (`1045984327`) against the deployed app at
`https://apple.moshe-barami111.workers.dev/app` and reviewed the changed customer paths as a
free account. I inspected the isolated **Image verification — 18 Sep** project, the existing
**Laundry Simulator** project, the model picker, the Usage route, historical Activity, historical
View results, and the disconnected/connected composer states.

This was a read-only pass. I did not send or regenerate a message, edit a message or draft, pair
Studio, create a project, modify the account, pay, upload, publish, or make a paid call. I only
expanded menus/result disclosures, scrolled, and navigated. The tab was closed after the review.

## What changed behavior I could verify

- The composer defaults to **Apple**, and the model menu exposes **Apple Free · limited daily
  usage** as selected plus **Apple MAX Subscribers · upgrade to unlock** as the unavailable
  alternative.
- Selecting the MAX alternative navigates to `/app/usage`. The Usage page states that Apple MAX is
  available with a paid subscription, while both Builder and Studio cards visibly say **Not
  available yet**. Enterprise exposes an email contact. I did not treat the known non-live billing
  state as a new finding in this round.
- In the unconnected Image verification project, the stage says **Studio not connected** and the
  composer exposes a disabled **3D** control with help text **Connect Roblox Studio to use 3D**.
  In the connected Laundry project, 3D is enabled and its help text instead says **Subscribe to
  Apple MAX for 3D**. This conditional state is understandable and was not a reproduced defect.
- Historical Activity now expands to a compact action list. For the image run it showed one
  **Generating** step (9.6s) with **Generated an image — done ✓ generate_image**. The summary did
  not claim additional Studio edits or uploads.

## New finding

### P2 — An expired historical image still presents an enabled Save action

**Repro:** Open the Image verification project, expand a historical **View results** disclosure,
and wait for the result card to settle.

**Observed:** The result card visibly changes from `Loading` to `Unavailable` and says **No longer
available — generated images are kept for an hour.** The same card still renders a normal-looking
**Save image** button (not marked disabled in the accessibility tree) and the adjacent copy still
says **Available for 1 hour. Save a copy to keep it.** This was observed on the 1:32 AM and 2:01 AM
historical image results.

**Impact:** A returning creator is told the asset is gone but is still offered the action that would
normally retrieve it. The stale affordance makes the expiry state look broken and invites a futile
click; it also weakens confidence that the historical result card reflects the real asset state.

**Action:** When the retrieval window has expired, disable or remove **Save image**, replace the
`Available for 1 hour` helper with an explicit expired-state message, and keep only a clearly
labeled safe next step if regeneration is supported.

## Verdict

For this narrow changed scope, the Apple/Apple MAX naming, MAX navigation, per-plan unavailable
state, concise historical Activity, and disconnected 3D gating are materially clearer than the
previous surface. I still would not call historical image handoff reliable until an expired result
cannot advertise a live save action. This is one P2 workflow defect, not a new billing or plugin
finding; the known installation and billing blockers remain outside this round’s re-score.

## Coverage limits

I did not test a fresh generation, a successful image download, a live paid subscription, or a
connected 3D run. I also did not attempt the known unavailable public plugin path or billing
checkout. No claim is made about those untested or intentionally excluded flows.
