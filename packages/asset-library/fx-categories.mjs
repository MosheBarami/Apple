// The sound and effect categories (D-FXLIB-1), and the one rule that assigns them.
//
// A category is DERIVED from what an item is called (its name, its folder or page tags, the search
// word that found it), never typed per item. The rules are ordered: the first rule whose words
// appear wins, so "coin pickup" is a coin and "sword swing" is a sword, not a whoosh.

/** [category, words]. A multi-word entry matches as a phrase over the item's tokens. */
export const SFX_RULES = [
  ['rebirth', ['rebirth', 'prestige', 'reincarnate', 'reincarnation', 'ascend', 'ascension']],
  ['level_up', ['level up', 'levelup', 'lvl up', 'rank up', 'rankup', 'upgrade', 'level complete']],
  ['purchase', ['purchase', 'buy', 'bought', 'shop', 'cash register', 'register', 'cha ching', 'kaching', 'ka ching', 'checkout', 'sale', 'sell', 'robux']],
  ['coin', ['coin', 'coins', 'cash', 'money', 'gold', 'gem', 'gems', 'diamond', 'diamonds', 'jewel', 'crystal pickup']],
  ['reward', ['reward', 'loot', 'chest', 'prize', 'bonus', 'unlock', 'unlocked', 'achievement', 'trophy', 'gift']],
  ['power_up', ['power up', 'powerup', 'buff', 'boost', 'upgrade', 'charge up']],
  ['pet_hatch', ['egg hatch', 'egg crack', 'egg open', 'hatching', 'gacha', 'spin wheel', 'lootbox', 'loot box', 'capsule']],
  ['horror_sting', ['jumpscare', 'jump scare', 'horror', 'scary', 'creepy', 'scream', 'ghost', 'haunted', 'spooky', 'sting', 'stinger', 'suspense', 'tension', 'heartbeat', 'zombie', 'monster', 'growl', 'demon', 'evil laugh']],
  ['explosion', ['explosion', 'explode', 'exploding', 'blast', 'boom', 'bomb', 'grenade', 'detonate', 'detonation', 'rocket', 'missile', 'firework', 'fireworks', 'nuke', 'kaboom']],
  ['gun', ['gun', 'gunshot', 'gunfire', 'shot', 'shots', 'pistol', 'rifle', 'shotgun', 'sniper', 'reload', 'reloading', 'bullet', 'bullets', 'ricochet', 'firearm', 'revolver', 'smg', 'ak47', 'ak', 'm4', 'uzi', 'minigun', 'shell', 'casing', 'magazine', 'cock']],
  ['laser', ['laser', 'blaster', 'phaser', 'plasma', 'zap', 'ray gun', 'raygun', 'pew']],
  ['sword', ['sword', 'blade', 'slash', 'stab', 'knife', 'katana', 'axe', 'dagger', 'parry', 'clang', 'unsheath', 'sheath', 'saber', 'spear', 'scythe']],
  ['hit', ['hit', 'hits', 'impact', 'punch', 'kick', 'slap', 'smack', 'thud', 'thump', 'hurt', 'damage', 'oof', 'ouch', 'pain', 'bonk', 'bash', 'crit', 'critical', 'block', 'body fall', 'knockout', 'ko']],
  ['heal', ['heal', 'healing', 'health', 'potion', 'regen', 'regenerate', 'restore', 'holy', 'revive', 'cure']],
  ['magic', ['magic', 'magical', 'spell', 'cast', 'casting', 'enchant', 'enchanted', 'sparkle', 'sparkles', 'shimmer', 'twinkle', 'mystic', 'mystical', 'arcane', 'wand', 'portal', 'teleport', 'warp', 'fairy', 'charm', 'aura', 'rune', 'mana']],
  ['footsteps', ['footstep', 'footsteps', 'step', 'steps', 'walk', 'walking', 'running', 'run', 'stomp', 'sprint', 'foot']],
  ['jump', ['jump', 'jumping', 'land', 'landing', 'bounce', 'boing', 'spring', 'trampoline', 'hop', 'double jump']],
  ['whoosh', ['whoosh', 'swoosh', 'swish', 'woosh', 'swoop', 'swipe', 'swing', 'dash', 'zoom', 'fly by', 'flyby', 'pass by']],
  ['ui_click', ['click', 'clicks', 'button', 'tap', 'select', 'hover', 'menu', 'ui', 'interface', 'toggle', 'press', 'confirm', 'cancel', 'back', 'tick', 'switch', 'scroll', 'open menu', 'close menu', 'tab']],
  ['notification', ['notification', 'notify', 'alert', 'ding', 'chime', 'ping', 'message', 'pop up', 'popup', 'announcement']],
  ['win', ['win', 'winner', 'victory', 'fanfare', 'success', 'complete', 'completed', 'jingle', 'celebration', 'tada', 'ta da', 'yay', 'correct']],
  ['lose', ['lose', 'lost', 'fail', 'failure', 'game over', 'defeat', 'death', 'died', 'die', 'wrong', 'error', 'buzzer', 'incorrect', 'sad trombone']],
  ['thunder', ['thunder', 'lightning', 'thunderstorm']],
  ['rain', ['rain', 'raining', 'drizzle', 'downpour', 'rainfall']],
  ['wind', ['wind', 'windy', 'breeze', 'gust', 'storm', 'blizzard', 'howling']],
  ['water', ['water', 'splash', 'river', 'stream', 'waterfall', 'ocean', 'sea', 'wave', 'waves', 'bubbles', 'bubble', 'drip', 'dripping', 'underwater', 'swim', 'swimming', 'pour', 'liquid', 'lake']],
  ['fire', ['fire', 'crackle', 'crackling', 'campfire', 'flame', 'flames', 'burn', 'burning', 'lava', 'torch', 'fireplace', 'bonfire', 'ignite']],
  ['nature', ['forest', 'birds', 'bird', 'crickets', 'jungle', 'insects', 'frogs', 'night', 'nature', 'meadow', 'cicada', 'owl', 'leaves']],
  ['vehicle', ['engine', 'car', 'vehicle', 'horn', 'motor', 'motorcycle', 'truck', 'plane', 'airplane', 'jet', 'helicopter', 'train', 'boat', 'drift', 'tire', 'tyre', 'brake', 'race car', 'bus', 'siren car']],
  ['door', ['door', 'creak', 'creaking', 'knock', 'lock', 'unlock', 'lever', 'gate', 'elevator', 'hinge', 'latch', 'drawer', 'cabinet']],
  ['break', ['glass', 'shatter', 'shattering', 'break', 'breaking', 'broken', 'crack', 'cracking', 'crunch', 'smash', 'crash', 'destroy', 'debris', 'rubble']],
  ['pop', ['pop', 'pops', 'balloon', 'squish', 'splat', 'slime', 'blop', 'plop', 'bloop', 'squelch', 'goo', 'suction']],
  ['alarm', ['alarm', 'siren', 'beep', 'beeps', 'bell', 'bells', 'countdown', 'timer', 'clock', 'ticking', 'whistle', 'gong', 'ring', 'ringing', 'doorbell']],
  ['animal', ['dog', 'cat', 'cow', 'chicken', 'horse', 'pig', 'duck', 'frog', 'wolf', 'lion', 'bark', 'barking', 'meow', 'moo', 'roar', 'oink', 'quack', 'neigh', 'bear', 'monkey', 'snake', 'hiss', 'dinosaur', 'dragon', 'sheep', 'goat', 'bee', 'buzz']],
  ['crowd', ['cheer', 'cheering', 'applause', 'crowd', 'laugh', 'laughing', 'laughter', 'gasp', 'clap', 'clapping', 'wow', 'audience', 'people']],
  ['voice', ['voice', 'talk', 'talking', 'speech', 'dialogue', 'hello', 'voiceover', 'announcer', 'says', 'grunt', 'yell', 'shout', 'whisper', 'breath', 'breathing']],
  ['eat', ['eat', 'eating', 'drink', 'drinking', 'gulp', 'burp', 'sip', 'chew', 'munch', 'bite', 'slurp', 'swallow']],
  ['sci_fi', ['robot', 'sci fi', 'scifi', 'computer', 'glitch', 'electric', 'electricity', 'spark', 'sparks', 'energy', 'beam', 'hologram', 'futuristic', 'cyber', 'digital', 'hum', 'power down', 'power on', 'shutdown', 'startup', 'alien', 'ufo', 'space ship', 'spaceship']],
  ['typing', ['typing', 'keyboard', 'typewriter', 'text', 'type', 'keys', 'mouse']],
  ['tools', ['dig', 'digging', 'mining', 'mine', 'pickaxe', 'chop', 'chopping', 'hammer', 'build', 'building', 'construction', 'craft', 'crafting', 'anvil', 'forge', 'saw', 'drill', 'wrench', 'shovel', 'tool', 'tools']],
  ['throw', ['throw', 'toss', 'catch', 'throwing', 'drop', 'pickup', 'pick up', 'grab', 'collect', 'item', 'equip', 'inventory', 'cloth', 'zipper']],
  ['ambient', ['ambient', 'ambience', 'ambiance', 'atmosphere', 'atmospheric', 'room tone', 'roomtone', 'drone', 'background', 'city', 'cave', 'office', 'space ambience', 'interior', 'exterior', 'traffic']],
];

