---
name: roblox-scripting
description: Luau and Roblox's client/server model. Covers where each script type lives and runs, RemoteEvents/RemoteFunctions with server-side validation, DataStoreService (UpdateAsync, pcall, retries, budgets, session locking), Players and leaderstats, CollectionService tags, attributes, the task library, connections and cleanup, --!strict types, performance and reading runtime errors. Load before writing or editing any Script, LocalScript or ModuleScript. Its references/api-cheatsheet.md lists exact signatures of the services used most.
---

# Roblox scripting

Write code that runs in the right place, trusts nothing from the client, saves data safely and cleans up after
itself. When a signature or enum is not certain, `search_docs` it and cite the page; do not guess member names.
Exact signatures for common services: `load_skill` with `file: "references/api-cheatsheet.md"`.

## 1. Where code lives and runs

| Container | Script type | Runs on | Use for |
|---|---|---|---|
| `ServerScriptService` | `Script` | server | game rules, data, remotes' server side |
| `ServerStorage` | ModuleScript / assets | server only (not replicated) | server modules, templates cloned at runtime |
| `ReplicatedStorage` | ModuleScript, RemoteEvent, RemoteFunction | both (replicated) | shared modules, config, the remote API |
| `StarterPlayer.StarterPlayerScripts` | `LocalScript` | each client, once per join | input, camera, client controllers |
| `StarterPlayer.StarterCharacterScripts` | `LocalScript` / `Script` | copied into each character, every spawn | per-character behaviour |
| `StarterGui` (inside a ScreenGui) | `LocalScript` | client, copied into PlayerGui | UI logic (respawns with the UI unless `ResetOnSpawn = false`) |
| `Workspace` | `Script` | server | avoid; prefer one ServerScriptService script per system plus tags |

