# Customer review — Apple, 2026-09-19 (round 2)

Adversarial evaluation by a prospective customer with no prior knowledge of the product and no
access to the previous reviewer's findings. Everything below was gathered first-hand on
2026-09-19 against `https://apple.moshe-barami111.workers.dev` and the repo at
`/Users/moshe/Desktop/RbxAI` (HEAD `5c8da94`).

Conventions used throughout:

- **OBSERVED** — I did the thing and saw the result. The evidence is quoted.
- **INFERRED** — I read code or docs and reasoned. Not executed.
- **COULD NOT CHECK** — stated plainly in §7, never scored as a pass or a fail.

---

## 1. Verdict

**I would not recommend paying for this, and I could not pay for it if I wanted to.**
I would recommend *creating a free account* and watching it.

`/api/billing/config` returns `{"checkout":false,"purchasable":[],"currency":"USD"}` (OBSERVED).
There is nothing to buy. That alone is not a mark against the product — the site says so in
several places, honestly and without weaselling.

**The single biggest thing in the way is this:** the product's entire value proposition is
"it builds inside Roblox Studio", and a new customer cannot get the Studio plugin at all — not
because a release is pending, but because Roblox made a **content moderation decision** against
it. `docs/evidence/plugin-store-blocked-2026-09-19.md` records the Creator Dashboard showing
*"Not distributed on Creator Store. This asset may be in violation of Roblox Community
Standards"* **with the distribution toggle already ON**, and three publish attempts returning a
bare "Submission failed". The site consistently calls this "unavailable" and "no confirmed
release date", which is honest about the *state* but never about the *cause*. A customer reading
"public installation is unavailable" reasonably hears "not yet". The repo knows it means
"refused".

What a paying customer would actually receive today is a chat window that writes Luau it cannot
apply to their place. The site is unusually candid about this — far more candid than most
products at this stage — but candour about a missing core is still a missing core.

Underneath that sits a second, quieter problem: **the shipping plugin is not the plugin the
product was measured with.** `apps/apple-plugin/src/Commands.luau:3438-3442` refuses
`run_code`, `run_mode` and `inspect_model` by name. That withholds nine agent tools including
four of the five verifiers — and the pricing page sells your entire allowance in units of
"quality-gated builds".

---

## 2. Blocking defects

Ranked by what would stop someone paying, not by ease of fixing.

### B1 — The core capability is unreachable, and the reason given understates the problem
**Severity: blocking.** OBSERVED + INFERRED.

- What I did: read `/`, `/docs`, `/docs/plugin`, `/docs/getting-started`, `/status`, `/pricing`.
- Expected: a path to install the plugin, or a date.
- Happened: every page says public installation is unavailable with no confirmed date.
  `/docs/plugin` says *"An independent replacement is being tested locally; it is not published
  or approved for distribution."*
- Where: `https://apple.moshe-barami111.workers.dev/docs/plugin`,
  `/status`, `/docs/getting-started` step 3.

The framing is "pending". The repo's own evidence
(`docs/evidence/plugin-store-blocked-2026-09-19.md`) says Roblox refused it on content grounds
with the distribution toggle already on — *"This is a content decision, not a missing click."*
No page tells a customer that. Someone deciding whether to invest time in this product is
entitled to know the difference between "we haven't shipped it" and "the platform said no".

**Compounding:** `.github/workflows/plugin-release.yml:6-11` states that the plugin CI builds
(`apps/plugin`) *"compiles text received over HTTP into a ModuleScript and requires it
(`apps/plugin/src/Ops.luau:521`), which is the pattern the Creator Store asset requirements
prohibit and the most likely reason the previous asset was removed."* So the repo has a
hypothesis for the refusal and has already built a clean replacement — but is still shipping
the old one out of CI (see S5).

### B2 — `/docs/plugin` publishes the product's *current* asset id as the one Roblox removed
**Severity: blocking.** OBSERVED.

- What I did: `curl https://apple.moshe-barami111.workers.dev/docs/plugin`.
- Expected: the id of the dead listing.
- Happened, verbatim from the live page:
  > "Public installation is unavailable. Roblox removed the previous plugin listing
  > (**107230158271368**). Its store URL is not a working install path."
- I confirmed `132128477945417` appears **zero** times on the live page and
  `107230158271368` appears once.
- Where: `https://apple.moshe-barami111.workers.dev/docs/plugin`; source
  `apps/site/src/pages/docs/plugin.astro:49-50`, which renders
  `STUDIO_PLUGIN_ASSET_ID`.

`packages/shared/src/index.ts:1576-1587` is unambiguous that this is backwards:

> "Republished 2026-09-19 as a NEW asset on a different account. The previous id,
> **132128477945417**, is `Golem` on Herobrine583522 and its Creator Dashboard carries a standing
> refusal… The current id is `Apple Studio`, AssetTypeId 38, creator Shahar474."

