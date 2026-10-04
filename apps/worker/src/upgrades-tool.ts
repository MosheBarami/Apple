/**
 * add_upgrades: "add upgrades" done in one call, working (owner, 2026-10-01: the agent took 53 steps, restyled the first
 * screen and finally wiped it). It installs the upgrades component (packages/components/upgrades) on the economy, writes
 * its config, adds the money counter, an Upgrades button and a panel of studded cards to the game's screen without
 * touching what is already on it (studded-ui-tool.ts screenWrites), and brings the animation player up to the version that
 * pays for presses.
 */
import type { AgentCtx } from './tools';
import { COMPONENTS } from './components.generated';
import { luau } from './compose';
import { studdedScreen, type StudPiece } from './stud-ui';
import { readScreen, reusedNote, writeScreen, type TreeNode } from './studded-ui-tool';
import { EDGE_BUTTONS, edgeButtons, nameUsed, reconcilePieces } from './ui-layout';
import { GLYPHS, currencyGlyph, effectIconKey, glyphOf, knownKey } from './ui-icons';
import { installAnimationPlayer } from './animate-tool';
import { findSounds } from './fx-library';

const clip = (s: unknown) => String(s ?? '').slice(0, 300);
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const KINDS = new Set(['perPress', 'perSecond', 'multiplier']);
/** The names the screen's button and panel carry unless the screen already has its own (the client config names whichever is used). */
const DEFAULT_NAMES = { button: 'Upgrades', panel: 'UpgradesPanel' };

export interface UpgradeSpec { id: string; label: string; kind: 'perPress' | 'perSecond' | 'multiplier'; amount: number; cost: number; growth: number; max: number; icon?: string }

/** Each kind's icon (owner, 2026-10-01: "the upgrades gui does not have any icons"), and what one level does. Pure. */
export const KIND_ICON: Record<UpgradeSpec['kind'], string> = { perPress: '\u{1F446}', perSecond: '\u{1F916}', multiplier: '\u2728' };
/**
 * The glyph an upgrade's card shows (phase T, flaw 16: "Pickaxe Power" drew a pointing finger). What the agent gave wins (an icon
 * key becomes its glyph), then what the upgrade's own name says it does (ui-icons.ts effectIconKey), then the icon of its kind.
 */
export function upgradeIcon(u: UpgradeSpec): string {
  if (u.icon) return glyphOf(u.icon);
  const key = effectIconKey(u.label, u.id);
  return key ? GLYPHS[key]! : KIND_ICON[u.kind];
}
export function upgradeBlurb(u: UpgradeSpec, currency: string): string {
  const amount = Number.isInteger(u.amount) ? String(u.amount) : u.amount.toFixed(1);
  if (u.kind === 'perSecond') return `+${amount} ${currency} a second`;
  if (u.kind === 'multiplier') return `x${amount} everything`;
  return `+${amount} per press`;
}

/**
 * The upgrades the agent gave, checked and bounded. They are required: which upgrades suit THIS game (their names, what each
 * does, what it costs) is the agent's design, and the harness holds no first set of its own (it used to hold "Stronger Taps",
 * "Auto Tapper" and "Golden Touch", and every game got them). Pure (tests/upgrades.test.mjs).
 */
export function readUpgrades(raw: unknown): UpgradeSpec[] | { error: string } {
  if (raw === undefined || (Array.isArray(raw) && raw.length === 0)) return { error: 'upgrades is required: list 1 to 9 upgrades for THIS game, each { label, kind perPress|perSecond|multiplier, amount, cost }' };
  if (!Array.isArray(raw) || raw.length > 9) return { error: 'upgrades must list 1 to 9 upgrades' };
  const out: UpgradeSpec[] = [];
  const seen = new Set<string>();
  for (const [i, r] of raw.entries()) {
    const u = (r ?? {}) as Record<string, unknown>;
    const label = String(u.label ?? u.name ?? u.id ?? '').slice(0, 22);
    const id = String(u.id ?? label.replace(/[^A-Za-z0-9]/g, '')).slice(0, 40);
    if (!NAME.test(id) || seen.has(id)) return { error: `upgrades[${i}].id must be a unique plain name` };
    seen.add(id);
    const kind = KINDS.has(String(u.kind)) ? String(u.kind) as UpgradeSpec['kind'] : 'perPress';
    const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    out.push({
      id, label: label || id, kind,
      amount: num(u.amount, kind === 'multiplier' ? 2 : 1, kind === 'multiplier' ? 1.1 : 0.1, 1000),
      cost: Math.round(num(u.cost ?? u.price, 25, 1, 1e12)),
      growth: num(u.growth, 1.5, 1, 10),
      max: Math.round(num(u.max, 100, 1, 10000)),
      ...(typeof u.icon === 'string' && u.icon.trim() ? { icon: knownKey(u.icon) ?? u.icon.trim().slice(0, 4) } : {}),
    });
  }
  return out;
}

