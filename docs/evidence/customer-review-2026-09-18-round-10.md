# Harsh customer review — round 10

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used a dedicated authenticated Chrome tab (`1045984336`) against
`https://apple.moshe-barami111.workers.dev/app`. This was a bounded, read-only pass over two
journeys: the workspace sidebar plus keyboard focus, and one existing project's conversation
history. I did not submit a prompt, edit or regenerate a message, open a project action menu,
change a project, pair Studio, touch Roblox Studio, or toggle a preference. I closed the tab after
the review.

## What worked in the checked paths

- The authenticated project shelf loaded with three active projects and an `Archived 4` scope tab.
- The sidebar expanded and collapsed successfully; after collapse, focus returned to the
  `Open navigation` control. In the collapsed state, keyboard Tab reached Usage, Settings, New
  project, both project-scope tabs, each project link and its Project actions control, the Studio
  status/docs links, the skip link, and the rail controls. In the expanded state, Tab stayed in
  the conversation drawer and cycled back through it.
- Opening the existing `Image verification — 18 Sep` project restored its conversation history.
  Expanding the latest Activity disclosure showed one `Generating` action (9.6s) with
  `Generated an image — done ✓ generate_image`; the visible project stage remained `Studio not
  connected`.

## New finding

### P2 — Expanded sidebar exposes duplicate “Close navigation” controls

**Repro:** Open `/app`, activate `Open navigation`, and inspect the accessibility tree/DOM.

**Observed:** The live page exposes two visible, enabled buttons with the exact accessible name
`Close navigation`: the drawer close button inside `aside role="dialog" aria-modal="true"`, and a
full-screen `button.gx-scrim` outside that dialog. Both had `tabIndex=0`. The keyboard sequence
reached the drawer close button but never the scrim button, while the accessibility tree still
listed both controls.

**Impact:** A screen-reader or control enumerator presents two indistinguishable close actions,
while keyboard behavior treats only one as part of the modal's focus path. That is confusing and
signals that the modal boundary is not expressed consistently.

**Suggested fix:** Keep the drawer close button as the single keyboard/screen-reader close
control. Make the scrim pointer-only and hidden from the accessibility tree/tab order, or give it a
distinct non-duplicative treatment while preserving click-to-dismiss.

## Coverage limit

I did not open Settings in this handoff, so no claim is made about its read-only controls. I did
not re-score the already-known round-9 docs availability, 60-Credit copy, or Usage model-spacing
findings; those were outside this fresh navigation/accessibility read.

