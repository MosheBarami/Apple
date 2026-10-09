# StudPilot: the whole system, for an agent that has to work on it

Written 2026-10-09 from the code at `claude/laughing-allen-0z0b52` (deployed as of commit `f4e7d08`). Read this first.
Then use `AGENTS.md` for the file map and `CLAUDE.md` for the working rules. Every number below was read from the code
or measured; where something is untested in real Roblox Studio, this document says so.

---

## 1. What the product is

StudPilot (studpilot.app) is an AI that builds inside Roblox Studio. A person opens a project on the website, presses
**Connect** to link it to the place open in their Studio (through the StudPilot plugin), and types what they want in
plain words: "make a shop", "make the stamina bar 1000x cooler and studded", "add a day/night cycle", "why does my
door not open". One agent reads the place, plans, loads the skills it needs, searches the Roblox docs, builds through
tools that run inside Studio, checks its own work (layout measurement, play tests, output logs) and reports in a
streamed chat.

The owner's direction of 2026-10-08 is the product contract:
- **One agent**, not planner/builder/reviewer roles.
- **No canned content.** No kits, presets or premade creative pieces: "give it the fishing rod, not the fish".
  Engines guarantee technical correctness; the model designs.
- **Every picture is drawn by the image model** (2026-10-09): Lucid Origin.
- **Research-grounded:** live docs search with citations.
- **Real pipelines** for UI, maps, models, Creator Store assets, VFX, SFX and animation, with RigEdit Lite (rigging)
  and Resurface (classic surfaces) built in.
- **Streaming chat:** scroll respect, finished activity collapsing (reopenable), visible reasoning, citations.
- **One-click Connect** (no pairing code), no extra edit-consent gate, credits shown in the composer, a projects
  dashboard.

**Names.** StudPilot is the product. The former names survive only where
`AGENTS.md` section 2 allows them. `node scripts/check-old-names.mjs` guards this.

---

## 2. The map

```
 Browser (studpilot.app)                       Roblox Studio (the person's computer)
 ┌──────────────────────────────┐               ┌─────────────────────────────────────────┐
 │ apps/www  Next.js 16 on       │               │ StudPilot plugin 2.0.0 (Luau)            │
 │ OpenNext (worker studpilot-www)│               │ apps/studpilot-plugin                    │
 │  /        site + /docs        │               │  Bridge: announce / long-poll / release  │
 │  /app     dashboard, chat,    │               │  Commands + ops/*: ~70 typed operations  │
 │           settings            │               │  Permissions: allow by default (API dump)│
 └──────┬───────────────┬───────┘               └───────────────┬─────────────────────────┘
        │ HTTPS + WS     │ /studio/agent/<projectId> (WebSocket chat)  │ HTTPS long-poll
        ▼               ▼                                         ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ apps/worker  "studpilot" (Hono, the whole backend)                                  │
 │  /api/*  auth (Supabase JWT), projects, connect lobby (PairingDO), Roblox OAuth,     │
 │          credits (QuotaDO), budget (BudgetDO), admin, /api/studio/poll for the plugin│
 │  /studio/* → proxied to the agent worker over the STUDIO service binding            │
 │  StudioGate (WorkerEntrypoint, RPC): the agent's only door into projects, budget,    │
 │          credits and Studio tools                                                    │
 │  SessionDO (one per project): Studio link, plugin op queue, checkpoints, tool runner │
 └───────────────▲─────────────────────────────────────────────────────────────────────┘
                 │ GATE service binding (RPC)
 ┌───────────────┴──────────────────────────┐       ┌───────────────────────────────────┐
 │ apps/studio  "studpilot-studio"           │──────▶│ Workers AI (through AI Gateway     │
 │  StudPilotAgent (one Durable Object per   │       │ "studpilot"): Kimi K2.7 Code (agent)│
 │  project, AIChatAgent): the agent loop,   │       │ Lucid Origin (images)              │
 │  prompt, skills, docs search, Creator     │       └───────────────────────────────────┘
 │  Store search, token saver, metering      │       D1 "studpilot-docs" (17,361 doc chunks,
 └───────────────────────────────────────────┘       FTS5); R2 MEDIA (image hand-off);
                                                      Supabase (auth, projects, RLS)
```

**Deploys** (only these, from a clean tree; each verifies its build marker):
- `node infra/deploy-studio.mjs`: the agent worker, first when both change.
- `node infra/deploy-worker.mjs studpilot`: the main worker.
- `node infra/deploy-www.mjs`: site and app; requires HEAD == origin/main.

Run each with `CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN_MASTER`.

---

## 3. One request, end to end

1. **Connect (once per Studio session).**
   - The plugin `POST /api/studio/announce`s itself every few seconds with its install id and secret, the place
     name and id, and the Studio user's Roblox id.
   - On the project page the person presses Connect, which calls `POST /api/projects/:id/connect`.
   - The worker asks the lobby (PairingDO) for announcing Studios that match the person. A match is a Roblox account
     linked to this StudPilot user (`roblox_identities` from Roblox sign-in, or `studio_roblox_accounts` from the
     "Link Roblox account" flow at `/api/roblox/link-ticket`), or else the same IP.
   - Studios linked to another StudPilot user are excluded.
   - One match binds at once. Several return `choose` with a list. None returns `waiting`, and the page offers
     "Link Roblox account".
   - On bind, the plugin's next announce receives a session token. From then on it long-polls `/api/studio/poll`,
     sending op results and receiving queued ops.
