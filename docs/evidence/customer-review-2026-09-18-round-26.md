# Harsh customer review — round 26

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one temporary Chrome tab against the deployed Apple app
(`https://apple.moshe-barami111.workers.dev/`). I opened the authenticated workspace, returned to
the active project list, reopened the returning project, and read its Project files, Checkpoints,
and Project memory surfaces. I closed each drawer and returned to the project list; I also opened the
second same-titled card once to verify that it was a different conversation. I did not reproduce
project chat text, identifiers, or other private content here.

This was read-only. I did not create or edit a project, send a prompt, generate anything, restore or
save a checkpoint, touch Studio, upload, pay, or change permissions/settings. I did not re-score the
known public plugin/paid-availability, missing image/3D docs, dashboard-search, or stale-final-summary
issues.

## New findings

### 1. P1 — Two active project cards with the same title can reopen different work

**Repro:** Open `/app` and leave the **Active** project scope selected. Observe the two adjacent
cards with the same project title. Both show **No saved place name** and the same relative update
age. One card describes a Roblox place being built through a live Studio agent connection; the
other only says **Open this conversation to continue**. Open the latter and compare the conversation
and project age with the former.

**Observed:** The cards are distinct projects/conversations, but the primary title and visible
metadata do not make that distinction safe for a returning creator. The second card opens an older,
different conversation under the same project title; there is no persistent place name or clear
"this is a different project" marker on the list card.

**Impact:** A returning creator can choose the wrong same-named card and continue work in a stale or
different conversation. The next prompt could then be directed at the wrong project context, which
is a materially dangerous navigation failure even though both cards look valid.

**Suggested fix:** Give each active card a durable discriminator—saved place name, last-message
preview plus timestamp, Studio connection state, or a project ID—and prevent duplicate default
titles from appearing indistinguishable. If these are accidental duplicates, merge or archive one.

### 2. P1 — “Project memory” opens account memory by default

**Repro:** Open the returning project, choose **Project → Project memory**, and inspect the modal
without changing anything. The modal opens with **Your account** selected and account-level fields,
including global instructions and notification settings. The project summary and project facts only
appear after selecting **This project**. Close and reopen the modal, and repeat after returning to
the project list and reopening the project: it still defaults to **Your account**.

**Observed:** The entry point is explicitly labelled **Project memory**, but its initial selected
scope is account-wide. The correct project-scoped memory is present and readable after one more click;
the problem is the default scope and the edit surface presented first.

**Impact:** A creator trying to adjust this project can unknowingly edit or review global preferences
instead. The scope toggle is visible, but it is easy to miss and the first form is a live account
settings surface, so this is a high-risk mismatch between navigation label and destination.

**Suggested fix:** Open this entry point with **This project** selected, or split account memory and
project memory into separate explicitly named destinations. Keep the scope heading visible above any
editable fields.

## What did not surprise me

The returning project's **Files** drawer showed an explicit zero-file state, storage limits, and a
clear explanation that Apple workspace files are not the Roblox place. **Checkpoints** showed named
entries with timestamps and object/script counts. I saw no misleading empty or error state on those
two surfaces during this pass.

## Verdict and coverage limit

The project surfaces themselves loaded and could be closed without mutation, but the return path has
two high-impact context hazards: duplicate same-titled active cards and a project-memory entry point
that defaults to account scope. I did not test checkpoint restore, file upload, memory save/import,
Studio, payments, or any other mutating action.
