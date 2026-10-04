# Roblox Luau Architecture and Engineering (client/server, security, persistence, performance, new APIs)
_Researched 2026-10-04 by Claude (Sonnet 5.5). Sources: 107._
_Gap pass 2026-10-04: 6 items resolved, 12 still open._

How this was verified: every API, property, method and limit below was checked against the Creator Hub docs
(create.roblox.com/docs). Reference pages were read from the raw docs source (`Roblox/creator-docs`, `content/en-us/...`,
which is what create.roblox.com renders) and the rendered `.md` pages. The fetch tool summarises pages, so exact numbers
were cross-read on two pages wherever two existed. Anything I could not confirm is in "Open questions / unverified".
Docs read on 2026-10-04. Community material older than 2024 is flagged as stale.

## Key facts

### Client/server model and script placement
- The server is the single authority over game state; clients send requests and the server validates, applies and replicates the result. Typical player latency is 100-300 ms; Studio defaults to zero latency but can simulate it. [S93][S30]
- Script containers: `Script` runs on the server or client according to `RunContext` (`Legacy` = server containers only, `Server`, `Client`); `LocalScript` is client only; `ModuleScript` has no RunContext. Official advice: one `Script` with `RunContext = Client` in `ReplicatedStorage` and one `Script` with `RunContext = Server` in `ServerScriptService` as the two entry points, everything else in ModuleScripts. [S44]
- Only content in `ServerStorage` and `ServerScriptService` is hidden from clients. Every `LocalScript`, client-context `Script` and any `ModuleScript` that replicates can be decompiled by an exploiter even if it is never required. Never mix server-secret logic into a ModuleScript that lives in `ReplicatedStorage`. [S33]
- ModuleScripts run once per require, return exactly one non-nil value, and that reference is cached; each side (server, client) and each `Actor` gets its own copy. A cyclic require errors with "Requested module was required recursively". [S43][S51]
- `Instance:Destroy()` sets Parent to nil, locks Parent, disconnects all connections and destroys children. It is the correct disposal method. `WaitForChild` warns after 5 s of waiting if no timeout is given and returns nil on timeout. [S39]
- Events: `Connect`, `Once`, `Wait`, `Disconnect`. Connections on an object are auto-disconnected when the object is destroyed; connections to anything else must be disconnected by you. [S89]
- `Workspace.SignalBehavior`: `Immediate` (legacy default) or `Deferred`. New template places use Deferred; Default will eventually become Deferred. Deferred handlers run at engine resumption points (input, PreRender, PreAnimation, PreSimulation, PostSimulation, task-library resumes, Heartbeat, BindToClose). Use `Signal:Once()` for first-occurrence listeners. [S47]

### Remotes and anti-exploit
- Three remote types: `RemoteEvent` (reliable, ordered, async), `UnreliableRemoteEvent` (no delivery/order guarantee, payload over 1000 bytes is dropped, for continuously changing data), `RemoteFunction` (yields). [S29][S28]
- Rate: about 500 requests per second per client, shared across all RemoteEvents and UnreliableRemoteEvents. RemoteEvents buffer more than Unreliable ones before discarding; unhandled events log "Remote event invocation discarded". [S27][S28]
- Historic limits (20 calls/s and 50 KB/s of remote traffic) were removed from the docs; devs report no hard data cap but a performance cost. Community rule of thumb from the DevForum thread (Aug 2025, third-party opinion): 20 fires/s for recurring events is safe, send on state change, not per frame. [S38]
- Arguments: functions become nil; metatables are lost; mixed-key tables cannot be sent (use a pure array or a pure dictionary); avoid nil holes in arrays; non-string table keys (Instances, userdata) are converted to strings; Instances the receiver cannot see (e.g. in `ServerStorage`) arrive as nil; tables are copied, never shared by reference. [S29]
- Server-to-client `RemoteFunction:InvokeClient` is dangerous: a client can error, never return (infinite yield) or disconnect. Do not use it; use a RemoteEvent. [S29]
- What exploiters can send: NaN, infinity, huge strings, invalid UTF-8, tables in place of Instances, wrong types, events from any distance or while "disabled" (ProximityPrompt, ClickDetector, DragDetector fire from anywhere), rapid spam, and race-condition timing. NaN is type "number" and fails every comparison, so it silently passes range checks. [S31]
- Validation layers the docs ask for: context/permission (is the player near the shop, alive, owns the item), type/structure (`typeof(x) == "Instance"`, `IsDescendantOf` the expected folder), value (`math.isfinite`, positive integers, ids exist in a server table), and server-enforced rate limiting with a token bucket. Never relay client data through `FireAllClients` without validating it first. [S31][S30]
- Threat-model each feature: what if it fires 1000 times per second, with arbitrary parameters, at the worst moment. Keep authoritative data and logic in `ServerScriptService`/`ServerStorage`, not `ReplicatedStorage` or `Workspace`. [S30]
- Defensive design beats detection: make the abuse worthless (e.g. reduced points for killing a just-spawned player; obby rewards require sequential server-verified checkpoints; combat damage computed on the server from weapon stats with server raycasts). [S32]
- Detection heuristics: fastest-possible completion time, maximum legitimate rate of gain, action cadence (suspiciously constant intervals), honeypot RemoteEvents that real clients never fire. Use a suspicion score, escalate: silent log, quiet mitigation, temporary restriction, visible enforcement; delay visible consequences; use the Ban API for persistent offenders. [S34]
- Backdoors from Creator Store models: dangerous capabilities are Network, DataStore, AssetRequire (`require(assetId)`), LoadString and CapabilityControl. Mitigation: set `Workspace.SandboxedInstance` to Experimental, enable `Sandboxed` on the model and grant only the `Capabilities` it needs. Malicious code is often hidden by whitespace pushing it off-screen. [S35]
- Place access control: Access Control for Places (Creator Dashboard > Audience > Access Settings) has three values. "Fully open" lets players join any place via teleports from any game, deep links and invites; "Limited to same universe" allows only teleports from within your own games but permits client- and server-initiated ones; "Secure within universe only" allows non-start places to be joined only through server-initiated teleports from the same game. Use the last for strict progression, test places or reserved-server-only places. A per-place "Direct Access Control" overrides the game-level value for a non-start place, and Studio > Experience Settings > Security > "Allow Third Party Teleports" controls teleports out to games you do not own. Separate dev and production universes. [S33][S24]
- Teleport data and teleport settings are client-visible and spoofable; never carry currency or permissions in them. [S22][S24]
- `MarketplaceService`: only `ProcessReceipt` is proof of a developer-product purchase; never trust a client message saying "I bought it", and do not use `PromptProductPurchaseFinished` to grant items. [S31][S26][S25]

### Network ownership and physics
- By default the engine assigns network ownership of unanchored parts near a player's character to that client. The owner controls position, rotation and velocity (including Inf/NaN), which enables fling and teleport exploits. Anchoring prevents it. For gameplay-critical unanchored assemblies call `part:SetNetworkOwner(nil)` on the server. [S36][S37]
- `SetNetworkOwner` is server-only, and cannot be used on anchored parts, parts welded to anchored parts, or parts outside Workspace. `GetNetworkOwner()` returns the Player or nil for the server. `SetNetworkOwnershipAuto()` restores automatic assignment. `CanSetNetworkOwnership()` returns true or false plus a reason. [S37]
- Server-side movement validation (until you adopt Server Authority): use leaky-bucket accumulators that allow latency bursts. [S36]
- Physics stepping: adaptive mode spreads assemblies over 60, 120 and 240 Hz islands and can improve physics performance up to 2.5x versus fixed mode; fixed mode runs everything at 240 Hz and suits racing/destruction. Property: `Workspace.PhysicsSteppingMethod`. [S64][S52]
- Sleep system: an assembly sleeps when linear speed is below 0.33 studs/s and angular speed below 0.42 and acceleration under 0.24 studs/s^2; collision with an assembly faster than 1 stud/s or most property changes wake it. [S65]
- `Workspace.Gravity` default 196.2 studs/s^2; `FallenPartsDestroyHeight` is clamped to -50,000..50,000. [S63]
- Collision fidelity: Box is cheapest, Hull is medium, Default/Precise use the most memory. `CollisionGroup` names are at most 100 characters. [S52][S37]

