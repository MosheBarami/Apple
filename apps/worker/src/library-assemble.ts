import type { AgentCtx } from './tools';
import {
  GAME_ID, connectMenus, libraryDefaultParent, libraryDependencies, libraryFolders, libraryImportRaw, libraryMaterials, libraryReady, librarySafetyCopy,
  MENUS_CONNECTED,
} from './local-owner-corpus';
import { screenRoots } from './menu-binder';
import { plainLibraryThing } from './run-idle';
import { ensureSpawn, fitCounts, MAX_COPIES, moveBy, newPlaceState, placeGroup, placeModels, settleGroup, type PlaceSpec, type Vec3 } from './library-placement';

/**
 * FROM THE OWNER'S SAVED GAMES, ONE SYSTEM AT A TIME.
 *
 *   install_owner_system  {gameId}                 one ready-made system, with everything it needs to work
 *
 * A whole game is built by plan_game and build_game (game-plan.ts). assembleOwnerGame below is the older random-blueprint builder
 * (niche, theme, seed): it is no longer one of the agent's tools and stays only because the shared pieces here (the plain words,
 * the install steps) and its own tests use it.
 *
 * The library (the owner's Mac, through the paired plugin) decides WHAT: an install plan for one saved game. This file only carries
 * the plan out in Studio and says what happened in words a young player reads.
 * Nothing here returns a tool name, a path, an id or a count in the text meant for the user (`forUser`, the feed line).
 */

/* ------------------------------------------------------------------------------- plain words --- */

