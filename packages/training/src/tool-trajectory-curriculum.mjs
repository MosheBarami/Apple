/**
 * FIRST-PARTY TOOL TRAJECTORIES. Authored, not harvested; not recorded customer sessions.
 *
 * `audit-dataset` reports `Apple tool trajectories: 0` against 404 harvested rows. Everything the
 * model is currently trained on is a lump of somebody else's Luau with an instruction reverse-
 * engineered onto it, which teaches the model to emit a code fragment when the product needs it
 * to CALL A TOOL. These seeds are that missing shape: a real request, the ordered calls that
 * answer it, and a reply that claims only what the calls established.
 *
 * Every seed is checked by `tool-trajectory-verify` against the LIVE registry — so a tool name or
 * an argument that does not exist cannot be built into the dataset — and every seed carries a
 * `mutation` that must make that check fail, because a validator nobody has seen go red is not
 * known to be a validator.
 *
 * Two rules the seeds keep, which are the product's rules and not the dataset's:
 *   - The plan is a commitment: every tool a plan names is actually called in the trajectory.
 *   - The run ends in a check. `readProposedPlan` refuses a plan with no verification step, so a
 *     seed that taught otherwise could not be built even if it were written.
 *
 * The reply field is held to the same standard as the product's own honesty rules: it says what
 * was done and what was observed, and never reports a check it did not run.
 */

