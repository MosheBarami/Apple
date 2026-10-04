# RDC 2026, the Creator Roadmap (Oct 2026) and the 2026 Investor Letters
_Researched 2026-10-04 by deep-researcher agent. Sources: 49 (listed at the end; some are third-party or search-snippet only, and each is labelled)._

How to read statuses in this file:
- **LIVE** = shipped and usable now (confirmed by a dated staff post or recap).
- **BETA / EARLY ACCESS** = usable only via a Studio Beta toggle, a client beta, an application or a rolling invite.
- **COMING (date)** = Roblox promised a date or window; nothing to build on yet.
- **UNDATED** = announced or demoed with no date.
- Roblox's own timing words are coarse: "Late 2026" = Q4 2026, "Early 2027" = Q1 2027, "Mid 2027" = Q2-Q3 2027, "Late 2027" = Q4 2027. Roblox slips these (32 roadmap items were delayed in the Fall update [S3]).

Where two sources disagree, both values are written down. Single-source numbers that come from a summariser or a blog are marked "(single source)".

---

## 0. The event in one paragraph

RDC26 ran 10-12 September 2026 at the McEnery Convention Center, San Jose, with more than 3,000 attendees (the 20th-anniversary year of Roblox) [S5, S6]. The official wrap-up post is "RDC26: What We Announced" on the DevForum [S1] (the forum listing shows it dated 29 Sep 2026, which is the post date rather than the event date) and the newsroom post "RDC 2026: The World Needs More Play" [S2]. The Creator Roadmap Fall Update (posted 18 Sep 2026) added 72 RDC items, reported 47 items shipped since the last update, 130 features launched since the previous RDC (79% on time), 4,401 bugs closed and 32 items delayed [S3, S26]. Themes: **more playing** (web, offline, standalone apps, 2D/turn-based), **more building** (AI agents, Build, scene generation, branch and merge), **more growth** (age-aware discovery, Moments, ads, Wallet). The strategic subtext, stated in the investor letters, is a 14-18% year-over-year bookings decline guided for Q3 2026 [S18] and a push toward 18+ players and "AAA" studios [S5].

---

## Key facts

### 1. Engine: rendering, physics, Server Authority, streaming, audio

| Item | Status and date | Notes |
|---|---|---|
| **Server Authority** | **LIVE** since 9 Jul 2026 (full release, all creators) [S14, S50] | Set `Workspace.AuthorityMode` to Server, save and publish. It auto-enables five settings: NextGenerationReplication on, PlayerScriptsUseInputActionSystem on, SignalBehavior Deferred, StreamingEnabled on, UseFixedSimulation on. Uses client prediction and rollback. Known limits: 8 active animation tracks per Animator, 64 attributes per instance (restricted string sizes), custom emotes and strafing animations unsupported, Remote events not on the shared timeline, mobile and console builds lag desktop by several days, no Camera InputAction sync (use `Player:GetCameraState()`) [S14]. Earlier stages: Studio Beta, then Client Beta in Apr 2026 [S50]. |
| **Frustum Streaming** (camera-based instance streaming) | **LIVE** (announced week of 28 Sep-2 Oct 2026) [S28, S30] | Property `Player.FrustumStreaming`; automatic mode, or `Enum.FrustumStreamingMode.Enabled` / `.Disabled`. Auto triggers: narrow FOV (scope), high velocity (race car), camera far from avatar (free cam). Max streaming distance is the smaller of max render distance and 100,000 studs. Opt-in, no occlusion culling, no per-model selection, no camera prediction yet [S30]. |
| **Instance Streaming adaptive radius, path pre-fetching** | COMING Late 2026 [S3] | Roadmap only. |
| **Streaming excluded mode** | DELAYED from Early 2026 to Mid 2027 [S3] | Do not plan on it. |
| **Minimum draw distance 500 studs (was 200) on low-end devices incl. Android** | COMING Late 2026 [S1, S3] | |
| **SLIM (Scalable Lightweight Interactive Models)** | Client Beta earlier; SLIM for NPC characters and for rigid welded items COMING Early 2027 [S3, search result] | SLIM composites low-poly LODs for streamed-out models. The Q2 call credited "Slim compositing" with letting games run on low-end Android and high-end PC [S20]. |
| **Acoustic Simulation** (audio occlusion, reflection, diffraction, reverb from geometry) | **LIVE**, full release in the 21-25 Sep 2026 recap (beta concluded) [S27]. "Acoustic Simulation - Sounds" extension COMING Early 2027 [S3] | Costs some physics-query budget. Audio debug tools COMING Late 2026 [S3]. |
| **Improved physics solver** | COMING Early 2027 [S3]. Efficient collision pipeline Late 2027 [S3]. Improved fluid dynamics DELAYED to Early 2027 [S3] | |
| **Collision geometry**: auto-generation, debug overlay, precision-versus-performance tuning | **LIVE** (workflow improvements released 18 Sep 2026) [S26]; RDC post lists it as Late 2026 [S1] | Status differs by source: the controls shipped, the "auto-generation algorithm" wording is in the RDC list. |
| **Collision groups on WorldRoot** (moved from PhysicsService) | **LIVE** (31 Aug-4 Sep recap) [S25] | A migration for old `PhysicsService` collision-group code. |
| **New primitives**: Cone, Capsule, Disc, rounded edges on BaseParts | COMING: RDC post says Late 2026 [S1]; roadmap says Early 2027 [S3] | Individually rounded corners already shipped (UI) [S3]. |
| **CSG on meshes** (Union/Intersect/Subtract) | DELAYED Late 2025 to Late 2026 [S3] | |
| **Terrain**: object scattering, path splines, projected decals, virtual texturing, signed distance fields | EARLY ACCESS (application) targeted "Late Fall/Winter" 2026 [S33]. Roadmap has scatter/splines/decals/SDF/virtual texturing at Mid 2027 [S3] | GamesBeat (press briefing) reported up to 64 custom terrain materials [S4] (single source, not in the forum post). |
| **Material layering** (PBR layers with masks) and **material response** (specular, skin scattering) | COMING Mid 2027 [S1, S3] | |
| **2D features**: orthographic camera, animated image containers, sprite-sheet import, UI blur, text shadow, gradient upgrades | COMING Late 2026 (UI blur on the roadmap at Early 2027; "Upgraded UI Gradients" was in Studio Beta 4 Sep 2026) [S1, S3, S25] | Engine is being extended to 2D, single-player, offline and turn-based games [S18]. |
| **2D particles** | COMING Late 2026 [S3] | |
| **Input action manager**, Input action label, native object interaction, improved motion sensors | COMING Late 2026 / Early 2027 [S3] | The Input Action System is already mandatory when Server Authority is on [S14]. |
| **Offline play** (solo offline mode alongside multiplayer) | COMING Mid 2027, early access "soon" [S1, S2] | |
| **Developer push notifications** (turn-based alerts) | Studio Beta Oct 2026, full release by year end [S2]; roadmap Late 2026 [S3] | |
| **Queue service, compute functions, in-game creation persistence** | COMING Early 2027 [S3] | In-game creation persistence is described as DataStore-like [S1]. |
| **Test teleports in Studio** | COMING Early 2027 [S1, S3] | |
| **Roblox Reality** (video world model that layers photorealism over the engine) | UNDATED, demoed at RDC [S4, S35]. April 2026 newsroom said an early version "later this year or early next" [S35] | Hybrid: engine keeps truth and state, a "Super Upsampler" video model adds pixels on edge GPUs. The newsroom lists unsolved limits (2K/60 Hz real-time goal, rule enforcement, multiplayer agent simulation, input control) [S35]. The Q2 call framed it as a possible subscription offering [S20]. Not a Studio feature you can call. |
| **Roblox Everywhere**: games published as standalone apps (mobile, PC, console) | UNDATED, "upcoming" [S2]. Rollout starts with select developers and storefronts per press (single source: a Twitter thread via search snippet and press paraphrase) [S42, S45] | No technical requirements or eligibility have been published. |
| **Web play** (open a game in Chrome from the Experience Details page, no install) | COMING by end of 2026 (Chrome first, other browsers later) [S2, S41] | |

