# Roblox Studio object icons — provenance

`studio-icons-dark.png` and `studio-icons-light.png` are sprite strips of Roblox Studio's own
Explorer object icons, one 32×32 cell per class, in the order of `STUDIO_ICON_CLASSES` in
`src/components/studio-icon-model.ts`. They are built by `apps/web/scripts/build-studio-icons.py`.

## Source

- Files: `/Applications/RobloxStudio.app/Contents/Resources/content/studio_svg_textures/Shared/InsertableObjects/{Dark,Light}/Standard/<ClassName>@2x.png`
  from the owner's Roblox Studio install on his Mac, copied on 2026-09-23.
- The owner pointed at `~/Desktop/StudioContent.zip` as his Studio content. That file is an 800-byte
  macOS alias, not an archive; it points at `RobloxStudio.app/Contents/Resources/StudioContent.zip`,
  which no longer exists (Studio now ships that content unpacked). The icons were taken from the
  same install the alias points into.

## Licence

- **Owner: Roblox Corporation.** These are Roblox's icons. No open licence covers them, and no
  openly licensed copy of Studio's real class icons was found:
  - Vanilla 3 by Elttob (devforum.roblox.com/t/935745, elttob.itch.io) — a community redraw,
    free for personal use only; not licensed for use in another product. Not used.
  - LockouDev/Roblox-Studio-Icons-VSCode (GitHub) — its code is MIT, but its README states the
    icons are the property of Roblox Corporation. Same icons, same owner. Not used.
  - Roblox/creator-docs (CC-BY-4.0) — carries no class icons.
- **Used under the owner's decision D-VISION-1** (docs/autonomy/DECISIONS.md: "Roblox icons within
  brand guidelines"): object/class icons only, shown beside the Roblox objects they name, to help
  a Roblox creator recognise what was changed in their own place. **Never the Roblox logo**, never
  recoloured, never presented as our own mark.
- To remove them: delete this folder, `src/components/studio-icon*.{ts,tsx,css}` and their three
  call sites (ai-elements/tool.tsx, ws/studio-activity.tsx, pairing-dialog.tsx); the rows fall back
  to their line icons.
