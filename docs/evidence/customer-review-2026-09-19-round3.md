# Customer review — round 3, 2026-09-19

Written by a prospective paying customer's technical advisor. No prior context on this product, no
loyalty to it. Everything below that is stated as fact was measured by me, from outside, tonight.
Where a claim in the repository could not be checked, it is listed as unchecked rather than
converted into a finding.

Surfaces used: `https://apple.moshe-barami111.workers.dev` (public, unauthenticated, via curl), the
same host signed in as the account owner (Chrome), the Roblox public APIs, and the read-only
repository at `/Users/moshe/Desktop/RbxAI`.

Cost incurred: **one** live product request, billed **10 Credits** (visible on the message card at
10:22 PM). Nothing else was sent, purchased, deleted or changed.

---

## 1. Verdict

**No — I would not recommend paying, and the first reason is that you cannot.**

That is not a rhetorical point. `/api/billing/config` returns `{"checkout":false,"purchasable":[]}`
and every purchase surface agrees with it. There is no product on sale. So the real question is
whether this is a thing to *commit to*, and the answer is still no, for one reason that is a defect
and one that is not:

- **It is not ready (defect).** The deployed assistant misrepresents its own safety gate as a
  Roblox setting and invents a Roblox Studio menu path for turning that gate off. I reproduced this
  live tonight, at a cost of 10 Credits. Details in §3, B1. This is the worst category in my brief:
  the product is *dishonest about a limit*, and the limit it lies about is its own.
- **It is not usable (not a defect).** A new customer cannot install the Studio plugin, because
  Roblox removed the Creator Store listing on 19 September 2026 with the reason "Misusing Roblox
  Systems". I verified that independently, with controls (§3, B2). The site is unusually honest
  about this. That is category (b) and I do not hold it against the product — but it means the
  thing being sold cannot currently be delivered to anyone new.

Separating the three things my brief asks me to keep apart, across everything I looked at:

| | count | examples |
|---|---|---|
| **(a) wrong or broken** | 6 | fabricated Studio menu path; stale duplicate deployment; SDKs pointing at the old host; a withdrawn plan still promised in docs; `/status` understating the moderation decision; entry price 2.5× under observed cost |
| **(b) honest about a third-party limit** | many | the whole plugin-availability story, on the hero, `/status`, `/pricing`, `/docs/plugin`, the dashboard and the changelog. Consistently, voluntarily, and with the reason named |
| **(c) dishonest about such a limit** | 1 | B1 — the assistant tells the user that *Apple's own* consent gate is "a Studio-level security setting" and gives a fake menu path to disable it |

One instance of (c) is one too many for a product whose entire pitch is that it works inside
something you own. I would revisit after B1 is fixed.

---

## 2. Method, and what counts as a measurement here

Every check below has a control where one was possible. Two probes returned the same answer for
known-good and known-bad input; both are reported as telling me nothing rather than as findings.

- Roblox listing probe: controls were two genuinely listed plugins and one deliberately bad id.
- Auth-surface comparison across the two live hosts: seven endpoints, both hosts.
- `/v1` error-shape probe: control was a nonexistent path under the same prefix (404 vs 401).
- Live bundle inspection: I downloaded the actual deployed JS/CSS rather than reading source.

---

## 3. Blocking defects, ranked by whether they would stop a purchase

### B1 — The assistant blames Roblox for Apple's own refusal, and invents a Studio menu to disable it

**Severity: blocking. Category (c).** This is the single finding that would stop me.

Setup: Studio paired to the project, edit consent **off**. The product's own web UI states the
correct remedy in that exact state — I read it in the Studio connection dialog:

> "Studio is connected. **Enable edits in the plugin** before asking Apple to change your place."

I then sent one request: *"Create a single Part named ReviewProbe in Workspace. Nothing else."*
The reply, live at 10:22 PM on 2026-09-19, billed 10 Credits, verbatim:

> "The creation of `ReviewProbe` failed with the same "explicit edit consent" restriction as the
> earlier `ConsentProbe`. This is a **Studio-level security setting** that blocks programmatic
> writes to the place file unless the user explicitly enables it.
>
> **What This Means:** You cannot create instances via script in this project until the "Explicit
> Edit Consent" flag is disabled in Studio. This is a safety guard to prevent unintended changes to
> your project.
>
> **Next Steps:** … 2. **Disable Guard (Advanced):** If you want to proceed programmatically, the
> user must: Open the place in Studio. Go to `File > Place Settings > Security`. Uncheck "Require
> explicit edit consent for scripts"."

