/**
 * FIRST-PARTY TOOL TRAJECTORIES, BATCH B. Authored, not harvested.
 *
 * `tool-trajectory-curriculum.mjs` covers twelve families and stops at the shapes a beginner
 * asks for on day one: build a part, install a module, read a script, fix an error. The registry
 * offers fifty-nine tools. The first batch exercises seventeen of them, which means the dataset
 * teaches the model that two thirds of its own hands do not exist — and a tool the model never
 * sees called is a tool it will not reach for when the request needs it.
 *
 * So this file is not "more of the same, longer". Every seed here is a family the first batch has
 * no example of, and between them they put the tools that were silent into a real request:
 * `income`, `rounds`, `ui_kit` and `receipts` on the module side; `get_genre_references`,
 * `search_creation_skills`/`read_creation_skill`, `find_mechanic` and `search_docs` on the
 * look-it-up-before-you-guess side; `review_scripts`, `audit_build`, `format_script`,
 * `get_project_tree` and `list_scripts` on the read-the-place side; `generate_model`/
 * `inspect_model`, `compose_thumbnail`/`render_view`, `add_effect`/`remove_effect`,
 * `get_selection`/`focus_camera`/`select_instances`, `create_checkpoint`/`delete_instances` and
 * `design_sound`/`assign_sounds` on the make-and-look side.
 *
 * The rules are the first batch's rules, unchanged, because they are the product's rules:
 *   - The plan is a commitment: every tool a plan names is actually called in the trajectory.
 *   - The run ends in a check, and the check is one of the five `readProposedPlan` accepts.
 *   - The reply says what was done and what was observed, names what is still a stub, and never
 *     reports a check that was not run.
 *
 * Every seed carries a `mutation` that must turn `tool-trajectory-verify` red. The kinds are
 * varied on purpose rather than repeated: a bad enum proves the enum arm, and proves nothing
 * about the arm that executes spec cases or the arm that reads a plan's promises. Two of the
 * mutations here land on a plan step rather than on an argument — one names a tool that does not
 * exist, one names a real tool the run never calls — because those are the two ways a plan lies
 * and they fail through completely different code.
 */

