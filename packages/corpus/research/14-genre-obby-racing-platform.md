# Obby, tower, speed-escape, parkour and racing games
_Researched 2026-10-04 by deep-research agent (Claude). Sources: 64._

How to read the labels. "[Sx]" cites the list at the bottom; "[03:Sx]" cites a source in `03-genre-design.md` (not re-listed here). "First-party" means Roblox docs, Roblox announcements or Roblox's own public web APIs. S26 is a snapshot I pulled from Roblox's public web endpoints (games, game-passes and search) on 2026-10-04; those endpoints are not a documented product API, so treat the numbers as a point-in-time reading, not a chart. "Third-party" means Rolimons, wikis, guide sites and press; their numbers drift with each update. "Derived" means I computed it from sourced values and the arithmetic is shown. "Heuristic" means a design starting value with no measured source. "Search summary" means I could not fetch the page (Fandom returns HTTP 402) and the fact comes from a search-result summary. Anything else I could not verify is marked "unverified". This note goes deeper than 03 on obbies, tower obbies, the 2026 speed-escape and tsunami formats, movement tech and racing; 03 already covers Tower of Hell's round timer, the measured jump values, Tower Defense and the generic racing loop, so those are only cross-referenced.

## Key facts

### 1. How Roblox classifies these games, and what Studio ships
- Genre field (first-party): "Obby & platformer" has three subgenres, Classic Obby (jump between platforms), Runner (auto-move and avoid obstacles) and Tower Obby (climb upward through platforms and obstacles). "Sports & racing" has Racing (objective: the fastest time) and Sports. Roblox uses genre to place games in genre sorts on Charts, you can change it only once every three months, and Roblox may overwrite an inaccurate genre. [S24]
- Studio templates (first-party): Classic Obby (checkpoints, fast pads, jump pads, hazards), Racing (a working car and modular winding track pieces), Classic Racing (simple cars and checkpoint objects for terrain tracks), and Platformer (double jump, dash and roll, long jump, moving platforms, one-way platforms, coin pickups, an example tower course). [S13]
- Platformer template, announced 2024-07-26: Shift or X/Square rolls on the ground or dashes in the air; jumping right after a roll is a long jump; a Constants module in ReplicatedStorage tunes speed, jump height and cooldowns; moving platforms take speed and delay as model attributes. It uses traditional scripting, not the newer Character Controller Library, and replies reported jitter and physics glitches when several players stand on or block a moving platform. [S12]
- Racing template (announced in 2024; 03 gives 2024-01-23): duplicate the `Race` folder per race, name checkpoints `Checkpoint1` to `CheckpointN`, per-race min and max players and laps, the car is a dune buggy with nitro tuned by attributes (defaults unpublished), and the post warns the car can be flung out of the world with the aerodynamics beta on. [S11][03:S127]
- Default character physics (first-party): WalkSpeed 16 studs per second, JumpPower 50 with UseJumpPower true, JumpHeight 7.2 (used when UseJumpPower is false), MaxSlopeAngle 89 degrees, Workspace.Gravity 196.2 studs per second squared, SpawnLocation.Duration (ForceField on spawn) 10 seconds, Players.RespawnTime 5 seconds. [S1][S2][S3][S4][S5]
- Units (first-party): 1 stud is 28 cm and 1 Roblox mass unit is 21.952 kg. [S14] Derived: default walking is 16 x 0.28 = 4.48 m/s, about 10 mph; 100 mph is about 160 studs per second (44.7 m/s divided by 0.28).
- Deprecated API an AI builder will still reproduce from old tutorials: `Player:LoadCharacter()` is deprecated in favour of `Player:LoadCharacterAsync()`; `BadgeService:AwardBadge()` is deprecated in favour of `AwardBadgeAsync()`. Both appear in the current reference. [S4][S21]
- Auto-jump (first-party): `StarterPlayer.AutoJumpEnabled` copies to `Player.AutoJumpEnabled` and then to each Humanoid; on mobile it makes the character jump when it hits an obstacle, which helps level navigation but changes obby feel. [S2]

### 2. The 2026-10-04 market snapshot (what is actually live)
All rows are S26 (first-party public endpoints: players now, visits, created, max players, passes) unless a peak is cited from Rolimons (third-party, S42). "Now" means the reading when I pulled it; it moves minute to minute.

Speed-escape and run-and-bank (the 2026 growth formats):
| Game | Now | Peak (source) | Visits | Created | Max/server | Notes |
|---|---|---|---|---|---|---|
| [X20] +1 Speed Keyboard Escape, Candy & Chocolate (SecretVerse Studio) | 126.3k | not fetched | 6.27B | 2026-01-18 | 22 | 96.9% rating on 10.2M votes; 6.9M favourites; passes 85 to 2,350 R$ |
| +1 Tongue Escape (dot x ast) | 35.0k | n/a | 97.7M | 2026-08-11 | 16 | tongue-slide obstacle course; 2X to 5X Tongue passes 3 to 99 R$ |
| +1 Speed Monkey Escape | 10.9k | n/a | 623M | 2026-05-09 | 22 | passes from 9 R$ starter pack to a 4,999 R$ x1000 treadmill |
| +1 Speed Keyboard Escape ASMR (original clone) | 6 | 11,838 on 2026-01-10 [S42] | 22.8M | 2025-10-11 | 24 | 885k favourites; 8.89 min average playtime [S42] |
| Escape Tsunami For Brainrots (Wave of Brainrots with Do Big Studios) | 4.5k | 4,996,032 on 2026-01-24 [S42] | 5.73B | 2025-12-15 | 8 | 10.05 min average playtime; 83% rating [S42]; fifth-highest CCU ever per press [S44][S48] |
| Swing Obby for Brainrots (HEY THATS MINE) | 736 | 252,003 on 2026-03-14 [S42]; a press piece says about 87k [S44] | 398M | 2026-02-18 | 8 | 7.9 min average playtime [S42]; the two peak figures conflict |
| Hyper Speed Runner | 1.7k | n/a | 92.5M | 2026-01-02 | 20 | treadmill passes 179 and 749 R$ |

Obbies and towers:
| Game | Now | Peak (source) | Visits | Created | Max/server | Notes |
|---|---|---|---|---|---|---|
| Tower of Hell (YXceptional Studios) | 13.0k | 170,829 on 2020-09-04 [S42] | 29.05B | 2018-06-18 | 20 | 4.35 min average playtime [S42]; passes 195 and 349 R$ |
| Barry's Prison Run (PlatinumFalls) | 18.1k | 92,703 on 2025-07-02 [S42][S61] | 4.72B | 2022-02-02 | 12 | 10.31 min average playtime [S42]; 25 gear passes at 50 to 200 R$ and a 2,000 R$ bundle |
| Escape Running Head | 10.4k | n/a | 3.04B | 2021-01-07 | 6 | boss battle; ticket to teleport stages 349 R$ |
| Escape the Carnival of Terror (PlatinumFalls) | 3.0k | n/a | 1.24B | 2020-12-28 | 10 | one 2,000 R$ VIP pass |
| TROLL Hug Tower | 23.5k | n/a | 203M | 2026-07-07 | 20 | catch, carry and throw players into lava; Admin pass 1,499 R$ |
| Phonk Edit Tower | 10.9k | n/a | 243M | 2025-12-04 | 30 | Admin 1,299 R$, slap gear 339 to 799 R$ |
| Gear Slap Tower | 3.2k | n/a | 257M | 2025-08-06 | 32 | 20.5M favourites; HD Admin 499 R$ |
| Spiral Difficulty Chart Obby | 6.3k | n/a | 61.0M | 2026-01-20 | 15 | 260 stages; developer says 0.1% finish |
| Mega Fun Obby (Bloxtun, Wrathsong) | 30 | 11,319 on 2020-04-22 [S42] | 1.16B | 2009-07-10 (place) | 8 | 2,935 stages; 17.89 min average playtime [S42] |
| Steep Steps | 51 | 59,713 on 2023-01-21 [S42] | 170M | 2022-11-19 | 26 | ladder-climbing tower; 5.26 min average playtime [S42] |
| Eternal Towers of Hell | 1.2k | n/a | 120M | 2022-01-17 | 1 | solo instances; a 4,999 R$ "Vertical Mobility" pass |

Vehicle obbies and co-op obbies:
| Game | Now | Visits | Created | Max | Notes |
|---|---|---|---|---|---|
| [1 & 2 PLAYER] Grapple Cart Obby (rng dev) | 13.6k | 22.1M | 2026-08-26 | 25 | 5.5 weeks old; passes 49 to 399 R$; "Infinite Revives" 139 R$ |
| Kart Of Hell (TELEVISION TECH) | 9.2k | 54.1M | 2026-03-29 | 10 | "30 randomly-generated kart stages"; passes 59 to 119 R$ |
| [W40] Obby But You're on a Scooter | 6.5k | 117M | 2025-08-10 | 10 | numbered worlds; "Unlock all Worlds" 599 R$; "Disable Popups" 69 R$ |
| Carry the Glass Together! [2 Player Obby] | 5.6k | 23.1M | 2026-06-29 | 26 | "Unlimited Rewinds" 599 R$ |
| Biker Duo [2 Player Obby] | 4.2k | 22.4M | 2026-05-04 | 14 | solo developer; duo time leaderboard added |
| [W26] Obby But You're on a Kart | 3.3k | 62.6M | 2026-03-03 | 10 | "All world pass" 239 R$ |
| Obby But You're On a Bike | 1.25k | 1.95B | 2023-07-25 | 20 | 8.5M favourites; passes 99 to 399 R$; a search summary says 111 worlds of 100 stages [S63] |
| Chained [2 Player Obby] | 1.6k | 438M | 2024-07-04 | 15 | 10.6M favourites; chain skins 69 to 699 R$ |

