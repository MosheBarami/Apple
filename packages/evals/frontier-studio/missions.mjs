// A fixed, customer-shaped holdout for complete games in a real paired Studio place.
// Keep prompts out of training and model instructions. Each mission has twelve observable
// requirements, so a beautiful but non-functional blockout cannot pass.
export const GENRES = [
  {
    id: 'simulator',
    brief: 'Build a complete cartoon mining simulator. A new player can mine rocks, sell ore, upgrade a tool, unlock a new zone and rebirth. Include a polished hub, shop, inventory, mobile controls and a saved progression loop.',
    features: ['mine-rock', 'ore-inventory', 'sell-ore', 'tool-upgrade', 'zone-unlock', 'rebirth', 'saved-progress', 'shop-ui'],
    assets: ['hub-map', 'rocks', 'shop', 'tool', 'effects'],
  },
  {
    id: 'tycoon',
    brief: 'Build a complete factory tycoon with a claimable plot, working droppers and conveyors, earnings collection, purchase buttons, upgrade chain, a finished exterior and saved ownership. It must work for two players at once.',
    features: ['claim-plot', 'dropper', 'conveyor', 'collect-income', 'buy-upgrade', 'ownership-isolation', 'saved-progress', 'purchase-ui'],
    assets: ['factory-map', 'machines', 'decor', 'effects'],
  },
  {
    id: 'obby',
    brief: 'Build a complete themed obby with at least twelve varied stages, checkpoints, deaths and respawn, a timer, a finish reward, stage selection and a mobile-friendly HUD. The first and last stages must feel like parts of one polished game.',
    features: ['twelve-stages', 'checkpoints', 'hazards', 'respawn', 'timer', 'finish-reward', 'stage-select', 'progress-ui'],
    assets: ['obby-map', 'hazards', 'checkpoint', 'finish', 'effects'],
  },
  {
    id: 'tower-defense',
    brief: 'Build a complete small tower defense game. Players place two tower types on valid ground, waves follow a path, towers target enemies, money is awarded correctly, upgrades work and a win or loss ends the match. Add a polished map and shop HUD.',
    features: ['place-tower', 'valid-placement', 'wave-spawn', 'path-follow', 'target-enemy', 'earn-currency', 'upgrade-tower', 'win-loss'],
    assets: ['defense-map', 'towers', 'enemies', 'projectiles', 'effects'],
  },
  {
    id: 'farming',
    brief: 'Build a complete farming game with plots, seeds, planting, visible crop growth, harvesting, a sell stand, tool upgrades and saved inventory. Make the garden attractive and make the shop, inventory and mobile controls usable.',
    features: ['buy-seed', 'plant', 'grow', 'harvest', 'sell', 'upgrade-tool', 'saved-inventory', 'shop-ui'],
    assets: ['farm-map', 'crops', 'stall', 'tools', 'effects'],
  },
  {
    id: 'racing',
    brief: 'Build a complete kart race with a coherent track, working vehicle controls, countdown, checkpoints in order, lap timing, finish placement, reset recovery and a readable results screen. Two players must be able to finish independently.',
    features: ['drive-kart', 'race-countdown', 'ordered-checkpoints', 'lap-count', 'lap-time', 'finish-placement', 'reset-recovery', 'results-ui'],
    assets: ['race-map', 'karts', 'barriers', 'finish', 'effects'],
  },
  {
    id: 'dungeon',
    brief: 'Build a complete cooperative dungeon with an entrance, enemies, damage and health, two abilities, loot, a boss encounter, victory and return to hub. Include readable action HUD and a coherent fantasy environment.',
    features: ['enter-dungeon', 'enemy-ai', 'server-damage', 'health', 'two-abilities', 'loot', 'boss', 'victory-return'],
    assets: ['dungeon-map', 'enemies', 'boss', 'loot', 'effects'],
  },
  {
    id: 'horror',
    brief: 'Build a complete short horror experience: navigable rooms, discoverable clues, locked doors and keys, an enemy that can chase the player, a fail and restart path, an ending and atmospheric sound and lighting. The objective must be clear without developer instructions.',
    features: ['navigate-rooms', 'find-clue', 'find-key', 'unlock-door', 'enemy-chase', 'fail-restart', 'ending', 'objective-ui'],
    assets: ['horror-map', 'clues', 'doors', 'enemy', 'effects'],
  },
  {
    id: 'pet-collection',
    brief: 'Build a complete pet collection game with an egg shop, earned currency, hatch reveal, inventory, equip limit, visible followers, pet abilities and saved collection. Make the world and collection screens feel like a commercial Roblox game.',
    features: ['earn-currency', 'buy-egg', 'hatch', 'pet-inventory', 'equip-limit', 'followers', 'pet-ability', 'saved-collection'],
    assets: ['pet-map', 'eggs', 'pets', 'shop', 'effects'],
  },
  {
    id: 'roleplay',
    brief: 'Build a complete small town roleplay experience with an explorable street, furnished interiors, two jobs, an income loop, a vehicle, a usable phone or menu, persistent cosmetics and clear player onboarding.',
    features: ['explore-town', 'enter-interior', 'job-one', 'job-two', 'earn-income', 'drive-vehicle', 'saved-cosmetics', 'onboarding'],
    assets: ['town-map', 'buildings', 'furniture', 'vehicle', 'effects'],
  },
  {
    id: 'arena',
    brief: 'Build a complete round-based arena game with lobby, team assignment, balanced spawns, server-authoritative combat, score, round timer, respawn, winner announcement and rematch. It must remain correct with two players.',
    features: ['lobby', 'team-assignment', 'balanced-spawns', 'server-combat', 'score', 'round-timer', 'respawn', 'rematch'],
    assets: ['arena-map', 'weapons', 'cover', 'spawn', 'effects'],
  },
  {
    id: 'restaurant',
    brief: 'Build a complete restaurant management game with arriving customers, seating, orders, cooking, delivery, payment, a restaurant upgrade and saved progress. The kitchen and dining area need a coherent, polished look.',
    features: ['customer-arrival', 'seat-customer', 'take-order', 'cook', 'deliver', 'collect-payment', 'upgrade', 'saved-progress'],
    assets: ['restaurant-map', 'furniture', 'food', 'kitchen', 'effects'],
  },
];

export const TASKS = GENRES.flatMap((genre) => [1, 2, 3].map((replicate) => ({
  id: `${genre.id}-r${replicate}`,
  genre: genre.id,
  replicate,
  // Same customer brief over three independent fresh Baseplates: repeatability matters.
  prompt: genre.brief,
  features: genre.features,
  assets: genre.assets,
  start: 'fresh-baseplate',
  mode: 'agent',
  autonomous: true,
})));
