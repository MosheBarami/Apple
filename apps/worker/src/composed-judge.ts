/**
 * THE JUDGE FOR A COMPOSED GAME (owner, 2026-09-30: the old judge "measured the wrong things"). It fails on exactly what
 * the owner named:
 *   1. a map that is a copied world (the composer lays out a NEW one: Workspace holds AppleMap and the game's own folders);
 *   2. a twist that was not built: the agent states what each enemy is MEANT to be (judge_game's `design`), and the judge
 *      compares that with what exists (the enemies in the config, whether each wears a costume or is a model, and the names
 *      of the pieces it wears). It holds no list of nouns of its own: it used to know vegetables and fruit, so a request about
 *      anything else was judged by the one thing it knew;
 *   3. a creature that does not move (the play check's probe watches every creature's joints while it plays);
 *   4. assets that do not load (load failures in the play logs);
 * and on the loop itself: a player can buy and place, a wave comes, and beating it pays.
 * It never asks about features the game does not have (the old judge asked about pets and admin panels of a UI kit's game).
 */
import type { OpCall } from './phase-a-tools';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export interface ComposedConfig { title: string; enemies: string[]; creatures: string[]; costumed: number; items: string[]; /** enemy -> the staging folder of the costume it wears (ServerStorage.AppleParts.<key>) */ costumeKeys: Record<string, string> }

/** What the agent says it meant to build: each enemy's name and what it is meant to be, in its own words. */
export interface StatedDesign { enemies: { name: string; is?: string }[] }

/** The design the agent passed, read. Pure. */
export function readDesign(raw: unknown): StatedDesign | null {
  const o = rec(raw);
  const enemies = (Array.isArray(o.enemies) ? o.enemies : []).slice(0, 12).map((e) => rec(e)).filter((e) => typeof e.name === 'string' && e.name.trim())
    .map((e) => ({ name: String(e.name).trim().slice(0, 40), ...(typeof e.is === 'string' && e.is.trim() ? { is: e.is.trim().slice(0, 80) } : {}) }));
  return enemies.length ? { enemies } : null;
}

