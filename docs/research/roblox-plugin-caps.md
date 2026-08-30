# Roblox Studio Plugin Capabilities for an AI Agent Integration

Research findings for Golem (AI SaaS that builds Roblox games: web app + Studio plugin).
Researched 2026-08-30 against official Roblox creator docs (create.roblox.com/docs), the
Roblox/creator-docs GitHub source, and official Roblox DevForum announcements. Anything
not confirmed against an official source is marked **UNVERIFIED**.

---

## TL;DR for Golem's architecture

- A local `.rbxm`/`.lua` plugin can do essentially everything the agent loop needs *inside* the DataModel: create/modify any Instance, properties, attributes, terrain, read+rewrite script source (`ScriptEditorService:UpdateSourceAsync`), wrap edits in undo/redo recordings (`ChangeHistoryService:TryBeginRecording`/`FinishRecording`), control the selection, and start/pause/stop **Run-mode** simulation (`RunService:Run/Pause/Stop`, PluginSecurity).
- Plugin HTTP is **independent of the game's `HttpEnabled` setting** — plugins use a per-plugin, per-domain permission prompt model, and **local plugins bypass the prompts entirely**. Rate limit is 500 req/min (community-reported 2,000/min for localhost). Long polling works (Roblox's own official Studio MCP server is literally a plugin long-polling a local web server), but each request is capped by the non-configurable default timeout (~30 s, UNVERIFIED exact value), so use ≤25 s poll cycles.
- **The hard wall is vision:** there is no supported way for a plugin to capture the viewport as pixels it can read or upload. `ThumbnailGenerator` is not plugin-accessible; `CaptureService` targets in-experience client captures and returns temp content IDs (not raw bytes), and is reported flaky in Studio; `ViewportFrame` renders 3D but exposes no pixel readback. This is an acknowledged gap with open feature requests. Plan on OS-level screenshots (companion desktop process) or geometric/self-report feedback instead.
- **No supported API starts a Play-Solo playtest (with avatar).** `RunService:Run()` gives Run mode only (simulation, no player character). Logs are readable via `LogService.MessageOut` / `GetLogHistory`; a plugin runs in both edit and run DataModels, so a run-mode copy of the plugin can stream output back over HTTP.
- Open Cloud fills the server-side gaps: publish places (`POST /universes/v1/{universeId}/places/{placeId}/versions`), upload assets (`POST https://apis.roblox.com/assets/v1/assets` — models .fbx/.gltf/.rbxm, images .png/.jpg ≤8000×8000, audio .mp3/.ogg/.wav/.flac ≤7 min, 20 MB/file), and the now-**stable Luau Execution API** (`/cloud/v2/.../luau-execution-session-tasks`) that runs a script headlessly against a place with full DataModel access — up to 5 min/task, 10 concurrent tasks per place — though DataModel changes are **not** persisted.

---

## (a) HttpService from plugins

**Enabling / `HttpEnabled`:**
- The experience-level `HttpService.HttpEnabled` setting ("Allow HTTP Requests") applies **only in-game**. Since the Plugin HTTP Permissions change, Studio plugins ignore it: "All previously existing Studio plugins will now use the new model and ignore the game's Allow HTTP Requests setting—that setting now applies only in game." (official DevForum announcement "Introducing Plugin HTTP Permissions").
- Instead, per-plugin/per-domain permission prompts govern plugin HTTP (see section (i)). **"Local plugins will bypass permissions"** — a plugin installed in the local Plugins folder makes HTTP requests with no prompt at all. This is ideal for Golem's locally installed plugin.

**API surface:**
- `HttpService:RequestAsync(options: Dictionary): Dictionary` — options: `Url`, `Method`, `Headers`, `Body`, plus a documented optional `Timeout` field: "An optional timeout value in seconds to make requests time out more quickly. Values must be greater than zero and no greater than the default request timeout." The default timeout's numeric value is not documented (community consensus ≈30 s for connection, hangs up to ~2 min in failure cases — **UNVERIFIED exact number**). Returns `Success`, `StatusCode`, `StatusMessage`, `Body`, `Headers`.
- `GetAsync(url, nocache, headers)`, `PostAsync(url, data, content_type, compress, headers)`, `JSONEncode`/`JSONDecode` (JSONEncode accepts buffers up to 50 MiB).
- HTTPS only; ports below 1024 blocked except 80/443; port 1194 blocked; `".."` disallowed in URL paths.