2. **Chat.**
   - The page opens a WebSocket to `/studio/agent/<projectId>?token=<supabase jwt>` (AI SDK `useAgentChat`).
   - The main worker proxies `/studio/*` to the agent worker.
   - `apps/studio/src/server.ts` checks the token against the project's owner through `GATE.openProject`, stores the
     project name and `canBuild` on the agent, strips the token, and hands the request to the project's
     `StudPilotAgent` Durable Object (named by the project id).
3. **Turn** (`apps/studio/src/agent.ts` `onChatMessage`):
   - **Admission:** refuse if `canBuild` is false (pre-launch, only approved accounts may build), refuse if
     `GATE.canSpend` reports no credits, and stream the current credits to the composer (`data-credits`).
   - **Messages:** stored UI messages become model messages, then `pruneMessages` (reasoning only for the latest
     message), then `compactHistory` (section 6.4).
   - **Model call:** `streamText` with Kimi K2.7, the system prompt (section 5), 25 tools, up to 60 steps,
     `maxOutputTokens` 16,000, word-chunked smoothing, `experimental_repairToolCall: repairToolInput`.
   - **Each step:**
     - Before the call, the metered binding reserves budget.
     - After the step, it settles at the real token usage (`settleNext`), charges the owner's credits
       (`GATE.chargeUsage`), and streams the new balance.
   - **Tools** run through the GATE, the plugin, and back (section 7).
   - **Streaming:** the chat streams text, `reasoning`, `tool-*` parts, `source-url` citations, `data-credits` and
     `data-progress`. Errors are described in full (`describeError`), never as a generic line.
   - **End:** unspent reservations are released (`releaseAll`).
4. **Studio side of a write tool:**
   - `SessionDO /studio-tool` sets `ctx.offeredTools = STUDIO_TOOLS` and `ctx.freeHand = true` (section 8.3).
   - It checks the owner is approved to build.
   - It saves a checkpoint of the place, at most once per 10 minutes (`STUDIO_CHECKPOINT_GAP_MS`). A checkpoint that
     cannot be saved never blocks the write; the result carries a note.
   - It runs the registry tool (`apps/worker/src/tools.ts`), which queues typed ops for the plugin and waits for
     their results.

---

## 4. The models

### 4.1 The agent model: Kimi K2.7 Code

- **Id and pricing:** `@cf/moonshotai/kimi-k2.7-code` on Workers AI. Set by `DEFAULT_MODEL` in
  `apps/studio/src/agent.ts` and the `AGENT_MODEL` var in `apps/studio/wrangler.jsonc`. Price: $0.95 per million
  input tokens, $0.19 per million cached input tokens, $4.00 per million output tokens (`apps/worker/src/pricing.ts`
  `MODEL_PRICES`).
- **Why this model:** a probe (`apps/studio/scripts/model-probe.mjs`, 2026-10-08) measured first token in 1.0 s
  and first tool call in 2.1 s. DeepSeek V4 Pro took 3.6 s / 6.1 s and then reasoned for 113 s; GLM 5.3 Flash took
  9.9 s.
- **Settings:**
  - `reasoning_effort: 'low'`.
  - `sessionAffinity: projectId`: the same project hits the same prompt cache. Measured cache hit rate on real runs
    is 94% of input tokens.
  - Every call goes through AI Gateway `studpilot`, which logs the full request and response, keeps 10 million
    logs and deletes the oldest first.
- **Budget limits:** the per-step budget cap for this model is 32,000 neurons (`AGENT_STEP_CAPS`). The default
  1,200-neuron cap refused every Kimi step until this existed.
- **Known model behaviours** (from the run histories in the private companion document):
  - It sometimes sends long tool arguments as a quoted JSON string, or miscounts closing brackets in deep trees.
    `repairToolInput` fixes both (11 of 11 real broken `build_ui` calls now compile).
  - It follows worked examples in skills very closely: give it the example you want copied.
  - Asked to "make it cooler" without the craft section, it produced flat dark panels.

### 4.2 The image model: Lucid Origin

- **Id and pricing:** `@cf/leonardo/lucid-origin` (`IMAGE_MODEL` in `pricing.ts`). $0.007 per 512×512 tile plus
  $0.000132 per step. A 1024×1024 image at 24 steps costs about $0.03. `imageNeurons()` converts this to neurons.
- **Speed and output:** about 3 s per image. Returns a base64 JPEG with no alpha.
- **Quality observed:** excellent on banners with quoted text, stud textures, glossy buttons and panels. It tends
  to paint a ground shadow, which the cut-out removes.

### 4.3 Money units

- **Neurons:** Workers AI bills in neurons, $0.011 per 1,000.
- **Product budget** (BudgetDO, `pricing.ts`):
  - free 10,000 neurons per day plus billable 300,000 per day, a daily ceiling of 310,000 (about $3.41 per day);
  - 2,270,000 billable per month;
  - a kill switch;
  - admin view and reset: `GET /api/admin/spend`, `POST /api/admin/spend-reset {"scope":"day","confirm":true}`,
    both with header `X-Admin-Key`.
- **Credits:** the person's allowance is held by QuotaDO in internal units.
  - `INTERNAL_PER_CREDIT` = 150 internal units make one displayed credit.
  - `NEURONS_PER_CREDIT` = 30 neurons make one internal unit.
  - So one displayed credit is 4,500 neurons, about $0.05.
