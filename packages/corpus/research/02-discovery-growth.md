# Discovery and growth on Roblox (2024-2026)
_Researched 2026-10-04 by Claude (deep researcher agent, topic 02). Sources: 75. Most Roblox pages were read through a fetch tool that summarises the page, so every exact number below should be re-checked on the cited page before it is hard-coded anywhere. Items flagged "unverified" or "conflict" are called out in the last section._

## Key facts

### A. How the Home recommendation system works (the single most important surface)
- Over 90% of platform traffic starts on Home, and Home's "Recommended For You" (RFY) sort is where almost all organic discovery happens [S2][S12][S13]. In Feb 2024 Roblox said the Discover/Charts page got under 5% of traffic [S13]. Roblox said discovery served 10.5 billion impressions per day in March 2025 [S12] (the summary of this post quoted a "7.5 billion annually" comparison that does not parse; treat it as unclear).
- RFY is a two-stage system. Stage 1, retrieval, picks a candidate subset using engagement, retention and monetisation. Stage 2, ranking, personalises and orders that subset per user [S1]. External traffic (ads, curation, friends, search, social links, teleports, notifications) can help get a game considered in retrieval, but only the behaviour of users who arrived through RFY itself counts as ranking input [S1][S2][S31]. Ads do not hurt organic distribution, and they do not help it either [S31].
- Signals are per-user averages, not totals, so a small game with engaged players is not penalised against a big one [S1]. Roblox says benchmarks shown in analytics are not an input to the algorithm [S1][S26].
- Explore and expand: after an update or a change, a game may get a burst of impressions (explore). If that cohort engages and monetises well, distribution scales (expand). When distribution rises, players settle into a new baseline and signals fluctuate before stabilising [S1].
- Signal list as currently documented (the docs split each signal into Day 1, Day 2-7 and Day 8-28 windows) [S1][S3]:
  - Most important: play-through rate (PTR) from RFY impressions; first-play bounce rate (a negative signal, measured for sessions under 60 seconds and 61-180 seconds); play days per user; playtime per user (capped at 60 minutes per day).
  - Important: intentional co-play days (joining friends by join/invite, private or reserved servers); qualified play sessions; spend days per user; Robux spent per user.
- History of the signal set (do not use the older versions as current):
  - Jul 2024: qualified play-through rate (qPTR) introduced as the dashboard conversion metric; a qualified play means intentional engagement, not an accidental click or quick bounce [S32].
  - Nov 2024 test: how often users return to play, spend and interact with friends added as retention indicators on top of play-through, D1/D7 retention, playtime, payer conversion and Robux spent [S10].
  - 31 Mar 2025 "improved RFY": six signals on 7-day windows: qPTR, 7-day playtime per user (60 min/day cap), 7-day play days, 7-day spend days, 7-day Robux spent, 7-day intentional co-play days. Update 11 Dec 2025: play in reserved servers now counts as intentional co-play, and click/play attribution fixed to RFY only [S2].
  - 9 Mar 2026 plan and 26 Mar 2026 update: new "deep play-through rate" (sustained interest beyond the qualified-play funnel), new "7-day qualified play sessions per user" signal, user "not interested" feedback integrated into ranking, stats visible in Creator Analytics [S9][S39].
  - 10 Apr 2026 test and 15 Jun 2026 rollout: windows widened from 7 days to 28 days (Day 1, Day 2-7, Day 8-28); qPTR replaced by plain PTR plus first-play bounce rates [S3][S4]. Roblox's Q2 2026 letter says the RFY change went in during April 2026 and "intentionally" gives more impressions to highly retentive games at the cost of near-term monetisation [S59]. The Q1 2026 letter says Roblox was "experimenting" with algorithms and home layouts that directly optimise for 28-day retention [S60].
  - 6 Aug 2026 (Chief Growth Officer John Ciancutti): a further Home update, targeted for late August or early September 2026, to better recognise long-term retention and sustainable monetisation. Games strong in both get broader distribution; strong in one only keep impressions but may see changes. Guidance: low retention, fix core gameplay first; high retention, improve monetisation thoughtfully [S7][S8].
- Roblox's stated rationale: short-term metrics favour games with exciting thumbnails but little long-term value; the new design should reward games players return to, bring friends to, and spend in [S6]. Ciancutti's posts are the most authoritative recent statement of intent.
- Four things move a game's Home impressions: its own updates, algorithm changes, seasonality (Saturday peaks, weekday dips, summer/back-to-school/holiday patterns) and competition from stronger games [S1].
- Quality gates that reduce reach [S1]: leading with giveaways in metadata (for example "Robux! Play now!"), metadata that does not match gameplay (dinosaur art, generic obby), and non-unique content (same title and visuals as an existing game). Games over these limits see a daily banner on the Creator Dashboard; all games are re-assessed after updates. Crash rate and quality issues also hurt discovery [S10].
- Developer-reported impact of the 2026 change (anecdotal): after the 10 Apr 2026 test announcement a developer reported a 70-80% drop in Home impressions and CCU for a young tycoon game with 340 peak CCU; no staff reply in the thread, and other developers argued the game was low quality. Newer games lack 28-day history, which plausibly explains some drops, but that is inference, not a Roblox statement [S5][S4].
- Platform context: Q1 2026 DAU 132M (+35% YoY), hours 31B; Q2 2026 DAU 123M (+10% YoY, Russia unblocking in late June about a 3-point headwind), hours 29B (+5%), bookings $1.557B (+8%), monthly unique payers 27M. Roblox blamed lower per-hour monetisation as engagement moved from 2025 viral games to new and evergreen games, plus the RFY change [S59][S60]. In Q1 2026, experiences outside the top 10 grew engagement 43% and Robux spend 41% YoY and made up 65% of spend growth [S60]. Takeaway: the 2026 algorithm is deliberately widening the pool of games that get traffic.

