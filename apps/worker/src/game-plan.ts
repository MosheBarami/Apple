import type { PropValue } from '@apple/shared';
import type { AgentCtx } from './tools';
import {
  GAME_ID, connectMenus, libraryDefaultParent, libraryFolders, libraryImportRaw, libraryMaterials, libraryReady, librarySafetyCopy, MENUS_CONNECTED,
} from './local-owner-corpus';
import { screenRoots } from './menu-binder';
import { ASSEMBLE_BUDGET_MS, list, noCopy, plainProblem, plainText, SAVES, sentence, workspaceIsFresh } from './library-assemble';
import { ask, ensureSpawn, newPlaceState, placeRegion, type Vec3 } from './library-placement';
import { applyEdits, checkSyntax, sourceHash, type ScriptEdit } from './luau-review';
import { SILENCE_LUAU, parseSilenced } from './private-audio';

/**
 * THE TWO STEPS OF AN ORIGINAL GAME.
 *
 *   plan_game   {request, theme?, features?, seed?}   the library works out a DESIGN: one working core game of the right kind, the
 *                                                     features the request needs, what to leave out, which regions and screens to
 *                                                     keep, the texts to fix and the content to give a new theme
 *   build_game  {design?}                             carries that design out exactly, and hands the model the checklist for the rest
 *
 * The library (the owner's Mac, through the paired plugin) decides WHAT; this file only carries it out in Studio. build_game
 * imports the listed parts and nothing else (never a dependency the design did not list), puts each added region on open ground,
 * deletes what the design removes, fixes the listed texts, sets the lighting and makes sure there is a spawn. What needs a model's
 * hands (a config module's names and prices, code edits, themed models, texts inside scripts) comes back as a checklist. The design
 * is kept between the two calls, so the model never has to carry sixty kilobytes of it back.
 */

/* ---------------------------------------------------------------------------------------------- the design --- */

export interface Part { gameId: string; path: string; mode: 'self' | 'children'; parent: string; what: string; apply?: boolean; onlyMissing?: boolean }
export interface Region extends Part { role: string; offset?: Vec3; why: string }
export interface Fix { path: string; now: string; to: string }
export interface Edit { path: string; what: string; feature?: string }
export interface Table { path: string; what: string; format: string; sample: string; howToAdd: string; entries?: number; was?: number }
export interface ModelPick { gameId: string; path: string; category: string; name: string; fits: string }
export interface LeftOut { feature: string; why: string; edits: Edit[] }
export interface Currency { name: string; was: string; shownAs: string; places: string[]; how: string }
/** A feature the core lacks that the model writes: what to write, which remote calls the kept screens make, what it pays in and keeps data in. */
export interface Task { feature: string; how: string; calls: string[]; pays: string; data: string; like: string[] }
type Values = Record<string, number | boolean | number[]>;
export interface Look { mood: string; look: string; colours: string[]; nameIdeas: string[]; lighting?: { properties: Values; atmosphere: Values; sky: string } }
export interface Design {
  title: string; genre: string; pitch: string; theme: string; look: Look; loop: string[]; progression: string[];
  /** runs: how well the core's code works as saved (3: its loop runs). */
  core: { gameId: string; name: string; why: string; runs?: number };
  imports: Part[]; cleanup: string[]; leaveOut: LeftOut[]; keeps: string[];
  add: Region[];
  screensKeep: string[]; remove: { path: string; why: string }[]; hide: { path: string; why: string }[]; fixTexts: Fix[]; branding: Fix[];
  tables: Table[]; models: ModelPick[]; currency: Currency; lockstep: string[]; registryNote: string;
  /** Content chosen from the core's own (the creatures that fit the twist), and the exact code edits that make it so. */
  chosen?: { keep: string[]; left: number; why: string }; patches: Patch[];
  /** A service's own attributes, which an import of its children does not carry and scripts read (Workspace's DataKey names every save). `title`: the ones that hold the game's name. */
  serviceAttributes: { path: string; attributes: Record<string, string | number | boolean>; title: string[] }[];
  keepEdits: Edit[]; themeNotes: string[]; write: Task[]; warnings: string[]; unreadable: number;
  studioNotes: string[]; walkthrough: string[]; checklist: string[];
}
export interface Patch { path: string; edits: ScriptEdit[]; why: string }
interface Stored { design: Design; request: string; seed: number; at: number; /** The id plan_game returned: build_game and judge_game pass it back, so a plan is used only by a call that names it. */ planId?: string }
/** A plan older than this is another conversation's: build_game asks for a fresh one. */
const PLAN_LIFETIME_MS = 3 * 60 * 60_000;

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** One line of plain text: control characters and runs of spaces gone. */
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
/** A list of lines from a string, a list of strings, or a list of small objects: the text fields of an object are joined. */
function lines(v: unknown, max: number, count: number): string[] {
  const items = typeof v === 'string' ? [v] : arr(v);
  return items.map((x) => typeof x === 'string' ? clean(x, max) : clean(Object.values(rec(x)).filter((y) => typeof y === 'string').join(' - '), max)).filter(Boolean).slice(0, count);
}
/** A list of paths from strings or from objects that carry a `path`. */
const paths = (v: unknown, count: number): string[] => arr(v).map((x) => clean(typeof x === 'string' ? x : rec(x).path, 400)).filter(Boolean).slice(0, count);
function vec3(v: unknown): Vec3 | undefined {
  const o = Array.isArray(v) ? v : [rec(v).x, rec(v).y, rec(v).z];
  if (o.length !== 3) return undefined;
  const n = o.map((k) => (typeof k === 'number' ? k : NaN));
  return n.every((k) => Number.isFinite(k) && Math.abs(k) <= 20_000) ? [n[0]!, n[1]!, n[2]!] : undefined;
}
/** Numbers, booleans and colours ([r, g, b]) as they are; anything else is dropped. */
function values(v: unknown): Values {
  const out: Values = {};
  for (const [k, x] of Object.entries(rec(v))) {
    if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
    else if (typeof x === 'boolean') out[k] = x;
    else if (Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === 'number' && Number.isFinite(n))) out[k] = x as number[];
  }
  return out;
}