- **What gets charged:** model steps through `GATE.chargeUsage` (cached input at the cached rate), images through
  `StudioGate.chargeImage`.

---

## 5. The agent's instructions (`apps/studio/src/prompt.ts`)

The system prompt is small on purpose and ordered for the prompt cache. Unchanging parts come first: IDENTITY, then
the skills index. Changing parts come last: project name, Studio state, date.

**IDENTITY** covers:
- Who it is: it builds in the person's open place and never makes them understand internals.
- **How it works:**
  - Start at once, and read the relevant part of the place first.
  - Make a sensible choice when a request is ambiguous; ask only if no reasonable choice exists.
  - Use `update_plan` for multi-part requests.
  - Load the matching skill before specialised work.
  - Search the docs when unsure, and link the pages relied on.
  - Design everything for this request (nothing premade).
  - Draw every picture with `make_image`, then build UI with `build_ui`, and fix every measured defect.
  - Find in the Creator Store before making when a real asset fits.
  - Keep scripts server-authoritative, validate RemoteEvents, pcall DataStores, then `play_check` and
    `get_output_logs`.
  - No placeholders. The thing asked for is what the player sees first.
  - Never claim unverified results. A tool error is information.
  - Every change sits behind a checkpoint.
- **Working economically** ("none of this is a reason to check less"):
  - Call independent tools together.
  - Read narrowly (a `root` and `maxDepth`; `grep`, then `read_script` with a line range).
  - Change rather than rewrite (`edit_script` edits, `set_properties`, `build_ui` only for structure; `styles` and
    `each`).
  - Don't re-read, and don't paste results or code into replies.
  - Think as much as a step needs.
- **How it talks:** plain, warm, brief; a one-line note before a major step; a short final report (what is where in
  Studio terms, how to try it, what did not work).

The Studio state line says connected (with the place name) or "NOT connected: tell the person to open the place and
press Connect".

---

## 6. The agent worker (`apps/studio`)

### 6.1 Files

| file | what it does |
|---|---|
| `src/server.ts` | Routes. `GET /studio/api/health`. `/studio/agent/<projectId>` (owner check, then the agent DO). Admin export routes `/studio/api/admin/history/<projectId>` and `/studio/api/admin/object/<agent\|flue>/<id>`, checked against the `X-Admin-Key` secret `ADMIN_KEY` with a constant-time compare. |
| `src/agent.ts` | `StudPilotAgent extends AIChatAgent`: `maxPersistedMessages` 400, `messageConcurrency 'queue'` (a second message waits, never dropped), `onChatMessage` (section 3), `describeError`, `exportHistory`, `dumpStorage`. |
| `src/prompt.ts` | IDENTITY and `systemPrompt(facts)`. |
| `src/tools.ts` | `studioTools` (20+ GATE tools built from `tools/generated.ts`, description overrides, read cache, output clamp) and `knowledgeTools` (`search_docs` with `url` reading, `search_creator_store`, `load_skill`, `update_plan`). |
| `src/tools/generated.ts` | Generated by `scripts/gen-tools.mjs` from the worker's tool definitions (JSON Schema). CI runs `--check`. |
| `src/token-saver.ts` | Section 6.4. |
| `src/metering.ts` | `meteredAi(env, holds)`: reserve before each Workers AI call; settle at reported usage, or hold the reservation for a stream and settle it per step (`settleNext`); `releaseAll`. |
| `src/knowledge/docs.ts` | `searchDocs` (D1 FTS5 over Roblox Creator Docs and Luau docs), `readDoc` (by URL, live-fetch fallback on allowlisted hosts), `docsFreshness`. |
| `src/knowledge/creator-store.ts` | Unauthenticated toolbox-service search plus item details; `formatCreatorStoreResult`. |
| `src/skills.generated.ts` | Generated by `scripts/gen-skills.mjs` from `packages/skills/*`. |
| `src/legacy.ts` | `FlueStudPilotAgent`: the previous agent's Durable Object class, kept empty so its stored conversations survive the 7-day data rule; `dumpStorage` for export. |
| `scripts/model-probe.mjs` | Speed and cost probe across candidate models. |
| `scripts/ui-probe.mjs` | Runs the real model on a UI request with the real tool schemas. `build_ui` is answered by the real compiler, `make_image` by real Lucid Origin plus the real cut-out. Prints cost and characters written per tool; saves inputs, broken calls and pictures. |
| `scripts/ui-render.mjs` | Renders a compiled screen to PNG at desktop and phone sizes (an HTML approximation: lists and grids as flexbox/grid, gradients multiplied by the background, tiled and 9-slice images, tint as a multiply mask, text outlines). The only way to *see* a design without Studio. |

### 6.2 Tools the agent has (exactly 25; `apps/studio/tests` enforce the cap)

Studio tools (through GATE to the worker registry, then plugin ops). Reads:

| tool | purpose |
|---|---|
| `get_project_tree` | Instance tree from a `root`, with `maxDepth`. |
| `read_instance` | Every writable property of an instance, read from the API dump (plugin 2.0). |
| `glob` | Instances by path shape and class. |
| `read_script` | Source, paged by lines for big scripts (`start_line`, `max_lines`, `nextStartLine`, `baseHash`). |
| `grep` | Text or Lua-pattern search over scripts, with context and path globs. |
| `get_output_logs` | Studio output and console. |
| `model_anatomy` | Parts, joints, hinge candidates and pivot directions of a model. |
| `check_ui` | Measure an existing ScreenGui at five viewports. |

Writes:

