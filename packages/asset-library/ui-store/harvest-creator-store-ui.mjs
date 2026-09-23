#!/usr/bin/env node
// Harvest free Roblox Creator Store DECALS as UI images for the UI store (D-UISTORE-1).
//
// Keyless, like models/harvest-creator-store.mjs, but through toolbox-service v2 search with
// searchCategoryType=Decal. Images (asset type 1) are not a searchable category (v1 marketplace/1
// and v2 searchCategoryType=Image both answer 400): the Creator Store lists the Decal that wraps an
// image, and a Decal id set on ImageLabel.Image shows nothing. The Image id ImageLabel.Image needs
// is `asset.textureId` in the search payload itself (measured 2026-09-24: textureId 15589362394 of
// decal 15589362420 is AssetTypeId 1 on economy.roblox.com, same creator, same name, created 190 ms
// before the decal). Older decals carry no textureId, and the keyless ways to resolve them fail:
// assetdelivery's Decal XML answers 401 without a session, and "decal id - 1" was an Image of the
// same creator for only 17 of 43 sampled. Those decals are dropped rather than guessed.
//
// Every kept image id is then checked against thumbnails.roblox.com: a moderated image answers
// "Blocked" and is dropped, because it would render as nothing.
//
// Output: ../sources/ui-creator-store.jsonl.gz, one row per distinct usable image id.
// Search pages and thumbnail states are cached under the OS temp dir, so a killed run resumes.
//
//   node packages/asset-library/ui-store/harvest-creator-store-ui.mjs [--pages 10] [--fresh] [--cached-only | --searched-only]
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'sources', 'ui-creator-store.jsonl.gz');
const SEARCH = 'https://apis.roblox.com/toolbox-service/v2/assets:search';
const THUMBS = 'https://thumbnails.roblox.com/v1/assets';
const arg = (name, dflt) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : dflt);
const PAGES = Number(arg('--pages', 10)) || 10;
// --cached-only writes the output from what the cache already holds, touching no network.
const CACHED_ONLY = process.argv.includes('--cached-only');
// --searched-only runs no new searches but still checks moderation for the cached decals' images.
const SEARCHED_ONLY = process.argv.includes('--searched-only');
const CACHE = join(tmpdir(), 'apple-ui-store-harvest');
if (process.argv.includes('--fresh')) rmSync(CACHE, { recursive: true, force: true });
mkdirSync(CACHE, { recursive: true });

