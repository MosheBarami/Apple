# Simulators, incremental/idle and collecting/RNG: systems, numbers and math
_Gap pass 2026-10-04: 15 resolved, 8 still open._
_Researched 2026-10-04 by deep-research agent (Claude). Sources: 96._

How to read the labels. "[Sx]" cites the source list at the bottom. **First-party data** is read straight from a Roblox endpoint or from a game developer's own public API or update post on 2026-10-04; it is a snapshot and changes with every update. **Third-party** means a wiki, guide or analytics blog (not Roblox, not the game's developer); treat its numbers as drifting. **Derived** means I computed it from sourced values (arithmetic shown or checkable). **Heuristic** means a design starting value with no measured source. "Search summary" means the page could not be fetched and the figure comes from a search-result summary. Fandom wiki pages return HTTP 402 to the page fetcher, but in the 2026-10-04 gap pass they were read through each wiki's MediaWiki API (api.php, action=query&prop=revisions), which works; those pages are labelled third-party with their last-edit date. This note goes deeper than `03-genre-design.md`; it does not repeat that file's Bee Swarm, Steal a Brainrot rebirth table, Grow a Garden timer or Tower of Hell material unless a new number is added.

## Key facts

### 1. Market snapshot on 2026-10-04 (first-party, Roblox endpoints)
Roblox's public games endpoint, search endpoint and pass endpoint were queried on the same day [S1][S2][S3]. CCU is the instantaneous "playing" count at query time, so it moves with time of day.

| Game | Created | CCU now | Visits | Max players/server | Notes |
|---|---|---|---|---|---|
| Steal An Egg | 2026-07-25 | 1.90M | 6.61B | 7 | passes: x2 Money 399, x2 Growth Speed 467 Robux [S1][S3] |
| Ride A Pet | 2026-04-14 | 229K | 279M | 6 | third-party peak about 1.55M [S74][S75] |
| Steal a Brainrot | 2025-05-16 | 157K | 73.8B | 8 | peak 25.4M in Oct 2025 [S53] |
| +1 Speed Keyboard Escape | 2026-01-18 | 127K | 6.27B | 22 | 45 passes on sale [S1][S3] |
| Anime Dice | 2026-08-15 | 67K | 61.1M | 9 | 7 weeks old, rolling and offline income [S1][S2] |
| Pet Simulator 99 | universe 2022-02-05, launch 2023-12-01 | 40.5K | 2.66B | 10 | weekly update [S1][S27] |
| Sol's RNG | 2023-12-03 | 33K | 2.21B | 20 | all-time peak 193,836 on 2024-05-12 (third-party) [S1][S61] |
| Kick a Lucky Block | 2026-04-07 | 29K | 1.90B | 5 | Cross-checked: Rolimons 1,897,318,687 visits, 26,475,004 favourites, peak 1,691,570 on 2026-05-23 [S1][S93] |
| Bee Swarm Simulator | 2018-03-21 | 24K | 4.59B | 6 | 8 years old and still top-tier [S1] |
| Grow a Garden | 2025-03-25 | 25K | 35.95B | 4 | peak 22.3M on 2025-08-23 [S1][S54] |
| Sell Lemons | 2025-03-17 | 13.8K | 466M | 10 | idle business, claims 100% offline income [S1][S2] |
| Bubble Gum Simulator INFINITY | 2024-09-02 | 7.2K | 609M | 12 | [S1] |
| Grow a Garden 2 / Plants & Brainrots | 2026-05-21 / 2025-08-01 | 3.3K / 4.0K | 1.68B / 4.71B | 8 / 5 | [S1][S2] |
| Strongman Sim / Pet Sim X / Sonic Speed Sim | 2021 / 2021 / 2022 | 563 / 906 / 5.3K | 1.66B / 8.99B / 1.53B | 10 / 12 / 16 | [S1] |

Derived readings (arithmetic from the table): Grow a Garden is at 0.11% of its peak (25,069 / 22.3M); Steal a Brainrot at about 0.6% of its peak (157K / 25.4M); Ride A Pet at about 15% of a third-party peak; Sol's RNG at about 17% of its peak. Peaks (gap pass, resolved): Steal An Egg's all-time peak is about 14.3 million (Rolimons 14,293,524 read 2026-10-04, "reached 2 weeks ago"; RoMonitor 14.31M per a search summary; RoVitals 14.27M). The 9.8M (RoWatcher) and about 9.9M (Rolimons as quoted on 2026-09-09) figures were earlier readings taken before the peak rose, so three trackers now agree and the 14.3M figure wins; SpawnRadar's crawler shows a lower 2.1M record by a different method, which I discount. Ride A Pet peaked at 1,553,904 (Rolimons). Steal a Brainrot peaked at 25,836,222 at Rolimons against 25.4M on Wikipedia and 25.8M in two press pieces; the direct tracker wins, the Wikipedia figure is rounded or older. The 281.7K reading for Steal An Egg on 2026-08-20 in `03-genre-design.md` is simply an early snapshot (the game launched 2026-07-25 and Kotaku reports nearly 800K CCU on 2026-08-26), not a conflict [S75][S76][S93]. Server caps of current hits are small: 4 to 10 players for 11 of the 14 current games in the top part of the table (derived from the max-players column); the exceptions are Sol's RNG 20, +1 Speed 22 and Bubble Gum INFINITY 12 (older Pet Sim X 12 and Sonic Speed Sim 16 also exceed 10; Adopt Me caps at 35) [S1].

