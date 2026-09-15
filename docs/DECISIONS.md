# Golem — Architecture Decision Record (living)

Mission: public, production-quality AI SaaS that takes a Roblox game from idea to working experience.
Constraints: ~$5/mo recurring, server-side inference only, independent commercially-usable open-weight AI core,
no paid-per-token API dependency, no dependency on the dev Mac, tens of concurrent users at launch.

## ADR-001 — Brand: "Golem"
The golem is a builder animated by words — exactly what the product is. Friendly to young creators
(Minecraft golem association), serious enough for professionals. Company handle: Golem Labs.
Tagline: "Describe it. Golem builds it in Studio."
AI modes: **Clay** (fast conversational edits), **Stone** (standard builder agent), **Rune** (deep
agent: plan → build → verify → fix). Modes map internally to model+routing+tool policies, not to
single models. *(These were user-facing names; superseded by ADR-018 — they are now internal
specialist identities and the product offers Plan / Agent / Super Agent.)*

## ADR-002 — Platform: Cloudflare Workers as the spine
- One Worker (Hono) serves: marketing site (static), app SPA (static), REST/WS API under /api.
- **Durable Objects** (free tier, SQLite-backed) — one per active project session: WebSocket to the
  browser, HTTP long-poll command queue for the Studio plugin (Studio HttpService has no WebSocket).
- **Workers AI** — server-side open-weight inference (Qwen2.5-Coder-32B Apache-2.0 class, gpt-oss,
  Llama 3.3, bge-m3 embeddings, vision model for screenshot review). Free daily neuron allocation;
  hard per-user quotas keep cost at $0–5/mo. Optional opportunistic providers (HF Inference, Groq)
  behind a gateway with circuit breakers — product functions if they vanish.
- **Vectorize + D1** — hybrid RAG (vector + FTS5) over the Roblox creator-docs corpus (CC-BY-4.0).
- **R2** — checkpoint blobs, uploads, generated assets.
Rationale: everything in one vendor's generous free tier, commercial use allowed on free plan,
zero cold-start ops burden, and the $5 Workers Paid plan is the single justified overage lever.

## ADR-003 — Data & auth: Supabase
Free-tier Postgres + Auth (email/password). Tenant isolation via RLS on every table; the Worker
verifies Supabase JWTs (JWKS) and additionally scopes every query by user id. App data: users,
projects, sessions, messages, checkpoints metadata, usage ledger, feedback. Private project data is
never used for training; a separate explicit opt-in table gates any future contribution program.

## ADR-004 — Studio integration: real plugin, typed op protocol
Luau plugin ("Golem for Studio"), developed with Rojo, built to .rbxm. Pairing: user gets short-lived
code in web app → plugin exchanges it for a scoped session token. Plugin long-polls the project DO,
executes typed ops (read/search scripts, edit scripts via ScriptEditorService, create/modify instances
+ properties, DataModel tree snapshots, selection, terrain ops, playtest hooks, log capture,
screenshot if API allows), reports results. ChangeHistoryService recording around every op batch =
native undo; server-side checkpoints in R2 = restore across sessions.
Validated against actual Roblox Studio via the local Studio MCP during development.

## ADR-005 — AI strategy: measure, don't vibe
Roblox-specific eval suite (Luau correctness, API knowledge, project comprehension, debugging, tool
use, multi-file edits, long tasks, failure recovery) in `packages/evals`. Baseline candidate
open models on Workers AI → add RAG → routing → (LoRA only if evals justify it; Workers AI supports
BYO LoRA on select bases). Every claimed improvement ships with baseline-vs-candidate numbers.
Training data: only license-compatible sources (creator-docs CC-BY-4.0, permissively-licensed OSS
Luau, official API dump, synthetic self-generated). Provenance tracked in docs/research/provenance.md.

## ADR-006 — Business model: free tier with hard quotas, Pro later
Free: daily "Credits" energy quota sized so worst-case usage stays inside the free/paid-plan neuron
allocation; queueing + per-user rate limits; abuse caps. Pro tier designed (higher quota, priority
queue, more checkpoints) but launches as waitlist — no payment processing at v1, so no card risk and
no per-user subsidy. Revenue switch-on is a config change, not a rebuild.