// ---- queries: [genre, kind, keyword] ---------------------------------------------------------
const Q = [];
const seenKw = new Set();
const add = (genre, kind, words) => {
  for (const w of words) {
    const k = w.toLowerCase().trim();
    if (k && !seenKw.has(k)) { seenKw.add(k); Q.push([genre, kind, k]); }
  }
};
const GENERAL = 'General';
// Subjects that are icons in every kind of game. Each is searched bare: search is lexical, so
// "coin icon" returns a subset of "coin" (measured: 591 of the same ids), and a new SUBJECT is what adds rows.
const ICONS = {
  'Simulator/Tycoon': ['coin', 'coins', 'gem', 'gems', 'diamond', 'diamonds', 'cash', 'money', 'money bag', 'dollar', 'gold', 'gold bar', 'crystal', 'ruby', 'emerald', 'token', 'ticket', 'pet', 'pets', 'egg', 'pet egg', 'shop', 'store', 'rebirth', 'prestige', 'upgrade', 'boost', 'x2', '2x', 'x3', 'double coins', 'luck', 'lucky', 'multiplier', 'trophy', 'star', 'gift', 'present', 'chest', 'treasure', 'crate', 'spin wheel', 'wheel', 'daily reward', 'reward', 'codes', 'inventory', 'backpack', 'trade', 'trading', 'index', 'quest', 'leaderboard', 'clicker', 'tap', 'click', 'power', 'strength', 'muscle', 'speed', 'auto', 'autoclick', 'vip', 'gamepass', 'game pass', 'robux', 'premium', 'level', 'xp', 'exp', 'energy', 'lightning', 'potion', 'magnet', 'rocket', 'teleport', 'portal', 'world', 'zone', 'map', 'unlock', 'locked', 'hatch', 'craft', 'tool', 'pickaxe', 'shovel', 'mining', 'ore', 'farm', 'seed', 'plant', 'fruit', 'apple', 'candy', 'cookie', 'cake', 'ice cream', 'pizza icon', 'factory', 'dropper', 'tycoon', 'simulator', 'cash register', 'bank', 'wallet', 'piggy bank', 'sale', 'discount', 'limited', 'new', 'hot', 'best value', 'popular', 'bundle', 'pack', 'offer', 'starter pack'],
  Obby: ['checkpoint', 'skip stage', 'skip', 'stage', 'flag', 'finish', 'finish line', 'jump', 'double jump', 'timer', 'clock', 'stopwatch', 'hourglass', 'lava', 'rainbow', 'tower', 'obby', 'parkour', 'speed coil', 'gravity coil', 'coil', 'spring', 'wings', 'fly', 'feather', 'shoes', 'boots', 'kill brick', 'spikes', 'danger', 'warning', 'caution', 'stop sign', 'difficulty', 'easy', 'medium', 'hard', 'insane', 'impossible', 'win', 'wins', 'victory', 'lose', 'game over', 'retry', 'restart', 'respawn', 'reset'],
  'Horror/Adventure': ['skull', 'ghost', 'eye', 'eyes', 'blood', 'blood splatter', 'flashlight', 'battery', 'key', 'lock', 'padlock', 'door', 'candle', 'pumpkin', 'bat', 'spider', 'spider web', 'zombie', 'monster', 'jumpscare', 'crack', 'cracked screen', 'static', 'noise', 'fog', 'compass', 'note', 'paper', 'journal', 'book', 'scroll', 'parchment', 'old paper', 'map icon', 'torch', 'fire', 'flame', 'moon', 'night', 'cross', 'coffin', 'grave', 'hand print', 'footprint', 'scratch', 'claw', 'vignette', 'darkness', 'shadow', 'creepy', 'scary', 'horror', 'spooky', 'halloween', 'witch', 'potion bottle', 'crystal ball', 'rune', 'magic', 'spell', 'wand', 'amulet', 'ring', 'scroll icon', 'adventure', 'quest marker', 'exclamation mark', 'treasure map', 'lantern', 'camera', 'night vision', 'sanity', 'fear', 'heartbeat'],
  'Shooter/Fighting': ['sword', 'swords', 'gun', 'guns', 'pistol', 'rifle', 'shotgun', 'sniper', 'bullet', 'bullets', 'ammo', 'magazine', 'crosshair', 'reticle', 'scope', 'hitmarker', 'grenade', 'knife', 'dagger', 'shield', 'health', 'heart', 'hearts', 'armor', 'helmet', 'kill', 'kills', 'kill feed', 'death', 'target', 'bomb', 'explosion', 'fist', 'punch', 'katana', 'bow', 'arrow', 'axe', 'hammer', 'spear', 'staff', 'fireball', 'ability', 'skill', 'skill icon', 'ability icon', 'cooldown', 'combo', 'ultimate', 'damage', 'critical', 'crit', 'medkit', 'first aid', 'bandage', 'reload', 'weapon', 'weapons', 'loadout', 'rank', 'ranks', 'rank icon', 'military', 'army', 'camo', 'dog tag', 'radar', 'minimap', 'kill icon', 'headshot', 'team', 'red team', 'blue team', 'battle', 'versus', 'vs', 'fight', 'boxing', 'karate', 'ninja', 'samurai', 'anime', 'aura', 'energy blast', 'lightsaber'],
  'City/Roleplay': ['house', 'home', 'car', 'phone', 'smartphone', 'job', 'jobs', 'police', 'police badge', 'sheriff', 'id card', 'card', 'credit card', 'food', 'pizza', 'burger', 'drink', 'coffee', 'soda', 'gps', 'bed', 'sleep', 'hunger', 'thirst', 'clothing', 'shirt', 'pants', 'hair', 'hat', 'emote', 'emotes', 'chat', 'message', 'mail', 'envelope', 'music', 'radio', 'tv', 'hospital', 'doctor', 'nurse', 'fire truck', 'school', 'teacher', 'baby', 'family', 'pet shop', 'dog', 'cat', 'horse', 'bike', 'bus', 'taxi', 'plane', 'airport', 'passport', 'hotel', 'restaurant', 'cafe', 'bakery', 'grocery', 'cart', 'shopping cart', 'shopping bag', 'bag', 'furniture', 'paint', 'brush', 'build', 'building', 'hammer icon', 'wrench', 'garage', 'fuel', 'gas', 'speedometer', 'steering wheel', 'license plate', 'traffic', 'road sign', 'street sign', 'sign', 'poster', 'billboard', 'menu board', 'price tag', 'receipt', 'calendar', 'weather', 'sun', 'cloud', 'rain', 'snow', 'thermometer'],
  [GENERAL]: ['close', 'close button', 'x button', 'x icon', 'exit', 'exit button', 'settings', 'gear', 'cog', 'menu', 'hamburger menu', 'play', 'play button', 'pause', 'stop', 'back', 'back button', 'home button', 'info', 'information', 'question mark', 'help', 'check mark', 'checkmark', 'tick', 'plus', 'minus', 'add', 'remove', 'delete', 'trash', 'edit', 'pencil', 'arrow', 'arrows', 'left arrow', 'right arrow', 'up arrow', 'down arrow', 'next', 'previous', 'refresh', 'search', 'magnifying glass', 'sound', 'volume', 'mute', 'speaker', 'music note', 'notification', 'bell', 'alert', 'friends', 'friend', 'invite', 'profile', 'avatar', 'user', 'player', 'players', 'crown', 'medal', 'badge', 'badges', 'ribbon', 'banner', 'award', 'achievement', 'like', 'thumbs up', 'dislike', 'favorite', 'bookmark', 'share', 'link', 'download', 'upload', 'save', 'load', 'folder', 'file', 'list', 'grid', 'filter', 'sort', 'zoom', 'fullscreen', 'expand', 'collapse', 'toggle', 'switch', 'on off', 'checkbox', 'radio button', 'slider', 'knob', 'dropdown', 'tab', 'tabs', 'loading', 'loading spinner', 'spinner', 'loading screen', 'logo', 'game logo', 'title', 'thumbnail', 'icon', 'icons', 'icon pack', 'ui', 'gui', 'ui pack', 'gui pack', 'hud', 'button', 'buttons', 'round button', 'square button', 'rounded button', 'green button', 'red button', 'blue button', 'yellow button', 'orange button', 'purple button', 'pink button', 'white button', 'black button', 'gold button', 'frame', 'frames', 'panel', 'window', 'popup', 'dialog', 'menu frame', 'shop frame', 'inventory frame', 'border', 'borders', 'outline', 'stroke', 'background', 'backgrounds', 'gradient', 'pattern', 'texture', 'wallpaper', 'sky background', 'space background', 'galaxy', 'stars background', 'clouds background', 'blur', 'glow', 'shine', 'sparkle', 'sparkles', 'light rays', 'sunburst', 'rays', 'circle', 'square', 'triangle', 'hexagon', 'rounded rectangle', 'rounded square', 'rounded corner', 'corner', '9 slice', 'nine slice', 'slice', 'progress bar', 'health bar', 'hp bar', 'stamina bar', 'energy bar', 'xp bar', 'mana bar', 'loading bar', 'bar', 'hotbar', 'slot', 'inventory slot', 'item slot', 'tooltip', 'speech bubble', 'chat bubble', 'text box', 'textbox', 'header', 'divider', 'separator', 'line', 'dot', 'dots', 'ring icon', 'cursor', 'mouse cursor', 'pointer', 'hand cursor', 'crosshair icon', 'mobile button', 'mobile controls', 'joystick', 'dpad', 'keyboard', 'key icon', 'controller', 'xbox button', 'playstation button', 'touch', 'tap icon', 'swipe', 'emoji', 'emojis', 'smile', 'smiley', 'happy face', 'sad face', 'angry face', 'laughing emoji', 'crying emoji', 'heart eyes', 'cool emoji', 'fire emoji', 'skull emoji', '100 emoji', 'thinking emoji', 'clown', 'face', 'faces', 'meme', 'numbers', 'number', 'letters', 'letter', 'alphabet', 'font', 'text', 'pixel font', 'digits', 'countdown', '1', '2', '3', 'go', 'ready', 'level up', 'new record', 'congratulations', 'welcome', 'coming soon', 'sold out', 'free', 'buy', 'buy button', 'purchase', 'confirm', 'cancel', 'yes', 'no', 'ok', 'accept', 'decline', 'claim', 'claim button', 'open', 'equip', 'unequip', 'sell', 'inventory icon', 'store icon', 'shop icon', 'settings icon', 'gamepass icon', 'vip icon', 'robux icon', 'currency', 'currency icon', 'stat', 'stats', 'leaderstats', 'scoreboard', 'podium', 'first place', 'second place', 'third place', '1st', 'number one', 'fps counter', 'ping', 'wifi', 'signal', 'battery icon', 'lock icon', 'unlock icon', 'shield icon', 'globe', 'language', 'flag icon', 'discord', 'twitter', 'youtube', 'group', 'community', 'update', 'update log', 'news', 'changelog', 'credits', 'tutorial', 'hint', 'lightbulb', 'idea'],
};
const KIND_OF_SUBJECT = (w) => {
  if (/\b(button|buttons|close|exit|play|pause|claim|buy|confirm|cancel|accept|decline|equip|toggle|switch|checkbox|slider|knob|dropdown|tab)\b/.test(w)) return 'button';
  if (/\b(frame|frames|panel|window|popup|dialog|tooltip|bubble|text ?box|header)\b/.test(w)) return 'frame';
  if (/\bbar\b|hotbar|slot/.test(w)) return 'bar';
  if (/background|wallpaper|gradient|pattern|texture|galaxy|sky|space|blur|vignette|sunburst|rays|glow|shine|sparkle/.test(w)) return 'background';
  if (/border|outline|stroke|corner|slice|divider|separator|line|rounded/.test(w)) return 'border';
  if (/emoji|smile|smiley|face|meme|clown/.test(w)) return 'emoji';
  if (/font|letter|alphabet|number|digit|text|countdown|^[0-9]+$|title|logo/.test(w)) return 'text';
  if (/cursor|pointer|crosshair|reticle|hitmarker|scope/.test(w)) return 'cursor';
  if (/badge|medal|ribbon|award|achievement|rank|trophy|crown/.test(w)) return 'badge';
  return 'icon';
};
for (const [genre, words] of Object.entries(ICONS)) {
  for (const w of words) {
    const kind = KIND_OF_SUBJECT(w);
    add(genre, kind, [w]);
  }
}
// Style passes: the same subjects seen through a look.
const STYLES = ['cartoon', 'flat', 'neon', 'pixel', 'pixel art', 'glossy', 'low poly', 'minimalist', 'modern', 'simple', 'cute', 'anime', 'realistic', '3d', 'retro', 'sci fi', 'futuristic', 'fantasy', 'medieval', 'wooden', 'metal', 'stone', 'gold', 'golden', 'rainbow', 'pastel', 'dark', 'white', 'black', 'transparent', 'outline', 'gradient', 'shiny', 'bubbly', 'kawaii', 'doodle', 'hand drawn', 'sketch', 'grunge', 'vaporwave'];
const STYLE_SUBJECTS = ['button', 'icon', 'frame', 'background', 'coin', 'gem', 'heart', 'star', 'shop', 'settings', 'close button', 'arrow', 'border', 'panel', 'logo', 'badge', 'crown', 'skull', 'sword', 'trophy', 'ui', 'gui', 'emoji', 'font', 'health bar', 'crosshair', 'cursor'];
for (const s of STYLES) for (const w of STYLE_SUBJECTS) add(GENERAL, KIND_OF_SUBJECT(w), [`${s} ${w}`]);
// Genre passes: "<genre> <ui thing>".
const GENRE_WORDS = { 'Simulator/Tycoon': ['simulator', 'tycoon', 'clicker', 'pet simulator'], Obby: ['obby', 'parkour', 'tower'], 'Horror/Adventure': ['horror', 'adventure', 'rpg', 'fantasy', 'survival'], 'Shooter/Fighting': ['fps', 'shooter', 'fighting', 'battle', 'combat', 'pvp', 'war'], 'City/Roleplay': ['roleplay', 'rp', 'city', 'life', 'cafe', 'school'] };
for (const [genre, gws] of Object.entries(GENRE_WORDS)) for (const g of gws) for (const w of ['ui', 'gui', 'button', 'icon', 'icons', 'frame', 'background', 'logo', 'hud', 'menu', 'shop', 'badge']) add(genre, KIND_OF_SUBJECT(w), [`${g} ${w}`]);
// Colour passes for the shapes a UI is built out of.
for (const c of ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'white', 'black', 'grey', 'cyan', 'brown', 'gold', 'silver']) {
  for (const w of ['circle', 'square', 'frame', 'icon', 'heart', 'star', 'arrow', 'glow', 'gradient', 'background', 'border', 'bar']) add(GENERAL, KIND_OF_SUBJECT(w), [`${c} ${w}`]);
}

