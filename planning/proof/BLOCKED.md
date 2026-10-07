# Waiting on the owner

**Owner, 2026-10-06 (issues #75-#83):** N2, N9, X5, N5, X4, X7 and N12 wait until StudPilot is complete and ready to
publish; do not raise them before then (N12: the `rocket` glyph stays). X8 and X9: "generate it yourself" (see each).

Only what needs the owner: an owner-only action from the handoff (X4, X5, X7–X9), money, a legal step, or a console
no token here can reach. Work that does not depend on an item goes on. Done and decided items are removed (see
`OWNER-DECISIONS.md`, D-10 to D-16, 2026-10-05).

## Urgent

### N2. Google and Discord sign-in: one live sign-in with each (after Claude Code switches them on)
Both providers were switched on 2026-10-06 (Supabase reports google: true, discord: true; the app shows the buttons when
they are). Google's consent page loads with our callback and no redirect error; Discord's page renders client-side, so a
redirect error there cannot be ruled out without a person. The privacy policy already covers both "where offered".
Left: sign in once with Google and once with Discord on https://studpilot.app/app/signin and tell Claude Code it worked.

## GitHub (2026-10-06): three clicks that have no API

### G1. Project board: auto-add new issues and pull requests
1. https://github.com/users/MosheBarami/projects/1 → the **⋯** menu (top right) → **Workflows**.
2. **Auto-add to project** → **Edit** → repository **MosheBarami/StudPilot**, filter `is:issue,pr is:open` → **Save and turn on workflow**.
3. In the same list, check that **Item closed** and **Pull request merged** set Status to **Done** (on by default).

### G2. Saved issue views
On https://github.com/MosheBarami/StudPilot/issues, type each filter, then **Save view** with its name:
- **Waiting on owner:** `is:open label:owner-action`
- **Test builds:** `is:open label:test-build`
- **Style gaps:** `is:open label:style`
- **Tasks:** `is:open label:task sort:created-asc`

### G3. CodeQL: turn the per-PR default setup off after #73 merges (Claude Code does this with gh; listed in case it fails)
Settings → Code security → Code scanning → CodeQL analysis → **⋯** → **Disable CodeQL** (the weekly `codeql.yml` replaces it).

## Master plan (2026-10-07): owner steps

### O-EYE-WEB. Look at the 4 site screenshots and answer "yes" or "change X" (§7)
Sent in chat on 2026-10-07: Home (hero rule applied), Pricing, empty chat, chat mid-build. Nothing else ships to the site
until you answer.

### O-GROUP. A "StudPilot" Roblox group (costs 100 Robux: needs your yes) (§4.5.1)
1. Say "yes, create the group" (or name an existing group you own).
2. On roblox.com: **Create** → **Communities** → **Create Community**, name "StudPilot", pay 100 Robux.
3. Tell Claude Code the group's ID (in the group page URL).

### O-PRIVACY. The group's assets must be usable in other people's games (§4.5.2)
New group images are Restricted by default since 2026-05-05. Claude Code will confirm the exact clicks with research
and put them here; until then this item waits on O-GROUP.

### O-KEY. A group Open Cloud API key with only the scopes the pipeline needs (§4.5.3)
1. https://create.roblox.com/dashboard/credentials → **API Keys** → **Create API Key**.
2. Owner: the **StudPilot group** (never your personal account).
3. Access, only these two:
   - **Assets** API: read and write (uploads of files that are not already on Roblox, to the group).
   - **Creator Store** (`creator-store-product:read`): searching the Creator Store through the official Open Cloud
     API (research 2026-10-07: the search endpoint takes an API key with this scope, 1,000 calls a minute).
   Nothing else; more scopes later, one at a time, with a reason.
4. Accepted IP addresses: 0.0.0.0/0 for now, no expiry or 90 days.
5. Paste it yourself into `~/Developer/StudPilot/.env` as `ROBLOX_GROUP_ASSETS_KEY=...` and the group ID as
   `ROBLOX_GROUP_ID=...`. Tell Claude Code "group key in".

Why it matters now (2026-10-08): the library retrieval test L-A6 stands at 67.5 % (bar 90 %). Of the queries that
still fail, nearly all are content the open sources do not have: specific props, characters, landmarks and game
mechanics. The Creator Store is the remaining source (planning/proof/LIB/L-A6/README.md).

### O-TOOLBOX. Covered by O-KEY (§4.5.4)
Research (planning/library/research/roblox-rules.md): the official search is POST
https://apis.roblox.com/toolbox-service/v2/assets:search with an API key carrying `creator-store-product:read`. Add that
scope to the group key in O-KEY; no second key is needed. The older harvest used an unauthenticated internal endpoint,
which the master plan's L9 does not allow, so it is re-checked through the official API once the key exists.

### O-WORKFLOW. Larger research workflows (§4.5.5)
If library research is slowed by the workflow size limit: in a `claude` terminal run `/config` → **Dynamic workflow
size** → raise it. (Not a blocker today: research runs in smaller batches.)

### O-ARTIST. A human icon artist for the art no free family has (money: needs your decision) (§6.1)
The kit's icon family is now Kenney's CC0 3D models, rendered by one fixed camera, light and navy contour
(`packages/library/tools/render-icons.mjs`, 43 icons, 16 of them Cube Pets). Deep research found no free, human-made,
glossy 3D family that covers everything. What it cannot cover, and the critics keep marking down:
- **patterned eggs** (today: one plain Kenney egg in rarity tints; both critics call it "same shape in five tints");
- 16 names with no model: backpack, bolt, book, boots, calendar, cash, clock, clover, fire, magnet, map, money bag,
  rocket, scroll, ticket, vip;
- a round embossed coin (the Kenney coin reads as a hex nut to the critics).
Options: (a) commission a human 3D or 2D icon artist, about 30 pieces, with a commercial licence that allows
redistribution inside other people's games (budget is yours to set); (b) keep the gaps: those names draw nothing and
eggs stay plain. Answer "a, budget X" or "b". Never AI (rule L1).

### O-EYE-UI. The 6-screen UI eye check (§6.6), not sent yet
Sent only when the two fresh critics pass (style 8+, no weak signature, pairwise 35 %+). Round 1: 5 and 5, 0/10.
Round 2: 6 and 6, 0/10. Work continues; the record is in `planning/proof/STYLE/`.

## Before charging money

### N9. An adult or a company becomes the named operator (D-15)
The legal pages name "StudPilot" as the operator, with support@studpilot.app. Before any money is charged, an adult or a
registered company must become the named operator: the party in the terms, on the privacy policy and on the Stripe
account (X5). Tell Claude Code the legal name, and it updates `/privacy` and `/terms`.

### X5. An adult holds the Stripe account
Charging stays off until then (plan section 7). When it is done, also do N5.

### N5. Stripe: webhook URL and product names (after X5)
The webhook still points at `https://apple.moshe-barami111.workers.dev/api/billing/webhook`. It keeps working
through the stand-in until 2027-01-02.
1. https://dashboard.stripe.com → **Developers** → **Webhooks** → the endpoint ending `/api/billing/webhook`.
2. **Update endpoint**: set the URL to `https://studpilot.app/api/billing/webhook`, then save. The signing
   secret stays the same.
3. **Product catalog**: rename each test-mode product to its StudPilot plan name. In **Settings → Public
   details**, set the statement descriptor to `STUDPILOT`.

## Before public launch

### X4. Regenerate the Roblox OAuth client secret (it was shared in chat)
1. https://create.roblox.com/dashboard/credentials → **OAuth 2.0 Apps** → **StudPilot**.
2. Click **Regenerate secret** and copy the new value.
3. Open `~/Developer/StudPilot/.env` and replace the value after `ROBLOX_OAUTH_CLIENT_SECRET=`. Save.
4. Tell Claude Code "secret rotated". It puts the new value on the Worker and checks that sign-in still works.

## M7 only

- **X7. Publish the plugin:** decide whether and when to publish the Studio plugin to the Creator Store (after
  M7), and rename the listing "Apple Studio" to "StudPilot". Until a plugin with the `studpilot.app` base is
  published, the `apple` stand-in must stay. It is due to be deleted on 2027-01-02.
- **X8. The hidden test set:** owner (#81): Claude Code generates it. A fresh agent writes it to the git-ignored
  `private/hidden-set/` and commits only its sha256; the building session does not read it before M7.
- **X9. The Roblox OAuth review:** owner (#82): Claude Code makes the video (a motion-graphics showreel, at M7). The
  review itself still needs a real recording of the Roblox sign-in flow; Claude Code makes both. Earlier text: record the demo video (under one minute; Claude Code writes the script) and
  submit it in the Roblox Creator Dashboard.

## Anytime

### N10. RESOLVED 2026-10-06: stud is ideas only
Owner decision: madebyshaurya/stud (AGPL-3.0) is used for ideas only; no code of it is copied into StudPilot
(THIRD_PARTY_NOTICES.md says so). The other three named projects are MIT and are used.

### N11. RESOLVED 2026-10-06: the Mac is unlocked and Studio is paired
The owner unlocked the Mac with Studio open; Claude Code paired the plugin to the test project and runs the M3 baseline.

### X3. RESOLVED 2026-10-06: the daily spend ceiling is 300,000 neurons ($3.30); the month stays at 2,270,000 ($24.97)
Owner decision. `BILLABLE_NEURONS_PER_DAY = 300_000` in apps/worker/src/pricing.ts; `BILLABLE_NEURONS_PER_MONTH` unchanged, so the
monthly backstop now binds after about 7 days at the daily ceiling (docs/COST-MODEL.md). At about 8,000 neurons a piece, evaluation
gets about 37 pieces a day. Test spend still stays at or below $20 a month (the harness's --max-month-usd).


## N12. SUPERSEDED 2026-10-07 by O-ARTIST: the community icon pack was replaced by the Kenney family
(Former title: one icon of the kit's pack needs an upload: `rocket`.)
The pack (`packages/blocks/assets/icons.json`, 39 free Creator Store images, style bible S-4) has no free glossy 3D rocket
(searched: rocket icon, rocket icon 3d cartoon, rocket ship icon, rocket icon glossy outline game, simulator rocket icon,
jetpack icon). Roblox's AI generator could make one, but the result is uploaded to the account that runs it, and nothing
goes to the owner's account without a yes. Until then `rocket` shows its glyph. Owner: say yes to one Roblox-AI image
upload (and to which account), or accept the glyph.

## N13. RESOLVED 2026-10-06: third-party asset loading is on
Owner (issue #84): third-party asset loading is enabled for the evaluation place, and StudPilot may ask creators to allow it
in their places. The world kit's third-party props can now be vetted and used.