### 2. Avatars and animation

- **Emissive UGC items** on Marketplace: **LIVE**, full release in the 31 Aug-4 Sep 2026 recap [S25]; roadmap list says Late 2026 for avatar emissives and in-game makeup creation [S3]. Texture-controlled glow.
- **Animation pack Marketplace**, **default sprint and crouch** in the default character controller, **profile frames for Plus subscribers** (mobile roll-out 8 Sep 2026): **LIVE** per a third-party monthly recap [S44] (third-party; confirm in docs before relying on sprint/crouch).
- **New default movement** (motion matching plus root motion) COMING Early 2027; **animation graph improvements** (state machine nodes, Luau expressions) COMING Mid 2027; **silhouette-preserving layered clothing** COMING Early 2027; Avatar Schema: procedural bones (Early 2027), higher mesh resolution and upgraded FACS (Mid 2027) [S1, S3].
- **NPC dynamic behaviour**: creators prompt NPC behaviour in Studio, editable and reusable; Late 2026 [S1]. "Assistant NPC subagent" has already shipped [S3]. At RDC Roblox also talked about "hundreds" of autonomous NPCs for testing and engagement, no date [S4].
- Share custom animations delayed to Early 2027; animation reimport delayed to Late 2026 [S3].

### 3. Studio and AI

**Already live before or at RDC (safe to use):**
- **Roblox Assistant** with Planning Mode (15 Apr 2026): analyses code and data model, asks questions, produces an editable plan used like a mini design doc [S11]. Chat history, multiple chats, editable Markdown plans, Better Assistant Scripting, Assistant skills and docs: shipped per the roadmap [S3].
- **Creator-authored Skills** (Markdown guides, account-level, work in Studio and in MCP clients such as Claude Code, Cursor, Claude Desktop) [S9 (third-party), search result of the DevForum post].
- **Studio built-in MCP server** (Studio is the MCP server, Assistant is a client). **Multi-agent update 19 Aug 2026, LIVE not beta**: every tool call now needs an explicit `studio_id`; `set_active_studio` was removed; `list_roblox_studios` returns Place ID with name and instance ID; Universe ID planned; Claude Code and Codex are the named clients; you must restart the AI client after Studio updates [S13]. Known issues in that thread: Claude start/stop failures, Codex CLI inconsistency, crashes under heavy workflows [S13].
- **Playtest Agent**: Studio Beta since 9 Apr 2026 (File > Beta Features > Playtest Agent). Runs on Roblox infrastructure, own model, daily usage cap (amount not stated), max 50 turns per test, loop detection. Known limits: false positives, cannot handle real-time demands such as vehicle steering or combat, needs specific instructions. Roadmap: multiple simultaneous agents, multiplayer testing [S12].
- **Mesh generation, procedural model generation** in Studio (shipped), **new texture generation, Segment Mesh and image previews** (Sep 2026, LIVE): commands `/generate_texture`, `/segment_mesh` (up to 5 parts per command), `/generate_procedural_model`, `/generate_mesh`, supported through MCP. Known issues: custom mesh normals reset, mesh IDs change after generation [S29, S27].
- **Studio Script Sync** (Studio Luau file sync, full release June 2026): edit scripts in VS Code or Cursor with two-way sync; right-click a script folder, choose "Sync to..."; syncs Script, LocalScript, ModuleScript and Folder only [S43].
- **Roblox Cube foundation model** (4D generation): beta since 4 Feb 2026 with schemas Car-5 and Body-1; test game Wish Master saw 160,000+ objects generated and a reported 64% playtime lift among users of the feature (Roblox claim) [S36]. RDC added: an open-sourced version of the Cube 3D model on GitHub and Hugging Face, plus a self-trained "3D foundation model" for high-fidelity mesh and texture (reported by press, no date) [S4, search result]. Q2 letter: more than 60,000 3D assets generated daily and about 1,400 games using Cube content daily [S18].

**Announced at or around RDC, not yet usable:**
- **Studio AI agents suite** announced 16 Jul 2026 (testing began 28 Jul 2026): playtesting agent (beta), **analytics agent** (ask questions in plain language; roadmap Late 2026) and **experiment agent** (proposes tests). "Rolling out over the coming months" [S10, S9]. Analytics agent, journey analytics and observability platform (client session tracing, logs, fix deployment from Studio) are Late 2026 [S1, S3].
- **Scene Generator** (prompt plus reference image yields a functional layout in Build and Studio): COMING Late 2026 [S1, S2, S3].
- **Unified agentic permission** COMING Late 2026; **new texture generation tool** listed Late 2026 on the roadmap (the Sep 2026 texture post suggests it already shipped); **Text generation API** DELAYED to Late 2026; **4D generation behaviour libraries**, **Open Cloud APIs for AI tools** DELAYED to Late 2026; **Expand Creator Hub APIs to MCP** DELAYED to Early 2027 [S3].
- **Branch and merge** (isolated Place branches, simultaneous building, property and script-line conflict resolution): COMING Early 2027 [S1, S3]. **Asset Manager** was fully released 4 Sep 2026 (folders, search) [S25]; "Game Inventory" collaboration upload is Late 2026 [S3]. **On-device testing, project window, multiple client views, package overrides**: Late 2026 to Early 2027 [S3].
- **Asset moderation feedback in Studio**: real-time safety signals during development, no account-level consequences for minor asset violations in development; Late 2026 [S1, S3].
- **Build** (mobile-first prompt-to-game tab in the Roblox app): public alpha began 28 Jul 2026 in New Zealand (age-verified, 9+); RDC expanded it to Serbia and Singapore; about 9,000 games published; 71% of creators had never used Studio [S2, S10, S18]. Free base tier plus paid tiers (Q2 letter) [S18]. Build and Studio share backend, models and chat history [S10].
- **Early Harm Detection for Experiments**: **LIVE** this week; near-real-time (5 minute refresh) playtime, payer conversion and ARPU for the first 24 hours, with alerts on critical harm [S28]. **Open Cloud APIs** for analytics, events, experiments and thumbnail personalisation exist already (devforum post 4828676, search result only).

