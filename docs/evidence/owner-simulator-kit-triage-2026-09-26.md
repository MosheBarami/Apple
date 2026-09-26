# Owner-listed simulator kit #29, 2026-09-26

Source: [Roblox GUI Maker Simulator Pro UI Kit](https://robloxguimaker.app/kits/simulator-kit). Five screens were opened in the official editor with its `sunset` theme. Each was exported using the visible `Export JSON` and `Download .lua` controls; filenames below are the local Git-ignored review copies. No downloaded Luau was executed or installed in Studio.

| File | Bytes | SHA-256 |
|---|---:|---|
| `simulator-main-menu.json` | 5,995 | `e13de620ebd6dff95408520ac86c43d08ae48fbc2a2c9bfe5ebd2298bb64721c` |
| `simulator-main-menu.lua` | 7,413 | `b1414a621e7d99d3e4514fbc7821cf42096687c2e3940d291888b3d8c40c3c67` |
| `simulator-shop.json` | 5,798 | `731f087275a1a899001d179d371fe08dd24fb2194482dc574bb3a630fff033bc` |
| `simulator-shop.lua` | 7,196 | `7ddfa8b64d4e44160ba904c55a47bd65587190ee665200ae7b53a2d0eddda4a6` |
| `simulator-game-pass-shop.json` | 11,147 | `15a1323b130846e3f6b994e2f0b66c4c54aa9c67af654a79c5ef7f869890c68a` |
| `simulator-game-pass-shop.lua` | 14,360 | `fc46bccc1d3d0825d542d80852db418c159db3ca95b07a8cd6f3f3fe036e142c` |
| `simulator-daily-rewards.json` | 16,951 | `5c39c1ce5e868a6d4874af0412ef18b339eb412ad913f0487df46d16dd56ed3b` |
| `simulator-daily-rewards.lua` | 21,494 | `d92c2f02bed4651b5466ceeac49a0b9997d45c65777d4ba75bcb7e9f66b5499f` |
| `simulator-settings.json` | 6,169 | `efa691586a55a86c2e8474063df0b71686cb107754b05e8f6a56bd7a4a45b369` |
| `simulator-settings.lua` | 6,984 | `8e008099434228beba08d02e8600e87e4fb802daf75cfeb814636966313a6309` |

All five JSON documents parse. All five Luau exports pass `luau-compile -O0`; a static text scan found no `require`, `loadstring`, `HttpService`, `DataStoreService`, `RemoteEvent` or `MarketplaceService` references. This is not a runtime security or gameplay test. The preview shows five coherent warm-theme layouts, but they are simple panels and text, without the illustration or rich layered style needed for the owner's commercial cartoon standard.

The [site terms](https://robloxguimaker.app/terms) allow commercial Roblox use of exported designs made in the editor, while prohibiting rehosting the editor. Whether those terms allow Apple to redistribute these unmodified built-in templates as a backend kit is not established. The files therefore remain local review only. The live Apple HQ dashboard lists all ten separately with verified size/hash and no backend insertion route.