### 2. The six loop shapes alive in 2026 (descriptions are the games' own text unless marked)
1. **Collect, sell, upgrade, zone** (Pet Simulator 99, Bubble Gum Simulator, Bee Swarm): break or blow things, convert to currency, buy zones, eggs and upgrades [S22][S83].
2. **Roll** (Sol's RNG, Anime Dice): one button produces a random rarity; luck and roll speed are the progression. Anime Dice's text: "MONEY GENERATES WHILE YOU ARE OFFLINE", roll dice, upgrade dice for luck, collect characters and mutations [S1].
3. **Hatch and earn on a plot** (Steal a Brainrot, Steal An Egg, Kick a Lucky Block, Ride A Pet): obtain an item, place it on a base, it pays cash per second; Kick a Lucky Block adds a kick-distance mechanic and a tsunami, Ride A Pet "find eggs around the map, hatch rarer and faster pets to find rarer eggs, mutate your pets" [S1].
4. **Grow in real time** (Grow a Garden): growth continues offline, shop stock cycles [S51][S52].
5. **"+1 per step" counter** (+1 Speed Keyboard Escape): every step gives +1 Speed, then multipliers, a treadmill and cosmetic trails [S1].
6. **Classic idle business** (Sell Lemons): "You continue to earn 100% of your income offline" is in the description [S1].

### 3. Incremental math that every sim inherits (first-party to the genre's literature)
- Cost curve: cost_next = cost_base x growth^owned; production = production_base x owned x multipliers. Pecorella's AdVenture Capitalist example: Lemonade Stand base cost 4 (3.738 exact), growth 1.07, 1.67 production per second, and stacking x2 multipliers at 25 and 50 owned. Bulk cost of n more is b x r^k x (r^n - 1) / (r - 1); the most you can afford is floor(log_r(c(r-1)/(b r^k) + 1)) [S42]. I checked these in Luau (see snippets): 10 stands from zero cost 51.65, and 1,000 coins buys 44.
- Exponential cost eventually beats any polynomial income, so multipliers and prestige must bridge the gap [S42]. Cookie Clicker raises each building's price 15% per purchase [S47]: derived, price doubles every 4.96 purchases at 1.15 and every 10.24 at 1.07; after 100 purchases the price is about 1.17 million times the base at 1.15 and about 868 times at 1.07.
- Part II's alternative: generators that produce the tier below give polynomial income (x, x^2/2, x^3/6...) so costs still outrun income; "Derivative Clicker" keeps low tiers relevant with a 0.05% boost per purchase [S43].
- Prestige formulas [S44][S46]: Cookie Clicker gives floor(cuberoot(lifetime cookies / 1 trillion)) prestige levels, each +1% CpS additively, so doubling the gain needs 8x lifetime earnings; Realm Grinder uses a square root of the best run (about 4x to double); AdVenture Capitalist a square root of lifetime earnings (3 to 4x); Egg Inc uses about the 1/7 power of this run only (128x to double). Derived rule: with gain = (E/E0)^k, doubling needs 2^(1/k) times the earnings (k = 1/2 gives 4, 1/3 gives 8, 1/7 gives 128). "Since this run" formulas flatten quickly and favour active play; lifetime-based ones build momentum [S44]. Cookie Clicker offline production is 5% to 75% of CpS depending on upgrades [S46].
- Pecorella's design advice: use spreadsheets to understand, not predict; make the curve bumpy (slow and fast stretches); big numbers alone no longer drive engagement [S44]. The genre's appeal is a "natural energy system without an energy currency", and offline progress became standard after AdVenture Capitalist (Parkin, 2015) [S45]. Wikipedia dates Progress Quest 2002 and Cookie Clicker's breakout 2013 [S48]. All of this is pre-2024 and about mobile or browser games; the math is stable, the monetisation is not.
- Mobile idle benchmark (Naavik, Frozen City deconstruction, date not shown): offline cap 2 hours, a subscription doubles it to 4; day-60 DAU 854K from 8M downloads (10.7%); the game's two rewarded-video placements were estimated at 15-20% of revenue against 30-40% typical [S49]. Search summaries of idle-design blogs say offline caps usually run 2 to 24 hours, a rewarded video commonly doubles the return payout, and rewards should scale with current income, not be fixed amounts [S50]. Third-party.

### 4. Pet Simulator 99 from its developer's own public API (first-party, snapshot 2026-10-04)
BIG Games exposes its config through a public API with 34 collections: Achievements, Boosts, Booths, Boxes, Buffs, CardItems, Charms, Currency, Eggs, Enchants, FishingRods, Fruits, GuildBattles, Hoverboards, Lootboxes, Mastery, MiscItems, Pets, Potions, RandomEvents, Ranks, Rarity, Rebirths, SecretRooms, Seeds, Shovels, Sprinklers, Ultimates, Upgrades, WateringCans, Worlds, ZoneFlags, Zones, Merchants, XPPotions [S22]. That list is itself the systems checklist of a top sim (section 11). I downloaded the collections and computed the following; numbers change per update.
- **Rebirths (9 total):** gate zone numbers 25, 50, 75, 99, 125, 150, 175, 199, 219; every rebirth gives the same +75% pet damage ("+75% Pet Strength"), so the multiplier is linear, 1 + 0.75 x rebirths, 7.75x at rebirth 9 (derived). The real reward is feature unlocks: R1 teleport and auto hatch; R2 clans and active Huge pets; R3 index rewards, secret rooms, pet teams, enchant loadouts; R4 ultimates, mastery, rocketship; R5 secret pets, shiny chance boost, area quests; R6 charged and golden eggs; R7 +30% ultimate speed, +25% ultimate XP, +20% Huge XP; R8 superior mini chests, black hole; R9 ultra mastery potion. From R5 the rebirth resets you to the next world's spawn (Tech Spawn, then Void Spawn at R9) [S22]. Design reading: a rebirth is a content gate with a small stat reward, not an exponential multiplier.
- **World and zone structure:** 279 zone configs in four worlds (99, 100, 40, 40 zones); each zone lists a "maximum available egg", which rises almost linearly: egg 2 at zone 1, 14 at zone 10, 28 at zone 20, 63 at zone 50, 112 at zone 99, up to 291 overall. There are 292 standard numbered eggs (112, 100, 40, 40 per world) among 941 egg configs, most of which are event or machine eggs; each world has its own coin (Coins, TechCoins, VoidCoins, FantasyCoins) and there are 59 currency definitions in total, mostly one per event, which matches Roblox's advice to isolate event currency [S22][S13]. Zone gate prices are not in the API (the Price field is empty), but the Pet Simulator wiki's area table (edited 2025-07-14, possibly stale, third-party) lists them for world 1: area 2 costs 900 coins, then 2.5K, 8K, 20K, 60K, 150K and 400K for areas 3 to 8 (ratios 2.5x to 3.2x, geometric mean about 2.75x); from area 9 the price switches to Gold Bars (1, 2, 6, 15, 35, 80, 200, 450, 1,000 and on to 750,000 at area 25, derived about 2.3x per area), and Platinum starts at area 26. So a new currency tier arrives roughly every 17 areas and each gate costs about 2.3x to 2.8x the previous one [S92].
- **Egg odds structure:** a standard egg holds only 3 to 6 pets with raw weights, odds = weight / sum. Examples: Spotted Egg [Bunny 100, Chick 45, Dalmatian 10]; Snow Egg [100, 30, 15, 2.25, 0.09]; Teddy Egg [70, 29, 1, 0.1, 0.002]; Rainbow Egg (egg 112) [70, 30, 0.1, 0.002, 0.00004]. Computed from the weights: the rarest pet is 25% in egg 1 and falls to 1 in 1,001 in the median egg of every world (a weight of 0.1 against about 100), with tails of 1 in 50,000 (0.002), 1 in 2.5 million (0.00004; Sun Angelus), and up to 1 in 10 million (world 1), 1 in 200 million (world 3). The weight list carries an announcement label ("Nice", "Great", "Insane") on rare entries. Shiny, Rainbow and Gold are separate independent rolls; exclusive eggs set shinyChance 2 and rainbowChance 2 and disable gold [S22][S69]. Third-party aggregator agrees: 935 eggs, weights normalised to about 100, Huge pets mostly 0.05% to 1.5% [S69].
- **Upgrade tracks (12) with decaying returns:** each track has 7 to 9 tiers with rising costs and shrinking gains. Pet Damage costs 700, 2,500, 7,500, 75,000, 750,000, 5M, 15M for +10, +10, +10, +10, +5, +5, +5%. Luck: 1,000 to 15M for +10 x4, +5, +3, +2. Coins: 1,250 to 25M for +10 x4, +5 x2, +2 x2 (total +54%). Derived: cost per +1% rises from 70 to 3,000,000 on Pet Damage (about 43,000x), average cost ratio between tiers 4 to 5.6x across tracks, total bonus per track only +25% to +55%. A later 2026 update added 19 upgrade tracks (Coin Arcade) and 28 tracks (Coin Craft) inside event zones [S22][S24][S25].
- **Potions:** eight families (Damage, Coins, Diamonds, Lucky Eggs, Treasure Hunter, Walkspeed, The Cocktail, Huge). Tiers are linear in both power and time: Lucky Eggs I gives +25% egg luck for 600 s; each tier adds +25% and 600 s up to tier XI at +275% for 6,600 s. Coins potions add +20% per tier (to +220%), Damage +15% per tier (to +165%). The Huge potion is +300% Huge luck for 3,600 s; The Cocktail II bundles coins +300%, diamonds +100%, damage +150%, egg luck +400%, drops +150%, walkspeed +75% for 1,800 s [S22].
- **Enchants:** 56 definitions; tiered ones go to tier 10 with decreasing steps (Lucky Eggs +15, 30, 50, 75, 95, 110, 125, 140, 155, 160%; Coins +20% per tier to +200%; Tap Power +25% to +900%); each has a diminishing-stack threshold value in the config. Slots come from ranks (1 at rank 1 up to 6 at rank 20, plus premium slots) [S22][S84]. Stacking of the same enchant (Pet Simulator wiki, edited 2025-08-01, third-party): the first copy is 100% active, the second 60%, the third 38.3%, the fourth 27.5% and so on; Magic Orb, Fireworks, Midas Touch, Magnet and their variants do not diminish. A Twinfinite guide's worked example (flat +40 per extra copy, search summary) contradicts that sequence and is treated as wrong. Each config also holds a DiminishPowerThreshold value (for example 336 for Strong Pets) whose exact use is not documented [S91][S22].
- **Ranks (a goal ladder that raises capacity):** 40 rank numbers (17 were renamed, 57 config rows). Rank 1 needs 4 stars from 2 active goals; later ranks need up to 26 stars with 4 active goals; each goal is worth 1 to 4 stars. Summing unique ranks gives 80 unlockable pet slots and 83 egg slots (derived), where "egg slots" means eggs hatched at once; third-party sources put the final unlock at 99 egg slots at rank 31 [S22][S28][S68].
- **Merchants and timers:** 16 merchant definitions with refresh periods of 60 s (Unit Merchant), 300 s (Garden, Lucky Dice, Farming), 600 s, 1,800 s, 3,600 s and 21,600 s (Adventurer Store). Random world events (Coin Jar and Comet at chance 42.5, Lucky Block 10, Piñata 5, each lasting 600 s or 120 s) need a 5-break and 5-minute play requirement [S22].
- **Mastery:** 14 mastery categories to level 99 with perks at set levels (for example Eggs: +20% then +35% hatch animation speed at levels 10 and 50, +3% golden chance at 30; Economy: merchant prices -15%, -30%, -50% at 30, 80, 99) [S22].
- **Live-ops pattern from the 2026 update posts (first-party):** update 87 (2026-08-01) a combine machine (feed Huge pets up to Titanic), a "super rebirth" unlocked by a mission board, a one-time diamond egg, 20 upgrade tiers; update 92 (2026-09-05) offline pet grinding, three plays per minigame per hour, an hourly raffle of up to 2,500 tickets where 500 players win a Huge, boss chests to level 50 with 4 stationed pets, +2% per friend up to +10%; update 93 (2026-09-12) craft 10 Huge into 1 Titanic with only 3,000 available and a recipe refresh every 3 hours, boost banking up to 6 hours, tier III boosts x5 for 30 minutes; update 95 (2026-09-26) three new Huge stack into a Gargantuan, fewer than 100 will ever be crafted; update 96 (2026-10-03) team battles every 4 hours, luck that stacks across a win streak and resets on a loss, a roughly 1-in-4-billion pet, leaderboards paying out to rank 10,000 [S23][S24][S25][S26][S27]. Every update layers: a new luck or boost source, a scarce limited item, a timed competition with a wide reward ladder, a social bonus.
- **Passes (Robux, first-party):** Auto Farm 175, Lucky 275, Auto Tap 350, +15 Pets 375, VIP 400, +15 Eggs 625, Daycare Slots 625, Ultra Lucky 800, Magic Eggs 1,200, Super Shiny Hunter 1,600, Double Stars 2,400, Super Drops 2,400, Huge Hunter 3,250 [S3]. Potions and gem packs are developer products and are not visible through this endpoint [derived limitation].
- Business context (third-party, RoWatcher): Pet Simulator X about $109M lifetime and the studio about $100M+ across the franchise; weekly Saturday 5 PM GMT updates; launch peak of PS99 above 400K CCU [S67]. Unverified methodology.

### 5. Sol's RNG and the roll genre
- Scale (third-party and first-party): 2.21B visits, 33K now, all-time peak 193,836 on 2024-05-12, rating 91.4%, average playtime 15.77 minutes on the snapshot date [S1][S61]. Another summary says about 40K concurrent and 1.7B visits earlier in 2026, a Korean team, "stand still, press a button" [S62].
- Rarity table: 468 documented auras in 14 tiers, from "1 in 1" to the rarest roll at 1 in 3 billion; early tiers are Basic (1 to 999), Epic (1,000 to 9,999); sample odds Topaz 1/150, Ruby 1/350, Magnetic 1/2,048, Player 1/3,000, Starlight 1/50,000, Arcane 1/1,000,000, Pixelation 1/1,073,741,824 (a power of two) [S62][S63][S66]. Third-party; counts change each Eon update.
- Roll speed: a roll takes about 3.2 s with no modifiers (the Fandom wiki summary; the Rolling page itself gives no seconds figure, and the 3.0 s that some guides quote is unverified), 1.2 s with the Quick Roll pass (100 Robux; no animation, shorter cooldown) and 1.5 s in the Starfall biome per an earlier Fandom summary that I did not re-verify. Every tenth roll is a bonus roll with double luck (default), Auto Roll needs membership of the developer's Roblox group and rejoins every 20 minutes, and rolling is not affected by ping [S63][S64][S87]. Derived: 1,125 to 1,200 rolls per hour by default, 3,000 with Quick Roll. (The earlier "about 15 rolls per second engine cap" was a search summary of a forum post and is deleted.)
- Luck (gap pass, resolved from the Sol's RNG Fandom wiki, last edited 2026-09-21, read through its MediaWiki API; community-edited, so third-party): Luck = (((1 + Basic) x BonusRollMultiplier) + Special) x VIP. Basic luck is additive (gear from +25% to +2,200%, potions +25% to +300%); the bonus-roll multiplier applies only to the basic part (default x2, Gravitational Device x6, Blessed Tide Gauntlet x3 on every sixth roll, Flesh Device about x1.3 every roll); Special one-roll potions are flat additions (Potion of Bound +50,000, Heavenly +150,000, Godlike +400,000, Oblivion +600,000, Pump King's Blood +700,000); VIP multiplies the whole total (VIP x1.2; VIP+ x1.2 alone and x1.3 together with VIP). The roller does not use probability = luck / N directly: each aura gets a list value floor(base / luck), the roller walks from the rarest eligible aura downward and an aura hits when a random integer from 1 to its list value equals 1; if none hits, the rarest aura whose list value is 1 is given, and fixed-rarity auras are checked first. The wiki states no probability cap. Deleted as unsupported: the 50% probability cap and "about 36x practical maximum" from two calculator guides, which conflict with the wiki's +150,000 specials and +22 gear, and the "bonus on the 11th roll" wording (the wiki says every tenth roll is doubled; an 11th-press reading fits a counter that fires after ten). No developer statement on the math exists [S64][S65][S86][S87].
- Biomes (Sol's RNG wiki Biomes page, edited 2026-10-03, third-party): the game rolls every second for each biome, so a biome's chance is 1 in N per second: Windy 1 in 500 (2 minutes), Snowy 1 in 600 (2 minutes), Rainy 1 in 750 (2 minutes), Sandstorm 1 in 3,000 (650 s), Hell 1 in 6,666 (666 s), Starfall 1 in 7,500 (650 s), Corruption 1 in 9,000 (650 s). There are ten standard biomes, four rare ones (Glitched, Dreamspace, Cyberspace, Singularity) and seven event biomes; Glitched is 1 in 30,000 per biome change. Breakthrough multipliers (native-biome odds boost) are x3 for Windy and Snowy, x4 for Rainy and Sandstorm and x10 for Daytime and Nighttime, so the boost is 3x to 10x, not a flat 5 to 10x [S88].
- Derived expected effort (expected rolls = N / luck): at luck 1 and 3.2 s per roll, a 1-in-1,000 aura needs about 0.9 hours of rolling, 1 in 100,000 about 89 hours, 1 in 1,000,000 about 889 hours; at an assumed luck of 36 (an illustrative multiple, not a cap) these fall to 0.025, 2.5 and 24.7 hours; 1 in 100 million is still about 2,470 hours at luck 36 (926 hours with Quick Roll's 1.2 s). The expected-rolls rule is exact only while luck is small relative to N, because the list-value walk above floors each value. So the top of the table is gated by luck multipliers (including one-roll specials worth +150,000 to +700,000), not by grind alone.
- Passes now on sale (first-party, 2026-10-04): Merchant Teleporter 40, Starter Pack 49, Invisible Gear 80, Quick Roll 100, VIP 249, VIP+ 350, Premium Pass Season VIII 499; seasons I to VII and three Innovator packs are unlisted, i.e. seasonal passes retire [S3].
- Anime Dice (7 weeks old, 67K CCU) uses the same idea on a plot: dice have fixed luck multipliers (Normal 2x, Fire $2.5K 5x, Water 10x, three rare dice $75K to $4M for 20x to 100x, Storm $200M 400x), permanent upgrades (Money first tier +25%, Luck, Storage, Roll Speed) that survive rebirth, rebirths at $50K, $5M, then $500M+ (100x steps) and character grades from 1.2x to 50x income. Third-party, one source [S73]. Passes: Luck 199, More Cash 199, VIP 249, Roll Speed 349, Ultra Luck 499, Double Roll 799 [S3].
- Paid-random rule: Roblox's paid random item doc lists luck boosts and pity systems among "probability modifiers" that count, so Robux-bought luck falls under the odds-disclosure rules [S4].

### 6. Hatch-and-earn ladders: numbers from the 2025-2026 hits
- **Steal a Brainrot (third-party, 2026-01-22):** tiers Common to OG with cost and income: Noobini 25 for 1/s; Talpa 1K for 9/s; Gangster Footera 4K for 30/s; Penguino 45K for 300/s; Sigma Girl 340K for 1,800/s; Toiletto Focaccino 4.8M for 16K/s; Matteo 10M for 50K/s; Pop Pop Sahur 65M for 295K/s; Spaghetti Tualetti 15B for 50 to 60M/s; Strawberry Elephant 500B for 250 to 350M/s. A Legendary appears on the belt about every 5 minutes and a Mythic every 15 in public servers; official rates are not published [S55]. **Derived payback = cost / income:** 25 s (Common), 111 to 150 s (Common to Epic), 175 to 189 s (Legendary), 214 to 300 s (Mythic), 200 to 220 s (Brainrot God), 273 to 278 s (Secret) and about 1,667 s (OG). So most tiers repay in 2 to 5 minutes whatever the absolute price; that constant is the real design rule (heuristic reading of third-party numbers). **Gap-pass check against the Steal a Brainrot Fandom wiki (Rarities page edited 2026-09-30, read through its MediaWiki API; third-party, newer than the table above):** Common $1 to 14/s costing $25 to 1.7K and spawning 55% of the time on the red carpet; Rare $15 to 75/s ($2K to 9.7K); Epic $75 to 325/s ($10K to 47.5K); Legendary $200 to 1.9K/s ($35K to 347.5K); Mythic $2K to 18.7K/s ($350K to 6.2M, roughly a 10% spawn chance); Brainrot God $19K to 323K/s ($5M to 47.5M); Secret $315K to 425M/s ($80M to 425B); OG tier: Strawberry Elephant $750B for $750M/s, Meowl $650B for $600M/s, Skibidi Toilet $450B for $450M/s; 499 indexable brainrots. Derived payback from those ranges: Rare 129 to 133 s, Epic 133 to 146 s, Legendary 175 to 183 s, Mythic 175 to 332 s, Brainrot God 147 to 263 s, Secret 254 to 1,000 s, OG 1,000 s (about 17 minutes). The allthings.how OG figure of about 1,667 s above is stale (the prices moved); the wiki wins because it is newer and gives ranges per tier. The 2 to 5 minute payback band still holds from Rare through Brainrot God and stretches to about 17 minutes only for Secret and OG [S89].
- **Steal An Egg (third-party, September 2026):** ten rarities with income per second: Common 1 to 6, Uncommon 8 to 18, Rare 35 to 280, Epic 180 to 4,000, Legendary 1,800 to 130,000, Mythic 16,000 to 750,000, Cosmic 220,000 to 17.5M, Secret 3.5M to 215M, Eternal 65M to 900M, Divine 1B to 3.5B; about 122 to 127 pets in 11 biomes; a Rift Machine trades three pets for an egg with 45/35/20% odds [S79]. Derived: the lower bound of income grows 4x to 19x per tier. Mutations are 1.25x to 3x (Silver 1.25, Bloom 1.5, Golden 2, Rainbow 2.5, Fractured and Scrambled about 2.75, Parasite about 3, Spirit Bloom 3) [S80]. Speed is trained on a treadmill (+200 per step early, +11K at level 8) and gates biomes; trails multiply the treadmill (Divine x14) [S80].
- **Ride A Pet (two third-party sources agree):** seven rebirths, each +1x money and +1 pet slot, requiring a named pet and cash: Horse (1 in 500K) with $1M; Fox (1 in 21M) $50M; Unicorn (1 in 1T) $2.5B; Phoenix (1 in 30T) $125B; Kitsune (1 in 1Qi) $6.2T then $325T; Dragon (1 in 5Qi) $50Qa [S70][S71]. Derived cash ratios: 50, 50, 50, 49.6, 52.4, then 153.8x. Hatch luck is ranch luck x egg base luck; eggs respawn about every 8 minutes and stay about 20 seconds; weather gives pets permanent speed/money mutations from Shocked x2 to Eternal x100; rebirth wipes cash and the purchased ranch luck [S71][S72]. Design reading: a roughly 50x cost step with only a +1x multiplier means the pet you hatch, not the multiplier, carries progression.
- **Pass prices (first-party):** Steal An Egg x2 Money 399, x2 Growth Speed 467; Kick a Lucky Block Auto Kick 99, x2 Brainrot Luck 249, x2 Mutation Luck 265, x2 Kick Power 349, x2 Cash 399, VIP 729; Steal a Brainrot 2x Money 299, VIP 375, Admin Commands 7,999; Ride A Pet Infinite Radar 399 (its other three passes are unlisted) [S3]. +1 Speed Keyboard Escape sells 45 passes: Wins x2 95, Gold Treadmill 79, Diamond Treadmill 345, Candy Treadmill 749, ADMIN Treadmill 1,199, and a ladder of trails from 19 to 2,645 and auras from 90 to 1,849 [S3].
- **Bubble Gum Simulator INFINITY passes:** Fast Hatch 99, Extra Equips 149, Double Luck 199, Double Gems 199, Triple Hatch 249, Lucky Enchants 279, VIP 299, Double Currency 399, Digital Storage 649, Infinity Gum 799 [S3]. A third-party piece (age unknown; 205M visits cited, so about 2023) says session length 37.95 minutes against 17.24 for Roblox's top 10 and that of the top 50 only six exceed 30-minute sessions, five of them incremental sims [S83]. Old; use only the direction.
- The Gang (Strongman Simulator, 2021; Creator Spotlight, date not shown, 2025): three people shipped it a month after prototyping; the pull-heavy-objects idea came from a family conversation; the audience prefers linear play with information in small batches; they trade "10 small features in 2 weeks or 1 feature and 1 event"; 1.5B visits then, 200+ employees now. Forum replies in that thread criticise aggressive monetisation [S17]. Strongman is now at 563 CCU [S1].

### 7. Grow a Garden: value math and a prestige that is not a multiplier
- Spread (GamesBeat, GameDiscover): the original creator (16-year-old BMWLux) built it in about three days; Splitting Point Studios joined at about 500 to 1,000 CCU, shipped weekly updates (Saturdays 7 AM PST), reached about 100K CCU in two weeks and 1M in about a month; peak DAU about 60M; the offline growth was novel for Roblox; non-competitive play and no tutorial were cited as reasons; Jandel built 30 to 40 games before it [S51][S52].
- Sell value (gap pass; Grow a Garden Fandom wiki, Mechanics page edited 2026-08-24, read through its MediaWiki API; third-party): Value = round(BaseValue x MutationMultiplier x VariantMultiplier x clamp(Weight / BaseWeight, 0.95, 100,000,000)^2). Mutations stack additively around 1: MutationMultiplier = max(1, 1 + sum(m_i - 1)). Variants: Normal x1, Silver x5, Gold x20, Rainbow x50, Diamond x50, Jelly x50, Ember x60. A crop's weight is its base weight times a random 0.7 to 1.4 and, when a lucky check with probability 1 / luckChance passes, times a further 3 or 4. The wiki's Crop Mutations table (197 rows, edited 2026-09-26) confirms every environment multiplier quoted earlier in this note (Wet 2, Chilled 2, Burnt 4, Sandy 3, Sundried 85, Drenched 5, Shocked 100, Moonlit 2, Celestial 120, Zombified 25, Dawnbound 150) and now runs up to x500 (Goldsparkle). The earlier community formula's "+0.1 per online friend, max 4" term is absent from the wiki and is deleted as unverified. Example from the calculator: a base 2,905 watermelon with stack 1 + (100 + 120 + 125) - 3 = 343 and Rainbow x50 sells for about 49.8 million at weight ratio 1 (I verified 2,905 x 343 x 50 = 49,820,750). Two design points: weight is squared, so size is the real lottery, and additive mutation stacking caps blow-up [S56][S90].
- Seed prices (third-party, 2026-09-21): Carrot $10, Strawberry $50, Blueberry $400, Tomato $800, Corn $1.3K, Watermelon $2.5K, Pumpkin $3K, Avocado $5K, Banana $7K, up to Moon Mango $1B, Crimson Thorn $10B, Octobloom $33B, Beast Buttercup $500B. The page's "ROI" column ignores multi-harvest plants, so do not use it as a balance reference [S59]. Grow a Garden 2 has 30 seeds from 1 Sheckle to 90M, seven rarity tiers, and single versus multi-harvest plants [S60].
- Ascension (Grow a Garden wiki Mechanics and Garden Ascension pages, 2026-08-24 and 2026-08-14, plus [S57][S58]; third-party): the first ascension costs 1 trillion Sheckles, pays 10 Garden Coins, has a 4-hour wait (it was 24 hours) and now takes 1 trillion rather than all Sheckles; the fruit it asks for may carry one of Chilled, Frozen, Wet or Windstruck. The Garden Coin shop sells capacity: Save Slot 100 coins, Egg Capacity 40 coins (5 purchases), Pet Inventory +10 slots 40 coins (5 purchases per tier) and cosmetic inventory 20 coins. The step per ascension conflicts: the Garden Ascension page and [S57][S58] say each ascension adds 2T to the cost, the newer Mechanics page says +1T; which one is live is unresolved. Reading: a prestige can sell convenience and capacity instead of a multiplier, which avoids the unbounded cycle-time problem [S90].

### 8. Offline progress and shared timers on Roblox
- Standard method from the devforum: save os.time() at leave, subtract on join, multiply by earnings per second, cap the window (24 hours in several answers) and divide by a rate (one module divides by 4, another thread by 5) [S29][S30]. Use DateTime instead of tick, store a table rather than one key per stat, and cap the window [S31]. A 2021 reply warns that one DataStore key per value creates a "3n" request load [S30].
- Roblox limits: DataStore default budget 60 + 40 x players requests per minute for reads and writes; UpdateAsync consumes both; 4,194,304 characters per key; 25 MB per minute read and 4 MB per minute write per key; 30-request queues; key and name length 50 [S5]. Servers get 30 seconds in BindToClose to save [S9]. So a save-on-leave only design should also autosave `lastSeen` every minute or so (my recommendation) because a crash otherwise leaves a stale timestamp.
- Time: Workspace:GetServerTimeNow() returns a monotonic Unix time on the client that tracks the server within 0.6% drift, good for countdowns; os.time() on the server for authority [S8].
- Shared global stock: Memory Stores (sorted map, queue, hash map; 45-day default expiry; up to 1M items or 100 MB per structure; quota 64 KB + 1.2 KB per concurrent user; 1,000 + 120 requests per minute per user) hold cross-server state [S7]. The cheaper trick for restocks is a pure function of the clock: the slot floor(time / period) seeds a Random so every server rolls the same stock with no storage (my recommendation; PS99 merchants refresh every 300 to 3,600 s [S22]).
- Offline sold as a feature: Anime Dice, Sell Lemons (100% offline), Grow a Garden (crops grow) and, from 2026-09-05, PS99 offline pet grinding [S1][S24][S51]. Roblox's Creator Rewards pay only for 10 qualifying minutes per day (see 03), so offline income is for retention and revenue, not payouts.
- Offline caps in the shipped hits are mostly unpublished or capacity-based (gap pass): PS99's offline pet grinding fills a per-zone Coin Tray and stops earning Tokens when the tray is full (a storage cap; no time cap or rate is stated), and MVP players earn +5% Arcade Coins even offline [S24]; Anime Dice says only that units keep earning, with the rate and cap unpublished [S96]. The 25% rate and 8-hour cap used in this note therefore remain a labelled heuristic, bracketed by Cookie Clicker's 5% to 75% [S46] and the devforum divisors of 4 to 5 [S29][S30].
- Rewarded video is an official offline-doubler tool: eligibility is 13+ ID-verified publisher with 2FA, at least 2,000 unique visitors per month and an approved questionnaire; the reward must be a developer product, "cannot be randomized items", valued about 3 to 10 Robux; EPM x impressions / 1,000 pays; place it at natural breaks [S12]. API: client `AdService:GetAdAvailabilityNowAsync(Enum.AdFormat.RewardedVideo)` (client scripts only) then server `AdService:ShowRewardedVideoAdAsync(player, reward, placementId)` with `CreateAdRewardFromDevProductId`; grant in ProcessReceipt where `receipt.ProductPurchaseChannel` is `Enum.ProductPurchaseChannel.AdReward`; do not grant from the call's result [S11]. Policy detail (gap pass, same doc re-read): rewards must be offered at intervals that do not make them so powerful that they trivialise progression, must not inflate currency or unbalance the economy, must not force the ad as a progress gate, and the ad runs 6 to 30 s; a once-per-return doubler on a capped away payout sits at a natural break, but no Roblox text names offline doublers explicitly [S12]. A 2026-03-20 advertising-policy announcement (deadline 2026-05-04) says rewarded ad formats are not permitted for under-13 users (summary of the fetched post) [S94].

### 9. Big numbers on Roblox
- A Luau number is a 64-bit double: about +-1.7e308 and around 15 digits of precision [S6]. A 2020 thread shows 1e30 printing as 1000000000000000019884624838656, i.e. exactness is lost past about 1e16 [S32]. Hits stay inside the double range: the largest sourced values are $50 quadrillion (Ride A Pet, 5e16), $500B costs and $1B per second incomes (Steal a Brainrot, Steal An Egg), 1 in 3 billion rolls (Sol's) and a $1 trillion ascension (Grow a Garden) [S70][S55][S79][S63][S57]. So a plain number plus a suffix formatter covers everything those games do.
- Reach for a big-number library only for endless prestige: EternityNum2 (sign, layer, exponent tables; the author advises toString for DataStores; tutorial 2024-07-22), BigNumber (mantissa/exponent in pure Lua, slower than native, avoid in physics or render loops; 2025-11-01), QubitNum and others [S33][S34][S35]. Old thread: Resources:LoadLibrary BigNum is dead [S32].

### 10. Platform rules that bite this genre (2026)
- Paid random items: show every outcome and exact percentage (summing to 100%) before purchase, a lone icon is not enough, indirect spend (keys, re-roll tokens, spin tickets, gems) counts, and probability modifiers (luck boosts, pity systems) count. Restricted users (`ArePaidRandomItemsRestricted`) need one of: a free earnable path, a fixed sequence, a direct purchase priced at expected value, removal, or a blocked-with-message state; trading outcomes is blocked when `IsPaidItemTradingAllowed` is false [S4][S10].
- Reward-driven media feeds (devforum 2026-08-25): games may not appear in Roblox Kids (ages 5 to 8) or Roblox Select (9 to 15) if they combine a media feed, autoplay or infinite scroll, and rewards that require or imply ongoing viewing; rewarded video ads are exempt. This followed Steal An Egg's treadmill that rewarded watching short videos; it was removed on 2026-08-25 and returned without the feed [S15][S77][S78]. Do not build video-feed grinding.
- Kids and Select accounts went global on 2026-06-16; chat is off for ages 5 to 8 by default, social hangout features are not allowed in those catalogs, and games face a three-step selection; a search summary of launch coverage says Grow a Garden and Driving Empire are among the games available to Kids in the US (not confirmed on the newsroom page) [S16]. Simulators that are non-social and mild fit these catalogs best.
- Economy hygiene from Roblox: model sources and sinks, compute expected value (item value x probability), isolate event currency, A/B price points and change values through live configs without restarts [S13]. Core loop = minute-to-minute interaction + most-repeated action + progression engine [S14].

### 11. What a complete 2026 simulator ships with (checklist derived from [S22][S24][S25][S1][S73])
Core: server-authoritative gain action, backpack or auto-collect, sell or auto-sell, world and zones with a gate, a currency per world plus an event currency. Collection: eggs with disclosed odds, pets with rarity, variants (Gold, Rainbow, Shiny) rolled independently, an index with rewards, a combine or fuse machine, equip and hatch slots that grow. Power: 7 to 12 upgrade tracks with decaying returns, enchants or modifiers with slots, timed potions and boosts, a rank or goal ladder, mastery levels, rebirths that unlock features. Economy: timed merchants, trading with a "value" proxy (PS99 prices Huge and Titanic pets in RAP, for example a Titanic at 4.55 billion in Update 93, third-party [S68]), limited crafts with a hard cap. Live-ops: weekly update on a fixed day, one event per update, leaderboards with a deep reward ladder (down to rank 5,000 to 10,000), team or clan battles, random world events. Convenience monetisation: auto tap or farm, extra equips, x2 currency, luck, hatch speed, VIP, daycare or offline grinding. Quality of life: auto-hatch, teleport, loadouts, gamepad support.

### 12. What separates the hits from the clones
- Evidence for the cycle: Steal a Brainrot (25.4M peak) is at about 0.6% of peak 11 months later; Grow a Garden at 0.11% after 13 months; PSX at 906 CCU against 8.99B lifetime visits; Strongman at 563 [S1][S53]. Third-party: about 80% of the 2024 top-50 games were outside the top 200 by early 2026, quarterly seasonal events were the strongest predictor of 12-month survival and games with visible recent updates kept three to four times more players at six months; simulators and tycoons show core-loop exhaustion within 5 to 10 hours; undisclosed sample, treat as direction only [S81]. Another third-party piece claims the algorithm now weighs 24 to 48 hour return rate over CCU; anecdotal [S82].
- Retention and session length (gap pass): GameAnalytics' 2026 Roblox Benchmark Report (500+ games with 1M+ monthly active users, 2025-08-01 to 2026-07-31, 4.76 billion sessions) reports medians D1 10.3%, D7 1.6%, D30 0.5% (p99 22.2%, 9.1%, 4.7%) and a median session of 9.8 minutes (p75 12.0, p90 14.7, p99 21.1). It publishes no genre breakdown, so the simulator-specific D1 and D7 figures that SEO sites quote (for example 32% to 35% D1) have no primary source and must not be used as targets [S95].
- Survivors are old and deep: Bee Swarm (2018, 24K CCU, 4.59B visits) and Adopt Me (2017, 239K CCU, 44.9B visits) [S1]; Pet Simulator 99 survives on weekly systems layers (the 2026 posts above) [S23][S27].
- 2026 hits ride a meme or a visible gimmick on a proven loop: brainrot memes for Steal a Brainrot [S53], an egg heist plus treadmill for Steal An Egg [S76], a kick-then-survive-the-tsunami minigame in front of the brainrot ladder (Kick a Lucky Block) [S1]. A GDC 2026 session by the 99 Nights and Bee Swarm creators is titled around "riding resonant trends" (content not accessed) [S20]. Onett's RDC 2026 talk (summary of a blog transcript, 2026-09-13) argues for designer intuition and "childishly honest" play over metric chasing, with no mechanics or numbers [S21].
- Early-simulator precedent: BelowNatural's Ninja Simulator reached 3K CCU in 24 hours and about 15K in two weeks in the early 2010s, and Tower Defense Simulator later hit about 30K after creators picked it up; the pattern (a simple loop that spreads through creators) is old [S18]. Roblox's September 2026 developer-spotlight video series features Animal Hospital, Creatures of Sonaria and Pixel Quest rather than sims, i.e. the platform is currently promoting "deeper" novel games [S19].
- Roblox itself paid more in 2026 for novelty (03); a visible twist plus real depth beats a re-skin.

## How to apply it (rules for an AI builder)

### Loop and numbers
- DO write the loop as: action, convert (sell or hatch), upgrade, gate (zone or rebirth). First currency in 10 s, first purchase within 30 to 60 s (heuristic from 03), first zone or first egg inside 5 minutes.
- DO keep the gain action server-validated (cooldown 0.08 s is the kit value, heuristic; reject faster remotes) [S38]. DON'T trust client click counts, ticks or timers.
- DO set unit cost = base x growth^owned with growth 1.07 to 1.15 for repeatable generators (AdCap 1.07 and Cookie Clicker 1.15 are the two sourced anchors) [S42][S47]; use closed-form bulk and max-buy so a "Buy Max" button costs O(1).
- DO follow the shipped upgrade-track shape: 7 to 9 tiers, cost ratio about 4x to 5.5x per tier, bonus per tier shrinking (10, 10, 10, 10, 5, 5, 5 percent), track total +25% to +55% [S22].
- DO give every new tier a payback of roughly 2 to 5 minutes (100 to 300 s) at the player's current income; solve income so next-tier cost / income stays in that band [S55 derived].
- DO use rebirths as feature gates first (PS99: nine rebirths, +75% each, each unlocks systems) or as a +1x money step with about 50x cost (Ride A Pet), and compute the cycle length before shipping [S22][S70].
- DON'T make cost grow geometrically while the multiplier grows linearly without a second income source (new tiers of pets, zones); the cycle length diverges (derived, same warning as 03).
- DO use event currencies for each event and keep the main currency isolated [S13][S22].
- DO format numbers with K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, and fall back to scientific notation beyond that.

### Luck, odds and RNG
- DO keep egg pools small (3 to 6 entries) with raw weights and generate the odds display from the same table the roll uses; make the rarest standard entry 0.1% (1 in 1,000) in mid-game eggs, 0.002% (1 in 50,000) for a chase pet, and reserve below 0.0001% for event or endgame eggs [S22].
- DO roll Gold, Rainbow, Shiny and similar variants as separate independent rolls after the pet roll [S22][S69].
- DO apply luck as a multiplier on the rare weights only, then renormalise, and cap it (PS99 potions top out at +275% egg luck; the Sol's RNG wiki formula has no stated cap, though its one-roll specials add +150,000 to +700,000, so decide a cap yourself and say so in the UI) [S22][S86].
- DO sell or grant luck, but treat Robux-bought luck as a paid random item: show the odds change, gate with PolicyService, offer restricted users one of the allowed alternatives [S4][S10].
- DO compute expected attempts: P(hit within k tries of 1 in N) = 1 - (1 - 1/N)^k; 50% needs 0.693 N tries, 90% needs 2.303 N, 99% needs 4.605 N (verified numerically) [S72].
- DO build the weighted pick as a cumulative walk (fine for 3 to 6 entries) and move to a prebuilt alias table only for large pools such as a 100-entry aura list [S39][S41].
- DON'T roll on the client. DON'T hide odds behind an icon.

### Offline, timers and persistence
- DO offer offline earning as a rate x capped window: 25% rate and an 8-hour cap is the heuristic kit value from 03; devforum answers divide by 4 or 5 and cap at 24 hours; Sell Lemons claims 100% [S29][S30][S1]. Show an away-summary screen on join.
- DO autosave the `lastSeen` timestamp every 60 s and on PlayerRemoving; bind a save in BindToClose (30 s) [S9][S5].
- DO derive shared restock slots from the clock (floor(time / period)) rather than storing them.
- DO use the rewarded-video doubler only with a non-random developer-product reward worth 3 to 10 Robux, available only after GetAdAvailabilityNowAsync returns IsAvailable [S11][S12].
- DON'T design video-feed rewards (policy) [S15].

### Pets, performance and exploits
- DO keep pet data on the server and render and animate pets on the client with frame-rate independent lerp; disable cast shadows on pets; community advice is not to exceed about 300 loaded pets [S36][S37].
- DO give each player a combined multiplier computed on the server from: sum of pet bonuses within a category, then multiplied across categories (pets, rebirth, potion, pass) [S40 and derived].
- DO cap equipped pets, hatch count and enchant slots by rank, and sell extra slots as passes (PS99: +15 Pets 375, +15 Eggs 625 Robux) [S3].
- DO rate-limit every remote; client-side autoclicker detection is only a deterrent [S38].

### Monetisation shape (derived from first-party pass lists)
- DO price a x2 currency pass at 199 to 399 Robux, luck 199 to 800, automation 99 to 350, extra capacity 149 to 650, VIP 249 to 729, and keep a few high anchors (PS99 2,400 and 3,250; Steal a Brainrot admin commands 7,999) [S3]. Consumables (potions, packs) go through developer products, which the pass endpoint does not show.
- DON'T put a sale prompt on first load; see 03 recipe 1.
- DO make seasonal passes retire (Sol's RNG seasons I to VII are unlisted) [S3].

## Recipes (each becomes a skill)

### Recipe 1: Simulator project skeleton (server-authoritative, data-driven)
When to use: starting any sim, RNG or hatch-and-earn game.
Steps:
1. Folders: `ReplicatedStorage/Shared/Config` (ModuleScripts: `Currencies`, `Zones`, `Eggs`, `Upgrades`, `Potions`, `Ranks`, `Rebirths`, `Passes`), `ReplicatedStorage/Remotes` (RemoteEvent/RemoteFunction), `ServerScriptService/Services` (`DataService`, `EconomyService`, `EggService`, `PetService`, `BoostService`, `RebirthService`, `OfflineService`, `ShopService`), `StarterPlayerScripts/Controllers` (UI, pets, effects). All tunable numbers live in Config, never in services.
2. Model data as plain tables: `{coins, gems, rebirths, zone, pets = {[uid] = {id, variant, level}}, equipped = {uid}, upgrades = {[track] = tier}, potions = {[kind] = {tier, expiresAt}}, lastSeen, index = {[petId] = true}}`; persist with the DataStore pattern from `04-luau-architecture.md` (UpdateAsync or ProfileStore).
3. Compute every derived stat on the server in one `getStats(player)` function (coins multiplier, luck, pet damage, hatch count, slots) and replicate results as Attributes on the Player for UI.
4. One `Heartbeat` accumulator (not one loop per pet) turns per-second income into currency once per second.
5. UI reads Attributes; buttons call remotes; the server re-validates cost, zone and slot limits.
6. Define the full set of systems from section 11 as stubs first, then fill the gain loop, one zone, two eggs and three upgrade tracks (vertical slice).
Pitfalls: logic in LocalScripts, numbers duplicated between UI and server, one DataStore key per stat (request budget 60 + 40 x players per minute) [S5].

### Recipe 2: Gain loop with backpack and sell trip (collect, sell, upgrade, zone)
When to use: mining, bubble, bee, strength or lifting sims.
Steps:
1. Nodes: Parts tagged `Breakable` with Attribute `Value` and `Health`; tag via CollectionService and bind a ProximityPrompt (`HoldDuration` 0) or auto-target near pets.
2. Server handler validates distance (about 15 studs), cooldown (0.08 s kit value), then adds `value x getStats().gain` to the backpack up to `backpackCap`.
3. Sell pad: Touched or ProximityPrompt converts the backpack to coins at a rate; auto-sell is a pass.
4. Upgrades: capacity, gain, speed as tracks (Recipe 3). Zones: gate by coins or by the previous rebirth (Recipe 8), each zone raising node value roughly 3x to 8x (kit heuristic from 03).
5. Spawn nodes with a respawn timer; PS99 uses 0.05 s respawn and a maximum of 25 to 50 live per zone [S22].
Pitfalls: client-reported hits, unbounded part counts, selling more than carried.

### Recipe 3: Upgrade tracks with decaying returns and bulk buy
When to use: any upgrade list (damage, coins, luck, speed, capacity).
Steps:
1. Config per track: `costs = {700, 2500, 7500, 75000, 750000, 5e6, 15e6}`, `gains = {10,10,10,10,5,5,5}` (PS99 Pet Damage) [S22]; for generators use `cost = base x growth^owned` (1.07 to 1.15) [S42].
2. Server `buyUpgrade(player, track)`: check tier < max, deduct cost, increment tier, recompute stats.
3. For generator-style purchases implement closed-form `bulkCost` and `maxAffordable` (snippet 2).
4. Show next cost, next gain and cost per percent to make the decay visible.
5. Add mastery or rank perks that discount (PS99: -15%, -30%, -50% at levels 30, 80, 99) [S22].
Pitfalls: floating-point drift with repeated multiplication (use pow), giving every tier the same gain (no reason to stop buying) or an explosive gain (income runs away).

### Recipe 4: Egg hatching with luck, variants and odds disclosure
When to use: pets, aura rolls, crates, spins.
Steps:
1. Config: `Eggs[id] = {price, currency, pets = {{id, weight, rare}...}}`, 3 to 6 pets, raw weights (Teddy Egg 70, 29, 1, 0.1, 0.002) [S22].
2. Server `hatch(player, eggId, count)`: validate currency, zone unlock and `count <= hatchSlots`; roll with a server `Random`; for each result roll Gold, Rainbow, Shiny independently with their own chances [S22].
3. Luck: multiply only `rare` weights by `luck`, renormalise, clamp luck to a cap (snippet 3). Build the odds UI from the same function so display equals reality.
4. Disclosure: percentages summing to 100 shown before purchase with a labelled Details button; if luck changes the odds, show the luck-adjusted odds [S4].
5. PolicyService: `ArePaidRandomItemsRestricted` true leads to hiding Robux-bought eggs or offering a direct purchase at expected value; trading outcomes only when `IsPaidItemTradingAllowed` [S4][S10].
6. Animation: allow skip, auto-hatch, faster hatch as perks (PS99 rebirth 1 unlocks auto hatch; mastery speeds the animation +20%, +35%) [S22].
7. Pity and guarantees are optional; if added and sold, they are probability modifiers under the same rule [S4].
Pitfalls: odds display built separately from the roller, client-side rolls, luck that makes the sum above 100%, hiding rarest odds.

### Recipe 5: Pet inventory, equip slots, multiplier stacking and client-side following
When to use: any pet system.
Steps:
1. Server owns `pets` and `equipped`; equip validates `#equipped < equipSlots` (ranks raise slots, passes add more) [S22][S3].
2. Multiplier: add pet bonuses inside one category, then multiply categories: `(1 + sum(pets)) x (1 + rebirthBonus) x (1 + potionBonus)` (snippet 4); document additive versus multiplicative so balance stays predictable [S40].
3. Replicate equipped pet ids via Attributes; each client spawns visual pets for nearby players only, positions them with frame-rate independent lerp each Heartbeat, no shadows [S36][S37].
4. Variants: Gold, Rainbow, Shiny multiply stats (PS99 gives up to 5x on the rarest variants in one event) [S23].
5. Combine/fuse: N copies to 1 higher tier, with a capped supply for the top tier (PS99: 10 Huge to 1 Titanic with 3,000 available; 3 Huge to a Gargantuan with under 100) [S25][S26].
6. Index: record first-seen pets; pay a permanent bonus per completed page.
Pitfalls: server-side tweening of pets (laggy), unbounded pet count per player in view, mixing additive and multiplicative by accident.

### Recipe 6: Worlds, zones and the egg ladder
When to use: any progression map.
Steps:
1. Config `Zones[n] = {name, currency, gate, maxEgg, breakables}`; `maxEgg` rises about linearly with zone (2, 14, 28, 63, 112 at zones 1, 10, 20, 50, 99) [S22].
2. Each world has its own coin so old money does not trivialise new worlds; the reset on rebirth drops the player to a world spawn (PS99 R5 to Tech Spawn) [S22].
3. Unlock rule: pay the zone's gate once, or reach the previous zone's stat; show the next zone as a goal on the HUD (03 recipe 1).
4. Put each zone's best egg at the zone's front door so the next egg is always a walk away.
5. Add one signature thing per zone (a boss, a mini-event, a chest) to break repetition.
Pitfalls: all zones paying the same, eggs unlocked far from where players farm.

### Recipe 7: Boosts and potions (timed buffs)
When to use: luck, coins, damage, speed temporary buffs.
Steps:
1. Config per family with linear tiers: `power = tier x step`, `duration = 600 + 600 x (tier - 1)` seconds (PS99 Lucky: +25% and +600 s per tier; Coins +20% per tier) [S22].
2. Store `expiresAt` as a Unix timestamp per kind; refresh by adding time or taking the stronger tier; never store "seconds left".
3. Expose `player:SetAttribute("LuckUntil", expiresAt)` and `LuckPower`; the client counts down with `workspace:GetServerTimeNow()` [S8].
4. Combine buffs by category (additive within, multiplicative across) and cap them.
5. If sold for Robux and luck-related, apply the paid random item rules [S4].
Pitfalls: timers that pause offline when you meant them to run (decide and state it), buffs that survive a server shutdown without a stored expiry.

### Recipe 8: Rebirth / prestige (three archetypes) with a cycle-time check
When to use: any reset-for-permanent-power loop.
Steps:
1. Pick the archetype: (A) feature gate, +75% linear per rebirth, nine rebirths, each unlocking systems, gate by zone number (PS99) [S22]; (B) +1x money and +1 slot, cost x50 per step, requires a named hatched pet (Ride A Pet) [S70][S71]; (C) capacity currency: 1T, then +2T more each time, pays Garden Coins for slots, keeps most money (Grow a Garden) [S57].
2. Server `rebirth(player)`: verify requirement, reset coins, zone, purchased luck; keep pets, index, passes, upgrades you declare permanent; increment `rebirths`; grant the unlock.
3. Cycle-time check with `secondsToAfford(cost, balance, perSecond)`: tune so the first rebirth lands in 15 to 25 minutes (heuristic from 03) and later cycles do not grow faster than content delivery.
4. For a lifetime-based gain use `floor((E / E0)^k)`; k = 1/2 needs 4x earnings to double, 1/3 needs 8x [S44].
5. Confirmation dialog listing what resets and what stays; show the next rebirth's unlock list.
Pitfalls: multiplier smaller than the cost step with no new income source (cycle diverges), resetting purchased items without warning, forgetting to cap `rebirths` UI numbers.

### Recipe 9: Offline progress (join-time payout)
When to use: any idle, tycoon or hatch-and-earn game.
Steps:
1. Save `lastSeen = DateTime.now().UnixTimestamp` on autosave (every 60 s) and on leave [S31][S9].
2. On join compute `away = clamp(now - lastSeen, 0, cap)` and `gain = perSecond x away x rate` (cap 8 to 24 h, rate 25% to 100%) (snippet 5) [S29][S30].
3. Compute `perSecond` from the saved loadout on the server only.
4. Show an away screen: time, amount, and a "double it" button wired to a rewarded video or a developer product (Recipe 10).
5. Ignore negative or implausible `away` (clock skew) and add a small server-side sanity cap.
Pitfalls: client-supplied time, paying offline for items bought seconds before leaving, no cap.

### Recipe 10: Rewarded video offline doubler (official API)
When to use: sims with an away screen or boost shop.
Steps:
1. Enable Ads in Creator Hub (Monetization > Ads > Settings) once eligible (13+, ID verified, 2FA, 2,000+ monthly unique visitors) [S12].
2. Create a developer product as the reward: not random, worth about 3 to 10 Robux [S12].
3. LocalScript: when the away screen opens, call `AdService:GetAdAvailabilityNowAsync(Enum.AdFormat.RewardedVideo)`; show the button only if `AdAvailabilityResult == Enum.AdAvailabilityResult.IsAvailable` [S11].
4. Server: on the button's remote, `local reward = AdService:CreateAdRewardFromDevProductId(productId)` then `AdService:ShowRewardedVideoAdAsync(player, reward, placementId)`.
5. Grant the doubled payout inside ProcessReceipt when `receipt.ProductPurchaseChannel == Enum.ProductPurchaseChannel.AdReward`; never from the call's return value [S11].
Pitfalls: autoplay chains or feed-like loops (policy), forgetting the client availability check (the call returns AdNotReady).

### Recipe 11: Roll game (Sol's RNG / Anime Dice style)
When to use: rarity-chase games where the roll is the loop.
Steps:
1. Table of 100+ entries from `1 in 2` to `1 in 1e9` with a name, odds N, and a tier colour; Sol's RNG keeps a list value floor(N / luck) per aura and falls back to the rarest aura whose list value is 1 (no probability cap is stated by the wiki, so choose and document your own) [S86].
2. Roll server-side every `rollCooldown` seconds (about 3.2 s base, 1.2 s with a quick-roll pass priced 100 Robux, 1.5 s in a speed biome per an unverified summary) [S87][S3].
3. Resolve like Sol's RNG: for each entry from the rarest downward compute `listValue = floor(N_i / luck)`; draw `rng:NextInteger(1, listValue)` (a list value of 1 always hits) and stop at the first 1; otherwise fall back to the rarest entry with list value 1; show the result with a tier-sized cutscene that can be skipped [S86].
4. Luck sources: `luck = (((1 + basic) x bonusRoll) + special) x vip` with basic luck additive, the bonus roll (x2 on every tenth roll) applied only to the basic part, one-roll specials added flat and VIP x1.2 on the total; make the formula a documented module [S86].
5. Biomes: roll each biome once per second with a 1-in-N chance (Windy 1 in 500, Starfall 1 in 7,500, Corruption 1 in 9,000), hold it 2 to about 11 minutes, and boost native auras 3x to 10x; the rarest biome (Glitched) is 1 in 30,000 per biome change; off-biome rolls of a native aura are "breakthroughs" announced to the server [S88][S62].
6. Auto-roll toggle (AFK), roll counter, personal best, and a server-wide announcement for rare finds.
7. Endgame sinks: crafting recipes that consume entries, so rarities are spendable [S63].
8. Disclose odds if any luck is sold; seasonal passes retire [S3][S4].
Pitfalls: luck that makes top tiers reachable in hours (derived: 1 in 1M at an assumed luck of 36 is still about 25 hours), no way to skip long animations, client-side rolling.

### Recipe 12: Passive-income ladder with constant payback (hatch-and-earn plot)
When to use: Steal a Brainrot, Steal An Egg, Kick a Lucky Block, Ride A Pet style games.
Steps:
1. Define 8 to 10 rarities. For each unit set `cost` and `income` so `cost / income` falls between 100 and 300 s (SaB: 111 to 300 s across Common to Mythic) [S55 derived].
2. A conveyor or egg source spawns units by weighted rarity; rarer tiers spawn on slower timers (SaB: Legendary about every 5 minutes, Mythic about every 15) [S55].
3. A plot with N slots; a single server loop sums `income x mutationMultiplier` per player each second.
4. Mutations multiply income (Steal An Egg 1.25x to 3x; Ride A Pet weather x2 to x100) and are weighted by rarity [S80][S71].
5. A stat gate for map access (speed trained on a treadmill: +200 per step early, trails multiply it) [S80].
6. Keep servers small (4 to 10 players) so social events feel personal [S1].
7. Steal and counter rules follow 03 recipe 14.
Pitfalls: payback that drifts to hours on the top tier (Secret and OG at about 4 to 17 minutes derived from the wiki are the visible exception) [S89], unbounded luck.

### Recipe 13: Rank / goal ladder that unlocks capacity
When to use: sims needing mid-term goals beyond zones.
Steps:
1. Config of ranks: each needs `starsRequired` (4 at rank 1 up to 26) and offers a goal pool with star weights 1 to 4; allow 2 to 4 active goals at once (PS99) [S22][S28].
2. Goals are measurable counters (break X, hatch Y, collect Z); the server progresses them.
3. Rank-up grants `petSlots`, `eggSlots`, `enchantSlots` (PS99 totals 80 pet and 83 egg slots over 40 ranks, derived) plus small item rewards (potions, gems) per star threshold [S22].
4. Show a progress ring on the HUD (03 recipe 1 step 4).
Pitfalls: goals that need Robux, ranks with no capacity reward (nothing to want).

### Recipe 14: Timed merchants and restocks without storage
When to use: seed shops, gear stock, daily deals, boss spawns.
Steps:
1. Config `refresh` seconds per merchant (60, 300, 600, 1,800, 3,600, 21,600 in PS99) [S22].
2. `slot = floor(os.time() / refresh)`; `rng = Random.new(slot)`; roll the stock from weighted tables with rare items under 1% per slot.
3. Replicate `slot` end time; clients count down with `workspace:GetServerTimeNow()` [S8].
4. Track per-player purchases for the current slot in memory, reset when the slot changes.
5. Optional announcements via MessagingService or Memory Stores for cross-server alerts [S7].
Pitfalls: using each server's start time (stock differs per server), clock reads on the client for authority.

### Recipe 15: Event layer (currency, scarce item, ladder, social bonus)
When to use: every update after launch.
Steps:
1. New event currency and shop (PS99 has 59 currencies, mostly per event) [S22][S13].
2. A temporary luck or boost source (stacking win-streak luck, banked boosts up to 6 h) [S27][S25].
3. One scarce limited item with a hard cap (3,000 Titanics, under 100 Gargantuans) [S25][S26].
4. A timed competition with a wide reward ladder: top 3, 4 to 10, 11 to 25, 26 to 100, then deep tiers to 5,000 or 10,000 [S26][S27].
5. A social bonus (+2% per friend up to +10%, clans of 3 or more) [S24].
6. Model source/sink with `Value x Probability` before launch [S13].
7. Announce a week early on short video (03 recipe 19).
Pitfalls: events that inject the main currency, ladders only the top 10 can win, no cap on the scarce item.

### Recipe 16: Large numbers, formatting and anti-exploit basics
When to use: any game with exponential currency.
Steps:
1. Keep currency as a plain number while below about 1e15 for exact integers; suffix-format for display (snippet 1) [S6].
2. If prestige is endless or values pass 1e300, adopt a big-number module and store it as a string; never save mantissa and exponent as separate unbounded numbers [S33][S34].
3. Rate-limit every remote with a per-player `os.clock()` check; require sane arguments; clamp quantities (hatch count <= slots).
4. Log per-player earnings per minute; flag outliers (a daily server-side check).
5. Do not rely on client autoclicker detection [S38].
Pitfalls: float drift in repeated multiplication, using NaN or inf in saves, trusting `Humanoid` events for gains.

## Luau reference snippets
All pure-Luau snippets below ran under the `luau` CLI and typechecked with `luau-analyze` on 2026-10-04 (outputs noted). Roblox API snippets follow the reference pages cited and were not run outside Studio.

```lua
--!strict
-- 1. Suffix formatter (verified: 999 -> 999, 1234 -> 1.2K, 3.5e18 -> 3.5Qi, 1e40 -> 1.00e+40)
local SUFFIXES = {"", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"}
local function formatNumber(n: number): string
	if n ~= n then return "NaN" end
	if n < 1000 then return string.format("%d", math.floor(n)) end
	local tier = math.floor(math.log10(n) / 3)
	if tier >= #SUFFIXES then return string.format("%.2e", n) end
	local scaled = n / 10 ^ (tier * 3)
	if scaled >= 100 then return string.format("%d%s", math.floor(scaled), SUFFIXES[tier + 1]) end
	return string.format("%.1f%s", scaled, SUFFIXES[tier + 1])
end

-- 2. Geometric cost, bulk cost, max affordable (verified: bulkCost(3.738, 1.07, 0, 10) = 51.65; maxAffordable(..., 1000) = 44)
local function unitCost(base: number, growth: number, owned: number): number
	return base * growth ^ owned
end
local function bulkCost(base: number, growth: number, owned: number, n: number): number
	return base * growth ^ owned * (growth ^ n - 1) / (growth - 1)
end
local function maxAffordable(base: number, growth: number, owned: number, currency: number): number
	local x = currency * (growth - 1) / (base * growth ^ owned) + 1
	if x < 1 then return 0 end
	return math.floor(math.log(x) / math.log(growth))
end

-- 3. Luck-weighted odds table (rare entries scale by luck, then normalise to 100%)
type Entry = { name: string, weight: number, rare: boolean? }
local function oddsTable(entries: {Entry}, luck: number): {{ name: string, percent: number }}
	local total, scaled = 0, {}
	for i, e in entries do
		local w = e.weight * (if e.rare then luck else 1)
		scaled[i] = w
		total += w
	end
	local out = {}
	for i, e in entries do out[i] = { name = e.name, percent = scaled[i] / total * 100 } end
	return out
end
-- Server roll: walk the same table that the UI shows. `rng` is a Random object.
local function rollEgg(entries: {Entry}, luck: number, rng: Random): string
	local r, acc = rng:NextNumber(), 0
	local odds = oddsTable(entries, luck)
	for _, o in odds do
		acc += o.percent / 100
		if r < acc then return o.name end
	end
	return odds[#odds].name
end
-- (verified with weights 70/25/4.9r/0.1r: luck 1 -> 70, 25, 4.9, 0.1 %; luck 4 -> 60.87, 21.74, 17.04, 0.348 %)

-- 4. Pets: add inside a category, multiply across categories (verified: 6.125 for pets 0.75, rebirth 0.75, potion 1.0)
local function coinsMultiplier(petBonuses: {number}, rebirthBonus: number, potionBonus: number): number
	local add = 0
	for _, b in petBonuses do add += b end
	return (1 + add) * (1 + rebirthBonus) * (1 + potionBonus)
end

-- 5. Offline payout, prestige gain, hit probability
local function offlineEarnings(perSecond: number, secondsAway: number, capSeconds: number, rate: number): number
	return perSecond * math.min(math.max(secondsAway, 0), capSeconds) * rate -- 1000/s, 100 h away, 8 h cap, 25% -> 7,200,000
end
local function prestigeGain(lifetime: number, threshold: number, exponent: number): number
	return math.floor((lifetime / threshold) ^ exponent + 1e-9) -- epsilon: 1e15/1e12 cube root must give 10
end
local function chanceWithin(n: number, k: number): number
	return 1 - (1 - 1 / n) ^ k -- chanceWithin(1000, 693) = 0.5001
end
local function secondsToAfford(cost: number, balance: number, perSecond: number): number
	if balance >= cost then return 0 end
	if perSecond <= 0 then return math.huge end
	return (cost - balance) / perSecond
end
```

```lua
-- 6. Server: clock-seeded restock shared by every server (Roblox only)
local function restockSlot(period: number): (number, number)
	local now = os.time()
	local slot = math.floor(now / period)
	return slot, (slot + 1) * period - now -- slot id and seconds until the next restock
end
local function rollStock(slot: number, catalog: {{ id: string, weight: number }}, count: number): {string}
	local rng = Random.new(slot) -- same seed on every server
	local total = 0
	for _, c in catalog do total += c.weight end
	local out = {}
	for _ = 1, count do
		local r, acc = rng:NextNumber() * total, 0
		for _, c in catalog do
			acc += c.weight
			if r < acc then table.insert(out, c.id) break end
		end
	end
	return out
end

-- 7. Server: rate-limited gain remote (0.08 s cooldown is the kit value from 03)
local Players = game:GetService("Players")
local last: {[Player]: number} = {}
local MIN_INTERVAL = 0.08
local function allowAction(player: Player): boolean
	local now = os.clock()
	if now - (last[player] or 0) < MIN_INTERVAL then return false end
	last[player] = now
	return true
end
Players.PlayerRemoving:Connect(function(p) last[p] = nil end)

-- 8. Server: PolicyService gate for paid random items
local PolicyService = game:GetService("PolicyService")
local function paidRandomRestricted(player: Player): boolean
	local ok, info = pcall(function() return PolicyService:GetPolicyInfoForPlayerAsync(player) end)
	if not ok then return true end -- fail closed
	return info.ArePaidRandomItemsRestricted
end

-- 9. Server: join-time offline payout (data.lastSeen is saved every ~60 s and on leave)
local OFFLINE_CAP = 8 * 3600
local OFFLINE_RATE = 0.25
local function applyOffline(data: { coins: number, perSecond: number, lastSeen: number? }): (number, number)
	local now = DateTime.now().UnixTimestamp
	local away = math.clamp(now - (data.lastSeen or now), 0, OFFLINE_CAP)
	local gain = data.perSecond * away * OFFLINE_RATE
	data.coins += gain
	data.lastSeen = now
	return gain, away
end

-- 10. Client: pet follow with frame-rate independent smoothing (visual only; no shadows)
local RunService = game:GetService("RunService")
RunService.Heartbeat:Connect(function(dt)
	local alpha = 1 - math.exp(-12 * dt)
	-- pet.CFrame = pet.CFrame:Lerp(targetCFrame, alpha)
end)

-- 11. Rewarded video offline doubler (shapes per the AdService reference)
-- LocalScript:  local r = AdService:GetAdAvailabilityNowAsync(Enum.AdFormat.RewardedVideo)
--               if r.AdAvailabilityResult == Enum.AdAvailabilityResult.IsAvailable then button.Visible = true end
-- Server Script: local reward = AdService:CreateAdRewardFromDevProductId(PRODUCT_ID)
--                AdService:ShowRewardedVideoAdAsync(player, reward, PLACEMENT_ID)
-- ProcessReceipt: if receipt.ProductPurchaseChannel == Enum.ProductPurchaseChannel.AdReward then grant the doubled payout end
```

## Open questions / unverified
Resolved in the 2026-10-04 gap pass (details are in the sections above): Steal An Egg, Ride A Pet and Steal a Brainrot peak conflicts and the 281.7K reading in 03; Kick a Lucky Block's visit count; the Sol's RNG luck formula, bonus-roll and VIP factors, roll time and biome rates; Onett's RDC talk (read in full, it contains no mechanics); PS99 enchant stacking and zone gate prices; the rewarded-video progression rule; Grow a Garden's value formula and mutation multipliers; the Steal a Brainrot brainrot table and OG payback.
- GDC 2026 "Catching Culture Currents" (Kieft and Harbut): only the schedule listing and a summary of it are available; no slide or recording content was found.
- Anime Dice (dice list, luck multipliers, rebirth costs) and the Ride A Pet rebirth table come from third-party guides only; the Anime Dice Fandom wiki is empty and no developer post was found. Treat their numbers as drifting.
- Simulator-specific retention (D1, D7, D30) has no primary source: the GameAnalytics 2026 report has no genre split [S95].
- The upgrade-tree literature for Roblox is thin: shipped games use linear tracks, not branching trees; no first-party description of designing a branching tree was found.
- Mobile-idle numbers (Frozen City) and Kongregate's math are not Roblox data and pre-date 2024 in part.
- Grow a Garden's ascension step: +2T per ascension (older wiki page, [S57][S58]) versus +1T (newer Mechanics page); the live value is unverified.
- Pet Simulator 99: hatch animation time and pass effects are not in the API, the base hatch odds are computed from raw weights and assume the config is the roller's input [S22][S69], and the use of DiminishPowerThreshold in enchant stacking is undocumented.
- Sol's RNG: no developer statement on the luck math exists; the wiki is community-edited and the formula images it cites could not be read, and the Starfall 1.5 s roll time is an unverified summary.

## Sources
Trust labels: P = Roblox primary or official, G = game developer first-party (own API or post), D = Roblox devforum (named authors), W = Wikipedia or press, T = third-party analytics, wiki or guide. Fetched 2026-10-04 unless a publication date is given. Game endpoint values are 2026-10-04 snapshots.

[S1] Roblox Games API, universes 5361032378, 3317771874, 7436755782, 601130232, 10035204815, 10708913337, 10004244222, 7709344486, 9584852943, 7395930870, 8316902627, 10200395747, 6504986360, 10440833423, 10563114921, 2564505263, 892043755, 3405618667, 2316994223, 619296292, 383310974, Roblox, https://games.roblox.com/v1/games?universeIds=<id> (P)
[S2] Roblox omni-search API (queries: rng, simulator, idle, brainrot, garden, lucky block, pet simulator, steal an egg, bubble gum simulator), Roblox, https://apis.roblox.com/search-api/omni-search (P)
[S3] Roblox Game Passes API for the universes above, Roblox, https://apis.roblox.com/game-passes/v1/universes/<id>/game-passes (P)
[S4] Paid random items policy, Roblox Creator Hub, https://create.roblox.com/docs/production/monetization/paid-random-items (P)
[S5] Data store errors and limits (creator-docs), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/cloud-services/data-stores/error-codes-and-limits.md (P)
[S6] Luau numbers (creator-docs), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/luau/numbers.md (P)
[S7] Memory stores overview (creator-docs), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/cloud-services/memory-stores/index.md (P)
[S8] Workspace class reference, GetServerTimeNow (creator-docs YAML), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Workspace.yaml (P)
[S9] DataModel class reference, BindToClose (creator-docs YAML), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/DataModel.yaml (P)
[S10] PolicyService class reference (creator-docs YAML), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/PolicyService.yaml (P)
[S11] AdService class reference and AdAvailabilityResult, ShowAdResult, AdFormat, ProductPurchaseChannel enums (creator-docs YAML), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/AdService.yaml (P)
[S12] Rewarded video ads (creator-docs), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/promotion/rewarded-video-ads.md (P)
[S13] Balance virtual economies (creator-docs), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/game-design/balance-virtual-economies.md (P)
[S14] Core loops (creator-docs), Roblox, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/game-design/core-loops.md (P)
[S15] Roblox Kids and Select: New Restrictions on Reward-Driven Media Feeds, Roblox staff, devforum, 2026-08-25, https://devforum.roblox.com/t/roblox-kids-and-select-new-restrictions-on-reward-driven-media-feeds/4829188 (P/D)
[S16] Age-Based Roblox Kids and Roblox Select Accounts Now Globally Available, Roblox newsroom, 2026-06-16, https://about.roblox.com/newsroom/2026/06/age-based-roblox-kids-and-select-accounts-now-globally-available (P)
[S17] Creator Spotlight: HDFrisk on Producing Fun Simulators With The Gang, Roblox devforum (date not shown, 2025), https://devforum.roblox.com/t/creator-spotlight-hdfrisk-on-producing-fun-simulators-with-the-gang/3419750 (P/D)
[S18] Creator Spotlight: BelowNatural's Journey Building Paradoxum Games, Roblox devforum, 2024, https://devforum.roblox.com/t/creator-spotlight-belownatural%E2%80%99s-journey-building-paradoxum-games/3027035 (P/D)
[S19] Roblox launches new video series spotlighting developers of top games, Tubefilter, 2026-09-09, https://www.tubefilter.com/2026/09/09/roblox-developer-spotlight-series-20th-anniversary/ (W)
[S20] Catching Culture Currents: Riding Resonant Trends in Roblox and Beyond, GDC 2026 schedule listing (Kieft and Harbut), 2026-03-13, https://schedule.gdconf.com/session/catching-culture-currents-riding-resonant-trends-in-roblox-and-beyond/915731 (search summary only; page returned 403)
[S21] Onett RDC 26 Click-Thrutopia Speech (transcript), Piercen Harbut blog, 2026-09-13, https://piercen.blog/2026/09/13/onett-rdc-26-click-thrutopia-transcript/ (summary read)
[S22] BIG Games public API, collections Rebirths, Zones, Eggs, Upgrades, Potions, Enchants, Ranks, Mastery, Merchants, RandomEvents, Currency, Rarity, Worlds, Boosts, Buffs, BIG Games, https://biggamesapi.io/api/collection/<name> and /api/collections, snapshot 2026-10-04 (G)
[S23] Pet Simulator 99 Update 87 "Plant & Combine", BIG Games blog, 2026-08-01, https://www.biggames.io/post/pet-simulator-99-update-87 (G)
[S24] Pet Simulator 99 Update 92 "Coin Arcade", BIG Games blog, 2026-09-05, https://www.biggames.io/post/pet-simulator-99-update-92 (G)
[S25] Pet Simulator 99 Update 93 "Coin Craft", BIG Games blog, 2026-09-12, https://www.biggames.io/post/pet-simulator-99-update-93 (G)
[S26] Pet Simulator 99 Update 95 "Space Forge", BIG Games blog, 2026-09-26, https://www.biggames.io/post/pet-simulator-99-update-95 (G)
[S27] Pet Simulator 99 Update 96 "Hatch Wars", BIG Games blog, 2026-10-03, https://www.biggames.io/post/pet-simulator-99-update-96 (G)
[S28] Ranks, Pet Simulator 99 database, BIG Games, https://db.biggames.io/wiki/ranks (G)
[S29] How do "Steal a" games calculate offline cash? (mlnitoon2, SeargentAUS, satqx1), devforum, 2025-08-02, https://devforum.roblox.com/t/how-do-steal-a-games-calculate-offline-cash/3854950 (D)
[S30] Offline Earnings System (YellowTripleG), devforum, 2021-02-10, https://devforum.roblox.com/t/offline-earnings-system/1038335 (D, older than 2024)
[S31] How to make an offline earning system? (Gamemaster712Z and others), devforum, 2025-06-20, https://devforum.roblox.com/t/how-to-make-an-offline-earning-system/3761245 (D)
[S32] How does simulator games to operate with really big numbers? (Rusiteblox, LowPolys), devforum, 2020-01 (follow-ups 2022), https://devforum.roblox.com/t/how-does-simulator-games-to-operate-with-really-big-numbers/424737 (D, older than 2024)
[S33] Doing math with arbitrarily large numbers (EternityNum2) (PRIC3L3SS, module by FoundForces), devforum, 2024-07-22, https://devforum.roblox.com/t/doing-math-with-arbitrarily-large-numbers-eternitynum2/3081503 (D)
[S34] BigNumber (fairyfariys), devforum, 2025-11-01, https://devforum.roblox.com/t/bignumber-scalable-math-system-for-huge-numbers-in-roblox/4039476 (D)
[S35] QubitNum, KingNumber and UltiNum big-number module threads, devforum, https://devforum.roblox.com/t/qubitnum-go-above-1e308/3774271 (D, search summary)
[S36] Render pets on the client or server? (28Y8, Lain), devforum, 2020-01-25, https://devforum.roblox.com/t/render-pets-on-the-client-or-server/442739 (D, older than 2024)
[S37] Should my pets following system be client or server? (DevFoll, ZerroxShiot, bt6k, LovreDev and others), devforum, 2023-07-29, https://devforum.roblox.com/t/should-my-pets-following-system-be-client-or-server/2494410 (D)
[S38] How do you detect autoclickers? (CompilerError, chexburger and others), devforum, 2021-10, https://devforum.roblox.com/t/how-do-you-detect-autoclickers/1529215 (D, older than 2024)
[S39] RNG system with luck increase (Inconcludable, Azarctic, simplyjustbased), devforum, 2023-02, https://devforum.roblox.com/t/rng-system-with-luck-increase/2173814 (D)
[S40] How To Make a Simulator Rebirth (MATH) (asherppan, PerilousPanther), devforum, 2023-08-02, https://devforum.roblox.com/t/how-to-make-a-simulator-rebirth-math/2501720 (D)
[S41] Weighted Chance System and alias-method discussions, devforum, https://devforum.roblox.com/t/weighted-chance-system/1373953 (D, search summary)
[S42] The Math of Idle Games, Part I, Anthony Pecorella (Kongregate), Game Developer, https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i (W, older than 2024)
[S43] The Math of Idle Games, Part II, Anthony Pecorella, Game Developer, https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii (W, older than 2024)
[S44] The Math of Idle Games, Part III, Anthony Pecorella, Game Developer, https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii (W, older than 2024)
[S45] The rise of games you mostly don't play, Simon Parkin, Gamasutra/Game Developer, 2015-03-03, https://www.gamedeveloper.com/design/the-rise-of-games-you-mostly-don-t-play (W, older than 2024)
[S46] Cookie Clicker Prestige, cookieclicker.wiki.gg, https://cookieclicker.wiki.gg/wiki/Prestige (T)
[S47] Cookie Clicker Building, cookieclicker.wiki.gg, https://cookieclicker.wiki.gg/wiki/Building (T)
[S48] Incremental game, Wikipedia, https://en.wikipedia.org/wiki/Incremental_game (W)
[S49] Frozen City: The Best New Idle Game (deconstruction), Naavik, https://naavik.co/deep-dives/frozen-city-deconstruction/ (T, date not shown)
[S50] Idle game offline-progress and monetisation summaries (Game-Ace "Idle game development", Applixir, MergeCiv, Tideward), search results 2026-10-04 (T, search summary)
[S51] How Grow a Garden took off on Roblox (Janzen Madsen interview), GamesBeat, 2025, https://gamesbeat.com/janzen-madsen-interview/ (W)
[S52] What Grow A Garden's 8.9 million CCU tells us about game discovery, GameDiscover newsletter, 2025, https://newsletter.gamediscover.co/p/what-grow-a-gardens-89-million-ccu (T)
[S53] Steal a Brainrot, Wikipedia, https://en.wikipedia.org/wiki/Steal_a_Brainrot (W)
[S54] List of Roblox games (Grow a Garden, Pet Simulator 99 entries), Wikipedia, https://en.wikipedia.org/wiki/List_of_Roblox_games (W)
[S55] Steal a Brainrot brainrots, rarities, and prices (full list), allthings.how, 2026-01-22, https://allthings.how/steal-a-brainrot-brainrots-rarities-and-prices-full-list/ (T)
[S56] Grow a Garden Calculator (formula page), valuegrowagarden.com, https://valuegrowagarden.com/grow-a-garden-calculator (T)
[S57] Grow a Garden Ascension Update, findingdulcinea.com, https://www.findingdulcinea.com/grow-a-garden-ascension-update/ (T)
[S58] Grow a Garden Ascend Guide, Beebom, https://beebom.com/grow-a-garden-ascend-guide-how-to-rebirth/ (T)
[S59] Grow a Garden Seed Shop Prices, growagardentradevalues.com, 2026-09-21, https://growagardentradevalues.com/seeds/ (T)
[S60] All 30 Grow a Garden 2 Seeds, Bloxodes, https://bloxodes.com/wiki/grow-a-garden-2/seeds (T)
[S61] Sol's RNG game statistics, Rolimons, https://www.rolimons.com/game/15532962292 (T)
[S62] Sol's RNG and the Luck-Based Game Craze, RoWatcher News, 2026, https://rowatcher.com/news/sol-s-rng-and-the-luck-based-game-craze-why-players-keep-rolling (T)
[S63] Sol's RNG Wiki, All 468 Auras, bloxguidesgg.com, https://bloxguidesgg.com/games/sols-rng (T)
[S64] Sol's RNG Luck Explained, solrng.wiki, https://www.solrng.wiki/guides/luck-explained/ (T)
[S65] Sol's RNG Calculator guide, solsrngcalc.com, https://solsrngcalc.com/en/guide/ (T)
[S66] Sol's RNG All Auras List, GameRant, 2025-04-24, https://gamerant.com/sols-rng-all-auras-list/ (W)
[S67] Inside BIG Games: How Pet Simulator Became a $100M Roblox Empire, RoWatcher News, https://rowatcher.com/news/inside-big-games-how-pet-simulator-became-a-100m-roblox-empire (T)
[S68] Pet Simulator 99 Wiki, petsimulator99game.wiki, https://petsimulator99game.wiki/ (T)
[S69] Pet Simulator 99 Eggs, bloxguidesgg.com (data from the BIG Games API), https://bloxguidesgg.com/games/pet-simulator-99/eggs (T)
[S70] Ride A Pet Rebirth Guide, rideapetrobloxwiki.wiki, https://rideapetrobloxwiki.wiki/guide/ride-a-pet-rebirth (T)
[S71] Ride A Pet Wiki, rideapet.xyz, https://www.rideapet.xyz/en (T)
[S72] Ride A Pet Luck Guide, ride-a-pet-roblox.wiki, https://ride-a-pet-roblox.wiki/guides/luck-guide/ (T)
[S73] Roblox Anime Dice Guide: Upgrade Priority and Rebirth Timing, allthings.how, https://allthings.how/roblox-anime-dice-guide-upgrade-priority-and-rebirth-timing/ (T)
[S74] Ride A Pet game statistics, Rolimons, https://www.rolimons.com/game/124216119978534 (T)
[S75] Roblox Game Records, observed player peaks (Sep 2026), RoVitals, https://rovitals.com/records (T)
[S76] Roblox's Steal An Egg Is Beating Some of the Platform's Biggest Games, Player.One, 2026-09, https://www.player.one/robloxs-steal-egg-beating-some-platforms-biggest-games-164086 (W)
[S77] Roblox's No. 1 Game Steal An Egg Was Pulled Hours After Reaching The Top, EGamers.io, 2026-08, https://egamers.io/robloxs-no-1-game-steal-an-egg-was-pulled-hours-after-reaching-the-top/ (W, low-tier outlet; corroborated by [S15][S78])
[S78] Roblox Is Cracking Down On Games That Reward Kids For Doomscrolling, Slashdot, 2026-08-28, https://games.slashdot.org/story/26/08/28/0027222/roblox-is-cracking-down-on-games-that-reward-kids-for-doomscrolling (W)
[S79] Steal an Egg: All Pets Index and Income Guide (September 2026), robloxgameswiki, https://steal-an-egg.robloxgameswiki.com/guide/all-pets (T)
[S80] Steal an Egg mutation, treadmill and speed guides (TechWiser, GameRant, allthings.how, games.gg), search results 2026-10-04 (T, search summary)
[S81] One Year on the Charts: What Really Happens After a Roblox Game Goes Viral, RoWatcher News, 2026, https://rowatcher.com/news/one-year-on-the-charts-what-really-happens-after-a-roblox-game-goes-viral (T, undisclosed sample)
[S82] What the Roblox Algorithm Actually Rewards in 2026 (Not CCU), RoWatcher News, 2026-04, https://rowatcher.com/news/what-the-roblox-algorithm-actually-rewards-in-2026-not-ccu (T, anecdotal)
[S83] Why Bubble Gum INFINITY Simulator is so Popular on Roblox, MaxPower Gaming, date not shown (about 2023), https://www.maxpowergaming.co/post/why-bubble-gum-infinity-simulator-is-so-popular-on-roblox (T, old)
[S84] Pet Simulator 99 enchants and best-enchant guides (Droid Gamers, marix.app, petsimulator99.wiki), search results 2026-10-04 (T, search summary)
[S85] Sol's RNG Fandom pages (Rolling, Warp Potion, Biomes), sol-rng.fandom.com, https://sol-rng.fandom.com/wiki/Rolling (T, search summary; page returned HTTP 402)
[S86] Luck, Sol's RNG Wiki (Fandom), last edited 2026-09-21, read through its MediaWiki API on 2026-10-04, https://sol-rng.fandom.com/wiki/Luck (T)
[S87] Rolling and Gamepasses, Sol's RNG Wiki (Fandom), last edited 2026-07-28, https://sol-rng.fandom.com/wiki/Rolling (T)
[S88] Biomes, Sol's RNG Wiki (Fandom), last edited 2026-10-03, https://sol-rng.fandom.com/wiki/Biomes (T)
[S89] Rarities and Rebirth, Steal a Brainrot Wiki (Fandom), last edited 2026-09-30 and 2026-09-24, https://stealabrainrot.fandom.com/wiki/Rarities (T)
[S90] Mechanics (edited 2026-08-24), Crop Mutations (2026-09-26) and Garden Ascension (2026-08-14), Grow a Garden Wiki (Fandom), https://growagarden.fandom.com/wiki/Mechanics (T)
[S91] Enchants (Pet Simulator 99), Pet Simulator Wiki (Fandom), last edited 2025-08-01, https://pet-simulator.fandom.com/wiki/Enchants_(Pet_Simulator_99); Twinfinite "Do Enchants Stack in Pet Simulator 99?" (search summary only), https://twinfinite.net/guides/do-enchants-stack-pet-sim-99/ (T)
[S92] List of Areas and Template:PS99SpawnWorldAreaList, Pet Simulator Wiki (Fandom), last edited 2025-07-14 (may be stale), https://pet-simulator.fandom.com/wiki/List_of_Areas_(Pet_Simulator_99) (T)
[S93] Rolimons game pages read 2026-10-04: Steal An Egg 107778070777162, Steal a Brainrot 109983668079237, Ride A Pet 124216119978534, Kick a Lucky Block 89469502395769, https://www.rolimons.com/game/107778070777162 (T)
[S94] New Advertising Policies & Standards, Roblox staff, devforum, 2026-03-20 (deadline 2026-05-04), https://devforum.roblox.com/t/new-advertising-policies-standards/4527365 (P/D)
[S95] 2026 Roblox Benchmark Report, GameAnalytics (500+ games, 2025-08-01 to 2026-07-31), https://www.gameanalytics.com/reports/2026-roblox-report (T, primary dataset, no genre split)
[S96] Anime Dice offline income summaries (robolibrary.org, animedice.online), search results 2026-10-04 (T, search summary)
