# Waiting on the owner

Only what needs the owner: an owner-only action from the handoff (X4, X5, X7–X9), money, a legal step, or a console
no token here can reach. Work that does not depend on an item goes on. Done and decided items are removed (see
`OWNER-DECISIONS.md`, D-10 to D-16, 2026-10-05).

## Urgent

### N2. Google and Discord sign-in: one live sign-in with each (after Claude Code switches them on)
Both providers were switched on 2026-10-06 (Supabase reports google: true, discord: true; the app shows the buttons when
they are). Google's consent page loads with our callback and no redirect error; Discord's page renders client-side, so a
redirect error there cannot be ruled out without a person. The privacy policy already covers both "where offered".
Left: sign in once with Google and once with Discord on https://studpilot.app/app/signin and tell Claude Code it worked.

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
- **X8. The hidden test set:** hand it over at M7 only.
- **X9. The Roblox OAuth review:** record the demo video (under one minute; Claude Code writes the script) and
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


## N12 (2026-10-06): one icon of the kit's pack needs an upload: `rocket`
The pack (`packages/blocks/assets/icons.json`, 39 free Creator Store images, style bible S-4) has no free glossy 3D rocket
(searched: rocket icon, rocket icon 3d cartoon, rocket ship icon, rocket icon glossy outline game, simulator rocket icon,
jetpack icon). Roblox's AI generator could make one, but the result is uploaded to the account that runs it, and nothing
goes to the owner's account without a yes. Until then `rocket` shows its glyph. Owner: say yes to one Roblox-AI image
upload (and to which account), or accept the glyph.