const REGION_SUFFIX = /@(?:box|except)\([^)]*\)$/;
/** A library path without its region suffix (@box(...) or @except(...)). */
export const basePath = (path: string): string => path.replace(REGION_SUFFIX, '');
const LIBRARY_PATH = /^\/[^\x00-\x1f\x7f]{0,1023}$/;
const SERVICE_PARENT = /^game\.[\x20-\x7e]{1,300}$/;
const SERVICES = new Set(['Workspace', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerStorage', 'ServerScriptService', 'SoundService', 'Teams', 'StarterPack', 'StarterGui', 'StarterPlayer', 'MaterialService']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A Studio path the way the plugin writes it: a name that is not an identifier is ["name"]. */
export const studioPath = (from: string, names: readonly string[]): string =>
  names.reduce((p, n) => (IDENT.test(n) ? `${p}.${n}` : `${p}["${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`), from);
/** The names in a library path: a "/" inside a name is written %2F, a comma %2C and a ")" %29. */
const segments = (path: string): string[] => path.split('/').filter(Boolean).map((n) => n.replace(/%2F/gi, '/').replace(/%2C/gi, ',').replace(/%29/gi, ')'));
const bare = (name: string): string => name.replace(/#\d+$/, '');

function readPart(raw: unknown, fallbackGame: string): Part | undefined {
  const r = rec(raw);
  const gameId = typeof r.gameId === 'string' ? r.gameId : fallbackGame;
  const path = typeof r.path === 'string' ? r.path : '';
  if (!GAME_ID.test(gameId) || !LIBRARY_PATH.test(path)) return undefined;
  const mode = r.mode === 'self' ? 'self' : r.mode === 'children' ? 'children' : REGION_SUFFIX.test(path) ? 'children' : 'self';
  const parent = typeof r.parent === 'string' && SERVICE_PARENT.test(r.parent) ? r.parent : libraryDefaultParent(basePath(path), mode);
  return {
    gameId, path, mode, parent, what: clean(r.what ?? r.why, 200),
    ...(typeof r.applyServiceProperties === 'boolean' ? { apply: r.applyServiceProperties } : {}), ...(typeof r.onlyMissing === 'boolean' ? { onlyMissing: r.onlyMissing } : {}),
  };
}
/** A text to change. An empty `to` is allowed: it blanks a text that has no place in the new game. */
const readFix = (raw: unknown): Fix | undefined => {
  const r = rec(raw);
  const path = clean(r.path, 400);
  return path && typeof r.to === 'string' ? { path, now: clean(r.now, 160), to: clean(r.to, 160) } : undefined;
};
/** A feature to write: the remote calls the kept screens make, what it pays in, where the data lives and which saved games do something like it. */
function readTask(raw: unknown): Task | undefined {
  const r = rec(raw), uses = rec(r.uses);
  const feature = clean(r.feature, 100);
  if (!feature) return undefined;
  return {
    feature, how: clean(r.how, 500), calls: arr(r.remotes).map((x) => clean(x, 60)).filter(Boolean).slice(0, 40), pays: clean(uses.currency, 60), data: clean(uses.data, 300),
    like: arr(r.reference).slice(0, 3).map((x) => clean(`${rec(x).game || ''} ${rec(x).feature || ''} ${arr(rec(x).read).filter((p) => typeof p === 'string').slice(0, 3).join(', ')}`, 260)).filter(Boolean),
  };
}
const MAX = { imports: 60, add: 8, cleanup: 160, remove: 60, hide: 60, fixes: 80, branding: 40, tables: 40, models: 40, leaveOut: 40 };

/** The library's design, kept to what can be carried out. Anything unreadable is dropped; a design with no core or no import is refused. */
export function readDesign(raw: Record<string, unknown>): Design | { error: string } {
  const core = rec(raw.core);
  const coreId = typeof core.gameId === 'string' ? core.gameId : '';
  if (!GAME_ID.test(coreId)) return { error: 'The plan for this game came back without a working game to build on.' };
  const listed = arr(raw.import ?? raw.imports).slice(0, MAX.imports);
  const imports = listed.map((p) => readPart(p, coreId)).filter((p): p is Part => !!p);
  if (!imports.length) return { error: 'The plan for this game came back with nothing to bring in.' };
  const world = rec(raw.world), screens = rec(raw.screens), content = rec(raw.content);
  const add: Region[] = [];
  for (const a of arr(world.add).slice(0, MAX.add)) {
    const p = readPart(a, coreId);
    if (p) add.push({ ...p, role: clean(rec(a).role, 40) || 'decoration', offset: vec3(rec(a).offset), why: clean(rec(a).why, 200) });
  }
  const theme = typeof raw.theme === 'string' ? { name: raw.theme } : rec(raw.theme);
  const light = rec(theme.lighting);
  const money = typeof content.currency === 'string' ? { name: content.currency } : rec(content.currency);
  return {
    title: clean(raw.title, 60) || 'Your new game', genre: clean(raw.genre, 60), pitch: clean(raw.pitch, 700), theme: clean(theme.name, 100),
    look: {
      mood: clean(theme.mood, 100), look: clean(theme.look, 60), colours: lines(theme.colours, 30, 8), nameIdeas: lines(theme.nameIdeas, 40, 16),
      ...(light.properties || light.atmosphere ? { lighting: { properties: values(light.properties), atmosphere: values(light.atmosphere), sky: clean(light.sky, 120) } } : {}),
    },
    loop: lines(raw.loop, 220, 8), progression: lines(raw.progression, 220, 8),
    core: { gameId: coreId, name: clean(core.name, 80), why: clean(core.why, 300), ...(Number.isFinite(Number(core.runs)) ? { runs: Number(core.runs) } : {}) },
    imports, cleanup: paths(raw.cleanup, MAX.cleanup),
    leaveOut: arr(raw.leaveOut).slice(0, MAX.leaveOut).map((x): LeftOut => {
      const r = rec(x);
      const edits = arr(r.edits).map((e): Edit => typeof e === 'string' ? { path: '', what: clean(e, 300) } : { path: clean(rec(e).path, 400), what: clean(rec(e).what ?? rec(e).change, 300) }).filter((e) => e.what);
      return { feature: clean(r.feature, 100), why: clean(r.why, 200), edits: edits.slice(0, 12) };
    }).filter((x) => x.feature),
    keeps: arr(rec(raw.features).keep).map((f) => clean(typeof f === 'string' ? f : rec(f).name, 90)).filter(Boolean).slice(0, 20),
    add,
    screensKeep: paths(screens.keep, 80),
    remove: arr(screens.remove).slice(0, MAX.remove).map((x) => ({ path: clean(rec(x).path, 400), why: clean(rec(x).why, 200) })).filter((x) => x.path),
    hide: arr(screens.hide).slice(0, MAX.hide).map((x) => ({ path: clean(rec(x).path, 400), why: clean(rec(x).why, 200) })).filter((x) => x.path),
    fixTexts: arr(screens.fixTexts).slice(0, MAX.fixes).map(readFix).filter((f): f is Fix => !!f),
    branding: arr(raw.branding).slice(0, MAX.branding).map(readFix).filter((f): f is Fix => !!f),
    tables: arr(content.tables).slice(0, MAX.tables).map((x): Table => {
      const r = rec(x);
      const entries = Number(r.entries), was = Number(r.was);
      return {
        path: clean(r.path, 400), what: clean(r.what, 200), format: clean(r.format, 320), sample: clean(r.sample, 200), howToAdd: clean(r.howToAdd, 440),
        ...(Number.isFinite(entries) && entries > 0 ? { entries: Math.floor(entries) } : {}), ...(Number.isFinite(was) && was > 0 ? { was: Math.floor(was) } : {}),
      };
    }).filter((t) => t.path),
    models: arr(content.models).slice(0, MAX.models).map((x): ModelPick => ({ gameId: clean(rec(x).gameId, 64), path: clean(rec(x).path, 400), category: clean(rec(x).category, 60), name: clean(rec(x).name, 80), fits: clean(rec(x).fits, 200) }))
      .filter((m) => GAME_ID.test(m.gameId) && LIBRARY_PATH.test(m.path)),
    currency: { name: clean(money.name, 60), was: clean(money.was, 60), shownAs: clean(money.shownAs, 200), places: paths(money.places, 12), how: clean(money.how, 260) },
    lockstep: lines(content.lockstep, 200, 8), registryNote: clean(content.registryNote, 240),
    ...(rec(content.chosen).why ? { chosen: { keep: lines(rec(content.chosen).keep, 60, 40), left: Number(rec(content.chosen).left) || 0, why: clean(rec(content.chosen).why, 200) } } : {}),
    serviceAttributes: arr(raw.serviceAttributes).slice(0, 12).map((x) => {
      const attributes: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(rec(rec(x).attributes)).slice(0, 60)) {
        if (/^[A-Za-z_][\w]{0,99}$/.test(k) && (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')) attributes[k] = typeof v === 'string' ? v.slice(0, 400) : v;
      }
      return { path: clean(rec(x).path, 100), attributes, title: arr(rec(x).title).filter((t): t is string => typeof t === 'string').slice(0, 10) };
    }).filter((x) => /^\/[A-Za-z]+$/.test(x.path) && Object.keys(x.attributes).length),
    patches: arr(content.patches).slice(0, 10).map((x): Patch => ({
      path: clean(rec(x).path, 400), why: clean(rec(x).why, 200),
      // not `clean`: an edit's text is code, its line breaks and tabs are part of it
      edits: arr(rec(x).edits).slice(0, 60).map((e) => ({ find: String(rec(e).find ?? '').slice(0, 2000), replace: String(rec(e).replace ?? '').slice(0, 6000), ...(rec(e).all === true ? { all: true } : {}) }))
        .filter((e) => e.find),
    })).filter((x) => x.path && x.edits.length),
    keepEdits: arr(raw.keepEdits).map((e): Edit => ({ path: clean(rec(e).path, 400), what: clean(typeof e === 'string' ? e : rec(e).change ?? rec(e).what, 300), feature: clean(rec(e).feature, 60) })).filter((e) => e.what).slice(0, 8),
    themeNotes: lines(raw.themeNotes, 300, 8),
    write: arr(raw.write).slice(0, 4).map(readTask).filter((t): t is Task => !!t), warnings: lines(raw.warnings, 300, 6), unreadable: listed.length - imports.length,
    studioNotes: lines(raw.studioNotes, 300, 20), walkthrough: lines(raw.walkthrough, 300, 20), checklist: lines(raw.checklist, 340, 24),
  };
}

/* ------------------------------------------------------------------------------------------ paths mapping --- */

/**
 * Where a library path stands in the open place. The import that brought it in says: a children import puts what is inside the
 * path straight into its parent, a self import puts the instance itself there. A path of the place itself (game.…) is kept.
 */
export function toStudio(imports: readonly Pick<Part, 'path' | 'mode' | 'parent'>[], path: string): string | undefined {
  if (/^game(?:[.[]|$)/.test(path)) return path;
  if (!path.startsWith('/')) return undefined;
  const want = segments(basePath(path));
  let best: { part: Pick<Part, 'path' | 'mode' | 'parent'>; have: string[] } | undefined;
  for (const part of imports) {
    const have = segments(basePath(part.path));
    if (have.length <= want.length && have.every((s, i) => s === want[i]) && (!best || have.length > best.have.length)) best = { part, have };
  }
  if (best) {
    const rest = want.slice(best.have.length).map(bare);
    return studioPath(best.part.parent, best.part.mode === 'self' ? [bare(best.have[best.have.length - 1] ?? ''), ...rest].filter(Boolean) : rest);
  }
  const at = want.findIndex((s) => SERVICES.has(s));
  return at < 0 ? undefined : studioPath('game', want.slice(at).map(bare));
}
/** A service on its own is never something to delete or rewrite. */
const isService = (studio: string): boolean => /^game(?:\.\w+)?$/.test(studio);
const lastPart = (studio: string): string => /\["((?:[^"\\]|\\.)*)"\]$/.exec(studio)?.[1]?.replace(/\\(.)/g, '$1') ?? studio.split('.').pop() ?? '';
const serviceOf = (studio: string): string => /^game\.\w+/.exec(studio)?.[0] ?? 'game.StarterGui';
const within = (path: string, ancestor: string): boolean => path === ancestor || path.startsWith(ancestor + '.') || path.startsWith(ancestor + '[');

/* ------------------------------------------------------------------------------------- keeping the design --- */

const memory = new Map<string, Stored>();
/**
 * A plan belongs to the project it was made in (the session's own storage), and to the call that names its id. The shared
 * in-memory fallback keyed '-' (every project without an id shared one slot) is gone: without a project there is no place to keep
 * a plan, and plan_game says so.
 */
async function keepPlan(ctx: AgentCtx, stored: Stored): Promise<boolean> {
  if (ctx.plannedGame) { await ctx.plannedGame.save(stored).catch(() => undefined); return true; }
  if (!ctx.projectId) return false;
  memory.set(ctx.projectId, stored);
  if (memory.size > 8) memory.delete(memory.keys().next().value!);
  return true;
}
/** The plan is spent when its game is built: a later call cannot rebuild from it. */
async function clearPlan(ctx: AgentCtx): Promise<void> {
  if (ctx.plannedGame?.clear) await ctx.plannedGame.clear().catch(() => undefined);
  if (ctx.projectId) memory.delete(ctx.projectId);
}
/** The kept plan, only for the call that names its id (planId); a plan nobody names is nobody's. */
async function recallPlan(ctx: AgentCtx, planId?: unknown): Promise<Stored | undefined> {
  if (typeof planId !== 'string' || !planId) return undefined;
  const saved = ctx.plannedGame ? await ctx.plannedGame.load().catch(() => undefined) : ctx.projectId ? memory.get(ctx.projectId) : undefined;
  if (rec(saved).planId !== planId) return undefined;
  const r = rec(saved), design = rec(r.design);
  const fresh = typeof r.at === 'number' && Date.now() - r.at < PLAN_LIFETIME_MS;
  if (!fresh || !GAME_ID.test(String(rec(design.core).gameId ?? '')) || !Array.isArray(design.imports)) return undefined;
  // A plan kept by an earlier version of this file lacks the newer lists.
  return { ...r, design: { keepEdits: [], themeNotes: [], unreadable: 0, hide: [], patches: [], serviceAttributes: [], ...design, write: arr(design.write).filter((w) => w && typeof w === 'object') } } as unknown as Stored;
}

/**
 * The first steps of the game's loop, when the game was built from a library core whose loop runs as saved: what a player does to earn.
 * The judge's quick test cannot plant, aim or wait out a wave; this is what it says a player should try instead of calling the loop missing.
 */
export async function plannedLoop(ctx: AgentCtx, planId?: unknown): Promise<string[] | undefined> {
  const stored = await recallPlan(ctx, planId);
  const d = stored?.design;
  return d && (d.core.runs ?? 0) >= 3 && d.walkthrough.length ? d.walkthrough.slice(0, 4) : undefined;
}

/** What the model may change after reading the plan: the title, the theme, the pitch and the currency name. A new title or currency goes into every text that carried the old one. */
export function withNames(design: Design, over: Record<string, unknown>): Design {
  const next: Design = JSON.parse(JSON.stringify(design));
  const swaps: [string, string][] = [];
  const title = clean(over.title, 60), currency = clean(typeof over.currency === 'string' ? over.currency : rec(over.currency).name, 60);
  if (title && title !== next.title) { swaps.push([next.title, title]); next.title = title; }
  if (currency && currency !== next.currency.name) { if (next.currency.name) swaps.push([next.currency.name, currency]); next.currency.name = currency; }
  const theme = clean(over.theme, 100), pitch = clean(over.pitch, 700);
  if (theme) next.theme = theme;
  if (pitch) next.pitch = pitch;
  const swap = (t: string) => swaps.reduce((s, [from, to]) => (from.length >= 3 ? s.split(from).join(to) : s), t);
  for (const f of [...next.fixTexts, ...next.branding]) f.to = swap(f.to);
  next.pitch = swap(next.pitch); next.walkthrough = next.walkthrough.map(swap); next.checklist = next.checklist.map(swap);
  return next;
}

/* --------------------------------------------------------------------------------------------- plan_game --- */

const ROUTE_TIMEOUT_MS = 60_000;
/** The plugin takes plain text up to 200 characters per value; a longer request is cut at a word. */
function shortText(v: unknown, max = 200): string {
  const t = typeof v === 'string' ? v : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : '';
  const one = t.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  return (cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut).trim();
}
const lastName = (path: string): string => bare(segments(basePath(path)).pop() ?? '');

/** The short digest the model reviews. The paths and the long lists stay with the kept design. */
function digest(design: Design, seed: number) {
  const trim = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  return {
    title: design.title, genre: design.genre, pitch: design.pitch, theme: design.theme, mood: design.look.mood || undefined,
    loop: design.loop.slice(0, 3).map((t) => trim(t, 200)), progression: design.progression.slice(0, 3).map((t) => trim(t, 200)),
    core: { name: design.core.name, why: trim(design.core.why, 240) },
    keeps: design.keeps.slice(0, 10).map((t) => trim(t, 70)),
    leftOut: design.leaveOut.slice(0, 12).map((l) => ({ feature: trim(l.feature, 70), why: trim(l.why, 100) })),
    landmarksAdded: design.add.map((a) => ({ what: a.role, why: trim(a.why, 140) })),
    screensRemoved: design.remove.length, textsFixed: design.fixTexts.length + design.branding.length,
    contentToTheme: design.tables.slice(0, 12).map((t) => `${lastName(t.path) || 'a list'}${t.entries ? ` (${t.entries} entries)` : ''}`),
    currency: design.currency.name ? { name: design.currency.name, was: design.currency.was || undefined } : undefined,
    themedModels: design.models.length, warnings: design.warnings.map((t) => trim(t, 200)), seed,
  };
}
/** What a person reads of a pitch: whole sentences up to `max` characters (else cut at a word), no trailing punctuation. */
function pitchWords(pitch: string, max = 300): string {
  const t = plainText(pitch, 900);
  let out = '';
  for (const s of t.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []) { if ((out + s).length > max) break; out += s; }
  if (!out) { const cut = t.slice(0, max); out = cut.length < t.length && cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut; }
  return sentence(out.trim());
}
/** Left-out features a client can read: no counts, scripts, servers or debug tools, and no phrase that itself holds an "and" (it would read as two things in a list). */
const TECHNICAL = /\d|script|framework|server|client|module|remote|debug|admin|kick|guard|noclip|\bmod\b|\band\b|\//i;
const leftWords = (d: Design, most: number): string[] => d.leaveOut.map((l) => plainText(l.feature.replace(/\s*\([^)]*\)/g, ''), 60)).filter((f) => f && !TECHNICAL.test(f)).slice(0, most);
const planWords = (d: Design): string => {
  const pitch = d.pitch ? pitchWords(d.pitch) : '';
  // A pitch usually opens with the title; then the title is not said twice.
  const out = [pitch && norm(pitch).startsWith(norm(plainText(d.title, 60))) ? `Here is the plan. ${pitch}.` : `The plan is ${d.title}${pitch ? `: ${pitch}` : ''}.`];
  const left = leftWords(d, 5);
  if (left.length) out.push(`Left out on purpose because they do not belong in it: ${list(left, 5)}.`);
  return out.join(' ');
};

export async function planGame(ctx: AgentCtx, a: Record<string, unknown>) {
  const blocked = libraryReady(ctx);
  if (blocked) return { error: plainProblem(blocked) + ' ' + blocked };
  // The user's own words carry the theme and the twist ("but the brainrots are fruit"); the model's retelling can lose them. A short reply
  // ("yes, do it") says nothing about the game, so then the model's words stand.
  const own = ctx.userRequest?.()?.trim() ?? '';
  const words = own.split(/\s+/).filter(Boolean).length >= 4 ? own : '';
  const request = shortText(words || a.request);
  if (!request) return { error: 'request is required: what the user asked for, in their own words.' };
  const theme = shortText(a.theme, 100), features = shortText(a.features);
  const seed = a.seed !== undefined && a.seed !== '' && Number.isFinite(Number(a.seed)) ? Math.abs(Math.floor(Number(a.seed))) % 1_000_000 : Math.floor(Math.random() * 1_000_000);
  const out = await ctx.execStudioOp({ op: 'query_owner_library', action: 'route', route: 'design', params: { request, ...(theme ? { theme } : {}), ...(features ? { features } : {}), seed } }, ROUTE_TIMEOUT_MS);
  if (!out.ok) return { error: `${plainProblem(out.error)} Tell the user in one plain sentence; nothing was built.`, technical: out.error };
  const design = readDesign(rec(out.data));
  if ('error' in design) return { error: `${design.error} Tell the user in one plain sentence that the library has nothing for that kind of game yet; nothing was built.` };
  // The library takes the first 200 characters; the judge is given the user's whole request.
  const planId = crypto.randomUUID().slice(0, 8);
  if (!(await keepPlan(ctx, { design, request: clean(words || a.request, 1000) || request, seed, at: Date.now(), planId }))) return { error: 'There is no project to keep the plan in, so nothing was planned.' };
  return {
    planned: true, planId, plan: digest(design, seed), forUser: planWords(design),
    note: 'The full plan is saved. Read the digest: the title, theme, pitch and currency name are yours to change (pass them as design {title, theme, currency} to build_game); the parts, screens and texts are fixed. Then call build_game. Name no tools, paths, counts or ids to the user.',
  };
}

/* -------------------------------------------------------------------------------------------- build_game --- */

async function bringIn(ctx: AgentCtx, part: Part, apply: boolean, replace: boolean) {
  const onlyMissing = part.onlyMissing ?? !replace;
  let out = await libraryImportRaw(ctx, part.gameId, part.path, part.mode, part.parent, apply, replace, onlyMissing);
  if (!out.ok && out.failure !== 'transport' && await libraryFolders(ctx, part.parent)) out = await libraryImportRaw(ctx, part.gameId, part.path, part.mode, part.parent, apply, replace, onlyMissing);
  return out;
}
const insertedOf = (data: unknown): string[] => (Array.isArray(rec(data).inserted) ? (rec(data).inserted as unknown[]).filter((p): p is string => typeof p === 'string') : []);
const wireValue = (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) && 't' in (v as object) ? (v as { v: unknown }).v : v);
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
const SCRIPT_CLASS = /^(?:Script|LocalScript|ModuleScript)$/;
/** Whether a path is there, what it is, and the Text it shows (when it shows any). */
async function inspect(ctx: AgentCtx, path: string): Promise<{ exists: boolean; cls?: string; text?: string; gone?: boolean }> {
  const r = await ask(ctx, { op: 'get_instance', path }, 20_000);
  if (!r.ok) return { exists: false, gone: r.failure === 'transport' };
  const t = wireValue(rec(r.data.props).Text);
  return { exists: true, cls: typeof r.data.class === 'string' ? r.data.class : undefined, ...(typeof t === 'string' ? { text: t } : {}) };
}

/** Delete each library path that is in the place. A path that is not there was never imported, or an earlier build removed it: that is removed too. */
async function removePaths(ctx: AgentCtx, targets: readonly string[], imports: readonly Part[], keep: readonly string[] = []) {
  const removed: string[] = [], stayed: string[] = [];
  let gone = false;
  for (const path of targets) {
    if (gone) { stayed.push(path); continue; }
    const studio = toStudio(imports, path);
    // A path that is, or holds, something the design keeps is never deleted.
    if (!studio || isService(studio) || keep.some((k) => within(k, studio))) { stayed.push(path); continue; }
    const del = await ask(ctx, { op: 'delete_instances', paths: [studio] }, 30_000);
    if (del.ok || del.failure === 'not_found') removed.push(path);
    else { stayed.push(path); if (del.failure === 'transport') gone = true; }
  }
  return { removed, stayed, gone };
}

/**
 * The design's exact code edits (which of the core's creatures spawn, what a rebirth asks for). Each script is read, edited in memory the
 * way the plugin would, checked to still parse, and written whole against the hash of what was read, so nothing half-applies.
 */
async function applyPatches(ctx: AgentCtx, patches: readonly Patch[], imports: readonly Part[]) {
  let applied = 0, gone = false;
  const failed: { path: string; why: string }[] = [];
  for (const p of patches) {
    const studio = toStudio(imports, p.path);
    if (!studio) { failed.push({ path: p.path, why: 'not in the place' }); continue; }
    const read = await ask(ctx, { op: 'read_script', path: studio }, 20_000);
    if (!read.ok) { if (read.failure === 'transport') { gone = true; break; } failed.push({ path: studio, why: read.error ?? 'could not be read' }); continue; }
    const before = String(read.data.source ?? '');
    const edited = applyEdits(before, p.edits);
    if (!edited.ok) { failed.push({ path: studio, why: edited.error }); continue; }
    if (checkSyntax(edited.source).length) { failed.push({ path: studio, why: 'the edited script would not parse' }); continue; }
    const wrote = await ask(ctx, { op: 'edit_script', path: studio, source: edited.source, baseHash: sourceHash(before) }, 30_000);
    if (wrote.ok) applied += 1;
    else if (wrote.failure === 'transport') { gone = true; break; }
    else failed.push({ path: studio, why: wrote.error ?? 'Studio refused the edit' });
  }
  return { applied, failed, gone };
}

const LAYER = /^(ScreenGui|BillboardGui|SurfaceGui)$/;
/** Hide each library path that is in the place: a screen is switched off, a frame or button made invisible. Nothing is deleted, so code that names it runs on. */
async function hidePaths(ctx: AgentCtx, targets: readonly string[], imports: readonly Part[]) {
  let hidden = 0, gone = false;
  for (const path of targets) {
    const studio = toStudio(imports, path);
    if (!studio || isService(studio)) continue;
    const at = await inspect(ctx, studio);
    if (at.gone) { gone = true; break; }
    if (!at.exists) continue;
    // AppleHidden says it was taken out of sight on purpose, so a check of the game does not count it as something a player sees.
    const set = await ask(ctx, { op: 'set_props', path: studio, props: LAYER.test(at.cls ?? '') ? { Enabled: { t: 'bool', v: false } } : { Visible: { t: 'bool', v: false } }, attributes: { AppleHidden: { t: 'bool', v: true } } }, 20_000);
    if (set.ok) hidden += 1;
    else if (set.failure === 'transport') { gone = true; break; }
  }
  return { hidden, gone };
}

interface Unfixed { path: string; now: string; to: string; inScripts?: string[] }
interface FixResult { fixed: number; left: Unfixed[]; gone?: boolean }
/** A text longer than this may be replaced inside a longer one; a short one ("...", "0", "Shop") only when it is the whole text. */
const PARTIAL_MIN = 6;
/**
 * Replace each listed text in the screens, Text only. The path says where it should be; when it does not lead to a label that still
 * shows the old text, the labels under the same screen (or service) that show exactly that text are changed instead. A text that
 * lives in a script cannot be changed from here: it comes back with the script that holds it, for the model to edit.
 */
async function fixTexts(ctx: AgentCtx, fixes: readonly Fix[], imports: readonly Part[]): Promise<FixResult> {
  const result: FixResult = { fixed: 0, left: [] };
  const setText = async (path: string, text: string) => {
    const set = await ask(ctx, { op: 'set_props', path, props: { Text: { t: 'string', v: text } } }, 20_000);
    if (!set.ok && set.failure === 'transport') result.gone = true;
    return set.ok;
  };
  const replaced = (fix: Fix, text: string): string | undefined => {
    if (!fix.now || norm(text) === norm(fix.now)) return fix.to;
    if (fix.now.length < PARTIAL_MIN || !text.toLowerCase().includes(fix.now.toLowerCase())) return undefined;
    return text.replace(new RegExp(fix.now.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), () => fix.to);
  };
  for (const fix of fixes) {
    if (result.gone) break;
    const studio = toStudio(imports, fix.path);
    const at: Awaited<ReturnType<typeof inspect>> = studio && !isService(studio) ? await inspect(ctx, studio) : { exists: false };
    if (at.gone) { result.gone = true; break; }
    let done = false;
    // `there`: the old text was seen on a label. `unsure`: a search stopped before it had looked everywhere.
    let there = false, unsure = false;
    if (at.text !== undefined) {
      const next = replaced(fix, at.text);
      if (next !== undefined) { there = true; done = await setText(studio!, next); }
      else if (norm(at.text) === norm(fix.to)) done = true;   // an earlier build already changed it
    }
    const isScript = !!at.cls && SCRIPT_CLASS.test(at.cls);
    if (!done && !isScript && fix.now.length >= 2) {
      const roots = [...new Set([...(at.exists && at.text === undefined ? [studio!] : []), studio ? serviceOf(studio) : 'game.StarterGui'])];
      for (const root of roots) {
        for (const op of fix.now.length >= PARTIAL_MIN ? ['eq', 'contains'] as const : ['eq'] as const) {
          const found = await ask(ctx, { op: 'query_instances', root, property: { name: 'Text', op, value: fix.now }, limit: 12 }, 30_000);
          if (!found.ok) { if (found.failure === 'transport') { result.gone = true; break; } unsure = true; continue; }
          if (found.data.truncated) unsure = true;
          for (const m of arr(found.data.matches)) {
            const p = rec(m).path;
            if (typeof p !== 'string') continue;
            const seen = await inspect(ctx, p);
            const next = seen.text === undefined ? undefined : replaced(fix, seen.text);
            if (next !== undefined) { there = true; if (await setText(p, next)) done = true; }
          }
          if (done || result.gone) break;
        }
        if (done || result.gone) break;
      }
    }
    if (result.gone) break;
    if (done) { result.fixed += 1; continue; }
    const scripts: string[] = isScript && studio ? [studio] : [];
    // A short text ("...", "0", "Shop") is in every script; only one long enough to be specific points at a script.
    if (!scripts.length && fix.now.length >= PARTIAL_MIN) {
      const hits = await ask(ctx, { op: 'search_scripts', query: fix.now.slice(0, 100), maxResults: 4 }, 30_000);
      if (hits.ok) for (const m of arr(hits.data.matches)) { const p = rec(m).path; if (typeof p === 'string' && !scripts.includes(p)) scripts.push(p); }
    }
    // A text that is on no label and in no script is not there to change (its screen was left out); it is not the model's work.
    if (!there && !unsure && !scripts.length) continue;
    result.left.push({ path: fix.path, now: fix.now, to: fix.to, ...(scripts.length ? { inScripts: scripts } : {}) });
  }
  return result;
}

const LIGHTING_PROPS = new Set(['Brightness', 'ExposureCompensation', 'Ambient', 'OutdoorAmbient', 'ColorShift_Top', 'ColorShift_Bottom', 'ClockTime', 'GeographicLatitude', 'ShadowSoftness', 'GlobalShadows', 'EnvironmentDiffuseScale', 'EnvironmentSpecularScale']);
const ATMOSPHERE_PROPS = new Set(['Density', 'Offset', 'Color', 'Decay', 'Glare', 'Haze']);
/** Colours in the design are 0-255, like the moods; numbers and booleans go as they are. */
function typed(v: Values, allowed: ReadonlySet<string>): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [k, x] of Object.entries(v)) {
    if (!allowed.has(k)) continue;
    out[k] = typeof x === 'number' ? { t: 'number', v: x } : typeof x === 'boolean' ? { t: 'bool', v: x }
      : { t: 'Color3', v: (x.some((n) => n > 1) ? x.map((n) => n / 255) : x) as [number, number, number] };
  }
  return out;
}
/** The theme's lighting: the Lighting properties, and the place's one Atmosphere (made when there is none). False when Studio refused. */
async function setLighting(ctx: AgentCtx, look: NonNullable<Look['lighting']>): Promise<'set' | 'refused' | 'gone'> {
  const props = typed(look.properties, LIGHTING_PROPS);
  if (Object.keys(props).length) {
    const set = await ask(ctx, { op: 'set_props', path: 'game.Lighting', props }, 30_000);
    if (!set.ok) return set.failure === 'transport' ? 'gone' : 'refused';
  }
  const air = typed(look.atmosphere, ATMOSPHERE_PROPS);
  if (Object.keys(air).length) {
    const tree = await ask(ctx, { op: 'get_tree', root: 'game.Lighting', maxDepth: 1, maxNodes: 200 }, 30_000);
    const kids = tree.ok ? arr(rec(tree.data.root).children).map(rec) : [];
    const existing = kids.find((k) => k.class === 'Atmosphere' && typeof k.path === 'string')?.path as string | undefined;
    const done = existing
      ? await ask(ctx, { op: 'set_props', path: existing, props: air }, 30_000)
      : await ask(ctx, { op: 'create_instances', items: [{ className: 'Atmosphere', name: 'Atmosphere', parent: 'game.Lighting', props: air }] }, 30_000);
    if (!done.ok) return done.failure === 'transport' ? 'gone' : 'refused';
  }
  return 'set';
}

