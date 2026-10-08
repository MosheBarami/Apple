---
name: game-systems
description: A method for designing gameplay systems from a request (currency and economy, shops, inventories, progression and levels, rounds and lobbies, checkpoints, combat basics, leaderboards, daily rewards, codes, purchases). For each, the data model, server authority, the remote API surface, persistence, UI wiring with build_ui, and testing with play_check. Load when a request adds or changes game rules, player data or any feature with state; pair it with roblox-scripting for the API details.
---

# Game systems

There are no canned systems here: design each one from the request. Every system answers the same six questions;
write the answers into `update_plan` before writing code, then build in this order: data → server logic → remotes →
client/UI → persistence → test.

## 1. The six questions

1. **State**: what data exists, who owns it (per player, per server, global), and its shape (types, limits).
2. **Rules**: which events change it (join, touch, purchase, timer, kill) and the exact rule (cost, reward, cooldown,
   cap). Write numbers as config in one ModuleScript in `ReplicatedStorage` (shared, read-only for clients) — prices,
   rewards, cooldowns — so balance changes in one place.
3. **Authority**: the server owns all state. The client only asks (intent remotes) and displays.
4. **API surface**: the smallest set of remotes: client→server intents (`RequestBuy(itemId)`), server→client updates
   (`InventoryChanged(snapshot)` or attributes/leaderstats the client can read). Name them by action.
5. **Persistence**: what must survive leaving (DataStore, one profile per player) and what is per-session.
6. **Presentation**: which UI shows it (built with `build_ui`, verified with `check_ui`), which feedback (sound,
   effect) confirms each change.

## 2. Architecture pattern

- One server "service" per system (a ModuleScript in `ServerScriptService` or `ServerStorage`, started by one
  bootstrap Script) exposing functions (`Economy.add(player, amount, reason)`) that other server systems call.
  Systems talk through these functions, not through remotes.
- A **player data module** owns loading/saving the profile; other services read/write through it, never DataStores
  directly. Mark data dirty and let autosave/leave save it.
- Expose state to clients by replication: `leaderstats` values, attributes on the Player (`player:SetAttribute
  ("Coins", n)`), or a snapshot remote. Clients listen to changes; they never compute authoritative values.
- Reuse what the place already has (see the `existing-games` skill): extend an existing data module instead of
  creating a second one.

## 3. System notes (what to decide, what goes wrong)

**Currency / economy**
- Integer amounts; single `add(player, delta, reason)` that clamps ≥ 0 and logs reasons (helps debugging).
- Sources (earn) and sinks (spend) should balance: estimate earn per minute and price items in minutes of play.
- Never accept an amount from the client.

**Shop**
- Catalog = config table `{ [itemId] = { price, kind, ... } }`. Client sends `itemId`; server checks it exists,
  player can afford it, does not already own it (if unique), then deducts and grants **in one step** (no yield
  between check and write) and replies with the result.
- Robux purchases: developer products through `MarketplaceService.ProcessReceipt` (idempotent: record
  `PurchaseId`, save before returning `PurchaseGranted`); game passes checked with `UserOwnsGamePassAsync` on join
  and on `PromptGamePassPurchaseFinished`. Product/pass ids are created by the owner on the website — ask for them.

**Inventory**
- Store item ids and counts (`{ [itemId]: count }`) or a list of unique item records with generated ids; never store
  Instances. Equipping spawns the Tool/model from a server-side template (`ServerStorage`) by id.
- Cap sizes; validate equip/drop/trade requests against ownership.

**Progression (XP, levels, rebirths, unlocks)**
- Store raw XP; derive level with a formula (`level = floor(sqrt(xp / k))` or a table) so tuning does not need
  migrations. Unlock checks happen on the server where the gated action happens.

**Rounds / lobby**
- A server state machine: `Intermission → Starting → InRound → Ended → Intermission`, driven by one loop with
  `task.wait`. Publish state and time left via attributes on a `ReplicatedStorage` Folder (or `workspace`) for UI.
- Handle players leaving mid-round, too few players, and the last player standing; teleport/respawn with
  `PivotTo` on the character; clean up the round's instances.

**Checkpoints (obby)**
- Tagged checkpoint parts with an `Order` attribute; on touch (server, debounced, player alive) set
  `stage = max(stage, order)` only if `order == stage + 1` (no skipping) — or allow skipping by design.
- On `CharacterAdded`, move to the checkpoint (`character:PivotTo(cp.CFrame + Vector3.new(0, 3, 0))`) after the
  character is parented. Save the stage.

**Combat basics**
- The client plays animation/effects instantly; the server validates and applies damage: cooldown per player, range
  check from the server's view of positions, target is alive and not on the same team, raycast/overlap on the server
  for hit detection (or validate the client's claimed target with tolerance).
- Damage via `Humanoid:TakeDamage`; track the last attacker (attribute or table) for kill credit.

**Leaderboards**
- In-server: `leaderstats`. Global: `OrderedDataStore` (`SetAsync`/`UpdateAsync` the player's score on save,
  `GetSortedAsync(false, 10)` every 60+ s on the server), shown on a SurfaceGui or ScreenGui. Respect budgets.

**Daily rewards / streaks**
- Store `lastClaim` as `os.time()` (UTC); day index = `os.time() // 86400`. Claim allowed when the day index is
  greater; streak continues when it is exactly +1. Server decides; client shows the timer from the stored time.

**Codes**
- Code table on the server only (ServerScriptService/ServerStorage, never ReplicatedStorage). Normalise input
  (`string.upper`, trim, length cap), check expiry and "already redeemed" in the profile, rate-limit attempts.

## 4. UI wiring

- Build screens with `build_ui` (the `ui-design` skill covers layout); fix every defect `check_ui` reports.
- One LocalScript per screen/controller: listens to state changes (attribute signals, leaderstats `Changed`,
  update remotes) and updates text; sends intents on button `Activated`.
- Show server results: disable the button while a request is pending, show success/failure from the server's reply.
- Never put prices or rules only in UI text; read them from the shared config module.

## 5. Testing

1. `run_luau` to unit-check pure logic in modules at edit time (level formula, price checks, day math) — require the
   module and assert outputs.
2. `play_check`: join as a player; confirm leaderstats/attributes appear with the right starting values, UI shows
   them, no client/server errors.
3. Exercise the flow (touch a checkpoint, buy an item) where `play_check` allows; otherwise add a temporary
   Studio-only test hook (guarded with `RunService:IsStudio()`) and remove it after.
4. `get_output_logs` for warnings (DataStore unavailable in Studio when API access is off: tell the user it is
   expected and how to enable it).
5. Report to the user: the rules as implemented (numbers), the remotes, what persists, and what they must do
   (create product ids, enable API access, publish).

## 6. Security checklist (run before finishing)

- Every remote handler validates types, ranges, ownership, distance and cooldown.
- No value-granting remote takes an amount or a result from the client.
- Server-only data (codes, catalog internals, admin lists) is not in ReplicatedStorage.
- Data loads failing → player is not allowed to overwrite their save.
- Per-player tables are cleaned on `PlayerRemoving`.
