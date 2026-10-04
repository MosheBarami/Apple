# From a one-line idea to a publish-ready Roblox game: the playbook
_Researched 2026-10-04 by deep-research agent (topic 10). Sources: 72 listed (fetch returns model-made summaries, not raw pages; third-party or partly snippet-level items are marked). Web search budget ran out mid-session; a gap pass added [S63]-[S70]._
_Gap pass 2026-10-04: 9 items resolved, 8 still open._

Scope note: this file is about process, scope and gates. Engineering detail (DataStores, Remotes), genre craft, UI, art, audio and monetisation numbers live in files 03 to 09; this playbook points to them and does not repeat them. Anything labelled "Synthesis" is this agent's recommendation built from the cited evidence, not a sourced fact.

## Key facts

### How real Roblox teams went from idea to launch
- Grow a Garden began as a game one 16-year-old (BMWLux) built in a few days; the Splitting Point Studios team (Janzen "Jandel" Madsen, New Zealand) joined when it had about 500 CCU and 10,000 to 20,000 DAU, put it on a weekly update cadence, and it went to about 100,000 CCU within two weeks and about 1 million within a month. Launch was 26 March 2025; peak CCU reported as 22.3 million after 104 days. The partners' own explanation of the growth was the weekly live-service cadence. [S1]
- Fisch: built entirely by one developer (WoozyNate) in four months, launched October 2024. Version 1 was already content-rich: seven islands, two hidden locations, several rods with distinct abilities, NPCs and quests, about 25 procedurally generated mutations per fish species. A seasonal event (FischFright) shipped soon after launch. His lessons: a compelling trailer drives organic discovery, set up moderation early, favour quality over update frequency. He started because about twenty existing Roblox fishing games did not satisfy him, taking Stardew Valley's fishing as the reference. [S14]
- 99 Nights in the Forest: three core people (design and art direction, programming, building) plus one more artist and one animator. It started as a week-long game jam, was built March to June 2025 (about three months, faster than their previous six-month projects) and reached a 14 million CCU peak. They run a 45-minute "Update Party" sandbox before each weekly update to talk to players, hand out items and find bugs. Their advice: keep scope small, work quickly, make a game you would play, playtest often, watch what players do when you are not watching, and kill ideas that are not working. [S13]
- Dandy's World: concept 2022, a smaller tower-defence game (Flavor Frenzy) first to learn the platform, alpha June 2024 with one promo video, then community-driven tweaks; first Easter event hit 875K CCU against an original goal of 1,000. Advice: take your time to understand what makes Roblox games work. [S15]
- Tower Defense Simulator (Paradoxum Games): started as a teenager's school project in spring 2019 and launched to 3,000 CCU, then about 30,000 after content creators picked it up; studio grew to 30 staff by 2024. Lessons: find talent through the community, hold retrospectives after launches, keep communication open. [S16]
- Fantasy Forest (DevForum postmortem, Nov 2022, so older than 2024): two weeks of prototype (week one experimenting with features, week two polishing and adding content), public release 7 Oct, 500 CCU at 2 weeks, 1,000 at 3, 2,000 at 4. Day-1 retention was in the top 200 range and average session rose from about 9 to 13 minutes after adding animals and game modes. About 40,000 Robux of ads (20,000 on launch day, then 5,000 a day for 5 days) bought only about 40 concurrent players. The author's thesis: improve engagement metrics and the algorithm sends players. [S17]
- Uplift Games (Adopt Me), May 2021 (stale): about 40 staff, half "Roblox people" and half industry veterans, fixed meeting cadence, in-house support team because the audience is young; philosophy of making games that "feel fair". [S55]
- WonderWorks shipped SpongeBob Tower Defense in six weeks with four people and then 52 consecutive weekly updates (third-party trade press, Apr 2026). The same article claims a launch of 5 to 8 weeks now versus 12 to 16 weeks before, and that top Roblox teams often cap near 20 people, with many studios at 10 to 15. [S49]
- Dubit (branded-game studio, Mar 2026) uses a four-gate pipeline: (1) do people want it (store page with art plus ad test measuring click-through and notify-me sign-ups, several concepts at once under anonymous groups), (2) is the core play fun (prototype with no progression, monetisation or branding), (3) will players come back (add retention mechanics, launch unbranded, measure D1 and D7 against genre benchmarks), (4) is it awesome (add brand and social features that drive sharing). They report a Sunsilk experience with 90M+ visits with no marketing spend. [S48]
- Dress to Impress: a nine-person team (three modelers, an animator, a builder, a hair modeler, a makeup artist, a scripter, a UI artist) ran its August 2024 "The Games" event, which hit 500K CCU on day one [S68]; a later profile says about 30 developers [S70]. Animal Hospital (2026 Best New Game) is described by Tubefilter, reporting on a Roblox video series, as the work of a solo developer who later founded a studio [S67]. Roblox's own GDC 2026 pitch is that teams of fewer than 10 people regularly reach 25M+ CCU (a Roblox claim; no per-game headcounts) [S47][S69].
- KreekCraft (streamer) said in March 2026 he had spent about $100,000 starting a Roblox studio and that some games "just won't do well"; a reminder that hit rates are low even with an audience. [S56]
- Quote-level lesson from a June 2026 DevForum post by FriendlyEvo (8 years of development): overambition kills projects; build "tall" features (controllers, matchmaking, the scary core) before "fat" ones (weapon models, UI polish); study what already works (the author's rule of thumb is 70% proven design, 30% originality); launch incomplete-but-playable to validate demand. [S18]
- A 2023 DevForum thread argues that cloning saturated formulas (simulator, tycoon, donation games) no longer works and that a small loyal community beats a flash of success (stale, 2023). [S19]
- Newzoo-based summary (Oct 2025, third-party): success on Roblox depends on iteration speed and cultural relevance; algorithms and players favour trending games with active developer support over the best visuals or biggest worlds. [S54]

### What Roblox itself tells creators to do
- The official design guide is organised as Design (Design for Roblox, Core Loops, Prototyping), Build (Onboarding, Onboarding Techniques, Quest Design, UI/UX), Monetize (Foundations, Season Pass, Subscription, Contextual Purchases, Balance Virtual Economies) and Support (LiveOps Essentials, LiveOps Planning, Analytics Essentials, Content Updates). The phases below follow that order. [S20]
- Core loop = (1) minute-to-minute interaction, (2) the most repeated action set, (3) a progression engine; without the third the game "becomes repetitive, boring, and shallow". [S21]
- Prototyping: paper prototypes take minutes; Studio prototypes take days to weeks; validate the core loop, UI/UX, game rules (respawn, timers) and edge cases; keep prototypes fast and partial; run several team playtests, then share with friends and social media; the two benefits are catching flaws early and "finding the fun". [S22]
- Platform traits to design for: social-first (single-player games find it harder to build and keep an audience), mobile-first (most users play on mobile), players hop between games ("tourists" who may become "locals"), so long tutorials lose people; weirdness is rewarded; many users follow streamers. [S23]
- Onboarding: teach essentials, get to the fun fast, leave players wanting more; measure by D1 retention and onboarding completion; keep early level-up thresholds low, give starter currency or items, show short-, mid- and long-term goals, add celebratory effects at milestones. [S24]
- Onboarding techniques: visual cues (arrows, particles, glowing trails, in-world signs), contextual tutorials triggered by normal play, and timed hints placed just after most playtesters finish (the doc's example: most finish in 10 seconds so the hint appears at 11). Test variants with A/B Experiments and tune with Configs without restarting servers. [S25]
- The onboarding doc says only that new players typically decide how interested they are within minutes; an earlier "30 to 60 seconds" claim could not be verified on the Creator Hub page and was dropped (the 30 to 60 second targets below are Synthesis). [S24]
- LiveOps: release cadence "from weekly to monthly" depending on capacity; extend existing systems rather than build new ones; limited-time and seasonal events; prioritise by bug severity, effort and player impact. [S26] Content-cadence updates should cost under three weeks of effort and many games ship them every two weeks to a month; favour art-based content (pets, items, levels, quests) over code-heavy features. [S27]
- Economies: every currency source needs a sink; use a separate event currency for event shops; compute expected value for any probabilistic reward; use A/B tests and Configs to tune prices; watch for event-driven surpluses (the doc's Feline Fishing Fun example). [S28]
- Shop design: integrated with UI, contextual, inviting; offer both durable and consumable items. The doc gives no price points. [S29]
- Discovery: Roblox first retrieves candidate games then ranks them. Most important signals are play-through rate, first-play bounce (negative), play days and playtime per user at day 1, days 2 to 7 and days 8 to 28; secondary are co-play with friends, qualified play sessions and monetisation. After an update Roblox "explores" a new cohort and "expands" if that cohort engages and spends. Metadata that mismatches gameplay, money-focused titles and duplicated titles or visuals reduce visibility. [S33]
- Creator Analytics defines D1/D7/D30 retention by first-play cohort and gives no benchmarks; it suggests improving the core loop for D1, progression for D7, and content and social mechanics for D30. [S31] The Overview page (Aug 2024) compares engagement, monetisation and acquisition metrics against similar experiences as percentiles, updated daily, for experiences with 100+ DAU; those benchmarks do not directly influence discovery. [S32]
- Beta-testing guidance (Roblox education docs): closed access (trusted group), open paid access, limited-time tests (a weekend or a week for D1 and session data), and open access for a mostly playable game; a general time frame of 7 to 30 days; record feedback via in-game forms, Discord, or think-aloud sessions; track demographics, device, D1/D7, session length, onboarding completion and drop-off points; aim for at least an 80% like ratio after beta. [S37]

### Studio tooling relevant to a build plan
- Testing modes: Test/Play (F5) spawns at a SpawnLocation or about (0, 100, 0); Test Here uses the camera position; Run (F8) does not insert an avatar; Server and Clients (F7) starts one server and up to 8 simulated clients; Team Test lets collaborators test together (one session at a time); Device Simulator, Controller Emulator, Network Simulator (latency, jitter, packet loss) and Player Emulator (localisation, regional policy). The client/server toggle shows blue border for client and green for server. The UI label has changed between "Play" and "Test"; both appear in docs. [S38]
- Assistant: Planning Mode (`/plan`) writes an editable Markdown plan, saved in the cloud, and nothing runs until you press Build. Commands include `/generate_mesh`, `/generate_procedural_model`, `/insert_asset`. Procedural models are capped at 50 per rolling 24 hours and segmentation yields at most eight parts. [S42]
- Studio MCP server: enable from Assistant panel, Manage MCP Servers, "Enable Studio as MCP server". Tool groups: scripts, asset generation, data-model exploration, Luau execution, playtesting (start or stop play, screenshots, player input), documentation, session management. Quick-connect covers Claude Code, Claude Desktop, Codex CLI, Cursor, Gemini CLI, VS Code and others. Docs warn that clients can read and modify open places. [S43]
- April 2026 announcement: improved Planning Mode with clarifying questions, a playtesting-agent beta that drives the character to check behaviour against a specification, parallel agents in development; Roblox said 44% of the top 1,000 creators already used Assistant or MCP tools. [S44] The 2026 spring roadmap lists Planning Mode, procedural models, MCP with external LLMs and agentic gameplay validation as launched; NPC subagent for gameplay testing, Open Cloud APIs exposed to Assistant and MCP, multiple persistent chats and skills as "mid 2026". [S45]
- 2025 shipped features that matter for iteration: Experiments (A/B), custom matchmaking, real-time performance analytics, video previews, "Experience Betas", updated publishing requirements to combat spam and cloning, rewarded video ads, regional pricing. [S46]
- Experience Betas (announced on the DevForum 2025-12-11, launched, not a beta of the feature): a public experience in beta mode stays searchable and linkable but is kept out of recommendation sorts such as Recommended For You until you switch beta mode off. To use it: Creator Hub, Experience, Settings, Privacy = Public, toggle "Enable beta mode", Save. The Maturity and Compliance Questionnaire is required because the public can play it; beta mode can be entered once every 10 minutes. The announcement did not say whether beta analytics carry over after launch (a question asked in replies). [S63]
- Team Create turns on when you add collaborators; four permission levels (Owner, Edit, Play, No Access); user-owned games can only grant Edit to Roblox friends (group-owned use role permissions); live scripting auto-saves every 5 minutes, or use Drafts mode with explicit commits and merge-from-server; age bands limit who may collaborate. [S41]
- Funnel logging: `AnalyticsService:LogOnboardingFunnelStepEvent(player, step, name)`; server-only, only in published games (not Studio, not client); steps numbered sequentially, skipped steps auto-complete earlier ones, repeats count once; validate on the server so exploiters cannot send junk steps. [S39]
- DataStore guidance: wrap calls in pcall and retry transient failures with exponential backoff plus jitter, cap attempts, buffer data in memory, periodic save (the official sample uses 180 seconds), prefer UpdateAsync for dependent writes. [S40]
- Performance: default target is 60 FPS (16.67 ms per frame); watch memory (leaks hit mobile and low-end hardware), and join time (long loads hurt acquisition and retention). [S57b]

### Publishing and audience gating (volatile, changed in 2026)
- Publish from Studio with File > Publish to Roblox; new experiences default to Private; Limited (selected category: playtesters, friends, group) and Public exist; account must be in good standing and at least 2 days old; up to 5 never-before-public private games can be made public per day (making an already-public experience private and then public again does not count against it). Places up to 100 MB (104,857,600 bytes) are supported; beyond that, Save to Roblox and Publish to Roblox may fail. The doc names no cap on places per experience. A one-time, refundable publishing fee of 1,000 Robux per experience applies to the all-ages route; this page says it is refunded if the experience keeps 100 highly engaged players for 60 days without moderation (one other fetch of the same page returned 25, so treat the refund threshold as unconfirmed). [S2][S6][S66]
- Configure before launch: complete the Maturity and Compliance Questionnaire; set minimum age and permitted regions (Audience > Access Settings); collaborator permissions via group roles and Places > Permissions; "Allow Strong Language" if relevant; know where Version History is. [S3]
- Maturity labels: Minimal and Mild reach Roblox Kids (5 to 8) and Select (9 to 15); Moderate reaches Select and 16+; Restricted needs age-verified 18+ users and cannot be lowered later. If an update changes any questionnaire answer you must retake it. [S4] The questionnaire also asks about violence, blood, fear, crude humour, strong language, romance, alcohol, gambling (only unplayable depictions), social hangouts, free-form creation, paid random items, paid item trading, media sharing and AI interactions; playable gambling is banned; wrong answers can lead to label removal, delisting or suspension. [S5]
- Since the rules took effect on 19 May 2026, an experience aimed at under-16 players needs an age-checked creator account (facial age estimation under 18, ID for adults), two-step verification, and either an active Roblox Plus or Premium subscription of 2 or more months or a one-time refundable per-game fee, then an evaluation. New games are first shown only to age-checked users aged 16+ and Trusted Friends of the owner. [S6][S11]
- Evaluation thresholds: the Creator Hub Kids and Select page (re-read in the gap pass; its source file is stamped 2026-10-02) is the current authority and says 250 unique plays by highly engaged age-checked users within a 60-day window completes the evaluation, expedited review costs a one-time refundable 50,000 Robux per game, a standard one-time refundable fee or 2 or more months of Roblox Plus or Premium satisfies the fee requirement, and the fee is refunded 90 days after the game becomes eligible (or 90 days after payment if it never does).[S6][S66] Older sources disagree and are superseded: DevForum threads from May to July 2026 quote 500 highly engaged users in 60 days and a 100,000 Robux bypass; staff called the 16+ default "intended behavior" and defined a highly engaged player as one who has made minimum purchases anywhere on Roblox in the last 60 days, not necessarily in your game. [S7][S8][S9] A third-party guide (Aug 2026) lists 1,000 Robux refundable, 100,000 Robux expedited, or 2 months of Plus or Premium, with 250 plays. [S12] The numbers still change often, so the builder must tell the owner to read the live page. A July 2026 bug showed "Publishing tier at risk" warnings on games that had paid the exemption; staff fixed it within a day. [S10]
- Playtesters who are Trusted Friends of an age-checked owner can play regardless of age once the questionnaire is complete; progress is tracked in the Audience Reach dashboard of Creator Hub. [S6]

### Discoverability assets
- Thumbnails: 16:9, ideally 1920 x 1080; .jpg .gif .png .tga .bmp; up to 10 images or videos per page; videos under 3 MB, 3 uploads per month free, and must show real gameplay without voice-over, lyrics, overlays or misleading claims; keep text away from the bottom edge. With 2 or more thumbnails active, Roblox A/B tests them to raise qualified play-through (docs report an average +8.5%, some games +50%). [S34]
- Icon: square, at least 512 x 512; shown as small as about 150 x 150; must pass moderation; should express theme, tone or genre. [S35]
- Ads: automated bidding, a 24-hour learning phase, daily or lifetime budget, audience types (all, new, recent, lapsed), 16:9 thumbnails up to 10 per campaign, allow 3 to 5 days for meaningful results; games whose metadata and place resemble existing games "are not prioritized". [S36]

### Numbers to calibrate against (third-party unless stated)
- Retention by genre (RoWatcher, undated, no stated method): obby D1 25 to 35%, D7 10 to 15%, D30 under 5%; roleplay D1 15 to 22%, D30 8 to 15%; tycoon or incremental D1 20 to 28%, D7 12 to 18%, with a cliff between D14 and D30; shooters D1 22 to 30%, D7 12 to 16%. [S50] Roblox itself publishes no absolute benchmarks. [S31]
- Native dashboards need about 10+ DAU and 10+ play hours for seven days (third-party claim). Studios instrument every tutorial step and fix the biggest drop-off first. [S51]
- Device split Q4 2025: about 80% of sessions on mobile, about 17% PC, about 3% console; only about 24% play on mobile alone. [S52][S54] Roblox also reports 111.8M average DAU (Q2 2025) in its RDC 2025 newsroom post, which also announced an 8.5% DevEx rate rise [S58], and 144M DAU at GDC 2026 [S47][S69].
- Dress to Impress (third-party): launched 11 Nov 2023 by a teen developer, 9.7B visits; loop is theme, 6 minutes to dress, runway rating 1 to 5 stars; grew through modes (Duos, Freeplay), collaborations and streamers. [S53]
- Innovation Awards as a signal of what the platform rewards: 2025 Best New Experience, Best Simulation and People's Choice went to Grow a Garden, Best Studio to Splitting Point [S64]; 2026 Best New Game, People's Choice, Best Innovation in Creative Direction and the Builderman Award all went to Animal Hospital (about four months old at the ceremony of 2026-09-12), Best Studio to Nosniy Games [S65].

## How to apply it (rules for an AI builder)

### Principles
- DO treat "idea in one line" as an input to a brief, not a build order. Never start placing parts until the brief names the core loop, the hook, the platform, the scope tier and the kill criteria. [S21][S22][S48]
- DO build tall before fat: movement or interaction, win/lose, save, and the progression engine before models, cosmetic UI and extra zones. [S18]
- DO keep a version-1 scope a solo developer or a three-person team shipped in 3 to 4 months, or less. Real references: Fisch (solo, 4 months, seven islands), 99 Nights (about 3 months), SpongeBob TD (6 weeks, 4 people). An AI-driven build should aim for the low end and ship the rest as updates. [S13][S14][S49]
- DO make it multiplayer-friendly and social even if the loop is simple (shared server, visible progress, trading or co-op moments), because single-player experiences struggle on Roblox. [S23]
- DO design mobile-first: thumb-reachable controls, readable text, 60 FPS target, short join time. [S23][S52][S57b]
- DO get to fun fast: first meaningful action inside the first 30 to 60 seconds and a visible reward in the first minute (Synthesis targets; the doc says players decide within minutes), tutorials only as context-triggered hints. [S24][S25]
- DON'T build a clone with the same title or art; metadata that resembles existing games is deprioritised by discovery and ads. Copy proven mechanics, change theme, hook and presentation. [S18][S33][S36]
- DON'T add monetisation, rebirths or cosmetics to the first prototype; Dubit tests the bare loop first. Add retention mechanics after the loop proves fun, and monetisation inside the MVP. [S48]
- DON'T rely on paid ads for validation; ads of about 40,000 Robux bought about 40 concurrent players in one case. [S17]
- DON'T promise or expect immediate under-16 reach. Plan for a 16+ and Trusted Friends audience at first and tell the owner what to do (ID check, two-step verification, fee or subscription). [S6][S9]

### Gate thresholds (Synthesis, calibrate with S50 and the live Overview page)
- Core-loop gate: 3 of 5 fresh testers reach the second loop iteration without help and say they would play again; if not, change the loop or kill the concept.
- First-session gate: onboarding completion at least 70% of new users (heuristic; raise it after seeing real funnels); biggest single drop-off identified and fixed before any other work. [S51]
- Closed-beta gate: no data-loss bug, no unvalidated remote, no console error loop; like ratio at least 80%. [S37]
- Open-beta gate: D1 within or above the genre band in S50 and rising; if D1 is under about 15% on a game that is not roleplay, fix the first session before adding content. [S50]

## The playbook

Time budgets below are Synthesis for an AI builder driving Studio with a human owner approving; scale them to the real tools. Each phase ends with a gate. If a gate fails, loop within the phase; never skip forward.

### Phase 0 - Concept and validation (about 1 hour of agent time)
Goal: turn the one-liner into a Game Brief and a go or no-go.
Deliverables:
1. Game Brief (one page, Markdown in the project): working title, one-sentence pitch, genre and the proven references it borrows from (S18), target players and platform (mobile first), core loop in the three-part form (minute-to-minute action, most repeated action set, progression engine) (S21), the hook (what is new, what a streamer could film in 10 seconds), social mechanic, session length target, content maturity target (aim for Minimal or Mild), monetisation hypothesis (2 to 3 items), and 3 success metrics.
2. Scope tier and cut list: tier S (one map, one loop, 3 upgrades; 1 to 3 days of build), tier M (3 zones, shop, daily reward; about 1 to 2 weeks), tier L (needs a human team). Default to S for the first publish, M if the owner asks. Everything outside the tier goes on a "post-launch updates" list, which becomes the first four updates. [S13][S27]
3. Risk list: top 3 unknowns (feel of the loop, performance with many players, policy exposure).
4. Policy pre-check against experience guidelines: no playable gambling, no paid-random-item mechanics without regional gating through PolicyService, no copyrighted IP or music, no misleading metadata. [S5]
Checklist:
- One-sentence pitch makes sense to a 10-year-old and contains a verb the player performs.
- Core loop has all three parts; a loop without progression is rejected. [S21]
- At least one differentiator beyond a re-skin. [S19][S36]
- Fits a social, mobile experience (works with 1 to N players on a phone). [S23]
- Maturity answers drafted (violence level, fear, chat, free-form creation, paid random items). [S4][S5]
- Cut list exists and is longer than the build list.

### Phase 1 - Foundation and architecture (about 1 hour)
Goal: a project skeleton that every later phase plugs into.
Deliverables:
- Folder layout: `ReplicatedStorage/Shared` (config, types, constants), `ReplicatedStorage/Remotes`, `ServerScriptService/Services` (one ModuleScript per concern: Data, Economy, Progression, Round or Zone, Shop), `StarterPlayerScripts/Controllers` (UI, input, effects), `StarterGui`, `Workspace/Map` with tagged zones.
- One Config module for every balance number (prices, rates, multipliers, timers) so values can be tuned without editing logic; mirror to Attributes or Roblox Configs later so the A/B and live tuning in the docs become possible. [S25][S28]
- Data schema v1 with a version field and defaults; save and load with pcall plus backoff, periodic save, save on leave and on shutdown. [S40]
- Analytics wrapper that logs onboarding funnel steps from the server. [S39]
- Remote list: every RemoteEvent and RemoteFunction named, with server-side validation planned. (See file 04 for security.)
- Spawn, camera and a placeholder map.
Checklist:
- Studio runs a Test session with no errors in Output.
- No game logic in LocalScripts that the client can falsify (currency, damage, rewards are server-owned).
- Config module holds every tunable; none are hard-coded in services.
- Data module has defaults, version number and failure path (what the player sees if load fails).
- Scripts use `task.wait`, `task.spawn`, typed signatures where helpful, and disconnect connections on leave.

### Phase 2 - Greybox core-loop prototype (about 2 to 4 hours)
Goal: find out whether the loop is fun with no polish. No progression, no shop, no art. [S22][S48]
Deliverables:
- One playable greybox arena using plain Parts and default materials.
- The minute-to-minute action and the most repeated action set working end to end, with a clear win or reward moment.
- Exposed tuning variables in Config so timing and rates can be changed live. [S58b]
- A 10 to 20 line "prototype report": what was tested, what felt good or bad, keep, change or kill.
Checklist:
- Loop completes alone and with several simulated clients (use Server and Clients, up to 8). [S38]
- First reward arrives in under about 30 seconds (Synthesis, fits S24).
- Control scheme works for touch, keyboard and gamepad at a basic level.
- Decision recorded: keep, change, or kill. A kill returns to Phase 0 with a different hook.
- Timebox respected; throw-away code is not promoted to production without cleanup. [S58b]

### Phase 3 - Vertical slice (about 4 to 8 hours)
Goal: one small piece at final quality that proves the game. "Small enough to finish at final quality but representative enough to prove the game." [S59] Note the term is contested: Clinton Keith argued it conflicts with iterative development and prefers shipping real increments; here it means a real playable increment, not a throw-away demo. [S57]
Deliverables:
- One zone or round at final art direction (lighting, palette, materials), with the first progression step (first upgrade or first unlock), HUD, one sound set and one effect set, and a save that works.
- The first 60 seconds scripted as a guided path: spawn, visual cue to the first interaction, first reward, a visible next goal. [S24][S25]
- Onboarding funnel steps 1 to N logged. [S39]
- Capture of an icon-quality screenshot and 3 thumbnail candidates from this slice (needed in Phase 6).
Checklist:
- A stranger understands what to do without text in under 30 seconds (watch, do not explain). [S59][S60]
- No more than two tutorial popups; further teaching is contextual. [S25]
- Timed hint exists for the step where most players stall (hint shows just after the typical completion time). [S25]
- 60 FPS target holds on the Device Simulator mobile profile with 8 simulated clients. [S38][S57b]
- Slice looks like the final game; if art style is undecided, decide now.

### Phase 4 - MVP build (about 1 to 3 days for tier S/M)
Goal: everything a player needs for a first week of play, nothing more.
Deliverables:
- Progression engine: levels or upgrades with the early thresholds low, 3 short-, mid- and long-term goals visible (quests, collection, rebirth or zone unlock). [S24]
- Economy v1: each currency with listed sources and sinks, and an expected-value table for any random reward; separate event currency reserved for events. [S28]
- Content: tier S about 1 map, 10 to 20 upgrade steps or items; tier M 3 zones, 3 to 5 pets or tools per zone. (Synthesis, cite Fisch's seven islands as the upper reference. [S14])
- Retention hooks: daily reward with streak, a visible next unlock, one limited-time item slot ready for the first event. [S26][S27]
- Social hooks: leaderboard or visible stats, party or co-op bonus, trading if the genre needs it (observe policy rules for paid trading). [S5][S23]
- Shop: a small set of durable items and consumables, a starter offer; prices tunable in Config. [S29]
- Settings menu (music and effects volume, camera sensitivity), and a short "how to play" panel.
- Moderation hooks: filtered text (TextService filtering for any player-written text), report path, an admin or developer command kill-switch for events. [S14]
Checklist:
- A new player can play 20 to 30 minutes without hitting a dead end or running out of goals.
- Economy simulation (even a spreadsheet or a Luau script) shows no infinite loop of free currency and a sink for every faucet. [S28]
- All purchase flows verified in Studio with a test account; receipts handled once. (See file 08 and file 04.)
- Every remote validated (type, range, ownership, cooldown); never trust client-sent amounts.
- All text legible at phone size; touch targets reachable; no overlap with the top bar.
- Cut list reviewed: anything unfinished is hidden, not shown as "coming soon" clutter.

### Phase 5 - Polish and game feel (about 4 to 8 hours)
Goal: raise perceived quality where players look: first minute, reward moments, UI feedback.
Deliverables:
- Feedback on every action: sound, particle, number pop, camera or tween response, celebratory effect at milestones. [S24]
- Lighting pass, consistent palette, readable silhouettes, landmarks.
- Loading screen and short join time; non-essential assets streamed or deferred. [S57b]
- Final names, item descriptions and consistent iconography.
Checklist:
- Each core action has at least one audio and one visual response.
- No placeholder text, `Part` names or default grey in view of the spawn.
- Music and sound are Roblox-library or original; no copyrighted tracks (see file 08).
- Join time and memory checked in the Developer Console and MicroProfiler (file 09).

### Phase 6 - QA and hardening (about 4 to 8 hours)
Goal: nothing breaks on day one of public traffic.
Deliverables:
- QA log of tests run and fixed items.
- A "break it" pass: rejoin during save, leave mid-purchase, spam remotes, join with 8 simulated clients, server shutdown during save, latency and packet loss on the Network Simulator. [S38][S40]
- Mobile pass on the Device Simulator at several screen sizes; gamepad pass on the Controller Emulator. [S38]
- Automated pass: Assistant playtesting agent beta or the MCP playtest tools (start or stop play, screenshot, player input, read console) driven against the written brief. [S43][S44]
- Player Emulator pass for localisation and regional content policy if any text or paid random items exist. [S38][S5]
Checklist (publish gate):
- Output and Developer Console clean in a 10-minute session.
- Data: new player, returning player, and failed-load player all handled; BindToClose saves; retries use backoff with jitter. [S40]
- Security: no server trust in client values; no leftover `require(assetId)`, `loadstring`, or untrusted free models (file 09).
- Performance: 60 FPS target on the mobile profile; memory stable after 10 minutes (no leak). [S57b]
- Purchases: each product grants once, survives rejoin.
- No exploit path to free currency within the first 5 minutes.
- Every configurable text has been read for typos and policy.

### Phase 7 - Publish package (about 1 to 2 hours, plus owner actions)
Goal: a page that converts impressions into plays, and an honest compliance record.
Deliverables:
- Experience settings: name and description (see Recipe 8), genre, devices, max players per server (match the design), start place, permissions. [S2][S3]
- Maturity and Compliance Questionnaire answered from the real content; retake it whenever an update changes an answer. [S4][S5]
- Icon (512 x 512 minimum, square, legible at about 150 x 150), 3 to 10 thumbnails (16:9, 1920 x 1080), optional gameplay video preview (under 3 MB). Use at least two thumbnails so Roblox can run its thumbnail test. [S34][S35]
- Audience plan: owner completes age check, two-step verification and either the subscription or the fee, understands the 16+ and Trusted Friends starting audience and the engaged-play threshold. [S6][S9]
- Launch assets: Discord or community link, codes (if used), 10 to 15 second clip of the hook for short-video platforms, and the update roadmap (the cut list). [S1][S13]
Checklist:
- Title and thumbnails show the real game; no "free Robux" bait, no copied titles or art. [S33][S34]
- Description: one-sentence premise, 3 key features, controls, what is coming. [S12]
- Questionnaire reviewed against actual content.
- Game starts in Private; first moved to Limited (Trusted Friends and group) for the beta; Public only after beta gate. [S2][S37]
- Version history and a rollback note exist. [S3]
- Owner has read the live Audience Reach and Kids/Select pages (numbers change). [S6]

### Phase 8 - Closed and open beta (7 to 30 days)
Goal: prove retention and fix the first-session funnel with real players. [S37][S48]
Deliverables:
- Closed beta (group or Trusted Friends): 5 to 20 players, one structured session each; feedback form in game plus a Discord channel; observation without coaching. [S37][S60]
- Limited-time open test (a weekend) once the closed beta is clean: collect D1, session length, funnel drop-off. [S37]
- A one-page metrics review: D1 and D7 versus the genre band, average session, qualified play-through, onboarding completion, top 3 drop-off points, like ratio. [S31][S32][S50][S51]
- A fix list sorted by drop-off size, not by opinion. [S51]
Checklist:
- At least one cohort with D1 data; D7 once seven days have passed (recent cohorts show blank D7 and D30). [S31]
- Biggest funnel drop-off fixed and re-measured.
- Like ratio at least 80% before widening. [S37]
- Retention compared with genre bands, but treated as directional only (third-party, unknown method). [S50]
- Economy: watch earn versus spend; no runaway surplus. [S28]

### Phase 9 - Launch and live operations (ongoing)
Goal: keep the explore-and-expand loop fed with strong cohorts. [S33]
Deliverables:
- Public release (when the beta gate passes) and a first update scheduled for 7 to 14 days later. [S1][S26]
- Update cadence: weekly if the team can, otherwise every two weeks; each update cheap (art-based content, new item tier, new zone variant, event) and under three weeks of effort. [S1][S13][S27]
- Event calendar with limited-time currency or items; "Update Party" style session before big updates. [S13][S28]
- Experiments and Configs for thumbnails, tutorial variants and prices. [S25][S34][S51]
- Ads only after D1 and QPT look healthy; small test budgets, 3 to 5 days read window. [S36][S17]
- Retrospective after each major update. [S16]
Checklist:
- Every update has a hypothesis tied to one metric (D1, D7, D30, ARPPU, conversion). [S31][S51]
- Update does not change a questionnaire answer, or the questionnaire is retaken first. [S4]
- Version history reviewed before each update to enable rollback. [S3]
- Server capacity and DataStore budgets re-checked before any event with expected CCU spikes (Grow a Garden went from 500 to 100,000 CCU in two weeks). [S1][S40]
- Community and moderation tools staffed or automated (Fisch lesson). [S14]

## Recipes (each becomes a skill)

### Recipe 1: One-line idea to Game Brief
When to use: the user gives a short prompt ("make a pet-collecting tycoon with a space theme").
Steps:
1. Restate the idea in one sentence containing a player verb and a goal.
2. Pick the nearest proven genre (obby, tycoon, simulator, tower defence, horror, social party, fishing or collecting) and name 2 reference games whose mechanics will be borrowed (S18; genre craft in file 03).
3. Write the three-part core loop: minute-to-minute action; most repeated set; progression engine (S21).
4. Write the hook: one visual or mechanical twist a viewer understands in 10 seconds; check it is not a re-skin of the references (S36).
5. Write the social mechanic (shared world, co-op bonus, trade, leaderboards) (S23).
6. Fix scope tier S or M and list cut features as the first four updates (S27).
7. Draft maturity answers and policy pre-check (S5).
8. Define 3 success metrics: D1 band, average session, onboarding completion (S31, S50).
Pitfalls: skipping the progression engine; picking a hook that needs custom character animation or bespoke mesh pipelines beyond what the tooling can deliver; ambiguity about whether the game is solo or multiplayer.

### Recipe 2: Scope budget and cut list
When to use: right after the brief and again when anything slips.
Steps:
1. List every feature the idea implies. Tag each as tall (loop, save, progression, controls) or fat (extra models, cosmetics, extra zones) (S18).
2. Order tall first. Cap fat items so total build equals the tier budget.
3. Move everything else to a dated update list with an effort estimate under three weeks each (S27).
4. Re-check scope at each gate: if a phase runs over by 50%, cut a fat feature rather than extend the date (Synthesis from S13).
Pitfalls: adding a feature because another game has it; adding systems before the loop is fun; letting "coming soon" UI reach players.

### Recipe 3: Project scaffold with config, data and analytics
When to use: Phase 1.
Steps:
1. Create the folder layout in Phase 1; one ModuleScript per service; a `Config` module returning a table of all numbers.
2. Add a `Data` service: `DataStoreService:GetDataStore("PlayerData_v1")`; load on PlayerAdded with retries; periodic save about every 180 seconds as in the official sample; save on PlayerRemoving; `game:BindToClose` saves all remaining players (S40).
3. Add an `Analytics` module wrapping `AnalyticsService:LogOnboardingFunnelStepEvent` (server only, published games only) (S39).
4. Add `Remotes` folder with named remotes; every `OnServerEvent` validates types and ranges.
5. Run Test and Server and Clients (F7) to confirm no errors (S38).
Pitfalls: hard-coded numbers; trusting client values; forgetting that analytics events do not fire in Studio (S39), so verify after publishing to a private place.

### Recipe 4: Greybox prototype with kill or keep gate
When to use: Phase 2, and any time a new core mechanic is added.
Steps:
1. State the question ("is dragging items to the delivery pad fun for 5 minutes?").
2. Build with default Parts; one script drives the loop; expose Config variables (S58b).
3. Playtest with Server and Clients for 2 to 4 players (S38); run a first session yourself, then have 3 fresh testers play without instructions (S60).
4. Write the report: keep, change, kill (S58b).
5. If keep, freeze the loop and move to Phase 3; if change, one more round only.
Pitfalls: polishing before the gate; infinite iteration (limit to two rounds); mistaking novelty for fun, so test again after 24 hours with the same player.

### Recipe 5: Vertical slice and the first 60 seconds
When to use: Phase 3.
Steps:
1. Choose the most representative zone or round; build it to final quality (lighting, materials, UI, audio, VFX) (S59).
2. Script the first minute: spawn near the first interaction, glowing trail or arrow to it, first reward within about 30 seconds, next goal visible in the HUD (S25).
3. Add `LogOnboardingFunnelStepEvent` at 4 to 6 meaningful steps ("Spawned", "First Interaction", "First Reward", "First Upgrade", "Second Loop") (S39).
4. Add a timed hint for the step where testers stall, delay set just after the median completion time observed (S25).
5. Test unassisted with 3 players; note hesitations and wrong clicks (S59).
Pitfalls: long text tutorials; teaching all mechanics at once; hints that appear before most players finished; polishing a slice that does not represent the game.

### Recipe 6: Economy tuning pass
When to use: Phase 4 and before every event.
Steps:
1. Table each currency: sources (per minute at each stage), sinks (shop, upgrades, rebirth), and target time to the next unlock (shorter early, longer later) (S24, S28).
2. Compute expected value for any random drop: value times probability, summed; compare event versus non-event baselines (S28).
3. Put every number in Config; add a debug command to simulate 10 minutes of play and print currency over time.
4. For events, add a separate event currency and shop (S28).
5. After launch, log economy events and A/B test price points with Experiments or separate product IDs (S51, S25).
Pitfalls: unbounded faucets; event rewards flooding the main currency (the Feline Fishing Fun example in S28); copying prices from other games without testing.

### Recipe 7: Studio QA pass (multiplayer, mobile, failure injection)
When to use: Phase 6, and before every update.
Steps:
1. Test (F5) solo, then Server and Clients with 8 clients (F7); toggle client and server views to see authority bugs (S38).
2. Device Simulator on at least one small phone, one large phone and a tablet; Controller Emulator for gamepad (S38).
3. Network Simulator with added latency and packet loss; verify no desync or stuck UI (S38).
4. Failure injection: stop the server mid-save, rejoin quickly, fail a DataStore call (wrap in pcall, simulate error) (S40).
5. Run the Assistant playtesting agent beta or MCP playtest tools against the brief; fix reported mismatches (S43, S44).
6. Read the Output and Developer Console; zero warnings in a clean session.
Pitfalls: only testing as a single player; ignoring the 60 FPS mobile target; trusting Studio-only analytics (S39).

### Recipe 8: Publish package (settings, copy, art, audience)
When to use: Phase 7.
Steps:
1. File > Publish to Roblox; fill name, description, creator, devices (S2). Keep the experience Private.
2. Name: clear, genre-obvious, no money bait or copied titles (S33). Description: premise sentence, 3 features, controls, update note (S12).
3. Icon: square, 512 x 512 minimum, bold subject, legible at 150 x 150 (S35). Thumbnails: 3 to 10 at 1920 x 1080 from real gameplay, key content away from the bottom edge, activate at least two for thumbnail testing (S34).
4. Optional video preview: real gameplay only, under 3 MB (S34).
5. Complete the Maturity and Compliance Questionnaire from the actual content (S4, S5).
6. Audience: tell the owner which human steps remain (age check, two-step verification, subscription or fee, then the evaluation) and that the game starts with 16+ and Trusted Friends only (S6).
7. Set Limited visibility for the beta group; make Public only when Phase 8 gate passes (S2).
Pitfalls: misleading thumbnails (moderation and lower discovery) (S33, S34); forgetting to retake the questionnaire after an update changes content (S4); assuming a "questionnaire approved" label equals all-ages reach (S8).

### Recipe 9: Beta and metrics review
When to use: Phase 8.
Steps:
1. Closed beta via Trusted Friends or a group role; add an in-game feedback prompt after the first session and a Discord channel (S37).
2. Weekend open test once clean; capture D1, average session, onboarding completion, QPT (S37, S31, S32).
3. Plot the onboarding funnel; fix the largest drop-off first (S51).
4. Compare D1 and D7 with the genre band as a sanity check, noting third-party status (S50).
5. Decide: proceed to public, iterate one more week, or pivot the hook (S48).
Pitfalls: judging after fewer than 50 new users; reading D7 before seven days; reacting to opinion instead of behaviour (S59).

### Recipe 10: Weekly update cycle
When to use: Phase 9, every 7 to 14 days.
Steps:
1. Pick one metric to move and one content theme (S26).
2. Choose art-based content first (new items, pets, variants, zone reskin) so the effort stays under three weeks (S27).
3. Test the update in Server and Clients plus a Limited-visibility place copy; check the questionnaire impact (S4).
4. Release on a fixed day; host a short live session with players (S13).
5. Next week, read the cohort (the explore phase) and decide whether to expand or revert (S33).
Pitfalls: unannounced big changes; update quality dropping because cadence is too aggressive (S14); breaking saves with a schema change without a version migration.

### Recipe 11: Agent self-playtest loop (for an AI that drives Studio)
When to use: after each phase, instead of waiting for human testers.
Steps:
1. Start play via the MCP playtest tool; capture a screenshot of the first frame (S43).
2. Drive input to follow the first-minute script; record whether the first reward and goal appear within the time budget.
3. Read console output after the run; fix errors before anything else.
4. Stop play; repeat from a fresh state to check save and load.
5. Ask the owner (or friends via Trusted Friends) for a human run at each gate; agent runs do not replace observation of new players (S59).
Pitfalls: treating a passing scripted run as proof of fun; MCP clients can modify open places, so run only trusted clients (S43).

## Luau reference snippets

Onboarding funnel step (server only; fires only in published games):
```lua
local AnalyticsService = game:GetService("AnalyticsService")

local Analytics = {}

function Analytics.step(player: Player, step: number, name: string)
	local ok, err = pcall(function()
		AnalyticsService:LogOnboardingFunnelStepEvent(player, step, name)
	end)
	if not ok then
		warn("analytics step failed:", err)
	end
end

return Analytics
```

DataStore load and save with backoff and a shutdown handler (pattern from the official guidance: pcall, exponential backoff with jitter, capped attempts, save on leave and on shutdown):
```lua
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local store = DataStoreService:GetDataStore("PlayerData_v1")
local DEFAULTS = { version = 1, coins = 0 }
local cache: { [number]: { [string]: any } } = {}

local function withRetry(fn: () -> any, attempts: number): (boolean, any)
	for i = 1, attempts do
		local ok, result = pcall(fn)
		if ok then
			return true, result
		end
		task.wait(math.min(2 ^ i, 16) + math.random())
	end
	return false, nil
end

local function load(player: Player)
	local ok, data = withRetry(function()
		return store:GetAsync(tostring(player.UserId))
	end, 4)
	cache[player.UserId] = if ok and data then data else table.clone(DEFAULTS)
	-- if not ok, mark the profile read-only so a failed load never overwrites real data
end

local function save(userId: number)
	local data = cache[userId]
	if not data then
		return
	end
	withRetry(function()
		return store:UpdateAsync(tostring(userId), function()
			return data
		end)
	end, 4)
end

Players.PlayerAdded:Connect(load)
Players.PlayerRemoving:Connect(function(player)
	save(player.UserId)
	cache[player.UserId] = nil
end)

game:BindToClose(function()
	for userId in cache do
		task.spawn(save, userId)
	end
	task.wait(3)
end)
```
Note: this is the minimal shape. Session locking and failed-load protection belong to file 04 (ProfileStore).

Validated server remote (never trust client values):
```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local remote = ReplicatedStorage.Remotes.BuyUpgrade :: RemoteEvent
local lastCall: { [Player]: number } = {}

remote.OnServerEvent:Connect(function(player: Player, upgradeId: unknown)
	if typeof(upgradeId) ~= "string" then
		return
	end
	local now = os.clock()
	if (lastCall[player] or 0) + 0.25 > now then
		return
	end
	lastCall[player] = now
	-- look up upgradeId in Config on the server, check the player can afford it, then apply
end)
```

Timed hint (appears just after most testers finish a step):
```lua
local HINT_DELAY = 11 -- seconds; set from playtest data, not a constant for every game

local function watchStep(player: Player, isDone: () -> boolean, showHint: () -> ())
	task.delay(HINT_DELAY, function()
		if player.Parent and not isDone() then
			showHint()
		end
	end)
end
```

Config module with every balance number:
```lua
-- ReplicatedStorage/Shared/Config.luau
return table.freeze({
	StartCoins = 0,
	FirstRewardSeconds = 30,
	DailyRewardCoins = { 100, 150, 200, 300, 400, 600, 1000 },
	SaveIntervalSeconds = 180,
})
```

## Open questions / unverified
- Public-launch thresholds: the Kids and Select page (source stamped 2026-10-02) gives 250 plays and 50,000 Robux expedited, but the publishing page text and that page do not fully agree on the standard fee refund (publishing page: 1,000 Robux refunded at 100 highly engaged players for 60 days, one fetch returned 25; Kids and Select page: refunded 90 days after eligibility). The builder must not hard-code any of them. [S2][S6]
- Exact definition of "highly engaged" relies on a staff reply in a forum thread, not on the docs I read. [S9]
- No official absolute retention benchmark exists in the docs I read; the genre bands are third-party with unknown method. [S31][S50]
- Studio AI features move fast: Planning Mode, playtesting agent, NPC subagent and MCP details are 2026 and may have changed since the April and spring roadmap posts. [S44][S45]
- Postmortem coverage: no first-person postmortem was found for Steal a Brainrot, Rivals, Dead Rails or Doors (a Doors developer podcast exists but only its chapter list was readable); the Dress to Impress team is covered by a Roblox DevForum interview piece [S68]. GDC 2026 session titles and speakers are now known (Madsen, nosniy, Hufton, Kieft and others, [S47]) but not what they said; RDC 2025 and 2026 official pages name no hit-developer sessions [S58]. The sample of real accounts is skewed toward Roblox-sponsored spotlights and a few DevForum posts.
- Search budget for the research session ran out, so an extra DataStore, performance and device-memory deep dive was not done; see files 04 and 09.
- Several general game-dev sources (vertical slice, prototyping) are from 2011 and generic blogs; they are consistent with Roblox's own prototyping guidance but are not Roblox-specific.
- Time budgets per phase and the numeric gates are Synthesis, not sourced; calibrate after the first real runs.

## Sources
[S1] How Grow a Garden took off on Roblox, Janzen "Jandel" Madsen interview, GamesBeat, 7-8 Sep 2025, https://gamesbeat.com/janzen-madsen-interview/
[S2] Experiences and places (publishing), Roblox Creator Hub docs, read 2026-10-04, https://create.roblox.com/docs/production/publishing/publishing-experiences-and-places (and en-us/production/publishing/publish-experiences-and-places)
[S3] Configure experiences, Roblox Creator Hub docs, read 2026-10-04, https://create.roblox.com/docs/projects/configure-experiences
[S4] Content maturity, Roblox Creator Hub docs, read 2026-10-04, https://create.roblox.com/docs/production/promotion/content-maturity
[S5] Experience guidelines, Roblox Creator Hub docs, read 2026-10-04, https://create.roblox.com/docs/production/promotion/experience-guidelines
[S6] Roblox Kids and Select publishing requirements, Creator Hub docs, last updated 2 Oct 2026, https://create.roblox.com/docs/en-us/production/publishing/kids-and-select
[S7] Roblox's New Age Restriction Update is Killing Games Before They Even Launch, DevForum (Grandpar_LIoyd), 31 May 2026, https://devforum.roblox.com/t/robloxs-new-age-restriction-update-is-killing-games-before-they-even-launch/4661801
[S8] Game stuck at 16+ even though questionnaire has been approved for all ages, DevForum, 13-14 Jul 2026, https://devforum.roblox.com/t/game-stuck-at-16-even-though-questionaire-has-been-approve-for-all-ages/4735940
[S9] Experience limited to "Ages 16+ and trusted friends" despite Minimal rating, DevForum (staff reply by Soundmoji), 26-27 Jul 2026, https://devforum.roblox.com/t/experience-limited-to-ages-16-and-trusted-friends-despite-having-minimal-content-rating/4758340
[S10] Publishing Tier at Risk despite paying the 100k Robux exemption fee, DevForum bug report, 20 Jul 2026, https://devforum.roblox.com/t/publishing-tier-at-risk-despite-paying-the-100k-robux-exemption-fee/4747013
[S11] Roblox's new publishing and alternative requirements for Kids and Select go into effect on May 19, Nerdschalk, May 2026 (third-party press), https://nerdschalk.com/robloxs-new-publishing-and-alternative-requirements-for-roblox-kids-and-select-will-go-into-effect-on-may-19-heres-what-you-need-to-know/
[S12] How to publish a Roblox game (2026), obby.fun, updated 31 Aug 2026 (third-party), https://www.obby.fun/blog/how-to-publish-roblox-game
[S13] Creator Spotlight: The Story Behind 99 Nights in the Forest, Roblox DevForum, 2025, https://devforum.roblox.com/t/creator-spotlight-the-story-behind-99-nights-in-the-forest/4036940
[S14] Creator Spotlight: WoozyNate Makes a Splash with Fisch, Roblox DevForum, 22 Nov 2024, https://devforum.roblox.com/t/creator-spotlight-woozynate-makes-a-splash-with-fisch/3269481
[S15] Creator Spotlight: How Qwelver Dreamed Up Dandy's World, Roblox DevForum, May 2025, https://devforum.roblox.com/t/creator-spotlight-how-qwelver-dreamed-up-dandy%E2%80%99s-world/3639226
[S16] Creator Spotlight: BelowNatural's Journey Building Paradoxum Games, Roblox DevForum, 2024, https://devforum.roblox.com/t/creator-spotlight-belownatural%E2%80%99s-journey-building-paradoxum-games/3027035
[S17] From 0 to 2000 players in 4 weeks: "Fantasy Forest" launch post-mortem, DevForum (FriendlyStoneGolem), 5 Nov 2022 (older than 2024, may be stale), https://devforum.roblox.com/t/from-0-to-2000-players-in-4-weeks-fantasy-forest-launch-post-mortem/2044257
[S18] What 8 Years Of ROBLOX Development Taught Me, DevForum (FriendlyEvo), 26 Jun 2026, https://devforum.roblox.com/t/what-8-years-of-roblox-development-taught-me/4703824
[S19] So your game died... (a thread on game design and the market), DevForum (Jagriel_1), 13 Oct 2023 (stale), https://devforum.roblox.com/t/so-your-game-died-a-thread-on-game-design-and-the-market/2644450
[S20] Design games on Roblox (section index), Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design
[S21] Core loops, Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/core-loops
[S22] Prototyping, Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/prototyping
[S23] Design for Roblox, Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/design-for-roblox
[S24] Onboarding, Creator Hub docs (re-read in the gap pass; no 30 to 60 second statement found), https://create.roblox.com/docs/en-us/production/game-design/onboarding
[S25] Onboarding techniques, Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/onboarding-techniques
[S26] LiveOps essentials, Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/liveops-essentials
[S27] Content updates, Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/content-updates
[S28] Balance virtual economies, Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/balance-virtual-economies
[S29] Monetization foundations (game design), Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/monetization-foundations
[S30] Analytics essentials (game design), Creator Hub docs, https://create.roblox.com/docs/en-us/production/game-design/analytics-essentials
[S31] Retention analytics, Creator Hub docs, https://create.roblox.com/docs/en-us/production/analytics/retention
[S32] Analytics: New Experience Overview with Insights, Benchmarks, Realtime, DevForum announcement, 8 Aug 2024, https://devforum.roblox.com/t/analytics-new-experience-overview-with-insights-benchmarks-realtime/3108840
[S33] Discovery, Creator Hub docs, https://create.roblox.com/docs/en-us/discovery
[S34] Experience thumbnails, Creator Hub docs, https://create.roblox.com/docs/en-us/production/publishing/thumbnails
[S35] Experience icons, Creator Hub docs, https://create.roblox.com/docs/en-us/production/publishing/experience-icons
[S36] Ads Manager, Creator Hub docs, https://create.roblox.com/docs/en-us/production/promotion/ads-manager
[S37] Beta testing experiences, Roblox education developer docs, https://create.roblox.com/docs/en-us/education/developer/beta-testing-experiences
[S38] Studio testing modes, Creator Hub docs, https://create.roblox.com/docs/en-us/studio/testing-modes
[S39] Logging onboarding funnel events, Creator Hub docs, https://create.roblox.com/docs/en-us/production/analytics/funnel-events
[S40] DataStore best practices, Creator Hub docs, https://create.roblox.com/docs/en-us/cloud-services/data-stores/best-practices
[S41] Collaboration (Team Create), Creator Hub docs, https://create.roblox.com/docs/en-us/projects/collaboration
[S42] Roblox Assistant guide, Creator Hub docs, https://create.roblox.com/docs/en-us/assistant/guide
[S43] Studio MCP server, Creator Hub docs, https://create.roblox.com/docs/en-us/studio/mcp
[S44] Roblox Studio going agentic, Roblox newsroom, 15 Apr 2026, https://about.roblox.com/newsroom/2026/04/roblox-studio-going-agentic
[S45] Creator Roadmap 2026: Spring Update, Roblox DevForum, spring 2026, https://devforum.roblox.com/t/creator-roadmap-2026-spring-update/4625473
[S46] Creator Roadmap: 2025 End of Year Recap, Roblox DevForum, 2025, https://devforum.roblox.com/t/creator-roadmap-2025-end-of-year-recap/4156739
[S47] Roblox at GDC 2026, Roblox newsroom, March 2026, https://about.roblox.com/newsroom/2026/03/roblox-gdc-2026
[S48] How we build hit Roblox games, Dubit blog, 19 Mar 2026 (studio self-report), https://dubit.io/blog/how-we-build-hit-roblox-games
[S49] How to Build a Real Business on Roblox in 2026, Deconstructor of Fun (Aylin Yazici), 6 Apr 2026 (third-party trade press), https://www.deconstructoroffun.com/blog/how-to-build-a-real-business-on-roblox-in-2026
[S50] Retention Benchmarks by Roblox Genre, RoWatcher News, undated (third-party), https://rowatcher.com/news/retention-benchmarks-by-roblox-genre-what-good-actually-looks-like
[S51] The Roblox Analytics Stack: How Studios Win With Data in 2026, RoWatcher News (third-party), https://rowatcher.com/news/the-roblox-analytics-stack-how-studios-win-with-data-in-2026
[S52] Mobile vs Desktop on Roblox in 2026, RoWatcher News, Q4 2025 data (third-party), https://rowatcher.com/news/mobile-vs-desktop-on-roblox-who-s-playing-what-in-2026
[S53] Dress To Impress: how a teen developer's fashion game hit 9.7 billion visits, RoWatcher News, 2026 (third-party), https://rowatcher.com/news/dress-to-impress-how-a-teen-developer-s-fashion-game-hit-9-7-billion-visits
[S54] Newzoo: Roblox as a Platform in 2025, via Game Developer Reports (Substack), 23 Oct 2025 (third-party), https://gamedevreports.substack.com/p/newzoo-roblox-as-a-platform-in-2025
[S55] Roblox Adopt Me devs launch Uplift Games, PocketGamer.biz, 11 May 2021 (stale), http://www.pocketgamer.biz/roblox-adopt-me-devs-launch-uplift-games/
[S56] KreekCraft has spent over $100,000 making a Roblox game, Tubefilter, 9 Mar 2026, https://www.tubefilter.com/?p=191215
[S57] Why we should stop saying "vertical slices", Clinton Keith, Game Developer, 1 Dec 2011 (stale, general game dev), https://www.gamedeveloper.com/design/why-we-should-stop-saying-vertical-slices-
[S57b] Performance optimization overview, Creator Hub docs, https://create.roblox.com/docs/en-us/performance-optimization
[S58] RDC 2025 key announcements (fetched in the gap pass: 111.8M DAU, DevEx rate up 8.5%, no named creator sessions), Roblox newsroom, Sept 2025, https://about.roblox.com/newsroom/2025/09/roblox-rdc-2025
[S58b] Prototyping tips, Alistair Doulin, Game Developer, 18 Feb 2011 (stale, general game dev), https://www.gamedeveloper.com/business/prototyping-tips
[S59] How to scope a vertical slice, Bugnet, 1 Jun 2026 (indie blog), https://bugnet.io/blog/how-to-scope-a-vertical-slice
[S60] How to run a playtest, Bugnet (indie blog), https://bugnet.io/blog/how-to-run-a-playtest
[S61] Publish checklist, community "roblox-game-skill" (third-party, used only as a cross-check for checklist ideas: data, security, performance, monetisation, mobile, metadata, analytics), https://mintlify.wiki/brockmartin/roblox-game-skill/workflows/publish-checklist
[S62] Roblox Innovation Awards 2025 coverage (Variety, Grow a Garden best new experience; superseded by the full winner list in [S64]), https://variety.com/2025/digital/news/grow-a-garden-roblox-innovation-awards-2025-winners-1236510387
[S63] A new way to test before launch: Experience Betas, Roblox DevForum announcement, 2025-12-11, https://devforum.roblox.com/t/a-new-way-to-test-before-launch-experience-betas/4144485
[S64] Roblox reveals 2025 Innovation Awards winners, PocketGamer.biz, 2025-09-09, https://www.pocketgamer.biz/roblox-reveals-2025-innovation-awards-winners/
[S65] 2026 Roblox Innovation Awards Showcase What's Possible on Roblox, Roblox newsroom, Sept 2026 (ceremony 2026-09-12), https://about.roblox.com/newsroom/2026/09/2026-roblox-innovation-awards
[S66] Publishing doc and Kids and Select doc, raw Markdown re-read in the gap pass (limits of 100 MB, 5 per day, 1,000 Robux fee; Kids and Select source stamped 2026-10-02), https://create.roblox.com/docs/en-us/production/publishing/publish-experiences-and-places.md and https://create.roblox.com/docs/en-us/production/publishing/kids-and-select.md
[S67] Roblox launches new video series spotlighting developers of top games, Tubefilter, 2026-09-09, https://www.tubefilter.com/2026/09/09/roblox-developer-spotlight-series-20th-anniversary/
[S68] Behind The Games: Midnight Racing: Tokyo, Dress to Impress, and Michael's Zombies, Roblox DevForum, Aug 2024, https://devforum.roblox.com/t/behind-the-games-midnight-racing-tokyo-dress-to-impress-and-michael%E2%80%99s-zombies/3131289
[S69] Roblox Is Coming to GDC 2026 With Big Claims, Bigger Numbers, and a Blueprint for the Future of Small-Team Game Dev, Endsights, March 2026 (summary of the Roblox GDC page: 144M DAU, "fewer than 10" claim), https://endsights.com/roblox-roblox-at-gdc-2026-where-to-find-us-all-week
[S70] Millions of Kids Play Dress to Impress on Roblox. Now Meet the People Behind It., Crossplay (undated; about 30 developers), https://www.crossplay.news/p/who-makes-dress-to-impress-on-roblox
