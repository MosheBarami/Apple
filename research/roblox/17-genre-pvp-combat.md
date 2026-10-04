# PvP and combat genres on Roblox: battlegrounds, shooters, sword and melee, duels, ranked
_Gap pass 2026-10-04: 15 resolved, 8 still open._
_Researched 2026-10-04 by deep-research agent (Claude), Round 2 note 17. Sources: 104 entries plus 9 added in the gap pass, S112 to S120 (about 25 first-party Roblox docs, staff posts and newsroom pages; the rest devforum community posts, press and third-party stat or wiki pages; source numbers have gaps because a few planned entries were dropped)._

How to read the labels. "[Sx]" cites the source list at the bottom. "Third-party" means a wiki, guide site or stats tracker, not Roblox and not the game's developer; its numbers are snapshots that drift with every patch. "Derived" means I computed it from sourced values and the arithmetic is shown; it is not a published number. "Heuristic" means a starting value from guides or devforum with no measured source. "Search summary" means the page itself returned HTTP 402/403 (all Fandom wikis, Valve's wiki) and the figure comes from a search-result summary; treat it as less certain. "Unverified" means I could not confirm it. Where two sources disagree I give both. Note 03 already covers one-paragraph overviews of The Strongest Battlegrounds, Rivals, Blox Fruits, Murder Mystery 2, Blade Ball and Forsaken; this note does not repeat them and goes into systems, numbers, netcode and ranked design.

## Key facts

### 1. Market snapshot (what the genre looks like on 2026-10-04)
All CCU and visit numbers below are third-party tracker snapshots taken between 2026-09 and 2026-10-04 unless a date is given. Trackers differ on what "peak" means (all-time since the game existed versus since the tracker started watching it), so I note the window.