### 4. Creator economy: DevEx, Wallet, Plus, ads, Creator Rewards

**DevEx and Wallet**
- **US 18+ DevEx rate: LIVE since 8 Jun 2026.** 42% higher: from $0.38 to $0.54 per 100 earned Robux ($0.0038 to about $0.0054 per Robux). Applies to spend by age-checked 18+ players with a US economic location (VPNs excluded) on games passes, developer products, Robux subscriptions and private servers; avatar and Marketplace items do not qualify. The game must satisfy an avatar condition: always R15, or a custom human rig with 15+ joints, or a custom non-human rig, or no visible player characters; set Avatar Settings to "R15 Only" for custom systems. Check eligibility at `create.roblox.com/settings/eligibility/us-o18-devex-rate`; no application; US 18+ Robux cash out first [S17]. Roblox quotes the effective earnings share moving from 26.6% to 37.8% [S19]. (The Q2 call transcript summary says "50% premium"; that conflicts with 42% and is probably the "O18 users monetise 50% higher" statistic mixed up. Trust the 42% from the staff post.) [S17, S20]
- **Roblox Wallet: COMING December 2026** (the RDC list says "Late 2026") [S1, S7, S4]. Account provided through Airwallex (Airwallex US, LLC per the RDC post) [S1]. Daily USD payouts every business day as holds clear; hold up to 30 days (varies); same $0.0038 per Robux base rate; 2FA required; opt-in; first eligible group is US-based independent creators (sole proprietors), 18+. 2027: 13+ creators with parental consent, incorporated businesses, group wallets, other countries [S7]. Wallet stays accessible during suspension and closes only on permanent ban [S7]. Opening a wallet costs nothing per a third-party summary of the creator workshop [S45].
- **DevEx sunset: US mid-2027, other regions later.** Stated by Roblox staff in the Wallet thread and RDC thread (a commenter relays it in [S1]; [S7] states it), and press say DevEx winds down region by region only after Wallet is proven there [S7, S45]. Earnings already in Robux stay DevEx-eligible until the transition; new earnings go straight to USD [S7]. This is the biggest structural change for the economy; exact dates are not yet announced.
- **Roblox Card**: COMING 2027, select markets, debit-only (spend what is in the Wallet) [S1, S7]. Pending bank-partner approval [S1].
- DevEx totals: more than $5B paid since 2013; about $1.7B in the 12 months to 30 Jun 2026 (+50% YoY) [S2, S1]. A press report puts median annual earnings at about $1,500 for roughly 42,000 paid creators (single source, Yahoo) [S40].
- **Transfers API** (LIVE 4 May 2026) replaced cross-game pass sales; **cross-game sales of passes and developer products were disabled 29 May 2026**, with no exception for same-owner games. Transfers: 10% creator commission, recipient gets 90%, no extra platform fee, daily cap 500 Robux and monthly cap 1,000 Robux; sender needs Roblox Plus and age verification (parental approval per transfer for under-18) [S37]. The Q2 letter lists the disabled cross-experience passes as a bookings headwind [S18].

**Roblox Plus** (replaces Premium; announced 10 Apr 2026, live 30 Apr 2026) [S15]
- $4.99 per month; 10% off in-game items and avatars, rising to 20% from month 3; free unlimited private servers; fee-free Robux transfers; Marketplace trading and publishing access [S15, S19].
- **Roblox funds the discount**, so creators keep the same per-item earnings and players can buy more; the staff post quotes the effective creator share going from 70% to 88% (single source summary, verify in the post) [S15].
- Creator incentives: **250 Robux per month for a new subscriber's first 3 consecutive months (max 750 Robux)** when the game uses the `PromptRobloxSubscriptionPurchase` API; **up to 100 Robux per Plus subscriber** who spends 60+ minutes in paid private servers over 30 days (top 5 servers by time) [S15]. First 4 months generated more than 300 million Robux in creator earnings [S2].
- Premium: new subscriptions stopped 30 May 2026; existing subscribers get a one-month Plus trial [S15]. Plus subscribers will not see pre-roll ads [S1].
- Plus extras live in Sep 2026: profile frames (user-made frames "next year"), AI-generated backgrounds, two free trades per month for non-Plus users [S44] (third-party).

**Ads**
- **Pre-roll video ads**: announced at RDC as a test ("coming soon" in [S1]); skippable, mobile-first, shown while a game loads, no creator integration, Roblox optimises delivery and shares revenue (split not published), Plus members exempt [S1, S23]. Roblox positions it as making inventory buy like standard digital video; programmatic partners named in press: Google, Amazon DSP, Liftoff, Index Exchange, Magnite, PubMatic [S23].
- **Rewarded video** (live since April 2025 with Google): a **Studio plug-in with drag-and-drop 2D/3D templates is COMING Q4 2026**, plus a pre-gameplay rewarded surface and a multi-reward rotation with per-reward reports [S24]. The Q1 letter mentioned a plugin template to simplify integration [S19].
- **Ads Manager** (RDC recap posted 2-3 Oct 2026): **Earnings objective** now open to nearly 30,000 eligible games, optimises for ROAS; over 1,200 games ran it in beta; nearly two-thirds of games reinvesting up to 4% of earnings exceeded 100% ROAS (Roblox claim); earnings shown in USD and Robux; attribution up to 30 days; incrementality study of 21 campaigns: median +14% play sessions and +10% 7-day retained users (Roblox data); video in Sponsored Tiles rolling out; ad accounts for groups; US 18+ Robux can convert to ad credits at better rates; Sponsored Tiles reach 13+ [S22]. More than 60 of the top 100 creators by spend use native Ads Manager (Q1) [S19]. Since May 2026 independent brand integrations must register campaigns in Ads Manager [S19].
- **Free trials for passes** (Late 2026), **game items outside your game** (Late 2026 roadmap) [S3]; the latter has begun: since 22 Sep 2026 listed passes and developer products appear on the Game Details store, home, search and post-purchase pages, if the product is marked Listed in Creator Hub > Monetization > Shop and `ProcessReceipt` is implemented correctly (a Creator Hub diagnostic flags broken ones) [S31]. **Transaction Refunded webhook** is live [S27]. **Licensed-IP sales tied to game passes** reported live (third-party) [S44]. **Shop** (personalised in-game storefront) is available [S26, S27].
- **Creator Rewards** (replaced Engagement-Based Payouts in July 2025; daily engagement reward plus audience expansion reward) is still the passive-income programme; Roblox said 72% of experiences earned more than under the old system (2025 data, flag as possibly stale) [S48]. New Creator Reward analytics exist (devforum post 4146591, search result only). No 2026 rate change was found. Ads Manager now reports Creator Rewards earnings with ads earnings [S22].
- **Creator programmes**: Jumpstart, Incubator (six months, milestone-based, user-acquisition support, first cohort of 26 teams finalised by Q2), White Glove and studio partnerships; more than 8,000 applications in two months [S18, S19].

