/**
 * judge_game: SCORE A BUILT GAME THE WAY A PAYING CLIENT WOULD.
 *
 * The agent (and the lead) runs it after building. It reads the place with the Studio operations that already exist
 * (get_tree with properties and attributes, query_instances, spatial_query, dump_scripts, ui_layout_check, the owner
 * library's game names), then plays it in at most three Test sessions (play_check_ui: real clicks through VirtualInput, a
 * walk onto collectable parts, the leaderstats before and after) and answers seven client questions, each a named criterion
 * with exact evidence and a concrete fix (client-judge-rules.ts). The questions are the owner's, in his words: is the game
 * unique, flawlessly built, with real progression, clean and fitting UI, no placeholders, correct code, and the features the
 * request implies?
 *
 * Nothing here changes the place. The play sessions insert and remove the plugin's own temporary check scripts, exactly as
 * play_check does. What could not be observed is reported as not observed and can never make the verdict `ready`.
 *
 * The bodies are pure functions over the op channel (`OpCall`), so tests drive them against a stand-in Studio.
 */
import type { GatewayToolDef, StudioOp } from '@apple/shared';
import { playCheckUiOp, type OpCall } from './phase-a-tools';
import {
  type GuiNode, type MenuCluster, arr, all, clip, coveringPieces, guiFrom, hasText, hasVisuals, isButton, labelOf, lastName, menuClusters, num, outOfSight, overlaps, pathParts, pickButtons, pickFlow, readable, rec, shown,
  showsSomething, str, styleClashes, textOf, under, visibleFillOf, widgetOf,
} from './client-judge-ui';
import {
  type Criterion, type FitInput, type LayoutIssue, type NameItem, type Play, type PlacementFact, type PressOutcome, type SpawnFact, type TextItem, type WorldFacts,
  classifyPresses, compose, judgeButtons, judgeCoherence, judgeConstruction, judgeErrors, judgeFit, judgePlaceholders, judgeProgression, latestOutcomes, movesOf,
  observed, purchaseHits, readPlay, remoteRequires, scriptTexts, unmeasured, wantsOtherLanguage,
} from './client-judge-rules';

type Args = Record<string, unknown>;
type Refusal = { error: string };
const isErr = (r: unknown): r is Refusal => !!r && typeof r === 'object' && typeof (r as Args).error === 'string';

export interface JudgeOptions { now?: () => number; budgetMs?: number; /** The first steps of the game's loop when it came from a library game whose loop runs (see plannedLoop). */ knownLoop?: string[] }
export const JUDGE_BUDGET_MS = 8 * 60_000;
export const MAX_SESSIONS = 3;
const PRESSES_PER_SESSION = 5;
/** More candidates than the sessions can press: the ones that turn out to sit in a window the game keeps closed are dropped. */
const MAX_PICKS = 45;
const SESSION_SECONDS = [15, 4, 4] as const;
const PLAY_TIMEOUT_MS = 100_000;
// The screens a player has on at the start come first; the switched-off ones are read after them (their windows are where a shop flow starts).
const MAX_SCREENS = 40;
const MAX_OFF_SCREENS = 10;
const MAX_WORLD_GUIS = 30;
const MAX_PLACEMENT_CHECKS = 25;
const MAX_BOUNDS_CHECKS = 20;
const MAX_LAYOUT_SCREENS = 6;
const MAX_SOURCE_LOOKUPS = 12;

export const JUDGE_GAME_DEF: GatewayToolDef = {
  name: 'judge_game',
  description:
    'Score the game you built the way a PAYING CLIENT would, before you tell the user it is done. It reads the whole place and plays it in up to 3 short Test sessions (real button clicks, walking onto collectable parts), then answers seven questions with exact evidence and a fix for each: ' +
    'placeholders (default/"loading"/"nil"/fake-number/developer-note/other-language text, Robux products that are not the owner\'s), ui_coherence (overlaps of the pieces that stay on screen, two menu sets, two different looks, a crowded or bare start screen, layout at phone and desktop size), buttons_work (every visible button pressed: which do nothing), ' +
    'progression (can the player earn AND spend, from leaderstats or from the money counter on the HUD; what a test cannot press, like proximity prompts, is said, not counted as absent), errors (script errors while playing, and code loaded from a Roblox asset id), construction (floating/overlapping/buried/far parts, spawn on solid ground), fit_uniqueness (features the request did not ask for such as pets in a garden game, features it DID ask for that nothing in the game mentions, duplicate systems, leftover admin/event/duels/codes, a source game\'s name or website still showing). ' +
    'Returns {verdict: "ready"|"not ready", score 0-100, criteria:[{id, ok, measured, score, evidence[], fix}], forUser (2-4 plain sentences), fixes (ordered), notVerified}. Only "ready" means every question is a yes; a part that could not be observed is never a yes. ' +
    'Pass `request` = the user\'s request in plain English. Fix the listed problems in order (fit_uniqueness first: deleting what does not belong removes other problems too) and run it again until it says ready. ' +
    'The score is capped at 79 while any question is a no. It takes Studio over for up to about 3 minutes (like play_check_ui). sessions: 0-3 (default 3); 0 reads without playing, so buttons, progression and errors are then not measured and the verdict cannot be ready.',
  parameters: {
    type: 'object',
    properties: {
      request: { type: 'string', description: 'What the user asked for, in plain English, in their words (e.g. "an original brainrot game with a lobby and plots"). Decides which features are unrequested.' },
      ownProductIds: { type: 'array', items: { type: 'number' }, maxItems: 50, description: 'Robux product / game pass ids that belong to the game owner; any other id written in a script is reported.' },
      sessions: { type: 'number', description: '0-3, default 3: how many play sessions to run (each ~10-40 s).' },
    },
    required: ['request'],
  },
};

/* ------------------------------------------------------------------------------------------ small readers --- */

