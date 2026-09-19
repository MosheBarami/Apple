# Customer review — 2026-09-18, round 32

## Scope and method

I used my existing Chrome tab (`1045984316`) against the deployed Apple site
([https://apple.moshe-barami111.workers.dev/](https://apple.moshe-barami111.workers.dev/)). This
was a short, read-only review of the public Docs search and the signed-in Settings asset/source
copy, focused only on whether a creator can tell the difference between assets already in Roblox,
Apple-library files that still need import, Creator Store references, from-scratch geometry, and
generated images.

I read the public Docs overview, Credits & limits, Privacy & data, and FAQ pages. I also read only
the asset-source and Roblox-permission labels in the already-authenticated Settings page; I did not
copy account, project, or other private content. I searched Docs for `Apple library`, `owned`, and
`reuse`, and Settings for `asset`, `import`, and `generated`. I did not toggle a checkbox or save
settings. I did not enter credentials, send a prompt, generate a result, spend Credits, upload or
publish anything, pair Studio, or open Roblox Studio.

## New finding

### P2 — Asset origins are described in separate places, so “what will Apple use?” is not answerable before a build

**Observed in Settings:** After the page settled, `Where Apple gets assets` offered three source
checkboxes:

- `The Apple library` — a catalog of props, textures, models, and icons with recorded sources and
  licences; some files need a separate import; results distinguish ready-to-use assets from files
  that still need import.
- `The Roblox Creator Store` — searches the free store and references what it finds directly in the
  place; no purchase or re-upload; creator licences apply.
- `Make it from scratch` — builds geometry out of parts, with no external assets and simpler shapes.

The same Settings page puts assets already owned by the creator somewhere else, inside the Open
Cloud key permissions: `See what you own` says Apple can list assets already in the Roblox account
“so it can reuse them instead of making new ones.” A separate permission, `Read your assets`, says
Apple can look up names, ids, and upload status. There is no `Use my existing Roblox assets` choice
in the main source picker, and the two permission labels are easy to read as duplicates.

Generated images are also outside this vocabulary. The public Credits page says `Generated images
are separate: download them from their result in the conversation. Roblox models live in your
place`; Privacy & data and the FAQ separately describe optionally uploading generated images/audio
to Roblox with an Open Cloud key. Settings has no generated-image entry, and searching Settings for
`generated` returned `Nothing here matches`.

**Discoverability check:** The public Docs search returned `Nothing matches` for `Apple library`,
`owned`, and `reuse`. Searching `Creator Store` returned plugin-install pages, not an asset-source
guide. The public docs therefore explain individual pieces, but do not expose the Settings source
picker or a single provenance/media map before a customer starts a project.

**Customer impact:** A creator can reasonably mistake the free Creator Store source for reuse of
assets already in their account, assume an Apple-library result is already in the place because the
word “import” is only visible in Settings, or treat a generated image as another Roblox model
asset. They also cannot tell why two similarly named Roblox permissions are different or which one
is required for reuse. The current wording is mostly accurate, but the product makes the customer
assemble the asset-origin model from unrelated settings, privacy, and quota paragraphs.

**Suggested fix:** Add a public, linked “Assets and media” help page and link it from both Docs and
the Settings card. Use one short table: existing Roblox assets (reuse existing ids and required
permission), Apple library (source/licence and ready-vs-import-needed status), Creator Store
(free reference, creator licence), from scratch (parts), and generated images/audio (conversation
result; optional Roblox upload; separate from Roblox models). Rename or add helper text for `Read
your assets` versus `See what you own` so their distinct purposes are explicit. Keep the existing
irreversible-upload warning. This would clarify provenance without promising a 3D capability that
was not tested here.

## What passed in this pass

- The settled Settings source card is legible, the three source descriptions are concrete, and
  `Save asset sources` stayed disabled because I made no changes.
- The Apple-library copy explicitly says that some files require a separate import and that results
  distinguish ready-to-use files from files still needing import.
- The public Credits page explicitly separates generated images from Roblox models and says Roblox
  models live in the place. The FAQ explains that an Open Cloud key can upload generated images and
  audio to the creator's own Roblox account rather than Apple's.
- I found no evidence that this read-only pass changed settings or external state.

## Coverage limit

This is a copy/discoverability finding at the public Docs and Settings boundary. I did not run a
build, inspect a real result card, resolve an Apple-library item, import a file, query an owned Roblox
asset, or test an Open Cloud permission. I am not re-reporting the already-known plugin/checkout
blockers or the previously noted lack of public 3D documentation.