export const TOOL_TRAJECTORY_CURRICULUM_B = [
  {
    id: 'afk-income-tycoon',
    family: 'tycoon-income',
    prompt: 'i want money to keep coming in while people are afk, like a tycoon',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Idle income',
          steps: [
            { title: 'Money that ticks up on its own', detail: 'Install the income module so a rate accrues per second, awake or idle.', tool: 'install_module' },
            { title: 'Prove the rate is the rate', detail: 'Spec the accrual arithmetic and the offline cap.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'income' } },
      {
        tool: 'run_spec',
        args: {
          title: 'Idle income',
          cases: [
            {
              name: 'income accrues at the stated rate and offline time is capped',
              code: 'local RATE_PER_SECOND = 3\nlocal OFFLINE_CAP = 8 * 3600\nlocal function accrue(seconds)\n    return math.floor(math.min(seconds, OFFLINE_CAP) * RATE_PER_SECOND)\nend\nassert(accrue(0) == 0)\nassert(accrue(10) == 30)\nassert(accrue(8 * 3600) == 86400)\nassert(accrue(48 * 3600) == 86400)',
            },
            {
              name: 'an upgrade raises the rate and leaves money already banked alone',
              code: 'local function rateFor(level)\n    return 3 + (level - 1) * 2\nend\nlocal function upgrade(state)\n    return { banked = state.banked, level = state.level + 1 }\nend\nlocal state = { banked = 120, level = 1 }\nassert(rateFor(state.level) == 3)\nstate = upgrade(state)\nassert(state.level == 2)\nassert(rateFor(state.level) == 5)\nassert(state.banked == 120)',
            },
          ],
        },
      },
    ],
    reply: 'Idle income is in. The rate accrues per second and keeps accruing while the player is away, but it stops counting after eight hours — the spec pins that, because an uncapped offline timer is how a tycoon economy gets a player back with ten million of your currency. The second case proves an upgrade raises the rate without disturbing what was already banked. The dropper models themselves are still whatever is in your place; tell me which part is the dropper and I will wire the visual to the rate.',
    mutation: { step: 2, path: 'cases.0.code', value: 'local RATE_PER_SECOND = 3\nlocal function accrue(seconds)\n    return math.floor(seconds * RATE_PER_SECOND)\nend\nassert(accrue(48 * 3600) == 86400)' },
  },

  {
    id: 'two-minute-rounds',
    family: 'round-system',
    prompt: 'the match should run in rounds, like 2 minutes then everyone respawns and it starts again',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Round loop',
          steps: [
            { title: 'Matches that run in rounds', detail: 'Install the rounds module into ServerScriptService.', tool: 'install_module' },
            { title: 'Prove the clock lands where it should', detail: 'Spec the countdown and the phase order.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'rounds' } },
      {
        tool: 'run_spec',
        args: {
          title: 'Round loop',
          cases: [
            {
              name: 'a two minute round counts down to zero and does not run negative',
              code: 'local ROUND_SECONDS = 120\nlocal function phaseAt(elapsed)\n    if elapsed < ROUND_SECONDS then\n        return "playing", ROUND_SECONDS - elapsed\n    end\n    return "intermission", 0\nend\nlocal phase, left = phaseAt(0)\nassert(phase == "playing" and left == 120)\nphase, left = phaseAt(119)\nassert(phase == "playing" and left == 1)\nphase, left = phaseAt(120)\nassert(phase == "intermission" and left == 0)\nphase, left = phaseAt(600)\nassert(phase == "intermission" and left == 0)',
            },
            {
              name: 'the loop always passes through intermission and returns to where it started',
              code: 'local function nextPhase(phase)\n    return if phase == "playing" then "intermission" else "playing"\nend\nassert(nextPhase("playing") == "intermission")\nassert(nextPhase("intermission") == "playing")\nlocal phase = "playing"\nfor _ = 1, 4 do\n    phase = nextPhase(phase)\nend\nassert(phase == "playing")',
            },
          ],
        },
      },
    ],
    reply: 'Rounds are in at 120 seconds, with an intermission between them where everyone respawns. The spec pins the part that usually goes wrong: the clock reads 120 at the start, 1 with a second to go, and 0 at the end rather than sliding into negative numbers, and the loop cannot skip from one round straight into the next without the intermission. What decides a winner is still open — say how a round is won and I will hook it to the round end.',
    mutation: { step: 1, path: 'module', value: 'round' },
  },

  {
    id: 'designed-hud',
    family: 'ui-kit',
    prompt: 'the buttons and text on screen look like default roblox, can you make them look designed',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'HUD pass',
          steps: [
            { title: 'One consistent look for every button and panel', detail: 'Install the ui_kit module so the HUD shares a palette, corner radius and type scale.', tool: 'install_module' },
            { title: 'Check nothing breaks when the HUD loads', detail: 'Play-test and read the output.', tool: 'run_and_check' },
            { title: 'Look at the screen and judge it', detail: 'Critique the result against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'ui_kit', parent: 'game.ReplicatedStorage' } },
      { tool: 'run_and_check', args: { seconds: 6 } },
      { tool: 'inspect_visually', args: { intent: 'the on-screen buttons and text should look designed rather than default Roblox' } },
    ],
    reply: 'The UI kit is in ReplicatedStorage, so every button and panel now pulls the same palette, corner radius and text sizing instead of each one being its own decision. Six seconds of play-test came back clean. Then I looked at it rather than just declaring it done — the critique is judged against your own words. One thing I did not change: your existing screens still have their old layout; the kit restyles them, it does not rearrange them. Say which screen bothers you most and I will lay that one out properly.',
    mutation: { step: 0, path: 'steps.1.tool', value: 'audit_build' },
  },

  {
    id: 'coin-pack-receipts',
    family: 'product-receipts',
    prompt: 'I want to sell a 100 robux coin pack, and I heard people sometimes get their coins twice',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Coin pack',
          steps: [
            { title: 'A Robux coin pack that pays out once', detail: 'Install the receipts module, which logs each PurchaseId before granting.', tool: 'install_module' },
            { title: 'Prove a re-delivered receipt is not paid twice', detail: 'Spec the idempotency log and the server-side price table.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'install_module', args: { module: 'receipts' } },
      {
        tool: 'run_spec',
        args: {
          title: 'Developer product receipts',
          cases: [
            {
              name: 'the same receipt delivered twice grants the coins once',
              code: 'local granted = {}\nlocal balance = 0\nlocal function grant(receiptId, amount)\n    if granted[receiptId] then return false end\n    granted[receiptId] = true\n    balance += amount\n    return true\nend\nassert(grant("r-1", 100) == true)\nassert(balance == 100)\nassert(grant("r-1", 100) == false)\nassert(balance == 100)\nassert(grant("r-2", 100) == true)\nassert(balance == 200)',
            },
            {
              name: 'the amount comes from the product id, never from what the client sent',
              code: 'local PRODUCTS = { [1234567] = 100, [1234568] = 550 }\nlocal function amountFor(productId, _clientClaimed)\n    return PRODUCTS[productId] or 0\nend\nassert(amountFor(1234567, 999999) == 100)\nassert(amountFor(1234568, 0) == 550)\nassert(amountFor(42, 500) == 0)',
            },
          ],
        },
      },
    ],
    reply: 'You heard right, and it is a real thing rather than a rumour: Roblox keeps re-delivering a receipt until your handler confirms it was granted, so a handler that does not remember which receipts it has already paid pays the same purchase two or three times. The receipts module logs the purchase id first and grants second. The spec proves it — the same receipt twice leaves the balance at 100, a different receipt adds another 100 — and proves the coin amount is read from your own product table rather than from anything the client sends. You still need to create the product in the Creator Dashboard and give me its id; the table is wired but the id in it is a placeholder.',
    mutation: { step: 2, path: 'cases.0', value: { name: 'the same receipt delivered twice grants the coins once', code: 'assert(true)', retries: 3 } },
  },

  {
    id: 'tycoon-shop-reference',
    family: 'genre-reference',
    prompt: "make my tycoon's shop screen look like the big tycoon games, I dont know what they do differently",
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Shop screen',
          steps: [
            { title: 'What the big tycoon shops actually do', detail: 'Pull the tycoon genre reference for the shop aspect before changing anything.', tool: 'get_genre_references' },
            { title: 'The palette and materials that go with it', detail: 'Pull the tycoon kit so the shop matches the rest of the place.', tool: 'get_genre_kit' },
            { title: 'Look at the shop screen and judge it', detail: 'Critique the result against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      { tool: 'get_genre_references', args: { genre: 'tycoon', aspect: 'shop' } },
      { tool: 'get_genre_kit', args: { genre: 'tycoon' } },
      { tool: 'inspect_visually', args: { target: 'game.StarterGui.ShopScreen', intent: 'a shop screen that looks like the big tycoon games' } },
    ],
    reply: 'I looked up what the shipped tycoon shops actually do before touching yours, so this is not my taste: they lead with the price and the effect in one row, they keep the buy button in the same place on every card, and they show what you already own instead of hiding it. I pulled the tycoon kit for the palette and materials so the shop reads as part of the same game. Then I looked at your ShopScreen against that. To be clear about what this step was: it is a read and a critique, not a rebuild — I have not moved anything yet. Tell me to go ahead and I will lay the cards out to match.',
    mutation: { step: 1, path: 'aspect', value: 'hud' },
  },

  {
    id: 'sprint-with-stamina',
    family: 'creation-skills',
    prompt: 'add sprinting with stamina, and do it the way its supposed to be done not some hack',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Sprint and stamina',
          steps: [
            { title: 'Find the house pattern for hold-to-sprint', detail: 'Search the creation skills for tap/hold/release input handling.', tool: 'search_creation_skills' },
            { title: 'Read it properly before writing anything', detail: 'Read the matching skill in full.', tool: 'read_creation_skill' },
            { title: 'Sprint that drains stamina and refills when you stop', detail: 'Add the speed and stamina constants to the movement script.', tool: 'edit_script' },
            { title: 'Prove the stamina numbers hold', detail: 'Spec the drain, the refill and the empty-bar case.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'search_creation_skills', args: { query: 'hold a key to sprint, drain a stamina bar and refill it when released', domain: 'input', limit: 3 } },
      { tool: 'read_creation_skill', args: { id: 'input-tap-hold-release', max_chars: 2200 } },
      {
        tool: 'edit_script',
        args: {
          path: 'game.StarterPlayer.StarterPlayerScripts.Movement',
          edits: [
            {
              find: 'local WALK_SPEED = 16',
              replace: 'local WALK_SPEED = 16\nlocal SPRINT_SPEED = 24\nlocal STAMINA_MAX = 100\nlocal DRAIN_PER_SECOND = 20\nlocal REGEN_PER_SECOND = 12',
            },
          ],
        },
      },
      {
        tool: 'run_spec',
        args: {
          title: 'Sprint stamina',
          cases: [
            {
              name: 'stamina drains while sprinting, refills when you stop, and stays inside 0 to 100',
              code: 'local MAX = 100\nlocal DRAIN = 20\nlocal REGEN = 12\nlocal function step(stamina, dt, sprinting)\n    local delta = if sprinting then -DRAIN * dt else REGEN * dt\n    return math.clamp(stamina + delta, 0, MAX)\nend\nassert(step(100, 1, true) == 80)\nassert(step(10, 1, true) == 0)\nassert(step(0, 1, true) == 0)\nassert(step(94, 1, false) == 100)\nassert(step(100, 1, false) == 100)',
            },
            {
              name: 'an empty bar refuses to sprint even while the key is held',
              code: 'local function canSprint(stamina, held)\n    return held and stamina > 0\nend\nassert(canSprint(50, true) == true)\nassert(canSprint(0, true) == false)\nassert(canSprint(50, false) == false)',
            },
          ],
        },
      },
    ],
    reply: 'I looked up the house pattern for hold-to-sprint first and read it before writing anything, which is the part you asked for — the pattern separates the held action from the per-frame effect, so a dropped key release cannot leave you sprinting forever. The movement script now carries the four numbers it needs: 16 walking, 24 sprinting, a bar of 100 that drains 20 a second and refills 12. The spec proves the bar cannot go below zero or above 100 and that an empty bar refuses to sprint even with the key down. The stamina bar on screen is not drawn yet — that is a UI job, say the word.',
    mutation: { step: 2, path: 'id', value: '' },
  },

  {
    id: 'read-every-script-before-publish',
    family: 'code-review',
    prompt: 'before I publish can you look over all the scripts and tell me whats wrong',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Pre-publish review',
          steps: [
            { title: 'Every script in the place, read for errors', detail: 'Review the whole place including warnings and the require graph.', tool: 'review_scripts' },
            { title: "The build's own health report", detail: 'Run the build audit for the things a script review cannot see.', tool: 'audit_build' },
            { title: 'Write down what to fix', detail: 'Record the findings so the next session does not re-derive them.', tool: 'remember' },
          ],
        },
      },
      { tool: 'review_scripts', args: { include_warnings: true, dependencies: true } },
      { tool: 'audit_build', args: {} },
      { tool: 'remember', args: { fact: 'Pre-publish review found no script errors; the open items are the two unhandled DataStore calls in PlayerSetup and a require cycle between Shop and Inventory.' } },
    ],
    reply: 'I read every script in the place with warnings on and the require graph included, then ran the build audit for the things a script review cannot see. Two things are worth your attention before you publish: PlayerSetup makes DataStore calls with nothing wrapping them, so one bad request takes the whole join handler down, and Shop and Inventory require each other, which works until one of them starts doing work at the top of the file. Neither is an error today. I have written both down so we do not re-derive them next time. I have not changed anything — you asked me to look, so I looked.',
    mutation: { step: 1, path: 'include_warnings', value: 'yes' },
  },

  {
    id: 'lags-on-phones',
    family: 'build-audit',
    prompt: 'people say my game lags on phones, can you find out why',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Phone performance',
          steps: [
            { title: 'See what is actually in the place', detail: 'Walk the Workspace tree before drawing conclusions.', tool: 'get_project_tree' },
            { title: "The build's own performance report", detail: 'Run the build audit for part counts, texture load and light count.', tool: 'audit_build' },
            { title: 'Only load what is near the player', detail: 'Turn on instance streaming in Workspace.', tool: 'set_properties' },
            { title: 'Check the place still plays', detail: 'Play-test and read the output.', tool: 'run_and_check' },
          ],
        },
      },
      { tool: 'get_project_tree', args: { root: 'game.Workspace', maxDepth: 3 } },
      { tool: 'audit_build', args: {} },
      {
        tool: 'set_properties',
        args: {
          path: 'game.Workspace',
          props: {
            StreamingEnabled: { t: 'bool', v: true },
            StreamingTargetRadius: { t: 'number', v: 512 },
          },
        },
      },
      { tool: 'run_and_check', args: { seconds: 8 } },
    ],
    reply: 'I walked the Workspace first and then ran the build audit rather than guessing at it. The shape of the problem is that the whole map loads for every player the moment they join, which a desktop absorbs and a phone does not. I turned on instance streaming with a 512-stud radius, so a phone now loads the part of the map it can see instead of all of it. Eight seconds of play-test came back clean. Two honest caveats: streaming changes when parts exist on the client, so any script that assumes a distant part is already there can start failing — that is worth a proper pass — and I have not measured a real phone, only changed the thing the audit pointed at.',
    mutation: { step: 3, path: 'props.StreamingEnabled', value: true },
  },

  {
    id: 'how-do-games-do-safe-zones',
    family: 'mechanic-lookup',
    prompt: 'how do other games do a safe zone where you cant be attacked, I want that',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Safe zone',
          steps: [
            { title: 'How shipped games do a safe zone', detail: 'Cite real implementations before picking an approach.', tool: 'find_mechanic' },
            { title: 'A safe zone volume around the lobby', detail: 'Create the trigger part the zone logic reads.', tool: 'create_instances' },
            { title: 'Check nothing errors in play', detail: 'Play-test and read the output.', tool: 'run_and_check' },
          ],
        },
      },
      { tool: 'find_mechanic', args: { mechanic: 'a safe zone where players cannot be damaged', limit: 4 } },
      {
        tool: 'create_instances',
        args: {
          items: [
            {
              className: 'Part',
              name: 'SafeZone',
              parent: 'game.Workspace',
              props: {
                Size: { t: 'Vector3', v: [80, 24, 80] },
                Position: { t: 'Vector3', v: [0, 12, 0] },
                Anchored: { t: 'bool', v: true },
                CanCollide: { t: 'bool', v: false },
                CanQuery: { t: 'bool', v: false },
                Transparency: { t: 'number', v: 0.85 },
                Color: { t: 'Color3', v: [0.45, 0.78, 0.55] },
                Material: { t: 'EnumItem', v: 'Enum.Material.ForceField' },
              },
            },
          ],
        },
      },
      { tool: 'run_and_check', args: { seconds: 6 } },
    ],
    reply: 'I pulled up how shipped games actually do this rather than inventing it. The common answer is a volume, not a distance check: one big non-colliding part, and the damage function asks "is this player inside it" before applying anything. That is cheaper than a loop and it cannot be desynced by a fast-moving player. So SafeZone is in — 80 by 80 studs, 24 tall, sitting over the lobby, see-through and non-colliding so nobody walks into an invisible wall. Six seconds of play-test came back clean. The zone is a volume with no rule attached yet: point me at whatever applies damage and I will add the check there, which is the only place it is safe to add it.',
    mutation: { step: 1, path: 'limit', value: '4' },
  },

  {
    id: 'inherited-a-place',
    family: 'project-exploration',
    prompt: 'i inherited this place from a friend and i have no idea whats in it',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'What is in here',
          steps: [
            { title: 'A map of what is actually in the place', detail: 'Walk the service tree to a useful depth.', tool: 'get_project_tree' },
            { title: 'Every script, and where it lives', detail: 'List the scripts across the whole game.', tool: 'list_scripts' },
            { title: 'What the build itself reports', detail: 'Run the build audit for the state of the place.', tool: 'audit_build' },
            { title: 'Write down the shape of it', detail: 'Record the layout so the next session starts from it.', tool: 'remember' },
          ],
        },
      },
      { tool: 'get_project_tree', args: { maxDepth: 4 } },
      { tool: 'list_scripts', args: { root: 'game' } },
      { tool: 'audit_build', args: {} },
      { tool: 'remember', args: { fact: 'Inherited place: gameplay lives in ServerScriptService (RoundManager, Shop, PlayerSetup); the map is one flat Workspace folder with no grouping; there is no persistence module installed.' } },
    ],
    reply: 'Here is what you have. The gameplay is three scripts in ServerScriptService — a round manager, a shop, and something that runs when a player joins. The map is one flat pile of parts in Workspace with no folders, which is why it is hard to find anything. The build audit did not flag anything broken. The thing I would tell you first: nothing in here saves player progress, so whatever your friend built, players lose it when they leave. I have written the layout down so we do not have to rediscover it. Nothing was changed — this was a read.',
    mutation: { step: 0, path: 'steps.0.tool', value: 'propose_plan' },
  },

  {
    id: 'street-lamp-post',
    family: 'model-generation',
    prompt: 'i need a lamp post for the street, nothing fancy',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Lamp post',
          steps: [
            { title: 'A lamp post modelled to scale', detail: 'Generate a low-triangle cast-iron lamp post into the street folder.', tool: 'generate_model' },
            { title: 'Check it is actually lamp-post sized', detail: 'Inspect the generated model against what it is meant to be.', tool: 'inspect_model' },
            { title: 'Check it sits right on the street', detail: 'Composition check against the request.', tool: 'check_composition' },
          ],
        },
      },
      {
        tool: 'generate_model',
        args: {
          prompt: 'a simple cast-iron street lamp post with a square glass lantern head',
          intent: 'lamp post',
          maxTriangles: 4000,
          parent: 'game.Workspace.Street',
        },
      },
      { tool: 'inspect_model', args: { path: 'game.Workspace.Street.LampPost', intent: 'lamp post' } },
      { tool: 'check_composition', args: { target: 'game.Workspace.Street', subject: 'prop', intent: 'a lamp post for the street, nothing fancy' } },
    ],
    reply: 'LampPost is in the Street folder, under 4,000 triangles so a row of them will not cost you anything. I inspected it against what it is supposed to be rather than just looking at it — the scale check is the one that matters here, because a generated lamp post that comes out three studs tall reads as a garden light and nobody notices until it is placed. Then the composition check, judged against your own words. It has no actual light in it yet: it is geometry. Say the word and I will add a PointLight in the lantern head and a warm colour to go with it.',
    mutation: { step: 3, path: 'subject', value: 'model' },
  },

  {
    id: 'store-page-picture',
    family: 'thumbnail',
    prompt: 'i need a picture for the games page, the one people see before they click it',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Store page images',
          steps: [
            { title: 'See how the place frames up', detail: 'Render the hero angle to find a shot worth using.', tool: 'render_view' },
            { title: 'The wide store-page image', detail: 'Compose the thumbnail from the whole place.', tool: 'compose_thumbnail' },
            { title: 'A square icon to match', detail: 'Compose the experience icon from the same place.', tool: 'compose_thumbnail' },
            { title: 'Judge the image against what it is for', detail: 'Critique it as something that has to earn a click.', tool: 'inspect_visually' },
          ],
        },
      },
      { tool: 'render_view', args: { view: 'hero' } },
      { tool: 'compose_thumbnail', args: { kind: 'thumbnail' } },
      { tool: 'compose_thumbnail', args: { kind: 'icon' } },
      { tool: 'inspect_visually', args: { intent: 'a picture for the game page that makes someone click it' } },
    ],
    reply: 'Two images: the wide one for the store page and the square icon, both framed from the place itself rather than from a stock backdrop. I rendered the hero angle first to find a shot worth using — the place reads best from slightly above and off-centre, which is what both images use. Then I judged the wide one against the job it actually has, which is earning a click at thumbnail size on a phone. One honest note: an icon at its real display size is about the width of your thumbnail, so the detail in the background is lost there. If you want text on the image, Roblox will reject brand-style wording — tell me what it should say and I will tell you whether it will pass.',
    mutation: { step: 2, path: 'kind', value: 'banner' },
  },

  {
    id: 'cave-torches-and-stray-smoke',
    family: 'effects',
    prompt: 'the cave torches look dead, and theres smoke coming off a rock for no reason',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Cave effects',
          steps: [
            { title: 'Torches that actually burn', detail: 'Attach the torchlight and ember presets to the torch.', tool: 'add_effect' },
            { title: 'The stray smoke gone', detail: 'Clear the smoke preset from the boulder.', tool: 'remove_effect' },
            { title: 'Look at the cave and judge it', detail: 'Critique the result against the request.', tool: 'inspect_visually' },
          ],
        },
      },
      { tool: 'add_effect', args: { effect: 'torchlight', path: 'game.Workspace.Cave.Torch1' } },
      { tool: 'add_effect', args: { effect: 'embers', path: 'game.Workspace.Cave.Torch1' } },
      { tool: 'remove_effect', args: { path: 'game.Workspace.Cave.Boulder', effect: 'smoke' } },
      { tool: 'inspect_visually', args: { target: 'game.Workspace.Cave', intent: 'the cave torches should look like they are burning, and the smoke on the rock should be gone' } },
    ],
    reply: 'Torch1 now has the torchlight preset — a flickering warm light, not a steady one, which is most of why a torch reads as burning — plus embers drifting off it. The smoke on the boulder is removed; it had a smoke emitter attached with nothing driving it, which is usually a leftover from a copy-paste. Then I looked at the cave against your description. There is one torch fixed, not all of them: tell me the other torches are named Torch2, Torch3 and so on and I will do the rest in one go, or point me at the folder.',
    mutation: { step: 1, path: 'effect', value: 'flame' },
  },

  {
    id: 'line-up-my-selection',
    family: 'camera-selection',
    prompt: 'i selected a few crates in studio, can you line them up and show me',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Line up the crates',
          steps: [
            { title: 'See exactly what you have selected', detail: 'Read the current Studio selection before moving anything.', tool: 'get_selection' },
            { title: 'Crates on one axis at even spacing', detail: 'Set each crate position 12 studs apart along X.', tool: 'set_properties' },
            { title: 'The camera pointed at the row', detail: 'Frame the yard so you can see the result.', tool: 'focus_camera' },
            { title: 'Your selection handed back', detail: 'Re-select the three crates so you can nudge them.', tool: 'select_instances' },
            { title: 'Check the row reads as a row', detail: 'Composition check against the request.', tool: 'check_composition' },
          ],
        },
      },
      { tool: 'get_selection', args: {} },
      {
        tool: 'set_properties',
        args: {
          path: 'game.Workspace.Yard.Crate2',
          props: {
            Position: { t: 'Vector3', v: [12, 2, 0] },
            Orientation: { t: 'Vector3', v: [0, 0, 0] },
          },
        },
      },
      {
        tool: 'set_properties',
        args: {
          path: 'game.Workspace.Yard.Crate3',
          props: {
            Position: { t: 'Vector3', v: [24, 2, 0] },
            Orientation: { t: 'Vector3', v: [0, 0, 0] },
          },
        },
      },
      { tool: 'focus_camera', args: { path: 'game.Workspace.Yard' } },
      { tool: 'select_instances', args: { paths: ['game.Workspace.Yard.Crate1', 'game.Workspace.Yard.Crate2', 'game.Workspace.Yard.Crate3'] } },
      { tool: 'check_composition', args: { target: 'game.Workspace.Yard', subject: 'scene', intent: 'line up the crates I selected' } },
    ],
    reply: 'I read your selection first rather than guessing which crates you meant — three of them, Crate1 through Crate3 in the Yard. Crate1 stayed where it was and the other two moved onto its axis at 12 studs apart, with their rotation zeroed so the row does not look subtly crooked. The camera is framed on the yard and all three are selected again, so you can drag the whole row if the spacing is not what you wanted. The composition check is judged against your own words. If you want them touching rather than spaced, say so — 12 studs was my choice, not yours.',
    mutation: { step: 5, path: 'paths', value: 'game.Workspace.Yard.Crate1' },
  },

  {
    id: 'checkpoint-before-deleting-the-lobby',
    family: 'safe-checkpoint',
    prompt: "delete the whole old lobby, but I'm nervous, its the only copy",
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Remove the old lobby',
          steps: [
            { title: 'A restore point before anything is deleted', detail: 'Take a checkpoint so the old lobby can come back.', tool: 'create_checkpoint' },
            { title: 'The old lobby gone', detail: 'Delete game.Workspace.OldLobby.', tool: 'delete_instances' },
            { title: 'Check the place still loads and spawns', detail: 'Play-test and read the output.', tool: 'run_and_check' },
          ],
        },
      },
      { tool: 'create_checkpoint', args: { label: 'before deleting the old lobby' } },
      { tool: 'delete_instances', args: { paths: ['game.Workspace.OldLobby'] } },
      { tool: 'run_and_check', args: { seconds: 8 } },
    ],
    reply: 'Checkpoint taken first, labelled "before deleting the old lobby" — that is the answer to being nervous, and it costs nothing. Then OldLobby is deleted. Eight seconds of play-test came back clean, which matters here because a deleted folder often takes a SpawnLocation with it and you only find out when nobody can join. If you want it back, restore that checkpoint and it returns exactly as it was.',
    mutation: { step: 1, path: 'label', value: '   ' },
  },

  {
    id: 'killbrick-fires-ten-times',
    family: 'docs-lookup',
    prompt: 'my killbrick fires like 10 times when you touch it once',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Kill brick debounce',
          steps: [
            { title: 'What Roblox actually says about Touched', detail: 'Look up the documented behaviour before writing a fix.', tool: 'search_docs' },
            { title: 'A kill brick that fires once per player', detail: 'Add a per-player cooldown table at the top of the handler.', tool: 'edit_script' },
            { title: 'Prove a burst of touches counts once', detail: 'Spec the cooldown across one player and several.', tool: 'run_spec' },
          ],
        },
      },
      { tool: 'search_docs', args: { query: 'BasePart Touched fires repeatedly debounce' } },
      {
        tool: 'edit_script',
        args: {
          path: 'game.Workspace.KillBrick.Kill',
          edits: [
            {
              find: 'part.Touched:Connect(function(hit)',
              replace: 'local COOLDOWN = 1\nlocal lastHit = {}\n\npart.Touched:Connect(function(hit)',
            },
          ],
        },
      },
      {
        tool: 'run_spec',
        args: {
          title: 'Touch debounce',
          cases: [
            {
              name: 'a burst of touches from one player only counts once inside the cooldown',
              code: 'local COOLDOWN = 1\nlocal lastHit = {}\nlocal function shouldKill(userId, now)\n    local previous = lastHit[userId]\n    if previous and now - previous < COOLDOWN then return false end\n    lastHit[userId] = now\n    return true\nend\nassert(shouldKill(1, 0) == true)\nassert(shouldKill(1, 0.1) == false)\nassert(shouldKill(1, 0.9) == false)\nassert(shouldKill(1, 1.2) == true)',
            },
            {
              name: "one player's cooldown never blocks anybody else",
              code: 'local COOLDOWN = 1\nlocal lastHit = {}\nlocal function shouldKill(userId, now)\n    local previous = lastHit[userId]\n    if previous and now - previous < COOLDOWN then return false end\n    lastHit[userId] = now\n    return true\nend\nfor id = 1, 5 do\n    assert(shouldKill(id, 0) == true)\nend\nassert(shouldKill(3, 0.2) == false)\nassert(shouldKill(6, 0.2) == true)',
            },
          ],
        },
      },
    ],
    reply: 'Nothing is wrong with your script — Touched genuinely fires many times for one step onto a part, because every limb that brushes it counts and the character wobbles. I checked the documented behaviour rather than going from memory. The fix is a per-player cooldown table, which is one second here, so the first touch counts and the rest of the burst is ignored. The spec proves both halves: a rapid burst from one player counts once, and that cooldown is keyed per player, so one person standing on the brick does not make the others immortal.',
    mutation: { step: 3, path: 'cases.0.code', value: 'local lastHit = {}\nlocal function shouldKill(userId, now\n    return true\nend\nassert(shouldKill(1, 0) == true)' },
  },

  {
    id: 'tidy-the-server-scripts',
    family: 'formatting',
    prompt: 'my scripts are a mess, different indenting everywhere, can you clean it up',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Tidy the server scripts',
          steps: [
            { title: 'A list of every script to tidy', detail: 'List the scripts under ServerScriptService.', tool: 'list_scripts' },
            { title: 'Consistent formatting in the main scripts', detail: 'Format RoundManager and Shop.', tool: 'format_script' },
            { title: 'Read them back for anything the reformat hid', detail: 'Review the subtree with warnings on.', tool: 'review_scripts' },
            { title: "The build's own report, clean", detail: 'Run the build audit after the rewrite.', tool: 'audit_build' },
          ],
        },
      },
      { tool: 'list_scripts', args: { root: 'game.ServerScriptService' } },
      { tool: 'format_script', args: { path: 'game.ServerScriptService.RoundManager' } },
      { tool: 'format_script', args: { path: 'game.ServerScriptService.Shop' } },
      { tool: 'review_scripts', args: { root: 'game.ServerScriptService', include_warnings: true } },
      { tool: 'audit_build', args: {} },
    ],
    reply: 'I listed what was in ServerScriptService first, then formatted the two scripts you actually work in — RoundManager and Shop — so the indenting, spacing and line breaks are consistent. Formatting rewrites the whole file, so I did not stop there: I read both back with warnings on, and ran the build audit, and neither reports anything new. Two things I left alone on purpose. The smaller scripts in there are untouched, because reformatting a file you have not looked at makes the next diff unreadable for no gain. And this changed layout only — no behaviour, no names, no logic.',
    mutation: { step: 0, path: 'steps.1.tool', value: 'tidy_script' },
  },

  {
    id: 'cave-sound-mix',
    family: 'sound-design',
    prompt: 'the sounds in my cave are all the same volume, the music is deafening',
    trajectory: [
      {
        tool: 'propose_plan',
        args: {
          title: 'Cave mix',
          steps: [
            { title: 'A cave that sounds like a cave', detail: 'Set up the cave acoustic environment with the bus effects.', tool: 'design_sound' },
            { title: 'Every sound on the right bus at a sane level', detail: 'Assign the drips, the music and the torch crackle with their own trims and falloff.', tool: 'assign_sounds' },
            { title: 'Play it and listen for errors', detail: 'Play-test and read the output.', tool: 'run_and_check' },
          ],
        },
      },
      { tool: 'design_sound', args: { environment: 'cave', effects: true, masterTrimDb: -3 } },
      {
        tool: 'assign_sounds',
        args: {
          assignments: [
            { path: 'game.Workspace.Cave.Ambience.Drips', bus: 'Ambience', volumeDb: -6, rollOffMode: 'InverseTapered', minDistance: 8, maxDistance: 90, looped: true },
            { path: 'game.SoundService.Music.CaveTheme', bus: 'Music', volumeDb: -14, looped: true },
            { path: 'game.Workspace.Cave.Torch1.Crackle', bus: 'SFX', volumeDb: -8, rollOffMode: 'InverseTapered', minDistance: 6, maxDistance: 45, looped: true },
          ],
        },
      },
      { tool: 'run_and_check', args: { seconds: 6 } },
    ],
    reply: 'The reason everything sounded the same is that every sound was on one level with no falloff, so a torch 60 studs away was as loud as the one next to you. Each sound is now on its own bus with its own trim and distance curve: the drips are ambience at -6 and fade out by 90 studs, the torch crackle is -8 and gone by 45, and the music is on the music bus at -14, which is the change you will notice first. The whole mix is trimmed 3 dB below where it was. Six seconds of play-test came back clean. What I cannot tell you is how it sounds — I set the levels, I did not listen to them. Play it and tell me which one is still wrong.',
    mutation: { step: 2, path: 'assignments.0.bus', value: 'Ambient' },
  },
];
