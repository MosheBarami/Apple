# Monetization, creator economy and platform policy
_Researched 2026-10-04 by deep-research agent (topic 08). Sources: 70 (S1-S68, S71, S72; a few are search-snippet-only or third-party, flagged in the list). Roblox policy changes monthly; every rule below carries a date, and anything dated before 2024 is flagged as possibly stale._

## Key facts

### A. How money flows (the 2026 baseline)
- Creator share on in-experience Robux sales (passes, developer products, private servers) is 70 percent, with a 30 percent marketplace fee. Marketplace (avatar item) sales pay the creator 30 percent, or up to 70 percent with the progressive price-floor scheme; in-game sales of avatar items split 30 percent creator and 40 percent experience owner [S9][S71]. Docs checked 2026-10.
- Robux that count for cash-out are "Earned Robux": in-experience sales, private servers, Creator Rewards, marketplace and Creator Store sales. Purchased Robux, subscription grants, gift-card Robux and item resales do not count [S2].
- One third-party snapshot (Roblox Creator Hub overview, 2026): 132 million DAU, over 35,000 creators in DevEx, median DevEx earnings 1,550 USD in the 12 months to 2025-12-31, top-1,000 creators averaging about 1.3 million USD in 2025 [S10]. Roblox Q1 2026 letter: DevEx fees 423 million USD, up 50 percent year on year (282 million USD in Q1 2025), 29 percent of revenue and 24 percent of bookings; DAU 132 million; monthly unique payers 31 million [S4]. RDC26 slide (2026-09-11): DevEx about 1.7 billion USD, up about 50 percent, 123 million DAU in Q2 2026 [S56]. 2024 DevEx was 922 million USD [S6].
- Context for builders: Roblox guided 2026 bookings growth down to 8-12 percent after age-check headwinds (Q1 2026 letter) [S4]; third-party Lensblox claims a June 2026 discovery change moved evaluation from 7 to 28 days (label: third-party, not verified against a Roblox primary page) [S63].

### B. DevEx (cash-out) - rates and rules
- Standard rate from 2025-09-05 10:00 PT: 0.0038 USD per Earned Robux (10,000 Robux = 38 USD), up 8.5 percent from 0.0035. Robux earned before that moment keep the old rate; the dashboard shows old and new balances separately [S1]. Announced at RDC25.
- Enhanced rate from 2026-06-08 (announced 2026-04-30): 0.0054 USD per Earned Robux (a 42 percent uplift) for eligible spend by age-checked 18+ players whose economic location is the US. Eligible spend: passes, developer products, Robux subscriptions, private servers. Not eligible: in-game avatar items and marketplace items. Experiences must use R15-only avatars, custom human rigs with 15+ parts/joints, custom non-human rigs (for example quadrupeds, vehicles), or show no visible player characters. No application needed; earnings from 18+ US players appear separately in Creator Analytics [S3][S2]. A new Age Check API lets an experience see which users are age-checked and prompt others [S3] (exact API name and signature unverified).
- Roblox's Q1 2026 letter frames the same change as creators' effective earnings on age-checked US over-18 spend moving to 37.8 percent from 26.6 percent, and says over-18 users monetise over 50 percent better than under-18 users [S4]. This implies design should target older players, but see policy section on under-16 gating.
- Eligibility: age 13+, at least 30,000 Earned Robux (114 USD at the standard rate; 162 USD if all at 0.0054), verified email, DevEx portal account with tax form (W-9 or W-8), compliance with Terms and Community Standards. One completed request per calendar month. Processing about 10 business days first time and about 5 business days after, plus bank time; payment partner Tipalti [S2]. Legacy rate 0.0035 persists for pre-2025-09-05 balances [S2].
- Reported bug (2026-06-01): the cash-out form capped withdrawal at an inaccurate "estimated eligible amount"; the workaround reported by developers was waiting about 72 hours after group payouts [S68] (user report, status unresolved in the thread).
- Coming: Roblox Wallet (late 2026) pays earnings automatically each business day in USD; a Roblox Card follows in 2027 pending a bank partner [S56]. Treat as announced, not live.
- Payment holds: Creator Rewards payouts are held 60 days (first rewards paid 2025-09-24) [S5][S7][S8]. Avatar item commissions carry a 30-day escrow [S71]. Local-currency subscription revenue has a 30-day hold [S13].