### DataStores: how they behave and current budgets
- DataStores are server-only (Script/ModuleScript). In Studio, enable File > Experience Settings > Security > "Enable Studio Access to API Services" (otherwise error 403). [S2][S1]
- Core calls: `GetAsync`, `SetAsync`, `UpdateAsync`, `IncrementAsync`, `RemoveAsync`. `UpdateAsync` reads then writes, the callback cannot yield, and returning nil cancels the write. `SetAsync` can corrupt data when two servers write the same key; prefer `UpdateAsync` when a write depends on the current value. [S2][S7]
- `GetAsync` keeps a local 4-second cache after the first read; `SetAsync`/`UpdateAsync` apply to the cache immediately and restart the timer. Cache hits do not consume budget. `DataStoreGetOptions.UseCache = false` bypasses the cache. Cache does not apply to versioning/listing calls. [S4][S7]
- Versioning: the first write to a key in each UTC hour creates a versioned backup; later writes in that hour overwrite it. Backups expire 30 days after being overwritten; the latest version never expires. `RemoveAsync` writes a tombstone and keeps old versions about 30 days; `RemoveVersionAsync` is deprecated. `GetVersionAtTimeAsync` takes a Unix timestamp in milliseconds (not more than ten minutes in the future). `ListKeysAsync` default page 50, `ListVersionsAsync` default page 1024. [S4][S7][S8]
- Metadata warning: whenever you update with metadata or userIds you must pass the existing values again, otherwise the current value is lost. `DataStoreSetOptions:SetMetadata`, `DataStoreKeyInfo` has Version, CreatedTime, UpdatedTime, `GetUserIds()`, `GetMetadata()`. Metadata: 250 characters per value, 300 for all pairs. [S2][S1]
- Size and naming limits: data store name, key name and scope are each at most 50 characters; a value is at most 4,194,304 characters (4 MB, strings must be valid UTF-8); a key is limited to 25 MB/min read and 4 MB/min write throughput. Total latest-version storage = 500 MB + 1 MB x lifetime users (compressed size). [S1][S7]
- Experience request budgets per minute (current docs): Standard read 300 + 40 x users; write 300 + 20 x users; list 300 + 2 x users; remove 300 + 40 x users. Ordered stores use the same formulas. `UpdateAsync` consumes both read and write budget. Read covers `GetAsync`, `GetVersionAsync`, `GetVersionAtTimeAsync`; write covers `SetAsync`, `IncrementAsync`; list covers `ListDataStoresAsync`, `ListKeysAsync`, `ListVersionsAsync` (ordered: `GetSortedAsync`). [S1]
- Server-level defaults per minute: standard read/write/remove 60 + players x 40, list 5 + players x 2; ordered write/remove 30 + players x 5. Much community material still quotes the old "60 + 10 per player" numbers; treat those as stale. [S1]
- When a queue exceeds 30 pending requests, calls fail with 301-306 (Get, Set, Increment, Update, GetSorted, Remove throttle). Retry with backoff: 301-306, 502, 404/501/503/504/505. Do not retry 101-107, 403, 509. Read the live budget with `DataStoreService:GetRequestBudgetForRequestType(Enum.DataStoreRequestType.X)`. [S1][S6]
- `OrderedDataStore`: integer values only, `GetSortedAsync(ascending, pageSize, minValue, maxValue)` with page size 1-100 (default 50), no versioning or metadata (`DataStoreKeyInfo` is nil), no userIds. [S9][S1]
- Best practices from the docs: few data stores with one key per player (`User_{UserId}`), static key patterns (never display names), load once at session start, keep a server-local copy, save periodically (their sample uses 180 s), stagger recurring requests with random offsets and jitter, wrap in pcall and retry sequentially per key with exponential backoff, shard hot keys (hash `DataModel.JobId` to a shard), keep versions instead of new keys. DataStore2 is called legacy: do not use it for new work. [S3]
- `game:BindToClose` gets 30 seconds, bound functions run in parallel, and the server then shuts down regardless. Use `RunService:IsStudio()` to skip long waits in Studio. [S10]
- GDPR: put `{UserId}` (case-sensitive) in the key name or scope as a static pattern and register deletion templates in Data Stores Manager or the Open Cloud config API; deletion must be verifiable within 30 days. [S11]
- Observability: Creator Hub dashboard (storage, request count by API/status, quota usage, 30 days of history, last 3 minutes incomplete). [S5]

### Session locking and ProfileStore
- Roblox has no built-in session lock. A hand-rolled lock stores a `SessionJobId` in the record and cancels `UpdateAsync` (returns nil) when another server owns it; this is a pattern from a 2020 thread (stale, only as background). [S85]
- The official sample architecture writes a lock token atomically, refreshes it during autosaves, releases it on leave, lets another server reclaim an expired lock, and records `PurchaseId`s in the same data to make receipts idempotent. [S12]
- `ProfileStore` (loleris / Mad Studio, posted 2024-10-11) is the successor to ProfileService: single ModuleScript, autosave 300 s, session locks resolved through MessagingService, `ProfileStore.New(name, template)`, `store:StartSessionAsync(key, {Cancel=fn, Steal=bool})` returning a Profile or nil, `profile.Data`, `:Reconcile()`, `:AddUserId()`, `:EndSession()`, `:Save()`, `profile.OnSessionEnd`, `profile.OnAfterSave`, `store:GetAsync/RemoveAsync/MessageAsync/VersionQuery`, `ProfileStore.Mock` for a fake in-memory store, backward compatible with ProfileService data. `RobloxMetaData` is limited to 300 characters. Not for leaderboards or global state. [S81][S82][S83]
- ProfileStore handles `game:BindToClose` itself (source read 2026-10-04): on close it sets `ProfileStore.IsClosing = true`, saves every active profile in parallel with reason "Shutdown" (`Profile.OnLastSave` receives "Manual", "External" or "Shutdown"), and yields until all load and save jobs finish; in Studio without API access (mock mode) it only sets the flag and waits one frame so Studio can stop quickly. You do not write your own `BindToClose` save loop for profiles. Pending `StartSessionAsync` calls are cancelled once `IsClosing` is true. Other verified members: `Profile.OnSave`, `OnAfterSave`, `OnSessionEnd`, `OnLastSave`, `ProfileStore.IsCriticalState`, `ProfileStore.Mock`, `Profile:Reconcile/EndSession/AddUserId`, `ProfileStore:MessageAsync/VersionQuery`. Wally package: `lm-loleris/profilestore` 1.0.3 (realm server) in the wally-index; also a Creator Store asset. [S84][S107]
- Module constants (source): auto-save 300 s, session steal after 40 s of conflict, assume dead after 630 s without updates, session start timeout 120 s, critical state after 5 errors, message queue cap 1000. [S84]

### MemoryStore
- Three structures: SortedMap (leaderboards, auctions), Queue (matchmaking, FIFO with optional priority), HashMap (caching, shared inventories; recommended over 1,000 keys, otherwise sorted map). Data is ephemeral. [S13][S18]
- Quotas: memory = 64 KB + 1.2 KB x concurrent users (an eight-day traceback delays reductions; writes fail when full); request units per minute = 1,000 + 120 x concurrent users. Costs: most calls 1 unit; `GetRangeAsync` = items returned; `ReadAsync` = items + 1 per 2 s waited; `UpdateAsync` at least 2; `ListItemsAsync` = partitions scanned + items returned. [S13]
- Per partition: throttling around 30,000 units/min; per hash-map key about 5,000 write and 15,000 read units/min. Sorted maps and queues live on one partition; hash maps spread over many. [S13][S14]
- Structure limits: 1,000,000 items, 100 MB total, value 32 KB, key and sort key 128 characters, expiration 0-3,888,000 s (45 days; default 45 days). [S13][S15][S16][S18]
- Sorted map API: `SetAsync(key, value, expiration, sortKey?)`, `GetAsync`, `GetRangeAsync(direction, count (max 200), lowerBound?, upperBound?)`, `UpdateAsync(key, fn, expiration)` (retries on contention), `RemoveAsync`, `GetSizeAsync`. Numeric sort keys sort before strings. [S15]
- Queue API: `MemoryStoreService:GetQueue(name, invisibilityTimeout = 30)`, `AddAsync(value, expiration, priority = 0)`, `ReadAsync(count (max 100), allOrNothing = false, waitTimeout = -1)` returning values and an id, `RemoveAsync(id)`, `GetSizeAsync(excludeInvisible)`. Items read become invisible until removed or the timeout lapses. [S17][S19]
- Best practices: derive key and structure names with the same pattern on every server; expire data when it stops being useful; shard hot sorted maps by `userId % #maps + 1`; retry transient failures; use `UpdateAsync` for conflicts. [S14]

### MessagingService
- Cross-server pub/sub, best-effort, usually delivered in 1-2 s. Topic 1-80 characters; message 1 KB; outbound per server 600 + 240 x players per minute; inbound per topic 40 + 80 x servers per minute; inbound for the whole experience 400 + 200 x servers per minute; active subscriptions per server 20 + 8 x players; 240 subscribe requests per minute per server. Callback receives `{Data, Sent}` (Sent is a Unix timestamp in seconds). `SubscribeAsync` returns an `RBXScriptConnection`. [S20][S21]
- Do not use it as the source of truth for state; combine with MemoryStore or DataStores. Wrap in pcall. [S20]

### TeleportService
- `TeleportAsync(placeId, players, teleportOptions?)` is server-only and takes up to 50 players per call; the old client `Teleport` and `TeleportPartyAsync` are deprecated/avoid. Use `ReserveServerAsync` rather than the deprecated `ReserveServer`. [S22][S24]
- `TeleportOptions`: `ReservedServerAccessCode`, `ServerInstanceId` (a `DataModel.JobId`), `ShouldReserveServer` (these three are mutually exclusive), `SetTeleportData(data)` (allowed: bool, number, string, value types such as Vector3, CFrame, Color3, UDim2, NumberSequence, ColorSequence and Enum items, and tables or arrays without mixed keys holding only those, "nested up to a reasonable depth and size"; Instances, connections, signals, functions, SharedTable and engine-state types such as InputObject, RaycastParams and RaycastResult are removed and an error is written to the developer console). The docs give no byte limit for teleport data (see Open questions). Destination reads `player:GetJoinData().TeleportData` or client `GetLocalPlayerTeleportData()`. [S23][S24]
- A teleport can fail after the call returns; handle `TeleportService.TeleportInitFailed(player, teleportResult, errorMessage, placeId, teleportOptions)` and retry with backoff (docs sample: wait 15 s on a Flooded result, 1 s otherwise, at most 5 attempts). Teleports cannot be tested in Studio; publish and test in the client. [S24][S22]
- `player:GetJoinData()` returns SourcePlaceId, ReferredByPlayerId, TeleportData, LaunchData and GameJoinContext. [S91]

### MarketplaceService and receipts
- `MarketplaceService.ProcessReceipt` must be assigned exactly once, in one server Script, handling every developer product. Receipt table: `PurchaseId`, `PlayerId`, `ProductId`, `PlaceIdWherePurchased`, `CurrencySpent`, `CurrencyType` (Robux), `ProductPurchaseChannel`. Return `Enum.ProductPurchaseDecision.PurchaseGranted` only after the item is durably granted; `NotProcessedYet` makes Roblox call again on the next purchase or when the player rejoins. There is no time-based retry and no timeout for yielding callbacks. The same receipt can be processed concurrently by two servers if the player rejoins quickly, so the handler must be idempotent by `PurchaseId`. [S25]
- Prompting: `PromptProductPurchase(player, productId)` (client or server), `PromptGamePassPurchase` uses the game pass id (not the asset id); `UserOwnsGamePassAsync` is cached and refreshed by `PromptGamePassPurchaseFinished` or on join; `GetProductInfoAsync` and `UserOwnsGamePassAsync` are transparent-batching capable (spawn concurrent calls with `task.spawn`). Developer products are not queryable with `PlayerOwnsAsset`; track ownership yourself. [S25][S87]

