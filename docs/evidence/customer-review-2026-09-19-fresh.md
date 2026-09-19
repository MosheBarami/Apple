# Customer review — Apple, 19 Sept 2026

A prospective buyer's review. I had no prior knowledge of how this was built. I read the deployed
site, probed the public API, and checked every number the site asserts against the repository at
`/Users/moshe/Desktop/RbxAI`. I edited nothing and committed nothing.

**Method note on epistemics.** Everything under "Observed" I did myself and can point at a URL or a
`file:line`. Everything under "Inferred" is a conclusion I drew and is labelled as such. Section 6
lists what I could not establish either way, and why. I have not marked anything a pass or a fail
that I did not actually test.

---

## 1. Verdict

**No — not yet, and not at any price.** I would create a free account out of curiosity. I would not
put a card down, and if checkout were open today I would consider the site to have misled me into
doing so.

**The single thing most in the way is not the missing plugin. It is that the site cannot keep one
story about what it sells.**

The plugin being unavailable is survivable — a beta can say "the core feature is not installable
yet" and keep its credibility, and on four pages this product says exactly that, well. What is not
survivable is that the same site, at the same moment, tells me:

- *"Every paid plan below can be bought now"* (`/pricing`, lede)
- *"Paid checkout is not open yet"* (`/docs/modes`)
- *"Apple v1 collects no payment. There are no purchases, no subscriptions"* (`/terms`, §7)
- `{"checkout":false,"purchasable":[]}` (`/api/billing/config`)

...and that the free daily allowance is simultaneously **231** (pricing), **80** (Terms, the binding
document) and **60** (changelog).

I cannot evaluate an offer I cannot read. Every honest page on this site is undermined by the
dishonest ones, because as a stranger I have no way to tell which kind I am looking at. The product
has clearly had real care spent on truthfulness — the status page and the plugin docs are better
than most funded companies ship — and that care is being destroyed by four or five sentences that
were derived once and then left behind by a change somewhere else.

**What would flip me:** make the pricing page, the Terms and the changelog agree with
`/api/billing/config`, and put one screenshot of the actual product on the landing page. That is a
day of work and it moves this from "cannot buy" to "worth trying".

---

## 2. Blocking defects

Ranked by what would actually stop a purchase.

### B1 — The pricing page says you can buy. Everything else says you cannot. (highest severity)

**What I did.** Read `https://apple.moshe-barami111.workers.dev/pricing` end to end, expanded the
FAQ, then called the API the page is built from.

**What I expected.** One answer to "can I subscribe?", matching the API.

**What happened.** Four claims on one page, contradicting each other, and contradicting the service.

*Says yes:*
- Lede: **"Every paid plan below can be bought now. Cancel from your own account page at any time."**
- FAQ "Can I subscribe now?" → **"Yes. Builder and Studio can be bought now, and your account's
  Plans & Credits page is where a subscription starts, changes or is cancelled."**
- Plan cards render active CTAs — **"Choose Builder"**, **"Choose Studio"** — linking to
  `/app/usage?plan=builder|studio`.
- Comparison table column headers read `FREE | BUILDER | STUDIO | ENTERPRISE (PLANNED)`. Only
  Enterprise is marked planned, so Builder and Studio read as live products.

*Says no, on the same page:*
- Under the plan cards: "Free limits apply now; **paid prices and limits describe the planned
  offering** and may change before checkout opens."
- Under the table: "Free access is available now; **paid tiers and Apple MAX subscriptions are not
  yet available to purchase.**"

*Says no, elsewhere:*
- `GET /api/billing/config` → `{"checkout":false,"purchasable":[],"currency":"USD"}` (observed, 200 OK)
- `/docs/modes`: "Paid checkout is not open in the current preview."
- `/terms` §7: "Apple v1 collects no payment. There are no purchases, no subscriptions and therefore
  no refunds — there is nothing to refund."

**Where, and why it is structural rather than a typo.** `apps/site/src/pages/pricing.astro:48`
probes `/api/billing/config` **at build time** and branches on the answer. Four surfaces are derived
from it — the lede (`:169`), the FAQ answer (`:150`), the CTA (`:227`) and the table header
(`:285`). Two more are **hardcoded prose that always says "planned"**: `:238` and `:327–328`.

That means the page is *guaranteed* to contradict itself whenever the probe returns
`checkout: true`, which is the state the deployed build is in. The derivation was applied to four
places and missed two. The mechanism is good and the comment at `:33–41` explains it well — it just
is not finished.