### 5. Discovery, safety, age checks, Kids/Select, policy

- **Discovery algorithm** (deployed Apr 2026 per Q2 letter): evaluates engagement over 28 days (was 7), uses play-through rate and first-play bounce rate, tests direct growth measurement; age-aware ranking [S2, S18]. Roblox says this moved engagement from 2025-vintage viral games toward new and evergreen games with lower per-hour monetisation [S18]. 28% of new games in the top 100 and 33% in the top 1,000 launched within the last 90 days (Q2 2026) [S1].
- **Home and Moments**: the app moved to a five-tab layout (Home, Moments, Build, Chat, Me) [S18]; Moments is fully available in the US; avatar shopping from Moments in October 2026; Experience Details Page videos; Build games playable in Moments "soon" [S2]. Gameplay videos on Home are live [S25]. **YouTube videos were removed from game detail pages on 30 Sep 2026** in favour of Creator Hub uploads [S26].
- **Age checks**: age-check penetration 57% globally at end of Q2 (over 70% in US and Australia; 75% of US under-18s; target 90% long term) [S18]. Mandatory age check for chat began January 2026 [S19]. Facial Age Estimation is now an ID alternative for creators under 18 [S8].
- **Roblox Kids (5-8) and Roblox Select (9-15)**: global from 16 Jun 2026 [S46 (search snippet), S34]; about 30,000 games available [S18]. Kids is limited to Minimal and Mild maturity labels, Select adds Moderate [S19]. Creator requirements: ID verification (facial age estimation under 18, government ID for 18+), 2FA, two consecutive months of active Plus or Premium or a one-time refundable fee, account in good standing and at least 2 days old, and game evaluation reaching **250 unique highly engaged age-checked plays in 60 days** (trial limited to 16+ age-checked users) [S34]. Expedited review fee **cut to 50,000 Robux from 100,000** [S8]. **The 250 threshold drops to 100 in November 2026** [S1, S8].
- **Publishing simplification** [S1, S8]: development mode and "asset iteration" with no disruptive moderation; a content-violation approach change expected to reduce bans by nearly 40% for well-intentioned creators (Roblox target, not a result); **early testing: invite up to 10 age-checked friends before publishing**; guided publishing flow; **single question instead of the full questionnaire to reach players 16+ in most regions** (restricted-content games still need the full questionnaire; the IARC-style questionnaire revamp is delayed to Late 2026 [S3]). Date conflict: the publishing post dates several items to September 2026, while the RDC wrap-up lumps them under "November 2026". Treat as "Sep-Nov 2026, unconfirmed per item".
- Roadmap safety/moderation items (all Late 2026 unless noted): asset moderation improvements, deceptive game copy takedowns, enhanced anti-cheat (Android), less frustrating moderation, **relaxed Kids and Select requirements**, **Safety Callback API**, content moderation API, UGC policy-violation details, real-time chat moderation (all three of the last delayed to Late 2026) [S3]. Name checks and promotional text Late 2026 [S3].
- **Communication**: Global Chat (30M messages a day in June), Quick Words (5M+ coordinating messages a day by July); creator-customisable Quick Words COMING Late 2026 (policy reviewed); in-experience Friends Chat tab and voice typing released at or near RDC [S18, S2, S3].
- **Player Support** (in-game bug reports with device metadata, clustering, response templates): early access since mid-Sep 2026, rolling invites, 13+ age-checked reporters only; client logging and microprofiler dumps by end 2026; under-13 and AI de-duplication in 2027 [S32].
- **Terms of Use update effective 1 Nov 2026**: Roblox described as principal distributor and merchant of record; creator payments and tax sections reworded; EEA consumer withdrawal right [S38]. **RTBF username retirement** in effect 2 Oct 2026 [S28].
- **API changes**: after 19 Oct 2026 Roblox lowers cookie and unauthenticated-IP rate limits for six web API services (badges, datastores, game-persistence, inventory, thumbnails, users); **Open Cloud limits not affected** [S39]. Deprecated web endpoints dated 26 Oct 2026 [S27]. Friends List API access changes for Australian users under 16 effective 30 Sep 2026 [S25].

### 6. Platform numbers cited at RDC (Q2 2026 data)

123M DAU (+10% YoY), 29 billion hours (+5% YoY), 27M monthly unique payers, top 10 games 20% of hours (down from about 30% three years ago), the long tail (outside top 10) +25% YoY hours and +20% Robux spend, Japan DAU +67% and India +64% [S18]. Third-party press says DAU peaked at 151M in summer 2025 [S40] (unverified by Roblox documents seen).

---

## Roblox's public Creator Roadmap as of October 2026 (Fall Update, posted 18 Sep 2026) [S3]

Headline numbers: 72 items added; 47 shipped since the previous update; 32 delayed; 130 features since last RDC at 79% on time; 4,401 bugs closed. The live page is `create.roblox.com/updates/roadmap` (not readable by my fetcher, so the DevForum post is the source).

**Late 2026 (Q4):** Asset Manager Game Inventory; audio debug tools; badge improvements; client sessions and logs; direct sprite-sheet import; multiple client views; package overrides; early testing; Instance Streaming adaptive radius and path pre-fetching; minimum draw distance 500 studs; 2D particles; animated image containers; developer push notifications; input action manager; orthographic camera; upgraded UI gradients; new texture generation tool; scene generation; unified agentic permission; emissives and in-game makeup; name checks and promotional text; automatic text-to-speech translation; Dutch; creator customisation of Quick Words; asset moderation improvements; deceptive game copy takedowns; enhanced Android anti-cheat; less frustrating moderation; relaxed Kids and Select requirements; Safety Callback API; streamlined publishing flow; free trials for passes; game items outside your game; **Wallet rollout begins**; observability platform; analytics agent; journey analytics.

**Early 2027 (Q1):** compute functions; player data management improvements; project window; Teleports in Studio; isolated Place branches (branch and merge); Acoustic Simulation - Sounds; improved physics solver; on-device testing; SLIM for NPC characters and rigid welded items; collision summaries; improved motion sensors; in-game creation persistence; input action label; native object interaction; new primitives (Capsule, Cone, Disc, rounded); queue service; UI blur; OrderedDataStore histograms; Avatar Schema procedural bones; motion matching; silhouette-preserving fit; Expand Creator Hub APIs to MCP (delayed); share custom animations (delayed); fluid dynamics (delayed); improved Creator Hub Home (delayed).

**Mid 2027:** material layering; material response; terrain SDF, virtual texturing, path splines, projected decals, scattering; offline play; animation graph improvements; Avatar Schema higher mesh resolution and upgraded FACS; root motion; streaming excluded mode (delayed); advanced video API (delayed); analytics for game chat and voice (delayed).