Four separate falsehoods in one answer:

1. **It is not a Studio-level setting.** It is Apple's own plugin consent gate
   (`apps/apple-plugin/src/init.server.luau:219`, `edits.Active = connected and not connecting`).
   The product attributes its own refusal to a third party. That is precisely the (c) failure.
2. **`File > Place Settings > Security` does not exist** in Roblox Studio.
3. **"Require explicit edit consent for scripts" is not a Roblox setting.** It is a paraphrase of
   Apple's own refusal string, re-presented as somebody else's checkbox.
4. **It advises the user to disable a safety guard** — one that does not exist — instead of naming
   the real action, which is two clicks in the Apple panel and is printed on the adjacent dialog.

This is not a one-off. The stored transcript in the same project, from 9:59 PM, shows a *different*
fabricated path for the same refusal:

> "Check Permissions: Ensure the project allows script-based writes. In Studio, go to
> `File > Project Settings > Security` and verify the "Allow Scripted Updates" setting."

Two runs, two different invented menus, same invented category. A user who follows either one hunts
a menu that isn't there, concludes the product is broken, and never learns that the fix was a
button two inches from the refusal.

The repository knows. `WORKLIST.md` carries it as open item **w34**, and
`apps/apple-plugin/scripts/verify-artifact.py` documents it in a comment headed "A REFUSAL THAT
NAMES NO REMEDY GETS ONE INVENTED FOR IT". Knowing is not fixing: it is live, it is reproducible,
and it charges for the privilege.

**Why this outranks everything else:** the product's pitch is that it acts inside a place you own,
under your control. A system that describes its own guardrail as the platform's, and then coaches
you to switch the platform's guardrail off, has inverted the trust relationship it sells.

---

### B2 — There is nothing to buy, and the capability that would justify buying cannot be obtained

**Severity: blocking commercially. Categories (b) — honest — and therefore not a product defect.**

Two independent facts, both verified:

**Checkout is closed.** Unauthenticated:

```
GET https://apple.moshe-barami111.workers.dev/api/billing/config
{"checkout":false,"purchasable":[],"currency":"USD"}
```

Every published surface agrees. `/pricing`: *"Paid checkout is not open yet; the paid plans below
describe the planned offering."* `/terms` §7: *"Apple collects **no payment** today. Checkout is not
open, so there are no purchases, no subscriptions and therefore no refunds."* The signed-in Plans
page marks Builder and Studio *"Not available yet"*. **This is a clean match between claim and
deployment.** (Source-side, `checkoutConfigured()` in `apps/worker/src/billing.ts:787` also refuses
an `sk_test_` key in production — I read it but could not exercise it; see §8.)

**The plugin is removed by Roblox, not by omission.** I reproduced the repository's probe with my
own controls rather than trusting it:

| asset id | what it is | `toolbox-service/v1/items/details` |
|---|---|---|
| 6415005344 | Rojo 7 — real, listed plugin (control, good) | **200** `"Rojo 7"` |
| 4725618216 | Moon Animator 2 — real, listed plugin (control, good) | **200** `"Moon Animator 2 [sale!]"` |
| 1 | nonexistent (control, bad) | 404 |
| **107230158271368** | **"Apple Studio", Shahar474** | **404** |
| 132128477945417 | "Golem", Herobrine583522 (the predecessor) | 404 |

The probe discriminates: it answers 200 for known-good and 404 for known-bad, so its 404 for Apple
Studio is information. `economy.roblox.com/v2/assets/107230158271368/details` confirms the asset
exists, is named "Apple Studio", type 38 (Plugin), created 2026-09-19T18:13Z — created and removed
the same evening.

**`/docs/plugin` is exemplary about this**, and I want to say so plainly because it is the opposite
of B1:

> "**Public installation is unavailable, and it is a moderation decision.** Roblox removed this
> plugin's Creator Store listing (`107230158271368`) on 19 September 2026, giving the reason
> **"Misusing Roblox Systems"**. The store URL is not a working install path, and the "Distribute on
> Creator Store" setting is locked rather than merely switched off — so this is not a step waiting
> to be taken. An appeal has been sent and is awaiting a decision."

That is category (b) done properly: the limit is named, attributed to the party that imposed it,
not minimised, and no release date is promised. I do not count it as a defect. I do count it as the
reason there is nothing here to buy yet.

**One live inconsistency inside this otherwise-honest story** — `/status` has not caught up with
`/docs/plugin`:

> `/status`, known issue "Public Studio plugin installation is unavailable": "**The previous
> Creator Store listing was removed.** New customers can use chat, but cannot build inside Studio
> without an existing working plugin connection."

`apps/site/src/data/known-issues.ts:43`. Commit `7f77668` identified exactly this wording as wrong
on `/docs/plugin` — "the page called the current listing the previous one" — fixed it there, and
left it standing on `/status`. A reader of `/status` alone is told a *predecessor* was removed and
is never told that the *current* listing is under an active moderation decision. Same sentence, same
error, one page behind. **Category (a), low severity, five-minute fix.**

---

### B3 — A second live copy of the whole product, on the old brand's URL, three days stale — and two shipped SDKs point at it

**Severity: blocking for anyone integrating. Category (a).**

`https://golem.moshe-barami111.workers.dev` is live and serves the entire product.

```
apple.moshe-barami111.workers.dev  /api/health -> buildSha "2c07b64-dirty"   (2026-09-19 21:46)
golem.moshe-barami111.workers.dev  /api/health -> buildSha "6d7a5be-dirty"   (2026-09-16 19:21)
```

45 commits apart. It serves the same marketing pages (`/pricing` is byte-identical, 40,479 bytes —
both workers read the same stored site), the same `/v1` public API, and the same login surface. The
worker code behind it is three days old, and its auth behaves differently in at least one place:

| endpoint | apple host | golem host |
|---|---|---|
| `/api/billing/config` | `200 {"checkout":false,…}` | `401 {"error":"unauthorized"}` |
| `/api/projects`, `/api/me`, `/api/usage`, `/api/assets/search`, `/api/plans` | 401 | 401 |

I want to be exact about what that shows, because "different" is not "weaker". On the six protected
endpoints I could probe unauthenticated, both hosts refuse identically. The only difference I
measured is that the newer build deliberately exempts `/api/billing/config` so the public pricing
page can ask whether checkout is open. **I did not find the old host to be less secure**, and I am
not claiming it is. What I am claiming is that a customer can sign into a three-day-old copy of the
product without any indication that they have.

**The part that makes this a live defect rather than a tidying job:** two of the three shipped
client SDKs still default to that host, while the Luau client and both Studio plugins have already
moved.

```
packages/sdk/src/wire.mjs:59            DEFAULT_BASE_URL = 'https://golem.moshe-barami111.workers.dev'
packages/sdk/python/apple_sdk/client.py:25  DEFAULT_BASE_URL = "https://golem.moshe-barami111.workers.dev"

packages/sdk/luau/AppleClient.luau:28   Client.DEFAULT_API = "https://apple.moshe-barami111.workers.dev"
apps/apple-plugin/src/Bridge.luau:11    APPLE_ORIGIN      = "https://apple.moshe-barami111.workers.dev"
apps/plugin/src/init.server.luau:21     DEFAULT_API       = "https://apple.moshe-barami111.workers.dev"
```

I confirmed the installed plugin binary at `~/Documents/Roblox/Plugins/AppleStudio.rbxm` contains
only `https://apple.moshe-barami111.workers.dev`. So a developer who installs the JavaScript or
Python SDK and writes no configuration silently talks to the stale backend, and it answers.

The repository's rebrand checker exempts the old hostname with the reason *"the deployed worker
hostname; renaming it breaks every client and the plugin"*
(`scripts/check-rebrand.mjs:47`). **That justification is now stale**: no shipped plugin or Luau
client points there. The only clients that do are the two SDKs that should have been moved with them.

---

## 4. Published claims vs deployed behaviour

Checked by measurement, not by reading. Quoted text is the live text.

### Matches — these are correct

| Published claim (where) | Measured |
|---|---|
| `/pricing`: "231 Credits per day · 2,310 a month" for Free | Signed-in `/app/usage`: "Today's Credits **201 of 231**", plan card "2,310 Credits · up to 3 builds a day". Matches |
| `/pricing`: "One build costs about 77 Credits" | 231 ÷ 77 = 3/day, and the app independently renders "up to 3 builds a day" for Free, 5 for Builder (416÷77), 9 for Studio (700÷77), 10 for Enterprise (833÷77). Internally consistent across two independently rendered surfaces |
| `/pricing`: "Paid checkout is not open yet" | `/api/billing/config` → `checkout:false`, `purchasable:[]`. App shows "Not available yet" on Builder and Studio |
| `/terms` §5: "daily Credits quota (currently 231) and a monthly ceiling (2,310) … which on the free tier is 10 days at the full daily rate" | Arithmetic checks; matches the enforcing config |
| `/terms` §7: "Apple collects no payment today" | Matches `checkout:false` |
| Changelog: "Super Agent is no longer offered, and cannot be selected anywhere in the product" | Composer offers Apple / Apple MAX only; no Super Agent anywhere I looked |
| Changelog: "the free tier is 231 Credits a day" (correcting the old 60) | Matches |
| `/docs/plugin`: the moderation refusal, quoted in §3 B2 | Independently reproduced against Roblox's own APIs |