**Second, independent fault in the same defect:** the deployed page was built when the API said
`checkout: true`; the API now says `false`. Nothing invalidates the static page when the worker's
billing environment changes, so the page and the service it sells drift apart silently. The comment
at `:41–42` claims "a deploy is the moment the answer can change, and every deploy re-asks" — true,
but the worker can change without a site deploy, and it has.

**Why this blocks.** This is the page that takes money. A vendor that is wrong about whether it can
charge me is a vendor I cannot model. And the failure is in the *optimistic* direction on the
surfaces a buyer reads first, and the *pessimistic* direction in the fine print — which is the
shape of a dark pattern even when nobody intended one.

---

### B2 — The signup page drops the caveat every other page carries, at the exact moment of conversion

**What I did.** Went to `https://apple.moshe-barami111.workers.dev/app/signup` — the last screen
before handing over an email and a password.

**What I expected.** The same "Studio installation is unavailable" notice that the landing page,
`/status`, `/docs`, `/docs/plugin` and `/docs/getting-started` all carry.

**What happened.** No caveat. Two affirmative claims instead:

- **"Free to start. No card, no Studio setup beyond one plugin."**
- **"Apple reads your project in Studio and takes a checkpoint before it touches anything, then
  writes the scripts and places the parts. Every step is named while it happens, and you can stop it
  mid-run."**

"No Studio setup beyond one plugin" tells me the plugin is a thing I can get. `/status` says:
*"Public Studio plugin installation is unavailable — OPEN SINCE 1 SEPT 2026 … There is no public
installation workaround or confirmed release date."* The second sentence is in the present tense
about a capability I cannot obtain.

`/app/login` carries the identical block. Both pages are served from
`/app/assets/index-BTuSnyDl.js`.

**Why this blocks.** Every page where the caveat costs nothing has it. The one page where it costs a
signup does not. Whether or not that was deliberate, it is what a buyer sees, and it is the exact
pattern that makes the rest of the site's honesty unbelievable.

---

### B3 — Three different free-tier quotas published simultaneously, and the wrong one is in the contract

**What I did.** Cross-read the quota figure on every page that states it.

**What I expected.** One number.

**What happened.** Three, differing by up to 3.85×:

| Surface | Free credits/day | Source |
|---|---|---|
| `/pricing`, `/docs/credits-and-limits`, `/docs/getting-started` | **231** | derived from `PLAN_LIMITS` |
| `/terms` §5 — *"The free tier includes a fixed daily Credits quota (currently 80)"* | **80** | `apps/site/src/pages/terms.astro:64` (hardcoded) |
| `/changelog` — *"Free tier: 60 Credits per day, hard quota, resets daily"* | **60** | `apps/site/src/pages/changelog.astro:169` (hardcoded) |

**Verified against the product:** `packages/shared/src/index.ts:1687` —
`free: { creditsPerDay: 231, creditsPerMonth: 2_310 }`. So **231 is correct** and the Terms and the
changelog are both wrong.

**The repo already knows.** `apps/site/src/pages/pricing.astro:79`: *"It was typed — 30 / 15 / up to
6 — against a free tier that granted 60 Credits a day. The repricing took free to 231 and those
three numbers stayed exactly where they were."* The fix was applied to the pricing page's
derivations and not to the two pages that hardcode the quota.

**Why this blocks.** §5 of the Terms of Service is the document that binds me. A contract that
states my entitlement at roughly a third of what the sales page promises is not a cosmetic defect —
it is the version a vendor could point at later. I would not sign it.

---

### B4 — The plugin docs promise a capability the shipping plugin refuses by name

**What I did.** Read `/docs/plugin`'s "What it can and cannot do" list, then read the plugin source.

**What I expected.** The "Can:" list to describe the build that ships.

**What happened.** `/docs/plugin` states under **Can:** *"read and edit scripts, create, move and
delete instances, set properties, snapshot the instance tree, **start and stop run mode**, read
output logs, move the camera."* The same claim appears at the top of the page: the plugin *"runs
your game and reads the output."*

`apps/apple-plugin/src/Commands.luau:3438–3442` declares an `UNSUPPORTED` table:

```
run_code    = "run_code is intentionally unavailable in this readable plugin: …"
run_mode    = "run_mode is not supported by this independent Apple plugin build; start and stop tests in Studio"
inspect_model = "inspect_model is unavailable in this build because the verified model-quality gate is not present"
```

`docs/PLUGIN-RELEASE.md:49–54` records the downstream cost: withholding `run_mode` withholds
`run_and_check`, and withholding `run_code` withholds ten further tools (`run_luau`, `run_spec`,
`audit_build`, `check_composition`, `set_mood`, `add_effect`, `remove_effect`, `design_sound`,
`assign_sounds`).