### B. Other discovery surfaces
- Home sorts besides RFY: Continue Playing, Friends, Sponsored, curated sorts, Standout Games (hand-picked novel games, replaced Today's Picks in 2026), Live Events, Recommended Paid Access Experiences, a personalised Avatar sort (Apr 2026) [S1][S9][S12].
- Personalised placement: "People You May Know" and "Continue" got dynamic ranking in Jan 2025; Dec 2025 fixed the first two Continue slots to the latest-played games; one-click genre tags were added to the search landing page [S11].
- Charts (formerly Discover; renamed in July 2024 per a news report, S14 context): non-personalised, statistics-driven sorts. May 2024 test introduced Top Trending, Top Revisited, Fun with Friends, feature-themed sorts (for example voice chat) and genre sorts. Sorts are scored on freshness (top-10 overlap versus prior weeks, averaged over 4 weeks), whole-page uniqueness and quality (safety filters, DAU thresholds). Genres are assigned by consensus of human evaluators, not by the creator. Nov 2024: filter by country and device [S14]. Top Playing Now (CCU-based, live globally by Apr 2025) [S15]. Trending Events in Experiences needs an event that started within 7 days, at least 1,000 RSVPs and public visibility [S46].
- Standout Games: a curated Home sort for novel games (new mechanics, distinctive visual style or underrepresented genres; priority genres RPG, strategy, puzzle, shooter and unusual mixes). Not for copies or reskins. Creators nominate through a form with gameplay footage, trailer, localisation and compliant thumbnails [S50][S9]. Today's Picks (pilot Apr 8 - May 3 2024) was the earlier version, human-curated for English-language US users, needed cross-platform support [S49].
- Search: semantic natural-language search ("food games", "avatar editors"); most searches are broad topics like horror or roleplay (about 50M+ searches a day per a Roblox data release summarised in search results; unverified at primary level) [S1][S13]. Recently Visited in Search was added in early 2025 [S11][S12].
- Notifications: social notifications, milestones, friend activity and score updates [S1]; developer-sent experience notifications are covered below.
- Matchmaking: servers are pre-warmed so about 70% of joins are instant (Feb 2024 figure, may be stale) [S13].
- Moments: Roblox's short-form clip feed (beta, 13+, clips up to 30 seconds, "Join" button on a clip). Roblox cited 930M screenshots (24 Jul-24 Aug 2025) and 240M videos captured since the July 2025 launch [S56]. Creator APIs: Captures (available), Upload API in CaptureService (beta), RecommendationService (beta) [S57].

### C. Presentation: icon, thumbnails, video, title
- Icon: square, at least 512x512 so it always renders in high resolution; shown as small as about 150x150 in places; must pass moderation; one icon per supported locale; should reflect theme, tone and genre [S22].
- Thumbnails: 16:9, ideal 1920x1080; jpg, gif, png, tga, bmp; home-page thumbnails must be under 3 MB; up to 10 images/videos on the details page [S21].
- Thumbnail personalisation (live 13 Nov 2024): upload up to 5 thumbnails, set 2-5 "active"; with a single active thumbnail there is no personalisation. Roblox uses a multi-armed bandit: impressions start evenly split, then hourly shift toward thumbnails with higher qPTR for each user group (age, genre interest and similar). Test result: +8.5% average qPTR, up to +50% [S17][S18][S21]. July 2025 change: new thumbnails are tested while most traffic stays on the existing winner (+0.19% qPTR, 21% fewer impressions on non-winners); Roblox advises always keeping your highest-qPTR thumbnail in the set [S19]. The launch post says keep several thumbnails active rather than pruning early, and test new ones around major updates [S18]. A figure of "1,000+ DAU for meaningful results" appeared in one summary and is unverified.
- Gameplay video (details page free from Nov 2025; on Home inside RFY from mid-2026): upload in Creator Hub > Configure > Places > Videos; quota 3 uploads per month; 24-hour moderation; must be real, current, representative gameplay showing the core loop in the first seconds; no cinematic trailers, dramatised gameplay, enhanced graphics, real-life footage, voice-over, narration, lyrical music, promo text or outdated content [S21][S23][S24][S25]. Autoplay on desktop hover and on mobile when scrolling stops; ranking itself is unchanged, video only adds context [S9]. Results: Standout Games video test +47% quality plays and +1.09% playtime; RFY test up to +39% playtime; two named games saw +30%/+41% RFY plays and +31%/+39% RFY playtime (June 2026, "directional only") [S9][S23]. YouTube embeds on details pages are removed from 30 Sep 2026 (adding new ones was disabled since Nov 2025) [S24].
- Metadata rules from the docs: accurate, unique, trustworthy (no reward promises), thumbnail set must match actual gameplay; add an original twist (title, art, description, mechanics) when entering a trending genre [S1]. Aug 2025 test showed genre labels and social-proof tags ("Top Trending", "Up-and-Coming") on RFY tiles in addition to ratings [S16]. Late-2026 roadmap lists "name checks and promotional text" to protect titles and allow update announcements [S35].

### D. Analytics and benchmarks
- Creator Analytics pages: Home, Overview, Acquisition, Retention, Engagement, Monetization, Insights, Avatar Items, Share Links; later custom dashboards (up to 20 per game), an Explore page, alerts and segmentation [S26][S34][S35]. Similar-experience benchmarks update daily for games with 100+ DAU [S26]; similar-experience benchmarks need at least 50 similar experiences, with genre as fallback [S32]. Oct 2025: retention by acquisition source plus a genre/similar benchmark toggle, red/yellow/green colouring [S31].
- Acquisition sources tracked: Home recommendations, Continue Play, Curation, Charts, Search, Sponsored and Search ads, Teleport (other games), Other (external links) [S30][S33]. External tracking links come via Share Links [S26].
- Definitions: D1 retention = new users who play again the next day after first play; D7 and D30 similar; cohorts are daily (first 10 days) or weekly (10 weeks). Session time = total time / number of sessions. Payer conversion = share of DAU who pay; ARPPU = revenue per paying user; ARPDAU = conversion x ARPPU [S27][S28][S29].
- Roblox's own docs give no numeric "good" thresholds, but they say large influxes of new users temporarily lower retention (normal) and advise keeping the first-time experience to 5 minutes or less and watching for drops in first-session retention after minute 5 [S27][S28].
- Third-party numbers (GameAnalytics, sample of 500+ Roblox titles with 1M+ monthly users, 1 Aug 2025 - 31 Jul 2026, 4.76B sessions; these are large established games, not new ones) [S61]:
  - D1 retention median 10.3%, top 1% 22.2%; D7 median 1.6%, top 1% 9.1%; D30 median 0.5%, top 1% 4.7%.
  - Average session length median 9.8 min, top 1% 21.1 min; 1.56 sessions per player per day median.
  - Paying players 3.80%; ARPPU per game median $0.70, top 1% $55.31.
- GameAnalytics 2025 report (Jan 2023 - Jul 2025; about 47% of platform engagement) by average session length bucket [S62]: games with 13-18 minute sessions had median D1 10.24%, D7 1.20%, D30 0.34%; 19-24 minutes median D1 11.46%, D7 1.61%, D30 0.46% and 98th percentile D1 32.3%; 0-3 minute sessions had median D1 4.31%, D7 0.41%. Rule of thumb from this: longer average sessions go with higher retention, but depth does not automatically monetise (the 25+ minute bucket sometimes had lower ARPPU than 19-24).
- Blog "good/great/excellent" tiers (D1 20/30/40%, D7 8/15/20%, D30 3/7/10%) seen in aggregator pages are not from Roblox or GameAnalytics and are unverified; treat as ambition targets only.

### E. Growth levers you can build or buy
- Ads Manager (replaced Sponsored Experiences flow; 91% of ad spend used the new flow by Aug 2025) [S42][S44]. Formats: sponsored game tiles on Home and Search (16:9 creatives). Objectives: Plays, Earnings (restricted to well-monetised games), Engagement (age-checked, highly engaged players, for Kids/Select qualification), plus Acquire New Users (180+ day lapsed or new), Drive Retention, Reactivate (Aug 2025) [S40][S42][S43]. Audience segments: all, new, recent (10K+ threshold), lapsed (20K+); targeting by location, age, gender, genre, device [S40]. Reporting delay up to 48 hours; moderation about 24 hours; attribution window up to 30 days; give a campaign 7-10 days before judging; pausing within 24-48 hours resets learning [S40][S43].
  - Thumbnails: moved from 1:1 to 16:9 (up to +40% PTR; the Aug 2025 post cites +57% qualified PTR); 5 per campaign at launch, 10 later, 25 by May 2026; Sponsored sort placement became personalised from row 2 to row 10 (+13.4% quality plays estimated) [S41][S42][S43].
  - Prices: the 2023 post set 1 ad credit = 285 Robux, 10-credit minimum (5/day for 2 days), cost-per-play bidding, a "play" = click, details page, enter within 1 hour [S44]. Aug 2025 posts report average cost per play around $0.008 (maximise plays), $0.007 (retention), $0.011 (reactivation) and complaints that minimums are high for small developers [S42]. Featured Tile beta requires at least a US$5,000 investment [S43]. The docs page only states that 1 ad credit is the minimum conversion [S40]. Current minimums are unverified.
  - Ads on Home now blend into RFY rather than sit in isolated rows, and ad-acquired behaviour never feeds organic ranking [S9]. Advanced Join Options let ads deep-link with LaunchData for custom spawn or rewards [S39].
  - An experienced developer's view (May 2025): about $100 per day for a week as a test, then concentrate spend in a burst; one project spent $0 on ads and got about 90% of players from the algorithm [S45].
- Experience Events and Updates: up to 10 ongoing or upcoming events per experience; up to 5 thumbnails; categories; public events appear on the details page and an event page; players can RSVP; push notifications on start; event ID read from the join data context; update announcements limited to one per 3 days and 60 characters; off-platform featuring requires submission at least 7 days ahead [S46][S48]. Roblox said event discovery was a top priority after June 2024 [S48]; a Sept 2024 test moved events into a dedicated sheet on the details page [S47].
- Friend referral system (GA Apr 2025): players invite friends (including off-platform) through the default invite menu or invite prompts; `ReferredByPlayerId` in `Player:GetJoinData()` identifies the inviter; creators publish a reward banner in Creator Hub (Engagement > Referral Rewards) and grant badges or currency; paid items cannot be rewards; the game must be live at least 1 day; links do not expire; Roblox cited co-play sessions as 1.9x longer than solo sessions (Q2 2024 data) [S51][S52].
- Invite prompts: `SocialService:CanSendGameInviteAsync` then `PromptGameInvite` with `ExperienceInviteOptions` (PromptMessage, InviteUser, InviteMessageId, LaunchData up to 200 characters); the invitee's data shows in `GetJoinData()` after a short delay [S54].
- Experience notifications: 13+ players only who opted in; one per user per day per experience; notification text strings up to 99 characters created in Creator Dashboard; sent through Open Cloud `createUserNotification`; the opt-in prompt is `ExperienceNotificationService:PromptOptIn` (not shown to under-13s, already opted-in users, or within 30 days of the last prompt); game needs 100+ visits; do not gate gameplay behind opt-in; avoid false urgency [S55].
- Affiliate program (pilot launched Sep 2024): up to 50% of new users' Robux spend in their first six months, capped at $100 per user, for approved creators with off-platform reach; pilot status, current availability unverified [S53].
- Experiments, Betas, Configs and alerts (Aug 2026): A/B test features, ship values live, harm-detection alerts when playtime, ARPU or conversion dips; segmentation dimensions (in-game activity, engagement level, platform activity, tenure, platform spend) [S34][S37].
- Case-study evidence that events and social loops drive CCU: Grow a Garden (released 26 Mar 2025) and Steal a Brainrot (released 16 May 2025) staged a joint "Admin Abuse war" on 23 Aug 2025, posted on TikTok, X and Discord; Grow a Garden peaked 21.1M and Steal a Brainrot 20M that day while the platform hit 47.4M concurrent [S68][S69][S70]. Steal a Brainrot later hit 25.4M (Oct 2025) per Wikipedia citing press [S69]. An academic-style essay credits time-gated timers, randomised rewards and viewing others' collections as growth loops, and notes tens of millions of short-video views of kids reacting to thefts [S71][S69]. Digiday (Sep 2025) reports top-10 creators earning about $38.5M a year and tension with ads [S72].

### F. Audience-access changes that now gate reach (2025-2026)
- Since 6 Nov 2025, users under 18 no longer see Restricted-label experiences in search or recommendations (snippet-level source only; verify) [S74].
- Roblox Kids (ages 5-8) and Roblox Select (9-15) accounts launched globally on 16 Jun 2026 after a regional pilot from 20 May. Kids see Minimal and Mild only; Select sees up to Moderate; social hangouts, sensitive-issue games and free-form drawing games are excluded by default; the catalogue is dynamically updated [S64][S67]. To be available to under-16s a game must clear an evaluation: creator verification (ID or facial age estimation, two-step verification), a publishing fee or 2 consecutive months of Roblox Plus/Premium, and engagement from highly engaged age-checked players [S63][S64][S65].
- The threshold is in conflict: the official docs page I read says 250 unique plays from highly engaged, age-checked users within 60 days, while the staff AMA and a community thread say 500 highly engaged 16+ users per month; the AMA also names a 1,000 Robux refundable per-game fee, and the docs name a 50,000 Robux expedited review [S63][S65][S66]. Docs pages are generally more current than a thread, but re-check before relying on any of it. The AMA states social-hangout games are now rated 16+ minimum [S65]. A "Select Eligibility"/Audience Reach dashboard in Creator Hub tracks progress [S63][S67].
- Practical consequence: a brand-new game starts effectively 16+ only until it gathers qualifying engagement, so early traffic quality (age-checked, engaged users) matters more than before.

## How to apply it (rules for an AI builder)

DO
- DO design for the 28-day curve, not the launch spike: build a first session (day 1), reasons to return within a week (day 2-7: daily reward, timer, quest chain, friend goal) and mid-term content (day 8-28: zones, rebirth tiers, events, collections). The algorithm now scores these windows separately [S3][S1].
- DO make the first 60 seconds count. First-play bounce is a negative signal at under 60 s and 61-180 s [S1]. Spawn the player next to an interactive object, give a reward within 15-30 s, show the core loop by 60 s, and keep the full FTUE to 5 minutes or less (Roblox's own analytics advice) [S27][S28].
- DO instrument the funnel: log onboarding steps with `AnalyticsService:LogOnboardingFunnelStepEvent`, economy flow with `LogEconomyEvent`, progression with `LogProgressionStartEvent/CompleteEvent`, and custom events with `LogCustomEvent` (all server-side, take the Player) [S74 API ref: see Luau section].
- DO build co-play in: private-server friend invites, shared goals, group boosts, a visible "invite friends" button wired to `SocialService:PromptGameInvite`, and the Friend Referral reward banner. Co-play days are a ranked signal and co-play sessions run about 1.9x longer [S2][S52].
- DO add monetisation that fits the loop once retention is healthy: spend days and Robux per user are both signals, and Roblox's Aug 2026 message is that retention plus sustainable monetisation wins [S7]. Offer low-priced first-purchase items (welcome offers, multiple price tiers) per Roblox's monetisation guidance [S29].
- DO prepare 3-5 distinct 16:9 thumbnails at 1920x1080 (under 3 MB) that all depict real gameplay or the real world: for example (1) hero action shot, (2) rare/pet or reward close-up, (3) social shot with several avatars, (4) update/event banner, (5) a first-person or alternate-angle shot; activate at least 2 so personalisation runs, and keep the best-performing one active [S17][S19][S21].
- DO make a square 512x512 (author at 1024x1024) icon with one high-contrast subject and no small text; verify readability at 150x150 [S22].
- DO upload a real gameplay video (short, core loop in the first seconds, no narration or lyrics) via Creator Hub > Places > Videos; remember the 3 per month quota and 24 h review [S23][S24].
- DO write the title and description about the actual gameplay and genre keywords players search ("horror", "tycoon", "fishing"); add an original twist if the genre is trending [S1].
- DO schedule events and updates: use Experience Events (thumbnail per event, public, RSVP) and one update announcement per 3 days max; read `GameJoinContext.EventId` to tailor event arrivals; plan updates at predictable intervals so each one can produce an explore-then-expand impression window [S46][S1].
- DO use Experiments/Configs where available to ship changes safely and watch for harm alerts [S34].
- DO check Creator Analytics > Acquisition > Home Recommendations first when traffic changes, and use retention by acquisition source to separate ad cohorts from RFY cohorts [S1][S31].

DON'T
- DON'T put "free Robux", codes-for-Robux or giveaway wording in titles, descriptions or thumbnails: it is a named reach penalty [S1].
- DON'T clone an existing hit's name, icon or key art: non-unique content is penalised and a copy can be both de-ranked and moderated [S1].
- DON'T use misleading thumbnails (art that the game does not deliver): mismatch is penalised and video must be authentic [S1][S21].
- DON'T rely on paid ads to prop up retention metrics: ad cohorts do not count in ranking, and D1 retention from "Other" sources is usually lower than from Home [S31].
- DON'T judge a thumbnail after a few hours or prune variants early; personalisation re-weights every hour per segment [S18].
- DON'T send notifications without opt-in, more than 1 per day, or with fake urgency; DON'T gate gameplay on opting in [S55].
- DON'T expect a big sudden spike to persist; Roblox treats spikes as exploration and a post-spike retention dip as normal [S1][S27].
- DON'T target under-16 audiences in new games without checking Kids/Select eligibility, the maturity label and the creator-side requirements [S63][S64].

Numbers worth hard-coding as defaults for generated games
- First reward <= 30 s, first "level up" or unlock <= 90 s, FTUE <= 5 min [S27][S28 and rule above].
- Playtime counts up to 60 min per day per user; design for repeat days, not for one marathon [S1].
- Daily reward loop with a 7-day escalating streak, plus a Day-8-to-28 content ladder (zones/tiers unlocked at roughly day 3, 7, 14, 21).
- Thumbnail set: 3-5, 1920x1080 16:9; icon 512x512; video 1 per major update (3 per month quota).
- Update cadence: a visible update or event about every 1-2 weeks for a live game (practice from top games, S70; not a Roblox rule).

## Recipes (each becomes a skill)

### Recipe 1: Discovery-ready game page (title, description, icon, thumbnails, video)
When to use: before the first public publish, and before every big update.
Steps:
1. Write a title of 2-4 words that names the genre plus a hook (for example "Fishing Frenzy: Deep Sea"), with no reward or "free" wording. Keep the first sentence of the description a plain statement of what the player does, then 2-3 genre keywords a player would search.
2. Capture 5 screenshots from Studio play-test at 1920x1080 (Studio screen capture or the in-game capture tool), each showing real gameplay: hero action, reward moment, social/multiplayer, new-content shot, alternate-angle shot. Use bold subject, readable at 25% size, no more than 3 words of text.
3. Export the icon at 1024x1024 and downscale to 512x512; one subject; check at 150x150.
4. In Creator Hub > Creations > Places > Thumbnails > Home Page tab, upload and mark 2-5 thumbnails active.
5. Upload a 15-30 second real gameplay clip in Places > Videos; first 3 seconds show the core loop; no narration, no lyrics, no overlay text.
6. After 24-48 h, check per-thumbnail qPTR/PTR data in thumbnail analytics and keep the best one active when adding new ones.
Pitfalls: stock art or AI art that the game does not match; text-heavy thumbnails; deleting the winning thumbnail; videos longer than needed; posting a trailer instead of gameplay.

### Recipe 2: First-five-minutes onboarding that lowers first-play bounce
When to use: every new game; re-run if Acquisition shows high bounce or low D1.
Steps:
1. Spawn: place the SpawnLocation within 20 studs of the first interactive thing; Camera and controls should work with no tutorial text.
2. 0-15 s: one obvious action (tap/click a glowing object, collect, hit, plant). Give currency immediately.
3. 15-60 s: first upgrade or first unlock the player can afford; show a floating goal ("Buy your first pet: 100 coins") using a BillboardGui or a HUD tracker.
4. 60-180 s: second loop iteration with bigger reward; first social hook (leaderboard rank, "invite friend" for a bonus).
5. 3-5 min: first milestone (zone gate, rebirth teaser, daily reward claim) that sets up a reason to return tomorrow.
6. Log each step with `LogOnboardingFunnelStepEvent` (step number and name) and review drop-off per step in Analytics.
Pitfalls: walls of tutorial text; forcing a menu before action; cutscenes; gating the first reward behind a purchase or opt-in.

### Recipe 3: Day-1 / Day-7 / Day-28 retention ladder
When to use: during design, before content planning.
Steps:
1. Day 1: finish FTUE; set a visible "come back tomorrow" reward (daily gift at the next UTC day).
2. Day 2-7: daily login streak (escalating rewards, reset or soft-reset rule), one 3-day quest chain, a timer-based reward (plants growing, eggs hatching) that completes while offline, and a friend goal.
3. Day 8-28: two unlockable zones or tiers, a collection book, a weekly event, a rebirth or prestige loop, and leaderboards with weekly resets.
4. Add a weekly content drop or limited item so lapsed players have a reason to return.
5. Track D1/D7/D30 in Analytics > Retention (weekly cohorts) and compare against similar-experience benchmarks.
Pitfalls: all rewards front-loaded in day 1; streak punishments that cause churn; no content past hour 3; ignoring that playtime is capped at 60 min per day in ranking.

### Recipe 4: Friend invite prompt plus referral reward
When to use: any game with co-op, social or progression boosts.
Steps:
1. Add an Invite button in the HUD (LocalScript) that calls the invite prompt (see Luau section).
2. Build the server join handler that reads `Player:GetJoinData().ReferredByPlayerId`, grants the invitee a welcome bonus and the inviter a reward (badge or currency), and records the grant in a DataStore so each invitee pays out only once.
3. Cap rewards per inviter (for example 3-5) and add a cooldown to prevent abuse.
4. In Creator Hub > game > Engagement > Referral Rewards, create the banner (icon, name, description, dates, limit). Only one banner shows at a time; paid items are not allowed as rewards.
5. Test with a second account or the Studio multi-client test.
Pitfalls: granting rewards on every join (not once); using Robux-purchasable items as the reward; not retrying `GetJoinData()` for invite `LaunchData`.

### Recipe 5: Event and update calendar
When to use: once the game is live and has at least a few days of data.
Steps:
1. Plan one visible beat per 1-2 weeks: small update; every 4-6 weeks a themed event with a limited item.
2. In Creator Dashboard > Engagement > Events & Updates, create the event: title, subtitle, description, category, start and end time, spawn place, 1-5 distinct thumbnails, public.
3. Keep promotional update announcements to one per 3 days, 60 characters, about the new feature itself.
4. In code, read `GameJoinContext` for the event ID (guarded) and show an event welcome panel or bonus.
5. If the event is significant, toggle "Submit for Featuring" at least 7 days before the start.
6. Post the event off-platform (short clip plus Discord) 24-72 hours before.
Pitfalls: event with no unique thumbnail; vague update text; events that require a purchase; running updates that break progression and spike bounce.

### Recipe 6: Opt-in notifications for re-engagement
When to use: games with timers, events, or friend actions; players 13+.
Steps:
1. After a positive moment (first reward claimed or milestone), call the opt-in prompt from a LocalScript.
2. Create notification strings in Creator Dashboard (up to 99 characters) such as "Your crops are ready, {displayName}".
3. Send from a server-side process via Open Cloud `createUserNotification` (Luau package from Creator Store) when the timer completes or a friend acts; at most one per user per day.
4. Pass LaunchData to land the player at the right spot.
Pitfalls: prompting at first join; blocking gameplay until opt-in; fake urgency; sending to under-13 users.

### Recipe 7: Paid acquisition test (Ads Manager)
When to use: after retention is acceptable and the page assets are ready, or to jump-start a new game.
Steps:
1. Create 3-10 thumbnails at 16:9 that match the page; pick Plays for a new game (Earnings is for well-monetised games).
2. Start with a small daily budget for 7-10 days, continuous; do not edit or pause during the first 24-48 hours.
3. Review cost per play, 7-day playtime and 30-day Robux per user in the report; compare D1/D7 for the "Ads" source in retention by acquisition source.
4. Scale only if ad cohorts retain close to Home-recommendation cohorts.
5. Use Advanced Join Options (LaunchData) to deliver a starter reward for ad arrivals.
Pitfalls: judging after one day; using ads to hide poor retention; expecting ads to raise organic rank.

### Recipe 8: Share-worthy moments (short-video marketing hooks)
When to use: design stage, to build content that spreads on TikTok, Shorts and Moments.
Steps:
1. Include 2-3 clip-able moments: a rare drop with a jackpot animation, a dramatic near miss, or a visible steal/boss result.
2. Add a screenshot/record prompt using the Captures API (CaptureService) at those moments, and display a clear game name or watermark in the clip frame.
3. Add a "share" or "invite" button right after the moment.
4. Plan 15-20 second vertical clips of the best moment; post daily for the first two weeks; seed 10-20 small creators with early access and a code (code policies apply; check Community Standards).
5. Track traffic in Analytics > Share Links and "Other" source.
Pitfalls: moments that are only visible to the player; clutter in the frame; AI-moderation problems with real-life footage or music; making clips that promise things the game lacks.

### Recipe 9: Cross-promotion hub with Teleport source tracking
When to use: studios with 2+ games.
Steps:
1. Put a portal or menu entry in each game to the others; teleport with `TeleportService:TeleportAsync` and pass `SetTeleportData`.
2. On arrival validate `SourcePlaceId` before trusting data; grant a "welcome from <game>" bonus.
3. Track Teleport as a source in Acquisition; compare its retention to Home users.
Pitfalls: trusting teleport data from unknown places; teleporting players mid-purchase.

### Recipe 10: Weekly discovery health check
When to use: every week after launch.
Steps:
1. Open Acquisition > Home Recommendations: look at impressions and plays trend, then signals in this order: PTR, first-play bounce, play days, playtime, then co-play, qualified sessions, spend days, Robux per user.
2. Compare each signal against the similar-experience benchmark (not an algorithm input).
3. Look for the explore phase (impression spike after an update) and whether PTR and playtime hold.
4. Check the Creator Dashboard for a quality-issue banner and the Select/Audience Reach dashboard if targeting younger players.
5. Choose exactly one change for the next update, based on the weakest top-priority signal.
Pitfalls: changing many things at once; confusing seasonality or competitor releases with an algorithm change.

## Luau reference snippets

Invite prompt (LocalScript, client; `SocialService` methods need the Social capability; `CanSendGameInviteAsync` yields) [S54]:
```lua
local Players = game:GetService("Players")
local SocialService = game:GetService("SocialService")

local player = Players.LocalPlayer

local function canInvite(): boolean
	local ok, result = pcall(function()
		return SocialService:CanSendGameInviteAsync(player)
	end)
	return ok and result == true
end

local function promptInvite()
	if not canInvite() then
		return
	end
	local options = Instance.new("ExperienceInviteOptions")
	options.PromptMessage = "Play with me!"
	options.LaunchData = "ref=hud" -- max 200 characters
	SocialService:PromptGameInvite(player, options)
end

-- connect promptInvite to your HUD invite button's Activated event
```

Referral reward (Script, server) [S51][S52]:
```lua
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local referralStore = DataStoreService:GetDataStore("ReferralPaid_v1")

local function grantReferral(invitee: Player, inviterId: number)
	local key = tostring(invitee.UserId)
	local ok, alreadyPaid = pcall(function()
		return referralStore:GetAsync(key)
	end)
	if not ok or alreadyPaid then
		return
	end
	pcall(function()
		referralStore:SetAsync(key, inviterId)
	end)
	-- give the invitee a welcome bonus here
	-- give the inviter a reward here (inviter may be offline: store a pending grant instead)
end

Players.PlayerAdded:Connect(function(player)
	local joinData = player:GetJoinData()
	local inviterId = joinData and joinData.ReferredByPlayerId
	if inviterId and inviterId ~= 0 then
		grantReferral(player, inviterId)
	end
end)
```
Note: use UpdateAsync for race safety in production (see file 04); the docs list `ReferredByPlayerId` as 0 when not referred.

Notification opt-in (LocalScript) [S55]:
```lua
local ExperienceNotificationService = game:GetService("ExperienceNotificationService")

local function promptNotifications()
	local ok, canPrompt = pcall(function()
		return ExperienceNotificationService:CanPromptOptInAsync()
	end)
	if ok and canPrompt then
		ExperienceNotificationService:PromptOptIn()
	end
end

ExperienceNotificationService.OptInPromptClosed:Connect(function()
	-- continue gameplay; never gate content on opt-in
end)
```

Onboarding funnel and custom analytics events (Script, server) [S74 reference: AnalyticsService page]:
```lua
local AnalyticsService = game:GetService("AnalyticsService")
local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
	AnalyticsService:LogOnboardingFunnelStepEvent(player, 1, "Spawned")
end)

local function onFirstReward(player: Player)
	AnalyticsService:LogOnboardingFunnelStepEvent(player, 2, "FirstReward")
	AnalyticsService:LogCustomEvent(player, "FirstRewardClaimed", 1)
end
```
Related methods listed in the reference: `LogEconomyEvent`, `LogFunnelStepEvent`, `LogJourneyEvent`, `LogProgressionStartEvent`, `LogProgressionCompleteEvent`, `LogProgressionFailEvent`, `GetPlayerSegmentsAsync`; the older Fire* methods are deprecated.

Event join context (server; guarded because shape is documented only in the events page) [S46]:
```lua
Players.PlayerAdded:Connect(function(player)
	local joinData = player:GetJoinData()
	local ctx = joinData and joinData.GameJoinContext
	local eventId = type(ctx) == "table" and ctx.EventId or nil
	if eventId then
		-- show event welcome / bonus
	end
end)
```

Daily streak calculation (pure function; persist with a DataStore elsewhere):
```lua
local SECONDS_PER_DAY = 86400

local function utcDay(t: number?): number
	return math.floor((t or os.time()) / SECONDS_PER_DAY)
end

-- returns the new streak and whether a reward is due
local function nextStreak(lastDay: number?, streak: number): (number, boolean)
	local today = utcDay()
	if lastDay == today then
		return streak, false
	elseif lastDay == today - 1 then
		return streak + 1, true
	else
		return 1, true
	end
end
```

Teleport with source data (server) [S74 reference: Player:GetJoinData page]:
```lua
local TeleportService = game:GetService("TeleportService")

local function sendToSibling(player: Player, placeId: number)
	local options = Instance.new("TeleportOptions")
	options:SetTeleportData({ from = "hub" })
	pcall(function()
		TeleportService:TeleportAsync(placeId, { player }, options)
	end)
end
```

## Open questions / unverified
- Exact weights of each RFY signal: Roblox shows priority tiers (most important vs important) but no numeric weights in what I read; one third-party summary claimed weightings are "published", which I could not confirm [S75].
- Whether the 15 Jun 2026 rollout or the April 2026 test is the live version of the 28-day change: Roblox letters say April, the DevForum post says 15 Jun; likely test then full launch, not confirmed [S3][S4][S59].
- Kids/Select eligibility threshold: docs say 250 unique plays by highly engaged, age-checked users within 60 days; the AMA and a community thread say 500; publishing fee 1,000 Robux (AMA) not in docs; expedited review 50,000 Robux (docs). Kids account age band is 5-8 in most sources (TechCrunch summary said 5-9) [S63][S65][S66][S67].
- Ad credit price and minimum budgets today: 1 ad credit = 285 Robux in the 2023 post; later posts mention 2,850 Robux as a minimum with a USD figure that does not reconcile; official docs give no price. Treat as unverified and read the live Ads Manager UI [S40][S42][S44].
- Thumbnail personalisation minimum traffic ("1,000+ DAU") was in one summary only; not confirmed.
- Roblox's Q3 2026 guidance for bookings (a 14-18% YoY decline in the 8-K summary) and the Russia effects should be re-read in the primary filing before quoting [S59].
- The "50+ million searches per day" figure and the Restricted-label under-18 hiding from 6 Nov 2025 were seen only in search-result snippets [S74][S1 context].
- Dates of the Charts rename (July 2024) came from a social-post snippet, not a Roblox page.
- Creator Hub "Roblox Plus" cost ($4.99/month) was in one press summary [S67].
- I could not read the YouTube talk "The Science of Game Discovery: What Works" (RDC 2025) or the RDC 2026 (10-12 Sep 2026) announcements; the web search quota was exhausted before RDC 2026 coverage was found. Check devforum for RDC26 posts.
- Third-party analytics sites (RoMonitor, Rolimons, Bloxbiz) were not queried; all CCU numbers come from press, Wikipedia (which cites press) or Roblox itself.
- Retention figures for new or small games are not available: GameAnalytics samples are large established titles (1M+ monthly users), so small-game medians are likely lower.
- Aggregator blog advice (launch budgets of $100-$2,000, influencer timelines, "8-week playbook") is not verified and was not used as fact.

## Sources
[S1] Discovery, Roblox Creator Docs (content/en-us/discovery.md; create.roblox.com/docs/discovery), read Oct 2026. https://create.roblox.com/docs/discovery and https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/discovery.md
[S2] Boost Your Discovery with the Improved Recommended For You Algorithm and Analytics for Creators, JavaJiving (Roblox), 31 Mar 2025, updated 11 Dec 2025. https://devforum.roblox.com/t/boost-your-discovery-with-the-improved-recommended-for-you-algorithm-and-analytics-for-creators/3587441
[S3] Recommended For You Algorithm Improvements That Better Value Long-Term Retention, BurningEmbar (Roblox), 15 Jun 2026. https://devforum.roblox.com/t/recommended-for-you-algorithm-improvements-that-better-value-long-term-retention/4684575
[S4] Testing More Recommended For You Algorithm Signals, BurningEmbar (Roblox), 10 Apr 2026. https://devforum.roblox.com/t/testing-more-recommended-for-you-algorithm-signals/4568033
[S5] Home Recommendation Impressions and CCU dropped 70-80% following RFY Algorithm Test, Tredgeus (community), 14-15 Apr 2026. https://devforum.roblox.com/t/home-recommendation-impressions-and-ccu-dropped-70-80-following-rfy-algorithm-test-april-10-2026/4576807
[S6] Optimizing Discovery: How Great Games Reach Millions of Players on Roblox, John Ciancutti, Roblox Newsroom, 15 Jun 2026. https://about.roblox.com/newsroom/2026/06/optimizing-discovery-great-games-reach-millions-players-roblox
[S7] Boost Your Discovery by Building Games People Want to Play, John Ciancutti, DevForum, 6 Aug 2026. https://devforum.roblox.com/t/boost-your-discovery-by-building-games-people-want-to-play/4779042
[S8] Weekly Recap: August 3-7, 2026 (Avatar Backgrounds pilot, Home recommendations tests), Roblox, Aug 2026. https://devforum.roblox.com/t/weekly-recap-august-3-7-2026-avatar-backgrounds-pilot-home-recommendations-tests/4781555
[S9] How we are improving Home this year, starrrydays and loopcoded (Roblox), 9 Mar 2026 with updates 26 Mar, 2 Apr, 14 May, 29 Jul 2026. https://devforum.roblox.com/t/how-we-are-improving-home-this-year/4502571
[S10] Testing Improvements to the "Recommended For You" Algorithms, starrrydays (Roblox), 26 Nov 2024. https://devforum.roblox.com/t/testing-improvements-to-the-%E2%80%9Crecommended-for-you%E2%80%9D-algorithms/3275201
[S11] Building the Future of Roblox Home and Search: Introducing Personalized Discovery, JavaJiving (Roblox), 31 Jan 2025, updates through 12 Dec 2025. https://devforum.roblox.com/t/building-the-future-of-roblox-home-and-search-introducing-personalized-discovery/3432124
[S12] Roblox's 2025 Discovery Roadmap and Ways to Reach and Engage Your Audience, JavaJiving (Roblox), 19 Mar 2025. https://devforum.roblox.com/t/roblox%E2%80%99s-2025-discovery-roadmap-and-ways-to-reach-and-engage-your-audience/3557533
[S13] Discovery on Roblox: Past, Present, and Future Vision, Roblox Discovery team, 28 Feb 2024 (older than 2025, may be stale). https://devforum.roblox.com/t/discovery-on-roblox-past-present-and-future-vision/2859111
[S14] Testing an Enhanced Discover Page: Top Charts and New Sorts, Zankogola (Roblox), 2 May 2024, updated 8 Nov 2024. https://devforum.roblox.com/t/testing-an-enhanced-discover-page-top-charts-and-new-sorts/2954676
[S15] Introducing "Top Playing Now" on Charts, JavaJiving (Roblox), 5 Mar 2025, updated 29 Apr 2025. https://devforum.roblox.com/t/introducing-top-playing-now-on-charts/3529809
[S16] [Upcoming Tests] Improving Game Discovery With Relevant Information, starrrydays (Roblox), 29 Aug 2025. https://devforum.roblox.com/t/upcoming-tests-improving-game-discovery-with-relevant-information/3907203
[S17] Get your thumbnails ready for thumbnail personalization, signal_zzz (Roblox), 24 Oct 2024. https://devforum.roblox.com/t/get-your-thumbnails-ready-for-thumbnail-personalization/3226599
[S18] [Live now] Personalize your thumbnails to attract more users, signal_zzz (Roblox), 13 Nov 2024, updated 13 Feb 2025. https://devforum.roblox.com/t/live-now-personalize-your-thumbnails-to-attract-more-users/3257233
[S19] Thumbnail personalization now remembers your existing winning thumbnails, loopcoded (Roblox), 1 Jul 2025. https://devforum.roblox.com/t/thumbnail-personalization-now-remembers-your-existing-winning-thumbnails/3793665
[S20] Testing Personalized Thumbnails in Home this July, ivy_poisond (Roblox), 25 Jun 2024. https://devforum.roblox.com/t/testing-personalized-thumbnails-in-home-this-july/3039419
[S21] Thumbnails, Roblox Creator Docs (thumbnails.md). https://create.roblox.com/docs/production/publishing/thumbnails
[S22] Icons, Roblox Creator Docs. https://create.roblox.com/docs/production/publishing/experience-icons
[S23] Gameplay Videos on Home: Help Your Games Get Discovered, Th3_avocad0 (Roblox), 31 Aug 2026. https://devforum.roblox.com/t/gameplay-videos-on-home-help-your-games-get-discovered/4842601
[S24] YouTube Videos Will Be Removed from Game Detail Pages, Th3_avocad0 (Roblox), 18 Sep 2026. https://devforum.roblox.com/t/youtube-videos-will-be-removed-from-game-detail-pages/4879633
[S25] Video Previews for your game's page, christ0pherus (Roblox), 13 Nov 2025. https://devforum.roblox.com/t/video-previews-for-your-games-page/4068103
[S26] Analytics overview, Roblox Creator Docs (analytics/index.md). https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/analytics/index.md
[S27] Retention, Roblox Creator Docs (analytics/retention.md). https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/analytics/retention.md
[S28] Engagement, Roblox Creator Docs (analytics/engagement.md). https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/analytics/engagement.md
[S29] Monetization analytics, Roblox Creator Docs (analytics/monetization.md). https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/analytics/monetization.md
[S30] Acquisition, Roblox Creator Docs. https://create.roblox.com/docs/production/analytics/acquisition
[S31] Analytics: View retention by acquisition source and select your benchmark set, signal_zzz (Roblox), 16 Oct 2025. https://devforum.roblox.com/t/analytics-view-retention-by-acquisition-source-and-select-your-benchmark-set/4010157
[S32] Analytics: Recommendations Qualified Play Through Rate and Similar Experiences Benchmarks, signal_zzz (Roblox), 18 Jul 2024. https://devforum.roblox.com/t/analytics-recommendations-qualified-play-through-rate-and-similar-experiences-benchmarks/3075185
[S33] Analytics: View acquisition sources for curation, continue play, charts, and search ads, quazotheduck (Roblox), 8 Nov 2024. https://devforum.roblox.com/t/analytics-view-acquisition-sources-for-curation-continue-play-charts-and-search-ads/3251589
[S34] Optimize Testing and Live Updates with Roblox's Analytics and Experimentation Platform, Roblox Newsroom, 24 Aug 2026. https://about.roblox.com/newsroom/2026/08/optimize-testing-live-updates-roblox-analytics-experimentation-platform
[S35] Creator Roadmap 2026: Fall Update, Roblox, Sep 2026. https://devforum.roblox.com/t/creator-roadmap-2026-fall-update/4880208
[S36] Creator Roadmap 2025: RDC Update, Roblox, Sep 2025. https://devforum.roblox.com/t/creator-roadmap-2025-rdc-update/3961527
[S37] RDC25: What we announced, Roblox, Sep 2025. https://devforum.roblox.com/t/rdc25-what-we-announced/3920245
[S38] Weekly Recap: September 14-20, 2026, Roblox. https://devforum.roblox.com/t/weekly-recap-september-14%E2%80%9320-2026/4880336
[S39] Weekly Recap: March 23-27, 2026, Roblox. https://devforum.roblox.com/t/weekly-recap-march-23-27-2026/4542233
[S40] Ads Manager, Roblox Creator Docs. https://create.roblox.com/docs/production/promotion/ads-manager
[S41] Leveling Up Ads Manager With New Features, kayakrivers (Roblox), 31 Mar 2025. https://devforum.roblox.com/t/leveling-up-ads-manager-with-new-features/3587640
[S42] Ads Manager Updates: Acquire New Users, Continuous Campaigns and More, kayakrivers (Roblox), 5 Aug 2025. https://devforum.roblox.com/t/ads-manager-updates-acquire-new-users-continuous-campaigns-and-more/3862159
[S43] Ads Manager Updates: Maximize Earnings, Attribution Updates, New Tile in Beta, Daguerrotypewriter (Roblox), 7 May 2026. https://devforum.roblox.com/t/ads-manager-updates-maximize-earnings-attribution-updates-new-tile-in-beta-other-updates/4623762
[S44] Sponsored Experiences moving to Ads Manager, Roblox, 26 Oct 2023 (older than 2024, pricing may be stale). https://devforum.roblox.com/t/sponsored-experiences-moving-to-ads-manager/2661756
[S45] Game launch advertising cost (thread; orange451 reply), DevForum, 28-30 May 2025 (community opinion). https://devforum.roblox.com/t/game-launch-advertising-cost/3667546
[S46] Experience events and updates, Roblox Creator Docs. https://create.roblox.com/docs/production/promotion/experience-events
[S47] Upcoming Experience Events Discovery Tests, christ0pherus (Roblox), 4 Sep 2024, update 3 Jun 2025. https://devforum.roblox.com/t/upcoming-experience-events-discovery-tests/3146504
[S48] Experience Events thumbnails, curation, and the future of events, peraldon (Roblox), 27 Jun 2024. https://devforum.roblox.com/t/experience-events-thumbnails-curation-and-the-future-of-events/3042573
[S49] Introducing Today's Picks - A New Curated Sort on Home [Pilot], Roblox, 3 Apr 2024 (older than 2025; replaced by Standout Games). https://devforum.roblox.com/t/introducing-today%E2%80%99s-picks-a-new-curated-sort-on-home-pilot/2910867
[S50] Standout Games, Roblox Creator Docs (creator programs). https://create.roblox.com/docs/creator-programs/standout-games
[S51] Friend referral system, Roblox Creator Docs. https://create.roblox.com/docs/production/promotion/referral-system
[S52] Announcing the new Friend Referral System for your Experiences, duomination (Roblox), 23 Apr 2025. https://devforum.roblox.com/t/announcing-the-new-friend-referral-system-for-your-experiences/3623795
[S53] [Pilot] Creator Affiliate Program: Apply to Earn From New Roblox Users, signal_zzz (Roblox), 9 Sep 2024. https://devforum.roblox.com/t/pilot-creator-affiliate-program-apply-to-earn-from-new-roblox-users/3152093
[S54] Player invite prompts, Roblox Creator Docs. https://create.roblox.com/docs/production/promotion/invite-prompts
[S55] Experience notifications, Roblox Creator Docs. https://create.roblox.com/docs/production/promotion/experience-notifications
[S56] Roblox Moments: A New Era of User-Generated Discovery, Roblox Newsroom, 5 Sep 2025. https://about.roblox.com/newsroom/2025/09/roblox-moments-user-generated-discovery
[S57] [Beta] Content Sharing APIs: Upload API and Recommendations API, corepcgamer (Roblox), 12 Nov 2025, updates May-Jun 2026. https://devforum.roblox.com/t/beta-content-sharing-apis-use-upload-api-and-recommendations-api-to-drive-discovery-and-engagement/4065417
[S58] Recommendation systems (RecommendationService how-to), Roblox Creator Docs. https://create.roblox.com/docs/production/recommendation
[S59] Roblox Q2 2026 Shareholder Letter, Roblox Corp (SEC 8-K exhibit 99.1), Aug 2026. https://www.sec.gov/Archives/edgar/data/0001315098/000162828026051059/ex991-robloxq22026earnin.htm
[S60] Roblox Q1 2026 Shareholder Letter, Roblox Corp (SEC 8-K exhibit 99.1), 2026. https://www.sec.gov/Archives/edgar/data/0001315098/000162828026028882/ex991-q12026earningsshar.htm
[S61] 2026 Roblox Benchmark Report, GameAnalytics (third-party), data 1 Aug 2025 - 31 Jul 2026. https://www.gameanalytics.com/reports/2026-roblox-report
[S62] The 2025 Roblox Benchmark Report, GameAnalytics (third-party), data Jan 2023 - Jul 2025. https://www.gameanalytics.com/reports/2025-roblox-report
[S63] Roblox Kids and Select, Roblox Creator Docs (publishing). https://create.roblox.com/docs/production/publishing/kids-and-select
[S64] Introducing Roblox Kids and Select Accounts, Roblox Newsroom, Apr 2026. https://about.roblox.com/newsroom/2026/04/introducing-roblox-kids-and-select-accounts
[S65] [AMA] Publishing Requirements + Roblox Kids & Select, RbxRocketMan, skywise84, rpgwafflez (Roblox), 16 Apr 2026, updated 11 May 2026. https://devforum.roblox.com/t/ama-publishing-requirements-roblox-kids-select/4580953
[S66] Question about "Select eligibility" (thread), DevForum, May 2026 (community answers). https://devforum.roblox.com/t/question-about-select-eligibility/4616998
[S67] Roblox introduces 'Kids' and 'Select' accounts for age-appropriate access to games and chat, TechCrunch, 13 Apr 2026. https://techcrunch.com/2026/04/13/roblox-introduces-kids-and-select-accounts-for-age-appropriate-access-to-games-and-chat/
[S68] Developer beef just helped Roblox set a 47-million-player record, Tubefilter, 25 Aug 2025. https://www.tubefilter.com/2025/08/25/roblox-grow-garden-steal-brainrot-admin-war-record/
[S69] Steal a Brainrot, Wikipedia (secondary; cites IGN, Polygon, Game Rant, PocketGamer), accessed Oct 2026. https://en.wikipedia.org/wiki/Steal_a_Brainrot
[S70] Grow a Garden, Wikipedia (secondary; cites NYT and others), accessed Oct 2026. https://en.wikipedia.org/wiki/Grow_a_Garden
[S71] The Algorithm Behind "Steal a Brainrot", Andy Hall (Free Systems, Substack), 4 Dec 2025 (opinion/analysis). https://freesystems.substack.com/p/the-algorithm-behind-steal-a-brainrot
[S72] Tension between Roblox creators and ads shows at RDC 2025, Alexander Lee, Digiday, 9 Sep 2025. https://digiday.com/media/robloxs-growth-comes-with-growing-pains-between-creators-and-ad-sales/
[S73] My Research on the Roblox Algorithm and Discovery for Experiences/Games, Reditect (community), 19 Nov 2023 (older than 2024, likely stale; not used for facts). https://devforum.roblox.com/t/my-research-on-the-roblox-algorithm-discovery-for-experiencesgames/2707618
[S74] API reference pages used for Luau snippets and one snippet-level policy source: AnalyticsService, ExperienceNotificationService, Player (GetJoinData), SocialService on create.roblox.com/docs/reference/engine/classes/; and the DevForum post "Updating Age Requirements for Experiences with 'Restricted' Content Maturity Label" (seen only as a search snippet, Nov 2025). https://create.roblox.com/docs/reference/engine/classes/AnalyticsService , https://create.roblox.com/docs/reference/engine/classes/ExperienceNotificationService , https://create.roblox.com/docs/reference/engine/classes/Player , https://create.roblox.com/docs/reference/engine/classes/SocialService , https://devforum.roblox.com/t/updating-age-requirements-for-experiences-with-%E2%80%98restricted%E2%80%99-content-maturity-label/3905863
[S75] Roblox rewires "Recommended For You" to reward 28-day retention, ZehnStudio26 (third-party blog), 15 Jun 2026 (secondary; used only to cross-check S3). https://zehn-studio26.com/news/recommended-for-you-retention-update/
