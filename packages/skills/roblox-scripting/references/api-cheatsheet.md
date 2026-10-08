# API cheat sheet (checked against create.roblox.com/docs/reference/engine, 2026-10)

Signatures as `Class:Method(args): returns`. `?` = optional. When something here and the live docs disagree, the docs
win: `read_doc` the class page.

## Players
- `Players:GetPlayers(): {Player}` · `Players:GetPlayerByUserId(id: number): Player?` ·
  `Players:GetPlayerFromCharacter(model: Model): Player?`
- Events: `PlayerAdded(player)`, `PlayerRemoving(player)`. Client only: `Players.LocalPlayer`.
- `Player.UserId`, `Player.Character`, `Player.CharacterAdded(character)`, `Player.CharacterRemoving`,
  `Player:Kick(message?)`, `Player:LoadCharacter()` (server), `Player:GetMouse()` (legacy; prefer UserInputService).

## Humanoid
- `Health`, `MaxHealth`, `WalkSpeed` (default 16), `JumpPower` (50, when `UseJumpPower`) / `JumpHeight` (7.2),
  `HipHeight`, `RigType`, `RootPart`, `MoveDirection`, `FloorMaterial`.
- `Humanoid:TakeDamage(n)` (respects ForceField), `:MoveTo(pos, part?)`, `:ChangeState(Enum.HumanoidStateType.X)`,
  `:SetStateEnabled(state, bool)`, `:EquipTool(tool)`, `:UnequipTools()`, `:GetState()`.
- Events: `Died`, `HealthChanged(health)`, `StateChanged(old, new)`, `Running(speed)`, `MoveToFinished(reached)`.
- Animations go through `Humanoid.Animator` (`Animator:LoadAnimation(animation): AnimationTrack`).

## DataStoreService / GlobalDataStore
- `DataStoreService:GetDataStore(name: string, scope?: string, options?): DataStore`
- `DataStoreService:GetOrderedDataStore(name, scope?): OrderedDataStore`
- `DataStoreService:GetRequestBudgetForRequestType(Enum.DataStoreRequestType.X): number`
- `DataStore:GetAsync(key, options?): (any, DataStoreKeyInfo)`
- `DataStore:SetAsync(key, value, userIds?: {number}, options?): string` (version)
- `DataStore:UpdateAsync(key, transform: (old: any, keyInfo: DataStoreKeyInfo?) -> (any?, {number}?, {}?)): (any, DataStoreKeyInfo)`
  — return nil from transform to cancel the write. Transform must not yield.
- `DataStore:IncrementAsync(key, delta?, userIds?, options?): number` · `DataStore:RemoveAsync(key): (any, DataStoreKeyInfo)`
- `OrderedDataStore:GetSortedAsync(ascending: boolean, pageSize: number, minValue?, maxValue?): DataStorePages`
  → `pages:GetCurrentPage()` = `{ {key, value} }`, `pages:AdvanceToNextPageAsync()`, `pages.IsFinished`.
- `game:BindToClose(fn)` — server shutdown hook (~30 s).

## Remotes
- `RemoteEvent:FireServer(...)` (client) → `OnServerEvent(player, ...)`
- `RemoteEvent:FireClient(player, ...)`, `:FireAllClients(...)` (server) → `OnClientEvent(...)`
- `RemoteFunction:InvokeServer(...)` (client) ↔ `OnServerInvoke = function(player, ...) return ... end`
- `UnreliableRemoteEvent` — same API, may drop/reorder, payload ≤ ~1 KB; for cosmetic high-frequency data.
- `BindableEvent:Fire(...)` / `.Event` — same-side signals between scripts.

## CollectionService
- `AddTag(inst, tag)`, `RemoveTag(inst, tag)`, `HasTag(inst, tag): boolean`, `GetTagged(tag): {Instance}`,
  `GetTags(inst): {string}`, `GetInstanceAddedSignal(tag)`, `GetInstanceRemovedSignal(tag)`.
- Also on Instance: `inst:AddTag(tag)`, `inst:HasTag(tag)`, `inst:RemoveTag(tag)`, `inst:GetTags()`.

## Instance (common)
- `Instance.new(className, parent?)` — set properties first, parent last.
- `:Clone()`, `:Destroy()`, `:FindFirstChild(name, recursive?)`, `:FindFirstChildOfClass(cls)`,
  `:FindFirstChildWhichIsA(cls)`, `:FindFirstAncestorWhichIsA(cls)`, `:WaitForChild(name, timeout?)`,
  `:GetChildren()`, `:GetDescendants()`, `:IsA(cls)`, `:IsDescendantOf(inst)`, `:GetFullName()`.
- Attributes: `:SetAttribute(name, value)`, `:GetAttribute(name)`, `:GetAttributes()`,
  `:GetAttributeChangedSignal(name)`. Property signal: `:GetPropertyChangedSignal(prop)`.
- Events: `ChildAdded`, `ChildRemoved`, `DescendantAdded`, `DescendantRemoving`, `Destroying`, `AncestryChanged`.