Four of the five doc claims — read/edit scripts, create instances, snapshot, undo waypoint — **are**
implemented in that file. The fifth is refused.

**Why this blocks.** "It runs your game and tells you what broke" is the difference between a code
generator and a collaborator, and it is the thing the landing page's third pillar ("See what
happens", "test it in Studio") is selling. Advertising a capability the artifact refuses in a string
literal is the most concrete false claim on the site.

---

## 3. Serious but not blocking

### S1 — Golem branding is still shipped in the active product, including a live duplicate deployment

The owner asked for every instance with its URL. These are the ones a customer can reach.

**a) `https://golem.moshe-barami111.workers.dev/` — the entire product is still served from the
Golem-named domain.** Observed: `/`, `/pricing`, `/docs`, `/status`, `/app`, `/app/signup` and
`/plugin.rbxm` all return 200. It serves the same SPA bundle (`assets/index-BTuSnyDl.js`) and the
same page titles. It is a **different, older worker**: `/api/health` returns
`buildSha: "6d7a5be-dirty"` against Apple's `"6437a7b-dirty"`, and its `/api/billing/config` returns
**401** where Apple's returns **200** — so anyone who lands there gets an app whose billing surface
is subtly broken. Its `robots.txt` is `Allow: /` with the sitemap pointed at the Apple domain, so it
is indexable and is a duplicate of the canonical site. This is the largest instance by far: the
product's *address* is still Golem.

**b) `https://apple.moshe-barami111.workers.dev/plugin.rbxm` — 200 OK, 18,882 bytes,
`application/octet-stream`.** Not linked from anywhere I could find, but publicly served from the
Apple domain at a guessable path. Extracted strings:

```
-- Executes StudioOps from the Golem agent. Mutating ops are wrapped in…
in @golem/
GolemPlugin
-- Golem for Studio
GOLEM
https://g…          (truncated by LZ4 framing; the origin it calls)
VERSION = "0.1.0"
```

`README.md` says this path *"is retired and is no longer a supported install path"* — it is still
being served, as a Golem-branded, Golem-pointed v0.1.0 binary, from both domains.

**c) `/app/assets/index-BTuSnyDl.js` — five occurrences in the shipped customer bundle.** All
protocol-level, all visible to anyone who opens DevTools:
- Response header name **`X-Golem-Export-SHA256`**, read on the export download path.
- WebSocket subprotocols **`golem.v1`** and **`golem.jwt.<token>`**, sent on every workspace
  connection — these appear in the Network tab's `Sec-WebSocket-Protocol` on every session.
- The fenced-code language tag **` ```golem-ui `**, parsed by
  `apps/web/src/lib/generative-ui/validate.ts`. *Inferred:* if the model emits a malformed block the
  fence is not stripped, and the literal string `golem-ui` renders into the customer's chat. I could
  not reach the chat to confirm this.

**d) Source-level, not customer-visible, but it is the cause.** The shared package is literally
named `@golem/shared` (`packages/shared/package.json:2`) and imported across `apps/worker/src`.
`apps/worker/src/asset-library.ts:685` sets
`const GOLEM_ORIGIN = 'https://golem.moshe-barami111.workers.dev'` and writes it as `sourceUrl` and
`licenceUrl` into provenance records (`:705`, `:707`) — so *Inferred:* a provenance or credits export
would attribute Apple's own generated assets to the Golem URL.
`apps/worker/src/memory-store.ts:432` exports `LEGACY_EXPORT_FORMATS = ['golem.memory.v1']`.
`README.md:1` is `# Golem` and its "Live" link is the Golem URL.

The **HTML pages are clean**: I grepped `/`, `/pricing`, `/docs`, `/status`, `/app`, `/terms`,
`/privacy`, `/changelog` for `golem` case-insensitively and got zero hits on all eight. The visible
rename is done. The plumbing is not.

---

### S2 — The changelog publishes an eval score as a quality claim that the repo's own research calls noise

**Observed on `/changelog`:** *"Scored **98.9** on the Roblox eval suite against **96.8** for the
model it replaced"* and *"A full Agent build fell from **$0.0139 to $0.0056** — 2.5× cheaper for the
same work, on a model that scores higher."*

Both numbers are real and dated — `docs/evals/RESULTS.md:16` (`glm-final | stone | … | 98.9`) and
`:20` (`gptoss-rebaseline | 96.8`). Nothing is fabricated. But every frame around them is wrong now:

1. **The 98.9 model serves neither mode a customer can select.** `apps/worker/src/gateway.ts:87,92,93`
   is today's routing: Apple (`clay`) → `@cf/qwen/qwen3-30b-a3b-fp8`; Apple MAX (`stone`, `rune`) →
   `@cf/zai-org/glm-4.7-flash`. `glm-5.3-flash` — the model that scored 98.9 — survives only on the
   `vision` lane (`:98`).
2. **Today's Agent model has never been evaluated.** I read the full results table
   (`docs/evals/RESULTS.md:8–24`). There is no `glm-4.7` row. None.
3. **The repo says the spread is inside the noise floor.** `docs/research/hf-specialists.md:11`:
   *"Our eval is saturated and blind. … The 2.1-point spread is smaller than run-to-run variance on
   the same model (`glm-prod` 97.4% vs `glm-final` 98.9% = 1.5 points). No model swap can be
   demonstrated to help, because the instrument has no resolution left."*
4. **And blind to the thing that matters.** `:12`: *"The eval has zero visual categories. All 8 task
   files are code/API/tooling. Golem scores 98.9% while producing scenes the owner rejected. The
   defect is on an unmeasured axis."* `docs/DECISIONS.md:107–108` names the scene: *"a flat grey
   slab, four primitive poles, a trophy made of three stacked boxes."*
5. **The suite is retired.** `docs/evals/FINDINGS.md:3–7`: *"The suite these numbers came from no
   longer exists in this form. … A future overall score is not comparable to the 98.9% below."*
6. **The cost number went the other way.** `docs/COST-MODEL.md:77–79`: *"Cost per quality-gated
   build: ~16 steps at ~145 neurons plus 1–2 critiques ≈ **2,300 neurons ($0.025)**, against 511
   ($0.0056) for the old build-blind path."* So a build today costs about **4.5× the $0.0056 the
   changelog celebrates**, and about **1.8× the $0.0139 it says the cost fell from**.

The changelog's own framing — "chosen by the eval suite rather than by taste" — is doing work the
suite cannot carry, by the repo's own assessment.

*Not blocking* only because a buyer is unlikely to act on a changelog benchmark. It is serious
because it is the one place the product makes a measurable quality claim, and the measurement does
not support it.

---

### S3 — The changelog prices a plan that does not exist, using a correction mechanism it has

**Observed on `/changelog`:** *"Pro (400 Credits/day, priority queue, extended checkpoints) opens as
a waitlist."* There is no Pro plan and no waitlist anywhere else on the site — the tiers are Free,
Builder, Studio and Enterprise. `/terms` §7 repeats the ghost: *"The Pro plan exists only as a
waitlist."*

What makes this a defect rather than an oversight: **the page already has the fix pattern.** Two
paragraphs above, the withdrawn Super Agent mode carries an inline correction — *"Since withdrawn:
Super Agent is no longer offered, and cannot be selected anywhere in the product. See Modes for what
you can pick today."* That is exactly right, and it was applied to one stale entry and not to the
credits figure (B3) or to Pro.

---

### S4 — `GLM-XXXXXX` is published as the pairing-code format, and it is wrong

**Observed on `/changelog`:** *"Pairing by short-lived code (`GLM-XXXXXX`, 10-minute expiry)"* —
`apps/site/src/pages/changelog.astro:149`.

**Observed on `/docs/connect` and `/docs/getting-started`:** *"You get a six-character code — something
like `K7M3QP`"* — `docs/connect.astro:35`, `docs/getting-started.astro:57`.

**Ground truth:** `apps/worker/src/do/pairing.ts:13,31` —
`ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'`, `newPairingCode(length = 6)`. A bare six characters.
No prefix, and `L` and `O` are excluded as confusable, so `GLM-` could never even be a valid stem.

The docs are right; the changelog is wrong. `GLM` is the inference model's name (GLM-5.3-flash)
leaking into customer-facing copy as a credential format — which is both a factual error and a small
Golem-adjacent tell.

*Aside, genuinely good:* the comment block at `pairing.ts:16–29` documents a measured modulo-bias fix
(13.5% spread over 2M bytes, ~0.75 bits) and states the effect is small before fixing it anyway,
because `/api/studio/claim` is unauthenticated. That is the right instinct, written down.

---

### S5 — `/docs/billing` describes a fully operating Stripe lifecycle with no caveat

**Observed.** The page explains payment-failure retries, where invoices and PDFs live, cancelling
mid-period and keeping the allowance, moving between paid tiers *"in the portal, not through a new
checkout, in both directions"*, and what to do if the webhook is slow. It reads as a system that has
processed payments.