## ADR-007 — Monorepo
pnpm workspaces: `apps/worker` (Hono API + DO + serves static), `apps/web` (Vite React SPA),
`apps/site` (Astro marketing), `apps/plugin` (Rojo/Luau), `packages/shared` (types, op protocol),
`packages/evals`, `packages/corpus` (RAG build pipeline), `infra` (SQL migrations, wrangler config).

## ADR-008 — No purchases without approval
Everything targets $0 tiers. The only candidate charges (one-time GPU for LoRA training; Workers
Paid $5/mo if free neurons prove insufficient) are presented to the owner for explicit approval first.

## ADR-009 — Zero-secret data plane (R2 pivot)
R2 requires dashboard enablement + card on file → rejected for v1. Blob store = per-project
Durable Object SQLite (messages, gzipped checkpoints, op logs). Supabase keeps auth + registry
(profiles/projects/feedback/waitlist) accessed ONLY with the user's own verified JWT + anon key +
RLS — the Worker never holds a service-role key. Supabase project npqvyijsvzkuwddyhtpm uses
asymmetric ES256 signing keys; Worker verifies via JWKS (cached). Quota = per-user QuotaDO
(authoritative credits ledger, daily reset). Pairing codes = singleton PairingDO (KV free tier
allows only 1k writes/day, so KV is reserved for JWKS/config cache).
Provisioned: D1 golem-corpus 32c9471e-a7d7-49ee-a8fe-0a7def2c68bd, KV cc341a7db4d748139f161fdc292e6e84,
Vectorize golem-docs (1024d cosine; may recreate at 384d pending free-tier stored-dims check),
CF account e9b8acf2e89a1de289a1ee4abb0f3f8d, workers.dev subdomain moshe-barami111 (rename = user
decision, breaks 2 existing worker URLs). Corpus embedding runs through an admin-gated worker
endpoint (AI binding) so no raw CF API token is ever needed locally.

## ADR-010 — What shipped, and what the evidence was
Deployed: worker `golem` (API + D1-backed static hosting of both frontends), Astro marketing site,
React SPA at /app, Luau plugin at /plugin.rbxm (distribution superseded by ADR-017 — the plugin now
ships from the Creator Store and the public .rbxm download is retired), 8,326-chunk RAG corpus,
30-user load validation,
adversarial security audit with 12 fixes verified live.

Model choice is evidence-backed (`docs/evals/FINDINGS.md`): gpt-oss-120b scored 97.6 overall on 56
Roblox tasks vs 94.3 (qwen2.5-coder-32b) and 88.2 (qwen3-30b), and is also the cheapest of the
three. Forced RAG injection measured *worse* (−2.4 clay, −0.7 stone), so retrieval stayed an
agent-invoked tool rather than automatic prompt stuffing — a decision made by measurement, not taste.

Two behavioural failures were found by running the real product against real Studio and fixed:
the agent guessed Creator Store asset ids, and it looped on `search_docs` instead of building.
Fixes: build-from-primitives guidance, an explicit ban on guessed asset ids, duplicate-tool-call
refusal in the agent loop, and a steer injected when several steps pass with nothing built.

## ADR-011 — The one paid decision, deliberately not taken unilaterally
Workers AI's free allocation is 10,000 neurons/day (~100k input + 100k output tokens) shared across
ALL users of the service. Golem exhausted it during testing on day one. The product now handles this
gracefully (a plain-language "at capacity, resets at midnight UTC" message; project state untouched),
but the free tier cannot support real users. Workers Paid is $5/month and is exactly the stated
budget. It is presented to the owner for approval rather than purchased.

## ADR-012 — The agent must see its own work

**Context.** Golem scored 98.9% on a 56-task eval suite and produced a scene the owner rejected on
sight: a flat grey slab, four primitive poles, a trophy made of three stacked boxes. The eval suite
measures coding competence and is structurally blind to how anything looks. Worse, the root cause
was in our own prompt — `prompts.ts` told the model "a convincing trophy, tree, car or sword is a
handful of well-placed parts". The three-primitive trophy was compliance.

