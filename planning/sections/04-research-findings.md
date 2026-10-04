# 4. What the market and the research say (the 23 research notes, distilled for product planning)

_Written 2026-10-04 for the planning agents who will decide what the FINAL Apple product should be. Source: the 23
research notes in `research/roblox/` (`01`-`23`, each researched 2026-10-04 from web sources), plus `BRIEF.md`,
`PIPELINE.md` and, where marked "internal", the Phase T files. Every fact carries the note number and that note's own
source tag, for example (`05` [S12]). Source tags are per note, so `05` [S12] and `08` [S12] are different sources._

## 4.0 How to read this section

**Trust.** The notes are original syntheses of public pages (Roblox docs, DevForum, investor letters, trackers, wikis,
press). Most Roblox pages were read through a summarising fetch tool, and Fandom wikis through their MediaWiki API.
So: Roblox first-party numbers are the best, tracker numbers (Rolimons, RoWatcher) are third-party and drift, wiki and
guide numbers are "shapes, not targets". Whenever a note flagged a number as single-source, stale or conflicting, this
section repeats the flag. Nothing here is legal advice.

**What Apple is, for context.** A one-line prompt becomes a complete game built inside the creator's own Studio place
(world, systems, progression, economy, saving, UI, models, animation, VFX, SFX), driven by a Cloudflare worker, a Luau
plugin with an allowlist, and an owner gateway on the owner's Mac (`CLAUDE.md`, `docs/autonomy/MISSION.md`). The owner
judges by seeing and playing, and a blind-critic loop scores every build (`PHASE-T.md`).

### The ten findings that matter most

1. **The platform is big but flatter and tougher than in 2025.** DAU peaked at 151.5M in Q3 2025 and was 123M in Q2 2026;
   Q3 2026 bookings are guided down 14-18% year on year; the top 10 games hold about 20% of hours (about 30% three years
   ago), so long-tail games now get traffic (`11` [S18]; `22` [S1][S4]).
2. **Discovery now pays for 28-day retention**, not launch spikes. Signals: play-through rate, first-play bounce (under
   60 s and 61-180 s), play days, playtime (capped at 60 min per day), intentional co-play (`02` [S1][S3]).
3. **Every 2025-26 viral hit decayed 80-99% from peak within months.** Steal a Brainrot fell from 25.8M peak to a 1.68M
   30-day peak; Grow a Garden to about 0.11% of its peak (`01` [S45]; `12` [S1]). A game is a live service or it is nothing.
4. **Hits are one-sentence loops with social conflict, built by tiny teams, updated weekly.** Grow a Garden v1 took about
   3 days; 99 Nights about 3 months; Fisch one developer, 4 months (`01` [S12][S13][S15]; `10` [S13][S14]).
5. **New games start in a 16+ and Trusted-Friends audience** until they clear an engagement evaluation (250 highly engaged
   age-checked plays in 60 days now; 100 announced for November 2026) (`08` [S49][S50]; `02` [S63][S82]). Creator
   verification, 2FA and Plus or a fee are prerequisites for the all-ages route.
6. **Roblox already gives creators, for free, most of "AI inside Studio"**: Assistant with Planning Mode, a built-in MCP
   server that Claude Code can drive, mesh/texture/material/procedural-model generation, a Playtest Agent (beta), and a
   prompt-to-game app (Build, alpha) (`09` [S1][S5][S6]; `11` [S2][S11][S12]).
7. **The quality bar is clarity, not fidelity.** Top hits range from flat studded cartoon to raw desaturated screenshots;
   the common factor is a readable premise, readable thumbnails and fast feedback (`19` section 3).
8. **Engineering has hard rules a builder must respect**: server authority, validated remotes (about 500 requests per
   second per client), ProfileStore-style session-locked saves, idempotent `ProcessReceipt`, mobile budgets of about
   500k triangles and 500 draw calls (`04` [S27][S31][S81]; `05` [S41]).
9. **The Creator Store is a malware channel**; only assets without scripts (audio, meshes, decals, material packs) are
   low-risk, and the agent should not insert scripted models without owner sign-off (`09` [S50]; `23` section I).
10. **Money is in flux**: US 18+ spend earns a 42% higher DevEx rate if the game uses R15; Wallet arrives December 2026;
    DevEx is to be sunset in the US mid-2027 (`11` [S7][S17]).

---

## 4.1 The Roblox platform in late 2026, as it affects a game-building AI

### 4.1.1 Size, audience, regions, devices

| Fact | Value | Cite |
|---|---|---|
| DAU trajectory | Q3 2025 151.5M (peak), Q4 2025 144M, Q1 2026 132M, Q2 2026 123M (+10% year on year) | `22` [S1][S2][S3][S4] |
| Hours engaged | Q3 2025 39.6B; Q2 2026 29B (+5% year on year) | `22` [S1][S4] |
| Bookings | Q2 2026 $1.557B (+8%); Q3 2026 guidance $1.576-1.653B, a 14-18% year-on-year decline | `11` [S18] |
| Why softer | engagement moved from "high monetizing, 2025-vintage viral games" to new and evergreen games, plus disabled cross-experience passes | `11` [S18][S20] |
| Concentration | top 10 games about 20% of hours (about 30% three years earlier); outside-top-10 hours +25% year on year; 28% of new top-100 games launched in the last 90 days | `11` [S1][S18] |
| Time spent | 2025 average 2.7 hours per DAU per day; users visit "over 24" experiences a month | `22` [S5] |
| Payers | 27M monthly unique payers (Q2 2026); about 1.4% of DAU pay daily; bookings per daily payer about $10.36 vs about $0.15 per user | `11` [S18]; `22` [S5] |

**Age (age-checked mix, Q2 2026, 57% of DAU checked).** Under 13: 35%. 13-17: 38%. 18+: 27% (`22` [S1]). Roblox warns
these are extrapolated from the checked cohort, which skews toward people who want to chat, so the unchecked 43% is
probably younger and less social (`22` section 2 synthesis). Direction of travel: 18+ is the fastest-growing cohort
(US 18-34 DAU +42%), and over-18s monetise "over 50% higher" than under-18s (`22` [S1][S2][S3]). Roy Morgan (Australia,
6-13): 61% play Roblox, rising from 41% at ages 6-7 to 70% at 12-13 (`22` [S7]). Old self-reported age tables (for
example "41% 18+") are stale and must not drive design (`22` [S74][S75]).

**Region (FY2025 average DAU).** US and Canada 18%, Europe 23%, APAC 30%, rest of world 29% (`22` [S80]). Money is far
more concentrated than users: FY2025 bookings were 56% US and Canada, 21% Europe, 12% APAC, 10% rest of world, and Q2
2026 bookings per DAU were $38.63 (US and Canada) against $4.90 (APAC) (`22` [S80]). Growth is international (Q2 2026
DAU: Japan +67%, India +64%, US and Canada +6%) (`22` [S1][S79]). Regional access is volatile: bans or age restrictions
in Turkey, Qatar, Algeria, Iraq, Egypt, Russia (blocked 2025-12-03, unblocked 2026-06-10), Brazil (rated 16+ from
2026-03-17) and Indonesia (under-16s blocked from 2026-03-28) (`22` [S85], tertiary source).

**Devices.** Mobile is the default. The FY2025 10-K "Breakdown of Our Users" pie chart reads 83% mobile, 14% desktop, 3%
console (FY2024: 80/17/3) (`06` [S89][S90]). Caveat: note `22` could not find any device split in the filing *text*
and calls "about 80% mobile" a rough third-party figure (`22` [S86][S87]); the two notes disagree on how firm the 83%
is. Newzoo: only about 24% play mobile-only, most mix devices (`22` [S8]). Revenue does not follow players: only 46% of
2024 Robux revenue went through Apple and Google stores while mobile was about 80% of players, so PC and console UI
still matters (`06` [S80]). Shooters and mechanics-heavy games skew PC (`17` [S70]).

**Gender.** Roblox publishes no split. Apptopia (US mobile only): female weekly actives grew 24% vs 5% for males in Q2
2026 and passed male on Roblox mobile for the first time (`22` [S6]). Fashion and avatar expression are mainstream:
274M avatar updates a day, 47% change avatars to express creativity (`22` [S20]).

### 4.1.2 Discovery and ranking

- **Home is the whole game.** Over 90% of platform traffic starts on Home; the Charts page got under 5% of traffic in
  Feb 2024 (`02` [S2][S12][S13]). Ranking is two-stage (retrieval, then personalised ranking). Only behaviour of users who
  arrived through the recommendation sort feeds ranking; ads and external traffic can help get a game considered but do
  not count as ranking input, and ads do not hurt organic reach (`02` [S1][S2][S31]).
- **Signals today** (windows Day 1, Day 2-7, Day 8-28): most important are play-through rate from recommendation
  impressions, first-play bounce (negative; sessions under 60 s and 61-180 s), play days per user and playtime per user
  (capped at 60 min per day); important are intentional co-play days (join, invite, private or reserved server), qualified
  play sessions, spend days and Robux spent per user (`02` [S1][S3]).
- **History matters because notes disagree on dates.** Qualified play-through arrived July 2024; six 7-day signals in
  March 2025; "deep play-through" and not-interested feedback in March 2026; 28-day windows tested from April 2026 and
  fully launched 15 June 2026; a further Home update targeted late August 2026 to reward long-term retention and
  sustainable monetisation; RDC26 says Roblox is testing optimisation for "direct growth" (new players a game brings)
  (`02` [S2][S3][S4][S7][S9][S59][S82]). Roblox says the change intentionally trades near-term monetisation for retention
  (`02` [S59]). Exact signal weights are not published (`02` open questions).