The changelog deserves specific credit: it does not rewrite history. Old entries keep their
original numbers and carry an inline "Since repriced / Since withdrawn / Since narrowed / Since
changed" correction. That is a harder and more honest pattern than quietly editing the past.

### Mismatches

**M1 — `/docs/credits-and-limits` still promises a plan that was withdrawn.**

> "Rate limiting: requests are queued per account. Under heavy load, free-tier requests may briefly
> wait; **Pro (when it ships) queues ahead**."

The changelog on the same site says: *"Since withdrawn: there is no Pro tier. The paid tiers are
Builder and Studio — see Pricing."* Commit `75b0e26` removed a Pro reference from `/terms` §7 and
missed this one. Category (a), low severity.

**M2 — the per-request price table understates real cost by ~2.5×.**

`/pricing` publishes:

| Mode | Cost per request | ≈ requests / free day |
|---|---|---|
| Plan | 2 credits | 115 |
| Agent | 4 credits | 57 |

Observed, on four real requests in one project: **10, 9, 11, 10 Credits**. My own single request —
"create one Part, nothing else", which failed — cost **10**.

The page does disclose the mechanism, and the disclosure is good: *"An Agent request settles against
the work it actually did, so a long build costs more than the entry price above — metered live."*
But the "≈ requests / free day" column is *computed from the entry price*, so it publishes 57 when
the observed rate implies roughly 23. A number in a table reads as an expectation, not as a floor.
Category (a), low severity — it is a presentation choice, not a false statement.

**M3 — `/status` vs `/docs/plugin` on the same moderation decision.** See §3 B2.

**M4 — momentary contradictory Studio state.** On two consecutive page loads I read, in one view:
header "Studio last connected 28 seconds ago" (then 58, then 1 minute — it tracks real time) while
the project rail simultaneously said "**Studio not connected**" and offered a pairing code field.
The state later resolved to connected and the rail updated correctly. I could not determine whether
these are two different scopes (account-level last-contact vs project-level pairing) rendered with
confusingly similar wording, or a genuine lag. **Reported as a wording/clarity problem, not as a
bug**, because I could not distinguish the two.

---

## 5. Real Studio results — are the 2026-09-19 evidence docs supported?

I read the seventeen 2026-09-19 evidence documents and checked the load-bearing ones against the
tree and the filesystem myself.

**There are two different evidentiary cultures in that directory, written on the same day.**

The backend lane fingerprints its inputs, preserves its red runs as files on disk, and repeatedly
refuses to upgrade its own evidence class. `apple-plugin-test-lifecycle-fix-2026-09-19.md` states
the rule outright: *"Local source/tests/build evidence above remains valid, but it must not be
upgraded to native acceptance evidence."* `profile-cross-server-release-*.log` exist as real files,
red and green. That is the standard.

The Studio lane is narrative prose with nothing attached. **I verified this rather than taking the
impression:** the newest image artifact anywhere in `docs/evidence/` dated 09-19 is
`lumen-isles-2026-09-19/independent-paired-edit-consent.png` at **00:18:42**, and the plugin build
those documents describe was installed at **21:51** (`~/Documents/Roblox/Plugins/AppleStudio.rbxm`,
later 22:18). Every 09-19 "observed in Studio" document post-dates every 09-19 image by ~21 hours.
On 2026-09-18 the same capability produced `apple-generation-engine-2026-09-18.json` plus two PNGs,
and that JSON marks itself `"visualVerdict": "unreviewed"`, `"verdictScope": "structural_only"`.
The honesty was there the day before and was dropped.

### Documents that overclaim

