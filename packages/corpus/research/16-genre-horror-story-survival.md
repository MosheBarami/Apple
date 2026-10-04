# Horror, story and survival-crafting games on Roblox
_Researched 2026-10-04 by deep-research agent (Claude), Round 2. Sources: 104 (about 24 first-party or primary: Roblox docs, Roblox newsroom, devforum creator spotlights and threads; the rest third-party trackers, wikis, guides and press, about 25 of them search summaries). Goes deeper than `03-genre-design.md` ("Horror / story", "Survival", Recipes 9, 10, 16)._

How to read the labels. "[Sx]" cites the list at the bottom. "Third-party" means a tracker (Rolimons, RoWatcher), wiki, guide site or press piece, not Roblox and not the developer; its numbers are snapshots that drift with every update. "Search summary" means the page itself could not be fetched (Fandom returned HTTP 402 and some others 403) and the figure comes from a search-result summary; treat it as less certain. "Derived" means I computed it and show the arithmetic. "Heuristic" means a design starting value with no measured source. "Unverified" means I could not confirm it. Fandom and guide-site numbers conflict in many places below; conflicts are named, not hidden. Several guide sites are SEO pages (for example the 99 Nights day-length pages disagree by a factor of three); I say which one I trust and why.

## Key facts

### 1. The 2026 market for horror and survival (all third-party tracker data unless marked)