**Rate limits:**
- "The current limitation for sending and receiving external HTTP requests is **500 requests per minute**" (per game server; in Studio, per Studio session). Exceeding it stalls request functions ~30 s.
- Separate limit of **2,500 requests/minute for Open Cloud requests** made via HttpService (`x-api-key`; only `x-api-key` and `content-type` headers allowed on that path).
- Community/DevForum-reported: localhost requests from Studio get an elevated **2,000/min** limit (**UNVERIFIED** — engine-bug thread, not formal docs).

**Long-polling feasibility: YES, proven.**
- Roblox's own official Studio MCP server (`github.com/Roblox/studio-rust-mcp-server`) is exactly this architecture: "a web server built on axum that a Studio plugin long polls," with the plugin posting tool responses back. Keep each poll under the default timeout (use ~15–25 s server-side hold, then respond empty and re-poll). 500 req/min budget supports even 1–2 s fast polling.
- Note: requests only happen while Studio is open and the plugin is running; there are no plugin-side WebSockets, so long-poll or interval-poll is the only push channel.

## (b) ScriptEditorService

All members are **PluginSecurity** (plugin-only). Key APIs (exact signatures from the engine reference):
- `UpdateSourceAsync(script: LuaSourceContainer, callback: function): ()` — yields; callback receives the old source and returns the new source. This is the **correct, merge-safe way to edit script source** (handles the case where the script is open in an editor with unsaved changes).
- `GetEditorSource(script: LuaSourceContainer): string` — current source as seen in the open editor (falls back to `Script.Source` semantics when not open).
- `OpenScriptDocumentAsync(script: LuaSourceContainer, options: Dictionary): Tuple<boolean, string>` — opens the script in the Studio editor.
- `RegisterAutocompleteCallback(name, priority, callbackFn)` and `RegisterScriptAnalysisCallback(name, priority, callbackFn)` — inject custom autocomplete entries and analysis diagnostics (useful for in-editor AI hints).
- Events: `TextDocumentDidOpen`, `TextDocumentDidChange`, `TextDocumentDidClose` — live change feed of what the user types.
- Reading/writing `Script.Source` directly also works from plugins but triggers the **script injection permission** for Store-installed plugins (section (i)) and doesn't merge with open editors; prefer `ScriptEditorService`.

## (c) ChangeHistoryService (undo/redo)

- Recording pattern (current, recommended):
  ```lua
  local rec = ChangeHistoryService:TryBeginRecording("Golem: build lobby")  -- returns id or nil
  if rec then
      -- ... make DataModel changes ...
      ChangeHistoryService:FinishRecording(rec, Enum.FinishRecordingOperation.Commit)
  end
  ```
- `TryBeginRecording(name, displayName?)` returns nil if a recording is already active — "You may only have one recording per plugin active at a time."
- `FinishRecordingOperation` enum: `Commit` (add to undo stack), `Cancel` (revert the changes), `Append` (merge into previous waypoint).
- `SetWaypoint(name)` still exists but the docs say it "will be deprecated soon in favor of TryBeginRecording()". Docs warn you **must** begin a recording before making changes to avoid warnings/errors.
- Also available: `IsRecordingInProgress()`, `GetCanUndo()`/`GetCanRedo()` (return `(bool, name)`), `Undo()`, `Redo()`, events `OnRecordingStarted/Finished`, `OnUndo`, `OnRedo`.
- Edit-mode only: "ChangeHistoryService is not enabled at runtime, so calling its methods in a running experience has no effect."

## (d) Instances, properties, attributes, terrain