const treeRoot = (r: unknown): Args => rec(rec(r).root);
const childrenOf = (r: unknown): Args[] => arr(treeRoot(r).children).map(rec);
const tag = (node: Args): string | undefined => {
  const t = rec(rec(node.attributes).AppleLibraryGame);
  const v = 't' in t ? t.v : rec(node.attributes).AppleLibraryGame;
  return typeof v === 'string' && v ? v : undefined;
};
const loadingName = /load|splash|intro|transition|cutscene/i;
const DEV_NAME = /\b(?:delete|remove|erase|borrar|eliminar)\s*(?:me|this|it|esto|este|ui|gui)\b|^\s*(?:borrar|todo|readme)\b/i;
const relative = (path: string): string => readable(path, 'StarterGui');

/* ---------------------------------------------------------------------------------------------- screens --- */

interface ScreenRead { screens: GuiNode[]; cut: number; failed?: string; over: number }
/** How many nodes one get_tree may return: a big screen's answer must fit the plugin's result size. */
const SCREEN_NODES = 500;
const PIECE_LIMIT = 80;
const READS_PER_SCREEN = 100;

/**
 * One instance and everything below it. When the plugin cuts the answer, a node with a few children is read again child by
 * child (a shop window with hundreds of nodes is one such child), and a node with many children (a grid of cards) keeps the
 * cut answer, the first cards, and says it was cut. `budget` bounds the reads one screen may cost.
 */
async function readPiece(call: OpCall, path: string, depth: number, budget: { left: number }, late: () => boolean): Promise<{ raw: Args; cut: boolean } | Refusal> {
  budget.left -= 1;
  const full = await call({ op: 'get_tree', root: path, maxDepth: depth, maxNodes: SCREEN_NODES }, 60_000);
  if (isErr(full)) return full;
  const whole = treeRoot(full);
  if (rec(full).truncated !== true) return { raw: whole, cut: false };
  if (budget.left < 4 || depth < 2 || late()) return { raw: whole, cut: true };
  const shell = await call({ op: 'get_tree', root: path, maxDepth: 1, maxNodes: 200 }, 30_000);
  budget.left -= 1;
  if (isErr(shell)) return { raw: whole, cut: true };
  const parts = childrenOf(shell);
  if (parts.length > PIECE_LIMIT || rec(shell).truncated === true) return { raw: whole, cut: true };
  const root: Args = { ...treeRoot(shell), children: [] as unknown[] };
  let cut = false;
  for (const part of parts) {
    const piece = /^UI[A-Z]/.test(str(part.class, 40)) || budget.left < 1 ? undefined : await readPiece(call, str(part.path, 400), depth - 1, budget, late);
    if (piece === undefined || isErr(piece)) { (root.children as unknown[]).push(part); cut ||= piece !== undefined || !/^UI[A-Z]/.test(str(part.class, 40)); continue; }
    (root.children as unknown[]).push(piece.raw);
    cut ||= piece.cut;
  }
  return { raw: root, cut };
}

async function readScreens(call: OpCall, late: () => boolean): Promise<ScreenRead> {
  const top = await call({ op: 'get_tree', root: 'game.StarterGui', maxDepth: 1, maxNodes: 300 }, 30_000);
  if (isErr(top)) return { screens: [], cut: 0, failed: top.error, over: 0 };
  const listed = childrenOf(top).filter((c) => c.class === 'ScreenGui');
  const isOn = (c: Args): boolean => guiFrom(c).props.Enabled !== false;
  const chosen = [...listed.filter(isOn).slice(0, MAX_SCREENS), ...listed.filter((c) => !isOn(c)).slice(0, MAX_OFF_SCREENS)];
  const screens: GuiNode[] = [];
  let cut = 0;
  for (const c of chosen) {
    const got = await readPiece(call, str(c.path, 400), 12, { left: READS_PER_SCREEN }, late);
    if (isErr(got)) { screens.push(guiFrom(c)); cut += 1; continue; }
    screens.push(guiFrom(got.raw));
    if (got.cut) cut += 1;
  }
  return { screens, cut, over: Math.max(0, listed.length - chosen.length) };
}

/** Signs, name tags and other GUIs that hang in the world: a sample, each read to a few levels. */
async function readWorldGuis(call: OpCall): Promise<{ guis: GuiNode[]; total: number }> {
  const found = await call({ op: 'query_instances', root: 'game.Workspace', isA: 'LayerCollector', limit: 200 }, 30_000);
  if (isErr(found)) return { guis: [], total: 0 };
  const list = arr(rec(found).matches).map(rec).filter((m) => typeof m.path === 'string');
  const guis: GuiNode[] = [];
  for (const m of list.slice(0, MAX_WORLD_GUIS)) {
    const full = await call({ op: 'get_tree', root: str(m.path, 400), maxDepth: 4, maxNodes: 60 }, 30_000);
    if (!isErr(full)) guis.push(guiFrom(treeRoot(full)));
  }
  return { guis, total: list.length };
}