### Attributes and CollectionService
- Attributes are custom properties: `SetAttribute(name, value)` (nil deletes), `GetAttribute`, `GetAttributes()`, `GetAttributeChangedSignal(name)`, `AttributeChanged`. Names: letters, digits, `.`, `-`, `/`, `_` only; 100 characters or less; the `RBX` prefix is reserved. Attributes replicate to clients and are saved with the place. Order of cross-object replication is not guaranteed; changes of the same kind generally arrive in order. Setting an unsupported type throws. The docs state no per-value size or per-instance count limit for attributes (a 2025 community thread found none either); the only numeric limits found are Server Authority / `NextGenerationReplication` ones (see New APIs). [S39][S40][S41][S105]
- Studio lists these attribute types: string, boolean, number, UDim, UDim2, BrickColor, Color3, Vector2, Vector3, CFrame, NumberSequence, ColorSequence, NumberRange, Rect, Font. [S41]
- CollectionService (tags): `AddTag`/`RemoveTag`/`HasTag` (also on Instance), `GetTagged` (excludes instances with nil parent, unordered), `GetInstanceAddedSignal(tag)`, `GetInstanceRemovedSignal(tag)` (fires on tag removal and when the tagged instance leaves the DataModel), `GetAllTags`. All tags of an instance replicate together and a later server tag change overwrites client-side tag edits; under StreamingEnabled client-side tag edits are lost on stream-out and back in. Clean up connections and tables on removal to avoid leaks. [S42][S39]
- Debounce with attributes or timestamps for `Touched`, pickups and damage. [S88]

### Luau language, types and runtime
- Modes: `--!nocheck`, `--!nonstrict` (default), `--!strict`. Syntax: `local x: number`, optional `string?`, unions `A | B`, intersections `A & B`, singleton types, table types `{number}`, `{[string]: number}`, `{Field: T}`, function types `(number) -> number`, variadics `...number`, generics `<T>`, `typeof(expr)`, aliases and `export type`, cast `::` (one side must be a subtype of the other or `any`). There is no `table` type; use `{}`. [S55][S56]
- New type solver status: Roblox's "[General Release] Luau's New Type Solver" (DevForum, Yuria_theWitch, 2025-11-20) moved it out of Studio Beta. It became the default for places in `--!nocheck` and `--!nonstrict` mode, together with a redesigned nonstrict mode that reports only definite runtime errors. Strict-mode places stayed on the old solver by default and had to opt in; the Studio Beta toggle was to be removed on 2026-01-07; the legacy solver was to remain through 2026 for gradual migration, and the opt-in property was promised to persist for at least a year. Two Workspace properties exist: `UseNewLuauTypeSolver` (`Enum.RolloutState`: Default, Disabled, Enabled; Default follows the engine-wide rollout) and `LuauTypeCheckMode` (`Enum.LuauTypeCheckMode`: Default, NoCheck, Nonstrict, Strict) for the default mode of all scripts. The announcement said strict mode still needed polish before becoming the default. Whether strict is now default on the new solver after January 2026 was not verified. New-solver features cited by the announcement and community material: type functions, read-only table properties, better refinements. Advice stands: write plain annotations that check under both solvers. [S100][S101]
- Library facts worth using: `table.create(n, v)`, `table.clone` (not frozen even if source was), `table.freeze`, `table.clear` (keeps capacity), `table.find`, `table.move`, `buffer.*`, native `vector`, `math.clamp/round/sign/noise`. Luau added `math.lerp`, `math.map`, `math.isnan/isinf/isfinite` and `buffer.readbits/writebits` in 2025. [S58][S59]
- Performance rules from luau.org: table literals with all fields at once (templates), `table.create` for known sizes, use `obj:Method()`, immutable upvalues, local over global, avoid `loadstring/getfenv/setfenv` (they de-optimise the whole script), avoid temporary tables in hot loops. [S57]
- Native code generation: `--!native` at the script top, or `@native` on a function. Helps numeric/vector/buffer-heavy hot functions; annotate `Vector3` parameters; costs startup time and memory; per-block 64K instructions, per-script 1M instructions; `debug.dumpcodesize()` shows usage. The Creator Hub page (read 2026-10-04) still describes it for server-side scripts only. Luau's 2025 recap (2025-12-19) says native codegen gained Android support and has been tested in production, and a September 2026 community post in the "Enable --!native for clients" thread says it was enabled for Android devices; no Roblox staff statement and no iOS or desktop-client statement was found. Treat client native codegen as Android-only and unconfirmed: write `@native` code that is correct and fast without it. [S54][S59][S102]
- Task library: `task.spawn` (immediate), `task.defer` (end of the current resumption cycle), `task.delay(duration, fn, ...)`, `task.wait(duration)` (resumes on Heartbeat, returns actual elapsed time, no throttling), `task.cancel(thread)`, `task.desynchronize()`/`task.synchronize()` (Actors only). Prefer these over `wait`, `spawn`, `delay`. [S45][S46]
- RunService: `Heartbeat` (both sides, after physics), `PreRender` (client only), `PreAnimation`, `PreSimulation` (before physics), `PostSimulation` (after physics); `RenderStepped` and `Stepped` are deprecated; `BindToRenderStep(name, priority, fn)` is client-only; `BindToSimulation(fn, frequency, priority)` needs `UseFixedSimulation`. Change `Motor6D.Transform` in PreSimulation so the Animator does not overwrite it. [S48][S49]