/** A game's name as the owner knows it: file-name underscores and the library's own copy markers, "(2)", are not part of it. */
export const displayName = (v: unknown, max = 80): string => plainText(typeof v === 'string' ? v.replace(/_+/g, ' ') : v, max).replace(/\s*\(\d+\)\s*$/, '');
/** Text the library wrote for a reader, made safe to show: one line, no control characters, no paths or long ids. */
export function plainText(v: unknown, max = 160): string {
  return typeof v === 'string'
    ? v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/(?:\/[\w #.()-]+){2,}/g, ' ').replace(/\b[0-9a-f]{10,}\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}
/** One plain sentence for whatever went wrong, whatever the engineering text said. */
export function plainProblem(raw: unknown): string {
  const t = String(raw ?? '');
  if (/action must be|unknown action|route must be|not supported by/i.test(t)) return 'The StudPilot plugin in Roblox Studio needs updating before it can do that.';
  if (/not reachable|start it on the Mac|live paired|gateway|library refused|owner library/i.test(t)) return 'StudPilot could not reach your saved games right now.';
  if (/did not respond|timed? ?out/i.test(t)) return 'Roblox Studio took too long to answer.';
  if (/not connected|disconnected/i.test(t)) return 'Roblox Studio stopped answering.';
  return 'Something stopped it from finishing.';
}
export const noCopy = (technical: string) => ({ error: 'StudPilot could not save a copy of your place first, so nothing was changed. Tell the user in one plain sentence.', technical });
export const list = (items: readonly string[], most = 6): string => {
  const shown = items.slice(0, most);
  const text = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : (shown[0] ?? '');
  return items.length > most ? `${shown.join(', ')} and more` : text;
};
export const sentence = (t: string): string => t.replace(/[\s.;,]+$/, '');

type Works = 'yes' | 'partly' | 'looks only';
const asWorks = (v: unknown): Works => (v === 'yes' || v === 'looks only' ? v : 'partly');
const SERVICE_PARENT = /^game\.[\x20-\x7e]{1,300}$/;
const LIBRARY_PATH = /^\/[^\x00-\x1f\x7f]{0,1023}$/;
const ROUTE_TIMEOUT_MS = 60_000;

async function fromLibrary(ctx: AgentCtx, route: 'install' | 'blueprint', params: Record<string, string | number>): Promise<{ data: Record<string, unknown> } | { error: string }> {
  const out = await ctx.execStudioOp({ op: 'query_owner_library', action: 'route', route, params }, ROUTE_TIMEOUT_MS);
  return out.ok ? { data: (out.data ?? {}) as Record<string, unknown> } : { error: out.error ?? 'Owner library refused the request' };
}

/* ---------------------------------------------------------------------------------- install --- */

export interface InstallStep { path: string; mode: 'self' | 'children'; parent: string; what: string; optional: boolean }
export interface InstallPlan { game: string; name: string; kind: string; steps: InstallStep[]; works: Works; note: string }

/** The library's install plan, kept to what Studio can be asked to do. */
export function readInstallPlan(raw: Record<string, unknown>): InstallPlan | { error: string } {
  const steps: InstallStep[] = [];
  for (const s of (Array.isArray(raw.steps) ? raw.steps : []).slice(0, 100) as Record<string, unknown>[]) {
    if (!s || typeof s.path !== 'string' || !LIBRARY_PATH.test(s.path) || (s.mode !== 'self' && s.mode !== 'children') || typeof s.parent !== 'string' || !SERVICE_PARENT.test(s.parent)) continue;
    steps.push({ path: s.path, mode: s.mode, parent: s.parent, what: plainText(s.what, 140) || 'a part of it', optional: s.optional === true });
  }
  if (!steps.length) return { error: 'There is nothing in that saved game that can be added on its own.' };
  return { game: String(raw.game ?? ''), name: displayName(raw.name) || 'That saved game', kind: String(raw.kind ?? 'system-pack'), steps, works: asWorks(raw.works), note: plainText(raw.note, 200) };
}

interface StepResult { what: string; parent?: string; state: 'added' | 'already' | 'have' | 'failed'; problem?: string; inserted: string[]; suspicious: unknown[] }

const lastName = (path: string) => (path.split('/').filter(Boolean).pop() ?? '').replace(/#\d+$/, '');
/** "Leaderstats [DONT DRAG IF YOU HAVE THIS ALREADY]" is called "Leaderstats" in a query. */
const shortName = (path: string) => lastName(path).replace(/\s*[[(<{].*$/, '').trim();

/** An optional step (a leaderstats script that says do not add it if you have one) is skipped when the place already has that. */
async function placeAlreadyHas(ctx: AgentCtx, step: InstallStep, memo: { leaderstats?: boolean }): Promise<boolean> {
  const name = shortName(step.path);
  if (name.length >= 3) {
    const same = await ctx.execStudioOp({ op: 'query_instances', name, isA: 'LuaSourceContainer', limit: 1 });
    if (same.ok && Array.isArray((same.data as { matches?: unknown[] } | undefined)?.matches) && ((same.data as { matches: unknown[] }).matches).length > 0) return true;
  }
  if (!/leaderstat/i.test(`${step.path} ${step.what}`)) return false;
  if (memo.leaderstats === undefined) {
    const found = await ctx.execStudioOp({ op: 'search_scripts', query: 'leaderstats', maxResults: 1 });
    memo.leaderstats = found.ok && Array.isArray((found.data as { matches?: unknown[] } | undefined)?.matches) && ((found.data as { matches: unknown[] }).matches).length > 0;
  }
  return memo.leaderstats;
}

/** Every step of a plan, in order. A step that fails is recorded and the next one still runs; Studio going away stops it. */
async function runSteps(ctx: AgentCtx, gameId: string, plan: InstallPlan, until: () => boolean) {
  const results: StepResult[] = [];
  const memo: { leaderstats?: boolean } = {};
  let stopped: 'disconnected' | 'time' | undefined;
  for (const step of plan.steps) {
    if (until()) { stopped = 'time'; break; }
    if (step.optional && await placeAlreadyHas(ctx, step, memo)) { results.push({ what: step.what, state: 'have', inserted: [], suspicious: [] }); continue; }
    // A place file's own Lighting and Workspace settings only come with a whole place; a system added to a game leaves the game's own alone.
    const apply = plan.kind === 'place' && step.mode === 'children' && (step.path === '/Lighting' || step.path === '/Workspace');
    // onlyMissing: a second install skips what the place already holds instead of adding "(2)" copies.
    let out = await libraryImportRaw(ctx, gameId, step.path, step.mode, step.parent, apply, false, true);
    if (!out.ok && out.failure !== 'transport' && await libraryFolders(ctx, step.parent)) out = await libraryImportRaw(ctx, gameId, step.path, step.mode, step.parent, apply, false, true);
    if (!out.ok) {
      if (out.failure === 'transport') { stopped = 'disconnected'; break; }
      results.push({ what: step.what, state: 'failed', problem: out.error, inserted: [], suspicious: [] });
      continue;
    }
    const d = (out.data ?? {}) as Record<string, unknown>;
    const added = (Number(d.roots) || 0) > (Number(d.skipped) || 0);
    results.push({ what: step.what, parent: step.parent, state: added ? 'added' : 'already', inserted: Array.isArray(d.inserted) ? d.inserted.filter((p): p is string => typeof p === 'string') : [], suspicious: Array.isArray(d.suspicious) ? d.suspicious : [] });
  }
  return { results, stopped };
}

function installWords(plan: InstallPlan, r: { added: string[]; failed: number; menus: boolean; saves: boolean }): string {
  const parts: string[] = [];
  parts.push(r.added.length ? `${plan.name} is now in your game from your saved games: ${list([...new Set(r.added.map(sentence))])}.` : `${plan.name} was already in your game, so nothing changed.`);
  if (r.added.length) {
    // The library says in its own plain words what was lost with the code; the buttons StudPilot connected only open and close menus.
    const caveat = plan.works === 'yes' ? '' : r.menus
      ? 'Its menus open and close, but part of its code was stripped out, so the rest will not respond until it is built again.'
      : plan.note || (plan.works === 'looks only' ? 'It looks right but has no working code behind it.' : 'Most of it works, but a few parts may stay quiet.');
    if (caveat) parts.push(sentence(caveat) + '.');
    else if (plan.note) parts.push(sentence(plan.note) + '.');
  }
  if (r.failed) parts.push('One part of it could not be added.');
  if (r.saves) parts.push('Progress saving will work once the game is published.');
  return parts.join(' ');
}

export const SAVES = /(?:^|\.)AppleStudioData$/;

export async function installOwnerSystem(ctx: AgentCtx, a: Record<string, unknown>) {
  const blocked = libraryReady(ctx);
  if (blocked) return { error: plainProblem(blocked) + ' ' + blocked };
  const gameId = String(a.gameId ?? '');
  if (!GAME_ID.test(gameId)) return { error: 'gameId must be a library game id (8-64 hex characters) from browse_owner_library.' };
  const fetched = await fromLibrary(ctx, 'install', { id: gameId });
  if ('error' in fetched) return { error: `${plainProblem(fetched.error)} Tell the user in one plain sentence.`, technical: fetched.error };
  const plan = readInstallPlan(fetched.data);
  if ('error' in plan) return plan;
  const copy = await librarySafetyCopy(ctx, 'before adding a feature from your saved games');
  if ('error' in copy) return noCopy(copy.error);
  const { results, stopped } = await runSteps(ctx, gameId, plan, () => false);
  const added = results.filter((r) => r.state === 'added'), failed = results.filter((r) => r.state === 'failed');
  // A pack's world pieces arrive at their old coordinates; they go on open ground near the play area, together.
  const world = plan.kind === 'place' ? [] : added.filter((r) => r.parent === 'game.Workspace').flatMap((r) => r.inserted);
  if (world.length && !stopped) await placeGroup(ctx, world, newPlaceState(), 0, Date.now() + 120_000);
  const screens = screenRoots(added.flatMap((r) => r.inserted)).map((path) => ({ path, works: plan.works }));
  const wired = await connectMenus(ctx, screens);
  const changed = added.length > 0 || (wired?.wired.length ?? 0) > 0;
  if (!added.length && (failed.length || stopped)) {
    return { error: `${stopped ? plainProblem('disconnected') : 'StudPilot could not add it to your game.'} Tell the user in one plain sentence; nothing was added.`, technical: failed[0]?.problem };
  }
  const saves = added.some((r) => r.inserted.some((p) => SAVES.test(p)));
  const suspicious = results.flatMap((r) => r.suspicious).slice(0, 50);
  return {
    system: plan.name, works: plan.works, changed,
    forUser: installWords(plan, { added: added.map((r) => r.what), failed: failed.length + (stopped ? 1 : 0), menus: (wired?.wired.length ?? 0) > 0, saves }),
    steps: results.map((r) => ({ what: r.what, state: r.state, ...(r.problem ? { problem: plainProblem(r.problem) } : {}) })),
    ...(suspicious.length ? { suspicious } : {}),
    ...(wired?.wired.length ? { menus: MENUS_CONNECTED } : {}),
    note: 'Answer from forUser in your own friendly words. Name no tools, paths, counts or ids. If a script in it can load code from the internet or ask players to pay (see suspicious), say so in one plain sentence.',
  };
}

/* ---------------------------------------------------------------------------------- assemble --- */

const ROLES = ['world', 'core', 'system', 'ui-kit', 'characters', 'props', 'fx', 'music', 'sfx', 'lighting'] as const;
type Role = (typeof ROLES)[number];
const ROLE_WORDS: Record<Role, string> = {
  world: 'the map', core: 'the main game', system: 'one of its features', 'ui-kit': 'the menus', characters: 'the characters', props: 'the decorations',
  fx: 'the effects', music: 'the music', sfx: 'the sound effects', lighting: 'the sky and lighting',
};
const VISUAL = new Set<Role>(['world', 'core', 'ui-kit', 'characters', 'props', 'fx']);
const WITH_DEPENDENCIES = new Set<Role>(['core', 'ui-kit', 'characters']);
const PLACED = new Set<Role>(['characters', 'props', 'fx']);
const ON = new Set(['ground', 'spawn', 'plots']);
const MAX_COMPONENTS = 60;
const MAX_PLACED_TOTAL = 80;
/** The DO answering this call may run up to 15 minutes; a plan that is not done by then is finished as far as it got. */
export const ASSEMBLE_BUDGET_MS = 12 * 60_000;

export interface Component {
  role: Role; gameId: string; game: string; path: string; mode: 'self' | 'children'; parent: string; install: boolean;
  place?: PlaceSpec; works: Works; why: string;
}
export interface Blueprint { title: string; look: string; components: Component[]; unusable: number }

/** A core piece's offset {x, y, z} in studs, or nothing when it is not three plain numbers. */
function readOffset(v: unknown): Vec3 | undefined {
  const o = v as Record<string, unknown> | undefined;
  const n = [o?.x, o?.y, o?.z].map((k) => (typeof k === 'number' ? k : NaN));
  return n.every((k) => Number.isFinite(k) && Math.abs(k) <= 20_000) && n.some((k) => k !== 0) ? [n[0]!, n[1]!, n[2]!] : undefined;
}

/** The library's blueprint, kept to what can be carried out. A piece that cannot be read is dropped and counted. */
export function readBlueprint(raw: Record<string, unknown>): Blueprint | { error: string } {
  const rows = Array.isArray(raw.components) ? raw.components.slice(0, MAX_COMPONENTS) as Record<string, unknown>[] : [];
  const components: Component[] = [];
  let unusable = 0;
  for (const c of rows) {
    const role = ROLES.find((r) => r === c?.role);
    const install = c?.install === true;
    const mode = c?.mode === 'children' ? 'children' : 'self';
    const path = typeof c?.path === 'string' ? c.path : '';
    if (!role || typeof c.gameId !== 'string' || !GAME_ID.test(c.gameId) || (!install && !LIBRARY_PATH.test(path))) { unusable += 1; continue; }
    const parent = typeof c.parent === 'string' && SERVICE_PARENT.test(c.parent) ? c.parent : libraryDefaultParent(path, mode);
    const place = c.place && typeof c.place === 'object' ? c.place as Record<string, unknown> : undefined;
    components.push({
      role, gameId: c.gameId, game: displayName(c.game) || 'a saved game', path, mode, parent, install, works: asWorks(c.works), why: plainText(c.why, 200),
      ...(place ? { place: {
        count: Math.max(1, Math.min(MAX_COPIES, Math.floor(Number(place.count)) || 1)),
        on: ON.has(String(place.on)) ? place.on as PlaceSpec['on'] : 'ground',
        spread: Math.max(10, Math.min(400, Number(place.spread) || 60)),
        ...(role === 'core' && readOffset(place.offset) ? { offset: readOffset(place.offset) } : {}),
      } } : {}),
    });
  }
  if (!components.length) return { error: 'The plan for this game came back empty.' };
  return { title: plainText(raw.title, 60) || 'Your new game', look: plainText(raw.look, 30) || 'studded', components, unusable };
}

const RANK = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;
/** World first, then the core, systems, kits, the models to place, effects, sounds and last the sky. Order inside a role stays as planned. */
export const inBuildOrder = (components: readonly Component[]): Component[] =>
  components.map((c, i) => [c, i] as const).sort((x, y) => RANK[x[0].role] - RANK[y[0].role] || x[1] - y[1]).map(([c]) => c);

const TEMPLATE_WORKSPACE = new Set(['Baseplate', 'SpawnLocation', 'Terrain', 'Camera']);
/** A new place holds only the template's baseplate and spawn: the world may replace them. A place with anything else keeps it. */
export async function workspaceIsFresh(ctx: AgentCtx): Promise<boolean> {
  const out = await ctx.execStudioOp({ op: 'get_tree', root: 'game.Workspace', maxDepth: 1, maxNodes: 40 });
  if (!out.ok) return false;
  const kids = ((out.data as { root?: { children?: { name?: unknown; class?: unknown }[] } } | undefined)?.root?.children ?? []);
  return kids.every((k) => TEMPLATE_WORKSPACE.has(String(k.name)) || k.class === 'Terrain' || k.class === 'Camera');
}

interface Part { role: Role; game: string; why: string; ok: boolean; placed?: number; wanted?: number; stopped?: string; problem?: string; inserted: string[]; detail?: Record<string, unknown> }

export interface AssembleOptions { budgetMs?: number; now?: () => number }

/** The map, the game itself, the sky and the sounds are the same few sentences for every plan; the library's own line per service slot would repeat them a dozen times. */
const ROLE_LINE: Partial<Record<Role, (game: string) => string>> = {
  world: (g) => `The map comes from ${g}`,
  core: (g) => `The game itself, with its rules, menus and buttons, comes from ${g}`,
  lighting: () => 'A colourful sky and lighting',
  music: () => 'Background music',
  sfx: () => 'Sounds for what players do',
};
function assembleWords(title: string, parts: readonly Part[], games: readonly string[], extra: { menus: boolean; saves: boolean; timedOut: boolean; disconnected: boolean }): string {
  const made = parts.filter((p) => p.ok);
  const lines: string[] = [`${title} is ready in your place: a bright, studded game put together from ${games.length > 1 ? 'your saved games' : 'a saved game'}${games.length ? ` (${list(games, 8)})` : ''}.`];
  const seen = new Set<string>(), said = new Set<Role>();
  const items: string[] = [];
  for (const p of made) {
    const fixed = ROLE_LINE[p.role];
    const line = fixed ? (said.has(p.role) ? '' : fixed(p.game)) : sentence(p.why);
    said.add(p.role);
    if (line && !seen.has(line)) { seen.add(line); items.push(line); }
  }
  if (items.length) lines.push(`Here is what your players get. ${items.slice(0, 12).map((t) => `${sentence(t)}.`).join(' ')}`);
  if (extra.menus) lines.push('Screens that came without working code had their buttons connected, so their menus open and close.');
  const missing = [...new Set(parts.filter((p) => !p.ok).map((p) => ROLE_WORDS[p.role]))];
  if (missing.length) lines.push(`${list(missing)} could not be added, so the game is missing ${missing.length > 1 ? 'those' : 'that'}.`);
  if (extra.disconnected) lines.push('Roblox Studio stopped answering part-way, so the rest was not added.');
  else if (extra.timedOut) lines.push('StudPilot stopped part-way to keep things quick, so a few extras are missing.');
  if (extra.saves) lines.push('Progress saving will work once the game is published.');
  return lines.join(' ');
}

export async function assembleOwnerGame(ctx: AgentCtx, a: Record<string, unknown>, opts: AssembleOptions = {}) {
  const now = opts.now ?? Date.now;
  const blocked = libraryReady(ctx);
  if (blocked) return { error: plainProblem(blocked) + ' ' + blocked };
  const niche = plainText(a.niche, 100);
  if (!niche) return { error: 'niche is required: the kind of game in plain words, such as "tycoon", "brainrot collecting" or "obby".' };
  const theme = plainText(a.theme, 100);
  const seedGiven = a.seed !== undefined && a.seed !== '' && Number.isFinite(Number(a.seed));
  const seed = seedGiven ? Math.abs(Math.floor(Number(a.seed))) % 1_000_000 : Math.floor(Math.random() * 1_000_000);   // the library takes 0..1,000,000
  const fetched = await fromLibrary(ctx, 'blueprint', { niche, ...(theme ? { theme } : {}), seed });
  if ('error' in fetched) return { error: `${plainProblem(fetched.error)} Tell the user in one plain sentence; nothing was built.`, technical: fetched.error };
  const plan = readBlueprint(fetched.data);
  if ('error' in plan) return { error: `${plan.error} Tell the user in one plain sentence that the library has nothing for that kind of game yet; nothing was built.` };
  const copy = await librarySafetyCopy(ctx, 'before building a game from your saved games');
  if ('error' in copy) return noCopy(copy.error);

  const started = now(), deadline = started + (opts.budgetMs ?? ASSEMBLE_BUDGET_MS);
  const late = () => now() > deadline;
  const ordered = inBuildOrder(plan.components);
  // The counts of every model to place are cut together so one plan never puts hundreds into the world.
  const placeable = ordered.filter((c) => PLACED.has(c.role) && !c.install);
  const counts = fitCounts(placeable.map((c) => c.place?.count ?? 1), MAX_PLACED_TOTAL);
  const countFor = new Map(placeable.map((c, i) => [c, counts[i]!]));

  const parts: Part[] = [];
  const state = newPlaceState();
  const screens = new Map<string, string>();   // a screen and what the library says about where it came from
  const coreRoots: string[] = [];
  const materials = new Set<string>();
  let fresh = await workspaceIsFresh(ctx);
  let worldGame: string | undefined;
  let coreSettled = false;
  let disconnected = false, timedOut = false, saves = false;

  const settleCore = async () => {
    if (coreSettled) return;
    coreSettled = true;
    if (coreRoots.length && worldGame) await settleGroup(ctx, coreRoots, state);
  };

  for (const c of ordered) {
    if (disconnected) break;
    if (late()) { timedOut = true; parts.push({ role: c.role, game: c.game, why: '', ok: false, problem: 'out of time', inserted: [] }); continue; }
    if (RANK[c.role] > RANK.core) await settleCore();
    const part: Part = { role: c.role, game: c.game, why: c.why, ok: false, inserted: [] };
    parts.push(part);
    try {
      if (c.install || c.role === 'system') {
        const got = await fromLibrary(ctx, 'install', { id: c.gameId });
        if ('error' in got) { part.problem = got.error; continue; }
        const sys = readInstallPlan(got.data);
        if ('error' in sys) { part.problem = sys.error; continue; }
        const { results, stopped } = await runSteps(ctx, c.gameId, sys, late);
        const added = results.filter((r) => r.state === 'added');
        part.inserted = added.flatMap((r) => r.inserted);
        const world = sys.kind === 'place' ? [] : added.filter((r) => r.parent === 'game.Workspace').flatMap((r) => r.inserted);
        if (world.length && !stopped) {
          await settleCore();
          const where = await placeGroup(ctx, world, state, seed, deadline, now);
          if (where === 'disconnected') disconnected = true;
        }
        part.ok = added.length > 0 || results.some((r) => r.state === 'already' || r.state === 'have');
        if (!part.ok) part.problem = results.find((r) => r.state === 'failed')?.problem ?? 'nothing could be added';
        for (const p of screenRoots(part.inserted)) screens.set(p, screens.get(p) ?? sys.works);
        saves ||= part.inserted.some((p) => SAVES.test(p));
        if (stopped === 'disconnected') disconnected = true; else if (stopped === 'time') timedOut = true;
        part.detail = { steps: results.map((r) => ({ what: r.what, state: r.state })) };
        continue;
      }
      const parent = c.role === 'music' || c.role === 'sfx' ? 'game.SoundService' : c.parent;
      const apply = c.mode === 'children' && (c.path === '/Lighting' || c.path === '/Workspace');
      // A world (or a core's own map) replaces the template's baseplate and spawn in a new place; anything else in it is kept.
      const replace = (c.role === 'lighting' && c.mode === 'children' && c.path === '/Lighting')
        || (fresh && (c.role === 'world' || c.role === 'core') && c.mode === 'children' && c.path === '/Workspace' && parent === 'game.Workspace');
      let out = await libraryImportRaw(ctx, c.gameId, c.path, c.mode, parent, apply, replace);
      if (!out.ok && out.failure !== 'transport' && await libraryFolders(ctx, parent)) out = await libraryImportRaw(ctx, c.gameId, c.path, c.mode, parent, apply, replace);
      if (!out.ok) { part.problem = out.error; if (out.failure === 'transport') disconnected = true; continue; }
      part.ok = true;
      const d = (out.data ?? {}) as Record<string, unknown>;
      part.inserted = Array.isArray(d.inserted) ? d.inserted.filter((p): p is string => typeof p === 'string') : [];
      if (replace) fresh = false;
      if (c.role === 'world') worldGame ??= c.gameId;
      // A core's map pieces are all in the plan and move together; a helper imported for one of them would stand apart from the moved ones.
      const mapPiece = c.role === 'core' && parent === 'game.Workspace';
      if (mapPiece && c.gameId !== worldGame) {
        const moved = c.place?.offset ? await moveBy(ctx, part.inserted, c.place.offset) : undefined;
        if (moved?.gone) disconnected = true;
        else if (moved) part.detail = { moved: moved.moved, notMoved: moved.failed };
        else coreRoots.push(...part.inserted);
      }
      if (VISUAL.has(c.role) && !materials.has(c.gameId)) { materials.add(c.gameId); await libraryMaterials(ctx, c.gameId); }
      if (c.mode === 'self' && WITH_DEPENDENCIES.has(c.role) && !mapPiece) await libraryDependencies(ctx, c.gameId, c.path);
      for (const p of screenRoots(part.inserted)) screens.set(p, screens.get(p) ?? c.works);
      saves ||= part.inserted.some((p) => SAVES.test(p));
      if (PLACED.has(c.role) && part.inserted.length && (c.place || c.role !== 'fx')) {
        const spec: PlaceSpec = { count: countFor.get(c) ?? 1, on: c.place?.on ?? 'ground', spread: c.place?.spread ?? 60 };
        const outcome = await placeModels(ctx, part.inserted, spec, state, seed, deadline, now);
        part.placed = outcome.placed; part.wanted = outcome.wanted;
        if (outcome.stopped) part.stopped = outcome.stopped;
        if (outcome.stopped === 'disconnected') disconnected = true;
        if (outcome.stopped === 'time') timedOut = true;
        // Nothing found room, or it could not be arranged: the import is not counted as part of the game.
        if (outcome.placed === 0 && outcome.stopped && outcome.stopped !== 'not_arrangeable') part.ok = false;
      }
    } catch (e) {
      part.ok = false;
      part.problem = e instanceof Error ? e.message : String(e);
    }
  }
  if (!disconnected) await settleCore();
  const spawned = disconnected ? false : await ensureSpawn(ctx, state).catch(() => false);
  const wired = disconnected ? undefined : await connectMenus(ctx, [...screens].map(([path, works]) => ({ path, works })));

  const good = parts.filter((p) => p.ok);
  const games = [...new Set(good.map((p) => p.game))];
  const menus = (wired?.wired.length ?? 0) > 0;
  const changed = good.length > 0;
  const seconds = Math.round((now() - started) / 1000);
  if (!changed) {
    return { error: `${disconnected ? plainProblem('disconnected') : 'StudPilot could not build a game from your saved games this time.'} Tell the user in one plain sentence; nothing was added.`, technical: parts.find((p) => p.problem)?.problem };
  }
  const problems = [...new Set(parts.filter((p) => !p.ok).map((p) => `${ROLE_WORDS[p.role]} from ${p.game}`))];
  return {
    title: plan.title, look: plan.look, seed, changed,
    forUser: assembleWords(plan.title, parts, games, { menus, saves, timedOut, disconnected }),
    gamesUsed: games,
    couldNotAdd: problems,
    ...(menus ? { menus: MENUS_CONNECTED } : {}),
    ...(spawned ? { spawn: 'Added a spawn pad on the map, because the map had none.' } : {}),
    parts: parts.map((p) => ({ part: p.role, from: p.game, ok: p.ok, ...(p.wanted !== undefined ? { placed: p.placed, wanted: p.wanted } : {}), ...(p.stopped ? { stopped: p.stopped } : {}), ...(p.problem ? { problem: plainProblem(p.problem), technical: p.problem.slice(0, 200) } : {}), ...(p.detail ? p.detail : {}) })),
    seconds,
    note: 'The build is finished. Check it once with play_check (as a player), then answer from forUser in your own friendly words: what the player sees and does, and the one thing that could not be added, if any. The imported games keep their own scripts and screens as they are. Name no tools, paths, counts or ids. Use the same seed to get this exact plan again, another seed for a different game.',
  };
}

/* --------------------------------------------------------------------- the feed's one plain line --- */

const short = (t: string, n = 70) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const errorLine = (r: Record<string, unknown>) => {
  const first = String(r.error ?? '').split(/(?<=[.!?])\s/)[0] ?? '';
  return /Tell the user|library id|niche is required|hex/i.test(first) ? 'StudPilot could not do that with your saved games' : sentence(first).slice(0, 120);
};
export function installSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (failed) return `✗ ${errorLine(r)}`;
  return r.changed === true ? `✓ Added ${short(String(r.system ?? 'a feature'))} to your game` : `✓ ${short(String(r.system ?? 'That feature'))} was already in your game`;
}
export function assembleSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (failed) return `✗ ${errorLine(r)}`;
  const title = short(String(r.title ?? 'your game'), 60);
  return Array.isArray(r.couldNotAdd) && r.couldNotAdd.length ? `✓ Built ${title} from your saved games, with a few parts left out` : `✓ Built ${title} from your saved games`;
}

/** The same one plain line for the older library tools, so the whole feed reads alike. */
export function importSummary(args: Record<string, unknown>, result: unknown, failed: boolean): string {
  if (failed) return `✗ ${plainProblem((result as Record<string, unknown> | undefined)?.error)}`;
  return `✓ Added ${plainLibraryThing(String(args.path ?? ''))} from your saved games`;
}
export function recreateSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (failed) return `✗ ${plainProblem(r.error)}`;
  return `✓ Rebuilt ${short(displayName(r.game, 60) || 'a saved game')} from your saved games`;
}
export function browseSummary(_args: Record<string, unknown>, _result: unknown, failed: boolean): string {
  return failed ? '✗ StudPilot could not look through your saved games' : '✓ Looked through your saved games';
}
