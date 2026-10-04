# Systems Cookbook: correct, modern Luau for the systems every Roblox game needs
_Gap pass 2026-10-04: 6 resolved, 5 still open._
_Researched 2026-10-04 by Claude (Sonnet 5.5). Sources: 100._

How this was verified: every class, method, property, enum member and limit used in the recipes was checked on
2026-10-04 against the Creator Hub reference. Reference pages were read from the raw docs source
(`Roblox/creator-docs`, `content/en-us/...`, which create.roblox.com renders), parsed member by member (name,
signature, `Deprecated` tag), and the guide pages were read as text. Where a fetch summary and the raw page disagreed,
the raw page won. Community modules are cited with author and date; anything older than 2024 is flagged. Code was
written for `--!strict` Luau and syntax-checked with `luau-analyze` (Roblox globals are not available to that tool, so
semantics were not run in Studio): treat every recipe as a reviewed sketch and run the "Test in Studio" list. The
shared persistence layer (ProfileStore session locking, DataStore budgets, `ProcessReceipt`) is not repeated here; see
`04-luau-architecture.md` [S91].

## Key facts

### Cross-cutting facts that shape every recipe
- Any server logic a client can trigger is attack surface: RemoteEvents, RemoteFunctions, and also `ProximityPrompt`,
  `ClickDetector`, `Touched`. Validate in layers: context/permission (alive, near, owns), type/structure (Instance
  really under the expected folder, string length caps, tables sent in place of Instances), value (`math.isfinite`
  rejects NaN and infinity; quantities greater than zero; ids that exist). NaN is type `number` and fails every
  comparison, so `if x > max` silently passes it. The docs' own example of this bug is a trading offer. [S59]
- Rate limit every client-triggered path on the server with a token bucket (capacity and refill rate); client-side
  limits are cosmetic. [S59]
- `ProximityPrompt.Triggered` fires on the server and passes the player, but an exploiter can fire prompts from anywhere,
  so re-check distance and state in the handler. [S11][S59]
- Tool events (`Equipped`, `Activated`) are documented as firing in client `LocalScript`s because only the device sees
  input; tools therefore normally pair a LocalScript, a RemoteEvent and a server Script. The Tool reference page is silent on
  the context (re-read 2026-10-04). A 2022 DevForum thread (Presterboi and Forummer, community, no staff reply) says a server
  Script inside the Tool does receive `Activated`, which contradicts the guide; treat server-side `Activated` as not confirmed by
  Roblox and keep the LocalScript + RemoteEvent pattern (see Open questions). [S13][S14][S100]
- A character's `Backpack` is filled from `StarterPack` and `StarterGear` on spawn and is recreated on death, so granted
  Tools must be re-granted on every `CharacterAdded`. Tool needs a part named `Handle` unless `RequiresHandle` is
  false; no part of a tool should be `Anchored` (the character gets stuck). Tools earned or bought belong in
  `ReplicatedStorage`/`ServerStorage` and are cloned into the Backpack. [S12][S13][S14]
- Player-visible time: `Workspace:GetServerTimeNow()` is a smoothed client estimate of server Unix time, monotonic,
  within 0.6% of the local clock rate, and the docs call it unsuitable for security-sensitive timers; `os.time()` on the
  server is the authority for day boundaries. [S33][S25]
- `DateTime.now()` and `os.time()` read the device clock; on the server that is the server clock. `os.date("!*t", t)`
  gives UTC fields. [S24][S25]

### Combat and spatial queries
- `WorldRoot:Raycast(origin, direction, params)` maximum length 15,000 studs; `Spherecast` max radius 256 and travel 1,024;
  `Blockcast` max size 512 and travel 1,024; shapecasts do not report parts they already overlap at the start. All
  return `RaycastResult` (Instance, Position, Normal, Material, Distance). [S4][S5][S73]
- `GetPartBoundsInBox(cframe, size, overlapParams)` and `GetPartBoundsInRadius` test bounding boxes, not exact
  geometry; `GetPartsInPart` does a full geometry check. `OverlapParams` has `MaxParts` (0 = unlimited), `CollisionGroup`,
  `RespectCanCollide`, `BruteForceAllSlow`, `Tolerance`. Parts with `CanQuery = false` are ignored by spatial queries. [S4][S5][S6]
- Since 2026-04-07 `RaycastParams` and `OverlapParams` have `ExcludeInstances` and `IncludeInstances` (both usable at
  once, exclusion wins a tie, `IncludeInstances = nil` means everything and `{}` means nothing). The older
  `FilterDescendantsInstances` plus `FilterType` still work, but the RaycastParams and OverlapParams reference pages (read 2026-10-04) now
  list them as superseded/deprecated, and `AddToFilter` is already deprecated. OverlapParams is the parameter type of
  `GetPartBoundsInBox`, `GetPartBoundsInRadius` and `GetPartsInPart`. The recipes below set filters through one helper that tries the
  new properties first. [S7][S6][S8]
- Roblox's own blaster tutorial validates a client-reported shot with four checks: data types, angle against the
  expected direction (dot product), tagged player near the beam end within a stud tolerance, and a server recast for
  obstruction; damage goes through `Humanoid:TakeDamage` so ForceFields keep working; the docs say no anti-exploit
  strategy is comprehensive. The separate security page lists extra weapon checks: origin near the server-side
  character (with latency tolerance), hit point close to the claimed part, static-geometry-only obstruction check,
  fire-rate and ammo tracking on the server, teammate and alive checks, and reload/sprint state. [S50][S51][S59]
