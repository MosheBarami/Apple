# Owner-listed cartoon maps #42–44, 2026-09-26

| Priority | Source | Verified result |
|---|---|---|
| 42 | [Free cartoon/low poly map](https://devforum.roblox.com/t/free-cartoonlow-poly-map/2393415) | The first post invites readers to inspect an existing Roblox experience and shows a preview. It does not provide a map file or a clear reuse grant. Preview: a simple bright simulator shop and park. No download claimed. |
| 43 | [2 Simulator Maps](https://devforum.roblox.com/t/2-simulator-maps/1567893) | The author links Creator Store model `8120815259`; the map uses credited third-party asset and texture packs. Preview: bright cartoon cliffs, a fountain and shops, with sparse detail. No local file or insertion verified. |
| 44 | [Tycoon Map and Assets](https://devforum.roblox.com/t/tycoon-map-and-assets/2188535) | The author provides two direct RBXL attachments, saying the assets are free to use and edit. The park and pond preview is a promising low-poly cartoon environment. It is not a complete playable tycoon or proof of commercial visual quality. |

## Files from #44

| Downloaded file | Official author attachment | Bytes | SHA-256 |
|---|---|---:|---|
| `review/owner-44/Tycoon-Map.rbxl` | [Tycoon Map.rbxl](https://devforum.roblox.com/uploads/short-url/qIW7OQlP0Opv6HQq1yRERoOdDHO.rbxl) | 484,959 | `e95cfbc7203be17a0955b3acb6eb56b0b092dcbd03f564f20d6cb42debd8a44a` |
| `review/owner-44/Tycoon-Assets.rbxl` | [Tycoon Assets.rbxl](https://devforum.roblox.com/uploads/short-url/mKiIQYOa4lxiKkSty7tNXXk4t2p.rbxl) | 114,802 | `01a0d285b5eeb3fa06b43a8d1d673ae1596ca689b830ec37a1f47e20b2b56ddf` |

Both files have the Roblox binary place signature. The repository's `scan-rbx.luau` deserializer read them without running any contained code. The map has 1,464 Instances, 1,202 parts, 397 MeshParts and **zero scripts**. The assets place has 476 Instances, 358 parts, 10 MeshParts and **24 Scripts**. This contradicts the author's statement that the resources contain no scripts. The scanner found no listed backdoor pattern in those scripts; that is not a full code audit.

Script-stripped local review copies were produced: `Tycoon-Map-stripped.rbxm` (439,459 bytes, SHA-256 `a5c2057edd50ac759bad5481d6f69e9a8b694a84face76c07c51a64bb712cd54`) and `Tycoon-Assets-stripped.rbxm` (73,191 bytes, SHA-256 `3e73bf44511a5f1cf04fc2f173c2bc4eba5711e64daa5f631385129cc69693ce`). The scanner reports zero Scripts left in both. None was installed in Studio or uploaded to Roblox. The files are Git-ignored local review copies; the dashboard verifies each downloaded original separately. Apple backend redistribution rights and a live insertion route have not been established.