Nothing on the page says checkout has never opened. Read after the `/pricing` lede, it is strongly
corroborating evidence that I can buy — which compounds B1 rather than sitting beside it.

*Fair to the product:* `docs/evidence/payments-live-2026-09-19.md` shows the billing system is
genuinely built, keyed against real Stripe, and was **deliberately switched back off** because
test-mode keys in production would have sold Studio to anyone who knows `4242 4242 4242 4242`. The
guard is `apps/worker/src/billing.ts:787–796`. That decision is correct and to the author's credit.
The defect is that three customer-facing pages never learned about it.

---

### S6 — On a phone, the plan comparison table shows labels or values, never both

**What I did.** `resize_window` preset mobile (375×812), loaded `/pricing`, scrolled to "What each
plan includes", screenshotted, then scrolled the table right and screenshotted again.

**What happened.** The table is 1,067px wide inside a `div.table-scroll` of 335px
(`overflow-x: auto` — measured). It does scroll, so this is not a clipping bug. But the row-header
column is **not sticky**: scrolling right to reach FREE / BUILDER / STUDIO scrolls the capability
names off the left edge. I observed a column reading `— / ✓ / Free forever / $12 a month / 231 / 416
/ 2,310 / 12,600 / About 30 / About 16…` with no row labels visible at all.

Before scrolling, the values are entirely off-screen and the only visible hint that more exists is
sub-label text truncated mid-word — `"MODEL ACCESS IS SEPARATE FROM THE WORK"`, `"THE HARD DAILY
CEILING. IT RESETS AT M"`, `"PLAN AND AGENT. NEITHER IS HELD BACK F"`. There is no scroll affordance.

The page's own lede argues this table exists because *"a capability missing from a list of bullets is
indistinguishable from one nobody mentioned."* On a phone it achieves exactly that.

---

### S7 — Two different logos, one of them twice on the same screen

**Observed at `/app/login` and `/app/signup`.** Top-left: a **3D wireframe cube** beside the word
"Apple". Four lines below, in the same viewport: the marketing site's **angular mark** beside
"Apple — Limited free access" and again beside "Apple MAX — For paid subscribers". The marketing site
and the favicon use only the angular mark.

Also: "MAX" renders as a **pink/magenta gradient** in the app and **green** on the landing page
("Go further with MAX").

Screenshotted. Two marks and two accent colours in a product whose entire visual pitch is restraint.

---

### S8 — No Content-Security-Policy and no Strict-Transport-Security

**What I did.** `curl -D- -o /dev/null` against `/`, `/app` and `/api/health`.

**What I got.** `x-content-type-options: nosniff`, `x-frame-options: DENY`,
`referrer-policy: strict-origin-when-cross-origin`, `cache-control: public, max-age=60`.

**What was absent from all three.** `content-security-policy`, `strict-transport-security`.

This is a product that takes an email and a password, holds the source of my game, and optionally
holds a Roblox Open Cloud key. The three headers present are the easy ones; the two missing ones are
the ones that matter for an app with a login form.

---

### S9 — Production is running a dirty build

`GET /api/health` → `{"ok":true,"version":"0.1.0","buildSha":"6437a7b-dirty","time":"…"}`.
The Golem deployment reports `"6d7a5be-dirty"`.

`-dirty` means the deployed artifact was built from a working tree with uncommitted changes, so what
is serving customers cannot be reproduced from any commit. Invisible to a buyer; a meaningful signal
to anyone judging whether this vendor can ship a fix and prove they shipped it.

---

### S10 — The site never once shows me the product

I counted `<img>` elements: **zero on `/`** and **zero on `/pricing`**. No screenshot, no recording,
no example output, no before/after anywhere in the marketing site. The landing page is four screens
of typography and then "Create an account".

For a product whose entire value proposition is *what it builds*, and whose own repo records the
owner rejecting generated scenes on sight, asking for a signup before showing a single pixel is the
biggest unforced conversion problem here. It also means I have no way to calibrate the quality claim
in S2 for myself.

---

### S11 — Latent: the plugin docs will publish the wrong asset id on the next deploy

**Observed live:** `/docs/plugin` currently renders *"Roblox removed the previous plugin listing
(`132128477945417`)"* — which is **correct**; `packages/shared/src/index.ts:1576` confirms
`132128477945417` is the removed `Golem` asset.