- RIVALS (Nosniy Games, first-person duels): Rolimons shows an all-time peak of 967,342 CCU recorded on 2026-02-14 (the date is on the Rolimons page itself, re-read in the gap pass, so the old search-summary label is resolved), average playtime 11.89 min on the first read and 11.38 min on the re-read, 18.5 billion visits, 93.7 million favourites, a 40-player server maximum, a release date of 2024-06-28 (the wiki's developer patch-note page is headed "Release [June 28, 2024]", which settles the earlier 2024-05-26 versus 2024-06-28 conflict) [S117], about 200,096 playing when first fetched and 203,909 on the re-read [S23][S91][S120]. RoVitals' window-limited record (since 2026-08-11) is only 674,850, which shows why "since tracking began" numbers must not be compared with all-time ones [S90]. A 2026-09-15 guide quotes 163,293 CCU and 18.12 billion visits [S47]; a search summary for 2026-10-02 gives 188,107. Best Shooter at the Roblox Innovation Awards 2025 and 2026, and Nosniy Games won Best Studio 2026 [S9][S104].
- The Strongest Battlegrounds (Yielding Arts): all-time peak 1,395,324 CCU (search summary dates it 2024-12-22), average playtime 10.83 min, 19.3 billion visits, 7.68 million favourites, about 69,895 playing when fetched [S24]. RoVitals' observed peak since 2026-08-11 is 85,694 [S90]. Read together: a 16x gap between the all-time peak and a normal 2026 evening; the genre spikes around updates and decays between them.
- Jujutsu Shenanigans (Tze's Shenanigans, battlegrounds): observed peak 469,446 CCU since 2026-08-11 [S90]; Best Action Game at the 2026 Innovation Awards (the 2025 Best Action award went to Blox Fruits) [S9][S104].
- Blox Fruits: observed peak 2,357,172 since 2026-08-11 [S90]; a search summary lists about 203,144 CCU on 2026-10-02 and 62.1 billion visits.
- Blade Ball (Wiggity): peak 511,924 CCU on 2023-11-19, average playtime 12.28 min, 6.47 billion visits, 12.98 million favourites, about 18,000 playing, 93.5% rating [S26].
- BedWars (Easy.gg, released 2021-05-28): peak 334,747 CCU on 2022-08-27, average playtime 13.91 min, 11.7 billion visits, 4.63 million favourites; a 2026 tracker shows about 18,858 playing and 82% approval [S50][S107].
- Slap Battles: peak 146,305 CCU, average playtime 12.30 min, 3.65 billion visits (peak date not shown) [S25].
- Arsenal (ROLVe, created 2015-08-18, Gun Game derivative): peak 152,613 CCU on 2020-10-26, average playtime 8.24 min, 6.31 billion visits, about 4,900 CCU now; it was the most-visited FPS from 2020-05 to 2025-05, when Rivals passed it [S22][S105].
- Combat Warriors: peak 76,948 on 2022-12-24, average playtime 15.93 min, 1.45 billion visits, about 2,420 CCU now, 83.4% rating, 45 players max per server [S27].
- Deepwoken (Monad Studios East): peak 62,422 on 2022-12-23, average playtime 12.46 min, 1.64 billion visits, about 4,402 CCU now [S30].
- Phantom Forces (StyLiS Studios, created 2015-08-31): peak 15,592 on 2021-01-16, average playtime 17.00 min, 1.80 billion visits, still shipping seasonal weapon updates (a "Fall 2026 update" per its page) [S21][S99].
- Counter Blox (5v5 buy-round shooter): peak 14,382 on 2021-04-27, average playtime 13.00 min, 1.24 billion visits [S28]. Criminality: peak 10,681 on 2022-04-09, average playtime 16.95 min [S29].
- Pattern (derived from the above): the average session in every PvP title is 8 to 17 minutes (Arsenal's 8.24 is the low, Phantom Forces' 17.00 and Criminality's 16.95 the high), so a match or round must fit inside roughly 10 minutes and the next match must start without friction. Old titles (Counter Blox, Phantom Forces, Criminality, Combat Warriors) peaked in 2020-2022 and are 1 to 5% of that now; the games that kept scale are the ones that kept shipping seasons (Rivals, Arsenal Reloaded, TSB). Third-party numbers, method of each tracker not disclosed.
- Platform context: a RoWatcher news piece (Q4 2025, third-party) puts 80% of Roblox sessions on mobile, 17% PC, 3% console, yet describes competitive shooters (Rivals, Phantom Forces) and Deepwoken as PC-first because of mouse precision, and BedWars, Combat Warriors and Blox Fruits as playable on mobile with PC-dominant competitive players [S70]. Roblox's own Q2 2026 DAU (123 million per file 03) differs from the 150 million quoted in that piece; use the split, not the totals.

### 2. The sub-genres and what separates hits from clones
There are five product shapes that all get called "PvP":

1. Battlegrounds (TSB, Jujutsu Shenanigans, Slap Battles, Roblox Ultimate Battlegrounds heritage): a shared FFA arena of about 16 to 20 players (Jujutsu Shenanigans is described as 20-player servers, search summary [S41]), character kits of an M1 melee chain, 3 to 4 cooldown moves, an Ultimate/Awakening meter, block and dash. The loop is spawn, fight, respawn, with kills and a leaderboard as progress. [S37][S38][S41]
2. Round-based competitive shooters and duels (Rivals, Counter Blox, Phantom Forces): short rounds, ranked, loadouts, map vote. [S48][S28][S21]
3. Arcade FFA shooters (Arsenal): a progression inside one match (weapon ladder to 32 kills, golden knife wins) so a single session always has an arc. [S105]
4. Weapon-skill melee (Combat Warriors, Deepwoken, Sword Fights on the Heights): stamina, parry, positioning, slower and more skill-expressive; Combat Warriors bills itself as stamina-managed positional combat with block, dodge roll and slide; Deepwoken is parry/posture/permadeath. [S5][S27][S108]
5. Objective team PvP (BedWars, Forsaken): resource collection plus a team objective, longer sessions (BedWars 13.91 min average). [S50]
Plus reflex-minigame PvP (Blade Ball, a one-input deflect game, 12.28 min average [S26][S51]) and gimmick-brawlers (Slap Battles, glove abilities, killstreak unlock gloves [S25][S103]).

What the hits share (my synthesis from the sources, labelled as interpretation):
- A single skill that is easy to start and has a visible ceiling. Rivals: aim plus movement (slide jump, strafe, crouch-strafe, grapple, "the real skill gap sits in movement") [S71]. TSB: four-hit M1 plus cancels, perfect block, "true combos" [S5][S37]. Blade Ball: one click, the window shrinks below 100 ms at high deflection counts [S51].
- A progression layer that does not change the outcome of a fight much. Rivals sells keys and cosmetic cases but its ranked mode bans maps and weapons per team (see section 6), which blunts weapon-unlock advantages [S6][S63].
- A fast loop between fights: Rivals rounds last about 1 minute 30 seconds, best of 5 round wins (first to 5) [S48][S71]; TSB ranked is first to 2 round wins [S37]; Arsenal needs 32 kills in a match [S105].
- Regular seasonal content: Rivals Season 3 started 2026-04-24, Update 21 2026-06-26 or 27, Update 22 2026-09-04 [S47][S48][S72]; Arsenal rebuilt its codebase in "Arsenal Reloaded" Stage 1 on 2025-07-06 and moved to incremental releases instead of bundled mega-updates [S62].
- Polish at the small-detail level. Frontlines' creator Clarence Maximillian (interviews 2023-10-17 and 2026-07-01) says teams "go through thousands of iterations on every part of the game", one team member spent six months on weapon audio and surface bounce, and the guiding question is a AAA-feeling game that downloads in about 10 seconds; the original started in 2017 with one partner, later a core team of 5 plus 15 or more contractors [S17][S18]. TTK (Sable Digital, led by Noah Enyart) reached 4 million plays by 2026-06-16 and 7 million later, built by a small team (two to four people depending on the article) and focused on reload animations, weapon handling and cover over spraying [S19][S20].

What the clones get wrong (interpretation supported by third-party notes): Third-party analysis in file 03 says competitive PvP has a moderate decay curve, ranked systems extend life, and exploiters are the main threat. The five-way lists above show that every long-lived title has either ranked (Rivals), a seasonal cadence (Arsenal Reloaded, Rivals) or deep character kits to collect (TSB, Jujutsu Shenanigans: the Jujutsu Shenanigans Fandom Characters page, revision 2026-10-04, says 28 known characters of which 15 are complete and playable by everyone, which settles the old 27-versus-19 disagreement in favour of "28 known, 15 complete" [S41][S38][S119]).

### 3. Melee and battlegrounds: anatomy of the combat system

Developer-forum consensus on structure (named authors, dates):
- A combat system breaks into: a state machine (Idle, Attacking, Stunned, Blocking, Dashing, Invulnerable; one active combat state at a time), timing data per move (startup frames, active damage frames, recovery frames, cooldown, stun duration, i-frame duration), hit detection separated from animation (turn the hitbox on only during active frames, off right after), an input buffer, and a priority system for which action can interrupt which. mrshadyman274's reply to RedEgs (2025-10-04) is the clearest summary [S1].
- A May 2026 code-review post shows a four-state machine (Idle priority 1, Attack and Block priority 2, Stunned priority 3) with illegal transitions blocked; a reviewer called it reinventing the wheel, which is fair: the state list itself is the standard part [S35].
- Status effects such as stun are better as Attributes than BoolValue/ObjectValue instances and as coroutine- or timestamp-based checks than polling loops (devforum thread, 2023-06) [S36]. A 2022 thread shows the failure mode: a "Stun" BoolValue destroyed by Debris after 3 seconds that did not stop the stunned player from punching because the attack code never checked it [S34].
- Fighting-game frame vocabulary applies directly: startup, active, recovery, hitstun, blockstun, plus/minus on block. In 2D fighting games the fastest normal lands around frame 3 to 5, in 3D games around frame 10, at 60 frames per second [S54]. Roblox runs combat at the server's 60 Hz heartbeat and the animation clock; map "frame" to 1/60 s.
- A guide (2026-01-20) gives combo-table starting values: 1.0 s combo reset after idle, a cancel window of frames 12 to 18 on a 24-frame attack, 0.1 s animation fade between chain links, 2 to 4 frames of hit-stop on heavy impacts, hitbox tolerance of 1 to 2 studs for latency, AnimationPriority Action4 for attacks and Action3 for hit reactions, and sample hitbox sizes of 5x5x8 studs (attacks 1 to 2), 4x6x6 (attack 3), 6x4x10 (attack 4). Heuristic, from a commercial guide site [S73].
- Animation-driven timing: AnimationTrack:GetMarkerReachedSignal("Name") fires when playback reaches a marker added in the Animation Editor's event track, and is the supported way to start and stop hit windows [S78]. Roblox's AnimationTrack reference also exposes AdjustSpeed, TimePosition, Length and Priority for speed and cancel logic [S78].
- Rigs: devforum (2024-08 to 2025-02, 13 contributors) says combat developers lean to R6 for uniform proportions (R15 body scaling makes unfair hitboxes) and faster animation (one claims R15 animation takes about 2.5 times longer); opponents say Blender-skilled animators close the gap and R15 ragdolls are better [S87]. Counterpoint from file 03: from 2026-06-08 Roblox pays a higher DevEx rate only for games using the R15 framework [file 03 S27]. Decide deliberately; do not mix rigs in one arena.

Hit detection on Roblox, ranked by what developers recommend:
- GetPartBoundsInBox for wide swings, AoE and ordinary attacks; Raycast or Blockcast/Spherecast for thrusts, projectiles and thin lasers; Touched is not recommended for combat because exploiters can ignore damage and it is unreliable; Region3 is obsolete (codebykoi in a 2022-06 thread, with a tip to tag HumanoidRootParts via CollectionService to shorten the loop) [S74]. A 2025-03 thread favoured raycasting along the blade for accuracy and virtually no performance impact (one dev measured 5% script activity for a heavy module), with the limit that curved weapons and fast swings can tunnel unless ray frequency scales with speed [S2].
- WorldRoot exposes Raycast, Blockcast, Spherecast, Shapecast (cast a BasePart's shape along a direction), GetPartBoundsInBox, GetPartBoundsInRadius and GetPartsInPart; OverlapParams carries the filter, a MaxParts cap, collision group and a RespectCanCollide switch [S58]. Raycast length is capped at 15,000 studs and with instance streaming a client may not have distant parts streamed in, so a client raycast can miss [S13].
- Modules: Raycast Hitbox 4.01 (TeamSwordphin) is unsupported and was superseded by ShapecastHitbox 0.2.5 (2025-04-24: HitStart(timer?), HitStop, OnHit fires for every ray so you must dedupe targets, SetResolution, CastType attribute Raycast/Blockcast/Spherecast; cannot detect hits when the cast starts already intersecting a part, no stationary hitboxes, recommended on the client for responsiveness) [S61]. For projectiles FastCast Redux's maintenance lapsed; FastCast2 (Mawin_CK, 2025-11-24, version 0.1.0) adds parallel scripting, Blockcast/Spherecast and thousands of projectiles without physics replication, with a noted serial-phase cost above about 100 projectiles [S59].
- Client versus server authority for hits: community consensus is "every hitbox is exploitable in some way"; client-side detection gives responsiveness but opens exploit space, so the practical pattern is client prediction plus server validation (range, timing, cooldown, equipment, state); one thread suggests server-side hitboxes with slightly enlarged boxes and accepting higher-ping feel [S88][S75][S73]. A guide's example check: reject an attack whose animation the client claims it finished in 0.2 s when it takes 0.8 s [S73].

Battlegrounds move structure (third-party):
- TSB M1 chain: the TSB Fandom wiki (revision 2026-09-20) says a full four-hit M1 string deals 14% (3% + 3% + 4% + 4%), not the 3, 3, 4, 5 (15%) a third-party article gave, and that the final hit ragdolls the target; the wiki also says a perfectly timed block of an M1 gives the defender a critical hit (triple damage) on the next basic attack, a perfect block right after a critical hit gives a "Black Flash" (6x a normal M1, usable for about 4 s), blocking is hold F over a 180-degree arc, dashes have 5 s (forward and back, shared) and 2 s (side) cooldowns, side and back dashes are processed on the client while a forward dash is processed on the server, a get-up from ragdoll grants 0.5 s of no-stun, and the Strongest Hero's M1 startup is 11 frames [S118]. The older third-party figures follow (damage appears to be percent of max health); wall combo 12%, trash-can throw about 20%, "Black Island" 25%; ragdoll cancel can be used once per 30 s; perfect block window is short (one article says 3 frames); ranked 1v1 first to 2 round wins; top 15 on the leaderboard earn a title; a 10-kill streak triggers a server announcement and every 5 kills after that [S37][S5]. Derived: one full 4-hit M1 string is 3+3+4+4 = 14% on the wiki's numbers, so a lone M1 chain needs 8 strings (100 / 14 = 7.1) to remove 100%, which is why abilities and awakening do the killing; on the wiki, awakening needs 350 damage points (450 for Brutal Demon, 200 for The Strongest Hero) [S118].
- TSB moveset layering: M1 chain, character specials on cooldown that consume stamina, an Awakening or Burst state (a guide gives roughly 5 to 8 s for Burst and 10 to 15 s for Awakening), and a separate Ultimate whose meter builds from landing hits and parries; ultimate damage examples 40 to 70% of max HP, with one character one-shotting below 50% HP. Treat these as illustrative; the source tells readers to verify against the live game [S38].
- Jujutsu Shenanigans: dealing damage fills an awakening bar and pressing G triggers an awakened form that restores 15 to 60 HP and swaps the moveset; HP is 70 to 100; example cooldowns 13 s (Lapse Blue, 12.5 damage), 20 s (Reversal Red), 60 s (a Time Cell move with a 25 s duration), 120 s for Domain Expansions lasting 14 to 45 s; per-hit damage from 2 to 500. Third-party, March 2026 [S41].
- Slap Battles: one-button slap, gloves unlocked by slap count with passive and active (E key) abilities; the Killstreak glove (added 2021-06-04, 5,000 slaps) unlocks abilities at 75, 100, 250 and 1,000 kills; game modes variants such as "no oneshot gloves". Search summary of Fandom pages [S25][S103].
- Sword fighting: Sword Fights on the Heights IV's Linked Sword deals 30 slash and 20 lunge, lunge is a double-click, slow double-clicks register as two slashes, and all swords deal small contact damage (search summary of wiki pages, third-party, the original is from 2007) [S110][S52].
- Combat Warriors: block (F) is a parry that stuns the attacker about 3 seconds when it lands (parry window "around half a second" per guides), stamina gates attack, sprint, slide and dodge; third-party guides, not developer docs [S95][S5].
- Blade Ball: ball accelerates per deflection, speed curve steepest between deflections 4 and 6 and flatter after 8, ball travel time falls from about 0.25 s (deflection 4) to 0.17 s (5), parry window under 100 ms at high speed, a 500 ms active shield per search summary, clash gives both players knockback and resets the ball; "AP" ability power starts at 100 and blades add 5 to 15 per tier. Third-party glossary [S51].

### 4. Shooters: gunplay data from real Roblox games
- Rivals weapons (Update 22 era, third-party wiki, database synced 2026-10-03): 54 weapons (49 usable in standard loadouts, 5 gamemode-only). Assault Rifle: 12 damage per shot (13 before Update 14), falloff 13 down to 3 between 50 and 200 studs, crit multiplier 1.25 (was 1.5 before Update 5), 0.10 s cooldown (0.11 before Update 14), 20-round magazine (was 30), -10% movement while equipped, a free starter [S7]. The weapons database lists: Assault Rifle 12 to 3, 0.10 s, 20/100 ammo, reload 1.56 s; Bow 30/37.5/45/60 by charge, 0.25 s; Sniper 50, 1.50 s, 4/12 ammo, reload 1.80 s; Minigun 8 to 4, 0.05 s, 300 ammo; Battle Axe 55, 0.70 s; Maul 75, 1.00 s [S8]. Gap-pass resolution from the RIVALS Fandom wiki (MediaWiki API, revisions 2026-09-25 to 2026-10-01, which carries the same infobox fields): Sniper is 50 base damage, critical 150 (a 3x multiplier), cooldown 1.50 s, ammo 4/12, reload 1.80 s, empty reload 2.13 s, move speed -20%, so a headshot one-shots a 100 HP player and the "100 body / 200 head" figure was wrong; Shotgun is 8x10 falling to 2.5x10 (ten pellets) between 10 and 50 studs, critical 12x10, cooldown 0.70 s, ammo 7/35 with segmented reload; Assault Rifle 12 to 3 over 50 to 200 studs, critical 15 to 4, 0.10 s, 20/100, reload 1.56 s, -10% move speed, free; Chainsaw 60 damage, 0.60 s, reach 6, ability +85% speed and 180 damage per second; Battle Axe 55 damage, 0.70 s, spin 30 damage over radius 10 on a 4 s cooldown [S117]. Update 21 (2026-06-26) increased the Sniper headshot hitbox by 17% and Update 22 (2026-09-04) added the Wildcat SMG (35 Keys, "the first weapon with realistic recoil that pushes the camera up"), raised Burst Rifle reload to 1.6 s, buffed the Shotgun and set Riot Shield max health to 500 [S47][S48].
- Derived TTK against 100 HP using TTK = (ceil(HP / damage) - 1) x time between shots, which is the standard formula (TTK Lab, search summary [S94]) and ignoring falloff, spread, reload and headshots: Assault Rifle 12 damage gives ceil(100/12) = 9 shots, 8 gaps x 0.10 s = 0.80 s; with a 1.25 crit on every shot (15 damage) it is 7 shots, 0.60 s. Shotgun with all 10 pellets at 8 damage = 80 per blast, 2 blasts, 1 gap = 0.70 s. Minigun at 8 damage = 13 shots, 12 x 0.05 = 0.60 s. Sniper at 50 damage: 2 body shots, 1.50 s; one shot to the head (critical 150, the 3x multiplier is published on the wiki) [S117]. Melee: the Rivals wiki's Chainsaw page lists 60 damage per hit and also says it kills in "3 swings"; 60 damage kills 100 HP in 2 hits, so the page is inconsistent, probably left from an era when some modes had 150 HP (a patch note changed Team Deathmatch, Free For All and Gun Game max health from 150 to 100); the duel health value itself is not stated on the pages I read, so keep this as an open item [S71][S117].
- So the fast end of a duel shooter on Roblox is about 0.6 to 0.8 s at close range, a few tenths of a second after your first hit. Combined with Roblox's 60 Hz simulation and a typical 50 to 150 ms ping, a hit registers within a handful of bullets, which is why hit registration and lag compensation dominate player complaints.
- Rivals duel format: first to 5 round wins, 1 min 30 s per round, 1v1 up to 5v5 plus 16-player FFA, TS/TDM (8-minute modes), Gun Game and rotating daily modes, 21 modes, 21 standard maps plus 7 "Big" variants, 4 loadout slots, 54 weapons, players pick or ban a map [S48][S71][S6]. Season 3 (2026-04-24) added Grapple (pull yourself to a point or drag an enemy), Spear (longest melee, three-hit combo, throwable) and three maps (Westown, Museum, Studio) [S72].
- Rivals movement (third-party, 2026-05-10): slide jump ~150 to 160% of base speed, slide ~130 to 140%, strafing ~90 to 95%, equipped-weapon speed modifiers (knife +10%, crossbow +5%, sniper -20%, minigun -25%, RPG -15%), chainsaw boost +85% briefly, War Horn buff +25% team-wide for 6 s on a 45 s cooldown, slide-to-jump window 0.1 to 0.2 s [S71]. Design reading: weapon weight is expressed as movement speed, a simple, readable balance lever.
- Phantom Forces (StyLiS Studios): all projectiles obey bullet drop using Roblox gravity of 196.2 studs/s^2; ranks have no cap and rank-up XP follows XP = rank x 1000 with credits and a weapon unlock on most promotions (search summary of Fandom pages, third-party; PF's numbers drift with updates) [S99]. It went free-to-play on 2016-12-08 after paid early access in 2015-09 [S99].
- Arsenal: standard mode needs 32 kills, dying to a knife or suicide demotes you a weapon level, weapon 31 is the Golden Gun and 32 the Golden Knife; Reloaded (2025-07-06) was a codebase, UI and anti-cheat rebuild with no new content in Stage 1 and a week of fixes after (server-browser performance on 07-08 and 07-11, bounce pads, map/mode rotation to prevent immediate repeats) [S105][S62]. A search summary of the Arsenal wiki says the old anti-cheat banned about 40,000 exploiters per month yet ESP and aimbots were hard to catch [S62].
- Official kits. Roblox's Weapons Kit ships nine prefab weapons (Pistol, Shotgun, Auto Rifle, Submachine Gun, Sniper Rifle, Crossbow, Grenade Launcher, Rocket Launcher, Railgun), projectile-based with an over-the-shoulder camera (hitscan simulated by high projectile velocity), about 30 configuration values per weapon (fire modes Semiautomatic/Automatic/Burst, damage falloff, ammo per clip, recoil), a WeaponsSystem folder and BaseWeapon/BulletWeapon/BowWeapon classes [S67]. The Laser Tag template (announced 2024-06-21 by MintyUltra) offers a blaster-only and a team-deathmatch version with damage, ammo capacity, recoil and spread attributes, view models, and an extensible round system; feedback noted viewmodel clipping and mobile UI centering [S33][S32]. The Combat template gives a sword, pistol and health pack [S32].
- Roblox's "Implement blaster behavior" tutorial is the first-party reference for client/server split: the client reads input with ContextActionService, checks that the blaster is Ready, builds the blast data (camera position and raycast), and fires a remote; the server validates table structure, presence of a CFrame and ray result, equipped blaster, character, and a positional sanity check ("has the player moved an excessive distance"), owns the blaster state (Ready, Blasting, Disabled) and the cooldown (secondsBetweenBlasts), reduces health, and replicates [S31].
- Map-design principles (non-Roblox, applicable): three lanes, three to four chokepoints, "less is more" on routes because too many paths make defence impossible (Dust II has exactly three paths; Temple of Anubis three avenues at different heights) [S55]; for PvP err toward less cover so players create their own with movement; cover types soft/hard/half/full; and "prioritize fairness over balance" because perceived unfairness is what players punish [S53]. A level-design site quotes a longest sightline of about 80 m and under 40 m for most weapons (second-hand, search summary; meters must be converted to studs and the stud-to-metre convention is not something I verified, so playtest instead) [S111]. Mirror (bilateral) symmetry is the cheap fair default; asymmetry is realistic but "very time consuming" [S53].

### 5. Netcode, authority and anti-exploit on Roblox in 2026
This is the largest platform change for PvP builders since 2023.

- Server Authority (first announced at RDC 2025, newsroom 2025-09-05; early access 2025-10-07; "full release" 2026-07-09 by staff welblander): the server is the source of truth, clients are trusted only to report inputs, the client predicts and rolls back and resimulates on misprediction, so speed hacks, flings and wall clips are blocked without custom anti-cheat code. It is opt-in per experience. [S15][S11][S10][S86][S82]
- Enabling: set Workspace.AuthorityMode to Server in Studio, which configures NextGenerationReplication, PlayerScriptsUseInputActionSystem, SignalBehavior = Deferred, UseFixedSimulation and requires StreamingEnabled [S10][S82][S79]. Workspace in the engine reference lists AuthorityMode, UseFixedSimulation, NextGenerationReplication, SignalBehavior and ImprovedPhysicsReplication as properties [S79].
- Limits to design around (staff post 2026-07-09): at most 8 animation tracks per Animator, 64 attributes per instance and short (<=50 character) string attributes and names, custom emotes and strafing animations not supported, RemoteEvents are not on the shared timeline (a 40 to 50 ms offset is quoted), mobile and console updates can lag desktop by days; standard Humanoid characters, backpacks and tools are supported [S10][S82]. Gap-pass check against the docs: the attribute rules (first 64 attributes, names and string values of at most 50 characters), time() as the only synchronised clock (tick(), os.time() and os.clock() are not synchronised and do not roll back), the ban on caching AnimationTracks and the rule that instances created during prediction must be parented before the end of the frame are all in the first-party docs [S113]; the Roblox Physics Team post lists Hz1, Hz5, Hz10, Hz15, Hz30 and Hz60 as the only simulation frequencies with Hz30 as the default [S116]; the 8-track limit, the no-strafing-animation limit and the no-yield rule come from the staff posts only and are not in the docs pages I read. In simulation code use time(), not tick(), os.time() or os.clock(); use InputActions only (not UserInputService); poll InputAction:GetState() inside BindToSimulation instead of listening to Pressed/Released because rollback re-fires signals on different frames; do not yield (no task.wait or task.spawn) inside BindToSimulation, everything resolves in one frame; do not touch GUI from simulation steps; do not cache AnimationTracks because they become invalid on rollback, query the Animator when needed [S82][S83][S89].
- Cost: resimulation load scales with latency; the staff deep dive says at 100 ms of latency physics must recalculate about 6.25 times the normal load per frame, and calls resimulation performance a top internal priority [S84].
- Combat specifics: for melee and fighting games staff suggest enabling prediction of other players as the form of latency compensation; for shooters, server-side rewind for hit detection was described as a future item ("soon") in the deep dive, so a shooter on Server Authority still needs its own rewind for hits [S84]. A fighting-game framework on the beta API (CasuallyCritical, 2026-02-08) used "server rooms" to isolate matches without reserved servers, and notes that when rolling back an opponent's actions you must skip animations ahead using synchronised server time rather than replay from the start; testers still reported rubber-banding [S85]. ThoughtSpinnr (RDC/newsroom quotes) says combat can be fully simulated on the client with hit, stun and ability logic then rolled back on misprediction, but there are no published cheat-reduction statistics [S12][S86].
- Maturity warning: during early access (2025-10) a community gun system relied on an internal service that the author said "is going to be restricted again soon"; do not build on unpublished services [S16]. Treat Server Authority as new (about 3 months in full release at the date of this note), mobile and console lagging, and plan a fallback.
- Replication: from 2026-06-15 Roblox rolled out "improved physics replication" (opt-in testing from 2026-06-09 via Workspace.ImprovedPhysicsReplication; a Disabled option added 2026-06-16; bug fixes continued 2026-07-14), aimed at eventual consistency so dropped packets do not leave projectiles or physics objects in wrong final positions; NextGenerationReplication is the advanced variant required by Server Authority [S14].
- Classic (non-Server-Authority) lag compensation, what devs build: record each character's pose every Heartbeat (about 60 Hz) in a ring buffer, have the client send a timestamp from workspace:GetServerTimeNow(), clamp it, rewind targets to that time, then test the shot. Open-source examples: RollbackHitbox (snowoar, 2026-04-02): MAX_REWIND_SECONDS 0.5, INTERPOLATION_BUFFER 0.1 s (to account for a character replication delay of about 20 Hz, per its author), MAX_ORIGIN_DISTANCE 12 studs from the rewound shooter position, oriented-bounding-box tests, shot direction trusted unless you add a line-of-sight raycast, cannot detect aimbots [S3]. Rewind (text21, 2025-12-18, v1.1.0 2025-12-20): default 30 Hz snapshots, 500 to 1,000 ms maximum rewind, validators for ray, sphere, capsule, cone and fan (shotgun), no wall checks unless you add raycasts [S4]. A January 2025 forum thread recommends the same pattern, recording positions about every 0.1 s and keeping about 2 s of history (20 snapshots), with Valve's multiplayer networking as the reference [S60]. The "favour the shooter" cost is that a defender can be hit shortly after reaching cover [S56]. Valve's Source defaults to a 100 ms interpolation period and rewinds the target using the shooter's latency (search summary; the Valve wiki returned 403) [S92]; Gabriel Gambetta's lag-compensation article describes the same trade [S56]; Gaffer On Games sets client-side prediction with an authoritative server as the standard for first-person action [S57].
- Remote traffic: UnreliableRemoteEvent drops payloads over 1,000 bytes and delivers neither reliably nor in order, so use it only for cosmetic broadcasts (muzzle flash, hit sparks), never for damage or state [S77]. RemoteEvent arguments follow the usual rules (functions become nil, tables are copied, metatables lost) [S77].
- Roblox's own security guidance: assume a determined exploiter controls local state and network traffic; the pattern is receive input, validate, execute on the server, replicate; ask what happens if a client sends malicious values or fires 1,000 times per second; keep logic and data in ServerScriptService, not in replicated containers [S76]. For guns: a 2018 devforum thread title "Making exploiter-proof guns" is the classic; it is stale and I did not extract it.
- Humanoid damage behaviour: ForceField only blocks damage from Humanoid:TakeDamage(); setting Humanoid.Health directly still hurts (search summary of the docs) [S81]. A new ForceField appears on spawn when SpawnLocation.Duration is greater than zero [S81]. So implement spawn protection with TakeDamage plus ForceField, never by writing Health.
- Network ownership: the server owns anchored parts and all parts by default; a client owning a part makes it responsive but trustable only as far as you validate; ownership can be assigned with BasePart:SetNetworkOwner() (server call) [S80]. For PvP, never give a client ownership of anything that decides damage.
- Platform anti-cheat: Hyperion (Byfron) has been in the 64-bit desktop client since 2023-05-03 and blocks injection on desktop, but Roblox's own security guidance still assumes a determined exploiter controls the client, so server-side validation is still required (the earlier claim that exploit scripts for Rivals were being advertised on 2026-10-03 came from search summaries and is deleted as unsupported) [S96][S76]. Rivals in Update 22 (2026-09-04) moved ranked behind stricter verification (email, phone or age check), made ranked region-locked, and in Season 3 required Level 100 [S47][S72][S48].

### 6. Ranked, matchmaking and rating
- Rivals ranked (gap pass: the RIVALS Fandom Ranked page, revision 2026-09-27, resolves most conflicts below in favour of the current requirements: 10 standard duels, Level 100, a 14-day-old account, a verified phone number or Robux spend or ID check, 30 tasks; the table is Bronze 0, Silver 600, Gold 1,200, Platinum 1,800, Diamond 2,400, Onyx 3,000, Nemesis 3,600 with 200-point sub-tiers; party members within 4 tiers (800 ELO), so 600 is stale; one daily ELO Shield below Platinum I; decay of 100 per day from the 8th idle day at Onyx I or higher down to 3,000; leaving a match is an automatic loss plus a 15-minute lockout; ranked aim assist is nerfed by 50% and auto-shoot is locked to Dynamic; the same page still says the maximum placement is Diamond I at "2,500 ELO" against a 2,400 table, an internal inconsistency I could not settle) [S117]. Older text from the earlier pass follows (requirements changed over seasons, so numbers conflict): nine tiers, Bronze, Silver, Gold, Platinum, Diamond, Onyx each with I, II, III at 200 ELO steps starting at 0, Nemesis at 3,600 with no sub-tiers, Archnemesis for the top 200; 10 placement matches and a maximum starting placement of Diamond 1 (the page says 2,500 ELO while the Diamond I threshold is 2,400, an inconsistency); placement depends on results and the previous season's rank; one free ELO Shield per day below Platinum 1 that prevents one loss and does not stack; decay of 100 ELO per day after 7 days of inactivity at Onyx 1 or higher, down to 3,000; parties must stay within "4 ranks / 800 ELO" (file 03 lists 600 ELO from a different date); ranked modes 1v1, 2v2, 3v3; each team bans one map and two weapons; third person disabled; maximum two weapon switches per duel; entry required 10 completed duels, Level 30 and 14-day-old accounts on the older page, but the current wiki and Season 3 pages say Level 100, 30 tasks and a verified account [S6][S48][S72][S117]. Update 22 changed the formula so gains and losses above 3,600 scale with actual rank and a dominant win can yield +0, and Season 3 players who got +0 received a "Stomp" charm [S47]. Season 3 ("The Fame Season") began 2026-04-24 [S48].
- TSB ranked: 1v1 and 2v2 with ELO, first to 2 round wins, monthly casual leaderboard titles for the top 15 (file 03 [S69], [S37]).
- Roblox Custom Matchmaking (beta 2025-04-08, all experiences 2025-11-06 per staff ElPsyCongroo_Y): Roblox's default scoring weighs eight signals (Friends, Occupancy, Language, Age, Latency, Voice Chat, Device Type, Play History over 28 days) with Friends at weight 10 and the others around 3; creators can reweight them and add up to 2 custom signals (for example a skill rating), with up to 5 player attributes and 5 server attributes per game; player attributes read from a DataStore (key template with {UserId}, JSON value path, scope), server attributes are set with MatchmakingService:SetServerAttribute / GetServerAttribute; the beta required 500 or more concurrent players; Studio offers a preview of mock-server scoring; advice is to "make small adjustments" [S42][S44][S46][S43]. Because it matches players to servers, it suits large lobbies and skill-banded servers; the matchmaking docs say the service filters out full, private, reserved and about-to-close servers before scoring, so it cannot place players into reserved duel servers and strict 1v1 queues need your own queue plus reserved servers, as most known games do [S115].
- Own-queue pattern: MemoryStoreSortedMap keyed by party leader with join timestamps as sort key, a coordinator elected via UpdateAsync on a hash map, up to 200 parties read per cycle, a developer grouping function, UpdateAsync to confirm parties still queued, and reserved servers with access codes; the author's capacity estimate is about 8,400 units per minute for 200 parties against a 21,000 allocation; the write-up does not cover widening the rating window over time [S45]. A community tutorial advises MemoryStore over MessagingService for matchmaking [S45].
- Rating maths: classic Elo K-factors are 32 for new players, 16 for established and 10 for masters (chess usage), Glicko-2 adds a rating deviation and volatility and works best on batches of 10 to 15 games per period, and placement matches use an elevated K for fast convergence (general sources, not Roblox) [S101]. The open-source OpenSkill module exists on the devforum (title only, not fetched).
- Smurfing and boosting: Rivals' answer was verification gating plus region locks (above). Roblox's 2026 age and ID checks make that practical; An experience reads it with `Player:IsVerified(level)`, a server-only method that takes an `Enum.VerifiedLevel` (Low is the default and requires meeting at least the low level; High is stricter), is a different check from the verified badge, always returns false in Studio, and the docs warn not to block all unverified users by accident; the account-verification guide names ranked queues as a use case [S114].

### 7. Monetization and policy specific to PvP
- Rivals' model (third-party): free to play, cosmetics only for the fight itself (skins, wraps, charms, finishers), Keys as a mid-currency purchasable with Robux, and 18 containers: 5 wrap boxes (5 Keys), 6 skin cases (249 Robux or 724 for three, or 10 Skin Tickets), charm capsule 3 Keys, finisher pack 10 Keys, event chests (30 event currency), plus a free Standard Weapon Crate; key bundles come in 5 tiers from 10 Keys to 1,100 Keys; a daily shop rotates per player every 24 hours; weapons cost 0 to 75 Keys (standard), 200 to 550 (prime), 600 to 700 (contraband); an Update 22 starter bundle was 67 Robux plus 25 Keys; a Season 3 prop bundle cost 824 Robux; wraps count 65 common, 135 rare, 124 legendary, 22 mythical, 16 unique [S63][S64][S48][S47][S72].
- Odds: Roblox requires every paid random item (including keys, tickets and probability modifiers) to show all outcomes and actual numeric odds as percentages totalling exactly 100%, visible before purchase through a Details/Info button, and per-user restrictions apply via PolicyService:GetPolicyInfoForPlayerAsync (ArePaidRandomItemsRestricted, IsPaidItemTradingAllowed) with one of six treatments for restricted users [S65]. A 2026-06-26 press piece frames the global odds disclosure as following South Korea's 2024 law with penalties under discussion; secondary source [S66]. Rivals made its odds view more granular in Update 21 (2026-06-26; nested boxes, per-weapon chance for "random" cosmetics) per a search summary [S64].
- Pay-to-win perception is the PvP-specific monetization risk: guides call TSB "pay-to-progress-faster" via passes to unlock characters, Anime Battle Arena the most aggressively monetised with paid characters, and Combat Warriors the most F2P-friendly with competitive base weapons (third-party opinion, 2026) [S5]. Design the paid layer as cosmetics, convenience and unlock speed, and cap what money can buy in ranked (bans and mirrored loadouts help; Rivals bans two weapons per team).
- Content ratings: Roblox's maturity labels run Minimal, Mild, Moderate and Restricted (18+ and age-checked); mild violence is implied or unrealistic (for example bodies vanishing at zero health), moderate is non-graphic realistic violence and light realistic blood, restricted covers strong violence, heavy realistic blood and dismemberment; the creator must answer the Maturity & Compliance Questionnaire for the most extreme content a player can encounter and misreporting risks removal from discovery [S68]. Community Standards prohibit "realistic modern firearms" outside in-experience items and extreme real-world gore [S69]. Practical effect: stylised guns and non-realistic blood keep a shooter in the Minimal/Mild or Moderate band and so reachable by the 9 to 15 audience; check the questionnaire before art direction locks in blood or realistic weapons.

### 8. Platform and input realities for PvP
- Mobile is 80% of sessions (third-party Q4 2025) but shooters skew PC; that means touch aiming, auto-sprint, auto-fire or tap-to-fire options and clear thumb zones matter for reach, while ranked and tournament-feeling modes will be PC-dominant [S70].
- Aim assist is contested: a devforum thread (stale, thread number places it around January 2021) split between "touch and gamepad aiming is much harder, so assist is fair" and "how do you stop PC users enabling it without server verification"; one suggested a 5-degree threshold; the practical solution is to apply assist server-validated by input type and keep the same hit rules for everyone [S49]. Search summaries show Rivals players on touch aim with two fingers (one on fire, one on camera) and argue about aim assist; Roblox's camera reads two-finger gestures as pinch-zoom unless handled [S91].
- Animation and game feel: hit-stop is described as 3 to 12 frames (0.05 to 0.2 s) in general game-feel guides (search summary of a non-Roblox article, not cited above), while the Roblox-specific guide uses 2 to 4 frames for heavy impacts [S73]; camera shake with fast exponential decay and direction aligned to the hit is the common devforum answer (search summary of several threads: "Help with Combat", "How would I make the camera follow through with attacks in combat?"); treat both as heuristics.

## How to apply it (rules for an AI builder)

Scope and genre choice
- DO pick one of the five shapes in section 2 and build the whole game around its single skill. A complete first version of a battlegrounds game is one arena, one rig, 1 to 3 characters each with M1 plus 4 moves plus an awakening, a block and a dash, a kill leaderboard and respawn. A duel shooter is 1v1 best-of-5, 3 to 6 weapons, 2 maps, a queue, an end screen and a simple ladder.
- DON'T clone TSB or Rivals one-to-one. File 03 notes Roblox pays more for novel games in 2026 and clones decay; combine a proven loop with one new input (examples in this note: grapple/spear/chainsaw utility in a duel shooter, a parry-reflex loop like Blade Ball inside a battlegrounds).
- DO design every round or match to end in 1 to 10 minutes. Averages in section 1 are 8 to 17 minutes per session. Use 90 s rounds for duels (Rivals), first to 2 for a ladder (TSB), 8-minute FFA windows (Rivals TDM/FFA).

Combat system rules
- DO run damage, health, cooldowns, stun and state on the server only. The client may predict animations, VFX and sounds and may request an attack; it must never report damage or victims as facts.
- DO model combat as an explicit state machine with at most one combat state active (Idle, Attacking, Blocking, Stunned, Dashing, Invulnerable) and per-move data: startup, active, recovery, cooldown, stun, i-frames, damage, knockback, hitbox size and offset. Keep that data in one ModuleScript table so balance edits are one-line changes. [S1]
- DO store state as Attributes on the character (State, StunUntil, CooldownX) so client UI and animation can read it without remotes; write them on the server.
- DO gate hit windows with animation markers (GetMarkerReachedSignal "HitStart"/"HitEnd") and, on the server, also with a timer fallback in case the animation is cancelled or the track fails. [S78]
- DO use GetPartBoundsInBox for swings and AoE, with OverlapParams excluding the attacker, a MaxParts cap (32 is plenty for an arena), a per-swing hit set so one swing hits one target once, and a hitbox 1 to 2 studs more generous than the visual for latency. Use Raycast/Blockcast/Spherecast for projectiles and thin thrusts. [S74][S73][S58]
- DON'T use the Touched event for damage. [S74]
- DO apply hit reactions with TakeDamage, set Stunned on the victim, cancel any active attack, and use hit-stop (2 to 4 frames light, up to about 8 for finishers; heuristic) and a short camera shake. DON'T set Humanoid.Health directly for damage if you rely on ForceField spawn protection (it only blocks TakeDamage). [S81]
- DO give every defensive option a cost: block drains a guard meter or stamina, perfect block has a narrow window (3 frames reported for TSB; about 0.5 s parry in Combat Warriors; start at 0.15 to 0.25 s for a beginner-friendly Roblox game, heuristic), a block break or grab beats pure turtling, and a dash has a cooldown (Rivals' Scythe dash 4 s is a reference for a movement ability, [S71]).
- DO fill the ultimate meter from damage dealt and parries and cap kit power so a full kit is a few seconds of commitment, not a fight-ender; keep awakening durations around 10 to 15 s (TSB reference) [S38].
- DO test with artificial latency (Studio's network settings for simulating incoming replication lag; I did not verify the exact setting name) at about 150 ms, and with the device emulator before calling combat done.

Shooter rules
- DO compute and publish a TTK table before tuning: TTK = (ceil(HP / damage) - 1) x seconds between shots. Choose a target (about 0.6 to 0.8 s for a duel shooter at close range is the Rivals range in section 4, about 1 to 2 s for a team shooter) and move damage and fire rate until each weapon class sits in its band. Document falloff ranges in studs.
- DO give each weapon one clear role and one cost: speed (minigun -25%, sniper -20%) or ammo or reload (sniper 4-round magazine, 1.8 s reload) or range falloff (AR 13 to 3 over 50 to 200 studs). Weight expressed as movement speed is easy for players to read. [S7][S8][S71]
- DO validate shots on the server: fire-rate gate (server cooldown from the weapon stat), ammo count on the server, shooter alive and weapon equipped, origin within about 10 to 12 studs of the shooter's character (RollbackHitbox uses 12) [S3], a server line-of-sight raycast from the claimed origin to the claimed hit point, and a range cap. [S31][S3]
- DO add rewind lag compensation only when you need it: for hitscan duels with PC players it is worth it; clamp rewind to 0.25 to 0.5 s and cap the client-supplied timestamp so a high-ping or cheating client cannot shoot into the distant past. [S3][S4][S60]
- DO draw tracers and impact effects on the client at once and send them to other clients with UnreliableRemoteEvent; send the authoritative hit result by RemoteEvent. [S77]
- DON'T run client-trusted hitscan where the client says "I hit player X". That is the standard exploit. [S76]
- DO keep gun feel data-driven (recoil patterns, spread, ADS time, reload time) in attributes or a module table, and tune it by feel with a shooting-range lobby like Rivals' hub (duel pads and a shooting range) [S91].

Server Authority decision
- DO consider Server Authority for a new competitive game that uses the standard Humanoid and wants anti-cheat without custom code; read the limits first (8 animation tracks, 64 attributes with short strings, no custom strafing animations, yields forbidden in BindToSimulation, desktop-first rollout). [S10][S82][S83]
- DON'T port an existing complex combat framework blindly; the official guidance expects both client and server to run the core simulation from a ModuleScript, with inputs polled from InputActions and state in attributes. [S82][S83]
- DO keep a non-Server-Authority fallback (classic server-validated combat) until the platform restrictions have been checked on mobile and console for your audience. [S10]

Ranked and matchmaking
- DO ship ranked only after casual works. Rivals required Level 100, task completions and account verification for ranked in 2026 [S48][S72]; a small game can use "10 casual matches played" as the gate.
- DO use 10 placement matches, 200-point tiers, Elo-style gains scaled by opponent rating, a daily loss shield below the top two tiers, inactivity decay only at the top, a party rating gap limit, map and weapon bans, and a seasonal soft reset. All of these are visible in Rivals and are the best sourced template. [S6]
- DON'T promote ladder points to a Robux purchase.
- DO store the rating in a DataStore with UpdateAsync and write after each match, and expose the rating as a Roblox custom matchmaking signal if you use server-based matchmaking. [S42][S46]

Monetization and safety
- DO sell cosmetics, convenience and unlock speed, not damage. DO show odds for every crate, key or spin as percentages totalling 100% and gate with PolicyService; remember keys count. [S65]
- DON'T add gore beyond your maturity label; answer the questionnaire for the worst thing a player can see. [S68]
- DO add a spawn shield (2 to 3 s ForceField via SpawnLocation.Duration, heuristic) and a visible kill feed, kill-streak announcement (TSB announces at 10, then every 5), and a post-death replay or killer name to make deaths feel fair. [S37][S81]

## Recipes (each becomes a skill)

### Recipe 1: Server-authoritative combat state machine (melee)
When to use: any melee, battlegrounds or sword game; this is the foundation for recipes 2 to 6.
Steps:
1. Create ServerScriptService/Combat/CombatState (ModuleScript) holding a table of allowed states and priorities: Idle=1, Blocking=2, Attacking=2, Dashing=2, Stunned=3, Dead=4. [S35][S1]
2. Store state as character attributes: SetAttribute("State", "Idle"), SetAttribute("StunUntil", 0), per-move SetAttribute("CD_<Move>", serverTime). Use workspace:GetServerTimeNow() for all timestamps so clients can read them.
3. Provide CombatState.TrySet(character, newState) that checks the current state and priority, returns false on illegal transitions (Attacking to Blocking directly is illegal unless the move has a cancel window).
4. Implement stun as a timestamp, not a loop: Stun(character, seconds) sets StunUntil = max(existing, now + seconds) and State = "Stunned"; a single Heartbeat or a task.delay that re-checks the timestamp clears it. Overlapping stuns extend, they do not stack.
5. Every combat remote handler begins with: player owns the character, humanoid Health > 0, State allows the action, cooldown elapsed, per-player rate limit (for example 20 requests per second max).
6. Disable movement by setting Humanoid.WalkSpeed to 0 and JumpHeight to 0 during hit-stun, restore exact prior values after (store them; do not hard-code 16).
Pitfalls: a stun that only changes a value but is not checked in the attack handler (the 2022 thread failure [S34]); leaving the character stunned if the animation errors (always set a max duration); using BoolValues that fire ChildRemoved bugs (use attributes [S36]).

### Recipe 2: M1 combo chain with input buffer and animation-driven hit windows
When to use: battlegrounds, brawlers, sword games.
Steps:
1. Define a combo table: Hit1..Hit4 with animation id, damage (TSB reference 3,3,4,4 percent of max health per the TSB Fandom wiki [S118], or flat values 8,8,10,14 for a 100 HP game), hit window (start and end marker names or fractions of animation length), cooldown between swings, final-hit knockback, hitbox size and offset (heuristic 5x5x8, 5x5x8, 4x6x6, 6x4x10 studs [S73]).
2. Client: on MouseButton1/ContextActionService action, if the local state allows, play the animation immediately (prediction) and fire a RemoteEvent "Attack" with the combo index only, never damage.
3. Server: validate the request, advance the combo index if the last attack was within the combo reset window (heuristic 1.0 s [S73]), set State Attacking, play or confirm the animation on the server Animator, connect GetMarkerReachedSignal("HitStart") to open the hit window and "HitEnd" to close it, with a fallback task.delay of the window length.
4. Input buffer: if the player clicks during recovery, store one buffered attack for up to about 0.2 s and consume it when recovery ends.
5. At the end of the chain apply a combo cooldown (about 0.5 to 1.0 s end lag) so M1 spam is not free; allow cancels only in the defined frame window (for example frames 12 to 18 of 24, [S73]).
Pitfalls: client that sends a combo index the server never reached (ignore it, the server holds the true index); animation priority conflicts (attacks Action4, hit reactions Action3 [S73]); R15 and R6 animation mismatch [S87].

### Recipe 3: Server hit detection for a swing (GetPartBoundsInBox, deduped)
When to use: every melee attack and AoE.
Steps:
1. Build an OverlapParams once: FilterType Exclude, MaxParts 32; refresh FilterDescendantsInstances = {attackerCharacter} per swing.
2. During the active window, call workspace:GetPartBoundsInBox(root.CFrame * offset, size, params) on Heartbeat (typically two to six times across the window) or once at the hit marker for snappy single-frame hits.
3. For each part, find the character with part:FindFirstAncestorOfClass("Model"), get its Humanoid, skip if Health <= 0, skip if already in this swing's hit set, add it to the set, then run ApplyHit.
4. Add a sanity check: victim root within (hitbox reach + 3 studs) of the attacker root at the time of validation.
5. Tag characters with CollectionService ("Combatant") and iterate only tagged roots if you have a big arena; [S74] suggests tagging HumanoidRootParts.
Pitfalls: counting several parts of the same character as separate hits (dedupe by character); hitting through walls (add an optional Raycast from attacker to victim torso for ranged moves); forgetting to cap MaxParts.

### Recipe 4: Block, perfect block (parry) and guard break
When to use: any game where defence should be a skill.
Steps:
1. Hold-to-block sets State Blocking on the server on input down and clears on release; record BlockStart = server time.
2. Perfect block: if a hit lands within the first PerfectWindow seconds of BlockStart (start at 0.2 s, tune toward 3 to 8 frames for experts [S5][S37]), negate damage, stun the attacker for 0.6 to 1.0 s (Combat Warriors' full parry stun is about 3 s, so treat as the upper bound [S95]), and add to the ultimate meter. Normal block: reduce damage 70 to 100% but drain Guard (for example 100 Guard, heavy hits drain 25) and apply small pushback.
3. Guard break: at 0 Guard the blocker is Stunned for 1.5 s; grabs and unblockables ignore Blocking.
4. Block regeneration: Guard regenerates after 1.5 s without hits.
5. Provide a clear sound and flash for perfect block and for a broken guard; the client must be able to see why it lost.
Pitfalls: parry windows tied to client time (use server time and give the client an input-timestamp allowance of its measured ping, clamped to 0.1 s); allowing block while attacking (illegal transition by Recipe 1).

### Recipe 5: Four-move kit with cooldowns and an awakening meter (battlegrounds characters)
When to use: battlegrounds and ability fighters.
Steps:
1. Data-drive characters: Characters[ID] = {Name, Health 100, WalkSpeed 16, M1 = combo, Moves = {[1..4] = {key, cooldown, cost, startup, duration, damage, hitbox, effect}}, Awakening = {duration 12, healAmount 30, moveset swap}, Ultimate = {...}}.
2. Cooldown module: per-player table of ready times (server time); server rejects a move if now < ready; clients mirror cooldowns from attributes for UI.
3. Starting values: move cooldowns 5 to 25 s for specials, 60 to 120 s for big ones (Jujutsu Shenanigans examples 13, 20, 60, 120 s [S41]); damage as percent of max HP (TSB: 3 to 5% M1, 12 to 25% specials, 40 to 70% ultimates [S37][S38]).
4. Meter: Awakening meter fills by damage dealt (for example 1 point per 1% of enemy HP dealt, 100 points to awaken) and by parries; on trigger set State Awakened for 10 to 15 s, heal 15 to 60 HP (Jujutsu Shenanigans [S41]), swap the moveset table and add speed.
5. Roster plan: start with archetypes (Brawler, Tank, Speedster, Ranged, Support) with clear strengths and counters rather than mirrored kits [S39]; track win rate per character from day one.
Pitfalls: a move with no cooldown commitment (players hold one move in reserve [S41]); too many characters before balance data exists.

### Recipe 6: Hit feedback: hit-stop, knockback, ragdoll and camera shake
When to use: after recipe 3, before any balance work. Feedback is what makes combat feel good.
Steps:
1. On a confirmed hit the server fires a cosmetic UnreliableRemoteEvent to nearby clients with {attackerId, victimId, strength 1..3}; payload under 1,000 bytes. [S77]
2. Client: for strength 1 do a 2-frame animation speed dip (AdjustSpeed(0) for 0.03 s on attacker and victim tracks, then restore), flash with a Highlight on the victim for 0.1 s, play a layered impact sound; strength 3 does up to about 8 frames (0.13 s), a camera shake with fast exponential decay in the direction of the hit, and an FOV kick. [S73]
3. Knockback server-side: set victim root AssemblyLinearVelocity or use a LinearVelocity with MaxForce and a 0.2 to 0.4 s lifetime away from the attacker; the final hit of a chain launches (TSB 4th hit). Temporarily set the victim's network owner to the server (SetNetworkOwner(nil)) during launch to avoid exploit pushback abuse. [S80]
4. Ragdoll: the server calls Humanoid:ChangeState(Enum.HumanoidStateType.Physics) or uses a ragdoll module with Start(rig)/Stop(rig) as in the community battleground modulepack (note its authorship is odd on the forum page and one user reported conflicts with welded parts and ownership, so treat as a starting point) [S40]; gate ragdoll cancel with a 30 s cooldown (TSB reference [S37]).
Pitfalls: stopping server time (don't; only pause animation and camera), cumulative ragdoll exploits, large payloads on the unreliable remote.

### Recipe 7: Hitscan gun with client prediction and server validation
When to use: a simple shooter built the first-party way; mirrors the Roblox blaster tutorial and Laser Tag template. [S31][S33]
Steps:
1. Tool or custom Weapon with attributes: Damage, FireDelay (seconds), MagSize, ReloadTime, Range, Spread, Recoil, Falloff start/end.
2. Client on fire: check local cooldown/ammo, build ray origin from the camera and direction with spread, raycast locally against the world to place a tracer and hit effect immediately, then fire a RemoteEvent with {origin, direction, clientTimestamp = workspace:GetServerTimeNow()}.
3. Server: rate gate (now - lastShot >= FireDelay - small tolerance 0.02 s), ammo > 0, shooter alive, origin within 10 to 12 studs of shooter head, direction unit length, range cap; raycast with RaycastParams excluding the shooter; find Humanoid; compute damage with falloff and a headshot multiplier (Rivals AR crit 1.25 is the reference [S7]); apply TakeDamage; award kill; replicate result.
4. Replicate other players' tracers by sending cosmetic data through UnreliableRemoteEvent.
5. Optional: add recipe 8 for lag compensation.
Pitfalls: accepting the client's reported hit instance; no ammo or cooldown checks; spread and recoil computed only on the client but trusted for hit direction (accept the direction, clamp against server camera vector tolerance, and keep detection of aimbots as an open problem [S3]).

### Recipe 8: Rewind lag compensation for hitscan
When to use: duel or team shooters where ping fairness matters; skip for slow-paced games. [S3][S4][S60]
Steps:
1. On the server, every Heartbeat record for each player character the root CFrame (or limb hitbox CFrames) with workspace:GetServerTimeNow() into a ring buffer sized for 1 second (60 entries); [S3] uses about 60 Hz and a 0.5 s limit, [S4] 30 Hz.
2. When a shot arrives, clamp the client timestamp to [now - 0.5, now], subtract an interpolation allowance of about 0.1 s that models the clients' rendering delay [S3], and fetch each candidate target's pose at that time by binary search and lerp between the two bracketing snapshots.
3. Test the ray against the rewound hitboxes (boxes sized to the character parts; head and torso for headshots), and validate that the shot origin is within 12 studs of the shooter's rewound position [S3].
4. Add a server raycast against static geometry for walls, because rewind frameworks test only characters [S3][S4].
5. Log rewind distance, hit rate per player and ping; flag players with abnormal hit rates.
Pitfalls: `Player:GetNetworkPing()` returns the round-trip network latency in seconds (creator-docs YAML for the method), so one-way delay is about half and the value is not milliseconds [S112]; still prefer client timestamps over ping; letting players choose arbitrary timestamps; favour-the-shooter side effects (defenders hit after reaching cover) [S56]; do not run rewind and Server Authority prediction as two competing systems.

### Recipe 9: Projectile weapons and bullet drop
When to use: rockets, arrows, grenades, slow bullets, snipers with travel time.
Steps:
1. Simulate in a module: position += velocity x dt; velocity += Vector3.new(0, -gravity x dropScale, 0) x dt, with gravity 196.2 as Phantom Forces uses for bullet drop [S99]; cast a ray from last to new position each step to catch tunnelling. Use Raycast for bullets and Spherecast for fat projectiles. [S58]
2. Run authoritative simulation on the server for damage; simulate a cosmetic copy on the client immediately (client-visual-only part, no collisions).
3. Or use FastCast2 (parallel, Blockcast/Spherecast, penetration events Hit and Pierced) for bullets, cap at around 100 concurrent serial projectiles [S59].
4. Pool visuals (PartCache-style) and cap concurrent projectiles per player.
Pitfalls: relying on physics replication for fast projectiles (use raycast simulation); not deleting projectiles on round end; forgetting RaycastParams RespectCanCollide/CanQuery for decoration parts [S13].

### Recipe 10: Weapon table and TTK calculator
When to use: every shooter, and for ability damage in battlegrounds.
Steps:
1. Put all weapons in one ModuleScript table: {Name, Damage, FalloffStart, FalloffEnd, MinDamage, HeadshotMult, FireDelay, MagSize, Reload, MoveSpeedMult, Pellets, Spread, Role}.
2. Write a Studio command-bar script that prints for each weapon: shots to kill (ceil(100/damage)), TTK (shots-1) x FireDelay, with headshot, and at falloff end; flag any weapon whose close-range TTK is outside the target band.
3. Reference bands from data: AR 12 dmg 0.10 s gives 0.80 s; Shotgun 0.70 s; Minigun 0.60 s; sniper 1.5 s over two body shots and one shot to the head (critical 150, 3x; section 4).
4. Rules of thumb: weapons with low TTK must pay in speed, ammo or range; range should be controlled by falloff, not spread alone; adjust one number per patch and log it.
5. Version your weapon table in the game's version string and keep patch notes player-visible, as Rivals does with numbered updates (Update 14 changed AR 13 to 12 and 0.11 s to 0.10 s [S7]).
Pitfalls: balancing by feel without math; changing crit multipliers (Rivals AR 1.5 to 1.25 in Update 5) after players have learned the weapon without communicating it [S7].

### Recipe 11: Duel match flow: queue, reserved server, best of five
When to use: 1v1 to 5v5 with a lobby hub, as in Rivals. [S48][S45]
Steps:
1. Lobby place: duel pads and a shooting range for practice [S91]. Players press a pad or Queue button for a mode; the server writes a ticket to a MemoryStoreSortedMap keyed by player or party leader with rating as part of the sort key or value.
2. A coordinator (elected via UpdateAsync on a MemoryStoreHashMap) reads up to 200 tickets, groups the closest ratings (window starts at 100 and widens 25 points per 5 seconds waited, heuristic), writes match assignments, and reserves a server with TeleportService:ReserveServer(matchPlaceId). [S45]
3. Each lobby server, seeing an assignment for one of its players, teleports them with TeleportService:TeleportAsync(matchPlaceId, players, options) where options.ReservedServerAccessCode is the code and TeleportData carries mode, team, map and loadouts.
4. Match server: team spawn, 5-second countdown, round of 90 s, win by elimination, first to 5 round wins (Rivals), map pick/ban phase before round 1 in ranked, loadout lock, weapon-switch cap in ranked [S6][S48].
5. On finish, write the rating change with UpdateAsync, show the end screen with rating delta, and teleport both back to the lobby.
Pitfalls: a party in two servers (parties must be on one server) [S45]; tickets that never expire (set expiration), which leaks memory [S45]; rating written twice if both servers report.

### Recipe 12: Ranked ladder (Elo, placements, shields, decay, season)
When to use: after duels work; builds the retention layer. [S6][S47]
Steps:
1. Store {Elo, PlacementsPlayed, Shield, LastPlayed, Season} per player in a DataStore via UpdateAsync.
2. Expected score E = 1 / (1 + 10^((Ropp - Rself) / 400)); new rating = R + K x (S - E), S = 1 win 0 loss; K = 64 for the first 10 placement games, 32 until 30 games, 24 afterwards (heuristic; chess uses 32/16/10 by experience [S101]).
3. Tiers: 200-point bands from 0, three sub-tiers per tier, a special top tier at 3,600 (Rivals) [S6]; for a small game compress to 100-point bands.
4. Placement: 10 games, maximum starting rank below the top two tiers (Rivals caps at Diamond 1) [S6].
5. Shield: one per day below the second-highest tier; consuming it prevents one loss's point loss but is spent either way [S6].
6. Decay: at the top tiers only, 100 points per day after 7 days idle, floor at the tier entry [S6].
7. Party limit: refuse queue if rating spread > 800 (Rivals' current rule on the wiki) or 600 (file 03); choose one and show it in the UI [S6].
8. Top-tier compression: scale gains by opponent rating so a very high-rated player gains nothing from beating a much lower one (Rivals Update 22 allows +0) [S47].
9. Season: 3 to 4 months, soft reset towards the median, exclusive cosmetic reward per tier (Rivals uses Skin Tickets, a Glory shop and charms) [S63][S47].
10. Gate ranked on account state: games count, level and a verified-account requirement if you can read it (open question).
Pitfalls: smurf farming below the placement cap; queue times when the region lock is on [S47]; paying for rank.

### Recipe 13: Arena map blockout and spawn logic
When to use: any PvP map. [S53][S55]
Steps:
1. Blockout with parts only: three lanes for a duel or team map, three or four chokepoints (one per lane), mirrored (bilateral) layout for fairness, a mid-height route for each lane. Use Roblox scale: character about 5 studs tall, so cover 3 to 4 studs high is half cover, 6 or more is full cover; doorways 6 wide by 8 high; aim for most engagement distances under 120 studs with one 200-stud lane for snipers (Rivals' AR falloff runs 50 to 200 studs, a useful reference [S7]). Sightline lengths converted from the second-hand 40 to 80 m guideline are unverified [S111].
2. Spawns: two team spawn rooms out of sight of each other and of the main lane; spawn protection 2 to 3 s; in FFA, pick the spawn farthest from the nearest enemy and out of line of sight, re-evaluated at respawn.
3. Add a few asymmetric props for readability only (visual landmarks), not new cover.
4. Playtest with 6 to 10 testers and log death locations; move cover where more than a quarter of deaths cluster [S53].
5. Make a Big variant only for 4v4 and 5v5 (Rivals has 21 maps plus 7 Big variants [S48]).
Pitfalls: too many paths (defence impossible [S55]); long sightlines from spawn; unreadable geometry for mobile players.

### Recipe 14: Server-side anti-exploit layer for combat
When to use: every PvP game that is not on Server Authority; still useful on it. [S76][S88]
Steps:
1. Per-player rate limiter on each combat remote (token bucket, for example 10 attack requests per second burst 15), drop and count violations.
2. Speed and teleport check on the server every 0.25 to 0.5 s: distance moved vs WalkSpeed x time x 1.3 tolerance plus dash allowance; on violation snap the character back, add strikes, then kick after repeated strikes.
3. Validate every remote payload type, numeric range, NaN and infinity (reject), vector magnitude within limits.
4. Never accept damage or targets from the client; compute victims on the server (recipe 3). Do not trust the client for cooldowns.
5. Keep secrets and tuning tables server-side (ServerScriptService); do not replicate hitbox sizes or weapon tables unless the client needs them for UI [S76].
6. Log and review: suspicious hit rate (more than 95% headshots over 30 shots), impossible reaction times, shots through walls (after adding a server LOS check).
7. Tie bans to your own system; Roblox's platform anti-cheat covers injection on desktop, not logic abuse [S96].
Pitfalls: false positives on high-ping players (use tolerance, strike counters, and review rather than instant bans); anti-cheat scripts placed where an exploiter can read or delete them.

### Recipe 15: Cosmetic crates and keys with odds disclosure
When to use: any PvP game selling random cosmetics (Rivals-style). [S65][S64]
Steps:
1. Define each crate in a table with outcomes and weights; compute percentages from weights so the UI always shows a total of exactly 100% (round to 4 decimals, fix the last entry).
2. UI: show the odds list or a visible "Details" button before the purchase prompt; bare "(i)" icons are not enough [S65].
3. Gate by PolicyService:GetPolicyInfoForPlayerAsync(player): if ArePaidRandomItemsRestricted, apply one of the allowed treatments (earnable path, fixed sequence, direct purchase, hide, or block with a message); if IsPaidItemTradingAllowed is false, block trading of outcomes [S65].
4. Treat keys, spin tickets and luck boosts as paid random items too [S65].
5. Cosmetic only: skins, wraps, charms, finishers, kill effects; no stat advantage. Offer a free path (daily login track, task wheels, achievements) as Rivals did when it replaced task streaks with daily tasks, prize wheels and login rewards in Update 22 [S47].
6. Keep a duplicate-protection design and tell players how it works.
Pitfalls: indirect currency conversions that hide Robux cost; changing odds without updating the UI; selling weapons that win fights.

### Recipe 16: Adopting Server Authority for a duel or fighting game
When to use: new competitive game on standard Humanoid characters that wants built-in anti-cheat; only after reading S82, S83 and S10.
Steps:
1. In Studio set Workspace.AuthorityMode to Server; confirm the linked settings (NextGenerationReplication, PlayerScriptsUseInputActionSystem, SignalBehavior Deferred, UseFixedSimulation) and that StreamingEnabled is on [S10][S82].
2. Move all input into InputActions and read them by polling GetState inside a function bound with RunService:BindToSimulation; do not use UserInputService events for simulation logic [S82][S83]. Custom actions are created at edit time: a Folder `Inputs` in ReplicatedStorage holding an InputContext (for example `PlayContext`), InputAction children whose `Type` is Bool, Direction1D, Direction2D, Direction3D or ViewportPosition, and InputBinding children per device (docs, input action system page) [S113]. Choose the frequency (Hz60 gives the finest combat timing at higher cost; Hz30 is the default) [S112][S116].
3. Put the core combat simulation (state, cooldown timers, hit detection, damage) in a ModuleScript required by both client and server; use time() for timing, avoid tick(), os.clock() and os.time() [S82].
4. Store anything the simulation reads or writes as attributes on predicted instances, within the first 64 attributes and with names and string values of 50 characters or fewer [S82].
5. Keep animation and VFX in RenderStepped, outside the simulation; query the Animator for tracks instead of caching them; stay within 8 animation tracks per Animator [S10][S83].
6. Keep side effects deterministic; no yields in the bound function; do not edit GUI there [S89].
7. For latency compensation in melee and fighting, enable prediction of other players as staff recommend, and test rubber-banding at 100 and 200 ms; for shooters keep your own rewind for hits [S84][S85].
8. Test on mobile and console before launch because those clients can lag desktop by days in rollout [S10].
Pitfalls: signals that re-fire on rollback; RemoteEvents arriving at a different frame than property changes (design remotes as discrete notifications only) [S82]; performance on busy servers because resimulation cost scales with latency [S84].

### Recipe 17: Arsenal-style progression match (gun game FFA)
When to use: arcade FFA shooter for short sessions with a built-in arc. [S105]
Steps:
1. Create a weapon ladder of 20 to 32 weapons ending with a knife. Rivals' Gun Game and Arsenal's classic mode use this shape; Arsenal uses 32 levels, a Golden Gun at 31 and a Golden Knife at 32, and being knifed or suiciding demotes one level [S105].
2. Server tracks level per player; on kill, promote, give the next weapon, refill ammo; first kill with the last weapon wins; end the match and award currency.
3. Spawn protection 2 s; respawn at the farthest safe spawn; limit demotion so one level is lost at most.
4. Rotate map and mode automatically and avoid immediate repeats (Arsenal's Reloaded fix on 2025-07-11) [S62].
5. Match length target 5 to 8 minutes; add an Elo-free leaderboard of daily wins.
Pitfalls: runaway leader snowball (give a visible leader marker and demote on knife kills); weapon-ladder imbalance (put the best weapons in the middle).

### Recipe 18: One-button reflex duel (Blade Ball pattern)
When to use: a mobile-friendly PvP mini loop or a mode inside a bigger game. [S51][S26]
Steps:
1. Server owns a ball part (anchored, moved by the server each Heartbeat) with a target player, a speed that increases per deflection (start 40 studs/s, multiply by 1.08 each deflection, heuristic; the reference game's curve is steepest between deflections 4 and 6 [S51]).
2. Client "deflect" input sends the client time; the server checks the ball distance to the target at the corresponding server time within a window (start 0.35 s total and shrink to about 0.1 s at high speed, the reference game's window is under 100 ms at the top [S51]); on success choose the next living target and bounce, on failure deal lethal damage or eliminate.
3. Active shield cooldown about 0.5 s (reference game's 500 ms shield) to stop click spam [S51].
4. Clash when two players deflect at once: knockback both, reset the ball to centre, small speed boost [S51].
5. Show a clear lock-on indicator and a glow as the ball approaches.
Pitfalls: client-trusted deflection; ball driven by physics and replication jitter (drive it on the server and render with interpolation); no rubber-band to keep eliminated players engaged (show a spectator camera and a re-queue button).

## Luau reference snippets

All snippets are Luau using current APIs from the engine reference; Server Authority specifics are marked because their exact signatures were not fully verified.

```lua
--!strict
-- ServerScriptService/Combat/Stun.server.lua : timestamp-based stun using attributes (Recipe 1)
local Players = game:GetService("Players")

local Stun = {}

function Stun.apply(character: Model, seconds: number)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then return end
	local now = workspace:GetServerTimeNow()
	local untilTime = math.max(character:GetAttribute("StunUntil") or 0, now + seconds)
	character:SetAttribute("StunUntil", untilTime)
	character:SetAttribute("State", "Stunned")
	if character:GetAttribute("PrevWalkSpeed") == nil then
		character:SetAttribute("PrevWalkSpeed", humanoid.WalkSpeed)
	end
	humanoid.WalkSpeed = 0
	task.delay(seconds + 0.05, function()
		if not character.Parent then return end
		if workspace:GetServerTimeNow() >= (character:GetAttribute("StunUntil") or 0) then
			local prev = character:GetAttribute("PrevWalkSpeed")
			if typeof(prev) == "number" then humanoid.WalkSpeed = prev end
			character:SetAttribute("PrevWalkSpeed", nil)
			character:SetAttribute("State", "Idle")
		end
	end)
end

function Stun.isStunned(character: Model): boolean
	return workspace:GetServerTimeNow() < (character:GetAttribute("StunUntil") or 0)
end

return Stun
```

```lua
--!strict
-- Server melee hit window using a spatial query, deduped per swing (Recipe 3)
local overlap = OverlapParams.new()
overlap.FilterType = Enum.RaycastFilterType.Exclude
overlap.MaxParts = 32

local function sweep(attacker: Model, size: Vector3, offset: CFrame, alreadyHit: {[Model]: boolean}, onHit: (victim: Model, humanoid: Humanoid) -> ())
	local root = attacker:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then return end
	overlap.FilterDescendantsInstances = { attacker }
	local parts = workspace:GetPartBoundsInBox(root.CFrame * offset, size, overlap)
	for _, part in parts do
		local model = part:FindFirstAncestorOfClass("Model")
		if model and not alreadyHit[model] then
			local humanoid = model:FindFirstChildOfClass("Humanoid")
			if humanoid and humanoid.Health > 0 then
				alreadyHit[model] = true
				onHit(model, humanoid)
			end
		end
	end
end

return sweep
```

```lua
--!strict
-- Animation-marker driven hit window (Recipe 2). Markers are added in the Animation Editor event track.
local function bindHitWindow(track: AnimationTrack, openWindow: () -> (), closeWindow: () -> (), fallbackSeconds: number)
	local opened = false
	local c1 = track:GetMarkerReachedSignal("HitStart"):Connect(function()
		opened = true
		openWindow()
	end)
	local c2 = track:GetMarkerReachedSignal("HitEnd"):Connect(function()
		if opened then closeWindow() end
	end)
	track.Stopped:Once(function()
		c1:Disconnect(); c2:Disconnect()
		if opened then closeWindow() end
	end)
	task.delay(fallbackSeconds, function() if opened then closeWindow() end end)
end
return bindHitWindow
```

```lua
--!strict
-- Server shot validation (Recipe 7). Client sends origin, direction, timestamp.
local MAX_ORIGIN_DISTANCE = 12 -- studs, same order as RollbackHitbox's MAX_ORIGIN_DISTANCE
local lastShot: {[Player]: number} = {}

local function validateShot(player: Player, weapon: {Damage: number, FireDelay: number, Range: number}, origin: Vector3, direction: Vector3)
	local character = player.Character
	if not character then return nil end
	local head = character:FindFirstChild("Head") :: BasePart?
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not (head and humanoid) or humanoid.Health <= 0 then return nil end
	if typeof(origin) ~= "Vector3" or typeof(direction) ~= "Vector3" then return nil end
	if direction.Magnitude < 0.99 or direction.Magnitude > 1.01 then return nil end
	if (origin - head.Position).Magnitude > MAX_ORIGIN_DISTANCE then return nil end

	local now = os.clock()
	if now - (lastShot[player] or 0) < weapon.FireDelay - 0.02 then return nil end
	lastShot[player] = now

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character :: Instance }
	local result = workspace:Raycast(origin, direction.Unit * weapon.Range, params)
	if not result then return nil end

	local victim = result.Instance:FindFirstAncestorOfClass("Model")
	local victimHumanoid = victim and victim:FindFirstChildOfClass("Humanoid")
	if victimHumanoid and victimHumanoid.Health > 0 then
		victimHumanoid:TakeDamage(weapon.Damage)
	end
	return result
end
return validateShot
```

```lua
--!strict
-- Pose history ring buffer + rewind lookup (Recipe 8)
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

local HISTORY_SECONDS = 1.0
local MAX_REWIND = 0.5
local history: {[Player]: {{t: number, cf: CFrame}}} = {}

RunService.Heartbeat:Connect(function()
	local now = workspace:GetServerTimeNow()
	for _, player in Players:GetPlayers() do
		local character = player.Character
		local root = if character then character:FindFirstChild("HumanoidRootPart") :: BasePart? else nil
		if root then
			local list = history[player] or {}
			history[player] = list
			table.insert(list, { t = now, cf = root.CFrame })
			while #list > 0 and now - list[1].t > HISTORY_SECONDS do
				table.remove(list, 1)
			end
		end
	end
end)

local function poseAt(player: Player, t: number): CFrame?
	local list = history[player]
	if not list or #list < 2 then return nil end
	local now = workspace:GetServerTimeNow()
	t = math.clamp(t, now - MAX_REWIND, now)
	for i = #list, 2, -1 do
		local a, b = list[i - 1], list[i]
		if a.t <= t and t <= b.t then
			local alpha = (t - a.t) / math.max(b.t - a.t, 1e-4)
			return a.cf:Lerp(b.cf, alpha)
		end
	end
	return list[#list].cf
end
return { poseAt = poseAt }
```

```lua
--!strict
-- TTK table helper for the Studio command bar (Recipe 10)
local function ttk(health: number, damage: number, fireDelay: number): (number, number)
	local shots = math.ceil(health / damage)
	return shots, (shots - 1) * fireDelay
end
for name, w in { AR = {12, 0.10}, Sniper = {50, 1.50}, Minigun = {8, 0.05} } do
	local shots, t = ttk(100, w[1], w[2])
	print(name, shots, string.format("%.2fs", t))
end
```

```lua
--!strict
-- Elo update (Recipe 12). Standard formula; K values are a design choice.
local function expected(rSelf: number, rOpp: number): number
	return 1 / (1 + 10 ^ ((rOpp - rSelf) / 400))
end
local function update(rSelf: number, rOpp: number, score: number, k: number): number
	return math.floor(rSelf + k * (score - expected(rSelf, rOpp)) + 0.5)
end
return { expected = expected, update = update }
```

```lua
--!strict
-- Queue ticket + reserved-server teleport sketch (Recipe 11). Verify limits in the MemoryStore docs.
local MemoryStoreService = game:GetService("MemoryStoreService")
local TeleportService = game:GetService("TeleportService")
local queue = MemoryStoreService:GetSortedMap("Queue_Ranked_NA")

local function enqueue(userId: number, elo: number)
	queue:SetAsync(tostring(userId), { elo = elo }, 120, elo) -- 120 s expiry, sorted by elo
end

local function readCandidates()
	return queue:GetRangeAsync(Enum.SortDirection.Ascending, 200)
end

local function sendToMatch(players: {Player}, matchPlaceId: number, mode: string)
	local accessCode = TeleportService:ReserveServer(matchPlaceId)
	local options = Instance.new("TeleportOptions")
	options.ReservedServerAccessCode = accessCode
	options:SetTeleportData({ mode = mode })
	TeleportService:TeleportAsync(matchPlaceId, players, options)
end
return { enqueue = enqueue, readCandidates = readCandidates, sendToMatch = sendToMatch }
```

```lua
--!strict
-- Paid random item gate (Recipe 15)
local PolicyService = game:GetService("PolicyService")
local function canSellRandomCrate(player: Player): boolean
	local ok, info = pcall(function() return PolicyService:GetPolicyInfoForPlayerAsync(player) end)
	if not ok then return false end -- fail closed
	return not info.ArePaidRandomItemsRestricted
end
return canSellRandomCrate
```

```lua
--!strict
-- Server Authority sketch (Recipe 16). Verified against the RunService reference: BindToSimulation(function,
-- frequency: Enum.StepFrequency = Hz30, priority: number = 2000) returns an RBXScriptConnection, the function
-- receives deltaTime, and it is only available when Workspace.UseFixedSimulation is enabled.
local RunService = game:GetService("RunService")
local Sim = {}
function Sim.start(attackAction: InputAction): RBXScriptConnection
	local connection = RunService:BindToSimulation(function(dt: number)
		-- poll, do not listen: Pressed/Released can re-fire on rollback
		local pressed = attackAction:GetState()
		-- read/write state through attributes; use time(), never tick()/os.clock(); no yielding here
	end, Enum.StepFrequency.Hz60)
	return connection
end
return Sim
```

## Open questions / unverified
- No developer interview, GDC or RDC talk was found for Rivals, The Strongest Battlegrounds or Jujutsu Shenanigans on combat internals; everything on their numbers is third-party wiki or guide content (now mostly read from the Fandom wikis through the MediaWiki API, with revision dates), drifts with patches, and sometimes contradicts itself (the RIVALS Ranked page gives Diamond I as 2,400 in its table and 2,500 in its placement note; the Chainsaw page says 60 damage and 3 swings).
- I did not find hit-stun frame counts, M1 endlag or perfect-block frame data for TSB or Rivals in a reliable source; the TSB wiki gives an 11-frame M1 startup for one character, 0.5 s of get-up no-stun and a 0.2 s block lockout after an M1, but no perfect-block window in frames or seconds (the earlier "3 frames" is one comparison article [S5]). Values in recipes are heuristics.
- Exact base health and respawn time for Rivals duels are not stated on the wiki pages I read (only that Team Deathmatch, Free For All and Gun Game max health was changed from 150 to 100 and that the health bar shows exact health); 100 HP stays an assumption for duels.
- Whether Server Authority supports third-person camera strafing animations beyond the documented unsupported list is unverified, and the 8-animation-track limit, the no-strafing-animation limit and the no-yield rule rest on staff posts, not on docs pages I could read. The staff deep dive says shooter rewind is "soon"; check later release notes before building your own. [S82][S84]
- Whether the bound-function frequency should be Hz60 for combat (finest timing, highest resimulation cost) or Hz30 (default) has no published guidance in what I read.
- Hyperion's current effect on mobile and console exploiting was not measured and no source I could read reports it.
- 2018 and 2022 devforum posts used here (stun thread 2022, hitbox thread 2022, aim assist 2021) are older than 2024 and may be stale; the principles still match 2025-2026 posts.
- The kitsblox, dungeonpath, games.gg and rowatcher pages are commercial guide sites with undisclosed method; keep them as heuristics.

## Sources
[S1] Breaking down a combat system into its components, devforum (coolduderocksforme15 / RedEgs; reply by mrshadyman274), 2025-10-04. https://devforum.roblox.com/t/breaking-down-a-combat-system-into-its-components/3976932
[S2] Which route to go for melee hitboxes?, devforum (sanctionry, CoolMcroy, Ziffix, BookDestroyer), 2025-03-16/17. https://devforum.roblox.com/t/which-route-to-go-for-melee-hitboxes/3554033
[S3] RollbackHitbox, server-authoritative lag compensation, devforum (snowoar), 2026-04-02. https://devforum.roblox.com/t/rollbackhitbox-server-authoritative-lag-compensation-for-roblox-shooters-open-source/4553295
[S4] Rewind v1.2.0, server-authoritative hit validation, devforum (text21), 2025-12-18 to 2025-12-20. https://devforum.roblox.com/t/rewind-server-authoritative-lag-compensated-hit-validation/4160622
[S5] Best Roblox fighting and combat games compared 2026, DungeonPath (third-party), 2026-07-20, updated 2026-09-28. https://dungeonpath.com/posts/pillar/roblox-fighting-games-compared/
[S6] Ranked, Roblox Rivals wiki on Miraheze (third-party), fetched 2026-10-04. https://robloxrivals.miraheze.org/wiki/Ranked
[S7] Assault Rifle, Roblox Rivals wiki on Miraheze (third-party), fetched 2026-10-04. https://robloxrivals.miraheze.org/wiki/Assault_Rifle
[S8] RIVALS Weapons Database, BloxGuides (third-party), synced 2026-10-03. https://bloxguidesgg.com/games/rivals/wiki/weapons
[S9] 2026 Roblox Innovation Awards, Roblox newsroom, 2026-09. https://about.roblox.com/newsroom/2026/09/2026-roblox-innovation-awards
[S10] [Full Release] Ship Fair And Competitive Games with Server Authority, Roblox staff welblander, devforum, 2026-07-09. https://devforum.roblox.com/t/full-release-ship-fair-and-competitive-games-with-server-authority/4727993
[S11] [Early Access] Server Authority, Roblox staff, devforum, 2025-10-07. https://devforum.roblox.com/t/early-access-server-authority/3983188
[S12] Roblox is creating responsive, cheat-resistant games with server authority, GamesBeat, 2026-07-09. https://gamesbeat.com/roblox-is-creating-responsive-cheat-resistant-games-with-server-authority/
[S13] Raycasting, Roblox Creator Docs. https://create.roblox.com/docs/workspace/raycasting
[S14] Upcoming Improvements to Physics Replication, Roblox staff, devforum, 2026-06-09 to 2026-07-14. https://devforum.roblox.com/t/upcoming-improvements-to-physics-replication/4675512
[S15] RDC 2025, Roblox newsroom, 2025-09-05. https://about.roblox.com/newsroom/2025/09/roblox-rdc-2025
[S16] Lag Compensated Gun System with Server Authority, devforum (daily3014TheGod), 2025-10-24. https://devforum.roblox.com/t/lag-compensated-gun-system-with-server-authority/4023578
[S17] Roblox Frontlines creator reveals how he made viral Call of Duty-inspired game, Dexerto, 2023-10-17 (older than 2024). https://www.dexerto.com/roblox/roblox-frontlines-creator-reveals-how-he-made-viral-call-of-duty-inspired-game-2338310/
[S18] Inside Roblox Studio: creators discuss working in unique art styles (Maximillian of Frontlines), Roblox newsroom, 2026-07-01. https://about.roblox.com/newsroom/2026/07/roblox-studio-fidelity-creator-interviews-twin-atlas-fluorlite-maximillian-ecos
[S19] Realistic Roblox FPS made by two people hits 7 million plays, PC Gamer (date not visible; page partly paywalled). https://www.pcgamer.com/games/fps/realistic-roblox-fps-made-by-two-people-hits-7-million-plays-reminding-us-that-roblox-games-dont-have-to-be-terrible/
[S20] TTK is the Ready or Not-style tactical FPS blowing up on Roblox, allthings.how, 2026-04. https://allthings.how/ttk-is-the-ready-or-not-style-tactical-fps-blowing-up-on-roblox/
[S21] Phantom Forces, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/292439477
[S22] Arsenal, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/286090429
[S23] RIVALS, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/17625359962
[S24] The Strongest Battlegrounds, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/10449761463
[S25] Slap Battles, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/6403373529
[S26] Blade Ball, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/13772394625
[S27] Combat Warriors, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/4282985734
[S28] Counter Blox, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/301549746
[S29] Criminality, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/4588604953
[S30] Deepwoken, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/4111023553
[S31] Implement blaster behavior, Roblox Creator Docs tutorial. https://create.roblox.com/docs/tutorials/curriculums/gameplay-scripting/implement-blasters
[S32] Templates (Combat, Laser Tag, FPS System, Racing), Roblox Creator Docs. https://create.roblox.com/docs/resources/templates
[S33] New Laser Tag Studio Template!, Roblox staff MintyUltra, devforum, 2024-06-21. https://devforum.roblox.com/t/new-laser-tag-studio-template/3033810
[S34] How to make a good stun for combats, devforum, 2022-02 (stale). https://devforum.roblox.com/t/how-to-make-a-good-stun-for-combats/1667162
[S35] Combat State Machine for Block / Attack / Stun System, devforum code review (exvirus2), 2026-05-30. https://devforum.roblox.com/t/combat-state-machine-for-block-attack-stun-system/4660683
[S36] Ways to create fighting game framework, devforum (66sickk, skipper987, Ripxff), 2023-06. https://devforum.roblox.com/t/ways-to-create-fighting-game-framework/2417458
[S37] The Strongest Battlegrounds combat guide, games.gg (third-party). https://games.gg/roblox/guides/the-strongest-battlegrounds-combat-guide/
[S38] The Strongest Battlegrounds movesets explained, the-strongest-battlegrounds.wiki (third-party). https://www.the-strongest-battlegrounds.wiki/moves/the-strongest-battlegrounds-movesets-explained/
[S39] How to make a battlegrounds game in Roblox (2026 guide), obby.fun (third-party). https://www.obby.fun/blog/how-to-make-battlegrounds-roblox
[S40] Battleground Modulepack (Ragdoll, Stun, Direction, Cooldown), devforum, 2025-02-19 (low trust, author field unusual). https://devforum.roblox.com/t/battleground-modulepack-ragdoll-stun-direction-cooldown/3488881
[S41] Jujutsu Shenanigans roster guide, games.gg (third-party), 2026-03. https://games.gg/roblox/guides/jujutsu-shenanigans-characters-roster-guide/
[S42] Custom Matchmaking is now available to all experiences, Roblox staff ElPsyCongroo_Y, devforum, 2025-11-06. https://devforum.roblox.com/t/custom-matchmaking-is-now-available-to-all-experiences-on-roblox/4051419
[S43] MatchmakingService, Roblox engine reference. https://create.roblox.com/docs/reference/engine/classes/MatchmakingService
[S44] [Beta] Introducing Custom Matchmaking with Custom Signals, Roblox staff, devforum, 2025-04-08. https://devforum.roblox.com/t/beta-introducing-custom-matchmaking-with-custom-signals/3598471
[S45] Conceptual Implementation: Building a Custom Matchmaking Service with MemoryStore, devforum tutorial, 2025. https://devforum.roblox.com/t/conceptual-implementation-building-a-custom-matchmaking-service-with-memorystore/3652856
[S46] Customize your matchmaking configuration, Roblox Creator Docs. https://create.roblox.com/docs/matchmaking/customize-matchmaking
[S47] RIVALS Update 22 (September 2026), TimeSaver (third-party). https://timesaver.gg/blog/roblox-rivals-update-22-wildcat
[S48] RIVALS guide and database, BloxGuides (third-party), fetched 2026-10-04. https://bloxguidesgg.com/games/rivals
[S49] Should Phone/Tablet/XBOX users get Aim-Assist, devforum, about 2021 (stale). https://devforum.roblox.com/t/should-phonetabletxbox-users-get-aim-asssit/989883
[S50] BedWars, Rolimons (third-party), fetched 2026-10-04. https://www.rolimons.com/game/6872265039
[S51] Blade Ball terms and mechanics explained, DungeonPath (third-party), 2026. https://dungeonpath.com/posts/blade-ball/mechanics-glossary/
[S52] Sword Fights on the Heights IV controls guide, community wiki (third-party), 2026-09. https://swordfightsontheheightsiv.wiki/guides/controls/
[S53] Map balance, The Level Design Book. https://book.leveldesignbook.com/process/combat/balance
[S54] Understanding Frame Data in Fighting Games, fightinggameguide.com (non-Roblox reference). https://www.fightinggameguide.com/framedata.html
[S55] Analyzing level layouts to improve level design in competitive FPS, Curtis Gaunt, Game Developer, 2017-04-05 (stale but principle-level). https://www.gamedeveloper.com/design/analyzing-level-layouts-to-improve-level-design-in-competitive-fps
[S56] Lag compensation, Gabriel Gambetta, Fast-Paced Multiplayer series (non-Roblox reference). https://www.gabrielgambetta.com/lag-compensation.html
[S57] What every programmer needs to know about game networking, Glenn Fiedler, Gaffer On Games (non-Roblox reference, old). https://gafferongames.com/post/what_every_programmer_needs_to_know_about_game_networking/
[S58] WorldRoot, Roblox engine reference. https://create.roblox.com/docs/reference/engine/classes/WorldRoot
[S59] FastCast2, devforum (Mawin_CK), 2025-11-24. https://devforum.roblox.com/t/fastcast2-an-improved-version-of-fastcast-with-parallel-scripting-more-extensions-and-statically-typed-a-powerful-modern-projectile-library/4093890
[S60] Server/Client Raycast lag compensation, devforum (RobloxerAndany, junekept, ABC2gameYT), 2025-01-22. https://devforum.roblox.com/t/serverclient-raycast-lag-compensation/3404150
[S61] ShapecastHitbox v0.2.5, devforum (TeamSwordphin), 2025-04-24. https://devforum.roblox.com/t/shapecasthitbox-for-all-your-melee-needs-v025/3624241
[S62] Arsenal Reloaded Updates, Arsenal wiki (third-party), 2025-07-06 to 2025-07-13; the 40,000 bans per month figure is a search summary of the Fandom development page. https://arsenal.miraheze.org/wiki/Arsenal_Reloaded_Updates
[S63] Shop, Roblox Rivals wiki on Miraheze (third-party). https://robloxrivals.miraheze.org/wiki/Shop
[S64] All 18 RIVALS loot boxes, cases and chests, Bloxodes (third-party); odds-detail change from a search summary. https://bloxodes.com/wiki/rivals/loot-boxes
[S65] Paid random items policy guidelines, Roblox Creator Docs. https://create.roblox.com/docs/production/monetization/paid-random-items
[S66] Korea's loot box rules push Roblox to disclose item odds worldwide, Tech Times, 2026-06-26 (secondary). https://www.techtimes.com/articles/319148/20260626/koreas-loot-box-rules-push-roblox-disclose-item-odds-worldwide.htm
[S67] Weapons kit, Roblox Creator Docs. https://create.roblox.com/docs/resources/weapons-kit
[S68] Content maturity and compliance, Roblox Creator Docs. https://create.roblox.com/docs/production/promotion/content-maturity
[S69] Roblox Community Standards, Roblox. https://about.roblox.com/community-standards
[S70] Mobile vs desktop on Roblox: who is playing what in 2026, RoWatcher News (third-party), Q4 2025 data. https://rowatcher.com/news/mobile-vs-desktop-on-roblox-who-s-playing-what-in-2026
[S71] RIVALS movement and mechanics guide, DungeonPath (third-party), 2026-05-10. https://dungeonpath.com/posts/rivals/movement-and-mechanics-guide/
[S72] Roblox RIVALS Season 3 launches with new weapons, maps, cosmetics, GosuGamers, 2026-04. https://www.gosugamers.net/entertainment/news/78336-roblox-rivals-season-3-launches-with-new-weapons-maps-cosmetics-and-more
[S73] How to make a combat system in Roblox (2026 guide), KitsBlox (commercial guide site), 2026-01-20. https://kitsblox.com/blog/how-to-make-combat-system-roblox
[S74] What is the best means of hitbox detection?, devforum (codebykoi and others), 2022-06 (stale). https://devforum.roblox.com/t/what-is-the-best-means-of-hitbox-detection/1850713
[S75] Seeking advice on efficient hit detection for a melee combat game, devforum (GeldiBaskan, Fizzitix), 2023-07-17. https://devforum.roblox.com/t/seeking-advice-on-efficient-hit-detection-for-a-melee-combat-game/2473499
[S76] Security tactics, Roblox Creator Docs. https://create.roblox.com/docs/scripting/security/security-tactics
[S77] Remote events and UnreliableRemoteEvent, Roblox Creator Docs. https://create.roblox.com/docs/scripting/events/remote
[S78] Animation events and AnimationTrack reference, Roblox Creator Docs. https://create.roblox.com/docs/animation/events and https://create.roblox.com/docs/reference/engine/classes/AnimationTrack
[S79] Workspace, Roblox engine reference. https://create.roblox.com/docs/reference/engine/classes/Workspace
[S80] Network ownership, Roblox Creator Docs (read through a search summary). https://create.roblox.com/docs/physics/network-ownership
[S81] ForceField and Humanoid, Roblox engine reference (read through a search summary). https://create.roblox.com/docs/reference/engine/classes/ForceField
[S82] Server authority model, Roblox Creator Docs. https://create.roblox.com/docs/projects/server-authority
[S83] Server authority techniques, Roblox Creator Docs. https://create.roblox.com/docs/projects/server-authority/techniques
[S84] Server Authority: tech deep dive and engineering insights, Roblox staff, devforum, 2026. https://devforum.roblox.com/t/server-authority-tech-deep-dive-engineering-insights/4624565
[S85] Server Authoritative API testing: Fighting Game Framework, devforum (CasuallyCritical), 2026-02-08. https://devforum.roblox.com/t/server-authoritative-api-testing-fighting-game-framework/4344503
[S86] Creating responsive, cheat-resistant games with Server Authority, Roblox newsroom, 2026-07-09. https://about.roblox.com/newsroom/2026/07/creating-responsive-cheat-resistant-games-roblox-server-authority
[S87] Why do combat game developers lean more towards R6 rather than R15?, devforum, 2024-08 to 2025-02. https://devforum.roblox.com/t/why-do-combat-game-developers-lean-more-towards-r6-rather-than-r15/3136549
[S88] Securing client-side hit detection in sword combat, devforum (lavasance, stef0206), 2024-05-08/09. https://devforum.roblox.com/t/securing-client-side-hit-detection-in-sword-combat/2961187
[S89] Server Authority: what developers need to know, Last Level Studios blog, 2025-2026 (Studio-beta era). https://lastlevel.co.uk/blog/server-authority-what-developers-need-to-know
[S90] Roblox game records, observed player peaks (Sep 2026), RoVitals (third-party; window since 2026-08-11). https://rovitals.com/records
[S91] Roblox Rivals developer and release information, Fandom wiki pages (search summary only, HTTP 402): origin story, lobby with shooting range and duel pads, touch aiming and aim assist debates. https://robloxrivals.fandom.com/wiki/Nosniy_Games
[S92] Source multiplayer networking, Valve Developer Community (search summary only, HTTP 403): 100 ms interpolation, rewind. https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
[S94] TTK Lab, the math behind time to kill (search summary only; formula). https://ttk-lab.com/en
[S95] How to parry in Combat Warriors, Touch Tap Play / ProGameGuides (third-party, search summary). https://www.touchtapplay.com/how-to-parry-in-roblox-combat-warriors/
[S96] Hyperion, Roblox Fandom wiki and press coverage (search summary; 64-bit client release 2023-05-03). https://roblox.fandom.com/wiki/Hyperion
[S99] Phantom Forces, StyLiS Studios and Mechanics pages, Fandom wiki (search summary, third-party). https://roblox-phantom-forces.fandom.com/wiki/StyLiS_Studios
[S101] Elo K-factor and Glicko-2 background, general sources (World Mind Games, pub.dev matchmaker docs; search summary, non-Roblox). https://www.worldmindgames.net/elo-rating-systems-explained/
[S103] Slap Battles Killstreak glove, Fandom wiki (search summary, third-party). https://roblox-slap-battles.fandom.com/wiki/Killstreak
[S104] Roblox Innovation Awards 2025 winners (Best Shooter: RIVALS; Best Action: Blox Fruits), Variety and Deltia's Gaming (search summary). https://variety.com/2025/awards/news/grow-a-garden-roblox-innovation-awards-2025-winners-1236510387/
[S105] Arsenal, ROLVe and Arsenal wiki pages (search summary; Gun Game derivation, 32 kills, visit milestones). https://rolve.fandom.com/wiki/Arsenal
[S107] BedWars by Easy.gg, Roblox Fandom wiki and tracker summaries (search summary; released 2021-05-28, 82% approval). https://roblox.fandom.com/wiki/Easy.gg/BedWars
[S108] Deepwoken versus Type Soul versus Blox Fruits comparisons, Earnaldo and TV Tropes (search summary, third-party opinion). https://earnaldo.com/blog/deepwoken-vs-type-soul
[S110] Sword Fights on the Heights IV swords, community wikis (search summary; Linked Sword 30 slash, 20 lunge). https://wiki.sfothr.com/wiki/Swords
[S111] Multiplayer level design techniques, Mind Studios (search summary; sightline guidance). https://games.themindstudios.com/post/multiplayer-level-design-techniques/
[S112] Player:GetNetworkPing, RunService:BindToSimulation, BindToAnimation, IsResimulating and SetPredictionMode, Roblox creator-docs reference (Player.yaml, RunService.yaml), https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/RunService.yaml, read 2026-10-04 (F)
[S113] Server authority model, Server authority techniques and Input Action System, Roblox creator docs, https://create.roblox.com/docs/projects/server-authority and https://create.roblox.com/docs/input/input-action-system, read 2026-10-04 (F)
[S114] Player:IsVerified, Enum.VerifiedLevel and the Account verification guide, Roblox creator docs, https://create.roblox.com/docs/production/publishing/account-verification, read 2026-10-04 (F)
[S115] Matchmaking overview and scoring, Roblox creator docs, https://create.roblox.com/docs/matchmaking, read 2026-10-04 (F)
[S116] [Full Release] BindToSimulation & Rolling out UseFixedSimulation, Roblox Physics Team, devforum announcement, https://devforum.roblox.com/t/full-release-bindtosimulation-rolling-out-usefixedsimulation/4605516, read 2026-10-04 (F, staff post)
[S117] Ranked, Sniper, Shotgun, Assault Rifle, Chainsaw, Battle Axe, Fun Facts and Updates (release 2024-06-28, health patch notes), RIVALS Wiki (Fandom), MediaWiki API, revisions 2026-08 to 2026-10, https://rivalsroblox.fandom.com/wiki/Ranked (T, community wiki)
[S118] Basic Combat, The Strongest Hero and Techniques, The Strongest Battlegrounds Rblx Wiki (Fandom), MediaWiki API, revisions 2026-09, https://the-strongest-battlegrounds-rblx.fandom.com/wiki/Basic_Combat (T, community wiki)
[S119] Characters, Jujutsu Shenanigans Wiki (Fandom), MediaWiki API, revision 2026-10-04, https://jujutsu-shenanigans.fandom.com/wiki/Characters (T, community wiki)
[S120] RIVALS, Rolimons, re-read in the gap pass 2026-10-04, https://www.rolimons.com/game/17625359962 (T)
