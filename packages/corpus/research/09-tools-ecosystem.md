# Roblox Studio tools ecosystem 2025-2026: AI features, Creator Store safety, libraries, toolchain, testing
_Researched 2026-10-04 by deep-research agent (topic 09). Sources: 96._
_Gap pass 2026-10-04: 9 items resolved, 12 still open._

Method note. Library status comes from each project's own GitHub repo (repo metadata, release list, commit list, README banners) read on 2026-10-04. Release and push dates are the ISO timestamps GitHub returns. GitHub's HTML pages show dates without a year for the current year, so a few page summaries were mis-dated; every date below that matters was cross-checked against the structured API data. Roblox AI feature dates come from Roblox's newsroom and DevForum announcements. Star counts are left out on purpose (the fetched numbers were inconsistent between page and API).

## Key facts

### A. Roblox AI features: what exists and when it shipped
- Roblox first showed "Assistant" at RDC 2023 (Sept 2023) as an in-Studio conversational helper for code and creation. This is old (pre-2024) and the product has changed a lot since. [S41 search snippet, unverified in detail]
- 2025-03-17: Roblox introduced Cube, its 3D foundation model. It generates 3D objects from text, trained on native 3D data, with 3D tokenization. A beta of "mesh generation" shipped the same week in Studio (slash command style, e.g. "/generate a motorcycle") and as an in-experience Luau API. A version of the model was open-sourced on GitHub and Hugging Face. [S40]
- 2025-05-13: Roblox DevRel (Urukeli) announced an open-source Studio MCP server (Rust binary plus a Studio plugin). It offered two capabilities at launch: insert Creator Store models and run Luau. [S42]
- 2025-09-05 (RDC 2025): announced 4D generation (functional objects, starting with vehicles and weapons), MCP integration into Studio's Assistant for third-party LLMs and tools, import from Figma and Blockade Labs, Text-to-Speech and Speech-to-Text APIs, and real-time voice chat translation (English, Spanish, French, German). [S41]
- 2026-02-04: Roblox published the Cube Foundation Model post. 4D generation is in beta for in-experience creation, with two schemas: Car-5 (five-part car: body plus four wheels) and Body-1 (any single-mesh object). Roblox's early-access game Wish Master reported 160,000+ player-generated objects and a 64% play-time increase for players who use it (first-party figure). [S39]
- 2026-02-21 to 02-25: DevForum announcement "Studio MCP Server Updates and External LLM Support for Assistant". The MCP server supports full agentic loops with new tools (get_console_output, start_stop_play, run_script_in_play_mode, get_studio_mode). Assistant gains BYOK (bring your own key) for Anthropic, OpenAI and Google Gemini; the key is stored on the device and masked in the UI; Roblox states no pricing, so cost is the provider's API rate. Full Assistant BYOK rollout was "early March". [S36]
- 2026-03-05: the MCP server became built in to Studio. Every MCP tool available to Assistant is automatically available through the built-in server. Multi-instance tools list_roblox_studios and set_active_studio were added. Playtest automation tools: start_stop_play, get_console_output, user_mouse_input, user_keyboard_input, character_navigation (character_navigation pathfinds and "does not simulate real player input"). Per-session or per-prompt script approval auto-accept was added. [S37]
- 2026-04-04 (approx.): the original open-source `Roblox/studio-rust-mcp-server` repo was archived/deprecated; its README says engineering investment moved to the built-in server. The README's tool list is run_code, insert_model, get_console_output, start_stop_play, run_script_in_play_mode, get_studio_mode. [S7] (Exact archive date shown by the page as April 3, 2026; year inferred from the page's "as of" wording, treat as approximate.)
- 2026-04-15/16: "Roblox Studio is Going Agentic". Status listed by Roblox: Planning Mode improved and generally available; Mesh Generation generally available; Procedural Model Generation "coming soon" at that date; Playtesting Agent in beta; built-in MCP Server generally available (clients named: Claude, Cursor, Codex); cloud agent workflows "in development". [S1] TechCrunch (2026-04-16) reports the same, quoting SVP Engineering Nick Tornow, and notes no specific launch dates. [S45]
- 2026-04-16: Planning Mode DevForum post. Enable via the Assistant dropdown ("plan") or the `/plan` command. Plan, Build, Test framework: review and edit the plan, generation agents build, verification agents playtest. A reference image in a plan needs BYOK; playtest screenshots need BYOK. Known bug at announcement time: Assistant looping on "I'll complete [Task]"; pausing generation escapes it. Roadmap: multi-chat sessions, node graphs, multi-agent execution. [S2]
- 2026-04-24: Data Model Search subagent (parallel read-only exploration of large places that returns only findings to the main thread) and Quick Connect for MCP clients. Quick Connect clients: Antigravity, Codex CLI, Claude Code, Claude Desktop, Cursor, Gemini CLI, Visual Studio Code. Only clients already installed appear; restart Studio after installing a client. [S38]
- 2026-07-16: Roblox announced "Build", a mobile-first prompt-to-game tool (public alpha in New Zealand, testing from 2026-07-28, ages 9+ to test, published games for age-checked 16+, base tier free with paid power-user options). Same post says three Studio agents are coming "in the coming months": Playtesting Agent, Analytics Agent (ask questions about a game in plain language) and Experiment Agent (suggests tests to improve engagement, retention, monetization). Also listed: Procedural Models (parametric 3D from text or image), Cube, and a scene-generation model "coming soon". [S3]
- 2026-07-18 DevForum (community, T0nkus): Assistant usage limits are reached quickly; failed runs (stuck, claims done when not) burn quota; asks for purchasable extra usage. No numeric quota is published in anything fetched. [S43]
- 2026-07-25 DevForum (community, EECaptain): a 7-day automated ban reportedly caused by the Assistant's own mesh generation ("generate_mesh" of a realistic character) being flagged. Single anecdote, no staff reply seen. Treat as a risk signal, not a confirmed policy. [S44]
- 2026-04-09 (staff Mirrattar, DevForum): the Playtest Agent shipped as a Studio Beta feature (File > Beta Features > Playtest Agent). Ask Assistant to playtest with a prompt such as using the playtest subagent to check that players can buy an item; each playtest ends with Pass, Fail, Inconclusive or Error plus a structured report of actions and observations. It runs on Roblox-run models (the post does not mention BYOK or token cost). Known limit: false positives, and it needs clear, actionable instructions. [S83]
- 2026-09-10 to 09-12, RDC 2026 (San Jose): GamesBeat (2026-09-11) reports a Playtest Agent with multiplayer support, demoed with about 100 NPCs imitating players in a food-fight game (presented by Ore Jacob); the article states no beta/GA status or date. Roblox's IR release (2026-09-11) says new NPC behaviours, including playtesting NPCs, arrive by year-end 2026. The DevForum recap "RDC26: What We Announced" lists Studio and engine roadmap items (scene generation, orthographic camera, new primitive shapes, collision geometry, observability platform: late 2026; branch and merge, test teleports in Studio: early 2027; animation graph, terrain, material layering: mid 2027) and, as read, no Playtesting, Analytics or Experiment Agent entry and no Cube entry. Roblox Build's public alpha expanded to Serbia and Singapore. These are announcements, not shipped features. [S84][S85][S86][S87]

