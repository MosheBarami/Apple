# Customer review — 2026-09-18, round 30

## Scope and method

I used one fresh temporary Chrome tab (`1045984480`) against the deployed public site
(`https://apple.moshe-barami111.workers.dev/`). This was a bounded, read-only pass focused only
on public navigation, dead ends, and recovery after navigation. I visited the public home page,
Docs overview, the Updating the plugin and Connect a project pages, Terms, and the sign-in link.
I also exercised the Docs search field, browser Back, and the public Docs skip link with the
keyboard. The temporary tab was closed after the review.

I did not enter credentials, inspect private project/account data, submit a form, send a prompt,
generate or pay, pair Studio, touch Roblox Studio, upload or publish anything, or re-score the
known public plugin and paid-checkout blockers or previously reported stale billing/changelog
copy.

## What passed in this pass

- The public Docs overview exposes working links for Overview, Getting started, plugin status,
  project connection, models, Credits, troubleshooting, privacy, FAQ, and source-build guidance.
  The page repeats the installation-unavailable notice and gives a visible status link before the
  setup links.
- The Docs search was recoverable: entering `plugin` produced six result links; opening a result
  and using browser Back returned to the same Docs page with the `plugin` query and result list
  still present.
- The public Docs skip link was keyboard reachable. After `Tab` → `Enter`, the URL became the
  page's `#main` target; the next `Tab` landed on the Docs search field rather than restarting in
  the global navigation. I did not reproduce the workspace skip-link issue reported on private
  `/app` surfaces.
- The public Connect a project and Updating the plugin pages both had visible Docs navigation,
  home, pricing, sign-in, and account links, plus a troubleshooting/reconnect link where relevant.
  The Terms page also retained the primary and footer navigation, so it was not a legal-page dead
  end.
- Following the public Sign in link from Docs redirected to `/app` because this browser profile
  already had a session. I stopped at that boundary and did not inspect the authenticated workspace
  or private data.

## Verdict

No new reproducible public navigation, dead-end, or recovery defect was found in this bounded
round. The checked public Docs search/back path and keyboard skip path recovered as expected, and
the public legal and setup pages retained return navigation. This is evidence about the observed
deployed pages only; it does not verify anonymous login, account recovery, paid checkout, plugin
installation, Studio pairing, or any authenticated workspace behavior.

