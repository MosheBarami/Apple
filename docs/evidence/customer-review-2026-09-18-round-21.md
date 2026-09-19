# Customer review — 2026-09-18, round 21

Observed: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used a fresh temporary Chrome tab (`1045984440`) against the deployed Apple workspace at
`https://apple.moshe-barami111.workers.dev/app` in the already-authenticated session. This was a
bounded, read-only returning-customer pass over the project shelf and one existing-project
navigation path:

1. Active and Archived project scopes, including project-name search, a zero-results query, and
   recovery with **Clear search**.
2. A filtered project card → existing project deep link → browser Back to the shelf.
3. The project header's name/recency, the closed and expanded model picker, and empty-composer
   disabled states.

I did not submit a prompt or quote/reproduce private conversation content, create/edit/archive a
project, open a project action menu, change preferences, spend, sign out, pair or touch Roblox
Studio, or invoke a paid path. I did not re-score the known public-plugin, one-hour image, or
planned-paid-plan findings. The temporary tab was closed after the review.

## What was clear in the checked journey

- The settled shelf showed **3 active** projects and **Archived 4**. Search was exposed as a
  labelled `Search projects` field. Searching `Laundry` returned `2 of 3 loaded projects`; the
  separate **Clear search** control restored all active cards.
- A no-match query (`zzzz-no-match-21`) produced a distinct visible empty state: `0 of 3 loaded
  projects` and `No projects match “zzzz-no-match-21” in this list. Clear the search or change
  scope.` The same state worked in Archived (`0 of 4 loaded projects`). Clearing the query and
  switching back to Active recovered the list without a dead end.
- Clicking a filtered existing-project card reached a stable `/app/projects/<id>` route. The
  project header exposed the visible name and an accessible `Rename project` help label. Browser
  Back returned to `/app` and the shelf loaded again.
- The model control was announced as `Model: Apple` when closed. Opening it showed
  `Apple Free · limited daily usage` selected and `Apple MAX Subscribers · upgrade to unlock` as
  the unavailable alternative. In the disconnected existing project, `3D` was semantically
  disabled with `Connect Roblox Studio to use 3D`; the empty composer also exposed disabled Voice
  input with the reason `not supported yet` and disabled Send. These reasons were understandable
  without attempting a run.

## New findings

### P2 — Browser Back drops the project-search context

**Repro:** On `/app`, enter `Laundry` in `Search projects` (the shelf reports `2 of 3 loaded
projects`), open one of the filtered cards, then use browser Back.

**Observed:** Back returned to `/app`, but the search field was empty (`Search projects`) and all
3 active cards were shown. The query was not represented in the `/app` URL, so the customer had no
visible way to recover the filtered context except retyping it. The deep link itself loaded and
Back did not dead-end; the lost context is the defect.

**Impact:** A returning creator who narrows a growing project list and opens a result loses the
working set on the normal return path. With similarly named existing projects, they must repeat
the search and re-identify the card, which makes ordinary browse → inspect → back navigation feel
forgetful.

**Suggested fix:** Persist the query and scope in the history state or URL (for example, a
`search` parameter), and restore the field, result count, and focus when returning with Back.

### P2 — The shelf and project detail disagree about recency

**Repro:** From Active, search `Laundry` and open the first matching card. Compare the card's
recency with the detail header; then compare the second matching card and its detail header.

**Observed:** The first matching card on the shelf said `updated 2d ago`, while the opened
project's header displayed a bare `4h` beside the same visible project name. The second matching
card said `updated 2d ago` and its opened detail header displayed `2d`, so this is not merely a
consistent shorthand difference between surfaces. The detail value also lacks an `updated` label
or `ago` suffix.

**Impact:** A returning customer cannot trust the shelf to identify the most recently changed
project, and cannot tell from the detail header what the unlabeled `4h` measures. The shelf can
look stale even though the project contains a more recent activity state, weakening confidence in
which project to reopen.

**Suggested fix:** Derive both surfaces from one canonical `updatedAt` value, invalidate or reload
the shelf metadata after project activity, and label the detail value consistently (for example,
`Updated 4h ago`).

## Verdict

The new project search is usable and its zero-results recovery is explicit in both scopes. Known
project routes load, Back returns to the shelf, and the selected-model and prerequisite-disabled
copy were understandable in this pass. The two fresh issues are state fidelity problems in the
ordinary returning-customer loop: the filtered working set is forgotten on Back, and one project
shows conflicting recency between its card and detail header.

## Coverage limits

This was a narrow shelf/search/deep-link pass, not a whole-product score. I did not test a true
zero-project account, project creation or archive flows, rename persistence, project actions,
prompt submission, model selection, paid access, files, settings, Studio, or Roblox behavior. No
account or project state was changed, and no private message content is reproduced here.
