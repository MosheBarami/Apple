# Social, roleplay, hangout and party games (genre depth)
_Gap pass 2026-10-04: 10 resolved, 7 still open._
_Researched 2026-10-04 by deep-research agent (Claude). Sources: 152 (about 40 first-party Roblox docs, announcements and shareholder material; the rest developer posts, press and third-party trackers; trust labels below)._

How to read the labels. "[Sx]" cites the source list at the bottom. "Third-party" means a wiki, tracker, analytics blog or guide site; its numbers are snapshots that drift with every update. "Rolimons snapshot" means a page fetched on 2026-10-04 whose "recent peak" windows (24 h, 7 d, 30 d) are relative to the fetch time, not calendar months. "Derived" means I computed it from cited numbers (arithmetic shown) and it is not a published figure. "Heuristic" means a starting value for design with no measured source. "Search summary" means the page itself could not be fetched (Fandom wikis return HTTP 402, several guide sites 403/405) and the claim comes from a search-result summary, so treat it as weaker. "Unverified" means I could not confirm it. This file goes deeper than `03-genre-design.md` [S118] on roleplay, hangout, party, minigame and social "steal/event" games and does not repeat its tables; where a number was already in 03 it is cited to 03.

## Key facts

### 1. The 2026 rules that now shape this whole genre (read first)
- Since 2026-05-19, any experience classed as a Social Hangout, as Free-form User Creation, or as Sensitive Issues is limited to age-verified players aged 16 and over; the previous floor was 13. Roblox's DevForum announcement thread was updated on 2026-05-12 and its weekly recap (2026-05-11 to 05-15) repeats the 2026-05-19 date and says the change aligns with Roblox Kids and Select account protections [S3][S4]. A parenting-site write-up (third-party) says the same and says the check is ID or card based, not a self-declared birthday [S114].
- Definitions (Creator Hub docs): a social hangout is an experience whose primary theme or activity is talking or interacting with other players by voice or text, listed as including hangouts, vibe games, socialising spaces and "sad rooms"; it explicitly excludes roleplay, which qualifies only when adopting a role and using in-game items to play it are central to the experience [S1]. Free-form user creation means freehand drawing, painting, writing or spray painting that others can see, or pixel canvases; assembling 3D assets is excluded [S1]. A staff reply on the DevForum says adding your own detection or moderation does not remove the 16+ classification; the recommended route is constrained tools (stamps, shapes, props, modular assets) or an all-ages version plus a 16+ version with full drawing [S5].
- Private spaces: enclosed areas designed for personal, secluded activities (sleeping, changing, bathing) and for one or very few people (bathroom stall, bedroom, small tent). Docs say a social hangout without private spaces is 16+, and one with private spaces is limited to age-verified 18+ [S1]. The 2025 announcement thread says "under 17" instead [S3]; the Roblox newsroom post of August 2025 also says 17+ and adds that beds or bathrooms in dollhouse or simulation games are not automatically a problem; the trigger is design and purpose that invites violative behaviour [S8]. These two numbers conflict (17 vs 18). Resolution: the docs page wins at 18+ for age-verified players. It is the more recently maintained text (its file in the creator-docs repository was updated through 2026-09-26, while the announcement thread's FAQ still reads 17+) [S141][S3]. Design for zero private spaces and the question disappears.
- Roblox's own answer to private spaces is single-occupancy logic: only one user in an area at a time [S3]. A community member (TheM0rt0nator, 2025-09-24) open-sourced a claim system that tags zone parts with CollectionService tag `Privacy_Zone` and releases the space when the occupant leaves; he warns it can be exploited and recommends periodic server intruder checks; he also notes Roblox endorsed the approach [S9].
- Implied sexual content is now explicitly prohibited, including in settings, avatar emotes and assets, not just in direct depictions (August 2025) [S8][S3]. Roblox is rolling out Violative Scenes Detection that can automatically shut down servers that contain user-created violating content [S3][S8].
- Experiences without a completed Content Maturity and Compliance Questionnaire become unavailable to everyone but the developer and collaborators ("in the coming months", no date given in the thread) [S3]. The questionnaire has four labels: Minimal and Mild (ages 5-15), Moderate (9+), Restricted (age-verified 18+); romantic content and bars or clubs push toward Restricted [S1].
- Age checks to chat: Roblox required a facial age estimate or ID for any chat access globally from January 2026 (announcement 2026-01-07); after the check users sit in age bands and mostly chat with their own band and adjacent bands, with Trusted Connections widening that; all text must go through TextChatService; the thread says in-experience indicators of who you can talk to were being investigated [S7]. `TextChatService:CanUsersChatAsync()` exists to ask whether two users may talk [S40]. News coverage lists the bands as Under 9, 9-12, 13-15, 16-17, 18-20, 21+ (third-party) [S120].
- Roblox Kids (ages 5-8) and Roblox Select (9-15) accounts went global on 2026-06-16; Kids see Minimal/Mild experiences that passed review, Select sees up to Moderate; the Kids/Select catalogue excludes social hangouts, free-form drawing and sensitive-issue experiences [S6]. To publish for under-16 audiences a creator needs ID or facial age verification, 2FA, and either a 2-month Plus/Premium subscription or a one-time refundable fee (the docs do not state the amount; the May 2026 recap says 1,000 Robux); the game must reach 250 unique plays from highly engaged players in 60 days; until then it is shown only to age-checked 16+ players; 50,000 Robux buys expedited review [S2][S4]. Two DevForum posters complain that new games start at 16+ and quote a "500 engaged users" threshold, which conflicts with the 250 in the docs. The docs win: re-read 2026-10-04 they say 250 unique plays by highly engaged age-checked users within 60 days, where "highly engaged" means an account that made a minimum purchase anywhere on Roblox in the last 60 days and has played your game in that window (the 500 figure is a single-source forum claim of 2026-05-31) [S2][S50]; another developer reported a grass-mowing game dropped from about 1,500 to 400 concurrent when labelled 16+ and got it restored via a "Technical Support" ticket (anecdote, 2026) [S51]. By Q2 2026 Kids and Select reached about 30,000 games, up 50% since launch (Roblox shareholder letter via a transcript site) [S11].
- Publishing gate: since 2025-12-17, publishing or updating a public experience needs ID verification, a real-money purchase since 2025-01-01, 100+ playtime hours in a set window, or a completed DevEx in the prior 12 months; Plus and 2FA are not required [S10].
- Platform scale and mood, Q2 2026 (reported 2026-07-30): 123M DAU (up 10% year over year), 29B hours, 57% of DAU age-checked (over 70% in the US and Australia), Kids/Select impact "in line with expectations"; top 10 games about 20% of hours (30% three years earlier); players over 18 monetise over 50% better than under-18s; per-hour monetisation fell, which Roblox attributes partly to the shift from 2025 viral games to evergreen titles and to disabled cross-experience game passes [S11]. DevForum developers reported sharp traffic drops in July 2026 with no staff explanation (anecdotes; speculation about a lost regional market, unverified) [S52].
- Chat product: Global Chat (May 2026) averaged 30M messages a day by June, Quick Words (July) over 5M a day, an In-Experience Friends Chat is planned for Q3 2026 (shareholder letter) [S11]; the Creator Roadmap 2026 Fall update lists creator customisation of Quick Words for late 2026 and says global chat and trusted-friend adds already shipped [S16]. A September 2026 recap (third-party) adds language-preference matching on server lists and new default sprint and crouch abilities for characters [S115]. The sprint and crouch item is official: a Studio Beta post by a Roblox Character Physics Team member (2026-09-10) adds them to the opt-in Character Controller Library (turned on under Avatar Settings, Abilities): Sprint is a toggle at 1.5x speed (Shift, L1, touch Button 2) and Crouch a toggle with hip height 0.55x (R6) or 0.67x (R15) and 0.5x speed (Ctrl, B button, touch Button 3) [S144].
- Cross-experience game pass and developer-product sales were disabled on 2026-05-29; a Transfers API (2026-05-04) lets senders with Roblox Plus move up to 500 Robux a day and 1,000 a month, the recipient gets 90% and the creator 10% [S12]. This hit tip-jar hangouts such as PLS DONATE (Rolimons snapshot: all-time peak 196,819, average playtime 6.47 minutes) [S12][S81].
- Creator tools for social games (private servers are a monthly Robux price you set or free, cannot be combined with paid access, and under-13s may be unable to join [S33]): invite prompts (`SocialService:PromptGameInvite`, `ExperienceInviteOptions`) [S19][S20]; Experience Events (max 10 ongoing or upcoming, Trending Events needs 1,000+ RSVPs, run 7-30 days) [S32]; Captures, Upload and Recommendations APIs (a fashion game can let players publish runway clips to an in-game gallery; using them changes your questionnaire answers) [S18]; custom emotes are live and in-experience makeup creation is on the roadmap for late 2026 [S15][S16]. Roblox's 2025 Replay says 274 million avatar updates a day and that Brookhaven was the most-searched experience of 2025 [S13]. Roblox Moments (beta, September 2025) is the clip feed those APIs feed [S113]; RDC 2025 also listed text-to-speech NPCs and age estimation for communication [S116]; Roblox's infrastructure post says peak platform concurrency went from 13.9M (April 2025) to 30.6M (June 2025) across 24 edge data centres [S14].

### 2. Scale snapshot (Rolimons snapshot 2026-10-04, third-party; Berry Avenue and Livetopia from RoWatcher)
"30-day peak share" is derived: 30-day peak divided by all-time peak.

| Game (type) | All-time peak | 30-day peak | 30-day share | Visits | Avg playtime (min) | Max per server | Age |
|---|---|---|---|---|---|---|---|
| Brookhaven (RP) | 1,296,208 | 725,899 | 56% | 88.2B | 17.0 | 30 | 6 yr [S67] |
| Adopt Me (pets, social) | 1,884,171 (2021-04-16) | 1,346,852 (event ramp) | 71% | 44.9B | 28.3 | 35 | 9 yr [S68] |
| Dress to Impress (judged round) | 1,743,147 | 383,621 | 22% | 11.1B | 14.3 | 13 | 2 yr [S69] |
| Welcome to Bloxburg (life sim) | 592,451 | 40,293 | 7% | 10.1B | 21.9 | 12 | 11 yr [S70] |
| Royale High (RP, fashion) | 341,166 (2020-10-04) | 26,852 | 8% | 10.5B | 16.9 | 12 | 9 yr [S72] |
| Murder Mystery 2 (round, trading) | 1,352,075 (2026-08-16) | 461,594 | 34% | 31.0B | 11.5 | 12 | 12 yr [S71] |
| Natural Disaster Survival (round) | 128,661 | 68,958 | 54% | 4.5B | 8.1 | 30 | 18 yr [S73] |
| Epic Minigames (minigames) | 47,967 | 3,588 | 7% | 2.4B | 12.4 | 12 | 11 yr [S74] |
| Emergency Response: Liberty County (civil RP) | 53,652 | 44,395 | 83% | 1.6B | 15.2 | 50 | 7 yr [S77] |
| MIC UP (voice hangout) | 17,908 | 5,061 | 28% | 1.1B | 10.0 | 100 | 5 yr [S80] |
| +1 Speed Keyboard Escape (walk-and-gain sim, "X20" place) | 7,263,327 (2026-07-18) | 4,611,607 | 63% | 6.3B | 8.2 | 22 | 8 months [S75] |
| Escape Tsunami For Brainrots (hazard-timer sim) | 4,996,032 | 38,271 | 0.8% | 5.7B | 10.1 | 8 | 9 months [S76] |
| Animal Hospital (co-op roleplay-horror) | 1,273,105 | 307,948 | 24% | 2.4B | 12.3 | 30 | 4 months [S78] |
| PLS DONATE (tip hangout) | 196,819 | 5,526 | 3% | 5.2B | 6.5 | 28 | 4 yr [S81] |
| Berry Avenue (RP) | about 192,000 (2025-02) to 200,600 | n/a | n/a | 8.8B | n/a | n/a | 2022-01 [S82] |
| Livetopia (RP) | 34,000 (2024-10); another source says 65,800 | n/a | n/a | 5.5B | n/a | n/a | 2021-04 [S83] |

Reading the table (derived; a December 2024 RoWatcher note, method undisclosed, put roleplay/avatar sims at 30-35% of 12M concurrent players [S84]):
- Playtime clusters by type: pet/life-sim and open RP 15-28 minutes, judged rounds and civil RP 14-15, minigame and round games 8-12, fast sim loops (+1 Speed, Escape Tsunami) 8-10. Adopt Me holds 3.45 times the playtime of +1 Speed (28.31 / 8.20). Roblox's Creator Rewards count 10 minutes a day, so short-loop games must win multiple sessions a day [S118].
- Server size follows the loop: judged and minigame rounds 12-13, life sim 12, open RP 28-35, civil RP 50, voice hangout 100 (the voice cap per place is 100 [S24]).
- Decay differs wildly: Escape Tsunami kept 0.8% of its peak, Bloxburg, Royale High and Epic Minigames 7-8%, Brookhaven 56%, ERLC 83%. Old social-economy titles flatten; novelty-driven formats collapse (see section 6).
- Hit versus clone (derived): the unofficial "Animal Hospital (ROLEPLAY + SANDBOX)" copy peaked at 1,519 on 2026-07-22 versus 1,273,105 for the original, a ratio of about 838 to 1 [S79][S78]; IT GIRL, a Dress to Impress-style game created 2023-12-27, peaked near 20,000 against 1,743,147, a ratio of about 87 to 1 (IT GIRL figure from a search summary of a tracker page) [S69][S121]. Fashion Famous 2, the older fashion runway game, peaked at 29,585 on 2020-04-13 (search summary of Rolimons) [S121].
- Labels (Roblox's own search API, queried 2026-10-04 without a login, so an age-checked viewer's label may differ): Brookhaven, Berry Avenue, Livetopia, Dress To Impress, Adopt Me, Bloxburg, +1 Speed Keyboard Escape, Steal a Brainrot, Animal Hospital and PLS DONATE show Minimal; Royale High and Epic Minigames show Mild; Murder Mystery 2 and Emergency Response: Liberty County show Moderate. None of the big roleplay towns shows a 16+ or Restricted label, which fits roleplay being excluded from the Social Hangout definition; how the May 2026 change moved their player counts is still unmeasured [S140][S1].
- Platform retention context (third-party, GameAnalytics 2026-09-01; 500+ titles with 1M+ monthly users, Aug 2025 to Jul 2026): median D1 10.3%, D7 1.6%, D30 0.5%, median session 9.8 minutes, 1.56 sessions a day. The report has no genre split, so no roleplay-specific retention figure exists in this note [S146].

### 3. Roleplay and town games
**Brookhaven (Voldex).**
- History: created 2020-04-21 by Wolfpaq; sold to Voldex, announced 2025-02-05 with equity led by Raine Partners and debt from Shamrock Capital and others; price undisclosed; stated aim to reach 145M+ monthly players and keep community and gameplay [S54]. Press at the time gave over 60 billion visits and over 120 million monthly players [S56]. A Variety report summary says at least 15 developers were assigned (search summary, single source) [S122].
- Operations (Voldex, 2026-08-17): Wolfpaq shipped about every two weeks; Voldex moved to weekly; each major Voldex title has a team of 35+ people; brand deals included Wicked and Minions activations in Brookhaven [S55]. Updates land Fridays around 2 PM ET and run a week [S102][S101].
- 2026 content (third-party changelog summaries): Start a Party (2026-01-23), Cherry Blossom (2026-03-14), 65 new props (2026-05-16), Futuristic (2026-08-08), Lavender Luxury (2026-08-28), Interactive Props with eight bakeable foods (2026-09-04), Vehicle Saves and cars (2026-09-11), a Jurassic World event 2026-09-18 to 09-25 with over 3.7 million players marked "attending", then a T.Rex Hunt from 2026-09-25 [S101][S102][S123].
- The party feature (search summary of the changelog plus TechWiser): from the house control panel pick a theme, choose guests, start; invited players get an on-screen invite and can teleport; accepting makes them roommates; House Party is free, Birthday, Dance and Taco parties cost 25 Robux each; estates did not have it at launch [S103][S124].
- Systems inventory (Bloxodes snapshot, third-party): 83 houses, 188 vehicles, 81 jobs and 23 job outfits, 173 inventory items, 10 emotes, 14 map themes, 13 weather and disaster effects, 15 secrets, 22 gamepasses, public servers of 28; no levelling [S89]. Roblox's own games endpoint gives maxPlayers 30, so the 28 on a wiki is stale [S67][S140]. First-party pass list (Roblox game-passes endpoint, 2026-10-04, 18 on sale): VIP 749, Prison Landmark 699, Estates Unlocked 599, Vehicle Pack 599, House Pets 599, Land Unlocked 375, Disaster Pass 375, Premium 320, Vehicle Customization 299, Boat Pack 299, Theme Pack 299, Vehicle Boost Upgrade 199, Vehicle Speed Unlocked 199, Music Unlocked 199, Penthouse 180, Horse Upgrade 85, On Demand Fire 40, Vehicle Upgrade 35 [S140]. This list wins over the guide and wiki lists (VIP 399, Vehicle Pack 799, Disaster 500, and so on), which differ and are third-party [S100]. The shape holds: a ladder of 35-199 utilities, 299-599 packs and 699-749 flagships (the 03 note had 22 passes at 275-799) [S118].
- Whether Brookhaven has a currency is disputed: Bloxodes says no levelling and no cash; one comparison page says there is in-game cash earned through jobs [S89][S97]. Treat jobs as roles, not income, unless you verify in game. The weight of evidence now says there is no currency: a Gfinity guide (2024-11-27) also says there is no traditional currency and jobs pay nothing, while an undated listing page (topgames.gg) claiming daily currency rewards reads like filler and is dropped; no first-party statement exists [S149].
- Scale: record 1,296,208 concurrent on 2025-12-19 [S67][S118]; Rolimons shows 479,108 playing and 619,157 as the seven-day peak on the snapshot; "roughly $6-12M a month" is a directional third-party estimate for Q1 2026 [S85].

**Welcome to Bloxburg (Coffee Stain / Embracer).** Free to play since 2024-06-15 after a 25 Robux entry; acquired by Embracer Group in 2023; inspired by The Sims [S66]. Third-party inventory: 14 jobs, 8 skills (athletic, cooking, gaming, gardening, intelligence, music, painting, writing) capped at level 10, 115 recipes, 71 plants, 58 vehicles, 41 map locations, a mood system, 12 players per server, a Large Plot pass that enlarges the plot to 50x50, basements and advanced placing as passes [S90]. First-party (2026-10-04): 12 players per server and 8 passes on sale: Transform Plus 600, Multiple Floors 360, Excellent Employee 300, Premium 300, Advanced Placing 250, Large Plot 250, Marvelous Mood 180, Basements 100 [S140]. Pay: since update 0.12.6 per-task pay scales with overall work level, not job level; a 2026 guide gives the Pizza Delivery curve ($25 at level 1, $296 at 10, $829 at 20, about $1,300 at 30, $1,640 at 40, $2,500 at 50) and notes the page contradicts its own "flattened pay" claim [S99]. Derived growth per level from that curve: about 32% a level from 1 to 10, 10.8% from 10 to 20, 4.6% from 20 to 30, 2.3% from 30 to 40, 4.3% from 40 to 50; a steep start then a long flat middle. Bills and solar economics are in 03 [S118]. A search summary claims Bloxburg versions 1.23 (June 2026) and 1.29 (July 2026) and a weekly pay boost; unverified [S125].

**Berry Avenue (Amberry Games).** No money at all: 11 jobs that are pure roles, instant to take; a phone menu is the hub for jobs, avatar, house and vehicle; avatar editor imports any catalogue item ID; 78 locations; six public servers of 30 (Bloxodes) [S91]; Roblox's endpoint lists maxPlayers 31 [S140]. First-party passes (2026-10-04, 9 on sale): Premium Houses 799, First Class Travel 599, Top Floor Penthouse 599, Vehicle Pack 1 499, Luxurious Cars Pack 299, Classic Cars Pack 249, Palm Springs Mansion 200, Rustic Mountain Mansion 200, Luxury Yacht 149; this confirms the comparison page's 799, 599 and 499 [S140][S97]. RoWatcher models about $252,884 a month at 60% confidence (an estimate, not a disclosure) [S82]. Peak about 192,000 (2025-02) [S82]; another tracker says 200.6K [S126].

**Livetopia (Century Makers).** Peak 34,000 in 2024-10 (RoWatcher) or 65,800 (another tracker); 5.5B visits; features aviation, boats, pet adoption, an amusement park and "20+ brand partnerships"; first-party passes (2026-10-04, 27 on sale, maxPlayers 17): VIP 199, Aviation 1,398, Cruise 1,198, Amusement Park 1,398, Apartment 998, Royal 1,598, Resort 398, Racing 799, Fashion 799, Companion 198, plus seasonal and collaboration passes from 198 to 2,021; the comparison page's VIP 399 and Aviation 700 do not match [S140][S83][S98]. Pattern: sell themed expansions as separate passes.

**Emergency Response: Liberty County (Police Roleplay Community).** 50 players per server, peak 53,652, average session 15.2 minutes, rating 90.8% [S77]; role tracks for civilians, criminals, police, fire, EMS and transport; team roles include a game director, technical lead, community manager, programmers and QA, and many staff and testers are first responders; Summer 2026 expands the map by about 1.3-1.5 times (search summary) [S127]. Separate career tracks plus real moderation keep a 7-year-old game alive. First-party (2026-10-04): maxPlayers 50, 13 passes on sale from 75 to 750 (SWAT Team 750, Police K-9 400, Premium Jobs 400, FD Special Operations 400, Detective Pass 300) and a Moderate label in Roblox's search API [S140]. A 2020 community interview (mrfergie and Shawnyg, 2020-07-13; stale) says the aim was to fix what other emergency games lacked, that mrfergie worked more than a year before launch, and that private servers let communities set their own roleplay standards [S147].

**Royale High (callmehbob).** Fantasy school and fashion RP; seasonal halos from fountains with spawn rates under 0.1% (search summary), peak 341,166 on 2020-10-04, 10.5B visits [S72][S128]. Rarity chase plus dress-up is the retention engine; no 2026 CCU growth is visible.

**Adopt Me (Uplift Games).** Released 2017-07-13, pets from summer 2019; about 40 staff; Wikipedia says about $60M a year (undated); 704 pets, six life stages, 54 house templates, Bucks earned by care tasks; 35 per server [S64][S94]. 2026 live-ops: Pet Releaser rebuilt 2026-02-20 (Tickets replace Points, no 7-minute timer, Neon pet 20x and Mega Neon 100x tickets), Sugarfest 2026-03-13 to 04-10, "2D Tuesday" free events in three time slots, a Valentine hunt of 14 hearts in 3 minutes (RoWatcher roadmap; confirmed items only) [S87]. Trading Hub (2026-07-31, official patch notes): needs 2 hours played for the Trading Phone, a Trade License from the Safety Hub quiz, and one Neon pet; cross-server boards with two NPCs (post, search); posting costs 100 Bucks, 2 active listings free, extra slots 49 Robux; listed pets are locked; the system blocks very imbalanced listings [S104]. The licence is a three-question quiz in the Safety Hub with unlimited retries; it gates trading Legendary and Ultra-rare pets and unlocks a 30-day trade history with scammer reporting (the developer's own post of 2020-11-05; stale) [S151]. Wikipedia notes scam problems that led to the licence in 2020-11 and an unauthorised $8,000 AUD spend incident [S64].

**Developer voice on roleplay (named, dated).** TomskiKiller (2022-02-27): players want control; a police job whose gun does not work makes them angry, and pre-built-only houses limit family sims; commitblue (2022-03-03): make it lively and sized for the player count [S42]. Creepis and others (2022-08-29): landmarks where people gather (store, lounge or club, apartments, restaurant), interactive objects, character customisation, lighthearted tone, NPC-driven events when servers are empty, and Discord or sponsorship for acquisition [S43]. koi1299 (2023-02-20): avatar, name and job selection are the essentials, bio and save slots matter, and optimise UI for mobile, tablet and console [S44]. A 2026 hangout developer reported that most players left after walking around briefly, so he added leaderboards, a minigame area and overhead indicators, and got only a 1% ad click-through [S45]. These are forum opinions and stale for numbers. A Voldex-side post (Andrew Rose, LinkedIn, 2025-02; his role is not stated on the page I read) frames Brookhaven as giving players tools to make their own fun and social interaction rather than entertaining them [S148].

### 4. Judged-round and fashion games (Dress to Impress)
- Release 2023-11-11; created by the Dress To Impress Group led by Gigi; about 30 developers per a 2024 profile (full-time versus contractor split not disclosed); director Umoyae FreeSpirit; community manager and an influencer server for feedback [S53][S63]. Awards at the 2024 Roblox Innovation Awards (Builderman Choice of Excellence, Best Creative Direction, Best New Experience) [S63].
- Loop: 360 s to dress to a theme from up to 18 items, runway walk with 1-5 star votes, podium for the top three; modes Standard, Duos, Style Showdown (beta March 2025), Freeplay [S63]. Third-party inventory: 498 themes, 249 hairstyles, 726 makeup options, 248 free wardrobe items, 176 VIP-only items, 41 pose packs, 14 ranks, 13 players per server, and 17 "twist" variants in Style Showdown such as Speed Round and Item Lock [S92]. Rolimons also shows 13 per server [S69].
- Money: VIP is 299 Robux for a month or 799 permanent; custom makeup 349; VIP is "an option library, not guaranteed placement" and free players can win [S105]; VIP items cannot be earned free (codes page) [S130]. The 03 note records seven-place cash payouts and stars as non-spendable career rank [S118]. First-party (2026-10-04): the VIP game pass is 799, Custom Makeup 349, x2 Money 399, Run Faster 149, Increased Item Limit 129, and themed item sets 259-399; maxPlayers is 13; the API shows the place created 2023-10-18 (the 2023-11-11 public launch date comes from Wikipedia) [S140].
- Peak: Rolimons lists 1,743,147; the 1.7M mark was hit on 2024-12-15 per social posts (search summary), later 1.8M with the winter update; Wikipedia's 651,000 figure is the August 2024 Charli XCX collab and is stale [S69][S63][S131].
- Live ops 2026 (wiki summaries): Spring update 2026-04-04 (11 free and 13 VIP items, a 30-tier Baddie Pass), Summer update 2026-07-04 (64 items, a Brazil-themed map and lobby), Halloween event listed for 2026-10-10 [S132][S92]. Collabs: Charli XCX (Aug 2024), Lady Gaga (2025-08-16 to 08-23), Wicked: For Good (2025-11-08 to 11-29) [S63]. Dress to Impress also sits in the 2026 "The Hunt: Roblox 20" roster [S117].
- Moments API example from Roblox: players publish runway captures to an in-game gallery [S18].

### 5. Party, minigame and round-based games
- **Natural Disaster Survival (Stickmasterluke).** Created 2008-03-28, full version 2011-12-04; 30 players; about 12 disasters on 21 maps and 2-4 minute rounds with a map vote in the intermission (search summary of guide pages); three passes at 60-95 Robux (Green Balloon 95, Red Apple 80, Yellow Compass 60; maxPlayers 30; first-party, 2026-10-04) [S140]; peak 128,661; won Best Classic Game at the 2026 Innovation Awards and appears in the Roblox 20 Hunt [S73][S108][S17][S117]. Average session is 8.1 minutes: a round game earns repeat sessions, not long ones.
- **Epic Minigames (TypicalType, 2015-07-29).** 140 minigames; each is about 30-90 seconds; the lobby picks the next minigame after 10 seconds; a win gives 10 points (15 on Pro servers); daily Play Rewards since 2024-10-11 with extra rewards every 5 minutes up to 60 minutes (search summary of the game's wiki); "Epic Party" board mode; 12 per server; Rolimons shows peak 47,967 and a 7% 30-day share [S74][S107][S106][S119]. First-party (2026-10-04): maxPlayers 12, Mild label, 10 passes on sale from 99 to 899 (Private Server Powers 899, VIP 499, Party Premium 349, Double Coins 299, Play Rewards Plus 299) [S140].
- **Murder Mystery 2 (Nikilis).** 12 per match, three roles plus a hero; boxes cost 1,000 coins, 100 diamonds or a key; 42 boxes, 524 knives, 210 guns, nine rarity tiers; most past event items are tradable only (Bloxodes) [S93]. Summer 2026 ran 2026-07-23 to 08-23 with a summer lobby and map, a mystery box and a godly item pack [S109]; all-time peak 1,352,075 on 2026-08-16 (Rolimons); a search summary says the event page got over 1M sign-ups [S71][S133]. The bot claim is now reported by several unofficial sources (an X post by MM2 Overview, "lost around 500,000 CCUs within 2 hours"; an X post by KreekCraft, "over half the players in MM2 were bots"; a mmoexp article that calls it a technical block of VPS and fake devices rather than a ban wave). I did not open any of them (search-result text only) and found no Roblox statement, so it stays unverified [S150].
- **+1 Speed Keyboard Escape (SecretVerse Studio, created about 8 months before the snapshot).** Won Best Party and Casual Game at the 2026 Innovation Awards over Adopt Me, Grow a Garden 2 and Clip It [S17][S134]. Loop: walk on giant keyboard keys, +1 Speed per step, spend speed to clear obstacle stages that pay Wins, buy trails, auras, treadmills and teleports, rebirth for a permanent multiplier; third-party counts: 17 stages (13 in World 1), 20 rebirth levels, about x10 per rebirth, World 2 at speed level 140+, World 3 at 400, 13 trails, 4 auras, 5 treadmills, 22 players per server, Discord social codes that give 15,000 Speed every 5 minutes [S95][S96]. Paid trail multipliers (one wiki): 1.5x for 19 Robux, 5x for 249, 10x for 389, 20x for 499 [S96]. First-party (2026-10-04): the game was created 2026-01-18, maxPlayers is 22, and 62 passes exist; the priced ones I read range from 19 (Orange Trail) to 2,645 (Ascendant Trail) for trails, 90 to 1,849 for auras and 79 to 1,199 for treadmills, with Wins Multiplier x2 at 95, Premium Trade Booth at 159 and 20 equip slots at 299 [S140]. I could not match the wiki's multiplier-to-price list to these names, so treat it as unverified. Events: bbno$ World and a concert on 2026-07-25 with 11M+ registered interest and a peak of 6,355,764 concurrent (NME and search summaries); Saturday "Admin Abuse" sessions at 11:00 AM PT; Speedrun Mode, Auto Speed toggle and Daily Treadmill launched 2026-07-11 [S59][S96]. Peak counts conflict: Rolimons shows 7,263,327 on 2026-07-18 for the "X20" place; RoVitals shows 6,062,892 on 2026-08-15 but only tracks from 2026-08-11, after the July peak; the search-summary figures (6,068,965 and 5.62M) are the lower August values. Rolimons' longer window wins: all-time peak 7,263,327. The game title changes with each update, so quote "about 7 million" [S75][S142][S135].
- **Escape Tsunami For Brainrots (Wave of Brainrots, created 2025-12-15).** Collect brainrots, run them to a safe zone before the wave; a repeating 20-second wave timer kills players outside the safe zone and they lose carried items; base upgrade level cap 40 (April 2026); 8 per server; peak 4,996,032; 30-day peak only 38,271 now (Rolimons) [S76][S136]. A January 2026 analyst note (third-party) expected shorter lifespans because of "lack of deep economic sinks" and projected lower bookings than Grow a Garden; the 1.25M figure there is a one-day peak (2026-01-14), not the all-time peak [S110].
- **Finish The Word (Table Game X).** Word-chain: each word starts with the last letter of the previous word, no repeats; lobbies up to 25 players; a 15-second turn timer and heart system (search summary; the wiki page I fetched deliberately omits timer values); won Best Puzzle Game 2026 [S17][S111][S137]. **Paint or Seek**: hide-and-seek where hiders paint to blend in; launched June 2026; reached 19,700 concurrent in about 22 days (search summary); preparation window 15-30 seconds; guide says hide-and-seek games typically run 8-20 players and about one seeker per 4-6 hiders (guide site) [S112][S138].
- Round-state timing from developers: 10 s intermission with a 15 s round in a 2023 beginner script (Dehspair) [S47]; a 2024 round-module review where the fix was to end the round on a completion signal instead of a hard-coded 16 s wait (SonicFrontiers011, 2024-10-06) [S48]; a 2021 vote thread where answerers prefer voting for narrative games and random for minigames, and suggest random three maps to vote on [S49]; 03 holds the 15-35 s intermission samples [S118].

### 6. Social "steal" and 2025-26 event formats
- **Admin Abuse as a format.** Scheduled sessions where developers spawn rare items, boost mutation or luck, and run events that players join at the same time. Press (2026-01-13) lists Steal a Brainrot's "Taco Tuesday" and Saturday sessions and notes engagement drops between events; it says Fisch fell from 1 million to under 20,000 concurrent before admin events and that games surge from 20,000 to over 100,000 during them (third-party) [S61]. The August 2025 "Admin War" between Grow a Garden and Steal a Brainrot pushed Roblox to 47.4M concurrent on 2025-08-23, with each game about 20M, staged through public creator wagers (Tubefilter) [S60].
- **Steal a Brainrot (SpyderSammy and DoBig Studios).** Released 2025-05-16; peaks 5M (July 2025), 24M (2025-09-13), 25.4M (October 2025) per Wikipedia; criticised for pay-to-win and automation; viral through videos of children losing characters [S62]. The brainrot-trend analysis puts it near 215,000 now (99.2% below peak) while keeping weekly updates (Update 44) and says newer titles cannibalise older ones [S86].
- **Concerts as events.** Bruno Mars appeared in Steal a Brainrot on 2026-01-17 (Music Business Worldwide gives Saturday 2026-01-17 and Guinness World Records also says 17 January 2026; the 2026-01-27 date is PocketGamer.biz's publication date, not the show) with 12.8 million concurrent (Guinness: 12,862,161), a limited "Brunito Marsito" character claimed 5,428,644 times, two songs, standard avatar animation and 10 million livestream viewers [S57][S58][S143]. bbno$ in +1 Speed Keyboard Escape reached 6.36 million [S59]. Pattern: a short staged show plus a claimable limited item plus pre-registration.
- **Plants vs Brainrots (Yo Gurt Studio, owner Jandel).** Created August 2025, peak 8,654,525 on 2025-10-11; fuses Plants vs Zombies, Grow a Garden and Steal a Brainrot (search summary) [S139].
- **The Hunt: Roblox 20** (2026-09-17 to 09-28): a hub of missions across eras (2006 to 2026) with 20 participating games, among them Natural Disaster Survival, Murder Mystery 2, Adopt Me, Berry Avenue, Blade Ball and Dress to Impress (search summaries) [S117].
- **Roblox 2026 Innovation Awards** (Sept 2026): Best Party and Casual +1 Speed Keyboard Escape; Best Classic Natural Disaster Survival; Best Puzzle Finish The Word; Best New Game, Creative Direction and People's Choice Animal Hospital [S17]. The organiser's own line is that there is not one definition of a great game.

### 7. What separates hits from clones (evidence, not opinion)
- Hits ship a tool or a rule set that makes friends produce stories: Brookhaven's house, vehicle and prop systems (03 cites an unverified search summary for Wolfpaq's three-system design) [S118], Dress to Impress's fixed time box and public star vote, MM2's tradable event items. Clones copy the theme and miss the support loop; the peak ratios in section 2 (87x and 838x) are the cleanest measurement found.
- Analyst framing (StudioKrew, 2026-01-20): Brookhaven's draw is maximum freedom with minimal friction and no progression gates, with 700K-1M+ average DAU (third-party estimate) [S88].
- Weekly cadence is the norm at the top: Brookhaven weekly on Fridays [S102], Pet Simulator and Steal a Brainrot weekly in 03 [S118], Dress to Impress seasonal drops every quarter plus themed events [S132].
- Novelty decays; economies persist: Escape Tsunami 0.8% and Steal a Brainrot -99.2% against MM2 and Adopt Me whose items are tradable and whose events return yearly [S76][S86][S71][S68].
- The platform is steering away from the loosest social formats toward constrained, age-labelled ones (section 1), and Roblox pays a higher DevEx rate for novel, R15 games for 18+ US spend (see 03) [S118].

## How to apply it (rules for an AI builder)

### Compliance first (these decide who can even see the game)
- DO complete the Maturity and Compliance Questionnaire honestly before publishing; answer Media Sharing "yes" if you use the Upload API [S1][S18].
- DO build roleplay as roleplay: roles with uniforms and props must be central, not "talk to people" as the main activity; a pure chat hub is a Social Hangout and gets 16+ [S1].
- DON'T add free-form drawing, spray paint, sign-writing that others see or pixel canvases if you want under-16 players; offer stamps, shapes and prefab props instead [S1][S5].
- DON'T build bedrooms, bathrooms, changing rooms or small private tents as enclosed spaces. If a house needs rooms, make the whole house a single-owner claimed plot and keep bathroom assets out of the game, or add single-occupancy claim logic [S1][S3][S9].
- DO route all text through TextChatService, never a custom RemoteEvent chat; check `CanUsersChatAsync` before showing DM-style features [S7][S40].
- DO expect chat to be age-banded; give players non-chat ways to coordinate (emotes, pings, Quick Words when you can set them) [S7][S16].
- DON'T copy tip-jar designs that move Robux between players via passes; cross-experience sales are disabled and Transfers has caps [S12].
- DO plan for a 16+ trial: the first 250 engaged plays come from adults and teens 16+, so test with them first [S2].

### Roleplay and town design
- DO ship the three Brookhaven systems first in this order: house claim, vehicle spawner, prop placement; then roles, then events [S118][S89].
- DO make every role functional (a doctor treats, a police officer's tool works) or cut the role; a broken role is worse than none [S42].
- DO give players identity controls on day one: display name tag, bio, outfit presets or catalogue-ID import, 8-10 emotes, a wardrobe with save slots [S44][S91].
- DO place landmarks that make crowds (a diner, a school, a hospital, a plaza) and size the map to the server cap; heuristic: under about 28 players, keep walking time between landmarks under 30 seconds on foot [S43][S89].
- DO keep no-currency or low-currency designs simple: Brookhaven and Berry Avenue run with roles, not wages, and monetise passes and houses [S89][S91]. If you add wages (Bloxburg style), tie pay to a long level curve (steep first 10 levels, flat middle) and add a percentage-based sink [S99].
- DO price passes in a ladder: 35-199 cheap utility, 299-599 packs, 699-799 flagship (first-party Brookhaven, Berry Avenue and Dress To Impress lists); themed expansions can go to 1,200-1,600 as in Livetopia [S140].
- DO give the host a party tool: invite menu, optional theme, teleport to host, guests become roommates [S103].
- DO use tradable, capped-supply seasonal items to hold years of players (MM2, Adopt Me); add a licence or confirmation step to reduce scams [S93][S104].
- DON'T add dating or couple mechanics; Roblox removed MeepCity's party feature in 2022 over online dating concerns and the policy now bans implied romantic or sexual settings [S65][S8].

### Party and minigame design
- DO run a state machine: waiting (needs N players) then intermission/vote then round then results then payout; end each phase on a completion signal with a timeout, never a fixed `task.wait` alone [S48].
- DO keep minigames 30-90 seconds in a collection game and 2-6 minutes in a single-theme round game; intermission of 10-30 seconds, voting during it [S106][S73][S118].
- DO give every player something to do while waiting (small lobby activity) and show a visible countdown [S118].
- DO cap currency per round so skill cannot inflate the economy (MM2 40 coins per round, 50 with a pass, in 03) [S118].
- DO vote with a 3-candidate random shortlist for minigames and a full vote for mode choices [S49].
- DO keep server size at the loop's natural size: 12-13 for judged rounds and minigames, 22-30 for race and hazard rounds, and let the matchmaker fill [S69][S74][S73][S75].
- DON'T tie a party game to long sessions; plan for 8-12 minutes average and win the second and third session with daily rewards and events [S74][S75][S118].

### Events and live ops
- DO create Experience Events for every drop (7-30 days, distinct thumbnail, exclusive reward named, no vague "bug fixes"); Trending Events needs 1,000+ RSVPs [S32].
- DO run Admin-Abuse-style windows only with an event currency and a fixed end time, and log them; they spike CCU but empty servers between events if the base loop is thin [S61][S110].
- DO stage celebrity or brand shows as a 10-30 minute live moment with a claimable limited item and pre-registration, not a permanent mode [S57][S59].
- DO publish weekly on the same weekday and time and say so on the game page (Brookhaven Fridays about 2 PM ET) [S102].

### Technical guardrails (first-party docs)
- DO use current APIs: `Humanoid:ApplyDescriptionAsync`, `Humanoid:PlayEmoteAsync`, `Players:GetHumanoidDescriptionFromUserIdAsync`, `Players:CreateHumanoidModelFromDescriptionAsync`; the non-Async names are deprecated [S25][S26].
- DO store only item IDs and compact transforms for player builds; a DataStore key holds 4,194,304 characters and writes are budgeted at 300 + 20 per concurrent user per minute [S31]. Derived: at about 100 characters per placed item, one key holds about 41,900 items; cap placement far lower (1,000-2,000 items, heuristic) for load time.
- DO give the driver network ownership of the vehicle, and revert when they leave [S35][S118]; `Seat.Occupant` is read-only and `Seat.Disabled` blocks sitting [S38]; sell passes with `MarketplaceService:PromptGamePassPurchase` and check `UserOwnsGamePassAsync`, and grant developer products only in `ProcessReceipt` [S30]; turn on `Workspace.StreamingEnabled` for large towns [S39].
- DO keep voice servers at or below 100 players (voice is disabled above 100) and gate voice on `VoiceChatService:IsVoiceEnabledForUserIdAsync` [S24].
- DON'T rely on wiki counts of houses, jobs or vehicles as targets; use them as a checklist of categories, then scale to your team.

## Recipes (each becomes a skill)

### 1. Town and city roleplay starter blueprint
When to use: a Brookhaven, Berry Avenue or Livetopia-style hangout town.
Steps:
1. Greybox a map with 6-10 landmark zones (plaza, diner, school, hospital, police, bank, houses) on a loop road; place one SpawnLocation next to the first claimable house and vehicle spawner so the first claim happens inside 30 seconds.
2. Set `Players.RespawnTime` to 2-3, keep `StarterPlayer` defaults (`CharacterWalkSpeed` 16, `CharacterJumpHeight` 7.2) so the map is walkable for new players [S37].
3. Build the five systems in this order: house claim (recipe 2), vehicle spawner (4), prop placement (5), roles (3), avatar identity (6).
4. Add a phone or menu button as the single hub: Jobs, Avatar, House, Vehicle, Party, Shop (Berry Avenue pattern) [S91].
5. Add the compliance pass (recipe 15) and a Creator Cam style UI-hide button for recording [S118].
6. Ship free base content and sell packs: VIP 749, vehicle pack 599, theme pack 299 (Brookhaven's current first-party prices) as the first price ladder [S140].
Pitfalls: roles that do nothing, houses with enclosed bathrooms, a custom chat, a map bigger than the server can fill, and selling passes at first load [S42][S1][S7].

### 2. House or plot claim with persistence
When to use: any game where a player owns a home, base or plot.
Steps:
1. Tag N plot Models `HousePlot` (CollectionService); each has a PrimaryPart and a ProximityPrompt (`ActionText` "Claim", `HoldDuration` 0.5, `MaxActivationDistance` 8) [S21].
2. Server keeps `owner[plot] = player`; on `Triggered`, refuse if the player already owns a plot or the plot is taken; set Attribute `OwnerUserId`.
3. On `Players.PlayerRemoving` release the plot and save; also save every 120 seconds and in `game:BindToClose`.
4. Save an array of `{id, cframe components as 12 numbers rounded to 3 decimals, optional color}` per placed item (never Instances) in one key `plot_<UserId>` using `UpdateAsync` inside `pcall` with retries [S31][S46].
5. On claim, load the array, clone each item from an `ItemCatalog` ModuleScript by id, and parent to the plot; skip unknown ids.
Pitfalls: MeshParts cannot be rebuilt from properties alone, so rebuild from a catalogue of prefab models [S46]; stay under the 4,194,304-character key limit and the write budget [S31]; two servers can load the same plot, so hold a short lock (session key) or teleport to a reserved server for edits.

### 3. Job and role system (uniform, tool, task loop, optional pay)
When to use: a role-based town or a Bloxburg-like life sim.
Steps:
1. A `Roles` ModuleScript lists each role: `{name, uniformDescriptionOverrides, tools, spawnPoint, requiresPass?}`.
2. On selecting a role, the server applies the uniform by cloning the player's HumanoidDescription, overriding only shirt, pants, hat, and calling `humanoid:ApplyDescriptionAsync(desc, Enum.AssetTypeVerification.Always)` (the enum docs say to use Always unless you must load non-catalog assets, since loading models can run unexpected scripts) [S145]; give tools via Backpack.
3. Each role needs one working loop with a ProximityPrompt: cashier (order, ring up), delivery (pick up, drive, hand off), doctor (check in, scan, treat).
4. If paying, store `workXp` and compute pay per task as a curve of level (heuristic from the Bloxburg shape: steep to level 10, flat to 40) [S99]; cap tasks per minute server-side.
5. Roles with no pay (Berry Avenue style) switch instantly with no application [S91].
Pitfalls: a role that does not work breaks trust [S42]; client-side tool damage; reapplying descriptions on every respawn without caching.

### 4. Vehicle spawner with correct network ownership
When to use: cars, boats, scooters in any RP or racing hybrid.
Steps:
1. Store vehicle Models in ServerStorage with a `VehicleSeat` (or Seat) as PrimaryPart; one spawned vehicle per player, destroy the old one on respawn [S35].
2. Spawn on a ProximityPrompt or UI button at a spawn pad; set Attribute `OwnerUserId`; lock the seat to the owner optionally.
3. When `seat.Occupant` changes, call `seat:SetNetworkOwner(player)` for the occupant and `seat:SetNetworkOwnershipAuto()` when empty [S118].
4. Cap vehicles per server (heuristic 15-25); bug reports show rubber-banding with 10+ multi-assembly vehicles on a busy server [S118].
5. Vehicle Saves: persist the owner's last vehicle id and colour like a plot item (recipe 2) [S101].
Pitfalls: anchored parts are always server-owned and lag the driver; leftover vehicles after leave; ownership flicker during sit/stand.

### 5. Prop and furniture placement with a budget
When to use: Brookhaven prop mode, Bloxburg build mode, Adopt Me house building.
Steps:
1. Client shows a ghost model; snaps to a grid (heuristic 1 stud, rotation 15 or 90 degrees); sends `{itemId, cframe}` to the server.
2. Server validates: item id exists and is owned or free, position is inside the player's plot bounds (`plot:GetBoundingBox()` check), item count under `MaxItems`, rate under 5 per second.
3. Server places the clone and saves via recipe 2. Undo is a stack of ids.
4. Gate extras behind passes: a larger plot (Bloxburg's Large Plot is 50x50) or higher item cap, not basic placement [S90].
Pitfalls: trusting client CFrames; overlapping items; limits that block the very first decoration.

### 6. Avatar identity: outfits, catalogue import and emotes
When to use: any hangout, fashion or RP game.
Steps:
1. Name and bio: a BillboardGui above the head with the player's chosen name and an optional filtered bio; filter text with TextChatService's filtering path or `TextService:FilterStringAsync`.
2. Outfits: `Players:GetHumanoidDescriptionFromUserIdAsync` for "wear my avatar", `GetHumanoidDescriptionFromOutfitIdAsync` for saved outfits, apply with `humanoid:ApplyDescriptionAsync` [S25][S26].
3. Catalogue import (Berry Avenue style): player pastes an item id; validate with `AvatarEditorService:GetItemDetailsAsync` (client) or `MarketplaceService:GetProductInfoAsync` (server), check asset type, then set the matching HumanoidDescription field or add via `SetAccessories`; throttle to the documented 100 requests per second per experience [S34][S27]. The ApplyDescriptionAsync docs state no ownership requirement and Roblox's own UGC Homestore template lets visitors try on items before buying, so applying a catalogue item the viewer does not own is supported (indirect evidence); pass `Enum.AssetTypeVerification.Always` so a pasted id cannot load a model [S145][S91].
4. Emotes: `humanoid:PlayEmoteAsync(name)` returns a boolean; add custom ones through `HumanoidDescription:AddEmote(name, assetId)` and `SetEquippedEmotes` [S26][S27].
5. Save slots in a DataStore (recipe 2 style), 3-5 outfits.
Pitfalls: applying descriptions on R6 versus R15 rigs; not yielding in a loop; letting the client choose any asset type.

### 7. Private-space claim (single occupancy)
When to use: any hangout with enclosed rooms (if you must have them).
Steps:
1. Tag each enclosed room's trigger volume Part `Privacy_Zone`; keep a table `claimed[zone] = Player`.
2. Server loop every 0.25 s: `workspace:GetPartsInPart(zone, overlapParams)` to list characters inside; the first becomes owner; others are moved to a `ExitPoint` attribute position.
3. Release when the owner leaves the volume or the game; re-check periodically for exploit teleports [S9].
4. Still answer the questionnaire; keep the experience out of "bedroom and bathroom as the main activity" [S1][S8].
Pitfalls: this is mitigation, not an exemption from the age rules; Roblox endorses it only as one safety layer [S3][S9].

### 8. Round state machine (lobby, vote, round, results)
When to use: any round-based party, survival or minigame game.
Steps:
1. A server `Round` module with phases `Waiting`, `Intermission`, `Voting`, `Playing`, `Results`; each phase writes Attributes on `Workspace` (`Phase`, `PhaseEndsAt` from `workspace:GetServerTimeNow()`) so every client UI is a read-only mirror.
2. `Waiting` loops until `#Players:GetPlayers() >= MinPlayers`; `Intermission` 15-30 s; `Voting` inside it (3 random options); `Playing` per-game limit; `Results` 5-10 s.
3. End `Playing` on a completion signal (last player alive, all finished, objective done) or a timeout; never only a fixed wait [S48].
4. Handle leavers: remove from the active list on `PlayerRemoving`; if fewer than the minimum remain, end early.
5. Payout in `Results` with caps per round [S118].
Pitfalls: nested conditionals and a hard wait [S48]; map not loaded when players spawn [S47]; no cleanup of the previous round's objects.

### 9. Minigame plug-in framework (Epic Minigames style)
When to use: 20+ short minigames in one place.
Steps:
1. Each minigame is a ModuleScript returning `{name, minPlayers, duration, setup(players, map), isFinished() -> boolean, scores() -> {[Player]: number}, cleanup()}`.
2. The round module (recipe 8) picks 3 candidates at random for the vote, calls `setup`, polls `isFinished` every 0.25 s until done or `duration` (30-90 s), then calls `scores` and `cleanup`.
3. Rewards: winner gets points (Epic Minigames 10 points, 15 in Pro) plus small participation reward; daily Play Reward timers every 5 minutes up to 60 minutes (heuristic from their pattern) [S106][S119].
4. Add a Pro server for skilled players as a separate PlaceId or reserved server [S29].
Pitfalls: reskinned repeats feel cheap; allow the same minigame twice in a row only rarely; every minigame needs a cleanup path.

### 10. Judged runway round (Dress to Impress core)
When to use: fashion, talent, build-off, cooking-off or any "everyone judges" round.
Steps:
1. Phases: Theme announce (5 s), Styling (360 s, tunable), Runway (about 10-15 s per player), Podium (10 s), payout.
2. Styling room per player: a closet UI that equips items via HumanoidDescription (recipe 6); keep a `MaxItems` of 18 [S63]; theme prompts from a list of hundreds (498 in the live game, third-party) [S92].
3. Runway: server teleports one player at a time to the stage; spectators see a 1-5 star bar. The vote RemoteEvent accepts `(targetUserId: number, stars: number)`, clamps stars to 1-5, ignores self-votes and out-of-phase votes, one vote per voter per target.
4. Tally on the server; top three to the podium; stars add to a persistent career total (not spendable); show rank tiers (14 in the live game) [S63][S92]; use rank as a server filter for Pro lobbies (03 describes this) [S118].
5. Offer a duo mode and a twist mode (item lock, speed round) as variants [S92].
6. Optional: let players publish runway clips with the Upload API [S18].
Pitfalls: vote brigading (ignore votes from players who left; use median or trimmed mean as an option, heuristic); pay-to-win perception (DTI sells option libraries, not votes) [S105].

### 11. Party host and friend-invite flow
When to use: house parties, private hangouts, "bring your friends" bonuses.
Steps:
1. Host presses Party in the house panel, picks a theme, picks guests from a list (client), server validates ownership and creates the party record in memory.
2. Guests get an on-screen invite with Decline or Teleport; accepting adds them to the house's allowed list ("roommates") for the party's duration [S103].
3. For invites from outside the server use `SocialService:CanSendGameInviteAsync` then `PromptGameInvite` with `ExperienceInviteOptions` (`PromptMessage`, `InviteUser`, `LaunchData` up to 200 characters, optional notification asset) [S19][S20].
4. On join read `Player:GetJoinData().LaunchData` with retry (data can take seconds) and teleport to the host [S19][S28].
5. Reward friend play: a small capped bonus per friend present (heuristic from Pet Simulator's +2% per friend capped at +10% in 03) [S118].
6. Sell cosmetic themes at 25 Robux as optional extras [S103].
Pitfalls: the invite prompt only works client-side and can be unavailable on some platforms, so always call `CanSendGameInviteAsync` first [S19]; do not auto-teleport minors into strangers' private houses.

### 12. Live event kit: Experience Event, global boost windows and a staged show
When to use: seasonal drops, Admin-Abuse-style windows, concerts.
Steps:
1. Create the Experience Event in Creator Hub (Engagement > Events and Updates): thumbnail, title, start and end, a place; run it 7-30 days [S32].
2. In game, read `GameJoinContext.EventId` to attribute joins [S32].
3. Event currency and shop live in their own DataStore keys and are removed at the end (Roblox's economy doc, summarised in 03) [S118].
4. Boost windows: a `LiveEvents` module holds `{startUnix, endUnix, multipliers}`; one server publishes via `MessagingService:PublishAsync("LiveEvent", {...})` (payload under 1 kB), others subscribe; late joiners read the current record from MemoryStore or an HttpService-free DataStore key [S36].
5. Concert or show: a scripted 10-30 minute sequence on a schedule, a claimable limited item at the start, a 5-minute pre-lobby, no new round mechanics during the show [S57][S59].
6. Pre-announce on the event page 7 days ahead and open sign-ups; plan for 1,000+ RSVPs for Trending [S32].
Pitfalls: message rate limits (600 + 240 per player per minute per server) [S36]; a boost with no end time; base loop too thin without events [S61][S110].

### 13. Trading with licence, locks and listing fee
When to use: a pet, item or knife economy.
Steps:
1. Server-owned trade session: `{a, b, offerA, offerB, confirmedA, confirmedB}`; either change to an offer resets both confirmations; require both to press Confirm twice (preview then final), as Adopt Me's two-step flow does [S104][S129].
2. Lock offered items in inventory during the session and on listings [S104].
3. Gate trading by a short "licence" quiz of three scam scenarios and a playtime threshold (Adopt Me: 2 hours of play) [S104][S129].
4. Cross-server board: listing costs soft currency (100 Bucks) with two free active listings, extra slot for Robux (49); block very imbalanced listings [S104].
5. Log every trade (UserIds, items, timestamp) in a DataStore or external log for reports.
Pitfalls: item duplication on server shutdown (save both inventories atomically with `UpdateAsync` and validate ownership at commit); showing player "value" lists that drive scams (03 and press note scam problems) [S64].

### 14. Walk-and-gain and hazard-timer loops (2026 "hybrid party sim")
When to use: a short-loop casual game aimed at the Party and Casual lane.
Steps (walk and gain, +1 Speed pattern):
1. A long path of "keys" (Parts) each with a Touched or region check; server adds +1 times multiplier to `Speed` per step with a per-player debounce (0.1-0.2 s, heuristic).
2. Spend Speed to clear gated obstacle stages that pay Wins; Wins buy trails, auras, teleports; rebirth resets Speed for a permanent multiplier (the live game uses about x10 per rebirth over 20 rebirths, third-party) [S95][S96].
3. Passive progress: treadmills that add Speed offline-style while standing; free codes that grant Speed on a timer [S96].
4. Cap server size near 22 [S75].
Steps (hazard timer, Escape Tsunami pattern):
1. A wave that crosses the map every 20 s (tunable) kills players outside a safe zone and drops carried items; the safe zone is a trigger volume [S136].
2. Collect valuables on the field, carry to base, bank income; upgrade carry capacity and base floors up to a level cap (40 in the live game) [S136].
3. 8-player servers keep it personal [S76].
Pitfalls: the analyst note on thin economies; pure loops decay fast, so budget a weekly event and a sink [S110][S86].

### 15. Compliance and labelling checklist (run before publish)
When to use: every social, roleplay or hangout game.
Steps:
1. Run the questionnaire; read the resulting label [S1].
2. Remove free-form drawing; remove or single-occupy private spaces; keep bars and clubs out unless you accept 18+ [S1][S3].
3. Confirm roles and items are central if you call it roleplay; if the main activity is chatting, expect 16+ [S1].
4. Route all text through TextChatService; add reporting; filter names and bios [S7][S22].
5. Disable any tipping or Robux transfer between players outside Transfers [S12].
6. For all-ages reach: aim for 250 unique engaged plays in 60 days and remember the trial is 16+ only [S2].
7. Re-run the questionnaire whenever you add the Upload API, voice or a new mode [S18].
Pitfalls: relying on your own moderation to drop an age label [S5]; assuming a wiki label of "roleplay" protects a chat-first game.

### 16. Chat tools: proximity, commands and age-aware features
When to use: any hangout or RP game with local chat.
Steps:
1. Keep default channels (`CreateDefaultTextChannels`); on the server set `ShouldDeliverCallback` on `RBXGeneral` to deliver only to players within about 60 studs (heuristic) [S22].
2. Add commands as `TextChatCommand` children of TextChatService (`/party`, `/me`). Create and connect them on the server: `Triggered` fires on the side where the instance lives, and a command created on a client does not sink the message, so other players still see it [S23][S152].
3. Style bubbles with `BubbleChatConfiguration` and `OnBubbleAdded` [S22].
4. Before showing a DM or party-chat UI, call `TextChatService:CanUsersChatAsync(a, b)` [S40].
5. Voice: stay at or below 100 players per place; check `VoiceChatService:IsVoiceEnabledForUserIdAsync` [S24].
Pitfalls: callbacks must not yield [S22]; do not log or transmit raw chat.

### 17. Raid-and-return carry loop (condensed from 2025-26 steal games)
When to use: a social tension game with bases.
Steps: base with a lock timer on join (30 s) and re-lock (60 s) plus 10 s per rebirth (third-party SaB values in 03); carry an item to your base slowed and exposed; a hit returns the item; a shield cooldown; income per placed item; hatch or buy more; 6-8 players per server makes theft personal (Steal an Egg, 03) [S118][S62].
Pitfalls: pay-to-win items and automation scripts hurt trust (Wikipedia notes both for SaB) [S62]; give sellers ways to defend; keep the loop short and run weekly events.

## Luau reference snippets
All APIs below appear in the docs fetched for this file; where a side or detail was not confirmed it is flagged.

Round state machine with attributes (server Script):
```luau
--!strict
local Players = game:GetService("Players")

local CONFIG = {
	MinPlayers = 2,
	Intermission = 20,
	RoundTimeout = 60,
	Results = 8,
}

local function setPhase(name: string, duration: number)
	workspace:SetAttribute("Phase", name)
	workspace:SetAttribute("PhaseEndsAt", workspace:GetServerTimeNow() + duration)
end

local function waitUntil(done: () -> boolean, timeout: number)
	local t0 = os.clock()
	while os.clock() - t0 < timeout and not done() do
		task.wait(0.25)
	end
end

local roundFinished = false -- set true by gameplay code (last alive, objective done)

while true do
	setPhase("Waiting", 0)
	waitUntil(function()
		return #Players:GetPlayers() >= CONFIG.MinPlayers
	end, math.huge)

	setPhase("Intermission", CONFIG.Intermission)
	task.wait(CONFIG.Intermission)

	roundFinished = false
	setPhase("Playing", CONFIG.RoundTimeout)
	-- setup(), teleport players here
	waitUntil(function()
		return roundFinished or #Players:GetPlayers() < CONFIG.MinPlayers
	end, CONFIG.RoundTimeout)

	setPhase("Results", CONFIG.Results)
	-- payout(), cleanup()
	task.wait(CONFIG.Results)
end
```

House claim with ProximityPrompt and saved items (server):
```luau
--!strict
local Players = game:GetService("Players")
local CollectionService = game:GetService("CollectionService")
local DataStoreService = game:GetService("DataStoreService")

local store = DataStoreService:GetDataStore("Plots_v1")
local ownerOf: {[Instance]: Player} = {}
local plotOf: {[Player]: Model} = {}

local function claim(plot: Model, player: Player)
	if ownerOf[plot] or plotOf[player] then return end
	ownerOf[plot], plotOf[player] = player, plot
	plot:SetAttribute("OwnerUserId", player.UserId)
end

for _, plot in CollectionService:GetTagged("HousePlot") do
	local prompt = plot:FindFirstChildWhichIsA("ProximityPrompt", true)
	if prompt then
		prompt.Triggered:Connect(function(player: Player)
			claim(plot :: Model, player)
		end)
	end
end

local function save(player: Player)
	local plot = plotOf[player]
	if not plot then return end
	local items = {}
	for _, item in plot:GetChildren() do
		local id = item:GetAttribute("ItemId")
		if id and item:IsA("Model") then
			table.insert(items, { id = id, cf = { item:GetPivot():GetComponents() } })
		end
	end
	local ok, err = pcall(function()
		store:UpdateAsync("plot_" .. player.UserId, function()
			return items
		end)
	end)
	if not ok then warn("plot save failed", err) end
end

Players.PlayerRemoving:Connect(function(player)
	save(player)
	local plot = plotOf[player]
	if plot then ownerOf[plot] = nil end
	plotOf[player] = nil
end)

game:BindToClose(function()
	for _, player in Players:GetPlayers() do save(player) end
end)
```

Vehicle network ownership (server, inside the vehicle's Script):
```luau
local seat = script.Parent:FindFirstChildWhichIsA("VehicleSeat", true)
local Players = game:GetService("Players")
if seat then
	seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		local humanoid = seat.Occupant
		if humanoid then
			local player = Players:GetPlayerFromCharacter(humanoid.Parent)
			if player then seat:SetNetworkOwner(player) end
		else
			seat:SetNetworkOwnershipAuto()
		end
	end)
end
```

Apply an outfit and play an emote (server):
```luau
local Players = game:GetService("Players")

local function wearUserAvatar(humanoid: Humanoid, userId: number)
	local ok, desc = pcall(function()
		return Players:GetHumanoidDescriptionFromUserIdAsync(userId)
	end)
	if ok then
		humanoid:ApplyDescriptionAsync(desc, Enum.AssetTypeVerification.Always)
	end
end

local function dance(humanoid: Humanoid)
	return humanoid:PlayEmoteAsync("dance") -- returns boolean
end
```

Judged vote with server tally (server):
```luau
--!strict
local voteRemote = game:GetService("ReplicatedStorage"):WaitForChild("Vote") :: RemoteEvent
local Players = game:GetService("Players")

local votes: {[number]: {[number]: number}} = {} -- targetUserId -> voterUserId -> stars
local acceptingVotes = false -- set true during the runway phase

voteRemote.OnServerEvent:Connect(function(voter: Player, targetUserId: unknown, stars: unknown)
	if not acceptingVotes then return end
	if typeof(targetUserId) ~= "number" or typeof(stars) ~= "number" then return end
	if targetUserId == voter.UserId then return end
	if not Players:GetPlayerByUserId(targetUserId) then return end
	local s = math.clamp(math.floor(stars), 1, 5)
	votes[targetUserId] = votes[targetUserId] or {}
	votes[targetUserId][voter.UserId] = s
end)

local function average(targetUserId: number): number
	local sum, n = 0, 0
	for _, s in votes[targetUserId] or {} do
		sum += s
		n += 1
	end
	return if n > 0 then sum / n else 0
end
```

Invite a friend (LocalScript) and read launch data (server):
```luau
-- LocalScript
local SocialService = game:GetService("SocialService")
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")

local player = Players.LocalPlayer
local ok, canSend = pcall(function()
	return SocialService:CanSendGameInviteAsync(player)
end)
if ok and canSend then
	local options = Instance.new("ExperienceInviteOptions")
	options.PromptMessage = "Join my house party!"
	options.LaunchData = HttpService:JSONEncode({ host = player.UserId }) -- 200 characters max
	SocialService:PromptGameInvite(player, options)
end
```
```luau
-- Script: on a joining player (retry, data may arrive late)
local function readLaunch(player: Player)
	for _ = 1, 10 do
		local data = player:GetJoinData()
		if data and data.LaunchData then return data.LaunchData end
		task.wait(1)
	end
	return nil
end
```

Proximity chat (server): the second argument is the recipient's TextSource.
```luau
local TextChatService = game:GetService("TextChatService")
local Players = game:GetService("Players")

local channel = TextChatService:WaitForChild("TextChannels"):WaitForChild("RBXGeneral") :: TextChannel
local RANGE = 60 -- studs, heuristic

channel.ShouldDeliverCallback = function(message: TextChatMessage, recipient: TextSource)
	local sender = message.TextSource
	if not sender then return true end -- system messages
	local a = Players:GetPlayerByUserId(sender.UserId)
	local b = Players:GetPlayerByUserId(recipient.UserId)
	local ra = a and a.Character and a.Character:FindFirstChild("HumanoidRootPart")
	local rb = b and b.Character and b.Character:FindFirstChild("HumanoidRootPart")
	if not ra or not rb then return true end
	return ((ra :: BasePart).Position - (rb :: BasePart).Position).Magnitude <= RANGE
end
```

Chat command (server Script: `Triggered` fires where the instance lives and only server-created commands sink the message; the signature is `(originTextSource, unfilteredText)`):
```luau
local TextChatService = game:GetService("TextChatService")
local cmd = Instance.new("TextChatCommand")
cmd.Name = "PartyCommand"
cmd.PrimaryAlias = "/party"
cmd.Parent = TextChatService
cmd.Triggered:Connect(function(origin: TextSource, unfilteredText: string)
	print(origin.UserId, unfilteredText)
end)
```

Live event broadcast across servers (payload under 1 kB):
```luau
local MessagingService = game:GetService("MessagingService")
MessagingService:SubscribeAsync("LiveEvent", function(msg)
	local data = msg.Data -- {name = ..., endsAtUnix = ...}
	-- apply multiplier until data.endsAtUnix (os.time())
end)
-- publisher (one server or an admin tool):
pcall(function()
	MessagingService:PublishAsync("LiveEvent", { name = "LuckBoost", endsAtUnix = os.time() + 600 })
end)
```

Single-occupancy zone check (server, sketch):
```luau
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local params = OverlapParams.new()
local claimed: {[BasePart]: Player} = {}

while true do
	for _, zone in CollectionService:GetTagged("Privacy_Zone") do
		local inside = {}
		for _, part in workspace:GetPartsInPart(zone, params) do
			local player = Players:GetPlayerFromCharacter(part:FindFirstAncestorOfClass("Model"))
			if player then inside[player] = true end
		end
		local owner = claimed[zone]
		if owner and not inside[owner] then claimed[zone] = nil; owner = nil end
		for player in inside do
			if not owner then claimed[zone] = player; owner = player
			elseif player ~= owner then
				local exit = zone:GetAttribute("ExitPosition") :: Vector3?
				local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
				if exit and root then (root :: BasePart).CFrame = CFrame.new(exit) end
			end
		end
	end
	task.wait(0.25)
end
```

## Open questions / unverified
Resolved in the 2026-10-04 gap pass (see Key facts and Recipes): the private-space age (docs say 18+, which wins over the 2025 17+) [S1][S141]; the labels of the big roleplay
towns (Minimal, not 16+) [S140]; the 250 versus 500 review threshold (docs: 250) [S2]; Brookhaven's pass list, server cap and currency [S140][S149]; Dress to Impress's server cap
(13) [S140]; the +1 Speed Keyboard Escape peak conflict (Rolimons 7,263,327 wins) [S75][S142]; the Bruno Mars concert date (2026-01-17) [S57][S143]; applying non-owned
catalogue assets (indirect evidence, use `AssetTypeVerification.Always`) [S145]; `TextChatCommand.Triggered` side and the default sprint and crouch abilities (official,
Studio Beta) [S144][S152]; one developer interview (ERLC, 2020) [S147].
- How the May 2026 16+ change moved the player counts of Brookhaven, Berry Avenue and Livetopia: no first-party statement; the only effect evidence is anecdotal and platform-wide [S50][S51][S52].
- Brookhaven's real revenue: only third-party estimates exist [S85].
- Dress to Impress payout tables beyond 03 (the server cap itself is settled at 13) [S92][S118].
- The MM2 bot-ban claim: reported by several unofficial sources but no Roblox statement and none of the pages was opened [S150].
- Roleplay-specific retention numbers (D1/D7/D30): only platform-wide medians exist (GameAnalytics 2026); Mic Up's fall from its peak (17,908) is real in Rolimons but its cause was not established [S146][S80][S118].
- Roblox's Creator Spotlights program page lists past spotlights but none of these social games [S41].
- No developer interview or talk with Brookhaven's creator, Livetopia or Berry Avenue on design process was found; the DTI profile, the Voldex piece and the 2020 ERLC interview are the only first-hand voices.

## Sources
[S1] Content maturity and compliance (social hangout, private spaces, roleplay, free-form creation, labels), Roblox Creator Hub, undated (raw docs repo), https://create.roblox.com/docs/production/promotion/content-maturity
[S2] Roblox Kids and Select (publishing requirements), Roblox Creator Hub, 2026, https://create.roblox.com/docs/production/publishing/kids-and-select
[S3] Strengthening Our Safety Policies and Tools, Roblox DevForum announcement, 2025-08-15, updated 2026-05-12, https://devforum.roblox.com/t/strengthening-our-safety-policies-and-tools/3882864
[S4] Weekly Recap: May 11 to May 15, 2026, Roblox DevForum, 2026-05, https://devforum.roblox.com/t/weekly-recap-may-11-to-may-15-2026/4638298
[S5] "Free Form User Creation" 16+, Roblox DevForum (staff reply), 2026, https://devforum.roblox.com/t/free-form-user-creation-16/4687562
[S6] Age-Based Roblox Kids and Select Accounts Now Globally Available, Roblox newsroom, 2026-06-16, https://about.roblox.com/newsroom/2026/06/age-based-roblox-kids-and-select-accounts-now-globally-available
[S7] Age Check Requirement to Chat Now Live Globally, Roblox DevForum, 2026-01-07, https://devforum.roblox.com/t/age-check-requirement-to-chat-now-live-globally/4226101
[S8] Clarifying Our Policy on Romantic and Sexual Content, Roblox newsroom, 2025-08, https://about.roblox.com/newsroom/2025/08/extending-roblox-policy-on-romantic-and-sexual-content
[S9] Private Space Claiming System, TheM0rt0nator, Roblox DevForum, 2025-09-24, https://devforum.roblox.com/t/private-space-claiming-system-improving-safety-measures-regarding-private-areas/3956641
[S10] New Requirements to Publish and Update Public Experiences, Roblox DevForum, effective 2025-12-17, https://devforum.roblox.com/t/new-requirements-to-publish-and-update-public-experiences/4143953
[S11] Roblox Q2 2026 shareholder letter (transcribed extract) and results release, 2026-07-30, https://www.marketscreener.com/news/roblox-second-quarter-2026-shareholder-letter-ce7f50dbd98cf323 and https://ir.roblox.com/news/news-details/2026/Roblox-Reports-Second-Quarter-2026-Financial-Results/default.aspx
[S12] Disabling Cross-Game Sales of Passes and Dev Products and Introducing the Transfers API, Roblox DevForum, 2026-05, https://devforum.roblox.com/t/disabling-cross-game-sales-of-passes-and-dev-products-and-introducing-the-transfers-api/4618396
[S13] The 2025 Roblox Replay: Decoded Through Search and Style, Roblox newsroom, 2025-12, https://about.roblox.com/newsroom/2025/12/roblox-replay-decoded-search-style
[S14] The Infrastructure Supporting Record-Breaking Experiences, Roblox newsroom, 2025-06, https://about.roblox.com/newsroom/2025/06/roblox-infrastructure-supporting-record-breaking-games
[S15] Creator Roadmap 2025: RDC Update, Roblox DevForum, 2025-09, https://devforum.roblox.com/t/creator-roadmap-2025-rdc-update/3961527
[S16] Creator Roadmap 2026: Fall Update, Roblox DevForum, 2026-09, https://devforum.roblox.com/t/creator-roadmap-2026-fall-update/4880208
[S17] 2026 Roblox Innovation Awards, Roblox newsroom, 2026-09, https://about.roblox.com/newsroom/2026/09/2026-roblox-innovation-awards
[S18] [Beta] Content Sharing APIs (Upload and Recommendations), Roblox DevForum, 2025-11, https://devforum.roblox.com/t/beta-content-sharing-apis-use-upload-api-and-recommendations-api-to-drive-discovery-and-engagement/4065417
[S19] Player invite prompts, Roblox Creator Hub, https://create.roblox.com/docs/production/promotion/invite-prompts
[S20] SocialService class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/SocialService
[S21] ProximityPrompt class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt
[S22] In-experience text chat guide, Roblox Creator Hub (raw docs repo), https://create.roblox.com/docs/chat/in-experience-text-chat
[S23] TextChatCommand class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/TextChatCommand
[S24] Voice chat, Roblox Creator Hub (raw docs repo), https://create.roblox.com/docs/chat/voice-chat
[S25] Players class reference (YAML), Roblox creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Players.yaml
[S26] Humanoid class reference (YAML), Roblox creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Humanoid.yaml
[S27] HumanoidDescription class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/HumanoidDescription
[S28] Player class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/Player
[S29] TeleportService class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/TeleportService
[S30] MarketplaceService class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/MarketplaceService
[S31] Data store errors and limits, Roblox Creator Hub, https://create.roblox.com/docs/cloud-services/data-stores/error-codes-and-limits
[S32] Experience events, Roblox Creator Hub, https://create.roblox.com/docs/production/promotion/experience-events
[S33] Private servers, Roblox Creator Hub, https://create.roblox.com/docs/production/monetization/private-servers
[S34] AvatarEditorService class reference (YAML), Roblox creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/AvatarEditorService.yaml
[S35] VehicleSeat class reference (YAML), Roblox creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/VehicleSeat.yaml
[S36] MessagingService class reference (YAML), Roblox creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/MessagingService.yaml
[S37] StarterPlayer class reference (YAML), Roblox creator-docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/StarterPlayer.yaml
[S38] Seat class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/Seat
[S39] Workspace class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/Workspace
[S40] TextChatService class reference, Roblox Creator Hub, https://create.roblox.com/docs/reference/engine/classes/TextChatService
[S41] Roblox Creator Spotlights program page, Roblox Creator Hub, https://create.roblox.com/docs/creator-programs/spotlights
[S42] What do people want from a roleplay game, TomskiKiller and commitblue, DevForum, 2022-02/03, https://devforum.roblox.com/t/what-do-people-want-from-a-roleplay-game-how-to-make-a-good-roleplay-game/1683798
[S43] How to keep players in a player-based roleplay game, Midnight_Hurricane and replies, DevForum, 2022-08, https://devforum.roblox.com/t/how-to-keep-players-in-a-player-based-roleplay-game/1939168
[S44] What makes a good roleplay game experience, koi1299, DevForum, 2023-02-20, https://devforum.roblox.com/t/what-makes-a-good-roleplay-game-experience-for-someone-on-roblox/2026565
[S45] Need feedback for my Avatar Value Hangout game, DevForum, 2026, https://devforum.roblox.com/t/need-feedback-for-my-avatar-value-hangout-game/4628005
[S46] How to save parts, and the idea of Serialization, starmaq, DevForum, 2020-04-14 (stale), https://devforum.roblox.com/t/how-to-save-parts-and-the-idea-of-serialization/524311
[S47] Map voting system, Dehspair, DevForum, 2023-09-19, https://devforum.roblox.com/t/map-voting-system/2600399
[S48] Feedback on Round system, SonicFrontiers011, DevForum, 2024-10-06, https://devforum.roblox.com/t/feedback-on-round-system/3184403
[S49] Voting or Random Map System?, DevForum, 2021-02-05, https://devforum.roblox.com/t/voting-or-random-map-system/1026431
[S50] Roblox's New Age Restriction Update is Killing Games Before They Even Launch, Grandpar_LIoyd, DevForum, 2026-05-31, https://devforum.roblox.com/t/robloxs-new-age-restriction-update-is-killing-games-before-they-even-launch/4661801
[S51] My game was incorrectly labeled 16+, My6974, DevForum, 2026, https://devforum.roblox.com/t/my-game-was-incorrectly-labeled-16-despite-meeting-all-the-requirements-for-all-ages/4705340
[S52] Huge CCU drop across all my games, HatlessBanjo, DevForum, 2026-07-11, https://devforum.roblox.com/t/update-huge-ccu-drop-across-all-my-games/4731070
[S53] Millions of Kids Play Dress to Impress on Roblox. Now Meet the People Behind It., Crossplay, 2024, https://www.crossplay.news/p/who-makes-dress-to-impress-on-roblox
[S54] Voldex acquires hit Roblox game Brookhaven, PocketGamer.biz, 2025-02-05, https://www.pocketgamer.biz/voldex-acquires-hit-roblox-game-brookhaven/
[S55] How Voldex Grows Roblox's Biggest Games, NetInfluencer, 2026-08-17, https://www.netinfluencer.com/how-voldex-grows-roblox-biggest-games-and-connects-brands-with-their-communities/
[S56] Voldex acquires Brookhaven: monetisation overhaul, Mapshot, 2025-02, https://mapshot.gg/news/voldex-acquires-brookhaven-how-robloxs-most-visited-game-could-see-a-monetization-overhaul/
[S57] Bruno Mars pulls record 12.8m concurrent users to Roblox concert, Music Business Worldwide, 2026-01, https://www.musicbusinessworldwide.com/bruno-mars-pulls-record-12-8m-concurrent-users-to-roblox-concert/
[S58] Roblox reports record 12.8m concurrent users for Bruno Mars virtual concert, PocketGamer.biz, 2026-01, https://www.pocketgamer.biz/roblox-reports-record-128m-concurrent-users-for-bruno-mars-virtual-concert/
[S59] bbno$ to perform Roblox virtual concert, NME, 2026-07, https://www.nme.com/news/gaming-news/bbno-roblox-virtual-concert-how-to-watch-3958373
[S60] Developer beef just helped Roblox set a 47-million-player record, Tubefilter, 2025-08-25, https://www.tubefilter.com/2025/08/25/roblox-grow-garden-steal-brainrot-admin-war-record/
[S61] Admin Abuse Might Save Dying Roblox Games But Hurts Them in the Long Run, Beebom, 2026-01-13, https://beebom.com/admin-abuse-might-save-dying-roblox-games-but-hurts-them-in-the-long-run/
[S62] Steal a Brainrot, Wikipedia, accessed 2026-10-04, https://en.wikipedia.org/wiki/Steal_a_Brainrot
[S63] Dress to Impress (video game), Wikipedia, accessed 2026-10-04, https://en.wikipedia.org/wiki/Dress_to_Impress_(video_game)
[S64] Adopt Me!, Wikipedia, accessed 2026-10-04, https://en.wikipedia.org/wiki/Adopt_Me!
[S65] List of Roblox games, Wikipedia (MeepCity, Brookhaven entries), accessed 2026-10-04, https://en.wikipedia.org/wiki/List_of_Roblox_games
[S66] Welcome to Bloxburg, Wikipedia, accessed 2026-10-04, https://en.wikipedia.org/wiki/Welcome_to_Bloxburg
[S67] Brookhaven stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/4924922222
[S68] Adopt Me! stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/920587237
[S69] Dress To Impress stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/15101393044
[S70] Welcome to Bloxburg stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/185655149
[S71] Murder Mystery 2 stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/142823291
[S72] Royale High stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/735030788
[S73] Natural Disaster Survival stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/189707
[S74] Epic Minigames stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/277751860
[S75] +1 Speed Keyboard Escape (X20) stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/95082159892680
[S76] Escape Tsunami For Brainrots stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/131623223084840
[S77] Emergency Response: Liberty County stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/2534724415
[S78] Animal Hospital (Animal Anomaly) stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/78515283254292
[S79] Animal Hospital (ROLEPLAY + SANDBOX) clone stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/87887392565590
[S80] MIC UP stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/6884319169
[S81] PLS DONATE stats, Rolimons (third-party), snapshot 2026-10-04, https://www.rolimons.com/game/8737602449
[S82] Berry Avenue RP stats, RoWatcher (third-party model), 2026, https://rowatcher.com/games/3240075297/berry-avenue-rp
[S83] Livetopia RP stats, RoWatcher (third-party), 2026, https://rowatcher.com/games/2549475383/livetopia-rp
[S84] Roblox Hit 12 Million Concurrent Players, RoWatcher, 2024-12, https://rowatcher.com/news/roblox-hit-12-million-concurrent-players-where-are-they-all-playing
[S85] The 10 Highest-Earning Roblox Games in 2026, RoWatcher (directional estimates), 2026 Q1, https://rowatcher.com/news/the-10-highest-earning-roblox-games-in-2026-and-what-they-mean-for-the-platform
[S86] Is the Brainrot Trend Dying?, RoWatcher, 2026-02 (undated page), https://rowatcher.com/news/is-the-brainrot-trend-dying-what-ccu-data-from-three-top-games-reveals
[S87] Adopt Me 2026 Roadmap, RoWatcher, 2026, https://rowatcher.com/news/adopt-me-2026-roadmap-every-confirmed-feature-event-rumored-update
[S88] Top Roblox Games 2026 and Analysis, StudioKrew, 2026-01-20 (updated 2026-04), https://studiokrew.com/blog/top-games-on-roblox-and-analysis-2026/
[S89] Brookhaven RP wiki snapshot, Bloxodes (third-party), 2026, https://bloxodes.com/wiki/brookhaven-rp
[S90] Welcome to Bloxburg wiki snapshot, Bloxodes (third-party), 2026, https://bloxodes.com/wiki/welcome-to-bloxburg
[S91] Berry Avenue RP wiki snapshot, Bloxodes (third-party), 2026, https://bloxodes.com/wiki/berry-avenue-rp
[S92] Dress To Impress wiki snapshot, Bloxodes (third-party), 2026-10, https://bloxodes.com/wiki/dress-to-impress
[S93] Murder Mystery 2 wiki snapshot, Bloxodes (third-party), 2026, https://bloxodes.com/wiki/murder-mystery-2
[S94] Adopt Me wiki snapshot, Bloxodes (third-party), 2026, https://bloxodes.com/wiki/adopt-me
[S95] +1 Speed Keyboard Escape wiki snapshot, Bloxodes (third-party), 2026-10-03, https://bloxodes.com/wiki/1-speed-keyboard-escape
[S96] +1 Speed Keyboard Escape wiki, speedkeyboardescape.wiki (third-party), 2026-08, https://speedkeyboardescape.wiki/
[S97] Berry Avenue vs Brookhaven RP, Earnaldo (third-party), 2026, https://earnaldo.com/blog/berry-avenue-vs-brookhaven-rp
[S98] Livetopia vs Brookhaven RP, Earnaldo (third-party), 2026, https://earnaldo.com/blog/livetopia-vs-brookhaven-rp
[S99] Best Paying Jobs in Welcome to Bloxburg (2026), Earnaldo (third-party), 2026, https://earnaldo.com/blog/welcome-to-bloxburg-tier-list-2026
[S100] Brookhaven RP 2026 Complete Guide, BloxGuides (third-party), 2026, https://bloxguidesgg.com/blog/brookhaven-rp-2026-complete-guide-updates-secrets
[S101] Brookhaven RP update history, games.gg (third-party), 2026, https://games.gg/brookhaven-rp/guides/brookhaven-rp-update-history-every-major-recent-change/
[S102] Brookhaven RP events schedule, allthings.how (third-party), 2026-09, https://allthings.how/brookhaven-rp-events-schedule/
[S103] Brookhaven Start A Party update, TechWiser (third-party), 2026-01, https://techwiser.com/brookhaven-start-a-party-update-release-countdown/
[S104] Trading Hub Notes, Adopt Me official news, 2026-07-31, https://www.playadopt.me/news/trading-hub-notes
[S105] How Much Is DTI VIP, Pixel Twelve (third-party), 2026, https://pixeltwelve.com/articles/dress-to-impress-vip-cost-benefits-worth-it
[S106] Epic Minigames codes and structure, game.guide (third-party), 2026-09, https://www.game.guide/roblox-codes/epic-minigames
[S107] Epic Minigames, Perfection Roblox Games Wiki (third-party), https://perfectionrobloxgames.miraheze.org/wiki/Epic_Minigames
[S108] Natural Disaster Survival, Perfection Roblox Games Wiki (third-party), https://perfectionrobloxgames.miraheze.org/wiki/Natural_Disaster_Survival
[S109] Murder Mystery 2 events schedule, allthings.how (third-party), 2026-09-03, https://allthings.how/murder-mystery-2-events-schedule/
[S110] Escape Tsunami For Brainrots impact report, TickerTrends (analyst estimates), 2026-01, https://blog.tickertrends.io/p/rblx-escape-tsunami-brainrot-impact-analysis
[S111] Finish The Word how to play, finish-the-word.wiki (third-party), 2026, https://finish-the-word.wiki/guides/how-to-play/
[S112] Paint Or Seek guide, Gameland Insider (third-party), 2026, https://gamelandinsider.com/paint-or-seek-guide
[S113] Roblox Moments announcement, Roblox newsroom, 2025-09, https://about.roblox.com/newsroom/2025/09/roblox-moments-user-generated-discovery
[S114] Roblox just raised the age for its most popular games to 16, Wired Parents (third-party), 2026-05, https://wired-parents.com/roblox-age-16-social-hangouts-roleplay-may-2026/
[S115] Roblox Recap: September 2026, Bloxy News (third-party), 2026-09, https://www.bloxy.news/post/september26
[S116] Roblox RDC 2025: 10 creator tools and updates, allthings.how (third-party), 2025-09, https://allthings.how/roblox-rdc-2025-10-creator-tools-and-updates-that-matter/
[S117] The Hunt: Roblox 20 (event and roster), Sportskeeda and allthings.how search summaries, 2026-09, https://www.sportskeeda.com/roblox-news/news-roblox-celebrates-20th-anniversary-the-hunt-event and https://allthings.how/the-hunt-roblox-20-every-confirmed-game-and-event-dates/
[S118] Genre design craft for Roblox games, internal research file 03-genre-design.md (this repo), 2026-10-04, /Users/moshe/Developer/RbxAI/research/roblox/03-genre-design.md
[S119] Epic Minigames timing and reward details, search summary of the game's wiki, 2026, https://typical-games.fandom.com/wiki/Epic_Minigames
[S120] Roblox age checks for chat explained (age bands), search summaries of ProGameGuides and BiometricUpdate, 2026-01, https://progameguides.com/roblox/roblox-age-checks-for-chat-explained/
[S121] IT GIRL and Fashion Famous 2 stats, search summaries of Rotrends and Rolimons pages, 2026, https://rotrends.com/game/5451143054 and https://www.rolimons.com/game/568350650
[S122] Roblox Game 'Brookhaven' Acquired by Voldex, Variety, 2025-02-05 (search summary; page would not load), https://variety.com/2025/gaming/news/roblox-brookhaven-game-acquired-voldex-1236295120/
[S123] Brookhaven RP 2026 updates (Start a Party, Cherry Blossom, Futuristic, Lavender Luxury, Vehicles), search summaries of the community changelog and TechWiser, 2026, https://brookhaven.fandom.com/wiki/Changelog
[S124] Start a Party update (party types and prices), search summary of the community changelog, 2026-01, https://official-brookhaven.fandom.com/wiki/Changelog/Start_A_Party_Update
[S125] Bloxburg changelog versions 1.23 and 1.29 (search summary, unverified), 2026, https://welcome-to-bloxburg.fandom.com/wiki/Changelog
[S126] Berry Avenue RP peak 200.6K, search summary of RoTrends, 2026, https://rotrends.com/game/3240075297
[S127] Emergency Response: Liberty County team and 2026 map expansion, search summary of DevForum credits and wiki pages, 2026, https://devforum.roblox.com/t/emergency-response-liberty-county-credits/2046898
[S128] Royale High seasonal halos 2026, search summary of Rotrends and Bloxodes, 2026, https://bloxodes.com/events/royale-high
[S129] Adopt Me trade licence test, search summary of Bloxswaps and AllThings.how, 2026-07, https://allthings.how/adopt-me-trading-hub-how-to-unlock-and-use-it/
[S130] Dress to Impress codes (no free VIP items), Beebom (third-party), 2026-10-01, https://beebom.com/roblox-dress-to-impress-codes/
[S131] Dress to Impress 1.7M concurrent on 2024-12-15, search summary of social posts, 2024-12, https://x.com/theblushingcat/status/1867966869757693976
[S132] Dress to Impress 2026 update log (Spring 2026-04-04, Summer 2026-07-04), search summary of the community wiki, 2026, https://dti-dress-to-impress.fandom.com/wiki/Update_Log/2026
[S133] Murder Mystery 2 Summer 2026 record and bot-ban wave, search summary of the community wiki and press, 2026-08, https://murder-mystery-2.fandom.com/wiki/Summer_Event_2026
[S134] Roblox Innovation Awards 2026 nominees (Party and Casual), search summary of allthings.how, 2026-07, https://allthings.how/roblox-innovation-awards-every-nominee-across-all-19-categories/
[S135] +1 Speed Keyboard Escape CCU records, search summaries of Roblox Status posts and spawn trackers, 2026-07/08, https://x.com/RblxTracker/status/2071231292637651446
[S136] Escape Tsunami For Brainrots mechanics (20 s wave, base cap 40), search summary of the community wiki, 2026-04, https://roblox.fandom.com/wiki/Wave_of_Brainrots/Escape_Tsunami_For_Brainrots
[S137] Finish The Word (25-player lobbies, 15 s timer, hearts), search summary of Sportskeeda and the Roblox page, 2026, https://www.roblox.com/games/91704854174760/Finish-The-Word
[S138] Paint Or Seek launch and growth, search summary of Dexerto and the Roblox page, 2026-06, https://www.roblox.com/games/85245205758607/Paint-Or-Seek
[S139] Plants vs Brainrots peak 8,654,525 on 2025-10-11, search summary of Roblox fandom and tracker pages, 2025-10, https://roblox.fandom.com/wiki/Yo_Gurt_Studio/Plants_Vs_Brainrots
[S140] Roblox public endpoints, queried by GET on 2026-10-04 (first-party data; pass prices and counts are a snapshot): games.roblox.com/v1/games?universeIds=<id> (maxPlayers, created, visits), apis.roblox.com/game-passes/v1/universes/<id>/game-passes (pass names and prices), apis.roblox.com/search-api/omni-search (maturity label, anonymous request). Universe ids used: Brookhaven 1686885941, Berry Avenue 3240075297, Livetopia 2549475383, Dress To Impress 5203828273, Bloxburg 88070565, Adopt Me 383310974, MM2 66654135, ERLC 903807016, Royale High 321778215, Epic Minigames 110181652, Natural Disaster Survival 65241, +1 Speed 9584852943. https://games.roblox.com/v1/games
[S141] creator-docs repository history for production/promotion/content-maturity.md (updates through 2026-09-26) and the file's text on private spaces (18+), read 2026-10-04. https://github.com/Roblox/creator-docs/commits/main/content/en-us/production/promotion/content-maturity.md
[S142] +1 Speed Keyboard Escape stats: RoVitals game page (record 6,062,892 on 2026-08-15; tracking from 2026-08-11; created 2026-01-18) and records page, third-party, read 2026-10-04. https://rovitals.com/game/9584852943 ; https://rovitals.com/records
[S143] Largest music concert in a videogame by a single artist (Bruno Mars, Steal a Brainrot, 12,862,161, 17 January 2026), Guinness World Records; and Music Business Worldwide (concert Saturday 2026-01-17, published 2026-01-22). https://www.guinnessworldrecords.com/world-records/782027-largest-music-concert-in-a-videogame-by-a-single-artist
[S144] "[Studio Beta] Expanding the Character Controller Library: New Default Abilities & Custom Abilities API", m0bsterlobster (Roblox Character Physics Team), DevForum, 2026-09-10. https://devforum.roblox.com/t/studio-beta-expanding-the-character-controller-library-new-default-abilities-custom-abilities-api/4863739
[S145] AssetTypeVerification enum and Humanoid:ApplyDescriptionAsync (raw docs source), and the UGC Homestore entry of the Templates page, Roblox creator-docs, read 2026-10-04. https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/enums/AssetTypeVerification.yaml ; https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/resources/templates.md
[S146] 2026 Roblox Benchmark Report, GameAnalytics, 2026-09-01 (platform-wide retention, session length, ARPPU; no genre split). https://www.gameanalytics.com/reports/2026-roblox-report
[S147] "Unofficial Developer Spotlight #011 - Play Emergency Response: Liberty County!", mrfergie and Shawnyg interview, DevForum, 2020-07-13 (community-run, stale). https://devforum.roblox.com/t/unofficial-developer-spotlight-011-play-emergency-response-liberty-county/670624
[S148] Voldex acquisition post by Andrew Rose, LinkedIn, 2025-02 (read through the page text only). https://www.linkedin.com/posts/andrewerose1_brookhaven-captures-the-essence-of-roblox-activity-7292574298966306816-HMkK
[S149] "Roblox: Brookhaven RP - How to Earn Money", Gfinity Esports, 2024-11-27 (third-party; no currency). https://www.gfinityesports.com/article/roblox-brookhaven-rp-how-to-earn-money
[S150] MM2 bot-purge reports, search-result text only (pages not opened): MM2 Overview on X, https://x.com/MM2Overview/status/2089531019422503141 ; KreekCraft on X, https://x.com/KreekCraft/status/2089532724541374571 ; mmoexp article, https://www.mmoexp.com/News/murder-mystery-2-what-happened-to-1-35-million-players-the-mm2-bot-crisis-explained.html (all unofficial, 2026-08)
[S151] "Trade Changes & Scam Prevention update", Adopt Me! official news, Uplift Games, 2020-11-05 (stale; trade license quiz, 30-day history). https://www.playadopt.me/news/trade-changes-and-scam-prevention-update
[S152] "Messages that trigger a client-side TextChatCommand are not sunk", EmeraldSlash, DevForum Engine Bugs, 2024-09-30 (staff acknowledged); and the 2024-07 answer by 7z99. https://devforum.roblox.com/t/messages-that-trigger-a-client-side-textchatcommand-are-not-sunk/3176993
