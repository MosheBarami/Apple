# Customer review — 2026-09-18, round 36

## Scope and method

I used one disposable Chrome tab against the deployed Apple workspace
([https://apple.moshe-barami111.workers.dev/app](https://apple.moshe-barami111.workers.dev/app))
with the existing signed-in session. From Projects, I opened the most recent active project
labeled **Image verification — 18 Sep**, read the stored conversation, and expanded the latest
**View results** disclosure. I reviewed the project-stage panel, conversation/result layout,
composer, and the visible project navigation as an ordinary customer.

This was strictly read-only. I did not send a prompt, edit or regenerate a message, open a pairing
dialog, enter a code, change project/account settings, pay, upload/download, open Studio, or delete
anything. The agent-created tab was closed after the review.

## What passed in this pass

- The Projects screen makes the current context easy to find: **Active** and **Archived** scopes,
  project search, and update times are visible, and the newest project is the first card.
- The workspace has a clear split between **Conversation** and **Project stage**. The disconnected
  state is explicit (**Studio not connected**), and the stage panel says what evidence becomes
  available after connection instead of pretending Studio was inspected.
- Stored replies are generally concise and careful about scope: the latest reply says there were
  no Studio edits or uploads and that appearance was not visually verified. **Activity** and
  **View results** are recognizable places to inspect supporting evidence.
- The dark desktop surface has strong text contrast and the empty composer is visibly disabled for
  sending, so merely opening an old project does not look like it is about to run anything.

## New finding

### P2 — An old image transcript still says “shown” after its result has expired

**Repro:** Open the newest active project, read the latest image reply, then expand its
**View results** disclosure.

**Observed:** The transcript says the silver-grey crescent image was **generated and shown in your
workspace**. The expanded result instead presents an unavailable-image state: **This image is
unavailable. Older temporary previews may have expired.** It also shows **Download unavailable**.
The result card begins immediately above the fixed composer, so its lower portion is not fully
visible in the initial viewport without further scrolling. No stale download action was offered.

**Impact:** A returning customer cannot tell whether Apple completed the image, whether only the
temporary preview expired, or whether the result was never surfaced. The surrounding answer reads
like durable evidence while the only inspectable artifact is gone; this is especially confusing
when reviewing a past run and weakens confidence in the result history.

**Suggested fix:** Keep the historical reply synchronized with asset availability. When a preview
has expired, replace “shown in your workspace” with an explicit **Preview expired** state, explain
the retention window once, and offer only a safe next step such as **Regenerate**. Keep the
expanded result card clear of the sticky composer (or auto-scroll it into view) so the state can be
read without guesswork.

## Verdict and coverage limit

The project list and workspace navigation are understandable, and the stored assistant copy is
short and appropriately cautious about Studio scope. The main customer-facing weakness in this
pass is evidence continuity: the chat claims an image was shown, but the linked historical result
is no longer inspectable. I did not judge fresh generation quality, live Studio evidence, model
quality, connected-project behavior, or mobile layout.
