# 10. Website, web app, brand and design history

Written 2026-10-04 by reading the repo (`/Users/moshe/Developer/RbxAI`), the two v4 worktrees, the owner's memory folders and the live origin (`curl`, read only). Everything is sourced to a path or command. Where the evidence is thin, the text says so.

## 10.0 Summary for planners

- Apple has **two web surfaces**: a marketing site (`apps/site`, Astro 7, static, served out of D1 by the worker at `/`) and a signed-in web app (`apps/web`, React 19 + Vite, served at `/app`). Both share one token set by convention, enforced by tests.
- The owner has now rejected **four design directions in about three weeks**: the warm Golem charcoal look, the deep-blue/azure look, the green "cinematic graphite" look and the calm near-black-plus-blue-with-glass look, and finally **Ember Rail (orange)**. His consistent complaint on 2026-10-04: nothing was ever "new in the actual design language"; the dashboard, pages and chat kept looking like the old product with new paint (`docs/autonomy/DECISIONS.md` D-EMBER-2 on branch `integration/caps`).
- His latest order is to base the new website on **ai-sdk.dev** and **github.com/uhub/awesome-llm**. A written spec exists (`docs/handoff/2026-10-04/design-language-v4.md`, "the Geist line"). Two agents started the work on branches `site-v4` and `web-v4` and were stopped mid-work. **Neither branch builds or is tested** (commit messages say "NOT tested"), and the site branch still has a landing page that imports a layout it deleted. The `/catalog` ("Awesome Apple") page does not exist yet, although the new nav already links to it.
- The live site today (`https://apple.moshe-barami111.workers.dev/`, `buildSha 2ffd22db-dirty` at `/api/health`) is the **September "owner picks + frosted glass + aurora" look**, not Ember Rail and not v4.
- Brand is thin and inconsistent: the product name is "Apple" (renamed from "Golem" on 2026-09-14), **three different logo drawings are live at once**, and the only repo mention of **trademark risk around "Apple" is one open question that was never answered** (`docs/audit/APPLE-LEDGER.md` item 9).
- The "product that builds games" has its own visual identity: the **studded** Roblox UI style (stud tile, gradient colour, black stroke, Fredoka One). It is the default for in-game UI and is selectable in the composer as `UI: Studded | Cartoony | None`.
- The website goal is currently **parked**. `GOAL.md` (set 2026-10-04) lists "the website redesign (`site-v4`, `web-v4`)" under "Parked work".

---

## 10.1 The marketing site today (`apps/site`)

### 10.1.1 How it is built and served

- Astro `^7.3.5` with `@astrojs/sitemap`, package `@golem/site` on main (`apps/site/package.json`). Scripts: `astro dev|build|preview|check`, and `node --test tests/*.test.mjs`.
- It is **not hosted separately**. The built `apps/site/dist` is uploaded into the worker's D1 static store by `node infra/deploy-static.mjs` and the worker serves it (CLAUDE.md "Commands" and "Architecture in one screen"). `/showcase` is **not an Astro route**: `infra/deploy-showcase.mjs` publishes one HTML page plus PNGs on its own (header of that script).
- Live probes on 2026-10-04: `/`, `/pricing`, `/models`, `/proof`, `/status`, `/docs`, `/changelog`, `/app`, `/showcase` return 200; `/catalog` returns 404 (`curl -s -o /dev/null -w "%{http_code}"`).
- The canonical origin is the workers.dev hostname. There is no custom domain: `docs/autonomy/DECISIONS.md` D-VISION-1 says "No domain for now". `Base.astro` falls back to `https://appleworks.pages.dev` as `Astro.site`, a hostname nothing else in the repo mentions; I did not check whether it resolves.

### 10.1.2 Pages (main branch)

| Route | File | Lines | What it is |
|---|---|---|---|
| `/` | `src/pages/index.astro` | 590 | The landing page (see 10.1.3) |
| `/pricing` | `pricing.astro` | 1091 | Plans, a builds-per-month estimator, a capability table, "what a Credit buys" |
| `/models` | `models.astro` | 149 | Now titled "Engine": "One engine builds with you." |
| `/proof` | `proof.astro` | 469 | The full log of one recorded run (1 September 2026, a parkour request, 212 s) with five listed defects |
| `/status` | `status.astro` | 476 | Live `/api/health` check from the visitor's browser every 30 s, plus "Known issues" |
| `/changelog` | `changelog.astro` | 349 | "What shipped, in order" |
| `/discord`, `/privacy`, `/terms`, `/404` | small | | Community link, legal, 404 |
| `/docs` and 10 sub-pages | `src/pages/docs/*.astro` | 90-343 each | getting-started, plugin, connect, credits-and-limits, billing, updating, troubleshooting, privacy-and-data, faq, build-from-source |
| `/docs-index.json` | `docs-index.json.js` | | Search index over Apple's own pages only (`src/data/docs-index.ts` header explains why the worker's `/api/docs/search` is not used) |
| `/showcase` | not Astro | | Gallery of what the model built: the landing says 21 screens and 6 maps |

Layouts: `Base.astro` (243 lines), `Landing.astro` (188), `DocsLayout.astro` (529), `LegalLayout.astro` (95). Styles: `apple-minimal.css` (398, the token source), `global.css` (361, content routes), `landing.css` (1140). Components: `Nav`, `Footer`, `AppleMark`, `BuiltScreen`, `ConsentProof`, `FAQ`, `Marquee`, `ObjectIcon`, a `picks/` kit (NoiseField, PointerRim, BeamFlow, DeviceFrame, ArrowLink, CtaButton, Aura, ParticleWord with their CSS/TS) and a `picks-docs/` kit (Accordion, BeamBorder, BuildEstimator, CodeTabs, DocsKit, Folder, PriceSwitch, ShinyButton, Spotlight, Terminal).

### 10.1.3 Landing structure and copy (from the live page)

Read via `curl https://apple.moshe-barami111.workers.dev/` and the built `apps/site/dist/index.html`. Screenshot of the built page: `planning/sections/img/main-site-landing-dark.png`.

