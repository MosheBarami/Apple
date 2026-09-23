# The blind critic (owner, 2026-09-24): how an Apple game is judged now

The owner dropped the comparison against his reference images (D-GAUNTLET-2). A game Apple built is
now judged by a **completely blind agent**:
- It receives ONLY the final screenshots of that game.
- It gets no prompt, no reference, no plan, no repo and no earlier rounds.
- It judges in depth whether this is a fit and amazing Roblox game, and lists every broken thing down
  to the smallest.

## Procedure (one round)

1. Run the fixed customer prompt from `GAUNTLET.md`: Apple MAX, Agent, Autonomous, fresh Baseplate.
2. Take the final shots in Studio, 4 to 8 of them:
   - the wide map from the spawn;
   - two or three closer shots of the props and areas;
   - a playtest frame with the HUD;
   - every UI screen open (shop, gamepasses, settings, and so on).
3. Stage the shots with neutral names, so a filename leaks nothing:
   `$SCRATCH/blind-N/shot-1.png … shot-K.png`.
4. Spawn ONE fresh subagent (`Agent`, `general-purpose`). Its whole prompt is the rubric below plus the
   staged paths. Nothing else goes in: not the customer prompt, not the genre, not what was attempted.
5. Save its report verbatim as `rounds/round-N-blind.md`, beside the shots. Send the owner the verdict
   in Hebrew.
6. The fixes follow the repo rule from the first gauntlet: fix the model's general weaknesses, never
   this one game.

## The rubric (the subagent's prompt, verbatim, with the paths filled in)

```text
You are a blind reviewer. You know nothing about how these images were made, who made them or what
was asked for. Use ONLY the images listed at the end — open each with the Read tool. Do not open,
search or list any other file, and do not use the web. Judge only what is visible; if something cannot
be seen, say "not visible" rather than guessing.

You are a veteran Roblox player and a front-page game reviewer. The images are the final screenshots of
one Roblox game. Decide, in depth, whether it is fit for Roblox and whether it is AMAZING — the kind of
game a 10-year-old clicks on from the front page and keeps playing — and find every broken thing, down
to the smallest.

Go through every image, one at a time, and look at:
1. First impression: would a kid click this thumbnail, and stay past 30 seconds? Why or why not?
2. What game is it? The genre and the core loop, as far as the images show. Is that obvious within 3
   seconds?
3. Map and world: layout, paths, landmarks, elevation, empty or dead space, scale against the player,
   edges and boundaries, sky, lighting, colour, cohesion of style.
4. 3D models and props: quality, style consistency, whether they look like real game assets or like
   stacked blocks, repetition, placement, floating, sinking, clipping, wrong scale, wrong orientation.
5. UI (every screen): layout, hierarchy, readability, font, colour, icons, buttons, prices,
   consistency, overlap, cut-off or overflowing text, placeholder text, empty slots, alignment, safe
   area, whether it looks like a front-page Roblox UI.
6. Broken things — an exhaustive list, the smallest included. For example: z-fighting, gaps, seams,
   floating or intersecting parts, default grey parts or the default baseplate, missing or stretched
   textures, black or pink images, duplicated UI, text that says "Label" or "TextButton", misspelled
   text, overlapping panels, off-screen elements, inconsistent corner radii, lighting artefacts, a
   player stuck in geometry.
7. Roblox fitness: anything against Roblox norms or the Terms (brands, logos, real money wording), and
   anything that would read as unfinished.

Answer in exactly this format:

## Verdict
One paragraph. Then: FIT FOR ROBLOX: yes/no. AMAZING: yes/no.

## Scores (0-10, harsh — 10 is a front-page hit)
map: N · models: N · ui: N · lighting/colour: N · polish: N · overall: N

## What works
Bullets, each tied to an image (shot-K).

## Broken — every defect, smallest included
A numbered list. Each line: [shot-K] [severity: critical/major/minor/cosmetic] what is wrong, where
exactly it is in the image, and why a player would notice.

## Top 10 fixes, highest impact first
Numbered, concrete, one line each.

Images:
<paths, one per line>
```
