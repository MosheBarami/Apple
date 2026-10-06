# Roblox rules follow-up: Creator Store licence, caching, APM music, audio privacy, AI rules (deep research, 2026-10-07)

Deep-research workflow: 100 Opus agents (5 search angles, fetch, 3-vote adversarial verification).

## Question

Follow-up for StudPilot's asset library (a Roblox Studio co-pilot that inserts assets into OTHER creators' games), with primary sources:
(1) The Roblox Creator Store licence and terms. What rights do creators get when they use a free/public Creator Store model, mesh, image or audio in their own commercial game? Is attribution required? Read the Roblox Terms of Use sections on User Content licences (the licence users grant each other) and the Creator Store / Marketplace terms.
(2) Caching: may a third-party service cache Open Cloud / Creator Store search results, thumbnails and metadata, and for how long? What must happen if API access is lost? Check the Open Cloud terms and the Roblox API/Developer terms.
(3) Roblox-licensed music (APM Music / Roblox licensed audio): what it is, how creators use it, any limit on tracks per experience (one claim says 250), and whether a tool may recommend and insert those audio IDs into a user's game.
(4) Audio privacy since the 2022 change and 2025-2026: can public Roblox-uploaded sound effects be used in any experience? Which audio is usable by anyone?
(5) Roblox rules on AI: the Terms of Use, the Creator Terms and any 2025-2026 policy on using Roblox content (assets, data, API results) to train AI models; rules on AI-generated assets; and the Roblox Third-Party App Terms that apply to apps using Open Cloud OAuth.
Give exact quotes with URLs and dates.

## Summary

Creator Store pages and the Third-Party App docs do not themselves give the user-to-user licence or an attribution rule. That text sits in the Roblox Terms of Use, which no verifier could open (help.roblox.com returned 403), so the licence and attribution questions (1) are still unanswered from primary text. On caching (2), the Creator Third-Party App Policy sets no cache duration, but it requires you to expunge all data obtained through Roblox APIs if API access is lost for any reason, and it bars selling that data. On AI (5), the same policy bans using user data to train AI or language models, and the current Terms of Use (per one verifier) bar using Virtual Content to train machine-learning models. Free Creator Store assets are shared into Roblox's own AI training with no opt-out. On music (3), Roblox's APM licence is royalty free on-platform, with a 250 distinct track cap per experience at any one time, no music library or streaming feature, and no charging for specific tracks. On audio privacy (4), uploads have been private by default since 22 March 2022 and an arbitrary audio ID cannot be assumed usable, but whether Roblox's licensed catalogue is usable by anyone was contested in verification (0-3 on the claim) and needs a recheck.

## Verified findings

### The Creator Store docs give no licence grant or attribution rule for using a free asset in another creator's commercial game. They only say publishers must follow the Community Rules, Terms of Use and IP guidelines, so the user-to-user licence and any attribution duty must be read in the Terms of Use, which was not read here.

- **Confidence:** high (vote 3-0 and 3-0)
- **Evidence:** Both pages were checked in raw HTML (2026-10-07): they say creators can "Distribute and make freely available" assets and that sold or distributed assets "must adhere to the Community Rules, Terms of Use, and Intellectual Property guidelines". There is no commercial-use or attribution text. Absence on this page does not mean attribution is not required. The Terms of Use (help.roblox.com article 115004647846) returned 403 to WebFetch, so the licence clause and any attribution duty remain unread.
- **Sources:** https://create.roblox.com/docs/production/publishing/creator-store, https://create.roblox.com/docs/en-us/production/creator-store

### Apps using Open Cloud OAuth must agree to the Roblox Terms of Service at registration, and their scopes must fall under a single category of the Creator Third-Party App Policy. The registration page links the policy but does not reproduce it.

- **Confidence:** medium (vote 2-1)
- **Evidence:** Registration step: "Read and agree to the Roblox Terms of Service". The page ties scopes to a category in the Creator Third-Party App Policy. The verifier noted the page does not literally say the app must comply with the whole policy, so the claim reads slightly broad.
- **Sources:** https://create.roblox.com/docs/cloud/auth/oauth2-registration, https://en.help.roblox.com/hc/en-us/articles/37924211313044-Creator-Third-Party-App-Policy

