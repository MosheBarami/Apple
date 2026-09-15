// WHAT A MECHANIC IS, AND WHO HAS ALREADY BUILT ONE.
//
// The owner's rule is "never build from scratch — find what communities have already assembled",
// and his second rule is "nothing outdated". Those pull in opposite directions: the Roblox code
// lying around on GitHub is exactly where `LoadLibrary`, `BodyVelocity` and `Ray.new` live on.
//
// So this file is two halves that must both be present for either to be worth anything:
//
//   THE PATTERN — what the mechanic IS, where its authority has to live, and the calls that are
//   current in 2026. Written here, verified against Roblox's own documentation, and owned by this
//   repository so it can be corrected in one place.
//
//   THE CITATIONS — repositories that demonstrably implement it, from mechanic-citations.ts, which
//   a curator produced by reading 3,017 harvested repositories' file trees. Every citation carries
//   its licence and its author.
//
// NOTHING IS VENDORED, AND THAT IS THE PRODUCT, NOT A LIMITATION. Pasting a stranger's Luau into a
// customer's game means shipping their licence with it — six of the surviving repositories are
// GPL, one is AGPL. The agent reads the implementation and writes its own, which is both the legal
// answer and the better one: the customer's game ends up with code shaped like their game.
//
// WHERE A MECHANIC IS ALSO A PREFAB, THE PREFAB WINS. `install_module` ships reviewed source for
// the systems whose failures are silent, delayed, and destroy something the player cannot get back
// — their save, their money, the leaderboard. Reading someone's DataStore code and writing a
// fourth version of it is worse than installing the one that has been through review here.
import { PREFABS } from './prefabs';
import { MECHANIC_CITATIONS, type MechanicCitation } from './mechanic-citations';

export interface MechanicPattern {
  id: string;
  /** What a builder would call it, in their words. */
  label: string;
  /** The one sentence that says what the mechanic actually is. */
  what: string;
  /** Where authority has to live for it not to be exploitable. */
  authority: string;
  /** The calls that are current. Not a tutorial — the names to reach for. */
  api: readonly string[];
  /** The specific ways this mechanic is got wrong, stated as failures rather than advice. */
  pitfalls: readonly string[];
  /** The id in PREFABS that ships reviewed source for this, when one exists. */
  prefab?: string;
  /** Words a builder might use for it that are not in the id or the label. */
  aliases?: readonly string[];
}

