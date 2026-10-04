# Defense, tower defense, wave survival and RTS-lite games on Roblox
_Researched 2026-10-04 by deep-research agent (Claude), Round 2. Sources: 118 (about 16 first-party Roblox docs or newsroom, about 25 developer-written devforum threads and GitHub repos, the rest third-party wikis, analytics sites, guides and design articles; see the trust labels and the list at the bottom)._

How to read the labels. "[Sx]" cites the numbered list at the bottom. "Third-party" means a wiki, guide site or analytics site that is neither Roblox nor the game's developer; its numbers are snapshots that drift with every update and, for SEO guide sites, are sometimes wrong (several conflicts are shown below on purpose). "Rolimons" and "RoWatcher" figures are third-party analytics; the "average playtime" they show has no documented method. "Search summary" means the page itself could not be fetched (Fandom wikis answered HTTP 402 and NamuWiki 403) and the figure comes from the summary of a search result; treat it as less certain. "Derived" means I computed it from sourced values (arithmetic shown). "Own model" means a number from a small simulation I wrote to illustrate a method; it is not a measurement of any game. "Heuristic" means a starting value with no measured source. Anything not backed is marked "unverified". This note goes deeper than `03-genre-design.md` (which has the TDS wave-bonus formulas [03-S125], the TDS team facts and Recipe 8) and does not repeat them; it adds the enemy and tower numbers, the gacha-TD economy, the plant-lane hybrid, survival-wave and RTS-lite findings, and the engineering facts needed to simulate hundreds of enemies.

## Key facts