**Decision.** Give the agent pixels and a quality gate, and fix the prompt that caused it.

Roblox exposes no viewport readback to plugins — verified against live Studio, not assumed:
`ThumbnailGenerator` is not a valid service, and `CaptureService:CaptureScreenshot`'s callback never
fires in edit mode. The Studio MCP's own `screen_capture` times out too. So the plugin rasterises
the scene itself (`Render.luau`), the Worker encodes a PNG (`png.ts`), and GLM-5.3-flash critiques
the image (`vision.ts`). Hard-fail checks computed from geometry cap the score regardless of what
the model says, so "every object exists" cannot buy a pass.

**Evidence.** The rejected scene scores **2/10**; the critic independently reached the owner's own
words ("This is programmer art"), and additionally caught a floating neon debug cube and a sign
mounted edge-on. A scene rebuilt from the world-building rules scores **5/10** — still failing,
correctly, because it has no `PointLight` instances. `packages/evals/tasks-visual/regression/RESULTS.md`.

**Cost.** ~67 neurons per critique; a Stone build goes from 511 to ~660–727 neurons, so daily
capacity at the unchanged cap falls from ~49 builds to ~34–38. The ceiling did not move.

**Known gap.** The rasteriser draws boxes only. Meshes, terrain, decals, textures and particles are
invisible to it, so a mesh-heavy scene is under-represented in its own critique.

## ADR-013 — Reasoning effort: `high` is nearly free, `medium` is a trap

**Context.** The GLM migration set every path to `reasoning: low`, on a measurement taken at
`max_tokens: 100` where higher effort returned nothing. The owner objected that thin thinking on
design work is exactly the problem, and asked for an adaptive policy.

**Decision.** Two tiers: Clay runs `low`, Stone and Rune run `high`, and escalation to `high` fires
on prior failure, observed visual defects, ambiguity, multi-system work or an irreversible change.
**`medium` is never selected.**

**Evidence** (live service, 2026-08-30, two samples per cell, three task types). Re-measured at real
production token budgets rather than 100 tokens:

- `medium` cost **3–6× `low`** and returned **zero output** on two of three task types — it spent
  the entire budget on reasoning (7,488 chars on design, 10,669 on debugging) and hit `finish_reason:
  length` before writing an answer.
- `high` cost **3–29% more than `low`** — 40.8 vs 39.7 neurons on the design task — and returned
  longer, better-structured answers, reasoning briefly (161 chars) rather than at length.

The original "higher effort returns nothing" finding was real but was an artefact of the tiny token
budget; at production budgets it applies to `medium` only. Buying better judgement on build work
turned out to cost about 3%, which is why Stone's default moved rather than staying at `low` out of
inertia.

## ADR-014 — Meshy is a build-time probe, not an asset source

**Context.** The owner confirmed Meshy Premium (assets owned outright, no attribution) with 2,180
credits, approved for build-time creative work, and named the Golem character as the top priority.

**Decision.** Spend was stopped at **70 credits (3.2%)** after three generations, and **no generated
asset ships**. The credits bought findings rather than assets, which is the better trade.

**Evidence** — `assets/generated/PROVENANCE.md`, with per-asset QC tables:

- Two character attempts, both rejected. The first produced an organic **skeletal** figure with a
  skull face and anatomical hands and toes. The second, with the negative space stated as explicitly
  as the 600-character limit allows ("NO FACE… no eyes, no mouth… no fingers… no toes"), produced an
  anatomically muscular human male. **Text-to-3D does not honour negative prompts and pulls hard
  toward human anatomy**, so stylised blocky characters are out of reach. The site keeps its
  hand-built procedural three.js golem, which is on-brand, weighs nothing and animates.
- A barrel probe produced correct form but crude execution — at a Roblox-appropriate 2.9k triangles
  the stave gaps became jagged spikes, plus a detached fragment. **For simple rotationally symmetric
  props, procedural geometry beats generation.**

**Two API traps, both found by measurement and now documented:** `target_polycount` is silently
ignored without `should_remesh: true` (365,226 triangles against a requested 18,000), and `origin_at`
is ignored without `auto_size: true`, leaving the pivot at the model's centre so it sinks through the
floor. Verified in both directions.