// Round-robin across the lists above, so a run stopped early still covers every genre and style.
{
  const groups = new Map();
  for (const q of Q) { const g = `${q[0]}|${q[2].split(' ').length}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(q); }
  const lists = [...groups.values()];
  Q.length = 0;
  for (let k = 0; lists.some((l) => k < l.length); k++) for (const l of lists) if (k < l.length) Q.push(l[k]);
}

// ---- http ------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// One adaptive pace per endpoint. Search answers a bare 429 far below its advertised 10,000/min once a
// few hundred requests have gone by, so a 429 pauses every worker on that endpoint and widens the gap;
// a run of successes narrows it again.
const pace = new Map(); // endpoint -> { gap, until, streak }
async function getJson(url, tries = 8) {
  const host = url.split('?')[0];
  const p = pace.get(host) ?? pace.set(host, { gap: 140, until: 0, streak: 0 }).get(host);
  for (let i = 0; i < tries; i++) {
    while (Date.now() < p.until) await sleep(p.until - Date.now());
    p.until = Math.max(p.until, Date.now()) + p.gap;
    const res = await fetch(url, { headers: { accept: 'application/json' } }).catch(() => null);
    if (res?.ok) {
      if (++p.streak >= 40 && p.gap > 140) { p.gap = Math.max(140, Math.round(p.gap * 0.85)); p.streak = 0; }
      return res.json().catch(() => null);
    }
    if (res && res.status >= 400 && res.status < 500 && res.status !== 429) return null;
    p.streak = 0;
    if (res?.status === 429) {
      // Measured: the throttle clears within seconds, so a short pause and a wider gap recover.
      p.gap = Math.min(3000, Math.round(p.gap * 1.3));
      p.until = Date.now() + 5000 * (i + 1);
      if (i === 0) console.error(`429 from ${host}: pausing, gap now ${p.gap} ms`);
    } else await sleep(1500 * (i + 1));
  }
  return null;
}
async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) await fn(items[next++]); }));
}

// ---- 1. search (cached per keyword) ----------------------------------------------------------
// v2 search answers with the details inline (textureId, creator, votes, price), so there is no
// separate details pass: v1 marketplace/13 plus items/details (100 requests a minute) was ~40 times
// slower for the same rows, and v1 search throttled to a bare 429 after a few hundred pages.
const SEARCH_CACHE = join(CACHE, 'search-v2.jsonl'); // {kw, recs:[compact record]}
const done = new Map();
if (existsSync(SEARCH_CACHE)) for (const l of readFileSync(SEARCH_CACHE, 'utf8').split('\n')) if (l) { const r = JSON.parse(l); done.set(r.kw, r.recs); }
const ids = new Map(); // id -> { genres:Set, kinds:Map(kind->n), found:Set }
const det = new Map(); // id -> compact record
const note = (rec, genre, kind, kw) => {
  const e = ids.get(rec.i) ?? { genres: new Set(), kinds: new Map(), found: new Set() };
  e.genres.add(genre); e.kinds.set(kind, (e.kinds.get(kind) ?? 0) + 1); if (e.found.size < 8) e.found.add(kw);
  ids.set(rec.i, e);
  det.set(rec.i, rec);
};
const compact = (x) => {
  const a = x.asset ?? {};
  const c = x.creator ?? {};
  const v = x.voting ?? {};
  const price = x.creatorStoreProduct?.purchasePrice?.quantity;
  return {
    i: a.id, t: a.assetTypeId, tex: a.textureId ?? null, n: String(a.name ?? '').trim(),
    free: !!price && price.significand === 0,
    buy: x.creatorStoreProduct?.purchasable === true,
    c: c.name ?? null, ci: c.userId ?? c.groupId ?? null, ct: c.userId ? 'User' : c.groupId ? 'Group' : null, cv: c.verified === true,
    up: v.upVotes ?? 0, dn: v.downVotes ?? 0, at: a.createTime ?? null,
  };
};
let jn = 0;
// Deep pages take ~600 ms; five workers at >=140 ms apart held 6.6 requests a second without a 429.
await pool(Q, 5, async ([genre, kind, kw]) => {
  let recs = done.get(kw);
  if (!recs && (CACHED_ONLY || SEARCHED_ONLY)) return;
  if (!recs) {
    recs = [];
    let token = '';
    let failed = false;
    for (let p = 0; p < PAGES; p++) {
      const url = `${SEARCH}?searchCategoryType=Decal&query=${encodeURIComponent(kw)}&maxPageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
      const d = await getJson(url);
      if (!d?.creatorStoreAssets) { failed = true; break; }
      let fresh = 0;
      for (const x of d.creatorStoreAssets) if (x.asset?.id) { recs.push(compact(x)); if (!det.has(x.asset.id)) fresh++; }
      token = d.nextPageToken;
      // A page with nothing the harvest has not already seen means this keyword has run dry.
      if (!token || d.creatorStoreAssets.length === 0 || (p > 0 && fresh === 0)) break;
    }
    // A keyword that failed part-way is used for this run but not cached, so a re-run finishes it.
    if (!failed) appendFileSync(SEARCH_CACHE, JSON.stringify({ kw, recs }) + '\n');
  }
  for (const rec of recs) note(rec, genre, kind, kw);
  if (++jn % 50 === 0) console.error(`search ${jn}/${Q.length}, distinct decals ${ids.size}`);
});
console.error(`search done: ${Q.length} keywords, ${ids.size} distinct decals`);

