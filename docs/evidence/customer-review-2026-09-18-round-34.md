# Customer review — 2026-09-18, round 34

## Scope and method

I used one disposable Chrome tab against the deployed public site
([https://apple.moshe-barami111.workers.dev/](https://apple.moshe-barami111.workers.dev/)). I read
the public Docs overview, Getting started, Install the plugin, Connect a project, FAQ, Models, and
Credits & limits pages. I followed the visible Getting started link into Connect a project and
checked the default desktop keyboard path: Tab reached the skip link, primary navigation, theme and
sound controls, and docs search; activating Skip to content moved the URL to `#main`, and the next
Tab reached the documentation search field. Headings, nav landmarks, link names, and the search
field had accessible names in the browser accessibility tree.

This was read-only. I did not sign in, create a project, open a pairing/connect dialog, enter a
code, submit a form, search Docs, send a prompt, spend money, upload/download content, or open
Roblox Studio. I am not re-scoring the known public-plugin or paid-checkout blockers.

## New finding

### P2 — Connect-a-project docs drop the availability warning and read as actionable

**Repro:**

1. Open [`/docs/getting-started`](https://apple.moshe-barami111.workers.dev/docs/getting-started). The
   page visibly says **“Public Studio installation is unavailable”** and tells new users to stop
   unless they already have a working plugin.
2. Follow its **Connect a project** link (or choose that item in the Start here sidebar).
3. Read the top of [`/docs/connect`](https://apple.moshe-barami111.workers.dev/docs/connect).

**Observed:** The destination starts with **“Connecting links the Apple panel in this Studio
window…”** and immediately gives four Studio/pairing steps: open a place, click Apple in Studio,
press **Enter pairing code** in the web workspace, and type the code into the plugin. It has no
availability callout or link back to the plugin-status page. The same public docs set does show the
unavailable state on Getting started and Install the plugin, so the warning is lost specifically
along this normal navigation path.

**Expected:** Any Studio-dependent page reachable from the newcomer setup path should retain the
same availability status at the top and tell a user without an existing plugin what they can do
now.

**Impact:** A new creator who follows the recommended setup and clicks through can land on a page
that looks like a live, executable pairing workflow, despite the preceding page saying the public
installation path is unavailable. This is a navigation/context failure and can waste time or make
the product look internally contradictory; it does not imply that pairing itself was attempted.

**Suggested fix:** Reuse the shared public availability callout on `/docs/connect` (with a direct
link to `/docs/plugin`) and visually gate the numbered Studio steps behind “already have a working
plugin.” Keep the detailed steps for existing installations.

## What passed in this pass

- The Docs sidebar exposed clear groups and page links; the active Getting started page was visibly
  distinct, and the route from it to Connect a project worked.
- The skip link and default desktop Tab order were usable. The docs search field, navigation
  landmark, headings, links, and theme/sound controls were exposed with meaningful accessible
  names.
- Getting started and Install the plugin clearly state the current public-installation limitation;
  the finding is the missing context on the Connect destination, not a new report of that known
  blocker.

## Coverage limit

This was a short public desktop review. I did not test mobile breakpoints, anonymous auth, a real
project, pairing, Studio, billing, or generated work. No external or account state changed.
