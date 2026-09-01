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
Free: daily "Sparks" energy quota sized so worst-case usage stays inside the free/paid-plan neuron
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
(authoritative sparks ledger, daily reset). Pairing codes = singleton PairingDO (KV free tier
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
Sparks ledger — `ClientMsg.chat` still carries `mode: GolemMode` — so no stored session changes
meaning. Translation happens at the edge, through `PRODUCT_MODE_TO_SPECIALIST`.

Internal documents keep the specialist names, and `docs/COST-MODEL.md` deliberately does: it
measures specialists. `scripts/check-spark-figures.mjs` therefore reads a mode's neuron figure by
its internal name and checks the published figure by its public one.

**Consequence.** `scripts/check-site-semantics.mjs` fails the build if Clay, Stone or Rune appears
in visible copy on any built page. The site was renamed on 2026-09-01; a mechanical substitution
needed two follow-up passes for sentences it broke, since "Agent" is an ordinary word and "agent
step" now reads as two things.

**Recorded late, on purpose.** The decision predates this entry by some margin. Writing it down
now rather than leaving ADR-001 standing is the point: a decision log that contradicts the shipped
product is worse than one with a gap, because it is read as current.