**`appleui-observed-in-studio-2026-09-19.md` — the worst, because of what it indicts.**
Its thesis is that thirteen passing Luau tests *"had never seen a pixel"*. It then produces no
pixel. The verdict it offers in place of one is *"It looks like a product. Not a grey slab."* —
an aesthetic judgement with no image behind it, which is exactly the class of claim the document
was written to retire. It also asserts *"What was rendered is byte-identical to what
`install_module: ui_kit` writes"* with no hash, no diff and no byte count. "Byte-identical" is a
checkable word used without the check.
*(To its credit, it discloses loudly that the purchase flow it demonstrates is a local stand-in:
"This is not the product's billing … it proves nothing about Stripe, Credits or apps/worker.")*

**`generation-verified-in-studio-2026-09-19.md` — a failure to observe written up as an observation.**
It opens *"All three were measured"* and its own "Not verified" section retracts one of the three:
*"The service was available every time it was called, so the plugin's `available = false` branch was
read in source and never exercised live."* Those two sentences cannot both stand.
Its most falsifiable claim — *"a textured wooden treasure chest — curved lid, three horizontal
planks, dark metal bands down the corners and a lock plate on the front … visible in the viewport"* —
has no frame. Its evidence is marker strings: `GEN3_OK_Model_desc2__39.6s`,
`GEN_service_true__method_function`, `CONTENT_Model__Model__MeshPart_mesh…`. **I grepped the entire
repository for all four. Every one appears in exactly one file: the document asserting it.** A
self-authored label is not a receipt, and the trailing ellipsis truncates away the MeshId — the one
string that would have let anyone else check.

**`library-delivery-blocked-2026-09-19.md` — now factually false, and unmarked.** Its two structural
claims do not hold against today's tree, and I checked both:

- It says *"`apps/apple-plugin/src/Commands.luau` lists `insert_asset` in `UNSUPPORTED`"*. It does
  not. `Commands.luau:3446` reads `insert_asset = handleInsertAsset,` and `:3467` puts it in
  `MUTATING`. The `UNSUPPORTED` table at `:3452` holds exactly three entries — `run_code`,
  `run_mode`, `inspect_model`.
- It says `verify-artifact.py` *"fails the build on any artifact containing
  `GetService("InsertService")`, in a FORBIDDEN list"*. The opposite is now true:
  `apps/apple-plugin/scripts/verify-artifact.py:49` records that the ban was removed, and
  `LuaSourceContainer` is in **REQUIRED**.
- It cites the file as `scripts/verify-artifact.py`; the path is
  `apps/apple-plugin/scripts/verify-artifact.py`.

Its sibling `library-requires-ownership-2026-09-19.md`, written **eleven minutes later**, says
*"`insert_asset` is implemented, supported and shipped"*. Two evidence files in one directory,
eleven minutes apart, asserting contradictory facts about the same two source files, neither
referencing the other. For a reader deciding whether to trust this directory, that is more corrosive
than either error alone.

**`WORKLIST.md:164` manufactures an artifact that the evidence doc it cites never claimed.** The
worklist entry for w29 says *"The two-step was then clicked and **photographed** at each step."*
`plugin-consent-verified-in-studio-2026-09-19.md` makes no such claim, and no such photograph
exists — the only consent PNG is from 00:10, hours before that build was built. The downstream
summary invented the receipt. This is the mechanism by which an unphotographed observation becomes,
two documents later, a photographed one.

**`withheld-tools-measured-2026-09-19.md`** titles itself *"measured, not counted from a grep"* and
then concedes that the paired-session behaviour it counts was *"read, not exercised"*. Better static
analysis is still static analysis; the contrast in the title is rhetorical. It produced six
diagnostic renders and saved none.

### Documents that hold up

`library-requires-ownership-2026-09-19.md` is the best-designed measurement in the set and I would
hold the rest to it. It establishes that the product can insert **zero** of its 81,648 catalogued
assets, using a positive control — an asset the account *does* own returns OK while a catalogued
free asset returns "User is not authorized" — and says so itself: *"The owned asset is the control,
and it is what makes this a finding rather than a broken probe."* It also names the exact trap this
review is about: *"`PreloadAsync` returns without error, the `Texture` property keeps its value, and
the surface renders blank … Anything that checked 'did the assignment stick' would report success.
Only looking at the pixels says otherwise."* Then it saves no pixels. The concept is fully
understood in this repository; the habit of writing the frame to disk is what went missing.