Rules:
- A `LocalScript` does not run in `Workspace` (except inside the local player's character) or in `ServerScriptService`.
- A `Script` with `RunContext = Enum.RunContext.Client` runs on clients wherever it is; use it only when you mean to.
- Server-only secrets and logic never go in `ReplicatedStorage`: everything there is visible to exploiters.
- One module per responsibility; `require()` returns the same table to every caller on the same side (cached).

## 2. Server authority

The client controls only its own input and what it renders. Everything with value (currency, damage, inventory,
position-based rewards, cooldowns, purchases) is decided on the server.

Remote API design:
1. Create remotes in `ReplicatedStorage` (e.g. a `Remotes` Folder), named by action: `RequestPurchase`, `UseAbility`.
2. Client sends **intent**, never results: `RequestPurchase:FireServer(itemId)`, not `GiveCoins:FireServer(100)`.
3. Server handler `OnServerEvent:Connect(function(player, ...)` — the first argument is always the real sender,
   injected by the engine. Every other argument is attacker-controlled.
4. Validate each argument: `typeof(x) == "string"`, length caps, `math.floor(n) == n`, finite (`n == n and
   math.abs(n) < math.huge`), the id exists in your server-side table, the player is in range
   (`(root.Position - target.Position).Magnitude <= maxDist`), the player owns/can afford it, the per-player cooldown
   has passed (store `os.clock()` per player in a table keyed by `player`, cleared on `PlayerRemoving`).
5. Server -> client: `remote:FireClient(player, ...)` / `FireAllClients(...)`; client listens with `OnClientEvent`.
6. `RemoteFunction`: use for client asking server a question (`InvokeServer`). Never `InvokeClient` from the
   server: a client that never returns hangs the server thread. Use `UnreliableRemoteEvent` for frequent cosmetic
   updates that may be dropped.
7. Rate-limit chatty remotes; ignore (do not error on) malformed calls.

Physics: the server can give a client network ownership of unanchored parts near it, so the client can move them.
For server-controlled moving objects call `part:SetNetworkOwner(nil)` (only on unanchored parts in Workspace).

## 3. Data persistence (DataStoreService)

Method:
- One key per player: `"player_" .. player.UserId`. Store a plain table (no Instances, no Vector3/Color3 — encode
  them), with a `version` field for migrations. 4 MB per key max.
- Load on `PlayerAdded`, save on `PlayerRemoving`, periodic autosave (every 60-120 s), and in
  `game:BindToClose(function() ... end)` save all remaining players (it has ~30 s; run saves in parallel with
  `task.spawn` and wait for them).
- Every call is a network call that can fail: wrap in `pcall`, retry with backoff (e.g. 3 tries, 1/2/4 s).
- Prefer `UpdateAsync(key, function(old) ... return new end)` over `SetAsync` for saves: it reads-modifies-writes
  atomically and you can refuse a stale write by returning `nil`. The transform function must not yield.
- Budgets: `DataStoreService:GetRequestBudgetForRequestType(Enum.DataStoreRequestType.UpdateAsync)` before bulk work;
  per-key writes are throttled (~one write per 6 s per key); requests queue then fail when over budget.
- If the load fails, do **not** let the player play with default data that will overwrite the real save: kick with a
  message or mark the session "not loaded" and skip saving.
- Session locking basics: store `lock = { jobId = game.JobId, time = os.time() }` in the record via UpdateAsync; on
  load, if another live server holds a recent lock, retry after a few seconds; clear the lock in the final save.
  Teleports between places make this matter.
- In Studio, DataStores need the place published and "Enable Studio Access to API Services" on; otherwise calls
  error. Say so to the user instead of hiding the error.
- Counters across all players: `IncrementAsync`; leaderboards: `GetOrderedDataStore` + `GetSortedAsync`.
  Cross-server short-lived data: `MemoryStoreService`. Purchases of developer products:
  `MarketplaceService.ProcessReceipt` must be idempotent and return `Enum.ProductPurchaseDecision.PurchaseGranted`
  only after the grant is saved.

## 4. Players, characters, leaderstats

- `Players.PlayerAdded:Connect(onAdded)` **and** loop `Players:GetPlayers()` once for players who joined before the
  connection (matters in Studio and after yields).
- Character: `player.CharacterAdded:Connect(fn)`; also handle `player.Character` if already present. Get parts with
  `character:WaitForChild("Humanoid")`; `Humanoid.Died` per life.
- leaderstats: a `Folder` named exactly `leaderstats` parented to the Player, containing `IntValue`/`NumberValue`/
  `StringValue` children. Create it on the server. The leaderboard shows the first few values in child order.
- Server code reads `player.UserId` as identity, never `player.Name` (names change).

## 5. Tags and attributes

- `CollectionService:AddTag(inst, "Lava")` (or the Tags property in Studio), then one script handles every tagged
  instance: iterate `GetTagged(tag)` and connect `GetInstanceAddedSignal(tag)` / `GetInstanceRemovedSignal(tag)`.
  This beats a copied Script inside every part and works with StreamingEnabled.
- Attributes are per-instance configuration and state: `inst:SetAttribute("Damage", 20)`, `inst:GetAttribute`,
  `inst:GetAttributeChangedSignal("Damage")`. Allowed types: string, boolean, number, UDim, UDim2, BrickColor,
  Color3, Vector2, Vector3, CFrame, NumberSequence, ColorSequence, NumberRange, Rect, Font, EnumItem. Server-set
  attributes replicate; client-set ones do not.
- Use attributes instead of ValueObjects for config; use tags instead of name matching.

## 6. Timing: the task library

- `task.wait(s)` (not `wait`), `task.spawn(fn, ...)` (run now on a new thread), `task.defer(fn)` (run after the
  current resumption cycle), `task.delay(s, fn)`, `task.cancel(thread)`.
- `wait`, `spawn`, `delay` are deprecated (throttled, imprecise). Replace them when you touch the code.
- Per-frame work: `RunService.Heartbeat` (after physics, both sides), `RunService.PreRender` (client, before render;
  camera). `RenderStepped` is legacy name for client pre-render. Use `dt` passed to the callback; never assume 60 fps.
- Never `while true do` without a yield. Prefer events over polling loops.

## 7. Connections and cleanup

- `local conn = signal:Connect(fn)`; `conn:Disconnect()` when the owner goes away. `signal:Once(fn)` for one-shot.
- `instance.Destroying` fires before destruction; `Destroy()` disconnects the instance's own signals but not
  connections the instance's code made to *other* objects (e.g. `RunService.Heartbeat`, Players events). Disconnect
  those yourself.
- Per-player tables (`cooldowns[player]`) must be cleared on `PlayerRemoving` or they leak.
- Keep a list of connections per object/system and disconnect them all in one cleanup function.

## 8. Types

- `--!strict` at the top of new modules; annotate function parameters and returns:
  `local function award(player: Player, amount: number): boolean`.
- Define shapes with `type Profile = { coins: number, items: { [string]: boolean } }` and `export type` from modules.
- `:: Type` casts the result of `WaitForChild`/`FindFirstChild` when you have checked it.
- `FindFirstChild` can return nil: check it. `WaitForChild` without timeout can hang forever (warns after 5 s).

## 9. Performance basics

- Do not create connections or instances inside hot loops; cache services and instances in locals.
- Spatial queries: `workspace:Raycast(origin, direction, params)` with `RaycastParams`;
  `workspace:GetPartBoundsInBox/Radius` with `OverlapParams`. Cheaper and more reliable than `.Touched` for areas.
- `.Touched` fires many times per contact: debounce per player.
- Tween visual properties on the client when only cosmetic; the server only sets state.
- Parallel Luau (Actors, `task.desynchronize`) only for measured, heavy, independent work.

## 10. Reading runtime errors

Find them with `get_output_logs` (edit time) and `play_check` (client + server, real play). Common ones:

| Message | Meaning / fix |
|---|---|
| `attempt to index nil with 'X'` | the thing before `.X` is nil: a `FindFirstChild` miss, a character not loaded yet, a wrong path. Wait or guard. |
| `X is not a valid member of Y "path"` | wrong name, wrong class, or not replicated/streamed yet. Use `WaitForChild` on the client. |
| `Infinite yield possible on 'X:WaitForChild("Y")'` | the child never appears: name typo or created on the wrong side. |
| `attempt to perform arithmetic on nil` / `on a string value` | uninitialised value or attribute missing. |
| `Requested module experienced an error while loading` | the module itself threw; read the earlier error. |
| `Attempted to call require with invalid argument(s)` | path is not a ModuleScript. |
| `DataStore request was added to queue` / `502: API Services rejected` | over budget / Studio API access off. |
| `Script timeout: exhausted allowed execution time` | loop without yield. |
| `Unable to cast value to Object` / `Argument N missing or nil` | wrong argument type to an engine API: check the signature in the docs. |

The stack trace names the script and line: `read_script` that line before changing anything.

## 11. Working method with the tools

1. `get_project_tree` / `glob` / `grep` to learn the existing structure before adding code.
2. Plan the pieces in `update_plan`: modules, remotes, server scripts, client scripts.
3. Create scripts with `create_instances` (class `Script`/`LocalScript`/`ModuleScript`, `Source`) or change them with
   `edit_script`. Keep each script focused; shared constants in one ReplicatedStorage module.
4. `run_luau` to inspect state or test a pure module at edit time (it runs in the plugin context: no players, no
   DataStores, no server/client split).
5. `play_check` to run it for real; read server and client errors; fix and re-run until clean.
