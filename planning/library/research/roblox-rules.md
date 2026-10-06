# Roblox rules and APIs for the StudPilot Library (deep research, 2026-10-07)

Deep-research workflow: 103 Opus agents (5 search angles, fetch, 3-vote adversarial verification). Master plan §4.1 L9.

## Summary

Roblox exposes a documented, beta Creator Store search API (POST https://apis.roblox.com/toolbox-service/v2/assets:search, plus GET /toolbox-service/v2/assets/{id}) that takes an API key (x-api-key, scope creator-store-product:read) or an OAuth 2.0 bearer token. It is rate-limited to 1000/minute per key owner or OAuth authorization, and 429s should be retried with exponential backoff starting at 1s. Asset use across experiences is governed by the Open Use / Restricted privacy model, which is checked at load time in Studio and at runtime. Only Images, Decals and Meshes follow the Asset Privacy creation setting, and the 2026-05-05 full release covers only newly created Image, Mesh and Decal assets. Open Use is irreversible, grants to an experience are permanent, and animations stay Restricted (per-experience grants only, no public animations). Uploads through the Assets API need an API key or the asset:read and asset:write OAuth scopes, are limited to 20 MB and one asset per call (audio 100 or 10 a month, 7 minutes), and OAuth app publishing requires ID verification. Third-party apps may not imply Roblox affiliation or use Roblox marks without written consent. This research did not establish the caching rules, the Creator Store licence and attribution terms, APM audio limits, moderation and pricing, or any AI-training rule, so those items remain open.

## Verified findings

### Creator Store search API: POST https://apis.roblox.com/toolbox-service/v2/assets:search (Beta) returns creatorStoreAssets[], totalResults, nextPageToken, queryFacets and queryCorrection. A details endpoint, GET /toolbox-service/v2/assets/{id}, also exists (Beta). The page at create.roblox.com/docs/projects/assets/api only points readers to the Open Cloud reference.

- **Confidence:** high (vote 3-0 (search endpoint and fields), 3-0 (details endpoint), 3-0 (docs page is only a pointer))
- **Evidence:** Three verifiers fetched the primary Open Cloud reference and confirmed the endpoints, host and all five response fields. The reference page's front matter shows last_updated 2026-10-06. Both endpoints are marked Beta, so they may change.
- **Sources:** https://create.roblox.com/docs/en-us/cloud/reference/features/creator-store.md, https://create.roblox.com/docs/zh-cn/cloud/reference/features/creator-store, https://create.roblox.com/docs/en-us/projects/assets/api

### Auth and scopes: the search and saves endpoints accept an API key in the x-api-key header (created in the Creator Dashboard) or an OAuth 2.0 bearer token. The .ROBLOSECURITY cookie is listed as 'Do not use in production'. Search needs scope creator-store-product:read, and saves need creator-store-save:read or creator-store-save:write. A third-party wrapper says search does not support OAuth2, which conflicts with the Roblox page.

- **Confidence:** high (vote 3-0)
- **Evidence:** The primary reference lists three auth methods and the scopes. A third-party wrapper (rblx-open-cloud.readthedocs.io) states OAuth2 is not supported for search, and this was not resolved against Roblox's own page. A related claim that the endpoints list HttpService as an auth method was refuted 0-3.
- **Sources:** https://create.roblox.com/docs/en-us/cloud/reference/features/creator-store.md

### Rate limits: search is 1000/minute per API key owner and per OAuth2 authorization, saves endpoints are 200/minute, and Creator Store product endpoints (create, get, update) are 30/minute. A 429 on search should be retried with exponential backoff starting at 1s.

- **Confidence:** high (vote 3-0)
- **Evidence:** The primary reference (last_updated 2026-10-06) lists the limits per endpoint. The 1s backoff instruction appears only on the search endpoint's 429 entry, and the 30/minute limit applies only to the product endpoints.
- **Sources:** https://create.roblox.com/docs/en-us/cloud/reference/features/creator-store.md

### Using Creator Store assets in other creators' games depends on the privacy model. Open Use means any creator or game can use the asset, and Restricted means use only after the owner grants permission. Roblox checks permissions when an asset loads in Studio or at runtime, so a Restricted asset without an explicit grant cannot load.

- **Confidence:** high (vote 3-0)
- **Evidence:** The verifier quoted the Creator Store page verbatim (line 127) and confirmed the definitions on the Asset Privacy page. The claim is accurate but should not be generalised to every asset type, because defaults vary by type. The research found no source stating a separate Creator Store licence or attribution rule. The refuted claim that none exists was 0-3, so the licence terms remain unconfirmed.
- **Sources:** https://create.roblox.com/docs/production/creator-store, https://create.roblox.com/docs/projects/assets/privacy

### Scope of the Asset Privacy setting: it applies at creation only to Images, Decals and Meshes. Audio, Video, Models, MeshParts, Animations and Packages keep their own creation defaults and are not changed by it. The setting is not retroactive, and it is opt-in via a toggle in Creator Dashboard, available to individuals and groups.

- **Confidence:** high (vote 3-0 (scope claim), 3-0 (2026-05-05 full release))
- **Evidence:** The docs page (last updated 2026-06-25 per one verifier) and the 2026-05-05 DevForum full-release post agree. The post says Audio, Video, Package, Model and MeshPart are always Restricted by default and cannot be set to Open Use. 'Not affected' does not mean those types are open or public.
- **Sources:** https://create.roblox.com/docs/projects/assets/privacy, https://devforum.roblox.com/t/full-release-privacy-for-newly-created-image-mesh-and-decal-assets/4620416

### Permanence of privacy states. Once an asset is set to Open Use it cannot be changed back to Restricted. A grant to an experience for a restricted asset is permanent and cannot be revoked. Revoking a collaborator blocks only new grants, and experiences that already have access keep it.

- **Confidence:** high (vote 3-0)
- **Evidence:** Verbatim text on the primary page. A DevForum thread on expanded sharing is consistent with it. The page has no explicit date, and the verifier did not check the Roblox changelog.
- **Sources:** https://create.roblox.com/docs/projects/assets/privacy

### Exact steps to let a specific experience use a restricted asset: Creator Dashboard, then Development Items, then the asset type (Models & Packages, Audio, Decals, Images, Videos, Meshes, MeshParts, Animations), then the asset's Permissions, then the Experiences tab and Add experiences. Enter universe IDs (comma-separated is allowed), click Add, then Done. Other routes exist: bulk grants in Asset Manager, an automatic grant when a collaborator inserts the asset in Studio, and Open Use.

- **Confidence:** high (vote 3-0)
- **Evidence:** The verifier fetched the page (©2026) and found the same sequence. The quote 'Click Add experiences tab' is loosely worded, because the docs say to click Add experiences from the Experiences tab.
- **Sources:** https://create.roblox.com/docs/projects/assets/privacy

### Animations. Animation assets are Restricted and cannot be set to Open Use (staff post 2025-07-31). Permission is now experience-based. Once an experience is granted an animation, any player and any collaborator in a Studio playtest can load it, and animations no longer need to be re-uploaded or transferred between accounts. Animations already used in a published experience were granted automatically. On 2025-08-21 sharing with connections and groups was added. Roblox said it was looking into a public-animation solution, possibly via the Creator Store. The research found no 2026 reversal.

- **Confidence:** medium (vote 2-1 (Restricted, no Open Use), 3-0 (experience-based permissions))
- **Evidence:** The verifiers fetched the staff post, which says animations cannot be Open Use because they are shown to everyone on the server. The claim that animations are not Open Use passed 2-1. The experience-based permission claim passed 3-0. A claim that grants must be made through Creator Hub (Permissions > Assets tab) and are not revocable was refuted 0-3, because other grant routes exist (Toolbox insertion, playtest, copy-paste). The absence of a 2026 change rests on search only. Roblox-owned animation packages and emotes were not covered by any source.
- **Sources:** https://devforum.roblox.com/t/improving-animation-asset-permissions/3852101, https://devforum.roblox.com/t/sharing-animation-assets-with-connections-and-groups/3892540, https://create.roblox.com/docs/projects/assets/privacy

### Assets API upload: API keys use the x-api-key header with the assets access permission and Read/Write operation on the target experience. OAuth 2.0 apps need the asset:read and asset:write scopes. Each call creates or updates one asset, up to 20 MB. As of 2025-10-23, uploads of .rbxm models and animations and Roblox-formatted meshes are supported, but plugin uploads are not. Meshes are accepted only when the content was downloaded from the Asset delivery API. Externally edited .rbxm or mesh files may fail.

- **Confidence:** high (vote 3-0 (auth and scopes), 3-0 (asset types), 2-1 (one asset and 20 MB))
- **Evidence:** The usage-assets page (last_updated 2026-10-06) and the 2025-10-23 staff post are consistent with each other. The page says it contains beta endpoints that may change. Its Video row says up to 3.75 GB, which conflicts with the blanket 20 MB line, so the 20 MB cap should not be read as a hard limit for video.
- **Sources:** https://create.roblox.com/docs/cloud/guides/usage-assets, https://devforum.roblox.com/t/open-cloud-upload-support-for-more-asset-types/4022082

### Upload quotas. Audio through the Assets API is capped at 7 minutes, with 100 uploads a month for ID-verified users and 10 a month for unverified users. Video is 20 uploads a day for 13+ ID-verified users. The AssetQuota resource (GET /cloud/v2/users/{user_id}/asset-quotas, Beta) lets a tool read a user's upload quotas, with fields quotaType (RATE_LIMIT_UPLOAD, RATE_LIMIT_CREATOR_STORE_DISTRIBUTE), assetType, usage, capacity and period.

- **Confidence:** medium (vote 2-1 (audio), 2-1 (video), 3-0 (AssetQuota endpoint))
- **Evidence:** The usage-assets page states the audio and video limits (2-1 votes). Asset Manager and Dashboard imports have much higher audio limits (2,000 per 30 days verified, 100 unverified), so the Open Cloud limits apply only to the Assets API path. The research found no per-group or per-user daily quotas for other asset types, no moderation rules and no pricing.
- **Sources:** https://create.roblox.com/docs/cloud/guides/usage-assets, https://create.roblox.com/docs/cloud/reference/AssetQuota

### OAuth 2.0 app gating: registering and publishing an OAuth 2.0 app requires the developer to be ID verified. A registered app stays private, limited to 10 unique users, until it passes review, which needs a public demo video of 1 minute or less and a justification. An app can be registered only for individual accounts or groups the developer owns. This gates any StudPilot feature that uploads to creators' own accounts via OAuth.

- **Confidence:** high (vote 3-0)
- **Evidence:** The overview page carries the exact ID-verification sentence. The 10-user limit and review requirement come from the registration page, per the verifier of the overview claim. Neither page shows a date.
- **Sources:** https://create.roblox.com/docs/cloud/auth/oauth2-overview, https://create.roblox.com/docs/cloud/auth/oauth2-registration

### Third-party app terms (updated 2026-09-29). An app may not be misleading or suggest or imply any affiliation with Roblox or its endorsement, and may not use Roblox's name, marks or logo without prior written consent. An app also may not use intellectual property it has no rights to, and must be owned or authorized by the submitter. A further claim that apps must carry their own terms requiring users to accept the Roblox Terms was refuted 0-3.

- **Confidence:** medium (vote 3-0 (affiliation and marks), 2-1 (IP clause))
- **Evidence:** The verifiers read the article through the Help Center API because the HTML page returned 403. The policy governs apps in the Third-Party Application Program, which StudPilot would join if it registers an OAuth app. Whether nominative use such as 'for Roblox Studio' is tolerated is a legal question the page does not answer. A free Creator Store asset the tool is licensed to use is not IP the app lacks rights to, so the clause does not forbid it.
- **Sources:** https://en.help.roblox.com/hc/en-us/articles/15887203369620-Creator-Third-Party-App-Terms

## caveats

Coverage of the question is partial. No surviving claim covers four items: how long Creator Store search results may be cached; the Creator Store licence, 'free to use' meaning and attribution; Roblox-licensed music (APM) limits and public-versus-private audio rules; and the Roblox Terms of Use or any rule on AI or training on Roblox data. The claim that Creator Store pages state no separate licence was refuted 0-3, so absence of a licence term cannot be assumed. A rule on audio privacy, moderation and Assets API pricing was likewise not established. The Open Cloud endpoints (search, details, AssetQuota, assets update) are all Beta and may change. Several docs pages carry no visible date (privacy, OAuth overview), so the 2025-2026 change dates rest on DevForum posts: animations on 2025-07-31 and 2025-08-21, upload types on 2025-10-23, and Asset Privacy full release on 2026-05-05. A split 2-1 on a few claims reflects loose wording, not conflicting evidence. One verifier noted a conflict between a third-party wrapper (OAuth2 unsupported for search) and the Roblox page (OAuth bearer listed). The 'Asset Privacy' wording can mislead: the full release is described as opt-in, with new Image, Mesh and Decal assets restricted only if the toggle is on, so do not read it as 'every new group image is Restricted by default'. Roblox-owned animation packages and emotes, and whether an experience can play animations it does not own, are covered only through the per-experience grant rule. The verification date is 2026-10-07.

## refuted

[
 {
  "claim": "The Creator Store endpoints support three auth methods: API key, OAuth 2.0 and HttpService (calls from inside an experience). Cookie auth is also noted for some endpoints. The fetched summary did not give the API key scopes.",
  "vote": "0-3",
  "source": "https://create.roblox.com/docs/zh-cn/cloud/reference/features/creator-store"
 },
 {
  "claim": "The Roblox Creator Docs page for the Creator Store API contains no endpoint, auth, rate-limit or caching details. It refers readers to the 'Toolbox Service' section of the Open Cloud reference for search calls.",
  "vote": "1-2",
  "source": "https://create.roblox.com/docs/en-us/projects/assets/api"
 },
 {
  "claim": "Free Creator Store assets are governed by Roblox's general policies (Community Rules, Terms of Use, IP/copyright guidelines). The page, as extracted, states no separate licence and no attribution requirement for using free assets.",
  "vote": "0-3",
  "source": "https://create.roblox.com/docs/production/creator-store"
 },
 {
  "claim": "Third-party apps and their users must comply with the Roblox Terms of Use (User Terms, Creator Terms, Community Standards), and the App must include its own terms requiring users to agree to the Roblox Terms and stating Roblox is not affiliated with the app.",
  "vote": "0-3",
  "source": "https://en.help.roblox.com/hc/en-us/articles/15887203369620-Creator-Third-Party-App-Terms"
 },
 {
  "claim": "An experience must be explicitly granted permission to an animation through Creator Hub (Permissions > Assets tab). Once granted, the experience permission is not revocable.",
  "vote": "0-3",
  "source": "https://devforum.roblox.com/t/improving-animation-asset-permissions/3852101"
 }
]

## unverified

[]

## sources

[
 {
  "url": "https://create.roblox.com/docs/en-us/cloud/reference/features/creator-store.md",
  "quality": "primary",
  "angle": "Open Cloud Creator Store / Toolbox Service API",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/zh-cn/cloud/reference/features/creator-store",
  "quality": "primary",
  "angle": "Open Cloud Creator Store / Toolbox Service API",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/en-us/projects/assets/api",
  "quality": "primary",
  "angle": "Open Cloud Creator Store / Toolbox Service API",
  "claimCount": 4
 },
 {
  "url": "https://en.help.roblox.com/hc/en-us/articles/21308223046932-Creator-Store-Terms",
  "quality": "unreliable",
  "angle": "Creator Store terms, licensing and third-party insertion",
  "claimCount": 0
 },
 {
  "url": "https://create.roblox.com/docs/production/creator-store",
  "quality": "primary",
  "angle": "Creator Store terms, licensing and third-party insertion",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/projects/assets/privacy",
  "quality": "primary",
  "angle": "Creator Store terms, licensing and third-party insertion",
  "claimCount": 5
 },
 {
  "url": "https://en.help.roblox.com/hc/en-us/articles/115004647846-Roblox-Terms-of-Use",
  "quality": "unreliable",
  "angle": "Creator Store terms, licensing and third-party insertion",
  "claimCount": 0
 },
 {
  "url": "https://en.help.roblox.com/hc/en-us/articles/15887203369620-Creator-Third-Party-App-Terms",
  "quality": "primary",
  "angle": "Creator Store terms, licensing and third-party insertion",
  "claimCount": 5
 },
 {
  "url": "https://devforum.roblox.com/t/improving-animation-asset-permissions/3852101",
  "quality": "primary",
  "angle": "Animation permissions and Open Cloud asset upload limits",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/cloud/guides/usage-assets",
  "quality": "primary",
  "angle": "Animation permissions and Open Cloud asset upload limits",
  "claimCount": 5
 },
 {
  "url": "https://devforum.roblox.com/t/open-cloud-upload-support-for-more-asset-types/4022082",
  "quality": "primary",
  "angle": "Animation permissions and Open Cloud asset upload limits",
  "claimCount": 4
 },
 {
  "url": "https://create.roblox.com/docs/cloud/reference/AssetQuota",
  "quality": "primary",
  "angle": "Animation permissions and Open Cloud asset upload limits",
  "claimCount": 3
 },
 {
  "url": "https://devforum.roblox.com/t/cant-import-user-owned-animations-in-a-group-owned-experience/3989573",
  "quality": "forum",
  "angle": "Animation permissions and Open Cloud asset upload limits",
  "claimCount": 4
 },
 {
  "url": "https://create.roblox.com/docs/cloud/auth/oauth2-overview",
  "quality": "primary",
  "angle": "Animation permissions and Open Cloud asset upload limits",
  "claimCount": 4
 },
 {
  "url": "https://devforum.roblox.com/t/full-release-privacy-for-newly-created-image-mesh-and-decal-assets/4620416",
  "quality": "primary",
  "angle": "Group asset privacy change and Open Use settings",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/en-us/projects/assets/privacy.md",
  "quality": "primary",
  "angle": "Audio licensing/privacy and Roblox ToU AI rules",
  "claimCount": 5
 },
 {
  "url": "https://create.roblox.com/docs/en-us/audio/assets.md",
  "quality": "primary",
  "angle": "Audio licensing/privacy and Roblox ToU AI rules",
  "claimCount": 5
 },
 {
  "url": "https://devforum.roblox.com/t/1701697",
  "quality": "primary",
  "angle": "Audio licensing/privacy and Roblox ToU AI rules",
  "claimCount": 4
 },
 {
  "url": "https://create.roblox.com/docs/en-us/ai-data-sharing",
  "quality": "primary",
  "angle": "Audio licensing/privacy and Roblox ToU AI rules",
  "claimCount": 5
 },
 {
  "url": "https://en.help.roblox.com/hc/articles/360000927163",
  "quality": "unreliable",
  "angle": "Audio licensing/privacy and Roblox ToU AI rules",
  "claimCount": 0
 },
 {
  "url": "https://conductatlas.com/change/2026-05-19-roblox-roblox-terms-of-use-2191/",
  "quality": "unreliable",
  "angle": "Audio licensing/privacy and Roblox ToU AI rules",
  "claimCount": 0
 }
]

## stats

{
 "angles": 5,
 "sourcesFetched": 21,
 "claimsExtracted": 78,
 "claimsVerified": 25,
 "confirmed": 20,
 "killed": 5,
 "unverified": 0,
 "afterSynthesis": 12,
 "urlDupes": 1,
 "budgetDropped": 6,
 "agentCalls": 103
}
