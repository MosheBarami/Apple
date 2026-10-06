# StudKit: built by hand, judged against the reference board (step 5 of the owner's 2026-10-06 style priority)

The kit is `apps/worker/src/studkit.ts` (tokens, the glossy studded face, outlined text, icon, button, tile, card, window,
bar, currency, hotbar slot, toast, badge, billboard title). It was built in Studio and captured, compared side by side
with R01, R02 and R04, and changed after each critic until a fresh critic gave style 8. The images are StudPilot's own
renders; the owner's references stay private (bible S-2).

| Pass | Style | Weak | Missing | What the critic's top gap led to |
|---|---|---|---|---|
| 1 | 7 | gloss, icons | none | stronger gradient, contrast price button, X badge on the corner, bigger currency icons |
| 2 | 7 | gloss | none | darker bottom lip, thicker outlines |
| 3 | 7 | gloss, icons | none | shine and lip layers inside the fill |
| 4 | 7 | studs, icons | none | studs back to 0.45, spaced tiles, slate never on a tile |
| 5 | 7 | gloss | none | studded inner panel, outline cap |
| 6 | 7 | gloss | none | gradient plus inner bright rim, tighter corners, hero text |
| 7 | 7 | font, gloss | none | stronger gradient, bigger secondary text and price pills, studs 0.3 |
| 8 | 7 | font, gloss | none | outlines 4-7 px (Studio captures at high DPI and halves them) |
| 9 | **8** | gloss | none | passes the bible's bar: style 8, at most one weak, none missing |

Automatic checks on pass 9 (`checks.json`): kit lint clean (every object is a tagged kit part), the window found through
its proofOpen hook, colour gate on the UI box: saturation 0.54, grey 0.05, vivid 0.48 (pass).

Left for later (planning/proof/LATER.md): the gloss on tabs and tiles still reads faint to some critics; big numbers' 7 px
outline reads as a dark pill; tile icons could overflow more; italic card titles need FontFace on the plugin allowlist;
weaker pack icons (clover, bolt, rebirth, lock, map, paw); `rocket` has no free icon (BLOCKED.md).