- Plugins run with full DataModel write access in edit mode: `Instance.new`, property writes, `SetAttribute`/`GetAttribute`, CollectionService tags, cloning, reparenting — all normal Luau APIs work (the only gated area is script Source/Parent management for Store-installed plugins, per section (i)).
- **Terrain API** (usable from plugins; these are standard engine methods):
  - `Terrain:FillBlock(cframe, size, material)`, `FillBall(center, radius, material)`, `FillCylinder(cframe, height, radius, material)`, `FillWedge(cframe, size, material)`, `FillRegion(region: Region3, resolution, material)`
  - `WriteVoxels(region, resolution, materials, occupancy)` / `ReadVoxels(region, resolution)` — low-level voxel access; resolution must be **4** (4×4×4-stud voxel grid; docs/code samples use resolution 4 exclusively, and Region3s must be aligned to the 4-stud grid — use `Region3:ExpandToGrid(4)`).
  - `ReplaceMaterial(region, resolution, source, target)`, `SetMaterialColor(material, color3)`, `Clear()`.
- Wrap all of this in ChangeHistoryService recordings so users can undo AI edits.

## (e) Screenshots / viewport capture from a plugin — the honest answer

**There is no supported way for a Studio plugin to capture the 3D viewport as image data it can read or upload.** Details:

- `ThumbnailGenerator` (the internal class Studio uses to render thumbnails) is **not accessible to plugins** (RobloxScriptSecurity/internal). An open DevForum feature request ("Include ThumbnailService into Roblox Studio with PluginSecurity...") exists precisely because it's unavailable.
- `CaptureService` is designed for **in-experience client captures** (screenshots the *player* takes). `CaptureScreenshot(onCaptureReady)` returns a temporary `contentId` usable only to display in an ImageLabel / save to the user's gallery / share — **not raw pixel bytes** a plugin could POST to a server. In Studio it's additionally unreliable: an open Studio bug reports `CaptureScreenshot()` callbacks that never fire depending on viewport contents. Other members: `TakeScreenshotCaptureAsync(onCaptureReady, captureParams)` (returns `Enum.ScreenshotCaptureResult` + capture object), `PromptSaveCapturesToGallery`, `PromptShareCapture`. **Treat CaptureService as unusable for Golem's edit-mode feedback loop.**
- `ViewportFrame` renders 3D instances into a GUI but has **no pixel readback/export**; `EditableImage` cannot read from a ViewportFrame or a capture in a way that yields exportable bytes from a plugin (**UNVERIFIED that no EditableImage path exists at all, but no documented route was found**).
- There is a live DevForum feature request explicitly titled "Plugin Access to Screenshot Button functionality/Viewport Image for AI Integration/Automation" (2025/2026) confirming AI-plugin builders cannot make the model "see" the viewport today.
- **Practical alternatives:** (1) a companion desktop process taking OS-level screenshots of the Studio window (this is what existing Studio-MCP ecosystems do, e.g. `screen_capture` tools); (2) structural feedback instead of pixels — have the plugin serialize scene graph, bounding boxes, camera raycasts; (3) Open Cloud Luau Execution for headless validation logic (no rendering, so still no images).

## (f) Playtests and output logs

**Starting/stopping playtests:**
- `RunService:Run(): ()` — **PluginSecurity** — starts **Run mode** simulation (physics + scripts, no player avatar). `RunService:Pause()` and `RunService:Stop()` (both PluginSecurity) pause/stop it. Note community caveat: `Stop()` after `Run()` restores the pre-run state but Studio behavior around data-model restore has quirks (**UNVERIFIED detail**).
- State queries: `IsRunning()`, `IsRunMode()`, `IsEdit()` (PluginSecurity), `IsStudio()`.
- **There is no supported plugin API to start Play Solo / "Play Here" (playtest with a player avatar) or team-test.** Nothing in RunService/StudioService exposes it; community MCP servers that "start playtests" either use `RunService:Run()` or synthesize keyboard input at the OS level. Treat F5-style playtests as user-initiated only.
- Plugins run in **both** the edit DataModel and the run/play DataModel (separate plugin instances). A run-mode instance of your plugin can observe the running game and phone home over HTTP.