- **Quality gates that cut reach**: "free Robux" or giveaway wording, metadata that does not match gameplay, and
  non-unique content such as a same-title, same-art copy (`02` [S1]). Late-2026 roadmap adds takedowns for deceptive copy
  (games imitating another game's title or thumbnail) (`02` [S35]).
- **Presentation levers**: thumbnails 16:9 at 1920x1080 under 3 MB, up to 5 personalised (2-5 active), Roblox runs a
  multi-armed bandit (+8.5% average qualified play-through, up to +50%); icons at least 512x512 and legible at 150x150;
  real-gameplay video (3 uploads a month, no narration, no cinematic trailers) with reported +47% quality plays in
  Standout Games tests and up to +39% playtime in recommendation tests; YouTube embeds on game pages were removed on
  30 September 2026 (`02` [S17]-[S25]).
- **Co-play and notifications**: friend referral (`ReferredByPlayerId`), `SocialService:PromptGameInvite`, experience
  notifications (13+ opted-in only, one per user per day, 100+ visits), co-play sessions run about 1.9x longer than solo
  (`02` [S51][S52][S54][S55]).
- **Benchmarks (large established games only).** GameAnalytics 2026 (500+ titles with 1M+ monthly users, 4.76B
  sessions): D1 median 10.3% (p99 22.2%), D7 1.6% (p99 9.1%), D30 0.5% (p99 4.7%), median session 9.8 minutes, 3.8% of
  players pay (`02` [S61]; `03` [S107][S110]). No genre split exists from a disclosed method; BLOXG's genre table has
  levels above GameAnalytics' 99th percentile and is only usable for ordering (RPG, simulator, tycoon highest; obby
  lowest) with low confidence (`03` [S109]). Roblox's docs give no thresholds. Small-game retention is unknown.
- **Beta mode.** A public experience can be put in "beta mode": searchable and linkable but kept out of recommendation
  sorts until switched off; beta mode can be re-entered once every 10 minutes (`10` [S63]).

### 4.1.3 Policy, age gating and moderation