### C. Creator Rewards (replaced Premium Payouts / Engagement-Based Payouts)
- Announced 2025-06-24, live 2025-07-24. It replaced Engagement-Based Payouts (the old Premium Payouts pool tied to Premium members' playtime) and the Creator Affiliate programme [S6][S7]. No enrolment needed for Daily Engagement.
- Daily Engagement Reward: 5 Robux per day for each Active Spender who plays at least 10 minutes in your experience that day, where your experience is one of the first three they play for 10+ minutes [S5][S6]. At 0.0038 USD that is about 0.019 USD per qualifying player per day.
- Active Spender: spent at least 9.99 USD on Robux, Premium (now Plus) or UGC subscriptions in the last 60 days, and not a New or Reactivated user in that window [S5].
- Audience Expansion Reward: 35 percent revenue share on the first 100 USD of qualifying purchases by a New User or Reactivated User (inactive 60+ days) in their first two months; the experience needs an average of 100+ daily active users over that 60-day period; attribution via Share Links, direct experience links or name search; creator needs an ID-verified account in good standing and a valid DevEx account [S5][S6]. Users who joined through Roblox promotions do not count; duplicates (alts) are decided at Roblox's discretion [S5].
- Prohibited: automated or artificial activity, encouraging alts, fraud; penalties are forfeited rewards, removal from the programme, account termination [S5].
- Reception: small studios reported sharp drops after the switch (developer claims, not Roblox data) [S7][S8]. Roblox projected 2x more experiences earning 5+ Robux [S7].
- Practical read: the reward pays for session depth by paying users in your game, so a game that makes a 10-minute first-three slot habitual matters more than raw visits.

### D. Roblox Plus (replaced Premium; launched 2026-04-30)
- 4.99 USD per month globally. Announced 2026-04-10 [S14][S15]. New Premium sales ended; existing Premium members keep monthly Robux and trading/publishing rights; the 10 percent Robux purchase bonus ended 2026-05-30 [S14][S15]. Optional Plus 500, 1000 and 2000 bundles add recurring monthly Robux [S15].
- Subscriber benefits: 10 percent discount on eligible in-game items and avatar items, rising to 20 percent after 3 consecutive months; free access to paid private servers; fee-free Robux transfers; item trading and avatar publishing [S15][S16].
- Creators are not charged for the discount: Roblox covers it so the creator earns the same per item [S14][S16]. By arithmetic (my calculation, not a staff figure) a 20 percent discounted 100 Robux sale still pays 70 Robux, which is 87.5 percent of what the buyer paid. Exclusions from the discount include items above 1,000,000 Robux, marketplace fees, ad credits and group fees [S16].
- New creator income: 250 Robux per month for each newly acquired Plus subscriber's first 3 consecutive months, 750 Robux maximum, triggered via `MarketplaceService:PromptRobloxSubscriptionPurchase(player)` (in-experience prompt) [S14][S16][S29]. Plus subscribers who spend 60+ cumulative minutes in paid private servers earn the creator up to 100 Robux per subscriber per server, counting the subscriber's top 5 servers, checked monthly [S14][S20].
- Plus private-server limit: from 2026-09-24 each Plus member gets one free private server instance per game (was unlimited); extra Plus-granted servers expire at renewal; players can still buy extra servers at the creator's price [S17][S18]. (S17 is a search-result snippet of the devforum post; S18 is third-party RobloNews; the official post body was not fetched.)
- Pre-roll ads: Plus subscribers will be exempt from the upcoming pre-roll format [S56].
- Plus is also required to send Robux transfers (see section G) and, for most new creators, to publish to under-16 audiences (see section H).

### E. In-experience products and prices (docs, 2026)
- Game passes: one-time purchase; price 1 to 1 billion Robux; icon at most 512x512, .jpg/.png/.bmp; promoted passes on the Buy Robux surface must be priced 50-800 Robux; `RecommendTopProductsAsync` needs at least 1 sale in 28 days and returns up to 50; `RankProductsAsync` is strictly rate-limited so call once per join [S11].
- Developer products: repeatable; same price bounds; must implement `ProcessReceipt`; `PromptProductPurchaseFinished` does not prove a purchase; Roblox does not store purchase history, so store your own; product sales outside the experience (external sales) require test-mode validation and product thumbnails, and paid random or limited-quantity items cannot be sold externally [S12].
- Cross-experience sales of passes and developer products ended 2026-05-29 (docs say 2026-05-30; announced 2026-05-04) with no exceptions, including same-owner games; avatar items and Experience Details Page purchases were unaffected [S35][S11][S12]. Formerly the split on such sales was 30 percent Roblox, 60 percent recipient, 10 percent developer [S36].
- Subscriptions: Robux subscriptions are open to all creators from 49 Robux (custom amounts); local-currency subscriptions need ID or phone verification and fixed tiers of 2.99, 4.99, 7.99, 9.99 or 14.99 USD. Revenue: Robux subscriptions 70 percent every month; local-currency 70 percent in month 1 and 100 percent from month 2. Up to 50 subscriptions per experience. No refunds on Robux subscriptions. Cannot steer buyers to other platforms or add extra gates after purchase [S13].
- Private servers: set a Robux price (or free) under Audience > Access Settings; cannot combine with paid access; changing price used to cancel active subscriptions, but since 2026-04-30 you can change price every 60 days without cancelling (30 days' notice for increases), group payout splits update immediately, regional pricing is automatic [S19][S20].
- Paid access: referenced in the docs overview as one-time entry fee (up to 90 percent share on some real-money sales, per Roblox overview) [S10]; the dedicated page was not retrievable, so specifics are unverified.
- Rewarded video (see section F), immersive ads (billboards, portals) and Roblox Plus income are the non-purchase revenue sources.

### F. Ads for creators
- Rewarded Video: in-experience opt-in ad that pays a developer product reward. Timeline: limited to creators with 100K+ DAU on Windows PC at launch (2025-07-24) [S21]; widened to all "ads eligible" creators on 2025-11-11 with update 2026-02-18 [S22]; no-code placement tool, A/B experimentation, and "Join with Reward" on experience pages announced 2026-05-20 (limited testing) [S23].
- Eligibility: public unrestricted experience with 2,000+ unique monthly visitors, no free-form user creation or AI interaction, creator 13+, 2-step verification, ID verification, completed maturity questionnaire [S22][S24]. Reward must be a developer product that would normally sell for Robux, not random, not Robux itself; recommended value 3-10 Robux; video length 6-30 seconds; place at natural breaks; do not force ads for core progression [S22][S24].
- Revenue: Roblox does not publish a revenue share; docs say earnings are EPM (per 1,000 impressions) times impressions [S24]. Roblox stated an early expectation of up to 3 percent of creator earnings with a 5-10 percent long-term goal; named examples Brookhaven "five figures monthly" and Easy Glass Bridge +40 percent [S21][S25]. Developers in the 2026-05 thread estimated roughly 1 Robux per view and warned that swapping a 19 Robux product for ads can cut revenue sharply (community anecdote, not official) [S23].
- Ads Manager pricing for advertisers: 1 Ad Credit costs 263 Robux (was 285) from 2025-09 [S25]. Advertiser CPTV tiers for brand integrations start 2027-01 (see section I) [S27].
- Immersive ads: click-to-play video (paid when watched 15+ seconds), autoplay video (0.5+ s in view), image (1+ s) and portal ads (per completed teleport). Billboards are `AdGui` objects on Parts 8-32 studs wide and 4.5-18 studs tall; payouts on the 25th of the following month; same eligibility as rewarded video; ineligible users see a fallback image; `PolicyService` `AreAdsAllowed` tells you whether to show them [S26][S57].
- Pre-roll video format (skippable, mobile first, no code, revenue shared, Plus exempt): announced RDC26, "coming soon" [S56].

### G. Price tools and Robux transfers
- Managed Pricing (2026-06-15) merges Regional Pricing and Price Optimization into one opt-in in Creator Hub > Monetization; new games and new items enrol by default with item-level opt-out; subscriptions and private servers are regionalised automatically; players cannot opt out of pricing tests [S31][S30].
- Regional prices are never below 30 percent of the default or above it; price level 1-1000 per user via `GetUsersPriceLevelsAsync` (1000 = full price); do not cache across sessions; compare levels to allow gifting to lower levels and restrict trades to equal levels [S34][S30]. Roblox's analysis of the top 2,500 games (Jan-Dec 2025): 4-10 percent average Robux spend increase, 43-52 percent more pass purchases in discounted regions [S31].
- Price Optimization needs 60,000+ transactions in the prior 30 days, dynamically scripted prices, tests of about 3 weeks, rerun at least every 90 days, then a 4-week review; only passes and developer products, not subscriptions [S32][S33]. Eligible creators gained about 4 percent on average; Slap Battles over 15 percent [S31].
- Robux Transfers API (2026-05-04): the replacement for cross-game donations. A sender needs Roblox Plus; creator earns 10 percent (DevEx eligible), recipient 90 percent (not DevEx eligible), Roblox takes 0 percent; 10-500 Robux per transaction per docs; caps started at 500/day and 1,000/month and rose to 5,000/day and 10,000/month with 2-Step Verification (update 2026-05-15); under-18s need parental approval per transfer (age threshold lowered from 18 to 16 in most regions in June 2026) [S35][S36][S37]. Methods: `MarketplaceService:PromptRobuxTransferAsync(sender, receiverUserId, amount)` and a receipt handler via `BindReceiptHandler` with `RobuxTransferSender`/`RobuxTransferReceiver` receipt types [S37][S29] (taken from reference summaries; verify the exact enum names in Studio before shipping).

### H. Policy: audience, maturity, publishing (2024-2026 timeline)
- 2024-11-06 announcement, enforced 2024-11-18 and 2024-12-03: social hangouts and free-form 2D creation restricted for under-13s; unrated experiences undiscoverable for under-13s; questionnaire required [S45]. Possibly stale; superseded by the 2026 system below.
- 2025-08-28: Restricted (formerly 17+) content moved to 18+; under-18s stopped seeing it in search from that date; access fully blocked for under-18s on 2025-11-06; new Restricted experiences need an 18+ creator; creators of prior 17+ games grandfathered [S44]. The experience guidelines page still shows the old All Ages/9+/13+/17+ wording [S43]; the content-maturity page (Minimal, Mild, Moderate, Restricted) is the current one [S42].
- Content maturity labels: Minimal (occasional mild violence, light unrealistic blood), Mild (repeated mild violence, heavy unrealistic blood, mild fear, mild crude humour), Moderate (moderate violence, light realistic blood, moderate fear and crude humour, unplayable gambling), Restricted (strong violence, heavy realistic blood, romantic themes, alcohol, strong language) [S42]. Questionnaire categories include violence, blood, fear, crude humour, unplayable gambling, strong language, romantic themes, alcohol, social hangouts, free-form user creation, sensitive issues, paid random items, paid item trading, media, AI interaction [S42]. Social hangouts without private spaces are 16+, with private spaces 18+; free-form creation 16+ (per the content-maturity page; older guideline page said 13+, so prefer the newer page) [S42][S43]. Restricted experiences cannot change label (descriptors only), and when an experience gets Restricted, servers restart and non-18+ players are removed [S42]. Restricted is not playable in some countries (Korea, Saudi Arabia, Turkiye per the docs) [S42]. Appeals via roblox.com/report-appeals [S42].
- 2026-01-07: Age Check required to chat, global; chat groups under 9, 9-12, 13-15, 16+ talk to adjacent bands; `TextChatService` required for player chat; social-links sharing through policy API ends; Team Create requires age checks from March 2026 [S53]. Roblox's Q1 letter says this slowed new-user acquisition [S4].
- Roblox Kids (5-8: Minimal/Mild only, chat off by default) and Roblox Select (9-15: up to Moderate): limited launch May 2026, global 2026-06-16 [S46][S47][S48]. Inclusion is by a continuous selection process: developer verification (ID/age check, 2FA, active Plus), real-time evaluation by age-checked 16+ players, and maturity label; sensitive issues, social hangouts and free-form drawing are excluded by default [S46][S49].
- Publishing rules (announced 2026-04-13, live 2026-05-19; fee note 2026-05-11): every creator can publish to 16+ and Trusted Friends with an age check, good standing and an account at least 2 days old. To reach all ages (including under 16) you also need ID verification (18+) or facial estimation (under 18), 2FA, passing evaluation, and either 2 consecutive months of Plus/Premium or a one-time refundable per-game fee [S50][S49]. The docs (updated 2026-10-02) give the evaluation bar as 250 unique plays by highly engaged age-checked users within 60 days, and an optional 50,000 Robux expedite fee; fees are refundable 90 days after eligibility [S49]. The 2026-05-11 forum note states a publishing fee of 1,000 Robux [S50]. RDC26 says the highly-engaged threshold drops to 100 in November 2026 [S56]. A 2026-08 staff reply cited 500 engaged players or 100,000 Robux, which conflicts with the docs and the AMA thread [S51]; treat the number as unverified and read the live page.
- Side effects: since 2026-06-16 some games were mislabelled 16+ with reported audience drops of up to 80 percent [S52] (developer reports).
- Content questionnaire simplification (RDC26): a single question for 16+ access in most regions, plus a development-phase moderation grace period and "reduce bans by nearly 40 percent for well-intentioned creators" [S56]. Dates are "coming"; not live as of this research.

### I. Policy: advertising, brand deals, real-money rules
- Advertising policy (announced 2026-03-20, tools 2026-04-15, in force 2026-05-04): paid brand integrations, or promotion of off-platform products, count as ads and must be registered in Ads Manager before launch, with assets moderated and standardised ad labels applied; non-compliance can mean content removal, suspension or feature limits. Under-13s: no rewarded ad formats; no food, cosmetics, pharma or financial services targeting. Roblox revenue share via CPTV pricing (per 1,000 visits in the first 28 days: 1.50 USD US, 0.75 Tier 1, 0.20 Tier 2, 0.05 floor, then 0.10 nominal; 12-month campaign) begins 2027-01, quarterly invoices with 90-day terms [S27]. Independent rewarded-video implementations had to migrate to Roblox formats by 2026-05-04 [S27].
- Community Standards (about.roblox.com page, no date shown): gambling is banned (only unplayable gambling content is allowed; no real money, Robux or items staked); fraud includes third-party Robux trading, account sales and group payout misuse; paid random items need accurate numeric odds; charity donation solicitation is banned, and tip jars are allowed if the user gets nothing; off-platform links are banned except via Social Links (16+); independent Robux contests and sweepstakes are banned; commerce to authorised Shopify stores allowed for eligible developers; IP takedown requests honoured; political content, professional advice claims and evasion of filters are restricted [S54].
- Terms of Use: Robux are usable only for Roblox services; creators keep ownership of content subject to a licence to Roblox [snippet, official ToU page returned 403 so not read in full] [S72]. A third-party summary says Terms and Privacy updated 2026-04-30 [S67].

### J. Paid random items (loot boxes, egg hatches, wheels)
- Applies to items bought with Robux, or with currency bought with Robux, that give a random result. Four types: capsules (wheels, eggs, chests), enhancements (random outcome potions or upgrades), combinations, and probability modifiers (luck boosts, pity systems) [S39].
- Rules: show the numeric percentage of every outcome before purchase, including indirect purchases (keys, tickets); percentages must sum to 100; update live when a modifier is active; use a clickable "Details" or "Info" pop-up if the list is long (a bare (i) icon is not enough); every outcome must give some benefit (no pure losses); declare it in the questionnaire [S38][S39].
- Region and age gating: `PolicyService:GetPolicyInfoForPlayerAsync` returns `ArePaidRandomItemsRestricted` and `IsPaidItemTradingAllowed`. Restricted users need an alternative (free path, deterministic purchase, removal). Affected regions listed 2026-05-26: Australia, Belgium, Netherlands, United Kingdom, Brazil [S38][S39][S57]. UK under-18 restriction has been live since 2024-08-13 [S40]. Roblox globalised odds disclosure after South Korea's rules (press, 2026-06-26) [S41].
- Enforcement: moderation messages, then appeal after fixing; no hard deadline was published [S39]. Promoted passes cannot grant paid random items [S11].

### K. Moderation, audio and IP
- Moderation moved to continuous multimodal review (2026-03-26): repeated violations in one server shut that server down (gameplay blurred, rejoin option) instead of taking down the experience; only 0.006 percent of daily server instances violate; first targets are discrimination and romance/sex; a Creator Analytics chart shows daily server shutdowns [S55].
- Audio: files mp3/ogg/wav/flac, under 20 MB, under 7 minutes, up to 48 kHz; uploads start private and pass moderation; per-30-day limits are 2,000 for ID-verified and 100 for unverified (the doc; a search snippet quoted 100 and 10 per month for an older state, so treat the number as drifting) [S58]. You must hold the rights; Audible Magic fingerprinting and a DMCA operations team exist [S61]. The Roblox Sound Library and Creator Store audio (over 100,000 tracks) are free to use inside experiences, with no cap on how many tracks and player-chosen playlists allowed [S58][S59]. An experience may not be solely a music player or streaming service built from licensed music; an in-game boombox is fine (staff, 2024-12) [S60]. Creator Store music is licensed for use on Roblox only; content on YouTube/TikTok falls under those platforms' copyright rules (2024-09, update 2025-02) [S61]. Audio privacy-by-default dates from 2022 [snippet, possibly stale].
- IP: only the rights holder or agent can file takedowns; crediting the original owner is not permission; repeat infringers lose accounts and payouts (staff post 2023-08-25, possibly stale in detail but consistent with the Community Standards) [S62][S54]. Rights Manager launched 2024-03 (from a search summary; official page not fetched) [snippet]. Developers in 2025-2026 reported false DMCA takedowns and called for verification (community, not official) [snippet].

## How to apply it (rules for an AI builder)

### Revenue and product design
- DO plan with the 70 percent rule: a 100 Robux product yields 70 Robux (about 0.27 USD at 0.0038, 0.38 USD at 0.0054 for eligible US 18+ spend). Show builders that revenue math in design docs.
- DO create at least one cheap impulse item and one flagship item: third-party guidance suggests tiers of about 25-75 (reflex), 100-250 (considered) and 400-1,000+ Robux (commitment) [S65]. This is third-party opinion; confirm with Price Optimization data when the game qualifies (60,000 transactions per 30 days).
- DO read prices at runtime with `MarketplaceService:GetProductInfo(id, Enum.InfoType.GamePass)` or `Enum.InfoType.Product`; never hard-code Robux numbers in UI labels (Managed Pricing, regional prices and tests change them) [S32][S34].
- DO keep promoted passes within 50-800 Robux if you want them eligible for promotion surfaces [S11].
- DO NOT sell passes or products to players of another of your own experiences (disabled since 2026-05-29); use the Transfers API tip flow only if donations are central, and treat it as Plus-only with low caps [S35][S37].
- DO NOT reward rewarded-video views with Robux or random items; use a normal developer product worth about 3-10 Robux, shown at a natural break (death screen, level end, between rounds), and never gate core progression behind an ad [S22][S24].
- DO include a "Roblox Plus" nudge only through the official prompt (`PromptRobloxSubscriptionPurchase`), and use the 250 Robux sign-up bonus as a reason to show it once per session at a calm moment (never as a popup loop) [S14][S16].
- DO offer a private server price (try 100-500 Robux; value is unverified, creators set their own), because Plus members get one free instance per game from 2026-09-24 and can buy more at your price [S17][S19].
- DO design for Creator Rewards by making the first 10 minutes of a session sticky, because the 5 Robux/day reward only counts when your game is among the first three a spender plays for 10+ minutes [S5].
- DON'T design core loops that need chat or social hangouts for under-16 players unless you accept player fragmentation by age band [S53].

### Policy and compliance
- DO complete the Maturity & Compliance Questionnaire before publishing and re-run it after any content change; unrated or wrongly rated experiences can be restricted, and wrong answers can lead to label removal or account action [S42].
- DO target Minimal or Mild if the goal is the largest audience, including Roblox Kids and Select; Moderate reaches Select and 16+; Restricted is 18+ only [S42][S46].
- DO NOT include playable gambling, real-money or Robux-staked games of chance, drugs, alcohol (needs Restricted), romance (Restricted), realistic gore, or off-platform links in chat, UI or descriptions [S42][S54].
- DO NOT sell random outcomes without a percentage table that sums to 100 and is visible before purchase; DO gate with `ArePaidRandomItemsRestricted` and `IsPaidItemTradingAllowed` [S38][S39][S57].
- DO NOT use uploaded copyrighted music or brand IP; use Roblox Sound Library or Creator Store audio [S58][S59][S62].
- DO NOT run paid brand deals without registering in Ads Manager and applying ad labels (since 2026-05-04) [S27].
- DO NOT build the whole experience as a music player or a donation app; both break stated rules [S60][S54][S35].
- DO assume new games default to a 16+/Trusted Friends audience until the publishing requirements (Plus for 2 months or a refundable fee, evaluation) are met [S50][S49]. This alters launch plans: the AI builder should tell the owner to enable Plus, 2FA and ID verification early.

## Recipes (each becomes a skill)

### Recipe 1: Game pass with server-validated perks
When to use: permanent perks (VIP, 2x coins, extra slots).
Steps:
1. Creator Hub > experience > Monetization > Passes: create the pass, upload an icon at most 512x512, set price (start 99-299 Robux for a first perk; unverified heuristic).
2. In Studio create ServerScriptService/Monetization (Script) and ReplicatedStorage/MonetizationConfig (ModuleScript) holding pass IDs.
3. On `Players.PlayerAdded`, check ownership with `UserOwnsGamePassAsync` inside `pcall`, cache the result in a table keyed by UserId, and apply the perk on the server.
4. Client UI calls `PromptGamePassPurchase`; on `MarketplaceService.PromptGamePassPurchaseFinished` (player, passId, wasPurchased) apply the perk if `wasPurchased`, then re-verify with `UserOwnsGamePassAsync`.
5. Show the price from `GetProductInfo(passId, Enum.InfoType.GamePass).PriceInRobux`, never a typed number.
Pitfalls: perks must be granted manually; never trust a client claim of ownership; cross-experience pass sales are disabled.

### Recipe 2: Developer product with idempotent receipt handling
When to use: coins, boosts, revives, gifts.
Steps:
1. Create the product in Creator Hub and note its ID.
2. In a server Script set `MarketplaceService.ProcessReceipt` once (only one handler per server).
3. Look up the player by `receiptInfo.PlayerId`; if absent, return `Enum.ProductPurchaseDecision.NotProcessedYet`.
4. Check a DataStore of processed `PurchaseId` values; if present return `PurchaseGranted`.
5. Grant the item inside `pcall`; on failure return `NotProcessedYet`; on success record the `PurchaseId` and return `PurchaseGranted`.
6. Prompt from the client with `PromptProductPurchase(player, productId)`.
Pitfalls: `ProcessReceipt` can fire more than once per purchase; do not use `PromptProductPurchaseFinished` as proof of payment; save the grant with the player data in the same transaction when possible (see topic 04).

### Recipe 3: Monthly VIP subscription
When to use: recurring perk (daily bonus, exclusive area).
Steps:
1. Creator Hub > Subscriptions: create a Robux subscription (minimum 49 Robux; custom amounts allowed) or a local-currency tier (2.99-14.99 USD, needs ID or phone verification).
2. Server: `GetUserSubscriptionStatusAsync(player, subscriptionId)` in `pcall`; grant when `IsSubscribed`, revoke when not.
3. Connect `Players.UserSubscriptionStatusChanged` to re-check.
4. Client: `PromptSubscriptionPurchase(player, subscriptionId)`.
5. Keep benefits identical across devices and for the full term.
Pitfalls: no refunds for Robux subscriptions; local-currency revenue is held 30 days; mutually exclusive tiers are not supported; max 50 per experience [S13].

### Recipe 4: Rewarded video placement
When to use: free-to-play players who rarely spend, at natural pauses.
Steps:
1. Confirm eligibility: public, unrestricted, 2,000+ unique monthly visitors, creator 13+, ID and 2FA, questionnaire done, no free-form creation or AI interaction.
2. Create a developer product (the reward), worth 3-10 Robux.
3. Server: `AdService:CreateAdRewardFromDevProductId(productId)` then `AdService:ShowRewardedVideoAdAsync(player, reward, placementId)`; pass a `placementId` to get per-placement reports.
4. Use `GetAdAvailabilityNowAsync` before showing the button (hide the button when no ad is available); only show to ads-allowed players.
5. Start with one placement (death screen or "double reward" after a round), then A/B test with the Creator Experimentation platform.
Pitfalls: Robux or random rewards are banned; keep to 1-2 clicks; rewards must be delivered immediately; the reward needs the ProcessReceipt handler [S22][S24][S28].

### Recipe 5: Egg/crate shop that passes the paid-random-items rules
When to use: any gacha, wheel or hatch with Robux involved.
Steps:
1. Table of outcomes with weights; compute display percentages from weights (sum to 100; round to four decimals with a short note if needed).
2. UI: show the odds before the buy button, with a "Details" button if the list is long; if a Luck boost is active, show the recomputed odds.
3. On player join call `PolicyService:GetPolicyInfoForPlayerAsync(player)` (server, in `pcall`); if `ArePaidRandomItemsRestricted` is true replace the buy button with a free path, a fixed-price purchase, or hide it.
4. If `IsPaidItemTradingAllowed` is false, block trading of purchased items.
5. Set "Paid random items" (and "Paid item trading" if present) in the questionnaire.
6. Make every outcome grant something.
Pitfalls: indirect currency counts; "Info" icon alone is insufficient; no deadline does not mean no enforcement [S38][S39].

### Recipe 6: Regional-price-safe shop
When to use: any shop with gifting or trading.
Steps:
1. Read all labels from `GetProductInfo`/`GetDeveloperProductsAsync`.
2. At join, call `GetUsersPriceLevelsAsync({player.UserId})`; do not cache between sessions.
3. For gifting, allow only from a higher price level to a lower or equal level; for trading, require equal levels.
4. Opt items into Managed Pricing in Creator Hub; run the dynamic price check tool to find hard-coded prices.
Pitfalls: prices vary from 30 to 100 percent of default; if economic location is unknown users see the default price [S34][S30].

### Recipe 7: Roblox Plus upsell and perks
When to use: games where Plus members are a likely audience (private servers, social).
Steps:
1. Check `player.HasRobloxSubscription` (per the Plus docs summary) server side for a small perk (cosmetic badge or extra slot); do not gate gameplay.
2. Show a single optional "Get Roblox Plus" button that calls `MarketplaceService:PromptRobloxSubscriptionPurchase(player)` from a client-initiated action.
3. Offer a private server product so Plus time in your servers can earn the 100 Robux share.
Pitfalls: do not spam the prompt; the 250 Robux per month bonus applies only to newly acquired subscribers [S14][S16].

### Recipe 8: Private server product
When to use: social, roleplay, sandbox games.
Steps:
1. Experience public; Creator Dashboard > Audience > Access Settings > allow private servers.
2. Set a Robux price (or leave free) and let regional pricing apply.
3. Remember it cannot coexist with paid access, and price changes are allowed every 60 days with 30 days' notice for increases.
4. Make a private server worth buying: persistent builds, custom rules, admin commands for the owner.
Pitfalls: from 2026-09-24 Plus members get one free server per game, so the paid value must be about extra servers and owner tools [S17][S19][S20].

### Recipe 9: Maturity-safe publishing preflight
When to use: before every publish or large update.
Steps:
1. Scan features against the questionnaire list (violence, blood, fear, crude humour, gambling, language, romance, alcohol, hangout, free-form creation, sensitive issues, random items, trading, media, AI).
2. Aim for Minimal or Mild: unrealistic blood only, no chat-first social space, no drawing boards, no sensitive-topic theming.
3. Complete the questionnaire in Creator Dashboard > Configure.
4. Verify creator account: ID/age check, 2FA, Plus (or fee) if you want all-ages reach.
5. Check thumbnail/title/description match the label.
6. Re-run questionnaire after content changes; appeal wrong decisions at roblox.com/report-appeals.
Pitfalls: Restricted labels cannot be changed afterwards; under-18s cannot play them [S42][S44].

### Recipe 10: Immersive billboard
When to use: passive income in lobbies.
Steps:
1. Check eligibility (same as rewarded video).
2. Place a Part 8-32 studs wide and 4.5-18 studs tall, unobstructed, facing the player route, and add an `AdGui` object.
3. For portals use the BasePortal package from the Creator Store; only scale, position and rotation changes are allowed.
4. Hide ad units for players where `GetPolicyInfoForPlayerAsync` says `AreAdsAllowed` is false.
5. Payouts arrive on the 25th of the following month.
Pitfalls: no obstructions; do not manipulate impressions (fraud systems can deduct Robux or suspend) [S26].

### Recipe 11: Tip jar via Transfers API
When to use: donation-style games that lost cross-game sales.
Steps:
1. Server calls `PromptRobuxTransferAsync(sender, receiverUserId, amount)` after a client request (amounts 10-500 per transaction per docs).
2. Handle receipts with the transfer receipt handler (types `RobuxTransferSender` and `RobuxTransferReceiver`), returning `Processed` or `NotProcessedYet`.
3. Tell the sender about the Plus requirement and caps (5,000/day and 10,000/month with 2SV).
Pitfalls: creator share is only 10 percent; under-18s need parent approval; receipts keys are from a docs summary, verify enum names [S35][S36][S37].

### Recipe 12: Safe-audio and IP checklist
When to use: every music/sfx/IP decision.
Steps:
1. Use Creator Store audio (Roblox, DistroKid, Monstercat, APM and others) or the Roblox Sound Library; avoid raw audio IDs from unknown sources.
2. Do not upload copyrighted tracks; hold rights; uploads begin private.
3. No standalone music player experience; in-game boombox is fine.
4. Do not copy brand IP, logos or characters without permission; credit does not equal licence.
5. Keep a record of asset sources in the project docs.
Pitfalls: Creator Store music is for Roblox only; posting gameplay on YouTube/TikTok falls under their copyright rules [S61][S62].

## Luau reference snippets

```lua
-- Game pass ownership (server)
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")

local VIP_PASS_ID = 0 -- replace with your pass id

local function ownsPass(player: Player, passId: number): boolean
	local ok, owns = pcall(function()
		return MarketplaceService:UserOwnsGamePassAsync(player.UserId, passId)
	end)
	return ok and owns == true
end

Players.PlayerAdded:Connect(function(player)
	if ownsPass(player, VIP_PASS_ID) then
		player:SetAttribute("IsVIP", true)
	end
end)

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, wasPurchased)
	if wasPurchased and passId == VIP_PASS_ID then
		player:SetAttribute("IsVIP", true)
	end
end)
```

```lua
-- Idempotent developer-product receipt handler (server, one script only)
local MarketplaceService = game:GetService("MarketplaceService")
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")

local receiptStore = DataStoreService:GetDataStore("ProcessedReceipts_v1")

local grants: { [number]: (Player) -> boolean } = {
	[0] = function(player) -- replace 0 with the product id
		player:SetAttribute("Coins", (player:GetAttribute("Coins") or 0) + 100)
		return true
	end,
}

MarketplaceService.ProcessReceipt = function(info)
	local player = Players:GetPlayerByUserId(info.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local key = `{info.PlayerId}_{info.PurchaseId}`
	local okRead, done = pcall(function()
		return receiptStore:GetAsync(key)
	end)
	if not okRead then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	if done then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	local grant = grants[info.ProductId]
	if not grant then
		warn("No grant function for product", info.ProductId)
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local okGrant, granted = pcall(grant, player)
	if not (okGrant and granted) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local okWrite = pcall(function()
		receiptStore:SetAsync(key, true)
	end)
	if not okWrite then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end
```

```lua
-- Subscription status (server), shape from the official docs
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")

local SUBSCRIPTION_ID = "EXP-0" -- replace with your subscription id

local function refresh(player: Player)
	local ok, status = pcall(function()
		return MarketplaceService:GetUserSubscriptionStatusAsync(player, SUBSCRIPTION_ID)
	end)
	if not ok then
		return
	end
	player:SetAttribute("IsSubscriber", status.IsSubscribed == true)
end

Players.PlayerAdded:Connect(refresh)
Players.UserSubscriptionStatusChanged:Connect(function(player, subscriptionId)
	if subscriptionId == SUBSCRIPTION_ID then
		refresh(player)
	end
end)
```

```lua
-- Client: prompt a subscription from a button
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
MarketplaceService:PromptSubscriptionPurchase(Players.LocalPlayer, "EXP-0")
```

```lua
-- Paid random items: policy gate (server)
local PolicyService = game:GetService("PolicyService")
local Players = game:GetService("Players")

local function applyPolicy(player: Player)
	local ok, policy = pcall(function()
		return PolicyService:GetPolicyInfoForPlayerAsync(player)
	end)
	if not ok then
		-- fail closed: treat as restricted
		player:SetAttribute("RandomItemsRestricted", true)
		player:SetAttribute("TradingAllowed", false)
		return
	end
	player:SetAttribute("RandomItemsRestricted", policy.ArePaidRandomItemsRestricted)
	player:SetAttribute("TradingAllowed", policy.IsPaidItemTradingAllowed)
	player:SetAttribute("AdsAllowed", policy.AreAdsAllowed)
end

Players.PlayerAdded:Connect(applyPolicy)
```

```lua
-- Regional price level (server)
local MarketplaceService = game:GetService("MarketplaceService")
local ok, levels = pcall(function()
	return MarketplaceService:GetUsersPriceLevelsAsync({ player.UserId })
end)
-- levels[1].PriceLevel is 1..1000 (1000 = full price). Do not cache across sessions.
```

```lua
-- Rewarded video (server): signatures from the AdService reference
local AdService = game:GetService("AdService")

local REWARD_PRODUCT_ID = 0 -- developer product used as reward
local PLACEMENT_ID = 1

local function showAd(player: Player)
	local reward = AdService:CreateAdRewardFromDevProductId(REWARD_PRODUCT_ID)
	local ok, result = pcall(function()
		return AdService:ShowRewardedVideoAdAsync(player, reward, PLACEMENT_ID)
	end)
	if not ok then
		warn("Rewarded ad failed", result)
		return
	end
	print("Ad result:", result)
	-- The reward is delivered as a normal developer-product receipt (ProcessReceipt).
end
```

```lua
-- Roblox Plus: prompt a sign-up (server-triggered after a client request)
local MarketplaceService = game:GetService("MarketplaceService")
MarketplaceService:PromptRobloxSubscriptionPurchase(player)
```

## Open questions / unverified
- Exact current publishing-eval threshold for all-ages reach: docs (updated 2026-10-02) say 250 engaged plays in 60 days; staff reply 2026-08 said 500; RDC26 says 100 from November 2026 [S49][S51][S56]. Check the live Creator Hub page.
- Whether the publishing fee is 1,000 Robux (forum 2026-05-11) with a 50,000 Robux expedite (docs) or 100,000 (2026-08 reply) [S49][S50][S51].
- Official body of the "Changes to Roblox Plus Private Server Limits" post was not opened; details come from a search snippet and RobloNews [S17][S18].
- Rewarded video revenue share and eCPM values are not published; creator anecdotes only.
- The full Terms of Use, Developer Exchange Terms, Restricted Content Policy and help-center Community Standards pages returned 403; their text was not read directly. Current Community Standards content came from about.roblox.com.
- The Creator Store payout share conflicts: Roblox overview pages say "100 percent of net proceeds" while a search summary said 70 percent [S9][S10][S71].
- Paid-access dedicated docs (limits, fee) not retrievable.
- `Enum.AdFormat` item names, `ShowAdResult` values beyond `AdNotReady`, `BindReceiptHandler` usage and `Player.HasRobloxSubscription` come from reference/doc summaries; verify in Studio autocomplete before use.
- Exact name and signature of the Age Check API for creators.
- Roblox Wallet, Roblox Card, pre-roll ads, the simplified questionnaire and the 100-player threshold are announced future features (RDC26, 2026-09-11) with no confirmed live dates.
- Lensblox algorithm-change claims (28-day window, stock move) are third-party; the Q2 2026 shareholder letter was not retrieved.
- Premium Payouts historical rates (pre-2025) were not collected; Creator Rewards replaced them.
- Pricing psychology: no official Roblox study on ideal price points; the 25-75 / 100-250 / 400-1,000+ ladder is a third-party heuristic [S65].
- Audio upload limits differ between the doc (100 / 2,000 per 30 days) and a search snippet (10 / 100 per month) [S58].

## Sources
Trust order: official Roblox first; third-party and snippet-only sources are labelled.
[S1] Increasing DevEx - Creators Will Now Earn 8.5% More, Roblox (runlola_run24), 2025-09-05, https://devforum.roblox.com/t/increasing-devex-%E2%80%94-creators-will-now-earn-85-more/3920159
[S2] Roblox Developer Exchange Program (docs), Roblox, current 2026, https://create.roblox.com/docs/en-us/production/monetization/developer-exchange.md
[S3] Introducing the US 18+ DevEx Rate, Roblox (peraldon), 2026-04-30, https://devforum.roblox.com/t/introducing-the-us-18-devex-rate-earn-42-more-on-spend-from-18-us-players/4607091
[S4] Roblox Q1 2026 shareholder letter, Roblox (SEC 8-K Ex. 99.1), 2026, https://www.sec.gov/Archives/edgar/data/0001315098/000162828026028882/ex991-q12026earningsshar.htm
[S5] Creator Rewards (docs), Roblox, 2025-2026, https://create.roblox.com/docs/creator-rewards.md
[S6] Introducing Creator Rewards, Roblox, 2025-06-24, https://devforum.roblox.com/t/introducing-creator-rewards-earn-more-by-growing-the-community/3777628
[S7] Creator Rewards is Live, Roblox (runlola_run24), 2025-07-24, https://devforum.roblox.com/t/creator-rewards-is-live/3838257
[S8] Shorten the hold period of engagement payouts (community thread, includes Roblox's 60-day quote), 2025, https://devforum.roblox.com/t/shorten-the-hold-period-of-engagement-payouts-or-restore-the-old-premium-payouts-system/3956591
[S9] Monetization overview (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/get-started/monetization.md
[S10] Turn your creativity into income on Roblox (docs overview with platform stats), Roblox, 2026, https://create.roblox.com/docs/monetize
[S11] Passes (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/monetization/passes.md
[S12] Developer products (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/monetization/developer-products.md
[S13] Subscriptions (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/monetization/subscriptions.md
[S14] Introducing Roblox Plus, Roblox (guacandtoast), 2026-04-10, https://devforum.roblox.com/t/introducing-roblox-plus/4567894
[S15] Introducing Roblox Plus, Roblox newsroom, 2026-04, https://about.roblox.com/newsroom/2026/04/introducing-roblox-plus-subscription
[S16] Roblox Plus (docs), Roblox, 2026, https://create.roblox.com/docs/production/monetization/roblox-plus.md
[S17] Changes to Roblox Plus Private Server Limits, Roblox, 2026 (search-result snippet only; body not read), https://devforum.roblox.com/t/changes-to-roblox-plus-private-server-limits/4739922
[S18] Roblox Plus Limits Free Private Servers to One Per Game, RobloNews (third-party), 2026, https://roblonews.com/news/roblox-plus-one-free-private-server-limit.html
[S19] Private servers (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/monetization/private-servers.md
[S20] Upcoming updates to Private Servers, Roblox (dinobotsnarl824), 2026-04-22, https://devforum.roblox.com/t/upcoming-updates-to-private-servers-new-tools-and-new-earning-opportunities/4590482
[S21] More Creators Can Now Use Rewarded Video Ads, Roblox, 2025-07-24 (updated 2025-08-26), https://devforum.roblox.com/t/more-creators-can-now-use-rewarded-video-ads/3838678
[S22] Rewarded Video ads available to all ads eligible creators, Roblox, 2025-11-11 (update 2026-02-18), https://devforum.roblox.com/t/rewarded-video-ads-are-now-available-to-all-ads-eligible-creators/4063278
[S23] Boost your game earnings with Rewarded Video enhancements, Roblox (superburr0), 2026-05-20, https://devforum.roblox.com/t/boost-your-game-earnings-with-rewarded-video-enhancements/4645335
[S24] Rewarded video ads (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/promotion/rewarded-video-ads.md
[S25] Ads for Creators: RDC Recap and What's Next, Roblox (superburr0), 2025-09-10, https://devforum.roblox.com/t/ads-for-creators-rdc-recap-and-what%E2%80%99s-next/3929106
[S26] Immersive ads (docs), Roblox, 2026, https://create.roblox.com/docs/production/monetization/immersive-ads
[S27] New Advertising Policies and Standards, Roblox (superburr0), 2026-03-20 (updated 2026-06), https://devforum.roblox.com/t/new-advertising-policies-standards/4527365
[S28] AdService (API reference), Roblox, 2026, https://create.roblox.com/docs/en-us/reference/engine/classes/AdService.md
[S29] MarketplaceService (API reference), Roblox, 2026, https://create.roblox.com/docs/en-us/reference/engine/classes/MarketplaceService.md
[S30] Managed pricing (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/monetization/managed-pricing.md
[S31] Managed Pricing: One System for Better Pricing and Earnings Growth, Roblox (pearvessel), 2026-06-15, https://devforum.roblox.com/t/managed-pricing-one-system-for-better-pricing-and-earnings-growth/4684738
[S32] Price optimization (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/monetization/price-optimization.md
[S33] Price Optimization Now Includes Item-Level Price Recommendations, Roblox (runlola_run24), 2025-08-22, https://devforum.roblox.com/t/price-optimization-now-includes-item-level-price-recommendations/3894427
[S34] Regional pricing (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/monetization/regional-pricing.md
[S35] Disabling Cross-Game Sales of Passes and Dev Products and Introducing the Transfers API, Roblox (dinobotsnarl824), 2026-05-04, https://devforum.roblox.com/t/disabling-cross-game-sales-of-passes-and-dev-products-and-introducing-the-transfers-api/4618396
[S36] Update on Roblox Plus, Transfers, and Community Gifting, Roblox (Chief Business Officer), 2026-05-15 (update 2026-06-02), https://devforum.roblox.com/t/update-on-roblox-plus-transfers-and-community-gifting/4637912
[S37] Robux transfers (docs, updated 2026-10-02), Roblox, https://create.roblox.com/docs/production/monetization/robux-transfers.md
[S38] Paid random items policy guidelines (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/production/monetization/paid-random-items.md
[S39] Clarifying Requirements for Paid Random Items, Roblox (dinobotsnarl824), 2026-05-26, https://devforum.roblox.com/t/clarifying-requirements-for-paid-random-items/4654622
[S40] Update on Paid Random Items Restriction for UK Users Under 18, Roblox, 2024-07-16 (effective 2024-08-13), https://devforum.roblox.com/t/update-on-paid-random-items-restriction-for-uk-users-under-18/3072183
[S41] Korea's Loot-Box Rules Push Roblox to Disclose Item Odds Worldwide, Tech Times (press), 2026-06-26, https://www.techtimes.com/articles/319148/20260626/koreas-loot-box-rules-push-roblox-disclose-item-odds-worldwide.htm
[S42] Content maturity and compliance (docs), Roblox creator-docs, 2026, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/promotion/content-maturity.md and https://create.roblox.com/docs/production/promotion/content-maturity.md
[S43] Experience guidelines (docs; older All Ages/9+/13+/17+ wording, may be stale), Roblox, https://create.roblox.com/docs/production/promotion/experience-guidelines.md
[S44] Updating Age Requirements for Experiences with Restricted Content Maturity Label, Roblox (RbxRocketMan), 2025-08-28 (update 2025-11-06), https://devforum.roblox.com/t/updating-age-requirements-for-experiences-with-%E2%80%98restricted%E2%80%99-content-maturity-label/3905863
[S45] Updating Experience Guideline Policies to Keep Our Younger Users Safe, Roblox, 2024-11-06 (possibly stale), https://devforum.roblox.com/t/updating-experience-guideline-policies-to-keep-our-younger-users-safe/3249079
[S46] Roblox Introduces New Age-Based Accounts and Expanded Parental Controls for Users Under 16, Roblox newsroom, 2026-04, https://about.roblox.com/newsroom/2026/04/introducing-roblox-kids-and-select-accounts
[S47] Roblox Kids and Roblox Select Accounts Now Available Worldwide, Roblox IR, 2026-06-16, https://ir.roblox.com/news/news-details/2026/Roblox-Kids-and-Roblox-Select-Accounts-Now-Available-Worldwide/default.aspx
[S48] Roblox introduces Kids and Select accounts, TechCrunch (press), 2026-04-13, https://techcrunch.com/2026/04/13/roblox-introduces-kids-and-select-accounts-for-age-appropriate-access-to-games-and-chat/
[S49] Kids and Select publishing requirements (docs, updated 2026-10-02), Roblox creator-docs, https://create.roblox.com/docs/en-us/production/publishing/kids-and-select.md
[S50] New Publishing Requirements and Evaluation Process for Games, Roblox (skywise84), 2026-04-13 (update 2026-05-11), https://devforum.roblox.com/t/new-publishing-requirements-evaluation-process-for-games/4573166
[S51] How to remove the 16+ age restriction on games I make (Platform Usage Support thread with staff reply), 2026-08-07, https://devforum.roblox.com/t/how-to-remove-the-16-age-restriction-on-games-i-make/4779922
[S52] Experience incorrectly restricted to 16+ ... (bug thread with staff reply), 2026-06/07, https://devforum.roblox.com/t/experience-incorrectly-restricted-to-16-despite-no-content-maturity-label-changes-and-active-plus-fee-exemption/4685973
[S53] Age Check Requirement to Chat Now Live Globally, Roblox (RbxRocketMan), 2026-01-07, https://devforum.roblox.com/t/age-check-requirement-to-chat-now-live-globally/4226101
[S54] Roblox Community Standards, Roblox, current (no date shown), https://about.roblox.com/community-standards
[S55] New transparency into proactive safety protections in Creator Analytics, Roblox (RbxRocketMan), 2026-03-26, https://devforum.roblox.com/t/new-transparency-into-proactive-safety-protections-in-creator-analytics/4538721
[S56] RDC26: What We Announced, Roblox (skywise84), 2026-09-11, https://devforum.roblox.com/t/rdc26-what-we-announced/4865880
[S57] PolicyService (API reference), Roblox, 2026, https://create.roblox.com/docs/en-us/reference/engine/classes/PolicyService.md
[S58] Audio assets (docs), Roblox, 2026, https://create.roblox.com/docs/en-us/audio/assets.md
[S59] Question about allowed use of audio from the Roblox Sound Library in an experience (staff reply), 2025-2026, https://devforum.roblox.com/t/question-about-allowed-use-of-audio-from-the-roblox-sound-library-in-an-experience/4266598
[S60] Music on Roblox TOS Rule (staff clarification), 2024-12-14, https://devforum.roblox.com/t/music-on-roblox-tos-rule/3305661
[S61] Amplify Your Experiences with New Music, Roblox Music Team (BigBroGreg), 2024-09-19 (update 2025-02-13), https://devforum.roblox.com/t/amplify-your-experiences-with-new-music/3164792
[S62] Protecting Creativity by Understanding Intellectual Property, Roblox, 2023-08-25 (possibly stale), https://devforum.roblox.com/t/protecting-creativity-by-understanding-intellectual-property/2559638
[S63] Roblox's June 2026 algorithm change, explained, lensblox.com (third-party), 2026, https://lensblox.com/blog/roblox-algorithm-change-2026-explained/
[S64] Roblox Rewarded Video Ads: Explaining Roblox Ad Monetization in 2026, GameBiz Consulting (third-party), 2026, https://www.gamebizconsulting.com/blog/roblox-ad-monetization-guide-2026
[S65] Roblox Game Pass Pricing Guide, generalistprogrammer.com (third-party, low rigor), 2026, https://generalistprogrammer.com/tutorials/roblox-game-pass-pricing-guide
[S66] Roblox Regional Pricing Guide, creation.dev (third-party; its 20-40 percent uplift is not an official figure), 2026, https://www.creation.dev/learn/roblox-regional-pricing-game-passes-guide
[S67] What Changed in Roblox's April 2026 Terms of Use and Privacy Policy Update, creation.dev (third-party), 2026, https://www.creation.dev/learn/roblox-terms-of-use-privacy-policy-april-2026-changes
[S68] DevEx cashout amount is capped by the estimated eligible amount (bug thread), 2026-06-01, https://devforum.roblox.com/t/devex-cashout-amount-is-capped-by-the-estimated-eligible-amount/4663417
[S71] Marketplace fees and commissions (docs, avatar-item scope), Roblox, 2026, https://create.roblox.com/docs/en-us/marketplace/marketplace-fees-and-commissions.md
[S72] Roblox Terms of Use, Roblox, current (read through search snippet only; page returned 403), https://en.help.roblox.com/hc/en-us/articles/115004647846-Roblox-Terms-of-Use