### 1. Market snapshot: who is in the genre and how big (all third-party unless noted)
Peak and current concurrent players (CCU) from Rolimons or RoWatcher pages read on 2026-10-04 (peaks are Rolimons' own recorded maxima and "may not reflect a true peak"):

| Game (creator) | Type | Created / launched | All-time peak CCU (date) | Recent | Rolimons avg playtime |
|---|---|---|---|---|---|
| Toilet Tower Defense (Telanthric) | meme-IP unit-collection TD | 2023-06-17 | 522,376 (2024-03-09) [S55] | about 4.1K in Oct 2026 [S70]; final "legacy" update 2026-05-03 with over 20K playing (search summary) [S102] | 13.9 min |
| Plants & Brainrots (Splitting Point) | plant-lane TD + shop/idle | created 2025-08-01 | 8,654,525 (2025-10-11) [S57] | not read | 10.7 min |
| Tower Defense Simulator (Paradoxum) | classic co-op TD | 2019 | 159,824 (2025-10-04) [S56] | 14K (bloxodes) [S71] | 11.2 min |
| Anime Vanguards (Kitawari) | anime gacha TD | launched 2024-09-08 | 340,167 (2024-09-14) [S54] | 22.7K to 23.1K [S70][S71] | 40.1 min |
| Universal Tower Defense (UTD) | gacha TD | created 2025-04-04 (search summary) | 240,274 (2026-06-02) [S59] | 128 on that Rolimons page, 88.5K in a search snippet of the Bloxodes trending list: the two disagree, unverified [S59][S71] | 24.2 min |
| SpongeBob Tower Defense (Wonder Works, licensed) | IP gacha TD | launched 2024-12-21 | 191,984 (2026-02-14) [S61][S96] | 983 on the Rolimons page | 9.5 min |
| Hunty Zombie (HZ Dev) | co-op wave survival, character on the field | created 2025-05-22 (search summary) | 213,132 (2025-08-29) [S60][S107] | 2,245 | 9.1 min |
| build ur base (High Quality Games) | base-build wave defense, 6 players | 2025-08-05 | 176,130 (2025-10-04, search summary) [S62][S116] | 715 | 15.8 min |
| All Star Tower Defense, original (Top Down Games) | anime TD, 3-unit loadout | 2020-05-07 | 164,029 (2021-09-25) [S58] | 2.4K (the later "X" version) [S70] | 7.1 min |
| Anime Defenders (Small World Games) | gacha TD | 2024-04-05 | sources disagree: 142K (RoWatcher), 202K (search summary), 380.5K (Rotrends) [S67][S68] | 174 on 2026-10-03 [S68] | n/a |
| Garden Tower Defense (Garden Defenders) | plant TD, 350+ units | 2025-05 | 66K (2025-08) [S66] | 6K to 9K; 98.2% like ratio | n/a |
| Tower Defense X (JOHN ROBLOX and team) | classic TD, towers have health | 2023-11-21 | 36,266 (2023-11-21, search summary) [S102] | 4.1K to 7.8K [S70][S71] | n/a |
| Mini War (M&M Community) | RTS-lite country builder, 6-player servers | created 2026-03-05 | 126,344 (2026-06-13) [S63] | 10,230; 349.6M visits in 7 months | 22.5 min |
| Rise of Nations (Hyperant, solo side project) | grand-strategy RTS | about 2019 | 8,039 (2022-11-12) [S64] | n/a | 23.9 min |
| Mini Empires (VIREAL) | RTS, cores and armies | paid 2022-12-17, free 2024-02-06 | 9,310 (2026-04-02) [S65] | 1,400 | 3.7 min |

Reading the table (derived): the cheap-to-copy meme TD (Toilet Tower Defense) and the new-hybrid TD (Plants & Brainrots) had the highest ceilings, but Toilet Tower Defense fell from 522K to about 4K (about 99% below peak, 2024-03 to 2026-10), build ur base from 176K to 715 in a year (99.6%), and Anime Vanguards from 340K to about 23K (93%) in 25 months. The one TD that kept a large base for 7 years, Tower Defense Simulator, is a co-op skill game with seasonal events, not a gacha game. [S54][S55][S56][S62][S70]
- Genre size on the chart: Bloxed (Oct 2026) tracks 179 tower defense games [S70]; only about five have more than 5K concurrent players on any given day (Anime Vanguards 23.1K, Garden Tower Defense 6.1K, Toilet Tower Defense 4.1K, Tower Defense X 4.1K, Superbox Siege Defense 4K) [S70]. A TD launched into this field competes with the 2025-2026 brainrot hybrids, not with the 2019 classics.
- Awards (first-party and press): the 2025 Innovation Awards gave Best of IP to SpongeBob Tower Defense and Best Strategy to Dead Rails (search summary of several press pages) [S112]; the 2026 Awards (2026-09-12) gave Best Strategy Game to Mini War by M&M Community, with the official description "start with a small country, build its economy, raise an army, and decide whether diplomacy or total domination" is the path to victory; the other nominees were Tower Defense X, Rise of Nations and Tower Defense Simulator (nominees from a search summary) [S15][S111]. The platform's own strategy prize therefore went to a RTS-lite, not to a classic TD, in 2026.
- A 2026 trade claim (already in note 10): SpongeBob Tower Defense was built in six weeks by four people and then shipped 52 consecutive weekly updates; third-party trade press, not verified here [10-S]. Its 2.0 relaunch (2026-04-24) added 31 units, 11 mounts and 3 pets, rebuilt economy and prices, rebalanced "all 296 existing units", and announced Pro Mode (May 2026), PvP (June 2026) and monthly events; the same article gives 633 million visits, 9.6 million peak monthly users, 97.96% approval and a Discord of 206,000 [S96]. (Another page counts "158 unique units with 632 variants" [S102]; the counts disagree, so quote neither as exact.)

### 2. Archetypes (what "defense" means on Roblox in 2026)
1. Classic co-op wave TD (Tower Defense Simulator, Tower Defense X, Tower Heroes, Tower Battles): 1 to 4 players per match, a fixed path, match cash, a loadout of towers chosen in a lobby, difficulty modes, a meta currency for new towers. [S56][S73][S75][S110]
2. Gacha-unit TD (Anime Vanguards, Anime Defenders, Anime Adventures, Universal Tower Defense, SNACK Defense, SpongeBob Tower Defense): towers are collectible characters from summon banners with rarity, traits and evolution; the match is the way to earn summon currency. [S79][S80][S87][S93][S96]
3. Plant-lane or garden hybrids (Plants & Brainrots, Garden Tower Defense): seeds from a restocking shop, plants auto-defend a lane garden, rebirth, limited events; the shop and idle loop is as important as the defense. [S89][S91][S92]
4. Character-on-the-field wave survival (Superbox Siege Defense, Hunty Zombie, Zombie Attack, Blade X Zombies, Zombie Rush): the player's avatar or character is the main weapon, waves come in numbered rounds with boss waves, cash buys weapons and upgrades. [S105][S106][S107]
5. Base-build wave defense (build ur base, Build and Survive, Build Base to Survive VERITY): build walls, traps and turrets during a build phase, survive waves; 6-player servers. [S62][S94][S95]
6. PvP lane-send modes (Tower Battles, TDS PvP): up to 6 players; each team spends money to send extra enemies at the opponent's lane; TDS PvP is 31 waves that repeat, 1v1 or 2v2, level 25. [S75][S109]
7. RTS-lite (Mini War, Mini Empires, Rise of Nations, Astro Force): economy buildings, army production, capture cores or territory; small servers and a hard unit cap. [S41][S63][S100]
8. "Wave" as a hazard (Escape Tsunami For Brainrots: tsunami waves that wipe the map, survival-idle hybrid; created 2025-12-15, peak near 5 million CCU in January 2026, about 164,000 in October 2026 per RoWatcher; search summary) [S69][S108]. Not a defense game, but it shows "waves" now also mean timed map-wide threats. A later search snippet puts the same game at 3,935 online in October 2026 with a 2026-08-15 peak of 51,321, a different universe or window; unverified. [S108]

### 3. Tower Defense Simulator in depth (third-party numbers, drift with updates)
- Mode ladder (Bloxodes snapshot): Easy 20 waves; Casual 30; Intermediate 30 (level 5); Molten 35 (level 15); Fallen 40 (level 30; 42 with the Hidden Wave); Frost 40 (level 60); Challenge Trials 40 (level 40); Hardcore 45 (level 50, 1 to 3 players, gems and tower EXP, consumables off); Voidcore 50 (needs a Hardcore triumph); Pizza Party 40 (level 25); Badlands II 30; Polluted Wasteland II 25 (level 50); PVP 31 repeating waves (level 25); Sandbox (level 250); Story Mode. [S75] Conflict: note 03 records Casual at 25 waves from a Fandom summary; Bloxodes now says 30. Use "25 to 30, unverified".
- The Hidden Wave is a time-gated secret: legacy rule, finish wave 40 of Fallen in 1,009 s (16 min 49 s) or less (search summary). [S118] Fallen takes about 18 to 22 minutes to clear and Hardcore 35 to 40 minutes (guide site). [S72]
- Enemy health ladder (guide site table, 2026): Normal 2, Speedy 4, Hidden 8, Slow 14, Breaker 10, Abnormal 8, Skeleton 15, Armored 70 (50% defense), Slow Boss 1,400, Necromancer 360 (summons 5 skeletons), Living Experiment 2,400, Giant Boss 12,500, Brute 10,000, Patient Zero 100,000, Molten Golem 2,750, Molten Boss 70,000, Molten Warlord 150,000, Fallen Giant 4,000, Fallen Tank 22,500, Fallen Guardian 45,000, Fallen King 250,000, Awakened Fallen King 1,000,000, Frost Spirit 500,000, Void Knight 75,000, Void Guardian 150,000 (plus a 25,000 shield), Void Reaver 1,200,000. Speeds run from 12 studs-per-second class (Fallen Rusher) down to 0.85 (Void Reaver). [S74] A second source disagrees on several early values (Normal 4 to 12 depending on mode, Armored 100) so use shapes, not decimals. [S102]
  - Derived: from the weakest to the strongest enemy the health spans 2 to 1,200,000, a factor of 600,000 (about 5.8 orders of magnitude), spread across 40 to 50 waves; bosses are roughly 100x to 1,000x a basic enemy within one mode (Easy: Normal Boss 150 vs Normal 2 is 75x; Brute 10,000 is 5,000x).
  - Traits that make the roster interesting: defense percentages (20% to 100%), immunities (stun, freeze, burn, health regeneration), enemies that spawn others on death (Breaker3 spawns Breaker2, Mandrake spawns a Hefty and four small ones), summoners (Necromancer 5 skeletons, Fallen Necromancer 8, Molten Summoner 3 Elite Moltens), lane switching (Voidling), and enemies that disable towers (Molten Executioner stuns one tower for 8 seconds). [S74]
- Match economy: guide sites disagree on the basics, which is itself a warning that the numbers change by version. Starting cash 1,500 (Dungeonpath) vs $500 in note 03; Farm unlock cost 1,250 (search summary) vs 2,000 coins (towers page and tier list) [S72][S73][S77][S103]. Stable pattern across all: a Farm is an economy tower with no damage; a level-2 Farm costs about 700 in total and pays about 350 per wave (about 2 to 3 waves payback, derived 700 / 350 = 2); a max-level Farm pays up to 1,500 per wave; advice is to have two to three level-2 Farms by wave 12 and "farm first, damage second" until the first fifteen waves are safe; selling returns 70% of a tower's value. [S72][S77][S103]
- Tower cost ladder (older Scout page, search summary): placement $250 (another source $125), upgrade steps $100, $200, $500, $1,000, $1,500, total $3,300 for level 5, so each upgrade costs about 1.5x to 5x the one before and the last step is about 15x the first (derived). Current top-end: a maxed Juggernaut costs $532,000 of in-match cash (Aug 2026), Minigunner 8,000 coins to unlock and $1,850 to place, Ranger 12,000 coins, Accelerator 2,500 gems at level 50, Gatling Gun 35,000 coins. [S73][S77][S114]
- Roster and caps: 83 towers in 8 groups (7 Starter, 14 Intermediate, 13 Advanced, 5 Hardcore, 4 Evolved, 8 Golden Perks, 22 Exclusive, 10 unobtainable); placement limits make slots the real constraint (Accelerator 5, Juggernaut 1 per player, Operator 16, Minigunner unlimited in normal modes and 12 in PvP). [S77][S73]
- Evolved towers are a long-term progression and a paid skip: Enforcer needs evolution level 20 on Shotgunner or a 499 Robux skip, then 4,750 gems and 15,000 coins (v2.6.0, 2026-08-14 to 08-21). The Executioner rework shipped 2026-09-25; Gladiator rework and a shop revamp in v2.7.0. Cadence is roughly one named tower update every 4 to 6 weeks. [S77]
- Co-op scaling: on Fallen enemy health grows by player count: +15% for 2 players, +25% for 3, +40% for 4 (search summary of the Fandom page). [S119] On Easy the wave bonus shrinks 10% per extra player (note 03).
- Developer facts (first-party spotlight, in note 03): a school project in spring 2019, CCU from 3,000 to 30,000 after creators picked it up, 30-person studio, two-week sprints, trailers of 30 seconds or less. [S16]

### 4. Gacha-unit TD economics (Anime Vanguards and its relatives; third-party)
- Anime Vanguards: launched 2024-09-08 after development from about 2024-01-08 (place created 2024-01-28); owners Yuruzuu and the former owner Koborei; units placed with Yen; seven rarities (Rare, Epic, Legendary, Mythic, Exclusive, Secret, Vanguard). [S83] Peak 340,167 only six days after launch, then a long decline to about 23K; like ratio 96.7% on 2.6M votes; 2.06 billion visits; Rolimons average playtime 40.1 minutes, far above the other TDs (the platform's 10-minute Creator Rewards threshold is met by most TD sessions). [S54]
- Summon odds (guide site, 2026): single summon 50 gems (40 with VIP), 10x is 500 gems; Rare 75.496%, Epic 20%, Legendary 4%, Mythic or Exclusive 0.5%, Vanguard Memoria 0.075%, Vanguard unit 0.005%, Secret 0.004%; pity: Legendary at 50 summons (2,500 gems), Mythic at 400 (20,000 gems), Vanguard at 25,000 (1,250,000 gems). Three banners: Special (rotates hourly), Selection (customisable middle slot), Event (own currency). [S79][S113] Checks (derived): the listed rates sum to 100.08%, so one figure is mistranscribed, and Roblox requires a 100% total [S9]; the expected cost of a Mythic without pity is 1 / 0.005 = 200 summons = 10,000 gems, so a 400-summon pity guarantees at worst 2x the average; with no pity, 13.5% of players would see no Mythic in 400 summons (0.995^400 = 0.135) and 13% no Legendary in 50 (0.96^50 = 0.130). Pity converts "unlucky" into a bounded price; it is also the obvious thing to disclose to satisfy the odds rule.
- Anime Adventures older rates (search summary): Rare 81.9%, Epic 16%, Legendary 2%, Mythical 0.25% (0.5% on special banners; featured center mythic 50%); these sum to 100.15%, unreliable in the same way. [S104]
- Universal Tower Defense (trait odds from its wiki): Ruler trait 0.1% base rate, Duelist 0.8%; pity counters of 277 (Astral) and 125 (Fortunate); "E-levels" E0 to E6 need duplicates; modes Story, Infinite, Virtual Realm (roguelike with path choices), Featured Challenge; a Speed Cart that earns income per wave. [S87]
- Traits are a second random layer: a Divinity or Monarch trait can raise a main attacker's damage by over 50% (guide); trait rerolls come from codes (typically 50), events, Odyssey (up to about a thousand a day, guide) and raid shops (200+). [S81][S101] Mythic Ascension adds three stat tiers (+3% damage, +5% range, +7% damage). [S80]
- Evolution and materials: units evolve with Essence Stones, Gold and sometimes a quest; some require takedown counts (5,000 for one named unit). [S79][S80]
- In-match economy: farm units are the template. Sprintwagon costs 550 Yen to place, 9,000 to max, yields 2,550 per wave, pays back in 2 to 4 waves and the guide says use exactly two; Nami 550 / 26,000 / 10,000 per wave base and scaling with chests; Takaroda 800 / 39,000 / 10,000 (13,000+ with a memoria). One farm of the expensive type per team, to protect damage slots. [S82] That is a payback of about 2 to 4 waves for the cheap farm and a decision about slot opportunity cost for the expensive ones (derived).
- Unit mechanics worth copying: Splash tag repeats damage to enemies within 20 studs of the target; Honest tag cuts upgrade costs by 10% and adds 30% crit rate; Ninjutsu units can be placed free by selling another in range (every 10 s per player); buffers raise Damage, Range, SPA (seconds per attack), CRIT. [S84]
- Modes as retention: Story, Legend Stages, Raids, Rifts, Boss Rush, Infinite, Worldlines, Odyssey. Odyssey is 15-wave stages on 5 maps, a boss room every 5 stages with a cash-out-or-continue choice (continue costs 2,000 Yen per chest; failing after continuing loses 600 intensity of rewards), units are locked out of the next stage after use (farms exempt), intensity cards change the reward, shop refreshes every 2 stages with 6 modifiers at 1,500 to 10,000 Yen. [S85] The Summer Zombies event mode is infinite waves with boss pairs at waves 15/20, 35/40, 55/60, a "Spawn Surge" every 20 waves (all lanes release together), a permanent seasonal currency (Iced Tea) banked at waves 20, 30, 40..., and, after wave 100, falling enemy HP with a capped count so late waves stay winnable. [S86] A "leveling loop" (restart after wave 10 or 20, 3 to 5 minutes per run versus 15 to 20 for a full story clear) is how players farm. [S81]
- Other numbers: SNACK Defense (created 2026-05-27): global cap 20 units per map with per-type limits, 26-wave mid-game maps with mini-bosses, King Bear and Queen Bear as early bosses, three banner types (standard, jackpot, rate-up), currencies gems, luck, tower XP, trait rerolls, trade dice. [S93] Anime Defenders: 30 players per server, a five-way skill tree per unit (guide), estimated lifetime revenue $27.4M by a model with stated assumptions (2% engagement, 150 Robux per session, 70% share, $0.0038 per Robux); that is an estimate, not a reported figure. [S68][S99] All Star Tower Defense X: 5-unit cap per tower type, a Summon Gate. [S99] Ultimate Tower Defense: max 5 of each tower type, anime-character towers (Feb 2025). [S97]

### 5. Plants & Brainrots and Garden Tower Defense (the 2025 hybrid)
- Loop: buy seeds from a restocking shop, plant them in a lane garden, plants auto-attack waves of brainrots, kills pay money, rebirth gives permanent +50% luck and +50% money per tier; weekly Saturday updates plus developer "admin abuse" live events; later cards and deck-building; peak 8.65 million CCU on 2025-10-11 (Rolimons) and "nearly 9 million" in press, over 1 billion visits in the first two months [S57][S91][S92]. 5-player servers, 35-plant garden cap (Beebom, 2025-12-23). [S90]
- Seed shop: restock about every 5 minutes (instant restock 80 Robux), NPC George's shop refresh quoted as 4 min 40 s, water buckets $7,500 with a 2-minute gear restock. [S89][S92][S119] Plant table (Oct to Dec 2025 guides, base damage and price): Cactus 10 / $200, Strawberry 25 / $1,250, Pumpkin 55 / $5,000, Sunflower 115 / $25K, Dragonfruit 250 / $100K, Eggplant 500 / $250K, Watermelon 1,500 / $1M, Grape 1,750 / $2.5M, Cocotank 1,250 / $5M, Carnivorous Plant 2,250 / $25M, Mr Carrot 3,500 / $50M, Tomatrio 9,000 / $125M, Shroombino 12,500 / $200M, Mango 20,000 / $367M, King Limone 25,000 / $450M, Starfruit 30,000 / $750M (16 plants, rarities Rare to Secret). Robux prices for the first seeds are 5, 10 and 17 Robux. [S89][S90][S119]
  - Derived: price per point of damage climbs from $20 (Cactus) to $217 (Sunflower), $667 (Watermelon), $4,000 (Cocotank), about $14K to $18K for Mr Carrot to Mango and $25K for Starfruit. Across the 16 plants the price rises 3.75 million times (200 to 750M) while damage rises 3,000 times (10 to 30,000). The step ratios mostly run 1.2x to 6x in price for 1.2x to 3x in damage (Cocotank is an exception: dearer than Grape but lower damage, presumably a tank role; unverified). So a higher plant is a bad deal per damage point but is the only way to fit more damage into the 35 slots and to beat boss health; this is the same slot-limited logic as the TDS and Anime Vanguards caps, and the money sink that drives rebirth. (Own derivation from [S89][S90].)
  - Boss scale reference: one boss reaches 15,000 to 20,000 HP at high progression while the player earns about 750 gold per second. [S92]
- Garden Tower Defense (Garden Defenders, created 2025-05): 350+ plants, flowers and units, cross-platform, can morph into units, weekly updates every Saturday at 3 PM UTC, 98.34% like ratio on 1.37M likes (search summary), peak about 66K in August 2025, 808M visits. [S66] Decay from 66K to about 6K to 9K is milder than the brainrot hybrids (about 85% to 90%).

### 6. Survival-wave and base-defense games
- Zombie Attack (classic): endless numbered waves, a boss every 10 waves starting at wave 11 that must be killed to advance; guns bought from a shop with a price that rises per purchase; solo cash about 60K over the first 50 waves, about the same again over the next 20 and about 100K from there to wave 100 (Fandom summaries, third-party; method unknown). [S106] Derived: about 1,200 cash per wave for waves 1 to 50, about 3,000 per wave for waves 51 to 70 and about 3,300 per wave for waves 71 to 100 (if the "to wave 100" figure means waves 71 to 100), so income per wave only about triples after wave 50 while enemy health keeps compounding and weapon prices rise per purchase; that is the usual way a classic wave-survival game becomes a wall.
- Superbox Siege Defense (created 2023-09-23, 224M plays): you are a character on the battlefield, not a turret dropper; two lives in most modes, everyone respawns when a wave starts with one life left, Nightmare and Death modes give one life; points unlock 24+ units; best played in private servers. [S105]
- Hunty Zombie: 40-player servers with parties of up to six, gacha for weapons, perks and traits; special zombies (kamikaze, athlete); modes Party Crasher and Sandbox; peak 213,132 CCU on 2025-08-29; 717M visits; alpha-labelled; Rolimons playtime 9.1 min. [S60][S107]
- build ur base: build phase then waves; boss waves at 25, 50, 75 and 100; reserve 20 to 30% of cash unspent (a guide's advice); weapons crossbow, spikes, walls, turrets (basic, double, flamethrower, minigun); boss types Tank, Swarm, Ranged, Speed; auto-wave to speed up; 6 players, 226M visits, peak 176K at launch and a collapse to hundreds. [S62][S95] A 2019 devlog of the same idea ("Protect the Crystal") drew feedback that play became repetitive after 15 to 20 minutes and that difficulty ramped too fast (2019, stale but the same failure mode). [S40]
- Build Base to Survive VERITY (Aug 2026 review): build, defend, upgrade cycles with cash and materials, "balanced" monetisation, no wave counts published. [S94]
- Note 03 covers 99 Nights in the Forest and Dead Rails (night survival with a campfire or train as the failure clock); the 2026 Best Survival award went to 99 Nights in the Forest [S15], so base-and-night survival currently has more platform recognition than pure wave-clear.

### 7. RTS-lite on Roblox
- Mini War (M&M Community, created 2026-03-05): build residential and commercial buildings for income, reinvest in factories, then military buildings; units soldiers, tanks, planes, helicopters; capture territory; servers of 6 players; guides advise economy first, air rush as a timing play, territory control as a scouting play; peak 126,344 on 2026-06-13, 349.6M visits in 7 months, 96.5% like ratio, average playtime 22.5 minutes. [S63][S100][S111]
- Mini Empires (VIREAL): cap of 40 units (raised from 30 in v0.6.0, 2024-08-09), heavy tanks take 3 population, core income 750 to 500, farm 1,000 to 700, oil pump 2,800 to 2,300, house cap 4 to 6; shows that RTS-lite balance is mainly income and population-cap tuning. [S41]
- Rise of Nations (Hyperant): solo developer, side project, grand strategy; peak 8,039; Rolimons playtime 23.9 min. [S64][S115]
- Astro Force (Vantablack Studios, an RTS "like StarCraft 2" with hundreds of units) is the engineering reference: first version used server parts moved by CFrame at about 60 Hz and cost about 600 KB/s for 100 moving units; the second version stored positions in scripts, sent about 10 updates per second, dropped Y (heightmap on the client) and used only a Y rotation (6 numbers to 3), sent only changed units and packed into Vector2int16 or Vector3int16 (256 bits to 64 bits per update, about 70% of the saving), reaching about 10 KB/s for 100 units, a 60x cut (developer Atrazine, 2021-05-03). [S21] Later threads confirm the pattern: a Dec 2024 RTS guide for 200+ units (data only on the server, array not dictionary payloads, Vector2int16, send about every 10 frames, Parallel Luau for unit calculations, a grid "swarm module" for target acquisition, recalculating paths about every 5 frames, FastFlow flow fields, PrimaryPart:PivotTo instead of Model:PivotTo) [S22]; a Feb 2025 thread where an RTS with 300 to 500 units hit about 10,000 ms latency because default replication of unit movement flooded the connection and the fix was custom replication or sending only CFrames to clients that model NPCs locally [S23]; a fog-of-war design on an 8x8 stud grid with reference counting that cost 20 to 30% FPS when many PointLights were active (Atrazine, 2021-07-11). [S24]
- The lead programmer of Astro Force, Atrazine, is also the lead programmer of Tower Defense X, whose wiki says it keeps 60 FPS with hundreds of enemies and tens of towers (search summary, third-party). [S102] Treat that as the best public hint that top TD engineering is "custom replication of enemies as data".

### 8. Engineering facts that decide whether a TD scales (first-party plus developer threads)
- Enemy movement choices, from devforum authors: Humanoid:MoveTo is the beginner path and has an 8-second timeout that must be refreshed (first-party doc) [S10][S17]; developers say humanoids are costly and inefficient above about 40 to 60 enemies and a 2025 tutorial recommends CFrame:Lerp along a waypoint table with the leftover time carried across waypoints (iNexesi and Pat_Wastaken, 2025-07-23) [S18][S19]; one 2024 devlog used AlignPosition and AlignOrientation without Humanoids and says TDS does its movement that way [S19][S34]; the Toy Defenders approach is invisible server parts with client-cloned rigs, and disabling unused Humanoid states cuts per-frame checks (2023) [S37].
- The most-cited architecture is "server owns state, client owns visuals": the server keeps enemy health, waypoint progress and status effects; clients receive updates about every 0.1 s and tween (best when slows and stuns are frequent) or receive a one-time path and speed and simulate alone (cheapest, desyncs with interruptions) (Eezby and others, 2021-10-20). [S20] A case with 500+ enemies throttled the server update to every 10 Heartbeats and sent simplified x, z and rotation values (2023-08-31); a thread on UnreliableRemoteEvent per enemy per frame was called wasteful and batching was advised (2024-07). [S19][S33]
- Docs facts: UnreliableRemoteEvent guarantees neither delivery nor order, drops payloads over 1,000 bytes and drops messages when the client fires faster than the throttle [S2][S3]; the buffer library (`buffer.create`, `writeu8/u16/u32`, `writei16`, `writef32`, `readbits/writebits`, `copy`, `fill`) packs data without table overhead [S5]; Parallel Luau uses Actors, `task.desynchronize`, `ConnectParallel`, SharedTable and Actor messaging [S4]; PathfindingService:CreatePath takes AgentRadius, AgentHeight, AgentCanJump and Costs, and FindPathAsync is deprecated [S6]; anchored parts are always server-owned and clients that own a part can feed bad physics data or fire Touched without a real collision [S11]; StreamingEnabled defaults to a 1024-stud target radius and the doc recommends `PauseOutsideLoadedArea` and Atomic or Persistent models for gameplay-critical objects [S7]; reserved servers are created with `TeleportOptions.ShouldReserveServer` and entered with `ReservedServerAccessCode`, TeleportData is visible to the client so never carry currency in it, call TeleportAsync only from the server inside pcall with retry [S8].
- Targeting: central loop beats per-tower loops (a 2022 post blamed a ServerScript with a tight while-loop per enemy and per tower [S29]; a 2020 thread reports a central coroutine at 1/12 s intervals grouping towers [S31]); on fixed paths convert each enemy to a single "distance along path" number and target by that instead of by magnitude, so "first" is the maximum progress [S31]; retarget every 1 to 2 seconds unless the target dies (2024) [S32]; spatial queries: `GetPartBoundsInRadius` takes a position, radius and OverlapParams with `MaxParts` [S1], one author argues it beats a magnitude loop because it uses the engine's spatial structure but gives no benchmark [S28], another says it needs physical parts and prefers a plain loop or an octree for data-only enemies [S27]; a GitHub pull request (search summary) benchmarks a uniform-grid bucket at about 3 to 4x faster at 1,000 to 20,000 enemies. [S44]
- Placement: raycast from the camera on the client for the preview (use `ViewportPointToRay` and RaycastParams that exclude the tower being placed), validate again on the server [S35]; an open-source framework shows red and green range previews and server-validated placement, 100+ animated units at about 90 FPS and about 12.6 KB/s inbound with bit-packed networking (developer claim, one project) [S43]; another repo uses 1 to 4 players, per-player cash, a 15-tower cap per player, owner-only upgrade and sell, enemy rewards split by damage dealt, health and count scaling with players. [S44]
- Procedural waves: an open-source wave framework spends a budget of 90 + 15 x wave on weighted random enemy picks that each have Cost, Weight, UnlockWave and CoinReward, so waves 1, 10, 20, 30, 50 have budgets 105, 240, 390, 540, 840 (derived). [S42]
- Flow fields for swarms heading to one goal: FastFlow (bob_factory, 2024-12-01) benchmarks on a 101x101 grid at 11.76 ms preprocessing, 1.79 ms pruned and 8.96 ms full generation (M1 MacBook Pro), 2D grids only; the field is generated once however many units follow it. [S25][S26]

### 9. Classic design theory with numbers (older than 2024, still the working canon)
- Bloons TD 6: each pop pays 1 cash and each completed round pays 100 + round; cash per pop is cut to 50% from round 51, 20% from 61, 10% from 86, 5% from 101, 4% from 121, 2% from 141; RBE (red-bloon-equivalent health of a round) is about (round x 4,000) - 217,000 on the high rounds. Round RBE samples: 1 is 20; 10 is 204; 20 is 66; 40 is 616; 60 is 3,164; 80 is 16,656; 100 is 67,200; 140 is 645,440; cumulative RBE to 100 is 2.04 million. [S49][S50] Derived: round health multiplies by 5.3x from 60 to 80, then 4.0x from 80 to 100 and 9.6x from 100 to 140, while cash per pop falls to 2%; income is flattened on purpose so that late rounds are decided by tower strength rather than by hoarding. Notice round 20 (66) is below round 10 (204): rounds are not monotonic, they alternate pressure and rest.
- Plants vs Zombies: a level starts with 50 sun (enough for one Sunflower); a Sunflower costs 50 sun and produces 25 sun every 24 seconds in the original (later games in the series retune both numbers); George Fan's GDC 2012 talk argues for tutorials that teach by doing, in at most about eight words at a time, one mechanic at a time, with money not introduced until level 10, and adaptive hints only for players who need them. [S47][S48] Derived: a Sunflower repays its cost in 2 production cycles (48 s), the standard "invest first" curve; this is the template for Farm towers.
- Goal Defense (mobile TD, 2013 post): a basic creep with 75 HP at 0.8 tiles per second faces a turret doing 10 damage at 2 shots per second, so one turret kills it in about 4 seconds (derived: 75 / 20 = 3.75 s) over 3 to 3.5 tiles; the player should earn enough per wave to buy 1 or 2 turrets, the level should end with the field 60% to 70% full, 20 waves take 10 to 15 minutes, the player needs about 1,800 coins for 20 waves and starts with enough for 3 turrets of 60; several turret types must stay viable. The article's wave-size inequality is quoted but its worked example does not reproduce from the summary I could read, so treat only the inputs as sourced. [S45]
- Kingdom Rush: placement only on strategic points near the road so the scarce resource is slots ("if you spam cheap buildings, you will run out of locations"), maps that split the path or hide enemies in tunnels, the first wave sends 3 goblins that 3 soldiers fully stop to teach the barracks, and calling the next wave early pays gold equal to the seconds skipped (risk and reward). [S46]
- The "four jobs" model of towers: single-target, area, control (slows) and specialist (armour or air); a defence missing one has a wave shape it cannot answer; place slows at turns, splash where lanes overlap, single-target where bosses must pass; path geometry matters more than raw damage (Reign Creative, 2026-09-15). [S51] Creation.dev (2026-02-17) says boss waves every 5 or 10 waves, 3 to 5 upgrade tiers, 10 to 20 tower types at launch, each tier roughly doubling the previous cost, all damage, health and currency on the server, 3 to 6 weeks for a solo basic version and 2 to 4 months for a polished one (heuristics, no data). [S52] A polynomial HP curve with at least 3 terms for 50+ rounds and a "difficulty = HP / gold available so far" metric is suggested by a design thread. [S53]
- Own model (not a source), showing how to tune curve against income: 30 waves, enemies 6 + 2w, per-enemy HP 10 x 1.13^(w-1), kill cash 2 + 0.15w, wave bonus 100 + 40w, 500 start, defence cost per DPS rising from 6 by 1 + w/15, 85% of cash spent on defence, enemies exposed 14 s. Ratio of affordable DPS to required DPS: wave 1 is 15.3, wave 5 is 10.0, wave 10 is 6.4, wave 15 is 3.9, wave 20 is 2.4, wave 25 is 1.4, wave 30 is 0.8. The shape (generous early, tight at about wave 25, failing by 30 unless the player adds economy and ability power) is the intended tension; a ratio that never drops below 1 means the mode has no ending.

### 10. What separates the hits from the clones (synthesis, with evidence)
1. A fresh theme or hook, then the same proven loop: Toilet Tower Defense used the Skibidi Toilet meme [S55]; Plants & Brainrots fused Grow a Garden's shop, Steal a Brainrot's memes and Plants vs Zombies' lanes [S91]; SpongeBob Tower Defense used a licence [S96]. TDS itself has no theme novelty and lasted because of tower variety, modes and polish [S16][S77].
2. Decay is the norm; update cadence is the lifeline. RoWatcher: "games that stop updating die within weeks" and Steal a Brainrot fell 99.2% from peak (25.8M to about 215K) yet stayed healthy; Toilet Tower Defense went to a final legacy update after 3 years. [S69][S102] Weekly Saturday updates are the stated cadence of Plants & Brainrots, Garden Tower Defense and Pet Simulator 99. [S66][S92]
3. Slots and meta-currency, not match cash, are the long-term economy: TDS Evolved towers cost 4,750 gems plus 15,000 coins [S77]; Anime Vanguards pity costs 20,000 gems for a Mythic [S79]; Plants & Brainrots charges $750M for the top plant [S89][S90]. Match cash is only the short-term decision layer.
4. Gacha TDs monetise randomness and shortcuts (VIP summons 40 vs 50 gems; a 499 Robux evolution skip; an 80 Robux instant restock; 5 to 17 Robux first seeds), each with a disclosure duty under Roblox's paid-random-item rules. [S9][S77][S79][S89][S119]
5. Sessions are short (9 to 14 minutes) except where the mode ladder gives long runs (Anime Vanguards 40 minutes, Mini War 22.5, Rise of Nations 23.9), which fits the 10-minutes-per-day Creator Rewards rule in note 03. [S54][S55][S56][S60][S61][S63][S64]
6. Co-op size is small and fixed (1 to 4 in TDS, 5 to 6 in several others, 30 in Anime Defenders) and enemy health scales with party size. [S75][S109][S119][S62][S63][S92][S68]
7. The skilled-player ceiling (Hardcore and Voidcore with consumables off, Challenge Trials, Odyssey cash-out choices, Boss Rush) gives top players something to optimise; clones usually ship only a linear map-and-wave ladder. [S75][S85]

## How to apply it (rules for an AI builder)

### Scope and genre choice
- DO decide first which archetype (section 2) you are building and say it in one sentence with the three loop parts (minute-to-minute: place and upgrade; repeated: clear waves; progression: unlock towers or units). For a first build choose archetype 1 (classic co-op wave TD) or archetype 3 (plant-lane hybrid): they are the most reproducible with Studio primitives.
- DO NOT clone Toilet Tower Defense or Anime Vanguards beat for beat; both show 93% to 99% decay and Roblox pays more for novel mechanics (note 03). Combine one proven loop with one new mechanic (a lane switch, enemies that attack towers like Tower Defense X, a build phase like build ur base).
- DO budget the match length: 20 to 30 waves in 10 to 20 minutes (Goal Defense 20 waves in 10 to 15; TDS Fallen about 18 to 22 minutes; Anime Vanguards "leveling loop" 3 to 5 minutes). [S45][S72][S81]

### Server and client split (non-negotiable)
- DO keep every number that matters on the server: enemy health and position progress, cash, tower stats, placement validity, wave state. Clients render, tween, preview placement and show UI. [S20][S52]
- DO NOT use Humanoid for enemies if more than about 40 can be alive; use model rigs with an AnimationController or the Animator and move them with `PivotTo` and `CFrame:Lerp` or with data-only enemies rendered by clients. [S18][S19][S34]
- DO replicate enemies as data: send spawn and death on a reliable RemoteEvent, send position snapshots at 10 Hz on an UnreliableRemoteEvent in a packed buffer, and keep each payload under 1,000 bytes (at 4 bytes per enemy that is 250 enemies per packet, derived). [S2][S3][S21]
- DO NOT fire one remote per enemy per frame. Batch into one event per tick. [S33]
- DO validate all placement on the server (cash, slot limit, unit type, position inside a buildable zone, not overlapping, owner). The client preview is cosmetic. [S35][S43][S44]
- DO NOT let a client own parts that carry game state (tower or enemy models); anchored parts stay server-owned. [S11]

### Economy and balance
- DO give each mode a sourced-shape economy: start cash enough to place 1 to 3 starter towers (Goal Defense: 3 turrets; TDS Easy $500), wave bonus roughly linear with wave number (TDS Easy +160 per wave), kill cash small relative to bonus, an economy tower that repays in 2 to 4 waves (TDS Farm about 2 to 3; PvZ Sunflower 2 cycles; Anime Vanguards Sprintwagon 2 to 4). [S45][S48][S72][S82] (Note 03 has the TDS wave-bonus formulas.)
- DO make economy towers a risk: no damage, an opportunity cost in the slot cap, and an upgrade ladder whose last step is much more expensive than the first (Scout ladder total $3,300; Farm max $1,500 per wave). [S72][S103][S114]
- DO cap towers: per-type limits (TDS Accelerator 5, Juggernaut 1; ASTD X and UTD 5 per type) and a total cap (SNACK 20 per map; Plants & Brainrots 35 plants; Mini Empires 40 population). Slot scarcity is the strategy layer (Kingdom Rush). [S46][S77][S90][S93][S41][S97][S99]
- DO price tiers so cost per unit of damage grows with rarity (Plants & Brainrots $20 per damage at the first seed to $25,000 at the last) but total damage per slot rises, so players buy up only when slot-limited. [S89][S90]
- DO scale enemy health with party size (+15%, +25%, +40% for 2, 3, 4 players) and, if wave cash is shared, shrink the bonus per extra player (Easy: -10% each) or split kill rewards by damage dealt. [S119][S44]
- DO use a stronger enemy ladder across modes by multiplying, not adding: the TDS basic enemy has 2 HP and the top boss 1.2 million; each new mode should add roughly one order of magnitude at the top end (derived from [S74]).
- DO test curves with a spreadsheet or a script before building content: required DPS per wave (total wave HP / exposure seconds) versus affordable DPS from cumulative income (see the own model and Recipe 7). Aim for a ratio of 5 to 15 on wave 1 to 5, about 1.4 to 2.5 at the last quarter, and under 1 only on the final boss wave. (Own model; heuristic.)

### Gacha and paid-random rules
- DO show every outcome and exact odds as percentages that total 100% in a pop-up opened by a labelled button before purchase; this covers gems, tickets or keys bought with Robux. [S9]
- DO check `PolicyService:GetPolicyInfoForPlayerAsync` for `ArePaidRandomItemsRestricted` and `IsPaidItemTradingAllowed`, and give restricted players one of five alternatives (earnable path, disclosed fixed sequence, direct sale, hide, block with a message). [S9]
- DO add pity: it bounds the worst case (Anime Vanguards Legendary 50, Mythic 400) and makes odds easier to defend. [S79]
- DO NOT sell units that are pure damage multipliers for Robux only; pay-to-win backlash is the documented risk of the genre (note 03). Sell speed, slots, cosmetics and convenience (VIP 40 vs 50 gems is a discount, not a tower). [S79][S99]
- DO NOT put a gacha banner on the very first screen; give the first tower and the first win first (PvZ: no money until level 10). [S47]

### Content and live-ops
- DO ship a fixed difficulty ladder (Easy 20 waves, Normal 30, Hard 40, Hardcore 45 with consumables off, Endless) with level or progress gates and separate reward tables; rotate a Challenge mode with fixed loadouts weekly. [S75]
- DO put a boss every 5 or 10 waves and a milestone mini-boss about two-thirds through (TDS Fallen: wave 20 Void Reaver check, 25 to 30 guardian check, 40 King; build ur base: 25, 50, 75, 100). [S52][S76][S95]
- DO add one new enemy trait per mode (immunity, summon-on-death, lane switch, tower stun) rather than only more health. [S74]
- DO run an event mode with its own currency that banks permanently regardless of the run (Iced Tea in the Summer Zombies mode) and a "late waves get easier" rule after a threshold (enemy HP falls after wave 100, count capped). [S86]
- DO commit to a weekly or at least biweekly cadence before launch; every sourced long-lived hit ships on a calendar (Saturdays for Plants & Brainrots and Garden Tower Defense). [S66][S92][S69]

### Mobile and UX
- DO design placement for touch: tap to select a tower in the hotbar, drag a ghost with a visible range circle, confirm with a big button; red and green ghost colour for invalid and valid (open-source framework). [S43]
- DO teach one mechanic per wave and use at most about eight words of tutorial text at a time (PvZ lesson); highlight the Farm in the first minute. [S47]
- DO give a target-priority button (First, Last, Strongest, Weakest, Closest) and sell and upgrade buttons on the selected tower; show cost and affordability. (Pattern widely used; the five modes are a third-party convention, unverified for any one game.)

## Recipes (each becomes a skill)

### Recipe 1: Server-authoritative TD skeleton and match state machine
When to use: the first step of any wave-defense game.
Steps:
1. Workspace folders: `Map/Path` (Parts named "1", "2", ... in walking order, anchored, `CanCollide=false`, `Transparency=1`), `Map/BuildZones` (Parts tagged "BuildZone" via CollectionService), `Map/Base` (a Part named "Base" with an Attribute `MaxHealth`), `Towers` and `Enemies` empty folders (server only), `ReplicatedStorage/Remotes`.
2. ServerScriptService modules: `Config` (all tunables: start cash, wave table, tower table, enemy table), `Match` (state machine: Lobby, Intermission, Wave, Boss, Victory, Defeat), `Enemies` (simulation), `Towers` (placement, targeting), `Economy`. Put all gameplay numbers in `Config` so they can change without editing logic (also lets you ship them as Attributes).
3. State machine: `Intermission` 10 to 20 s countdown (heuristic; Kingdom Rush lets players skip it for gold), then `Wave` until all enemies of the wave are spawned and dead or have reached the base, then pay the wave bonus, then the next wave. `Defeat` when `BaseHealth <= 0`; `Victory` after the last wave. Replicate the state with Attributes on a `Match` Folder or a RemoteEvent, not by polling.
4. Run a single server loop on `RunService.Heartbeat` that steps all enemies and tower timers (Recipe 2 and 5). Do not create a script per enemy or tower. [S29][S31]
5. On match end, grant meta rewards once (guard with a boolean) and teleport or reset (Recipe 9).
Pitfalls: one script per enemy; yielding inside the Heartbeat handler; waves that start before the last wave's survivors resolve; trusting a client "ready" signal; forgetting that a late-joining player needs the current state and the existing enemy list (send a full snapshot on join).

### Recipe 2: Path following with enemy simulation as data
When to use: any lane TD with a fixed path.
Steps:
1. Precompute waypoints, segment lengths and cumulative distance once (below). An enemy is a plain table: `{id, typeId, hp, maxHp, speed, seg, t, dist, effects}`; no Instance needed on the server.
2. In the Heartbeat loop, advance by `speed * dt` and carry leftover movement across waypoints so speed is constant at any frame rate (the tutorial's lesson). [S18]
3. Track `dist` (distance along the whole path); it is the single number for targeting, sorting "first", replication and leak detection.
4. When `seg` passes the last segment the enemy leaks: subtract `leakDamage` (heuristic: enemy HP-class based, for example 1 for normal, 10 for boss) from base health and remove it.
5. Apply slow and stun as multipliers on `speed` with an expiry time; never change `speed` in place without remembering the base.
Pitfalls: using `Humanoid:MoveTo` (8-second timeout, laggy above about 40 to 60 enemies) [S10][S19]; turning corners with `Lerp` between positions every frame without carrying leftover time (speed varies); Y position that sinks into terrain (raycast once at spawn or bake the path height).

### Recipe 3: Replicating hundreds of enemies cheaply
When to use: more than about 50 simultaneous enemies, or whenever server frame time grows with enemy count.
Steps:
1. Reliable `RemoteEvent` for `Spawn(id, typeId, serverTime)` and `Despawn(id, reason)` and for status events `Speed(id, newSpeed, serverTime)`; these are rare.
2. Option A (cheapest, deterministic): clients simulate the path from the spawn time and speed; only send corrections for slows and stuns. Option B (robust against frequent effects): the server sends a snapshot every 0.1 s (10 Hz) on an `UnreliableRemoteEvent`. Developers describe both; choose B when slows and stuns are common. [S20][S21]
3. Snapshot format: a `buffer` of 4 bytes per enemy: `u16 id`, `u16 dist` in 1/16-stud units (a path up to 4,095 studs; use `u32` if longer). 250 enemies fit under the 1,000-byte limit; split into several fires if more. [S2][S3][S5]
4. Clients keep a table `id -> model`, clone the visual rig from `ReplicatedStorage`, convert `dist` to a CFrame along the same waypoints and `Lerp` toward it each frame; they do not need physics. Because unreliable events can drop, every snapshot must be self-contained (absolute `dist`, not a delta).
5. Cull far-away or off-screen enemies' animations on the client (Aniverse reports frustum culling for 100+ animated units at about 90 FPS) [S43]; use `PrimaryPart:PivotTo` for movement [S22].
Pitfalls: sending CFrames (12 floats) or table payloads; assigning positions through server Parts (Astro Force version 1 cost about 600 KB/s per 100 units) [S21]; Atomic streaming settings that stream your gameplay models out (set `ModelStreamingMode` Atomic or Persistent for the base and path) [S7]; buffer-over-remote support should be checked in your Studio version (see Open questions).

### Recipe 4: Tower placement (client preview, server authority)
When to use: free-placement TD; for slot-based (Kingdom Rush style) skip the raycast and use pre-placed `Slot` parts.
Steps:
1. Client: on selecting a tower, create a local ghost model (`CanCollide=false`, `Transparency=0.5`), raycast each frame with `workspace:Raycast` from the camera via `ViewportPointToRay`, excluding the ghost; snap to a 1 or 2 stud grid; tint green or red; draw a range circle (a flat cylinder Part sized `range*2`). [S35]
2. Client fires `PlaceTower(towerId, cframe)` once on confirm.
3. Server validates: the player owns the tower in their loadout; cash >= cost; per-type limit and total limit not reached (for example 5 per type and 15 total as in the sample repo [S44]); the point lies in a `BuildZone` part (use `GetPartBoundsInBox` with an OverlapParams `Include` filter); no overlap with the path or other towers (`GetPartBoundsInBox` with the tower footprint against the `Towers` folder); distance from the player's character under a sanity limit; rate limit (one placement per 0.1 s per player). Deduct cash on the server only.
4. Create the tower model on the server (anchored), tag it with the owner's UserId as an Attribute, store `{def, level, lastShot, targetMode}` in the `Towers` table, and tell clients with a reliable event.
5. Sell refund: 70% of total invested (a sourced pattern from TDS). [S72]
Pitfalls: trusting the client position; letting towers overlap the path; free placement on any surface (large towers on tiny parts); forgetting to refund when a player leaves (give their cash back to the team or remove their towers per your rule).

### Recipe 5: Tower targeting and attack loop
When to use: any tower that shoots.
Steps:
1. One central loop. Each tower has `nextShot` (os.clock based). Each Heartbeat, for towers where `now >= nextShot`, pick a target, apply damage, set `nextShot = now + cooldown`. Do not use `task.wait` per tower. [S31]
2. Pick targets by path progress: among enemies within range keep the largest `dist` for First, smallest for Last, largest `hp` for Strongest, smallest for Weakest, nearest for Closest. Retarget only when the target is dead or out of range, or at most every 1 to 2 s. [S31][S32]
3. Range test: with enemies as data, compare squared distance first; with up to a few hundred enemies and tens of towers a plain loop is enough (heuristic; profile with the MicroProfiler). Above that, bucket enemies into a uniform grid rebuilt once per frame (cell size about the largest tower range); one project reports a 3 to 4x gain at 1,000 to 20,000 enemies. [S44]
4. If enemies are real Parts (not recommended), `workspace:GetPartBoundsInRadius(pos, range, params)` with an `OverlapParams` that includes only the `Enemies` folder and sets `MaxParts`; otherwise use data. [S1][S27]
5. Damage pipeline: raw damage -> defense percentage (Armored 50%, Hazmat 60% in TDS) -> immunities (a Hidden enemy is only hit by detection towers) -> shield -> health. Keep this in one function. [S74]
6. For splash, find enemies within a radius of the target (Anime Vanguards Splash tag: 20 studs); for slows, store `slowUntil` and a multiplier on the enemy table. [S84]
Pitfalls: a magnitude loop per tower per enemy per frame (O(N x M)); targeting by distance to the tower instead of path progress; updating the HP bar through a server Instance for every hit (send damage numbers batched or on the client); damage applied from a client message.

### Recipe 6: Waves as data, hand-authored or budgeted
When to use: all modes; hand tables for tutorials and bosses, budgets for endless.
Steps:
1. Enemy defs in `Config.Enemies`: `{name, hp, speed, defense, flying, hidden, immunities, onDeath, killCash, leakDamage, unlockWave, cost, weight}`. Start with five enemy roles: Normal, Fast (about 1.8x speed, half HP), Tank (about 5x HP, 25% to 50% defense), Hidden (needs detection), Boss (about 75x to 100x Normal HP in an early mode; see the TDS ladder). [S74]
2. Hand-author waves 1 to 10 as `{ {enemy="Normal", count=8, interval=0.9}, ... }` so the first minutes teach one trait at a time; introduce one new enemy trait every 3 to 5 waves; boss every 5 or 10 waves. [S52]
3. For later waves use the budget method: `budget = 90 + 15*wave`, repeatedly pick a random affordable enemy by `weight` among `unlockWave <= wave`, subtract `cost`; boss waves override. [S42]
4. Give the wave bonus as a linear function (for example `100 + 40*wave`, or the TDS-like `200 + 160*(wave-1)` per wave scaled by 0.9 per extra player) and a smaller kill cash; end waves with a clear bonus. Post a "next wave" button that pays gold per second skipped (Kingdom Rush). [S46]
5. Add a late-game rule: after a threshold wave, freeze the enemy count and let health growth slow or fall (Summer Zombies mode) so Endless has a finite skill ceiling. [S86]
Pitfalls: enemies that cost nothing in the budget; identical waves; a second boss type that requires a tower the player cannot own yet; no rest waves (BTD6 has round 20 weaker than round 10). [S49]

### Recipe 7: Match economy and a balance check you can run
When to use: before content is built, and again after every tuning change.
Steps:
1. Define towers as `{cost, upgrades={cost1,cost2,...}, dps per level}`. Each upgrade step costs 1.5x to 2.5x the previous and gives a smaller relative DPS gain (creation.dev says each tier roughly doubles the cost). [S52]
2. Define an economy tower: placement about 40% to 60% of a basic DPS tower, income per wave doubling or tripling over 2 or 3 upgrades, payback 2 to 4 waves (TDS Farm; PvZ Sunflower). [S72][S48]
3. Script the check (any language): for each wave compute `totalHP = sum(count*hp)`, `requiredDPS = totalHP / exposureSeconds`, `cumCash` from start cash plus bonuses plus kill cash, `affordableDPS = spendShare * cumCash / costPerDps`. Print the ratio. Target: well above 1 early, about 1.4 to 2.5 by wave 20 to 25 of 30, and below 1 only at the last boss. In my own model the ratio fell 15.3, 10.0, 6.4, 3.9, 2.4, 1.4, 0.8 at waves 1, 5, 10, 15, 20, 25, 30. [S45]
4. Move numbers into `Config` (or Roblox Configs) so they can be tuned live. Log per-wave leaks and per-run clear rate in telemetry (Recipe 17).
5. Add sinks for the late game: evolved or "ultimate" upgrades costing 10x to 100x the base tower (Juggernaut $532,000 total) so surplus cash always has a use. [S77]
Pitfalls: kill cash larger than the wave bonus (players farm kills and ignore economy towers); income unlimited by slot cap; selling for 100% (enables exploit loops; TDS refunds 70%).

### Recipe 8: Enemy special mechanics (trait system)
When to use: any mode beyond the first ten waves.
Steps:
1. Trait flags in the def: `defense` (0 to 1), `immune={Stun=true, Freeze=true, Burn=true}`, `hidden`, `flying`, `onDeath={spawn="Breaker2", count=1}`, `summon={every=8, type="Skeleton", count=5}`, `towerAttack={range, cooldown, stun=8}`, `laneSwitch`. [S74]
2. Process in the central loop: on death, spawn child enemies at the parent's `seg/t` (so they continue from there); summoner timers; tower attackers pick a tower in range and set `tower.disabledUntil`.
3. Counters: ensure at least one tower per role can answer each trait (single target for bosses, splash for swarms, slow for fast, detection for hidden, anti-air for flying). Use the "four jobs" check on your tower list. [S51]
4. Telegraph: a short animation and a UI warning for boss abilities (tower stun 8 s in TDS is long; use 3 to 5 s as a starting value, heuristic).
Pitfalls: immunity to every control effect on every boss (players have no counterplay); child enemies that inherit the parent's `dist` incorrectly (leak instantly); summons without a cap.

### Recipe 9: Co-op lobby to reserved-server match with player scaling
When to use: matches of 1 to 4 players with a lobby.
Steps:
1. Lobby place: elevators or portals per map and difficulty; a party forms by touching or a UI queue; the server collects players and creates a reserved server with `TeleportOptions.ShouldReserveServer = true`, `SetTeleportData({map=..., mode=..., loadout=...})`, then `TeleportService:TeleportAsync(matchPlaceId, players, options)` inside `pcall` with retry; handle `TeleportInitFailed`. Only call from the server. [S8]
2. Match place: read `Player:GetJoinData().TeleportData` to pick the map and difficulty. Do not trust loadouts or currency in TeleportData (visible to the client); re-load from DataStore. [S8]
3. Scale: set `playerCount`, enemy HP multiplier (1.0, 1.15, 1.25, 1.4 for 1 to 4; sourced from TDS Fallen), wave bonus factor (1 - 0.1 x (n-1) on Easy-like modes) or split kill cash by damage dealt. [S119][S44]
4. Late joiners: allow within the first 3 waves only (heuristic) and send them a full state snapshot; on `Players.PlayerRemoving` keep their towers for a grace period or sell them and redistribute cash.
5. Return to lobby with `TeleportAsync` after Victory or Defeat; grant rewards before teleporting.
Pitfalls: teleporting a stale party; storing match cash in a DataStore (match cash is session-only; meta currency only); trusting `TeleportData` for currency.

### Recipe 10: Meta progression: unlockable towers, levels, evolution and a disclosed gacha
When to use: after the core loop is fun in a 10-minute match.
Steps:
1. Meta currencies: Coins from regular modes, Gems from the hardest mode (TDS), per-run EXP; towers unlock by coins or level; a loadout of 5 to 6 slots chosen in the lobby. [S75][S77]
2. Gacha banner (if used): `Config.Banners = { {name="Standard", cost=50, rates={Rare=0.75, Epic=0.2, Legendary=0.04, Mythic=0.01}, pity={Legendary=50, Mythic=400}} }`; rates must sum to exactly 1.0 and must be displayed as percentages in a details pop-up. Roll on the server with `Random` and a pity counter in the player's saved data. [S9][S79]
3. Gate by `PolicyService` (see snippet): restricted players get a direct-purchase or free path instead. [S9]
4. Evolution: base tower level 20 plus coins plus gems; offer a Robux skip but price it as a convenience (499 Robux in TDS), never the only route. [S77]
5. Traits (optional): a random modifier layer with reroll tokens from events and codes; keep a bounded range (+50% damage at the top trait in Anime Vanguards) and a pity counter. [S81][S87]
6. Save with the DataStore patterns from note 04 (UpdateAsync, session lock); grant gems and evolution only on the server.
Pitfalls: odds that do not total 100%; a client-side roll; pity counters reset on rejoin (save them); a gacha-only path to every strong unit (pay-to-win backlash).

### Recipe 11: Difficulty ladder and reward table
When to use: every game with more than one map.
Steps:
1. Table: `Easy 20 waves`, `Normal 30`, `Hard 40 (level gate)`, `Hardcore 45 (consumables disabled, 1 to 3 players, gems)`, `Endless`. [S75]
2. Each mode has its own enemy HP multiplier (roughly x2 to x4 per mode step; heuristic), starting cash (tighter on harder modes), wave table and reward currency. Fallen is described as having "fewer starting coins and more expensive upgrades". [S76]
3. Gate by account level (TDS: level 5, 15, 30, 50) and by a "triumph" flag from the previous mode (Voidcore needs a Hardcore triumph). [S75]
4. Add a secret time challenge for the best players (TDS Hidden Wave: wave 40 of Fallen inside 1,009 s). [S118]
5. A Challenge mode that rotates weekly with fixed loadouts and modifiers. [S75]
Pitfalls: level gates that stop a new player from the second match; hard modes that pay only gems with no coin fallback; no way to retry quickly.

### Recipe 12: Limited event mode with its own currency
When to use: each season or update; the proven re-engagement tool.
Steps:
1. A separate mode or map flagged `Event=true` with a unique currency (for example "Event Tokens") that is banked permanently at milestone waves (20, 30, 40...), regardless of whether the run is won. [S86]
2. A level track of about 50 levels with one-time rewards (the Summer mode gave 1,030 shards and 1,030 rerolls over 50 levels) and an event shop that sells limited units for the event currency. [S86]
3. Zone or area purchases with Yen (5,000, then 40,000 to 300,000) as an in-run sink, and a spawn surge every 20 waves as a periodic pressure spike. [S86]
4. End of event: stop the currency, keep the earned items, and retire exclusive towers into the "Exclusive" group (TDS has 22 Exclusive towers). [S77]
5. Use a developer admin or live event on a fixed day (Saturdays) for the hybrid genre. [S66][S91]
Pitfalls: event currency that also buys permanent power at a bad rate; no catch-up; an event ending without notice.

### Recipe 13: Base-building wave defense (character on the field)
When to use: archetype 4 or 5 (build ur base, Superbox Siege Defense, Hunty Zombie).
Steps:
1. Rounds: a build phase (30 to 60 s, heuristic) where players place walls, spikes and turrets with cash, then a wave phase where enemies path toward the base core or the nearest structure; boss waves at 25, 50, 75 and 100 as in build ur base. [S95]
2. Player weapons: a tool that raycasts hits server-side (use `workspace:Raycast` from the server using the player's reported aim, validated by distance and rate), with upgrades bought from a shop with prices that rise per purchase (Zombie Attack). [S106]
3. Lives: two lives per wave and one on respawn, or revive by teammates (Superbox Siege Defense: everyone respawns at the start of a wave with one life left). [S105]
4. Structures have health; enemies target structures with `ClosestStructure` or `Core`; repair costs cash; keep a cash reserve (a guide's advice: 20 to 30% unspent). [S95]
5. Servers of 6 (build ur base, Mini War) or up to 40 (Hunty Zombie) with parties of up to 6. [S60][S62]
6. Zombie or enemy movement for up to about 40 enemies can use `Humanoid` with `PathfindingService` (set `SetStateEnabled` for unused states, `SetNetworkOwner(nil)` on the server for each NPC to keep them server-owned); for hundreds use the data-only approach from Recipes 2 and 3. [S6][S10][S11][S37]
Pitfalls: client-owned NPCs (exploit risk); structures that block the path entirely (let enemies attack walls or use a path Costs table that makes walls expensive but not blocking); repetition after 15 to 20 minutes (add boss variety and objectives). [S40]

### Recipe 14: RTS-lite (economy, army, unit cap)
When to use: archetype 7; best for a tight 4 to 6 player map.
Steps:
1. Economy buildings that pay per second or per minute (Mini Empires: core 500, farm 700, oil pump 2,300 as per-minute-type values; show an income-per-minute stat). [S41]
2. Unit production from barracks buildings with a population cap (30 to 40; heavy units take 3 population) and a build queue; units are server data with positions, rendered by clients (Recipe 3). [S41][S22]
3. Selection: a client drag box using `GetPartBoundsInBox` or screen-space tests against unit positions; commands go to the server as one RemoteEvent `Command(unitIds, targetPosition)` and the server validates ownership and cap. [S22]
4. Pathfinding: flow field from one goal (FastFlow, or a custom BFS on a grid) for groups moving to a shared target; per-unit `PathfindingService` only for a few units; recompute at most every 5 frames. [S22][S25][S26]
5. Target acquisition with a spatial grid (swarm module) rather than all-pairs; separation by a simple repulsion in the data loop. [S22]
6. Win condition: destroy the enemy core (Mini War, Mini Empires). Keep matches under 20 to 25 minutes, the sourced average playtime of the two top RTS-lites. [S63][S64]
7. Optional fog of war: an 8x8 stud grid with team visibility reference counts; avoid one PointLight per cell if FPS matters (20% to 30% cost in Astro Force). [S24]
Pitfalls: Roblox default replication for hundreds of moving unit Parts (Astro Force: about 600 KB/s per 100 units; another team saw 10,000 ms latency at 300 to 500 units). [S21][S23]

### Recipe 15: PvP lane-send mode
When to use: a competitive variant of a TD (Tower Battles, TDS PvP).
Steps:
1. Two lanes (or one mirrored path) with separate bases; each team has cash and a send menu: `Send Fast (cost 100)`, `Send Tank (cost 400)`. Sent enemies pay income to the sender (an income that rises with the cost of what was sent; heuristic) and walk the other team's path.
2. Waves repeat (TDS PvP is 31 waves that repeat), and a match ends when a base reaches 0 or a time limit expires. [S75]
3. 1v1 or 2v2 up to 6 players; matchmaking by a simple rating and a team cash bonus for the weaker side; tower caps lower than PvE (Minigunner 12 in PvP, unlimited in PvE). [S73][S109]
4. Lobby timers: show the next send cost and a cooldown to avoid spam sends.
Pitfalls: a single send that wins the game; no defence against sends (give sent enemies a visible 3 to 5 s warning); rating exploits with alts.

### Recipe 16: Plant-lane idle hybrid (Plants & Brainrots style)
When to use: when you want the 2025 hit's loop with one new mechanic.
Steps:
1. A 5-player server; each player has a garden (a strip of 5 lanes or a grid; cap 35 plants). Enemies walk lanes toward the garden. [S90][S92]
2. Seed shop with a timer (5 minutes; instant restock 80 Robux), stock chances by rarity so common seeds are guaranteed and rare seeds rotate; a separate gear shop (water buckets $7,500, restock about 2 minutes). [S89][S119]
3. Plants with base damage and price from the table above (start with `Cactus 10 / $200`, `Strawberry 25 / $1,250`, `Pumpkin 55 / $5,000`); money from kills; rebirth gives +50% money and luck per tier. [S89][S91]
4. Weekly update with a developer or admin event that spawns rare items on a fixed Saturday. [S91][S92]
5. Required new mechanic for 2026 novelty: for example a lane switch, a card deck, or a day/night cycle. Combine one proven loop with one new mechanic.
6. Odds on the seed shop (if Robux restock gives random stock) follow the paid-random-item rules. [S9]
Pitfalls: price curves that make mid plants pointless (see the $/damage table); no shop timer visible to the player; offline loss.

### Recipe 17: Telemetry and live tuning for a TD
When to use: from the first public playtest.
Steps:
1. Log per match: mode, wave reached, leaks per wave, time per wave, cash at wave end, towers placed by type, party size. Log per player: D1/D7/D30 (Creator Analytics), session length, summons made.
2. Targets from note 03: D1 median about 10% (p75 13%) across large Roblox games; use the Creator Dashboard genre benchmark. Keep a TD matches-per-player count, and a wave-at-defeat histogram; a spike at one wave is a balance bug.
3. Read the histogram weekly and change only `Config` numbers; version the `Config` and record the change with the date.
4. Anti-exploit: log suspicious placement rates, cash jumps and impossible tower positions; rate-limit every remote.
Pitfalls: tuning from three anecdotes; changing multiple numbers at once.

## Luau reference snippets
All APIs below appear in the cited docs or are standard. Each snippet is a sketch to adapt.

```lua
--!strict
-- Waypoints and enemy stepping (server). Path folder: Parts named "1","2",... in order.
local RunService = game:GetService("RunService")

local pathFolder = workspace:WaitForChild("Map"):WaitForChild("Path")
local wp: {Vector3} = {}
for i = 1, #pathFolder:GetChildren() do
	local part = pathFolder:FindFirstChild(tostring(i))
	assert(part and part:IsA("BasePart"), "missing waypoint " .. i)
	wp[i] = part.Position
end
local segLen: {number} = {}
local cum: {number} = {} -- distance at start of segment i
local total = 0
for i = 1, #wp - 1 do
	segLen[i] = (wp[i + 1] - wp[i]).Magnitude
	cum[i] = total
	total += segLen[i]
end

export type Enemy = {
	id: number, typeId: string, hp: number, maxHp: number,
	speed: number, speedMul: number, seg: number, t: number, dist: number,
}

local enemies: {[number]: Enemy} = {}
local nextId = 0

local function spawn(typeId: string, hp: number, speed: number): Enemy
	nextId += 1
	local e: Enemy = { id = nextId, typeId = typeId, hp = hp, maxHp = hp, speed = speed, speedMul = 1, seg = 1, t = 0, dist = 0 }
	enemies[e.id] = e
	return e
end

-- returns true if the enemy reached the base
local function step(e: Enemy, dt: number): boolean
	local move = e.speed * e.speedMul * dt
	while move > 0 do
		local len = segLen[e.seg]
		local remaining = len * (1 - e.t)
		if move >= remaining then
			move -= remaining
			e.seg += 1
			e.t = 0
			if e.seg > #segLen then
				e.dist = total
				return true
			end
		else
			e.t += move / len
			move = 0
		end
	end
	e.dist = cum[e.seg] + e.t * segLen[e.seg]
	return false
end

local function position(e: Enemy): Vector3
	return wp[e.seg]:Lerp(wp[e.seg + 1], e.t)
end

RunService.Heartbeat:Connect(function(dt: number)
	for id, e in enemies do
		if step(e, dt) then
			enemies[id] = nil
			-- subtract base health here
		end
	end
end)
```

```lua
--!strict
-- Snapshot of enemies as a packed buffer: 4 bytes each (u16 id, u16 dist in 1/16 stud).
local function encode(list: {Enemy}): buffer
	local b = buffer.create(#list * 4)
	for i, e in list do
		local o = (i - 1) * 4
		buffer.writeu16(b, o, e.id % 65536)
		buffer.writeu16(b, o + 2, math.clamp(math.floor(e.dist * 16 + 0.5), 0, 65535))
	end
	return b
end
-- Server: snapshotRemote:FireAllClients(encode(list)) at 10 Hz in chunks of <= 250 enemies
-- (1,000-byte UnreliableRemoteEvent limit). Client: read with buffer.readu16 and Lerp models toward the CFrame at that dist.
```

```lua
--!strict
-- Targeting by path progress with a plain loop (use a grid bucket when enemies are in the thousands).
type Mode = "First" | "Last" | "Strongest" | "Weakest" | "Closest"

local function pickTarget(origin: Vector3, range: number, mode: Mode, enemies: {[number]: Enemy}, positions: (Enemy) -> Vector3): Enemy?
	local best: Enemy? = nil
	local bestScore = -math.huge
	local r2 = range * range
	for _, e in enemies do
		local d = positions(e) - origin
		local d2 = d.X * d.X + d.Y * d.Y + d.Z * d.Z
		if d2 <= r2 then
			local score: number
			if mode == "First" then score = e.dist
			elseif mode == "Last" then score = -e.dist
			elseif mode == "Strongest" then score = e.hp
			elseif mode == "Weakest" then score = -e.hp
			else score = -d2 end
			if score > bestScore then
				bestScore = score
				best = e
			end
		end
	end
	return best
end
```

```lua
--!strict
-- Server-side placement check using spatial queries on tagged zones and towers.
local CollectionService = game:GetService("CollectionService")

local function canPlace(cf: CFrame, footprint: Vector3, towersFolder: Instance): boolean
	local zoneParams = OverlapParams.new()
	zoneParams.FilterType = Enum.RaycastFilterType.Include
	zoneParams.FilterDescendantsInstances = CollectionService:GetTagged("BuildZone")
	if #workspace:GetPartBoundsInBox(cf, Vector3.new(footprint.X, 1, footprint.Z), zoneParams) == 0 then
		return false -- not on a build zone
	end
	local blockParams = OverlapParams.new()
	blockParams.FilterType = Enum.RaycastFilterType.Include
	blockParams.FilterDescendantsInstances = { towersFolder, workspace.Map.Path }
	blockParams.MaxParts = 1
	return #workspace:GetPartBoundsInBox(cf, footprint, blockParams) == 0
end
```

```lua
--!strict
-- Budgeted wave generation (data-driven; mirrors the open-source wave-core approach).
type EnemyDef = { name: string, cost: number, weight: number, unlockWave: number }

local function buildWave(wave: number, defs: {EnemyDef}, rng: Random): {string}
	local budget = 90 + 15 * wave
	local list: {string} = {}
	while true do
		local pool: {EnemyDef} = {}
		local totalW = 0
		for _, d in defs do
			if d.unlockWave <= wave and d.cost <= budget then
				table.insert(pool, d)
				totalW += d.weight
			end
		end
		if #pool == 0 then break end
		local roll = rng:NextNumber() * totalW
		for _, d in pool do
			roll -= d.weight
			if roll <= 0 then
				table.insert(list, d.name)
				budget -= d.cost
				break
			end
		end
	end
	return list
end
```

```lua
--!strict
-- Gacha roll with pity. rates must sum to 1; pity counters live in saved player data.
type Banner = { cost: number, rates: {[string]: number}, pity: {[string]: number} }
type Pity = {[string]: number} -- rarity -> pulls since last

local ORDER = { "Mythic", "Legendary", "Epic", "Rare" } -- check best rarity first

local function roll(banner: Banner, pity: Pity, rng: Random): string
	for _, rarity in ORDER do
		local limit = banner.pity[rarity]
		if limit and (pity[rarity] or 0) + 1 >= limit then
			for r in pity do pity[r] = (pity[r] or 0) + 1 end
			pity[rarity] = 0
			return rarity
		end
	end
	local x = rng:NextNumber()
	local acc = 0
	local result = "Rare"
	for _, rarity in ORDER do
		acc += banner.rates[rarity] or 0
		if x <= acc then result = rarity break end
	end
	for r in pity do pity[r] = (pity[r] or 0) + 1 end
	if pity[result] then pity[result] = 0 end
	return result
end
-- Show banner.rates as percentages in a labelled "Details" pop-up before the purchase.
```

```lua
--!strict
-- Gate paid random items by policy, then teleport a party to a reserved server.
local PolicyService = game:GetService("PolicyService")
local TeleportService = game:GetService("TeleportService")

local function randomItemsAllowed(player: Player): boolean
	local ok, info = pcall(function()
		return PolicyService:GetPolicyInfoForPlayerAsync(player)
	end)
	if not ok then return false end
	return not info.ArePaidRandomItemsRestricted
end

local function startMatch(players: {Player}, matchPlaceId: number, map: string, mode: string)
	local options = Instance.new("TeleportOptions")
	options.ShouldReserveServer = true
	options:SetTeleportData({ map = map, mode = mode }) -- non-secure data only
	for attempt = 1, 3 do
		local ok, err = pcall(function()
			TeleportService:TeleportAsync(matchPlaceId, players, options)
		end)
		if ok then return end
		warn("teleport failed", err)
		task.wait(1)
	end
end
```

## Open questions / unverified
- Fandom wikis (TDS, Anime Vanguards, Zombie Attack, Plants & Brainrots, Tower Defense X) returned HTTP 402 and NamuWiki 403, so the TDS Fandom per-wave cash and health tables, Fallen mode wave-by-wave composition and kill cash were not read; the enemy health ladder comes from one SEO site [S74] and conflicts with a second source on early values [S102]. Starting cash, Farm unlock cost and Casual wave count conflict across TDS sources.
- No developer talk or interview was found for Anime Vanguards, Toilet Tower Defense, Plants & Brainrots, Garden Tower Defense, build ur base, Mini War or Hunty Zombie. All their economy numbers are third-party. No RDC talk on tower defense engineering was found; the engineering evidence is devforum threads and repos.
- Anime Defenders peak CCU is reported as 142K, 202K and 380.5K by three sites. Universal Tower Defense current players read 128 on Rolimons and 88.5K in a search snippet.
- The odds listed for Anime Vanguards (sum 100.08%) and Anime Adventures (100.15%) are internally inconsistent in third-party guides; real in-game odds were not checked.
- The Goal Defense wave-size formula could not be reproduced from the page summary I received; only its inputs are used.
- Whether `buffer` values can be sent as RemoteEvent and UnreliableRemoteEvent arguments in the current engine was not confirmed in the docs I read (the remote docs I fetched do not list the allowed argument types); the Aniverse framework claims bit-packed networking [S43]. Test a one-line buffer send in Studio before relying on Recipe 3; fallback is `buffer.tostring` or packed numbers.
- The claim that a uniform-grid broad phase is 3 to 4x faster at 1,000 to 20,000 enemies comes from a GitHub PR summary, one project, not a measurement I made [S44]. Nobody posted a benchmark of `GetPartBoundsInRadius` vs a magnitude loop in the thread I read [S28].
- TDX "hundreds of enemies at 60 FPS" is a wiki claim; its replication method is not published beyond the lead programmer's earlier Astro Force write-up.
- The SpongeBob Tower Defense "six weeks, four people, 52 weekly updates" claim is carried from note 10 and was not confirmed by the sources read here.
- Dead Rails as Best Strategy 2025 and the full 2025 list come from search summaries; the 2026 list comes from the official Roblox newsroom page [S15].
- Fallen mode HP scaling by player count (+15%, +25%, +40%) and the Hidden Wave 1,009 s rule are search summaries of Fandom pages.
- The survival-wave games (Zombie Attack, Hunty Zombie, Superbox Siege Defense) have no wave-by-wave enemy or cash tables in readable sources.
- RTS-lite economy values for Mini War (building costs, unit costs) were not published in readable sources.

## Sources
Trust key: (F) first-party Roblox; (D) developer-written (devforum or repo); (T) third-party; (S) search summary only, page not fetched.
[S1] WorldRoot class reference, Roblox, accessed 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/WorldRoot (F)
[S2] Remote events and callbacks (UnreliableRemoteEvent limits), Roblox docs, accessed 2026-10-04, https://create.roblox.com/docs/scripting/events/remote (F)
[S3] UnreliableRemoteEvent class reference, Roblox, accessed 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/UnreliableRemoteEvent (F)
[S4] Parallel Luau (multithreading), Roblox docs, accessed 2026-10-04, https://create.roblox.com/docs/scripting/multithreading (F)
[S5] buffer library reference, Roblox, accessed 2026-10-04, https://create.roblox.com/docs/reference/engine/libraries/buffer (F)
[S6] PathfindingService class reference, Roblox, accessed 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/PathfindingService (F)
[S7] Instance streaming, Roblox docs, accessed 2026-10-04, https://create.roblox.com/docs/workspace/streaming (F)
[S8] Teleporting between places and reserved servers, Roblox docs, accessed 2026-10-04, https://create.roblox.com/docs/projects/teleporting (F)
[S9] Paid random items policy, Roblox docs, accessed 2026-10-04, https://create.roblox.com/docs/production/monetization/paid-random-items (F)
[S10] Humanoid class reference (MoveTo, SetStateEnabled), Roblox, accessed 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Humanoid (F)
[S11] Network ownership, Roblox docs, accessed 2026-10-04, https://create.roblox.com/docs/physics/network-ownership (F)
[S12] RunService class reference, Roblox, accessed 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/RunService (F)
[S13] TweenService class reference, Roblox, accessed 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/TweenService (F)
[S14] CFrame data type (Lerp), Roblox, accessed 2026-10-04, https://create.roblox.com/docs/reference/engine/datatypes/CFrame (F)
[S15] 2026 Roblox Innovation Awards Showcase What's Possible on Roblox, Roblox Newsroom, 2026-09-12, https://about.roblox.com/newsroom/2026/09/2026-roblox-innovation-awards (F)
[S16] Creator Spotlight: BelowNatural's Journey Building Paradoxum Games, Roblox on devforum, 2024-06-17, https://devforum.roblox.com/t/creator-spotlight-belownatural%E2%80%99s-journey-building-paradoxum-games/3027035 (F; read via search summary and note 03 [S124])
[S17] An In-Depth Guide to a Tower Defense Game [Part 1], XObbyCreatorX, devforum, 2024-06-12, https://devforum.roblox.com/t/an-in-depth-guide-to-a-tower-defense-game-part-1/3019857 (D)
[S18] Creating an enemy movement system for a Tower Defense game, iNexesi and Pat_Wastaken, devforum, 2025-07-23, https://devforum.roblox.com/t/beginner-intermediate-creating-an-enemy-movement-system-for-a-tower-defense-game/3836680 (D)
[S19] Tower Defense smooth enemy movement, eplcmoon and replies, devforum, 2023-08-31, https://devforum.roblox.com/t/tower-defense-smooth-enemy-movement/2571665 (D)
[S20] What would be the best way to handle enemies in a tower defense game?, Eezby and others, devforum, 2021-10-20, https://devforum.roblox.com/t/what-would-be-the-best-way-to-handle-enemies-in-a-tower-defense-game/1517403 (D; stale, principle-level)
[S21] How we reduced bandwidth usage by 60x in Astro Force (Roblox RTS), Atrazine, devforum, 2021-05-03, https://devforum.roblox.com/t/how-we-reduced-bandwidth-usage-by-60x-in-astro-force-roblox-rts/1202300 (D; stale 2021 but widely confirmed)
[S22] How we are developing an RTS game with good performance for more than 200+ units, WoloPoints, devforum, 2024-12-01, https://devforum.roblox.com/t/how-we-are-developing-an-rts-game-with-good-performance-for-more-than-200-units/3281168 (D)
[S23] Extreme latency on 300+ units (~10k ms), pxrplewater and replies, devforum, 2025-02-10, https://devforum.roblox.com/t/extreme-latency-on-300-units-10k-ms/3462416 (D)
[S24] Fog of War in Astro Force (RTS), Atrazine, devforum, 2021-07-11, https://devforum.roblox.com/t/fog-of-war-in-astro-force-rts/1342996 (D; stale)
[S25] FastFlow, bob_factory, devforum, 2024-12-01, https://devforum.roblox.com/t/fastflow-fast-flowfield-generation-for-performant-swarm-pathfinding/3280348 (D)
[S26] Custom Swarm Pathfinding, bob_factory, devforum, 2024-11-04, https://devforum.roblox.com/t/custom-swarm-pathfinding/3246144 (D)
[S27] Best spatial query for a tower defense game with set pre-defined paths, devforum, 2024-11 (replies 11-03 to 11-08), https://devforum.roblox.com/t/best-spatial-query-for-a-tower-defense-game-with-set-pre-define-paths/3245263 (D)
[S28] GetPartBoundsInRadius() vs Loop Magnitude Checks, devforum, 2024-10-14, https://devforum.roblox.com/t/getpartboundsinradius-vs-loop-magnitude-checks/3194219 (D; no benchmark)
[S29] Optimization in a Tower Defense?, Geomaster and replies, devforum, 2022-05-24, https://devforum.roblox.com/t/optimization-in-a-tower-defense/1804154 (D)
[S30] How can I optimize tower defense game?, devforum, 2024-11-12, https://devforum.roblox.com/t/how-can-i-optimize-tower-defense-game/3256325 (D)
[S31] How can I optimize a tower defense game targeting system?, p3rf1n1ty and Eestlane771, devforum, 2020-12-04, https://devforum.roblox.com/t/how-can-i-optimize-a-tower-defense-game-targeting-system/905524 (D; stale, principle-level)
[S32] How to optimize tower system, devforum, 2024-02-10 to 2024-03-30, https://devforum.roblox.com/t/how-to-optimize-tower-system/2830931 (D)
[S33] Help me optimize the enemies in my tower defense game!, devforum, 2024-07-03, https://devforum.roblox.com/t/help-me-optimize-the-enemies-in-my-tower-defense-game/3051325 (D)
[S34] Tower Defense Game! [DEVLOG], TackJum, devforum, 2024-03-31, https://devforum.roblox.com/t/tower-defense-game-devlog/2863915 (D)
[S35] TD Placement Raycasting, devforum, 2023, https://devforum.roblox.com/t/td-placement-raycasting/2622433 (D)
[S36] Tower Defense Game Creation, SimonEnderB and others, devforum, 2021-12 to 2022-01, https://devforum.roblox.com/t/tower-defense-game-creation/1607187 (D; stale)
[S37] Tower Defense: Enemy System, devforum, 2023, https://devforum.roblox.com/t/tower-defense-enemy-system/2667346 (D)
[S38] Game Optimization - Tower Defense - Buffers / Shared Tables - Astro Force Like Optimization, devforum, 2024-08-10, https://devforum.roblox.com/t/game-optimization-tower-defense-buffers-shared-tables-astro-force-like-optimization/3111900 (D)
[S39] Roblox tower defense - devlog, superalexthe13, devforum, 2026-09-25, https://devforum.roblox.com/t/roblox-tower-defense-devlog/4893970 (D; hobby project, shows common scoping and rig-clothing blockers)
[S40] Wave Defense Game where you can build your own base, PenguinDoc9999, devforum, 2019-12-13, https://devforum.roblox.com/t/wave-defense-game-where-you-can-build-your-own-base/407010 (D; stale, 2019)
[S41] Mini Empires v0.6.0 changelog, devforum Bulletin Board, 2024-08-09, https://devforum.roblox.com/t/mini-empires-v060-changelog/3110422 (D)
[S42] wave-core-framework, Jose988194, GitHub, accessed 2026-10-04, https://github.com/Jose988194/wave-core-framework (D)
[S43] Roblox-Aniverse-Framework, Arctxrus, GitHub, accessed 2026-10-04, https://github.com/Arctxrus/Roblox-Aniverse-Framework (D; developer claims, not independently measured)
[S44] tower_defense (Roblox multiplayer prototype) by titanzerg, and pull request #66 "Add a broad-phase spatial index for tower targeting" in sw8566eq/td, GitHub, accessed 2026-10-04, https://github.com/titanzerg/tower_defense and https://github.com/sw8566eq/td/pull/66 (D; the PR figure is a search summary)
[S45] Balance in td-games - Goal Defense, Alexandra Sidorina, Game Developer, 2013-06-05, https://www.gamedeveloper.com/design/balance-in-td-games (design article; older than 2024)
[S46] Kingdom Rush - the wonderful Campaign level design, David Harlow, Game Developer, 2013-10-25, https://www.gamedeveloper.com/design/kingdom-rush---the-wonderful-campaign-level-design (older than 2024)
[S47] GDC 2012: 10 tutorial tips from Plants vs. Zombies creator George Fan, Tom Curtis, Game Developer, 2012-03-09, https://www.gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan (older than 2024)
[S48] Sunflower, Plants vs. Zombies Wiki (wiki.gg), accessed 2026-10-04, https://plantsvszombies.wiki.gg/wiki/Sunflower (T)
[S49] List of rounds in BTD6, Blooncyclopedia, accessed 2026-10-04, https://www.bloonswiki.com/List_of_rounds_in_BTD6 (T)
[S50] Rounds (BTD6) and Money, Bloons Wiki (Fandom), accessed 2026-10-04, https://bloons.fandom.com/wiki/Rounds_(BTD6) (T; search summary, fetch blocked)
[S51] Tower Types and What They Counter, Reign Creative, 2026-09-15, https://reigncreativellc.com/blog/tower-types-and-what-they-counter/ (T)
[S52] How to Make a Tower Defense Game on Roblox: Complete Developer Guide, creation.dev, 2026-02-17, https://www.creation.dev/learn/how-to-make-tower-defense-roblox (T; heuristics, commercial site)
[S53] How to Make a Tower Defense Game, Abratabia, accessed 2026-10-04, https://www.abratabia.com/game-genres/tower-defense.php (T; conceptual) and the HP polynomial note from Gamasutra-era threads via search summary
[S54] Anime Vanguards: Wrathful Assault, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/16146832113 (T)
[S55] [LEGACY] Toilet Tower Defense, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/13775256536 (T)
[S56] Tower Defense Simulator, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/3260590327 (T)
[S57] Plants & Brainrots, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/127742093697776 (T)
[S58] [OG] All Star Tower Defense, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/4996049426 (T)
[S59] Universal Tower Defense Z, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/133410800847665 (T)
[S60] Hunty Zombie, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/103754275310547 (T)
[S61] SpongeBob Tower Defense, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/123662243100680 (T)
[S62] build ur base, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/75366259315586 (T)
[S63] Mini War, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/131346454575416 (T)
[S64] Rise of Nations, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/2569453732 (T)
[S65] Mini Empires, Rolimons, accessed 2026-10-04, https://www.rolimons.com/game/11755449133 (T)
[S66] Garden Tower Defense, RoWatcher, accessed 2026-10-04, https://rowatcher.com/games/7703614594/garden-tower-defense (T)
[S67] Anime Defenders, RoWatcher, accessed 2026-10-04, https://rowatcher.com/games/5836869368/anime-defenders (T)
[S68] Anime Defenders, profitable.app (revenue is a model estimate), accessed 2026-10-04, https://profitable.app/roblox/games/anime-defenders (T)
[S69] Is the Brainrot Trend Dying? What CCU Data From Three Top Games Reveals, RoWatcher News, 2026, https://rowatcher.com/news/is-the-brainrot-trend-dying-what-ccu-data-from-three-top-games-reveals (T)
[S70] Tower Defense Roblox Games (October 2026), Bloxed.gg, accessed 2026-10-04, https://bloxed.gg/games/tower-defense (T)
[S71] Top Tower Defense Roblox Games - Current Rankings, Bloxodes, accessed 2026-10-04, https://bloxodes.com/lists/top-trending-roblox-tower-defense-games (T)
[S72] TDS Beginner Guide - Farm Economy and When to Save vs Spend (2026), Dungeonpath, accessed 2026-10-04, https://dungeonpath.com/posts/tower-defense-simulator/beginner-guide/ (T)
[S73] All Tower Defense Simulator Towers: Stats and Costs, towerdefensesimulator.com, accessed 2026-10-04, https://www.towerdefensesimulator.com/towers/ (T)
[S74] TDS Enemies: 75 Tower Defense Simulator Enemies, towerdefensesimulator.com, accessed 2026-10-04, https://www.towerdefensesimulator.com/enemies/ (T)
[S75] Tower Defense Simulator modes, Bloxodes wiki, accessed 2026-10-04, https://bloxodes.com/wiki/tower-defense-simulator/modes (T)
[S76] TDS Fallen mode guide, Dungeonpath, accessed 2026-10-04, https://dungeonpath.com/posts/tower-defense-simulator/fallen-mode-guide/ (T)
[S77] Tower Defense Simulator Tier List (2026), Best Towers After the Enforcer Update, earnaldo.com, 2026-08-19, https://earnaldo.com/blog/tower-defense-simulator-tier-list-2026 (T)
[S78] Tower Defense Simulator Hardcore Guide, tower-defense-simulator.wiki, accessed 2026-10-04, https://tower-defense-simulator.wiki/modes/tower-defense-simulator-hardcore (T)
[S79] Anime Vanguards on Roblox: How to Get and Equip Units, allthings.how, accessed 2026-10-04, https://allthings.how/anime-vanguards-on-roblox-how-to-get-and-equip-units/ (T)
[S80] Anime Vanguards Wiki, animevanguardswiki.wiki, accessed 2026-10-04, https://www.animevanguardswiki.wiki/ (T)
[S81] Anime Vanguards Guide, anime-vanguards-wiki.wiki, accessed 2026-10-04, https://anime-vanguards-wiki.wiki/en/guide/anime-vanguards-guide (T)
[S82] Anime Vanguards Money Units, animevanguardswiki.wiki, accessed 2026-10-04, https://www.animevanguardswiki.wiki/values/anime-vanguards-money-units (T)
[S83] Anime Vanguards, Anime Vanguards Wiki (vanguards.gg), accessed 2026-10-04, https://wiki.vanguards.gg/Anime_Vanguards (T)
[S84] Unit Mechanics, Anime Vanguards Wiki (vanguards.gg), accessed 2026-10-04, https://wiki.vanguards.gg/Unit_Mechanics (T)
[S85] Odyssey, Anime Vanguards Wiki (vanguards.gg), accessed 2026-10-04, https://wiki.vanguards.gg/Odyssey (T)
[S86] Zombies Mode (Summer), Anime Vanguards Wiki (vanguards.gg), accessed 2026-10-04, https://wiki.vanguards.gg/Zombies_Mode_(Summer) (T)
[S87] Universal Tower Defense wiki, universal-tower-defense.com, accessed 2026-10-04, https://universal-tower-defense.com/ (T)
[S88] Universal Tower Defense Review: Strategy, Gacha, and Pure Fun, Vocal Media, accessed 2026-10-04, https://vocal.media/gamers/universal-tower-defense-review-strategy-gacha-and-pure-fun (T)
[S89] Plants vs Brainrots plants list, prices, damage and secret seeds, allthings.how, updated 2025-10-07, https://allthings.how/plants-vs-brainrots-plants-list-prices-damage-and-secret-seeds/ (T)
[S90] All Plants in Plants vs Brainrots, Beebom, 2025-12-23, https://beebom.com/all-plants-in-plants-vs-brainrots/ (T)
[S91] Roblox's Latest Breakout Game is Plants Vs Brainrots, MaxPowerGaming, Oct 2025, https://www.maxpowergaming.co/post/roblox-s-latest-breakout-game-is-plants-vs-brainrots (T)
[S92] Plants vs Brainrots Wiki, plants-vs-brainrots.wiki, accessed 2026-10-04, https://plants-vs-brainrots.wiki/ (T)
[S93] SNACK Defense Progression Guide, snackdefense.wiki, accessed 2026-10-04, https://www.snackdefense.wiki/guide/SNACK-Defense-progression-guide (T)
[S94] Build Base to Survive VERITY: Progression Review, Rouniverse, Aug 2026, https://rouniverse.com/articles/build-base-to-survive-verity-review/ (T)
[S95] Build Ur Base Beginner Guide (June 2026), rosenberryrooms.com, accessed 2026-10-04, https://www.rosenberryrooms.com/build-ur-base-beginner-guide/ (T)
[S96] Paramount and Wonder Works Launch SpongeBob Tower Defense 2.0 on Roblox, ALM Corp, 2026-04, https://almcorp.com/blog/paramount-spongebob-tower-defense-2-roblox-wonder-works/ (T)
[S97] Top 8 best Roblox tower defense games, PocketGamer, updated 2025-02-07, https://www.pocketgamer.com/roblox/tower-defense-games/ (T)
[S98] 12 Best Roblox Tower Defense Games to Play in 2026 (Ranked), towersdefense.org, 2026-06-26, https://towersdefense.org/articles/best-roblox-tower-defense-games (T)
[S99] Best Roblox Tower Defense Games in 2026: Top 7 Ranked, Switchblade Gaming, 2026-05-26, https://www.switchbladegaming.com/roblox/best-tower-defense-games/ (T)
[S100] Mini War Roblox Guide: Build, Expand, and Dominate, games.gg, accessed 2026-10-04, https://games.gg/roblox/guides/mini-war-roblox-guide-build-expand-and-dominate/ (T)
[S101] Anime Vanguards Wiki, animevanguards.today, accessed 2026-10-04, https://animevanguards.today/ (T)
[S102] Search summaries (pages not fetched): Toilet Tower Defense final legacy update (Fandom/Rolimons), Tower Defense X (tdx.fandom.com/wiki/Tower_Defense_X and /Atrazine), TDS enemy values (tds.fandom.com Advanced Stats pages), SpongeBob unit counts (NamuWiki), Escape Tsunami later snapshot, accessed 2026-10-04 (S)
[S103] Search summary of TDS Farm tower pages and guides (retro and legacy wikis mixed; towerdefensesimulator.com), accessed 2026-10-04 (S; versions conflict)
[S104] Anime Adventures summon rates, Fandom and animeadventures.wiki, accessed 2026-10-04, https://animeadventures.fandom.com/wiki/Summon (S)
[S105] Superbox Siege Defense overview, Roblox, Rolimons, Deltia's Gaming and wiki, accessed 2026-10-04, https://www.roblox.com/games/14852797539/Superbox-siege-defense (S)
[S106] Zombie Attack, Fandom wiki (Waves, Cash, Guns), accessed 2026-10-04, https://zombie-attack-roblox.fandom.com/wiki/Waves (S)
[S107] Hunty Zombie, NamuWiki and Medium summaries, accessed 2026-10-04, https://en.namu.wiki/w/Hunty%20Zombie (S)
[S108] Escape Tsunami For Brainrots, MaxPowerGaming and servicespv, accessed 2026-10-04, https://www.maxpowergaming.co/post/escape-tsunami-for-brainrots-roblox-s-next-brainrot-juggernaut (S)
[S109] Tower Battles, Roblox Fandom and Sportskeeda, accessed 2026-10-04, https://www.sportskeeda.com/roblox-news/roblox-tower-battles-how-play-towers-zombies (S)
[S110] Tower Heroes, Fandom and GameFAQs, accessed 2026-10-04, https://towerheroes.fandom.com/wiki/Tower_Heroes (S)
[S111] Mini War (Roblox) wiki and Roblox post on X, accessed 2026-10-04, https://mini-war-roblox.fandom.com/wiki/Home (S)
[S112] Roblox Innovation Awards 2025 winners, Deltia's Gaming and PocketGamer.biz, accessed 2026-10-04, https://deltiasgaming.com/all-roblox-innovation-awards-2025-winners/ (S)
[S113] Anime Vanguards summon rates and pity, guidebros and wiki summaries, accessed 2026-10-04, https://guidebros.com/roblox/anime-vanguards/ (S; the page itself did not list the rates)
[S114] TDS Scout upgrade costs, towerdefensesimulatorroblox.wiki and Fandom, accessed 2026-10-04, https://towerdefensesimulatorroblox.wiki/progression/scout-levels/ (S)
[S115] Rise of Nations (Roblox) developer and mechanics, Fandom and Medium summaries, accessed 2026-10-04, https://videogaming.fandom.com/wiki/Rise_of_Nations_(Roblox) (S)
[S116] build ur base peak CCU and player count, Rolimons and Roblox page summaries, accessed 2026-10-04, https://www.roblox.com/games/75366259315586/build-ur-base (S)
[S117] Note `03-genre-design.md` sections on Tower defense (TDS wave formulas [03-S125], TDS spotlight [03-S124]) and note `10-from-scratch-playbook.md` (SpongeBob Tower Defense timeline, cited as [10-S]), this repository, 2026-10-04 (internal)
[S118] TDS Fallen mode and Hidden Wave, Fandom and Dungeonpath summaries, accessed 2026-10-04, https://tds.fandom.com/wiki/Fallen_Mode (S)
[S119] Plants vs Brainrots shop and Fallen health scaling, Fandom page summaries (Plants Shop, Fallen Mode), accessed 2026-10-04, https://plants-vs-brainrots.fandom.com/wiki/Plants_Shop and https://tds.fandom.com/wiki/Fallen_Mode (S)
