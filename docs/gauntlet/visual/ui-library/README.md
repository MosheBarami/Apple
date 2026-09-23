# UI library: real-Studio render test (D-UIONLY-1, 2026-09-23)

Every UI component in `packages/asset-library/ui-components.json` was inserted into a private test place,
`Apple-UILibrary.rbxl`, in real Roblox Studio (0.739, macOS), one genre skin at a time. The place was never
saved. No gauntlet round was run, and no other lane's place was touched.

**How it was done**

1. The payloads came from the real tool. The real `insert_ui_component.run` (apps/worker/src/ui-components.ts)
   was run for every (skin, component) pair with an op-sender that records its calls. The exact
   `create_instances` items it produced were collected: class names, props, attributes, and the UIStroke,
   UICorner and UIAspectRatioConstraint children.
2. Studio built those items unchanged. A temporary local plugin, guarded to this one place and deleted
   afterwards, built them with `Instance.new`.
3. Library pixels stood in for uploads. The tool's images are `rbxassetid://` ids, and each one was replaced by
   an EditableImage holding the pixels of that component's library PNG (AssetService:CreateEditableImage and
   Content.fromObject). **No Roblox upload was made for this test.** In production, `insert_ui_component`
   uploads each PNG once to the customer's account (uploadLibraryAsset) and uses the resulting
   `rbxassetid://` id.
4. The HUD board scales each component into a grid cell using the tool's own `size`, `position` and `anchor`
   arguments. The windows boards place each window in a 2x2 quadrant. The loading screen and main menu are
   inserted at their default size and position. `billboard_tag` and `surface_sign` are parented to parts, one
   pair per skin, and all four skins appear in `world-all-skins.png`.

**Result**

- 123 of 123 (skin, component) pairs that exist in a skin were built.
- 1,865 instances were created.
- 82 distinct library images were used.
- 0 prop or build errors were reported by Studio.
- Every "yes" below was checked by eye in the screenshot.
- "not in skin" means the component has no art in that genre's pack, so it was not attempted. Examples:
  `crosshair` and `ammo_counter` exist only in the shooter skin, and `rebirth_panel` only in the simulator skin.
- `shooter-windows3.png` is absent because `quest_list` is not in the shooter skin.

Screenshots are the Studio 3D viewport, captured with `screencapture -l <window>`. They are named `<skin>-<board>.png`.