- Weapons Kit defaults (Roblox's prefab, projectile-based): `HitDamage` 10, `ShotCooldown` 0.1 s, `AmmoCapacity` 30,
  `BulletSpeed` 1000 studs/s (20000 simulates hitscan), `MaxDistance` 2000, `FullDamageDistance` 1000,
  `ZeroDamageDistance` 10000, `StartupTime` 0.2 s (stops one shot from several weapons), `FireMode` Semiautomatic,
  Automatic or Burst (`NumBurstShots` 3), explosion `BlastRadius` 8, `BlastPressure` 10000, `BlastDamage` 100. [S54]
- Community lag-compensation design (DevForum, 2024-12-27): snapshots at 32 per second, up to one second of history,
  rewind to the tick the client sent or the nearest snapshot; roughly 200 KB for 50 players x 6 limbs x 32 snapshots
  (author's estimate). [S75] A 2025-12 thread recommends client raycast plus server sanity checks and position rewind
  history. [S76] Melee: a 2025-09 thread ranks `GetPartBoundsInBox` as a good performance/safety balance, raycasts safe
  but needing several rays, shapecasts more accurate but slower and hitting one part per cast, and discourages `.Touched`
  and `GetPartsInPart`. [S74]
- RaycastHitbox 4.01 (TeamSwordphin, 2021-09-21) is a popular attachment-ray melee module (attachments named `DmgPoint`,
  `OnHit`, hits each target once per `HitStart`) but is no longer maintained; the thread itself notes it is superseded by a shapecast-based module and has known bugs.
  Flag: stale (2021). [S72]
- FastCast (EtiTheSpirit) simulates projectiles with raycasts instead of physics. Current API (docs read 2026-10-04; the changelist
  names 13.2.1 as latest, without a date): `FastCast.new()` returns a Caster (create one per weapon, never one per shot) and
  `FastCast.newBehavior()` returns a `FastCastBehavior`. `Caster:Fire(origin: Vector3, direction: Vector3, velocity: Vector3 | number,
  behavior: FastCastBehavior?)`; a number velocity is a speed along `direction`. The signature changed in 12.0.0 and the changelist says
  old code "will completely fail" (the Caster page itself prints the method as `ActiveCast(...)`, a docs typo; the changelist calls it
  `Caster:Fire()`). `FastCastBehavior` fields and defaults: `RaycastParams` nil, `MaxDistance` 1000, `Acceleration` Vector3.new(),
  `HighFidelitySegmentSize` 0.5, `HighFidelityBehavior` 0, `CosmeticBulletTemplate`, `CosmeticBulletContainer` and
  `CosmeticBulletProvider` nil, `AutoIgnoreContainer` true, `CanPierceFunction` nil. Caster events: `RayHit` and `RayPierced` pass
  (ActiveCast, RaycastResult, Vector3, Instance); `LengthChanged` passes (ActiveCast, Vector3, Vector3, number, Vector3, Instance);
  `CastTerminating` passes (ActiveCast). An ActiveCast has `GetVelocity/SetVelocity/AddVelocity` (and Acceleration, Position
  equivalents), `Pause`, `Resume`, `Terminate`. `SimulateAfterPhysics` is not a field on the behavior page. [S92][S71]

### Movement, NPCs and physics
- `PathfindingService:CreatePath(params)` keys and defaults: `AgentRadius` 2, `AgentHeight` 5, `AgentCanJump` true,
  `AgentCanClimb` false, `WaypointSpacing` 4, `Costs` table (material names or modifier labels; `math.huge` blocks). Limits:
  straight-line distance 3,000 studs, node budget 20,000. `Path:ComputeAsync(start, finish)` yields;
  `Path:GetWaypoints()` returns `PathWaypoint` (Position, Action, Label), empty if no path; `Path.Status` is
  `Enum.PathStatus` (Success, ClosestNoPath, ClosestOutOfRange, FailStartNotEmpty, FailFinishNotEmpty, NoPath); actions are
  Walk, Jump, Custom; `Path.Blocked(blockedWaypointIdx)` can fire for a waypoint behind the agent, so compare it with the
  next waypoint index before recomputing. `PathfindingModifier` (`Label`, `PassThrough`) and `PathfindingLink`
  (`Attachment0/1`, `IsBidirectional`, `Label`) customise routes. [S1][S2][S3]
- `Humanoid:MoveTo(location)` times out after 8 seconds; `MoveToFinished(reached)` reports completion. `TakeDamage`
  respects ForceFields; `Humanoid.Health` writes do not. [S15]
- Network ownership: the server auto-assigns unanchored parts near a character to that client; the owner has full
  authority over those parts (teleport, fling, NaN velocities, suppressed `Touched`). `SetNetworkOwner(player or nil)` and
  `SetNetworkOwnershipAuto()` are server-side; `CanSetNetworkOwnership()` says whether it is allowed. The docs' vehicle
  example gives the driver ownership when seated and restores automatic ownership when they leave, and warns that a
  second occupant waits several network cycles for responsive input. [S30][S31]
  Constraint property writes by the owning client are not seen by the server: the server sees only their physical effects (community answer
  by Sepruko, 2023-01); the network-ownership and constraint docs pages say nothing on this (checked 2026-10-04). A staff-acknowledged engine
  bug (ticket noted 2024-03-05) says a client-owned part can stop replicating position and rotation to the server when the client sets up
  hinge, rope or rod constraints locally (`AlignPosition` and `AlignOrientation` are not affected). So build vehicle constraints on the server,
  never create them on the client, and treat a constraint property read on the server as stale. One 2023 thread reports that other players
  did not see a hinge driven from a LocalScript, so the two-client test stays. [S94][S95][S96]
- `VehicleSeat` exposes `MaxSpeed`, `Torque`, `TurnSpeed`, `ThrottleFloat` and `SteerFloat` (the integer `Throttle` and
  `Steer` are deprecated), `Occupant`, `HeadsUpDisplay`. A plain `Seat` welds the occupant (`SeatWeld`) and has a
  3-second per-character, per-seat re-sit cooldown. `HingeConstraint` with `ActuatorType = Motor` uses `AngularVelocity`,
  `MotorMaxTorque`, `MotorMaxAcceleration`; `Servo` uses `TargetAngle`, `AngularSpeed`, `ServoMaxTorque`; the docs name
  hinge motors (wheels) plus `SpringConstraint` suspension as the basic car recipe. [S16][S17][S18][S65]
- `AlignPosition` (defaults: `Mode` TwoAttachment, `RigidityEnabled` false; `MaxForce`, `MaxVelocity`, `Responsiveness`)
  is the constraint-based way to make a physical follower track a point. [S32]
- Smart-NPC budgets from a DevForum thread (2026-07-10): one developer runs 65 to 70 pathfinding attackers with
  light-to-moderate lag; another claims 1,500 NPCs with custom replication; optimisations named were disabling NPCs far
  from players, facing only in attack range, and skipping NPCs without line of sight. A 2026-05 module redesigns movement
  around explicit states and cancellable "path tokens". [S80][S81]
- Roblox's NPC Kit shows the conventional tuning surface: a `Configuration` object with `PatrolEnabled`, `PatrolRadius`,
  `AttackDamage`, `AttackDelay`, `AttackRadius`, `AttackMode`, `ClipCapacity`, `ReloadDelay`, `DestroyOnDeath`,
  `RagdollEnabled`, and CollectionService tags (`SoldierEnemy`, `SoldierFriend`, `ZombieFriend`) for aggression. [S55]

### Progression, rewards and live-ops
- Roblox ships four official feature packages: Bundles, Missions, Season Passes and Engagement Rewards, each with
  server code, UI and analytics, all depending on a Core package. Missions: config in
  `ReplicatedStorage.Missions.Configs`, fields `missionId`, `categoryId`, `tasks`, `repeatable`, `repeatLimit`,
  `repeatCooldownSeconds`, `availableAfterUtc`, `expireSeconds`; progress via
  `Missions.addProgressToTask(player, missionId, taskId, amount)`; completion via `Missions.setCompletionHandler`.
  Season Passes: `SeasonPasses.addProgressToSeason(player, xp)`, `startUtc`/`endUtc`, a `premiumTrack` with a
  `gamePassId`. Engagement Rewards: Time rewards (`requiredSecondsInGame`, reset every session) and Daily rewards
  (`requiredDaysVisitedStreak`, persisted), a `rewardClaimedHandlerFunction`. [S45][S46][S47][S48]
- Quest design vocabulary from Roblox: objective + quantity + reward; achievements (badges) are long-term single-task
  quests; dailies are short tasks that must be done within 24 hours and act as a currency drip; chains unlock further
  quests; limited-time quests drive urgency. [S49]
- `BadgeService:AwardBadgeAsync(userId, badgeId)` is current (`AwardBadge` is deprecated); rate limit 50 + 35 x users per
  minute for award and `UserHasBadgeAsync`; server-only for awarding. [S37]
- Leaderstats: a `Folder` named exactly `leaderstats` under the Player (created on the server); IntValue, NumberValue or
  StringValue children show in the player list; order by creation order, a child BoolValue `IsPrimary` (wins), or a child
  NumberValue `Priority` (higher first, default 0). Global boards use `OrderedDataStore` (integers only,
  `GetSortedAsync(ascending, pageSize, min, max)`); Roblox's tutorial refreshes the top list every few seconds and resolves
  names one by one. `UserService:GetUserInfosByUserIdsAsync` batches names but is limited to 250 results per minute. [S43][S44][S41][S66]
- Rounds in Roblox's laser-tag sample: a module owns the loop (`startRoundLoopAsync`), resets scores, flips the neutral
  spawn's `Neutral` to false so only team spawns work, balances teams as players join, stores team points as a `teamPoints`
  attribute on the `Team` (so a leaving scorer does not lower the team total), waits on a BindableEvent for the winning
  score, then fires a winner remote. `Teams` auto-balances players, groups the player list, and tints names;
  `SpawnLocation` has `Neutral`, `TeamColor`, `Enabled`, `Duration` (forcefield, default 10), `AllowTeamChangeOnTouch`
  (checkpoint). The Duvall Drive demo runs lobby, countdown, reserved-server teleport and mission flow as one server
  state machine whose client part receives events through a single `GameStateEvent` remote (type first, data after). [S52][S53][S38][S58]
- Out-of-experience notifications: a notification string is created in the Creator Dashboard (no API for that step);
  eligibility is at least 100 visits since launch, not under moderation, and permission to manage the game; recipients
  must be 13+ and opted in; one notification per user per day per experience; delivery is never guaranteed and is tied to
  engagement; content must be personalised and actionable, must not use dark patterns, and must not gate gameplay.
  `ExperienceNotificationService:CanPromptOptInAsync()` then `PromptOptIn()` (client; not shown to under-13s, to users
  already opted in, or to users who saw the prompt in the past 30 days). Sending uses the Open Cloud `UserNotification`
  resource (`payload.type = "MOMENT"`, `payload.message_id`, `source.universe`, optional `parameters`, `launch_data`,
  `analytics_data`) or the Creator Store "Open Cloud" Luau package. [S26][S27][S28][S29]
- In-experience toasts: `StarterGui:SetCore("SendNotification", {Title, Text, Icon?, Duration? (default 5), Button1?,
  Button2?, Callback?})` is client-only. `TextChannel:DisplaySystemMessage` is client-only (a LocalScript or client-context
  Script) and shows to that user alone; `TextChannel.ShouldDeliverCallback` is server-only. [S22][S23]
- Chat commands: a `TextChatCommand` parented to `TextChatService` with `PrimaryAlias` (and optional `SecondaryAlias`) fires
  `Triggered(originTextSource, unfilteredText)`; the matching message is not delivered to others; matching is
  case-insensitive and needs a space or end-of-message after the alias; Roblox's example connects `Triggered` in a server
  Script and maps `textSource.UserId` to a player. The reference (updated 2026-10-02) lists Security None and Capabilities Chat and names
  no side; `Triggered` fires where the instance lives, and the example places the instance in Studio and connects it on the server.
  Messages matching a command are sunk only for commands created on the server: a client-created command leaves the message visible to
  others (answer by 7z99, 2024-07; engine bug by EmeraldSlash 2024-09-30, staff acknowledged, still pending when read). [S20][S21][S97][S98]
- Bans: `Players:BanAsync{UserIds (max 50), Duration (seconds, -1 permanent), DisplayReason (max 400 chars), PrivateReason (max
  1000), ApplyToUniverse (default true), ExcludeAltAccounts (default false), ApplyDeviceBlock (default false)}`, server-only,
  yields; `UnbanAsync{UserIds, ApplyToUniverse}`; `GetBanHistoryAsync(userId)`. Roblox's ban guidelines: rules must be
  accessible and enforced consistently, appeals allowed, and ban messages must not carry personal information or direct
  links. [S9][S61][S86]
- Group roles: `Player:GetRankInGroupAsync` and `GetRoleInGroupAsync` are marked deprecated; staff (2026-07-08) say
  `GroupService:GetRolesInGroupAsync(userId, groupId)` is re-enabled and returns `{IsMember, Roles}` ordered highest to
  lowest with `Id`, `Name`, `Rank`; wrap it in `pcall`. `Player:IsInGroupAsync` is current. [S10][S39][S40]
- Text from users (pet names, announcements, trade notes) must go through `TextService:FilterStringAsync(text,
  fromUserId, context)`; the sender must be in the server; use `GetNonChatStringForBroadcastAsync()` for public text and
  never show text if filtering fails. [S42]
- `HttpService:GenerateGUID(false)` returns a 36-character v4 UUID and works without enabling HTTP requests. [S60]
- Building grid precedent: Roblox's Battle Royale kit uses a 20 x 16 x 20 stud cell (terrain voxel is 4 studs), tiles that
  must connect to the ground or another tile and may not overlap, occupancy and connectivity bitmasks, and a rule that two
  tiles are connected when they share at least two connection points. [S56]
- Community modules worth knowing: `t` (osyrisrblx; runtime type checkers such as `t.strictInterface`, `t.numberConstrained`,
  built to stop malformed remote data) [S77]; ZonePlus v3.2.0 (ForeverHD; zone enter/exit via spatial queries) [S78];
  RbxUtil (Sleitnick; Signal, Trove, Timer, TableUtil, Comm, Spring and more via Wally or Creator Store) [S79]; Cmdr (evaera;
  typed commands, hooks such as `BeforeRun` that can block a command by returning a string; announced 2018 but maintained, latest release
  v1.13.1 on 2024-09-30 with TextChatService support and `ban`/`unban` commands; setup in Recipe 14) [S68][S93]; Adonis (Epix-Incorporated; MIT; set a random `DataStoreKey` and disable debug mode in production) [S70];
  Operator (cb12438, 2026-09-01: roles and audit built in) [S69]; A-Chassis (community open-source car kit) [S90].

## How to apply it (rules for an AI builder)

Architecture
- DO put authority on the server and render on the client: server owns data, stats, prices, cooldowns, hit results; the
  client sends intent (item id, grid cell, aim direction) and draws. DON'T let a remote carry a price, damage, reward,
  target data key or CFrame that the server then trusts. [S59]
- DO create one `Net` module that makes remotes on the server, wraps every handler in a token bucket and `pcall`, and
  clean up per-player state on `PlayerRemoving` (Recipe 0). DO build validators from small helpers (`V.int`, `V.id`,
  `V.str`, `V.vec`) or the `t` library. [S59][S77]
- DO keep numbers a cheater would want (loot tables, code lists, reward tables, weapon stats, admin ids) in `ServerStorage`
  or `ServerScriptService` modules; replicate only display data. [S59]
- DO re-grant Tools on every `CharacterAdded`; DO NOT keep state only inside Tools or the Backpack. [S12]
- DO mutate player data synchronously (no yields between the check and the write) so double-fired remotes cannot double
  spend; put a per-player in-flight flag around any handler that must yield (DataStore call, purchase). [S59]

Per system (numbers are starting points to tune, labelled where invented)
- Inventory: stackables as `{itemId: count}` with a per-item `maxStack` and a distinct-slot cap (suggest 200); unique
  items (pets, weapons with rolls) as `{uid: {id, ...}}` where `uid` is `HttpService:GenerateGUID(false)`. Equip at most 3
  tool ids. [S13][S60]
- Quests: progress is reported only by server code (`Quests.report(player, event, target, n)`), never by a remote; claim
  is a remote that re-checks progress. Dailies: derive the day from `os.time() // 86400` (UTC). For production, evaluate
  Roblox's Missions package first. [S46][S49]
- Daily rewards: server computes the day (UTC) and streak, writes `lastDay` before granting, resets the streak when a
  day is missed; the client countdown is display-only. Roblox's Engagement Rewards package already does this. [S45][S25]
- Codes: normalise (trim, upper-case, max 32 chars, `[A-Z0-9_-]`), one redeem per code per player stored in the profile,
  a 3-second cooldown, same error text for unknown and expired, a global-use cap through `UpdateAsync` on a counter key. [S89]
- Leaderboards: write a score at most every 120 s per player and only if improved, refresh the top 50 every 90 s per
  server with one `GetSortedAsync` call, batch the name lookup (limit 250 per minute), and cache. Rename the store
  (`Kills_v2`) to reset a season. [S44][S41][S66]
- Trading: same-server only unless you build a ledger; both sides see both offers; any offer change resets both locks
  and bumps a `version` that Lock must echo; 5-second confirm countdown; re-validate ownership at commit; do the swap in
  one non-yielding block; save both profiles at once; log every trade with ids and a timestamp. [S59][S87]
- Rounds: one server module owns the loop; publish `RoundState` and `RoundEndsAt` as Workspace attributes so clients
  render timers without remotes; use `Teams` and `SpawnLocation.Neutral` when you need team spawning. [S52][S53]
- NPCs: one scheduler stepping all NPCs every 0.25 s, path recompute no more than about every 0.75 s and only when the
  target moved, `SetNetworkOwner(nil)` on every NPC root, sleep NPCs with no player within twice the aggro range, and use
  `Path.Blocked` with the forward-index check. [S3][S30][S80]
- Melee: server runs a box query (`GetPartBoundsInBox`) in front of the attacker's root after a server-side wind-up delay,
  one hit per target per swing, damage from a server table, cooldown and equipped-tool checks. [S74][S59]
- Ranged: client sends origin and a unit direction; server checks origin near the character, direction magnitude, cooldown,
  ammo and state, then recasts itself. Start with 12 studs of origin tolerance (invented, tune). [S50][S59]
- Vehicles: unanchored assembly; `SetNetworkOwner(driver)` while seated and `SetNetworkOwner(nil)` when empty; a server
  sampler checks speed and teleport distance four times a second; one vehicle per player with a spawn cooldown. [S30][S31][S85]
- Placement: the client sends integer grid cell and rotation index (0 to 3), never a CFrame; the server rebuilds the CFrame
  from the plot origin, checks bounds, reach, ownership and overlap with `GetPartBoundsInBox`, then stores the integers. [S56]
- Companions: render pets on the client from a replicated list (Player attributes); the server validates equips; pets are
  anchored, non-colliding client instances. [S83]
- Admin: roles from `game.CreatorId` plus `GroupService:GetRolesInGroupAsync`; commands as server-side `TextChatCommand`s;
  a command may only target a lower level; log every use. Use `Players:BanAsync` rather than a DataStore ban list. [S9][S20][S39]
- Notifications: server decides and sends `kind` plus server-authored text; client queues toasts; filter any text that
  contains user input; ask for out-of-experience opt-in only after a moment of value. [S27][S42]

Don'ts that recur
- DON'T trust `Tool.Activated`-style client signals without server checks; DON'T trust `Touched` for damage. [S74][S59]
- DON'T use `RemoteFunction:InvokeClient`. DON'T poll with `while true do task.wait()` where an event or attribute exists
  (round timers excepted). DON'T use `wait`, `spawn`, `delay`; use `task.*`. [S91]
- DON'T create DataStore keys per feature per player when one profile key holds it; DON'T write on every pickup. [S91]

## Recipes (each becomes a skill)

Folder layout assumed by all recipes (ties to Recipe 9 of `04-luau-architecture.md`):
`ServerScriptService/Server` (Script, RunContext Server) requires modules in `ServerScriptService/Services`;
`ServerScriptService/Net` and `.../V` are the shared helpers below; `ServerStorage/Config/*` holds secret tables;
`ReplicatedStorage/Shared/*` holds display data and pure functions; `ReplicatedStorage/Remotes` is created by `Net`.

### Recipe 0: Shared kit (Net, validators, data shape, rewards)
When to use: first, before any system below. Every other recipe calls these.
Server/client split: server creates remotes and owns data; client fires intents and renders snapshots the server sends.
Data shape (one ProfileStore profile per player, `ProfileStore.New` plus `StartSessionAsync`, see `04` and [S67]): 
```luau
--!strict
-- ServerScriptService/Services/PlayerData.luau exports this shape; get() returns profile.Data or nil while loading
export type QuestState = { progress: number, day: number }
export type Data = {
	Coins: number,
	Gems: number,
	Inventory: { [string]: number },                 -- stackables: itemId -> count
	Equipped: { string },                            -- tool item ids, max 3
	Quests: { active: { [string]: QuestState }, claimed: { [string]: number } },
	Daily: { lastDay: number, streak: number },
	Codes: { [string]: boolean },
	Plot: { { id: string, gx: number, gz: number, rot: number } },
	Pets: { owned: { [string]: number }, equipped: { string } },
}
-- API used below: PlayerData.get(player): Data?, PlayerData.save(player): boolean
```
Steps and code:
```luau
--!strict
-- ServerScriptService/Net.luau (ModuleScript)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remotes = ReplicatedStorage:FindFirstChild("Remotes") or Instance.new("Folder")
remotes.Name = "Remotes"
remotes.Parent = ReplicatedStorage

type Bucket = { tokens: number, last: number }
local buckets: { [string]: { [Player]: Bucket } } = {}

local function allow(name: string, player: Player, ratePerSec: number, burst: number): boolean
	local perRemote = buckets[name]
	if not perRemote then
		perRemote = {}
		buckets[name] = perRemote
	end
	local now = os.clock()
	local b = perRemote[player]
	if not b then
		b = { tokens = burst, last = now }
		perRemote[player] = b
	end
	b.tokens = math.min(burst, b.tokens + (now - b.last) * ratePerSec)
	b.last = now
	if b.tokens < 1 then
		return false
	end
	b.tokens -= 1
	return true
end

local Net = {}

function Net.event(name: string): RemoteEvent
	local existing = remotes:FindFirstChild(name)
	if existing then
		return existing :: RemoteEvent
	end
	local ev = Instance.new("RemoteEvent")
	ev.Name = name
	ev.Parent = remotes
	return ev
end

-- handler receives the player and RAW client arguments: it must validate every one of them.
function Net.listen(name: string, ratePerSec: number, burst: number, handler: (Player, ...any) -> ())
	Net.event(name).OnServerEvent:Connect(function(player: Player, ...: any)
		if not allow(name, player, ratePerSec, burst) then
			return
		end
		local ok, err = pcall(handler, player, ...)
		if not ok then
			warn(`[Net:{name}] {err}`)
		end
	end)
end

Players.PlayerRemoving:Connect(function(player: Player)
	for _, perRemote in buckets do
		perRemote[player] = nil
	end
end)

return Net
```
```luau
--!strict
-- ServerScriptService/V.luau: tiny validators (NaN-safe). Or use osyrisrblx/t for declarative checks. [S77]
local V = {}

function V.int(x: any, lo: number, hi: number): number?
	if type(x) == "number" and math.isfinite(x) and x % 1 == 0 and x >= lo and x <= hi then
		return x
	end
	return nil
end

function V.str(x: any, maxLen: number): string?
	if type(x) == "string" and #x >= 1 and #x <= maxLen and utf8.len(x) ~= nil then
		return x
	end
	return nil
end

function V.id(x: any): string? -- item, quest, pet, weapon ids
	local s = V.str(x, 40)
	if s and s:match("^[%w_]+$") then
		return s
	end
	return nil
end

function V.vec(x: any, maxAbs: number): Vector3?
	if typeof(x) == "Vector3" and math.isfinite(x.X) and math.isfinite(x.Y) and math.isfinite(x.Z)
		and x.Magnitude <= maxAbs then
		return x
	end
	return nil
end

return V
```
```luau
--!strict
-- ServerScriptService/Services/Rewards.luau: one place that grants any reward table (quests, dailies, codes, rounds)
local PlayerData = require(script.Parent.PlayerData)
local Inventory = require(script.Parent.Inventory)

export type Reward = { Coins: number?, Gems: number?, Items: { [string]: number }? }
local Rewards = {}

function Rewards.give(player: Player, reward: Reward): boolean
	local d = PlayerData.get(player)
	if not d then
		return false
	end
	d.Coins += reward.Coins or 0
	d.Gems += reward.Gems or 0
	for itemId, n in reward.Items or {} do
		Inventory.add(player, itemId, n) -- returns false when full; handle by mailing or capping in your design
	end
	local stats = player:FindFirstChild("leaderstats")
	local coins = stats and stats:FindFirstChild("Coins")
	if coins and coins:IsA("IntValue") then
		coins.Value = d.Coins -- display mirror only; never read it back as truth [S43]
	end
	return true
end

return Rewards
```
Pitfalls: a handler that yields before it writes lets a double-fire pass the check twice (write first, then yield); clients
`WaitForChild` remotes forever if the server errors during boot, so require every service that creates remotes in the first
lines of `Server`; leaderstats values are a mirror, not the source. [S43][S59]
Test in Studio: Test tab > Clients and Servers with 2 players; from the client command bar fire each remote with
`nil`, `0/0`, `math.huge`, `-1`, `{}`, a 10,000-character string, and 100 calls in a loop; expect no server error output
beyond the `warn`, no state change, and throttling after the burst.

### Recipe 1: Inventory and hotbar (server-authoritative, data-driven)
When to use: any game with items, tools, consumables or equipment.
Server/client split: server owns `Data.Inventory` and `Data.Equipped`, grants Tools, validates equip; client shows a
snapshot (`InventorySync`) and sends `Equip(itemId, slot)`. Roblox's default backpack is fine for a handful of tools (rule of thumb, not from the docs); build a
custom hotbar (disable the default with `StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)`) when you need
stacks, drag-and-drop or more than ten slots. [S12][S13]
Data shape: stackables `Inventory[itemId] = count`; items with per-instance stats use `Instances[uid] = {id=..., level=...}`
with `uid = HttpService:GenerateGUID(false)`; never store Instances or functions in data. Item definitions live in
`ServerStorage/Config/ItemDefs` (name, maxStack, tool template name, tradeable, sell price) and a display-only copy of
name and icon in `ReplicatedStorage/Shared/ItemDisplay`. Tool templates live in `ServerStorage/Tools`, named by item id,
each with a `Handle` (or `RequiresHandle = false`), no anchored parts. [S13][S14]
```luau
--!strict
-- ServerScriptService/Services/Inventory.luau
local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local PlayerData = require(script.Parent.PlayerData)

type Def = { name: string, maxStack: number, tool: boolean, tradeable: boolean }
local ItemDefs = require(ServerStorage.Config.ItemDefs) :: { [string]: Def }
local toolTemplates = ServerStorage:WaitForChild("Tools")
local MAX_EQUIPPED, MAX_DISTINCT = 3, 200

local Inventory = {}

local function distinctCount(inv: { [string]: number }): number
	local n = 0
	for _ in inv do
		n += 1
	end
	return n
end

function Inventory.sync(player: Player)
	local d = PlayerData.get(player)
	if d then
		Net.event("InventorySync"):FireClient(player, d.Inventory, d.Equipped)
	end
end

function Inventory.add(player: Player, itemId: string, n: number): boolean
	local d, def = PlayerData.get(player), ItemDefs[itemId]
	if not d or not def or n < 1 or n % 1 ~= 0 then
		return false
	end
	local have = d.Inventory[itemId] or 0
	if (have == 0 and distinctCount(d.Inventory) >= MAX_DISTINCT) or have + n > def.maxStack then
		return false
	end
	d.Inventory[itemId] = have + n
	Inventory.sync(player)
	return true
end

function Inventory.remove(player: Player, itemId: string, n: number): boolean
	local d = PlayerData.get(player)
	local have = d and d.Inventory[itemId] or 0
	if not d or n < 1 or have < n then
		return false
	end
	d.Inventory[itemId] = if have - n == 0 then nil else have - n
	if not d.Inventory[itemId] then -- an unequipped-by-removal item must leave the hotbar too
		local i = table.find(d.Equipped, itemId)
		if i then
			table.remove(d.Equipped, i)
		end
	end
	Inventory.sync(player)
	return true
end

function Inventory.has(player: Player, itemId: string, n: number): boolean
	local d = PlayerData.get(player)
	return d ~= nil and (d.Inventory[itemId] or 0) >= n
end

local function giveTools(player: Player)
	local d = PlayerData.get(player)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not d or not backpack then
		return
	end
	for _, container in { backpack, player.Character } do
		if container then
			for _, child in container:GetChildren() do
				if child:IsA("Tool") and child:GetAttribute("ItemId") then
					child:Destroy()
				end
			end
		end
	end
	for _, itemId in d.Equipped do
		local template = toolTemplates:FindFirstChild(itemId)
		if template and template:IsA("Tool") and Inventory.has(player, itemId, 1) then
			local tool = template:Clone()
			tool:SetAttribute("ItemId", itemId) -- server-set; other systems read this, never a client claim
			tool.Parent = backpack
		end
	end
end

Net.listen("Equip", 4, 8, function(player, itemId: any, slot: any)
	local id, s = V.id(itemId), V.int(slot, 1, MAX_EQUIPPED)
	local d = PlayerData.get(player)
	if not id or not s or not d then
		return
	end
	local def = ItemDefs[id]
	if not def or not def.tool or not Inventory.has(player, id, 1) then
		return
	end
	local existing = table.find(d.Equipped, id)
	if existing then
		table.remove(d.Equipped, existing)
	end
	table.insert(d.Equipped, math.min(s, #d.Equipped + 1), id)
	while #d.Equipped > MAX_EQUIPPED do
		table.remove(d.Equipped)
	end
	giveTools(player)
	Inventory.sync(player)
end)

local function onPlayer(player: Player)
	player.CharacterAdded:Connect(function()
		task.defer(giveTools, player) -- Backpack is rebuilt on spawn; grant after it exists [S12]
	end)
end
for _, p in Players:GetPlayers() do
	onPlayer(p)
end
Players.PlayerAdded:Connect(onPlayer)

return Inventory
```
Client: listens to `InventorySync`, draws slots from `ReplicatedStorage/Shared/ItemDisplay`; a hotbar button fires
`Equip(itemId, slot)`. Tool use stays Tool-based: LocalScript `Activated` -> RemoteEvent -> server action.
World pickups: tag pickup spawner parts, clone a visual-only model, and grant on a server-side `ProximityPrompt.Triggered` after re-checking distance;
Roblox's Battle Royale kit does exactly this with `PickupSpawner` tags and rarity tags [S57][S11].
Pitfalls: Tools in the Backpack vanish on death, so rebuild from data; a Tool granted from a client-supplied name lets
exploiters hand themselves admin tools (look up by id in `ServerStorage` only); a `RemoteFunction` for "give me my
inventory" can be spammed (use event + push); stack overflow numbers (inf) in `add` (the integer and range checks above);
duplicating by dropping: if you allow drop (`CanBeDropped`), route it through `remove` first and set `CanBeDropped = false`
on Tools you do not want in the world. [S13][S14]
Test in Studio: add 100 of a `maxStack = 99` item (expect failure), equip the same item twice, die and respawn (tools return),
remove an equipped item (leaves the hotbar), fire `Equip` with a tool id you do not own, and rejoin to confirm persistence.

### Recipe 2: Quests, dailies and achievements (data-driven, event-reported)
When to use: any game that wants goals, tutorials or a daily drip. If you want a full UI, season XP and analytics for free,
install Roblox's Missions and Season Passes packages instead; this recipe is the in-house, minimal version. [S46][S47][S49]
Server/client split: all definitions and progress logic server-side; the client sees a `QuestSync` snapshot and sends
`AcceptQuest(id)` and `ClaimQuest(id)`; progress is reported only by server gameplay code via `Quests.report`.
Data shape: `ServerStorage/Config/QuestDefs`: 
```luau
return {
	zombie_hunt = { title = "Zombie hunter", kind = "daily", event = "kill", target = "Zombie", goal = 5, reward = { Coins = 250 } },
	first_house = { title = "Home owner", kind = "story", event = "place", target = "*", goal = 1, reward = { Gems = 5 }, prereq = nil },
}
```
Profile: `Quests.active[questId] = {progress, day}`, `Quests.claimed[questId] = day claimed (or 1 for one-time)`.
```luau
--!strict
-- ServerScriptService/Services/Quests.luau
local ServerStorage = game:GetService("ServerStorage")
local Players = game:GetService("Players")
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local PlayerData = require(script.Parent.PlayerData)
local Rewards = require(script.Parent.Rewards)

type Def = { title: string, kind: string, event: string, target: string, goal: number, reward: Rewards.Reward, prereq: string? }
local Defs = require(ServerStorage.Config.QuestDefs) :: { [string]: Def }
local MAX_ACTIVE = 6
local DAILIES_PER_DAY = 3

local Quests = {}

local function today(): number
	return os.time() // 86400 -- UTC day number [S25]
end

local function push(player: Player)
	local d = PlayerData.get(player)
	if d then
		Net.event("QuestSync"):FireClient(player, d.Quests.active, d.Quests.claimed, today())
	end
end

local function refreshDailies(player: Player)
	local d = PlayerData.get(player)
	if not d then
		return
	end
	local day = today()
	for id, st in d.Quests.active do
		if Defs[id] and Defs[id].kind == "daily" and st.day ~= day then
			d.Quests.active[id] = nil
		end
	end
	local pool = {}
	for id, def in Defs do
		if def.kind == "daily" then
			table.insert(pool, id)
		end
	end
	table.sort(pool) -- deterministic order, then a day-seeded shuffle: everyone gets the same dailies
	local rng = Random.new(day)
	for _ = 1, DAILIES_PER_DAY do
		if #pool == 0 then
			break
		end
		local id = table.remove(pool, rng:NextInteger(1, #pool)) :: string
		if d.Quests.claimed[id] ~= day and not d.Quests.active[id] then
			d.Quests.active[id] = { progress = 0, day = day }
		end
	end
end

-- Called by SERVER gameplay code only (NPC death, item placed, coin collected). There is no remote for this.
function Quests.report(player: Player, event: string, target: string, amount: number)
	local d = PlayerData.get(player)
	if not d or amount < 1 then
		return
	end
	for id, st in d.Quests.active do
		local def = Defs[id]
		if def and def.event == event and (def.target == target or def.target == "*") then
			st.progress = math.min(def.goal, st.progress + amount)
		end
	end
	push(player)
end

Net.listen("AcceptQuest", 2, 4, function(player, questId: any)
	local id, d = V.id(questId), PlayerData.get(player)
	local def = id and Defs[id]
	if not id or not d or not def or def.kind == "daily" then
		return -- dailies are assigned, not accepted
	end
	local n = 0
	for _ in d.Quests.active do
		n += 1
	end
	if d.Quests.active[id] or d.Quests.claimed[id] or n >= MAX_ACTIVE then
		return
	end
	if def.prereq and not d.Quests.claimed[def.prereq] then
		return
	end
	d.Quests.active[id] = { progress = 0, day = today() }
	push(player)
end)

Net.listen("ClaimQuest", 2, 4, function(player, questId: any)
	local id, d = V.id(questId), PlayerData.get(player)
	local def = id and Defs[id]
	local st = id and d and d.Quests.active[id]
	if not id or not d or not def or not st or st.progress < def.goal then
		return
	end
	d.Quests.active[id] = nil -- remove BEFORE granting: a double-fire finds nothing to claim
	d.Quests.claimed[id] = if def.kind == "daily" then today() else 1
	Rewards.give(player, def.reward)
	push(player)
end)

function Quests.onLoaded(player: Player) -- call from PlayerData after the profile loads
	refreshDailies(player)
	push(player)
end

return Quests
```
Wiring: `Quests.report(killer, "kill", "Zombie", 1)` in the NPC death handler (Recipe 8); badges for long-term goals:
`BadgeService:AwardBadgeAsync(player.UserId, badgeId)` inside `pcall`, at most once, server only (50 + 35 x users per minute). [S37]
Pitfalls: a client-reported "I killed 5 zombies" remote (exploiters finish every quest instantly); not clamping
`progress` to `goal`; dailies reset by comparing client time; long-term quests with a prerequisite loop; showing progress
bars from `progress / goal` when `goal` is nil on stale clients (send goals in `QuestSync` or share a display table).
Test in Studio: set the clock forward by editing `today()` to `os.time() // 86400 + 1` to confirm dailies rotate and a
claimed daily can be claimed again; fire `ClaimQuest` with progress 4 of 5 (expect nothing); fire it twice quickly (one grant).

### Recipe 3: Daily login rewards with streaks
When to use: retention drip (one reward per UTC day, growing with consecutive days). For a ready-made UI and analytics use
Roblox's Engagement Rewards package (Daily rewards persist; Time rewards reset per session). [S45]
Server/client split: server computes eligibility and grants; client shows the 7-day strip and a countdown.
Data shape: `Daily = {lastDay: number, streak: number}` (days since Unix epoch, UTC). Reward table in
`ServerStorage/Config/DailyRewards` (array of `Rewards.Reward`, e.g. 7 entries; day 7 is the jackpot).
```luau
--!strict
-- ServerScriptService/Services/DailyRewards.luau
local ServerStorage = game:GetService("ServerStorage")
local Net = require(script.Parent.Parent.Net)
local PlayerData = require(script.Parent.PlayerData)
local Rewards = require(script.Parent.Rewards)

local TABLE = require(ServerStorage.Config.DailyRewards) :: { Rewards.Reward }
local DAY = 86400

local function utcDay(): number
	return os.time() // DAY
end

local DailyRewards = {}

function DailyRewards.push(player: Player)
	local d = PlayerData.get(player)
	if d then
		local canClaim = d.Daily.lastDay < utcDay()
		-- nextReset is an absolute Unix time; the client subtracts workspace:GetServerTimeNow() for display only [S33]
		Net.event("DailySync"):FireClient(player, canClaim, d.Daily.streak, (utcDay() + 1) * DAY)
	end
end

Net.listen("ClaimDaily", 1, 2, function(player)
	local d = PlayerData.get(player)
	if not d then
		return
	end
	local day = utcDay()
	if d.Daily.lastDay >= day then
		return -- already claimed today (>= also blocks a clock that moved backwards)
	end
	d.Daily.streak = if d.Daily.lastDay == day - 1 then d.Daily.streak + 1 else 1
	d.Daily.lastDay = day -- write BEFORE granting: no yield between the check and this write
	Rewards.give(player, TABLE[(d.Daily.streak - 1) % #TABLE + 1])
	DailyRewards.push(player)
end)

return DailyRewards
```
Steps: call `DailyRewards.push(player)` after the profile loads; open the UI automatically only if `canClaim`. Optional grace:
keep a `shields` counter that forgives one missed day (`if lastDay == day - 2 and shields > 0`), sold as a product.
Rolling 24-hour variant: store `nextClaimAt = os.time() + 86400` and reset the streak when `os.time() > nextClaimAt + 86400`;
it avoids a midnight-UTC reset at an odd local hour but is harder to explain.
Pitfalls: using `DateTime.now()` or a client clock (players change device time; on the server it is the server clock, which is
fine) [S24][S25]; granting before recording; forgetting that UTC midnight is mid-afternoon or night for many players, so
show the countdown; running the claim as a `RemoteFunction`; per-session Time rewards stored in the profile (they reset).
Test in Studio: temporarily make `utcDay` return a variable you bump from the command bar; claim, bump +1 (streak 2), bump +3
(streak 1), claim twice in one day (second ignored), and a backwards bump (ignored).

### Recipe 4: Redeem codes (promo codes) with per-player and global limits
When to use: social/marketing codes ("RELEASE", "100K") that give a one-time reward.
Server/client split: client sends the raw text; server normalises, checks, grants and replies with a status string; the code
table never leaves `ServerStorage`. Changing codes without a republish: load the table from a DataStore or MemoryStore
at boot and every 5 minutes (not shown). [S89]
```luau
--!strict
-- ServerScriptService/Services/Codes.luau
local ServerStorage = game:GetService("ServerStorage")
local DataStoreService = game:GetService("DataStoreService")
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local PlayerData = require(script.Parent.PlayerData)
local Rewards = require(script.Parent.Rewards)

type CodeDef = { reward: Rewards.Reward, expiresAt: number?, maxUses: number? }
local CODES = require(ServerStorage.Config.Codes) :: { [string]: CodeDef } -- keys are UPPER-CASE
local uses = DataStoreService:GetDataStore("CodeUses_v1")
local inFlight: { [Player]: boolean } = {}

local function normalize(raw: any): string?
	local s = V.str(raw, 32)
	if not s then
		return nil
	end
	local trimmed = (s:match("^%s*(.-)%s*$") or ""):upper()
	if trimmed ~= "" and trimmed:match("^[A-Z0-9_%-]+$") then
		return trimmed
	end
	return nil
end

local function reply(player: Player, status: string)
	Net.event("CodeResult"):FireClient(player, status)
end

Net.listen("RedeemCode", 0.34, 2, function(player, raw: any) -- ~1 per 3 s sustained, burst 2
	local code = normalize(raw)
	local def = code and CODES[code]
	local d = PlayerData.get(player)
	if not code or not def or not d then
		return reply(player, "invalid") -- same text for unknown, so codes cannot be enumerated
	end
	if def.expiresAt and os.time() >= def.expiresAt then
		return reply(player, "invalid")
	end
	if d.Codes[code] then
		return reply(player, "used")
	end
	if inFlight[player] then
		return
	end
	inFlight[player] = true
	d.Codes[code] = true -- reserve first; no yield between the check above and this write
	local granted = true
	if def.maxUses then
		local maxUses = def.maxUses
		granted = false
		local ok = pcall(function()
			uses:UpdateAsync(code, function(old: number?): number?
				local n = old or 0
				if n >= maxUses then
					granted = false
					return nil -- cancels the write
				end
				granted = true
				return n + 1
			end)
		end)
		granted = ok and granted
	end
	inFlight[player] = nil
	if not granted then
		d.Codes[code] = nil
		return reply(player, "unavailable")
	end
	Rewards.give(player, def.reward)
	reply(player, "ok")
end)
```
Pitfalls: removing a redeemed code from a server-local table (other servers still accept it) [S89]; case or whitespace variants
redeeming twice (normalise first); a client-side code list; brute-force guessing (the rate limit, the identical `invalid`
reply, and short-lived codes); `UpdateAsync` callback yielding; consuming global uses and then losing the player mid-yield (rare;
log it). Keep ids of redeemed codes in the profile forever so retired codes cannot be reused.
Test in Studio: redeem `release`, ` RELEASE `, `RELEASE` (second and third say `used`), an expired code, a 5,000-character string,
`nil`, and a table; set `maxUses = 1` and redeem from two clients (one wins).

### Recipe 5: Leaderboards (session board, global all-time, seasonal)
When to use: any competitive stat. Three tiers: (1) `leaderstats` for the in-server player list; (2) an `OrderedDataStore` for a
global top 50; (3) a new store name per season (`Kills_2026w41`) for resets. For very hot or short boards use a MemoryStore
SortedMap with an expiration and flush to the ordered store occasionally. [S43][S44][S62][S66]
Server/client split: server writes scores (throttled) and reads the top list on a timer; client only renders what the server
pushes (`LeaderboardSync`); display names come from one batched call.
```luau
--!strict
-- ServerScriptService/Services/Leaderboards.luau
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local UserService = game:GetService("UserService")
local Net = require(script.Parent.Parent.Net)

local STORE_NAME = "Kills_v1" -- change the name to start a new season
local TOP_N, REFRESH_SECONDS, MIN_WRITE_GAP = 50, 90, 120

type Row = { userId: number, name: string, score: number }
local store = DataStoreService:GetOrderedDataStore(STORE_NAME)
local lastWrite: { [number]: number } = {}
local names: { [number]: string } = {}
local top: { Row } = {}

local Leaderboards = {}

function Leaderboards.submit(player: Player, score: number, force: boolean?)
	if not math.isfinite(score) or score < 0 then
		return
	end
	local now = os.clock()
	if not force and now - (lastWrite[player.UserId] or -math.huge) < MIN_WRITE_GAP then
		return
	end
	lastWrite[player.UserId] = now
	local value = math.floor(score) -- ordered stores hold integers only [S66]
	pcall(function()
		store:UpdateAsync(tostring(player.UserId), function(old: number?): number?
			if old and old >= value then
				return nil -- keep the best score
			end
			return value
		end)
	end)
end

local function resolveNames(ids: { number })
	local missing = {}
	for _, id in ids do
		if not names[id] then
			table.insert(missing, id)
		end
	end
	if #missing == 0 then
		return
	end
	local ok, infos = pcall(function()
		return UserService:GetUserInfosByUserIdsAsync(missing) -- batch; limited to 250 per minute [S41]
	end)
	if ok then
		for _, info in infos do
			names[info.Id] = info.DisplayName
		end
	end
end

local function refresh()
	local ok, pages = pcall(function()
		return store:GetSortedAsync(false, TOP_N)
	end)
	if not ok then
		return
	end
	local entries = pages:GetCurrentPage()
	local ids = {}
	for _, e in entries do
		table.insert(ids, tonumber(e.key) or 0)
	end
	resolveNames(ids)
	local rows: { Row } = {}
	for _, e in entries do
		local id = tonumber(e.key) or 0
		table.insert(rows, { userId = id, name = names[id] or "Player", score = e.value })
	end
	top = rows
	Net.event("LeaderboardSync"):FireAllClients(top)
end

task.spawn(function()
	while true do
		refresh()
		task.wait(REFRESH_SECONDS)
	end
end)
Players.PlayerAdded:Connect(function(player: Player)
	Net.event("LeaderboardSync"):FireClient(player, top)
end)
Players.PlayerRemoving:Connect(function(player: Player)
	lastWrite[player.UserId] = nil
end)

return Leaderboards
```
Call `Leaderboards.submit(player, d.Stats.Kills)` on a milestone, every few minutes, and with `force = true` in `PlayerRemoving`
(budget permitting). In-server board: `leaderstats` folder + IntValues created in `PlayerAdded`, mirrored from profile data,
with `IsPrimary` or `Priority` to choose the first column. [S43]
Pitfalls: writing on every kill (budgets: ordered store limits equal the standard formulas, see `04`), calling
`GetNameFromUserIdAsync` per row as the official tutorial does (50 web calls per refresh) [S44], trusting `leaderstats` as truth
(a client cannot change server values, but your own code may), floats (rounded), negative scores, resetting by deleting keys
(rename the store), putting display names in the DataStore (names change; store ids).
Test in Studio: enable API access (File > Experience Settings > Security), submit scores for several fake user ids from the
command bar (`store:SetAsync("1", 500)` etc.), watch `refresh` print order and the client list; call `submit` 10 times in a
loop (only the first writes).

### Recipe 6: Player-to-player trading (same server, two-phase confirm)
When to use: pets, weapons, collectibles. Cross-server trading needs a ledger (below) because session-locked profiles can only be
edited by the server that owns them. Add trade restrictions for new accounts and rare items (account age, level) and a trade
log players can review (Adopt Me's trade license, per the developer's own post of 2020-11-05, is a three-question quiz in a Safety Hub, retakeable without
limit, that unlocks trading Legendary and Ultra-rare pets, gives a 30-day trade history from which scammers can be reported, and an unfair
trade shows a warning popup to both players; stale, 2020; the 2026-07-31 Trading Hub notes add a 2-hour playtime gate and listing rules). [S87][S99]
Server/client split: the server holds the trade object and both offers; clients send intents (`TradeInvite`, `TradeRespond`,
`TradeOffer`, `TradeLock`, `TradeCancel`) and receive `TradeState` snapshots. Anti-scam rules: any change resets both locks and bumps
`version`; `TradeLock` must echo the current `version`; a 5-second countdown runs after both lock and aborts on any change;
ownership is re-validated at commit.
```luau
--!strict
-- ServerScriptService/Services/Trading.luau (offer = itemId -> count)
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local PlayerData = require(script.Parent.PlayerData)
local Inventory = require(script.Parent.Inventory)

local ItemDefs = require(ServerStorage.Config.ItemDefs) :: { [string]: { maxStack: number, tradeable: boolean } }
local MAX_DISTINCT_PER_SIDE, MAX_DISTANCE, COUNTDOWN, INVITE_TTL = 8, 40, 5, 30

type Offer = { [string]: number }
type Trade = {
	id: string, a: Player, b: Player, offerA: Offer, offerB: Offer,
	lockedA: boolean, lockedB: boolean, version: number, committing: boolean,
}
local trades: { [string]: Trade } = {}
local tradeOf: { [Player]: Trade } = {}
local invites: { [Player]: { from: Player, at: number } } = {} -- keyed by the invited player

local function snapshot(t: Trade, viewer: Player)
	local mine = if viewer == t.a then t.offerA else t.offerB
	local theirs = if viewer == t.a then t.offerB else t.offerA
	local myLock = if viewer == t.a then t.lockedA else t.lockedB
	local theirLock = if viewer == t.a then t.lockedB else t.lockedA
	local other = if viewer == t.a then t.b else t.a
	return { version = t.version, partner = other.UserId, mine = mine, theirs = theirs, myLock = myLock, theirLock = theirLock }
end

local function broadcast(t: Trade)
	Net.event("TradeState"):FireClient(t.a, snapshot(t, t.a))
	Net.event("TradeState"):FireClient(t.b, snapshot(t, t.b))
end

local function close(t: Trade, reason: string)
	trades[t.id] = nil
	tradeOf[t.a], tradeOf[t.b] = nil, nil
	for _, p in { t.a, t.b } do
		if p.Parent == Players then
			Net.event("TradeClosed"):FireClient(p, reason)
		end
	end
end

local function touch(t: Trade) -- any change: unlock both, new version
	t.lockedA, t.lockedB = false, false
	t.version += 1
	broadcast(t)
end

local function canReceive(inv: { [string]: number }, give: Offer, get: Offer): boolean
	for id, n in get do
		local def = ItemDefs[id]
		if not def or (inv[id] or 0) - (give[id] or 0) + n > def.maxStack then
			return false
		end
	end
	return true
end

local function owns(inv: { [string]: number }, offer: Offer): boolean
	for id, n in offer do
		if (inv[id] or 0) < n then
			return false
		end
	end
	return true
end

local function commit(t: Trade)
	if t.committing or trades[t.id] ~= t then
		return
	end
	t.committing = true
	local da, db = PlayerData.get(t.a), PlayerData.get(t.b)
	if not da or not db or t.a.Parent ~= Players or t.b.Parent ~= Players then
		return close(t, "partner left")
	end
	if not owns(da.Inventory, t.offerA) or not owns(db.Inventory, t.offerB)
		or not canReceive(da.Inventory, t.offerA, t.offerB) or not canReceive(db.Inventory, t.offerB, t.offerA) then
		return close(t, "invalid offer")
	end
	-- From here to the end of the swap there is NO yield: both inventories change in the same frame.
	for id, n in t.offerA do
		da.Inventory[id] = if da.Inventory[id] - n == 0 then nil else da.Inventory[id] - n
		db.Inventory[id] = (db.Inventory[id] or 0) + n
	end
	for id, n in t.offerB do
		db.Inventory[id] = if db.Inventory[id] - n == 0 then nil else db.Inventory[id] - n
		da.Inventory[id] = (da.Inventory[id] or 0) + n
	end
	warn(`[trade] {t.id} {t.a.UserId}<->{t.b.UserId} {HttpService:JSONEncode({ a = t.offerA, b = t.offerB })} at {os.time()}`)
	task.spawn(PlayerData.save, t.a) -- save both immediately (no cross-key transaction exists; see ledger note)
	task.spawn(PlayerData.save, t.b)
	Inventory.sync(t.a)
	Inventory.sync(t.b)
	close(t, "completed")
end

Net.listen("TradeInvite", 1, 2, function(player, targetUserId: any)
	local uid = V.int(targetUserId, 1, 2 ^ 52)
	local target = uid and Players:GetPlayerByUserId(uid)
	local c1, c2 = player.Character, target and target.Character
	local r1 = c1 and c1:FindFirstChild("HumanoidRootPart") :: BasePart?
	local r2 = c2 and c2:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not target or target == player or tradeOf[player] or tradeOf[target] or not r1 or not r2 then
		return
	end
	if (r1.Position - r2.Position).Magnitude > MAX_DISTANCE then
		return
	end
	invites[target] = { from = player, at = os.clock() }
	Net.event("TradeInvited"):FireClient(target, player.UserId)
end)

Net.listen("TradeRespond", 1, 2, function(player, accept: any)
	local inv = invites[player]
	invites[player] = nil
	if accept ~= true or not inv then
		return
	end
	if os.clock() - inv.at > INVITE_TTL or inv.from.Parent ~= Players then
		return
	end
	if tradeOf[player] or tradeOf[inv.from] then
		return
	end
	local t: Trade = {
		id = HttpService:GenerateGUID(false), a = inv.from, b = player, offerA = {}, offerB = {},
		lockedA = false, lockedB = false, version = 0, committing = false,
	}
	trades[t.id], tradeOf[t.a], tradeOf[t.b] = t, t, t
	broadcast(t)
end)

Net.listen("TradeOffer", 6, 12, function(player, itemId: any, count: any)
	local t, id, n = tradeOf[player], V.id(itemId), V.int(count, 0, 99)
	local d = PlayerData.get(player)
	if not t or t.committing or not id or not n or not d then
		return
	end
	local def = ItemDefs[id]
	if not def or not def.tradeable then
		return
	end
	local offer = if player == t.a then t.offerA else t.offerB
	local distinct = 0
	for _ in offer do
		distinct += 1
	end
	if n > (d.Inventory[id] or 0) or (n > 0 and not offer[id] and distinct >= MAX_DISTINCT_PER_SIDE) then
		return
	end
	offer[id] = if n == 0 then nil else n
	touch(t)
end)

Net.listen("TradeLock", 3, 6, function(player, version: any)
	local t = tradeOf[player]
	if not t or t.committing or version ~= t.version then
		return -- stale view of the offers: refuse
	end
	if player == t.a then t.lockedA = true else t.lockedB = true end
	broadcast(t)
	if t.lockedA and t.lockedB then
		local v = t.version
		task.delay(COUNTDOWN, function()
			if trades[t.id] == t and t.version == v and t.lockedA and t.lockedB then
				commit(t)
			end
		end)
	end
end)

Net.listen("TradeCancel", 2, 4, function(player)
	local t = tradeOf[player]
	if t and not t.committing then
		close(t, "cancelled")
	end
end)

Players.PlayerRemoving:Connect(function(player: Player)
	invites[player] = nil
	local t = tradeOf[player]
	if t and not t.committing then
		close(t, "partner left")
	end
end)
```
High-value or cross-server trades: write-ahead ledger (saga). (1) `UpdateAsync` a durable record `Trade_{id} = {a, b, offerA, offerB, state="committed"}` and
append the id to `Pending_{userId}` for both users; (2) apply the swap in memory and add the id to each profile's `AppliedTrades`
(keep the last 50); (3) on every profile load, replay any pending id missing from `AppliedTrades`, then clear it. Without this, a
crash between the two profile saves can duplicate or delete items; the simple in-memory path above narrows the window to the
duration of two parallel saves but does not remove it. [S87][S91]
Pitfalls: NaN or negative counts in offers (the docs' own vulnerable example is a trade offer: `V.int` rejects them) [S59];
changing an offer after locking (touch resets locks, `version` must match); trading to a partner who left; items with unique
stats merged into stacks; trading currency without caps; offering items equipped or in an active listing.
Test in Studio: two clients; lock both then change an offer within 5 s (countdown aborts); fire `TradeLock` with an old version;
offer 10 distinct items; offer 1e308 and NaN; invite from 200 studs away; disconnect one client mid-countdown; check both
inventories and the printed trade log after commit; kill the server (stop Play) between saves in a test and confirm no
duplication in your recovery path.

### Recipe 7: Rounds, lobbies and matches
When to use: minigame rotations, battle-royale-lite, hide and seek, PvP arenas. If lobby and match are separate places, queue in
MemoryStore and teleport with `TeleportAsync` into a reserved server (see `04` Recipe 7); Roblox's Duvall Drive demo does the same
with a state machine plus reserved-server teleport. [S58][S62][S63]
Server/client split: one server module owns state; it publishes `RoundState` and `RoundEndsAt` as attributes on `Workspace`
(attributes replicate to clients and fire change signals), plus `RoundWinner` (user id) at the end; clients render timers from
`RoundEndsAt - workspace:GetServerTimeNow()` and need no remotes. Per-round data lives in a local table, not in attributes the
client could read as truth. [S33][S52]
```luau
--!strict
-- ServerScriptService/Services/Rounds.luau
local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")
local Rewards = require(script.Parent.Rewards)

local MIN_PLAYERS, INTERMISSION, ROUND_LENGTH, ENDING = 2, 20, 180, 8 -- seconds, tune per game
local WIN_REWARD: Rewards.Reward = { Coins = 100 }

local lobbySpawn = Workspace:WaitForChild("LobbySpawn") :: BasePart
local maps = ServerStorage:WaitForChild("Maps"):GetChildren() -- each Model has a Folder "Spawns" of Parts

local alive: { [Player]: boolean } = {}

local function setState(state: string, duration: number?)
	Workspace:SetAttribute("RoundState", state)
	Workspace:SetAttribute("RoundEndsAt", if duration then Workspace:GetServerTimeNow() + duration else 0)
end

local function aliveCount(): number
	local n = 0
	for p in alive do
		if p.Parent == Players then
			n += 1
		end
	end
	return n
end

local function sendTo(player: Player, cf: CFrame)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if char and hum and hum.Health > 0 then
		hum.Health = hum.MaxHealth
		char:PivotTo(cf + Vector3.new(0, 4, 0))
	end
end

local function playRound()
	setState("Loading")
	local map = maps[math.random(#maps)]:Clone()
	map.Parent = Workspace
	local spawns = (map:FindFirstChild("Spawns") :: Folder):GetChildren()
	local conns: { RBXScriptConnection } = {}
	local i = 0
	for _, player in Players:GetPlayers() do
		local char = player.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 then
			i += 1
			alive[player] = true
			sendTo(player, (spawns[(i - 1) % #spawns + 1] :: BasePart).CFrame)
			table.insert(conns, hum.Died:Connect(function()
				alive[player] = nil
			end))
		end
	end
	setState("Playing", ROUND_LENGTH)
	local endAt = os.clock() + ROUND_LENGTH
	while os.clock() < endAt and aliveCount() > 1 do -- end on timer or last one standing
		task.wait(0.5)
	end
	local winner: Player? = nil
	for p in alive do
		if p.Parent == Players then
			winner = p
		end
	end
	setState("Ending", ENDING)
	Workspace:SetAttribute("RoundWinner", if winner then winner.UserId else 0)
	if winner then
		Rewards.give(winner, WIN_REWARD)
	end
	task.wait(ENDING)
	for _, c in conns do
		c:Disconnect()
	end
	for p in alive do
		sendTo(p, lobbySpawn.CFrame)
	end
	table.clear(alive)
	map:Destroy()
	Workspace:SetAttribute("RoundWinner", 0)
end

local Rounds = {}

function Rounds.run() -- start with task.spawn(Rounds.run) from the Server script
	while true do
		setState("Intermission")
		repeat
			task.wait(1)
		until #Players:GetPlayers() >= MIN_PLAYERS
		setState("Intermission", INTERMISSION)
		local startAt = os.clock() + INTERMISSION
		while os.clock() < startAt and #Players:GetPlayers() >= MIN_PLAYERS do
			task.wait(0.5)
		end
		if #Players:GetPlayers() >= MIN_PLAYERS then
			local ok, err = pcall(playRound)
			if not ok then
				warn(`[Rounds] {err}`) -- never let one bad round kill the loop
				table.clear(alive)
			end
		end
	end
end

return Rounds
```
Teams variant: create `Team` objects in `Teams`, set `Player.Team`, and set the lobby `SpawnLocation.Neutral` to false during rounds
so only team spawns work; store team points as an attribute on the `Team` so a leaver does not reduce them. [S52][S53][S38][S64]
Client: `Workspace:GetAttributeChangedSignal("RoundState")`, a `RunService.PreRender` label showing
`math.max(0, endsAt - workspace:GetServerTimeNow())`. Late joiners join the next round (loop only snapshots players at start).
Pitfalls: a round loop that hangs waiting on a client (the Roblox forum case was an error in a client script blocking a winner
event; do not wait on clients) [S82]; spawning players that are dead or loading; leaving the map or connections behind (leaks);
reward granting more than once; counting leavers as alive; `Players.CharacterAutoLoads = false` plus no respawn call (stuck players).
Test in Studio: 2 to 4 clients; leave during Intermission (countdown aborts), die during Playing, leave as the winner, wait
the full timer, and run three rounds back to back while watching memory and the Explorer for leftover maps.

### Recipe 8: NPC enemies with pathfinding and a single AI scheduler
When to use: zombies, guards, bosses, wave enemies, shopkeepers that walk.
Server/client split: all brains run on the server in one scheduler; the engine replicates the Humanoid movement; animations
play on the client from the replicated Humanoid state (Animate script or `Animator`); the server sets damage. NPC roots get
`SetNetworkOwner(nil)` so no client can fling or steer them. Cost control: one loop for all NPCs, path recomputation at most
every 0.75 s and only while chasing, no work when no player is within twice the aggro range. Reference scale from a 2026
thread: tens of pathfinding attackers is normal, 1,500 needs custom replication. [S3][S30][S80]
Data shape: a Model with `Humanoid`, `HumanoidRootPart`, tag `Enemy`, attributes `NpcType` (string) and optional tuning
attributes; Roblox's NPC Kit uses a `Configuration` with `PatrolRadius`, `AttackDamage`, `AttackRadius` etc. as precedent. [S55]
```luau
--!strict
-- ServerScriptService/Services/Enemies.luau
local CollectionService = game:GetService("CollectionService")
local Debris = game:GetService("Debris")
local PathfindingService = game:GetService("PathfindingService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local Filters = require(ReplicatedStorage.Shared.Filters)
local Quests = require(script.Parent.Quests)

local TAG = "Enemy"
local STEP, REPATH_EVERY = 0.25, 0.75
local AGGRO, LEASH, ATTACK_RANGE, SLEEP = 60, 90, 5, 120 -- studs (tune per game)
local DAMAGE, ATTACK_COOLDOWN = 10, 1.2

type Brain = {
	model: Model, hum: Humanoid, root: BasePart, home: Vector3, state: string,
	path: Path, waypoints: { PathWaypoint }, wpIndex: number,
	nextRepath: number, nextAttack: number, nextWander: number, computing: boolean,
	target: Model?, blocked: RBXScriptConnection,
}
local brains: { [Model]: Brain } = {}
local sight = RaycastParams.new()

local function nearestPlayerChar(pos: Vector3): (Model?, number)
	local best: Model? = nil
	local bestD2 = math.huge
	for _, player in Players:GetPlayers() do
		local char = player.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
		if char and hum and hum.Health > 0 and root then
			local delta = root.Position - pos
			local d2 = delta:Dot(delta)
			if d2 < bestD2 then
				best, bestD2 = char, d2
			end
		end
	end
	return best, bestD2
end

local function canSee(brain: Brain, target: Model): boolean
	local root = target:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then
		return false
	end
	Filters.exclude(sight, { brain.model })
	local origin = brain.root.Position
	local hit = Workspace:Raycast(origin, root.Position - origin, sight)
	return hit ~= nil and hit.Instance:IsDescendantOf(target)
end

local function repath(brain: Brain, goal: Vector3)
	if brain.computing then
		return
	end
	brain.computing = true
	task.spawn(function()
		local ok = pcall(function()
			brain.path:ComputeAsync(brain.root.Position, goal) -- yields [S2]
		end)
		brain.computing = false
		if ok and brain.path.Status == Enum.PathStatus.Success then
			brain.waypoints = brain.path:GetWaypoints()
			brain.wpIndex = 2 -- index 1 is the start point
		else
			brain.waypoints = {}
		end
	end)
end

local function follow(brain: Brain)
	local wp = brain.waypoints[brain.wpIndex]
	if wp and ((wp.Position - brain.root.Position) * Vector3.new(1, 0, 1)).Magnitude < 3 then
		brain.wpIndex += 1
		wp = brain.waypoints[brain.wpIndex]
	end
	if wp then
		if wp.Action == Enum.PathWaypointAction.Jump then
			brain.hum.Jump = true
		end
		brain.hum:MoveTo(wp.Position) -- MoveTo times out after 8 s; calling it each step renews it [S15]
	end
end

local function think(brain: Brain, now: number)
	local hum, root = brain.hum, brain.root
	if hum.Health <= 0 then
		return
	end
	local nearest, d2 = nearestPlayerChar(root.Position)
	if not nearest or d2 > SLEEP * SLEEP then
		brain.state = "Idle" -- nobody near: do no work at all
		return
	end
	if d2 <= AGGRO * AGGRO and canSee(brain, nearest) then
		brain.target = nearest
	elseif brain.target and d2 > LEASH * LEASH then
		brain.target = nil
	end
	local target = brain.target
	local troot = target and target:FindFirstChild("HumanoidRootPart") :: BasePart?
	local thum = target and target:FindFirstChildOfClass("Humanoid")
	if not target or not troot or not thum or thum.Health <= 0 then
		brain.target = nil
		brain.state = "Patrol"
		if now >= brain.nextWander then
			brain.nextWander = now + 4 + math.random() * 4
			local a = math.random() * math.pi * 2
			hum:MoveTo(brain.home + Vector3.new(math.cos(a), 0, math.sin(a)) * 12)
		end
		return
	end
	local dist = (troot.Position - root.Position).Magnitude
	if dist <= ATTACK_RANGE then
		brain.state = "Attack"
		hum:MoveTo(root.Position)
		if now >= brain.nextAttack then
			brain.nextAttack = now + ATTACK_COOLDOWN
			thum:TakeDamage(DAMAGE) -- respects ForceFields [S15]
		end
	else
		brain.state = "Chase"
		if now >= brain.nextRepath then
			brain.nextRepath = now + REPATH_EVERY
			repath(brain, troot.Position)
		end
		follow(brain)
	end
end

local function register(instance: Instance)
	if not instance:IsA("Model") or brains[instance] then
		return
	end
	local hum = instance:FindFirstChildOfClass("Humanoid")
	local root = instance:FindFirstChild("HumanoidRootPart")
	if not hum or not root or not root:IsA("BasePart") then
		return
	end
	if root:CanSetNetworkOwnership() then
		root:SetNetworkOwner(nil) -- server simulates NPCs [S30][S31]
	end
	local path = PathfindingService:CreatePath({ AgentRadius = 2, AgentHeight = 5, AgentCanJump = true, WaypointSpacing = 4 })
	local brain: Brain = {
		model = instance, hum = hum, root = root, home = root.Position, state = "Idle",
		path = path, waypoints = {}, wpIndex = 2, nextRepath = 0, nextAttack = 0, nextWander = 0,
		computing = false, target = nil,
		blocked = path.Blocked:Connect(function(blockedIdx: number)
			local b = brains[instance]
			if b and blockedIdx >= b.wpIndex then
				b.nextRepath = 0 -- only a block AHEAD of us forces a recompute [S3]
			end
		end),
	}
	brains[instance] = brain
	hum.Died:Connect(function()
		local killerId = instance:GetAttribute("LastAttackerId") -- set by Melee/Ranged on every hit
		local killer = if type(killerId) == "number" then Players:GetPlayerByUserId(killerId) else nil
		if killer then
			Quests.report(killer, "kill", tostring(instance:GetAttribute("NpcType") or "Enemy"), 1)
		end
		brain.blocked:Disconnect()
		brains[instance] = nil
		Debris:AddItem(instance, 3)
	end)
end

CollectionService:GetInstanceAddedSignal(TAG):Connect(register)
CollectionService:GetInstanceRemovedSignal(TAG):Connect(function(instance: Instance)
	local brain = instance:IsA("Model") and brains[instance]
	if brain then
		brain.blocked:Disconnect()
		brains[instance :: Model] = nil
	end
end)
for _, instance in CollectionService:GetTagged(TAG) do
	task.spawn(register, instance)
end

task.spawn(function()
	while true do
		local now = os.clock()
		for _, brain in brains do
			local ok, err = pcall(think, brain, now)
			if not ok then
				warn(`[Enemies] {err}`)
			end
		end
		task.wait(STEP)
	end
end)
```
Steps in Studio: build the rig (Humanoid + HumanoidRootPart, R15 or R6, animations through the standard Animate script), tag it `Enemy`
with the Tag Editor, set `NpcType`; add `PathfindingModifier` parts (labels like `Water`, with matching `Costs` in `CreatePath`) or
`PathfindingLink` attachments for ladders and doors; keep static geometry anchored.
Pitfalls: computing a path every step (the single biggest NPC cost); ignoring `Blocked` entirely, or recomputing on every block
(the guide's forward-index check); `Humanoid:MoveTo` stopping after 8 seconds when not renewed; a path that starts inside
geometry (`FailStartNotEmpty`), where the fallback is to move straight toward the goal; leaving NPC network ownership
automatic (a nearby exploiter can fling or steer them); running Humanoid NPCs by the hundreds (use fewer, simpler enemies, pool and
despawn; 1,500-NPC claims rely on custom replication); `Died` handlers that forget to disconnect and `Debris` the model. [S2][S3][S30][S80]
Test in Studio: spawn 20 copies and watch the MicroProfiler and server script activity; stand behind a wall (no aggro until line of
sight), then block the route with a Part at run time (`Blocked` fires, the NPC reroutes), jump over a gap (`Jump` waypoint), kill an
NPC (quest progress arrives), and stop Play with NPCs mid-chase to confirm no errors.

### Recipe 9: Melee combat (server-side hit detection)
When to use: swords, fists, battlegrounds. Detection options in order of preference for most games: server `GetPartBoundsInBox`
sweeps (this recipe), shapecasts (`Blockcast`/`Spherecast`: more accurate, one hit per cast, ignore parts already overlapping the
start), several raycasts from attachments (the old RaycastHitbox 4.01 approach, unmaintained since 2021), and never `.Touched` or
`GetPartsInPart` as the sole authority. [S5][S72][S73][S74]
Server/client split: the client plays the swing animation instantly and fires `Swing(weaponId, comboIndex)`; the server checks the
equipped tool, cooldown and state, waits the wind-up in its own clock, then sweeps a box in front of the attacker's root three times
across the damage window, hitting each humanoid once. Damage, reach, cooldown and timings come from a server table. The client
never reports who was hit.
```luau
--!strict
-- ServerScriptService/Services/Melee.luau
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local Filters = require(ReplicatedStorage.Shared.Filters)

type Weapon = { damage: number, cooldown: number, reach: number, width: number, windup: number, window: number }
-- ServerStorage/Config/MeleeWeapons, e.g. sword_basic = {damage=18, cooldown=0.55, reach=7, width=6, windup=0.18, window=0.12}
local WEAPONS = require(ServerStorage.Config.MeleeWeapons) :: { [string]: Weapon }
local TOLERANCE = 2 -- studs of latency forgiveness (invented, tune)
local lastSwing: { [Player]: number } = {}
local swinging: { [Player]: boolean } = {}
local overlap, los = OverlapParams.new(), RaycastParams.new()

local function equippedId(char: Model): string?
	local tool = char:FindFirstChildOfClass("Tool")
	local id = tool and tool:GetAttribute("ItemId") -- set by the server in Inventory (Recipe 1)
	return if type(id) == "string" then id else nil
end

local function sweep(attacker: Player, char: Model, root: BasePart, w: Weapon, hit: { [Humanoid]: boolean })
	local box = root.CFrame * CFrame.new(0, 0, -w.reach / 2)
	Filters.exclude(overlap, { char })
	for _, part in Workspace:GetPartBoundsInBox(box, Vector3.new(w.width, 6, w.reach), overlap) do
		local model = part:FindFirstAncestorOfClass("Model")
		local hum = model and model:FindFirstChildOfClass("Humanoid")
		local troot = model and model:FindFirstChild("HumanoidRootPart") :: BasePart?
		if model and hum and troot and hum.Health > 0 and not hit[hum] then
			local victim = Players:GetPlayerFromCharacter(model)
			local friendly = victim ~= nil and attacker.Team ~= nil and victim.Team == attacker.Team
			local offset = troot.Position - root.Position
			if not friendly and offset.Magnitude <= w.reach + TOLERANCE then
				Filters.exclude(los, { char, model })
				if not Workspace:Raycast(root.Position, offset, los) then -- static walls between: no hit [S59]
					hit[hum] = true
					model:SetAttribute("LastAttackerId", attacker.UserId)
					hum:TakeDamage(w.damage)
				end
			end
		end
	end
end

Net.listen("Swing", 4, 6, function(player, weaponId: any, combo: any)
	local id, c = V.id(weaponId), V.int(combo, 1, 3)
	local w = id and WEAPONS[id]
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not id or not c or not w or not char or not hum or not root or hum.Health <= 0 then
		return
	end
	if equippedId(char) ~= id then
		return
	end
	local now = os.clock()
	if swinging[player] or now - (lastSwing[player] or -math.huge) < w.cooldown then
		return
	end
	lastSwing[player], swinging[player] = now, true
	task.spawn(function()
		pcall(function()
			task.wait(w.windup)
			local hit: { [Humanoid]: boolean } = {}
			for _ = 1, 3 do
				if hum.Health <= 0 or player.Parent ~= Players or not root.Parent then
					break
				end
				sweep(player, char, root, w, hit)
				task.wait(w.window / 3)
			end
		end)
		swinging[player] = nil
	end)
end)

Players.PlayerRemoving:Connect(function(player: Player)
	lastSwing[player], swinging[player] = nil, nil
end)
```
Client (LocalScript inside the Tool): 
```luau
--!strict
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local tool = script.Parent :: Tool
local swing = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Swing") :: RemoteEvent
local combo, lastClick = 0, 0
tool.Activated:Connect(function()
	local now = os.clock()
	combo = if now - lastClick < 0.8 then combo % 3 + 1 else 1
	lastClick = now
	-- play the swing animation locally here (character Animator:LoadAnimation) for instant feedback
	swing:FireServer(tool:GetAttribute("ItemId"), combo)
end)
```
Drag-to-move furniture or levers can use `DragDetector` (its events fire on the server unless `RunLocally` is set), but still validate
the resulting position like a placement [S19].
Extras: block/parry = a server attribute `Blocking` checked in `sweep` before damage; stun = attribute plus `WalkSpeed` cut on the
server; knockback for NPCs with `ApplyImpulse` on the server, for players via a remote to the victim's client (they own their
character physics). Hit-stop and camera shake are client-only effects triggered by a `HitFx` event the server fires after a hit.
Pitfalls: trusting a client "hit target" list; `.Touched` on a blade (fires from physics ownership, can be suppressed or spammed);
`FindFirstAncestorOfClass("Model")` hitting the wrong model on tools or accessories (the character is the first Model); damage
repeated on every sweep (the `hit` set); swinging state never cleared on error (the `pcall`); box too small for fast animations
(sweep three times); box tests bounding boxes only, so shrink it slightly for rotated limbs. [S5][S74][S59]
Test in Studio: two clients, 100 ms of simulated latency, hit a moving target (tolerance), swing 20 times per second (cooldown), swing
without the tool equipped, swing while dead, hit through a wall, and hit two enemies with one swing (each once).

### Recipe 10: Ranged weapons (hitscan, optional rewind, optional projectiles)
When to use: guns, bows, lasers, spells that travel fast. Roblox's laser-tag tutorial is the reference architecture: client casts
for feedback, server validates and applies damage. This recipe goes one step stricter: the server recasts the shot itself from a
tolerated origin and a claimed direction instead of trusting a claimed target. [S50][S51][S59]
Server/client split: client fires `Fire(weaponId, origin, unitDirection)` on input (via `ContextActionService` or the Tool's
`Activated`), draws a local tracer and recoil at once; server validates, recasts, damages, and broadcasts `ShotFx` so others see a tracer.
Ammo, cooldown and reload live on the server. Defaults for a prefab-style gun (Roblox Weapons Kit): 10 damage, 0.1 s cooldown, 30
rounds, 2000 stud range, falloff between 1000 and 10000 studs, 0.2 s equip delay. [S54]
```luau
--!strict
-- ServerScriptService/Services/Ranged.luau
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local Filters = require(ReplicatedStorage.Shared.Filters)

type Gun = { damage: number, cooldown: number, range: number, magazine: number, reload: number, falloffStart: number, falloffEnd: number }
-- ServerStorage/Config/Guns, e.g. pistol = {damage=22, cooldown=0.3, range=300, magazine=12, reload=1.6, falloffStart=80, falloffEnd=300}
local GUNS = require(ServerStorage.Config.Guns) :: { [string]: Gun }
local ORIGIN_TOLERANCE = 12 -- studs between the claimed muzzle and the server-side head (invented; tune against latency)
type State = { weaponId: string, ammo: number, nextShot: number, reloadingUntil: number }
local states: { [Player]: State } = {}
local params = RaycastParams.new()

local function equippedId(char: Model): string?
	local tool = char:FindFirstChildOfClass("Tool")
	local id = tool and tool:GetAttribute("ItemId")
	return if type(id) == "string" then id else nil
end

local function stateFor(player: Player, id: string, gun: Gun): State
	local st = states[player]
	if not st or st.weaponId ~= id then
		st = { weaponId = id, ammo = gun.magazine, nextShot = 0, reloadingUntil = 0 }
		states[player] = st
	end
	return st
end

Net.listen("Fire", 15, 8, function(player, weaponId: any, origin: any, direction: any)
	local id, o, dir = V.id(weaponId), V.vec(origin, 1e5), V.vec(direction, 1.01)
	local gun = id and GUNS[id]
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local head = char and char:FindFirstChild("Head") :: BasePart?
	if not id or not gun or not o or not dir or not char or not hum or not head or hum.Health <= 0 then
		return
	end
	if dir.Magnitude < 0.99 or equippedId(char) ~= id then
		return -- must be a unit vector, and the gun must really be in hand
	end
	if (o - head.Position).Magnitude > ORIGIN_TOLERANCE then
		return
	end
	local st, now = stateFor(player, id, gun), os.clock()
	if now < st.nextShot or now < st.reloadingUntil or st.ammo <= 0 then
		return
	end
	st.nextShot, st.ammo = now + gun.cooldown, st.ammo - 1

	Filters.exclude(params, { char })
	local unit = dir.Unit
	local result = Workspace:Raycast(o, unit * gun.range, params) -- the SERVER decides what was hit
	local endPos = if result then result.Position else o + unit * gun.range
	if result then
		local model = result.Instance:FindFirstAncestorOfClass("Model")
		local thum = model and model:FindFirstChildOfClass("Humanoid")
		if model and thum and thum.Health > 0 then
			local victim = Players:GetPlayerFromCharacter(model)
			if not (victim and player.Team ~= nil and victim.Team == player.Team) then
				local span = math.max(1, gun.falloffEnd - gun.falloffStart)
				local scale = math.clamp(1 - (result.Distance - gun.falloffStart) / span, 0.25, 1)
				local headshot = if result.Instance.Name == "Head" then 2 else 1
				model:SetAttribute("LastAttackerId", player.UserId)
				thum:TakeDamage(gun.damage * scale * headshot)
			end
		end
	end
	Net.event("ShotFx"):FireAllClients(player.UserId, o, endPos)
end)

Net.listen("Reload", 1, 2, function(player)
	local char = player.Character
	local id = char and equippedId(char)
	local gun = id and GUNS[id]
	if not id or not gun then
		return
	end
	local st = stateFor(player, id, gun)
	local now = os.clock()
	if now < st.reloadingUntil or st.ammo == gun.magazine then
		return
	end
	st.reloadingUntil, st.ammo = now + gun.reload, gun.magazine -- fire is blocked until reloadingUntil
end)

Players.PlayerRemoving:Connect(function(player: Player)
	states[player] = nil
end)
```
Optional lag compensation (competitive shooters): keep roughly one second of root positions per player at about 30 Hz (the community
pattern: array indexed by tick, 32 snapshots per second), let the client send `workspace:GetServerTimeNow()` with the shot, clamp it to the
last 0.3 s, and test the ray against the rewound positions with a radius instead of moving parts. The helper is in "Luau reference
snippets". [S75][S76]
Physical projectiles (rockets, arrows, grenades): either a small server-stepped kinematic loop (snippet below) or FastCast (`FastCast.new()` once per weapon,
`Caster:Fire(origin, direction, velocity, behavior?)`, events RayHit, RayPierced, LengthChanged, CastTerminating; signature in Key facts).
For visual-only bullets, simulate on each client from the `ShotFx` data; only the server damages. [S54][S71][S92]
Pitfalls: accepting a client `hit` position or target (use the direction only); not checking origin (shoot from anywhere);
automatic weapons faster than `cooldown` (server bucket plus the `nextShot` check); changing weapons to dodge a reload (state is per
weaponId and resets on swap: persist per weapon if you do not want this); counting team damage; broadcasting from the client
(exploiters can fake other players' effects); raycasting against parts whose `CanQuery` is false (they are ignored) or against
transparent decoration (set `CanQuery = false` on it). [S4][S5][S59]
Test in Studio: spam `Fire` 100 times per second, fire with `origin` 500 studs away, `direction` of length 5 or NaN, with no gun in hand,
at a teammate, through a wall, at a target at 0, 100 and 400 studs (falloff), and reload mid-fire.

### Recipe 11: Drivable vehicles (VehicleSeat + constraints, driver-owned physics, server sanity checks)
When to use: cars, boats, bikes, carts. For high-end driving or racing, adopt a maintained chassis kit (A-Chassis is the common
community kit) or Server Authority (see `04`) rather than writing physics from scratch. [S90][S91]
Server/client split: the server spawns one vehicle per player, owns spawning, ownership rules and sanity checks; the seated driver's
client owns the physics (`SetNetworkOwner(driver)`) and applies throttle and steering to constraints for instant response; when nobody
sits the server owns it (`SetNetworkOwner(nil)`) so parked cars cannot be flung. The docs' own example hands ownership to the occupant and back
to auto when they leave and warns that exploiters can send bad data from an owned assembly. The server never sees the properties the driver's
client writes to constraints, only the motion that results, so the sanity sampler below must read assembly position and velocity, not
`AngularVelocity`; all constraints are created on the server in the template (client-created constraints can halt replication, see Key facts). [S30][S31][S84][S85][S94][S95]
Model (ServerStorage/Vehicles/`car_basic`, PrimaryPart = Chassis): a `VehicleSeat` named `DriverSeat` welded to the chassis; four
wheels as MeshParts or cylinders each with a `HingeConstraint` (wheels: `ActuatorType = Motor`, name `DriveMotor`, set `MotorMaxTorque` and
`MotorMaxAcceleration` high enough to move the mass; front wheels: second hinge or knuckle with `ActuatorType = Servo`, name
`SteerServo`, `LimitsEnabled`, `ServoMaxTorque`, `AngularSpeed`); `SpringConstraint` per wheel for suspension; attributes `MaxSpeed` (studs/s)
and `WheelRadius`; low `CustomPhysicalProperties` friction on the chassis body, grippy wheels. Keep the whole assembly unanchored. [S16][S17][S65]
```luau
--!strict
-- ServerScriptService/Services/Vehicles.luau
local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local Inventory = require(script.Parent.Inventory)

type Info = { model: Model, seat: VehicleSeat, lastGood: CFrame, lastPos: Vector3, strikes: number, lastDriven: number }
local templates = ServerStorage:WaitForChild("Vehicles")
local SPAWN_COOLDOWN, IDLE_DESPAWN, SAMPLE = 5, 120, 0.25
local owned: { [Player]: Info } = {}
local lastSpawn: { [Player]: number } = {}

local function setOwner(seat: VehicleSeat, player: Player?)
	if seat:CanSetNetworkOwnership() then
		seat:SetNetworkOwner(player)
	end
end

local function destroyFor(player: Player)
	local info = owned[player]
	if info then
		owned[player] = nil
		info.model:Destroy()
	end
end

local function bindSeat(owner: Player, info: Info)
	info.seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		local occupant = info.seat.Occupant
		local rider = occupant and Players:GetPlayerFromCharacter(occupant.Parent :: Model)
		if occupant and rider ~= owner then
			occupant.Sit = false -- only the owner drives; add plain Seats for passengers
			return
		end
		info.lastDriven = os.clock()
		setOwner(info.seat, rider) -- rider or nil (server) [S30]
	end)
end

Net.listen("SpawnVehicle", 0.5, 2, function(player, vehicleId: any)
	local id = V.id(vehicleId)
	local template = id and templates:FindFirstChild(id)
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not id or not template or not template:IsA("Model") or not root or not Inventory.has(player, id, 1) then
		return -- replace Inventory.has with your own ownership rule (item, gamepass, level)
	end
	local now = os.clock()
	if now - (lastSpawn[player] or -math.huge) < SPAWN_COOLDOWN then
		return
	end
	lastSpawn[player] = now
	destroyFor(player) -- one vehicle per player
	local model = template:Clone()
	local seat = model:FindFirstChild("DriverSeat")
	if not seat or not seat:IsA("VehicleSeat") then
		model:Destroy()
		return
	end
	model:PivotTo(root.CFrame * CFrame.new(0, 3, -12))
	model:SetAttribute("OwnerUserId", player.UserId)
	model.Parent = Workspace
	local info: Info = { model = model, seat = seat, lastGood = model:GetPivot(), lastPos = seat.Position, strikes = 0, lastDriven = now }
	owned[player] = info
	bindSeat(player, info)
	setOwner(seat, nil)
end)

task.spawn(function()
	while true do
		task.wait(SAMPLE)
		for player, info in owned do
			local seat = info.seat
			if seat.Occupant then
				local maxSpeed = (info.model:GetAttribute("MaxSpeed") :: number?) or 80
				local moved = (seat.Position - info.lastPos).Magnitude
				local allowed = maxSpeed * 1.6 * SAMPLE + 6 -- slack for ramps, crashes, lag (invented; tune)
				if moved > allowed or seat.AssemblyLinearVelocity.Magnitude > maxSpeed * 2 then
					info.strikes += 1
					if info.strikes >= 3 then
						seat.Occupant.Sit = false -- the Occupant signal then returns ownership to the server
						seat.AssemblyLinearVelocity = Vector3.zero
						info.model:PivotTo(info.lastGood)
						info.strikes = 0
						warn(`[vehicle] reset {player.Name}'s vehicle: speed/teleport check`)
					end
				else
					info.lastGood = info.model:GetPivot()
				end
				info.lastDriven = os.clock()
			elseif os.clock() - info.lastDriven > IDLE_DESPAWN then
				destroyFor(player)
				continue
			end
			info.lastPos = seat.Position
		end
	end
end)

Players.PlayerRemoving:Connect(function(player: Player)
	destroyFor(player)
	lastSpawn[player] = nil
end)
```
Driver client (LocalScript in StarterPlayerScripts); the `VehicleSeat`'s `ThrottleFloat` and `SteerFloat` are filled from the player's input
by the default controls; the owning client writes the constraint targets. Sign conventions depend on how the hinge attachments are
oriented: flip a sign if the car goes backwards or steers inverted. [S16][S17]
```luau
--!strict
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local STEER_ANGLE = 30 -- degrees

local function drive(seat: VehicleSeat): () -> ()
	local model = seat:FindFirstAncestorOfClass("Model")
	if not model then
		return function() end
	end
	local maxSpeed = (model:GetAttribute("MaxSpeed") :: number?) or 80
	local radius = (model:GetAttribute("WheelRadius") :: number?) or 1.5
	local motors, servos = {}, {}
	for _, d in model:GetDescendants() do
		if d:IsA("HingeConstraint") then
			if d.Name == "DriveMotor" then
				table.insert(motors, d)
			elseif d.Name == "SteerServo" then
				table.insert(servos, d)
			end
		end
	end
	local conn = RunService.Heartbeat:Connect(function()
		local throttle, steer = seat.ThrottleFloat, seat.SteerFloat
		for _, m in motors do
			m.AngularVelocity = -throttle * maxSpeed / radius -- rad/s = speed / radius
		end
		for _, s in servos do
			s.TargetAngle = steer * STEER_ANGLE
		end
	end)
	return function()
		conn:Disconnect()
		for _, m in motors do
			m.AngularVelocity = 0
		end
	end
end

local function onCharacter(char: Model)
	local hum = char:WaitForChild("Humanoid") :: Humanoid
	local stop: (() -> ())? = nil
	hum.Seated:Connect(function(active: boolean, seatPart: BasePart?)
		if stop then
			stop()
			stop = nil
		end
		if active and seatPart and seatPart:IsA("VehicleSeat") then
			stop = drive(seatPart)
		end
	end)
end

local player = Players.LocalPlayer
if player.Character then
	onCharacter(player.Character)
end
player.CharacterAdded:Connect(onCharacter)
```
Pitfalls: anchoring any wheel or chassis part (ownership cannot be set on anchored assemblies, `CanSetNetworkOwnership` returns false); a model
that is not in `Workspace` yet when you set the owner; leaving ownership on the last driver after they leave (the Occupant signal above
handles it); trusting client-reported speed (the sampler uses server-observed positions of an owned assembly, which is the best available
signal until Server Authority); letting a second player take the seat first and starving the owner of ownership handoff (the handoff takes
several network cycles); spawning vehicles without a cooldown (server cost); `Throttle` and `Steer` (integers) are deprecated: use the `Float` properties. [S16][S30][S85]
Test in Studio: Test > Clients and Servers with two players: driver sees a smooth car, observer sees it move with some lag; hop in as the
non-owner (ejected); teleport the car 500 studs from the command bar on the client (reset after three strikes); leave the game (vehicle destroyed);
spam `SpawnVehicle`; park and wait 120 s (despawn).

### Recipe 12: Placement and build mode (grid, ghost preview, server validation, persistence)
When to use: tycoon plots, house decorating, base building, tower placement.
Server/client split: the client draws a ghost model that follows the cursor, snapped to a grid, tinted valid or invalid; on click it sends
`Place(itemId, gx, gz, rot)` where `gx`, `gz` are integer grid cells and `rot` is 0 to 3 quarter turns, never a CFrame. The server rebuilds the CFrame from
the plot origin, checks bounds, reach, ownership of the item and overlap, spawns the real model, and stores the integers in the profile (small,
exploit-resistant, easy to rebuild on join). Roblox's own Battle Royale building kit is the precedent for grid cells aligned to the 4-stud
terrain voxel (its cell is 20 x 16 x 20 studs), connectivity rules and occupancy bitmasks for multi-cell pieces. [S56]
```luau
--!strict
-- ReplicatedStorage/Shared/PlaceConfig.luau: shared by client preview and server validation
return {
	GRID = 4,           -- studs per cell (a 4-stud grid lines up with Roblox terrain voxels [S56])
	HALF_CELLS = 32,    -- plot spans -32..32 cells on X and Z
	REACH = 60,         -- max studs from the player's root to the target cell (invented; tune)
	MAX_PER_PLOT = 300,
	items = {
		crate = { size = Vector3.new(4, 4, 4) },
		wall = { size = Vector3.new(8, 8, 1) },
	},
}
```
```luau
--!strict
-- ServerScriptService/Services/Plots.luau
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local PlayerData = require(script.Parent.PlayerData)
local Inventory = require(script.Parent.Inventory)
local Cfg = require(ReplicatedStorage.Shared.PlaceConfig)
local Filters = require(ReplicatedStorage.Shared.Filters)

type Plot = { origin: CFrame, folder: Folder }
local plots: { [Player]: Plot } = {}
local placeables = ServerStorage:WaitForChild("Placeables") -- Models named by item id
local overlap = OverlapParams.new()

local function cellCFrame(origin: CFrame, gx: number, gz: number, rot: number, size: Vector3): CFrame
	return origin * CFrame.new(gx * Cfg.GRID, size.Y / 2, gz * Cfg.GRID) * CFrame.Angles(0, rot * math.pi / 2, 0)
end

local function spawnPlaced(plot: Plot, id: string, cf: CFrame)
	local template = placeables:FindFirstChild(id)
	if template and template:IsA("Model") then
		local m = template:Clone()
		m:PivotTo(cf)
		for _, p in m:GetDescendants() do
			if p:IsA("BasePart") then
				p.Anchored = true -- static parts: no physics, no network ownership issues [S31]
			end
		end
		m.Parent = plot.folder
	end
end

local Plots = {}

function Plots.assign(player: Player, origin: CFrame) -- call when a free plot is given to the player
	local folder = Instance.new("Folder")
	folder.Name = `Placed_{player.UserId}`
	folder.Parent = Workspace
	plots[player] = { origin = origin, folder = folder }
	player:SetAttribute("PlotOrigin", origin) -- CFrame attributes replicate; the client needs it for the ghost
	local d = PlayerData.get(player)
	for _, entry in if d then d.Plot else {} do
		local def = Cfg.items[entry.id]
		if def then
			spawnPlaced(plots[player], entry.id, cellCFrame(origin, entry.gx, entry.gz, entry.rot, def.size))
		end
	end
end

Net.listen("Place", 4, 8, function(player, itemId: any, gx: any, gz: any, rot: any)
	local H = Cfg.HALF_CELLS
	local id, x, z, r = V.id(itemId), V.int(gx, -H, H), V.int(gz, -H, H), V.int(rot, 0, 3)
	local plot, d = plots[player], PlayerData.get(player)
	local def = id and Cfg.items[id]
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not id or not x or not z or not r or not plot or not d or not def or not root then
		return
	end
	if #d.Plot >= Cfg.MAX_PER_PLOT or not Inventory.has(player, id, 1) then
		return
	end
	local cf = cellCFrame(plot.origin, x, z, r, def.size)
	if (cf.Position - root.Position).Magnitude > Cfg.REACH then
		return
	end
	Filters.include(overlap, { plot.folder })
	if #Workspace:GetPartBoundsInBox(cf, def.size - Vector3.new(0.2, 0.2, 0.2), overlap) > 0 then
		return -- something is already there (bounding-box test: shrunk a little for rotated pieces [S5])
	end
	if not Inventory.remove(player, id, 1) then
		return
	end
	table.insert(d.Plot, { id = id, gx = x, gz = z, rot = r })
	spawnPlaced(plot, id, cf)
end)

Players.PlayerRemoving:Connect(function(player: Player)
	local plot = plots[player]
	if plot then
		plot.folder:Destroy()
		plots[player] = nil
	end
end)

return Plots
```
Client ghost (LocalScript; mouse and touch via `GetMouseLocation` plus `ViewportPointToRay`, which both ignore the GUI inset so they match):
```luau
--!strict
-- StarterPlayerScripts/BuildMode
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")
local Cfg = require(ReplicatedStorage.Shared.PlaceConfig)
local Filters = require(ReplicatedStorage.Shared.Filters)
local place = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Place") :: RemoteEvent
local previews = ReplicatedStorage:WaitForChild("Shared"):WaitForChild("PlacementPreviews")
local player = Players.LocalPlayer
local camera = Workspace.CurrentCamera :: Camera

local ghost: Model? = nil
local itemId: string? = nil
local rot, cellX, cellZ = 0, 0, 0
local rayParams = RaycastParams.new()

local function update()
	local origin = player:GetAttribute("PlotOrigin")
	if not ghost or not itemId or typeof(origin) ~= "CFrame" then
		return
	end
	local mouse = UserInputService:GetMouseLocation() -- viewport coordinates, no inset [S35]
	local ray = camera:ViewportPointToRay(mouse.X, mouse.Y) -- same space [S34]
	Filters.exclude(rayParams, { ghost, player.Character or ghost })
	local hit = Workspace:Raycast(ray.Origin, ray.Direction * 300, rayParams)
	if not hit then
		return
	end
	local localPos = origin:PointToObjectSpace(hit.Position)
	cellX = math.clamp(math.round(localPos.X / Cfg.GRID), -Cfg.HALF_CELLS, Cfg.HALF_CELLS)
	cellZ = math.clamp(math.round(localPos.Z / Cfg.GRID), -Cfg.HALF_CELLS, Cfg.HALF_CELLS)
	local size = Cfg.items[itemId].size
	ghost:PivotTo(origin * CFrame.new(cellX * Cfg.GRID, size.Y / 2, cellZ * Cfg.GRID) * CFrame.Angles(0, rot * math.pi / 2, 0))
end

local function exitBuild()
	RunService:UnbindFromRenderStep("BuildGhost")
	if ghost then
		ghost:Destroy()
	end
	ghost, itemId = nil, nil
end

local function enterBuild(id: string)
	exitBuild()
	local template = previews:FindFirstChild(id)
	if not template or not template:IsA("Model") then
		return
	end
	local g = template:Clone()
	for _, p in g:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored, p.CanCollide, p.CanQuery, p.CanTouch, p.Transparency = true, false, false, false, 0.5
		end
	end
	g.Parent = Workspace
	ghost, itemId, rot = g, id, 0
	RunService:BindToRenderStep("BuildGhost", Enum.RenderPriority.Camera.Value + 1, update)
end

UserInputService.InputBegan:Connect(function(input: InputObject, processed: boolean)
	if processed or not itemId then
		return
	end
	if input.KeyCode == Enum.KeyCode.R then
		rot = (rot + 1) % 4
	elseif input.KeyCode == Enum.KeyCode.Escape then
		exitBuild()
	elseif input.UserInputType == Enum.UserInputType.MouseButton1 then
		place:FireServer(itemId, cellX, cellZ, rot) -- integers only; the server re-derives everything else
	end
end)
-- call enterBuild("crate") from your hotbar/UI; add TouchTapInWorld and gamepad bindings for mobile and console
```
Pitfalls: sending a CFrame or Vector3 from the client (float exploits, positions inside walls); validating only on the client (the ghost's green tint is a hint,
never authority); `GetPartBoundsInBox` on the whole workspace (filter to the plot folder; it also skips `CanQuery = false` parts); un-anchored placed parts
(physics and ownership); forgetting to refund or remove from inventory in the same step; storing floats (store grid integers) and not rebuilding on rejoin;
mobile (no mouse location: use `TouchTapInWorld` or a screen-center reticle); placing while another player's plot is the raycast hit (the bounds clamp keeps
you in your own plot). [S5][S31][S56]
Test in Studio: place on an occupied cell, outside the plot (`gx = 999`, `1e9`, NaN), 200 studs away, 100 per second, without the item, a rotation of 7; rejoin
(items rebuild); place the maximum then one more; rotate and place walls next to crates without false overlaps.

### Recipe 13: Followers and companions (pets)
When to use: pet simulators, collectible companions, cosmetic followers.
Server/client split: the server validates which pets a player owns and which are equipped and publishes the equipped ids as Player attributes (`Pet1`..`Pet3`),
which replicate to everyone; every client renders every player's pets locally as anchored, non-colliding instances moved each frame. Pets are decoration and
perks (multipliers computed from server data), never physics objects, so there is no network ownership, no replication cost per frame, and no exploit surface.
Client-controlled pets are the common choice for responsiveness and server cost. [S83]
Data shape: `Pets.owned[petId] = count` (or `{uid: {id, level, rolls}}` for unique pets); `Pets.equipped` is a dense array of ids; definitions in
`ServerStorage/Config/PetDefs` (rarity, multiplier); display models in `ReplicatedStorage/PetModels` named by pet id.
```luau
--!strict
-- ServerScriptService/Services/Pets.luau
local Net = require(script.Parent.Parent.Net)
local V = require(script.Parent.Parent.V)
local PlayerData = require(script.Parent.PlayerData)
local MAX_EQUIPPED = 3

local Pets = {}

function Pets.publish(player: Player) -- also call after the profile loads
	local d = PlayerData.get(player)
	if not d then
		return
	end
	for i = 1, MAX_EQUIPPED do
		player:SetAttribute(`Pet{i}`, d.Pets.equipped[i]) -- nil removes the attribute
	end
end

Net.listen("EquipPet", 3, 6, function(player, petId: any, slot: any)
	local id, s = V.id(petId), V.int(slot, 1, MAX_EQUIPPED)
	local d = PlayerData.get(player)
	if not id or not s or not d then
		return
	end
	local owned = d.Pets.owned[id] or 0
	local using = 0
	for _, e in d.Pets.equipped do
		if e == id then
			using += 1
		end
	end
	if owned < 1 or using >= owned then
		return
	end
	d.Pets.equipped[math.min(s, #d.Pets.equipped + 1)] = id -- keeps the array dense
	while #d.Pets.equipped > MAX_EQUIPPED do
		table.remove(d.Pets.equipped)
	end
	Pets.publish(player)
end)

Net.listen("UnequipPet", 3, 6, function(player, slot: any)
	local s, d = V.int(slot, 1, MAX_EQUIPPED), PlayerData.get(player)
	if s and d and d.Pets.equipped[s] then
		table.remove(d.Pets.equipped, s)
		Pets.publish(player)
	end
end)

return Pets
```
```luau
--!strict
-- StarterPlayerScripts/PetsClient: renders every player's equipped pets locally
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local models = ReplicatedStorage:WaitForChild("PetModels")
local folder = Instance.new("Folder")
folder.Name = "ClientPets"
folder.Parent = Workspace
local FOLLOW_RATE, TELEPORT_DISTANCE, SLOTS = 10, 60, 3
local pets: { [Player]: { [number]: Model } } = {}

local function clear(player: Player, i: number)
	local list = pets[player]
	if list and list[i] then
		list[i]:Destroy()
		list[i] = nil
	end
end

local function refresh(player: Player)
	local list = pets[player] or {}
	pets[player] = list
	for i = 1, SLOTS do
		local id = player:GetAttribute(`Pet{i}`)
		local current = list[i]
		if type(id) ~= "string" then
			clear(player, i)
		elseif not current or current.Name ~= id then
			clear(player, i)
			local template = models:FindFirstChild(id)
			if template and template:IsA("Model") then
				local m = template:Clone()
				for _, p in m:GetDescendants() do
					if p:IsA("BasePart") then
						p.Anchored, p.CanCollide, p.CanQuery, p.CanTouch = true, false, false, false
					end
				end
				m.Parent = folder
				list[i] = m
			end
		end
	end
end

local function track(player: Player)
	refresh(player)
	for i = 1, SLOTS do
		player:GetAttributeChangedSignal(`Pet{i}`):Connect(function()
			refresh(player)
		end)
	end
end

for _, p in Players:GetPlayers() do
	track(p)
end
Players.PlayerAdded:Connect(track)
Players.PlayerRemoving:Connect(function(player: Player)
	for i = 1, SLOTS do
		clear(player, i)
	end
	pets[player] = nil
end)

RunService.PreRender:Connect(function(dt: number)
	local t = os.clock()
	for player, list in pets do
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root then
			for i, model in list do
				local side = (i - (SLOTS + 1) / 2) * 3
				local target = root.CFrame * CFrame.new(side, -1.5 + math.sin(t * 3 + i) * 0.3, 4)
				local current = model:GetPivot()
				if (current.Position - target.Position).Magnitude > TELEPORT_DISTANCE then
					model:PivotTo(target)
				else
					model:PivotTo(current:Lerp(target, 1 - math.exp(-FOLLOW_RATE * dt)))
				end
			end
		end
	end
end)
```
Put real (physical) followers and vehicles in their own collision group (`PhysicsService:RegisterCollisionGroup`, then
`CollisionGroupSetCollidable`, then `BasePart.CollisionGroup`; at most 32 groups) so they never shove players [S36].
Alternatives: a physical follower (a Humanoid model with `MoveTo`, the owner as network owner, teleport if beyond about 50 studs) or an unanchored part tracked
by `AlignPosition` (`Mode = OneAttachment`, `Position` updated each frame, tuned `MaxForce`, `MaxVelocity`, `Responsiveness`), at the cost of network ownership and
physics bugs; pet farming/auto-collect should be computed on the server from owned pets, not from the visual pet. [S32][S83]
Pitfalls: replicating pet positions from the server (cost per frame, jitter); pets with `CanCollide = true` shoving the owner; the `Pet` attribute names are a
public contract (clients read them), so never put secret data (rolls, mutation chances) in them; an equip remote that accepts a pet the player does not own;
sparse arrays (use `math.min(s, #equipped + 1)`); pets visible through streaming gaps (client instances are fine, they are exempt from stream-out per `04`).
Test in Studio: equip and unequip with two clients (each sees the other's pets), equip an unowned id, jump and teleport (pets snap after 60 studs), reset the
character (pets reattach), and stress with 30 players' worth of pets using a loop of fake attributes.

### Recipe 14: Admin and moderator tools (roles, chat commands, bans, audit log)
When to use: every live game needs at least kick, ban, unban and announce. Build the minimum yourself, or adopt a maintained console: Cmdr (typed commands, hooks such
as `BeforeRun` to block commands; maintained, v1.13.1 on 2024-09-30, setup below), Adonis (MIT, community maintained; set a random `DataStoreKey` and turn off
debug mode in production), or Operator (2026-09-01, roles and audit built in). [S68][S69][S70]
Server/client split: all authority server-side. Commands are `TextChatCommand`s whose `Triggered` handler runs on the server (Roblox's own example does this), so
permissions cannot be spoofed by a client; roles come from owner ids and group ranks; feedback goes through the notification remote (Recipe 15). [S20][S21]
Cmdr setup (docs read 2026-10-04): install it where only the server sees it (ServerScriptService or ServerStorage; the docs warn against
ReplicatedStorage) from the official `Cmdr.rbxm` release or Wally (`[server-dependencies] Cmdr = "evaera/cmdr@^1.9.0"`; check the latest
version); it is not on the Creator Store, so avoid copies. Server Script: `local Cmdr = require(path.to.Cmdr)` then
`Cmdr.Registry:RegisterDefaultCommands()` (server only; takes an array of groups or a filter function), optionally
`Cmdr.Registry:RegisterCommandsIn(folder)` (modules with `Server` in the name are not sent to clients) and `RegisterHooksIn(folder)` (server
only); `RegisterHook(hookName, callback(context) -> string?, priority?)` works on either side. Client LocalScript in StarterPlayerScripts:
`local Cmdr = require(ReplicatedStorage:WaitForChild("CmdrClient"))` then `Cmdr:SetActivationKeys({ Enum.KeyCode.F2 })` (F2 is the
default); the server inserts `CmdrClient` into ReplicatedStorage, and both sides must require Cmdr. [S93]
```luau
--!strict
-- ServerScriptService/Services/Admin.luau
local DataStoreService = game:GetService("DataStoreService")
local GroupService = game:GetService("GroupService")
local Players = game:GetService("Players")
local ServerStorage = game:GetService("ServerStorage")
local TextChatService = game:GetService("TextChatService")
local TextService = game:GetService("TextService")
local Net = require(script.Parent.Parent.Net)

type Config = { owners: { number }, groupId: number?, modRank: number, adminRank: number }
local CFG = require(ServerStorage.Config.AdminConfig) :: Config
local LEVEL = { none = 0, mod = 1, admin = 2, owner = 3 }
local levels: { [number]: number } = {}
local logStore = DataStoreService:GetDataStore("AdminLog_v1")

local function levelOf(userId: number): number
	local cached = levels[userId]
	if cached then
		return cached
	end
	if table.find(CFG.owners, userId) or (game.CreatorType == Enum.CreatorType.User and game.CreatorId == userId) then
		levels[userId] = LEVEL.owner
		return LEVEL.owner
	end
	if CFG.groupId then
		local groupId = CFG.groupId
		-- Player:GetRankInGroupAsync is deprecated; GroupService:GetRolesInGroupAsync replaces it (2026) [S10][S39][S40]
		local ok, info = pcall(function()
			return GroupService:GetRolesInGroupAsync(userId, groupId)
		end)
		if ok and info then
			local role = info.IsMember and info.Roles[1]
			local rank = if role then role.Rank else 0
			local level = if rank >= CFG.adminRank then LEVEL.admin elseif rank >= CFG.modRank then LEVEL.mod else LEVEL.none
			levels[userId] = level -- cached for the session; a failed lookup is NOT cached
			return level
		end
	end
	return LEVEL.none
end

local function notify(player: Player, text: string)
	Net.event("Notify"):FireClient(player, "info", text)
end

local function audit(admin: Player, command: string, args: string)
	local entry = `{os.time()}|{admin.UserId}|{game.JobId}|{command} {args:sub(1, 100)}`
	warn(`[admin] {entry}`)
	task.spawn(function()
		pcall(function()
			logStore:UpdateAsync(`Log_{os.time() // 86400}`, function(old: { string }?)
				local list = old or {}
				table.insert(list, entry)
				if #list > 200 then
					table.remove(list, 1)
				end
				return list
			end)
		end)
	end)
end

local function findPlayer(prefix: string): Player?
	local p = prefix:lower()
	for _, player in Players:GetPlayers() do
		if player.Name:lower():sub(1, #p) == p or player.DisplayName:lower():sub(1, #p) == p then
			return player
		end
	end
	return nil
end

local function register(name: string, minLevel: number, run: (admin: Player, args: { string }) -> ())
	local cmd = Instance.new("TextChatCommand")
	cmd.Name = `AdminCmd_{name}`
	cmd.PrimaryAlias = `/{name}`
	cmd.AutocompleteVisible = false
	cmd.Parent = TextChatService
	cmd.Triggered:Connect(function(source: TextSource, text: string)
		local admin = Players:GetPlayerByUserId(source.UserId)
		if not admin or levelOf(admin.UserId) < minLevel then
			return -- silent for non-admins
		end
		local args = string.split(text, " ")
		table.remove(args, 1) -- the alias
		audit(admin, name, table.concat(args, " "))
		local ok, err = pcall(run, admin, args)
		if not ok then
			warn(`[admin] {name}: {err}`)
			notify(admin, "Command failed")
		end
	end)
end

register("kick", LEVEL.mod, function(admin, args)
	local target = args[1] and findPlayer(args[1])
	if not target or levelOf(target.UserId) >= levelOf(admin.UserId) then
		return notify(admin, "No such player, or not allowed")
	end
	local reason = table.concat(args, " ", 2):sub(1, 200)
	target:Kick(if reason ~= "" then reason else "Removed by a moderator")
end)

register("ban", LEVEL.admin, function(admin, args) -- /ban <name> <hours|perm> <reason...>
	local name, span = args[1], args[2]
	if not name or not span then
		return notify(admin, "Usage: /ban name hours|perm reason")
	end
	local okId, userId = pcall(Players.GetUserIdFromNameAsync, Players, name)
	if not okId then
		return notify(admin, "Unknown user")
	end
	if levelOf(userId) >= levelOf(admin.UserId) then
		return notify(admin, "Not allowed")
	end
	local hours = tonumber(span)
	if span ~= "perm" and (not hours or not math.isfinite(hours) or hours <= 0) then
		return notify(admin, "Bad duration")
	end
	local seconds = if span == "perm" then -1 else math.floor((hours :: number) * 3600)
	local reason = table.concat(args, " ", 3):sub(1, 300)
	local ok = pcall(function()
		Players:BanAsync({
			UserIds = { userId },
			Duration = seconds, -- seconds; -1 = permanent [S9]
			DisplayReason = if reason ~= "" then reason else "Violation of the experience rules", -- shown to the user: no personal info or links [S61]
			PrivateReason = string.sub(`by {admin.UserId} in {game.JobId}: {reason}`, 1, 1000),
			ApplyToUniverse = true,
			ExcludeAltAccounts = false,
		})
	end)
	notify(admin, if ok then "Banned" else "Ban failed")
end)

register("unban", LEVEL.admin, function(admin, args)
	local okId, userId = pcall(Players.GetUserIdFromNameAsync, Players, args[1] or "")
	if not okId then
		return notify(admin, "Unknown user")
	end
	local ok = pcall(function()
		Players:UnbanAsync({ UserIds = { userId }, ApplyToUniverse = true })
	end)
	notify(admin, if ok then "Unbanned" else "Unban failed")
end)

register("announce", LEVEL.admin, function(admin, args)
	local text = table.concat(args, " "):sub(1, 150)
	if text == "" then
		return
	end
	local ok, result = pcall(function()
		return TextService:FilterStringAsync(text, admin.UserId, Enum.TextFilterContext.PublicChat) -- admin text is user text [S42]
	end)
	if not ok then
		return notify(admin, "Filter unavailable")
	end
	local ok2, filtered = pcall(function()
		return result:GetNonChatStringForBroadcastAsync()
	end)
	if ok2 then
		Net.event("Notify"):FireAllClients("announce", filtered)
	end
end)

Players.PlayerRemoving:Connect(function(player: Player)
	levels[player.UserId] = nil
end)
```
Ban policy per Roblox: state your rules where users can see them, enforce them consistently, allow appeals (put the appeal route in `DisplayReason` without
personal details or direct links); time-limited bans for first offences are a sensible policy (my suggestion, not Roblox's); `ApplyToUniverse` (default true) bans from every place of the game;
alt-account propagation is ON by default (`ExcludeAltAccounts = false`) and `ApplyDeviceBlock` is opt-in. Check ban state with `Players:GetBanHistoryAsync(userId)`. [S9][S61][S86]
Pitfalls: authority decided on the client (never); admin lists in `ReplicatedStorage`; caching a failed group lookup as "not admin" (the code above does
not); letting moderators target equal or higher levels; unfiltered `announce` text; the command swallowing the message when a non-admin types `/ban` (acceptable;
pick aliases players will not type in normal chat); giving admins `/give` or `/execute` in production (a stolen account becomes a dupe machine); a Studio
`ban` test on your own account (use a throwaway alt in a published test place).
Test in Studio: 2 clients, one in `owners`; the non-admin types `/ban` (nothing happens), the admin kicks a moderator of equal level (refused), bans an unknown
name (message), runs `/ban alt 0.01 test` (about 36 seconds) then `/unban alt`; check the printed audit line and the DataStore log.

### Recipe 15: Notifications (in-game toasts, system messages, opt-in and out-of-experience)
When to use: reward popups, quest completion, warnings, announcements, "friend beat your score" re-engagement.
Server/client split: server decides what to show (kind plus server-authored text) and fires `Notify`; the client owns presentation (queue, tween, safe layout).
Use `StarterGui:SetCore("SendNotification", ...)` only as a quick fallback (client-only, fixed style, up to two buttons, default duration 5 s); use
`TextChannel:DisplaySystemMessage` (client-only, shown to that user only) for chat-log lines. Out-of-experience notifications are separate: opt-in prompt on
the client, Open Cloud send from the server, one per user per day per experience, with strict content rules. [S22][S23][S26][S27][S28]
```luau
--!strict
-- ServerScriptService/Services/Notify.luau
local Net = require(script.Parent.Parent.Net)
local KINDS = { info = true, success = true, warning = true, reward = true, announce = true }
Net.event("Notify") -- create the remote at boot so clients can WaitForChild it

local Notify = {}

function Notify.send(player: Player, kind: string, text: string)
	if player.Parent and KINDS[kind] then
		Net.event("Notify"):FireClient(player, kind, text:sub(1, 120))
	end
end

function Notify.broadcast(kind: string, text: string)
	if KINDS[kind] then
		Net.event("Notify"):FireAllClients(kind, text:sub(1, 120))
	end
end

return Notify
```
```luau
--!strict
-- StarterPlayerScripts/Toasts (LocalScript)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local notify = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Notify") :: RemoteEvent

local COLORS: { [string]: Color3 } = {
	info = Color3.fromRGB(52, 120, 220), success = Color3.fromRGB(46, 160, 90), warning = Color3.fromRGB(220, 140, 30),
	reward = Color3.fromRGB(150, 80, 220), announce = Color3.fromRGB(200, 60, 60),
}
local MAX_VISIBLE, LIFETIME, MAX_QUEUE = 4, 4, 20

local gui = Instance.new("ScreenGui")
gui.Name, gui.ResetOnSpawn, gui.DisplayOrder = "Toasts", false, 50
gui.Parent = Players.LocalPlayer:WaitForChild("PlayerGui")
local list = Instance.new("Frame")
list.BackgroundTransparency = 1
list.AnchorPoint, list.Position, list.Size = Vector2.new(1, 0), UDim2.new(1, -12, 0, 12), UDim2.new(0, 280, 0, 300)
list.Parent = gui
local layout = Instance.new("UIListLayout")
layout.Padding, layout.SortOrder = UDim.new(0, 6), Enum.SortOrder.LayoutOrder
layout.Parent = list

local queue: { { kind: string, text: string } } = {}
local visible = 0
local pump: () -> ()

local function show(item: { kind: string, text: string })
	visible += 1
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 0, 40)
	label.BackgroundColor3, label.BackgroundTransparency = COLORS[item.kind], 1
	label.TextColor3, label.TextTransparency = Color3.new(1, 1, 1), 1
	label.TextWrapped, label.TextScaled, label.Font, label.Text = true, true, Enum.Font.GothamMedium, item.text
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = label
	label.Parent = list
	TweenService:Create(label, TweenInfo.new(0.2), { BackgroundTransparency = 0.1, TextTransparency = 0 }):Play()
	task.delay(LIFETIME, function()
		local fade = TweenService:Create(label, TweenInfo.new(0.3), { BackgroundTransparency = 1, TextTransparency = 1 })
		fade:Play()
		fade.Completed:Wait()
		label:Destroy()
		visible -= 1
		pump()
	end)
end

pump = function()
	while visible < MAX_VISIBLE and #queue > 0 do
		show(table.remove(queue, 1) :: { kind: string, text: string })
	end
end

notify.OnClientEvent:Connect(function(kind: any, text: any)
	if type(kind) ~= "string" or type(text) ~= "string" then
		return
	end
	if #queue >= MAX_QUEUE then
		table.remove(queue, 1)
	end
	table.insert(queue, { kind = if COLORS[kind] then kind else "info", text = text:sub(1, 120) })
	pump()
end)
```
Opt-in prompt (LocalScript; from the docs flow; users under 13, already opted in, or prompted within 30 days never see it): [S27][S29]
```luau
--!strict
local ExperienceNotificationService = game:GetService("ExperienceNotificationService")

local function askAfterAMomentOfValue()
	local ok, can = pcall(function()
		return ExperienceNotificationService:CanPromptOptInAsync()
	end)
	if ok and can then
		pcall(function()
			ExperienceNotificationService:PromptOptIn()
		end)
	end
end
-- call askAfterAMomentOfValue() after a win, a first purchase or a completed quest, never at join
```
Server send through Open Cloud (Creator Store "Open Cloud" package in `ServerScriptService`; the notification string is created once in the Creator Dashboard
and its asset id goes in `messageId`; parameters and launch data are optional; the experience needs at least 100 visits and no moderation): [S26][S27][S28]
```luau
--!strict
local ServerScriptService = game:GetService("ServerScriptService")
local OCUserNotification = require(ServerScriptService.OpenCloud.V2.UserNotification)
local MESSAGE_ID = "00000000-0000-0000-0000-000000000000" -- replace with your notification string asset id

local function friendBeatYourScore(recipientUserId: number, friendUserId: number, points: number)
	local ok, result = pcall(function()
		return OCUserNotification.createUserNotification(recipientUserId, {
			payload = {
				messageId = MESSAGE_ID,
				type = "MOMENT",
				parameters = { ["userId-friend"] = { int64Value = friendUserId }, points = { stringValue = tostring(points) } },
				joinExperience = { launchData = "rematch" },
				analyticsData = { category = "friend_beat_score" },
			},
		})
	end)
	if ok and result.statusCode ~= 200 then
		warn(`[notify] {result.statusCode} {result.error and result.error.message}`)
	end
end
```
Rules: personal and actionable ("2 races from the weekly challenge"), never generic ads, never fake urgency, never free-item bait, never required to play; one per user per
day, so budget it (rematch, streak about to break, friend passed you); delivery is not guaranteed and depends on engagement; mentions of friends only deliver between
friends who share activity. [S28]
Pitfalls: letting a client choose the text or kind (spoofed system messages); unbounded toast queues (cap it); showing user-typed text unfiltered; `SetCore` called
before the core script registers it (wrap in `pcall` and retry); `DisplaySystemMessage` from a server Script (client-only); prompting for opt-in at join; sending the
daily out-of-experience notification as the first thing a new player experiences.
Test in Studio: fire 30 `Notify` events in a second (cap and order), send an unknown `kind` (falls back to `info` on the client, ignored on the server), test the
opt-in prompt in a published game (it needs an eligible logged-in account), and `fire` Open Cloud only with a test recipient.

## Luau reference snippets
```luau
--!strict
-- ReplicatedStorage/Shared/Filters.luau: set spatial-query filters on RaycastParams/OverlapParams.
-- Uses ExcludeInstances/IncludeInstances (2026-04) when present, falls back to FilterDescendantsInstances/FilterType. [S7][S6][S8]
local Filters = {}

function Filters.exclude(params: RaycastParams | OverlapParams, list: { Instance })
	local p: any = params
	local ok = pcall(function()
		p.ExcludeInstances = list
	end)
	if not ok then
		p.FilterType = Enum.RaycastFilterType.Exclude
		p.FilterDescendantsInstances = list
	end
end

function Filters.include(params: RaycastParams | OverlapParams, list: { Instance })
	local p: any = params
	local ok = pcall(function()
		p.IncludeInstances = list
		p.ExcludeInstances = nil
	end)
	if not ok then
		p.FilterType = Enum.RaycastFilterType.Include
		p.FilterDescendantsInstances = list
	end
end

return Filters
```
```luau
--!strict
-- Server-stepped kinematic projectile with gravity (rockets, grenades); server decides hits, clients render from ShotFx-style events
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local function launch(origin: Vector3, velocity: Vector3, gravity: Vector3, lifetime: number, params: RaycastParams,
	onHit: (RaycastResult) -> ())
	local pos, vel, age = origin, velocity, 0
	local conn: RBXScriptConnection
	conn = RunService.Heartbeat:Connect(function(dt: number)
		vel += gravity * dt
		local step = vel * dt
		local result = Workspace:Raycast(pos, step, params) -- cast the whole step so fast bullets cannot tunnel [S4]
		if result then
			conn:Disconnect()
			onHit(result)
			return
		end
		pos += step
		age += dt
		if age >= lifetime then
			conn:Disconnect()
		end
	end)
end
```
```luau
--!strict
-- ServerScriptService/Services/History.luau: root-position history for rewind (about 30 Hz, 1 s) [S75]
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

type Sample = { t: number, pos: Vector3 }
local RATE, KEEP = 1 / 30, 30
local ring: { [Player]: { Sample } } = {}
local acc = 0
local History = {}

RunService.Heartbeat:Connect(function(dt: number)
	acc += dt
	if acc < RATE then
		return
	end
	acc = 0
	local now = Workspace:GetServerTimeNow()
	for _, p in Players:GetPlayers() do
		local root = p.Character and p.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root then
			local r = ring[p] or {}
			ring[p] = r
			table.insert(r, { t = now, pos = root.Position })
			if #r > KEEP then
				table.remove(r, 1)
			end
		end
	end
end)

function History.at(player: Player, t: number): Vector3? -- interpolated position at server time t
	local r = ring[player]
	if not r or #r == 0 then
		return nil
	end
	for i = #r, 2, -1 do
		local a, b = r[i - 1], r[i]
		if t >= a.t and t <= b.t then
			return a.pos:Lerp(b.pos, (t - a.t) / math.max(b.t - a.t, 1e-4))
		end
	end
	return r[#r].pos
end

-- distance from point p to the shot segment [o, o + dir*range]; hit if <= radius (e.g. 3 studs)
function History.rayNear(o: Vector3, dir: Vector3, range: number, p: Vector3): number
	local along = math.clamp((p - o):Dot(dir), 0, range)
	return (p - (o + dir * along)).Magnitude
end

Players.PlayerRemoving:Connect(function(p: Player)
	ring[p] = nil
end)

return History
```
Usage in `Ranged`: read the client's `GetServerTimeNow()` sent with the shot, clamp it to `[now - 0.3, now]` (never trust more history than a plausible
ping), compute each candidate's `History.at(p, t)`, accept the nearest within radius whose segment is not blocked by static geometry (a normal raycast to that position with
characters excluded). Keep the plain recast as the fallback for NPCs.
```luau
--!strict
-- Exploit probe: paste in the CLIENT command bar (Test > Clients and Servers > client view). Fires hostile arguments at a remote.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local function probe(remoteName: string, ...: any)
	local remote = ReplicatedStorage.Remotes:FindFirstChild(remoteName) :: RemoteEvent
	local hostile: { any } = { 0 / 0, math.huge, -math.huge, -1, 1e308, "", string.rep("A", 10000), {}, { 1, 2, 3 }, true, workspace, Vector3.new(0 / 0, 0, 0) }
	for _, h in hostile do
		remote:FireServer(h, h, h)
		remote:FireServer(h, ...)
	end
	for _ = 1, 100 do
		remote:FireServer(...) -- rate-limit check: only the burst should get through
	end
end
probe("Place", "crate", 0, 0, 0)
```
```luau
--!strict
-- Retry a yielding call with exponential backoff and jitter (DataStore, MemoryStore, Messaging); do not retry validation errors
local function retry<T>(attempts: number, fn: () -> T): (boolean, T | string)
	local wait = 1
	local lastError = "unknown"
	for i = 1, attempts do
		local ok, result = pcall(fn)
		if ok then
			return true, result
		end
		lastError = tostring(result)
		if i < attempts then
			task.wait(wait + math.random())
			wait = math.min(wait * 2, 30)
		end
	end
	return false, lastError
end
```
```luau
--!strict
-- Safe character helpers used throughout
local Players = game:GetService("Players")
local function aliveCharacter(player: Player): (Model?, Humanoid?, BasePart?)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if char and hum and root and hum.Health > 0 then
		return char, hum, root
	end
	return nil, nil, nil
end
```

## Open questions / unverified
Resolved in the 2026-10-04 gap pass (details live in Key facts and Recipes above): `ExcludeInstances`/`IncludeInstances` are in the current reference
pages [S6][S7]; the current FastCast signature, behavior fields and events [S92]; client-set constraints on owned vehicles (server does not see the
property, only the effects; build constraints on the server) [S94][S95]; Cmdr setup and maintenance status [S93]; Adopt Me trade license and Trading Hub
facts, now from the developer [S99]; which side `TextChatCommand.Triggered` fires on [S20][S21][S97][S98].
- Whether a server Script inside a Tool receives `Equipped`/`Activated`: the Tools guide says tool events fire only for client LocalScripts, the Tool
  reference says nothing about context, and a 2022 community thread says server Scripts also receive `Activated` (no staff statement found in this pass).
  The recipes use LocalScript + RemoteEvent + server checks (safe either way). Test once in Studio before relying on server-side `Activated`. [S13][S14][S100]
- Numbers invented for the sketches and flagged inline (origin tolerance 12, melee tolerance 2, reach 60, strike slack for vehicles, 3-second code cooldown
  from forum advice) are starting points; none comes from a Roblox page. The security page was re-read and gives no numeric tolerance for weapon
  origin or hit distance, only that "extra tolerance" is needed for latency. [S59]
- `TextChatCommand` instances created at run time by a server Script (as Recipe 14 does) rather than placed in Studio: the docs only require the instance to be
  parented to `TextChatService` and the sunk-message answers speak of commands "created on the server", but Roblox's example places the instance in Studio;
  test that clients see the autocomplete and that `Triggered` fires. [S20][S21][S98]
- No in-Studio execution of the recipes was done (the analyzer used here does not know Roblox types); a syntax pass only. This includes the two-client check
  that observers see a driver-written hinge motor (Recipe 11) and the Cmdr snippet, which was taken from its docs, not run. Operator and Adonis claims come
  from their posts/README. [S69][S70][S93]
- Cross-server trading, auctions and a trade ledger are sketched in prose only; a full design needs MemoryStore/MessagingService locking and is not verified here. [S62][S91]

## Sources
[S1] PathfindingService class reference, Roblox Creator Hub (raw docs yaml), read 2026-10-04. https://create.roblox.com/docs/reference/engine/classes/PathfindingService
[S2] Path class reference and Enum.PathStatus / Enum.PathWaypointAction, Roblox Creator Hub, read 2026-10-04. https://create.roblox.com/docs/reference/engine/classes/Path
[S3] Pathfinding (characters guide: agent parameters, modifiers, links, blocked paths, limits), Roblox Creator Hub. https://create.roblox.com/docs/characters/pathfinding
[S4] Raycasting guide, Roblox Creator Hub. https://create.roblox.com/docs/workspace/raycasting
[S5] WorldRoot class reference (Raycast, Spherecast, Blockcast, Shapecast, GetPartBoundsInBox/InRadius, GetPartsInPart), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/WorldRoot
[S6] OverlapParams datatype reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/datatypes/OverlapParams
[S7] RaycastParams datatype reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/datatypes/RaycastParams
[S8] "New spatial query filters", subcritical (Roblox Physics Team), DevForum, 2026-04-07. https://devforum.roblox.com/t/new-spatial-query-filters/4563575
[S9] Players class reference (BanAsync, UnbanAsync, GetBanHistoryAsync, CharacterAutoLoads, PlayerRemoving), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Players
[S10] Player class reference (LoadCharacterAsync, Kick, deprecated group methods), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Player
[S11] ProximityPrompt class reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/ProximityPrompt
[S12] Backpack class reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Backpack
[S13] In-game tools (Tools guide: handle, grip, StarterPack, collectible and earned tools, tool events), Roblox Creator Hub. https://create.roblox.com/docs/players/tools
[S14] Tool class reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Tool
[S15] Humanoid class reference (TakeDamage, MoveTo 8 s timeout, Seated, Sit), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Humanoid
[S16] VehicleSeat class reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/VehicleSeat
[S17] HingeConstraint class reference and hinge constraint guide, Roblox Creator Hub. https://create.roblox.com/docs/physics/constraints/hinge
[S18] Seat class reference (SeatWeld, 3 s re-sit cooldown), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Seat
[S19] DragDetector class reference (events fire on the server unless RunLocally), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/DragDetector
[S20] TextChatCommand class reference, Roblox Creator Hub (raw yaml read). https://create.roblox.com/docs/reference/engine/classes/TextChatCommand
[S21] Custom text chat commands (server Script example), Roblox Creator Hub. https://create.roblox.com/docs/chat/examples/custom-text-chat-commands
[S22] TextChannel class reference and In-experience text chat guide (DisplaySystemMessage client-only, ShouldDeliverCallback server-only), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/TextChannel
[S23] StarterGui class reference (SetCore SendNotification), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/StarterGui
[S24] DateTime datatype reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/datatypes/DateTime
[S25] os library reference (os.time, os.date, os.clock), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/libraries/os
[S26] User notifications (Open Cloud guide; 1 per user per day), Roblox Creator Hub. https://create.roblox.com/docs/cloud/guides/experience-notifications
[S27] Experience notifications (engine guide: package, opt-in prompt, parameters, launch data, API), Roblox Creator Hub. https://create.roblox.com/docs/production/promotion/experience-notifications
[S28] Experience notifications includes: eligibility (100 visits), delivery system, guidelines (dark patterns, no gating), Roblox Creator Hub (raw docs). https://create.roblox.com/docs/production/promotion/experience-notifications
[S29] ExperienceNotificationService class reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/ExperienceNotificationService
[S30] Network ownership (physics guide, vehicle example), Roblox Creator Hub. https://create.roblox.com/docs/physics/network-ownership
[S31] Network ownership, movement validation, and physics (security guide), Roblox Creator Hub. https://create.roblox.com/docs/scripting/security/network-ownership
[S32] AlignPosition class reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/AlignPosition
[S33] Workspace class reference (GetServerTimeNow, SignalBehavior), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Workspace
[S34] Camera class reference (ViewportPointToRay vs ScreenPointToRay), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Camera
[S35] UserInputService class reference (GetMouseLocation, InputBegan, TouchTapInWorld), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/UserInputService
[S36] PhysicsService class reference (collision groups, 32 max), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/PhysicsService
[S37] BadgeService class reference (AwardBadgeAsync, UserHasBadgeAsync), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/BadgeService
[S38] SpawnLocation class reference, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/SpawnLocation
[S39] GroupService class reference (GetRolesInGroupAsync), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/GroupService
[S40] "Feedback on Player:GetRankInGroupAsync", af_2048 and Hooksmith (Roblox staff), DevForum, 2026-05-27 to 2026-07-08. https://devforum.roblox.com/t/feedback-on-playergetrankingroupasync/4656388
[S41] UserService class reference (GetUserInfosByUserIdsAsync, 250 per minute), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/UserService
[S42] TextService and TextFilterResult references (FilterStringAsync), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/TextService
[S43] In-game leaderboards (leaderstats, IsPrimary, Priority), Roblox Creator Hub. https://create.roblox.com/docs/players/leaderboards
[S44] Create a custom leaderboard with ordered data stores (tutorial), Roblox Creator Hub. https://create.roblox.com/docs/tutorials/use-case-tutorials/data-storage/create-leaderboard
[S45] Engagement Rewards feature package, Roblox Creator Hub. https://create.roblox.com/docs/resources/feature-packages/engagement-rewards
[S46] Missions feature package, Roblox Creator Hub. https://create.roblox.com/docs/resources/feature-packages/missions
[S47] Season Passes feature package, Roblox Creator Hub. https://create.roblox.com/docs/resources/feature-packages/season-passes
[S48] Feature packages index (Bundles, Missions, Season Passes, Engagement Rewards), Roblox Creator Hub. https://create.roblox.com/docs/resources/feature-packages
[S49] Introduction to quest design (quests, achievements, dailies), Roblox Creator Hub. https://create.roblox.com/docs/production/game-design/introduction-to-quest-design
[S50] Detect hits (gameplay scripting curriculum), Roblox Creator Hub. https://create.roblox.com/docs/tutorials/curriculums/gameplay-scripting/detect-hits
[S51] Implement blaster behavior (gameplay scripting curriculum), Roblox Creator Hub. https://create.roblox.com/docs/tutorials/curriculums/gameplay-scripting/implement-blasters
[S52] Add rounds (gameplay scripting curriculum), Roblox Creator Hub. https://create.roblox.com/docs/tutorials/curriculums/gameplay-scripting/add-rounds
[S53] Create teams (gameplay scripting curriculum), Roblox Creator Hub. https://create.roblox.com/docs/tutorials/curriculums/gameplay-scripting/create-teams
[S54] Weapons kit (defaults and configuration), Roblox Creator Hub. https://create.roblox.com/docs/resources/weapons-kit
[S55] NPC kit (configuration and tag system), Roblox Creator Hub. https://create.roblox.com/docs/resources/npc-kit
[S56] Building system (Battle Royale kit: grid, occupancy and connectivity bitmasks), Roblox Creator Hub. https://create.roblox.com/docs/resources/battle-royale/building-system
[S57] Pickup system (Battle Royale kit: tagged spawners, rarity tags), Roblox Creator Hub. https://create.roblox.com/docs/resources/battle-royale/pickup-system
[S58] Foundational gameplay systems (The Mystery of Duvall Drive: GameStateManager, EventManager), Roblox Creator Hub. https://create.roblox.com/docs/resources/the-mystery-of-duvall-drive/foundational-gameplay-systems
[S59] Securing the client-server boundary (validation layers, NaN, token bucket, weapon targeting), Roblox Creator Hub. https://create.roblox.com/docs/scripting/security/client-server-boundary
[S60] HttpService class reference (GenerateGUID, limits), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/HttpService
[S61] Users and players guide, "Ban guidelines" section, and Bans dashboard page, Roblox Creator Hub. https://create.roblox.com/docs/players
[S62] MemoryStoreService, MemoryStoreSortedMap, MemoryStoreQueue and MemoryStoreHashMap references, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/MemoryStoreSortedMap
[S63] TeleportService class reference (TeleportAsync, ReserveServerAsync, TeleportInitFailed), Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/TeleportService
[S64] Team and Teams class references, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/Team
[S65] Mechanical constraints guide, Roblox Creator Hub. https://create.roblox.com/docs/physics/mechanical-constraints
[S66] DataStoreService and OrderedDataStore class references, Roblox Creator Hub. https://create.roblox.com/docs/reference/engine/classes/OrderedDataStore
[S67] "ProfileStore - Save your player data easy", loleris (Mad Studio), DevForum, 2024-10-11. https://devforum.roblox.com/t/profilestore-save-your-player-data-easy-datastore-module/3190543
[S68] "Cmdr: A fully extensible and type safe command console", evaera, DevForum, 2018-09-25 (stale age) and Cmdr hooks docs. https://devforum.roblox.com/t/cmdr-a-fully-extensible-and-type-safe-command-console-for-roblox-developers/182815 ; https://eryn.io/Cmdr/docs/reference/hooks
[S69] "Operator: A typed command console with permissions and auditing built in", cb12438, DevForum, 2026-09-01. https://devforum.roblox.com/t/operator-a-typed-command-console-with-permissions-and-auditing-built-in/4843058
[S70] Adonis admin system, Epix-Incorporated (MIT), GitHub. https://github.com/Sceleratis/Adonis
[S71] FastCast Redux API docs, EtiTheSpirit; and the obsolete V2 Caster reference wiki. https://etithespir.it/FastCastAPIDocs/ ; https://github.com/XanTheDragon/FastCastAPIDocs/wiki/API-V2-Reference:-Caster
[S72] "RaycastHitbox 4.01: for all your melee needs", TeamSwordphin, DevForum, 2021-09-21 (stale; unmaintained). https://devforum.roblox.com/t/raycasthitbox-4-01-for-all-your-melee-needs/374482
[S73] "Introducing Shapecasts", subcritical, DevForum, 2023-05-05 (older than 2024; the API is still in the current reference). https://devforum.roblox.com/t/introducing-shapecasts/2320655
[S74] "What is the most ideal way for a melee system?", oFinallyyy and replies, DevForum, 2025-09-03. https://devforum.roblox.com/t/what-is-the-most-ideal-way-for-a-melee-system/3915571
[S75] "Server Sided hit detection with lag compensation", ResumavoidDev (BroJSimpson), DevForum, 2024-12-27. https://devforum.roblox.com/t/server-sided-hit-detection-with-lag-compensation/3322386
[S76] "Gun System Hitscan help: how do other games overcome client-server time delays?", that_guydehzz072 and devmaxcat, DevForum, 2025-12-29. https://devforum.roblox.com/t/gun-system-hitscan-help-how-do-other-games-overcome-client-server-time-delays/4194566
[S77] "t": runtime type checking for Roblox, osyrisrblx, GitHub. https://github.com/osyrisrblx/t
[S78] ZonePlus v3.2.0, ForeverHD, DevForum. https://devforum.roblox.com/t/zone/1017701
[S79] RbxUtil, Sleitnick, GitHub. https://github.com/Sleitnick/RbxUtil
[S80] "Any tips for optimizing smart npcs?", awesome12734568 and replies, DevForum, 2026-07-10. https://devforum.roblox.com/t/any-tips-for-optimizing-smart-npcs/4730137
[S81] "PathfindingModule: state-driven AI movement system", Coroutinelib, DevForum, 2026-05-08. https://devforum.roblox.com/t/pathfindingmodule-state-driven-ai-movement-system/4625133
[S82] "How should I interrupt my round service loop", DevForum, 2025-09-26. https://devforum.roblox.com/t/how-should-i-interrupt-my-round-service-loop/3958997
[S83] "Creating followers" (pet follow approaches: client-side MoveTo, constraints, ownership), DevForum. https://devforum.roblox.com/t/creating-followers/490329
[S84] "How is vehicle networking done?", DevForum, 2020 (stale). https://devforum.roblox.com/t/how-is-vehicle-networking-done/603397
[S85] "Exploit prevention with vehicles?", DevForum, 2018-11 (stale). https://devforum.roblox.com/t/exploit-prevention-with-vehicles/203654
[S86] "Players:BanAsync() new feature", pf_z1, DevForum, 2024-04-28. https://devforum.roblox.com/t/playersbanasync-new-feature/2950192
[S87] "Roblox trading system design", creation.dev, 2026-02-16 (third-party blog). https://www.creation.dev/blog/roblox-trading-system-design
[S88] Adopt Me! wiki "Trade License" and allthings.how trading-hub guides (community/third-party; superseded by [S99] for the licence facts). https://adoptme.fandom.com/wiki/Trade_License
[S89] DevForum code-redemption threads: "How to make a code that once redeemed expires and cannot be used by anyone else", "Limited use codes", "Redemption Codes System" (2020-2024, community advice). https://devforum.roblox.com/t/how-to-make-a-code-one-time-use/581016
[S90] A-Chassis, open-source community vehicle chassis kit (GitHub; the search result was a community fork) and DevForum threads about it. https://github.com/lisphm/A-Chassis
[S91] `04-luau-architecture.md` (this research set, 2026-10-04): DataStore budgets, ProfileStore, ProcessReceipt, MemoryStore, TeleportService, StreamingEnabled, Server Authority. /Users/moshe/Developer/RbxAI/research/roblox/04-luau-architecture.md
[S92] FastCast API docs (Caster, FastCastBehavior, FastCast, ActiveCast, Changelist), EtiTheSpirit, read 2026-10-04 (changelist: 12.0.0 changed Fire; latest listed 13.2.1, undated). https://etithespir.it/FastCastAPIDocs/fastcast-objects/caster/ ; https://etithespir.it/FastCastAPIDocs/fastcast-objects/fcbehavior/ ; https://etithespir.it/FastCastAPIDocs/fastcast-objects/fastcast/ ; https://etithespir.it/FastCastAPIDocs/changelog/
[S93] Cmdr docs (Installation, Setup, Registry API, CmdrClient API), evaera, read 2026-10-04, and GitHub releases (v1.13.1, 2024-09-30). https://eryn.io/Cmdr/docs/installation ; https://eryn.io/Cmdr/docs/setup ; https://eryn.io/Cmdr/api/Registry ; https://eryn.io/Cmdr/api/CmdrClient ; https://github.com/evaera/Cmdr/releases
[S94] "Can constraints replicate from client to server?", DevForum (Sepruko's answer), 2023-01-13 to 17 (community). https://devforum.roblox.com/t/can-constraints-replicate-from-client-to-server/2136810
[S95] "Parts with a client network owner can have replication halted with certain physics constraint configurations", ThoughtSpinnr, DevForum Engine Bugs, 2024-02-23 (staff thirdtakeonit noted an internal ticket 2024-03-05). https://devforum.roblox.com/t/parts-with-a-client-network-owner-can-have-replication-halted-with-certain-physics-constraint-configurations/2850190
[S96] "Help replicating hingeconstraint", fjordfall and replies, DevForum, 2023-01-28 (community). https://devforum.roblox.com/t/help-replicating-hingeconstraint/2166792
[S97] "Messages that trigger a client-side TextChatCommand are not sunk", EmeraldSlash, DevForum Engine Bugs, 2024-09-30 (staff acknowledged). https://devforum.roblox.com/t/messages-that-trigger-a-client-side-textchatcommand-are-not-sunk/3176993
[S98] "Issue with TextChatCommand.Triggered messages not being sunk", DistortedFunction and 7z99, DevForum, 2024-07-01/02 (community). https://devforum.roblox.com/t/issue-with-textchatcommandtriggered-messages-not-being-sunk/3048929
[S99] Adopt Me! official news: "Trade Changes & Scam Prevention update" (2020-11-05, stale) and "Trading Hub Notes" (2026-07-31), Uplift Games. https://www.playadopt.me/news/trade-changes-and-scam-prevention-update ; https://www.playadopt.me/news/trading-hub-notes
[S100] "Local script vs Server script for Tool.Activated", Presterboi and Forummer, DevForum, 2022-06-11 (community, no staff reply). https://devforum.roblox.com/t/local-script-vs-server-script-for-toolactivated/1829727