### Performance and memory
- Frame budget at 60 fps is 16.67 ms. Aim under about 1,000 draw calls and 1,000,000 triangles for low-end devices. Spread heavy work over frames with `task.wait()`; do not tie expensive code to per-frame events. [S53][S52]
- The engine never garbage-collects connected callbacks and the values they capture. Disconnect, destroy instances and scripts. A departed Player object and character are not auto-destroyed unless `Workspace.PlayerCharacterDestroyBehavior` is enabled; clean per-player tables in `PlayerRemoving`. [S52]
- Networking waste to avoid: replicating unchanged data each frame, firing on raw input without throttling, sending whole inventories, server-side TweenService (replicates every frame; tween on the client), creating/destroying big instance trees at runtime. Keep VFX on clients; send only positions. [S52]
- Humanoid cost: disable unused `HumanoidStateType`s with `SetStateEnabled`; use `AnimationController` for NPCs, play NPC animations on the client, pool NPC models, spawn them only near players. [S52]
- Parallel Luau: put scripts under `Actor`s (each Actor is its own VM with its own module state; messages are copied), run compute in parallel via `ConnectParallel`/`BindToMessageParallel` or `task.desynchronize()`, and switch back with `task.synchronize()` before touching Instances; `require` is not allowed while desynchronized. Thread-safety levels per member are Unsafe (default), Read Parallel, Local Safe, Safe. Use many actors (the docs cite 64+ for raycast validation on 4 cores). `SharedTable` shares data across Actors without copying. [S50][S51]
- Task scheduler order and MicroProfiler: use PreSimulation for logic that affects physics and PostSimulation for logic that reacts to it. [S49]
- Per-frame job order (read from the label positions in the docs' task-scheduler diagram; the page itself gives only a picture): replication receive, PreAnimation event, run scripts, Step Humanoid, PreSimulation event, run scripts, Step simulation (physics), PostSimulation event, run scripts, resume delayed threads (`task.wait`/`task.delay`), Heartbeat event, run scripts, replication send; then input processing, run scripts, PreRender event, run scripts, asynchronous render. "Run scripts" boxes appear after most steps, and Heartbeat script execution depends on `SignalBehavior`. The page says some jobs may not run in a given frame and others run several times, and that PreSimulation is the last Luau event before `Motor6D.Transform` is applied. [S49][S99]

### StreamingEnabled
- Defaults: `StreamingMinRadius` 64 studs, `StreamingTargetRadius` 1024 studs; these and `StreamingEnabled` are set in Studio, not by script. Recommended: `StreamingIntegrityMode = PauseOutsideLoadedArea`, `StreamOutBehavior = Opportunistic`, `ModelStreamingBehavior = Improved`, `PredictiveStreamingMode` enabled. [S60][S63]
- `Model.ModelStreamingMode`: Nonatomic (default), Atomic (children arrive together; `WaitForChild` the model), Persistent (always present, wait for the persistent-loaded signal), PersistentPerPlayer (`Model:AddPersistentPlayer`). `ReplicatedStorage` and `ReplicatedFirst` are never streamed. Client-created instances are exempt from stream-out. Local property edits are lost on stream-out. [S60]
- Replication focus: `Player.ReplicationFocus`, `Player:AddReplicationFocus/RemoveReplicationFocus` (each focus costs about as much server work as another player; the docs recommend at most about 9), `Player:RequestStreamAroundAsync(position)` to pre-stream. [S60][S91]
- Frustum Streaming (announced 2026-09-29; opt-in): server-side `Player.FrustumStreaming = Enum.FrustumStreamingMode.Automatic | Enabled | Disabled | Default`; streams what the camera sees beyond the radius, no occlusion culling, more memory and CPU. [S61][S79]
- SLIM: `Model.LevelOfDetail = SLIM` and `Workspace.EnableSLIMAvatars`; static models without Humanoids, R15 avatars only, needs streaming, publish and Team Create. Docs figures for avatars: about 170K triangles far versus about 2.6M without SLIM. [S62]

### New APIs 2024-2026
- Input Action System (InputContext > InputAction > InputBinding): `InputAction.Type` is `Enum.InputActionType` with exactly these members (verified in the enum reference): Bool (0), Direction1D (1), Direction2D (2), Direction3D (3), ViewportPosition (4); Bool exposes `UIButton` on bindings, Direction1D exposes Up/Down, Direction2D adds Left/Right, Direction3D adds Forward/Backward, ViewportPosition returns absolute pixel coordinates as a Vector2. Runtime creation: `InputContext`, `InputAction` and `InputBinding` have no `NotCreatable` tag in the class references, so `Instance.new` is valid; an `InputAction` registers with its first ancestor `InputContext` (a default context if none), `InputBinding`s apply to their parent action, and nested contexts have no effect. The docs only demonstrate the edit-time (Studio-built) workflow and say nothing more about runtime-creation rules, so build the hierarchy in Studio when you can. `Workspace.PlayerScriptsUseInputActionSystem` is an `Enum.RolloutState` (Default, Disabled, Enabled), not a boolean. Events `Pressed`/`Released` (Bool only) and `StateChanged`; `GetState()` for polling analog input; binding fields `KeyCode`, `UIButton`, `Up/Down/Left/Right` (and `Forward/Backward` for 3D), `Scale`, thresholds, `DisplayName`; contexts have `Enabled`, `Priority` and `Sink`; give each action keyboard/mouse, gamepad and touch bindings; enable `Workspace.PlayerScriptsUseInputActionSystem` so default player scripts use it; `InputActionLabel` shows the right key hint per device. [S70]
- New Audio API: `AudioPlayer` (properties `Asset`, `Looping`, `Volume` 0-10, `PlaybackSpeed` 0-20, `TimePosition`, `IsPlaying`, `AutoPlay`; methods `Play(atTime?)`, `Stop(atTime?)`, no Pause; events `Ended`, `Looped`), `AudioEmitter` (3D speaker), `AudioListener` (3D microphone), `AudioDeviceOutput`/`AudioDeviceInput`, effects (`AudioEqualizer`, `AudioCompressor`, `AudioReverb`), `AudioTextToSpeech`, `AudioSpeechToText`, connected by `Wire` (`SourceInstance`, `TargetInstance`, `SourceName` default "Output", `TargetName` such as "Input"). 2D: AudioPlayer to AudioDeviceOutput. 3D: AudioPlayer to AudioEmitter, AudioListener to AudioDeviceOutput. Listener auto-wiring: `SoundService.DefaultListenerLocation` (`Enum.ListenerLocation`: Default, None, Character, Camera; shown as "ListenerLocation" in Studio's Properties) decides whether the engine creates a listener for you. Character creates an Attachment on the local character's PrimaryPart (turned each frame to face the camera), an `AudioListener` in it, an `AudioDeviceOutput` under SoundService and a `Wire` listener to output. Camera does the same parented to `Workspace.CurrentCamera`. None creates nothing (use it to build your own). Default depends on `VoiceChatService.EnableDefaultVoice` and `UseAudioApi` and behaves like Camera with the default voice setup (the guide says it creates the camera listener "in experiences that enable voice chat"). An `AudioListener` only hears if its parent is an Attachment, Camera or PVInstance. [S71][S72][S73][S74][S98]
- Server Authority (full release 2026-07-09, DevForum by welblander, Server Authority Team): server owns all state; clients predict a few frames ahead and roll back/resimulate on misprediction. Setting `Workspace.AuthorityMode = Server` automatically enables `NextGenerationReplication`, `PlayerScriptsUseInputActionSystem`, `SignalBehavior = Deferred`, `UseFixedSimulation` and `StreamingEnabled`. Supports characters, vehicles, sports, tools/backpacks. Limits: 64 attributes per instance (names 50 characters, string values 50), 8 actively playing animation tracks per Animator, remote events are not time-synchronised with property updates (roughly 40-50 ms offset), custom emotes and strafing animations unsupported. Camera InputAction sync was discontinued: use `Player:GetCameraState()` (CFrame, FieldOfView, ViewportSize). The attribute caps come from `NextGenerationReplication`, which Server Authority requires: a DevForum bug thread (April 2026) has staff (NightlyShores, 2026-04-27) confirming string attributes cap at 50 characters with it enabled (JSON-in-attributes unsupported; "in the short term" disable the setting if you must replicate large strings), and a second thread reports an undocumented attribute payload limit of 1024 KB in one batch that crashed Studio, fixed by 2026-05-23 (staff Khanovich) and closed 2026-06-06. [S66][S68][S91][S69][S103][S104]
- Server Authority programming model: logic lives in a ModuleScript required by both sides and bound with `RunService:BindToSimulation`; write state through attributes inside simulation callbacks; use synchronized `time()` rather than `tick()`/`os.time()`/`os.clock()`; do not cache AnimationTrack objects (use `Animator:GetTrackByAnimationId` and `GetPlayingAnimationTracks`); render effects from state changes in a separate render step; smooth visual error with `TweenService:SmoothDamp`; `Ctrl+Shift+F6` opens the visualizer; server heartbeat should stay at or above 59 fps. [S67][S92]
- `Instance.fromExisting(existingInstance)` is a general API, not Server Authority only: the Instance datatype reference documents it as a constructor that copies the type and property values of an existing instance without any descendants and even when `Archivable` is false; `Instance:Clone()` is the normal choice and this is meant for low-level libraries. Under Server Authority, `Instance.new`, `Clone` and `fromExisting` called inside a `BindToSimulation` callback of a ModuleScript required on both client and server get deterministic matching GUIDs ("instance stitching"); `Clone` and `fromExisting` stitch only if the source was replicated to both sides. [S96][S67]
- RDC 2026 (San Jose, 2026-09-10 to 09-12) roadmap items relevant to code, from the DevForum recap (timeframes are Roblox's, not shipped yet): test teleports inside Studio and place branch/merge (early 2027), in-game creation persistence (early 2027), orthographic camera, new primitive shapes (cone, capsule, disc, rounded variants), improved auto-generated collision geometry, animated image containers and sprite-sheet import, UI blur/text shadow/gradients, observability tooling with client session tracing (all "late 2026"), animation graph and terrain/material work (mid 2027). The recap lists no new scripting API signatures, so do not code against them yet. [S106]
- EditableMesh / EditableImage: `AssetService:CreateEditableMesh()`/`CreateEditableMeshAsync(content, {FixedSize=false})`, `CreateEditableImage()`/`CreateEditableImageAsync`. EditableMesh limits: 60,000 vertices, 20,000 triangles (quads count as two); EditableImage max 1024 x 1024. Server, Studio and plugins have unlimited memory; clients have strict budgets (a dev hit an 8-mesh client limit in April 2026). Requires 13+ and ID-verified owner with "Enable Mesh/Image APIs" on, and ownership/share of source assets. EditableMesh does not replicate (shows a checkerboard); `AssetService:CreateDataModelContentAsync` (Studio beta) converts them to replicable, higher-budget content. Quad support (`AddFace` with 3 or 4 vertices) is Studio Beta only as of 2026-09-23. [S75][S76][S77][S78]
- API Rate Limit Tuning (DevForum, 2026-09-30, effective after 2026-10-19) lowers limits for web endpoints of badges, datastores (web), game-persistence, inventory, thumbnails and users APIs per auth cookie or IP; Open Cloud limits are stated as not impacted; in-engine DataStore/MemoryStore budgets are not mentioned. [S80]
- Script Sync (Studio) mirrors scripts to disk: up to 10,000 scripts and 128 top-level instances per synced instance; `.server.luau`, `.client.luau` extensions. [S94]
- HttpService: 500 requests per minute per game server (Open Cloud calls 2,500/min), HTTPS only, enable in Experience Settings > Security, backoff 2 s, 4 s, 8 s. [S86]

## How to apply it (rules for an AI builder)

Architecture
- DO create exactly two entry scripts: `ServerScriptService/Main` (Script, RunContext Server) and `ReplicatedStorage/ClientMain` or `StarterPlayerScripts/ClientMain`; both `require` ModuleScripts. DO NOT scatter 50 independent Scripts in Workspace; use CollectionService tags plus one Script per behavior. [S44]
- DO keep item prices, loot tables, drop rates, rewards and cooldowns in `ServerStorage` or `ServerScriptService` modules. Put only display data (names, icons) in `ReplicatedStorage`. DON'T put secrets, admin lists or reward math in anything replicated. [S33][S30]
- DO create every RemoteEvent on the server at boot into a `ReplicatedStorage/Remotes` folder, and reference them on the client with `WaitForChild`. One handler per remote; validate in the handler. [S27]
- DO set `Workspace.SignalBehavior = Deferred` for new places (it is the template default) and write code that does not assume handlers run synchronously. [S47]
- DO type-annotate module APIs and use `--!strict` on shared modules. DO `export type` data shapes. [S55]

Remotes
- DO treat every remote argument as hostile: check `type()`/`typeof()`, finite numbers (`x == x and x ~= math.huge and x ~= -math.huge`, or `math.isfinite`), clamp ranges, integer quantities greater than 0, `utf8.len(str)` and a length cap on strings, and that Instances are real, `IsDescendantOf` an allowed folder and in range. [S31]
- DO rate-limit per player per remote with a token bucket on the server (for example 10 per second burst 20 for action remotes; 2 per second for purchases/trades). [S31]
- DO NOT let a remote pick a price, damage amount, reward amount, target player's data key or any server table index. Send an item id; look up everything on the server. [S30]
- DO NOT use `RemoteFunction` server-to-client. DO NOT fire remotes every frame; send on change, at most about 20 per second for recurring streams, and use `UnreliableRemoteEvent` for disposable data under 1000 bytes. [S29][S38][S28]
- DO relay client effects (emotes, impacts) via the server after validation and rate-limits. [S31]

Persistence
- DO use ProfileStore (or the same pattern) for player data: one key per player `Player_{UserId}`, session lock, `Reconcile`, `AddUserId`, kick on load failure. DON'T use DataStore2. DON'T call `SetAsync` for read-modify-write; use `UpdateAsync`. [S3][S81][S82]
- DO keep an in-memory copy, mutate it freely and let autosave write (300 s in ProfileStore). DON'T write on every coin pickup. DON'T create one data store per player. [S3][S12]
- DO wrap every DataStore/MemoryStore/Messaging call in `pcall` with bounded exponential backoff and jitter; DON'T retry 101-107, 403, 509. [S1][S3]
- DO NOT trust the 60 + 10/player budget numbers seen online; read `GetRequestBudgetForRequestType` at runtime when batching. [S1][S6]
- DO NOT put currency, inventory counts or permissions in teleport data, attributes the client can edit, or ReplicatedStorage values. [S22][S33]
- DO use MemoryStore for short-lived cross-server state (queues, live leaderboards, trade offers) with explicit expirations, and DataStores for anything that must survive. DO NOT store permanent player data in MemoryStore. [S13][S14]
- DO put `{UserId}` in key names for GDPR deletion. [S11]

Purchases
- DO implement a single `ProcessReceipt`, idempotent by `PurchaseId` stored in the player's persisted data, and return `PurchaseGranted` only after the grant is saved. DON'T grant on `PromptProductPurchaseFinished`. DON'T yield forever; DON'T assign `ProcessReceipt` twice. [S25][S12]

Performance
- DO use the task library, `Heartbeat`/`PreSimulation` for per-frame logic, and avoid `while true do task.wait()` polling when an event exists. DON'T use `wait()`, `spawn()`, `delay()`. [S45]
- DO store every `Connect` result you need to cancel; clean up in `PlayerRemoving`, `Destroying` or tag removal. DO `table.clear`/nil per-player tables on leave. [S52][S89]
- DO use `table.create`, avoid temporary tables in hot loops, and cache `workspace:Raycast` params (`RaycastParams.new()` once). [S57]
- DO move heavy pure-compute (pathfinding grids, procedural gen, many raycasts) to Actors and `--!native` for numeric hot loops; DON'T touch Instances while desynchronized. [S50][S54]
- DO enable StreamingEnabled (and `StreamOutBehavior = Opportunistic`, `ModelStreamingBehavior = Improved`) for large maps; DON'T assume far parts exist on the client; use `WaitForChild(name, timeout)` and server-side logic. [S60]
- DO tween UI and effects on the client; DON'T tween server-side. DO anchor static parts and set `CanCollide/CanTouch/CanQuery` false on decoration. [S52][S37]
- DO give every physics object that matters to fairness (balls, vehicles, pickups) server network ownership (`SetNetworkOwner(nil)`) or anchor it. [S36][S37]

New-API usage
- DO prefer the Input Action System (single set of actions with keyboard, gamepad and touch bindings) over scattered `UserInputService` checks for new games; required for Server Authority. [S70][S66]
- DO prefer `AudioPlayer`/`Wire`/`AudioEmitter` for new audio that needs routing or effects; keep `Sound` for trivial one-shots. [S71]
- DO adopt Server Authority only for competitive/physics-sensitive games (FPS, racing, sports) and plan its constraints (64 attributes, 8 animation tracks, deferred signals). [S66][S68]
- DON'T build on EditableMesh/EditableImage for client-side gameplay without checking memory budgets and the ID-verification requirement. [S75][S77]

## Recipes (each becomes a skill)

### Recipe 1: Hardened RemoteEvent handler (validation + rate limit)
When to use: any client-triggered action (buy, equip, attack, use item, place item).
Steps:
1. Server `Main` script creates `ReplicatedStorage/Remotes` (Folder) and a RemoteEvent per action.
2. Put item definitions in `ServerStorage/Config/Items` (ModuleScript). Client sends only an item id string.
3. In the handler: rate-limit, type-check, clamp, look up server table, check context (alive, proximity, funds), mutate server data, then notify the client with `FireClient`.
4. Log failed validations to a per-player suspicion score (Recipe 12).
Pitfalls: forgetting NaN; validating on the client only; trusting a client-sent price; leaving remote with no player-removed cleanup of the bucket table.
```luau
--!strict
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local Items = require(ServerStorage.Config.Items) :: {[string]: {Price: number, MaxStack: number}}

local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
remotes.Parent = ReplicatedStorage
local buyItem = Instance.new("RemoteEvent")
buyItem.Name = "BuyItem"
buyItem.Parent = remotes

type Bucket = { tokens: number, last: number }
local buckets: { [Player]: Bucket } = {}

local function allow(player: Player, ratePerSec: number, burst: number): boolean
	local now = os.clock()
	local b = buckets[player]
	if not b then
		b = { tokens = burst, last = now }
		buckets[player] = b
	end
	b.tokens = math.min(burst, b.tokens + (now - b.last) * ratePerSec)
	b.last = now
	if b.tokens < 1 then
		return false
	end
	b.tokens -= 1
	return true
end

local function isFiniteNumber(x: any): boolean
	return type(x) == "number" and x == x and x ~= math.huge and x ~= -math.huge
end

buyItem.OnServerEvent:Connect(function(player: Player, itemId: any, quantity: any)
	if not allow(player, 2, 4) then return end
	if type(itemId) ~= "string" or #itemId > 40 then return end
	if not isFiniteNumber(quantity) or quantity % 1 ~= 0 or quantity < 1 or quantity > 99 then return end
	local def = Items[itemId]
	if not def then return end
	-- context checks (alive, near shop) and funds check go here, against server data
	-- mutate server-side data, then tell the client
	buyItem:FireClient(player, itemId, quantity)
end)

Players.PlayerRemoving:Connect(function(player: Player)
	buckets[player] = nil
end)
```

### Recipe 2: Player data with ProfileStore (session locked)
When to use: any game that saves player progress.
Steps:
1. Insert the ProfileStore ModuleScript (Mad Studio / loleris) under `ServerScriptService/Libs`.
2. Define a template table; call `ProfileStore.New("PlayerData", TEMPLATE)` once.
3. On `PlayerAdded` call `StartSessionAsync` with a `Cancel` function that returns true when the player left; kick on nil.
4. `AddUserId`, `Reconcile`, store the profile in a table keyed by Player, end the session on leave and on `OnSessionEnd`.
5. Expose a `PlayerData.get(player)` function; never expose `Profile.Data` to clients (replicate a copy via remotes or attributes).
Pitfalls: writing your own `BindToClose` save loop for profiles (ProfileStore already releases and saves every active profile on close); starting a session for players already in the server at script start (loop `Players:GetPlayers()`); forgetting to end a session when the player left mid-load; saving leaderboards in profiles (use OrderedDataStore); using `ProfileStore.Mock` data in production; changing key format later.
```luau
--!strict
local Players = game:GetService("Players")
local ServerScriptService = game:GetService("ServerScriptService")
local ProfileStore = require(ServerScriptService.Libs.ProfileStore)

local TEMPLATE = { Cash = 0, Items = {} :: { string }, ProcessedPurchases = {} :: { number } }
local PlayerStore = ProfileStore.New("PlayerData", TEMPLATE)
local profiles: { [Player]: any } = {}

local function onPlayerAdded(player: Player)
	local profile = PlayerStore:StartSessionAsync(`Player_{player.UserId}`, {
		Cancel = function()
			return player.Parent ~= Players
		end,
	})
	if profile == nil then
		player:Kick("Profile load failed. Please rejoin.")
		return
	end
	profile:AddUserId(player.UserId) -- GDPR association
	profile:Reconcile() -- fill new template fields
	profile.OnSessionEnd:Connect(function()
		profiles[player] = nil
		player:Kick("Data session ended. Please rejoin.")
	end)
	if player.Parent == Players then
		profiles[player] = profile
	else
		profile:EndSession()
	end
end

for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end
Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(function(player: Player)
	local profile = profiles[player]
	if profile then
		profile:EndSession()
	end
end)
```

### Recipe 3: Raw DataStore with retries and UpdateAsync (no library)
When to use: small data (settings, global counters), or when you cannot use ProfileStore.
Steps: wrap calls in a retry helper with exponential backoff and jitter; read with `GetAsync`, change with `UpdateAsync` (callback does not yield, returns nil to cancel); on `BindToClose` save every cached player in parallel within 30 s.
Pitfalls: yielding inside `UpdateAsync`; writing the same key more than once per few seconds from one server; retrying validation errors (101-107).
```luau
--!strict
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("Settings_v1")

local function retry<T>(maxAttempts: number, fn: () -> T): (boolean, T | string)
	local delaySeconds = 1
	local lastError = "unknown"
	for attempt = 1, maxAttempts do
		local ok, result = pcall(fn)
		if ok then
			return true, result
		end
		lastError = tostring(result)
		if attempt < maxAttempts then
			task.wait(delaySeconds + math.random())
			delaySeconds = math.min(delaySeconds * 2, 30)
		end
	end
	return false, lastError
end

local function addCoins(userId: number, amount: number): (boolean, any)
	return retry(5, function()
		return store:UpdateAsync(`User_{userId}`, function(old: { coins: number }?)
			local data = old or { coins = 0 }
			data.coins += amount
			return data -- returning nil would cancel the write
		end)
	end)
end
```

### Recipe 4: Idempotent ProcessReceipt
When to use: any developer product (currency packs, revives, boosts).
Steps: 1. Assign `ProcessReceipt` once in one server script. 2. Find the player by `receiptInfo.PlayerId`; if absent return `NotProcessedYet`. 3. Wait for profile data. 4. If `PurchaseId` is already in `ProcessedPurchases` return `PurchaseGranted`. 5. Grant, record the id (keep the last ~50), force a save, then return `PurchaseGranted`; on any error return `NotProcessedYet`.
Pitfalls: granting before recording; two assignments of the callback; trusting `PromptProductPurchaseFinished`; yielding on the client.
```luau
--!strict
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")

local PlayerData = require(script.Parent.PlayerData) -- get(player): profile with .Data, save(player): boolean

local grants: { [number]: (player: Player, data: any) -> () } = {
	[1234567] = function(_player, data) data.Cash += 1000 end, -- replace with real product ids
}

MarketplaceService.ProcessReceipt = function(receipt: { [string]: any }): Enum.ProductPurchaseDecision
	local player = Players:GetPlayerByUserId(receipt.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local profile = PlayerData.get(player)
	if not profile then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local data = profile.Data
	if table.find(data.ProcessedPurchases, receipt.PurchaseId) then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	local grant = grants[receipt.ProductId]
	if not grant then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local ok = pcall(grant, player, data)
	if not ok then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	table.insert(data.ProcessedPurchases, receipt.PurchaseId)
	if #data.ProcessedPurchases > 50 then
		table.remove(data.ProcessedPurchases, 1)
	end
	if not PlayerData.save(player) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end
```

### Recipe 5: Global leaderboard (OrderedDataStore + cache)
When to use: top-N lists across servers.
Steps: 1. `GetOrderedDataStore("Kills_v1")`; write `math.floor(score)` for a player at most every 60 s and on leave. 2. Refresh the top list every 60-120 s per server (one `GetSortedAsync(false, 10)` call). 3. Cache the page result and replicate it to clients via a remote or Attributes. 4. For live, fast-changing boards use a MemoryStore SortedMap and flush to the OrderedDataStore periodically.
Pitfalls: values must be integers; no versioning/metadata; per-player calls on each refresh blow the budget (list budget is 300 + 2 x users per minute).
```luau
--!strict
local DataStoreService = game:GetService("DataStoreService")
local board = DataStoreService:GetOrderedDataStore("Kills_v1")

local function submit(userId: number, score: number)
	pcall(function()
		board:SetAsync(`User_{userId}`, math.floor(score))
	end)
end

local function topTen(): { { key: string, value: number } }
	local ok, pages = pcall(function()
		return board:GetSortedAsync(false, 10)
	end)
	if not ok then
		return {}
	end
	return pages:GetCurrentPage()
end
```

### Recipe 6: Cross-server announcement (MessagingService)
When to use: global events, "boss spawned in another server", server browser pings.
Steps: subscribe once at server start inside pcall and store the connection; publish with pcall; keep messages under 1 KB; treat delivery as best effort; rate stays under 600 + 240 x players per minute per server.
Pitfalls: relying on it for authoritative state; subscribing per player; not disconnecting on cleanup.
```luau
--!strict
local MessagingService = game:GetService("MessagingService")
local TOPIC = "GlobalAnnounce"

local okSub, conn = pcall(function()
	return MessagingService:SubscribeAsync(TOPIC, function(message)
		local payload = message.Data
		if type(payload) == "table" and type(payload.text) == "string" then
			print(("announce %d: %s"):format(message.Sent, payload.text))
		end
	end)
end)

local function announce(text: string)
	pcall(function()
		MessagingService:PublishAsync(TOPIC, { text = text:sub(1, 200) })
	end)
end
```

### Recipe 7: Queue-based matchmaking into a reserved server
When to use: lobby place that teleports groups into a match place.
Steps: 1. Lobby server `AddAsync(userId, 300)` to a MemoryStore queue (expiration in seconds). 2. A loop on each lobby server `ReadAsync(count, true, 5)` for a full match, then `RemoveAsync(id)` after the teleport call succeeds. 3. Teleport the group with `TeleportOptions.ShouldReserveServer = true` and `SetTeleportData` (non-secret). 4. Handle `TeleportInitFailed`. 5. Items not removed reappear after the 30 s invisibility timeout.
Pitfalls: Studio cannot test teleports; at most 50 players per `TeleportAsync`; do not put secrets in teleport data; queue lives on one partition (30k units/min).
```luau
--!strict
local MemoryStoreService = game:GetService("MemoryStoreService")
local Players = game:GetService("Players")
local TeleportService = game:GetService("TeleportService")

local MATCH_PLACE_ID = 0 -- set to your match place id
local PLAYERS_PER_MATCH = 4
local queue = MemoryStoreService:GetQueue("MatchQueue_v1", 30)

local function enqueue(player: Player)
	pcall(function()
		queue:AddAsync(player.UserId, 300)
	end)
end

task.spawn(function()
	while true do
		local ok, items, readId = pcall(function()
			return queue:ReadAsync(PLAYERS_PER_MATCH, true, 5)
		end)
		if ok and items and #items == PLAYERS_PER_MATCH then
			local group: { Player } = {}
			for _, userId in items do
				local p = Players:GetPlayerByUserId(userId)
				if p then table.insert(group, p) end
			end
			if #group == PLAYERS_PER_MATCH then
				local options = Instance.new("TeleportOptions")
				options.ShouldReserveServer = true
				options:SetTeleportData({ mode = "standard" })
				local sent = pcall(function()
					TeleportService:TeleportAsync(MATCH_PLACE_ID, group, options)
				end)
				if sent then
					pcall(function() queue:RemoveAsync(readId) end)
				end
			end
		end
		task.wait(1)
	end
end)
```

### Recipe 8: Tag-driven behavior with guaranteed cleanup (CollectionService)
When to use: any repeated world object (doors, pickups, enemies, jump pads).
Steps: tag objects in Studio (Tag Editor) or `AddTag`; one script `bindTag("JumpPad", setup)`; `setup` returns a cleanup function; run existing instances via `GetTagged` and new via the added signal; cleanup via removed signal (also fires when the instance leaves the DataModel).
Pitfalls: client-side tag edits are overwritten by server tag changes and lost on stream-out; do not `GetTagged` only (misses later instances).
```luau
--!strict
local CollectionService = game:GetService("CollectionService")

local function bindTag(tag: string, setup: (Instance) -> (() -> ())?)
	local cleanups: { [Instance]: () -> () } = {}
	local function onAdded(inst: Instance)
		if cleanups[inst] then return end
		cleanups[inst] = setup(inst) or function() end
	end
	local function onRemoved(inst: Instance)
		local cleanup = cleanups[inst]
		if cleanup then
			cleanups[inst] = nil
			cleanup()
		end
	end
	CollectionService:GetInstanceAddedSignal(tag):Connect(onAdded)
	CollectionService:GetInstanceRemovedSignal(tag):Connect(onRemoved)
	for _, inst in CollectionService:GetTagged(tag) do
		task.spawn(onAdded, inst)
	end
end

bindTag("JumpPad", function(inst)
	local pad = inst :: BasePart
	local conn = pad.Touched:Connect(function(hit)
		local hum = hit.Parent and hit.Parent:FindFirstChildWhichIsA("Humanoid")
		if hum then
			hum.Jump = true
			local root = hum.RootPart
			if root then root.AssemblyLinearVelocity = Vector3.new(0, 80, 0) end
		end
	end)
	return function() conn:Disconnect() end
end)
```

### Recipe 9: Project structure and a minimal service loader
When to use: starting every game; keeps code testable and exploit-safe.
Steps: 1. `ServerScriptService/Server` (Script, RunContext Server) requires every module in `ServerScriptService/Services`, calling `Init()` then `Start()`. 2. `ReplicatedStorage/Shared` for types, constants and pure functions. 3. `ReplicatedStorage/Client/ClientMain` Script with RunContext Client requires controllers. 4. `ServerStorage/Config` for secret numbers.
Pitfalls: cyclic requires; yielding at module top level (blocks every requirer); relying on module state shared across client and server (each side has its own copy).
```luau
--!strict
-- ServerScriptService/Server (Script)
local ServerScriptService = game:GetService("ServerScriptService")
local services = ServerScriptService:WaitForChild("Services")

type Service = { Init: (() -> ())?, Start: (() -> ())? }
local loaded: { Service } = {}
for _, mod in services:GetChildren() do
	if mod:IsA("ModuleScript") then
		local ok, svc = pcall(require, mod)
		if ok then table.insert(loaded, svc :: Service) else warn(`Failed to load {mod.Name}: {svc}`) end
	end
end
for _, svc in loaded do if svc.Init then svc.Init() end end
for _, svc in loaded do if svc.Start then task.spawn(svc.Start) end end
```

### Recipe 10: Parallel Luau for many raycasts
When to use: server-side hit validation, AI vision, procedural queries that do not mutate Instances.
Steps: 1. Create several `Actor`s (for example 16-64) in ServerScriptService each containing a Script. 2. Dispatcher calls `actor:SendMessage("Cast", origin, direction)`. 3. In the Actor script use `BindToMessageParallel`; raycast in parallel; call `task.synchronize()` before any Instance change.
Pitfalls: `require` is not allowed while desynchronized; modules are separate copies per Actor; messages copy arguments; do not put one Actor per frame-sized task (overhead); keep each parallel chunk short.
```luau
--!strict
-- Script inside an Actor (RunContext Server)
local actor = script:GetActor() :: Actor
local params = RaycastParams.new()
params.FilterType = Enum.RaycastFilterType.Exclude

actor:BindToMessageParallel("Cast", function(origin: Vector3, direction: Vector3)
	local result = workspace:Raycast(origin, direction, params)
	if result and result.Instance then
		task.synchronize() -- back to serial before touching state
		result.Instance:SetAttribute("LastHitTime", os.clock())
	end
end)
```
Dispatcher: `actors[i % #actors + 1]:SendMessage("Cast", origin, direction)`.

### Recipe 11: Streaming-safe client code
When to use: any LocalScript in a StreamingEnabled place.
Steps: 1. Mark small must-have models (spawn hub, shop) `ModelStreamingMode = Atomic`, or Persistent only for very small sets. 2. `WaitForChild(name, timeout)` and handle nil. 3. Keep gameplay logic on the server; do not iterate `workspace:GetDescendants()` on the client expecting everything. 4. Use `RequestStreamAroundAsync` before teleporting the camera/character far away.
Pitfalls: client-only property changes and tags are lost when an instance streams out; assuming far parts exist; parts of Atomic models are not individually waited.
```luau
--!strict
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function getShop(): Model?
	local shop = workspace:WaitForChild("ShopHub", 10)
	if shop and shop:IsA("Model") then
		return shop -- Atomic model: all initial children arrive with the model
	end
	return nil
end

local function prefetch(position: Vector3)
	pcall(function()
		player:RequestStreamAroundAsync(position)
	end)
end
```

### Recipe 12: Suspicion score for server-side detection
When to use: economy and movement abuse mitigation beyond validation.
Steps: each failed validation or impossible rate adds weighted points; points decay; thresholds trigger the consequence ladder: log, drop/clamp, restrict, kick; add honeypot remotes that real clients never fire.
Pitfalls: kicking on a single heuristic (false positives); immediate visible consequences that teach exploiters your thresholds.
```luau
--!strict
local Players = game:GetService("Players")
local scores: { [Player]: number } = {}

local function flag(player: Player, points: number, reason: string)
	local s = (scores[player] or 0) + points
	scores[player] = s
	warn(`[flag] {player.UserId} +{points} ({reason}) = {s}`)
	if s >= 100 then
		player:Kick("Unexpected behavior detected.")
	end
end

task.spawn(function()
	while true do
		task.wait(30)
		for p, s in scores do
			scores[p] = math.max(0, s - 5)
		end
	end
end)

Players.PlayerRemoving:Connect(function(p: Player) scores[p] = nil end)
```

### Recipe 13: New Audio API (2D music and 3D positional sound)
When to use: music, ambience, spatial SFX that need routing/effects.
Steps: 2D: create `AudioPlayer` (Asset, Looping), `AudioDeviceOutput` under `SoundService`, a `Wire` from player to output, call `Play()`. 3D: `AudioPlayer` and `AudioEmitter` under the part, Wire player to emitter. For the listener, set `SoundService.DefaultListenerLocation` to Camera or Character and the engine creates the `AudioListener`, the `AudioDeviceOutput` and their `Wire` for you; only set it to None if you build those three yourself (an `AudioListener` parented to the camera, an Attachment or a PVInstance, wired to an `AudioDeviceOutput`).
Pitfalls: no `Pause()` (use `Stop()` and `TimePosition`); a Wire with a missing endpoint stays disconnected (`Wire.Connected`); cyclic graphs do not connect.
```luau
--!strict
local SoundService = game:GetService("SoundService")

local output = Instance.new("AudioDeviceOutput")
output.Parent = SoundService

local music = Instance.new("AudioPlayer")
music.Asset = "rbxassetid://0" -- replace with a real audio asset id
music.Looping = true
music.Volume = 0.6
music.Parent = SoundService

local wire = Instance.new("Wire")
wire.SourceInstance = music
wire.TargetInstance = output
wire.Parent = music

music:Play()
```

### Recipe 14: Input Action System setup (cross-platform controls)
When to use: new games, anything gamepad/touch capable, required for Server Authority.
Steps (Studio): 1. Create `ReplicatedStorage/Inputs`. 2. Add an `InputContext` "Gameplay" (Priority 2000, Sink on). 3. Add `InputAction` children by purpose (Sprint = Bool, Move = Direction2D). 4. Add `InputBinding` children: `KeyCode` per device (LeftShift, ButtonL3, a `UIButton` for touch). 5. Set `Workspace.PlayerScriptsUseInputActionSystem` to `Enum.RolloutState.Enabled` in the Properties window (it is a RolloutState, not a boolean). 6. Script reads actions. (Runtime `Instance.new("InputAction")` works as the classes are creatable, with `Type` set to an `Enum.InputActionType` member, but the docs only show the Studio-built workflow.)
Pitfalls: Pressed/Released fire for Bool actions only; analog actions need `GetState()` polling; nested contexts have no effect; give every action all three device bindings.
```luau
--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local gameplay = ReplicatedStorage:WaitForChild("Inputs"):WaitForChild("Gameplay")
local sprint = gameplay:WaitForChild("Sprint") :: InputAction

sprint.Pressed:Connect(function()
	local character = Players.LocalPlayer.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then humanoid.WalkSpeed = 24 end
end)
sprint.Released:Connect(function()
	local character = Players.LocalPlayer.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then humanoid.WalkSpeed = 16 end
end)
```
(The WalkSpeed here is client-side feel only; make the server authoritative for speed-sensitive games.)

### Recipe 15: Server Authority skeleton
When to use: competitive FPS, racing, sports games where movement must be cheat-proof.
Steps: 1. Set `Workspace.AuthorityMode = Server` (auto-enables the five dependency properties). 2. Create `ReplicatedStorage/Simulation` (ModuleScript) with child `ServerLoader` (Script) and `ClientLoader` (LocalScript), both calling `Simulation.Initialize()`. 3. Put logic inside `RunService:BindToSimulation`. 4. Store simulated state in attributes (max 64 per instance, names 50 chars). 5. Read inputs from Input Action System. 6. Render FX from state changes in a separate render step. 7. Use `Ctrl+Shift+F6` to monitor misprediction.
Pitfalls: `tick()`/`os.clock()`/`os.time()` in simulation code (use `time()`); caching AnimationTracks; instances created in the simulation callback must be parented before the frame ends; remote events are not frame-synchronised.
```luau
--!strict
-- ReplicatedStorage/Simulation (ModuleScript)
local RunService = game:GetService("RunService")
local Simulation = {}

function Simulation.Initialize()
	RunService:BindToSimulation(function(deltaTime: number)
		-- deterministic logic only; write state via attributes
		local t = (workspace:GetAttribute("MatchTime") or 0) :: number
		workspace:SetAttribute("MatchTime", t + deltaTime)
	end)
end

return Simulation
```

### Recipe 16: Hot-path performance pass
When to use: before launch or when MicroProfiler shows script time over about 4 ms.
Steps: 1. Open MicroProfiler (Ctrl+F6) and Script Profiler; find the top scripts. 2. Replace polling loops with events; throttle per-frame work to every N frames. 3. `table.create`/`table.clear`, hoist `RaycastParams`, avoid temp tables in loops. 4. Mark pure-math functions `@native` and annotate `Vector3`. 5. Disconnect leaks (check memory growth with Developer Console > Memory). 6. Set `CanTouch/CanQuery/CanCollide` false on decor; anchor statics; use Box/Hull collision.
Pitfalls: `--!native` on everything (compile/memory cost, global native-code cap); `getfenv/setfenv/loadstring` disable optimisations.
```luau
--!strict
@native
local function sumDistances(points: { Vector3 }, origin: Vector3): number
	local total = 0
	for _, p in points do
		total += (p - origin).Magnitude
	end
	return total
end
```

## Luau reference snippets

```luau
--!strict
-- Typed class pattern with explicit cleanup (use for services/controllers)
local Players = game:GetService("Players")

export type Controller = {
	_connections: { RBXScriptConnection },
	new: () -> Controller,
	Destroy: (self: Controller) -> (),
}

local Controller = {}
Controller.__index = Controller

function Controller.new()
	local self = setmetatable({ _connections = {} }, Controller)
	table.insert(self._connections, Players.PlayerAdded:Connect(function(p: Player)
		print(`{p.Name} joined`)
	end))
	return self
end

function Controller.Destroy(self: Controller)
	for _, c in self._connections do
		c:Disconnect()
	end
	table.clear(self._connections)
end
```

```luau
--!strict
-- Attribute-driven config with change signal
local part = script.Parent :: BasePart
part:SetAttribute("Damage", 10) -- number attribute; nil removes it
local conn = part:GetAttributeChangedSignal("Damage"):Connect(function()
	print("Damage is now", part:GetAttribute("Damage"))
end)
-- later: conn:Disconnect()
```

```luau
--!strict
-- Task library: cancellable delay, deferred work, yield-safe loop
local handle = task.delay(5, function() print("fires after 5 s on Heartbeat") end)
task.cancel(handle)
task.defer(function() print("end of this resumption cycle") end)
local elapsed = task.wait() -- next Heartbeat, returns seconds
```

```luau
--!strict
-- BindToClose: parallel saves within 30 s
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
game:BindToClose(function()
	if RunService:IsStudio() then return end
	local pending = 0
	for _, player in Players:GetPlayers() do
		pending += 1
		task.spawn(function()
			-- save(player) here, pcall-wrapped
			pending -= 1
		end)
	end
	local deadline = os.clock() + 25
	while pending > 0 and os.clock() < deadline do
		task.wait(0.1)
	end
end)
```

```luau
--!strict
-- Weak-keyed per-instance cache that does not leak
local cache = setmetatable({}, { __mode = "k" }) :: { [Instance]: number }
```

```luau
--!strict
-- Frustum streaming for scoped weapons (server side)
local Players = game:GetService("Players")
Players.PlayerAdded:Connect(function(player: Player)
	player.FrustumStreaming = Enum.FrustumStreamingMode.Automatic
end)
```

```luau
--!strict
-- Check remaining DataStore budget before a bulk operation
local DataStoreService = game:GetService("DataStoreService")
local reads = DataStoreService:GetRequestBudgetForRequestType(Enum.DataStoreRequestType.GetAsync)
print("GetAsync budget:", reads)
```

```luau
--!strict
-- Remote with typed payload check (client -> server)
local function isLoadoutPayload(x: any): boolean
	if type(x) ~= "table" then return false end
	if type(x.slot) ~= "number" or x.slot % 1 ~= 0 or x.slot < 1 or x.slot > 6 then return false end
	if type(x.itemId) ~= "string" or #x.itemId > 40 then return false end
	return true
end
```

## Open questions / unverified
- TeleportData maximum size: the Teleport guide, `TeleportOptions` reference and `TeleportService` reference (re-read in the gap pass) give no byte limit, only "nested up to a reasonable depth and size"; DevForum searches found no number either. The 16 KB figure that circulates is unverified. Keep teleport data tiny and non-secret. [S23][S24]
- Client-side native codegen: server and Studio are documented; Android is claimed by the Luau 2025 recap and a community post, with no Roblox staff confirmation of client scope, and nothing on iOS or desktop. [S54][S59][S102]
- Attribute value-size limit and attribute count outside Server Authority: no documented limit anywhere (Instance reference, attributes guide). Only the `NextGenerationReplication` numbers (50-character strings, 1024 KB batch payload bug) were found; treat large string attributes as unsupported and keep attribute data small. [S103][S104][S105]
- Remote throughput: only "about 500 requests per second per client" (shared) and the 1000-byte Unreliable payload are in current docs. The old 50 KB/s figure was removed; no replacement bandwidth figure is documented.
- `MarketplaceService.ProcessReceipt`: the current reference says no time-based retry and no timeout for yielding callbacks; older community posts mention timeouts. I followed the reference.
- DataStore per-key write cooldown (the legacy "6 seconds between writes to a key"): not present in the current error/limits page; treat as unverified, but still avoid writing the same key repeatedly.
- Memory store Queue limits (item size, queue length) are not stated in the pages read beyond the global 32 KB value, 1,000,000 item and 100 MB structure limits, which are documented for memory store data structures in general.
- Whether strict mode is now on the new type solver by default after the January 2026 Studio Beta removal: the November 2025 announcement says strict stayed opt-in, and no later post was read. [S100]
- Parallel Luau per-API thread safety: only the four safety levels are documented in the guide; check each member's page for its tag before calling it from a parallel phase.
- The task-scheduler order above is read from label positions in the docs' diagram image, not from prose; confirm in a MicroProfiler capture before depending on an exact adjacent-step order. [S99]
- DataStorePages entry shape (`{key, value}`) and the exact `Enum.FrustumStreamingMode` member names were taken from the docs text or common usage; not freshly verified.
- EditableMesh/EditableImage availability in published experiences beyond the "13+ age verified, ID verified, Enable Mesh/Image APIs" requirement is unclear; quads are Studio Beta only.
- Anything labelled as a community opinion (remote fire rates, forum posts) is third-party and not Roblox policy.

### Resolved in the 2026-10-04 gap pass (details are in Key facts)
- ProfileStore and `BindToClose`: handled by the module (source read). [S84]
- Task-scheduler per-frame job order: recovered from the docs diagram. [S99]
- `Instance.fromExisting`: documented in the Instance datatype reference, usable outside Server Authority. [S96]
- `InputContext`/`InputAction`/`InputBinding` runtime creation and `Enum.InputActionType` names: classes are creatable; the five enum names are verified; the docs show only edit-time workflows. [S97]
- Audio listener auto-wiring: `SoundService.DefaultListenerLocation` creates listener, output device and wire for Character and Camera. [S98]
- New type solver: general release 2025-11-20, default for nocheck/nonstrict; strict opt-in; Workspace properties named. [S100][S101]

## Sources
[S1] Data store errors and limits, Roblox Creator Hub, read 2026-10-04, https://create.roblox.com/docs/cloud-services/data-stores/error-codes-and-limits
[S2] Data stores, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/data-stores
[S3] Data store best practices, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/data-stores/best-practices
[S4] Data store versioning, listing and caching, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/data-stores/versioning-listing-and-caching
[S5] Data store observability, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/data-stores/observability
[S6] DataStoreService class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/DataStoreService
[S7] GlobalDataStore class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/GlobalDataStore
[S8] DataStore class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/DataStore
[S9] OrderedDataStore class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/OrderedDataStore
[S10] DataModel class reference (BindToClose, JobId), Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/DataModel
[S11] Right to be forgotten for data stores, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/data-stores/right-to-be-forgotten
[S12] Player data and purchasing (session locking, receipts), Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/data-stores/player-data-purchasing
[S13] Memory stores overview, limits and quotas, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/memory-stores
[S14] Memory store best practices, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/memory-stores/best-practices
[S15] MemoryStoreSortedMap class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/MemoryStoreSortedMap
[S16] Memory store sorted map guide, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/memory-stores/sorted-map
[S17] MemoryStoreQueue class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/MemoryStoreQueue
[S18] Memory store hash map guide, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/memory-stores/hash-map
[S19] MemoryStoreService class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/MemoryStoreService
[S20] MessagingService class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/MessagingService
[S21] Cross-server messaging guide, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/cross-server-messaging
[S22] TeleportService class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/TeleportService
[S23] TeleportOptions class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/TeleportOptions
[S24] Teleporting guide, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/projects/teleport
[S25] MarketplaceService class reference (ProcessReceipt), Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/MarketplaceService
[S26] Developer products guide (monetization), Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/production/monetization/developer-products
[S27] RemoteEvent class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/RemoteEvent
[S28] UnreliableRemoteEvent class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/UnreliableRemoteEvent
[S29] Remote events and callbacks, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/events/remote
[S30] Security and cheat mitigation tactics, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/security/security-tactics
[S31] The client-server boundary (security), Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/security/client-server-boundary
[S32] Defensive design tactics, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/security/defensive-design
[S33] Access control and confidentiality, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/security/access-control
[S34] Server-side detection and consequencing, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/security/server-side-detection
[S35] Third-party code vulnerabilities and sandboxing, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/security/third-party-vulnerabilities
[S36] Network ownership and physics security, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/security/network-ownership
[S37] BasePart class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/BasePart
[S38] "Remote event limitations?" thread by Conejin_Alt, Roblox DevForum, 2025-08-15 (community opinion, third-party), https://devforum.roblox.com/t/remote-event-limitations/3882204
[S39] Instance class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Instance
[S40] Attributes guide, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/attributes
[S41] Properties window (instance attributes and types), Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/studio/properties
[S42] CollectionService class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/CollectionService
[S43] Reuse code with modules, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/module
[S44] Script types and locations, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/locations
[S45] task library reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/libraries/task
[S46] Schedule code, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/scheduler
[S47] Deferred engine events, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/events/deferred
[S48] RunService class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/RunService
[S49] Task scheduler (MicroProfiler), Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/performance-optimization/microprofiler/task-scheduler
[S50] Parallel Luau, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/multithreading
[S51] Actor class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Actor
[S52] Improve performance, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/performance-optimization/improve
[S53] Design for performance, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/performance-optimization/design
[S54] Native code generation, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/luau/native-code-gen
[S55] Luau type checking, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/luau/type-checking
[S56] Luau types, luau.org, 2026-10-04, https://luau.org/types
[S57] Luau performance, luau.org, 2026-10-04, https://luau.org/performance
[S58] Luau library, luau.org, 2026-10-04, https://luau.org/library
[S59] Luau Recap for 2025: Runtime, luau.org, 2025-12-19, https://luau.org/news/2025-12-19-luau-recap-runtime-2025
[S60] Instance streaming, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/workspace/streaming
[S61] Frustum streaming, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/workspace/streaming/frustum
[S62] SLIM streaming, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/workspace/streaming/slim
[S63] Workspace class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Workspace
[S64] Adaptive timestepping, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/physics/adaptive-timestepping
[S65] Assembly sleep system, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/physics/sleep-system
[S66] Server authority model, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/projects/server-authority
[S67] Server authority techniques, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/projects/server-authority/techniques
[S68] "[Full Release] Ship Fair And Competitive Games with Server Authority", Bryan (welblander), Roblox DevForum, 2026-07-09, https://devforum.roblox.com/t/full-release-ship-fair-and-competitive-games-with-server-authority/4727993
[S69] Roblox is creating responsive, cheat-resistant games with server authority, Roblox newsroom, 2026-07-09, https://about.roblox.com/newsroom/2026/07/creating-responsive-cheat-resistant-games-roblox-server-authority
[S70] Input Action System, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/input/input-action-system
[S71] Audio objects, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/audio/objects
[S72] Audio overview, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/audio
[S73] AudioPlayer class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/AudioPlayer
[S74] Wire class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Wire
[S75] EditableMesh class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/EditableMesh
[S76] EditableImage class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/EditableImage
[S77] "EditableMesh restrictions" thread (staff reply by L3Norm), Roblox DevForum, April 2026, https://devforum.roblox.com/t/editablemesh-restrictions/4566101
[S78] "[Studio Beta] Quad Support for EditableMesh APIs", Roblox Geometry Team (RbxWillingham), DevForum, 2026-09-23, https://devforum.roblox.com/t/studio-beta-quad-support-for-editablemesh-apis/4890142
[S79] "Frustum Streaming: Stream What Your Players See", 77BigBig77, DevForum, 2026-09-29, https://devforum.roblox.com/t/frustum-streaming-stream-what-your-players-see/4904553
[S80] "[API Update] API Rate Limit Tuning", huaraz, DevForum, 2026-09-30, https://devforum.roblox.com/t/api-update-api-rate-limit-tuning/4906160
[S81] ProfileStore (DataStore module) announcement by loleris, DevForum, 2024-10-11, https://devforum.roblox.com/t/profilestore-save-your-player-data-easy-datastore-module/3190543
[S82] ProfileStore API documentation, Mad Studio (loleris), https://madstudioroblox.github.io/ProfileStore/api/
[S83] ProfileStore tutorial and README, Mad Studio (loleris), https://madstudioroblox.github.io/ProfileStore/tutorial/
[S84] ProfileStore.luau source constants, github.com/MadStudioRoblox/ProfileStore, https://raw.githubusercontent.com/MadStudioRoblox/ProfileStore/main/ProfileStore.luau
[S85] "Datastore Session Locking" thread (jonbyte, EncodedLua), DevForum, 2020-08-25 (stale, background only), https://devforum.roblox.com/t/datastore-session-locking/740302
[S86] HttpService guide, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/cloud-services/http-service
[S87] Transparent batching, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/transparent-batching
[S88] Debounce patterns, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/debounce
[S89] Events (Connect, Once, Wait, Disconnect), Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/events
[S90] Players class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Players
[S91] Player class reference, Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Player
[S92] TweenService class reference (SmoothDamp), Roblox, 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/TweenService
[S93] Client-server runtime, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/projects/client-server
[S94] Script Sync, Roblox Creator Hub, 2026-10-04, https://create.roblox.com/docs/scripting/sync
[S95] DevForum Announcements category listing (Sep-Oct 2026 posts), Roblox DevForum, read 2026-10-04, https://devforum.roblox.com/c/updates/announcements/36
[S96] Instance datatype reference (Instance.new, Instance.fromExisting), Roblox Creator Docs (creator-docs repo), read 2026-10-04, https://create.roblox.com/docs/reference/engine/datatypes/Instance
[S97] InputActionType enum, InputContext, InputAction and InputBinding class references, Roblox Creator Docs (creator-docs repo), read 2026-10-04, https://create.roblox.com/docs/reference/engine/enums/InputActionType
[S98] SoundService.DefaultListenerLocation, ListenerLocation enum and AudioListener class reference, Roblox Creator Docs (creator-docs repo), read 2026-10-04, https://create.roblox.com/docs/reference/engine/enums/ListenerLocation
[S99] Task scheduler diagram (task-scheduler.svg), Roblox Creator Docs asset in Roblox/creator-docs, read 2026-10-04, https://create.roblox.com/docs/performance-optimization/microprofiler/task-scheduler
[S100] "[General Release] Luau's New Type Solver", Yuria_theWitch, DevForum, 2025-11-20, https://devforum.roblox.com/t/general-release-luau%E2%80%99s-new-type-solver/4084991
[S101] Workspace.UseNewLuauTypeSolver, Workspace.LuauTypeCheckMode and LuauTypeCheckMode enum, Roblox Creator Docs (creator-docs repo), read 2026-10-04, https://create.roblox.com/docs/reference/engine/classes/Workspace
[S102] "Enable --!native for clients", DevForum feature-request thread (community; first post Sept 2024, latest community comment Sept 2026; no staff reply found), https://devforum.roblox.com/t/enable-native-for-clients/3170510
[S103] "New Attribute string value cannot exceed 50 character limit" (Studio bug, staff reply by NightlyShores, 2026-04-27), DevForum, https://devforum.roblox.com/t/new-attribute-string-value-cannot-exceed-50-character-limit/4584197
[S104] "Server authority (nextgen replication): undocumented 1024 kilobyte limit, crash if you exceed the limit in a large batch" (engine bug; staff reply by Khanovich, fix in Studio by 2026-05-23, resolved 2026-06-06), DevForum, https://devforum.roblox.com/t/server-authority-nextgen-replication-undocumented-1024-kilobyte-limit-crash-if-you-exceed-the-limit-in-a-large-batch/4608715
[S105] "Is there any attribute limit?", DevForum, 2025-05-27 (community answers only), https://devforum.roblox.com/t/is-there-any-attribute-limit/3666469
[S106] "RDC26: What We Announced", DevForum announcements, September 2026 (post date not captured), https://devforum.roblox.com/t/rdc26-what-we-announced/4865880
[S107] ProfileStore repository: wally.toml (package lm-loleris/profilestore 1.0.3, realm server) and README, GitHub, read 2026-10-04, https://github.com/MadStudioRoblox/ProfileStore ; wally-index entry https://github.com/UpliftGames/wally-index