### Caching: no source found sets a permitted cache duration for Open Cloud or Creator Store search results, thumbnails or metadata. The binding rule is the Third-Party App Policy: data obtained through Roblox APIs must be expunged if API access is lost for any reason, and it may not be sold. Creator Store metadata probably counts as data obtained through Roblox APIs, which is an inference, not stated text.

- **Confidence:** high (vote 3-0 (expunge clause); 2-1 (Terms contain no caching clause))
- **Evidence:** Policy (created 2025-05-28, updated 2026-09-29), Data use policy: "You must expunge all data obtained through Roblox APIs if your app or platform has lost access to our APIs for any reason" and "You may not sell any data obtained through Roblox APIs". The Third-Party App Terms (updated 2026-09-29) contain no occurrence of cache, retention, Open Cloud or Creator Store. They say Roblox may "at any time and without notice" remove, block or suspend an App, and they bar using the App to "gain insights into Roblox's usage, revenue" or other business aspects.
- **Sources:** https://en.help.roblox.com/hc/en-us/articles/37924211313044-Creator-Third-Party-App-Policy, https://en.help.roblox.com/hc/en-us/articles/15887203369620-Creator-Third-Party-App-Terms

### AI rules for third-party apps: the Creator Third-Party App Policy bans using any user data to train AI or language models. Whether Creator Store asset metadata or thumbnails count as user data is undefined, so StudPilot should avoid training on any API-sourced data. The separate Third-Party App Terms are silent on AI, and AI limits sit in the Terms of Use.

- **Confidence:** high (vote 3-0 (policy ban); 2-1 (Terms silent on AI))
- **Evidence:** Policy: "You may not utilize any user data for the training of AI or language learning models". The neighbouring bullets use the broader phrase "data obtained through Roblox APIs", which makes the scope ambiguous. The Third-Party App Terms have no mention of AI, machine learning, training or AI-generated assets. One verifier, reading the Terms of Use (updated 2026-10-01) via the Zendesk API, quoted a user restriction on accessing the Services "for the purpose of using Virtual Content in connection with the training, development, or use of machine learning models or artificial intelligence", plus a Roblox reservation of text and data mining rights. That quote has a single verifier and was not read directly in the Terms of Use by the others.
- **Sources:** https://en.help.roblox.com/hc/en-us/articles/37924211313044-Creator-Third-Party-App-Policy, https://en.help.roblox.com/hc/en-us/articles/15887203369620-Creator-Third-Party-App-Terms

### Roblox's own AI training: free Creator Store assets are shared with Roblox for AI enhancement by default and creators cannot opt out. Roblox says the data is used only for AI enhancement and not shared with third parties.

- **Confidence:** high (vote 3-0 and 3-0)
- **Evidence:** "free Creator Store assets are shared by default, with no ability to disable sharing" and "All data shared with Roblox is for AI-enhancement purposes only and is not shared with third parties" (page last updated 2026-10-06). Other content (experiences, avatar items, paid Creator Store assets) is a creator choice, off by default for items published before 10 July 2024 and on from that date. This is Roblox's self-description and concerns Roblox's training, not rules for third parties.
- **Sources:** https://create.roblox.com/docs/ai-data-sharing

### Roblox-licensed (APM) music: under the 2018 APM deal, Roblox handles synchronization, master use, mechanical and performance licences, so tracks are royalty free on the Roblox platform. The catalogue of more than 100,000 sound effects and music tracks from partners is free to use in experiences. These are platform-only and may not be downloaded.

- **Confidence:** high (vote 3-0 and 3-0)
- **Evidence:** Roblox post of 30 May 2018: "all of this Licensed Music is royalty free for use on the Roblox platform!", with Roblox covering the four licence types. The docs say the Creator Store has "more than 100,000 professionally-produced sound effects and music tracks from top audio and music partners". The 2018 post is old, but a 2024-2025 Terms quote shows the arrangement still stands. Neither source states a rule on attribution.
- **Sources:** https://devforum.roblox.com/t/upcoming-music-changes-and-copyright-related-action/130570, https://create.roblox.com/docs/audio/assets