1. Header: mark, "Apple", Product / Engine / Showcase / Pricing / Docs, theme toggle, "Sign in", "Create an account".
2. Hero: eyebrow "Inside Roblox Studio"; H1 "Build it in the place you already have open."; subhead "Describe a colorful cartoon Roblox game. Apple builds it inside your own Roblox Studio place, names every step while it happens, and changes nothing until you say so."; a composer box that cycles three example requests ("Make a twelve-stage obby", ...) and a "Build" button; "Free to start, no card. Plugin availability"; two rows of tappable example chips.
3. "The same request, sent twice": a consent proof, one request sent with edits off (refused, "Nothing was created.") and with edits on (a Part appeared), from a recorded 19 September 2026 run (`src/data/consent-proof.ts`).
4. "The whole log of one run, and the five defects it left behind" (links to `/proof`).
5. "How a run actually goes": pair one place (six-character code), say what you want, look at what it did.
6. "What it reads, and what it can make in your place" (a diagram of idea, place and selection flowing through Apple into scripts, parts, terrain, lighting, 3D models).
7. "What it is good at": four cards (reads before it writes; checks its own work; builds in Luau, not pseudocode; generates real geometry).
8. Three tabbed interactive stages (Read order, Critique, Luau), each tagged "Illustration".
9. "One screen, as the model wrote it": a real tycoon inventory screen the model drew, with measured figures (17,569 characters of Luau, 75 interface objects, 0 image assets), unretouched "including the parts it got wrong".
10. "One engine": the page says Apple answers every request on every plan.
11. Footer: product / docs / legal columns, "Apple Labs", "Apple is a beta service, provided as-is. Not affiliated with or endorsed by Roblox Corporation."

**Copy themes:** honesty about limits (edits are consent-gated, results include the defects, figures are measured and checked), "inside your own Studio", plain words for young creators, and no hype. This is enforced by `scripts/check-copy.mjs`, which bans the sentence shapes of four competitor sites ("describe it, watch it get built", "one prompt, a whole game", "Apple is not just X") and caps display type at 3.5rem (56 px) (`scripts/check-copy.mjs` lines 30-110 and 255-300).

### 10.1.4 Pricing presentation

Live `/pricing` (curl, 2026-10-04):

- Headline: "Start free. Paid plans are not on sale yet." Four plans: **Free** $0 (231 Credits/day, 2,310/month, "about 30 quality-gated builds a month", available now), **Pro** $12/month (416/day, 12,600/month, about 163 builds, "Planned"), **Max** $40/month (700/day, 21,000/month, about 272 builds, "Planned"), **Enterprise** (email, 833/day, 25,000/month, negotiated).
- Unit: "One build is about 77 Credits". "Every plan uses Apple; they differ only in how many Credits they include."
- A month/build switch, a builds-per-month estimator, a "second, shared limit" explainer (a global daily pool of about 33,333,666 Credits that can stop a run with "Apple has reached today's shared building capacity"), a full capability table where every row is shown even when equal, tax and support notes (a person reads `apple.labs.app@gmail.com`; no reply time promised in beta).
- Important honesty: **checkout is not open** ("Checkout not open", "Planned tier"), "Buy extra Credits: Unavailable", and every plan lists "Roblox Studio plugin · public installation unavailable". `/status` lists "Studio plugin installation is unavailable, open since 25 Sept 2026".
- Figures come from a shared plan config, not typed. `scripts/check-credit-figures.mjs`, `scripts/check-offer.mjs` and `apps/site/tests/{build-cost-figures,credit-purchase-claim,pricing-availability,quota-ceiling-copy,unpurchasable-and-shared-cap}.test.mjs` pin them.

### 10.1.5 Docs

A sidebar docs kit with search (Start here: Overview, Getting started, Plugin availability, Connect a project. Using Apple: Credits & limits, Billing & payments. Keeping it working: Updating, Troubleshooting. Trust: Privacy & data, FAQ. Developer: Build from source). Docs are hand-written `.astro` pages with no MDX (`src/data/docs-index.ts` header). The v4 spec suggests adopting awesome-llm's categorised-list structure for the docs index; not started.

### 10.1.6 What the site looks like today (main)

The main branch carries the late-September look: near-black `#000` paper with surfaces `#0a0a0a / #111217 / #181a22`, ink `#fafafa`, **blue accent `#5b7cfa`** for focus and active state, violet only for Autonomous (now removed), frosted "matte glass" fills and a three-wash **aura** behind every page, plus the owner-picked canvas pieces (a `NoiseField` flow-line background behind the hero, a magnetic-rim composer, a ticker of example ideas, a beam-flow diagram, a tablet-framed device panel). Source: `apps/site/src/styles/apple-minimal.css` header and `--glass-*`/`--aura-*` tokens, and the screenshot above. Fonts are a system stack: `docs/DESIGN-TYPE.md` records "no webfont" as a standing decision and `tests/e2e/landing.spec.ts:202` asserts "ships no webfont to fail, no 3D".

### 10.1.7 Tests and checks that constrain any site redesign

These are the load-bearing constraints. A redesign must either satisfy them or restate them in the same commit (never weaken one that guards a fact, link, accessibility, budget or claim; that is the rule written into the v4 agent prompts, `docs/handoff/2026-10-04/agent-prompts/site-v4.md`).

- **Scripts** (`scripts/`, wired in `.github/workflows/ci.yml`): `check-site-links` (every internal link resolves; `/app` is served by the worker so is exempt), `check-site-semantics` (headings and landmarks on the built site), `check-landing-budget` (**20,000 B gzip of markup plus CSS and 36,000 B of inline JS; images 40,000 B**; measured 19,825 B on 2026-09-25, so the budget has almost no headroom), `check-copy` (above), `check-credit-figures`, `check-offer`, `check-proof-figures` (the three landing numbers are recomputed from data), `check-asset-wall`, `check-pixels` (screenshots every route at two viewports in both schemes and fails on a near-blank frame, a bare system-stack font, and two other defects), `check-rebrand`, `check-deadends`, `check-escape-hatches`.
- **Site tests** (`apps/site/tests/`, 51 entries): `contrast.test.mjs` (every text token on every surface at 4.5:1, focus ring 3:1, derived from the token sheet), `type-system.test.mjs` (every `font-family` is a token), `theme-on-every-route`, `living-background`, `animation-actually-wins`, `reveal-cannot-hide-content`, `phone-drops-layers`, `cursor-*`, `picks-landing` (fails if any owner-picked component stops being mounted), `links-resolve`, plus a long list of claim tests (`privacy-claims`, `plugin-*`, `workspace-limits`, `undo-unit-claims`, `export-completeness-claim`, `api-surface-claim`, `balance-visibility-claim`...). Root tests `promises-match-the-product`, `model-claims-are-measured`, `known-issues`, `rebrand-enforced` also read site text.
- **E2E** (`playwright.config.ts`, `tests/e2e/landing.spec.ts`, `atmosphere-on-every-route.spec.ts`, `owner-picks.ts`): runs against `astro preview` on port 4322 at 1440x900, 1366x768 and a Pixel 7. Landing checks include no horizontal scroll, one-row header on a phone, keyboard focus ring, reduced motion hides nothing, every text element clears AA against what is behind it in both themes, no copy that promises an installation path the Creator Store does not have, and credits spelled "Credits".
- A practical warning from `CLAUDE.md`: many worker tests read source text and a pure move can fail them, and "check-landing-budget" is the check most likely to fail a heavier, more graphical landing.

