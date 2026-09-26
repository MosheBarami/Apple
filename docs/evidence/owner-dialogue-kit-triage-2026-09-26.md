# Owner-listed dialogue kit and adjacent sources #28, #30–32, 2026-09-26

| Priority | Owner source | Observed result |
|---|---|---|
| 28 | [BuiltByBit Tower Defense UI](https://builtbybit.com/resources/tower-defense-ui.58820/) | After the site's security verification, the page reported “The requested resource could not be found.” No file or preview was available; no download was claimed. |
| 30 | [Open Source Horror Game GUI](https://devforum.roblox.com/t/open-source-horror-game-gui/1606871) | First post links Creator Store model 8401489969. Inventory pointer only; horror style is outside Apple's colorful cartoon scope. |
| 31 | [Dialogue Kit V2.5](https://devforum.roblox.com/t/dialogue-kit-v25-fast-easy-interactive-dialogues-and-events/3548230) | First post links Creator Store models 18835619908 and 105655496665616. No author file was downloaded or inserted. |
| 32 | [MrDialogue v1.0.0](https://devforum.roblox.com/t/mrdialogue-v100-build-complete-and-modular-branching-dialogues-with-conditions-actions-custom-uis-and-more/4884794) | The author links public [source on GitHub](https://github.com/arakoDev/MrDialogue) under MIT, plus Creator Store model 105201219018918. |

For #32, the official GitHub `main` ZIP was downloaded to Git-ignored `packages/asset-library/review/owner-32/MrDialogue-main.zip`: **161,631 bytes**, SHA-256 `932afb9c6649b40062905305ac46e94aa00e7570594864c8bb678e61c6616bf4`. The GitHub head at review time was `72bc9f18b88b101b0d09599a7c3b216a3fee14ec`; the archive contained 49 files, including 14 Luau files and the MIT LICENSE. ZIP paths were checked for traversal and no code was executed.

The included `src/Assets/DialogueGui.rbxm` was extracted as `review/owner-32/DialogueGui.rbxm`: **15,776 bytes**, SHA-256 `bba98d595cd893fae534dfb0468ab2a7b42cbd3c635fe539f39ee023d324fcd1`. A read-only Roblox deserializer found 21 Instances, 10 GuiObjects and **zero embedded scripts**. The framework code is still unreviewed for production use, and the small included UI has no verified commercial cartoon visual result. Nothing was installed in Studio or uploaded to Roblox.

MIT permits reuse and redistribution with the copyright and license notice retained, so this is a stronger rights candidate than the other reviewed UI packs. It is still **review only** until a real Apple insertion route, script review, gameplay test and blind visual check succeed. The live dashboard lists the ZIP and extracted RBXM individually with exact download source and hash.