function textItems(layer: GuiNode, via: TextItem['via'], hidden: ReadonlySet<GuiNode> = new Set()): TextItem[] {
  const out: TextItem[] = [];
  for (const n of all(layer)) {
    if (outOfSight(n)) continue;
    // A screen or a top-level piece named as a note to its author ("DELETE ME") is a leftover the player finds even if its words are fine.
    if ((n === layer || n.parent === layer) && DEV_NAME.test(spaced(n.name))) out.push({ where: relative(n.path), text: spaced(n.name), cls: 'Instance name', state: shown(n) && !under(n, hidden) ? 'shown' : 'hidden', via });
    if (!hasText(n)) continue;
    const text = textOf(n);
    const where = relative(n.path);
    let ancestorLoading = false;
    for (let p: GuiNode | null = n; p && !ancestorLoading; p = p.parent) ancestorLoading = loadingName.test(p.name);
    const state: TextItem['state'] = shown(n) && !under(n, hidden) ? 'shown' : 'hidden';
    if (text.trim() === '') {
      // A blank BUTTON is a defect only when it is a visible box with nothing in it; icon buttons hold a picture or a label.
      if (n.cls === 'TextButton' && visibleFillOf(n) && !n.children.some((c) => hasVisuals(c))) out.push({ where, text: '', cls: n.cls, state, via });
      continue;
    }
    out.push({ where, text, cls: n.cls, state, via, key: `${n.screen}::${n.name}`, ...(ancestorLoading ? { loadingScreen: true } : {}) });
  }
  return out;
}
/** What the player's screen held for each label, visible or not: "Screen::Name" -> the texts it showed. */
function runtimeTexts(plays: readonly Play[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const p of plays.filter(observed)) for (const s of p.screens) for (const l of s.labels) {
    const key = `${s.name}::${l.name}`;
    out.set(key, (out.get(key) ?? new Set()).add(l.text.trim()));
  }
  return out;
}
/** Texts the screens hold that the running game replaced (the label is on the player's screen with other words): the player never sees them. */
const replacedAtRuntime = (i: TextItem, seen: ReadonlyMap<string, Set<string>>): boolean => {
  const r = i.key ? seen.get(i.key) : undefined;
  return !!r && r.size > 0 && !r.has(i.text.trim());
};
const playerItems = (plays: readonly Play[]): TextItem[] => plays.filter(observed).flatMap((p) => p.screens.filter((s) => s.enabled).flatMap((s) => s.labels
  .filter((l) => l.visible && l.text.trim() !== '')
  .map((l): TextItem => ({ where: `${s.name}.${l.name}`, text: l.text, cls: l.cls, state: 'runtime', via: 'player' }))));

/* ------------------------------------------------------------------------------------------------ scripts --- */

interface ScriptRead { scripts: { path: string; source: string }[]; cut: boolean; failed?: string }
/**
 * Where a game keeps its code, most telling first. Each is read on its own: one plugin read stops after 240 scripts or 3,600
 * nodes, and a big map in Workspace (read first) would use both up before ServerScriptService, where the purchases live, was reached.
 */
const SCRIPT_HOMES = ['ServerScriptService', 'ReplicatedStorage', 'StarterGui', 'StarterPlayer', 'ServerStorage', 'ReplicatedFirst', 'StarterPack', 'Workspace'] as const;
async function readScripts(call: OpCall, late: () => boolean): Promise<ScriptRead> {
  const scripts: ScriptRead['scripts'] = [];
  let cut = false, answered = 0, failed: string | undefined;
  for (const home of SCRIPT_HOMES) {
    if (answered && late()) { cut = true; break; }
    const res = await call({ op: 'dump_scripts', root: `game.${home}`, maxScripts: 240, maxChars: 350_000 }, 60_000);
    if (isErr(res)) { failed ??= res.error; continue; }
    answered += 1;
    scripts.push(...arr(rec(res).scripts).map(rec).filter((x) => typeof x.path === 'string' && typeof x.source === 'string').map((x) => ({ path: str(x.path, 400), source: str(x.source, 200_000) })));
    cut ||= rec(res).truncated === true;
  }
  return { scripts, cut, ...(answered ? {} : { failed }) };
}

/* ------------------------------------------------------------------------------------ tags, names, sources --- */

interface Inventory { names: NameItem[]; tagged: Map<string, string[]>; seenTags: Set<string> }
/** What the other services hold, by name, and which top-level things came from a library game (AppleLibraryGame). */
async function readServices(call: OpCall, screens: readonly GuiNode[]): Promise<Inventory> {
  const inv: Inventory = { names: [], tagged: new Map(), seenTags: new Set() };
  const note = (where: string, text: string, tag?: string): void => { if (text) inv.names.push({ where, text, ...(tag ? { tag } : {}) }); };
  for (const s of screens) {
    const t = typeof s.attrs.AppleLibraryGame === 'string' ? s.attrs.AppleLibraryGame : undefined;
    if (t) { inv.seenTags.add(t); inv.tagged.set(s.name, [...(inv.tagged.get(s.name) ?? []), t]); }
    note(`screen ${s.name}`, s.name, t);
    for (const n of all(s)) {
      if (n === s) continue;
      note(`screen ${s.name}`, n.name, t);
      if (hasText(n) && textOf(n).trim()) note(`screen ${s.name}`, textOf(n), t);
    }
  }
  const services: [string, number, number][] = [['ServerScriptService', 2, 300], ['ReplicatedStorage', 2, 300], ['ServerStorage', 2, 200], ['StarterPack', 1, 60], ['StarterPlayer', 3, 120]];
  for (const [name, maxDepth, maxNodes] of services) {
    const res = await call({ op: 'get_tree', root: `game.${name}`, maxDepth, maxNodes }, 30_000);
    if (isErr(res)) continue;
    const walk = (node: Args, depth: number, inherited?: string): void => {
      for (const c of arr(node.children).map(rec)) {
        const t = tag(c);
        if (t) inv.seenTags.add(t);
        if (c.class !== 'Terrain' && c.class !== 'Camera') note(name, str(c.name, 80), t ?? inherited);
        if (depth < maxDepth) walk(c, depth + 1, t ?? inherited);
      }
    };
    walk(treeRoot(res), 1);
  }
  return inv;
}
async function sourceNames(call: OpCall, ids: ReadonlySet<string>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const id of [...ids].slice(0, MAX_SOURCE_LOOKUPS)) {
    const res = await call({ op: 'query_owner_library', action: 'game', id }, 30_000);
    // The library is on the owner's Mac: if it does not answer once, it will not answer eleven more times.
    if (isErr(res)) break;
    const n = str(rec(res).name, 120);
    if (n) names.set(id, n);
  }
  return names;
}

/* -------------------------------------------------------------------------------------------------- world --- */

const BASE_PARTS = new Set(['Part', 'MeshPart', 'UnionOperation', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'NegateOperation']);
const num3 = (v: unknown): number[] | undefined => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number') ? (v as number[]) : undefined);

