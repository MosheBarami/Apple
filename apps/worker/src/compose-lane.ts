/**
 * LANE DEFENSE (compose.ts): enemies walk a winding road to a base, the player buys defenders and places them on plots
 * beside the road, and waves keep coming. The composer lays out a new studded map and installs the components; WHAT the game
 * is made of is the AGENT's, argument by argument (the `laneDefense` spec): its title and words, its enemies (a rigged
 * body wearing a costume, or a whole library model), its defenders, the base they protect, the props of the map and the
 * waves. Every piece is a library piece the agent found and chose (`{ gameId, path }`).
 *
 * The harness holds no such game of its own. It used to hold one, with the library references of a single earlier benchmark's
 * subject baked in (its enemies, its defenders, its farm props), and an idea that matched a regex got that game whatever the
 * words were. Now a request this template cannot express is simply built another way, and one it can is built from the
 * agent's own pieces. A field that is missing is reported by name.
 */
import type { EnemySpec, DefenderSpec, PropSpec, Recipe, LibRef } from './compose';
import { cleanText } from './compose-tycoon';

const LIB = /^[0-9a-f]{8,64}$/;
const ref = (v: unknown): LibRef | undefined => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return typeof o.gameId === 'string' && LIB.test(o.gameId) && typeof o.path === 'string' && o.path.startsWith('/') ? { game: o.gameId, path: o.path } : undefined;
};

/** Words the game's screens use, in English, for any the agent did not give. */
export const DEFAULT_WORDS: Record<string, string> = {
  wave: 'Wave', nextWave: 'Next wave in', left: 'left', base: 'Base', lost: 'The base fell!', pick: 'Tap a glowing spot on your plot to place',
  shop: 'Shop', gate: 'Gate', plot: 'Free plot', cleared: 'Wave cleared! Bonus!', earn: 'Beat enemies and clear waves to earn more!',
};

/** What the lane-defense template needs, for a list of the templates. */
export const LANE_NEEDS = 'laneDefense { title, currency, enemies[] { name, health, speed, reward, damage, body{gameId,path}+costume{gameId,path} or model{gameId,path} }, defenders[] { name, model{gameId,path}, price, range, damage, rate }, base{gameId,path}, waves { list [[ { enemy, count, every } ]] } }; optional: start, words, props[], palette, symbol';

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

