# Harsh customer review — round 28

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one temporary Chrome tab against the deployed Apple app
(`https://apple.moshe-barami111.workers.dev/`) in the already-authenticated session. I opened the
workspace, inspected the settled project shelf, checked Usage and Credits, and inspected the
Settings accessibility tree. I did not open a project conversation or reproduce private message
content in this note.

This was read-only. I did not create, edit, archive, restore, delete, or rename a project, send a
prompt, generate anything, spend or purchase Credits, change settings, enter credentials, create a
key, connect Roblox/Discord, touch Studio, or download account data. The temporary tab was closed
after the review. I did not test the known skip-link or project-menu Escape focus issues.

## New findings

### 1. P2 — The returning workspace opened in Archived scope with no explicit page-level context

**Repro:** Open `/app` directly in a fresh temporary authenticated Chrome tab and wait for the
project shelf to settle. The `Archived 4` tab is selected and four archived cards are rendered.
The page heading still only says `Projects`; the selected scope is conveyed by the tab underline and
small tab label. Activate `Active` and three current cards appear, but the URL remains `/app` and
does not identify the scope.

**Observed:** A returning creator who opens the workspace looking for current work first sees the
archived list. The shelf does expose an `Active` tab, so this is recoverable, but there is no
page-level “Archived projects” heading or URL/state indicator explaining why the current projects
are absent. Because this browser profile may preserve the last scope, I cannot establish from this
single pass whether Archived is a global default or remembered user state; either way, the first
view does not make the scope prominent enough.

**Impact:** A customer can reasonably think a recent project disappeared, especially when the
archived cards are old and all show `No saved place name`. They must notice the small tab state and
switch scopes before project discovery feels trustworthy.

**Suggested fix:** Default `/app` to Active unless the user explicitly asks for Archived, or persist
the scope in the URL/history and announce it as a clear page heading (for example, `Archived
projects`). Keep the selected tab state visible to screen readers as well as visually.

### 2. P3 — Settings exposes two indistinguishable “Appearance” headings

**Repro:** Open `/app/settings` and inspect the accessibility tree around the appearance controls.
Before the Theme radios, the tree exposes an `Appearance` heading at level 2 followed immediately
by another `Appearance` heading at level 3. The same section then exposes `Motion` as another level-3
heading.

**Observed:** The nested level-3 heading has the same name as its parent section and does not
identify the control group (the controls that follow are the Theme radios). A screen-reader user
navigating by headings hears “Appearance” twice with no distinction before reaching the theme
choices.

**Impact:** Settings is already a long, multi-section page. Duplicate heading names make heading
navigation less useful and leave the user unsure whether they entered a new subsection or heard the
same section twice.

**Suggested fix:** Remove the redundant nested heading or rename it to the actual group, such as
`Theme`, while keeping `Motion` as the separate subsection heading.

## Usage and Credits observations

The Usage page loaded and was understandable at a high level: `Today’s Credits` showed `231 of
231` daily allowance remaining with a reset in `21h`; the Free plan was marked `Your plan`, and
Builder/Studio were marked `Not available yet`. The page also showed `999,999,593` extra credits
and a `What those Credits went on` entry of `Agent 455`. These account-specific balance/history
concerns and the daily/monthly copy ambiguity were already recorded in earlier rounds, so I do not
re-score them here.

## What worked / coverage limit

The project shelf had a labelled project search field, separate Active and Archived scopes, visible
card descriptions, and update ages. Settings had a labelled search field, readable security/privacy
copy, and a visible Danger zone; no destructive control was invoked. I did not wait for a second
settings-data refresh, so the initial `Checking…`/`Loading…` states visible on dynamic account
sections are recorded only as transient observations, not a new stuck-loading finding.

This was a narrow returning-user clarity pass, not a whole-product review. Studio, prompts, model
runs, billing, project actions, checkpoint/file flows, preference persistence, and account
security flows remain untested by design.