// ---- 3. filter + thumbnail check -------------------------------------------------------------
const refused = { notDecal: 0, notFree: 0, notPurchasable: 0, noTexture: 0, blocked: 0, dupImage: 0 };
const cand = [];
for (const id of ids.keys()) {
  const r = det.get(id);
  if (r.t !== 13) { refused.notDecal++; continue; }
  if (!r.free) { refused.notFree++; continue; }
  if (!r.buy) { refused.notPurchasable++; continue; }
  if (!r.tex) { refused.noTexture++; continue; }
  cand.push(r);
}
const THUMB_CACHE = join(CACHE, 'thumbs.jsonl'); // {i: imageId, s: state}
const thumb = new Map();
if (existsSync(THUMB_CACHE)) for (const l of readFileSync(THUMB_CACHE, 'utf8').split('\n')) if (l) { const r = JSON.parse(l); thumb.set(r.i, r.s); }
// Pending (never rendered) and Error settle nothing: ask again; the request itself queues the render.
const settled = (x) => thumb.get(x) === 'Completed' || thumb.get(x) === 'Blocked';
const needThumb = CACHED_ONLY ? [] : [...new Set(cand.map((r) => r.tex))].filter((x) => !settled(x));
const tb = [];
for (let i = 0; i < needThumb.length; i += 100) tb.push(needThumb.slice(i, i + 100));
let tn = 0;
await pool(tb, 2, async (batch) => {
  const d = await getJson(`${THUMBS}?assetIds=${batch.join(',')}&size=150x150&format=Png`);
  const lines = [];
  for (const x of d?.data ?? []) { thumb.set(x.targetId, x.state); lines.push(JSON.stringify({ i: x.targetId, s: x.state })); }
  if (lines.length) appendFileSync(THUMB_CACHE, lines.join('\n') + '\n');
  if (++tn % 100 === 0) console.error(`thumbs ${tn}/${tb.length}`);
});

