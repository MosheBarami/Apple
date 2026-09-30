# Client test: an original game from the owner library (2026-09-30)

Request (typed by the owner-role tester in the web app, production 5eaeeb1a, plugin 1.4.3 local):
"Make me a Plants vs Brainrots style game, but the brainrots are fruit. Bright, studded and fun, with shops and rebirths."

Result on the last two runs (projects `c0acc81b` "Fruit Siege 10" and `1991acff` "Fruit Siege (final client test)"):
`plan_game` -> `build_game` (49-55 s, nothing failed to import, every code edit applied) -> `judge_game`: **ready, 94/100**,
all seven criteria met (placeholders, UI coherence, buttons, progression, errors, construction, fit and uniqueness).

Played by hand in Studio (screenshots here):
1. `1-start-clean-hud.jpg` - start: $400, one HUD (Rebirth, Index, Plants, Garden, Sell), no Robux shop button, no starter-pack offer,
   no card viewer, the core's own "Your garden is empty! Place some plants" prompt.
2. `2-seed-shop-no-robux.jpg` - seed shop with in-game prices only; the creator's Robux buy, gift and instant-restock buttons are hidden.
3. `3-strawberry-brainrot-in-lane.jpg`, `4-pumpkin-brainrot-vs-cacti.jpg` - fruit enemies (Orangutini Strawberrini, Svinino Pumpkinino)
   walking the lane under fire from planted cacti; 18 of the core's own fruit brainrots spawn, the other 56 never do.
4. `5-sold-280-to-317.jpg` - a defeated Pipi Kiwi sold: $280 -> $317 (buy seeds $400 -> $280 before).
5. `6-index-fruit-only.jpg` - the Index lists only the fruit brainrots, Rare to Secret.
6. `7-rebirth-fruit-requirement.jpg` - Rebirth 1 asks for $1,000,000 and a Svinino Pumpkinino; it no longer promises the left-out
   Fuse Machine or Card Pack.

How (all deterministic, from the library, no model improvising): the design keeps the PvB core's loop and cuts left-out features
through a closure over the core's own code (a part kept code reads stays; screens and buttons of left-out features are hidden, not
deleted); it chooses the fitting creatures and writes exact, parse-checked code edits (spawn only the fruit ones, rebirth asks for
fruit, tutorial skipped, admin console block removed, card viewer not handed out, left-out unlocks not promised); the builder sets
the Workspace attributes the save system needs (DataKey) and the source's streaming setting.

Known limits: the original creator's private sounds and animations do not load in the owner's place (Studio says so in the output);
the judge cannot play the loop itself (it passes a working core's loop it cannot plant through, and says so); after "ready" the
agent's visual check framed the empty edit camera and the agent started searching instead of answering (stopped by hand).
