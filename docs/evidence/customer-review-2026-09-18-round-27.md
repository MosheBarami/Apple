# Harsh customer review — round 27

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one temporary Chrome tab against the deployed Apple app
(`https://apple.moshe-barami111.workers.dev/`). I opened the authenticated workspace, inspected
the project list and one existing project chat, exercised the navigation drawer and project-action
menu with the keyboard, and used browser Back to return to the list. I did not copy project titles,
conversation text, identifiers, or other private content into this note.

This was read-only. I did not create or edit a project, send a prompt, generate anything, delete or
restore anything, upload, pair Studio, pay, or change settings/preferences. I did not re-score the
known paid/plugin blockers, duplicate project titles, account-memory default, missing media docs,
stale final summary, or dashboard-search issues.

## New findings

### 1. P1 — “Skip to content” does not move keyboard focus into the content

**Repro:** Open `/app`, reload so the initial keyboard focus is the first visible **Skip to
content** link, then press Enter. Inspect the URL and accessibility focus before pressing Tab again.

**Observed:** Enter changes the URL to `/app#main-content`, but the accessibility focus remains the
page root (`AXWebArea`), not the main container or its **Projects** heading. The next Tab focuses the
sidebar **Apple — projects** link, so keyboard focus still starts in the persistent navigation.

**Impact:** A keyboard or screen-reader user who invokes the promised skip link is not actually
taken past the repeated workspace navigation. On a long workspace page, the user still has to
traverse the sidebar before reaching the content the link claims to target.

**Suggested fix:** Make the `main-content` target programmatically focusable (for example, a
carefully scoped `tabindex="-1"` target) and move focus to it after the skip-link navigation. Verify
that the next Tab enters the page content rather than the sidebar.

### 2. P2 — Escape from a project-action menu loses the trigger context

**Repro:** On the project list, focus a card’s **Project actions** button, press Enter to open the
menu, Tab through the menu without activating an item, then press Escape. Repeat once in the
Archived scope without selecting **Restore**.

**Observed:** The menu items are keyboard reachable and clearly named, and Escape closes the menu,
but after dismissal the accessibility focus is reported on the page root (`AXWebArea`) rather than
back on the **Project actions** trigger that opened the menu. The same focus loss occurs for an
archived-project menu.

**Impact:** A keyboard user loses their place after checking or abandoning an action menu. They must
restart traversal from the document, which is especially disorienting when several cards expose the
same unlabeled visual ellipsis control.

**Suggested fix:** On Escape (and on dismissal by outside focus where applicable), restore focus to
the exact menu trigger. Keep the trigger’s accessible name stable while the menu is expanded.

## What worked in this pass

The drawer’s **Open navigation** control had a useful accessible description and Escape closed it
with focus returned to the trigger. The project-action menu’s items were individually keyboard
reachable, including the archived **Restore** item, without activating them. Opening a project and
using browser Back returned to the project list without mutation. The existing chat composer’s
disabled controls exposed explanatory help for unavailable voice, 3D, and image requirements.

## Verdict and coverage limit

The workspace is usable with a mouse and its visible recovery controls are present, but two keyboard
focus-management failures undermine the help and close affordances: skip navigation does not skip,
and menu dismissal loses context. I did not test any mutating action, project restore/delete, file
or checkpoint flows, Studio, payments, or account preferences.
