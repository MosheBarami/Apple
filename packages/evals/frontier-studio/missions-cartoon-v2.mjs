// Fixed holdout for Apple's 2026-09-25 colorful-cartoon-only product scope.
// Do not edit this bank after a run; create v3 instead. Keep prompts out of training.
export const BANK = 'cartoon-v2';

const STYLE = 'Make it unmistakably a bright, colorful cartoon Roblox game: one cohesive palette, playful silhouettes, readable polished UI, and lively effects. Use rights-verified Roblox-specific assets for all detailed models, UI and effects; primitive parts are for simple structure only. Build and playtest the complete requested loop, not a blockout.';

export const GENRES = [
  {
    id: 'mining-simulator', brief: 'Build a gem-mining simulator with a vivid toy-like hub. Mine, fill a bag, sell gems, buy a better tool, unlock a zone, rebirth and retain progress. Give shop, bag, HUD and mobile controls real working states.',
    features: ['mine-gem', 'bag-capacity', 'sell-gems', 'tool-upgrade', 'zone-unlock', 'rebirth', 'saved-progress', 'working-shop'],
    assets: ['hub-map', 'ore-models', 'shop-station', 'tools', 'effects'],
  },
  {
    id: 'candy-tycoon', brief: 'Build a cheerful candy factory tycoon. Players claim distinct plots, run droppers and conveyors, collect income, buy a connected upgrade chain, see a finished factory exterior and return to saved progress. Two players must not steal each other’s income.',
    features: ['claim-plot', 'dropper', 'conveyor', 'collect-income', 'buy-upgrade', 'ownership-isolation', 'saved-progress', 'purchase-ui'],
    assets: ['factory-map', 'candy-machines', 'decor', 'effects'],
  },
  {
    id: 'rainbow-obby', brief: 'Build a bright themed obby with twelve varied stages, checkpoints, deaths and respawn, a timer, finish reward, stage selection and mobile-friendly HUD. The opening and finish must share an authored visual identity.',
    features: ['twelve-stages', 'checkpoints', 'hazards', 'respawn', 'timer', 'finish-reward', 'stage-select', 'progress-ui'],
    assets: ['obby-map', 'hazards', 'checkpoint', 'finish', 'effects'],
  },
  {
    id: 'toy-tower-defense', brief: 'Build a playful toy-soldier tower defense game. Place two tower types on valid ground; enemies follow a path; towers target them; earned money, upgrades and win/loss states work. Make the battlefield and shop HUD polished and legible.',
    features: ['place-tower', 'valid-placement', 'wave-spawn', 'path-follow', 'target-enemy', 'earn-currency', 'upgrade-tower', 'win-loss'],
    assets: ['defense-map', 'toy-towers', 'toy-enemies', 'projectiles', 'effects'],
  },
  {
    id: 'garden-farming', brief: 'Build a colorful cartoon garden game with seed purchasing, planting, visible growth, harvesting, a sell stand, tool upgrades and saved inventory. Stock the opening shop and make the world, HUD and mobile controls usable.',
    features: ['buy-seed', 'plant', 'grow', 'harvest', 'sell', 'upgrade-tool', 'saved-inventory', 'shop-ui'],
    assets: ['garden-map', 'crop-models', 'market-stall', 'tools', 'effects'],
  },
  {
    id: 'kart-racing', brief: 'Build a joyful cartoon kart race. Drive a working kart around a coherent colorful track; countdown, ordered checkpoints, lap timing, finish placement, reset recovery and results must work for two independent players.',
    features: ['drive-kart', 'race-countdown', 'ordered-checkpoints', 'lap-count', 'lap-time', 'finish-placement', 'reset-recovery', 'results-ui'],
    assets: ['race-map', 'karts', 'barriers', 'finish', 'effects'],
  },
  {
    id: 'fantasy-adventure', brief: 'Build a whimsical cooperative fantasy adventure with a friendly village hub, dungeon entrance, enemies, server-authoritative damage, two abilities, loot, a cartoon boss, victory and return to hub.',
    features: ['enter-dungeon', 'enemy-ai', 'server-damage', 'health', 'two-abilities', 'loot', 'boss', 'victory-return'],
    assets: ['adventure-map', 'creatures', 'boss', 'loot', 'effects'],
  },
  {
    id: 'party-minigames', brief: 'Build a complete colorful party game with a welcoming lobby and three distinct timed minigames. Rotate players into rounds, show clear instructions, award points, eliminate or finish players fairly, display winners and return to the next round.',
    features: ['lobby', 'three-minigames', 'round-rotation', 'instructions', 'timer', 'scoring', 'winner', 'next-round'],
    assets: ['party-map', 'minigame-props', 'lobby-decor', 'effects'],
  },
  {
    id: 'pet-collection', brief: 'Build a bright cartoon pet collection game. Earn currency, buy an egg, show a hatch reveal, manage inventory and equip limits, display followers, use a pet ability and save the collection. Make the world and collection screens feel complete.',
    features: ['earn-currency', 'buy-egg', 'hatch', 'pet-inventory', 'equip-limit', 'followers', 'pet-ability', 'saved-collection'],
    assets: ['pet-map', 'eggs', 'pet-models', 'shop', 'effects'],
  },
  {
    id: 'storybook-town', brief: 'Build a storybook cartoon town roleplay game with an explorable street, furnished interiors, two jobs, an income loop, a vehicle, a usable phone menu, saved cosmetics and clear onboarding.',
    features: ['explore-town', 'enter-interior', 'job-one', 'job-two', 'earn-income', 'drive-vehicle', 'saved-cosmetics', 'onboarding'],
    assets: ['town-map', 'buildings', 'furniture', 'vehicle', 'effects'],
  },
  {
    id: 'paint-arena', brief: 'Build a colorful toy paint arena with a lobby, team assignment, balanced spawns, server-authoritative paint combat, score, round timer, respawn, winner screen and rematch. Two players must receive independent state.',
    features: ['lobby', 'team-assignment', 'balanced-spawns', 'server-combat', 'score', 'round-timer', 'respawn', 'rematch'],
    assets: ['arena-map', 'paint-tools', 'cover', 'spawn', 'effects'],
  },
  {
    id: 'cartoon-cafe', brief: 'Build a playful cartoon café management game. Customers arrive, get seated, order, wait for cooking and delivery, pay, and fund an upgrade. Progress saves; the kitchen, dining room and working order UI look like one game.',
    features: ['customer-arrival', 'seat-customer', 'take-order', 'cook', 'deliver', 'collect-payment', 'upgrade', 'saved-progress'],
    assets: ['cafe-map', 'furniture', 'food', 'kitchen', 'effects'],
  },
];

export const TASKS = GENRES.flatMap((genre) => [1, 2, 3].map((replicate) => ({
  id: `${BANK}-${genre.id}-r${replicate}`,
  bank: BANK,
  genre: genre.id,
  replicate,
  prompt: `${genre.brief} ${STYLE}`,
  features: genre.features,
  assets: genre.assets,
  visualScope: 'colorful-cartoon',
  start: 'fresh-baseplate',
  mode: 'agent',
  autonomous: true,
})));
