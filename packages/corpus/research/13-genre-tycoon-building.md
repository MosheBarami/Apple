# Tycoons, base building, life-sim building and placement systems
_Researched 2026-10-04 by deep-research agent (Claude), Round 2. Sources: 106 (about 28 first-party docs or announcements, about 27 named DevForum threads, the rest press, trackers and guides; see the trust labels)._

How to read the labels. "[Sx]" cites the source list at the bottom. "Third-party" means a tracker, wiki, press or guide site, not Roblox and not the game's developer; its numbers are snapshots that drift. "Derived" means I computed it from stated values (the arithmetic is shown) or from a Luau script I ran on 2026-10-04 (the scripts are in the recipes). "Heuristic" means a starting value from guides or forum posts with no measured source. "Search summary" means the page itself blocked the fetch (Fandom pages return HTTP 402 or a CAPTCHA, a few sites 403) and the fact comes from a search-result summary; treat it as less certain. Rolimons figures were read on 2026-10-04 and carry no snapshot timestamp beyond a relative "last updated". This note goes deeper than `03-genre-design.md` (which has the tycoon kit numbers, the rebirth math and Bloxburg bills); it does not repeat them, except where a correction is needed. Code in the recipes was syntax-checked with `luau-analyze` and the pure-logic parts were run with `luau` on 2026-10-04; the Roblox-API calls are checked against the docs listed, not run in Studio.

## Key facts

