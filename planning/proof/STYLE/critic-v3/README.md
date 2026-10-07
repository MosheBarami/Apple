# Critic v3 on the kit v2 eye-check screens (UI spec v2 §10), 2026-10-07

Six screens (shop, egg shop, pets, daily rewards, HUD, settings) built from the blocks in Play mode on the Showroom at
1920x1080, four shots each (t=0, t=1.75 s, hover, press). Two fresh critics per round (Opus, never the builder), and
ten blind pairwise trials against same-type anchors. Pass: style 8+, no weak signature, ours picked 35 %+.

| Round | Critic A | Critic B | Weak signatures (A / B) | Pairwise (ours picked) |
|---|---|---|---|---|
| 1 | 5 | 5 | 8 / 7 (+1 missing) | 0 / 10 |
| 2 | 6 | 6 | 5 / 4 | 0 / 10 |
| 3 | 6 | 6 | 4 / 3 | 0 / 10 |
| 4 | 6 | 6 | 4 / 2 | 0 / 10 |
| 5 | 6 | 6 | 4 / 3 | 0 / 10 |

Not passed. What changed between rounds is in the kit-v2 commits (PR #115). Every round's critics name the same main
limit: the icon art (one plain Kenney egg in tints, a coin that reads as a nut, matte low-poly renders mixed with flat
glyphs in Settings). The free human-made sources cannot close it; that is owner decision O-ARTIST in
`planning/proof/BLOCKED.md`. The other open items (state hierarchy on daily and pets, slider knobs, a modal scrim,
stronger visible motion) are kit work and continue.

Captures stay in the session scratch and private R2, not in git (they show only our own UI and Kenney CC0 art, but the
critics' anchors are third-party images that never enter the repo).
