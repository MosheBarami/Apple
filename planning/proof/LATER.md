# Later (not blockers; owner rule 2026-10-05: one line each, fix after M7 or when touched)

## owner-update (#33)
- A wipe can write a `roblox_wiped` pointer for an account Auth no longer has; nothing sweeps it.
- Guard gap: the roblox-oauth.ts header can drop the metadata-update (PUT) use without a test failing.
- Guard gap: `robloxLinkHeld` can ignore the `roblox_wiped` pointer without a test failing.
- /privacy and the data page refer to the deletion section for the profile-row removal, which that section does not list.
- AI Gateway retention deletes at most 10,000 logs a night; a deletion that removes nothing raises no alarm.
- LEGAL-CLAIMS row F1 still says the secret key makes three Auth calls and never a table query.
- The retention step covers only AI_GATEWAY_ID; the `golem` and `default` gateways are pruned by hand until deleted (2026-10-11).

## app (m2-app)
- Guard gap: the Roblox anchor's line height is no longer held by the restated sheet test.
- Guard gap: malformed LEGAL-CLAIMS cites inside a code span (en dash range, `:854:`) are skipped, not failed.
- The finished-turn "connect Studio" line can flash for a connected Studio while the page loads.

## m3-harness
- A signal during the poll's retry back-off is noticed only after the back-off (up to ~30 s); README says "at once".
- The 60 s never-started window is not pinned by a test.

## site (m2-site)
- Fix cycle 2's checker did not finish (stopped by the owner's new rules); its findings, if any, were not collected.
- CodeQL on #38 (2026-10-06) re-surfaced 23 pre-existing alerts (unchanged lines on main), 20 in tests; product ones: `json()` in session.ts (stack-trace exposure, flagged on a JSON helper), `isSmallTalk` regexes in packages/shared (polynomial regex on user text). Review when touching those files.

## StudKit (2026-10-06, after the style-8 pass; planning/proof/STYLE/kit/README.md)
- Gloss on tabs and tiles still reads faint to some critics; try a stronger top band on small faces only.
- Big numbers get a 7 px outline that reads as a dark pill; cap the outline lower for text over 40 px.
- Tile icons could overflow their tiles more, like R01's basket.
- Italic card titles (R01) need `FontFace` on the plugin allowlist (a Font value type in the op protocol).
- Weaker pack icons: clover (flat), bolt, rebirth, lock (realistic), map (flat parchment), paw (dark grey).

## World kit (W03 render, 2026-10-06, own read about 4-5 on style)
- Grass reads neon: the CandyColour saturation (+0.15) on top of #4FAE2C. Calm the ground or the grade for worlds.
- The scene is sparse and the stall small next to the trees: a zone needs a denser centre and a bigger landmark.
- The stall's floating title sits over the trees from the spawn view; place titles by the landmark's facing.
- CI checkout: the tree is 311 MB (asset-library 120 MB, docs/evidence 59 MB, docs/gauntlet 30 MB); one shard's shallow fetch once took 4 min. Sparse checkout of docs/evidence and docs/gauntlet in the test jobs if it repeats.
- check-escape-hatches: the checker still hangs now and then in a spawn (60 s locally on 2026-10-06, then the retry passed); the cause is unknown (see the notes in the test).
- Menu (U02 render after the fix): the backdrop is a plain cyan gradient with no scene, the buttons are small (30 % wide), and the dark lip along the bottom is heavy.
- The white egg (pack `egg`, 4829244230) is low resolution: its outline is jagged at 100 px and up (header, featured). Find a sharper tintable egg.
- Lighthouse on studpilot.app (2026-10-06, after #110/#111, measured from the Mac, noisy): mobile Home 71-80, Pricing 88; desktop Pricing 99, Home 77-99. Accessibility, best practices and SEO 100. Run PageSpeed Insights for a stable number; next levers: the 150 KB inlined CSS and the Next/React baseline JS.