---

## 10.2 The web app today (`apps/web`)

### 10.2.1 Stack and screens

React `^19.2.3`, Vite 6, Tailwind 4 (scoped to the AI surfaces), React Router 7 with `basename="/app"`, TanStack Query, Supabase JS for auth and the project registry, `motion`, `cmdk`, Streamdown + Shiki for markdown and code (`apps/web/package.json`). Package name on main is `@golem/web`.

Routes (`apps/web/src/app.tsx`; page sizes from `wc -l`):

| Route | File | Notes |
|---|---|---|
| `/login`, `/signup`, `/forgot`, `/recovery`, `/reset`, `/confirm` | `routes/auth-pages.tsx` (1,336 lines) | Auth screens; screenshot of login: `planning/sections/img/main-app-login-dark.png` |
| `/` (dashboard) | `routes/dashboard.tsx` (1,236) | Projects: create, edit, tags, pin, archive, delete, export (md/json), templates |
| `/projects/:id` | `routes/workspace.tsx` (1,397) | The chat workspace |
| `/projects/:id/roadmap` | `routes/roadmap.tsx` | Milestone spine, dependency map, brief dialog |
| `/projects/:id/branding` | `routes/branding.tsx` | **Store-page branding for the user's game** (icon, thumbnails, names, descriptions). This is not Apple's own brand; see 10.5 |
| `/usage` | `routes/usage.tsx` (1,088) | Credits, plan comparison, invoices, billing |
| `/settings` | `routes/settings.tsx` (2,677) | Left rail with sections Profile, Security, Connections (Roblox key, **API keys**, Discord), Notifications, Appearance (theme, motion), Region, Privacy, Danger zone |
| `/join` | `routes/join.tsx` | Accept a project invitation |
| `/admin`, `/ui-lab`, `/studio-preview` | lazy / dev only | Admin only for `is_admin`; `ui-lab` is a component specimen book, `studio-preview` is dev-only |

Pairing: `components/pairing-dialog.tsx` is the whole Studio connection surface (what the project is bound to, pair with a six-character code, disconnect, rebind). API keys: `components/api-keys-panel.tsx` (mint, list, rotate, revoke; the secret is shown once). Roblox key: `components/roblox-key-panel.tsx`. Billing lives in `routes/usage.tsx` and `components/plans.tsx` / `order-summary.tsx` and talks to Stripe Checkout (live Stripe is a held launch gate, per `docs/autonomy/DECISIONS.md` D-V3-1).

The shell (`components/layout.tsx`): a permanent rail (`.studio-dock`: brand, grouped destinations, account) plus a modal drawer of conversations, a command palette (`command-palette.tsx`), shortcuts dialog, notification inbox, support dialog, offline banner and an onboarding tour.

Workspace parts live in `components/ws/`: `composer.tsx`, `turn.tsx`, `run-steps.tsx`, `answer.tsx`, `chat-welcome.tsx`, `files-panel.tsx`, `playtest-card.tsx` (sandbox, web-preview and test-results elements), `credits-panel`, `memory-panel`, `instructions-panel`, `automations-panel`, `search-panel`, `asset-choice`, `studio-activity`, `revisions-dialog`, `members-panel`.

### 10.2.2 Design system files

- `src/design/system.css` (967 lines): the original token and element sheet, rebuilt 2026-09-20 against measurements of rosebud.ai (header comment). Still holds the radii, shadows and motion tokens.
- `src/design/apple-minimal.css` (608 lines): the 2026-09-22 "minimal" layer; `--paper #000`, `--accent #5b7cfa`, radii 8/10/12/16/24. Header: "measured directly in the browser against the reference product" (the product is not named in the file).
- `src/design/glass.css` (339 lines): D-GLASS-1 (2026-09-24), a slow aurora behind translucent rail, cards, menus, dialogs and toasts; loaded last in `main.tsx`.
- `src/styles/ai-elements.css` (142 lines): Tailwind styling scoped to the AI surfaces.
- Per-route CSS (`dashboard.css`, `settings.css`, `usage.css`, `auth.css`, `nonworkspace-minimal.css` ...) and per-component CSS.
- Theme: `lib/theme.tsx` plus a pre-React inline script in `index.html` that sets `data-theme` before first paint; the site uses localStorage key `apple-theme`.
- `components/picks/{chat,composer,settings,tech,thinking}/` (about 130 files): the **193 owner-picked components** from the 2026-09-23 picker, re-implemented without new dependencies (`docs/autonomy/DECISIONS.md` D-PICKS-1; commit `d2ced3be`).
- Bundle budget: `scripts/check-app-bundle.mjs` caps the entry graph at 150,000 B gzip and the eager graph at 300,000 B. The round-2 website agent noted the entry chunk was 182,798 B and "currently over" (`docs/handoff/2026-10-02/workflow-scripts/website-round-2-wf_45acd734-01e.js`); I did not re-measure.

### 10.2.3 AI Elements and AICSS

- `src/components/ai-elements/` (about 34 files) is the **genuine Vercel AI Elements** vendored with its Apache-2.0 licence: Conversation, Message, Reasoning, Shimmer, Task, Tool, Confirmation, Code Block, Snippet, Sources, Inline Citation, Suggestion, Prompt Input, Attachments, Artifact, Chain of Thought, File Tree, Image, Sandbox, Test Results, Web Preview, JSX Preview, Canvas/Node/Edge/Panel/Controls/Connection, Commit, Environment Variables, Package Info, Schema Display, plus model logos. The shadcn primitives they import are in `components/ui/` (`NOTICE`, `scripts/vendor-ai-elements.mjs`).
- **Provenance is test-enforced:** `apps/web/tests/ai-elements-provenance.test.mjs` hashes each vendored file after reversing the import alias and compares it to the sha256 in `NOTICE`. A local edit to a vendored `.tsx` fails it. Restyling must therefore go through CSS and wrapper components, not edits to those files (the v4 spec says the same: "restyle them; do not rewrite them").
- `src/components/aicss/` vendors two AICSS pieces (Data Table, Streaming Text, `UPSTREAM.md`, MIT).
- The V3 UI contract (`docs/autonomy/v3/Apple_RbxAI_UI_CONTRACT_V3.md`) mapped 23 component families (UI01-UI23) onto the product. That whole scope was marked history by the 2026-10-04 reset (`GOAL.md`), so treat its table as inspiration rather than a requirement. Its stated product rules that survive as code: no model menu, no Plan/Agent/Autonomous selector, composer hard-disabled until Studio is paired, and a composer "UI theme" with exactly `studded | cartoony | none` (`packages/shared/src/ui-theme.ts`).