**Late 2027:** efficient collision pipeline; improved navigation.

**Future (no date):** DevEx sunset is listed as a "Future" item per a secondary source [search result for the roadmap page]; Roblox Card 2027 [S1].

**Shipped since the last update (safe to rely on):** Better Assistant Scripting, Studio Luau file sync (Script Sync), Android native code gen, revamped Asset Manager, individually rounded corners, Freecam upgrades, accurate audio playback, styling transitions, **Server Authority**, Studio device-simulator API, StyleQueries, UI shadows and glows, Assistant chat history, Assistant NPC subagent, MeshGen in Studio, Assistant skills and docs, time-based licenses, game server logs, structured logging; Creator Store seller analytics, Creator Store asset sandboxing, Team Create age checks, custom thumbnails for models, updated DataStore limits, automated right-to-be-forgotten, DataStore custom alerts, OrderedDataStore BatchGet, game item incentives; custom analytics dashboards, segmentation and targeting, age-group analytics, analytics alerts, server lifecycle events, MessagingService insights, server management and history; global chat, quick words for all ages, easy trusted friend adds, better Continue Playing feed, better discovery recommendations, Hindi support [S3].

**Delayed (32):** notably CSG on meshes, glTF export, asset versioning, text generation API, Open Cloud APIs for AI tools, Content moderation API, real-time chat moderation, Player Support (to Late 2026, now in early access), IARC questionnaire, suspicious activity alerts [S3].

---

## The 2026 investor letters, creator-relevant points

**Q1 2026** (reported 30 Apr 2026; SEC exhibit 99.1; read via a summariser) [S19]
- DAU 132M (+35% YoY), hours 31B (+43%), bookings $1.7B (+43%), revenue $1.4B (+39%), 31M monthly unique payers (summariser figures; reconcile with the PDF before quoting).
- DevEx fees $423M (+50% YoY) reflecting the 5 Sep 2025 earnings increase.
- Announced the US 18+ DevEx increase from 8 Jun 2026 (26.6% to 37.8% effective share) with the R15-style condition.
- Roblox Plus ($4.99, creator share protected), Jumpstart, Incubator, White Glove, studio partnerships; 8,000+ applications in two months.
- Age checks mandatory for chat from January; 51% of global DAU age-checked; the letter admitted "greater-than-expected headwinds". Kids and Select described. RM3 real-time moderation shuts down roughly 5,000 violating instances daily. LLM chat rewriting.
- Discovery: optimise for 28-day retention; Q2 large-scale tests expected to "weigh on engagement and bookings".
- Guidance then: FY2026 bookings +8-12%, revenue +20-25% (later withdrawn, see Q2).
- AI: nearly half of the top 1,000 creators use Assistant or MCP; Planning Mode; NPC testing agents.

**Q2 2026** (reported 30 Jul 2026) [S18, S20, S21]
- Revenue $1.469B (+36%); bookings $1.557B (+8%, low end of guidance); operating cash flow $318M; free cash flow $294M; 123M DAU (+10%); 29B hours (+5%); 27M MUPs (+15%).
- **Q3 2026 guidance: revenue $1.413-1.490B (+4% to +10%), bookings $1.576-1.653B (down 14% to 18% YoY), ~$40M working-capital headwind from creator payout timing**; "monetization softness observed in Q2 is expected to persist in Q3" [S18]. Yahoo/GuruFocus say full-year guidance was withdrawn [S21] (not confirmed in the letter text I could read).
- Causes: engagement shifting from 2025 viral hits to new and evergreen games with lower hourly monetisation (especially under-13s in US/Canada), plus disabled cross-experience passes [S18, S20].
- DevEx fees $363M (+15% YoY), 23% of bookings (22% a year earlier). US 18+ DevEx rate "launched" in June [S18].
- Creator AI: adoption among top 1,000 and top 10,000 creators up about 15 points quarter over quarter; Assistant usage +20% sequentially; 95% of surveyed AI-using creators say it speeds launches, nearly half report 50%+ faster publishing; agents (playtest, analytics, experiment) planned for Q3 and later [S18].
- Build public alpha in New Zealand (July); the CEO said Build already has more daily creators than Studio in New Zealand [S20, S21].
- 18+ push: US 18-34 DAU +42%, US 18+ hours +27%, 18+ users monetise 50%+ higher than under-18; content broadening to 2D, strategy, puzzle, single-player; new studio partnerships; titles from them "later 2026 and into 2027+" [S18, S20].
- Age checks 57% global; Kids/Select ~30,000 games; in-experience Friends Chat in Q3; voice typing and voice calls to follow [S18].
- Moments expanding to 16+ in test markets with retention gains; five-tab homepage [S18, S20].
- Roblox Reality framed as a multi-year initiative and a likely subscription offering; Morpheus AI acquisition mentioned in the summariser output [S18, S20] (single source, unverified).
- Share repurchase up to $3B authorised 19 May 2026 [S18].

**Q3 2026**: **not yet published as of 2026-10-04.** No report date was found (Q3 2025 was late October/early November; do not assume a date). The only Q3 data are the guidance numbers above. When the Q3 letter appears, check three things: whether bookings landed inside -14% to -18%, the DevEx fee line and Wallet timing, and any change to discovery weighting.

---

## How to apply it (rules for an AI builder)

**DO**
- DO treat Roblox's "Late 2026", "Early 2027" and "Mid 2027" items as unavailable. Only features marked LIVE above may appear in generated code.
- DO make games R15-compatible to qualify for the US 18+ DevEx rate (+42%: $0.54 versus $0.38 per 100 Robux). Default to R15, or a custom rig with 15+ joints, and set Avatar Settings to R15 Only. Note this rate only applies to spend that goes through passes, developer products, Robux subscriptions and private servers, not avatar items [S17].
- DO write fulfilment for developer products with a correct `MarketplaceService.ProcessReceipt` (return `Enum.ProductPurchaseDecision.PurchaseGranted` only after the grant is saved). Since 22 Sep 2026, listed products can be sold on the home page, search and details pages, and broken receipts are flagged [S31]. Offer an explicit "Listed" shop item set, with icons.
- DO use Server Authority for competitive or movement-heavy games (set `AuthorityMode` to Server, build against Input Action System, keep to 8 animation tracks, 64 attributes) [S14]. Plan for its limits (no custom emotes, strafing animations, camera input sync).
- DO use `Player.FrustumStreaming` (automatic) for scoped weapons, racing and free-cam; do not assume SLIM or adaptive radius exist yet [S30].
- DO use the Assistant and Studio MCP server surface: every MCP call needs `studio_id`; call `list_roblox_studios` first; restart the client after Studio updates [S13]. Use `/generate_mesh`, `/generate_texture`, `/segment_mesh`, `/generate_procedural_model` where supported, and expect mesh IDs to change after texture generation [S29].
- DO keep scripts as ModuleScript/Script/LocalScript/Folder trees so Script Sync works; keep the plan in a Markdown file (Planning Mode uses editable Markdown plans) [S11, S43].
- DO favour an evergreen, retention-first design: the discovery system now weighs 28-day engagement, play-through rate and first-play bounce rate, and rewards new/long-tail games [S18]. Build a strong first-minute loop and a reason to return on day 7 and day 28.
- DO design for the new audience mix: 57% of DAU is age-checked, chat is gated by age, and 18+ users monetise 50% better [S18]. If targeting a 16+ or 18+ audience, plan the maturity questionnaire (one question suffices for 16+ in most regions once the simplification ships) and avoid restricted content unless the full questionnaire is done [S8].
- DO prepare for Kids/Select eligibility only if the creator has done ID verification, 2FA and Plus/Premium or paid the fee; the engagement bar is 250 highly engaged plays now, 100 from November 2026 [S34, S8].
- DO give subscribers a way to buy Roblox Plus through the subscription prompt (`PromptRobloxSubscriptionPurchase`; confirm the exact call and where it lives in the current docs, because I could not verify the signature) to collect 250 Robux per month for three months per new subscriber; and design private servers worth 60+ minutes of play to collect the private-server bonus [S15].
- DO use rewarded video where eligible; tell the user the Studio plug-in and the pre-play surface arrive in Q4 2026 [S24].
- DO use Early Harm Detection and Experiments for live games (24-hour near-real-time guard rails) [S28].
- DO keep Open Cloud (not legacy web endpoints) for any external tooling: legacy rate limits for six web APIs drop after 19 Oct 2026, Open Cloud is unaffected [S39].
- DO assume Transfers API only for player-to-player Robux gifting; the old "donate through another game's pass" trick is gone [S37].