| Area | Current rule (Oct 2026) | Cite |
|---|---|---|
| Accounts | Roblox Kids (5-8: Minimal and Mild only, chat off by default) and Roblox Select (9-15: up to Moderate) global since 2026-06-16; about 30,000 games in the catalogue | `08` [S46][S47][S48]; `22` [S12][S13] |
| Getting reach | any creator can publish to age-checked 16+ and Trusted Friends; the all-ages route needs ID verification (18+) or facial estimation (under 18), 2FA, good standing, evaluation, and either 2 consecutive months of Plus or Premium or a one-time refundable per-game fee | `08` [S49][S50]; `10` [S6] |
| Evaluation bar | 250 unique plays by highly engaged age-checked users in 60 days (docs, updated 2026-10-02); 500 before 2026-08-19; 100 announced for November 2026; expedited review 50,000 Robux (was 100,000); per-game fee 1,000 Robux | `02` [S63][S76][S77][S82]; `08` [S75][S76] |
| Content labels | Minimal, Mild, Moderate, Restricted (18+ and age-verified); answer the questionnaire for the worst thing a player can see; wrong answers risk label removal or suspension | `08` [S42]; `16` [S74][S75] |
| Social hangouts | primary theme of talking or interacting by voice or text: 16+ (docs say 18+ if it has private spaces); free-form drawing or writing others see: 16+; both excluded from Kids and Select; roleplay is not a hangout if roles and props are central | `18` [S1][S6]; `08` [S42] |
| Paid random items | exact numeric odds for every outcome, summing to 100%, shown before purchase behind a labelled button (a bare icon is not enough); keys, tickets and luck boosts count; `PolicyService` fields `ArePaidRandomItemsRestricted` and `IsPaidItemTradingAllowed`; restricted regions listed 2026-05-26: Australia, Belgium, Netherlands, United Kingdom, Brazil | `08` [S38][S39][S57] |
| Gambling | playable gambling banned; off-platform links banned (social links 16+ only); charity solicitation banned | `08` [S54] |
| Chat | age check required to chat since January 2026; age bands (under 9, 9-12, 13-15, 16-17, 18-20, 21+) chat with their own and adjacent younger bands; `TextChatService` required; Quick Words preset phrases | `08` [S53]; `22` [S25]; `18` [S7] |
| Media feeds | games that combine a media feed, autoplay or infinite scroll and rewards for continued viewing are barred from Kids and Select (after Steal An Egg's "Reels" treadmill) | `12` [S15]; `13` [S61][S62] |
| Publishing gate | public publishing needs ID verification, a real-money purchase since 2025-01-01, 100+ playtime hours, or a DevEx in the prior 12 months | `18` [S10] |
| Moderation | continuous multimodal review; repeated violations shut down a server instead of the experience; development-phase grace and a ~40% ban reduction for well-intentioned creators announced, not live | `08` [S55][S56] |
| Terms | update effective 2026-11-01 (Roblox as merchant of record; EEA withdrawal right); April 2026 update allows ML training on user content | `08` [S79][S80] |

Other risk signals: ten US states plus Los Angeles County have sued Roblox over child safety, five states settled
(`22` [S84]); a Fairplay/NCOSE FTC complaint alleges that virtual currency, scarcity marketing and daily incentives
pressure children (`22` [S54][S57]); a University of Sydney study found deceptive or misleading purchases in 14 of 15
popular games (false reference prices, countdown timers, near-miss visuals, spend prompts after losses) (`22` [S53]);
FTC v. Epic found one-press purchase triggers and default-on chat to be dark patterns (`22` [S43][S44]).

### 4.1.4 The creator economy

- **Splits.** 70% creator share on in-experience Robux sales (passes, products, private servers) (`08` [S9][S71]).
- **DevEx.** $0.0038 per Earned Robux since 2025-09-05. Enhanced rate $0.0054 (+42%) from 2026-06-08 for spend by
  age-checked 18+ players with a US economic location on passes, products, Robux subscriptions and private servers, if the
  game uses R15-only avatars, a custom human rig with 15+ joints, a custom non-human rig, or shows no player characters
  (`08` [S2][S3]; `11` [S17]). Note `11` flags a conflicting "50% premium" in a call summary and says trust the 42%.
  Cash-out needs 30,000 Earned Robux, age 13+, a tax form (`08` [S2]). Roughly $1.7B was paid to creators in the 12
  months to 30 June 2026; the median DevEx earner took about $1,550 in 2025, the top 1,000 averaged about $1.3M
  (`11` [S2]; `08` [S10], third-party snapshot).
- **Creator Rewards** (replaced Engagement-Based Payouts, July 2025): 5 Robux per qualifying "active spender" per day if
  they spend 10+ minutes in your game and it is one of their first three that day; Audience Expansion pays 35% of the
  first $100 of a new or returning user's purchases (needs 100+ DAU over 60 days); payouts held 60 days (`08` [S5][S6]).
  The claim that Roblox said tycoons and roleplay earn less under it was checked and withdrawn as unverified (`13` [S21][S22]).
- **Roblox Plus** ($4.99 a month, replaced Premium on 2026-04-30): 10% then 20% discount on in-game items funded by
  Roblox; creators get 250 Robux a month for a new subscriber's first 3 months via
  `MarketplaceService:PromptRobloxSubscriptionPurchase`, and up to 100 Robux per subscriber who spends 60+ minutes in
  paid private servers; since 2026-09-24 each Plus member gets one free private server per game (`08` [S14]-[S18]).
- **Wallet and DevEx sunset.** Wallet (USD, daily payouts, via Airwallex) is announced for December 2026 for US
  18+ independent creators; DevEx is to wind down in the US by mid-2027; Roblox Card in 2027 (`11` [S7]). Dates and fees
  are not published.
- **Ads.** Rewarded video (opt-in, reward must be a normal developer product worth about 3-10 Robux, never random, never
  a progress gate; game needs 2,000+ monthly visitors, 13+ ID-verified owner) is live; no-code placement tooling is Q4
  2026; pre-roll video ads are "coming soon", revenue split unpublished, Plus members exempt (`08` [S22][S24]; `11`
  [S23][S24]). Ads Manager: Earnings objective open to nearly 30,000 eligible games (`11` [S22]).
- **Price tools.** Managed Pricing (June 2026) regionalises and tests prices automatically; regional price is never below
  30% of default; never hard-code Robux numbers in UI, read them at runtime (`08` [S30][S31][S34]).
- **Cross-experience sales are dead.** Passes and products cannot be sold across games, even within one owner's games,
  since 2026-05-29; the Transfers API (Plus-only senders, 10% to creator) replaced donation tricks (`08` [S35][S37]).
- **Typical price points** (first-party pass lists, 2026-10-04): Brookhaven 35-199 for utilities, 299-599 packs, 699-749
  flagships; simulators sell x2 currency at 199-399, luck at 199-800, automation 99-350, extra capacity 149-650, VIP
  249-729, a few anchors at 2,400-3,250 (`18` [S140]; `12` [S3]).

### 4.1.5 What Roblox already gives creators for free

This is the section planners must weigh most heavily. Anything below is something a creator can do without Apple.

| Capability | Status (Oct 2026) | Limits that matter | Overlap with Apple |
|---|---|---|---|
| **Assistant + Planning Mode** | GA since April 2026; `/plan` writes an editable Markdown plan, then Build; chat history, skills, NPC subagent shipped | docs warn generated code "may not work flawlessly"; reference images and playtest screenshots need BYOK; usage limits "reached quickly", failed runs burn quota, no numeric quota published | direct overlap on "plan then build" inside Studio (`09` [S2][S5][S43]; `11` [S3][S11]) |
| **Assistant BYOK** | Anthropic, OpenAI, Gemini keys, stored on device (Feb-Mar 2026) | provider's API cost | cost is not a moat (`09` [S36]) |
| **Built-in Studio MCP server** | GA; clients named: Claude Code, Codex, Cursor, Claude Desktop, Gemini CLI, VS Code; every call needs `studio_id` since 2026-08-19; restart client after Studio updates | tools cover scripts, assets, data model, Luau execution, playtest (play, screenshots, keyboard and mouse input, navigation) | a stock Claude Code session can already drive Studio; Apple competes with "Claude Code plus MCP" (`09` [S6][S37][S38]; `11` [S13]) |
| **Generation** | mesh generation GA (default 10,000 triangles); procedural models (50 per rolling 24 h, up to 8 parts); `/segment_mesh` (5 parts per call); texture and material generation (Sept 2026); Studio runtime `GenerationService` (Car5, Body1 schemas, beta) | custom normals reset and mesh IDs change after texture generation; one anecdote of a 7-day ban linked to a realistic-character mesh prompt | overlaps Apple's model and asset steps (`09` [S4][S5][S44]; `11` [S29]) |
| **Cube open weights** | on GitHub and Hugging Face | licence is research-only RAIL; not usable commercially | not available to Apple's product (`09` [S8][S88]) |
| **Playtest Agent** | Studio Beta since 2026-04-09; Pass, Fail, Inconclusive or Error with report | daily cap, max 50 turns, false positives, cannot handle real-time combat or vehicle steering; multiplayer shown at RDC with about 100 NPCs, undated | overlaps Apple's verification; Apple must not treat it as a gate (`11` [S12]; `09` [S83][S85]) |
| **Build** (mobile prompt-to-game) | public alpha since 2026-07-28 in New Zealand, expanded to Serbia and Singapore; testers age-verified 9+, published games for age-checked 16+; about 9,000 games published; 71% of creators had never used Studio; free base tier | alpha, three countries; shares backend and chat history with Studio | the most direct competitor for "one line to game" for beginners (`11` [S2][S10][S18]) |
| **Adoption** | nearly half of the top 1,000 creators use Assistant or MCP (Q1 2026); adoption up about 15 points quarter on quarter; 95% say it speeds launches | | AI tooling is becoming table stakes (`11` [S18][S19]) |
| **Skills and sync** | creator-authored Markdown Skills work in Studio and MCP clients; Studio Script Sync (VS Code, Cursor) | | Apple's knowledge corpus is the same idea (`11` [S9][S43]) |

### 4.1.6 What is NOT shipped yet (do not build on it)

From the Fall roadmap and RDC26 (`11` sections 1-5): **Scene Generator** (late 2026); **Analytics Agent and Experiment
Agent** (announced, not shipped; "over the coming months"); **branch and merge** and **test teleports in Studio** (early
2027); **unified agentic permission** (late 2026); **Open Cloud AI APIs** and **Creator Hub APIs through MCP** (delayed;
early 2027); **text generation API** (delayed); **Wallet** (December 2026, US only), **Roblox Card** (2027), **pre-roll
ads** (test), **web play** (end of 2026), **offline play** (mid 2027), **Roblox Everywhere** standalone apps (undated),
**Roblox Reality** (undated); **new primitives** (Cone, Capsule, Disc), **CSG on meshes** persistence, **2D particles**,
**orthographic camera**, **UI blur** (late 2026 to early 2027); **terrain scattering and splines, material layering**
(mid 2027); **SLIM for NPCs** (early 2027); **in-game creation persistence** (early 2027); **free trials for passes**.
Roblox slips dates: 32 roadmap items were delayed in the Fall update (`11` [S3]).

Live and usable now: **Server Authority** (full release 2026-07-09), **Frustum Streaming** (late September 2026),
**Acoustic Simulation** (September 2026), Script Sync, Asset Manager, UI styling (StyleSheet, UIShadow, per-corner
radii), Animation Graphs (2026-07-15), Adaptive Animation, the Character Controller Library (beta) (`11` [S14][S26]-[S30];
`06` [S73][S76]; `07` [S45]-[S47]; `14` [S6]).

---

## 4.2 What makes games succeed

### 4.2.1 Case studies (compressed)

| Game | Loop in one sentence | Per server | Team / build | Peak CCU | Decay or note | Cite |
|---|---|---|---|---|---|---|
| Grow a Garden (Mar 2025) | plant, wait (even offline), harvest, sell, buy rarer seeds | 4 | teen built v1 in about 3 days; weekly updates by Splitting Point | 22.3M | 0.11% of peak a year later; sequel peaked under 1M and fell 66% in a month | `01` [S1][S12][S32][S45]; `12` [S1] |
| Steal a Brainrot (May 2025) | buy brainrots from a conveyor, they earn per second, others can steal them | 8 | DoBig Studios; build time undisclosed; peak about four months after launch | 25.8M | 30-day peak 1.68M; live about 0.6% of peak | `01` [S2][S45]; `12` [S1] |
| 99 Nights in the Forest (Jun 2025) | survive 99 nights at a campfire, co-op | 25 | 3 core creators plus artist and animator, about 3 months | 14.15M | about 263K live a year on; 29.8B visits | `01` [S18][S26]; `16` [S1][S2] |
| Fisch (Oct 2024) | cast, win a catch minigame, collect fish with mutations | 20 | one developer, about 4 months, 7 islands at launch | 1.27M | fell to about 13K, recovered to 1M+ | `01` [S15][S55][S56] |
| Dead Rails (Jan 2025) | fuel a train across a zombie desert, 4 co-op | 16 | small team; platform featured it on TikTok | 1.48M | 31K 30-day peak by autumn 2026 | `01` [S13][S45] |
| DOORS (2022) | open numbered doors, learn each entity's tell | 50 | 2 core developers | 382K | still alive years later on floor drops | `16` [S17]-[S22] |
| Dress to Impress (Nov 2023) | 360 s to dress to a theme, rated 1-5 stars | 13 | 9-person team in 2024 (about 30 later) | 1.74M | 22% of peak held at 30 days | `01` [S54][S62]; `18` [S69] |
| Animal Hospital (May 2026) | night-shift nurse spots which patients are anomalies | 30 | solo developer per press, or a small group | 1.27M | -62% in August; swept 2026 awards | `01` [S30][S53]; `16` [S50]-[S53] |
| Steal An Egg (Jul 2026) | grab an egg, run it home past guardians, hatch pets that earn | 7 | undisclosed | 14.3M | pulled briefly over a video-feed treadmill | `01` [S31][S60][S61]; `13` [S65] |
| +1 Speed Keyboard Escape (Jan 2026) | every step adds speed, clear stages for wins, rebirth | 22 | SecretVerse Studio | 7.26M | won Best Party and Casual 2026 | `01` [S35]; `18` [S75] |
| Escape Tsunami For Brainrots | run out, grab brainrots, return before the wave | 8 | Do Big label | 5.0M | kept 0.8% of peak at 30 days | `14`; `18` [S76] |
| Rivals (Jun 2024) | 1v1 to 5v5 first-person duels, first to 5 | 40 | small studio | 967K | evergreen; ranked ladder and seasons | `17` [S117] |

Roblox itself pitches that teams of fewer than 10 people regularly reach 25M+ CCU (a Roblox GDC claim without
per-game headcounts) (`01` [S50]). Ground truth on build time is thin: no first-person postmortem exists for Steal a
Brainrot, Rivals, Dead Rails, Forsaken or The Strongest Battlegrounds (`01` open questions). Note `10` once claimed
SpongeBob Tower Defense took six weeks with four people; note `15` found no source and corrected it to about 2.5 months
from partnership to launch (`15` [S129]).

### 4.2.2 Patterns, with the numbers behind them

**One-sentence loops and social conflict.** All 2025-26 hits can be said in one sentence and shown in a 5-second clip:
steal a thing, run from a wave, watch a number climb, spot the anomaly, survive the night (`01` how-to-apply). Small
servers turn theft "from an anonymous number into a grudge": Grow a Garden 4, Plants and Brainrots 5, Kick a Lucky
Block 5, Steal An Egg 7, Steal a Brainrot 8; co-op and horror use 20-30 (`01` [S32][S45]).

**Small teams and fast builds.** Verified references: a teenager plus a studio for about 3 days (Grow a Garden v1), one
developer for 4 months (Fisch), 3 months for 99 Nights, a two-week prototype for Fantasy Forest, a nine-person team for
Dress to Impress' 2024 event (`01` [S1][S12][S15]; `10` [S13][S14][S17]). The playbook's advice: build tall before fat
(controllers, interaction, win/lose, save, progression before models and UI polish); 70% proven design and 30%
originality (`10` [S18]).

**Weekly updates.** Grow a Garden grew in steps with weekly or biweekly events (5M, 11.7M, 16M, 21.3M within five weeks);
Pet Simulator 99 ships every Saturday with each update layering a luck source, a scarce limited item, a timed
competition with a wide reward ladder and a social bonus; Brookhaven ships Fridays; 99 Nights runs a 45-minute "update
party" before each weekly drop (`01` [S1]; `12` section 4; `18` [S102]; `10` [S13]). Roblox's own cadence guidance: small
updates every 2-4 weeks, major ones every 2-3 months, content drops under three weeks of effort and mostly art variants
(`03` [S8][S9][S111]). Third-party and unmethodical: seasonal-event participation was the best single predictor of
12-month survival; 80% of the 2024 top 50 had dropped out of the top 200 by early 2026 (`03` [S60][S61]).

**Fast decay and clone ratios.** The data is consistent:
- Peak to now: Steal a Brainrot about 0.6%, Grow a Garden 0.11%, Escape Tsunami about 0.09%, Toilet Tower Defense about 99% down, build ur base 99.6% down in a year, Anime Vanguards 93% down in 25 months (`12` [S1]; `14`; `15` section 1).
- Survivors are old and deep: Bee Swarm (2018) and Adopt Me (2017) still run 24K and 239K live; Tower Defense Simulator is a co-op skill game with seasonal events, not a gacha game, and kept its base for seven years (`12` [S1]; `15` section 1).
- Clone ratios: an unofficial Animal Hospital copy peaked at 1,519 against 1,273,105 (about 838 to 1); IT GIRL, a Dress to Impress copy, peaked near 20,000 against 1.74M (about 87 to 1); Deadly Delivery, a Lethal Company-style clone, peaked at about 3% of the originators (`18` [S78][S79][S121]; `16` [S98]).
- A sequel does not inherit players: Grow a Garden 2 peaked under 1M after 22M and fell 66% in a month (`01` [S32][S45]).
- Bolting PvP theft onto an idle loop did not rescue retention (`03` [S92][S64]).

**2025-26 trend formats.** Steal / base-defend with 5-9 player servers (Steal a Brainrot, Steal An Egg); "+1 Speed"
walk-and-gain obstacle runs (22 players); tsunami run-and-bank; plot-idle plus roll (Anime Dice: 28.3 minutes average,
76.8K peak a month after launch, no theft); work-and-hide horror hybrids (Animal Hospital, Road-Side Shawarma, Dandy's
World); co-op survival (99 Nights, Dead Rails); RTS-lite with idle construction timers (Mini War, Best Strategy 2026);
two-player tethered obbies; troll towers; brainrot memes on proven loops; concerts as events (Bruno Mars in Steal a
Brainrot drew 12.86M concurrent) (`01` [S21][S22]; `12` section 2; `13` [S91]; `14` section 3; `15` section 7; `16` section 3; `18`
section 6). Roblox says it pays more for "novel" games (new genre, new mechanic, different look) and its discovery docs
penalise non-unique content, so a pure clone is a weak bet (`03` [S27]; `02` [S1]; `09`).

### 4.2.3 Genre economics with real numbers

The notes stress that top-game constants are private and wiki numbers drift. Use these as shapes.

| Genre | Real numbers worth keeping | Cite |
|---|---|---|
| **Simulator / collect / hatch** | payback of 2-5 minutes per tier whatever the absolute price (Steal a Brainrot: Rare 129-133 s, Epic 133-146 s, Legendary 175-183 s; only Secret and OG stretch to about 17 minutes); egg pools of 3-6 pets with raw weights, rarest 0.1% (1 in 1,000) in mid-game eggs and 0.002% for chase pets; Pet Simulator 99 has nine rebirths each worth the same +75%, so rebirth is a feature gate not a multiplier; upgrade tracks of 7-9 tiers, cost ratio about 4-5.6x per tier, +25% to +55% total; odds rule P(hit within k tries) = 1-(1-1/N)^k | `12` sections 4, 6 |
| **Incremental math** | cost = base x growth^owned with growth 1.07 (AdCap) to 1.15 (Cookie Clicker); prestige exponent 1/2 needs 4x earnings to double, 1/3 needs 8x, 1/7 needs 128x; Ride a Pet cost steps of about 50x for a +1x multiplier mean the hatched pet carries progression; linear multiplier against geometric cost gives unbounded cycle time | `12` section 3; `03` Economy |
| **Offline / timers** | save `os.time()` at leave, clamp, discount (heuristic 25% rate, 8 h cap; devforum divides by 4-5, caps 24 h; Cookie Clicker 5-75%); shop restocks every 5 min / 30 min / 24 h as a pure function of the clock (slot = floor(time/period) seeds the RNG) | `12` section 8; `13` [S44] |
| **Tycoon** | pacing law: steady wait between purchases = payback x (g-1) (g 1.25 gives about 30 s at 120 s payback; g 2 gives 120 s); first rebirth cost = full-ladder income per second x target seconds; 6-player servers for builders and business sims, average playtime 22-30 minutes but peaks only 27-67K; capacity monetisation (Theme Park Tycoon 2 pass 74-374 Robux, Bloxburg 100-600); players leave when automation is locked behind Robux | `13` sections 2, 4, 8 |
| **Obby / tower / speed run** | average playtime 4-10 minutes except looped games; Tower of Hell 4.35 min; stage obbies (Barry's, 2022) still above 10K live; default physics: WalkSpeed 16, jump about 7.2 studs, gap ceiling about 8.5 studs for a general audience (9.6 measured once; elite 12-13); +1 Speed stage-teleport ladder about 2.3x per step; passes 49-139 for gear, 499-1,499 for admin/troll | `14` sections 2-4, 7; `03` |
| **Tower defense** | match 20-30 waves in 10-20 minutes; Tower Defense Simulator Easy: 20 waves, $500 start, wave bonus about +$160 per wave; Farm tower pays back in about 5 waves at every level; enemy health +15%, +25%, +40% for 2, 3, 4 players; Anime Vanguards pity: Legendary at 50 summons, Mythic at 400; 5-17 Robux first seeds in Plants and Brainrots; decay 93-99% for gacha clones | `15` sections 3, 4, 8; `03` [S125] |
| **Horror / survival** | every hit averages 12-19 minutes a session; DOORS' Rush appears only in rooms with hiding spots; hiding is capped (about 12 s then ejection); 99 Nights day is 4.5 min (3 min day, 1.5 night), 7 h 25 min at 1x vs 49.5 min with the 9x multiplier; jump scares plus creepy creatures stay at Mild; story games spike on chapter drops only (The Mimic gaps 8-16.5 months) | `16` sections 1-6 |
| **PvP / combat** | session 8-17 minutes; duel rounds about 90 s, first to 5 (Rivals), first to 2 (TSB ranked); TTK = (ceil(HP/damage)-1) x fire interval, fast end 0.6-0.8 s; ranked tiers of 200 ELO with a daily loss shield, decay only at the top; Server Authority 100 ms latency means about 6.25x resimulation load | `17` sections 1, 4, 5, 6 |
| **Social / roleplay / party** | Brookhaven holds 56% of its peak at 30 days, Bloxburg 7%; pass ladder 35-199 / 299-599 / 699-799; minigames 30-90 s in collections, 2-6 min in rounds, 10-35 s intermission; cap currency per round (MM2 40 coins, 50 with pass); Dress to Impress pays 65 for 1st falling by 5 per place | `18` sections 2-5; `03` |
| **Racing** | four different products (lobby circuit, open-world driving, run-to-speed sim, kart); Racing template exists in Studio; driver gets network ownership while seated; race position = laps x big + checkpoints + fraction to next | `03`; `14` sections 8, 9 |

---

## 4.3 What "good" looks like (the quality bar the blind critic applies)

**Internal context, not in the 23 notes.** Three blind critiques of the first Phase T game (a crystal-mining
simulator) scored it 1.5 to 2 out of 10 each round: an unlit navy void, a default baseplate, empty plots, no mining, no
cave, no onboarding (`research/roblox/phase-t/t1-round1..3/critique.md`). The bar below explains what those critics
expect and what the research says is feasible.

### 4.3.1 Visual study (`19`, `05`, `21`)

- **Clarity beats fidelity.** The visual range of the top games is very wide: flat studded cartoon (Grow a Garden,
  Steal a Brainrot), painted faceted low-poly (Fisch), toon characters with outlines (Dandy's World, Animal Hospital),
  clean pastel competitive FPS (Rivals), grim photographic horror (DOORS), semi-realistic frontier (Dead Rails)
  (`19` section 3). Dead Rails shipped raw, desaturated screenshots (mean saturation 0.22-0.25) and still hit 1.48M.
- **Five families; never mix two** (`19` how-to-apply): bright stud/cartoon simulator; painted low-poly cosy; clean
  pastel competitive with one accent colour; warm-light-in-cold-dark horror; toon characters with outlines. Mixing two
  families is "the main thing that makes a game read as assembled".
- **Measured palettes** (own thumbnail measurement, small sample, marketing art): simulators and collectors sit at mean
  saturation 0.55-0.75 and brightness 0.8-0.9; horror at brightness 0.15-0.3 with one warm accent; shooters pair a
  desaturated cool environment with one pure-primary accent for units (red (255,0,26) in Rivals) (`19` section 5).
- **What Roblox curators want**: Standout Games look for "Wait, that's Roblox?"; Today's Picks need a game that looks
  like its thumbnails, low-end device support, originality, D1/D7 retention and a roughly monthly content cadence
  (`19` [S9][S10]). Those top-tier looks are not realistic for a one-shot generated game.
- **Lighting** (`05`): `LightingStyle` Soft for stylised phone games, Realistic with `PrioritizeLightingQuality` for
  horror and atmosphere. Game scripts cannot write `LightingStyle` or `PrioritizeLightingQuality`; only Properties or a
  plugin can (Studio 0.740+) (`05` [S77][S78]). Defaults worth knowing: Ambient (0,0,0), OutdoorAmbient (127,127,127),
  ShadowSoftness 0.2, ExposureCompensation -5..5 (`05` [S2]). Community Soft preset for brainrot-style games:
  Brightness 1.8, EnvironmentDiffuseScale 0.283, EnvironmentSpecularScale 0.39, ColorCorrection Contrast 0.13
  (`19` [S53], not confirmed to be any game's real setting). Use an Atmosphere plus a Sky together (Clouds only render
  on Terrain); keep post effects to one Bloom and one ColorCorrection; per-player effects go on the Camera (`05`).
  No top game has published its real Lighting values (`19` open questions).
- **Scale and readability** (`05`, `21`): avatar about 5 studs tall (docs say classic about 5, humanoid 6-6.5); walk 16
  studs/s; jump apex about 7.2; hallways and doorways at least 10 studs where two players pass; walls at least 10 tall;
  points of interest about 40 s of walking apart; combat lanes about 32 studs wide with at most three exits; three depth
  layers (foreground 0-50 studs hero detail, midground to 250 playable at full fidelity, background silhouettes
  blended by Atmosphere) (`05` [S19][S20][S22][S23][S60][S61]; `21` [S1][S37][S38]).
- **Building craft** (`21`): sketch, blockout, scale-check with a rig, route and sightline check, then art by zone; one
  grid per project (5 studs and 90 degrees in Roblox's own kit); kit pieces, trim sheets and packages; Block, Wedge and
  CornerWedge for structure, avoid Sphere and Cylinder in low-poly looks (triangle counts 12, 10, 96, 432 from one
  2021 post); no unions for decoration (they do not occlude and replicate heavily); anchor everything static; turn off
  `CanCollide`, `CanTouch`, `CanQuery`, `CastShadow` on decoration; reuse mesh IDs. Occlusion culling has been live since
  Dec 2024 to Jan 2025 and rewards closed opaque interiors (`21` [S3][S59][S60][S87]). Amateur tells: unions everywhere,
  one-off meshes, texture on every face, straight paths, flat terrain, identical props, 1:1 real-world scale.
- **"Professional" vs "free model"** (`19`, inference): same material rules across the map (smooth plastic majority, a few
  divider materials), one palette per area, consistent scale on a 5-stud grid, Lighting and Sky set on purpose, UI built
  from one token set, no default grey Roblox buttons, thumbnails that match the game.
- **Plugin constraint** the notes observed in the repo: the Studio plugin creates Part, WedgePart, CornerWedgePart,
  TrussPart, Model and Folder but no UnionOperation, and caps one terrain edit at 65,536 voxels (about 256x64x256
  studs) (`21` [S86]).

### 4.3.2 UI and UX rules (`06`, `19`)

- **Safe areas.** Every interactive ScreenGui uses `ScreenInsets = CoreUISafeInsets` (the default) so it clears notches
  and the Roblox top bar; never hardcode the top bar height (36 px in 2020, "44 or 48" in 2025); listen to `TopbarInset`
  if placing UI near it (`06` [S2][S63][S65]). Roblox's own experience controls (hamburger, chat, mic) are 44 px icons
  that creators cannot move (`06` [S61][S62]).
- **Touch.** Minimum 44x44 px targets (Roblox's own icon size); judgement defaults: primary actions 56 px, 8 px between
  targets, 16 px edge margin; keep the bottom-left (thumbstick) and bottom-right (jump) free; no hover-only affordances;
  branch on `PreferredInput`, not `TouchEnabled`; give every control a gamepad path (`06` section "Touch targets").
- **Layout.** Scale plus AnchorPoint with UIAspectRatioConstraint and UISizeConstraint (for example max 800 px wide, min
  350); UIListLayout/UIGridLayout, never hand-positioned panels; ScrollingFrame with AutomaticCanvasSize for lists
  (`06` [S9]-[S14][S34]).
- **Text.** Body at least 16 px, button labels 18-24, titles 24-32, big numbers 28-48 (judgement defaults); Roblox's only
  hard number is MinTextSize of at least 9. Prefer AutomaticSize plus wrapping over TextScaled because the global player
  Text Size setting (Large to Largest) does not scale TextScaled objects. Gotham and Arial were removed 2024-05-28 and
  silently render as Montserrat and Arimo; Builder Sans is licensed for Roblox use only (`06` [S16][S33][S70][S77]).
- **Roblox's own principles** (`06` [S27]-[S29]): prioritisation, attention, visual language, conventions, consistency; X
  closes (square, red, top-right), unaffordable prices red, three button tiers (primary largest), a container and depth
  cue on every button, feedback on every press (hover, press, release colours and a purchase sound).
- **Patterns top games ship** (`06` [S99], low trust): a Grow a Garden-style pack has Seed Shop, Limited Shop, Pet and
  Cosmetic Shop, HUD, Inventory, 8-10 slot Hotbar, Notification, Quests, Codes, Confirmation, Settings; a Steal a
  Brainrot-style pack has Shop, Currencies, Upgrades, Trading, Spin Wheel, Rebirth, Collection Index, Skins Selector,
  Mystery Merchant, Sell Confirmation, Settings, HUD. This tells you which screens to build, not their layouts; no real
  top-game UI layouts were found (`06` open questions).
- **Accessibility and motion** (`06` [S33]): honour `GuiService.ReducedMotionEnabled` and `PreferredTransparency`, never
  rely on colour alone, give music and SFX separate sliders; haptics via `HapticEffect` types UIClick and UINotification
  (`06` [S92]). Typical tween timings are judgement: press 0.08-0.12 s, panels 0.2-0.35 s, toasts 3 s.
- **Chunky simulator style** is built from a tiled stud ImageLabel tinted with `ImageColor3`, `UICorner` 8-16 px,
  `UIStroke` 2-4 px (3-5 px measured on a 48 px headline cap height), `UIShadow` (GA 2026-06-26) and bold display fonts
  (`06` section "UI art styles"; `19` [S37][S38][S41]). Roblox's own sample HUD uses black panels at transparency 0.3 and
  selected/unselected buttons at 0.1/0.65 (`19` [S45]).

### 4.3.3 Animation, audio and VFX bars (`07`)

- **Audio.** Roblox calls `Sound`, `SoundGroup` and `SoundEffect` discouraged in favour of `AudioPlayer`,
  `AudioEmitter`, `AudioListener`, `AudioDeviceOutput` joined by `Wire`; a listener and output must exist (set
  `SoundService.DefaultListenerLocation` or build them); an `AudioEmitter` under a non-spatial parent is silent
  (`07` [S14]-[S19]). Acoustic Simulation is live but may switch itself off on weak devices, so never build competitive
  cues on it (`07` [S35]). Mix starting points are the author's own and unlistened: music 0.3-0.5, ambience 0.2-0.4, UI
  0.4-0.6, SFX 0.6-1.0, 3-5 variants per SFX with random `PlaybackSpeed` 0.92-1.08, `AudioLimiter` before the output
  (`07` [OWN]). DOORS won Best Use of Audio 2026 because the sound tells you what is coming (`16` [S15]). Good SFX
  sources: 100,000+ Creator Store tracks (`23` [S7][S8]).
- **VFX.** `ParticleEmitter` defaults never fade (Transparency 0 to 0), so always set Texture, Color, Size and
  Transparency sequences, Lifetime, Rate and LightEmission; caps are 400 particles per second per emitter (100 on
  mobile) and 20 s lifetime; fill rate and overdraw dominate cost; one-shot bursts via `Emit(n)` (8-24 for pickups,
  20-45 for explosions); the default `Explosion` kills Humanoids and carves terrain; at most 255 `Highlight` instances;
  author-set (unsourced) budgets of about 150 live particles per effect and 600 per screen on desktop, 250 on mobile
  (`07` [S1][S22][S40][OWN]). 2D screen-space particles are late 2026 (`07` [S50]).
- **Game feel.** Feedback on every important action within one frame (sound, particle, a 0.1-0.2 s scale pop on the UI
  counter, a small camera nudge); author-set juice values: trauma shake +0.2-0.3 on hits, FOV kick +6 to +10 degrees,
  hit-stop 0.04-0.10 s, squash and stretch 0.2-0.35 s (`07` [OWN]); hit-stop of 2-4 frames for heavy impacts in a
  Roblox combat guide (`17` [S73]). Heavy hit-stop can look choppy (anecdotal) (`07`).
- **Animation.** Use `Animator:LoadAnimation` (not the Humanoid versions), load once per Animator, set `Priority`
  explicitly, put named event markers in animations, use catalog animation IDs because a builder cannot invent IDs; Animation
  Graphs are live, state machine nodes are mid-2027 (`07` [S5]-[S8][S45][S50]).
- **Capability gap** (internal, repo-observed in `07` and `PIPELINE.md`): the plugin allowlist lacks AudioPlayer,
  AudioEmitter, AudioListener, AudioDeviceOutput, Wire, audio effects, Animator, Animation, IKControl and Explosion, so
  audio-API and animation work runs through scripts until the allowlist is extended (a plugin 1.1.0 release is planned
  in `PHASE-T.md`).

---

## 4.4 Engineering truths a builder must respect

**Client/server and security** (`04`, `20`)
- The server owns state; clients send intent. Only `ServerStorage` and `ServerScriptService` are hidden from clients;
  anything in `ReplicatedStorage` or a LocalScript can be read (`04` [S33]).
- Remotes: about 500 requests per second per client shared across all RemoteEvents and UnreliableRemoteEvents;
  UnreliableRemoteEvent drops payloads over 1,000 bytes and gives no delivery or order guarantee; the old 20-calls-and-50-KB
  limits are gone from docs; arguments lose functions and metatables and arrive as copies (`04` [S27][S28][S29][S38]).
- Exploiters can fire any remote or prompt from any distance, send NaN (type `number`, fails every comparison, passes
  range checks), infinity, huge strings and wrong types. Validate in layers (permission, structure, value), use a
  server-side token bucket, never let a remote choose a price, damage, reward or data key, and never use
  `RemoteFunction:InvokeClient` (`04` [S29][S31]; `20` [S59]).
- Do not trust `Touched` for purchases or damage; use `ProximityPrompt.Triggered` plus a server distance check
  (`13` [S5][S8][S16]; `17` [S74]).
- Network ownership: anchored parts are server-owned; unanchored parts near a player go to that client, which can
  teleport or fling them; call `SetNetworkOwner(nil)` for gameplay-critical assemblies; give a driver ownership while
  seated and revert on exit (`04` [S36][S37]; `14` [S17]).

**Persistence and purchases**
- Use ProfileStore (successor to ProfileService; Apache-2.0; 300 s autosave; session locks; handles `BindToClose`
  itself; `ProfileStore.Mock` in Studio) with one key per player; do not use DataStore2, do not write on every pickup
  (`04` [S3][S81]-[S84]). Budgets per minute: read 300 + 40 x users, write 300 + 20 x users; per server 60 + 40 x players;
  a value is at most 4,194,304 characters; throttle codes 301-306 retry with backoff, 101-107, 403, 509 do not (`04` [S1]).
- `ProcessReceipt` is assigned exactly once, must be idempotent by `PurchaseId`, and returns `PurchaseGranted` only
  after the grant is saved; never grant from `PromptProductPurchaseFinished` (`04` [S25]). `BindReceiptHandler` with
  `Enum.ReceiptDecision` is the newer path (`08` [S82]).
- Offline progress: store a timestamp, clamp and discount, autosave `lastSeen` about every 60 s, never trust the client
  clock; `GetServerTimeNow()` is for countdown display, not secure timers (`12` section 8; `13` [S10]).
- Text anyone else sees (pet names, signs, plot names) goes through `TextService:FilterStringAsync`; chat only through
  `TextChatService` (`06` [S55]; `18` [S7]).

**Server Authority (full release 2026-07-09)** (`04` [S66]-[S68]; `11` [S14]; `17` section 5)
- `Workspace.AuthorityMode = Server` auto-enables NextGenerationReplication, the Input Action System, deferred signals,
  fixed simulation and streaming. Limits: 64 attributes per instance (50-character names and strings), 8 active
  animation tracks per Animator, no custom emotes or strafing animations, remotes not on the shared timeline (about 40-50
  ms offset), no camera InputAction sync, mobile and console lag desktop by days. Code uses `BindToSimulation`, `time()`
  not `tick()`, no yielding, no cached animation tracks. Shooters still need their own rewind for hit detection.
  Adopt it only for competitive or physics-sensitive games and keep a fallback.

**Performance and memory** (`04`, `05`, `13`, `15`)
- 60 FPS is 16.67 ms. Community mobile budget: about 500,000 triangles, 500 draw calls, 150 draw calls for UI; Roblox's
  docs example: under 1,000 draw calls and 1,000,000 triangles (`05` [S27][S41]).
- Humanoids are costly above about 40-60 enemies; use model rigs with `CFrame` lerping or data-only enemies rendered by
  clients, send position snapshots at about 10 Hz packed into a buffer under 1,000 bytes (`15` [S18][S19][S21]). One test held
  1,000 moving skinned-mesh NPCs at 144-156 FPS and 2,500 at 42-46 FPS (`13` [S52]).
- `Debris` has a hard 1,000-item cap, so cap tycoon drops per plot; put drops in a non-self-colliding collision group;
  disconnect connections and clean per-player tables on leave (`13` [S7][S9]; `04` [S52]).
- StreamingEnabled (target radius 1024 studs; critical models Atomic or Persistent); Frustum Streaming (live, opt-in) for
  scopes and fast vehicles; SLIM and adaptive radius are not yet available for NPCs (`04` [S60][S61]; `11` [S28][S30]).
- Use the task library, not `wait`, `spawn`, `delay`; use `Path` APIs not deprecated `FindPathAsync`; many old API names
  are deprecated (`LoadCharacter`, `AwardBadge`, `Humanoid:LoadAnimation`, `RenderStepped`) (`04`; `14` [S4][S21]; `07`).
- Luau numbers are 64-bit doubles, precise to about 15 digits; hits stay below about 1e17, so a suffix formatter is enough
  (`12` section 9).

**Testing** (`09`): Test (F5), Server and Clients (up to 8), Device Simulator (layout and input only, not CPU speed),
Network Simulator, MicroProfiler (Ctrl/Cmd+F6); `StudioTestService` and `VirtualInput` for scripted play (`09` [S66]-[S70]).

---

## 4.5 Asset sourcing reality

- **What can be searched.** The Creator Store carries 3D assets, visual effects, 2D, gameplay, plugins and audio. The
  Open Cloud Toolbox search (`GET toolbox-service/v2/assets:search`, beta, scope `creator-store-product:read`) returns
  creator `verified`, votes, triangle counts, `hasScripts`, `scriptCount` and instance counts; `includeOnlyVerifiedCreators`
  defaults to true (`23` [S4]). The Studio MCP `search_asset` tool waterfalls universe, group, user inventory, then
  Creator Store, with `assetType`, `scope`, `priceFilter`, `verifiedCreatorsOnly`, `facets`, audio duration filters and
  1-20 results; whether it defaults to verified creators is unstated, so set it explicitly (`23` [S60] and open questions).
- **What can be inserted.** MCP `insert_asset` takes a numeric ID for Model, Package, Mesh, MeshPart, Image, Decal, Audio,
  Video, Animation; whether it applies the Studio sandbox is not stated (`23` [S60]). At runtime `InsertService:LoadAsset`
  loads only assets owned by the experience creator or Roblox; `AssetService:LoadAssetAsync` needs `LoadUnownedAsset`, and
  `AllowInsertFreeAssets` should stay off (`23` [S13][S14]). **`game:GetObjects` is not covered in any of the 23 notes**;
  treat it as unresearched.
- **Risk ranking** (`23` how-to-apply): (1) Store audio, (2) material packs and base-material textures, (3) meshes,
  MeshParts, decals, (4) models with `scriptCount` 0, (5) Studio-generated content. Never insert plugins; do not insert
  models with Script, LocalScript or ModuleScript children without owner sign-off.
- **Why the caution.** ID-verified accounts uploaded malicious models in 2025-26; nested-children crash models, scripts
  hidden in skyboxes, obfuscated backdoors; Studio sandboxes Creator Store insertions since 2026-05-13 (blocks
  `LoadUnownedAsset`, `LoadAsset`, `LoadString`, `CapabilityControl`), but auto-sandboxing of Models and Folders was paused,
  it is Studio-only, and a June 2026 report shows viruses bypassing it with fake error dialogs that coax developers into
  pasting code (`09` [S48][S50]; `23` section I; `21` [S92]). Block-and-review signals: `require(<number>)`, `getfenv`,
  `loadstring`, `InsertService:LoadAsset`, decimal-escape strings, scripts inside Welds or skyboxes (`09` [S52]-[S59]).
- **Licensed music and audio privacy.** Creator Store audio (100,000+ partner tracks; Too Lost added July 2026) is free
  for use inside experiences and licensed for Roblox use only; APM tracks are capped at 250 distinct tracks live in one
  experience; an experience may not be solely a music player; uploads are private by default and another creator's
  private audio ID stops working in your game; audio imports: 2,000 per 30 days if ID-verified, 100 if not (the audio
  page; an older Open Cloud page says 100 and 10); distributed SFX must be under 10 s (`23` sections C, E, F; `08` [S58]-[S61]).
  Audio asset IDs must never be hardcoded from memory; engine files such as `rbxasset://sounds/action_jump.mp3` are safe
  placeholders (`07` [S31]).
- **What needs the owner.** Buying assets (USD, individual accounts only); uploading external files (rights, quota and
  identity are the owner's); granting asset permissions to an experience or setting Open Use (irreversible); Asset Privacy
  changes; distributing to the Creator Store; any plugin; enabling `AllowInsertFreeAssets` or `LoadStringEnabled`
  (`23` how-to-apply). Provenance (ID, creator, source, date, licence, where used) should be logged for every external asset.
- **Textures and meshes.** Textures up to 4096 but sized at 256 per 2x2x2 studs (512 for 10x10, 1,024 for 20x20); one
  material per mesh; meshes at most 20,000 triangles, watertight, one UV set; `MaterialVariant` only works under
  `MaterialService` and is referenced by name; Roblox-owned base-material texture IDs are listed in the Materials guide
  (`23` section H; `05` [S12]-[S15]). Material packs carry no scripts by construction.
- **AI-generated content.** Roblox IP guidance (March 2024): never prompt with brand names or logos; raw AI output is not
  reliably protectable; whether Roblox moderates AI-generated assets differently is unresolved (`23` [S47]; `21` [S68]).
  No Studio sound-generation tool was found (`23` open questions).

---

## 4.6 Implications for Apple's final product ("it suggests X; evidence Y")

These are research-derived suggestions for the planners, not decisions.

### 4.6.1 Which genres to target first

Criteria drawn from the notes: (a) the loop is server-authoritative and systemic, so an AI can generate and verify it;
(b) policy fit, ideally Kids/Select-compatible; (c) market durability; (d) the premise reads without high-end art;
(e) mapped numbers exist for economy and pacing.

| It suggests | Evidence |
|---|---|
| **Wave 1: simulator / collect-and-hatch / plot-idle, with one novel twist.** | The best-mapped genre (systems checklist, odds, payback bands, pass prices) (`12` sections 6, 11); loop is server-authoritative; reads with flat studded art (Grow a Garden built in about 3 days) (`01` [S12]); non-social sims fit Kids and Select (`12` [S16]); but clones decay 99% and Roblox rewards novelty, so require "one proven loop plus one new mechanic" (`03` [S27]; `12` section 12). |
| **Wave 1: obby / tower / speed-run as the cheapest end-to-end proof.** | Fully mapped physics (WalkSpeed 16, jump about 7.2, gaps 2-8.5 studs); templates exist; stage obbies stay above 3K players for years (Barry's 2022, Escape Running Head 2021) (`14` section 2); short sessions (4-10 minutes) mean a hit needs a loop on top (worlds, rebirth, leaderboards) (`14` section 10). |
| **Wave 1-2: tycoon only with a second loop.** | Pad tycoons are one-session products; hybrids with risk, variance, collection or NPC business hold players (`13` section 8); business and sandbox tycoon peaks are modest (27-67K) (`13` section 2). |
| **Wave 2: tower defense (archetype 1 co-op or 3 plant-lane).** | Requires enemy replication as data and a verified wave economy; decay 93-99% except Tower Defense Simulator (`15` sections 1, 8, 10); note `15` recommends archetypes 1 and 3 as the most reproducible. |
| **Wave 2: run-based horror or work-and-hide.** | Hits share a procedural run with a visible counter and learnable tells (`16` section 9); needs lighting, audio and fairness craft; Mild label keeps Kids/Select reach; but the plugin lacks the audio API (`07` repo-fit note) and horror decays 70-95% unless it ships content on a calendar (`16` section 1). |
| **Avoid first: battlegrounds / shooters, roleplay and hangouts, racing, open-world survival.** | PvP needs netcode, rewind, balance and anti-cheat, and Server Authority has hard limits (`17` section 5); hangouts are 16+ and excluded from Kids and Select, have no mappable loop and need large content volume (`18` section 1); vehicle physics is brittle (`14` section 9); 99 Nights ships 43 classes and 59 resources (`16` section 6). |

### 4.6.2 What a generated game must include to have any chance

| It suggests | Evidence |
|---|---|
| **First 60 seconds: spawn beside something interactive, a reward within about 15-30 s, the core loop visible by 60 s, a next goal always on screen, whole FTUE within 5 minutes, at most two tutorial popups, then contextual hints.** | First-play bounce is a negative signal at under 60 s and 61-180 s (`02` [S1]); Roblox's analytics docs say keep FTUE to 5 minutes or less (`02` [S27][S28]); the 15-30 s and 60 s targets are synthesis (`10` how-to-apply; `03` [S103]). |
| **A written three-part core loop (minute-to-minute, repeated action, progression engine) and a rejected design if the engine is missing.** | Roblox's own core-loop doc (`10` [S21]). |
| **Retention for three windows**: a first session, return reasons for days 2-7 (daily reward, restock timer, quest chain, friend goal) and content for days 8-28 (zones, rebirth tiers, events, collection index, leaderboards). | The algorithm scores Day 1, 2-7 and 8-28 separately (`02` [S3]); playtime counts only up to 60 min per day, so design repeat days, not marathons (`02` [S1]); 7-day escalating streak is the recommended default (`02` how-to-apply). |
| **Co-play built in**: invite prompt (`SocialService:PromptGameInvite`), private-server friend invites, shared goals, referral reward banner, visible leaderboard. | Intentional co-play days are an important ranking signal and co-play sessions run about 1.9x longer (`02` [S2][S52]); single-player-feeling games struggle (`03` [S7]). |
| **Server-authoritative economy**: every currency with sources and sinks, expected-value tables for random rewards, cost curves checked for cycle time, numbers in a config module. | Roblox's economy doc (`10` [S28]); derived cycle-time divergence for linear multipliers against geometric cost (`03`; `13` section 4). |
| **ProfileStore-style saving, one `ProcessReceipt`, validated remotes, `BindToClose`.** | `04` sections on persistence and receipts. |
| **Monetisation placed correctly**: low-priced first-purchase item, a ladder (about 25-75, 100-250, 400-1,000+ is third-party), passes read at runtime, never on first load, never cross-experience, a private-server price, one Plus prompt at a calm moment, rewarded video only for non-random 3-10 Robux products. | `08` how-to-apply; `12` section on shape; the 25-75/100-250/400-1,000 ladder is third-party opinion (`08` [S65]). |
| **Fair pricing and no dark patterns**: cosmetics, convenience and time-skips with a free path; no fake was/now prices, countdown timers on repeating offers, spend prompts right after a loss, near-miss animations; purchase throttle and a confirm step. | Pay-to-win perception research and the Sydney study (`22` [S39][S53]); FTC v. Epic (`22` [S43]). |
| **Paid random items default OFF**; if used, exact odds summing to 100% behind a labelled button, `PolicyService` gating with an allowed alternative, pity disclosed, no paid trading unless allowed. | `08` section J; `22` rule 21. |
| **Mobile-first UI** with safe insets, 44-56 px targets, AutomaticSize text, abbreviated currency (1.2K, 3.4M), a currency pill, toast stack capped at 3-4, a shop with a featured card and a close X top-right. | `06`. |
| **Maturity and privacy defaults**: Minimal or Mild; no private spaces; no free-form drawing; no off-platform links; filtered text; chat never required for co-ordination (pings, emotes, Quick Words). | `08` [S42]; `18` section 1; `22` rules 27-28. |
| **R15 (or a 15-joint custom rig)** so US 18+ spend can earn the higher DevEx rate. | `11` [S17]; `08` [S3]. |
| **A live-ops plan, not a one-shot**: a cut list that becomes the first four updates, one event slot ready, a weekly or biweekly cadence, a separate event currency. | `10` phase 0 and 9; `03` [S6][S8]; `12` section 4 (PS99 pattern). |
| **Gameplay-visible art and sound basics**: lit world, Sky plus Atmosphere, a sound and a particle burst on every core action. | `19` how-to-apply; `07`; phase-T round 1-3 critiques. |

### 4.6.3 Realistic quality ceilings

| It suggests | Evidence |
|---|---|
| **Aim the default build at "tier S" (one map, one loop, 3 upgrades) and tier M (3 zones, shop, daily reward); tier L needs a human team.** | The playbook's scope tiers (`10` phase 0); real hit builds were 3 days to 4 months by people (`01`). |
| **The art ceiling for generated games is "clear and coherent", not "top 100".** | Top hits' range includes flat, unpolished looks (`19`); Standout Games and curators want "Wait, that's Roblox?" and novel fidelity (`19` [S9][S10]); the blind critic scored round 1-3 of the first test at 1.5-2/10 (internal). |
| **Audio, animation and VFX will be thin until the plugin allowlist and composers cover the new Audio API, Animator, IKControl.** | `07` repo-fit note; `PIPELINE.md` capability gaps. |
| **Generated meshes are capped**: up to 8 parts per generated model, 5 per segment, 50 procedural models a day, default 10,000 triangles; custom normals reset; realistic-character prompts risk moderation. | `09` [S5][S44]. |
| **Long-term retention needs content cadence that a one-shot build does not give.** | 80% of the 2024 top 50 left the top 200 within about a year (`03` [S60], third-party); weekly updates in all long-lived hits. So "continue the same game" and cheap art-based update packs (under three weeks of effort; pets, items, levels, quests) are the credible path (`03` [S8][S9]). |
| **Do not promise "viral".** | Hit rates are low even with an audience; KreekCraft spent about $100,000 and said some games just won't do well (`10` [S56]); paid ads of about 40,000 Robux bought about 40 concurrent players in one postmortem (`10` [S17]); ads do not feed organic ranking (`02` [S31]). |

### 4.6.4 Where Apple can beat Roblox's own Assistant (and where it cannot)

| It suggests | Evidence |
|---|---|
| **Own the "one line to a complete, verified game" promise.** Assistant plans and edits; Build targets beginners; neither claims a complete, tested, economically sane game. | Planning Mode produces an editable plan and then builds on user approval; docs warn code may not work flawlessly (`09` [S2][S5]); Build is alpha in three countries (`11` [S2][S18]). |
| **Ship genre knowledge as defaults**: the economy math, odds tables, systems checklists, first-minute scripts. | These sit in notes `03`, `12`-`18`, `20` and are not something Assistant bundles; Roblox's own guidance is generic (`10` [S20]-[S29]). |
| **Verification that does not rely on the Playtest Agent.** Scripted assertions, logs, a rejoin test, a 5-minute clean-Output run, plus the blind critic on screenshots. | Playtest Agent is beta, capped at 50 turns and a daily quota, gives false positives and cannot test real-time combat or steering (`11` [S12]); Roblox says add scripted assertions or logs (`11` how-to-apply). |
| **Compliance by construction.** Odds tables, `PolicyService` gating, drafted questionnaire answers, no private spaces, R15, filtered text, honest replies about what exists. | Policy rules are complex and change monthly (`08`; `02` section F); Assistant is a general tool with no such guarantee in the notes. |
| **Safe asset sourcing.** Prefer script-free assets, vet or block scripted models, log provenance. | Store is flooded with backdoors and sandboxing is partial (`23` section I; `09` section D). |
| **Cost control.** Assistant usage limits are reached quickly and failed runs burn quota. | `09` [S43]; but BYOK exists, so cost alone is not a moat (`09` [S36]). |
| **Where Apple cannot assume an edge.** A stock Claude Code session can use the same built-in MCP server; Roblox adoption is high (nearly half of the top 1,000 creators); Scene Generator, Analytics Agent, branch and merge and cloud agents are on the roadmap; Roblox's Build has Roblox-side distribution. | `09` [S6][S37]; `11` [S19] and section 3. The window for "AI builds a game in Studio" as the product is narrowing; the differentiator must be completeness, quality gates and compliance. |

### 4.6.5 Risks: policy, moderation and platform dependence

| It suggests | Evidence |
|---|---|
| **Always tell the owner to read the live Kids/Select and Audience Reach pages.** The numbers moved four times in six months. | 500 to 250 (2026-08-19) to 100 (announced Nov 2026); fee 1,000; expedited 100,000 to 50,000 (`02` [S63][S76][S77][S82]); notes `08`, `10` and `22` disagree on which are current (see 4.7). |
| **Plan for a 16+ and Trusted Friends launch audience.** | New games start there; some games reported audience drops of up to 80% after mislabelling (`08` [S52]; `10` [S6]). |
| **No attention-extraction mechanics.** | Steal An Egg was pulled and a platform rule created (`12` [S15]; `13` [S61]). |
| **Never put gambling-like random purchases in the default output.** | Banned playable gambling; paid random item rules and regional restrictions; regulatory attention (`08` sections J, I; `22` section 10). |
| **Keep prompts to neutral props for generated meshes.** | A 7-day automated ban reportedly followed a realistic-character mesh prompt (single anecdote) (`09` [S44]). |
| **Do not use trending IP without a licence.** | Tung Tung Tung Sahur was pulled in a licensing dispute (`01` [S2]); non-unique content is penalised (`02` [S1]). |
| **Do not rely on features announced but not shipped**, and expect MCP and API churn. | 32 roadmap items delayed (`11` [S3]); MCP now requires `studio_id` and a client restart after Studio updates (`11` [S13]). |
| **Do not promise a payout schedule.** | DevEx sunset in the US mid-2027, Wallet needs a US 18+ independent-creator account first; pre-roll revenue split unpublished (`11` [S7][S23]). |
| **Treat Creator Store content as hostile.** | `23` section I. |
| **Mind the legal climate.** | State suits, FTC complaint, EU consumer principles on in-game currencies, Digital Fairness Act proposal expected Q4 2026 (`22` section 10). |
| **Expect rating and bot cleanup noise.** | Roblox began removing bot accounts on 2026-08-19; ranking ignores bot engagement; late-2026 peaks may be revised (`01` [S36]). |

---

## 4.7 Contradictions and unknowns that still matter

### Contradictions between notes or sources

| Topic | The disagreement | Which wins and why |
|---|---|---|
| **Mobile share** | `06` reads 83/14/3 (FY2025) from the 10-K pie-chart image [S89]; `22` could not find a split in the filing text and treats "about 80%" as rough third-party (also cites 72% and 83% from Statista) | `06` has the more specific primary-source reading; for design, "large majority mobile" is safe either way |
| **Kids/Select entry bar and fees** | 500 (April AMA, June launch) vs 250 (docs, since 2026-08-19) vs 100 (announced for Nov 2026); 1,000 Robux fee vs 100,000 vs 50,000 expedited | docs page updated 2026-10-02 wins for current values; notes `08`, `10`, `22` carry different snapshots (`02` section F) |
| **Social hangout private-space age** | 17+ (2025 post) vs 18+ (docs through 2026-09-26) | docs win (`18` [S1][S141][S3]) |
| **SpongeBob TD build time** | six weeks and four people (`10`) vs about 2.5 months (`15`) | `15` found no source for six weeks |
| **Tower of Hell sections** | 364 catalogued (`03`) vs 150-210 in the wiki history (`14`) | `14`: 364 is unsupported |
| **Jump height** | 5 studs (Roblox curriculum) vs 7.2 documented vs about 7.3 measured | use 7.2 (`05` [S19]; `21` [S1]) |
| **Wallet date** | "Late 2026" vs December 2026 | announced, not live (`11`, `08`) |
| **US 18+ DevEx uplift** | 42% (staff post) vs "50% premium" (call summary) | 42% (`11`) |
| **Plus creator share** | 70% to 88% (single-source summary) vs arithmetic that gives 87.5% on a 20% discount | unverified (`11`, `08`) |
| **Creator Rewards by genre** | `03` said Roblox said tycoons and roleplay earn less | withdrawn by `13`; no first-party source |
| **Genre retention** | BLOXG D1 values above GameAnalytics' 99th percentile | ordering only, low confidence (`03`) |
| **Peaks** | trackers differ by about 3% (Steal An Egg 14.29M vs 13.84M) and by window (RoVitals tracks from 2026-08-11) | longest-window tracker (Rolimons) is used (`01`, `12`) |
| **Q1 2026 DAU** | 132M via a summariser | verify against the PDF before quoting (`11` open questions) |

### Unknowns that affect product decisions

- **Assistant quota and cost**: no numeric limit is published (`09` open questions).
- **Whether Playtest, Analytics and Experiment agents are generally available**: only the Playtest Agent is verified as beta (`09`, `11`).
- **Revenue per game**: no Roblox per-game revenue; only third-party estimates (Grow a Garden about $12M in May 2025) (`01` open questions).
- **Rewarded-video revenue share, pre-roll share, Wallet fees**: not published (`08`, `11`).
- **Exact discovery weights**: only priority tiers are published (`02`).
- **Small-game and per-genre retention**: no method-disclosed data (`02`, `03`).
- **Whether AI-generated games or assets are treated differently** by discovery or moderation: unresolved (`21` [S68]).
- **How the May 2026 16+ change moved big roleplay towns**: unmeasured (`18`).
- **Real top-game UI layouts, fonts, Lighting values, palettes**: not published; all inferred from thumbnails and tutorials (`06`, `19`).
- **Whether Studio MCP `insert_asset` applies the sandbox**; whether `search_asset` defaults to verified creators (`23`).
- **`GetObjects`** is not covered by any note.
- **Roblox Everywhere** eligibility and terms; **Build** quality and distribution; **Roblox Reality** developer API (`11`).
- **Server Authority on mobile and console**, and its interaction with moving platforms and constraints (`14`, `17`).
- **ClockTime replication** from server to client, whether legacy fog renders with an Atmosphere (`05`).
- **Model-side**: whether commercial use of Cube *outputs* (not weights) is allowed under the research-only licence (`09`).

---

## Open questions this section raises for the planners

1. **Positioning against Roblox.** With Assistant, Planning Mode, the Studio MCP server, Build and a free Playtest Agent
   all live or in alpha, is Apple "the complete, verified game from one line" product, a "guarded compliance and
   quality layer for any MCP client", or something else? Which of the ten findings in 4.0 is the headline?
2. **First genre set.** Do the planners accept simulator/collect and obby as wave 1 (with a mandatory novelty twist),
   and defer PvP, roleplay and racing? What counts as an acceptable "twist" given Roblox's novelty incentive?
3. **Audience default.** Should every generated game default to Minimal or Mild, no private spaces, no hangout features,
   R15, and chat-free co-ordination, or should the owner choose a target age band first (research rule `22` rule 1)?
4. **Paid random items.** Is "off by default, opt-in with full odds and `PolicyService` gating" the product rule, given
   how central luck and hatch loops are to the best-mapped genre?
5. **After the one-shot build.** Does the final product include update packs (events, new zones, new variants) and
   scheduled live-ops, since retention in the evidence depends on cadence? What is the unit of work for "continue this game"?
6. **Quality ceiling promises.** What will Apple promise about art, audio and feel for tier S and tier M, given the
   blind critic's first results and the plugin allowlist gaps? Who decides when the allowlist grows?
7. **Verification stack.** Which checks does Apple run itself (scripted assertions, rejoin test, clean-Output run,
   blind critic) versus rely on Roblox's Playtest Agent, which is capped and cannot test real-time play?
8. **Asset policy.** Is the rule "script-free assets only, no plugins, owner sign-off for scripted models, provenance
   log" accepted? Should `GetObjects` and the MCP `insert_asset` sandbox behaviour be researched before any insertion
   feature ships?
9. **Owner-facing launch guidance.** Who tells owners about Plus or the per-game fee, 2FA, ID verification, the
   16+ and Trusted Friends starting audience, the Audience Reach dashboard and the live threshold? How are fast-changing
   numbers kept current?
10. **Money messaging.** How should Apple talk about earnings given the Wallet transition and the mid-2027 US DevEx
    sunset, and the unpublished rewarded-video and pre-roll splits? Should it refuse to forecast revenue?
11. **Monetisation defaults.** Should Apple generate price ladders and passes by default (research gives shapes),
    or only the plumbing (idempotent receipts, runtime price reads) and let the owner choose prices?
12. **Language of virality.** How does the product avoid implying hit potential? Research shows a 99% decay norm,
    low hit rates and ads that do not feed ranking.
13. **Evidence gaps worth research before final decisions**: per-genre retention from a disclosed method; whether
    discovery or moderation treats AI-generated games differently; real top-game UI and Lighting values; Assistant quota
    and cost; Server Authority behaviour on mobile; `GetObjects`; the status of the Analytics and Experiment agents.
14. **Brand and visual direction.** The mission names a studded, saturated look. The research supports it for
    simulators and collectors (saturation 0.55-0.75) but shows horror, shooters and cosy games use other families.
    Is "studded" the default for all genres, or per-genre families with the studded look as one of five (`19`)?