**In source:** `apps/site/src/pages/docs/plugin.astro:10` imports `STUDIO_PLUGIN_ASSET_ID as
ASSET_ID` and `:50` renders `{ASSET_ID}` into that sentence.
`packages/shared/src/index.ts:1586` sets `STUDIO_PLUGIN_ASSET_ID = '107230158271368'` — the **current**
Apple Studio asset.

So the deployed page is right only because it is stale. The next site deploy will publish
*"Roblox removed the previous plugin listing (107230158271368)"* — telling customers that the asset
the product is trying to ship was removed by Roblox. Not a defect today; a defect on the next
`node infra/deploy-static.mjs`.

---

### S12 — Minor, observed

- `/terms` says Apple is *"operated by Apple Labs"*; `/privacy` says *"built and operated by Apple"*.
  Two entity names in two legal documents.
- `/changelog` dates v0.2 as `2026-08-30` and v0.1 as just `2026`.
- `/legal` returns 404. Nothing links to it (the footer links `/privacy` and `/terms` directly), so
  it is a guessable dead path rather than a broken link. `/sitemap.xml` 404s but `/sitemap-index.xml`
  is 200 and `robots.txt` correctly points at the latter — not a defect.
- The `/pricing` table quotes **"Agent — 4 credits — Cost per request"**. `packages/shared/src/index.ts:1413`
  gives `stone: typicalCredits: '4-18'`, and `pricing.astro:112–115` takes `.split('-')[0]`. There is
  a footnote disclosing that a build settles higher, so this is disclosed — but a column headed "cost
  per request" showing the floor of a 4.5× range will be read as a price.
- *Inferred, and I am not a lawyer:* the product is named **Apple**, operated by **Apple Labs**, in
  the software-tools market. The footer carefully disclaims Roblox Corporation and says nothing about
  the other company. As a buyer deciding whether to build a workflow on this, that is a reason to
  hesitate independent of any defect above.

---

## 4. Honesty audit — claims vs what the evidence supports