**DON'T**
- DON'T rely on Wallet, Roblox Card, pre-roll ads (test only), Roblox Everywhere or standalone apps, web play, offline play, Scene Generator, Branch and Merge, Cone/Capsule/Disc primitives, material layering, terrain scattering and splines, motion matching default movement, orthographic camera and 2D particles, UI blur, Queue Service, compute functions, in-game creation persistence, the Analytics and Experiment agents, Roblox Reality, free trials for passes, Safety Callback API, or Open Cloud AI APIs and MCP Creator Hub APIs. These are all Late 2026 or later or undated.
- DON'T present the Playtest Agent as a gate: it is Beta, capped daily, limited to 50 turns, prone to false positives, and cannot test real-time combat or vehicle steering [S12]. Always add scripted assertions or logs.
- DON'T sell passes or developer products across games (disabled since 29 May 2026, even within one owner's experiences) [S37].
- DON'T assume the Premium payout or "Premium Payouts" model: Premium is closed to new subscribers and replaced by Plus [S15]. Creator Rewards exists, but its current rates are not published here.
- DON'T promise the user a money schedule that assumes DevEx forever: the US sunset is mid-2027, and Wallet needs a US adult independent creator account first [S7].
- DON'T use YouTube embeds on game pages (removed 30 Sep 2026) [S26].
- DON'T trust single-source numbers marked "single source" (Plus 70% to 88%, 64 terrain materials, median earnings, 151M DAU peak) in user-facing text without checking the primary page.
- DON'T use `PhysicsService` for collision groups in new code; use the `WorldRoot` collision-group API (exact member names unverified here; check the docs) [S25].

---

## Recipes (each becomes a skill)

### Make a game eligible for the US 18+ DevEx rate
When to use: any game with passes, developer products, subscriptions or private servers.
Steps:
1. In Game Settings > Avatar, choose R15 and set "R15 Only" if you use a custom character system.
2. If the game uses a custom rig, ensure it has 15 or more joints or parts in a human-like layout, or is a quadruped/dragon/vehicle rig, or has no visible player characters.
3. Route monetisation through game passes, developer products, Robux subscriptions or private servers (avatar items do not count).
4. Open `create.roblox.com/settings/eligibility/us-o18-devex-rate` after publish to confirm status. No application is needed.
Pitfalls: VPN users and non-US economic locations do not qualify; only age-checked 18+ players count [S17].

### Turn on Server Authority
When to use: PvP, races, anything where speed-hacking or teleporting would hurt.
Steps:
1. Select Workspace, set `AuthorityMode` to Server; the five dependent settings switch themselves.
2. Move player input to the Input Action System (it is forced on).
3. Check animation use (max 8 tracks per Animator) and attributes (max 64 per instance).
4. Replace any camera-direction `InputAction` sync with `Player:GetCameraState()`.
5. Playtest with simulated latency (Studio device simulator or network settings), then save and publish.
Pitfalls: Remote events are not on the shared timeline, so do not rely on a Remote arriving "at tick N"; mobile and console clients get engine updates days later than desktop [S14].

### Wire developer products so they are sellable outside the game
When to use: any shop with developer products.
Steps:
1. Implement a single `MarketplaceService.ProcessReceipt` callback; grant, persist, then return PurchaseGranted; return NotProcessedYet on any failure.
2. In Creator Hub > Monetization, mark products Listed and add icons.
3. Open the diagnostics report for products Roblox flagged and mark fixed after correcting.
Pitfalls: items are only shown externally if both conditions hold; earnings are unchanged [S31].

### Add Roblox Plus incentives
When to use: games with a subscription-friendly loop or paid private servers.
Steps:
1. Add a clear "Get Roblox Plus" button that triggers the subscription purchase prompt (`PromptRobloxSubscriptionPurchase`; verify the exact call in docs).
2. Offer paid private servers with a reason to stay 60+ minutes within 30 days (the bonus is up to 100 Robux per Plus subscriber over the five best servers).
3. Do not show Plus-only benefits to non-eligible audiences without age checks.
Pitfalls: new Premium sign-ups ended on 30 May 2026; the 250-Robux bonus covers only the first three months [S15].

### Use frustum streaming for scopes and racing
When to use: sniper scopes, racing, spectator/free cam in streamed worlds.
Steps: leave `Player.FrustumStreaming` on automatic; set it explicitly with `Enum.FrustumStreamingMode.Enabled` only for scenes that need it; keep StreamingEnabled true. Measure memory on low-end phones.
Pitfalls: there is no occlusion culling, so it streams hidden objects too; no per-model choice [S30].

### Drive Studio from an external agent (MCP) safely
When to use: an AI client (Claude Code, Codex, Cursor) edits the place.
Steps:
1. Enable the Studio MCP server in Assistant settings; check the connected-clients tooltip.
2. Call `list_roblox_studios`, record the `studio_id`, pass it in every tool call.
3. After every Studio update, restart the AI client.
4. Use Script Sync for bulk script edits and MCP for instance edits and playtests.
Pitfalls: `set_active_studio` is gone; crashes under heavy workflows are reported [S13, S43].

### Plan a generation-heavy asset pass
When to use: building props and set dressing.
Steps: generate meshes (`/generate_mesh`), segment (`/segment_mesh`, max 5 parts per command), restyle (`/generate_texture`), then set collisions with the new collision geometry controls.
Pitfalls: mesh IDs change after texture generation, custom normals reset [S29, S26].