**The general lesson**, and the reason `packages/evals/src/glb-inspect.mjs` exists: every structural
check except size passed on an asset that was completely unusable. Polygon counts cannot tell you a
model looks wrong — the same failure mode as scene quality, one level down.

**Runtime position unchanged.** Meshy is never called at runtime, never on a user's behalf, and no
user action can spend a credit. Nothing in `apps/worker` or `apps/plugin` references it. Roblox's own
free `GenerationService` is the runtime generation path, behind a QC gate.

## ADR-015 — The visual gate fires whether or not the agent asks for it

**Context.** ADR-012 gave the agent eyes. Having the tools is not the same as using them: measured,
the agent replied *"One part is still Plastic — finding and fixing it, then a visual inspection:"*
and stopped, announcing work it never did.

**Decision.** Two automatic guards in the agent loop, both bounded.

1. **Automatic critique.** When a builder-mode run has changed the project on a visual request and is
   about to reply without ever having looked, the session runs `inspect_visually` itself. A failing
   gate is pushed back as work to do. Charged once per run, only with steps in hand.
2. **The no-op guard.** A builder run ending in prose with no change is steered back to act rather
   than allowed to report success. At most twice per run.

**Two capacity changes were needed to make the loop closable**, both found by running it:

- Output budgets were too small to *express* the new quality bar. The model emitted a 5,326-character
  `run_luau` build script; at 2,400 output tokens it was cut mid-JSON, the tool call was unparseable,
  and the agent silently built nothing while reporting "Done." Stone now budgets 4,400 with a 5,600
  ceiling, and the prompt requires staged calls.
- Step limits of 3/8/14 were sized for build-only runs. The visual loop spends eight steps by itself.
  Now 3/16/24.

**Measured effect on one task:** a lamp post went from a 4-part grey stick to 86 parts across four
materials with glass mullions and a light, and the critique moved from "there is a stray concrete
slab and no mullions" to "the column does not taper and the base lacks ornament".

## ADR-016 — Measure the pixels, not only the scene

**Context.** ADR-012 gave the agent eyes and ADR-015 made it use them. Neither made the *image*
measurable: every hard-fail read scene properties, and `png.ts` decoded the RGB buffer only to
re-encode it. The loop rendered pixels and then judged everything except the pixels.

That gap had a measured cost. `b3-plaza` built **725 parts across 10 materials with 5 lights** — a
40× increase over the scene the owner rejected — and passed every property check while its plan view
rendered as **one uniform grey tone across the whole frame**. No property could see that.

**Decision.** `apps/worker/src/pixel-stats.ts`: luminance deciles, RMS contrast, Hasler-Süsstrunk
colourfulness, Sobel edge density and dominant-tone share, computed over the buffer already in
memory. Zero model calls, single-digit milliseconds. Its failures join the property hard-fails and
the numbers are shown to the critic beside the images.

Deliberately **not** no-reference image quality assessment. NR-IQA measures distortion — blur, noise,
compression — and these renders are sharp, noiseless and evenly exposed, so every NR-IQA axis reads
*clean* on a scene that looks terrible.

**Calibrated, not imported** (`packages/evals/src/pixel-stats.test.mjs`, which prints the numbers):

| fixture | colourfulness | edge density |
|---|---|---|
| baseline (rejected) | 48.4 | 0.053 |
| improved | 49.5 | **0.174** |

**Edge density separates 3.3×. Colourfulness does not separate at all** — sky and ground fill most of
every frame and are themselves strongly coloured, so whole-frame colourfulness measures the backdrop.
It is kept only as a floor against total greyness (a uniform plate scores under 1), not as a palette
score. Restricting it to the geometry mask would fix that and has not been done. Recorded rather than
quietly dropped, because a statistic that looks like it works and does not is worse than none.

**Why this and not a trained judge.** `docs/research/hf-specialists-2.md` surveyed ~110 candidates
across nine domains with two independent adversarial verdicts each, and concluded: train nothing,
adapt nothing, adopt nothing. Two of the owner's four tests fail outright — no legal dataset exists
and no suitable model is reachable from Cloudflare Workers AI — and Workers AI BYO-LoRA is closed on
rank, size and base-model grounds. What was actually missing was never a model. It was numbers.