| tool | purpose |
|---|---|
| `build_ui` | The UI engine (section 9.1). |
| `create_instances` | Typed instance trees, with `origin`/`group`. |
| `set_properties` | Typed properties and attributes on one path. |
| `delete_instances` | Delete by path. |
| `transform_instances` | Move, rotate or scale. |
| `apply_surface` | Resurface classic surfaces. |
| `edit_script` | Full `source` or find/replace `edits`; create with `create_class` + `create_parent`; parsed before writing; `base_hash` guards concurrent edits. |
| `run_luau` | Edit-time Luau with print output and the return value. |
| `edit_terrain` | Typed terrain operations and recipes. |
| `insert_from_store` | Creator Store asset into a holder; scripts removed and reported. |
| `make_image` | Lucid Origin art uploaded to the person's account (section 9.2). |
| `animate_model` | Rig and keyframe (RigEdit Lite method). |
| `play_check` | A real play test with one player; screen text, leaderstats, client and server errors; `tests:true` runs TestEZ specs. |

Local tools (run in the agent worker):

| tool | purpose |
|---|---|
| `search_docs` | `query`, or `url` to read a page in full. Streams the top 3 hits as `source-url` citations. |
| `search_creator_store` | Store search. |
| `load_skill` | Load a skill (`name`, optional `file`). |
| `update_plan` | Checklist shown in chat. |

**Adding a tool** means editing all of these, or tests fail:
- `apps/worker/src/tools.ts` (the definition);
- `packages/shared/src/index.ts` (phase case and permission label entry);
- `apps/worker/src/mcp.ts` (exposed or excluded with a reason);
- `apps/worker/src/run-idle.ts` (plain label);
- `apps/worker/src/studio-surface.ts` (offered to the agent);
- `packages/evals/src/security.test.mjs` (sample args);
- for a new plugin op: the `StudioOp` union in shared, `apps/worker/src/plugin-capabilities.ts` and its test, and
  the op family in the plugin;
- then `node apps/studio/scripts/gen-tools.mjs`.

The 25-tool cap is real: adding one means merging or removing another. `read_doc` was folded into `search_docs` for
`make_image`.

### 6.3 Skills (knowledge the agent loads)

Skills follow the agentskills.io format: `packages/skills/<name>/SKILL.md` with frontmatter `name` and
`description`, plus optional `references/*.md`. They are bundled by `node scripts/gen-skills.mjs`; CI runs `--check`.
The index (name and description, about 1,500 tokens) sits in the system prompt, and bodies load on demand.

