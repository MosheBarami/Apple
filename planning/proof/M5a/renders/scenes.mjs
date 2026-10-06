// Scratch: expands block runs for sample requests into Luau that builds them in Studio (edit mode) for a viewport look.
import { stepOps, runOrder } from '../../../../apps/worker/src/recipe.ts';
import { BLOCKS } from '../../../../apps/worker/src/blocks.generated.ts';
import { checkFill } from '../../../../apps/worker/src/plan-fill.ts';

const egg = (name, price, icon, colour, note, button = 'green') => ({ name, price, icon, colour, note, button });
const row = (icon, label, detail, value, colour, progress = 0, button = '', buttonColour = 'green') => ({ icon, label, detail, value, colour, progress, button, buttonColour });
export const SCENES = {
  U01: { blocks: ['panel', 'item-grid'], params: { panel: { screen: 'EggShop', title: 'Egg Shop', accent: 'green', width: 0.62, height: 0.8 }, 'item-grid': { currency: '💎',
    featured: [egg('Mythic Galaxy Egg', '25,000', '🌌', 'purple', 'Limited time!')],
    items: [egg('Forest Egg', '250', '🥚', 'green', 'Common'), egg('Ocean Egg', '600', '🐚', 'blue', 'Uncommon'), egg('Lava Egg', '1,500', '🔥', 'red', 'Rare'),
      egg('Candy Egg', '3,000', '🍭', 'pink', 'Epic'), egg('Golden Egg', '7,500', '🌟', 'yellow', 'Legendary'), egg('Shadow Egg', '12,000', '🌑', 'grey', 'Mythic')] } } },
  U02: { blocks: ['menu'], params: { menu: { title: 'Brick Battle', subtitle: 'Build. Battle. Win.', accent: 'blue', buttons: [
    { label: 'Play', icon: '▶', colour: 'green', closes: true }, { label: 'Settings', icon: '⚙', colour: 'blue', closes: false }, { label: 'Shop', icon: '🛒', colour: 'yellow', closes: false }] } } },
  U03: { blocks: ['hud'], params: { hud: { counters: [{ icon: '💰', value: '12,450', colour: 'yellow', stat: 'Coins' }, { icon: '💎', value: '320', colour: 'blue', stat: 'Gems' }],
    bars: [{ label: 'Level 7  •  640 / 1,000 XP', progress: 0.64, colour: 'green' }] } } },
  U07: { blocks: ['panel', 'row-list'], params: { panel: { screen: 'Upgrades', title: 'Upgrades', accent: 'orange' }, 'row-list': { showButton: true, showProgress: true, items: [
    row('👊', 'Click Power', '+1 coin per click', 'Lv 4', 'red', 0.4, '💰 120'), row('⚡', 'Auto Clicker', '+2 coins / second', 'Lv 2', 'yellow', 0.2, '💰 450'),
    row('🍀', 'Lucky Coins', '5% chance of x3', 'Lv 1', 'green', 0.1, '💰 900'), row('🧲', 'Coin Magnet', 'Pick up from further', 'Lv 0', 'blue', 0, '💰 2,500', 'grey'),
    row('💎', 'Gem Finder', '+1% gem drops', 'Lv 0', 'purple', 0, '💰 8,000', 'grey')] } } },
  U05: { blocks: ['panel', 'item-grid'], params: { panel: { screen: 'Daily', title: 'Daily Rewards', accent: 'yellow' }, 'item-grid': { currency: '', cellWidth: 130, cellHeight: 170, items: [
    egg('Day 1', 'Claimed', '💰', 'grey', '100 coins', 'grey'), egg('Day 2', 'Claimed', '💎', 'grey', '10 gems', 'grey'), egg('Day 3', 'Claim!', '🎁', 'yellow', 'Today', 'green'),
    egg('Day 4', 'Day 4', '💰', 'blue', '500 coins', 'grey'), egg('Day 5', 'Day 5', '⚡', 'blue', '2x boost', 'grey'), egg('Day 6', 'Day 6', '💎', 'blue', '50 gems', 'grey'),
    egg('Day 7', 'Day 7', '🏆', 'purple', 'Mega chest', 'grey')] } } },
  U06: { blocks: ['panel', 'setting-rows'], params: { panel: { screen: 'Settings', title: 'Settings', accent: 'blue', width: 0.5, height: 0.6 }, 'setting-rows': { settings: [
    { label: 'Music', icon: '🎵', slider: true, switch: false, value: 0.7, state: 'On', options: 'On/Off', colour: 'blue' },
    { label: 'Sound Effects', icon: '🔊', slider: true, switch: false, value: 0.9, state: 'On', options: 'On/Off', colour: 'green' },
    { label: 'Graphics', icon: '🖥', slider: false, switch: true, value: 0, state: 'High', options: 'High/Medium/Low', colour: 'purple' }] } } },
  U09: { blocks: ['panel', 'code-entry'], params: { panel: { screen: 'Codes', title: 'Codes', accent: 'purple', width: 0.45, height: 0.55 }, 'code-entry': {} } },
  U04: { blocks: ['panel', 'progress-panel'], params: { panel: { screen: 'Rebirth', title: 'Rebirth', accent: 'purple', width: 0.5, height: 0.7 }, 'progress-panel': { stats: [
    { label: 'Current multiplier', value: 'x2', colour: 'yellow' }, { label: 'Next multiplier', value: 'x3', colour: 'green' }, { label: 'Cost', value: '💰 10,000', colour: 'orange' }],
    barLabel: '6,500 / 10,000', progress: 0.65, barColour: 'purple', action: 'Rebirth', actionColour: 'grey' } } },
  U11: { blocks: ['loading-screen'], params: { 'loading-screen': { title: 'Brick Battle', tagline: 'Loading the arena...', icon: '⚔', accent: 'blue' } } },
  U10: { blocks: ['panel', 'row-list'], params: { panel: { screen: 'Leaderboard', title: 'Top Players', accent: 'yellow', width: 0.5 }, 'row-list': { showDetail: false, items: [
    row('1', 'BlockMaster99', '', '1,284 wins', 'yellow'), row('2', 'NoobSlayerX', '', '1,102 wins', 'grey'), row('3', 'StudQueen', '', '987 wins', 'orange'),
    row('4', 'PixelPanda', '', '850 wins', 'blue'), row('5', 'TurboTim', '', '799 wins', 'blue'), row('6', 'LavaLuna', '', '655 wins', 'blue')] } } },
  U15: { blocks: ['hud'], params: { hud: { counters: [{ icon: '💵', value: '$48,200', colour: 'green', stat: 'Cash' }, { icon: '⏱', value: '$320/s', colour: 'yellow', stat: '' }],
    buttons: [{ label: 'Rebirth', icon: '♻', colour: 'purple' }] } } },
  U08: { blocks: ['panel', 'item-grid'], params: { panel: { screen: 'Inventory', title: 'Inventory', accent: 'blue', width: 0.62, height: 0.8 }, 'item-grid': { currency: '', cellWidth: 130, cellHeight: 170, items: [
    egg('Dragon', 'Equipped', '🐉', 'yellow', 'Legendary', 'grey'), egg('Unicorn', 'Equip', '🦄', 'purple', 'Epic'), egg('Fox', 'Equip', '🦊', 'blue', 'Rare'),
    egg('Cat', 'Equip', '🐱', 'green', 'Uncommon'), egg('Dog', 'Equip', '🐶', 'grey', 'Common'), egg('Owl', 'Equip', '🦉', 'blue', 'Rare'),
    egg('Bunny', 'Equip', '🐰', 'grey', 'Common'), egg('Panda', 'Equip', '🐼', 'green', 'Uncommon'), egg('Phoenix', 'Equip', '🔥', 'yellow', 'Legendary'),
    egg('Frog', 'Equip', '🐸', 'grey', 'Common'), egg('Bee', 'Equip', '🐝', 'green', 'Uncommon'), egg('Shark', 'Equip', '🦈', 'purple', 'Epic')] } } },
  U12: { blocks: ['toast'], params: { toast: { samples: [{ icon: '💰', text: '+250 Coins', colour: 'yellow' }, { icon: '💎', text: '+5 Gems', colour: 'blue' }, { icon: '🏆', text: 'Quest complete!', colour: 'green' }] } } },
  U13: { blocks: ['panel', 'row-list'], params: { panel: { screen: 'Quests', title: 'Daily Quests', accent: 'green', width: 0.55, height: 0.62 }, 'row-list': { showProgress: true, showButton: true, items: [
    row('💰', 'Collect 500 coins', '320 / 500', '💎 10', 'yellow', 0.64, 'Claim', 'grey'), row('⚔', 'Defeat 10 enemies', '10 / 10', '💎 25', 'red', 1, 'Claim', 'green'),
    row('⏱', 'Play for 15 minutes', '6 / 15 min', '💎 15', 'blue', 0.4, 'Claim', 'grey')] } } },
  U14: { blocks: ['panel', 'item-grid'], params: { panel: { screen: 'Gamepasses', title: 'Gamepasses', accent: 'yellow', width: 0.62, height: 0.82 }, 'item-grid': { currency: 'R$', cellWidth: 170, cellHeight: 200,
    featured: [egg('x2 Coins', '199', '💰', 'yellow', 'Every coin doubled')],
    items: [egg('VIP', '399', '👑', 'purple', 'Chat tag + lounge'), egg('Fast Walk', '99', '👟', 'blue', '+50% speed'), egg('Lucky Pets', '249', '🍀', 'green', 'Better hatch odds')] } } },
};

export function luauFor(id) {
  const scene = SCENES[id];
  const plan = runOrder(scene.blocks);
  if (!plan.ok) throw new Error(plan.refused);
  const filled = checkFill(scene.params, scene.blocks);
  if (!filled.ok) throw new Error(filled.errors.join('\n'));
  // carry the panel's screen into content blocks, as build_blocks does
  for (const b of plan.order) if (BLOCKS[b].block.params.properties.screen && !(scene.params[b] ?? {}).screen) {
    const host = BLOCKS[b].block.depends.map((d) => filled.params[d]?.screen).find(Boolean);
    if (host) filled.params[b].screen = host;
  }
  const ops = plan.order.flatMap((b) => BLOCKS[b].recipe.steps.flatMap((s) => stepOps(s, BLOCKS[b], filled.params[b]))).filter((o) => o.op === 'create_instances');
  return ops;
}

if (process.argv[2]) {
  const ops = luauFor(process.argv[2]);
  process.stdout.write(JSON.stringify(ops));
}