const P: readonly MechanicPattern[] = [
  {
    id: 'persistence', label: 'saving player data across sessions', prefab: 'profile_store',
    aliases: ['datastore', 'save', 'saving', 'data', 'profile', 'progress'],
    what: 'one authoritative table per player, loaded on join, mutated only on the server, and written back so that a crash or a rejoin cannot lose or duplicate it.',
    authority: 'server only. A client that can tell the server what its save contains can give itself anything.',
    api: ['DataStoreService:GetDataStore(name)', 'store:UpdateAsync(key, transform)', 'game:BindToClose(flush)', 'Players.PlayerRemoving'],
    pitfalls: [
      'SetAsync from two servers at once: the second write wins and the first player\'s session is gone. UpdateAsync reads before it writes; that is the whole difference.',
      'saving after a FAILED load, which writes an empty profile over a real one. A load that failed must block the save, not default to {}.',
      'no session lock, so the same player joining two servers ends with two divergent saves and one of them is discarded.',
      'no BindToClose, so everything since the last autosave dies with the server shutdown.',
      'a yielding call inside the UpdateAsync transform — it is not allowed to yield.',
    ],
  },
  {
    id: 'currency', label: 'a currency and leaderstats', prefab: 'currency',
    aliases: ['coins', 'cash', 'money', 'gems', 'gold', 'leaderstats', 'economy'],
    what: 'a number owned by the server, mirrored into a leaderstats IntValue purely so Roblox will draw it.',
    authority: 'server. leaderstats is a DISPLAY; the truth is the saved profile, and a client writing to the IntValue must change nothing.',
    api: ['Instance.new("Folder", player) named leaderstats', 'IntValue / NumberValue', 'Players.PlayerAdded'],
    pitfalls: [
      'treating the leaderstats value as the balance, so the amount survives only as long as the session.',
      'awarding on the client and telling the server — the remote becomes a money printer.',
      'IntValue overflowing at 2^31 in an idle game that reaches it in a weekend; NumberValue or a string-encoded big number instead.',
      'deducting and granting as two writes, so a failure between them takes the money and gives nothing.',
    ],
  },
  {
    id: 'shop', label: 'a shop the player buys from', prefab: 'buy_buttons',
    aliases: ['store', 'buy', 'purchase', 'vendor', 'kiosk', 'merchant'],
    what: 'a catalogue the server owns, a surface the client draws from it, and a purchase that debits and grants in one indivisible step.',
    authority: 'server. The client sends "I want item X"; it never sends the price.',
    api: ['RemoteFunction or RemoteEvent for the request', 'ProximityPrompt to open the surface', 'the same UpdateAsync write that holds the balance'],
    pitfalls: [
      'the price arriving in the remote payload, so the buyer names their own price.',
      'debit and grant as separate writes — a failure between them is a player who paid for nothing.',
      'no server-side check that the item is actually for sale, so a crafted remote buys anything in the catalogue table.',
      'a Touched or Activated burst firing the purchase many times before the first has been recorded.',
    ],
  },
  {
    id: 'monetization', label: 'gamepasses and developer products', prefab: 'receipts',
    aliases: ['gamepass', 'robux', 'developer product', 'dev product', 'iap', 'subscription'],
    what: 'Robux entering the experience: a pass is owned forever and checked, a product is consumed once and must be granted exactly once.',
    authority: 'server, and ProcessReceipt may be set by exactly ONE server script in the whole place.',
    api: ['MarketplaceService:UserOwnsGamePassAsync(userId, passId)', 'MarketplaceService:PromptGamePassPurchase(player, passId)', 'MarketplaceService.ProcessReceipt', 'Enum.ProductPurchaseDecision.PurchaseGranted / NotProcessedYet', 'MarketplaceService:GetUserSubscriptionStatusAsync(player, subscriptionId)'],
    pitfalls: [
      'returning PurchaseGranted before the grant is SAVED. Roblox will not call back again, and the player has paid for nothing.',
      'not recording the PurchaseId, so a retried receipt grants the product twice.',
      'returning nothing from ProcessReceipt — Roblox reads that as an error and keeps retrying forever.',
      'checking pass ownership on the client, where the answer can be faked.',
      'caching UserOwnsGamePassAsync for the session and never noticing the pass bought five minutes into it — listen to PromptGamePassPurchaseFinished as well.',
    ],
  },
  {
    id: 'inventory', label: 'an inventory or backpack',
    aliases: ['items', 'hotbar', 'backpack', 'loadout', 'equip', 'slots'],
    what: 'a server-owned list of item ids and counts, with a client view that can only ask to equip, drop or use.',
    authority: 'server. An inventory the client can edit is a duplication glitch with a UI on it.',
    api: ['StarterGui.ResetPlayerGuiOnSpawn', 'Player.Backpack and Tool for the default system', 'a table in the saved profile for anything richer'],
    pitfalls: [
      'storing full item tables per player instead of ids plus counts, which blows the 4MB DataStore value limit on a hoarder.',
      'no stack cap, so an off-by-one loop hands out 2^53 of something.',
      'trusting a client-sent slot index straight into table.remove — a negative or out-of-range index corrupts the list.',
      'dropping an item by cloning it before the removal is committed, which is how duplication bugs are born.',
    ],
  },
  {
    id: 'pets', label: 'pets, eggs and hatching',
    aliases: ['pet', 'egg', 'hatch', 'companion', 'familiar'],
    what: 'an owned collection with a weighted roll to acquire, a small number equipped at once, and a model that follows without fighting the character physics.',
    authority: 'server rolls, server owns the collection; the client only plays the hatch animation it is told the result of.',
    api: ['Random.new() on the server', 'AlignPosition / AlignOrientation for the follow', 'a folder of pet models in ReplicatedStorage'],
    pitfalls: [
      'rolling on the client, which makes every rarity whatever the player wants it to be.',
      'the pet model welded to the character, so it drags the Humanoid around and breaks walking.',
      'BodyPosition / BodyGyro for the follow — deprecated movers; AlignPosition and AlignOrientation are the current ones.',
      'unanchored, uncollided pet parts still colliding with the owner, which launches players off the map.',
      'equipping with no cap, so a hundred pets are replicated to everyone in the server.',
    ],
  },
  {
    id: 'leaderboard_global', label: 'a cross-server leaderboard', prefab: 'leaderboard',
    aliases: ['leaderboard', 'top players', 'ranking', 'highscore', 'global'],
    what: 'an OrderedDataStore holding one number per player, read back sorted, and shown on a surface that refreshes on a timer rather than on every change.',
    authority: 'server. The board is also a target: whatever writes to it is what an exploiter will aim at.',
    api: ['DataStoreService:GetOrderedDataStore(name)', 'store:SetAsync(tostring(userId), score)', 'store:GetSortedAsync(false, limit)', 'pages:GetCurrentPage()', 'Players:GetNameFromUserIdAsync(userId)'],
    pitfalls: [
      'writing on every score change, which exhausts the DataStore budget within minutes on a busy server.',
      'OrderedDataStore only holds integers — a float or a string silently fails to save.',
      'reading the sorted pages on every frame instead of on a timer.',
      'GetNameFromUserIdAsync per row per refresh, unbatched and uncached, which rate-limits the whole board away.',
      'no pcall, so one throttled call takes the entire board script down until the server restarts.',
    ],
  },
  {
    id: 'round_system', label: 'rounds, intermission and a match loop', prefab: 'rounds',
    aliases: ['round', 'match', 'intermission', 'lobby', 'minigame', 'game loop'],
    what: 'a single server-side state machine — intermission, loading, playing, ending — that every other system reads and nothing else writes.',
    authority: 'server. One loop, one owner. Two scripts advancing the same round is the commonest cause of a match that ends twice.',
    api: ['task.wait(n) — never wait(n)', 'a BindableEvent or a signal for state changes', 'Players:GetPlayers() re-read at each transition'],
    pitfalls: [
      'holding a player list captured at round start, so someone who left is still "alive" and the round never ends.',
      'no minimum player count, so the loop spins a match for one person forever.',
      'a round that cannot end early, so a map with every player dead sits out the full timer.',
      'teleporting or respawning before the state has actually changed, which races the character loading.',
      'wait()/spawn()/delay() rather than task.wait()/task.spawn()/task.delay() — the legacy ones are deprecated and throttle differently.',
    ],
  },
  {
    id: 'checkpoints', label: 'an obby with staged checkpoints', prefab: 'checkpoints',
    aliases: ['obby', 'checkpoint', 'stage', 'respawn', 'parkour'],
    what: 'a stage number per player, saved, with respawn resolved from that number rather than from where the character happened to be.',
    authority: 'server. The stage value is the progress; a client that can set it skips the game.',
    api: ['Player.RespawnLocation', 'SpawnLocation instances named by stage', 'Players.PlayerAdded + CharacterAdded'],
    pitfalls: [
      'the stage kept only in leaderstats, so the whole obby resets on rejoin.',
      'a Touched connection that fires per limb per contact, awarding the same stage a dozen times.',
      'allowing the stage to go DOWN on touching an earlier pad, which undoes progress on a walk back.',
      'SpawnLocation.Neutral left false with no Team, so players spawn nowhere.',
    ],
  },
  {
    id: 'killbricks', label: 'hazards that kill or damage on touch',
    aliases: ['killbrick', 'lava', 'spikes', 'trap', 'hazard', 'damage part'],
    what: 'a part that reduces Humanoid health on contact, debounced per character rather than per touch.',
    authority: 'server, or the kill is a suggestion.',
    api: ['BasePart.Touched', 'Humanoid:TakeDamage(n)', 'Humanoid.Health', 'workspace:GetPartsInPart(part) for a poll instead of an event'],
    pitfalls: [
      'no debounce: Touched fires per limb and per micro-contact, so a 10-damage brick does 80.',
      'setting Health = 0 rather than TakeDamage, which ignores ForceField and makes spawn protection useless.',
      'the handler on a LocalScript, so the death does not replicate and the player keeps walking on other clients.',
      'connecting Touched on hundreds of parts individually instead of one loop over a tagged folder.',
    ],
  },
  {
    id: 'weapons', label: 'weapons and tools that deal damage',
    aliases: ['weapon', 'gun', 'sword', 'combat', 'melee', 'shooting', 'hitbox', 'damage'],
    what: 'a client that aims and animates, and a server that decides whether the hit was possible and how much it cost.',
    authority: 'server. The client may say "I fired at this point"; it may never say "I dealt 40 damage to this player".',
    api: ['workspace:Raycast(origin, direction, RaycastParams)', 'workspace:Blockcast / :Spherecast for a thick hit', 'workspace:GetPartsInPart(hitbox, OverlapParams)', 'Humanoid:TakeDamage(n)', 'Tool.Activated'],
    pitfalls: [
      'the damage number sent from the client, which is the single most exploited remote in Roblox.',
      'no server-side range, rate or line-of-sight check, so a valid-looking remote kills across the map through walls.',
      'Ray.new + FindPartOnRay — both superseded by workspace:Raycast with RaycastParams.',
      'a hitbox part welded and left colliding, which shoves the character it is attached to.',
      'raycasting from the camera on the server, where there is no camera.',
    ],
  },
  {
    id: 'enemies', label: 'NPC enemies that chase and attack',
    aliases: ['npc', 'mob', 'zombie', 'monster', 'ai', 'boss'],
    what: 'a server-owned Humanoid with a small state machine — idle, chase, attack — that repaths on a timer rather than every frame.',
    authority: 'server. NPC damage decided on a client is the same hole as weapon damage.',
    api: ['PathfindingService:CreatePath(params)', 'path:ComputeAsync(from, to)', 'path:GetWaypoints()', 'Humanoid:MoveTo(point)', 'Humanoid.MoveToFinished', 'CollectionService for tagging spawns'],
    pitfalls: [
      'ComputeAsync every frame, which is a yielding call and will stall the server with a dozen NPCs.',
      'MoveTo without MoveToFinished, so the NPC gives up silently after 8 seconds — that timeout is real and undocumented in most tutorials.',
      'no target re-check, so the NPC chases a player who has left and the model never cleans up.',
      'NPC models left in Workspace after death, which is how a place reaches 40,000 instances and stops replicating.',
      'pathfinding around a target that is moving faster than the repath interval, producing a permanently orbiting enemy.',
    ],
  },
  {
    id: 'waves', label: 'a wave spawner',
    aliases: ['wave', 'horde', 'spawner', 'rounds of enemies'],
    what: 'a table describing each wave, a server loop that spawns from it, and a wave that ends when the last spawned enemy is actually gone.',
    authority: 'server.',
    api: ['task.wait between spawns', 'a counter decremented on Humanoid.Died AND on model removal', 'CollectionService tags for the living set'],
    pitfalls: [
      'counting kills rather than remaining enemies, so an NPC that fell out of the map stalls the wave forever.',
      'spawning the whole wave in one frame, which spikes the server and replicates 60 models at once.',
      'a difficulty curve multiplied per wave with no cap, reaching unkillable health by wave 20.',
      'the next wave starting while the previous one is still cleaning up, so counts drift.',
    ],
  },
  {
    id: 'towers', label: 'placeable towers and turrets',
    aliases: ['tower', 'turret', 'tower defense', 'td', 'defender'],
    what: 'a placement step that validates the spot, and a per-tower attack loop that picks a target by a stated rule and respects its own cooldown.',
    authority: 'server places, server fires, server charges. The client previews.',
    api: ['workspace:GetPartBoundsInBox(cframe, size, OverlapParams) to reject overlaps', 'CollectionService for the tower set', 'a single Heartbeat loop over all towers rather than one loop each'],
    pitfalls: [
      'the placement CFrame taken from the client with no validation — towers inside walls, on the path, or in the sky.',
      'not charging for the tower until after it exists, so a failed purchase leaves a free tower.',
      'a separate while-loop per tower; fifty towers is fifty coroutines and a dead server.',
      'targeting "nearest" recomputed over every enemy every frame instead of on a cooldown.',
    ],
  },
  {
    id: 'path_waypoints', label: 'pathfinding and waypoints enemies walk',
    aliases: ['pathfinding', 'navigation', 'waypoint', 'path', 'walk to'],
    what: 'a computed path from A to B that the mover consumes waypoint by waypoint, recomputed when it is invalidated rather than continuously.',
    authority: 'server for anything that matters; a client path is a hint.',
    api: ['PathfindingService:CreatePath({AgentRadius, AgentHeight, AgentCanJump})', 'path:ComputeAsync(start, finish)', 'path.Status == Enum.PathStatus.Success', 'path:GetWaypoints()', 'waypoint.Action == Enum.PathWaypointAction.Jump', 'path.Blocked'],
    pitfalls: [
      'not checking path.Status, so a failed computation walks the NPC in a straight line into a wall.',
      'ignoring the Jump action on a waypoint, so the NPC stands under a ledge forever.',
      'AgentRadius left at the default for a wide model, which plans paths through gaps it cannot fit.',
      'recomputing on Heartbeat. ComputeAsync yields and is rate-limited.',
      'confusing this with a ChangeHistoryService undo waypoint, which is an unrelated Studio-plugin API with the same word.',
    ],
  },
  {
    id: 'upgrades', label: 'upgrades, levels and tiers',
    aliases: ['upgrade', 'level', 'xp', 'experience', 'skill tree', 'tier'],
    what: 'a saved level per track, a cost curve the server evaluates, and effects derived from the level rather than stored beside it.',
    authority: 'server.',
    api: ['a table in the saved profile', 'the same UpdateAsync write as the balance'],
    pitfalls: [
      'storing the EFFECT as well as the level, so the two disagree after a balance change and the older one wins.',
      'the cost read from a client-sent index, so an out-of-range tier costs nothing.',
      'an exponential curve with no cap that reaches inf and then NaN, which poisons the save.',
      'granting the upgrade before the currency write succeeded.',
    ],
  },
  {
    id: 'rebirth', label: 'a rebirth or prestige loop',
    aliases: ['rebirth', 'prestige', 'ascend', 'reset for bonus'],
    what: 'a deliberate reset that wipes a named subset of progress and increments a multiplier, in one write.',
    authority: 'server, and idempotent — a double-clicked button must rebirth once.',
    api: ['UpdateAsync over the whole profile, not field-by-field'],
    pitfalls: [
      'wiping and then granting as two writes: a failure between them is a player who lost everything for nothing.',
      'no requirement check on the server, so a remote grants a rebirth at zero coins.',
      'multipliers stacked multiplicatively with no cap, which reaches inf and breaks every display.',
      'forgetting to wipe something the player can then re-earn instantly, which makes the loop free.',
    ],
  },
  {
    id: 'dropper', label: 'a tycoon dropper and conveyor chain', prefab: 'income',
    aliases: ['tycoon', 'dropper', 'conveyor', 'collector', 'income', 'idle'],
    what: 'a timed spawn, a surface that moves it, and a collector that credits the PLOT OWNER and destroys the part.',
    authority: 'server. Income computed on a client is unlimited income.',
    api: ['BasePart.AssemblyLinearVelocity or a conveyor\'s surface velocity', 'Debris:AddItem(part, seconds)', 'a Touched handler on the collector'],
    pitfalls: [
      'parts never destroyed, so an idle tycoon accumulates thousands of them and the server dies.',
      'crediting whoever touched the collector rather than the plot owner, so visitors farm someone else\'s tycoon.',
      'simulating income while the owner is offline from the client\'s clock rather than from os.time on the server.',
      'a dropper loop with wait() rather than task.wait(), which drifts badly under load.',
    ],
  },
  {
    id: 'plots', label: 'claimable plots or bases',
    aliases: ['plot', 'base', 'claim', 'land', 'tycoon plot'],
    what: 'a fixed set of plots, at most one per player, assigned on join and released on leave, with every plot-scoped action checked against the owner.',
    authority: 'server owns the assignment table.',
    api: ['Players.PlayerAdded / PlayerRemoving', 'an attribute or a table mapping plot to UserId'],
    pitfalls: [
      'no release on leave, so a busy server runs out of plots and new players get nothing.',
      'ownership stored on the plot model as a StringValue the client can read but nothing re-checks on each action.',
      'two players assigned the same plot by a race between two PlayerAdded handlers.',
      'the plot contents saved by position rather than by a described layout, which breaks the moment the plot moves.',
    ],
  },
  {
    id: 'quests', label: 'quests, missions and objectives',
    aliases: ['quest', 'mission', 'objective', 'task', 'goal'],
    what: 'a definition table the server owns, per-player progress in the save, and completion that can only be claimed once.',
    authority: 'server evaluates progress; the client renders it.',
    api: ['a table in the saved profile keyed by quest id', 'ProximityPrompt or a dialogue surface to accept and hand in'],
    pitfalls: [
      'progress incremented from a client remote with no check that the event actually happened.',
      'no claimed flag, so the reward is collected repeatedly.',
      'quest definitions stored in the save rather than referenced by id, so changing a quest rewrites history.',
      'a daily quest reset computed from elapsed seconds rather than from a real day boundary.',
    ],
  },
  {
    id: 'dialogue', label: 'NPC dialogue and prompts',
    aliases: ['dialogue', 'npc talk', 'conversation', 'shopkeeper', 'prompt', 'speech'],
    what: 'a tree of nodes with options, driven from a ProximityPrompt, where any node that GIVES something is resolved on the server.',
    authority: 'the conversation can be client-side; the consequences cannot.',
    api: ['ProximityPrompt + ProximityPrompt.Triggered', 'TextChatService for anything appearing in chat', 'a node table in ReplicatedStorage'],
    pitfalls: [
      'the legacy Dialog / DialogChoice instances and the legacy Chat service — TextChatService is the current system.',
      'the reward granted by the client when it reaches the node, so the node can simply be jumped to.',
      'no distance re-check on the server, so a prompt can be triggered from across the map.',
      'unfiltered player-authored text shown to others; anything a player wrote must go through TextService filtering.',
    ],
  },
  {
    id: 'daily_reward', label: 'a daily reward and login streak', prefab: 'daily_reward',
    aliases: ['daily', 'login streak', 'login bonus', 'streak'],
    what: 'a bonus on the first join of a day, with a streak that is right about what a day is.',
    authority: 'server, from server time. os.time on the client is a setting.',
    api: ['os.time() on the server', 'os.date("!*t", t) for a UTC day boundary', 'the saved profile for the last claim'],
    pitfalls: [
      'the date read from the client, which turns a daily reward into an unlimited one.',
      'yday used across a year boundary: 31 December to 1 January reads as a 364-day gap and wipes the streak.',
      'elapsed seconds used as a day, so the streak depends on the hour someone logs in.',
      'awarding and then failing to record it, so the same day pays twice.',
      'a clock moved BACKWARDS treated as a new day.',
    ],
  },
  {
    id: 'badges', label: 'badges awarded for milestones',
    aliases: ['badge', 'achievement', 'trophy', 'award'],
    what: 'a permanent, Roblox-hosted marker awarded once for reaching something, checked before it is granted.',
    authority: 'server only. BadgeService throws on the client.',
    api: ['BadgeService:AwardBadge(userId, badgeId)', 'BadgeService:UserHasBadgeAsync(userId, badgeId)', 'BadgeService:GetBadgeInfoAsync(badgeId)'],
    pitfalls: [
      'awarding without UserHasBadgeAsync first, which burns the award rate limit on players who already have it.',
      'no pcall — these are web calls and they fail.',
      'awarding in a loop or on a frequent event; the limit is per place per minute and it is low.',
      'treating a badge as save data. It is a marker, not a store.',
    ],
  },
  {
    id: 'anticheat', label: 'server-side validation of what the client claims', prefab: 'remote_guard',
    aliases: ['anticheat', 'antiexploit', 'validation', 'rate limit', 'sanity check', 'exploit'],
    what: 'not a scanner. Every remote handler checking that what arrived is a thing this player could have done, and refusing it when it is not.',
    authority: 'entirely server. Client-side detection is advisory at best; the client is the attacker.',
    api: ['RemoteEvent.OnServerEvent — the player argument is trustworthy, everything after it is not', 'typeof() / type checks on every argument', 'os.clock() per player for rate limiting'],
    pitfalls: [
      'scanning the client for injected scripts, which is the approach that does not work and costs performance to be wrong.',
      'a remote with no type check, so a table where a number was expected errors the handler and skips the rest of the loop.',
      'a debounce held in a client-visible value rather than in a server table.',
      'validating position by distance-since-last-check without accounting for legitimate teleports, which punishes normal play.',
      'kicking on first suspicion, which bans players on lag spikes. Refuse the action; log the pattern.',
    ],
  },
  {
    id: 'vehicles', label: 'a drivable vehicle chassis',
    aliases: ['car', 'vehicle', 'chassis', 'driving', 'kart', 'boat', 'bike'],
    what: 'a seat that hands control to a driver, constraint-driven wheels, and physics owned by whoever the engine gave ownership to.',
    authority: 'network ownership, not a server loop. Fighting the ownership model is what makes Roblox vehicles feel wrong.',
    api: ['VehicleSeat / Seat and Seat.Occupant', 'CylindricalConstraint or HingeConstraint per wheel', 'BasePart:SetNetworkOwner(player)', 'LinearVelocity / AngularVelocity where a mover is needed'],
    pitfalls: [
      'BodyVelocity / BodyGyro / BodyThrust — deprecated legacy movers; LinearVelocity, AlignPosition and AlignOrientation replace them.',
      'driving from the server every frame, which is laggy for the driver and smooth for nobody.',
      'never setting network ownership, so the driver\'s inputs round-trip before the car moves.',
      'a chassis tuned for one part density that is destroyed by changing a single part\'s material.',
      'no reset when the driver leaves, leaving an unowned car twitching in the world.',
    ],
  },
  {
    id: 'racing_track', label: 'laps, checkpoints and a finish line',
    aliases: ['race', 'lap', 'finish line', 'circuit', 'track', 'time trial'],
    what: 'ordered checkpoints, a lap counted only when they were all passed in order, and a time taken from server time.',
    authority: 'server counts laps. A client-reported lap time is a leaderboard of exploits.',
    api: ['ordered checkpoint parts with a Touched handler', 'os.clock() on the server for timing', 'the same OrderedDataStore pattern as a leaderboard'],
    pitfalls: [
      'counting a lap on the finish line alone, so a player who drives backwards over it laps instantly.',
      'timing from the client, which makes every record a fiction.',
      'no per-character debounce, so one crossing counts several times.',
      'checkpoint order held as instance order in Workspace, which changes when someone drags a part.',
    ],
  },
  {
    id: 'teams', label: 'teams and team balancing',
    aliases: ['team', 'teams', 'sides', 'balance', 'faction'],
    what: 'the Teams service holding Team instances, players assigned by the server, and spawns filtered by TeamColor.',
    authority: 'server.',
    api: ['game:GetService("Teams")', 'Player.Team', 'Team.TeamColor', 'SpawnLocation.TeamColor and SpawnLocation.Neutral = false'],
    pitfalls: [
      'assigning by smallest team at join with no rebalance, which ends 8 v 2 after leavers.',
      'SpawnLocation.Neutral left true, so the TeamColor filter does nothing and everyone spawns everywhere.',
      'team-based damage rules checked on the client.',
      'changing Team without respawning, so the player keeps the old team\'s spawn and tools.',
    ],
  },
  {
    id: 'customization', label: 'skins, outfits and cosmetics',
    aliases: ['skin', 'outfit', 'cosmetic', 'avatar', 'customisation', 'appearance', 'wardrobe'],
    what: 'owned cosmetic ids in the save, applied to the character on spawn, with ownership checked before application.',
    authority: 'server owns the ownership list and applies the result.',
    api: ['Players:GetHumanoidDescriptionFromUserId(userId)', 'Humanoid:ApplyDescription(description)', 'Humanoid:GetAppliedDescription()', 'CharacterAppearanceLoaded'],
    pitfalls: [
      'applying a skin from a client remote without checking it is owned — every cosmetic becomes free.',
      'applying before the character has loaded, so the description is overwritten by the default avatar.',
      'storing the whole HumanoidDescription in the save rather than the id.',
      'accessories parented without removing the previous set, stacking hats forever.',
    ],
  },
  {
    id: 'tutorial', label: 'a first-time-player tutorial',
    aliases: ['tutorial', 'onboarding', 'first time', 'how to play', 'intro'],
    what: 'a sequence gated on a saved flag, shown once, and skippable — with the completion recorded on the server.',
    authority: 'the presentation is client-side; the "has seen it" flag is in the save.',
    api: ['the saved profile for the flag', 'a ScreenGui sequence', 'Players.PlayerAdded to decide before the character spawns'],
    pitfalls: [
      'the flag kept in a client value, so the tutorial replays on every join.',
      'no skip, which is the single largest first-session drop-off in Roblox experiences.',
      'the tutorial blocking input and never releasing it when a step fails.',
      'recording completion at the START, so a player who leaves halfway never sees the rest.',
    ],
  },
  {
    id: 'remotes', label: 'client/server messaging over remotes', prefab: 'remote_guard',
    aliases: ['remote', 'remoteevent', 'remotefunction', 'networking', 'replication', 'fireserver'],
    what: 'the boundary. Everything the client sends arrives as untrusted data on a handler that must check type, range, rate and permission.',
    authority: 'by definition, this IS the authority boundary.',
    api: ['RemoteEvent:FireServer / OnServerEvent', 'RemoteFunction:InvokeServer / OnServerInvoke', 'UnreliableRemoteEvent for high-rate lossy data', 'Instance attributes for state that only ever flows outward'],
    pitfalls: [
      'OnServerInvoke on a RemoteFunction that yields — one slow client stalls the handler for everyone.',
      'no rate limit, so a loop of FireServer is a denial of service against your own game.',
      'assuming arguments exist: a crafted call passes nothing, and `args[1].Name` errors out of the handler.',
      'trusting a passed Player object instead of the implicit first argument.',
      'one remote for many actions dispatched on a client-sent string, which is one missing check away from every action.',
    ],
  },
  {
    id: 'ragdoll', label: 'a ragdoll on death or knockback',
    aliases: ['ragdoll', 'limp', 'death physics', 'knockback'],
    what: 'replacing the Motor6D joints with BallSocketConstraints and putting the Humanoid into Physics state, then reversing it exactly.',
    authority: 'server initiates so it replicates; network ownership decides who simulates.',
    api: ['Humanoid:ChangeState(Enum.HumanoidStateType.Physics)', 'BallSocketConstraint with Attachment0/Attachment1 from the Motor6D', 'Motor6D.Enabled = false', 'Humanoid.PlatformStand', 'Humanoid:SetStateEnabled(Enum.HumanoidStateType.GettingUp, false)'],
    pitfalls: [
      'destroying the Motor6D instead of disabling it, which makes standing up impossible.',
      'no constraint limits, so the ragdoll inverts through itself.',
      'ragdolling on the client only, so everyone else sees the character standing.',
      'forgetting to re-enable the GettingUp state, leaving the player permanently on the floor.',
      'the HumanoidRootPart still collidable, which wedges ragdolls into walls.',
    ],
  },
  {
    id: 'placement', label: 'placing and rotating a model on a grid',
    aliases: ['placement', 'build mode', 'furniture', 'grid', 'building system', 'place model'],
    what: 'a client-side ghost snapped to a grid, and a server that re-derives the final CFrame and re-checks the collision before anything is built.',
    authority: 'the preview is the client\'s; the placement is the server\'s.',
    api: ['workspace:GetPartBoundsInBox(cframe, size, OverlapParams)', 'Mouse / UserInputService for the preview', 'CFrame snapping via math.round(x / grid) * grid'],
    pitfalls: [
      'accepting the client\'s CFrame, which places objects inside other players, inside walls, or off the plot.',
      'collision-checking with Touched, which does not fire for an anchored part that has not moved.',
      'the preview part left collidable, so it shoves the character placing it.',
      'no per-plot limit, so one player can spawn ten thousand parts.',
    ],
  },
  {
    id: 'zones', label: 'named zones a player enters and leaves',
    aliases: ['zone', 'area', 'region', 'safe zone', 'trigger', 'biome'],
    what: 'a volume with enter and leave events that stay correct when a player dies, teleports, or the zone itself moves.',
    authority: 'server for anything a zone grants.',
    api: ['workspace:GetPartBoundsInBox(cframe, size, OverlapParams)', 'workspace:GetPartsInPart(part, OverlapParams)', 'OverlapParams with FilterDescendantsInstances'],
    pitfalls: [
      'Region3 and FindPartsInRegion3 — superseded by the GetPartBoundsInBox / GetPartsInPart family.',
      'Touched / TouchEnded for zones: TouchEnded does not fire reliably, so players stay "inside" a zone they left.',
      'a leave event never fired on death, leaving the player in the zone forever.',
      'polling every zone against every player every frame instead of on a Heartbeat interval with a spatial filter.',
    ],
  },
  {
    id: 'camera', label: 'a custom camera',
    aliases: ['camera', 'first person', 'third person', 'shiftlock', 'camera shake', 'cutscene'],
    what: 'taking over Camera.CFrame in a RenderStepped-bound client loop, and handing it back cleanly.',
    authority: 'client only. The server has no camera; touching it there does nothing.',
    api: ['workspace.CurrentCamera', 'Camera.CameraType = Enum.CameraType.Scriptable', 'RunService.RenderStepped / BindToRenderStep', 'Camera.FieldOfView'],
    pitfalls: [
      'never restoring CameraType to Custom, leaving the player unable to look around after a cutscene.',
      'a camera script on the server, where CurrentCamera is nil.',
      'the CFrame set in Heartbeat rather than RenderStepped, which is visibly jittery.',
      'BindToRenderStep without a matching UnbindFromRenderStep, so the loops accumulate on respawn.',
    ],
  },
  {
    id: 'admin_commands', label: 'in-game moderation commands',
    aliases: ['admin', 'commands', 'moderation', 'kick', 'ban', 'staff'],
    what: 'a command table with a permission level per command, executed on the server, addressed by UserId.',
    authority: 'server, and the permission list must not be readable or writable from the client.',
    api: ['Player:Kick(reason)', 'Players:BanAsync({ UserIds, Duration, DisplayReason })', 'Players:UnbanAsync', 'TextChatService TextChatCommand for the chat surface'],
    pitfalls: [
      'the permission list in ReplicatedStorage, where every client can read exactly who to impersonate.',
      'permission checked on the client before firing the remote and nowhere else.',
      'commands keyed by username rather than UserId, so a rename transfers admin to a stranger.',
      'no audit of who ran what, which makes an abusing moderator impossible to find.',
      'the legacy Chat service for the command surface; TextChatCommand is the current one.',
    ],
  },
  {
    id: 'procedural_terrain', label: 'procedurally generated terrain or maps',
    aliases: ['procedural', 'terrain', 'generation', 'voxel', 'noise', 'chunks', 'world gen'],
    what: 'a seeded noise function turned into geometry in chunks, generated near the player and released when far.',
    authority: 'server if the world is shared; the SEED is what makes two servers agree.',
    api: ['math.noise(x, y, z)', 'Random.new(seed)', 'Terrain:FillRegion / Terrain:WriteVoxels / Terrain:FillBlock', 'task.wait() between chunks to yield'],
    pitfalls: [
      'generating without yielding, which freezes the server long enough to be disconnected for it.',
      'an unseeded Random, so the world differs per server and nothing can be saved about it.',
      'chunks never released, so memory grows until the place crashes.',
      'part-based voxels at fine resolution — tens of thousands of parts; Terrain voxels or greedy meshing instead.',
    ],
  },
];

