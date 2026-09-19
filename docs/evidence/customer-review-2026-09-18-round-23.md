# Customer review — 2026-09-18, round 23

Observed: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one temporary Chrome tab (`1045984448`) against the public site at
`https://apple.moshe-barami111.workers.dev/`. I stayed on the public homepage, documentation
search, and public documentation pages for image/3D capability and Studio setup. I did not sign in,
create a project, submit a prompt, generate or retrieve media, follow a paid route, pair or touch
Roblox Studio, upload, publish, change settings, or expose private content. The temporary tab was
closed after the review.

## What was clear in this pass

- The public docs landing page prominently says **Public Studio installation is unavailable** and
  tells new users to check the plugin status before following setup guides.
- `/docs/getting-started` repeats that only steps 1–2 work for new users and says to stop if there
  is no existing working plugin.
- `/docs/plugin`, `/docs/connect`, and `/status` consistently explain that the old Creator Store
  listing is not a working install path, that no release date is confirmed, and that the pairing
  instructions apply only to an already-working plugin connection. I did not reproduce a new
  Studio-setup contradiction in these public pages.

## Reproduced issues

### R23-01 — Public docs have no 3D capability/help entry (P2)

Repro:

1. Open `https://apple.moshe-barami111.workers.dev/docs`.
2. In **Search the documentation**, enter `3D`.

Observed: the live search returns **Nothing matches “3D”**. The linked Studio setup pages explain
plugin installation and pairing, but the public docs provide no 3D-specific explanation of what the
feature creates, what prerequisite/entitlement it needs, or how a customer should understand its
result. Searching `mesh` likewise returns **Nothing matches “mesh”**.

Impact: a creator deciding whether Apple can make a 3D asset cannot answer that question from the
public help center. The only available guidance is generic Studio setup, so the customer has to
guess whether “3D” means a place edit, a downloadable model, or an unavailable preview feature.

Suggested fix: add a short, directly searchable 3D page or FAQ that states the current availability,
Studio prerequisite, supported output, entitlement/limits, and the safe next step when the feature
is unavailable. Keep the text synchronized with the workspace gate.

### R23-02 — Image capability/availability help is fragmented across unrelated docs (P2)

Repro:

1. Open `https://apple.moshe-barami111.workers.dev/docs`.
2. Search for `image`.

Observed: the search returns exactly three general pages: **Credits & limits**, **FAQ**, and
**Privacy & data**. Their result snippets discuss text-only project-file storage, an optional Open
Cloud key for uploading images/audio, and data-retention details; there is no page titled Images,
Media, or Image generation, and no public capability/availability explanation.

Impact: a prospective creator cannot find one authoritative answer to “Is image generation part of
this preview, and what does Apple support?” The search results mix storage, permissions, and
privacy material without identifying the current feature contract. This is a documentation
discoverability issue only; I did not enter the workspace or test the paid/media flow.

Suggested fix: publish one image/media capability page or FAQ entry, linked from the docs landing
page, that states current availability and prerequisites in plain language, then link to the
separate storage/privacy details.

## Coverage limit

This was a bounded public-help review. The two findings above are documentation/discoverability
issues reproduced on the deployed site. I intentionally did not retest generated-image durability,
paid-media entitlement/checkout, image generation, downloads, or any Studio/plugin action.
