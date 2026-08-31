# Crystal Canyon — architecture contract

The Golem simulator/tycoon benchmark. Original work built to the category
grammar in `docs/ROBLOX-STYLE-SPEC.md`. Nothing here is copied from any
existing experience.

This file is the contract every module is written against. Modules are authored
independently; if two of them disagree about a name in here, the module is
wrong, not this file.

## Trust model

The server owns the economy. Completely.

- The client sends **intent only** — `Purchase("pack")`, `Sell()`, never an
  amount and never a claim about what it already did.
- The server never trusts a client-reported position. Proximity to the sell pad
  is measured server-side from the character's `HumanoidRootPart`.
- Collection is **server-driven**: a server sweep at `Config.Collect.TickRate`
  decides what was collected. There is no "I picked this up" remote.
- There are **no RemoteFunctions**. Nothing grants through a return value.
- Every `c2s` remote is rate-limited by a per-player token bucket
  (`Config.RateLimits`).
- The authoritative answer always arrives as a server-pushed `Sync`.

## Roblox instance layout

```
ReplicatedStorage/
  CrystalCanyon/
    Config        ModuleScript   (written)
    Remotes       ModuleScript   (written)
    Palette       ModuleScript   (written)
    Util          ModuleScript   (written)
    Remotes/      Folder         (created at runtime by Remotes.build)

ServerScriptService/
  CrystalCanyonServer            Script
    Profile       ModuleScript
    DataService   ModuleScript
    Economy       ModuleScript
    Upgrades      ModuleScript
    Collect       ModuleScript
    Zones         ModuleScript
    Codes         ModuleScript
    Net           ModuleScript

StarterPlayer/StarterPlayerScripts/
  CrystalCanyonClient            LocalScript
    Theme         ModuleScript
    Hud           ModuleScript
    Panels        ModuleScript
    Effects       ModuleScript
    Objective     ModuleScript

Workspace/
  Canyon/                        Folder  (built by world/Build.luau)
    Ground, Cliffs, Props, Paths, Landmark
    Pads/  SellPad, UpgradePad
    Gates/ frost
    Crystals/ meadow, frost        (populated at runtime by Collect)
```

## Module contracts

Every server module is a table with `Module.init(ctx)` where `ctx` is the
service context created by `CrystalCanyonServer`:

```lua
ctx = {
  Config = Config, Util = Util, Remotes = <Folder>,
  Data = DataService, Economy = Economy, Upgrades = Upgrades,
  Zones = Zones, Collect = Collect, Codes = Codes,
}
```

`init` is called once, in dependency order, by the boot script. Modules reach
each other only through `ctx` — no `require` of a sibling service.

### Profile
Pure data. No services, no yielding.
- `Profile.new(): ProfileData` — a fresh, legal profile.
- `Profile.sanitize(raw: any): ProfileData` — coerce anything loaded from the
  DataStore into a legal profile. Must survive `nil`, a string, a table with
  missing/extra/negative/NaN/infinite fields, and out-of-range upgrade levels.
  This is the only place that decides what a corrupt save becomes.

```lua
type ProfileData = {
  version: number,        -- schema version, currently 1
  coins: number,          -- banked, integer >= 0
  shards: number,         -- carried, integer >= 0, <= pack capacity
  upgrades: {[string]: number},   -- id -> level
  zones: {[string]: boolean},     -- id -> unlocked
  codes: {[string]: boolean},     -- CODE -> redeemed
  objectives: {[string]: number}, -- id -> progress
  stats: { collected: number, sold: number, playtime: number },
}
```

### DataService
Owns DataStore I/O and the in-memory cache. Nothing else touches DataStore.
- `DataService.init(ctx)`
- `DataService.get(player): ProfileData?` — cached; nil while still loading.
- `DataService.isReady(player): boolean`
- `DataService.save(player, isFinal: boolean?)` — retry with backoff.
- Session lock: a load that finds a lock newer than
  `Config.Store.SessionLockStaleSeconds` refuses and kicks with a clear message
  rather than duplicating currency across two servers.
- Autosave loop every `Config.Store.AutosaveSeconds`.
- `game:BindToClose` saves every live profile before shutdown.
- A player whose profile failed to load is never granted anything and is never
  saved over.

### Economy
The only code that mutates currency.
- `Economy.addShards(player, amount): number` — returns the amount actually
  added after the pack cap. Never exceeds capacity.
- `Economy.packCapacity(player): number`
- `Economy.sell(player): (boolean, string?)` — converts carried shards to coins
  at `Config.Sell.CoinsPerShard`. Verifies server-measured proximity to the
  sell pad and the cooldown. Returns `false, reason` if refused.
