# Harsh customer review — asset discovery and onboarding docs (round 39)

Date: 2026-09-18 (Asia/Jerusalem)

## Scope and method

I used one fresh Chrome tab (`1045984513`) against the deployed public site,
`https://apple.moshe-barami111.workers.dev/`, then closed the tab. This was a bounded,
read-only newcomer pass focused on whether the public surface explains what assets are available
and how a creator can reuse assets they already own. I reviewed the homepage, `/docs`,
`/docs/getting-started`, `/docs/plugin`, `/docs/credits-and-limits`, and
`/docs/privacy-and-data`. I also used the visible docs search for `asset`, `upload`, `reuse`,
`asset library`, `Creator Store`, `image`, `own`, and `asset ID`.

I did not sign in, create an account or project, send a message, open a pairing dialog, pay,
generate, upload, download, or use Roblox Studio.

## Observed facts

- The homepage and primary docs navigation expose Product, Models, Pricing, and Docs, but no
  Assets, Library, catalog, or import/reuse entry point.
- The docs navigation has sections for Start here, Using Apple, Keeping it working, Trust, and
  Developer; it has no asset/library section.
- Searching the deployed docs for `reuse` and `asset library` returned **Nothing matches**.
  Searching for `asset` returned four pages, with snippets about plugin source, text-file limits,
  privacy, and troubleshooting—not a catalog or user workflow. `upload` returned FAQ, privacy,
  and troubleshooting only.
- `/docs/credits-and-limits` says workspace Files are text-only, generated images are downloaded
  from their result, and **“Roblox models live in your place.”** It gives no steps for selecting,
  naming, or referencing an existing model, decal, audio asset, or Creator Store item.
- `/docs/privacy-and-data` says Roblox gets **“the assets you ask Apple to upload”** to the user's
  own account under the user's Open Cloud key, if supplied. This describes ownership/privacy, not
  how to reuse an asset already owned by the creator.
- `/docs/getting-started` covers creating a workspace, connecting Studio, and asking for a build,
  but contains no asset discovery or reuse example.
- `/docs/plugin` visibly states **“Public installation is unavailable”** and says the numbered
  installation instructions apply only after an approved listing is available.

## New findings

### P2 — Public onboarding gives no asset-discovery or asset-reuse path

**Repro:** Start at the homepage, open Docs → Getting started, then search the docs for `asset`,
`reuse`, and `asset library`.

**Observed:** There is no public asset catalog/link, and the search has no match for `reuse` or
`asset library`. The only asset-related copy says assets/models live in the connected place or
that Apple can upload assets under the user's key; it never says what sources Apple can search,
how to name or reference an existing asset, whether an asset ID is accepted, or where to put an
owned model/audio/decal for Apple to use.

**Impact (inference):** A newcomer with an existing Roblox asset cannot form a reliable first
request. They must guess that Apple can see it, guess the terminology/ID syntax, or spend a
request discovering a workflow that the docs should explain. A newcomer who expects a built-in
library cannot tell whether one exists at all.

**Suggested fix:** Add one public “Assets” guide linked from Getting started and the workspace
entry point. State the supported sources and limitations, show a concrete existing-asset request
(including the accepted ID/name/path syntax), explain how Creator Store and user-owned assets are
distinguished, and state what Apple can or cannot upload and why.

### Known blocker observed in the same onboarding path

The public plugin is currently unavailable, so a new customer cannot complete any in-Studio asset
workflow even if they infer the prompt. This is explicitly disclosed on `/docs/plugin`; I record it
as context, not as a new regression in this round.

## Verdict and coverage limits

For this narrow public-docs pass, asset discovery and reuse are not discoverable. The site explains
where generated/project data lives and the privacy boundary around uploads, but not how an ordinary
creator can find or reuse an existing Roblox asset. I did not test private workspace asset tools,
any successful upload, or a connected Studio place.
