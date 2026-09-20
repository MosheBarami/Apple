#!/usr/bin/env node
/**
 * WHAT "FRONTIER FOR ROBLOX" MEANS, WRITTEN DOWN AS ITEMS THAT CAN ONLY BE PASSED BY RUNNING.
 *
 * ------------------------------------------------------------------------------------------------
 * THE DEFINITION THIS FILE IS AN ATTEMPT AT
 * ------------------------------------------------------------------------------------------------
 * "Frontier general LLM" and "frontier for Roblox" are different claims and only the second one is
 * ours to make. A general benchmark cannot settle it: there is no MMLU for "builds a working obby
 * in somebody's Studio place", and a model that writes beautiful, idiomatic, parsing Luau can still
 * produce a shop that an exploiter drains in an hour.
 *
 * So the operational definition used here is:
 *
 *     A model is frontier FOR ROBLOX to the extent that, on tasks where the tempting answer and the
 *     correct answer use the SAME VOCABULARY, it picks the correct one — and the difference is
 *     decidable by running the code, not by reading it.
 *
 * Every item below is built to that shape. Each one has a wrong answer that a strong general model
 * plausibly writes: it parses, it reads well, it names the right classes, and it is wrong in a way
 * that only shows up in a live Roblox server — as a drained economy, a wiped save, an animation
 * that does not play on a modern rig, or a panel off the bottom of a phone screen. If an item can
 * be passed by mentioning the right words, it does not belong here.
 *
 * ------------------------------------------------------------------------------------------------
 * WHY EVERY CHECK IS AN OBSERVATION AND NOT A RUBRIC
 * ------------------------------------------------------------------------------------------------
 * A rubric a model grades itself against is not a benchmark, and neither is a regex. The three
 * checks below all pass on code that is wrong:
 *
 *     contains "Animator"          -> passes on `humanoid:LoadAnimation(anim)` with an unused
 *                                     `local animator = humanoid:FindFirstChildOfClass("Animator")`
 *     contains "pcall"             -> passes on a pcall around the GET and a bare SET
 *     regex /UpdateAsync/          -> passes on a GetAsync/SetAsync pair with UpdateAsync in a
 *                                     comment, or in a function that is never called
 *
 * So no check here reads the text. Every check reads a RECORDING of what the model's code did when
 * it ran under `frontier-harness.luau`: which method was called on which class, what the balance
 * was after a hostile remote fire, what was in the DataStore after a throttle. `calls`, `created`,
 * `globals`, `storeOps` and `facts` are all produced by execution.
 *
 * Two static checks are the exception and they are labelled `static` in the source: they delegate
 * to `packages/evals/src/roblox-antipatterns.mjs`, whose rules are already justified by a named
 * exploit each and already tested. Where a static rule and a behavioural check disagree, the
 * behavioural one decides.
 *
 * ------------------------------------------------------------------------------------------------
 * EVERY CHECK CARRIES A NEGATIVE CONTROL, AND THAT IS THE POINT
 * ------------------------------------------------------------------------------------------------
 * A check that cannot fail measures nothing while looking exactly like a check that passes. That is
 * this repository's central failure shape — a thing PRESENT and never REACHED — and it is the
 * easiest possible mistake to make in a benchmark, because a suite where everything passes reads as
 * good news.
 *
 * So every item carries a `controls` block: one `pass` answer that must pass EVERY check, and one
 * `fail` answer per check that must fail THAT check. `roblox-frontier.test.mjs` runs them through
 * the same scorer the model's answers go through and goes red if any check is unfalsifiable, if the
 * pass control fails anything, or if a check has no control at all. The controls are hand-written
 * Luau, not model output, and they are the first thing to read when a number here looks wrong.
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE
 * ------------------------------------------------------------------------------------------------
 *   - No check on style, naming, comments, or whether the answer "explains itself". Those are not
 *     Roblox competence and scoring them would let a verbose wrong answer beat a terse right one.
 *   - No reference answer and no similarity score anywhere. A model that solves an item in a shape
 *     nobody here thought of passes.
 *   - No item whose correct answer depends on a Roblox behaviour this harness invents. Where the
 *     harness cannot answer honestly it returns `null` and the check is recorded as UNRESOLVED,
 *     which is neither a pass nor a fail and is reported on its own line.
 *
 * Deprecation facts are cited to the skill files that carry them (which cite the Engine Reference),
 * never to memory; the citation is on each item.
 */

// ------------------------------------------------------------------------------------------------
// Predicates over the recording. Every one of these reads execution output.
// ------------------------------------------------------------------------------------------------

/** Was `method` called on an instance whose class is `cls`, in any phase? */
export const calledOn = (t, cls, method) =>
  (t.calls ?? []).some((c) => c.target === cls && c.method === method);

/** Was `method` called on an instance whose class is `cls`, during the model's own script? */
export const calledOnInBuild = (t, cls, method) =>
  (t.calls ?? []).some((c) => c.target === cls && c.method === method && c.phase === 'build');

/** How many instances of `cls` did the script create? */
export const createdCount = (t, cls) => Number(t.created?.[cls] ?? 0);

/** How many times was a global/scheduler entry point used? */
export const globalCount = (t, name) => Number(t.globals?.[name] ?? 0);

/** A fact the item's own probe recorded. `undefined` when the probe never got that far. */
export const fact = (t, key) => t.facts?.[key];