export interface BuildOptions { budgetMs?: number; now?: () => number }

/* ------------------------------------------------------------------------ kept code that names a part left out --- */

/** Names too common to mean one part ("Data", "Main"): a script that mentions them may mean anything. */
const COMMON_NAMES = new Set(['config', 'client', 'server', 'shared', 'models', 'assets', 'remotes', 'events', 'modules', 'folder', 'sounds', 'music', 'utils', 'utility', 'classes', 'controllers', 'services', 'gui', 'guis', 'ui', 'main', 'data', 'datas', 'init', 'test', 'tests', 'temp']);
/** The names of the parts the plan leaves out: what its @except lists cut, its cleanup and the screens it removes. */
function leftOutNames(design: Design): string[] {
  const names = new Set<string>();
  const add = (path: string) => { const n = bare(segments(path).pop() ?? ''); if (n.length >= 5 && !COMMON_NAMES.has(n.toLowerCase())) names.add(n); };
  for (const part of design.imports) {
    const cut = /@except\((.*)\)$/.exec(part.path)?.[1];
    if (cut) for (const n of cut.split(',')) add('/' + n.trim());
  }
  for (const p of design.cleanup) add(p);
  for (const r of design.remove) add(r.path);
  return [...names];
}
export interface Dangling { script: string; line: number; text: string; missing: string }
const REFERENCE_LIMIT = 12;
/**
 * Kept code that still names a part the plan left out. A require or WaitForChild of a module that is not there stops the script on its
 * first lines (the server's start-up hangs, a menu never opens), so each line found is handed to the model to remove or guard. A name
 * that some other part of the place still carries is not missing; a comment is not a reference.
 */