### B. Assistant and generation specifics (docs)
- Assistant: multiple chat threads per place, history saved in the cloud; a screen-capture subagent looks at the viewport; Planning Mode plans are editable Markdown stored in the cloud; creates materials, textured meshes, procedural models; inserts Creator Store assets; explains and edits scripts across many objects. Docs warn generated scripts may not work flawlessly. [S5]
- Slash commands (docs): `/insert_asset` (by ID), `/generate` and `/generate_mesh` (text or image reference), `/generate_procedural_model`, `/segment_mesh`, `/plan`. [S5]
- Limits (docs): up to 50 procedural models per rolling 24 h; mesh generation optional max-triangles parameter defaults to 10,000 (lower gives faceted low-poly); generated multi-part models up to 8 parts; `/segment_mesh` on an imported mesh up to 5 parts per command (run again for more). [S5]
- GenerationService (runtime Luau API on Cube; class is NotCreatable, a service; every method yields and needs the DynamicGeneration capability). Signatures read from the class reference on 2026-10-04: `GenerateMeshAsync(inputs: Dictionary, player: Player, options: Dictionary, intermediateResultCallback: Function?)` returns the generation id and a context id (unused); `inputs` supports only `Prompt` (string), `options` supports `SuggestedSize` (Vector3); server scripts only; marked "scheduled for future deprecation" in favour of GenerateModelAsync. `LoadGeneratedMeshAsync(generationId: string)` is client-only and returns a Model holding one MeshPart with an EditableMesh; that mesh does not replicate and loads once per id. `GenerateModelAsync(inputs: Dictionary, schema: Dictionary, options: Dictionary?)` returns a Model and a metadata table (a UUID and more); `inputs` keys are `TextPrompt` (required unless `Image`), `Image` (a Content, for example from `Content.fromAssetId`), `Size` (Vector3, approximate), `MaxTriangles` (integer) and `GenerateTextures` (default true); `schema` takes exactly one of `PredefinedSchema` ("Car5" = car as five Models, "Body1" = a single mesh) or `SchemaDefinition = { Groups = { "PartName", ... } }`; `options` is reserved and unused. The method page does not say server-only, but the guide's samples run in a server Script and state that objects generated in-game replicate to all players. `SegmentMeshAsync(meshPart: MeshPart, schema: Dictionary, options: Dictionary?)` works only in Studio edit mode or plugins, needs edit permission on a published mesh, and returns a Model plus a table with `UUID`. Documented errors for GenerateMeshAsync: rate limit exceeded per minute, moderation failed, internal error, character limit exceeded, service overloaded, size dimensions must be above 0; no numeric quota is published on these pages. Wrap calls in pcall. [S4][S89]
- Open-source Cube repo: Cube 3D v0.5 (July 2025) plus CubePart (part-controllable generation, May 2026 update). Hardware guidance: 16 GB VRAM, 24 GB with `--fast-inference`. The LICENSE file (repo pushed 2026-05-28; GitHub reports its SPDX id as NOASSERTION) is the "Cube3D Research-Only RAIL-MS License": the Permitted Purpose is defined as academic or research purposes only; the copyright and patent grants apply "only in connection with the Permitted Purpose"; users must hold downstream users to that purpose; hosting it as a service counts as Distribution and also needs the purpose limit. So the open weights and code cannot be used commercially. The licence says the Licensor claims no rights in generated Output, but also that no use of Output may contravene the licence and that you are accountable for it, so commercial use of outputs is a legal question this note does not answer. In-Studio and in-experience generation through Roblox's own Assistant and GenerationService is a separate service under Roblox's terms, not this licence. [S8, S75, S88]

### C. Studio MCP server (built in)
- Enable: Assistant, Manage MCP Servers, toggle "Enable Studio as MCP server". Connect through Quick Connect, a JSON config or a CLI command; any stdio-capable client works. [S6]
- Tool categories: scripts (read, edit, search by dot-notation path), assets (generate meshes and materials, search Creator Store, insert, upload images), data model (explore, inspect, launch subagents), Luau execution in Edit/Client/Server context, playtesting (play mode, screenshots, keyboard and mouse input, navigation), documentation lookup, session management. Each call needs a `studio_id`; use list_roblox_studios when several Studio windows are open. Search limits: script_search returns up to 10 results, script_grep up to 50 matches. [S6]
- Roblox's own warning: connected MCP clients can read and modify content in your open places; connect only clients you trust. [S6]
- Observed in this workspace (not from docs): this session exposes a `Roblox_Studio` MCP with tools named character_navigation, execute_luau, generate_material, generate_mesh, generate_procedural_model, generate_texture, get_console_output, get_studio_state, http_get, insert_asset, inspect_instance, list_roblox_studios, multi_edit, screen_capture, script_grep, script_read, script_search, search_asset, search_game_tree, segment_mesh, skill, start_stop_play, store_image, subagent, upload_image, user_keyboard_input, user_mouse_input, wait_job_finished. This matches the category list above.
- Community MCP servers: `boshyxd/robloxstudio-mcp` was archived on 2026-06-06 and its author points to the fork `Chrrxs/robloxstudio-mcp` (MIT; runtime debugging, playtest automation, profiler and memory captures). Given the built-in server, prefer the built-in one. [S76, S77]

