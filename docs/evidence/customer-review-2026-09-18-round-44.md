# Customer review — 2026-09-18, round 44

Observed: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used a temporary Chrome tab (`1045984539`) against the deployed Apple workspace, opened the
existing **Image verification — 18 Sep** project, and inspected the new **Asset library**. I ran
read-only searches for `stone` and `tree`, both with and without **Only assets with a Roblox ID**.
The tab was closed after observation.

This was strictly read-only. I did not add a reference, send a message, pair Studio, generate,
upload, open account settings, or pay. Searching visibly states that it does not start a build or
upload assets.

## What was clear and truthful

- The catalogue is discoverable from the composer as **Assets**. The dialog is titled **Asset
  library**, labels its field **Search assets**, and shows a result count such as **Showing 20
  matches for “stone” (up to 20)**.
- The unfiltered `stone` search returned relevant library categories including **prop**, **ground**,
  **ui_icon**, **building**, and **texture**. The unfiltered `tree` search returned relevant
  **foliage** results from OpenGameArt and Kenney.
- Every unfiltered result I saw disclosed a source and licence label, for example Kenney’s
  **Creative Commons CC0 By Kenney** with a `kenney.nl/assets/...` source, or OpenGameArt’s CC0
  attribution. Those labels were visible in the app; I did not independently audit the linked
  source pages.
- The readiness boundary is explicit: the library results say **Needs import · not ready for
  Studio**, and the footer warns that files marked **Needs import** cannot be inserted yet.
- The Roblox-ID-only filter produced actual Creator Store links. For `stone`, visible examples
  included `create.roblox.com/store/asset/15319925952` and `.../15320646763`; for `tree`, every
  visible result had a Creator Store URL and said **Roblox ID recorded · safety checks still
  required**. The footer also says a recorded ID still needs permission and safety checks. This is
  a useful, honest distinction rather than implying that an ID is automatically safe or usable.

## Fresh findings

### R44-01 — Relevant results are not choice-ready (P2)

**Repro:** Open **Assets**, search `stone` or `tree`, and inspect the result cards without adding a
reference.

**Observed:** The result list is text-only. Many entries repeat generic display names — the
unfiltered `stone` list begins with several `Stone`/`Stone ground` cards, while the unfiltered
`tree` list contains many `Tree foliage` cards. The cards expose a category, creator/source, and
licence, but no thumbnail, dimensions, file type, poly/texture details, or other visual
description. A creator cannot tell which of several similarly named stones or trees fits their
place without opening source links one by one.

**Impact:** Keyword relevance is good enough to find the topic, but the catalogue does not support
the next customer decision: choosing the right asset. This is especially weak for Roblox-ID
results, where the list contains many Creator Store textures/foliage entries and only an ID link;
the user still cannot see what they are about to reference.

**Suggested fix:** Add a small preview or preview-state, plus stable differentiators such as asset
type, dimensions/format where known, and a short description. Preserve the current source, licence,
readiness, and safety labels beside the preview.

### R44-02 — The safety disclaimer copy is accurate but awkward (P2)

**Repro:** Inspect the helper text below the search field.

**Observed:** It reads **“Search the catalogue by name. No result is a guarantee of safety or
quality.”** The later footer is clearer: **“A recorded Roblox ID still needs permission and safety
checks. Files marked ‘Needs import’ cannot be inserted yet.”**

**Impact:** The warning is directionally correct, but “No result is a guarantee” is unnatural and
slows comprehension in a surface where customers need to understand the difference between a
catalogue match, a Roblox ID, permission, and import readiness. The later footer supplies the
needed nuance, so this is a clarity issue rather than a false-safety claim.

**Suggested fix:** Use direct wording such as **“Search matches are not guarantees of safety or
quality. Roblox IDs still require permission and safety checks; files marked Needs import are not
ready for Studio.”** Keep one concise version near the result list.

## Verdict

The new catalogue is substantively honest: `stone` and `tree` return on-topic assets, provenance
and licence labels are visible, the Roblox-ID filter returns real Creator Store URLs, and the UI
does not pretend that IDs are automatically safe or that import-needed files are Studio-ready. The
main customer problem is selection, not discovery: the text-only, repetitive cards make the user
open external source pages to understand what the asset actually looks like. I found two P2
usability/clarity findings and no evidence in this read-only pass that the safety or readiness
claims were overstated.

## Coverage limit

I did not click any source link, add a reference, inspect an asset in Studio, test permission
enforcement, download/import an asset, or verify the external licence/asset content independently.
No claim is made about the visual correctness, safety, ownership, or current availability of any
individual Creator Store/OpenGameArt/Kenney asset beyond what the deployed catalogue displayed.