### 1. What "tycoon" means on Roblox in 2026
- Roblox's own genre picker files Tycoon under Simulation (described as business or base management), next to Sandbox (building tools) and Incremental Simulator; "Life" and "Morph" sit under Roleplay & Avatar Sim. There is no official Tycoon template: the docs' template list names Platformer, Racing, Baseplate, Modern City, Village, Castle, Suburban and Obby, and Plant is the only official full reference project (a farm game, Aug 2023). [S1][S23][S24][S4]
- The community and press use "tycoon" for at least nine different products. The taxonomy below is my grouping of the games named in the lists and wikis I read; it is not a Roblox classification. [S96][S98][S99][S100]
  1. Pad-and-dropper tycoons (claim a plot, buy buttons, droppers feed a collector): the classic kit loop, now mostly themed (War Tycoon, Military Tycoon, Super Hero Tycoon, Elemental Powers Tycoon). [S99]
  2. Business-sim tycoons with NPC customers and staff (Retail Tycoon 2, Restaurant Tycoon 2 and 3, Mall Tycoon, Store Empire, Hospital Tycoon). [S99][S95]
  3. Sandbox or placement tycoons where the player lays out the base (Theme Park Tycoon 2, Miner's Haven, Lumber Tycoon 2). [S54][S51][S99]
  4. Collection and dealership tycoons (Car Dealership Tycoon: 400+ vehicles per the 2025 list, 600+ per Rolimons in 2026). [S99][S84]
  5. House and mansion tycoons (Mega Mansion Tycoon, Dreamhaven, Barbie DreamHouse Tycoon by Gamefam). [S98][S99]
  6. Life-sim builders with jobs, bills and a plot (Welcome to Bloxburg). [S64][S89]
  7. Build-and-use games with parts (Build A Boat For Treasure). [S81][S37]
  8. 2025-26 base-defend-steal hybrids: Steal a Brainrot and Steal An Egg. [S63][S65]
  9. Plot-idle and roll hybrids: Grow a Garden, Anime Dice (roll dice for units, place them on your plot, they earn cash even offline). [S66][S91]
- Platform-wide claims that "tycoons are the second most played category" and "38% day-7 retention for prestige tycoons" appear only on SEO guide sites with no method or source, and the 38% figure is far above the GameAnalytics medians (D7 1.6%, 500+ large Roblox games, 2025-08 to 2026-07, from 03). Do not use either number. [S96]
- The same guide-list genre is full of dead entries: Miner's Haven is described as "one of the largest sandbox tycoons" in a 2025 list, yet Rolimons shows an all-time peak of 7,803 CCU, 159 players in the last 24 hours' peak and an 81% rating (2026-10-04). Lists name games by past fame, not current play. [S99][S83]

### 2. Current numbers for the genre (third-party, Rolimons read 2026-10-04)
| Game (creator) | Max per server | Avg playtime | All-time peak CCU | 24 h peak | Visits | Favourites | Rating |
|---|---|---|---|---|---|---|---|
| Steal An Egg (group "and Collect Rare Pets") | 7 | 14.2 min | 14.29M | 12.39M | 6.61B | 6.67M | 92.3% |
| Anime Dice (More & More Games, released 2026-08-15) | 9 | 28.3 min | 76.8K | 72.3K | 61.1M | 126K | 99.3% |
| Restaurant Tycoon 3 (Ultraw) | 6 | 26.5 min | 67.4K (2025-08-31) | 15.8K | 373.8M | 899K | 95.3% |
| Car Dealership Tycoon (Foxzie) | 15 | 16.4 min | 66.7K (2023-09-16) | 6.0K | 2.53B | 3.73M | 92.9% |
| Theme Park Tycoon 2 (Den_S) | 6 | 24.2 min | 58.0K (2024-07-13) | 6.3K | 1.62B | 6.10M | 89.0% |
| War Tycoon (KizmoTek) | 18 | 21.1 min | 43.8K | 30-day 21.8K | 1.12B | 4.42M | 91.3% |
| Lumber Tycoon 2 (Defaultio) | 6 | 17.1 min | page lists 34.2K as 30-day and "all-time" | 15.3K | 1.33B | 4.65M | 87.7% |
| Retail Tycoon 2 (Secondhand Studios) | 6 | 30.3 min | 27.3K (2021-07-26) | 2.4K | 338.7M | 1.41M | 88.4% |
| Miner's Haven (berezaa) | 6 | 22.8 min | 7.8K | 159 | 200.2M | 1.32M | 81.2% |
| Build A Boat For Treasure (Chillz Studios) | 7 | 17.9 min | 89.6K (2021-04-02) | 25.2K | 5.22B | 8.54M | 93.4% |
| Welcome to Bloxburg (Bloxburg Development) | 12 | 21.9 min | 592.5K | 29.0K | 10.12B | 14.0M | 88.5% |
| Brookhaven RP (for contrast) | 30 | 16.9 min | 1.30M | 619K | 88.2B | 30.3M | 85.9% |
[S75][S86][S76][S84][S77][S82][S78][S79][S83][S81][S80][S85]
- Reading (derived): the business and sandbox tycoons run 6-player servers and hold players the longest (22-30 minutes average playtime) but their peaks are 27K-67K; the base-steal hybrids run 7-9 player servers, have shorter sessions (14 minutes for Steal An Egg) and peaks two to three orders of magnitude higher. Rolimons also reports a 14.20-minute average for Steal An Egg while Player.One estimated about 15 minutes. [S75][S70]
- The tycoon-building tier of the 2026 charts is mostly legacy: no tycoon, base or building game appeared in StudioKrew's July 2026 top ten except the plot-idle hybrid Grow a Garden 2, and the same note calls pure idle games visibly fatiguing and says successful entries added a social-risk layer (theft, raids). [S67] Earlier in 2026 (note dated 2026-04-29) the same outlet gave Steal a Brainrot a typical range of 600K-900K CCU after its 25.8M peak, Grow a Garden 1.0M-1.2M and Adopt Me 500K-550K, so the base-steal and plot-idle formats were already the large tycoon-adjacent products before Steal An Egg. [S68]

### 3. Case studies (what the hits actually shipped)
**Steal An Egg (released 2026-07-25), the 2026 breakout.** Loop: grab an egg from a nest, run it home past guardians and other players, hatch a pet that earns passive cash, spend cash on speed (treadmill training or Robux) so you can enter richer biomes; 7-player servers; 9 biomes each gated by a speed floor and a different guardian; 84 pets across ten rarity tiers from Common ($1/s) through Legendary (~$1.8K/s) and Cosmic (~$220K-280K/s) to Eternal ($65M-180M/s) and Divine ($1B-6.9B/s) (third-party, approximate). [S65][S73][S74][S75] StudioKrew credits the 7-player cap for making theft personal; MaxPower Gaming calls it brainrot theft-and-base-defence crossed with pet-simulator hatching. [S65][S69] Trackers disagree on the peak (Rolimons 14.29M on 2026-10-04; Rolimons about 9.9M as quoted on 2026-09-09; ggaid 11.6M on 2026-10-03; RoVitals 14.27M dated 2026-08-12, which conflicts with Rolimons' "2 weeks ago"), and an Aug 20 snapshot had it at 281.7K, so the order of magnitude (millions by September) is the only usable fact. [S75][S70][S72][S71][S65] Policy event: the treadmill carried a "Reels" short-video feed; Roblox pulled the game after criticism and it returned without the feed (Kotaku, 2026-08-26, says it kept nearly 800,000 CCU); Roblox announced that games which show a media feed, use autoplay or infinite scroll and reward continued viewing are barred from its Kids and Select catalogs. [S61][S62] Builder rule: no embedded feed, no reward for watching.

**Steal a Brainrot (2025-05-16), the base template.** Eight bases per server, 100 cash start, a conveyor in the middle of the map sells brainrots (price rises each time another player tries to buy), the base holds passive earners, bases lock for 30 s on join and 60 s per lock with +10 s per rebirth, first floor 10 slots, floor 2 at the second rebirth, floor 3 at the tenth; thieves are slowed and lose items (Fandom summary, third-party, 2025-07-24). [S102][S101] Tiers (third-party, Dec 2025): Common $1-14/s up to Brainrot God $240K-295K/s; legendary spawns on the belt every 5 minutes and mythics every 15 (guaranteed per the wiki); rebirth 1 needs $500K-1M, rebirth 7 about $1B, rebirth 17 $2.5Qa. [S101] Slot counts disagree by source (22 at rebirth 13+ on one wiki, 27 elsewhere, 28 after the 2026-08-15 "Rebirth 19" update per a search summary), which shows how fast these tables drift. [S101][S102] A 2026-10-04 wiki page lists 18 rebirths, 14 mutations that multiply income, 40 gears and 13 Lucky Block types, each with a fixed reward pool. [S103] Wikipedia: peaks of 5M in July 2025, 20M in August, 24M on 2025-09-13 and 25.4M in October 2025; a January 2026 Bruno Mars concert peaked at 12.8M. [S63]

**Anime Dice (More & More Games, 2026-08-15).** Plot-idle with a roll mechanic: roll dice (shop upgrades that raise luck) for anime units, place them on your own plot where they earn cash (also offline), spend cash on better dice, upgrades and rebirths; 28 characters, 13 traits, 9 grades that set an income multiplier, mutation collection as the goal, maximum 9 players per server; launched without a public codex or published luck percentages and without PvP; code-driven early updates (RELEASE, UPDATE1, UPDATE2); Rolimons shows 76.8K peak, 28.3 minutes average playtime and 99.3% rating a month after launch. [S91][S92][S86] Lesson: a 30-minute-session loop can reach 75K CCU in a month without theft if the roll gives variance and the plot gives a visible collection.

**Restaurant Tycoon 3 (Ultraw Games, alpha 2025-05-02, beta 2025-06-24, free launch 2025-08-20).** First-party DevForum spotlight (2025-07-25): about 15 years in Roblox, Clone Tycoon (2015) and Clone Tycoon 2 (2016), Restaurant Tycoon (2017), Restaurant Tycoon 2 (six years before RT3), launched RT3 as paid access and used regional pricing; 50 new features over RT2 including plot digging (terrain), a 10-skill tree, co-op with friendship XP and global ingredient sourcing; posts two or more short videos a week; a "big" update or event followed by two or three smaller updates; tools named: Tag Editor (CollectionService), wireframe view for low-poly work, MessagingService announcements, onboarding-funnel analytics and thumbnail personalisation tests. [S48][S49] Numbers from guides (third-party): 224+ dishes across 50+ cuisines, up to 16 staff (8 chefs, 8 waiters), 3-floor buildings, 5-category rating where each category is worth one star (service: 8 chefs and 8 waiters at average level 5; food: 200+ dishes, 20 mains; atmosphere: 5 music genres, 5 roofs and 15-20 items per decor class; expansions: 100 customer seats, 200,000 restaurant value, 4 ad upgrades; hygiene: 3 toilets, 3 sinks, 12 bathroom items), and stars unlock special customers rather than raising spawn rate. [S94][S93][S95] The paid-entry price conflicts by source (the spotlight mentions the revenue share for $9.99 paid access; a wiki says 25 Robux during alpha and beta), so treat the price as unverified. [S48][S93] Rolimons: 67.4K peak on 2025-08-31, 373.8M visits, 26.5-minute playtime, 6 per server; a spotlight comment says RT3 ran at about a third of RT2's CCU while paid. [S76][S48] Update log: monthly releases, a Glass Animals band collaboration (2026-09-26), a Delivery update (2026-10-02), 34+ documented releases. [S49]

**Theme Park Tycoon 2 (Den_S).** Roblox's own spotlight (2019-06-03) credits the hit to a mix of creative building and social play (build with friends, advanced players can go deep); over 200M visits then; five tycoon designers on the team; an issue tracker for prioritising; over 1,000 text strings localised through Roblox's localization API, and Spanish localisation doubled the Spanish audience and raised their playtime; advice to keep scope small enough to release. [S54] Today: 1.62B visits, 6.10M favourites, 24-minute sessions, 6 players per server, last peak 58.0K (2024-07-13). [S77] Monetisation is mostly capacity: Rolimons lists a "24 extra expansion plots" pass (6,144 extra tiles, 374 Robux) and an "Increased height limit" pass (+10 blocks, 74 Robux) on 2026-10-04, while one 2026 comparison page calls the game "cosmetics only" without listing passes (a conflict; trust the pass pages). [S87][S88][S100]

**Lumber Tycoon 2 (Defaultio, 2015 thread).** The creator announced it on 2015-08-29 as a sequel to a 2008 game with physics-based chopping, hauling, tool upgrades, load/save and a sandbox build system, admitted the progression arc might be too slow, and said he abused physics on purpose. [S50] A fan site says the first land plot costs $100. [search summary, unverified detail] Rolimons: 1.33B visits, 17.1-minute sessions, a 34.2K 30-day peak labelled all-time. [S78]

**Welcome to Bloxburg (Coeptus; now Coffee Stain).** Wikipedia: life-sim based on The Sims, jobs earn money for houses and cars, 25 Robux entry fee until free-to-play on 2024-06-15, acquired by Embracer Group in 2023 through Coffee Stain Gothenburg (the 2014 launch year Wikipedia gives conflicts with the 2016 date in 03). [S64] A search summary of a 2024 article says the free announcement came on 2024-05-31, past buyers got an Early Bloxburger tag, a vehicle and a trophy, and the player count spiked above 300K on day one then returned to the prior level. [S104] The build economy is capacity-gated and sold as passes (read 2026-08-12 and 2026-09-14): standard plot 30x30 cells (900), Large Plot 50x50 (2,500 cells, 250 Robux, also doubles the plot data limit), Multiple Floors up to five floors (360 Robux), Basements (100 Robux, one underground level; digging costs $25 per 1x1 square in game cash), Advanced Placing (250), Transform Plus (600), Excellent Employee (300), Marvelous Mood (180) and Premium (300 on one page, 400 on another; halves bills, doubles daily rewards, lets you pick your plot), 2,340 Robux for all; an extra 20% of plot data costs 59 Robux at 100% usage, plants are capped at 800 per plot. [S89][S90][S104] Rolimons: 12 per server, 21.9-minute sessions, 10.12B visits, 592K peak. [S80]

**Build A Boat For Treasure (Chillz Studios).** The long-lived "build, then ride" game: 5.22B visits, 8.54M favourites, 93.4% rating, 7 per server, 17.9-minute sessions, 89.6K peak in April 2021 and 25.2K in the last 24 hours (2026-10-04). Developers copy its rotated snap-to-surface placement (see section 7). [S81][S37]

**Retail Tycoon 2 and the NPC-business sim.** Guides (third-party, search summary): shelves cost $500 and take a 2x2 footprint, restockers cost $200 to hire plus $20 per minute, a toy buys for $20 and sells for $45 at default (125% margin), finance reps grant loans to customers who cannot afford furniture nearly 88% of the time, and self-checkouts cost more up front but have no salary. [S106] A January 2026 DevForum review of a new retail tycoon names the usual failure: nothing can be automated without paying, so the game never reaches the idle-and-optimise phase that other retail tycoons have. [S47]

### 4. Economy math (tycoon-specific)
- Cost growth. In AdVenture Capitalist's published math, next cost = base cost x growth^owned with growth 1.07 for the cheapest generator (base cost 4, base production 1.67 per second); ownership milestones (for example x2 at 25 and 50 owned) temporarily reset the production-to-cost balance; the design rule is exponential costs against sub-exponential production. [S56][S57] Practitioner guides give a 1.07 to 1.15 growth range and say to map the first 100-500 levels in a spreadsheet, with flattening at levels 30-50 as the common failure (third-party, mobile idle, 2026-01-22). [S59] One 2026 hobby write-up used 1.15x per level, first upgrade within 60 s, first automation within 3 minutes, first prestige in 10-15 minutes and a 50% offline rate (third-party, anecdotal, 2026-08-02). [S60]
- Prestige formulas in shipped idle games (Pecorella, 2017-02-01): Realm Grinder uses a square root of the best-run currency (4x earnings to double the prestige currency), AdVenture Capitalist a square root of lifetime earnings (3-4x), Cookie Clicker a cube root (8x), Egg, Inc. about the 1/7 power of current-run earnings (128x), so smaller exponents flatten the curve and push active play. [S58]
- Derived pacing law. If each button costs g times the previous one and pays back its own cost in P seconds, the steady-state wait between purchases is P x (g - 1) seconds. I verified it with the script in Recipe 9 (a 20-button ladder, payback 120 s, 2.5 cash/s base, first cost 50): g = 1.25 gives a 29.8 s wait, g = 1.5 gives 59.9 s, g = 2 gives 120 s, and the 20th purchase lands at 9.0, 17.0 and 34.0 minutes. Early waits are shorter because the base income dominates. Use it to pick g from the wait you want.
- Derived rebirth rule. A rebirth cycle stays constant only if the income multiplier grows as fast as the cost. With cost 100,000 x 2.5^r and a linear 1 + 0.5r multiplier, the cycle at r = 10 is 15.8 hours against 36 seconds at r = 0 (full-ladder income 2,800/s, script in Recipe 9); with a multiplier of 2.0^r it is 5.5 minutes. Set the first rebirth cost to full-ladder income x target seconds (2,800 x 1,200 s = 3.36M for a 20-minute first rebirth).
- Offline progress is almost always capped and discounted: guide sites give caps of 2-24 hours and about 50% of the live rate (third-party); a 2025 DevForum answer to how "Steal a" games do it says store `os.time()` on exit, multiply per-second income by the clamped time away and divide by a constant such as 5, which another poster confirms games call an offline multiplier. [S59][S60][S41] Kit values in 03 (25%, 8 hours) sit inside those ranges.
- Roblox's own economy doc: model expected value per action (its fishing example gives 14G per cast and 14,000G per 1,000 casts), keep event sources and sinks close together, and give an event its own currency. [S2]

### 5. The systems list of a complete tycoon (what shipped hits include)
Derived from the games above plus the DevForum kit and framework threads; my checklist, not a published standard. Roblox's core-loop doc frames every game as minute-to-minute interaction, most-repeated actions and a progression engine, and says a game without progression is repetitive and shallow. [S3] Roblox's only full reference project, Plant (a farm: seeds, watering, selling, soft and hard currency), shows the architecture it recommends for a free-to-play plot game: one Script and one LocalScript as entry points, `PlayerDataServer/Client`, `FarmManagerServer/Client`, a `FtueManagerServer/Client`, a Market module, a client-to-server Network module with runtime validation, strict Luau typechecking, prefab cloning instead of building at runtime, and a replication order of player data first, then instance attributes, then CollectionService tags, then direct network messages. [S4] A 2020 forum post asks what makes a tycoon different from the last one; the replies suggest placing buildings anywhere, a supply chain with market prices, material costs per building, and events with endless goals, while a 2023 ideas thread (museum, farm, circus tycoons) gets the same critique that each is close to an existing game. [S51][S55]
1. Plot allocation and ownership: automatic on join with mathematically spaced plots beats a manual claim pad (PlayAsync, 2020-01); a plot per `Players.MaxPlayers` slot. [S35]
2. Currency and income core (rate-based or physical drops), a collector or auto-collect pass. [S34]
3. A button or purchase graph with dependencies, purchase types (builds a model, raises income, unlocks a tool) and a central config (Ruixey's kit: dependencies, PurchaseTypes, a configuration module). [S34]
4. Save and load of purchases as IDs, not instances. [S33]
5. Rebirth or prestige with a defined first-cycle time. [S34][S58]
6. Offline income with cap and discount. [S41]
7. Automation tier (auto-collect, workers, auto-sell); the 2025-26 DevForum threads both say tycoons lose players that never reach the idle phase. [S46][S47]
8. A reason to come back that is not just a bigger number: events and collabs (RT3 band collaborations), theft or social risk (SaB, Steal An Egg), collection indexes, co-op plots (RT3). [S49][S65]
9. Monetisation: 2x cash, auto-collect, VIP area, faster droppers and skip-stage passes are the usual list (a tutorial site, 2026-04-22); capacity passes for sandbox builders (Bloxburg, TPT2). [S97][S90][S87]
10. Moderation hooks for anything players type or place (sign text must be filtered). [S19]

### 6. Technical facts that decide whether a tycoon runs (first-party where possible)
- Droppers. Community advice (2019-2024): run all droppers on one loop, never one thread per dropper; keep visuals on the client and fire the server only to grant money; anchor and set `CanCollide` and `CanTouch` false where physics is not needed; always destroy drops (collector or garbage routine); a progressive memory leak made one game's ping climb from 60 ms to 3,000 ms over time. [S29][S31] On exploits (2022-12-25) the thread's proposals were: store each dropper's value on the server and never trust a client-fired amount, or make the collector purely visual with a timer that credits cash, or keep drops on the server owned by the plot's player; the open problem was swappable upgraders that change a drop in transit without flooding remotes. [S30]
- Part cap and lifetime. `Debris:AddItem` lifetime defaults to 10 s and the service has a hardcoded 1,000-item maximum: past that, the oldest debris is destroyed immediately, and `Debris.MaxItems` is deprecated and cannot be set. 12 plots x 60 live drops is 720, so the cap is safe, 12 x 100 is not. [S7]
- Conveyors. Community practice is an anchored part whose `AssemblyLinearVelocity` is set (works with rotating belts; the older `Velocity` wobbles); the docs warn that setting velocity directly "may lead to unrealistic motion" and prefer constraints, and that a server-owned part's velocity must be set from a server Script. [S6] For SaB-style conveyors (DevForum, 2025-11-05) the developer's conclusion was that the smooth look only comes from the client: the server spawns items on a timer and fires a remote with item data, clients tween with duration = distance / speed, with a time-synchronised alternative using `workspace:GetServerTimeNow()` so every client computes the same position, and `PreRender` suggested for smoother movement than `Heartbeat`. [S32]
- `GetServerTimeNow()` returns a smoothed, monotonic Unix time good for synchronised events but, per the docs, not for timed rewards because it is not secure compared with server-tracked timers. [S10]
- Network ownership. The server always owns anchored parts; unanchored parts near a player may be handed to that player automatically; clients that own a part can send bad data (teleport it) and fire `Touched` falsely; docs advise validating everything server-side and using `SetNetworkOwner(nil)` sparingly because it can cause jitter. [S5] Whether to hand drops to the plot owner (cheap, exploitable) or the server (safe, costs server CPU) is the main dropper trade-off.
- Collision groups. `PhysicsService:RegisterCollisionGroup` and `CollisionGroupSetCollidable` exist; the engine supports at most 32 groups. A "Drops" group that does not collide with itself stops drops piling up. [S9]
- `ProximityPrompt`: parent it to a BasePart, Attachment or a Model with a PrimaryPart; `KeyboardKeyCode` defaults to E, gamepad ButtonX, `ActionText` defaults to "Interact"; `Triggered` passes the player; `HoldDuration` makes hold-to-confirm; defaults for `MaxActivationDistance` and `HoldDuration` are not stated on the class page (unverified here, set them explicitly). [S8]
- Security. Treat every remote as hostile, validate price and balance and distance on the server, rate-limit, keep authoritative state out of replicated containers. [S16]
- Performance baseline from the docs: under 1,000 draw calls and 1,000,000 triangles for low-end devices, a 16.67 ms frame budget at 60 FPS, prefer event-driven code over per-frame work, disconnect listeners. [S17] Instance streaming is on by default for new places (`StreamingMinRadius` 64, `StreamingTargetRadius` 1,024, `ModelStreamingMode` Atomic or Persistent for gameplay-critical models; the docs prefer server scripts for critical logic). [S18]
- NPC customers. A 2024 report ran 1,000 moving NPCs at 144-156 FPS and 2,500 at 42-46 FPS after converting multi-part NPCs to one skinned mesh with bones, turning off CanCollide, CanQuery, CanTouch and CastShadow, and hoisting math out of loops. [S52] A 2022 post says about 150 NPCs with `PathfindingService` plus `MoveTo` before FPS dropped, and fixed stutter with `WaypointSpacing = math.huge` (waypoints only at turns). [S53] A search summary of another thread recommends pathfinding to the queue start then using plain `MoveTo` for queue slots. [search summary, unverified]
- Shared timers. A DevForum analysis of Grow a Garden's shop (2025-06-21) shows a deterministic stock: take the server time, find the 5-minute slot (`t - t % interval`), seed an RNG from a secret plus the slot, so every server produces identical stock without MessagingService or HttpService. [S44] A 2025-09 offline-growth thread favours storing an end timestamp (Unix) and comparing on rejoin over per-frame delta accumulation. [S45]
- Data: a DataStore key holds at most 4,194,304 characters, key names 50 characters; request budgets are `300 + CCU x 40` reads and `300 + CCU x 20` writes per minute at experience level (per-server `60 + players x 40`); the 4 MB key limit stayed when, on 2026-07-29, base experience storage rose from 100 MB to 500 MB with total storage `500 MB + 1 MB x lifetime players` and Open Cloud and in-game requests share one per-experience budget. [S13][S14][S15] The docs' tutorial recommends autosaving about every 30 seconds (search summary); ProfileStore autosaves every 300 s (see 04). [S28]
- Saving built structures. Community figures: compressed CFrame strings of 17-74 characters (lannior, 2021), chunk very large builds across keys, serialise instances to ids plus numbers rather than saving instances, and compress with a bit-buffer module (2020 thread). [S42][S43] My derived size: packing id, cell x, cell z and rotation into one integer (Recipe 11) is about 12 characters including the separator, so 10,000 items is about 120 KB, 3% of one key.
- Text. Any player-typed text shown to others (signs, plot names, shop names) must go through `TextService:FilterStringAsync` and be filtered when displayed; use `GetNonChatStringForBroadcastAsync` for text everyone in the server sees; Roblox moderates and takes down games without filtering. [S19][S20]
- Monetisation plumbing: `MarketplaceService.ProcessReceipt` must exist or developer products fail; `BindReceiptHandler` is a newer alternative that takes precedence for developer products and falls through to `ProcessReceipt`; `UserOwnsGamePassAsync` checks passes. [S12]

### 7. Placement and build systems (what is known)
- Snapping. A 2023 DevForum answer gives the standard snap: `math.floor(x / grid + 0.5) * grid` with grid 4, handled per axis; `Mouse.Hit` can put objects inside surfaces, so offset by the surface normal or toward the camera. [S36]
- Stacking and rotation (2021): convert the target position into the target's object space, round there, convert back (`PointToObjectSpace`, `ToWorldSpace`), and offset by the raycast normal to stack. A 2024 thread shows rotated blocks breaking surface-based grid maths; the unresolved lesson is that which face is "next to" a block changes with rotation, so do the maths in object space. [S37][S38]
- Existing modules. "Snap" (astraIboy, 2023-12) offers plot ownership, configurable grid, saving and loading, but no stacking or walls at release; PlacementService (zblox164, v1.6.2, Apache-2.0) has grid unit, rotation step, floors, max range, plot bounds, server placement, and its README says it has not been updated for over two years and may not work as intended. Prefer your own small grid on a server-held occupancy table. [S39][S40]
- Roblox's roadmap (2026-09-18, RDC26 2026-09-11): "In-game creation persistence" (early 2027, planned) to save assets created inside the experience like data; new primitive parts (cone, capsule, disc, rounded) late 2026 per RDC26 and early 2027 per the roadmap; "Player data management improvements" with built-in transactions and session locking (early 2027); Server Authority already shipped. [S25][S26] The 4D functional objects early access (2025-11-06; update 2026-01-08) generates multi-mesh objects from text in 20-40 seconds through `GenerationService:GenerateModelAsync` with two schemas, Car5 and Body1, and plans object persistence "later in 2026". [S27] None of this exists as stable tooling yet: build on DataStore and ProfileStore now.

### 8. What separates hits from clones (evidence-ranked)
1. A second loop on top of the pad loop. The 2025-06 DevForum reply to a low-retention tycoon (advertised three weeks, with dailies, quests and rebirth) is that most tycoons are played once and need a reason to return, with Military Tycoon as the differentiated example. [S46] SaB, Steal An Egg and Anime Dice each added a risk or variance layer (theft, rolls). [S63][S65][S91]
2. Reaching the automation phase without paying. The January 2026 retail-tycoon review says players leave when the idle phase is locked behind Robux. [S47]
3. A visible build that is yours: capacity-gated building (Bloxburg floors and plot data; TPT2 plots and height) keeps sandbox games alive for a decade. [S89][S87][S64]
4. Depth with a rating system that unlocks content (RT3's five categories, special customers). [S94]
5. A steady cadence with named events (RT3: monthly, a collab, a big update followed by two or three small ones). [S48][S49]
6. Pure idle fatigue. StudioKrew (2026-07) reads Grow a Garden 2's fall as evidence that pure idle is tiring. [S67] A progression layer amplifies a loop that is already satisfying; it cannot create one (RoWatcher, undated, context only). [S105]
7. Creator Rewards context. The programme pays 5 Robux per qualifying "active spender" per day (spent at least $9.99 on Roblox in the past 60 days, not new or reactivated) if they spend 10 minutes in your experience and it is among the first three they launch that day; an audience-expansion reward pays 35% of the first $100 of a new or returning user's spend and needs 100+ DAU for 60 days. [S21][S22] Correction for 03: the docs page and the 2025-07-24 announcement contain no genre statement, so the claim in 03 that Roblox said tycoons and roleplay get reduced earnings could not be confirmed from either; treat it as unverified, though the 10-minute cap does favour short loops. [S21][S22]

## How to apply it (rules for an AI builder)

### Scope and design
- DO decide which of the nine tycoon types you are building before any code, and write the loop as: earn (what, how fast), spend (what buys what), expand (what the player sees change), return (why tomorrow). A pad tycoon alone is a one-session product (section 8). [S46]
- DO add exactly one second loop that creates variance or social stakes: a roll or egg hatch with disclosed odds, a theft/lock layer for 6-9 player servers, a collection index, or an NPC business with ratings. DON'T copy Steal a Brainrot literally: the platform pays more for novel games in 2026 (see 03) and its clones decay fast. [S63][S65]
- DO size servers to the loop: 6 players for builders and business sims (TPT2, Retail, RT3, Lumber), 7-9 for steal and plot-idle hybrids (Steal An Egg 7, Anime Dice 9), 12-30 for roleplay (Bloxburg 12, Brookhaven 30), and make plot count equal `Players.MaxPlayers`. [S77][S76][S75][S86][S80][S85]
- DO give the first purchase within 20 s and automation within 3 minutes (derived from the pacing law and the 2026 write-up: 50 cash first button at 2.5 cash/s is 20 s); first rebirth at 15-25 minutes. [S60]

### Economy
- DO pick growth g from the wait you want: wait = payback x (g - 1). Use g 1.25-1.5 for early buttons (30-60 s waits at 120 s payback), g up to 2 late. DON'T use g above 2.5 unless income also grows by that factor per tier. [derived; S56]
- DO set first rebirth cost = full-ladder income per second x target seconds; make the rebirth multiplier grow as fast as cost, or unlock stronger earners per rebirth (Recipe 8). DON'T ship a linear 1 + 0.5r multiplier against 2.5^r cost; the cycle exceeds 15 hours by r = 10 (derived).
- DO cap offline earnings (start at 8 hours, 25-50% rate) and compute them from a server timestamp, never the client clock. [S41][S59]
- DO give events their own currency and shop and model expected value before launch. [S2]
- DO compute every random reward's expected value (EV = sum of value x probability) and show odds for any paid random item (03 Recipe 7). [S2]
- DO sell capacity and convenience (2x cash, auto-collect, extra plots, floors, height) with a free path to the same thing; keep price points near the sourced ones: 74-374 Robux for TPT2 capacity, 100-360 for Bloxburg capacity, 180-600 for Bloxburg convenience. [S87][S88][S90]

### Engineering
- DO keep cash, owned-buttons and rates on the server; send the client only display numbers (attributes or a replicated value). DO validate in every purchase: the player owns the plot, the id exists, dependencies are owned, cash is enough, and the character is within range of the button. [S16]
- DO make rate-based income the default (cash += rate x dt, collected at a pad) and add physical drops only as visuals; if drops are physical, cap them per plot, set a lifetime, put them in a non-self-colliding group and keep them to one server loop. [S29][S7][S9]
- DO run belts and animations on clients from a shared start time and speed; DON'T replicate per-item physics. [S32]
- DO persist purchase state as ids (a set), one schema version number, no instances; DO keep plot structures (placed items) in a separate key from the profile and under 4,194,304 characters, chunked if needed. [S33][S13][S43]
- DO use ProfileStore for the profile (see 04) and not raw `SetAsync`; the platform plans built-in session locking for early 2027 (roadmap), but it is not shipped. [S26]
- DO filter all player-typed text on display. DON'T store the filtered result as the source of truth. [S19]
- DO cap NPC counts (a 150-NPC `PathfindingService` ceiling is the only sourced figure) and move queued customers with `MoveTo` between fixed slots. [S53][S52]
- DON'T pass `Touched` as the only gate for purchases (exploiters teleport); use `ProximityPrompt.Triggered` plus a server distance check. [S5][S8][S16]
- DON'T embed a media feed, autoplay or reward for watching; it removes the game from Kids and Select. [S61]

## Recipes (each becomes a skill)

### Recipe 1: Plot allocation and ownership
When to use: any per-player base (tycoon, plot-idle, building).
Steps:
1. In Workspace make a folder `Plots` with one Model per slot (as many as `Players.MaxPlayers`, 6-12). Each plot Model has a child Part `Spawn` (where the character appears), a Part `GridOrigin` (min corner of the buildable area, top surface) and a Folder `Content`. Tag each plot Model "Plot" with CollectionService (Tag Editor plugin or `CollectionService:AddTag(model, "Plot")`).
2. Plots are claimed on the server in `PlayerAdded`; the owner's `UserId` goes in the plot attribute `OwnerId`. A free plot has no attribute. Release on `PlayerRemoving` and clear `Content`.
3. Teleport the character to `Spawn` on every `CharacterAdded`.
4. Everything else (buttons, collectors, placement) finds its plot by walking up to the tagged Model and comparing `OwnerId` to the acting player.
```luau
--!strict
-- ServerScriptService/PlotService (ModuleScript, required by a boot Script)
local Players = game:GetService("Players")
local CollectionService = game:GetService("CollectionService")

local PlotService = {}
local plotByUserId: { [number]: Model } = {}

local function pickFreePlot(): Model?
	local free: { Model } = {}
	for _, inst in CollectionService:GetTagged("Plot") do
		if inst:IsA("Model") and inst:GetAttribute("OwnerId") == nil then
			table.insert(free, inst)
		end
	end
	if #free == 0 then return nil end
	return free[math.random(1, #free)]
end

function PlotService.get(player: Player): Model?
	return plotByUserId[player.UserId]
end

local function moveToPlot(player: Player, character: Model)
	local plot = plotByUserId[player.UserId]
	local spawnPart = plot and plot:FindFirstChild("Spawn")
	if spawnPart and spawnPart:IsA("BasePart") then
		character:PivotTo(spawnPart.CFrame + Vector3.new(0, 4, 0))
	end
end

function PlotService.start()
	Players.PlayerAdded:Connect(function(player)
		local plot = pickFreePlot()
		if not plot then
			player:Kick("No free plot on this server. Please rejoin.")
			return
		end
		plot:SetAttribute("OwnerId", player.UserId) -- no yield between check and write
		plotByUserId[player.UserId] = plot
		player.CharacterAdded:Connect(function(character)
			moveToPlot(player, character)
		end)
		if player.Character then moveToPlot(player, player.Character) end
	end)
	Players.PlayerRemoving:Connect(function(player)
		local plot = plotByUserId[player.UserId]
		plotByUserId[player.UserId] = nil
		if plot then
			plot:SetAttribute("OwnerId", nil)
			local content = plot:FindFirstChild("Content")
			if content then content:ClearAllChildren() end
		end
	end)
end

return PlotService
```
Pitfalls: kits that make players step on a claim pad lose players who do not understand it (auto-claim instead) [S35]; starting the module after players joined (loop `Players:GetPlayers()` too); `math.random` plot choice scatters players, sort the list for adjacent friends if you support co-op; a plot per slot only works if `Players.MaxPlayers` matches the plot count.

### Recipe 2: Data-driven button graph with server-validated purchase
When to use: pad tycoon, business sim, anything with "buy this to unlock that".
Steps:
1. Put all definitions in one ModuleScript in ServerScriptService (id, cost, requires, income, effect model name). Studio objects: ServerStorage folder `PurchaseModels` holds one Model per effect; each plot Folder `Buttons` holds one Part per button with attribute `DefId`.
2. Each button gets a ProximityPrompt (`ActionText` "Buy", `HoldDuration` 0.25, `MaxActivationDistance` 10, `RequiresLineOfSight` false). Buttons are hidden (Transparency 1, prompt disabled) until every id in `requires` is owned; show a price label as a SurfaceGui (client reads attribute `Cost`).
3. On `Triggered` the server checks owner, distance, definition, dependencies, cash; deducts; marks owned; adds income; clones the effect model into `Content`; updates button visibility.
4. State per player: `cash`, `pending`, `owned` (set of ids), `rate`, `multiplier`.
```luau
--!strict
-- ServerScriptService/Tycoon (ModuleScript)
export type Def = { cost: number, income: number, requires: { string }, model: string? }
export type State = {
	cash: number, pending: number, owned: { [string]: boolean },
	rate: number, multiplier: number,
}

local Defs: { [string]: Def } = {
	dropper1 = { cost = 0,   income = 2.5, requires = {},          model = "Dropper1" },
	belt1    = { cost = 50,  income = 0.4, requires = { "dropper1" }, model = "Belt1" },
	dropper2 = { cost = 75,  income = 0.6, requires = { "belt1" },  model = "Dropper2" },
}

local Tycoon = {}

local function withinRange(player: Player, part: BasePart, slack: number): boolean
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	return root ~= nil and root:IsA("BasePart") and (root.Position - part.Position).Magnitude <= slack
end

function Tycoon.tryBuy(player: Player, plot: Model, state: State, id: string, buttonPart: BasePart): boolean
	if plot:GetAttribute("OwnerId") ~= player.UserId then return false end
	local def = Defs[id]
	if def == nil or state.owned[id] then return false end
	if not withinRange(player, buttonPart, 16) then return false end
	for _, req in def.requires do
		if not state.owned[req] then return false end
	end
	if state.cash < def.cost then return false end
	state.cash -= def.cost
	state.owned[id] = true
	state.rate += def.income
	if def.model then
		local template = game:GetService("ServerStorage").PurchaseModels:FindFirstChild(def.model)
		local content = plot:FindFirstChild("Content")
		if template and content then
			local clone = template:Clone()
			clone:PivotTo(buttonPart.CFrame) -- or a stored pivot attribute
			clone.Parent = content
		end
	end
	return true
end

function Tycoon.bindButton(player: Player, plot: Model, state: State, buttonPart: BasePart)
	local prompt = buttonPart:FindFirstChildOfClass("ProximityPrompt")
	local id = buttonPart:GetAttribute("DefId")
	if not prompt or typeof(id) ~= "string" then return end
	prompt.Triggered:Connect(function(who)
		if who == player then
			Tycoon.tryBuy(player, plot, state, id, buttonPart)
		end
	end)
end

return Tycoon
```
Pitfalls: price checks on the client; `Touched` pads (exploiters can fire them from anywhere); unbounded dependency loops (validate the graph at startup); effects cloned at a world position that is not relative to the plot (use a stored local pivot so every plot works); not marking purchases owned before cloning (double-trigger on lag). The Ruixey kit's structure (dependencies, purchase types, config) is the reference design. [S34]

### Recipe 3: Rate-based income with a collector pad (default core)
When to use: you want the lowest server cost and the safest anti-exploit; physical drops are decoration.
Steps:
1. One server loop for all players: every second `pending += rate x multiplier x dt` (cap `pending` at rate x 3,600 so a forgotten plot does not store days).
2. A "Collect" pad (ProximityPrompt) moves `pending` to `cash`; an auto-collect pass moves it every tick.
3. Replicate display values as player attributes `Cash` and `Rate`, updated at most 4 times per second and only on change; format big numbers on the client with suffixes (K, M, B, T, Qa).
4. Visual drops (Recipe 4) or a client-only particle stream show income; the amount on screen is cosmetic.
```luau
--!strict
local Players = game:GetService("Players")

local PENDING_CAP_SECONDS = 3600
-- populate `states[player]` when the player's data loads (Recipe 6); remove it on PlayerRemoving
local states: { [Player]: { cash: number, pending: number, rate: number, multiplier: number, autoCollect: boolean } } = {}

task.spawn(function()
	while true do
		local dt = task.wait(1)
		for player, s in states do
			s.pending = math.min(s.pending + s.rate * s.multiplier * dt, s.rate * s.multiplier * PENDING_CAP_SECONDS)
			if s.autoCollect then
				s.cash += s.pending
				s.pending = 0
			end
			player:SetAttribute("Cash", math.floor(s.cash))
			player:SetAttribute("Pending", math.floor(s.pending))
			player:SetAttribute("Rate", s.rate * s.multiplier)
		end
	end
end)

Players.PlayerRemoving:Connect(function(player) states[player] = nil end)
```
Pitfalls: attributes are doubles, fine up to about 9e15; for "Qa" sized numbers keep a mantissa-exponent pair or switch to scientific display before 1e15; `task.wait(1)` returns the real elapsed time, use it as `dt`; do not write `Cash` into a DataStore every second (autosave instead).

### Recipe 4: Physical dropper, conveyor and collector (capped, server-owned)
When to use: the classic look is a selling point and the plot stays small.
Steps:
1. Register collision group "Drops" that does not collide with itself.
2. Dropper Part per dropper; a server loop (one for the whole server, not per dropper) spawns one drop per interval while the plot's `DropCount` < 60; each drop is unanchored, `CanQuery` false, `CollisionGroup` "Drops", attribute `Value`, `Debris:AddItem(part, 30)`, `SetNetworkOwner(nil)`.
3. Conveyor: an anchored Part with `AssemblyLinearVelocity = belt.CFrame.LookVector * 8` (studs per second) set once.
4. Collector: `Touched` on the collector; ignore non-drops and drops already marked `Spent`; add the value to the owner's `pending`.
```luau
--!strict
local PhysicsService = game:GetService("PhysicsService")
local Debris = game:GetService("Debris")

local MAX_DROPS_PER_PLOT = 60
local DROP_LIFETIME = 30

if not PhysicsService:IsCollisionGroupRegistered("Drops") then
	PhysicsService:RegisterCollisionGroup("Drops")
end
PhysicsService:CollisionGroupSetCollidable("Drops", "Drops", false)

local function spawnDrop(plot: Model, dropper: BasePart, value: number)
	local count = (plot:GetAttribute("DropCount") :: number?) or 0
	if count >= MAX_DROPS_PER_PLOT then return end
	plot:SetAttribute("DropCount", count + 1)
	local drop = Instance.new("Part")
	drop.Size = Vector3.new(1, 1, 1)
	drop.CFrame = dropper.CFrame * CFrame.new(0, -(dropper.Size.Y / 2) - 1, 0)
	drop.CollisionGroup = "Drops"
	drop.CanQuery = false
	drop:SetAttribute("Value", value)
	drop.Parent = plot
	drop:SetNetworkOwner(nil)
	Debris:AddItem(drop, DROP_LIFETIME)
	drop.Destroying:Once(function()
		local n = (plot:GetAttribute("DropCount") :: number?) or 1
		plot:SetAttribute("DropCount", math.max(0, n - 1))
	end)
end

local function bindCollector(collector: BasePart, onValue: (number) -> ())
	collector.Touched:Connect(function(hit)
		if hit.CollisionGroup ~= "Drops" or hit:GetAttribute("Spent") then return end
		hit:SetAttribute("Spent", true)
		local value = hit:GetAttribute("Value")
		if typeof(value) == "number" then onValue(value) end
		hit:Destroy()
	end)
end

local function setupBelt(belt: BasePart, studsPerSecond: number)
	belt.Anchored = true
	belt.AssemblyLinearVelocity = belt.CFrame.LookVector * studsPerSecond
end

return { spawnDrop = spawnDrop, bindCollector = bindCollector, setupBelt = setupBelt }
```
Pitfalls: more than 1,000 live debris items server-wide silently deletes the oldest (12 plots x 100 drops breaks); one loop per dropper; drops that rest on the belt edge and never reach the collector (they time out via Debris, which is why the lifetime matters); leaving drops owned by clients (exploitable); sending the dropped value from the client. [S29][S30][S7][S5]

### Recipe 5: Client-visual conveyor market (Steal a Brainrot style)
When to use: a shared belt that sells random items in a small server, where the item must look smooth and the purchase must be fair.
Steps:
1. Server stores `epoch = workspace:GetServerTimeNow()` and a `seed` at server start, and publishes both as attributes on a Folder in ReplicatedStorage.
2. Item `i` spawns at `epoch + i x interval`; its rarity is a pure function of `(seed, i)`. Server and clients share the same module, so nobody replicates item data.
3. Clients create a visual per index in `Belt.indexRange(now)` and place it at `start + direction x Belt.distance(now, epoch, i)` every `RenderStepped`.
4. Purchase: client fires `Buy(index)`. Server checks the index is on the belt now with a 1-second grace, the price (server formula, may rise per attempt), the player's cash and a free base slot; then marks the index taken (a set) so two buyers cannot get it.
```luau
--!strict
-- ReplicatedStorage/Belt (ModuleScript): pure functions shared by client and server
local Belt = {}
Belt.SPAWN_INTERVAL = 4 -- seconds between items
Belt.SPEED = 8          -- studs per second
Belt.LENGTH = 120       -- studs from spawn to end

function Belt.spawnTime(epoch: number, index: number): number
	return epoch + index * Belt.SPAWN_INTERVAL
end

function Belt.distance(now: number, epoch: number, index: number): number?
	local d = (now - Belt.spawnTime(epoch, index)) * Belt.SPEED
	if d < 0 or d > Belt.LENGTH then return nil end
	return d
end

function Belt.indexRange(now: number, epoch: number): (number, number)
	local newest = math.floor((now - epoch) / Belt.SPAWN_INTERVAL)
	local travel = Belt.LENGTH / Belt.SPEED
	local oldest = math.max(0, math.ceil((now - epoch - travel) / Belt.SPAWN_INTERVAL))
	return oldest, newest
end

function Belt.rarity(seed: number, index: number, weights: { number }): number
	local rng = Random.new(seed + index)
	local total = 0
	for _, w in weights do total += w end
	local roll = rng:NextNumber() * total
	for i, w in weights do
		roll -= w
		if roll <= 0 then return i end
	end
	return #weights
end

return Belt
```
Server check (inside the `Buy` handler): `local d = Belt.distance(workspace:GetServerTimeNow() - 1, epoch, index)` (the 1-second grace covers latency and also rejects items younger than 1 s, which no client has seen yet); reject when nil, when `taken[index]`, or when the player is not in the server's `Players`. With the defaults above (interval 4 s, travel 15 s) about four items are on the belt at a time (script output: 22 to 25 at one test time). Fixed guaranteed spawns, like SaB's reported legendary every 5 minutes and mythic every 15, are simply `index % n == 0` overrides. [S32][S101]
Pitfalls: using each client's `os.time()` (clocks differ); replicating items as server Parts (the 2025 thread's own conclusion is that this never looks smooth); changing `SPEED` or `SPAWN_INTERVAL` mid-session without a new epoch (items jump); using `GetServerTimeNow` for money timers (the docs say not secure for timed rewards, keep timers on the server). [S32][S10]

### Recipe 6: Save and load tycoon state (purchases as ids)
When to use: every tycoon.
Steps:
1. Profile template: `{ cash = 0, owned = {}, rebirths = 0, lastSeen = 0, version = 1 }` where `owned` maps id to true. Store with ProfileStore (see 04 Recipe 2: session lock, `Reconcile`, kick on failed load); do not write your own `SetAsync`.
2. Save only purchased ids (missing means not bought); on load, claim the plot, then replay `Tycoon.tryBuy`-like logic without charging: clone each owned effect model and add its income. [S33]
3. Keep a `version` integer; when a button is renamed or removed, migrate in a function that runs on load.
4. Autosave is ProfileStore's job (300 s); the docs' older tutorial suggests about 30 s for hand-rolled saves (search summary). Write on purchase milestones such as a rebirth, not on every collect. [S28]
5. Large plots (placed items) go in a second key `Plot_{UserId}` (Recipe 11), loaded after the profile.
Pitfalls: saving instances; saving the cash every second; losing a purchase because the plot was cleared before the save; renaming ids; cash duplication at rebirth (the Ruixey kit's changelog fixed exactly this: reset and grant inside one function that updates the profile once). [S34]

### Recipe 7: Offline earnings with cap and discount
When to use: any idle or plot game.
Steps: store `lastSeen = os.time()` in the profile on every autosave and on leave. On join, `away = clamp(os.time() - lastSeen, 0, CAP)`, reward = rate x away x rate_fraction, shown once as a "Welcome back" panel with a Claim button (optionally 2x with a rewarded action or pass).
```luau
--!strict
local OFFLINE_CAP = 8 * 3600
local OFFLINE_RATE = 0.25 -- fraction of the live rate (kit value; guides say 25-50%)

local function offlineReward(ratePerSecond: number, lastSeen: number, now: number): (number, number)
	local away = math.clamp(now - lastSeen, 0, OFFLINE_CAP)
	return ratePerSecond * away * OFFLINE_RATE, away
end

-- tests I ran: 1 hour away at 1000/s -> 900,000; 100 hours away -> capped at 8 h = 7,200,000; clock backwards -> 0
return offlineReward
```
Pitfalls: trusting a client timestamp; paying the live rate with no cap (removes the reason to return); computing the offline rate from the rate at the moment of rejoin after a rebirth (use the saved rate); timers that must not be skipped by shifting the clock (store end timestamps and compare, as in the 2025 thread). [S41][S45]

### Recipe 8: Rebirth or prestige that keeps the cycle healthy
When to use: after the first ladder is complete.
Steps:
1. Define `fullIncome` (rate after all buttons) and a target first-cycle time (20 minutes = 1,200 s). `base = fullIncome x 1,200`.
2. Pick cost growth G (1.5-2.5) and make the multiplier grow with it: multiplier(r) = G_inc^r with G_inc between 0.8 G and G, or unlock a stronger ladder tier per rebirth (new droppers, brainrots, pets) so income grows geometrically; use the DevForum idea of halving growth at breakpoints 100, 200, 400 for endless rebirths. [S58]
3. Reset: cash, owned buttons and plot content; keep: passes, rebirth count, cosmetics, a permanent "start with X" gift.
4. Run the pacing script (Recipe 9) before shipping: print cycle times for r = 0 to 15 and check the ratio.
Derived results (script run 2026-10-04): base 100,000, cost x2.5, full income 2,800/s: linear multiplier 1+0.5r gives cycles of 36 s, 60 s, 112 s, 3.7 min, 16.6 min, 3.0 h, 15.8 h, 45 days at r = 0, 1, 2, 3, 5, 8, 10, 15; a 1.9^r multiplier gives 36 s, 47 s, 62 s, 81 s, 2.3 min, 5.3 min, 9.3 min, 36.5 min; a 2.0^r multiplier gives up to 16.9 min at r = 15. Growth halving from 5% per rebirth at a 1M base reaches 1.32e8 at r = 100, 1.55e9 at 200, 1.86e10 at 400 and 2.25e11 at 800.
Pitfalls: a rebirth that gives only a small linear multiplier (players quit at the wall); a rebirth that also deletes paid unlocks; no preview of what the next rebirth gives; a first rebirth cost that is not tied to income.

### Recipe 9: Pacing simulator (run before shipping any economy)
When to use: before and after any price change. It runs in the Studio command bar or standalone (`luau pace.luau`).
```luau
--!strict
type Button = { cost: number, income: number }

local function buildLadder(count: number, firstCost: number, growth: number, paybackSeconds: number): { Button }
	local ladder: { Button } = {}
	for i = 0, count - 1 do
		local cost = firstCost * growth ^ i
		table.insert(ladder, { cost = cost, income = cost / paybackSeconds })
	end
	return ladder
end

local function simulate(ladder: { Button }, baseIncome: number, startCash: number)
	local t, cash, income, last = 0, startCash, baseIncome, 0
	local log = {}
	for i, b in ladder do
		local need = b.cost - cash
		if need > 0 then
			local dt = need / income
			t += dt
			cash += income * dt
		end
		cash -= b.cost
		income += b.income
		table.insert(log, { index = i, time = t, wait = t - last, cost = b.cost, income = income })
		last = t
	end
	return log
end

for _, g in { 1.25, 1.5, 2.0 } do
	local log = simulate(buildLadder(20, 50, g, 120), 2.5, 0)
	local r = log[20]
	print(("growth %.2f: 20th buy at %.1f min, last wait %.1f s, income %.0f/s"):format(g, r.time / 60, r.wait, r.income))
end
```
Output on 2026-10-04: growth 1.25 gives 9.0 min, 29.8 s wait, 145/s; growth 1.5 gives 17.0 min, 59.9 s, 2,800/s; growth 2.0 gives 34.0 min, 120.0 s, 436,900/s. Check: the wait converges to payback x (g - 1), as the pacing law predicts. Tune `firstCost`, `growth` and `paybackSeconds`; reject a ladder whose waits exceed 3 minutes before the first automation unlock. [derived; S56]

### Recipe 10: Grid placement (client preview, server authority)
When to use: sandbox builders, life-sim houses, theme parks, base layouts.
Steps:
1. Plot has `GridOrigin` (min corner). Choose CELL = 4 studs (the common snap value; many modules expose it as GridUnit) and a buildable size such as 30x30 cells (Bloxburg's base size) up to 50x50 for a paid Large Plot. [S36][S89]
2. Catalog: each item has id (number), footprint cells (x, z), model template, price, rotation allowed in 90-degree steps (0-3), category.
3. Client: raycast from the camera or touch point against the plot floor only (`RaycastParams` with `FilterType = Include` and the floor part), convert the hit to plot-local cells with `PointToObjectSpace`, snap, show a ghost model (Highlight green or red), rotate with R / a button, confirm with click or a mobile "Place" button. Never let the client decide validity.
4. Server on `Place(itemId, cx, cz, rot)`: owner check, item exists, integers in range, per-player rate limit (4 per second), object budget (see Recipe 11), cost, then `canPlace` on the occupancy grid; place the model with `PivotTo`.
5. Remove and move mirror the same checks.
```luau
--!strict
-- ReplicatedStorage/PlotGrid (ModuleScript): pure logic, used by client preview and the server
local PlotGrid = {}
PlotGrid.CELL = 4

export type Grid = { width: number, depth: number, occupied: { [number]: number } } -- cell -> item uid

function PlotGrid.new(width: number, depth: number): Grid
	return { width = width, depth = depth, occupied = {} }
end

function PlotGrid.footprint(w: number, d: number, rot: number): (number, number)
	if rot % 2 == 1 then return d, w end
	return w, d
end

local function key(grid: Grid, x: number, z: number): number
	return z * grid.width + x
end

function PlotGrid.canPlace(grid: Grid, cx: number, cz: number, w: number, d: number): boolean
	if cx % 1 ~= 0 or cz % 1 ~= 0 then return false end
	if cx < 0 or cz < 0 or cx + w > grid.width or cz + d > grid.depth then return false end
	for x = cx, cx + w - 1 do
		for z = cz, cz + d - 1 do
			if grid.occupied[key(grid, x, z)] ~= nil then return false end
		end
	end
	return true
end

function PlotGrid.place(grid: Grid, uid: number, cx: number, cz: number, w: number, d: number)
	for x = cx, cx + w - 1 do
		for z = cz, cz + d - 1 do
			grid.occupied[key(grid, x, z)] = uid
		end
	end
end

function PlotGrid.remove(grid: Grid, cx: number, cz: number, w: number, d: number)
	for x = cx, cx + w - 1 do
		for z = cz, cz + d - 1 do
			grid.occupied[key(grid, x, z)] = nil
		end
	end
end

-- world CFrame of an item whose footprint (after rotation) is w x d cells at cell (cx, cz)
function PlotGrid.worldCFrame(origin: CFrame, cx: number, cz: number, w: number, d: number, rot: number, y: number): CFrame
	local center = Vector3.new((cx + w / 2) * PlotGrid.CELL, y, (cz + d / 2) * PlotGrid.CELL)
	return origin * CFrame.new(center) * CFrame.Angles(0, math.rad(90 * rot), 0)
end

function PlotGrid.cellFromWorld(origin: CFrame, world: Vector3): (number, number)
	local rel = origin:PointToObjectSpace(world)
	return math.floor(rel.X / PlotGrid.CELL), math.floor(rel.Z / PlotGrid.CELL)
end

return PlotGrid
```
Tests I ran (pure parts): snap 5.9 to 4 and 6.1 to 8; a 2x3 item rotated once becomes 3x2; overlap and out-of-bounds placements return false; fractional cells return false. [S36][S37]
Pitfalls: doing rotation maths on world axes (a 2024 thread: rotated blocks clip because "next to" changes; footprint swapping on odd rotations plus object-space maths avoids it) [S38]; trusting a client CFrame; using `Mouse.Hit` embedded in the floor (offset by normal or use cell centres) [S36]; stacking and walls need a third axis (Snap had none, add a `level` index and per-level occupancy tables) [S39]; model pivot not at its base centre; the ghost model colliding with the character (set `CanCollide` false and a collision group); touch input needs a visible Place and Rotate button, not right-click.

### Recipe 11: Serialize a plot, budget it, and save it separately
When to use: any game where players place items.
Steps:
1. Item record = `(id, cx, cz, rot)`; pack to one integer: `((id x 256 + cx) x 256 + cz) x 4 + rot` (id below 65,536, grid up to 256x256, rot 0-3). Extra data (colour index, upgrade level) goes in a parallel array indexed the same way.
2. Save `{ v = 1, items = { n1, n2, ... } }`. 10,000 items is about 120,000 characters (script output) against the 4,194,304-character key limit; if you add per-item fields, chunk by 20,000 items into keys `Plot_{uid}_1, _2, ...` and store the chunk count in the profile.
3. Object budget (monetisation lever): default 400 items; Large Plot (+100% data) as a pass (Bloxburg doubles the plot data limit with its 250-Robux Large Plot and sells an extra 20% for 59 Robux). Show a bar "Plot data 63%". [S89]
4. Load: validate each record against the catalog and the grid (skip invalid ones, log them), then rebuild models in batches of 50 per frame (`task.wait()` between batches) so a big plot does not freeze the server.
5. Save when the player leaves, every 5 minutes if dirty, and on `BindToClose` (ProfileStore handles its own; your plot key needs its own handler).
```luau
--!strict
local function pack(id: number, cx: number, cz: number, rot: number): number
	return ((id * 256 + cx) * 256 + cz) * 4 + rot
end

local function unpack4(n: number): (number, number, number, number)
	local rot = n % 4
	n //= 4
	local cz = n % 256
	n //= 256
	local cx = n % 256
	return n // 256, cx, cz, rot
end

-- pack(40000, 255, 17, 3) = 10486021191 and round-trips; 10,000 such items are about 120 KB
return { pack = pack, unpack4 = unpack4 }
```
Pitfalls: saving instances or CFrames (CFrame strings are 17-74 characters each) [S42]; JSON-encoding yourself before the DataStore (it serialises tables for you; double encoding wastes space) [S33]; one giant key that approaches 4 MB (writes are 4 MB per minute per key) [S13]; loading invalid records after a catalog change (version your catalog ids and never reuse them); the 2027 in-game creation persistence is planned, not shipped, so do not wait for it. [S26]

### Recipe 12: NPC customer business sim (Retail / Restaurant style)
When to use: shop, restaurant, hotel, hospital, zoo.
Steps:
1. Entities: `Seat` or `Shelf` parts with attributes (`Capacity`, `Price`), `Counter`, `Door`, and a plot-level `Rating` (0-5).
2. Spawn rule (my design): every `1 / lambda` seconds while customers < cap, with `lambda = base x (0.5 + rating / 5)` customers per second and cap = 20 + 5 x floors (stay far under the 150-NPC `PathfindingService` ceiling a 2022 poster reported). [S53]
3. Customer state machine (server, attributes only): Enter, ChooseTarget (free seat or shelf), Walk (`Humanoid:MoveTo` between fixed waypoints, `PathfindingService` only for long routes with `WaypointSpacing = math.huge`), Wait (patience 30-60 s), Pay, Leave. Customers that run out of patience leave and lower the rating.
4. Ratings: five categories worth one star each (service, food, atmosphere, expansions, hygiene), each a ratio of owned to target counts; RT3's published targets (8 chefs and 8 waiters at level 5, 100 seats, 200,000 value, 3 toilets) are a worked example. Stars unlock special customers rather than raising spawn rate. [S94]
5. Pricing: sell price = base cost x markup; demand falls as markup rises (derive a curve and tune it; Retail Tycoon 2 toy example: $20 cost, $45 sale, 125% margin). [S106]
6. Staff are paid per minute (restocker $200 hire plus $20 per minute in RT2) so automation is a decision, not a free upgrade. [S106]
7. Make it cheap: one skinned mesh per NPC, `CanCollide`, `CanQuery`, `CanTouch`, `CastShadow` false, pool and reuse NPCs. [S52]
Pitfalls: pathfinding every frame; one script per NPC; all NPCs replicating Humanoid physics (use fewer, simpler rigs or client-visual crowds with server-side counts only); tying income to NPC count so a lag spike cuts income (use expected income per rating, NPCs as visuals); no automation without Robux (players leave). [S47]

### Recipe 13: Shared shop stock with a global timer (no MessagingService)
When to use: seed, gear or egg shops that restock every 5 or 30 minutes and must match across servers.
Steps:
1. `INTERVAL = 300`; `slot = floor(now / 300)`; seconds until restock = `300 - now % 300`.
2. Stock = deterministic roll seeded with `SECRET + slot` (the secret stays server-side so exploiters cannot predict future stock).
3. Clients show a countdown from the server's value (attribute `NextRestockAt`); the server re-rolls when the slot changes.
```luau
--!strict
local INTERVAL = 300
local SECRET = 90210 -- keep in ServerScriptService only

type StockItem = { id: string, weight: number }

local function slotOf(t: number): number
	return math.floor(t / INTERVAL)
end

local function rollStock(slot: number, items: { StockItem }, picks: number): { string }
	local rng = Random.new(SECRET + slot)
	local result: { string } = {}
	for _ = 1, picks do
		local total = 0
		for _, it in items do total += it.weight end
		local roll = rng:NextNumber() * total
		for _, it in items do
			roll -= it.weight
			if roll <= 0 then
				table.insert(result, it.id)
				break
			end
		end
	end
	return result
end

local lastSlot = -1
task.spawn(function()
	while true do
		local now = workspace:GetServerTimeNow()
		local slot = slotOf(now)
		if slot ~= lastSlot then
			lastSlot = slot
			-- publish: ReplicatedStorage.Stock:SetAttribute("Items", table.concat(rollStock(slot, {}, 5), ","))
		end
		task.wait(1)
	end
end)
return { slotOf = slotOf, rollStock = rollStock }
```
Same seed gives identical output on every server (documented seeding rule: seed truncated to an integer in the safe-integer range). Rare items with well under 1% per slot (a third-party tracker lists a 0.34% seed with a roughly 24-hour average wait in Grow a Garden) are generated by independent per-item rolls instead of weights. [S44][S11][S10]
Pitfalls: client-side rolls; sharing the secret in a replicated module; using `os.time()` on one server and `GetServerTimeNow` on another (pick one); changing weights without a slot-based migration (stock changes mid-slot).

### Recipe 14: Base slots, lock timer and steal (Steal a Brainrot / Steal An Egg base)
When to use: 7-9 player servers with theft; see 03 Recipe 14 for the loop, this adds the base data model.
Steps:
1. Base model with `Slots` (parts named Slot1..SlotN, N = 10 + unlocked floors), a front `Gate` (collision-blocked for non-owners while `Locked`), a `Collect` pad and a stairs/ladder per floor.
2. State: `locked`, `lockEndsAt`, `slots[i] = { id, mutation, income, placedAt }`. A lock lasts `60 + 10 x rebirths` seconds (SaB: 30 s on join, 60 s per lock, +10 s per rebirth) and ends visibly with a countdown. [S102]
3. Theft: owner is notified, thief is slowed (WalkSpeed x 0.7), tools are disabled, and a hit by anyone returns the item to its original slot (SaB behaviour). Keep a `carrying` flag server-side; transfer the item only when the thief reaches their own base. [S102]
4. Floors unlock per rebirth (SaB: second floor at rebirth 2, third at rebirth 10; slot totals differ by source, so make yours a table). [S101][S102]
5. Server size 7-9 (Steal An Egg 7, Anime Dice 9) so theft is personal. [S65][S91]
Pitfalls: client-decided carry or return (exploits); a thief that can sit in the base forever; slot counts hard-coded in several scripts (one table); income computed from the slot index instead of the item.

### Recipe 15: Visitors, co-op plots and filtered signs
When to use: building or business games with visiting and shared editing.
Steps:
1. Plot attribute `OwnerId` plus an attribute-backed set `Builders` (UserIds, up to 4; RT3 has co-op with friendship XP). [S48]
2. Server rules: owner can invite or remove builders; builders can place and remove but not sell or rebirth; visitors can walk in only when the plot is `Public` (others are blocked by a transparent barrier Part toggled by the attribute).
3. Signs, plot names and shop names: store raw text, filter on display.
```luau
--!strict
local TextService = game:GetService("TextService")

local function filteredForEveryone(author: Player, raw: string): string?
	if #raw == 0 or #raw > 60 then return nil end
	local ok, result = pcall(function()
		return TextService:FilterStringAsync(raw, author.UserId, Enum.TextFilterContext.PublicChat)
	end)
	if not ok then return nil end
	local ok2, text = pcall(function()
		return result:GetNonChatStringForBroadcastAsync()
	end)
	if ok2 then return text end
	return nil
end
return filteredForEveryone
```
Pitfalls: filtering per keystroke (filter after submit); saving the filtered string; showing unfiltered text for a frame; builders given the same powers as the owner; no report or clear button.

### Recipe 16: Tycoon first five minutes
When to use: the FTUE of any tycoon; adapts 03 Recipe 1.
Steps: 0-10 s: spawn on the plot, a Beam arrow from the character to the first button, a 12-character label "Buy: Dropper". 10-30 s: first purchase affordable (50 cash at 2.5/s = 20 s; or grant 25 starting cash so the first buy lands near 10 s). 30-90 s: second and third buttons, each 20-35 s apart (g 1.25). 90 s-3 min: automation button (auto-collect) visible and affordable; show a "Next goal" label with the price. 3-5 min: first expansion that visibly changes the plot, then a preview of rebirth and a daily reward. 5-10 min: first event or limited item shown in the shop (no sale prompt before minute 5, see 03). Success criteria: first purchase under 30 s, three purchases under 2 minutes, automation under 3 minutes (derived from the pacing law and the 2026 anecdote). [S60]
Pitfalls: a tutorial wall of text; arrows that stay after the player learned; a rebirth teaser the player can never reach in the first session.

### Recipe 17: Events and collaborations for a tycoon
When to use: weekly or monthly live-ops.
Steps: one event currency and one event shop (Roblox's economy guidance), one tycoon-specific mechanic per event (a limited customer type, a limited dropper skin, a special belt tier), a timed leaderboard with wide reward tiers (03: PS99 pattern), and a pre-announcement 7 days ahead through short videos (RT3 posts 2+ per week). Cadence: big update or collab, then 2-3 small updates. [S2][S48]
Pitfalls: event sources that outrun sinks (Roblox's gold-surplus example), events that require a rebirth the player has not reached, and any event that rewards watching a feed (policy above). [S2][S61]

## Luau reference snippets
The recipes above contain the complete, checked snippets. The calls they rely on (all in the docs listed): `CollectionService:GetTagged`, `Instance:SetAttribute/GetAttribute`, `Model:PivotTo`, `CFrame:PointToObjectSpace`, `PhysicsService:RegisterCollisionGroup/IsCollisionGroupRegistered/CollisionGroupSetCollidable`, `BasePart:SetNetworkOwner`, `BasePart.AssemblyLinearVelocity`, `Debris:AddItem`, `ProximityPrompt.Triggered`, `workspace:GetServerTimeNow`, `Random.new(seed)`, `TextService:FilterStringAsync` and `TextFilterResult:GetNonChatStringForBroadcastAsync`, `MarketplaceService.ProcessReceipt` and `BindReceiptHandler`. [S6][S7][S8][S9][S10][S11][S12][S20]

Developer-product cash pack scaled to income (idempotent receipt handling shown in 04/08; this only shows the amount):
```luau
--!strict
-- "1 hour of income" pack: value follows the buyer's progress instead of a fixed number
local function packAmount(ratePerSecond: number, hours: number, minimum: number): number
	return math.max(minimum, math.floor(ratePerSecond * 3600 * hours))
end
return packAmount
```

Client display helper (K, M, B, T, Qa, Qi):
```luau
--!strict
local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi" }
local function short(n: number): string
	local i = 1
	while n >= 1000 and i < #SUFFIXES do
		n /= 1000
		i += 1
	end
	if i == 1 then return tostring(math.floor(n)) end
	return string.format("%.2f%s", n, SUFFIXES[i])
end
return short
```

## Open questions / unverified
- The first-party Tycoon pricing guidance: no Roblox document gives tycoon-specific button or rebirth numbers; every price ladder here is derived or from guides (03 and this note). The only first-party worked economy is the fishing example. [S2]
- Whether Roblox said tycoons and roleplay get reduced Creator Rewards: not found in the docs page or the launch announcement; 03 asserts it, I could not confirm it. [S21][S22]
- Steal An Egg: the all-time peak (9.9M to 14.3M by tracker) and the August 2026 timeline are inconsistent between Rolimons, ggaid, RoVitals and StudioKrew; the developer and studio were not named in the pages I read; its monetisation and per-pet odds are not in any fetched source. [S75][S72][S71][S65]
- Restaurant Tycoon 3's paid-access price (the spotlight mentions the $9.99 paid-access revenue share; a wiki says 25 Robux) and the team size were not confirmed. [S48][S93]
- Welcome to Bloxburg: Premium's price (300 vs 400 Robux), the launch year (2014 on Wikipedia, 2016 in 03) and the acquisition price (reported as $100M in a search summary, not confirmed) conflict. [S64][S90][S104]
- Theme Park Tycoon 2 and Lumber Tycoon 2 economy formulas (ride income, guest happiness, wood prices) were not found; their Fandom wikis blocked fetching. The Retail Tycoon 2 numbers come from one search summary. [S106]
- The 150-NPC `PathfindingService` ceiling is one 2022 forum claim, not a benchmark. [S53]
- No source gave the default of `ProximityPrompt.MaxActivationDistance` or `HoldDuration` (set them explicitly). [S8]
- In-game creation persistence, new primitives and built-in session locking are roadmap items (early 2027 per the 2026-09-18 roadmap) and may slip. [S26]
- No developer talk was found for Steal a Brainrot's base system or Anime Dice; their mechanics are from wikis and trackers.

## Sources
Trust labels: (F) Roblox first-party doc or announcement, (D) DevForum thread (author named), (T) third-party tracker, wiki, press or guide, (S) search summary only. All fetched 2026-10-04 unless a date is shown.
[S1] Genres (experience genres and subgenres), Roblox Creator Docs, https://create.roblox.com/docs/production/publishing/experience-genres (F)
[S2] Balance virtual economies, Roblox Creator Docs, https://create.roblox.com/docs/production/game-design/balance-virtual-economies (F)
[S3] Core loops, Roblox Creator Docs, https://create.roblox.com/docs/production/game-design/core-loops (F, S)
[S4] Plant reference project, Roblox Creator Docs, https://create.roblox.com/docs/resources/plant-reference-project (F)
[S5] Network ownership, Roblox Creator Docs, https://create.roblox.com/docs/physics/network-ownership (F)
[S6] BasePart class reference (creator-docs repo), https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/BasePart.yaml (F)
[S7] Debris class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Debris.yaml (F)
[S8] ProximityPrompt class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/ProximityPrompt.yaml (F)
[S9] PhysicsService class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/PhysicsService.yaml (F)
[S10] Workspace class reference (GetServerTimeNow), https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Workspace.yaml (F)
[S11] Random data type reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/datatypes/Random.yaml (F)
[S12] MarketplaceService class reference, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/MarketplaceService.yaml (F)
[S13] Data stores error codes and limits, Roblox Creator Docs, https://create.roblox.com/docs/cloud-services/data-stores/error-codes-and-limits (F)
[S14] Unifying Data Stores Open Cloud and Game APIs, and Increasing Storage Limits, Roblox staff, DevForum, 2026-07-15 (effective 2026-07-29), https://devforum.roblox.com/t/unifying-data-stores-open-cloud-and-game-apis-and-increasing-storage-limits/4739240 (F)
[S15] DataStores Access and Storage Updates, Roblox staff, DevForum, 2025-04-07, https://devforum.roblox.com/t/datastores-access-and-storage-updates/3597255 (F)
[S16] Security tactics, Roblox Creator Docs, https://create.roblox.com/docs/scripting/security/security-tactics (F)
[S17] Performance optimization: design, Roblox Creator Docs, https://create.roblox.com/docs/performance-optimization/design (F)
[S18] Instance streaming, Roblox Creator Docs, https://create.roblox.com/docs/workspace/streaming (F)
[S19] Text filtering, Roblox Creator Docs, https://create.roblox.com/docs/ui/text-filtering (F)
[S20] TextService class reference, Roblox Creator Docs, https://create.roblox.com/docs/reference/engine/classes/TextService (F)
[S21] Creator Rewards, Roblox Creator Docs, https://create.roblox.com/docs/creator-rewards (F)
[S22] Creator Rewards is Live, Roblox staff, DevForum, 2025-07-24, https://devforum.roblox.com/t/creator-rewards-is-live/3838257 (F)
[S23] Templates, Roblox Creator Docs, https://create.roblox.com/docs/resources/templates (F, S)
[S24] Roblox Official full project resources, DevForum, 2023-08, https://devforum.roblox.com/t/roblox-official-full-project-resources/2522805 (F)
[S25] RDC26: What We Announced, Roblox, DevForum, 2026-09-11, https://devforum.roblox.com/t/rdc26-what-we-announced/4865880 (F)
[S26] Creator Roadmap 2026: Fall Update, Roblox, DevForum, 2026-09-18, https://devforum.roblox.com/t/creator-roadmap-2026-fall-update/4880208 (F)
[S27] [Early Access] In-experience 4D Functional Objects and Enhanced 3D Generation, Roblox, DevForum, 2025-11-06 (update 2026-01-08), https://devforum.roblox.com/t/early-access-introducing-in-experience-4d-functional-objects-and-enhanced-3d-generation/4050893 (F)
[S28] Save player data with standard data stores, Roblox Creator Docs, https://create.roblox.com/docs/tutorials/use-case-tutorials/data-storage/save-player-data (F, S)
[S29] Best practice for efficient tycoon droppers and moving parts, kinkocat with Kensizo, DevForum, 2019-08-27, https://devforum.roblox.com/t/best-practice-for-efficient-tycoon-droppers-and-moving-parts/339303 (D)
[S30] Avoiding exploits on client-side tycoon drops, KingCheese13, DevForum, 2022-12-25, https://devforum.roblox.com/t/avoiding-exploits-on-client-side-tycoon-drops/2087670 (D)
[S31] How to script drops for tycoon well, bleintant with SeargentAUS and Exozorcus, DevForum, 2024-10-25, https://devforum.roblox.com/t/how-to-script-drops-for-tycoon-well/3227529 (D)
[S32] How are trending simulator games developing the conveyor belt system, swyftey with replies, DevForum, 2025-11-05, https://devforum.roblox.com/t/how-are-trending-simulator-games-developing-the-conveyor-belt-system/4049087 (D)
[S33] How do tycoons save player data with all those buttons, 1RedNightBlade with KdudeDev, Kynikau, WoTrox and Elite_Remote, DevForum, 2022-06-21, https://devforum.roblox.com/t/how-do-tycoons-save-player-data-with-all-those-buttons-and-what-is-the-most-efficient-way/1840400 (D)
[S34] A very advanced Kit for Tycoons (Ruixey's TycoonKit), RuixeyDev, DevForum, 2022-06-29 (updates to 2023-01), https://devforum.roblox.com/t/a-very-advanced-kit-for-tycoons-ruixeys-tycoonkit/1850596 (D)
[S35] Tycoon Framework/system, PlayAsync and Korvbagarens, DevForum, 2020-01-05, https://devforum.roblox.com/t/tycoon-frameworksystem/426073 (D)
[S36] How to make a Grid-Placement System, C_Corpze, Tomi1231, astraIboy, zblox164, DevForum, 2023-11-30, https://devforum.roblox.com/t/how-to-make-a-grid-placement-system-closed/2723673 (D)
[S37] Placement System Snapping/Stacking, MBBoop1 with koziahss and Deadwoodx, DevForum, 2021-11-24, https://devforum.roblox.com/t/placement-system-snappingstacking/1562989 (D)
[S38] Rotating block on grid building system breaks stuff, ThoseWhoThrill with Sniperkaos and PANDASonNOOB, DevForum, 2024-08-27, https://devforum.roblox.com/t/rotating-block-on-grid-building-system-breaks-stuff/3136125 (D)
[S39] Snap: an advanced grid placement class v1.2, astraIboy, DevForum, 2023-12-06, https://devforum.roblox.com/t/snap-an-advanced-grid-placement-class-v12/2730963 (D)
[S40] PlacementService (v1.6.2, Apache-2.0) repository and API docs, zblox164, GitHub, https://github.com/zblox164/PlacementService and https://zblox164.github.io/PlacementService/API/ (D)
[S41] How do "Steal a" games calculate offline cash, mlnitoon2 with SeargentAUS and satqx1, DevForum, 2025-08-02, https://devforum.roblox.com/t/how-do-steal-a-games-calculate-offline-cash/3854950 (D)
[S42] Serializing values into strings to save DataStore space, lannior, DevForum, 2021-07-18, https://devforum.roblox.com/t/serializing-values-into-strings-to-save-datastore-space/1358106 (D)
[S43] Saving thousands of parts to datastores, XdJackyboiiXd21 with OptimisticSide and Infi_power, DevForum, 2020-12-22, https://devforum.roblox.com/t/saving-thousands-of-parts-to-datastores/938866 (D)
[S44] Reverse Engineering on How the Stock System in Grow a Garden works, Artzified, DevForum, 2025-06-21, https://devforum.roblox.com/t/reverse-engineering-on-how-the-stock-system-in-grow-a-garden-works/3767345 (D)
[S45] Reproducing Grow A Garden Offline System, agKing_21 with avodey, ChiDj123 and mikoblixel, DevForum, 2025-09-01, https://devforum.roblox.com/t/reproducing-grow-a-garden-offline-system/3912089 (D)
[S46] I don't know why my game is getting low retention, charman444 with RtxyRBLX, DevForum, 2025-06-30, https://devforum.roblox.com/t/i-dont-know-why-my-game-is-getting-low-retention/3790969 (D)
[S47] How to improve Retention? (retail tycoon), iDespairful with AurexOfAsylia, DevForum, 2026-01-31, https://devforum.roblox.com/t/how-to-improve-retention/4319794 (D)
[S48] Creator Spotlight: How Ultraw's Love for Food Became a Trending Tycoon, Roblox, DevForum, 2025-07-25, https://devforum.roblox.com/t/creator-spotlight-how-ultraw%E2%80%99s-love-for-food-became-a-trending-tycoon/3840933 (F)
[S49] Restaurant Tycoon 3 bulletin board thread, Ultraw, DevForum, 2025-05-30 (updated through 2026-10-02), https://devforum.roblox.com/t/restaurant-tycoon-3/3670704 (D)
[S50] Lumber Tycoon 2, Defaultio, DevForum, 2015-08-29 (stale), https://devforum.roblox.com/t/lumber-tycoon-2/18069 (D)
[S51] Different approach to tycoons, Hyperant with colbert2677, Lord_Blaze64, amp_lex, DevForum, 2020-04-20, https://devforum.roblox.com/t/different-approach-to-tycoons/533253 (D)
[S52] NPC Pathfinding System, tips to improve performance, Roldstred with PysephDEV, Sangolemango and Ukendio, DevForum, 2024-11-18, https://devforum.roblox.com/t/npc-pathfinding-system-looking-for-tips-to-improve-performance/3264173 (D)
[S53] Mass Npc pathfinding, gwenniekins, DevForum, 2022-03-12, https://devforum.roblox.com/t/mass-npc-pathfinding/1707947 (D)
[S54] Developer Spotlight: Den_S (Theme Park Tycoon 2), Roblox, Medium, 2019-06-03 (read through a text mirror because the page blocked the direct fetch), https://medium.com/roblox-developer/developer-spotlight-den-s-ec12c47dd3f9 (F)
[S55] Ideas for a Tycoon style game, MaliciousAlliance, DevForum, 2023-05-18, https://devforum.roblox.com/t/ideas-for-a-tycoon-style-game/2344413 (D, minor)
[S56] The Math of Idle Games, Part I, Anthony Pecorella, Game Developer (from Kongregate), 2016-10-13, https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i (T)
[S57] The Math of Idle Games, Part II, Anthony Pecorella, 2016-12-14, https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii (T)
[S58] The Math of Idle Games, Part III, Anthony Pecorella, 2017-02-01, https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii (T)
[S59] Idle game development: mechanics, cost, and LiveOps, Game-Ace, 2026-01-22 (updated 2026-09-09), https://game-ace.com/blog/idle-game-development/ (T, mobile idle, not Roblox)
[S60] I Built 7 Idle Games in 30 Days, aguier, DEV Community, 2026-08-02, https://dev.to/aguier/i-built-7-idle-games-in-30-days-what-i-learned-about-incremental-design-5d3f (T, anecdotal)
[S61] Roblox Forces Its Biggest Game To Axe Doomscrolling Mechanic, Kotaku, 2026-08-26, https://kotaku.com/roblox-cracks-down-on-doomscrolling-games-like-steal-an-egg-that-forces-players-to-watch-reels-while-running-on-a-treadmill-2000727952 (T, press)
[S62] Roblox's No. 1 Game Steal An Egg Was Pulled Hours After Reaching The Top, EGamers.io, 2026-08-25, https://egamers.io/robloxs-no-1-game-steal-an-egg-was-pulled-hours-after-reaching-the-top/ (T, low reliability)
[S63] Steal a Brainrot, Wikipedia, https://en.wikipedia.org/wiki/Steal_a_Brainrot (T)
[S64] Welcome to Bloxburg, Wikipedia, https://en.wikipedia.org/wiki/Welcome_to_Bloxburg (T)
[S65] Top Roblox Games August 2026, StudioKrew, 2026-08-20, https://studiokrew.com/blog/top-roblox-games-august-2026/ (T)
[S66] Top Roblox Games September 2026, StudioKrew, https://studiokrew.com/blog/top-roblox-games-september-2026/ (T)
[S67] Top Roblox Games July 2026, StudioKrew, https://studiokrew.com/blog/top-roblox-games-july-2026/ (T)
[S68] Top Roblox Games May 2026, StudioKrew, 2026-04-29, https://studiokrew.com/blog/top-roblox-games-may-2026/ (T)
[S69] Roblox's Top Games in August 2026, MaxPower Gaming, 2026-09-22, https://www.maxpowergaming.co/post/roblox-s-top-games-in-august-2026-murder-mystery-2-and-steal-an-egg-take-over (T)
[S70] Roblox's Steal An Egg Is Beating Some of the Platform's Biggest Games, Player.One, 2026-09-09, https://www.player.one/robloxs-steal-egg-beating-some-platforms-biggest-games-164086 (T, press)
[S71] Roblox Game Records, observed player peaks (Sep 2026), RoVitals, https://rovitals.com/records (T)
[S72] Steal An Egg player count, ggaid, 2026-10-04, https://www.ggaid.com/roblox/games/steal-an-egg-10563114921 (T)
[S73] Steal An Egg Wiki, Bloxodes, https://bloxodes.com/wiki/steal-an-egg (T)
[S74] Steal An Egg Value List (September 2026), timesaver.gg, 2026-09-26, https://timesaver.gg/blog/steal-an-egg-pet-value-list (T)
[S75] Steal An Egg, Rolimons, https://www.rolimons.com/game/107778070777162 (T)
[S76] Restaurant Tycoon 3, Rolimons, https://www.rolimons.com/game/119048529960596 (T)
[S77] Theme Park Tycoon 2, Rolimons, https://www.rolimons.com/game/69184822 (T)
[S78] Lumber Tycoon 2, Rolimons, https://www.rolimons.com/game/13822889 (T)
[S79] Retail Tycoon 2, Rolimons, https://www.rolimons.com/game/5865858426 (T)
[S80] Welcome to Bloxburg, Rolimons, https://www.rolimons.com/game/185655149 (T)
[S81] Build A Boat For Treasure, Rolimons, https://www.rolimons.com/game/537413528 (T)
[S82] War Tycoon, Rolimons, https://www.rolimons.com/game/4639625707 (T)
[S83] Miner's Haven, Rolimons, https://www.rolimons.com/game/258258996 (T)
[S84] Car Dealership Tycoon, Rolimons, https://www.rolimons.com/game/1554960397 (T)
[S85] Brookhaven RP, Rolimons, https://www.rolimons.com/game/4924922222 (T)
[S86] Anime Dice, Rolimons, https://www.rolimons.com/game/113290951185459 (T)
[S87] "24 extra expansion plots" game pass (Theme Park Tycoon 2), Rolimons, https://www.rolimons.com/gamepass/1752957 (T)
[S88] "Increased height limit" game pass (Theme Park Tycoon 2), Rolimons, https://www.rolimons.com/gamepass/1163930 (T)
[S89] Bloxburg Plot Size: 30x30 vs 50x50, floors, basements, bloxburgbuilds.com, 2026-09-14, https://bloxburgbuilds.com/guides/bloxburg-plot-size (T)
[S90] Bloxburg Gamepass Prices in Robux (September 2026), bloxburgbuilds.com, updated 2026-08-12, https://bloxburgbuilds.com/guides/bloxburg-gamepass-prices (T)
[S91] Anime Dice Launch Notes, anime-dice.wiki, https://anime-dice.wiki/updates/release/ (T)
[S92] Anime Dice Wiki, Bloxodes, https://bloxodes.com/wiki/anime-dice (T)
[S93] Restaurant Tycoon 3 Wiki, https://restauranttycoon3.wiki/ (T)
[S94] 5 Star Guide and Checklist, Restaurant Tycoon 3 Wiki, https://restauranttycoon3.online/guide/5-star-guide (T)
[S95] Restaurant Tycoon 3 on Roblox: Everything You Need to Know, Yahoo/AT&T, 2025-10-22, https://currently.att.yahoo.com/att/restaurant-tycoon-3-roblox-everything-191305696.html (T)
[S96] Roblox Tycoon Games 2026: The Builds, Loops, and Economies, endsights.com, 2026-04-25, https://endsights.com/roblox-tycoon-games (T, low reliability: unsourced statistics)
[S97] How to make a tycoon game in Roblox, obby.fun, 2026-04-22, https://www.obby.fun/blog/how-to-make-tycoon-game-roblox (T, heuristic)
[S98] Roblox best tycoon games: the top 14 of 2026, mobi.gg, updated 2026-07-28, https://mobi.gg/en/tops/top-roblox-best-tycoon-games-in-year/ (T)
[S99] 25 best Roblox tycoon games, thespike.gg, 2025-05-16, https://www.thespike.gg/roblox/best-roblox-games/best-tycoons (T)
[S100] Best Roblox Tycoon Games 2026 ranked by depth, dungeonpath.com, 2026-07-13 (updated 2026-09-17), https://dungeonpath.com/posts/pillar/roblox-tycoon-games-compared/ (T, low reliability)
[S101] Steal a Brainrot Wiki (economy tables, last updated Dec 2025), https://steal-a-brainrot.wiki/ (T)
[S102] Steal a Brainrot (BRAZILIAN SPYDER), Roblox Fandom wiki, page updated 2025-07-24, https://roblox.fandom.com/wiki/BRAZILIAN_SPYDER/Steal_a_Brainrot (T, S)
[S103] Steal a Brainrot Wiki, Bloxodes, 2026-10-04, https://bloxodes.com/wiki/steal-a-brainrot (T)
[S104] Bloxburg transitioning to free to play model, Pro Game Guides, 2024, https://progameguides.com/roblox/bloxburg-transitioning-to-free-to-play-model-rewards-promised-for-buyers/ (T, S)
[S105] The Core Loop Mistake Killing Most Roblox Games, RoWatcher, undated, https://rowatcher.com/news/the-core-loop-mistake-killing-most-roblox-games (T, minor; used only as context: progression amplifies a core loop but does not create one)
[S106] Retail Tycoon 2 shelves, restockers and PPU pages, Retail Tycoon wikis (Fandom), https://retail-tycoon.fandom.com/wiki/Shelves_(Retail_Tycoon_2) (T, S)