Racing, driving and movement games:
| Game | Now | Peak (source) | Visits | Created | Max | Notes |
|---|---|---|---|---|---|---|
| Evade (Hexagon Development Community) | 41.5k | 197,261 on 2022-08-28 [S42] | 9.26B | 2022-06-10 | 15 | 12.79 min average playtime [S42]; cosmetics only, 100 to 1,200 R$ |
| Driving Empire (Voldex) | 27.4k | 89,566 on 2026-08-15 [S42] | 3.33B | 2019-06-23 | 22 | 14.04 min average playtime [S42]; 93% rating; passes 15 to 500 R$ |
| Drag Drive Simulator | 42.4k | n/a | 618M | 2025-01-15 | 25 | passes 29 to 499 R$; "2x Paycheck" 499 R$ |
| American Plains Mudding | 24.7k | n/a | 709M | 2021-07-29 | 15 | off-road sandbox; spawner and trailer passes 195 to 490 R$ |
| Greenville RP | 9.0k | n/a | 1.47B | 2017-06-28 | 30 | vehicle-access passes 75 to 500 R$ |
| Midnight Chasers: Highway Racing | 4.7k | n/a | 316M | 2023-06-21 | 14 | passes 75 to 200 R$ |
| Car Zone, Racing and Drifting | 2.6k | n/a | 156M | 2024-11-02 | 20 | "RANKED" tag; passes 199 to 999 R$ |
| Vehicle Legends (QuadraTech) | 1.7k | n/a | 1.95B | 2020-01-02 | 16 | Premium users earn 20% more driving (its description) |
| Speed Run 4 (Vurse) | 1.3k | n/a | 1.75B | 2014-10-20 | 30 | now sells egg-hatch passes (279 and 599 R$) next to Speed Coil 170 R$ |
| Natural Disaster Survival (Stickmasterluke) | 12.6k | n/a | 4.50B | 2008-03-28 | 30 | three cosmetic passes 60 to 95 R$ |