async function exists(ctx: AgentCtx, path: string): Promise<boolean> {
  const got = await ctx.execStudioOp({ op: 'get_tree', root: path, maxDepth: 0, maxNodes: 1 }, 20_000).catch(() => null);
  return Boolean(got?.ok);
}

async function writeScript(ctx: AgentCtx, f: { parent: string; name: string; className: 'Script' | 'LocalScript' | 'ModuleScript'; source: string }): Promise<string | null> {
  const path = `game.${f.parent}.${f.name}`;
  await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
  const out = await ctx.execStudioOp({ op: 'edit_script', path, source: f.source, create: { className: f.className, parent: `game.${f.parent}` } }, 60_000);
  return out.ok ? null : clip(out.error);
}

/**
 * The game's screen, pure: the one asked for when it exists (any case), else the screen already there, else the name
 * asked, else GameHUD. A made-up name never starts a second screen over the first (owner's re-test, 2026-10-01: the
 * model passed "hud", a new screen was made, and its money counter sat on top of the keyboard's key counter).
 */
export function pickScreen(asked: unknown, existing: string[]): string {
  const want = typeof asked === 'string' && NAME.test(asked) ? asked : undefined;
  const same = want ? existing.find((n) => n.toLowerCase() === want.toLowerCase()) : undefined;
  return same ?? existing[0] ?? want ?? 'GameHUD';
}

async function screenName(ctx: AgentCtx, asked: unknown): Promise<string> {
  const got = await ctx.execStudioOp({ op: 'get_tree', root: 'game.StarterGui', maxDepth: 1, maxNodes: 60 }, 20_000).catch(() => null);
  const screens = ((got?.ok ? (got.data as { root?: TreeNode }).root?.children : undefined) ?? []).filter((c) => c.class === 'ScreenGui');
  return pickScreen(asked, screens.map((c) => c.name));
}