So the page names the asset the product is *currently trying to ship* and tells the world Roblox
removed it and that its store URL does not work. The cause is `plugin.astro` binding
`STUDIO_PLUGIN_ASSET_ID` (the current id) into a sentence about the previous one. This is live
right now, not latent — I verified it with curl, not by reading source.

### B3 — The signup page contradicts every other page about the one thing that matters
**Severity: blocking.** OBSERVED.

- What I did: opened `/app/signup`.
- Expected: the same "installation unavailable" caveat the rest of the site carries.
- Happened: the card reads
  > "Summon your apple — Free to start. **No card, no Studio setup beyond one plugin.**"
- Where: `https://apple.moshe-barami111.workers.dev/app/signup`;
  source `apps/web/src/routes/auth-pages.tsx:489`.

"No Studio setup beyond one plugin" tells a new customer the only thing standing between them
and a working product is installing a plugin — the exact thing that is impossible. This is the
**last sentence a person reads before handing over an email address**, which makes it the most
expensive wrong sentence on the site.

It is also an isolated miss rather than a systemic one, which makes it cheap to fix: every other
surface in the app gates correctly on `STUDIO_PLUGIN_STORE_LIVE`
(`apps/web/src/components/pairing-dialog.tsx:424` renders *"Public installation unavailable — see
status"*; `connect-studio.tsx:27` imports the same flag). `auth-pages.tsx:489` is a hardcoded
string that consults nothing.

### B4 — Pricing sells the allowance in "quality-gated builds"; the shipping plugin withholds the gate
**Severity: blocking.** OBSERVED (plugin table, tool table) + INFERRED (net effect).

`/pricing` quotes every plan twice — once in Credits, once in "quality-gated builds a month"
(Free "About 30", Builder "About 163", Studio "About 272"). The unit is the headline.

`apps/apple-plugin/src/Commands.luau:3438-3442`, the shipping plugin:

```lua
local UNSUPPORTED = {
    run_code = "run_code is intentionally unavailable in this readable plugin: ...",
    run_mode = "run_mode is not supported by this independent Apple plugin build; ...",
    inspect_model = "inspect_model is unavailable in this build because the verified
                     model-quality gate is not present",
}
```

The plugin states the defect itself: *"the verified model-quality gate is not present."*

Mapping those three refused ops onto `apps/worker/src/tools.ts` (I resolved each `studioOps:`
line back to its tool name), **nine tools** become unavailable:

| Tool | Line | Needs |
|---|---|---|
| `run_luau` | tools.ts:1787 | `run_code` |
| `run_and_check` | tools.ts:1812 | `run_code`, `run_mode` |
| `set_mood` | tools.ts:2143 | `run_code` |
| `add_effect` | tools.ts:2207 | `run_code` |
| `audit_build` | tools.ts:2253 | `run_code` |
| `run_spec` | tools.ts:2407 | `run_code` |
| `remove_effect` | tools.ts:2669 | `run_code` |
| `check_composition` | tools.ts:2726 | `run_code` |
| `inspect_model` | tools.ts:3275 | `inspect_model` |

`apps/worker/src/tools.ts:275` declares
`VERIFIER_TOOLS = ['run_and_check','run_spec','audit_build','check_composition','inspect_visually']`.
**Four of those five are in the withheld list.** A build performed through the shipping plugin
cannot be verified by the mechanism the pricing unit is named after.

The gate is real and was measured — `docs/evidence/2026-08-31-semantic-gate-live.md:7` records a
live firing at *"Cost: 0 neurons"* — but that run used the **old** `apps/plugin` build. On the
plugin a customer would install, it does not run.

### B5 — The changelog advertises playtest verification the shipping plugin refuses by name
**Severity: blocking.** OBSERVED.

`/changelog`, v0.1, "Apple for Studio (plugin)", un-annotated:
> "Starts and stops run mode, captures logs, and reports results back for verification."

and in "The workspace":
> "you see every `get_project_tree`, `edit_script` and `run_and_check` as it happens."

`Commands.luau:3440` refuses `run_mode` outright. `run_and_check` requires both `run_code` and
`run_mode` (tools.ts:1812) and is withheld entirely.

This is not a case of nobody noticing: **two other bullets on the same page carry "Since
withdrawn" annotations** (Super Agent, the Pro tier) and a third carries "Since repriced". The
editorial mechanism for retracting a stale claim exists and was used twice on this page. It was
not used here. `/docs/plugin` states the truth correctly — *"Refuses by name: it will not start
or stop play mode"* — so the site contradicts itself between two pages one click apart.

### B6 — The Terms of Service describe a plan that does not exist and deny prices the site publishes
**Severity: blocking** (this is the binding document). OBSERVED.

`/terms` §7 "Payments", verbatim:
> "Apple v1 collects **no payment**. There are no purchases, no subscriptions and therefore no
> refunds… **The Pro plan exists only as a waitlist**; joining it creates no payment obligation."

Source: `apps/site/src/pages/terms.astro:84`.

Against that:
- `/changelog` says flatly: *"Since withdrawn: there is no Pro tier. The paid tiers are Builder
  and Studio."*
- `/pricing` publishes Builder at **$12 a month** and Studio at **$40 a month**, plus an
  Enterprise column.

So the legally operative document names a tier the changelog says was withdrawn, and describes a
commercial posture the pricing page contradicts. Terms was last updated "August 2026"; the
pricing model changed after. For a customer doing diligence, a stale ToS is a bigger red flag
than a stale marketing page, because it is the document you would rely on in a dispute.

### B7 — The pricing table says you can buy credits; the API says you cannot
**Severity: blocking.** OBSERVED.

- What I did: read the `/pricing` comparison table, then called
  `GET /api/billing/config`.
- Expected: agreement.
- Happened:

  Comparison table row, with a tooltip and no caveat, on **all four** columns including Free:
  > "Buy extra credits — Purchased credits never expire and are spent only after the daily
  > allowance. **✓ Included ✓ Included ✓ Included ✓ Included**"

  Builder card bullet: *"Buy credits when you need more."*

  API: `{"checkout":false,"purchasable":[],"currency":"USD"}`

Every *other* paid element on the page is correctly marked "Planned tier — not available to
purchase yet", and the page's own FAQ says *"Paid checkout is not open yet."* The "Buy extra
credits" row is the one cell that escaped the caveat — and it is marked Included on the **Free**
column, i.e. it reads as a capability available to the only customers who actually exist today.

### B8 — The Free plan's advertised daily rate is unreachable for 20 days of every month
**Severity: blocking (mis-selling).** OBSERVED.

`packages/shared/src/index.ts:1687` — source of truth:
```
free: { creditsPerDay: 231, creditsPerMonth: 2_310 },
```

231 × 30 = **6,930**. The monthly cap is **2,310** — exactly ten days of the advertised daily
allowance, and exactly 30 × `CREDITS_PER_BUILD` (77). No other plan has this gap:
Studio is 700 × 30 = 21,000 exactly; Enterprise 833 × 30 ≈ 25,000; Builder is 416/day vs
12,600/month (a mild 420-vs-416 rounding difference).

The site publishes both numbers side by side — *"231 Credits per day · 2,310 a month"* — and then
never reconciles them:

- `/pricing` per-request table: *"≈ requests / free day: Plan **115**, Agent **57**"* — computed
  from the daily figure (231/2, 231/4), which a free user can only achieve ten days a month.
- `/pricing` FAQ: *"Credits **reset to your full daily amount every day**."* Measured against the
  monthly cap, this is false from day 11 onward.
- `/docs/credits-and-limits`: *"every day starts at your full allowance"*, and *"the free
  allowance is a solid daily session — about 115 Plan requests, or about 57 Agent requests"* —
  same unreconciled arithmetic.
- Only `/docs/modes` hints at it, in a subordinate clause: *"231 Credits per day, **subject to
  its monthly allowance**."* One clause, on the page fewest people read.

The worker does enforce the monthly cap — `apps/worker/src/quota-math.ts:98`
`const monthlyLeft = Math.max(0, limits.creditsPerMonth - i.spentThisMonth);` — so this is a
real wall a real user hits, not a theoretical one. A free user who builds daily discovers on
about day 11 that their "231 a day" is actually 77 a day averaged: **one build**.

### B9 — The pricing page contradicts itself on what a build costs, on the same screen
**Severity: blocking (it is the page's central number).** OBSERVED.

Two statements, both on `/pricing`:
1. *"One build costs about **77 Credits**, so every figure above is also a number of estimated
   builds."*
2. *"A full Agent build — read the tree, edit scripts, create instances, verify — measured
   **511 neurons**, about $0.0056."*

The page also defines the conversion: *"One Credit is **30 neurons** of real compute."* I
confirmed `apps/worker/src/pricing.ts:101` — `export const NEURONS_PER_CREDIT = 30;` — so 30 is
what the worker actually bills.

511 ÷ 30 = **18 Credits**. 77 Credits = 2,310 neurons. The page's own two figures for "a full
Agent build" differ by **4.5×**, and a reader can do the division because the page handed them
the conversion factor.

Both numbers are individually sourced — `docs/COST-MODEL.md:27` records the 511-neuron
measurement, and `pricing.ts:114` derives 77 from a separate 2,300-neuron *estimate* — but
nothing on the page tells the reader they describe different things. Worse, `COST-MODEL.md:77-78`
now supersedes the 511 figure, calling it *"the old build-blind path"*, while the changelog still
advertises *"A full Agent build fell from $0.0139 to $0.0056 — 2.5× cheaper"* against a current
cost the same document puts at *"≈2,300 neurons ($0.025)"* — i.e. **4.5× more than the advertised
"after" price and 1.8× more than the advertised "before" price.**

---

## 3. Serious but not blocking

### S1 — Three different version numbers for one product
OBSERVED. `/api/health` → `"version":"0.1.0"`. `/changelog` latest entry → **v0.2**.
`/docs/updating` example → *"Apple v0.2.0 · protocol 1"*. `/docs/faq` → *"the two supported
surfaces **at v0.1**"*. Nothing tells a customer which is the product they are using.

### S2 — Production is running a build nobody can reproduce
OBSERVED. `/api/health` → `"buildSha":"2c07b64-dirty"`. Repo HEAD is `5c8da94`. So the deployed
worker was built from an **uncommitted working tree**, one commit behind. The `-dirty` suffix is
served to anonymous callers. For a customer assessing operational maturity this is a louder
signal than any status page.

### S3 — The homepage is a different website from the rest of the site
OBSERVED.

| | `/` | every other page |
|---|---|---|
| Served `<html>` | `<html lang="en">` | `<html lang="en" class="no-js" data-theme="dark">` |
| Nav | Docs · **Plans** · Sign in | Product · Models · **Pricing** · Docs |
| Theme toggle | absent | present |
| Sound toggle | absent | present |
| "Create an account" in header | absent | present |
| Footer | 4 links | ~15 links, in 4 groups |
| Roblox disclaimer | "Independent from Roblox Corporation." | "Not affiliated with or endorsed by Roblox Corporation." |

The same destination is labelled **"Plans"** on the homepage and **"Pricing"** everywhere else.
Because `/` carries no `data-theme` attribute, a light-theme preference set on `/pricing` does not
apply when the user clicks the logo to go home. The homepage is visually the strongest thing on
the site — it just belongs to a different product.

### S4 — Two different logos, one of them twice on the same page
OBSERVED. I read the SVG paths on `/app/signup`:

- `auth-hero-brand` and `auth-mobile-brand`: `M16 3 L27.26 9.5 L27.26 22.5 L16 29 L4.74 22.5 L4.74 9.5 Z` — a **hexagon**.
- `model-signature--apple` / `--max`, on the same page: `M5 24 12 5 19 14 27 8 21 27 13 18Z` — the **chevron** used by the marketing site and the favicon.

So the signup page shows a hexagon wordmark and, ten pixels below it, the chevron mark beside
"Apple — Limited free access". Two marks, one screen.

### S5 — The developer docs point at the wrong plugin, and CI still ships it
OBSERVED. `/docs/build-from-source` says *"The plugin lives in `apps/plugin`"* and gives
`rojo build apps/plugin/default.project.json`. `.github/workflows/plugin-release.yml:6-11`:

> "**STALE TARGET** — This job still builds `apps/plugin`, which as of 2026-09-19 is **NOT the
> plugin this product ships**. The shipped plugin is `apps/apple-plugin`… do not publish what
> comes out of here."

The workflow still emits the artifact under the name **`apple-plugin`** (line 270), and the docs
page tells readers CI *"attaches the result as the `apple-plugin` artifact"* — true, and
misleading, because it is the legacy plugin carrying the very `require`-remote-text pattern the
repo believes got the asset removed.

### S6 — A withdrawn tier is still described as shipping
OBSERVED. `/docs/credits-and-limits`: *"Under heavy load, free-tier requests may briefly wait;
**Pro (when it ships)** queues ahead."* (`apps/site/src/pages/docs/credits-and-limits.astro:157`.)
`/changelog` says there is no Pro tier. See also B6.

### S7 — The site never shows the product
OBSERVED across `/` (desktop and mobile), `/pricing`, `/docs`. There is not one screenshot,
video, GIF, embedded demo or example build anywhere. For an AI that builds Roblox games, a
prospective customer cannot see a single thing it has built. The homepage's three feature columns
("Work in context", "See what happens", "You keep control") are text-only; the model cards are
text-only. `docs/evidence/` contains rendered playtest frames
(`2026-09-01-playtest-frame-parkour.png`, `apple-generation-crate-*.png`) — the assets exist and
are simply not used. This is the largest *conversion* problem on the site even though it is not
a correctness defect.

### S8 — "Shared projects and collaborators" is sold with no end-to-end evidence
INFERRED. `/pricing` marks it "✓ Included" on all four plans.
`packages/shared/src/index.ts` asserts it for every plan, and unit suites exist in
`apps/worker/tests/`. But no document in `docs/evidence/` records a measured sharing session
between two accounts. I could not exercise it myself (no account). Reported as unverified, not
as false.

### S9 — The eval claim is defensible as a number and not as an argument
OBSERVED in repo. `/changelog`: *"Scored 98.9 on the Roblox eval suite against 96.8 for the
model it replaced."* The figures are real (`docs/evals/RESULTS.md:16,20`). The repo's own
analysis disowns the inference: `docs/research/hf-specialists.md:11` — *"The 2.1-point spread is
smaller than run-to-run variance on the same model"* — and `:12` — *"The eval has zero visual
categories."* `docs/evals/FINDINGS.md:7` warns a future score is *"not comparable to the 98.9%
below."* Publishing the spread as a quality improvement is precisely what the repo says the
measurement cannot support.

### S10 — "Automatic checkpoint before every agent run" has been observed failing
OBSERVED in repo. `/changelog` and `/docs/getting-started` both promise it unconditionally.
`docs/evidence/2026-09-01-golden-creation-parkour.md:133-137` records:
*"**The automatic pre-run checkpoint failed**… 'Continuing without an undo point.'… the automatic
one, which is the one a user relies on, did not work"* — reproduced again in
`docs/evidence/2026-09-02-second-creation-exercise.md:93-106`. The safety net the Terms lean on
("We built undo waypoints and checkpoints precisely because of this") is the thing with a
recorded failure mode. Cross-session *persistence* of checkpoints is separately well evidenced
(`2026-09-01-persistence-reconnect.md:37`, 19 checkpoints spanning two days).

### S11 — A training opt-in shipped while the privacy page promises "no fine-print exception"
OBSERVED in repo. `/docs/privacy-and-data`: *"your projects stay yours, and are never used to
train models… **There is no fine-print exception.**"* `docs/BLOCKERS.md:447-452` records that a
`training_opt_in` toggle shipped (`apps/web/src/routes/settings.tsx:146`, column in
`infra/supabase/migrations/0001_init.sql:9`) and that *"no reader of `training_opt_in`"* exists
in the worker — so no data is in fact being used. The *promise* is still absolute while a UI
control implying otherwise is live. A privacy claim that overstates in the customer's favour is
still a claim that will not survive a careful reader.

### S12 — "Summon your apple"
OBSERVED. `/app/signup`, `apps/web/src/routes/auth-pages.tsx:488`. "Summon" is the Golem-era
verb, and lowercase "apple" reads as a typo. It is the headline of the signup card.

### S13 — Unknown API routes answer 401, not 404
OBSERVED. `GET /api/nope` → `401 {"error":"unauthorized"}`. Defensible as surface-hiding, but a
customer who mistypes a documented route is told their credentials are wrong. Minor.

---

## 4. Consistency audit

Every claim I found on more than one surface. "Source of truth" is
`packages/shared/src/index.ts` and the live API.

| Claim | Where it appears | Agree? | Note |
|---|---|---|---|
| Free = 231 Credits/day | `/pricing`, `/docs/credits-and-limits`, `/docs/getting-started`, `/docs/modes`, `/terms` §5, shared:1687 | **Yes** | All five match the source of truth. |
| Free = 2,310 Credits/month | `/pricing`, `/docs/credits-and-limits`, shared:1687 | **Yes** (to source) / **No** (to itself) | Matches shared, but is 1/3 of 231×30. Only `/docs/modes` flags the conflict. **B8** |
| "Credits reset to your full daily amount every day" | `/pricing` FAQ, `/docs/credits-and-limits` | **No** | Contradicted by the enforced monthly cap (`quota-math.ts:98`). **B8** |
| Builder $12 / 416 per day / 12,600 per month | `/pricing` card + table, shared:1688 | **Yes** | 416×30 = 12,480 ≠ 12,600; cosmetic. |
| Studio $40 / 700 / 21,000 | `/pricing` card + table, shared:1689 | **Yes** | Exact. |
| Enterprise 833 / 25,000 | `/pricing` table, shared:1690 | **Yes** | Table only; no card. |
| One build ≈ 77 Credits | `/pricing` ×4 (as "quality-gated builds"), shared:1851 | **Yes** to source | But see next row. |
| A full Agent build = 511 neurons | `/pricing` FAQ, `/changelog` | **No** | 511/30 = 18 Credits vs 77. Same page. **B9** |
| 1 Credit = 30 neurons | `/pricing` FAQ, `/changelog`, `pricing.ts:101` | **Yes** | `shared/index.ts:1382` comment says "90" — stale, internal only. |
| Build cost $0.0056 / "2.5× cheaper" | `/changelog`, `/pricing` FAQ | **No** | `COST-MODEL.md:77` now says ≈$0.025. **B9** |
| Paid checkout is not open | `/pricing` ×3, `/docs/modes`, `/docs/billing`, `/api/billing/config` | **Yes** | Consistently and honestly stated. |
| "Buy extra credits ✓ Included" (all plans) | `/pricing` table, Builder card | **No** | vs `checkout:false, purchasable:[]`. **B7** |
| Paid tiers are Builder + Studio | `/pricing`, `/changelog` | **Yes** | |
| A "Pro" tier exists | `/terms` §7, `/docs/credits-and-limits` | **No** | `/changelog`: "there is no Pro tier". **B6, S6** |
| "Apple v1 collects no payment" | `/terms` §7 | **No** | vs $12/$40 on `/pricing`. **B6** |
| Public Studio installation unavailable | `/`, `/docs`, `/docs/plugin`, `/docs/getting-started`, `/docs/connect`, `/status`, `/pricing` ×2, `/docs/modes`, pairing dialog | **Yes** | The most consistent claim on the site — 10 surfaces agree. |
| "No Studio setup beyond one plugin" | `/app/signup` | **No** | Contradicts all 10 above. **B3** |
| Removed listing id | `/docs/plugin` (107230158271368) vs shared:1576-1587 | **No** | Publishes the *current* id as removed. **B2** |
| Plugin starts/stops run mode | `/changelog` (yes) vs `/docs/plugin` (refuses) vs `Commands.luau:3440` (refuses) | **No** | **B5** |
| Plugin refuses to execute sent code | `/docs/plugin`, `Commands.luau:3439` | **Yes** | |
| "Quality-gated builds" as the pricing unit | `/pricing` ×8 vs `Commands.luau:3441` | **No** | Plugin: "the verified model-quality gate is not present". **B4** |
| Ctrl+Z / ChangeHistory waypoint per batch | `/changelog`, `/docs/getting-started`, `/docs/faq`, `/docs/troubleshooting`, `/docs/plugin` | **Yes** | Evidenced: `apple-restore-engine-r4-candidate-2026-09-18.md:60`. |
| Auto checkpoint before every agent run | `/changelog`, `/docs/getting-started`, `/terms` §2 | **Partly** | Observed failing twice in `docs/evidence/`. **S10** |
| 25 checkpoints retained per project | `/docs/credits-and-limits`, `/docs/privacy-and-data` | **Yes** | |
| Pairing code: 6 chars, 10 min, single use | `/docs/connect`, `/docs/getting-started`, `/docs/troubleshooting`, `/changelog` | **Mostly** | `/changelog` shows the format as `GLM-XXXXXX`; the docs show `K7M3QP` with no prefix. |
| 30-day session expiry | `/docs/connect`, `/docs/troubleshooting` | **Yes** | |
| Never trained on private projects | `/docs/privacy-and-data`, `/changelog`, `/terms` §4 | **Yes**, with a caveat | "No fine-print exception" vs a shipped opt-in toggle. **S11** |
| Quota resets midnight UTC | `/pricing` FAQ, `/docs/credits-and-limits`, `/docs/troubleshooting` | **Yes** | Stated identically three times. |
| Modes = Plan + Agent only | `/pricing`, `/docs/modes`, shared:1491 | **Yes** | `/changelog` lists Super Agent with an explicit withdrawal note. |
| Product version | `/api/health` 0.1.0 · `/changelog` v0.2 · `/docs/updating` v0.2.0 · `/docs/faq` v0.1 | **No** | **S1** |
| Support email | every page footer + 8 docs pages | **Yes** | `apple.labs.app@gmail.com` throughout. |
| Nav label for `/pricing` | `/` says "Plans"; all others say "Pricing" | **No** | **S3** |
| Roblox disclaimer wording | `/` vs all others | **No** | Two different sentences. **S3** |
| Brand mark | `/app/signup` hexagon vs site-wide chevron | **No** | **S4** |
| Plugin source dir | `/docs/build-from-source` says `apps/plugin`; workflow says `apps/apple-plugin` ships | **No** | **S5** |

---

## 5. Golem inventory

**Zero user-visible Golem branding on the marketing site.** I verified by fetching all seven
top-level pages and grepping case-insensitively:

```
/ golem-hits=0      /pricing golem-hits=0    /docs golem-hits=0
/status golem-hits=0  /terms golem-hits=0    /changelog golem-hits=0
/app/signup golem-hits=0
```

All remaining instances are internal or on the wire. Ordered by how close they sit to a customer.

### Reachable by a customer who opens devtools or reads a header

| Instance | Location | Visibility |
|---|---|---|
| `golem.v1` — localStorage key | `/app/assets/index-BTuSnyDl.js` (shipped bundle) | **Internal, but inspectable.** Visible in Application → Local Storage. |
| `golem.jwt.<id>` — localStorage key | same bundle | **Internal, inspectable.** Sits next to the auth token. |
| `X-Golem-Export-SHA256` — response header | same bundle reads it; `apps/worker/src` sets it | **Internal, inspectable.** Appears on a data-export download the customer initiates. |
| ` ```golem-ui ` — fenced code-block language the chat parses | same bundle | **Potentially user-visible.** If the model emits a `golem-ui` block the parser does not consume, the literal string renders in the transcript. I could not reach a chat session to confirm whether this ever surfaces (see §7). |
| `X-Golem-Token`, `X-Golem-Role`, `X-Golem-Plugin-Version`, `X-Golem-Plugin-Protocol`, `X-Golem-Grant-Expires-At`, `X-Golem-Sandbox`, `X-Golem-Usage-Input-Tokens`, `X-Golem-Usage-Output-Tokens`, `X-Golem-Usage-Credits`, `X-Golem-Credits-Remaining` | `apps/worker/src`, `apps/apple-plugin/src` | **Internal.** Not returned to an anonymous caller — I checked `/api/health`, `/api/billing/config`, `/api/me`, `/api/projects`, `/api/chat`, `/api/auth/login`; none carried an `X-Golem-*` header. Would appear on authenticated traffic. |
| `golem.studio-ops.v1` — capability schema id | `apps/apple-plugin/src/Commands.luau:3632`, `apps/worker/src/plugin-capabilities.ts:11` | **Internal, on the wire** between the shipping plugin and the worker. |
| `golem.memory.v1` — schema id | `apps/worker/src` | **Internal, on the wire.** |
| `GLM-XXXXXX` pairing-code format | `/changelog` (live, `changelog.astro:151`); `apps/web/src/lib/api.ts:822` mock `GLM-7F3K2Q`; `shared/index.ts:1309` | **User-visible on `/changelog`.** Ambiguous: `GLM` is also the model family (GLM-5.3 Flash), so this may be a model reference rather than a Golem leftover. Either way it disagrees with `/docs/connect`, which shows unprefixed `K7M3QP`. |

### Build-time only

| Instance | Location |
|---|---|
| Root package name `golem` | `package.json:2` |
| npm scope `@golem/*` on 9 of 11 packages | `@golem/corpus`, `@golem/sdk`, `@golem/design`, `@golem/shared`, `@golem/plugin`, `@golem/site`, `@golem/training`, `@golem/web`, `@golem/evals`, `@golem/worker`. Only `apps/apple-plugin` uses `@apple/studio-plugin`. |
| `import … from '@golem/shared'` | ~40 files across `apps/web/src`, `apps/site/src`, `apps/worker/src` |
| `GolemMode` type name | `packages/shared/src/index.ts` (`MODE_INFO: Record<GolemMode, …>`), `apps/worker/src/router.ts` |
| Prose references to the Golem identity | `shared/index.ts:1412` *"Clay and Stone were quarried-stone names from the Golem identity"*; `shared/index.ts:1576` *"is `Golem` on Herobrine583522"*; `shared/index.ts:1603` probe table row `Golem 132128477945417` |
| Legacy plugin tree | `apps/plugin/` (still built by `.github/workflows/plugin-release.yml`) |
| Benchmark app | `apps/benchmark/crystal-canyon/` — 6 files reference Golem |

**Assessment:** the owner's requirement ("zero Golem branding in the active product") is **met for
the marketing site and, as far as an anonymous caller can see, for the API**. It is **not met for
the shipped web bundle**, where four Golem strings survive in storage keys, a header name and a
code-fence language. The npm scope is a rename with real blast radius and is defensible to defer;
the four bundle strings are not, because `golem.v1` and `golem.jwt.*` are the first things a
curious customer sees in devtools.

---

## 6. What is genuinely good

I went looking for things to break. These held up.

1. **The API is clean.** Every endpoint I probed returned well-formed JSON with
   `content-type: application/json` and `x-content-type-options: nosniff`. **No stack traces, no
   framework banners, no internal paths, no Golem headers** to an anonymous caller. Unknown
   routes, unauthenticated reads and a malformed POST body all returned `{"error":"unauthorized"}`
   rather than leaking shape. A null byte in a query string (`/api/billing/config?x=%00`) was
   handled without incident. This is better than most shipping products.

2. **`/api/billing/config` is honest and machine-checkable.** `checkout:false, purchasable:[]`
   matches what the pricing page says in prose. A product that wanted to soften "you cannot buy
   this" would not expose an endpoint that says so unambiguously.

3. **The plugin capability negotiation is genuinely well-engineered.** The shipping plugin
   reports what it cannot do (`Commands.luau:3632`, schema `golem.studio-ops.v1`), and
   `apps/worker/src/plugin-capabilities.ts` parses it defensively: unknown schema, duplicate
   op names, or an `unsupported` entry without a reason all return `null`, and `null` means
   *"keep every tool you would have offered before capability negotiation existed"* rather than
   silently degrading. Missing means unknown; only an explicit refusal removes a tool. That is
   the correct failure direction, and it means the agent will not burn a customer's credits
   calling the nine dead tools. The defect in B4 is that the capability is *absent*, not that
   the system handles its absence badly — it handles it very well.

4. **The refusals are principled and explained.** `run_code` is refused with *"received text is
   never loaded, required or executed inside Studio"* — a deliberate security posture, and the
   likely fix for whatever got the previous asset moderated. `/docs/plugin` publishes the refusal
   list under the heading "Refuses by name" and says each refusal *"costs the assistant tools it
   would otherwise offer."* Very few products document their own capability losses.

5. **The honesty register is unusually high.** `/changelog` annotates its own retractions in
   place ("Since withdrawn", "Since repriced") including the self-aware *"A reader comparing this
   page with Pricing was seeing two different numbers for the same thing."* `/status` lists a
   known issue that says an offline plugin *"does not prove the plugin is missing"* — refusing to
   report a failure to observe as an observation. `/pricing` publishes a full capability matrix
   specifically because *"a capability missing from a list of bullets is indistinguishable from
   one nobody mentioned"*, and prints `false` as plainly as `true`. `/docs/modes` states
   *"a completed independently trained frontier model is not available."* The homepage carries
   *"We do not claim a completed proprietary model."* This is a product that tells on itself.

6. **Single source of truth for pricing, and it works.** `PLAN_LIMITS` lives in
   `packages/shared/src/index.ts` and is imported by the worker's quota enforcement
   (`quota-math.ts`), the pricing page and the app. Every one of the eight plan figures I
   cross-checked matched the source exactly. The comment explains why
   (*"A plan page that disagrees with the ledger enforcing it is a page that lies to the user"*),
   and there is a guard script (`scripts/check-credit-figures.mjs`). The contradictions I found
   in B8/B9 are *between published figures*, not drift from the source.

7. **The visual design is genuinely strong — and mobile is clean.** The homepage at desktop and
   at 375×812 has no overlap, no clipping, no horizontal overflow (`scrollWidth === innerWidth`),
   readable contrast, and a restrained charcoal palette with one accent (the MAX gradient). The
   pricing cards stack correctly on mobile and the comparison table sits in an
   `overflow-x: auto` container rather than breaking the layout. I initially thought mobile was
   badly broken and it was my own screenshot timing — the layout is solid.

8. **Progressive enhancement is done properly.** `/pricing` is served as
   `<html class="no-js">` with CSS that makes every scroll-reveal element fully visible under
   `.no-js`, and an inline script removes the class. A visitor with JavaScript disabled sees the
   prices.

9. **The docs are excellent prose.** `/docs/troubleshooting` enumerates every message the Studio
   panel can emit and what each costs; `/docs/updating` explains that Roblox does not
   auto-update plugins and that the server admits every protocol it has ever shipped so nobody
   is stranded; `/docs/billing` explains why plan changes go through the Stripe portal rather
   than a second checkout (*"A second checkout would add a subscription rather than replace the
   running one"*). This is documentation written by someone who has actually answered the emails.

---

## 7. What I could not check, and why

1. **Anything behind authentication.** I was instructed not to create an account or enter a
   password, so I never saw the workspace, the composer, the mode picker, the credit meter, the
   Usage page, the Files drawer, checkpoints, or the pairing dialog in its real state. Every
   claim about in-app behaviour in this report is INFERRED from source.

2. **Whether the product actually builds anything.** The core loop — describe a game, watch it
   appear in Studio — is unreachable without the plugin, which cannot be installed. I could not
   test the product's actual function **at all**. This is the largest gap in this review and it
   is not a gap I could have closed.

3. **Scroll-reveal behaviour on `/pricing`.** My first screenshots showed all three plan cards at
   `opacity: 0` four seconds after load, which looked like a blocking defect. Before reporting it
   I checked: `document.visibilityState === "hidden"` and a control `IntersectionObserver` I
   registered myself also never fired (`"ioProbe": "TIMEOUT"`). The Browser pane is hidden, which
   suppresses IntersectionObserver browser-wide. **This is a measurement artifact and I make no
   claim either way.** What I can say from source: `apps/site/src/layouts/Base.astro:92-110` uses
   a correct IntersectionObserver with a `no-js` fallback, and the `.no-js` class is genuinely
   served and genuinely removed, so the JS-disabled path is sound. Whether the observer fires on
   first paint in a visible browser is **unverified**.

4. **Mobile layout at the exact moment of scrolling.** My first mobile pass appeared to show
   clipped text and 700px voids. Re-measuring the DOM found one clipped element (the decorative
   `.atmosphere`) and no horizontal overflow, and re-screenshotting at settled scroll offsets
   showed a clean layout. The earlier images were smooth-scroll tearing. **I withdraw that
   finding entirely.**

5. **Whether `golem-ui` ever renders in a customer's chat.** The string is in the shipped bundle
   as a fenced-code-block language the markdown layer strips. Whether a malformed block ever
   leaks the literal text into the transcript requires a live chat session.

6. **Whether `X-Golem-*` headers reach an authenticated browser.** Absent from all six anonymous
   responses I captured. Present in worker source. Unverified on a real session.

7. **Sharing and collaboration** (S8). Sold on all four plans; no evidence document records an
   end-to-end session; I had no second account.

8. **The 231-vs-2,310 wall in practice.** I read the enforcement
   (`apps/worker/src/quota-math.ts:98`) but did not exhaust a real quota. The arithmetic and the
   code path are OBSERVED; the lived experience is INFERRED.

9. **Whether Roblox would approve a resubmitted plugin.** `docs/evidence/plugin-store-blocked-2026-09-19.md`
   records a refusal and an appeal path. Outcome unknown, and `shared/index.ts:1596-1607` records
   that the liveness probe **no longer discriminates** (Rojo, installed by thousands, also returns
   404), so nobody — including me — can currently verify distribution status from outside the
   authenticated Creator Dashboard.

10. **Provider-side training terms.** `/docs/privacy-and-data` promises inference context *"is
    not retained by the inference layer afterwards"*. That is a claim about Cloudflare Workers AI,
    not about Apple's own code, and I did not verify it against the provider's terms.

---

*Review performed 2026-09-19 against deployment `buildSha 2c07b64-dirty`, repo HEAD `5c8da94`.
No files were modified except this one.*