## ADR-017 — Distribution: the Creator Store is the install path, and the .rbxm download is retired

**Context.** ADR-010 recorded shipping the "Luau plugin at `/plugin.rbxm`" — a file the user
downloaded and dropped into Studio's local Plugins folder by hand. That path was right for getting
to a working product and wrong for having one. A hand-placed file is never updated, is not listed in
Studio's plugin management window, and gives us no way to ship a fix to anyone who already has it.

The plugin is now uploaded to Roblox as asset `132128477945417` (AssetTypeId 38, Plugin, owner user
11279664020). **Uploading is not distributing.** Roblox's own documentation ends the upload flow at
"Your plugin is now available to you in the Toolbox under the **Inventory** and **Creations** tabs";
publishing is a separate human toggle — Creator Hub → Development Items → Configure → Distribution →
**Distribute on Creator Store** → **Save Changes**, after which "the asset becomes public". No
moderation gate is documented anywhere in that flow. Waiting will not change anything; a person has
to flip the switch.

**Liveness is measurable, and only one signal works.** Measured 2026-08-31 against two known-listed
controls:

| probe | Rojo `6415005344` | Moon Animator `4725618216` | Golem |
|---|---|---|---|
| `economy/v2/assets/{id}/details` | 200 | 200 | **200** |
| `develop/v1/plugins?pluginIds={id}` | 200 | 200 | **200** |
| `assetdelivery/v1/asset?id={id}` | 302 | **401** | 401 |
| `toolbox-service/v1/items/details?assetIds={id}` | **200** | **200** | **404** |

`economy` and `develop` return 200 for our *unlisted* asset, so neither can gate anything.
`assetdelivery` returns 401 for Moon Animator, which is fully listed — it tracks free/public-domain,
not store listing. **`toolbox-service` is the only discriminator: 200 = distributable, 404 = not.**

**Decision.**
1. The Creator Store is the only user-facing install path. The public `/plugin.rbxm` download is
   retired from every user-facing surface.
2. The asset id has exactly one definition, `STUDIO_PLUGIN_ASSET_ID` in `packages/shared`; the store
   URL and the liveness probe URL derive from it. A mirrored id would be free to drift.
3. Copy degrades honestly. `/docs/plugin` carries a single `storeLive` constant, false until the
   probe returns 200, and states plainly that the asset is not published yet rather than shipping a
   link that 404s.
4. Manual/local install survives only at `/docs/build-from-source`, labelled as a development and
   debugging path and explicitly not an install path.
5. The reproducible build stays exactly as it was. CI's **Build Studio plugin** job still runs
   `rojo build apps/plugin/default.project.json` and publishes the artifact. Removing a download
   button is not removing a build.

**Consequences we are choosing to accept.**

*No CI publishing, ever, on current APIs.* Open Cloud's asset API supports "Audio, Decals, Images,
Models, Meshes, and Videos" — Plugin is not on the list — and even for supported types "you can only
update the asset content for `.fbx` files". `PATCH develop/v1/plugins/{id}` takes only `name`,
`description`, `commentsEnabled` and is cookie-authenticated, so it is neither sufficient nor safe
from CI. Every release is a human in Studio: **Publish as Plugin → Overwrite an existing asset**.
Keep the asset user-owned; group-owned plugin overwrite has a standing unresolved bug report.

*Permanent version fragmentation.* Studio does not auto-update plugins. Roblox staff confirmed
2026-04-27 that the bulk **Update all Plugins** button was broken and that per-plugin **Update**
buttons still work — i.e. updating is an explicit user click, and always has been. The worker must
keep serving old clients indefinitely.

*The plugin cannot discover its own version.* Neither `Plugin` nor `StudioService` exposes the
plugin's version or asset id; the full member lists were enumerated to confirm it. The build-time
`VERSION` constant in `apps/plugin/src/init.server.luau`, already sent as `pluginVersion` on every
poll, is the only mechanism available — and it cannot be retrofitted onto installs that already
exist, which is why it ships before distribution rather than after.