- `Economy.addCoins(player, amount)` / `Economy.spendCoins(player, amount): boolean`
  — `spendCoins` is atomic: it checks and debits in one step, so two purchases
  in the same frame cannot both pass the check.
- `Economy.push(player)` — send the authoritative `Sync` snapshot.

### Upgrades
- `Upgrades.purchase(player, upgradeId): (boolean, string?)` — validates the id
  exists, level < MaxLevel, and funds; debits atomically; applies the effect
  (WalkSpeed for `speed`); bumps the `upgrade` objective.
- `Upgrades.applyCharacter(player)` — re-apply stats on spawn/respawn.

### Zones
- `Zones.isUnlocked(player, zoneId): boolean`
- `Zones.unlock(player, zoneId): (boolean, string?)` — charges `UnlockCost`,
  opens the gate for that player.
- Gate visuals are per-player (a locked player sees a solid red gate); use a
  `LocalScript`-free approach — the server sets a per-player attribute and the
  client reads it, so gate state never desyncs.

### Collect
- Spawns `CrystalCount` crystals per zone inside `Bounds`, respawning
  `RespawnSeconds` after collection.
- Server sweep at `Config.Collect.TickRate`: for each player, for each crystal
  in a zone that player has unlocked, collect if within
  `Config.upgradeValue("magnet", level)` studs. At most
  `Config.Collect.MaxPerTick` per player per tick.
- Fires `Pop` at the crystal position so the client can draw the number.
- Bumps the `collect` objective.

### Codes
- `Codes.redeem(player, code): (boolean, string)` — uppercases and trims,
  rejects over `Config.CodeInput.MaxLength`, rejects already-redeemed, grants
  the reward, returns a message the client shows verbatim.

### Net
- Wires every `c2s` remote to its service, applying the token bucket first.
- Rejected calls are silent to the client except for a `Notify`.
- Guards: player must have a ready profile; arguments must be the declared type.

## Client contracts

### Theme
UI construction helpers that bake in the style spec so no panel can be built
without an outline.
- `Theme.panel(parent, titleText, headerColor, size): (Frame, Frame)` — returns
  the panel and its body. Panel gets the thick outline, a saturated header bar,
  a large red close button top-right (§5).
- `Theme.button(parent, text, fillColor, size, position): TextButton` — pill or
  rounded, vertical gradient, hard bottom edge (§3), outlined, heavy uppercase.
- `Theme.card(parent, size): Frame` — white, outlined, rounded (§5.4).
- `Theme.counter(parent, iconColor, position): (Frame, TextLabel)` — dark
  rounded currency pill with a big comma-separated number (§6).
- `Theme.iconButton(parent, label, fillColor, position): TextButton` — circular
  HUD icon button (§6 left edge).
- `Theme.sectionLabel(parent, text): TextLabel`

### Hud
Screen-edge only. **The centre stays empty** (§6, called out as a hard rule and
a common way first attempts fail).
- top-left: Shards and Coins counters
- left edge: circular icon buttons — Shop, Upgrades, Codes, Zones
- right edge: wide pill — SELL SHARDS
- top-centre: the current objective chip
- bottom-left: version string
- a thick rounded pack-fill progress bar with the icon at its left end

### Panels
Four modals, all built from `Theme.panel`: Shop (upgrades for sale), Upgrades
(levels + effects), Codes (input + redeem), Zones (progress + unlock).
Exactly one open at a time. Open/close is animated (§ polish).

### Effects
Number pops on `Pop`, toast on `Notify`, a burst on zone unlock. Reward feedback
is immediate and loud; silence reads as breakage (§8).

### Objective
Renders the onboarding chip from the synced objective index.

## World

`world/Build.luau` runs **at edit time** and builds `Workspace.Canyon`
deterministically from a fixed seed. It is idempotent: it destroys and rebuilds
the folder, so re-running never doubles the geometry.

It must satisfy §7 and §9 of the style spec:
- flat-shaded low-poly, untextured, `SmoothPlastic`/`Plastic` only
- cliffs banded in three tones of the same rust hue
- conifers as stacked cones; deciduous as rounded blobs on a straight trunk
- rocks as faceted lumps grouped in twos and threes, never evenly scattered
- grass as small spiky tufts clustered at path edges and against props
- a wide orange path contrasting hard with the green ground
- a circular sand hub ringed by cliffs so the world does not leak away
- **one dominant landmark visible from spawn**
- progression physically signposted: oversized green arrows, glowing pads,
  coloured floor rings, a gate
