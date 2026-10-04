# Genre design craft for Roblox games
_Researched 2026-10-04 by deep-research agent (Claude); gap pass the same day. Sources: 159 (about 40 first-party or primary, the rest community, press and third-party; see the trust labels)._
_Gap pass 2026-10-04: 10 items resolved, 19 still open._

How to read the labels. "[Sx]" cites the source list at the bottom. "Third-party" means a wiki, analytics blog or guide site, not Roblox and not the game's developer; treat its numbers as snapshots that drift with every update. "Derived" means I computed it from documented values (the arithmetic is shown) and it is not a published number. "Heuristic" means a design starting value from guides or devforum posts that has no measured source. Anything not in a source is marked "unverified". "Search summary" means the page itself could not be fetched (Fandom wikis returned HTTP 402, some others 403) and the figure comes from a search-result summary of that page; treat it as less certain. The gap pass added full racing, party/minigame and roleplay sections, sourced retention benchmarks, the Tower of Hell timer, measured obby jump limits, Tower Defense Simulator wave cash formulas, and developer spotlights for Fisch and TDS. Interviews for Rivals, The Strongest Battlegrounds, Blox Fruits, Pet Simulator 99 and Brookhaven were searched for and not found (see Open questions).

## Key facts

### Platform context that shapes every genre
- Roblox's own design guide says most users play on mobile, young players prefer exploration, experimentation and socialising over competition, and they react badly to friction and load time. Single-player games "often find it harder" to build and retain an audience; parties and trading are named as mechanics that make friends invite friends. [S7]
- Roblox separates "tourists" (hop for variety) from "locals" (form almost all of a game's engaged base); many locals start as tourists, so do not design only for depth. [S7]
- Discovery changed in April 2026. The Recommended For You algorithm now evaluates player behaviour over 28 days (up from 7), with play-through rate, first-play bounce rate, spend days and Robux per user among the signals. Roblox explicitly traded near-term monetisation for retention. [S26] The June 2026 newsroom post states the same three retention windows (day 1, days 2-7, days 8-28) and says play-through, session quality and spend are measured separately. [S25]
- Q2 2026 (reported 2026-07-30): 123 million DAU, 29 billion hours, top 10 games were about 20% of hours (30% three years earlier); new titles named as rising quickly: Animal Hospital, Grow a Garden 2, Kick a Lucky Block. [S26] Q4 2025: Steal a Brainrot, launched by a young team "in 4 months", hit a record 25 million CCU in September 2025. [S28]
- Roblox pays a higher DevEx rate (37.8% vs 26.6% effective, from 2026-06-08) for in-game spend by age-checked 18+ US users, but only for games using the R15 avatar framework, to reward "novel" games (new genres, new mechanics, different look). Roblox Jumpstart and a six-month Incubator program also exist. Practical meaning: a pure clone of a 2025 hit is not what the platform is paying for in 2026. [S27]
- Creator Rewards (since 2025-07-24): a flat 5 Robux per qualifying "active spender" per day if they spend at least 10 minutes in your experience that day and it is among the first three experiences they launch; plus an Audience Expansion reward (35% share of the first $100 of new or returning users' spend, needs 100+ DAU during the 60-day hold). Roblox itself said long-session genres like tycoon and roleplay get reduced earnings from this; short replayable loops get more. [S29]
- Third-party view of what survives: simulators and tycoons show the steepest decay (core loop exhaustion within roughly 5-10 hours; most viral 2024 simulators were near dead by early 2025); social and fashion genres hold best; horror is episodic and dies fast unless it ships in chapters; seasonal-event participation was called the best single predictor of 12-month survival; 80% of the 2024 top 50 had dropped out of the top 200 by early 2026. [S60][S61] These are third-party numbers with undisclosed methodology.
- 2026 chart snapshot (third-party, 2026-08-20): Murder Mystery 2 (12-year-old game, 538.7K CCU, all-time peak 1.35M from a seasonal event with tradeable items), Animal Hospital (horror, 358.5K), +1 Speed Keyboard Escape (casual/ASMR, 358K), Brookhaven (301.6K), Steal an Egg (281.7K, new), Blox Fruits (254.8K), Grow a Garden 2 (fell from 505.3K to 171.8K in a month), Rivals (161.3K), 99 Nights (152.1K, down 41% in a week). [S64] Take-away: genre mix is broad; old social-economy games (MM2, Blox Fruits, Adopt Me, Brookhaven) are stable; clone-able viral loops decay fast.

### Genre-by-genre facts

**Obby** (obstacle course; stages, checkpoints, sometimes a difficulty chart)
- Roblox lists Obby as a core genre (Tower of Hell the example) and used a greybox obby as the prototyping example. [S7][S15]
- Subtypes in the community wiki: classic linear obby; tower obby (vertical, timed, often no checkpoints); difficulty-chart obby (DCO, typically 20 stages per difficulty tier); time-trial; story obby; gimmick obby. [S104]
- Tower of Hell is a randomly assembled tower with no checkpoints, a shared timer, 364 hand-made sections of rated difficulty, falling restarts only the current section while the timer keeps running, temporary gear (Gravity Coil, Speed Coil, Fusion Coil, Trowel, Hook, Hourglass) and 12 coin-bought mutators that last one round. Third-party. [S82]
- Tower of Hell round timer (gap pass, resolved at the level third-party sources allow): three independent third-party sources give an 8-minute round for a normal tower. towerofhell.wiki says rounds are eight minutes with typically six sections in beginner lobbies, Pro Towers have double the sections and about two extra minutes (so about 10), and finishing before the reset speeds up the next round for everyone [S113]; BloxBonuses says each round runs 8 minutes and the countdown speeds up (it says "effectively doubling") for every player who reaches the top, so rounds end early once enough players finish [S114]; Bloxodes (2026-08-28) calls "six sections, an eight-minute starting timer, up to 100 Coins" a commonly seen setup and warns live settings can change [S115]. The sources disagree on section counts (364 in the catalogue [S82][S115]; BloxBonuses says a 2021 update cut roughly 210 sections to 17 [S114]) and on the exact speed-up rule, so use 8 minutes as the reference and make the speed-up a tunable.
- Community advice (named devforum authors): first obby "extremely easy" for quick wins, respawn fast, checkpoint animation and sound, group obbies into unlocked tiers, put the first obby directly in front of spawn (author reduced walking from about 100 studs to about 5), and make stages meaningful rather than "1 stud each". [S40][S41]
- Guide-site heuristics (no measured source): 30 to 50 stages to start, theme change every 10 to 20 stages, checkpoint every stage for casual or every 3-5 for challenge. [S100]
- Platform physics (documented): WalkSpeed 16 studs/s, JumpHeight 7.2, JumpPower 50 (UseJumpPower true), Workspace.Gravity 196.2, Players.RespawnTime 5 s. [S18][S19][S20] Derived jump envelope below.
- Measured jump values (gap pass). Developer General_Scripter (2020-02-10, devforum) tested default settings and measured a jump height of about 7.27 studs where the textbook formula JumpPower^2 / (2 x Gravity) gives 6.37, and a horizontal displacement of about 9.60 studs where the formula 2 x JumpPower x WalkSpeed / Gravity gives 8.15; he reported the displacement was the same for R6 and R15 and for avatar scale (which changed only the height reached) [S116]. Another poster reports the engine helper `workspace:CalculateJumpHeight(workspace.Gravity, 50)` returning 7.1585 (2021), and buildthomas (2018) guessed the engine applies jump velocity over several frames rather than as one impulse, which would explain why the formula underestimates [S117]. One test, one avatar, 2020: stale and n=1, but it agrees with the documented JumpHeight default of 7.2 [S18].
- Community obby limits (gap pass). In a September 2024 devforum thread (year inferred from the thread number) builders of "The Gap" obby say 13-stud jumps are possible, 13.1 and 13.2 are possible for very good players, 12.5 is a more lenient design, and 12 studs took one player from an elite obby about 30 attempts [S119]. A 2021 post lists a 13-stud long jump as an example of a difficult jump [S120]. The thread does not say how a gap is measured; my reading (an interpretation, not in the sources) is that edge-to-edge gaps can exceed the 9.6-stud centre displacement because the character body overhangs each edge.

**Tycoon**
- Roblox defines the genre as collecting currency from droppers, constructing parts and unlocking new droppers (Lumber Tycoon 2 as the example). [S7]
- A devforum answer on pricing: measure how long players take to progress without buying cash products, use that as the baseline, tier prices from cheap to expensive, and avoid prices that make real-money spending feel mandatory (anon22379117, 2023-03-12; older than 2024 but principle-level). [S37]
- Guide-kit numbers (heuristic): starter drop value 5 per 2 s, buttons at 50 / 250 / 1,000; rebirth base cost 100,000 with 2.5x growth and +50% income per rebirth [S97]; another kit targets first purchase in about 6 s, first rebirth in about 20 min, rebirth cost $3.2M at the default pace, income multiplier 1 + 0.5 x rebirths, offline income at 25% of rate capped at 8 hours [S99].
- Roblox's own creator-rewards note says tycoons are among the genres hurt by 10-minute-capped rewards. [S29]

**Simulator** (collect or click, sell, upgrade, zones, pets, rebirth)
- Roblox's example: Bee Swarm Simulator. The loop: send bees to fields, fill the bag with pollen, convert to honey at the hive, spend on bees, equipment and upgrades; 23 fields, 46 bee types, quest NPCs (bears) that point to the next field. Third-party. [S83] Roblox's contextual-purchase doc cites Bee Swarm for complementary passes (Bee Pollen Pass plus Honey Speed Pass). [S12]
- Pet Simulator 99 (Big Games, Dec 2023): pets break coins and chests, currency buys eggs, eggs hatch stronger pets; 279 areas, 346 eggs, 2,911 pets, 53 enchants, 57 ranks that raise pet, egg and enchant capacity. Third-party snapshot. [S71][S51]
- Pet Simulator 99 live-ops numbers from the developer's own update posts (gap pass; first-party to the game, not an interview): updates ship weekly (RoWatcher says Saturdays 5 PM GMT [S153]; the 2026-09-05 and 2026-10-03 posts both fall on Saturdays, derived from the calendar) [S150][S151]. The Hatch Wars event (2026-10-03) runs a team hatch battle every 4 hours, a 6-day clan battle, leaderboard reward tiers down to rank 10,000, luck stacking where three consecutive wins stack luck and one loss resets it, and an exotic pet listed at 1 in 4,000,000,000 [S151]. Coin Arcade (2026-09-05) adds offline pet grinding in five zones, five minigames limited to 3 plays per game per hour, an hourly raffle of up to 2,500 tickets per draw, boss chests levelling to 50 with up to four stationed pets, a +2% per friend bonus capped at +10%, 19 upgrade tracks, and a clan battle of 6 days [S150]. The 2025-04-19 Easter event used a 100x HUGE-luck basket, an egg hunt every 30 minutes and a raised booth-tax cap (10 million to 100 million diamonds) [S152]. Pattern: every event layers a luck multiplier, a timed competition with a wide reward ladder, and a social bonus. The studio does not publish base hatch odds (community estimates exist but one aggregator page was future-dated and is excluded as unreliable). RoWatcher puts PS99's launch (2023-12-01) at a peak above 400,000 CCU and credits a pet-migration path from the previous game; third-party [S153].
- Bee Swarm Simulator (gap pass): Onett launched it on 2018-07-29 with five bee types and one field; rare gifted bees from the 2019 Star Journey drove its growth and the Planter tool (2020) came from fan ideas; monsters respawn hourly or every few days to give return reasons; Onett gave an RDC 2022 talk on building intrigue in the first-time experience and co-led a GDC 2026 session on riding cultural trends (talk contents not accessed). Search summaries of Fandom and Roblox's developer spotlight; third-party and unverified in detail [S159][S156][S157].
- Rebirth math from devforum: cost C(r) = S x R^r (example 100 x 1.5^r) [S32]; plain price = steepness^rebirth gets too steep for thousands of rebirths [S31]; one developer's fix was to halve the growth percentage at 100, 200, 400, 800... rebirths, starting at 5% per rebirth from a 1,000,000 base [S33]; another thread advises blending polynomial terms and testing curves in Desmos [S34]; "reachable goals spaced nicely" matters more than the exact curve [S36].
- Guide-site numbers (heuristic): zone costs 5,000 / 50,000 / 500,000 with 3x / 8x / 20x multipliers; basic egg 2,500 coins, max 3 equipped pets; rebirth gain 1 + 0.5 x rebirths; click cooldown 0.08 s [S98]; first upgrade within 30 s of joining [S103]; UI refresh every 0.1 s [S103]; boosts such as "2x coins for 15 minutes" and "3x luck for an hour" [S102].
- Real rebirth tables (third-party): Steal a Brainrot has 19 rebirths from $500K to $30Qa, each giving a money multiplier step, a cash bonus, usually one more base slot, +10 s of base lock and a gear unlock [S95]; Ride a Pet has 7 rebirths, +1x money and +1 pet slot each (5 slots to 12), cash from $1M to $50 quadrillion, with the last hatch odds at 1 in 5 quintillion making luck stacking mandatory [S96]; Kick a Lucky Block rebirths give x2 to x11 cash multipliers, requirement 1K to 1T [S75].
- Derived growth: SaB's cost ratio $30Qa / $500K = 6e10 over 18 steps is about 3.97x per rebirth (ln(6e10)/18 = 1.379, e^1.379 = 3.97); Ride a Pet's $50 quadrillion / $1M = 5e10 over 6 steps is about 61x per rebirth. Both give only a linear multiplier bonus, so the real progress comes from buying stronger pets or brainrots, not from the multiplier.

**Pets, eggs and luck (cross-genre)**
- Paid random items must show every outcome and exact numeric odds as percentages totalling 100%, visible before purchase (a bare "(i)" is not enough), and apply to indirect spend such as gems or spin tickets. Restricted users (PolicyService field ArePaidRandomItemsRestricted) must get one of five alternatives (free earnable path, disclosed fixed sequence, direct purchase, item hidden, purchase blocked) and may not trade outcomes when IsPaidItemTradingAllowed is false. [S17][S21]
- Adopt Me: pets from eggs; life stages newborn, junior, pre-teen, teen, post-teen, full grown; five rarities; four full-grown identical pets fuse to Neon, four Neon fuse to Mega Neon; Bucks earned by care tasks buy better eggs; trading drives the economy; about 40 staff; started 2017, pet system summer 2019, ~$60M annual revenue (Wikipedia, date unspecified). [S52][S81] Roblox cites Adopt Me pet variants (slight colour changes) as the example of cheap, art-only content updates. [S9]
- Weighted pick with a luck multiplier: devforum authors give a plain cumulative-weight function, curve-based luck scaling (exponential, Gaussian) and multiplicative luck with a cap; an incremental-game thread notes that a first luck boost that takes too long and a hard luck cap (350) frustrate players. [S35][S46]
- Sol's RNG (third-party): button-roll auras from a table of 273; luck is boosted by timed potions (1 minute to 4 hours), gear and 14 cycling biomes that swap in better native odds. [S89]

**Tower defense**
- Tower Defense Simulator (Paradoxum, since 2019): towers on a path, escalating waves, match cash for placements and upgrades; 63 towers across damage, support, economy and control; 17 modes (guided tutorial, Easy to Intermediate, Hardcore, Molten, Fallen, rotating Challenge Trials, sandbox, story, PVP); coins and gems buy towers; level gates (some towers 150+); weekly events; cosmetics via codes, events, battle pass. Wave counts and per-wave cash were not published in that source. Third-party. [S65]
- TDS match economy (gap pass; third-party Fandom wiki pages read through search summaries because the pages returned HTTP 402; numbers drift with updates) [S125]: Easy mode has 20 waves and $500 starting cash; wave bonus = ($200 + (wave - 1) x $160) x (1 - 0.1 x players); the wave-clear bonus is 35% of the wave bonus solo and 20% for 2 to 4 players. Casual has 25 waves: bonus = wave x $200 for waves 1 to 20, then $300 + (wave - 1) x $350 for waves 21 to 25. Intermediate has 30 waves: $200 + (wave - 1) x $150. Fallen has 40 waves (the summary adds a hidden extra wave): $300 + ((wave - 1) x $60)^1.03 for waves 1 to 30 and exponent 1.07 for waves 31 to 40. Casual, Intermediate and Fallen start at $500 ($600 with the Group bonus). The summary quoted about $5 per basic kill and about $150 for a boss. Derived from those formulas (excluding kill cash and clear bonus): solo Easy wave bonuses sum to about 30,960 over 20 waves (sum of 200 + 160 x (w - 1) = 34,400, times 0.9), Casual to 42,000 over waves 1 to 20 plus a jump from 4,000 at wave 20 to 7,300 at wave 21, and Intermediate to 71,250 over 30 waves. Design reading: the bonus grows linearly (about +150 to +160 per wave) and shrinks with party size (-10% per extra player on Easy), so farms and kill cash do the scaling.
- TDS team and process (Roblox Creator Spotlight, 2024-06-17) [S124]: started as a school project in spring 2019; CCU grew from about 3,000 to up to 30,000 after content creators picked it up; the studio is 30 people (19 art and marketing, 10 engineering and design, plus the founder BelowNatural); work runs in two-week sprints that start from shared design documents while engineers prototype and artists polish; community polls decide some design questions; trailers are kept to 30 seconds or less so they work as thumbnails and are promoted about one week before an update. Monetisation details were not given.
- Third-party genre note: tier lists and collection mechanics drive TD engagement, and TD/gacha games are "chronically susceptible" to pay-to-win backlash. [S61]
- Hybrid trend: press and chart listings mention a TD-style "Plants vs Brainrots", but I could not fetch a primary or wiki description (unverified).

**Horror / story**
- DOORS (LSPLASH, created 2021-03-14): numbered rooms, five floors (Hotel, Mines, Backdoor, Rooms, Outdoors), 45 entities each with a warning tell (flickering lights, footsteps, roars), 46 items, Knobs and Stardust currencies, 36 active codes, events to 2026-10-31; floor 2 shipped 2024-08-30. Third-party plus Wikipedia. [S79][S51] Roblox's LiveOps and contextual-purchase docs cite Doors for QoL updates, bug-fix triage, a pre-run consumable shop and a Knobs shop. [S8][S12]
- Dandy's World (June 2024): co-op cartoon horror; 15 floors, break rooms every 25 floors, 42 playable toons each with five stats (skill check, speed, stamina, stealth, extraction), 42 enemy "Twisteds", Ichor persistent currency, Tapes spent during a run, 58 trinkets with two slots per run. Third-party. [S84]
- Animal Hospital (created 2026-05-10, top-3 CCU in Aug 2026): night shifts; screen patients at check-in for imposters (22 anomaly types) using window, polaroid and CCTV cues; treat real patients in rooms or emergency minigames; Shift 4 adds pressure events, Shift 5 is a milestone, 6+ open-ended; 10 classes bought with Animal Coins or Robux; servers about 25-29 players. Third-party, single source. [S74][S64]
- Devforum horror advice (named authors): sound design and silence over jump scares, limited visibility, fairness (no random deaths), unexpected placement, fake-outs, subtle changes to normal things, and playtest with unfamiliar users. [S42][S43][S44]
- Third-party retention: horror shows the steepest CCU decay (70-80% loss within 60 days) unless episodic. [S60][S61]

**Roleplay / hangout**
- Brookhaven: no levels, quests or bosses; 28-player public servers; roughly 83-115+ houses, 188-190+ vehicles, 80+ jobs, 22 gamepasses (275-799 Robux each, about 5,716 Robux for all optional passes); weekly Friday updates; record 1,296,208 CCU on 2025-12-19; created 2020-04-21; Voldex bought it 2025-02-04/05. Third-party and Wikipedia; counts differ by source and date. [S63][S87][S51]
- Roblox singles out Brookhaven's "Creator Cam" (hides UI for recording) as streaming-aware design and roleplay as thriving on social tools, not story. [S7]
- Third-party: roleplay shows the flattest decay curve and highest session frequency. [S60]
- Adopt Me and Dress to Impress are the other "social economy" evergreen examples. [S52][S88]

*Roleplay / hangout, full treatment (gap pass).* Sources here are thin on developer voice: no interview with Brookhaven's creator was found, so most claims are third-party or press.
- Core loop: there is no scripted loop. The player picks an identity (role, outfit), claims or spawns a house and a vehicle, and plays make-believe with others; the "loop" is social, and the engine behind it is tools (spawners, props, emotes) rather than content. A 2023 devforum thread asking why these games are popular gives the players' reasons: invent a personality and play with friends, live "an entirely different life" through roles (student, worker, police officer, doctor), property and vehicle ownership, and social play that is easier than competition because friends can rely on each other; another poster notes these games hold huge audiences despite poor UI and modelling, so accessibility beats polish (Brookhaven showed 381,676 players in that thread; stale 2023 snapshot) [S144].
- Brookhaven design intent (unverified: search-result summaries of a Fandom page and a Medium article that could not be fetched): Wolfpaq built the core alone around three systems, a house-spawning system, a vehicle system and a prop-placement system, and let players generate the stories; updates were weekly and small in 2020 with a gap of 15 to 25 days in summer 2020; Voldex bought the game on 2025-02-04 and Wolfpaq stepped back [S149]. The Voldex press release (via search summary) gives 60 billion visits and over 120 million monthly active players at acquisition [S148].
- Progression: none by design in Brookhaven (no levels, quests or currency walls, per S63/S87 above). Welcome to Bloxburg is the opposite pole, a life-sim with an economy: an interview (2018-03-07, stale) says players earn virtual currency from tasks and mini-games to buy furniture, currency is sold in tiered packs, game passes give more building capacity and exclusive items, the game cost 25 Robux during early access and had about 300,000 daily active users and about 160 million sessions since its 2016-08-01 release; the developer's stated aim was that most of the game is playable without paying. Bloxburg became free on 2024-06-15 (Wikipedia) [S145][S51].
- Economy numbers for Bloxburg (third-party, 2026; sources conflict): recurring bills are 0.6% of house value per in-game week (0.3% with Premium) and an in-game week is 2 hours 48 minutes of real time; three solar-panel tiers cap savings at $500, $1,000 and $2,000 per bill and 20% in total [S146]. One guide ranks Pizza Delivery as the best-paying of 14 jobs, from $25 per delivery at work level 1 to about $2,500 at level 50, while another page's title says all 14 jobs were given the same pay rate in 2024 [S147]; treat job pay as unverified. Design reading: a value-proportional bill is a money sink that scales with how much a player has built.
- Onboarding: no source describes the first minutes of Brookhaven, Bloxburg or Adopt Me. Roblox's design guide says players react badly to friction and load time [S7]; the retention docs say aim to finish onboarding within 5 minutes [S111]. For a hangout, that means spawn next to the first claimable house and vehicle spawner (my recommendation, not a sourced rule).
- Social design: public servers of about 28 (Brookhaven) [S63]; proximity chat and voice are the social layer [S87]; Creator Cam for recording [S7]; free base content with paid expression items [S63]; weekly Friday drops [S63][S87]. Roblox itself says long-session genres such as roleplay earn less from Creator Rewards [S29].
- Retention: third-party says roleplay has the flattest decay and highest session frequency [S60]; BLOXG's table lists Social/Hangout D1 24%, D7 13%, D30 6.0% (see Retention benchmarks below; that source is not reliable in level, only in ordering) [S109].

**Battlegrounds / fighting**
- The Strongest Battlegrounds (created 2022-08-02): free-for-all arena, 14 characters each with an Awakening form, damage fills an Awakening meter, M1 strings, block (F), dash (Q), ragdoll cancel; ranked 1v1 and 2v2 with ELO; monthly casual leaderboard titles; 176 community-found techniques. Third-party. [S69]
- Rivals (created 2024-05-26): first-person duels 1v1 to 5v5, first to five rounds; four loadout slots; 22 modes including daily rotating ones; nine ranked tiers from Bronze (0 ELO) to Nemesis (3,600 ELO), 200-ELO steps, loss shields to Platinum I, inactivity decay from Onyx I, top-200 leaderboard; keys, cases and contracts for cosmetics. Third-party. [S70] StudioKrew notes Rivals sources cosmetics from community submissions and runs cross-platform. [S64]
- Blox Fruits (action RPG, One Piece style): level-gated seas (second sea at level 700, third around 1,500, cap 2,800 in the source), Fruit Dealer restock every 4 hours, 12 raids that award Fragments, fruit trading sustains retention during content gaps. Third-party; level numbers unverified against the game. [S68][S64][S51]
- Third-party: competitive PvP has a moderate decay curve, ranked systems extend life, exploiter waves are the main threat. [S61]
- Gap pass on the big fighting titles: no developer interview or talk was found for Rivals, The Strongest Battlegrounds or Blox Fruits (see Open questions). What exists: Rivals was founded by Nosniy with developer SenseiWarrior, shipped global matchmaking and a party system in July 2024, requires ranked party members to sit within a 600-ELO range, sources many cosmetics from submissions in its Discord concept-art channel, and (per a September 2026 "Update 22" summary) stopped treating every player above 3,600 ELO as equal so a very high-rated player gains almost nothing from beating a lower-rated one; it won Best Shooter at the 2025 and 2026 Innovation Awards (search summaries of Fandom and guide pages; third-party) [S154][S70]. The Strongest Battlegrounds (Yielding Arts, created August 2022) won Best Strategy Experience at the 2024 Roblox Innovation Awards [S155]. Blox Fruits (Gamer Robot) was created 2019-01-16, released 2019-06-16 as "Blox Piece", renamed 2019-12-25 for copyright reasons, and got its Third Sea on 2021-09-11 (Fandom search summary, third-party) [S158].

**Incremental / idle**
- Grow a Garden (released 2025-03-26; BMWLux original developer, Jandel and Splitting Point plus DoBig as owners; peak 22.3M CCU on 2025-08-23): buy seeds with Sheckles, plant, harvest, sell, buy more exotic seeds; crops grow while offline; seeds go in and out of stock; exclusive items drop weekly and require being online to claim; Robux buys speed-ups, perks and crop stealing; pets from loot boxes; criticised for heavy monetisation. [S48][S51]
- Shop timers (third-party, two sources agree): seed and gear shops every 5 minutes, egg shop every 30 minutes, daily deals 24 hours; one tracker also lists a 2-hour travelling merchant that stays 30 minutes and some seeds with well under 1% restock chance (e.g. a 25M-Sheckle seed about 0.34%, average wait about 24 hours). [S73][S94] Roblox's economy doc recommends isolating events with their own event currency; this pattern fits the weather and event windows. [S6]
- The game grew through weekly or biweekly major updates with named events (Blood Moon 5M CCU on May 18; Bizzy Bees 11.7M on May 31) and an influencer "admin abuse" rivalry (2025-08-16 declaration, event 2025-08-23). [S48][S56]
- Grow a Garden 2 (created 2026-05-21, third-party): adds night theft of crops with walls, doors and guard pets; CCU fell from 505.3K to 171.8K in a month and later to a few thousand. Evidence that bolting PvP theft onto an idle loop did not rescue retention. [S92][S64]
- Eat Food To Get Rich feedback (a small incremental game): average playtime about 6.8 minutes, players complained about repetition and slow rebirths. [S45]

**Social PvP / "steal"**
- Steal a Brainrot (released 2025-05-16, SpyderSammy and DoBig Studios): a conveyor across the map sells brainrots; each placed one earns passive cash; you can sneak into unlocked bases and carry one away; the thief is slowed and stripped of items and can be hit, which returns the brainrot; temporary shield button; gear (40 gears in third-party count) bought with cash or Robux; rebirths. Peak 25.4M CCU in October 2025. [S49][S72][S28]
- Third-party details: base lock 30 s on join and 60 s on re-lock, +10 s per rebirth; mutation multipliers Gold 1.25x, Diamond 1.5x, Lava 6x, Rainbow 10x (exclusive), traits stack multiplicatively, server luck 1x-5x, rebirth bonus, index-complete bonus 50%; 512 brainrots, 14 mutations, 105 traits, 18-19 rebirths. [S93][S72][S95] Numbers drift per update; treat as illustrative.
- Spread: TikTok and YouTube clips of children losing their brainrots. [S49]
- Steal an Egg (created 2026-07-25; 281.7K CCU in the 2026-08-20 snapshot): grab an egg from a biome, run home past guardians, hatch pets for income; speed is trained on a treadmill to pass biome gates; bats and bear traps make carriers drop eggs; StudioKrew credits small 7-player servers for making theft "personal". Third-party. [S78][S64]
- Murder Mystery 2 (2014): one murderer, one sheriff with the only gun, innocents collect coins; boxes at 1,000 coins; 524 knives and 210 guns across nine rarities; old event items now only trade between players. Third-party. [S77][S64]

**Fishing / collecting**
- Fisch (created 2024-03-13): equip a rod, time a cast meter, then hold to keep a bar on the fish; rod stats Control and Resilience soften difficulty; 188 rods, 52 locations, 1,328 fish, 65 baits, 151 mutations, 26 totems (weather and events). Third-party. [S67]
- Fisch developer spotlight (Roblox Creator Spotlight, 2024-11-22) [S121]: WoozyNate built it solo in about four months for "everybody of every age", with several end goals instead of one; the 2024 build had seven islands plus two hidden locations (the third-party counts above are 2026 and far larger); fish carry a Resilience stat that sets catch difficulty and about 25 mutations per species are generated procedurally with the fish's weight as the seed; each rod has a distinct use (for example one freezes the fish bar). His retention thesis: players should be able to play several ways (collecting, stat optimising, competing) and always have a reason to return; he prefers quality over quantity of updates and says the game is not littered with micro-transactions. The spotlight reports a peak near 470,000 CCU at the time, and the FischFright event boosted visibility and front-page placement. A development livestream with the team was held 2026-03-11 (replay not transcribed) [S122]. Fischipedia (third-party) adds: created 2024-03-13, released 2024-10-05, top experience by CCU on 2024-11-30, over a million concurrent players by 2025-10-04, and about 105 versions shipped [S123].
- Roblox's own economy doc uses a fishing game as the worked example: catfish 10G at 70%, trout 20G at 20%, salmon 30G at 10% gives 14G expected value per cast and 14,000G for 1,000 casts; a 24-hour Golden Salmon (0.1%, 1,000G) must be modelled before launch or the surplus gold depresses spending afterwards. [S6]
- Collection index mechanic: SaB's "Index complete" bonus of 50% income shows completing a collection can be a multiplier (third-party). [S93]

**Survival**
- 99 Nights in the Forest (created 2025-03-04, released June 2025; 3 core creators plus an artist and animator; 3-month build; peak about 14.2M CCU; ~26-29.8B visits): survive until night 99; chop and scavenge by day, return to the campfire before hostile entities at night; rescue lost children to speed morning; 43 classes, 59 resources, biomes, diamonds from repeatable dungeons; weekly 45-minute "update parties" where devs play with players; Cultist Stronghold dungeon built in about 2 days; client-heavy design with server verification of combat; "99" chosen over "100" for appeal. [S30][S76][S57] Its updates now fix weak biomes rather than add zones (third-party). [S64]
- Dead Rails (RCM Games, created January 2025): co-op of up to four on a steam train; coal and wood fuel the train; loot stops at night; distance in km is progress; 29 classes bought with Bonds, 50 weapons, 13 trains; events about every two weeks. Third-party and a Roblox-content repost on the developer's "goofy" vision. [S66][S58]
- Servers in both games are small and co-op (22-25 players for 99 Nights). [S76]

**Party / minigames / round-based**
- Dress to Impress (Gigi, released 2023-11-11): 360 s per round to dress for a theme, a runway walk with 1-5 star votes from other players, podium for top three; modes: standard, duos, Style Showdown (10-player elimination), freeplay; 14 rank tiers on stars (150,000+ career stars for the top); cash, Robux, codes; VIP room with 176 items; Theme Props sold during intermissions; peak 1.5M CCU, 651K during the 2024-08 Charli XCX collab; later collabs Lady Gaga (2025-08), Wicked (2025-11). [S50][S62][S88][S12]
- Natural Disaster Survival: survive each round's disaster (earthquake, tornado, tsunami, fire, flood and others) (Wikipedia list). [S51]
- Forsaken (created 2024-07-28): queue as one of seven killers or 12 survivors, vote a map, survivors repair five generators; 17 maps, 805 skins. Flee the Facility (2017): beast vs survivors with three beast playstyles, 5-player servers, hack computers, freeze pods. Piggy: 24 chapters, infected-vs-survivors, 14 survivor abilities (max 3 per round). Third-party. [S80][S85][S90]
- Blade Ball (created 2023-06-17): deflect a homing ball, round-based, spin crates for cosmetics. Third-party. [S91]
- +1 Speed Keyboard Escape (casual/ASMR, 97% rating from 9.1M votes) credited to smooth mechanics and satisfying audio. Third-party. [S64]

*Party / minigames, full treatment (gap pass).*
- Core loop: a server-side state machine cycles lobby or intermission, a vote or announcement, the round, results and a payout; because the round is short and self-contained, players can drop in at any point. Devforum developers describe three phases (waiting for players, intermission with countdown and map selection, round), each with a timer and an exit condition. Lobbies often carry their own mini-activities (physics spheres, small obstacle courses) so waiting is social. (This paragraph comes from search summaries of devforum threads that were not individually fetched; unverified in detail.)
- Round and intermission timing (devforum, small samples, 2020-2021, so heuristic): in a 2020 thread four developers recommend about 30 seconds of intermission (range 15 to 35; "40 would be too much"), longer if the lobby is interactive and shorter if not, with one splitting 30 seconds as 10 for results and 20 for voting [S139]; in a 2021 thread a fast game used 25-second rounds with intermissions between 10 and 20 seconds, and replies suggested rounds of 20, 25 or 30 seconds [S140].
- Dress to Impress as the judged-round model: players get roughly five to six minutes to style an outfit to a theme (360 s per [S50]), then walk a runway while the other players give 1 to 5 stars; the top three outfits take the podium [S50]. The cash-per-place guide (2025-03-10) lists seven places, 65 for first falling by 5 per place (second 60 ... seventh 35) [S141]; extra cash comes from tokens scattered in the styling area and a lobby parkour worth about 50 to 100 coins that regenerates every minute, and servers with fewer players pay more per player because there are fewer people to share pickups; a Double Money power-up is sold [S141]. Stars (from votes) are career progress, not spendable: 14 ranks from New Model (0 to 49 stars) through Runway Queen (3,000 to 5,999), which unlocks Pro server access and a handbag, up to Fashion Goddess at 150,000 or more; the band widens at every tier (for example Trend Setter 6,000 to 14,999, Top Model 25,000 to 50,000, Supernova 100,000 to 150,000) [S142]. A career rank therefore doubles as a server-matchmaking filter.
- Dress to Impress live-ops (Roblox "Behind The Games", 2024-08-23, first-party): for its mermaid event the nine-person team ran three quests inside the dress-up game, a duo contest (top 4), a mermaid obstacle course (top 3) and a mermaid race with dodge mechanics and boost-bubble power-ups (top 3), rewarding a limited mermaid set code; modelling was done in Blender (Array and Skin modifiers for coral); TikTok teasers began about a week ahead and X revealed the prize set; the team added masculine clothing, hairstyles and poses because earlier Roblox events had not reached male players; day-1 concurrent players reached 500,000, the highest on record for the game at that time [S126]. Takeaway: a party game can host genre-switch minigames (obstacle course, race) as event quests without changing its core loop.
- Murder Mystery 2 income cap (Fandom coin page via search summary, third-party): up to 40 coins can be collected each round, 50 with the Elite pass, so currency per round is bounded however well you play [S143].
- Creator Rewards pay for the first three experiences a player launches that day if they play 10 minutes, which favours short replayable loops; Roblox said so explicitly [S29].

**Racing / speed**
- Sonic Speed Simulator (Gamefam, licensed by Sega; free launch 2022-04-16): collect orbs and rings for XP, levels raise speed and jump, Sky Rings, time trials as checkpoint races, rebirth resets speed, power and level but returns skill points; 275,000 CCU in week one; first branded game to reach 1B visits in August 2024. [S53]
- Driving Empire (Voldex, 2019): drive, race, earn, buy, customise loop; 595 vehicles, 8 houses priced $450,000 to $9.3M that only add garage capacity, 14 locations, 18 customisation categories, 20 codes. Third-party. [S86]
- Ride a Pet, Kick a Lucky Block and +1 Speed games fuse "run or kick for distance" with luck, rebirth and tsunami chase loops; Kick a Lucky Block: timing-meter kick, rarity by distance, tsunami chases you back to a safe zone, 13 weights, x2 luck passes. Third-party. [S75][S96]

*Racing, full treatment (gap pass).* Racing on Roblox is four different products that share vehicles: (1) lobby circuit races on a checkpoint track, (2) open-world driving with races, dealerships and collecting (Driving Empire, Midnight Racing: Tokyo, Vehicle Legends), (3) run-to-speed simulators (Sonic Speed Simulator, Legends of Speed), (4) kart racing (indie projects and the 2026 Dream Racers). Developer voice is thin; the best first-party material is Roblox's own "Behind The Games" post and docs.
- Core loop: open-world racers loop drive, race, earn cash, buy or tune a car, race a harder event; the money comes from races, passive driving and codes, and cash is sunk into car prices and upgrades. Third-party guides say Driving Empire has Drag, Highway, Cross Country and Circuit races, with Circuit and Cross Country paying the most cash [S134]; the two third-party wikis agree that longer or more complex races pay more but disagree on every number (below) [S132][S133]. Run-to-speed sims loop collect orbs or rings for XP, level up for more speed and jump, rebirth for a stackable multiplier; Legends of Speed lets players rebirth from level 50 for gems and a stacking x1 multiplier and fires a race notification every few minutes (Fandom summaries) [S136]; Sonic Speed Simulator adds Sky Rings and Time Trials, and rebirth returns skill points [S53].
- Progression: car collection and tuning (Midnight Racing: Tokyo lists 170-plus cars across seven maps in the 2024 post [S126]; Driving Empire's dealership sells cars at roughly $150,000 to $500,000 per a Fandom summary [S134]); houses or garage capacity as a sink (S86 above); event cars that resell for large sums (below). Rank or leaderboards are not documented for these games in any fetched source.
- Economy numbers (third-party, conflicting, treat as unverified): one Driving Empire guide gives 5,000 starting cash, first-place payouts of about 10-12K (drag) and 12-15K (street circuit), a value car at about 80K, tuning parts of 15-80K, and codes of 5-25K every 2-4 weeks [S132]; another gives average wins of 4,500 (drag), 6,200 (street circuit), 5,800 (ATV) and 5,500 (boat), a daily login of 2,500 rising to 10,000 on day 7, an overnight auto-grind of 1.2 to 1.6 million per 8 hours (3,800-4,500 per 90 seconds), and event-car resale values of 150,000 to 800,000-plus [S133]. The two disagree by 2 to 3 times on a drag win, so use only the shape: payout rises with race length, passive grind exists, daily login ramps, event cars are cash sinks and cash sources at once.
- Onboarding and social design (Midnight Racing: Tokyo, Roblox post 2024-08-23): the event onboarding chain was three quests, get and upgrade a car at the dealership, deliver parts in a timed race, then place top 3 in a special race, joining a "Gold Label" club; the studio (about 90 developers across moderation, car modelling, programming and map building) had to build a custom navigation solution because Roblox's PathfindingService range was too short for a minimap; players asked for "ghost" opponents so a solo race has consistent difficulty; the post reports a peak of 8.3K CCU and 1.3M DAU during the promotion (scope of the figures unclear) [S126]. Indie kart-racer feedback (2022 devforum): testers wanted more acceleration and more drift, and items existed only in multiplayer [S138].
- Official tooling: Studio ships a Racing template (announced 2024-01-23) with a working car and modular track pieces, races configured per race (min and max players, laps), checkpoints named Checkpoint1 to CheckpointN in order with visuals created at race start, and car attributes in an Engine folder (forwardMaxSpeed, reverseMaxSpeed, acceleration, nitro duration; default values are not published in the post, and the post warns the car can fling out of the world with the aerodynamics beta on) [S127][S128].
- Physics and networking (first-party docs): the engine assigns network ownership automatically by proximity and hardware, anchored parts are always server-owned, and the documented pattern for vehicles is to give the driver ownership with SetNetworkOwner(player) when they sit in the VehicleSeat, revert with SetNetworkOwnershipAuto() when they leave, and give loose parts of the vehicle to the same client [S131]. A January 2025 bug report describes rubber-banding in high-player-count sessions with 10 or more multi-assembly vehicles; commenters blame replication bandwidth (one cites a throttle above 50 kbps) and suggest sending only CFrame and wheel data and interpolating on clients; commenters say server authority is on the roadmap; no Roblox staff answer in the thread [S130]. Note that "rubber-banding" here is network lag, not game-design catch-up.
- Race positions (devforum, 2018, stale but still the standard approach): store lap and checkpoint progress and rank by "checkpoints passed + fraction of the way to the next one"; a simpler variant weights lap x 100,000 plus the checkpoint index with time as tiebreaker; raycast between the last and new position to stop checkpoint skipping; use os.clock rather than DistributedGameTime for timing; hairpin corners need extra checkpoints so the distance fraction does not jump [S129].
- Retention: no racing-specific retention number was found. Legends of Speed's Rolimons page shows an all-time peak of 19,665 CCU on 2020-04-26 and an average playtime of 14.16 minutes on the snapshot date, so a speed sim can be a long-lived small game [S135]. Sonic Speed Simulator reached 70 million plays and 275,000 CCU in its first week (April 2022) and 500 million visits in four months, but the licence and a brand audience did the acquisition [S53].
- A new mechanic to learn from: Dream Racers (creator Delus, three-person team, about 2.5 months of work at the time of a GDC 2026 interview published 2026-05-25) lets players type words to generate a physics kart with Roblox's Cube AI in 20 to 30 seconds and sells the words as the purchase; this fits the 2026 platform push for "novel" games [S137][S27].

### Cross-genre craft (first-party where possible)
- Core loop = minute-to-minute interaction + most-repeated action + progression engine; without a progression system a game is "repetitive, boring, and shallow". [S2]
- FTUE: teach what to do and why, get to fun in minutes, end onboarding on a moment of joy, give starter items and soft currency, low early XP thresholds with exponential curve later, short, mid and long-term goals visible in UI; tune with Experiments (A/B) and Configs (live values). [S3] Timed hints appear once per task, only for players who struggle; example: highlight a button at 11 seconds; surface an overlooked feature after two sessions without use. [S4]
- Quests: dailies are short, low-reward, completable in one session, and a "resource drip"; mid-term goals take days to weeks; achievements take months. [S5]
- Season pass: one month baseline, one-week rest between seasons, ten tiers to start, manual claim button, final reward a new exclusive asset retired after the season, daily missions never needing hard currency, easy/medium/hard difficulty tags, catch-up double XP in the final week. [S10]
- Content cadence: a drop every two to four weeks, under three weeks of effort each, mostly art variants of existing systems; major updates (social, competitive, collections, live events) take months. [S8][S9]
- Subscriptions price points $2.99, $4.99, $7.99, $14.99; uses: bundles, VIP, season passes. [S13]
- Contextual purchase moments: round intermissions, pre-run shops, lobby 3D objects, complementary offers; never on the very first load; limit prompt count. [S12]
- UI: show only HUD items relevant to the current activity; visual hierarchy for premium shop tiles (Dragon Adventures larger tiles, Jailbreak gold stripe); button states and purchase animation feedback; clean mobile UI. [S14]
- Retention benchmarks (gap pass; all third-party except the Roblox definitions). Large-sample view: GameAnalytics' 2026 Roblox report (data 2025-08-01 to 2026-07-31, 500-plus titles with 1M-plus monthly active users, 4.76 billion sessions; no genre split) gives D1 median 10.3% (p25 8.4, p75 12.9, p90 15.9, p99 22.2), D7 median 1.6% (p25 1.0, p75 2.5, p90 4.1, p99 9.1), D30 median 0.5% (p25 0.3, p75 1.0, p90 1.9, p99 4.7); game-level median session 9.8 minutes (p25 7.3, p75 12.0, p90 14.7), median 1.56 sessions per day, median ARPPU $0.70; only 3.8% of tracked players spent anything and the median payer spent $0.81 over the period [S107][S110]. The 2025 edition (data 2023-01 to 2025-07) splits by average session length: D1 median rises from 4.31% for 0-3 minute sessions to 6.20% (4-6 min), 7.91% (7-12), 10.24% (13-18), 11.46% (19-24) and 10.76% (25 plus); D30 median rises from 0.13% to 0.50% over the same buckets [S108]. GameAnalytics says the figures circulating online (20% D1 good, 40% excellent) are inflated because they come from small samples of already-successful games [S110]. Per-genre view: BLOXG (March 2026, "850+ promoted games", method undisclosed) lists D1/D7/D30 of Simulator 32/14/6.2%, Tycoon 30/12/5.1%, RPG 35/16/7.8%, FPS/Shooter 26/11/4.5%, Social/Hangout 24/13/6.0%, Adventure 27/10/3.8%, Horror 22/8/2.8%, Obby 18/6/1.9% [S109]. These genre D1 values are above GameAnalytics' 99th percentile (22.2%) for several genres, so BLOXG cannot describe a typical game (derived comparison); use only its ordering (RPG, Simulator and Tycoon highest, Obby lowest) with low confidence. Roblox's own docs define D1, D7 and D30 by first-play date, say to finish onboarding within 5 minutes, ship small updates every 2 to 4 weeks and major ones every 2 to 3 months, and tie D30 to an endgame, regular content and social mechanics such as guilds, PvP, leaderboards and trading [S111]. Creator Analytics lets you compare against "similar experience" or "genre" benchmark sets for playtime, D1/D7/D30, QPTR, payer conversion and ARPPU (since 2025-10-16, comparison only, no effect on recommendations) [S112]. The old unsourced creation.dev figures (D1 20-30% good, D7 above 10%, D30 above 5%) [S101] are far above these medians and are now superseded.
- Dubit (a commercial Roblox studio, 2026-03-19): validate concept with game-page ads and opt-in rate, test the core mechanic for session time in days, add a retention layer and watch D1/D7 by genre, then add brand and social features; benchmarks differ per genre. [S59]
- Older-than-2024 flag: a 2021 TechCrunch claim (via Wikipedia) that tutorials reduced engagement on Roblox is stale and contradicted by Roblox's current onboarding guidance; prefer short, contextual hints. [S54][S3]

## How to apply it (rules for an AI builder)

### Universal
- DO write the core loop in one sentence in three parts (minute-to-minute, repeated action, progression engine) before building anything; if the progression engine is missing, add one (levels, zones, rebirth, rank or collection). [S2]
- DO make the first reward arrive fast: first currency within 10 seconds, first purchase or upgrade within 30-60 seconds, first "wow" (zone, pet, rebirth preview) inside 5 minutes. Roblox's own doc says FTUEs that reach fun quickly do better; the 30 s figure is a third-party heuristic. [S7][S103]
- DO design for mobile first: big touch buttons, minimal HUD, short text, no required keyboard keys; bind gamepad too. [S7][S14]
- DO put a social hook in every genre: shared server events, trading, parties, visible leaderboards, stealing or co-op. Single-player-feeling loops underperform. [S7]
- DO run short loops. Because Creator Rewards need only 10 minutes per day and are capped, and the algorithm scores play-through and D1/D2-7/D8-28 retention, aim for a satisfying 10-minute session that ends with a reason to return (timer, restock, daily claim, event). [S29][S26]
- DO tune numbers from live data. Expose costs, rewards and timers as values you can change without a code push (attributes, ModuleScript tables, or Roblox Configs). [S3][S16]
- DO set retention targets from the sourced medians, not folklore: across 500-plus large Roblox games the median D1 is about 10%, D7 about 1.6% and D30 about 0.5%, so D1 of 13% (p75) is already good and 16% (p90) is excellent; read your own Creator Dashboard genre benchmark before judging. [S107][S112]
- DO disclose odds on every paid random item and gate by PolicyService (see recipe). DON'T hide odds behind a lone "(i)" icon. [S17]
- DON'T add sale prompts on the very first load, and DON'T stack many prompts. [S12]
- DON'T copy a 2025 viral loop one for one. Roblox pays more for novel genres in 2026 and sees clones decay fast. Combine one proven loop with one new mechanic. [S27][S61]
- DON'T design an exponential cost curve without a matching income curve (see the Derived calculation under Economy).
- DON'T ship events without modelling their currency. Give the event its own currency and shop. [S6]

### Economy and curves
- DO price tycoon buttons so each purchase takes "a couple of minutes" at current income and noticeably raises income (kit guidance, heuristic). [S97][S37]
- DO use geometric rebirth cost C(r) = S x R^r with R about 1.4-2.5 and S about 1M for simulators; plan how income grows to match; consider halving R at breakpoints for endless rebirths. [S32][S33][S97][S98]
- DO sanity-check the cycle length T(r) = cost(r) / income(r). If cost grows 2.5x per step and the multiplier grows only by +0.5 per step, T(r) grows without bound (Derived: at r = 10 cost is 9,537x the base but the multiplier is only 6x). Real hits solve this by letting rebirth unlock stronger earners (pets, brainrots, zones) so income grows geometrically too. [S95][S96][S93]
- DO compute expected value before any odds table: EV = sum(value x probability) as in Roblox's fishing example (14G per cast). [S6]
- DO keep sources and sinks close together during events. [S6]
- DO format large numbers with suffixes (K, M, B, T, Qa, Qi) because players prefer big numbers. [S103]

### Obby specifics (Derived from documented physics)
- Max flat jump distance at default stats: takeoff speed sqrt(2 x 196.2 x 7.2) = 53.1 studs/s, airtime 2 x 53.1 / 196.2 = 0.54 s, horizontal reach 16 x 0.54 = about 8.7 studs. [S18][S19]
- DO keep gaps: tutorial 2-4 studs, easy 4-5, medium 5-6.5, hard 7-8, never above 8.5 at default speed for a general audience. If you change WalkSpeed use gap_max = WalkSpeed x 0.54. Keep vertical steps at or below about 6 studs (apex is 7.2). These bands are design heuristics, not documented limits.
- Gap pass cross-check: the one measured test found a centre displacement of about 9.6 studs, about 18% more than the 8.15 the simple formula gave at JumpPower 50 [S116], and skilled obby players treat 12 to 13-stud edge gaps as the possible-but-elite ceiling [S119]. So 8.5 leaves margin for mobile players and 13 studs is the outer limit that only elite-tier obbies use; if you build an "expert" tier, stay at or below 12 and test it with a real run in Studio (my recommendation, derived from those two sources).
- DON'T use the textbook height formula as an engine truth: JumpHeight 7.2 is the documented default and the measured apex was about 7.2 to 7.3, above the 6.37 the formula gives [S18][S116][S117][S118].
- DO give a checkpoint at the start of every stage for casual obbies, every 3-5 stages for challenge, and none only for a deliberate tower format with a shared timer. [S100][S82]
- DO make early stages "extremely easy", teach one mechanic per stage before combining, add checkpoint sound and animation, keep respawn fast (default Players.RespawnTime is 5 s; lower it). [S40][S41][S20]

### Per-genre quick rules
- Tycoon: one plot per player, dropper to conveyor to collector to buttons, rebirth at about 15-30 minutes of play first time, offline earnings capped. [S99]
- Simulator: backpack capacity creates the sell trip; zones gated by currency or rebirth; pets multiply; rebirth gives multiplier plus slot or zone; first luck boost reachable fast. [S83][S46][S96]
- Tower defense: separate in-match cash from meta currency; economy towers must have a risk/reward; unlock towers via levels, coins and challenges; weekly rotating challenge modes. [S65]
- Horror: every threat has an audio or visual tell; fair deaths; sound over jump scares; ship in floors or chapters. [S42][S79][S84]
- Roleplay: remove progression gates, sell optional expression items (houses, vehicles, jobs), weekly content, 20-30 player servers, support streamers (UI-hide camera). [S63][S7]
- Battlegrounds: low skill floor, high skill ceiling (block, dash, cancel), meter-based ultimate, ranked ELO ladder with tiers; solve exploiters first. [S69][S70][S61]
- Idle / incremental: offline growth, scarce timed stock with a global timer, weekly claim items that need you online, events that mutate crops or items. [S48][S94]
- Social PvP "steal": steal must be risky and visible, victim must have a counter (lock, shield, retrieve by hit), small servers amplify drama, but base theft needs a protected start (30 s lock). [S72][S78]
- Fishing: skill minigame plus stats plus index; EV table per location; rotating weather or totems. [S67][S6]
- Survival: day/night clock, fuel or campfire as the failure clock, co-op of 4 or a 20-25 player camp, weekly sandbox update party. [S66][S76][S30]
- Party / rounds: lobby to vote to round to results to payout in under 8-10 minutes; sell consumables in intermissions. [S50][S12] Gap pass: intermission about 20-35 s (devforum consensus, heuristic) [S139]; cap currency per round (MM2: 40 coins, 50 with a pass) [S143]; pay by placement in steps (DTI: 65 down by 5 per place) [S141]; use career stars or rank to gate a higher-tier server [S142]; run event quests as minigame variants (obby, race) inside the same game [S126].
- Racing: speed progression (levels raise speed), time trials as checkpoint races, vehicle collection with garage capacity as the sink. [S53][S86] Gap pass: start from the Studio Racing template [S127]; give the driver network ownership of the car when they sit, revert on exit [S131]; rank racers by checkpoints passed plus fraction to the next [S129]; add ghost opponents for solo runs (player request) [S126]; keep multi-assembly vehicles under about 10 in one area (bug report threshold) [S130]; do not rely on any published race-payout number, sources conflict [S132][S133].
- Roleplay (gap pass): ship systems (house, vehicle, prop spawners) rather than content [S149, unverified]; if you add an economy, add a value-proportional sink such as Bloxburg-style bills (0.6% of house value per in-game week, third-party) [S146]; keep a free base set and sell optional expression [S63][S145].

## Recipes (each becomes a skill)

### Recipe 1: First 5 minutes (FTUE) for any genre
When to use: at the start of every game build, after the core loop sentence is written.
Steps:
1. Spawn the player facing the first action. Place the first interactable within 20 studs of SpawnLocation so they act inside 10 seconds. [S103][S4]
2. Give starter currency (suggest enough for one purchase), so the first upgrade is affordable in under 30-60 s. Expose it as a tunable value (Attribute on a Configuration or a ModuleScript). [S3][S103]
3. Teach with visuals, not text: a highlighted button or arrow, a short caption of at most about 6 words. Use contextual triggers (entering a zone or acquiring an item); add a timed hint (about 10-11 s idle) shown once per task. [S4][S7]
4. Show three goals in the HUD: short (this session), mid (days), long (months): for example "buy dropper 2", "unlock zone 2", "complete index". [S3][S5]
5. Level XP: tiny thresholds for the first levels, then exponential. [S3]
6. Close with a celebration at minute 3-5: sound, confetti or beam, "new area unlocked" or first pet/rebirth preview. [S3]
7. Log each step as a funnel event so drop-off can be measured; use Experiments to A/B test hint delay (5 s vs 10 s) and starting cash. [S3][S4]
Pitfalls: long text tutorials, forced walking before the first reward, a sale prompt on the first load [S12], hints that appear before players try on their own.

### Recipe 2: Daily rewards, streaks, codes and dailies
When to use: when adding retention to any genre.
Steps:
1. Daily streak: store lastClaimDay (UTC day number = os.time() // 86400) and streak in the player's data. On join compute: same day = already claimed; next day = streak + 1; later = reset to 1 (or soften to a lower tier). Reward ladder suggestion for 7 days (heuristic): small soft currency days 1-6, a pet egg, luck potion or cosmetic on day 7. [S5][S38][S101]
2. Daily quests: 3 per day at easy/medium/hard tags, short, soft-currency rewards, never needing Robux; reset at UTC midnight with progress lost if incomplete. [S10][S5]
3. Codes: a server-checked table `{ code = {reward, expiresAt} }`, one redemption per player (store in DataStore), rotate codes with each update and announce them in the group and Discord. Codes shown as active in third-party wikis (Doors 36, Driving Empire 20, DTI 35) show how heavily top games lean on them. [S79][S86][S88]
4. Weekly claim item that needs the player online (as Grow a Garden does). [S48]
5. Surface a claim badge on the main HUD button. [S10]
Pitfalls: reward inflation (model the sink, see Recipe 18), client-trusted claim times, local-time resets (use server time; Workspace:GetServerTimeNow gives the client's estimate of server time). [S19]

### Recipe 3: Obby (classic checkpoint obby)
When to use: obby, difficulty chart or story obby.
Steps:
1. Create `Stages` folder with `Stage1..StageN` models; each holds a `Spawn` part tagged `Checkpoint` and an `Exit` trigger. Start with 30-50 stages. [S100]
2. Server script: on `Part.Touched` by a character, set `player:SetAttribute("Stage", n)` only if n is greater than current; set `player.RespawnLocation` to that spawn. Save Stage to the DataStore so players resume. [S41]
3. Kill bricks: parts tagged `Kill` that set `Humanoid.Health = 0` on touch (debounce per player).
4. Gap rules from the jump derivation: tutorial gaps 2-4 studs, hard max 8; vertical steps at most 6 studs. Measured ceiling for an optional expert tier: about 12 studs (skilled players call 13 the limit) [S119]; never put one in the main path.
5. Difficulty curve: first 20% completable by anyone, middle 50% timing and precision, last 30% hard combos (guide heuristic). [S100]
6. One new mechanic per stage group (moving part, spinner, disappearing part, conveyor), introduced alone, then combined. [S41]
7. Checkpoint feedback: sound, particle burst, stage number tween in the HUD. [S40]
8. Theme change every 10-20 stages; group stages into unlockable tiers or a hub with portals; place the first stage at spawn. [S100][S40]
9. Monetise lightly: skip-stage developer product, 2x coin pass, trails; no pop-up spam. [S39][S12]
10. For a difficulty chart: 20 stages per difficulty, easy tiers about 30% of the chart. [S104][S41]
Pitfalls: checkpoints too far apart, unreachable gaps for mobile players, stages with no content, spawning far from the first stage.

### Recipe 4: Round-based tower (Tower of Hell style)
When to use: obby that runs as timed rounds.
Steps:
1. Build a library of tagged sections with a difficulty rating and length; assemble N random sections each round (Tower of Hell's catalogue lists 364; a commonly seen live setup is six sections; sources disagree). [S82][S115]
2. Round loop: intermission (vote or shop) then build tower, countdown, shared timer, winners reach the top; falling only resets the current section, timer keeps running. Reference timer: 8 minutes for a normal tower, about 10 for a double-length Pro tower, with the timer speeding up once players finish (make the speed-up factor a tunable; sources word it differently). [S82][S113][S114][S115]
3. Offer one-round gear (jump boost, speed, trowel, hourglass) and mutators bought with round coins; coin cost scales with tower length. [S82]
4. Reward win with coins and a badge; sell Robux mutators in the intermission. [S12]
Pitfalls: section seams that need impossible jumps (validate gap math on every section); unfair random order (cap consecutive hard sections).

### Recipe 5: Tycoon
When to use: any tycoon, including "brainrot" or idle-base variants.
Steps:
1. Per-player plot: assign a plot model on PlayerAdded, tag the owner, auto-claim on spawn.
2. Core parts: Dropper (spawns Part with attribute `Value`), Conveyor (anchored part with `AssemblyLinearVelocity`), Collector (Touched adds Value to cash, destroys part). Cap live parts per plot (for example 100) with Debris to protect performance.
3. Buttons: a ProximityPrompt or touch pad per upgrade, hidden until the previous is bought; purchase deducts cash on the server, spawns the model.
4. Price ladder (kit values, heuristic): drop value 5 per 2 s; buttons 50, 250, 1,000...; each purchase 1-3 minutes of income. [S97]
5. First purchase inside 6-10 seconds (kit target about 6 s). [S99]
6. Rebirth: cost = floor(100,000 x 2.5^r), income x (1 + 0.5 r); confirm the cycle-length check (Recipe 18). First rebirth at about 15-25 minutes. [S97][S99]
7. Offline earnings: 25% of income rate for time away, capped at 8 hours (kit values). [S99]
8. Monetise: 2x cash pass, cash packs as developer products, auto-collect pass. [S97]
Pitfalls: client-side cash, unlimited dropper parts, uncapped offline income, tycoons hit by Roblox's 10-minute reward cap (expect lower creator rewards). [S29]

### Recipe 6: Simulator (collect, sell, zones, rebirth)
When to use: clickers, mining, strength, bee or pet simulators.
Steps:
1. Gain action on a server-validated remote (click or auto-collect pickup) with a cooldown (kit 0.08 s) and a per-player multiplier computed on the server. [S98]
2. Backpack capacity per tier; sell pad converts to coins at a sell zone, so the player makes a trip (Bee Swarm's field-to-hive pattern). [S83]
3. Upgrades: capacity, gain, speed with costs that rise geometrically (kit: 100/1,000/10,000/100,000 coins for 2x/3x/5x/10x). [S98]
4. Zones: unlock by currency or rebirth; each zone has about 3-8x the previous value multiplier (kit: 5,000 / 50,000 / 500,000 for 3x / 8x / 20x). [S98]
5. Rebirth: cost 1M x 2.5^r, gain 1 + 0.5 r; unlock a zone or pet slot with it (SaB and Ride a Pet add slots). [S98][S95][S96]
6. Add eggs and pets (Recipe 7) as the second system. [S102]
7. UI: refresh numbers on a 0.1 s interval, not on every change; abbreviate numbers. [S103]
8. Boost shop: "2x coins 15 minutes", "3x luck 1 hour" as developer products. [S102]
Pitfalls: first luck boost taking too long [S46]; endless rebirth costs that explode (use halving growth) [S33]; core loop exhaustion in 5-10 hours without events [S61].

### Recipe 7: Eggs, pets and luck with odds disclosure
When to use: any egg, crate, spin or gacha.
Steps:
1. Define a rarity table per egg with weights that sum to 100 (percent), for example Common 60, Uncommon 25, Rare 10, Epic 4, Legendary 1 (illustrative). Pick with a cumulative-weight function (snippet below). [S35]
2. Luck: multiply only the rare weights by luck, cap luck, renormalise to 100, and use the same function to build the odds UI so the display always matches the real odds. [S35][S17]
3. Show odds before purchase as percentages totalling 100%; if the list is long, a "Details" button (not just an icon). [S17]
4. On PlayerAdded call PolicyService:GetPolicyInfoForPlayerAsync(player); if ArePaidRandomItemsRestricted is true, hide paid eggs or route to a free path, a disclosed fixed sequence or a direct purchase; if IsPaidItemTradingAllowed is false block trading of paid results. [S17][S21]
5. Pet effects: one server multiplier from equipped pets (cap equipped slots, kit uses 3 early); pets scale by rarity (kit 1.2x / 1.5x / 3x / 8x). [S98]
6. Evolve or merge: Adopt Me style aging and Neon fusion (4 into 1) as a long goal and a sink. [S52]
7. Index screen: completing it grants a permanent bonus (SaB index 50%). [S93]
Pitfalls: hidden odds, luck that breaks the 100% total, client-rolled eggs, free eggs that make paid eggs pointless.

### Recipe 8: Tower defense
When to use: wave-based defense.
Steps:
1. Path: a Folder of numbered Parts `Waypoint1..N`; enemies move by tweening or Humanoid:MoveTo along them; server owns all enemies.
2. Match economy: starting cash, cash per kill and wave bonus; towers cost cash; economy towers (farms) trade early cash for income. Reference values from TDS (third-party wiki summaries, see Key facts): 20 / 25 / 30 / 40 waves for Easy / Casual / Intermediate / Fallen, $500 starting cash, a linear wave bonus such as $200 + (wave - 1) x $150 to $160 per wave, -10% bonus per extra player on Easy. Kill cash and enemy health per wave were not obtained, so define your own and playtest. [S125][S65]
3. Towers: placement validated on the server (grid or raycast onto a placement surface), upgrade paths with 3-5 levels, target modes (first, last, strongest).
4. Waves: data table of {enemyType, count, interval}; boss every 10 waves (heuristic); difficulty modes as separate wave tables (Easy to Hardcore). [S65]
5. Meta progression: coins buy towers, levels gate towers, weekly challenge trials with fixed loadouts. [S65]
6. Co-op: shared cash or individual cash, 1-4 players per match; a lobby that teleports a party into a reserved server (TeleportService:ReserveServerAsync then TeleportAsync). [S23]
Pitfalls: no cost-benefit for economy towers, tier lists forcing one meta, pay-to-win towers sold for Robux [S61], tower pathing exploits.

### Recipe 9: Horror with entities (Doors style)
When to use: procedural or floor-based horror.
Steps:
1. Level: a pool of room models; spawn the next room when the player nears the door; delete old rooms to cap parts (Doors: numbered rooms, floors). [S79]
2. Entity director: each entity has a tell (light flicker, sound, shake), a window to react and a counter (hide, stay still, item); a timer chooses entities by room number. [S79][S42]
3. Fairness: the player can always survive with correct play; no random deaths. [S42]
4. Audio first: ambient silence then sudden sounds; limited visibility via Lighting.Brightness low, ClockTime night and a flashlight or Candle item. [S42][S43][S44]
5. Run economy: Knobs-like currency bought in lobby, consumables in a pre-run shop. [S12][S79]
6. Ship floors or chapters rather than one release; each floor with a new entity set. [S61][S79]
7. Co-op: up to a few players, revive items; 22-25 per server for larger camp styles. [S76]
Pitfalls: jump scares on invisible brick touches [S44], too dark to see on mobile, solo-only hard runs.

### Recipe 10: Shift-based anomaly horror (Animal Hospital / Dandy's World style)
When to use: horror with repeated sessions.
Steps:
1. Define shift or floor structure with a clear teaching curve: early shifts teach, a pressure event around shift 4, a milestone at shift 5, then open-ended. [S74]
2. Core verb 1: detect (spot differences using window, photo and CCTV cues; 22 anomaly types in Animal Hospital). [S74]
3. Core verb 2: work (treatment minigames or extraction machines with skill checks, as in Dandy's World). [S84]
4. Meta: persistent soft currency (Ichor, Animal Coins), classes or toons with perk levels, trinkets with two slots per run. [S74][S84]
5. Ship 3 or more updates per month (the source counts that for Animal Hospital); mix coin events, content and lore. [S74]
Pitfalls: single-source numbers here are third-party; steep horror decay without episodic releases [S60].

### Recipe 11: Roleplay / hangout
When to use: social town, house or job RP.
Steps:
1. No levels, quests or currency walls; free access to a base set of houses, vehicles and jobs. [S63][S87]
2. Systems: claim-a-house (lock, key), vehicle spawner, job outfits via tools and UI, emotes, props. [S63]
3. Optional expression sales: gamepasses between about 275 and 800 Robux for premium properties and vehicles; keep a set of free vehicles. [S63]
4. Content cadence: a weekly drop (vehicles, props, houses, seasonal events), ideally on a fixed weekday. [S63][S87]
5. Server size around 20-30; chat and proximity voice are the social layer. [S87]
6. Add a Creator Cam toggle that hides the UI for video. [S7]
Pitfalls: roleplay is long-session, so creator rewards are lower; performance with hundreds of props, so stream and cap them. [S29]

### Recipe 12: Battlegrounds (free-for-all fighting)
When to use: PvP brawlers.
Steps:
1. Server-authoritative hit detection with client prediction for feel; hitboxes via Region or raycast on the server; per-attack cooldown.
2. Moves: M1 combo string, block, dash, ragdoll cancel recovery; each character has 4 skills. [S69]
3. Ultimate meter: damage dealt fills an Awakening bar; activating gives a timed powered form. [S69]
4. Matchmaking: casual free-for-all plus a ranked 1v1 or 2v2 with ELO tiers (Rivals: nine tiers, 200-ELO steps). [S69][S70]
5. Cosmetics: crates or keys, ranked rewards, event skins; avoid power in Robux. [S70]
6. Anti-exploit: validate every hit server side; third-party sources flag exploiter waves as the main risk. [S61]
Pitfalls: client-trusted damage, no skill ceiling, ranked decay (Rivals inactivity decay from Onyx I) missing.

### Recipe 13: Idle / incremental farming
When to use: Grow a Garden style or any offline-growth loop.
Steps:
1. Plot per player with plantable slots; each crop has plantedAt and growTime; growth completes by comparing server time, so offline growth works. [S48]
2. Shop stock: a global scheduler keyed on workspace time (floor(os.time() / 300)) so all servers see the same stock; seed and gear every 5 minutes, eggs every 30 minutes (third-party values from Grow a Garden). [S73][S94]
3. Weighted stock chances: staples always in stock, rare seeds with sub-1% chance per restock. [S94]
4. Events: weather or timed windows that apply a mutation multiplier to crops grown during them; keep event currency separate. [S6][S73]
5. Weekly exclusive item that needs the player online to claim. [S48]
6. Prestige: an ascension that converts currency into permanent upgrades (plot slots, egg capacity) with a rising fee (third-party: starting at 2 trillion Sheckles, every 4 hours). [S73]
7. Monetise speed-ups and extra plots, but be wary: the game was criticised for excessive monetisation. [S48]
Pitfalls: GAG2 added night theft but lost most of its CCU; offline progress is the retention engine, not PvP. [S92][S64]

### Recipe 14: Social PvP "steal" game (Steal a Brainrot / Steal an Egg)
When to use: collect-and-defend loops.
Steps:
1. Conveyor or biome supplies items by rarity; price rises with rarity; each owned item earns income per second. [S72]
2. Base per player with slots; locked for 30 s on join, 60 s on re-lock, plus 10 s per rebirth (SaB values). [S72][S95]
3. Steal: ProximityPrompt with HoldDuration on the item; while carrying, the thief is slowed and stripped of gear; hitting the thief returns the item to the owner's base. [S49][S72]
4. Counters: bat or slap tool, trap, temporary shield button; sold for cash or Robux (keep a free path). [S49]
5. Mutations and traits multiply income (SaB: 1.25x to 10x, stack multiplicatively); events apply traits. [S93]
6. Small servers (7 in Steal an Egg) make theft personal; large servers make it statistical. [S64]
7. Rebirth gives slots, lock time and gear. [S95]
8. Run weekly admin events and rivalry events; the 2025-08-23 admin war pushed the platform to record CCU. [S49][S56]
9. Anti-cheat: the game attracted automation scripts; validate all steals server side. [S49]
Pitfalls: pay-to-win gear [S49], base rules that let rich players farm new ones, victims with no counterplay.

### Recipe 15: Fishing / collecting
When to use: fishing, bug catching, treasure hunting.
Steps:
1. Cast: a power meter that sets distance; bite after a random wait scaled by a rod "bite speed" stat. [S67]
2. Reel minigame: hold to move a progress bar and keep it aligned with the fish; rod Control widens the safe zone, Resilience calms the fish. [S67]
3. Catch table per location: fish, rarity weights, value; compute expected value per cast and per hour (Roblox's example: 14G per cast). [S6]
4. Bait and totems modify luck and weather; mutations multiply value. [S67]
5. Index (bestiary): each species logged; completion rewards. [S67][S93]
6. Zones gated by rod tier; rods bought with soft currency; event rods limited. [S67]
7. Events: model the EV delta before launch and isolate with event currency. [S6]
Pitfalls: a rare fish that floods currency; reel difficulty fixed regardless of rod; mobile controls (tap, not hold-only).

### Recipe 16: Co-op survival (day/night base)
When to use: 99 Nights, Dead Rails style.
Steps:
1. Day: gather (trees, scrap), night: return to a fire; fuel is the failure clock (campfire logs, train coal). [S76][S66]
2. Goal ladder: a visible counter (night 99 or kilometres). [S76][S66]
3. Rescue or station objectives that shorten the run. [S76]
4. Classes bought with a persistent currency (Bonds, diamonds) from repeatable runs. [S66][S76]
5. Small co-op sessions (4 players for train, 20-25 for camp). [S66][S76]
6. Client responsiveness: keep movement and swings on the client with server verification of combat (99 Nights developer's approach). [S30]
7. Update cadence: events every two weeks and update parties. [S66][S30]
Pitfalls: scope creep (99 Nights built in about 3 months), fixing weak biomes before adding new zones [S64], unfair night difficulty spikes.

### Recipe 17: Party / minigame round loop
When to use: any lobby-based rounds (DTI, MM2, NDS, Forsaken).
Steps:
1. State machine on the server: Intermission, Vote (map or theme), Prepare, Round, Results, Reward. Use task.wait and a replicated value for the timer.
2. Round length: DTI 360 s dressing time; keep full cycle under about 8-10 minutes. [S50] Intermission 20-35 s, with 10 s for results and 20 s for voting in one developer's split (heuristic, 2020 devforum). [S139]
3. Roles assigned randomly (MM2 murderer, sheriff, innocents) with a comeback mechanic (dropped gun becomes a Hero). [S77]
4. Voting by other players (DTI star ratings, podium for top three). [S50]
5. Coins per round for participation and a bonus for winning (MM2: collect coins every round; boxes at 1,000). [S77]
6. Intermission is the contextual purchase spot (DTI theme props). [S12]
7. Seasonal event items with trade value drove MM2 to its all-time peak (1.35M CCU in 2026). [S64]
Pitfalls: lobby wait too long, role imbalance, eliminated players with nothing to do (give spectate or a minigame).

### Recipe 18: Economy balance check and event modelling
When to use: before shipping any currency, rebirth or event.
Steps:
1. Write sources (per hour income by stage) and sinks (shop, upgrades, rebirth, event shop).
2. Simulate in a spreadsheet or Luau: income(t), cost(r), T(r) = cost(r) / income(r). Plot with Desmos. [S34]
3. Choose cycle targets: first rebirth 15-30 min, later cycles up to 30-60 min (guides, heuristic). [S99]
4. Check unbounded growth: if cost growth R is greater than income growth per step, cycles stretch; either lower R (1.4-1.5), halve R at breakpoints, or add income sources per rebirth. [S33]
5. For random rewards compute EV per action; compare event EV to baseline. [S6]
6. Event currency: its own currency, own shop, sources and sinks equal in size. [S6]
7. After launch watch earned vs purchased currency, who buys what, when items are used. [S6]
Pitfalls: surplus currency that kills post-event spending, tuning from feel instead of numbers.

### Recipe 19: Live events, seasons and cadence
When to use: after launch.
Steps:
1. Cadence: a content drop every 2-4 weeks, each under 3 weeks of effort, mostly art variants (pet colours, vehicles, maps). [S9][S8]
2. Season: 1 month, 10 tiers, 1-week rest, manual claim, a new final reward retired afterwards, daily missions never needing Robux. [S10]
3. Event: limited-time with its own currency, a themed map or mode and a prestige item; announce countdown timers in the HUD. [S8][S6]
4. Social events: weekly or special admin events and collabs; Grow a Garden and Steal a Brainrot used them to drive record CCU. [S48][S56]
5. Collabs and IP: DTI collabs (2024-08, 2025-08, 2025-11) show brand tie-ins as a spike mechanism. [S50]
6. Update parties: a weekly 45-minute session with players (99 Nights). [S30]
7. Show a visible "last updated" signal: third-party data links recent updates to much better 6-month retention. [S61]
Pitfalls: one giant event without a calendar behind it (StudioKrew's key takeaway) [S64]; seasonal items that are never obtainable again without a trade market.

### Recipe 20: Racing, lobby circuit race (checkpoint track)
When to use: any lobby-queued race (cars, karts, boats, foot races).
Steps:
1. Start from Studio's Racing template (working car plus modular track) or Classic Racing template; copy the `Race` folder per track; checkpoints are Parts named `Checkpoint1` to `CheckpointN` in order, with min and max players and lap count configured per race. [S127][S128]
2. Server state machine: Queue (min players reached), Grid (cars held at the start, countdown 3-2-1), Race, Finish (results, payout), Reset. Replicate the state and a timer with Values (see the round-loop snippet). Use `os.clock()` for timing. [S129]
3. Vehicle control: when a player sits in the `VehicleSeat`, call `seat:SetNetworkOwner(player)` on the server; when they leave call `seat:SetNetworkOwnershipAuto()`; give loose parts of the car to the same owner. Anchored parts stay server-owned. [S131]
4. Checkpoint validation on the server: accept checkpoint k only if the racer already passed k-1; raycast from the last position to the new position to stop noclip or teleport exploits; add extra checkpoints at hairpins. [S129]
5. Live position: score = checkpointsPassed + fraction (0 to 1) of the distance between the last and next checkpoint; sort descending; break ties by arrival time (snippet below). [S129]
6. Payout by place with a base that scales with track length (third-party Driving Empire guides agree longer circuits pay more; numbers conflict, so define your own and tune from the Creator Dashboard). [S132][S133]
7. Onboarding: a three-step chain: get a car, do one timed run, place top 3 in a first race (Midnight Racing: Tokyo's event chain). [S126]
8. Solo play: add a time trial with a ghost of your best run (players asked for ghosts). [S126]
9. Progression and sinks: car shop with tiered prices, tuning parts, garage capacity, event cars; sell a 2x cash pass and a VIP pass (Driving Empire sells both). [S132][S86]
10. Performance: keep vehicles to as few assemblies as practical and watch for rubber-banding once an area holds about 10 or more multi-assembly vehicles (inference from the bug report threshold). [S130]
Pitfalls: client-owned checkpoint touches (exploits), wrong ownership causing jitter, arbitrary cash numbers that inflate once cars cost millions, using Touched on a thin checkpoint at high speed (devforum posters recommend a region larger than the checkpoint plus a raycast; search summary, unverified).

### Recipe 21: Party, judged round (Dress to Impress style)
When to use: creative or expressive rounds judged by other players (fashion, build, draw, dance).
Steps:
1. Server states: Lobby, Theme (announce or vote), Create (timer, about 5-6 minutes in DTI), Show (each player takes the stage in turn), Vote (each other player gives 1 to 5 stars), Podium (top three), Payout. [S50]
2. Voting rules: the server sums the stars (block self-rating: my recommendation); stars are saved as a career total that is separate from spendable cash (a guide summary says stars cannot be bought or picked up). [S142]
3. Payout by place from a table (DTI-style: first place 65, minus 5 per place down to seventh 35) plus participation pickups scattered in the build area and a lobby parkour worth about 50 to 100 that regenerates every minute. [S141]
4. Rank ladder: 14 tiers on career stars with widening bands (0-49, 50-199, 200-499, 500-999, 1,000-1,499, 1,500-2,999, 3,000-5,999 and so on up to 150,000 or more); use an early tier (3,000 stars) to unlock a higher-tier server and a visible cosmetic. [S142]
5. Modes beyond the standard round: duos, a 10-player elimination variant, freeplay without a timer, a VIP room. [S50]
6. Event quests that switch genre: a duo contest, an obstacle course and a race inside the same game, with a limited code or item for finishing all of them. [S126]
7. Marketing: short teasers a week before an event, then a reveal of the prize. [S126]
8. Monetise props and consumables during intermissions; Double Money style pass. [S12][S141]
Pitfalls: letting players self-vote, rank gaps that need hundreds of rounds before the first reward, content that skews to one audience (the DTI team added masculine options after noticing the gap). [S126]

### Recipe 22: Party, elimination minigame rotation (MM2, Natural Disaster Survival style)
When to use: a lobby that rotates short survival or role rounds.
Steps:
1. Round table of minigames or disasters; pick one per round with a vote or random, never the same twice in a row. (Natural Disaster Survival's rounds each pick a disaster such as earthquake, tornado or flood, per Wikipedia.) [S51]
2. Round and intermission timers: for short games 20 to 30 s rounds with 10 to 20 s intermission; for long games use a minimum of 20 to 35 s intermission with results then vote. [S139][S140] Heuristic, small samples.
3. Roles assigned by server at round start (murderer, sheriff, innocents) [S77]; players who die become spectators with a free camera and something to do (a next-round vote); the spectator part is my recommendation.
4. Per-round cap on currency (MM2: 40 coins per round, 50 with the Elite pass), so income is bounded and shop prices can be set from that cap. [S143]
5. Rewards: a flat participation reward plus a win bonus; log coins earned per round to tune prices. [S6]
Pitfalls: a lobby that waits for too many players before starting, unbalanced role odds, no catch-up for people who joined mid-round (make them wait for the next round).

### Recipe 23: Roleplay hangout (Brookhaven style: systems, not content)
When to use: open social town or city with no objectives.
Steps:
1. Build three spawner systems first: houses (claim, lock, key), vehicles (spawn one per player, despawn on leave), props (place, move, cap per player). This is the design intent attributed to Brookhaven's creator (unverified, from search summaries). [S149]
2. Public server of about 28 players (Brookhaven's size); proximity chat; a free base set of houses, vehicles and jobs. [S63][S87]
3. No levels, quests, currency walls or tutorial gates; a short signpost to the first house and vehicle spawner near spawn (my recommendation). [S63]
4. Roles via outfit and tool swaps (police, doctor, student, worker) so players self-assign identity. [S144]
5. Optional paid expression: passes between about 275 and 800 Robux for premium properties and vehicles, with free alternatives kept. [S63]
6. Weekly drop on a fixed weekday (new vehicles, houses, props, seasonal). [S63][S87]
7. Creator Cam: a button that hides all UI for recording. [S7]
8. Performance: cap props and vehicles per player, enable StreamingEnabled for large maps (see 04). [S29]
Pitfalls: roleplay is a long-session genre, so Creator Rewards pay less; chat and moderation load rise with player count; unlimited props kill frame rate.

### Recipe 24: Life-sim hangout with an economy (Bloxburg style)
When to use: roleplay with jobs, building and bills.
Steps:
1. Income: jobs and small tasks pay in-game currency that scales with a work-experience level and a mood or efficiency modifier (third-party; job pay numbers conflict, so define your own). [S146][S147]
2. Sinks: furniture and building cost plus a recurring bill equal to a percent of house value per in-game week (Bloxburg: 0.6%, 0.3% with Premium; a game week is 2 h 48 min of real time). Cap relief items (solar panels save at most 20% in total). [S146]
3. Building tool: a plot per player with an object budget, saved to a DataStore.
4. Monetise: currency packs in tiers, passes that raise building capacity or add exclusive furniture, Premium discounts; keep most of the game free. [S145]
5. Pricing: set currency prices so that the first house is reachable in a few sessions (my recommendation); log bills paid vs bills overdue.
Pitfalls: bills that outrun income at high house value (make bills a percent, not a fixed number, and cap the benefit of relief items); Bloxburg charged 25 Robux at entry until it went free on 2024-06-15, so an entry fee is a known option for a paid-entry life-sim. [S145][S51]

## Luau reference snippets

Weighted pick (cumulative weights; based on the devforum pattern [S35]):
```lua
local rng = Random.new()

local function pickWeighted(weights: {[string]: number}): string
	local total = 0
	for _, w in weights do total += w end
	local roll = rng:NextNumber(0, total)
	local acc = 0
	for name, w in weights do
		acc += w
		if roll <= acc then return name end
	end
	error("empty weight table")
end
```

Luck applied to rare weights, with odds normalised to percent for the UI (so what is displayed equals what is rolled):
```lua
local function applyLuck(base: {[string]: number}, rareNames: {[string]: boolean}, luck: number): {[string]: number}
	local out, total = {}, 0
	for name, w in base do
		local v = if rareNames[name] then w * math.min(luck, 5) else w
		out[name] = v
		total += v
	end
	for name, v in out do out[name] = v / total * 100 end
	return out
end
```

Rebirth cost with geometric growth and a halving breakpoint (pattern from [S32][S33]; values are examples):
```lua
local function rebirthCost(r: number, base: number?, growth: number?): number
	local cost = base or 1_000_000
	local g = growth or 0.5  -- 50% per rebirth
	local nextHalve = 100
	for i = 1, r do
		cost *= (1 + g)
		if i >= nextHalve then g /= 2; nextHalve *= 2 end
	end
	return cost
end
```

Number abbreviation for big currencies:
```lua
local SUFFIXES = {"", "K", "M", "B", "T", "Qa", "Qi"}
local function abbreviate(n: number): string
	local i = 1
	while n >= 1000 and i < #SUFFIXES do n /= 1000; i += 1 end
	if i == 1 then return tostring(math.floor(n)) end
	return string.format("%.2f%s", n, SUFFIXES[i])
end
```

Daily streak (pure function; persistence belongs in a DataStore, see 04):
```lua
local function nextStreak(lastClaimDay: number?, streak: number, now: number): (number, boolean)
	local today = now // 86400
	if lastClaimDay == today then return streak, false end      -- already claimed
	if lastClaimDay == today - 1 then return streak + 1, true end -- continued
	return 1, true                                               -- broken
end
```

Paid random item gate (fields verified in docs [S17][S21]):
```lua
local PolicyService = game:GetService("PolicyService")
local Players = game:GetService("Players")

local restricted: {[Player]: boolean} = {}
Players.PlayerAdded:Connect(function(player)
	local ok, info = pcall(function()
		return PolicyService:GetPolicyInfoForPlayerAsync(player)
	end)
	restricted[player] = ok and info.ArePaidRandomItemsRestricted == true
end)
```

Jump envelope from documented defaults [S18][S19]:
```lua
local GRAVITY = workspace.Gravity           -- 196.2 by default
local function maxJumpGap(walkSpeed: number, jumpHeight: number): number
	local v = math.sqrt(2 * GRAVITY * jumpHeight)
	return walkSpeed * (2 * v / GRAVITY)   -- about 8.7 studs at 16 / 7.2; one 2020 devforum test measured about 9.6 [S116]
end
```

Race position score (progress between checkpoints; pattern from devforum [S129]; own implementation):
```lua
-- passed: number of checkpoints already cleared; prevPos/nextPos: positions of the last and next checkpoint parts
local function raceScore(passed: number, prevPos: Vector3, nextPos: Vector3, racerPos: Vector3): number
	local seg = nextPos - prevPos
	local len2 = seg:Dot(seg)
	if len2 == 0 then return passed end
	local t = math.clamp((racerPos - prevPos):Dot(seg) / len2, 0, 1)
	return passed + t
end
-- sort racers by raceScore descending; break ties by the os.clock() timestamp of the last checkpoint
```

Vehicle network ownership (pattern documented in [S131]):
```lua
local Players = game:GetService("Players")

local function bindSeat(seat: VehicleSeat)
	seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		local humanoid = seat.Occupant
		if humanoid then
			local player = Players:GetPlayerFromCharacter(humanoid.Parent)
			if player then
				seat:SetNetworkOwner(player)
			end
		else
			seat:SetNetworkOwnershipAuto()
		end
	end)
end
```

Round loop skeleton:
```lua
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local state = ReplicatedStorage:WaitForChild("RoundState") -- StringValue
local timer = ReplicatedStorage:WaitForChild("RoundTimer") -- IntValue

local function countdown(label: string, seconds: number)
	state.Value = label
	for t = seconds, 1, -1 do
		timer.Value = t
		task.wait(1)
	end
end

task.spawn(function()
	while true do
		countdown("Intermission", 20)
		if #Players:GetPlayers() >= 2 then
			countdown("Round", 360)
			countdown("Results", 10)
		end
	end
end)
```

Steal prompt (server script on the item):
```lua
local prompt = Instance.new("ProximityPrompt")
prompt.ActionText = "Steal"
prompt.HoldDuration = 1.5
prompt.MaxActivationDistance = 8
prompt.RequiresLineOfSight = false
prompt.Parent = itemPart
prompt.Triggered:Connect(function(player: Player)
	-- verify on the server: base unlocked, item owned by someone else, player not already carrying
end)
```
(HoldDuration, MaxActivationDistance, ActionText, RequiresLineOfSight and Triggered are documented properties and event [S24]; the numeric values here are examples.)

## Open questions / unverified
- Rivals: no developer interview or talk found; only wiki and guide summaries. (Searched interview, spotlight and RDC terms.)
- The Strongest Battlegrounds: no developer interview or talk found; only an Innovation Awards mention and wiki data.
- Blox Fruits: no developer interview or talk found; economy and balance rules are not published. A third-party revenue estimate seen in a search result was not verified and is excluded.
- Pet Simulator 99: no developer interview found; the studio's own update posts give event numbers but not base hatch odds. Community "huge pet chance" tables are estimates (one aggregator page was future-dated and is excluded).
- Brookhaven: no interview with its creator found; the design-intent claims (house, vehicle and prop systems, weekly updates) come from search summaries of pages that could not be fetched.
- Talk transcripts not accessed: the Fisch developer livestream (2026-03-11), Onett's RDC 2022 first-time-experience talk, and the GDC 2026 session by Piercen Harbut and Alec Kieft; only titles and dates are known.
- Actual economy constants (costs, drop rates, kill cash, enemy health) of top games are private. Everything labelled "kit values" or "heuristic" is a plausible starting point, not what a hit uses. Third-party wiki numbers (Steal a Brainrot rebirths, Grow a Garden timers, mutation multipliers, Blox Fruits levels) change with updates and could not be cross-checked in the game.
- No per-genre D1/D7/D30 from a large, method-disclosed sample exists in what was found: GameAnalytics has the large sample but no genre split; BLOXG has genre rows but an undisclosed method and levels above GameAnalytics' 99th percentile. Roblox's Creator Dashboard genre benchmark is the only reliable genre comparison and its values are not published in the docs.
- Tower of Hell: the 8-minute round is agreed by three third-party sources, but section counts conflict (364 catalogue, 17 after a 2021 cut per one source, about six per tower in live rounds) and the speed-up rule when players finish is worded differently ("speeds up the next round" vs "effectively doubling"). Verify in the live game.
- Obby jump limits: the only measured horizontal value (about 9.6 studs) is one 2020 test by one developer; the 12 to 13-stud figures are community statements without a stated measuring method; no first-party maximum exists. Verify with a test run in Studio. The engine helper `workspace:CalculateJumpHeight` appeared only in a devforum post and was not found in the Workspace reference page that was fetched.
- Tower Defense Simulator: wave bonus formulas and starting cash are from search summaries of Fandom pages (fetch blocked, HTTP 402); per-wave kill cash, enemy health and the Farm tower's current upgrade costs were not obtained (search results mixed several game versions for the Farm).
- Racing: no first-party economy numbers; the Racing template's default attribute values are not published in the announcement; no sourced catch-up (rubber-band) design; no racing-specific retention figure.
- Driving Empire payouts: two third-party wikis disagree by 2 to 3 times on a drag-race win (10-12K vs 4,500), so none of those numbers are used as targets.
- Bloxburg job pay: one guide ranks Pizza Delivery as the best job and another page's title says all 14 jobs were given the same pay rate in 2024; the second page's body could not be read. The bill formula (0.6% of house value per in-game week) is from a third-party page citing the game's wiki (dated 2026-09-14).
- Plants vs Brainrots, Escape Tsunami for Brainrots and "+1 Speed" mechanics were seen only in listings or a single wiki; no primary description.
- Grow a Garden weather multipliers (Rain, Blood Moon, Moonlit) appeared only in a search snippet and one guide that refused to give numbers; not included.
- The rolearn.dev "simulator 500 to 50k" case study is explicitly an illustrative (invented) example; its numbers were excluded.
- Wikipedia pages, Bloxodes and RoWatcher were read through a summariser and some Wikipedia entries redirect to "List of Roblox games"; dates and CCU figures may differ by one day between sources (for example the 25M record is September 2025 in the Roblox letter and October 2025 in Wikipedia); counts (houses, pets, towers) can be stale within days. Adopt Me revenue figures also differ between pages ($60M annual in one, over $16M in another).
- Midnight Racing: Tokyo's reported 1.3M DAU and 8.3K peak CCU appear in the same Roblox post and the scope (event period vs game) is unclear.

## Sources
Trust labels: P = Roblox primary or official, D = Roblox devforum (named community authors), W = Wikipedia or press, T = third-party analytics, wiki or guide. All fetched 2026-10-04 unless a publication date is given.

[S1] Design games on Roblox (index), Roblox Creator Hub, https://create.roblox.com/docs/production/game-design (P)
[S2] Core loops, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/core-loops (P)
[S3] Onboarding, Roblox Creator Hub (raw GitHub creator-docs), https://create.roblox.com/docs/production/game-design/onboarding (P)
[S4] Onboarding techniques, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/onboarding-techniques (P)
[S5] Introduction to quest design, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/introduction-to-quest-design (P)
[S6] Balance virtual economies, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/balance-virtual-economies (P)
[S7] Design for Roblox, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/design-for-roblox (P)
[S8] LiveOps essentials, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/liveops-essentials (P)
[S9] Content updates, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/content-updates (P)
[S10] Season pass design, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/season-pass-design (P)
[S11] Monetization foundations, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/monetization-foundations (P)
[S12] Contextual purchases, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/contextual-purchases (P)
[S13] Subscription design, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/subscription-design (P)
[S14] UI/UX design, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/ui-ux-design (P)
[S15] Prototyping, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/prototyping (P)
[S16] Analytics essentials, Roblox Creator Hub, https://create.roblox.com/docs/production/game-design/analytics-essentials (P)
[S17] Paid random items policy, Roblox Creator Hub, https://create.roblox.com/docs/production/monetization/paid-random-items (P)
[S18] Humanoid class reference (creator-docs YAML), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Humanoid.yaml (P)
[S19] Workspace class reference (creator-docs YAML), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Workspace.yaml (P)
[S20] Players class reference (creator-docs YAML), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Players.yaml (P)
[S21] PolicyService class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/PolicyService (P)
[S22] BadgeService class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/BadgeService (P)
[S23] TeleportService class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/TeleportService (P)
[S24] ProximityPrompt class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt (P)
[S25] Optimizing discovery so great games reach millions of players, Roblox newsroom, 2026-06-15, https://about.roblox.com/newsroom/2026/06/optimizing-discovery-great-games-reach-millions-players-roblox (P)
[S26] Roblox Q2 2026 Earnings Shareholder Letter, Roblox Corp, 2026-07-30, https://s27.q4cdn.com/984876518/files/doc_financials/2026/q2/Roblox-Q2-2026-Earnings-Shareholder-Letter.pdf (P)
[S27] Roblox Q1 2026 Earnings Shareholder Letter, Roblox Corp, 2026, https://s27.q4cdn.com/984876518/files/doc_financials/2026/q1/Q1-2026-Earnings-Shareholder-Letter.pdf (P)
[S28] Roblox Q4 2025 Shareholder Letter, Roblox Corp, https://s27.q4cdn.com/984876518/files/doc_financials/2025/q4/Q4-2025-Shareholder-Letter.pdf (P)
[S29] Introducing Creator Rewards, Roblox staff, devforum, 2025-07, https://devforum.roblox.com/t/introducing-creator-rewards-earn-more-by-growing-the-community/3777628 (P/D)
[S30] Creator Spotlight: The Story Behind 99 Nights in the Forest, Roblox devforum, 2025-10-31, https://devforum.roblox.com/t/creator-spotlight-the-story-behind-99-nights-in-the-forest/4036940 (P/D)
[S31] Simulator Formulas (Fusionet, Ailore, ThanksRoBama), devforum, https://devforum.roblox.com/t/simulator-formulas/853976 (D, 2020, stale)
[S32] Simulator Rebirth Formula (sonic_848), devforum, https://devforum.roblox.com/t/simulator-rebirth-formula/3162074 (D)
[S33] Good formula to calculate amount needed to rebirth (Barty200), devforum, https://devforum.roblox.com/t/good-formula-to-calculate-amount-needed-to-rebirth/1047686 (D, 2020-21, stale)
[S34] Balancing exponential upgrade progression (Whimzer, ovftl, AC_Starmarine), devforum, https://devforum.roblox.com/t/balancing-exponential-upgrade-progression/2434950 (D, 2023)
[S35] RNG system with luck increase (Inconcludable, Azarctic, simplyjustbased), devforum, https://devforum.roblox.com/t/rng-system-with-luck-increase/2173814 (D, 2022)
[S36] Need help balancing my new game (azqjanna), devforum, https://devforum.roblox.com/t/need-help-balancing-my-new-game/3684460 (D, 2025)
[S37] How do I properly price things in my tycoon? (anon22379117), devforum, 2023-03-12, https://devforum.roblox.com/t/how-do-i-properly-price-things-in-my-tycoon/2215102 (D)
[S38] How to improve player retention (SubtotalAnt8185, ArneyFlarney, iGottic), devforum, https://devforum.roblox.com/t/how-to-improve-player-retention/2574477 (D, 2023)
[S39] Advice on making an obby (RaterixRGL, phantasmability, AkroThorn and others), devforum, https://devforum.roblox.com/t/advice-on-making-an-obby/2504609 (D, 2023)
[S40] Suggestions to improve playtime in my unique obby game (3rdhoan123 "Future Noob"), devforum, https://devforum.roblox.com/t/suggestions-to-improve-playtime-in-my-unique-obby-game/3916633 (D, 2025)
[S41] The Guide To Making A Difficulty Chart, Part 1 (Shr3ne), devforum, 2021-03-28, https://devforum.roblox.com/t/the-guide-to-making-a-difficulty-chartpart-1/1135152 (D, stale)
[S42] What makes a good/intense/scary Horror Game? (Geody, Future Noob, sylv, TheBaconHero and others), devforum, https://devforum.roblox.com/t/what-makes-a-goodintensescary-horror-game/1885996 (D, 2022)
[S43] How to make a game actually Scary (Awyrbot, Wigglyaa, SpaceGame_s and others), devforum, https://devforum.roblox.com/t/how-to-make-a-game-actually-scary/2566578 (D, 2023)
[S44] How to make a good horror game I guess (ikespicey), devforum, 2022-08-05, https://devforum.roblox.com/t/how-to-make-a-good-horror-game-i-guess-for-beginners/1908703 (D)
[S45] Feedback on my latest incremental game (Eat Food To Get Rich; tz_ow, Dizazter), devforum, https://devforum.roblox.com/t/feedback-on-my-latest-incremental-game/3461038 (D, 2025)
[S46] Need feedback on incremental game (Touch falling orbs; Leviikori), devforum, https://devforum.roblox.com/t/need-feedback-on-incremental-game/3881184 (D, 2025)
[S47] How To Make ROBLOX "Steal A Brainrot" Game tutorial series (TwinPlayzDev), devforum, 2025-12-09, https://devforum.roblox.com/t/how-to-make-roblox-%E2%80%9Csteal-a-brainrot%E2%80%9D-game-tutorial-series/4137672 (D)
[S48] Grow a Garden, Wikipedia, https://en.wikipedia.org/wiki/Grow_a_Garden (W)
[S49] Steal a Brainrot, Wikipedia, https://en.wikipedia.org/wiki/Steal_a_Brainrot (W)
[S50] Dress to Impress (video game), Wikipedia, https://en.wikipedia.org/wiki/Dress_to_Impress_(video_game) (W)
[S51] List of Roblox games, Wikipedia, https://en.wikipedia.org/wiki/List_of_Roblox_games (W)
[S52] Adopt Me!, Wikipedia, https://en.wikipedia.org/wiki/Adopt_Me! (W)
[S53] Sonic Speed Simulator, Wikipedia, https://en.wikipedia.org/wiki/Sonic_Speed_Simulator (W)
[S54] Roblox, Wikipedia, https://en.wikipedia.org/wiki/Roblox (W)
[S55] Data shows gamers are not graduating out of Roblox as they age up, GamesBeat Summit recap, 2026-06-26, https://gamesbeat.com/data-shows-gamers-are-not-graduating-out-of-roblox-as-they-age-up/ (W)
[S56] Poll: Who will win the admin abuse war, Beebom, 2025-08, https://beebom.com/poll-who-will-win-admin-abuse-war-grow-a-garden-vs-steal-a-brainrot/ (W)
[S57] Pryor Cashman client Grandma's Favourite Games' 99 Nights in the Forest headed to the big screen, Pryor Cashman, 2026-04-14, https://www.pryorcashman.com/news/pryor-cashman-client-grandmas-favourite-games-99-nights-in-the-forest-headed-to-the-big-screen (W)
[S58] Game Changers: Evan and the goofy vision behind Dead Rails, NWPS Media (repost of Roblox content), 2026-05-28, https://media.nwps.fi/2026/05/28/game-changers-evan-and-the-goofy-vision-behind-dead-rails/ (W)
[S59] How we build hit Roblox games, Matthew Warneford (Dubit), 2026-03-19, https://dubit.io/blog/how-we-build-hit-roblox-games (T)
[S60] Roblox retention by genre: which games keep players longest, RoWatcher News (no date or author), https://rowatcher.com/news/roblox-retention-by-genre-which-games-keep-players-longest (T)
[S61] One year on the charts: what really happens after a Roblox game goes viral, RoWatcher News, 2026, https://rowatcher.com/news/one-year-on-the-charts-what-really-happens-after-a-roblox-game-goes-viral (T)
[S62] Dress To Impress: how a teen developer's fashion game hit 9.7 billion visits, RoWatcher News, 2026, https://rowatcher.com/news/dress-to-impress-how-a-teen-developer-s-fashion-game-hit-9-7-billion-visits (T)
[S63] What is Brookhaven RP, RoWatcher News, 2026, https://rowatcher.com/news/what-is-brookhaven-rp-why-400k-players-choose-roblox-s-biggest-game (T)
[S64] Top Roblox Games August 2026 (snapshot 2026-08-20), StudioKrew, https://studiokrew.com/blog/top-roblox-games-august-2026/ (T)
[S65] Tower Defense Simulator wiki, Bloxodes, snapshot 2026-10-04, https://bloxodes.com/wiki/tower-defense-simulator (T)
[S66] Dead Rails wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/dead-rails (T)
[S67] Fisch wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/fisch (T)
[S68] Blox Fruits wiki, Bloxodes, 2026-09-27, https://bloxodes.com/wiki/blox-fruits (T)
[S69] The Strongest Battlegrounds wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/the-strongest-battlegrounds (T)
[S70] Rivals wiki, Bloxodes, 2026-09-25, https://bloxodes.com/wiki/rivals (T)
[S71] Pet Simulator 99 wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/pet-simulator-99 (T)
[S72] Steal a Brainrot wiki, Bloxodes, 2026-10-04, https://bloxodes.com/wiki/steal-a-brainrot (T)
[S73] Grow a Garden wiki, Bloxodes, 2026-10-04, https://bloxodes.com/wiki/grow-a-garden (T)
[S74] Animal Hospital wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/animal-hospital (T)
[S75] Kick a Lucky Block wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/kick-a-lucky-block (T)
[S76] 99 Nights in the Forest wiki, Bloxodes, 2026-10-04, https://bloxodes.com/wiki/99-nights-in-the-forest (T)
[S77] Murder Mystery 2 wiki, Bloxodes, 2026-09-24, https://bloxodes.com/wiki/murder-mystery-2 (T)
[S78] Steal An Egg wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/steal-an-egg (T)
[S79] DOORS wiki, Bloxodes, 2026-10-02, https://bloxodes.com/wiki/doors (T)
[S80] Forsaken wiki, Bloxodes, 2026-10-02, https://bloxodes.com/wiki/forsaken (T)
[S81] Adopt Me wiki, Bloxodes, 2026-10-04, https://bloxodes.com/wiki/adopt-me (T)
[S82] Tower of Hell wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/tower-of-hell (T)
[S83] Bee Swarm Simulator wiki, Bloxodes, 2026-08-22, https://bloxodes.com/wiki/bee-swarm-simulator (T)
[S84] Dandy's World wiki, Bloxodes, 2026, https://bloxodes.com/wiki/dandys-world (T)
[S85] Flee the Facility wiki, Bloxodes, 2026-10-01, https://bloxodes.com/wiki/flee-the-facility (T)
[S86] Driving Empire wiki, Bloxodes, 2026-10-02, https://bloxodes.com/wiki/driving-empire (T)
[S87] Brookhaven RP wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/brookhaven-rp (T)
[S88] Dress To Impress wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/dress-to-impress (T)
[S89] Sol's RNG wiki, Bloxodes, 2026-10-04, https://bloxodes.com/wiki/sols-rng (T)
[S90] Piggy wiki, Bloxodes, 2026-10-03, https://bloxodes.com/wiki/piggy (T)
[S91] Blade Ball wiki, Bloxodes, 2026-10, https://bloxodes.com/wiki/blade-ball (T)
[S92] Grow a Garden 2 wiki, Bloxodes, 2026-09-30, https://bloxodes.com/wiki/grow-a-garden-2 (T)
[S93] Steal a Brainrot calculator (mutation and trait multipliers), stealabrainrot-calculator.com, https://stealabrainrot-calculator.com/ (T, unverified)
[S94] Grow a Garden stock and restock tracker, gagcalculatorvalue.com, https://gagcalculatorvalue.com/stock (T)
[S95] Steal a Brainrot rebirth guide, Eldorado.gg blog, 2026-08-16, https://www.eldorado.gg/blog/steal-a-brainrot-en/steal-a-brainrot-rebirth-guide/ (T)
[S96] Ride a Pet rebirth guide, games.gg, 2026-09-17, https://games.gg/roblox/guides/ride-a-pet-rebirth-guide/ (T)
[S97] How to make a Roblox tycoon game (2026), Generalist Programmer, 2026-06-16 (updated 06-24), https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game (T, heuristic)
[S98] How to make a Roblox simulator game (2026), Generalist Programmer, 2026-06-24, https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-simulator-game (T, heuristic)
[S99] How to make a Roblox tycoon (with AI), Sametcan Tasgiran, Picoo, 2026-04-15 (updated 2026-09-24), https://picoo.io/how-to-make/roblox-tycoon (T, heuristic)
[S100] Roblox obby design guide, creation.dev, 2026-02-16, https://www.creation.dev/blog/roblox-obby-design-guide (T, heuristic)
[S101] Roblox player retention, creation.dev (unsourced benchmarks), https://www.creation.dev/blog/roblox-player-retention (T, unsourced)
[S102] Roblox simulator games guide, Jordan Brooks, GameCratex, 2026-05-31, https://gamecratex.com/simulator-games-guide/ (T)
[S103] How to make a simulator on Roblox, Kitsblox, https://www.kitsblox.com/blog/how-to-make-simulator-roblox (T, heuristic)
[S104] Obby (genre overview), Obby Wiki, updated 2026-04-30, https://obby.wiki/wiki/Obby (T)
[S105] Hardest Roblox obbies: ranking method and 2026 list, Seeles, audit 2026-08-07, https://www.seeles.ai/resources/blogs/hardest-roblox-obbies (T)
[S106] Grow a Garden 2 weather, events and timers guide, PixelTwelve, 2026-07-28, https://pixeltwelve.com/articles/grow-a-garden-2-weather-guide (T; it deliberately gives no fixed multipliers)

Gap pass sources (S107-S159), all fetched or searched 2026-10-04. "Search summary" means the page was not fetchable and the content came from a search-result summary.
[S107] 2026 Roblox Benchmark Report, GameAnalytics, 2026 (data 2025-08-01 to 2026-07-31), https://www.gameanalytics.com/reports/2026-roblox-report (T, large sample, no genre split)
[S108] The 2025 Roblox Benchmark Report, GameAnalytics, 2025 (data 2023-01 to 2025-07), https://www.gameanalytics.com/reports/2025-roblox-report (T)
[S109] Roblox Retention Rate Benchmarks by Genre (2026), BLOXG, updated March 2026, https://bloxg.com/statistics/roblox-retention-benchmarks (T, vendor, "850+ promoted games", method undisclosed)
[S110] GameAnalytics: Key Roblox and Roblox Game Metrics in 2026, Mellow (gamedevreports Substack), 2026, https://gamedevreports.substack.com/p/gameanalytics-key-roblox-and-roblox (T)
[S111] Retention (analytics docs), Roblox Creator Hub (creator-docs raw GitHub), https://create.roblox.com/docs/production/analytics/retention (P)
[S112] Analytics: View retention by acquisition source and select your benchmark set, Roblox staff, devforum, 2025-10-16, https://devforum.roblox.com/t/analytics-view-retention-by-acquisition-source-and-select-your-benchmark-set/4010157 (P/D)
[S113] Tower of Hell Wiki, towerofhell.wiki, https://towerofhell.wiki/ (T)
[S114] Tower of Hell Roblox Guide: How It Works (2026), BloxBonuses, https://bloxbonuses.com/articles/tower-of-hell-guide/ (T)
[S115] Tower of Hell Beginner Guide, Bloxodes, 2026-08-28, https://bloxodes.com/articles/tower-of-hell-beginner-guide (T)
[S116] Calculating maximum player jump distance (General_Scripter, triankl3, blokav), devforum, 2020-02-10, https://devforum.roblox.com/t/calculating-maximum-player-jump-distance/455105 (D, stale, n=1 test)
[S117] How to calculate how many studs a player can jump based on JumpPower (buildthomas 2018-03-04, xDeltaXen 2021-11-24, Spare_Access 2024-01-01), devforum, https://devforum.roblox.com/t/how-to-calculate-how-many-studs-a-player-can-jump-based-on-jumppower/100480 (D)
[S118] Help with this formula (blokav 2021-01-17, anon83580091 2021-09-04), devforum, https://devforum.roblox.com/t/help-with-this-formula/988618 (D; reports 6.37 studs as the formula height at JumpPower 50)
[S119] I think we made an obby game that is too difficult (Arikiyo, MooMooManager, 0x1437), devforum, September 2024 (year inferred from thread number), https://devforum.roblox.com/t/i-think-we-made-an-obby-game-that-is-too-difficult/3154717 (D)
[S120] What are some difficult jumps for an obby (Plasmacticus, SneakerDude2), devforum, 2021-08-26, https://devforum.roblox.com/t/what-are-some-difficult-jumps-for-an-obby/1438293 (D, stale)
[S121] Creator Spotlight: WoozyNate Makes a Splash with Fisch, Roblox, devforum, 2024-11-22, https://devforum.roblox.com/t/creator-spotlight-woozynate-makes-a-splash-with-fisch/3269481 (P/D)
[S122] Inside the Development of Roblox Fisch (developer deep dive livestream listing), Roblox Events, 2026-03-11, https://events.roblox.com/public/events/fisch-developer-deep-dive (P; listing only, replay not transcribed)
[S123] Fisch, Fischipedia, https://fischipedia.org/wiki/Fisch (T)
[S124] Creator Spotlight: BelowNatural's Journey Building Paradoxum Games, Roblox, devforum, 2024-06-17, https://devforum.roblox.com/t/creator-spotlight-belownatural%E2%80%99s-journey-building-paradoxum-games/3027035 (P/D)
[S125] Tower Defense Simulator wiki pages Easy Mode, Casual Mode, Intermediate Mode, Fallen Mode and Waves, Fandom, https://tds.fandom.com/wiki/Easy_Mode (T; search summary, pages returned HTTP 402)
[S126] Behind The Games: Midnight Racing: Tokyo, Dress to Impress, and Michael's Zombies, Roblox staff, devforum, 2024-08-23, https://devforum.roblox.com/t/behind-the-games-midnight-racing-tokyo-dress-to-impress-and-michael%E2%80%99s-zombies/3131289 (P/D)
[S127] New Studio Racing Template!, Roblox staff, devforum, 2024-01-23, https://devforum.roblox.com/t/new-studio-racing-template/2805745 (P/D; attribute names for the Engine folder come from search results on this thread)
[S128] Templates (Racing and Classic Racing), Roblox Creator Hub, https://create.roblox.com/docs/resources/templates (P)
[S129] Racing: How To Keep Track Of Race Positions (GeorgeOfAIITrades, Corecii, Kiansjet, Quenty), devforum, 2018-03-14, https://devforum.roblox.com/t/racing-how-to-keep-track-of-race-positions/104806 (D, stale)
[S130] Severe Vehicle Rubber-Banding Experienced During High Player Count Sessions, devforum bug report, 2025-01-15, https://devforum.roblox.com/t/severe-vehicle-rubber-banding-experienced-during-high-player-count-sessions/3381709 (D)
[S131] Network ownership, Roblox Creator Hub (creator-docs raw GitHub), https://create.roblox.com/docs/physics/network-ownership (P)
[S132] Driving Empire Beginner Guide, drivingempirewiki.wiki, https://drivingempirewiki.wiki/en/guides/driving-empire-beginner-guide/ (T; numbers conflict with S133)
[S133] Driving Empire 2026 New Player Roadmap, drivingempirewiki.wiki, https://drivingempirewiki.wiki/en/guides/driving-empire-2026-new-player-roadmap/ (T; cites only "community testing")
[S134] Driving Empire (Voldex), Fandom, https://roblox.fandom.com/wiki/Driving_Empire_by_Voldex/Driving_Empire (T; search summary)
[S135] Legends Of Speed, Rolimons, https://www.rolimons.com/game/3101667897 (T)
[S136] Legends Of Speed Rebirth and Legends Of Speed (Fandom), https://legends-of-speed.fandom.com/wiki/Rebirth (T; search summary)
[S137] "AI won't take away jobs, it'll be an augmentation tool" (Delus, Dream Racers, GDC 2026 interview), Mogura VR English, published 2026-05-25, https://www.moguravr.com/roblox-creator-interview-gdc2026-en/ (W)
[S138] Feedback on a kart racing game, devforum, June 2022, https://devforum.roblox.com/t/feedback-on-a-kart-racing-game/1831855 (D, stale)
[S139] Ideal intermission time (IAmPinleon, DecodedMint, CheetahSp33d, minkmink), devforum, 2020-08-15, https://devforum.roblox.com/t/ideal-intermission-time/724439 (D, stale, small sample)
[S140] How long should the round and intermission last in my game? (DaDude_89, bobthepants123), devforum, 2021-01-09, https://devforum.roblox.com/t/how-long-should-the-round-and-intermission-last-in-my-game/972851 (D, stale, small sample)
[S141] Roblox: Dress To Impress - How To Earn Money Fast, TheGamer, 2025-03-10, https://www.thegamer.com/roblox-dress-to-impress-money-fast/ (W/press)
[S142] All Dress to Impress (DTI) ranks and rewards, Destructoid, 2025-02-15, https://www.destructoid.com/all-dress-to-impress-dti-ranks-and-rewards/ (W/press; the stars-versus-cash note is from a search summary of a guide)
[S143] Murder Mystery 2 Coins, MM2 wiki, Fandom, https://murder-mystery-2.fandom.com/wiki/Coins (T; search summary)
[S144] What makes these RP games so popular? (Cvsmix_mxddie, iloveyoutube4474), devforum, 2023-10-18, https://devforum.roblox.com/t/what-makes-these-rp-games-so-popular/2651246 (D)
[S145] How one student's The Sims-like Roblox game racked up 160 million play sessions (interview with Coeptus), PocketGamer.biz, 2018-03-07, https://www.pocketgamer.biz/interview/67682/160-million-plays-with-roblox/ (W, stale)
[S146] Welcome to Bloxburg Bill Calculator, bloxburgbuilds.com (data from the Bloxburg wiki, 2026-09-14), https://bloxburgbuilds.com/guides/bloxburg-bill-calculator (T)
[S147] Best Paying Jobs in Welcome to Bloxburg (2026), Earnaldo, https://earnaldo.com/blog/welcome-to-bloxburg-tier-list-2026 (T; search summary) and Bloxburg Jobs: All 14 Jobs, RobloxDatabase, 2026-08-07, https://robloxdatabase.com/guides/bloxburg-jobs/ (T; only the title and metadata could be read); the two conflict
[S148] Voldex Acquires Brookhaven, the Most Visited Game on Roblox, Business Wire, 2025-02-04, https://www.businesswire.com/news/home/20250204037702/en/Voldex-Acquires-Brookhaven-the-Most-Visited-Game-on-Roblox (P/press release; search summary)
[S149] Brookhaven RP (Fandom) and The Hidden Co-Creator of Brookhaven RP (Medium), https://brookhaven.fandom.com/wiki/Brookhaven_RP and https://medium.com/@porousappeuproject/the-hidden-co-creator-of-brookhaven-rp-8b510fe87937 (T; search summaries only, fetch blocked, unverified)
[S150] Coin Arcade! (Pet Simulator 99 update 92), BIG Games, 2026-09-05, https://www.biggames.io/post/pet-simulator-99-update-92 (P/game studio)
[S151] Hatch Wars! (Pet Simulator 99 update 96), BIG Games, 2026-10-03, https://www.biggames.io/post/pet-simulator-99-update-96 (P/game studio)
[S152] Easter Event! (Pet Simulator 99 update 56), BIG Games, 2025-04-19, https://www.biggames.io/post/pet-simulator-99-update-56 (P/game studio)
[S153] Inside BIG Games: How Pet Simulator Became a $100M Roblox Empire, RoWatcher News, https://rowatcher.com/news/inside-big-games-how-pet-simulator-became-a-100m-roblox-empire (T, undated)
[S154] Roblox Rivals ranked mode and ranks explained (allthings.how) and Rivals wiki pages (Fandom, Miraheze), https://allthings.how/roblox-rivals-ranked-mode-and-ranks-explained/ (T; search summaries; Update 22 detail unverified)
[S155] Roblox Innovation Awards 2024 Winners, Roblox, devforum, https://devforum.roblox.com/t/roblox-innovation-awards-2024-winners/3152047 (P/D; seen in search results only)
[S156] Piercen Harbut speaker page (GDC 2026 session "Catching Culture Currents" with Alec Kieft), GDC schedule, https://schedule.gdconf.com/speaker/harbut-piercen/79515 (P/event listing; search summary)
[S157] RDC 22: Creating an Intriguing First Time User Experience, Onett (Bee Swarm Simulator), YouTube, https://www.youtube.com/watch?v=TZ14iO23Bpk (title only; transcript not accessible)
[S158] Gamer Robot Inc/Blox Fruits, Fandom, https://roblox.fandom.com/wiki/Gamer_Robot_Inc/Blox_Fruits (T; search summary)
[S159] Developer Spotlight: Onett, Roblox Developer (Medium), https://medium.com/roblox-developer/developer-spotlight-onett-1c49f4bd63de and the Bee Swarm Simulator wiki (Fandom) (search summaries; fetch blocked)
