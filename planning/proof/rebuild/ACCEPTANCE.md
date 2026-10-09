# Rebuild acceptance protocol (handoff 2026-10-09, part VI section 16)

Live cases run in the owner's Studio through studpilot.app, so each needs the owner present with Studio open and the
project connected. Nothing here may be marked passed without the evidence it names.

## Validation spending ceiling (set before the first paid call)

- Cumulative ceiling for the whole validation phase: **$10.00** of Workers AI (every model, image, helper and retry),
  inside the owner's standing limit of $20 a month for test spend (CLAUDE.md consent rules).
- First live smoke run: **$2.00** of that ceiling.
- Read the spend before and after each run: `GET /api/admin/spend` (the shared BudgetDO counts cached input at its
  cached rate since #155). Record each run's cost below, failures included. Raising the ceiling needs a written reason
  here first.

| Run | Date | Case | Cost (USD) | Cumulative | Result |
|---|---|---|---|---|---|
| — | — | — | — | $0.00 | — |

## What every record carries

Request text; deploy SHA (`/api/health`, `/studio/api/health`); plugin version; model id; project and place; artifacts
(paths, asset ids); observations (render_view pictures from `lastImageInput`, play_check output, check_ui verdict);
the run's `lastTerminal`; elapsed time; cost from the spend read. Export: `/studio/api/admin/history/<projectId>`.

## Cases

1. **Coin.** "Make a shiny gold cartoon coin and put 5 of them in a row near the spawn." Check: the Cylinder's axis
   (a coin stands on its edge: length along X is the thickness), size about 2-3 studs, Material/Color, one prototype
   inspected (render_view) before copies, copies grounded (spatial_query), save and reopen keeps them.
2. **Studded stamina bar.** "A stamina bar at the bottom of the screen, heavy studded LEGO style; it drains while
   sprinting with Shift and refills after." Check: studs visible (a tiled stud texture), check_ui pass, play_check at
   full / partial / empty / recovery. Then a non-studded variation ("clean minimal stamina bar") with no studs.
3. **Admin panel.** The owner's Pro Admin Panel request. Check: no overflow (scroll where content is long), no
   clipped content, a reopen control, owner can use it in Studio play, server validates every remote, play_check shows
   no errors, render_view looked at before finishing.
4. **Island.** "Build a small cartoon island with palm trees, a waterfall and glowing crystals." Check: shoreline,
   palms grounded (spatial_query), waterfall has source / fall / landing, crystals lit, a walkable route, render_view
   from two angles.
5. **Continuity.** Resume the island project, move a palm by hand in Studio, ask "make the palms taller": the agent
   reports the scene changed (sceneRev), reads again, does not undo the hand move. Stop a run mid-way: the turn ends
   `cancelled` and queued ops are discarded.
6. **Animation / VFX / SFX.** "Make the coin spin and bob, sparkle when collected and play a ding." Check: animation
   plays (animate_model or a script), the ParticleEmitter bursts, generate_sound with upload gives a SoundId that
   loads in play_check (IsLoaded, TimeLength > 0). Uploads go to the owner's account: owner's yes first.
7. **Journey.** Sign in, one project per game (Connect offers the existing project), Connect without a code, a
   request with streamed progress and citations, credits update, the finished turn folds and reopens, reading old
   output while new output arrives, narrow screen, docs and settings.

## Owner steps before the live cases

- Publish the plugin release that carries the 640x480 capture, sceneRev and the outlined-contrast fix (X7,
  docs/PLUGIN-RELEASE.md).
- Open Studio with a test place, open the project on studpilot.app and press Connect.
- Say yes to uploads of test art and sound into the owner's Roblox account (cases 2, 3, 6).