async function danglingReferences(ctx: AgentCtx, design: Design, late: () => boolean): Promise<Dangling[]> {
  const found: Dangling[] = [];
  for (const name of leftOutNames(design)) {
    if (late() || found.length >= REFERENCE_LIMIT) break;
    const hits = await ask(ctx, { op: 'search_scripts', query: name, maxResults: 6 }, 30_000);
    if (!hits.ok) { if (hits.failure === 'transport') break; continue; }
    // The name as a whole token: quoted ("Name", WaitForChild("Name")) or reached by a dot (Folder.Name); a longer name that starts with it is another part.
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const named = new RegExp(`["']${safe}["']|\\.${safe}(?![\\w])`);
    const line = arr(hits.data.matches).map(rec).find((r) => typeof r.path === 'string' && typeof r.text === 'string' && !r.text.trim().startsWith('--') && named.test(r.text));
    if (!line) continue;
    const there = await ask(ctx, { op: 'query_instances', name, limit: 8 }, 20_000);
    if (!there.ok) { if (there.failure === 'transport') break; continue; }
    if (arr(there.data.matches).some((m) => typeof rec(m).path === 'string' && lastPart(rec(m).path as string) === name)) continue;
    found.push({ script: line.path as string, line: Number(line.line) || 0, text: cap((line.text as string).trim(), 160), missing: name });
  }
  return found;
}