### D. Creator Store (formerly Toolbox) safety
- Official Creator Store rules: assets may not obscure engine features (custom Lua VMs, getfenv, setfenv), may not require remote assets (`require(assetId)`, `loadstring`, `InsertService:LoadAsset`, `AssetService:LoadAssetAsync`, `ModuleScript.LinkedSource`), may not contain obfuscated code, and may not carry excessive junk script content. Report via "Report Item" on the asset page. [S46]
- Verification: distributing on the Creator Store requires a verified account (age check or government ID; phone is not accepted). Distribution caps per 30 days: verified 200 mesh/image/model, 100 audio, 10 plugins; unverified 10, 10, 2. [S46] Verification is not a trust signal: ID-verified accounts uploaded malicious models in 2025-2026. [S50]
- Insert-time controls: right-click an inserted object and choose "Disable Scripts"; check creator, rating and verification before inserting. [S46] Packages warn the same ("can contain malicious scripts"). [S65]
- 2025-11-07: Roblox's automated moderation briefly flagged any model containing the bare word "require" (even `print("require")`) as violating Community Standards; fixed the same day. Lesson: legitimate `require(ModuleScript)` is fine; the policy targets `require(assetId)`. [S47]
- 2025-11-21 onward (DevForum bug thread, still marked unresolved in April 2026): Creator Store search flooded by ID-verified virus models. Techniques reported: models with 546 nested children carrying very long foreign-language or emoji names to crash Studio on playtest return or selection; scripts hidden in innocent assets (skyboxes, welds); thousands of lines of spam to hide the payload and reportedly to overload AI detection; backdoors tied to a server-side executor service. First-page results "almost all virus" per reporters in April 2026 (community claim, unverified). [S50]
- 2026-05-13 (staff, Creator Store team): Script Capabilities sandboxing. Studio now sandboxes Creator Store insertions by default. Blocked: LoadUnownedAsset (which covers `require(id)` and LoadAssetAsync), LoadAsset, LoadString, CapabilityControl, getfenv/setfenv. Blocks happen instantly at runtime with an Output error. A short list of trusted assets (HD Admin, Kohl's Admin, Adonis) got a one-time exception. Override per instance through the beta `SandboxedInstanceMode` on Workspace (an `Enum.SandboxedInstanceMode` with exactly two values: Default = the engine-default sandbox state, Experimental = sandboxed instance mode enabled); Roblox strongly discourages granting these to unknown sources. Scope is Studio workflows; it does not change `LoadAssetAsync` in live games. [S48]
- Script capabilities reference: the `Sandboxed` property marks a Model, Folder or Script as a sandboxed container; capabilities include RunClientScript, RunServerScript, AccessOutsideWrite, CreateInstances, LoadString, LoadUnownedAsset, ScriptGlobals and 30+ engine API groups (Animation, Audio, DataStore, Network, Physics, Players, UI and more). Errors name the missing capability, for example AccessOutsideWrite when modifying Workspace. Workspace's `SandboxedInstanceMode` property enables it; the enum reference lists only Default (0) and Experimental (1). [S49, S73, S90]
- Defaults that limit damage: `ServerScriptService.LoadStringEnabled` is false by default, and `HttpService` requests are off until "Allow HTTP Requests" is ticked in Experience Settings, Security. (From documentation search snippets; page text not fetched, so verify.) [S81]
- Roblox's built-in warnings and LLM review: a community thread notes Studio shows a "scripts detected" prompt on model insert and that Assistant can be asked to review a script; no staff statement about automatic LLM scanning was found. [S51]
- Community scanner plugins (ShieldScan, Advanced Anti-Backdoor, 2026) exist; both authors say keyword matching yields false positives and misses new obfuscation, and ShieldScan reportedly misses PackageLink-style backdoors. Advanced Anti-Backdoor sends flagged code to an AI service (free tier 50 requests a day) so do not run it on private code without reading its terms. Treat them as triage, never as a verdict. [S62, S63]
- Plugin permission prompts (staff posts by RoxyBloxyy; both are from 2020, so check Studio's current behaviour): the first time a published plugin tries to manage a script in your data model (add or edit a script, or change Source or Parent) Studio shows a script-modification permission dialog (2020-11-18). A plugin's HTTP request to a domain it has not used before shows an HTTP permission dialog: the choice is remembered per plugin and per domain, sub-domains need their own grant, and closing the dialog denies that request without remembering (2020-03-23). Both choices can be changed in Studio's Plugin Management page. The HTTP post states that local plugins (files on disk) bypass permissions; the script post says its dialog works for published plugins only. Commenters asked whether a plugin update resets trust; the posts do not say. Current Creator Docs pages read for this pass (the plugins page) do not describe these prompts. [S94, S95]
- Plugins are the highest-risk asset class because they run with elevated Studio permissions. Historical (2021, archived) tips: check the publisher is the real creator, not a group with a copied name, check account age, avoid copies of popular plugins. Malicious plugins have injected scripts parented to nil, so they are invisible in Explorer; a 2024 case showed "haxed" warnings in logs with no script found. [S61, S60, S59]
- Packages (PackageLink, AutoUpdate) pull new versions automatically when a place opens for unmodified instances. A package you do not control is therefore a supply-chain path; a revoked-access package keeps existing copies. [S65]

### E. Open-source library status (checked 2026-10-04)
| Library | Last release | Last repo activity | Status |
|---|---|---|---|
| ProfileStore (MadStudioRoblox) | no GitHub release listed; Wally `lm-loleris/profilestore` 1.0.3 (realm server; versions 1.0.0 to 1.0.3 in the index) and a Creator Store asset | last push 2025-07-31 (type fix PR merge); Apache-2.0 | Maintained at low churn; the recommended session-lock store for new projects. [S9, S74, S92, S93] |
| ProfileService (MadStudioRoblox/loleris) | n/a | last push 2024-10-13 | Not archived but README says "no longer supported"; use ProfileStore for new projects. Data is key-compatible. [S21, S74] |
| Promise (evaera) | v4.0.0, 2022-03-03 | last commit 2023-10-16 | Stable, effectively dormant, MIT; still widely used. [S10] |
| RbxUtil (Sleitnick): Signal 2.0.3, Trove 1.8.0, Comm 1.0.1, Net 0.2.0, Component 2.4.8, TableUtil, Spring, Timer, Silo, Concur and others | per-module versions via Wally; no GitHub releases | commits 2025-11-12, 2025-11-25, 2026-07-27 ("Better types for TypedRemote"); pushed 2026-08-11 | Actively maintained. [S11] |
| Knit (Sleitnick) | v1.7.0, 2024-02-04 | archived (last push 2024-07-31) | Archived by the author: Luau types and Studio intellisense made a framework unnecessary; he suggests plain ModuleScript services plus thin remote wrappers. Do not start new projects on Knit. [S12] |
| Janitor (howmanysmall) | v1.17.0, 2024-08-12 (GitHub release); the Wally index lists `howmanysmall/janitor` up to 1.18.3 | pushed 2026-07-28 | Maintained (infrequent releases). Trove and Janitor overlap. [S20, S92] |
| Fusion (dphfox) | v0.3 ("v0.3-beta" tag), 2024-08-30 | pushed 2026-02-02 | Alive, still a 0.x beta API (scopes, use-functions, contextuals). [S13] |
| react-lua (jsdotlua, community fork of Roblox's React 17 port) | v17.2.1, 2024-12-04 | pushed 2025-05-23 | Maintained slowly; react-dom, devtools and react-refresh not ported. [S14] |
| Roact (Roblox) | n/a | archived; last push 2023-12-13 | Archived; use react-lua for React-style UI. [S24] |
| Vide (centau) | 0.4.1 on 2026-07-11 and 0.4.0 on 2026-01-17 (both flagged pre-release on GitHub); 0.3.1 on 2024-10-09 | last commit 2026-09-28; MIT; Wally `centau/vide` | Active reactive UI library, still 0.x. [S34, S91, S92] |
| Charm (littensy) | charm-v0.11.1 on 2026-10-01; charm-v0.11.0 on 2026-06-21 (release candidates rc.5 2026-03-26, rc.6 2026-05-06) | last commit 2026-10-01; MIT; Wally `littensy/charm` | Active atomic state library, still 0.x. [S35, S91, S92] |
| Matter (matter-ecs) | v0.8.5 2024-12-09 (v0.9.0-beta.0 2024-11-15) | last commit on the default branch 2024-11-24 (repo pushed 2024-12-31); MIT; Wally `matter-ecs/matter` and `evaera/matter` | ECS; no release for about 22 months and no default-branch commits since 2024; treat as dormant. [S29, S91, S92] |
| Zap (red-blox) | v0.6.29, 2026-06-23 | releases roughly every 2-6 months | Maintained buffer-packing networking code generator. [S25] |
| Blink (1Axen) | v0.18.9 and v1.0.0-pre.10, both 2026-09-19 | very active | Maintained networking IDL generator, 1.0 in prerelease. [S26] |
| roblox-ts | v3.0.0, 2024-09-12 (v2.3.0 2024-02-14) | commits on master through 2026-10-01 (dependency bumps and a compiler fix); MIT | TypeScript to Luau; maintained by commits but no release since 3.0.0 (about 25 months). [S30, S91] |

### F. Toolchain status
- Rojo: stable v7.7.1 released 2026-10-02, v7.7.0 on 2026-07-02, v7.7.0-rc.1 2025-11-27, v7.6.1 2025-11-07; repo pushed 2026-10-02; MPL-2.0. Maintained. The Studio plugin is separate per major version. `.luau` files are supported: the Rojo changelog lists "Added support for .luau files" under 7.2.0 (2022-06-29), `rojo init` generates `*.luau` since 7.4.0 (2024-01-16), and `init.plugin.luau` was a later fix, so `.server.luau`, `.client.luau`, `init.luau` and `.luau` modules all work on 7.7.x. [S15, S16, S91]
- Wally: v0.4.0-alpha.0 pre-release on 2026-09-26 (adds `--locked` install, homepage and repository manifest fields, lockfile format change); previous stable v0.3.2 from 2023-06-05; MPL-2.0. The registry is the `wally-index` Git repo. [S17]
- Rokit (rojo-rbx): toolchain manager, latest release v1.2.0 on 2025-09-30; reads Foreman and Aftman files; Rojo's docs recommend it. [S31, S16]
- Aftman: archived 2025-07-09; the author recommends mise. [S33]
- pesde: alternative Luau package manager (multi-runtime, also Lune); releases v0.7.1 2025-08-24, v0.7.2 2025-12-26, v0.7.3 2026-03-18, v0.7.4 2026-09-09 (tags carry a `+registry.0.2.3` suffix); last commit 2026-08-07; MIT. [S78, S91]
- Argon: alternative sync tool with CLI, VS Code extension and Studio plugin and two-way sync; releases 2.0.26 2025-08-25, 2.0.27 2025-12-10, 2.0.28 2026-03-04, 2.0.29 2026-05-19; repo pushed 2026-07-01; Apache-2.0. [S79, S91]
- Luau: weekly releases, 0.741 on 2026-10-02, 0.740 on 2026-09-25, 0.739 on 2026-09-18. Experimental in the recent notes: an "exact" table type, `if local` expressions. Roblox Studio's Luau may lag the open-source version. [S18]
- luau-lsp: 1.70.1 on 2026-09-27, 1.70.0 on 2026-09-20, 1.69.0 on 2026-07-18. [S19]
- StyLua: v2.5.2 on 2026-05-16 (v2.5.0 added Luau const-assignment support). [S28] Selene: 0.32.0 on 2026-10-01, 0.31.0 on 2026-05-21. [S32]
- Lune (standalone Luau runtime): v0.10.5 on 2026-07-02 (adds QueryDescendants to its roblox library, multiple independent DOMs). [S27]
- Jest for Roblox (Roblox/jest-roblox): repo pushed 2026-10-02, MIT; its docs install through Rotriever, not Wally, and use `*.spec.lua` plus `jest.config.lua`. TestEZ is archived (last push 2024-03-05). [S22, S23]

### G. Testing in Studio
- Modes: Test (F5, avatar at SpawnLocation or around (0,100,0)), Test Here (avatar in front of the camera), Run (F8, no avatar). In a solo test toggle between Client view (blue viewport border) and Server view (green border, free camera). Output is colour-coded: blue client, green server. [S66]
- "Server & Clients": one server plus up to 8 client windows; start with F7 or Play. Stop resets with Shift+F5. Team Test allows only one session at a time. [S66]
- Simulators: Device Simulator (screen size, pixel density, touch input; it does not reproduce a phone's CPU or GPU speed, which is an inference to verify on a real device), Network Simulator (latency, jitter, packet loss), Controller Emulator, Party Simulator, Player Emulator (language, region, content policy). VR emulation is Windows only. [S66]
- MicroProfiler: the docs give Ctrl+F6 (Cmd+F6 on Mac) for both Studio and the client (older posts say Ctrl+Alt+F6; that is outdated, the current MicroProfiler docs page lists only Ctrl+F6 and Cmd+F6 for Studio and the desktop client). 60 FPS budget is 16.67 ms; frame-bar colours: orange CPU-bound, blue GPU-bound, red GPU wait over 2.5 ms; wrap code with `debug.profilebegin("Label")` and `debug.profileend()`; server profiling through Developer Console (Ctrl+F9), MicroProfiler tab. [S67]
- Scripted testing services (Studio-only): `StudioTestService` (plugin scripts only: ExecutePlayModeAsync, ExecuteRunModeAsync, ExecuteMultiplayerTestAsync with 1-8 clients, EndTest, AddPlayers, GetTestArgs, LeaveTest), `VirtualInput` from `UserInputService:CreateVirtualInput()` (SendKey, SendMouseButton, SendMousePosition, SendMouseDelta, SendPointerAction, SendTextInput; errors if input would hit CoreGui), `StudioDeviceSimulatorService`. [S66, S69, S70]
- `TestService`: Check, Require (ends test on failure), Warn, Error, Fail, Message, Checkpoint, Done, RunAsync; properties AutoRuns, ExecuteWithStudioRun, NumberOfPlayers, Timeout, ErrorCount, TestCount, WarnCount. [S68]
- Open Cloud Luau Execution API: five endpoints all marked Stable; run a Luau task against a place version and fetch logs; suited to CI. [S71]

## How to apply it (rules for an AI builder)

### AI features
- DO connect an external agent through the built-in Studio MCP server, not the archived `Roblox/studio-rust-mcp-server` or archived `boshyxd` repo. [S6, S7, S76]
- DO pass `studio_id` on every MCP call and call `list_roblox_studios` first when more than one Studio window is open. [S6]
- DO run the loop plan, build, playtest, read console, fix: `start_stop_play`, `get_console_output`, `screen_capture`, then input tools. Use `character_navigation` only to reach a spot, because it bypasses the real input system; use `user_keyboard_input` and `user_mouse_input` to test real controls. [S37]
- DO keep generated scripts reviewable: Roblox's docs say generated code may be wrong; always read console output after a run. [S5]
- DO set a triangle cap on generated meshes (default 10,000; for props use 2,000-5,000 if budget matters). Max 8 parts for generated models, 5 per segment call, 50 procedural models per 24 h. [S5]
- DON'T assume mesh generation is free of moderation risk: prompts are filtered and a ban report exists tied to a character prompt. Keep prompts to neutral props; avoid realistic people. [S4, S44]
- DON'T use the open-source Cube weights or code in a commercial product: the licence limits use to academic or research purposes. Roblox's own Assistant and GenerationService are separate. [S75, S88]
- DON'T build on features announced as "coming" (Analytics Agent, Experiment Agent, scene generation, cloud agents) until Roblox ships them; as of 2026-10-04 no GA announcement was found. [S3]
- DO require BYOK for features documented as BYOK-only (reference images in plans, playtest screenshots). [S2]

### Creator Store safety
- DO prefer first-party code over free scripts. Assets without scripts (meshes, decals, audio) cannot carry code. [S55] Models, packages, plugins and anything with a Script, LocalScript or ModuleScript can.
- DON'T insert a model with scripts into a place with Studio MCP or plugin access that holds anything valuable until it has been vetted (recipe below) or inserted into a throwaway place.
- DON'T treat verified-creator, high ratings or sales as safety. [S50]
- DON'T enable `LoadStringEnabled`, and leave HTTP requests off unless a feature needs them. [S81]
- DON'T grant `SandboxedInstanceMode` overrides (LoadUnownedAsset, LoadString) to third-party assets. [S48]
- DO treat a `require` with a numeric ID, a `getfenv`/`setfenv`/`loadstring` call, `InsertService:LoadAsset`, text decoded with `string.reverse`, long decimal-escape strings (for example `\114\101\113...`), XOR or decompress loops, or a script inside a Weld, Part or sky object as a block-and-review signal. [S52, S53, S55, S57, S59]
- DO review plugins as code: they run elevated. Prefer plugins from the DevForum with visible source or from the real known creator. [S61]

### Libraries
- DO use ProfileStore for player data in new projects; do not start on ProfileService. [S21, S74]
- DO use `Trove` (RbxUtil) or `Janitor` for connection cleanup and `Signal` (RbxUtil) for custom events. [S11, S20]
- DO NOT choose Knit or Roact for new work. Use ModuleScript services and react-lua (or Fusion/Vide) instead. [S12, S24, S14]
- DO use Promise only when you already have Promise-style code; it is stable but has had no release since 2022. Native `task.spawn`/`task.defer` plus pcall covers most cases. [S10]
- DO prefer Blink or Zap over hand-written remotes when you need many typed, high-frequency events; both generate validated serialization code. [S25, S26]
- DO pin Wally dependency versions; Wally 0.4 is still alpha. [S17]

### Toolchain and testing
- DO use Rokit to pin tools, Rojo 7.7.x to sync, Wally for packages, StyLua and Selene or luau-lsp for formatting and analysis. [S31, S15, S17, S28, S32, S19]
- DO test in this order: Test (F5) for logic, Server & Clients (2-3 windows) for replication, Device Simulator for phone layout, Network Simulator for latency, then MicroProfiler for frame time. [S66, S67]
- DO measure on a real phone before claiming mobile performance. The simulator checks layout and input, not speed (inference). [S66]

## Recipes (each becomes a skill)

### Vet a Creator Store model before inserting it
When to use: any time the agent wants to insert a Creator Store model, plugin or package that contains scripts.
Steps:
1. Look at the listing: creator age and history, whether the creator is a user or a group named like another developer, rating votes, comments. A copy of a popular asset with the same name and icon from a different creator is a red flag. [S61, S55]
2. Prefer assets with no scripts. If a script-free alternative (mesh, decal) exists, use it.
3. Insert into a scratch place (never the production place). Leave the Studio sandbox default on. Do not tick any SandboxedInstanceMode override. [S48]
4. Immediately right-click the root and choose "Disable Scripts". [S46]
5. Count what you got: number of descendants and scripts. A prop that is mostly script instances, or any instance with hundreds of children or very long non-ASCII names, is hostile (the 546-children crash trick). [S50]
6. Run the scanner under "Luau reference snippets" over the model. Read every flagged script in full.
7. Block on any of: `require` with a number or arithmetic; `getfenv`/`setfenv`/`loadstring`; `InsertService`/`LoadAsset`; HttpService calls to any domain (backdoors report infected games to a webhook); `string.reverse` or decimal-escape strings; single lines above about 500 characters; huge runs of spaces that push code off screen; scripts parented under non-script objects (Weld, Part, skybox, Timer-like objects). [S53, S56, S57, S59, S54]
8. Search the whole model with Find All (Ctrl+Shift+F, Cmd+Shift+F on Mac) for `require(`, `getfenv`, `loadstring`, `Http`, `eriuqer`, `Destroy`. Repeat after deleting; there is usually more than one backdoor. [S52, S55]
9. If a flagged `require(id)` is real, open the module's page in the Creator Store and read its source and reviews. If you cannot read it, do not keep the asset.
10. Keep only what you understand. Copy the useful logic into your own ModuleScript rather than keeping the original container.
11. Test in a private server, with HttpService off, and look at the Output for warnings you did not write.
Pitfalls: keyword scans miss PackageLink-style backdoors and fresh obfuscation; many legitimate libraries use `require` and `getfenv`-free code, so judge behaviour not keywords. [S55, S62]

### Audit an existing place for backdoors and injected scripts
When to use: before publishing, after a teammate installs plugins, or when Output shows warnings you did not write (for example "haxed").
Steps:
1. Roll back through Version History to find when it appeared; compare versions. [S60]
2. Run the scanner snippet from the command bar over `game` and over ServerScriptService, ServerStorage, ReplicatedStorage, Workspace, StarterGui, StarterPack, StarterPlayer, Lighting, Teams.
3. Check all installed plugins in Studio and remove any you do not recognise. A malicious plugin can inject scripts that you cannot see in Explorer. [S59, S60]
4. Turn off Allow HTTP Requests and keep `LoadStringEnabled` false. [S81]
5. If one script is found, assume more; repeat scans; for a heavily infected place, copy known-good content into a fresh place and republish. [S60]
6. If a backdoor was live: lock the server, ban the offender, remove the backdoor, then reopen. [S52]
Pitfalls: scripts in nil-parented or deep objects hide from casual browsing; search by `IsA("LuaSourceContainer")` over descendants rather than by name.

### Sandbox untrusted assets with script capabilities
When to use: you must run third-party code (an admin system, a library) and want hard limits.
Steps:
1. Put the third-party model inside a Folder or Model and set its `Sandboxed` property to true. [S49]
2. Set Workspace `SandboxedInstanceMode` to Experimental (a beta property; the enum has only Default and Experimental). [S73]
3. Grant only the capabilities the asset needs; read the Output error text, which names the missing capability, and add one capability at a time. [S49]
4. Never grant LoadUnownedAsset, LoadString or CapabilityControl to code from an unknown author. [S48]
Pitfalls: Roblox says Creator Store sandboxing applies to Studio workflows and does not alter `LoadAssetAsync` behaviour in live games; do not treat it as a runtime guarantee. [S48]

### Set up a Rojo, Wally and Rokit project
When to use: any project that outgrows editing scripts inside Studio.
Steps:
1. Install Rokit (macOS or Linux: the `curl ... install.sh | bash` command from the Rokit README; Windows: the PowerShell script). [S31]
2. `rokit add rojo-rbx/rojo`, then `rokit install`; add Wally, StyLua and Selene the same way. [S16, S31]
3. `rojo plugin install` to put the matching Rojo 7 plugin into Studio. [S16]
4. Create `default.project.json`: `name`, `tree` with `$className: "DataModel"`; map `$path` folders to ReplicatedStorage, ServerScriptService and StarterPlayerScripts. Optional fields: `servePort` (default 34872), `globIgnorePaths`, `placeId`. [S16]
5. File names decide the class: `.server.lua` becomes a Script, `.client.lua` a LocalScript, `.lua` a ModuleScript; `init.*` turns the folder into that script; `.meta.json`, `.model.json`, `.rbxm`, `.json` (to ModuleScript), `.csv` (LocalizationTable), `.txt` (StringValue). `.luau` is accepted in place of `.lua` for every one of these script forms (`.server.luau`, `.client.luau`, `init.luau`; verified in the Rojo changelog and source). [S16, S91]
6. `wally init`, then add dependencies in `wally.toml`; `wally install` produces a Packages folder; add it to the project file under ReplicatedStorage. `realm` is `shared` or `server`. [S17]
7. Run `rojo serve`, click Connect in the Studio plugin, edit in your editor. `rojo build -o game.rbxl` for a place file.
Pitfalls: plugin and server major versions must match; Wally is still 0.3.x stable with 0.4 alpha; pin versions in `wally.toml`. For ProfileStore use `ProfileStore = "lm-loleris/profilestore@1.0.3"` in a `[server-dependencies]` section (it is a server-realm package).

### Add session-locked player data with ProfileStore
When to use: any game that saves player data.
Steps:
1. Install ProfileStore as a ModuleScript in ServerScriptService (distribution via Wally or Roblox asset; the docs site is madstudioroblox.github.io/ProfileStore). [S74]
2. Define a template table and create the store with `ProfileStore.New("PlayerStore", TEMPLATE)`.
3. On PlayerAdded call `StartSessionAsync` with a key and a `Cancel` callback that returns true if the player left; if it returns nil kick with a retry message. [S74]
4. On a profile: `AddUserId`, `Reconcile`, connect `OnSessionEnd` (kick the player: another server took the session or the profile ended), keep a `Profiles[player]` map.
5. On PlayerRemoving call `EndSession`. Also loop existing players at startup.
6. Use `MessageAsync` instead of ProfileService's GlobalUpdates. [S74]
Pitfalls: old ProfileService data loads under the same keys, but `MessageAsync` may confuse ProfileService on the same profile; do not mix both versions on one profile. [S74]

### Clean up connections and objects with Trove
When to use: per-player, per-round, per-component state.
Steps:
1. `local trove = Trove.new()` for each owner (round, NPC, UI component).
2. Register with `trove:Connect(signal, fn)`, `trove:Add(object)`, `trove:Clone(instance)`, `trove:BindToRenderStep(name, priority, fn)`, `trove:AddPromise(promise)`, or a child scope `trove:Extend()`. [S11]
3. Tie lifetime to an Instance with `trove:AttachToInstance(instance)` or call `trove:Clean()` when the owner ends.
Pitfalls: cleaning the same object twice is not an error in Trove but calling `Remove` after `Clean` has no effect; do not store the trove in a table that outlives its owner.

### Drive Studio from an external agent over MCP (build, test, fix)
When to use: a Claude Code, Cursor or Codex agent should edit a place and verify it works.
Steps:
1. In Studio: Assistant, Manage MCP Servers, enable "Enable Studio as MCP server"; use Quick Connect for the client (restart the client; restart Studio if the client was just installed). [S6, S38]
2. Agent calls `list_roblox_studios`, picks a `studio_id`, then reads state with search_game_tree and script_read or script_grep before editing. [S6, S37]
3. Edit with script edit tools or by running Luau in Edit context.
4. Verify: `start_stop_play`, `get_console_output`, `screen_capture`, input tools for UI clicks. [S37]
5. On errors, read the console, patch, re-run. Cap the loop (for example 5 iterations) to avoid the loop failure Roblox mentioned in the 2026-02 notes. [S36]
6. For big places, use the Data Model Search subagent so findings, not tool noise, return to the main thread. [S38]
Pitfalls: `run_script_in_play_mode` (open-source server era) is callable only in Edit mode and triggers a stop and reset. [S36] Multi-Studio inference is experimental. [S37] The MCP client can modify the open place: connect only trusted clients. [S6]

### Use Planning Mode in Assistant for a multi-step feature
When to use: a feature touching many scripts and instances.
Steps:
1. Type `/plan` or choose "plan" in the Assistant dropdown. [S2]
2. Answer the clarifying questions; edit the Markdown plan (it is stored in the cloud). [S5]
3. Approve; generation agents build; verification agents playtest and report bugs. [S2]
4. Review each changed script before publishing.
Pitfalls: reference images and playtest screenshots need BYOK; the 2026-04 build had a looping bug (pause to escape). [S2]

### Multi-client playtest checklist
When to use: before any multiplayer feature is called done.
Steps:
1. Test (F5): walk the first-minute flow; check Output for blue (client) and green (server) errors. [S66]
2. Server & Clients with 2-3 clients (max 8), press F7. Verify replication, leaderboards, teleports of players, and that the second client sees the first client's actions. [S66]
3. Switch the solo view between Client and Server to find objects that exist on only one side.
4. Network Simulator: add latency, jitter and packet loss; check input still feels responsive and no remote spam appears. [S66]
5. Device Simulator on a phone profile: check buttons are reachable and HUD is not under the top bar. [S66]
6. Player Emulator for a non-English locale. [S66]
Pitfalls: Team Test allows only one session; stop with Shift+F5 to restore pre-test state. [S66]

### Profile a frame spike with the MicroProfiler
When to use: frame time above 16.67 ms or a reported lag.
Steps:
1. Open it (Ctrl+F6, or Cmd+F6 on Mac; the docs list the same keys for Studio and the desktop client; on mobile turn it On in the Settings menu and open the shown address from a machine on the same network). [S67]
2. Pause the capture (Ctrl+P), click the tallest frame bar. [S67]
3. Read bar colour: orange CPU-bound, blue GPU-bound, red heavy GPU wait. [S67]
4. Expand parent labels in the timeline; fix the widest child first.
5. Add `debug.profilebegin("Name")` and `debug.profileend()` around your own code to name it. [S67]
6. For server lag use Developer Console (Ctrl+F9), MicroProfiler tab, set frame count and delay. [S67]
Pitfalls: profile in a real client, not only Studio; Studio adds overhead (general engine knowledge, unverified here).

### Automated tests: Jest and Studio test services
When to use: logic modules (economy math, inventory) and smoke tests of a place.
Steps:
1. Unit tests: add Jest Roblox (docs use Rotriever; see S22 for the packaging caveat), put `*.spec.lua` files in `__tests__`, add `jest.config.lua` with `testMatch = { "**/*.spec" }`, and an entry script that calls `Jest.runCLI(...)`. [S22]
2. Plugin-driven smoke test: a plugin script calls `StudioTestService:ExecutePlayModeAsync(args)`; inside the session the server reads `GetTestArgs()` and calls `EndTest(result)`. The plugin receives the result. [S69]
3. Multiplayer smoke: `ExecuteMultiplayerTestAsync(2, args)`; use `AddPlayers` for late joiners. [S69]
4. UI automation: `UserInputService:CreateVirtualInput()` then SendMouseButton, SendKey, SendTextInput (not usable on CoreGui). [S70]
5. Assertion helper: `TestService:Check(cond, msg)`, `Require`, `Done()`. [S68]
6. CI: Open Cloud Luau Execution API (Stable) to run a task on a place version and download logs. [S71]
Pitfalls: StudioTestService execute methods are plugin-only; only one multiplayer test per Studio instance. [S69]

### Choose a library stack (decision recipe)
When to use: starting a new project.
Steps:
1. Data: ProfileStore. 2. Events: Roblox native signals plus RbxUtil Signal for custom ones. 3. Cleanup: Trove. 4. Networking: plain RemoteEvents with validation for small games; Blink or Zap for heavy typed traffic. 5. UI: plain Instances for small HUDs; react-lua, Fusion or Vide for large UI (pick one; Roact is archived). 6. Async: `task` library; Promise only for existing code. 7. Architecture: ModuleScript services, not Knit. 8. Tooling: Rokit, Rojo, Wally, StyLua, Selene, luau-lsp.
Pitfalls: Fusion is 0.3 beta; Blink is 1.0 prerelease; Wally 0.4 alpha. Pin versions.

## Luau reference snippets

Backdoor and injection triage scanner (run from the command bar in Studio; it reads sources and reports, it never deletes):
```lua
--!strict
local SUSPECT = {
	{ name = "require(number or expr)", pattern = "require%s*%(%s*[%d%-%(]" },
	{ name = "getfenv/setfenv", pattern = "[gs]etfenv" },
	{ name = "loadstring", pattern = "loadstring" },
	{ name = "LoadAsset", pattern = "LoadAsset" },
	{ name = "InsertService", pattern = "InsertService" },
	{ name = "HttpService", pattern = "HttpService" },
	{ name = "reversed require", pattern = "eriuqer" },
	{ name = "string.reverse", pattern = "string%.reverse" },
	{ name = "decimal escapes", pattern = "\\%d%d%d\\%d%d%d\\%d%d%d" },
}

local function report(inst: Instance, why: string)
	warn(("[scan] %s : %s"):format(inst:GetFullName(), why))
end

local function scan(root: Instance)
	local count = 0
	for _, inst in root:GetDescendants() do
		if #inst:GetChildren() > 200 then
			report(inst, "more than 200 children (crash-bait?)")
		end
		if utf8.len(inst.Name) == nil or #inst.Name > 60 then
			report(inst, "very long or non-UTF8 name")
		end
		if inst:IsA("LuaSourceContainer") then
			count += 1
			local ok, src = pcall(function()
				return (inst :: LuaSourceContainer).Source
			end)
			if ok then
				for _, rule in SUSPECT do
					if string.find(src, rule.pattern) then
						report(inst, rule.name)
					end
				end
				for line in string.gmatch(src, "[^\n]+") do
					if #line > 500 then
						report(inst, "line over 500 chars (obfuscation or hidden code)")
						break
					end
				end
				local parent = inst.Parent
				if parent and (parent:IsA("BasePart") or parent:IsA("JointInstance") or parent:IsA("Sky")) then
					report(inst, "script parented under " .. parent.ClassName)
				end
			end
		end
	end
	print(("[scan] %d scripts checked under %s"):format(count, root:GetFullName()))
end

scan(game:GetService("ServerScriptService"))
scan(game:GetService("Workspace"))
```
The parent check flags scripts sitting inside Parts, joints (Weld, Glue and similar) or Sky objects, which legitimate scripts rarely do (a normal Part with a Script child is common, so review hits rather than auto-reject). Patterns are plain Lua patterns, so numeric `require` matches `require(123)` and `require(0x...)`-style IDs but also `require(-1)`; review each hit. Scripts hidden by plugins (nil parent) are not reachable from `game` and need a rollback or republish instead. [S52-S60]

ProfileStore setup (from its tutorial):
```lua
local Players = game:GetService("Players")
local ProfileStore = require(game.ServerScriptService.ProfileStore)

local TEMPLATE = { Cash = 0, Items = {} }
local PlayerStore = ProfileStore.New("PlayerStore", TEMPLATE)
local Profiles: { [Player]: typeof(PlayerStore:StartSessionAsync()) } = {}

local function onPlayerAdded(player: Player)
	local profile = PlayerStore:StartSessionAsync(`{player.UserId}`, {
		Cancel = function()
			return player.Parent ~= Players
		end,
	})
	if profile ~= nil then
		profile:AddUserId(player.UserId)
		profile:Reconcile()
		profile.OnSessionEnd:Connect(function()
			Profiles[player] = nil
			player:Kick("Profile session end - Please rejoin")
		end)
		if player.Parent == Players then
			Profiles[player] = profile
		else
			profile:EndSession()
		end
	else
		player:Kick("Profile load fail - Please rejoin")
	end
end

for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end
Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(function(player)
	local profile = Profiles[player]
	if profile ~= nil then
		profile:EndSession()
	end
end)
```
[S74]

RbxUtil Signal and Trove (module paths depend on your Wally layout):
```lua
local Signal = require(Packages.Signal)
local Trove = require(Packages.Trove)

local roundEnded = Signal.new()
local trove = Trove.new()

trove:Connect(roundEnded, function(winner) print("winner", winner) end)
roundEnded:Fire("Team A")
trove:Clean()   -- disconnects everything
```
Signal has Connect, Once, Fire, Wait, DisconnectAll, Destroy; FireDeferred uses task.defer. Trove has Add, Connect, Clean, Extend, Clone, BindToRenderStep, AddPromise, Remove, AttachToInstance. [S11]

Wally manifest (shape from the Wally README; package names and versions checked against the wally-index repository and RbxUtil's own `wally.toml` files on 2026-10-04):
```toml
[package]
name = "yourscope/yourgame"
version = "0.1.0"
registry = "https://github.com/UpliftGames/wally-index"
realm = "shared"

[dependencies]
Signal = "sleitnick/signal@2.0.3"
Trove = "sleitnick/trove@1.8.0"
TableUtil = "sleitnick/table-util@1.2.1"

[server-dependencies]
ProfileStore = "lm-loleris/profilestore@1.0.3"
```
Verified registry entries (latest version in the index): `sleitnick/signal` 2.0.3, `sleitnick/trove` 1.8.0, `sleitnick/comm` 1.0.1, `sleitnick/net` 0.2.0, `sleitnick/component` 2.4.8, `sleitnick/table-util` 1.2.1 (the scope has `table-util`, not `tableutil`), `sleitnick/spring` 1.0.0, `sleitnick/timer` 2.0.0, `sleitnick/silo` 0.2.0, `sleitnick/concur` 0.1.2, `lm-loleris/profilestore` 1.0.3 (a server-realm package, so it goes under `[server-dependencies]`), `evaera/promise` 4.0.0, `howmanysmall/janitor` 1.18.3, `centau/vide`, `littensy/charm`, `matter-ecs/matter`. The left-hand name (`Signal`, `Trove`) is the alias you require from the Packages folder. [S92, S93, S96]

Rojo project file (shape from Rojo docs):
```json
{
  "name": "MyGame",
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": {
      "Shared": { "$path": "src/shared" },
      "Packages": { "$path": "Packages" }
    },
    "ServerScriptService": { "Server": { "$path": "src/server" } },
    "StarterPlayer": {
      "StarterPlayerScripts": { "Client": { "$path": "src/client" } }
    }
  }
}
```
[S16]

Custom profiler labels:
```lua
debug.profilebegin("SpawnWave")
-- work
debug.profileend()
```
[S67]

Plugin-side scripted play test:
```lua
local StudioTestService = game:GetService("StudioTestService")
local result = StudioTestService:ExecutePlayModeAsync({ scenario = "smoke" })
print("test returned", result)
-- inside the session, from the server DataModel:
-- local args = StudioTestService:GetTestArgs(); StudioTestService:EndTest("ok")
```
Plugin scripts only. [S69]

## Open questions / unverified
- Assistant usage quota: no published number; Roblox's docs do not state credits or pricing for built-in generation, and the GenerationService pages give no numeric per-minute quota. [S5, S43, S4]
- Whether the Playtesting, Analytics and Experiment Agents are generally available as of 2026-10-04. Verified: the Playtest Agent has been a Studio Beta feature since 2026-04-09 and was demoed with multiplayer support at RDC 2026 (2026-09-11) with no GA statement; the 2026-07-16 post says all three arrive "over the coming months"; the RDC 2026 DevForum recap as read does not list the Analytics or Experiment Agent. A search-result snippet attributes "Late 2026" to the Analytics Agent on Roblox's Creator Roadmap page, but that page is rendered by script and could not be read, so the date is unverified. Treat the Analytics and Experiment Agents as not shipped. [S3, S83, S85, S87]
- Procedural Model Generation shipping date: listed "coming soon" on 2026-04-15 yet documented with a `/generate_procedural_model` command and a 50 per 24 h limit; exact GA date unverified. [S1, S5]
- Studio AI code completion/autocomplete product details and history (Code Assist, 2023-2024): not fetched.
- Whether the Creator Store default sandbox applies to the Sandboxed property or only to inserted assets by an internal route; whether sandboxing extends to plugin insertions. [S48, S73]
- Claims from community threads (Creator Store results "almost all virus", the "Exoliner" executor link, AI-detection overload) are single-source user reports. [S50]
- Whether the 2020 plugin permission prompts behave identically in current Studio (for example after a plugin update) was not re-verified; the posts are the only sources. [S94, S95]
- Whether commercial use of Cube outputs (as opposed to the weights and code) is permitted: the licence disclaims Licensor rights in Output but ties Output use to the licence. Legal reading unverified. [S75, S88]
- Device Simulator not emulating device performance is an inference, not a doc statement.
- The PackageLink backdoor technique: only the ShieldScan author's note that it is missed; no technical write-up found. [S62, S65]
- Creator Store rename timing from Toolbox/Creator Marketplace (2024) was not verified in this pass.
- ProfileStore has no GitHub release or tag list; its Wally index versions (1.0.0 to 1.0.3) are the only numbered versions. [S9, S93]

### Resolved in the 2026-10-04 gap pass (details are in Key facts and the library table)
- Cube licence: Research-Only RAIL-MS, Permitted Purpose is academic or research only; weights and code are not commercially usable. [S88]
- `SandboxedInstanceMode` values: Default and Experimental only. [S90]
- MicroProfiler hotkey: current docs say Ctrl+F6 (Cmd+F6 on Mac) in Studio and on the desktop client; Ctrl+Alt+F6 in older posts is outdated. [S67]
- Rojo `.luau`: supported since 7.2.0. [S91]
- Release data for Vide, Charm, Matter, roblox-ts, pesde, Argon: filled from GitHub API. [S91]
- GenerationService method signatures: read from the class YAML. [S4][S89]
- Wally package names for RbxUtil modules (and ProfileStore): verified in the wally-index. [S92, S93, S96]
- Plugin permission prompts: documented by two 2020 staff posts. [S94, S95]
- RDC 2026 engineering announcements: DevForum recap and press coverage read; see section A. [S84][S85][S86][S87]

## Sources
[S1] Roblox Studio is Going Agentic, Roblox newsroom, 2026-04-15, https://about.roblox.com/newsroom/2026/04/roblox-studio-going-agentic
[S2] Announcing Planning Mode for Roblox Assistant, Roblox staff, DevForum, 2026-04-16, https://devforum.roblox.com/t/announcing-planning-mode-for-roblox-assistant/4580715
[S3] Build Without Limits on Roblox, Roblox newsroom, 2026-07-16, https://about.roblox.com/newsroom/2026/07/build-without-limits-on-roblox
[S4] GenerationService class reference, Roblox Creator Docs (read 2026-10-04), https://create.roblox.com/docs/en-us/reference/engine/classes/GenerationService.md
[S5] Assistant for Studio guide, Roblox Creator Docs, https://create.roblox.com/docs/en-us/assistant/guide and https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/assistant/guide.md
[S6] Connect to the Roblox Studio MCP server, Roblox Creator Docs, https://create.roblox.com/docs/studio/mcp and https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/studio/mcp.md
[S7] Roblox/studio-rust-mcp-server repository (archived, README), GitHub, https://github.com/Roblox/studio-rust-mcp-server
[S8] Roblox/cube repository README (Cube 3D v0.5, CubePart), GitHub, https://github.com/Roblox/cube
[S9] MadStudioRoblox/ProfileStore repository metadata and commit list, GitHub (API), https://github.com/MadStudioRoblox/ProfileStore
[S10] evaera/roblox-lua-promise repository, releases and commits, GitHub, https://github.com/evaera/roblox-lua-promise
[S11] Sleitnick/RbxUtil repository, commits and docs (Signal, Trove), https://github.com/Sleitnick/RbxUtil , https://sleitnick.github.io/RbxUtil/api/Trove/ , https://sleitnick.github.io/RbxUtil/api/Signal/
[S12] Sleitnick/Knit repository, releases and ARCHIVAL.md, https://github.com/Sleitnick/Knit , https://github.com/Sleitnick/Knit/blob/main/ARCHIVAL.md
[S13] dphfox/Fusion repository and releases, https://github.com/dphfox/Fusion
[S14] jsdotlua/react-lua repository and releases, https://github.com/jsdotlua/react-lua
[S15] rojo-rbx/rojo repository and releases, GitHub, https://github.com/rojo-rbx/rojo
[S16] Rojo 7 documentation (installation, project format, sync details), https://rojo.space/docs/v7/
[S17] UpliftGames/wally repository, releases and README, https://github.com/UpliftGames/wally
[S18] luau-lang/luau releases, https://github.com/luau-lang/luau/releases
[S19] JohnnyMorganz/luau-lsp releases, https://github.com/JohnnyMorganz/luau-lsp/releases
[S20] howmanysmall/Janitor repository and releases, https://github.com/howmanysmall/Janitor
[S21] MadStudioRoblox/ProfileService repository (no longer supported notice), https://github.com/MadStudioRoblox/ProfileService
[S22] Roblox/jest-roblox repository and Jest Roblox docs, https://github.com/Roblox/jest-roblox , https://roblox.github.io/jest-roblox-internal/
[S23] Roblox/testez repository (archived), https://github.com/Roblox/testez
[S24] Roblox/roact repository (archived), https://github.com/Roblox/roact
[S25] red-blox/Zap releases and site, https://github.com/red-blox/Zap , https://zap.redblox.dev/
[S26] 1Axen/Blink releases, https://github.com/1Axen/Blink
[S27] lune-org/lune releases, https://github.com/lune-org/lune
[S28] JohnnyMorganz/StyLua releases, https://github.com/JohnnyMorganz/StyLua
[S29] matter-ecs/matter repository and releases, https://github.com/matter-ecs/matter
[S30] roblox-ts/roblox-ts releases, https://github.com/roblox-ts/roblox-ts
[S31] rojo-rbx/rokit repository and releases, https://github.com/rojo-rbx/rokit
[S32] Kampfkarren/selene releases, https://github.com/Kampfkarren/selene
[S33] LPGhatguy/aftman repository (archived 2025-07-09), https://github.com/LPGhatguy/aftman
[S34] centau/vide repository, https://github.com/centau/vide
[S35] littensy/charm repository, https://github.com/littensy/charm
[S36] Studio MCP Server Updates and External LLM Support for Assistant, Roblox staff, DevForum, 2026-02-21 (updated 02-25), https://devforum.roblox.com/t/studio-mcp-server-updates-and-external-llm-support-for-assistant/4415631
[S37] Assistant Updates: Studio Built-in MCP Server and Playtest Automation, DevForum, 2026-03-05, https://devforum.roblox.com/t/assistant-updates-studio-built-in-mcp-server-and-playtest-automation/4474643
[S38] Assistant Updates: Data Model Search Subagent and Quick Connect for MCP Clients, DevForum, 2026-04-24, https://devforum.roblox.com/t/assistant-updates-the-data-model-search-subagent-and-quick-connect-for-mcp-clients/4596579
[S39] Accelerating creation powered by the Roblox Cube foundation model, Roblox newsroom, 2026-02-04, https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model
[S40] Introducing Roblox Cube, Roblox newsroom, 2025-03-17, https://about.roblox.com/newsroom/2025/03/introducing-roblox-cube
[S41] RDC 2025 announcements, Roblox newsroom, 2025-09-05, https://about.roblox.com/newsroom/2025/09/roblox-rdc-2025 ; and Revolutionizing Creation on Roblox, 2023-09 (older, possibly stale), https://about.roblox.com/newsroom/2023/09/revolutionizing-creation-roblox
[S42] Introducing the Open Source Studio MCP Server, Urukeli (Roblox DevRel), DevForum, 2025-05-13, https://devforum.roblox.com/t/introducing-the-open-source-studio-mcp-server/3649365
[S43] Studio Assistant Limits and Reliability, T0nkus (community), DevForum, 2026-07-18, https://devforum.roblox.com/t/studio-assistant-limits-and-reliability/4743968
[S44] WARNING: Using Roblox Studio AI Assistant Can Get Your Account Banned, EECaptain (community), DevForum, 2026-07-25, https://devforum.roblox.com/t/warning-using-roblox-studio-ai-assistant-can-get-your-account-banned-false-positives/4756750
[S45] Roblox's AI assistant gets new agentic tools to plan, build, and test games, TechCrunch, 2026-04-16, https://techcrunch.com/2026/04/16/robloxs-ai-assistant-gets-new-agentic-tools-to-plan-build-and-test-games/
[S46] Creator Store, Roblox Creator Docs, https://create.roblox.com/docs/en-us/production/creator-store.md and https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/production/creator-store.md
[S47] [SOLVED] The word "require" made any model not distributed on Creator Store, DevForum, 2025-11-07, https://devforum.roblox.com/t/solved-the-word-require-made-any-model-not-distributed-on-creator-store/4051504
[S48] Protect Your Games with Script Capabilities Sandboxing, Kairomatic (Roblox Creator Store team), DevForum, 2026-05-13, https://devforum.roblox.com/t/protect-your-games-with-script-capabilities-sandboxing/4634642
[S49] Script capabilities, Roblox Creator Docs, https://create.roblox.com/docs/en-us/scripting/capabilities
[S50] [UNFIXED] Creator store flooded with ID-verified viruses, Fe_ct and others (community), DevForum, 2025-11-21 to 2026-04, https://devforum.roblox.com/t/new-creator-store-viruses-use-explorer-to-crash-your-game-hide-its-malicious-scripts/4087170
[S51] Free Model Toolbox: Automatically Scan Uploads for Malicious Scripts Using LLMs, sayer80 (community), DevForum, 2026-04-24, https://devforum.roblox.com/t/free-model-toolbox-automatically-scan-uploads-for-malicious-scripts-using-llms/4596495
[S52] Removing Backdoors 101, NATlONALSECURITY, DevForum, 2020-04-27 (may be stale), https://devforum.roblox.com/t/removing-backdoors-101/545574
[S53] Backdooring Explained [MEGATHREAD], ghidras (popbob), DevForum, 2020-10-30 (may be stale), https://devforum.roblox.com/t/backdooring-explained-megathread/845508
[S54] Backdooring Explained (Chapter 2), ghidras (popbob), DevForum, 2021-01-22 (may be stale), https://devforum.roblox.com/t/backdooring-explained-chapter-2/998413
[S55] How to detect/find a backdoor, thinkinaboutmemories, DevForum, 2020-05-11 (may be stale), https://devforum.roblox.com/t/how-to-detectfind-a-backdoor/569640
[S56] I need all of the best ways to detect viruses and backdoors, Negativize, yoolurs and others, DevForum, 2023-09-27, https://devforum.roblox.com/t/2620987
[S57] Loadstring() - how to check the code on malicious functions, kaanture36448, fast_front, littleBitsman, DevForum, 2025-08-24, https://devforum.roblox.com/t/loadstring-how-to-check-the-code-on-malicious-functions/3897510
[S58] Is this some virus?, DevForum, 2025-10-26, https://devforum.roblox.com/t/is-this-some-virus/4026622
[S59] Mysterious Script in my Game, DevForum, 2024-05-27, https://devforum.roblox.com/t/mysterious-script-in-my-game-o/2986022
[S60] Virus affecting scripts, DevForum, 2024-06-29, https://devforum.roblox.com/t/virus-affecting-scripts/3045755
[S61] [archive] Tips to help keep you safe from malicious plugins, devin_is2real, DevForum, 2021-03-07 (stale, archived), https://devforum.roblox.com/t/1089281
[S62] ShieldScan - Anti-Backdoor Scanner for Roblox Studio, Noobinhoaopro (tui), DevForum, 2026-07-13, https://devforum.roblox.com/t/shieldscan-anti-backdoor-scanner-for-roblox-studio/4736119
[S63] Advanced Anti-Backdoor - Script Security, un1ND3X, DevForum, 2026-04-22, https://devforum.roblox.com/t/advanced-anti-backdoor-script-security/4589903
[S64] How to prevent Roblox game backdoors, creation.dev (third-party blog, updated 2026-02-25; low trust, used only for corroboration), https://www.creation.dev/learn/how-to-prevent-roblox-game-backdoors
[S65] Packages, Roblox Creator Docs, https://create.roblox.com/docs/studio/packages
[S66] Studio testing modes, Roblox Creator Docs, https://create.roblox.com/docs/studio/testing-modes and https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/studio/testing-modes.md
[S67] MicroProfiler, Roblox Creator Docs, https://create.roblox.com/docs/studio/microprofiler and https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/performance-optimization/microprofiler/index.md
[S68] TestService class reference, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/TestService.yaml
[S69] StudioTestService class reference, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/StudioTestService.yaml
[S70] VirtualInput class reference, Roblox Creator Docs, https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/VirtualInput.yaml
[S71] Luau Execution API, Roblox Open Cloud docs, https://create.roblox.com/docs/cloud/reference/features/luau-execution
[S72] Security tactics, Roblox Creator Docs, https://create.roblox.com/docs/scripting/security/security-tactics
[S73] Workspace.SandboxedInstanceMode, Roblox Creator Docs (class yaml), https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/Workspace.yaml
[S74] ProfileStore documentation and tutorial, MadStudioRoblox, https://madstudioroblox.github.io/ProfileStore/ and https://madstudioroblox.github.io/ProfileStore/tutorial/
[S75] Cube3d-v0.1 Research-Only RAIL-MS licence text, Roblox/cube, https://raw.githubusercontent.com/Roblox/cube/main/LICENSE
[S76] boshyxd/robloxstudio-mcp repository (archived 2026-06-06), https://github.com/boshyxd/robloxstudio-mcp
[S77] Chrrxs/robloxstudio-mcp repository (maintained fork), https://github.com/Chrrxs/robloxstudio-mcp
[S78] pesde-pkg/pesde repository, https://github.com/pesde-pkg/pesde
[S79] argon-rbx/argon repository, https://github.com/argon-rbx/argon
[S80] Roblox Introduces Build, press release via Nasdaq, 2026-07-16, https://www.nasdaq.com/press-release/roblox-introduces-build-new-way-create-platform-2026-07-16 (search result only, not fetched)
[S81] ServerScriptService.LoadStringEnabled and HttpService docs, Roblox Creator Docs, https://create.roblox.com/docs/en-us/reference/engine/classes/ServerScriptService.md and https://create.roblox.com/docs/cloud-services/http-service (from search-result snippets only; not fetched, verify)
[S82] Roblox/creator-docs repository, content/en-us tree (GitHub API), read 2026-10-04, https://github.com/Roblox/creator-docs
[S83] [Studio Beta] Studio Assistant & MCP Playtest Agent, Mirrattar (Roblox staff), DevForum, 2026-04-09, https://devforum.roblox.com/t/studio-beta-studio-assistant-mcp-playtest-agent/4566767
[S84] RDC 2026: The World Needs More Play, Roblox newsroom, 2026-09, https://about.roblox.com/newsroom/2026/09/rdc-2026-the-world-needs-more-play
[S85] Roblox shows off Playtest Agent for Roblox devs to test games, GamesBeat, 2026-09-11, https://gamesbeat.com/roblox-shows-off-playtest-agent-for-roblox-devs-to-test-games/
[S86] Roblox unveils new play, creation and monetisation tools at RDC 2026, PocketGamer.biz, 2026-09-14, https://www.pocketgamer.biz/roblox-unveils-new-play-creation-and-monetisation-tools-at-rdc-2026/
[S87] RDC26: What We Announced, DevForum announcements, 2026-09 (post date not captured), https://devforum.roblox.com/t/rdc26-what-we-announced/4865880 ; and Roblox Unveils New Ways to Play, Build, and Grow at RDC, Roblox investor relations press release, 2026-09-11, https://ir.roblox.com/news/news-details/2026/Roblox-Unveils-New-Ways-to-Play-Build-and-Grow-at-the-Roblox-Developers-Conference-RDC/default.aspx
[S88] Cube3D Research-Only RAIL-MS License (full text read) and repository metadata, Roblox/cube, GitHub API, read 2026-10-04, https://github.com/Roblox/cube/blob/main/LICENSE
[S89] Model generation guide, Roblox Creator Docs, https://create.roblox.com/docs/parts/model-generation (read via the creator-docs repo, 2026-10-04)
[S90] SandboxedInstanceMode enum reference, Roblox Creator Docs (creator-docs repo), read 2026-10-04, https://create.roblox.com/docs/reference/engine/enums/SandboxedInstanceMode
[S91] GitHub API release, tag and commit data read 2026-10-04 for rojo-rbx/rojo (CHANGELOG.md and src/snapshot_middleware/lua.rs), centau/vide, littensy/charm, matter-ecs/matter, roblox-ts/roblox-ts, pesde-pkg/pesde, argon-rbx/argon, https://api.github.com/repos/<owner>/<repo>
[S92] UpliftGames/wally-index registry repository (package files under sleitnick, lm-loleris, evaera, howmanysmall, centau, littensy, matter-ecs), GitHub API, read 2026-10-04, https://github.com/UpliftGames/wally-index ; Wally README manifest sections, https://github.com/UpliftGames/wally
[S93] MadStudioRoblox/ProfileStore wally.toml and README (package lm-loleris/profilestore 1.0.3, Creator Store asset link), GitHub, read 2026-10-04, https://github.com/MadStudioRoblox/ProfileStore
[S94] Introducing Plugin HTTP Permissions, RoxyBloxyy (Roblox staff), DevForum, 2020-03-23 (stale), https://devforum.roblox.com/t/introducing-plugin-http-permissions/493269
[S95] Introducing Plugin Script Modification Permissions, RoxyBloxyy (Roblox staff), DevForum, 2020-11-18 (stale), https://devforum.roblox.com/t/introducing-plugin-script-modification-permissions/877312
[S96] Sleitnick/RbxUtil module wally.toml files (signal, trove, comm, net, component, spring, timer, silo, concur), GitHub API, read 2026-10-04, https://github.com/Sleitnick/RbxUtil/tree/main/modules