const KIND_WORDS = [
  ['button', /\b(button|btn|buttons)\b/i],
  ['bar', /\b(bar|healthbar|hpbar|progress|hotbar)\b/i],
  ['frame', /\b(frame|panel|window|popup|dialog|menu|tooltip|bubble)\b/i],
  ['background', /\b(background|bg|wallpaper|gradient|vignette|sky|galaxy|pattern|texture)\b/i],
  ['border', /\b(border|outline|stroke|corner|slice|divider)\b/i],
  ['emoji', /\b(emoji|emote|smiley|face)\b/i],
  ['cursor', /\b(cursor|crosshair|reticle|hitmarker|pointer)\b/i],
  ['badge', /\b(badge|medal|rank|ribbon|award|trophy)\b/i],
  ['text', /\b(font|letter|alphabet|number|digit|logo|title|text)\b/i],
  ['icon', /\b(icon|icons|symbol)\b/i],
];
function kindOf(name, kinds) {
  for (const [k, re] of KIND_WORDS) if (re.test(name)) return k;
  return [...kinds.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const byImage = new Map();
for (const r of cand) {
  const s = thumb.get(r.tex);
  if (s === 'Blocked') { refused.blocked++; continue; }
  const e = ids.get(r.i);
  const row = {
    id: `ui-${r.i}`,
    decalId: r.i,
    imageId: r.tex,
    name: r.n,
    creator: r.c,
    creatorId: r.ci,
    creatorType: r.ct,
    verifiedCreator: r.cv,
    upVotes: r.up,
    downVotes: r.dn,
    genres: [...e.genres],
    kind: kindOf(r.n, e.kinds),
    keywords: [...e.found],
    thumb: s ?? null,
    created: r.at,
    licence: 'Roblox-free',
  };
  // One image can sit behind several decals (re-uploads). Keep the best-voted, verified first.
  const prev = byImage.get(r.tex);
  if (prev) {
    refused.dupImage++;
    const better = (row.verifiedCreator - prev.verifiedCreator) || (row.upVotes - prev.upVotes) || (prev.decalId - row.decalId);
    if (better <= 0) { prev.keywords = [...new Set([...prev.keywords, ...row.keywords])].slice(0, 8); continue; }
    row.keywords = [...new Set([...row.keywords, ...prev.keywords])].slice(0, 8);
  }
  byImage.set(r.tex, row);
}
const rows = [...byImage.values()].sort((a, b) => a.decalId - b.decalId);
writeFileSync(OUT, gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
console.log(JSON.stringify({ keywords: Q.length, pages: PAGES, decals: ids.size, kept: rows.length, refused, out: OUT }));
