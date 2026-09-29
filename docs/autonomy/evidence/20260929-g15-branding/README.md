# G15 Generate Branding — live, 2026-09-29 03:41–03:43 UTC

Production worker 9c776d41, project 2b3cbdae (Candy Garden v2, built by Apple), Studio paired with the place open.

1. Project top bar → "Generate Branding" opens `/app/projects/:id/branding` (its own page; English copy: "No branding yet …
   Studio must be connected with this place open. Uses 1 Credit.").
2. "Generate branding" → after ~30 s: game icon 512x512, thumbnails 1920x1080 ×2 (actual PNGs, `naturalWidth` checked),
   each labelled "Branding art … Not gameplay evidence" with provenance (native Studio viewport capture 320x108, or
   Studio software render 320x180, enlarged, name laid over). Names offered: Candy Garden, Sugar Plots, Gumdrop Grove,
   Sweet Sprout Farm, Candyfield; tagline, short and long description (GLM).
3. Edited: picked "Gumdrop Grove", changed the tagline, Save → "Saved.". Page reload → name and tagline as edited,
   three images still served (`GET /api/projects/:id/branding`, updatedAt 03:42:27Z).
4. No rebuild / no publish: the only Studio op in the log is one read-only `render_view` (03:41:16); no run started.
   `publish` = `{"published":false,"uploadSupported":false,"note":"Nothing was uploaded or published to Roblox…"}`.

Weaknesses (not blocking the gate text, record for G16): art is soft because captures are ≤320 px wide; the long
description claims "a countdown" while growing, which the v2 game does not show yet (copy not checked against the game).
