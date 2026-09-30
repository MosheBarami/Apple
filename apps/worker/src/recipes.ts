/**
 * Recipes: what a composed game is made of. Every piece is a real owner-library item (game hash prefix + path, as
 * the 2026-09-30 component survey found them); nothing is a whole world. The composer (compose.ts) builds a new map
 * and installs the components; the recipe only chooses pieces, words and numbers.
 */
import type { KitProfile, LibRef, Recipe } from './compose';

const ref = (game: string, path: string): LibRef => ({ game, path });

/** The Plants vs Brainrots kit: bright, glossy, image-skinned (survey rank 1). Its scripts go; its screens stay. */
export const PVB_KIT: KitProfile = {
  id: 'plants-vs-brainrots-005e26',
  screens: [ref('321e74b79cd7', '/StarterGui/Main')],
  card: { ref: ref('321e74b79cd7', '/ReplicatedStorage/Assets/SeedSlot'), into: 'Main.Seeds.Frame.ScrollingFrame' },
  roles: {
    money: 'Main.Bottom.Money',
    timer: 'Main.Right.ImminentAttackTimer.Main.Time',
    wave: 'Main.Right.ImminentAttackTimer.Main.Battle_Button.Main.Text',
    base: 'Main.DefeatCounter.TextLabel',
    message: 'Main.Bottom.Changes.MoneyChange',
    shopButton: 'Main.Right.Seeds.TextButton',
    shopLabel: 'Main.Right.Seeds.TextLabel',
    shopPanel: 'Main.Seeds',
    shopClose: 'Main.Seeds.Close.TextButton',
    shopList: 'Main.Seeds.Frame.ScrollingFrame',
    shopCard: 'Main.Seeds.Frame.ScrollingFrame.SeedSlot',
  },
  remove: [
    'Main.LowPerformance.LocalScript', 'Main.PlaceVersion.label.version', 'Main.DefeatCounter.TextLabel.LocalScript',
    'Main.Shop.Main.ScrollingFrame.SpookyPlantCrate.Limited_Animations_PlantCrate',
    'Main.Shop.Main.ScrollingFrame.LimitedSeed_V2.Limited_Animations',
    'Main.Shop.Main.ScrollingFrame.SpookyPlantCrate.Chances.Frame.Frame.TextButton.Chances',
  ],
  hide: [
    'Main.Left', 'Main.Tutorial', 'Main.Effects', 'Main.BrainrotNoti', 'Main.Upgrade', 'Main.CashPerSecond', 'Main.PlaceVersion',
    'Main.Empty', 'Main.Update_Timer', 'Main.FPSCounter', 'Main.DialogueFrame', 'Main.Right.Garden', 'Main.Right.Sell',
    'Main.Right.Folder', 'Main.Seeds.InstantRestock', 'Main.Seeds.Restock',
  ],
};

const BODY = {
  mythic: ref('f3ac50e43d68', '/ReplicatedStorage/Assets/Enemies/Normal/MythicNPC'),
};