**Reading output logs:**
- `LogService.MessageOut(message: string, messageType: Enum.MessageType)` — event fired for every output-window message; usable from plugins to stream logs.
- `LogService:GetLogHistory(): {any}` — returns the log history array (message, messageType, timestamp).
- `ServerMessageOut` / `RequestServerOutput` exist for client access to server logs in live games but are not documented on the current reference page (**UNVERIFIED / RobloxScriptSecurity — don't rely on them**); in Studio Play Solo the plugin's run-mode instance sees the combined local output via `MessageOut`.
- `ScriptContext.Error` (script, message, stack) is also available for richer error capture (**standard engine API; not re-verified this pass**).

## (g) Selection and StudioService

- `Selection` (all PluginSecurity): `Get(): Instances`, `Set(selection)`, `Add(instances)`, `Remove(instances)`, event `SelectionChanged`.
- `StudioService` (PluginSecurity): `ActiveScript` (read-only — script currently open in editor), `GetUserId(): number` (logged-in Studio user — useful to bind the plugin session to a Golem account), `GetClassIcon(className)`, `PromptImportFileAsync(fileTypeFilter)` / `PromptImportFilesAsync(...)` (native file pickers returning `File` instances), `GridSize`, `UseLocalSpace`, `ShowConstraintDetails`, `DraggerSolveConstraints`.

## (h) Plugin distribution

**Local install (recommended for Golem):**
- Studio: Plugins menu → **"Save as Local Plugin"** writes the plugin into the local Plugins folder. Any `.rbxm`/`.rbxmx`/`.lua` file dropped in that folder is loaded as a plugin at Studio boot.
- Folder paths (docs point to the folder-icon in the **Manage Plugins** window; exact paths community-documented):
  - Windows: `%LOCALAPPDATA%\Roblox\Plugins`
  - macOS: `~/Documents/Roblox/Plugins`
  - The path is configurable via Studio's `PluginsDir` setting (**UNVERIFIED edge case**).
- Dev loop: work in `PluginDebugService` (enable "Plugin Debugging Enabled" in Studio settings); right-click → "Save and Reload Plugin" or Ctrl/⌘+Shift+L.
- **Key advantage:** local plugins **bypass the per-domain HTTP permission prompts** and the script-injection permission prompt (script-modification permission "will work for published plugins only"). Golem's installer can just copy the `.rbxm` into this folder — zero permission friction. (Counterpoint: users may reasonably prefer the audited Store flow.)

**Creator Store publishing:**
- Studio: Plugins menu → "Publish as Plugin" (name, description, creator), then in Creator Hub/asset config toggle **"Distribute on Creator Store"**.
- Plugins can be **sold in USD**; creators receive "100% of net proceeds on transactions" (Creator Store, unlike avatar marketplace, takes no platform cut beyond payment processing).
- Requirements effective **Aug 26, 2026** (official announcement "New Requirements to Publish to the Creator Store"): all publishers need an **Age Check or ID Verification**, account in good standing, account ≥2 days old; selling models/plugins additionally requires **2-Step Verification**, **ID Verification**, residence in a supported country; seller accounts require government-ID verification (phone verification no longer qualifies) and Stripe onboarding; 18+ or 13–17 with parental consent. Default search results only surface ID/Age-verified creators' content.
- Uploaded plugins pass standard asset moderation; there is no documented human "app review" process beyond moderation (**UNVERIFIED depth of review**).

## (i) User-facing Studio permission prompts

Two separate permission systems, both managed in **Plugins → Manage Plugins (Plugin Management page)**, both applying to **installed (Store) plugins only — local plugins bypass both**:

1. **Plugin HTTP permissions** (per plugin × per domain): "Whenever a plugin makes a web request to a new domain, you will see a pop-up dialog requesting you to approve or deny access." Accept/Deny are remembered; Cancel rejects the current request without saving. "All sub-domains will need to be granted explicit permission" — no wildcards, so keep Golem's API on a single stable hostname.
2. **Plugin script injection/modification permission** (per plugin): triggered the first time a plugin creates or modifies `Script`/`LocalScript`/`ModuleScript` objects in the DataModel (Source or Parent writes, or `Instance.new` of a script type parented into the DataModel). One dialog; deny blocks script management and errors surface in Output. "This feature will work for published plugins only."

No permission prompt exists for non-script Instance edits, Terrain, Selection, or RunService control.

## (j) Relevant Open Cloud APIs (API-key auth, `apis.roblox.com`)

**Place publishing:**
- `POST https://apis.roblox.com/universes/v1/{universeId}/places/{placeId}/versions?versionType=Published` (or `Saved`).
- Body: the place file — `application/octet-stream` for `.rbxl`, `application/xml` for `.rbxlx`. Returns `{ "versionNumber": n }`.
- API key needs **universe-places: Write** scope on the target experience.
- Caveat from docs: it "doesn't update certain instance types" — places containing `EditableImage`, `EditableMesh`, `PartOperation`, `SurfaceAppearance`, `BaseWrap` must be published from Studio after modification.

**Assets API (uploads):**
- `POST https://apis.roblox.com/assets/v1/assets` (create), `PATCH .../assets/{assetId}` (update), poll `GET .../assets/v1/operations/{operationId}`.
- Scopes: asset read/write permissions on the API key.
- Types/limits: **Model** .fbx/.gltf/.glb/.rbxm/.rbxmx (this is the mesh-upload path); **Image/Decal** .png/.jpeg/.bmp/.tga, max 8000×8000; **Audio** .mp3/.ogg/.wav/.flac, ≤7 minutes, **10 uploads/month unverified → 100/month ID-verified**; **Video** .mp4/.mov ≤5 min, ≤4096×2160, ≤3.75 GB, ≤20/day (13+ ID-verified); **Animation** .rbxm/.rbxmx. File size cap: **20 MB per asset** create/update.
- Standalone "Mesh" type is delivered in Roblox's internal format; upload meshes as Model (.fbx/.gltf).

**Luau Execution API — exists and is now marked Stable in the reference docs:**
- Create task: `POST /cloud/v2/universes/{universeId}/places/{placeId}/luau-execution-session-tasks` (or against a specific `versions/{versionId}`); binary inputs via `POST /cloud/v2/universes/{universeId}/luau-execution-session-task-binary-inputs`.
- Poll: `GET .../luau-execution-sessions/{sessionId}/tasks/{taskId}`; logs: `GET .../tasks/{taskId}/logs`.
- Scope: `luau-execution-sessions:write` (+ read).
- Behavior: server loads the place and runs your script headlessly with **full DataModel access** at GameScript permission level; initial cloud-service blocks (DataStores, HttpService) were later lifted per official updates; physics is not simulated. Limits (per official announcement + docs summary): **up to 5 minutes per task, 10 concurrent tasks per place** (launched as 30 s / 2 tasks, since raised). **Changes to the place are NOT saved** — "the API runs your code on a separate server"; persistence is a stated long-term goal. Script return values + structured logs are retrievable.
- Golem use cases: headless validation/tests of generated code against the real engine, procedural checks, CI — but not as a write path (pair it with the place-publishing API: build `.rbxl` server-side, publish, then execute Luau against the new version to validate).

**Open Cloud rate limits:** applied per API-key owner (user or group) across all their keys; per-endpoint limits exist but the docs state "additional, undocumented limits may apply." HttpService-originated Open Cloud calls: 2,500/min per server.

---

## Architecture implications for Golem

1. **Transport:** local `.rbxm` plugin ⟶ long-poll `https://api.golem.app` (single hostname; Cloudflare Worker). Local install avoids all prompts; if shipping via Creator Store later, expect two one-time prompts (domain + script injection) and ID-verification publishing requirements.
2. **Edit loop:** every agent action = `TryBeginRecording` → apply Instance/Terrain/`UpdateSourceAsync` edits → `FinishRecording(Commit)`. Free undo/redo UX.
3. **Feedback loop:** no viewport pixels from inside Studio. Use scene-graph serialization + raycast probes + `LogService` streams; optionally an OS-level screenshot companion later.
4. **Testing:** `RunService:Run()` for physics/script smoke tests with log streaming from the run-mode plugin instance; Open Cloud Luau Execution for headless cloud-side validation. Real Play Solo remains a human action.
5. **Cloud path:** Open Cloud publish + assets APIs let the Worker build/publish without Studio in the loop for template bootstrapping.

---

## Sources

- HttpService reference: https://create.roblox.com/docs/reference/engine/classes/HttpService
- HttpService docs source (Timeout field, 500/min, 2500/min): https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/HttpService.yaml
- In-game HTTP limits: https://create.roblox.com/docs/cloud-services/http-service
- Plugin HTTP Permissions (official announcement): https://devforum.roblox.com/t/introducing-plugin-http-permissions/493269
- Plugin Script Modification Permissions (official announcement): https://devforum.roblox.com/t/introducing-plugin-script-modification-permissions/877312
- ScriptEditorService: https://create.roblox.com/docs/reference/engine/classes/ScriptEditorService
- ChangeHistoryService: https://create.roblox.com/docs/reference/engine/classes/ChangeHistoryService and https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes/ChangeHistoryService.yaml
- Terrain: https://create.roblox.com/docs/reference/engine/classes/Terrain
- RunService (Run/Pause/Stop, PluginSecurity): https://create.roblox.com/docs/reference/engine/classes/RunService
- LogService: https://create.roblox.com/docs/reference/engine/classes/LogService
- Selection: https://create.roblox.com/docs/reference/engine/classes/Selection
- StudioService: https://create.roblox.com/docs/reference/engine/classes/StudioService
- CaptureService: https://create.roblox.com/docs/reference/engine/classes/CaptureService
- CaptureService Studio bug (callback never fires): https://devforum.roblox.com/t/captureservicecapturescreenshot-never-completes-under-certain-conditions-in-studio/3977531
- Feature request confirming no plugin viewport capture (AI use case): https://devforum.roblox.com/t/plugin-access-to-screenshot-button-functionalityviewport-image-for-ai-integrationautomation/4223805
- Feature request confirming ThumbnailService not plugin-accessible: https://devforum.roblox.com/t/include-thumbnailservice-into-roblox-studio-with-pluginsecurity-to-allow-transparent-render-draw-captures-with-no-skybox/3601682
- Studio plugins guide (local install, publish flow): https://create.roblox.com/docs/studio/plugins
- Local plugins folder paths (community + Studio Manage Plugins folder icon): https://devforum.roblox.com/t/where-is-the-local-plugins-folder-located/1369813
- Creator Store: https://create.roblox.com/docs/production/creator-store
- New Creator Store publishing requirements (effective 2026-08-26): https://devforum.roblox.com/t/new-requirements-to-publish-to-the-creator-store/4820095
- Open Cloud place publishing: https://create.roblox.com/docs/cloud/guides/usage-place-publishing
- Open Cloud Assets API: https://create.roblox.com/docs/cloud/guides/usage-assets
- Open Cloud rate limits: https://create.roblox.com/docs/cloud/reference/rate-limits
- Luau Execution API reference (Stable): https://create.roblox.com/docs/cloud/reference/features/luau-execution
- Luau Execution API announcement (limits, capabilities): https://devforum.roblox.com/t/beta-open-cloud-engine-api-for-executing-luau/3172185
- Official Roblox Studio MCP server (long-poll plugin architecture precedent): https://github.com/Roblox/studio-rust-mcp-server
- Localhost 2000/min plugin limit (UNVERIFIED, engine-bug report): https://devforum.roblox.com/t/plugin-localhost-httpservice-limit-affected-by-run-mode/3046079