| Component | Screenshot board | simulator | obby | adventure | shooter |
|---|---|---|---|---|---|
| `currency_counter` | `<skin>-hud.png` | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) |
| `stat_counter` | `<skin>-hud.png` | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) |
| `health_bar` | `<skin>-hud.png` | yes (8 inst, 3 img) | yes (8 inst, 3 img) | yes (8 inst, 3 img) | yes (8 inst, 3 img) |
| `progress_bar` | `<skin>-hud.png` | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) |
| `level_bar` | `<skin>-hud.png` | yes (11 inst, 3 img) | yes (11 inst, 3 img) | yes (11 inst, 3 img) | yes (11 inst, 3 img) |
| `timer` | `<skin>-hud.png` | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) |
| `minimap_frame` | `<skin>-hud.png` | not in skin | not in skin | yes (4 inst, 2 img) | yes (4 inst, 2 img) |
| `notification_toast` | `<skin>-hud.png` | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) |
| `tooltip` | `<skin>-hud.png` | yes (5 inst, 1 img) | yes (5 inst, 1 img) | yes (5 inst, 1 img) | yes (5 inst, 1 img) |
| `button_primary` | `<skin>-hud.png` | yes (5 inst, 1 img) | yes (5 inst, 1 img) | yes (5 inst, 1 img) | yes (5 inst, 1 img) |
| `button_secondary` | `<skin>-hud.png` | yes (5 inst, 1 img) | yes (5 inst, 1 img) | yes (5 inst, 1 img) | yes (5 inst, 1 img) |
| `button_icon` | `<skin>-hud.png` | yes (4 inst, 2 img) | yes (4 inst, 2 img) | yes (4 inst, 2 img) | yes (4 inst, 2 img) |
| `button_close` | `<skin>-hud.png` | yes (4 inst, 2 img) | yes (4 inst, 2 img) | yes (3 inst, 1 img) | yes (4 inst, 2 img) |
| `tab_bar` | `<skin>-hud.png` | yes (13 inst, 2 img) | yes (13 inst, 2 img) | yes (13 inst, 2 img) | yes (13 inst, 2 img) |
| `toggle` | `<skin>-hud.png` | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) | yes (6 inst, 2 img) |
| `slider` | `<skin>-hud.png` | yes (8 inst, 2 img) | yes (8 inst, 2 img) | yes (8 inst, 2 img) | yes (8 inst, 2 img) |
| `dropdown` | `<skin>-hud.png` | yes (21 inst, 2 img) | yes (21 inst, 2 img) | yes (21 inst, 2 img) | yes (21 inst, 2 img) |
| `item_card` | `<skin>-hud.png` | yes (10 inst, 4 img) | yes (10 inst, 4 img) | yes (10 inst, 4 img) | yes (10 inst, 4 img) |
| `mobile_action_buttons` | `<skin>-hud.png` | yes (12 inst, 4 img) | yes (12 inst, 4 img) | yes (12 inst, 4 img) | yes (12 inst, 4 img) |
| `crosshair` | `<skin>-hud.png` | not in skin | not in skin | not in skin | yes (3 inst, 1 img) |
| `ammo_counter` | `<skin>-hud.png` | not in skin | not in skin | not in skin | yes (6 inst, 2 img) |
| `shop_window` | `<skin>-windows1.png` | yes (60 inst, 7 img) | yes (60 inst, 7 img) | yes (59 inst, 7 img) | yes (60 inst, 7 img) |
| `inventory_grid` | `<skin>-windows1.png` | yes (47 inst, 7 img) | yes (47 inst, 7 img) | yes (46 inst, 6 img) | yes (47 inst, 7 img) |
| `settings_window` | `<skin>-windows1.png` | yes (45 inst, 10 img) | yes (45 inst, 10 img) | yes (44 inst, 9 img) | yes (45 inst, 10 img) |
| `dialog_confirm` | `<skin>-windows1.png` | yes (15 inst, 3 img) | yes (15 inst, 3 img) | yes (15 inst, 4 img) | yes (15 inst, 3 img) |
| `rebirth_panel` | `<skin>-windows2.png` | yes (21 inst, 7 img) | not in skin | not in skin | not in skin |
| `daily_reward` | `<skin>-windows2.png` | yes (45 inst, 7 img) | yes (45 inst, 7 img) | yes (44 inst, 7 img) | not in skin |
| `codes_entry` | `<skin>-windows2.png` | yes (17 inst, 6 img) | yes (17 inst, 6 img) | yes (16 inst, 6 img) | yes (17 inst, 6 img) |
| `leaderboard` | `<skin>-windows2.png` | yes (44 inst, 5 img) | yes (44 inst, 5 img) | yes (44 inst, 5 img) | yes (44 inst, 5 img) |
| `quest_list` | `<skin>-windows3.png` | yes (26 inst, 7 img) | yes (26 inst, 7 img) | yes (26 inst, 7 img) | not in skin |
| `loading_screen` | `<skin>-loading.png` | yes (6 inst, 3 img) | yes (6 inst, 3 img) | yes (6 inst, 3 img) | yes (6 inst, 3 img) |
| `main_menu` | `<skin>-menu.png` | yes (17 inst, 2 img) | yes (17 inst, 2 img) | yes (17 inst, 3 img) | yes (17 inst, 2 img) |
| `billboard_tag` | world-all-skins.png | yes (5 inst, 2 img) | yes (5 inst, 2 img) | yes (5 inst, 2 img) | yes (5 inst, 2 img) |
| `surface_sign` | world-all-skins.png | yes (7 inst, 2 img) | yes (7 inst, 2 img) | yes (7 inst, 2 img) | yes (7 inst, 2 img) |

**Visible caveats**

- The Studio view cube (top right) overlaps the right end of `level_bar` on the HUD boards.
- The four billboard tags are world objects, so they also show as small "100" chips behind the HUD and window
  boards. This is expected.
- Hover and pressed images were not shown, because an edit-mode still has no hover. The tool sends them as
  `HoverImage` and `PressedImage`.
