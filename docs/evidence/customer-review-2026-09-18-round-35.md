# Customer review — 2026-09-18, round 35

## Scope and method

I used one fresh Chrome tab against the deployed public Apple site
([https://apple.moshe-barami111.workers.dev/](https://apple.moshe-barami111.workers.dev/)). This was
a short, read-only pass through the public documentation and recovery path: Docs overview,
Troubleshooting, and Status. I did not sign in, create an account, open a project, open a pairing
dialog, enter a code, submit a form, search Docs, send a prompt, spend money, upload/download
content, or open Roblox Studio. I am not re-reporting the known plugin-distribution or
paid-checkout blockers.

## New finding

### P2 — Status-page recovery destinations are rendered as non-clickable text

**Repro:**

1. Open [`/status`](https://apple.moshe-barami111.workers.dev/status).
2. In the first **Known issues** card, **Public Studio plugin installation is unavailable**, read
   the **What to do** paragraph.
3. In the second card, **An offline connection does not prove the plugin is missing**, read its
   **What to do** paragraph.

**Observed:** The first recovery instruction says **“See /docs/plugin for current availability”**
and the second says **“For a missing panel, see /docs/troubleshooting”** (and later **“check
/docs/plugin”**), but none of those destinations is an anchor in the card. The browser
accessibility tree exposes the card copy as text, with no link named “Plugin” or “Troubleshooting.”
Read-only DOM inspection confirmed the text is inside a `<p class="known__fix">`, not an `<a>`;
the only `/docs/plugin` anchor on the page is the unrelated footer link. The user must manually
edit or guess a URL, or navigate back to Docs, exactly when the status page is supposed to be the
recovery hub.

**Expected:** A status-card workaround should expose a real, keyboard- and pointer-activatable
link to the referenced public page (with a descriptive name such as **Check plugin availability**
or **Open troubleshooting**).

**Impact:** A customer arriving at Status after a connection or installation failure cannot follow
the prescribed next step directly. This adds avoidable navigation friction and is particularly
confusing because the same page makes the paths look like explicit instructions, while the rest of
the site uses working links for the same destinations. This is a navigation/accessibility defect,
separate from the already-known plugin availability state.

**Suggested fix:** Render the two recovery destinations as inline links in the known-issue data (and
keep the surrounding explanatory text). Add a regression check that every `/docs/...` path in a
status known-issue “What to do” paragraph is backed by an anchor, not prose alone.

## What passed in this pass

- The Docs overview clearly warns that public Studio installation is unavailable and points to the
  plugin-status page.
- The Troubleshooting page contains concrete recovery guidance for expired codes, connectivity,
  stopped builds, model failures, and unwanted changes, with working links to its main destinations.
- The Status page loaded, reported **API operational**, showed a recent latency/check time, and
  clearly separated API health from Studio/build/billing health.
- The Status page’s footer still exposes working Docs, Studio plugin, and Status navigation links;
  the defect is specifically the missing inline links in the known-issue recovery copy.

## Coverage limit

This was a short public desktop review. I did not test mobile breakpoints, anonymous auth, private
project controls, pairing, billing, generated work, or a real Studio connection. No external or
account state changed.