### 10.2.4 How the chat shows tool calls

Today the product **hides tool names on purpose**. Sources: `apps/web/src/components/ws/turn.tsx` (header), `run-steps.tsx`, `lib/live-status.ts`, `components/ws/tool-vocabulary.ts`.

- An assistant turn has no card. In order: one live status line while Apple works, then the step trace, then the reply with sources, media, outcome and reply actions.
- The live line is one friendly sentence ("Editing the shop", "Placing things around the map", "Taking a picture of it") that is replaced, never appended. `live-status.ts` states that "no tool name, argument, path, JSON, duration or error code can come out of this module" (decision D-THINK-1, 2026-09-24, comment-only; the entry itself is not in either `DECISIONS.md` file I searched).
- The step trace is AI Elements **Reasoning** (open and shimmering while a step streams, then "Thought for N seconds") plus **Task** (one collapsible group per batch of tools, titled by activity: "Inspecting project, writing Luau and rendering - 7 steps"), each row a plain-word phrase with a Studio class icon for the object it touched and a step mark by outcome (breathing dot while running, drawn check when done, cross if failed). See the Ember Rail workspace screenshot `docs/evidence/ember-rail-2026-10-02/pages/app-workspace-dark.png`: the collapsed row "Inspecting project, writing Luau and rendering - 7 steps" is how a run looks collapsed.
- Product rules behind that: D-UX-2 (2026-09-23) "Outputs are short; detail is hidden" for young non-technical creators; D-REASONING-2 shows the provider's own reasoning text live behind the Thinking disclosure (`docs/autonomy/DECISIONS.md` lines 49-56); `tests/tool-vocabulary.test.mjs` holds the vocabulary table to the worker's tool registry.
- **Conflict to flag:** the v4 spec wants "collapsible hairline rows in mono (`● insert_model Workspace.Shop 1.2s`)" in the app and real tool names in the site's demo (`docs/handoff/2026-10-04/design-language-v4.md`; `agent-prompts/site-v4.md` names `insert_model`, `insert_ui_component`, `add_behaviour`, `insert_sound`, `add_effect`). Showing tool names, arguments and durations contradicts D-THINK-1 and D-UX-2. Which one wins is an owner decision (open question 3).

---

## 10.3 Design history and the owner's verdicts

Sources: `docs/DECISIONS.md` (ADR-001, ADR-020), `docs/autonomy/DECISIONS.md` (D-UI-GREEN-1, D-PICKS-1, D-GLASS-1, D-EMBER-1/2), `docs/DESIGN-LOCK.md`, `docs/DESIGN-TYPE.md`, `docs/FRESH-PUBLIC-DESIGN.md`, git log (commits named below), memory folders, and `planning/sections/02-owner-directives-and-session-history.md` section 2.2 item 2. The owner also has his own **design-history page** in the local owner dashboard (`scripts/owner-dashboard/control/pages/design-history.js`, `cc/platforms/design-history.mjs`) that walks the history from the first commit; useful if a planner has access to his Mac.

### 10.3.1 Timeline