| skill | covers |
|---|---|
| `ui-design` | Deciding what a UI is (game UI by default, tool UI only when asked); hierarchy, spacing and type scales; colour and contrast; states; responsive layout; pitfalls; the full `build_ui` schema including `styles`/`each`, `textStroke`/`depth`/`pattern`/`skin`; method; **Roblox game-UI craft** (measured anatomy of the chunky cartoon/simulator style, the "make it cooler" ladder, textures); worked examples: a simulator admin panel (the owner's reference), a "1000x" studded stamina bar, a moderation panel, a candy shop, a HUD. Every JSON example is compiled in CI with zero warnings. |
| `game-art` | `make_image`: plan the 3-6 pieces of a screen, one shared style string, prompt recipes per kind, transparency and 9-slice, one light skin tinted into many colours, banners (never a live title over drawn text), use every image drawn, cost. |
| `roblox-scripting` | Script types and where they run, remotes with server validation, DataStores, modules, TweenService, performance (plus `references/api-cheatsheet.md`). |
| `game-systems` | Method for currencies, shops, inventories, progression, rounds, checkpoints, combat, leaderboards, daily rewards, codes. |
| `building-worlds` | Player scale, layout and composition, terrain, procedural placement, lighting (plus a lighting reference). |
| `creator-store-assets` | Query wording, judging results, inspecting and adapting inserted assets. |
| `existing-games` | Survey first, follow the place's conventions, change minimally. |
| `visual-effects` | Particles, beams, trails, lights, screen effects, budgets. |
| `sound-design` | Sound objects, 3D vs 2D sound, groups, music, feedback sounds. |
| `animation` | Rigs, Motor6D, Animator, rigging static models with `animate_model`, keyframes. |

### 6.4 Token saver and caching (`token-saver.ts`)

| measure | what it does |
|---|---|
| `clampToolOutput` | A tool result over 12,000 characters keeps 75% head and 15% tail, plus a note on how to ask for less. |
| `TurnReadCache` | A repeated read (same tool, same arguments) with no write since returns one line instead of the whole result. Any write clears it. |
| `TtlCache` | Docs and Creator Store lookups are cached for 10 minutes in agent memory. |
| `compactHistory` | The current turn goes whole. Earlier turns keep **every tool call and result**: arguments with long strings and lists cut, results to 700 characters. Words outside the last 16 messages are cut to 1,500 characters. Deterministic, so the prompt cache still serves earlier turns. Until 2026-10-09 earlier tool calls were dropped entirely, and the agent forgot what it had built: the owner's "continue" bug. |
| `repairToolInput` | Unwraps a quoted JSON string; `balanceJson` drops closers that would end the root early or match nothing, and adds missing ones; `jsonrepair` mends the rest. The tool still validates what it receives. |
| `build_ui` `styles` / `each` | Write a look once and repeat list rows. Measured: a 6-item shop went from 12,043 to 3,203 characters of `build_ui` arguments. |

Measured cost of real turns:
- An admin panel with scripts and a play check: about $0.10 in model tokens plus about $0.12 for 4 images.
- A studded stamina HUD: about $0.06 plus 3 images.
- Output tokens are the main cost. The fixed context (about 7.4k tokens of tools and system prompt) is mostly served
  from cache.

---

## 7. The Studio side: SessionDO, tools and the plugin op queue (`apps/worker`)

- **`StudioGate`** (`src/index.ts`, a WorkerEntrypoint reached over RPC from the agent worker):
  - `openProject` (JWT and ownership);
  - `reserveModel`, `settleModel`, `releaseModel` (BudgetDO);
  - `canSpend` and `chargeUsage` (QuotaDO);
  - `projectStatus` (Studio link and credits, in displayed credits);
  - `callTool(projectId, name, args)` (only names in `STUDIO_TOOLS`), which forwards to the project's SessionDO
    `/studio-tool` and, for `make_image`, charges the image's neurons as credits.
- **SessionDO** (`src/do/session.ts`, one per project):
  - It owns the Studio link (bound by the lobby) and the op queue. Ops are persisted in DO storage, so an op must be
    small; images travel by URL.
  - Plugin long-poll waiters, op results with failure kinds (`refused`, `timeout`, `conflict`, …), checkpoints and an
    op log.
  - `/studio-tool` is the agent's entry (section 3, step 4).
  - It also still carries the whole legacy agent loop (section 13).
- **The registry** (`src/tools.ts`, about 6,000 lines): each tool is `{def, studio, studioOps, run}`, where `run`
  builds typed `StudioOp`s and calls `op(ctx, studioOp, timeoutMs)`. A failed op returns
  `{error, retry?, fix?, retryable?}` with a remedy written for the model.
- **Guards still on for the agent:**
  - edits only in edit mode;
  - typed values (`normaliseItems` refuses ambiguous arrays);
  - script source only through `edit_script` (parsed first, with a hash guard);
  - `insert_from_store` strips scripts;
  - game-script rules (`refuseGameScript`: no runtime dependence on StudPilot, no fake purchase ids);
  - `lintScriptWrite` (refuses a loop that never yields);
  - `run_luau` asset-ingress checks.
- **Guards lifted for the agent** (`ctx.freeHand`, owner 2026-10-08 "no kits" and "I accept the reduced safety"):
  the library-only rules D-UIONLY-1 (UI only from the UI library), D-FXLIB-1 (sounds and effects only from the
  library) and D-MODELLIB-2 (models only from the library), including the `refuseUiLook` block on `set_properties`.
  They still apply to the legacy loop and its tests.

---

## 8. The Studio plugin (`apps/studpilot-plugin`, version 2.0.0, about 13,700 lines of Luau)

### 8.1 Structure

| file | role |
|---|---|
| `src/init.server.luau` | Entry point: dock widget (minimal UI showing connection state and the place), toolbar button. |
| `src/Bridge.luau` | Transport only. `STUDPILOT_ORIGIN = https://studpilot.app`, plus a one-release fallback host. `POST /api/studio/announce` (install id and secret; the server hands a token back only for a binding the owner made), long-poll `POST /api/studio/poll` (results out, ops in), `/api/studio/release`. Every payload is made valid UTF-8. No persisted session token. |
| `src/Commands.luau` | The op table: tree reads, instance create/set/delete/move, scripts through ScriptEditorService, insert by asset id (one id-only `GetObjects` loader, then script removal before parenting), checkpoints (snapshot and restore), typed value decoding `{t, v}`, limits (`MAX_ITEMS` 120 items, `MAX_CREATE_NODES` 400, `MAX_TREE_NODES` 1,200, `MAX_SCRIPTS` 240, writes up to 240k characters per script, reads up to 4M). |
| `src/Permissions.luau` | 2.0 model: allow by default. Any class the API dump marks creatable; any property scriptable and writable at plugin security; any `rbxassetid://`, `rbxasset://` or `rbxthumb://` content. Short deny list with reasons: `Source`/`LinkedSource` (`edit_script` only), `Parent` (structure ops only), `ClassName`, script sandbox `Capabilities`, … |
| `src/ApiDump.luau` | Generated from Roblox's API dump (client 0.742): 935 classes, 2,317 plugin-writable properties, 648 enums. Data only. |
| `src/PlayCheck.luau` | Play-test harness: starts a Test session, injects temporary check scripts (a fixed marker, counted and removed), walks the character, reads PlayerGui and leaderstats, collects client and server errors; TestEZ runner. |
| `src/Render.luau`, `StudioCapture.luau`, `GenerationService.luau` | Viewport capture and older generation helpers (mostly used by the legacy path). |
| `src/ops/*.luau` | Op families, each `{name, build(api) → {handlers, mutating?, consentOnly?, createClasses?, propertyAllow?, enumAllow?, watch?}}`, loaded by `ops/init.luau` (one failing family never takes the others down; Commands.luau is at Luau's 200-local limit, so new ops go here). |

The op families:

| family | ops |
|---|---|
| Query | `query_instances` and friends |
| Physics | collision groups and similar |
| Terrain | `edit_terrain` voxel ops |
| Rig | rigs and joints |
| Ui | `measure_ui`, see below |
| Fx | effects |
| Content | content helpers |
| Compose | composition |
| Surface | Resurface: a MaterialVariant per surface kind with stud colour and normal maps; `apply_surface`, `set_surface_default` (default `keep`: nothing is studded unless asked) |
| Joints | joints |
| Upright | upright placement |
| Search | `grep`, `glob`, `list` |
| Serialize | `serialize`/`deserialize`: a subtree as JSON with every writable property |
| Tests | `run_tests` |
| Image | `create_image_asset`, see below |

`measure_ui` lays a ScreenGui out at five viewports (desktop 1920×1080, laptop 1366×768, tablet 1024×768, phone
landscape 844×390, phone portrait 390×844) in Studio's own UI layer and reports these defects:
- `text_overflow`, `text_truncated`, `text_cramped`
- `collapsed`, `overflows_parent`/`cut_off`, `overlap`, `covered`
- `off_screen`, `past_screen_edge`, `under_top_bar`
- `small_touch_target`, `tiny_text`, `unbounded_scaled_text`, `low_contrast`

`create_image_asset` (ops/Image.luau):
- Fetches base64 RGBA, only from `https://studpilot.app/api/studio/pixels/`.
- Draws it into an EditableImage.
- Calls `AssetService:CreateAssetAsync(editable, Enum.AssetType.Image, …)` into the signed-in Studio user's own
  account and returns the asset id.

### 8.2 Build and release

- `node apps/studpilot-plugin/scripts/build.mjs` builds `release/studpilot-studio.rbxm` and verifies the shipped
  bytes (`scripts/verify-artifact.py`). It checks:
  - no credentials or private hosts;
  - the version matches;
  - required markers are present;
  - forbidden call shapes are absent (`loadstring`, `pcall(require, …)`, any `GetObjects` but the one id-only
    loader, any `CreateAssetAsync` but the one generated-image upload).
- `tests/worker-capability-contract.test.mjs` asserts the same on the sources.
- The plugin is delivered as a file today (`StudPilot-2.0.0.rbxm`, dropped into Studio's Plugins folder). The
  Creator Store listing is an owner action and still has the 1.0.0 store build.

### 8.3 Permissions and safety posture

Allow by default was an owner decision on 2026-10-08, after a place with a 200-script third-party package could be
read but not written. What stays closed:
- writes in Play mode;
- script source as a property;
- capability sandbox changes;
- structure changes outside path-checked ops;
- unbounded responses.

Checkpoints keep the place restorable. Studio's own Undo records one entry per op.

---

## 9. The engines and pipelines

### 9.1 UI engine: `build_ui` / `check_ui` (`apps/worker/src/ui-engine.ts`)

The model writes a declarative tree; the engine owns technical correctness and nothing else (no themes or presets).

**Node types:** `frame`, `stack`, `grid`, `scroll`, `text`, `button`, `input`, `image`, `icon`, `divider`,
`spacer`.

**Fields:**
- **Size:** `w`/`h` as pixels, `"fill"`, `"auto"` or `"NN%"`; `min`/`max`; `aspect`; `grow`.
- **Placement:** `at` (9 anchors), `offset`, `z`, `visible`.
- **Layout:** `dir`, `gap`, `pad`, `align`, `justify`, `wrap`, `cols`, `cell`, `bar`, `barColor`.
- **Look:** `bg`, `bgT`, `radius`/`"pill"`, `stroke`, `gradient`, `clip`.
- **Text:** `text`, `font` (`"Family:Weight[:Italic]"`, from 40 families), `fontSize` or `scale [min,max]`,
  `color`, `alignX`/`alignY`, `truncate`, `rich`, `lineHeight`.
- **Input:** `placeholder`, `placeholderColor`, `multiline`.
- **Image:** `image`, `fit`, `tint`, `imageT`.
- **Divider:** `thickness`.

Added 2026-10-08 and 09:
- `styles` and `style`: named looks, merged under the node's own fields.
- `each`: repeat a child; string items set `text`, object items set fields, or `{key}` placeholders fill nested
  values and names.
- `textStroke`: outlined text. On a bordered button the text moves into a child `Label` so both strokes exist.
- `depth {color, px}`: a darker base edge. The content moves into a child `Face`, `px` shorter.
- `pattern {image, tile, t, tint}`: a tiled texture; the object becomes an ImageLabel or ImageButton with
  `ScaleType.Tile`.
- `skin {image, size, slice, t, tint}`: generated art drawn as the object, 9-sliced from the size and slice.
  `make_image` returns the measured slice.

**What it does:**
- **Compiles** the tree into ONE `create_instances` item, a ScreenGui in StarterGui. It does this with UIListLayout or
  UIGridLayout (LayoutOrder in tree order), UIPadding, AutomaticSize, UIFlexItem, TextWrapped or TextTruncate,
  UITextSizeConstraint, ClipsDescendants and AutomaticCanvasSize on scroll areas, and ZIndexBehavior Sibling.
- **Lints** what only a different design can fix: fill inside an auto-sized parent, percents over 100%, children of
  a free frame that would overlap.
- **Replaces** a screen of the same name; it refuses if that screen holds scripts, unless `replaceScripts` is set.
- **Measures** the result at five viewports (`measure_ui`) and returns each defect with the next step to take.
- **Limits:** 160 nodes, depth 10, 32 children, 400 instances.
- **Allowlist check:** every class, property and enum it can emit is checked against the plugin's allowlists in
  `tests/ui-engine.test.mjs`.
- **Behaviour** is a LocalScript the agent writes in StarterPlayerScripts, which survives rebuilds.

### 9.2 Image pipeline: `make_image` (`apps/worker/src/image-gen.ts`, the tool in `tools.ts`)

```
prompt + kind + shared style ─▶ planImage (kind words, key colour green or magenta for green subjects,
  "no text" unless quoted) ─▶ budget reserve ─▶ Lucid Origin (gen size by kind, 24 steps) ─▶ JPEG
  ─▶ decode (jpeg-js) ─▶ cut-out for icon/button/panel/banner/sprite:
       edge flood-fill of the sampled key colour (tolerance 70), key-coloured holes, key-HUED shadows,
       specks (< 15% of the main shape), soft edge with key un-mixing, spill removal near the cut
  ─▶ crop ─▶ fit (area-average with alpha weighting; textures exact) ─▶ base64 RGBA into R2
     studio-pixels/<uuid>
  ─▶ plugin create_image_asset (download from /api/studio/pixels/<uuid>; no sign-in needed, the random
     single-use id is the capability) ─▶ EditableImage ─▶ CreateAssetAsync into the person's account
  ─▶ R2 object deleted ─▶ result {image, width, height, kind, neurons, slice (measured), use: the exact skin}
```

| kind | generated at | delivered within |
|---|---|---|
| icon | 1024² | 256 |
| button | 1024×512 | 512×256 |
| panel | 1024² | 512 |
| banner | 1536×512 | 768×256 |
| texture | 512² | 256, tiled |
| background | 1536×864 | 1024×576 |
| sprite | 1024² | 512 |

Panels slice at least 12% of their smaller side so the rim never stretches.

**Status:** generation, cut-out, metering and the pixel route work and are tested. **The upload does not work in
the owner's Studio yet.** The one real call (2026-10-09) got "CreateAssetAsync and CreateAssetVersionAsync are not
available yet" (section 15).

### 9.3 Other pipelines

- **Terrain** (`edit_terrain`): bounded typed operations:
  - `clear`, `fill_block`, `fill_ball`, `fill_region`, `replace_material`, `write_voxels`, `path`;
  - up to 32 operations per call, 65,536 voxels;
  - recipes `floating_island` and `waterfall` (`terrain-recipes.ts`, generators rather than premade content).
  - Checkpoints do not keep voxels; Studio Undo does.
- **Assets** (`search_creator_store` then `insert_from_store`): unauthenticated store search with
  scripts/creator/size data; insert into a holder folder with scripts removed (`insertAndProveClean`); then inspect
  with `model_anatomy`, `transform_instances`, `set_properties`.
- **Animation** (`animate_model`, the RigEdit Lite method): root part and Motor6D joints with pivots, keyframed
  clips authored from code and previewed in Studio without uploading. Read the model with `model_anatomy` first.
- **Surfaces** (`apply_surface`, Resurface by cxmeel, credited in THIRD_PARTY_NOTICES): studs, inlet, universal,
  weld and glue as MaterialVariants, or smooth to remove them. Only when asked for.
- **Play testing** (`play_check`): a real Test session on a copy, with screen text, leaderstats and client and
  server errors. It does not press buttons.
- **Docs** (`search_docs`): D1 `studpilot-docs` (binding `DOCS`), 17,361 chunks from create.roblox.com/docs (guides
  and the full Engine API) and luau.org, with FTS5 search and citations streamed to chat.

---

## 10. The web app (`apps/www`, Next.js 16 with shadcn and AI Elements, Geist fonts, OpenNext on Workers)

- **`/`, `/product`, `/pricing`, `/privacy`, `/terms`:** the site (no neon, no "AI slop").
- **`/docs/[slug]`:** 25 pages in `content/docs/*.ts`, rendered on demand.
- **`/app`:**
  - a dashboard of projects (`dashboard.tsx`, `projects-provider.tsx`);
  - `/app/projects/<id>`, the chat (`chat-view.tsx`, `components/app/chat/turn.tsx`);
  - `/app/settings`.
- **Composer:** credits live in it (`composer.tsx`, `credits.tsx`), and there are no native `<select>` controls.
- **Chat:**
  - `useAgent` and `useAgentChat` connect to `/studio/agent/<projectId>`.
  - Each assistant turn renders its process (reasoning, tool steps with labels from `labels.ts`, interim text)
    above the final answer.
  - The process folds when the turn ends; a click reopens it.
  - Reasoning shows in a collapsible, with citations as source chips.
  - Errors show `chat.error.message`.
- **Connect** (`studio-light.tsx`): the Connect button, the "Link Roblox account" call to action, and an automatic
  retry after `?roblox=linked`.

---

## 11. Data and identity

- **Supabase** (project `npqvyijsvzkuwddyhtpm`): auth and `public.projects` (id, name, owner_id, created_at), with
  RLS. Migrations are applied by hand from `infra/supabase/migrations/`.
- **D1 `CORPUS`:** `roblox_identities` (sign in with Roblox) and `studio_roblox_accounts` (link mode; unique
  user/sub index), plus the export and erasure entries for both.
- **Durable Objects:**
  - **main worker:** SessionDO (per project), BudgetDO (singleton), QuotaDO (per user), PairingDO (the lobby);
  - **agent worker:** StudPilotAgent (per project; AIChatAgent session tables `cf_agents_session_messages`), and the
    empty FlueStudPilotAgent holding the previous agent's conversations.
- **R2 `MEDIA`:** the image hand-off.
- **AI Gateway `studpilot`:** logs of every model call (the source of the run history).
- **Secrets** live only in the environment and Cloudflare: `CLOUDFLARE_API_TOKEN_MASTER`, the operator admin key (admin
  routes; the same value is the agent worker's `ADMIN_KEY`), Supabase keys, `OWNER_USER_IDS` (who may build before
  launch). The repo is public: never print or commit a value.

---

## 12. Testing, probes and checks

| what | command | notes |
|---|---|---|
| Worker | `cd apps/worker && node --test` | About 5,400 tests, about 3 min. Many read source text and assert on it: a pure move can fail them; restate the property, never weaken it. |
| Agent worker | `cd apps/studio && node --test` | 32 tests: gate contract, token saver, skills, docs, store. |
| Plugin | `cd apps/studpilot-plugin && node --test tests/*.test.mjs` | 68 tests; plus `node scripts/syntax-check.mjs` and the build. |
| Root (cross-app) | `node --test tests/*.test.mjs` | 716 tests. |
| Evals | `cd packages/evals && pnpm test` | |
| Typecheck | `pnpm -s typecheck` in `apps/worker`, `apps/studio`, `packages/shared` | |
| Generated files | `node apps/studio/scripts/gen-tools.mjs --check`, `node scripts/gen-skills.mjs --check` | |
| Names | `node scripts/check-old-names.mjs` | |
| UI quality loop | `STEPS=16 node apps/studio/scripts/ui-probe.mjs "<request>" <dir>` then `node apps/studio/scripts/ui-render.mjs <dir>/<Screen>.json <dir>/r` | The way to see what the agent designs, with real art. |
| Live smoke | sign in as the e2e account, then a WebSocket to `/studio/agent/<id>` | The browser's WebSocket is blocked in the cloud sandbox; Node's works. |

---

## 13. Legacy still in the tree (do not build on it)

- **The old agent loop in SessionDO** (GLM 5.3 Flash planner/builder steps, owner library, kits, `compose_game`,
  vision `look`, `blind-critique`, the library-only rules, the old `generate_image` with Flux). It is handoff M3's to
  remove. Its history is the GLM part of the companion document.
- **apps/web** (the React SPA formerly at `/app`) and **apps/site** (Astro). The live site and app are `apps/www`.
- **FlueStudPilotAgent:** the previous rebuild's agent (Flue framework, GLM). Kept empty for the 7-day data rule;
  delete it with a `deleted_classes` migration after that.
- **`packages/evals/owner-bench`, the old meters and mods:** see `CLAUDE.md`. Milestone proof in `planning/proof/`
  is the progress measure.

---

## 14. What the run history shows (aggregate; full detail in the private companion document)

Current agent (Kimi K2.7), 2026-10-08 21:35 to 2026-10-09 08:19:
- **Volume:** 8 projects, 20 turns, 145 model steps.
- **Tokens:** 2.65M input (94% cached), 87k output, 88.6k neurons (about $0.97).
- **How steps ended:** 127 called tools, 16 stopped, 2 errored.
- **Tool calls (160):** `edit_script` 32, `update_plan` 26, `build_ui` 20, `load_skill` 17, `read_script` 17,
  `get_project_tree` 16, `play_check` 8, `get_instance` 8, …
- **Tool errors (21):**
  - "Couldn't save a copy of the place first" (4; fixed: checkpoints no longer block);
  - D-UIONLY-1 refusals of hand-made UI (2; fixed: `freeHand`);
  - "script source exceeds the 240000 character source limit" (2; fixed: reads skip or page);
  - a service outside the allowlist (2; fixed: the error names the allowed services);
  - broken `build_ui` JSON (2; fixed: `repairToolInput`);
  - `edit_script` find text not present (1; a model error, and the result returns `closest`);
  - a write during a running play test (1);
  - `make_image` upload unavailable (1; **open**, section 15).

The previous agents (Flue and the SessionDO loop, GLM 5.3 Flash, 2026-10-04 to 10-08) made about 2,000 model calls.
Their per-turn histories are in the companion document.

---

## 15. Open problems, most important first

1. **`make_image` upload is refused in the owner's Studio** ("CreateAssetAsync and CreateAssetVersionAsync are not
   available yet"). Generation and cut-out work; the upload API is not enabled for this plugin or this Studio. Fix
   options:
   - (a) upload through Open Cloud with the person's own key (the creator-dashboard key flow already exists, scope
     `asset:write`), or through Roblox OAuth with asset scopes, from the worker;
   - (b) find and document the Studio setting or beta that enables `CreateAssetAsync` for local plugins.

   Until then the agent should fall back to drawn-in-engine looks (`pattern` with Roblox's stud map
   `rbxassetid://10509831729`, gradients, `textStroke`, `depth`).
2. **Verify in real Studio** what has only been tested by compiling, probing and rendering: plugin 2.0 ops, `skin`
   9-slice, the `depth`/`textStroke` label structure, `measure_ui` on the new fields.
3. **Empty reasoning collapsible** (owner report): the model streams reasoning (171 deltas in a probe) and the
   component renders `reasoning` parts. Get a screenshot of an opened one and test the stored-history path
   (`pruneMessages` keeps reasoning only for the last message).
4. **The agent sometimes stops mid-work.** The history shows 16 normal stops and 2 errors. Read the
   `describeError` logs now that errors carry their text.
5. **Launch decisions (owner):** `OWNER_USER_IDS` gate, the daily budget ceiling (about $3.41), payments, Creator
   Store publication of plugin 2.0.
6. **Cleanup after the 7-day rule:** the Flue class and the legacy loop (handoff M3).
