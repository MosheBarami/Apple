# Harsh customer review — 2026-09-18, round 16

Date: 2026-09-18 (Asia/Jerusalem)

Observed: 2026-09-18 04:12–04:19 IDT

## Scope and method

I used one fresh temporary Chrome tab (`1045984407`) against the deployed site at
`https://apple.moshe-barami111.workers.dev`. This was a bounded, read-only review of the
authenticated project shelf and navigation into existing projects:

1. Landing page → `Open your workspace` → the signed-in `/app` shelf.
2. `Active` (3 projects) → `Archived` (4 projects), inspecting the rendered cards and
   accessibility tree for search, filter, sort, and empty-state affordances.
3. Active `Image verification — 18 Sep` → its existing conversation, then back to the shelf.
4. Active `Laundry Simulator` cards → their existing conversations and settled project-stage
   panels, without sending anything.

I did not submit a prompt, create or delete a project, change settings, sign out, pay, upload,
pair/connect Studio, use Roblox Studio, or invoke any project action menu. I did not re-score the
known public plugin-installation limitation. The temporary tab was closed after inspection.

## Settled observations

- The shelf loaded with an `Active` tab showing 3 cards and an `Archived 4` tab showing 4 cards.
  Switching between the two tabs worked and rendered the expected card sets; no loading spinner or
  navigation dead-end remained after the shelf settled.
- There was no visible or accessible search input, filter control, or sort control on either shelf
  tab. The only scope control was the `Active`/`Archived` tab group, plus `New project` and the
  per-card project links/actions.
- Both scopes were non-empty for this signed-in account. I did not manufacture an empty account by
  creating/deleting/archiving projects, so the product's true zero-project or zero-results empty
  state remains unverified.
- Opening `Image verification — 18 Sep` reached its existing conversation and eventually enabled
  the composer; it did not dead-end. Opening both `Laundry Simulator` cards also reached their
  existing histories and project-stage UI.
- The shelf still showed the previously documented stale-looking card summaries/`Not linked`
  badges when the corresponding project pages contained historical messages and, for one project,
  a settled `Studio connected · Place2`/playtest panel. I did not count those already-recorded
  inconsistencies as a new finding in this round.

## New finding

### P2 — Project shelf has no search or filtering path

**Repro:** Open the authenticated `/app` shelf and inspect both `Active` and `Archived` scopes.

**Observed:** The rendered shelf exposes the coarse `Active`/`Archived` scope tabs, but neither
scope has a search field, additional filter, sort control, result-count query state, or a way to
narrow the visible cards by name or metadata. The accessibility tree likewise exposes the project
links and `Project actions`, but no search/filter control beyond the two scope tabs. This is a live
UI observation, not an inference from source.

**Impact:** Project discovery within each scope is manual card scanning. As the account grows, a
creator cannot jump to a project by name or narrow the shelf by metadata; the existing repeated
`Laundry Simulator` names make that selection burden concrete. The only alternative is to open
cards one by one and use the browser's generic page find, which is not a product-level project
search and does not filter the list.

**Suggested fix:** Add a labelled project search field and, if more dimensions are needed, explicit
filters/sort within the existing Active/Archived scopes. Preserve an explicit zero-results state
and make the empty-account state separate so users can tell “nothing matches” from “no projects
exist.”

## Verdict

The checked shelf-to-project navigation is reachable, but the shelf is a browse-only list with no
search/filter affordance and no safely testable empty state in this account. For a creator with a
growing project history, that is a real discovery dead-end even though opening a known card works.
The fresh issue in this pass is the missing project discovery path; prior stale-summary and
connection-badge contradictions were observed again but deliberately not re-counted.

## Coverage limits

This completed 100% of this pass's planned shelf/search/filter/empty-state/navigation coverage,
but it is well under 10% of the whole product. I did not test a true zero-project account or a
zero-results query because that would require destructive or state-changing setup, and I did not
test prompts, model changes, files, billing, pairing, Studio, or Roblox behavior. No code or
account state was changed.
