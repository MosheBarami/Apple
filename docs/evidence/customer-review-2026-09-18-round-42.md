# Customer review — 2026-09-18, round 42

## Scope and method

- Read-only review of `https://apple.moshe-barami111.workers.dev/app` in Chrome, signed in to the existing account.
- Checked the workspace landing page and the existing Settings page for asset-source and Roblox-permission discoverability.
- Did not open a project conversation or inspect project content. Did not pair Studio, open dialogs, type into forms, toggle controls, save, generate, pay, change credentials, upload, or download.
- Closed the review tab after observation.

## Observed evidence

### Workspace landing (`/app`)

- The visible workspace showed the `Projects` list, project-scope tabs (`Active`, `Archived`), project search, three existing project cards, and the `Getting Apple into Studio` notice.
- The visible workspace navigation had `Usage and Credits` and `Settings` links.
- No asset-source status, selected-source summary, source-permission link, or “where assets come from” label was visible in the workspace landing state.

### Settings (`/app/settings`)

- A `Where Apple gets assets` section exists below Connections/API keys/Discord and above Notifications.
- The section says: `Apple may use Apple library and Roblox Creator Store.`
- The two source checkboxes were checked:
  - `The Apple library` — catalog of props, textures, models and icons with recorded sources and licences; builds use Credits; some files need a separate import; results distinguish ready-to-use assets from files needing import.
  - `The Roblox Creator Store` — searches the free Creator Store and references what it finds directly in the place; free assets need no purchase or re-upload; builds still use Credits; creator licences apply; availability depends on Roblox permissions and the selected asset.
- `Make it from scratch` was unchecked. Its text says Apple builds geometry out of parts, with no external assets, but Credits/time are used and the result is limited to simple shapes and what Studio can build.
- `Ask me again before each build` was unchecked.
- `Save asset sources` was disabled, so the displayed source state had no unsaved change at the time of review.

### Roblox connection permissions in the same Settings page

- `Your Roblox account` showed `No Roblox account is connected.`
- Under `What Apple may do`, the following were unchecked:
  - `Read the Creator Store — not used yet`; the description says the free store is public and needs no key, so this permission is optional.
  - `Read your assets`.
  - `See what you own`.
- The same permission panel also showed unchecked “not used yet” rows for publishing, live-game messages, and game-pass creation, plus a `Connect` button.

## Harsh customer-facing findings

1. **Asset provenance is discoverable only after going to Settings.** The workspace landing view exposed no source summary or entry point named for assets; the controls were found by opening the generic `Settings` link. A user who is already in a project/build flow has no visible source state in the workspace evidence reviewed here.

2. **Source policy and Roblox permission status are separated and easy to conflate.** The source policy shows `The Roblox Creator Store` checked, while the separate permission row says `Read the Creator Store — not used yet` and is unchecked, with no Roblox account connected. Both are in Settings but in different sections. The page does not visibly explain, at the point of the checked source choice, whether this means the source is immediately available, only selected as a policy, or gated until a Roblox connection exists.

3. **The checked source state does not visibly identify which result will be ready to use.** The Apple-library copy says some files need a separate import and that results distinguish ready-to-use assets from files needing import, but the settings view itself shows no example/result indicator or link to that distinction. The Creator Store copy says availability depends on permissions and the selected asset, but does not expose the current availability for this account (which has no Roblox connection).

4. **The “ask before each build” safeguard is adjacent to source selection but not enabled.** A user can see the option, but the displayed state is unchecked; there is no visible build-level source confirmation in the workspace state reviewed.

## Boundary of claim

These are observations of the rendered live UI and accessibility state only. This review did not test an actual asset search/build, did not verify backend enforcement, and did not change the account or settings.