async function readWorld(call: OpCall, late: () => boolean): Promise<{ facts: WorldFacts; tags: Set<string>; names: { text: string; tag?: string }[] }> {
  const empty: WorldFacts = { items: [], spawns: [], originGround: null, groundY: 0, notChecked: 0, itemsSeen: 0, asked: false };
  const tags = new Set<string>();
  const top = await call({ op: 'get_tree', root: 'game.Workspace', maxDepth: 1, maxNodes: 600 }, 30_000);
  if (isErr(top)) return { facts: empty, tags, names: [] };
  const names = childrenOf(top).filter((c) => c.class !== 'Terrain' && c.class !== 'Camera').map((c) => ({ text: str(c.name, 80), ...(tag(c) ? { tag: tag(c) } : {}) }));
  type Cand = { path: string; name: string; cls: string; tagged: boolean };
  const cands: Cand[] = [];
  const spawnPaths = new Set<string>();
  const folders: Args[] = [];
  const take = (c: Args, inherited: boolean): void => {
    const cls = str(c.class, 40), path = str(c.path, 400), name = str(c.name, 120);
    const t = tag(c);
    if (t) tags.add(t);
    const tagged = inherited || !!t;
    if (cls === 'Terrain' || cls === 'Camera') return;
    if (cls === 'SpawnLocation') { spawnPaths.add(path); return; }
    if (cls === 'Folder') { if (!tagged && folders.length < 6 && (num(c.childCount) ?? 0) > 0) folders.push(c); return; }
    if (cls === 'Model' || BASE_PARTS.has(cls)) {
      if (name === 'Baseplate') return;
      cands.push({ path, name, cls, tagged });
    }
  };
  for (const c of childrenOf(top)) take(c, false);
  for (const f of folders) {
    const inner = await call({ op: 'get_tree', root: str(f.path, 400), maxDepth: 1, maxNodes: 200 }, 30_000);
    if (!isErr(inner)) for (const c of childrenOf(inner)) take(c, false);
  }
  const found = await call({ op: 'query_instances', root: 'game.Workspace', className: 'SpawnLocation', limit: 5 }, 30_000);
  if (!isErr(found)) for (const m of arr(rec(found).matches).map(rec)) if (typeof m.path === 'string') spawnPaths.add(m.path);

  // Spawn points first: they decide where "near the start" is.
  const spawns: SpawnFact[] = [];
  let groundY = 0;
  for (const path of [...spawnPaths].slice(0, 3)) {
    const fact: SpawnFact = { path };
    const info = await call({ op: 'get_tree', root: path, maxDepth: 0, maxNodes: 1 }, 30_000);
    if (!isErr(info)) { const cc = rec(treeRoot(info).props).CanCollide; const v = rec(cc).v ?? cc; if (typeof v === 'boolean') fact.canCollide = v; }
    const p = await call({ op: 'spatial_query', action: 'check_placement', path }, 30_000);
    if (!isErr(p)) {
      const d = rec(p);
      fact.center = num3(d.center);
      fact.overlapCount = num(d.overlapCount);
      fact.groundHit = rec(d.ground).hit === true;
      if (!spawns.length && typeof d.topY === 'number') groundY = d.topY;
    }
    spawns.push(fact);
  }
  let originGround: boolean | null = null;
  if (!spawns.length) {
    const g = await call({ op: 'spatial_query', action: 'find_ground', position: [0, 200, 0] }, 30_000);
    if (!isErr(g)) { originGround = rec(rec(g).result).hit === true; const py = num3(rec(rec(g).result).position)?.[1]; if (py !== undefined) groundY = py; }
  }

  const items: PlacementFact[] = [];
  let placement = 0, bounds = 0, notChecked = 0;
  const ordered = [...cands.filter((c) => !c.tagged), ...cands.filter((c) => c.tagged)];
  for (const c of ordered) {
    const wantPlacement = !c.tagged && placement < MAX_PLACEMENT_CHECKS;
    const wantBounds = c.tagged && bounds < MAX_BOUNDS_CHECKS;
    if (late() || (!wantPlacement && !wantBounds)) { notChecked += 1; continue; }
    if (wantPlacement) placement += 1; else bounds += 1;
    const r = await call({ op: 'spatial_query', action: wantPlacement ? 'check_placement' : 'bounds', path: c.path }, 30_000);
    if (isErr(r)) { notChecked += 1; continue; }
    const d = rec(r);
    items.push({
      path: c.path, name: c.name, tagged: c.tagged, center: num3(d.center), size: num3(d.size), bottomY: num(d.bottomY), topY: num(d.topY),
      ...(wantPlacement ? {
        overlapCount: num(d.overlapCount), overlapping: arr(d.overlapping).filter((x): x is string => typeof x === 'string'),
        floating: d.floating === true, gapBelow: typeof d.gapBelow === 'number' ? d.gapBelow : null, groundHit: rec(d.ground).hit === true,
      } : {}),
    });
  }
  return { facts: { items, spawns, originGround, groundY, notChecked, itemsSeen: cands.length, asked: true }, tags, names };
}

/* --------------------------------------------------------------------------------------- what to walk onto --- */

const TOUCH_NAMES = ['coin', 'cash', 'money', 'collect', 'gem', 'pickup', 'orb', 'drop', 'sell', 'harvest', 'crop', 'fruit', 'crystal', 'chest', 'reward'];
const TOUCH_CLASSES = new Set(['Model', ...BASE_PARTS]);
const NOT_TOUCH = /shop|store|sign|gui|label|display|counter|icon|button|text|board|billboard|\bui\b|hud|sound|prompt/i;
async function findTouchables(call: OpCall): Promise<string[]> {
  const out: string[] = [];
  const perParent = new Map<string, number>();
  for (const name of TOUCH_NAMES) {
    if (out.length >= 5) break;
    const res = await call({ op: 'query_instances', root: 'game.Workspace', name, limit: 12 }, 30_000);
    if (isErr(res)) continue;
    for (const m of arr(rec(res).matches).map(rec)) {
      const path = str(m.path, 320);
      const parent = pathParts(path).slice(0, -1).join('\u0000');
      if (!path || out.includes(path) || !TOUCH_CLASSES.has(str(m.className, 40)) || NOT_TOUCH.test(lastName(path)) || (perParent.get(parent) ?? 0) >= 2) continue;
      out.push(path);
      perParent.set(parent, (perParent.get(parent) ?? 0) + 1);
      break;
    }
  }
  return out.slice(0, 5);
}