/** How much of the checklist one result may carry; the tool result is cut at 24,000 characters and a cut list is worse than a short one. */
const CHECKLIST_CHARS = 18_000;
const cap = (t: string, n: number): string => (t.length > n ? t.slice(0, n - 1) + '…' : t);
/** Halve the lists, least useful first, until the whole fits. */
function fitTo<T extends Record<string, unknown>>(out: T, limit: number): T {
  const o: Record<string, unknown> = { ...out };
  for (const key of ['studioNotes', 'walkthrough', 'checks', 'themedModels', 'keepInMind', 'textsStillToChange', 'moreModules', 'tables', 'brokenReferences', 'codeEdits', 'featuresToWrite']) {
    while (JSON.stringify(o).length > limit && Array.isArray(o[key]) && (o[key] as unknown[]).length > 1) o[key] = (o[key] as unknown[]).slice(0, Math.ceil((o[key] as unknown[]).length / 2));
  }
  return o as T;
}
const DONE_ALREADY = /^(?:Import every entry|Delete the screens|Theme |Set Lighting)/;

/** A feature to write, as the sentences the model reads: what it is, which calls the kept screens make, what it pays in and where the data lives. */
function taskWords(design: Design, w: Task): string {
  const data = w.data ? toStudio(design.imports, w.data) ?? w.data : '';
  return cap([
    `${w.feature}.`, w.how, w.calls.length ? `Answer these calls the kept screens make: ${w.calls.join(', ')}.` : '', w.pays ? `Pay in ${design.currency.name || w.pays}.` : '',
    data ? `Keep the player data where ${data} keeps it.` : '', w.like.length ? `Other saved games do something like it: ${w.like.join('; ')}.` : '',
  ].filter(Boolean).join(' '), 1400);
}

