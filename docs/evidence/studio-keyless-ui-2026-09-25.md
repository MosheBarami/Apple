# Keyless library UI in the isolated Studio place — 2026-09-25

The owner-paired Studio place for this check was the local isolated file
`/private/tmp/apple-codex-gauntlet-place.rbxl`. This is not a published Roblox
experience. Apple MAX's first full-game run was stopped after 354 credits: its
tool trace had 60 calls and many repeated `insert_ui_component` failures. The
component skins referred to CC0 PNG files without Roblox image IDs, and the
owner's account had no Open Cloud `asset:write` key. The run did not complete a
game, so F-059 and F-064 remain open.

Commit `32a65f0` makes `insert_ui_component` render an image with no existing
Roblox ID from that component's library recipe: its measured centre/edge
colours, native rounded shape, library font and a glyph for a missing icon.
The resolver uses shared IDs, Creator Store IDs and the owner's existing KV
cache. It never begins a permanent upload. The agent's direct GUI creation
routes remain refused.

Verification:

- Red-first focused tests failed on the original missing-ID refusal and
  automatic-upload behavior, then passed 16/16 after the fix. Every component,
  genre and colour recipe was checked against the plugin's creatable classes
  and properties without an image ID.
- Worker TypeScript typecheck passed. The full local worker suite passed
  4,192/4,192. A clean `git archive` export passed 4,181 tests, skipped two,
  and failed zero. The worker was deployed from that export, and `/api/health`
  reported `buildSha: 32a65f0` after deployment.
- The live admin tool route invoked the same `insert_ui_component` tool on the
  paired Studio session. `GardenCoins` and `GardenShopWindow` were inserted
  successfully; the shop reported 79 instances and `library_native` renderers.
  The Studio viewport visibly showed the currency chip and a green shop with
  three seed rows, prices, buy buttons and a close control. No asset was
  uploaded during these calls.

Limit: the native glyphs are a functional fallback, not a replacement for the
original illustrated CC0 art. The shop's item icons rendered as generic glyph
tiles, and the game world was visibly sparse. A continuation Apple MAX run was
started to wire UI to gameplay and test planting, buying, harvesting and
selling. Passing the component tool does not prove the game is finished or
visually competitive.