/* --------------------------------------------------------------------------------------- what a test cannot press --- */

const EARNING_WORD = /\b(?:sell|harvest|collect|claim|pick|steal|buy|purchase|deposit|cash|grab|plant|water|hatch|feed|upgrade|take|open|craft|mine)\b/i;
/**
 * The proximity prompts of the world that stand for a step of the game's loop ("Sell", "Harvest"). A player walks up and presses a
 * key; the Studio test cannot, so when it sees nothing earned it must say that this way of earning was not tried instead of saying
 * that there is none.
 */
async function readPrompts(call: OpCall): Promise<string[]> {
  const found = await call({ op: 'query_instances', root: 'game.Workspace', className: 'ProximityPrompt', limit: 12 }, 30_000);
  if (isErr(found)) return [];
  const words = new Set<string>();
  for (const m of arr(rec(found).matches).map(rec).slice(0, 8)) {
    if (typeof m.path !== 'string') continue;
    const info = await call({ op: 'get_tree', root: m.path, maxDepth: 0, maxNodes: 1 }, 30_000);
    if (isErr(info)) continue;
    const props = rec(treeRoot(info).props);
    const text = (k: string): string => { const v = props[k]; const w = v && typeof v === 'object' && 't' in (v as Args) ? (v as Args).v : v; return typeof w === 'string' ? w.trim() : ''; };
    const said = [text('ActionText'), text('ObjectText')].filter(Boolean).join(' ');
    if (EARNING_WORD.test(said)) words.add(clip(said, 40));
  }
  return [...words];
}

/* ----------------------------------------------------------------------------------------------- layout --- */

async function readLayout(call: OpCall, screens: readonly GuiNode[]): Promise<LayoutIssue[] | null> {
  const chosen = screens.filter((s) => showsSomething(s)).sort((a, b) => all(b).length - all(a).length).slice(0, MAX_LAYOUT_SCREENS);
  if (!chosen.length) return [];
  const out: LayoutIssue[] = [];
  let answered = 0;
  for (const s of chosen) {
    const res = await call({ op: 'ui_layout_check', screen: s.path, devices: ['phone_landscape', 'desktop'] }, 60_000);
    if (isErr(res)) continue;
    answered += 1;
    for (const d of arr(rec(res).devices).map(rec)) for (const i of arr(d.issues).map(rec)) out.push({ screen: s.name, device: str(d.device, 30), kind: str(i.kind, 40), path: str(i.path, 300), detail: str(i.detail, 120) });
  }
  return answered ? out : null;
}

/* --------------------------------------------------------------------------------------------- sessions --- */

export interface SessionPlan { seconds: number; touch: string[]; press: string[] }
interface SessionLog { index: number; seconds: number; touched: number; pressed: number; observed: boolean; note?: string }

/**
 * The buttons of the first screen, split over the sessions. The first session presses the buttons that only navigate (its
 * wait shows whether money arrives by itself); the second walks onto the collectables FIRST and then presses the buttons that
 * collect, sell, buy or upgrade, so a purchase can be afforded; the third tries the shop flow (open the shop, then its buy
 * buttons) and whatever is left. A press that failed only because an earlier press opened a window over it goes first next time.
 */
export function planSession(index: number, pool: { acts: string[]; rest: string[] }, retry: string[], touchables: string[], flow: { opener: string; inner: string[] } | null, sessions = MAX_SESSIONS): SessionPlan {
  const seconds = SESSION_SECONDS[index - 1] ?? 4;
  const room = (used: number): number => Math.max(0, PRESSES_PER_SESSION - used);
  if (index === 1) {
    const press = pool.rest.splice(0, PRESSES_PER_SESSION);
    // The buttons that collect or buy wait for the session that walks onto the collectables first, unless there is only one.
    if (sessions === 1 || !press.length) press.push(...pool.acts.splice(0, room(press.length)));
    return { seconds, touch: [], press };
  }
  if (index === 2) {
    const press = [...retry.slice(0, PRESSES_PER_SESSION)];
    press.push(...pool.acts.splice(0, room(press.length)));
    press.push(...pool.rest.splice(0, room(press.length)));
    return { seconds, touch: touchables.slice(0, 5), press };
  }
  const tail = flow ? [flow.opener, ...flow.inner] : [];
  const press = [...retry.filter((p) => !tail.includes(p)).slice(0, room(tail.length))];
  press.push(...pool.acts.splice(0, room(press.length + tail.length)));
  press.push(...pool.rest.splice(0, room(press.length + tail.length)));
  return { seconds, touch: [], press: [...press, ...tail].slice(0, PRESSES_PER_SESSION) };
}

async function runSession(call: OpCall, plan: SessionPlan): Promise<unknown> {
  const op: StudioOp | Refusal = plan.press.length
    ? playCheckUiOp({ seconds: plan.seconds, touch: plan.touch, press: plan.press })
    : { op: 'play_check', seconds: plan.seconds, ...(plan.touch.length ? { touch: plan.touch } : {}) };
  if (isErr(op)) return op;
  return call(op, PLAY_TIMEOUT_MS);
}

/* ---------------------------------------------------------------------------- what the player's screen showed --- */

/** Studio puts its own free-camera screen into every Test session; it is not part of the game. */
const STUDIO_SCREENS = new Set(['Freecam']);
/** Names of the screens the player's screen had on with visible text in some session. */
function runtimeScreens(plays: readonly Play[]): Set<string> {
  const out = new Set<string>();
  for (const p of plays.filter(observed)) for (const s of p.screens) if (s.enabled && !STUDIO_SCREENS.has(s.name) && s.labels.some((l) => l.visible && l.text.trim())) out.add(s.name);
  return out;
}