## ADR-018 — The three modes a user picks are Plan, Agent and Super Agent

**Context.** ADR-001 named the modes Clay, Stone and Rune and called them user-facing. That
changed, and the change was made in the code and in the mission without ever reaching this log:
`packages/shared/src/index.ts` states that "Clay, Stone and Rune are internal specialist identities,
not user-facing brands: nothing in normal product UI should name them", the master mission §15.3
gives the primary modes as **Plan / Agent / Super Agent**, and the app implements exactly that —
`PRODUCT_MODE_INFO`, the composer, the landing page, and a regex in
`components/roadmap/model.ts` that strips the specialist names out of worker copy before rendering
it.

Everything except the documentation site, which went on teaching Clay, Stone and Rune in 96 places
— the docs nav label, a page title, every mode heading, the pricing table, the calculator, the
changelog and the FAQ. A reader learned "Clay", opened the app, and found no such thing.

**Decision.** The public vocabulary is Plan, Agent and Super Agent. The specialist axis
(`GolemMode`: clay/stone/rune) is preserved exactly as it is on the wire, in storage and in the
Credits ledger — `ClientMsg.chat` still carries `mode: GolemMode` — so no stored session changes
meaning. Translation happens at the edge, through `PRODUCT_MODE_TO_SPECIALIST`.

Internal documents keep the specialist names, and `docs/COST-MODEL.md` deliberately does: it
measures specialists. `scripts/check-credit-figures.mjs` therefore reads a mode's neuron figure by
its internal name and checks the published figure by its public one.

**Consequence.** `scripts/check-site-semantics.mjs` fails the build if Clay, Stone or Rune appears
in visible copy on any built page. The site was renamed on 2026-09-01; a mechanical substitution
needed two follow-up passes for sentences it broke, since "Agent" is an ordinary word and "agent
step" now reads as two things.

**Recorded late, on purpose.** The decision predates this entry by some margin. Writing it down
now rather than leaving ADR-001 standing is the point: a decision log that contradicts the shipped
product is worse than one with a gap, because it is read as current.

---

## ADR-019 — Plans, prices and allowances: Free / Builder / Studio

**Date.** 2026-09-14

**Owner statement.** Moshe, in session, with a design attached:

> "merge everything and choose whatever on that pricing and add this design i want:
> https://claude.ai/artifact/NP6vVjzimxVYzKQ4AmUcfs"

That artifact's own pricing section states, verbatim:

> Pricing — Credits, not seats.
> Free — $0 — 2,000 credits to start. Apple model only.
> Builder — Popular — $12 /mo — 40,000 credits a month. Both models, including MAX.
> Studio — $40 /mo — 160,000 credits, shared across your team's places.

**Decision.** The plan set becomes **free / builder / studio / enterprise**, at the owner's prices
of **$0 / $12 / $40 / negotiated**. `pro` and `team` are gone as ids and as names.

Allowances are NOT the artifact's credit figures, and this is the part that needed deciding rather
than transcribing:

| plan | per day | per month | builds/month | costs to serve | price |
|---|---|---|---|---|---|
| free | 231 | 2,310 | 30 | $0.76 | $0 |
| builder | 416 | 12,600 | 163 | $4.16 | $12 |
| studio | 700 | 21,000 | 272 | $6.93 | $40 |
| enterprise | 833 | 25,000 | 324 | $8.25 | negotiated |

**Why not the artifact's numbers.** The binding constraint is `DAILY_NEURON_CEILING` — 25,000
neurons a day, which is 833 Credits, which is **about 11 quality-gated builds a day for every user
combined**. At 1 credit = 1 Credit, the artifact's Builder tier alone wants 40,000 a month, or 519
builds; the whole service makes 329. One customer would need more than everything there is.

So three of the four old rows were promises the service could not keep, and had been for as long as
they existed: team granted 1,500/day and enterprise 6,000/day against a service ceiling of 833, and
free granted 60/day against a build that costs 77 — a trial that could not finish one job. Those
were never pricing mistakes. They were arithmetic nobody had done.