### Licensed Music limits: at most 250 distinct tracks of Licensed Music at any one time in a single Experience or other UGC. Tracks may be replaced at any time within the cap, the limit includes boom-box tracks, music libraries or streaming services inside an experience are barred, and users may not be charged to hear a specific track. A tool that inserts licensed audio IDs must count tracks per place and must not build a music library.

- **Confidence:** high (vote 3-0 (cap), 3-0 (streaming and charging bans))
- **Evidence:** Terms of Use (updated 2026-10-01), 250 Track Limit clause: "up to 250 distinct tracks of Licensed Music at any one time in a single Experience or other UGC". Also: "may not use Licensed Music to create a streaming service or music library within an Experience or other UGC, nor may Creator charge Users to listen to a specific track". The Help article Licensed Music Availability (updated 2026-10-05) says up to 250 licensed tracks at a time in a single game, including boom boxes. The 2018 post gave the same figure, so it has not been lifted. Verifiers read the Terms via the Zendesk API or the forum quote, since the Help URL returns 403.
- **Sources:** https://devforum.roblox.com/t/music-on-roblox-tos-rule/3305661, https://devforum.roblox.com/t/upcoming-music-changes-and-copyright-related-action/130570, https://en.help.roblox.com/hc/articles/360000927163, https://en.help.roblox.com/hc/en-us/articles/115004647846-Roblox-Terms-of-Use

### Scope of the 250 cap is unsettled: a forum reply says it applies only to APM tracks and that other tracks have no Roblox count cap unless their licensor sets one. The Terms wording says "Licensed Music" generally. Verification split on both readings, so do not state either unqualified.

- **Confidence:** medium (vote 2-1 (APM only); related claims refuted 1-2)
- **Evidence:** The forum reply (echoreaper, not confirmed as staff) said "This only applies to APM tracks. You can have 250 APM tracks + an infinite amount of other tracks", but the claim that non-APM tracks have no Roblox limit was refuted 1-2. The claim that the cap covers all licensed providers was also refuted 1-2. Both readings are therefore unproven.
- **Sources:** https://devforum.roblox.com/t/music-on-roblox-tos-rule/3305661/11, https://devforum.roblox.com/t/a-way-to-check-if-a-sound-is-licensed/132455

### Audio privacy since 2022: on 22 March 2022 all new audio uploads became Private and existing audio longer than 6 seconds was set to Private. Newly imported audio is usable only by its uploader unless they grant specific friends or experiences, so a tool cannot assume an arbitrary audio ID plays in a user's game. Per the same announcement, audio under 6 seconds and audio from Roblox or its licensed partners stayed public, but verification refuted two claims about what that means for tools.

- **Confidence:** medium (vote 3-0 (2022 change); 3-0 (private audio IDs); related catalogue-public claims refuted)
- **Evidence:** Announcement of 9 March 2022: "On March 22, all new audio uploaded will be Private and all existing audio longer than 6 seconds will be set to Private". Docs: "The asset privacy system automatically ensures that the IDs of your imported audio can't be accessed by users without proper permissions" and "you are initially the only one who can view and use private audio assets". The announcement is forward-looking, so the effective date rests on secondary reports. Three related claims were refuted: that the official catalogue stays public and usable by a tool without the uploader's permission (0-3), that audio plays only if the uploader is the experience creator, under 6 seconds or from Roblox or partners (0-3), and a variant restating the privacy rule (1-2). The reasons are not in the evidence provided, so which audio is usable by anyone today, including the 6-second and Roblox-catalogue exceptions, needs a recheck against current docs.
- **Sources:** https://devforum.roblox.com/t/1701697, https://create.roblox.com/docs/building-and-visuals/audio/audio-assets, https://create.roblox.com/docs/audio/assets