Also sound: `plugin-store-blocked` (whose toolbox probe I reproduced independently, §3 B2, and which
catches and corrects a prior error of its own), `payments-live` (real Stripe object ids, and it
volunteers *"No human has completed a purchase end to end"* against its own title),
`lora-serving-verified` and `apple-v4-evaluation` (three-control discrimination: base determinism
hash, adapter difference, bogus-adapter rejection — and the v4 doc reports its **0/8 game-logic null
result as loudly as its 62% win**), `worker-backend-final-gate`, `apple-plugin-test-lifecycle-fix`,
`edit-script-source-file-bridge`, `customer-files-focus-continuation` (which states that its only
screenshot shows the *older* build), `sentry-current-route`, `profile-cross-server-release`,
`lumen-isles-game-cleanup`.

**Summary for a buyer:** the claim "verified inside Roblox Studio" in this repository is, on
2026-09-19, backed by narrated prose in the documents whose filenames say "verified-in-studio", and
by real artifacts in the documents that make no Studio claim at all. The one genuine, well-
controlled Studio measurement of the day is the one that reports a *negative* result.

---

## 6. Branding — where "Golem" is still reachable

The rebrand is mostly done, and done thoughtfully: `scripts/check-rebrand.mjs` maintains a closed
exception list where each entry carries a written proof that renaming would break a *persisted*
value (a Roblox attribute in places already built, a live session key, an export format stamp).
That is the right standard. The leaks below are the ones that escape it.

### Reachable by a user, and not on any exception list

**G1 — `gk_live_` / `gk_test_` — "Golem key" — printed by the live public API, unauthenticated.**

```
$ curl https://apple.moshe-barami111.workers.dev/v1/openapi.json
{"error":{"message":"Provide an API key as `Authorization: Bearer gk_live_…`.", …}}
```

Control: `/v1/not-a-real-endpoint` returns 404, so the 401 above is a real authenticated-route
response and not a catch-all. This string is also what every customer reads on screen when they
create a key (`apps/web/src/components/api-keys-panel.tsx:172`), copies into their code, and reads
again in the published OpenAPI spec (`apps/worker/src/public-api.ts:875`,
`bearerFormat: 'gk_live_<id>_<secret>'`). The repository's own backlog confirms the derivation —
`docs/backlog/FEATURES.json:5386` calls them *"gk_live_/gk_test_ **Golem keys**"*.

`check-rebrand.mjs` cannot see it: the checker greps for `golem`, and `gk` is an abbreviation. This
is the blind spot, not a judgement call — and the right fix may well be to *document* it as exempt
(renaming invalidates issued keys) rather than to rename it. Either way it should stop being
invisible.

**G2 — `GLM-XXXXXX` rendered on the public marketing site.** `/changelog`, live:

> "Pairing by short-lived code (`GLM-XXXXXX`, 10-minute expiry) — no tokens to copy around."

`apps/site/src/pages/changelog.astro:157`. Partly mitigated by the adjacent correction — *"Since
changed: codes are six characters with no prefix"* — but the old-brand literal is still on an
unauthenticated page, and it is also factually wrong: `apps/worker/src/do/pairing.ts:31` emits a
bare six-character code.

### Reachable, and knowingly exempted with a written proof

These are on the exception list with reasons I find defensible. Listing them so a buyer knows what
they will see:

- **`X-Golem-*` HTTP headers.** `X-Golem-Export-SHA256` (`apps/worker/src/index.ts:1661`, `:3223` —
  read back by the browser at `apps/web/src/lib/api.ts:1157`), `X-Golem-Usage-Input-Tokens`,
  `X-Golem-Usage-Output-Tokens`, `X-Golem-Usage-Credits`, `X-Golem-Credits-Remaining`
  (`public-api.ts:674-679` — the public API's billing surface, read by third-party developers),
  `X-Golem-Sandbox`, `X-Golem-Role`. Request side: `X-Golem-Token` is the auth header the Studio
  plugin sends on every poll — I found it in the installed binary
  (`~/Documents/Roblox/Plugins/AppleStudio.rbxm` contains `X-Golem-Token`).
- **`golem.v1` and `golem.jwt.<token>` WebSocket subprotocols** — confirmed in the *deployed* bundle
  `/app/assets/index-Wr9i3tiD.js`, visible in DevTools on every live session.
  *Separate observation worth its own line:* putting the session JWT in
  `Sec-WebSocket-Protocol` puts a credential somewhere proxies and access logs routinely record.
  That is a security remark, not a branding one.
- **` ```golem-ui ` markdown fence** — in the deployed bundle
  (`apps/web/src/lib/generative-ui/validate.ts:1007`). I checked whether anything emits it: the
  worker never instructs this fence, so today it is a parser with no producer. If a model ever does
  emit it, the raw label is visible in chat during streaming, before the closing fence lands.
- **`GolemBaseVolume`** — an attribute the generated Luau writes onto Sound instances **inside the
  customer's own place** (`apps/worker/src/sound-design.ts:577`), visible in Studio's Properties →
  Attributes panel. Same for `GolemPalette`, a ServerStorage folder name. Both carry genuine
  persistence proofs on the exempt list; renaming them silently changes the meaning of data already
  in users' places. I agree with the exemption and note it only so nobody is surprised.

### On Roblox's own servers

`economy.roblox.com/v2/assets/132128477945417/details` returns `Name: "Golem"`, type 38 (Plugin),
creator Herobrine583522, created 2026-08-31. The predecessor listing is still named "Golem" on
Roblox's public API and is reachable by asset id. Not under the product's control to rename after
removal, but it is a place the old name is still visible.

### Old-host and env-var residue

`GOLEM_API_URL` / `GOLEM_TOKEN` remain as compatibility fallbacks in the shipped CLI
(`packages/sdk/bin/apple.mjs:53-54`); `APPLE_*` takes precedence and the help text names only the
new ones. Benign. The two SDK default hosts are not — see §3 B3.

`apps/worker/src/assets.ts:1412` carries a user-facing refusal message still reading *"**Golem**
never auto-inserts an asset containing code"*. I traced its renderer: `brokerAsset` has no caller in
the worker, and the live path drops the message. Latent, not currently shown.

---

## 7. What is genuinely good

I am obliged to be hard on this product and it would be dishonest not to say what works.

- **The disclosure culture on the public site is better than most funded companies manage.** Ten
  separate surfaces say the Studio plugin cannot be installed, including the hero of the landing
  page — *"Early preview. Public Studio installation is not available yet."* — which is the last
  place a company that wanted sign-ups would put it. `/docs/plugin` names the moderation reason
  verbatim rather than hiding behind "temporarily unavailable". `/pricing` volunteers that the free
  monthly ceiling *"is the one that bites"* and does the arithmetic against itself: *"231 a day
  against 2,310 a month is 10 full days."* `/terms` §7 explains that publishing a price is not an
  offer to sell.
- **The changelog annotates rather than rewrites.** Withdrawn features keep their original entries
  with a correction attached. That is the harder choice and the right one.
- **The pricing arithmetic is self-consistent across independently rendered surfaces** — marketing
  page, terms, and the signed-in plans table all derive from one shared configuration and agree.
- **The rebrand exception list requires a written persistence proof per entry.** Most teams keep a
  list of things they gave up on; this one keeps a list of things it deliberately kept, each with
  the reason renaming would corrupt user data.
- **Parts of the evidence directory are exceptionally rigorous** — controls with positive and
  negative arms, preserved red runs, null results reported at the same volume as wins, and at least
  one document that explicitly forbids its own evidence from being upgraded. The `apple-v4`
  evaluation reporting "game logic 0/8 → 0/8, training bought nothing there" alongside its headline
  win is the kind of thing that makes me trust the numbers next to it.
- **The app itself is well made.** Fast, quiet, coherent dark UI, no dark patterns, a visible
  running credit cost on every message, and a footer on the composer reading *"Apple can get things
  wrong. Check what it changed before you publish."*
- **The plugin's safety posture is real.** It refuses `run_code`, `run_mode` and `inspect_model` by
  name (`Commands.luau:3452`), it refuses to write source containing `loadstring`/`getfenv`/
  `HttpService` and friends, and the build verifier *requires* the code-scanning guard rather than
  merely forbidding the loader — a stronger invariant, since "no loader" is satisfied by a plugin
  that does nothing.

The irony of B1 is that this product is honest everywhere a human wrote the words, and dishonest in
the one place a model writes them unsupervised.

---

## 8. Findings I withdrew

Recorded because withdrawing them is part of the method.

**W1 — "The app ships telemetry to Sentry that the privacy policy does not disclose." WITHDRAWN.**
I measured 15 `POST` requests to `o999875.ingest.sentry.io` from the app tab, and `/privacy` says
*"Who processes your data — **Everyone who receives any of it because of something Apple does**"*
and then lists only Cloudflare, Supabase, Stripe, Discord and Roblox. That looked like a clean
published-claim violation. It is not: **the traffic is not the app's.** The deployed bundle contains
no Sentry DSN, no envelope endpoint and no `installSentry` call — I grepped all four live chunks —
and the requests carry `sentry_client=sentry.javascript.react/7.120.0`, whereas the app's own
module would send `apple-web/1.0` (`apps/web/src/lib/sentry.ts:41`). The telemetry is my own browser
tooling, attributed to the tab. **My measurement was the artifact.** The privacy page's processor
list is, as far as I can tell, accurate.
*(A much smaller true fact survives: `VITE_SENTRY_DSN` is unset in the production build, so browser
crashes are not reported anywhere. Nothing published claims otherwise, so this is a gap, not a
mismatch.)*

**W2 — "The live site is five commits behind the repository's own fixes." WITHDRAWN.**
`/api/health` reports `buildSha 2c07b64-dirty`, five commits behind `HEAD`, and those five commits
touch `pricing.astro`, `terms.astro`, `changelog.astro` and `docs/plugin.astro`. I was about to
report the site as stale. I checked the live pages instead of inferring: `/docs/plugin` carries the
`7f77668` moderation wording and `/pricing` carries the `75b0e26` quality-gated/build-blind neuron
text. **The static site and the worker deploy separately; the site is current.** The buildSha lag is
real but affects only worker code, and the two worker changes in that window
(`asset-library.ts` provenance origin, `pricing.ts` constant re-export) have no customer-visible
effect I could find.

**W3 — "The `X-Golem-Token` header requirement is verifiable from outside." NOT A FINDING.**
I probed `/api/studio/poll` three ways: no header, a bogus value in `X-Golem-Token`, and the same
bogus value in `X-Apple-Token`. All three returned the identical `{"error":"invalid token"}`. **The
probe does not discriminate and therefore told me nothing.** My statement in §6 that the live header
is `X-Golem-Token` rests on the worker source (`index.ts:2295`) and on finding the literal string in
the installed plugin binary — not on that probe.

---

## 9. Could not check

- **Whether `insert_asset` actually succeeds through the shipped plugin for an asset the user owns.**
  The one "OK" result in the repository's evidence came from `InsertService:LoadAsset` typed into
  Studio's command bar, not from the shipped tool path, and the document does not flag that
  substitution. I had no owned-asset test case and did not want to spend the credits. The negative
  half — that none of the 81,648 catalogued assets can be loaded — is well controlled and I accept it.
- **Whether the asset catalogue's "insertable only" filter returns anything.** The composer's Assets
  panel did not open for me and the search endpoint needs an authenticated call I chose not to make.
- **Whether `checkoutConfigured()` really refuses an `sk_test_` key in production.** I read the
  guard (`billing.ts:787`) and its rationale, and I measured `checkout:false` live — but there is no
  way from outside to flip the flag and confirm the refusal fires. A test that cannot be made to
  fail has not been passed.
- **Any visual quality claim about generated Roblox content.** No 09-19 frame exists to look at, and
  I did not have Studio. The product's own critique of its own output — *"Score 1/10, fails the
  quality gate … the current state is programmer art, not a built object"* — is the only visual
  judgement in this review, and it is the product's, not mine.
- **Whether the Roblox appeal (`3JYeMPD1jVZIh8wYJV521ooFrHw`, decision estimated within 5 business
  days) succeeds.** Unknowable today. It is the single fact that most changes this verdict.
- **Load, latency and reliability under real use.** One request is not a performance sample.
- **Whether the golem-host duplicate holds separate user data** or shares storage with the apple
  host. Both reject unauthenticated reads, correctly, so I could not tell.

---

## 10. What would change my answer

1. **Fix B1.** Map every plugin refusal to a true, product-owned remedy, and stop the model
   inventing Roblox menus. The correct text already exists in the product's own Studio dialog. This
   is the one that moves my verdict from "no" to "conditional yes".
2. **Retire or redirect `golem.moshe-barami111.workers.dev`,** and point the JS and Python SDKs at
   the same host the plugins already use.
3. **Stop shipping "verified in Studio" without an artifact.** The standard is already written down
   inside this repository, in `apple-plugin-test-lifecycle-fix-2026-09-19.md`. Apply it to the lane
   whose filenames make the strongest claims. Mark `library-delivery-blocked-2026-09-19.md`
   superseded, and remove the invented photograph from `WORKLIST.md:164`.
4. **The `Pro (when it ships)` line on `/docs/credits-and-limits`, and the `/status` wording.** Two
   small copy fixes that cost nothing and remove two live contradictions.
5. **Then the plugin.** Until Roblox restores distribution, there is no product to sell to anyone
   new — and that part is not the product's fault, which is why it is fifth on this list rather than
   first.