| # | Claim, as published | Where | What the evidence establishes | Verdict |
|---|---|---|---|---|
| 1 | "Every paid plan below can be bought now" | `/pricing` lede | `/api/billing/config` → `checkout:false, purchasable:[]`. `/terms` §7: "Apple v1 collects no payment." `billing.ts:787–796` disables checkout on test keys in production. | **False** |
| 2 | "Can I subscribe now? **Yes.** Builder and Studio can be bought now" | `/pricing` FAQ | Same as above. | **False** |
| 3 | "paid tiers … are not yet available to purchase" | `/pricing` table caption | Matches the API. | **True** (and contradicts 1 and 2 on the same page) |
| 4 | "No card, no Studio setup beyond one plugin" | `/app/signup` | No public install path exists; `/status` open since 1 Sept 2026, no date. | **Misleading** |
| 5 | "The free tier includes a fixed daily Credits quota (currently 80)" | `/terms` §5 | `PLAN_LIMITS.free.creditsPerDay = 231` (`shared/index.ts:1687`). | **False** (in the binding document) |
| 6 | "Free tier: 60 Credits per day" | `/changelog` | Same. | **False** |
| 7 | Free 231/day · 2,310/mo; Builder 416 · 12,600; Studio 700 · 21,000 | `/pricing`, `/docs/credits-and-limits` | Exact match, `shared/index.ts:1687–1689`; `priceUsdMonthly` 12 and 40 at `:1784`, `:1791`. Page derives rather than restates. | **True** |
| 8 | "One build costs about 77 Credits" | `/pricing` | `CREDITS_PER_BUILD = 77` (`:1851`), independently derived server-side as `ceil(2300/30)` (`worker/src/pricing.ts:101,114`) against the measured 2,300-neuron build. | **True, and cross-checked** |
| 9 | Plugin "runs your game and reads the output"; **Can:** "start and stop run mode" | `/docs/plugin` | `Commands.luau:3440` — `run_mode` is in `UNSUPPORTED`. `PLUGIN-RELEASE.md:49–54` — withholds `run_and_check` plus ten more tools. | **False** |
| 10 | Plugin can read/edit scripts, create instances, checkpoint, undo waypoint | `/docs/plugin` | Implemented in `Commands.luau` (`MUTATING` table, `:3453+`). **Supported in source; not demonstrated end to end by the shipping build.** | **Supported in code, unproven in use** |
| 11 | "Public installation is unavailable … a replacement is being tested locally" | `/docs/plugin`, `/status` | `STUDIO_PLUGIN_STORE_LIVE = false` (`:1638`). True. But `docs/evidence/plugin-store-blocked-2026-09-19.md:7,59` says the distribution toggle **is already on** and *"Roblox has made a moderation decision against this asset"* — a refusal, not a pending step. And per `apple-plugin-test-lifecycle-fix-2026-09-19.md:89–94` the replacement build was never installed, so "tested locally" is true of the source, not the artifact. | **True but materially understated** |
| 12 | "Scored 98.9 on the Roblox eval suite against 96.8" | `/changelog` | Numbers real (`RESULTS.md:16,20`). But that model serves neither selectable mode (`gateway.ts:87,92,93,98`); today's Agent model has **no row** in the results table; `hf-specialists.md:11` calls the 2.1-pt spread smaller than the 1.5-pt run-to-run variance; `:12` says the eval has zero visual categories; `FINDINGS.md:3–7` says the suite is retired and non-comparable. | **Sourced but materially misleading** |
| 13 | "A full Agent build fell from $0.0139 to $0.0056" | `/changelog` | `COST-MODEL.md:77–79`: a quality-gated build is now ~2,300 neurons ≈ **$0.025** — 4.5× the "after", 1.8× the "before". | **Obsolete, in the favourable direction** |
| 14 | "Pro (400 Credits/day…) opens as a waitlist" | `/changelog`, `/terms` §7 | No Pro plan exists anywhere in `PLAN_LIMITS` or the site. | **False** |
| 15 | Pairing code format `GLM-XXXXXX` | `/changelog` | `pairing.ts:13,31` — bare 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. `/docs/connect` gets it right. | **False** |
| 16 | "Custom Roblox training is in development. We do not claim a completed proprietary model." | landing page, `/docs/modes` | Matches the repo's own position. Volunteered, not extracted. | **True, and creditable** |
| 17 | "your projects … are never used to train models"; "Cloudflare runs … the model inference" | `/privacy`, `/docs/privacy-and-data` | Names the actual processors (Cloudflare, Supabase, Stripe) rather than "industry-standard providers". Carefully worded as *"not shipped to third-party AI companies' training pipelines"*. Cloudflare's own retention terms are outside the repo — see §6. | **Consistent with the repo; provider terms unverified** |
| 18 | "Public Studio plugin installation is unavailable — no confirmed release date" | `/status` | Correct, dated, and volunteered as an open issue. | **True** |
| 19 | "This does not verify Studio, builds, or billing" | `/status` | Correct, and a distinction most status pages do not draw. | **True, and creditable** |
| 20 | Asset library / "Searched the asset library" (in-app) | app bundle | `docs/evidence/library-requires-ownership-2026-09-19.md`: `LoadAsset` returns *"User is not authorized"* for library assets because the account does not own them; the honest count of what the plugin can place today is **zero**. `library-delivery-blocked-2026-09-19.md`: `insert_asset` is in the plugin's `UNSUPPORTED` list. **The marketing site makes no asset-library claim** — I grepped all 22 pages. | **Not claimed on the site; feature present in-app and cannot deliver** |

---

## 5. What is genuinely good

Short, because the brief says not to pad — but these are real and several are unusual.

- **`/status` is better than most funded companies ship.** It states an open issue with a date and no
  ETA, refuses to guess, volunteers *"This does not verify Studio, builds, or billing"*, and draws a
  distinction I have never seen a vendor draw: *"An offline connection does not prove the plugin is
  missing — the browser cannot distinguish an uninstalled plugin from a closed Studio."* It also
  lists a resolved issue against itself ("The pricing page downloaded itself instead of opening").

- **`/docs/plugin` explains why there is no one-click install** and cites Roblox's own two-step
  acquire-then-install flow rather than hand-waving. It also draws the plugin-network-permission vs
  Game Settings → Allow HTTP Requests distinction, which is the single most common confusion in this
  space.

- **The landing page volunteers a negative:** *"Custom Roblox training is in development. We do not
  claim a completed proprietary model."* Nobody makes a vendor write that.

- **Anonymous API behaviour is clean.** `/api/me`, `/api/projects`, `/api/usage`, `/api/quota`,
  `/api/plans`, `/api/version`, `/api/status` and `POST /api/billing/checkout` all return **401** with
  `{"error":"unauthorized"}` — no stack traces, no framework banners, no internals. Malformed JSON to
  a POST and a 5,000-character query string are both handled without a 500. A `<script>` in the path
  is not reflected into the 404 page. `/api/health` is unauthenticated and minimal, which is right.

- **Contrast passes.** I computed the WCAG ratio for every text node against its resolved background
  on `/` and `/pricing`: **zero AA failures** on either page, including the small grey disclaimer
  lines. That is not luck on a near-black palette.