### One DevForum thread checked was not useful: the 'What's Playing' thread does not address track limits, inserting licensed audio IDs or audio privacy. A claim that Roblox has no API flag to detect whether a Sound is licensed was refuted (1-2), so the point stays unknown.

- **Confidence:** medium (vote 3-0 (thread irrelevant); 1-2 (no licensed-flag claim, refuted))
- **Evidence:** The raw JSON of the thread has no hits for 250, privacy, insert, toolbox or limit. A staff reply says What's Playing only surfaces audio that has shared its ISRC with Roblox. The licensed-flag claim was not confirmed either way.
- **Sources:** https://devforum.roblox.com/t/whats-playing-does-not-recognize-official-apm-music/3538669, https://devforum.roblox.com/t/a-way-to-check-if-a-sound-is-licensed/132455

## caveats

The biggest gap is that the Roblox Terms of Use user-to-user licence text and any attribution rule were never directly read: help.roblox.com returns 403 to WebFetch, and verifiers used the Zendesk JSON API (updated 2026-09/10-01) or forum quotes instead. Several findings therefore rest on secondhand quotes of the Terms (the 250 cap and the streaming ban from a Dec 2024 forum quote, the AI-training restriction from one verifier's reading). The 2018 APM and 2022 audio-privacy sources are old, though later 2024-2026 Terms text shows the arrangements still hold. The claims that the official catalogue stays public and that audio plays only for the creator, under 6 seconds or from Roblox or partners were refuted 0-3, and the evidence provided does not say why, so the audio-privacy exceptions need a recheck. The AI-training ban says 'user data', and whether asset metadata counts is undefined. Whether Creator Store search results fall under the expunge clause is inference. Policies were updated as recently as 2026-09-29 to 2026-10-06 and can change. This is research on policy text, not legal advice.

## refuted

[
 {
  "claim": "Roblox's official licensed catalog of Music and SFX (over 100,000 songs and 100,000 sound effects from partners such as APM, Monstercat, Pro Sound Effects, Nettwerk and Position) stays Public and usable in any experience. A tool can therefore use these IDs without the uploader's permission.",
  "vote": "0-3",
  "source": "https://devforum.roblox.com/t/1701697"
 },
 {
  "claim": "Audio plays in an experience only if the uploader is the experience creator, the audio is under 6 seconds, or it comes from Roblox or partner accounts. A tool cannot insert arbitrary community-uploaded audio into another creator's game.",
  "vote": "0-3",
  "source": "https://devforum.roblox.com/t/1701697"
 },
 {
  "claim": "Roblox's asset privacy system restricts private imported audio: only the owner can initially use it, and the owner can grant usage permission to specific friends and experiences. Audio is not usable by anyone by default.",
  "vote": "1-2",
  "source": "https://create.roblox.com/docs/audio/assets"
 },
 {
  "claim": "Other (non-APM) tracks can be used without a Roblox-imposed count limit, except where the individual licensor sets a similar limit of its own.",
  "vote": "1-2",
  "source": "https://devforum.roblox.com/t/music-on-roblox-tos-rule/3305661/11"
 },
 {
  "claim": "Roblox's terms (as of a November 2024 update) cap use at 250 distinct tracks of Licensed Music at any one time in a single Experience, and the cap applies to all licensed music providers, not only APM Music.",
  "vote": "1-2",
  "source": "https://devforum.roblox.com/t/a-way-to-check-if-a-sound-is-licensed/132455"
 },
 {
  "claim": "There is no native Roblox API flag to tell whether a Sound is licensed. As of the thread's last posts in Dec 2024, developers still wanted Roblox to add one.",
  "vote": "1-2",
  "source": "https://devforum.roblox.com/t/a-way-to-check-if-a-sound-is-licensed/132455"
 }
]

## unverified

[]

## sources

[
 {
  "url": "https://create.roblox.com/docs/production/publishing/creator-store",
  "quality": "primary",
  "angle": "Creator Store licence and ToU user-content licence",
  "claimCount": 4
 },
 {
  "url": "https://create.roblox.com/docs/en-us/production/creator-store",
  "quality": "primary",
  "angle": "Creator Store licence and ToU user-content licence",
  "claimCount": 4
 },
 {
  "url": "https://create.roblox.com/docs/cloud/auth/oauth2-registration",
  "quality": "primary",
  "angle": "Open Cloud terms: caching and loss of API access",
  "claimCount": 4
 },
 {
  "url": "https://en.help.roblox.com/hc/en-us/articles/360000927163-Using-Licensed-Music-on-Roblox",
  "quality": "unreliable",
  "angle": "Roblox-licensed APM Music: limits and insertion",
  "claimCount": 0
 },
 {
  "url": "https://devforum.roblox.com/t/music-on-roblox-tos-rule/3305661",
  "quality": "forum",
  "angle": "Roblox-licensed APM Music: limits and insertion",
  "claimCount": 4
 },
 {
  "url": "https://devforum.roblox.com/t/music-on-roblox-tos-rule/3305661/11",
  "quality": "forum",
  "angle": "Roblox-licensed APM Music: limits and insertion",
  "claimCount": 4
 },
 {
  "url": "https://devforum.roblox.com/t/upcoming-music-changes-and-copyright-related-action/130570",
  "quality": "primary",
  "angle": "Roblox-licensed APM Music: limits and insertion",
  "claimCount": 5
 },
 {
  "url": "https://devforum.roblox.com/t/a-way-to-check-if-a-sound-is-licensed/132455",
  "quality": "forum",
  "angle": "Roblox-licensed APM Music: limits and insertion",
  "claimCount": 4
 },
 {
  "url": "https://devforum.roblox.com/t/whats-playing-does-not-recognize-official-apm-music/3538669",
  "quality": "forum",
  "angle": "Roblox-licensed APM Music: limits and insertion",
  "claimCount": 4
 },
 {
  "url": "https://devforum.roblox.com/t/1701697",
  "quality": "primary",
  "angle": "Audio privacy since 2022 and public sound effects",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/audio/assets",
  "quality": "primary",
  "angle": "Audio privacy since 2022 and public sound effects",
  "claimCount": 4
 },
 {
  "url": "https://create.roblox.com/docs/building-and-visuals/audio/audio-assets",
  "quality": "primary",
  "angle": "Audio privacy since 2022 and public sound effects",
  "claimCount": 5
 },
 {
  "url": "https://progameguides.com/roblox/roblox-to-private-millions-of-user-created-sounds-within-its-audio-database/",
  "quality": "unreliable",
  "angle": "Audio privacy since 2022 and public sound effects",
  "claimCount": 0
 },
 {
  "url": "https://devforum.roblox.com/t/allow-users-to-play-uploaded-audio-in-experience/3974730",
  "quality": "forum",
  "angle": "Audio privacy since 2022 and public sound effects",
  "claimCount": 5
 },
 {
  "url": "https://en.help.roblox.com/hc/en-us/articles/15887203369620-Creator-Third-Party-App-Terms",
  "quality": "primary",
  "angle": "AI rules: training on Roblox content and Third-Party App Terms",
  "claimCount": 5
 },
 {
  "url": "https://en.help.roblox.com/hc/en-us/articles/37924211313044-Creator-Third-Party-App-Policy",
  "quality": "primary",
  "angle": "AI rules: training on Roblox content and Third-Party App Terms",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/ai-data-sharing",
  "quality": "primary",
  "angle": "AI rules: training on Roblox content and Third-Party App Terms",
  "claimCount": 5
 },
 {
  "url": "https://en.help.roblox.com/hc/en-us/articles/115004647846-Roblox-Terms-of-Use",
  "quality": "unreliable",
  "angle": "AI rules: training on Roblox content and Third-Party App Terms",
  "claimCount": 0
 }
]

## stats

{
 "angles": 5,
 "sourcesFetched": 18,
 "claimsExtracted": 67,
 "claimsVerified": 25,
 "confirmed": 19,
 "killed": 6,
 "unverified": 0,
 "afterSynthesis": 10,
 "urlDupes": 0,
 "budgetDropped": 11,
 "agentCalls": 100
}
