# StudPilot dev test set v1 (60 requests, frozen 2026-10-04)

These are the requests Claude Code builds against. **Do not edit a request after you've seen its score.** If you need new requests, make `dev-v2` instead.

Every request runs on a fresh Baseplate place, alone, through the real product path. Some requests are written in a casual, typo-prone style on purpose, because that's how real users write.

The **hidden set** (40 more requests) lives outside the repo. The owner gives it to you at M7 only.

## UI (U01–U15)
- U01: a shop screen for a pet simulator with 6 eggs, prices in gems, and a big featured egg at the top
- U02: main menu with Play, Settings and Shop buttons, cartoony studded style
- U03: HUD showing coins, gems and a level bar at the top of the screen
- U04: rebirth panel showing current multiplier, next multiplier, cost and a progress bar
- U05: daily reward calendar with 7 days, today highlighted and claimed days greyed out
- U06: settings window with music volume, sfx volume and a graphics quality toggle
- U07: upgrades menu with 5 upgrades, each with level, effect and a buy button that greys out when you can't afford it
- U08: inventory grid that scrolls, 4 per row, with rarity colors on each slot
- U09: a codes window where you type a code and press redeem
- U10: leaderboard panel showing top 10 players with avatars and their wins
- U11: a loading screen with the game logo area and a progress bar
- U12: notification popups that stack in the corner when you earn something
- U13: quest list with 3 daily quests and progress bars
- U14: make me a gamepass store with 4 passes and robux prices, x2 coins as the featured one
- U15: tycoon top bar: cash, cash per second, and a rebirth button

## Systems (S01–S15)
- S01: coins that save when i leave and come back
- S02: a click-to-earn system: clicking gives coins, with a cooldown so autoclickers can't abuse it
- S03: upgrades that increase coins per click, with costs going up each level
- S04: a rebirth system that resets coins but gives a permanent 1.5x multiplier each time
- S05: pet eggs: buy an egg for 100 coins, hatch a random pet with shown odds, pets boost income
- S06: a global leaderboard of total coins earned
- S07: daily reward that gives more each day you come back in a row, resets if you miss a day
- S08: tycoon dropper → conveyor → collector that pays the owner of the base
- S09: obby checkpoints that save your stage
- S10: a round system: 30s lobby, 2 minute round, winners get coins
- S11: promo codes that give rewards, each code works once per player
- S12: 3 daily quests (collect 50 coins, hatch 1 egg, play 10 minutes) with rewards
- S13: an inventory that holds up to 50 items and saves
- S14: speed boost gamepass that doubles walkspeed for owners (placeholder pass id)
- S15: plots: each player claims a free plot when they join and gets teleported to it

## Props and objects (P01–P15)
- P01: a treasure chest that opens when you press E and gives coins with a sparkle
- P02: a crystal ore you can mine by clicking 5 times; it cracks, breaks and respawns
- P03: a jukebox that plays music when clicked and lights up
- P04: a lava block that hurts players, with a glow and a hiss sound
- P05: a sell pad that converts your backpack items to coins with a pop effect
- P06: an egg-hatching machine players walk up to, with a glowing egg on top
- P07: a door that only opens if you have 500 coins
- P08: a spinning coin pickup that respawns after 10 seconds
- P09: a cute robot pet that follows the player
- P10: an upgrade pedestal that shows the next upgrade floating above it
- P11: a teleport portal with swirling particles that sends you to a second area
- P12: a vending machine you press to buy a speed potion
- P13: a campfire with flickering light, smoke and crackling sound
- P14: a working basketball hoop that counts your score
- P15: a tycoon buy button pad that builds a wall when you step on it with enough cash

## Zones and map areas (Z01–Z15)
- Z01: a spawn hub for a simulator: spawn point, shop stall, rebirth altar, signs
- Z02: a crystal cave zone with glowing crystals, rocks and a dark blue mood
- Z03: a candy land zone with lollipop trees and a chocolate river
- Z04: a tycoon base plot with walls, a gate and space for buildings
- Z05: a small floating sky island with a waterfall
- Z06: a lava zone behind a gate that costs 1,000 coins
- Z07: a snowy village at night with 5 small houses and lamp posts
- Z08: a desert canyon with a hidden cave entrance
- Z09: a jungle zone with big trees, vines and a temple ruin landmark
- Z10: an obby section with 10 stages that get harder
- Z11: a beach zone with palm trees, a dock and calm water
- Z12: a cozy forest clearing with a river and a small bridge
- Z13: a neon city street at night for a simulator's second world
- Z14: a mine shaft zone with tracks, lanterns and ore veins
- Z15: a lobby for a round-based game with a waiting area and a big countdown board