export async function addUpgrades(ctx: AgentCtx, a: Record<string, unknown>) {
  const upgrades = readUpgrades(a.upgrades);
  if ('error' in upgrades) return { error: upgrades.error };
  const currency = typeof a.currency === 'string' && NAME.test(a.currency) ? a.currency : 'Coins';
  const screen = await screenName(ctx, a.screen);

  // 0. What the screen already holds (phase T, flaw 14: the screen said "Upgrades" three times). An Upgrades button or a counter
  // for this currency that is already there is kept and used, not drawn again; a panel already there keeps its name and gets these
  // cards. The names found go into the config, so the client binds to the pieces that exist.
  const existing = await readScreen(ctx, screen);
  const held = edgeButtons(existing);
  const pieces: StudPiece[] = [
    { kind: 'counter', name: currency, text: '0', icon: currencyGlyph(currency), colour: 'yellow', plus: false, at: 'top-left', caption: currency },
    // Primary actions go on the right edge; when that column is full the left one takes it (ui-layout.ts).
    { kind: 'button', name: DEFAULT_NAMES.button, text: 'Upgrades', icon: '\u2B06', colour: 'green', at: held.right < EDGE_BUTTONS || held.left >= EDGE_BUTTONS ? 'right' : 'left', badge: true },
    { kind: 'panel', name: DEFAULT_NAMES.panel, title: 'Upgrades', header: 'green', body: 'orange', cards: upgrades.map((u) => ({
      name: u.id, label: u.label, price: String(u.cost), priceIcon: currencyGlyph(currency), icon: upgradeIcon(u), blurb: upgradeBlurb(u, currency), level: 'Lv 0',
    })) },
  ];
  const plan = reconcilePieces(pieces, existing, 'existing-wins');
  const names = { counter: nameUsed(plan.reused, currency), button: nameUsed(plan.reused, DEFAULT_NAMES.button), panel: nameUsed(plan.reused, DEFAULT_NAMES.panel) };

  // 1. The money: AppleEconomy in ServerScriptService.AppleComponents.
  if (!(await exists(ctx, 'game.ServerScriptService.AppleComponents'))) {
    const made = await ctx.execStudioOp({ op: 'create_instances', items: [{ className: 'Folder', name: 'AppleComponents', parent: 'game.ServerScriptService' }] }, 30_000);
    if (!made.ok) return { error: `The components folder was not made: ${clip(made.error)}` };
  }
  // The economy keeps its money under the upgrades' currency name when the game has no settings of its own yet.
  if (!(await exists(ctx, 'game.ServerScriptService.AppleComponents.AppleGameConfig'))) {
    // A new player starts with the price of the cheapest upgrade: the first buy comes at once (and a play check can
    // confirm a real purchase; with 0 the re-test's check could only see a refusal).
    const start = Math.min(...upgrades.map((u) => u.cost));
    const settings = `-- Game settings read by StudPilot's components. Written by StudPilot; edit freely.\nreturn ${luau({ economy: { currency, start } })}\n`;
    const failed = await writeScript(ctx, { parent: 'ServerScriptService.AppleComponents', name: 'AppleGameConfig', className: 'ModuleScript', source: settings });
    if (failed) return { error: `The game settings were not written: ${failed}`, changed: true, projectMutated: true };
  }
  for (const f of COMPONENTS.economy!.files) {
    const failed = await writeScript(ctx, f);
    if (failed) return { error: `The economy was not installed: ${failed}`, changed: true, projectMutated: true };
  }

  // 2. The config the server and the screen both read.
  // A till and a little power-up chime when a buy goes through (verified library rows, short ones). A buy that cannot
  // happen shakes its button instead: the library's only "no" sounds are alarm buzzers.
  const sounds = {
    buy: findSounds('cash register', { category: 'purchase', limit: 1, maxSeconds: 1.5 })[0]?.soundId,
    levelUp: findSounds('power up sweeteners', { category: 'power_up', limit: 1, maxSeconds: 1.5 })[0]?.soundId,
  };
  const config = { currency, screen, counter: names.counter, button: names.button, panel: names.panel, perPress: 1, upgrades, sounds };
  const source = `-- The game's upgrades (AppleUpgrades). Written by StudPilot; edit freely: kind = perPress | perSecond | multiplier.\nreturn ${luau(config)}\n`;
  const wrote = await writeScript(ctx, { parent: 'ReplicatedStorage', name: 'AppleUpgradesConfig', className: 'ModuleScript', source });
  if (wrote) return { error: `The upgrades config was not written: ${wrote}`, changed: true, projectMutated: true };

  // 3. The upgrades themselves, and presses that pay (the animation player that announces who pressed).
  for (const f of COMPONENTS.upgrades!.files) {
    const failed = await writeScript(ctx, f);
    if (failed) return { error: `The upgrades were not installed: ${failed}`, changed: true, projectMutated: true };
  }
  if (await exists(ctx, 'game.ServerScriptService.AppleAnimate')) {
    const failed = await installAnimationPlayer(ctx);
    if (failed) return { error: `Presses will not pay: the animation player was not updated: ${failed}`, changed: true, projectMutated: true };
  }

  // 4. The screen: added to what is there, never redrawn.
  const failed = await writeScreen(ctx, studdedScreen({ name: screen, pieces: plan.pieces }), false, { existing, deletes: plan.deletes });
  if (failed) return { error: `The upgrades screen was not added: ${failed}`, changed: true, projectMutated: true };
  const reused = reusedNote(plan.reused.filter((r) => r.kind !== 'panel'));

  return {
    changed: true,
    screen,
    upgrades: upgrades.map((u) => `${u.label} (${u.kind}, ${u.cost} ${currency})`),
    ...(plan.reused.length ? { reused: plan.reused.map((r) => `${r.wanted} -> ${r.have}`) } : {}),
    note: `Done and working: every press pays ${currency}, the ${names.counter} counter, the ${names.button} button and the ${names.panel} panel are on ${screen} (everything already on it is unchanged${reused ? `; ${reused}` : ''}), and the server checks every purchase. Check it once with play_check_ui, then answer; add nothing else.`,
  };
}