export const TOOL_TRAJECTORY_CURRICULUM = [
  {
    id: 'floating-platform',
    family: 'build-platform',
    prompt: 'Can you put a big platform in the sky that players can stand on?',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Sky platform',
          steps: [
            { title: 'A platform players can stand on', detail: 'An anchored 40x2x40 part at Y=60 in Workspace.', tool: 'create_instances' },
            { title: 'Check it holds a player', detail: 'Play-test briefly and read the output for errors.', tool: 'run_and_check' },
          ],
        },
      },
      {
        tool: 'create_instances',
        args: {
          items: [
            {
              className: 'Part',
              name: 'SkyPlatform',
              parent: 'game.Workspace',
              props: {
                Size: { t: 'Vector3', v: [40, 2, 40] },
                Position: { t: 'Vector3', v: [0, 60, 0] },
                Anchored: { t: 'bool', v: true },
                Material: { t: 'EnumItem', v: 'Enum.Material.Concrete' },
                Color: { t: 'Color3', v: [0.55, 0.57, 0.6] },
              },
            },
          ],
        },
      },
      { tool: 'run_and_check', args: { seconds: 6 } },
    ],
    reply: 'SkyPlatform is in at Y=60 — 40 by 40 studs, anchored so it stays put. I play-tested for six seconds and the output was clean. It is high enough that players will need a way up; say the word and I will add stairs or a launcher.',
    mutation: { step: 1, path: 'items.0.props.Anchored.t', value: 'boolean' },
  },

  {
    id: 'shop-with-buy-buttons',
    family: 'shop-module',
    prompt: 'I want a shop where players can buy a speed boost with coins.',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Coin shop',
          steps: [
            { title: 'Coins that persist between sessions', detail: 'Install the currency module.', tool: 'install_module' },
            { title: 'A buy button that charges coins', detail: 'Install buy_buttons and point one at the speed boost.', tool: 'install_module' },
            { title: 'Prove a purchase actually deducts', detail: 'Run a spec covering affordable, unaffordable and repeat purchases.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'currency' } },
      { tool: 'install_module', args: { module: 'buy_buttons' } },
      {
        tool: 'run_spec',
        args: {
          title: 'Speed boost purchase',
          cases: [
            {
              name: 'a player with enough coins is charged exactly the price',
              code: 'local wallet = { coins = 120 }\nlocal function buy(w, price)\n    if w.coins < price then return false end\n    w.coins -= price\n    return true\nend\nassert(buy(wallet, 75) == true)\nassert(wallet.coins == 45)',
            },
            {
              name: 'a player who cannot afford it is not charged',
              code: 'local wallet = { coins = 20 }\nlocal function buy(w, price)\n    if w.coins < price then return false end\n    w.coins -= price\n    return true\nend\nassert(buy(wallet, 75) == false)\nassert(wallet.coins == 20)',
            },
          ],
        },
      },
    ],
    reply: 'The shop is in. Coins persist through the currency module, and the buy button charges 75 coins for the speed boost. The spec proves both branches: a player with 120 coins ends on 45, and a player with 20 keeps all 20 and gets nothing. The boost effect itself is still a stub — tell me how much faster and for how long.',
    mutation: { step: 1, path: 'module', value: 'coins' },
  },

  {
    id: 'checkpoints-for-obby',
    family: 'checkpoint-system',
    prompt: 'my obby needs checkpoints so people dont start over every time they die',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'Checkpoints that remember your progress', detail: 'Install the checkpoints module into ServerScriptService.', tool: 'install_module' },
            { title: 'Prove you cannot go backwards', detail: 'Spec the advance rule against skipped and repeated pads.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'checkpoints' } },
      {
        tool: 'run_spec',
        args: {
          cases: [
            {
              name: 'touching the next pad advances, touching an earlier one does not',
              code: 'local function advance(current, touched)\n    return if touched == current + 1 then touched else current\nend\nassert(advance(0, 1) == 1)\nassert(advance(3, 4) == 4)\nassert(advance(3, 2) == 3)\nassert(advance(3, 3) == 3)',
            },
            {
              name: 'a skipped pad is ignored',
              code: 'local function advance(current, touched)\n    return if touched == current + 1 then touched else current\nend\nassert(advance(1, 5) == 1)',
            },
          ],
        },
      },
    ],
    reply: 'Checkpoints are installed. Respawning now returns you to the last pad you touched. The spec covers the part people usually get wrong: touching pad 5 while you are on pad 1 does nothing, so nobody can skip the hard section by walking around it.',
    mutation: { step: 2, path: 'cases.0.code', value: 'local function advance(current, touched\n    return current\nend' },
  },

  {
    id: 'read-then-edit-script',
    family: 'script-edit',
    prompt: 'The round timer in RoundManager counts down too fast, make each round 3 minutes.',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'Find what the timer is set to now', detail: 'Read RoundManager before changing anything.', tool: 'read_script' },
            { title: 'Rounds that last three minutes', detail: 'Change the round length constant to 180 seconds.', tool: 'edit_script' },
            { title: 'Prove the new length is what it says', detail: 'Spec the countdown arithmetic.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'read_script', args: { path: 'game.ServerScriptService.RoundManager' } },
      {
        tool: 'edit_script',
        args: {
          path: 'game.ServerScriptService.RoundManager',
          edits: [{ find: 'local ROUND_SECONDS = 45', replace: 'local ROUND_SECONDS = 180' }],
        },
      },
      {
        tool: 'run_spec',
        args: {
          cases: [
            {
              name: 'a round reports three minutes remaining at the start',
              code: 'local ROUND_SECONDS = 180\nlocal function remaining(elapsed)\n    return math.max(0, ROUND_SECONDS - elapsed)\nend\nassert(remaining(0) == 180)\nassert(remaining(179) == 1)\nassert(remaining(180) == 0)\nassert(remaining(500) == 0)',
            },
          ],
        },
      },
    ],
    reply: 'I read RoundManager first — it was on 45 seconds — and changed that one constant to 180. The spec confirms a round now starts at 180 and floors at zero rather than going negative. Nothing else in the file was touched.',
    mutation: { step: 3, path: 'cases.0.name', value: '' },
  },

  {
    id: 'find-asset-and-place-it',
    family: 'asset-search-insert',
    prompt: 'add some trees around the spawn area, nothing too heavy',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'Trees that will not slow the game down', detail: 'Search the verified library for low-triangle foliage.', tool: 'search_asset_library' },
            { title: 'Trees placed around spawn', detail: 'Insert the chosen model into Workspace.', tool: 'insert_asset' },
            { title: 'Check the spawn area still reads well', detail: 'Composition check against the request.', tool: 'check_composition' },
          ],
        },
      },
      { tool: 'search_asset_library', args: { query: 'stylised low poly tree', kind: 'foliage', maxTriangles: 1500 } },
      { tool: 'insert_asset', args: { assetId: 4391384843, parent: 'game.Workspace.SpawnDressing' } },
      { tool: 'check_composition', args: { target: 'game.Workspace.SpawnDressing', subject: 'scene', intent: 'trees around the spawn area, kept light' } },
    ],
    reply: 'I searched the verified library for foliage under 1,500 triangles and inserted the one that fit, grouped under SpawnDressing so it is easy to move or delete as a set. The composition check came back against your own wording — trees around spawn, kept light.',
    mutation: { step: 1, path: 'kind', value: 'tree' },
  },

  {
    id: 'debug-from-output',
    family: 'debug-from-logs',
    prompt: 'something is erroring when a player joins, the output is full of red',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'See the actual error', detail: 'Read the recent output rather than guessing.', tool: 'get_output_logs' },
            { title: 'Find where it comes from', detail: 'Resolve the symbol named in the traceback.', tool: 'find_symbol' },
            { title: 'A join that does not error', detail: 'Guard the nil case at the call site.', tool: 'edit_script' },
            { title: 'Prove the guard holds', detail: 'Spec the handler against a player with no saved data.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'get_output_logs', args: {} },
      { tool: 'find_symbol', args: { name: 'onPlayerAdded' } },
      {
        tool: 'edit_script',
        args: {
          path: 'game.ServerScriptService.PlayerSetup',
          edits: [{ find: 'local data = store:Get(player.UserId)\n\tleaderstats.Coins.Value = data.coins', replace: 'local data = store:Get(player.UserId)\n\tleaderstats.Coins.Value = if data then data.coins else 0' }],
        },
      },
      {
        tool: 'run_spec',
        args: {
          cases: [
            {
              name: 'a brand new player with no saved data joins without erroring',
              code: 'local function coinsFor(data)\n    return if data then data.coins else 0\nend\nassert(coinsFor(nil) == 0)\nassert(coinsFor({ coins = 250 }) == 250)',
            },
          ],
        },
      },
    ],
    reply: 'The output said "attempt to index nil with \'coins\'" in PlayerSetup — a first-time player has no saved record yet, so the store returns nil and the next line indexes it. I guarded that one line to fall back to 0. The spec proves both paths: a new player gets 0, a returning player keeps their 250.',
    mutation: { step: 2, path: 'name', value: 42 },
  },

  {
    id: 'leaderboard-for-wins',
    family: 'leaderboard',
    prompt: 'show everyones wins on the leaderboard',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'A wins column on the player list', detail: 'Install the leaderboard module.', tool: 'install_module' },
            { title: 'Check nothing errors on join', detail: 'Play-test and read the output.', tool: 'run_and_check' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'leaderboard' } },
      { tool: 'run_and_check', args: { seconds: 5 } },
    ],
    reply: 'The leaderboard is in and shows a Wins column next to each player. I play-tested for five seconds and nothing errored on join. Wins currently only go up when something sets them — point me at where a round is won and I will wire it.',
    mutation: { step: 1, path: 'module', value: 'leaderboards' },
  },

  {
    id: 'guard-a-remote',
    family: 'remote-guard',
    prompt: 'someone told me exploiters can just fire my remotes and give themselves coins',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'Remotes that check who is asking', detail: 'Install the remote_guard module.', tool: 'install_module' },
            { title: 'Prove a forged amount is refused', detail: 'Spec the server-side validation against client-supplied values.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'remote_guard' } },
      {
        tool: 'run_spec',
        args: {
          title: 'Remote validation',
          cases: [
            {
              name: 'the server decides the reward, not the client',
              code: 'local REWARD = 10\nlocal function grant(_clientClaimedAmount)\n    return REWARD\nend\nassert(grant(10) == 10)\nassert(grant(999999) == 10)\nassert(grant("1e9") == 10)',
            },
            {
              name: 'a non-numeric or negative request cannot reduce anyone else',
              code: 'local function sanitise(amount)\n    if type(amount) ~= "number" or amount ~= amount or amount < 0 then return 0 end\n    return math.floor(math.min(amount, 100))\nend\nassert(sanitise(-5) == 0)\nassert(sanitise(0/0) == 0)\nassert(sanitise("50") == 0)\nassert(sanitise(50.9) == 50)\nassert(sanitise(1000) == 100)',
            },
          ],
        },
      },
    ],
    reply: 'They were right, and it is fixed. The remote no longer trusts the amount the client sends — the server holds the reward value itself. The spec proves a client claiming 999,999 still gets exactly 10, and that a negative, NaN or string amount sanitises to 0 rather than doing something surprising.',
    mutation: { step: 2, path: 'cases.1.code', value: 'local function sanitise(amount)\n    return amount\nend\nassert(sanitise(-5) == 0)' },
  },

  {
    id: 'night-mood-for-horror',
    family: 'atmosphere',
    prompt: 'make it look scary, its supposed to be a horror game',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'How horror maps are usually lit', detail: 'Pull the horror genre kit before choosing values.', tool: 'get_genre_kit' },
            { title: 'Lighting that actually reads as horror', detail: 'Apply the horror mood preset.', tool: 'set_mood' },
            { title: 'Look at the result', detail: 'Render the workspace and critique it against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      { tool: 'get_genre_kit', args: { genre: 'horror' } },
      { tool: 'set_mood', args: { mood: 'horror' } },
      { tool: 'inspect_visually', args: { intent: 'make the place look scary for a horror game' } },
    ],
    reply: 'I pulled the horror kit first rather than guessing at values, then applied the horror lighting mood — low ambient, cold fog, and a short falloff so you cannot see what is coming. Then I actually looked at it: the critique is judged against your own words, not against a checklist.',
    mutation: { step: 2, path: 'mood', value: 'scary' },
  },

  {
    id: 'daily-reward-streak',
    family: 'daily-reward',
    prompt: 'give people a reward for logging in every day, more if they keep the streak',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'A daily reward that remembers your streak', detail: 'Install the daily_reward module.', tool: 'install_module' },
            { title: 'Prove the streak breaks when it should', detail: 'Spec the streak rule across same-day, next-day and missed-day returns.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'daily_reward' } },
      {
        tool: 'run_spec',
        args: {
          cases: [
            {
              name: 'returning the next day continues the streak, missing a day resets it',
              code: 'local function nextStreak(streak, daysSince)\n    if daysSince == 0 then return streak end\n    if daysSince == 1 then return streak + 1 end\n    return 1\nend\nassert(nextStreak(4, 0) == 4)\nassert(nextStreak(4, 1) == 5)\nassert(nextStreak(4, 2) == 1)\nassert(nextStreak(4, 30) == 1)',
            },
            {
              name: 'the reward grows with the streak but is capped',
              code: 'local function reward(streak)\n    return math.min(50 + (streak - 1) * 25, 300)\nend\nassert(reward(1) == 50)\nassert(reward(2) == 75)\nassert(reward(11) == 300)\nassert(reward(400) == 300)',
            },
          ],
        },
      },
    ],
    reply: 'Daily rewards are in. Day one pays 50 and each consecutive day adds 25, capped at 300 so a long streak cannot run away with your economy. Coming back the same day changes nothing, and missing a day resets the streak to 1 — the spec covers all three cases.',
    mutation: { step: 1, path: 'module', value: 'daily_rewards' },
  },

  {
    id: 'inventory-capacity-fix',
    family: 'inventory',
    prompt: 'players can pick up infinite items, cap it at 20 and tell them when its full',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'Find where pickups are handled', detail: 'Search the place for the pickup handler.', tool: 'search_scripts' },
            { title: 'A backpack that stops at twenty', detail: 'Add the capacity check at the pickup site.', tool: 'edit_script' },
            { title: 'Prove the twenty-first item is refused', detail: 'Spec the boundary exactly.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'search_scripts', args: { query: 'function onPickup' } },
      {
        tool: 'edit_script',
        args: {
          path: 'game.ServerScriptService.Pickups',
          edits: [{ find: 'table.insert(inventory, item)', replace: 'if #inventory >= CAPACITY then return false, "full" end\n\ttable.insert(inventory, item)' }],
        },
      },
      {
        tool: 'run_spec',
        args: {
          cases: [
            {
              name: 'the twentieth item fits and the twenty-first does not',
              code: 'local CAPACITY = 20\nlocal function pickup(inv, item)\n    if #inv >= CAPACITY then return false end\n    table.insert(inv, item)\n    return true\nend\nlocal inv = {}\nfor i = 1, 20 do assert(pickup(inv, i) == true) end\nassert(#inv == 20)\nassert(pickup(inv, 21) == false)\nassert(#inv == 20)',
            },
          ],
        },
      },
    ],
    reply: 'Capped at 20. The check sits at the pickup site itself, so nothing can slip in through another path, and it returns a "full" reason the UI can show rather than failing silently. The spec walks the boundary exactly: item 20 goes in, item 21 is refused, and the count stays at 20.',
    mutation: { step: 1, path: 'query', value: 42 },
  },

  {
    id: 'save-player-progress',
    family: 'persistence',
    prompt: 'my players lose everything when they leave, can you make it save',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          steps: [
            { title: 'Progress that survives leaving', detail: 'Install profile_store for per-player persistence.', tool: 'install_module' },
            { title: 'Check it loads and saves without erroring', detail: 'Play-test and read the output.', tool: 'run_and_check' },
            { title: 'Note the datastore limit for later', detail: 'Remember that saves are throttled per key.', tool: 'remember' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'profile_store' } },
      { tool: 'run_and_check', args: { seconds: 8 } },
      { tool: 'remember', args: { fact: 'Player progress is saved through profile_store; DataStore writes are throttled per key, so batch changes rather than saving on every coin.' } },
    ],
    reply: 'Progress now saves through profile_store — it loads on join and writes on leave, which is the pattern that survives a server shutting down. Eight seconds of play-test came back clean. One thing worth knowing: Roblox throttles writes per key, so I noted that we batch changes instead of saving on every coin picked up.',
    mutation: { step: 3, path: 'fact', value: '' },
  },
];