- Horror and survival are not one genre on Roblox. The money and the players sit in four formats: (a) run-based "escape" horror with a procedural run and a death-and-retry loop (DOORS, Pressure, The Inn); (b) co-op "work and hide" horror (Dandy's World, Animal Hospital, Road-Side Shawarma); (c) asymmetric matches (Forsaken, Piggy, Evade, Flee the Facility); (d) co-op survival camps and moving bases (99 Nights in the Forest, Dead Rails, 3008). Episodic story horror (The Mimic, Piggy chapters, Break In) is a fifth, smaller format. [S16][S18][S24][S32][S43][S56]
- Peak concurrent players (CCU), all-time, third-party snapshots read on 2026-10-04: 99 Nights in the Forest 14,153,173 (Rolimons) [S13] (Roblox's own creator spotlight says "14 million" [S1]; RoWatcher's page says 11.2 million in September 2025 [S12], so one tracker disagrees); Dead Rails 1,476,198 [S60]; Animal Hospital 1,273,105 on 2026-07-10 [S53] (an earlier peak of 736,948 on 2026-07-05 is reported by GosuGamers [S51]); Forsaken 1,221,080 per Rolimons [S38] (RoWatcher's game page says 1.1 million in July 2025 [S35b]; a RoWatcher news piece says "138,000+" and is probably stale or wrong, so I treat Forsaken's peak as roughly 1.1 to 1.2 million, third-party); Dandy's World 866,577 [S30] with the developer saying 875,000 during the Easter 2025 event (first-party, via the Roblox creator spotlight [S25]); Piggy 533,409 on 2020-05-24 [S44]; DOORS 381,720 on 2023-01-29, the day of the Hotel+ update [S18][S22]; Evade 197,261 on 2022-08-28 [S63]; Road-Side Shawarma 76,748 on 2025-11-02 [S55]; The Mimic 65,363 on 2024-01-14 [S47]; Pressure about 111,000 in March 2026 [S42]; Deadly Delivery 36,274 on 2025-12-13 (search summary) [S98]; Break In (Story) 13,000 in December 2024 [S64].
- Average playtime per visit, Rolimons pages read 2026-10-04 (third-party; the exact definition is not published): Forsaken 18.87 min, Dead Rails 16.77, 99 Nights 16.18, Dandy's World 15.63, The Mimic 14.84, DOORS 13.57, Road-Side Shawarma 13.45, Piggy 13.13, Evade 12.79, Animal Hospital 12.30. [S13][S18][S30][S38][S44][S47][S53][S55][S60][S63] Every hit is in a 12 to 19 minute band. For comparison, note 03 cites a 9.8 minute median game-level session across 500-plus large Roblox games (GameAnalytics). Roblox's Creator Rewards need only 10 minutes in a day (note 03 [S29]), so these formats clear that bar with one run.
- Lifetime visits (third-party, 2026-10-04): Piggy 14.39B [S44], 99 Nights 29.85B [S13], DOORS 7.82B [S18], Dandy's World 7.51B [S30], Evade 9.26B [S63], Dead Rails 6.59B [S60], Forsaken 5.77B [S38], Animal Hospital 2.38B [S53], The Mimic 1.26B [S47], Break In (Story) 3.02B [S64], Road-Side Shawarma 184.5M [S55], Pressure 490M [S42].
- Live CCU on 2026-10-04 (Bloxodes, third-party; one instant, not a daily peak): 99 Nights 263.3K, Dandy's World 237.4K, DOORS 68.5K, Forsaken 70.9K, Animal Hospital 61.2K, Piggy 31.3K, Dead Rails 20.5K. [S2][S24][S19][S32][S50][S43][S57] Caution: Rolimons says DOORS had a "current peak" of 273,981 a day earlier [S18], so instantaneous and daily-peak numbers differ about four-fold for the same game; never compare a peak with a live number without saying so.
- Awards (first-party, Roblox newsroom 2026-09-12): 99 Nights in the Forest won Best Survival Game; Animal Hospital won Best New Game, People's Choice and Best Innovation in Creative Direction; DOORS won Best Use of Audio. [S15] A third-party page says Forsaken won Best Survival Experience at the 2025 awards [S35].
- How fast these games decay (derived from the numbers above, third-party): Animal Hospital went from a 1,273,105 peak on 2026-07-10 to 61.2K live on 2026-10-04, 86 days later, about -95% (live vs daily peak, so overstated; the Aug 20 chart in note 03 shows 358.5K, which is a fairer midpoint). 99 Nights went from 14.15M to about 263K to 296K in 13 months, about -98% [S12][S13]. Dandy's World went from 875K (spring 2025) to 237K (derived -73%) and is still a top-five horror game after two-plus years [S25][S24]. DOORS and Piggy remain alive years later on chapter or floor drops (below). Forsaken lost 54.7% of its players in one week in July (RoWatcher news, cause unstated) [S37]. A viral spike is not a business; the games that last ship content on a calendar.
- Third-party view of trends (RoWatcher 2026 list, ranking as of an unstated date): asymmetric horror is the fastest-growing subgenre, survival-crafting broadens the audience, mascot horror holds because of lore, and pure jump-scare games are declining in favour of progression and replayability. [S56]
- Solo and tiny-team proof: Road-Side Shawarma was made by one developer (nv1sh) with helpers for music and art, created 2025-10-01, peaked at 76,748 and passed 184M visits [S55]. 99 Nights was three creators (Cracky4 design and art direction, ForyxeV programming, Viridial building) plus one artist and one animator, in about three months, all in New Zealand [S1]. Dandy's World runs about 11 developers and 6 testers (Fandom team page, search summary) [S29]. Pressure took 17 months from the first development entry (2023-02-07) to release (2024-07-07), derived from the official wiki dates [S39]. Dead Rails' studio (RCM Games, RiccoMiller) had earlier horror hits with 120M+ and 44M+ plays [S58].

### 2. Run-based escape horror: DOORS and Pressure anatomy

DOORS (LSPLASH; Roblox creation date 2021-03-14 [S19]; first floor shipped 2022-08-10 per Wikipedia [S17]):
- Loop: open numbered doors through hotel rooms by trial and error; the room counter is both progress and score. The Hotel is rooms 1 to 100; the second floor, The Mines, shipped 2024-08-30; modifiers shipped 2023-08-26; an admin panel and stream integration shipped 2024-12-20. [S17][S20] (One guide says the Mines span rooms 100 to 200; unverified.)
- Content counts (Bloxodes, third-party): 45 entities each with a tell (flickering lights, footsteps, roars, whispers, timers, sudden visual changes), 46 items, 5 floors (Hotel, Mines, Backdoor, Rooms, Outdoors), two currencies (Knobs, Stardust), 50 players per server. [S19]
- Entity design is the product. The entities and what they teach (third-party guide tables, damage numbers vary by update): Rush (lights flicker, roar swells; counter is to hide in a closet, bed or locker; fatal); Ambush (same tell, passes several times; counter is to leave the hiding spot only once it is gone, and staying too long summons the "Hide" entity that ejects you for about half your health); Seek (eyes appear on walls, then a scripted chase, with a guiding blue light showing the path; roughly rooms 30 to 35 and 70 to 75); Eyes (look away; about 10 damage when stared at); Halt (blue hallway, "turn around" prompt; about 60 damage if ignored); Screech (a quiet "psst" in the dark; you must turn and look at it or lose about half your health); Figure (heavy footsteps; blind, hears you; rooms 50 and 100; crouch to be quiet); Dupe (a wrong door number; choosing wrong costs damage); Timothy (a spider in a drawer; about 5 damage); Jeff (a friendly shop). [S20][S21] Each one is a different verb (hide, wait, look at, look away, follow, crouch, read), which keeps the game from becoming a single skill.
- Hiding has a limit: hiding in one place too long triggers an ejection (a guide gives about 12 seconds on a revival cooldown for the Hide entity, unverified) [S20][S21].
- Rush only appears in rooms that provide hiding spots (several closets, beds or vents) [S21]. That is the fairness rule in one line: never send an unhideable threat into a room with nowhere to hide.
- Live ops: the Hotel+ update (originally due December 2022, shipped 2023-01-28/29) added new entities, items and the first subfloor (The Rooms) and gave the all-time peak of 381,720 on 2023-01-29, the first update to take the game past 300,000 in a day (search summary of the Fandom update page) [S22][S18]. Roblox's docs and LiveOps pages already cite DOORS for QoL updates and a pre-run shop (note 03 [S8][S12]).
- Monetisation (search summary, third-party): Knobs packs run from 250 Knobs for 49 Robux to 16,000 Knobs for 1,799 Robux, a 5x Knob boost costs 129 Robux, revives are a consumable bought in the shop or earned by codes, and UGC accessories can grant Knobs and revives. [S23]
- Roblox credits DOORS with Best Use of Audio (2026): the sound tells you what is coming. [S15]
- A Doors-inspired Japanese horror game from an anime studio, The Inn, copied the "100 doors from 1 to 100" structure and designed its yokai by asking what real yokai would do instead of leaning on jump scares; the team had no game production experience and started in early 2025 (Roblox creator spotlight) [S65]. Run-structure copy-cats can work when the theme is new.

Pressure (Urbanshade: Hadal Division; lead YourFriendZeal; official wiki):
- Dates: development began 2023-02-07, released 2024-07-07, console 2024-07-15, last listed update 2026-03-28. [S39] The structure is "100 randomly generated rooms" to the end of a blacksite, with 200-plus extra rooms added in updates and more than 50 monsters; a currency Research is scavenged in rooms and spent at a shop, and Kroner is paid after an expedition from research collected, doors opened and depth. [S39] (A third-party list says 115 rooms; I trust the official wiki's 100 and flag the difference.)
- Detection model, in the wiki's own terms: most monsters follow pre-set node paths and are blind to a player far from the path; only a few (Pandemonium, Pipsqueak) use raycast line of sight. [S40] This is the cheap way to make many different monsters: a node graph per room, a monster walking nodes, and a few special cases with real vision.
- Hiding: lockers, vents and beds; a cleithrophobia timer forces you out, starting at about 27 seconds and falling to 10 seconds in late rooms, with a pulsing screen and an accelerating heartbeat as warning; a few monsters have counter-tools (a flash beacon to save a teammate from a Void-Mass in a locker). [S40][S41]
- Entity tells (third-party wiki): The Angler (light flicker plus an approaching screech); Blitz (a double flicker, brief silence, then an assault with a 6 to 9 second window); Pinkie (no light tell, only sound); Froger (rebounds, so stay hidden for the full second pass, about 10 seconds away between passes); Chainsmoker (gas that forces you out of lockers); Pandemonium (chromatic aberration, 29 eyes, needs full-body cover); Wall Dweller (extra footsteps); Searchlights (a boss over rooms 60 to 80 sweeping about 70% of an arena); Endless mode adds the Harbinger (probability +1% per about 12 doors) and a 5-minute "Witching Hour" timer. [S41] The pattern is the same as DOORS: every monster has a distinct tell on a different sense (light, sound, camera effect, footsteps).
- Pressure is also a decay warning: peak about 111,000 in March 2026 and a live count of 1,000 to 15,000 on trackers that disagree (RoWatcher shows both 1,000 and 14,868 on one page) [S42]. The wiki lists 1,341 concurrent on its own page [S39]. Treat as "fell by about 90% or more after an update-driven peak"; reason unknown.

### 3. Co-op "work and hide" horror: Dandy's World, Animal Hospital, Road-Side Shawarma

Dandy's World (BlushCrunch Studio, Qwelver as designer and artist):
- Timeline (first-party spotlight, 2025-05-05): character conceived in 2022; a small earlier project (Flavor Frenzy) first; alpha launch June 2024; a Christmas 2024 event floor; Easter 2025 event with 875K peak, against a stated goal of reaching 1,000 players; at that time 33 Toons, 33 Twisteds and 19 floors; one launch video passed 1M views; the team playtests everything internally; "no rewards for hurting or sabotaging other people". [S25] Bloxodes in October 2026 counts 42 Toons, 42 Twisteds, 58 trinkets, 26 items, three currencies (Ichor, Research, Tapes) and "15 floors" [S24]; the floor count differs by definition (derived: Toons grew from 33 to 42 in about 17 months, roughly one new Toon every two months).
- The loop in three words is work, hide, run. Teams finish extraction machines; each machine interaction is a timed skill check (a needle must land on a target); a failed check alerts nearby Twisteds, and one guide says it alerts every Twisted on the floor. [S24][S27][S28]
- Numbers (Fandom and Miraheze, search summaries; guide numbers): 2 to 20 machines per floor and 25 on the special Dyle's Floor; up to 8 Twisteds (6 in solo runs); odd floors host an elevator-card sequence and even floors host Dandy's shop; machine variants appear by floor (circle skill check from floor 1, two-player machines from floor 2, treadmill machines from floor 5); 0 to 5 Ichor per machine depending on contribution; main characters have 2 hearts and standard Toons 3. [S28][S29][S27]
- A tension-governor worth copying: a "Greed Meter" triggers a hostile Twisted Dandy if you hoard more than 50 Tapes, and it also triggers after three consecutive shop skips (guide, 2026-09-14). Room effects: a library damps sound by 20%, a cafeteria gives 10% stamina regeneration. [S27]
- Stats (third-party): 30 players per public server, 7.5B visits, 90+ million unique visitors reported in a 2025-26 press release, Scholastic books planned for spring and fall 2027. [S24][S26] Franchise extension (books) is a late stage for a mascot cast.

Animal Hospital (Animal Anomaly; created 2026-05-10):
- Loop (third-party guides): you and up to three others work a night shift in a hospital for animal patients. Arrivals check in at reception; you decide whether each animal is real or an anomaly in disguise using the window, camera and photo tools; real patients go to rooms (8 rooms: 5 medical beds and 3 emergency skill rooms) and emergencies are timed events; a sanity meter must be kept above 0% (coffee); three patient deaths fail the shift; shifts 1 to 5 teach, shift 6 onward is endless. [S50][S51][S54] 22 anomaly types, 10 classes, 26 items, 9 enemy types, 11 diagnosis types, 30 players per public server. [S50]
- Spread: 57,000 CCU in its first month, 736,948 on 2026-07-05, 1,273,105 on 2026-07-10 after the "Harlow's Favorite" update, 2.38B visits in about 4 months, content label Minimal (light blood, mild violence, occasional jump scares), 95% rating. [S51][S52][S53] StudioKrew credits the sanity meter (a Phasmophobia idea) and the "your friends need you to be a different class" asymmetry [S14].
- A specific live-ops update (GosuGamers): a new character who starts a journalist quest at shift 11 (photograph specific anomalous patients), a Scanner item costing $150 in-game cash with a 120-second cooldown that shows green (normal), red (anomaly) or yellow (no patient), and a Deployable Camera at $600. [S52] That is a pattern: every update adds a new character, a quest chain, new items and a new anomaly or two.
- Why it is novel: it fuses a job-sim loop with a detection puzzle and fear of a wrong decision, not of a chase. Roblox's 2026 DevEx incentive for "novel" games (note 03 [S27]) fits this kind of hybrid.

Road-Side Shawarma (nv1sh, created 2025-10-01): you run a food stall at night, prepare orders from the kitchen and survive occasional supernatural events until the last day; 76,748 peak, 13.45 minutes average playtime. [S55] It is a job-sim plus rules-based anomalies, built by one developer.

Deadly Delivery (created 2025-10-15; search summary): a Lethal Company-like job horror (carry packages into dark procedural mines to meet a quota before day three ends; doppelganger monsters that mimic teammates; proximity voice chat); 36,274 peak on 2025-12-13, about 2,000 later. [S98] A clone-class game with a tweak peaked at about 3% of the originators' numbers.

### 4. Asymmetric and chase horror: Forsaken, Piggy, Evade

- Forsaken (Forsaken Dev Team; created 2024-07-28, launched 2024-12-25 per one guide): 7 killers and 12 survivors in the live roster (13 plus 13 counting dev-only characters), 805 skins, 97 emotes, 38 status effects, 12 items, Player Points as the free currency (100 to 500 per match per one guide), 76 milestone rewards. [S32][S35][S34] Round numbers differ by source: one site says a match is 1 killer vs 4 survivors, the round clock starts at 4:00, finishing a generator removes 12 seconds (3 seconds per puzzle layer, 60 seconds for all five) and each kill adds time [S34]; the same family of pages also says matches last 8 to 15 minutes [S31]; a news article calls it 1v8 [S56]. I do not know what the clock does at zero (unverified). Use only the shapes.
- Chase numbers (ForsakenHub, 2026-09-09; third-party): survivors walk 12 and sprint 26 studs/s with 100 stamina (drain 10/s, regen 20/s, so a full sprint is 10 s and full recovery is 5 s); killers walk 7.5 to 9 and sprint 27 to 28 with 110 stamina (drain 9.5/s, so about 11.6 s); after reaching zero stamina you cannot sprint for about 2 seconds; every killer deals 28 base damage; examples of cooldowns: Noob Speed I lasts 10 s with a 50 s cooldown, Elliot's Rush Hour 30 s, Shedletsky's slash 40 s. [S33][S31] Derived from them: a full sprint covers about 260 studs for a survivor and about 319 studs for a killer at 27.5, and the sprint speed gap is only 1 to 2 studs/s, so chases are decided by stamina, corners and abilities, not raw speed. Terror radius ranges from 30 to 120 studs by killer (Guest 666 is 80), a fourfold difference in how early a survivor hears the killer. [S35]
- Forsaken updates: a v4.0.0 update on 2025-03-18 added a survivor unlocked by a four-part quest chain instead of Player Points, a documents system with backstories and balance changes to eight killers [S36]. Then it lost 54.7% of players in a week in July [S37]. Content velocity matters, and so do botched updates.
- Piggy (MiniToon; Roblox creation 2020-01-23 per Bloxodes): 24 chapters across Book 1 and Book 2, 230 skins, 26 traps for the infected, 14 survivor abilities (max 3 per round), 24 journal pages, an energy system for traps and abilities, Piggy Tokens (bundles from 40 Robux for 50 tokens to 3,915 Robux for 5,000, a 300 Robux x2 tokens pass and a 150 Robux x2 "Piggy chance" pass per a search summary), blueprints, seasons ("Season 9 - Fright Night" runs to 2026-11-01). [S43][S97] Peak 533,409 on 2020-05-24; the Fandom summary says it briefly passed Adopt Me at about 510K after Book 1 Chapter 12 [S44][S45]. Developer MiniToon praised Roblox's pathfinding tools for cutting AI effort and credited FNAF-style chase simplicity, discoverable secrets, chapter updates and round-based replay (Game Developer, 2022-11-22; stale but principle-level) [S46].
- Evade (Hexagon Development Community; created 2022-08-04): survive roaming "nextbots" (Garry's Mod style) with parkour movement, 2 to 4 per round from a roster of 253 (search summary), players can revive teammates; peak 197,261 on 2022-08-28, 9.26B visits. [S63][S102] Its creators said they had not set out to make horror. A nextbot is a cheap monster: one model, a sound and a chase AI.

### 5. Episodic story horror: The Mimic, Piggy, Break In, Short Creepy Stories

- The Mimic (CTStudio): 1.26B visits but peak only 65,363 (2024-01-14, the day after Book 2 Chapter 3 shipped on 2024-01-13), average playtime 14.84 minutes. [S47][S49] Chapter dates (search summary of a Fandom page): Book 1 Chapter 4 on 2021-08-14; Book 2 Chapter 1 2022-03-26, Chapter 2 2023-05-19, Chapter 3 2024-01-13, Chapter 4 2025-05-30; Book 3 Chapter 1 2026-06-21. [S49] Derived gaps: 14 months, 8 months, 16.5 months, then 13 months to Book 3. A story game releases every 8 to 16 months and each release is a spike, not a plateau; the Book 1 and Book 2 "completed" status in a 2024-10-16 guide shows the audience waits. [S48]
- Break In (Story) (Cracky4, created 2019-09): a story-adventure series with 3.02B visits and a peak of only 13,000 (December 2024); Break In 2 (2023-06) has 1B visits; Break In 3 (2026-04) is the same creator. [S64] The same Cracky4 led 99 Nights' design, which says the creator moved from slow story games (the spotlight says earlier projects took about six months each) to a short-cycle, high-replay survival game and got 1,000x the peak. [S1][S64]
- Short Creepy Stories (Kharbor_ykt; Roblox creator spotlight, 2024-10-31): an anthology of small stories rather than one long game; story boards upfront; difficulty varies by story from linear tasks to riddles with multiple endings; lighting balance (too dark irritates and too bright loses fear); layered sound that builds; mobile testing on Android and iPhone; sound from copyright-free libraries. [S66]
- A cinematic horror devlog (devforum, October 2023): about 20 minutes per level, minimal UI, a custom trigger module, camera effects and a cutscene system, first person; the scripter said UI state management was the hardest scripting job. [S67] Stale (2023) and small-team, but a usable baseline for chapter length.
- What the data says: story horror gets the long tail of YouTube lore content (Piggy, The Mimic) but is the weakest of the formats at holding concurrent players between drops. Piggy beat the others by mixing story chapters with an always-on round-based infected mode and cosmetic grind. [S43][S46]

### 6. Survival camps and moving bases: 99 Nights in the Forest and Dead Rails

99 Nights in the Forest (Grandma's Favourite Games; created 2025-03-04; released June 2025):
- Roblox creator spotlight (2025-10-31, first-party): started March 2025, released June 2025, three months of development; inspired by the "survive X days" trend, Dead Rails and a cosy forest look; the antagonist is a two-legged deer chosen to be scary without alienating younger players; "99" chosen over "100" for cadence; weekly 45-minute "update parties" on Saturdays; logic pushed to the client for responsiveness (the client fires the bullet and drops the health bar, the server verifies afterwards); keep scope small, playtest continuously, pivot fast. [S1] StudioKrew adds Saturday 10 AM Pacific and limited-time biomes with throwaway economies [S14].
- Counts (Bloxodes 2026-10-04, third-party): 43 classes, 49 crafting recipes, 59 materials, 33 weapons, 32 tools, 47 food items, 13 tameable animals, 46 entities, 68 locations, 16 armour pieces, 19 chest types, 8 blessings, 9 fire offerings, 9 seeds; 22 to 25 players per server (25 max); average playtime 16.18 minutes. [S2][S13]
- The clock. The Miraheze wiki says each day lasts 3 minutes and each night 1 minute 30 seconds (cycle 4.5 minutes) and that at 1x speed night 99 takes about 7 hours 25 minutes [S5]. Derived check: 99 x 4.5 = 445.5 minutes = 7 h 25.5 min, so the two numbers agree. Another page (Playgama) claims 6 to 8 minute nights and 10 to 13 minute cycles, which does not reconcile with 7 h 25 m and I discard it [S6].
- The speed-up that makes the game playable: beds from the crafting bench and rescuing all four children raise the "days per night" multiplier up to 9x. Derived: at 9x, 99 days need 11 night cycles, about 49.5 minutes, matching the guide claim of 50 to 60 minutes for an optimised run. A Time Accelerator at bench level 5 can skip a night for one Cultist Gem. [S5][S9][S10] This means a full "survive 99 nights" game fits inside one session for good players, which matches the 16-minute average and Roblox's play-through measure.
- Safe zone and fuel. The campfire is a constantly depleting fire that keeps the Deer away at night; fuel (logs, coal, fuel canisters, biofuel, oil barrels) levels it from 1 to 6, higher levels open more of the map and resist weather (rain, snow and blizzards raise burnout). One wiki lists upgrade needs of 6 logs (to level 2), 11 logs plus 7 coal plus 2 canisters, 50 to 75 logs plus 23 coal plus 9 to 12 canisters, and 275 to 350 logs plus 170 coal plus 35 canisters plus 8 barrels for level 5 [S3]; a different guide says a basic fire needs 10 wood, 5 stone and 1 cloth with a 30 m light radius, 20 m safety radius and 15 m warmth radius, which conflicts in kind and I mark low reliability [S4]. The Deer does not attack on night 1. [S5]
- Crafting bench. Levels 1 to 5 cost: 5 Wood plus 1 Scrap; then 15 Wood plus 10 to 15 Scrap (sources differ); then 30 Wood plus 20 Scrap plus 2 Cultist Gems; then 50 Wood plus 50 Scrap plus 1 Gem of the Forest. Recipes unlock 3, 9, 7, 4 and 3 per level (26 total, derived). Level 1: Map, Old Bed, Bunny Trap. Level 2: Sun Dial, Bed, Compass, Freezer, Farm Plot, Shelf, Log Wall, Bear Trap. Level 3: Crock Pot, Radar, Boost Pad, Biofuel, Torch, Good Bed, Lightning Rod. Level 4: Ammo Crate, Oil Drill, Giant Bed, Teleporter. Level 5: Respawn Capsule, Time Accelerator, Weather Machine. [S9] A Crock Pot costs 15 Wood and 10 Scrap. [S9]
- Threats (Pocket Tactics, updated 2026-04-24): the Deer (immortal, night only, 25-plus damage rising with day count and hunger), the Owl (snow biome, a stay-still stealth minigame), the Ram (volcanic biome, charging), the Bat (caves, blind), the Cat (jungle, pounce zones shown as red circles), wolves (75 HP, 20 damage, 23 speed), alpha wolves (125, 25, 26, campfire level 3 to 5), bears (300, 40, 28), polar bears (500, 50), arctic fox packs of 2 to 5, scorpions, Hellephants, meteor crabs, aliens from night 2, and cultist raids every 4 nights. [S7] Bloxodes lists the same family and gates by campfire level and biome [S8]. The design rule is that bigger fires attract bigger animals, so base progress raises threat.
- Rescue objectives: four missing children, each in a gated cave guarded by 2 to 6 enemies (5 red-collar wolves, 5 alpha wolves, 2 bears, 6 bears) and opened by a coloured key. [S7]
- Meta: classes cost diamonds (Camper 10, Scavenger 25, five classes at 40, Fisherman 50, Lumberjack and Ranger 70, Farmer 80, Brawler and Berserker and Alien 100, Blacksmith 200, Assassin 500, Pyromanic and Cyborg 600); diamonds can be farmed free (2 at night 50, 3 at night 99, a 5-diamond chest at the Cultist Stronghold) or bought (20 for 99 Robux, 100 for 400, 250 for 900, 700 for 2,500). [S10] The Cultist Stronghold is a 3-floor dungeon added 2025-07-04, difficulty 1 to 4, recommended for 3 to 4 players, resets about every 20 minutes and gets harder after each clear. [S11] (search summaries; prices drift.)
- Reach and risk: 99 Nights spread through a "survive X days" trend and cheap co-op; a Disney and 20th Century Studios film was announced (Wikipedia) [S16]. The first-party peak (14M) is a spike; by October 2026 it holds about 263K [S2], which is still the biggest horror-survival game on the platform.

Dead Rails (RCM Games; created 2025-01):
- Loop: up to 4 players ride a steam train across a zombie-infested 1899 desert; fuel is the clock; loot stops at night; distance is progress; the end is at 80,000 m (about 80 km), eight fortified checkpoints and a final fort with a bridge that takes a four-minute countdown after one player lowers it (search summary) [S61]. 29 classes bought with Bonds, 13 trains, 50 weapons, 88 items, 39 entities, 48 locations, 16 players per public server. [S57] Revive 45 Robux; average session 18 minutes (a March 2025 article, so early). [S58]
- Why it exploded (GameAnalytics, 2025): Roblox's own TikTok promotion in late February 2025 (499K likes), YouTubers (one video 2M views), and the "most advanced yet acceptable" idea of a familiar survival loop (Build a Boat for Treasure) in a new setting; front-page placement fed the algorithm. [S59] Peak 1,476,198; average playtime 16.77 minutes. [S60]
- Technical note: long "infinite" roads on Roblox are done by recycling pre-built road segments (a teleport back to a parallel start) because the engine misbehaves far from the origin; a community estimate is about 1 million studs (devforum thread, 2025-08-15; unofficial). [S62]

### 7. Design theory that explains the hits (non-Roblox, dated)

- Start from the emotion, not "fun" (Thomas Grip, Frictional Games, via Game Developer, 2014-05-08): horror asks "how can I make this scarier"; playtest yourself late at night; let players scare themselves with suggestion; keep every element on the horror concept. [S91]
- Two-layer AI (Alien: Isolation, Game Developer, undated, about 2015): a macro "director" always knows where the player is and only points the monster in a rough direction; a micro AI (a behaviour tree of 100-plus nodes, about 30 at the top) senses footsteps, sound and sight; a "menace gauge" from proximity and line of sight tells the director when the player has had too much and sends the alien away; it practically never teleports (twice in a 12-18 hour campaign). [S89] The L4D Director (Game Developer, 2013-02-07) models a stress level per player and adjusts spawns and items by it, "limping to the next safe room" being the ideal. [S90] Both turn "random scares" into paced scares.
- Tension and scare craft (Jared Mitchell, Game Developer, 2015-10-14): tension is loss of resources against a goal; place scares at peak cognitive load; use at most one or two scares per mechanic; introduce a threat with a scare and teach its behaviour with non-chase encounters before the chase; avoid dead-ends in linear chases. [S92] A search summary of horror-psychology pages reports the startle response habituates within two to three repeats, so by the fourth jump scare players stop reacting (low-quality aggregate; use as a rule of thumb) [S100].
- Roblox-specific horror advice (devforum, 2022-2024): sound over jump scares, limited visibility, fairness, fake-outs, playtest with unfamiliar users (note 03 [S42][S43][S44]); lighting is a balance, too dark irritates [S66]; a new mechanic or story is needed to stand out because players have seen many horror games (devforum feedback thread summary, 2025) [S103].
- Survival design comparators, to set the day length and needs: Don't Starve defaults to an 8-minute day (16 segments of 30 s: 4 min day, 1.5 min dusk, 2.5 min night; sanity drains 5 per minute at dusk and 50 per minute in total darkness) [S93]; Valheim a 30-minute day (21 min day, 9 min night) [S94]; the 99 Nights day is 4.5 minutes with a one-third night [S5]; The Long Dark caps hunger at 2,500 calories (search summary) [S96]. In Valheim, food gives a temporary health and stamina buff instead of a permanent increase, and each boss unlocks a tier of ore and tools (Jeff Vogel, 2021-06-08, stale but a clean model for gating) [S95].

### 8. Roblox technology and policy facts that matter for this genre (first-party)

- Pathfinding (Roblox docs): `PathfindingService:CreatePath()` with AgentRadius default 2, AgentHeight default 5, AgentCanJump default true, AgentCanClimb default false, WaypointSpacing default 4; `Path:ComputeAsync` has a 3,000-stud direct-distance cap and a 20,000-node budget; connect `Path.Blocked` and recompute only if the blocked waypoint index is at or ahead of the next waypoint; costs default to 1 per material, `math.huge` makes a region impassable; `PathfindingModifier` and `PathfindingLink` are the supported ways to steer. `FindPathAsync` is deprecated. [S72][S73]
- `Humanoid:MoveTo` times out after 8 seconds unless called again; `MoveToFinished` fires on arrival or timeout. [S83] WalkSpeed default 16, JumpPower 50, JumpHeight 7.2. [S83]
- NPC physics ownership: parts near a player can be handed to that player's client; call `SetNetworkOwner(nil)` on the monster's root part from the server so a client cannot move it and it stops hopping between owners (a 2022 devforum answer said the stutter came from ownership constantly going to the nearest player) at the cost of some jitter for clients far away; anchored parts are always server-owned. [S82][S70]
- A 2024 devforum thread on a jittery horror AI (August 8, 2024): re-pathing every frame causes jitter and lag; the posters suggest recomputing only on reaching a waypoint and switching to direct movement when close, or using a behaviour-tree plugin. [S68] A 2025 thread recommends raycast detection plus `ComputeSmoothPathAsync`-style following and learning the basics first. [S69]
- Lighting (creator docs): `Lighting.LightingStyle` (Realistic or Soft) and `PrioritizeLightingQuality` now carry what `Lighting.Technology` used to; `Technology` is marked deprecated. ExposureCompensation ranges -5 to 5 (default 0), EnvironmentDiffuseScale and EnvironmentSpecularScale default to 0, Ambient defaults to (0,0,0), OutdoorAmbient to (127,127,127), ShadowSoftness 0.2 and works only with the Realistic style. `ClockTime` and `TimeOfDay` do not change unless a script changes them; `SetMinutesAfterMidnight` accepts values over 24 hours. [S77][S78] Atmosphere has Density, Offset, Color, Decay, Glare and Haze; Glare needs Haze above 0 to show, and the docs' own examples use Density 0 to 0.35, Haze 1 to 2.8, Offset 0 to 1. [S79] One 2026-06-24 tutorial (third-party, not Roblox) uses Brightness 0.3, Ambient (10,10,14), OutdoorAmbient (8,8,12), ClockTime 0, FogEnd 60, Atmosphere Density 0.55, Haze 2 and ColorCorrection Saturation -0.35 for a near-black look, a monster speed of 12, AgentRadius 3, AgentHeight 6, a re-path about every 1 second and a 0.6 second jump scare. [S71] Use these as one author's starting point, not as standards.
- Audio (creator docs): the new Audio API is producers (`AudioPlayer`, `AudioTextToSpeech`), consumers (`AudioEmitter`, `AudioListener`, `AudioDeviceOutput`), modifiers (`AudioReverb`, `AudioEcho`, `AudioDistortion`, `AudioPitchShifter`, `AudioEqualizer`, `AudioCompressor`, `AudioFader`) joined with `Wire`; 3D sound needs an emitter and a listener; `AudioEmitter.DistanceAttenuation` shapes volume over distance. `SoundService.AmbientReverb` applies a preset to legacy `Sound` objects only, not to the new Audio objects. [S80][S81]
- `ProximityPrompt`: HoldDuration, MaxActivationDistance, RequiresLineOfSight, Exclusivity, Enabled, ClickablePrompt, ActionText; events `Triggered`, `TriggerEnded`, `PromptShown`. [S85] `Model.ModelStreamingMode` controls how a model streams when instance streaming is on; change it only from Studio or a Script. `Model:PivotTo` replaces `SetPrimaryPartCFrame`. [S84]
- Procedural rooms (devforum 2024-2025): a Doors-like generator uses an Entrance and Exit anchor per room, aligns the new room's pivot to the previous Exit, keeps three or four rooms ahead and deletes old ones, bans a third consecutive turn in one direction to avoid overlap, treats rooms like a maze or wave-function-collapse graph, forces a special room when the room counter reaches a number (for example 50), and keeps biome settings in ModuleScripts with weighted room pools; one poster used room sizes in multiples of 8 for grid alignment. [S86]
- Server-authoritative needs: keep hunger and thirst on the server, expose them as Attributes the client reads, and let the client only request actions such as "eat" (devforum, 2024-04-03). [S87] Day-night scripts on the forum range from a loop adding to `ClockTime` to `SetMinutesAfterMidnight` and tweened shadows. [S88]
- Content maturity (first-party, 2026): four labels, Minimal, Mild, Moderate, Restricted. Mild fear is "repeated scary elements": loud or heavy breathing, a pounding heart, shrieking, creepy-looking NPCs, jump scares, ominous music. Moderate fear is "horrifying elements": disfigured mouths, visible connective tissue or organs, realistic open wounds, bleeding eyes with realistic blood. Restricted is intense horror beyond that and 18-plus and age-verified only. [S74][S75] The questionnaire must be answered for the most extreme thing a player can see; false answers risk moderation. [S74] The 2026 age-based accounts (rolled out from May 2026 in four countries, global early June 2026) mean Roblox Kids (ages 5 to 8) see only Minimal and Mild experiences and Roblox Select (9 to 15) see up to Moderate. [S76] Animal Hospital is Minimal with jump scares [S51]. Practical meaning: a jump-scare horror game that avoids gore and disfigurement can stay Mild and reach the youngest accounts.
- Flashing effects: search summaries show Roblox developers adding photosensitivity warnings (Forsaken's page itself warns of flashing lights and loud audio) and general accessibility guidance warns against flashes at 2 to 59 per second. [S38][S101]

### 9. What separates the hits from the clones (analysis, mostly derived)

- Every 2024-2026 horror or survival hit has a procedural or high-variance run (rooms, floors, nights, shifts, rails) and a visible counter (room number, floor, night 99, shift number, kilometres). The story-first games (The Mimic, Break In) have long visit totals and small concurrent peaks. [S18][S24][S2][S50][S60][S47][S64]
- The hits use readable monsters: tells on at least two senses, a counter the player can learn, and a rule that lets them survive when they play correctly (DOORS' Rush-only-with-hiding-spots, Pressure's node paths, Dandy's skill-check consequences). [S21][S40][S29]
- The newest hits are hybrids of a work loop and a threat: shift work (Animal Hospital), food stall (Road-Side Shawarma), delivery quota (Deadly Delivery), machines (Dandy's World), camp upkeep (99 Nights). The work loop gives the 12 to 19 minute session; the threat gives the story. [S50][S55][S98][S24][S1]
- Clones decay faster: Deadly Delivery peaked at about 36K (about 3% of 99 Nights' peak and about 3% of Animal Hospital's); Pressure fell about 90% after an update-driven peak. The platform's DevEx incentive for novel games reinforces that a clone is a weak bet (note 03 [S27]).
- Cosmetic and convenience monetisation dominates: classes for a soft currency that can also be bought (99 Nights), revives (DOORS; Dead Rails at 45 Robux), skins and token packs (Piggy), currency packs (DOORS) and a few pass perks. [S10][S23][S58][S97] No source reports a paid survival-critical advantage in a top title.
- Content cadence beats launch size: weekly update parties (99 Nights), a new character plus quest chain per update (Animal Hospital, Forsaken), seasonal events (Piggy season 9; DOORS Halloween to 2026-10-31; 99 Nights Halloween 2026-10-17 to 24). [S1][S52][S36][S43][S19][S2]

## How to apply it (rules for an AI builder)

### Pick the format first
- DO choose one of these loops and name its counter in one sentence before building: (1) run horror, counter = room number; (2) work-and-hide, counter = floor or shift number; (3) asymmetric match, counter = generators done; (4) survival camp, counter = night number; (5) moving base, counter = kilometres. DON'T start with an open-ended story; chapters are a layer on top of a replayable run, not the product. [S18][S24][S2][S60]
- DO target a 12 to 19 minute session as the unit (a run, a floor sequence, a shift, or a compressed 99 nights with multipliers). The best games average that. [S13][S30][S60]
- DO target label Mild (or Minimal) deliberately: jump scares, creepy-looking creatures and ominous music are Mild; avoid disfigured mouths, visible organs, realistic wounds and bleeding eyes with realistic blood, which push to Moderate. Answer the questionnaire for the worst case a player can see. [S74][S75]
- DON'T clone a 2025-26 hit one for one. Add one novel verb (Animal Hospital's detection, Road-Side Shawarma's rule-following). [S50][S55]

### Threats (monsters)
- DO give every threat a tell on a different sense and a counter the player can learn: light flicker, a sound, a camera effect (chromatic aberration), a text prompt, footsteps. Introduce each threat once with a safe or low-damage first encounter, then escalate. [S20][S41][S92]
- DO ensure the player can always survive with correct play: only spawn a hide-counter threat in a room with at least one hide spot; give a telegraph long enough to reach it (telegraph seconds >= distance to hide spot / WalkSpeed + 1 s margin, derived; Blitz-style fast threats use a 6 to 9 s window per the Pressure wiki). [S21][S41]
- DO use node-based movement for most monsters and real line-of-sight only for one or two special threats, as Pressure does; it is cheaper and gives learnable routes. [S40]
- DO split monster control into a director (pacing, hints) and a monster (perception only), with a menace value that pulls the monster away after sustained pressure. [S89]
- DO limit scares: at most one or two jump scares per mechanic; vary the other tension tools (time pressure, limited resources, sound). [S92][S100]
- DON'T teleport monsters to the player; don't give the monster perfect knowledge. [S89]
- DON'T re-compute a path every frame; re-path every 0.5 to 1 s while chasing, with Blocked handling; set the monster's network owner to the server. [S68][S71][S73][S82]
- DON'T kill with an invisible touch trigger the player cannot see coming. [03 [S44]]

### Light, sound and visibility
- DO use Lighting.LightingStyle = Realistic, a low Ambient and OutdoorAmbient, an Atmosphere with Haze between 1 and 2.8 and Density 0.2 to 0.55, and a flashlight (SpotLight) as the player's pool of light; keep the baseline readable on a phone screen: test at low brightness; if the player cannot find the next door you are not scaring them, you are irritating them. [S66][S77][S79]
- DO build sound in two layers: a quiet looping ambience and sparse event stings; use 3D `AudioEmitter` positions for tells so players can locate the threat; add `AudioReverb` per room type; use silence before a scare. [S71][S80][S15]
- DO keep every monster tell audible on mobile speakers (a low rumble alone is not enough; add a mid-frequency sting) and add a visual subtitle option for tells. (heuristic)
- DO warn for flashing and loud audio on the game page and keep strobing off by default and below 2 flashes per second (heuristic, conservative). [S38][S101]
- DON'T rely on `SoundService.AmbientReverb` for new Audio API sounds; it only affects `Sound` objects. [S81]

### Run structure and economy
- DO build a lobby with a pre-run shop for consumables (DOORS Knobs, Dandy's Tapes), a party and 4 to 6 player runs for co-op (Dandy's World has 30-player servers but teams of 4; Dead Rails 4 per run on 16-player servers; 99 Nights 4 per camp on 22 to 25-player servers). [S19][S24][S57][S2]
- DO make a persistent soft currency earnable free and buyable: classes or characters bought with it (99 Nights diamonds, Dandy's Ichor, Dead Rails Bonds). Price classes from 10 to 600 diamonds in a ladder; give 2 to 5 currency for a 50 or 99 night milestone and 5 for a dungeon chest, so a few runs buy the cheapest class. [S10][S11][S57]
- DO sell revives (about 45 Robux in Dead Rails), currency packs, cosmetics and convenience; avoid selling survival-critical power in the first runs. Show odds if you sell random items and apply PolicyService (note 03). [S58][S23]
- DO use a tension governor for hoarding (Dandy's Greed Meter after 50 unspent Tapes or three shop skips). [S27]
- DO ship a death and spectate flow that keeps dead players useful (spectate, revive by teammate, ghost tasks), so a death does not become a quit.
- DON'T make the first run longer than the average session; give the first death a hint (a guiding light, a text hint naming the threat) as DOORS does. [S20]

### Chapters and story
- DO plan a chapter as 15 to 25 minutes (a devlog uses about 20), a save point per chapter in a DataStore, and optional replays with modifiers, skins or alternate endings. Plan one chapter every 1 to 3 months; The Mimic's real gaps (8 to 16.5 months) are too slow to hold CCU. [S67][S49]
- DO tell story through collectibles (Piggy has 24 journal pages), NPC notes and environment, not long forced dialogue; keep UI minimal in chases. [S43][S67]
- DON'T make chapters depend on a 3D cutscene that blocks input for more than about 30 seconds; give a skip. (heuristic)

### Survival camps
- DO choose a day length from the comparators: 4.5 minutes (99 Nights: 3 min day, 1.5 min night, a 33% night) for a one-session run; 8 minutes (Don't Starve) or 30 minutes (Valheim) only for persistent worlds. For a "survive N days" game, add a multiplier (beds, rescued helpers) so a skilled team can finish in about 50 minutes (derived from 99 days / 9 x 4.5 min = 49.5 min). [S5][S93][S94]
- DO make the base itself the safety mechanic and the failure clock: a fire with fuel that drains, levels that expand the safe map, and weather that raises burn rate; bigger fires attract bigger enemies so progress raises danger. [S3][S7]
- DO give a first-night grace (the Deer does not attack on night 1) and first-day goals (3 to 10 wood to start crafting). [S5][S9]
- DO gate tools and recipes by a bench level whose upgrade needs a rare drop from a dangerous place (2 Cultist Gems at level 4; 1 Forest Gem at level 5) so exploration is required, as Valheim gates tiers by bosses. [S9][S95]
- DO model needs on the server with Attributes and a drain table; show clear states (Full, Hungry, Starving); tie penalties to rates, not instant death. [S87][S96]
- DO put repeatable high-reward dungeons on a real-time timer (about 20 minutes) with escalating difficulty. [S11]
- DON'T use a world larger than about 1 million studs from the origin; recycle the track instead. [S62]
- DON'T let hunger be a pure tax; Valheim-style temporary buffs from food make eating a choice. [S95]

### Systems checklist (what a complete game ships with)
- Run horror: lobby and party, pre-run shop, run generator, entity set (at least 8 distinct), hide spots, item set (light, protection, speed, revive), currency and codes, revive and spectate, results screen with rewards, badges, modifiers, settings (audio, FOV, motion, subtitles), maturity label, weekly content plan. [S19][S20][S21]
- Work-and-hide co-op: character or class set with stats, machines or tasks with a skill check, a failure consequence that alerts enemies, a shop between floors, a greed or hoarding governor, a persistent currency, trinkets or loadouts, events. [S24][S27][S28]
- Asymmetric match: role queue, map vote, objective set, stamina model, killer ability cooldowns, terror radius audio, cosmetics, ranked or points progression, balance patches. [S33][S35]
- Survival camp: clock, needs, inventory, bench tiers and recipes, base fire or station, day and night enemy tables with biome and level gates, rescue or goal objectives, classes, dungeons, events, persistence, small co-op servers. [S2][S7][S9]
- Moving base: fuel clock, distance counter, stops and forts, loot gates by night, classes bought with a run currency, revives. [S57][S61]

## Recipes (each becomes a skill)

### Recipe 1: Doors-style room chain
When to use: run horror with a numbered room counter (DOORS, Pressure, The Inn).
Steps:
1. ServerStorage > RoomPool: one Model per room, each with two anchored, CanCollide=false, Transparency=1 Parts named `Entrance` and `Exit` that both face the direction of travel; set `room.PrimaryPart = Entrance`. Add Attributes `MinRoom`, `MaxRoom`, `Weight`, `HideSpots` (count) and a tag. Use a grid of 8 studs for room dimensions (one poster's convention). [S86]
2. Workspace > Track (Folder). Keep a list of generated rooms. Generate the first 3 or 4 rooms at start; when the door of room N opens, generate room N+3; delete room N-2 only after every living player has index >= N (the shared track is server-wide). [S86]
3. Place a new room by `room:PivotTo(prevExit.CFrame)` (Entrance is the pivot). Check overlap with `Workspace:GetPartBoundsInBox(cf, size - Vector3.new(1,1,1), overlapParams)` excluding the candidate itself; if it hits, discard and re-roll up to 5 times. Ban a third consecutive turn in the same direction. [S86]
4. Special rooms: before rolling, if `#rooms + 1` equals a milestone (50 library, 100 finale, shop every 20 to 30, heuristic) force the room. DOORS puts Figure at 50 and 100. [S86][S21]
5. Use a seeded `Random.new(seed)` per run so a failed run can be replayed in testing.
6. Per room attributes decide which entities may spawn (needs `HideSpots >= 1` for hide-counter entities). [S21]
7. Streaming: set `ModelStreamingMode` to Persistent for rooms where scripts run on the client, or keep entity logic on the server. [S84]
Pitfalls: overlap false positives from touching walls (shrink the box); stray lights left in deleted rooms (destroy the whole model); generating more than 4 rooms ahead hurts memory; seams where `Exit` and `Entrance` have different facing.

### Recipe 2: Telegraphed corridor entity (Rush, Ambush, Blitz, Froger)
When to use: a threat that sweeps through rooms and is beaten by hiding.
Steps:
1. Define per entity: tell time, number of passes, speed, hide rule, damage. Example Rush-like: 3.5 s of rapid light flicker plus a rising rumble, one pass at 60 studs/s, kills anything not hidden. Example Ambush-like: tell 4 s, 2 to 4 passes with a 3 to 5 s gap, hiders must wait for the final pass. Froger-like (Pressure): sweep, leave for about 10 s, return. Blitz-like: double flicker, silence, then a fast pass in a 6 to 9 s window. [S20][S41] (speeds and gaps other than the 6 to 9 s and 10 s windows are my heuristics.)
2. Telegraph: flicker the PointLights in rooms ahead via a server tween plus a client sound on a `Sound`/`AudioPlayer` with `Looping`. Choose tell length from `distanceToNearestHide / 16 + 1` seconds (derived from WalkSpeed 16). [S83]
3. Move a model along a CFrame path (anchored model, tween or Heartbeat lerp). Each Heartbeat, for every player, if their character attribute `Hidden` is not true and they are within 8 studs of the entity (use `GetPartBoundsInRadius`), kill them and fire a death hint event naming the entity.
4. Only schedule it if the current and next rooms have `HideSpots >= 1`, never within 15 s of another sweep entity (heuristic).
5. After a pass, break lights in the corridor (a visual proof of danger).
Pitfalls: killing hidden players because of an overlapping hitbox (use the Hidden attribute, not position); an entity that is faster than the tell lets a mobile player react.

### Recipe 3: Perception-based stalker (node paths plus a director)
When to use: one persistent monster per floor (Pressure's node monsters, Alien-style).
Steps:
1. Build a node graph per room: Parts tagged `Node` with Attributes of neighbours; the monster walks node to node (Pressure's approach); for special threats use real vision. [S40]
2. States: Patrol (visit nodes), Investigate (go to a noise or last-seen point for 6 to 10 s), Chase (path to player every 0.5 to 1 s), Search (walk 3 to 5 nearby nodes, then give up). [S71][S89]
3. Senses: sight = raycast from the monster's head to the player's head within 60 to 80 studs and a 100-degree cone (heuristic), blocked by walls; hearing = players emit noise (sprinting 40 studs, walking 12, crouching 0; heuristic) via a server-set Attribute. [S89]
4. Movement: `PathfindingService:CreatePath({AgentRadius = 3, AgentHeight = 6, AgentCanJump = false, WaypointSpacing = 4})`, compute, MoveTo the second waypoint, repeat each repath tick; handle `Blocked`; `SetNetworkOwner(nil)` on HumanoidRootPart. [S72][S73][S82]
5. Director: a `menace` number (0 to 100) rising with proximity under 40 studs, line of sight and noise, falling over time; at 80 for 10 s, send the monster to a far node for 30 to 45 s (heuristic). [S89]
6. Never teleport unless for a scripted entrance; spawn out of sight only. [S89]
Pitfalls: re-pathing every frame (jitter); the 8 s MoveTo timeout when a path step is far; the node budget on very large rooms; a 3,000-stud direct distance cap. [S68][S83][S73]

### Recipe 4: Locker and hide system
When to use: players must be able to avoid a threat by hiding (DOORS closets, Pressure lockers).
Steps:
1. Model with Parts `Inside` (anchor point) and a ProximityPrompt on the front: ActionText "Hide", HoldDuration 0 to 0.3, MaxActivationDistance 7, RequiresLineOfSight true (heuristic values). [S85]
2. On Triggered (server): check no occupant, set `Occupant`, set character Attribute `Hidden = true`, anchor HumanoidRootPart, `PivotTo(Inside.CFrame)`, fire the client to set a first-person slit view (peek by moving the camera left and right as Pressure does). [S40]
3. Max hide time: start at about 27 s and fall to 10 s by the last room (`27 - 17 * min(room / 100, 1)`, a linear interpolation I fitted to the two Pressure numbers). Start a pulsing screen and a heartbeat sound that speeds up as time runs out; at zero eject the player. [S40]
4. Cooldown of about 5 s before re-entering the same spot; a "Hide" entity or a jump scare ejects after too long (DOORS). [S21]
5. A threat that can detect hiders (a rare entity) needs a counter: a teammate with an item, a mini-game (cursor held in the centre, Pandemonium) or crouch-hiding. [S40][S41]
Pitfalls: client sets `Hidden` (exploit; set it on the server); anchoring the character while a threat kills by `Touched` on a hidden player; hide spots that block the exit; mobile players cannot peek without an on-screen control.

### Recipe 5: Dark-but-readable atmosphere, flashlight and ambient audio kit
When to use: any horror map's first setup.
Steps:
1. Lighting: LightingStyle Realistic; Ambient (10,10,14) to (25,25,32) and OutdoorAmbient to match (author starting point 8,8,12 is very dark); ExposureCompensation 0 to 0.5 so you can lift the whole scene without changing mood; ClockTime 0 for interiors; FogEnd 60 to 200; a ColorCorrectionEffect with Saturation -0.2 to -0.35; an Atmosphere with Density 0.3 to 0.55, Haze 1 to 2, Color a cold blue. [S71][S77][S79]
2. Per-room mood: use PointLights (Range 12 to 20, Brightness 0.8 to 1.5) at landmarks and a flicker script tied to tells; ColorShift_Bottom for shadowed interiors. [S77]
3. Flashlight: a SpotLight on the player's head or a held Tool, Angle 55 to 70, Range 40 to 60, Brightness 2 to 3 with Shadows true (heuristic); toggle on the client with a server attribute for replication. [S66]
4. Audio: a quiet looping ambient `AudioPlayer` (Looping true) into an `AudioDeviceOutput`; stings played from the `AudioEmitter` of the source; an `AudioReverb` between players and output for rooms; use `AudioPlayer:Play()` from scripts on events. [S80]
5. Test: at the lowest device brightness and on a phone speaker (see rule above).
Pitfalls: Future-like shadows from many lights hurt phones (cap lights per room, use fewer shadowed lights); a monster tell that depends on a low frequency; fog that hides the exit sign.

### Recipe 6: Anomaly-check shift loop (Animal Hospital, Road-Side Shawarma)
When to use: a work-and-detect horror; short sessions.
Steps:
1. Shift = a timed state machine: Intermission (30 s, buy items), Shift (8 to 12 minutes, heuristic), Results (reward and streak). Shifts 1 to 5 scripted teaching shifts, then endless with a scaling table. [S50][S51]
2. Arrivals: server picks `{kind, isAnomaly, anomalyType, tellSet}` from a table kept in ServerStorage; the client only receives the visual state. Never replicate `isAnomaly` as an Attribute; Attributes replicate to every client. [S87]
3. Anomaly types: 22 in the reference game; ship 8 for launch, each with a tell on a different tool (window, camera, polaroid, scanner). A Scanner item with a 120 s cooldown and green, red, yellow readouts is one such tool. [S50][S52]
4. Decisions: admit, reject, or call security; a wrong admit costs sanity or a patient; three patient deaths fail the shift. [S51]
5. Sanity: 0 to 100; drains while looking at anomalies or on events; restored by coffee; at 0 hallucinations then loss. [S51]
6. Anomaly probability by shift (heuristic): 20% on shift 1, rising 4 points per shift, capped at 55%; at least one genuine patient per arrival group of 3.
7. Meta: classes (10 in the reference), items, a persistent Total Shifts streak, a currency per shift. [S50][S51]
Pitfalls: client-readable anomaly flags; tells that need a high-resolution screen; a guaranteed loss for a lone player (scale arrivals by player count); no clear feedback on why a decision was wrong.

### Recipe 7: Extraction machines with skill checks (Dandy's World)
When to use: co-op work-and-hide.
Steps:
1. Floor generator: machines = clamp(2 + floor(floor/2), 2, 20) (heuristic curve; the reference range is 2 to 20); special floors 25; enemies = min(8, 1 + floor(floor/3)) (6 cap for solo). [S29]
2. Machine: progress 0 to 100%; players hold a prompt; every 1.5 to 3 s a skill check starts: the server sends `{startTime = workspace:GetServerTimeNow(), duration = 1.0, centre = random 0.25 to 0.85, width = 0.12}`; the client sweeps a needle and sends only "press"; the server computes the press position from the time it received it and accepts within the width plus a latency allowance of 0.05 (heuristic). [S28]
3. Hit: +progress (gold zone +more), miss: pause progress for 3 s and send a Twisted to the machine; the reference says a failure alerts nearby Twisteds or all of them. [S28][S27]
4. Floor flow: odd floors elevator card, even floors a shop; 0 to 5 currency per machine by contribution. [S28][S29]
5. Tension governor: hoard over 50 shop currency or skip the shop 3 times and spawn a bonus enemy. [S27]
6. Characters: 5 stats (skill check, speed, stamina, stealth, extraction) and 2 abilities; start with 3 hearts. [S24][S27]
7. Enemy behaviour: a tell per enemy (sound, light), a detection radius, an alert target position. Reuse Recipe 3.
Pitfalls: trusting the client's press time; making the skill check window so small on mobile that it is unplayable (test with 60 ms touch latency); a stat page that nobody understands.

### Recipe 8: Asymmetric generator round (Forsaken-style)
When to use: 1 killer versus a small team.
Steps:
1. State machine: Lobby > Map vote (10 s) > Spawn > Round (clock starts 4:00) > Results (reference numbers; players 1 killer vs 4 survivors). [S34][S33]
2. Movement constants: survivor walk 12, sprint 26; killer walk 8, sprint 27.5; stamina 100 and 110, drain 10 and 9.5 per second, regen 20 and 21 per second, a 0.5 s regen delay, a 2 s sprint lock at zero; apply as server-owned Attributes with client prediction. [S33]
3. Objectives: 5 generators, each a 3-layer puzzle (each layer shortens the clock by 3 s, a finished generator 12 s); the exit opens after all five. [S34] (The effect of the clock at zero is unverified.)
4. Terror radius: an `AudioPlayer` heard within a per-killer radius of 30 to 120 studs, layered at 3 distances. [S35]
5. Abilities: 2 to 4 per character with cooldowns 14 to 50 s and one 200 s ultimate; base damage 28. [S33][S35 search summary]
6. Points: 100 to 500 per match, spent on characters. [S34]
Pitfalls: calling the clock logic client-side; killers faster than survivors by more than 2 studs/s; no counterplay to a terror radius; party play ruining role balance.

### Recipe 9: Episodic chapters and story saves
When to use: story horror (The Mimic, Piggy, Break In).
Steps:
1. Each chapter is its own place or a ModuleScript level loaded into a hub place; store `HorrorProgress_v1` in a DataStore with `UpdateAsync` (take the max chapter). [S71]
2. Chapter length 15 to 25 minutes; a checkpoint every 3 to 5 minutes; death returns to the last checkpoint with a short fade. [S67]
3. Collectibles: 10 to 24 journal pages or notes to carry lore; pages unlock a chapter replay mode. [S43]
4. Cutscenes: set `CurrentCamera.CameraType = Enum.CameraType.Scriptable`, tween CFrame, keep skippable, restore Custom after. Keep UI minimal. [S67]
5. Replay hooks: modifiers, difficulty, an alternate ending, cosmetic skins, a round-based side mode (Piggy's infected rounds). [S43][S46]
6. Ship cadence: a chapter every 1 to 3 months, or a seasonal mode every 1 to 2 months between chapters. [S49][S43]
Pitfalls: story that cannot be skipped on replay; saves overwritten by older data; a chapter place that depends on teleport data from an exploited client (validate the chapter against the DataStore).

### Recipe 10: Survival camp (99 Nights style)
When to use: co-op survival with a night counter.
Steps:
1. Server owns a `CycleStart` timestamp; each client computes the phase from `workspace:GetServerTimeNow()`; day 180 s, night 90 s; map phase to `Lighting.ClockTime` (day 6 to 18 over 180 s, night 18 to 6 over 90 s). [S5][S78]
2. Day counter increments per night survived by a `dayMultiplier` (1 up to 9 with beds and rescued helpers); game ends at 99. [S5][S9]
3. Campfire: Attributes `Fuel` (seconds), `Level` (1 to 6); drain 1/s times a weather factor (1, 2 in rain, 3 in a blizzard heuristic); adding logs gives +60 s each (heuristic); safe if within radius 60 studs (heuristic) and Fuel > 0; level thresholds as in the table above. [S3]
4. Enemies by night and level: boss "watcher" appears night 1 without attacking, then attacks; wolves from night 2, alpha wolves at fire level 3 to 5, bears at 5; raid every 4 nights. Starting numbers: wolf 75 HP 20 damage speed 23; bear 300 HP 40 damage speed 28. [S5][S7]
5. Rescue objectives: 4 gated caves, each guarded by 2 to 6 enemies, opened with a coloured key; a rescued helper raises the multiplier or gives a passive buff. [S7]
6. Bench levels: build the table from the facts section; keep recipe unlocks as data in a ModuleScript. [S9]
7. Meta: diamonds for night 50 (2) and night 99 (3) and a repeatable stronghold chest (5) on a 20 minute timer; classes bought with diamonds. [S10][S11]
Pitfalls: day-length numbers copied from SEO pages (3 versus 10-13 minutes) [S6]; a fire radius so large nothing threatens the camp; a multiplier that skips so much that no night is ever dangerous; no failure state for an empty fire.

### Recipe 11: Server-authoritative needs (hunger, thirst, warmth)
When to use: any survival loop.
Steps:
1. State on the server per player as Attributes: `Hunger`, `Thirst`, `Warmth` each 0 to 100. [S87]
2. A single server loop (Heartbeat accumulator) subtracts per-second rates; heuristic start: Hunger 100 over 12 minutes, Thirst 100 over 8 minutes, sprinting x2; the reference game's hunger is 0 to 100 with a base drain of 2 per in-game hour in the day and 1.5 at night, doubling or tripling with sprinting, chopping or fighting (search summary, unverified). [S6]
3. States: Full 70+, Hungry 30 to 70, Starving 1 to 29, Empty 0: at 0 deal 1 health per second; below 30 slow stamina regen.
4. The client sends only "eat item X"; the server validates item ownership, cooldown and effect, then updates Attributes; the client listens to `GetAttributeChangedSignal`. [S87]
5. Make food a buff (Valheim idea): cooked food restores more and gives a timed bonus. [S95]
Pitfalls: client-side drains; RemoteEvent spam (rate limit and sanity check amounts). [S87]

### Recipe 12: Crafting bench tiers and resource nodes
When to use: survival crafting.
Steps:
1. `Items` ModuleScript table: id, stack size, recipe, bench level; `Recipes` data separate. Level costs as in the 99 Nights table (5 wood + 1 scrap to 50 wood + 50 scrap + 1 rare gem). [S9]
2. Resource nodes: trees (3 to 5 hits), rocks; respawn 60 to 180 s (heuristic) with a server timer; drops go to the nearest player's backpack by the server.
3. Craft: client requests `Craft(recipeId)`; server checks bench level, ingredients, inventory space; deducts and gives.
4. Gate by rare drops from dangerous places (cultist gems, forest gems) at levels 4 and 5. [S9]
5. Cap 26 to 50 recipes for a first release; the reference has 49. [S2][S9]
Pitfalls: client-trusted craft; unlimited stacking; a recipe tree where level 2 is already lethal to reach.

### Recipe 13: Moving-base run (Dead Rails style)
When to use: a distance-based co-op run.
Steps:
1. Train model with a seat for the driver; fuel Attribute drains per second; stops: towns every 10,000 m, forts every 10,000 m, end at 80,000 m (reference numbers). [S61]
2. Loot spawns during the day only; at night the area is hostile and loot stops. [S57]
3. Distance counter updated on the server from the train's position along a spline or straight rail; fuel refilled by coal pickups.
4. Final event: a bridge lowered by a player leaving the train with a countdown of 4 minutes. [S61]
5. Recycle long tracks by teleporting the train to a parallel start to stay far under 1 million studs from the origin. [S62]
6. Classes bought with Bonds; revive 45 Robux. [S57][S58]
Pitfalls: physics-driven train desyncing (use a server-owned anchored model moved by tween or `AlignPosition`); content popping in with streaming.

### Recipe 14: Intensity director (menace) for pacing
When to use: any horror with a roaming threat or timed scares.
Steps:
1. `menace` per player 0 to 100: +8/s when a monster has line of sight, +3/s within 30 studs, +10 on a loud event, -4/s otherwise. [S89] (values heuristic)
2. If the team average is over 80 for 10 s, call the relax phase: disable roaming monsters for 30 to 45 s, spawn a resource, play calm audio. [S89][S90]
3. If under 20 for 60 s, call the build phase: spawn a tell for the next entity.
4. Cap scares per mechanic at 2 and vary the type. [S92]
5. Log menace over time in testing; tune until the median run has 3 to 5 peaks.
Pitfalls: a director that punishes good players with more monsters; rubber-banding that feels fake.

### Recipe 15: Maturity, safety and policy checklist for horror
When to use: before every publish.
Steps:
1. Answer the questionnaire for the most extreme content a player can see; scary elements (jump scares, creepy NPCs, ominous music) are Mild; disfigured mouths, visible organs, realistic wounds are Moderate. [S74][S75]
2. Aim for Mild or Minimal: stylise creatures (cartoon mascots), no realistic blood, bodies disappear on death. [S74][S51]
3. Add a flashing-light and loud-audio warning on the game page; keep a setting to disable flashes. [S38][S101]
4. If you sell random items, show odds and apply PolicyService (note 03). [03]
5. Confirm that proximity voice chat and trading are labelled; Roblox Select and Kids accounts have chat limits. [S76]
Pitfalls: false questionnaire answers (moderation review, playability limits). [S74]

### Recipe 16: Co-op horror monetisation ladder
When to use: after the core loop is fun for 3 runs.
Steps:
1. Free currency for every run; a currency pack ladder (for example 250 for 49 Robux up to 16,000 for 1,799 Robux in DOORS; 20 for 99 up to 700 for 2,500 in 99 Nights). [S23][S10]
2. Revive consumable at about 45 Robux (Dead Rails), also earnable by codes. [S58][S23]
3. Classes or characters bought with soft currency; priced 10 to 600; the first one within 2 runs. [S10]
4. Cosmetics and emotes (Forsaken has 805 skins and 97 emotes). [S32]
5. A x2 currency pass at 150 to 300 Robux (Piggy). [S97]
6. Shop prompts only in the lobby or at an intermission, never mid-chase. (note 03 [S12])
Pitfalls: selling a survival-critical edge; paywalling the first class.

### Recipe 17: Content cadence and live ops for horror
When to use: from launch.
Steps:
1. Weekly: a developer "update party" or Q&A session on a fixed day (99 Nights, Saturday). [S1]
2. Every 2 to 4 weeks: a new character, entity, item set or biome plus a quest chain (Animal Hospital, Forsaken). [S52][S36]
3. Every 1 to 3 months: a floor, chapter or season (Piggy Season 9; DOORS floor 2 two years after floor 1). [S43][S17]
4. Seasonal: a Halloween event window (Oct 17 to 24, 2026 for 99 Nights; to Oct 31, 2026 for DOORS). [S2][S19]
5. Pre-announce on short video; keep trailers short (note 03).
6. Watch for a crash week; a bad update can cost half the players in a week (Forsaken). [S37]
Pitfalls: a chapter gap over 8 months; events without their own currency.

## Luau reference snippets
All APIs below are in current Roblox docs (checked against the creator-docs repository where noted). Heuristic constants are marked.

```lua
--!strict
-- Snippet 1: place the next room of a Doors-style chain (Recipe 1)
local Workspace = game:GetService("Workspace")
local ServerStorage = game:GetService("ServerStorage")

local pool: {Model} = {}
for _, m in ServerStorage:WaitForChild("RoomPool"):GetChildren() do
	if m:IsA("Model") then table.insert(pool, m) end
end
local track = Instance.new("Folder")
track.Name = "Track"
track.Parent = Workspace
local rooms: {Model} = {}
local rng = Random.new(12345) -- store the seed per run

local function overlaps(room: Model): boolean
	local cf, size = room:GetBoundingBox()
	local p = OverlapParams.new()
	p.FilterType = Enum.RaycastFilterType.Exclude
	p.FilterDescendantsInstances = { room }
	return #Workspace:GetPartBoundsInBox(cf, size - Vector3.new(1, 1, 1), p) > 0
end

local function spawnNext(): Model?
	local prev = rooms[#rooms]
	for _ = 1, 5 do
		local room = pool[rng:NextInteger(1, #pool)]:Clone()
		local entrance = room:FindFirstChild("Entrance") :: BasePart
		room.PrimaryPart = entrance
		if prev then
			local exit = prev:FindFirstChild("Exit") :: BasePart
			room:PivotTo(exit.CFrame) -- Entrance lands on the previous Exit
		end
		room.Parent = track
		if not overlaps(room) then
			table.insert(rooms, room)
			return room
		end
		room:Destroy()
	end
	return nil
end
```

```lua
--!strict
-- Snippet 2: server-owned stalker with a repath tick (Recipe 3)
local PathfindingService = game:GetService("PathfindingService")
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local monster = script.Parent :: Model
local root = monster:WaitForChild("HumanoidRootPart") :: BasePart
local hum = monster:WaitForChild("Humanoid") :: Humanoid
root:SetNetworkOwner(nil) -- docs: server ownership stops client control of the NPC

local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude
rayParams.FilterDescendantsInstances = { monster }

local function canSee(char: Model, range: number): boolean
	local head = char:FindFirstChild("Head") :: BasePart?
	if not head then return false end
	local toHead = head.Position - root.Position
	if toHead.Magnitude > range then return false end
	local hit = Workspace:Raycast(root.Position, toHead, rayParams)
	return hit ~= nil and hit.Instance:IsDescendantOf(char)
end

local function nearestVisible(): Model?
	local best: Model? = nil
	local bestDist = math.huge
	for _, plr in Players:GetPlayers() do
		local char = plr.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
		if char and hrp and not char:GetAttribute("Hidden") and canSee(char, 70) then
			local d = (hrp.Position - root.Position).Magnitude
			if d < bestDist then best, bestDist = char, d end
		end
	end
	return best
end

local function stepToward(target: Vector3)
	local path = PathfindingService:CreatePath({
		AgentRadius = 3, AgentHeight = 6, AgentCanJump = false, WaypointSpacing = 4,
	})
	local ok = pcall(function() path:ComputeAsync(root.Position, target) end)
	if ok and path.Status == Enum.PathStatus.Success then
		local wps = path:GetWaypoints()
		local nextWp = wps[2] or wps[1]
		if nextWp then hum:MoveTo(nextWp.Position) end -- re-called each tick, so the 8 s timeout never fires
	end
end

hum.WalkSpeed = 12
local lastSeen: Vector3? = nil
while monster.Parent do
	local prey = nearestVisible()
	if prey then
		lastSeen = (prey:FindFirstChild("HumanoidRootPart") :: BasePart).Position
	end
	if lastSeen then
		stepToward(lastSeen)
		if (lastSeen - root.Position).Magnitude < 4 then lastSeen = nil end -- Investigate/Search state goes here
	end
	task.wait(0.5)
end
```

```lua
--!strict
-- Snippet 3: server hide spot with a shrinking time limit (Recipe 4)
local Players = game:GetService("Players")

local function maxHideSeconds(roomIndex: number): number
	return 27 - 17 * math.min(roomIndex / 100, 1) -- fitted to Pressure's 27 s early and 10 s late (my interpolation)
end

local function hide(player: Player, locker: Model, roomIndex: number)
	local char = player.Character
	local inside = locker:FindFirstChild("Inside") :: BasePart?
	if not char or not inside or locker:GetAttribute("Occupant") then return end
	local hrp = char:FindFirstChild("HumanoidRootPart") :: BasePart
	locker:SetAttribute("Occupant", player.UserId)
	char:SetAttribute("Hidden", true) -- set on the server, never trust the client
	hrp.Anchored = true
	char:PivotTo(inside.CFrame)
	local token = os.clock()
	locker:SetAttribute("Token", token)
	task.delay(maxHideSeconds(roomIndex), function()
		if locker:GetAttribute("Token") == token and locker:GetAttribute("Occupant") == player.UserId then
			-- eject (client shows pulse and heartbeat before this fires)
			locker:SetAttribute("Occupant", nil)
			char:SetAttribute("Hidden", nil)
			hrp.Anchored = false
		end
	end)
end
```

```lua
--!strict
-- Snippet 4: validate a skill check on the server (Recipe 7)
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local remote = ReplicatedStorage:WaitForChild("SkillCheckPress") :: RemoteEvent

type Check = { start: number, duration: number, centre: number, width: number }
local active: { [Player]: Check } = {}

local function begin(player: Player, rng: Random): Check
	local c: Check = {
		start = Workspace:GetServerTimeNow(),
		duration = 1.0,
		centre = 0.25 + rng:NextNumber() * 0.6,
		width = 0.12,
	}
	active[player] = c
	return c -- send it to that client; the client animates the needle
end

remote.OnServerEvent:Connect(function(player: Player)
	local c = active[player]
	if not c then return end
	active[player] = nil
	local t = (Workspace:GetServerTimeNow() - c.start) / c.duration
	local allowance = 0.05 -- latency allowance, heuristic
	local hit = math.abs(t - c.centre) <= c.width / 2 + allowance
	-- hit: add progress; miss: pause the machine and alert nearby enemies
end)
```

```lua
--!strict
-- Snippet 5: shared day/night phase from one timestamp, per-client lighting (Recipe 10)
-- Server: workspace:SetAttribute("CycleStart", workspace:GetServerTimeNow())
-- Client (LocalScript):
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")

local DAY, NIGHT = 180, 90 -- seconds (99 Nights' reported clock)
local CYCLE = DAY + NIGHT

RunService.RenderStepped:Connect(function()
	local start = Workspace:GetAttribute("CycleStart") :: number?
	if not start then return end
	local t = (Workspace:GetServerTimeNow() - start) % CYCLE
	local hour: number
	if t < DAY then
		hour = 6 + 12 * (t / DAY)               -- 06:00 to 18:00
	else
		hour = (18 + 12 * ((t - DAY) / NIGHT)) % 24 -- 18:00 to 06:00
	end
	Lighting.ClockTime = hour
end)
```

```lua
--!strict
-- Snippet 6: campfire fuel, level and safe check on the server (Recipe 10)
local Fire = { fuel = 120, level = 1, radius = 60 } -- radius in studs: heuristic

local function weatherFactor(): number
	local w = workspace:GetAttribute("Weather") -- "clear" | "rain" | "blizzard"
	return if w == "blizzard" then 3 elseif w == "rain" then 2 else 1
end

task.spawn(function()
	while true do
		task.wait(1)
		Fire.fuel = math.max(0, Fire.fuel - weatherFactor() / (1 + (Fire.level - 1) * 0.25))
		workspace:SetAttribute("FireFuel", Fire.fuel)
	end
end)

local function isSafe(pos: Vector3, firePos: Vector3): boolean
	return Fire.fuel > 0 and (pos - firePos).Magnitude <= Fire.radius
end
```

```lua
--!strict
-- Snippet 7: server-side hunger drain with Attributes (Recipe 11)
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local HUNGER_PER_SEC = 100 / (12 * 60) -- heuristic: empty in 12 minutes
local THIRST_PER_SEC = 100 / (8 * 60)

Players.PlayerAdded:Connect(function(plr)
	plr:SetAttribute("Hunger", 100)
	plr:SetAttribute("Thirst", 100)
end)

local acc = 0
RunService.Heartbeat:Connect(function(dt)
	acc += dt
	if acc < 1 then return end
	local step = acc
	acc = 0
	for _, plr in Players:GetPlayers() do
		local char = plr.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 then
			local sprint = if char:GetAttribute("Sprinting") then 2 else 1
			local h = math.max(0, (plr:GetAttribute("Hunger") :: number) - HUNGER_PER_SEC * sprint * step)
			local t = math.max(0, (plr:GetAttribute("Thirst") :: number) - THIRST_PER_SEC * sprint * step)
			plr:SetAttribute("Hunger", h)
			plr:SetAttribute("Thirst", t)
			if h <= 0 or t <= 0 then hum:TakeDamage(1 * step) end
		end
	end
end)
```

```lua
--!strict
-- Snippet 8: dark, readable lighting preset and a flashlight (Recipe 5)
local Lighting = game:GetService("Lighting")

local function applyHorrorPreset()
	Lighting.LightingStyle = Enum.LightingStyle.Realistic
	Lighting.Ambient = Color3.fromRGB(18, 18, 24)
	Lighting.OutdoorAmbient = Color3.fromRGB(14, 14, 20)
	Lighting.ExposureCompensation = 0.25
	Lighting.ClockTime = 0
	Lighting.FogColor = Color3.fromRGB(5, 5, 8)
	Lighting.FogEnd = 160

	local atmo = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
	atmo.Density = 0.4
	atmo.Haze = 1.6
	atmo.Color = Color3.fromRGB(120, 130, 160)
	atmo.Parent = Lighting

	local cc = Lighting:FindFirstChildOfClass("ColorCorrectionEffect") or Instance.new("ColorCorrectionEffect")
	cc.Saturation = -0.25
	cc.Parent = Lighting
end

local function makeFlashlight(head: BasePart): SpotLight
	local s = Instance.new("SpotLight")
	s.Angle = 60
	s.Range = 50
	s.Brightness = 2.5
	s.Shadows = true
	s.Face = Enum.NormalId.Front
	s.Enabled = false
	s.Parent = head
	return s
end
```

```lua
--!strict
-- Snippet 9: camera shake plus jump scare frame (client)
local RunService = game:GetService("RunService")
local camera = workspace.CurrentCamera

local function shake(duration: number, magnitude: number)
	local start = os.clock()
	RunService:BindToRenderStep("HorrorShake", Enum.RenderPriority.Camera.Value + 1, function()
		local t = os.clock() - start
		if t >= duration then
			RunService:UnbindFromRenderStep("HorrorShake")
			return
		end
		local falloff = 1 - t / duration
		local o = Vector3.new(math.noise(t * 25, 1), math.noise(t * 25, 2), 0) * magnitude * falloff
		camera.CFrame = camera.CFrame * CFrame.new(o)
	end)
end
-- Show the scare image for about 0.6 s (one tutorial's figure), then fade; limit to 1-2 per mechanic.
```

```lua
--!strict
-- Snippet 10: chapter save (max chapter) and teleport to a chapter place (Recipe 9)
local DataStoreService = game:GetService("DataStoreService")
local TeleportService = game:GetService("TeleportService")
local Players = game:GetService("Players")

local store = DataStoreService:GetDataStore("HorrorProgress_v1")

local function saveChapter(userId: number, chapter: number)
	store:UpdateAsync(tostring(userId), function(old: number?)
		return math.max(old or 0, chapter)
	end)
end

local function sendToChapter(player: Player, placeId: number)
	local opts = Instance.new("TeleportOptions")
	opts:SetTeleportData({ from = game.PlaceId })
	TeleportService:TeleportAsync(placeId, { player }, opts)
end
```

```lua
--!strict
-- Snippet 11: menace director (Recipe 14); call once per second per player
local menace: { [Player]: number } = {}

local function tick(plr: Player, losToMonster: boolean, distToMonster: number, loud: boolean)
	local m = menace[plr] or 0
	if losToMonster then m += 8 end
	if distToMonster < 30 then m += 3 end
	if loud then m += 10 end
	m = math.clamp(m - 4, 0, 100) -- constants are heuristic
	menace[plr] = m
end
```

## Open questions / unverified
- Peak CCU disagreements among trackers: 99 Nights (14.15M Rolimons, 14M Roblox spotlight, 11.2M RoWatcher), Forsaken (1.22M, 1.1M, 138K), Dandy's World (875K first-party, 866,577 Rolimons, 857K another summary, 607K RoWatcher), Evade (197,261 Rolimons vs "158,000 in October 2025" on RoWatcher). I used the first-party figure where one exists and the Rolimons figure otherwise. [S1][S12][S13][S25][S30][S31][S35b][S36][S38][S63]
- 99 Nights day length: the Miraheze wiki (3 min day, 1.5 min night) is internally consistent with the 7 h 25 m claim; the Playgama page (6 to 8 minute nights) is not. A hunger figure (2 and 1.5 per in-game hour) came only from a search summary of a wiki page that failed to load (HTTP 525). Campfire radii (30 m, 20 m, 15 m) come from one low-quality page. [S4][S5][S6]
- Forsaken's match size (1v4 versus 1v8), the round clock's end condition, generator repair time and map count are contradictory across sources. The sources I could fetch agree on the 4:00 start and the 12 and 60 second generator reductions. [S31][S34][S56]
- Pressure's room count (100 official, 115 third-party) and its decline after March 2026. [S39][S42][S56]
- Dandy's World's floor count (15 versus 19) depends on what counts as a floor. [S24][S25]
- No developer interview or talk was found for DOORS, Forsaken, Pressure's AI internals, Animal Hospital, Road-Side Shawarma, Dead Rails (team size, build time) or Piggy's 2020 development; only Roblox spotlights for 99 Nights, Dandy's World, The Inn and Short Creepy Stories. Fandom pages (DOORS, Piggy, Dandy's World, 99 Nights, Mimic) returned HTTP 402, so several facts rely on search summaries.
- No first-party horror retention (D1, D7, D30) numbers by genre exist in what I could access; note 03's BLOXG table (horror D1 22%, D7 8%, D30 2.8%) is third-party with undisclosed method and I did not use it.
- DOORS entity damage values and room ranges vary by guide and by update; I used them for shape only. The "Hide" ejection time (about 12 s) is unverified.
- Base hatch, drop and spawn probabilities for any of these games are not published; I give none.
- `Lighting.ClockTime` is tagged "Not Replicated" on the reference page; I avoided depending on server-to-client replication by computing the phase on each client from a shared timestamp (Snippet 5). Whether a plain server write replicates should be tested in a published server.
- ProximityPrompt, SpotLight and Light defaults were not stated on the reference pages I could read; the values in the recipes are heuristic starting points.
- Photosensitivity: I found no Roblox policy text; the 2-flashes-per-second ceiling is my conservative heuristic, based on general accessibility guidance that I could only read in a search summary.
- Older than 2024 and possibly stale: the Game Developer pieces on Alien: Isolation (about 2015), L4D (2013), Amnesia (2014) and horror level design (2015); the 2021 and 2022 devforum answers on monster ownership; Piggy's 2020 peak and the 2022 "why horror is popular" article; Valheim 2021. They are used for principles only.

## Sources
Trust labels: (P) first-party or primary, (D) devforum, (T) third-party, (S) search summary (page not fetched).
[S1] Creator Spotlight: The Story Behind 99 Nights in the Forest, Roblox devforum, 2025-10-31, https://devforum.roblox.com/t/creator-spotlight-the-story-behind-99-nights-in-the-forest/4036940 (P/D)
[S2] 99 Nights in the Forest wiki, Bloxodes, read 2026-10-04, https://bloxodes.com/wiki/99-nights-in-the-forest (T)
[S3] Campfire, 99 Nights in the Forest wiki, Miraheze, https://99nightsintheforestroblox.miraheze.org/wiki/Campfire (T)
[S4] Campfire strategy guide, 99nightsintheforest.net, https://www.99nightsintheforest.net/Strategy/campfire.html (T, low reliability)
[S5] Days, 99 Nights in the Forest wiki, Miraheze, https://99nightsintheforestroblox.miraheze.org/wiki/Days (T)
[S6] How long is one night in 99 Nights, Playgama blog, https://playgama.com/blog/game-faqs/how-long-is-one-night-in-99-nights-in-the-forest/ (T, contradicted; also the hunger-drain figure comes from a search summary of https://99-nights-in-the-forest.wiki/guides/hunger-thirst-management-guide/, S)
[S7] All 99 Nights in the Forest monsters and entities, Pocket Tactics, updated 2026-04-24, https://www.pockettactics.com/99-nights-in-the-forest-monsters (T)
[S8] All 46 Entities in 99 Nights in the Forest, Bloxodes, https://bloxodes.com/wiki/99-nights-in-the-forest/entities (T)
[S9] Crafting Bench, 99 Nights in the Forest Wiki, https://99nightsintheforest.wiki/the_crafting_bench (T)
[S10] Class costs, diamond prices and diamond sources, search summaries of esports.gg, Sportskeeda and Gamezebo 99 Nights guides, 2026 (S)
[S11] Cultist Stronghold, search summaries of the 99 Nights Fandom page and Sportskeeda, 2026 (S)
[S12] 99 Nights in the Forest, RoWatcher game page, read 2026-10-04, https://rowatcher.com/games/7326934954/99-nights-in-the-forest (T)
[S13] 99 Nights in the Forest, Rolimons, read 2026-10-04, https://www.rolimons.com/game/79546208627805 (T)
[S14] Top Roblox Games in July 2026, StudioKrew, https://studiokrew.com/blog/top-roblox-games-july-2026/ (T)
[S15] 2026 Roblox Innovation Awards, Roblox newsroom, 2026-09-12, https://about.roblox.com/newsroom/2026/09/2026-roblox-innovation-awards (P)
[S16] List of Roblox games, Wikipedia, read 2026-10-04, https://en.wikipedia.org/wiki/List_of_Roblox_games (T)
[S17] Doors (game), Wikipedia, https://en.wikipedia.org/wiki/Doors_(game) (T)
[S18] DOORS, Rolimons, read 2026-10-04, https://www.rolimons.com/game/6516141723 (T)
[S19] DOORS wiki, Bloxodes, read 2026-10-04, https://bloxodes.com/wiki/doors (T)
[S20] DOORS entities, mechanics and pricing, BloxGuides GG, https://bloxguidesgg.com/games/doors (T)
[S21] How to survive every monster in Doors, TheGamer, 2024-01-12, https://www.thegamer.com/roblox-doors-surviving-from-every-monster-guide/ (T)
[S22] The Hotel+ Update and peak players, search summary of the DOORS Fandom page and ProGameGuides, 2023 (S)
[S23] Doors Knobs pack prices, revives and codes, search summary of Fandom, Dexerto and PCGamesN, 2026 (S)
[S24] Dandy's World wiki, Bloxodes, read 2026-10-04, https://bloxodes.com/wiki/dandys-world (T)
[S25] Creator Spotlight: How Qwelver Dreamed Up Dandy's World, Roblox devforum, 2025-05-05, https://devforum.roblox.com/t/creator-spotlight-how-qwelver-dreamed-up-dandy%E2%80%99s-world/3639226 (P/D)
[S26] Scholastic and BlushCrunch Studio announce Dandy's World book partnership, GamesBeat, https://gamesbeat.com/scholastic-and-blushcrunch-studio-announce-book-publishing-partnership-exclusive/ (T)
[S27] Dandy's World survival guide, games.gg, 2026-09-14, https://games.gg/dandys-world/guides/dandy-s-world-survival-guide/ (T)
[S28] Machines, Dandy's World wiki, Miraheze, https://dandysworld.miraheze.org/wiki/Machines (T)
[S29] Machines per floor, Twisted counts and floor flow, search summaries of Dandy's World Fandom and Miraheze pages and the Fandom developer-team page (S)
[S30] Dandy's World [ALPHA], Rolimons, read 2026-10-04, https://www.rolimons.com/game/16116270224 (T)
[S31] Dandy's World [ALPHA], RoWatcher, https://rowatcher.com/games/5569032992/dandys-world-alpha (T)
[S32] Forsaken wiki, Bloxodes, read 2026-10-04, https://bloxodes.com/wiki/forsaken (T)
[S33] Forsaken Stamina Management 2026, ForsakenHub, updated 2026-09-09, https://www.forsakenhub.com/blog/forsaken-stamina-management-2026 (T)
[S34] Forsaken complete game mechanics guide 2026, ForsakenHub, https://www.forsakenhub.com/blog/forsaken-complete-game-mechanics-guide-2026 (T)
[S35] Forsaken, BloxGuides GG, https://bloxguidesgg.com/games/forsaken (T)
[S35b] Forsaken, RoWatcher game page, https://rowatcher.com/games/6331902150/forsaken (T)
[S36] Forsaken's Floral Update Drives the Survival Horror Hit Past 86K Players, RoWatcher news, https://rowatcher.com/news/forsaken-s-floral-update-drives-the-survival-horror-hit-past-86k-players (T)
[S37] Roblox Week of July 18: ... a Big Forsaken Crash, RoWatcher news, https://rowatcher.com/news/roblox-week-of-july-18-asmr-towers-algorithm-spikes-a-big-forsaken-crash (T)
[S38] Forsaken, Rolimons, read 2026-10-04, https://www.rolimons.com/game/18687417158 (T)
[S39] Pressure, Official Pressure Wiki (Urbanshade), https://urbanshade.org/wiki/Pressure (T/community-official)
[S40] Hiding, Official Pressure Wiki, https://urbanshade.org/wiki/Hiding (T)
[S41] All Entities and Monsters Guide, Pressure Wiki, https://pressuregame.wiki/entities (T)
[S42] Pressure, RoWatcher, https://rowatcher.com/games/4367208330/pressure (T)
[S43] Piggy wiki, Bloxodes, read 2026-10-04, https://bloxodes.com/wiki/piggy (T)
[S44] Piggy, Rolimons, read 2026-10-04, https://www.rolimons.com/game/4623386862 (T)
[S45] Piggy Book 2 dates and the 510K record, search summary of piggy.fandom.com pages (S)
[S46] Why are horror games so popular on Roblox?, Bryant Francis, Game Developer, 2022-11-22, https://www.gamedeveloper.com/design/why-are-horror-games-so-popular-on-roblox- (T; stale)
[S47] The Mimic, Rolimons, read 2026-10-04, https://www.rolimons.com/game/6243699076 (T)
[S48] Roblox The Mimic books, jumpscares and more, Pocket Tactics, 2024-10-16, https://www.pockettactics.com/roblox/the-mimic (T)
[S49] The Mimic release dates, search summary of themimicroblox.fandom.com/wiki/Release_Dates (S)
[S50] Animal Hospital wiki, Bloxodes, read 2026-10-04, https://bloxodes.com/wiki/animal-hospital (T)
[S51] Animal Hospital becomes Roblox's latest horror sensation, GosuGamers, July 2026, https://www.gosugamers.net/entertainment/news/78741-animal-hospital-becomes-roblox-s-latest-horror-sensation-here-s-everything-you-need-to-know (T)
[S52] Roblox Animal Hospital hits 1.2 million CCU with major update, GosuGamers, 2026, https://www.gosugamers.net/entertainment/news/78773-roblox-animal-hospital-hits-1-2-million-ccu-with-major-update-featuring-new-character-and-items (T)
[S53] [UPD] Animal Hospital (Anomaly), Rolimons, read 2026-10-04, https://www.rolimons.com/game/78515283254292 (T)
[S54] Animal Hospital on Roblox: How the Anomaly Horror Game Works, AllThings.how, 2026-06-17, https://allthings.how/animal-hospital-on-roblox-how-the-anomaly-horror-game-works/ (T)
[S55] Road-Side Shawarma [HORROR], Rolimons, read 2026-10-04, https://www.rolimons.com/game/97267505570231 (T; creator and dates also from a search summary)
[S56] 10 Best Roblox Horror Games in 2026, RoWatcher news, 2026, https://rowatcher.com/news/10-best-roblox-horror-games-in-2026-from-dandy-s-world-to-hidden-gems (T)
[S57] Dead Rails wiki, Bloxodes, read 2026-10-04, https://bloxodes.com/wiki/dead-rails (T)
[S58] How Dead Rails Became the Hottest Roblox Game, MaxPowerGaming, 2025-03-10 (updated 2025-07-28), https://www.maxpowergaming.co/post/how-dead-rails-became-hottest-roblox-game (T)
[S59] How Dead Rails became a Roblox hit, GameAnalytics blog, 2025, https://www.gameanalytics.com/blog/dead-rails-and-the-hit-makers-formula (T)
[S60] Dead Rails, Rolimons, read 2026-10-04, https://www.rolimons.com/game/116495829188952 (T)
[S61] Dead Rails end distance and final bridge, search summary of Gamezebo and Droid Gamers endings guides, 2025-26 (S)
[S62] How actually Dead Rails, A Long Road like games being infinite, Roblox devforum, 2025-08-15, https://devforum.roblox.com/t/how-actually-dead-rails-a-long-road-like-gams-being-infinite/3881875 (D, community)
[S63] Evade, Rolimons, read 2026-10-04, https://www.rolimons.com/game/9872472334 (T)
[S64] Break In (Story), RoWatcher, https://rowatcher.com/games/1318971886/break-in-story (T; Break In 2 and 3 facts from a search summary)
[S65] Creator Spotlight: Chainsaw Man Director on Building Japanese Horror Game The Inn, Roblox devforum, 2025, https://devforum.roblox.com/t/creator-spotlight-chainsaw-man-director-on-building-japanese-horror-game-the-inn/3659603 (P/D)
[S66] Creator Spotlight: Kharbor_ykt, the Mind Behind Short Creepy Stories, Roblox devforum, 2024-10-31, https://devforum.roblox.com/t/creator-spotlight-kharborykt-the-mind-behind-short-creepy-stories/3237927 (P/D)
[S67] Devlog #1: Making a cinematic horror game, Roblox devforum, October 2023, https://devforum.roblox.com/t/devlog-1-making-a-cinematic-horror-game/2646883 (D; stale)
[S68] Horror game AI functionality questionable... jitters and lags (EIizabow, replies by arbitiu), Roblox devforum, 2024-08-08, https://devforum.roblox.com/t/horror-game-ai-functionality-questionable-at-best-often-jitters-and-lags/3108027 (D)
[S69] How to create an Animated, Intelligent, and Chasing Monster in Roblox? (kn1fem4ster and others), Roblox devforum, March to August 2025, https://devforum.roblox.com/t/how-to-create-an-animated-intelligent-and-chasing-monster-in-roblox/3555620 (D)
[S70] How would I make a efficient chasing monster (SchlossGarage, AlureonTime and others), Roblox devforum, 2021 to 2022, https://devforum.roblox.com/t/how-would-i-make-a-efficient-chasing-monster/1283434 (D; stale)
[S71] How to Make a Roblox Horror Game (2026), Generalist Programmer, 2026-06-24, https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-horror-game (T)
[S72] Pathfinding, Roblox Creator Docs, https://create.roblox.com/docs/characters/pathfinding (P)
[S73] PathfindingService reference and the pathfinding doc source, creator-docs repository, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/PathfindingService.yaml and .../characters/pathfinding.md (P)
[S74] Content maturity and compliance, Roblox Creator Docs, https://create.roblox.com/docs/production/promotion/content-maturity (P)
[S75] Upcoming Changes to Experience Guidelines, Roblox devforum announcement, 2024 (dates 2024-07-15, 2024-09-16, 2024-10-15), https://devforum.roblox.com/t/upcoming-changes-to-experience-guidelines/3070343 (P/D)
[S76] What Families Need to Know About Roblox's New Age-Based Protections, Roblox newsroom, 2026-05, https://about.roblox.com/newsroom/2026/05/what-families-should-know-roblox-kids-select (P)
[S77] Global lighting guidance, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/environment/lighting.md (P)
[S78] Lighting class reference, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Lighting.yaml (P)
[S79] Atmosphere guidance, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/environment/atmosphere.md (P)
[S80] Audio objects and Audio effects, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/audio/objects.md and .../audio/effects.md (P)
[S81] SoundService reference, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/SoundService.yaml (P)
[S82] Network ownership, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/physics/network-ownership.md (P)
[S83] Humanoid reference, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Humanoid.yaml (P)
[S84] Model reference, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Model.yaml (P)
[S85] ProximityPrompt reference, creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/ProximityPrompt.yaml (P)
[S86] Procedural room generation threads, Roblox devforum: https://devforum.roblox.com/t/procedural-room-generation/3088481 (2024-07-26, plus a search summary of replies), https://devforum.roblox.com/t/help-with-doors-generation/3159508 (2024-09-15), https://devforum.roblox.com/t/what-is-a-good-approach-for-room-generation/4015405 (2025-10-19 to 21) (D)
[S87] How would you make a secure hunger/thirst system? (VitalWinter, ScalewreckTeam), Roblox devforum, 2024-04-03, https://devforum.roblox.com/t/how-would-you-make-a-secure-hungerthirst-system/2911315 (D)
[S88] Day/night cycle threads, search summary of Roblox devforum threads (custom daylight cycle, day night cycle smooth, and others), various dates (S)
[S89] The Perfect Organism: The AI of Alien: Isolation, Game Developer, undated (about 2015), https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation (T; older than 2024)
[S90] The Discomfort Zone: the hidden potential of Valve's AI Director, Ben Serviss, Game Developer, 2013-02-07, https://www.gamedeveloper.com/design/the-discomfort-zone-the-hidden-potential-of-valve-s-ai-director (T; older than 2024)
[S91] Four ways to design for horror, from Amnesia dev Frictional Games, Kris Graft, Game Developer, 2014-05-08, https://www.gamedeveloper.com/design/four-ways-to-design-for-horror-from-i-amnesia-i-dev-frictional-games (T; older than 2024)
[S92] Creating Horror through Level Design: Tension, Jump Scares, and Chase Sequences, Jared Mitchell, Game Developer, 2015-10-14, https://www.gamedeveloper.com/design/creating-horror-through-level-design-tension-jump-scares-and-chase-sequences (T; older than 2024)
[S93] Day, Don't Starve wiki, https://dontstarve.wiki.gg/wiki/Day (T)
[S94] How long does a day actually last in Valheim?, mein-mmo, https://mein-mmo.de/en/how-long-does-a-day-actually-last-in-valheim,662039 (T)
[S95] Design Deep Dive: Valheim, Jeff Vogel, 2021-06-08, https://bottomfeeder.substack.com/p/design-deep-dive-valheim (T; older than 2024)
[S96] The Long Dark hunger, search summary of thelongdark.fandom.com/wiki/Hunger (S)
[S97] Piggy Tokens and pass prices, search summary of Fandom, ProGameGuides and Sportskeeda pages (S)
[S98] Deadly Delivery stats and description, search summaries of Rolimons, Steam, GameRant and Droid Gamers, 2025-26 (S)
[S99] 3008 (SCP-3008 adaptation by Uglyburger0), search summary of Pocket Tactics and guides (S; used only to confirm the format exists)
[S100] Jump scare habituation, search summary of horror psychology pages (Game Developer, With a Terrible Fate and others) (S; low quality)
[S101] Photosensitivity warnings in Roblox experiences, search summary of web results (S; low quality)
[S102] Evade creators and nextbot counts, search summary of RoWatcher and Know Your Meme pages (S)
[S103] Horror devforum feedback-thread advice (new mechanic needed to stand out), search summary of Creations Feedback threads, 2025 (S)
