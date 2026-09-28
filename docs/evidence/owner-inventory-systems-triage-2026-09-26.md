# Owner-listed inventory systems: local review, 2026-09-26

Both originals were downloaded from their authors' Roblox Developer Forum attachments into Git-ignored `packages/asset-library/review/`. A read-only Lune deserializer counted Instances and scripts; no embedded script was executed or installed in Studio. Neither file is an Apple backend asset.

| Priority | Original source | Local review filename | Bytes | SHA-256 | Structural scan |
|---|---|---|---:|---|---|
| 21 | [Radial Inventory](https://devforum.roblox.com/t/oop-radial-inventory-inventory-ui-available-to-use/3786366) | `owner-21/RadialInventory.rbxm` | 45,855 | `2e6ca05cd0b7cb092a7f9d674b9a42b904eadc98825c47812f68341a087069a5` | 102 Instances, 14 GuiObjects, 19 scripts |
| 22 | [Inventory and Hotbar System](https://devforum.roblox.com/t/open-sourced-inventory-and-hotbar-system/1780963) | `owner-22/InventoryHotbar.rbxl` | 89,139 | `0bc84761e4697d43bda25d721d219e30f7dbcc9e80704209c57d122ca25646d9` | 614 Instances, 42 GuiObjects, 17 scripts |

Both files have Roblox binary magic. Priority 21 also has a live [Creator Store listing](https://create.roblox.com/store/asset/91165571413792/Radial-Inventory-System), but that is an inventory pointer and was not claimed. Its preview is a dark four-segment wheel, useful as a functional reference but not a complete colorful cartoon UI. Priority 22 is a larger functional sample; its author notes that reset broke the client side, and replies report pickup UI issues. No live playtest or script safety review was performed, so neither is suitable for automatic insertion. The authors allow community use but did not explicitly grant Apple backend rehosting or redistribution.