/** Music categories: a loop is a loop whatever its genre; the rest keep their mood. */
export const MUSIC_RULES = [
  ['music_loop', ['loop', 'looped', 'looping', 'seamless']],
];

export const SFX_CATEGORIES = [...SFX_RULES.map(([c]) => c), 'music_loop', 'music', 'misc'];

/** "Coin_Pickup-02" -> coin, pickup, 02; "LevelUp" -> level, up. */
export function tokensOf(s) {
  return String(s ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasPhrase(tokens, phrase) {
  const words = phrase.split(' ');
  if (words.length === 1) return tokens.includes(words[0]);
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (words.every((w, j) => tokens[i + j] === w)) return true;
  }
  // "levelup" style joins are matched by the single-word spellings listed beside the phrase.
  return false;
}

function firstRule(rules, tokens) {
  for (const [cat, words] of rules) if (words.some((w) => hasPhrase(tokens, w))) return cat;
  return null;
}

/**
 * The category of one sound. `music` is true for an item the source itself calls music (Roblox's
 * audioType, an OpenGameArt "Music" entry): music never becomes a gun because a track is called
 * "Shot in the Dark".
 */
export function sfxCategory({ name, tags = [], query = '', music = false }) {
  const own = tokensOf([name, ...tags].join(' '));
  if (music) return firstRule(MUSIC_RULES, own) ?? 'music';
  // The search word that found an item is only trusted for a name too short to describe itself
  // ("Retro Blip 3"): Roblox's search matched "coin" to "Chains On Aluminum Ladder" by its tags.
  const words = own.filter((t) => !/^\d+$/.test(t) && t !== 'sfx');
  return firstRule(SFX_RULES, own) ?? (words.length <= 2 ? firstRule(SFX_RULES, tokensOf(query)) : null) ?? 'misc';
}

/** VFX categories: what an effect is FOR in a Roblox game. */
export const VFX_RULES = [
  ['coin_burst', ['coin', 'coins', 'money', 'cash', 'gold']],
  ['level_up', ['level up', 'levelup', 'level', 'rank up']],
  ['rebirth', ['rebirth', 'prestige', 'pillar', 'ascend']],
  ['pet_hatch', ['hatch', 'egg', 'pet']],
  ['confetti', ['confetti', 'celebration', 'party']],
  ['explosion', ['explosion', 'explode', 'blast', 'boom', 'shockwave', 'nuke']],
  ['lightning', ['lightning', 'electric', 'thunder', 'zap', 'bolt']],
  ['fire', ['fire', 'flame', 'flames', 'burn', 'torch', 'ember', 'embers', 'lava']],
  ['smoke', ['smoke', 'fog', 'mist', 'steam', 'cloud', 'clouds', 'puff']],
  ['heal', ['heal', 'healing', 'health', 'regen', 'holy']],
  ['portal', ['portal', 'vortex', 'teleport', 'warp', 'swirl']],
  ['magic', ['magic', 'spell', 'arcane', 'mana', 'rune', 'hit', 'impact', 'slash']],
  ['sparkle', ['sparkle', 'sparkles', 'shimmer', 'twinkle', 'star', 'stars', 'glitter', 'shine', 'glow', 'flare']],
  ['aura', ['aura', 'energy', 'power']],
  ['water', ['water', 'splash', 'bubble', 'bubbles', 'drip', 'wave']],
  ['snow', ['snow', 'snowflake', 'blizzard', 'frost', 'ice']],
  ['rain', ['rain', 'raindrop', 'drizzle']],
  ['fireflies', ['firefly', 'fireflies', 'bugs']],
  ['trail', ['trail', 'trails', 'speed', 'dash', 'streak']],
  ['beam', ['beam', 'beams', 'laser', 'ray']],
  ['dust', ['dust', 'dirt', 'sand', 'debris']],
  ['highlight', ['highlight', 'outline', 'selection']],
];

export function vfxCategory({ name, tags = [], query = '' }) {
  return firstRule(VFX_RULES, tokensOf([name, ...tags].join(' '))) ?? firstRule(VFX_RULES, tokensOf(query)) ?? 'misc';
}
