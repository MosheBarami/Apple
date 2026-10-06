# M5a block renders (2026-10-06)

Each U request built from the UI blocks with parameters a model could give (`scenes.mjs`, the exact block runs), in
Studio edit mode, captured from the viewport and judged by the orchestrating session. These are design checks of the
blocks, not M5a acceptance runs (those go through the Studio agent and the critic, handoff M5).

Found and fixed on the first pass: card note overlapping the button below 190 px (U05, U08), row detail overlapping the
progress bar (U07, U13), a leaderboard name not centred without a second line (U10), an empty switch while editing
(U06), and 🪙 not drawing in Roblox's emoji font (U13; the icon descriptions now say so). The pills marked Lobby/0:30
along the top are a leftover of the M3 piece S10 in the evaluation place, not a block.

Not shown: the runtime scripts (live counters, shop and upgrade buttons, toasts, loading bar) run only in play.