| # | Date | Direction | What it was | Fate |
|---|---|---|---|---|
| 0 | to 2026-09-14 | **Golem warm charcoal** | `#0b0a09` ground, amber `#c98a3c`, limestone `#f2efe8`, Inter, a one-viewport landing "no scroll" (`docs/DECISIONS.md` ADR-020 correction; `docs/FRESH-PUBLIC-DESIGN.md`) | Replaced by the rename. The 2026-08-31 reference images are cited as source of truth there |
| 1 | 2026-09-14 | **Apple rename + azure/violet** (`7fb753ae`) and **ADR-020 deep blue, Archivo over Figtree** | Palette sampled from an owner-supplied mark: azure-to-violet sweep on a blue-cast ground; Archivo 800 at 118% stretch, uppercase; a five-section scrolling page (hero, product, models, how it works, pricing) from a `claude.ai` artifact the owner supplied | Superseded within 6 days |
| 2 | 2026-09-20 | **Cinematic graphite + one green** (`docs/DESIGN-LOCK.md`) | Seven owner references; chosen: near-black graphite, a single restrained green `#8fd3ab`, nothing bolder than weight 400, hierarchy from size and space, glass only on composer and top bar. Six alternatives rejected in writing (bright-blue floating cards, black-and-gold, light frosted glass app, brutalist light, blue-grey drawer) | Then re-aimed at **rosebud.ai "in green"** (`f7fbb750`, `59b282af`). A browser measurement showed rosebud.ai has **no animation at all** and is one monospace face (`8418f970`) |
| 3 | 2026-09-22 | **Quiet near-black + one blue accent** (`6731d5bf` "Redesign Apple frontend end to end", `6662c41b`) | Removed what the owner rejected: horizon canvas, flow-field particles, custom cursor, sound dock, credit meter, **the green accent**. Tokens `#000` paper, `#5b7cfa` blue; app and site share one token file | Owner's later notes call this "the older blue look" |
| 4 | 2026-09-23 | **Owner picks** (D-PICKS-1) | He ticked 193 components in a picker page; 37 went on the public site, 193 into the app, re-implemented dependency-free. D-UI-GREEN-1: green only for status dots | Kept as the foundation of main; Ember Rail then deleted the site half |
| 5 | 2026-09-24/25 | **Frosted matte glass over a slow aurora** (D-GLASS-1, `354ff7c8`) | He said the app was not "glassy, matte, friendly or animated" and was getting more static | Live today on main |
| 6 | 2026-10-02 | **Ember Rail** (D-EMBER-1; PR #12 `6210accf`; round 2 WIP `f0ab5be6`) | See 10.3.2 | **Rejected 2026-10-04** |
| 7 | 2026-10-04 | **v4 "Geist line"** | See 10.4 | In progress, parked |

Also in the record: the design-picker pattern. His memory `owner-question-rounds.md` says "Visual choices go through a picker artifact page", and D-EMBER-2's "Next" says several genuinely different languages would be rendered on the real surfaces and he picks one. Then he skipped that and named references directly.

### 10.3.2 Ember Rail, in detail

- **Process:** `docs/handoff/2026-10-02/workflow-scripts/phase6-website-design-rebuild-wf_446213df-e2e.js` ran three independent designers (angles: playful-craft, premium-tool, bold-editorial), then a judge. Scorecard from `workflow-results/phase6-website-round1.json`: Stud & Plate 35/50, **Ember Rail 40/50**, Front Page 32/50. Ember Rail won on accessibility and low risk, but the judge itself wrote that its **weakness was originality for a young audience**. That is exactly the criticism the owner later made.
- **Spec (D-EMBER-1):** dark by default, flat, hairline borders, one signal colour Ember (`#ff8a4c` dark, `#a63f0a` light), no aurora, glass, gradient or glow, tight radii, system font stack, a new logo (a rounded brick with two studs and a prompt chevron cut out of its face), and a gimmick called the **Baseplate**, a playable brick toy under the landing composer. It deliberately **deleted the owner's own September picks** on the landing (NoiseField, ParticleWord, BeamFlow, PointerRim, DeviceFrame, ticker, scramble).
- **Evidence:** 17 page screenshots at `docs/evidence/ember-rail-2026-10-02/pages/` (e.g. `site-landing-dark.png`: a grid of empty circles beside the hero composer, the "Baseplate"; `app-workspace-dark.png`: orange accents on a conventional left-rail chat). My reading of the screenshots: the landing is the same section stack as before with new colour and an unusual toy; the app is the same rail, thread and composer layout with an orange accent.
- **Round 2** (`docs/handoff/2026-10-02/workflow-scripts/website-round-2-wf_45acd734-01e.js`, branch `design/round-2`) listed the defects of round 1 itself: near-empty sections, the Baseplate "reads as a grid of empty circles", other pages "only re-tokened", an app that still had gradients and 10-12 px text. It was stopped mid-work (`f0ab5be6 WIP website round 2 (stopped mid-work, NOT verified)`).

### 10.3.3 The verdict, and why each direction died

From `docs/autonomy/DECISIONS.md` D-EMBER-2 (read on `integration/caps` via `git show 5174017b:docs/autonomy/DECISIONS.md`) and `planning/sections/02-...md` 2.2 item 2:

> Owner, 2026-10-04, shown the round-1 landing and workspace: "i dont like that either and the problem is that you are never making something new in the actual design language like how the dashboard and pages and the [chat] looks". He also rejected the earlier calm blue look (D-GLASS-1 era). A recolour is not a new direction.

Reading the whole record, the pattern is consistent and is the single most important design finding for the planners:

1. **Every redesign changed palette, type and effects but kept the same page anatomy**: a floating pill nav, a hero with a composer box, a stack of "title, muted line, thing" bands, and in the app a rail plus chat thread plus composer. Even Ember Rail's gimmick sat inside that anatomy.
2. **Earlier rejections were also taste in specific hues** (the green accent was removed on 2026-09-22 "what the owner rejected"; amber and warm tones left with Golem), and **effects** (horizon canvas, particles, cursor, sound dock). The picks were then an additive attempt at "make it feel alive", which produced the glass-and-aurora look. He then asked for it to be "more matte, friendly, animated", then rejected the result as not new.
3. The owner **judges by what he sees, not by green tests** (website-round-2 RULES; memory `visual-quality-bar.md`: "show him the pixels, not the checklist"). The repo's design process, however, produced guard tests as its primary output (hundreds of site and web tests). Planners should assume rendered options in front of him beat any additional spec.
4. The 2026-10-04 memory purge (section 02, item 4) deleted the notes that held the old directions: the blue visual direction, the studded look and visual bar. **Those are gone from the memory folder**; this section is partly a reconstruction from git and docs. `~/.claude/projects/-Users-moshe-Developer-RbxAI/memory/MEMORY.md` today has no design-direction entry other than `visual-quality-bar` and `claude-design-login`.
5. **Claude Design** (a claude.ai design tool) was repeatedly named as the intended source for the rebuild ("website rebuilt from zero (Claude Design when available)", `docs/handoff` HANDOFF text in the worktrees) but it was never used: `/design-sync` is blocked until the owner runs `/design-login` in a real terminal, and `packages/design` is a Roblox rule engine, not a UI library (`claude-design-login.md`).

---

## 10.4 The v4 work in progress

### 10.4.1 The spec (`docs/handoff/2026-10-04/design-language-v4.md`)

Title: "Apple design language v4 ('Geist line'): owner's references, 2026-10-04". Key content:

- **Two references:** ai-sdk.dev for structure, rhythm and component vocabulary; github.com/uhub/awesome-llm for information architecture. "Do not copy Vercel's brand, logo, copy or the triangle mark." (I fetched awesome-llm: a manually curated GitHub list "of awesome LLM frameworks, libraries and software", 20+ categories, each entry a repository link with a short subtitle. My attempt to fetch ai-sdk.dev returned only an agent-oriented text guide, so the spec's description of the visual page, "observed in a browser, 2026-10-04", is the only source for it.)
- **Look:** pure black `#000` canvas in dark, pure white in light; no gradient, glow or atmosphere; colour only from content. Geist Sans and Geist Mono; headlines 56-72 px, weight 500-600, letter-spacing about -0.04em; body 15-16 px muted `#a1a1a1`. 56 px sticky header with mark, "/" and name with a tiny outlined pill. Hero: centred headline, grey subhead, a segmented toggle and a `$ npm install ai`-style install chip. A tabbed interactive demo band: a code window beside a live chat-preview card. A stats row of four big numbers. A split section with logo badges. A four-column feature row. Bento cards with 1 px hairline borders and no shadows. Primary button = white pill, secondary = hairline. Restrained motion (tab crossfade, 1 px card lift, fade-up on scroll; all off under reduced motion).
- **Tokens** (same in both apps): `--bg #000 / #fff`, `--bg-subtle #0a0a0a / #fafafa`, `--fg #ededed / #171717`, `--fg-muted #a1a1a1 / #666`, `--line rgba(255,255,255,.10)`, one functional blue `#0070f3` only for focus rings and prose links, status dots green/amber/red, radii 6/8/12/pill.
- **App in this language:** a slim header with a grid of hairline project cards; chat with a left rail, **white inverse pill for the user message, no bubble for the assistant**, hairline mono tool rows, a 12 px composer with an inverse round send button.
- **`/catalog` "Awesome Apple"** (the "gimmick"): a curated, searchable catalogue of what Apple can build, with a sticky table of contents (top on mobile), a filter box and category chips, and a "Try this prompt" copy button that deep-links to `/app?prompt=...` if the app supports it. Proposed categories: Worlds and terrain, Buildings and props, Characters and NPCs, UI and HUD, Game systems, Animation, Sound, VFX and lighting, Monetisation, Multiplayer, Tools and weapons, Vehicles. "Every entry must be something the product really does, sourced from the tools in `apps/worker/src/tools.ts` and `packages/components/`", and repo claim tests apply.

### 10.4.2 What the two branches contain

Both branches are single WIP commits on top of `d505cd29` of the `integration/giant` line (they are **not** based on `main`, which is 99 commits behind that line). Commit message of both: "WIP (handoff 2026-10-04): unfinished work saved when the session stopped; NOT tested". Diffs via `git -C <wt> diff HEAD~1 --stat`.

**`site-v4`** (`/Users/moshe/Developer/RbxAI-site-v4`, commit `6782c88a`): 61 files, +1,674 / -4,880.

Done (by reading the diff):
- New token sheet `src/styles/tokens.css` (186 lines) with the spec values and three recorded WCAG deviations: `--fg-subtle` raised to `#8a8a8a` dark / `#6d6d6d` light, `--link` `#3291ff` / `#0062cc`, focus `#0070f3`. Geist and Geist Mono **self-hosted** as woff2 (`src/assets/fonts/`, SIL OFL text) "so the page makes no third-party request and the privacy page stays true".
- New `base.css` (644 lines, code-window, buttons, badges) and `content.css` (292; the h1 clamp tops out at 3.5rem, so it respects `check-copy`'s 56 px cap that the spec's "56-72 px" would have broken).
- `Base.astro` rewritten (no-flash theme script reading `apple-theme`, theme-color meta). `Nav.astro` rebuilt as the 56 px header: mark, "/", "Beta" pill, links Product / **Catalog** / Engine / Showcase / Pricing / Docs, theme toggle, "Sign in", "Create an account". `Footer.astro` shrunk (-132 lines).
- Docs kit restyled (Accordion, BuildEstimator, CodeTabs, DocsKit, Folder, PriceSwitch, Terminal), pricing, models, proof, status, changelog and docs/plugin re-tokened (a `--ink`/`--muted` to `--fg`/`--fg-muted` rename in 7 pages, 137 lines each way).
- **Deleted:** the whole `picks/` kit (the owner's September picks, 25 files), `Marquee.astro`, `Landing.astro` layout, `global.css`, `landing.css`, `apple-minimal.css`.

Not done / known broken:
- `apps/site/src/pages/index.astro` is **untouched**: it still imports the deleted `Landing.astro`, `picks/*` and `Marquee`, so the site **cannot build** as committed (verified by `git diff HEAD~1 --stat -- apps/site/src/pages` and `grep` of its imports). The new hero, code-window demo with tabs (Build a world / Make UI / Add systems / Sound and FX), stats row, feature row and bento cards from the prompt do not exist yet.
- **No `/catalog` page** (no file under `src/pages`), though `Nav.astro` links to it. `links-resolve.test.mjs` and `check-site-links` would be expected to flag it (not run).
- `picks-landing.test.mjs` pins the deleted picks and was not restated. No tests were changed in the commit.
- Only the Beta pill replaced a version badge; the install chip ("Install the Studio plugin") is unimplemented. Note that public plugin installation is currently unavailable (10.1.4), so a hero install chip is a copy-honesty problem, not just a design task.

**`web-v4`** (`/Users/moshe/Developer/RbxAI-web-v4`, commit `5d167867`): 10 files, +404 / -771.

Done:
- `design/system.css` rewritten to the spec tokens (`--bg`, `--fg`, inverse-pill primary, no accent colour: `--accent` is `#ededed`, `--accent-glow` transparent, focus `#0070f3`), radii 6/8/12, Geist fonts. Legacy names (`--paper`, `--ink`) are kept as aliases so old CSS still resolves.
- New `design/geist.css` (209 lines): "the dock is the header", the left rail becomes a 56 px top bar (mark, "/", name, outlined "app" pill, destinations as plain text links with a hairline under the current one, tools right, an inverse "New chat" pill), loaded last with a `:root[data-theme]` prefix to win the cascade without `!important`.
- `layout.tsx`: removed `StudioAtmosphere`, added a Search button (opens the palette) and a theme toggle in the header. `glass.css` and `studio-atmosphere.tsx` deleted. `index.html` loads Geist from **Google Fonts** (a third-party request, unlike the site branch).
- `nonworkspace-minimal.css` trimmed.

Not done: from the diff the thread layout (inverse user pill, unbubbled assistant, mono tool rows), the dashboard card grid, the composer restyle and the AI Elements restyle are **not in this commit** (`geist.css` covers only the header so far). `tests/glass-shell.test.mjs` pins the deleted glass sheet and was not restated. Typecheck and tests were never run.

### 10.4.3 The "Awesome Apple" `/catalog` idea

- It is the spec's answer to the owner's "gimmick" requirement (the 2026-10-02 brief asked for "a memorable gimmick people will talk about").
- Data source to use: `apps/worker/src/tools.ts` (the agent tool registry), `packages/components/*` (15 runtime component packs: animate, boot, creatures, defenders, economy, fx, gameui, machines, motion, shop, tycoon, upgrades, waves...) and `packages/asset-library` (a UI and icon library with CC0/CC-BY manifests; the app already has a `/library` page listing it, `apps/web/src/routes/library.tsx`).
- Risks the spec itself names: false claims (tests `promises-match-the-product`, `model-claims-are-measured`, `check-copy`). A practical extra risk: a "Try this prompt" deep link `/app?prompt=` needs app support that I did not find (no `prompt` query handling was searched for exhaustively).
- A related existing asset: `apps/site/public/assets/wall/` (CC0 icons, textures, Poly Haven thumbnails) and the removed "asset wall" claim guard `scripts/check-asset-wall.mjs`; the catalog could reuse this imagery but the wall was dropped ("the asset wall is not coming back", commit `10f2b127`).

---

## 10.5 Brand

### 10.5.1 Names

- **Product: Apple.** Renamed from **Golem** on 2026-09-14 (`7fb753ae feat(brand): rename the product to Apple`, 82 files, wire and storage literals left alone). The agent calls itself "You are Apple". Sub-brands in use: "Apple Labs" (footer), "Apple Studio" (the Studio plugin, Creator Store asset `107230158271368`, under the owner's personal account Shahar474 per `docs/PLUGIN-RELEASE.md`), "Apple MAX" (a retired premium model tier).
- **Infrastructure stays `golem`** (worker name, D1, KV, Vectorize, Durable Object classes, wire literals such as `golem.v1`, `X-Golem-Token`) because renaming breaks live sessions (CLAUDE.md "Infrastructure names stay golem"). A later, larger codemod on the integration line renames repo identifiers to Apple while the worker still **accepts both wire spellings** (`fc3c4b98`; `/api/health` shows `"compat":"wire-both"` with 372 uses of the legacy headers). The owner's 2026-10-02 standing consent allows removing "golem" everywhere including Cloudflare/Supabase/Sentry (memory `owner-standing-consent-2026-10-02.md`); not done yet.
- Guard: `scripts/check-rebrand.mjs` plus `tests/rebrand-enforced.test.mjs` check that no user-visible string says Golem, both in git and in the **deployed** bundle.
- Contact: `apple.labs.app@gmail.com` (pricing page).

### 10.5.2 Marks: three drawings in production

1. **Favicon, share card, PWA icons:** an azure **studded brick** on a near-black rounded tile (`apps/site/public/favicon.svg`; source render `apps/site/brand/apple-mark-source.png`, an isometric blue cube with one stud standing on a white studded plate). Provenance in the favicon header: the owner asked for the brand to be made in ChatGPT, it was generated in his own ChatGPT account from a prompt naming the palette, then redrawn as vector. Icon set generated by `scripts/make-brand-assets.mjs` (`pnpm brand:check`).
2. **Site header and footer:** `apps/site/src/components/AppleMark.astro`, a "folded-sheet" outline (three paths, `currentColor`). It also sets the web app's inline favicon (`apps/web/index.html`) and the assistant avatar (`apps/web/src/components/ws/model-mark.tsx`).
3. **Web app rail, login, auth pages:** `AppleGlyph` in `apps/web/src/components/glyphs.tsx`, a **hexagon outline containing an isometric cube with a stud**. Its comment records a past inconsistency ("the mark in the product and the mark on the site were different objects").

The login screenshot (`planning/sections/img/main-app-login-dark.png`) shows the hexagon-cube while the landing screenshot shows the folded sheet. No document defines which is canonical; Ember Rail's single "brick with two studs" logo (commit `9054403a`, gone with the revert) was an attempt to unify them, and v4 spec says only "Apple keeps its own name and mark (`AppleMark.astro` / branding components)", which does not resolve which one.

### 10.5.3 The `branding` folder in the web app is not the brand

`apps/web/src/components/branding/` and `routes/branding.tsx` implement **Generate Branding** for the user's game (V3 gate G15): icon, thumbnails, names and descriptions for the Roblox store page. They carry a "Branding art - not gameplay evidence" label. Planners should not confuse this with Apple's own brand assets.

### 10.5.4 Trademark and naming risk

- The repo mentions the risk exactly once as a decision, and **never resolved it**: `docs/audit/APPLE-LEDGER.md` item 9: "Does 'Apple' survive legal review? Apple is a registered trademark of Apple Inc. across software and developer tools. Renaming a public-facing SaaS to it is a legal exposure, not a technical one. Confirm the name before Phase E touches 322 files". The rename was done anyway (2026-09-14; the larger rename 2026-10-04), with no legal review recorded in `docs/DECISIONS.md` or the autonomy decisions. `planning/sections/15-open-decisions-risks-planning-frame.md` line 76 repeats it as "unexamined".
- The Ember Rail judge also noticed a design-level version: its first logo had a leaf-topped brick that "could be read as resembling Apple Inc.'s mark", so the leaf was replaced by studs (`phase6-website-round1.json`). The current marks avoid a fruit shape.
- Roblox side: the footer disclaimer "Not affiliated with or endorsed by Roblox Corporation" exists, and `docs/research/competitors.md` section 3 sets rules for using the word "Roblox" (nominative use, never first word, no Roblox logo or red branding, no domains containing "roblox"). The product's strapline "AI builder for Roblox" follows that.
- Other third-party brand uses: Vercel AI Elements (Apache-2.0, in-repo notices) and the AI-SDK references in the v4 spec ("do not copy Vercel's brand"); model-maker logos are vendored (`ai-elements/logos/`) but the product now shows only one engine.
- **Domain:** none beyond `*.workers.dev`; the Discord server, GitHub org and Creator Store listing are branded "Apple" too, so a rename later would touch all of them.

---

## 10.6 The in-game UI style the agent produces

The game visuals Apple builds are part of how the product is judged, and they have their own identity: **studded**.

- **What it is:** "STUDDED GUI, the way the owner's reference video builds it ('How To Make Stud GUI In Roblox Studio', measured frame by frame 2026-10-01)": an ImageButton/ImageLabel whose image is the public stud tile `rbxassetid://6927295847` tiled, a white base tinted by a gradient between two saturated colours, `UICorner` radius 8, a black `UIStroke` of 3, text in **Fredoka One**, white, with its own black stroke. Panels are a coloured header bar over a stud body, cards carry their action button, and the close button is a big red square (`apps/worker/src/stud-ui.ts` header). Ten colour pairs: green, yellow, orange, pink, blue, purple, red, brown, cream, grey (`STUD_COLOURS`).
- **Tool:** `build_studded_ui` (`apps/worker/src/tools.ts` line 5033; implementation `studded-ui-tool.ts`). Pieces `{kind: counter|button|bar|panel, name, text, at (8 anchors), colour, cards}`, up to 24 per screen, additive by default (a new piece of the same name replaces; others stay; `replace:true` rebuilds). Plain summary shown to the user: "Drew the studded screen". The creation skill `ui-studded-gui` (`apps/worker/src/creator-skills.ts` line 330) instructs the agent to script every value and button afterwards ("a screen whose '+' or 'Shop' does nothing is not done").
- **Default look:** `prompts.ts` lines 97-103: "DEFAULT LOOK, Apple's specialty and first priority: modern, bright, saturated, colourful STUDDED Roblox", studded Plastic ground (never Terrain unless asked), and `set_mood "studded"` lighting (blue-tinted ambient, bloom).
- **User control:** the composer's UI theme `studded | cartoony | none`, default `studded` (`packages/shared/src/ui-theme.ts`); it never reskins the website or the app shell (V3 contract, D-EMBER-1 "does not touch"). In the Ember Rail workspace screenshot the composer shows a "UI: Studded" control.
- **Component packs (`packages/components`):** Luau runtime pieces the agent drops into a game: `gameui` (makes the studded HUD work: live money count-up, wave banner, health bar, shop with each item's 3D model, locks, upgrades), `shop`, `upgrades`, `economy`, `waves`, `defenders`, `machines`, `tycoon`, `creatures`, `animate`, `motion`, `fx` (effects and sound), `boot`. The generated Worker file `components.generated.ts` is produced by `node scripts/gen-components.mjs`.
- **Other UI sources:** `docs/ROBLOX-STYLE-SPEC.md` (the simulator/tycoon visual grammar: bright, saturated, high-key, "no dark mode", derived from eight reference screenshots as category evaluation, not source material), D-UIONLY-1 ("every piece of game UI comes from the stored UI library; Apple never draws UI by hand", 2026-09-23) and the CC0/CC-BY UI packs in `packages/asset-library` (D-UILIB-1/2, D-UISTORE-1). The owner's linked paid packs (Magnific, RhosGFX) were deliberately **not** scraped for licence reasons.
- **Evidence of what it looks like in Studio:** `docs/evidence/garden-hud-20260926/native-purchase.png` shows a red-headed "Garden Seeds" panel with yellow stud cards, green "10 Coins" buttons in outlined Fredoka-style text and a "$ 50" counter; the fresh screenshot-only reviewer (blind-review.md in the same folder) called it "readable currency and Shop; colorful garden identity" but criticised the sparse ground, flat horizon and soil seams. This particular screen used an owner-listed imported pack ("rblx-essentials studded-ui") rather than `build_studded_ui` (`docs/evidence/apple-studded-integration-2026-09-26.md`).
- **Brand perception notes:** the landing page's only model output is a tycoon inventory screen with a dark, dense look (`BuiltScreen.astro`, evidence in `docs/evidence`), which is visually **very far from** the bright studded identity the agent is told to produce. The site's own dark developer aesthetic and the product's bright cartoon output are two different worlds; today the first impression of the product does not look like what it makes. That mismatch is a brand question the planners should decide (open question 8).
- **Standing tension:** D-UIONLY-1 (never draw UI by hand, library only) predates `build_studded_ui` (which draws UI) and the studded theme instruction literally says "never insert_ui_component or build_ui" (`packages/shared/src/ui-theme.ts`). The current rule is whichever is newer; the older decision text was not amended in the files I read.
- The 2026-10-04 memory purge deleted "the studded look and visual bar" notes, so the reasoning for studded-as-default now lives only in code and docs.

---

## 10.7 Quick reference: paths

- Site: `apps/site/src/{pages,layouts,components,styles,data}`, tests `apps/site/tests`, e2e `tests/e2e`, `playwright.config.ts`.
- App: `apps/web/src/{routes,components,design,styles,lib}`, tests `apps/web/tests` (223 entries).
- Design docs (many describe superseded looks): `docs/DESIGN-LOCK.md`, `DESIGN-SPEC.md`, `DESIGN-TYPE.md`, `FRESH-PUBLIC-DESIGN.md`, `THINKING-UX.md`, `ROBLOX-STYLE-SPEC.md`, `STUDIO-DESIGN-ASSETS.md`; decisions in `docs/DECISIONS.md` (ADR-001, ADR-020), `docs/autonomy/DECISIONS.md`; v4: `docs/handoff/2026-10-04/design-language-v4.md` and `agent-prompts/{site-v4,web-v4}.md`; Ember history: `docs/handoff/2026-10-02/workflow-*`, `docs/evidence/ember-rail-2026-10-02/`.
- Evidence screenshots I took (headless Playwright against the already-built `apps/site/dist` and `apps/web/dist`, served locally): `planning/sections/img/main-site-landing-dark.png`, `main-site-pricing-dark.png`, `main-app-login-dark.png`. The signed-in app needs a login (mock mode is dev-server only), so no dashboard or workspace screenshot of the current main was possible; the closest are the Ember Rail captures and `docs/evidence/2026-09-22-browser-qa/` (login and landing at four widths).

---

## Open questions this section raises for the planners

1. **Which design process?** Four directions were chosen by the agents' own judges or the owner's written references and each died on sight. Will the planners put two or three **rendered, genuinely different** options in front of the owner (as D-EMBER-2's "Next" said) before building across every page, or build v4 directly because he named the references? (He ordered the second; the repo's own history argues for the first.)
2. **Is the v4 spec itself the right target?** It is a faithful Vercel/Geist-style monochrome developer look. Is that what a fifteen-year-old creator audience (the owner says the readers are "young creators", D-UX-2; he is himself fifteen per `infra/deploy-showcase.mjs` header) should see, or only what the owner likes in ai-sdk.dev? The v4 spec removes colour from chrome entirely; the product's output is the opposite (saturated studded Roblox).
3. **Tool names in the chat:** D-THINK-1 and D-UX-2 hide tool names, arguments and durations for young non-technical users; the v4 spec and site demo show `insert_model ... 1.2s` rows in mono. Which rule wins in the app, and may the site show real tool names while the app does not?
4. **Finish or restart the v4 branches?** `site-v4` is a broken, untested snapshot (landing not rewritten, `/catalog` missing, picks deleted, tests pinning old design not restated); `web-v4` only reworked tokens and the header. They branch from the integration line, not `main`. Does the plan reuse them, cherry-pick the token and font work, or start clean after the "giant PR" merge?
5. **Fonts and privacy:** `site-v4` self-hosts Geist (to keep the privacy page true); `web-v4` loads Google Fonts (third-party request from the signed-in app). Pick one, and check against `privacy-claims.test.mjs` and the privacy docs.
6. **One logo or three?** Which of the studded brick (favicon), folded sheet (site header) or hexagon-cube (app rail) is canonical, or should a fourth be drawn? Note the favicon was generated in the owner's ChatGPT account; its commercial-use and ownership terms were not recorded in the repo.
7. **Legal review of "Apple":** `docs/audit/APPLE-LEDGER.md` item 9 was never answered and the rename shipped. Will anyone check trademark exposure (Apple Inc. software/developer tools), and what is the fallback name and cost of reversing (Discord, GitHub, Creator Store listing "Apple Studio", the workers.dev hostname, support email)? Also whether to keep or drop the infrastructure name "golem" on the owner's standing consent.
8. **First impression vs product output:** should the site show the product's bright studded games prominently (a showcase-first landing) instead of a dark developer aesthetic plus a dark tycoon screen? What is the "gimmick" now that `/catalog` is "the" gimmick: is a searchable prompt catalogue memorable enough compared with the Ember "Baseplate" idea the owner also rejected?
9. **`/catalog` scope and honesty:** may entries claim capabilities verified only by tool registry names, not by the 2026-10-04 reset's research-derived bar (`GOAL.md` Phase T has not produced a built game yet)? How are entries kept true as the agent changes, and does `/app?prompt=` deep-linking need to be built in the app first?
10. **Constraint budget vs ambition:** the landing budget (20,000 B gzip, 36,000 B inline JS) was nearly exhausted by the September look and the owner wants "motion, speed, dark mode, Lighthouse at least 90" (section 02 2.2 item 1). Is the budget re-based for v4 (and by whom), and should v4 be allowed to delete or restate the 51 site tests that pin the old composition? Lighthouse has never been measured: "not installed", the repo only has Playwright proxies.
11. **Public install claims:** every page says plugin installation is unavailable (open since 25 Sept 2026), yet the v4 hero wants an install chip. What should the primary call to action be while the plugin cannot be installed, and who decides when that copy flips (the Creator Store listing is the owner's account)?
12. **Changelog and docs staleness:** the live changelog still lists "Two modes, Plan and Agent, with Autonomous as a toggle" while the landing says "One engine". Do planners treat the changelog as history to keep, or as a page to rewrite in the redesign?