export const MECHANIC_PATTERNS: readonly MechanicPattern[] = P;

/**
 * What the licence permits, said in the only terms that matter here.
 *
 * NONE of these permit the agent to paste the code — that is settled by this product not vendoring
 * anything, not by the licence. The distinction that IS load-bearing is whether a customer could
 * later decide to vendor it, and a copyleft licence would take their whole game with it.
 */
export function licenceGuidance(spdx: string): string {
  if (/^(GPL|AGPL|LGPL)/.test(spdx)) {
    return `${spdx} is copyleft: read it to understand the approach, then write your own. Copying any of it would place the customer's whole game under ${spdx}.`;
  }
  if (/^CC-BY-SA/.test(spdx)) {
    return `${spdx} is share-alike: derivative work must carry the same licence. Read for the approach; write your own.`;
  }
  if (/^(MIT|Apache|BSD|ISC|MPL|Zlib|CC0|Unlicense|WTFPL)/.test(spdx)) {
    return `${spdx} is permissive, but Apple still does not copy: read it for the approach and write code shaped like this customer's game.`;
  }
  return `${spdx}: treat as read-only reference. Do not copy.`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Rank the mechanics against what the builder actually typed.
 *
 * Scored rather than filtered: "add a shop where people buy pets with coins" is three mechanics and
 * a tool that returned only the best one would send the agent back twice.
 */
export function rankMechanics(query: string): { pattern: MechanicPattern; score: number }[] {
  const q = ` ${norm(query)} `;
  const scored = MECHANIC_PATTERNS.map((pattern) => {
    let score = 0;
    const hit = (needle: string, weight: number) => {
      const n = norm(needle);
      if (n && q.includes(` ${n} `)) score += weight;
      else if (n && n.includes(' ') && q.includes(n)) score += weight;
    };
    hit(pattern.id.replace(/_/g, ' '), 5);
    hit(pattern.label, 4);
    for (const a of pattern.aliases ?? []) hit(a, 3);
    for (const w of norm(pattern.label).split(' ')) if (w.length > 3) hit(w, 1);
    return { pattern, score };
  }).filter((r) => r.score > 0);
  return scored.sort((a, b) => b.score - a.score || a.pattern.id.localeCompare(b.pattern.id));
}

export interface MechanicAnswer {
  mechanic: string;
  what: string;
  authority: string;
  currentApi: readonly string[];
  pitfalls: readonly string[];
  /** Present only when this repository SHIPS the module — installing beats re-deriving. */
  installInstead?: { prefab: string; summary: string; note: string };
  /**
   * Repositories that demonstrably implement it. Empty is an ANSWER, not silence: it means the
   * curator read the trees and found none, and the count of what it searched says so.
   */
  implementations: {
    repo: string; author: string; url: string; stars: number;
    licence: string; licenceUrl: string | null; licenceGuidance: string;
    evidence: string; currency: string; avoidTheseCallsItUses?: string[];
  }[];
  searchedRepositories: number;
  vendoring: string;
}

const citationsFor = (id: string): MechanicCitation[] =>
  MECHANIC_CITATIONS.filter((c) => c.mechanics.some((m) => m.id === id))
    .slice()
    .sort((a, b) => b.stars - a.stars);

export function answerFor(pattern: MechanicPattern, limit = 4): MechanicAnswer {
  const prefab = pattern.prefab ? PREFABS[pattern.prefab] : undefined;
  return {
    mechanic: pattern.label,
    what: pattern.what,
    authority: pattern.authority,
    currentApi: pattern.api,
    pitfalls: pattern.pitfalls,
    ...(prefab
      ? {
        installInstead: {
          prefab: prefab.id,
          summary: prefab.summary,
          note: `install_module("${prefab.id}") ships reviewed source for this. Use it instead of writing a fourth version — the repositories below are for the parts it does not cover.`,
        },
      }
      : {}),
    implementations: citationsFor(pattern.id).slice(0, limit).map((c) => {
      const file = c.mechanics.find((m) => m.id === pattern.id)?.file ?? '';
      return {
        repo: c.repo,
        author: c.owner,
        url: c.url,
        stars: c.stars,
        licence: c.licence,
        licenceUrl: c.licenceUrl,
        licenceGuidance: licenceGuidance(c.licence),
        evidence: `${file} — the path this repository was cited for`,
        currency: c.currency === 'clean'
          ? 'the cited files were read: no removed or deprecated Roblox call in them'
          : 'the cited files were read and DO contain deprecated calls, listed below',
        ...(c.deprecated.length ? { avoidTheseCallsItUses: c.deprecated } : {}),
      };
    }),
    searchedRepositories: MECHANIC_CITATIONS.length,
    vendoring: 'Read these to understand the approach, then write the mechanic for THIS game. '
      + 'Do not copy their code: Apple vendors nothing, and a customer\'s game must not carry '
      + 'someone else\'s licence.',
  };
}

export const MECHANIC_MENU = MECHANIC_PATTERNS.map((p) => p.id).join(', ');
