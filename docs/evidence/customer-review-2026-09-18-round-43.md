# Customer review — 2026-09-18, round 43

Observed: 2026-09-18 07:29 IDT (local dev only)

## Scope and method

I used a fresh temporary Chrome tab (`1045984532`) against the local mock workspace at
`http://127.0.0.1:5197/app/?mock=1`. I opened the **Ember Halls** fixture, opened the composer’s
**Assets** dialog, and ran a bounded read-only review of discoverability, typography, keyboard
close/focus, and a 390×844 narrow viewport. I did not send a prompt, build, pair Studio, upload,
change an account, or touch production. The temporary tab was closed and the viewport override was
reset after the review.

## What was clear and working

- The composer exposes a plainly labeled **Assets** control. The dialog title is **Asset library**;
  its helper text says that searching does not start a build or upload assets, so the consequence
  of opening/searching is understandable.
- The empty state is discoverable: the field is labeled **Search assets**, its placeholder is
  **Try tree, stone or coin**, the initial **Search** button is disabled until text is entered,
  and the optional filter is labeled **Only assets with a Roblox ID**.
- On desktop (1351×786), the dialog is centered at roughly 840×362 CSS pixels. The title is
  27px/33.75px, the input is 16px/24.8px, and the secondary explanatory copy is 13px/20.8px in a
  readable muted grey. I found no clipping or illegible text in the rendered dialog.
- Keyboard behavior is coherent. Opening the dialog focuses the search field; Tab cycles
  search field → Roblox-ID checkbox → Close → search field without escaping the dialog. Escape
  closes it and returns focus to the **Assets** trigger.
- At a 390×844 viewport the dialog remained inside the page (roughly x=12, width=351, bottom=637;
  document scroll width equaled its client width). The input and Search button stayed side by
  side and all helper/disclaimer copy wrapped visibly. No narrow-viewport clipping or horizontal
  overflow was reproduced.

## Known local condition (not a production regression)

### R43-01 — Local mock search endpoint returns 404, so no result state is testable

**Repro:** In the local mock Ember Halls workspace, open **Assets**, enter `stone`, and click
**Search**.

**Observed:** The browser requested
`/api/assets/search?query=stone&limit=20&insertableOnly=false` and the local server returned
HTTP 404 (`text/plain`). The dialog visibly announced **Request failed (404)** and left the
**Asset search results** list empty.

**Impact:** The primary interaction ends in an error rather than an asset card, so this local
review cannot verify result-card typography, source/licence labels, Roblox-ID filtering, or the
selection handoff. This is explicitly a local mock/backend-integration condition; it is not
evidence that the deployed production search is broken.

**Suggested follow-up:** Wire the local mock route or provide a fixture response before using this
environment to sign off the result state. Keep a retry/actionable error state once the endpoint is
available.

## Verdict and coverage limit

The new dialog is easy to find, readable, keyboard-safe, and fits the checked narrow viewport. I
found no additional high-signal visual or focus defect in this pass. The result surface itself
remains unverified because the local mock search endpoint returned 404; no claim is made about
production search results or asset insertion.