## Model / PVInstance
- `Model:PivotTo(cframe)`, `:GetPivot(): CFrame`, `Model.PrimaryPart`, `Model.WorldPivot`,
  `Model:GetBoundingBox(): (CFrame, Vector3)`, `Model:GetExtentsSize(): Vector3`, `Model:ScaleTo(factor)`,
  `Model:GetScale()`.
- `Model.ModelStreamingMode` (Default / Atomic / Persistent / PersistentPerPlayer) under StreamingEnabled.

## BasePart
- `Anchored`, `CanCollide`, `CanTouch`, `CanQuery`, `CollisionGroup`, `Massless`, `Size`, `CFrame`, `Position`,
  `Color`, `Material`, `MaterialVariant` (string name), `Transparency`, `Reflectance`, `CastShadow`.
- `:ApplyImpulse(v)`, `:SetNetworkOwner(player?)`, `:GetTouchingParts()`, events `Touched(other)`, `TouchEnded`.
- `MeshPart.CollisionFidelity` / `.RenderFidelity` (set at insert/edit time; not scriptable at runtime).

## Workspace queries
- `workspace:Raycast(origin: Vector3, direction: Vector3, params?: RaycastParams): RaycastResult?`
  → `.Instance`, `.Position`, `.Normal`, `.Material`, `.Distance`.
- `RaycastParams.new()` → `.FilterType = Enum.RaycastFilterType.Exclude|Include`, `.FilterDescendantsInstances`,
  `.IgnoreWater`, `.CollisionGroup`.
- `workspace:GetPartBoundsInBox(cframe, size, overlapParams?)`, `:GetPartBoundsInRadius(pos, r, params?)`,
  `:GetPartsInPart(part, params?)`, `workspace:Blockcast/Spherecast/Shapecast`.

## TweenService
- `TweenService:Create(instance, TweenInfo.new(time, easingStyle?, easingDirection?, repeatCount?, reverses?, delayTime?), { Prop = goal }): Tween`
- `tween:Play()`, `:Pause()`, `:Cancel()`, `tween.Completed:Wait()`. `repeatCount = -1` loops forever.
- `TweenService:GetValue(alpha, style, direction): number` for manual easing.

## RunService
- `IsServer()`, `IsClient()`, `IsStudio()`, `IsRunning()`, `IsEdit()`.
- Events (dt): `Heartbeat`, `PreSimulation`, `PostSimulation`, `PreRender` (client), `PreAnimation`.
- `BindToRenderStep(name, priority, fn)` / `UnbindFromRenderStep(name)` (client, camera/input order).

## UserInputService / ContextActionService (client)
- `UserInputService.InputBegan(input, gameProcessed)` — ignore when `gameProcessed` is true (typing in chat).
- `input.UserInputType`, `input.KeyCode`; `UserInputService.TouchEnabled`, `KeyboardEnabled`, `GamepadEnabled`.
- `ContextActionService:BindAction(name, fn(actionName, state, input), createTouchButton, ...keys)` for
  cross-platform actions; `UnbindAction(name)`.

## ProximityPrompt
- `ActionText`, `ObjectText`, `HoldDuration`, `MaxActivationDistance`, `RequiresLineOfSight`, `KeyboardKeyCode`,
  `Enabled`; parent to a part or Attachment. Event `Triggered(player)` fires on the server and the client.

## MarketplaceService
- `PromptProductPurchase(player, productId)`, `PromptGamePassPurchase(player, passId)`,
  `UserOwnsGamePassAsync(userId, passId): boolean`, callback `ProcessReceipt = function(receiptInfo) ... end`
  returning `Enum.ProductPurchaseDecision.PurchaseGranted | NotProcessedYet`.

## BadgeService
- `AwardBadgeAsync(userId, badgeId): boolean`, `UserHasBadgeAsync(userId, badgeId): boolean`,
  `GetBadgeInfoAsync(badgeId)`. Badges are created on the website by the owner.

## MessagingService / MemoryStoreService
- `MessagingService:PublishAsync(topic, message)`, `:SubscribeAsync(topic, fn(msg))` → `msg.Data`.
- `MemoryStoreService:GetSortedMap(name)`, `:GetQueue(name)`, `:GetHashMap(name)` — expiring cross-server state.

## task
- `task.wait(s?): number`, `task.spawn(fnOrThread, ...)`, `task.defer(fn, ...)`, `task.delay(s, fn, ...)`,
  `task.cancel(thread)`, `task.desynchronize()` / `task.synchronize()` (Actors only).

## Useful globals
- `os.clock()` (precise elapsed time, for cooldowns), `os.time()` (Unix seconds, for daily resets), `DateTime.now()`.
- `math.noise(x, y?, z?)` → within -1..1, mostly within ±0.5 (exactly 0 at integer coordinates: scale inputs to fractions). `Random.new(seed)` →
  `:NextNumber(min, max)`, `:NextInteger(min, max)`.
- `HttpService:JSONEncode/JSONDecode`, `HttpService:GenerateGUID(false)`.
- `typeof(v)` (Roblox types) vs `type(v)` (Lua types).
