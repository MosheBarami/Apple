# Customer review — 2026-09-18, round 13

Scope: fresh, bounded, read-only review of Apple at
`https://apple.moshe-barami111.workers.dev` in a dedicated Chrome tab. I followed two journeys:
(1) the signed-in Settings page's asset-source choices and (2) the workspace's Studio onboarding
link through Getting started and plugin availability. I did not toggle a control, save settings,
enter credentials, submit a prompt, generate a code/key, connect an account, spend Credits, upload
anything, or touch Roblox Studio. No code was changed. The tab was closed after inspection.

## Journey 1 — asset sources in Settings

### Settled state observed

- After the page settled, `Where Apple gets assets` said `Apple may use Apple library and Roblox
  Creator Store.` The Apple library and Roblox Creator Store checkboxes were selected; `Make it
  from scratch` and `Ask me again before each build` were not selected. `Save asset sources` was
  disabled, consistent with not having changed anything.
- The live settled descriptions were:
  - `The Apple library` searches props, textures, models and icons with recorded sources and
    licences; builds use Credits; some files need a separate import; results distinguish ready to
    use assets from files that still need import.
  - `The Roblox Creator Store` searches the free Creator Store and references what it finds in the
    place; free assets need no purchase or re-upload; builds still use Credits; creator licences
    apply; availability depends on Roblox permissions and the selected asset.
  - `Make it from scratch` builds geometry out of parts, with simple shapes, and has no external
    assets; it is limited by Credits and what Studio can build.
- The signed-in account had `No Roblox account is connected.` The source choices were still
  selectable, but I did not test whether a build can actually resolve either source without that
  connection.

### Loading/copy inconsistency

The first Settings render exposed a misleading intermediate state before account data settled:
the page said `Apple has no asset sources yet — it will ask before the next build`, exposed all
three source checkboxes as unchecked, and kept `Save asset sources` disabled. The same page later
settled to Apple library + Roblox Creator Store selected. The first render also showed the counts
`510,979 assets` for the Apple library and `81,311 free assets` for Creator Store; after a reload,
the settled copy showed no totals and used the descriptions above instead. This is an observable
loading/copy mismatch, not proof that saved settings were lost: I did not click or save anything,
and the selected state returned after settling. No persistent count discrepancy was independently
verified.

Customer impact: a fast reader can believe their source choices are empty or that Apple will ask
again, and the old totals can disagree with the copy seen a moment later. The page needs an
explicit loading state (or the last known saved state) until the settings request completes, and
one authoritative version of the asset-count copy.

Priority: **P2 — misleading transient state; persistence impact unverified.**

## Journey 2 — Studio onboarding and help

- The workspace's `Getting Apple into Studio` callout said: `Public Studio installation is
  unavailable. You can use chat now; building in Studio requires an existing plugin connection.`
  It offered `Studio installation status` and `Read the docs` links.
- Getting started was unusually explicit: `Public Studio installation is unavailable. Steps 1–2
  work now. Continue to the Studio steps only if you already have a working plugin. New users can
  chat, but must wait for an approved public plugin before Apple can change their place.` Step 3
  says that there is no working public Creator Store installation path and tells a user without a
  plugin to stop and use chat. Steps 4–6 still describe pairing Studio, asking for a build, and
  iterating, but those steps are unreachable for a new user.
- The linked plugin page repeats the blocker: `Public installation is unavailable.` It says Roblox
  removed the previous listing (`132128477945417`), its store URL is not a working install path,
  a replacement is only being tested locally, it is not published or approved for distribution,
  and there is no confirmed release date. The page's future installation steps are therefore
  informational only.
- The docs call `the Roblox Creator Store` the one supported way to get the plugin, but this is
  plain text rather than a working listing link. With public installation unavailable, there is
  no action a new customer can take to reach Studio; no waitlist, notification request, or date is
  offered. This is a confirmed activation dead-end, not a secretly broken link—the status copy
  does warn about it.

Priority: **P1 — known activation blocker for new customers.** The onboarding copy is honest, but
the core promise (building inside Studio) cannot be completed by a new user. Treat the later setup
steps as disabled/future content until an approved listing exists, or provide an actionable
availability/notification path.

## Result

The asset-source controls themselves are legible and the settled selections are discoverable; I
found no evidence that the read-only review changed them. The most concrete Settings defect is the
brief false empty state and inconsistent count copy while data loads. The help journey accurately
documents the current Studio limitation, but a new customer still reaches a hard stop after
creating an account/project because no public plugin can be installed.

## Coverage limit

This was one asset-source Settings journey and one Studio onboarding/help journey. I did not test
source selection saves, a real Roblox connection, asset resolution, Creator Store permissions,
composer behavior, a prompt/build, billing, plugin installation, pairing, or Roblox Studio. No
deployment or code change was made.