**What this does not decide, and why.** Raising the ceiling is the owner's bill, so it is not made
here. §12.5 puts price points in the owner's hands, and BudgetDO is not one safety net among
several — AI Gateway runs on Standard billing with uncapped overage, so it is the only one. Raising
it is the single change in this repository that can cost real money while every test stays green.
See OWNER-HANDOFF for what each tier would cost to actually fill.

**Consequence.** `scripts/check-offer.mjs` reports OFFER COHERENT for the first time. The marketing
site, the docs and the app now READ `PLAN_LIMITS` instead of restating it — pricing.astro,
credits-and-limits.astro and CreditMeter.astro all had typed-in figures, and the site was still
advertising a Pro waitlist at 400 Credits a day for a tier that no longer exists under that name or
that number.

---

## ADR-020 — Visual direction: deep blue, Archivo over Figtree

**Date.** 2026-09-14

**Owner statement.** The same message, with the same artifact:

> "add this design i want: https://claude.ai/artifact/NP6vVjzimxVYzKQ4AmUcfs ... and use claude
> design for everything needed and custom brand assets"

**Decision.** The public face moves to the artifact's direction:

- ground `#080a0f`, a blue radial hero `#1f5fd0 → #123a8a → #0b1733 → #080a0f`
- accents `#2f7dff` and `#6fa8ff`, with `#38b6ff` and `#8b5cf6` as secondary
- text `#f3f5f9`, muted `#8d95a8`, hairlines `rgba(255,255,255,0.055)`
- display type **Archivo**, 800 weight, `font-stretch: 118%`, uppercase, `letter-spacing: -0.022em`
- body **Figtree**, mono **Geist Mono**

**CORRECTION, same day.** This entry first said the change "reverses a recorded decision" — that
the direction on file was minimal cinematic charcoal stone, warm `#0b0a09` with an ember accent. I
wrote that from memory and did not open the stylesheet. `apps/site/src/styles/landing.css:38-40`
says the opposite in as many words: *"The previous warm palette (#0b0a09 ground, #c98a3c amber)
belonged to Golem and is gone; do not reintroduce warm tones here."* The landing already grounds at
`#07080f` with an azure accent sampled from the product mark. That reversal happened before this
change; I nearly recorded it twice.

Leaving the mistake visible rather than editing it away, because the entry immediately below it
warns about exactly this failure — a decision log that contradicts the shipped product is read as
current — and I produced an instance of it inside the warning.

**So what actually changes is smaller and different in kind.** The palette barely moves: `#07080f`
to `#080a0f`, one azure accent to a three-stop blue-violet ramp. The real change is TYPOGRAPHY and
STRUCTURE:

- Inter throughout → **Archivo** at `font-stretch: 118%`, weight 800, uppercase, for all display
  type, over **Figtree** for body and **Geist Mono** for metadata. The stretch axis is not optional:
  without it the type reads as a different design entirely.
- One viewport with nothing below the fold → a scrolling page with five sections: hero, product,
  models, how it works, pricing.

That second one supersedes the landing's own founding constraint, recorded in
`apps/site/src/styles/landing.css:1-22` and `docs/DESIGN-SPEC.md` §0–§1: *"One viewport. No scroll.
The whole proposition held in a single frame."* Subjects that were deliberately moved off the
landing — how it works, pricing — come back onto it. That is the owner's call, and DESIGN-SPEC has
to be updated with it rather than left to contradict the page.

**Scope.** `apps/site` — the public marketing surface. The signed-in app keeps its own palette for
now; a half-migrated app is worse than either whole direction.

**Three departures from the artifact, and why each one is not a liberty.** The design is
implemented section for section, with its own headings, its own lede sentences and its own
composition. Three lines of its copy state things this product cannot keep, and shipping them
would have been a capability claim with no capability under it:

1. **"Two models" → "Modes", and two cards → three.** `apps/worker/src/router.ts` routes every
   authoring mode to the same model. What differs between modes is how much work the mode does.
   The artifact's OWN lede — *"Same builder, two settings"* — is exactly right; only the eyebrow
   above it overclaims, so only the eyebrow changed. The count is three because the product has
   three: Plan, Agent, Super Agent (ADR-018).