/** Errors thrown INSIDE a handler the probe fired. An empty list is the passing state. */
export const handlerErrors = (t) => {
  const e = t.handlerErrors;
  return Array.isArray(e) ? e : [];
};

/** Did any store operation land after the probe switched to the named phase? */
export const storeOpsInPhase = (t, phase, ops = ['SetAsync', 'UpdateAsync', 'IncrementAsync']) =>
  (t.storeOps ?? []).filter((o) => o.phase === phase && ops.includes(o.op)).length;

export const storeWrites = (t) =>
  (t.storeOps ?? []).filter((o) => ['SetAsync', 'UpdateAsync', 'IncrementAsync'].includes(o.op)).length;

/** A static rule from packages/evals/src/roblox-antipatterns.mjs fired. */
export const ruleFired = (t, ruleId) => (t.antipatterns ?? []).some((f) => f.rule === ruleId);

const LEGACY_MOVERS = ['BodyVelocity', 'BodyPosition', 'BodyGyro', 'BodyThrust', 'BodyAngularVelocity', 'RocketPropulsion'];

// ------------------------------------------------------------------------------------------------
// The items.
// ------------------------------------------------------------------------------------------------

const check = (id, why, run) => ({ id, why, run });

export const FRONTIER_ITEMS = [
  // ============================================================================== modern API
  {
    id: 'anim-emote',
    axis: 'modern-api',
    shape: 'script',
    cite: 'roblox-animation/SKILL.md:184 — "Humanoid:LoadAnimation(anim) (deprecated — use Animator)"',
    prompt:
      'Write a LocalScript for StarterPlayerScripts. When the player presses E, play the emote '
      + 'animation rbxassetid://507771019 on their own character. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local p = __APPLE.localPlayer
__APPLE.fireOn(game:GetService("UserInputService"), "InputBegan", { KeyCode = Enum.KeyCode.E, UserInputType = Enum.UserInputType.Keyboard }, false)
__APPLE.fact("animatorLoads", __APPLE.calledMethodOn("Animator", "LoadAnimation"))
__APPLE.fact("humanoidLoads", __APPLE.calledMethodOn("Humanoid", "LoadAnimation"))
`,
    checks: [
      check('loads-through-animator', 'the AnimationTrack must come from the Animator, which is the only supported path on a modern rig',
        (t) => calledOn(t, 'Animator', 'LoadAnimation')),
      check('not-humanoid-loadanimation', 'Humanoid:LoadAnimation is deprecated; it still returns a track today and is the single commonest stale-training answer',
        (t) => !calledOn(t, 'Humanoid', 'LoadAnimation')),
      check('track-is-played', 'a loaded track that is never played is an animation that never runs',
        (t) => calledOn(t, 'AnimationTrack', 'Play')),
    ],
  },
  {
    id: 'round-countdown',
    axis: 'modern-api',
    shape: 'script',
    cite: 'roblox hub SKILL.md principle 4 — "task.* scheduler ... Avoid deprecated ... wait/spawn/delay"; apps/worker/src/prompts.ts:15 says the same to the model in production',
    prompt:
      'Write a server Script for ServerScriptService that runs a 10 second round countdown. Each '
      + 'second it updates an IntValue named "TimeLeft" in ReplicatedStorage, and when it reaches zero it '
      + 'fires a RemoteEvent named "RoundOver" in ReplicatedStorage to every client. Create the IntValue and '
      + 'the RemoteEvent in the script. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
__APPLE.fact("firedAll", __APPLE.calledMethodOn("RemoteEvent", "FireAllClients"))
`,
    checks: [
      check('no-legacy-scheduler', 'bare wait() is throttled to ~30Hz and drifts without bound under load; spawn/delay insert an arbitrary first-resume delay, which is why Studio-correct round timers desync live',
        (t) => globalCount(t, 'wait') === 0 && globalCount(t, 'spawn') === 0 && globalCount(t, 'delay') === 0),
      check('uses-task-scheduler', 'the countdown has to actually yield through task.* rather than busy-loop',
        (t) => globalCount(t, 'task.wait') > 0 || globalCount(t, 'task.delay') > 0 || globalCount(t, 'task.defer') > 0),
      check('countdown-completes', 'the round has to end: the remote is fired to all clients by the time the script finishes',
        (t) => calledOn(t, 'RemoteEvent', 'FireAllClients')),
    ],
  },
  {
    id: 'platform-mover',
    axis: 'modern-api',
    shape: 'script',
    cite: 'roblox-physics/SKILL.md:88,90 — BodyPosition -> AlignPosition, BodyVelocity -> LinearVelocity',
    prompt:
      'Write a server Script for ServerScriptService. There is a Part named "Platform" in Workspace. '
      + 'Make it move smoothly back and forth between its starting position and a point 8 studs to the side, '
      + 'taking 3 seconds each way, forever. Reply with one fenced luau code block and nothing else.',
    setup: `
local platform = Instance.new("Part")
platform.Name = "Platform"
platform.Anchored = true
platform.Parent = workspace
`,
    probe: `
__APPLE.setPhase("probe")
local platform = __APPLE.findAny("Platform")
__APPLE.fact("platformWrites", (__APPLE.writeCount(platform, "Position") + __APPLE.writeCount(platform, "CFrame")) > 1)
__APPLE.fact("tweensCreated", __APPLE.calledMethodOn("TweenService", "Create"))
`,
    checks: [
      check('no-legacy-body-movers', 'the Body* movers are legacy physics, superseded by the constraint equivalents, and are what a model trained on 2018 Roblox reaches for first',
        (t) => LEGACY_MOVERS.every((c) => createdCount(t, c) === 0)),
      check('actually-moves-it', 'a TweenService tween, a mover constraint, or a CFrame loop — any of the three, but something has to move the part',
        (t) =>
          calledOn(t, 'TweenService', 'Create')
          || createdCount(t, 'AlignPosition') > 0
          || createdCount(t, 'LinearVelocity') > 0
          || createdCount(t, 'PrismaticConstraint') > 0
          || Boolean(fact(t, 'platformWrites'))),
    ],
  },
  {
    id: 'chat-system-message',
    axis: 'modern-api',
    shape: 'script',
    cite: 'roblox hub SKILL.md, "Modern API notes" — "Use TextChatService for modern chat; the legacy Chat service still exists but is the older API"',
    prompt:
      'Write a LocalScript for StarterPlayerScripts. There is a RemoteEvent named "RoundWon" in '
      + 'ReplicatedStorage; when it fires with the winning player\'s name, put a message in this player\'s '
      + 'chat window saying who won. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local rs = game:GetService("ReplicatedStorage")
local remote = __APPLE.find("RemoteEvent", "RoundWon") or rs:FindFirstChild("RoundWon")
if remote then __APPLE.fireOn(remote, "OnClientEvent", "Winner") end
__APPLE.fact("textChannel", __APPLE.calledMethodOn("TextChannel", "DisplaySystemMessage"))
__APPLE.fact("legacySetCore", __APPLE.calledMethodOn("StarterGui", "SetCore"))
`,
    checks: [
      check('uses-textchatservice', 'a system message belongs on a TextChatService TextChannel; StarterGui:SetCore("ChatMakeSystemMessage") is the legacy path',
        (t) => calledOn(t, 'TextChannel', 'DisplaySystemMessage') || calledOn(t, 'TextChatService', 'DisplaySystemMessage')),
      check('not-legacy-setcore', 'SetCore("ChatMakeSystemMessage") targets the legacy chat window and does nothing in an experience using TextChatService',
        (t) => !(t.calls ?? []).some((c) => c.method === 'SetCore' && String(c.name).includes('ChatMakeSystemMessage'))),
    ],
  },
  {
    id: 'ui-slide-in',
    axis: 'modern-api',
    shape: 'script',
    cite: 'packages/training/src/score-ui.mjs DEPRECATED_MEMBERS — GuiObject:TweenPosition/TweenSize, source classes/GuiObject.yaml',
    prompt:
      'Write a LocalScript for StarterPlayerScripts that builds, in code, a ScreenGui containing a '
      + 'TextButton named "ShopButton" and a Frame named "Shop" that starts off the bottom of the screen. '
      + 'Clicking the button slides the Shop frame into view over 0.4 seconds. '
      + 'Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local btn = __APPLE.find("TextButton", "ShopButton") or __APPLE.findAny("ShopButton")
if btn then
  __APPLE.fireOn(btn, "Activated")
  __APPLE.fireOn(btn, "MouseButton1Click")
end
__APPLE.fact("tweenCreated", __APPLE.calledMethodOn("TweenService", "Create"))
__APPLE.fact("tweenPlayed", __APPLE.calledMethodOn("Tween", "Play"))
`,
    checks: [
      check('no-deprecated-gui-tween', 'GuiObject:TweenPosition/:TweenSize are deprecated in favour of TweenService:Create and cannot be cancelled or composed',
        (t) => !calledOn(t, 'Frame', 'TweenPosition') && !calledOn(t, 'Frame', 'TweenSize')
          && !calledOn(t, 'Frame', 'TweenSizeAndPosition') && !calledOn(t, 'TextButton', 'TweenPosition')),
      check('tween-runs-on-click', 'the tween has to be created AND played, from inside the click handler — a tween built at load and never played is a panel that never moves',
        (t) => calledOn(t, 'TweenService', 'Create') && calledOn(t, 'Tween', 'Play')),
    ],
  },
  {
    id: 'look-raycast',
    axis: 'modern-api',
    shape: 'script',
    cite: 'Workspace:Raycast is the supported ray query; Workspace:FindPartOnRay / :FindPartOnRayWithIgnoreList are the deprecated predecessors (Engine Reference, classes/Workspace)',
    prompt:
      'Write a LocalScript for StarterPlayerScripts. Every time the player clicks, find which part '
      + 'they are looking at from the camera, up to 200 studs away, ignoring their own character, and print its '
      + 'name. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
__APPLE.fireOn(game:GetService("UserInputService"), "InputBegan", { UserInputType = Enum.UserInputType.MouseButton1, KeyCode = Enum.KeyCode.Unknown }, false)
__APPLE.fact("modernRaycast", __APPLE.calledMethodOn("Workspace", "Raycast"))
__APPLE.fact("legacyRaycast", __APPLE.calledMethodOn("Workspace", "FindPartOnRay"))
`,
    checks: [
      check('uses-workspace-raycast', 'Workspace:Raycast with RaycastParams is the supported query; it is also the only one that can express a filter list without allocating a table per call',
        (t) => calledOn(t, 'Workspace', 'Raycast')),
      check('not-findpartonray', 'FindPartOnRay and FindPartOnRayWithIgnoreList are deprecated and still answer, which is why a stale model never notices',
        (t) => !calledOn(t, 'Workspace', 'FindPartOnRay') && !calledOn(t, 'Workspace', 'FindPartOnRayWithIgnoreList')),
    ],
  },

  // ============================================================================== server authority
  {
    id: 'shop-debit',
    axis: 'server-authority',
    shape: 'script',
    cite: 'roblox hub SKILL.md principle 1 — "Validate or simulate on the server"; roblox-antipatterns.mjs server-trusts-client-amount',
    prompt:
      'Write a server Script for ServerScriptService. Players buy a sword for 100 coins. A player\'s '
      + 'coins are an IntValue named "Coins" inside a Folder named "leaderstats" inside the Player. The client '
      + 'fires a RemoteEvent named "BuyItem" in ReplicatedStorage with the name of the item they want. Create '
      + 'the RemoteEvent in the script and handle the purchase. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local p = __APPLE.player("Buyer")
local stats = Instance.new("Folder") stats.Name = "leaderstats" stats.Parent = p
local coins = Instance.new("IntValue") coins.Name = "Coins" coins.Value = 250 coins.Parent = stats
__APPLE.fireRemote("BuyItem", p, "sword")
__APPLE.fact("afterOne", coins.Value)
__APPLE.fireRemote("BuyItem", p, "sword")
__APPLE.fact("afterTwo", coins.Value)
-- The player can no longer afford it. A handler that debits anyway goes negative.
__APPLE.fireRemote("BuyItem", p, "sword")
__APPLE.fireRemote("BuyItem", p, "sword")
__APPLE.fact("afterBroke", coins.Value)
-- Hostile shapes an exploiter sends for free.
__APPLE.fireRemote("BuyItem", p, nil)
__APPLE.fireRemote("BuyItem", p, {})
__APPLE.fireRemote("BuyItem", p, 1e9)
__APPLE.fireRemote("BuyItem", p, -500)
__APPLE.fireRemote("BuyItem", p, string.rep("x", 4000))
__APPLE.fact("afterHostile", coins.Value)
`,
    checks: [
      check('legit-purchase-works', 'a benchmark that only rewards refusal is passed by a handler that refuses everything',
        (t) => fact(t, 'afterOne') === 150),
      check('refuses-when-unaffordable', 'the third and fourth attempts are made with 50 coins against a 100 coin price; a handler that debits anyway mints negative money',
        (t) => fact(t, 'afterBroke') === 50),
      check('survives-hostile-arguments', 'nil, a table, a number, a negative number and a 4,000-character string are what an exploiter sends first; a handler that indexes them without checking throws and takes the connection down',
        (t) => handlerErrors(t).length === 0),
      check('hostile-input-changes-nothing', 'no shape of junk may move the balance — a handler that takes the price from the argument CREDITS 500 coins when the argument is -500',
        (t) => fact(t, 'afterHostile') === fact(t, 'afterBroke')),
    ],
  },
  {
    id: 'client-quantity',
    axis: 'server-authority',
    shape: 'script',
    cite: 'roblox-antipatterns.mjs server-trusts-client-amount / unvalidated-remote-arg',
    prompt:
      'Write a server Script for ServerScriptService. Players buy healing potions at 25 coins each. '
      + 'The client fires a RemoteEvent named "BuyPotion" in ReplicatedStorage with how many potions they want. '
      + 'Coins are an IntValue named "Coins" inside a Folder named "leaderstats" inside the Player, and potions '
      + 'are an IntValue named "Potions" in the same folder. Create the RemoteEvent in the script and handle the '
      + 'purchase. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local p = __APPLE.player("Buyer")
local stats = Instance.new("Folder") stats.Name = "leaderstats" stats.Parent = p
local coins = Instance.new("IntValue") coins.Name = "Coins" coins.Value = 100 coins.Parent = stats
local potions = Instance.new("IntValue") potions.Name = "Potions" potions.Value = 0 potions.Parent = stats
__APPLE.fireRemote("BuyPotion", p, 2)
__APPLE.fact("coinsAfterLegit", coins.Value)
__APPLE.fact("potionsAfterLegit", potions.Value)
-- A NEGATIVE quantity is free money in any handler that multiplies before it validates.
__APPLE.fireRemote("BuyPotion", p, -10)
__APPLE.fact("coinsAfterNegative", coins.Value)
__APPLE.fact("potionsAfterNegative", potions.Value)
-- A quantity nobody can afford, and a fractional one.
__APPLE.fireRemote("BuyPotion", p, 1e9)
__APPLE.fireRemote("BuyPotion", p, 0.5)
__APPLE.fireRemote("BuyPotion", p, "3")
__APPLE.fireRemote("BuyPotion", p, {})
__APPLE.fact("coinsFinal", coins.Value)
__APPLE.fact("potionsFinal", potions.Value)
`,
    checks: [
      check('legit-purchase-works', 'two potions for fifty coins has to work, or refusing everything would score full marks',
        (t) => fact(t, 'coinsAfterLegit') === 50 && fact(t, 'potionsAfterLegit') === 2),
      check('negative-quantity-refused', 'quantity -10 at 25 coins each CREDITS 250 coins in a handler that computes cost before it validates sign — the classic Roblox economy drain',
        (t) => fact(t, 'coinsAfterNegative') <= 50 && fact(t, 'potionsAfterNegative') >= 0),
      check('unaffordable-quantity-refused', 'a billion potions must not take the balance below zero',
        (t) => fact(t, 'coinsFinal') >= 0),
      check('survives-hostile-arguments', 'a fractional count, a numeric string and a table are all free to send',
        (t) => handlerErrors(t).length === 0),
      check('no-fractional-items', '0.5 potions is a corrupted IntValue and a corrupted save',
        (t) => Number.isInteger(Number(fact(t, 'potionsFinal')))),
    ],
  },
  {
    id: 'admin-command',
    axis: 'server-authority',
    shape: 'script',
    cite: 'roblox-networking — the server decides who may act; a client-side check is a suggestion',
    prompt:
      'Write a server Script for ServerScriptService. Admins can teleport any player to a position. '
      + 'The client fires a RemoteEvent named "TeleportPlayer" in ReplicatedStorage with the target Player and a '
      + 'Vector3. Only players whose UserId is in the list ADMINS = {1001} may do this; everyone else must be '
      + 'ignored. Create the RemoteEvent in the script. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local admin = __APPLE.player("Admin", 1001)
local griefer = __APPLE.player("Griefer", 7777)
__APPLE.fact("adminId", admin.UserId)
__APPLE.fact("grieferId", griefer.UserId)
local target = __APPLE.player("Victim")
-- The griefer fires the admin's remote. Nothing may move.
__APPLE.fireRemote("TeleportPlayer", griefer, target, Vector3.new(0, 500, 0))
__APPLE.fact("movedByGriefer", __APPLE.moveEvidence(target.Character))
-- And a griefer who lies about who they are by passing the admin along as an argument.
__APPLE.fireRemote("TeleportPlayer", griefer, target, Vector3.new(0, 500, 0), admin)
__APPLE.fact("movedBySpoof", __APPLE.moveEvidence(target.Character))
__APPLE.fireRemote("TeleportPlayer", griefer, nil, nil)
__APPLE.fireRemote("TeleportPlayer", griefer, {}, "up")
`,
    checks: [
      check('non-admin-is-ignored', 'the first argument of OnServerEvent is the only trustworthy identity in the whole call; a handler that reads the admin id from an argument is not an admin check',
        (t) => fact(t, 'movedByGriefer') === 0),
      check('spoofed-identity-is-ignored', 'passing the admin Player object as a later argument must not help',
        (t) => fact(t, 'movedBySpoof') === 0),
      check('survives-hostile-arguments', 'nil target, table target, string position',
        (t) => handlerErrors(t).length === 0),
    ],
  },
  {
    id: 'reward-cooldown',
    axis: 'server-authority',
    shape: 'script',
    cite: 'roblox-antipatterns.mjs yield-inside-currency-debit — re-entrancy is the mechanism behind "charged once, received twice"',
    prompt:
      'Write a server Script for ServerScriptService. A player can claim a reward of 500 coins by '
      + 'firing a RemoteEvent named "ClaimReward" in ReplicatedStorage, but only once every 60 seconds. Coins are '
      + 'an IntValue named "Coins" inside a Folder named "leaderstats" inside the Player. Create the RemoteEvent '
      + 'in the script. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local p = __APPLE.player("Claimer")
local stats = Instance.new("Folder") stats.Name = "leaderstats" stats.Parent = p
local coins = Instance.new("IntValue") coins.Name = "Coins" coins.Value = 0 coins.Parent = stats
__APPLE.fireRemote("ClaimReward", p)
__APPLE.fact("afterFirst", coins.Value)
for i = 1, 40 do __APPLE.fireRemote("ClaimReward", p) end
__APPLE.fact("afterSpam", coins.Value)
`,
    checks: [
      check('first-claim-pays', 'the reward has to be payable, or a handler that pays nobody scores full marks',
        (t) => fact(t, 'afterFirst') === 500),
      check('spam-pays-once', 'forty fires in the same instant is one macro; a cooldown stored per player on the server is the only thing that holds',
        (t) => fact(t, 'afterSpam') === 500),
      check('survives-hostile-arguments', 'the remote is fired forty-one times with no arguments at all',
        (t) => handlerErrors(t).length === 0),
    ],
  },
  {
    id: 'pet-rename',
    axis: 'server-authority',
    shape: 'script',
    cite: 'roblox-core / TextService:FilterStringAsync — filtering player-authored text that other players will see is a platform requirement, not a nicety',
    prompt:
      'Write a server Script for ServerScriptService. Players can rename their pet: the client fires '
      + 'a RemoteEvent named "RenamePet" in ReplicatedStorage with the new name, and the server stores it in a '
      + 'StringValue named "PetName" inside the Player. Other players see this name above the pet. Create the '
      + 'RemoteEvent and the StringValue in the script. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local p = __APPLE.player("Owner")
__APPLE.fireRemote("RenamePet", p, "Rex")
local nameValue = p:FindFirstChild("PetName") or __APPLE.findAny("PetName")
__APPLE.fact("afterLegit", nameValue and nameValue.Value or nil)
__APPLE.fireRemote("RenamePet", p, string.rep("z", 5000))
__APPLE.fact("lengthAfterHuge", nameValue and #tostring(nameValue.Value) or 0)
__APPLE.fireRemote("RenamePet", p, nil)
__APPLE.fireRemote("RenamePet", p, {})
__APPLE.fireRemote("RenamePet", p, 12)
__APPLE.fact("filtered", __APPLE.calledMethodOn("TextService", "FilterStringAsync"))
`,
    checks: [
      check('legit-rename-works', 'a plain name has to land',
        (t) => fact(t, 'afterLegit') !== null && fact(t, 'afterLegit') !== undefined),
      check('length-is-bounded', 'a 5,000-character name is a DataStore entry, a replicated string and a BillboardGui, all at once',
        (t) => Number(fact(t, 'lengthAfterHuge')) <= 200),
      check('survives-hostile-arguments', 'nil, a table and a number sent as the new name',
        (t) => handlerErrors(t).length === 0),
      check('text-is-filtered', 'player-authored text that other players will see must go through TextService:FilterStringAsync; skipping it is a moderation violation, not a style choice',
        (t) => calledOn(t, 'TextService', 'FilterStringAsync') || calledOn(t, 'Chat', 'FilterStringForBroadcast')),
    ],
  },

  // ============================================================================== datastore safety
  {
    id: 'save-survives-throttle',
    axis: 'datastore-safety',
    shape: 'script',
    cite: 'roblox hub SKILL.md principle 2 — "Wrap DataStore ... calls in pcall. Have a plan for transient vs permanent errors"; roblox-antipatterns.mjs datastore-without-pcall / datastore-without-retry',
    prompt:
      'Write a server Script for ServerScriptService that saves a player\'s coins when they leave. '
      + 'Coins are an IntValue named "Coins" inside a Folder named "leaderstats" inside the Player. Use a '
      + 'DataStore named "PlayerData" with the key "Player_" .. player.UserId. '
      + 'Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local p = __APPLE.player("Leaver")
local stats = Instance.new("Folder") stats.Name = "leaderstats" stats.Parent = p
local coins = Instance.new("IntValue") coins.Name = "Coins" coins.Value = 777 coins.Parent = stats
__APPLE.firePlayerAdded(p)
-- The dominant DataStore failure is a throttle that succeeds a moment later.
__APPLE.injectStoreFailures(2)
__APPLE.firePlayerRemoving(p)
__APPLE.fact("writes", __APPLE.countOps("SetAsync") + __APPLE.countOps("UpdateAsync"))
__APPLE.fact("stored", __APPLE.storeSnapshot("Player_" .. tostring(p.UserId)))
__APPLE.fact("keys", __APPLE.storeKeys())
`,
    checks: [
      check('survives-the-throttle', 'a DataStore call THROWS on throttle; an unprotected throw aborts the PlayerRemoving handler and the save never completes',
        (t) => handlerErrors(t).length === 0),
      check('retries-after-failure', 'two attempts fail; pcall alone converts a crash into silent data loss, which is worse. A bounded retry is what recovers a throttle',
        (t) => Number(fact(t, 'writes')) >= 3),
      check('data-actually-landed', 'the only proof the save worked is a value in the store afterwards',
        (t) => fact(t, 'stored') !== null && fact(t, 'stored') !== undefined),
    ],
  },
  {
    id: 'atomic-add',
    axis: 'datastore-safety',
    shape: 'module',
    cite: 'roblox-datastores/SKILL.md:93 — "Use UpdateAsync with a pure (non-yielding) transform function for any value that can be concurrently modified"; :211 — "Using SetAsync for contended values (race condition -> lost updates)"',
    // The prompt says NOTHING about concurrency. That is the test: a model that is frontier for
    // Roblox reaches for UpdateAsync unprompted, because player totals are contended by definition.
    prompt:
      'Write a Luau ModuleScript that returns a table with one function, addCoins(userId, amount). '
      + 'It adds amount to that player\'s saved coin total in a DataStore named "PlayerData" under the key '
      + '"Player_" .. userId, and returns the new total. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local mod = __MODULE
local fn = nil
if type(mod) == "table" then fn = mod.addCoins elseif type(mod) == "function" then fn = mod end
__APPLE.fact("exportsFunction", type(fn) == "function")
if type(fn) == "function" then
  -- A second server read this key at the same moment we did.
  __APPLE.staleReads("Player_1001", 1)
  local ok1, t1 = pcall(fn, 1001, 50)
  local ok2, t2 = pcall(fn, 1001, 50)
  __APPLE.fact("call1", ok1 and t1 or nil)
  __APPLE.fact("call2", ok2 and t2 or nil)
  __APPLE.fact("bothOk", ok1 and ok2)
  __APPLE.fact("stored", __APPLE.storeSnapshot("Player_1001"))
  __APPLE.fact("updateAsyncOps", __APPLE.countOps("UpdateAsync"))
  __APPLE.fact("staleReadsServed", __APPLE.countOps("STALE_READ"))
end
`,
    checks: [
      check('exports-the-function', 'the module has to return what was asked for before anything else can be measured',
        (t) => fact(t, 'exportsFunction') === true),
      check('both-calls-succeed', 'neither call may throw',
        (t) => fact(t, 'bothOk') === true),
      check('concurrent-adds-both-land', 'the second caller read the value as it was before the first wrote. A GetAsync/SetAsync pair writes 50 twice and the player ends with 50; UpdateAsync reads the CURRENT value inside its transform and the player ends with 100. Nothing about the code is inspected — only the arithmetic that came out',
        (t) => Number(fact(t, 'call2')) === 100),
      check('reported-total-is-real', 'the number the function returns has to be the number in the store',
        (t) => Number(fact(t, 'call2')) === Number(fact(t, 'stored'))),
    ],
  },
  {
    id: 'save-with-analytics',
    axis: 'datastore-safety',
    shape: 'script',
    cite: 'roblox-datastores/references/core-operations-and-patterns.md:37 — the transform "must not yield — no task.wait, no other async"',
    prompt:
      'Write a server Script for ServerScriptService. When a player leaves, save their inventory '
      + '(an Attribute named "Inventory" on the Player, a JSON string) to a DataStore named "PlayerData" under '
      + 'the key "Inv_" .. player.UserId, and also post the same inventory to the analytics endpoint '
      + 'https://example.com/log with HttpService. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local p = __APPLE.player("Leaver")
p:SetAttribute("Inventory", "{\\"sword\\":1}")
__APPLE.firePlayerAdded(p)
__APPLE.firePlayerRemoving(p)
__APPLE.fact("stored", __APPLE.storeSnapshot("Inv_" .. tostring(p.UserId)))
__APPLE.fact("writes", __APPLE.countOps("SetAsync") + __APPLE.countOps("UpdateAsync"))
`,
    checks: [
      check('no-yield-inside-the-transform', 'the engine raises if an UpdateAsync transform yields, and an HTTP post is the single most tempting thing to put there. This harness raises the same error for the same reason',
        (t) => Number(t.transformYields ?? 0) === 0),
      check('survives-the-save', 'no error escapes the PlayerRemoving handler',
        (t) => handlerErrors(t).length === 0),
      check('data-actually-landed', 'the inventory is in the store when the player has gone',
        (t) => fact(t, 'stored') !== null && fact(t, 'stored') !== undefined),
    ],
  },
  {
    id: 'shutdown-save',
    axis: 'datastore-safety',
    shape: 'script',
    cite: 'roblox-datastores/SKILL.md:88 — "For BindToClose, yield up to ~30 seconds to finish final saves"; roblox-antipatterns.mjs no-bindtoclose-save',
    prompt:
      'Write a server Script for ServerScriptService that keeps players\' coins safe. Coins are an '
      + 'IntValue named "Coins" inside a Folder named "leaderstats" inside the Player, saved to a DataStore named '
      + '"PlayerData" under the key "Player_" .. player.UserId. Nobody may lose progress when the server shuts '
      + 'down. Reply with one fenced luau code block and nothing else.',
    probe: `
__APPLE.setPhase("probe")
local a = __APPLE.player("One")
local sa = Instance.new("Folder") sa.Name = "leaderstats" sa.Parent = a
local ca = Instance.new("IntValue") ca.Name = "Coins" ca.Value = 11 ca.Parent = sa
local b = __APPLE.player("Two")
local sb = Instance.new("Folder") sb.Name = "leaderstats" sb.Parent = b
local cb = Instance.new("IntValue") cb.Name = "Coins" cb.Value = 22 cb.Parent = sb
__APPLE.firePlayerAdded(a)
__APPLE.firePlayerAdded(b)
__APPLE.fact("registered", __APPLE.bindToCloseCount())
__APPLE.setPhase("shutdown")
__APPLE.fireBindToClose()
__APPLE.fact("shutdownWrites", __APPLE.countOps("SetAsync") + __APPLE.countOps("UpdateAsync"))
__APPLE.fact("storedA", __APPLE.storeSnapshot("Player_" .. tostring(a.UserId)))
__APPLE.fact("storedB", __APPLE.storeSnapshot("Player_" .. tostring(b.UserId)))
`,
    checks: [
      check('registers-bindtoclose', 'PlayerRemoving does not fire for everyone on a shutdown; without BindToClose the last session of every player in the server is lost',
        (t) => Number(fact(t, 'registered')) >= 1),
      check('shutdown-saves-everyone', 'both players still in the server have to be written, not just the one who happened to leave',
        (t) => fact(t, 'storedA') !== null && fact(t, 'storedA') !== undefined
          && fact(t, 'storedB') !== null && fact(t, 'storedB') !== undefined),
      check('shutdown-path-does-not-throw', 'an error inside BindToClose costs every remaining save in the same callback',
        (t) => handlerErrors(t).length === 0),
    ],
  },
  {
    id: 'failed-load-no-wipe',
    axis: 'datastore-safety',
    shape: 'script',
    cite: 'roblox-datastores/SKILL.md:167 — "Never assume a failed Set/Update/Increment means \'no change occurred\'"; the same reasoning applies to a failed GET, which is where the wipe comes from',
    prompt:
      'Write a server Script for ServerScriptService. When a player joins, load their saved coins '
      + 'from a DataStore named "PlayerData" under the key "Player_" .. player.UserId and put them in an IntValue '
      + 'named "Coins" inside a Folder named "leaderstats" inside the Player. When they leave, save the coins '
      + 'back. New players start with 0. Reply with one fenced luau code block and nothing else.',
    //[[ THE ONLY ITEM WHOSE PASS CONDITION IS THAT NOTHING HAPPENED, AND THE REASON IT IS HERE.
    //
    //   A player joins, their load THROWS (throttle, outage, a bad minute), the script falls back
    //   to the "new player" default of 0, and the leave handler then writes that 0 over a real
    //   save. The account is gone and the server never logged an error. This is the single most
    //   expensive Roblox data bug and it is invisible to every static check, because the code that
    //   causes it contains a pcall, a default, and a save — all three of which look correct.
    //
    //   The probe runs the player through twice: once cleanly, to let the model write in ITS OWN
    //   value shape, and once with the load broken. The verdict is whether the second pass changed
    //   what the first pass stored. Nothing about the code is read, and no shape is imposed. ]]
    probe: `
__APPLE.setPhase("probe")
local p = __APPLE.player("Returning", 4242)
-- Pass one: a clean session that leaves a real save behind, in whatever shape the model chose.
__APPLE.firePlayerAdded(p)
local stats = p:FindFirstChild("leaderstats")
local coins = stats and stats:FindFirstChild("Coins")
if coins then coins.Value = 4321 end
__APPLE.fact("createdLeaderstats", coins ~= nil)
__APPLE.firePlayerRemoving(p)
local key = "Player_" .. tostring(p.UserId)
__APPLE.fact("afterGoodSession", __APPLE.storeSnapshot(key))
-- Pass two: the SAME player rejoins and the load fails. Five attempts all throw.
__APPLE.setPhase("badload")
__APPLE.injectStoreFailures(5)
local p2 = __APPLE.player("Returning", 4242)
__APPLE.firePlayerAdded(p2)
__APPLE.injectStoreFailures(0)
__APPLE.firePlayerRemoving(p2)
__APPLE.fact("afterFailedLoad", __APPLE.storeSnapshot(key))
`,
    checks: [
      check('loads-and-saves-at-all', 'the first, clean session has to store something, or the wipe check below has nothing to protect',
        (t) => fact(t, 'afterGoodSession') !== null && fact(t, 'afterGoodSession') !== undefined),
      check('creates-leaderstats', 'the coins have to reach the player, not only the store',
        (t) => fact(t, 'createdLeaderstats') === true),
      check('failed-load-does-not-wipe', 'the load threw five times. A script that falls back to the default and then saves it has just deleted a real account — and logged nothing',
        (t) => JSON.stringify(fact(t, 'afterFailedLoad') ?? null) === JSON.stringify(fact(t, 'afterGoodSession') ?? null)),
      check('load-failure-does-not-throw', 'the join handler must survive a broken GetAsync',
        (t) => handlerErrors(t).every((e) => !String(e).includes('PlayerAdded'))),
    ],
  },
];

export const AXES = ['modern-api', 'server-authority', 'datastore-safety'];

/** Every check id, flattened — used by the control test to prove none is unreachable. */
export const ALL_CHECK_IDS = FRONTIER_ITEMS.flatMap((i) => i.checks.map((c) => `${i.id}/${c.id}`));

/**
 * The system prompt for the NEUTRAL arm.
 *
 * It says how to answer and NOTHING about Roblox. That is deliberate and it is half the experiment:
 * a prompt that tells the model to use task.* and to distrust the client would be measuring the
 * prompt. This arm measures what the MODEL knows. The second arm (`HOUSE_RULES_SYSTEM`) adds
 * production's own standing instructions, so the difference between the two is the part of the
 * score that is bought by prompting rather than by the weights.
 */
export const NEUTRAL_SYSTEM =
  'You are a Roblox developer. Answer with ONE fenced luau code block and nothing else — no prose '
  + 'before or after it. Write the complete script that was asked for, ready to paste into Studio.';

/**
 * The HOUSE-RULES arm: production's own standing code instructions, verbatim.
 *
 * Copied from apps/worker/src/prompts.ts IDENTITY, lines 13-19 — the part of the live system prompt
 * that bears on these items. The REST of that prompt is not included, and that limit is stated
 * rather than hidden: it instructs the model to call tools (search_docs, get_verified_module,
 * render_view) that /api/admin/model-test cannot serve, so sending it whole would measure a model
 * being asked for something it has no way to do. This arm therefore reports what production's
 * WRITTEN RULES buy, not what the full production loop with its tools buys.
 */
export const HOUSE_RULES_SYSTEM =
  'You write modern, idiomatic Luau and follow current Roblox best practices:\n'
  + '- task.wait/task.spawn/task.defer (never the deprecated global wait/spawn), no Instance.new parent argument,\n'
  + '  use CFrame math correctly, prefer attributes over Value objects, RemoteEvents in ReplicatedStorage,\n'
  + '  server logic in ServerScriptService, client logic in StarterPlayerScripts/StarterGui.\n'
  + '- Scripts communicate via ModuleScripts and Remote events; never trust the client on the server.\n'
  + '- UI: build with Frames/UIListLayout/UICorner/UIPadding, scale-based sizing for cross-device support.\n\n'
  + 'Answer with ONE fenced luau code block and nothing else — no prose before or after it. '
  + 'Write the complete script that was asked for, ready to paste into Studio.';

export const ARMS = Object.freeze({
  neutral: { id: 'neutral', system: NEUTRAL_SYSTEM, what: 'the model on its own — no Roblox guidance in the prompt' },
  'house-rules': { id: 'house-rules', system: HOUSE_RULES_SYSTEM, what: "production's own written code rules, verbatim from prompts.ts IDENTITY" },
});