/** "Defend your orchard from vegetables that come in waves." The enemies ARE vegetables: bodies wearing vegetables. */
export function orchardRecipe(seed = 20260930): Recipe {
  return {
    title: 'Orchard Siege',
    currency: 'Coins',
    start: 60,
    words: {
      wave: 'Wave', nextWave: 'Veggies in', left: 'veggies left', base: 'Orchard', lost: 'The veggies took the orchard! Again...',
      pick: 'Tap a glowing spot to plant', shop: 'Trees',
    },
    palette: { grass: '#6fd14a', path: '#c89a5e', soil: '#8b5a2b', tile: '#7a4e25', border: '#a0703f' },
    kit: PVB_KIT,
    // Every body is MythicNPC: plain parts, so it always renders. Costumes are pieces that render in a new place
    // (measured 2026-09-30): the tomato and pumpkin meshes, and the part-built vegetable plants of a Plants vs Brainrots
    // variant (no meshes, so nothing to fail).
    enemies: [
      { name: 'Tomato', body: BODY.mythic, costume: ref('1540eb1e7df2', '/SavedGameModules/Workspace/Tomato#4'), upright: false, limbColor: '#2f8f3a', health: 30, speed: 7, reward: 4, damage: 1, scale: 1.3 },
      { name: 'Carrot', body: BODY.mythic, costume: ref('75a308cbb526', '/ReplicatedStorage/Assets/Plants/Mr Carrot'), upright: true, limbColor: '#3f9b36', health: 45, speed: 6, reward: 6, damage: 1, stretch: 1.4, scale: 2.2 },
      { name: 'Eggplant', body: BODY.mythic, costume: ref('75a308cbb526', '/ReplicatedStorage/Assets/Plants/Eggplant'), upright: true, limbColor: '#2e7d32', health: 80, speed: 4.5, reward: 10, damage: 2, size: 1.3, stretch: 1.6 },
      { name: 'Pumpkin King', body: BODY.mythic, costume: ref('c047d7a2d6c5', '/ReplicatedStorage/Pumpkin/body/Pumpkin/Pumpkin'), upright: false, limbColor: '#2e7d32', health: 400, speed: 3, reward: 60, damage: 8, scale: 1.4, size: 1.9 },
    ],
    defenders: [
      { id: 'AppleTree', name: 'Apple Tree', model: ref('b9ad059e0b42', '/SavedGameModules/Workspace/Trees/Apple Tree#3'), height: 9,
        projectile: ref('21394d8b357d', '/ReplicatedStorage/Fruit_Spawn/Apple'), price: 25, range: 24, damage: 10, rate: 1, color: '#e53935', blurb: 'Throws apples', rarity: 'Common' },
      { id: 'OrangeTree', name: 'Orange Tree', model: ref('b9ad059e0b42', '/SavedGameModules/Workspace/Trees/Orange Tree#9'), height: 10,
        projectile: ref('21394d8b357d', '/ReplicatedStorage/Fruit_Spawn/Peach'), projectileColor: '#fb8c00', price: 70, range: 27, damage: 8, rate: 2.2, color: '#fb8c00', blurb: 'Fast oranges', rarity: 'Rare' },
      { id: 'Melon', name: 'Melon Cannon', model: ref('75a308cbb526', '/ReplicatedStorage/Assets/Plants/Watermelon'), height: 6,
        projectile: ref('21394d8b357d', '/ServerStorage/Collectables/Watermelon'), price: 180, range: 24, damage: 55, rate: 0.6, color: '#43a047', blurb: 'Huge melon hits', rarity: 'Epic' },
    ],
    props: [
      { ref: ref('21394d8b357d', '/Workspace/Farm/Farm/DecorationFence/Farm Fence'), count: 80, where: 'border' },
      { ref: ref('b9ad059e0b42', '/SavedGameModules/Workspace/Trees/Apple Tree#3'), count: 14, where: 'rows', height: 13 },
      { ref: ref('b9ad059e0b42', '/SavedGameModules/Workspace/Trees/Orange Tree#9'), count: 8, where: 'rows', height: 13 },
      { ref: ref('10abe6a307f8', '/Workspace/Bush'), count: 10, where: 'scatter', height: 4 },
      { ref: ref('6f4b7e336a28', '/Workspace/Flower'), count: 10, where: 'scatter', height: 2.5 },
      { ref: ref('5da7109c71d4', '/GameModules/Workspace/Hay'), count: 4, where: 'scatter', height: 4 },
      { ref: ref('aa62032f2430', '/Workspace/RegenScenery/PumpkinPatch/Scarecrow'), count: 2, where: 'scatter', height: 8 },
      { ref: ref('b9ad059e0b42', '/SavedGameModules/ReplicatedStorage/Buildings/Well'), count: 2, where: 'scatter', height: 8 },
    ],
    base: ref('6f4b7e336a28', '/Workspace/Barn#2'),
    waves: {
      first: 15, between: 8, baseHealth: 20,
      list: [
        [{ enemy: 'Tomato', count: 6, every: 1.4 }],
        [{ enemy: 'Tomato', count: 8, every: 1 }, { enemy: 'Carrot', count: 3, every: 2.5 }],
        [{ enemy: 'Carrot', count: 8, every: 1.2 }, { enemy: 'Eggplant', count: 2, every: 4 }],
        [{ enemy: 'Tomato', count: 12, every: 0.7 }, { enemy: 'Eggplant', count: 5, every: 2.5 }],
        [{ enemy: 'Pumpkin King', count: 1, every: 1 }, { enemy: 'Carrot', count: 8, every: 1 }, { enemy: 'Tomato', count: 8, every: 1 }],
      ],
    },
    seed,
  };
}