### Protect a live launch with experiments
When to use: monetisation or onboarding changes in a live game.
Steps: create an Experiment with a control group; watch Early Harm Detection (playtime, payer conversion, ARPU, 5-minute refresh for the first 24 hours); stop the experiment on a critical-harm alert [S28].

---

## Luau reference snippets
Only APIs confirmed in the sources above. Check the current API reference before use.

```lua
-- Server Authority is set in Studio (Workspace.AuthorityMode = Server). Read it at runtime if needed.
local Workspace = game:GetService("Workspace")
print(Workspace.AuthorityMode) -- property named in the 9 Jul 2026 release post [S14]
```

```lua
-- Frustum streaming (property and enum names from the 28 Sep-2 Oct 2026 post) [S30]
local Players = game:GetService("Players")
local player = Players.LocalPlayer
player.FrustumStreaming = Enum.FrustumStreamingMode.Enabled -- or .Disabled; leave unset for automatic mode
```

```lua
-- Developer product fulfilment that survives the new "sold outside the game" surfaces [S31]
local MarketplaceService = game:GetService("MarketplaceService")
MarketplaceService.ProcessReceipt = function(receiptInfo)
	local ok = pcall(function()
		-- grant the item and persist it (DataStore) before returning
	end)
	if ok then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	return Enum.ProductPurchaseDecision.NotProcessedYet
end
```

Unverified (do not emit without docs): the call signature and owner of `PromptRobloxSubscriptionPurchase`; WorldRoot collision-group method names; Wallet or Ads plug-in APIs (none published).

---

## Open questions / unverified
- Exact Wallet launch day (December 2026 vs "Late 2026") and fee or minimum details; regions after the US.
- Exact DevEx sunset dates by region; whether a Wallet-less creator keeps DevEx after mid-2027 in the US.
- Roblox Everywhere: eligibility, store partners, revenue share, review, whether standalone builds can use all Roblox services. Only "select developers and storefronts first" has appeared, from press.
- Pre-roll ads: revenue share to creators (not published), launch date, which games are included.
- Roblox Reality: any developer-facing API, price, or date; Q2 call hints at a subscription tie-in.
- Whether the "Highly Engaged Player 250 to 100" change shipped in November and the publish-flow items in September or November (the two Roblox posts disagree).
- Plus creator-share figure (70% to 88%) is from one summary of the staff post; DevEx "50% premium" in a call summary conflicts with 42%.
- Terrain timing: forum post says early access "Late Fall/Winter" while the roadmap puts the features at Mid 2027.
- Whether the live roadmap page (`create.roblox.com/updates/roadmap`) differs from the DevForum Fall Update (I could not read the live page).
- SEC and PDF letter figures were read through a summariser (the PDFs would not parse); verify the Q1 DAU (132M), bookings and DevEx-fee numbers against the PDFs before quoting them externally.
- Q3 2026 results and creator commentary: pending; date not found.
- Default sprint/crouch, animation packs and licensed-IP sales came from a third-party monthly recap (S44) and should be checked in docs.

---

