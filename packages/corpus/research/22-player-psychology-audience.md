# Player psychology and audience: who plays Roblox, what they want, and how to build for them ethically
_Researched 2026-10-04 by Claude (deep researcher agent). Sources: 77._

Scope: Roblox's audience (age, region, device, gender), what each age band wants, motivation science (self-determination theory, Bartle, Quantic Foundry) mapped to Roblox genres, social play, fairness and pay-to-win perception, children's design ethics and regulation (dark patterns, 5Rights, the UK Children's Code, FTC and EU action), parents' expectations, and the design rules an AI builder should follow.

Evidence labels used below: **[Roblox]** = Roblox's own filings, letters or docs; **[peer-reviewed / regulator / NGO]** = named study or body; **[third-party]** = analytics or press aggregators; **[derived]** = my arithmetic from sourced numbers; **[synthesis]** = my mapping or inference, not measured data. Anything older than 2024 is flagged "(pre-2024, may be stale)".

---

## Key facts

### 1. Size, engagement and trend (2025 to mid-2026)
- 2025 average: 127 million DAUs across 180+ countries, 123.9 billion hours engaged, an average of 2.7 hours per DAU per day, and users visit "over 24" different experiences a month. About 1.8 million daily unique payers (about 1.4% of DAUs); bookings per daily paying user about $10.36 versus about $0.15 across all users. [S5, Roblox 10-K FY2025]
- Quarterly DAUs: Q3 2025 151.5M (peak, +70% YoY), Q4 2025 144M (+69%), Q1 2026 132M (+35%), Q2 2026 123M (+10% YoY). Hours engaged: Q3 2025 39.6B, Q4 2025 35B, Q1 2026 31B, Q2 2026 29B. [S4, S3, S2, S1]
- Derived: Q2 2026 hours per DAU per day is about 2.6 (29B / (123M x 91 days)). Roblox's own consumer research cites 2.8 hours a day for Q3 2025. [derived from S1; S20]
- The sequential decline from the Q3 2025 peak is attributed by Roblox to age-check rollout "restricting on-platform communication for non-age checked users" (Q1 2026 letter called headwinds "greater-than-expected"), plus a Russia block (reinstated June 2026; about a 3-point YoY headwind in Q2). Retention of existing users was described as "stable." [S2, S1]
- Concentration is falling: the top 10 games were about 20% of hours in Q2 2026, down from about 30% three years earlier; experiences outside the top 10 grew hours about 25% YoY. [S1] Outside-top-10 engagement grew 68% in 2025 per the Q4 2025 letter. [S3] Implication: a new, well-targeted niche game can reach an audience; it does not have to beat Grow a Garden.
- Record concurrency in 2025: Grow a Garden about 21.6M (July), Steal a Brainrot above 25M (September), platform-wide 45M (August). [S20, S3]
- Roblox reported 30 million-plus Global Chat messages a day in June 2026 and about 1.4 billion messages a day across all experiences (RDC keynote, 2026-09-11). [S1, S23]

### 2. Age bands
- **Age-checked mix** (Roblox switched from self-reported to age-checked data in Q1 2026; the numbers are "estimates derived from limited information", extrapolated from the checked cohort, which may be unrepresentative): [S2]
  - As of 2026-01-31 (45% of DAUs checked): under 13 = 35%, 13-17 = 38%, 18+ = 27%. [S3]
  - As of 2026-03-31 (51% global, 65% US checked): 36% / 38% / 26%. [S2]
  - As of 2026-06-30 (57% global, over 70% in the US and Australia; U18 users 60% checked globally, 75% in the US): 35% / 38% / 27%. In the US, over-18s are about one-third of age-checked DAUs. Target is 90% long term. [S1]
- Caution: checked users skew toward people who want to chat, so the unchecked 43% (Q2 2026) may differ, probably younger and less social. [synthesis from S1, S2]
- Derived: if the split held for all 123M DAUs, under-13s would be about 43M, 13-17s about 47M, 18+ about 33M. [derived, S1] Advocacy groups cite "30+ million" under-13 daily users. [S54]
- Direction of travel: in Q3 2025 DAUs aged 13+ grew 89% YoY and hours from 13+ grew 107% (under-13 hours +67%); 13+ were about two-thirds of DAUs and 68% of hours. [S4 and search summary of S4] The over-18 cohort is "growing at over 50%, more than double the rate" of younger users in the Q4 2025 letter. [S3]
- US over-18s in Q2 2026: DAUs +32% YoY, hours +27%; ages 18-34 DAUs +42%, hours +37%. Over-18s monetize "over 50% higher" than under-18s (Q1 and Q2 2026 letters; "40% higher" in Q4 2025). [S1, S2, S3]
- Third-party panel (Apptopia, US devices): the 17-25 cohort's daily time per user reached 92.3 minutes (a nine-quarter high) and the cohort grew about 20% YoY in Q2 2026. [S6 third-party]
- Roy Morgan (Australia, April-December 2025, n=792 players aged 6-13): 61% of Australian 6-13s play Roblox (about 1.7M). By age: 6-7 = 41%, 8-9 = 66%, 10-11 = 69%, 12-13 = 70%. [S7 peer-reviewed-style market research]
- Ofcom, UK (published 2026-05-21, via press summary because the PDF was blocked): about 40% of 11-17s use Roblox, level with Instagram and Facebook and behind YouTube (67%), WhatsApp (61%), TikTok (60%) and Snapchat (50%). Among 8-14s Roblox reaches about 61% of online users (8-9: 59%, 10-12: 67%, 13-14: 56%), with about 15 minutes a day on average and 1 hour 19 minutes for the heaviest users. [S59]
- Piper Sandler, US teens (n=6,455, average age 16.2, published 2025-04-16): "active usage" of Roblox 42% in spring 2025, down from 46% in fall 2024; 17% of teens had never played. [S10]
- Stale self-reported age tables (Roblox Creator Hub page, Q2 2022 snapshot; and a 2025 blog repeating older Creator Hub tables with 41% "18+") are not comparable to the age-checked data. Do not use them for design decisions. [S74, S75; pre-2024, stale]

### 3. Regions
- 2025 average DAU mix: US/Canada about 33%, Europe about 27%, Asia-Pacific about 27%, rest of world about 13% (as extracted from the 10-K text; verify against the filing table before quoting). [S5]
- Growth is international: Q4 2025 DAUs outside US/Canada +79% YoY versus US/Canada +32%; Q1 2026 +40% versus +17%; Q2 2026 Japan +67%, India +64%, US/Canada +6%. [S3, S2, S1]
- Third-party secondary figures for Q4 2025 growth (Japan about +160%, India +110%, Indonesia over +700%, Korea +120%) and monthly users (India over 10M, Brazil about 9.5M, Indonesia about 7.2M) are unverified. [third-party, unverified]
- Search culture differs by region (Roblox Replay 2025): Brazil "futebol", Indonesia and Philippines "wall hop" climbing games, Germany "Notruf Hamburg" emergency-service roleplay, Thailand Loy Krathong, Japan anime. Broad terms such as "horror" and "roleplay" out-searched most specific titles. [S20]
- Access is volatile: country blocks reported in 2025-26 include Turkey (2024), Oman (June 2025), Qatar (August 2025), Algeria (September 2025), Iraq (October 2025), Russia (December 2025, reinstated 2026-06-10 after Roblox added age-based game access), Egypt (February 2026); Kuwait reversed its block. [S67 and search summaries; dates unverified individually]

### 4. Devices
- Roblox runs on iOS, Android, Windows, Mac, Xbox, PlayStation, Chromebook and some VR hardware. [S5]
- Newzoo (Q2 2025, via a report digest): about 80% of users access on mobile, but only 24% play mobile-only (most mix mobile with PC or console); PlayStation was about 3% of playtime (374M hours in Q2 2025) after its October 2023 launch. [S8 third-party]
- Roblox Replay 2025: mobile players search for horror, escape and obby; tablet for creative building and fashion; console for action and licensed titles (Sonic, sports); PC for complex RPGs, fighting and mechanics-heavy games. [S20] Treat this as correlation: it reflects who owns what device.
- A "72% mobile, 25% PC, 3% console" split appears in aggregator posts attributed to the 10-K, but I could not find it in the filing text. [unverified]

### 5. Gender
- Roblox's own recent filings do not publish a gender split. [S1-S5]
- Apptopia (US consumer device panel, mobile only): female weekly active users grew 24% YoY versus 5% for males, and female WAUs passed male WAUs for the first time on Roblox mobile (mid-2026). [S6 third-party]
- Pew (US teens 13-17, n=1,453, fall 2023): 97% of boys play video games versus about 75% of girls; boys are far more likely to call themselves gamers (62% versus 17%). This is video games generally, not Roblox. [S11]
- Roy Morgan (Australia, 6-13): boys favour Fighting (45% versus 10% of girls), Shooters (38% versus 6%) and Action (49% versus 23%); girls favour Fashion (45% versus 6% of boys), Music (22% versus 8%) and Party (26% versus 14%). Adventure is equal at 43%; RPG 26% boys versus 29% girls. Adventure is top for ages 8-13 (44%) and second for 6-7s (36%). [S7]
- Older Roblox Creator Hub figures (about 51% male, 44% female, 5% other) are undated and likely stale. [S75, stale]
- Fashion and expression are a mainstream, not niche, motivation: Roblox/Ipsos (two surveys May and August 2025, 1,600 US Gen Z players aged 13-28, 50/50 gender quota, so not representative of the whole base) found 47% change avatars to express creativity, 38% to try a new identity, 38% to stand out, 37% to match mood; 274 million avatar updates a day; 73% want avatars to express a full emotional range. [S20]

### 6. What people say they play for
- Pew (US teens): 87% say fun is a major reason to play; 72% of players cite spending time with others; 30% cite socializing and 30% competing as major reasons; 89% play with others (in person or online); 47% made online friends through games; 41% have been called offensive names, 12% physically threatened, 8% sent unwanted sexual content; 80% of all teens say harassment in games is a problem; 41% say gaming hurts sleep. [S11]
- GameRefinery (2020-06-29, pre-2024, mobile-game-genre comparison): Roblox scored Exploration 5/5, Social competing 4.8/5, Expression 4.2/5. Top archetypes: King of the Hill 20%, Thrill Seeker 19%, Treasure Hunter 18%. Versus genre averages: social competing +75%, social co-op +56%, expression +47%, collecting-as-exploration -25%, management/resource optimization -43%. [S9]
- Newzoo (2025): hits are described as "social, trend-driven, creative, and have a low entry barrier"; speed of iteration and cultural relevance beat visual fidelity. Genres by daily visits (Q1 2021-Q2 2025): Roleplay & Avatar Sim 116M, Simulation 110M, Platformers 70M, Survival 70M, Action 59M. [S8 third-party]
- Roblox's creator docs: players value content variety, quick entry and "play with friends"; sessions are a handful of different games, like a video feed. (Q2 2022 snapshot, pre-2024.) [S74]
- Roblox's discovery system rewards co-play: "co-play days per user" (days a user returns to play with friends via join, invite or private server) is listed as an important signal, alongside play-through rate, first-play bounce, play days per user and playtime per user (capped at 60 minutes daily per user for the signal). [S21] A third-party summary quotes Roblox as saying higher frequency of play, spend and interaction with friends predicts long-term retention. [S22 third-party]

### 7. Motivation science
- **Self-determination theory (SDT) applied to games.** Games are intrinsically appealing when they satisfy autonomy, competence and relatedness; across studies each need independently predicted enjoyment and future play (Przybylski, Rigby and Ryan, 2010, Review of General Psychology). [S29] A follow-up finding is that violence itself is not the motivator; the need-satisfying mechanics around it (choice, skill, social interaction) are. [S30] A practitioner summary warns that fake choice and time-gated progress without skill growth give the illusion of competence and serve compulsion, not enjoyment. [S31]
- **Rewards can backfire.** A 128-study meta-analysis found tangible and expected rewards undermined intrinsic motivation, with a stronger effect for children than for college students; positive verbal-style feedback enhanced it (Deci, Koestner and Ryan, 1999, pre-2024, may be debated but still the standard reference). [S32] Design reading: stacking payouts for merely showing up can erode the fun they are meant to reinforce, so tie rewards to mastery or creation.
- **Time is the wrong question.** Large datasets (UK adolescents, n=120,115) support a "Goldilocks" pattern where moderate screen use is not harmful and no use correlates with worse well-being (Przybylski and Weinstein, 2017). Telemetry from Electronic Arts and Nintendo (Oxford, 2021) found only a small positive correlation between playtime and well-being, and suggested motivation and need satisfaction matter more than hours. [S33, S34]
- **Quantic Foundry Gamer Motivation Model** (Nick Yee and Nic Ducheneaut; over two million profiles). Twelve motivations in six clusters: Action (Destruction, Excitement), Social (Competition, Community), Mastery (Challenge, Strategy), Achievement (Completion, Power), Immersion (Fantasy, Story), Creativity (Design, Discovery). [S26]
  - Age: Competition declines most with age; Excitement also falls; Strategy is the most age-stable; older players more often pick Completion and Fantasy as primary motivations, and Completion stays in the top three across ages. Age explains more variance than gender for Competition (2016, pre-2024). [S26 search summaries; direct pages were blocked]
  - Gender: differences exist and match stereotypes in direction but are small relative to age for most motivations (2015); women's most common primary motivations in the 2025 age and gender report are Completion and Fantasy. [S26 search summaries]
  - None of this is Roblox-specific; Quantic Foundry does not publish a Roblox profile that I could find.
- **Bartle's taxonomy** (1996, MUDs; pre-2024, contested). Four types: Achievers, Explorers, Socializers, Killers (a later 2003 version splits each into explicit/implicit subtypes). The widely repeated mix (about 80% socializers, 10% achievers, 10% explorers, under 1% killers) is a rough balance claim for MUDs, not a measured population. Nick Yee's 2006 factor analysis replaced types with three components (Achievement, Social, Immersion) and 10 subcomponents; empirical tests found some Bartle sub-factors did not correlate. [S27, S28] Use Bartle as a checklist of verbs, not as a segmentation of Roblox players.

### 8. Social play
- Social play is the default, not an add-on: 89% of US teen gamers play with others and 72% cite time with others as a reason (Pew). [S11] In Roblox discovery, intentional co-play is a ranking input. [S21]
- Qualitative research on children's play in Roblox (ages 8-13, 48 interviews and observations, 2025): avatar making serves self-representation, alter-ego experiments, social needs and performance; kids keep several avatars but favour one ("wardrobe effect"); monetization design shapes what they pick; they balance self-expression against peer conformity. [S37 peer-reviewed-style preprint]
- Norway (SIFO/OsloMet, ages 10-15, play-along interviews, published January 2025): skins act as status and inclusion; kids reported being called "poor" without them, and one 13-year-old said that not playing with others leaves "nothing to talk about at school." [S52]
- Teen Roblox developers (18 interviews, 2025) use developer communities for technical and career growth but meet conflict and scams. [S38]
- Roblox's April 2026 changes: "Trusted Friends" (inner circle, family and real-life friends across age bands) added by QR scan or contact import for age-checked 13+, parental approval for under 13; chat is off by default under 9; 9-12 chat is enabled with Trusted Friends and similar ages; no photos, video, emails or addresses in chat. [S24]
- Age-checked chat bands: under 9, 9-12 (reported as 9-12 in newer docs), 13-15, 16-17, 18-20, 21+; a user can chat with their own band and adjacent younger bands, not older ones (Jan 2026 global rollout; facial age estimation with a reported mean absolute error of 1.4 years under 18). [S25, S12] Effect on design: text chat is no longer a safe assumption for co-ordination. A game must work for a lobby where a quarter of players cannot talk to each other.
- Roblox also launched Quick Words (developer-submitted preset phrases, approved by Roblox moderators, marked with a symbol), reported "over five million" such messages a day in July 2026, and announced emojis and friend voice calling at RDC 2026. [S1, S23]

### 9. Fairness and pay-to-win perception
- Players distinguish acceptable from unacceptable spending: cosmetic and convenience purchases are accepted; competitive advantage purchases are seen as unfair, especially in PvP (Freeman, Wu, Nower and Wohn, CHI PLAY 2022). [S39] Roblox developer forum threads (2020, 2022) reach the same consensus: sell cosmetics, one-time server events, accept optional time-skips, reject paid power, "R$10,000" rank passes, or content hidden behind payment; one 2022 thread suggests separating payers and non-payers in matchmaking. [S40, S41]
- Cosmetics-only can top the charts: Rivals, a competitive shooter, monetizes through weapon skins and battle-pass-style progression, not power, and was described in early 2026 as topping PC and mobile revenue charts (third-party estimate of about 400,000 CCU in January 2026). [S42 third-party]
- Roblox's own paid-random-items policy (2026 doc): outcomes and numeric odds must be shown before purchase, as percentages summing to exactly 100% (four or more decimal places allowed for long decimals); a "Details" or "Info" word is required, not just an (i) icon; applies to Robux and to currency, keys or tickets that can be bought with Robux; covers capsules, enhancement items, probability modifiers (luck boosts, pity). For users in restricted regions or ages (`ArePaidRandomItemsRestricted`) the creator must hide, replace or block those purchases; paid item trading is gated by `IsPaidItemTradingAllowed`. Free random rewards from non-payment actions are outside the policy. [S18, S19]
- University of Sydney (Carter et al., May 2026, "Misleading and Deceptive Monetisation in Roblox"): 14 of 15 popular games contained deceptive or misleading purchases. Patterns: false reference pricing (fake daily discounts), obscured price via virtual currency, near-miss visuals, spend prompts after a loss, countdown timers and limited offers, loot boxes, pay-to-progress requirements. In 30 minutes testers spent about AUD 150. Parents struggle to spot it; refund support was "little to none." [S53]
- Dark-pattern taxonomy (Zagal, Björk and Lewis, 2013, pre-2024): temporal (grinding, "play by appointment"), monetary (pay-to-skip, premium currency), social capital (social pyramid schemes), plus a psychological category added by later work. A 2024 analysis of 1,496 mobile games (85,388 rated instances) found only 10.76% had zero dark patterns; "dark" games were 96.8% free-to-play with in-app purchases in 93.6%. [S35, S36]
- Loot boxes and young people: meta-analytic and survey work links loot-box spending to problem gambling, with a link in adolescents reported at more than twice the adult strength (Zendle and colleagues, 2019 onward, pre-2024 for the original). [search summaries; S76]
- Creator Rewards (launched July 2025) pays Robux for qualified playtime of Premium and ad-eligible users, bringing new and returning users, and being among a user's first three experiences of the day; Roblox said 73% of developers earned more. This makes honest engagement, not only spend, a revenue path. [S68]

### 10. Children's design ethics and regulation
- **UK Age Appropriate Design Code ("Children's Code")**: 15 standards including best interests of the child, age-appropriate application, detrimental use of data, default settings (high privacy by default), geolocation off by default, parental controls, profiling off by default, nudge techniques, online tools. Standard 13: do not use nudges to encourage children to provide unnecessary data or turn off privacy protections; pro-privacy and wellbeing nudges (breaks) are allowed. Age bands: 0-5, 6-9, 10-12, 13-15, 16-17. [S47]
- ICO monitoring of 10 popular mobile games for children began 2025-12-01 (default settings, geolocation, targeted ads). UK parents surveyed by the ICO: 84% concerned about exposure to strangers or harmful content (50% very concerned), 76% worried about sharing personal data, 75% about ad-targeting data, and 30% said a child stopped using a game over data concerns. [S48, S77]
- **5Rights Foundation** (Disrupted Childhood, 2018, updated April 2023): persuasive design in products built for commercial goals, not children's interests. The 5Rights/Ofcom-commissioned financial-harm study (2025-07-30; 93 children aged 8-16 and 62 parents) found 32% of children regretted money spent in online games, 42% found it unclear what they were buying, 41% reported overspending, and named five tactic families: risk-based, dissociative (alternative currencies, big bundles), misleading, impulsive (limited-time, scarcity) and social influence (peer pressure, appearance changes, streak rewards). [S49, S50]
- **FTC v. Epic Games (2022-12-19)**: $275M COPPA penalty plus $245M refunds. Alleged: one-press purchase triggers (wake from sleep, loading screen, adjacent buttons), locking accounts of players who disputed charges, voice and text chat on by default for children and teens. Orders: chat off by default, parental opt-in under 13, teen opt-in for 13+. FTC examined gameplay style, graphics and character partnerships to find the game child-directed. [S43, S44]
- **FTC v. Cognosphere / Genshin Impact (January 2025)**: $20M; loot boxes not sold to under-16s without parental consent; odds and pricing disclosures corrected. [S45]
- **COPPA Rule amendments** published 2025-04-22, effective 2025-06-21, compliance deadline 2026-04-22 (new data-retention policy, biometric identifiers as personal information, third-party disclosure consent, "mixed audience" definition). [S46]
- **EU:** consumer-authority key principles on in-game currencies (March 2025: show real-world price prominently, avoid mixed currencies that obscure cost, 14-day withdrawal for unspent virtual currency, treat high spenders as vulnerable, assume children play any non-adult game); an enforcement action against Star Stable; DSA Article 28 minors guidelines (2025-07-14); the Digital Fairness Act proposal expected Q4 2026, targeting loot boxes, pay-to-win and virtual currencies aimed at minors. [S60, S61, S62]
- **Roblox-specific legal pressure:** state attorney-general suits (as of 2026-04-30: Florida, Iowa, Kentucky, Louisiana, Nebraska, Texas, Tennessee; per a law-firm summary), MDL-3166 consolidating 115+ child-safety suits (December 2025; law-firm source), a $35.8M settlement with West Virginia ($11.1M), Alabama ($12.2M) and Nevada ($12.5M) on 2026-04-23 including pledges to age-verify users and limit adult contact with under-16s, a 2024 short-seller report (Hindenburg, 2024-10-08, which Roblox disputed), and a Fairplay/NCOSE FTC complaint (2026-05-20) alleging that the virtual currency, gambling-like features, scarcity marketing, daily-use incentives and visible peer items pressure children. Roblox "strongly disputes" the FTC claims. [S55, S56, S57, S54]
- **Australia:** Roblox is outside the under-16 social-media ban as a gaming service but committed to private-by-default accounts for under-16s, chat off until age estimation, and no adult-to-under-16 contact without parental consent; eSafety found gaps in 2026 testing. [S63]
- UNICEF (2019) and the Fair Play Alliance Disruption and Harms framework (2020) are the industry-side references for child-rights impact assessment and positive-play design (pre-2024, but still cited). [S64, S66]

### 11. What parents expect
- US survey of 1,000 parents of Roblox-using children (A Case for Women, Pollfish, December 2025; advocacy-sponsored): 61% think controls prevent predator contact; 29% found content or interactions controls should have blocked; 47% had not enabled Account Restrictions; 36% don't use or aren't aware of controls; 66% say real-time alerts about suspicious chat would make them feel safer. [S58]
- Common Sense Media rates Roblox as appropriate for 13+, "potentially OK" for younger children only if account restrictions and active oversight are on. [S69]
- Ofcom (2026): about 25% of children cited Roblox as a source of harmful content; 73% of 11-17s recalled harmful content in four weeks across services; 51% of 8-17s had been asked to verify their age somewhere. [S59]
- Parent controls in Roblox's new model: spend and screen-time limits (until 13), friend list oversight (until 13), game block/allow (until 16), chat settings (until 16), teen-spend notifications for 16-18; chat on Roblox "has never been encrypted" so it can be moderated. [S16, S12]
- Roblox Kids (ages 5-8) and Select (9-15) launched globally 2026-06-16 (pilot: Australia, Indonesia, Netherlands, New Zealand). Catalog about 30,000 games by Q2 2026, "nearly 50% increase since launch." [S12, S1]

### 12. How games get into Kids and Select (creator-side)
- Content maturity labels (set through the Maturity & Compliance Questionnaire): Minimal (occasional mild violence, light unrealistic blood), Mild (repeated mild violence, heavy unrealistic blood, mild fear, mild crude humor), Moderate (moderate violence, light realistic blood, unplayable gambling content), Restricted (strong violence, heavy realistic blood, romantic themes, alcohol, strong language; only age-verified 18+). Minimal and Mild are eligible for Kids (5-8) and Select (9-15); Moderate for Select and 16+; Restricted for 18+ only. Descriptors include Social Hangout, Free-form User Creation, Paid Random Items, Paid Item Trading and AI Interaction. [S17]
- Free-form user creation requires age 16+; social hangouts without private spaces age 16+, with private spaces 18+; primary-theme sensitive issues 16+. Inaccurate labels can lead to label removal, suspension or account action. [S19]
- Kids/Select eligibility (docs and launch posts, partly inconsistent; see Open questions): creator must be age-checked and ID-verified, use two-step verification, and pay a one-time refundable per-game fee or hold an active Roblox Plus/Premium subscription for 2+ months; the experience is trialled with age-checked 16+ "highly engaged" players (250 unique plays in the docs; the later launch post says entry needs 500 highly engaged players and a lower maintenance threshold of 25), then reviewed for safety. Expedited review for professional studios is paid in refundable Robux (50,000 in the docs, 100,000 in the later post). Excluded or restricted content includes social hangouts, free-form drawing and sensitive issues. Track status in the Audience Reach dashboard. [S13, S14, S12, S15]

---

## How to apply it (rules for an AI builder)

### A. Decide the audience before the mechanics
1. **DO state the target age band and the maturity label first**, then derive features from it. Default for an unspecified "fun game": Minimal or Mild, all ages, no free-form chat dependence, no paid randomness. Reason: about 73% of age-checked DAUs are under 18 and a third are under 13. [S1]
2. **DO NOT infer age from the prompt's slang and DO NOT ask players for age, name, school, city or contact details in game.** Roblox's age checks are platform-level; collecting more is a liability under COPPA-type rules. [S46, S47]
3. **DO build for mobile touch first** (about 80% of users access on mobile; most also use another device). Large tap targets, one-thumb controls, no hover-only affordances, text readable on a phone, low reading load. [S8, S65]
4. **DO design three reading levels** (NN/g: pre-readers 3-5, beginner readers 6-8, moderately skilled readers 9-12): icon plus number plus colour first, 1 short sentence second, long text never required to progress. [S65]
5. **DO treat 13-24 as the growth and spend segment** (13+ about two-thirds of DAUs; US 18-34 +42% DAUs YoY) but never design the shop to exploit under-13s to reach them. [S1, S4]
6. **DO plan for a regional audience:** localize strings (Roblox localization tables), avoid idioms, and support a few high-growth markets (Brazil, Indonesia, Philippines, Japan, India) with culturally neutral names and icons. [S1, S20]

### B. Motivation checklist for every game loop (SDT first)
7. **Autonomy:** offer at least two valid ways to progress (e.g. collect, build, fight, trade-free gift) and let the player opt into PvP. Allow skipping tutorials. Do not use fake choices. [S29, S31]
8. **Competence:** show a next goal reachable within 1-2 minutes, always-visible progress bars, clear failure feedback ("you lost 3 hearts to the boss's slam"), and difficulty that adapts after repeated failure. Hits give mastery; clones copy only the number-goes-up. [S29, S31]
9. **Relatedness:** give players a shared objective or a visible group effect (team bonus, co-op boss, group garden). Avoid solo-only loops that make players leave to find friends. [S11, S21]
10. **Rewards for doing, not for showing up:** make the biggest rewards flow from skill or creation (a build, a perfect run, a completed set), and keep login rewards small. [S32]
11. **Cover more than one Quantic cluster per game.** A one-motivation game (pure grinding for Power/Completion) tends to churn; combine it with Design (customisation) or Community (co-op) so a different player type has a reason to stay. [synthesis from S26, S9]

### C. Genre-to-motivation mapping [synthesis, not measured Roblox data]
| Genre (Roblox examples) | Primary Quantic motivations | SDT lever | Bartle verbs | Kids-safe? |
|---|---|---|---|---|
| Simulator / idle (Grow a Garden, Pet Sim) | Completion, Power, Design | Competence (visible growth) | Achieve | Yes, if no paid RNG |
| Roleplay / hangout (Brookhaven, Adopt Me) | Fantasy, Design, Community | Autonomy, relatedness | Socialize, explore | Hangouts are excluded from Kids/Select [S12] |
| Obby / platformer / climbing | Challenge, Excitement, Completion | Competence | Achieve | Yes |
| Tower defense / strategy | Strategy, Power, Community | Competence, relatedness | Achieve, socialize | Yes |
| Horror / escape (Doors, Forsaken) | Excitement, Fantasy, Discovery, Community | Competence, relatedness | Explore, kill (as monster) | Only Minimal/Mild scares |
| Battlegrounds / shooter (Rivals) | Competition, Destruction, Challenge, Excitement | Competence | Kill, achieve | Moderate or higher |
| Social "steal" (Steal a Brainrot) | Competition, Destruction (theft), Completion | Competence, relatedness | Kill, achieve | Needs care: loss feelings, spectacle, spending |
| Fashion / contest (Dress to Impress) | Design, Competition, Community | Autonomy | Socialize, explore | Yes |
| Survival co-op (99 Nights) | Challenge, Community, Discovery | Competence, relatedness | Explore, socialize | Mild fear |
| Tycoon / builder | Power, Strategy, Design, Completion | Autonomy, competence | Achieve | Yes |

### D. Age-band design guide [E = from sources above, I = inference]
12. **5-8 (Roblox Kids):** chat off; mostly Minimal/Mild; they play on tablets and phones; need pictures and sound over text, forgiving controls, no loss states that feel punishing, no shop pressure. 41% of Australian 6-7s play Roblox, 66% of 8-9s. [E: S7, S12; I for the rest]
13. **9-12:** the peak penetration group (66-70% of Australian 8-13s). Want collecting, pets, roleplay, obbies and simple shooters or fighters (boys), fashion and party (girls), shared status and avatar identity. Highest peer-pressure risk around skins and limited items. [E: S7, S52, S50]
14. **13-15:** adventure, social competition, horror and trend titles; chat with similar ages; heavy sensitivity to fairness and to being seen as "bot" or "noob". Good time for opt-in PvP and ranked ladders, but no paid power. [E partly: S11, S39; I]
15. **16-17:** want autonomy and respect, more mature themes at Moderate; are targets of "pay to progress" patterns; sleep impact rises with daily play (41% of teens say it hurts sleep), so offer natural stopping points. [E: S11]
16. **18-24 (fastest growing, highest spend):** want depth: competition, collection completion, builds, social status; tolerate more complexity and mature labels. Competition appeal declines with age, completion and fantasy rise. [E: S1, S26]
17. **25+:** smaller but growing; Quantic data suggests more Completion, Fantasy, Strategy and less Excitement and Competition. [E: S26 summaries; I for Roblox]

### E. Fairness and monetization rules
18. **DO sell:** cosmetics (avatar items, skins, effects, trails), emotes, pet visual variants, plots/housing decoration, private servers, one-time server events, and time-skips that also have a free path. **DO NOT sell:** damage, speed, survivability, aim assist, ranked advantages, or anything that wins fights. [S39, S40, S41, S42]
19. **DO publish the free path:** if a gamepass multiplies earnings (2x coins), show how long the same unlock takes without it and keep it under a day or a few sessions for core content; keep PvP on identical stats. [synthesis from S39, S40]
20. **DO make prices honest:** show the Robux price at the point of prompt; avoid a second premium currency that hides cost; no fake "was/now" prices; no countdown timers on repeating offers; no purchase prompt immediately after death or a loss; no near-miss reel animations. These are the patterns found in 14 of 15 games tested. [S53, S50, S36]
21. **Paid random items default OFF.** If the prompt demands gacha, include: (a) probabilities as exact percentages summing to 100% with a labelled "Details" button, (b) a `PolicyService:GetPolicyInfoForPlayerAsync` check that hides, replaces or blocks purchase when `ArePaidRandomItemsRestricted` is true, (c) pity or luck-boost items disclosed as random items, (d) no paid trading unless `IsPaidItemTradingAllowed`, (e) no age under 13 targeting. Free earned rolls are fine. [S18, S19, S45, S60]
22. **DO add a purchase throttle** (server cooldown between prompts) and a confirm step that shows item and Robux price in plain words. Epic's one-press purchase triggers were an FTC dark pattern. [S43]
23. **DO keep soft currency generosity visible:** earn rates that let a free player buy the main cosmetic goals in a bounded number of sessions; show them. Paying players should skip waiting, not skill. [synthesis]
24. **DO NOT use "FOMO" scaffolding on young audiences:** limited-time items are allowed for events, but announce the end date and bring items back, or make them earnable later; no streak that punishes absence. [S50, S52, S47]
25. **Reward engagement honestly:** Creator Rewards means a game can earn from time well spent; do not add artificial friction to inflate playtime. [S68]

### F. Social design rules
26. **DO design co-play first**: invite prompt, friends-in-server, private servers (`game.PrivateServerId`), shared goals, a visible "party bonus," and a way to rejoin friends. Intentional co-play days are a discovery signal. [S21, S71]
27. **DO NOT depend on free text.** Many players cannot chat with each other by age band. Provide pings, emotes, preset phrases, markers on the map, simple "I need help" signals, and shared progress meters. [S25, S24, S1]
28. **DO filter all player-written text** (pet names, signs, plot names) with `TextService:FilterStringAsync` and display only the filtered result. [Roblox filtering requirement; see file 04 for details]
29. **DO build safe-by-default grouping**: match by server size, not by free-form private chat; use friends-only options for under-13 lobbies where possible. [S12, S24]
30. **Anti-harassment:** mute/report friction low, no public rankings of "worst" players, no kill-cam taunts, no tea-bagging emotes. Harassment is the top negative experience (41% called names). [S11, S66]
31. **Respect the avatar:** do not force a custom character over the player's avatar unless the game needs it; add layered cosmetics instead. Expression is a top motivation (47% creativity, 38% identity). [S20, S37]

### G. Ethics and privacy rules
32. **DO NOT** collect personal info, link to off-Roblox sites, ask for social handles, or send player identifiers to third-party servers with HttpService. Social links visibility is moving to 16+ (2026-06-30). [S14, S46]
33. **DO set chat/communication affordances to the lowest-risk defaults** and rely on Roblox's own systems for chat; never build a custom DM system. [S43, S16]
34. **DO set the maturity label honestly** and avoid descriptors (hangouts, free-form creation, sensitive issues) if the game should reach Kids and Select. [S17, S19]
35. **DO include session-friendly design:** a natural break every 5-15 minutes (end-of-round, "Come back later" save point), and optional break reminders (pro-wellbeing nudge allowed by the ICO code). Never use "you'll lose progress if you leave." [S47, S11]
36. **DO make failure gentle for under-13s:** no permanent loss of purchased items, no "your pet is sad because you left" guilt copy. [S50, S47]
37. **Age-assurance reality:** Roblox sets the age band; the game receives no age value; design for policy flags (PolicyService) instead of reading age. [S25, S18]

---

## Recipes (each becomes a skill)

### Recipe 1: Audience and label brief (run before building)
When to use: first step of any new game.
Steps:
1. Parse the prompt for genre, tone, violence, scary elements, social features.
2. Pick the primary age band: 5-8, 9-12, 13-15, 16-17, 18+; default 9-15 (Select-compatible) when unspecified.
3. Choose the target label: Minimal for obby/sim/tycoon with no combat; Mild for cartoon combat or light scares; Moderate for realistic guns/horror; avoid Restricted unless the prompt demands.
4. List excluded features for that label: for Kids/Select targets exclude social hangouts, free-form drawing/creation, sensitive-issue themes, paid random items.
5. Write a one-line "audience contract" in the project notes (age band, label, chat assumption: none, monetization class: cosmetic/time-skip).
Pitfalls: choosing Moderate because "teens like violence" (this loses Kids/Select eligibility and half the youth audience); using slang-heavy text that younger readers cannot parse.

### Recipe 2: Motivation audit of a game loop
When to use: after drafting a loop, before building.
Steps:
1. Fill a 3x3 table: autonomy/competence/relatedness vs "what the player does in the first 60 seconds / first 10 minutes / by day 7".
2. Fill Quantic clusters: mark which of Action, Social, Mastery, Achievement, Immersion, Creativity the loop serves; require at least 2.
3. If relatedness is empty, add one co-op element (shared meter, team boss, gift).
4. If autonomy is empty, add a choice (route, build, loadout cosmetic, difficulty toggle).
5. If competence feedback is empty, add progress bars and explicit numeric feedback.
Pitfalls: counting a leaderboard as relatedness (it is competition); counting forced timers as challenge.

### Recipe 3: Fair monetization catalog
When to use: designing the shop and passes.
Steps:
1. List everything for sale; mark each as Cosmetic, Convenience, Time-skip, Power.
2. Delete or redesign every Power item (no stat boost in PvP; in PvE make it available through play).
3. For each Convenience/Time-skip item, record the free alternative and its time cost.
4. Put Robux prices on the item card; no second currency purchasable with Robux unless the Robux-per-unit rate is displayed.
5. Make the shop opt-in: opened by a button, never auto-popup on death, loss, or join. A single, dismissible "new item" badge is acceptable.
6. Add a catalog test: no product ID description contains "win", "damage", "stronger" for PvP experiences.
Pitfalls: selling "2x luck" or "2x speed" in a competitive mode (it is pay-to-win); copying fake-discount banners from top games (the Sydney study flags them).

### Recipe 4: Purchase confirm and throttle
When to use: any Robux product.
Steps:
1. Client UI: a Frame with item name, image, Robux price and two buttons (Buy / Not now). No pre-selected buy button.
2. Client fires a RemoteEvent with only a product key string.
3. Server validates the key against a table, applies a cooldown (example 5 seconds), then calls `MarketplaceService:PromptProductPurchase`.
4. `ProcessReceipt` grants items idempotently (see file 04).
5. Never prompt from a death or loss handler.
Pitfalls: trusting client-sent product IDs; letting the buy button sit under the jump or attack button on mobile (accidental purchases are the Epic FTC pattern).

### Recipe 5: Disclosed random reward (free) and gated paid version
When to use: egg hatching, crates, spins.
Steps:
1. Define entries with integer weights summing to 100000 so odds are exact to three decimals.
2. Free version: earned by playing; display odds on the egg/crate card.
3. Paid version (only when the brief demands): server calls PolicyService; if restricted, hide the paid option and offer a free or deterministic alternative.
4. Add a labelled "Details" button (the word is required, not just an icon) listing every outcome and exact percentage; update remaining odds for one-time outcomes.
5. Disclose pity/luck items as random items in the same panel.
6. Add a daily soft cap on paid opens in a session (example: confirmation after every 10 opens) and no animation that shows near-misses.
Pitfalls: odds shown only after purchase; outcomes that sum to 99.99%; luck boosts with undisclosed effect; trading paid outcomes without `IsPaidItemTradingAllowed`.

### Recipe 6: Gentle daily reward
When to use: retention without guilt.
Steps:
1. Store lastClaimDay (UTC day number) and streak per player.
2. Claim grants a small reward; streak adds a capped bonus (example cap 7 days).
3. Missing a day with a one-day grace keeps the streak; a longer gap halves it rather than zeroing.
4. Show "come back tomorrow" calmly; no countdown banner or loss warning.
5. Never gate core content behind streaks.
Pitfalls: "lose everything if you skip" messaging; paid streak-restore products (monetizes anxiety); making the daily reward larger than a normal session's reward.

### Recipe 7: Co-op loop without chat
When to use: any multiplayer game.
Steps:
1. Provide a shared objective with a shared progress bar visible to all.
2. Add a ping wheel (4-6 icons: Help, Here, Danger, Thanks, Follow, Good job) using a RemoteEvent with a server-side whitelist and per-player rate limit.
3. Add emotes (Roblox emote wheel) and preset Quick Words if available for your experience.
4. Add an invite button (SocialService invite prompt) in the lobby and after a win.
5. Add a friend or party bonus (small, never required) shown in the lobby.
6. Keep voice and text optional; no gameplay requirement to communicate.
Pitfalls: puzzles that need exact verbal coordination; ping spam without rate limits.

### Recipe 8: First-minute onboarding for mixed ages
When to use: any game's FTUE.
Steps:
1. Show control hints as icons and a 3-6 word caption; no paragraph modals.
2. Make the first reward appear within 20-30 seconds (sound, particles, number pop).
3. Teach one verb at a time; unlock the second verb after the first success.
4. Provide a visible "next goal" arrow or icon.
5. End the first session around the 5-10 minute mark with a clear reason to return (new pet to hatch, plot to expand).
6. Provide a skip for returning players.
Pitfalls: long text, forced waiting timers, or a shop prompt in the first minute.

### Recipe 9: Kids and Select readiness check
When to use: when the brief says "kid friendly" or "all ages."
Steps:
1. Label Minimal or Mild in the maturity questionnaire; remove Social Hangout, Free-form User Creation, Sensitive Issues, Paid Random Items descriptors.
2. Remove external-link prompts and user-generated drawing.
3. Ensure all text is filtered and no chat-dependent mechanic exists.
4. Confirm creator-side prerequisites for the owner (ID verification, two-step verification, fee or subscription) and list them for the owner in the handoff.
5. Remind the owner the experience must earn qualifying plays from highly engaged age-checked 16+ users before it appears; track in the Audience Reach dashboard.
Pitfalls: promising Kids/Select placement (not guaranteed; thresholds changed in 2026); adding a hangout lobby late.

### Recipe 10: Expression and collection layer
When to use: to broaden appeal beyond competition.
Steps:
1. Offer layered accessory cosmetics (earnable and purchasable) that work with the player's avatar.
2. Add an in-game "wardrobe" or plot decoration station; save a loadout.
3. Give emotes unlocked by play (a full range: happy, sad, angry, celebrate).
4. Add collection pages with silhouettes for missing items; completion rewards are cosmetic.
5. Add a photo-spot or showcase area; no ranking of "best-dressed" shown to under-13s as a public leaderboard.
Pitfalls: hiding all good cosmetics behind Robux (the Norway study shows exclusion), public "poor" shaming through visible price tiers.

### Recipe 11: Pay-to-win and dark-pattern self-audit (lint)
When to use: before handoff.
Steps:
1. Grep product descriptions and scripts for stat modifiers sold in PvP modes.
2. Check every purchase prompt site; none may run after death, loss, or join.
3. Check no "limited time" countdown loops that reset every day.
4. Check no fake reference pricing: any crossed-out price must have been real.
5. Check the soft-to-Robux conversion is displayed.
6. Check paid random items obey Recipe 5.
7. Check session pacing: a natural stop every 5-15 minutes.
8. Check chat-independence.
Pitfalls: auditing only the shop UI and missing a pet-egg billboard in the world.

---

## Luau reference snippets

Exact odds table (integer weights summing to 100000, so percentages print exactly):
```lua
--!strict
type Entry = { id: string, weight: number }

local entries: {Entry} = {
	{ id = "Common", weight = 70000 },
	{ id = "Uncommon", weight = 22000 },
	{ id = "Rare", weight = 7000 },
	{ id = "Legendary", weight = 1000 },
}

local rng = Random.new()

local function totalWeight(list: {Entry}): number
	local total = 0
	for _, e in list do
		total += e.weight
	end
	return total
end

local function roll(list: {Entry}): string
	local r = rng:NextNumber() * totalWeight(list)
	local acc = 0
	for _, e in list do
		acc += e.weight
		if r < acc then
			return e.id
		end
	end
	return list[#list].id
end

local function oddsLines(list: {Entry}): {string}
	local total = totalWeight(list)
	local lines = {}
	for _, e in list do
		table.insert(lines, string.format("%s: %.3f%%", e.id, e.weight / total * 100))
	end
	return lines
end
```

Policy gate for paid random items (server, fail closed):
```lua
local PolicyService = game:GetService("PolicyService")

local function paidRandomAllowed(player: Player): boolean
	local ok, info = pcall(function()
		return PolicyService:GetPolicyInfoForPlayerAsync(player)
	end)
	if not ok then
		return false
	end
	return (info :: any).ArePaidRandomItemsRestricted == false
end
```

Server-side purchase throttle (client sends a key; server owns product IDs):
```lua
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local requestPurchase = ReplicatedStorage:WaitForChild("RequestPurchase") :: RemoteEvent
local PRODUCT_IDS: { [string]: number } = {} -- fill with real developer product IDs
local MIN_GAP = 5 -- seconds between prompts per player (example value)
local lastPrompt: { [Player]: number } = {}

requestPurchase.OnServerEvent:Connect(function(player: Player, key: unknown)
	if typeof(key) ~= "string" then
		return
	end
	local productId = PRODUCT_IDS[key]
	if not productId then
		return
	end
	local now = os.clock()
	if now - (lastPrompt[player] or -math.huge) < MIN_GAP then
		return
	end
	lastPrompt[player] = now
	MarketplaceService:PromptProductPurchase(player, productId)
end)

Players.PlayerRemoving:Connect(function(player: Player)
	lastPrompt[player] = nil
end)
```

Gentle daily reward (pure function; persist the state with DataStore per file 04):
```lua
--!strict
local DAY = 86400
local GRACE_DAYS = 1
local STREAK_CAP = 7

export type DailyState = { lastClaimDay: number, streak: number }

local function claim(state: DailyState, nowUnix: number): (DailyState, number)
	local today = math.floor(nowUnix / DAY)
	if today == state.lastClaimDay then
		return state, 0 -- already claimed today
	end
	local gap = today - state.lastClaimDay
	local streak = state.streak
	if gap <= 1 + GRACE_DAYS then
		streak += 1
	else
		streak = math.max(1, math.floor(streak / 2)) -- soften, do not zero
	end
	local reward = 50 + 10 * math.min(streak, STREAK_CAP) -- example numbers, not sourced
	return { lastClaimDay = today, streak = streak }, reward
end
```

Invite button (LocalScript; pattern from Roblox's invite-prompt docs):
```lua
local SocialService = game:GetService("SocialService")
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function canInvite(): boolean
	local ok, can = pcall(function()
		return SocialService:CanSendGameInviteAsync(player)
	end)
	return ok and can
end

-- call from a button's Activated handler
local function onInviteClicked()
	if canInvite() then
		SocialService:PromptGameInvite(player)
	end
end
```

Ping whitelist with rate limit (server):
```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local pingEvent = ReplicatedStorage:WaitForChild("Ping") :: RemoteEvent
local ALLOWED: { [string]: boolean } = { Help = true, Here = true, Danger = true, Thanks = true }
local last: { [Player]: number } = {}

pingEvent.OnServerEvent:Connect(function(player: Player, kind: unknown, position: unknown)
	if typeof(kind) ~= "string" or not ALLOWED[kind] then return end
	if typeof(position) ~= "Vector3" then return end
	local now = os.clock()
	if now - (last[player] or -math.huge) < 1.5 then return end
	last[player] = now
	pingEvent:FireAllClients(player, kind, position)
end)
```

Filtering a player-written name (server):
```lua
local TextService = game:GetService("TextService")

local function filteredName(raw: string, fromUserId: number): string?
	local ok, result = pcall(function()
		return TextService:FilterStringAsync(raw, fromUserId)
	end)
	if not ok then return nil end
	local ok2, text = pcall(function()
		return result:GetNonChatStringForBroadcastAsync()
	end)
	return if ok2 then text else nil
end
```

---

## Open questions / unverified
- **Age data caveat:** age-checked mix is extrapolated and only 57% of DAUs are checked; no Roblox genre-by-age data is public. All per-genre age claims here are inferences or from Roy Morgan (Australia, 6-13 only).
- **Device split:** Roblox does not publish hours by device in the filings I could read; the "72/25/3" figure is unverified; Newzoo's "about 80% mobile access" is a third-party digest.
- **Regional mix:** the 10-K percentages came through a summariser of the filing; verify against the table. A stockanalysis-style Q4 2025 regional dataset I saw adds to far more than 144M DAUs and was discarded.
- **Gender:** no Roblox-published gender data since the older Creator Hub tables; Apptopia is US mobile only and its quarter label in the snippet ("Q3") should be re-checked against its date.
- **Quantic Foundry:** pages were blocked (HTTP 403); findings come from search summaries of their 2015-2025 posts and reports. Their 2025 "Evolution of Play" report details were not read.
- **Bartle proportions:** the 80/10/10/<1 split is commonly repeated; treat as Bartle's illustrative balance, not measured data.
- **Kids/Select thresholds:** creator docs say 250 unique highly engaged plays and 50,000 Robux expedited review; the later launch post says 500 and 100,000 and lowers the maintenance threshold from 100 to 25. Treat the later post as current but re-check Creator Hub. The age range for Kids is given as 5-8 in most sources and as 5-9 in a TechCrunch summary. The Roblox Plus price ($4.99/month) is from a TechCrunch summary, not a Roblox doc.
- **Litigation:** the list of states, MDL count (115+) and "no settlements yet" come from law-firm marketing pages and conflict with the April 2026 three-state settlement; treat counts as approximate.
- **Fairplay's "30+ million under-13 daily users" and "$3.6 billion 2024 revenue"** are advocacy claims.
- **Hindenburg 2024 allegations** (inflated metrics 25-42%) were disputed by Roblox and are not established.
- **Regional bans:** per-country dates come from a Wikipedia-derived search summary and news; individually unverified.
- **Ofcom 2026 figures:** read through a trade-press summary because the PDF returned 403.
- **IsFriendsWith status:** a docs summariser reported `Player:IsFriendsWith` as deprecated; I did not use it. Check the API reference before building friend bonuses (see file 04).
- **PolicyService fields:** only `ArePaidRandomItemsRestricted` and `IsEligibleToPurchaseCommerceProduct` are shown on the class page; `IsPaidItemTradingAllowed` is named in the paid-random-items doc. Confirm the full field list before shipping.
- **Legal advice:** nothing here is legal advice. COPPA applicability to third-party developers on a platform operated by Roblox is not settled in these sources.
- **Reward-undermining effect** (Deci 1999) has contested subsequent literature; applied here as a design caution, not a law.

---

## Sources
[S1] Roblox Q2 2026 Earnings Shareholder Letter (SEC 8-K ex. 99.1), Roblox Corp, 2026-07-30 (approx.), https://www.sec.gov/Archives/edgar/data/0001315098/000162828026051059/ex991-robloxq22026earnin.htm
[S2] Roblox Q1 2026 Earnings Shareholder Letter (SEC 8-K), Roblox Corp, 2026, https://www.sec.gov/Archives/edgar/data/0001315098/000162828026028882/ex991-q12026earningsshar.htm
[S3] Roblox Q4 and FY2025 Shareholder Letter (SEC 8-K), Roblox Corp, 2026-02, https://www.sec.gov/Archives/edgar/data/1315098/000131509826000009/ex991-q42025shareholder.htm
[S4] Roblox Q3 2025 Shareholder Letter (SEC 8-K), Roblox Corp, 2025-10, https://www.sec.gov/Archives/edgar/data/1315098/000131509825000326/ex991-q32025shareholderl.htm
[S5] Roblox Form 10-K for FY2025, Roblox Corp, 2026-02, https://www.sec.gov/Archives/edgar/data/1315098/000131509826000024/rblx-20251231.htm
[S6] Female WAUs now outnumber male users on Roblox mobile, Apptopia (third-party), 2026, https://apptopia.com/en/insights/female-waus-now-outnumber-male-users-on-roblox-mobile/
[S7] Roblox for Young Australians (Young Australian Survey, April-December 2025), Roy Morgan, 2025-12, https://www.roymorgan.com/findings/10136-yas-roblox-for-young-australians-survey-december-2025
[S8] Newzoo: Roblox as a Platform in 2025, via Game Developer Reports (Substack) (third-party digest), 2025, https://gamedevreports.substack.com/p/newzoo-roblox-as-a-platform-in-2025
[S9] Analysis: Player motivations in Roblox, Fortnite and Candy Crush Saga (GameRefinery data), PocketGamer.biz, 2020-06-29 (pre-2024), http://www.pocketgamer.biz/data-and-research/73754/player-motivations-roblox-fortnite-candy-crush-saga/
[S10] DECA and Piper Sandler Complete 49th Semi-Annual Survey, DECA Direct / Piper Sandler, 2025-04-16, https://www.decadirect.org/articles/deca-and-piper-sandler-complete-49th-semi-annual-survey
[S11] Teens and Video Games Today, Pew Research Center, 2024-05-09, https://www.pewresearch.org/internet/2024/05/09/teens-and-video-games-today/
[S12] Age-Based Roblox Kids and Select Accounts Now Globally Available, Roblox newsroom, 2026-06-16, https://about.roblox.com/newsroom/2026/06/age-based-roblox-kids-and-select-accounts-now-globally-available
[S13] Roblox Kids and Select (creator docs), Roblox Creator Hub, 2026, https://create.roblox.com/docs/production/publishing/kids-and-select.md
[S14] Roblox Kids and Select Global Launch: Upcoming Updates to Eligibility, Ads Manager, and Expedited Review, Roblox DevForum announcement, 2026, https://devforum.roblox.com/t/roblox-kids-and-select-global-launch-upcoming-updates-to-eligibility-ads-manager-and-expedited-review/4685717
[S15] Roblox introduces Kids and Select accounts for age-appropriate access to games and chat, TechCrunch, 2026-04-13, https://techcrunch.com/2026/04/13/roblox-introduces-kids-and-select-accounts-for-age-appropriate-access-to-games-and-chat/
[S16] What Families Need to Know About Roblox's New Age-Based Protections, Roblox newsroom, 2026-05, https://about.roblox.com/newsroom/2026/05/what-families-should-know-roblox-kids-select
[S17] Content Maturity, Roblox Creator Hub docs, 2026, https://create.roblox.com/docs/production/promotion/content-maturity
[S18] Paid random items policy guidelines, Roblox Creator Hub docs, 2026, https://create.roblox.com/docs/production/monetization/paid-random-items
[S19] Experience guidelines, Roblox Creator Hub docs, 2026, https://create.roblox.com/docs/production/promotion/experience-guidelines
[S20] The 2025 Roblox Replay: Decoded Through Search and Style (with Ipsos Digital Expression survey), Roblox newsroom, 2025-12, https://about.roblox.com/newsroom/2025/12/roblox-replay-decoded-search-style
[S21] Discovery, Roblox Creator Hub docs, 2026, https://create.roblox.com/docs/discovery
[S22] Why Roblox's New Discovery Algorithm Favors Games That Bring Friends Together, Stephen Dypiangco / Max Power Gaming (third-party), 2025, https://www.maxpowergaming.co/post/why-roblox-s-new-discovery-algorithm-favors-games-that-bring-friends-together
[S23] Roblox is adding emojis, custom quick words, and voice calling to its in-game chat (RDC 2026), GamesBeat, 2026-09-11, https://gamesbeat.com/roblox-is-adding-emojis-custom-quick-words-and-voice-calling-to-its-in-game-chat-rdc-2026/
[S24] Expanding Trusted Friends, Roblox newsroom, 2026-04-02, https://about.roblox.com/newsroom/2026/04/expanding-trusted-friends
[S25] Roblox rolls out facial age estimation for chat access globally, Biometric Update, 2026-01, https://www.biometricupdate.com/202601/roblox-rolls-out-facial-age-estimation-for-chat-access-globally
[S26] Quantic Foundry posts: As Gamers Age, The Appeal of Competition Drops The Most (2016-02-10); Gender Differences in Gaming Motivations (2015-08-28); 7 Things About Primary Gaming Motivations (2016-12-15); Age Report and Evolution of Play (2025). Nick Yee and Nic Ducheneaut. Pages returned 403; used search summaries. https://quanticfoundry.com/2016/02/10/gamer-generation/ , https://quanticfoundry.com/age-report/
[S27] Bartle taxonomy of player types, Wikipedia (summarising Bartle 1996 and Bartle 2003), accessed 2026-10-04, https://en.wikipedia.org/wiki/Bartle_taxonomy_of_player_types
[S28] Motivations for Play in Online Games, Nick Yee, CyberPsychology & Behavior 9(6), 2006 (pre-2024), via https://eclass.uniwa.gr/modules/document/file.php/EEE195/2023-2024/Online%20gaming%20addiction/yee%202006.pdf
[S29] A Motivational Model of Video Game Engagement, Przybylski, Rigby and Ryan, Review of General Psychology, 2010, https://pure.ewha.ac.kr/en/publications/a-motivational-model-of-video-game-engagement/
[S30] The Motivating Role of Violence in Video Games, Przybylski, Ryan and Rigby, Personality and Social Psychology Bulletin, 2009, https://selfdeterminationtheory.org/wp-content/uploads/2014/04/2009_PrzbylskiRyanRigby_PSPB-1.pdf
[S31] Why do we really play?, Fabian Fischer, Game Developer, 2014-11-04, https://www.gamedeveloper.com/design/why-do-we-really-play-
[S32] A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation, Deci, Koestner and Ryan, Psychological Bulletin, 1999 (pre-2024), https://pmc.ncbi.nlm.nih.gov/articles/PMC2731358/
[S33] Digital screen time limits and young children's psychological well-being / "Goldilocks" study, Przybylski and Weinstein, Psychological Science, 2017 (pre-2024), https://orca.cardiff.ac.uk/id/eprint/99720
[S34] Groundbreaking new study says time spent playing video games can be good for your wellbeing, Oxford Internet Institute, 2021, https://www.oii.ox.ac.uk/groundbreaking-new-study-says-time-spent-playing-video-games-can-be-good-for-your-wellbeing/
[S35] Dark Patterns in the Design of Games, Zagal, Björk and Lewis, Chalmers research portal, 2013 (pre-2024), https://research.chalmers.se/en/publication/177148
[S36] Level Up or Game Over: Exploring How Dark Patterns Shape Mobile Games, Niknejad, Mildner, Zargham, Putze and Malaka, arXiv, 2024, https://arxiv.org/html/2412.05039v1
[S37] Understanding Children's Avatar Making in Social Online Games, Yue Fu et al., arXiv, 2025, https://arxiv.org/abs/2502.18705
[S38] Leveling Up Together: Fostering Positive Growth and Safe Online Spaces for Teen Roblox Developers, Choi, Choi and Seering, arXiv, 2025-02-25, https://arxiv.org/abs/2502.18120
[S39] Pay to Win or Pay to Cheat: How Players of Competitive Online Games Perceive Fairness of In-Game Purchases, Freeman, Wu, Nower and Wohn, Proc. ACM HCI 6 (CHI PLAY), 2022, https://yvettewohn.com/wp-content/uploads/2022/12/2022_chiplay.pdf
[S40] Ways to make game feel less predatory or "pay-to-win", afar5 and replies, Roblox DevForum, 2022-05-12, https://devforum.roblox.com/t/ways-to-make-game-feel-less-predatory-or-%E2%80%9Cpay-to-win%E2%80%9D/1789006
[S41] Roblox Games - Pay to win?, Roblox DevForum, 2020-06-14 (pre-2024), https://devforum.roblox.com/t/roblox-games-pay-to-win/625451
[S42] RIVALS: How Roblox's Top Shooter Built a Nearly Million-Player Empire, RoWatcher (third-party), 2026, https://rowatcher.com/news/rivals-how-roblox-s-top-shooter-built-a-nearly-million-player-empire
[S43] Fortnite video game maker Epic Games to pay more than half a billion dollars over FTC allegations, FTC press release, 2022-12-19 (pre-2024), https://www.ftc.gov/news-events/news/press-releases/2022/12/fortnite-video-game-maker-epic-games-pay-more-half-billion-dollars-over-ftc-allegations
[S44] 6 Top Takeaways from the FTC's $520 Million Landmark Epic Games Settlements, Orrick, 2023-02, https://www.orrick.com/Insights/2023/02/6-Top-Takeaways-from-FTCs-Landmark-Epic-Games-Settlements
[S45] Cognosphere agrees to pay $20 million to resolve FTC complaint over Genshin Impact, WN Hub / Mondaq summary, 2025-01, https://wnhub.io/news/investment/item-46840
[S46] FTC finally publishes amended COPPA Rule; compliance deadlines set, Ashurst Perkins Coie, 2025-04, https://www.ashurstperkinscoie.com/en/insights/ftc-finally-publishes-amended-coppa-rule-compliance-deadlines-set/
[S47] Age Appropriate Design Code (Children's Code), UK ICO, including standard 13 Nudge techniques and standard 3 Age appropriate application, https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/
[S48] Children's online privacy in mobile games under spotlight, UK ICO, 2025-12-01, https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2025/12/children-s-online-privacy-in-mobile-games-under-spotlight/
[S49] Updated Disrupted Childhood: The cost of persuasive design, 5Rights Foundation, 2023-04-11, https://5rightsfoundation.com/resource/updated-report-disrupted-childhood-the-cost-of-persuasive-design/
[S50] New research reveals how children face financial harm online (Ofcom-commissioned), 5Rights Foundation, 2025-07-30, https://5rightsfoundation.com/new-research-reveals-how-children-face-financial-harm-online/
[S51] Children's gambling fears, Children's Commissioner for England, 2019-10-22 (pre-2024), https://www.childrenscommissioner.gov.uk/news/childrens-gambling-fears/
[S52] Buying popularity: how children are influenced by in-game spending, SIFO / OsloMet (Reich and Steinnes), 2025-01, https://www.oslomet.no/en/research/featured-research/buying-popularity-how-children-are-influenced-by-in-game-spending
[S53] Inside the pay-to-play world of Roblox targeting children (Misleading and Deceptive Monetisation in Roblox), University of Sydney, 2026-05-17, https://www.sydney.edu.au/news-opinion/news/2026/05/17/inside-the-pay-to-play-world-of-roblox-targeting-children-.html ; ACS Information Age, 2026-05-19, https://ia.acs.org.au/article/2026/roblox-sucking-up-money-from-young-players--study.html
[S54] Investigate Roblox for Harming Kids, Advocacy Groups Urge FTC, Fairplay, 2026-05-20, https://fairplayforkids.org/investigate-roblox-for-harming-kids-advocacy-groups-urge-ftc/
[S55] Roblox Settles With Three States For $35.8 Million Over Child Safety, Insurance Journal, 2026-04-23, https://www.insurancejournal.com/news/southeast/2026/04/23/866879.htm
[S56] Roblox Faces Growing Legal Scrutiny Over Child Safety Concerns, Carlson Attorneys (law-firm page, third-party), 2026, https://www.carlsonattorneys.com/roblox-lawsuit-over-child-safety-concerns/ ; Roblox Lawsuit: MDL, AG Suits, Settlements, CourtDocket, https://courtdocket.org/roblox-lawsuit-mdl-ag-suits-settlements-and-investigations/
[S57] Hindenburg Research Roblox report: inflated DAU and child safety, Game World Observer, 2024-10-09, https://gameworldobserver.com/2024/10/09/hindenburg-research-roblox-report-inflated-dau-child-safety
[S58] Parents say Roblox parental controls aren't enough (A Case for Women / Pollfish survey, n=1,000, December 2025), Stacker via KVIA, 2026-02-20, https://kvia.com/stacker-parenting-family/2026/02/20/parents-say-roblox-parental-controls-arent-enough-what-new-data-reveals/
[S59] Children and Parents: Media Use and Attitudes Report, Ofcom, 2026-05-21; via Ofcom warns children remain exposed to online safety risks across platforms including Roblox, TikTok and YouTube, PocketGamer.biz, https://www.pocketgamer.biz/ofcom-warns-children-remain-exposed-to-online-safety-risks-across-platforms-including-roblox-tiktok-and-youtube/ ; Ofcom passive-measurement figures (2025-06-27) via search summary, https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/research-statistics-and-data/protecting-children/ofcom-childrens-passive-online-measurement.pdf
[S60] EU CPC Network Key Principles on in-game virtual currencies (March 2025) and Star Stable action, European Commission, 2025, https://commission.europa.eu/news/european-commission-hosts-stakeholders-talks-application-cpc-networks-key-principles-games-virtual-2025-06-03_en ; summary: https://cryptonews.net/news/legal/33524923/
[S61] Digital Fairness Act: consultation and call for evidence, Slaughter and May, 2025-2026, https://thelens.slaughterandmay.com/post/102kxp5/digital-fairness-act-european-commission-launches-consultation-and-call-for-evid
[S62] European Commission guidelines on protection of minors under the DSA, Taylor Wessing, 2025-07, https://www.taylorwessing.com/en/insights-and-events/insights/2025/07/rd-european-commission-guidelines-on-protection-of-minors-under-the-digital-services-act
[S63] Roblox commits to lift game to protect kids from online grooming under Australia's online safety codes, eSafety Commissioner, 2025, https://esafety.gov.au/newsroom/media-releases/roblox-commits-to-lift-game-to-protect-kids-from-online-grooming-under-australias-world-leading-online-safety-codes-and-standards
[S64] Child rights and online gaming: opportunities and challenges for children and the industry, UNICEF, 2019-12 (pre-2024), https://www.unicef.org/childrightsandbusiness/reports/child-rights-and-online-gaming-opportunities-challenges-children-and-industry
[S65] Designing for Children, Nielsen Norman Group (age bands 3-5, 6-8, 9-12), https://www.nngroup.com/videos/designing-children/
[S66] Disruption and Harms in Online Gaming Framework, Fair Play Alliance and ADL, 2020-12 (pre-2024), https://thrivingingames.org/wp-content/uploads/2020/12/FPA-Framework.pdf
[S67] Roblox access restored in Russia, Roblox newsroom, 2026-06; Censorship of Roblox, Wikipedia, accessed 2026-10-04, https://about.roblox.com/newsroom/2026/06/roblox-access-restored-in-russia ; https://en.wikipedia.org/wiki/Censorship_of_Roblox
[S68] Engagement-based payouts / Creator Rewards, Roblox Creator Hub and MediaPost coverage, 2025-06 to 2025-07, https://create.roblox.com/docs/en-us/production/monetization/engagement-based-payouts.md ; https://www.mediapost.com/publications/article/406941/roblox-to-reward-creators-for-attracting-players.html
[S69] Roblox review, Common Sense Media, https://www.commonsensemedia.org/website-reviews/roblox
[S70] Common Sense Census: Media Use by Kids Zero to Eight, 2025 (screen time by age), and 2021 tweens and teens census (pre-2024), https://www.commonsensemedia.org/sites/default/files/research/report/8-18-census-integrated-report-final-web_0.pdf
[S71] Player invite prompts, Roblox Creator Hub docs, 2026, https://create.roblox.com/docs/production/promotion/invite-prompts
[S72] PolicyService.GetPolicyInfoForPlayerAsync, Roblox Creator Hub API reference, https://create.roblox.com/docs/reference/engine/classes/PolicyService
[S73] Roblox Experiences for People 17 and Older announcement, Roblox newsroom, 2023-06 (pre-2024, superseded by the 2026 maturity labels), https://about.roblox.com/newsroom/2023/06/introducing-experiences-for-people-17-and-older
[S74] The Roblox user base, Roblox Creator Hub (Q2 2022 snapshot, stale), https://create.roblox.com/docs/production/roblox-user-base
[S75] Roblox user demographics and usage trends in 2025, Techpoint Africa (third-party compilation; cites older Creator Hub tables, stale and unreliable), https://techpoint.africa/guide/roblox-user-demographics/
[S76] Meta-analysis of the relationship between problem gambling, excessive gaming and loot box spending, Zendle and others, 2021 (pre-2024), https://www.researchgate.net/publication/351107695_Meta-analysis_of_the_relationship_between_problem_gambling_excessive_gaming_and_loot_box_spending ; Adolescents and loot boxes: links with problem gambling and motivations for purchase, Zendle, Meyer and Over, 2019, https://www.researchgate.net/publication/333880635_Adolescents_and_loot_boxes_Links_with_problem_gambling_and_motivations_for_purchase
[S77] Children's Code strategy progress updates (December 2025 and August 2026), UK ICO, https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/protecting-childrens-privacy-online-our-childrens-code-strategy/children-s-code-strategy-progress-update-december-2025/