Read-outs from the snapshot (derived unless cited):
- A single speed-escape clone, [X20] +1 Speed Keyboard Escape, holds about 126k players while the other speed-escape titles listed sit between 1.7k and 35k. The format spawned dozens of themed clones (Keyboard, Monkey, Tongue, Hospital, Jelly, Snow, Slime, Soap; the omni-search returned more than ten). [S26]
- Decay is brutal for fashions and mild for evergreens. Peak to now: Escape Tsunami about 0.09% (4.5k of 4.996M, about nine months); Swing Obby about 0.3% of 252k (about seven months); Steep Steps about 0.09%; the original +1 ASMR clone about 0.05%; Mega Fun Obby about 0.3%. Versus Barry's Prison Run about 20% of its 2025 peak, Evade about 21%, Tower of Hell about 7.6% of a 2020 peak after six years, Driving Empire about 31% of an August 2026 peak. [S26][S42]
- Third-party press agrees on the shape: Steal a Brainrot fell about 99.2% from its 25.8M peak to about 215k, Swing Obby fell from its peak within five weeks. [S44]
- Obby average playtime is short unless the game has a loop on top: Tower of Hell 4.35 minutes, Steep Steps 5.26, Swing Obby 7.9, +1 ASMR 8.89, Escape Tsunami 10.05, Barry's 10.31, Evade 12.79, Driving Empire 14.04, Mega Fun Obby 17.89 (the 2,935-stage game). These are Rolimons figures; their definition of "average playtime" is not published. [S42]
- Older obbies keep evolving: Speed Run 4 (2014) now sells egg-hatch passes; Barry's Prison Run sells 25 single-purpose gear passes and shows a rewarded-ad HUD consumable. [S26][S23]
- Genre-level numbers elsewhere are thin: one third-party list of obby-platformer games put the top live game (Barry's) at 16.2k on 2026-10-03, matching the 18k seen here a day later. [S43]

### 3. Obby formats and the design facts behind each

Classic stage obby (Barry's Prison Run, Mega Fun Obby, the "Escape the X" family).
- Barry's Prison Run: first-person by default with a toggle, about 25 obstacles plus a hard mode (search summary of the Fandom page), ends with shooting Barry; 12 players per server; 10.31 minute average playtime; its monetisation is many small single-purpose gear passes (50 to 200 R$) and a 2,000 R$ bundle; Roblox's own ad-placement showcase lists a HUD rewarded video that grants a single-use consumable. [S61][S42][S26][S23]
- Mega Fun Obby: 2,935 stages (the title changes as stages are added: 2,805, 2,880, 2,900, 2,920, 2,935 across search results and the live API), eight players per server, now almost empty (30 players) but with 1.16B lifetime visits. Passes: 2X Rebirth Profits 300 R$, Speed Coil 100, Gravity Coil 298, Double Jump 350, flying carpets 500 to 798. The model is volume: the content never runs out. [S26][S42][S60]
- Escape Running Head (2021), Escape the Carnival of Terror (2020) and Barry's (2022) are all still above 3k players in 2026 and have 1.2B to 4.7B visits, so a stage obby with a theme, a boss and a modest update rhythm is a durable product. [S26]

Difficulty-chart obby (DCO).
- Structure seen in live games' own descriptions (S26): Clock's Difficulty Chart Obby HARD has 100 stages across 10 named tiers (Effortless, Easy, Medium, Hard, Challenging, Difficult, Intense, Extreme, Unreal, Error), a practice area, rebirth coins for trails and a Free Skip with a shortenable timer; Impossible Obby to Heaven says "every 20 stages it gets a bit harder" and gives a free skip every 12 hours; Nooby's DCO 3 lists 280 stages, updates "every other Sunday" and claims 0.1% finish; Golden's DCO lists 300 stages, rebirth points and leaderboards, and the same 0.1% claim; Spiral DCO lists 260 stages and Zig Zag DCO 200. Those completion rates are developer claims, not measured data.
- The 2021 devforum guide to difficulty charts (Shr3ne, 2021-03-28) says to plan an even number of stages per difficulty, price a skip stage at 20 to 50 Robux and budget before building; a 2020 post (sydmisst) says cap a skip at 20 Robux and give 10 coins per checkpoint. Both are pre-2024 and sit below the 2026 live prices (Clock's skip prices are not public from my sources; Spiral DCO sells a 99 R$ "Portable Checkpoint"). [S31][S32][S26]
- 2026 DCO flavour: "Obby But" and "Crashout/Rage-quit" tag strings in descriptions, wraparound and wall-hop stage types, spiral or zig-zag layouts that fold a long chart into a small footprint. [S26]

Tower obby.
- Tower of Hell (random sections, no checkpoints, timed rounds) is documented in 03; new here: Rolimons shows 20 players per server, 29.05B visits, 12.0M favourites, an all-time peak 170,829 on 2020-09-04 and 4.35 minutes average playtime; public passes are only Double Coins (195 R$) and a Summer Bundle (349 R$); a retired "Infinite Coins" pass was compensated. [S42][S26] Search summaries of the wiki say it launched 2018-06-18 and that on 2021-02-24 the owner cut roughly 210 sections to 17 (03's other sources say 364 catalogued; they conflict). [S57][03:S82]
- Juke's Towers of Hell (search summary of the community wiki): towers usually have no checkpoints and falling means continuing from wherever you land; types are Steeple (5 to 6 floors, sub-realms only), Tower (10 floors, each floor described as 100 x 100 x 100 studs) and Citadel (12 to 25 floors); 13 difficulty colours from Effortless to Nil; about 425 towers award points. Treat all counts as unverified. [S58] Eternal Towers of Hell runs one-player servers (max players 1) with a 4,999 R$ "Vertical Mobility" pass. [S26]
- Steep Steps (2022-11-19): ladder-only climbing, the player cannot jump, one ladder per run that you carry up and slot into gaps; developer text says about 1% of players reach 1,000 m. Peak 59,713 on 2023-01-21, 51 players now, 21 cosmetic passes (160 to 999 R$). [S59][S42][S26]
- The 2025-26 "troll tower": a mostly easy tower where the point is to slap, hug, carry or throw other players using gears; free gears unlock with play, powerful ones are Robux passes (Admin 499 to 1,499 R$, rainbow carpet 239 to 399, laser gun 179 to 299, coils 78 to 99). TROLL Hug Tower reached 23.5k players within about three months of launch (created 2026-07-07). The format descends from the "slap" trend; a developer's May 2025 feedback thread says only that the goal is to slap others off the top. [S26][S40]
- Genre sort note: Roblox lists Tower Obby as a subgenre, so set it (and the parent genre) accurately because Charts use it for genre sorts. [S24]

Vehicle obbies, co-op obbies and obby hybrids.
- The "Obby But You're on a X" pattern: a normal numbered-world obby where the avatar is replaced by a vehicle (bike, scooter, kart). Bike has 1.95B visits and 8.5M favourites; Scooter is at world 40 in its title; Kart at world 26. The world number in the title is a live-ops signal: each world is a content drop. [S26]
- Kart Of Hell is Tower of Hell logic with karts: "30 challenging randomly-generated kart stages", 10 players, 9.2k players about six months after launch. [S26]
- Co-op: Chained (two players tethered), Carry the Glass Together, Biker Duo and Grapple Cart Obby all say "2 Player" in the title, price revive or rewind items (Infinite Revives 139 R$, Unlimited Rewinds 599 R$) and add a duo-time leaderboard (Biker Duo). The four 2026 co-op titles currently hold 4k to 14k players each, in the same range as the big stage obbies, but they are all under 12 months old (Chained is two years old), so their half-life is unknown. [S26]
- Swing Obby for Brainrots and Escape Tsunami for Brainrots reached huge peaks but each lost over 99% of its peak CCU in under nine months (see read-outs). A designer reading: swing physics and tsunami runs are strong short-term hooks but not retention engines. [S26][S42][S44]

Speed-escape ("+1 Speed") loop.
- Third-party guides (2026-06-18, 2026-07-26): every step adds speed (+1 by default); free chocolate treadmill gives 1x speed gain, Golden x3, Diamond x9, Candy x25 and Admin x100 (Robux); stages are 13; wins are the currency, earned by stepping on a pad after a stage; teleports to stage 2 to 13 cost 2, 6, 20, 40, 100, 200, 300, 600, 1,000, 2,000, 5,000 and 20,000 wins; trails multiply speed gain: Green 1.5x (500 wins or 19 R$), Blue 2x (1,500 or 29), Purple 3x (5,000 or 59), Red 4x (25,000 or 139), Rainbow 5x (100,000 or 249), Galaxy 10x (399 R$), Choco 20x (499 R$); auras stack on trails; rebirth resets speed for a permanent multiplier; gems unlock rebirth; free boosts of 15,000 speed each for a like, a group join and a social code. [S50][S51]
- Derived from that teleport table: cost ratios of 3.0, 3.3, 2.0, 2.5, 2.0, 1.5, 2.0, 1.7, 2.0, 2.5, 4.0 between stages; geometric mean about 2.3x per stage (ln 10,000 / 11 = 0.837, e^0.837 = 2.31). Trail win costs grow about 3.8x per tier (100,000 / 500 = 200, fourth root 3.76) while the multiplier grows 1.5, 2, 3, 4, 5.
- Live treadmill prices differ from the guides: the API shows Diamond 345, Candy 749, Admin 1,199 R$ for the [X20] game while the July guide quotes 259 and 1,599, so prices drift or are on sale. Treat guide prices as stale. [S26][S51]
- Roblox's own ad-placement showcase lists +1 Speed Keyboard Escape's rewarded video as a pop-up "Revive" that protects progress; Evade's is a pop-up revive that protects a win streak; Barry's is a HUD single-use consumable. [S23]
- A devforum thread on anti-cheat for a "+1 Speed Escape Obby" (2026-03-17) is the best builder-side source: see Section 6. [S28]

Tsunami run-and-bank loop (Escape Tsunami For Brainrots).
- Loop: run out across zones of increasing rarity, grab brainrots, return to base before a wave arrives (or hide in a pit), bank income, upgrade speed, carry capacity and base, rebirth. Zones are widely listed as 9 or 10 (Common to Celestial, one source adds Divine). [S46][S48][S47]
- Zone speed requirements and income per second (search summary and a guide, 2026; two sources disagree at the top end): Common 0 to 10 speed at $2 to 15 per second; Uncommon 10 to 20 at $20 to 120; Rare 20 to 30 at $100 to 275; Epic 30 to 50 at $290 to 1,400; Legendary 50 to 80 at $1,500 to 5,000; Mythical 80 to 110 at $6,000 to 25,500; Cosmic 110 to 140 at $22,000 to 170,000; Secret 140 to 180 at $200,000 to 1,000,000; Celestial 180 plus at $1.5M to 1.9M. A second guide lists distances (Common 0 to 50 m, Uncommon 50 to 150 m, Rare 150 to 300 m, Epic and Legendary 300 to 450 m, Mythic and Cosmic 450 to 550 m, Secret from 600 m) and speeds up to 180 to 220 plus for Secret. The units of "m" and "speed" are not defined. [S46][S47]
- Derived from the income table: top-of-range income grows about 120,000x from Common ($15) to Celestial ($1.9M) over eight steps, about 4.5x per zone (ln 126,667 / 8 = 1.47, e^1.47 = 4.35 to 4.5).
- Waves: names in a February 2026 guide are Super Slow, Slow, Medium, Fast and Lightning (normal), a paid Beast Wave (19 R$), and event waves Radioactive, Wacky (several in succession), UFO and Death; the guide gives no studs-per-second values. Zones get longer and so do gaps between pits, so a higher speed stat is the real gate. Wave variety and a paid wave are the live-ops layer. [S45][S46]
- Passes (S26): VIP 175, VIP+ 888, Speed Boost 129, Super Speed Boost 329, Rainbow Shield 295, Double Jump Coil 160, Harpoon Gun 640, Anti-Wave Device 699, Infinity Ball 245, Shockwave Bomb 349 R$. Server size is 8, which Rolimons and the API both show.
- Do Big Studios is named as owner by one press piece with an unverified list of its other games, and a launch date of 2026-01-05 that conflicts with the API creation date of 2025-12-15 (probably a public-launch date, unverified). [S48][S26]

### 4. Movement and physics facts that decide whether jumps are fair
- Jump reach (derived): with JumpHeight 7.2 and Gravity 196.2, airtime on flat ground is 2 x sqrt(2 x 7.2 / 196.2) = 0.542 s, so reach is about 0.54 x WalkSpeed: 8.7 studs at 16, 54 studs at 100, 108 studs at 200. The only measured test in 03 found about 9.6 studs at 16 (about 11% above), and builders call 12 to 13 studs edge-to-edge the elite ceiling. [03:S116][03:S119][S1][S5]
- If a speed game grows WalkSpeed, gap sizes and even level length must scale with it; one flat obby section at 16 studs/s lasts 6.25 s per 100 studs, at 200 studs/s it lasts 0.5 s. (Derived.) Cap speed on the server: a devforum thread's anti-cheat answers use a 15 to 20 studs-per-second cap for a default obby and one search summary mentions a 250 studs-per-second clamp for a speed-escape game (unverified source). [S28][S41]
- The documented way to make characters ride moving platforms: parts moved by CFrame or Tween are not physics objects and do not carry the player; use a physical mover instead. Devforum answers (2024-11-08): PrismaticConstraint (recommended by two posters), an unanchored platform welded to a tweened anchored part, AlignPosition/AlignOrientation on an unanchored part, or setting AssemblyLinearVelocity per frame from the position delta; one poster reports LinearVelocity stops player movement while VectorForce does not; another says every approach stutters with vehicles. [S27]
- Roblox's tutorial values for movers: LinearVelocity `MaxForce` 5,000 for a lily pad at 15 studs per second (`VelocityConstraintMode` Line, `LineDirection`, `LineVelocity`); PrismaticConstraint `ActuatorType` Motor, `MotorMaxForce` 50,000, `Velocity` 40 for a log; AngularVelocity 6 rad/s with `MaxTorque` 1,000 for a 4 x 1 x 2 block (a block four times larger needed at least 300,000); HingeConstraint motor `AngularVelocity` 3 rad/s with `MotorMaxTorque` 1,000; jump pad by `ApplyImpulse` of 2,500 on Y to the foot (character mass differs, so tune). [S15][S16]
- Network ownership: the engine gives unanchored parts near a player to that client automatically; anchored parts are server-owned; the documented vehicle pattern is `SetNetworkOwner(player)` when the driver sits and `SetNetworkOwnershipAuto()` on exit; setting the server as owner for gameplay-critical parts can make physics jittery. [S17]
- Collision groups: register with `workspace:RegisterCollisionGroup(name)` and set pairs with `workspace:CollisionGroupSetCollidable(a, b, false)` (the documented WorldRoot API). Use this so racers do not collide, or players pass through each other on a tower. [S19]
- Streaming: client-side raycasts and `GetPartBoundsInBox` see only streamed-in content; use the server for authoritative queries; set long-lived mover models to `ModelStreamingMode` Atomic or Persistent. [S25]

### 5. Parkour and movement-tech games
- Evade (Hexagon Development Community, created 2022-06-10): chased by "nextbots", the skill is movement. Peak 197,261 on 2022-08-28 and still 41.5k in 2026 with 9.26B visits; 15 players per server; only cosmetics and emotes sold (100 to 1,200 R$), with a pop-up rewarded revive protecting win streaks. A search summary says the movement is based on Quake-III-style bunnyhopping (unverified), and a devforum thread establishes a capsule HumanoidRootPart, a custom rig and a Humanoid, with movement in modules that most likely set AssemblyLinearVelocity directly and air-strafe. [S42][S26][S62][S39][S23]
- Community movement modules (devforum): a Source/CS-style bunnyhop module (sylwek1100, 2025-09-02) lists defaults of walk 16, sprint multiplier 1.6, ground acceleration 14, air acceleration base 12.0, max air wish speed 30, surface friction 1, auto-bhop charge 1.0 s, landing grace 0.15 s, side-switch boost window 0.22 s, and says setting character parts' friction to 0 helps; a momentum-conserving air-strafe tutorial (Troxter5, 2026-03-02) switches the Humanoid to the `Physics` state while airborne and raycasts 5 studs down to detect ground; its author says surfing works poorly with a Humanoid and suggests a source-like controller or a ball controller. [S37][S38]
- Roblox's new Character Controller Library (first-party, beta): enable under File, Beta Features, "AvatarAbilities Character Controller Library" and then Avatar Settings, Movement, Abilities. Abilities are Luau tables with `Labels`, `StartsWhen`, `RunsWhile`, `Blocks`, `Stops`, `Suspends`, `ExclusiveGroup` and callbacks (`OnStart`, `OnUpdate` and so on) that run in both the predicted client simulation and the server simulation and must never yield. Built-in abilities expose attributes such as Running/Sprinting `SpeedMultiplier` and Jumping `JumpHeight`; controllers expose `GroundController.AccelerationTime`, `DecelerationTime`, `AirController.MoveMaxForce` and more. The docs' dash example: 0.2 s window, 1.0 s cooldown, impulse of 80 x `AssemblyMass` along the look vector, input slot 5. [S6]
- A practical conclusion: for a new game, wall-hops and long-jump parkour can be built on the default Humanoid with attribute-tuned values; true bhop/surf needs a custom controller; CCL is the new first-party route but is a beta, so ship a fallback. (My recommendation.)

### 6. Exploits, validation and Server Authority
- Obby exploit classes (devforum, 2024-08-13 and 2026-03-17): speed, fly, teleport, noclip, stage skipping. Suggested defences: validate everything on the server except animation; reset speed or teleport the player back instead of banning; use a three-strike warning and temporary kicks because lag causes false positives; check speed by distance moved per second against the allowed speed; check vertical movement and air time for flying; clamp WalkSpeed server-side; verify each checkpoint was reached in order; for leaderboards, review top clips manually. One poster notes that local speed changes are invisible to naive server checks, so compare movement, not the property. [S28][S29]
- Server Authority (first-party). Studio beta announced 2025-12-09 (Studio only, Team Test unsupported); full release 2026-07-09 for any game, opt-in. The server becomes the single source of truth and clients predict, with rollback and resimulation; it targets "FPS, racing, sports and combat" and prevents fly and speed hacks by never trusting reported position. [S9][S8][S7]
- What turning it on requires: `Workspace.AuthorityMode` Server (sets the others), `NextGenerationReplication`, `PlayerScriptsUseInputActionSystem`, `SignalBehavior` Deferred, `UseFixedSimulation`, `StreamingEnabled`. Game logic that affects the simulation goes in `RunService:BindToSimulation()` callbacks in a ModuleScript required on both sides; inputs use InputActions (not `UserInputService`); custom state goes in attributes (first 64 per instance, names up to 50 characters, string values up to 50 characters); use `time()` not `tick()` or `os.clock()` in simulation code. [S7]
- Release limits stated 2026-07-09: 8 active animation tracks per Animator, no custom emotes or strafing animations, RemoteEvents are not on the shared timeline (about 40 to 50 ms offset), a breaking camera change (use `Player:GetCameraState()`), higher server cost, mobile and console lag desktop by several days. Supported: default-avatar movement, backpacks and tools, vehicle physics, sports, custom abilities scripted on both sides. [S8]
- Racing under Server Authority: Roblox's Racing - Server Authority Template says the server has network ownership of all cars, both sides simulate, and car control comes through InputActions serialized into attributes; the in-depth car-physics tutorial (2025-09-03) states that its sections 5 onward cannot be followed under Server Authority. [S10][S33]

### 7. Monetisation patterns that these genres actually use
- Prices are real, from S26: obby and tower games sell mostly utility gears (Speed Coil 49 to 100, Gravity Coil 59 to 139, Double Jump 79 to 350, flying carpet 239 to 798, grapple 99 to 299), "Disable Popups" (29 to 99), VIP (89 to 699), admin/troll panels (499 to 1,499), revive/rewind items (139 to 599), and world-unlock passes (199 to 599). Speed-escape games sell treadmills (49 to 4,999), trails and auras (199 to 3,199). Racing sells vehicle-class access (75 to 500), customisation (110 to 390), 2x cash (499 in Drag Drive Simulator) and VIP (200 to 500). Evade's for-sale passes are cosmetics, emotes and boomboxes. (Derived ranges from the passes listed per game.)
- Pop-up and rewarded ads are in play: at least five obby games in the snapshot sell "Disable Popups" or "Disable Pop-Up Ads" (29 to 99 R$), and Roblox's rewarded-video doc says rewards must be developer products worth roughly 3 to 10 Robux, cannot be random items, must not harm the character during the ad, and the game needs 2,000 unique visitors a month, a 13-plus ID-verified owner and a public game. `AdService:GetAdAvailabilityNowAsync`, `CreateAdRewardFromDevProductId` and `ShowRewardedVideoAdAsync` are the calls, with the receipt granted in `ProcessReceipt`. [S26][S22]
- Badges: five free per 24 hours per game then 100 Robux each; award from a server script with `BadgeService:AwardBadgeAsync`; the rate limit is 50 + 35 x users per minute. Use badges for stage milestones. [S21]

### 8. Racing: what the market and the platform show
- Four products (from 03) now have 2026 numbers. Drag-and-wheelie sandboxes (Drag Drive Simulator 42.4k) and off-road mudding (American Plains Mudding 24.7k, 709M visits since 2021) out-draw classic circuit racers in this snapshot; Driving Empire sits at 27.4k now with a record 89,566 on 2026-08-15; roleplay driving towns (Greenville 9.0k, Rensselaer County 11.5k in the search results) stay steady; pure racers are small (Midnight Chasers 4.7k, Car Zone 2.6k, Formula Apex 977). [S26][S42]
- Driving Empire's live-ops rhythm (third-party, 2026): weekly Friday 1 PM ET brand updates with limited cars, for example Offroading (Aug 7-14), Spyker and Lotus (Aug 14-21), Chevrolet (Aug 21-28), Dodge (Sep 4-12), Subaru (Sep 18-25) and NASCAR Las Vegas back on 2026-10-02. Third-party guide figures: Highway wins about $8,000; global Circuit and Rush Hour wins $100K and up; dealership cars $150,000 to $500,000; daily login 2,500 rising to 10,000 on day 7; event-car resale $250K to $800K+ (the same guide family that 03 flagged as conflicting; use only the shape). [S52][S53][03:S132][03:S133]
- Press (2026-08-24) frames the market as all-rounders (Driving Empire, Vehicle Legends), realism (Corsa Legends alpha), roleplay (Young Street Ontario, Mojave Valley, Southwest Florida), motorbikes (Eagle Nation), and street racing (Midnight Racing: Tokyo). [S54]
- Dream Racers (Studsy, founder Delus): launched 2026-09-01; three words from a curated word shop prompt Roblox's Cube AI to generate a physics kart in 20 to 30 seconds; items boxes, Mario Kart-like structure, word choice sets stats (a "rocket" word boosts speed, "crab" durability); the team was three people with about 2.5 months of work at the May 2026 interview; Roblox's Innovation Studio is a collaborator. I could not find it in the public search on 2026-10-04, so there is no player count. [S55][03:S137]
- Older racing-developer context: a 2023 interview with NR-Studios (NASCAR-style racing on Roblox) says nothing about vehicle technique; it shows that licensed-motorsport fan racing is a real niche with career and pit-crew modes. [S56]

### 9. Racing technique (devforum, with dates)
- Scripted car physics (bIorbee, 2025-09-03): mass-spring-damper suspension `F = k x - c v` per wheel via raycast and a `VectorForce`; demo values stiffness 2,500, damping 250 ("rule of ten": damping about a tenth of stiffness), rest length 2 studs, wheel radius 1.5 studs; the ray length is rest length plus wheel radius; wheel-point velocity is `AssemblyLinearVelocity + AssemblyAngularVelocity:Cross(point - position)`; the series covers friction as `F = mu N` but later sections and steering are unfinished. [S33]
- Derived wheel maths: ground speed equals wheel angular velocity times radius, so a hinge-motor wheel of radius 1.5 needs 26.7 rad/s for 40 studs/s and 106.7 rad/s for 160 studs/s (about 100 mph). Whether the engine caps `HingeConstraint.AngularVelocity` is not stated in the docs I read (unverified). [S18][S14]
- Constraint cars: VehicleSeat (MaxSpeed, Torque, TurnSpeed, SteerFloat, ThrottleFloat) drives HingeConstraint motors; SpringConstraint supplies suspension (Stiffness, Damping, FreeLength). Docs list the properties but no defaults for these. [S17][S18]
- Race position: score = laps x big + checkpoints passed + progress fraction between the last and next checkpoint, sorted descending; the fraction depends on whether you divide distance to next or from previous checkpoint (Greenboo5's thread, replies 2 to 11); other posters keep a finish-order table. [S35]
- Ghosts: a community module (1xayd, 2025-10-19) records character movement and camera, exports and imports as strings with Base64 or Base85 (Base85 25 to 75% smaller than Base64 after compression); about 100 KB per 40 to 50 s of an R6 avatar (20 to 25 s R15); the DataStore 4 MB per-key limit caps recordings. [S34]
- Drift boost (2020): one answer says apply a side force just past the centre of the vehicle's side; no formulas. [S36]
- Network lag, not rubber-banding design: see 03 (January 2025 bug report with 10 or more multi-assembly vehicles); Server Authority is Roblox's answer for competitive racing. [03:S130][S10]
- Leaderboards: `OrderedDataStore` stores integers only and sorts with `GetSortedAsync`; store milliseconds as integers. [S20]

### 10. What separates hits from clones in these genres
- The hit has one distinctive handle, not five: Tower of Hell's randomised no-checkpoint rounds; Steep Steps' ladder; Evade's movement; Barry's first-person escape with a boss; Dream Racers' words-to-kart; Escape Tsunami's wave. The clones copy the handle and decay quickly; the evergreens add a content treadmill (worlds, brands, stages) and social play. [S26][S42][S55]
- In 2026 Roblox pays more for novelty than for clones (03 S27), and press describes tsunami and swing clones as low effort. [03:S27][S44]
- Evergreen obbies are updated weekly to biweekly with numbered worlds or brand events (Driving Empire Fridays; Nooby's DCO every other Sunday; Bike at world 112 per search title). [S52][S26][S63]
- The cheapest durable social layer is the duo leaderboard or the troll gear, not chat. [S26]

## How to apply it (rules for an AI builder)

### Universal for this family
- DO pick the subgenre first (Classic Obby, Tower Obby, Runner, Racing) and set the Genre field to match; it drives Charts placement and can be changed only every three months. [S24]
- DO make the first 60 seconds winnable: first stages need no jump at all, the first checkpoint within about 20 studs of spawn, and the whole first world finishable in about 3 to 5 minutes. Roblox's retention docs say finish onboarding in 5 minutes [03:S111]; measured average playtime for obby-type games is 4 to 10 minutes [S42], so design a 10-minute satisfying session.
- DO tune every number from a data table: gap sizes, platform speeds, wave timers, costs and prices in a ModuleScript or Attributes so live data can change them.
- DON'T build a pure clone of a 2026 fad. Use one fad handle plus one proven retention layer (worlds, rebirth, daily reward, leaderboard). [S42][S44]
- DON'T rely on a game that works offline: validate on the server, since every speed-escape and obby exploit class is mainstream. [S28][S29]

### Obby and tower construction
- DO size jumps by the character: tutorial gaps 2 to 4 studs, easy 4 to 5, medium 5 to 6.5, hard 7 to 8, never above 8.5 at WalkSpeed 16; allow an "expert" tier up to 12; vertical steps at most 6. For any other WalkSpeed use gap_max = 0.54 x WalkSpeed (derived above). [S1][03:S119]
- DO add a checkpoint every stage for casual and every 3 to 5 obstacles for challenge; DO give no checkpoints only where a timed tower format needs it. [03] Place a stage-save so players resume.
- DO keep respawn fast: set `Players.RespawnTime` low (the default is 5), set `SpawnLocation.Duration` to 0 so no ForceField bubble shows (my recommendation; docs say ForceField only blocks explosions and `TakeDamage`), and play a short checkpoint sound plus particle. [S4][S3]
- DO use physical movers for anything a player stands on: PrismaticConstraint motor (`MotorMaxForce` 50,000, `Velocity` 40 is the docs' example), HingeConstraint or AngularVelocity for spinners (6 rad/s, 1,000 torque for a 4x1x2 block, scale torque up with mass). DON'T move standing surfaces by TweenService on anchored parts alone. [S15][S16][S27]
- DO tag stage models and kill parts with CollectionService tags and bind logic from tags, so a generated map needs no per-part scripts.
- DO mark hazards visibly (Neon or a distinct colour) and test every stage for completability on touch devices. [S32]
- DON'T place pay prompts on the first load or between stages repeatedly; offer a skip for 20 to 99 R$ (2021 guides said 20 to 50; 2026 live games price small utilities at 49 to 139). [S31][S26]
- DO make DCO tiers legible: 10 named tiers, 20 to 30 stages each, a free skip on a 12-hour timer and a practice area. [S26]

### Speed-escape and tsunami
- DO map a speed stat to WalkSpeed through a saturating, server-clamped curve and scale the course with it; DON'T let the client set speed. [S28]
- DO price the stage-teleport ladder at about 2.3x per step (derived from the 12-step table), trail tiers at about 3.8x win cost per tier and treadmills as Robux multipliers (x3, x9, x25, x100); keep a free 1x path. [S50][S51]
- DO give every long run a revive hook: a rewarded-video revive protects progress (Roblox lists this placement for +1 Speed and Evade). [S23]
- DO make tsunami waves deterministic from a timetable (spawn time, speed, lane) so you can verify every pit is reachable: wave arrival time must exceed pit distance divided by the speed the zone requires, plus a 1 to 2 second margin (my recommendation).

### Racing
- DO start from the Racing template for a lobby race and choose the authority model on day one: classic network ownership (driver owns the car) for casual, Server Authority for competitive. [S11][S17][S10]
- DO register a racer collision group and make racers non-colliding for casual lobbies. [S19]
- DO validate gates by segment crossing, not `Touched` (snippet below). [03:S129]
- DON'T hard-code cash payouts without a ceiling: tie payout to track length and make cars the sink (03 recipe 20).
- DON'T use a client-side raycast or `GetPartBoundsInBox` for authoritative checks when StreamingEnabled is on. [S25]

## Recipes (each becomes a skill)

### Recipe 1: Checkpoint obby with server-validated progress
When to use: classic, stage or difficulty-chart obby.
Steps:
1. Create `Workspace/Stages` with models `Stage1..StageN`. Each has one `SpawnLocation` named `Checkpoint` tagged `Checkpoint`, with Attribute `StageIndex` (number), `Neutral = true`, `Duration = 0`, `AllowTeamChangeOnTouch = false`.
2. Tag hazards `Kill`; tag moving parts `Mover`; tag finish pad `Finish`.
3. Server script binds tags (snippet "Checkpoints and kill parts"). Accept stage k only if k equals current + 1 (blocks teleport skipping) or comes from a paid skip product handled elsewhere.
4. Save `Stage` in a DataStore with `UpdateAsync` and restore `RespawnLocation` on join.
5. Set `Players.RespawnTime` to 1 or lower; do not call the deprecated `LoadCharacter`. [S4]
6. Award a badge every 5 to 10 stages with `AwardBadgeAsync`; keep to the free five badges per 24 hours at creation. [S21]
7. First stage within about 20 studs of spawn; stage 1 to 5 need no jump over 4 studs; verify with Recipe 14.
Pitfalls: client-side kill or checkpoint scripts; a `SpawnLocation` with a team colour that mismatches players (only `Neutral = true` spawns every player) [S3]; very thin checkpoints that `Touched` misses on fast speed games.

### Recipe 2: Difficulty-chart obby (10 tiers, skips, rebirth)
When to use: a long linear chart with a long tail of players.
Steps:
1. Plan 10 tiers (Effortless, Easy, Medium, Hard, Challenging, Difficult, Intense, Extreme, Unreal, Error is a live example) and 10 to 30 stages per tier; first three tiers should be easy. [S26][S31]
2. Fold the chart into a spiral or zig-zag so 200 to 300 stages fit a small footprint and stream well (set tier models to `ModelStreamingMode` Atomic). [S26][S25]
3. Implement Recipe 1 with per-tier colour and a tier banner in the HUD.
4. Skip: a developer product for a 20 to 99 R$ skip of the current stage, plus a free skip every 12 hours (use `os.time()` stored with the player data). [S26][S31]
5. Rebirth at the end gives points or a permanent trail coin; add a leaderboard. [S26]
6. Add a practice area (one copy of each mechanic) next to spawn. [S26]
7. Update on a fixed day (one live DCO states "every other Sunday") with a new stage batch. [S26]
Pitfalls: all stages possible is a claim you must test; an impossible jump at a seam; skip prices that outrun the early game.

### Recipe 3: Random tower round (Tower of Hell style)
When to use: competitive timed climbs.
Steps:
1. Build a library of tower sections, each with `Difficulty` and `Height` attributes; assemble N sections per round (03 recipe 4 gives the reference timer of 8 minutes for a normal tower). [03:S115]
2. Round state machine: Intermission, Build, Countdown, Climb, Results; replicate with Attributes on a folder in ReplicatedStorage.
3. No checkpoints; falling sends the player down the tower but the timer continues (Juke's wiki-summary convention). [S58]
4. Give temporary gear per round bought with round coins.
5. Shorten the round when most players finish (make the factor a tunable; sources word the speed-up differently). [03:S114]
6. Reward: coins and a badge on first completion.
7. Run a seam validator (Recipe 14) over every section pair, including a maximum count of consecutive hard sections.
Pitfalls: sections whose entry and exit heights do not line up; random orders that stack three hard sections.

### Recipe 4: Troll or slap tower
When to use: the 2025-26 social tower format.
Steps:
1. Build an easy 20 to 40 stage tower with wide platforms; the challenge is other players, not the climb.
2. Gears are `Tool`s granted by tag and level; the server owns every effect: validate the hit (target within a range, cooldown) and apply knockback with `ApplyImpulse` on the victim's root part from the server, not the client.
3. Free gears unlock at play milestones; paid gears (carpet, laser, coils) are passes priced 78 to 799 R$; sell an Admin panel only if you can moderate it (live games price 499 to 1,499 R$). [S26]
4. Add a safe zone at spawn and respawn without penalty.
5. Run 20 to 32 players per server if the arena is large; live games range 20 to 32. [S26]
Pitfalls: griefing that drives off new players; client-trusted hit detection; an admin pass that lets buyers wreck the server.

### Recipe 5: Moving platforms, spinners and conveyors kit
When to use: any obby needing motion.
Steps:
1. Linear mover: anchored `Rail` part with an Attachment, unanchored `Platform` with an Attachment; both attachments' X axes along the travel direction; `PrismaticConstraint` with `ActuatorType` Motor, `MotorMaxForce` 50,000, `Velocity` 8 to 20 studs/s for obby (the docs' log example is 40), `LimitsEnabled` true with `LowerLimit` 0 and `UpperLimit` travel distance; flip velocity at the limits (snippet). [S15]
2. Spinner: `AngularVelocity` constraint or HingeConstraint motor, 2 to 6 rad/s; torque 1,000 for a 4x1x2 block and much more for large blocks. [S16]
3. Conveyor: set `AssemblyLinearVelocity` on an anchored conveyor part (a widely used community technique, not in the docs I read) or a LinearVelocity on an unanchored belt; verify the player is carried. (Heuristic; confirm in Studio.)
4. Keep a Tween-driven anchored part only for visuals; if a player must stand on it weld an unanchored top to it. [S27]
5. Set `SetNetworkOwner(nil)` on platforms where all players must see the same position; accept more latency. [S17]
6. Offset phases across a field of platforms with a start delay Attribute, as the Platformer template does with speed and delay attributes. [S12]
7. Tag platform models `ModelStreamingMode` Atomic so all parts stream together. [S25]
Pitfalls: platforms too light for the motor force; players stuttering on platforms (template feedback); ownership flipping when several players stand on one platform.

### Recipe 6: Jump pads, speed pads and kill volumes
When to use: Classic Obby template behaviour.
Steps:
1. Jump pad: on `Touched` by a foot, call `ApplyImpulse(Vector3.new(0, impulse, 0))`; the docs' sample uses 2,500 on the foot part; instead scale by `AssemblyMass` so all avatar sizes launch alike (heuristic). [S15]
2. Speed pad: LinearVelocity or a temporary WalkSpeed change on the server for 1 to 3 seconds.
3. Kill volume: use a large invisible part under the course set to `Health = 0` on touch with a per-player debounce.
4. Set `CanTouch` to false on parts that should never raise Touched events; touch events fire only when both parts have `CanTouch` true. [S18]
Pitfalls: firing from any body part (double triggers); client-side pads.

### Recipe 7: +1 Speed escape (treadmill, wins, rebirth)
When to use: the 2026 speed-escape format.
Steps:
1. World: a looping course of "key" parts (large coloured pads) that make a click sound; each key is tagged `Key`. Server awards speed on a foot touch with a 0.2 s per-key debounce; `speedGain = baseGain x treadmillMult x trailMult x rebirthMult`. [S50]
2. Treadmills are standing zones that give passive speed on a timer (a devforum snippet gives +1 WalkSpeed every 5 seconds on a treadmill with a debounce table to stop the repeat bug); multipliers x1 (free), x3, x9, x25, x100 sold as passes. [S41][S51]
3. Map speed to WalkSpeed with a saturating curve and clamp server-side (heuristic): `ws = 16 + (maxWs - 16) * (1 - math.exp(-speed / k))`.
4. 13 stages; completing a stage and stepping on its pad gives Wins; stage teleports cost 2, 6, 20, 40, 100, 200, 300, 600, 1,000, 2,000, 5,000, 20,000 wins (2.3x geometric). [S50]
5. Trails: Green to Rainbow (1.5x to 5x) bought with wins or Robux, Galaxy 10x and Choco 20x Robux only; auras stack; neither resets on rebirth. [S50]
6. Rebirth: needs gems or a speed threshold, resets speed, gives a permanent multiplier. [S50]
7. Add a free speed gift for like, group join and social code (15,000 each in the guide). [S50]
8. Add a rewarded revive pop-up for a failed stage run and a 79 to 99 R$ "disable popups" pass. [S23][S26]
9. Anti-cheat: Recipe 15.
Pitfalls: speed outgrowing physics (very high WalkSpeed breaks collision and streaming); stat inflation without a cap; clones with no second hook.

### Recipe 8: Tsunami run-and-bank
When to use: the 2026 tsunami format.
Steps:
1. Layout: a long straight map divided into zones; each zone has pits or safe volumes tagged `SafePit` at intervals that grow with zone length. [S46]
2. Brainrot (or any collectible) pickups: carried by the player, deposit at base for income per second by rarity; rarities and values in a table (income table above). [S46]
3. Wave scheduler: every N seconds pick a wave type from a weighted table (Super Slow, Slow, Medium, Fast, Lightning); wave speed in studs per second is data; start it behind the start line and move it along the map with a server loop (snippet). [S45]
4. Safety rule: arrival_time(pit) = distance(wave start, pit) / waveSpeed must exceed distance(player, pit) / requiredSpeed(zone) plus a 1 to 2 second margin. (My derivation.)
5. Kill rule: each Heartbeat, if a player's root is behind the wave front and not inside a `SafePit` box, kill; a plane check is robust at any speed, unlike `Touched`.
6. Upgrades: speed, carry capacity, base slots, income; rebirth. [S48]
7. Paid layer: a paid Beast Wave (19 R$ in the guide), shields and coils (129 to 888 R$ in the live pass list). [S45][S26]
8. Limit servers to 8 players. [S26]
Pitfalls: a wave faster than players can move at the zone's required speed; unreachable pits; unbounded income curve (the live game's Common-to-Celestial income spans about five orders of magnitude).

### Recipe 9: Vehicle obby (Obby But You're on a X)
When to use: a worlds-based vehicle obby.
Steps:
1. Build the vehicle as a single assembly (Seat, body, constraints) cloned per player on spawn; the player sits in a `VehicleSeat`. [S17]
2. Set `SetNetworkOwner(player)` when seated and back to auto on exit. [S17]
3. Create 10 to 100 stages per world, with a numbered world in the game title; add worlds on a live-ops rhythm. [S26][S63]
4. Use a `Racer` collision group to stop vehicles pushing each other (optional). [S19]
5. Sell world unlock passes (199 to 599 R$ in live games), a permanent double jump (79 R$), a gravity coil, VIP and a disable-popups pass (69 R$). [S26]
6. Provide a reset-vehicle key and a flip detector (if up vector Y is below 0.2 for 2 s, reset to the last checkpoint).
Pitfalls: vehicles that wedge on geometry; unreachable checkpoints at vehicle speed; physics cost at 10 or more vehicles. [03:S130]

### Recipe 10: Co-op two-player obby (tethered)
When to use: Chained, Carry the Glass and Biker Duo style.
Steps:
1. Matchmake pairs into private mini-servers or private zones (Biker Duo is 14 players per server as pairs).
2. Tether with a `RopeConstraint` or `RodConstraint` between the two characters' attachments; tune `Length` 8 to 14 studs (heuristic). [S18]
3. Checkpoints advance the pair, not one player; both must reach the checkpoint.
4. Revive and rewind items as products (Infinite Revives 139 R$, Unlimited Rewinds 599 R$). [S26]
5. Duo-time leaderboard (OrderedDataStore with a pair key). [S20]
Pitfalls: one disconnecting player stalling the pair; rope physics jitter (use server ownership of the rope assembly sparingly). [S17]

### Recipe 11: Lobby circuit race with segment-crossing gates
When to use: a lobby-queued kart or car race.
Steps:
1. Start from the Racing template; `Race` folder with `Checkpoint1..N` gate parts (thin, oriented so LookVector points down the track). [S11]
2. State machine: Queue, Grid, Countdown, Race, Finish, Reset (03 recipe 20 has the base loop).
3. Gates: sample each racer's car position every Heartbeat on the server; a gate counts if the segment last position to current position crosses the gate rectangle (snippet) and the racer already passed k-1.
4. Position score: `lap * 100000 + cp + fraction` (snippet). [S35]
5. Collision group `Racers` non-colliding for casual lobbies. [S19]
6. Ownership: driver owns the car on seat entry. [S17]
7. Payout: scale with track length and place; add a 2x pass and VIP pass (03).
8. Add a solo time trial with a ghost (Recipe 12).
Pitfalls: `Touched` missing fast cars; a gate outside the track bounds; unclamped lap count.

### Recipe 12: Time trial with ghost and leaderboard
When to use: solo race content.
Steps:
1. Record the player's car pose (position and yaw) at 15 to 20 Hz in a `buffer` (16 bytes a sample); store the best run only.
2. Compress and encode to a DataStore-safe string (Base64 or Base85 as the community module does); keep each key under the 4 MB DataStore limit (about 100 KB per 40 to 50 s in that module's format). [S34]
3. Playback: a client-only anchored, non-collidable ghost model lerped between samples in `RunService.PreRender` (or `RenderStepped`).
4. Best times: `OrderedDataStore` of integer milliseconds per track, `UpdateAsync` keeping the minimum, and `GetSortedAsync(true, 10)` for the top ten. [S20]
Pitfalls: storing floating times in an OrderedDataStore (integers only); recording at display rate (huge); client-reported times (compute on the server from `os.clock()` deltas). [S20][03:S129]

### Recipe 13: Scripted raycast-suspension car
When to use: a custom feel beyond the template.
Steps:
1. Body (Massless wheels optional), four wheel attachments, one `VectorForce` per wheel (RelativeTo World). [S33]
2. Each Heartbeat per wheel: raycast down length `rest + radius`; compression = `rest - (dist - radius)`; force = `k x compression - c x velAlongSpring` (stiffness 2,500, damping 250, rest 2, radius 1.5 as the tutorial's demo). [S33]
3. Traction: lateral friction force opposing sideways velocity at the wheel point, capped at `mu x normalLoad`. [S33]
4. Drive and brake: forward force at the wheel point from throttle input.
5. Network: driver owns the assembly. [S17]
6. Do not combine with Server Authority without rewriting for `BindToSimulation`. [S7][S33]
Pitfalls: oscillation from low damping; wheel visuals not following the ray hit; unit confusion (stiffness is in force per stud).

### Recipe 14: Gap and seam validator (design-time)
When to use: before publishing any obby or tower.
Steps:
1. Tag every standing platform with its stage in order.
2. For each consecutive pair compute the horizontal edge gap and vertical delta (snippet).
3. Fail the stage if gap greater than `0.54 x WalkSpeed` (use 8.5 at default for the main path, 12 for an expert tier) or climb greater than 6 studs. [S1][03:S119]
4. Run a bot or play-test pass in Studio on mobile emulation for the first five stages.
Pitfalls: rotated parts (the snippet is axis-aligned); moving platforms whose extremes are the real gap.

### Recipe 15: Obby and speed-game server validation
When to use: every obby or speed game.
Steps:
1. Stage progression: accept only current + 1. [S29]
2. Movement: each 0.25 s compare the root's displacement with `currentWalkSpeed x dt x 1.5` (grace for lag); on a breach, teleport back to the last good position; after three strikes kick. [S28]
3. Set WalkSpeed only from server scripts; log client changes. [S28]
4. Flag long airtime without a Humanoid FloorMaterial (flying) and fast vertical changes. [S28]
5. Leaderboard-bound results: store only server-computed times; manual review of top runs. [S29]
6. Optional: opt in to Server Authority (full release 2026-07-09) when the game is competitive. [S8]
Pitfalls: permanent bans from lag; trusting `Humanoid.WalkSpeed` read from the client.

### Recipe 16: Movement tech: dash, wall-hop and bhop
When to use: parkour or movement-driven games.
Steps:
1. Decide the controller: default Humanoid with attribute tuning (wall-hop, long jump), CCL custom ability (dash) or a custom air-strafe controller (bhop). [S6][S37][S38]
2. Dash via CCL: ability `Dash` with `StartsWhen = All(Sensor.Ground, Not("DashCooldown"))`, timed labels `DashWindow` 0.2 s and `DashCooldown` 1.0 s, `ApplyImpulse` of `RootLookVector x 80 x AssemblyMass`; register on the server with `AvatarAbilities.addAbilityForCharacter`. [S6]
3. Bhop starting values from the module: ground acceleration 14, air acceleration 12, max air wish speed 30, landing grace 0.15 s. [S37]
4. Platformer template route for double jump, roll and long jump with its Constants module. [S12]
5. Ship the movement behind a feature flag and test with 100 ms simulated latency; if you enable Server Authority, scripted abilities must run on both sides. [S6][S8]
Pitfalls: CCL is beta; bhop with a Humanoid fights the default friction; callbacks that yield break CCL frames.

### Recipe 17: Rewarded revive and ad layer
When to use: any run-based obby or speed game with 2,000 or more monthly unique visitors.
Steps:
1. Create a developer product (the reward) priced around 3 to 10 Robux in value; it cannot be a random item. [S22]
2. In Creator Hub: Monetization, Ads, Settings, Rewarded Video, enable serving and pick the product. [S22]
3. Client: `AdService:GetAdAvailabilityNowAsync(Enum.AdFormat.RewardedVideo)` as late as possible; show a "Watch to revive" button. [S22]
4. Server: `AdService:CreateAdRewardFromDevProductId(id)` then `ShowRewardedVideoAdAsync(player, reward)`; grant the revive in `ProcessReceipt`. [S22]
5. Pause hazards for the player during the ad. [S22]
6. Sell a "disable pop-ups" pass (29 to 99 R$ in live games). [S26]
Pitfalls: rewarding randomised items (not allowed); showing an ad at a spot that kills the player.

## Luau reference snippets

Checkpoints and kill parts (server, `ServerScriptService`):
```lua
--!strict
local Players = game:GetService("Players")
local CollectionService = game:GetService("CollectionService")

local STAGE = "Stage"

local function playerFromHit(hit: BasePart): Player?
	local character = hit:FindFirstAncestorOfClass("Model")
	return character and Players:GetPlayerFromCharacter(character) or nil
end

local function bindCheckpoint(spawn: Instance)
	if not spawn:IsA("SpawnLocation") then return end
	local index = spawn:GetAttribute("StageIndex")
	if typeof(index) ~= "number" then return end
	spawn.Touched:Connect(function(hit: BasePart)
		local player = playerFromHit(hit)
		if not player then return end
		local current = (player:GetAttribute(STAGE) :: number?) or 0
		if index == current + 1 then
			player:SetAttribute(STAGE, index)
			player.RespawnLocation = spawn
		end
	end)
end

local function bindKill(part: Instance)
	if not part:IsA("BasePart") then return end
	part.Touched:Connect(function(hit: BasePart)
		local humanoid = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if humanoid and humanoid.Health > 0 then
			humanoid.Health = 0
		end
	end)
end

for _, inst in CollectionService:GetTagged("Checkpoint") do bindCheckpoint(inst) end
CollectionService:GetInstanceAddedSignal("Checkpoint"):Connect(bindCheckpoint)
for _, inst in CollectionService:GetTagged("Kill") do bindKill(inst) end
CollectionService:GetInstanceAddedSignal("Kill"):Connect(bindKill)

Players.RespawnTime = 1
```

Linear mover with PrismaticConstraint (docs values), reverse at limits:
```lua
--!strict
local function makeSlider(rail: BasePart, platform: BasePart, direction: Vector3, travel: number, speed: number)
	-- rail anchored, platform unanchored; direction is a unit vector perpendicular to world up
	local pivot = platform.Position
	local frame = CFrame.fromMatrix(pivot, direction, Vector3.yAxis)
	local a0 = Instance.new("Attachment")
	a0.Parent = rail
	a0.WorldCFrame = frame -- set after parenting so the world frame resolves
	local a1 = Instance.new("Attachment")
	a1.Parent = platform
	a1.WorldCFrame = frame

	local slider = Instance.new("PrismaticConstraint")
	slider.Attachment0 = a0
	slider.Attachment1 = a1
	slider.LimitsEnabled = true
	slider.LowerLimit = 0
	slider.UpperLimit = travel
	slider.ActuatorType = Enum.ActuatorType.Motor
	slider.MotorMaxForce = 50000
	slider.Velocity = speed
	slider.Parent = platform

	task.spawn(function()
		while slider.Parent do
			if slider.CurrentPosition >= travel - 0.1 then
				slider.Velocity = -speed
			elseif slider.CurrentPosition <= 0.1 then
				slider.Velocity = speed
			end
			task.wait(0.05)
		end
	end)
	return slider
end
```

Spinner (AngularVelocity, docs values):
```lua
local function makeSpinner(part: BasePart, radiansPerSecond: number, maxTorque: number)
	local attachment = Instance.new("Attachment")
	attachment.Parent = part
	local spin = Instance.new("AngularVelocity")
	spin.Attachment0 = attachment
	spin.RelativeTo = Enum.ActuatorRelativeTo.World
	spin.AngularVelocity = Vector3.new(0, radiansPerSecond, 0)
	spin.MaxTorque = maxTorque -- 1000 for a 4x1x2 block per the docs; much more for big parts
	spin.Parent = part
end
```

Gap validator (axis-aligned approximation):
```lua
local function horizontalGap(a: BasePart, b: BasePart): number
	local dx = math.max(0, math.abs(a.Position.X - b.Position.X) - (a.Size.X + b.Size.X) / 2)
	local dz = math.max(0, math.abs(a.Position.Z - b.Position.Z) - (a.Size.Z + b.Size.Z) / 2)
	return math.sqrt(dx * dx + dz * dz)
end

local function maxReach(walkSpeed: number, jumpHeight: number, gravity: number): number
	return walkSpeed * 2 * math.sqrt(2 * jumpHeight / gravity) -- 8.67 at 16, 7.2, 196.2
end
```

Gate crossing and race progress:
```lua
--!strict
-- gate: CFrame whose LookVector points down the track; size: gate width (X) and height (Y)
local function crossedGate(gate: CFrame, size: Vector3, fromPos: Vector3, toPos: Vector3): boolean
	local a = gate:PointToObjectSpace(fromPos)
	local b = gate:PointToObjectSpace(toPos)
	-- forward is -Z in object space
	if a.Z > 0 and b.Z <= 0 then
		local t = a.Z / (a.Z - b.Z)
		local p = a:Lerp(b, t)
		return math.abs(p.X) <= size.X / 2 and math.abs(p.Y) <= size.Y / 2
	end
	return false
end

local function progress(lap: number, passed: number, pos: Vector3, prevGate: Vector3, nextGate: Vector3): number
	local span = (nextGate - prevGate).Magnitude
	local fraction = if span > 0 then 1 - math.clamp((pos - nextGate).Magnitude / span, 0, 1) else 0
	return lap * 100000 + passed + fraction
end
```

Best time with OrderedDataStore:
```lua
local DataStoreService = game:GetService("DataStoreService")
local function submitTime(trackId: string, userId: number, milliseconds: number)
	local store = DataStoreService:GetOrderedDataStore("BestMs_" .. trackId)
	local ok, err = pcall(function()
		store:UpdateAsync(tostring(userId), function(old: number?)
			if old == nil or milliseconds < old then
				return milliseconds
			end
			return nil -- keep the existing best
		end)
	end)
	if not ok then warn("best time save failed", err) end
end

local function topTen(trackId: string)
	local store = DataStoreService:GetOrderedDataStore("BestMs_" .. trackId)
	local pages = store:GetSortedAsync(true, 10) -- ascending: fastest first
	return pages:GetCurrentPage() -- array of { key = string, value = number }
end
```

Wave mover (plane check, server):
```lua
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

-- The wave front travels along +X from startX to endX. The base must sit beyond endX
-- or inside a SafePit, otherwise players behind the front are treated as caught.
local function runWave(startX: number, endX: number, speed: number, safePits: {BasePart}, hazard: BasePart)
	local x = startX
	local conn
	conn = RunService.Heartbeat:Connect(function(dt: number)
		x += speed * dt
		hazard.CFrame = CFrame.new(x, hazard.Position.Y, hazard.Position.Z)
		for _, player in Players:GetPlayers() do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if root and root:IsA("BasePart") and root.Position.X < x then
				local safe = false
				for _, pit in safePits do
					local rel = pit.CFrame:PointToObjectSpace(root.Position)
					if math.abs(rel.X) <= pit.Size.X / 2 and math.abs(rel.Y) <= pit.Size.Y / 2 and math.abs(rel.Z) <= pit.Size.Z / 2 then
						safe = true
						break
					end
				end
				if not safe then
					local humanoid = root.Parent and root.Parent:FindFirstChildOfClass("Humanoid")
					if humanoid then humanoid.Health = 0 end
				end
			end
		end
		if x >= endX then conn:Disconnect() end
	end)
end
```

CCL dash ability (from the docs; beta):
```lua
local AvatarAbilities = require("@rbx/AvatarAbilities")
local Rule = AvatarAbilities.Rule
local Sensor = AvatarAbilities.Identifiers.Sensor
local All, Not = Rule.All, Rule.Not

local Dash: AvatarAbilities.AbilityDefinition = {
	Name = "Dash",
	Labels = { "Dashing" },
	StartsWhen = All(Sensor.Ground, Not("DashCooldown")),
	RunsWhile = "DashWindow",
	Input = { InputName = "Dash", Mode = "Press", ActionSlot = 5 },
	TimedLabels = { OnStart = { DashWindow = 0.2 }, OnStop = { DashCooldown = 1.0 } },
}
function Dash.OnStart(managerCtx, abilityCtx)
	local root = managerCtx.AbilityOwner.PrimaryPart
	if root then root:ApplyImpulse(managerCtx.RootLookVector * 80 * root.AssemblyMass) end
end
return Dash
```

Collision groups for racers:
```lua
workspace:RegisterCollisionGroup("Racers")
workspace:CollisionGroupSetCollidable("Racers", "Racers", false)
-- then set part.CollisionGroup = "Racers" on every car part
```

Vehicle network ownership (docs pattern):
```lua
vehicleSeat:GetPropertyChangedSignal("Occupant"):Connect(function()
	local humanoid = vehicleSeat.Occupant
	local player = humanoid and game:GetService("Players"):GetPlayerFromCharacter(humanoid.Parent)
	if player then
		vehicleSeat:SetNetworkOwner(player)
	else
		vehicleSeat:SetNetworkOwnershipAuto()
	end
end)
```

## Open questions / unverified
- No developer interview, talk or postmortem was found for Barry's Prison Run, Evade, Mega Fun Obby, Steep Steps or the +1 Speed games; developer voice here is limited to devforum threads and Roblox's own spotlight material. Searches returned wikis and guides only.
- Wave speeds in studs per second, brainrot spawn weights, base income formulas and pit spacing for Escape Tsunami For Brainrots are not published in anything I could fetch; zone speed requirements differ between two guides at the top end.
- The Swing Obby peak conflicts (252,003 on 2026-03-14 at Rolimons, about 87,000 in RoWatcher's article); the Escape Tsunami launch date conflicts (created 2025-12-15 by API, 2026-01-05 in one press piece).
- Barry's Prison Run's Rolimons page shows a favourites figure of 105,224,568, which is larger than any plausible player base for 668k votes; I excluded it. The API returns the same number, so it may be a platform counting quirk.
- Whether the engine caps `HingeConstraint.AngularVelocity` for fast wheels and the exact humanoid jump envelope at high WalkSpeed are not stated in the docs I read; test in Studio.
- Server Authority's behaviour with unanchored PrismaticConstraint movers and with the Character Controller Library together is not documented in the pages I read; the release notes say vehicle physics is supported. Whether a conveyor driven by `AssemblyLinearVelocity` on anchored parts carries a Server Authority character is unverified.
- Midnight Racing: Tokyo and Dream Racers did not appear in the 2026-10-04 public search results; their current player counts are unknown.
- Playtime and retention numbers for obby and racing specifically (D1, D7, D30) remain unsourced; 03 holds the generic Roblox medians and a low-confidence genre table in which obby is the lowest. [03:S107][03:S109]
- Older-than-2024 flags: S29 to S32 and S35 to S36 are from 2020 to 2021 and may be stale; their prices (skip stage 20 to 50 R$) are below 2026 live prices.

## Sources
[S1] Humanoid class reference (JumpHeight, JumpPower, WalkSpeed, MaxSlopeAngle, FloorMaterial), Roblox Creator Docs, text from the creator-docs repository read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Humanoid
[S2] StarterPlayer and Player class references (AutoJumpEnabled, CharacterJumpHeight, CharacterJumpPower, CharacterWalkSpeed), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/StarterPlayer
[S3] SpawnLocation class reference (Duration default 10, Neutral, AllowTeamChangeOnTouch) and Player.RespawnLocation, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/SpawnLocation
[S4] Players.RespawnTime (default 5) and Player:LoadCharacterAsync (LoadCharacter deprecated), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Players
[S5] Workspace class reference (Gravity 196.2, GetServerTimeNow), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Workspace
[S6] Character Controller Library: overview, quick start and custom abilities (beta), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/characters/character-controller-library
[S7] Server authority model and Server authority techniques, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/projects/server-authority
[S8] [Full Release] Ship Fair And Competitive Games with Server Authority, Roblox DevForum announcement, 2026-07-09, https://devforum.roblox.com/t/full-release-ship-fair-and-competitive-games-with-server-authority/4727993
[S9] [Studio Beta] Build Fair, Responsive Games with Server Authority, Roblox DevForum announcement, 2025-12-09, https://devforum.roblox.com/t/studio-beta-build-fair-responsive-games-with-server-authority/4139157
[S10] Racing - Server Authority Template, Roblox Resources, roblox.com (read 2026-10-04), https://www.roblox.com/games/134686834388911/Racing-Server-Authority-Template
[S11] New Studio Racing Template!, Roblox DevForum announcement, 2024, https://devforum.roblox.com/t/new-studio-racing-template/2805745
[S12] New Platformer Template!, Roblox DevForum announcement, 2024-07-26, https://devforum.roblox.com/t/new-platformer-template/3088494
[S13] Studio templates (Platformer, Racing, Classic Obby, Classic Racing), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/resources/templates
[S14] Roblox units (1 stud = 28 cm, RMU = 21.952 kg), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/physics/units
[S15] Create moving objects (LinearVelocity, PrismaticConstraint, ApplyImpulse values), Roblox Creator Docs tutorial, read 2026-10-04, https://create.roblox.com/docs/tutorials/use-case-tutorials/physics/create-moving-objects
[S16] Create spinning objects (AngularVelocity and HingeConstraint motor values), Roblox Creator Docs tutorial, read 2026-10-04, https://create.roblox.com/docs/tutorials/use-case-tutorials/physics/create-spinning-objects
[S17] Network ownership (automatic ownership, vehicle SetNetworkOwner pattern), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/physics/network-ownership
[S18] VehicleSeat, HingeConstraint, SpringConstraint, SlidingBallConstraint/PrismaticConstraint, LinearVelocity, AngularVelocity, VectorForce and BasePart (CanTouch) class references, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/VehicleSeat
[S19] Collisions and collision groups (WorldRoot:RegisterCollisionGroup, CollisionGroupSetCollidable), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/workspace/collisions
[S20] Data stores (ordered data stores, GetSortedAsync, integer values), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/cloud-services/data-stores
[S21] Badges (5 free per 24 h, 100 Robux each) and BadgeService:AwardBadgeAsync, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/production/publishing/badges
[S22] Rewarded video ads (eligibility, 3 to 10 Robux guidance, AdService calls), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/production/promotion/rewarded-video-ads
[S23] Ad placement showcases for +1 Speed Keyboard Escape, Evade and Barry's Prison Run, Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/production/ad-placements
[S24] Genres (Obby & platformer subgenres, Sports & racing, change once per three months), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/production/publishing/experience-genres
[S25] Streaming techniques (client spatial queries see streamed content only, ModelStreamingMode), Roblox Creator Docs, read 2026-10-04, https://create.roblox.com/docs/workspace/streaming/techniques
[S26] Roblox public web endpoints snapshot pulled by me on 2026-10-04: games.roblox.com/v1/games, apis.roblox.com/game-passes/v1/universes/{id}/game-passes, apis.roblox.com/search-api/omni-search (undocumented; point-in-time), https://games.roblox.com/v1/games
[S27] How to make moving platform that sticks to you, Roblox DevForum thread, 2024-11-08 (replies to 2025-02), https://devforum.roblox.com/t/how-to-make-moving-platform-that-sticks-to-you/3250824
[S28] How can I properly make anti-cheat for a +1 Speed Escape Obby?, Roblox DevForum thread, 2026-03-17, https://devforum.roblox.com/t/how-can-i-properly-make-anti-cheat-for-a-1-speed-escape-obby/4525520
[S29] Patching exploits in a competitive obbies, Roblox DevForum thread (EmilioEnito), 2024-08-13, https://devforum.roblox.com/t/patching-exploits-in-a-competitive-obbies/3115985
[S30] What makes an obby level "good"?, Roblox DevForum thread (7z99, mlghtytemplate), 2022, https://devforum.roblox.com/t/what-makes-an-obby-level-good/1672609
[S31] The Guide To Making A Difficulty Chart [Part 1], Shr3ne, Roblox DevForum, 2021-03-28 (stale), https://devforum.roblox.com/t/the-guide-to-making-a-difficulty-chartpart-1/1135152
[S32] How to refine your "Obby" game!, sydmisst, Roblox DevForum, 2020-11-09 (stale), https://devforum.roblox.com/t/how-to-refine-your-obby-game/862904
[S33] In Depth Scripted Car Physics, bIorbee, Roblox DevForum community tutorial, 2025-09-03, https://devforum.roblox.com/t/in-depth-scripted-car-physics/3915628
[S34] Universal Ghost Replay System, 1xayd, Roblox DevForum, 2025-10-19 (updated to 2026-07), https://devforum.roblox.com/t/universal-ghost-replay-system/4014417
[S35] Race placement system thread (Greenboo5, VanillaGorilla), Roblox DevForum, 2021, https://devforum.roblox.com/t/race-placement-system-how-do-i-know-who-is-in-first-second-or-third-place/1590589
[S36] How do I make a drift to boost mechanism for my car?, Roblox DevForum thread (RamJoT), 2020, https://devforum.roblox.com/t/how-do-i-make-a-drift-to-boost-mechanism-for-my-car/929294
[S37] Bhop & Air Movement Module + Surfing, sylwek1100 (Rocky), Roblox DevForum, 2025-09-02, https://devforum.roblox.com/t/bhop-air-movement-module-surfing/3914600
[S38] Conserving Momentum in Air + Airstrafing, Surfing (Custom Character Controller), Troxter5, Roblox DevForum, 2026-03-02, https://devforum.roblox.com/t/conserving-momentum-in-air-airstrafing-surfingbad-custom-character-controller/4461502
[S39] (SOLVED) How does Roblox Evade do their Character Controller?, Roblox DevForum thread, 2024, https://devforum.roblox.com/t/solved-how-does-roblox-evade-do-their-character-controller/3230722
[S40] [Feedback] Slap Tower, ItzBlandy, Roblox DevForum, 2025-05, https://devforum.roblox.com/t/feedback-slap-tower-%E2%80%93-inspired-by-the-slap-trend/3646760
[S41] Treadmill Bug (Explained in Post), Roblox DevForum thread, 2024, and search-result summary of anti-cheat advice mentioning a 250 studs-per-second clamp (search summary only), https://devforum.roblox.com/t/treadmill-bug-explained-in-post/3033431
[S42] Rolimons game pages (third-party): Tower of Hell, Swing Obby for Brainrots, Barry's Prison Run, Mega Fun Obby, Steep Steps, Evade, Escape Tsunami For Brainrots, +1 Speed Keyboard Escape ASMR, Driving Empire; read 2026-10-04, https://www.rolimons.com/game/1962086868
[S43] Best Obby-platformer Roblox Games, Top 100, ServicesPV (third-party), data as of 2026-10-03, https://servicespv.com/en/roblox/leaderboard/obby-platformer
[S44] Is the Brainrot Trend Dying? What CCU Data From Three Top Games Reveals, RoWatcher News (third-party), 2026, https://rowatcher.com/news/is-the-brainrot-trend-dying-what-ccu-data-from-three-top-games-reveals
[S45] All Wave Types in Escape Tsunami for Brainrots Explained, Gamer Tweak, 2026-02-04, https://gamertweak.com/wave-types-escape-tsunami-for-brainrots/
[S46] All Zones in Escape Tsunami for Brainrots, TechWiser, updated 2026-05-04 (income ranges from search summary), https://techwiser.com/escape-tsunami-for-brainrots-all-zones/
[S47] Escape Tsunami For Brainrots progression zones guide, escapetsunamiforbrainrots.com, January 2026, https://escapetsunamiforbrainrots.com/escape-tsunami-for-brainrots-wiki/progression-zones
[S48] Escape Tsunami for Brainrots: Roblox's Next Brainrot Juggernaut, MaxPowerGaming, 2026, https://www.maxpowergaming.co/post/escape-tsunami-for-brainrots-roblox-s-next-brainrot-juggernaut
[S49] Escape Tsunami for Brainrots Might Be Roblox's Wildest Survival Game, Gameindustry.com, 2026-01-15, https://www.gameindustry.com/news-industry-happenings/escape-tsunami-for-brainrots-might-be-robloxs-wildest-survival-game/
[S50] +1 Speed Keyboard Escape: How to Build Speed, Farm Wins, and Rebirth, allthings.how, updated 2026-06-18, https://allthings.how/1-speed-keyboard-escape-how-to-build-speed-farm-wins-and-rebirth/
[S51] All Treadmills in +1 Speed Keyboard Escape, TechWiser, updated 2026-07-26, https://techwiser.com/treadmills-in-1-speed-keyboard-escape/
[S52] Driving Empire Schedule: Volvo Update Countdown and What's Next, allthings.how, 2026-09, https://allthings.how/driving-empire-car-racingrp-events-schedule/
[S53] Driving Empire 2026 New Player Roadmap: 30-Day Cash, drivingempirewiki.wiki (third-party), 2026, https://drivingempirewiki.wiki/en/guides/driving-empire-2026-new-player-roadmap/
[S54] 5 best Roblox driving games to play in 2026, The Spike, 2026-08-24, https://www.thespike.gg/roblox/best-roblox-games/best-driving-games
[S55] How Dream Racers uses Roblox's Cube AI to generate playable vehicles in real time, GamesBeat, 2026-09, https://gamesbeat.com/how-dream-racers-uses-robloxs-cube-ai-to-generate-playable-vehicles-in-real-time-exclusive/ ; plus Mogura VR interview (GDC 2026) https://www.moguravr.com/roblox-creator-interview-gdc2026-en/
[S56] An interview with ROBLOX racing game developer: NR - Studios, Sectator Media, 2023-11 (stale), https://sectator.media/2023/11/an-interview-with-roblox-racing-game-developer-nr-studios/
[S57] Tower of Hell history pages (community wiki and BloxBonuses; search summary): release 2018-06-18, 2021-02-24 section cut, https://tower-of-hell.fandom.com/wiki/History
[S58] Juke's Towers of Hell community wiki, tower types and checkpoint behaviour (search summary; wiki returned HTTP 402), https://jtoh.fandom.com/wiki/Tower
[S59] Steep Steps game description and community write-ups (search summary), https://www.roblox.com/games/11606818992/STEEP-STEPS
[S60] Mega Fun Obby developers and stage counts (search summary of community wiki and Roblox pages), https://obby.fandom.com/wiki/Mega_Fun_Obby
[S61] Barry's Prison Run (PlatinumFalls) community wiki page (search summary), https://roblox.fandom.com/wiki/Player:PlatinumFalls/BARRY%27S_PRISON_RUN!
[S62] Evade game information (Hexagon Development Community; search summary), https://evade.fandom.com/wiki/Evade
[S63] Obby But You're On a Bike: world count and developer (search summary), https://www.rolimons.com/game/14184086618
[S64] Genre design craft for Roblox games (this research folder), 03-genre-design.md, 2026-10-04, `03-genre-design.md`
