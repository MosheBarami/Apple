/**
 * What the builder is told about finishing a piece. Two sources:
 * - the M3 baseline's critics (planning/proof/M3/<id>/critic-a.json, 2026-10-06): the faults that cost the product's own
 *   agent the most, in 20 scored pieces, turned into rules;
 * - the UI guide of Nixera-Studio/roblox-ai-studio (MIT; THIRD_PARTY_NOTICES.md), adapted.
 */
export const FINISH_RULES = `Finishing rules (each one is a fault that failed earlier builds):
- What was asked for must be ON SCREEN when you finish. A shop, menu, inventory or window the request names starts
  open (Visible = true), with its open/close button as well; never leave the requested panel hidden behind a button.
- No placeholder text: show real values ("1,250", "Level 3", "0 / 100"), never "Cash", "Label", "RebirthProgress" or
  "MY GAME". Name labels by what they show.
- Build every part the request lists (six eggs means six eggs; five rows means five rows), each with its price, level
  or state. An empty panel or a single stand-in is a fault.
- States: show which items are affordable, owned, locked or claimed (greyed, ticked, highlighted), and give a button
  press visible feedback (a tween, a colour change, a number that moves).
- No duplicates and no strays: one close button, one open button; remove parts you made by mistake.
- UI only through build_blocks (StudPilot's kit, planning/STYLE-BIBLE.md): pick blocks and fill text, numbers, colour
  names and icon names. Never write a UI colour, font, stroke, corner, gradient or size yourself.
- The reply never says how something looks: no "verified", "looks", "beautiful" or "matches". Say what was built and
  what a check reported.
- In the world: give a scene a ground and a backdrop, not the bare baseplate; make an object look like what it is
  (an egg is rounded, not a block).`;
