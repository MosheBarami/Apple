# Roblox OAuth 2.0 app: setup record (2026-10-04)

The owner registers this app himself on his ID-verified Roblox account. Claude Code implements the flow later (handoff tasks O1–O6).

**Sources:** Roblox Creator Docs, checked 2026-10-04:
- [OAuth 2.0 app registration](https://create.roblox.com/docs/cloud/auth/oauth2-registration)
- [OAuth 2.0 overview](https://create.roblox.com/docs/cloud/auth/oauth2-overview)
- [OAuth 2.0 reference](https://create.roblox.com/docs/cloud/reference/oauth2)
- [Assets API usage](https://create.roblox.com/docs/cloud/guides/usage-assets)
- The scope → endpoint map in Roblox's public `openapi.json` (Roblox/creator-docs repo).

## Owner decisions
- **Purpose:** "Sign in with Roblox" (alongside Google, Discord and email), plus uploading Apple-made images, animations and sounds **into the user's own Roblox account**.
  - This fixes two blockers. First, image-based UI needs uploaded images. Second, animations only play in games their owner has permission for, so an animation published from Apple's account won't play in a user's game.
- **App name:** **StudPilot**. This is also the working product name; trademark and domain checks are still open. A quick web search found no product with this exact name. Similar names exist: "StudyPilot" and "StudioPilot".

## Form values
| Field | Value |
|---|---|
| Application name | `StudPilot` |
| Category | Creation & Productivity Tools |
| Description (public) | "StudPilot is an AI co-pilot for Roblox Studio. It builds UI, game systems, props and map areas in your own Studio. With your permission it uploads the images, sounds and animations it makes to your own Roblox account, so they work in your games." |
| Entry link | `https://apple.moshe-barami111.workers.dev/` (replace when the StudPilot domain exists) |
| Privacy policy URL | `https://apple.moshe-barami111.workers.dev/privacy` (live, HTTP 200). **Must be updated before review** (O6) |
| Terms of service URL | `https://apple.moshe-barami111.workers.dev/terms` (live, HTTP 200) |
| Redirect URL 1 | `https://apple.moshe-barami111.workers.dev/auth/roblox/callback` |
| Redirect URL 2 | `http://localhost:5173/auth/roblox/callback` (local dev; Claude Code confirms the web app's dev port and edits this if different) |
| Scopes | `openid`, `profile`, `asset:read`, `asset:write` |
| Thumbnail | Later. A StudPilot logo of at least 150×150 is needed before review. |

### What the scopes allow
- **`openid` / `profile`:** sign-in, plus the Roblox user ID, username and avatar.
- **`asset:write`:** `POST /assets/v1/assets` and related calls. Uploads animations (`.rbxm`), images/decals (<8000×8000), audio (≤7 min; 100 uploads a month for ID-verified users, 10 otherwise), meshes, models and video, with a 20 MB limit per call. Each upload passes Roblox moderation.
- **`asset:read`:** checks upload and moderation status.

### Deliberately NOT requested now
`universe:*`, `universe.place.*` (including cloud Luau execution) and `creator-store-product:read`.

Adding scopes later forces every user to re-consent, so add only when a feature needs them. **Candidate for later:** `universe.place.luau-execution-session:write` for headless cloud tests.

## Facts and limits
- **Private mode:** up to **10 unique users** until Roblox reviews the app. A review needs a demo video (under 1 minute) of the full flow, a justification for each scope, and all general info. The app cannot be edited while a review is pending.
- **Editing later:** changing the description, links or redirect URLs does **not** require users to re-authorize. Changing scopes **does**.
- **Tokens:**
  - The access token lasts **15 min**.
  - The refresh token lasts **90 days and is single-use**: rotate it and store the new one each time.
  - Use the confidential flow (client secret on the Worker) **plus PKCE** (S256).
- **Endpoints:** base `https://apis.roblox.com/oauth`; discovery at `/.well-known/openid-configuration`; `v1/authorize`, `v1/token`, `v1/userinfo`, `v1/token/revoke`, `v1/token/introspect`.
- **Users:** must have a 13+ Roblox account to authorize, which matches the 13+ decision.

## Secrets
- **Client ID:** `5523165872353873834` (not secret; it appears in sign-in URLs). **Client Secret:** in the local git-ignored `.env` as `ROBLOX_OAUTH_CLIENT_SECRET` (added 2026-10-04). It was shared in a chat, so regenerate it in the Creator Dashboard before public launch and update `.env` and the Worker secret.
- **Never** paste them in chat, commit them, or put them in the public repo.
- Claude Code moves them to the Worker with `wrangler secret put` (O1).

## Handoff tasks
- **O1** Put the secrets on the Worker.
  - Run `wrangler secret put ROBLOX_OAUTH_CLIENT_ID` and `wrangler secret put ROBLOX_OAUTH_CLIENT_SECRET` (apple worker config).
  - **Verify:** `wrangler secret list` shows both, and `git grep` finds no secret value.
- **O2** Add Worker routes:
  - `GET /auth/roblox/start` (state + PKCE, redirect to `v1/authorize`);
  - `GET /auth/roblox/callback` (check state, exchange the code, call `userinfo`, then create or link the Supabase user).
  - **Verify:** a test with a mocked token endpoint passes, and the owner logs in successfully in private mode.
- **O3** Store refresh tokens encrypted and server-side only, rotating on every refresh. Give users "Disconnect Roblox" (calls `v1/token/revoke`).
  - **Verify:** unit tests cover rotation and revoke.
- **O4** Add an "upload to your account" step for images, animations and sounds: `POST /assets/v1/assets` with the user's token, poll the operation, then use the returned asset ID in the piece. Moderation-pending and rejected results are reported honestly.
  - **Verify:** a test upload of one PNG and one animation `.rbxm` on the owner's account plays and shows in his game.
- **O5** In the web app, add a "Continue with Roblox" button next to Google, Discord and email.
- **O6** Before review:
  - Update `/privacy` for the Roblox data held (user ID, username, tokens, uploads) and fix the training opt-in contradiction.
  - Make a StudPilot thumbnail.
  - Record the <1 min demo.
  - Then the owner submits the review.

## Update 2026-10-04: dashboard screens checked
- **App Category must be "Creation & Productivity Tools".** The dashboard defaults to "Account Linking Tools", and that category only allows `openid`/`profile`. Per Roblox's [Creator Third-Party App Policy](https://en.help.roblox.com/hc/en-us/articles/37924211313044-Creator-Third-Party-App-Policy), only Creation & Productivity Tools allows `asset:read` and `asset:write`.
- **Review Submission stays empty until O6.** Roblox "does not approve scopes for planned or future functionality", so submit only once sign-in and uploads work and the demo video exists.
- **⚠ Policy rule: "You may not utilize any user data for the training of AI or language learning models."** It also says: expunge all Roblox-API data if API access is lost.
  - So anything obtained through Roblox APIs (user ID, username, avatar, asset info, tokens) must be **excluded** from the "anonymised, opt-out" improvement data.
  - The privacy page (O6) must say so.
- **Draft Category Justification** (≤1000 chars; paste at review time):

> StudPilot is an AI co-pilot that helps creators build content for their own experiences in Roblox Studio: UI screens, game systems, props and map areas. It belongs in Creation & Productivity Tools because its only purpose is creating and editing the creator's own experience content. openid and profile: let the creator sign in with their Roblox account and show their username in the StudPilot web app. asset:write: when the creator asks StudPilot for a piece that needs an image (UI icons, panels), an animation or a sound, StudPilot uploads that file to the creator's own Roblox account, so the creator owns it and it works in their experience. asset:read: checks the upload and moderation status of those assets and reads their IDs so they can be placed in the build. StudPilot uploads only on the creator's request and never uses Roblox data to train AI.

## Update 2026-10-04: domain
- **The owner bought `studpilot.app`** (Cloudflare Registrar, about $8.20 for the first year, $14.20/yr after; auto-renew recommended).
- The owner is connecting the root domain to the production Worker through the dashboard.
- **New OAuth values** (these replace the workers.dev ones, which Roblox rejected with "One or more redirect uris are invalid"):
  - Redirect: `https://studpilot.app/auth/roblox/callback`
  - Entry link: `https://studpilot.app/`
  - Privacy: `https://studpilot.app/privacy`
  - Terms: `https://studpilot.app/terms`
- **Handoff task O0:** once the domain is connected, make the Worker work fully on `studpilot.app`. That means CORS/allowed origins, the Supabase Auth site URL and redirect allow-list (Google, Discord, magic link), cookie domain, the plugin's API base URL, and any hard-coded `apple.moshe-barami111.workers.dev`.
  - Keep the workers.dev URL working until the switch is done.
  - **Verify:** sign-in, chat and plugin pairing all work on `https://studpilot.app`.