- **Mobile hero layout is clean.** No overlap, no clipping, no horizontal page scroll in the content
  columns; the nav collapses correctly. Only the comparison table (S6) fails.

- **Docs search works.** Typed "checkout", got 3 correctly-ranked pages with useful snippets in under
  a second, and the code degrades with a stated message — *"Search is unavailable — the index did not
  load. The list below still works."* — rather than silently.

- **The pricing page derives rather than restates.** Credit costs, request counts and builds-per-month
  are computed from the shared plan config (`pricing.astro:87–91`, `:180`, `:217`, `:237`), with a
  comment explaining the real past bug that motivated it. The `77` figure is independently
  re-derived server-side and agrees. This is the right engineering — it is just not applied to the
  two prose lines and two pages that now contradict it.

- **The billing kill-switch is correct.** Disabling checkout rather than shipping test keys to
  production was the right call, made fast, and written down.

- **`/privacy` names its processors.** Cloudflare, Supabase, Stripe, by name, with what each holds.
  Most privacy policies at this stage say "trusted partners".

---

## 6. What I could not check, and why

Stated as could-not-check, not as pass or fail.

1. **The entire logged-in product.** Creating an account requires me to set a password, which I will
   not do. Everything past `/app/login` is unverified: the workspace, the chat, the credit meter, the
   Files drawer, the Asset library overlay, checkpoints and rollback, and the Plans & Credits page
   that the `/pricing` CTAs send buyers to. **B1's practical outcome — what actually happens when you
   click "Choose Builder" — is therefore untested.**

2. **Whether Apple builds anything in Roblox Studio.** There is no public install path, so the core
   loop cannot be exercised by a customer at all. I am recording this as *untestable by the intended
   buyer*, which is itself the finding — not as a failure of the software.

3. **Whether a full "describe a game → it appears in Studio" loop has ever run on the shipping
   plugin.** I read the evidence directory. The strongest in-Studio artifacts —
   `docs/evidence/lumen-isles-2026-09-19/independent-paired-edit-consent.png` and
   `appleui-observed-in-studio-2026-09-19.md` — establish **pairing and two-step edit consent**, which
   is real. But `appleui-observed-in-studio-2026-09-19.md:77–79` disclaims its own install path
   (*"the kit was installed by hand through the command bar because the shipped plugin cannot reach
   this place"*), and `apple-plugin-test-lifecycle-fix-2026-09-19.md:3–6` is explicitly *"local
   source, mock-runtime, and build evidence only"*. The one real end-to-end run I found referenced
   (`docs/BLOCKERS.md:215–217`, commit `f132425`) used **`apps/plugin`** — the legacy Golem plugin
   Roblox removed — not `apps/apple-plugin`, which is what ships. I could not find an equivalent run
   for the shipping build. **I am not calling this a fail; I am saying the evidence does not
   establish it, and the site's copy reads as though it does.**

4. **Whether the in-app asset library returns anything to a user.** The bundle contains an "Asset
   library" overlay, an `apple_library` source option and a "Searched the asset library" activity
   label; the repo's own evidence says the count the plugin can place today is zero. I could not see
   what the logged-in UI renders in that state — a clear "nothing available" is very different from
   an empty grid.

5. **Whether `X-Golem-Export-SHA256` is actually emitted on the wire.** The export endpoint requires
   auth. I found the header name in the client bundle; I did not observe a response carrying it.

6. **Whether a malformed ` ```golem-ui ` block leaks the string into chat.** Requires a live session.

7. **Cloudflare's own retention and training terms** behind the "never used to train models" promise.
   The site's wording is careful and the processor is disclosed; the underlying provider contract is
   outside this repo and I did not read it.

8. **Whether `golem.moshe-barami111.workers.dev` can complete a signup.** I did not attempt account
   creation on either domain. I confirmed the pages render and that its API contract differs from
   Apple's (`/api/billing/config` 401 vs 200).

9. **Whether the currently-installed plugin build has the unfixed edit-permission bug**
   (`apple-plugin-test-lifecycle-fix-2026-09-19.md:11–16`, `:89–94` — edit access reportedly surviving
   a Studio Test → Stop cycle). I have no Studio and no plugin; this is repo evidence I am relaying,
   not something I observed.

10. **Load, latency under concurrency, and uptime over time.** `/api/health` answered in 90ms from the
    status page's own in-browser probe on a single request. One sample is not a measurement.

---

*Reviewed 19 Sept 2026 against worker build `6437a7b-dirty` and app bundle
`/app/assets/index-BTuSnyDl.js`. No files in this repository were modified other than this one.*