/**
 * Pieces of a screen that were authored visible but that the player's own screen showed hidden: a script hides its windows when
 * the game starts. A widget is hidden when something inside it was reported hidden (a text in the screen report, a button that was
 * pressed) and nothing inside it was reported visible. A name that two nodes share is not evidence for either.
 */
function hiddenAtPlay(screens: readonly GuiNode[], plays: readonly Play[]): Set<GuiNode> {
  const byPath = new Map<string, GuiNode>();
  const byKey = new Map<string, GuiNode[]>();
  for (const s of screens) for (const n of all(s)) {
    byPath.set(n.path, n);
    byKey.set(`${s.name}::${n.name}`, [...(byKey.get(`${s.name}::${n.name}`) ?? []), n]);
  }
  const evidence = new Map<GuiNode, { hidden: boolean; visible: boolean }>();
  const settled = new Map<GuiNode, boolean>();
  const note = (n: GuiNode | undefined, visible: boolean): void => {
    if (!n || n.parent === null) return;
    const w = widgetOf(n);
    const e = evidence.get(w) ?? { hidden: false, visible: false };
    if (visible) e.visible = true; else e.hidden = true;
    evidence.set(w, e);
  };
  for (const p of plays.filter(observed)) {
    for (const g of p.screens) for (const l of g.labels) {
      const nodes = byKey.get(`${g.name}::${l.name}`) ?? [];
      if (nodes.length === 1) note(nodes[0], g.enabled && l.visible);
    }
    // The top-level pieces of every screen, whether they showed once the game had settled and before any press: what a script that
    // hides its windows at the start leaves. It is the last word on the piece (the texts below were read after presses opened windows);
    // a piece any session showed counts as shown.
    for (const w of p.hud?.widgets ?? []) {
      const nodes = byKey.get(`${w.gui}::${w.name}`) ?? [];
      if (nodes.length === 1) settled.set(nodes[0]!, (settled.get(nodes[0]!) ?? false) || w.visible);
    }
    for (const x of p.presses) if (x.found && x.visible !== undefined) note(byPath.get(x.path), x.visible);
  }
  const hidden = new Set([...evidence].filter(([w, e]) => !settled.has(w) && e.hidden && !e.visible).map(([w]) => w));
  for (const [node, visible] of settled) if (!visible && node.parent !== null) hidden.add(widgetOf(node));
  return hidden;
}

/* --------------------------------------------------------------------------------------------- the judge --- */

const GOAL = /\b(?:rebirth|prestige|upgrade|unlock|level|xp|quest|mission|index|collection|achievement|goal|ascen\w+)\b/i;
const CURRENCY_NAME = /cash|money|coins?|gold|bucks|dollars|silver|credits?|tokens?|gems?|sheckles?|shekels?|diamonds?|dough|balance|wallet/i;
const SPEND_WORD = /\b(?:buy|purchase|upgrade|unlock|craft|hatch|rebirth|plant)\b|\$\s*\d/i;
const spaced = (s: string): string => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ');