## Sources
[S1] RDC26: What We Announced, Roblox staff, DevForum (listed 29 Sep 2026; event 10-12 Sep 2026), https://devforum.roblox.com/t/rdc26-what-we-announced/4865880
[S2] RDC 2026: The World Needs More Play, Roblox Newsroom, Sep 2026, https://about.roblox.com/newsroom/2026/09/rdc-2026-the-world-needs-more-play
[S3] Creator Roadmap 2026: Fall Update, Roblox staff, DevForum, 18 Sep 2026, https://devforum.roblox.com/t/creator-roadmap-2026-fall-update/4880208
[S4] Roblox dives into the details on its RDC: engine updates, Roblox Wallet, and offline play, GamesBeat (press briefing), Sep 2026, https://gamesbeat.com/roblox-dives-into-the-details-on-its-rdc-engine-updates-roblox-wallet-and-offline-play-press-briefing/
[S5] Roblox makes a play for triple-A developers at RDC 2026, GamesBeat, Sep 2026, https://gamesbeat.com/roblox-makes-a-play-for-triple-a-developers-at-rdc-2026/
[S6] Roblox hits 20 and opens RDC 2026 (Baszucki keynote), GamesBeat, Sep 2026, https://gamesbeat.com/roblox-hits-20-and-opens-rdc-2026-to-invite-the-world-to-play-and-make-games-dave-baszucki-keynote/
[S7] Introducing Roblox Wallet and Card: Get Paid Faster, Roblox staff, DevForum, Sep 2026, https://devforum.roblox.com/t/introducing-roblox-wallet-and-card-get-paid-faster/4865505
[S8] Making Publishing Easier: Our Vision and What's Coming, Roblox staff, DevForum, Sep 2026, https://devforum.roblox.com/t/making-publishing-easier-our-vision-and-whats-coming/4865780
[S9] Roblox's other AI announcement: three Studio agents for playtesting, analytics and experiments, ZehnStudio99 (third-party), Jul-Sep 2026, https://zehn-studio26.com/news/studio-ai-agents-playtest-analytics-experiment/
[S10] Build Without Limits on Roblox, Roblox Newsroom, 16 Jul 2026, https://about.roblox.com/newsroom/2026/07/build-without-limits-on-roblox (read via search snippet)
[S11] Roblox Studio is Going Agentic, Nick Tornow, Roblox Newsroom, 15 Apr 2026, https://about.roblox.com/newsroom/2026/04/roblox-studio-going-agentic
[S12] [Studio Beta] Studio Assistant & MCP Playtest Agent, DevForum, 9 Apr 2026, https://devforum.roblox.com/t/studio-beta-studio-assistant-mcp-playtest-agent/4566767
[S13] Studio MCP: Multi-Agent Improvements and Connected AI Clients, DevForum, 19 Aug 2026, https://devforum.roblox.com/t/studio-mcp-multi-agent-improvements-and-connected-ai-clients/4820583
[S14] [Full Release] Ship Fair and Competitive Games with Server Authority, DevForum, 9 Jul 2026, https://devforum.roblox.com/t/full-release-ship-fair-and-competitive-games-with-server-authority/4727993
[S15] Introducing Roblox Plus, Roblox staff, DevForum, 10 Apr 2026, https://devforum.roblox.com/t/introducing-roblox-plus/4567894
[S17] Introducing the US 18+ DevEx Rate, Roblox staff, DevForum, Apr 2026 (effective 8 Jun 2026), https://devforum.roblox.com/t/introducing-the-us-18-devex-rate-earn-42-more-on-spend-from-18-us-players/4607091
[S18] Roblox Q2 2026 Earnings Shareholder Letter, Roblox (SEC Exhibit 99.1), 30 Jul 2026, https://www.sec.gov/Archives/edgar/data/0001315098/000162828026051059/ex991-robloxq22026earnin.htm
[S19] Roblox Q1 2026 Earnings Shareholder Letter, Roblox (SEC Exhibit 99.1), 30 Apr 2026, https://www.sec.gov/Archives/edgar/data/0001315098/000162828026028882/ex991-q12026earningsshar.htm
[S20] Earnings call transcript: Roblox Q2 2026, Investing.com, 30 Jul 2026, https://www.investing.com/news/transcripts/earnings-call-transcript-roblox-q2-2026-beats-eps-but-shares-sink-on-bookings-93CH-4826338
[S21] Roblox Corp Q2 2026 Earnings Call Highlights, GuruFocus via Yahoo Finance, Jul 2026, https://finance.yahoo.com/markets/stocks/articles/roblox-corp-rblx-q2-2026-050249366.html
[S22] Ads Manager RDC Recap: Earnings, ROAS Reporting, Incrementality, Roblox staff, DevForum, 2-3 Oct 2026, https://devforum.roblox.com/t/ads-manager-rdc-recap-earnings-roas-reporting-incrementality/4909790
[S23] Roblox Wants a Line in Every Media Plan. Pre-Roll Ads are Its Latest Argument, Beet.TV, 30 Sep 2026, https://www.beet.tv/2026/09/roblox-wants-a-line-in-every-media-plan-pre-roll-ads-are-its-latest-argument.html
[S24] Roblox Eyes Expanded Placements For 'Rewarded' Video Ads, MediaPost, 15 Sep 2026, https://www.mediapost.com/publications/article/417959/roblox-eyes-expanded-placements-for-rewarded-vid.html
[S25] Weekly Recap: August 31 - September 4, 2026, DevForum, https://devforum.roblox.com/t/weekly-recap-august-31-september-4-2026-emissive-items-and-enhanced-freecam/4850676
[S26] Weekly Recap: September 14-20, 2026, DevForum, https://devforum.roblox.com/t/weekly-recap-september-14%E2%80%9320-2026/4880336
[S27] Weekly Recap: September 21-25, 2026, DevForum, 1 Oct 2026, https://devforum.roblox.com/t/weekly-recap-september-21-25-2026/4894110
[S28] Weekly Recap: September 28-October 2, 2026, DevForum, 3 Oct 2026, https://devforum.roblox.com/t/weekly-recap-september-28%E2%80%93october-2-2026/4910267
[S29] Introducing New Texture Generation Tools, Segment Any Mesh, and Image Previews, DevForum, Sep 2026, https://devforum.roblox.com/t/introducing-new-texture-generation-tools-segment-any-mesh-and-image-previews/4890084
[S30] Frustum Streaming: Stream What Your Players See, DevForum, Sep-Oct 2026, https://devforum.roblox.com/t/frustum-streaming-stream-what-your-players-see/4904553
[S31] Players Can Now Find In-Game Items Outside Your Game, DevForum, 22 Sep 2026, https://devforum.roblox.com/t/players-can-now-find-in-game-items-outside-your-game/4888425
[S32] Early Access: Player Support, DevForum, Sep 2026, https://devforum.roblox.com/t/early-access-player-support/4878091
[S33] Terrain Updates: Object Scattering, Path Splines, Projected Terrain Decals and More, DevForum, Sep 2026, https://devforum.roblox.com/t/terrain-updates-object-scattering-path-splines-projected-terrain-decals-and-more/4865617
[S34] Roblox Kids and Select (publishing requirements), Creator Hub docs, 2026, https://create.roblox.com/docs/production/publishing/kids-and-select
[S35] Introducing the Roblox Hybrid Architecture (Roblox Reality), Roblox Newsroom, Apr 2026, https://about.roblox.com/newsroom/2026/04/roblox-reality-hybrid-architecture-democratizing-photorealistic-multiplayer-gaming
[S36] Accelerating Creation, Powered by Roblox's Cube Foundation Model, Roblox Newsroom, 4 Feb 2026, https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model
[S37] Disabling Cross-Game Sales of Passes and Dev Products and Introducing the Transfers API, DevForum, May 2026, https://devforum.roblox.com/t/disabling-cross-game-sales-of-passes-and-dev-products-and-introducing-the-transfers-api/4618396
[S38] Updates to the Roblox Terms of Use (November 2026), DevForum, Oct 2026, https://devforum.roblox.com/t/updates-to-the-roblox-terms-of-use-november-2026/4907620
[S39] API Update: API Rate Limit Tuning, DevForum, Oct 2026, https://devforum.roblox.com/t/api-update-api-rate-limit-tuning/4906160
[S40] Roblox to launch wallet to pay creators faster and will allow off-platform gaming, Yahoo Finance (press), Sep 2026, https://finance.yahoo.com/technology/articles/roblox-launch-wallet-pay-creators-195208058.html
[S41] Roblox RDC 2026: Every Major Announcement for Players and Creators, allthings.how (third-party), Sep 2026, https://allthings.how/roblox-rdc-every-major-announcement-for-players-and-creators/
[S42] Roblox unveils new play, creation and monetisation tools at RDC 2026, PocketGamer.biz, Sep 2026, https://www.pocketgamer.biz/roblox-unveils-new-play-creation-and-monetisation-tools-at-rdc-2026/ ; also Adgully, https://www.adgully.com/post/20490/roblox-unveils-standalone-publishing-and-ai-suite-at-rdc-2026
[S43] [Full Release] Studio Script Sync, DevForum, Jun 2026, https://devforum.roblox.com/t/full-release-studio-script-sync/4688454 (read via search snippet)
[S44] Roblox Recap: September 2026, Bloxy News (third-party), https://www.bloxy.news/post/september26
[S45] Roblox Wallet: The End of DevEx (RDC workshop notes), Evanbear1 on X (third-party, search snippet only), https://x.com/EvanZir/status/2099195661459784019 ; BloxFeed on X, https://x.com/Blox_Feed/status/2099249150080520286
[S46] Age-Based Roblox Kids and Roblox Select Accounts Now Globally Available, Roblox Newsroom, Jun 2026, https://about.roblox.com/newsroom/2026/06/age-based-roblox-kids-and-select-accounts-now-globally-available (search snippet only)
[S47] Moments: More Ways to Discover Your Next Favorite Game on Roblox, Roblox Newsroom, Jul 2026, https://about.roblox.com/newsroom/2026/07/moments-new-homepage-unlocks-gaming-for-all (search snippet only)
[S48] Introducing Creator Rewards, DevForum, 2025 (possibly stale for rates), https://devforum.roblox.com/t/introducing-creator-rewards-earn-more-by-growing-the-community/3777628 (search snippet only)
[S49] Roblox Reports Second Quarter 2026 Financial Results (press release, 30 Jul 2026, no Q3 date stated), https://ir.roblox.com/news/news-details/2026/Roblox-Reports-Second-Quarter-2026-Financial-Results/default.aspx
[S50] [Early Access] / [Client Beta] / Weekly Recap (Apr 2026) Server Authority posts, DevForum, https://devforum.roblox.com/t/client-beta-publish-test-your-server-authoritative-experiences/4606949 (search snippets)