2. **"Apple model only" on the free tier is dropped.** A plan-conditional model entitlement has no
   code path in `gateway.ts`. It would advertise a restriction nothing enforces and, in the same
   breath, a capability nothing withholds.
3. **"Credits" → "Credits".** Credits already names the purchased, non-expiring balance in this
   product. Two meanings for one word on the page that introduces the unit is how a reader plans
   against the wrong number.

**Consequence.** `docs/DESIGN-SPEC.md` §0 and §1 are rewritten. They had been describing the warm
Golem palette, Inter, and one non-scrolling screen — none of which was on the page, and two
separate changes had left them behind. That file opens by claiming precedence over "an older
written description", so a stale copy of it is not merely unhelpful: anyone following it faithfully
would have reverted two decisions on purpose.

`tests/e2e/landing.spec.ts` retires the one-viewport assertions deliberately rather than deleting
them, and replaces the `never an anchor` ban with the rule it was standing in for — every
destination must resolve, which for an anchor means naming an element that is on the page. That is
strictly more than the ban checked. The three departures above are asserted as prohibitions, so
re-introducing the artifact's wording fails the build rather than shipping.

## ADR-020 — A guard written as `>` fails open on a value nobody could read

**Date.** 2026-09-15

**Context.** `BudgetDO` is the only ceiling on AI Gateway spend. The gateway is on Standard
billing, which bills overage with no platform ceiling, and its alerts neither pause spending nor
fire promptly. Every admission check in the path was a comparison of the form
`if (tooBig > limit) refuse`.

**The defect.** `NaN > n` is `false`, so a cost that could not be computed passed every guard.
Each step is individually reasonable and the composition bills the owner for nothing:

    providers/cost.ts     Math.max(0, inputTokens)       NaN for a non-numeric token count
    gateway.ts:299        estimate > MAX_NEURONS_PER_REQUEST    false — admitted
    do/budget.ts:274      the DO's own copy of that check       false — admitted again
    the DO boundary       JSON.stringify(NaN) is null           nothing wrong ever arrives
    /reserve              Math.max(1, Math.ceil(null))          reserves ONE neuron, any size
    /settle               Math.max(0, Math.ceil(null))          records the call as costing NOTHING

The provider bills, the ledger does not move, neither cap sees the call, and nothing logs. A
string is worse: `Math.max(1, Math.ceil('abc'))` is NaN, which lands NaN in stored state.

"The DO checks it too" was not a mitigation. Both layers failed by the same mechanism, which is
what defence in depth stops being when both layers are the same defence.

**Decision.** Refuse rather than coerce, at the boundary. `readableNeurons` (do/budget.ts:82)
returns `null` and each caller fails closed on its own terms. A clamp does not validate — it
converts "I could not read this" into a confident small number, which is the defect with better
manners.

**The exception, and it is directional.** `/settle` runs AFTER the provider has been paid, so
refusing there records the spend as zero — the defect itself. It charges the conservative
reservation and marks the response `estimated`. The rule is therefore: **refuse where the caller
can still be told; coerce only where refusing would itself falsify the ledger, and say so in the
response when you do.**

**Observability is part of the fix, not a nicety.** An unreadable `reserved` is deliberately not
subtracted, because guessing would let one caller erase another's hold — so it leaks until the UTC
rollover. That is fail-closed and it was also *silent*: capacity shrank and read as demand. Both
leak points now warn with the model and kind. A state that is honest and unobservable is most of
the way back to the defect.

**Do not "simplify" this back.** `??` defends `undefined` and `null` only — never NaN, a string, or
Infinity. Any `Record<Union, T>` lookup and any `>` against a client-supplied number has the same
shape. The same defect removed the agent's step ceiling (`3a367d1`) and handed an unrecognised mode
every write tool (`c79f7e3`).

**Found by.** rbxai-04, executing `BudgetDO` for the first time. Its only previous test read
`budget.ts` as a string and regexed it, so it proved the source contained a clamp and never
constructed the object. G4 — "the admin spend route can only ratchet down" — rested on that, was
marked met with red-first evidence, and was honest about what it measured: a file. G4 now runs
against the object.