export async function judgeGame(call: OpCall, a: Args, opts: JudgeOptions = {}): Promise<unknown> {
  const request = typeof a.request === 'string' ? a.request.trim().slice(0, 1200) : '';
  if (!request) return { error: 'request is required: what the user asked for, in plain English (for example "an original brainrot game with a lobby"). Nothing was sent to Studio.' };
  const asked = a.sessions === undefined ? MAX_SESSIONS : Number(a.sessions);
  if (!Number.isInteger(asked) || asked < 0 || asked > MAX_SESSIONS) return { error: `sessions must be a whole number 0-${MAX_SESSIONS}. Nothing was sent to Studio.` };
  const own = arr(a.ownProductIds).map(Number).filter((n) => Number.isFinite(n));
  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? JUDGE_BUDGET_MS);
  const late = (reserve = 0): boolean => now() + reserve > deadline;
  const notes: string[] = [];

  // 1. Read the place.
  const read = await readScreens(call, late);
  if (read.failed) return { error: `Could not read the player's screens (${read.failed}). Nothing was judged.`, notVerified: ['everything: Studio did not answer'] };
  const { screens } = read;
  const world = await readWorldGuis(call);
  const scriptRead = await readScripts(call, late);
  const prompts = asked > 0 && !late() ? await readPrompts(call) : [];
  const inv = await readServices(call, screens);
  const built = await readWorld(call, late);
  for (const t of built.tags) inv.seenTags.add(t);
  for (const n of built.names) inv.names.push({ where: 'Workspace', ...n });
  const idName = await sourceNames(call, inv.seenTags);
  const layout = late() ? null : await readLayout(call, screens);
  const picked = pickButtons(screens, MAX_PICKS);
  const nodeAt = new Map<string, GuiNode>();
  for (const s of screens) for (const n of all(s)) nodeAt.set(n.path, n);
  const touchables = asked >= 2 && !late() ? await findTouchables(call) : [];
  const flow = pickFlow(screens, picked.picks);
  const labels = new Map<string, string>([...picked.picks.map((p): [string, string] => [p.path, p.label]), ...(flow ? flow.inner.map((p): [string, string] => [p.path, p.label]) : [])]);

  // 2. Play it.
  const plays: Play[] = [];
  const logs: SessionLog[] = [];
  const pool = { acts: picked.picks.filter((p) => p.role === 'action').map((p) => p.path), rest: picked.picks.filter((p) => p.role !== 'action').map((p) => p.path) };
  let retry: string[] = [];
  let sessionError: string | undefined;
  let outOfTime = false;
  for (let index = 1; index <= asked; index++) {
    if (late(60_000)) { outOfTime = true; break; }
    const plan = planSession(index, pool, retry, touchables, flow ? { opener: flow.opener.path, inner: flow.inner.map((p) => p.path) } : null, asked);
    if (index > 1 && !plan.press.length && !plan.touch.length) continue;
    const raw = await runSession(call, plan);
    if (isErr(raw)) { sessionError = raw.error; logs.push({ index, seconds: plan.seconds, touched: plan.touch.length, pressed: plan.press.length, observed: false, note: clip(raw.error, 200) }); break; }
    const play = readPlay(raw, index, plan.seconds);
    plays.push(play);
    // The first session shows which windows the game keeps closed; the presses left are not spent on buttons nobody can reach.
    const closed = hiddenAtPlay(screens, plays);
    if (closed.size) for (const list of [pool.acts, pool.rest]) for (let i = list.length - 1; i >= 0; i--) { const n = nodeAt.get(list[i]!); if (n && under(n, closed)) list.splice(i, 1); }
    logs.push({ index, seconds: plan.seconds, touched: plan.touch.length, pressed: plan.press.length, observed: observed(play), ...(observed(play) ? {} : { note: `the check stopped at "${play.stage}"` }) });
    retry = [...latestOutcomes(plays.flatMap(classifyPresses)).values()].filter((o) => o.state === 'blocked').map((o) => o.path);
  }
  if (asked === 0) notes.push('No play session was run (sessions: 0), so buttons, progression and errors were not measured.');
  if (sessionError) notes.push(`A play session could not run: ${sessionError}`);

  // 3. The seven questions.
  const outcomes: PressOutcome[] = plays.flatMap(classifyPresses);
  const moves = plays.flatMap((p) => movesOf(p, labels));
  const firstSeen = plays.find(observed);
  const currencies = [...new Set((firstSeen?.before ?? firstSeen?.after ?? []).map((s) => s.name))];
  const noStats = !!firstSeen && firstSeen.before === null && firstSeen.after === null;
  const virtualInputMissing = plays.some((p) => p.presses.some((x) => /VirtualInput/i.test(x.error ?? ''))) && !plays.some((p) => p.presses.some((x) => x.activated));

  // What the player's screen showed changes what the screens' own words and positions mean: a screen a script switched on is on,
  // a window a script hid is hidden, a screen no StarterGui entry explains is drawn by a script.
  const onScreen = runtimeScreens(plays);
  for (const s of screens) if (s.props.Enabled === false && onScreen.has(s.name)) s.props.Enabled = true;
  const scriptDrawn = [...onScreen].filter((name) => !screens.some((s) => s.name === name));
  const hidden = hiddenAtPlay(screens, plays);

  const seenTexts = runtimeTexts(plays);
  const staticItems = screens.flatMap((s) => textItems(s, 'screen', hidden)).filter((i) => !replacedAtRuntime(i, seenTexts));
  const worldItems = world.guis.flatMap((g) => textItems(g, 'world'));
  const scriptWords = scriptTexts(scriptRead.scripts);
  const allItems = [...staticItems, ...worldItems, ...playerItems(plays), ...scriptWords];
  const foreignOk = wantsOtherLanguage(request);
  const purchases = purchaseHits(scriptRead.scripts, own);
  const placeholders = judgePlaceholders({
    items: allItems, purchases, foreignOk,
    scanned: { screens: screens.length, texts: staticItems.length, worldGuis: world.guis.length, worldGuisTotal: world.total, scripts: scriptRead.scripts.length, scriptsCut: scriptRead.cut },
  });

  const sourceOf = new Map<string, string>();
  for (const s of screens) { const t = typeof s.attrs.AppleLibraryGame === 'string' ? s.attrs.AppleLibraryGame : undefined; if (t && idName.get(t)) sourceOf.set(s.name, idName.get(t)!); }
  const menus: MenuCluster[] = menuClusters(screens, hidden);
  const shownScreens = new Set(screens.filter((s) => showsSomething(s, hidden)).map((s) => s.name));
  for (const name of onScreen) shownScreens.add(name);
  const runtimeButtons = Math.max(0, ...plays.filter(observed).map((p) => p.screens.filter((s) => s.enabled).reduce((n, s) => n + s.labels.filter((l) => l.visible && l.cls === 'TextButton').length, 0)));
  // A layout problem counts where a player can see it: not in a piece a script hides at the start or one the build took out of sight.
  const seen = (i: LayoutIssue): boolean => {
    const n = nodeAt.get(i.path) ?? nodeAt.get('game.StarterGui.' + i.path) ?? [...nodeAt.values()].find((x) => x.path.endsWith('.' + i.path));
    return !n || (shown(n) && !under(n, hidden) && !outOfSight(n));
  };
  const coherence = judgeCoherence({
    // Styles clash only between screens a player sees: one whose every window stays shut (a left-out feature's, kept for its code) shows no style.
    overlaps: overlaps(screens, hidden), menus, clashes: styleClashes(screens.filter((s) => shownScreens.has(s.name))), shownScreens: [...shownScreens], shownButtons: Math.max(pickButtons(screens, 0, hidden).hud, runtimeButtons),
    layout: layout && layout.filter(seen), sources: sourceOf, cutScreens: read.cut, scriptDrawn, empty: shownScreens.size === 0, played: plays.some(observed),
  });

  const noPlay = (id: 'buttons_work' | 'progression' | 'errors'): Criterion => unmeasured(id, asked === 0 ? 'no play session was run.' : outOfTime ? 'the time budget ran out before a play session could start.' : `no play session ran${sessionError ? ` (${clip(sessionError, 120)})` : ''}.`, 'Make sure Studio can start a Test session (edit mode, edit consent), then run judge_game again.');
  const buttons = !plays.length
    ? noPlay('buttons_work')
    : judgeButtons({ outcomes, labels, total: picked.total, skipped: picked.skipped, virtualInputMissing, covers: coveringPieces(screens, hidden) });
  if (picked.total - picked.skipped.length > PRESSES_PER_SESSION * MAX_SESSIONS && buttons.measured) buttons.evidence.push(`Sampled: ${picked.total - picked.skipped.length} testable buttons, at most ${PRESSES_PER_SESSION * MAX_SESSIONS} can be pressed in ${MAX_SESSIONS} sessions.`);
  const moneyLabel = (n: GuiNode): boolean => (CURRENCY_NAME.test(spaced(n.name)) || /^\s*\$/.test(textOf(n))) && /\d/.test(textOf(n)) && hasText(n) && !isButton(n);
  const currencyScreens = screens.filter((s) => s.props.Enabled !== false).flatMap((s) => all(s).filter((n) => moneyLabel(n) && shown(n)).slice(0, 1).map((n) => ({ screen: s.name, text: textOf(n), path: readable(n.path, 'StarterGui') })));
  const goals = [...new Set(screens.flatMap(all).filter((n) => isButton(n) || (hasText(n) && textOf(n).trim())).map(labelOf).filter((l) => GOAL.test(l)))];
  const errors = !plays.length ? noPlay('errors') : judgeErrors(plays, remoteRequires(scriptRead.scripts));
  const progression = !plays.length
    ? noPlay('progression')
    : judgeProgression({ plays, moves, goals, currencies, noStats, counters: [...new Set([...plays.flatMap((p) => p.hud?.afterWait ?? []).map((c) => c.name), ...currencyScreens.map((c) => c.path)])], prompts,
      spendTried: [...latestOutcomes(outcomes).values()].filter((o) => (o.state === 'works' || o.state === 'silent') && SPEND_WORD.test(labels.get(o.path) ?? lastName(o.path))).length,
      knownLoop: opts.knownLoop, cleanRun: errors.ok && errors.measured });
  const stood = plays.filter(observed).flatMap((p) => (['start', 'afterWait', 'finish'] as const)
    .flatMap((k) => { const pos = p.character?.[k]; return pos ? [{ when: `${k === 'start' ? 'at the spawn' : k === 'afterWait' ? `after ${p.seconds} s` : 'after the touches'} in session ${p.index}`, pos }] : []; }));
  const construction = judgeConstruction({ ...built.facts, stood });

  const sourceId = (s: GuiNode): string | undefined => (typeof s.attrs.AppleLibraryGame === 'string' ? s.attrs.AppleLibraryGame : undefined);
  const shopWindows = screens.filter((s) => s.props.Enabled !== false).flatMap((s) => all(s).filter((n) => !isButton(n) && !hasText(n) && /shop|store|market/i.test(n.name) && (n === s || n.parent === s)).map((n) => ({ screen: s.name, name: n.name, path: n.path, ...(sourceId(s) ? { source: sourceId(s) } : {}) })));
  const counts = new Map<string, number>();
  for (const s of screens) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  const fit: FitInput = {
    request, names: inv.names.map(({ tag: t, ...n }) => ({ ...n, ...(t && idName.get(t) ? { source: idName.get(t) } : {}) })), texts: allItems, currencies, currencyScreens, shopWindows, duplicateScreens: [...counts].filter(([, n]) => n > 1).map(([k]) => k),
    menus, sourceNames: [...idName.values()], sourceCount: inv.seenTags.size, scriptNames: [...new Set(scriptRead.scripts.map((x) => lastName(x.path)))].slice(0, 600),
  };
  const fitness = judgeFit(fit);

  const criteria: Criterion[] = [placeholders, coherence, buttons, progression, errors, construction, fitness];
  const notVerified = [
    'how the game LOOKS (no screenshot was judged; geometry comes from authored positions and from which pieces the test player had on, and pieces a layout object or a script places were not placed)',
    ...(stood.length ? [] : ['where the player stands during play (falling out of the world is inferred from the ground under the spawn)']),
    'effects of a press that take longer than about a second, and buttons inside windows beyond the one shop flow tried',
    ...(read.over ? [`${read.over} more screens beyond the ${MAX_SCREENS} switched on and ${MAX_OFF_SCREENS} switched off that were read`] : []),
    ...(scriptRead.failed ? [`scripts (Studio did not return them: ${clip(scriptRead.failed, 100)})`] : []),
    ...(built.facts.notChecked ? [`${built.facts.notChecked} world objects were not checked`] : []),
    ...(layout === null ? ['layout at phone and desktop size'] : []),
    ...notes,
  ];
  const verdict = compose(criteria, notVerified);
  const coverage = {
    screens: screens.length, screensCut: read.cut, texts: staticItems.length, worldGuis: world.guis.length, scripts: scriptRead.scripts.length,
    worldObjects: built.facts.itemsSeen, sourceGames: inv.seenTags.size, buttonsOnFirstScreen: picked.total,
  };
  return withinBudget({
    verdict: verdict.verdict, score: verdict.score, forUser: verdict.forUser, fixes: verdict.fixes,
    criteria: criteria.map(({ plain: _plain, ...c }) => c),
    sessions: logs, coverage, notVerified: verdict.notVerified,
    // Ready is the end of the flow: the next thing the user hears is the answer, not more checks.
    next: verdict.verdict === 'ready'
      ? 'The game is ready. Answer the user now, from forUser, in your own friendly words: what the player will see and do. Change nothing more and run no further checks.'
      : 'Fix what fixes lists, in its order, then call judge_game again (at most three rounds in all).',
  });
}

/** The answer is read by a model and re-sent on every later step: when it is long, the evidence gives way, never the verdict or the fixes. */
export const ANSWER_BUDGET_CHARS = 20_000;
export function withinBudget<T extends { criteria: { evidence: string[] }[] }>(answer: T): T {
  for (const keep of [8, 6, 4, 3, 2]) {
    if (JSON.stringify(answer).length <= ANSWER_BUDGET_CHARS) break;
    for (const c of answer.criteria) if (c.evidence.length > keep) c.evidence = [...c.evidence.slice(0, keep - 1), `(${c.evidence.length - keep + 1} more)`];
  }
  return answer;
}

/** The one line the activity feed shows for this tool, in words a young player reads. */
export function judgeSummary(_args: Args, result: unknown, failed: boolean): string {
  if (failed) return 'Could not check the game like a player would';
  const r = rec(result);
  return r.verdict === 'ready' ? 'Checked the game like a player would: it is ready' : `Checked the game like a player would: not ready yet (${typeof r.score === 'number' ? r.score : 0} out of 100)`;
}
