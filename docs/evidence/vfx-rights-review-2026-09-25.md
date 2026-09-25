# Owner-listed VFX source review — 2026-09-25

All six VFX links from `packages/asset-library/sources/owner-priority.jsonl` were checked against their first-party source or licence. The per-source dispositions are in `packages/asset-library/sources/vfx-rights-review-2026-09-25.jsonl`. This review advances the rights inventory; it does not claim a customer-ready effect, a Studio insertion, or a visual pass.

| Priority | Measured source and rights | Current disposition |
|---:|---|---|
| 112 | [Yuruzuu's post](https://devforum.roblox.com/t/yuruzuus-open-source-vfx/1840021) permits use in games; it does not explicitly grant Apple redistribution. | Game-use reference only. |
| 113 | The existing Creator Store harvest has asset `8621531267`, zero scripts and ten Decals. The public listing supplied no rehosting grant or live LoadAsset proof. | Creator Store reference; needs real preview and insertion proof. |
| 114 | [BuiltByBit product URL](https://builtbybit.com/resources/free-stylized-fire-vfx.57946/) returned 404. | Unavailable. |
| 115 | [Voxq's FIRE VFX](https://payhip.com/b/XU2RL) is free to download, but its [free-product terms](https://payhip.com/voxq/free-products-terms-and-conditions) forbid redistribution and re-upload. | Exclude from Apple's library. |
| 116 | [Effect Designer Suite](https://github.com/MiaGobble/Effect-Design-Suite) has [GPL-3.0 source code](https://github.com/MiaGobble/Effect-Design-Suite/blob/main/LICENSE). Its roughly 7,000 advertised textures/flipbooks still need per-asset provenance. | Code reference only; no bulk texture import. |
| 117 | [VortexFX's custom license](https://fancyducc.github.io/3D-Particle-System/customprovisionlicense/) permits distribution and commercial project use with credit. All seven [listed templates](https://fancyducc.github.io/3D-Particle-System/templatelist/) parsed as binary RBXM and contained scripts. | Review-only: stripping the scripts has no functional or visual proof. |

The seven VortexFX files were downloaded into the private Apple-OS runtime, not the repository or a Roblox account. The repo's `scan-rbx.luau` parsed every file. Script counts were Fireflies 1, BouncyBalls 1, Lasers 1, Gun 1, AudioOrbs 1, AudioWaveform 2 and Fireworks 1. It wrote stripped copies and recounted **zero scripts left** in each. Fireflies was 6,526 bytes, SHA-256 `d5d71ad591e78f57e0f07dba2f733c8b678e6ec5517b256581b6d8f9f48aaa55`, with 8 instances, 2 Parts and one 2,296-byte Script. The safety scan does not prove any stripped effect still works or looks good. None has been inserted into a customer place.

One new Studio window displayed the Roblox login screen. A separate, already connected window was then identified as `/private/tmp/apple-codex-gauntlet-place.rbxl`, with Apple Studio 1.4.0, edits enabled, and the current sparse garden visible. No reviewed VFX was opened, inserted, played or visually judged in that isolated place during this rights audit.

Next product proof: obtain rights-eligible VFX with real animated previews, select a candidate, then test its cleaned form in an isolated Studio place. A picture of one texture or a successful binary scan cannot close F-059/F-064.