/** What the model does next, as exact work items: the modules to theme, the models to bring, the code to edit, the texts inside scripts. */
async function themeTheContent(ctx: AgentCtx, design: Design, request: string, left: Unfixed[], lighting: string, dangling: readonly Dangling[]) {
  const tables: Record<string, unknown>[] = [];
  const shown = design.tables.slice(0, 12);
  for (const t of shown) {
    const studio = toStudio(design.imports, t.path);
    let exists: boolean | undefined, candidates: string[] | undefined;
    if (studio) {
      exists = (await inspect(ctx, studio)).exists;
      if (!exists) {
        const found = await ask(ctx, { op: 'query_instances', name: lastPart(studio), isA: 'LuaSourceContainer', limit: 3 }, 20_000);
        candidates = found.ok ? arr(found.data.matches).map((m) => rec(m).path).filter((p): p is string => typeof p === 'string') : undefined;
      }
    }
    tables.push({
      module: studio ?? t.path, ...(exists === false ? { exists: false, ...(candidates?.length ? { maybeAt: candidates } : {}) } : {}),
      // A module that has more items than the game keeps: the rest go, or they stay as the source game's own names.
      ...(t.what ? { what: cap(t.what, 160) } : {}), ...(t.entries ? { entries: t.entries, ...(t.was && t.was > t.entries ? { has: t.was, cutTo: t.entries } : {}) } : {}),
      format: cap(t.format, 320), sample: cap(t.sample, 200), howToAdd: cap(t.howToAdd, 440),
    });
  }
  const more = design.tables.slice(shown.length).map((t) => toStudio(design.imports, t.path) ?? t.path).slice(0, 12);
  const money = design.currency;
  return fitTo({
    request,
    theme: { name: design.theme, mood: design.look.mood || undefined, look: design.look.look || undefined, colours: design.look.colours, nameIdeas: design.look.nameIdeas.slice(0, 14) },
    tables, ...(more.length ? { moreModules: more } : {}),
    ...(design.lockstep.length ? { lockstep: design.lockstep } : {}), ...(design.registryNote ? { registryNote: design.registryNote } : {}),
    ...(money.name ? { currency: { name: money.name, was: money.was || undefined, shownAs: cap(money.shownAs, 120) || undefined, places: money.places.map((p) => toStudio(design.imports, p) ?? p).slice(0, 8), how: cap(money.how, 200) || undefined } } : {}),
    themedModels: design.models.slice(0, 8).map((m) => ({ category: m.category, name: m.name || undefined, fits: cap(m.fits, 150), import: { gameId: m.gameId, path: m.path, mode: 'self' } })),
    codeEdits: [...design.keepEdits.map((e) => ({ feature: e.feature || 'a feature that stays', file: e.path ? toStudio(design.imports, e.path) ?? e.path : undefined, change: cap(e.what, 300) })),
      ...design.leaveOut.flatMap((l) => l.edits.map((e) => ({ feature: cap(l.feature, 60), file: e.path ? toStudio(design.imports, e.path) ?? e.path : undefined, change: cap(e.what, 300) })))].slice(0, 12),
    ...(design.themeNotes.length ? { keepInMind: design.themeNotes.map((t) => cap(t, 300)) } : {}),
    ...(design.write.length ? { featuresToWrite: design.write.map((w) => taskWords(design, w)) } : {}),
    ...(dangling.length ? { brokenReferences: dangling.map((d) => ({ script: d.script, line: d.line, text: d.text, missing: d.missing })) } : {}),
    ...(left.length ? { textsStillToChange: left.slice(0, 14).map((u) => ({ now: cap(u.now, 80), to: cap(u.to, 80), ...(u.inScripts?.length ? { inScripts: u.inScripts.slice(0, 3) } : { where: cap(u.path, 120) }) })) } : {}),
    ...(design.warnings.length ? { warnings: design.warnings } : {}),
    ...(lighting ? { lighting } : {}),
    studioNotes: design.studioNotes.slice(0, 6).map((t) => cap(t, 200)),
    walkthrough: design.walkthrough.slice(0, 5).map((t) => cap(t, 260)),
    checks: design.checklist.filter((t) => !DONE_ALREADY.test(t)).slice(0, 4).map((t) => cap(t, 200)),
  }, CHECKLIST_CHARS);
}