/** The recipe the agent described, checked, or what is missing. Pure. */
export function readLaneDefense(given: unknown, seed: number): { recipe: Recipe; notes: string[]; defaults: string[] } | { error: string; missing: string[] } {
  const g = (given && typeof given === 'object' ? given : {}) as Record<string, unknown>;
  const missing: string[] = [];
  const notes: string[] = [];
  const defaults: string[] = [];
  const text = (v: unknown, path: string, max: number): string => { const c = cleanText(v, max); if (!c.text) missing.push(path); else if (c.cut) notes.push(`${path} was cut to ${max} characters`); return c.text; };
  const title = text(g.title, 'title', 40);
  const currency = text(g.currency, 'currency', 12).replace(/[\s.\[\]]/g, '');
  if (!currency && !missing.includes('currency')) missing.push('currency');

  const enemies: EnemySpec[] = [];
  const rawEnemies = Array.isArray(g.enemies) ? g.enemies : [];
  if (rawEnemies.length < 1 || rawEnemies.length > 8) missing.push('enemies (1 to 8)');
  rawEnemies.slice(0, 8).forEach((e, i) => {
    const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const name = text(o.name, `enemies[${i}].name`, 24);
    const [health, speed, reward, damage] = [num(o.health, 1, 1e7), num(o.speed, 0.5, 40), num(o.reward, 0, 1e7), num(o.damage, 0, 1e5)];
    for (const [k, v] of [['health', health], ['speed', speed], ['reward', reward], ['damage', damage]] as const) if (v === undefined) missing.push(`enemies[${i}].${k} (a number)`);
    const body = ref(o.body), costume = ref(o.costume), model = ref(o.model);
    if (!model && !(body && costume)) missing.push(`enemies[${i}] needs model { gameId, path } or both body and costume { gameId, path }`);
    enemies.push({
      name, health: health ?? 1, speed: speed ?? 1, reward: reward ?? 0, damage: damage ?? 0,
      ...(body ? { body } : {}), ...(costume ? { costume } : {}), ...(model ? { model } : {}),
      ...(typeof o.upright === 'boolean' ? { upright: o.upright } : {}), ...(typeof o.limbColor === 'string' && /^#[0-9a-f]{6}$/i.test(o.limbColor) ? { limbColor: o.limbColor } : {}),
      ...(num(o.scale, 0.1, 20) ? { scale: o.scale as number } : {}), ...(num(o.stretch, 0.1, 5) ? { stretch: o.stretch as number } : {}), ...(num(o.size, 0.1, 20) ? { size: o.size as number } : {}),
    });
  });

  const defenders: DefenderSpec[] = [];
  const rawDefenders = Array.isArray(g.defenders) ? g.defenders : [];
  if (rawDefenders.length < 1 || rawDefenders.length > 8) missing.push('defenders (1 to 8)');
  rawDefenders.slice(0, 8).forEach((d, i) => {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    const name = text(o.name, `defenders[${i}].name`, 24);
    const model = ref(o.model);
    if (!model) missing.push(`defenders[${i}].model { gameId, path }`);
    const [price, range, damage, rate] = [num(o.price, 1, 1e9), num(o.range, 5, 100), num(o.damage, 0.1, 1e6), num(o.rate, 0.1, 20)];
    for (const [k, v] of [['price', price], ['range', range], ['damage', damage], ['rate', rate]] as const) if (v === undefined) missing.push(`defenders[${i}].${k} (a number)`);
    const projectile = ref(o.projectile);
    defenders.push({
      id: `D${i + 1}`, name, model: model ?? { game: '', path: '' }, price: price ?? 1, range: range ?? 5, damage: damage ?? 1, rate: rate ?? 1,
      ...(projectile ? { projectile } : {}), ...(typeof o.projectileColor === 'string' && /^#[0-9a-f]{6}$/i.test(o.projectileColor) ? { projectileColor: o.projectileColor } : {}),
      ...(typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? { color: o.color } : {}),
      ...(typeof o.blurb === 'string' && o.blurb.trim() ? { blurb: cleanText(o.blurb, 40).text } : {}), ...(typeof o.rarity === 'string' && o.rarity.trim() ? { rarity: cleanText(o.rarity, 12).text } : {}),
      ...(num(o.height, 0.5, 80) ? { height: o.height as number } : {}), ...(num(o.unlock, 0, 100) !== undefined ? { unlock: o.unlock as number } : {}),
    });
  });

  const base = ref(g.base);
  if (!base) missing.push('base { gameId, path } (what the enemies walk to)');

  const w = (g.waves && typeof g.waves === 'object' ? g.waves : {}) as Record<string, unknown>;
  const names = new Set(enemies.map((e) => e.name));
  const list: Recipe['waves']['list'] = [];
  const rawList = Array.isArray(w.list) ? w.list : [];
  if (rawList.length < 1 || rawList.length > 20) missing.push('waves.list (1 to 20 waves, each a list of { enemy, count, every })');
  rawList.slice(0, 20).forEach((wave, i) => {
    const groups = (Array.isArray(wave) ? wave : []).slice(0, 6).map((grp, k) => {
      const o = (grp && typeof grp === 'object' ? grp : {}) as Record<string, unknown>;
      const enemy = cleanText(o.enemy, 24).text;
      const [count, every] = [num(o.count, 1, 200), num(o.every, 0.1, 30)];
      if (!names.has(enemy)) missing.push(`waves.list[${i}][${k}].enemy ("${enemy}" is not one of the enemies you named)`);
      if (count === undefined || every === undefined) missing.push(`waves.list[${i}][${k}] count and every (numbers)`);
      return { enemy, count: count ?? 1, every: every ?? 1 };
    });
    if (!groups.length) missing.push(`waves.list[${i}] (an empty wave)`);
    list.push(groups);
  });
  const waveNum = (k: string, d: number, lo: number, hi: number) => { const v = num(w[k], lo, hi); if (v === undefined) defaults.push(`waves.${k} = ${d}`); return v ?? d; };
  if (missing.length) return { error: `The lane-defense game is missing: ${[...new Set(missing)].slice(0, 12).join('; ')}. Fill them from the user's request (every piece is a library piece you found).`, missing };

  const start = num(g.start, 0, 1e12);
  if (start === undefined) defaults.push('start = 50');
  const words = { ...DEFAULT_WORDS, ...Object.fromEntries(Object.entries((g.words && typeof g.words === 'object' ? g.words : {}) as Record<string, unknown>).filter(([k, v]) => k in DEFAULT_WORDS && typeof v === 'string').map(([k, v]) => [k, cleanText(v, 60).text])) };
  const props: PropSpec[] = [];
  (Array.isArray(g.props) ? g.props : []).slice(0, 12).forEach((p, i) => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const r = ref(o.look ?? o.ref);
    const where = ['scatter', 'border', 'rows'].includes(String(o.where)) ? String(o.where) as PropSpec['where'] : 'scatter';
    if (!r) { notes.push(`props[${i}] has no look { gameId, path }: skipped`); return; }
    props.push({ ref: r, count: Math.min(100, Math.max(1, Math.round(Number(o.count) || 8))), where, ...(num(o.height, 0.5, 80) ? { height: o.height as number } : {}) });
  });
  return {
    recipe: {
      title, currency, start: start ?? 50, words, enemies, defenders, props, base: base!,
      waves: { first: waveNum('first', 15, 1, 600), between: waveNum('between', 8, 1, 600), baseHealth: waveNum('baseHealth', 20, 1, 1e6), ...(num(w.clearBonus, 0, 1e9) !== undefined ? { clearBonus: w.clearBonus as number } : {}), list },
      seed, ...(typeof g.symbol === 'string' && g.symbol.trim() ? { symbol: cleanText(g.symbol, 3).text } : {}),
    },
    notes, defaults,
  };
}