/** What the game's config says, read from its Luau text (the composer writes it; compose.ts luau()). Pure. */
export function readConfig(source: string): ComposedConfig | null {
  if (!/start\s*=\s*\{/.test(source) || !/waves\s*=\s*\{/.test(source)) return null;
  const title = /title\s*=\s*"([^"]*)"/.exec(source)?.[1] ?? 'the game';
  const section = (name: string): string => {
    const at = source.search(new RegExp(`\\n\\t${name} = \\{`));
    if (at < 0) return '';
    const end = source.indexOf('\n\t},', at);
    return source.slice(at, end < 0 ? undefined : end);
  };
  const keysAt = (text: string, depth: string) => [...text.matchAll(new RegExp(`\\n${depth}(?:\\["([^"]+)"\\]|([A-Za-z_]\\w*)) = \\{`, 'g'))].map((m) => m[1] ?? m[2]!);
  const creaturesText = section('creatures');
  const creatures = keysAt(creaturesText, '\\t\\t');
  const costumed = (creaturesText.match(/\bcostume = "/g) ?? []).length;
  const wavesText = section('waves');
  const enemiesAt = wavesText.indexOf('\n\t\tenemies = {');
  const enemiesText = enemiesAt < 0 ? '' : wavesText.slice(enemiesAt, wavesText.indexOf('\n\t\t},', enemiesAt));
  const enemies = keysAt(enemiesText, '\\t\\t\\t');
  const items = [...section('shop').matchAll(/\n\t\t\t\tid = "([^"]+)"/g)].map((m) => m[1]!);
  const costumeKeys: Record<string, string> = {};
  for (const m of creaturesText.matchAll(/\n\t\t(?:\["([^"]+)"\]|([A-Za-z_]\w*)) = \{[^}]*?costume = "ServerStorage\.AppleParts\.([A-Za-z0-9_]+)"/g)) costumeKeys[m[1] ?? m[2]!] = m[3]!;
  return { title, enemies, creatures, costumed, items, costumeKeys };
}

export interface Finding { area: string; ok: boolean; said: string; fix?: string }

/** The findings for a composed game from what was read and played. Pure, so every rule is tested. */
/** Whole lowercase words of a text, in any language. */
const wordsOf = (t: string): string[] => (t.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

export function judgeFindings(request: string, cfg: ComposedConfig, world: string[], play: Rec | null, logs: { errors: string[]; loadFailures: string[] }, design?: StatedDesign | null, pieceNames: Record<string, string[]> = {}): Finding[] {
  const out: Finding[] = [];
  const foreign = world.filter((n) => !['Camera', 'Terrain', 'AppleMap', 'AppleEnemies', 'AppleDefenders', 'AppleGallery'].includes(n));
  out.push(world.includes('AppleMap') && foreign.length === 0
    ? { area: 'map', ok: true, said: 'The map was made for this game.' }
    : { area: 'map', ok: false, said: world.includes('AppleMap') ? `The world holds things the game did not make: ${foreign.slice(0, 5).join(', ')}.` : 'There is no map.',
      fix: world.includes('AppleMap') ? `Delete ${foreign.slice(0, 5).map((n) => `game.Workspace.${n}`).join(', ')} (delete_instances).` : 'Run compose_game again with the same request.' });

  // The twist: what the agent said it meant to build, against what exists. No noun list: names and words are compared as given.
  const allCostumed = cfg.creatures.length > 0 && cfg.costumed >= cfg.creatures.length && cfg.enemies.every((e) => cfg.creatures.includes(e));
  const norm = (t: string) => t.normalize('NFC').toLowerCase().trim();
  if (design) {
    const built = new Set(cfg.enemies.map(norm)), stated = new Set(design.enemies.map((e) => norm(e.name)));
    const missingEnemies = design.enemies.filter((e) => !built.has(norm(e.name))).map((e) => e.name);
    const unstated = cfg.enemies.filter((e) => !stated.has(norm(e)));
    // What each enemy wears, by the names of its pieces, against the words the agent used for what it is.
    const looks = design.enemies.filter((e) => e.is && built.has(norm(e.name))).map((e) => {
      const worn = pieceNames[cfg.costumeKeys[cfg.enemies.find((x) => norm(x) === norm(e.name)) ?? ''] ?? ''] ?? [];
      const have = new Set(worn.flatMap(wordsOf));
      const meant = wordsOf(e.is!).filter((w) => w.length > 2);
      return { name: e.name, is: e.is!, worn, shared: meant.filter((w) => have.has(w)).length > 0 || !worn.length || !meant.length };
    });
    const mismatched = looks.filter((l) => !l.shared);
    out.push(allCostumed && !missingEnemies.length && !unstated.length && !mismatched.length
      ? { area: 'twist', ok: true, said: `The enemies match the design you stated: ${cfg.enemies.join(', ')}.` }
      : { area: 'twist', ok: false,
        said: [!allCostumed ? 'Some enemies are not built (no costume or model).' : '',
          missingEnemies.length ? `You stated enemies the game does not have: ${missingEnemies.join(', ')}.` : '',
          unstated.length ? `The game has enemies you did not state: ${unstated.join(', ')}.` : '',
          ...mismatched.map((l) => `${l.name} is meant to be "${l.is}", but it wears ${l.worn.length ? l.worn.map((w) => `"${w}"`).join(', ') : 'a piece with no name'}.`)].filter(Boolean).join(' '),
        fix: 'Rebuild with compose_game so the enemies are what you stated (the right library pieces), or correct the design you passed.' });
  } else {
    // Not compared, and said so: a check that did not run is never a pass in disguise.
    out.push(allCostumed
      ? { area: 'twist', ok: true, said: `Not compared with a design: none was stated. The enemies are ${cfg.enemies.join(', ')}; judge_game { design: { enemies: [{ name, is }] } } checks them against what you meant.` }
      : { area: 'twist', ok: false, said: 'Some enemies are not built (no costume or model).', fix: 'Run compose_game again with the enemies\' pieces.' });
  }

  const a = rec(play?.apple);
  if (!play || !a.composed) {
    out.push({ area: 'play', ok: false, said: 'The game could not be played in the check, so nothing about playing it is known.', fix: 'Make sure Studio is in edit mode and connected, then run judge_game again.' });
    return out;
  }
  const bought = num(a.bought) ?? 0;
  const spent = (num(a.moneyStart) ?? 0) - (num(a.moneyAfterBuy) ?? 0);
  out.push(bought > 0 && spent > 0
    ? { area: 'shop', ok: true, said: `A player can buy and plant: ${bought} placed.` }
    : { area: 'shop', ok: false, said: `Buying and planting did not work in the check${a.buyErrors && Array.isArray(a.buyErrors) && a.buyErrors.length ? ` (${String(a.buyErrors[0])})` : ''}` +
        ` [plot ${a.plot ?? 'none'} after ${num(a.plotWait) ?? '?'} s, ${num(a.tiles) ?? 0} tiles, ${num(a.catalog) ?? 0} items, cheapest ${a.item ?? 'none'}, money ${num(a.moneyStart) ?? 'none'}].`,
      fix: 'Read game.ServerScriptService.AppleComponents.AppleShop and the plot tiles (game.Workspace.AppleMap.Plots); every tile needs the AppleTags attribute AppleTile.' });

  const enemies = num(a.enemies) ?? 0;
  out.push(enemies > 0 && (num(a.wave) ?? 0) >= 1
    ? { area: 'waves', ok: true, said: `Waves come: wave ${num(a.wave)} with ${enemies} enemies at once.` }
    : { area: 'waves', ok: false, said: 'No wave came during the check.', fix: 'Check game.ServerStorage.AppleEnemies holds every enemy after the game starts (AppleCreatures builds them from game.ServerStorage.AppleParts) and Output shows no AppleBoot or AppleWaves error.' });

  const eJ = num(a.enemyJoints) ?? 0, eM = num(a.enemyJointsMoving) ?? 0;
  const dJ = num(a.defenderJoints) ?? 0, dM = num(a.defenderJointsMoving) ?? 0;
  const enemiesMove = eJ > 0 && eM / eJ >= 0.5;
  const defendersMove = dJ === 0 || dM > 0;
  out.push(enemiesMove && defendersMove
    ? { area: 'motion', ok: true, said: `The creatures move: ${eM} of ${eJ} enemy joints${dJ ? ` and ${dM} of ${dJ} planted ones` : ''} moved while it played.` }
    : { area: 'motion', ok: false, said: eJ === 0 ? 'No enemy joint was seen, so no creature was shown moving.' : `Creatures stand still: ${eM} of ${eJ} enemy joints moved.`,
      fix: 'Check game.ReplicatedStorage.AppleComponents.AppleMotion and game.StarterPlayer.StarterPlayerScripts.AppleMotionClient exist and the enemies are tagged AppleCreature.' });

  const earned = (num(a.moneyEnd) ?? 0) - (num(a.moneyAfterBuy) ?? 0);
  out.push(earned > 0
    ? { area: 'loop', ok: true, said: `Beating enemies pays: +${earned} during the check.` }
    : { area: 'loop', ok: false, said: 'Nothing was earned during the check: no enemy was beaten by what was planted.',
      fix: 'Check that planted things are within reach of the road (their Range) and that AppleDefenders started (Output).' });

  out.push(logs.errors.length === 0
    ? { area: 'errors', ok: true, said: 'No script errors while it played.' }
    : { area: 'errors', ok: false, said: `Script errors while it played: ${logs.errors.slice(0, 2).join(' | ')}`, fix: 'Fix the named script; its path is in the error.' });
  const loadIds = new Set(logs.loadFailures.map((l) => /(\d{6,})/.exec(l)?.[1] ?? l));
  out.push(loadIds.size <= 2
    ? { area: 'assets', ok: true, said: loadIds.size ? 'Everything the game shows loaded (the one or two failures are the test avatar\'s own animations).' : 'Everything loaded.' }
    : { area: 'assets', ok: false, said: `${loadIds.size} assets did not load.`, fix: 'Replace the pieces whose meshes or images fail with ones built from parts.' });
  return out;
}

export function verdictOf(findings: Finding[]): { verdict: 'ready' | 'not ready'; score: number } {
  const score = Math.round((findings.filter((f) => f.ok).length / Math.max(findings.length, 1)) * 100);
  return { verdict: findings.every((f) => f.ok) ? 'ready' : 'not ready', score };
}

const LOAD = /failed to load|not authorized|not approved|animation failed/i;

/** The composed-game judge, or null when the place was not composed (the older judge handles it). */
export async function judgeComposed(call: OpCall, request: string, designRaw?: unknown): Promise<Rec | null> {
  const read = rec(await call({ op: 'read_script', path: 'game.ServerScriptService.AppleComponents.AppleGameConfig' }, 20_000));
  const source = typeof read.source === 'string' ? read.source : '';
  const cfg = source ? readConfig(source) : null;
  if (!cfg) return null;
  const tree = rec(await call({ op: 'get_tree', root: 'game.Workspace', maxDepth: 1, maxNodes: 200 }, 30_000));
  const world = new Set<string>();
  const walk = (n: unknown, depth: number) => {
    const r = rec(n);
    if (depth === 1 && typeof r.name === 'string') world.add(r.name);
    for (const c of Array.isArray(r.children) ? r.children : []) walk(c, depth + 1);
  };
  walk(tree.root ?? tree.tree ?? tree, 0);
  // What the enemies wear, by the names of the pieces staged for them (only read when a design was stated to compare with).
  const design = readDesign(designRaw);
  const pieceNames: Record<string, string[]> = {};
  if (design) {
    const parts = rec(await call({ op: 'get_tree', root: 'game.ServerStorage.AppleParts', maxDepth: 2, maxNodes: 200 }, 30_000));
    for (const f of (Array.isArray(rec(parts.root).children) ? rec(parts.root).children as unknown[] : [])) {
      const o = rec(f);
      if (typeof o.name === 'string') pieceNames[o.name] = (Array.isArray(o.children) ? o.children : []).map((c) => String(rec(c).name ?? '')).filter(Boolean);
    }
  }
  const play = rec(await call({ op: 'play_check', seconds: 15 }, 100_000));
  const played = 'error' in play ? null : play;
  const lines = (v: unknown) => (Array.isArray(v) ? v : []).map((e) => String(rec(e).message ?? e));
  const all = played ? [...lines(played.clientErrors), ...lines(played.serverErrors)] : [];
  const warn = played ? [...lines(played.clientWarnings), ...lines(played.serverWarnings)] : [];
  const loadFailures = [...all, ...warn].filter((l) => LOAD.test(l));
  const errors = all.filter((l) => !LOAD.test(l));
  const findings = judgeFindings(request, cfg, [...world], played, { errors, loadFailures }, design, pieceNames);
  const { verdict, score } = verdictOf(findings);
  const bad = findings.filter((f) => !f.ok);
  return {
    verdict, score, judge: 'composed',
    checked: findings.map((f) => `${f.ok ? 'yes' : 'NO'} ${f.area}: ${f.said}`),
    ...(bad.length ? { fixes: bad.map((f) => `${f.area}: ${f.fix ?? f.said}`) } : {}),
    forUser: verdict === 'ready'
      ? `${cfg.title} plays the way you asked: ${findings.filter((f) => ['twist', 'waves', 'motion', 'loop'].includes(f.area)).map((f) => f.said.replace(/\.$/, '')).join('; ')}.`
      : `${cfg.title} is not ready yet: ${bad.map((f) => f.said.replace(/\.$/, '')).join('; ')}.`,
    note: verdict === 'ready'
      ? 'Ready. Answer the user now from forUser in your own friendly words; change nothing more.'
      : 'Fix only what fixes lists, at the paths named (no searching the whole place), then run judge_game once more. If a fix needs a rebuild, say so plainly instead.',
  };
}