function buildWords(design: Design, r: {
  failed: string[]; regionsPlaced: number; regionsLeft: number; removed: number; fixed: number; menus: boolean; saves: boolean; timedOut: boolean; disconnected: boolean; light: boolean; spawn: boolean;
  chosen?: number;
}): string {
  const title = plainText(design.title, 60), pitch = design.pitch ? pitchWords(design.pitch) : '';
  // A pitch usually opens with the title; then it is the first sentence and the title is not said twice.
  const out = pitch && norm(pitch).startsWith(norm(title)) ? [`${pitch}.`, 'It is ready in your place.'] : [`${title} is ready in your place.`, ...(pitch ? [`${pitch}.`] : [])];
  const left = leftWords(design, 4);
  if (left.length) out.push(`It was built from a working game of its kind, without ${list(left, 4)}, which do not belong in it.`);
  if (r.regionsPlaced) out.push(`${r.regionsPlaced === 1 ? 'One extra landmark stands' : `${r.regionsPlaced} extra landmarks stand`} beside the play area.`);
  if (r.chosen) out.push(`Only the ${r.chosen} characters that fit ${design.pitch && /where (.+?)\.?$/i.test(design.pitch) ? `"${/where (.+?)\.?$/i.exec(design.pitch)![1]}"` : 'the theme'} appear, the rest never show up.`);
  if (r.removed) out.push('Screens and buttons that did not belong were taken out of sight.');
  if (r.fixed) out.push('Placeholder and leftover texts were replaced with ones that fit.');
  if (r.light) out.push('The sky and lighting were set to fit the theme.');
  if (r.menus) out.push('Screens that came without working code had their buttons connected, so their menus open and close.');
  if (r.spawn) out.push('A spawn pad was added, because the map had none.');
  if (r.failed.length) out.push(`${list(r.failed.map((f) => plainText(f, 80)), 4)} could not be added, so the game is missing ${r.failed.length > 1 ? 'those' : 'that'}.`);
  if (r.regionsLeft) out.push(`${r.regionsLeft === 1 ? 'One extra landmark' : `${r.regionsLeft} extra landmarks`} found no free ground and ${r.regionsLeft === 1 ? 'was' : 'were'} left out.`);
  if (r.disconnected) out.push('Roblox Studio stopped answering part-way, so the rest was not added.');
  else if (r.timedOut) out.push('Apple stopped part-way to keep things quick, so a few extras are missing.');
  if (r.saves) out.push('Progress saving will work once the game is published.');
  return out.join(' ');
}

const NEXT_STEPS = 'The build is in the place. Now: (1) theme the content: for each entry of themeTheContent.tables read the module (read_script), then edit it (edit_script) so every item gets a themed name (theme.nameIdeas) and price in the given format and count (a module that has more items than the count keeps only that many); keep keepInMind true while you do; import the themedModels that fit with import_owner_library; carry out brokenReferences (each line names a part that is not in the game: remove or guard it), codeEdits, featuresToWrite and textsStillToChange with edit_script. ' +
  '(2) Call judge_game {request: themeTheContent.request}. (3) Fix what it lists, in its order, and judge again, at most three rounds in all. ' +
  '(4) Answer the user from forUser in your own friendly words: what the player will see and do. Name no tools, paths, counts or ids. If a script in it can load code from the internet or ask players to pay (see suspicious), say so in one plain sentence.';
/** When the build did everything itself (the content was chosen, the texts fixed, nothing left to write), the model checks and answers. */
const DONE_STEPS = 'The build is in the place and nothing is left to do on it: the content that fits the request was chosen, and the texts, names and code were already changed. ' +
  'Do not rename, re-theme or rewrite anything. Now: (1) Call judge_game {request: themeTheContent.request}. (2) Fix only what it lists, in its order, and judge again, at most three rounds in all. ' +
  '(3) Answer the user from forUser in your own friendly words: what the player will see and do. Name no tools, paths, counts or ids. If a script in it can load code from the internet or ask players to pay (see suspicious), say so in one plain sentence.';
/** Is there anything in the checklist for the model to do before the judge? */
const workLeft = (c: Record<string, unknown>): boolean =>
  ['tables', 'themedModels', 'codeEdits', 'featuresToWrite', 'brokenReferences', 'textsStillToChange'].some((k) => Array.isArray(c[k]) && (c[k] as unknown[]).length > 0);

export async function buildGame(ctx: AgentCtx, a: Record<string, unknown>, opts: BuildOptions = {}) {
  const now = opts.now ?? Date.now;
  const blocked = libraryReady(ctx);
  if (blocked) return { error: plainProblem(blocked) + ' ' + blocked };

  // The design is the one plan_game kept; the model only supplies the names it changed (or, with no kept plan, a whole design).
  const given = rec(a.design);
  const kept = await recallPlan(ctx, a.planId);
  let stored: Stored;
  if (kept) stored = { ...kept, design: withNames(kept.design, given) };
  else {
    const whole = 'core' in given ? readDesign(given) : undefined;
    if (!whole) return { error: 'There is no saved plan under that planId. Call plan_game with the user\'s request first (the same seed gives the same plan again), then build_game with the planId it returned.' };
    if ('error' in whole) return { error: whole.error + ' Call plan_game again.' };
    stored = { design: whole, request: whole.pitch || whole.title, seed: 0, at: Date.now() };
  }
  const { design, request, seed } = stored;

  const copy = await librarySafetyCopy(ctx, 'before building your game from your saved games');
  if ('error' in copy) return noCopy(copy.error);
  const started = now(), deadline = started + (opts.budgetMs ?? ASSEMBLE_BUDGET_MS);
  const late = () => now() > deadline;
  const state = newPlaceState();
  const fromScratch = await workspaceIsFresh(ctx);
  let fresh = fromScratch;
  let disconnected = false, timedOut = false;

  const failed: string[] = [], inserted: string[] = [], suspicious: unknown[] = [], games = new Set<string>();
  let imported = 0, brought = 0;
  const missed = (part: Part) => { failed.push(part.what || 'a part of the game'); };
  // A part the library listed that could not be read is a part missing from the game: it is said, not silently skipped.
  for (let i = 0; i < design.unreadable; i++) failed.push('a part of the game');
  const took = (part: Part, data: unknown): string[] => {
    const got = insertedOf(data), d = rec(data);
    inserted.push(...got);
    brought += 1;
    if (Array.isArray(d.suspicious)) suspicious.push(...d.suspicious);
    if ((Number(d.roots) || 0) > (Number(d.skipped) || 0) || got.length) { imported += 1; games.add(part.gameId); }
    return got;
  };

  // 1. the listed parts, in the design's order. Nothing else comes in: no dependency the design did not list.
  for (const part of design.imports) {
    if (disconnected) break;
    if (late()) { timedOut = true; missed(part); continue; }
    // The core's whole Workspace or Lighting: the service itself, or the copy a save keeps in a container of its own ("/GameModules/Workspace").
    const slot = bare(segments(basePath(part.path)).pop() ?? '');
    const world = part.mode === 'children' && slot === 'Workspace' && part.parent === 'game.Workspace';
    const lighting = part.mode === 'children' && slot === 'Lighting' && part.parent === 'game.Lighting';
    const replace = (world && fresh) || (lighting && fromScratch);
    const out = await bringIn(ctx, part, part.apply ?? (world || lighting), replace);
    // A game without surface looks has nothing to bring: that is not a part missing from the game.
    if (!out.ok && part.parent === 'game.MaterialService' && /path not found/.test(out.error ?? '')) continue;
    if (!out.ok) { missed(part); if (out.failure === 'transport') disconnected = true; continue; }
    if (replace && world) fresh = false;
    took(part, out.data);
  }
  // The services' own attributes: scripts read them (a player's save key, a luck setting), and an import of a service's children does not bring them.
  for (const a of design.serviceAttributes) {
    if (disconnected) break;
    const attributes: Record<string, PropValue> = {};
    for (const [k, v] of Object.entries(a.attributes)) {
      const value = a.title.includes(k) ? design.title : v;
      attributes[k] = typeof value === 'number' ? { t: 'number', v: value } : typeof value === 'boolean' ? { t: 'bool', v: value } : { t: 'string', v: value };
    }
    const set = await ask(ctx, { op: 'set_props', path: 'game.' + a.path.slice(1), attributes }, 20_000);
    if (!set.ok && set.failure === 'transport') disconnected = true;
  }
  // 2. regions from other maps: on the ground beside the play area, never on top of anything, never a second whole map.
  let regionsPlaced = 0, regionsLeft = 0;
  for (const region of design.add) {
    if (disconnected) break;
    if (late()) { timedOut = true; missed(region); continue; }
    const out = await bringIn(ctx, region, false, false);
    if (!out.ok) { missed(region); if (out.failure === 'transport') disconnected = true; continue; }
    const roots = took(region, out.data).filter((p) => /^game\.Workspace(?:[.[]|$)/.test(p));
    if (!roots.length) continue;
    const where = await placeRegion(ctx, roots, region.offset, state, seed, deadline, now);
    if (where === 'disconnected') disconnected = true;
    else if (where === 'no_room') regionsLeft += 1;
    else regionsPlaced += 1;
  }
  // Surface looks (MaterialVariants: without them a studded game's parts draw as the bare base material) of each game that brought
  // something, unless the design imported them itself.
  const hasMaterials = new Set(design.imports.filter((p) => p.parent === 'game.MaterialService').map((p) => p.gameId));
  if (!disconnected) for (const id of games) { if (late()) break; if (!hasMaterials.has(id)) await libraryMaterials(ctx, id); }

  // 3. what the design says goes, goes: leftovers of left-out features, then the screens (and buttons) that do not belong.
  const all: Part[] = [...design.imports, ...design.add];
  const keepStudio = design.screensKeep.map((p) => toStudio(all, p)).filter((p): p is string => !!p);
  const cleaned = disconnected ? { removed: [] as string[], stayed: [] as string[], gone: false } : await removePaths(ctx, design.cleanup, all);
  const screens = disconnected || cleaned.gone ? { removed: [] as string[], stayed: [] as string[], gone: false } : await removePaths(ctx, design.remove.map((r) => r.path), all, keepStudio);
  if (cleaned.gone || screens.gone) disconnected = true;
  // Pieces the game's code still names but a player must not see (a Robux shop's button, a left-out feature's screen) are hidden, not deleted.
  const hid = disconnected ? { hidden: 0, gone: false } : await hidePaths(ctx, design.hide.map((r) => r.path), all);
  if (hid.gone) disconnected = true;

  // 4. texts that do not fit change (Text only); the lighting takes the theme's values.
  const allFixes = [...design.fixTexts, ...design.branding];
  const fixes: FixResult = disconnected ? { fixed: 0, left: allFixes.map((f) => ({ path: f.path, now: f.now, to: f.to })) } : await fixTexts(ctx, allFixes, all);
  if (fixes.gone) disconnected = true;
  // 5. the content the design chose (the creatures that fit the twist) is made so in the code.
  const patched = disconnected || !design.patches.length ? { applied: 0, failed: [] as { path: string; why: string }[], gone: false } : await applyPatches(ctx, design.patches, all);
  if (patched.gone) disconnected = true;
  // The original creator's private sounds would fill every play's Output with red "not authorized" lines: silenced, names kept.
  const quiet = disconnected ? undefined : await ask(ctx, { op: 'run_code', code: SILENCE_LUAU, timeoutMs: 90_000 }, 100_000);
  if (quiet && !quiet.ok && quiet.failure === 'transport') disconnected = true;
  const silenced = quiet?.ok ? parseSilenced(quiet.data) : undefined;
  const lit = disconnected || !design.look.lighting ? undefined : await setLighting(ctx, design.look.lighting);
  if (lit === 'gone') disconnected = true;

  // 6. a spawn, and menus for the screens that came without working code.
  const spawned = disconnected ? false : await ensureSpawn(ctx, state).catch(() => false);
  const removedStudio = new Set(screens.removed.map((p) => toStudio(all, p)));
  const shownScreens = screenRoots(inserted).filter((p) => !removedStudio.has(p));
  const wired = disconnected ? undefined : await connectMenus(ctx, shownScreens.map((path) => ({ path })));
  const menus = (wired?.wired.length ?? 0) > 0;
  const dangling = disconnected ? [] : await danglingReferences(ctx, design, late);

  if (imported === 0 && brought > 0 && !failed.length) return { built: false, changed: false, title: design.title, forUser: `${plainText(design.title, 60)} was already in your game, so nothing changed.`, note: 'Everything in the plan is already in the place. Go on to theming the content and judge_game if that is still owed, otherwise answer the user.' };
  if (imported === 0) return { error: `${disconnected ? plainProblem('disconnected') : 'Apple could not build a game from your saved games this time.'} Tell the user in one plain sentence; nothing was added.`, technical: failed[0] };
  // Scripts that can call out to the internet come in dozens (every plant model carries one): a few say it, the count says how many.
  const flagged = suspicious.slice(0, 8);
  await clearPlan(ctx);
  const checklist = await themeTheContent(ctx, design, request, fixes.left, lit === 'refused' ? 'Studio refused the theme lighting; set the Lighting values by hand.' : '', dangling);
  return {
    built: true, changed: true, title: design.title, genre: design.genre, seed,
    forUser: buildWords(design, { failed, regionsPlaced, regionsLeft, removed: screens.removed.length + hid.hidden, fixed: fixes.fixed, menus, saves: inserted.some((p) => SAVES.test(p)), timedOut, disconnected, light: lit === 'set', spawn: spawned,
      ...(design.chosen && patched.applied ? { chosen: design.chosen.keep.length } : {}) }),
    couldNotAdd: failed,
    ...(screens.stayed.length ? { screensStillThere: screens.stayed.slice(0, 20) } : {}),
    ...(flagged.length ? { suspicious: flagged, ...(suspicious.length > flagged.length ? { suspiciousMore: suspicious.length - flagged.length } : {}) } : {}),
    ...(menus ? { menus: MENUS_CONNECTED } : {}),
    ...(design.chosen && patched.applied ? { contentChosen: `${design.chosen.why}: ${design.chosen.keep.slice(0, 10).join(', ')}${design.chosen.keep.length > 10 ? '…' : ''}. This is done; do not rename or re-register them.` } : {}),
    ...(patched.failed.length ? { editsNotApplied: patched.failed.slice(0, 6) } : {}),
    ...(silenced?.silenced ? { privateSounds: `${silenced.silenced} sounds of the original creator could not load here and were silenced (names kept). This is done; do not change them.` } : {}),
    themeTheContent: checklist,
    seconds: Math.round((now() - started) / 1000),
    note: workLeft(checklist) ? NEXT_STEPS : DONE_STEPS,
  };
}

/* -------------------------------------------------------------------------- the feed's one plain line --- */

const short = (t: string, n = 70) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const errorLine = (r: Record<string, unknown>) => {
  const first = String(r.error ?? '').split(/(?<=[.!?])\s/)[0] ?? '';
  return /Tell the user|library id|request is required|no saved plan|plan_game|hex/i.test(first) ? 'Apple could not do that with your saved games' : sentence(first).slice(0, 120);
};
export function planSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  const r = rec(result);
  if (failed) return `✗ ${errorLine(r)}`;
  return `✓ Planned ${short(clean(rec(r.plan).title, 60) || 'your game', 60)}`;
}
export function buildSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  const r = rec(result);
  if (failed) return `✗ ${errorLine(r)}`;
  const title = short(String(r.title ?? 'your game'), 60);
  return Array.isArray(r.couldNotAdd) && r.couldNotAdd.length ? `✓ Built ${title} from your saved games, with a few parts left out` : `✓ Built ${title} from your saved games`;
}
